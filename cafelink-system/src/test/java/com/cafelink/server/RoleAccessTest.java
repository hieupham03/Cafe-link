package com.cafelink.server;

import com.cafelink.common.Json;
import com.cafelink.common.Models.*;
import com.google.gson.JsonObject;
import java.nio.file.Path;
import java.sql.*;
import java.time.Clock;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class RoleAccessTest {
    @TempDir Path temp;
    CafeService service; Identity admin,staff,guest;
    static JsonObject j(String s){return Json.GSON.fromJson(s,JsonObject.class);}
    JsonObject call(Identity who,String action,JsonObject input)throws Exception{return service.execute(who,UUID.randomUUID().toString(),action,input);}
    @BeforeEach void start()throws Exception{
        service=new CafeService(temp.resolve("roles.db"),new QrConfig(new byte[32],Clock.systemUTC()),true);
        admin=service.authenticate("admin","CafeLink@123");
        call(admin,"CREATE_STAFF_ACCOUNT",j("{\"username\":\"nv01\",\"displayName\":\"Nhân viên 01\",\"password\":\"NhanVien@123\"}"));
        staff=service.authenticate("nv01","NhanVien@123");call(admin,"OPEN_ALL_TABLES",j("{}"));
        guest=service.joinTable(call(admin,"GET_TABLE_QR",j("{\"tableId\":1}")).get("grant").getAsString());
    }
    @AfterEach void stop()throws Exception{service.close();}
    JsonObject account()throws Exception{return call(admin,"GET_STAFF_ACCOUNTS",j("{}")).getAsJsonArray("accounts").get(0).getAsJsonObject();}
    JsonObject change(int enabled)throws Exception{JsonObject data=account();data.addProperty("expectedVersion",data.get("version").getAsLong());data.addProperty("enabled",enabled);return call(admin,"SET_STAFF_ACTIVE",data);}
    JsonObject order()throws Exception{
        MenuItem m=service.snapshot(guest,Map.of()).menu().stream().filter(x->x.id()==2).findFirst().orElseThrow();
        return call(guest,"PLACE_ORDER",j("{\"visitId\":\""+guest.visitId()+"\",\"items\":[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":"+m.version()+",\"expectedPriceVnd\":"+m.priceVnd()+"}]}"));
    }
    JsonObject id(long id){return j("{\"orderId\":"+id+"}");}
    void forbidden(Identity who,String action,JsonObject payload)throws Exception{assertEquals("FORBIDDEN",assertThrows(BusinessException.class,()->call(who,action,payload)).code(),action);}
    @Test void staffGetsOperationalSnapshotAndOwnDistinctPrincipal()throws Exception{
        assertEquals("STAFF",staff.role());assertEquals(admin.storeId(),staff.storeId());assertNull(staff.tableId());assertTrue(staff.accountVersion()>0);
        assertEquals(6,service.snapshot(staff,Map.of()).tables().size());assertEquals(guest.visitId(),service.snapshot(staff,Map.of()).orders().stream().findFirst().map(OrderView::visitId).orElse(guest.visitId()));
        assertFalse(account().toString().contains("password"));assertFalse(account().toString().contains("hash"));
    }
    @Test void staffCanReceivePrepareServeAndReplyButCustomerStillPays()throws Exception{
        long id=order().get("orderId").getAsLong();call(staff,"ACCEPT_ORDER",id(id));
        JsonObject pay=id(id);pay.addProperty("visitId",guest.visitId());pay=call(guest,"START_ORDER_PAYMENT",pay);pay.addProperty("outcome","SUCCESS");call(guest,"SIMULATE_PAYMENT",pay);
        JsonObject ticket=call(guest,"CALL_SERVICE",j("{\"visitId\":\""+guest.visitId()+"\",\"note\":\"Thêm nước\"}"));
        call(staff,"HANDLE_TICKET",j("{\"ticketId\":"+ticket.get("ticketId")+",\"reply\":\"Đã mang nước\"}"));
        for(String status:List.of("PREPARING","READY","SERVED"))call(staff,"SET_ORDER_STATUS",j("{\"orderId\":"+id+",\"status\":\""+status+"\"}"));
        var entries=call(admin,"GET_STAFF_AUDIT",j("{}")).getAsJsonArray("entries");assertEquals(6,entries.size());
        assertTrue(entries.asList().stream().filter(e->!e.getAsJsonObject().get("action").getAsString().equals("CREATE_STAFF_ACCOUNT")).allMatch(e->e.getAsJsonObject().get("actor").getAsString().equals("nv01")));
    }
    @Test void staffCannotReadMoneyHistoryOrChangeManagementConfiguration()throws Exception{
        for(String action:List.of("GET_FINANCE_REPORT","GET_TAX_SETTINGS","SAVE_TAX_SETTINGS","CREATE_EXPENSE","VOID_EXPENSE","GET_SALES_HISTORY","GET_SALES_RECEIPT","CREATE_MENU_ITEM","UPDATE_MENU_ITEM","SAVE_MENU_CATEGORY","DELETE_MENU_CATEGORY","GET_STAFF_ACCOUNTS","CREATE_STAFF_ACCOUNT","SET_STAFF_ACTIVE","RESET_STAFF_PASSWORD","GET_STAFF_AUDIT","PAY_AND_CLOSE","SET_STORE_ACCEPTING","OPEN_ALL_TABLES","REVOKE_SESSION"))forbidden(staff,action,j("{}"));
    }
    @Test void unpaidRefusalIsAllowedButRefundRequiresManager()throws Exception{
        long id=order().get("orderId").getAsLong();forbidden(staff,"RESOLVE_ORDER",j("{\"orderId\":"+id+",\"resolution\":\"REFUND\",\"reason\":\"x\"}"));
        call(staff,"RESOLVE_ORDER",j("{\"orderId\":"+id+",\"resolution\":\"CANCEL_UNPAID\",\"reason\":\"Hết sữa\"}"));
        assertEquals("REJECTED",service.snapshot(guest,Map.of()).orders().get(0).acceptanceState());
    }
    @Test void availabilityCommandCannotSmugglePriceOrOverwriteAConcurrentEdit()throws Exception{
        var menu=service.snapshot(staff,Map.of()).menu().get(1);long price=menu.priceVnd();
        JsonObject payload=j("{\"menuId\":"+menu.id()+",\"expectedVersion\":"+menu.version()+",\"available\":false,\"priceVnd\":1}");
        assertEquals("INVALID_INPUT",assertThrows(BusinessException.class,()->call(staff,"SET_MENU_AVAILABILITY",payload)).code());payload.remove("priceVnd");
        call(staff,"SET_MENU_AVAILABILITY",payload);assertEquals(price,service.snapshot(staff,Map.of()).menu().get(1).priceVnd());assertFalse(service.snapshot(staff,Map.of()).menu().get(1).available());
        assertEquals("VERSION_CONFLICT",assertThrows(BusinessException.class,()->call(staff,"SET_MENU_AVAILABILITY",payload)).code());
    }
    @Test void lockingAndReenablingNeverRevivesAnOldIdentity()throws Exception{
        change(0);assertEquals("AUTH_FAILED",assertThrows(BusinessException.class,()->service.authenticate("nv01","NhanVien@123")).code());
        for(var attempt:List.<org.junit.jupiter.api.function.Executable>of(()->service.snapshot(staff,Map.of()),()->service.outcome(staff,"old"),()->call(staff,"GET_TABLE_QR",j("{\"tableId\":1}"))))assertEquals("SESSION_REVOKED",assertThrows(BusinessException.class,attempt).code());
        change(1);assertEquals("SESSION_REVOKED",assertThrows(BusinessException.class,()->service.checkIdentity(staff)).code());
        assertEquals("STAFF",service.authenticate("nv01","NhanVien@123").role());assertNotNull(service.snapshot(admin,Map.of()));
    }
    @Test void passwordResetRevokesCurrentSessionsAndDoesNotExposePassword()throws Exception{
        JsonObject input=account();input.addProperty("expectedVersion",input.get("version").getAsLong());input.addProperty("password","NewStaff@456");
        assertFalse(call(admin,"RESET_STAFF_PASSWORD",input).toString().contains("NewStaff@456"));
        assertThrows(BusinessException.class,()->service.authenticate("nv01","NhanVien@123"));assertEquals("STAFF",service.authenticate("nv01","NewStaff@456").role());
        assertEquals("SESSION_REVOKED",assertThrows(BusinessException.class,()->service.checkIdentity(staff)).code());
        assertFalse(call(admin,"GET_STAFF_AUDIT",j("{}")).toString().contains("NewStaff@456"));
    }
    @Test void accountMutationIsIdempotentAndDuplicateUsernameIsRejected()throws Exception{
        JsonObject input=j("{\"username\":\"nv02\",\"displayName\":\"Hai\",\"password\":\"NhanVien@456\"}");
        JsonObject first=service.execute(admin,"create-once","CREATE_STAFF_ACCOUNT",input);assertEquals(first,service.execute(admin,"create-once","CREATE_STAFF_ACCOUNT",input));
        assertEquals("ACCOUNT_EXISTS",assertThrows(BusinessException.class,()->call(admin,"CREATE_STAFF_ACCOUNT",input)).code());
        assertEquals(2,call(admin,"GET_STAFF_ACCOUNTS",j("{}")).getAsJsonArray("accounts").size());
    }
    @Test void accountChangesCheckVersionAndNeverAllowChangingAdmin()throws Exception{
        JsonObject old=account();change(0);old.addProperty("expectedVersion",old.get("version").getAsLong());old.addProperty("enabled",1);
        assertEquals("VERSION_CONFLICT",assertThrows(BusinessException.class,()->call(admin,"SET_STAFF_ACTIVE",old)).code());
        assertThrows(BusinessException.class,()->call(admin,"SET_STAFF_ACTIVE",j("{\"username\":\"admin\",\"expectedVersion\":1,\"enabled\":0}")));
        forbidden(admin,"CREATE_STAFF_ACCOUNT",j("{\"username\":\"admin2\",\"displayName\":\"x\",\"password\":\"AdminOther@12\",\"role\":\"ADMIN\"}"));
        assertEquals("ADMIN",service.authenticate("admin","CafeLink@123").role());
    }
    @Test void guestsCannotUseNewOperatorOrAccountCommands()throws Exception{
        for(String action:List.of("GET_STAFF_ACCOUNTS","GET_STAFF_AUDIT","CREATE_STAFF_ACCOUNT","SET_STAFF_ACTIVE","RESET_STAFF_PASSWORD","SET_MENU_AVAILABILITY"))forbidden(guest,action,j("{}"));
    }
    @Test void staffCannotForgeManagerIdentityOrCreateFinancialDiscardBarrier()throws Exception{
        var forged=new Identity(staff.username(),"ADMIN",null,null,null,null,staff.storeId(),staff.accountVersion());
        assertEquals("SESSION_REVOKED",assertThrows(BusinessException.class,()->call(forged,"GET_FINANCE_REPORT",j("{}"))).code());
        assertEquals("FORBIDDEN",assertThrows(BusinessException.class,()->service.discard(staff,"forbidden-discard","SAVE_TAX_SETTINGS",j("{}"))).code());
        assertFalse(service.outcome(staff,"forbidden-discard").get("found").getAsBoolean());
        assertTrue(service.discard(staff,"allowed-discard","ACCEPT_ORDER",j("{\"orderId\":9}")).get("found").getAsBoolean());
    }
    @Test void v12MigrationRetainsGuestTokensAdminAndReceipt()throws Exception{
        long order=order().get("orderId").getAsLong();String token=guest.credential();service.close();
        try(Connection c=DriverManager.getConnection("jdbc:sqlite:"+temp.resolve("roles.db"));Statement sql=c.createStatement()){
            sql.execute("PRAGMA foreign_keys=OFF");sql.execute("CREATE TABLE old_accounts(username TEXT PRIMARY KEY,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN('ADMIN','GUEST')),table_id INTEGER REFERENCES cafe_tables(id))");
            sql.execute("INSERT INTO old_accounts SELECT username,password_hash,role,table_id FROM accounts WHERE role!='STAFF'");sql.execute("DROP TABLE accounts");sql.execute("ALTER TABLE old_accounts RENAME TO accounts");sql.execute("DROP TABLE staff_audit");sql.execute("PRAGMA user_version=12");
        }
        service=new CafeService(temp.resolve("roles.db"),new QrConfig(new byte[32],Clock.systemUTC()),true);admin=service.authenticate("admin","CafeLink@123");
        assertEquals(guest.membershipId(),service.resume(token).membershipId());assertEquals(order,service.snapshot(guest,Map.of()).orders().get(0).id());
        assertTrue(call(admin,"GET_STAFF_ACCOUNTS",j("{}")).getAsJsonArray("accounts").isEmpty());
        try(Connection c=DriverManager.getConnection("jdbc:sqlite:"+temp.resolve("roles.db"));Statement sql=c.createStatement();ResultSet r=sql.executeQuery("PRAGMA foreign_key_check")){assertFalse(r.next());}
    }
    @Test void passwordReceiptsDoNotStoreAnUnsaltedFastPasswordFingerprint()throws Exception{
        JsonObject input=j("{\"username\":\"nv03\",\"displayName\":\"Ba\",\"password\":\"NhanVien@789\"}");
        service.execute(admin,"credential-receipt","CREATE_STAFF_ACCOUNT",input);
        try(Connection c=DriverManager.getConnection("jdbc:sqlite:"+temp.resolve("roles.db"));Statement sql=c.createStatement();ResultSet r=sql.executeQuery("SELECT fingerprint,result_json FROM command_receipts WHERE command_id='credential-receipt'")){
            assertTrue(r.next());String fingerprint=r.getString(1);assertNotEquals(com.cafelink.common.Commands.fingerprint("CREATE_STAFF_ACCOUNT",input),fingerprint);
            assertTrue(PasswordHash.verify(com.cafelink.common.Commands.fingerprint("CREATE_STAFF_ACCOUNT",input),fingerprint));assertFalse(r.getString(2).contains("NhanVien@789"));
        }
    }
    @Test void staffFeedCannotRevealHistoricalSalesAfterAVisitEnds()throws Exception{
        long id=order().get("orderId").getAsLong();call(staff,"RESOLVE_ORDER",j("{\"orderId\":"+id+",\"resolution\":\"CANCEL_UNPAID\",\"reason\":\"Hết sữa\"}"));
        service.logoutGuest(guest);
        assertFalse(call(admin,"GET_NOTIFICATIONS",j("{}")).getAsJsonArray("events").isEmpty());
        assertTrue(call(staff,"GET_NOTIFICATIONS",j("{}")).getAsJsonArray("events").isEmpty());
    }
}
