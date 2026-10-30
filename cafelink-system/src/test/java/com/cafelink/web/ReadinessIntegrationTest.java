package com.cafelink.web;

import com.cafelink.common.FrameCodec;
import com.cafelink.common.Message;
import com.cafelink.server.CafeServer;
import com.cafelink.server.CafeService;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

import java.net.*;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.http.*;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;

/** Readiness must exercise real HTTP, TCP framing and an actual SQLite query. */
class ReadinessIntegrationTest {
    @TempDir Path temp;
    CafeService service;
    CafeServer core;
    WebGateway gateway;
    final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();

    @BeforeEach void start() throws Exception {
        service = new CafeService(temp.resolve("readiness.db"));
        core = new CafeServer(service, "127.0.0.1", 0, ignored -> {});
        core.start();
        startGateway(core.port());
    }

    void startGateway(int port) throws Exception {
        gateway = new WebGateway("127.0.0.1", 0, "127.0.0.1", port, temp);
        gateway.start();
    }

    @AfterEach void close() throws Exception {
        if (gateway != null) gateway.close();
        if (core != null) core.close();
        if (service != null) service.close();
    }

    HttpResponse<String> get(String path) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create(gateway.origin() + path))
                .timeout(Duration.ofSeconds(3)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test void readyChecksCoreAndDatabaseWithoutCreatingAWebSession() throws Exception {
        var response = get("/api/ready");
        assertEquals(200, response.statusCode(), response.body());
        var value = JsonParser.parseString(response.body()).getAsJsonObject();
        assertEquals("READY", value.get("status").getAsString());
        assertEquals("UP", value.get("core").getAsString());
        assertEquals("UP", value.get("database").getAsString());
        assertFalse(value.get("version").getAsString().isBlank());
        assertTrue(response.headers().firstValue("Set-Cookie").isEmpty());
        assertEquals(401, get("/api/session").statusCode());
        assertFalse(response.body().contains("readiness.db"));
        assertFalse(response.body().contains("credential"));
    }

    @Test void gatewayStaysLiveButIsNotReadyWhenCoreStops() throws Exception {
        core.close();
        assertEquals(200, get("/api/health").statusCode());
        var response = get("/api/ready");
        assertEquals(503, response.statusCode(), response.body());
        assertEquals("NOT_READY", JsonParser.parseString(response.body()).getAsJsonObject().get("status").getAsString());
    }

    @Test void databaseFailureCannotBeReportedAsReady() throws Exception {
        service.close();
        var response = get("/api/ready");
        assertEquals(503, response.statusCode(), response.body());
        var value = JsonParser.parseString(response.body()).getAsJsonObject();
        assertEquals("UP", value.get("core").getAsString());
        assertEquals("UNAVAILABLE", value.get("database").getAsString());
        assertFalse(response.body().contains("SQLException"));
    }

    @Test void silentTcpPeerHasABoundedReadinessTimeout() throws Exception {
        gateway.close();
        try (ServerSocket silent = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            startGateway(silent.getLocalPort());
            long started = System.nanoTime();
            var response = get("/api/ready");
            long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
            assertEquals(503, response.statusCode(), response.body());
            assertTrue(elapsedMs < 2000, "Readiness stalled: " + elapsedMs + " ms");
            silent.setSoTimeout(1000);
            try (Socket accepted = silent.accept()) {
                assertEquals("HEALTH_CHECK", FrameCodec.read(accepted.getInputStream()).action());
            }
        }
    }

    @Test void aTcpListenerWithoutTheExpectedProtocolIsNotReady() throws Exception {
        gateway.close();
        try (ServerSocket listener = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            var peer = CompletableFuture.runAsync(() -> {
                try (Socket socket = listener.accept()) {
                    socket.getOutputStream().write(new byte[]{0, 0, 0, 0});
                } catch (Exception failure) { throw new CompletionException(failure); }
            });
            startGateway(listener.getLocalPort());
            assertEquals(503, get("/api/ready").statusCode());
            peer.get(2, TimeUnit.SECONDS);
        }
    }

    @Test void slowlyTrickledResponseCannotExtendTheProbeDeadline() throws Exception {
        gateway.close();
        var worker = Executors.newSingleThreadExecutor();
        try (ServerSocket listener = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            var peer = worker.submit(() -> {
                try (Socket socket = listener.accept()) {
                    Message request = FrameCodec.read(socket.getInputStream());
                    var data = JsonParser.parseString("{\"database\":\"UP\"}").getAsJsonObject();
                    var bytes = new ByteArrayOutputStream();
                    FrameCodec.write(bytes, Message.success(request, data));
                    for (byte value : bytes.toByteArray()) {
                        socket.getOutputStream().write(value);
                        socket.getOutputStream().flush();
                        Thread.sleep(70);
                    }
                } catch (IOException expectedClose) {
                    // A bounded probe closes its socket while the fake peer is still trickling.
                } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
                return null;
            });
            startGateway(listener.getLocalPort());
            long started = System.nanoTime();
            assertEquals(503, get("/api/ready").statusCode());
            assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 2000);
            peer.get(2, TimeUnit.SECONDS);
        } finally { worker.shutdownNow(); }
    }

    @Test void readinessRequiresTheResponseToMatchItsRequest() throws Exception {
        gateway.close();
        try (ServerSocket listener = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            var peer = CompletableFuture.runAsync(() -> {
                try (Socket socket = listener.accept()) {
                    FrameCodec.read(socket.getInputStream());
                    var request = Message.request("wrong-request", "HEALTH_CHECK", new com.google.gson.JsonObject());
                    FrameCodec.write(socket.getOutputStream(), Message.success(request,
                            JsonParser.parseString("{\"database\":\"UP\"}").getAsJsonObject()));
                } catch (IOException failure) { throw new CompletionException(failure); }
            });
            startGateway(listener.getLocalPort());
            assertEquals(503, get("/api/ready").statusCode());
            peer.get(2, TimeUnit.SECONDS);
        }
    }

    @Test void frequentReadinessRequestsReuseTheCachedResult() throws Exception {
        var first = get("/api/ready");
        assertEquals(200, first.statusCode());
        assertEquals(first.body(), get("/api/ready").body());
        assertEquals(first.body(), get("/api/ready").body());
    }
}
