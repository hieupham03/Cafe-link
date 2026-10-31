package com.cafelink.server;

import com.cafelink.common.Json;
import com.cafelink.common.Models.TaxSettings;
import com.google.gson.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.SQLException;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** Internal cash book and immutable order tax snapshots, serialized by CafeService. */
final class Finance {
    private static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private final Database db;
    Finance(Database db) { this.db = db; }

    TaxSettings settings() throws SQLException {
        return db.query("SELECT value FROM store_settings WHERE name='tax_config'",
                r -> Json.GSON.fromJson(r.getString(1), TaxSettings.class)).get(0);
    }

    JsonObject saveSettings(JsonObject input) throws SQLException {
        TaxSettings previous = settings();
        if (CafeService.integer(input, "expectedVersion") != previous.version())
            throw error("VERSION_CONFLICT", "Cấu hình thuế vừa thay đổi. Tải lại trước khi lưu.");
        int rate = CafeService.integer(input, "rateBps");
        if (rate < 0 || rate > 10000) throw error("INVALID_INPUT", "Thuế suất phải từ 0 đến 100%.");
        TaxSettings next = new TaxSettings(bool(input, "enabled"), rate,
                CafeService.text(input, "name", 40, true), bool(input, "inclusive"), previous.version() + 1);
        db.update("UPDATE store_settings SET value=? WHERE name='tax_config'", Json.GSON.toJson(next));
        return Json.object(next);
    }

