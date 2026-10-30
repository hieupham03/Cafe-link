package com.cafelink.server;

import com.cafelink.common.Commands;
import com.cafelink.common.Message;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

/** In-memory operational counters; never retains payloads, identities or credentials. */
final class CoreMetrics {
    private static final int TRACE_LIMIT = 100;
    private static final Set<String> EXCLUDED = Set.of("PING", "HEALTH_CHECK", "GET_DIAGNOSTICS");
    private static final Set<String> READS_AND_SESSION = Set.of("LOGIN", "JOIN_VISIT", "JOIN_TABLE", "RESUME",
            "VERIFY_JOIN_GRANT", "VERIFY_TABLE_GRANT", "ROTATE_SESSION", "CONTINUE_VISIT", "LEAVE_VISIT",
            "GET_STATE", "GET_OUTCOME", "START_NEW_VISIT", "DISCARD_COMMAND", "GET_TABLE_QR", "GET_OWN_TABLE_QR",
            "GET_CONTINUATION_CONTEXT", "FIND_ASSISTANCE", "GET_BILL", "GET_CHECKOUT", "GET_MENU_CATEGORIES",
            "GET_NOTIFICATIONS", "GET_SALES_HISTORY", "GET_SALES_RECEIPT", "GET_VISIT_MEMBERSHIPS", "GET_VISIT_QR");
    private static final Pattern UUID_ID = Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    private final long started = System.nanoTime();
    private final ArrayDeque<Trace> recent = new ArrayDeque<>();
    private long requests;
    private long errors;
    private long totalNanos;
    private long maxNanos;
    final AtomicLong slowDisconnects = new AtomicLong();
    final AtomicLong readFailures = new AtomicLong();

    record Trace(String at, String requestId, String action, String role, String outcome, double durationMs) { }
    record Snapshot(long uptimeMs, long requests, long errors, double averageDispatchMs, double maxDispatchMs,
                    long slowDisconnects, long readFailures, int traceCapacity, List<Trace> recent) { }

    synchronized void record(Message request, String role, String outcome, long start) {
        if (EXCLUDED.contains(request.action())) return;
        long elapsed = Math.max(0, System.nanoTime() - start);
        requests++;
        if (!outcome.equals("OK")) errors++;
        totalNanos += elapsed;
        maxNanos = Math.max(maxNanos, elapsed);
        String id = UUID_ID.matcher(request.requestId()).matches() ? request.requestId()
                : "id:" + Commands.digest(request.requestId()).substring(0, 12);
        String action = Commands.mutation(request.action()) || READS_AND_SESSION.contains(request.action())
                ? request.action() : "UNKNOWN_ACTION";
        recent.addFirst(new Trace(Instant.now().toString(), id, action, role, outcome, elapsed / 1_000_000.0));
        if (recent.size() > TRACE_LIMIT) recent.removeLast();
    }

    synchronized Snapshot snapshot() {
        return new Snapshot((System.nanoTime() - started) / 1_000_000, requests, errors,
                requests == 0 ? 0 : totalNanos / 1_000_000.0 / requests, maxNanos / 1_000_000.0,
                slowDisconnects.get(), readFailures.get(), TRACE_LIMIT, List.copyOf(recent));
    }
}
