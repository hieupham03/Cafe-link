package com.cafelink.server;

import com.cafelink.common.Models.Identity;
import com.google.gson.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.time.Clock;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class AutomaticTablesTest {
    @TempDir Path temp;
    static JsonObject j(String s) { return JsonParser.parseString(s).getAsJsonObject(); }
    @Test void upgradesGenuineSchema8WithoutChangingAnActiveManualVisit() throws Exception {
        Path path=temp.resolve("v8.db");var config=new QrConfig(new byte[32],Clock.systemUTC());String visit;
        try(var s=new CafeService(path,config,true)) {var admin=s.authenticate("admin","CafeLink@123");visit=s.execute(admin,"OPEN_TABLE",j("{\"tableId\":1}")).get("visitId").getAsString();}
        try(var c=java.sql.DriverManager.getConnection("jdbc:sqlite:"+path);var sql=c.createStatement()) {
            sql.execute("DROP TABLE table_access");sql.execute("DROP INDEX one_active_visit");sql.execute("ALTER TABLE visits DROP COLUMN service_mode");sql.execute("CREATE UNIQUE INDEX one_active_visit ON visits(table_id) WHERE active=1");MigrationFixtures.removeFinance(sql);sql.execute("PRAGMA user_version=8");
        }
        try(var s=new CafeService(path,config,true)) {var admin=s.authenticate("admin","CafeLink@123");var table=s.snapshot(admin,Map.of()).tables().get(0);assertEquals(visit,table.visitId());assertEquals("PREPAY",table.paymentMode());assertFalse(table.automatic());assertEquals("LEGACY_VISIT_ACTIVE",assertThrows(BusinessException.class,()->s.execute(admin,"OPEN_ALL_TABLES",j("{}"))).code());}
    }
    @Test void pausedTableBlocksNewGuestsWithoutEndingExistingWorkAndCancellationCompletesOnlyOwnVisit() throws Exception {
        try(var s=new CafeService(temp.resolve("pause.db"),new QrConfig(new byte[32],Clock.systemUTC()),true)) {
            var a=s.authenticate("admin","CafeLink@123");s.execute(a,"OPEN_ALL_TABLES",j("{}"));
            var grant=s.execute(a,"GET_TABLE_QR",j("{\"tableId\":1}")).get("grant").getAsString();
            var x=s.joinTable(grant);var y=s.joinTable(grant);
            s.execute(a,"SET_TABLE_ACCEPTING",j("{\"tableId\":1,\"enabled\":0}"));
            assertEquals("TABLE_PAUSED",assertThrows(BusinessException.class,()->s.joinTable(grant)).code());
            String body="{\"visitId\":\""+x.visitId()+"\",\"items\":[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPriceVnd\":30000}]}";
            var one=s.execute(x,"PLACE_ORDER",j(body));var two=s.execute(x,"PLACE_ORDER",j(body));
            s.execute(x,"CANCEL_UNPAID_ORDER",j("{\"visitId\":\""+x.visitId()+"\",\"orderId\":"+one.get("orderId")+"}"));
            assertEquals(x.visitId(),s.snapshot(x,Map.of()).tables().get(0).visitId());
            s.execute(x,"CANCEL_UNPAID_ORDER",j("{\"visitId\":\""+x.visitId()+"\",\"orderId\":"+two.get("orderId")+"}"));
            assertEquals("SESSION_ENDED",s.snapshot(x,Map.of()).tables().get(0).status());
            assertEquals(y.visitId(),s.snapshot(y,Map.of()).tables().get(0).visitId());
            s.execute(a,"OPEN_ALL_TABLES",j("{}"));assertNotNull(s.joinTable(grant));
        }
    }
    @Test void migrationPolicyDoesNotReassignLegacyVisitOrEnableAutomaticOrderingMidVisit() throws Exception {
        try(var s=new CafeService(temp.resolve("legacy.db"),new QrConfig(new byte[32],Clock.systemUTC()),true)) {
            var a=s.authenticate("admin","CafeLink@123");
            var visit=s.execute(a,"OPEN_TABLE",j("{\"tableId\":1}")).get("visitId").getAsString();
            assertEquals("LEGACY_VISIT_ACTIVE",assertThrows(BusinessException.class,()->s.execute(a,"OPEN_ALL_TABLES",j("{}"))).code());
            assertEquals(visit,s.snapshot(a,Map.of()).tables().get(0).visitId());
            s.execute(a,"CLOSE_EMPTY_TABLE",j("{\"visitId\":\""+visit+"\"}"));
            s.execute(a,"OPEN_ALL_TABLES",j("{}"));
            assertEquals("AUTOMATIC_TABLE",assertThrows(BusinessException.class,()->s.execute(a,"OPEN_TABLE",j("{\"tableId\":1}"))).code());
        }
    }
    @Test void stableQrCreatesPrivateVisitsAndCompletionRespectsPaymentAndSupport() throws Exception {
        var config = new QrConfig(new byte[32], Clock.systemUTC());
        String grant, oldVisit;
        try (var s = new CafeService(temp.resolve("auto.db"), config, true)) {
            Identity a = s.authenticate("admin", "CafeLink@123");
            s.execute(a, "OPEN_ALL_TABLES", j("{}"));
            grant = s.execute(a, "GET_TABLE_QR", j("{\"tableId\":1}")).get("grant").getAsString();
            Identity x = s.joinTable(grant), y = s.joinTable(grant);
            oldVisit = x.visitId();
            assertNotEquals(x.visitId(), y.visitId());
            assertEquals(6, s.snapshot(a, Map.of()).tables().size());
            assertEquals(2, s.snapshot(a, Map.of()).tables().get(0).activeSessions());
            String payload = "{\"visitId\":\""+x.visitId()+"\",\"items\":[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPriceVnd\":30000}]}";
            var order = s.execute(x, "fixed-order", "PLACE_ORDER", j(payload));
            int id = order.get("orderId").getAsInt();
            assertTrue(s.snapshot(y, Map.of()).orders().isEmpty());
            var ticket = s.execute(x,"CALL_SERVICE",j("{\"visitId\":\""+x.visitId()+"\"}"));
            assertTrue(s.snapshot(y, Map.of()).tickets().isEmpty());
            s.execute(a,"OPEN_ALL_TABLES",j("{}"));
            assertEquals(grant,s.execute(a,"GET_TABLE_QR",j("{\"tableId\":1}")).get("grant").getAsString());
            assertEquals(2,s.snapshot(a,Map.of()).tables().get(0).activeSessions());
            var pay=s.execute(x,"START_ORDER_PAYMENT",j("{\"visitId\":\""+x.visitId()+"\",\"orderId\":"+id+"}"));
            pay.addProperty("visitId",x.visitId());pay.addProperty("outcome","SUCCESS");
            s.execute(x,"SIMULATE_PAYMENT",pay);
            for (String state: List.of("PREPARING","READY","SERVED")) s.execute(a,"SET_ORDER_STATUS",j("{\"orderId\":"+id+",\"status\":\""+state+"\"}"));
            assertEquals(x.visitId(),s.snapshot(x,Map.of()).tables().get(0).visitId());
            s.execute(a,"HANDLE_TICKET",j("{\"ticketId\":"+ticket.get("ticketId")+",\"reply\":\"Done\"}"));
            assertEquals("SESSION_ENDED",s.snapshot(x,Map.of()).tables().get(0).status());
            assertEquals(order,s.execute(x,"fixed-order","PLACE_ORDER",j(payload)));
            assertEquals("SESSION_CLOSED",assertThrows(BusinessException.class,()->s.execute(x,"late-order","PLACE_ORDER",j(payload))).code());
            assertNotEquals(oldVisit,s.joinTable(grant).visitId());
        }
        try(var s=new CafeService(temp.resolve("auto.db"),config,true)) {
            Identity a=s.authenticate("admin","CafeLink@123");
            assertEquals(grant,s.execute(a,"GET_TABLE_QR",j("{\"tableId\":1}")).get("grant").getAsString());
            assertNotEquals(oldVisit,s.joinTable(grant).visitId());
        }
    }
}
