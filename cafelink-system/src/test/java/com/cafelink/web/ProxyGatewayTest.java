package com.cafelink.web;
import com.cafelink.server.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.Path;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
class ProxyGatewayTest {
 @TempDir Path temp;
 @Test void explicitLoopbackProxyUsesPinnedHttpsOriginAndSecureCookies()throws Exception{
  try(CafeService service=new CafeService(temp.resolve("proxy.db"));CafeServer core=new CafeServer(service,"127.0.0.1",0,x->{})){
   core.start();String publicOrigin="https://demo.example.test";
   assertThrows(IllegalArgumentException.class,()->new WebGateway("127.0.0.1",0,"127.0.0.1",core.port(),temp,publicOrigin,null));
   try(WebGateway web=new WebGateway("127.0.0.1",0,"127.0.0.1",core.port(),temp,publicOrigin,null,true)){
    web.start();String local="http://127.0.0.1:"+web.port();HttpClient client=HttpClient.newHttpClient();
    var request=HttpRequest.newBuilder(URI.create(local+"/api/login")).header("Origin",publicOrigin).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString("{\"username\":\"admin\",\"password\":\"CafeLink@123\"}")).build();
    var response=client.send(request,HttpResponse.BodyHandlers.ofString());assertEquals(200,response.statusCode());assertTrue(response.headers().firstValue("Set-Cookie").orElseThrow().contains("; Secure"));assertEquals(publicOrigin,web.origin());
    var wrong=client.send(HttpRequest.newBuilder(URI.create(local+"/api/login")).header("Origin",local).header("X-Forwarded-Proto","https").header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString("{}")).build(),HttpResponse.BodyHandlers.ofString());assertEquals(403,wrong.statusCode());
   }
   assertThrows(IllegalArgumentException.class,()->new WebGateway("0.0.0.0",0,"127.0.0.1",core.port(),temp,publicOrigin,null,true));
  }
 }
}
