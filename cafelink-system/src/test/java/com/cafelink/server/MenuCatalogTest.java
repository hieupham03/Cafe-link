package com.cafelink.server;
import com.cafelink.common.Models.Identity;
import com.google.gson.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.time.Clock;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class MenuCatalogTest {
 @TempDir Path temp;
 static JsonObject j(String s){return JsonParser.parseString(s).getAsJsonObject();}
 @Test void versionedCatalogRejectsStaleCartAndKeepsAcceptedPrice() throws Exception {
  try(CafeService s=new CafeService(temp.resolve("menu.db"),new QrConfig(new byte[32],Clock.systemUTC()))){
   Identity a=s.authenticate("admin","CafeLink@123");
   JsonObject create=j("{\"name\":\"Matcha\",\"priceVnd\":45000,\"category\":\"Trà\",\"description\":\"Trà xanh\",\"available\":true,\"active\":true,\"sortOrder\":10}");
   JsonObject item=s.execute(a,"CREATE_MENU_ITEM",create);int id=item.get("id").getAsInt();
   String visit=s.execute(a,"OPEN_TABLE",j("{\"tableId\":1}")).get("visitId").getAsString();
   Identity g=s.joinVisit(s.execute(a,"GET_VISIT_QR",j("{\"visitId\":\""+visit+"\"}")).get("grant").getAsString());
   JsonObject order=j("{\"visitId\":\""+visit+"\",\"items\":[{\"menuId\":"+id+",\"quantity\":2,\"expectedVersion\":1,\"expectedPriceVnd\":45000}]}");
   s.execute(g,"PLACE_ORDER",order);
   JsonObject edit=create.deepCopy();edit.addProperty("menuId",id);edit.addProperty("expectedVersion",1);edit.addProperty("priceVnd",50000);
   s.execute(a,"UPDATE_MENU_ITEM",edit);
   assertEquals("MENU_CHANGED",assertThrows(BusinessException.class,()->s.execute(g,"PLACE_ORDER",order)).code());
   assertEquals(90000,s.snapshot(g,Map.of()).orders().get(0).totalVnd());
   assertEquals("VERSION_CONFLICT",assertThrows(BusinessException.class,()->s.execute(a,"UPDATE_MENU_ITEM",edit)).code());
   edit.addProperty("expectedVersion",2);edit.addProperty("available",false);s.execute(a,"UPDATE_MENU_ITEM",edit);
   assertEquals("ITEM_UNAVAILABLE",assertThrows(BusinessException.class,()->s.execute(g,"PLACE_ORDER",order)).code());
   assertThrows(BusinessException.class,()->s.execute(g,"CREATE_MENU_ITEM",create));
  }
 }
}
