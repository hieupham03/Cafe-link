package com.cafelink.server;

import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.sql.*;
import java.time.Clock;
import static org.junit.jupiter.api.Assertions.*;

class CheckoutMigrationTest {
    @TempDir Path temp;
    // Migration fixture at the database boundary: construct the previous real schema.
    Path previous(boolean active) throws Exception {
        Path path=temp.resolve("v2.db");
        try(CafeService service=new CafeService(path,new QrConfig(new byte[32],Clock.systemUTC()))){
            var admin=service.authenticate("admin","CafeLink@123");var payload=JsonParser.parseString("{\"tableId\":1}").getAsJsonObject();
            String visit=service.execute(admin,"old-open","OPEN_TABLE",payload).get("visitId").getAsString();
            if(!active)service.execute(admin,"CLOSE_EMPTY_TABLE",JsonParser.parseString("{\"visitId\":\""+visit+"\"}").getAsJsonObject());
        }
        try(Connection c=DriverManager.getConnection("jdbc:sqlite:"+path);Statement sql=c.createStatement()){
            MigrationFixtures.removeAfterV5(sql);
            sql.execute("DROP TABLE checkout_events");sql.execute("DROP TABLE checkout_requests");sql.execute("ALTER TABLE visits DROP COLUMN state");sql.execute("ALTER TABLE visits DROP COLUMN version");sql.execute("PRAGMA user_version=4");
        }return path;
    }
    @Test void closedV2DatabaseMigratesAndKeepsStoreAndReceipt() throws Exception {
        Path path=previous(false);String store;
        try(Connection c=DriverManager.getConnection("jdbc:sqlite:"+path);Statement sql=c.createStatement();ResultSet rows=sql.executeQuery("SELECT value FROM store_settings WHERE name='store_id'")){store=rows.getString(1);}
        try(CafeService service=new CafeService(path,new QrConfig(new byte[32],Clock.systemUTC()))){var admin=service.authenticate("admin","CafeLink@123");assertEquals(store,admin.storeId());assertTrue(service.outcome(admin,"old-open").get("found").getAsBoolean());}
        try(Connection c=DriverManager.getConnection("jdbc:sqlite:"+path);Statement sql=c.createStatement();ResultSet rows=sql.executeQuery("PRAGMA user_version")){assertEquals(11,rows.getInt(1));}
    }
    @Test void activeV2DatabaseIsRefusedBeforeChangingSchemaOrVisits() throws Exception {
        Path path=previous(true);assertThrows(SQLException.class,()->new CafeService(path,new QrConfig(new byte[32],Clock.systemUTC())));
        try(Connection c=DriverManager.getConnection("jdbc:sqlite:"+path);Statement sql=c.createStatement()){
            try(ResultSet rows=sql.executeQuery("PRAGMA user_version")){assertEquals(4,rows.getInt(1));}
            try(ResultSet rows=sql.executeQuery("SELECT count(*) FROM visits WHERE active=1")){assertEquals(1,rows.getInt(1));}
        }
    }
}
