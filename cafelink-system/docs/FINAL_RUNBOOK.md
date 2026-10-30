# CafeLink V9.4 - Chạy và demo

Hướng dẫn cho source web hiện tại và gói RC4 được cung cấp riêng. [README source](../README.md) có môi trường và lệnh test. Luồng chính là QR cố định, phiên riêng từng khách và trả trước giả lập.

## 1. Chạy từ source

Trên Windows, chuẩn bị PowerShell, JDK 17+ và Node.js 22.12+/npm. Tại gốc repo:

```powershell
cd cafelink-system
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-web.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-web.ps1 -Port 8088 -TcpPort 5058 -DatabasePath data/local-demo/cafelink.db
```

Giữ terminal mở. Vào **http://127.0.0.1:8088/admin**, đăng nhập local **`admin` / `CafeLink@123`**. DB mới tự tạo schema và menu mẫu; chạy lại không reset dữ liệu cũ.

Gateway nhận HTTP/WebSocket ở 8088, Core nhận TCP loopback ở 5058. Không cần mở thêm ServerMain hay Java Client cho người dùng website. Ctrl+C tại terminal dừng demo này.

## 2. Vào bàn và tạo nhiều Client

1. Quản lý chọn **Mở tất cả bàn**, vào **Bàn 1**, mở QR hoặc **Sao chép link đặt món**.
2. Mở nguyên link trong browser/profile độc lập. QR của một bàn có thể được nhiều khách dùng.
3. Mỗi khách nhận phiên riêng; cùng QR không có nghĩa dùng chung đơn hoặc hóa đơn.
4. Để demo hai khách trên một máy, dùng hai browser/profile độc lập. Hai tab thường hoặc các cửa sổ ẩn danh cùng phiên có thể dùng chung cookie.

Không chỉ gõ `/join`. Link QR chứa mã trong fragment; sau khi mở, ứng dụng có thể ẩn mã khỏi thanh địa chỉ. Muốn mở lại cho khách mới, lấy nguyên link từ màn QR của quản lý.

## 3. Public HTTPS cho điện thoại

Dừng local nếu dùng cùng cổng, rồi chạy tại `cafelink-system`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/public-demo.ps1 -SkipBuild -Port 19088 -TcpPort 19058 -DurationSeconds 1800
```

Dùng **HTTPS và mật khẩu tạm in trong terminal**, không dùng mật khẩu local. Mở bàn và quét QR bằng điện thoại Wi-Fi/4G/5G. URL public phải còn hoạt động và máy chủ phải bật/có Internet.

Hostname tunnel có thể đổi ở lần sau, khi đó lấy QR mới. Local/public dùng profile DB riêng. Core vẫn loopback. [Public demo](WEB_PUBLIC_DEMO.md) có cấu hình và log chẩn đoán; [LAN](LAN_ACCEPTANCE.md) mô tả đường kết nối trực tiếp có TLS.

## 4. Kịch bản chức năng

| Bước | Khách làm | Quầy quan sát/xử lý |
|---|---|---|
| 1 | Hai khách quét cùng QR, xem menu có ảnh | Cùng bàn nhưng phiên/đơn riêng |
| 2 | Thêm món, sửa số lượng/ghi chú, gửi đơn | Đúng mã đơn, bàn, món và tiền |
| 3 | Thanh toán giả lập thành công | Đơn PAID mới được pha chế |
| 4 | Gọi hoặc bổ sung/rút hỗ trợ | Thông báo mới, xử lý đúng ticket và version |
| 5 | Theo dõi tiến độ | Chuyển pha chế → sẵn sàng → giao đủ |
| 6 | Thử đặt tiếp | Giỏ/đơn thuộc đúng khách; xem lịch sử theo quyền |

Có thể minh họa thêm giá thay đổi khi còn giỏ, món ngừng bán, thanh toán thử thất bại rồi thử lại, hủy đơn chưa trả hoặc từ chối/hoàn giả lập trước pha chế. Bật chuông bằng thao tác của người dùng trước khi thử thông báo.

## 5. Minh họa mạng và contribution

Trước tiên giới thiệu một đơn bình thường: Browser → HTTP → Gateway → TCP → Core/DB; kết quả trở lại HTTP và trạng thái cập nhật qua WebSocket.

- Server đã nhận, phản hồi mất: giữ mã yêu cầu và lấy lại kết quả cũ.
- Chưa nhận đơn: khách quyết định còn muốn mua không.
- Lời gọi cũ bị bỏ: quyết định lưu tại Core chặn lệnh đến muộn.
- Core nhận trước quyết định bỏ: giữ công việc đã nhận, không xóa ticket/hoàn tiền để làm số đếm thấp.

Bật Network Offline chỉ minh họa gián đoạn; không chứng minh đúng điểm sau commit. Dùng [bộ thực nghiệm](WEB_EXPERIMENTS.md) để tạo lỗi trước chuyển lệnh/sau lưu có dữ liệu đối chiếu. [WEB_RECOVERY](WEB_RECOVERY.md) giải thích hai contribution.

## 6. Gói portable được cung cấp riêng

GitHub không kèm ZIP RC4. Các file trong `release/windows` là vật liệu đóng gói, không phải một bản chạy đã có JRE/JAR/assets.

Khi được cấp **CafeLink-Web-V9.4-RC4**, giải nén rồi mở PowerShell tại thư mục gói:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Verify-Package.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File Start-Local.ps1 -Port 8088 -TcpPort 5058
```

