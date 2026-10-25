package com.cafelink.server;

import com.cafelink.client.*;
import com.cafelink.common.Models.*;
import com.google.gson.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.io.IOException;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

class RecoveryIntegrationTest {
    @TempDir Path temp;
    CafeService service;
    CafeServer server;
    NetworkClient owner, guest;
    String visit;
    final List<NetworkClient> clients = new ArrayList<>();
    @AfterEach void stop() throws Exception { for (NetworkClient client : clients) client.close(); if (server != null) server.close(); if (service != null) service.close(); }
    void start(FaultInjector faults) throws Exception {
        service = new CafeService(temp.resolve("recovery.db")); server = new CafeServer(service, "127.0.0.1", 0, s -> {}, faults); server.start();
        owner = client("admin", "CafeLink@123", null); JsonObject data = new JsonObject(); data.addProperty("tableId", 1); visit = owner.request("OPEN_TABLE", data).get("visitId").getAsString();
        guest = client("ban1", "Ban1@123", temp.resolve("outbox.json"));
    }
    NetworkClient client(String user, String password, Path journal) throws Exception { NetworkClient client = new NetworkClient("127.0.0.1", server.port(), journal); clients.add(client); client.login(user, password); return client; }
    NetworkClient reconnect() throws Exception { guest.close(); guest = client("ban1", "Ban1@123", temp.resolve("outbox.json")); return guest; }
    JsonObject payload() { JsonObject data = JsonParser.parseString("{\"items\":[{\"menuId\":2,\"quantity\":1}]}").getAsJsonObject(); data.addProperty("visitId", visit); return data; }
    @Test void lostOrderAckRecoveredFromDiskAndDatabaseAfterRestart() throws Exception {
        start(FaultInjector.once(FaultInjector.Point.AFTER_COMMIT, "PLACE_ORDER"));
        assertThrows(IOException.class, () -> guest.request("PLACE_ORDER", payload())); String id = guest.recoveryEntries().get(0).id(); guest.close(); owner.close(); server.close(); service.close();
        service = new CafeService(temp.resolve("recovery.db")); server = new CafeServer(service, "127.0.0.1", 0, s -> {}); server.start();
        owner = client("admin", "CafeLink@123", null); guest = client("ban1", "Ban1@123", temp.resolve("outbox.json"));
        assertEquals("RESOLVED", guest.recover().get(0).status()); assertEquals(id, guest.recoveryEntries().get(0).id());
        assertEquals(1, owner.refresh().orders().size()); assertEquals(30000, owner.latest().orders().get(0).totalVnd());
    }
    @Test void unacceptedServiceCallRequiresExplicitConfirmation() throws Exception {
        start(FaultInjector.once(FaultInjector.Point.BEFORE_ACCEPT, "CALL_SERVICE"));
        assertThrows(IOException.class, () -> guest.request("CALL_SERVICE", payload())); reconnect();
        assertEquals("CONFIRM_REQUIRED", guest.recover().get(0).status()); assertTrue(owner.refresh().tickets().isEmpty());
        String id = guest.recoveryEntries().get(0).id(); guest.confirmRecovery(id); assertEquals(1, owner.refresh().tickets().size());
        assertThrows(IOException.class, () -> guest.confirmRecovery(id));
    }
    @Test void unacceptedOrderUsesSameIdWhenConfirmed() throws Exception {
        start(FaultInjector.once(FaultInjector.Point.BEFORE_ACCEPT, "PLACE_ORDER")); assertThrows(IOException.class, () -> guest.request("PLACE_ORDER", payload()));
        String id = guest.recoveryEntries().get(0).id(); reconnect(); guest.recover(); assertTrue(owner.refresh().orders().isEmpty());
        guest.confirmRecovery(id); assertEquals(1, owner.refresh().orders().size()); assertEquals("RESOLVED", guest.recoveryEntries().get(0).status());
    }
    @Test void oldPendingIntentIsNotMovedToNextVisitAndOldGuestCannotReadNewTicket() throws Exception {
        start(FaultInjector.once(FaultInjector.Point.BEFORE_ACCEPT, "CALL_SERVICE")); assertThrows(IOException.class, () -> guest.request("CALL_SERVICE", payload()));
        owner.request("CLOSE_EMPTY_TABLE", payload()); JsonObject table = new JsonObject(); table.addProperty("tableId", 1); String next = owner.request("OPEN_TABLE", table).get("visitId").getAsString();
        NetworkClient fresh = client("ban1", "Ban1@123", null); JsonObject request = new JsonObject(); request.addProperty("visitId", next); fresh.request("CALL_SERVICE", request);
        reconnect(); assertEquals("STALE", guest.recover().get(0).status()); assertTrue(guest.latest().tickets().isEmpty()); assertNull(guest.latest().tables().get(0).visitId());
        assertThrows(IOException.class, () -> guest.confirmRecovery(guest.recoveryEntries().get(0).id())); assertEquals(1, owner.refresh().tickets().size());
    }
    @Test void acceptedTicketIsRecoveredWithoutCreatingSecondTicket() throws Exception {
        start(FaultInjector.once(FaultInjector.Point.AFTER_COMMIT, "CALL_SERVICE")); assertThrows(IOException.class, () -> guest.request("CALL_SERVICE", payload()));
        reconnect(); guest.recover(); guest.recover(); assertEquals("RESOLVED", guest.recoveryEntries().get(0).status()); assertEquals(1, owner.refresh().tickets().size());
    }
    @Test void dismissUnacceptedIntentCreatesDurableBarrierForLateOriginal() throws Exception {
        start(FaultInjector.once(FaultInjector.Point.BEFORE_ACCEPT, "PLACE_ORDER")); assertThrows(IOException.class, () -> guest.request("PLACE_ORDER", payload()));
        String id = guest.recoveryEntries().get(0).id(); reconnect(); guest.recover(); guest.dismissRecovery(id);
        assertEquals("REJECTED", guest.recoveryEntries().get(0).status());
        RemoteException rejected = assertThrows(RemoteException.class, () -> guest.requestWithId(id, "PLACE_ORDER", payload())); assertEquals("COMMAND_DISCARDED", rejected.code()); assertTrue(owner.refresh().orders().isEmpty());
        reconnect(); JsonObject query = new JsonObject(); query.addProperty("commandId", id); assertTrue(guest.request("GET_OUTCOME", query).get("found").getAsBoolean());
    }
    @Test void lostDiscardAcknowledgementIsReconciledWithoutRevivingIntent() throws Exception {
        FaultInjector placement = FaultInjector.once(FaultInjector.Point.BEFORE_ACCEPT, "PLACE_ORDER");
        FaultInjector discard = FaultInjector.once(FaultInjector.Point.AFTER_COMMIT, "DISCARD_COMMAND");
        start((point, identity, request) -> placement.disconnect(point, identity, request) || discard.disconnect(point, identity, request));
        assertThrows(IOException.class, () -> guest.request("PLACE_ORDER", payload())); reconnect(); guest.recover();
        String id = guest.recoveryEntries().get(0).id();
        assertThrows(IOException.class, () -> guest.dismissRecovery(id));
        assertEquals("CONFIRM_REQUIRED", guest.recoveryEntries().get(0).status(), "Lost response must remain uncertain locally");
        reconnect(); guest.recover(); assertEquals("REJECTED", guest.recoveryEntries().get(0).status()); assertTrue(owner.refresh().orders().isEmpty());
        assertEquals("COMMAND_DISCARDED", assertThrows(RemoteException.class, () -> guest.requestWithId(id, "PLACE_ORDER", payload())).code());
    }
    @Test void lookupAndReplayWhileOldHandlerWaitsStillHaveOneEffect() throws Exception {
        CountDownLatch arrived = new CountDownLatch(1), release = new CountDownLatch(1); java.util.concurrent.atomic.AtomicBoolean once = new java.util.concurrent.atomic.AtomicBoolean(true);
        start((point, identity, request) -> {
            if (point == FaultInjector.Point.BEFORE_ACCEPT && request.action().equals("PLACE_ORDER") && once.compareAndSet(true, false)) {
                arrived.countDown(); try { if (!release.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("test barrier timeout"); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            } return false;
        });
        ExecutorService worker = Executors.newSingleThreadExecutor();
        try {
            NetworkClient original = guest; Future<?> first = worker.submit(() -> { try { original.request("PLACE_ORDER", payload()); } catch (IOException expected) { } });
            assertTrue(arrived.await(3, TimeUnit.SECONDS)); reconnect(); guest.recover(); String id = guest.recoveryEntries().get(0).id();
            assertEquals("CONFIRM_REQUIRED", guest.recoveryEntries().get(0).status()); guest.confirmRecovery(id); release.countDown(); first.get(3, TimeUnit.SECONDS);
            assertEquals(1, owner.refresh().orders().size());
        } finally { release.countDown(); worker.shutdownNow(); }
    }
    @Test void terminalOnlyStartsNewGuestAfterPreviousVisitEnded() throws Exception {
        start(FaultInjector.NONE); assertEquals("INVALID_STATE", assertThrows(RemoteException.class, () -> guest.startNewVisit()).code());
        owner.request("CLOSE_EMPTY_TABLE", payload()); JsonObject table = new JsonObject(); table.addProperty("tableId", 1); String next = owner.request("OPEN_TABLE", table).get("visitId").getAsString();
        String previousCredential = guest.identity().credential(); guest.startNewVisit(); assertNotEquals(previousCredential, guest.identity().credential()); assertEquals(next, guest.latest().tables().get(0).visitId());
        reconnect(); assertEquals(next, guest.latest().tables().get(0).visitId());
    }
    @Test void dismissAfterAcceptanceKeepsTheAcceptedTicket() throws Exception {
        start(FaultInjector.once(FaultInjector.Point.AFTER_COMMIT, "CALL_SERVICE"));
        assertThrows(IOException.class, () -> guest.request("CALL_SERVICE", payload())); String id = guest.recoveryEntries().get(0).id();
        reconnect(); guest.dismissRecovery(id);
        assertEquals("RESOLVED", guest.recoveryEntries().get(0).status()); assertEquals(1, owner.refresh().tickets().size());
        assertEquals("OPEN", owner.latest().tickets().get(0).status());
    }
    @Test void paymentReceiptCanBeRecoveredAfterAckLossAndVisitClosure() throws Exception {
        start(FaultInjector.once(FaultInjector.Point.AFTER_COMMIT, "PAY_AND_CLOSE"));
        long orderId = guest.request("PLACE_ORDER", payload()).get("orderId").getAsLong();
        for (String status : List.of("PREPARING", "READY", "SERVED")) {
            JsonObject data = new JsonObject(); data.addProperty("orderId", orderId); data.addProperty("status", status); owner.request("SET_ORDER_STATUS", data);
        }
        assertThrows(IOException.class, () -> owner.requestWithId("payment-stable", "PAY_AND_CLOSE", payload())); owner.close();
        owner = client("admin", "CafeLink@123", null); JsonObject query = new JsonObject(); query.addProperty("commandId", "payment-stable");
        JsonObject stored = owner.request("GET_OUTCOME", query); assertTrue(stored.get("found").getAsBoolean());
        JsonObject result = owner.requestWithId("payment-stable", "PAY_AND_CLOSE", payload());
        assertEquals(stored.get("result"), result); assertEquals(30000, result.get("totalVnd").getAsLong()); assertNull(owner.refresh().tables().get(0).visitId());
    }
}
