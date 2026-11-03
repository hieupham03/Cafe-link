# CafeLink - Đặc tả dự án

CafeLink là hệ thống gọi món và điều phối phục vụ cho một quán cà phê theo Client/Server. Khách dùng Browser qua QR; ADMIN và STAFF dùng giao diện quầy. Java Gateway nhận web, TCP Core quyết định nghiệp vụ và SQLite lưu tập trung.

## Phạm vi

Sản phẩm gồm QR cố định theo bàn, phiên riêng, menu có ảnh/giá/nhóm, giỏ/ghi chú, tiếp nhận trước thanh toán giả lập, phục vụ, hỗ trợ, thông báo, thuế/thu chi, tài khoản nhân viên và phục hồi yêu cầu. Có công cụ kiểm Java/web và thực nghiệm phục hồi/tải.

Không tích hợp ngân hàng, quản lý nguyên liệu, topping phụ thu, giao/hoàn từng phần, nhiều chi nhánh hoặc cam kết SLA. Thanh toán và hoàn là giả lập.

## Vai trò

| Chủ thể | Trách nhiệm |
|---|---|
| GUEST | Tạo đơn, thanh toán giả lập, theo dõi và hỗ trợ trong phiên được cấp |
| STAFF | Tiếp nhận/từ chối đơn chưa trả, pha chế/giao, hỗ trợ, đánh dấu hết/còn món |
| ADMIN | Phục vụ và quản lý menu, giá/ảnh, thuế, thu chi, tài khoản, phiên và chẩn đoán |

Xem [ma trận quyền](ACCESS_CONTROL.md). Quyền được kiểm tại Gateway và Core, không dựa riêng vào nút hiển thị.

## Quy trình chính

1. Quản lý bật nhận khách QR và hiển thị mã bàn.
2. Khách quét QR, nhận visit/membership riêng, xem menu và soạn giỏ.
3. Browser lưu journal trước gửi; Core kiểm quyền, giá/version và ghi đơn chờ tiếp nhận.
4. Quầy kiểm khả năng phục vụ: tiếp nhận hoặc từ chối đơn chưa trả kèm lý do.
5. Khách thanh toán giả lập sau tiếp nhận. Quầy pha chế khi đủ điều kiện tiền.
6. Quầy chuyển tiến độ đến giao đủ; khách nhận cập nhật trực tiếp và có thể gọi tiếp.
7. Khi hết công việc, khách rời phiên hoặc quản lý kết thúc phiên bị bỏ quên.

## Điều kiện nghiệp vụ

| Quy tắc | Điều kiện |
|---|---|
| Quyền riêng | Chung QR không đồng nghĩa chung đơn; truy cập bị giới hạn theo danh tính/visit |
| Giá | Core tự kiểm và tính tiền; Browser gửi giá/version kỳ vọng để phát hiện thay đổi |
| Tiếp nhận | Chưa ACCEPTED không được bắt đầu thanh toán |
| Phục vụ | SUBMITTED → PREPARING → READY → SERVED theo trạng thái tiền/tiếp nhận |
| Hỗ trợ | Một ticket OPEN cùng loại trong visit; sửa/rút/xử lý kiểm version |
| Thuế | Chốt tên, tỷ lệ, cách tính và tiền trên đơn; thay cấu hình không sửa đơn đã gửi |
| Thu chi | Chỉ tính thu thành công; tách ngày hoàn, loại phiếu chi đã hủy và giữ lịch sử |
| Retry | Cùng principal/ID/nội dung trả receipt cũ; khác nội dung bị COMMAND_CONFLICT |
| Mất phản hồi | Timeout không kết luận Core chưa commit; đối chiếu trước quyết định tiếp theo |
| Bỏ yêu cầu | Bỏ trước thì chặn lệnh muộn; nhận trước thì giữ kết quả đã có |
| Đóng phiên | Không đóng khi còn nghĩa vụ; mất kết nối không tự hủy đơn/phiên |
| Toàn quán | Tạm ngưng nhận QR khác kết thúc phiên; kết thúc hàng loạt không đóng một phần |

## Giao tiếp

Browser ↔ Gateway dùng HTTP(S)/WebSocket. Gateway ↔ Core dùng socket TCP với 4 byte độ dài big-endian + JSON UTF-8, body 1–262144 byte. Message có REQUEST/RESPONSE/EVENT; phản hồi giữ requestId. HTTP JSON tối đa 64 KiB; ảnh tối đa 2 MiB qua endpoint bytes riêng.

Scope khách là `(storeId, visitId, membershipId)` và phải khớp identity đã xác thực. Mutation/receipt/event liên quan cùng transaction; Client không tự đổi scope/ID để vượt trạng thái chưa rõ. [Kiến trúc](ARCHITECTURE.md) · [Giao thức](PROTOCOL.md).

## Dữ liệu và triển khai

V10.1 dùng SQLite schema 13, DB/key/media theo profile. Mở DB mới tự tạo dữ liệu khởi đầu; chạy lại giữ dữ liệu. Demo một máy dùng loopback; điện thoại dùng HTTPS trực tiếp hoặc tunnel. Core không công khai raw TCP trong cấu hình web.

## Kiểm chứng

Unit/integration kiểm codec, TCP, quyền, DB và nghiệp vụ; E2E kiểm Browser → Gateway → TCP Core → DB. Harness so R0/R1/R2 trên cùng guard, có fault tại HTTP và oracle đọc DB. Tải và thời gian đo được ghi theo từng run, không suy giới hạn cấu hình thành công suất.

[Kiểm thử](TESTING.md) · [Thực nghiệm](EXPERIMENTS.md) · [Hướng dẫn sử dụng](USER_GUIDE.md).
