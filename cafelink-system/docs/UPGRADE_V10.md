# CafeLink V10 - UI/UX và quy trình tiếp nhận đơn

Yêu cầu triển khai ngày 01/11/2026. Giữ nguyên báo cáo đã chốt và các raw thực nghiệm cũ. Chưa push trước khi người dùng kiểm thử.

## Phạm vi theo góp ý giảng viên

1. Khách gửi đơn -> chờ nhân viên tiếp nhận -> được tiếp nhận mới thanh toán -> quầy pha chế/giao đồ. Nhân viên có thể từ chối trước thanh toán với lý do hết món/nguyên liệu. Không tự ý đổi món hoặc thu tiền trước tiếp nhận.
2. QR đặt món hiện trên từng thẻ bàn, đồng thời vẫn mở được chi tiết bàn. Thay các hướng dẫn chạy thử bằng nội dung dành cho khách/quầy thực tế.
3. Thu chi: tổng thu, hoàn tiền, thu ròng, chi phí và chênh lệch; lọc ngày, biểu đồ theo ngày, danh sách phiếu chi và xuất CSV. Chi phí do quản lý ghi, có lịch sử hủy; không xóa giao dịch gốc.
4. Chủ quán cấu hình tên thuế, tỷ lệ và cách tính trong/ngoài giá. Hóa đơn hiển thị tiền hàng, thuế và tổng. Mặc định 0%; cấu hình là giá trị do chủ quán chọn, không phải tư vấn mức thuế. Chốt tiền/thuế theo từng đơn; đổi cấu hình không đổi đơn cũ.

## Thiết kế

Tham khảo UI UX Pro Max: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill. Đã đọc SKILL.md, tìm design-system cho restaurant/cafe và hướng dẫn React. Chọn màu kem/nâu, bề mặt rõ, khoảng cách nhất quán, điều hướng 5 mục trên màn khách, dashboard thao tác rõ cho quầy. Không bê landing page hoặc màu không phù hợp vào quy trình đặt món.

Màn khách ưu tiên điện thoại; chọn món -> giỏ -> đơn đang chờ/được nhận -> thanh toán. Trạng thái tiếp nhận, tiền và phục vụ được phân biệt. Thông báo thành công/lỗi, hành động đang chạy, focus bàn phím và giảm chuyển động cần rõ ràng.

## Các pha và kiểm thử

- P0: chụp giao diện trước thay đổi vào bộ ảnh riêng; lưu source/hash và dữ liệu demo riêng.
- P1: migration giữ dữ liệu cũ; tiếp nhận/từ chối, khóa thanh toán trước tiếp nhận; kiểm quyền, gửi trùng, cạnh tranh hủy/tiếp nhận.
- P2: thuế có phiên bản, tính số nguyên VND/làm tròn nhất quán, snapshot hóa đơn, hoàn đúng số đã thu; phiếu thu chi có quyền, lịch sử và lọc ngày đúng múi giờ quán.
- P3: giao diện khách/quầy, QR trên sơ đồ, thu chi và cài đặt; bỏ nội dung hướng dẫn test khỏi luồng sản phẩm.
- P4: build/typecheck, Java unit/integration, browser E2E luồng mới, hồi quy QR/quyền/phục hồi, responsive 375/768/1024/1440, keyboard/reduced-motion; chụp ảnh sau và hướng dẫn chạy.

Không đánh dấu kiểm điện thoại vật lý hoặc thanh toán ngân hàng là đã chạy. CafeLive đang tạm dừng và không thuộc tính năng cần phát triển trong pha này.

## Chạy bản mới để nghiệm thu

Mở PowerShell tại workspace, chạy từ source, không mở lại gói V9.4:

```powershell
cd D:\BTL-LTM\cafelink-system
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-web.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-web.ps1 -Port 19788 -TcpPort 19758 -DatabasePath data/v10-review/cafelink.db
```

Vào **http://127.0.0.1:19788/admin**, đăng nhập local `admin / CafeLink@123`. Chọn **Mở tất cả bàn**. Khách quét QR ngay trên thẻ bàn, hoặc vào chi tiết bàn để sao chép link. Khi thử trên cùng máy, mở nguyên link bằng một browser/profile khác với quản lý; `/join` không có mã bàn không tạo được phiên khách.

DB review được giữ khi chạy lại. Muốn bắt đầu sạch, dừng terminal bằng Ctrl+C rồi đổi sang một đường dẫn mới, ví dụ `data/v10-review-02/cafelink.db`. Không cần xóa dữ liệu đang dùng. Trước khi dùng DB cũ với V10, dừng Server và sao lưu: migration tăng schema lên 12; bản V9.4 không đọc ngược DB này.

