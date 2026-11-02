# CafeLink V10.1 - demo Internet và QR cố định tại bàn

> **Bản hiện tại V9.4:** gói đã kiểm tại workspace là `dist/CafeLink-Web-V10.1-RC1.zip`; giải nén rồi chạy START-PUBLIC.cmd, không cần build/JDK/Node. ZIP giữ local, không tải kèm khi clone GitHub. [Bộ nghiệm thu thiết bị](WEB_DEVICE_ACCEPTANCE.md) tạo bản sao/profile riêng từ RC4 để thử điện thoại mà không đổi dữ liệu đang dùng. Khi clone source, chạy các lệnh bên dưới.

Màn khách chia năm vùng: Thực đơn, Đơn đã gọi, Hỗ trợ, Thanh toán và Giỏ hàng. Kết quả public/phiên bản/hash nằm trong [báo cáo nâng cấp V9.4](../../report/CafeLink_Hardening_20261030.md), báo cáo Word/PDF nằm ở [chỉ mục báo cáo](../../report/README.md). Nhóm đã xác nhận hoàn tất kiểm thao tác thực tế; [checklist](WEB_USER_ACCEPTANCE.md) được giữ cho lần kiểm lại.

**Luồng hiện tại:** mỗi lần quản lý đăng nhập, QR các bàn được tạm ngưng; bấm **Mở tất cả bàn** để bật nhận khách và tải QR. Khách quét QR sẽ có phiên riêng, gọi món và thanh toán giả lập. Bàn vẫn **Đang phục vụ** sau khi món được giao; phiên chỉ đóng khi khách bấm **Rời phiên** hoặc quản lý bấm **Kết thúc phiên**.

## 1. Chạy demo qua Internet

Cần Windows x64, JDK 17+, Node.js như hướng dẫn README và Internet trên laptop. Chạy từ PowerShell:

```powershell
cd D:\BTL-LTM\cafelink-system
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/public-demo.ps1 -Port 19088 -TcpPort 19058
```

