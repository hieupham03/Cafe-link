# V9.4 - Checklist người dùng tự kiểm thử

**Bản phần mềm hiện tại:** RC4, schema 11. Kết quả tự động và hash nằm trong [báo cáo V9.4](../../report/CafeLink_Hardening_20261030.md). Các dòng dưới đây vẫn là kết quả của người kiểm, không tự chuyển thành Đạt vì test máy đã qua. [Bộ nghiệm thu thiết bị](WEB_DEVICE_ACCEPTANCE.md) chuẩn bị profile riêng, launcher và mẫu ghi kết quả để thử sau.

**Cập nhật:** người dùng đã xác nhận hoàn thành kiểm thao tác thực tế. Bảng dưới giữ mẫu/trạng thái ban đầu để dùng cho lần kiểm lại; không tự tạo kết quả thiết bị chi tiết khi chưa có phiếu từng ca. Kiểm phần mềm tự động và xác nhận thực tế được phân biệt trong [TESTING](TESTING.md).

| Mã | Thao tác | Kết quả mong đợi | Người dùng kiểm |
|---|---|---|---|
| U01 | Giải nén sang thư mục mới, mở START-LOCAL | Server lên, không cần JDK/Node; admin đăng nhập được | Chưa chạy |
| U02 | Mở tất cả bàn hai lần | Sáu bàn nhận khách; không reset lượt đang hoạt động | Chưa chạy |
| U03 | Hai browser/profile quét cùng QR | Hai phiên và giỏ riêng, cùng địa chỉ giao đồ | Chưa chạy |
| U04 | Tìm món, xem ảnh, thay số lượng, xóa món | Giỏ và tổng tiền đúng, không tràn màn hình | Chưa chạy |
| U05 | Đặt món, thanh toán thành công giả lập | Một đơn PAID, quầy nhận việc, khách thấy tiến độ | Chưa chạy |
| U06 | Thanh toán thất bại/hủy/thử lại | Không tự PAID, không tạo đơn mới để thử lại giao dịch | Chưa chạy |
| U07 | Gọi hỗ trợ nhiều lần khi một yêu cầu còn mở | Không tạo nhiều ticket OPEN cùng loại cho một phiên | Chưa chạy |
| U08 | Quầy xử lý hỗ trợ; pha chế → sẵn sàng → giao | Đúng trạng thái, đúng người nhận; hoàn tất phiên khi hết việc | Chưa chạy |
| U09 | Đổi giá/hết món sau khi khách đã thêm giỏ | Báo thay đổi, không âm thầm lấy giá cũ để đặt đơn mới | Chưa chạy |
| U10 | Upload ảnh món, restart cùng profile | Ảnh và dữ liệu vẫn còn | Chưa chạy |
| U11 | Đang soạn đơn thứ hai thì quầy giao xong đơn đầu | Giỏ vẫn truy cập được; chuyển lần đặt giữ nháp, không tự tạo đơn | Chưa chạy — V9.1 |
| U12 | Chuyển lần đặt, reload rồi xem đơn trước | Giỏ và lịch sử riêng vẫn đúng, không lộ đơn browser khác | Chưa chạy — V9.1 |
| U13 | Rời phiên khi còn đơn PAID/ticket OPEN; rời khi chỉ còn nháp | Còn việc bị chặn; nháp cần xác nhận | Chưa chạy — V9.1 |
| U14 | Quầy từ chối đơn PAID chưa pha chế | Một bản ghi hoàn giả lập có lý do; giữ khoản thu gốc | Chưa chạy — V9.1 |
| U15 | Thu ngân hủy đơn chưa trả bị bỏ dở | Giao dịch chờ bị hủy, không pha chế/không ghi thu tiền | Chưa chạy — V9.1 |
| U16 | Nhận đủ đồ rồi muốn xin thêm nước | Có đường hỗ trợ mới, không bắt buộc mua thêm món | Chưa chạy — V9.1 |
| U17 | Hai phần cùng món nhưng ghi chú khác, sửa số lượng rồi reload | Hai dòng và nội dung đúng ở khách/quầy/hóa đơn | Chưa chạy — V9.2 |
| U18 | Bổ sung/rút ticket đang mở, nhân viên xử lý phiên bản cũ | Một ticket có lịch sử; thao tác version cũ bị chặn | Chưa chạy — V9.2 |
| U19 | Bật chuông rồi reload/đổi tab | Nhớ lựa chọn, hiển thị đúng cần kích hoạt; thử âm thực tế | Chưa chạy — V9.2 |
| U20 | Sửa ảnh/mô tả, sau đó đổi giá | Trình bày không khóa giỏ; đổi giá cần xác nhận | Chưa chạy — V9.2 |
| U21 | Dừng nhận đơn toàn quán; thanh toán/giao đơn đã nhận | Đúng phạm vi công tắc, không làm mất nghĩa vụ cũ | Chưa chạy — V9.2 |
| U22 | Nhân viên tra mã hỗ trợ khi mất phản hồi | Tìm đúng kết quả mà không gửi lại/thu tiền tự động | Chưa chạy — V9.2 |
| U23 | Từ quản lý bấm mở trang đặt món cùng browser, sau đó copy link sang browser riêng | Bản sửa QR giải thích phiên dùng chung; link còn đầy đủ mã, khách vào đúng bàn; admin không bị đăng xuất | Chưa chạy — bản sửa QR |
| U24 | Dùng năm ô điều hướng khách, thêm/gửi/trả tiền và gọi/rút hỗ trợ trên máy tính/điện thoại | Năm vùng có khung riêng, tiêu đề không bị che; số giỏ/đơn/chưa trả/đang chờ cập nhật đúng; không tràn ngang | Chưa chạy — V9.3 |
| U25 | Mở Chẩn đoán hệ thống, tra command ID; rời trang rồi quay lại | Số liệu TCP/DB đúng phạm vi quản lý; trạng thái cũ có cảnh báo khi không tải được; khách không xem được | Chưa chạy - V9.4 |
| U26 | Để giao dịch quá hạn rồi xác nhận hoặc bắt đầu lần mới | Không tự PAID giao dịch hết hạn; lần cũ không thay kết quả lần mới | Chưa chạy - V9.4; có kiểm ranh giới tự động |
| U27 | Thử bật chuông khi browser không phát được âm, sau đó thử lại | Có cảnh báo bằng chữ, nút chờ có thời hạn và không khóa nhận đơn/hỗ trợ | Chưa chạy - V9.4; loa thật cần người nghe |
| R01 | Tạo mất phản hồi sau PLACE_ORDER đã nhận bằng fault có kiểm soát | Đối chiếu lại một đơn, không yêu cầu tạo đơn thay thế | Chưa chạy |
| R02 | Chặn lời gọi trước khi Server nhận, rồi khôi phục | Bỏ lời gọi cũ; nếu còn cần, khách gọi lại | Chưa chạy |
| R03 | Lượt cũ hoàn tất; khách mới quét; thử lệnh cũ | Không tác động lượt mới | Chưa chạy |
| O01 | Backup khi đang chạy | Bị từ chối, không tự dừng Server | Chưa chạy |
| O02 | Dừng, backup, reset, start | Quán mới; profile cũ được lưu lại, không xóa vĩnh viễn | Chưa chạy |
| O03 | Dừng, restore ZIP, start | Đơn/menu/ảnh/secret QR trở lại; đăng nhập/quét lại khi cần | Chưa chạy |
| O04 | Restore ZIP sai/bị sửa | Từ chối trước khi thay profile hiện tại | Chưa chạy |
| P01 | START-PUBLIC rồi quét bằng điện thoại 4G/5G | HTTPS vào được, cookie/IndexedDB hoạt động | Chưa chạy — cần điện thoại |
| P02 | Hai điện thoại khác mạng quét cùng QR | Đơn riêng, cập nhật đúng, không lộ dữ liệu nhau | Chưa chạy — cần hai thiết bị |
| P03 | Màn hình nhỏ, bàn phím, xoay ngang, mạng chậm | Không che thao tác chính, lỗi có cách xử lý | Chưa chạy — ghi thiết bị/browser |

Khi báo lỗi, gửi: mã dòng, local/public, browser/thiết bị, bước đã bấm, kết quả mong đợi/thực tế và thông báo lỗi. Không gửi mật khẩu tạm, QR đang dùng, cookie hoặc toàn bộ backup chứa quyền phiên vào nơi công khai. Network Offline không bảo đảm tạo được thời điểm Server đã commit nhưng Client mất response; R01 cần fault có ranh giới rõ để đánh giá contribution.
