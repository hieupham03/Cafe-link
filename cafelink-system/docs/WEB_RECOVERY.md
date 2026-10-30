# CafeLink V9.3 — giỏ món và phục hồi yêu cầu web

> Luồng chính hiện tại là QR cố định, phiên riêng và trả trước giả lập theo đơn. [Hướng dẫn demo](FINAL_RUNBOOK.md) và [protocol](FINAL_PROTOCOL.md) là tài liệu bản chốt. Receipt/giữ ID/DISCARD xử lý kết quả chưa rõ; chúng không thay cơ chế hủy hoặc hoàn tiền sau tiếp nhận.

Browser ghi ý định vào IndexedDB trước khi gửi. Khi mất phản hồi, Client tra kết quả bằng đúng mã cũ, rồi xử lý theo loại yêu cầu và phạm vi phiên. Các ví dụ thao tác dưới đây dùng luồng V9.3; POSTPAY cũ chỉ còn phục vụ tương thích và hồi quy.

## 1. Chạy và thao tác

Tại `D:\BTL-LTM\cafelink-system`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-web.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-web.ps1 -Port 8088 -TcpPort 5058 -DatabasePath data/local-demo/recovery-demo.db
```

1. Quản lý vào `http://127.0.0.1:8088/admin`, đăng nhập `admin` / `CafeLink@123`.
2. Bấm **Mở tất cả bàn** → chọn Bàn 1 → sao chép link đặt món từ màn QR. Mở nguyên link bằng browser/profile khác với quản lý → **Vào bàn của tôi**.
3. Khách chọn món, số lượng và ghi chú từng phần; kiểm vùng **Giỏ hàng** rồi gửi đơn một lần. Nếu lưu journal/giỏ lỗi, xử lý lỗi trước khi gửi; không bỏ qua bằng cách gửi từ RAM.
4. Khi hiện **Quán đã nhận đơn #…**, kiểm đơn trên web quản lý, chuyển qua quầy pha chế và các bước phục vụ như trước. Giá chính thức do Core tính; giỏ chỉ là tạm tính.
5. Tải lại trang: giữ đúng membership, giỏ và kết quả yêu cầu. Mở `/guest` trong tab thứ hai cùng hồ sơ: dùng chung giỏ; không tạo membership thứ hai.
6. Thanh toán giả lập cho đơn vừa đặt; quầy chỉ pha chế khi Server xác nhận đủ điều kiện tiền. Cần hỗ trợ thì mở vùng **Hỗ trợ**; mỗi phiên không sinh nhiều lời gọi OPEN cùng loại. Theo dõi tiến độ ở **Đơn đã gọi**.

Tạo database mới để diễn tập sạch mà không xóa dữ liệu cũ (dừng server đang chạy trước):

```powershell
$demoDb = 'data/local-demo/order-demo-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.db'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-web.ps1 -Port 8088 -TcpPort 5058 -DatabasePath $demoDb
```

**Database mới không xóa nhật ký trình duyệt.** Giải quyết yêu cầu cũ trước, rời phiên rồi dùng QR mới. Để diễn tập độc lập hoàn toàn, dùng hồ sơ trình duyệt mới. Không xóa cookie/site data để giả định yêu cầu chưa rõ đã bị hủy; Core có thể đã nhận đơn.

## 2. Khi mất kết nối

| Trạng thái | Website làm gì | Khách cần làm |
|---|---|---|
| Chưa gửi giỏ | Giữ giỏ đã lưu, khóa gửi khi mất mạng | Chờ nối lại; gửi khi muốn đặt |
| Đã gửi nhưng thiếu phản hồi | Giữ nguyên mã/nội dung; không kết luận thất bại | Nhấn **Đối chiếu yêu cầu** hoặc tải lại |
| Server đã nhận | GET_OUTCOME trả receipt; hiển thị số đơn và dọn giỏ tương ứng | Không cần gửi thêm |
| Server chưa nhận | Hiện lựa chọn xác nhận hoặc bỏ | **Xác nhận gửi lại** dùng đúng mã/nội dung cũ; **Bỏ yêu cầu chưa nhận** lập rào chặn lệnh đến muộn |
| Gửi bỏ nhưng mất phản hồi | Vẫn giữ yêu cầu chờ; chưa báo đã bỏ | Đối chiếu lại; Server có thể trả đơn đã nhận hoặc xác nhận đã bỏ |
| Lượt cũ đã đóng | Tra kết quả cũ; nếu chưa nhận thì lập rào chặn | Không chuyển giỏ/yêu cầu sang lượt mới |
| Quyền hết hạn/thu hồi hoặc nhật ký sai | Khóa gửi và giữ thông tin cần đối chiếu | Nhờ nhân viên kiểm đơn; không tự xin membership khác để gửi lại |

