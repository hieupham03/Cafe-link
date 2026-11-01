package com.cafelink.server;

import com.cafelink.common.Arguments;
import com.cafelink.common.Commands;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Clock;
import org.sqlite.SQLiteConfig;

/** Offline, read-only validation. Never opens CafeService or runs migrations/seeding. */
public final class BackupCheckMain {
    private BackupCheckMain() { }

    public static int check(Path database, Path keyFile) throws Exception {
        if (!Files.isRegularFile(database) || !Files.isRegularFile(keyFile))
            throw new IllegalArgumentException("Database and its QR key are both required.");
        var key = new QrConfig(Files.readAllBytes(keyFile), Clock.systemUTC());
        var config = new SQLiteConfig();
        config.setReadOnly(true);
        config.setBusyTimeout(1500);
        try (Connection connection = config.createConnection("jdbc:sqlite:" + database.toAbsolutePath());
             var statement = connection.createStatement()) {
            statement.execute("PRAGMA query_only=ON");
            final int schema;
            try (var version = statement.executeQuery("PRAGMA user_version")) {
                if (!version.next() || version.getInt(1)<9 || version.getInt(1)>12)
                    throw new IllegalArgumentException("Backup must use web schema 9 through 12.");
                schema=version.getInt(1);
            }
            if(schema>=10) {
                try(var structure=statement.executeQuery("SELECT c.from_membership_id,c.to_membership_id,r.order_id,r.state,r.payment_id,r.amount_vnd,r.reason,r.actor,r.created_at FROM visit_continuations c LEFT JOIN order_resolutions r ON 0 LIMIT 0")) { /* verify columns without writes */ }
            }
            if(schema>=11){try(var structure=statement.executeQuery("SELECT m.purchase_version,i.line_no,i.note,t.version,c.ticket_id FROM menu m LEFT JOIN order_items i ON 0 LEFT JOIN tickets t ON 0 LEFT JOIN ticket_changes c ON 0 LIMIT 0")){ /* read-only structure */ }}
            if(schema>=12){try(var structure=statement.executeQuery("SELECT o.tax_rate_bps,o.tax_name,o.tax_inclusive,o.subtotal_vnd,o.tax_vnd,o.total_vnd,c.voided_at FROM orders o LEFT JOIN cash_entries c ON 0 LIMIT 0")){ /* read-only structure */ }}
            try (var integrity = statement.executeQuery("PRAGMA integrity_check")) {
                if (!integrity.next() || !"ok".equals(integrity.getString(1)) || integrity.next())
                    throw new SQLException("SQLite integrity check failed.");
            }
            try (var foreignKeys = statement.executeQuery("PRAGMA foreign_key_check")) {
                if (foreignKeys.next()) throw new SQLException("Backup has broken foreign keys.");
            }
            try (var grants = statement.executeQuery("SELECT visit_id,generation,encrypted_secret,token_hash FROM join_grants")) {
                while (grants.next()) {
                    String plain = key.decrypt(grants.getString(3), grants.getString(1) + ":" + grants.getInt(2));
                    if (!Commands.digest(plain).equals(grants.getString(4))) throw new SQLException("QR grant checksum mismatch.");
                }
            }
            try (var tables = statement.executeQuery("SELECT table_id,encrypted_secret,token_hash FROM table_access")) {
                while (tables.next()) {
                    String plain = key.decrypt(tables.getString(2), "table:" + tables.getInt(1));
                    if (!Commands.digest(plain).equals(tables.getString(3))) throw new SQLException("Table QR checksum mismatch.");
                }
            }
            try (var menu = statement.executeQuery("SELECT image_url FROM menu WHERE image_url<>''")) {
                Path media = Path.of(database.toAbsolutePath() + ".media");
                while (menu.next()) {
                    String url = menu.getString(1);
                    if (!url.matches("/media/[a-f0-9]{64}(-thumb)?\\.jpg") || !Files.isRegularFile(media.resolve(url.substring(7))))
                        throw new SQLException("A menu image is missing from the backup.");
                }
            }
            return schema;
        }
    }

    public static void main(String[] args) {
        try {
            var options = new Arguments(args);
            int schema=check(Path.of(options.get("db", "")), Path.of(options.get("qr-key-file", "")));
            System.out.println("{\"status\":\"PASS\",\"schema\":"+schema+",\"readOnly\":true,\"qrKeyMatches\":true}");
        } catch (Exception error) {
            System.err.println("BACKUP CHECK FAILED: " + error.getMessage());
            System.exit(1);
        }
    }
}
