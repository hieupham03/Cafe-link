# CafeLink — Hệ thống gọi món và điều phối phục vụ theo mô hình Client/Server

**Báo cáo kỹ thuật môn Lập trình mạng. Mốc phần mềm V9.3, schema 11.** Chuẩn bị cho hạn 31/10/2026; số liệu đo ngày 25/10/2026. Thông tin nhóm/lớp/giảng viên và phân công chưa được cung cấp, cần bổ sung trước nộp. Điện thoại do người dùng kiểm sau; Compilatio chưa có kết quả.

## Tóm tắt — Abstract

Gián đoạn kết nối trong hệ thống gọi món làm khách khó phân biệt yêu cầu chưa tới quán với yêu cầu đã được nhận nhưng mất phản hồi. Gửi lại không phân biệt có thể đặt đơn ngoài ý muốn; một lời gọi hỗ trợ ngắn hạn cũng có thể không còn cần thiết khi kết nối trở lại. CafeLink triển khai website khách/quầy, Java HTTP/WebSocket Gateway, TCP Core dùng frame JSON có tiền tố độ dài và SQLite. Client ghi ý định vào IndexedDB trước gửi; Core giữ receipt/fingerprint cùng transaction nghiệp vụ. Giải pháp đề xuất đối chiếu kết quả theo loại yêu cầu và phạm vi phiên, kết hợp dấu bỏ bền để ngăn lệnh cũ đến muộn. Bản V9.3 đạt 142 kiểm thử Java và 65 ca Chromium; gói chạy sẵn đạt 21 nhóm kiểm. Thực nghiệm bản cuối gồm 120 ca phục hồi và 12 lượt tải, hoàn tất {{MEASURED_FLOWS}}/{{OFFERED_SLOTS}} slot gọi món/thanh toán, với {{MISSED_SLOTS}} slot lỡ được giữ trong kết quả. Contribution là thiết kế và đánh giá tích hợp theo workflow, không phải phát minh thuật toán idempotency hoặc TCP mới.

**Từ khóa — Keywords:** TCP Socket; Client/Server; semantic recovery; idempotency; session fencing; QR ordering.

## 1. Giới thiệu

Quán café cần nhận món đúng người, truyền yêu cầu tới quầy, cập nhật tiến độ và xử lý thanh toán mà không yêu cầu nhân viên liên tục mở/đóng bàn. Một bàn có thể có nhiều khách dùng điện thoại riêng; cùng địa chỉ giao đồ không đồng nghĩa cùng quyền truy cập đơn. Ngoài đường đi bình thường, hệ thống phải giải quyết kết quả chưa rõ khi Client mất kết nối, thao tác lặp, giá menu thay đổi và yêu cầu cũ đến sau khi lượt phục vụ đã hoàn tất.

CafeLink chọn phạm vi một quán nhỏ, sáu bàn và tám đồ uống mẫu. Nghiệp vụ chính là QR cố định → phiên riêng → giỏ hàng → trả trước giả lập → pha chế/phục vụ; hỗ trợ tại bàn là luồng độc lập. Trọng tâm môn học nằm ở thiết kế giao tiếp và tính nhất quán qua mạng. Website phục vụ khả năng tiếp cận, còn Gateway vẫn chuyển nghiệp vụ qua TCP Core để framing, quản lý connection và xử lý nhiều Client thể hiện trực tiếp trong source.

Hai câu hỏi đánh giá là: (RQ1) khi chưa rõ kết quả, quyết định theo loại yêu cầu và barrier bền có giảm tác dụng ngoài ý muốn so với replay/review thông thường trong các kịch bản đã định nghĩa không; (RQ2) hệ thống hoạt động thế nào dưới workload gọi món/thanh toán nhiều Client trên một máy? Báo cáo trả lời bằng oracle DB, raw log, bảng và biểu đồ, không suy từ giao diện đẹp hoặc số lượng chức năng.

## 2. Kiến thức nền và công trình liên quan

### 2.1. TCP, HTTP và WebSocket

TCP cung cấp luồng byte tin cậy có thứ tự; ứng dụng vẫn phải xác định ranh giới message [1]. Vì vậy CafeLink đọc đủ header/body theo độ dài và không coi một lần read là một JSON hoàn chỉnh. HTTP dùng cho thao tác request/response, còn WebSocket hỗ trợ giao tiếp hai chiều sau handshake [2,3]. Sự tin cậy ở tầng vận chuyển không cho Client kết luận transaction đã commit khi response ứng dụng không nhận được.

### 2.2. Idempotency và lưu trữ bền

