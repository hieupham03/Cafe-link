package com.cafelink.server;
import java.sql.*;
/** Only for constructing genuine old database schemas at the migration boundary. */
final class MigrationFixtures {
 static void removeFinance(Statement sql)throws SQLException{
  sql.execute("DROP TABLE cash_entries");
  for(String col:new String[]{"tax_rate_bps","tax_name","tax_inclusive","subtotal_vnd","tax_vnd","total_vnd"})sql.execute("ALTER TABLE orders DROP COLUMN "+col);
  sql.execute("DELETE FROM store_settings WHERE name='tax_config'");
 }
 static void removeAfterV5(Statement sql)throws SQLException{
  removeFinance(sql);
  sql.execute("DROP TABLE table_access");sql.execute("DROP INDEX one_active_visit");sql.execute("ALTER TABLE visits DROP COLUMN service_mode");sql.execute("CREATE UNIQUE INDEX one_active_visit ON visits(table_id) WHERE active=1");
  sql.execute("DROP TABLE order_payments");sql.execute("DROP TABLE notification_reads");sql.execute("DROP TABLE business_events");sql.execute("DROP TABLE menu_categories");
  for(String col:new String[]{"description","image_url","available","active","version","sort_order"})sql.execute("ALTER TABLE menu DROP COLUMN "+col);
  sql.execute("ALTER TABLE orders DROP COLUMN payment_state");sql.execute("ALTER TABLE visits DROP COLUMN payment_mode");sql.execute("DELETE FROM metadata WHERE name='event_floor'");sql.execute("PRAGMA user_version=5");
 }
}
