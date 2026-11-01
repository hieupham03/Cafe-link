# CafeLink V10.1 - Hợp đồng giao tiếp

V10.1 dùng schema 13; [bảng quyền và tài khoản](UPGRADE_V10_1_ROLES.md) bổ sung cho V10; các thay đổi dưới đây bổ sung cho cơ chế TCP/HTTP hiện có. [Hướng dẫn V10](UPGRADE_V10.md) là điểm vào của bản nâng cấp local; các số đo V9.4 trong báo cáo được giữ nguyên.

## 1. Hai lớp giao tiếp

Bổ sung vận hành V9.4: `GET /api/health` kiểm Gateway còn trả lời; `GET /api/ready` kiểm đường TCP và đọc metadata DB. Gateway dùng bản tin `HEALTH_CHECK` không mang credential, không tạo dữ liệu nghiệp vụ. Readiness có thời hạn chung và cache ngắn, trả 200/503 cùng trạng thái tổng quát. `GET /api/admin/diagnostics` yêu cầu ADMIN ở cả hai tầng, dùng lệnh TCP `GET_DIAGNOSTICS` để đọc bộ đếm và tối đa 100 trace không có payload; không ghi bền hoặc thay receipt nghiệp vụ. Xem [chi tiết nâng cấp](WEB_HARDENING.md). V10 bổ sung tiếp nhận trước thanh toán và snapshot thuế trên schema 12 như mục 4 và 6.

Browser → Gateway dùng HTTP/HTTPS JSON để gửi lệnh, WebSocket/WSS để nhận trạng thái. Gateway → Core dùng TCP Socket với application framing riêng. `WebMain` khởi động các thành phần nhưng dữ liệu nghiệp vụ vẫn đi qua TCP; không biến bài tập thành browser CRUD trực tiếp SQLite.

TCP frame:

```text
[4 byte signed positive int, big-endian: số byte body]
[body JSON mã hóa UTF-8, strict decoder]
```

Kích thước 1–262144 byte; đọc đủ header/body, không giả định một lần `read` là một message. Sai length/UTF-8/JSON/version/kind/action thì đóng peer lỗi hợp lý, không dừng toàn Server. `FrameCodec` không dùng Java object deserialization.

Message TCP minh họa (không chứa credential thật):

```json
{
  "version": 1,
  "kind": "REQUEST",
  "requestId": "demo-intent-001",
  "action": "PLACE_ORDER",
  "ok": true,
  "data": {
    "visitId": "demo-visit",
    "items": [{"menuId": 2, "quantity": 1,
      "expectedVersion": 1, "expectedPurchaseVersion": 1, "expectedPriceVnd": 30000,
      "note": "Ít đá"}]
  }
}
```

Response giữ requestId/action, kind RESPONSE; `ok=false` có errorCode/message. EVENT `STATE_UPDATED` không cần requestId RPC. RequestId trên TCP cho mutation là command ID bền được Gateway chuyển tiếp, không tạo ID mới khi retry cùng ý định.

## 2. HTTP command và quyền

Ví dụ `POST /api/command`, cookie phiên kèm Origin và `X-CSRF-Token` hợp lệ:

```json
{
  "commandId": "demo-intent-001",
  "action": "PLACE_ORDER",
  "scope": {"storeId": "demo-store", "visitId": "demo-visit", "membershipId": "demo-member"},
  "data": {"visitId": "demo-visit", "items": [{"menuId": 2, "quantity": 1,
    "expectedVersion": 1, "expectedPurchaseVersion": 1, "expectedPriceVnd": 30000, "note": "Ít đá"}]}
}
```

Scope phải khớp chủ thể được cấp bởi Core/cookie. Role/tableId client tự khai không cấp quyền. ADMIN/STAFF dùng principal tài khoản; quyền STAFF được kiểm trước receipt và trước discard hành động gốc; guest bị ràng buộc private membership/visit. Body JSON HTTP giới hạn 64 KiB; ảnh là endpoint bytes riêng, tối đa 2 MiB, kiểm decoder/kích thước và re-encode, không gửi bytes ảnh qua frame TCP.

