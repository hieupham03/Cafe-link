package com.cafelink.web;

import com.cafelink.client.*;
import com.cafelink.common.Json;
import com.cafelink.common.ApplicationInfo;
import com.google.gson.*;
import org.eclipse.jetty.server.*;
import org.eclipse.jetty.server.handler.ContextHandler;
import org.eclipse.jetty.util.Callback;
import org.eclipse.jetty.util.ssl.SslContextFactory;
import org.eclipse.jetty.websocket.api.Session;
import org.eclipse.jetty.websocket.server.WebSocketUpgradeHandler;
import java.io.*;
import java.net.*;
import java.lang.management.ManagementFactory;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Consumer;

/** HTTP/WebSocket adapter only: all business commands travel over a real TCP socket. */
public final class WebGateway implements AutoCloseable {
    public record Tls(Path keyStore, String password) { }
    private static final int BODY_LIMIT = 64 * 1024;
    private static final Set<String> ACTIONS = Set.of("AMEND_SERVICE", "CANCEL_SERVICE", "SET_STORE_ACCEPTING", "FIND_ASSISTANCE", "OPEN_ALL_TABLES", "GET_TABLE_QR", "GET_OWN_TABLE_QR", "GET_CONTINUATION_CONTEXT", "RESOLVE_ORDER", "SET_TABLE_ACCEPTING", "OPEN_TABLE", "CLOSE_EMPTY_TABLE", "PLACE_ORDER",
            "SET_ORDER_STATUS", "CALL_SERVICE", "REQUEST_BILL", "HANDLE_TICKET", "GET_BILL", "PAY_AND_CLOSE",
            "GET_OUTCOME", "DISCARD_COMMAND", "GET_VISIT_QR", "ROTATE_JOIN_GRANT", "GET_VISIT_MEMBERSHIPS", "REVOKE_SESSION", "REQUEST_CHECKOUT", "ACK_CHECKOUT", "REOPEN_ORDERING", "GET_CHECKOUT", "GET_NOTIFICATIONS", "MARK_NOTIFICATION_READ", "CREATE_MENU_ITEM", "UPDATE_MENU_ITEM", "GET_MENU_CATEGORIES", "SAVE_MENU_CATEGORY", "DELETE_MENU_CATEGORY", "START_ORDER_PAYMENT", "SIMULATE_PAYMENT", "CANCEL_UNPAID_ORDER", "CLOSE_VISIT", "GET_SALES_HISTORY", "GET_SALES_RECEIPT");
    private final Server server = new Server();
    private final ServerConnector connector;
    private final String coreHost;
    private final int corePort;
    private final CoreHealthProbe healthProbe;
    private final Path assets;
    private MenuImages images;
    public void mediaDirectory(Path directory){images=new MenuImages(directory);}
    private final boolean secure;
    private final Map<String, SessionBridge> sessions = new ConcurrentHashMap<>();
    private final ScheduledExecutorService reaper = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "cafelink-web-expiry"); thread.setDaemon(true); return thread;
    });
    private final SecureRandom random = new SecureRandom();
    private final String configuredOrigin;
    private final Map<String, ArrayDeque<Long>> authAttempts = new HashMap<>();

    /** Development HTTP is deliberately restricted to loopback. */
    public WebGateway(String bind, int port, String coreHost, int corePort, Path assets) {
        this(bind, port, coreHost, corePort, assets, null, null);
    }
    public WebGateway(String bind, int port, String coreHost, int corePort, Path assets, String publicOrigin, Tls tls) {
        this(bind,port,coreHost,corePort,assets,publicOrigin,tls,false);
    }
    public WebGateway(String bind,int port,String coreHost,int corePort,Path assets,String publicOrigin,Tls tls,boolean trustedProxy){
        this.coreHost = coreHost; this.corePort = corePort; this.assets = assets.toAbsolutePath().normalize();
        healthProbe = new CoreHealthProbe(coreHost, corePort);
        secure = tls != null || trustedProxy;
        if(trustedProxy&&(tls!=null||publicOrigin==null||!Set.of("127.0.0.1","::1").contains(bind)))throw new IllegalArgumentException("Trusted proxy requires loopback HTTP and an explicit public HTTPS origin.");
        if (tls==null && !Set.of("127.0.0.1", "::1").contains(bind))
            throw new IllegalArgumentException("HTTP development must bind to loopback; configure TLS for LAN.");
        if (publicOrigin != null) {
            URI origin = URI.create(publicOrigin);
            if (!Objects.equals(origin.getScheme(), secure ? "https" : "http") || origin.getHost() == null
                    || origin.getRawQuery() != null || origin.getFragment() != null || origin.getUserInfo() != null
                    || !(origin.getPath().isEmpty() || origin.getPath().equals("/")))
                throw new IllegalArgumentException("publicOrigin must be a matching HTTP(S) origin without a path.");
            configuredOrigin = publicOrigin.replaceAll("/$", "");
        } else configuredOrigin = null;
        HttpConfiguration http = new HttpConfiguration(); http.setSendServerVersion(false);
        if (tls!=null) {
            http.addCustomizer(new SecureRequestCustomizer());
            SslContextFactory.Server ssl = new SslContextFactory.Server();
            ssl.setKeyStorePath(tls.keyStore().toAbsolutePath().toString()); ssl.setKeyStorePassword(tls.password());
            connector = new ServerConnector(server, new SslConnectionFactory(ssl, "http/1.1"), new HttpConnectionFactory(http));
        } else connector = new ServerConnector(server, new HttpConnectionFactory(http));
        connector.setHost(bind); connector.setPort(port); connector.setIdleTimeout(10_000);
        server.addConnector(connector);
        ContextHandler context = new ContextHandler("/"); server.setHandler(context);
        var websocket = WebSocketUpgradeHandler.from(server, context, container -> {
            container.setIdleTimeout(Duration.ofSeconds(60)); container.setMaxTextMessageSize(128);
            container.addMapping("/ws/state", (request, response, callback) -> {
                try {
                    requireOrigin(request);
                    SessionBridge bridge = session(request);
                    return new StateSocket(bridge);
                } catch (HttpFailure failure) {
                    Response.writeError(request, response, callback, failure.status, failure.getMessage()); return null;
                } catch (RemoteException failure) {
                    Response.writeError(request, response, callback, 401, failure.getMessage()); return null;
                } catch (IOException failure) {
                    Response.writeError(request, response, callback, 503, "Core unavailable"); return null;
                }
            });
        });
        websocket.setHandler(new ApiHandler()); context.setHandler(websocket);
    }
    public void start() throws Exception {
        server.start();
        reaper.scheduleWithFixedDelay(this::expire, 30, 30, TimeUnit.SECONDS);
    }
    public int port() { return connector.getLocalPort(); }
    public String origin() {
        if (configuredOrigin != null) return configuredOrigin;
        String host = connector.getHost();
        if (host.contains(":")) host = "[" + host + "]";
        return (secure ? "https://" : "http://") + host + ":" + port();
    }
    private String secret() { byte[] bytes = new byte[32]; random.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    private synchronized SessionBridge lease(Request request) throws IOException {
        SessionBridge bridge=session(request);bridge.retain();return bridge;
    }
    private void makeRoom(boolean guest) {
        expire();
        while(sessions.size()>=32||(guest&&sessions.values().stream().filter(b->b.client.identity().membershipId()!=null).count()>=30)) {
            boolean freed=false;
            for(var entry:sessions.entrySet().stream().filter(e->e.getValue().client.identity().membershipId()!=null).sorted(Comparator.comparingLong(e->e.getValue().lastAccess)).toList()) {
                if(entry.getValue().retireIfIdle()){sessions.remove(entry.getKey(),entry.getValue());freed=true;break;}
            }
            if(!freed)throw new HttpFailure(503,"GATEWAY_BUSY","Đã đủ kết nối đang hoạt động (tối đa 30 phiên khách). Hãy thử lại sau; đơn đã nhận vẫn được giữ.");
        }
    }
    private boolean expired(SessionBridge value) {
        long now = System.nanoTime();
        return now - value.createdAt > Duration.ofHours(8).toNanos() || now - value.lastAccess > Duration.ofMinutes(30).toNanos();
    }
    private void expire() {
        sessions.forEach((key, value) -> { if (expired(value) && sessions.remove(key, value)) value.close(); });
    }
    private void requireOrigin(Request request) {
        if (!origin().equals(request.getHeaders().get("Origin"))) throw new HttpFailure(403, "ORIGIN_DENIED", "Nguồn truy cập không hợp lệ.");
    }
    private String sessionId(Request request) {
        for (var cookie : Request.getCookies(request)) if (cookie.getName().equals("CL_SESSION")) return cookie.getValue();
        return "";
    }
    private synchronized SessionBridge session(Request request) throws IOException {
        String key = sessionId(request); SessionBridge result = sessions.get(key);
        if (key.isEmpty()) throw new HttpFailure(401, "UNAUTHENTICATED", "Vui lòng đăng nhập hoặc quét QR tại bàn.");
        if (result != null && expired(result)) {
            if (sessions.remove(key, result)) result.close();
            if (result.client.identity().membershipId() == null) throw new HttpFailure(401, "SESSION_EXPIRED", "Phiên đăng nhập đã hết hạn.");
            result = null;
        }
        if (result != null && result.client.identity().membershipId() != null) {
            if (result.client.connected()) result.client.request("PING", new JsonObject());
            else { sessions.remove(key, result); result.close(); result = null; }
        }
        if (result == null) {
            makeRoom(true);
            NetworkClient client = new NetworkClient(coreHost, corePort);
            try {
                client.resume(key); result = new SessionBridge(client, secret()); sessions.put(key, result);
            } catch (RemoteException failure) {
                client.close();
                if (failure.code().equals("QR_DISABLED")) throw new HttpFailure(401, "UNAUTHENTICATED", "Phiên đăng nhập đã kết thúc.");
                throw failure;
            } catch (IOException | RuntimeException failure) { client.close(); throw failure; }
        }
        result.lastAccess = System.nanoTime(); return result;
    }
    private synchronized SessionBridge continueGuest(Request request,Response response,SessionBridge bridge,JsonObject input) throws IOException {
        var who=bridge.client.identity();
        if(who.membershipId()==null)throw new HttpFailure(403,"FORBIDDEN","Chỉ khách QR được bắt đầu lần tiếp theo.");
        String previous=string(input,"membershipId",80);
        if(!previous.equals(who.membershipId())) {
            var context=bridge.client.request("GET_CONTINUATION_CONTEXT",new JsonObject());
            if(!context.has("previousScope")||!previous.equals(context.getAsJsonObject("previousScope").get("membershipId").getAsString()))
                throw new HttpFailure(409,"STALE_SESSION","Phiên đã đổi. Hãy tải lại để xem đúng giỏ hiện tại.");
            return bridge;
        }
        String oldKey=sessionId(request);
        var next=bridge.client.continueVisit();
        sessions.remove(oldKey,bridge);sessions.put(next.credential(),bridge);
        response.getHeaders().add("Set-Cookie",cookie(next.credential(),28800));return bridge;
    }
    private synchronized void authBudget(Request request) {
        long now = System.nanoTime(), cutoff = now - Duration.ofMinutes(1).toNanos();
        authAttempts.entrySet().removeIf(entry -> entry.getValue().isEmpty() || entry.getValue().peekLast() < cutoff);
        boolean joining=Request.getPathInContext(request).equals("/api/guest/join");
        String address = (joining?"join:":"login:")+String.valueOf(request.getConnectionMetaData().getRemoteSocketAddress() instanceof InetSocketAddress remote ? remote.getAddress() : "unknown");
        if (!authAttempts.containsKey(address) && authAttempts.size() >= 1024) throw new HttpFailure(429,"RATE_LIMITED","Có quá nhiều lượt truy cập. Vui lòng thử lại sau.");
        ArrayDeque<Long> attempts = authAttempts.computeIfAbsent(address, ignored -> new ArrayDeque<>());
        while (!attempts.isEmpty() && attempts.peekFirst() < cutoff) attempts.removeFirst();
        if (attempts.size() >= (joining?60:30)) throw new HttpFailure(429,"RATE_LIMITED","Đã thử quá nhiều lần. Vui lòng chờ một phút.");
        attempts.addLast(now);
    }
    private synchronized SessionBridge join(Request request, Response response, JsonObject input) throws IOException {
        String grant = string(input, "grant", 100), previous = sessionId(request);
        boolean table=input.has("table")&&input.get("table").isJsonPrimitive()&&input.get("table").getAsJsonPrimitive().isBoolean()&&input.get("table").getAsBoolean();
        if (!previous.isEmpty()) {
            SessionBridge existing = session(request);
            if (existing.client.identity().membershipId() == null) throw new HttpFailure(409, "SESSION_SWITCH_REQUIRED", "Hãy dùng thiết bị hoặc cửa sổ riêng cho khách tại bàn.");
            JsonObject data = new JsonObject(); data.addProperty("grant", grant);
            existing.client.request(table?"VERIFY_TABLE_GRANT":"VERIFY_JOIN_GRANT", data); return existing;
        }
        makeRoom(true);
        NetworkClient client = new NetworkClient(coreHost, corePort);
        try {
            var who = table?client.joinTable(grant):client.joinVisit(grant); SessionBridge bridge = new SessionBridge(client, secret());
            sessions.put(who.credential(), bridge); response.getHeaders().add("Set-Cookie", cookie(who.credential(),28800)); return bridge;
        } catch (IOException | RuntimeException failure) { client.close(); throw failure; }
    }
    private void csrf(Request request, SessionBridge bridge) {
        if (!bridge.csrf.equals(request.getHeaders().get("X-CSRF-Token"))) throw new HttpFailure(403, "CSRF_DENIED", "Hãy tải lại trang trước khi thao tác.");
    }
    private synchronized SessionBridge login(Request request, Response response, JsonObject body) throws IOException {
        // Admission is bounded even while expensive Core authentication runs.
        expire();
        if(!sessions.containsKey(sessionId(request)))makeRoom(false);
        int replacing = sessions.containsKey(sessionId(request)) ? 1 : 0;
        if (sessions.values().stream().filter(b->b.client.identity().membershipId()==null).count() - replacing >= 16) throw new HttpFailure(503, "GATEWAY_BUSY", "Máy chủ đang đủ số phiên quản lý.");
        NetworkClient client = new NetworkClient(coreHost, corePort);
        try {
            var identity = client.login(string(body, "username", 60), string(body, "password", 128));
            if (!identity.role().equals("ADMIN")) throw new HttpFailure(403, "QR_REQUIRED", "Khách cần quét QR của lượt bàn; không dùng mật khẩu bàn trên web.");
            SessionBridge bridge = new SessionBridge(client, secret());
            String key = secret(); sessions.put(key, bridge);
            SessionBridge previous = sessions.remove(sessionId(request)); if (previous != null) previous.close();
            response.getHeaders().add("Set-Cookie", cookie(key, 28800));
            return bridge;
        } catch (IOException | RuntimeException failure) { client.close(); throw failure; }
    }
    private String cookie(String value, int age) {
        return "CL_SESSION=" + value + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + age + (secure ? "; Secure" : "");
    }
    private void revokeGuestToken(SessionBridge previous, String token) throws IOException {
        if (previous != null && previous.client.identity().membershipId() == null) return;
        if (previous != null && previous.client.authenticationFailure() != null) return;
        if (!token.matches("[A-Za-z0-9_-]{43}")) return;
        try {
            if (previous != null && previous.client.connected()) previous.client.request("LEAVE_VISIT", new JsonObject());
            else try (NetworkClient client = new NetworkClient(coreHost, corePort)) {
                client.resume(token); client.request("LEAVE_VISIT", new JsonObject());
            }
        } catch (RemoteException denied) {
            if (!Set.of("INVALID_CREDENTIAL","SESSION_REVOKED","SESSION_EXPIRED","QR_DISABLED").contains(denied.code())) throw denied;
        }
    }
    private static String string(JsonObject object, String key, int max) {
        var value = object.get(key);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()
                || value.getAsString().isBlank() || value.getAsString().length() > max)
            throw new HttpFailure(400, "INVALID_INPUT", "Trường " + key + " không hợp lệ.");
        return value.getAsString();
    }
    private static JsonObject body(Request request) throws IOException {
        String contentType = request.getHeaders().get("Content-Type");
        if (contentType == null || !contentType.split(";")[0].trim().equalsIgnoreCase("application/json"))
            throw new HttpFailure(415, "JSON_REQUIRED", "Yêu cầu phải dùng JSON.");
        if (request.getLength() > BODY_LIMIT) throw new HttpFailure(413, "BODY_TOO_LARGE", "Nội dung quá lớn.");
        byte[] bytes = Request.asInputStream(request).readNBytes(BODY_LIMIT + 1);
        if (bytes.length > BODY_LIMIT) throw new HttpFailure(413, "BODY_TOO_LARGE", "Nội dung quá lớn.");
        try {
            JsonElement value = JsonParser.parseString(new String(bytes, StandardCharsets.UTF_8));
            if (!value.isJsonObject()) throw new JsonParseException("Object required");
            return value.getAsJsonObject();
        } catch (JsonParseException e) { throw new HttpFailure(400, "INVALID_JSON", "JSON không hợp lệ."); }
    }
    private static void respond(Response response, Callback callback, int status, Object value) {
        response.setStatus(status); response.getHeaders().put("Content-Type", "application/json; charset=utf-8");
        response.write(true, ByteBuffer.wrap(Json.GSON.toJson(value).getBytes(StandardCharsets.UTF_8)), callback);
    }
    private final class ApiHandler extends Handler.Abstract {
        @Override public boolean handle(Request request, Response response, Callback callback) {
            SessionBridge leased=null;
            response.getHeaders().put("Cache-Control", "no-store");
            response.getHeaders().put("X-Content-Type-Options", "nosniff");
            response.getHeaders().put("Referrer-Policy", "no-referrer");
            response.getHeaders().put("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
            try {
                String path = Request.getPathInContext(request), method = request.getMethod();
                if(path.startsWith("/media/")&&method.equals("GET")){
                    // Menu photos are public product assets; no guest/order/session data stored here.
                    byte[] bytes=images==null?null:images.read(path);if(bytes==null)throw new HttpFailure(404,"NOT_FOUND","Ảnh không tồn tại.");
                    response.getHeaders().put("Content-Type","image/jpeg");response.write(true,ByteBuffer.wrap(bytes),callback);return true;
                }
                if (!path.startsWith("/api/") && !path.equals("/ws/state")) return staticFile(request, response, callback);
                if (path.equals("/api/health") && method.equals("GET")) {
                    respond(response, callback, 200, Map.of("gateway", "UP", "version", ApplicationInfo.VERSION,
                            "phase", ApplicationInfo.VERSION, "transport", "TCP")); return true;
                }
                if (path.equals("/api/ready") && method.equals("GET")) {
                    var health = healthProbe.check();
                    respond(response, callback, health.ready() ? 200 : 503, health.payload(ApplicationInfo.VERSION)); return true;
                }
                if (method.equals("POST")) requireOrigin(request);
                if (path.equals("/api/login") && method.equals("POST")) {
                    authBudget(request);
                    respond(response, callback, 200, login(request, response, body(request)).info()); return true;
                }
                if (path.equals("/api/guest/join") && method.equals("POST")) {
                    authBudget(request); respond(response, callback, 200, join(request, response, body(request)).info()); return true;
                }
                if (path.equals("/api/guest/leave") && method.equals("POST")) {
                    SessionBridge previous = sessions.get(sessionId(request));
                    revokeGuestToken(previous, sessionId(request));
                    if (previous != null) {
                        sessions.remove(sessionId(request), previous); previous.close();
                    }
                    response.getHeaders().add("Set-Cookie", cookie("", 0)); respond(response, callback, 200, Map.of("left", true)); return true;
                }
                SessionBridge bridge = lease(request);leased=bridge;
                if (method.equals("POST")) csrf(request, bridge);
                switch (method + " " + path) {
                    case "POST /api/menu/image" -> {
                        if(!bridge.client.identity().role().equals("ADMIN"))throw new HttpFailure(403,"FORBIDDEN","Chỉ quản lý được tải ảnh.");
                        if(images==null)throw new HttpFailure(503,"MEDIA_UNAVAILABLE","Chưa cấu hình kho ảnh.");
                        if(request.getLength()>MenuImages.LIMIT)throw new HttpFailure(413,"IMAGE_TOO_LARGE","Ảnh tối đa 2 MiB.");
                        byte[] bytes=Request.asInputStream(request).readNBytes(MenuImages.LIMIT+1);
                        try{respond(response,callback,200,Map.of("imageUrl",images.save(bytes)));}catch(IOException invalid){throw new HttpFailure(400,"INVALID_IMAGE",invalid.getMessage());}
                    }
                    case "POST /api/guest/continue" -> respond(response, callback, 200, continueGuest(request,response,bridge,body(request)).info());
                    case "GET /api/session" -> respond(response, callback, 200, bridge.info());
                    case "GET /api/admin/diagnostics" -> {
                        if (!bridge.client.identity().role().equals("ADMIN")) throw new HttpFailure(403,"FORBIDDEN","Chỉ quản lý được xem chẩn đoán hệ thống.");
                        JsonObject core = bridge.command(UUID.randomUUID().toString(), "GET_DIAGNOSTICS", new JsonObject());
                        var heap = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage();
                        respond(response, callback, 200, Map.of("version", ApplicationInfo.VERSION,
                                "sampledAt", java.time.Instant.now().toString(), "core", core,
                                "readiness", healthProbe.check().payload(ApplicationInfo.VERSION),
                                "gateway", Map.of("sessions", sessions.size(),
                                        "adminSessions", sessions.values().stream().filter(s -> s.client.identity().role().equals("ADMIN")).count(),
                                        "guestSessions", sessions.values().stream().filter(s -> s.client.identity().role().equals("GUEST")).count(),
                                        "webSockets", sessions.values().stream().mapToInt(SessionBridge::subscriberCount).sum(),
                                        "inFlight", sessions.values().stream().mapToInt(SessionBridge::inFlightCount).sum(), "sessionLimit", 32),
                                "jvm", Map.of("heapUsedBytes", heap.getUsed(), "heapMaxBytes", heap.getMax(),
                                        "threads", ManagementFactory.getThreadMXBean().getThreadCount())));
                    }
                    case "GET /api/state" -> respond(response, callback, 200, bridge.client.refresh());
                    case "POST /api/logout" -> {
                        if (bridge.client.identity().membershipId() != null) bridge.client.request("LEAVE_VISIT", new JsonObject());
                        sessions.remove(sessionId(request), bridge); bridge.close();
                        response.getHeaders().add("Set-Cookie", cookie("", 0)); respond(response, callback, 200, Map.of("loggedOut", true));
                    }
                    case "POST /api/command" -> {
                        JsonObject input = body(request);
                        String id = string(input, "commandId", 80), action = string(input, "action", 40);
                        if (!ACTIONS.contains(action)) throw new HttpFailure(400, "ACTION_DENIED", "Thao tác không được công bố qua web.");
                        if (!input.has("data") || !input.get("data").isJsonObject()) throw new HttpFailure(400, "INVALID_INPUT", "Thiếu data.");
                        if (bridge.client.identity().membershipId() != null) {
                            if (Set.of("AMEND_SERVICE","CANCEL_SERVICE","GET_CONTINUATION_CONTEXT","GET_OWN_TABLE_QR","PLACE_ORDER","CALL_SERVICE","REQUEST_CHECKOUT","GET_CHECKOUT","GET_OUTCOME","DISCARD_COMMAND","START_ORDER_PAYMENT","SIMULATE_PAYMENT","CANCEL_UNPAID_ORDER","GET_SALES_RECEIPT").contains(action)) {
                                if (!input.has("scope") || !input.get("scope").isJsonObject()) throw new HttpFailure(409,"SCOPE_REQUIRED","Thiếu phạm vi của yêu cầu. Hãy tải lại trang.");
                                JsonObject expected=input.getAsJsonObject("scope"), actual=bridge.identity();
                                for (String field : List.of("storeId","visitId","membershipId"))
                                    if (!actual.get(field).getAsString().equals(string(expected,field,80))) throw new HttpFailure(409,"SCOPE_CHANGED","Phiên hoặc lượt bàn đã thay đổi. Không chuyển yêu cầu cũ sang quyền mới.");
                            }
                            if (action.equals("REQUEST_BILL")) throw new HttpFailure(403,"WEB_ORDERING_NOT_READY","Vui lòng yêu cầu tính tiền trực tiếp với nhân viên.");
                        }
                        if(bridge.client.identity().membershipId()==null&&input.has("scope")) {
                            JsonObject expected=input.getAsJsonObject("scope"),actual=bridge.identity();
                            for(String field:List.of("storeId","username"))if(!actual.has(field)||!string(expected,field,80).equals(actual.get(field).getAsString()))throw new HttpFailure(409,"SCOPE_CHANGED","Quán hoặc tài khoản quản lý đã thay đổi.");
                        }
                        JsonObject value = bridge.command(id, action, input.getAsJsonObject("data"));
                        if (action.equals("GET_VISIT_QR")) value.addProperty("joinUrl", origin()+"/join#grant="+value.get("grant").getAsString());
                        if (action.equals("GET_TABLE_QR")) value.addProperty("joinUrl", origin()+"/join#table="+value.get("grant").getAsString());
                        respond(response, callback, 200, value);
                    }
                    default -> throw new HttpFailure(404, "NOT_FOUND", "Không có đường dẫn này.");
                }
            } catch (HttpFailure e) { respond(response, callback, e.status, Map.of("code", e.code, "message", e.getMessage())); }
            catch (RemoteException e) {
                int status = Set.of("AUTH_FAILED","INVALID_CREDENTIAL","SESSION_REVOKED","SESSION_EXPIRED").contains(e.code()) ? 401 : Set.of("FORBIDDEN","QR_REQUIRED").contains(e.code()) ? 403 : e.code().equals("RATE_LIMITED") ? 429 : 409;
                respond(response, callback, status, Map.of("code", e.code(), "message", e.getMessage()));
            } catch (IOException e) {
                respond(response, callback, 503, Map.of("code", "CORE_UNAVAILABLE", "message", "Mất kết nối tới quán. Chưa rõ kết quả lệnh; hãy đối chiếu trước khi gửi lại."));
            } catch (RuntimeException e) { respond(response, callback, 400, Map.of("code", "INVALID_INPUT", "message", "Yêu cầu không hợp lệ.")); }
            finally {if(leased!=null)leased.release();}
            return true;
        }
    }
    private boolean staticFile(Request request, Response response, Callback callback) throws IOException {
        if (!request.getMethod().equals("GET")) throw new HttpFailure(405, "METHOD_DENIED", "Chỉ hỗ trợ GET.");
        String path = Request.getPathInContext(request);
        if (Set.of("/", "/admin", "/join", "/guest").contains(path)) path = "/index.html";
        if (!path.matches("/[A-Za-z0-9_./-]+") || path.contains("..")) throw new HttpFailure(404, "NOT_FOUND", "Không có tài nguyên.");
        Path file = assets.resolve(path.substring(1)).normalize();
        if (!file.startsWith(assets) || !Files.isRegularFile(file) || !file.toRealPath().startsWith(assets.toRealPath()))
            throw new HttpFailure(404, "NOT_FOUND", "Chưa build giao diện hoặc tài nguyên không tồn tại.");
        String type = path.endsWith(".html") ? "text/html" : path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "application/octet-stream";
        response.getHeaders().put("Content-Type", type + "; charset=utf-8");
        byte[] bytes=Files.readAllBytes(file);
        if(path.endsWith(".js")||path.endsWith(".css")) {
            response.getHeaders().put("Vary","Accept-Encoding");
            String encoding=request.getHeaders().get("Accept-Encoding");double wildcard=0,explicit=-1;
            if(encoding!=null)for(String token:encoding.toLowerCase(Locale.ROOT).split(",")) {
                String[] parts=token.trim().split(";");double quality=1;
                for(int i=1;i<parts.length;i++)if(parts[i].trim().startsWith("q="))try{quality=Double.parseDouble(parts[i].trim().substring(2));}catch(NumberFormatException invalid){quality=0;}
                if(!Double.isFinite(quality)||quality<0||quality>1)quality=0;
                if(parts[0].trim().equals("gzip"))explicit=quality;if(parts[0].trim().equals("*"))wildcard=quality;
            }
            if((explicit>=0?explicit:wildcard)>0&&bytes.length>1024){var buffer=new ByteArrayOutputStream();try(var zip=new java.util.zip.GZIPOutputStream(buffer)){zip.write(bytes);}bytes=buffer.toByteArray();response.getHeaders().put("Content-Encoding","gzip");}
        }
        response.getHeaders().put("Content-Length",String.valueOf(bytes.length));
        response.write(true, ByteBuffer.wrap(bytes), callback); return true;
    }
    private static final class HttpFailure extends RuntimeException {
        final int status; final String code;
        HttpFailure(int status, String code, String message) { super(message); this.status = status; this.code = code; }
    }
    /** State snapshots may be coalesced: at most one in flight and one latest per tab. */
    public static final class StateSocket implements Session.Listener.AutoDemanding {
        private final SessionBridge bridge;
        private final Consumer<String> listener = this::offer;
        private Session socket;
        private String latest;
        private boolean sending;
        private boolean closed;
        StateSocket(SessionBridge bridge) { this.bridge = bridge; }
        @Override public synchronized void onWebSocketOpen(Session session) {
            socket = session;
            if (!bridge.subscribe(listener)) { closed = true; session.close(1008, "Tab limit or session ended", org.eclipse.jetty.websocket.api.Callback.NOOP); }
        }
        @Override public synchronized void onWebSocketText(String text) {
            if (!text.equals("PING")) { socket.close(1008, "Read only channel", org.eclipse.jetty.websocket.api.Callback.NOOP); return; }
            bridge.lastAccess = System.nanoTime();
        }
        private synchronized void offer(String message) {
            if (closed) return;
            if (message.equals("{\"type\":\"SESSION_ENDED\"}")) {
                closed = true;
                socket.close(1008, "Session ended", org.eclipse.jetty.websocket.api.Callback.NOOP);
                return;
            }
            latest = message; drain();
        }
        private synchronized void drain() {
            if (sending || latest == null || closed) return;
            String message = latest; latest = null; sending = true;
            socket.sendText(message, org.eclipse.jetty.websocket.api.Callback.from(() -> {
                synchronized (this) { sending = false; drain(); }
            }, ignored -> { bridge.unsubscribe(listener); socket.disconnect(); }));
        }
        @Override public synchronized void onWebSocketClose(int statusCode, String reason) { closed = true; bridge.unsubscribe(listener); }
        @Override public void onWebSocketError(Throwable failure) { bridge.unsubscribe(listener); }
    }
    @Override public void close() throws Exception {
        reaper.shutdownNow(); sessions.values().forEach(SessionBridge::close); sessions.clear();
        server.stop();
    }
}
