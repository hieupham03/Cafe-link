# CafeLink - Thực nghiệm phục hồi và tải

Harness đánh giá phục hồi và tải trên source được build cho từng lần chạy. Mỗi run giữ source manifest, cấu hình, raw và oracle riêng, không ghi đè kết quả. [Kiểm hồi quy](TESTING.md) được thực hiện trước phép đo.

Đây là công cụ đo phục vụ báo cáo CafeLink. Demo khách/quản lý tiếp tục dùng `scripts/public-demo.ps1` hoặc `scripts/run-web.ps1`; không cần bật trang thực nghiệm.

## Chạy lại

Từ thư mục `cafelink-system`, cần JDK 17+, Node.js theo `web/package.json`, Python 3.13 và Chromium của Playwright:

```powershell
python -m pip install -r tools/requirements-v8.txt
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-web.ps1 -Phase V10.1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/experiment-web.ps1 -Quick -OutputPath target/experiments/quick-run
```

Gate kiểm Java và Browser trước; lệnh thực nghiệm tạo campaign ngắn và phân tích kết quả. Bỏ `-Quick` và chọn output khác để đo đầy đủ. Chỉ thêm `-SkipInstall -SkipBrowserInstall` cho gate khi dependencies/browser đã có.

Nếu vừa có regression PASS và chỉ muốn chạy thực nghiệm:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/experiment-web.ps1
```

Script này build web nhưng **không thay thế Java verify/E2E**. Nó dùng JAR hiện tại, tự build JAR nếu thiếu. Dùng `-SkipBuild` chỉ khi cả production và experiment assets vừa được build từ source hiện tại. Mỗi lần tạo thư mục evidence mới trong `target/evidence/cafelink-v2/v8/`; thư mục target bị ignore khỏi Git.

## Chính sách so sánh

| Chính sách | Khi chưa rõ kết quả | Guard được giữ nguyên |
|---|---|---|
| R0 `REPLAY_ALL` | Gửi lại cùng commandId và payload | Receipt, fingerprint, quyền/scope và business uniqueness |
| R1 `REVIEW` | Tra receipt; chưa nhận thì chờ xác nhận, không tự lập discard barrier | Như R0 |
| R2 `SEMANTIC` | Tra receipt; đơn chưa nhận cần xác nhận; lời gọi chưa nhận hoặc lượt đã đóng được DISCARD | Như R0, thêm quyết định DISCARD theo ngữ nghĩa |

Giao diện sản phẩm chỉ dùng R2 mặc định. Không có nút/URL chuyển policy cho khách. `experiment.html` và mã harness chỉ thuộc `web/experiment-dist`, được Gateway phục vụ khi chỉ định assets này cho fixture. Production `web/dist` không có trang harness; E2E kiểm 404. Các nhánh policy được thử nằm trong module recovery dùng chung, không phải ba bản sao tùy chỉnh cho ra kết quả mong muốn.

## Campaign phục hồi

Tám tình huống × ba policy × năm lần = **120 ca**, seed `20261023`. Mỗi ca có browser context và private visit mới. Cứ 12 ca đổi fixture JVM/DB; giữ rate limit và session limit của sản phẩm.

| Tình huống | Fault/điều kiện | Oracle chính |
|---|---|---|
| `NORMAL_ORDER` | Không fault | Một đơn, không yêu cầu xác nhận lại |
| `LOST_ORDER_ACK` | Forward thật, nhận HTTP thành công rồi bỏ response | Một đơn dưới cả ba policy |
| `UNACCEPTED_ORDER` | Abort trước forward | R0 tự tạo đơn; R1/R2 chờ khách, chưa tạo đơn |
| `UNACCEPTED_SERVICE` | Abort trước forward; giả định nhu cầu đã hết khi khôi phục | R0 tạo ticket, R1 chờ, R2 bỏ và lưu barrier |
| `LOST_SERVICE_ACK_HANDLED` | Đã nhận, mất response; nhân viên xử lý trước recovery | Một ticket HANDLED, không sinh lại |
| `VISIT_ENDED` | Đơn chưa nhận, quản lý kết thúc phiên và thu hồi quyền; khách mới quét cùng QR | Cả ba policy bị chặn bằng SESSION_REVOKED; gửi trực tiếp lệnh cũ cũng phải nhận 401, DB không có tác động lên lượt cũ/mới |
| `DISCARD_WINS_LATE_SERVICE` | Lời gọi chưa nhận; sau recovery mới giao lệnh cũ | R2 không hồi sinh ticket; R1 chưa có barrier nên lệnh cũ vẫn có thể được nhận |
| `ACCEPT_WINS_LATE_SERVICE` | Giao lệnh trước recovery, nhân viên đã xử lý | Giữ kết quả đã nhận, không DISCARD ngược một việc đã xảy ra |

Đây là fault có kiểm soát tại HTTP, không phải đánh rơi gói TCP. “ACK” trong tên ca là phản hồi ứng dụng. Hai lịch đến muộn kiểm thứ tự quan sát được, không tuyên bố đã duyệt mọi lịch thread. Đơn và lời gọi đi qua API/journal thật, Gateway, TCP Core và SQLite thật.

"Lời gọi thừa nhu cầu" chỉ có nghĩa trong ca **đã quy định nhu cầu hết**. Campaign không khảo sát khách thật. `recoveryMs` đo từ bắt đầu đối chiếu đến đọc lại state/journal trên cùng đồng hồ browser; trạng thái chờ xác nhận vẫn là kết quả đối chiếu, không phải đã hoàn tất mong muốn khách.

Với `VISIT_ENDED`, ca kiểm xét trường hợp quyền bị thu hồi: `recoveryMs` là thời gian nhận từ chối phục hồi, ghi kèm `recoveryBlockedBy=SESSION_REVOKED`. Ca này không yêu cầu hay chứng minh receipt DISCARD vì Client đã mất quyền gửi lệnh. Hai ca lời gọi chưa nhận/đến muộn vẫn bắt buộc kiểm barrier bền của R2. Thời gian bị từ chối phục hồi khác thời gian hoàn tất một ý định còn đủ quyền; không gộp hai loại kết quả.

SQLite oracle mở read-only và chỉ xuất cột cho phép theo visit/membership. Nó đếm đơn/ticket/payment/receipt/event, không tạo ACK và không sửa nghiệp vụ. Teardown xử lý dữ liệu fixture sau đo. DB, khóa, cookie, grant và log JVM nằm dưới `target/v8-private`, không đưa vào artifact công khai.

## Đo tải

Full: **1/5/10/14 khách + một admin**, warmup 3 giây, đo 15 giây, ba lần mỗi mức. Quick: 1/5 khách, warmup 1 giây, đo 3 giây, một lần. Giữ nguyên giới hạn tài nguyên của sản phẩm trong lúc đo.

Mỗi guest là một context Chromium riêng, mở React `/guest` thật và nhận cập nhật. Mỗi slot một giây bắt đầu nhiều nhất một luồng: chọn một cà phê sữa 30.000đ → ghi journal → PLACE_ORDER → quầy ACCEPT_ORDER → START_ORDER_PAYMENT → SIMULATE_PAYMENT SUCCESS. Mỗi actor chạy tuần tự; lỡ slot được đếm, không xếp thêm tác vụ chồng nhau để che quá tải. Giữ các đơn đã trả tiền ở SUBMITTED trong thời gian đo, không đưa công đoạn pha chế/giao đồ vào workload này. DB oracle gồm cả warmup và đo, yêu cầu đúng số đơn, một payment PAID/đơn và đúng tổng tiền.

- `responseMs`: từ bắt đầu luồng browser đến khi có receipt đơn trong journal; gồm đọc session/state, IndexedDB và các request của `place`. Không gọi là độ trễ TCP hay một HTTP request đơn lẻ.
- `renderMs`: thời điểm phát hiện `Đơn #id` trong DOM sau khi biết ID từ receipt. Nếu React đã render trước receipt, đây là cận trên của lần render đầu, không phải thời điểm commit → push chính xác.
- `totalMs`: toàn bộ luồng tới thanh toán giả lập thành công và phát hiện DOM.
- `http-samples.csv`: action, status, thời gian tới body hoàn chỉnh, byte body request/response UTF-8 đã giải mã. Gồm request nền quan sát được, không gồm header, WebSocket, TCP/TLS hoặc retransmission; không suy ra băng thông trên dây.
- p50/p95 dùng nearest rank `ceil(p*n)`; số mẫu rỗng không đổi thành 0. Mẫu cùng lần chạy có tương quan; không suy ra độ tin cậy thống kê từ số request.
- Throughput chia số luồng hoàn tất cho cửa sổ đo thực tế, đợi đủ cửa sổ dù các slot cuối hoàn tất sớm. Đây là tải định sẵn, chưa phải công suất tối đa.

