# CafeLink - Nâng cấp độ tin cậy và chẩn đoán

Ngày bắt đầu: 30/10/2026. Căn cứ mã nguồn trước nâng cấp: commit `8ee93ca`, ứng dụng V9.3/schema 11. Các báo cáo và phép đo V9.3 đã lưu vẫn mô tả đúng snapshot của chúng; không dùng lại số test hoặc số đo cũ để chứng nhận mã sau sửa.

Mốc RC3 đã kiểm các phần bên dưới: **162 Java, 71 Chromium, 20 Firefox, 20 WebKit; 120 ca phục hồi; 12 lượt tải; 23 nhóm kiểm gói và 8 kiểm public**. [Báo cáo kết quả/hash và cách chạy](../../report/CafeLink_Hardening_20261030.md) ghi cả 94 slot tải chưa phát ở mức 14 khách và các thử nghiệm vật lý còn chờ. Các số này không phải tỷ lệ bao phủ hoặc chứng minh không còn lỗi.

Sau mốc trên có thêm bản sửa phản hồi HTTP khi từ chối yêu cầu chưa gửi đủ nội dung. [Mốc chuẩn bị cập nhật tính năng](../../report/CafeLink_PreFeature_Readiness_20261030.md) ghi gate, gói RC4 và kit nghiệm thu tương ứng; không dùng hash hoặc số đo RC3 để chứng nhận RC4.

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

Kết quả phần 2: **154 Java PASS**, **69 Chromium PASS**, không skip/flaky; build production/experiment đạt và listener test đã đóng. Đã xem ảnh desktop/mobile. [Summary phần 2](../../report/evidence/cafelink-v2/v9.4-hardening/phase2-diagnostics/summary.json) liên kết gate/raw.

## Hạn thanh toán và thao tác đồng thời

Lỗi đã tái hiện: `expires_at` lưu ISO-8601 có phần giây lẻ tùy chọn, nhưng tạo lại giao dịch so sánh TEXT trong SQLite. Ví dụ `01:15:00Z` và `01:15:00.001Z` không có cùng thứ tự chữ với thứ tự thời gian. Điều này có thể trả lại giao dịch đã quá hạn hoặc thay một giao dịch vẫn còn hạn. Ngoài ra, callback đúng thời điểm hết hạn trước đây vẫn được coi là thành công.

Phần sửa đọc hạn bằng `Instant`, lấy một mốc kiểm cho thao tác tạo giao dịch và dùng quy tắc **còn hạn khi thời điểm kiểm nhỏ hơn expiresAt**. Đúng hạn hoặc sau hạn thì EXPIRED. Chỉ tái sử dụng giao dịch PENDING còn hạn; giao dịch cũ được đánh dấu hết hạn trước khi tạo lần mới trong cùng transaction. Callback tới muộn của lần cũ không thay trạng thái của lần mới. Không đổi schema, không sửa dữ liệu lịch sử và không tích hợp ngân hàng thật.

`PaymentDeadlineTest` kiểm tám trường hợp: ba tình huống khác độ chính xác/ranh giới khi tạo giao dịch, xác nhận trước/đúng/sau hạn một nano giây, callback cũ sau lần thay thế, hai luồng cùng bắt đầu/xác nhận. Mốc quyết định là thời điểm Core xử lý bằng clock Server, không dùng thời gian trên điện thoại. Trước sửa có 5/8 ca thất bại; sau sửa 29 ca trong nhóm thanh toán/phiên/nghiệp vụ đều đạt.

Kết quả hồi quy phần 3: **162 Java PASS**, **69 Chromium PASS**, không skip/flaky. [Summary phần 3](../../report/evidence/cafelink-v2/v9.4-hardening/phase3-payment-deadline/summary.json).

## Thứ tự phản hồi trong kiểm thử desktop lịch sử

GitHub CI của commit readiness đã báo lỗi ở `UiWorkflowTest.changingVisitClearsPreviousCustomersDraft`, không phải ở phép kiểm readiness. Bài test chờ nút của khách rồi bấm nút đóng bàn của chủ quán, trong khi chủ quán có thể vẫn đang đợi phản hồi mở bàn. `doClick` trên nút disabled không thực hiện thao tác, nên ca kiểm bị timeout.

Phần sửa chờ đúng nút **Đóng bàn trống** trước khi bấm. Ca kiểm giữ chậm phản hồi OPEN_TABLE sau commit, cho khách đọc trạng thái thật qua TCP và xác nhận rằng nút của khách đã bật trong lúc chủ quán vẫn busy; sau khi nhả phản hồi mới chờ và bấm nút của chủ quán. Không tăng timeout để che lỗi, không bỏ kiểm thử legacy và không thay nghiệp vụ web. Cả năm ca Swing đạt trên JVM 24.0.2 và JVM 17.0.20.1; kết quả CI mới cần đọc riêng, không suy từ chạy local.

## Gói portable và khởi động public

