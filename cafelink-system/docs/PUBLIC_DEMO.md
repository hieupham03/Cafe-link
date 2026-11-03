# CafeLink - Demo HTTPS công khai

Launcher tạo HTTPS/WSS qua Cloudflare Quick Tunnel để điện thoại ở mạng khác truy cập Gateway. Core vẫn loopback. Máy chủ cần Internet và tiếp tục chạy trong suốt buổi demo.

## Khởi động

Từ `cafelink-system`, build rồi chạy:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-web.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/public-demo.ps1 -SkipBuild -Port 19088 -TcpPort 19058 -DurationSeconds 1800
```

Launcher tải `cloudflared` theo phiên bản/checksum được ghim nếu thiếu, tạo profile public, chờ readiness local, kết nối edge và readiness qua HTTPS trước khi công bố URL sẵn sàng. Chỉ dùng `-SkipBuild` khi assets/JAR khớp source đang chạy. Cổng bận thì chọn cặp khác, launcher không dừng tiến trình của người khác.

Terminal in URL `/admin`, tài khoản `admin` và **mật khẩu tạm của lần chạy**. Không dùng mật khẩu local cho public. `-NoOpenBrowser` tắt tự mở Browser.

1. Đăng nhập bằng URL/mật khẩu vừa in.
2. Chọn **Mở tất cả bàn**, hiển thị QR Bàn 1.
3. Điện thoại quét → **Vào bàn của tôi** → chọn món và gửi đơn.
4. Quầy tiếp nhận → khách thanh toán giả lập → quầy pha chế/giao.
5. Có thể cho điện thoại/profile thứ hai quét cùng QR để quan sát đơn riêng.

Mỗi lần ADMIN đăng nhập làm các bàn tạm ngưng nhận khách QR mới; mở lại khi cần. Các phiên hiện tại không bị đóng. Đừng đăng nhập quản lý trên profile đang dùng làm khách.

## QR, dữ liệu và thời hạn

Secret bàn được giữ trong DB và không đổi theo lượt khách. URL đầy đủ còn phụ thuộc hostname tunnel; khi hostname đổi phải lấy QR từ lần chạy hiện tại. Muốn in QR dùng lâu dài cần triển khai có domain ổn định.

Mặc định public dùng `data/public-demo/cafelink.db`, riêng với local. Chạy lại giữ dữ liệu. Để diễn tập độc lập:

```powershell
$demoDb = 'data/public-demo/demo-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.db'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/public-demo.ps1 -SkipBuild -Port 19088 -TcpPort 19058 -DatabasePath $demoDb -DurationSeconds 1800
```

Giữ DB, khóa và media cùng nhau. Cookie/IndexedDB thuộc origin Browser; hostname mới không tự mang nhật ký của hostname khác sang. `DurationSeconds` là thời gian tối đa của launcher; Ctrl+C dừng các tiến trình do lần chạy này tạo.

## Xử lý lỗi

| Hiện tượng | Kiểm tra |
|---|---|
| `Ports ... are in use` | Dừng đúng terminal cũ hoặc chọn cổng trống |
| Tunnel không nối được | Internet máy chủ, log trong `target/public-demo/<run>/`; launcher có số lần thử hữu hạn |
| Có URL nhưng chưa sẵn sàng | Chờ thông báo readiness, kiểm log edge và HTTP public |
| `ORIGIN_DENIED` | Dùng đúng HTTPS được cấu hình, không localhost trong chế độ proxy |
| QR không nhận khách | Đã mở bàn, đúng hostname hiện tại, còn giới hạn phiên |
| Quét ra quản lý | Đổi Browser/profile/thiết bị |
| Khách bỏ quên phiên | Xử lý hết việc rồi quản lý kết thúc phiên ở bàn |

Thông báo “URL được cấp” khác “đã sẵn sàng”. Khi dịch vụ/mạng không khả dụng, dùng [demo local](RUNBOOK.md). Không bỏ TLS, không công khai mật khẩu tạm/cookie/QR đang hoạt động.

## Phạm vi

Thanh toán là giả lập. Trình duyệt tự động qua tunnel không xác nhận camera, loa, Android/iOS hoặc mạng LAN vật lý. Kiểm trên các thiết bị sẽ dùng trước buổi demo theo [tiêu chí kiểm](TESTING.md#kiểm-trên-thiết-bị).

Tham chiếu triển khai: [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). Đây là công cụ demo có hostname ngẫu nhiên, không phải cam kết hạ tầng vận hành.
