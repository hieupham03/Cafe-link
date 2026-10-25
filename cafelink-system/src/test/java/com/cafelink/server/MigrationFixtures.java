package com.cafelink.server;
import java.sql.*;
/** Only for constructing genuine old database schemas at the migration boundary. */
final class MigrationFixtures {
 static void removeAfterV5(Statement sql)throws SQLException{
  sql.execute("DROP TABLE table_access");sql.execute("DROP INDEX one_active_visit");sql.execute("ALTER TABLE visits DROP COLUMN service_mode");sql.execute("CREATE UNIQUE INDEX one_active_visit ON visits(table_id) WHERE active=1");
  sql.execute("DROP TABLE order_payments");sql.execute("DROP TABLE notification_reads");sql.execute("DROP TABLE business_events");sql.execute("DROP TABLE menu_categories");
  for(String col:new String[]{"description","image_url","available","active","version","sort_order"})sql.execute("ALTER TABLE menu DROP COLUMN "+col);
  sql.execute("ALTER TABLE orders DROP COLUMN payment_state");sql.execute("ALTER TABLE visits DROP COLUMN payment_mode");sql.execute("DELETE FROM metadata WHERE name='event_floor'");sql.execute("PRAGMA user_version=5");
 }
}
