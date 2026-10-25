package com.cafelink.server;

import com.cafelink.common.Models.*;
import com.cafelink.common.Json;
import com.cafelink.common.Commands;
import com.google.gson.*;
import java.nio.file.Path;
import java.sql.SQLException;
import java.time.Instant;
import java.util.*;

/** Database and business state are serialized here; socket I/O never holds this lock. */
public final class CafeService implements AutoCloseable {
    private final Database db;
    private final QrAccess qr;
    private final CheckoutFlow checkout;
    private final EventFeed events;
    private final MenuCatalog catalog;
    private final boolean prepay;
    private final OrderPayments orderPayments;
    private final TableOrdering tableOrdering;
    private final OrderResolutions resolutions;
    public CafeService(Path path) throws Exception { this(path, null); }
    public CafeService(Path path, QrConfig config) throws Exception {
        this(path,config,false);
    }
    public CafeService(Path path,QrConfig config,boolean prepay) throws Exception {
        this.prepay=prepay;
        db = new Database(path, config != null); qr = config == null ? null : new QrAccess(db, config);checkout=config==null?null:new CheckoutFlow(db);events=config==null?null:new EventFeed(db);catalog=config==null?null:new MenuCatalog(db);
        orderPayments=config==null?null:new OrderPayments(db,config,events);
        tableOrdering=config==null?null:new TableOrdering(db,qr,config,events);
        resolutions=config==null?null:new OrderResolutions(db,events);
    }
    public synchronized Identity joinTable(String grant) throws SQLException {
        qrRequired();return db.transaction(()->tableOrdering.join(grant));
    }
    public synchronized Identity continueVisit(Identity who) throws SQLException {
        qrRequired();requireGuest(who);
        return db.transaction(()->tableOrdering.continueVisit(who));
    }
    /** Explicit demo bootstrap, called before opening public listeners. Never log the value. */
    public synchronized void configureDemoAdmin(String password) throws SQLException {
        if(password==null||password.length()<12||password.length()>128)throw new IllegalArgumentException("Demo admin password must contain 12-128 characters");
        db.update("UPDATE accounts SET password_hash=? WHERE username='admin'",PasswordHash.create(password));
    }
    public synchronized void confirmTableGrant(Identity who,String grant) throws SQLException { qrRequired();tableOrdering.confirm(who,grant); }
    public synchronized Identity joinVisit(String grant) throws SQLException {
        if (qr == null) throw problem("QR_DISABLED", "Server E0 không hỗ trợ QR.");
        return db.transaction(() -> qr.join(grant));
    }
    public synchronized Identity resume(String token) throws SQLException {
        if (qr == null) throw problem("QR_DISABLED", "Server E0 không hỗ trợ QR.");
        return qr.resume(token);
    }
    public synchronized Identity rotateSession(Identity who) throws SQLException {
        return db.transaction(() -> qrRequired().rotateSession(who));
    }
    public synchronized void confirmJoinGrant(Identity who, String grant) throws SQLException { qrRequired().confirmGrant(who, grant); }
    public synchronized void checkIdentity(Identity who) throws SQLException {
        if (who == null) throw problem("UNAUTHENTICATED", "Vui lòng đăng nhập.");
        if (!admin(who)) guestVisit(who);
    }
    public synchronized void logoutGuest(Identity who) throws SQLException {
        qrRequired();String visit=guestVisit(who);
        if(!db.query("SELECT id FROM visits WHERE id=? AND service_mode='AUTO'",r->r.getString(1),visit).isEmpty()
            && (!db.query("SELECT id FROM orders WHERE visit_id=? AND payment_state NOT IN('CANCELLED','REFUNDED') AND (payment_state!='PAID' OR status!='SERVED')",r->r.getLong(1),visit).isEmpty()
                || !db.query("SELECT id FROM tickets WHERE visit_id=? AND status='OPEN'",r->r.getLong(1),visit).isEmpty()))
            throw problem("VISIT_HAS_WORK","Bạn còn đơn hoặc yêu cầu đang xử lý. Hãy giữ phiên để theo dõi; liên hệ nhân viên nếu cần hủy hoặc hỗ trợ.");
        qr.logout(who);
    }
    public synchronized boolean onlineInCurrentVisit(Identity who) throws SQLException {
        if (qr == null || admin(who)) return true;
        try {
            String visit = guestVisit(who);
            return !db.query("SELECT id FROM visits WHERE id=? AND active=1", r -> r.getString(1), visit).isEmpty();
        } catch (BusinessException denied) { return false; }
    }
    public synchronized Identity authenticate(String username, String password) throws SQLException {
        return authenticate(username, password, "");
    }
    public synchronized Identity authenticate(String username, String password, String credential) throws SQLException {
        if (username == null || password == null || username.length() > 60 || password.length() > 128)
            throw problem("AUTH_FAILED", "Sai tài khoản hoặc mật khẩu.");
        record Account(String hash, Identity identity) { }
        List<Account> found = db.query("SELECT * FROM accounts WHERE username=?", r -> new Account(r.getString("password_hash"),
                new Identity(username, r.getString("role"), r.getObject("table_id") == null ? null : r.getInt("table_id"), null)), username);
        if (found.isEmpty() || !PasswordHash.verify(password, found.get(0).hash())) throw problem("AUTH_FAILED", "Sai tài khoản hoặc mật khẩu.");
        Identity account = found.get(0).identity();
        if (admin(account)) return qr==null?account:new Identity(account.username(),account.role(),null,null,null,null,qr.storeId());
        if (qr != null) throw problem("QR_REQUIRED", "Khách cần quét QR của lượt bàn; mật khẩu bàn không cấp quyền trên V2.");
        String token = credential;
        if (token == null || token.isEmpty()) {
            token = UUID.randomUUID().toString() + UUID.randomUUID();
            List<String> visits = db.query("SELECT id FROM visits WHERE table_id=? AND active=1", r -> r.getString(1), account.tableId());
            db.update("INSERT INTO guest_credentials VALUES(?,?,?,?)", Commands.digest(token), username, visits.isEmpty() ? null : visits.get(0), Instant.now().toString());
        } else if (token.length() > 160 || db.query("SELECT token_hash FROM guest_credentials WHERE token_hash=? AND username=?", r -> r.getString(1), Commands.digest(token), username).isEmpty()) {
            throw problem("INVALID_CREDENTIAL", "Không thể phục hồi quyền của lượt khách. Không tự chuyển sang lượt mới.");
        }
        return new Identity(username, account.role(), account.tableId(), token);
    }
    public synchronized Snapshot snapshot(Identity who, Map<Integer, Integer> online) throws SQLException {
        if (who == null) throw problem("UNAUTHENTICATED", "Vui lòng đăng nhập.");
        String allowed = admin(who) ? null : guestVisit(who);
        List<MenuItem> menu = catalog!=null?catalog.list(admin(who)):db.query("SELECT * FROM menu ORDER BY id", r -> new MenuItem(r.getInt("id"), r.getString("name"), r.getLong("price_vnd"), r.getString("category")));
        String filter = admin(who) ? "" : " WHERE t.id=?";
        Object[] tableArgs = admin(who) ? new Object[0] : new Object[]{allowed, who.tableId()};
        List<TableView> tables = db.query("SELECT t.id,t.name,CASE WHEN v.active=1 THEN v.id ELSE NULL END visit_id"+(qr==null?"":",v.state,v.version,v.payment_mode,a.table_id auto_table,a.enabled,(SELECT count(*) FROM visits av WHERE av.table_id=t.id AND av.active=1) session_count")+" FROM cafe_tables t LEFT JOIN visits v ON v.table_id=t.id AND " + (qr!=null&&!admin(who)?"(v.active=1 OR v.service_mode='AUTO')":"v.active=1") + (admin(who) ? (qr==null?"":" AND v.service_mode='MANUAL'") : " AND v.id=?") + (qr==null?"":" LEFT JOIN table_access a ON a.table_id=t.id") + filter + " ORDER BY t.id",
                r -> new TableView(r.getInt("id"), r.getString("name"), r.getString("visit_id"), r.getString("visit_id") == null ? (allowed == null ? (qr!=null&&r.getObject("auto_table")!=null?(r.getInt("enabled")==1?"ACCEPTING":"PAUSED"):"AVAILABLE") : "SESSION_ENDED") : "OCCUPIED", online.getOrDefault(r.getInt("id"), 0),qr==null?null:r.getString("state"),qr==null?0:r.getLong("version"),qr==null?"POSTPAY":r.getString("payment_mode"),qr!=null&&r.getObject("auto_table")!=null,qr!=null&&r.getInt("enabled")==1,qr==null?(r.getString("visit_id")==null?0:1):r.getInt("session_count")), tableArgs);
        String scope = admin(who) ? "v.active=1" : (qr==null?"v.active=1":"(v.active=1 OR v.service_mode='AUTO')")+" AND v.table_id=? AND v.id=?";
        Object[] args = admin(who) ? new Object[0] : new Object[]{who.tableId(), allowed};
        List<OrderView> orders = loadOrders(" WHERE " + scope, args);
        List<Ticket> tickets = db.query("SELECT k.*,v.table_id FROM tickets k JOIN visits v ON v.id=k.visit_id WHERE " + scope + " ORDER BY k.id DESC",
                r -> new Ticket(r.getLong("id"), r.getInt("table_id"), r.getString("visit_id"), r.getString("type"), r.getString("status"), r.getString("note"), r.getString("reply"), r.getString("created_at"),qr==null?0:r.getLong("version")), args);
        long revision = db.query("SELECT value FROM metadata WHERE name='revision'", r -> r.getLong(1)).get(0);
        return new Snapshot(revision, menu, tables, orders, tickets,checkout==null?List.of():checkout.list(admin(who)?"v.active=1":"c.visit_id=?",admin(who)?new Object[0]:new Object[]{allowed}),resolutions==null?List.of():resolutions.list(admin(who)?"v.active=1":"o.visit_id=?",admin(who)?new Object[0]:new Object[]{allowed}),qr==null||db.query("SELECT value FROM store_settings WHERE name='accepting_orders'",r->r.getString(1)).get(0).equals("1"));
    }
    public synchronized JsonObject execute(Identity who, String action, JsonObject input) throws SQLException {
        return execute(who, UUID.randomUUID().toString(), action, input);
    }
    public synchronized JsonObject outcome(Identity who, String commandId) throws SQLException {
        if (who == null) throw problem("UNAUTHENTICATED", "Vui lòng đăng nhập.");
        validateCommandId(commandId);
        List<JsonObject> found = db.query("SELECT action,fingerprint,result_json FROM command_receipts WHERE principal=? AND command_id=?", r -> {
            JsonObject result = new JsonObject(); result.addProperty("found", true); result.addProperty("commandId", commandId);
            result.addProperty("action", r.getString("action")); result.addProperty("fingerprint", r.getString("fingerprint")); result.add("result", JsonParser.parseString(r.getString("result_json"))); return result;
        }, principal(who), commandId);
        if (!found.isEmpty()) return found.get(0);
        JsonObject result = new JsonObject(); result.addProperty("found", false); result.addProperty("commandId", commandId); return result;
    }
    private static void validateCommandId(String id) {
        if (id == null || id.isBlank() || id.length() > 80) throw problem("INVALID_INPUT", "Mã yêu cầu không hợp lệ.");
    }
    public synchronized Identity startNewVisit(Identity who) throws SQLException {
        if (qr != null) throw problem("QR_REQUIRED", "Không chuyển quyền sang lượt mới. Vui lòng quét QR mới.");
        requireGuest(who); String previous = guestVisit(who);
        if (previous == null || !db.query("SELECT id FROM visits WHERE id=? AND active=1", r -> r.getString(1), previous).isEmpty()) throw problem("INVALID_STATE", "Chỉ bắt đầu khách mới sau khi lượt trước đã kết thúc.");
        String token = UUID.randomUUID().toString() + UUID.randomUUID();
        List<String> visits = db.query("SELECT id FROM visits WHERE table_id=? AND active=1", r -> r.getString(1), who.tableId());
        db.update("INSERT INTO guest_credentials VALUES(?,?,?,?)", Commands.digest(token), who.username(), visits.isEmpty() ? null : visits.get(0), Instant.now().toString());
        return new Identity(who.username(), who.role(), who.tableId(), token);
    }
    public synchronized JsonObject discard(Identity who, String commandId, String action, JsonObject input) throws SQLException {
        if(!(qr!=null&&admin(who)&&Set.of("REQUEST_CHECKOUT","ACK_CHECKOUT","REOPEN_ORDERING","PAY_AND_CLOSE","CLOSE_VISIT","CREATE_MENU_ITEM","UPDATE_MENU_ITEM","RESOLVE_ORDER").contains(action)))requireGuest(who);
        validateCommandId(commandId);
        if (!Commands.guestMutation(action)&&!(qr!=null&&admin(who)&&Set.of("ACK_CHECKOUT","REOPEN_ORDERING","PAY_AND_CLOSE","CLOSE_VISIT","CREATE_MENU_ITEM","UPDATE_MENU_ITEM","RESOLVE_ORDER").contains(action))) throw problem("INVALID_INPUT", "Chỉ bỏ yêu cầu hợp lệ chưa được tiếp nhận.");
        return db.transaction(() -> {
            String owner = principal(who), fingerprint = Commands.fingerprint(action, input);
            JsonObject known = outcome(who, commandId);
            if (known.get("found").getAsBoolean()) {
                String saved = db.query("SELECT fingerprint FROM command_receipts WHERE principal=? AND command_id=?", r -> r.getString(1), owner, commandId).get(0);
                if (!saved.equals(fingerprint)) throw problem("COMMAND_CONFLICT", "Mã yêu cầu đã dùng cho nội dung khác.");
                return known;
            }
            JsonObject result = new JsonObject(); result.addProperty("cancelledBeforeAcceptance", true);
            db.update("INSERT INTO command_receipts VALUES(?,?,?,?,?,?)", owner, commandId, action, fingerprint, Json.GSON.toJson(result), Instant.now().toString());
            return outcome(who, commandId);
        });
    }
    public synchronized JsonObject execute(Identity who, String commandId, String action, JsonObject input) throws SQLException {
        checkIdentity(who);
        validateCommandId(commandId);
        return db.transaction(() -> {
            String fingerprint = Commands.fingerprint(action, input);
            if (Commands.mutation(action)) {
                List<JsonObject> existing = db.query("SELECT fingerprint,result_json FROM command_receipts WHERE principal=? AND command_id=?", r -> {
                    if (!r.getString("fingerprint").equals(fingerprint)) throw problem("COMMAND_CONFLICT", "Mã yêu cầu đã dùng cho nội dung khác.");
                    return JsonParser.parseString(r.getString("result_json")).getAsJsonObject();
                }, principal(who), commandId);
                if (!existing.isEmpty()) {
                    if (existing.get(0).has("cancelledBeforeAcceptance")) throw problem("COMMAND_DISCARDED", "Yêu cầu chưa được nhận đã được bỏ; không tạo lại.");
                    return existing.get(0);
                }
            }
            JsonObject result = switch (action) {
                case "OPEN_ALL_TABLES" -> {qrRequired();requireAdmin(who);yield tableOrdering.enableAll();}
                case "SET_TABLE_ACCEPTING" -> {qrRequired();requireAdmin(who);int table=integer(input,"tableId"),enabled=integer(input,"enabled");if(enabled!=0&&enabled!=1)throw problem("INVALID_INPUT","enabled phải bằng 0 hoặc 1.");if(db.update("UPDATE table_access SET enabled=? WHERE table_id=?",enabled,table)!=1)throw problem("NOT_FOUND","Hãy bật QR cố định cho toàn quán trước.");yield fields("status",enabled==1?"ACCEPTING":"PAUSED");}
                case "GET_TABLE_QR" -> {qrRequired();requireAdmin(who);yield tableOrdering.qr(integer(input,"tableId"));}
                case "GET_OWN_TABLE_QR" -> {qrRequired();requireGuest(who);if(db.query("SELECT id FROM visits WHERE id=? AND service_mode='AUTO'",r->r.getString(1),guestVisit(who)).isEmpty())throw problem("FORBIDDEN","Chỉ áp dụng cho phiên riêng QR cố định.");yield tableOrdering.qr(who.tableId());}
                case "START_ORDER_PAYMENT","SIMULATE_PAYMENT","CANCEL_UNPAID_ORDER" -> {
                    qrRequired();requireGuest(who);String visit=text(input,"visitId",80,true);activeVisit(who,visit);
                    yield action.equals("START_ORDER_PAYMENT")?orderPayments.start(visit,integer(input,"orderId")):action.equals("SIMULATE_PAYMENT")?orderPayments.simulate(visit,input):orderPayments.cancel(visit,integer(input,"orderId"));
                }
                case "CLOSE_VISIT" -> {qrRequired();requireAdmin(who);String visit=text(input,"visitId",80,true);activeVisit(who,visit);yield orderPayments.close(visit);}
                case "GET_CONTINUATION_CONTEXT" -> continuationContext(who);
                case "AMEND_SERVICE","CANCEL_SERVICE" -> {qrRequired();requireGuest(who);String visit=text(input,"visitId",80,true);activeVisit(who,visit);yield new SupportActions(db,events).change(visit,who.username(),input,action.equals("CANCEL_SERVICE"));}
                case "SET_STORE_ACCEPTING" -> {qrRequired();requireAdmin(who);int enabled=integer(input,"enabled");if(enabled!=0&&enabled!=1)throw problem("INVALID_INPUT","Trạng thái phải là 0 hoặc 1.");db.update("UPDATE store_settings SET value=? WHERE name='accepting_orders'",String.valueOf(enabled));yield fields("status",enabled==1?"ACCEPTING":"PAUSED");}
                case "FIND_ASSISTANCE" -> {qrRequired();requireAdmin(who);yield findAssistance(text(input,"query",80,true));}
                case "RESOLVE_ORDER" -> {qrRequired();requireAdmin(who);yield resolutions.resolve(who.username(),input);}
                case "GET_SALES_HISTORY" -> {qrRequired();requireAdmin(who);yield salesHistory(input);}
                case "GET_SALES_RECEIPT" -> {qrRequired();yield salesReceipt(who,text(input,"receiptId",100,true));}
                case "CREATE_MENU_ITEM","UPDATE_MENU_ITEM" -> {qrRequired();requireAdmin(who);yield catalog.save(input,action.equals("CREATE_MENU_ITEM"));}
                case "GET_MENU_CATEGORIES" -> {qrRequired();requireAdmin(who);yield catalog.categories();}
                case "SAVE_MENU_CATEGORY","DELETE_MENU_CATEGORY" -> {qrRequired();requireAdmin(who);yield catalog.category(input,action.equals("DELETE_MENU_CATEGORY"));}
                case "GET_NOTIFICATIONS" -> { qrRequired();yield events.list(principal(who),admin(who)?null:guestVisit(who),input); }
                case "MARK_NOTIFICATION_READ" -> { qrRequired();yield events.read(principal(who),admin(who)?null:guestVisit(who),integer(input,"eventId")); }
                case "OPEN_TABLE" -> openTable(who, integer(input, "tableId"));
                case "GET_VISIT_QR" -> { requireAdmin(who); String visit = text(input, "visitId", 80, true); activeVisit(who, visit); yield qrRequired().qr(visit); }
                case "ROTATE_JOIN_GRANT" -> { requireAdmin(who); String visit = text(input, "visitId", 80, true); activeVisit(who, visit); yield qrRequired().rotateGrant(visit); }
                case "GET_VISIT_MEMBERSHIPS" -> { requireAdmin(who); String visit = text(input, "visitId", 80, true); activeVisit(who, visit); yield qrRequired().memberships(visit); }
                case "REVOKE_SESSION" -> { requireAdmin(who); String visit = text(input, "visitId", 80, true); activeVisit(who, visit); yield qrRequired().revoke(visit, text(input, "membershipId", 80, true)); }
                case "PLACE_ORDER" -> placeOrder(who, input);
                case "SET_ORDER_STATUS" -> advanceOrder(who, integer(input, "orderId"), text(input, "status", 30, true));
                case "CALL_SERVICE", "REQUEST_BILL" -> {if(qr!=null&&action.equals("REQUEST_BILL"))throw problem("ACTION_REPLACED","Dùng REQUEST_CHECKOUT với version; không tạo ticket tính tiền trên bản QR.");yield createTicket(who, input, action);}
                case "REQUEST_CHECKOUT" -> { qrRequired();String visit=text(input,"visitId",80,true);activeVisit(who,visit);if(orderPayments.prepaid(visit))throw problem("PREPAY_REQUIRED","Lượt này thanh toán từng đơn trước khi pha chế.");yield checkout.request(visit,principal(who),input); }
                case "ACK_CHECKOUT", "REOPEN_ORDERING" -> { qrRequired();requireAdmin(who);String visit=text(input,"visitId",80,true);activeVisit(who,visit);yield checkout.change(visit,principal(who),input,action.equals("REOPEN_ORDERING")); }
                case "GET_CHECKOUT" -> { qrRequired();String visit=text(input,"visitId",80,true);if(!admin(who)&&!Objects.equals(guestVisit(who),visit))throw problem("FORBIDDEN","Không có quyền xem lượt này.");yield checkout.events(visit); }
                case "HANDLE_TICKET" -> handleTicket(who, integer(input, "ticketId"), text(input, "reply", 500, true),input);
                case "GET_BILL" -> Json.object(bill(who, text(input, "visitId", 80, true)));
                case "PAY_AND_CLOSE" -> pay(who, text(input, "visitId", 80, true),input);
                case "CLOSE_EMPTY_TABLE" -> closeEmpty(who, text(input, "visitId", 80, true));
                default -> throw problem("UNKNOWN_ACTION", "Thao tác không được hỗ trợ.");
            };
            if(events!=null)recordEvent(action,input,result);
            if(tableOrdering!=null&&Set.of("SET_ORDER_STATUS","HANDLE_TICKET","CANCEL_UNPAID_ORDER","RESOLVE_ORDER","CANCEL_SERVICE").contains(action))tableOrdering.finishReadyVisits();
            if (Commands.mutation(action)) db.update("UPDATE metadata SET value=value+1 WHERE name='revision'");
            if (Commands.mutation(action)) db.update("INSERT INTO command_receipts VALUES(?,?,?,?,?,?)", principal(who), commandId, action, fingerprint, Json.GSON.toJson(result), Instant.now().toString());
            return result;
        });
    }
    private void recordEvent(String action,JsonObject input,JsonObject result) throws SQLException {
        String visit=input.has("visitId")?input.get("visitId").getAsString():null;
        String entity="",title="";
        switch(action){
            case "PLACE_ORDER" -> {entity=result.get("orderId").getAsString();title="Đơn #"+entity+" đã được ghi nhận";}
            case "SET_ORDER_STATUS" -> {entity=input.get("orderId").getAsString();visit=db.query("SELECT visit_id FROM orders WHERE id=?",r->r.getString(1),entity).get(0);title="Đơn #"+entity+": "+switch(text(input,"status",30,true)){case "PREPARING"->"Đang pha chế";case "READY"->"Sẵn sàng mang ra";default->"Đã phục vụ";};}
            case "CALL_SERVICE" -> {entity=result.get("ticketId").getAsString();title="Khách cần hỗ trợ: "+text(input,"note",500,false);}
            case "HANDLE_TICKET" -> {entity=input.get("ticketId").getAsString();visit=db.query("SELECT visit_id FROM tickets WHERE id=?",r->r.getString(1),entity).get(0);title="Nhân viên phản hồi: "+text(input,"reply",500,true);}
            case "REQUEST_CHECKOUT","ACK_CHECKOUT","REOPEN_ORDERING" -> {
                if(action.equals("REQUEST_CHECKOUT")&&!result.get("state").getAsString().equals("REQUESTED"))return;
                entity=result.get("checkoutId").getAsString();
                // Different command IDs can return one existing aggregate: only its new version emits.
                if(!db.query("SELECT id FROM business_events WHERE type=? AND entity_id=?",r->r.getLong(1),action,entity+":"+result.get("version").getAsString()).isEmpty())return;
                entity+=":"+result.get("version").getAsString();title=switch(action){case "REQUEST_CHECKOUT"->"Khách yêu cầu tính tiền";case "ACK_CHECKOUT"->"Quán đã tiếp nhận tính tiền";default->"Quán đã mở lại gọi món";};
            }
            case "PAY_AND_CLOSE" -> {entity=result.get("receiptId").getAsString();title="Đã ghi nhận thanh toán và kết thúc lượt";}
            default -> {return;}
        }
        if(action.equals("PLACE_ORDER")&&orderPayments.prepaid(visit)){events.append(visit,"ORDER_AWAITING_PAYMENT",entity,"Đơn #"+entity+" chờ thanh toán");return;}
        events.append(visit,action,entity,title);
    }
    private JsonObject openTable(Identity who, int tableId) throws SQLException {
        requireAdmin(who);
        if(qr!=null&&!db.query("SELECT table_id FROM table_access WHERE table_id=?",r->r.getInt(1),tableId).isEmpty())throw problem("AUTOMATIC_TABLE","Bàn dùng QR cố định; khách tự tạo phiên riêng khi quét.");
        if (db.query("SELECT id FROM cafe_tables WHERE id=?", r -> r.getInt(1), tableId).isEmpty()) throw problem("NOT_FOUND", "Không có bàn này.");
        if (!db.query("SELECT id FROM visits WHERE table_id=? AND active=1", r -> r.getString(1), tableId).isEmpty()) throw problem("TABLE_ALREADY_OPEN", "Bàn đã có phiên đang hoạt động.");
        String visit = UUID.randomUUID().toString();
        db.update("INSERT INTO visits(id,table_id,active,opened_at) VALUES(?,?,1,?)", visit, tableId, Instant.now().toString());
        if(qr!=null)db.update("UPDATE visits SET payment_mode=? WHERE id=?",prepay?"PREPAY":"POSTPAY",visit);
        if (qr != null) qr.createGrant(visit);
        db.update("UPDATE guest_credentials SET visit_id=? WHERE visit_id IS NULL AND username IN(SELECT username FROM accounts WHERE table_id=?)", visit, tableId);
        return fields("visitId", visit);
    }
    private JsonObject placeOrder(Identity who, JsonObject input) throws SQLException {
        requireGuest(who); String visit = text(input, "visitId", 80, true); activeVisit(who, visit);
        if(qr!=null&&!db.query("SELECT value FROM store_settings WHERE name='accepting_orders'",r->r.getString(1)).get(0).equals("1"))throw problem("ORDERING_PAUSED","Quán tạm dừng nhận đơn mới. Đơn đã nhận, thanh toán và hỗ trợ vẫn tiếp tục.");
        if(checkout!=null)checkout.orderingAllowed(visit);
        JsonElement element = input.get("items");
        if (element == null || !element.isJsonArray() || element.getAsJsonArray().isEmpty() || element.getAsJsonArray().size() > 20)
            throw problem("INVALID_INPUT", "Chọn từ 1 đến 20 món.");
        List<OrderItem> items = new ArrayList<>(); Set<String> seen = new HashSet<>(); Map<Integer,Integer> quantities=new HashMap<>();
        for (JsonElement row : element.getAsJsonArray()) {
            if (!row.isJsonObject()) throw problem("INVALID_INPUT", "Danh sách món không hợp lệ.");
            int id = integer(row.getAsJsonObject(), "menuId"), quantity = integer(row.getAsJsonObject(), "quantity");
            if (quantity < 1 || quantity > 20 || !seen.add(id+"\n"+(qr==null?"":text(row.getAsJsonObject(),"note",160,false))) || quantities.merge(id,quantity,Integer::sum)>20) throw problem("INVALID_INPUT", "Số lượng phải từ 1–20 và mỗi món chỉ có một dòng.");
            List<MenuItem> found = db.query("SELECT * FROM menu WHERE id=?", catalog==null?r -> new MenuItem(id, r.getString("name"), r.getLong("price_vnd"), r.getString("category")):MenuCatalog::row, id);
            if (found.isEmpty()) throw problem("NOT_FOUND", "Món không tồn tại.");
            MenuItem item = found.get(0);
            if(!item.active()||!item.available())throw problem("ITEM_UNAVAILABLE","Món "+item.name()+" đang ngừng hoặc hết bán. Hãy sửa giỏ.");
            JsonObject chosen=row.getAsJsonObject();
            if(chosen.has("expectedVersion")&&((chosen.has("expectedPurchaseVersion")?integer(chosen,"expectedPurchaseVersion")!=item.purchaseVersion():integer(chosen,"expectedVersion")!=item.version())||integer(chosen,"expectedPriceVnd")!=item.priceVnd()))throw problem("MENU_CHANGED","Món "+item.name()+" đã đổi giá/thông tin. Hãy xem lại giỏ.");
            items.add(new OrderItem(id, item.name(), quantity, item.priceVnd(), item.priceVnd() * quantity,qr==null?"":text(chosen,"note",160,false)));
        }
        if(qr!=null&&orderPayments.prepaid(visit))for(JsonElement row:element.getAsJsonArray())if(!row.getAsJsonObject().has("expectedVersion"))throw problem("MENU_CHANGED","Hãy xem lại giá hiện tại trước khi đặt và thanh toán.");
        long id = db.insert("INSERT INTO orders(visit_id,status,note,created_at) VALUES(?,'SUBMITTED',?,?)", visit, text(input, "note", 500, false), Instant.now().toString());
        if(qr!=null&&orderPayments.prepaid(visit))db.update("UPDATE orders SET payment_state='UNPAID' WHERE id=?",id);
        int line=0;for (OrderItem item : items) {if(qr==null)db.update("INSERT INTO order_items VALUES(?,?,?,?,?)", id,item.menuId(),item.name(),item.quantity(),item.unitPriceVnd());else db.update("INSERT INTO order_items VALUES(?,?,?,?,?,?,?)",id,++line,item.menuId(),item.name(),item.quantity(),item.unitPriceVnd(),item.note());}
        if(checkout!=null)checkout.bump(visit);
        JsonObject output = new JsonObject(); output.addProperty("orderId", id); output.addProperty("totalVnd", items.stream().mapToLong(OrderItem::subtotalVnd).sum());if(orderPayments!=null&&orderPayments.prepaid(visit))output.addProperty("paymentRequired",true); return output;
    }
    private JsonObject findAssistance(String query) throws SQLException {
        var results=new JsonArray();
        var rows=db.query("SELECT command_id,action,result_json,created_at FROM command_receipts WHERE command_id=? ORDER BY created_at DESC LIMIT 10",r->{var row=new JsonObject();row.addProperty("commandId",r.getString(1));row.addProperty("action",r.getString(2));row.addProperty("createdAt",r.getString(4));var receipt=JsonParser.parseString(r.getString(3)).getAsJsonObject();row.addProperty("state",receipt.has("cancelledBeforeAcceptance")?"DISCARDED":"ACCEPTED");for(String field:List.of("orderId","ticketId"))if(receipt.has(field))row.add(field,receipt.get(field));return row;},query);
        for(var row:rows)results.add(row);
        if(query.matches("[0-9]{1,9}"))for(var order:loadOrders(" WHERE o.id=?",Integer.parseInt(query)))results.add(Json.object(order));
        var result=new JsonObject();result.add("results",results);return result;
    }
    private JsonObject continuationContext(Identity who) throws SQLException {
        qrRequired();requireGuest(who);guestVisit(who);
        var members=tableOrdering.previousMemberships(who);var result=new JsonObject();
        result.add("previousOrders",new JsonArray());result.add("resolutions",new JsonArray());
        if(members.isEmpty())return result;
        var previous=db.query("SELECT id,visit_id FROM guest_memberships WHERE id=?",r->{var scope=new JsonObject();scope.addProperty("storeId",qr.storeId());scope.addProperty("membershipId",r.getString("id"));scope.addProperty("visitId",r.getString("visit_id"));return scope;},members.get(0)).get(0);
        result.add("previousScope",previous);
        String placeholders=String.join(",",Collections.nCopies(members.size(),"?"));
        String visits="SELECT visit_id FROM guest_memberships WHERE id IN ("+placeholders+")";
        result.add("previousOrders",Json.GSON.toJsonTree(loadOrders(" WHERE v.id IN ("+visits+")",members.toArray())));
        result.add("resolutions",Json.GSON.toJsonTree(resolutions.list("o.visit_id IN ("+visits+")",members.toArray())));
        return result;
    }
    private JsonObject advanceOrder(Identity who, int orderId, String status) throws SQLException {
        requireAdmin(who);
        List<OrderView> found = loadOrders(" WHERE o.id=?", orderId);
        if (found.isEmpty()) throw problem("NOT_FOUND", "Không có đơn này.");
        OrderView order = found.get(0); activeVisit(who, order.visitId());
        if(!Set.of("PAID","POSTPAY").contains(order.paymentState()))throw problem("PAYMENT_REQUIRED","Chỉ bắt đầu pha chế khi Server đã xác nhận thanh toán.");
        String next = switch (order.status()) { case "SUBMITTED" -> "PREPARING"; case "PREPARING" -> "READY"; case "READY" -> "SERVED"; default -> ""; };
        if (!next.equals(status)) throw problem("INVALID_STATE", "Chỉ được chuyển sang bước phục vụ kế tiếp.");
        db.update("UPDATE orders SET status=? WHERE id=?", status, orderId);if(checkout!=null)checkout.bump(order.visitId()); return fields("status", status);
    }
    private JsonObject createTicket(Identity who, JsonObject input, String type) throws SQLException {
        requireGuest(who); String visit = text(input, "visitId", 80, true); activeVisit(who, visit);
        if (type.equals("REQUEST_BILL") && loadOrders(" WHERE o.visit_id=?", visit).isEmpty()) throw problem("INVALID_STATE", "Bàn chưa có đơn để tính tiền.");
        if (!db.query("SELECT id FROM tickets WHERE visit_id=? AND type=? AND status='OPEN'", r -> r.getLong(1), visit, type).isEmpty())
            throw problem("TICKET_ALREADY_OPEN", "Yêu cầu cùng loại đang chờ xử lý.");
        long id = db.insert("INSERT INTO tickets(visit_id,type,status,note,created_at) VALUES(?,?,'OPEN',?,?)", visit, type, text(input, "note", 500, false), Instant.now().toString());
        JsonObject output = new JsonObject(); output.addProperty("ticketId", id); return output;
    }
    private JsonObject handleTicket(Identity who, int id, String reply,JsonObject input) throws SQLException {
        requireAdmin(who);
        List<String> visits = db.query("SELECT visit_id FROM tickets WHERE id=? AND status='OPEN'", r -> r.getString(1), id);
        if (visits.isEmpty()) throw problem("INVALID_STATE", "Yêu cầu không tồn tại hoặc đã được xử lý.");
        activeVisit(who, visits.get(0)); if(qr!=null&&input.has("expectedVersion")&&db.query("SELECT version FROM tickets WHERE id=?",r->r.getInt(1),id).get(0)!=integer(input,"expectedVersion"))throw problem("VERSION_CONFLICT","Khách vừa bổ sung yêu cầu. Hãy đọc lại trước khi hoàn tất.");db.update(qr==null?"UPDATE tickets SET status='HANDLED',reply=? WHERE id=?":"UPDATE tickets SET status='HANDLED',reply=?,version=version+1 WHERE id=?", reply, id); return fields("reply", reply);
    }
    private Bill bill(Identity who, String visit) throws SQLException {
        int table = activeVisit(who, visit); List<OrderView> orders = loadOrders(" WHERE o.visit_id=?", visit);
        Checkout current=checkout==null?null:checkout.current(visit);
        return new Bill(visit, table, orders.stream().mapToLong(OrderView::totalVnd).sum(), orders,checkout==null?0:checkout.visitVersion(visit),current==null?0:current.version());
    }
    private JsonObject pay(Identity who, String visit,JsonObject input) throws SQLException {
        requireAdmin(who); Bill bill = bill(who, visit);
        if(orderPayments!=null&&orderPayments.prepaid(visit))throw problem("PREPAY_REQUIRED","Đơn trả trước không thu tiền lần nữa. Dùng đóng lượt sau phục vụ.");
        if(checkout!=null)checkout.validatePayment(visit,bill.totalVnd(),input);
        if (bill.orders().isEmpty() || bill.orders().stream().anyMatch(o -> !o.status().equals("SERVED"))) throw problem("INVALID_STATE", "Cần phục vụ xong tất cả đơn trước khi thanh toán.");
        if (!db.query("SELECT id FROM tickets WHERE visit_id=? AND status='OPEN'", r -> r.getLong(1), visit).isEmpty()) throw problem("INVALID_STATE", "Cần xử lý các yêu cầu còn đang mở.");
        long receipt = db.insert("INSERT INTO payments(visit_id,total_vnd,method,paid_at) VALUES(?,?,'CASH_SIMULATED',?)", visit, bill.totalVnd(), Instant.now().toString());
        db.update("UPDATE visits SET active=0,closed_at=? WHERE id=?", Instant.now().toString(), visit);
        if(checkout!=null)checkout.paid(visit,principal(who));
        JsonObject output = Json.object(bill); output.addProperty("receiptId", receipt); output.addProperty("paymentMethod", "CASH_SIMULATED"); return output;
    }
    private JsonObject closeEmpty(Identity who, String visit) throws SQLException {
        requireAdmin(who); activeVisit(who, visit);
        if (!loadOrders(" WHERE o.visit_id=?", visit).isEmpty() || !db.query("SELECT id FROM tickets WHERE visit_id=? AND status='OPEN'", r -> r.getLong(1), visit).isEmpty())
            throw problem("INVALID_STATE", "Chỉ đóng bàn trống và đã xử lý hết yêu cầu.");
        db.update("UPDATE visits SET active=0,closed_at=? WHERE id=?", Instant.now().toString(), visit);
        if(checkout!=null)db.update("UPDATE visits SET state='CLOSED',version=version+1 WHERE id=?",visit);
        return fields("visitId", visit);
    }
    private int activeVisit(Identity who, String visit) throws SQLException {
        List<Integer> tables = db.query("SELECT table_id FROM visits WHERE id=? AND active=1", r -> r.getInt(1), visit);
        if (tables.isEmpty()) throw problem("SESSION_CLOSED", "Phiên bàn đã kết thúc hoặc không tồn tại.");
        if (!admin(who) && !Objects.equals(who.tableId(), tables.get(0))) throw problem("FORBIDDEN", "Bạn không có quyền trên bàn này.");
        if (!admin(who) && !Objects.equals(guestVisit(who), visit)) throw problem("STALE_SESSION", "Quyền của bạn không thuộc lượt khách này. Yêu cầu cũ không được chuyển lượt.");
        return tables.get(0);
    }
    private String principal(Identity who) throws SQLException {
        if (admin(who)) return who.username();
        if (qr != null) return "membership:" + qr.validate(who).membershipId();
        guestVisit(who); // Also verify the credential when looking up a closed visit's receipt.
        return who.username() + ":" + Commands.digest(who.credential());
    }
    private String guestVisit(Identity who) throws SQLException {
        // Membership validation also permits reading the receipt of one's closed visit.
        if (qr != null) return qr.validate(who).visitId();
        if (who.credential() == null) throw problem("INVALID_CREDENTIAL", "Thiếu quyền của lượt khách.");
        List<Optional<String>> found = db.query("SELECT visit_id FROM guest_credentials WHERE token_hash=? AND username=?", r -> Optional.ofNullable(r.getString(1)), Commands.digest(who.credential()), who.username());
        if (found.isEmpty()) throw problem("INVALID_CREDENTIAL", "Quyền của lượt khách không hợp lệ.");
        return found.get(0).orElse(null);
    }
    private String salesSource(){return "(SELECT 'order-'||p.id receipt_id,o.visit_id,v.table_id,p.amount_vnd total_vnd,p.updated_at paid_at,p.provider method,o.id order_id FROM order_payments p JOIN orders o ON o.id=p.order_id JOIN visits v ON v.id=o.visit_id WHERE p.state='PAID' UNION ALL SELECT 'visit-'||p.id,p.visit_id,v.table_id,p.total_vnd,p.paid_at,p.method,0 FROM payments p JOIN visits v ON v.id=p.visit_id)";}
    private JsonObject salesHistory(JsonObject input)throws SQLException{
        int limit=input.has("limit")?integer(input,"limit"):20;if(limit<1||limit>50)throw problem("INVALID_INPUT","Mỗi trang từ 1 đến 50 hóa đơn.");
        StringBuilder where=new StringBuilder(" WHERE 1=1");List<Object> args=new ArrayList<>();
        if(input.has("tableId")){int table=integer(input,"tableId");if(table<1||table>6)throw problem("INVALID_INPUT","Bàn không hợp lệ.");where.append(" AND table_id=?");args.add(table);}
        for(String key:List.of("fromDate","toDate")){String value=text(input,key,10,false);if(!value.isEmpty())try{var date=java.time.LocalDate.parse(value);where.append(key.equals("fromDate")?" AND paid_at>=?":" AND paid_at<?");args.add((key.equals("toDate")?date.plusDays(1):date).atStartOfDay(java.time.ZoneId.of("Asia/Ho_Chi_Minh")).toInstant().toString());}catch(java.time.DateTimeException e){throw problem("INVALID_INPUT","Ngày lọc cần dạng yyyy-MM-dd.");}}
        String before=text(input,"beforeTime",40,false);if(!before.isEmpty()){try{Instant.parse(before);}catch(Exception e){throw problem("INVALID_INPUT","Cursor không hợp lệ.");}where.append(" AND (paid_at<? OR (paid_at=? AND receipt_id<?))");args.add(before);args.add(before);args.add(text(input,"beforeId",100,true));}
        args.add(limit+1);
        var rows=db.query("SELECT * FROM "+salesSource()+where+" ORDER BY paid_at DESC,receipt_id DESC LIMIT ?",r->{JsonObject o=new JsonObject();o.addProperty("receiptId",r.getString("receipt_id"));o.addProperty("visitId",r.getString("visit_id"));o.addProperty("tableId",r.getInt("table_id"));o.addProperty("totalVnd",r.getLong("total_vnd"));o.addProperty("paidAt",r.getString("paid_at"));o.addProperty("method",r.getString("method"));o.addProperty("orderId",r.getLong("order_id"));return o;},args.toArray());
        for(var row:rows){var resolved=resolutions.list("r.order_id=?",row.get("orderId").getAsLong());if(!resolved.isEmpty())row.add("resolution",resolved.get(0));}
        JsonObject out=new JsonObject();out.addProperty("hasMore",rows.size()>limit);out.add("receipts",Json.GSON.toJsonTree(rows.subList(0,Math.min(limit,rows.size()))));return out;
    }
    private JsonObject salesReceipt(Identity who,String receipt)throws SQLException{
        var found=db.query("SELECT * FROM "+salesSource()+" WHERE receipt_id=?",r->new Object[]{r.getString("visit_id"),r.getInt("table_id"),r.getLong("order_id"),r.getLong("total_vnd"),r.getString("paid_at"),r.getString("method")},receipt);
        if(found.isEmpty())throw problem("NOT_FOUND","Không có hóa đơn này.");Object[] row=found.get(0);String visit=(String)row[0];
        if(!admin(who)&&!Objects.equals(guestVisit(who),visit))throw problem("FORBIDDEN","Không có quyền xem hóa đơn của lượt khác.");
        JsonObject out=new JsonObject();out.addProperty("receiptId",receipt);out.addProperty("visitId",visit);out.addProperty("tableId",(Integer)row[1]);out.addProperty("totalVnd",(Long)row[3]);out.addProperty("paidAt",(String)row[4]);out.addProperty("method",(String)row[5]);
        out.add("orders",Json.GSON.toJsonTree((Long)row[2]==0?loadOrders(" WHERE o.visit_id=?",visit):loadOrders(" WHERE o.id=?",row[2])));
        var resolution=resolutions.list("r.order_id=?",row[2]);if(!resolution.isEmpty())out.add("resolution",resolution.get(0));return out;
    }
    private List<OrderView> loadOrders(String where, Object... args) throws SQLException {
        record Header(long id, int table, String visit, String status, String note, String time,String payment) { }
        List<Header> headers = db.query("SELECT o.*,v.table_id FROM orders o JOIN visits v ON v.id=o.visit_id" + where + " ORDER BY o.id DESC",
                r -> new Header(r.getLong("id"), r.getInt("table_id"), r.getString("visit_id"), r.getString("status"), r.getString("note"), r.getString("created_at"),qr==null?"POSTPAY":r.getString("payment_state")), args);
        List<OrderView> orders = new ArrayList<>();
        for (Header h : headers) {
            List<OrderItem> items = db.query("SELECT * FROM order_items WHERE order_id=? ORDER BY "+(qr==null?"menu_id":"line_no"), r -> new OrderItem(r.getInt("menu_id"), r.getString("name"), r.getInt("quantity"), r.getLong("unit_price_vnd"), r.getLong("unit_price_vnd") * r.getInt("quantity"),qr==null?"":r.getString("note")), h.id());
            orders.add(new OrderView(h.id(), h.table(), h.visit(), h.status(), h.note(), items.stream().mapToLong(OrderItem::subtotalVnd).sum(), h.time(), List.copyOf(items),h.payment(),qr==null||h.payment().equals("POSTPAY")?h.time():db.query("SELECT updated_at FROM order_payments WHERE order_id=? AND state='PAID'",r->r.getString(1),h.id()).stream().findFirst().orElse(null)));
        }
        return List.copyOf(orders);
    }
    private static boolean admin(Identity who) { return who != null && "ADMIN".equals(who.role()); }
    private QrAccess qrRequired() { if (qr == null) throw problem("QR_DISABLED", "Server E0 không hỗ trợ QR."); return qr; }
    private static void requireAdmin(Identity who) { if (!admin(who)) throw problem("FORBIDDEN", "Chỉ chủ quán được thực hiện thao tác này."); }
    private static void requireGuest(Identity who) { if (admin(who) || who.tableId() == null) throw problem("FORBIDDEN", "Thao tác dành cho khách tại bàn."); }
    public static String text(JsonObject data, String field, int max, boolean required) {
        JsonElement value = data.get(field);
        if (value == null || value.isJsonNull()) { if (!required) return ""; throw problem("INVALID_INPUT", "Thiếu trường " + field); }
        if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) throw problem("INVALID_INPUT", "Trường " + field + " phải là chuỗi.");
        String result = value.getAsString().trim();
        if (result.length() > max || (required && result.isEmpty())) throw problem("INVALID_INPUT", "Trường " + field + " không hợp lệ.");
        return result;
    }
    public static int integer(JsonObject data, String field) {
        try {
            JsonElement value = data.get(field);
            if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()) throw new ArithmeticException();
            return value.getAsBigDecimal().intValueExact();
        } catch (RuntimeException e) { throw problem("INVALID_INPUT", "Trường " + field + " phải là số nguyên."); }
    }
    private static JsonObject fields(String name, String value) { JsonObject result = new JsonObject(); result.addProperty(name, value); return result; }
    private static BusinessException problem(String code, String detail) { return new BusinessException(code, detail); }
    @Override public synchronized void close() throws SQLException { db.close(); }
}
