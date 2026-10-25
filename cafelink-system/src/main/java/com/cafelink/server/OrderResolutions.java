package com.cafelink.server;

import com.google.gson.JsonObject;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;

/** Audited staff compensation. Original successful payment records remain immutable. */
final class OrderResolutions {
    private final Database db;
    private final EventFeed events;
    OrderResolutions(Database db, EventFeed events) { this.db=db;this.events=events; }
    List<JsonObject> list(String where, Object... args) throws SQLException {
        return db.query("SELECT r.* FROM order_resolutions r JOIN orders o ON o.id=r.order_id JOIN visits v ON v.id=o.visit_id WHERE "+where,r->{
            var result=new JsonObject();result.addProperty("orderId",r.getLong("order_id"));result.addProperty("state",r.getString("state"));
            result.addProperty("amountVnd",r.getLong("amount_vnd"));result.addProperty("reason",r.getString("reason"));
            result.addProperty("actor",r.getString("actor"));result.addProperty("createdAt",r.getString("created_at"));result.addProperty("provider","LOCAL_SIMULATOR");return result;
        },args);
    }
    JsonObject resolve(String actor, JsonObject input) throws SQLException {
        int order=CafeService.integer(input,"orderId");
        String kind=CafeService.text(input,"resolution",30,true),reason=CafeService.text(input,"reason",500,true);
        if(!List.of("CANCEL_UNPAID","REFUND").contains(kind))throw new BusinessException("INVALID_INPUT","Cách xử lý đơn không hợp lệ.");
        String terminal=kind.equals("REFUND")?"REFUNDED":"CANCELLED";
        var existing=list("r.order_id=?",order);
        if(!existing.isEmpty()) {
            if(!terminal.equals(existing.get(0).get("state").getAsString()))throw new BusinessException("INVALID_STATE","Đơn đã được xử lý theo cách khác.");
            return existing.get(0);
        }
        record Order(String visit,String status,String payment,String mode) { }
        var found=db.query("SELECT o.*,v.payment_mode FROM orders o JOIN visits v ON v.id=o.visit_id WHERE o.id=?",r->new Order(r.getString("visit_id"),r.getString("status"),r.getString("payment_state"),r.getString("payment_mode")),order);
        if(found.isEmpty())throw new BusinessException("NOT_FOUND","Không có đơn này.");
        Order state=found.get(0);
        if(!state.mode().equals("PREPAY")||!state.status().equals("SUBMITTED"))throw new BusinessException("INVALID_STATE","Chỉ xử lý đơn trả trước chưa bắt đầu pha chế. Đơn đang làm cần hỗ trợ trực tiếp.");
        String payment=null;long amount=0;
        if(kind.equals("REFUND")) {
            if(!state.payment().equals("PAID"))throw new BusinessException("INVALID_STATE","Chỉ hoàn đơn đã xác nhận thanh toán.");
            var paid=db.query("SELECT id,amount_vnd FROM order_payments WHERE order_id=? AND state='PAID'",r->new Object[]{r.getString(1),r.getLong(2)},order);
            if(paid.size()!=1)throw new BusinessException("INVALID_STATE","Không đối chiếu được giao dịch gốc.");
            payment=(String)paid.get(0)[0];amount=(Long)paid.get(0)[1];
        } else {
            if(!List.of("UNPAID","PENDING").contains(state.payment()))throw new BusinessException("INVALID_STATE","Chỉ hủy đơn chưa thanh toán.");
            db.update("UPDATE order_payments SET state='CANCELLED',updated_at=? WHERE order_id=? AND state='PENDING'",Instant.now().toString(),order);
        }
        db.update("INSERT INTO order_resolutions VALUES(?,?,?,?,?,?,?)",order,terminal,payment,amount,reason,actor,Instant.now().toString());
        db.update("UPDATE orders SET payment_state=? WHERE id=?",terminal,order);
        events.append(state.visit(),"ORDER_RESOLVED",String.valueOf(order),"Đơn #"+order+(kind.equals("REFUND")?" đã hoàn giả lập: ":" đã hủy chưa thanh toán: ")+reason);
        return list("r.order_id=?",order).get(0);
    }
}
