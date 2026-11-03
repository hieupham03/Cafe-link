# CafeLink - Hướng dẫn sử dụng

CafeLink phục vụ khách gọi món tại bàn và quầy tiếp nhận/pha chế/giao đồ. [Chạy ứng dụng](RUNBOOK.md) · [Phân quyền](ACCESS_CONTROL.md).

## Khách hàng

### Vào bàn và chọn món

Quét QR đang hiển thị ở bàn → **Vào bàn của tôi**. QR xác định nơi giao đồ, phiên riêng xác định giỏ và đơn được xem. Nhiều khách quét cùng mã bằng các profile/thiết bị khác nhau vẫn có đơn riêng.

| Vùng | Nội dung |
|---|---|
| Thực đơn | Ảnh, nhóm món, tìm kiếm, giá, chi tiết và thêm món |
| Giỏ hàng | Số lượng, ghi chú, tạm tính/thuế và gửi đơn |
| Đơn đã gọi | Đơn đã gửi, tiếp nhận và tiến độ phục vụ |
| Thanh toán | Đơn đủ điều kiện trả, giao dịch giả lập và kết quả |
| Hỗ trợ | Gọi, bổ sung, rút yêu cầu và phản hồi từ nhân viên |

Thêm món chưa tạo đơn. Xem lại giỏ và tổng tiền trước khi gửi. Giỏ được lưu theo phiên; thay giá/thuế có thể yêu cầu xem lại trước khi Core nhận đơn. Trên màn hình nhỏ, thanh **Xem giỏ** dẫn tới giỏ và nằm trên điều hướng dưới.

### Gửi đơn và thanh toán

1. Kiểm món, số lượng, ghi chú rồi chọn **Gửi đơn gọi món**.
2. Đơn được lưu ở trạng thái **chờ quầy tiếp nhận**. Đây chưa phải xác nhận quán có thể phục vụ.
3. Nhân viên kiểm khả năng phục vụ. Nếu từ chối đơn chưa trả, khách thấy lý do và không thanh toán đơn đó.
4. Sau tiếp nhận, chọn thanh toán. Cổng **giả lập** cho chọn kết quả thử; không nhập thông tin ngân hàng thật.
5. Khi thanh toán thành công, quầy có thể pha chế. Khách theo dõi pha chế → sẵn sàng → đã mang ra.

Đã trả tiền khác đã giao đồ. Nếu trạng thái chưa rõ do mất mạng, chọn **Đối chiếu yêu cầu**; không tạo đơn khác để thay một đơn có thể đã nhận. [Phục hồi](RECOVERY.md).

### Hỗ trợ và rời phiên

Nhập lời nhắn và gọi nhân viên. Mỗi visit chỉ có một ticket OPEN cùng loại; có thể bổ sung hoặc rút khi còn đúng điều kiện/version. Theo dõi phản hồi tại vùng Hỗ trợ; đọc thông báo không tự hoàn tất ticket.

Giao đồ xong, phiên vẫn giữ để đặt tiếp. Khi rời quán, bấm **Rời phiên**. Nếu còn đơn chưa trả/chưa giao hoặc hỗ trợ đang mở, hệ thống yêu cầu xử lý trước. Nếu còn giỏ nháp, đọc xác nhận trước khi bỏ. Không xóa cookie/site data khi còn lệnh chưa rõ kết quả.

## Nhân viên phục vụ

Đăng nhập `/admin` bằng tài khoản được quản lý cấp. Bốn mục phục vụ gồm sơ đồ bàn, quầy pha chế, yêu cầu hỗ trợ và thực đơn.

### Hàng đợi đơn

- Tiếp nhận sau khi kiểm khả năng phục vụ. Món hết hoặc không thể làm thì từ chối đơn chưa trả, ghi lý do.
- Chờ thanh toán giả lập thành công trước pha chế. Cập nhật đúng thứ tự: bắt đầu pha chế → pha chế xong → đã mang ra.
- Khi có nhiều khách cùng bàn, phân biệt số đơn và nội dung; không gộp giỏ/phiên chỉ vì chung địa chỉ giao.
- Xử lý ticket và phản hồi. Cập nhật đã xử lý sau khi công việc thực sự hoàn tất.
- Đánh dấu hết/còn món theo tình trạng bán; STAFF không sửa tên, giá, ảnh hoặc cấu hình tài chính.