Idempotency key đã được sử dụng trong API thực tế: Square mô tả retry cùng key để tránh thu tiền hai lần và từ chối một số trường hợp dùng lại key với nội dung khác [4]. Do đó chống lặp bằng ID không được coi là thuật toán mới của nhóm. CafeLink đặt thêm câu hỏi ở tầng nghiệp vụ: nếu một ý định chưa được nhận, có nên tự gửi lại khi nhu cầu đã thay đổi?

IndexedDB cung cấp giao dịch và kho dữ liệu trên browser [5]; SQLite cung cấp transaction/WAL cho trạng thái Server [6]. CafeLink dùng hai lớp cho hai mục đích khác nhau: journal giữ ý định chưa rõ tại Client, còn receipt trong transaction Core là căn cứ cho kết quả đã nhận. Không có distributed transaction nguyên tử bao trùm browser và Server; quy trình đối chiếu xử lý khoảng không chắc chắn giữa hai nơi.

### 2.3. Phạm vi so sánh và đóng góp được chọn

Baseline trong thí nghiệm là ba chính sách trên cùng mã Core, guard quyền, idempotency và cơ chế lưu bền. Đây là đối chứng chức năng có kiểm soát, không phải phép đo cạnh tranh với POS thương mại. Tài liệu Square cho thấy các kỹ thuật nền đã phổ biến; báo cáo không khẳng định các hệ thống đang vận hành đều thiếu cơ chế của CafeLink. Điểm đóng góp được giới hạn ở cách kết hợp quyết định phục hồi theo ngữ nghĩa với barrier/phạm vi phiên và đánh giá tác dụng của chúng trong workflow QR café cụ thể.

## 3. Định nghĩa bài toán

### 3.1. Tác nhân, đầu vào và đầu ra

| Tác nhân | Đầu vào chính | Đầu ra mong đợi |
|---|---|---|
| Khách | QR, lựa chọn món/số lượng/ghi chú, quyết định trả thử, lời nhắn | Giỏ đúng, một kết quả cho mỗi ý định đã nhận, tiến độ/receipt đúng quyền |
| Quản lý/quầy | Tài khoản, danh mục/ảnh, cập nhật pha chế/giao, hỗ trợ, từ chối/hoàn | Hàng đợi đúng, audit và lịch sử tiền/đơn nhất quán |
| Server | Message từ nhiều connection, command ID, scope, version | Xác thực, quyết định trạng thái, transaction, response/event |

Mỗi điện thoại/browser profile có membership/private visit riêng. QR cố định xác định bàn và quyền gia nhập; QR không chứng minh khách đang hiện diện vật lý. Tab trong cùng profile có thể chung cookie/journal; không coi hai tab thường là hai khách độc lập.

### 3.2. Ràng buộc và giả định

Giá là số nguyên VND do Server tính; menu/purchase version phát hiện thay đổi trước nhận đơn. Mỗi dòng có ghi chú riêng, tối đa 20 dòng và tổng tối đa 20 phần/menu ID. Lời gọi hỗ trợ OPEN cùng loại trong một visit được giới hạn bằng nghiệp vụ; bổ sung/rút dùng version và lịch sử. Đơn PAID không tự hủy chỉ vì browser offline.

Đây là triển khai một quán, DB cục bộ, không có tồn kho nguyên liệu, topping/size có phụ thu, kế toán hoặc nhiều chi nhánh. Thanh toán/hoàn tiền là LOCAL_SIMULATOR; kết quả thử không xác nhận tiền ngân hàng. Trong hai kịch bản lời gọi cũ, nhu cầu được **quy định đã hết** sau gián đoạn; đây là giả định thí nghiệm, không phải dữ liệu khảo sát khách.

### 3.3. Các bất biến cần kiểm

1. Cùng principal/command ID và fingerprint đã nhận không tạo thêm order/ticket/khoản thu khi retry.
2. Cùng ID nhưng payload khác bị từ chối; hai ID khác có thể là hai lần mua có chủ đích.
3. Ý định thuộc scope cũ không được tự chuyển quyền sang visit mới.
4. Accept và discard có thứ tự nhất quán: accept thắng giữ kết quả đã nhận; discard thắng chặn tác dụng của lệnh đến muộn.
5. PAID khác SERVED; đọc thông báo khác xử lý công việc; giỏ nháp khác đơn đã gửi.

## 4. Giải pháp đề xuất

### 4.1. Journal trước gửi và đối chiếu receipt

Client hoàn tất transaction lưu ý định vào IndexedDB trước khi phát mutation. Bản ghi gồm ID, action, scope, payload/fingerprint, revision giỏ và trạng thái. Nếu không ghi được journal thì không gửi với cam kết phục hồi không có cơ sở. Timeout/kết nối lỗi giữ trạng thái chưa rõ; Client không tạo command mới chỉ để thử lại ý định cũ.

