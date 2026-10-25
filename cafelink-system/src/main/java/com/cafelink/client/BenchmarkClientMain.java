package com.cafelink.client;

import com.cafelink.common.*;
import com.google.gson.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.LockSupport;

/** Client-only measured workload. The launcher owns an isolated server JVM/database. */
public final class BenchmarkClientMain {
    private BenchmarkClientMain() { }
    private record Sample(String sampleId, int client, String action, String outcome, double latencyMs,
                          double startedMs, double endedMs, String commandId) { }
    public static void main(String[] args) throws Exception {
        Arguments options = new Arguments(args);
        int count = options.integer("clients", 5), duration = options.integer("duration-seconds", 60), warmup = options.integer("warmup-seconds", 10), period = options.integer("period-ms", 1000);
        if (count < 1 || count > 20 || duration < 1 || duration > 600 || warmup < 0 || warmup > 60 || period < 50 || period > 10000) throw new IllegalArgumentException("Invalid benchmark settings");
        String host = options.get("host", "127.0.0.1"); int port = options.integer("port", 5050);
        Path output = Path.of(options.get("output", "target/benchmark-client-" + UUID.randomUUID())).toAbsolutePath();
        Files.createDirectories(output.getParent()); Files.createDirectory(output);
        JsonObject config = new JsonObject(); config.addProperty("clients", count); config.addProperty("durationSeconds", duration); config.addProperty("warmupSeconds", warmup); config.addProperty("periodMillis", period);
        config.addProperty("mix", "Every fifth slot PLACE_ORDER (one milk coffee 30000 VND); other slots GET_STATE. One worker/socket/journal per guest, six tables.");
        config.addProperty("java", System.getProperty("java.version")); config.addProperty("startedAtUtc", Instant.now().toString());
        Files.writeString(output.resolve("config.json"), Json.GSON.toJson(config));
        List<NetworkClient> clients = new ArrayList<>(); List<String> visits = new ArrayList<>();
        Queue<Sample> samples = new ConcurrentLinkedQueue<>(); Set<Long> acceptedOrders = ConcurrentHashMap.newKeySet();
        ExecutorService workers = Executors.newFixedThreadPool(count);
        try (NetworkClient owner = new NetworkClient(host, port)) {
            owner.login("admin", "CafeLink@123");
            for (int table = 1; table <= 6; table++) {
                JsonObject data = new JsonObject(); data.addProperty("tableId", table); visits.add(owner.request("OPEN_TABLE", data).get("visitId").getAsString());
            }
            for (int index = 0; index < count; index++) {
                int table = index % 6 + 1; NetworkClient client = new NetworkClient(host, port, output.resolve("private-journals/guest-" + index + ".json")); clients.add(client); client.login("ban" + table, "Ban" + table + "@123");
            }
            long start = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(100), measuredStart = start + TimeUnit.SECONDS.toNanos(warmup), end = measuredStart + TimeUnit.SECONDS.toNanos(duration);
            String measuredStartUtc = Instant.now().plusNanos(measuredStart - System.nanoTime()).toString();
            List<Future<?>> futures = new ArrayList<>();
            for (int index = 0; index < count; index++) {
                final int slot = index; NetworkClient client = clients.get(index); String visit = visits.get(index % 6);
                futures.add(workers.submit(() -> runWorker(client, visit, slot, count, period, start, measuredStart, end, samples, acceptedOrders)));
            }
            until(measuredStart);
            long byteCaptureStart = System.nanoTime(); List<NetworkClient.Traffic> before = clients.stream().map(NetworkClient::traffic).toList();
            for (Future<?> future : futures) future.get(Math.max(10, duration + 10), TimeUnit.SECONDS);
            long finished = System.nanoTime(); List<NetworkClient.Traffic> after = clients.stream().map(NetworkClient::traffic).toList();
            var state = owner.refresh();
            List<Sample> raw = samples.stream().sorted(Comparator.comparingDouble(Sample::startedMs).thenComparingInt(Sample::client)).toList();
            List<String> csv = new ArrayList<>(); csv.add("sampleId,client,action,outcome,latencyMs,startedMs,endedMs,commandId");
            for (Sample row : raw) csv.add(String.format(Locale.ROOT, "%s,%d,%s,%s,%.6f,%.6f,%.6f,%s", row.sampleId(), row.client(), row.action(), row.outcome(), row.latencyMs(), row.startedMs(), row.endedMs(), row.commandId()));
            Files.write(output.resolve("requests.csv"), csv);
            long successes = raw.stream().filter(row -> row.outcome().equals("OK")).count(), total = state.orders().stream().mapToLong(o -> o.totalVnd()).sum();
            JsonObject summary = new JsonObject(); boolean reconciled = state.orders().size() == acceptedOrders.size() && total == acceptedOrders.size() * 30000L;
            summary.addProperty("status", successes == raw.size() && reconciled ? "PASS" : "FAIL"); summary.addProperty("clients", count);
            summary.addProperty("requests", raw.size()); summary.addProperty("successes", successes); summary.addProperty("errors", raw.size() - successes);
            summary.addProperty("durationSeconds", duration); summary.addProperty("measurementStartUtc", measuredStartUtc);
            summary.addProperty("elapsedIncludingDrainSeconds", (Math.max(end, finished) - measuredStart) / 1_000_000_000.0);
            summary.addProperty("byteCaptureStartOffsetMs", (byteCaptureStart - measuredStart) / 1_000_000.0);
            summary.addProperty("completedRequestsPerSecond", successes / ((Math.max(end, finished) - measuredStart) / 1_000_000_000.0));
            long sent = 0, received = 0; for (int i = 0; i < count; i++) { sent += after.get(i).sentBytes() - before.get(i).sentBytes(); received += after.get(i).receivedBytes() - before.get(i).receivedBytes(); }
            summary.addProperty("sentBytes", sent); summary.addProperty("receivedBytes", received);
            summary.addProperty("trafficScope", "Guest application bytes including four-byte frame headers/events/heartbeats, capture after warmup through drain; excludes owner and TCP/IP headers, failed partial writes may be uncounted.");
            summary.addProperty("persistedOrders", state.orders().size()); summary.addProperty("persistedTotalVnd", total); summary.addProperty("reconciled", reconciled);
            long journalBytes; try (var files = Files.walk(output.resolve("private-journals"))) { journalBytes = files.filter(path -> path.toString().endsWith(".json")).mapToLong(path -> { try { return Files.size(path); } catch (java.io.IOException e) { throw new java.io.UncheckedIOException(e); } }).sum(); }
            summary.addProperty("journalBytes", journalBytes); summary.addProperty("errorsIncludeTimeouts", true);
            Files.writeString(output.resolve("summary.json"), Json.GSON.toJson(summary)); System.out.println(Json.GSON.toJson(summary));
            if (!summary.get("status").getAsString().equals("PASS")) throw new IllegalStateException("Workload failed; keep raw data at " + output);
        } finally { workers.shutdownNow(); for (NetworkClient client : clients) client.close(); }
    }
    private static void runWorker(NetworkClient client, String visit, int index, int count, int periodMs, long start, long measuredStart, long end, Queue<Sample> samples, Set<Long> acceptedOrders) {
        long period = TimeUnit.MILLISECONDS.toNanos(periodMs), offset = period * index / count;
        for (int slot = 0; ; slot++) {
            long scheduled = start + offset + period * slot; if (scheduled >= end || Thread.currentThread().isInterrupted()) return;
            until(scheduled); if (System.nanoTime() >= end) return;
            String action = slot % 5 == 0 ? "PLACE_ORDER" : "GET_STATE", outcome = "OK", sampleId = UUID.randomUUID().toString(), commandId = sampleId;
            long began = System.nanoTime();
            try {
                if (action.equals("PLACE_ORDER")) {
                    JsonObject data = JsonParser.parseString("{\"items\":[{\"menuId\":2,\"quantity\":1}]}").getAsJsonObject(); data.addProperty("visitId", visit);
                    acceptedOrders.add(client.request(action, data).get("orderId").getAsLong());
                } else client.requestWithId(sampleId, action, new JsonObject());
            } catch (RemoteException e) { outcome = e.code(); }
            catch (Exception e) { outcome = e.getClass().getSimpleName(); }
            long ended = System.nanoTime();
            if (action.equals("PLACE_ORDER")) { List<Outbox.Entry> entries = client.recoveryEntries(); if (!entries.isEmpty()) commandId = entries.get(entries.size() - 1).id(); }
            if (began >= measuredStart) samples.add(new Sample(sampleId, index, action, outcome, (ended - began) / 1_000_000.0, (began - measuredStart) / 1_000_000.0, (ended - measuredStart) / 1_000_000.0, commandId));
        }
    }
    private static void until(long deadline) {
        while (!Thread.currentThread().isInterrupted()) { long remaining = deadline - System.nanoTime(); if (remaining <= 0) return; LockSupport.parkNanos(remaining); }
    }
}
