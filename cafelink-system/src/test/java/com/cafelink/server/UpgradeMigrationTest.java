package com.cafelink.server;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.sql.*;
import java.time.Clock;
import java.util.*;
import com.google.gson.*;
import static org.junit.jupiter.api.Assertions.*;
class UpgradeMigrationTest {
 @TempDir Path temp;
 @Test void activeV5VisitsRemainPostpayWhileNewVisitsUsePrepay()throws Exception{
  Path file=temp.resolve("v5.db");String visit;try(CafeService old=new CafeService(file,new QrConfig(new byte[32],Clock.systemUTC()))){visit=old.execute(old.authenticate("admin","CafeLink@123"),"OPEN_TABLE",JsonParser.parseString("{\"tableId\":1}").getAsJsonObject()).get("visitId").getAsString();}
  try(Connection c=DriverManager.getConnection("jdbc:sqlite:"+file);Statement sql=c.createStatement()){MigrationFixtures.removeAfterV5(sql);}
  try(CafeService upgraded=new CafeService(file,new QrConfig(new byte[32],Clock.systemUTC()),true)){var admin=upgraded.authenticate("admin","CafeLink@123");assertEquals("POSTPAY",upgraded.snapshot(admin,Map.of()).tables().get(0).paymentMode());assertEquals(visit,upgraded.snapshot(admin,Map.of()).tables().get(0).visitId());upgraded.execute(admin,"OPEN_TABLE",JsonParser.parseString("{\"tableId\":2}").getAsJsonObject());assertEquals("PREPAY",upgraded.snapshot(admin,Map.of()).tables().get(1).paymentMode());}
 }
}
