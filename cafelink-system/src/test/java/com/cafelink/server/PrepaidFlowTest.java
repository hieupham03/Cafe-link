package com.cafelink.server;
import com.cafelink.common.Models.Identity;
import com.google.gson.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.time.Clock;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class PrepaidFlowTest {
 @TempDir Path temp;
 static JsonObject j(String s){return JsonParser.parseString(s).getAsJsonObject();}
 @Test void unpaidCannotReachKitchenAndSignedSimulationIsIdempotentWithoutClosingVisit() throws Exception {
  try(CafeService s=new CafeService(temp.resolve("prepay.db"),new QrConfig(new byte[32],Clock.systemUTC()),true)){
   Identity a=s.authenticate("admin","CafeLink@123");String visit=s.execute(a,"OPEN_TABLE",j("{\"tableId\":1}")).get("visitId").getAsString();
   Identity g=s.joinVisit(s.execute(a,"GET_VISIT_QR",j("{\"visitId\":\""+visit+"\"}")).get("grant").getAsString());
   JsonObject placed=s.execute(g,"order-one","PLACE_ORDER",j("{\"visitId\":\""+visit+"\",\"items\":[{\"menuId\":2,\"quantity\":2,\"expectedVersion\":1,\"expectedPriceVnd\":30000}]}"));
   int id=placed.get("orderId").getAsInt();JsonObject order=j("{\"visitId\":\""+visit+"\",\"orderId\":"+id+"}");
   assertEquals("PAYMENT_REQUIRED",assertThrows(BusinessException.class,()->s.execute(a,"SET_ORDER_STATUS",j("{\"orderId\":"+id+",\"status\":\"PREPARING\"}"))).code());
   JsonObject pay=s.execute(g,"START_ORDER_PAYMENT",order),again=s.execute(g,"START_ORDER_PAYMENT",order);assertEquals(pay.get("paymentId"),again.get("paymentId"));
   JsonObject event=pay.deepCopy();event.addProperty("visitId",visit);event.addProperty("outcome","SUCCESS");
   event.addProperty("token","forged");assertThrows(BusinessException.class,()->s.execute(g,"SIMULATE_PAYMENT",event));
   event.add("token",pay.get("token"));JsonObject result=s.execute(g,"callback-one","SIMULATE_PAYMENT",event);assertEquals("PAID",result.get("state").getAsString());
   assertEquals(result,s.execute(g,"callback-two","SIMULATE_PAYMENT",event));
   assertEquals(visit,s.snapshot(g,Map.of()).tables().get(0).visitId());
   for(String state:List.of("PREPARING","READY","SERVED"))s.execute(a,"SET_ORDER_STATUS",j("{\"orderId\":"+id+",\"status\":\""+state+"\"}"));
   s.execute(a,"CLOSE_VISIT",j("{\"visitId\":\""+visit+"\"}"));
   JsonObject history=s.execute(a,"GET_SALES_HISTORY",j("{\"limit\":10}"));assertEquals(1,history.getAsJsonArray("receipts").size());assertEquals(60000,history.getAsJsonArray("receipts").get(0).getAsJsonObject().get("totalVnd").getAsInt());
  }
 }
}
