# CafeLink V9.3 — Hướng dẫn demo bản bàn giao

## 1. Gói chạy sẵn

Giải nén toàn bộ bộ bàn giao vào thư mục ASCII có quyền ghi. Mở PowerShell tại `Run/CafeLink-Web-V9.3`, chạy:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Verify-Package.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File Start-Local.ps1 -Port 19588 -TcpPort 19558
```

Vào `http://127.0.0.1:19588/admin`, local `admin / CafeLink@123`. Giữ terminal mở. Nếu cổng bận, chọn cặp khác hoặc dừng đúng terminal demo của mình; không kill tiến trình theo tên/cổng tùy ý.

## 2. Vào bàn

Quản lý bấm Mở tất cả bàn → Bàn 1 → Sao chép link đặt món. Dán nguyên link vào InPrivate/browser/profile khác hoặc quét QR bằng điện thoại. Không lấy `/join` đã mất fragment sau khi mở; lấy link từ màn QR. Không đăng nhập admin trên browser khách. Các tab thường dùng chung cookie, các cửa sổ InPrivate mở đồng thời cũng có thể cùng phiên riêng tư.

## 3. Public HTTPS

Dừng local bằng Ctrl+C trước, rồi chạy trong cùng thư mục gói:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Start-Public.ps1 -Port 19588 -TcpPort 19558
```

Đăng nhập URL HTTPS và mật khẩu tạm được terminal in ra; không dùng mật khẩu local. Mở tất cả bàn rồi lấy QR. Điện thoại có thể dùng mạng khác; kết quả điện thoại/camera chưa nghiệm thu thay người dùng. Tunnel đổi hostname khi restart thì lấy QR mới. Local/public có DB riêng; mật khẩu/đơn của profile này không phải profile kia.

## 4. Demo nghiệp vụ 5–7 phút

1. Hai browser khách dùng cùng QR, cho thấy giỏ/đơn riêng.
2. Khách thêm hai phần cùng món khác ghi chú; kiểm tạm tính, năm ô và số đếm.
3. Đặt món, thanh toán giả lập; quầy nhận thông báo, đọc bàn/mã đơn/ghi chú rồi pha chế.
4. Khách gọi, bổ sung/rút hỗ trợ; quầy xử lý đúng yêu cầu, không sinh lời gọi mở trùng.
5. Quầy chuyển sẵn sàng → giao đủ. Khách soạn thêm vẫn giữ giỏ, bắt đầu lần đặt tiếp và xem được đơn trước.
6. Thử đổi giá/hết món khi còn giỏ; khách phải xem lại. Có thể diễn hủy đơn chưa trả hoặc hoàn giả lập đơn chưa pha chế kèm lý do.

## 5. Contribution có kiểm chứng

Network Offline chỉ minh họa mất kết nối, không đảm bảo Server đã commit nhưng response bị mất. Dùng bộ test/experiment trong source để tạo fault trước forward hoặc sau commit có oracle. Khi trình bày nêu rõ: lệnh đã nhận thì lấy receipt, lệnh chưa nhận xử lý theo ngữ nghĩa; DISCARD trước accept tạo barrier, accept trước discard giữ kết quả đã nhận. Không đổi barrier thành nút hoàn tiền hoặc xóa đơn đã nhận.

## 6. Backup/reset/restore

Dừng Server, đóng phần mềm đang mở DB trước các lệnh sau:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Backup-Demo.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File Reset-Demo.ps1
```

Thêm `-Public` để chọn profile public. Reset lưu profile cũ vào backups/before-reset, không xóa vĩnh viễn. Chọn đúng file ZIP backup thực tế khi restore:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Restore-Demo.ps1 -Archive '.\backups\TEN-BACKUP-THUC-TE.zip'
```

Chỉ restore backup do nhóm quản lý; công cụ kiểm hash/path/schema/integrity/key/media trước thay dữ liệu. Giữ backup trước nâng cấp; runtime cũ không mở DB mới. Không chỉ copy một DB đang chạy. Backup Server không bao gồm cookie/IndexedDB điện thoại. Để diễn sạch dùng browser/profile mới; chỉ xóa site data khi đã chủ động bỏ các ý định cần đối chiếu.

## 7. Trước ngày bảo vệ

Thử local làm phương án dự phòng Internet. Kiểm audio bằng thao tác người dùng, QR đúng hostname hiện tại và tiến độ một đơn. Nhóm phải giải thích được TCP framing, Gateway→Core, transaction/receipt, scope, baseline, metric và giới hạn. [Kiến trúc](FINAL_ARCHITECTURE.md), [giao thức](FINAL_PROTOCOL.md), [checklist người dùng](WEB_USER_ACCEPTANCE.md).
