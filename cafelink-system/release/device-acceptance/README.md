# CafeLink V9.4 - Bộ nghiệm thu thiết bị

Ứng dụng ở `app/` lấy từ ZIP đã kiểm SHA-256, ghi rõ trong `AUTOMATED_BASELINE.json`. Bộ này dùng JRE đi kèm; máy chạy không cần JDK, Node hoặc Python. Tất cả ca trong `RESULTS.json` ban đầu là `NOT_RUN`. Bằng chứng phần mềm không thay nghiệm thu thiết bị thật.

1. Mở `START-PUBLIC.cmd`, đợi terminal in địa chỉ HTTPS và mật khẩu tạm.
2. Đăng nhập bằng địa chỉ/mật khẩu đó, bấm **Mở tất cả bàn**, mở **Bàn 1** và hiển thị QR.
3. Làm lần lượt `CHECKLIST.md`. Điện thoại có thể dùng mạng di động; giữ laptop và terminal chạy.
4. Điền người kiểm, thiết bị, thời điểm và kết quả thật vào `RESULTS.json`. Nếu chưa đủ thiết bị, giữ ca đó là `NOT_RUN`.
5. Dừng bằng Ctrl+C. Khi cần làm lại từ đầu, tạo bộ kit mới; không xóa journal/dữ liệu để che kết quả chưa rõ.

Mặc định dùng cổng 19588/19558, public tối đa 30 phút. Chọn cặp cổng khác khi cần:

```powershell
.\Run-UAT.ps1 -Mode Public -Port 19688 -TcpPort 19658 -DurationSeconds 1800
```

Kiểm quầy/loa trên máy tính bằng `START-LOCAL.cmd`; mở `http://127.0.0.1:19588/admin`, tài khoản `admin / CafeLink@123`. Local/public có profile riêng dưới `app/data/device-uat-*`; cần dừng phiên đang chạy trước khi đổi chế độ.

Không dùng địa chỉ 127.0.0.1 của laptop trên điện thoại. Không nhập thông tin ngân hàng thật: thanh toán là giả lập. Không chia sẻ mật khẩu tạm, QR hoạt động, cookie, DB/key hoặc toàn bộ thư mục kit. Khi báo lỗi, gửi mã ca, bước làm, thiết bị/browser, kết quả mong đợi/thực tế và thông báo đã loại thông tin phiên.

L01 cần hai máy vật lý và runbook LAN riêng trong source. Hai browser trên một máy hoặc hai máy đi qua tunnel Internet không thay phép thử LAN trực tiếp. Các ca nghe chuông/đánh giá tiện dụng cần người thực hiện; script không tự xác nhận thay người kiểm.
