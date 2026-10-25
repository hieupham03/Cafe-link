package com.cafelink.server;
import com.google.gson.JsonObject;
import java.sql.SQLException;
import java.time.Instant;
final class SupportActions {
 private final Database db;private final EventFeed events;
 SupportActions(Database db,EventFeed events){this.db=db;this.events=events;}
 JsonObject change(String visit,String actor,JsonObject input,boolean cancel)throws SQLException{
  int id=CafeService.integer(input,"ticketId"),version=CafeService.integer(input,"expectedVersion");
  var found=db.query("SELECT visit_id,status,note,version FROM tickets WHERE id=?",r->new String[]{r.getString(1),r.getString(2),r.getString(3),r.getString(4)},id);
  if(found.isEmpty())throw new BusinessException("NOT_FOUND","Không có yêu cầu này.");var row=found.get(0);
  if(!visit.equals(row[0]))throw new BusinessException("FORBIDDEN","Yêu cầu không thuộc phiên của bạn.");
  if(!row[1].equals("OPEN"))throw new BusinessException("INVALID_STATE","Yêu cầu đã kết thúc. Hãy xem phản hồi hoặc tạo nhu cầu mới.");
  if(version!=Integer.parseInt(row[3]))throw new BusinessException("VERSION_CONFLICT","Yêu cầu đã thay đổi. Hãy xem nội dung mới nhất.");
  String note=cancel?"":CafeService.text(input,"note",160,true),combined=cancel?row[2]:(row[2].isEmpty()?note:row[2]+"\nBổ sung: "+note);
  if(combined.length()>500)throw new BusinessException("INVALID_INPUT","Nội dung yêu cầu đã dài; hãy trao đổi trực tiếp với nhân viên.");
  db.update("UPDATE tickets SET status=?,note=?,version=version+1 WHERE id=?",cancel?"CANCELLED":"OPEN",combined,id);
  db.update("INSERT INTO ticket_changes VALUES(?,?,?,?,?,?)",id,version+1,cancel?"CANCELLED":"AMENDED",note,actor,Instant.now().toString());
  events.append(visit,cancel?"CANCEL_SERVICE":"AMEND_SERVICE",String.valueOf(id),"Yêu cầu #"+id+(cancel?" đã được khách rút":" có nội dung bổ sung: "+note));
  var result=new JsonObject();result.addProperty("ticketId",id);result.addProperty("version",version+1);result.addProperty("state",cancel?"CANCELLED":"OPEN");return result;
 }
}
