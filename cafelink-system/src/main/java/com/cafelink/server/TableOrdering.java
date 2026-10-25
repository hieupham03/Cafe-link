package com.cafelink.server;

import com.cafelink.common.*;
import com.cafelink.common.Models.Identity;
import com.google.gson.JsonObject;
import java.sql.SQLException;
import java.util.UUID;
import java.util.List;

/** A table is a delivery address. Each scan from a new browser gets a private visit. */
final class TableOrdering {
    private final Database db;
    private final QrAccess qr;
    private final QrConfig config;
    private final EventFeed events;
    TableOrdering(Database db,QrAccess qr,QrConfig config,EventFeed events) {
        this.db=db;this.qr=qr;this.config=config;this.events=events;
    }
    JsonObject enableAll() throws SQLException {
        if(!db.query("SELECT id FROM visits WHERE active=1 AND service_mode='MANUAL'",r->r.getString(1)).isEmpty())
            throw new BusinessException("LEGACY_VISIT_ACTIVE","Hãy hoàn tất các lượt bàn cũ trước khi bật QR cố định cho toàn quán.");
        for(int table:db.query("SELECT id FROM cafe_tables",r->r.getInt(1))) { ensure(table); db.update("UPDATE table_access SET enabled=1 WHERE table_id=?",table); }
        JsonObject result=new JsonObject();result.addProperty("enabledTables",db.query("SELECT count(*) FROM table_access WHERE enabled=1",r->r.getInt(1)).get(0));return result;
    }
    private void ensure(int table) throws SQLException {
        if(db.query("SELECT id FROM cafe_tables WHERE id=?",r->r.getInt(1),table).isEmpty())throw new BusinessException("NOT_FOUND","Không có bàn này.");
        if(db.query("SELECT table_id FROM table_access WHERE table_id=?",r->r.getInt(1),table).isEmpty()) {
            String secret=config.secret();db.update("INSERT INTO table_access(table_id,token_hash,encrypted_secret) VALUES(?,?,?)",table,Commands.digest(secret),config.encrypt(secret,"table:"+table));
        }
    }
    JsonObject qr(int table) throws SQLException {
        if(db.query("SELECT table_id FROM table_access WHERE table_id=?",r->r.getInt(1),table).isEmpty())throw new BusinessException("NOT_ENABLED","Hãy mở tất cả bàn để bật QR cố định.");
        return db.query("SELECT * FROM table_access WHERE table_id=?",r->{JsonObject o=new JsonObject();o.addProperty("tableId",table);o.addProperty("grant",config.decrypt(r.getString("encrypted_secret"),"table:"+table));o.addProperty("enabled",r.getInt("enabled")==1);return o;},table).get(0);
    }
    private int lookup(String grant) throws SQLException {
        if(grant==null||!grant.matches("[A-Za-z0-9_-]{43}"))throw new BusinessException("INVALID_GRANT","QR bàn không hợp lệ.");
        var rows=db.query("SELECT table_id,enabled FROM table_access WHERE token_hash=?",r->{if(r.getInt("enabled")!=1)throw new BusinessException("TABLE_PAUSED","Bàn đang tạm ngừng nhận khách mới.");return r.getInt("table_id");},Commands.digest(grant));
        if(rows.isEmpty())throw new BusinessException("INVALID_GRANT","QR bàn không hợp lệ.");return rows.get(0);
    }
    Identity join(String grant) throws SQLException {
        qr.checkJoinRate();int table=lookup(grant);
        // Expire only abandoned empty sessions; never discard an accepted order or support request.
        db.update("UPDATE visits SET active=0,state='CLOSED',closed_at=? WHERE service_mode='AUTO' AND active=1 AND opened_at<? AND NOT EXISTS(SELECT 1 FROM orders WHERE visit_id=visits.id) AND NOT EXISTS(SELECT 1 FROM tickets WHERE visit_id=visits.id)",config.clock.instant().toString(),config.clock.instant().minusSeconds(28800).toString());
        if(db.query("SELECT count(*) FROM visits WHERE active=1 AND service_mode='AUTO'",r->r.getInt(1)).get(0)>=512)throw new BusinessException("VISIT_LIMIT","Quán đang có quá nhiều phiên. Vui lòng nhờ nhân viên hỗ trợ.");
        String visit=UUID.randomUUID().toString();
        db.update("INSERT INTO visits(id,table_id,active,opened_at,payment_mode,service_mode) VALUES(?,?,1,?,'PREPAY','AUTO')",visit,table,config.clock.instant().toString());
        db.update("UPDATE metadata SET value=value+1 WHERE name='revision'");
        return qr.issue(visit,table);
    }
    void confirm(Identity who,String grant) throws SQLException {
        qr.validate(who);int table=lookup(grant);
        if(table!=who.tableId()||db.query("SELECT id FROM visits WHERE id=? AND service_mode='AUTO'",r->r.getString(1),who.visitId()).isEmpty())
            throw new BusinessException("SESSION_SWITCH_REQUIRED","Phiên đã kết thúc hoặc thuộc bàn khác. Hãy rời phiên cũ trước khi bắt đầu lần đặt mới.");
    }
    Identity continueVisit(Identity who) throws SQLException {
        qr.validate(who);
        if(db.query("SELECT id FROM visits WHERE id=? AND service_mode='AUTO' AND active=0",r->r.getString(1),who.visitId()).isEmpty())
            throw new BusinessException("INVALID_STATE","Chỉ bắt đầu lần tiếp theo khi công việc trước đã hoàn tất.");
        var existing=db.query("SELECT to_membership_id FROM visit_continuations WHERE from_membership_id=?",r->r.getString(1),who.membershipId());
        if(!existing.isEmpty())return qr.issueSession(existing.get(0));
        Identity next=join(qr(who.tableId()).get("grant").getAsString());
        db.update("INSERT INTO visit_continuations VALUES(?,?)",who.membershipId(),next.membershipId());
        return next;
    }
    List<String> previousMemberships(Identity who) throws SQLException {
        List<String> result=new java.util.ArrayList<>();String member=who.membershipId();
        for(int n=0;n<20;n++) {
            var previous=db.query("SELECT from_membership_id FROM visit_continuations WHERE to_membership_id=?",r->r.getString(1),member);
            if(previous.isEmpty())break;member=previous.get(0);result.add(member);
        }
        return result;
    }
    void finishReadyVisits() throws SQLException {
        var ready=db.query("SELECT id FROM visits v WHERE service_mode='AUTO' AND active=1 AND (EXISTS(SELECT 1 FROM orders WHERE visit_id=v.id) OR EXISTS(SELECT 1 FROM tickets WHERE visit_id=v.id)) AND NOT EXISTS(SELECT 1 FROM orders WHERE visit_id=v.id AND payment_state NOT IN('CANCELLED','REFUNDED') AND (payment_state!='PAID' OR status!='SERVED')) AND NOT EXISTS(SELECT 1 FROM tickets WHERE visit_id=v.id AND status='OPEN')",r->r.getString(1));
        for(String visit:ready) {
            db.update("UPDATE visits SET active=0,state='CLOSED',version=version+1,closed_at=? WHERE id=?",config.clock.instant().toString(),visit);
            events.append(visit,"AUTO_COMPLETE",visit,"Đã hoàn tất các đơn và yêu cầu hỗ trợ của bạn");
        }
    }
}
