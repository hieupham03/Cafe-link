# ADR-004: Web Gateway giữ TCP Core làm nơi quyết định nghiệp vụ

Ngày: 21/10/2026. Trạng thái: **Accepted cho nền tảng V0**; các phần QR/recovery/checkout/menu/feed V2 vẫn triển khai theo [kế hoạch V2](../../../report/CafeLink_Final_Report.md).

## Quyết định

React + TypeScript + Vite phục vụ từ cùng origin với Gateway Java. Jetty 12.0.40 cung cấp HTTP, TLS và WebSocket. Gateway dùng `NetworkClient` kết nối TCP thật đến `CafeServer`; không gọi trực tiếp `CafeService`, không truy cập SQLite. Quyền, giá, transition và receipt nằm tại Core.

Một cookie ngẫu nhiên 256 bit ánh xạ một bridge đúng danh tính. Các tab dùng chung cookie/TCP; đăng xuất đóng bridge và mọi WebSocket. ID và payload lệnh không đổi khi đi qua Gateway. HTTP POST kiểm tra origin và CSRF. Kênh WebSocket chỉ nhận PING của client, đẩy snapshot theo quyền của Core.

State snapshot được phép gộp trong queue giới hạn: một frame đang gửi và một bản mới nhất. Feed sự kiện nghiệp vụ V5a phải dùng event/outbox/cursor riêng; không suy diễn thông báo mới từ chênh lệch snapshot.

V0 dùng DB riêng theo mặc định, không migration schema hoặc đổi nghiệp vụ E0. Entry point `WebMain` sở hữu vòng đời cả Core/Gateway; `ServerMain` tiếp tục phục vụ desktop. ZIP E0 giữ nguyên để đối chứng. JAR tại `target` là artifact của source đang phát triển.

## Đánh đổi

- Mỗi phiên chiếm một socket Core: giới hạn web 16 phiên để còn ngân sách trong mức 32 reader hiện tại. Chưa chứng minh năng lực thực tế bằng đo LAN.
- Phiên RAM và TCP chưa tự resume: khi Core ngắt, khóa thao tác và yêu cầu đăng nhập/đối chiếu; không tự replay mutation. V2 sẽ thêm resume và journal trước khi mở web khách.
- HTTP phát triển giới hạn loopback; LAN bắt buộc TLS và origin cấu hình rõ. Trust thiết bị thật vẫn là một gate riêng.
- Web V0 chỉ nhận ADMIN. Đăng nhập mật khẩu bàn bị từ chối ở Gateway. Việc đóng đường bypass guest password tại TCP production thuộc V1; hiện Core vẫn tương thích E0.

## Bằng chứng và các gate tiếp theo

Kiểm thử qua HTTP/WSS và TCP thực, SQLite tạm, JUnit regression và Chromium trên artifact build. Xem [báo cáo V0](../../../report/CafeLink_Final_Report.md) và [hướng dẫn chạy](../FINAL_ARCHITECTURE.md). Không gán kết quả các gate V1–V9 cho V0.

Tài liệu thư viện: [Jetty WebSocket server](https://jetty.org/docs/jetty/12/programming-guide/server/websocket.html), [Vite yêu cầu Node](https://vite.dev/guide/). Phiên bản npm khóa ở `package-lock.json`, Jetty khóa ở `pom.xml`.
