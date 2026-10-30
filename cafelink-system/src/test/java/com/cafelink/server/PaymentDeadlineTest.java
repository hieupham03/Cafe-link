package com.cafelink.server;

import com.cafelink.common.Models.Identity;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.nio.file.Path;
import java.time.*;
import java.util.Map;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;

class PaymentDeadlineTest {
    @TempDir Path temp;
    CafeService service;
    MutableClock clock;
    Identity admin, guest;
    String visit;
    int order;

    static final class MutableClock extends Clock {
        volatile Instant now;
        MutableClock(String instant) { now = Instant.parse(instant); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
        @Override public Instant instant() { return now; }
    }

    JsonObject call(Identity who, String action, JsonObject body) throws Exception {
        return service.execute(who, action, body);
    }

    void open(String initialTime) throws Exception {
        clock = new MutableClock(initialTime);
        service = new CafeService(temp.resolve("deadline.db"), new QrConfig(new byte[32], clock), true);
        admin = service.authenticate("admin", "CafeLink@123");
        var table = new JsonObject(); table.addProperty("tableId", 1);
        visit = call(admin, "OPEN_TABLE", table).get("visitId").getAsString();
        guest = service.joinVisit(call(admin, "GET_VISIT_QR", scope()).get("grant").getAsString());
        var body = scope();
        body.add("items", JsonParser.parseString("[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPriceVnd\":30000}]"));
        order = call(guest, "PLACE_ORDER", body).get("orderId").getAsInt();
    }

    JsonObject scope() { var body = new JsonObject(); body.addProperty("visitId", visit); return body; }
    JsonObject orderScope() { var body = scope(); body.addProperty("orderId", order); return body; }
    JsonObject startPayment() throws Exception { return call(guest, "START_ORDER_PAYMENT", orderScope()); }
    JsonObject confirm(JsonObject payment) throws Exception {
        var body = payment.deepCopy(); body.addProperty("outcome", "SUCCESS");
        return call(guest, "SIMULATE_PAYMENT", body);
    }
    @AfterEach void close() throws Exception { if (service != null) service.close(); }

    @ParameterizedTest
    @CsvSource({
            "2026-10-30T01:00:00Z,900001,false",
            "2026-10-30T01:00:00.123Z,899877,true",
            "2026-10-30T01:00:00.123Z,900000,false"
    })
    void startingPaymentUsesTimeRatherThanTextOrdering(String initial, long elapsedMillis, boolean reuse) throws Exception {
        open(initial);
        var first = startPayment();
        clock.now = clock.now.plusMillis(elapsedMillis);
        var next = startPayment();
        assertEquals(reuse, first.get("paymentId").equals(next.get("paymentId")));
        assertTrue(clock.now.isBefore(Instant.parse(next.get("expiresAt").getAsString())), "Must never return an expired pending attempt");
    }

    @ParameterizedTest
    @CsvSource({"899999999999,PAID", "900000000000,EXPIRED", "900000000001,EXPIRED"})
    void confirmingAtTheDeadlineIsExpired(long elapsedNanos, String expected) throws Exception {
        open("2026-10-30T01:00:00Z");
        var payment = startPayment();
        clock.now = clock.now.plusNanos(elapsedNanos);
        assertEquals(expected, confirm(payment).get("state").getAsString());
        var state = service.snapshot(guest, Map.of()).orders().get(0);
        assertEquals(expected.equals("PAID") ? "PAID" : "UNPAID", state.paymentState());
        assertEquals(expected.equals("PAID") ? 1 : 0, call(admin, "GET_SALES_HISTORY", new JsonObject()).getAsJsonArray("receipts").size());
    }

    @Test void replacementAttemptFencesTheExpiredCallbackAndRecordsOneReceipt() throws Exception {
        open("2026-10-30T01:00:00Z");
        var expired = startPayment();
        clock.now = clock.now.plusSeconds(900).plusMillis(1);
        var current = startPayment();
        assertNotEquals(expired.get("paymentId"), current.get("paymentId"));
        assertEquals("EXPIRED", confirm(expired).get("state").getAsString());
        assertEquals("PENDING", service.snapshot(guest, Map.of()).orders().get(0).paymentState());
        assertEquals("PAID", confirm(current).get("state").getAsString());
        assertEquals("PAID", confirm(current).get("state").getAsString());
        assertEquals(1, call(admin, "GET_SALES_HISTORY", new JsonObject()).getAsJsonArray("receipts").size());
    }

    @Test void twoConcurrentStartsAndConfirmationsCreateOnePaymentAndReceipt() throws Exception {
        open("2026-10-30T01:00:00Z");
        var workers = Executors.newFixedThreadPool(2);
        try {
            var start = new CountDownLatch(1);
            Callable<JsonObject> begin = () -> { start.await(); return startPayment(); };
            var first = workers.submit(begin); var second = workers.submit(begin); start.countDown();
            var payment = first.get(5, TimeUnit.SECONDS);
            assertEquals(payment.get("paymentId"), second.get(5, TimeUnit.SECONDS).get("paymentId"));
            var confirm = new CountDownLatch(1);
            Callable<JsonObject> finish = () -> { confirm.await(); return confirm(payment); };
            var a = workers.submit(finish); var b = workers.submit(finish); confirm.countDown();
            assertEquals("PAID", a.get(5, TimeUnit.SECONDS).get("state").getAsString());
            assertEquals("PAID", b.get(5, TimeUnit.SECONDS).get("state").getAsString());
            assertEquals(1, call(admin, "GET_SALES_HISTORY", new JsonObject()).getAsJsonArray("receipts").size());
        } finally { workers.shutdownNow(); }
    }
}
