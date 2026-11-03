# CafeLink - Chạy và demo

Hướng dẫn sử dụng source V10.1 trên Windows. Client là Browser khách/quầy; Server chạy Java Gateway và TCP Core. [Môi trường và build](../README.md) · [Hướng dẫn nghiệp vụ](USER_GUIDE.md).

## Chuẩn bị

Từ thư mục `cafelink-system`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-web.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-web.ps1 -Port 8088 -TcpPort 5058 -DatabasePath data/local-demo/cafelink.db
```

Giữ terminal chạy. Mở **http://127.0.0.1:8088/admin**, local **admin / CafeLink@123**. Quản lý bấm **Mở tất cả bàn**, lấy QR/link Bàn 1. Dùng nguyên link có mã, không gõ riêng `/join`.

Chuẩn bị một profile quản lý và hai profile/thiết bị khách độc lập. Các cửa sổ riêng tư của cùng Browser có thể dùng chung kho cookie; hai tab không đủ chứng minh hai khách độc lập.

## Demo 1 - Một vòng phục vụ và phiên riêng

| Bước | Thao tác | Quan sát |
|---|---|---|
| 1 | Cho xem QR Bàn 1; khách A vào và thêm món | Menu/giỏ riêng, thêm món chưa tạo đơn |
| 2 | A gửi đơn | Quầy thấy chờ tiếp nhận; A chưa được trả tiền |
| 3 | Quầy tiếp nhận | A có thể thanh toán; nếu không phục vụ được, từ chối đơn chưa trả kèm lý do |
| 4 | A giả lập thanh toán thành công | Không có tiền thật; tiền/thuế được Core xác nhận |
| 5 | Quầy pha chế → sẵn sàng → đã mang ra | A nhận cập nhật, phiên vẫn có thể gọi tiếp |
| 6 | B dùng profile khác quét cùng QR | Cùng bàn, không thấy đơn/giỏ của A |
| 7 | A gọi hỗ trợ; quầy phản hồi/xử lý | Ticket và thông báo đồng bộ hai phía |

Nếu có thời gian, giới thiệu cấu hình thuế, thu chi hoặc STAFF. Tạm ngưng nhận khách QR khác đóng phiên; chỉ kết thúc khi đã hết công việc.

## Demo 2 - Phục hồi có kiểm soát

Ngắt mạng thông thường không xác định được request đã đến Core hay chưa. Hai test dưới tạo đúng điểm lỗi và kiểm kết quả qua hệ thống thật. Sau build, cài Chromium của Playwright nếu cần rồi chạy từ `web`:

```powershell
cd web
npx.cmd playwright install chromium
npx.cmd playwright test tests/automatic.spec.ts --grep "Mất phản hồi đặt món ở phiên riêng"
npx.cmd playwright test tests/orders.spec.ts --grep "lookup tombstone"
```

- Test thứ nhất cho Server lưu đơn rồi làm mất response; reload/đối chiếu vẫn một đơn.
- Test thứ hai bỏ lời gọi chưa nhận, làm mất phản hồi của quyết định bỏ rồi giao lệnh gốc đến muộn; tombstone chặn tạo ticket. Fixture test này dùng visit MANUAL để kiểm cùng journal/receipt/barrier, khác màn QR AUTO của demo nghiệp vụ.

Mỗi lệnh khởi chạy Core/Gateway/DB riêng ở **18080/18081**; giữ hai cổng trống. Mặc định headless; thêm `--headed` nếu muốn hiện Browser và luyện trước vì test chạy nhanh. Kết quả PASS chỉ xác nhận tình huống được kiểm. [Phục hồi](RECOVERY.md) giải thích hai thứ tự nhận/bỏ.

## Demo public bằng điện thoại

Sau build, tại `cafelink-system`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/public-demo.ps1 -SkipBuild -Port 19088 -TcpPort 19058 -DurationSeconds 1800
```

Đợi terminal báo sẵn sàng, dùng URL HTTPS/mật khẩu tạm, mở bàn và quét QR. Điện thoại có thể ở mạng khác. Giữ laptop/tunnel chạy; Ctrl+C kết thúc các tiến trình do launcher tạo. [Public demo](PUBLIC_DEMO.md).

## Dữ liệu và chạy lại

Chạy lại cùng DB giữ dữ liệu. Dừng bằng Ctrl+C trước khi đổi profile. Để diễn tập sạch mà vẫn giữ dữ liệu đã có:

```powershell
$demoDb = 'data/local-demo/demo-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.db'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-web.ps1 -Port 8088 -TcpPort 5058 -DatabasePath $demoDb
```

DB mới không xóa cookie/IndexedDB Browser. Dùng profile khách mới, hoặc đối chiếu và rời phiên cũ trước. Không xóa site data khi còn thao tác chưa rõ. Local/public có DB riêng. [Sao lưu dữ liệu](DEPLOYMENT.md).

## Xử lý lỗi

| Hiện tượng | Xử lý |
|---|---|
| Cổng bận | Dừng đúng terminal của mình hoặc chọn cặp cổng trống; không tắt mọi Java |
| `/join` thiếu mã | Sao chép nguyên link từ bàn hoặc quét QR của lần chạy hiện tại |
| Trang khách ra quản lý | Dùng Browser/profile độc lập |
| Bàn từ chối khách | Kiểm đã mở nhận khách, link đúng Server và chưa hết giới hạn phiên |
| Thanh toán bị chặn | Kiểm đã tiếp nhận và đúng trạng thái đơn |
| `MENU_CHANGED` / `TAX_CHANGED` | Xem lại giỏ và tổng theo dữ liệu Server |
| Mất phản hồi | Đối chiếu bằng mã gốc; không tạo đơn thay thế |
| Public lỗi Internet | Dùng demo local đã chuẩn bị, kiểm log launcher và mạng |

Địa chỉ `127.0.0.1` luôn chỉ chính thiết bị đang mở. Trên điện thoại, dùng HTTPS public hoặc TLS LAN hợp lệ, không dùng localhost của laptop.