Nguồn phát tải, browser và Server chung máy. Tắt các bộ benchmark/test khác khi đo. Không dùng số liệu này để khẳng định phục vụ được 14 điện thoại thật với cùng độ trễ qua Internet.

## Đọc kết quả

`summary.json` xác nhận toàn bộ campaign/analysis của lần đo. `environment.json` ghi OS/CPU/RAM/JDK/Node/Python và hash JAR/manifest. `source-manifest.json` ghi source/config/assets dùng lúc đo. `recovery/metadata.json`, `load/metadata.json` ghi seed/cấu hình/trạng thái; raw ở hai file `results.json`. CSV tách ca, policy, luồng và HTTP; `analysis.json`, `results.svg/png` để đưa vào báo cáo.

Nếu có lỗi, giữ raw/status FAIL và sửa nguyên nhân rồi tạo **lần chạy mới**. Không bỏ ca lỗi để làm đẹp p95. `tools/analyze_web.py` từ chối campaign thiếu ca, metadata sai trạng thái hoặc lỗi chưa xử lý. Các lần diagnostic không gộp vào campaign nghiệm thu chính thức.

Campaign này không tự cung cấp CPU/RAM/queue depth theo thời gian, byte TCP từng chặng, commit→render chính xác, mất điện, camera hoặc usability thực tế. Những kết luận đó cần thiết kế phép đo riêng. Không kết luận một tối ưu hiệu quả nếu chưa có đối chứng phù hợp.
