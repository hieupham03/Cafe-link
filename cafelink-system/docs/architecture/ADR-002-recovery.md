# ADR-002: Phục hồi lệnh và quyền theo lượt bàn

Ngày quyết định: 20/10/2026. Trạng thái: được chọn để triển khai tuần 2.

## Bối cảnh

Một quán, client Swing trên thiết bị bàn, TCP LAN, thời hạn ba tuần. Mất phản hồi sau commit gây outcome chưa rõ; shared table account không đủ tách khách cũ/mới. Không mở rộng nghiệp vụ hoặc thay transport.

## Phương án và quyết định

- Chỉ gửi lại theo ID: đơn giản nhưng không giải quyết yêu cầu phục vụ đã cũ.
- TTL/grant cho mọi thao tác: kiểm soát thời gian rõ hơn nhưng thêm handshake và cần chính sách thời gian thực tế.
- **Chọn:** receipt cùng transaction, outbox cục bộ, lookup trước replay; đơn chưa nhận cần người dùng xác nhận; lời gọi phục vụ chưa nhận cũng cần xác nhận rõ, không tự gửi. Credential opaque gắn một lượt, không tự chuyển lượt khi bàn mở lại. Không claim expiry theo đồng hồ/TTL.

RPC correlation ID cũng là command ID cho mutation; lookup sử dụng RPC mới. Receipt thành công được lưu bền vững; lỗi xác định không được lưu thành success. Fingerprint gồm action và JSON canonical theo thứ tự key (array giữ thứ tự). Không xóa receipt trong bản demo để tránh mở cửa replay cũ sau GC.

Server cấp credential ngẫu nhiên khi đăng nhập mới bằng tài khoản bàn, lưu hash và ràng buộc đúng một lượt. Credential đang chờ được gắn khi chủ quán mở lượt đầu; khi đã gắn, không tự chuyển sang lượt sau. Reconnect cần mật khẩu và credential đã lưu. Khách mới trên terminal phải chủ động bắt đầu lượt mới khi không còn lệnh chưa giải quyết. Mật khẩu bàn dùng chung là mô hình terminal demo, không phải xác minh danh tính khách ngoài đời: người biết mật khẩu vẫn có thể chủ động xin credential mới. Triển khai QR/thiết bị ngoài quán cần cơ chế cấp quyền riêng.

Outbox ghi trước gửi và lưu từng lệnh qua file atomic replace. Payload không bị sửa khi retry; xung đột ID bị chặn. Không lưu mật khẩu. File chứa credential là bí mật trên terminal; demo LAN dùng quyền tài khoản OS và chưa mã hóa at rest. Không cho hai cửa sổ dùng chung một file outbox bằng file lock.

## Đánh đổi

Ghi SQLite vẫn tuần tự, receipt tăng theo lịch sử; chưa GC. Khách phải thao tác thêm khi nhu cầu chưa rõ. Reconnect được người dùng chủ động thực hiện, tránh lưu mật khẩu hoặc luồng tự đăng nhập ngầm. Baseline thực nghiệm giữ idempotency, thay chính sách replay/guard bằng cấu hình thử nghiệm tách riêng; không bật cấu hình yếu hơn trên server demo mặc định.

## Khi xem lại

Khi chuyển web/QR, triển khai Internet/TLS, nhiều server hoặc cần retention/GC, phải xem lại cấp credential, ràng buộc principal, storage và chính sách thu hồi.
