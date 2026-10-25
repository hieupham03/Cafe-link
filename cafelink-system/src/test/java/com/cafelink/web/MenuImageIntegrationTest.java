package com.cafelink.web;
import com.cafelink.server.*;
import com.google.gson.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.time.Clock;
import static org.junit.jupiter.api.Assertions.*;
class MenuImageIntegrationTest {
 @TempDir Path temp;
 @Test void rasterUploadIsBoundedNormalizedAndPersistsOutsideAssets()throws Exception{
  try(CafeService service=new CafeService(temp.resolve("images.db"),new QrConfig(new byte[32],Clock.systemUTC()));CafeServer core=new CafeServer(service,"127.0.0.1",0,x->{})){
   core.start();String imagePath;int port;
   HttpClient client=HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();
   try(WebGateway gateway=new WebGateway("127.0.0.1",0,"127.0.0.1",core.port(),temp.resolve("assets"))){
    gateway.mediaDirectory(temp.resolve("media"));gateway.start();port=gateway.port();String base=gateway.origin();
    var login=client.send(HttpRequest.newBuilder(URI.create(base+"/api/login")).header("Origin",base).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString("{\"username\":\"admin\",\"password\":\"CafeLink@123\"}")).build(),HttpResponse.BodyHandlers.ofString());
    String csrf=JsonParser.parseString(login.body()).getAsJsonObject().get("csrfToken").getAsString();
    var raw=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(1200,800,BufferedImage.TYPE_INT_RGB),"PNG",raw);
    var uploaded=upload(client,base,csrf,raw.toByteArray());assertEquals(200,uploaded.statusCode());assertTrue(uploaded.headers().firstValue("Content-Security-Policy").orElseThrow().contains("img-src 'self' data: blob:"));imagePath=JsonParser.parseString(uploaded.body()).getAsJsonObject().get("imageUrl").getAsString();assertTrue(imagePath.matches("/media/[a-f0-9]{64}\\.jpg"));
    var response=HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(base+imagePath)).GET().build(),HttpResponse.BodyHandlers.ofByteArray());assertEquals(200,response.statusCode());assertEquals("image/jpeg",response.headers().firstValue("Content-Type").orElseThrow());assertEquals(960,ImageIO.read(new ByteArrayInputStream(response.body())).getWidth());
    var thumb=client.send(HttpRequest.newBuilder(URI.create(base+imagePath.replace(".jpg","-thumb.jpg"))).GET().build(),HttpResponse.BodyHandlers.ofByteArray());assertEquals(320,ImageIO.read(new ByteArrayInputStream(thumb.body())).getWidth());
    assertEquals(413,upload(client,base,csrf,new byte[2*1024*1024+1]).statusCode());
    var wide=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(6001,1,BufferedImage.TYPE_INT_RGB),"PNG",wide);assertEquals(400,upload(client,base,csrf,wide.toByteArray()).statusCode());
   }
   try(WebGateway restarted=new WebGateway("127.0.0.1",0,"127.0.0.1",core.port(),temp.resolve("assets"))){restarted.mediaDirectory(temp.resolve("media"));restarted.start();assertEquals(200,client.send(HttpRequest.newBuilder(URI.create(restarted.origin()+imagePath)).GET().build(),HttpResponse.BodyHandlers.ofByteArray()).statusCode());}
  }
 }
 private HttpResponse<String> upload(HttpClient c,String base,String csrf,byte[] bytes)throws Exception{return c.send(HttpRequest.newBuilder(URI.create(base+"/api/menu/image")).header("Origin",base).header("X-CSRF-Token",csrf).header("Content-Type","image/png").POST(HttpRequest.BodyPublishers.ofByteArray(bytes)).build(),HttpResponse.BodyHandlers.ofString());}
}
