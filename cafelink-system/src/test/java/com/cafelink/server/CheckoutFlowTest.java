package com.cafelink.server;

import com.cafelink.common.Models.Identity;
import com.google.gson.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.time.Clock;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class CheckoutFlowTest {
    @TempDir Path temp;
    CafeService service; Identity admin,a,b; String visit;
    static JsonObject json(String value){return JsonParser.parseString(value).getAsJsonObject();}
    @BeforeEach void start() throws Exception {
        service=new CafeService(temp.resolve("checkout.db"),new QrConfig(new byte[32],Clock.systemUTC()));
        admin=service.authenticate("admin","CafeLink@123");
        visit=service.execute(admin,"OPEN_TABLE",json("{\"tableId\":1}")).get("visitId").getAsString();
        String grant=service.execute(admin,"GET_VISIT_QR",data()).get("grant").getAsString();
        a=service.joinVisit(grant);b=service.joinVisit(grant);
    }
    @AfterEach void stop() throws Exception {service.close();}
    JsonObject data(){JsonObject d=new JsonObject();d.addProperty("visitId",visit);return d;}
    JsonObject versions(int visitVersion,int checkoutVersion){JsonObject d=data();d.addProperty("expectedVisitVersion",visitVersion);d.addProperty("expectedCheckoutVersion",checkoutVersion);return d;}
    JsonObject order(Identity guest,String id) throws Exception {JsonObject d=data();d.add("items",json("{\"v\":[{\"menuId\":2,\"quantity\":1}]}").get("v"));return service.execute(guest,id,"PLACE_ORDER",d);}
    String error(org.junit.jupiter.api.function.Executable operation){return assertThrows(BusinessException.class,operation).code();}

    @Test void twoGuestsAndNewIdsAfterAcknowledgementShareOneCheckout() throws Exception {
        order(a,"order");
        JsonObject first=service.execute(a,"request-a","REQUEST_CHECKOUT",versions(1,0));
        assertEquals("REQUESTED",first.get("state").getAsString());
        assertEquals(first,service.execute(b,"request-b","REQUEST_CHECKOUT",versions(1,0)));
        JsonObject ack=service.execute(admin,"ACK_CHECKOUT",versions(2,1));
        assertEquals("ACKNOWLEDGED",ack.get("state").getAsString());
        assertEquals(ack,service.execute(b,"request-after-ack","REQUEST_CHECKOUT",versions(1,0)));
        assertEquals(first.get("checkoutId"),ack.get("checkoutId"));
        assertEquals("CHECKOUT_IN_PROGRESS",error(()->order(b,"late-order")));
        assertEquals(0,service.snapshot(admin,Map.of()).tickets().size());
    }
    @Test void reopenFencesOldCommandsAndReusesCheckoutIdentityWithAudit() throws Exception {
        order(a,"order");JsonObject first=service.execute(a,"REQUEST_CHECKOUT",versions(1,0));
        JsonObject reopen=versions(2,1);reopen.addProperty("reason","Khách muốn gọi thêm");
        service.execute(admin,"REOPEN_ORDERING",reopen);
        assertEquals("VERSION_CONFLICT",error(()->service.execute(b,"REQUEST_CHECKOUT",versions(1,0))));
        assertEquals("VERSION_CONFLICT",error(()->service.execute(admin,"ACK_CHECKOUT",versions(2,1))));
        JsonObject next=service.execute(b,"REQUEST_CHECKOUT",versions(3,2));
        assertEquals(first.get("checkoutId"),next.get("checkoutId"));assertEquals(2,next.get("cycle").getAsInt());
        assertEquals(3,service.execute(admin,"GET_CHECKOUT",data()).getAsJsonArray("events").size());
        assertEquals("ACTION_REPLACED",error(()->service.execute(a,"REQUEST_BILL",data())));
    }
    @Test void paymentChecksBillThenReceiptSurvivesCloseRestartAndOtherPaymentId() throws Exception {
        JsonObject order=order(a,"order");service.execute(a,"REQUEST_CHECKOUT",versions(1,0));
        service.execute(admin,"ACK_CHECKOUT",versions(2,1));
        for(String state:List.of("PREPARING","READY","SERVED")){JsonObject step=new JsonObject();step.add("orderId",order.get("orderId"));step.addProperty("status",state);service.execute(admin,"SET_ORDER_STATUS",step);}
        JsonObject pay=data();pay.addProperty("expectedBillVersion",3);pay.addProperty("expectedTotalVnd",30000);
        assertEquals("VERSION_CONFLICT",error(()->service.execute(admin,"PAY_AND_CLOSE",pay)));
        pay.addProperty("expectedBillVersion",6);pay.addProperty("expectedTotalVnd",1);
        assertEquals("VERSION_CONFLICT",error(()->service.execute(admin,"PAY_AND_CLOSE",pay)));
        pay.addProperty("expectedTotalVnd",30000);
        JsonObject receipt=service.execute(admin,"pay-once","PAY_AND_CLOSE",pay);
        assertEquals(30000,receipt.get("totalVnd").getAsInt());assertEquals(1,receipt.get("receiptId").getAsInt());
        assertEquals(receipt,service.execute(admin,"pay-once","PAY_AND_CLOSE",pay));
        assertEquals("SESSION_CLOSED",error(()->service.execute(admin,"pay-twice","PAY_AND_CLOSE",pay)));
        assertEquals("PAID",service.snapshot(a,Map.of()).checkouts().get(0).state());
        service.close();service=new CafeService(temp.resolve("checkout.db"),new QrConfig(new byte[32],Clock.systemUTC()));
        admin=service.authenticate("admin","CafeLink@123");assertEquals(receipt,service.outcome(admin,"pay-once").getAsJsonObject("result"));
        assertEquals(3,service.execute(admin,"GET_CHECKOUT",data()).getAsJsonArray("events").size());
    }
    @Test void guestsCannotAcknowledgeReopenPayOrInspectAnotherVisit() throws Exception {
        assertEquals("INVALID_STATE",error(()->service.execute(a,"REQUEST_CHECKOUT",versions(0,0))));
        for(String action:List.of("ACK_CHECKOUT","REOPEN_ORDERING","PAY_AND_CLOSE"))assertEquals("FORBIDDEN",error(()->service.execute(a,action,versions(0,0))));
        JsonObject other=new JsonObject();other.addProperty("visitId","not-my-visit");assertEquals("FORBIDDEN",error(()->service.execute(a,"GET_CHECKOUT",other)));
    }
    @Test void orderAndCheckoutRaceHasOnlyTwoLegalSerialOutcomes() throws Exception {
        order(a,"first");var pool=java.util.concurrent.Executors.newFixedThreadPool(2);var gate=new java.util.concurrent.CountDownLatch(1);
        try {
            var pendingOrder=pool.submit(()->{gate.await();try{order(b,"racing-order");return "ORDER";}catch(BusinessException e){return e.code();}});
            var pendingCheckout=pool.submit(()->{gate.await();try{service.execute(a,"REQUEST_CHECKOUT",versions(1,0));return "CHECKOUT";}catch(BusinessException e){return e.code();}});
            gate.countDown();String orderResult=pendingOrder.get(),checkoutResult=pendingCheckout.get();
            assertTrue((orderResult.equals("ORDER")&&checkoutResult.equals("VERSION_CONFLICT"))||(orderResult.equals("CHECKOUT_IN_PROGRESS")&&checkoutResult.equals("CHECKOUT")));
            assertEquals(orderResult.equals("ORDER")?2:1,service.snapshot(admin,Map.of()).orders().size());
        }finally{pool.shutdownNow();}
    }
    @Test void callDiscardAndAcceptanceRaceNeverResurrectsDiscardedTicket() throws Exception {
        var pool=java.util.concurrent.Executors.newFixedThreadPool(2);var gate=new java.util.concurrent.CountDownLatch(1);
        try {
            var accept=pool.submit(()->{gate.await();try{service.execute(a,"call-race","CALL_SERVICE",data());return true;}catch(BusinessException e){assertEquals("COMMAND_DISCARDED",e.code());return false;}});
            var discard=pool.submit(()->{gate.await();return service.discard(a,"call-race","CALL_SERVICE",data());});gate.countDown();
            boolean accepted=accept.get();JsonObject known=discard.get();
            assertEquals(accepted?1:0,service.snapshot(admin,Map.of()).tickets().size());
            assertEquals(accepted,known.getAsJsonObject("result").has("ticketId"));
            assertEquals(known,service.outcome(a,"call-race"));
            if(!accepted)assertEquals("COMMAND_DISCARDED",error(()->service.execute(a,"call-race","CALL_SERVICE",data())));
        }finally{pool.shutdownNow();}
    }
    @Test void bothSerialOrdersOfCallAndDiscardAreProtected() throws Exception {
        JsonObject accepted=service.execute(a,"accepted-call","CALL_SERVICE",data());
        assertEquals(accepted,service.discard(a,"accepted-call","CALL_SERVICE",data()).getAsJsonObject("result"));
        assertTrue(service.discard(b,"discarded-call","CALL_SERVICE",data()).getAsJsonObject("result").get("cancelledBeforeAcceptance").getAsBoolean());
        assertEquals("COMMAND_DISCARDED",error(()->service.execute(b,"discarded-call","CALL_SERVICE",data())));
        assertEquals(1,service.snapshot(admin,Map.of()).tickets().size());
    }
    @Test void unpaidOrOpenSupportCannotBeClosedAndAdminDiscardFencesLateCashCommand() throws Exception {
        JsonObject order=order(a,"order");service.execute(a,"REQUEST_CHECKOUT",versions(1,0));service.execute(admin,"ACK_CHECKOUT",versions(2,1));
        JsonObject pay=data();pay.addProperty("expectedBillVersion",3);pay.addProperty("expectedTotalVnd",30000);
        assertEquals("INVALID_STATE",error(()->service.execute(admin,"PAY_AND_CLOSE",pay)));
        for(String state:List.of("PREPARING","READY","SERVED")){JsonObject step=new JsonObject();step.add("orderId",order.get("orderId"));step.addProperty("status",state);service.execute(admin,"SET_ORDER_STATUS",step);}
        pay.addProperty("expectedBillVersion",6);
        service.execute(a,"CALL_SERVICE",data());assertEquals("INVALID_STATE",error(()->service.execute(admin,"PAY_AND_CLOSE",pay)));
        long ticket=service.snapshot(admin,Map.of()).tickets().get(0).id();service.execute(admin,"HANDLE_TICKET",json("{\"ticketId\":"+ticket+",\"reply\":\"Done\"}"));
        assertTrue(service.discard(admin,"discarded-pay","PAY_AND_CLOSE",pay).getAsJsonObject("result").get("cancelledBeforeAcceptance").getAsBoolean());
        assertEquals("COMMAND_DISCARDED",error(()->service.execute(admin,"discarded-pay","PAY_AND_CLOSE",pay)));
        assertEquals("ACKNOWLEDGED",service.execute(admin,"GET_CHECKOUT",data()).getAsJsonObject("checkout").get("state").getAsString());
        JsonObject accepted=service.execute(admin,"real-pay","PAY_AND_CLOSE",pay);
        assertEquals(accepted,service.discard(admin,"real-pay","PAY_AND_CLOSE",pay).getAsJsonObject("result"));
    }
}
