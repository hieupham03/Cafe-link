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