Gói mới ghi đúng V9.4 trong launcher/RELEASE.json, có hướng dẫn chẩn đoán và giữ các patch QR/năm vùng giao diện. Khi dùng `-GateSummary`, script đối chiếu SHA-256 của JAR, **toàn bộ danh sách file giao diện** và hash từng file, rồi kèm `VERIFICATION.json`. Cách cũ chỉ kiểm các file có tên trong manifest nên có thể bỏ sót file được thêm sau lượt test. Guard mới chặn danh sách rỗng/thiếu, đường dẫn trùng, file thiếu/thừa và file đã đổi. Chín test PowerShell qua fixture Python đạt; bốn ca đã đỏ với guard cũ.

Launcher public chờ `/api/ready` ở local, chờ Cloudflare báo đã nối edge trong tối đa 90 giây, sau đó mới kiểm `/api/ready` qua HTTPS công khai và in địa chỉ. URL được cấp không đồng nghĩa tunnel đã kết nối. Lỗi Internet/TLS vẫn có thể xảy ra; launcher báo rõ và dọn các tiến trình do chính nó tạo, không dừng tiến trình khác. Không tắt kiểm chứng TLS để làm demo vượt lỗi.

Gói thử được giải nén vào đường dẫn có khoảng trắng; chạy bằng JRE đi kèm khi PATH của tiến trình không có Java/Node/npm máy phát triển. Bộ kiểm bao gồm manifest/tamper, UI, ảnh menu, quyền khách, phục hồi, thanh toán, restart, backup/restore, khóa dữ liệu, path escape và cổng đã dùng. Bằng chứng gồm cả lượt public thất bại ban đầu; không sửa kết quả cũ thành PASS khi thử lại.

Gói RC2 tại workspace: `dist/CafeLink-Web-V9.4-RC2.zip`, SHA-256 `F51EBDF8A64512BB8A909FEF8F5F15D883208EEE11294031DE718505264633D5`. **23 nhóm kiểm gói PASS**, **8 kiểm public HTTPS/WSS PASS**, tiến trình/listener do test tạo đã đóng. [Kết quả RC2](../../report/evidence/cafelink-v2/v9.4-hardening/phase5-release-rc2/summary.json); [lượt public thất bại trước sửa](../../report/evidence/cafelink-v2/v9.4-hardening/phase5-release/summary.json). Đây là Chromium đi qua Internet từ máy phát triển, chưa phải điện thoại hoặc hai máy LAN vật lý. URL thử nghiệm đã hết sau khi dọn tiến trình.

## Trình duyệt khác và lỗi âm thanh

`playwright.config.ts` mặc định vẫn Chromium, có thể chọn engine bằng `CAFELINK_E2E_ENGINE=firefox` hoặc `webkit`. Script riêng kiểm luồng menu/trả trước, QR/phiên riêng, chẩn đoán và tình huống âm thanh trên hai engine. Mỗi nhóm mở Core/Gateway/DB riêng và từ chối dùng cổng đã có tiến trình. Kết quả, số skip/flaky, hash JAR/giao diện và việc đóng listener được lưu riêng.

Lượt đầu phát hiện test clipboard đang cấp quyền bằng tên chỉ Playwright Chromium hỗ trợ. Bản sửa giữ kiểm clipboard thật ở Chromium; với Firefox/WebKit, quan sát nội dung ghi **sau khi `writeText` thật hoàn thành**, không thay kết quả thành công giả. Test vẫn kiểm nhánh bị từ chối quyền và trường link sao chép thủ công. Không bỏ ca kiểm này khi đổi engine.

WebKit trên Windows cũng cho thấy `AudioContext.resume()` có thể chờ mãi. Bản sửa giới hạn kích hoạt trong 2,5 giây, chặn bấm lặp trong lúc chờ, đóng context lỗi và cho thử lại. Cảnh báo âm thanh tách khỏi lỗi tải thông báo để polling không tự xóa cảnh báo. Khi đăng xuất/unmount, hủy lượt kích hoạt và đóng context; kết quả đến muộn không bật lại trạng thái trên component đã rời. Thông báo chữ và hàng đợi tiếp tục hoạt động khi âm thanh không dùng được.

`audio.spec.ts` dùng fixture cho promise không hoàn tất/từ chối quyền để kiểm timeout, cảnh báo bền, thử lại và đóng context sau đăng xuất. Hai ca đã đỏ trước sửa rồi đạt sau sửa. Ca thông báo nhiều tab vẫn dùng AudioContext thật, ghi annotation phân biệt kích hoạt được với fallback bằng chữ. Các ca này không đo âm thanh phát ra loa.

```powershell
cd D:\BTL-LTM\cafelink-system
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-browser-compatibility.ps1
```

Đây là engine Firefox/WebKit chạy trên Windows và các viewport nhỏ, chưa phải nghiệm thu Safari/iPhone, Android, camera QR hoặc loa thật. Không thay kết quả thiết bị vật lý bằng tên engine.

Lượt sau sửa đạt 20 ca mỗi engine, không skip/flaky; hash JAR/giao diện khớp gate đầy đủ 162 Java/71 Chromium. [Summary phần 6](../../report/evidence/cafelink-v2/v9.4-hardening/phase6-audio-and-compatibility/summary.json). Sau đó RC3 được kiểm lại trên JRE đi kèm và HTTPS/WSS public; các run/giới hạn nằm trong báo cáo kết quả đầu trang.
