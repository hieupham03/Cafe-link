package com.cafelink.server;
import com.google.gson.*;
import java.sql.SQLException;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Explicit local test gateway. There is no bank integration or real charge. */
final class OrderPayments {
 private final Database db;private final QrConfig config;private final EventFeed events;
 OrderPayments(Database db,QrConfig config,EventFeed events){this.db=db;this.config=config;this.events=events;}
 boolean prepaid(String visit)throws SQLException{return db.query("SELECT payment_mode FROM visits WHERE id=?",r->r.getString(1),visit).get(0).equals("PREPAY");}
 private JsonObject row(String id)throws SQLException {
  var rows=db.query("SELECT p.*,o.visit_id FROM order_payments p JOIN orders o ON o.id=p.order_id WHERE p.id=?",r->{JsonObject d=new JsonObject();d.addProperty("paymentId",r.getString("id"));d.addProperty("orderId",r.getLong("order_id"));d.addProperty("visitId",r.getString("visit_id"));d.addProperty("amountVnd",r.getLong("amount_vnd"));d.addProperty("state",r.getString("state"));d.addProperty("expiresAt",r.getString("expires_at"));d.addProperty("provider",r.getString("provider"));return d;},id);
  if(rows.isEmpty())throw new BusinessException("NOT_FOUND","Không có giao dịch này.");return rows.get(0);
 }
 private String signature(JsonObject d){return config.signPayment(d.get("paymentId").getAsString()+"|"+d.get("orderId").getAsString()+"|"+d.get("visitId").getAsString()+"|"+d.get("amountVnd").getAsString()+"|"+d.get("expiresAt").getAsString());}
 JsonObject start(String visit,int order)throws SQLException {
  if(!prepaid(visit))throw new BusinessException("INVALID_STATE","Lượt này dùng luồng thanh toán sau.");
  var states=db.query("SELECT payment_state FROM orders WHERE id=? AND visit_id=?",r->r.getString(1),order,visit);
  if(states.isEmpty())throw new BusinessException("FORBIDDEN","Đơn không thuộc lượt này.");
  if(Set.of("PAID","CANCELLED","REFUNDED").contains(states.get(0)))throw new BusinessException("INVALID_STATE","Đơn đã trả tiền, đã hủy hoặc đã hoàn giả lập.");
  String now=config.clock.instant().toString();
  db.update("UPDATE order_payments SET state='EXPIRED',updated_at=? WHERE order_id=? AND state='PENDING' AND expires_at<?",now,order,now);
  var pending=db.query("SELECT id FROM order_payments WHERE order_id=? AND state='PENDING'",r->r.getString(1),order);
  String id=pending.isEmpty()?UUID.randomUUID().toString():pending.get(0);
  if(pending.isEmpty()){
   long amount=db.query("SELECT SUM(quantity*unit_price_vnd) FROM order_items WHERE order_id=?",r->r.getLong(1),order).get(0);
   db.update("INSERT INTO order_payments(id,order_id,amount_vnd,state,created_at,updated_at,expires_at) VALUES(?,?,?,'PENDING',?,?,?)",id,order,amount,now,now,config.clock.instant().plusSeconds(900).toString());
  }
  db.update("UPDATE orders SET payment_state='PENDING' WHERE id=?",order);
  JsonObject out=row(id);out.addProperty("token",signature(out));return out;
 }
 JsonObject simulate(String visit,JsonObject input)throws SQLException {
  JsonObject transaction=row(CafeService.text(input,"paymentId",80,true));
  if(!visit.equals(transaction.get("visitId").getAsString()))throw new BusinessException("FORBIDDEN","Giao dịch không thuộc lượt này.");
  String token=CafeService.text(input,"token",128,true);
  if(!MessageDigest.isEqual(signature(transaction).getBytes(StandardCharsets.US_ASCII),token.getBytes(StandardCharsets.US_ASCII)))throw new BusinessException("INVALID_PAYMENT_SIGNATURE","Chữ ký giao dịch không hợp lệ.");
  try{if(input.get("amountVnd").getAsBigDecimal().longValueExact()!=transaction.get("amountVnd").getAsLong())throw new ArithmeticException();}catch(RuntimeException invalid){throw new BusinessException("PAYMENT_AMOUNT_MISMATCH","Số tiền không khớp đơn hàng.");}
  String outcome=CafeService.text(input,"outcome",20,true);
  if(!Set.of("SUCCESS","FAILED","CANCELLED").contains(outcome))throw new BusinessException("INVALID_INPUT","Kết quả giả lập không hợp lệ.");
  if(!transaction.get("state").getAsString().equals("PENDING"))return transaction;
  String state=config.clock.instant().isAfter(Instant.parse(transaction.get("expiresAt").getAsString()))?"EXPIRED":outcome.equals("SUCCESS")?"PAID":outcome;
  db.update("UPDATE order_payments SET state=?,updated_at=? WHERE id=?",state,config.clock.instant().toString(),transaction.get("paymentId").getAsString());
  db.update("UPDATE orders SET payment_state=? WHERE id=?",state.equals("PAID")?"PAID":"UNPAID",transaction.get("orderId").getAsInt());
  if(state.equals("PAID"))events.append(visit,"PAYMENT_CONFIRMED",transaction.get("orderId").getAsString(),"Đơn #"+transaction.get("orderId").getAsString()+" đã thanh toán giả lập; quầy có thể pha chế");
  return row(transaction.get("paymentId").getAsString());
 }
 JsonObject cancel(String visit,int order)throws SQLException{
  if(!prepaid(visit))throw new BusinessException("INVALID_STATE","Không thể hủy theo luồng trả trước.");
  if(db.update("UPDATE orders SET payment_state='CANCELLED' WHERE id=? AND visit_id=? AND payment_state IN('UNPAID','PENDING','CANCELLED')",order,visit)!=1)throw new BusinessException("INVALID_STATE","Chỉ hủy đơn chưa thanh toán; đơn đã trả tiền cần nhân viên hỗ trợ.");
  db.update("UPDATE order_payments SET state='CANCELLED',updated_at=? WHERE order_id=? AND state='PENDING'",config.clock.instant().toString(),order);JsonObject o=new JsonObject();o.addProperty("orderId",order);o.addProperty("state","CANCELLED");return o;
 }
 JsonObject close(String visit)throws SQLException{
  if(!prepaid(visit))throw new BusinessException("INVALID_STATE","Lượt cũ cần quy trình thanh toán sau.");
  if(!db.query("SELECT id FROM orders WHERE visit_id=? AND payment_state NOT IN('CANCELLED','REFUNDED') AND (payment_state!='PAID' OR status!='SERVED')",r->r.getLong(1),visit).isEmpty())throw new BusinessException("INVALID_STATE","Cần thanh toán/phục vụ xong hoặc xử lý các đơn còn lại trước khi đóng lượt.");
  if(!db.query("SELECT id FROM tickets WHERE visit_id=? AND status='OPEN'",r->r.getLong(1),visit).isEmpty())throw new BusinessException("INVALID_STATE","Cần xử lý hỗ trợ trước khi đóng lượt.");
  db.update("UPDATE visits SET active=0,state='CLOSED',closed_at=?,version=version+1 WHERE id=?",config.clock.instant().toString(),visit);events.append(visit,"CLOSE_VISIT",visit,"Lượt khách đã kết thúc. Cảm ơn bạn!");JsonObject o=new JsonObject();o.addProperty("visitId",visit);return o;
 }
}
