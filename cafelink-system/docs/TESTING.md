# CafeLink - Kiểm thử và đánh giá

Mục đích là kiểm đúng chức năng của quán, giao tiếp Client/Server và hành vi khi có lỗi; thực nghiệm đo hiệu năng/phục hồi được tách riêng. Yêu cầu gốc của học phần được lưu ngoài repository; [báo cáo hiện tại](../../report/README.md) trình bày kết quả theo cấu trúc technical paper.

V10.1 bổ sung `RoleAccessTest`, `StaffRoleIntegrationTest` và `web/tests/roles.spec.ts`: quyền tại Core/HTTP/TCP, thu hồi nhiều tab, đổi mật khẩu, journal/audit không có mật khẩu, migration giữ dữ liệu và tiếp nhận khi mất phản hồi. [Chi tiết V10.1](UPGRADE_V10_1_ROLES.md) tách khỏi bằng chứng các mốc trước.

Bản tích hợp thành viên có **201 Java và 90 Chromium đạt**, gồm 7 kịch bản tài chính chuyển từ nhánh thành viên và 2 ca ảnh món. Số liệu và hash ảnh được ghi nhận tại thời điểm kiểm; tệp evidence không còn được lưu trong repository.

## Các nhóm hành vi được kiểm

V10 bổ sung `StoreOperationsTest` và `web/tests/v10.spec.ts`: chặn trả tiền trước tiếp nhận, kiểm món lúc quầy nhận, từ chối, giữ nguyên thuế đơn cũ, làm tròn, hoàn, thu chi/ngày quán, quyền, mất phản hồi ghi chi, QR, responsive và điều hướng từ thông báo. [Kết quả V10](UPGRADE_V10.md) tách khỏi số liệu RC4 trong tài liệu này.

| Nhóm | Điều cần chứng minh | Điểm vào test |
|---|---|---|
| QR và phiên riêng | Hai khách cùng bàn không dùng chung đơn; phiên cũ không áp sang khách mới | `AutomaticTablesTest`, `web/tests/automatic.spec.ts` |
| Đơn và thanh toán | Giá/số lượng đúng, trả trước mới pha chế, gửi lặp không thu thêm | `PrepaidFlowTest`, `PaymentAcceptanceTest`, `web/tests/v7.spec.ts` |
| TCP framing | Unicode, đọc thiếu/nhiều frame, length sai và dữ liệu đứt giữa chừng | `FrameCodecTest` |
| Đồng thời | Nhiều socket, lệnh trùng, ghi lỗi rollback và Client chậm | `NetworkIntegrationTest`, `CommandReceiptTest` |
| Push và quyền | Thay đổi từ TCP Client tới tab web; dữ liệu chỉ trả theo quyền | `WebGatewayIntegrationTest`, `QrWebIntegrationTest` |
| Phục hồi | Đã nhận thì lấy kết quả cũ; bỏ trước chặn lệnh muộn; nhận trước giữ kết quả | `RecoveryIntegrationTest`, `web/tests/orders.spec.ts` |
| Vận hành | Readiness, chẩn đoán quản lý, hạn tiền, âm thanh và API từ chối sớm | `ReadinessIntegrationTest`, `DiagnosticsIntegrationTest`, `PaymentDeadlineTest`, các nhóm E2E |
| Gói chạy | Manifest, JRE đi kèm, profile, launcher, nghiệp vụ và public | `web/tests/release-smoke.mjs`, `release-public-smoke.mjs` |
| Công bố và tài liệu | Phiên bản/RC đúng, liên kết tài liệu hợp lệ, tài liệu portable không trỏ file thiếu | `tools/verify_publication.py`, `tools/test_publication.py` |

Test TCP 12 Client đồng thời khác workload 14 khách của phép đo tải. Giới hạn cấu hình 64 reader hoặc 32 bridge không phải kết luận công suất đã đo.

## Cách chạy

Tại `cafelink-system`, sau khi chuẩn bị môi trường theo [README](../README.md):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-web.ps1 -Phase V10.1
```

Lệnh chạy Java verify, build frontend/experiment và Chromium E2E. Các test dùng socket, Gateway, Core và SQLite thật với dữ liệu riêng. Cổng 18080/18081 phải trống. Nếu đã cài đúng dependencies/browser, có thể thêm `-SkipInstall -SkipBrowserInstall`.

Kiểm chọn lọc Firefox/WebKit:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-browser-compatibility.ps1
```

Kiểm Java riêng:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/maven.ps1 -B test
```

Xem [CI](CI.md) để chạy toàn bộ bộ kiểm có analyzer và campaign Quick. Các script tạo thư mục kết quả mới; không sửa kết quả FAIL cũ thành PASS.

## Kết quả bản chốt

| Lớp kiểm | Kết quả ghi nhận | Phiên bản/phạm vi |
|---|---|---|
| Java | 164 đạt, không fail/error/skip | Source V9.4 được đóng RC4 |
| Chromium | 71 đạt, không unexpected/flaky/skip | Browser tự động |
| Firefox / WebKit | 20 đạt mỗi engine | Nhóm chọn lọc trên Windows |
| Portable | 23 nhóm đạt | Gói RC4, JRE đi kèm |
| Public | 8 kiểm đạt | HTTPS/WSS từ gói RC4 |

Phiếu kiểm RC4, gate Java/Chromium, kiểm tương thích và kiểm gói đã được lưu tại thời điểm chạy nhưng không còn trong repository; xem [CI](CI.md) để biết quy trình kiểm hiện hành. Không cộng số ca giữa các lớp hoặc phiên bản thành tỷ lệ bao phủ.

Người dùng đã xác nhận hoàn thành kiểm thao tác thực tế. Đây là xác nhận định tính của luồng sử dụng, không có số đo thiết bị được thêm vào bảng benchmark. Các JSON/checklist cũ ghi `NOT_RUN` là snapshot của thời điểm chạy tự động, không được sửa ngược để tạo dữ liệu thực nghiệm mới. Checklist vẫn có thể dùng cho lần kiểm lại.

## Thực nghiệm và cách đọc số liệu

Số đo đầy đủ ngày 30/10 là V9.4/RC3: 120 ca phục hồi và 12 lượt tải trên một máy loopback. Đã hoàn tất 1.256/1.350 lượt dự kiến; 94 lượt chưa phát ở 14 khách, không có lỗi flow/HTTP đã ghi ở các thao tác đã gửi. Các kết quả này không tự trở thành benchmark RC4.

[WEB_EXPERIMENTS](WEB_EXPERIMENTS.md) mô tả cách tạo lỗi và timer. Khi đọc bảng cần tách: đơn được Server nhận, công việc hoàn tất, slot chưa phát và lỗi yêu cầu đã gửi. Khi bảo vệ cần giải thích chỉ số được đo từ đâu đến đâu, vì sao dùng và kết quả bị giới hạn ở điều kiện nào.
