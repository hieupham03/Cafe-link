# ADR-010 — Bản web portable V9

**Ngày:** 23/10/2026. **Trạng thái:** Accepted theo yêu cầu triển khai V9 trước khi người dùng tự kiểm thử.

## Quyết định

- Đóng gói Windows x64: JAR + thư viện runtime + production assets + Eclipse Temurin JRE 17 (archive/SHA256 ghim trong release metadata). Giữ LICENSE/legal của runtime. Người chạy không cần JDK, Maven, Node, npm hoặc Python; người build/test vẫn cần công cụ phát triển.
- Giữ Core/Gateway/nghiệp vụ hiện tại. Tên gói và RELEASE.json là V9; Maven version 1.0.0 là nhãn artifact nội bộ. Không sao chép DB, khóa, cookie, mật khẩu hay logs của workspace vào gói.
- Tái sử dụng launcher Java/public tunnel. runtime.ps1 ưu tiên runtime trong gói khi có RELEASE.json, thiếu runtime thì báo gói lỗi, không tự rơi sang Java trên PATH hoặc build lại.
- Config nhỏ cho cổng và profile dữ liệu; chỉ cho profile nằm dưới data của gói. Mỗi gói chạy một launcher tại một thời điểm bằng file lease. Maintenance giữ cùng lease và kiểm file DB không đang mở. Không tự dừng tiến trình của người dùng.
- Backup offline gồm DB, WAL/SHM còn lại nếu có, khóa QR và media; dùng ZIP + manifest. Inspector JDBC read-only kiểm integrity/schema/FK và khả năng giải mã QR bằng khóa đi kèm trước khi restore. Không migrate/seed DB trong bước kiểm.
- Restore chỉ nhận archive có cấu trúc/hash hợp lệ, chặn đường dẫn thoát/entry trùng/link. Stage riêng, kiểm xong mới lưu profile hiện tại vào backups và đổi profile. Nếu đổi thất bại, quay lại profile trước. Reset là lưu profile cũ vào backups, không xóa vĩnh viễn dữ liệu demo.
- Backup chỉ chứa dữ liệu Server, không chứa IndexedDB/cookie trên điện thoại. Giữ nguyên scope recovery; không giả chuyển ý định cũ qua một quán mới khi reset. Hướng dẫn dùng profile browser mới cho demo sạch.
- Kiểm ở CLI backup/restore/reset và gói giải nén trên đường dẫn có khoảng trắng, qua browser/API thật. PATH của child không có JDK/Node. Kiểm cả restart, ảnh, QR, thanh toán, mất phản hồi và từ chối maintenance khi đang chạy.

## Giới hạn

Gói cho Windows x64, một máy Server. Không cài Windows service, không mở router/firewall, không hứa công suất production. Quick Tunnel cần Internet, hostname có thể đổi. Điện thoại/camera/LAN thật và GitHub Actions tiếp tục NOT_RUN nếu chưa có bằng chứng thiết bị/run tương ứng. Gói và backup đã dùng có thể chứa quyền phiên; chỉ ZIP pristine là gói phát hành.
