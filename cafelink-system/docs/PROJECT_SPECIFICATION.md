# CafeLink - Đặc tả dự án theo bộ yêu cầu đầy đủ

Đặc tả nghiệp vụ được đối chiếu ngày 28/10/2026 tại mốc V9.3/schema 11. Source hiện hành V9.4 giữ phạm vi nghiệp vụ đó; phần vận hành mới được mô tả trong [WEB_HARDENING](WEB_HARDENING.md). Căn cứ là năm tệp trong `final-project-2/final-project/`; không sửa hoặc thay nội dung bộ yêu cầu do người dùng cung cấp.

## 1. Thông tin và phạm vi

- Đề tài: Hệ thống gọi món và điều phối phục vụ tại quán café theo mô hình Client/Server.
- Hướng học phần: Topic 3 – Ứng dụng mạng.
- Client: Browser khách và quản lý; Java NetworkClient làm đầu TCP của Gateway.
- Server: Java Gateway nhận giao tiếp web, Java TCP Core quyết định nghiệp vụ, SQLite lưu tập trung.
- Nhóm/lớp/thành viên/email/tỷ lệ đóng góp: chờ nhóm bổ sung và xác nhận; không mặc định ba thành viên theo SPECIFICATION của đề tài IoT.
- Trong phạm vi: QR cố định/private visit, menu ảnh/version, giỏ/ghi chú, đơn trả trước giả lập, phục vụ/hỗ trợ/thông báo, phục hồi theo loại yêu cầu và scope/barrier, công cụ đo đối chứng.
- Ngoài phạm vi: ngân hàng thật, tồn kho/topping phụ thu, giao/hoàn từng phần, nhiều chi nhánh, SLA production.

## 2. Mô hình triển khai và trách nhiệm

Browser dùng HTTP(S) để gửi lệnh, WS(S) nhận snapshot/sự kiện. Gateway xác thực cookie/Origin/CSRF, chuyển lệnh sang TCP Client. Core kiểm principal/scope, giá/version/trạng thái và ghi transaction. Ảnh món được xử lý qua HTTP bytes riêng; không ghi tắt DB nghiệp vụ từ Gateway.

Xem [kiến trúc](FINAL_ARCHITECTURE.md). Demo public thêm Quick Tunnel phía trước Gateway; Core chỉ loopback. QR là quyền gia nhập/địa chỉ bàn, không xác nhận có mặt vật lý.

## 3. Đặc tả giao tiếp

| Thuộc tính | Giá trị hiện thực |
|---|---|
| TCP frame | 4 byte signed positive int, big-endian, độ dài body; UTF-8 JSON theo sau |
| Giới hạn frame | 1–262144 byte body; kiểm trước cấp phát/decode |
| Envelope | version, kind, requestId, action, ok, data và thông tin lỗi |
| kind | REQUEST / RESPONSE / EVENT |
| Correlation | Response giữ ID; mutation retry giữ ID và payload |
| Scope khách | storeId, visitId, membershipId, phải khớp identity đã cấp |
| Lệnh phục hồi | GET_OUTCOME, DISCARD_COMMAND; không đồng nghĩa hủy đơn đã nhận |
| HTTP body | JSON tối đa 64 KiB; upload ảnh tối đa 2 MiB, kiểm/re-encode riêng |

CafeLink không có magic `0xABCD`, CRC16 hoặc telemetry 15 byte của SPECIFICATION IoT. Khi frame malformed, codec/peer đóng kết nối hợp lý; không tuyên bố tự tái đồng bộ bằng magic marker. Xem [protocol](FINAL_PROTOCOL.md).

## 4. Trạng thái và bất biến

