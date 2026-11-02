# CafeLink V10.1 - Chạy và demo

Hướng dẫn source V10.1/schema 13. [Phân quyền V10.1](UPGRADE_V10_1_ROLES.md) hướng dẫn tạo nhân viên và kiểm thu hồi phiên. [V10](UPGRADE_V10.md) có các bước nghiệm thu mới; gói V9.4/RC4 ở mục 6 là mốc trước nâng cấp. Luồng hiện tại: QR cố định, phiên riêng, gửi đơn → quầy tiếp nhận → thanh toán giả lập → phục vụ.

## 1. Chạy từ source

Trên Windows, chuẩn bị PowerShell, JDK 17+ và Node.js 22.12+/npm. Tại gốc repo:

```powershell
cd cafelink-system
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-web.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-web.ps1 -Port 8088 -TcpPort 5058 -DatabasePath data/local-demo/cafelink.db
```

Giữ terminal mở. Vào **http://127.0.0.1:8088/admin**, đăng nhập local **`admin` / `CafeLink@123`**. DB mới tự tạo schema và menu mẫu; chạy lại không reset dữ liệu cũ.

Tại **Nhân viên → Thêm nhân viên**, quản lý tạo tài khoản riêng cho từng nhân viên. Nhân viên đăng nhập cùng `/admin` từ browser/profile khác; chỉ có bốn mục phục vụ. Không dùng chung tài khoản admin cho quầy.

Gateway nhận HTTP/WebSocket ở 8088, Core nhận TCP loopback ở 5058. Không cần mở thêm ServerMain hay Java Client cho người dùng website. Ctrl+C tại terminal dừng demo này.

## 2. Vào bàn và tạo nhiều Client

1. Quản lý chọn **Mở tất cả bàn**, vào **Bàn 1**, mở QR hoặc **Sao chép link đặt món**.
2. Mở nguyên link trong browser/profile độc lập. QR của một bàn có thể được nhiều khách dùng.
3. Mỗi khách nhận phiên riêng; cùng QR không có nghĩa dùng chung đơn hoặc hóa đơn.
4. Để demo hai khách trên một máy, dùng hai browser/profile độc lập. Hai tab thường hoặc các cửa sổ ẩn danh cùng phiên có thể dùng chung cookie.

Mỗi lần ADMIN đăng nhập, các bàn tạm ngưng nhận khách mới và ẩn QR; **Mở tất cả bàn** bật lại nhận khách. Phiên khách đang dùng vẫn được giữ và có thể gọi món; đăng nhập STAFF không thay đổi trạng thái nhận khách.

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
| 3 | Quầy tiếp nhận đơn hoặc từ chối với lý do | Chưa tiếp nhận thì khách chưa được thanh toán |
| 3b | Khách thanh toán giả lập sau khi quầy tiếp nhận | Đơn PAID mới được pha chế |
| 4 | Gọi hoặc bổ sung/rút hỗ trợ | Thông báo mới, xử lý đúng ticket và version |
| 5 | Theo dõi tiến độ | Chuyển pha chế → sẵn sàng → giao đủ |
| 6 | Thử đặt tiếp | Giỏ/đơn thuộc đúng khách; xem lịch sử theo quyền |
| 7 | Rời phiên khi rời quán | Phiên của khách đóng; các khách khác cùng bàn vẫn tiếp tục |

Thanh toán và giao đồ không tự kết thúc phiên. Nếu khách quên rời, quản lý vào chi tiết bàn → **Kết thúc phiên** → xác nhận. Thao tác này kết thúc tất cả phiên tại bàn, chỉ thành công khi không còn đơn chưa thanh toán/chưa giao và hỗ trợ đang mở; QR nhận khách vẫn giữ. Khách cũng không được rời phiên khi còn công việc chưa xử lý.

Khi cần ngừng đón khách toàn quán, quản lý chọn **Tạm ngưng tất cả bàn** và xác nhận: QR không nhận khách mới, các phiên hiện có tiếp tục hoạt động. Sau khi khách rời quán, chọn **Kết thúc tất cả phiên QR** để kiểm tra và kết thúc các phiên QR. Nếu một bàn còn công việc, danh sách bàn được hiển thị và không phiên nào bị đóng. Đây là thao tác kết thúc phiên, không tự tắt QR; cần tạm ngưng bàn nếu muốn ngừng nhận khách mới. Phiên cũ MANUAL được xử lý riêng.

Có thể minh họa thêm giá thay đổi khi còn giỏ, món ngừng bán, thanh toán thử thất bại rồi thử lại, hủy đơn chưa trả hoặc từ chối/hoàn giả lập trước pha chế. Bật chuông bằng thao tác của người dùng trước khi thử thông báo.

### Năm vùng trên màn hình khách

| Vùng | Nội dung và số đếm |
|---|---|
| Thực đơn | Xem ảnh, danh mục, tìm kiếm và chi tiết đồ uống; số món không phải số tồn kho |
| Đơn đã gọi | Theo dõi đơn đã gửi và tiến độ phục vụ; lịch sử lần trước có khung riêng |
| Hỗ trợ | Gọi nhân viên, bổ sung/rút yêu cầu; số đếm là lời gọi đang chờ |
| Thanh toán | Đơn UNPAID/PENDING cần trả tiền; giỏ nháp chưa phải khoản phải trả |
| Giỏ hàng | Số lượng, ghi chú, tạm tính; số đếm là tổng số phần đang chọn |

Thêm hai phần cùng món: Giỏ hàng tăng 2 nhưng Đơn đã gọi/Thanh toán chưa tăng. Sau khi gửi, vào Đơn đã gọi để xem chờ tiếp nhận. Quầy nhận đơn xong mới thanh toán giả lập; trả tiền xong tiếp tục theo dõi giao đồ. Năm mục điều hướng hiển thị từng vùng riêng, giữ nguyên giỏ và dữ liệu khi chuyển mục.

## 5. Minh họa mạng và contribution

Trước tiên giới thiệu một đơn bình thường: Browser → HTTP → Gateway → TCP → Core/DB; kết quả trở lại HTTP và trạng thái cập nhật qua WebSocket.

- Server đã nhận, phản hồi mất: giữ mã yêu cầu và lấy lại kết quả cũ.
- Chưa nhận đơn: khách quyết định còn muốn mua không.
- Lời gọi cũ bị bỏ: quyết định lưu tại Core chặn lệnh đến muộn.
- Core nhận trước quyết định bỏ: giữ công việc đã nhận, không xóa ticket/hoàn tiền để làm số đếm thấp.

Bật Network Offline chỉ minh họa gián đoạn; không chứng minh đúng điểm sau commit. Dùng [bộ thực nghiệm](WEB_EXPERIMENTS.md) để tạo lỗi trước chuyển lệnh/sau lưu có dữ liệu đối chiếu. [WEB_RECOVERY](WEB_RECOVERY.md) giải thích hai contribution.

## 6. Bản source và portable

Bản nộp V10.1/schema 13 chạy từ source bằng các lệnh ở mục 1-3. Thư mục `release/windows` là template đóng gói, chưa phải gói chạy có JRE/JAR/assets. Policy portable đang là `NOT_RELEASED`; không mở lại gói V9.4/RC4 để thử các chức năng mới. [Dữ liệu và phiên bản](WEB_RELEASE.md).

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
