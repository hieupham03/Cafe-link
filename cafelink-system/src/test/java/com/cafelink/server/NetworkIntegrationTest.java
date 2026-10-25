package com.cafelink.server;

import com.cafelink.client.*;
import com.cafelink.common.*;
import com.cafelink.common.Models.*;
import com.google.gson.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.io.*;
import java.net.Socket;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

class NetworkIntegrationTest {
    @TempDir Path temp;
    CafeService service; CafeServer server; List<NetworkClient> clients;
    final List<String> serverLog = new CopyOnWriteArrayList<>();
    @BeforeEach void start() throws Exception { service = new CafeService(temp.resolve("net.db")); server = new CafeServer(service, "127.0.0.1", 0, serverLog::add); server.start(); clients = new CopyOnWriteArrayList<>(); }
    @AfterEach void stop() throws Exception { clients.forEach(NetworkClient::close); server.close(); service.close(); }
    NetworkClient client(String user, String password) throws Exception { NetworkClient c = new NetworkClient("127.0.0.1", server.port()); clients.add(c); c.login(user, password); return c; }
    static JsonObject data(String json) { return JsonParser.parseString(json).getAsJsonObject(); }
    String open(NetworkClient admin, int table) throws Exception { return admin.request("OPEN_TABLE", data("{\"tableId\":" + table + "}")).get("visitId").getAsString(); }
    static JsonObject order(String visit) { JsonObject d = data("{\"items\":[{\"menuId\":2,\"quantity\":1}]}"); d.addProperty("visitId", visit); return d; }
    @Test void authenticationAndInvalidActionDoNotBreakConnection() throws Exception {
        try (NetworkClient c = new NetworkClient("127.0.0.1", server.port())) {
            assertEquals("UNAUTHENTICATED", assertThrows(RemoteException.class, () -> c.refresh()).code());
            assertEquals("AUTH_FAILED", assertThrows(RemoteException.class, () -> c.login("admin", "bad")).code());
            c.login("admin", "CafeLink@123");
            assertEquals("UNKNOWN_ACTION", assertThrows(RemoteException.class, () -> c.request("DELETE_ALL", new JsonObject())).code());
            assertEquals(6, c.refresh().tables().size());
        }
    }
    @Test void trafficCountsWireBytesIncludingFrameHeaderWithoutAuthentication() throws Exception {
        try (NetworkClient client = new NetworkClient("127.0.0.1", server.port())) {
            ByteArrayOutputStream expected = new ByteArrayOutputStream();
            FrameCodec.write(expected, Message.request("wire-counter", "PING", new JsonObject()));
            assertThrows(RemoteException.class, () -> client.requestWithId("wire-counter", "PING", new JsonObject()));
            assertEquals(expected.size(), client.traffic().sentBytes());
            assertTrue(client.traffic().receivedBytes() > 4, "Must include a real error response");
        }
    }
    @Test void guestIsolationAndMalformedBusinessPayload() throws Exception {
        NetworkClient admin = client("admin", "CafeLink@123"), one = client("ban1", "Ban1@123"), two = client("ban2", "Ban2@123");
        String first = open(admin, 1), second = open(admin, 2);
        assertEquals("FORBIDDEN", assertThrows(RemoteException.class, () -> two.request("OPEN_TABLE", data("{\"tableId\":6,\"role\":\"ADMIN\"}"))).code());
        one.request("PLACE_ORDER", order(first));
        assertEquals("FORBIDDEN", assertThrows(RemoteException.class, () -> two.request("PLACE_ORDER", order(first))).code());
        assertEquals("INVALID_INPUT", assertThrows(RemoteException.class, () -> two.request("PLACE_ORDER", data("{\"visitId\":\"" + second + "\",\"items\":42}"))).code());
        assertTrue(two.refresh().orders().isEmpty()); assertEquals(1, one.refresh().orders().size());
    }
    @Test void serverPushArrivesWithoutGuestPolling() throws Exception {
        NetworkClient admin = client("admin", "CafeLink@123"), guest = client("ban1", "Ban1@123");
        BlockingQueue<Snapshot> updates = new LinkedBlockingQueue<>(); guest.onState(updates::offer); updates.clear();
        String visit = open(admin, 1); long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3); boolean seen = false;
        while (System.nanoTime() < deadline) { Snapshot s = updates.poll(100, TimeUnit.MILLISECONDS); if (s != null && visit.equals(s.tables().get(0).visitId())) { seen = true; break; } }
        assertTrue(seen, "Open-table change must be pushed to guest without GET_STATE");
    }
    @Test void fullWorkflowAcrossRealTcpConnections() throws Exception {
        NetworkClient admin = client("admin", "CafeLink@123"), guest = client("ban1", "Ban1@123"); String visit = open(admin, 1);
        long id = guest.request("PLACE_ORDER", order(visit)).get("orderId").getAsLong();
        for (String status : new String[]{"PREPARING", "READY", "SERVED"}) admin.request("SET_ORDER_STATUS", data("{\"orderId\":" + id + ",\"status\":\"" + status + "\"}"));
        long ticket = guest.request("REQUEST_BILL", data("{\"visitId\":\"" + visit + "\"}")).get("ticketId").getAsLong();
        admin.request("HANDLE_TICKET", data("{\"ticketId\":" + ticket + ",\"reply\":\"Mời thanh toán\"}"));
        assertEquals(30000, guest.request("GET_BILL", data("{\"visitId\":\"" + visit + "\"}")).get("totalVnd").getAsLong());
        assertEquals(30000, admin.request("PAY_AND_CLOSE", data("{\"visitId\":\"" + visit + "\"}")).get("totalVnd").getAsLong());
        assertNull(guest.refresh().tables().get(0).visitId());
    }
    @Test void malformedFrameOnlyDisconnectsOffendingPeer() throws Exception {
        NetworkClient admin = client("admin", "CafeLink@123");
        try (Socket bad = new Socket("127.0.0.1", server.port())) {
            bad.setSoTimeout(3000); new DataOutputStream(bad.getOutputStream()).writeInt(Integer.MAX_VALUE);
            assertEquals(-1, bad.getInputStream().read());
        }
        assertEquals(6, admin.refresh().tables().size());
    }
    @Test void disconnectAndManualReconnectKeepDatabaseState() throws Exception {
        NetworkClient admin = client("admin", "CafeLink@123"), guest = client("ban1", "Ban1@123"); String visit = open(admin, 1);
        guest.request("PLACE_ORDER", order(visit)); guest.close();
        NetworkClient back = client("ban1", "Ban1@123"); assertEquals(visit, back.latest().tables().get(0).visitId()); assertEquals(1, back.latest().orders().size());
    }
    @Test void twelveConcurrentClientsCreateIndependentCompleteOrders() throws Exception {
        NetworkClient admin = client("admin", "CafeLink@123"); String visit = open(admin, 1);
        ExecutorService workers = Executors.newFixedThreadPool(12);
        try {
            List<Callable<Long>> work = new ArrayList<>();
            for (int i = 0; i < 12; i++) work.add(() -> { NetworkClient c = client("ban1", "Ban1@123"); return c.request("PLACE_ORDER", order(visit)).get("orderId").getAsLong(); });
            Set<Long> ids = new HashSet<>(); for (Future<Long> result : workers.invokeAll(work)) ids.add(result.get(10, TimeUnit.SECONDS));
            assertEquals(12, ids.size()); assertEquals(12, admin.refresh().orders().size());
            assertEquals(360000, admin.request("GET_BILL", data("{\"visitId\":\"" + visit + "\"}")).get("totalVnd").getAsLong());
        } finally { workers.shutdownNow(); }
    }
    @Test void serverShutdownFailsPendingConnectionCleanly() throws Exception {
        NetworkClient guest = client("ban1", "Ban1@123"); server.close();
        assertThrows(IOException.class, guest::refresh);
    }
    @Test void connectionLimitRejectsExtraPeerWithoutBreakingAuthenticatedClient() throws Exception {
        NetworkClient owner = client("admin", "CafeLink@123"); List<Socket> idle = new ArrayList<>();
        try {
            for (int i = 0; i < 63; i++) idle.add(new Socket("127.0.0.1", server.port()));
            await(() -> server.connectionCount() == 64);
            try (Socket extra = new Socket("127.0.0.1", server.port())) { extra.setSoTimeout(3000); assertEquals(-1, extra.getInputStream().read()); }
            assertEquals(6, owner.refresh().tables().size());
            assertTrue(serverLog.stream().anyMatch(s -> s.contains("Connection limit reached")));
        } finally { for (Socket socket : idle) socket.close(); }
    }
    @Test void slowConsumerIsBoundedWhileOtherClientsContinue() throws Exception {
        NetworkClient owner = client("admin", "CafeLink@123"), guest = client("ban1", "Ban1@123"); String visit = open(owner, 1);
        try (Socket slow = new Socket()) {
            slow.setReceiveBufferSize(1024); slow.connect(new java.net.InetSocketAddress("127.0.0.1", server.port()));
            FrameCodec.write(slow.getOutputStream(), Message.request("slow-login", "LOGIN", data("{\"username\":\"ban1\",\"password\":\"Ban1@123\"}")));
            await(() -> serverLog.stream().filter(s -> s.equals("Authenticated: ban1")).count() == 2);
            int created = 0;
            while (created < 180 && serverLog.stream().noneMatch(s -> s.contains("outbound queue full"))) { guest.request("PLACE_ORDER", order(visit)); created++; }
            await(() -> serverLog.stream().anyMatch(s -> s.contains("outbound queue full")));
            assertEquals(created, owner.refresh().orders().size()); assertTrue(guest.connected());
            assertNotNull(owner.request("PING", new JsonObject()));
        }
    }
    @Test void closingClientsAndServerTerminatesAllOwnedNetworkWorkers() throws Exception {
        for (int table = 1; table <= 6; table++) client("ban" + table, "Ban" + table + "@123");
        clients.forEach(NetworkClient::close); server.close();
        await(() -> Thread.getAllStackTraces().keySet().stream().noneMatch(thread -> thread.isAlive() && thread.getName().startsWith("cafelink-")));
        assertEquals(0, server.connectionCount());
    }
    private static void await(java.util.function.BooleanSupplier condition) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (!condition.getAsBoolean() && System.nanoTime() < deadline) Thread.sleep(10);
        assertTrue(condition.getAsBoolean(), "Condition did not converge within five seconds");
    }
    @Test void paymentAndNewOrderRaceHasOnlyOneValidOutcome() throws Exception {
        NetworkClient admin = client("admin", "CafeLink@123"), guest = client("ban1", "Ban1@123"); String visit = open(admin, 1);
        long id = guest.request("PLACE_ORDER", order(visit)).get("orderId").getAsLong();
        for (String status : new String[]{"PREPARING", "READY", "SERVED"}) admin.request("SET_ORDER_STATUS", data("{\"orderId\":" + id + ",\"status\":\"" + status + "\"}"));
        ExecutorService workers = Executors.newFixedThreadPool(2); CyclicBarrier barrier = new CyclicBarrier(2);
        try {
            Future<String> payment = workers.submit(() -> { barrier.await(); try { admin.request("PAY_AND_CLOSE", data("{\"visitId\":\"" + visit + "\"}")); return "PAID"; } catch (RemoteException e) { return e.code(); } });
            Future<String> placement = workers.submit(() -> { barrier.await(); try { guest.request("PLACE_ORDER", order(visit)); return "PLACED"; } catch (RemoteException e) { return e.code(); } });
            String payResult = payment.get(6, TimeUnit.SECONDS), orderResult = placement.get(6, TimeUnit.SECONDS);
            if (payResult.equals("PAID")) { assertEquals("SESSION_CLOSED", orderResult); assertNull(admin.refresh().tables().get(0).visitId()); }
            else { assertEquals("INVALID_STATE", payResult); assertEquals("PLACED", orderResult); assertEquals(2, admin.refresh().orders().size()); }
        } finally { workers.shutdownNow(); }
    }
    @Test void databaseFailureMidOrderRollsBackAndSameConnectionCanContinue() throws Exception {
        NetworkClient admin = client("admin", "CafeLink@123"), guest = client("ban1", "Ban1@123"); String visit = open(admin, 1);
        long revision = admin.refresh().revision();
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + temp.resolve("net.db")); var sql = connection.createStatement()) {
            sql.execute("CREATE TRIGGER simulated_write_failure BEFORE INSERT ON order_items BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END");
        }
        assertEquals("DATABASE_ERROR", assertThrows(RemoteException.class, () -> guest.request("PLACE_ORDER", order(visit))).code());
        assertTrue(admin.refresh().orders().isEmpty()); assertEquals(revision, admin.refresh().revision());
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + temp.resolve("net.db")); var sql = connection.createStatement()) { sql.execute("DROP TRIGGER simulated_write_failure"); }
        guest.request("PLACE_ORDER", order(visit)); assertEquals(1, admin.refresh().orders().size());
    }
}