Kênh đọc tự nối lại với backoff/jitter trong cửa sổ 60 giây, có nút **Thử kết nối lại** khi dừng. Request đang chạy có timeout 8 giây; lần thử cuối có thể kết thúc sau cửa sổ. Online/foreground kiểm tra lại phiên và snapshot; không tự chạy PLACE_ORDER. Sau lỗi mà kênh WSS vẫn còn, dùng **Đối chiếu yêu cầu** để xử lý ngay.

Demo mất mạng bằng DevTools → Network → Offline → Online chỉ chứng minh thay đổi kết nối phía browser; không chứng minh mất ACK sau DB commit. Các ca khó bên dưới dùng fault injection có kiểm chứng tại ranh giới mạng/lưu trữ.

## 3. Hợp đồng kỹ thuật

### Nhật ký trước gửi

Database IndexedDB `cafelink-web-journal` v1 có stores `carts` và `commands`. Scope là bộ `(storeId, visitId, membershipId)`; cart có revision. Mỗi ý định lưu mã UUID, action, payload bất biến, SHA-256 fingerprint, scope, preview, thời điểm và trạng thái. Không lưu grant, token, password hay CSRF trong nhật ký.

PLACE_ORDER chỉ được gửi sau transaction lưu ý định **đã hoàn tất**. Lỗi quota/quyền ghi chặn mutation; không chuyển sang RAM rồi vẫn gửi. ACK tới nhưng ghi kết quả lỗi thì ý định vẫn chưa rõ, lần sau tra receipt. Chỉ dọn giỏ có revision khớp; không xóa giỏ mới ở tab khác. Giữ tối đa 200 kết quả đã giải quyết; không tự prune yêu cầu chưa rõ. Cart của scope cũ còn lưu cục bộ, không nhập sang scope mới.

Trạng thái: `PENDING → ACCEPTED / CONFIRM_REQUIRED / REJECTED`; xác nhận hoặc bỏ được đối chiếu trước rồi mới quyết định; bỏ thành công → `CANCELLED`; nội dung/kết quả không khớp → `BLOCKED`. Lỗi mạng/auth/DB không được coi là từ chối nghiệp vụ chắc chắn.

### Nhiều tab và quyền

Web Locks tuần tự hóa thao tác journal và gửi; không có fallback gửi không khóa. Reconcile có thể chờ khóa tối đa 10 giây; gửi/sửa/rời phiên đang bị tab khác giữ khóa sẽ báo chờ. IndexedDB transaction kiểm cart revision và mọi yêu cầu chưa giải quyết thêm lần nữa. BroadcastChannel và đọc lại mỗi 2 giây chỉ cập nhật UI, không quyết định chống trùng.

Yêu cầu chưa rõ ở bất kỳ scope nào khóa gửi mới/JOIN/rời phiên qua UI. Khi cookie đổi ngoài luồng ứng dụng, nhật ký cũ vẫn không được gửi bằng quyền mới. Mỗi lần phục hồi kiểm `/api/session`; Gateway bắt buộc so scope với identity thật cho PLACE_ORDER, GET_OUTCOME, DISCARD_COMMAND. Core tiếp tục quyết định quyền, trạng thái lượt, giá và receipt.

HTTP dùng cookie HttpOnly do trình duyệt tự gửi, Origin và `X-CSRF-Token`. Payload đặt món có giá/version kỳ vọng và ghi chú từng dòng; xem ví dụ đầy đủ trong [FINAL_PROTOCOL](FINAL_PROTOCOL.md).

Thiếu scope: `409 SCOPE_REQUIRED`; scope khác cookie: `409 SCOPE_CHANGED`. GET_OUTCOME có `data: {"commandId": "mã ý định"}`. DISCARD_COMMAND có `data: {"commandId": "mã ý định", "action": "PLACE_ORDER", "payload": {…nội dung gốc…}}`. Mã HTTP của lệnh đọc/bỏ khác mã ý định được đối chiếu. Các lệnh đi qua Gateway → NetworkClient → TCP Core thật; không ghi SQLite trực tiếp tại Gateway.

