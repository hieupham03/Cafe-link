# ADR-009 — Thực nghiệm web và CI cho V8

**Ngày:** 23/10/2026. **Trạng thái:** Accepted, triển khai pha V8 theo kế hoạch đã được người dùng yêu cầu tiếp tục.

## Quyết định

- Đo E1 trên cùng QR AUTO/PREPAY, Chromium, IndexedDB và đường Browser → Gateway → TCP Core → SQLite. R0 REPLAY_ALL gửi lại cùng commandId/payload; R1 REVIEW tra receipt, chưa nhận thì chờ người dùng, không lập tombstone tự động; R2 SEMANTIC là hành vi hiện tại: đơn chờ xác nhận, lời gọi chưa nhận hoặc scope đã đóng được DISCARD nguyên tử.
- Cho `reconcile` nhận policy tường minh, mặc định SEMANTIC. Giao diện sản phẩm tiếp tục chỉ gọi mặc định, không có URL/config/nút chuyển sang baseline. Harness thực nghiệm chỉ được build trong mode experiment, assets riêng; production không chứa trang harness.
- Test tại các ranh giới đã có: HTTP/TCP thật, cookie/scope, IndexedDB và hành vi trình duyệt. SQLite read-only là oracle độc lập của campaign, không dùng để thay xử lý nghiệp vụ hoặc giả ACK.
- Fault HTTP có hai vị trí: abort trước khi forward, hoặc forward thật rồi bỏ phản hồi đã thành công. Hai lịch lệnh đến muộn kiểm thứ tự accept/discard; không gọi đây là mất gói vật lý hay chứng minh mọi thứ tự scheduler.
- Mỗi case có browser profile/private visit riêng. Chạy tuần tự và đổi thứ tự bằng seed; xoay Server/DB fixture sau số ca nhỏ để giữ rate/capacity limit nguyên vẹn. Không đo lẫn với E0 desktop.
- Đo tải theo các mức 1/5/10/14 guest, một quản lý, phù hợp giới hạn 16 web sessions hiện tại. Mốc 20 guest trong kế hoạch là đề xuất ban đầu, chưa phù hợp cấu hình hiện hành; không tăng hạn chỉ để benchmark.
- Báo riêng HTTP response và React render trên cùng đồng hồ browser; HTTP body bytes/WSS payload không được gọi là bytes trên dây hoặc TCP frame bytes nếu chưa đo.
- CI dùng workflow Windows/JDK/Node phù hợp scripts hiện có. Chỉ ghi remote CI PASS khi có run thật; chạy local cùng entrypoint không thay bằng chứng GitHub Actions.

## Bằng chứng

Giữ raw JSON/CSV, seed/config, môi trường, source/build hashes, các lỗi và oracle đã lọc bí mật. DB/key/cookie/grant/journal chứa thông tin riêng ở target fixture, không đưa vào artifact công khai. E0 ZIP và các evidence V1–V7.2 giữ nguyên.

## Giới hạn

Campaign đánh giá policy và logic trên một máy loopback. Không suy ra công suất tối đa, trải nghiệm người dùng thật, khả năng chịu mất điện hoặc nghiệm thu LAN/camera. Đây là cơ chế đã biết được tích hợp/đánh giá cho CafeLink, không phải thuật toán mạng mới.
