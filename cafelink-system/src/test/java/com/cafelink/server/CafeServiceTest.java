package com.cafelink.server;

import com.cafelink.common.Models.*;
import com.google.gson.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class CafeServiceTest {
    @TempDir Path temp;
    CafeService service; Identity admin, guest;
    @BeforeEach void start() throws Exception { service = new CafeService(temp.resolve("cafe.db")); admin = service.authenticate("admin", "CafeLink@123"); guest = service.authenticate("ban1", "Ban1@123"); }
    @AfterEach void stop() throws Exception { service.close(); }
    static JsonObject data(String json) { return JsonParser.parseString(json).getAsJsonObject(); }
    String open(int table) throws Exception { return service.execute(admin, "OPEN_TABLE", data("{\"tableId\":" + table + "}")).get("visitId").getAsString(); }
    JsonObject order(String visit) { JsonObject d = data("{\"items\":[{\"menuId\":1,\"quantity\":2,\"unitPriceVnd\":1}],\"note\":\"ít đá\"}"); d.addProperty("visitId", visit); return d; }
    void error(String expected, org.junit.jupiter.api.function.Executable work) { assertEquals(expected, assertThrows(BusinessException.class, work).code()); }
    void serve(long id) throws Exception {
        for (String status : new String[]{"PREPARING", "READY", "SERVED"}) service.execute(admin, "SET_ORDER_STATUS", data("{\"orderId\":" + id + ",\"status\":\"" + status + "\"}"));
    }
    @Test void accountsPasswordsAndServerAssignedRoles() throws Exception {
        assertEquals("ADMIN", admin.role()); assertEquals(1, guest.tableId());
        error("AUTH_FAILED", () -> service.authenticate("ban1", "wrong"));
        error("AUTH_FAILED", () -> service.authenticate("' OR 1=1 --", "x"));
        assertEquals(8, service.snapshot(guest, Map.of()).menu().size());
        assertEquals(1, service.snapshot(guest, Map.of()).tables().size());
    }
    @Test void fullOrderTicketBillingWorkflowUsesServerPrices() throws Exception {
        String visit = open(1); long id = service.execute(guest, "PLACE_ORDER", order(visit)).get("orderId").getAsLong();
        assertEquals(50000, service.snapshot(guest, Map.of()).orders().get(0).totalVnd());
        error("INVALID_STATE", () -> service.execute(admin, "PAY_AND_CLOSE", data("{\"visitId\":\"" + visit + "\"}")));
        serve(id);
        JsonObject input = data("{\"visitId\":\"" + visit + "\",\"note\":\"Tính tiền giúp em\"}");
        long ticket = service.execute(guest, "REQUEST_BILL", input).get("ticketId").getAsLong();
        error("TICKET_ALREADY_OPEN", () -> service.execute(guest, "REQUEST_BILL", input));
        error("INVALID_STATE", () -> service.execute(admin, "PAY_AND_CLOSE", input));
        service.execute(admin, "HANDLE_TICKET", data("{\"ticketId\":" + ticket + ",\"reply\":\"Đã chuẩn bị hóa đơn\"}"));
        assertEquals(50000, service.execute(guest, "GET_BILL", input).get("totalVnd").getAsLong());
        assertEquals(50000, service.execute(admin, "PAY_AND_CLOSE", input).get("totalVnd").getAsLong());
        assertNull(service.snapshot(guest, Map.of()).tables().get(0).visitId());
        error("SESSION_CLOSED", () -> service.execute(admin, "PAY_AND_CLOSE", input));
    }
    @Test void guestCannotOpenManagePayOrReadOtherTable() throws Exception {
        String visit = open(2);
        error("FORBIDDEN", () -> service.execute(guest, "OPEN_TABLE", data("{\"tableId\":1}")));
        error("FORBIDDEN", () -> service.execute(guest, "PLACE_ORDER", order(visit)));
        error("FORBIDDEN", () -> service.execute(guest, "GET_BILL", data("{\"visitId\":\"" + visit + "\"}")));
        error("FORBIDDEN", () -> service.execute(guest, "PAY_AND_CLOSE", data("{\"visitId\":\"" + visit + "\"}")));
    }
    @Test void validationDoesNotPersistPartialOrderOrIncrementRevision() throws Exception {
        String visit = open(1); long rev = service.snapshot(admin, Map.of()).revision();
        JsonObject invalid = order(visit); invalid.getAsJsonArray("items").add(data("{\"menuId\":999,\"quantity\":1}"));
        error("NOT_FOUND", () -> service.execute(guest, "PLACE_ORDER", invalid));
        assertTrue(service.snapshot(admin, Map.of()).orders().isEmpty()); assertEquals(rev, service.snapshot(admin, Map.of()).revision());
        JsonObject fraction = order(visit); fraction.getAsJsonArray("items").get(0).getAsJsonObject().addProperty("quantity", 1.5);
        error("INVALID_INPUT", () -> service.execute(guest, "PLACE_ORDER", fraction));
        error("UNKNOWN_ACTION", () -> service.execute(admin, "DELETE_EVERYTHING", new JsonObject()));
    }
    @Test void orderCannotSkipOrReverseState() throws Exception {
        String visit = open(1); long id = service.execute(guest, "PLACE_ORDER", order(visit)).get("orderId").getAsLong();
        error("INVALID_STATE", () -> service.execute(admin, "SET_ORDER_STATUS", data("{\"orderId\":" + id + ",\"status\":\"SERVED\"}")));
        serve(id); error("INVALID_STATE", () -> service.execute(admin, "SET_ORDER_STATUS", data("{\"orderId\":" + id + ",\"status\":\"PREPARING\"}")));
    }
    @Test void activeVisitAndOrdersPersistAndOldVisitIsRejected() throws Exception {
        String visit = open(1); long id = service.execute(guest, "PLACE_ORDER", order(visit)).get("orderId").getAsLong();
        service.close(); service = new CafeService(temp.resolve("cafe.db"));
        assertEquals(visit, service.snapshot(guest, Map.of()).tables().get(0).visitId()); assertEquals(1, service.snapshot(guest, Map.of()).orders().size());
        error("TABLE_ALREADY_OPEN", () -> open(1)); serve(id); service.execute(admin, "PAY_AND_CLOSE", data("{\"visitId\":\"" + visit + "\"}"));
        String next = open(1); assertNotEquals(visit, next);
        error("SESSION_CLOSED", () -> service.execute(guest, "PLACE_ORDER", order(visit)));
        assertTrue(service.snapshot(guest, Map.of()).orders().isEmpty());
    }
    @Test void emptyTableCanBeClosedWithoutInventingPayment() throws Exception {
        String visit = open(1); JsonObject input = data("{\"visitId\":\"" + visit + "\"}");
        long ticket = service.execute(guest, "CALL_SERVICE", input).get("ticketId").getAsLong();
        error("INVALID_STATE", () -> service.execute(admin, "CLOSE_EMPTY_TABLE", input));
        service.execute(admin, "HANDLE_TICKET", data("{\"ticketId\":" + ticket + ",\"reply\":\"Đã hỗ trợ\"}"));
        error("FORBIDDEN", () -> service.execute(guest, "CLOSE_EMPTY_TABLE", input));
        service.execute(admin, "CLOSE_EMPTY_TABLE", input);
        assertNull(service.snapshot(guest, Map.of()).tables().get(0).visitId());
    }
}
