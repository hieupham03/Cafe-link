# ADR-005: Grant theo lượt và principal ổn định theo membership

Ngày: 21/10/2026. Trạng thái: **Accepted/implemented cho V1 phần mềm**. Bổ sung [ADR-004](ADR-004-web-tcp-foundation.md); [phạm vi triển khai/test](../../../report/CafeLink_Final_Report.md).

## Quyết định

QR cấp quyền gia nhập một visit, không đại diện tài khoản bàn hoặc danh tính phần cứng. Mỗi lần JOIN thành công tạo membership riêng; các tab/cookie còn hợp lệ RESUME membership cũ. Credential ngẫu nhiên chỉ chứng minh quyền truy cập principal ổn định `membership:<id>`; rotate token không đổi chủ receipt. storeId lưu trong DB, không dùng bootId.

Grant dùng chung cho nhiều khách cùng lượt, sinh mới tại OPEN_TABLE. Core lookup grant, kiểm active/expiry và tạo membership trong transaction dưới khóa CafeService, tránh JOIN lọt sang lượt mới khi cạnh tranh đóng/mở bàn. ROTATE_JOIN_GRANT không thu hồi membership; REVOKE_SESSION mới thu hồi membership và các token.

Để quản lý xem lại cùng QR sau refresh/restart, lưu hash và bản mã AES-GCM của grant; khóa ngoài DB/source. Khi mất khóa, không tự đổi grant. Admin phục hồi khóa hoặc xác nhận cấp lại. Không lưu grant/token rõ trong command receipt hoặc log. Cookie guest HttpOnly giữ token Core, cho phép dựng lại bridge sau restart mà không xin quyền mới.

## Tương thích và migration

Schema 4 giữ tables/receipts E0 và thêm settings/grants/memberships/sessions. Mặc định chỉ migrate khi không còn active visit. Không import credential/outbox desktop và không coi ngừng client là đã hủy ý định. Chế độ password E0 từ chối schema 4; mode QR chặn guest LOGIN/START_NEW_VISIT.

Đóng visit chặn JOIN/ghi mới; đọc receipt đúng principal vẫn được khi token còn hạn. Expiry/revocation chặn mọi đọc/ghi; Core kiểm trước RPC/snapshot, client heartbeat giúp UI phát hiện ngừng quyền. Không hứa thu hồi dữ liệu đã gửi trước đó.

## Đánh đổi và phần sau

Membership là phạm vi trình duyệt, chưa có nhãn thiết bị hoặc duyệt khách bởi nhân viên. QR có thể bị chụp/chia sẻ khi còn hiệu lực. Có revoke/rotate/rate limit và giới hạn membership; không tuyên bố tự chống chia sẻ hay xác thực vị trí khách.

Cookie có thể RESUME sau restart; V1 chưa có IndexedDB journal nên chưa mở mutation từ web guest. V2/V3 tiếp tục khóa journal theo store/visit/membership, kiểm tra unknown outcome và generation của reconnect. V4 mới xử lý checkout duy nhất sau ACK; không coi V1 đã hoàn thành phần đó. Cả TLS/QR qua phần mềm đã có test; LAN/camera điện thoại vẫn NOT RUN.