Gói có JRE 17; không cần cài JDK/Node để chạy. Có thể bấm `START-LOCAL.cmd`. Dừng local rồi dùng `START-PUBLIC.cmd` hoặc:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Start-Public.ps1 -Port 19088 -TcpPort 19058 -DurationSeconds 1800
```

Giữ `RELEASE.json` và `SHA256-MANIFEST.json` cùng gói. [Phiếu kiểm RC4](../../report/evidence/cafelink-v2/pre-feature-20261030/final-verification.json) có hash ZIP đã chốt; gói tự dựng sau này có hash riêng.

## 7. Dữ liệu và chạy lại demo

Source: dùng `-DatabasePath data/demo-moi/cafelink.db` và profile khách mới để có lần thử sạch. Không xóa DB/key khi chương trình đang dùng.

Portable: dừng launcher, dùng các công cụ có sẵn trong chính gói:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Backup-Demo.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File Reset-Demo.ps1
```

Thêm `-Public` để chọn profile public. Reset giữ dữ liệu trước reset trong backup; restore dùng đúng ZIP backup được tạo bởi công cụ. [WEB_RELEASE](WEB_RELEASE.md) ghi điều kiện/hash/key/media. Backup Server không bao gồm cookie/IndexedDB của điện thoại. Không xóa site data nếu còn yêu cầu cần đối chiếu.

## 8. Lỗi thường gặp

| Hiện tượng | Kiểm và xử lý |
|---|---|
| Cổng đang được dùng | Dừng đúng terminal demo cũ hoặc chọn hai cổng khác nhau và trống; không tắt mọi java.exe |
| Không tìm thấy `java`, `javac` hoặc npm | Kiểm JDK/Node và PATH; chạy từ gói hoàn chỉnh nếu đã được cấp |
| Chưa build giao diện | Chạy `scripts/build-web.ps1` tại source |
| Trang đặt món hiện quản lý | Dùng browser/profile khách khác, giữ link QR đầy đủ |
| `/join` báo thiếu mã | Lấy lại link từ màn QR; không chép URL sau khi fragment đã bị ẩn |
| Đăng nhập public sai mật khẩu | Đọc mật khẩu tạm của lần chạy hiện tại, không dùng mật khẩu local |
| Chạy lại vẫn thấy đơn cũ | Profile đang lưu bền; chọn DB/profile mới khi chủ động thử sạch |
| Điện thoại không mở được 127.0.0.1 | Dùng URL HTTPS public hoặc cấu hình LAN hợp lệ; loopback là máy của người mở |
| Website mở nhưng thao tác không được | Kiểm `/api/ready` và Chẩn đoán hệ thống; `/api/health` chỉ kiểm Gateway |

[Kiến trúc](FINAL_ARCHITECTURE.md) · [Protocol](FINAL_PROTOCOL.md) · [Kiểm thử](TESTING.md).
