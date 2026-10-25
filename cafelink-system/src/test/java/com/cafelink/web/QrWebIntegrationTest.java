package com.cafelink.web;

import com.cafelink.server.*;
import com.google.gson.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.time.Clock;
import static org.junit.jupiter.api.Assertions.*;

class QrWebIntegrationTest {
    @TempDir Path temp;
    CafeService service; CafeServer core; WebGateway gateway; String base; HttpClient admin, guest;
    @BeforeEach void start() throws Exception {
        service = new CafeService(temp.resolve("web.db"), new QrConfig(new byte[32], Clock.systemUTC()));
        core = new CafeServer(service,"127.0.0.1",0, ignored -> {}); core.start();
        gateway = new WebGateway("127.0.0.1",0,"127.0.0.1",core.port(),temp); gateway.start();
        base="http://127.0.0.1:"+gateway.port(); admin=browser(); guest=browser();
    }
    @AfterEach void stop() throws Exception { gateway.close(); core.close(); service.close(); }
    static HttpClient browser() { return HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build(); }
    HttpResponse<String> get(HttpClient client,String path) throws Exception { return client.send(HttpRequest.newBuilder(URI.create(base+path)).GET().build(),HttpResponse.BodyHandlers.ofString()); }
    HttpResponse<String> post(HttpClient client,String path,JsonObject body,String csrf) throws Exception {
        var request=HttpRequest.newBuilder(URI.create(base+path)).header("Origin",base).header("Content-Type","application/json");
        if(csrf!=null)request.header("X-CSRF-Token",csrf);
        return client.send(request.POST(HttpRequest.BodyPublishers.ofString(body.toString())).build(),HttpResponse.BodyHandlers.ofString());
    }
    static JsonObject data(String json) { return JsonParser.parseString(json).getAsJsonObject(); }
    static JsonObject json(HttpResponse<String> result) { assertEquals(200,result.statusCode(),result.body()); return data(result.body()); }
    JsonObject command(String csrf,String action,JsonObject payload) throws Exception {
        JsonObject input=new JsonObject(); input.addProperty("commandId",java.util.UUID.randomUUID().toString()); input.addProperty("action",action);input.add("data",payload);
        return json(post(admin,"/api/command",input,csrf));
    }
    @Test void fixedQrReusesOwnActiveSessionAndSeparatesBrowsersOverRealTcp() throws Exception {
        String csrf=json(post(admin,"/api/login",data("{\"username\":\"admin\",\"password\":\"CafeLink@123\"}"),null)).get("csrfToken").getAsString();
        command(csrf,"OPEN_ALL_TABLES",data("{}"));
        var qr=command(csrf,"GET_TABLE_QR",data("{\"tableId\":1}"));
        assertTrue(qr.get("joinUrl").getAsString().startsWith(base+"/join#table="));
        JsonObject input=new JsonObject();input.add("grant",qr.get("grant"));input.addProperty("table",true);
        var first=json(post(guest,"/api/guest/join",input,null));
        assertEquals(first.getAsJsonObject("identity"),json(post(guest,"/api/guest/join",input,null)).getAsJsonObject("identity"));
        var second=json(post(browser(),"/api/guest/join",input,null));
        assertNotEquals(first.getAsJsonObject("identity").get("visitId"),second.getAsJsonObject("identity").get("visitId"));
        assertEquals(403,post(guest,"/api/command",data("{\"commandId\":\"not-admin\",\"action\":\"OPEN_ALL_TABLES\",\"data\":{}}"),first.get("csrfToken").getAsString()).statusCode());
        command(csrf,"SET_TABLE_ACCEPTING",data("{\"tableId\":1,\"enabled\":0}"));
        assertEquals(409,post(browser(),"/api/guest/join",input,null).statusCode());
        assertEquals(200,get(guest,"/api/state").statusCode());
    }
    @Test void qrExchangeSetsHttpOnlyCookieAndScanAgainKeepsSameMembership() throws Exception {
        String csrf=json(post(admin,"/api/login",data("{\"username\":\"admin\",\"password\":\"CafeLink@123\"}"),null)).get("csrfToken").getAsString();
        String visit=command(csrf,"OPEN_TABLE",data("{\"tableId\":1}")).get("visitId").getAsString();
        JsonObject scope=data("{\"visitId\":\""+visit+"\"}");
        JsonObject qr=command(csrf,"GET_VISIT_QR",scope);
        assertTrue(qr.get("joinUrl").getAsString().startsWith(base+"/join#grant="));
        JsonObject grant=new JsonObject();grant.addProperty("grant",qr.get("grant").getAsString());
        var joined=post(guest,"/api/guest/join",grant,null);JsonObject info=json(joined);
        assertTrue(joined.headers().firstValue("Set-Cookie").orElseThrow().contains("HttpOnly"));
        assertFalse(joined.body().contains("credential"));
        String membership=info.getAsJsonObject("identity").get("membershipId").getAsString();
        assertEquals(membership,json(post(guest,"/api/guest/join",grant,null)).getAsJsonObject("identity").get("membershipId").getAsString());
        assertEquals(1,json(get(guest,"/api/state")).getAsJsonArray("tables").size());
        assertEquals(1,command(csrf,"GET_VISIT_MEMBERSHIPS",scope).getAsJsonArray("memberships").size());
    }
    @Test void gatewayAndCoreRestartResumeCookieWithoutCreatingAnotherMembership() throws Exception {
        String csrf=json(post(admin,"/api/login",data("{\"username\":\"admin\",\"password\":\"CafeLink@123\"}"),null)).get("csrfToken").getAsString();
        String visit=command(csrf,"OPEN_TABLE",data("{\"tableId\":1}")).get("visitId").getAsString();
        JsonObject scope=data("{\"visitId\":\""+visit+"\"}"); JsonObject grant=new JsonObject();
        grant.addProperty("grant",command(csrf,"GET_VISIT_QR",scope).get("grant").getAsString());
        JsonObject joined=json(post(guest,"/api/guest/join",grant,null));
        JsonObject before=joined.getAsJsonObject("identity"),expected=new JsonObject();
        for(String key:new String[]{"storeId","visitId","membershipId"})expected.add(key,before.get(key));
        JsonObject order=data("{\"commandId\":\"restart-web-order\",\"action\":\"PLACE_ORDER\",\"data\":{\"visitId\":\""+visit+"\",\"items\":[{\"menuId\":2,\"quantity\":1}],\"note\":\"\"}}");
        order.add("scope",expected);
        JsonObject accepted=json(post(guest,"/api/command",order,joined.get("csrfToken").getAsString()));
        int port=gateway.port(); gateway.close(); core.close(); service.close();
        service=new CafeService(temp.resolve("web.db"),new QrConfig(new byte[32],Clock.systemUTC()));
        core=new CafeServer(service,"127.0.0.1",0,ignored->{});core.start();
        gateway=new WebGateway("127.0.0.1",port,"127.0.0.1",core.port(),temp);gateway.start();
        JsonObject resumed=json(get(guest,"/api/session"));
        assertEquals(before,resumed.getAsJsonObject("identity"));
        assertEquals(1,json(get(guest,"/api/state")).getAsJsonArray("tables").size());
        JsonObject lookup=data("{\"commandId\":\"restart-lookup\",\"action\":\"GET_OUTCOME\",\"data\":{\"commandId\":\"restart-web-order\"}}");lookup.add("scope",expected);
        JsonObject outcome=json(post(guest,"/api/command",lookup,resumed.get("csrfToken").getAsString()));
        assertTrue(outcome.get("found").getAsBoolean());assertEquals(accepted,outcome.getAsJsonObject("result"));
        assertEquals(accepted,json(post(guest,"/api/command",order,resumed.get("csrfToken").getAsString())));
        assertEquals(1,json(get(guest,"/api/state")).getAsJsonArray("orders").size());
        assertEquals(1,core.connectionCount());
    }
    @Test void revokingOneBrowserDoesNotRevokeAnotherAndOldQrCannotCreateNewGuests() throws Exception {
        String csrf=json(post(admin,"/api/login",data("{\"username\":\"admin\",\"password\":\"CafeLink@123\"}"),null)).get("csrfToken").getAsString();
        String visit=command(csrf,"OPEN_TABLE",data("{\"tableId\":1}")).get("visitId").getAsString();
        JsonObject scope=data("{\"visitId\":\""+visit+"\"}"); JsonObject grant=new JsonObject();
        grant.addProperty("grant",command(csrf,"GET_VISIT_QR",scope).get("grant").getAsString());
        String first=json(post(guest,"/api/guest/join",grant,null)).getAsJsonObject("identity").get("membershipId").getAsString();
        HttpClient second=browser(); assertNotEquals(first,json(post(second,"/api/guest/join",grant,null)).getAsJsonObject("identity").get("membershipId").getAsString());
        command(csrf,"ROTATE_JOIN_GRANT",scope);
        assertEquals(409,post(browser(),"/api/guest/join",grant,null).statusCode());
        assertEquals(200,get(second,"/api/state").statusCode());
        JsonObject revoke=scope.deepCopy();revoke.addProperty("membershipId",first);command(csrf,"REVOKE_SESSION",revoke);
        assertEquals(401,get(guest,"/api/state").statusCode());
        assertEquals(200,get(second,"/api/state").statusCode());
        var handshake = guest.newWebSocketBuilder().header("Origin",base).buildAsync(URI.create(base.replace("http","ws")+"/ws/state"),new WebGatewayIntegrationTest.Feed());
        var denied=assertThrows(java.util.concurrent.ExecutionException.class,()->handshake.get(5,java.util.concurrent.TimeUnit.SECONDS));
        assertEquals(401,((WebSocketHandshakeException)denied.getCause()).getResponse().statusCode());
    }
    @Test void authRateLimitBoundsInvalidQrAttempts() throws Exception {
        for(int i=0;i<60;i++)assertEquals(409,post(guest,"/api/guest/join",data("{\"grant\":\"invalid\"}"),null).statusCode());
        assertEquals(429,post(guest,"/api/guest/join",data("{\"grant\":\"invalid\"}"),null).statusCode());
    }
    @Test void webOrderRequiresExpectedMembershipAndPreservesReceiptThroughTcp() throws Exception {
        String csrf=json(post(admin,"/api/login",data("{\"username\":\"admin\",\"password\":\"CafeLink@123\"}"),null)).get("csrfToken").getAsString();
        String visit=command(csrf,"OPEN_TABLE",data("{\"tableId\":1}")).get("visitId").getAsString();
        JsonObject grant=new JsonObject();grant.addProperty("grant",command(csrf,"GET_VISIT_QR",data("{\"visitId\":\""+visit+"\"}")).get("grant").getAsString());
        JsonObject info=json(post(guest,"/api/guest/join",grant,null)),who=info.getAsJsonObject("identity");String token=info.get("csrfToken").getAsString();
        JsonObject request=data("{\"commandId\":\"web-order-once\",\"action\":\"PLACE_ORDER\",\"data\":{\"visitId\":\""+visit+"\",\"items\":[{\"menuId\":2,\"quantity\":2}],\"note\":\"Cà phê <&>\\u2028 ít đá\"}}");
        assertEquals(409,post(guest,"/api/command",request,token).statusCode());
        JsonObject expected=new JsonObject();for(String key:new String[]{"storeId","visitId","membershipId"})expected.add(key,who.get(key));request.add("scope",expected);
        expected.addProperty("membershipId","other-member");assertEquals(409,post(guest,"/api/command",request,token).statusCode());
        assertEquals(0,json(get(guest,"/api/state")).getAsJsonArray("orders").size());
        expected.add("membershipId",who.get("membershipId"));
        JsonObject accepted=json(post(guest,"/api/command",request,token));assertEquals(60000,accepted.get("totalVnd").getAsLong());
        assertEquals(accepted,json(post(guest,"/api/command",request,token)));
        assertEquals(1,json(get(guest,"/api/state")).getAsJsonArray("orders").size());
    }
    @Test void leavingRevokedCachedSessionClearsCookieInsteadOfLoopingUnavailable() throws Exception {
        String csrf=json(post(admin,"/api/login",data("{\"username\":\"admin\",\"password\":\"CafeLink@123\"}"),null)).get("csrfToken").getAsString();
        String visit=command(csrf,"OPEN_TABLE",data("{\"tableId\":1}")).get("visitId").getAsString();
        JsonObject scope=data("{\"visitId\":\""+visit+"\"}");JsonObject grant=new JsonObject();grant.addProperty("grant",command(csrf,"GET_VISIT_QR",scope).get("grant").getAsString());
        JsonObject who=json(post(guest,"/api/guest/join",grant,null)).getAsJsonObject("identity");
        JsonObject revoke=scope.deepCopy();revoke.addProperty("membershipId",who.get("membershipId").getAsString());command(csrf,"REVOKE_SESSION",revoke);
        assertEquals(401,get(guest,"/api/state").statusCode());
        assertEquals(200,post(guest,"/api/guest/leave",new JsonObject(),null).statusCode());
        assertEquals(401,get(guest,"/api/session").statusCode());
    }
    @Test void thirtyActiveGuestsAndIdleEvictionPreserveCredentials() throws Exception {
        String csrf=json(post(admin,"/api/login",data("{\"username\":\"admin\",\"password\":\"CafeLink@123\"}"),null)).get("csrfToken").getAsString();command(csrf,"OPEN_ALL_TABLES",data("{}"));
        String grant=command(csrf,"GET_TABLE_QR",data("{\"tableId\":1}")).get("grant").getAsString();
        var clients=new java.util.ArrayList<HttpClient>();var sockets=new java.util.ArrayList<WebSocket>();
        try {
            for(int i=0;i<30;i++) {
                var client=browser();assertEquals(200,post(client,"/api/guest/join",data("{\"grant\":\""+grant+"\",\"table\":true}"),null).statusCode());clients.add(client);
                sockets.add(client.newWebSocketBuilder().header("Origin",base).buildAsync(URI.create(base.replace("http:","ws:")+"/ws/state"),new WebSocket.Listener(){}).get(8,java.util.concurrent.TimeUnit.SECONDS));
            }
            assertEquals(503,post(browser(),"/api/guest/join",data("{\"grant\":\""+grant+"\",\"table\":true}"),null).statusCode());
            var first=json(get(clients.get(0),"/api/session")).getAsJsonObject("identity");
            sockets.get(0).sendClose(1000,"done").get(5,java.util.concurrent.TimeUnit.SECONDS);Thread.sleep(100);
            for(int i=0;i<10;i++)assertEquals(200,post(browser(),"/api/guest/join",data("{\"grant\":\""+grant+"\",\"table\":true}"),null).statusCode());
            assertEquals(first,json(get(clients.get(0),"/api/session")).getAsJsonObject("identity"));
        } finally {for(var socket:sockets)socket.abort();}
    }

    @Test void staticJavascriptCompressionRespectsExplicitOptOut() throws Exception {
        String body="const asset = 'test';\n".repeat(4000);Files.writeString(temp.resolve("large.js"),body);
        var compressed=admin.send(HttpRequest.newBuilder(URI.create(base+"/large.js")).header("Accept-Encoding","gzip").GET().build(),HttpResponse.BodyHandlers.ofByteArray());
        assertEquals("gzip",compressed.headers().firstValue("Content-Encoding").orElseThrow());assertTrue(compressed.body().length<body.length()/2);
        assertEquals(body,new String(new java.util.zip.GZIPInputStream(new java.io.ByteArrayInputStream(compressed.body())).readAllBytes(),java.nio.charset.StandardCharsets.UTF_8));
        var plain=admin.send(HttpRequest.newBuilder(URI.create(base+"/large.js")).header("Accept-Encoding","gzip;q=0,*;q=1").GET().build(),HttpResponse.BodyHandlers.ofString());assertTrue(plain.headers().firstValue("Content-Encoding").isEmpty());assertEquals(body,plain.body());
    }

}
