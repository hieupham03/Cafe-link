# CafeLink - Checklist kiểm thiết bị

Thực hiện trên ứng dụng và cấu hình được ghi trong manifest của kit. Ghi thiết bị, Browser, mạng, thời điểm, bước làm và kết quả quan sát vào RESULTS.json. Mỗi dòng dưới là tiêu chí của một lượt kiểm, không phải kết quả đã được xác nhận tự động.

## Chuẩn bị

Chạy START-PUBLIC, đợi URL HTTPS/mật khẩu tạm, đăng nhập quản lý và mở nhận khách QR. Dùng profile/thiết bị độc lập cho khách; giữ máy chủ và terminal chạy. Cổng phải trống. Thanh toán là giả lập, không nhập thông tin ngân hàng.

## Các tình huống

| Mã | Thực hiện | Điều kiện đạt |
|---|---|---|
| P01 | Dùng camera điện thoại trên mạng di động quét QR, vào bàn và đặt món | Mở đúng HTTPS hiện tại, xem menu và tạo một đơn chờ tiếp nhận |
| P02 | Hai thiết bị quét cùng QR | Đơn/giỏ/phiên riêng, quầy thấy cùng địa chỉ bàn |
| P03 | Thêm món, mở giỏ, dùng bàn phím, xoay màn hình | Thanh giỏ đủ nội dung và bấm được, không che menu dưới; thao tác chính không bị khuất |
| P04 | Tắt/bật mạng khi có thao tác | Không tự tạo đơn thay thế hoặc kết thúc phiên; kết nối lại và đối chiếu đúng kết quả |
| P05 | Sau tiếp nhận, thử thanh toán thất bại/hủy rồi thử lại | Không ghi PAID cho thất bại; chỉ lần hợp lệ xác nhận tiền giả lập |
| P06 | Đưa tab ra nền, khóa màn hình, quay lại/tải lại và gọi tiếp | Khôi phục đúng phiên còn hợp lệ, không chuyển đơn sang khách khác |
| A01 | Bật/tắt chuông quầy, tạo đơn/hỗ trợ và tải lại | Nghe âm khi được phép; có chữ/hàng đợi khi âm bị chặn; trạng thái tắt/bật phù hợp |
| L01 | Dùng hai máy LAN với Gateway HTTPS và chứng chỉ được tin cậy | Client kết nối đúng máy chủ, thao tác/cập nhật qua mạng LAN; ghi riêng cấu hình TLS |
| U01 | Chạy đủ vòng khách/quầy/quản lý | Tiếp nhận trước trả tiền, phục vụ đúng bước, hỗ trợ, quyền STAFF/ADMIN và đóng phiên đúng điều kiện |

## Ghi nhận

Kết quả PASS cần quan sát thực tế; lỗi ghi bước, mong đợi/thực tế và thông báo đã loại thông tin riêng. Không dùng viewport hoặc hai tab thay hai thiết bị. Không dùng ngắt Wi-Fi để kết luận chính xác request đã commit trước khi mất response; tình huống đó cần fault có kiểm soát.

LAN trực tiếp dùng địa chỉ máy chủ và TLS hợp lệ, không dùng localhost của laptop trên điện thoại. Chỉ mở cổng Gateway theo môi trường; Core giữ loopback. Khi không có điều kiện thực hiện một tình huống, ghi rõ phạm vi thực tế, không điền kết quả giả.

Giữ run đã ghi, tạo hồ sơ riêng khi kiểm lại. Không xóa journal/DB để vượt trạng thái chưa rõ; không công khai cookie, key, QR đang hoạt động hoặc mật khẩu tạm. Ctrl+C dừng demo của kit.
