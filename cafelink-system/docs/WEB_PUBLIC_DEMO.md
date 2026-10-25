# CafeLink V9.3 — demo Internet và QR cố định tại bàn

> **Bản hiện tại V9.3:** nếu có gói chạy sẵn `dist/CafeLink-Web-V9.3.zip`, giải nén rồi chạy START-PUBLIC.cmd, không cần build/JDK/Node. ZIP này được giữ riêng, không nằm trong GitHub repository. Khi clone source, chạy các lệnh bên dưới. Xem [hướng dẫn chạy](FINAL_RUNBOOK.md) và [checklist tự kiểm thử](WEB_USER_ACCEPTANCE.md). Kết quả public Chromium nằm trong [báo cáo cuối](../../report/CafeLink_Final_Report.md); điện thoại/camera thật vẫn cần người dùng kiểm.

Màn khách chia năm vùng: Thực đơn, Đơn đã gọi, Hỗ trợ, Thanh toán và Giỏ hàng. Kiến trúc và kết quả kiểm thử hiện tại nằm trong [báo cáo cuối](../../report/CafeLink_Final_Report.md).

**Luồng mới:** mở nhận khách cho toàn quán một lần → khách quét QR bàn → tạo phiên riêng trên trình duyệt → gọi món, thanh toán giả lập → quầy pha chế/giao đồ → phiên tự hoàn tất. Nhân viên không phải quan sát khách rời đi để đóng bàn hoặc chờ khách mới để mở lượt.

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
4. **Khách A:** gọi nhân viên. Chủ quán chuyển đơn qua **Bắt đầu pha chế → Pha chế xong → Đã mang ra bàn**. Nếu hỗ trợ còn chờ, phiên A chưa tự kết thúc.
5. **Chủ quán:** xử lý hỗ trợ A. Trang A hiện lời cảm ơn và nút **Bắt đầu lần đặt mới**. B vẫn tiếp tục phiên riêng. Bàn vẫn nhận khách, không cần bấm đóng/mở lượt.
6. **A đặt thêm:** bấm **Bắt đầu lần đặt mới**. Giỏ nháp đang soạn được giữ khi chuyển; khách vẫn xem được lịch sử đơn trước. Yêu cầu chưa rõ kết quả phải đối chiếu trước khi rời/chuyển phiên.
7. **Contribution phục hồi:** trên trình duyệt máy tính, dùng DevTools hoặc kịch bản kiểm thử để tạo mất phản hồi sau khi Core nhận đơn. Kết nối lại và đối chiếu: vẫn một đơn. Ngắt Wi-Fi đơn thuần không chắc tạo đúng thời điểm “Server đã nhận nhưng Client chưa biết”; không dùng tình huống không kiểm soát để kết luận chống trùng.

Thanh toán vẫn là **LOCAL_SIMULATOR, không thu tiền thật**. Không nhập số thẻ/thông tin ngân hàng. QR/web/WSS là cải tiến triển khai; contribution vẫn là receipt chống trùng và phục hồi theo loại yêu cầu + phạm vi phiên.

## 3. Ý nghĩa trạng thái bàn và phiên

| Trạng thái/thao tác | Ý nghĩa |
|---|---|
| Mở tất cả bàn | Bật nhận khách qua QR cố định cho cả 6 bàn; gọi lại không đổi QR hoặc xóa phiên/đơn |
| Đang nhận đơn | Khách mới có thể quét vào; không khẳng định bàn đang trống |
| Tạm dừng khách mới | Chặn tạo phiên mới ở bàn đó; không hủy phiên/đơn đang xử lý |
| Phiên riêng | Một membership/visit gắn cookie trình duyệt; tab cùng profile dùng chung phiên, trình duyệt/profile khác có phiên khác |
| Phiên tự kết thúc | Có ít nhất một đơn; mọi đơn đã PAID+SERVED hoặc CANCELLED; không còn hỗ trợ OPEN |
| Phiên trống bị bỏ dở | Có thể hết hạn sau 8 giờ, được dọn khi có lượt quét mới; không tự xóa đơn hoặc hỗ trợ đã tiếp nhận |
| Bắt đầu lần đặt mới | Khách chủ động tạo scope mới sau khi phiên hoàn tất; không tự mang giỏ/ý định cũ sang |

**Đếm phiên không phải đếm người đang ngồi tại quán.** Khách chưa trả tiền hoặc còn yêu cầu chưa xử lý không ngăn khách khác quét cùng QR. Bản hiện tại chưa tự hủy đơn bỏ dở theo giờ; giao dịch giả lập có hạn 15 phút và có thể thử lại/hủy trên đúng đơn. Không tự hủy đơn đã trả tiền hoặc suy khách đã rời bàn từ việc điện thoại offline.

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
| Khách quét lại sau khi phiên hoàn tất | Bấm Bắt đầu lần đặt mới; nếu đang ở trang join báo phiên cũ, rời phiên rồi vào lại. Nhật ký chưa rõ kết quả phải được đối chiếu trước |
| Nhiều người không vào thêm được | Gateway tối đa 32 bridge; tối đa 30 guest và 16 admin cùng chia sẻ tổng 32. Đây là giới hạn cấu hình demo, chưa phải công suất đã đo |

## 7. Kiểm thử và phạm vi đã xác minh

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-web.ps1 -Phase V9.3 -SkipInstall -SkipBrowserInstall
```

Gate V9.3 có 142 Java + 65 Chromium PASS. [Evidence gate](../../report/evidence/cafelink-v2/v9.3-gate/20261025-184703-1bdff3d4/summary.json) và [báo cáo cuối](../../report/CafeLink_Final_Report.md) ghi rõ run/phạm vi. Smoke Internet chạy tách trên DB fixture qua `web/tests/public-smoke.mjs`, nhận origin/mật khẩu bằng biến môi trường và không ghi mật khẩu vào kết quả. Không chạy smoke tạo đơn trên profile khách đang dùng.

Đã thử đường Internet bằng Chromium trên một máy. **Camera điện thoại thật, Android/iOS thực tế, hai thiết bị trên hai mạng và LAN vật lý chưa nghiệm thu**; cần thử trực tiếp trước buổi bảo vệ. WebSocket qua Cloudflare được hỗ trợ theo [FAQ chính thức](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/).