Demo public vẫn dùng script source sau khi build:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/public-demo.ps1 -SkipBuild -Port 19088 -TcpPort 19058 -DurationSeconds 1800
```

Dùng URL HTTPS và mật khẩu quản lý tạm mà terminal in. Không dùng mật khẩu local thay mật khẩu public. Lấy QR từ chính địa chỉ public để điện thoại mở được. Các cổng phải trống; script không dừng tiến trình khác.

## Các thao tác cần kiểm lại

1. **Thực đơn/giỏ:** tìm kiếm không dấu, lọc nhóm, xem ảnh, số lượng và ghi chú từng phần. Năm mục hiển thị riêng; chuyển mục vẫn giữ giỏ. Điều hướng dưới trên điện thoại không che nút chính.
2. **Chờ tiếp nhận:** khách gửi đơn. Đơn hiện ở Đơn đã gọi, trạng thái Chờ tiếp nhận; nút thanh toán bị khóa. Tại quầy, vào Quầy pha chế, kiểm nội dung rồi chọn Tiếp nhận đơn. Khách nhận thông báo, được mở thanh toán; trả tiền xong đơn mới được pha chế.
3. **Hết nguyên liệu:** gửi một đơn mới rồi chuyển món sang hết bán ở quản lý. Tiếp nhận bị Core từ chối. Quầy chọn Từ chối đơn, nhập lý do; khách thấy lý do trong đơn, không bị thu tiền. Khách chọn lại món khác bằng giỏ mới.
4. **Thông báo:** từ thực đơn mở thông báo quán đã tiếp nhận, trang phải chuyển đúng sang Đơn đã gọi. Mở thông báo không tự thanh toán hoặc tự xử lý hỗ trợ.
5. **Thuế:** vào Cài đặt quán, chọn tên/tỷ lệ và trong/ngoài giá. Ví dụ minh họa 8% ngoài giá: món 30.000 đồng thành 32.400 đồng, thuế 2.400 đồng. Đây là cấu hình thử, không phải mức thuế áp dụng bắt buộc. Đổi sang 10% sau khi đơn được gửi: đơn cũ vẫn giữ 32.400 đồng; đơn mới dùng cấu hình mới.
6. **Thu chi:** thanh toán một đơn rồi vào Thu chi, chọn khoảng ngày. Đơn đang chờ/đơn chưa thanh toán không cộng vào thu. Ghi khoản chi, kiểm tổng chi/chênh lệch và CSV. Hủy phiếu phải có lý do, phiếu gốc còn trong sổ và không cộng vào tổng chi.
7. **Hoàn tiền:** từ chối/hoàn giả lập một đơn đã trả nhưng chưa pha chế. Lịch sử giữ tiền thu ban đầu; báo cáo cộng khoản hoàn theo ngày hoàn, không sửa lùi ngày thu. Chênh lệch dòng tiền có thể âm, chưa phải lợi nhuận kế toán.
8. **Phục hồi:** vẫn ghi ý định trước gửi, giữ command ID và đối chiếu khi mất phản hồi. Riêng thao tác tài chính mới dùng staff journal; mất phản hồi ghi chi không được ghi thêm phiếu để thay thế. Nhận lệnh ở Core khác bước tiếp nhận đơn của nhân viên.
9. **Phiên và gọi tiếp:** sau khi giao đủ, khách vẫn ở phiên và có thể đặt thêm. Phiên chỉ kết thúc khi khách rời phiên hoặc quản lý kết thúc các phiên tại bàn; các đơn chưa thanh toán/chưa giao và hỗ trợ đang mở phải được xử lý trước.

## Tệp triển khai chính

| Phần | Mã nguồn |
|---|---|
| Tiếp nhận, guard, migration | `CafeService.java`, `OrderPayments.java`, `OrderResolutions.java`, `Database.java` |
| Tính thuế, snapshot, sổ chi và báo cáo | `StoreFinance.java`, `Models.java` |
| Quầy và QR trên thẻ | `App.tsx`, `AcceptanceQueue.tsx`, `TableQr.tsx` |
| Khách, giỏ, tiến độ và thanh toán | `Guest.tsx`, `GuestWorkspace.tsx`, `GuestOrders.tsx`, `GuestPayments.tsx`, `OrderTotals.tsx` |
| Thu chi và cấu hình | `FinanceReport.tsx`, `TaxSettingsPanel.tsx` |
| Giao diện và phục hồi | `design-system.css`, `orderRecovery.ts`, `staffJournal.ts`, `Notifications.tsx` |
| Kiểm nghiệp vụ mới | `StoreOperationsTest.java`, `web/tests/v10.spec.ts` |

Không thêm API bỏ qua TCP hoặc quyền để tiện demo. Core vẫn quyết định việc tiếp nhận, giá/thuế, trả tiền và báo cáo; Gateway chuyển tiếp lệnh. Kiểm thử cũ được cập nhật thao tác thật qua các mục giao diện; không bật ẩn/hiện bằng CSS để làm test đạt.

## Ảnh trước/sau và trạng thái bàn giao

- Trước nâng cấp: `dist/CafeLink-UI-Before-20261101/index.html` tại gốc workspace, 20 ảnh.
- Sau nâng cấp: `dist/CafeLink-UI-V10-20261101/index.html`, 31 ảnh, có bộ lọc màn khách/quầy/tài chính. Đây là ảnh ứng dụng chạy với dữ liệu riêng, không phải mockup hoặc dữ liệu quán.
- Báo cáo Word/PDF và evidence lịch sử đã được gỡ khỏi repository. Số đo cũ không đổi nhãn thành V10.
- Chưa push; để người dùng nghiệm thu trước. CafeLive tiếp tục tạm dừng.
- V10 hiện chạy từ source; chưa phát hành portable mới. Script đóng gói đã chặn việc gắn source 10.0.0/schema 12 vào nhãn V9.4/schema 11. Gói cũ giữ nguyên.
- Chưa xác nhận bằng điện thoại vật lý, chưa có ngân hàng/hoá đơn điện tử pháp lý, quản lý tồn kho theo định lượng hoặc kế toán đầy đủ. Đây là các giới hạn thực tế, không được suy từ test browser.

Các phép đo tải mới phải dùng bộ phát đã có bước tiếp nhận của nhân viên. `renderMs` chỉ ghi khi thẻ đơn thực sự hiển thị, không đếm thẻ nằm trong mục ẩn. Lượt smoke mới dùng để kiểm công cụ hoạt động, không thay benchmark trong báo cáo.

## Kết quả kiểm ngày 01/11/2026

| Phạm vi | Kết quả đã chạy |
|---|---|
| Java unit/integration và hồi quy | 177 ca, 0 lỗi, 0 bỏ qua; gồm 13 ca mới về tiếp nhận, thuế, thu chi và migration V11 |
| Chromium toàn bộ luồng đang phát triển | 80 ca, 0 lỗi, 0 bỏ qua; CafeLive đang tạm dừng nên không nằm trong bộ mặc định |
| WebKit, các chức năng V10 | 9 ca, 0 lỗi, 0 bỏ qua |
| Firefox, các chức năng V10 | 9 ca, 0 lỗi, 0 bỏ qua |
| Build | Java package, TypeScript/Vite production và experiment build đạt |
| Bố cục/tương tác | 375×844, 844×390, 768×1024, 1440×900; cả 5 mục khách không tràn ngang, nút điều hướng cao ít nhất 44px; dialog giữ/trả focus, Escape và reduced-motion |
| Kiểm tự động khả năng truy cập | 15 màn/trạng thái, 0 vi phạm được phát hiện theo các nhóm WCAG đã chọn; 10 mục công cụ không tự kết luận, không coi đây là chứng nhận truy cập toàn diện |
| QR trên thẻ | Cả 6 QR được giải mã độc lập, khớp link đúng bàn |
| Công cụ đo | Smoke 1 khách, làm nóng 1 giây/đo 3 giây, 3 flow đo hoàn tất; kiểm barrier sẵn sàng đạt. Không suy ra công suất hoặc benchmark V10 từ lượt nhỏ này |
| Script/gói | PowerShell parse và `git diff --check` đạt; guard từ chối đóng source V10 thành gói V9.4 trước khi tạo output |

Bằng chứng local: `cafelink-system/target/v10-verification-20261101/summary.json`, JUnit XML, JSON từng engine, log và manifest mã nguồn/JAR/assets. Không cộng các số ca khác lớp thành tỷ lệ bao phủ hoặc khẳng định không còn lỗi. Các bước nghiệm thu điện thoại thật do người dùng thực hiện sau.

Với WebKit, hành trình thử bốn kích thước có thời hạn 90 giây vì mô phỏng chạm/cuộn tốn thời gian hơn; giữ nguyên các kiểm tra. Khi đặt đơn thứ hai, test chờ ID mới thay vì đọc lại đơn cũ trong snapshot. Không nới kiểm quyền, tiền, thuế hoặc bước tiếp nhận để làm test đạt.
