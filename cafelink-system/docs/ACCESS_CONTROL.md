# CafeLink - Danh tính và phân quyền

CafeLink có ba vai trò GUEST, STAFF và ADMIN. Khách nhận quyền qua QR; hai vai trò nội bộ dùng tài khoản riêng. Giao diện và API cùng thực hiện giới hạn quyền, Core là nơi quyết định nghiệp vụ.

## Ma trận quyền

| Thao tác | Khách | STAFF | ADMIN |
|---|---|---|---|
| Xem/đặt món, thanh toán, hỗ trợ | Phiên riêng | Không đóng vai khách | Không đóng vai khách |
| Xem bàn, QR, đơn đang phục vụ | Bàn/đơn của mình | Có | Có |
| Tiếp nhận hoặc từ chối đơn chưa trả | Không | Có | Có |
| Pha chế/giao, xử lý hỗ trợ, thông báo | Theo dõi | Có | Có |
| Đánh dấu hết/còn món | Không | Có, không sửa trường khác | Có |
| Tạo/sửa món, nhóm, giá và ảnh | Không | Không | Có |
| Bật/tạm ngưng QR, dừng đơn mới, kết thúc phiên | Rời phiên của mình | Không | Có |
| Hóa đơn lịch sử, thu chi, thuế, hoàn giả lập | Đơn của mình theo API được cấp | Không | Có |
| Tài khoản nhân viên, audit và chẩn đoán | Không | Không | Có |

STAFF xem giá/tổng đơn đang phục vụ nhưng không có quyền xem báo cáo tài chính. Thông báo STAFF thuộc phiên còn hoạt động. `RESOLVE_ORDER` với STAFF chỉ cho phép từ chối đơn chưa trả (`CANCEL_UNPAID`).

## Tạo và quản lý nhân viên

1. Quản lý đăng nhập `/admin` → **Nhân viên → Thêm nhân viên**.
2. Nhập tài khoản, họ tên và mật khẩu riêng tối thiểu 10 ký tự.
3. Nhân viên dùng browser/profile khác, vào cùng `/admin` và đăng nhập.
4. Nhân viên có **Sơ đồ bàn, Quầy pha chế, Yêu cầu hỗ trợ, Thực đơn**.
5. Quản lý có thể khóa/mở khóa hoặc đặt lại mật khẩu; tài khoản được giữ để truy vết lịch sử.

Không có tài khoản STAFF dùng chung được seed sẵn. Mở khóa không phục hồi phiên cũ; nhân viên đăng nhập lại. Dùng profile khác nhau khi thao tác nhiều vai trò đồng thời vì cookie được chia sẻ giữa tab cùng profile.

## Bảo vệ quyền

`Permissions.java` định nghĩa action STAFF. Core kiểm quyền trước receipt và trước discard hành động gốc, vì vậy biết command ID không cấp quyền đọc kết quả của quản lý. `SET_MENU_AVAILABILITY` chỉ nhận menuId/expectedVersion/available; thêm trường giá hoặc payload ngoài phạm vi bị từ chối.

`StaffAccounts` kiểm active và `auth_version`. Thay trạng thái/đặt lại mật khẩu tăng phiên bản xác thực; Core có thể trả `SESSION_REVOKED` hoặc phát `AUTH_REVOKED`, Gateway chuyển `SESSION_ENDED` đến các tab. Cookie quầy có tiền tố riêng, không được resume thành khách QR.

Mật khẩu băm PBKDF2 có salt. Tạo/đặt lại mật khẩu không ghi password vào journal Browser; dialog giữ ID trong RAM để đối chiếu thử lại cùng nội dung. Fingerprint receipt của hai lệnh này được băm chậm có salt; API/audit không trả password/hash. Sau reload dialog, đọc lại danh sách để đối chiếu trước khi tạo lại.

## Phiên khách

QR xác định bàn; Core tạo visit/membership riêng và cấp token. DB lưu hash, Gateway đặt cookie HttpOnly; public cookie Secure. Scope lệnh phải khớp identity. Hai profile độc lập cùng QR không xem đơn nhau; cùng profile có thể dùng chung phiên.

F5 hoặc reconnect khôi phục danh tính còn hợp lệ, không tự tạo lượt khác. Khách rời phiên khi không còn việc; quản lý kết thúc phiên cũng phải giữ điều kiện đó. Không suy khách đã rời từ WebSocket đóng. Quyền hết hạn/thu hồi không được dùng để phát ý định cũ sang phiên mới.

## Nhật ký và kiểm thử

Audit giữ actor, thời điểm và loại thao tác được hỗ trợ trong cùng transaction với mutation/receipt. Retry cùng lệnh không tạo hai dòng việc. Khóa tài khoản không xóa dữ liệu người dùng đã chụp trước đó.

Các điểm kiểm: `RoleAccessTest`, `StaffRoleIntegrationTest`, `web/tests/roles.spec.ts`, `web/tests/qr.spec.ts`, `web/tests/automatic.spec.ts`. [Giao thức](PROTOCOL.md) · [Kiểm thử](TESTING.md).
