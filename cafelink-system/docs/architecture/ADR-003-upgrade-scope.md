# ADR-003: Phạm vi nâng cấp CafeLink trước hạn nộp

> Cập nhật 21/10/2026: phần lựa chọn giao diện/transport của đề xuất này được thay bằng [ADR-004](ADR-004-web-tcp-foundation.md) và [kế hoạch V2](../../../report/CafeLink_Final_Report.md). Các bất biến receipt/visit/discard vẫn cần giữ. Không dùng trạng thái Proposed bên dưới để suy ra web V0 chưa được triển khai.

Ngày: 20/10/2026. Trạng thái: **Proposed – kế hoạch chưa triển khai**. Chi tiết và lịch: [CafeLink_Upgrade_Plan.md](../../../report/CafeLink_Final_Report.md).

## Bối cảnh

CafeLink tuần 2 chạy được, có receipt/outbox/guard nhưng reconnect còn thủ công, guest dùng mật khẩu bàn, cả đơn và lời gọi chưa nhận đều CONFIRM_REQUIRED. Đối chiếu repo TOEIC cho thấy cần cải thiện vòng đời kết nối/quyền, độ sâu thực nghiệm và vận hành. Hạn học phần 31/10/2026, không phù hợp để viết lại stack.

## Lựa chọn và lý do

| Vấn đề | Phương án được đề xuất | Đánh đổi |
|---|---|---|
| Khách đổi lượt nhưng biết mật khẩu bàn | JOIN bằng mã chỉ có hiệu lực trong lượt, credential resume có expiry/revoke | Thêm bước cấp mã; phải đóng đường bypass guest password cũ |
| Mất mạng làm phải login lại | ConnectionManager với bounded retry và resume token; journal tách transport | Phải kiểm callback generation và cleanup; không tự replay mutation |
| Policy theo loại còn hình thức | Đơn chưa nhận giữ để xác nhận; lời gọi chưa nhận kết thúc bằng discard nguyên tử | Lời gọi có thể phải bấm mới; thêm RPC, cần đo chi phí |
| Đặt lại ý định khi menu đã đổi | expectedVersion từng món; giá server, receipt cũ kiểm đúng thứ tự | Thêm xử lý MENU_CHANGED; khách xác nhận nội dung mới bằng ID mới |
| Giao diện chưa giống vận hành quán | Dashboard và view pha chế trong ADMIN, không thêm role riêng | Không claim phân quyền BARISTA; giữ hai vai trò |
| Push có thể thừa | Đo trước; scoped/coalesced full snapshot nếu cần | Không có thuật toán delta; không giảm toàn bộ byte khi dữ liệu đã vào TCP |
| Máy demo cần Java | Windows app-image có runtime, vẫn giữ JAR/scripts | Package lớn hơn; chưa MSI/ký số/auto-update |

## Những phương án đã cân nhắc

Giữ toàn bộ tuần 2 chỉ cải thiện báo cáo ít rủi ro nhất nhưng bỏ sót UX và vòng đời quyền. Viết lại web/Spring/JavaFX hoặc thêm full/delta tạo nhiều đường lỗi trong thời gian ngắn. Phương án đề xuất nâng cấp trực tiếp các giới hạn đã quan sát và dùng lại receipt/discard/visit hiện có.

Không dùng TTL cho lời gọi ở đợt này: chọn ranh giới tiếp nhận/đối chiếu lại thay vì thêm grant và clock semantics. Không tự replay đơn chưa nhận chỉ vì mới reconnect; ý định đặt món vẫn cần người dùng quyết định.

## Quy tắc không được phá

Receipt/mutation transaction, ID/payload bất biến, giá server, guard lượt, đúng quyền đọc outcome, không gửi socket trong khóa DB và không tự chuyển outbox sang quyền khách mới. Đóng lượt không đồng nghĩa thu hồi ngay khả năng đọc receipt cũ; auth expiry/revocation được kiểm riêng. Dừng client không được giả là hủy lệnh đã nhận.

## Hệ quả và gate

Migration giữ dữ liệu tuần 1/2, protocol ghi version/khả năng tương thích thật, demo và fixture cập nhật theo luồng JOIN mới. R0/R1 giữ nghĩa policy cũ; R2 mới là semantics được đo. Mỗi gói phải có source/test/evidence trước khi chuyển trạng thái; chưa sửa claim trong báo cáo thành tính năng hoàn thành chỉ vì ADR được viết.

P1 scoped push/coalescing và lịch sử hóa đơn được cắt khi P0 chậm. Dừng thêm tính năng ngày 27/10 để dành phép đo, LAN, đóng gói và bảo vệ. Không xem số test hoặc số tính năng peer là yêu cầu phải đuổi kịp.
