# CafeLink Web V9.3 — bắt đầu tại đây

Màn khách có năm ô rõ ràng: Thực đơn, Đơn đã gọi, Hỗ trợ, Thanh toán, Giỏ hàng; xem docs/WEB_V9_3.md để chạy và kiểm lại bản này.

Gói Windows x64 có JRE 17 đi kèm. Giải nén cả ZIP vào thư mục có quyền ghi, mở START-LOCAL.cmd hoặc START-PUBLIC.cmd. Không cần cài JDK/Node để chạy.

Local dùng admin / CafeLink@123. Public in địa chỉ HTTPS và mật khẩu tạm ở terminal; dùng đúng địa chỉ đó để quản lý và lấy QR. Dừng bằng Ctrl+C trong đúng terminal của demo.

Thử làm khách trên máy quản lý: sao chép link đặt món từ màn QR và dán vào InPrivate/Ẩn danh (Ctrl+Shift+N trên Edge/Chrome), browser/profile khác hoặc quét QR bằng điện thoại. Tab thường dùng chung cookie admin. Bản sửa QR có màn giải thích và nút sao chép link khi phát hiện trường hợp này; không tự đăng xuất quản lý.

Nếu cổng đang dùng, chọn cặp khác; không cần dừng tiến trình khác:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Start-Local.ps1 -Port 19388 -TcpPort 19358
```

Mở http://127.0.0.1:19388/admin. Khách dùng browser/profile khác, mở tất cả bàn rồi quét QR. Local/public có profile dữ liệu riêng. Các file thực thi công cụ nằm trong thư mục gói, không chuyển một file CMD riêng ra ngoài.

Chi tiết chạy và demo: docs/FINAL_RUNBOOK.md. Hướng dẫn backup/reset/restore: docs/WEB_RELEASE.md. Danh sách nghiệm thu: docs/WEB_USER_ACCEPTANCE.md.

Schema 11 giữ giá và lịch sử đã nhận, thêm ghi chú từng phần và lịch sử ticket. Công cụ nhận backup schema 9/10/11 và kiểm schema thật trước khi restore. Giữ backup trước nâng cấp: runtime V9/V9.1 không mở được DB 11. Bản gói mới không tự lấy hoặc sửa DB của gói cũ.

Thanh toán và hoàn tiền là giả lập học tập, không thu tiền thật. QR chung xác định bàn, mỗi browser/profile có phiên và đơn riêng. Quick Tunnel có thể đổi địa chỉ khi restart; cần lấy QR của lần chạy hiện tại. Điện thoại thật vẫn cần tự kiểm trước buổi bảo vệ.

Kiểm toàn vẹn bằng Verify-Package.ps1. RELEASE.json ghi V9.3, runtime và hash. Maven artifact nội bộ vẫn tên cafelink-1.0.0.jar. ZIP nguyên gốc không có DB/khóa/phiên người dùng; dữ liệu chạy và backup không nên đưa vào gói chia sẻ.
