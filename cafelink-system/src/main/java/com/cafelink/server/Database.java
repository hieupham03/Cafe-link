package com.cafelink.server;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/** A single SQLite connection, owned and serialized by CafeService. */
final class Database implements AutoCloseable {
    @FunctionalInterface interface Mapper<T> { T map(ResultSet row) throws SQLException; }
    @FunctionalInterface interface Work<T> { T run() throws SQLException; }
    private final Connection connection;
    Database(Path path) throws Exception { this(path, false); }
    Database(Path path, boolean qrMode) throws Exception {
        Path absolute = path.toAbsolutePath(); Files.createDirectories(absolute.getParent());
        connection = DriverManager.getConnection("jdbc:sqlite:" + absolute);
        try (Statement s = connection.createStatement()) {
            s.execute("PRAGMA foreign_keys=ON"); s.execute("PRAGMA busy_timeout=5000"); s.execute("PRAGMA journal_mode=WAL");
        }
        int version = query("PRAGMA user_version", r -> r.getInt(1)).get(0);
        if (version < 0 || version > 11 || (!qrMode && version > 3)) { close(); throw new SQLException("Unsupported database schema for this mode: " + version); }
        if (qrMode && version > 0 && version < 4 && !query("SELECT id FROM visits WHERE active=1", r -> r.getString(1)).isEmpty()) {
            close(); throw new SQLException("Close and reconcile legacy visits before QR migration; use an isolated database for a fresh demo.");
        }
        if(qrMode && version==4 && !query("SELECT id FROM visits WHERE active=1",r->r.getString(1)).isEmpty()) {
            close();throw new SQLException("Close and reconcile V1/V2 visits before checkout migration to schema 5; use a fresh demo database.");
        }
        String[] schema = {
            "CREATE TABLE IF NOT EXISTS cafe_tables(id INTEGER PRIMARY KEY,name TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS accounts(username TEXT PRIMARY KEY,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('ADMIN','GUEST')),table_id INTEGER REFERENCES cafe_tables(id))",
            "CREATE TABLE IF NOT EXISTS visits(id TEXT PRIMARY KEY,table_id INTEGER NOT NULL REFERENCES cafe_tables(id),active INTEGER NOT NULL CHECK(active IN(0,1)),opened_at TEXT NOT NULL,closed_at TEXT)",
            version >= 9 ? "CREATE UNIQUE INDEX IF NOT EXISTS one_active_visit ON visits(table_id) WHERE active=1 AND service_mode='MANUAL'" : "CREATE UNIQUE INDEX IF NOT EXISTS one_active_visit ON visits(table_id) WHERE active=1",
            "CREATE TABLE IF NOT EXISTS menu(id INTEGER PRIMARY KEY,name TEXT NOT NULL,price_vnd INTEGER NOT NULL CHECK(price_vnd>0),category TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,visit_id TEXT NOT NULL REFERENCES visits(id),status TEXT NOT NULL CHECK(status IN('SUBMITTED','PREPARING','READY','SERVED')),note TEXT NOT NULL,created_at TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS order_items(order_id INTEGER NOT NULL REFERENCES orders(id),menu_id INTEGER NOT NULL REFERENCES menu(id),name TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20),unit_price_vnd INTEGER NOT NULL CHECK(unit_price_vnd>0),PRIMARY KEY(order_id,menu_id))",
            "CREATE TABLE IF NOT EXISTS tickets(id INTEGER PRIMARY KEY AUTOINCREMENT,visit_id TEXT NOT NULL REFERENCES visits(id),type TEXT NOT NULL CHECK(type IN('CALL_SERVICE','REQUEST_BILL')),status TEXT NOT NULL CHECK(status IN('OPEN','HANDLED')),note TEXT NOT NULL,reply TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL)",
            "CREATE UNIQUE INDEX IF NOT EXISTS one_open_ticket ON tickets(visit_id,type) WHERE status='OPEN'",
            "CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT,visit_id TEXT NOT NULL UNIQUE REFERENCES visits(id),total_vnd INTEGER NOT NULL CHECK(total_vnd>0),method TEXT NOT NULL,paid_at TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS metadata(name TEXT PRIMARY KEY,value INTEGER NOT NULL)",
            "INSERT OR IGNORE INTO metadata(name,value) VALUES('revision',0)",
            "CREATE TABLE IF NOT EXISTS command_receipts(principal TEXT NOT NULL,command_id TEXT NOT NULL,action TEXT NOT NULL,fingerprint TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(principal,command_id))",
            "CREATE TABLE IF NOT EXISTS guest_credentials(token_hash TEXT PRIMARY KEY,username TEXT NOT NULL REFERENCES accounts(username),visit_id TEXT REFERENCES visits(id),created_at TEXT NOT NULL)",
            "PRAGMA user_version=" + (qrMode ? version : 3)
        };
        try { for (String sql : schema) update(sql); seed(); if (qrMode) { migrateQr(); if(version<5)migrateCheckout(); if(version<6)migrateEvents(); if(version<7)migrateMenu(); if(version<8)migratePrepay(); if(version<9)migrateAutomaticTables(); if(version<10)migrateBusinessWorkflows(); if(version<11)migrateConvenience(); } }
        catch (Exception e) { close(); throw e; }
    }
    private void migrateQr() throws SQLException {
        transaction(() -> {
            update("CREATE TABLE IF NOT EXISTS store_settings(name TEXT PRIMARY KEY,value TEXT NOT NULL)");
            update("INSERT OR IGNORE INTO store_settings VALUES('store_id',?)", java.util.UUID.randomUUID().toString());
            update("CREATE TABLE IF NOT EXISTS join_grants(visit_id TEXT PRIMARY KEY REFERENCES visits(id),generation INTEGER NOT NULL,token_hash TEXT NOT NULL UNIQUE,encrypted_secret TEXT NOT NULL,expires_at TEXT NOT NULL)");
            update("CREATE TABLE IF NOT EXISTS guest_memberships(id TEXT PRIMARY KEY,visit_id TEXT NOT NULL REFERENCES visits(id),created_at TEXT NOT NULL,expires_at TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN(0,1)))");
            update("CREATE TABLE IF NOT EXISTS guest_sessions(token_hash TEXT PRIMARY KEY,membership_id TEXT NOT NULL REFERENCES guest_memberships(id),expires_at TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN(0,1)))");
            return null;
        });
    }
    private void migrateCheckout() throws SQLException {
        transaction(()->{
            schema("ALTER TABLE visits ADD COLUMN state TEXT NOT NULL DEFAULT 'OPEN' CHECK(state IN('OPEN','CHECKOUT_REQUESTED','CLOSED'))");
            schema("ALTER TABLE visits ADD COLUMN version INTEGER NOT NULL DEFAULT 0");
            update("UPDATE visits SET state='CLOSED' WHERE active=0");
            update("CREATE TABLE checkout_requests(id TEXT PRIMARY KEY,visit_id TEXT NOT NULL UNIQUE REFERENCES visits(id),state TEXT NOT NULL CHECK(state IN('REQUESTED','ACKNOWLEDGED','CANCELLED','PAID')),version INTEGER NOT NULL,cycle INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)");
            update("CREATE TABLE checkout_events(id INTEGER PRIMARY KEY AUTOINCREMENT,checkout_id TEXT NOT NULL REFERENCES checkout_requests(id),state TEXT NOT NULL,version INTEGER NOT NULL,actor TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(checkout_id,version))");
            update("PRAGMA user_version=5");return null;
        });
    }
    private void schema(String sql) throws SQLException {try(Statement statement=connection.createStatement()){statement.execute(sql);}}
    private void migrateEvents() throws SQLException {
        transaction(()->{
            update("CREATE TABLE business_events(id INTEGER PRIMARY KEY AUTOINCREMENT,visit_id TEXT REFERENCES visits(id),table_id INTEGER NOT NULL,type TEXT NOT NULL,entity_id TEXT NOT NULL,title TEXT NOT NULL,created_at TEXT NOT NULL)");
            update("CREATE INDEX event_visit ON business_events(visit_id,id)");
            update("CREATE TABLE notification_reads(principal TEXT NOT NULL,event_id INTEGER NOT NULL REFERENCES business_events(id) ON DELETE CASCADE,PRIMARY KEY(principal,event_id))");
            update("PRAGMA user_version=6");return null;
        });
    }
    private void seed() throws SQLException {
        transaction(() -> {
            for (int table = 1; table <= 6; table++) {
                update("INSERT OR IGNORE INTO cafe_tables VALUES(?,?)", table, "Bàn " + table);
                if (query("SELECT username FROM accounts WHERE username=?", r -> r.getString(1), "ban" + table).isEmpty())
                    update("INSERT INTO accounts VALUES(?,?,?,?)", "ban" + table, PasswordHash.create("Ban" + table + "@123"), "GUEST", table);
            }
            if (query("SELECT username FROM accounts WHERE username='admin'", r -> r.getString(1)).isEmpty())
                update("INSERT INTO accounts VALUES(?,?,?,NULL)", "admin", PasswordHash.create("CafeLink@123"), "ADMIN");
            String[] names = {"Cà phê đen", "Cà phê sữa", "Bạc xỉu", "Latte", "Trà đào", "Trà chanh", "Cacao", "Nước suối"};
            long[] prices = {25000, 30000, 35000, 45000, 40000, 25000, 40000, 15000};
            for (int i = 0; i < names.length; i++) update("INSERT OR IGNORE INTO menu(id,name,price_vnd,category) VALUES(?,?,?,?)", i + 1, names[i], prices[i], i < 4 ? "Cà phê" : "Đồ uống khác");
            return null;
        });
    }
    private void migrateMenu() throws SQLException {
        transaction(()->{
            schema("ALTER TABLE menu ADD COLUMN description TEXT NOT NULL DEFAULT ''");
            schema("ALTER TABLE menu ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
            schema("ALTER TABLE menu ADD COLUMN available INTEGER NOT NULL DEFAULT 1");
            schema("ALTER TABLE menu ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
            schema("ALTER TABLE menu ADD COLUMN version INTEGER NOT NULL DEFAULT 1");
            schema("ALTER TABLE menu ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
            update("CREATE TABLE menu_categories(name TEXT PRIMARY KEY,sort_order INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1)");
            update("INSERT INTO menu_categories(name) SELECT DISTINCT category FROM menu");
            update("PRAGMA user_version=7");return null;
        });
    }
    private void migratePrepay()throws SQLException {
        transaction(()->{
            schema("ALTER TABLE visits ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'POSTPAY'");
            schema("ALTER TABLE orders ADD COLUMN payment_state TEXT NOT NULL DEFAULT 'POSTPAY'");
            update("CREATE TABLE order_payments(id TEXT PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),amount_vnd INTEGER NOT NULL CHECK(amount_vnd>0),state TEXT NOT NULL CHECK(state IN('PENDING','PAID','FAILED','CANCELLED','EXPIRED')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,expires_at TEXT NOT NULL,provider TEXT NOT NULL DEFAULT 'LOCAL_SIMULATOR')");
            update("CREATE UNIQUE INDEX one_pending_payment ON order_payments(order_id) WHERE state='PENDING'");
            update("CREATE UNIQUE INDEX one_paid_order ON order_payments(order_id) WHERE state='PAID'");
            update("CREATE INDEX paid_history ON order_payments(state,updated_at,id)");
            update("PRAGMA user_version=8");return null;
        });
    }
    private void migrateAutomaticTables() throws SQLException {
        transaction(() -> {
            schema("ALTER TABLE visits ADD COLUMN service_mode TEXT NOT NULL DEFAULT 'MANUAL' CHECK(service_mode IN('MANUAL','AUTO'))");
            update("DROP INDEX one_active_visit");
            update("CREATE UNIQUE INDEX one_active_visit ON visits(table_id) WHERE active=1 AND service_mode='MANUAL'");
            update("CREATE TABLE table_access(table_id INTEGER PRIMARY KEY REFERENCES cafe_tables(id),enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),token_hash TEXT NOT NULL UNIQUE,encrypted_secret TEXT NOT NULL)");
            update("PRAGMA user_version=9"); return null;
        });
    }
    private void migrateBusinessWorkflows() throws SQLException {
        transaction(() -> {
            update("CREATE TABLE IF NOT EXISTS visit_continuations(from_membership_id TEXT PRIMARY KEY REFERENCES guest_memberships(id),to_membership_id TEXT NOT NULL UNIQUE REFERENCES guest_memberships(id))");
            update("CREATE TABLE IF NOT EXISTS order_resolutions(order_id INTEGER PRIMARY KEY REFERENCES orders(id),state TEXT NOT NULL CHECK(state IN('CANCELLED','REFUNDED')),payment_id TEXT REFERENCES order_payments(id),amount_vnd INTEGER NOT NULL CHECK(amount_vnd>=0),reason TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL)");
            update("PRAGMA user_version=10"); return null;
        });
    }
    private void migrateConvenience() throws SQLException {
        transaction(()->{
            if(!query("PRAGMA table_info(menu)",r->r.getString("name")).contains("purchase_version")) {
                schema("ALTER TABLE menu ADD COLUMN purchase_version INTEGER NOT NULL DEFAULT 1");update("UPDATE menu SET purchase_version=version");
            }
            if(!query("PRAGMA table_info(order_items)",r->r.getString("name")).contains("line_no")) {
                schema("CREATE TABLE order_items_next(order_id INTEGER NOT NULL REFERENCES orders(id),line_no INTEGER NOT NULL,menu_id INTEGER NOT NULL REFERENCES menu(id),name TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20),unit_price_vnd INTEGER NOT NULL CHECK(unit_price_vnd>0),note TEXT NOT NULL DEFAULT '',PRIMARY KEY(order_id,line_no))");
                update("INSERT INTO order_items_next SELECT order_id,menu_id,menu_id,name,quantity,unit_price_vnd,'' FROM order_items");schema("DROP TABLE order_items");schema("ALTER TABLE order_items_next RENAME TO order_items");
            }
            if(!query("PRAGMA table_info(tickets)",r->r.getString("name")).contains("version")) {
                schema("CREATE TABLE tickets_next(id INTEGER PRIMARY KEY AUTOINCREMENT,visit_id TEXT NOT NULL REFERENCES visits(id),type TEXT NOT NULL CHECK(type IN('CALL_SERVICE','REQUEST_BILL')),status TEXT NOT NULL CHECK(status IN('OPEN','HANDLED','CANCELLED')),note TEXT NOT NULL,reply TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0)");
                update("INSERT INTO tickets_next SELECT id,visit_id,type,status,note,reply,created_at,0 FROM tickets");schema("DROP TABLE tickets");schema("ALTER TABLE tickets_next RENAME TO tickets");schema("CREATE UNIQUE INDEX one_open_ticket ON tickets(visit_id,type) WHERE status='OPEN'");
            }
            update("CREATE TABLE IF NOT EXISTS ticket_changes(ticket_id INTEGER NOT NULL REFERENCES tickets(id),version INTEGER NOT NULL,kind TEXT NOT NULL,note TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(ticket_id,version))");
            update("INSERT OR IGNORE INTO store_settings VALUES('accepting_orders','1')");update("PRAGMA user_version=11");return null;
        });
    }
    <T> List<T> query(String sql, Mapper<T> mapper, Object... args) throws SQLException {
        try (PreparedStatement statement = prepare(sql, args); ResultSet rows = statement.executeQuery()) {
            List<T> result = new ArrayList<>(); while (rows.next()) result.add(mapper.map(rows)); return result;
        }
    }
    int update(String sql, Object... args) throws SQLException { try (PreparedStatement s = prepare(sql, args)) { return s.executeUpdate(); } }
    long insert(String sql, Object... args) throws SQLException { update(sql, args); return query("SELECT last_insert_rowid()", r -> r.getLong(1)).get(0); }
    private PreparedStatement prepare(String sql, Object... args) throws SQLException {
        PreparedStatement statement = connection.prepareStatement(sql);
        try { for (int i = 0; i < args.length; i++) statement.setObject(i + 1, args[i]); return statement; }
        catch (SQLException e) { statement.close(); throw e; }
    }
    <T> T transaction(Work<T> work) throws SQLException {
        connection.setAutoCommit(false);
        try { T value = work.run(); connection.commit(); return value; }
        catch (SQLException | RuntimeException e) { connection.rollback(); throw e; }
        finally { connection.setAutoCommit(true); }
    }
    @Override public void close() throws SQLException { connection.close(); }
}
