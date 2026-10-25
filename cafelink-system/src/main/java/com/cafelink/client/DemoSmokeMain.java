package com.cafelink.client;

import com.cafelink.common.*;
import com.cafelink.common.Models.*;
import com.google.gson.*;
import java.util.ArrayList;
import java.util.List;

/** Reproducible demo fixture; run against a separate ServerMain process with a fresh database. */
public final class DemoSmokeMain {
    public static void main(String[] args) throws Exception {
        Arguments options = new Arguments(args); String host = options.get("host", "127.0.0.1"); int port = options.integer("port", 5050);
        List<NetworkClient> guests = new ArrayList<>();
        try (NetworkClient admin = new NetworkClient(host, port)) {
            admin.login("admin", "CafeLink@123");
            if (options.get("mode", "populate").equals("populate")) {
                for (int i = 1; i <= 3; i++) {
                    JsonObject open = new JsonObject(); open.addProperty("tableId", i); String visit = admin.request("OPEN_TABLE", open).get("visitId").getAsString();
                    NetworkClient guest = new NetworkClient(host, port); guests.add(guest); guest.login("ban" + i, "Ban" + i + "@123");
                    JsonObject item = new JsonObject(); item.addProperty("menuId", i); item.addProperty("quantity", i);
                    JsonArray items = new JsonArray(); items.add(item); JsonObject order = new JsonObject(); order.addProperty("visitId", visit); order.add("items", items);
                    guest.request("PLACE_ORDER", order);
                }
                Snapshot first = guests.get(0).refresh(); JsonObject ticket = new JsonObject(); ticket.addProperty("visitId", first.tables().get(0).visitId()); ticket.addProperty("note", "Cho em thêm nước lọc");
                long id = guests.get(0).request("CALL_SERVICE", ticket).get("ticketId").getAsLong();
                JsonObject reply = new JsonObject(); reply.addProperty("ticketId", id); reply.addProperty("reply", "Đã mang nước"); admin.request("HANDLE_TICKET", reply);
            }
            Snapshot snapshot = admin.refresh();
            long total = snapshot.orders().stream().mapToLong(OrderView::totalVnd).sum();
            if (snapshot.orders().size() != 3 || total != 190000 || snapshot.tickets().size() != 1 || !snapshot.tickets().get(0).status().equals("HANDLED"))
                throw new IllegalStateException("Demo database state differs from expected 3 orders / 190000 VND / handled ticket");
            try (NetworkClient restored = new NetworkClient(host, port)) {
                restored.login("ban1", "Ban1@123"); if (restored.latest().orders().size() != 1) throw new IllegalStateException("Guest isolation/reconnect failed");
            }
            JsonObject report = new JsonObject(); report.addProperty("status", "PASS"); report.addProperty("mode", options.get("mode", "populate")); report.addProperty("orders", snapshot.orders().size()); report.addProperty("totalVnd", total); report.addProperty("handledTickets", snapshot.tickets().size());
            System.out.println(Json.GSON.toJson(report));
        } finally { guests.forEach(NetworkClient::close); }
    }
}
