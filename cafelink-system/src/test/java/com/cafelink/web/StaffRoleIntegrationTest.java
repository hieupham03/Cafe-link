package com.cafelink.web;

import com.cafelink.client.*;
import com.cafelink.server.*;
import com.google.gson.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.Path;
import java.time.Clock;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class StaffRoleIntegrationTest {
    @TempDir Path temp;
    CafeService service;CafeServer core;WebGateway gateway;String base,ownerCsrf,staffCsrf;HttpClient owner,staff;
    static JsonObject j(String s){return JsonParser.parseString(s).getAsJsonObject();}
    static HttpClient browser(){return HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();}
    HttpResponse<String> post(HttpClient client,String path,JsonObject body,String csrf)throws Exception{
        var r=HttpRequest.newBuilder(URI.create(base+path)).header("Origin",base).header("Content-Type","application/json");if(csrf!=null)r.header("X-CSRF-Token",csrf);
        return client.send(r.POST(HttpRequest.BodyPublishers.ofString(body.toString())).build(),HttpResponse.BodyHandlers.ofString());
    }
    HttpResponse<String> get(HttpClient client,String path)throws Exception{return client.send(HttpRequest.newBuilder(URI.create(base+path)).GET().build(),HttpResponse.BodyHandlers.ofString());}
    JsonObject ok(HttpResponse<String> r){assertEquals(200,r.statusCode(),r.body());return j(r.body());}
    HttpResponse<String> command(HttpClient client,String csrf,String action,JsonObject data)throws Exception{var input=new JsonObject();input.addProperty("commandId",UUID.randomUUID().toString());input.addProperty("action",action);input.add("data",data);return post(client,"/api/command",input,csrf);}
    JsonObject account()throws Exception{return ok(command(owner,ownerCsrf,"GET_STAFF_ACCOUNTS",j("{}"))).getAsJsonArray("accounts").get(0).getAsJsonObject();}
    void enabled(int enabled)throws Exception{var input=account();input.addProperty("expectedVersion",input.get("version").getAsLong());input.addProperty("enabled",enabled);ok(command(owner,ownerCsrf,"SET_STAFF_ACTIVE",input));}
    @BeforeEach void start()throws Exception{
        service=new CafeService(temp.resolve("roles.db"),new QrConfig(new byte[32],Clock.systemUTC()),true);core=new CafeServer(service,"127.0.0.1",0,ignored->{});core.start();gateway=new WebGateway("127.0.0.1",0,"127.0.0.1",core.port(),temp);gateway.start();base="http://127.0.0.1:"+gateway.port();owner=browser();staff=browser();
        ownerCsrf=ok(post(owner,"/api/login",j("{\"username\":\"admin\",\"password\":\"CafeLink@123\"}"),null)).get("csrfToken").getAsString();
        ok(command(owner,ownerCsrf,"CREATE_STAFF_ACCOUNT",j("{\"username\":\"nv01\",\"displayName\":\"Một\",\"password\":\"NhanVien@123\"}")));
        JsonObject session=ok(post(staff,"/api/login",j("{\"username\":\"nv01\",\"password\":\"NhanVien@123\",\"role\":\"ADMIN\"}"),null));assertEquals("STAFF",session.getAsJsonObject("identity").get("role").getAsString());staffCsrf=session.get("csrfToken").getAsString();
    }
    @AfterEach void stop()throws Exception{gateway.close();core.close();service.close();}
    @Test void directHttpAndTcpCommandsEnforceTheSameRole()throws Exception{
        assertEquals(6,ok(get(staff,"/api/state")).getAsJsonArray("tables").size());
        for(String action:new String[]{"GET_FINANCE_REPORT","GET_TAX_SETTINGS","GET_STAFF_ACCOUNTS","GET_STAFF_AUDIT","GET_SALES_HISTORY","CREATE_MENU_ITEM"})assertEquals(403,command(staff,staffCsrf,action,j("{}")).statusCode(),action);
        assertEquals(403,get(staff,"/api/admin/diagnostics").statusCode());
        try(NetworkClient socket=new NetworkClient("127.0.0.1",core.port())){socket.login("nv01","NhanVien@123");for(String action:new String[]{"GET_FINANCE_REPORT","GET_STAFF_ACCOUNTS","GET_DIAGNOSTICS","GET_BILL"})assertEquals("FORBIDDEN",assertThrows(RemoteException.class,()->socket.request(action,j("{}"))).code(),action);}
    }
    @Test void lockingRevokesExistingTcpAndCookieAndUnlockRequiresNewLogin()throws Exception{
        try(NetworkClient socket=new NetworkClient("127.0.0.1",core.port())){
            socket.login("nv01","NhanVien@123");enabled(0);
            long until=System.nanoTime()+3_000_000_000L;while(socket.authenticationFailure()==null&&System.nanoTime()<until)Thread.sleep(10);
            assertEquals("SESSION_REVOKED",socket.authenticationFailure());assertFalse(socket.connected());
            assertEquals(401,get(staff,"/api/state").statusCode());
            var retired=get(staff,"/api/session");assertEquals(401,retired.statusCode());assertEquals("SESSION_REVOKED",j(retired.body()).get("code").getAsString());
            assertEquals(401,post(browser(),"/api/login",j("{\"username\":\"nv01\",\"password\":\"NhanVien@123\"}"),null).statusCode());
            enabled(1);assertEquals(401,get(staff,"/api/state").statusCode());assertEquals(200,post(browser(),"/api/login",j("{\"username\":\"nv01\",\"password\":\"NhanVien@123\"}"),null).statusCode());
            assertEquals(200,get(owner,"/api/state").statusCode());
        }
    }
    @Test void staffCannotUploadMenuPhotosOrReadOwnerReceiptsById()throws Exception{
        var response=staff.send(HttpRequest.newBuilder(URI.create(base+"/api/menu/image")).header("Origin",base).header("X-CSRF-Token",staffCsrf).header("Content-Type","image/png").POST(HttpRequest.BodyPublishers.ofByteArray(new byte[]{1,2,3})).build(),HttpResponse.BodyHandlers.ofString());
        assertEquals(403,response.statusCode());assertEquals(403,command(staff,staffCsrf,"GET_SALES_RECEIPT",j("{\"receiptId\":\"order-1\"}")).statusCode());
    }
}
