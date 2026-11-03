# CafeLink - Công cụ kiểm thiết bị

Bộ kit tạo một lượt kiểm từ gói ứng dụng có checksum/manifest phù hợp. `AUTOMATED_BASELINE.json` ghi nguồn gói; `CHECKLIST.md` mô tả thao tác và `RESULTS.json` dành cho kết quả do người kiểm ghi. Các trường chưa điền là dữ liệu của lượt kiểm đó, không là kết luận về toàn dự án.

1. Xác minh đúng gói, phiên bản và cấu hình trong kit.
2. Chạy START-PUBLIC, đợi HTTPS/mật khẩu tạm; đăng nhập và mở nhận khách QR.
3. Điện thoại quét, làm checklist, ghi thiết bị/Browser/mạng và kết quả quan sát.
4. Kiểm quầy, chuông thật và tình huống mạng bằng thao tác phù hợp. Không dùng viewport thay camera/thiết bị.
5. Dừng bằng Ctrl+C, giữ kết quả đã loại thông tin riêng. Lượt kiểm lại dùng hồ sơ riêng, không sửa run trước để đổi kết quả.

`Run-UAT.ps1` hỗ trợ Local/Public và chọn cổng/thời hạn. Không dùng địa chỉ localhost của laptop trên điện thoại. Local/public có profile riêng; thanh toán là giả lập. Không chia sẻ mật khẩu tạm, cookie, DB/key hoặc toàn bộ kit có quyền phiên.

Nghiệm thu LAN trực tiếp cần hai thiết bị và TLS hợp lệ; hai tab trên một máy hoặc hai thiết bị qua tunnel Internet kiểm các điều kiện khác. Kết quả nghe chuông/tiện dụng do người thực hiện xác nhận, script không tự đánh dấu thay.
