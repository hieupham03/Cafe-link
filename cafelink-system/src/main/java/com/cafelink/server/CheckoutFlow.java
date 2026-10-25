package com.cafelink.server;

import com.cafelink.common.Json;
import com.cafelink.common.Models.Checkout;
import com.google.gson.JsonObject;
import java.sql.SQLException;
import java.time.Instant;
import java.util.*;

/** Called only inside CafeService's serialized database transaction. No network I/O. */
final class CheckoutFlow {
    private final Database db;
    CheckoutFlow(Database db){this.db=db;}
    List<Checkout> list(String where,Object...args) throws SQLException {
        return db.query("SELECT c.*,v.table_id FROM checkout_requests c JOIN visits v ON v.id=c.visit_id WHERE "+where+" ORDER BY c.updated_at DESC",r->new Checkout(r.getString("id"),r.getString("visit_id"),r.getInt("table_id"),r.getString("state"),r.getLong("version"),r.getInt("cycle"),r.getString("created_at"),r.getString("updated_at")),args);
    }
    Checkout current(String visit) throws SQLException {var rows=list("c.visit_id=?",visit);return rows.isEmpty()?null:rows.get(0);}
    long visitVersion(String visit) throws SQLException {return db.query("SELECT version FROM visits WHERE id=?",r->r.getLong(1),visit).get(0);}
    void bump(String visit) throws SQLException {db.update("UPDATE visits SET version=version+1 WHERE id=?",visit);}
    void orderingAllowed(String visit) throws SQLException {
        String state=db.query("SELECT state FROM visits WHERE id=?",r->r.getString(1),visit).get(0);
        if(!state.equals("OPEN"))throw error("CHECKOUT_IN_PROGRESS","Bàn đang tính tiền. Nhờ nhân viên mở lại gọi món nếu cần.");
    }
    void versions(String visit,Checkout checkout,JsonObject input) throws SQLException {
        if(CafeService.integer(input,"expectedVisitVersion")!=visitVersion(visit)||CafeService.integer(input,"expectedCheckoutVersion")!=(checkout==null?0:checkout.version()))
            throw error("VERSION_CONFLICT","Trạng thái bàn đã thay đổi. Hãy xem lại trước khi thao tác.");
    }
    JsonObject request(String visit,String actor,JsonObject input) throws SQLException {
        Checkout existing=current(visit);
        if(existing!=null&&Set.of("REQUESTED","ACKNOWLEDGED").contains(existing.state()))return Json.object(existing);
        versions(visit,existing,input);
        if(db.query("SELECT id FROM orders WHERE visit_id=?",r->r.getLong(1),visit).isEmpty())throw error("INVALID_STATE","Bàn chưa có đơn để tính tiền.");
        String now=Instant.now().toString();
        if(existing==null)db.update("INSERT INTO checkout_requests VALUES(?,?,'REQUESTED',1,1,?,?)",UUID.randomUUID().toString(),visit,now,now);
        else db.update("UPDATE checkout_requests SET state='REQUESTED',version=version+1,cycle=cycle+1,updated_at=? WHERE visit_id=?",now,visit);
        db.update("UPDATE visits SET state='CHECKOUT_REQUESTED',version=version+1 WHERE id=?",visit);
        audit(current(visit),actor,"");return Json.object(current(visit));
    }
    JsonObject change(String visit,String actor,JsonObject input,boolean reopen) throws SQLException {
        Checkout checkout=current(visit);versions(visit,checkout,input);
        if(checkout==null||(!reopen&&!checkout.state().equals("REQUESTED"))||(reopen&&!Set.of("REQUESTED","ACKNOWLEDGED").contains(checkout.state())))throw error("INVALID_STATE","Yêu cầu tính tiền không ở bước cho phép.");
        String reason=reopen?CafeService.text(input,"reason",500,true):"";
        db.update("UPDATE checkout_requests SET state=?,version=version+1,updated_at=? WHERE visit_id=?",reopen?"CANCELLED":"ACKNOWLEDGED",Instant.now().toString(),visit);
        db.update("UPDATE visits SET state=?,version=version+1 WHERE id=?",reopen?"OPEN":"CHECKOUT_REQUESTED",visit);
        audit(current(visit),actor,reason);return Json.object(current(visit));
    }
    void validatePayment(String visit,long total,JsonObject input) throws SQLException {
        Checkout checkout=current(visit);
        if(checkout==null||!checkout.state().equals("ACKNOWLEDGED"))throw error("INVALID_STATE","Cần tiếp nhận yêu cầu tính tiền trước khi thu tiền.");
        if(CafeService.integer(input,"expectedBillVersion")!=visitVersion(visit)||CafeService.integer(input,"expectedTotalVnd")!=total)
            throw error("VERSION_CONFLICT","Hóa đơn đã thay đổi. Xem lại tổng tiền và xác nhận lại.");
    }
    void paid(String visit,String actor) throws SQLException {
        db.update("UPDATE checkout_requests SET state='PAID',version=version+1,updated_at=? WHERE visit_id=?",Instant.now().toString(),visit);
        db.update("UPDATE visits SET state='CLOSED',version=version+1 WHERE id=?",visit);audit(current(visit),actor,"");
    }
    JsonObject events(String visit) throws SQLException {
        JsonObject result=new JsonObject();result.add("checkout",Json.GSON.toJsonTree(current(visit)));
        var rows=db.query("SELECT e.* FROM checkout_events e JOIN checkout_requests c ON c.id=e.checkout_id WHERE c.visit_id=? ORDER BY e.id",r->{JsonObject row=new JsonObject();row.addProperty("state",r.getString("state"));row.addProperty("version",r.getLong("version"));row.addProperty("reason",r.getString("reason"));row.addProperty("createdAt",r.getString("created_at"));return row;},visit);
        result.add("events",Json.GSON.toJsonTree(rows));return result;
    }
    private void audit(Checkout checkout,String actor,String reason) throws SQLException {db.update("INSERT INTO checkout_events(checkout_id,state,version,actor,reason,created_at) VALUES(?,?,?,?,?,?)",checkout.checkoutId(),checkout.state(),checkout.version(),actor,reason,Instant.now().toString());}
    private static BusinessException error(String code,String message){return new BusinessException(code,message);}
}
