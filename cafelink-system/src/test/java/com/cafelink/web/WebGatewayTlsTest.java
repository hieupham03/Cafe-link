package com.cafelink.web;

import com.cafelink.server.*;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import javax.net.ssl.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.security.KeyStore;
import java.time.Duration;
import java.time.Clock;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

class WebGatewayTlsTest {
    @TempDir Path temp;
    @Test void httpsAndWssUseTrustedCertificateAndSecureSessionCookie() throws Exception {
        Path keyStore = temp.resolve("test.p12");
        String keytool = Path.of(System.getProperty("java.home"), "bin", "keytool.exe").toString();
        Process certificate = new ProcessBuilder(keytool, "-genkeypair", "-alias", "localhost", "-keyalg", "RSA",
                "-keysize", "2048", "-validity", "2", "-dname", "CN=localhost", "-ext", "SAN=IP:127.0.0.1,DNS:localhost",
                "-storetype", "PKCS12", "-keystore", keyStore.toString(), "-storepass", "fixture-only-password", "-noprompt")
                .redirectErrorStream(true).redirectOutput(temp.resolve("keytool.log").toFile()).start();
        assertTrue(certificate.waitFor(20, TimeUnit.SECONDS)); assertEquals(0, certificate.exitValue());
        KeyStore trusted = KeyStore.getInstance("PKCS12");
        try (var input = Files.newInputStream(keyStore)) { trusted.load(input, "fixture-only-password".toCharArray()); }
        var trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()); trust.init(trusted);
        SSLContext ssl = SSLContext.getInstance("TLS"); ssl.init(null, trust.getTrustManagers(), null);
        try (CafeService service = new CafeService(temp.resolve("tls.db"),new QrConfig(new byte[32],Clock.systemUTC()));
             CafeServer core = new CafeServer(service, "127.0.0.1", 0, ignored -> {})) {
            core.start();
            try (WebGateway gateway = new WebGateway("127.0.0.1", 0, "127.0.0.1", core.port(), temp, null,
                    new WebGateway.Tls(keyStore, "fixture-only-password"))) {
                gateway.start(); String base = "https://127.0.0.1:" + gateway.port();
                var cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
                var browser = HttpClient.newBuilder().sslContext(ssl).cookieHandler(cookies).connectTimeout(Duration.ofSeconds(5)).build();
                var login = browser.send(HttpRequest.newBuilder(URI.create(base + "/api/login")).header("Origin", base)
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString("{\"username\":\"admin\",\"password\":\"CafeLink@123\"}")).build(), HttpResponse.BodyHandlers.ofString());
                assertEquals(200, login.statusCode(), login.body());
                assertTrue(login.headers().firstValue("Set-Cookie").orElseThrow().contains("; Secure"));
                assertEquals("TLSv1.3", login.sslSession().orElseThrow().getProtocol());
                var feed = new WebGatewayIntegrationTest.Feed();
                var socket = browser.newWebSocketBuilder().header("Origin", base)
                        .buildAsync(URI.create(base.replace("https", "wss") + "/ws/state"), feed).get(5, TimeUnit.SECONDS);
                try {
                    var first = feed.messages.poll(5, TimeUnit.SECONDS); assertNotNull(first);
                    assertEquals("STATE", first.get("type").getAsString());
                    assertEquals(6, first.getAsJsonObject("state").getAsJsonArray("tables").size());
                } finally { socket.abort(); }
                String csrf=JsonParser.parseString(login.body()).getAsJsonObject().get("csrfToken").getAsString();
                var opened=post(browser,base,"/api/command","{\"commandId\":\"tls-open\",\"action\":\"OPEN_TABLE\",\"data\":{\"tableId\":1}}",csrf);
                assertEquals(200,opened.statusCode());
                String visit=JsonParser.parseString(opened.body()).getAsJsonObject().get("visitId").getAsString();
                var qr=post(browser,base,"/api/command","{\"commandId\":\"tls-qr\",\"action\":\"GET_VISIT_QR\",\"data\":{\"visitId\":\""+visit+"\"}}",csrf);
                assertEquals(200,qr.statusCode());
                String grant=JsonParser.parseString(qr.body()).getAsJsonObject().get("grant").getAsString();
                var guest=HttpClient.newBuilder().sslContext(ssl).cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();
                var joined=post(guest,base,"/api/guest/join","{\"grant\":\""+grant+"\"}",null);
                assertEquals(200,joined.statusCode());
                assertTrue(joined.headers().firstValue("Set-Cookie").orElseThrow().contains("; Secure"));
                assertFalse(joined.body().contains("credential"));
                var guestFeed=new WebGatewayIntegrationTest.Feed();
                var guestSocket=guest.newWebSocketBuilder().header("Origin",base).buildAsync(URI.create(base.replace("https","wss")+"/ws/state"),guestFeed).get(5,TimeUnit.SECONDS);
                try {
                    var state=guestFeed.messages.poll(5,TimeUnit.SECONDS);assertNotNull(state);
                    assertEquals(1,state.getAsJsonObject("state").getAsJsonArray("tables").size());
                } finally { guestSocket.abort(); }
            }
        }
    }
    private static HttpResponse<String> post(HttpClient client,String base,String path,String json,String csrf) throws Exception {
        var request=HttpRequest.newBuilder(URI.create(base+path)).header("Origin",base).header("Content-Type","application/json");
        if(csrf!=null)request.header("X-CSRF-Token",csrf);
        return client.send(request.POST(HttpRequest.BodyPublishers.ofString(json)).build(),HttpResponse.BodyHandlers.ofString());
    }
    @Test void lanCannotAccidentallyStartAnUnencryptedGateway() {
        assertThrows(IllegalArgumentException.class, () -> new WebGateway("0.0.0.0", 8080, "127.0.0.1", 5051, temp));
    }
}
