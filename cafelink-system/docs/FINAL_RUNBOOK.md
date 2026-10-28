# CafeLink V9.3 — Chạy và demo từ source hoặc gói bàn giao

## 1. Chạy từ source GitHub

Repo GitHub có source, không kèm gói portable `Run/CafeLink-Web-V9.3`. Chuẩn bị Windows, PowerShell, JDK 17+ và Node.js theo [README source](../README.md#4-yêu-cầu-môi-trường). Lần build đầu cần Internet để tải dependency. Tại thư mục gốc repo, chạy:

```powershell
cd cafelink-system
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-web.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-web.ps1 -Port 19588 -TcpPort 19558 -DatabasePath data/local-demo/cafelink.db
```

Vào `http://127.0.0.1:19588/admin`, local `admin / CafeLink@123`. DB/schema, sáu bàn và tám món mẫu tự tạo khi chạy lần đầu; dữ liệu đã có không tự reset. Giữ terminal mở. Nếu cổng bận, chọn cặp khác hoặc dừng đúng terminal demo của mình; không kill tiến trình theo tên/cổng tùy ý. Nếu đã được cung cấp gói chạy sẵn, dùng mục 6 thay bước build này.

## 2. Vào bàn

Quản lý bấm Mở tất cả bàn → Bàn 1 → Sao chép link đặt món. Dán nguyên link vào InPrivate/browser/profile khác hoặc quét QR bằng điện thoại. Không lấy `/join` đã mất fragment sau khi mở; lấy link từ màn QR. Không đăng nhập admin trên browser khách. Các tab thường dùng chung cookie, các cửa sổ InPrivate mở đồng thời cũng có thể cùng phiên riêng tư.

## 3. Public HTTPS

Dừng local bằng Ctrl+C trước. Với bản clone GitHub đã build, chạy tại `cafelink-system`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/public-demo.ps1 -SkipBuild -Port 19588 -TcpPort 19558
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

## 6. Gói portable được cung cấp riêng

Phần này chỉ dành cho gói Windows x64 đã đóng sẵn có JRE, JAR, thư viện, assets và manifest. Các file trong `cafelink-system/release/windows/` của source là thành phần để đóng gói; không thay một gói portable hoàn chỉnh.

Giải nén bộ bàn giao, mở PowerShell tại `Run/CafeLink-Web-V9.3` rồi chạy:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Verify-Package.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File Start-Local.ps1 -Port 19588 -TcpPort 19558
```

Vào địa chỉ và đăng nhập local như mục 1. Khi chuyển sang public, dừng local trước rồi chạy tại cùng thư mục gói:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Start-Public.ps1 -Port 19588 -TcpPort 19558
```

Public dùng URL HTTPS/mật khẩu tạm in trong terminal, như mục 3. Gói chạy sẵn không yêu cầu JDK/Node để chạy; public cần Internet. Khi clone source, dùng mục 1 và mục 3, không tìm các launcher này ở gốc repo.

## 7. Backup/reset/restore trong gói portable

Các lệnh dưới chạy từ thư mục gói portable ở mục 6. Nếu đang dùng bản source, không chép riêng một launcher bảo trì ra để chạy; xem [hướng dẫn dữ liệu demo](WEB_RELEASE.md) và điều kiện gói tương ứng.

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

## 8. Trước ngày bảo vệ

Thử local làm phương án dự phòng Internet. Kiểm audio bằng thao tác người dùng, QR đúng hostname hiện tại và tiến độ một đơn. Nhóm phải giải thích được TCP framing, Gateway→Core, transaction/receipt, scope, baseline, metric và giới hạn. [Kiến trúc](FINAL_ARCHITECTURE.md), [giao thức](FINAL_PROTOCOL.md), [checklist người dùng](WEB_USER_ACCEPTANCE.md).