Khi nối lại, Client xác thực cùng quyền và tra receipt. Kết quả đã nhận phải khớp action/fingerprint trước khi áp vào UI. Giỏ chỉ được dọn nếu revision phù hợp, tránh xóa nháp mới ở tab khác. Các yêu cầu chưa rõ không bị tự prune hoặc dọn khi chỉ muốn có giao diện sạch.

### 4.2. Phục hồi theo ngữ nghĩa

| Trường hợp | SEMANTIC quyết định | Lý do nghiệp vụ |
|---|---|---|
| Core đã nhận | Lấy lại kết quả cũ | Không bắt khách đặt/thu tiền lại do mất response |
| Đơn chưa nhận, scope còn phù hợp | Chờ xác nhận hoặc bỏ | Quyết định mua cần còn hiệu lực |
| Lời gọi/bổ sung ngắn hạn chưa nhận | Bỏ ý định cũ | Khách còn cần thì phát nhu cầu mới |
| Scope cũ đã kết thúc | Không tự chuyển lệnh, bỏ theo policy | Cùng bàn không đồng nghĩa cùng lượt/quyền |
| Kết quả không khớp | Khóa tự xử lý, nhờ đối chiếu | Không đoán hoặc sửa payload đã gửi |

### 4.3. Barrier bền và quan hệ với phiên

Tra outcome thấy chưa có không đủ ngăn lệnh cũ tới sau. DISCARD_COMMAND dùng cùng kiểm tra ID/fingerprint và ranh giới transaction với accept. Nếu chưa nhận, Core ghi dấu bỏ bền; lệnh gốc đến muộn bị chặn. Nếu đã nhận, Core trả receipt hiện có; không biến discard thành rollback một công việc đã xảy ra.

Scope store/visit/membership được kiểm từ quyền đã cấp. Continuation chỉ chuyển giỏ nháp có kiểm soát và liên kết lịch sử riêng; command đã gửi vẫn thuộc scope cũ. Cơ chế này ứng dụng versioning/tombstone/fencing đã biết, không tuyên bố là một thuật toán đồng thuận hay đảm bảo exactly-once delivery.

![Hình 1. Mất phản hồi sau commit và đối chiếu lại đúng receipt](assets/cafelink-final/recovery-sequence.png)

## 5. Kiến trúc hệ thống

![Hình 2. Browser, Gateway, TCP Core và lưu trữ của CafeLink](assets/cafelink-final/architecture.png)

Browser khách/quản lý dùng HTTP/HTTPS cho API và WebSocket/WSS cho snapshot. `WebGateway` phục vụ assets/media, kiểm cookie/Origin/CSRF; `SessionBridge` gắn identity web với TCP Client. `CafeServer` nhận frame và chuyển `CafeService`; Core kiểm quyền, giá, scope, state/version rồi thao tác SQLite. Gateway không sửa tắt DB order/payment để bỏ qua TCP.

Core có pool tối đa 64 reader và outbound queue giới hạn 64 message/peer. I/O ghi socket được tách khỏi vùng đồng bộ DB; một Client chậm không được giữ khóa service trong lúc ghi bytes. Gateway có tối đa 32 bridge, guest tối đa 30 và admin tối đa 16 cùng chia sẻ tổng 32. Thu hồi LRU guest nhàn rỗi không xóa credential/receipt; request lease, WS và flight đang hoạt động không bị thu hồi tùy ý.

Ở public demo, Quick Tunnel tạo HTTPS phía trước Gateway loopback. Core vẫn bind loopback. Cloudflare mô tả Quick Tunnel là công cụ thử nghiệm/phát triển [7]; báo cáo không coi nó là bằng chứng uptime production. Đổi hostname tạo origin browser mới, nên cookie/IndexedDB không tự chuyển giữa các lần tunnel đổi địa chỉ.

## 6. Thiết kế giao tiếp mạng

### 6.1. Frame và message

TCP frame gồm bốn byte big-endian biểu diễn số byte body, theo sau là UTF-8 JSON. Kích thước hợp lệ 1–262144 byte. Decoder đọc đủ dữ liệu, kiểm UTF-8/JSON/kind/version/action, đóng peer malformed hợp lý mà không dừng toàn Server. Không sử dụng Java object deserialization.

```json
{"version":1,"kind":"REQUEST","requestId":"demo-intent-001",
 "action":"PLACE_ORDER","ok":true,
 "data":{"visitId":"demo-visit","items":[{"menuId":2,"quantity":1,
 "expectedPurchaseVersion":1,"expectedPriceVnd":30000,"note":"Ít đá"}]}}
```