Thông báo gồm chữ, số chưa đọc và chuông khi Browser cho phép. Bật âm cần thao tác người dùng; nếu không phát được, cảnh báo bằng chữ và hàng đợi vẫn hoạt động. [Vận hành thông báo](OPERATIONS.md).

## Quản lý

### Bàn và nhận khách

| Thao tác | Tác dụng |
|---|---|
| Mở tất cả bàn | Bật nhận khách QR, hiển thị QR; không xóa phiên/đơn |
| Tạm ngưng nhận khách ở bàn | Chặn lượt mới qua QR, giữ lượt đang phục vụ |
| Tạm ngưng tất cả bàn | Chặn khách QR mới toàn quán, cần xác nhận |
| Tạm dừng đơn mới toàn quán | Chặn đơn mới; không hủy nghĩa vụ phục vụ/thanh toán/hỗ trợ đã có |
| Kết thúc phiên tại bàn | Thu hồi các phiên AUTO của bàn khi không còn việc |
| Kết thúc tất cả phiên QR | Kiểm mọi bàn, chỉ đóng khi toàn bộ hợp lệ; không đóng một phần |

Đăng nhập ADMIN làm các bàn tạm ngưng nhận khách QR mới. Bật lại khi quán sẵn sàng. Kết thúc phiên không tự tắt QR; khách mới vẫn có thể vào nếu bàn đang nhận khách. Số phiên là số lượt ứng dụng, không phải phép đếm người đang ngồi.

### Thực đơn

Tạo/sửa tên, nhóm, mô tả, giá và ảnh; đánh dấu tình trạng bán. Ảnh tải lên được kiểm định dạng/kích thước. Nếu người khác vừa sửa, version không còn khớp thì đọc lại trước xác nhận; không ghi đè từ màn hình cũ. Đơn đã lưu giữ giá/tên/thuế tại thời điểm nhận.

### Tiền, thuế và nhân viên

**Cài đặt quán** cấu hình thuế; **Thu chi** xem thu/hoàn/chi, ghi hoặc hủy phiếu chi có lý do và xuất CSV. [Thuế và thu chi](FINANCE.md).

**Nhân viên** tạo, khóa/mở khóa hoặc đặt lại mật khẩu và xem nhật ký. Phiên cũ bị thu hồi khi tài khoản thay đổi xác thực. [Tài khoản và quyền](ACCESS_CONTROL.md).

**Tra cứu hỗ trợ** đối chiếu command ID hoặc số đơn, chỉ đọc kết quả; không tự tạo giao dịch thay khách. **Chẩn đoán hệ thống** xem Core/DB, kết nối, hàng đợi và lịch sử yêu cầu giới hạn.

## Khi xảy ra lỗi

| Hiện tượng | Thao tác |
|---|---|
| Mất kết nối | Giữ trang/dữ liệu, chờ nối lại hoặc thử kết nối; đối chiếu lệnh chưa rõ |
| Chưa thanh toán được | Kiểm quầy đã tiếp nhận đúng đơn và trạng thái tiền hiện tại |
| QR không nhận khách mới | Quản lý kiểm trạng thái nhận khách và link của Server đang chạy |
| Mở link khách thấy màn quản lý | Dùng profile/trình duyệt/thiết bị độc lập |
| Cấu hình/giá đổi | Đọc lại tổng và xác nhận theo dữ liệu mới |
| Phiên hết hạn/thu hồi | Nhờ quầy đối chiếu; không tự phát lại lệnh cũ bằng phiên mới |

Khi báo lỗi, gửi bước thao tác, kết quả mong đợi/thực tế, browser/thiết bị và mã lỗi/command ID cần thiết. Không công khai mật khẩu tạm, cookie hoặc QR đang hoạt động.
