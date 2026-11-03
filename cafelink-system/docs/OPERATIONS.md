# CafeLink - Vận hành và chẩn đoán

Gateway/Core được khởi động và dừng bởi `WebMain`. Core giữ DB và nghiệp vụ; Gateway phục vụ Browser. [Chạy](RUNBOOK.md) · [Dữ liệu/TLS](DEPLOYMENT.md).

## Liveness và readiness

| Endpoint | Ý nghĩa |
|---|---|
| `GET /api/health` | Gateway đang trả lời HTTP; không suy Core/DB sẵn sàng |
| `GET /api/ready` | Gateway mở TCP probe tới Core, gửi HEALTH_CHECK, đọc metadata SQLite; 200 READY hoặc 503 NOT_READY |
| `GET /api/admin/diagnostics` | ADMIN xem probe và các bộ đếm/trace giới hạn |

Readiness có thời hạn chung 500 ms, cache một giây và gộp probe đồng thời. Phản hồi sai mã/lệnh, không đủ dữ liệu hoặc nhỏ giọt không được kéo dài vô hạn. Probe chỉ đọc, không tạo tài khoản/visit/cookie. Công khai trạng thái tổng quát, không trả SQL, đường dẫn DB hoặc credential.

```powershell
Invoke-RestMethod http://127.0.0.1:8088/api/health
Invoke-RestMethod http://127.0.0.1:8088/api/ready
```

## Màn hình chẩn đoán

Quản lý chọn **Chẩn đoán hệ thống**. Trang cập nhật mỗi 5 giây khi hiển thị; có nút làm mới. Khi rời trang, hủy polling/request. Khi tải lỗi, giữ dữ liệu gần nhất kèm cảnh báo/thời điểm; không trình bày như số mới.

- Kết nối: peer TCP, reader và giới hạn, outbound queue, lỗi đọc, số peer chậm bị ngắt; bridge/WS/lệnh web đang chờ.
- Xử lý: tổng yêu cầu/lỗi và thời gian dispatch Core. Lỗi quyền/dữ liệu cũng được đếm; không đồng nghĩa tiến trình hỏng.
- Tra cứu: tối đa 100 dòng gần nhất theo command ID/action/kết quả, không giữ payload/password/cookie/QR grant.
- JVM: heap/thread của cả Gateway và Core vì cùng tiến trình. Bộ đếm ở RAM bắt đầu lại sau restart; DB nghiệp vụ vẫn giữ.

PING, HEALTH_CHECK và GET_DIAGNOSTICS không tự làm tăng các bộ đếm nghiệp vụ. Thời gian dispatch chưa gồm mạng, enqueue, snapshot hoặc render. `OK` tại Core chưa chứng minh Browser nhận được response. Endpoint chẩn đoán yêu cầu ADMIN ở cả Gateway/Core, dùng `Cache-Control: no-store`.

## Kết nối và phiên

NetworkClient có reader riêng, khóa ghi frame, request timeout và heartbeat. Socket lỗi làm các future chờ thất bại; kết quả mutation có thể vẫn chưa rõ. Browser nối lại kênh state, đọc lại phiên và đối chiếu journal trước khi gửi lại.

Core không chờ socket chậm trong khóa nghiệp vụ; writer lấy message từ queue hữu hạn. Queue đầy đóng peer chậm. Đóng socket không tự đóng visit hoặc hủy đơn đã trả. Snapshot và feed thông báo không thay receipt.

## Hạn thanh toán

Core dùng clock Server và đọc hạn bằng `Instant`. Giao dịch còn hạn khi thời điểm kiểm **nhỏ hơn** expiresAt; đúng hoặc sau hạn là hết hạn. Chỉ tái sử dụng giao dịch PENDING còn hạn. Lần hết hạn được đánh dấu trước khi tạo lần mới trong transaction; callback muộn không thay kết quả giao dịch mới.

Trạng thái thời gian trên điện thoại không cấp quyền PAID. Thanh toán/hoàn vẫn là giả lập.

## Âm thanh và thông báo

Bật âm bằng thao tác người dùng. Kích hoạt có thời hạn 2,5 giây, chặn bấm lặp trong lúc chờ, đóng context lỗi và cho thử lại. Khi Browser không cho phát, hiển thị cảnh báo chữ; polling không tự xóa cảnh báo đó. Đăng xuất/unmount hủy lượt kích hoạt và dọn context, kết quả đến muộn không bật lại component đã rời.

Âm thanh là hỗ trợ; hàng đợi và chữ vẫn hoạt động khi không có âm. Kiểm AudioContext tự động không chứng minh loa thật đã phát.

## Tình huống vận hành

| Sự cố | Hướng xử lý |
|---|---|
| READY trả 503 | Kiểm Core, DB, tài nguyên và log đã loại dữ liệu riêng |
| Khách chưa rõ đơn | Tra command ID/receipt; không tạo đơn mới thay thế |
| Khách quên rời | Xử lý hết đơn/hỗ trợ rồi kết thúc phiên tại bàn |
| Nhân viên bị khóa | Đăng nhập lại sau khi quản lý cấp quyền; phiên cũ không hồi sinh |
| Quán dừng nhận khách | Tạm ngưng QR/đơn mới theo mục đích, giữ nghĩa vụ cũ |
| Khởi động lỗi DB/schema | Dừng và đối chiếu đúng profile/runtime; giữ bản sao lưu |

Các test liên quan: `ReadinessIntegrationTest`, `DiagnosticsIntegrationTest`, `PaymentDeadlineTest`, `web/tests/diagnostics.spec.ts`, `audio.spec.ts` và `automatic.spec.ts`. [Kiểm thử](TESTING.md).
