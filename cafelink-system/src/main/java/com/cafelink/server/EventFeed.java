package com.cafelink.server;

import com.cafelink.common.Json;
import com.google.gson.*;
import java.sql.SQLException;
import java.time.Instant;
import java.util.*;

/** Durable commit log. Reading is independent of lossy snapshot delivery. */
final class EventFeed {
    private final Database db;
    EventFeed(Database db){this.db=db;}
    void append(String visit,String type,String entity,String title) throws SQLException {
        if(visit==null)return;
        var tables=db.query("SELECT table_id FROM visits WHERE id=?",r->r.getInt(1),visit);
        if(tables.isEmpty())return;
        db.insert("INSERT INTO business_events(visit_id,table_id,type,entity_id,title,created_at) VALUES(?,?,?,?,?,?)",visit,tables.get(0),type,entity,title,Instant.now().toString());
        long expired=db.query("SELECT COALESCE(MAX(id),0) FROM business_events WHERE created_at<?",r->r.getLong(1),Instant.now().minusSeconds(7*86400).toString()).get(0);
        db.update("INSERT INTO metadata(name,value) VALUES('event_floor',?) ON CONFLICT(name) DO UPDATE SET value=MAX(value,excluded.value)",expired);
        db.update("DELETE FROM business_events WHERE created_at<?",Instant.now().minusSeconds(7*86400).toString());
    }
    JsonObject list(String principal,String visit,JsonObject input) throws SQLException {
        int after=input.has("after")?CafeService.integer(input,"after"):0;
        int before=input.has("before")?CafeService.integer(input,"before"):Integer.MAX_VALUE;
        int limit=input.has("limit")?CafeService.integer(input,"limit"):50;
        if(after<0||before<1||limit<1||limit>100)throw new BusinessException("INVALID_INPUT","Phân trang thông báo không hợp lệ.");
        String scope=visit==null?"1=1":"e.visit_id=?";
        List<Object> args=new ArrayList<>();args.add(principal);if(visit!=null)args.add(visit);args.add(after);args.add(before);args.add(limit+1);
        boolean history=input.has("before");
        var rows=db.query("SELECT e.*,EXISTS(SELECT 1 FROM notification_reads n WHERE n.event_id=e.id AND n.principal=?) is_read FROM business_events e WHERE "+scope+" AND e.id>? AND e.id<? ORDER BY e.id "+(history?"DESC":"ASC")+" LIMIT ?",r->{
            JsonObject o=new JsonObject();o.addProperty("id",r.getLong("id"));o.addProperty("visitId",r.getString("visit_id"));o.addProperty("tableId",r.getInt("table_id"));o.addProperty("type",r.getString("type"));o.addProperty("entityId",r.getString("entity_id"));o.addProperty("title",r.getString("title"));o.addProperty("createdAt",r.getString("created_at"));o.addProperty("read",r.getBoolean("is_read"));return o;
        },args.toArray());
        boolean more=rows.size()>limit;if(more)rows=rows.subList(0,limit);
        var scoped=visit==null?new Object[]{}:new Object[]{visit};
        long floor=db.query("SELECT COALESCE((SELECT value FROM metadata WHERE name='event_floor'),0)",r->r.getLong(1)).get(0);
        long latest=db.query("SELECT COALESCE(MAX(e.id),0) FROM business_events e WHERE "+scope,r->r.getLong(1),scoped).get(0);
        List<Object> unreadArgs=new ArrayList<>();if(visit!=null)unreadArgs.add(visit);unreadArgs.add(principal);
        long unread=db.query("SELECT COUNT(*) FROM business_events e WHERE "+scope+" AND NOT EXISTS(SELECT 1 FROM notification_reads n WHERE n.event_id=e.id AND n.principal=?)",r->r.getLong(1),unreadArgs.toArray()).get(0);
        JsonObject out=new JsonObject();out.add("events",Json.GSON.toJsonTree(rows));out.addProperty("hasMore",more);out.addProperty("latest",latest);out.addProperty("unread",unread);out.addProperty("resyncRequired",after>0&&after<floor);return out;
    }
    JsonObject read(String principal,String visit,int id) throws SQLException {
        String scope=visit==null?"":" AND visit_id=?";
        Object[] args=visit==null?new Object[]{id}:new Object[]{id,visit};
        if(db.query("SELECT id FROM business_events WHERE id=?"+scope,r->r.getLong(1),args).isEmpty())throw new BusinessException("FORBIDDEN","Thông báo không thuộc quyền hiện tại.");
        db.update("INSERT OR IGNORE INTO notification_reads VALUES(?,?)",principal,id);
        JsonObject out=new JsonObject();out.addProperty("read",true);return out;
    }
}
