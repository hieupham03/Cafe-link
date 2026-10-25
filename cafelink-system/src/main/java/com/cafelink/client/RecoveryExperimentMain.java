package com.cafelink.client;

import com.cafelink.common.*;
import com.cafelink.server.*;
import com.google.gson.*;
import java.io.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

/** Controlled outage campaign over loopback TCP. Each case owns its DB/sockets/journal. */
public final class RecoveryExperimentMain {
    private RecoveryExperimentMain() { }
    private record Case(NetworkClient.RecoveryPolicy policy, String scenario, int repetition, int offlineSeconds) {
        String name() { return policy + "-" + scenario + "-delay" + offlineSeconds + "-run" + repetition; }
    }
    public static void main(String[] args) throws Exception {
        Arguments options = new Arguments(args); int repetitions = options.integer("repetitions", 3), parallelism = options.integer("parallelism", 1);
        int[] delays = Arrays.stream(options.get("offline-seconds", "0").split(",")).mapToInt(Integer::parseInt).toArray();
        if (repetitions < 1 || repetitions > 100 || parallelism < 1 || parallelism > 8 || delays.length == 0 || Arrays.stream(delays).anyMatch(n -> n < 0 || n > 120) || Arrays.stream(delays).distinct().count() != delays.length) throw new IllegalArgumentException("Invalid campaign configuration");
        long seed = Long.parseLong(options.get("seed", "20261020"));
        Path output = Path.of(options.get("output", "target/recovery-experiment-" + UUID.randomUUID())).toAbsolutePath(); Files.createDirectories(output.getParent()); Files.createDirectory(output);
        List<Case> cases = new ArrayList<>();
        for (var policy : NetworkClient.RecoveryPolicy.values()) for (String scenario : List.of("NORMAL", "LOST_ORDER_ACK", "UNACCEPTED_ORDER", "UNACCEPTED_SERVICE", "LOST_SERVICE_ACK", "VISIT_CHANGED")) for (int delay : delays) for (int run = 1; run <= repetitions; run++) cases.add(new Case(policy, scenario, run, delay));
        Collections.shuffle(cases, new Random(seed));
        JsonObject metadata = new JsonObject(); metadata.addProperty("status", "RUNNING"); metadata.addProperty("cases", cases.size()); metadata.addProperty("repetitions", repetitions); metadata.addProperty("parallelism", parallelism); metadata.addProperty("seed", seed);
        metadata.add("offlineSeconds", Json.GSON.toJsonTree(delays)); metadata.addProperty("capturedAtUtc", Instant.now().toString()); metadata.addProperty("java", System.getProperty("java.version")); metadata.addProperty("os", System.getProperty("os.name") + " " + System.getProperty("os.version")); metadata.addProperty("availableProcessors", Runtime.getRuntime().availableProcessors());
        metadata.addProperty("network", "loopback TCP; cases isolated, server/client sockets in same JVM; offline is deliberate no-client period, not physical packet loss");
        metadata.addProperty("measurement", "recoveryMs includes reconnect/password authentication/journal I/O/snapshot/reconciliation, excludes offline wait; traffic includes both guest connections/authentication; parallel cases are correctness campaign, not latency load benchmark");
        Files.writeString(output.resolve("metadata.json"), Json.GSON.toJson(metadata));
        ExecutorService workers = Executors.newFixedThreadPool(parallelism); List<Future<Boolean>> futures = new ArrayList<>();
        int failed = 0;
        try (BufferedWriter writer = Files.newBufferedWriter(output.resolve("results.csv"))) {
            writer.write("policy,scenario,repetition,scheduledOfflineSeconds,actualOfflineMs,status,orders,tickets,duplicateOrders,wrongVisitEffects,unconfirmedServiceTickets,resolved,confirmationRequired,recoveryMs,sentBytes,receivedBytes,journalBytes,databaseBytes,caseFolder"); writer.newLine(); writer.flush();
            for (Case test : cases) futures.add(workers.submit(() -> {
                String row; boolean success;
                try { row = runCase(output, test); success = true; }
                catch (Exception error) {
                    Path folder = output.resolve(test.name()); Files.createDirectories(folder);
                    JsonObject failure = new JsonObject(); failure.addProperty("status", "FAIL"); failure.addProperty("exception", error.getClass().getSimpleName()); failure.addProperty("scenario", test.scenario());
                    Files.writeString(folder.resolve("failure.json"), Json.GSON.toJson(failure));
                    row = test.policy() + "," + test.scenario() + "," + test.repetition() + "," + test.offlineSeconds() + ",,FAIL,,,,,,,,,,,,," + test.name(); success = false;
                }
                synchronized (writer) { writer.write(row); writer.newLine(); writer.flush(); }
                System.out.println("RECOVERY " + (success ? "PASS " : "FAIL ") + test.name()); return success;
            }));
            for (Future<Boolean> future : futures) if (!future.get()) failed++;
        } finally { workers.shutdownNow(); }
        metadata.addProperty("status", failed == 0 ? "PASS" : "FAIL"); metadata.addProperty("failed", failed); metadata.addProperty("completedAtUtc", Instant.now().toString()); Files.writeString(output.resolve("metadata.json"), Json.GSON.toJson(metadata));
        System.out.println(Json.GSON.toJson(metadata)); System.out.println("Evidence: " + output);
        if (failed > 0) throw new IllegalStateException(failed + " recovery cases failed; raw data retained");
    }
    private static String runCase(Path output, Case test) throws Exception {
        Path folder = output.resolve(test.name()); Files.createDirectory(folder);
        String scenario = test.scenario();
        boolean order = Set.of("NORMAL", "LOST_ORDER_ACK", "UNACCEPTED_ORDER").contains(scenario);
        FaultInjector fault = scenario.startsWith("LOST_") ? FaultInjector.once(FaultInjector.Point.AFTER_COMMIT, order ? "PLACE_ORDER" : "CALL_SERVICE") :
                Set.of("UNACCEPTED_ORDER", "UNACCEPTED_SERVICE", "VISIT_CHANGED").contains(scenario) ? FaultInjector.once(FaultInjector.Point.BEFORE_ACCEPT, order ? "PLACE_ORDER" : "CALL_SERVICE") : FaultInjector.NONE;
        List<String> log = Collections.synchronizedList(new ArrayList<>());
        try (CafeService service = new CafeService(folder.resolve("server.db")); CafeServer server = new CafeServer(service, "127.0.0.1", 0, log::add, fault)) {
            server.start();
            try (NetworkClient owner = new NetworkClient("127.0.0.1", server.port())) {
                owner.login("admin", "CafeLink@123"); JsonObject table = new JsonObject(); table.addProperty("tableId", 1); String visit = owner.request("OPEN_TABLE", table).get("visitId").getAsString();
                JsonObject data = JsonParser.parseString("{\"items\":[{\"menuId\":2,\"quantity\":1}]}").getAsJsonObject(); data.addProperty("visitId", visit);
                NetworkClient.Traffic originalTraffic;
                try (NetworkClient original = new NetworkClient("127.0.0.1", server.port(), folder.resolve("private-outbox.json"))) {
                    original.login("ban1", "Ban1@123"); String action = order ? "PLACE_ORDER" : "CALL_SERVICE";
                    if (scenario.equals("NORMAL")) original.request(action, data);
                    else {
                        try { original.request(action, data); throw new IllegalStateException("Expected injected disconnect"); }
                        catch (RemoteException e) { throw e; }
                        catch (IOException expected) { }
                    }
                    originalTraffic = original.traffic();
                }
                if (scenario.equals("VISIT_CHANGED")) { owner.request("CLOSE_EMPTY_TABLE", data); owner.request("OPEN_TABLE", table); }
                long offlineBegan = System.nanoTime();
                if (!scenario.equals("NORMAL")) TimeUnit.SECONDS.sleep(test.offlineSeconds());
                double offlineMs = (System.nanoTime() - offlineBegan) / 1_000_000.0;
                long began = System.nanoTime();
                try (NetworkClient restored = new NetworkClient("127.0.0.1", server.port(), folder.resolve("private-outbox.json"))) {
                    restored.login("ban1", "Ban1@123"); List<Outbox.Entry> recovered = restored.recover(test.policy()); double milliseconds = (System.nanoTime() - began) / 1_000_000.0;
                    var state = owner.refresh(); int orders = state.orders().size(), tickets = state.tickets().size();
                    int expectedOrders = Set.of("NORMAL", "LOST_ORDER_ACK").contains(scenario) || (scenario.equals("UNACCEPTED_ORDER") && test.policy() == NetworkClient.RecoveryPolicy.REPLAY_ALL) ? 1 : 0;
                    int expectedTickets = scenario.equals("LOST_SERVICE_ACK") || (scenario.equals("UNACCEPTED_SERVICE") && test.policy() == NetworkClient.RecoveryPolicy.REPLAY_ALL) ? 1 : 0;
                    int duplicate = Math.max(orders - expectedOrders, 0), wrongVisit = scenario.equals("VISIT_CHANGED") ? orders + tickets : 0, unconfirmed = scenario.equals("UNACCEPTED_SERVICE") ? tickets : 0;
                    long resolved = recovered.stream().filter(e -> e.status().equals("RESOLVED")).count(), confirmations = recovered.stream().filter(e -> e.status().equals("CONFIRM_REQUIRED")).count();
                    if (orders != expectedOrders || tickets != expectedTickets || duplicate != 0 || wrongVisit != 0) throw new IllegalStateException("Data reconciliation failed");
                    Files.writeString(folder.resolve("server-state.json"), Json.GSON.toJson(state)); synchronized (log) { Files.write(folder.resolve("server.log"), log); }
                    long databaseBytes; try (var paths = Files.list(folder)) { databaseBytes = paths.filter(path -> path.getFileName().toString().startsWith("server.db")).mapToLong(RecoveryExperimentMain::size).sum(); }
                    NetworkClient.Traffic after = restored.traffic();
                    return String.format(Locale.ROOT, "%s,%s,%d,%d,%.3f,PASS,%d,%d,%d,%d,%d,%d,%d,%.3f,%d,%d,%d,%d,%s", test.policy(), scenario, test.repetition(), test.offlineSeconds(), offlineMs, orders, tickets, duplicate, wrongVisit, unconfirmed, resolved, confirmations, milliseconds, originalTraffic.sentBytes() + after.sentBytes(), originalTraffic.receivedBytes() + after.receivedBytes(), Files.size(folder.resolve("private-outbox.json")), databaseBytes, test.name());
                }
            }
        }
    }
    private static long size(Path path) { try { return Files.size(path); } catch (IOException e) { throw new UncheckedIOException(e); } }
}
