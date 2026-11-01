package com.cafelink.server;

import com.cafelink.common.Json;
import com.cafelink.common.Models.*;
import com.google.gson.JsonObject;
import java.nio.file.Path;
import java.time.*;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class StoreOperationsTest {
    @TempDir Path temp;
    CafeService service;Identity admin,guest;
    @BeforeEach void open() throws Exception {
        service=new CafeService(temp.resolve("store.db"),new QrConfig(new byte[32],Clock.fixed(Instant.parse("2026-11-01T10:00:00Z"),ZoneOffset.UTC)),true);
        admin=service.authenticate("admin","CafeLink@123");call(admin,"OPEN_ALL_TABLES",new JsonObject());
        guest=service.joinTable(call(admin,"GET_TABLE_QR",data("{\"tableId\":1}")).get("grant").getAsString());
    }
    @AfterEach void close() throws Exception {service.close();}
    JsonObject data(String s){return Json.GSON.fromJson(s,JsonObject.class);}
    JsonObject call(Identity who,String action,JsonObject input) throws Exception{return service.execute(who,UUID.randomUUID().toString(),action,input);}
    JsonObject orderData() throws Exception {
        MenuItem item=service.snapshot(guest,Map.of()).menu().stream().filter(i->i.id()==2).findFirst().orElseThrow();
        return data("{\"visitId\":\""+guest.visitId()+"\",\"items\":[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":"+item.version()+",\"expectedPurchaseVersion\":"+item.purchaseVersion()+",\"expectedPriceVnd\":"+item.priceVnd()+"}],\"expectedTaxVersion\":"+service.snapshot(guest,Map.of()).taxSettings().version()+"}");
    }
    long place() throws Exception{return call(guest,"PLACE_ORDER",orderData()).get("orderId").getAsLong();}
    JsonObject id(long id){return data("{\"orderId\":"+id+"}");}
    JsonObject payment(long id) throws Exception {JsonObject input=id(id);input.addProperty("visitId",guest.visitId());return call(guest,"START_ORDER_PAYMENT",input);}
    void accept(long id) throws Exception {call(admin,"ACCEPT_ORDER",id(id));}
    JsonObject tax(int bps,String mode) throws Exception {JsonObject input=data("{\"name\":\"VAT\",\"rateBps\":"+bps+",\"mode\":\""+mode+"\",\"expectedVersion\":"+service.snapshot(guest,Map.of()).taxSettings().version()+"}");return call(admin,"SAVE_TAX_SETTINGS",input);}
    void paid(long id) throws Exception {accept(id);JsonObject input=payment(id);input.addProperty("outcome","SUCCESS");call(guest,"SIMULATE_PAYMENT",input);}
    OrderView view(long id) throws Exception{return service.snapshot(guest,Map.of()).orders().stream().filter(o->o.id()==id).findFirst().orElseThrow();}
    @Test void customerCannotPayOrAcceptBeforeStaffConfirms() throws Exception {
        long id=place();assertEquals("WAITING",view(id).acceptanceState());
        assertEquals("ACCEPTANCE_REQUIRED",assertThrows(BusinessException.class,()->payment(id)).code());
        assertEquals("FORBIDDEN",assertThrows(BusinessException.class,()->call(guest,"ACCEPT_ORDER",id(id))).code());
        accept(id);assertEquals("ACCEPTED",view(id).acceptanceState());assertEquals(30000,payment(id).get("amountVnd").getAsLong());
        assertEquals("PAYMENT_REQUIRED",assertThrows(BusinessException.class,()->call(admin,"SET_ORDER_STATUS",data("{\"orderId\":"+id+",\"status\":\"PREPARING\"}"))).code());
    }
    @Test void soldOutBetweenOrderAndAcceptanceCanBeRejectedWithoutCharging() throws Exception {
        long id=place();MenuItem m=service.snapshot(admin,Map.of()).menu().stream().filter(i->i.id()==2).findFirst().orElseThrow();
        JsonObject update=Json.object(m);update.addProperty("menuId",2);update.addProperty("expectedVersion",m.version());update.addProperty("available",false);call(admin,"UPDATE_MENU_ITEM",update);
        assertEquals("ITEM_UNAVAILABLE",assertThrows(BusinessException.class,()->accept(id)).code());
        call(admin,"RESOLVE_ORDER",data("{\"orderId\":"+id+",\"resolution\":\"CANCEL_UNPAID\",\"reason\":\"Quán vừa hết sữa\"}"));
        assertEquals("REJECTED",view(id).acceptanceState());assertEquals("CANCELLED",view(id).paymentState());assertThrows(BusinessException.class,()->payment(id));
    }
    @Test void acceptanceRetryKeepsOneDecisionAndOriginalTimestamp() throws Exception {
        long id=place();JsonObject input=id(id);String key="accept-once";
        JsonObject first=service.execute(admin,key,"ACCEPT_ORDER",input);String at=view(id).acceptedAt();
        assertEquals(first,service.execute(admin,key,"ACCEPT_ORDER",input));accept(id);assertEquals(at,view(id).acceptedAt());
        assertEquals("ACCEPTED",service.outcome(admin,key).getAsJsonObject("result").get("acceptanceState").getAsString());
    }
    @Test void cancelledOrderCannotBeAcceptedEvenIfStaffHasAnOldScreen() throws Exception {
        long id=place();JsonObject input=id(id);input.addProperty("visitId",guest.visitId());call(guest,"CANCEL_UNPAID_ORDER",input);
        assertEquals("INVALID_STATE",assertThrows(BusinessException.class,()->accept(id)).code());
    }
    @Test void exclusiveTaxIsFrozenForPaymentAndRefundAfterSettingsChange() throws Exception {
        tax(800,"EXCLUSIVE");long id=place();assertEquals(30000,view(id).subtotalVnd());assertEquals(2400,view(id).taxVnd());assertEquals(32400,view(id).totalVnd());
        tax(1000,"EXCLUSIVE");paid(id);assertEquals(32400,view(id).totalVnd());
        JsonObject result=call(admin,"RESOLVE_ORDER",data("{\"orderId\":"+id+",\"resolution\":\"REFUND\",\"reason\":\"Không thể phục vụ\"}"));assertEquals(32400,result.get("amountVnd").getAsLong());
    }
    @Test void inclusiveTaxSplitsMenuPriceWithoutAddingItAgain() throws Exception {
        tax(800,"INCLUSIVE");long id=place();assertEquals(30000,view(id).totalVnd());assertEquals(27778,view(id).subtotalVnd());assertEquals(2222,view(id).taxVnd());
        paid(id);assertEquals(30000,view(id).totalVnd());
    }
    @Test void staleTaxQuoteAndConcurrentSettingsEditAreRejected() throws Exception {
        JsonObject old=orderData();tax(800,"EXCLUSIVE");assertEquals("TAX_CHANGED",assertThrows(BusinessException.class,()->call(guest,"PLACE_ORDER",old)).code());
        assertEquals("VERSION_CONFLICT",assertThrows(BusinessException.class,()->call(admin,"SAVE_TAX_SETTINGS",data("{\"name\":\"VAT\",\"rateBps\":1000,\"mode\":\"EXCLUSIVE\",\"expectedVersion\":1}"))).code());
        assertEquals("FORBIDDEN",assertThrows(BusinessException.class,()->call(guest,"SAVE_TAX_SETTINGS",data("{}"))).code());
        assertTrue(service.snapshot(guest,Map.of()).orders().isEmpty());
    }
    @Test void roundingIsIntegerVndWithSafeTotals() {
        var settings=new TaxSettings("VAT",825,"EXCLUSIVE",1);var q=StoreFinance.calculate(100001,settings);assertEquals(8250,q.taxVnd());assertEquals(108251,q.totalVnd());
        assertEquals(0,StoreFinance.calculate(1000,new TaxSettings("VAT",1,"EXCLUSIVE",1)).taxVnd());
        assertEquals(1,StoreFinance.calculate(5000,new TaxSettings("VAT",1,"EXCLUSIVE",1)).taxVnd());
        assertThrows(BusinessException.class,()->StoreFinance.calculate(100,new TaxSettings("VAT",10001,"EXCLUSIVE",1)));
    }
    @Test void reportSeparatesPendingSalesRefundsAndVoidedExpenses() throws Exception {
        tax(800,"EXCLUSIVE");long paid=place();paid(paid);place();
        JsonObject expense=data("{\"amountVnd\":10000,\"category\":\"Nguyên liệu\",\"note\":\"Mua sữa\",\"spentOn\":\"2026-11-01\"}");
        JsonObject first=service.execute(admin,"expense-once","CREATE_EXPENSE",expense);assertEquals(first,service.execute(admin,"expense-once","CREATE_EXPENSE",expense));
        JsonObject query=data("{\"fromDate\":\"2026-11-01\",\"toDate\":\"2026-11-01\"}");JsonObject report=call(admin,"GET_FINANCE_REPORT",query);
        assertEquals(32400,report.get("grossVnd").getAsLong());assertEquals(10000,report.get("expenseVnd").getAsLong());assertEquals(22400,report.get("balanceVnd").getAsLong());
        call(admin,"RESOLVE_ORDER",data("{\"orderId\":"+paid+",\"resolution\":\"REFUND\",\"reason\":\"Hết nguyên liệu\"}"));
        report=call(admin,"GET_FINANCE_REPORT",query);assertEquals(32400,report.get("refundVnd").getAsLong());assertEquals(0,report.get("netVnd").getAsLong());assertEquals(0,report.get("netTaxVnd").getAsLong());
        call(admin,"VOID_EXPENSE",data("{\"expenseId\":"+first.get("expenseId")+",\"reason\":\"Ghi nhầm\"}"));report=call(admin,"GET_FINANCE_REPORT",query);assertEquals(0,report.get("expenseVnd").getAsLong());assertEquals(1,report.getAsJsonArray("expenses").size());assertFalse(report.getAsJsonArray("expenses").get(0).getAsJsonObject().get("voidedAt").isJsonNull());
    }
    @Test void reportAndExpensesAreAdminOnlyAndDatesAreValidated() throws Exception {
        assertEquals("FORBIDDEN",assertThrows(BusinessException.class,()->call(guest,"GET_FINANCE_REPORT",data("{}"))).code());
        assertEquals("FORBIDDEN",assertThrows(BusinessException.class,()->call(guest,"CREATE_EXPENSE",data("{}"))).code());
        for(String dates:List.of("{\"fromDate\":\"2026-12-02\",\"toDate\":\"2026-12-01\"}","{\"fromDate\":\"2020-01-01\",\"toDate\":\"2026-11-01\"}","{\"fromDate\":\"not-a-date\"}"))assertThrows(BusinessException.class,()->call(admin,"GET_FINANCE_REPORT",data(dates)));
        assertThrows(BusinessException.class,()->call(admin,"CREATE_EXPENSE",data("{\"amountVnd\":-1,\"category\":\"Khác\",\"note\":\"x\",\"spentOn\":\"2026-11-01\"}")));
    }
    @Test void reportUsesCafeMidnightAndDatesRefundsSeparately() throws Exception {
        tax(800,"EXCLUSIVE");long id=place();paid(id);
        call(admin,"RESOLVE_ORDER",data("{\"orderId\":"+id+",\"resolution\":\"REFUND\",\"reason\":\"Không thể phục vụ\"}"));
        try(Connection c=DriverManager.getConnection("jdbc:sqlite:"+temp.resolve("store.db"));Statement sql=c.createStatement()) {
            sql.executeUpdate("UPDATE order_payments SET updated_at='2026-10-31T16:59:59.999Z' WHERE state='PAID'");
            sql.executeUpdate("UPDATE order_resolutions SET created_at='2026-10-31T17:00:00Z'");
        }
        JsonObject yesterday=call(admin,"GET_FINANCE_REPORT",data("{\"fromDate\":\"2026-10-31\",\"toDate\":\"2026-10-31\"}"));
        JsonObject today=call(admin,"GET_FINANCE_REPORT",data("{\"fromDate\":\"2026-11-01\",\"toDate\":\"2026-11-01\"}"));
        assertEquals(32400,yesterday.get("grossVnd").getAsLong());assertEquals(0,yesterday.get("refundVnd").getAsLong());
        assertEquals(0,today.get("grossVnd").getAsLong());assertEquals(32400,today.get("refundVnd").getAsLong());assertEquals(-2400,today.get("netTaxVnd").getAsLong());
    }
    @Test void cashVisitLedgerIncludesFrozenOrderTax() throws Exception {
        tax(800,"EXCLUSIVE");place();
        try(Connection c=DriverManager.getConnection("jdbc:sqlite:"+temp.resolve("store.db"));PreparedStatement sql=c.prepareStatement("INSERT INTO payments(visit_id,total_vnd,method,paid_at) VALUES(?,32400,'CASH_SIMULATED','2026-11-01T09:00:00Z')")) {sql.setString(1,guest.visitId());sql.executeUpdate();}
        JsonObject report=call(admin,"GET_FINANCE_REPORT",data("{\"fromDate\":\"2026-11-01\",\"toDate\":\"2026-11-01\"}"));
        assertEquals(32400,report.get("grossVnd").getAsLong());assertEquals(2400,report.get("netTaxVnd").getAsLong());
    }
    @Test void realV11SchemaMigratesExistingPaidOrderWithoutRepricing() throws Exception {
        long id=place();paid(id);service.close();
        try(Connection c=DriverManager.getConnection("jdbc:sqlite:"+temp.resolve("store.db"));Statement sql=c.createStatement()) {
            sql.execute("DROP TABLE expenses");
            for(String column:List.of("acceptance_state","accepted_at","accepted_by","subtotal_vnd","tax_vnd","total_vnd","tax_name","tax_rate_bps","tax_included","tax_settings_version"))sql.execute("ALTER TABLE orders DROP COLUMN "+column);
            sql.execute("DELETE FROM store_settings WHERE name LIKE 'tax_%'");sql.execute("PRAGMA user_version=11");
        }
        service=new CafeService(temp.resolve("store.db"),new QrConfig(new byte[32],Clock.fixed(Instant.parse("2026-11-01T10:00:00Z"),ZoneOffset.UTC)),true);
        OrderView restored=view(id);assertEquals("ACCEPTED",restored.acceptanceState());assertEquals("PAID",restored.paymentState());assertEquals(30000,restored.totalVnd());assertEquals(0,restored.taxVnd());
        tax(800,"EXCLUSIVE");assertEquals(30000,view(id).totalVnd());assertEquals(0,view(id).taxVnd());
    }
}
