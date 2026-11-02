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
    void pauseAll() throws SQLException {
        if (db.update("UPDATE table_access SET enabled=0 WHERE enabled=1") > 0)
            db.update("UPDATE metadata SET value=value+1 WHERE name='revision'");
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
    private int lookup(String grant, boolean requireEnabled) throws SQLException {
        if(grant==null||!grant.matches("[A-Za-z0-9_-]{43}"))throw new BusinessException("INVALID_GRANT","QR bàn không hợp lệ.");
        var rows=db.query("SELECT table_id,enabled FROM table_access WHERE token_hash=?",r->{if(requireEnabled&&r.getInt("enabled")!=1)throw new BusinessException("TABLE_PAUSED","Bàn đang tạm ngừng nhận khách mới.");return r.getInt("table_id");},Commands.digest(grant));
        if(rows.isEmpty())throw new BusinessException("INVALID_GRANT","QR bàn không hợp lệ.");return rows.get(0);
    }
    Identity join(String grant) throws SQLException {
        qr.checkJoinRate();int table=lookup(grant,true);
        if(db.query("SELECT count(*) FROM visits WHERE active=1 AND service_mode='AUTO'",r->r.getInt(1)).get(0)>=512)throw new BusinessException("VISIT_LIMIT","Quán đang có quá nhiều phiên. Vui lòng nhờ nhân viên hỗ trợ.");
        String visit=UUID.randomUUID().toString();
        db.update("INSERT INTO visits(id,table_id,active,opened_at,payment_mode,service_mode) VALUES(?,?,1,?,'PREPAY','AUTO')",visit,table,config.clock.instant().toString());
        db.update("UPDATE metadata SET value=value+1 WHERE name='revision'");
        return qr.issue(visit,table);
    }
    void confirm(Identity who,String grant) throws SQLException {
        qr.validate(who);int table=lookup(grant,false);
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
    boolean hasOpenWork(String visit) throws SQLException {
        return !db.query("SELECT id FROM orders WHERE visit_id=? AND payment_state NOT IN('CANCELLED','REFUNDED') AND (payment_state!='PAID' OR status!='SERVED') LIMIT 1",r->r.getLong(1),visit).isEmpty()
                || !db.query("SELECT id FROM tickets WHERE visit_id=? AND status='OPEN' LIMIT 1",r->r.getLong(1),visit).isEmpty();
    }
    void closeDepartedVisit(String visit) throws SQLException {
        if(qr.hasActiveMemberships(visit))return;
        db.update("UPDATE visits SET active=0,state='CLOSED',version=version+1,closed_at=? WHERE id=? AND service_mode='AUTO' AND active=1",config.clock.instant().toString(),visit);
    }
    JsonObject endTableSessions(int table) throws SQLException {
        if(db.query("SELECT table_id FROM table_access WHERE table_id=?",r->r.getInt(1),table).isEmpty())
            throw new BusinessException("NOT_AUTOMATIC_TABLE","Bàn này không dùng QR cố định.");
        var visits=db.query("SELECT id FROM visits WHERE table_id=? AND service_mode='AUTO' AND active=1",r->r.getString(1),table);
        for(String visit:visits) if(hasOpenWork(visit))
            throw new BusinessException("TABLE_HAS_WORK","Bàn còn đơn chưa thanh toán/giao hoặc yêu cầu hỗ trợ đang mở. Hoàn tất các việc đó trước khi kết thúc phiên.");
        for(String visit:visits) {
            qr.revokeVisit(visit);
            db.update("UPDATE visits SET active=0,state='CLOSED',version=version+1,closed_at=? WHERE id=? AND active=1",config.clock.instant().toString(),visit);
            events.append(visit,"ADMIN_END_VISIT",visit,"Quản lý đã kết thúc phiên tại bàn");
        }
        JsonObject result=new JsonObject();result.addProperty("tableId",table);result.addProperty("endedSessions",visits.size());return result;
    }
}
