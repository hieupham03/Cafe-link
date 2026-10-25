package com.cafelink.server;
import com.cafelink.common.Models.Identity;
import com.google.gson.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class PaymentAcceptanceTest {
 @TempDir Path temp;CafeService s;Identity admin,guest;String visit;final byte[] key=new byte[32];
 static JsonObject j(String text){return JsonParser.parseString(text).getAsJsonObject();}
 @BeforeEach void start()throws Exception{s=new CafeService(temp.resolve("accept.db"),new QrConfig(key,Clock.systemUTC()),true);admin=s.authenticate("admin","CafeLink@123");visit=call(admin,"OPEN_TABLE",j("{\"tableId\":1}")).get("visitId").getAsString();guest=s.joinVisit(call(admin,"GET_VISIT_QR",j("{\"visitId\":\""+visit+"\"}")).get("grant").getAsString());}
 @AfterEach void stop()throws Exception{s.close();}
 JsonObject call(Identity who,String action,JsonObject data)throws Exception{return s.execute(who,UUID.randomUUID().toString(),action,data);}
 JsonObject order()throws Exception{return call(guest,"PLACE_ORDER",j("{\"visitId\":\""+visit+"\",\"items\":[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPriceVnd\":30000}]}"));}
 JsonObject startPay(int order)throws Exception{return call(guest,"START_ORDER_PAYMENT",j("{\"visitId\":\""+visit+"\",\"orderId\":"+order+"}"));}
 JsonObject finish(JsonObject pay,String outcome)throws Exception{JsonObject d=pay.deepCopy();d.addProperty("outcome",outcome);return call(guest,"SIMULATE_PAYMENT",d);}
 JsonObject payOne()throws Exception{JsonObject p=startPay(order().get("orderId").getAsInt());finish(p,"SUCCESS");return p;}
 @Test void terminalFailureCanRetryButLateOldSuccessCannotPayAgain()throws Exception{
  int id=order().get("orderId").getAsInt();JsonObject failed=startPay(id);assertEquals("FAILED",finish(failed,"FAILED").get("state").getAsString());JsonObject next=startPay(id);assertNotEquals(failed.get("paymentId"),next.get("paymentId"));finish(next,"SUCCESS");assertEquals("FAILED",finish(failed,"SUCCESS").get("state").getAsString());assertEquals(1,call(admin,"GET_SALES_HISTORY",j("{}")).getAsJsonArray("receipts").size());
 }
 @Test void wrongAmountOtherVisitAndPrivilegesCannotConfirmOrReadSales()throws Exception{
  JsonObject payment=startPay(order().get("orderId").getAsInt()),bad=payment.deepCopy();bad.addProperty("outcome","SUCCESS");bad.addProperty("amountVnd",1);assertEquals("PAYMENT_AMOUNT_MISMATCH",assertThrows(BusinessException.class,()->call(guest,"SIMULATE_PAYMENT",bad)).code());
  String other=call(admin,"OPEN_TABLE",j("{\"tableId\":2}")).get("visitId").getAsString();Identity outsider=s.joinVisit(call(admin,"GET_VISIT_QR",j("{\"visitId\":\""+other+"\"}")).get("grant").getAsString());JsonObject forged=payment.deepCopy();forged.addProperty("visitId",other);forged.addProperty("outcome","SUCCESS");assertThrows(BusinessException.class,()->call(outsider,"SIMULATE_PAYMENT",forged));assertThrows(BusinessException.class,()->call(guest,"GET_SALES_HISTORY",j("{}")));assertThrows(BusinessException.class,()->call(admin,"SIMULATE_PAYMENT",forged));assertEquals("PENDING",startPay(payment.get("orderId").getAsInt()).get("state").getAsString());
 }
 @Test void cancellationFencesLateSuccessAndPaidOrdersBlockEarlyClose()throws Exception{
  JsonObject payment=startPay(order().get("orderId").getAsInt());call(guest,"CANCEL_UNPAID_ORDER",j("{\"visitId\":\""+visit+"\",\"orderId\":"+payment.get("orderId").getAsInt()+"}"));assertEquals("CANCELLED",finish(payment,"SUCCESS").get("state").getAsString());assertEquals(0,call(admin,"GET_SALES_HISTORY",j("{}")).getAsJsonArray("receipts").size());
  JsonObject paid=payOne();assertThrows(BusinessException.class,()->call(admin,"CLOSE_VISIT",j("{\"visitId\":\""+visit+"\"}")));assertThrows(BusinessException.class,()->call(guest,"CANCEL_UNPAID_ORDER",j("{\"visitId\":\""+visit+"\",\"orderId\":"+paid.get("orderId").getAsInt()+"}")));
 }
 @Test void restartKeepsOnePaidReceiptAndHistoricalPricesAfterMenuChange()throws Exception{
  JsonObject payment=payOne();String token=guest.credential();s.close();s=new CafeService(temp.resolve("accept.db"),new QrConfig(key,Clock.systemUTC()),true);admin=s.authenticate("admin","CafeLink@123");guest=s.resume(token);assertEquals("PAID",finish(payment,"SUCCESS").get("state").getAsString());
  var item=s.snapshot(admin,Map.of()).menu().stream().filter(m->m.id()==2).findFirst().orElseThrow();JsonObject edit=j("{\"menuId\":2,\"expectedVersion\":1,\"name\":\"Tên mới\",\"priceVnd\":99000,\"category\":\"Cà phê\",\"active\":true,\"available\":true}");call(admin,"UPDATE_MENU_ITEM",edit);
  JsonObject detail=call(guest,"GET_SALES_RECEIPT",j("{\"receiptId\":\"order-"+payment.get("paymentId").getAsString()+"\"}"));assertEquals(30000,detail.get("totalVnd").getAsInt());assertEquals("Cà phê sữa",detail.getAsJsonArray("orders").get(0).getAsJsonObject().getAsJsonArray("items").get(0).getAsJsonObject().get("name").getAsString());
 }
 @Test void receiptHistoryUsesStableBoundedPagesAndScopeChecks()throws Exception{
  for(int n=0;n<3;n++)payOne();JsonObject page=call(admin,"GET_SALES_HISTORY",j("{\"limit\":2,\"tableId\":1}"));assertTrue(page.get("hasMore").getAsBoolean());assertEquals(2,page.getAsJsonArray("receipts").size());JsonObject last=page.getAsJsonArray("receipts").get(1).getAsJsonObject();JsonObject next=j("{\"limit\":2}");next.add("beforeTime",last.get("paidAt"));next.add("beforeId",last.get("receiptId"));JsonObject tail=call(admin,"GET_SALES_HISTORY",next);assertEquals(1,tail.getAsJsonArray("receipts").size());assertFalse(tail.get("hasMore").getAsBoolean());assertEquals(0,call(admin,"GET_SALES_HISTORY",j("{\"tableId\":2}")).getAsJsonArray("receipts").size());assertThrows(BusinessException.class,()->call(admin,"GET_SALES_HISTORY",j("{\"limit\":51}")));assertThrows(BusinessException.class,()->call(admin,"GET_SALES_HISTORY",j("{\"fromDate\":\"invalid\"}")));
  String other=call(admin,"OPEN_TABLE",j("{\"tableId\":2}")).get("visitId").getAsString();Identity outsider=s.joinVisit(call(admin,"GET_VISIT_QR",j("{\"visitId\":\""+other+"\"}")).get("grant").getAsString());JsonObject receipt=new JsonObject();receipt.add("receiptId",last.get("receiptId"));assertThrows(BusinessException.class,()->call(outsider,"GET_SALES_RECEIPT",receipt));
 }
 @Test void paymentExpiresWithoutPretendingSuccessAndCreatesFreshAttempt()throws Exception{
  int id=order().get("orderId").getAsInt();JsonObject payment=startPay(id);String token=guest.credential();s.close();s=new CafeService(temp.resolve("accept.db"),new QrConfig(key,Clock.offset(Clock.systemUTC(),Duration.ofMinutes(16))),true);guest=s.resume(token);assertEquals("EXPIRED",finish(payment,"SUCCESS").get("state").getAsString());assertEquals("UNPAID",s.snapshot(guest,Map.of()).orders().get(0).paymentState());assertNotEquals(payment.get("paymentId"),startPay(id).get("paymentId"));
 }
}