Ví dụ chỉ minh họa format, không phải request/credential thật. RESPONSE giữ correlation ID/action; lỗi có mã và thông điệp. EVENT STATE_UPDATED mang snapshot/revision. HTTP command dùng commandId/action/data/scope và Gateway chuyển ID tương ứng sang Core; retry không tự tạo ID mới.

### 6.2. Kết nối, push và lỗi

WebSocket snapshot được lọc quyền; Client bỏ revision cũ. Feed thông báo lưu bền và đọc theo cursor riêng, nên việc đọc thông báo không hoàn tất order/ticket. Reconnect kênh đọc chỉ thiết lập lại session/state, không tự gửi PLACE_ORDER mới.

Các lỗi auth/quyền, rate limit, sai scope, version cũ, menu đổi và kết quả command không khớp có mã riêng. Gateway trả HTTP phù hợp, UI giải thích/giữ ý định cần đối chiếu. Lỗi mạng không được đổi thành receipt thành công. API JSON giới hạn 64 KiB; ảnh menu là bytes HTTP tối đa 2 MiB, được kiểm và re-encode riêng, không đẩy ảnh vào frame TCP.

Đăng nhập admin dùng hash mật khẩu/salt; QR guest đổi thành quyền membership. Cookie HttpOnly, SameSite; public thêm Secure và kiểm Origin/CSRF. Mật khẩu public được tạo khi chạy và không đặt vào process arguments. Đây là các cơ chế đã có test, không thay một cuộc kiểm toán an toàn production.

## 7. Triển khai

| Thành phần | Tệp/module tiêu biểu | Trách nhiệm |
|---|---|---|
| Protocol | `FrameCodec`, `Message`, `Commands`, `Models` | Framing, dữ liệu, phân loại mutation và correlation |
| TCP/DB | `CafeServer`, `CafeService`, `Database` | Nhiều connection, đồng bộ trạng thái, transaction/schema |
| QR/phiên | `QrAccess`, `TableOrdering` | Quyền gia nhập, private visit, auto complete, continuation |
| Món/tiền/hỗ trợ | `MenuCatalog`, `OrderPayments`, `OrderResolutions`, `SupportActions` | Version mua hàng, thanh toán/hoàn giả lập, ticket version/audit |
| Gateway | `WebGateway`, `SessionBridge` | API/WS, bridge/lease, proxy, media |
| Browser | `journal`, `orderRecovery`, `GuestWorkspace`, `staffJournal` | Write-before-send, phục hồi, giữ giỏ và thao tác tiền của quầy |
| Kiểm chứng | `web/experiments`, `web_oracle.py`, `analyze_web.py` | Fault có kiểm soát, policy comparison, tải và oracle read-only |

SQLite schema 11 dùng order_items theo `(order_id,line_no)` để hai phần cùng món khác ghi chú không bị gộp sai. Edit version của menu tăng cho mọi thay đổi quản lý; purchase version chỉ tăng khi thay đổi tên/giá/trạng thái bán ảnh hưởng xác nhận mua. Thay ảnh/mô tả trình bày không khóa giỏ không cần thiết; đổi công thức cần đổi món/tên có chủ đích, không tự coi ghi chú là engine topping/phụ thu.

Đơn chưa trả có thể hủy theo guard; đơn PAID chưa pha chế có thể bị quầy từ chối/hoàn giả lập với lý do và actor, giữ receipt gốc. Không hứa hoàn tự động đơn đã pha chế hoặc ngân hàng thật. Hỗ trợ OPEN có thể bổ sung/rút bằng version; quầy xử lý phiên bản cũ bị chặn thay vì bỏ sót nội dung mới.

V9.3 chia màn khách thành năm ô và vùng rõ ràng, giữ các anchor/state để điều hướng không mất giỏ. Chuông lưu lựa chọn nhưng sau reload vẫn cần thao tác người dùng kích hoạt audio. Bảng điều khiển phân biệt dừng nhận đơn mới toàn quán với dừng khách QR từng bàn; nghĩa vụ đã nhận tiếp tục được xử lý.

![Hình 3. Năm ô chức năng trên màn hình nhỏ; ảnh Chromium, chưa thay nghiệm thu điện thoại](assets/cafelink-final/guest-navigation.png)

![Hình 4. Giỏ hàng là vùng riêng, ghi chú và tạm tính trước khi gửi](assets/cafelink-final/guest-cart.png)

## 8. Thiết lập thực nghiệm

### 8.1. Môi trường và định danh

{{ENVIRONMENT_TABLE}}

JAR SHA-256: `{{JAR_SHA}}`. Manifest production: `{{WEB_SHA}}`. Manifest experiment: `{{EXPERIMENT_SHA}}`. JAR/production khớp mốc V9.3 đóng gói. Mode experiment build từ cùng source, thêm harness vào assets riêng; runtime chính không phục vụ experiment.html. Đây là workload React/API/journal thật với Core/SQLite thật, không phải ba mock tạo số liệu theo mong muốn.

