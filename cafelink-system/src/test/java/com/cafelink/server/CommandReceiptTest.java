package com.cafelink.server;

import com.cafelink.common.Models.Identity;
import com.google.gson.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

class CommandReceiptTest {
    @TempDir Path temp;
    CafeService service;
    Identity admin, guest;
    String visit;
    @BeforeEach void start() throws Exception {
        service = new CafeService(temp.resolve("receipt.db")); admin = service.authenticate("admin", "CafeLink@123"); guest = service.authenticate("ban1", "Ban1@123");
        visit = service.execute(admin, "OPEN_TABLE", json("{\"tableId\":1}")).get("visitId").getAsString();
    }
    @AfterEach void stop() throws Exception { service.close(); }
    static JsonObject json(String value) { return JsonParser.parseString(value).getAsJsonObject(); }
    JsonObject order() { JsonObject data = json("{\"items\":[{\"menuId\":2,\"quantity\":1}]}"); data.addProperty("visitId", visit); return data; }
    @Test void replayReturnsOriginalResultWithoutRevisionOrSecondOrder() throws Exception {
        JsonObject result = service.execute(guest, "stable", "PLACE_ORDER", order()); long revision = service.snapshot(admin, Map.of()).revision();
        assertEquals(result, service.execute(guest, "stable", "PLACE_ORDER", order()));
        assertEquals(revision, service.snapshot(admin, Map.of()).revision()); assertEquals(1, service.snapshot(admin, Map.of()).orders().size());
        assertEquals(result, service.outcome(guest, "stable").getAsJsonObject("result"));
        assertFalse(service.outcome(admin, "stable").get("found").getAsBoolean());
    }
    @Test void changedPayloadRejectedAndObjectKeyOrderIsIrrelevant() throws Exception {
        JsonObject data = order(); service.execute(guest, "stable", "PLACE_ORDER", data);
        JsonObject reordered = new JsonObject(); reordered.addProperty("visitId", visit); reordered.add("items", data.get("items"));
        assertNotNull(service.execute(guest, "stable", "PLACE_ORDER", reordered).get("orderId"));
        data.addProperty("note", "different");
        assertEquals("COMMAND_CONFLICT", assertThrows(BusinessException.class, () -> service.execute(guest, "stable", "PLACE_ORDER", data)).code());
    }
    @Test void receiptSurvivesServerServiceRestart() throws Exception {
        JsonObject result = service.execute(guest, "stable", "PLACE_ORDER", order()); service.close(); service = new CafeService(temp.resolve("receipt.db"));
        assertEquals(result, service.outcome(guest, "stable").get("result")); assertEquals(result, service.execute(guest, "stable", "PLACE_ORDER", order()));
        assertEquals(1, service.snapshot(admin, Map.of()).orders().size());
    }
    @Test void receiptInsertFailureRollsBackOrderAndRevision() throws Exception {
        long revision = service.snapshot(admin, Map.of()).revision();
        try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + temp.resolve("receipt.db")); Statement sql = connection.createStatement()) {
            sql.execute("CREATE TRIGGER fail_receipt BEFORE INSERT ON command_receipts BEGIN SELECT RAISE(ABORT,'receipt unavailable'); END");
            assertThrows(SQLException.class, () -> service.execute(guest, "stable", "PLACE_ORDER", order()));
            assertTrue(service.snapshot(admin, Map.of()).orders().isEmpty()); assertFalse(service.outcome(guest, "stable").get("found").getAsBoolean());
            assertEquals(revision, service.snapshot(admin, Map.of()).revision()); sql.execute("DROP TRIGGER fail_receipt");
        }
        assertNotNull(service.execute(guest, "stable", "PLACE_ORDER", order()).get("orderId"));
    }
    @Test void concurrentCopiesHaveOneDurableEffect() throws Exception {
        ExecutorService workers = Executors.newFixedThreadPool(8);
        try {
            List<Callable<JsonObject>> work = new ArrayList<>(); for (int i = 0; i < 8; i++) work.add(() -> service.execute(guest, "same", "PLACE_ORDER", order()));
            Set<Long> ids = new HashSet<>(); for (Future<JsonObject> result : workers.invokeAll(work)) ids.add(result.get().get("orderId").getAsLong());
            assertEquals(1, ids.size()); assertEquals(1, service.snapshot(admin, Map.of()).orders().size());
        } finally { workers.shutdownNow(); }
    }
}
