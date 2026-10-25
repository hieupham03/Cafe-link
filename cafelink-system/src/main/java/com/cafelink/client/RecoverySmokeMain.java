package com.cafelink.client;

import com.cafelink.common.*;
import com.google.gson.*;
import java.io.IOException;
import java.nio.file.Path;

/** Two-process fixture: pending journal survives a client JVM and server restart. */
public final class RecoverySmokeMain {
    private RecoverySmokeMain() { }
    public static void main(String[] args) throws Exception {
        Arguments options = new Arguments(args); int port = options.integer("port", 5050); String mode = options.get("mode", "populate");
        Path journal = Path.of(options.get("journal", "target/recovery-smoke-client.json"));
        try (NetworkClient owner = new NetworkClient("127.0.0.1", port)) {
            owner.login("admin", "CafeLink@123");
            if (mode.equals("populate")) {
                JsonObject table = new JsonObject(); table.addProperty("tableId", 1); String visit = owner.request("OPEN_TABLE", table).get("visitId").getAsString();
                try (NetworkClient guest = new NetworkClient("127.0.0.1", port, journal)) {
                    guest.login("ban1", "Ban1@123"); JsonObject data = JsonParser.parseString("{\"items\":[{\"menuId\":2,\"quantity\":1}]}").getAsJsonObject(); data.addProperty("visitId", visit);
                    try { guest.request("PLACE_ORDER", data); throw new IllegalStateException("Fault did not disconnect guest"); }
                    catch (RemoteException error) { throw error; }
                    catch (IOException expected) { }
                    if (!guest.recoveryEntries().get(0).status().equals("PENDING")) throw new IllegalStateException("Pending journal missing");
                }
            } else if (mode.equals("verify-restart")) {
                try (NetworkClient guest = new NetworkClient("127.0.0.1", port, journal)) {
                    guest.login("ban1", "Ban1@123"); guest.recover();
                    if (guest.recoveryEntries().size() != 1 || !guest.recoveryEntries().get(0).status().equals("RESOLVED")) throw new IllegalStateException("Outcome not recovered");
                }
            } else throw new IllegalArgumentException("Unknown smoke mode");
            var state = owner.refresh();
            if (state.orders().size() != 1 || state.orders().get(0).totalVnd() != 30000) throw new IllegalStateException("Order duplicated or lost");
            JsonObject result = new JsonObject(); result.addProperty("status", "PASS"); result.addProperty("mode", mode); result.addProperty("orders", 1); result.addProperty("totalVnd", 30000); result.addProperty("journalStatus", mode.equals("populate") ? "PENDING" : "RESOLVED");
            System.out.println(Json.GSON.toJson(result));
        }
    }
}