### 8.2. Policy và kịch bản

R0 REPLAY_ALL gửi lại cùng ID/payload chưa rõ. R1 REVIEW tra receipt rồi chờ khách với ý định chưa nhận, không tự đặt discard barrier. R2 SEMANTIC tra receipt và xử lý theo ngữ nghĩa/scope. **Cả ba cùng có idempotency, fingerprint, xác thực và guard phiên**, tránh baseline yếu giả tạo.

| Kịch bản | Ranh giới lỗi/lịch | Oracle |
|---|---|---|
| NORMAL_ORDER | Không lỗi | Một đơn đúng |
| LOST_ORDER_ACK | Forward thành công, bỏ response sau commit | Một đơn, lấy receipt cũ |
| UNACCEPTED_ORDER | Abort trước forward | R0 tự gửi; R1/R2 chưa đặt trước xác nhận |
| UNACCEPTED_SERVICE | Chưa nhận, quy định nhu cầu đã hết | Đếm ticket ngoài nhu cầu đã quy định |
| LOST_SERVICE_ACK_HANDLED | Đã nhận, mất response, quầy xử lý | Một ticket đã xử lý, không sinh lại |
| VISIT_ENDED | Lượt cũ đóng, khách khác quét cùng QR | Không tác dụng sang visit mới |
| DISCARD_WINS_LATE_SERVICE | Đối chiếu/bỏ trước khi giao lệnh cũ | R2 có barrier, lệnh cũ không tạo ticket |
| ACCEPT_WINS_LATE_SERVICE | Accept/xử lý trước đối chiếu | Không discard ngược kết quả đã nhận |

Tám ca × ba policy × năm lần = 120 ca, shuffle seed 20261023; mỗi ca context/private visit mới, mỗi 12 ca đổi fixture để giữ rate limit production. Fault là HTTP trước forward hoặc sau application response thành công, không phải đánh rơi gói TCP. Hai lịch late command là các thứ tự có kiểm soát, không bao quát mọi scheduler.

### 8.3. Workload tải và chỉ số

Tải chọn 1/5/10/14 guest và một admin, mỗi mức ba lượt, warmup 3 giây rồi đo 15 giây. Giới hạn guest thật vẫn 30, không nâng để chạy test; 14 chỉ là mức workload đã chọn. Trước warmup, driver chờ nút gọi món enabled như Client thật. Không retry lỗi trong cửa sổ đo để che thất bại. Mỗi guest tuần tự tối đa một flow/giây; lỡ slot được ghi thay vì chồng request để làm đẹp throughput.

Một flow chọn cà phê sữa 30.000đ, ghi journal, đặt món, nhận receipt, phát hiện DOM và thanh toán giả lập thành công. Đơn PAID giữ ở SUBMITTED trong khi đo để visit chưa tự đóng. Oracle SQLite mở read-only, đếm order/payment/tổng tiền cả warmup, không sửa DB để tạo ACK.

`recoveryMs` là thời gian phân loại/đối chiếu tới state/journal, không gồm chờ người xác nhận. `responseMs` gồm session/state, IndexedDB và phản hồi đặt món; không gọi là độ trễ TCP. `renderMs` phát hiện DOM sau khi biết ID từ receipt, là cận trên nếu push/render đã tới trước; không đo chính xác commit→WSS render. Throughput chia flow hoàn tất cho cửa sổ thực; p50/p95 dùng nearest rank, không biến thiếu mẫu thành 0. HTTP byte là body đã giải mã, không gồm header/TCP/TLS/WS/retransmission.

## 9. Kết quả

### 9.1. Kiểm thử chức năng và gói

| Lớp kiểm | Kết quả ghi nhận | Phạm vi |
|---|---|---|
| Java V9.3 | 142 PASS, 0 failure/error/skip | Core/Gateway/TCP/SQLite/migration và hồi quy desktop |
| Chromium V9.3 | 65 PASS, 0 unexpected/flaky/skip | UI thật, QR, năm vùng, journal/recovery, tiền/hỗ trợ/continuation |
| Gói pristine JRE 17 | 21 nhóm PASS | Không dùng JDK/Node trong PATH app con, integrity, dữ liệu, QR/phiên, nghiệp vụ |
| Bộ phân tích | 3 test PASS | Percentile, mẫu không hợp lệ, không đổi run thiếu/lỗi thành PASS |
| Barrier khởi động driver | PASS | Driver cũ bị khóa; driver mới đợi UI sẵn sàng rồi thực hiện đúng một đơn PAID |
| Source sạch | 142 Java + 65 Chromium PASS | Thư mục có khoảng trắng; frontend và bytecode khớp V9.3 đã đóng gói |
| Public Chromium bản chốt | 7 kiểm PASS, launcher dừng sạch | HTTPS/WSS/QR/private orders/payment; không thay nghiệm thu điện thoại |

