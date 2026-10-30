# CafeLink V9.4 - Chạy bản web đóng gói và quản lý dữ liệu demo

V9.4 giữ năm vùng khách hàng và bổ sung chẩn đoán, readiness, hạn thanh toán và các bản sửa vận hành; xem [WEB_HARDENING](WEB_HARDENING.md). Schema hiện tại là 11; công cụ nhận backup schema 9/10/11 và kiểm schema DB thật. Runtime V9/V9.1 không mở DB đã nâng cấp lên 11; thông tin các phiên bản đó bên dưới chỉ dùng để giải thích tương thích dữ liệu.

Đây là hướng dẫn dữ liệu cho gói hiện hành V9.4/RC4. Quy trình demo nằm ở [FINAL_RUNBOOK.md](FINAL_RUNBOOK.md); kết quả kiểm và Word/PDF nằm ở [chỉ mục báo cáo](../../report/README.md).

Tài liệu dùng được trong gói portable. Các lệnh dưới chạy từ thư mục đã giải nén chứa `Start-Local.ps1`. Gói cho Windows x64, có Java runtime; chạy local không cần Internet hoặc công cụ build. Public cần Internet. Các lần đo V8 là bằng chứng một máy, không thay nghiệm thu điện thoại thật.

## 1. Chạy local

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Verify-Package.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File Start-Local.ps1
```

Mở `http://127.0.0.1:19088/admin`, đăng nhập `admin / CafeLink@123`. Giữ terminal mở. **Mở tất cả bàn** → chọn bàn → sao chép link khách, mở trong browser/profile khác. Nhấn Ctrl+C để dừng trước khi backup/reset/restore.

Nếu cổng bị dùng, đổi cả cặp:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Start-Local.ps1 -Port 19188 -TcpPort 19158
```

`config/demo.json` lưu cặp cổng và hai profile. DB local ở `data/local-demo/cafelink.db`; DB public ở `data/public-demo/cafelink.db`. QR/key/menu/history độc lập giữa hai profile. Cách này tránh public thay mật khẩu admin khiến lần demo local sau không đăng nhập được bằng tài khoản local.

## 2. Chạy public để điện thoại khác mạng quét

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Start-Public.ps1
```

Đợi `Public demo: https://....trycloudflare.com/admin` và `Temporary admin password`. Đăng nhập đúng HTTPS và mật khẩu tạm của lần chạy; không dùng `CafeLink@123`. Mở tất cả bàn, hiển thị QR và quét từ camera điện thoại. Một QR có thể dùng cho nhiều khách; mỗi browser/profile có phiên riêng.

Quick Tunnel có hostname ngẫu nhiên; khởi động lại cần hiển thị/tải lại QR chứa hostname mới. Public script chỉ chấp nhận Origin HTTPS đã chọn, cookie Secure/HttpOnly; Core vẫn bind loopback. Không mở port router hay cài dịch vụ Windows. Nếu chưa có cloudflared, launcher tải đúng release ghim và kiểm SHA256; nếu mất mạng, dùng local.

