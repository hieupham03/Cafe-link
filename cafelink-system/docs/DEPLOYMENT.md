# CafeLink - Triển khai và quản lý dữ liệu

Hình thức chạy của repository là build source Java/web theo [README source](../README.md). Gateway và Core cùng tiến trình; chỉ Gateway nhận Browser, Core giữ loopback. [Chạy local](RUNBOOK.md) · [Public HTTPS](PUBLIC_DEMO.md).

## Profile dữ liệu

`-DatabasePath` chọn file SQLite. Đường dẫn tương đối giải từ `cafelink-system`; mặc định `data/v2/cafelink.db`. Mỗi môi trường nên có profile riêng, ví dụ local/public/test.

| Thành phần | Vị trí/ý nghĩa |
|---|---|
| DB | Menu, giá/thuế đã chốt, đơn, payment, ticket, quyền, receipt và audit |
| Khóa QR | Mặc định `<DatabasePath>.qr-key`, hoặc đường dẫn `-QrKeyFile` đã cấu hình |
| Media | `<tên DB>.media` cạnh DB; ảnh mẫu có trong assets |
| Browser | Cookie và IndexedDB riêng theo origin/profile, không nằm trong DB Server |

Mở DB mới tự tạo schema 13, tài khoản quản lý local, sáu bàn và tám món. Chạy lại giữ dữ liệu. Đổi DB không chuyển quyền/giỏ từ môi trường khác. Đổi hostname public tạo origin Browser khác; QR/link phải khớp hostname hiện tại.

## Sao lưu và khôi phục source

1. Đối chiếu các lệnh chưa rõ kết quả; ghi lại profile và cấu hình chạy.
2. Dừng đúng terminal Server bằng Ctrl+C, đợi tiến trình thoát.
3. Sao chép toàn bộ thư mục profile sang nơi sao lưu, gồm DB, khóa và media. Nếu dùng khóa/ảnh ở vị trí riêng, lưu kèm chúng.
4. Giữ bản sao độc lập trước khi thay đổi hoặc dùng runtime/schema khác.
5. Khi khôi phục, tạo thư mục profile riêng từ bản sao, trỏ `-DatabasePath`/`-QrKeyFile` đúng vị trí và chạy bằng source phù hợp schema.
6. Kiểm menu/ảnh, đơn, thu chi, QR và quyền; Browser có thể cần đăng nhập/quét lại. Không tự gộp journal của origin khác.

Không chép riêng DB khi Server đang ghi WAL. Không dùng runtime không hỗ trợ schema để mở ngược DB. Sao lưu Server không tái dựng được ý định Browser chưa từng tới Server.

## Tạo môi trường diễn tập sạch

Dừng phiên chạy của mình, chọn DB mới và profile Browser mới:

```powershell
$demoDb = 'data/local-demo/demo-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.db'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-web.ps1 -Port 8088 -TcpPort 5058 -DatabasePath $demoDb
```

Cách này giữ nguyên dữ liệu đã có. Không xóa cookie/journal để giả định đơn chưa rõ đã được hủy.

## LAN và HTTPS trực tiếp

Điện thoại cần secure context cho Web Locks/Web Crypto. `127.0.0.1` trên điện thoại chỉ điện thoại, không phải laptop. Với LAN trực tiếp, dùng địa chỉ máy chủ, chứng chỉ TLS được thiết bị tin cậy và cấu hình origin/keystore phù hợp. HTTP qua IP LAN không thay được HTTPS.

`run-web.ps1` hỗ trợ `-BindAddress`, `-KeyStore` và `-PublicOrigin`; mật khẩu keystore lấy từ `CAFELINK_KEYSTORE_PASSWORD`. Keystore/chứng chỉ là cấu hình riêng của người triển khai, không đưa vào Git. Chỉ mở cổng Gateway trên mạng cần dùng; Core tiếp tục loopback. Không tắt kiểm chứng TLS để vượt lỗi chứng chỉ. Đối với demo khác mạng, [Quick Tunnel](PUBLIC_DEMO.md) là đường chạy được tự động cấu hình.

## Gói phân phối

`release/` chứa template launcher, runtime pin, công cụ sao lưu/khôi phục và kiểm manifest. `release/documentation.json` là policy phiên bản/schema và điều kiện tạo portable; trạng thái policy quyết định có được tạo gói hay không. Một source build thành công không tự là chứng nhận cho gói JRE.

Chỉ chạy gói có RELEASE/VERIFICATION và hash khớp chính artifacts trong gói đó. Không chọn gói theo tên thư mục local. README này hướng dẫn chạy source; fixture ZIP đối chứng trong `dist/` là đầu vào kiểm thử, không là gói ứng dụng để demo.

## Giới hạn vận hành

Quick Tunnel không cung cấp địa chỉ cố định hoặc SLA. Để dùng lâu dài cần domain/HTTPS ổn định, quản lý quyền truy cập, backup được kiểm khôi phục và đo tải trong môi trường triển khai. QR có thể được chia sẻ, không chứng minh khách đang có mặt. Thanh toán và hoàn của ứng dụng là giả lập.
