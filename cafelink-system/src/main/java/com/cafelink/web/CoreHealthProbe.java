package com.cafelink.web;

import com.cafelink.common.FrameCodec;
import com.cafelink.common.Message;
import com.google.gson.JsonObject;

import java.io.IOException;
import java.io.FilterInputStream;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/** Bounded, single-flight, read-only dependency probe over the real TCP protocol. */
final class CoreHealthProbe {
    private static final int TIMEOUT_MS = 500;
    private static final long CACHE_NANOS = TimeUnit.SECONDS.toNanos(1);
    private final String host;
    private final int port;
    private Result cached;

    record Result(String core, String database, String reason, String checkedAt, long sampledAt) {
        boolean ready() { return core.equals("UP") && database.equals("UP"); }

        Map<String, Object> payload(String version) {
            return Map.of("status", ready() ? "READY" : "NOT_READY", "gateway", "UP",
                    "core", core, "database", database, "reason", reason,
                    "version", version, "checkedAt", checkedAt);
        }
    }

    CoreHealthProbe(String host, int port) { this.host = host; this.port = port; }

    synchronized Result check() {
        if (cached != null && System.nanoTime() - cached.sampledAt() < CACHE_NANOS) return cached;
        cached = sample();
        return cached;
    }

    private Result sample() {
        try (Socket socket = new Socket()) {
            long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(TIMEOUT_MS);
            socket.connect(new InetSocketAddress(host, port), TIMEOUT_MS);
            socket.setSoTimeout(TIMEOUT_MS);
            String id = UUID.randomUUID().toString();
            FrameCodec.write(socket.getOutputStream(), Message.request(id, "HEALTH_CHECK", new JsonObject()));
            Message response = FrameCodec.read(deadlineInput(socket, deadline));
            if (response == null || !"RESPONSE".equals(response.kind()) || !id.equals(response.requestId())
                    || !"HEALTH_CHECK".equals(response.action())) return result("UNAVAILABLE", "UNKNOWN", "INVALID_RESPONSE");
            if (!response.ok()) {
                return "DATABASE_ERROR".equals(response.errorCode())
                        ? result("UP", "UNAVAILABLE", "DATABASE_UNAVAILABLE")
                        : result("UNAVAILABLE", "UNKNOWN", "PROBE_REJECTED");
            }
            JsonObject data = response.data();
            if (data == null || !data.has("database") || !"UP".equals(data.get("database").getAsString()))
                return result("UNAVAILABLE", "UNKNOWN", "INVALID_RESPONSE");
            return result("UP", "UP", "OK");
        } catch (IOException | RuntimeException failure) {
            // No paths, SQL, connection details, credentials or exception text in a public response.
            return result("UNAVAILABLE", "UNKNOWN", "CORE_UNAVAILABLE");
        }
    }

    private static InputStream deadlineInput(Socket socket, long deadline) throws IOException {
        return new FilterInputStream(socket.getInputStream()) {
            private void remainingTimeout() throws IOException {
                long remaining = deadline - System.nanoTime();
                if (remaining <= 0) throw new SocketTimeoutException("Dependency probe deadline exceeded");
                socket.setSoTimeout((int) Math.max(1, TimeUnit.NANOSECONDS.toMillis(remaining)));
            }
            @Override public int read() throws IOException {
                remainingTimeout();
                return in.read();
            }
            @Override public int read(byte[] bytes, int offset, int length) throws IOException {
                remainingTimeout();
                return in.read(bytes, offset, length);
            }
        };
    }

    private static Result result(String core, String database, String reason) {
        return new Result(core, database, reason, Instant.now().toString(), System.nanoTime());
    }
}