Lệnh tự build Java/web, tải `cloudflared` vào `.tools` nếu thiếu, kiểm SHA-256, tạo địa chỉ HTTPS và khởi động Core/Gateway. Không cài dịch vụ Windows hoặc sửa cấu hình tunnel sẵn có. Lần tải đầu cần thêm thời gian; những lần sau có thể dùng `-SkipBuild` khi source không đổi:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/public-demo.ps1 -Port 19088 -TcpPort 19058 -SkipBuild
```

Đợi terminal in:

```text
Public demo: https://....trycloudflare.com/admin
Account: admin
Temporary admin password: ...
```

- Đăng nhập bằng **địa chỉ HTTPS vừa in** và mật khẩu tạm. Không dùng `CafeLink@123` cho chế độ public. Mật khẩu được tạo lại mỗi lần chạy và chỉ hiển thị trong terminal.
- Website quản lý tự mở; `-NoOpenBrowser` sẽ tắt việc tự mở này.
- Bấm **Mở tất cả bàn**. Mở **Bàn 1** → hiển thị QR hoặc bấm **Tải QR bàn**.
- Điện thoại của khách bật camera quét QR → **Vào bàn của tôi**. Điện thoại có thể dùng Wi-Fi khác hoặc dữ liệu di động; không cần cùng mạng với laptop, không cần cài chứng chỉ tự ký.
- Giữ laptop và terminal chạy. **Ctrl+C** kết thúc các tiến trình do lệnh này tạo; không dừng Server demo khác.

Cloudflare Quick Tunnel cấp hostname ngẫu nhiên, không yêu cầu tài khoản/domain; đây là công cụ demo, không có cam kết thời gian hoạt động. Nguồn: [tài liệu Quick Tunnels chính thức](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

**QR không đổi theo lượt khách.** Secret bàn được lưu trong DB và giữ qua restart cùng key. Tuy nhiên, hostname Quick Tunnel đổi khi chạy lại, nên QR chứa địa chỉ đầy đủ cũng cần hiển thị/tải lại khi khởi động tunnel mới. Muốn in QR dùng lâu dài cần domain cố định và named tunnel/deployment cố định; phần đó chưa được cấu hình trong bản demo này.

## 2. Kịch bản trình bày với giảng viên

1. **Chủ quán:** mở toàn bộ bàn bằng một lần bấm, chiếu QR Bàn 1 lên màn hình.
2. **Khách A:** dùng điện thoại quét, chọn đồ uống, xác nhận giỏ, chọn thanh toán thử thành công. Quầy nhận thông báo và chỉ được pha chế sau khi Server xác nhận thanh toán.
3. **Khách B:** dùng điện thoại/trình duyệt độc lập quét **cùng QR**. B vẫn thấy giỏ và đơn riêng, không thấy đơn hoặc lời gọi của A. Hai điện thoại có thể dùng hai mạng khác nhau.
4. **Khách A:** gọi nhân viên. Chủ quán chuyển đơn qua **Bắt đầu pha chế → Pha chế xong → Đã mang ra bàn**. Sau khi món được giao, A vẫn ở phiên hiện tại và có thể đặt thêm nếu muốn.
5. **Khách A:** bấm **Rời phiên** khi rời quán. Nếu còn đơn chưa thanh toán/chưa giao hoặc hỗ trợ đang mở, hệ thống giữ phiên và yêu cầu xử lý trước.
6. **Chủ quán:** nếu khách quên rời phiên, mở chi tiết bàn và bấm **Kết thúc phiên**. Hành động này đóng tất cả phiên tại bàn sau khi không còn đơn/hỗ trợ cần xử lý; QR nhận khách của bàn vẫn được bật.
7. **Contribution phục hồi:** trên trình duyệt máy tính, dùng DevTools hoặc kịch bản kiểm thử để tạo mất phản hồi sau khi Core nhận đơn. Kết nối lại và đối chiếu: vẫn một đơn. Ngắt Wi-Fi đơn thuần không chắc tạo đúng thời điểm “Server đã nhận nhưng Client chưa biết”; không dùng tình huống không kiểm soát để kết luận chống trùng.

Thanh toán vẫn là **LOCAL_SIMULATOR, không thu tiền thật**. Không nhập số thẻ/thông tin ngân hàng. QR/web/WSS là cải tiến triển khai; contribution vẫn là receipt chống trùng và phục hồi theo loại yêu cầu + phạm vi phiên.

## 3. Ý nghĩa trạng thái bàn và phiên

| Trạng thái/thao tác | Ý nghĩa |
|---|---|
| Admin đăng nhập | Tạm ngưng QR nhận khách của các bàn đã cấu hình; phiên khách hiện tại không bị đóng |
| Mở tất cả bàn | Bật nhận khách qua QR cố định cho cả 6 bàn và mới tải/hiển thị QR; gọi lại không đổi QR hoặc xóa phiên/đơn |
| Bàn trống · Đang nhận đơn | Không còn phiên khách đang hoạt động; khách mới có thể quét QR |
| Đang phục vụ | Có ít nhất một phiên khách đang hoạt động; vẫn giữ trạng thái sau thanh toán/giao món |
| Tạm ngưng | QR không nhận khách mới và không hiển thị QR; phiên đã mở vẫn tiếp tục |
| Phiên riêng | Một membership/visit gắn cookie trình duyệt; tab cùng profile dùng chung phiên, trình duyệt/profile khác có phiên khác |
| Rời phiên | Khách thu hồi quyền thiết bị hiện tại; bị chặn khi còn đơn chưa thanh toán/chưa giao hoặc hỗ trợ đang mở. Bàn trống khi không còn phiên khác |
| Kết thúc phiên | Quản lý thu hồi tất cả phiên ở bàn; chỉ thành công khi các đơn đã xử lý và hỗ trợ đã đóng |

**Đếm phiên không phải đếm người đang ngồi tại quán.** Phiên không tự đóng theo giờ; nếu khách rời đi mà quên bấm **Rời phiên**, quản lý có thể kết thúc phiên tại bàn sau khi xử lý hết đơn và hỗ trợ đang mở. Khách chưa trả tiền hoặc còn yêu cầu chưa xử lý không ngăn khách khác quét cùng QR. Giao dịch giả lập có hạn 15 phút; không tự hủy đơn đã trả tiền hoặc suy khách đã rời bàn từ việc điện thoại offline.

## 4. Dữ liệu demo và chạy lại

Mặc định script public dùng `data/public-demo/cafelink.db`, độc lập DB web cũ và E0. Restart không xóa dữ liệu. Để diễn lại từ dữ liệu sạch, chọn DB mới thay vì xóa nhầm DB đang dùng:

```powershell
$demoDb = 'data/public-demo/demo-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.db'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/public-demo.ps1 -Port 19088 -TcpPort 19058 -DatabasePath $demoDb -SkipBuild
```

Muốn giữ dữ liệu/QR qua restart phải giữ cả DB, file `.qr-key` đi kèm và thư mục `.media`. Chỉ sao lưu/xóa khi Server đã dừng. Đổi DB nghĩa là quán/demo mới, QR và quyền phiên trước không được chuyển sang.

## 5. Demo offline/localhost vẫn dùng được

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-web.ps1 -Port 19088 -TcpPort 19058 -DatabasePath data/local-auto-demo/cafelink.db
```