1. Hai thiết bị dùng cùng QR có quyền và đơn riêng; tab cùng profile có thể chung phiên.
2. Cùng principal/command ID và fingerprint trả kết quả cũ; khác payload bị từ chối.
3. Receipt, mutation và event tương ứng cùng transaction; timeout Client chưa kết luận Core chưa commit.
4. Đơn đi qua SUBMITTED → PREPARING → READY → SERVED; PREPAY chỉ được pha chế khi đủ điều kiện PAID.
5. Một ticket OPEN cùng loại/visit; bổ sung/rút/xử lý kiểm version và giữ lịch sử.
6. Dừng nhận mới không xóa nghĩa vụ đã nhận. Offline không tự hủy đơn PAID hoặc kết thúc visit.
7. Continuation giữ nháp/lịch sử riêng; command đã phát không chuyển scope.
8. DISCARD trước accept chặn lệnh muộn; accept trước DISCARD giữ kết quả đã nhận.

## 5. Concurrency và xử lý lỗi

Core: acceptor riêng, reader pool tối đa 64, outbound queue 64 message/peer và writer riêng. Gateway: tổng tối đa 32 bridge, guest tối đa 30 và admin tối đa 16 cùng chia sẻ tổng đó; request lease bảo vệ bridge đang dùng. Service tuần tự hóa trạng thái/transaction; queue đầy đóng peer chậm. Các giới hạn không được gọi là công suất đã đo.

Client phân biệt lỗi mạng chưa rõ kết quả với lỗi nghiệp vụ xác định; giữ journal/ID và đối chiếu. Scope sai, kết quả không khớp hoặc không đủ quyền không được tự sửa thành một lệnh mới. Giỏ chỉ được dọn theo revision phù hợp.

## 6. Dữ liệu và vận hành

SQLite schema 11 lưu visit/membership, order/dòng món theo line_no, payment/resolution, ticket/history, receipt và event. Menu/giá lúc bán được lưu tại dòng đơn. DB, QR key và media cùng profile. Công cụ backup/reset/restore chạy offline theo lease và kiểm hash/schema/integrity/FK/key/media. Server backup không chứa journal/cookie Browser.

## 7. Đóng góp và baseline

- C1: quyết định phục hồi theo loại yêu cầu, giữ xác nhận mua và bỏ lời gọi ngắn hạn chưa nhận theo SEMANTIC.
- C2: barrier bền kết hợp scope phiên, kiểm hai thứ tự accept/discard và lệnh tới muộn.
- Baseline thực nghiệm R0 REPLAY_ALL, R1 REVIEW, R2 SEMANTIC giữ chung idempotency/quyền/scope; không mô tả R0/R1 như cố ý bỏ guard.
- Không coi QR, TCP hoặc thay màu UI là thuật toán mới; không nhận số liệu binary/JSON hay tải IoT trong tài liệu mẫu làm thành tích CafeLink.

## 8. Kiểm thử và đánh giá

Bằng chứng local ngày 25/10/2026: 142 Java, 65 Chromium, 21 nhóm kiểm gói; 120 ca phục hồi và 12 lượt tải. Load chọn 1/5/10/14 guest, warmup 3 giây, đo 15 giây, ba lượt/mức, một flow tuần tự/giây/guest. Run chốt hoàn tất 1.348/1.350 slot; giữ hai slot lỡ. Đây là phép đo loopback một host, không phải 1.000 thiết bị/2.000 request giây hoặc phép đo saturation.

Oracle mở DB read-only, đối chiếu dữ liệu thật. Các phép đo chưa có CPU/RAM/GC/queue theo thời gian, packet capture TCP hoặc thiết bị thật được giữ là chưa đo. Biên tập báo cáo không chạy lại campaign hoặc tự xác nhận thủ công.

## 9. Sản phẩm và trạng thái bàn giao

Source có README build/run/test, script runtime/maintenance, test, experiment và dependency pin. Báo cáo technical paper có Word/PDF, ảnh/sơ đồ chỉnh sửa được và evidence. Xem [runbook](FINAL_RUNBOOK.md), [checklist người dùng](WEB_USER_ACCEPTANCE.md) và [báo cáo hiện tại](../../report/README.md).

Nhóm đã xác nhận hoàn thành kiểm thao tác thực tế. Phần việc/tỷ lệ thực tế, Compilatio, chốt tên/bộ nộp và bàn giao chính thức được xác nhận riêng. Nộp theo Submission của bộ mới: một DOCX theo tên nhóm và bộ Source/Report; GitHub không thay quy trình nộp môn học.
