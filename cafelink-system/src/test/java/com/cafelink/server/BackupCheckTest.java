package com.cafelink.server;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.sql.DriverManager;
import static org.junit.jupiter.api.Assertions.*;

class BackupCheckTest {
    @TempDir Path temp;

    @Test void verifiesOfflineDatabaseAndItsOwnQrKeyWithoutChangingEither() throws Exception {
        Path database = temp.resolve("cafelink.db"), key = temp.resolve("cafelink.db.qr-key");
        byte[] secret = new byte[32]; secret[0] = 43; Files.write(key, secret);
        try (var service = new CafeService(database, new QrConfig(secret, Clock.systemUTC()), true)) {
            service.execute(service.authenticate("admin", "CafeLink@123"), "OPEN_ALL_TABLES", new JsonObject());
        }
        byte[] before = Files.readAllBytes(database);
        BackupCheckMain.check(database, key);
        assertArrayEquals(before, Files.readAllBytes(database));
        assertArrayEquals(secret, Files.readAllBytes(key));
    }

    @Test void rejectsAKeyFromAnotherCafeWithoutChangingTheBackup() throws Exception {
        Path database = temp.resolve("cafelink.db"), key = temp.resolve("cafelink.db.qr-key");
        byte[] secret = new byte[32];
        try (var service = new CafeService(database, new QrConfig(secret, Clock.systemUTC()), true)) {
            service.execute(service.authenticate("admin", "CafeLink@123"), "OPEN_ALL_TABLES", new JsonObject());
        }
        byte[] before = Files.readAllBytes(database);
        secret[3] = 1; Files.write(key, secret);
        assertThrows(BusinessException.class, () -> BackupCheckMain.check(database, key));
        assertArrayEquals(before, Files.readAllBytes(database));
    }

    @Test void rejectsLegacySchemaInsteadOfMigratingIt() throws Exception {
        Path database = temp.resolve("legacy.db"), key = temp.resolve("legacy.db.qr-key");
        Files.write(key, new byte[32]);
        try (var service = new CafeService(database)) { }
        byte[] before = Files.readAllBytes(database);
        assertThrows(IllegalArgumentException.class, () -> BackupCheckMain.check(database, key));
        assertArrayEquals(before, Files.readAllBytes(database));
    }

    @Test void rejectsMissingMenuImagesEvenWhenTheDatabaseIsValid() throws Exception {
        Path database = temp.resolve("cafelink.db"), key = temp.resolve("cafelink.db.qr-key");
        Files.write(key, new byte[32]);
        try (var service = new CafeService(database, new QrConfig(new byte[32], Clock.systemUTC()), true)) { }
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + database); var sql = connection.createStatement()) {
            sql.execute("UPDATE menu SET image_url='/media/" + "a".repeat(64) + ".jpg' WHERE id=2");
        }
        assertThrows(java.sql.SQLException.class, () -> BackupCheckMain.check(database, key));
    }
    @Test void schema9BackupCanBeInspectedWithoutMigratingIt() throws Exception {
        Path database=temp.resolve("v9.db"),key=temp.resolve("v9.db.qr-key");Files.write(key,new byte[32]);
        try(var service=new CafeService(database,new QrConfig(new byte[32],Clock.systemUTC()),true)) { }
        try(var connection=DriverManager.getConnection("jdbc:sqlite:"+database);var sql=connection.createStatement()) {
            sql.execute("DROP TABLE visit_continuations");sql.execute("DROP TABLE order_resolutions");sql.execute("PRAGMA user_version=9");
        }
        byte[] before=Files.readAllBytes(database);assertEquals(9,BackupCheckMain.check(database,key));assertArrayEquals(before,Files.readAllBytes(database));
    }
    @Test void schema10WithoutRequiredResolutionTableIsRejectedReadOnly() throws Exception {
        Path database=temp.resolve("incomplete.db"),key=temp.resolve("incomplete.db.qr-key");Files.write(key,new byte[32]);
        try(var service=new CafeService(database,new QrConfig(new byte[32],Clock.systemUTC()),true)) { }
        try(var connection=DriverManager.getConnection("jdbc:sqlite:"+database);var sql=connection.createStatement()) {sql.execute("DROP TABLE order_resolutions");}
        byte[] before=Files.readAllBytes(database);assertThrows(java.sql.SQLException.class,()->BackupCheckMain.check(database,key));assertArrayEquals(before,Files.readAllBytes(database));
    }
}