Gate chi tiết: [Java/Chromium](evidence/cafelink-v2/v9.3-gate/20261025-184703-1bdff3d4/summary.json), [gói chạy sẵn](evidence/cafelink-v2/v9.3-package/20261025-release-01/summary.json), [source sạch](evidence/cafelink-final/source-clean/source-proof.json), [public bản chốt](evidence/cafelink-final/public-final/public-package.json), [readiness regression](evidence/cafelink-final/readiness-check/readiness.json). Nhóm sẽ nghiệm thu điện thoại sau; chưa có kết quả Compilatio hoặc remote CI.

### 9.2. So sánh phục hồi

{{POLICY_TABLE}}

Mỗi policy có 40 ca trong đúng tập kịch bản trên. Không có đơn trùng/sai lượt dưới cả ba policy trong các ca đã xét, vì các guard nền được giữ chung. R0 tự tạo {{R0_UNCONFIRMED}} đơn chưa được xác nhận lại; R2 giữ quyết định đó cho khách. Với giả định nhu cầu hỗ trợ đã hết, R0/R1/R2 lần lượt có {{R0_SERVICE}}/{{R1_SERVICE}}/{{R2_SERVICE}} tác dụng lời gọi. Các ca discard thắng lệnh muộn giúp phân biệt R2 với review không có barrier.

![Hình 5. Tác dụng ngoài ý muốn trong kịch bản kiểm soát và p95 tải theo từng lượt](assets/cafelink-final/results.png)

### 9.3. Tải gọi món/thanh toán

{{LOAD_TABLE}}

Tổng {{MEASURED_FLOWS}} flow hoàn tất trên {{OFFERED_SLOTS}} slot được cấp trong cửa sổ đo; {{MISSED_SLOTS}} slot lỡ, {{FLOW_ERRORS}} flow báo lỗi. Có {{HTTP_SAMPLES}} mẫu HTTP và {{HTTP_ERRORS}} HTTP error trong phần tải được phân tích; không đồng nhất số HTTP sample với số thao tác khách/TCP frame. Tổng body HTTP giải mã {{HTTP_BYTES}} byte không phải băng thông trên dây.

Oracle kiểm cả warmup: {{TOTAL_ORDERS}} order và {{TOTAL_PAYMENTS}} payment PAID, tổng {{TOTAL_VND}}đ giả lập. Đây không phải doanh thu quán thật. Giữ từng lượt đo và p95 của từng lượt, không gộp ba lần thành một mức độ tin cậy thống kê hoặc kết luận công suất tối đa.

Raw và kết quả: [summary](evidence/cafelink-final/20261025-final-r2/summary.json), [analysis](evidence/cafelink-final/20261025-final-r2/analysis.json), [policy CSV](evidence/cafelink-final/20261025-final-r2/policy-summary.csv), [load CSV](evidence/cafelink-final/20261025-final-r2/load-summary.csv), [environment/hash](evidence/cafelink-final/20261025-final-r2/environment.json).

## 10. Thảo luận

Giá trị của SEMANTIC nằm ở phân biệt kết quả đã nhận với ý định chưa được nhận và còn phù hợp hay không. Một ID lặp đã có receipt không cần khách mua lại; một đơn chưa nhận lại liên quan quyết định chi tiền nên không tự gửi; một lời gọi ngắn hạn đã hết nhu cầu trong kịch bản có thể được bỏ. Barrier xử lý khoảng hở mà một lookup đơn lẻ không giải quyết: lệnh cũ vẫn có thể được giao sau lookup.

Kết quả không có nghĩa R2 tốt hơn mọi policy ở mọi tiêu chí. Có thêm lookup/discard/transaction và chi phí đối chiếu; p95 được trình bày công khai. REVIEW có thể thích hợp khi cần giữ mọi nhu cầu để con người quyết định, còn SEMANTIC cần quy tắc nghiệp vụ chấp nhận bỏ lời gọi chưa nhận. Nếu khách vẫn cần, khách gọi mới; hệ thống không tự suy nhu cầu thật từ thời gian mất mạng.

Tải là workload định sẵn trên host chia sẻ CPU/browser/Server, không phải thử tìm bão hòa hoặc 14 điện thoại qua Internet. Thay đổi UI, trạng thái máy và công cụ đo đều có thể ảnh hưởng độ trễ. Vì vậy không dùng khác biệt giữa V8 và lần này để khẳng định một tối ưu đã gây ra cải thiện hiệu năng. Chưa có profiling CPU/GC/queue hoặc đối chứng tách từng thành phần.

