# ADR-007 — Trả trước theo đơn, cổng giả lập và thông báo bền vững

**Ngày:** 22/10/2026. **Trạng thái:** Accepted theo yêu cầu người dùng: hoàn thành V5a–V7, khách quét QR/gọi món/thanh toán ngay; cho phép giả lập vì thanh toán không phải trọng tâm học phần.

## Bối cảnh

V5 dùng checkout trả sau cho cả lượt, chỉ thu khi mọi đơn SERVED và đóng bàn trong cùng transaction. Luồng mới cần trả trước rồi quầy mới pha, trong khi khách còn ở bàn và có thể gọi thêm. Hệ thống vẫn phải minh họa Client/Server TCP, xác thực theo lượt và phục hồi khi mất phản hồi.

## Lựa chọn và quyết định

| Vấn đề | Phương án | Quyết định / đánh đổi |
|---|---|---|
| Thanh toán | Merchant sandbox bên ngoài hoặc mô phỏng cục bộ | Chọn **LOCAL_SIMULATOR**, có nhãn không thu tiền thật. Không cần tài khoản/secret/Internet/callback công khai. Không nhận là đã tích hợp VNPAY/MoMo hay IPN thật |
| Đơn vị thu tiền | Một hóa đơn cả lượt hoặc từng đơn trước pha | Thu từng đơn. `payment_state` tách khỏi trạng thái pha chế, giữ schema trạng thái đơn cũ và lịch sử |
| Đóng bàn | Thu tiền đồng thời đóng hoặc thao tác kết thúc riêng | Trả trước không đóng bàn. ADMIN kết thúc lượt khi mọi đơn đã PAID+SERVED hoặc CANCELLED và không còn hỗ trợ OPEN |
| Chuyển dữ liệu cũ | Ép toàn bộ lượt sang trả trước hoặc giữ mode từng lượt | Lượt schema 5 đang mở giữ POSTPAY. Mở lượt mới mặc định PREPAY; có `-OrderingMode postpay` để diễn tập hồi quy cũ |
| Thông báo | So sánh snapshot hoặc event log trong transaction | Event log SQLite cùng transaction nghiệp vụ/receipt; feed có cursor/phân trang và phạm vi. Không suy sự kiện từ chênh lệch hai snapshot |
| Delivery thông báo | Thêm queue event vào WSS hoặc feed qua TCP có hint từ snapshot | Chọn feed đọc qua TCP khi revision thay đổi, bổ sung poll 3 giây và foreground. WSS tiếp tục coalesce snapshot; không đưa event bắt buộc vào queue coalescing |
| Ảnh | Base64 trong TCP, multipart hoặc HTTP binary riêng | POST ảnh nhị phân riêng, có Origin/CSRF/ADMIN và giới hạn. Core chỉ nhận đường dẫn ảnh. Ít lớp phân tích hơn multipart một file; UI vẫn chọn file/xem trước bình thường |
| Ảnh không dùng | Xóa ngay khi save lỗi hoặc giữ bất biến | Tên theo hash, giữ ảnh cũ/orphan để không xóa nhầm ảnh đang dùng. Audit inventory riêng; dọn/retention tự động còn giới hạn vận hành |

## Hợp đồng trả trước

1. PLACE_ORDER vẫn ghi receipt nguyên tử và chốt tên/giá tại Core. PREPAY yêu cầu expectedVersion/expectedPriceVnd của từng món, từ chối menu đổi/hết.
2. Đơn mới có payment_state UNPAID; START_ORDER_PAYMENT cấp một giao dịch PENDING cho đơn, dùng số tiền Core tính. Hai tab gọi khởi tạo cùng lúc dùng cùng giao dịch còn hạn.
3. Simulator nhận paymentId, token ký HMAC-SHA256 theo quán/đơn/lượt/số tiền/hạn và một kết quả thử. Core còn kiểm quyền membership, lượt đang mở và số tiền. Giao dịch này là dữ liệu thử, token không chứng minh đã có tiền ngân hàng.
4. SUCCESS chuyển giao dịch và đơn sang PAID trong cùng transaction, ghi sự kiện, sau đó Server mới push. Unique index bảo vệ tối đa một giao dịch PAID/đơn. Kết quả terminal được trả lại khi gửi lặp; callback muộn của giao dịch FAILED/CANCELLED/EXPIRED không hồi sinh nó.
5. FAILED/CANCELLED/EXPIRED cho phép tạo giao dịch thử mới cho cùng đơn. Hủy đơn chưa trả tiền chặn mọi giao dịch PENDING của đơn đó. Đơn PAID không có nút hủy/hoàn tiền giả; cần nhân viên hỗ trợ, refund ngoài phạm vi.
6. SET_ORDER_STATUS tại Core chặn UNPAID/PENDING/CANCELLED, kể cả gọi trực tiếp TCP. PAY_AND_CLOSE bị chặn cho lượt PREPAY để không thu lại tiền.
7. Sau mất phản hồi, xem state của đơn/hóa đơn. Không tạo đơn mới để thử trả lại; mở lại giao dịch của đúng đơn. Receipt PLACE_ORDER/ý định cũ vẫn giữ nguyên scope và fingerprint.

## Giới hạn và khi cần xem lại

Giao diện simulator là dialog trong website, không phải website ngân hàng. Khách chủ động chọn kết quả giả lập. Không có chuyển tiền, xác minh IPN ngân hàng, chống gian lận tài chính, hoàn tiền hoặc đối soát tiền thật. Muốn vận hành thật phải thay adapter, thêm xác minh callback độc lập/merchant/query/đối soát và kiểm chứng lại trước khi dùng.

Feed có độ trễ poll tối đa mục tiêu khoảng ba giây khi không có hint; không cam kết khi tab bị đình chỉ. Web Locks/localStorage điều phối toast theo origin/profile, không bảo đảm âm thanh nghe đúng một lần khi browser/OS lỗi. Ở thời điểm viết ADR này, camera/LAN hai máy và người dùng tại quán chưa nghiệm thu; trạng thái hiện hành xem [TESTING](../TESTING.md).
