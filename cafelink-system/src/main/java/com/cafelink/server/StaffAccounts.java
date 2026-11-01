package com.cafelink.server;

import com.cafelink.common.Json;
import com.cafelink.common.Models.Identity;
import com.google.gson.JsonObject;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Locale;
import java.util.Set;

/** Account administration is owner-only. Passwords and hashes never enter a result/audit. */
final class StaffAccounts {
    private final Database db;
    StaffAccounts(Database db) { this.db = db; }

    void validate(Identity who) throws SQLException {
        var versions = db.query("SELECT auth_version FROM accounts WHERE username=? AND role=? AND active=1",
            r -> r.getLong(1), who.username(), who.role());
        if (versions.size() != 1 || versions.get(0) != who.accountVersion())
            throw new BusinessException("SESSION_REVOKED", "Tài khoản đã bị khóa hoặc phiên đã bị thu hồi. Vui lòng đăng nhập lại.");
    }
    JsonObject list() throws SQLException {
        JsonObject result = new JsonObject();
        result.add("accounts", Json.GSON.toJsonTree(db.query("SELECT * FROM accounts WHERE role='STAFF' ORDER BY username", StaffAccounts::view)));
        return result;
    }
    private static JsonObject view(java.sql.ResultSet r) throws SQLException {
        JsonObject value = new JsonObject();
        value.addProperty("username", r.getString("username"));
        value.addProperty("displayName", r.getString("display_name"));
        value.addProperty("active", r.getInt("active") == 1);
        value.addProperty("version", r.getLong("auth_version"));
        value.addProperty("createdAt", r.getString("created_at"));
        value.addProperty("createdBy", r.getString("created_by"));
        return value;
    }
    private String password(JsonObject input) {
        String value = CafeService.text(input, "password", 128, true);
        if (value.length() < 10) throw new BusinessException("INVALID_INPUT", "Mật khẩu nhân viên cần ít nhất 10 ký tự.");
        return value;
    }
    JsonObject create(String actor, JsonObject input) throws SQLException {
        if (input.has("role") && !"STAFF".equals(CafeService.text(input, "role", 20, true)))
            throw new BusinessException("FORBIDDEN", "Chức năng này chỉ tạo tài khoản nhân viên.");
        String username = CafeService.text(input, "username", 40, true).toLowerCase(Locale.ROOT);
        if (!username.matches("[a-z0-9][a-z0-9._-]{2,39}"))
            throw new BusinessException("INVALID_INPUT", "Tài khoản cần 3-40 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch nối.");
        String display = CafeService.text(input, "displayName", 60, true), hash = PasswordHash.create(password(input));
        if (!db.query("SELECT username FROM accounts WHERE lower(username)=?", r -> r.getString(1), username).isEmpty())
            throw new BusinessException("ACCOUNT_EXISTS", "Tài khoản đã tồn tại. Hãy chọn tên khác.");
        if (db.query("SELECT count(*) FROM accounts WHERE role='STAFF'", r -> r.getInt(1)).get(0) >= 100)
            throw new BusinessException("INVALID_STATE", "Đã đạt giới hạn 100 tài khoản nhân viên.");
        db.update("INSERT INTO accounts(username,password_hash,role,table_id,active,auth_version,display_name,created_at,created_by) VALUES(?,?,'STAFF',NULL,1,1,?,?,?)",
            username, hash, display, Instant.now().toString(), actor);
        return account(username);
    }
    JsonObject change(JsonObject input, boolean resetPassword) throws SQLException {
        String username = CafeService.text(input, "username", 60, true);
        JsonObject current = account(username);
        if (CafeService.integer(input, "expectedVersion") != current.get("version").getAsLong())
            throw new BusinessException("VERSION_CONFLICT", "Tài khoản vừa thay đổi. Hãy tải lại danh sách.");
        if (resetPassword) db.update("UPDATE accounts SET password_hash=?,auth_version=auth_version+1 WHERE username=? AND role='STAFF'", PasswordHash.create(password(input)), username);
        else {
            int enabled = CafeService.integer(input, "enabled");
            if (enabled != 0 && enabled != 1) throw new BusinessException("INVALID_INPUT", "Trạng thái tài khoản không hợp lệ.");
            if (current.get("active").getAsBoolean() != (enabled == 1))
                db.update("UPDATE accounts SET active=?,auth_version=auth_version+1 WHERE username=? AND role='STAFF'", enabled, username);
        }
        return account(username);
    }
    private JsonObject account(String username) throws SQLException {
        var rows = db.query("SELECT * FROM accounts WHERE username=? AND role='STAFF'", StaffAccounts::view, username);
        if (rows.isEmpty()) throw new BusinessException("NOT_FOUND", "Chỉ được quản lý tài khoản nhân viên tại đây.");
        return rows.get(0);
    }
    void audit(String actor, String action, JsonObject input, JsonObject result) throws SQLException {
        if (!Set.of("CREATE_STAFF_ACCOUNT","SET_STAFF_ACTIVE","RESET_STAFF_PASSWORD","ACCEPT_ORDER","RESOLVE_ORDER","SET_ORDER_STATUS","HANDLE_TICKET","SET_MENU_AVAILABILITY").contains(action)) return;
        String entity = "", detail = "";
        for (String field : new String[]{"orderId","ticketId","menuId","username"})
            if (input.has(field)) { entity = input.get(field).getAsString(); break; }
        if (action.equals("RESOLVE_ORDER")) detail = result.get("state").getAsString();
        if (action.equals("SET_ORDER_STATUS")) detail = input.get("status").getAsString();
        if (action.equals("SET_STAFF_ACTIVE")) detail = result.get("active").getAsBoolean() ? "ACTIVE" : "LOCKED";
        if (action.equals("SET_MENU_AVAILABILITY")) detail = input.get("available").getAsBoolean() ? "AVAILABLE" : "SOLD_OUT";
        db.update("INSERT INTO staff_audit(actor,action,entity_id,detail,created_at) VALUES(?,?,?,?,?)", actor, action, entity, detail, Instant.now().toString());
    }
    JsonObject auditLog() throws SQLException {
        JsonObject result = new JsonObject();
        result.add("entries", Json.GSON.toJsonTree(db.query("SELECT * FROM staff_audit ORDER BY id DESC LIMIT 100", r -> {
            JsonObject row = new JsonObject(); row.addProperty("id", r.getLong("id"));
            for (String name : new String[]{"actor","action","detail"}) row.addProperty(name,r.getString(name));
            row.addProperty("entityId",r.getString("entity_id"));row.addProperty("createdAt",r.getString("created_at"));return row;
        })));
        return result;
    }
}