| Nhóm | Action/endpoint chính | Bất biến |
|---|---|---|
| Vào hệ thống | `/api/login`, `/api/guest/join`, `/api/session` | Cookie HttpOnly; public Secure; QR/table grant không phải mật khẩu admin |
| Gọi món | PLACE_ORDER | Giá Server, kiểm purchase version/giá; note từng dòng; retry cùng ID/payload |
| Phục hồi | GET_OUTCOME, DISCARD_COMMAND | Lookup không phải lệnh hủy đã nhận; dấu bỏ bền chặn accept muộn |
| Hỗ trợ | CALL_SERVICE, AMEND_SERVICE, CANCEL_SERVICE, HANDLE_TICKET | Một lời gọi mở cùng loại/visit; sửa/rút đúng version và scope |
| Trả trước | START_ORDER_PAYMENT, SIMULATE_PAYMENT, CANCEL_UNPAID_ORDER | PAID chỉ sau kết quả simulator hợp lệ; không tạo lần thu mới do retry |
| Quầy | SET_ORDER_STATUS, xử lý từ chối/hoàn trước pha chế | Guard thứ tự, chỉ pha chế khi đủ điều kiện tiền, audit lý do/actor |
| Vận hành | OPEN_ALL_TABLES, SET_TABLE_ACCEPTING, SET_STORE_ACCEPTING | Không reset phiên hiện tại; dừng đơn mới không xóa nghĩa vụ cũ |
| Danh mục/hóa đơn | CREATE_MENU_ITEM, UPDATE_MENU_ITEM, GET_SALES_HISTORY, GET_SALES_RECEIPT | Edit version chống ghi đè; hóa đơn giữ giá/tên lúc bán |
| Đối chiếu tại quầy | FIND_ASSISTANCE | Chỉ đọc kết quả theo command ID/số đơn; không tự gửi/thu tiền |

## 3. Receipt, fingerprint, barrier

Tài khoản STAFF chỉ được các lệnh phục vụ trong `Permissions.STAFF_ACTIONS`; `RESOLVE_ORDER` giới hạn `CANCEL_UNPAID`. `SET_MENU_AVAILABILITY {menuId,expectedVersion,available}` không nhận trường giá/ảnh/nội dung. Các lệnh `GET_STAFF_ACCOUNTS`, `CREATE_STAFF_ACCOUNT {username,displayName,password}`, `SET_STAFF_ACTIVE {username,expectedVersion,enabled}`, `RESET_STAFF_PASSWORD {username,expectedVersion,password}`, `GET_STAFF_AUDIT` chỉ ADMIN. Khóa/đổi mật khẩu làm `auth_version` không còn khớp identity cũ: Core trả `SESSION_REVOKED` hoặc phát EVENT `AUTH_REVOKED`; Gateway báo `SESSION_ENDED` đến các tab. Cookie quầy `operator_...` không được đưa sang luồng resume khách QR.

Hai lệnh chứa mật khẩu không đi qua journal bền tại Browser; dialog giữ command ID trong bộ nhớ để thử lại cùng nội dung khi mất phản hồi. Fingerprint receipt của chúng dùng PBKDF2 có salt thay cho digest nhanh; API/audit không trả hoặc lưu mật khẩu thô. Đóng/reload dialog mất ID trong bộ nhớ, nên tải lại danh sách tài khoản để đối chiếu trước khi tạo lại.

Client ghi command vào journal trước khi gửi. Fingerprint tính từ action/payload canonical; ID lặp cùng nội dung trả receipt cũ, nội dung khác bị COMMAND_CONFLICT. Receipt và thay đổi nghiệp vụ cùng transaction. Idempotency cho một ID không gộp hai lần đặt có chủ đích dùng ID khác.

`GET_OUTCOME found=false` chưa chứng minh handler cũ không thể tới sau. DISCARD_COMMAND tranh chấp cùng khóa/transaction với accept: accept trước thì trả kết quả đã nhận, discard trước thì lưu barrier và command gốc tới muộn không có tác dụng. Không diễn giải dấu bỏ trước tiếp nhận thành hủy/hoàn một đơn đã được nhận.

SEMANTIC: đã nhận thì đối chiếu kết quả; đơn chưa nhận cần khách xác nhận; lời gọi/bổ sung ngắn hạn chưa nhận được bỏ; rút yêu cầu chưa nhận cần xác nhận/bỏ. Lệnh sai scope không tự chuyển sang phiên kế tiếp. Baseline R0/R1 vẫn có idempotency/quyền/scope, chỉ khác quyết định đối với ý định chưa nhận.

## 4. Trạng thái, cập nhật và lỗi

Với QR trả trước, `acceptanceState` bắt đầu WAITING. ADMIN hoặc STAFF được `ACCEPT_ORDER`; Core kiểm món còn được bán, đơn chưa hủy và đúng phiên trước khi chuyển ACCEPTED. Khách mới được `START_ORDER_PAYMENT`; gọi sớm trả `ACCEPTANCE_REQUIRED`. Quầy từ chối dùng `RESOLVE_ORDER/CANCEL_UNPAID` kèm lý do, chuyển REJECTED/CANCELLED và không thu tiền. Các đơn V9.4 được migrate thành ACCEPTED để không bắt tiếp nhận lại đơn cũ.