Mở `http://127.0.0.1:19088/admin`, đăng nhập `admin / CafeLink@123`, bấm **Mở tất cả bàn**. Mở link khách trong trình duyệt/profile khác hoặc cửa sổ riêng tư. QR localhost chỉ dùng trên chính máy đang chạy; muốn điện thoại khác mạng truy cập thì dùng script public.

## 6. Lỗi thường gặp

| Hiện tượng | Xử lý |
|---|---|
| `Ports ... are in use` | Ctrl+C đúng Server demo cũ hoặc chọn cặp cổng khác. Script không tự giết tiến trình đang dùng cổng |
| Cloudflare không cấp địa chỉ / lỗi 409 dịch vụ | Script thử tối đa 3 lượt và giữ log từng lượt trong `target/public-demo/<run>/`. Nếu dịch vụ vẫn lỗi, chạy demo localhost hoặc thử lại sau; không kết luận Core lỗi |
| HTTPS public chưa truy cập được | Xem `tunnel-attempt-*.log`, kiểm Internet laptop. Script kiểm `/api/health` qua Internet trước khi công bố sẵn sàng |
| `ORIGIN_DENIED` / đăng nhập localhost không được khi chạy public | Dùng đúng địa chỉ HTTPS đã in; proxy mode chỉ chấp nhận Origin đó |
| Khách báo đang ở phiên quản lý | Quản lý và khách dùng trình duyệt/profile hoặc thiết bị khác nhau |
| Điện thoại quét QR của lần chạy trước | Hiển thị/tải QR mới chứa hostname tunnel hiện tại |
| Bật toàn quán báo còn lượt cũ | Hoàn tất các lượt MANUAL theo quy trình V7 trước, hoặc chọn DB demo mới. Không tự đổi quyền/lượt đang hoạt động |
| Khách bỏ quên phiên | Quản lý xử lý đơn/hỗ trợ còn mở rồi vào chi tiết bàn, bấm **Kết thúc phiên** |
| Nhiều người không vào thêm được | Gateway tối đa 32 bridge; tối đa 30 guest và 16 admin cùng chia sẻ tổng 32. Đây là giới hạn cấu hình demo, chưa phải công suất đã đo |

## 7. Kiểm thử và phạm vi đã xác minh

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-web.ps1 -Phase V10.1 -SkipInstall -SkipBrowserInstall
```

Kiểm hiện hành V9.4/RC4 gồm 164 Java và 71 Chromium, xem [TESTING](TESTING.md), [phiếu kiểm cuối](../../report/evidence/cafelink-v2/pre-feature-20261030/final-verification.json) và [báo cáo hiện tại](../../report/README.md). Smoke Internet chạy tách trên DB fixture qua `web/tests/public-smoke.mjs`, nhận origin/mật khẩu bằng biến môi trường và không ghi mật khẩu vào kết quả. Không chạy smoke tạo đơn trên profile khách đang dùng.

Các run tự động lưu tại repo thử đường Internet bằng Chromium trên một máy; chúng không cung cấp số đo camera, Android/iOS hoặc LAN vật lý. Nhóm đã xác nhận hoàn thành kiểm thao tác thực tế riêng, không quy đổi xác nhận đó thành số đo tự động. WebSocket qua Cloudflare được hỗ trợ theo [FAQ chính thức](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/).
