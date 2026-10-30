# CafeLink - Nâng cấp độ tin cậy và chẩn đoán

Ngày bắt đầu: 30/10/2026. Căn cứ mã nguồn trước nâng cấp: commit `8ee93ca`, ứng dụng V9.3/schema 11. Các báo cáo và phép đo V9.3 đã lưu vẫn mô tả đúng snapshot của chúng; không dùng lại số test hoặc số đo cũ để chứng nhận mã sau sửa.

## Cách thực hiện

Mỗi phần có kiểm thử riêng và kiểm hồi quy phù hợp, sau đó commit/push trước khi sang phần tiếp theo. Giữ DOCX người dùng đang sửa, dữ liệu vận hành và bộ RC1 niêm phong. Chỉ stage các file của phần đang hoàn tất.

## Phạm vi

1. **Sẵn sàng phục vụ:** phân biệt liveness của Gateway với readiness qua kết nối TCP thật và kiểm DB; giới hạn thời gian, tải kiểm tra và dữ liệu trả công khai.
2. **Chẩn đoán dành cho quản lý:** số kết nối/yêu cầu/lỗi, tình trạng Core/DB và lịch sử yêu cầu giới hạn, không công khai credential, cookie, QR grant hoặc nội dung riêng của khách.
3. **Rà lỗi nghiệp vụ và kết nối:** kiểm luồng đặt món, trả trước, hỗ trợ, phiên riêng, thao tác đồng thời, ngắt/nối lại; sửa lỗi có ca tái hiện và giữ kiểm hồi quy.
4. **Đánh giá vận hành:** chạy Java, web và các phép đo phù hợp trên mã mới; ghi rõ môi trường, số liệu thật và phần thiết bị vật lý chưa chạy. Chuẩn bị cách quan sát TCP và giải thích lỗi trong demo.

Không coi trạng thái PASS của các phép kiểm đã chọn là chứng minh không còn lỗi. Điện thoại/camera và mạng vật lý cần người có thiết bị thực hiện; không đánh dấu Đạt thay người dùng.

## Nhật ký

- Phần 1: readiness. Bản đầu có `/api/health` chỉ trả `gateway: UP`, nhãn `phase: V7`; bản V9.4 phân biệt hai phép kiểm dưới đây.

## Readiness và liveness

- `GET /api/health`: HTTP 200 khi Gateway trả lời, gồm `version: V9.4`. Không suy từ endpoint này rằng DB hoặc Core đang sẵn sàng.
- `GET /api/ready`: Gateway mở socket tới Core, gửi frame `HEALTH_CHECK`, kiểm phản hồi khớp mã/lệnh. Core đọc dòng metadata trong SQLite. HTTP 200 với `READY` khi cả hai đạt; HTTP 503 với `NOT_READY` khi chưa thể phục vụ.
- Phản hồi công khai chỉ có trạng thái, mã nguyên nhân chung, phiên bản và thời điểm kiểm. Không tạo cookie, tài khoản, lượt khách hoặc dữ liệu nghiệp vụ; không trả đường dẫn DB, SQL hoặc credential.
- Mỗi Gateway gộp các lần hỏi trong một giây bằng cache và một probe đang chạy. Socket có thời hạn chung 500 ms cho việc kết nối/đọc; việc peer trả từng byte không làm kéo dài thời hạn. Trạng thái có thể chậm tối đa khoảng thời gian cache sau khi phụ thuộc vừa thay đổi.
- `UP` của Core nghĩa là nhận đúng phản hồi giao thức. `UNKNOWN` của DB nghĩa là chưa kiểm được, không kết luận DB đã hỏng. Đây là kiểm phụ thuộc chỉ đọc, không phải kiểm toàn bộ tính đúng của nghiệp vụ.
- Core cho phép `HEALTH_CHECK` trước đăng nhập nhưng chỉ trả kết quả đọc hệ thống; các lệnh nghiệp vụ vẫn cần quyền. Core vẫn bind loopback trong cách chạy web hiện tại.
- Đóng một kết nối probe vô danh không phát snapshot tới khách, vì kết nối đó chưa thay đổi hiện diện hoặc dữ liệu.

Ví dụ khi chạy local ở cổng HTTP 19588:

```powershell
Invoke-RestMethod http://127.0.0.1:19588/api/health
Invoke-RestMethod http://127.0.0.1:19588/api/ready
```

