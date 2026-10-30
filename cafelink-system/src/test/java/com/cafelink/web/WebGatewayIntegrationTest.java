package com.cafelink.web;

import com.cafelink.server.*;
import com.google.gson.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import com.cafelink.client.NetworkClient;
import static org.junit.jupiter.api.Assertions.*;

/** Exercises real HTTP -> TCP -> Core with an isolated database; no mocked transport. */
class WebGatewayIntegrationTest {
    @TempDir Path temp;
    CafeService service;
    CafeServer core;
    WebGateway gateway;
    HttpClient browser;
    String base;

    @BeforeEach void start() throws Exception {
        service = new CafeService(temp.resolve("web.db"));
        core = new CafeServer(service, "127.0.0.1", 0, ignored -> {});
        core.start();
        gateway = new WebGateway("127.0.0.1", 0, "127.0.0.1", core.port(), temp);
        gateway.start();
        base = "http://127.0.0.1:" + gateway.port();
        browser = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();
    }
    @AfterEach void stop() throws Exception {
        if (gateway != null) gateway.close();
        if (core != null) core.close();
        if (service != null) service.close();
    }
    HttpResponse<String> get(String path) throws Exception {
        return browser.send(HttpRequest.newBuilder(URI.create(base + path)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }
    HttpResponse<String> post(String path, String json, String csrf) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(base + path)).header("Origin", base)
                .header("Content-Type", "application/json");
        if (csrf != null) request.header("X-CSRF-Token", csrf);
        return browser.send(request.POST(HttpRequest.BodyPublishers.ofString(json)).build(), HttpResponse.BodyHandlers.ofString());
    }
    static JsonObject json(HttpResponse<String> response) { return JsonParser.parseString(response.body()).getAsJsonObject(); }
    String login() throws Exception { return json(post("/api/login", "{\"username\":\"admin\",\"password\":\"CafeLink@123\"}", null)).get("csrfToken").getAsString(); }
    static final class Feed implements WebSocket.Listener {
        final BlockingQueue<JsonObject> messages = new LinkedBlockingQueue<>();
        final CompletableFuture<Integer> closed = new CompletableFuture<>();
        private final StringBuilder fragments = new StringBuilder();
        @Override public void onOpen(WebSocket socket) { socket.request(1); }
        @Override public CompletionStage<?> onText(WebSocket socket, CharSequence text, boolean last) {
            fragments.append(text);
            if (last) { messages.add(JsonParser.parseString(fragments.toString()).getAsJsonObject()); fragments.setLength(0); }
            socket.request(1); return null;
        }
        @Override public CompletionStage<?> onClose(WebSocket socket, int code, String reason) { closed.complete(code); return null; }
        JsonObject stateWithOrder() throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < deadline) {
                JsonObject value = messages.poll(100, TimeUnit.MILLISECONDS);
                if (value != null && value.has("state") && value.getAsJsonObject("state").getAsJsonArray("orders").size() > 0) return value.getAsJsonObject("state");
            }
            throw new AssertionError("No real-time order received");
        }
    }
    WebSocket subscribe(Feed feed) throws Exception {
        return browser.newWebSocketBuilder().header("Origin", base)
                .buildAsync(URI.create(base.replace("http", "ws") + "/ws/state"), feed).get(5, TimeUnit.SECONDS);
    }

    @Test void webLoginHasHttpOnlyCookieAndReadsStateThroughOwnedTcpSession() throws Exception {
        assertEquals(401, get("/api/state").statusCode());
        var login = post("/api/login", "{\"username\":\"admin\",\"password\":\"CafeLink@123\"}", null);
        assertEquals(200, login.statusCode(), login.body());
        String cookie = login.headers().firstValue("Set-Cookie").orElseThrow();
        assertTrue(cookie.contains("HttpOnly"));
        assertTrue(cookie.contains("SameSite=Strict"));
        assertFalse(login.body().contains("credential"));
        assertEquals("ADMIN", json(login).getAsJsonObject("identity").get("role").getAsString());
        var state = get("/api/state");
        assertEquals(200, state.statusCode(), state.body());
        assertEquals(6, json(state).getAsJsonArray("tables").size());
        assertEquals(8, json(state).getAsJsonArray("menu").size());
        assertEquals(1, core.connectionCount(), "HTTP requests must reuse one authenticated TCP bridge");
    }
    @Test void logoutClosesAllTabsAndInvalidatesCookie() throws Exception {
        String csrf = login(); Feed first = new Feed(), second = new Feed();
        WebSocket a = subscribe(first), b = subscribe(second);
        try {
            assertEquals(200, post("/api/logout", "{}", csrf).statusCode());
            assertEquals(401, get("/api/session").statusCode());
            assertEquals(1008, first.closed.get(3, TimeUnit.SECONDS));
            assertEquals(1008, second.closed.get(3, TimeUnit.SECONDS));
        } finally { a.abort(); b.abort(); }
    }
    @Test void writesRequireExactOriginAndCsrfAndNeverTrustClientRole() throws Exception {
        String csrf = login();
        String open = "{\"commandId\":\"forged\",\"action\":\"OPEN_TABLE\",\"data\":{\"tableId\":1}}";
        assertEquals(403, post("/api/command", open, null).statusCode());
        var forged = HttpRequest.newBuilder(URI.create(base + "/api/command")).header("Origin", "https://evil.example")
                .header("Content-Type", "application/json").header("X-CSRF-Token", csrf)
                .POST(HttpRequest.BodyPublishers.ofString(open)).build();
        assertEquals(403, browser.send(forged, HttpResponse.BodyHandlers.ofString()).statusCode());
        assertEquals("AVAILABLE", json(get("/api/state")).getAsJsonArray("tables").get(0).getAsJsonObject().get("status").getAsString());
    }
    @Test void earlyRejectionAdvertisesConnectionCloseWhenBodyHasNotArrived() throws Exception {
        // Send only headers: rejection must not wait for an attacker-controlled body,
        // and must not offer a keep-alive connection that Jetty closes afterwards.
        login();
        var cookies = (CookieManager) browser.cookieHandler().orElseThrow();
        String cookie = cookies.getCookieStore().getCookies().get(0).toString();
        assertEarlyRejection("/api/command", "https://evil.example", "", 80, 403, "ORIGIN_DENIED");
        assertEarlyRejection("/api/command", base, cookie, 80, 403, "CSRF_DENIED");
        assertEarlyRejection("/api/login", base, "", 65_537, 413, "BODY_TOO_LARGE");
    }
    private void assertEarlyRejection(String path, String origin, String cookie, int length,
                                      int status, String code) throws Exception {
        try (var socket = new Socket("127.0.0.1", gateway.port())) {
            socket.setSoTimeout(2_000);
            String headers = "POST " + path + " HTTP/1.1\r\nHost: 127.0.0.1:" + gateway.port()
                    + "\r\nOrigin: " + origin + "\r\nCookie: " + cookie
                    + "\r\nContent-Type: application/json\r\nContent-Length: " + length + "\r\n\r\n";
            socket.getOutputStream().write(headers.getBytes(StandardCharsets.US_ASCII));
            socket.getOutputStream().flush();
            String response = readHttpHeaders(socket.getInputStream());
            assertTrue(response.startsWith("HTTP/1.1 " + status), response);
            assertTrue(response.toLowerCase(Locale.ROOT).contains("\r\nconnection: close\r\n"), response);
            int contentLength = response.lines().filter(line -> line.toLowerCase(Locale.ROOT).startsWith("content-length:"))
                    .map(line -> Integer.parseInt(line.substring(line.indexOf(':') + 1).trim())).findFirst().orElseThrow();
            String body = new String(socket.getInputStream().readNBytes(contentLength), StandardCharsets.UTF_8);
            assertEquals(code, JsonParser.parseString(body).getAsJsonObject().get("code").getAsString());
            assertEquals(-1, socket.getInputStream().read(), "Server must close after its complete error response");
        }
    }
    @Test void rejectedBodiesDoNotPoisonSubsequentAuthenticatedRequests() throws Exception {
        String csrf = login();
        String command = "{\"commandId\":\"denied\",\"action\":\"OPEN_TABLE\",\"data\":{\"tableId\":1}}";
        for (int attempt = 0; attempt < 12; attempt++) {
            assertEquals(403, post("/api/command", command, null).statusCode());
            var request = HttpRequest.newBuilder(URI.create(base + "/api/command"))
                    .header("Origin", "https://evil.example").header("X-CSRF-Token", csrf)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(command)).build();
            assertEquals(403, browser.send(request, HttpResponse.BodyHandlers.ofString()).statusCode());
            var state = get("/api/state");
            assertEquals(200, state.statusCode(), state.body());
            assertEquals("AVAILABLE", json(state).getAsJsonArray("tables").get(0).getAsJsonObject().get("status").getAsString());
        }
    }
    private static String readHttpHeaders(InputStream input) throws Exception {
        var bytes = new ByteArrayOutputStream();
        while (bytes.size() < 16_384) {
            int next = input.read();
            if (next < 0) throw new AssertionError("Connection closed before HTTP response headers");
            bytes.write(next);
            if (next == '\n') {
                String text = bytes.toString(StandardCharsets.US_ASCII);
                if (text.endsWith("\r\n\r\n")) return text;
            }
        }
        throw new AssertionError("HTTP response headers exceeded test bound");
    }
    @Test void guestPasswordCannotBecomeAWebSession() throws Exception {
        var denied = post("/api/login", "{\"username\":\"ban1\",\"password\":\"Ban1@123\",\"role\":\"ADMIN\"}", null);
        assertEquals(403, denied.statusCode()); assertEquals("QR_REQUIRED", json(denied).get("code").getAsString());
        assertEquals(401, get("/api/state").statusCode());
        assertTrue(denied.headers().allValues("Set-Cookie").isEmpty());
    }
    @Test void badPasswordAndMalformedRequestsHaveBoundedExplicitErrors() throws Exception {
        assertEquals(401, post("/api/login", "{\"username\":\"admin\",\"password\":\"bad\"}", null).statusCode());
        assertEquals(400, post("/api/login", "not-json", null).statusCode());
        assertEquals(413, post("/api/login", " ".repeat(65537), null).statusCode());
        assertEquals(401, get("/api/session").statusCode());
    }
    @Test void duplicateConcurrentHttpCommandsRetainOneCoreReceipt() throws Exception {
        String csrf = login();
        String payload = "{\"commandId\":\"open-once\",\"action\":\"OPEN_TABLE\",\"data\":{\"tableId\":1}}";
        var requests = new ArrayList<CompletableFuture<HttpResponse<String>>>();
        for (int i = 0; i < 8; i++) {
            var request = HttpRequest.newBuilder(URI.create(base + "/api/command")).header("Origin", base)
                    .header("Content-Type", "application/json").header("X-CSRF-Token", csrf)
                    .POST(HttpRequest.BodyPublishers.ofString(payload)).build();
            requests.add(browser.sendAsync(request, HttpResponse.BodyHandlers.ofString()));
        }
        String visit = null;
        for (var request : requests) {
            var result = request.get(8, TimeUnit.SECONDS); assertEquals(200, result.statusCode(), result.body());
            String returned = json(result).get("visitId").getAsString();
            if (visit == null) visit = returned; else assertEquals(visit, returned);
        }
        var conflict = post("/api/command", payload.replace("\"tableId\":1", "\"tableId\":2"), csrf);
        assertEquals(409, conflict.statusCode()); assertEquals("COMMAND_CONFLICT", json(conflict).get("code").getAsString());
        var outcome = post("/api/command", "{\"commandId\":\"lookup\",\"action\":\"GET_OUTCOME\",\"data\":{\"commandId\":\"open-once\"}}", csrf);
        assertEquals(visit, json(outcome).getAsJsonObject("result").get("visitId").getAsString());
        assertEquals(1, core.connectionCount());
    }
    @Test void orderCommittedByIndependentTcpClientArrivesOnBothWebTabs() throws Exception {
        String csrf = login();
        var opened = post("/api/command", "{\"commandId\":\"open\",\"action\":\"OPEN_TABLE\",\"data\":{\"tableId\":1}}", csrf);
        String visit = json(opened).get("visitId").getAsString();
        Feed first = new Feed(), second = new Feed(); WebSocket a = subscribe(first), b = subscribe(second);
        try (NetworkClient guest = new NetworkClient("127.0.0.1", core.port())) {
            guest.login("ban1", "Ban1@123");
            guest.requestWithId("order-web-push", "PLACE_ORDER", JsonParser.parseString("{\"visitId\":\"" + visit + "\",\"items\":[{\"menuId\":2,\"quantity\":2}]}").getAsJsonObject());
            assertEquals(60000, first.stateWithOrder().getAsJsonArray("orders").get(0).getAsJsonObject().get("totalVnd").getAsLong());
            assertEquals(60000, second.stateWithOrder().getAsJsonArray("orders").get(0).getAsJsonObject().get("totalVnd").getAsLong());
            assertEquals(2, core.connectionCount(), "Two web tabs still share one Core connection");
        } finally { a.abort(); b.abort(); }
    }
    @Test void websocketRejectsMissingSessionAndForeignOrigin() throws Exception {
        var noSession = HttpClient.newHttpClient().newWebSocketBuilder().header("Origin", base)
                .buildAsync(URI.create(base.replace("http", "ws") + "/ws/state"), new Feed());
        ExecutionException denied = assertThrows(ExecutionException.class, () -> noSession.get(5, TimeUnit.SECONDS));
        assertEquals(401, ((WebSocketHandshakeException) denied.getCause()).getResponse().statusCode());
        login();
        var foreign = browser.newWebSocketBuilder().header("Origin", "https://evil.example")
                .buildAsync(URI.create(base.replace("http", "ws") + "/ws/state"), new Feed());
        ExecutionException wrongOrigin = assertThrows(ExecutionException.class, () -> foreign.get(5, TimeUnit.SECONDS));
        assertEquals(403, ((WebSocketHandshakeException) wrongOrigin.getCause()).getResponse().statusCode());
    }
    @Test void tcpDisconnectIsReportedWithoutAutomaticMutationReplay() throws Exception {
        login(); core.close();
        var response = get("/api/state"); assertEquals(503, response.statusCode());
        assertEquals("CORE_UNAVAILABLE", json(response).get("code").getAsString());
        assertFalse(json(get("/api/session")).get("connected").getAsBoolean());
    }
    @Test void webSessionAdmissionIsBounded() throws Exception {
        for (int i = 0; i < 16; i++) {
            browser = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();
            assertEquals(200, post("/api/login", "{\"username\":\"admin\",\"password\":\"CafeLink@123\"}", null).statusCode());
        }
        browser = HttpClient.newHttpClient();
        assertEquals(503, post("/api/login", "{\"username\":\"admin\",\"password\":\"CafeLink@123\"}", null).statusCode());
        assertEquals(16, core.connectionCount());
    }
    @Test void staticFilesCannotEscapeBuildDirectoryAndSpaRoutesWork() throws Exception {
        Files.writeString(temp.resolve("index.html"), "<html>V0 web</html>");
        assertEquals("<html>V0 web</html>", get("/admin").body());
        assertTrue(Set.of(400, 404).contains(get("/%2e%2e/pom.xml").statusCode()), "Jetty may reject encoded traversal before the handler");
        assertEquals(404, get("/missing.js").statusCode());
        assertEquals(200, get("/api/health").statusCode());
    }
}