`orders.status`: SUBMITTED → PREPARING → READY → SERVED. PREPARING yêu cầu đơn được tiếp nhận và đã PAID. `paymentState`: UNPAID/PENDING → PAID, hoặc CANCELLED/REFUNDED theo guard; trạng thái tiền tách khỏi phục vụ. Ticket OPEN → HANDLED/CANCELLED, sửa nội dung tăng version và giữ lịch sử.

Snapshot mang revision và được lọc quyền; Client không áp snapshot cũ hơn. Notification feed/read cursor là dữ liệu riêng, không thay hàng đợi công việc. Reconnect kênh đọc không tự chạy PLACE_ORDER mới. Timeout/kết nối lỗi có thể là kết quả chưa rõ, không khẳng định Server chưa commit.

Mã lỗi tiêu biểu: UNAUTHENTICATED/FORBIDDEN, SCOPE_CHANGED/SESSION_CLOSED, COMMAND_CONFLICT/COMMAND_DISCARDED, VERSION_CONFLICT, MENU_CHANGED/ITEM_UNAVAILABLE, RATE_LIMITED. HTTP trả mã phù hợp với lỗi auth/quyền/quá tải/guard; UI giữ yêu cầu cần đối chiếu, không đổi lỗi mạng thành receipt thành công.

## 5. Public và giới hạn

Proxy mode chỉ chấp nhận public origin HTTPS cấu hình; WebSocket kiểm Origin, cookie public Secure/HttpOnly. Core không tin forwarded headers để cấp quyền. JS/CSS có gzip khi browser chấp nhận, không cache công khai API/cookie/journal. Mã QR được tiêu thụ khỏi fragment thanh địa chỉ, không lưu grant vào localStorage.

Các API không hứa exactly-once delivery, rollback mọi side effect vật lý hoặc ngân hàng thật. Bảo đảm được kiểm là không áp lại tác dụng nghiệp vụ đã có receipt trong các tình huống/phạm vi đã xét. [Báo cáo và dữ liệu](../../report/README.md) ghi raw, baseline và giới hạn đo.

## 6. Thuế và thu chi V10

`GET_TAX_SETTINGS` và `SAVE_TAX_SETTINGS` chỉ dành cho ADMIN. Cấu hình gồm `name`, `rateBps` (basis points: 800 = 8%), `mode` EXCLUSIVE/INCLUSIVE, `version`; lưu gửi `expectedVersion`. Tỷ lệ từ 0 đến 100%, tối đa hai chữ số thập phân. Mặc định 0%, không mặc định mức thuế pháp luật cho quán.

`PLACE_ORDER` từ web gửi thêm `expectedTaxVersion`; Core trả `TAX_CHANGED` nếu cấu hình không còn khớp. Order snapshot giữ `subtotalVnd`, `taxVnd`, `totalVnd`, tên/tỷ lệ/cách tính thuế tại thời điểm gửi. Tiền dùng số nguyên VND, làm tròn nửa lên theo đơn. Đổi cấu hình không sửa đơn đã gửi; thanh toán và hoàn lấy tổng đã chốt.

Các lệnh ADMIN: `GET_FINANCE_REPORT {fromDate,toDate,offset}`, `CREATE_EXPENSE {amountVnd,category,note,spentOn}`, `VOID_EXPENSE {expenseId,reason}`. Mutations đi qua cùng journal/receipt/transaction như thao tác tài chính hiện có. Hủy phiếu giữ bản gốc, thời điểm và lý do; không xóa dòng.

Báo cáo lọc theo ngày quán ở Asia/Ho_Chi_Minh, tối đa 366 ngày, 50 phiếu mỗi trang. Tiền thu và hoàn được ghi ở ngày phát sinh riêng; chi phí chỉ cộng phiếu còn hiệu lực. `balanceVnd = grossVnd - refundVnd - expenseVnd`, là chênh lệch dòng tiền, chưa phải lợi nhuận kế toán. Xuất CSV chạy tại Browser từ dữ liệu báo cáo đã lấy; không có endpoint ghi DB trực tiếp.

“Core đã nhận lệnh” trong journal/receipt khác “nhân viên đã tiếp nhận đơn” trong `acceptanceState`. Lấy lại receipt PLACE_ORDER sau mất phản hồi không tự cho phép khách trả tiền trước bước của nhân viên.