Kiểm mới nằm ở `ReadinessIntegrationTest`: HTTP/TCP/SQLite thật, Core dừng, DB đóng, TCP không trả lời, dữ liệu sai giao thức, mã phản hồi sai, phản hồi nhỏ giọt và cache. Tình huống nhỏ giọt đã làm test đỏ trước khi áp thời hạn chung.

Kết quả phần 1: **150 Java PASS**, gồm tám test readiness mới; **8 Chromium PASS** ở nhóm dashboard/QR. [Summary của phần 1](../../report/evidence/cafelink-v2/v9.4-hardening/phase1-readiness/summary.json). Đây chưa phải lượt nghiệm thu điện thoại hoặc đo hiệu năng lại trên V9.4.

## Chẩn đoán dành cho quản lý

Đăng nhập `/admin`, chọn **Chẩn đoán hệ thống** ở thanh điều hướng. Trang đọc `GET /api/admin/diagnostics`, tự cập nhật mỗi 5 giây khi tab hiển thị; nút **Làm mới chẩn đoán** kiểm ngay. Khi rời trang, bộ hẹn giờ và request đang chờ được hủy. Khi tải thất bại, số liệu gần nhất được giữ kèm cảnh báo và thời điểm lấy; không tiếp tục báo xanh như trạng thái mới.

- **Tình trạng phục vụ:** Gateway, TCP Core, DB và thời điểm kiểm; dùng cùng probe có thời hạn/cache của `/api/ready`.
- **Kết nối:** số TCP peer, reader/giới hạn 64, bản tin chờ gửi/giới hạn 64 mỗi peer, số lần ngắt vì đầy hàng đợi, lỗi đọc; số bridge web/giới hạn 32, guest/admin, WebSocket và lệnh đang chờ.
- **Xử lý:** số yêu cầu, số bị từ chối hoặc lỗi, thời gian dispatch Core trung bình/lớn nhất. Không tính PING, HEALTH_CHECK, GET_DIAGNOSTICS để việc giám sát không tự làm tăng tải nghiệp vụ đã đếm. Thời gian chưa gồm truyền mạng, enqueue phản hồi, phát snapshot hoặc render. Lỗi quyền/dữ liệu cũng tăng bộ đếm lỗi, không đồng nghĩa chương trình đã hỏng.
- **Tra yêu cầu:** tối đa 100 dòng gần nhất, mới nhất ở trên; lọc theo command ID, lệnh hoặc kết quả. Dùng mã UUID hiện ở màn phục hồi để tra. `OK` chỉ nói Core xử lý thành công, chưa chứng minh Browser nhận được phản hồi. Mã tùy ý không phải UUID được hash rút gọn; tên action ngoài danh sách được ghi là UNKNOWN_ACTION. Không giữ payload, mật khẩu, cookie, credential, grant hoặc nội dung hỗ trợ.
- **Tiến trình:** heap và thread là của cả Core/Gateway vì chạy chung JVM; không diễn giải thành mức sử dụng riêng từng tầng. Bộ đếm/lịch sử chẩn đoán chỉ ở RAM và bắt đầu lại khi restart. Lịch sử đơn/receipt trong SQLite vẫn giữ theo cơ chế hiện có.

Endpoint yêu cầu ADMIN ở cả Gateway lẫn Core; khách và người chưa xác thực bị chặn. Không thêm GET_DIAGNOSTICS vào danh sách lệnh web chung. API có `Cache-Control: no-store`. Đây là công cụ vận hành cho quy mô bài tập lớn, chưa thay hệ thống giám sát và audit dài hạn.

Các ca mới: `DiagnosticsIntegrationTest` kiểm phân quyền web/TCP, bộ đếm thực, giới hạn lịch sử và không lộ dữ liệu; `web/tests/diagnostics.spec.ts` kiểm tra/filter mã, lỗi cập nhật/phục hồi, layout 390 px, ngừng polling khi rời trang và endpoint công khai. Nhóm `diagnostics` được đưa vào `npm run test:e2e`; script gate mặc định ghi nhãn V9.4 và giữ ảnh desktop/mobile.

K?t qu? ph?n 2: **154 Java PASS**, **69 Chromium PASS**, kh?ng skip/flaky; build production/experiment ??t v? listener test ?? ??ng. ?? xem ?nh desktop/mobile. [Summary ph?n 2](../../report/evidence/cafelink-v2/v9.4-hardening/phase2-diagnostics/summary.json) li?n k?t gate/raw.
