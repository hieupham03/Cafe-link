package com.cafelink.web;

import com.cafelink.common.Arguments;
import com.cafelink.server.*;
import java.nio.file.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicBoolean;

/** V2 entrypoint: owns and stops both Gateway and TCP Core. E0 keeps ServerMain. */
public final class WebMain {
    private WebMain() { }
    public static void main(String[] args) throws Exception {
        Arguments options = new Arguments(args);
        Path assets = Path.of(options.get("assets", "web/dist"));
        if (!Files.isRegularFile(assets.resolve("index.html"))) throw new IllegalArgumentException("Build web first: scripts/build-web.ps1");
        WebGateway.Tls tls = null;
        if (options.has("keystore")) {
            String password = System.getenv("CAFELINK_KEYSTORE_PASSWORD");
            if (password == null || password.isBlank()) throw new IllegalArgumentException("Set CAFELINK_KEYSTORE_PASSWORD for TLS.");
            tls = new WebGateway.Tls(Path.of(options.get("keystore", "")), password);
        }
        Path database = Path.of(options.get("db", "data/v2/cafelink.db"));
        Path keyFile = Path.of(options.get("qr-key-file", database.toString() + ".qr-key"));
        QrConfig qr = QrConfig.deployment(keyFile, System.getenv("CAFELINK_QR_KEY"));
        CafeService service = new CafeService(database, qr,!options.get("ordering-mode","prepay").equals("postpay"));
        String demoPassword=System.getenv("CAFELINK_DEMO_ADMIN_PASSWORD");
        if(options.has("trusted-proxy")&&demoPassword!=null)service.configureDemoAdmin(demoPassword);
        CafeServer core = new CafeServer(service, "127.0.0.1", options.integer("tcp-port", 5051), System.out::println);
        WebGateway gateway = null;
        try {
            core.start();
            gateway = new WebGateway(options.get("bind", "127.0.0.1"), options.integer("port", 8080),
                    "127.0.0.1", core.port(), assets, options.has("public-origin") ? options.get("public-origin", "") : null, tls,options.has("trusted-proxy"));
            WebGateway owned = gateway;
            gateway.mediaDirectory(database.toAbsolutePath().resolveSibling(database.getFileName()+".media"));
            AtomicBoolean stopped = new AtomicBoolean();
            Runnable stop = () -> {
                if (!stopped.compareAndSet(false, true)) return;
                try { owned.close(); } catch (Exception e) { System.err.println("Gateway shutdown failed"); }
                core.close(); try { service.close(); } catch (Exception e) { System.err.println("Core database shutdown failed"); }
            };
            Runtime.getRuntime().addShutdownHook(new Thread(stop, "cafelink-web-shutdown"));
            gateway.start();
            System.out.println("CafeLink Web: " + gateway.origin() + "/admin");
            System.out.println("TCP Core (loopback): " + core.port());
            new CountDownLatch(1).await();
        } finally {
            if (gateway != null) gateway.close(); core.close(); service.close();
        }
    }
}
