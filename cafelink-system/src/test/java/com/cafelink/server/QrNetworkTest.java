package com.cafelink.server;

import com.cafelink.client.*;
import com.cafelink.common.Models.Identity;
import com.google.gson.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.time.Clock;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

class QrNetworkTest {
    @TempDir Path temp;
    static JsonObject data(String json) { return JsonParser.parseString(json).getAsJsonObject(); }
    @Test void realTcpJoinResumeAndRevokeEnforceIdentityOnEveryCommand() throws Exception {
        try (CafeService service = new CafeService(temp.resolve("tcp.db"), new QrConfig(new byte[32], Clock.systemUTC()));
             CafeServer server = new CafeServer(service, "127.0.0.1", 0, ignored -> {})) {
            server.start();
            try (NetworkClient admin = new NetworkClient("127.0.0.1", server.port());
                 NetworkClient guest = new NetworkClient("127.0.0.1", server.port());
                 NetworkClient resumed = new NetworkClient("127.0.0.1", server.port())) {
                admin.login("admin", "CafeLink@123");
                String visit = admin.request("OPEN_TABLE", data("{\"tableId\":1}")).get("visitId").getAsString();
                JsonObject scope = data("{\"visitId\":\""+visit+"\"}");
                String qr = admin.request("GET_VISIT_QR", scope).get("grant").getAsString();
                Identity who = guest.joinVisit(qr); Identity again = resumed.resume(who.credential());
                assertEquals(who.membershipId(), again.membershipId());
                assertEquals(1, resumed.refresh().tables().size());
                assertEquals("FORBIDDEN", assertThrows(RemoteException.class, () -> guest.request("GET_VISIT_QR", scope)).code());
                JsonObject revoke = scope.deepCopy(); revoke.addProperty("membershipId", who.membershipId());
                admin.request("REVOKE_SESSION", revoke);
                assertEquals("SESSION_REVOKED", assertThrows(RemoteException.class, () -> guest.request("PING", new JsonObject())).code());
                assertFalse(guest.connected());
                assertEquals("SESSION_REVOKED", assertThrows(RemoteException.class, resumed::refresh).code());
            }
        }
    }
}
