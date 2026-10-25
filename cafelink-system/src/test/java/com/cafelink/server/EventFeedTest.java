package com.cafelink.server;

import com.cafelink.common.Json;
import com.cafelink.common.Models.Identity;
import com.google.gson.*;
import java.nio.file.Path;
import java.time.Clock;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class EventFeedTest {
    @TempDir Path temp;
    JsonObject input(String text) { return JsonParser.parseString(text).getAsJsonObject(); }
    JsonObject call(CafeService s, Identity who, String action, JsonObject data) throws Exception {
        return s.execute(who,UUID.randomUUID().toString(),action,data);
    }
    @Test void committedEventsAreScopedDeduplicatedReadableAndSurviveRestart() throws Exception {
        Path file=temp.resolve("events.db"); QrConfig config=new QrConfig(new byte[32],Clock.systemUTC());
        String token,visit,eventId;
        try(CafeService s=new CafeService(file,config)) {
            Identity admin=s.authenticate("admin","CafeLink@123");
            visit=call(s,admin,"OPEN_TABLE",input("{\"tableId\":1}")).get("visitId").getAsString();
            Identity guest=s.joinVisit(call(s,admin,"GET_VISIT_QR",input("{\"visitId\":\""+visit+"\"}")).get("grant").getAsString());
            token=guest.credential();
            String other=call(s,admin,"OPEN_TABLE",input("{\"tableId\":2}")).get("visitId").getAsString();
            Identity outsider=s.joinVisit(call(s,admin,"GET_VISIT_QR",input("{\"visitId\":\""+other+"\"}")).get("grant").getAsString());
            String id=UUID.randomUUID().toString(); JsonObject order=input("{\"visitId\":\""+visit+"\",\"items\":[{\"menuId\":2,\"quantity\":1}]}");
            s.execute(guest,id,"PLACE_ORDER",order); s.execute(guest,id,"PLACE_ORDER",order);
            JsonObject feed=call(s,guest,"GET_NOTIFICATIONS",input("{\"after\":0,\"limit\":50}"));
            assertEquals(1,feed.getAsJsonArray("events").size());
            eventId=feed.getAsJsonArray("events").get(0).getAsJsonObject().get("id").getAsString();
            assertEquals(0,call(s,outsider,"GET_NOTIFICATIONS",input("{\"after\":0}")).getAsJsonArray("events").size());
            call(s,guest,"MARK_NOTIFICATION_READ",input("{\"eventId\":"+eventId+"}"));
            assertEquals(0,call(s,guest,"GET_NOTIFICATIONS",input("{}")).get("unread").getAsInt());
            assertEquals(1,call(s,admin,"GET_NOTIFICATIONS",input("{}")).get("unread").getAsInt());
            assertThrows(BusinessException.class,()->call(s,outsider,"MARK_NOTIFICATION_READ",input("{\"eventId\":"+eventId+"}")));
            assertThrows(BusinessException.class,()->call(s,guest,"PLACE_ORDER",input("{\"visitId\":\""+visit+"\",\"items\":[]}")));
            assertEquals(1,call(s,guest,"GET_NOTIFICATIONS",input("{}")).getAsJsonArray("events").size());
        }
        try(CafeService s=new CafeService(file,config)) {
            JsonObject feed=call(s,s.resume(token),"GET_NOTIFICATIONS",input("{}"));
            assertEquals(1,feed.getAsJsonArray("events").size()); assertEquals(0,feed.get("unread").getAsInt());
        }
    }
    @Test void feedPagesDoNotDependOnSnapshotDeliveryAndGapsFromOtherTablesAreNotExpiry()throws Exception{
        try(CafeService s=new CafeService(temp.resolve("pages.db"),new QrConfig(new byte[32],Clock.systemUTC()))){
            Identity admin=s.authenticate("admin","CafeLink@123");String visit=call(s,admin,"OPEN_TABLE",input("{\"tableId\":1}")).get("visitId").getAsString();
            Identity guest=s.joinVisit(call(s,admin,"GET_VISIT_QR",input("{\"visitId\":\""+visit+"\"}")).get("grant").getAsString());
            for(int n=0;n<30;n++){JsonObject ticket=call(s,guest,"CALL_SERVICE",input("{\"visitId\":\""+visit+"\",\"note\":\"Nước\"}"));call(s,admin,"HANDLE_TICKET",input("{\"ticketId\":"+ticket.get("ticketId").getAsInt()+",\"reply\":\"Đã hỗ trợ\"}"));}
            JsonObject first=call(s,guest,"GET_NOTIFICATIONS",input("{\"limit\":50}"));assertEquals(50,first.getAsJsonArray("events").size());assertTrue(first.get("hasMore").getAsBoolean());int cursor=first.getAsJsonArray("events").get(49).getAsJsonObject().get("id").getAsInt();
            JsonObject second=call(s,guest,"GET_NOTIFICATIONS",input("{\"after\":"+cursor+",\"limit\":50}"));assertEquals(10,second.getAsJsonArray("events").size());assertFalse(second.get("hasMore").getAsBoolean());assertFalse(second.get("resyncRequired").getAsBoolean());assertEquals(60,second.get("unread").getAsInt());
            assertThrows(BusinessException.class,()->call(s,guest,"GET_NOTIFICATIONS",input("{\"limit\":101}")));
        }
    }
}