Nguồn: [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). Runtime được lấy từ archive chính thức Eclipse Temurin, kiểm SHA256 và giữ LICENSE/legal theo [hướng dẫn archive của Adoptium](https://adoptium.net/installation/archives/). Chi tiết version/URL/checksum của gói ở `RELEASE.json`.

## 3. Backup khi đã dừng Server

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Backup-Demo.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File Backup-Demo.ps1 -Public
```

Lệnh đầu sao lưu local, lệnh thứ hai public. Mỗi lệnh trả JSON có đường dẫn ZIP trong `backups/`. Lưu ZIP ở nơi riêng. Backup gồm DB, WAL/SHM còn lại nếu có, file `.qr-key`, thư mục `.media` và manifest hash. Công cụ kiểm phiên bản schema được gói hỗ trợ, integrity/FK, khóa giải mã QR và ảnh món trước khi nhận dữ liệu; V9.1 còn đối chiếu schema trong manifest với DB thật.

**Không chỉ chép một file DB khi Server đang chạy.** Các launcher trong gói giữ lease; maintenance báo lỗi khi lease còn mở hoặc DB đang được tiến trình khác mở. Tất cả tiến trình đọc/ghi profile phải dừng, kể cả phần mềm xem SQLite. Công cụ không tự dừng PID hoặc xác định khách đã rời quán.

Backup không chứa cookie/IndexedDB trên điện thoại. Sau restore, đăng nhập quản lý lại; browser khách có thể cần quét lại và nhận phiên mới, không hứa lấy lại danh tính nếu cookie/session đã hết hạn. Không tự gán yêu cầu cũ cho lượt khách mới.

## 4. Restore

Thay đường dẫn ZIP bằng file đã tạo thực tế:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Restore-Demo.ps1 -Archive '.\backups\backup-YYYYMMDD-HHMMSS-xxxxxxxx.zip'
```

Thêm `-Public` để khôi phục profile public. Dừng Server trước. Công cụ kiểm đường dẫn/entry/link/size/hash, mở DB read-only kiểm nội dung và khóa; kiểm xong mới di chuyển profile hiện tại vào `backups/before-restore-*` và đặt dữ liệu khôi phục vào đúng chỗ. Nếu đổi profile lỗi, nó cố đưa profile trước trở lại. Đường dẫn `previousProfile` trong kết quả giúp giữ dữ liệu trước restore; không tự xóa bản đó.

Đổi hostname/port làm URL trong QR thay đổi, dù secret bàn được giữ qua DB/key. Mở lại màn quản lý và lấy QR đúng địa chỉ hiện tại. Ngày giờ lịch sử giữ như backup. ZIP/hash kiểm toàn vẹn dữ liệu, không phải chữ ký xác thực người tạo backup; chỉ chọn backup bạn quản lý.

## 5. Reset để diễn lại từ đầu

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Reset-Demo.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File Reset-Demo.ps1 -Public
```

Reset không xóa vĩnh viễn: profile được chuyển vào `backups/before-reset-*`. Lần Start tiếp theo tạo quán mới, menu mặc định, QR/quyền phiên mới. Muốn có ZIP để chuyển sang máy khác, chạy Backup trước reset.

Nếu cần quay lại thư mục `before-reset-*` khi chưa có ZIP: dừng Server, chạy Reset một lần nữa để lưu profile mới, rồi **sao chép** nguyên thư mục cũ về vị trí profile đang trống. Ví dụ cho local (thay tên thư mục bằng tên thực tế):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Reset-Demo.ps1
if (Test-Path -LiteralPath '.\data\local-demo') { throw 'Profile đích phải đang trống.' }
Copy-Item -LiteralPath '.\backups\before-reset-YYYYMMDD-HHMMSS-xxxxxxxx' -Destination '.\data\local-demo' -Recurse
```

Với public, dùng `Reset-Demo.ps1 -Public` và đích `data/public-demo`. Giữ thư mục backup gốc; thao tác sao chép không xóa nó.

Để demo sạch, dùng cửa sổ riêng tư/profile browser mới. Nếu chủ động bỏ toàn bộ dữ liệu demo cũ, có thể xóa site data của **đúng origin demo** trong DevTools → Application → Storage → Clear site data. Chỉ làm khi không còn ý định cần đối chiếu. Không hứa reset Server sẽ tự xóa journal trên mọi điện thoại.

## 6. Lỗi thường gặp

| Hiện tượng | Xử lý |
|---|---|
| Port đã dùng | Dừng đúng terminal demo cũ hoặc đổi cặp cổng; không kill tiến trình lạ |
| Không lấy được lease | Dừng launcher đang chạy và phần mềm mở DB; kiểm quyền ghi thư mục |
| Local đăng nhập lỗi | Kiểm bạn đang dùng local hay public; hai profile tách riêng |
| Public login báo Origin/cookie lỗi | Dùng đúng URL HTTPS của lần chạy, không truy cập localhost trong public mode |
| Runtime/file gói thiếu hoặc bị đổi | Chạy Verify-Package, giải nén lại bản ZIP pristine vào thư mục mới |
| Không load ảnh sau chép DB thủ công | Khôi phục trọn backup có `.media` và `.qr-key`; không lấy DB đơn lẻ |
| Backup bị từ chối | Giữ dữ liệu hiện tại, kiểm đúng ZIP, hash, khóa và version; không tự sửa manifest để bỏ lỗi |
| Trình duyệt còn đơn/journal cũ sau reset | Dùng profile mới; chỉ xóa storage demo khi chủ động bỏ dữ liệu đó |

## 7. Giới hạn

Giới hạn gói hiện tại: một launcher/gói; tối đa 32 bridge, trong đó tối đa 30 guest và 16 admin cùng chia sẻ tổng 32; backup tối đa 512 MiB và 20.000 entry. Dùng khóa QR file đi kèm profile; biến môi trường `CAFELINK_QR_KEY` phải để trống khi dùng launcher portable. Không nhận data directory là đường dẫn ngoài `data/`, junction hoặc symlink. Thanh toán là LOCAL_SIMULATOR. Windows ARM/Linux/macOS, vận hành quán thật, LAN/điện thoại/camera thật và remote CI cần bằng chứng kiểm riêng.
