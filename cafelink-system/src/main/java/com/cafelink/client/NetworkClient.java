package com.cafelink.client;

import com.cafelink.common.*;
import com.cafelink.common.Models.*;
import com.google.gson.JsonObject;
import java.io.*;
import java.net.*;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

/** One reader demultiplexes responses and server events; callers never read the socket. */
public final class NetworkClient implements AutoCloseable {
    public enum RecoveryPolicy { REVIEW, REPLAY_ALL }
    public record Traffic(long sentBytes, long receivedBytes) { }
    private final Socket socket;
    private final InputStream input;
    private final OutputStream output;
    private final AtomicLong sentBytes = new AtomicLong(), receivedBytes = new AtomicLong();
    private final ConcurrentMap<String, CompletableFuture<Message>> pending = new ConcurrentHashMap<>();
    private final CopyOnWriteArrayList<Consumer<Snapshot>> stateListeners = new CopyOnWriteArrayList<>();
    private final CopyOnWriteArrayList<Consumer<String>> disconnectListeners = new CopyOnWriteArrayList<>();
    private final AtomicBoolean closed = new AtomicBoolean();
    private final ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "cafelink-heartbeat"); t.setDaemon(true); return t; });
    private final Object writeLock = new Object();
    private volatile Identity identity;
    private volatile String authenticationFailure;
    private final AtomicBoolean heartbeatStarted = new AtomicBoolean();
    private volatile Snapshot latest;
    private final Thread reader;
    private final Outbox outbox;
    private final AtomicBoolean journalClosed = new AtomicBoolean();
    public NetworkClient(String host, int port) throws IOException {
        this(host, port, null);
    }
    public NetworkClient(String host, int port, Path stateFile) throws IOException {
        outbox = stateFile == null ? null : new Outbox(stateFile);
        socket = new Socket();
        try {
            socket.connect(new InetSocketAddress(host, port), 3000); socket.setTcpNoDelay(true); socket.setSoTimeout(20_000);
            input = new FilterInputStream(socket.getInputStream()) {
                @Override public int read() throws IOException { int value = in.read(); if (value >= 0) receivedBytes.incrementAndGet(); return value; }
                @Override public int read(byte[] bytes, int offset, int length) throws IOException { int count = in.read(bytes, offset, length); if (count > 0) receivedBytes.addAndGet(count); return count; }
            };
            output = new FilterOutputStream(socket.getOutputStream()) {
                @Override public void write(int value) throws IOException { out.write(value); sentBytes.incrementAndGet(); }
                @Override public void write(byte[] bytes, int offset, int length) throws IOException { out.write(bytes, offset, length); sentBytes.addAndGet(length); }
            };
        }
        catch (IOException e) { socket.close(); if (outbox != null) outbox.close(); throw e; }
        reader = new Thread(this::readLoop, "cafelink-client-reader"); reader.setDaemon(true); reader.start();
    }
    public Identity login(String username, String password) throws IOException {
        return login(username, password, outbox == null ? "" : outbox.credential());
    }
    public Identity login(String username, String password, String credential) throws IOException {
        JsonObject data = new JsonObject(); data.addProperty("username", username); data.addProperty("password", password);
        data.addProperty("credential", credential);
        identity = Json.GSON.fromJson(request("LOGIN", data), Identity.class);
        if (outbox != null) outbox.bind(identity);
        authenticated();
        return identity;
    }
    public Identity joinVisit(String grant) throws IOException {
        JsonObject data = new JsonObject(); data.addProperty("grant", grant);
        identity = Json.GSON.fromJson(request("JOIN_VISIT", data), Identity.class); authenticated(); return identity;
    }
    public Identity joinTable(String grant) throws IOException {
        JsonObject data=new JsonObject();data.addProperty("grant",grant);
        identity=Json.GSON.fromJson(request("JOIN_TABLE",data),Identity.class);authenticated();return identity;
    }
    public Identity resume(String credential) throws IOException {
        JsonObject data = new JsonObject(); data.addProperty("credential", credential);
        identity = Json.GSON.fromJson(request("RESUME", data), Identity.class); authenticated(); return identity;
    }
    public Identity rotateSession() throws IOException {
        identity = Json.GSON.fromJson(request("ROTATE_SESSION", new JsonObject()), Identity.class); return identity;
    }
    public Identity continueVisit() throws IOException {
        identity = Json.GSON.fromJson(request("CONTINUE_VISIT", new JsonObject()), Identity.class); return identity;
    }
    private void authenticated() throws IOException {
        refresh();
        if (heartbeatStarted.compareAndSet(false, true)) heartbeat.scheduleWithFixedDelay(() -> { if (!closed.get()) try { request("PING", new JsonObject()); } catch (IOException e) { fail(e.getMessage()); } }, 5, 5, TimeUnit.SECONDS);
    }
    public String authenticationFailure() { return authenticationFailure; }
    public Identity identity() { return identity; }
    public String host() { return socket.getInetAddress().getHostAddress(); }
    public int port() { return socket.getPort(); }
    public boolean connected() { return !closed.get(); }
    /** Application bytes (including frame headers), not TCP/IP or Ethernet bytes. */
    public Traffic traffic() { return new Traffic(sentBytes.get(), receivedBytes.get()); }
    public Snapshot latest() { return latest; }
    public boolean durableRecovery() { return outbox != null; }
    public List<Outbox.Entry> recoveryEntries() { return outbox == null ? List.of() : outbox.entries(); }
    public void onState(Consumer<Snapshot> listener) { stateListeners.add(listener); Snapshot value = latest; if (value != null) listener.accept(value); }
    public void onDisconnect(Consumer<String> listener) { disconnectListeners.add(listener); if (closed.get()) listener.accept("Kết nối đã đóng."); }
    public Snapshot refresh() throws IOException { Snapshot state = Json.GSON.fromJson(request("GET_STATE", new JsonObject()), Snapshot.class); accept(state); return state; }
    public JsonObject request(String action, JsonObject data) throws IOException {
        if (outbox != null && Commands.guestMutation(action)) {
            if (outbox.entries().stream().anyMatch(Outbox::unresolved)) throw new IOException("Có yêu cầu chưa rõ kết quả. Hãy mở tab Phục hồi để đối chiếu trước.");
            Outbox.Entry entry = outbox.queue(action, data); return sendQueued(entry);
        }
        return requestWithId(UUID.randomUUID().toString(), action, data);
    }
    private JsonObject sendQueued(Outbox.Entry entry) throws IOException {
        try {
            JsonObject result = requestWithId(entry.id(), entry.action(), entry.data());
            outbox.mark(entry.id(), "RESOLVED", result, "Quán đã xác nhận."); return result;
        } catch (RemoteException e) {
            outbox.mark(entry.id(), "REJECTED", new JsonObject(), e.code() + ": " + e.getMessage()); throw e;
        }
    }
    public List<Outbox.Entry> recover() throws IOException {
        return recover(RecoveryPolicy.REVIEW);
    }
    /** REPLAY_ALL is an explicit experiment baseline; the GUI always uses REVIEW. */
    public List<Outbox.Entry> recover(RecoveryPolicy policy) throws IOException {
        if (outbox == null) return List.of();
        refresh();
        for (Outbox.Entry entry : outbox.entries()) if (Outbox.unresolved(entry)) {
            if (policy == RecoveryPolicy.REPLAY_ALL) {
                try { sendQueued(entry); } catch (RemoteException ignored) { /* Rejection was persisted by sendQueued. */ }
                continue;
            }
            JsonObject known = lookup(entry.id());
            if (known.get("found").getAsBoolean()) resolve(entry, known);
            else if (!currentVisit(entry)) outbox.mark(entry.id(), "STALE", new JsonObject(), "Lượt khách đã kết thúc; không chuyển yêu cầu sang lượt mới.");
            else outbox.mark(entry.id(), "CONFIRM_REQUIRED", new JsonObject(), entry.action().equals("PLACE_ORDER") ? "Chưa tìm thấy đơn. Chỉ gửi lại nếu bạn vẫn muốn đặt." : "Lời gọi chưa được ghi nhận. Chỉ gửi nếu bạn vẫn cần phục vụ.");
        }
        return outbox.entries();
    }
    public JsonObject confirmRecovery(String id) throws IOException {
        Outbox.Entry entry = pendingEntry(id); JsonObject known = lookup(id);
        if (known.get("found").getAsBoolean()) { resolve(entry, known); return known.getAsJsonObject("result"); }
        refresh();
        if (!currentVisit(entry)) { outbox.mark(id, "STALE", new JsonObject(), "Lượt khách đã kết thúc."); throw new IOException("Không được gửi yêu cầu của lượt cũ."); }
        return sendQueued(entry);
    }
    public void dismissRecovery(String id) throws IOException {
        Outbox.Entry entry = pendingEntry(id);
        JsonObject data = new JsonObject(); data.addProperty("commandId", id); data.addProperty("action", entry.action()); data.add("payload", entry.data());
        resolve(entry, request("DISCARD_COMMAND", data));
    }
    public void startNewVisit() throws IOException {
        if (outbox == null) throw new IOException("Cần outbox để đổi lượt.");
        recover();
        if (outbox.entries().stream().anyMatch(Outbox::unresolved)) throw new IOException("Cần giải quyết các yêu cầu còn chờ.");
        Identity next = Json.GSON.fromJson(request("START_NEW_VISIT", new JsonObject()), Identity.class);
        outbox.startNewVisit(next); identity = next; refresh();
    }
    private Outbox.Entry pendingEntry(String id) throws IOException {
        if (outbox == null) throw new IOException("Client chưa bật outbox.");
        return outbox.entries().stream().filter(e -> e.id().equals(id) && Outbox.unresolved(e)).findFirst().orElseThrow(() -> new IOException("Yêu cầu đã được giải quyết hoặc không tồn tại."));
    }
    private JsonObject lookup(String id) throws IOException { JsonObject data = new JsonObject(); data.addProperty("commandId", id); return request("GET_OUTCOME", data); }
    private void resolve(Outbox.Entry entry, JsonObject known) throws IOException {
        if (!entry.action().equals(known.get("action").getAsString()) || !Commands.fingerprint(entry.action(), entry.data()).equals(known.get("fingerprint").getAsString())) throw new IOException("Outcome không khớp nội dung yêu cầu.");
        JsonObject result = known.getAsJsonObject("result");
        outbox.mark(entry.id(), result.has("cancelledBeforeAcceptance") ? "REJECTED" : "RESOLVED", result, result.has("cancelledBeforeAcceptance") ? "Đã bỏ trước khi quán tiếp nhận; lệnh đến muộn sẽ không được tạo lại." : "Đã lấy lại kết quả được quán lưu; không tạo yêu cầu mới.");
    }
    private boolean currentVisit(Outbox.Entry entry) {
        return latest != null && !latest.tables().isEmpty() && entry.data().has("visitId") && entry.data().get("visitId").getAsString().equals(latest.tables().get(0).visitId());
    }
    public JsonObject requestWithId(String id, String action, JsonObject data) throws IOException {
        if (closed.get()) throw new IOException("Không còn kết nối đến quán.");
        CompletableFuture<Message> future = new CompletableFuture<>();
        if (pending.putIfAbsent(id, future) != null) throw new IOException("Yêu cầu cùng mã đang được gửi.");
        try {
            synchronized (writeLock) { if (closed.get()) throw new IOException("Connection closed"); FrameCodec.write(output, Message.request(id, action, data)); }
            Message response = future.get(5, TimeUnit.SECONDS);
            if (!response.ok()) {
                if (java.util.Set.of("INVALID_CREDENTIAL", "SESSION_REVOKED", "SESSION_EXPIRED").contains(response.errorCode())) {
                    authenticationFailure = response.errorCode(); fail(response.message());
                }
                throw new RemoteException(response.errorCode(), response.message());
            }
            return response.data();
        } catch (TimeoutException e) { fail("Không nhận được phản hồi. Hãy kết nối lại và kiểm tra đơn trước khi gửi lại."); throw new IOException("Chưa xác định được kết quả yêu cầu; kết nối đã đóng.", e); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IOException("Yêu cầu bị gián đoạn", e); }
        catch (ExecutionException e) { throw new IOException("Kết nối bị ngắt; kết quả yêu cầu có thể chưa rõ.", e.getCause()); }
        catch (IOException e) { if (!(e instanceof RemoteException)) fail(e.getMessage()); throw e; }
        finally { pending.remove(id); }
    }
    private void readLoop() {
        try {
            Message message;
            while (!closed.get() && (message = FrameCodec.read(input)) != null) {
                if (message.kind().equals("RESPONSE")) { CompletableFuture<Message> future = pending.get(message.requestId()); if (future != null) future.complete(message); }
                else if (message.kind().equals("EVENT") && message.action().equals("STATE_UPDATED")) accept(Json.GSON.fromJson(message.data(), Snapshot.class));
                else throw new IOException("Unexpected server message");
            }
            fail("Mất kết nối đến quán.");
        } catch (IOException | RuntimeException e) { fail("Mất kết nối đến quán: " + e.getClass().getSimpleName()); }
    }
    private synchronized void accept(Snapshot state) {
        if (latest != null && state.revision() < latest.revision()) return;
        latest = state;
        for (Consumer<Snapshot> listener : stateListeners) try { listener.accept(state); } catch (RuntimeException ignored) { }
    }
    private void fail(String detail) {
        if (!closed.compareAndSet(false, true)) return;
        try { socket.close(); } catch (IOException ignored) { }
        heartbeat.shutdownNow(); IOException error = new IOException(detail);
        pending.values().forEach(future -> future.completeExceptionally(error)); pending.clear();
        for (Consumer<String> listener : disconnectListeners) try { listener.accept(detail); } catch (RuntimeException ignored) { }
    }
    @Override public void close() {
        fail("Đã đóng kết nối.");
        if (outbox != null && journalClosed.compareAndSet(false, true)) try { outbox.close(); } catch (IOException ignored) { }
    }
}
