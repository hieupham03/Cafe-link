package com.cafelink.server;

import com.cafelink.common.Models.Identity;
import com.google.gson.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.sql.*;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class GuestSessionTest {
    @TempDir Path temp;
    CafeService service;
    Identity admin;
    @BeforeEach void start() throws Exception { service = new CafeService(temp.resolve("session.db")); admin = service.authenticate("admin", "CafeLink@123"); }
    @AfterEach void stop() throws Exception { service.close(); }
    static JsonObject data(String field, String value) { JsonObject data = new JsonObject(); data.addProperty(field, value); return data; }
    String open() throws Exception { JsonObject data = new JsonObject(); data.addProperty("tableId", 1); return service.execute(admin, "OPEN_TABLE", data).get("visitId").getAsString(); }
    @Test void waitingCredentialBindsOnceEvenIfClientMissesFirstVisit() throws Exception {
        Identity old = service.authenticate("ban1", "Ban1@123"); String first = open();
        service.execute(admin, "CLOSE_EMPTY_TABLE", data("visitId", first)); String next = open();
        assertNull(service.snapshot(old, Map.of()).tables().get(0).visitId());
        assertEquals("STALE_SESSION", assertThrows(BusinessException.class, () -> service.execute(old, "CALL_SERVICE", data("visitId", next))).code());
        Identity fresh = service.authenticate("ban1", "Ban1@123"); assertEquals(next, service.snapshot(fresh, Map.of()).tables().get(0).visitId());
    }
    @Test void oldCredentialResumesOldOutcomeWithoutReadingNewVisit() throws Exception {
        String first = open(); Identity old = service.authenticate("ban1", "Ban1@123");
        JsonObject ticket = service.execute(old, "saved", "CALL_SERVICE", data("visitId", first));
        JsonObject reply = new JsonObject(); reply.addProperty("ticketId", ticket.get("ticketId").getAsLong()); reply.addProperty("reply", "OK");
        service.execute(admin, "HANDLE_TICKET", reply); service.execute(admin, "CLOSE_EMPTY_TABLE", data("visitId", first)); String next = open();
        Identity fresh = service.authenticate("ban1", "Ban1@123"); service.execute(fresh, "CALL_SERVICE", data("visitId", next));
        service.close(); service = new CafeService(temp.resolve("session.db"));
        Identity resumed = service.authenticate("ban1", "Ban1@123", old.credential());
        assertEquals(ticket, service.outcome(resumed, "saved").get("result"));
        assertFalse(service.outcome(fresh, "saved").get("found").getAsBoolean());
        assertTrue(service.snapshot(resumed, Map.of()).tickets().isEmpty());
        assertNull(service.snapshot(resumed, Map.of()).tables().get(0).visitId());
        assertEquals(ticket, service.execute(resumed, "saved", "CALL_SERVICE", data("visitId", first)));
    }
    @Test void invalidOrOtherAccountsCredentialDoesNotFallbackToNewGrant() throws Exception {
        Identity one = service.authenticate("ban1", "Ban1@123");
        assertEquals("INVALID_CREDENTIAL", assertThrows(BusinessException.class, () -> service.authenticate("ban2", "Ban2@123", one.credential())).code());
        assertEquals("INVALID_CREDENTIAL", assertThrows(BusinessException.class, () -> service.authenticate("ban1", "Ban1@123", "forged")).code());
        assertEquals("AUTH_FAILED", assertThrows(BusinessException.class, () -> service.authenticate("ban1", "wrong", one.credential())).code());
    }
    @Test void migrationPreservesWeekOneDatabase() throws Exception {
        String first = open(); service.close();
        try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + temp.resolve("session.db")); Statement sql = connection.createStatement()) {
            sql.execute("DROP TABLE guest_credentials"); sql.execute("DROP TABLE command_receipts"); sql.execute("PRAGMA user_version=1");
        }
        service = new CafeService(temp.resolve("session.db")); Identity guest = service.authenticate("ban1", "Ban1@123");
        assertEquals(first, service.snapshot(guest, Map.of()).tables().get(0).visitId());
        assertNotNull(service.execute(guest, "migrated", "CALL_SERVICE", data("visitId", first)).get("ticketId"));
    }
}
