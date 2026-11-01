package com.cafelink.server;

import com.cafelink.common.Models.TaxSettings;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.sql.SQLException;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** Store-managed tax quotes and a cash-movement report, not a statutory accounting system. */
final class StoreFinance {
    static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    record Quote(long subtotalVnd,long taxVnd,long totalVnd,TaxSettings settings) { }
    private final Database db;
    private final Clock clock;
    StoreFinance(Database db,Clock clock){this.db=db;this.clock=clock;}

    TaxSettings settings() throws SQLException {
        Map<String,String> values=new HashMap<>();
        db.query("SELECT name,value FROM store_settings WHERE name LIKE 'tax_%'",r->{values.put(r.getString(1),r.getString(2));return 0;});
        return new TaxSettings(values.get("tax_name"),Integer.parseInt(values.get("tax_rate_bps")),values.get("tax_mode"),Long.parseLong(values.get("tax_version")));
    }
    JsonObject saveSettings(JsonObject input) throws SQLException {
        TaxSettings old=settings();
        if(CafeService.integer(input,"expectedVersion")!=old.version())throw error("VERSION_CONFLICT","Cấu hình thuế đã đổi. Hãy tải lại trước khi lưu.");
        int rate=CafeService.integer(input,"rateBps");
        String name=CafeService.text(input,"name",40,true),mode=CafeService.text(input,"mode",20,true);
        if(rate<0||rate>10000||!Set.of("EXCLUSIVE","INCLUSIVE").contains(mode))throw error("INVALID_INPUT","Tỷ lệ thuế phải từ 0 đến 100%, cách tính trong hoặc ngoài giá.");
        for(var entry:Map.of("tax_name",name,"tax_rate_bps",String.valueOf(rate),"tax_mode",mode,"tax_version",String.valueOf(old.version()+1)).entrySet())
            db.update("UPDATE store_settings SET value=? WHERE name=?",entry.getValue(),entry.getKey());
        return com.cafelink.common.Json.object(settings());
    }
    static Quote calculate(long menuTotal,TaxSettings settings){
        if(menuTotal<0||menuTotal>10_000_000_000L||settings.rateBps()<0||settings.rateBps()>10000)throw error("INVALID_INPUT","Giá trị tính thuế không hợp lệ.");
        boolean included=settings.mode().equals("INCLUSIVE");
        long denominator=included?10000L+settings.rateBps():10000L;
        long tax=(Math.multiplyExact(menuTotal,settings.rateBps())+denominator/2)/denominator;
        return new Quote(included?menuTotal-tax:menuTotal,tax,included?menuTotal:Math.addExact(menuTotal,tax),settings);
    }
    Quote quote(long menuTotal,JsonObject input) throws SQLException {
        TaxSettings settings=settings();
        if((settings.rateBps()>0&&!input.has("expectedTaxVersion"))||(input.has("expectedTaxVersion")&&CafeService.integer(input,"expectedTaxVersion")!=settings.version()))
            throw error("TAX_CHANGED","Thuế của quán đã thay đổi. Hãy xem lại tổng thanh toán trước khi gửi đơn.");
        return calculate(menuTotal,settings);
    }
    JsonObject createExpense(String actor,JsonObject input) throws SQLException {
        int amount=CafeService.integer(input,"amountVnd");
        if(amount<1||amount>1_000_000_000)throw error("INVALID_INPUT","Số tiền chi phải từ 1 đến 1.000.000.000 đồng.");
        String category=CafeService.text(input,"category",60,true),note=CafeService.text(input,"note",500,true);
        LocalDate spent=parseDate(CafeService.text(input,"spentOn",10,true));
        if(spent.isAfter(LocalDate.now(clock.withZone(ZONE))))throw error("INVALID_INPUT","Ngày chi không được nằm trong tương lai.");
        long id=db.insert("INSERT INTO expenses(amount_vnd,category,note,spent_on,created_by,created_at) VALUES(?,?,?,?,?,?)",amount,category,note,spent.toString(),actor,clock.instant().toString());
        JsonObject result=new JsonObject();result.addProperty("expenseId",id);return result;
    }
    JsonObject voidExpense(JsonObject input) throws SQLException {
        int id=CafeService.integer(input,"expenseId");String reason=CafeService.text(input,"reason",500,true);
        var rows=db.query("SELECT voided_at FROM expenses WHERE id=?",r->Optional.ofNullable(r.getString(1)),id);
        if(rows.isEmpty())throw error("NOT_FOUND","Không tìm thấy phiếu chi.");
        if(rows.get(0).isEmpty())db.update("UPDATE expenses SET voided_at=?,void_reason=? WHERE id=?",clock.instant().toString(),reason,id);
        JsonObject result=new JsonObject();result.addProperty("expenseId",id);result.addProperty("state","VOIDED");return result;
    }
    JsonObject report(JsonObject input) throws SQLException {
        LocalDate today=LocalDate.now(clock.withZone(ZONE));
        String fromValue=CafeService.text(input,"fromDate",10,false),toValue=CafeService.text(input,"toDate",10,false);
        LocalDate from=fromValue.isEmpty()?today.withDayOfMonth(1):parseDate(fromValue),to=toValue.isEmpty()?today:parseDate(toValue);
        if(to.isBefore(from)||ChronoUnit.DAYS.between(from,to)>365)throw error("INVALID_INPUT","Khoảng báo cáo phải đúng thứ tự và không quá 366 ngày.");
        int offset=input.has("offset")?CafeService.integer(input,"offset"):0;
        if(offset<0||offset>1_000_000)throw error("INVALID_INPUT","Trang báo cáo không hợp lệ.");
        String start=from.atStartOfDay(ZONE).toInstant().toString(),end=to.plusDays(1).atStartOfDay(ZONE).toInstant().toString();
        // Keep original paid amounts in inflow; refunds are separate dated outflows.
        String ledger="(SELECT 'INCOME' kind,p.updated_at at,p.amount_vnd amount,o.tax_vnd tax FROM order_payments p JOIN orders o ON o.id=p.order_id WHERE p.state='PAID' UNION ALL SELECT 'INCOME',p.paid_at,p.total_vnd,COALESCE((SELECT SUM(o.tax_vnd) FROM orders o WHERE o.visit_id=p.visit_id),0) FROM payments p UNION ALL SELECT 'REFUND',r.created_at,r.amount_vnd,o.tax_vnd FROM order_resolutions r JOIN orders o ON o.id=r.order_id WHERE r.state='REFUNDED')";
        Map<String,long[]> days=new LinkedHashMap<>();
        for(LocalDate day=from;!day.isAfter(to);day=day.plusDays(1))days.put(day.toString(),new long[6]);
        db.query("SELECT strftime('%Y-%m-%d',at,'+7 hours') day,kind,SUM(amount) amount,SUM(tax) tax,COUNT(*) count FROM "+ledger+" WHERE julianday(at)>=julianday(?) AND julianday(at)<julianday(?) GROUP BY day,kind",r->{
            long[] values=days.get(r.getString("day"));if(values!=null){boolean income=r.getString("kind").equals("INCOME");values[income?0:1]+=r.getLong("amount");values[4]+=income?r.getLong("tax"):-r.getLong("tax");if(income)values[5]+=r.getLong("count");}return 0;
        },start,end);
        db.query("SELECT spent_on,SUM(amount_vnd) amount FROM expenses WHERE spent_on>=? AND spent_on<=? AND voided_at IS NULL GROUP BY spent_on",r->{days.get(r.getString(1))[2]=r.getLong(2);return 0;},from.toString(),to.toString());
        long gross=0,refunds=0,expenses=0,tax=0,count=0;JsonArray daily=new JsonArray();
        for(var entry:days.entrySet()){
            long[] v=entry.getValue();gross+=v[0];refunds+=v[1];expenses+=v[2];tax+=v[4];count+=v[5];
            JsonObject row=new JsonObject();row.addProperty("date",entry.getKey());row.addProperty("grossVnd",v[0]);row.addProperty("refundVnd",v[1]);row.addProperty("expenseVnd",v[2]);row.addProperty("netVnd",v[0]-v[1]);row.addProperty("balanceVnd",v[0]-v[1]-v[2]);daily.add(row);
        }
        var expenseRows=db.query("SELECT * FROM expenses WHERE spent_on>=? AND spent_on<=? ORDER BY spent_on DESC,id DESC LIMIT 51 OFFSET ?",r->{JsonObject e=new JsonObject();e.addProperty("id",r.getLong("id"));e.addProperty("amountVnd",r.getLong("amount_vnd"));for(String f:List.of("category","note"))e.addProperty(f,r.getString(f));e.addProperty("spentOn",r.getString("spent_on"));e.addProperty("createdBy",r.getString("created_by"));e.addProperty("createdAt",r.getString("created_at"));e.addProperty("voidedAt",r.getString("voided_at"));e.addProperty("voidReason",r.getString("void_reason"));return e;},from.toString(),to.toString(),offset);
        JsonObject out=new JsonObject();out.addProperty("fromDate",from.toString());out.addProperty("toDate",to.toString());out.addProperty("grossVnd",gross);out.addProperty("refundVnd",refunds);out.addProperty("netVnd",gross-refunds);out.addProperty("expenseVnd",expenses);out.addProperty("balanceVnd",gross-refunds-expenses);out.addProperty("netTaxVnd",tax);out.addProperty("paymentsCount",count);out.addProperty("hasMore",expenseRows.size()>50);out.add("expenses",com.cafelink.common.Json.GSON.toJsonTree(expenseRows.subList(0,Math.min(50,expenseRows.size()))));out.add("daily",daily);return out;
    }
    private static LocalDate parseDate(String value){try{return LocalDate.parse(value);}catch(DateTimeException e){throw error("INVALID_INPUT","Ngày cần theo định dạng yyyy-MM-dd.");}}
    private static BusinessException error(String code,String message){return new BusinessException(code,message);}
}
