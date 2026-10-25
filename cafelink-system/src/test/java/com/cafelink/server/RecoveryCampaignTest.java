package com.cafelink.server;

import com.cafelink.client.RecoveryExperimentMain;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import static org.junit.jupiter.api.Assertions.*;

class RecoveryCampaignTest {
    @TempDir Path temp;
    @Test void campaignRecordsBothPoliciesAndAllSixScenarios() throws Exception {
        Path output = temp.resolve("campaign");
        RecoveryExperimentMain.main(new String[]{"--output=" + output, "--repetitions=1", "--offline-seconds=0", "--parallelism=2"});
        var result = JsonParser.parseString(Files.readString(output.resolve("metadata.json"))).getAsJsonObject();
        assertEquals(12, result.get("cases").getAsInt()); assertEquals("PASS", result.get("status").getAsString());
        assertEquals(13, Files.readAllLines(output.resolve("results.csv")).size());
        assertTrue(Files.readString(output.resolve("results.csv")).contains("UNACCEPTED_ORDER"));
        assertTrue(Files.readString(output.resolve("results.csv")).contains("LOST_SERVICE_ACK"));
    }
}