Lượt đầy đủ đầu tiên có một case warmup FAIL vì driver bắt đầu khi UI đang đối chiếu journal; raw vẫn được giữ ở [lượt trước sửa driver](evidence/cafelink-final/20261025-full/summary.json). Regression giữ Web Lock có kiểm soát chứng minh driver cũ bị chặn, driver mới chờ điều kiện sẵn sàng; sau đó chạy mới toàn campaign. Không sửa bản FAIL thành PASS hoặc bỏ một mẫu trong cùng run để lấy số đẹp.

## 11. Novelty và contributions

| Contribution | Phần nhóm thực hiện | Bằng chứng và giới hạn |
|---|---|---|
| C1. Phục hồi theo loại yêu cầu | Journal trước gửi, lookup, giữ xác nhận cho đơn chưa nhận và bỏ lời gọi ngắn hạn chưa nhận theo policy | So sánh R0/R1/R2, ca lost ACK/unaccepted; chỉ kết luận trong giả định/thí nghiệm, không gọi idempotency mới |
| C2. Barrier bền gắn phạm vi phiên | DISCARD tranh chấp cùng transaction với accept; scope store/visit/membership, không chuyển command sang lượt mới | Ca discard-wins/accept-wins/visit-ended; idempotency/scope vẫn được giữ ở baseline, không gán mọi lợi ích cho R2 |
| Giá trị tích hợp bổ trợ | QR/private visit, thanh toán/phục vụ tách trạng thái, ghi chú từng phần, audit và năm vùng UI | Java/E2E/package tests; đây là hoàn thiện hệ thống, không coi đổi màu/QR/UI đơn thuần là novelty |

Contribution của bài tập là một thiết kế có thể chạy và kiểm chứng trên baseline đủ mạnh, không phải tuyên bố thuật toán mới trên thế giới hoặc tính năng thương mại độc quyền. Các nguồn nền được trích dẫn; khảo sát dự án sinh viên trước đó không được dùng để suy luận mức phổ biến của toàn thị trường.

## 12. Hạn chế

Chưa nghiệm thu camera/Android/iOS/trình duyệt trong ứng dụng quét QR, LAN hai máy hoặc usability với khách/quầy thật; người dùng sẽ làm sau. Mobile viewport Chromium chỉ kiểm bố cục. Public smoke lịch sử và tunnel thử nghiệm không thay kiểm thiết bị hoặc uptime. QR chung không xác minh có mặt tại quán; browser mất cookie/storage cần đối chiếu, không lấy lại danh tính chỉ từ QR.

Thanh toán và hoàn tiền là giả lập, không có merchant/IPN/webhook ngân hàng. Không hỗ trợ đầy đủ giao từng ly/hoàn từng phần, kho/topping phụ thu, nhiều chi nhánh hoặc kế toán. Một trạng thái phục vụ cho toàn đơn đòi nhân viên chỉ bấm giao xong khi đã giao đủ.

Giới hạn tài nguyên/rate là guard demo, không phải SLA. Receipt/journal có ranh giới scope, storage/origin và cấu hình retention; không đảm bảo phục hồi dữ liệu đã bị người dùng xóa, hỏng phần cứng hoặc mất điện trong mọi môi trường. Các test không chứng minh không thể có lỗi mới. Source có CI cấu hình, nhưng chưa có remote run được xác nhận.

## 13. Hướng phát triển

Ưu tiên tiếp theo là nghiệm thu điện thoại/quầy thật và origin ổn định, quan sát CPU/GC/queue khi tăng tải, mở rộng kịch bản phục hồi dài hơn và kiểm phần cứng/mạng thật. Tích hợp ngân hàng cần thiết kế xác nhận giao dịch phía Server và đối soát trước khi coi là thanh toán thật. Tối ưu coalescing hoặc thay mô hình concurrency chỉ nên thực hiện khi có baseline/measurement chứng minh giá trị.

## 14. Kết luận

CafeLink hiện thực một hệ thống Client/Server có giao tiếp TCP rõ ràng bên dưới website QR, quản lý đồng thời kết nối và trạng thái nghiệp vụ, xử lý lỗi và phục hồi có journal/receipt. Bản V9.3 và gói chạy đã có kiểm thử tự động; thực nghiệm mới có 120 ca phục hồi, 12 lượt tải và {{MEASURED_FLOWS}} flow hoàn tất, giữ {{MISSED_SLOTS}} slot lỡ trong kết quả. Giá trị kiểm chứng được là quyết định phục hồi theo loại yêu cầu và barrier/phạm vi phiên ngăn tác dụng cũ không phù hợp trong các ca đã xét. Thiết bị thật, thông tin nhóm, Compilatio và nộp chính thức được giữ là các việc còn cần hoàn tất.

