# CafeLink V9.3 — Màn khách chia thành năm vùng

## Chạy bản giao diện mới

```powershell
cd D:\BTL-LTM\dist\CafeLink-Web-V9.3
powershell -NoProfile -ExecutionPolicy Bypass -File Start-Local.ps1 -Port 19588 -TcpPort 19558
```

Mở `http://127.0.0.1:19588/admin`, tài khoản local `admin / CafeLink@123`. Chọn Mở tất cả bàn → Bàn 1 → Sao chép link đặt món. Mở InPrivate/Ẩn danh bằng Ctrl+Shift+N rồi dán nguyên link có mã gia nhập, hoặc quét QR bằng điện thoại. Tab thường chung hồ sơ vẫn dùng cookie admin; bản này giữ màn giải thích của bản sửa QR.

Khi đổi từ gói cũ, dừng đúng terminal demo cũ bằng Ctrl+C. Gói mới có profile dữ liệu riêng; muốn giữ menu/đơn, backup gói cũ rồi restore offline vào gói mới theo [hướng dẫn dữ liệu](WEB_RELEASE.md). Không xóa DB hoặc ghi đè gói cũ đang chạy.

## Năm ô khách hàng

| Ô | Vùng nội dung | Ý nghĩa số đếm |
|---|---|---|
| Thực đơn | Đồ uống, tìm kiếm, danh mục và chi tiết món | Số món trong thực đơn, không phải tồn kho |
| Đơn đã gọi | Các đơn đã gửi và tiến độ phục vụ | Số đơn của lần đặt hiện tại; lịch sử lần trước có khung riêng |
| Hỗ trợ | Lời nhắn, gọi nhân viên, bổ sung/rút yêu cầu | Số lời gọi đang chờ xử lý |
| Thanh toán | Các đơn đã gửi và thao tác trả tiền giả lập | Số đơn UNPAID/PENDING; giỏ nháp chưa phải khoản phải trả |
| Giỏ hàng | Số lượng, ghi chú, tạm tính và xác nhận gửi | Tổng số phần đang chọn, không phải số dòng ghi chú |

Mỗi vùng có khung viền, biểu tượng, tiêu đề và mô tả riêng. Màu của vùng khớp ô điều hướng; ô đang chọn có nền nổi bật. Bấm ô để cuộn đến đúng vùng; có khoảng trống để tiêu đề không bị thanh điều hướng che. Khối hỗ trợ cuối trang có thể nằm thấp hơn vì browser đã cuộn tới cuối tài liệu.

Máy tính: thực đơn/đơn ở cột chính; giỏ, thanh toán, hỗ trợ là ba thẻ riêng ở cột bên. Điện thoại: các thẻ xếp dọc, năm ô điều hướng vẫn ở đầu vùng cuộn, không có thanh cuộn lồng trong cột bên. Các nội dung vẫn được giữ khi chuyển ô; không tự gửi đơn hoặc thu tiền khi bấm điều hướng.

## Kiểm lại nhanh

1. Bấm lần lượt năm ô; kiểm vùng đúng, ô được chọn và tiêu đề không bị che.
2. Thêm hai phần cùng món: Giỏ hàng tăng 2; Đơn đã gọi/Thanh toán chưa tăng.
3. Đặt món: giỏ về 0, số đơn tăng, đơn chưa trả xuất hiện ở Thanh toán.
4. Thanh toán giả lập thành công: số đơn chưa trả giảm; vẫn theo dõi phục vụ trong Đơn đã gọi.
5. Gọi hỗ trợ rồi rút: số đang chờ tăng rồi giảm; không tạo ticket trùng.
6. Thử màn hình nhỏ, bàn phím, tăng/giảm/xóa món, reload giữ giỏ và xem đơn cũ.

Muốn dùng điện thoại khác mạng: dừng local rồi chạy `powershell -NoProfile -ExecutionPolicy Bypass -File Start-Public.ps1 -Port 19588 -TcpPort 19558`. Dùng URL HTTPS/mật khẩu tạm và QR do lần chạy đó tạo. Local và public là hai profile dữ liệu riêng; thanh toán vẫn là giả lập.
