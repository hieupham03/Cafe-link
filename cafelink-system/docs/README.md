# CafeLink - Chỉ mục tài liệu kỹ thuật

Đọc [README gốc](../../README.md) để hiểu sản phẩm, hoặc [README source](../README.md) để build/run/test. Source hiện tại V9.4, schema 11; gói chạy đã kiểm RC4. Lệnh và số đo gắn với từng mốc, không suy từ tên file có chữ `FINAL`.

## Chạy và trải nghiệm

| Tài liệu | Dùng khi |
|---|---|
| [FINAL_RUNBOOK](FINAL_RUNBOOK.md) | Chạy local/public, vào bàn, demo khách - quầy và xử lý lỗi |
| [WEB_PUBLIC_DEMO](WEB_PUBLIC_DEMO.md) | Quét QR từ điện thoại qua Internet bằng Quick Tunnel |
| [WEB_RELEASE](WEB_RELEASE.md) | Kiểm gói, profile dữ liệu, backup/reset/restore |
| [WEB_USER_ACCEPTANCE](WEB_USER_ACCEPTANCE.md) | Danh sách thao tác kiểm chức năng/trải nghiệm |
| [WEB_DEVICE_ACCEPTANCE](WEB_DEVICE_ACCEPTANCE.md) | Tạo kit kiểm riêng khi muốn kiểm lại trên thiết bị |
| [LAN_ACCEPTANCE](LAN_ACCEPTANCE.md) | Kết nối hai máy qua LAN; phân biệt web TLS với TCP desktop lịch sử |

## Hiểu code và thiết kế mạng

| Tài liệu | Nội dung |
|---|---|
| [PROJECT_SPECIFICATION](PROJECT_SPECIFICATION.md) | Bài toán CafeLink, tác nhân, phạm vi và điều kiện nghiệp vụ |
| [FINAL_ARCHITECTURE](FINAL_ARCHITECTURE.md) | Browser, Gateway, TCP Core, DB; xử lý đồng thời và dữ liệu |
| [FINAL_PROTOCOL](FINAL_PROTOCOL.md) | HTTP/WS và TCP; frame, JSON, request/response/event và lỗi |
| [WEB_RECOVERY](WEB_RECOVERY.md) | Nhật ký, lấy kết quả đã nhận, quyết định bỏ và bảo vệ phiên |
| [WEB_HARDENING](WEB_HARDENING.md) | Readiness, chẩn đoán, hạn thanh toán và các sửa độ tin cậy |

Đường đọc code ngắn: `WebMain` → `WebGateway` → `SessionBridge` → `NetworkClient` → `FrameCodec` → `CafeServer` → `CafeService`. Một thao tác đi qua HTTP rồi TCP; cập nhật đi ngược từ Core qua TCP rồi WebSocket tới Browser.

## Kiểm thử, thực nghiệm và báo cáo

| Tài liệu | Nội dung |
|---|---|
| [TESTING](TESTING.md) | Nhóm kiểm theo hành vi, lệnh chạy và kết quả RC4 |
| [WEB_EXPERIMENTS](WEB_EXPERIMENTS.md) | Đối chứng phục hồi, tải, timer, raw và oracle |
| [CI](CI.md) | Workflow Windows, lệnh local và run GitHub đã xác minh |
| [Báo cáo và bằng chứng](../../report/README.md) | Chọn bản Word/PDF, dữ liệu RC3 và kiểm cuối RC4 |
| [Đối chiếu yêu cầu học phần](../../report/CafeLink_Requirements_Alignment.md) | Nơi đáp ứng từng yêu cầu trong final-project-2 |

## Lịch sử thiết kế

[ADR-002](architecture/ADR-002-recovery.md) và các [ADR nâng cấp](architecture/ADR-003-upgrade-scope.md) lưu quyết định tại thời điểm viết. Các mốc [web/TCP](architecture/ADR-004-web-tcp-foundation.md), [QR](architecture/ADR-005-qr-membership.md), [trả trước](architecture/ADR-007-prepaid-simulator-and-events.md), [QR cố định/public](architecture/ADR-008-fixed-table-qr-and-public-demo.md), [thực nghiệm](architecture/ADR-009-web-experiments-and-ci.md) và [portable](architecture/ADR-010-portable-web-release.md) giải thích vì sao thiết kế thay đổi.

[WEB_V9_3](WEB_V9_3.md) thuộc mốc V9.3. Khi có khác biệt, ưu tiên README source và các hợp đồng hiện hành; hồ sơ cũ giữ để truy vết, không dùng làm kết quả mới.
