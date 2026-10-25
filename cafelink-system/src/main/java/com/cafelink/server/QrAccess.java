package com.cafelink.server;

import com.cafelink.common.*;
import com.cafelink.common.Models.Identity;
import com.google.gson.JsonObject;
import java.sql.SQLException;
import java.time.*;
import java.util.*;

/** Only called under CafeService's lock; writes participate in its existing transaction. */
final class QrAccess {
    private record Grant(String visit, int table, String expires) { }
    private final Database db;
    private final QrConfig config;
    private final String storeId;
    private final ArrayDeque<Instant> joins = new ArrayDeque<>();
    String storeId(){return storeId;}
    QrAccess(Database db, QrConfig config) throws SQLException {
        this.db = db; this.config = config;
        storeId = db.query("SELECT value FROM store_settings WHERE name='store_id'", r -> r.getString(1)).get(0);
    }
    void createGrant(String visit) throws SQLException {
        String secret = config.secret(), expires = config.clock.instant().plus(Duration.ofHours(8)).toString();
        db.update("INSERT INTO join_grants VALUES(?,1,?,?,?)", visit, Commands.digest(secret), config.encrypt(secret, visit + ":1"), expires);
    }
    JsonObject qr(String visit) throws SQLException {
        var found = db.query("SELECT * FROM join_grants WHERE visit_id=?", r -> {
            JsonObject result = new JsonObject(); result.addProperty("visitId", visit);
            result.addProperty("generation", r.getInt("generation")); result.addProperty("expiresAt", r.getString("expires_at"));
            result.addProperty("grant", config.decrypt(r.getString("encrypted_secret"), visit + ":" + r.getInt("generation")));
            return result;
        }, visit);
        if (found.isEmpty()) throw new BusinessException("INVALID_GRANT", "Lượt này chưa có QR.");
        return found.get(0);
    }
    Identity join(String grant) throws SQLException {
        checkJoinRate();
        Grant found = lookupGrant(grant);
        if (!db.query("SELECT id FROM visits WHERE id=? AND service_mode='AUTO'",r->r.getString(1),found.visit()).isEmpty())
            throw new BusinessException("PRIVATE_VISIT", "Phiên riêng không dùng QR chia sẻ. Hãy quét QR cố định tại bàn.");
        return issue(found.visit(),found.table());
    }
    void checkJoinRate() {
        Instant now = config.clock.instant();
        while (!joins.isEmpty() && !joins.peekFirst().isAfter(now.minusSeconds(60))) joins.removeFirst();
        if (joins.size() >= 60) throw new BusinessException("RATE_LIMITED", "Có quá nhiều lượt quét QR. Vui lòng chờ một phút.");
        joins.addLast(now);
    }
    Identity issue(String visit, int table) throws SQLException {
        Instant now=config.clock.instant();
        long activeMembers = db.query("SELECT expires_at FROM guest_memberships WHERE visit_id=? AND revoked=0", r -> Instant.parse(r.getString(1)), visit).stream().filter(expiry -> now.isBefore(expiry)).count();
        if (activeMembers >= 32)
            throw new BusinessException("MEMBERSHIP_LIMIT", "Lượt bàn đã đủ thiết bị. Vui lòng liên hệ nhân viên.");
        String id = UUID.randomUUID().toString(), token = config.secret();
        String expires = config.clock.instant().plus(Duration.ofHours(8)).toString();
        db.update("INSERT INTO guest_memberships VALUES(?,?,?,?,0)", id, visit, config.clock.instant().toString(), expires);
        db.update("INSERT INTO guest_sessions VALUES(?,?,?,0)", Commands.digest(token), id, expires);
        return new Identity("guest:" + id, "GUEST", table, token, id, visit, storeId);
    }
    private Grant lookupGrant(String grant) throws SQLException {
        if (grant == null || !grant.matches("[A-Za-z0-9_-]{43}")) throw new BusinessException("INVALID_GRANT", "QR không hợp lệ hoặc đã được cấp lại.");
        var grants = db.query("SELECT g.*,v.table_id,v.active FROM join_grants g JOIN visits v ON v.id=g.visit_id WHERE g.token_hash=?", r -> {
            if (r.getInt("active") != 1) throw new BusinessException("VISIT_ENDED", "Lượt khách của QR này đã kết thúc. Vui lòng xin QR mới từ nhân viên.");
            return new Grant(r.getString("visit_id"), r.getInt("table_id"), r.getString("expires_at"));
        }, Commands.digest(grant));
        if (grants.isEmpty()) throw new BusinessException("INVALID_GRANT", "QR không hợp lệ hoặc đã được cấp lại.");
        Grant found = grants.get(0);
        if (!config.clock.instant().isBefore(Instant.parse(found.expires()))) throw new BusinessException("GRANT_EXPIRED", "QR đã hết hạn. Vui lòng nhờ nhân viên cấp lại.");
        return found;
    }
    void confirmGrant(Identity who, String grant) throws SQLException {
        Identity actual = validate(who); Grant found = lookupGrant(grant);
        if (!actual.visitId().equals(found.visit())) throw new BusinessException("SESSION_SWITCH_REQUIRED", "Bạn đang ở lượt bàn khác. Không tự chuyển quyền sang lượt mới.");
    }
    JsonObject rotateGrant(String visit) throws SQLException {
        int generation = db.query("SELECT generation FROM join_grants WHERE visit_id=?", r -> r.getInt(1), visit).get(0) + 1;
        String secret = config.secret();
        db.update("UPDATE join_grants SET generation=?,token_hash=?,encrypted_secret=?,expires_at=? WHERE visit_id=?", generation,
                Commands.digest(secret), config.encrypt(secret, visit + ":" + generation), config.clock.instant().plus(Duration.ofHours(8)).toString(), visit);
        JsonObject result = new JsonObject(); result.addProperty("visitId", visit); result.addProperty("generation", generation); return result;
    }
    JsonObject memberships(String visit) throws SQLException {
        var entries = db.query("SELECT id,created_at,expires_at,revoked FROM guest_memberships WHERE visit_id=? ORDER BY created_at DESC,id LIMIT 100", r -> {
            JsonObject entry = new JsonObject(); entry.addProperty("membershipId", r.getString("id"));
            entry.addProperty("createdAt", r.getString("created_at")); entry.addProperty("expiresAt", r.getString("expires_at"));
            entry.addProperty("status", r.getInt("revoked") != 0 ? "REVOKED" : !config.clock.instant().isBefore(Instant.parse(r.getString("expires_at"))) ? "EXPIRED" : "ACTIVE");
            return entry;
        }, visit);
        JsonObject result = new JsonObject(); result.add("memberships", Json.GSON.toJsonTree(entries)); return result;
    }
    JsonObject revoke(String visit, String id) throws SQLException {
        if (db.update("UPDATE guest_memberships SET revoked=1 WHERE id=? AND visit_id=?", id, visit) != 1)
            throw new BusinessException("NOT_FOUND", "Không có thiết bị này trong lượt bàn.");
        JsonObject result = new JsonObject(); result.addProperty("membershipId", id); result.addProperty("revoked", true); return result;
    }
    Identity rotateSession(Identity who) throws SQLException {
        Identity actual = validate(who); String token = config.secret();
        String expires = db.query("SELECT expires_at FROM guest_memberships WHERE id=?", r -> r.getString(1), actual.membershipId()).get(0);
        db.update("INSERT INTO guest_sessions VALUES(?,?,?,0)", Commands.digest(token), actual.membershipId(), expires);
        logout(who);
        return resume(token);
    }
    Identity issueSession(String membership) throws SQLException {
        String expires=db.query("SELECT expires_at FROM guest_memberships WHERE id=? AND revoked=0",r->r.getString(1),membership).stream().findFirst().orElseThrow(()->new BusinessException("SESSION_REVOKED","Phiên tiếp theo đã bị thu hồi."));
        String token=config.secret();
        db.update("INSERT INTO guest_sessions VALUES(?,?,?,0)",Commands.digest(token),membership,expires);
        return resume(token);
    }
    void logout(Identity who) throws SQLException { validate(who); db.update("UPDATE guest_sessions SET revoked=1 WHERE token_hash=?", Commands.digest(who.credential())); }
    Identity resume(String token) throws SQLException {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) throw new BusinessException("INVALID_CREDENTIAL", "Phiên khách không hợp lệ.");
        var found = db.query("SELECT m.*,s.revoked token_revoked,s.expires_at token_expires,v.table_id FROM guest_sessions s JOIN guest_memberships m ON m.id=s.membership_id JOIN visits v ON v.id=m.visit_id WHERE s.token_hash=?", r -> {
            if (r.getInt("revoked") != 0 || r.getInt("token_revoked") != 0) throw new BusinessException("SESSION_REVOKED", "Quyền truy cập của thiết bị đã bị thu hồi.");
            Instant now = config.clock.instant();
            if (!now.isBefore(Instant.parse(r.getString("expires_at"))) || !now.isBefore(Instant.parse(r.getString("token_expires"))))
                throw new BusinessException("SESSION_EXPIRED", "Phiên khách đã hết hạn. Vui lòng liên hệ nhân viên.");
            String id = r.getString("id");
            return new Identity("guest:" + id, "GUEST", r.getInt("table_id"), token, id, r.getString("visit_id"), storeId);
        }, Commands.digest(token));
        if (found.isEmpty()) throw new BusinessException("INVALID_CREDENTIAL", "Không tìm thấy quyền truy cập của phiên khách.");
        return found.get(0);
    }
    Identity validate(Identity who) throws SQLException {
        Identity actual = resume(who.credential());
        if (!actual.username().equals(who.username())) throw new BusinessException("INVALID_CREDENTIAL", "Danh tính không khớp quyền của thiết bị.");
        return actual;
    }
}
