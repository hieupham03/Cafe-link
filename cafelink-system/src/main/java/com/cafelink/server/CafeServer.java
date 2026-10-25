package com.cafelink.server;

import com.cafelink.common.*;
import com.cafelink.common.Models.Identity;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.net.*;
import java.sql.SQLException;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/** Bounded readers + one bounded outbound queue per connection. */
public final class CafeServer implements AutoCloseable {
    private final CafeService service;
    private final String bind;
    private final int configuredPort;
    private final Consumer<String> logger;
    private final Set<Peer> peers = ConcurrentHashMap.newKeySet();
    private final ThreadPoolExecutor readers = new ThreadPoolExecutor(0, 64, 30, TimeUnit.SECONDS, new SynchronousQueue<>(), runnable -> {
        Thread thread = new Thread(runnable, "cafelink-reader"); thread.setDaemon(true); return thread;
    });
    private volatile boolean running;
    private ServerSocket listener;
    private Thread acceptThread;
    private final FaultInjector faults;
    public CafeServer(CafeService service, String bind, int port, Consumer<String> logger) {
        this(service, bind, port, logger, FaultInjector.NONE);
    }
    public CafeServer(CafeService service, String bind, int port, Consumer<String> logger, FaultInjector faults) {
        this.service = service; this.bind = bind; configuredPort = port; this.logger = logger;
        this.faults = Objects.requireNonNull(faults);
    }
    public synchronized void start() throws IOException {
        if (running || listener != null) throw new IllegalStateException("Server instance can only start once");
        listener = new ServerSocket(); listener.setReuseAddress(true);
        try { listener.bind(new InetSocketAddress(bind, configuredPort), 32); }
        catch (IOException e) { listener.close(); listener = null; throw e; }
        running = true; acceptThread = new Thread(this::acceptLoop, "cafelink-accept"); acceptThread.setDaemon(true); acceptThread.start();
        log("Server listening on " + bind + ":" + port());
    }
    public int port() { return listener.getLocalPort(); }
    public int connectionCount() { return peers.size(); }
    private void acceptLoop() {
        while (running) {
            try {
                Socket socket = listener.accept(); socket.setTcpNoDelay(true); socket.setSoTimeout(60_000);
                Peer peer = new Peer(socket); peers.add(peer);
                try { readers.execute(peer); }
                catch (RejectedExecutionException busy) { peer.close(); log("Connection limit reached"); }
            } catch (IOException e) { if (running) log("Accept failed: " + e.getClass().getSimpleName()); }
        }
    }
    private Map<Integer, Integer> online() {
        Map<Integer, Integer> counts = new HashMap<>();
        for (Peer peer : peers) if (peer.identity != null && peer.identity.tableId() != null && !peer.closed.get()) {
            try { if (service.onlineInCurrentVisit(peer.identity)) counts.merge(peer.identity.tableId(), 1, Integer::sum); }
            catch (SQLException ignored) { /* Missing presence never grants access or blocks business commands. */ }
        }
        return counts;
    }
    private synchronized void publish() {
        if (!running) return;
        Map<Integer, Integer> counts = online();
        for (Peer peer : peers) if (peer.identity != null && !peer.closed.get()) {
            try { peer.send(Message.event(Json.object(service.snapshot(peer.identity, counts)))); }
            catch (SQLException | BusinessException e) { log("Snapshot unavailable: " + e.getClass().getSimpleName()); }
        }
    }
    private void log(String message) { try { logger.accept(message); } catch (RuntimeException ignored) { /* logging must not stop networking */ } }
    private final class Peer implements Runnable, AutoCloseable {
        private final Socket socket;
        private final BlockingQueue<Message> outgoing = new ArrayBlockingQueue<>(64);
        private final AtomicBoolean closed = new AtomicBoolean();
        private volatile Identity identity;
        private Thread writer;
        Peer(Socket socket) { this.socket = socket; }
        @Override public void run() {
            writer = new Thread(this::writeLoop, "cafelink-writer"); writer.setDaemon(true); writer.start();
            log("Connected: " + socket.getRemoteSocketAddress());
            try {
                Message request;
                while (!closed.get() && (request = FrameCodec.read(socket.getInputStream())) != null) {
                    if (!"REQUEST".equals(request.kind())) throw new IOException("Client must send REQUEST");
                    dispatch(request);
                }
            } catch (IOException e) { if (!closed.get()) log("Connection ended: " + e.getClass().getSimpleName()); }
            finally { close(); }
        }
        private void dispatch(Message request) {
            boolean changed = false;
            boolean faultable = Commands.mutation(request.action()) || request.action().equals("DISCARD_COMMAND");
            try {
                JsonObject result;
                if (Set.of("LOGIN", "JOIN_VISIT", "JOIN_TABLE", "RESUME").contains(request.action())) {
                    if (identity != null) throw new BusinessException("ALREADY_AUTHENTICATED", "Kết nối đã đăng nhập.");
                    identity = switch (request.action()) {
                        case "JOIN_VISIT" -> service.joinVisit(CafeService.text(request.data(), "grant", 100, true));
                        case "JOIN_TABLE" -> service.joinTable(CafeService.text(request.data(), "grant", 100, true));
                        case "RESUME" -> service.resume(CafeService.text(request.data(), "credential", 160, true));
                        default -> service.authenticate(CafeService.text(request.data(), "username", 60, true), CafeService.text(request.data(), "password", 128, true), CafeService.text(request.data(), "credential", 160, false));
                    };
                    result = Json.object(identity); changed = true;
                    log("Authenticated: " + identity.username());
                } else {
                    if (identity == null) throw new BusinessException("UNAUTHENTICATED", "Vui lòng đăng nhập.");
                    service.checkIdentity(identity);
                    if (faultable && faults.disconnect(FaultInjector.Point.BEFORE_ACCEPT, identity, request)) {
                        log("FAULT BEFORE_ACCEPT " + request.action() + " id=" + request.requestId()); close(); return;
                    }
                    result = switch (request.action()) {
                        case "PING" -> new JsonObject();
                        case "VERIFY_JOIN_GRANT" -> { service.confirmJoinGrant(identity, CafeService.text(request.data(), "grant", 100, true)); yield new JsonObject(); }
                        case "VERIFY_TABLE_GRANT" -> { service.confirmTableGrant(identity, CafeService.text(request.data(), "grant", 100, true)); yield new JsonObject(); }
                        case "ROTATE_SESSION" -> { identity = service.rotateSession(identity); yield Json.object(identity); }
                        case "CONTINUE_VISIT" -> { identity = service.continueVisit(identity); changed = true; yield Json.object(identity); }
                        case "LEAVE_VISIT" -> { service.logoutGuest(identity); yield new JsonObject(); }
                        case "GET_STATE" -> Json.object(service.snapshot(identity, online()));
                        case "GET_OUTCOME" -> service.outcome(identity, CafeService.text(request.data(), "commandId", 80, true));
                        case "START_NEW_VISIT" -> { identity = service.startNewVisit(identity); changed = true; yield Json.object(identity); }
                        case "DISCARD_COMMAND" -> {
                            if (!request.data().has("payload") || !request.data().get("payload").isJsonObject()) throw new BusinessException("INVALID_INPUT", "Thiếu nội dung yêu cầu gốc.");
                            yield service.discard(identity, CafeService.text(request.data(), "commandId", 80, true), CafeService.text(request.data(), "action", 40, true), request.data().getAsJsonObject("payload"));
                        }
                        default -> { JsonObject value = service.execute(identity, request.requestId(), request.action(), request.data()); changed = Commands.mutation(request.action()); yield value; }
                    };
                }
                if (faultable && faults.disconnect(FaultInjector.Point.AFTER_COMMIT, identity, request)) {
                    log("FAULT AFTER_COMMIT " + request.action() + " id=" + request.requestId()); close(); return;
                }
                send(Message.success(request, result));
                if (!request.action().equals("PING") && !request.action().equals("LOGIN")) log(identity.username() + " " + request.action() + " OK id=" + request.requestId());
            } catch (BusinessException e) { send(Message.error(request, e.code(), e.getMessage())); }
            catch (SQLException e) { log("Database operation failed: " + e.getClass().getSimpleName()); send(Message.error(request, "DATABASE_ERROR", "Không thể lưu dữ liệu. Vui lòng kiểm tra trạng thái trước khi thử lại.")); }
            catch (RuntimeException e) { log("Request rejected: " + e.getClass().getSimpleName()); send(Message.error(request, "INVALID_INPUT", "Yêu cầu không hợp lệ.")); }
            if (changed) publish();
        }
        private void send(Message message) {
            if (!closed.get() && !outgoing.offer(message)) { log("Slow client disconnected: outbound queue full"); close(); }
        }
        private void writeLoop() {
            try { while (!closed.get()) FrameCodec.write(socket.getOutputStream(), outgoing.take()); }
            catch (IOException | InterruptedException e) { if (e instanceof InterruptedException) Thread.currentThread().interrupt(); }
            finally { close(); }
        }
        @Override public void close() {
            if (!closed.compareAndSet(false, true)) return;
            peers.remove(this); try { socket.close(); } catch (IOException ignored) { }
            if (writer != null) writer.interrupt();
            log("Disconnected: " + (identity == null ? "anonymous" : identity.username()));
            publish();
        }
    }
    @Override public void close() {
        running = false;
        if (listener != null) try { listener.close(); } catch (IOException ignored) { }
        for (Peer peer : List.copyOf(peers)) peer.close();
        readers.shutdownNow();
        try { if (acceptThread != null) acceptThread.join(2000); readers.awaitTermination(3, TimeUnit.SECONDS); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        log("Server stopped");
    }
}
