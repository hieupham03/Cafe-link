package com.cafelink.web;

import com.cafelink.client.NetworkClient;
import com.cafelink.client.RemoteException;
import com.cafelink.server.CafeServer;
import com.cafelink.server.CafeService;
import com.cafelink.server.QrConfig;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

import java.net.*;
import java.net.http.*;
import java.nio.file.Path;
import java.time.Clock;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class DiagnosticsIntegrationTest {
    @TempDir Path temp;
    CafeService service;
    CafeServer core;
    WebGateway gateway;
    HttpClient browser;

    @BeforeEach void start() throws Exception {
        service = new CafeService(temp.resolve("diagnostics.db"), new QrConfig(new byte[32], Clock.systemUTC()));
        core = new CafeServer(service, "127.0.0.1", 0, ignored -> {});
        core.start();
        gateway = new WebGateway("127.0.0.1", 0, "127.0.0.1", core.port(), temp);
        gateway.start();
        browser = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();
    }

    @AfterEach void stop() throws Exception { gateway.close(); core.close(); service.close(); }

    HttpResponse<String> get() throws Exception {
        return browser.send(HttpRequest.newBuilder(URI.create(gateway.origin() + "/api/admin/diagnostics"))
                .GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    void login(String user, String password) throws Exception {
        var body = new JsonObject(); body.addProperty("username", user); body.addProperty("password", password);
        var response = browser.send(HttpRequest.newBuilder(URI.create(gateway.origin() + "/api/login"))
                .header("Origin", gateway.origin()).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString())).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(), response.body());
    }

    JsonObject diagnostics() throws Exception {
        var response = get(); assertEquals(200, response.statusCode(), response.body());
        return JsonParser.parseString(response.body()).getAsJsonObject();
    }

    String tableGrant() throws Exception {
        try (NetworkClient owner = new NetworkClient("127.0.0.1", core.port())) {
            owner.login("admin", "CafeLink@123");
            owner.request("OPEN_ALL_TABLES", new JsonObject());
            return owner.request("GET_TABLE_QR", JsonParser.parseString("{\"tableId\":1}").getAsJsonObject()).get("grant").getAsString();
        }
    }

    NetworkClient guest() throws Exception {
        String grant = tableGrant();
        NetworkClient guest = new NetworkClient("127.0.0.1", core.port());
        try { guest.joinTable(grant); return guest; }
        catch (Exception failure) { guest.close(); throw failure; }
    }

    @Test void onlyAnAuthenticatedAdminCanReadDiagnostics() throws Exception {
        assertEquals(401, get().statusCode());
        var join = new JsonObject(); join.addProperty("grant", tableGrant()); join.addProperty("table", true);
        var response = browser.send(HttpRequest.newBuilder(URI.create(gateway.origin() + "/api/guest/join"))
                .header("Origin", gateway.origin()).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(join.toString())).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(), response.body());
        assertEquals(403, get().statusCode());
        try (NetworkClient guest = guest()) {
            assertEquals("FORBIDDEN", assertThrows(RemoteException.class,
                    () -> guest.request("GET_DIAGNOSTICS", new JsonObject())).code());
        }
    }

    @Test void countersAreRealAndObservingThemDoesNotAddRequests() throws Exception {
        login("admin", "CafeLink@123");
        var first = diagnostics();
        var second = diagnostics();
        assertTrue(first.getAsJsonObject("core").get("requests").getAsLong() > 0);
        assertEquals(first.getAsJsonObject("core").get("requests"), second.getAsJsonObject("core").get("requests"));
        assertEquals("READY", first.getAsJsonObject("readiness").get("status").getAsString());
        assertEquals(1, first.getAsJsonObject("gateway").get("adminSessions").getAsInt());
        assertTrue(first.getAsJsonObject("core").get("authenticatedConnections").getAsInt() >= 1);
        assertTrue(first.getAsJsonObject("jvm").get("heapUsedBytes").getAsLong() > 0);
    }

    @Test void boundedTraceDoesNotContainPayloadsCredentialsOrArbitraryIds() throws Exception {
        login("admin", "CafeLink@123");
        String publicId = UUID.randomUUID().toString();
        try (NetworkClient owner = new NetworkClient("127.0.0.1", core.port())) {
            owner.login("admin", "CafeLink@123");
            var privateData = new JsonObject(); privateData.addProperty("note", "private-note-do-not-log");
            owner.requestWithId(publicId, "GET_STATE", privateData);
            owner.requestWithId("secret-in-custom-id", "GET_STATE", new JsonObject());
            assertThrows(RemoteException.class, () -> owner.request("PRIVATE_SECRET_IN_ACTION", new JsonObject()));
            var response = diagnostics();
            String text = response.toString();
            assertTrue(text.contains(publicId));
            for (String secret : new String[]{"private-note-do-not-log", "secret-in-custom-id", "CafeLink@123",
                    "credential", "csrfToken", "qr-key", "diagnostics.db", "PRIVATE_SECRET_IN_ACTION"}) assertFalse(text.contains(secret), secret);
            for (int index = 0; index < 110; index++) owner.request("GET_STATE", new JsonObject());
            var recent = diagnostics().getAsJsonObject("core").getAsJsonArray("recent");
            assertEquals(100, recent.size());
        }
    }

    @Test void errorsAppearInTheTraceAndCounters() throws Exception {
        login("admin", "CafeLink@123");
        try (NetworkClient guest = guest()) {
            String id = UUID.randomUUID().toString();
            assertThrows(RemoteException.class, () -> guest.requestWithId(id, "NOT_A_REAL_ACTION", new JsonObject()));
            var coreData = diagnostics().getAsJsonObject("core");
            assertTrue(coreData.get("errors").getAsLong() >= 1);
            var row = coreData.getAsJsonArray("recent").asList().stream().map(value -> value.getAsJsonObject())
                    .filter(value -> value.get("requestId").getAsString().equals(id)).findFirst().orElseThrow();
            assertEquals("UNKNOWN_ACTION", row.get("outcome").getAsString());
            assertTrue(row.get("durationMs").getAsDouble() >= 0);
        }
    }
}
