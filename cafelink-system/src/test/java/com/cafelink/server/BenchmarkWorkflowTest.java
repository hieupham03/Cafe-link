package com.cafelink.server;

import com.cafelink.client.BenchmarkClientMain;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import static org.junit.jupiter.api.Assertions.*;

class BenchmarkWorkflowTest {
    @TempDir Path temp;
    @Test void measuredWorkloadProducesRawDataAndReconcilesServerOrders() throws Exception {
        try (CafeService service = new CafeService(temp.resolve("benchmark.db")); CafeServer server = new CafeServer(service, "127.0.0.1", 0, s -> {})) {
            server.start(); Path output = temp.resolve("run");
            BenchmarkClientMain.main(new String[]{"--port=" + server.port(), "--clients=2", "--warmup-seconds=0", "--duration-seconds=1", "--period-ms=100", "--output=" + output});
            var result = JsonParser.parseString(Files.readString(output.resolve("summary.json"))).getAsJsonObject();
            assertEquals("PASS", result.get("status").getAsString()); assertEquals(20, result.get("requests").getAsInt());
            assertEquals(20, result.get("successes").getAsInt()); assertEquals(0, result.get("errors").getAsInt());
            assertEquals(4, result.get("persistedOrders").getAsInt()); assertEquals(120000, result.get("persistedTotalVnd").getAsLong());
            assertEquals(21, Files.readAllLines(output.resolve("requests.csv")).size());
            assertTrue(result.get("receivedBytes").getAsLong() > 0); assertTrue(result.get("journalBytes").getAsLong() > 0);
        }
    }
}
