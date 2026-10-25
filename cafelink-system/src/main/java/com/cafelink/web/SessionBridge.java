package com.cafelink.web;

import com.cafelink.client.NetworkClient;
import com.cafelink.client.RemoteException;
import com.cafelink.common.*;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/** One authenticated TCP connection per browser session, shared by its tabs. */
final class SessionBridge implements AutoCloseable {
    private record Flight(String fingerprint, CompletableFuture<JsonObject> result) { }
    final NetworkClient client;
    final String csrf;
    final long createdAt = System.nanoTime();
    volatile long lastAccess = createdAt;
    private final Set<Consumer<String>> listeners = new CopyOnWriteArraySet<>();
    private final ConcurrentMap<String, Flight> flights = new ConcurrentHashMap<>();
    private final Semaphore slots = new Semaphore(16);
    private final AtomicBoolean closed = new AtomicBoolean();
    private int users;
    synchronized void retain() { if(closed.get())throw new IllegalStateException("Session bridge retired");users++; }
    synchronized void release() { users--; }
    synchronized boolean retireIfIdle() {
        if(users!=0||!listeners.isEmpty()||!flights.isEmpty()||closed.get())return false;
        close();return true;
    }

    SessionBridge(NetworkClient client, String csrf) {
        this.client = client; this.csrf = csrf;
        client.onState(state -> broadcast(Json.GSON.toJson(Map.of("type", "STATE", "state", state))));
        client.onDisconnect(ignored -> { if (!closed.get()) broadcast("{\"type\":\"CONNECTION_LOST\"}"); });
    }
    JsonObject identity() {
        var who = client.identity();
        JsonObject result = new JsonObject();
        result.addProperty("username", who.username()); result.addProperty("role", who.role());
        if(who.storeId()!=null)result.addProperty("storeId",who.storeId());
        if (who.tableId() != null) result.addProperty("tableId", who.tableId());
        if (who.membershipId() != null) {
            result.addProperty("membershipId", who.membershipId()); result.addProperty("visitId", who.visitId()); result.addProperty("storeId", who.storeId());
        }
        return result; // Never expose the Core credential to JavaScript.
    }
    JsonObject info() {
        JsonObject result = new JsonObject(); result.add("identity", identity());
        result.addProperty("csrfToken", csrf); result.addProperty("connected", client.connected()); return result;
    }
    JsonObject command(String id, String action, JsonObject payload) throws IOException {
        String fingerprint = Commands.fingerprint(action, payload);
        Flight own = new Flight(fingerprint, new CompletableFuture<>());
        Flight prior = flights.putIfAbsent(id, own);
        if (prior != null) {
            if (!prior.fingerprint().equals(fingerprint)) throw new RemoteException("COMMAND_CONFLICT", "Mã yêu cầu đang dùng cho nội dung khác.");
            try { return prior.result().get(6, TimeUnit.SECONDS); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IOException(e); }
            catch (ExecutionException e) {
                if (e.getCause() instanceof IOException failure) throw failure;
                throw new IOException(e.getCause());
            } catch (TimeoutException e) { throw new IOException("Chưa rõ kết quả yêu cầu.", e); }
        }
        boolean acquired = slots.tryAcquire();
        try {
            if (!acquired) throw new RemoteException("SESSION_BUSY", "Có quá nhiều yêu cầu đang chờ.");
            JsonObject result = client.requestWithId(id, action, payload);
            own.result().complete(result); return result;
        } catch (IOException | RuntimeException failure) { own.result().completeExceptionally(failure); throw failure; }
        finally { flights.remove(id, own); if (acquired) slots.release(); }
    }
    synchronized boolean subscribe(Consumer<String> listener) {
        synchronized (listeners) {
            if (closed.get() || listeners.size() >= 8) return false;
            listeners.add(listener);
        }
        var state = client.latest();
        if (state != null) listener.accept(Json.GSON.toJson(Map.of("type", "STATE", "state", state)));
        if (!client.connected()) listener.accept("{\"type\":\"CONNECTION_LOST\"}");
        return true;
    }
    void unsubscribe(Consumer<String> listener) { listeners.remove(listener); }
    private void broadcast(String message) { for (var listener : listeners) listener.accept(message); }
    @Override public void close() {
        if (!closed.compareAndSet(false, true)) return;
        broadcast("{\"type\":\"SESSION_ENDED\"}");
        client.close(); listeners.clear();
    }
}