## 15. Tài liệu tham khảo

[1] W. Eddy (Ed.), *RFC 9293: Transmission Control Protocol*, IETF, 2022. [Bản RFC](https://www.rfc-editor.org/rfc/rfc9293.html).

[2] I. Fette, A. Melnikov, *RFC 6455: The WebSocket Protocol*, IETF, 2011. [Bản RFC](https://www.rfc-editor.org/rfc/rfc6455.html).

[3] R. Fielding, M. Nottingham, J. Reschke (Eds.), *RFC 9110: HTTP Semantics*, IETF, 2022. [Bản RFC](https://www.rfc-editor.org/rfc/rfc9110.html).

[4] Square Developer Documentation, *Idempotency*, truy cập 25/10/2026. [Tài liệu chính thức](https://developer.squareup.com/docs/build-basics/common-api-patterns/idempotency).

[5] W3C, *Indexed Database API 3.0*, Working Draft 13/08/2025, truy cập 25/10/2026; tài liệu đang phát triển. [Đặc tả](https://www.w3.org/TR/2025/WD-IndexedDB-3-20250813/).

[6] SQLite, *Write-Ahead Logging* và *Transaction*, truy cập 25/10/2026. [WAL](https://www.sqlite.org/wal.html), [transaction](https://www.sqlite.org/lang_transaction.html).

[7] Cloudflare Docs, *Quick Tunnels*, truy cập 25/10/2026. [Tài liệu chính thức](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

[8] Tài liệu học phần trong bộ source: `final-project/Instruction.md`, `Topics.md`, `Submission.md`; hạn ghi trong Submission: 23:59 ngày 31/10/2026. Khi quy định thay đổi cần đối chiếu thông báo chính thức của giảng viên.

## 16. Phụ lục

### A. Chạy và diễn tập bảo vệ

Giải nén gói, mở PowerShell trong Run/CafeLink-Web-V9.3, chạy Start-Local.ps1. Tài khoản local `admin / CafeLink@123`; public dùng URL HTTPS và mật khẩu tạm. Mở tất cả bàn, copy link QR nguyên vẹn sang InPrivate/browser độc lập. Năm ô trên màn khách chỉ điều hướng, không tự gửi lệnh mua/thu tiền. Hướng dẫn chi tiết: [runbook](../cafelink-system/docs/FINAL_RUNBOOK.md).

Kịch bản bảo vệ: giới thiệu bài toán và sơ đồ → hai khách cùng QR nhưng đơn riêng → gọi/trả/phục vụ/hỗ trợ → lost response sau commit lấy lại một đơn → lời gọi chưa nhận bị bỏ/barrier chặn đến muộn → trình bày bảng baseline và giới hạn. Không diễn Network Offline thông thường thành bằng chứng đã tạo đúng thời điểm sau commit.

### B. Tệp và khả năng chạy lại

Protocol đầy đủ: [FINAL_PROTOCOL](../cafelink-system/docs/FINAL_PROTOCOL.md); kiến trúc/module: [FINAL_ARCHITECTURE](../cafelink-system/docs/FINAL_ARCHITECTURE.md). Source dùng Maven target 17, Node theo package lock; gói Run có JRE 17. Schema/menu/tài khoản demo tự tạo; không cần DB server. Script test/experiment ghi run riêng và hash; private fixture DB/key/cookie không có trong evidence chia sẻ.

Theo yêu cầu môn học, mỗi thành viên cần giải thích được framing, correlation/receipt, quyền phiên, transaction, Web Locks, network flow, metric và phần code mình thực hiện. Nhóm có sử dụng AI hỗ trợ phát triển/diễn đạt; trách nhiệm kiểm source, dữ liệu, tài liệu tham khảo và nội dung báo cáo vẫn thuộc nhóm. Báo cáo không tự xác nhận mức đóng góp cá nhân khi chưa có thông tin phân công.

### C. Các việc phải chốt trước nộp

Điền số nhóm/lớp/MSSV/giảng viên/phân công; đổi `XX` trong tên file; kiểm điện thoại theo người dùng; kiểm Compilatio và lưu kết quả ≤20% theo hướng dẫn môn học; bảo đảm Source/Report đúng bản cuối khi bàn giao. [Trạng thái chuẩn bị nộp](SUBMISSION_READINESS.md) và manifest đi kèm tách rõ phần phần mềm đã kiểm với các bước chưa có bằng chứng. Không coi báo cáo kỹ thuật này là biên bản đã được giảng viên chấp thuận hoặc đã nộp thành công.
