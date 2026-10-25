package com.cafelink.server;

import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.time.Clock;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class QrMigrationTest {
    @TempDir Path temp;
    @Test void closedLegacyCopyKeepsHistoryAndCannotReopenWithPasswordMode() throws Exception {
        Path source=temp.resolve("e0.db"),copy=temp.resolve("v1.db");
        try(CafeService legacy=new CafeService(source)) {
            var admin=legacy.authenticate("admin","CafeLink@123");
            String visit=legacy.execute(admin,"legacy-open","OPEN_TABLE",JsonParser.parseString("{\"tableId\":1}").getAsJsonObject()).get("visitId").getAsString();
            legacy.execute(admin,"CLOSE_EMPTY_TABLE",JsonParser.parseString("{\"visitId\":\""+visit+"\"}").getAsJsonObject());
        }
        Files.copy(source,copy);
        try(CafeService upgraded=new CafeService(copy,new QrConfig(new byte[32],Clock.systemUTC()))) {
            var admin=upgraded.authenticate("admin","CafeLink@123");
            assertTrue(upgraded.outcome(admin,"legacy-open").get("found").getAsBoolean());
            assertEquals(8,upgraded.snapshot(admin,Map.of()).menu().size());
            assertTrue(upgraded.snapshot(admin,Map.of()).tables().stream().allMatch(t->t.visitId()==null));
        }
        assertThrows(java.sql.SQLException.class,()->new CafeService(copy));
        try(CafeService unchanged=new CafeService(source)) { assertEquals(6,unchanged.snapshot(unchanged.authenticate("admin","CafeLink@123"),Map.of()).tables().size()); }
    }
    @Test void activeLegacyMigrationFailsWithoutChangingOrClosingItsVisit() throws Exception {
        Path database=temp.resolve("active.db");String visit;
        try(CafeService legacy=new CafeService(database)) {
            visit=legacy.execute(legacy.authenticate("admin","CafeLink@123"),"OPEN_TABLE",JsonParser.parseString("{\"tableId\":1}").getAsJsonObject()).get("visitId").getAsString();
        }
        assertThrows(java.sql.SQLException.class,()->new CafeService(database,new QrConfig(new byte[32],Clock.systemUTC())));
        try(CafeService legacy=new CafeService(database)) { assertEquals(visit,legacy.snapshot(legacy.authenticate("admin","CafeLink@123"),Map.of()).tables().get(0).visitId()); }
    }
}
