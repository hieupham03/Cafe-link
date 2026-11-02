package com.cafelink.server;

import com.cafelink.common.Models.Identity;
import com.google.gson.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.time.Clock;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class BusinessWorkflowTest {
    @TempDir Path temp;
    CafeService service;
    Identity admin, guest;
    String grant;
    final QrConfig config = new QrConfig(new byte[32], Clock.systemUTC());
    static JsonObject j(String value) { return JsonParser.parseString(value).getAsJsonObject(); }
    @BeforeEach void open() throws Exception {
        service = new CafeService(temp.resolve("workflow.db"), config, true);
        admin = service.authenticate("admin", "CafeLink@123");
        call(admin, "OPEN_ALL_TABLES", j("{}"));
        grant = call(admin, "GET_TABLE_QR", j("{\"tableId\":1}")).get("grant").getAsString();
        guest = service.joinTable(grant);
    }
    @AfterEach void close() throws Exception { service.close(); }
    JsonObject call(Identity who, String action, JsonObject data) throws Exception { return service.execute(who, action, data); }
    int order(Identity who) throws Exception {
        return call(who, "PLACE_ORDER", j("{\"visitId\":\""+who.visitId()+"\",\"items\":[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPriceVnd\":30000}]}" )).get("orderId").getAsInt();
    }
    JsonObject payment(Identity who, int id) throws Exception { call(admin,"ACCEPT_ORDER",j("{\"orderId\":"+id+"}"));return call(who,"START_ORDER_PAYMENT",j("{\"visitId\":\""+who.visitId()+"\",\"orderId\":"+id+"}")); }
    void pay(Identity who, JsonObject payment) throws Exception { var data=payment.deepCopy();data.addProperty("outcome","SUCCESS");call(who,"SIMULATE_PAYMENT",data); }
    void serve(int id) throws Exception { for (String state:List.of("PREPARING","READY","SERVED")) call(admin,"SET_ORDER_STATUS",j("{\"orderId\":"+id+",\"status\":\""+state+"\"}")); }
    JsonObject resolution(int id, String kind) { return j("{\"orderId\":"+id+",\"resolution\":\""+kind+"\",\"reason\":\"Quán không thể phục vụ\"}"); }

    @Test void leavingCannotRevokeAccessToPendingOrdersOrSupport() throws Exception {
        int id=order(guest);
        assertEquals("VISIT_HAS_WORK",assertThrows(BusinessException.class,()->service.logoutGuest(guest)).code());
        pay(guest,payment(guest,id));
        assertEquals("VISIT_HAS_WORK",assertThrows(BusinessException.class,()->service.logoutGuest(guest)).code());
        var ticket=call(guest,"CALL_SERVICE",j("{\"visitId\":\""+guest.visitId()+"\"}"));serve(id);
        assertThrows(BusinessException.class,()->service.logoutGuest(guest));
        call(admin,"HANDLE_TICKET",j("{\"ticketId\":"+ticket.get("ticketId")+",\"reply\":\"Đã hỗ trợ xong\"}"));
        service.logoutGuest(guest);
        assertEquals("SESSION_REVOKED",assertThrows(BusinessException.class,()->service.resume(guest.credential())).code());
    }
    @Test void servedOrdersKeepTheVisitActiveUntilTheGuestLeaves() throws Exception {
        int id=order(guest);pay(guest,payment(guest,id));serve(id);
        assertEquals("OCCUPIED",service.snapshot(guest,Map.of()).tables().get(0).status());
        assertThrows(BusinessException.class,()->service.continueVisit(guest));

        int nextOrder=order(guest);
        assertEquals(2,service.snapshot(guest,Map.of()).orders().size());
        assertEquals("VISIT_HAS_WORK",assertThrows(BusinessException.class,()->service.logoutGuest(guest)).code());
        call(admin,"RESOLVE_ORDER",resolution(nextOrder,"CANCEL_UNPAID"));
        service.logoutGuest(guest);
        assertEquals("SESSION_REVOKED",assertThrows(BusinessException.class,()->service.resume(guest.credential())).code());
        assertEquals(0,service.snapshot(admin,Map.of()).tables().get(0).activeSessions());
    }
    @Test void cannotContinueAnActiveVisitOrAnAdministrator() {
        assertThrows(BusinessException.class,()->service.continueVisit(guest));
        assertThrows(BusinessException.class,()->service.continueVisit(admin));
    }
    @Test void staffCancellationFencesLatePaymentAndKeepsReason() throws Exception {
        int id=order(guest);var payment=payment(guest,id);
        var result=call(admin,"RESOLVE_ORDER",resolution(id,"CANCEL_UNPAID"));
        assertEquals("CANCELLED",result.get("state").getAsString());
        assertEquals(result,call(admin,"RESOLVE_ORDER",resolution(id,"CANCEL_UNPAID")));
        var latePayment=payment.deepCopy();latePayment.addProperty("outcome","SUCCESS");
        assertEquals("CANCELLED",call(guest,"SIMULATE_PAYMENT",latePayment).get("state").getAsString());
        assertEquals("CANCELLED",service.snapshot(guest,Map.of()).orders().get(0).paymentState());
        assertEquals(0,call(admin,"GET_SALES_HISTORY",j("{}")).getAsJsonArray("receipts").size());
    }
    @Test void paidOrderRefundIsSingleAuditedAndCannotBePrepared() throws Exception {
        int id=order(guest);var payment=payment(guest,id);pay(guest,payment);
        var result=call(admin,"RESOLVE_ORDER",resolution(id,"REFUND"));
        assertEquals("REFUNDED",result.get("state").getAsString());assertEquals(30000,result.get("amountVnd").getAsInt());
        assertEquals(result,call(admin,"RESOLVE_ORDER",resolution(id,"REFUND")));
        assertEquals("REFUNDED",service.snapshot(guest,Map.of()).orders().get(0).paymentState());
        assertEquals(1,call(admin,"GET_SALES_HISTORY",j("{}")).getAsJsonArray("receipts").size());
        assertEquals("REFUNDED",call(admin,"GET_SALES_HISTORY",j("{}")).getAsJsonArray("receipts").get(0).getAsJsonObject().getAsJsonObject("resolution").get("state").getAsString());
        assertThrows(BusinessException.class,()->call(admin,"SET_ORDER_STATUS",j("{\"orderId\":"+id+",\"status\":\"PREPARING\"}")));
        assertThrows(BusinessException.class,()->payment(guest,id));
        assertEquals("OCCUPIED",service.snapshot(guest,Map.of()).tables().get(0).status());
    }
    @Test void refundRequiresStaffReasonAndNotYetPreparing() throws Exception {
        int id=order(guest);pay(guest,payment(guest,id));
        assertEquals("FORBIDDEN",assertThrows(BusinessException.class,()->call(guest,"RESOLVE_ORDER",resolution(id,"REFUND"))).code());
        var empty=resolution(id,"REFUND");empty.addProperty("reason","");assertThrows(BusinessException.class,()->call(admin,"RESOLVE_ORDER",empty));
        call(admin,"SET_ORDER_STATUS",j("{\"orderId\":"+id+",\"status\":\"PREPARING\"}"));
        assertThrows(BusinessException.class,()->call(admin,"RESOLVE_ORDER",resolution(id,"REFUND")));
        assertEquals("PAID",service.snapshot(guest,Map.of()).orders().get(0).paymentState());
    }
    @Test void supportOnlyVisitStaysActiveAfterHandlingUntilGuestLeaves() throws Exception {
        var ticket=call(guest,"CALL_SERVICE",j("{\"visitId\":\""+guest.visitId()+"\"}"));
        call(admin,"HANDLE_TICKET",j("{\"ticketId\":"+ticket.get("ticketId")+",\"reply\":\"Đã mang nước\"}"));
        assertEquals("OCCUPIED",service.snapshot(guest,Map.of()).tables().get(0).status());
        assertThrows(BusinessException.class,()->service.continueVisit(guest));
        assertNotNull(call(guest,"CALL_SERVICE",j("{\"visitId\":\""+guest.visitId()+"\"}")));
        assertEquals("VISIT_HAS_WORK",assertThrows(BusinessException.class,()->service.logoutGuest(guest)).code());
        var open=service.snapshot(guest,Map.of()).tickets().stream().filter(t->t.status().equals("OPEN")).findFirst().orElseThrow();
        call(admin,"HANDLE_TICKET",j("{\"ticketId\":"+open.id()+",\"reply\":\"Đã xử lý\"}"));
        service.logoutGuest(guest);
        assertEquals(0,service.snapshot(admin,Map.of()).tables().get(0).activeSessions());
    }
    List<String> race(java.util.concurrent.Callable<String> a,java.util.concurrent.Callable<String> b) throws Exception {
        var workers=java.util.concurrent.Executors.newFixedThreadPool(2);
        var start=new java.util.concurrent.CountDownLatch(1);
        try {
            var one=workers.submit(()->{start.await();return a.call();});var two=workers.submit(()->{start.await();return b.call();});start.countDown();
            return List.of(one.get(10,java.util.concurrent.TimeUnit.SECONDS),two.get(10,java.util.concurrent.TimeUnit.SECONDS));
        } finally { workers.shutdownNow(); }
    }
    String attempt(Identity who,String action,JsonObject data) throws Exception {
        try { call(who,action,data);return "OK"; } catch(BusinessException denied) { return denied.code(); }
    }
    @Test void refundAndPreparingRaceHasOnlyOneWinner() throws Exception {
        int id=order(guest);pay(guest,payment(guest,id));
        var outcomes=race(()->attempt(admin,"RESOLVE_ORDER",resolution(id,"REFUND")),()->attempt(admin,"SET_ORDER_STATUS",j("{\"orderId\":"+id+",\"status\":\"PREPARING\"}")));
        assertEquals(1,outcomes.stream().filter("OK"::equals).count());
        var result=service.snapshot(guest,Map.of()).orders().get(0);
        assertTrue((result.paymentState().equals("REFUNDED")&&result.status().equals("SUBMITTED"))||(result.paymentState().equals("PAID")&&result.status().equals("PREPARING")));
    }
    @Test void cancelAndPaymentRaceCannotBothWin() throws Exception {
        int id=order(guest);var payment=payment(guest,id);payment.addProperty("outcome","SUCCESS");
        var outcomes=race(()->attempt(admin,"RESOLVE_ORDER",resolution(id,"CANCEL_UNPAID")),()->attempt(guest,"SIMULATE_PAYMENT",payment));
        assertTrue(outcomes.stream().filter("OK"::equals).count()>=1);
        var result=service.snapshot(guest,Map.of()).orders().get(0);
        assertTrue(List.of("PAID","CANCELLED").contains(result.paymentState()));
        assertEquals(result.paymentState().equals("PAID")?1:0,call(admin,"GET_SALES_HISTORY",j("{}")).getAsJsonArray("receipts").size());
    }
    @Test void genuineSchema9UpgradeKeepsQrPaymentAndGuestAccess() throws Exception {
        int id=order(guest);pay(guest,payment(guest,id));String token=guest.credential();service.close();
        try(var connection=java.sql.DriverManager.getConnection("jdbc:sqlite:"+temp.resolve("workflow.db"));var sql=connection.createStatement()) {
            sql.execute("DROP TABLE visit_continuations");sql.execute("DROP TABLE order_resolutions");sql.execute("PRAGMA user_version=9");
        }
        service=new CafeService(temp.resolve("workflow.db"),config,true);guest=service.resume(token);admin=service.authenticate("admin","CafeLink@123");
        assertEquals(grant,call(admin,"GET_TABLE_QR",j("{\"tableId\":1}")).get("grant").getAsString());
        assertEquals("PAID",service.snapshot(guest,Map.of()).orders().get(0).paymentState());
        assertEquals("REFUNDED",call(admin,"RESOLVE_ORDER",resolution(id,"REFUND")).get("state").getAsString());
    }
}
