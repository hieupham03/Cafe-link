# CafeLink - Tài liệu kỹ thuật

Tài liệu mô tả source V10.1, schema 13. Bắt đầu ở [tổng quan](../../README.md), dùng [README source](../README.md) để build/run/test.

## Sử dụng và triển khai

| Tài liệu | Nội dung |
|---|---|
| [Hướng dẫn sử dụng](USER_GUIDE.md) | Khách, quầy, quản lý; đơn, hỗ trợ, thực đơn và phiên |
| [Chạy và demo](RUNBOOK.md) | Local, hai demo trọng tâm và xử lý lỗi |
| [Public HTTPS](PUBLIC_DEMO.md) | Điện thoại qua Internet, tunnel, QR và tài khoản |
| [Triển khai và dữ liệu](DEPLOYMENT.md) | Cấu hình, TLS/LAN, lưu bền, sao lưu và khôi phục |
| [Phân quyền](ACCESS_CONTROL.md) | GUEST/STAFF/ADMIN, tài khoản và thu hồi phiên |
| [Thuế và thu chi](FINANCE.md) | Cách tính tiền, báo cáo, phiếu chi và CSV |

## Thiết kế và giao tiếp mạng

| Tài liệu | Nội dung |
|---|---|
| [Đặc tả dự án](PROJECT_SPECIFICATION.md) | Bài toán, phạm vi và điều kiện nghiệp vụ |
| [Kiến trúc](ARCHITECTURE.md) | Thành phần, luồng dữ liệu, đồng thời và thiết kế phiên |
| [Giao thức](PROTOCOL.md) | TCP framing, HTTP/WS, action, trạng thái và lỗi |
| [Phục hồi](RECOVERY.md) | Journal, receipt, scope và quyết định bỏ |
| [Vận hành](OPERATIONS.md) | Readiness, chẩn đoán, âm thanh và xử lý sự cố |

Đường đọc code: `WebMain` → `WebGateway` → `SessionBridge` → `NetworkClient` → `FrameCodec` → `CafeServer` → `CafeService`. Lệnh đi từ HTTP sang TCP; cập nhật trở về qua TCP rồi WebSocket. Core là nơi kiểm và ghi nghiệp vụ.

## Kiểm tra và đánh giá

| Tài liệu | Nội dung |
|---|---|
| [Kiểm thử](TESTING.md) | Lệnh, nhóm hành vi, kết quả và tiêu chí kiểm thực tế |
| [Thực nghiệm](EXPERIMENTS.md) | Baseline, fault, tải, oracle và metric |
| [CI](CI.md) | Workflow Windows và artifact theo commit |
| [Quy tắc công bố](PUBLICATION.md) | Một bộ tài liệu hiện hành, liên kết, phiên bản và dữ liệu riêng |
| [Hồ sơ báo cáo](../../report/README.md) | Phạm vi hồ sơ học phần |