    private static boolean bool(JsonObject input, String key) {
        var value = input.get(key);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isBoolean())
            throw error("INVALID_INPUT", "Tùy chọn " + key + " không hợp lệ.");
        return value.getAsBoolean();
    }

    void priceOrder(long id, long listed, JsonObject input) throws SQLException {
        TaxSettings tax = settings();
        if ((input.has("expectedTaxVersion") && CafeService.integer(input, "expectedTaxVersion") != tax.version())
                || (!input.has("expectedTaxVersion") && tax.enabled()))
            throw error("TAX_CHANGED", "Cấu hình thuế đã thay đổi. Xem lại tổng tiền trong giỏ rồi gửi lại.");
        int rate = tax.enabled() ? tax.rateBps() : 0;
        long amount = BigDecimal.valueOf(listed).multiply(BigDecimal.valueOf(rate))
                .divide(BigDecimal.valueOf(tax.inclusive() ? 10000L + rate : 10000L), 0, RoundingMode.HALF_UP).longValueExact();
        long base = tax.inclusive() ? listed - amount : listed;
        db.update("UPDATE orders SET tax_rate_bps=?,tax_name=?,tax_inclusive=?,subtotal_vnd=?,tax_vnd=?,total_vnd=? WHERE id=?",
                rate, tax.name(), tax.inclusive() ? 1 : 0, base, amount, base + amount, id);
    }

    JsonObject createEntry(String actor, JsonObject input) throws SQLException {
        String kind = CafeService.text(input, "kind", 10, true);
        if (!Set.of("INCOME", "EXPENSE").contains(kind)) throw error("INVALID_INPUT", "Chọn khoản thu hoặc chi.");
        long amount;
        try { amount = input.get("amountVnd").getAsBigDecimal().longValueExact(); }
        catch (RuntimeException ex) { throw error("INVALID_INPUT", "Số tiền phải là số nguyên VND."); }
        if (amount < 1 || amount > 1_000_000_000L) throw error("INVALID_INPUT", "Số tiền từ 1 đến 1.000.000.000 đồng.");
        String day = date(input, "entryDate").toString();
        long id = db.insert("INSERT INTO cash_entries(kind,amount_vnd,category,note,entry_date,actor,created_at) VALUES(?,?,?,?,?,?,?)",
                kind, amount, CafeService.text(input, "category", 80, true), CafeService.text(input, "note", 500, false), day, actor, Instant.now().toString());
        JsonObject out = new JsonObject(); out.addProperty("entryId", id); return out;
    }

    JsonObject voidEntry(String actor, JsonObject input) throws SQLException {
        int id = CafeService.integer(input, "entryId");
        String reason = CafeService.text(input, "reason", 500, true);
        if (db.update("UPDATE cash_entries SET void_reason=?,voided_at=?,voided_by=? WHERE id=? AND voided_at IS NULL",
                reason, Instant.now().toString(), actor, id) != 1)
            throw error("INVALID_STATE", "Khoản thu chi không tồn tại hoặc đã hủy.");
        JsonObject out = new JsonObject(); out.addProperty("entryId", id); return out;
    }

    private record Range(LocalDate from, LocalDate to) { }
    private static Range range(JsonObject input) {
        LocalDate from = date(input, "fromDate"), to = date(input, "toDate");
        if (to.isBefore(from) || ChronoUnit.DAYS.between(from, to) > 365)
            throw error("INVALID_INPUT", "Chọn khoảng ngày hợp lệ, tối đa 366 ngày.");
        return new Range(from, to);
    }
    private static LocalDate date(JsonObject input, String key) {
        String value = CafeService.text(input, key, 10, true);
        try {
            LocalDate day = LocalDate.parse(value);
            if (!day.toString().equals(value)) throw new DateTimeException("format");
            return day;
        } catch (DateTimeException ex) { throw error("INVALID_INPUT", "Ngày cần dạng yyyy-MM-dd."); }
    }

    private static final class Totals {
        long salesVnd, otherIncomeVnd, expensesVnd, refundsVnd, taxVnd, refundedTaxVnd;
        JsonObject json() {
            JsonObject out = Json.object(this);
            out.addProperty("incomeVnd", salesVnd + otherIncomeVnd);
            out.addProperty("outflowVnd", expensesVnd + refundsVnd);
            out.addProperty("netVnd", salesVnd + otherIncomeVnd - expensesVnd - refundsVnd);
            out.addProperty("netTaxVnd", taxVnd - refundedTaxVnd);
            return out;
        }
        void add(String kind, long amount, long tax) {
            switch (kind) {
                case "SALE" -> { salesVnd += amount; taxVnd += tax; }
                case "REFUND" -> { refundsVnd += amount; refundedTaxVnd += tax; }
                case "INCOME" -> otherIncomeVnd += amount;
                case "EXPENSE" -> expensesVnd += amount;
                default -> throw new IllegalArgumentException(kind);
            }
        }
    }

    JsonObject report(JsonObject input) throws SQLException {
        Range range = range(input);
        // Convert instants in SQLite before comparing, including timestamps without fractional seconds.
        String paidDay = "date(p.updated_at,'+7 hours')";
        String source = "SELECT " + paidDay + " day,'SALE' kind,p.amount_vnd amount,o.tax_vnd tax FROM order_payments p JOIN orders o ON o.id=p.order_id WHERE p.state='PAID'"
                + " UNION ALL SELECT date(p.paid_at,'+7 hours'),'SALE',p.total_vnd,COALESCE((SELECT SUM(tax_vnd) FROM orders WHERE visit_id=p.visit_id),0) FROM payments p"
                + " UNION ALL SELECT date(r.created_at,'+7 hours'),'REFUND',r.amount_vnd,o.tax_vnd FROM order_resolutions r JOIN orders o ON o.id=r.order_id WHERE r.state='REFUNDED'"
                + " UNION ALL SELECT entry_date,kind,amount_vnd,0 FROM cash_entries WHERE voided_at IS NULL";
        Totals totals = new Totals();
        Map<String, Totals> days = new TreeMap<>();
        for (LocalDate day = range.from(); !day.isAfter(range.to()); day = day.plusDays(1)) days.put(day.toString(), new Totals());
        db.query("SELECT day,kind,SUM(amount) amount,SUM(tax) tax FROM (" + source + ") WHERE day>=? AND day<=? GROUP BY day,kind",
                r -> { String kind = r.getString("kind"); long amount = r.getLong("amount"), tax = r.getLong("tax");
                    totals.add(kind, amount, tax); days.get(r.getString("day")).add(kind, amount, tax); return true; },
                range.from().toString(), range.to().toString());
        JsonArray daily = new JsonArray();
        days.forEach((day, value) -> { JsonObject row = value.json(); row.addProperty("date", day); daily.add(row); });
        JsonObject out = new JsonObject(); out.add("totals", totals.json()); out.add("days", daily);
        out.addProperty("fromDate", range.from().toString()); out.addProperty("toDate", range.to().toString());
        out.addProperty("timezone", ZONE.getId()); return out;
    }

    JsonObject entries(JsonObject input) throws SQLException {
        Range range = range(input);
        int before = input.has("beforeId") ? CafeService.integer(input, "beforeId") : Integer.MAX_VALUE;
        if (before < 1) throw error("INVALID_INPUT", "Mốc phân trang không hợp lệ.");
        var rows = db.query("SELECT * FROM cash_entries WHERE entry_date>=? AND entry_date<=? AND id<? ORDER BY id DESC LIMIT 51", r -> {
            JsonObject row = new JsonObject(); row.addProperty("id", r.getLong("id")); row.addProperty("kind", r.getString("kind"));
            row.addProperty("amountVnd", r.getLong("amount_vnd")); row.addProperty("category", r.getString("category"));
            row.addProperty("note", r.getString("note")); row.addProperty("entryDate", r.getString("entry_date"));
            row.addProperty("actor", r.getString("actor")); row.addProperty("voidedAt", r.getString("voided_at"));
            row.addProperty("voidReason", r.getString("void_reason")); row.addProperty("voidedBy", r.getString("voided_by")); return row;
        }, range.from().toString(), range.to().toString(), before);
        JsonObject out = new JsonObject(); out.addProperty("hasMore", rows.size() > 50);
        out.add("entries", Json.GSON.toJsonTree(rows.subList(0, Math.min(rows.size(), 50)))); return out;
    }

    private static BusinessException error(String code, String message) { return new BusinessException(code, message); }
}
