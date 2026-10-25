package com.cafelink.server;

import com.cafelink.common.*;
import com.cafelink.common.Models.Identity;
import com.google.gson.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class QrAccessTest {
    @TempDir Path temp;
    CafeService service;
    Identity admin;
    static final byte[] KEY = new byte[32]; // Fixture key, never a production default.
    static JsonObject data(String json) { return JsonParser.parseString(json).getAsJsonObject(); }
    @BeforeEach void start() throws Exception {
        service = new CafeService(temp.resolve("qr.db"), new QrConfig(KEY, Clock.systemUTC()));
        admin = service.authenticate("admin", "CafeLink@123");
    }
    @AfterEach void stop() throws Exception { service.close(); }
    String open(int table) throws Exception { return service.execute(admin, "OPEN_TABLE", data("{\"tableId\":"+table+"}")).get("visitId").getAsString(); }
    JsonObject visit(String id) { JsonObject value = new JsonObject(); value.addProperty("visitId", id); return value; }
    String grant(String visit) throws Exception { return service.execute(admin, "GET_VISIT_QR", visit(visit)).get("grant").getAsString(); }

    @Test void oneVisitQrServesIndependentGuestsAndSurvivesAdminRefresh() throws Exception {
        String visit = open(1), grant = grant(visit);
        assertEquals(43, grant.length());
        assertEquals(grant, grant(visit));
        Identity first = service.joinVisit(grant), second = service.joinVisit(grant);
        assertEquals("GUEST", first.role()); assertEquals(1, first.tableId());
        assertEquals(visit, first.visitId()); assertNotEquals(first.membershipId(), second.membershipId());
        assertEquals(first.storeId(), second.storeId());
        assertEquals(1, service.snapshot(first, Map.of()).tables().size());
        assertEquals(visit, service.snapshot(second, Map.of()).tables().get(0).visitId());
        assertEquals("QR_REQUIRED", assertThrows(BusinessException.class, () -> service.authenticate("ban1", "Ban1@123")).code());
    }
    @Test void rotatingQrRejectsOldJoinButKeepsIssuedMembershipAndReceipts() throws Exception {
        String visit = open(1), before = grant(visit);
        Identity guest = service.joinVisit(before);
        JsonObject order = data("{\"items\":[{\"menuId\":2,\"quantity\":1}]}"); order.addProperty("visitId", visit);
        JsonObject accepted = service.execute(guest, "stable-order", "PLACE_ORDER", order);
        service.execute(admin, "rotate-once", "ROTATE_JOIN_GRANT", visit(visit));
        assertNotEquals(before, grant(visit));
        assertEquals("INVALID_GRANT", assertThrows(BusinessException.class, () -> service.joinVisit(before)).code());
        Identity rotated = service.rotateSession(guest);
        assertEquals(guest.membershipId(), rotated.membershipId()); assertNotEquals(guest.credential(), rotated.credential());
        assertEquals(accepted, service.execute(rotated, "stable-order", "PLACE_ORDER", order));
        assertEquals("SESSION_REVOKED", assertThrows(BusinessException.class, () -> service.resume(guest.credential())).code());
        assertEquals(1, service.snapshot(rotated, Map.of()).orders().size());
    }
    @Test void closedQrAndOldMembershipNeverEnterTheNextVisitButOwnOutcomeRemainsReadable() throws Exception {
        String oldVisit = open(1), oldQr = grant(oldVisit); Identity guest = service.joinVisit(oldQr);
        JsonObject call = visit(oldVisit);
        long ticket = service.execute(guest, "old-call", "CALL_SERVICE", call).get("ticketId").getAsLong();
        service.execute(admin, "HANDLE_TICKET", data("{\"ticketId\":"+ticket+",\"reply\":\"Done\"}"));
        service.execute(admin, "CLOSE_EMPTY_TABLE", visit(oldVisit));
        String newVisit = open(1); assertNotEquals(oldQr, grant(newVisit));
        assertEquals("VISIT_ENDED", assertThrows(BusinessException.class, () -> service.joinVisit(oldQr)).code());
        Identity resumed = service.resume(guest.credential());
        assertTrue(service.outcome(resumed, "old-call").get("found").getAsBoolean());
        assertEquals("SESSION_ENDED", service.snapshot(resumed, Map.of()).tables().get(0).status());
        assertEquals("STALE_SESSION", assertThrows(BusinessException.class, () -> service.execute(resumed, "CALL_SERVICE", visit(newVisit))).code());
        assertEquals("QR_REQUIRED", assertThrows(BusinessException.class, () -> service.startNewVisit(resumed)).code());
    }
    @Test void revokedMembershipLosesEveryTokenAndCannotReadAnyOutcome() throws Exception {
        String visit = open(1); Identity a = service.joinVisit(grant(visit)), b = service.joinVisit(grant(visit));
        service.execute(a, "private-call", "CALL_SERVICE", visit(visit));
        assertFalse(service.outcome(b, "private-call").get("found").getAsBoolean());
        JsonObject revoke = visit(visit); revoke.addProperty("membershipId", a.membershipId());
        service.execute(admin, "REVOKE_SESSION", revoke);
        assertEquals("SESSION_REVOKED", assertThrows(BusinessException.class, () -> service.outcome(a, "private-call")).code());
        assertEquals("SESSION_REVOKED", assertThrows(BusinessException.class, () -> service.snapshot(a, Map.of())).code());
        assertEquals(visit, service.snapshot(b, Map.of()).tables().get(0).visitId());
        assertEquals("FORBIDDEN", assertThrows(BusinessException.class, () -> service.execute(b, "GET_VISIT_QR", visit(visit))).code());
    }
    @Test void restartPreservesQrStoreMembershipAndWrongKeyRequiresExplicitRotation() throws Exception {
        String visit = open(1), before = grant(visit); Identity guest = service.joinVisit(before);
        service.close(); service = new CafeService(temp.resolve("qr.db"), new QrConfig(KEY, Clock.systemUTC()));
        assertEquals(before, grant(visit)); assertEquals(guest, service.resume(guest.credential()));
        service.close(); byte[] otherKey = new byte[32]; Arrays.fill(otherKey, (byte) 7);
        service = new CafeService(temp.resolve("qr.db"), new QrConfig(otherKey, Clock.systemUTC()));
        assertEquals("QR_KEY_UNAVAILABLE", assertThrows(BusinessException.class, () -> grant(visit)).code());
        assertEquals(guest.membershipId(), service.resume(guest.credential()).membershipId());
        service.execute(admin, "ROTATE_JOIN_GRANT", visit(visit)); assertNotEquals(before, grant(visit));
        assertEquals("INVALID_GRANT", assertThrows(BusinessException.class, () -> service.joinVisit(before)).code());
    }
    @Test void expiredGrantAndSessionRejectAtTheBoundaryWithoutSleeping() throws Exception {
        Instant now = Instant.parse("2026-10-21T10:00:00Z");
        service.close(); service = new CafeService(temp.resolve("qr.db"), new QrConfig(KEY, Clock.fixed(now, ZoneOffset.UTC)));
        String visit = open(1), grant = grant(visit); Identity guest = service.joinVisit(grant);
        service.close(); service = new CafeService(temp.resolve("qr.db"), new QrConfig(KEY, Clock.fixed(now.plusSeconds(8*3600), ZoneOffset.UTC)));
        assertEquals("GRANT_EXPIRED", assertThrows(BusinessException.class, () -> service.joinVisit(grant)).code());
        assertEquals("SESSION_EXPIRED", assertThrows(BusinessException.class, () -> service.resume(guest.credential())).code());
    }
    @Test void joinsRacingCloseNeverBindToTheNextVisit() throws Exception {
        String visit = open(1), qr = grant(visit);
        var pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var join = pool.submit(() -> { try { return service.joinVisit(qr); } catch (BusinessException denied) { assertEquals("VISIT_ENDED", denied.code()); return null; } });
            var close = pool.submit(() -> service.execute(admin, "CLOSE_EMPTY_TABLE", visit(visit)));
            close.get(5, java.util.concurrent.TimeUnit.SECONDS);
            Identity guest = join.get(5, java.util.concurrent.TimeUnit.SECONDS);
            String next = open(1);
            if (guest != null) { assertEquals(visit, guest.visitId()); assertNotEquals(next, guest.visitId()); }
            assertEquals("VISIT_ENDED", assertThrows(BusinessException.class, () -> service.joinVisit(qr)).code());
        } finally { pool.shutdownNow(); }
    }
    @Test void boundedMembershipsAndRotationReceiptsDoNotLeakTheQrSecret() throws Exception {
        String visit=open(1), initial=grant(visit); Identity first=service.joinVisit(initial);
        for(int i=1;i<32;i++)service.joinVisit(initial);
        assertEquals("MEMBERSHIP_LIMIT",assertThrows(BusinessException.class,()->service.joinVisit(initial)).code());
        JsonObject revoke=visit(visit);revoke.addProperty("membershipId",first.membershipId());service.execute(admin,"REVOKE_SESSION",revoke);
        assertNotNull(service.joinVisit(initial));
        service.execute(admin,"qr-no-receipt","GET_VISIT_QR",visit(visit));
        assertFalse(service.outcome(admin,"qr-no-receipt").get("found").getAsBoolean());
        JsonObject rotated=service.execute(admin,"rotate-known","ROTATE_JOIN_GRANT",visit(visit));String current=grant(visit);
        assertFalse(rotated.has("grant"));
        assertEquals(rotated,service.execute(admin,"rotate-known","ROTATE_JOIN_GRANT",visit(visit)));
        assertEquals(current,grant(visit));
    }
}