Fingerprint dùng JSON sắp khóa, giữ thứ tự mảng và escaping U+2028/U+2029 tương thích Gson, SHA-256 của `action + "\n" + canonical(payload)`. Mismatch khóa thay vì đoán kết quả. Receipt và mutation cùng transaction Core; DISCARD tạo tombstone nguyên tử nếu chưa nhận. Đây là ứng dụng cơ chế đã biết vào bài toán phục hồi, không phải bảo đảm exactly-once cho mạng.

## 4. Kiểm thử tái lập

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-web.ps1 -Phase V9.4
```

Runner tạo fixture DB/server riêng trên cổng 18080/18081, không chiếm/dừng demo đang chạy. Giữ hai cổng test trống trước khi chạy. Bản V9.4/RC4 có 164 Java + 71 Chromium PASS; xem [phạm vi kiểm thử](TESTING.md), [phiếu kiểm cuối](../../report/evidence/cafelink-v2/pre-feature-20261030/final-verification.json) và [báo cáo hiện tại](../../report/README.md).

Chạy riêng các ca phục hồi sau khi đã build:

```powershell
cd web
npx.cmd playwright test tests/orders.spec.ts
```

Playwright chuyển request đến Core thật rồi làm mất phản hồi, hoặc chặn request trước khi Core nhận. Ca quota gây lỗi tại API IndexedDB của browser. Kết quả được kiểm với state Server thật; không giả lập phần xử lý đơn. Bộ test có cả reload, hai tab, bỏ yêu cầu mất ACK, đóng/mở lượt và reconnect dừng retry.

## 5. Giới hạn đã công bố

- Cần secure context cho Web Locks/Web Crypto: localhost phục vụ demo một máy; điện thoại qua LAN phải HTTPS được tin cậy theo [runbook](FINAL_RUNBOOK.md). Nhóm đã xác nhận kiểm thao tác thực tế; kết quả tự động vẫn phân biệt Chromium/viewport mobile với thiết bị thật, không suy rộng sang mọi trình duyệt hoặc private mode.
- IndexedDB có quota và có thể bị eviction/xóa site data; private browsing có thể xóa khi kết thúc phiên. `durability: strict` yêu cầu mức bền vững cao hơn nhưng không chứng minh khả năng sống sót mọi sự cố OS/nguồn điện. Xem [MDN quotas/eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [IDBTransaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction).
- Web Locks là khóa trong phạm vi origin/hồ sơ, không khóa mọi điện thoại. Chống gửi trùng cùng mã vẫn do receipt Core; các thiết bị chủ động tạo hai ý định khác nhau được coi là hai đơn riêng. Xem [MDN Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).
- Kênh state WSS là snapshot mới nhất; notification feed/read cursor là dữ liệu riêng, không thay receipt hay hàng đợi nghiệp vụ. Có menu ảnh/version và thanh toán giả lập; chưa có ngân hàng thật hoặc cam kết offline ordering toàn phần.
- Unknown intent của quyền đã hết hạn/thu hồi cần đối chiếu thủ công tại quán. Không có nút “xóa nhật ký để gửi lại”. Sau khi mất nhật ký cục bộ, không hứa tái dựng mọi ý định chưa từng đến Server.
# Bổ sung V9.2

AMEND_SERVICE bổ sung ticket theo expectedVersion; CANCEL_SERVICE rút ticket đang mở. Cả hai được ghi journal trước gửi và tra receipt khi mất ACK. AMEND_SERVICE chưa được nhận được bỏ theo SEMANTIC; nhu cầu còn thì khách bổ sung lại. CANCEL_SERVICE chưa nhận cần khách xác nhận/bỏ, không tự replay. Không sửa payload của command ID đã phát. Lệnh version cũ bị từ chối, kết quả đã nhận luôn được lookup trước khi đánh giá phiên hiện tại.

Nhân viên có Tra cứu hỗ trợ bằng command ID đầy đủ hoặc số đơn. Đây là tra cứu chỉ đọc; không cấp lại quyền browser hoặc tự làm lại giao dịch. Chi tiết [bản hiện tại V9.3](WEB_V9_3.md).

