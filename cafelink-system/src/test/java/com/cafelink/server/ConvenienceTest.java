package com.cafelink.server;
import com.cafelink.common.Models.Identity;
import com.google.gson.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.time.Clock;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class ConvenienceTest {
 @TempDir Path temp;CafeService s;Identity admin,guest,other;
 static JsonObject j(String value){return JsonParser.parseString(value).getAsJsonObject();}
 @BeforeEach void open()throws Exception{s=new CafeService(temp.resolve("c.db"),new QrConfig(new byte[32],Clock.systemUTC()),true);admin=s.authenticate("admin","CafeLink@123");call(admin,"OPEN_ALL_TABLES",j("{}"));String grant=call(admin,"GET_TABLE_QR",j("{\"tableId\":1}")).get("grant").getAsString();guest=s.joinTable(grant);other=s.joinTable(grant);}
 @AfterEach void close()throws Exception{s.close();}
 JsonObject call(Identity who,String action,JsonObject data)throws Exception{return s.execute(who,action,data);}
 JsonObject cart(String items){return j("{\"visitId\":\""+guest.visitId()+"\",\"items\":"+items+"}");}
 @Test void twoCupsWithDifferentNotesKeepOwnInstructionsAndPrice()throws Exception{
  call(guest,"PLACE_ORDER",cart("[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPriceVnd\":30000,\"note\":\"Ít đá\"},{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPriceVnd\":30000,\"note\":\"Không đường\"}]"));
  var order=com.cafelink.common.Json.object(s.snapshot(guest,Map.of()).orders().get(0));assertEquals(60000,order.get("totalVnd").getAsInt());assertEquals(2,order.getAsJsonArray("items").size());assertEquals("Ít đá",order.getAsJsonArray("items").get(0).getAsJsonObject().get("note").getAsString());
 }
 @Test void duplicateLinesAndTooManyCupsRemainInvalid() {
  assertThrows(BusinessException.class,()->call(guest,"PLACE_ORDER",cart("[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPriceVnd\":30000},{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPriceVnd\":30000}]")));
  assertThrows(BusinessException.class,()->call(guest,"PLACE_ORDER",cart("[{\"menuId\":2,\"quantity\":20,\"expectedVersion\":1,\"expectedPriceVnd\":30000,\"note\":\"A\"},{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPriceVnd\":30000,\"note\":\"B\"}]")));
 }
 @Test void ticketAmendmentIsVersionedPrivateAndCancellationDoesNotCreateAnotherTicket()throws Exception{
  var ticket=call(guest,"CALL_SERVICE",j("{\"visitId\":\""+guest.visitId()+"\",\"note\":\"Nước\"}"));
  var amend=j("{\"visitId\":\""+guest.visitId()+"\",\"ticketId\":"+ticket.get("ticketId")+",\"expectedVersion\":0,\"note\":\"Thêm khăn\"}");
  assertEquals("STALE_SESSION",assertThrows(BusinessException.class,()->call(other,"AMEND_SERVICE",amend)).code());
  var result=s.execute(guest,"fixed-amend","AMEND_SERVICE",amend);assertEquals(1,result.get("version").getAsInt());assertEquals(result,s.execute(guest,"fixed-amend","AMEND_SERVICE",amend));
  assertThrows(BusinessException.class,()->call(admin,"HANDLE_TICKET",j("{\"ticketId\":"+ticket.get("ticketId")+",\"expectedVersion\":0,\"reply\":\"Done\"}")));
  call(guest,"CANCEL_SERVICE",j("{\"visitId\":\""+guest.visitId()+"\",\"ticketId\":"+ticket.get("ticketId")+",\"expectedVersion\":1}"));
  assertEquals(1,s.snapshot(guest,Map.of()).tickets().size());assertEquals("CANCELLED",s.snapshot(guest,Map.of()).tickets().get(0).status());assertEquals("SESSION_ENDED",s.snapshot(guest,Map.of()).tables().get(0).status());
 }
 @Test void presentationEditKeepsPurchaseVersionButPriceChangeRequiresReview()throws Exception{
  var item=com.cafelink.common.Json.object(s.snapshot(admin,Map.of()).menu().get(1));item.addProperty("menuId",2);item.addProperty("expectedVersion",1);item.addProperty("description","Ảnh và lời giới thiệu mới");
  var updated=call(admin,"UPDATE_MENU_ITEM",item);assertEquals(2,updated.get("version").getAsInt());assertEquals(1,updated.get("purchaseVersion").getAsInt());
  call(guest,"PLACE_ORDER",cart("[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPurchaseVersion\":1,\"expectedPriceVnd\":30000}]"));
  updated.addProperty("menuId",2);updated.addProperty("expectedVersion",2);updated.addProperty("priceVnd",35000);call(admin,"UPDATE_MENU_ITEM",updated);
  assertEquals("MENU_CHANGED",assertThrows(BusinessException.class,()->call(guest,"PLACE_ORDER",cart("[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPurchaseVersion\":1,\"expectedPriceVnd\":30000}]"))).code());
 }
 @Test void stoppingNewOrdersPreservesPaymentAndFulfillment()throws Exception{
  var order=call(guest,"PLACE_ORDER",cart("[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPriceVnd\":30000}]"));
  call(admin,"SET_STORE_ACCEPTING",j("{\"enabled\":0}"));assertEquals("ORDERING_PAUSED",assertThrows(BusinessException.class,()->call(guest,"PLACE_ORDER",cart("[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPriceVnd\":30000}]"))).code());
  var p=call(guest,"START_ORDER_PAYMENT",j("{\"visitId\":\""+guest.visitId()+"\",\"orderId\":"+order.get("orderId")+"}"));p.addProperty("outcome","SUCCESS");call(guest,"SIMULATE_PAYMENT",p);
  call(admin,"SET_ORDER_STATUS",j("{\"orderId\":"+order.get("orderId")+",\"status\":\"PREPARING\"}"));
 }
 @Test void staffCanFindAcceptedOrDiscardedCommandWithoutExposingCredentials()throws Exception{
  var body=cart("[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPriceVnd\":30000}]");s.execute(guest,"help-accepted","PLACE_ORDER",body);s.discard(guest,"help-discarded","PLACE_ORDER",body);
  var found=call(admin,"FIND_ASSISTANCE",j("{\"query\":\"help-accepted\"}"));assertEquals(1,found.getAsJsonArray("results").size());assertFalse(found.toString().contains("credential"));
  assertEquals("DISCARDED",call(admin,"FIND_ASSISTANCE",j("{\"query\":\"help-discarded\"}")).getAsJsonArray("results").get(0).getAsJsonObject().get("state").getAsString());
  assertEquals("FORBIDDEN",assertThrows(BusinessException.class,()->call(guest,"FIND_ASSISTANCE",j("{\"query\":\"help-accepted\"}"))).code());
 }
 @Test void schema10WithRealRowsUpgradesWithoutChangingPaidAmountOrQr()throws Exception{
  var order=call(guest,"PLACE_ORDER",cart("[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPriceVnd\":30000}]"));String token=guest.credential();
  var p=call(guest,"START_ORDER_PAYMENT",j("{\"visitId\":\""+guest.visitId()+"\",\"orderId\":"+order.get("orderId")+"}"));p.addProperty("outcome","SUCCESS");call(guest,"SIMULATE_PAYMENT",p);s.close();
  try(var connection=java.sql.DriverManager.getConnection("jdbc:sqlite:"+temp.resolve("c.db"));var sql=connection.createStatement()){
   sql.execute("DROP TABLE ticket_changes");sql.execute("ALTER TABLE tickets DROP COLUMN version");sql.execute("ALTER TABLE menu DROP COLUMN purchase_version");
   sql.execute("CREATE TABLE old_items(order_id INTEGER NOT NULL REFERENCES orders(id),menu_id INTEGER NOT NULL REFERENCES menu(id),name TEXT NOT NULL,quantity INTEGER NOT NULL,unit_price_vnd INTEGER NOT NULL,PRIMARY KEY(order_id,menu_id))");sql.execute("INSERT INTO old_items SELECT order_id,menu_id,name,quantity,unit_price_vnd FROM order_items");sql.execute("DROP TABLE order_items");sql.execute("ALTER TABLE old_items RENAME TO order_items");MigrationFixtures.removeFinance(sql);sql.execute("PRAGMA user_version=10");
  }
  s=new CafeService(temp.resolve("c.db"),new QrConfig(new byte[32],Clock.systemUTC()),true);guest=s.resume(token);assertEquals(30000,s.snapshot(guest,Map.of()).orders().get(0).totalVnd());assertEquals("PAID",s.snapshot(guest,Map.of()).orders().get(0).paymentState());
 }
}
