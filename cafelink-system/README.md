# CafeLink V9.4 - Gọi món và điều phối phục vụ qua mạng

CafeLink là bài tập lớn môn Lập trình mạng cho một quán café. Khách quét QR bàn để vào website, chọn đồ uống có ảnh/ghi chú từng phần, đặt và thanh toán giả lập trước khi quầy pha chế. Chủ quán quản lý menu, nhận đơn/thông báo, xử lý hỗ trợ, theo dõi tiến độ và lịch sử hóa đơn. Mỗi browser/profile có phiên riêng; bàn là địa chỉ giao đồ, không phải một tài khoản/hóa đơn chung cho tất cả khách.

**Source hiện tại: V9.4, schema 11.** [Nâng cấp vận hành và kiểm thử](docs/WEB_HARDENING.md) ghi các thay đổi sau mốc V9.3. Báo cáo [Evidence13](../report/CafeLink_Technical_Paper_Evidence13_20261029.md) và số liệu ngày 25/10 mô tả snapshot V9.3, chưa tự trở thành kết quả của mã mới. [Chỉ mục báo cáo](../report/README.md) phân biệt báo cáo với bản RC1 cũ; các việc còn chờ ở [SUBMISSION_READINESS.md](../report/SUBMISSION_READINESS.md).

[Báo cáo nâng cấp ngày 30/10](../report/CafeLink_Hardening_20261030.md) ghi kết quả Java/Chromium/Firefox/WebKit, gói portable, phép đo mới và giới hạn. Dữ liệu kiểm hiện tại gồm 162 Java, 71 Chromium và 20 ca trên mỗi engine Firefox/WebKit; xem run/hash trong báo cáo thay vì cộng dồn với các mốc cũ.

Trước khi cập nhật tính năng, dùng [checkpoint và trạng thái chuẩn bị](../report/CafeLink_PreFeature_Readiness_20261030.md). [Bộ nghiệm thu thiết bị](docs/WEB_DEVICE_ACCEPTANCE.md) được tạo bằng `scripts/prepare-device-acceptance.ps1` từ ZIP RC3 đã kiểm; dùng profile riêng và mẫu kết quả còn trống. Kit được tạo ở workspace local, không tải kèm khi clone repo.

Bộ yêu cầu đầy đủ hiện dùng được phân loại tại [final-project-2](../final-project-2/README.md), gồm Instruction, Topics, README mẫu, SPECIFICATION và Submission. Xem [đặc tả áp dụng riêng cho CafeLink](docs/PROJECT_SPECIFICATION.md) và [đối chiếu yêu cầu](../report/CafeLink_Requirements_Alignment.md). SPECIFICATION trong bộ môn mô tả đề tài IoT khác; các thông số của nó không được gán cho CafeLink.

Bản báo cáo hiện tại có 45 trang, chữ nội dung 13: [Word](../report/NhomXX_CafeLink_Report_Evidence13_20261029.docx), [PDF](../report/NhomXX_CafeLink_Report_Evidence13_20261029.pdf), [Markdown](../report/CafeLink_Technical_Paper_Evidence13_20261029.md). Nội dung giải thích kiến trúc/giao thức, nghiệp vụ, contribution và bằng chứng thực nghiệm; bản RC1 được giữ riêng để đối chiếu. Compilatio và nghiệm thu điện thoại vẫn chờ kết quả thật.

## 1. Kiến trúc và trọng tâm môn học

```text
Browser khách/quản lý + IndexedDB journal
    | HTTP/HTTPS (lệnh), WebSocket/WSS (trạng thái)
Java Jetty Gateway
    | TCP Socket: 4-byte big-endian length + UTF-8 JSON
Java TCP Core / CafeService
    | JDBC, transaction
SQLite + file khóa QR + thư mục ảnh
```

Gateway xác thực cookie/Origin/CSRF rồi chuyển lệnh qua TCP; Core quyết định quyền, scope, giá và trạng thái, ghi SQLite. Gateway không ghi tắt DB nghiệp vụ. Browser không mở TCP socket thô trực tiếp. Public demo thêm Cloudflare Quick Tunnel phía trước Gateway loopback; Core vẫn loopback.

Các nội dung lập trình mạng: framing và đọc đủ byte, nhiều connection, request/response có correlation ID, server push snapshot/revision, queue giới hạn, timeout/disconnect, xác thực, đồng bộ dữ liệu và phục hồi khi kết quả lệnh chưa rõ. Core có tối đa 64 reader; queue outbound 64 message/peer. Gateway tối đa 32 bridge, tối đa 30 guest và 16 admin cùng chia sẻ tổng 32. Thu hồi guest nhàn rỗi giữ credential/receipt để resume; đây là giới hạn cấu hình, không phải công suất đã đo tối đa.

Trong `/admin`, mục **Chẩn đoán hệ thống** cho quản lý xem trạng thái TCP/DB, số kết nối, hàng đợi, lỗi và tra mã yêu cầu gần đây. Trang báo rõ khi số liệu đã cũ vì mất kết nối; khách không được truy cập. [Giới hạn và cách đọc số liệu](docs/WEB_HARDENING.md#chẩn-đoán-dành-cho-quản-lý).

## 2. Công nghệ và thư viện

| Thành phần | Công nghệ/phiên bản ghim |
|---|---|
| Core/Gateway | Java, bytecode target 17; Jetty WebSocket 12.0.40 |
| Serialization | Gson 2.11.0 |
| Persistence | SQLite JDBC 3.50.3.0; schema tự tạo/migrate |
| Logging | SLF4J Simple 2.0.16 |
| Java tests | JUnit Jupiter 5.11.4 |
| Frontend | React 19.3.1, TypeScript 5.9.3, Vite 8.3.5 |
| QR / browser tests | qrcode.react 4.2.0; Playwright 1.64.1 |
| Build / analysis | Maven 3.9.11 bootstrap; Node.js/npm; Python, Matplotlib |

Phiên bản đầy đủ nằm ở `pom.xml`, `web/package.json`, `web/package-lock.json` và `tools/requirements-v8.txt`. Năm ô trên màn khách: Thực đơn, Đơn đã gọi, Hỗ trợ, Thanh toán, Giỏ hàng. Luồng MANUAL/POSTPAY cũ được giữ cho tương thích/hồi quy, không phải luồng demo chính.

## 3. Cấu trúc source

```text
cafelink-system/
  src/main/java/com/cafelink/
    common/       frame, message, model, command classification
    server/       TCP, xác thực, nghiệp vụ, SQLite
    web/          HTTP/WebSocket Gateway, session bridge
    client/       TCP client và desktop lịch sử
  src/test/       Java integration/unit/UI regression
  web/src/        website khách/quản lý và journal
  web/tests/      Chromium E2E và kiểm gói
  web/experiments/  driver phục hồi/đo tải có kiểm soát
  scripts/        build/run/test/experiment/package
  tools/          oracle SQLite, phân tích số liệu
  release/        launcher Windows, runtime pin
  docs/           protocol, kiến trúc, demo, nghiệm thu
```

`target/`, `.tools/`, `web/node_modules/`, DB/khóa/cookie/log phiên chạy không phải source cần nộp. Chúng được tạo khi build/run. Gói bàn giao kèm một bản E0 ZIP niêm phong ở thư mục `dist/` cấp trên để script test kiểm hash baseline; không tái tạo E0 từ source V9.3.

## 4. Yêu cầu môi trường

Build/kiểm thử chuẩn trên Windows x64: PowerShell 5.1+, JDK 17+, Node.js 20.19+ hoặc 22.12+, npm. Đo thực nghiệm cần Python 3.13 và dependencies trong requirements. Cần Internet lần đầu để tải Maven/dependency npm/Maven/Chromium. Đặt source trong đường dẫn ASCII, ví dụ `D:\CafeLink-Source\`; khoảng trắng được kiểm, đường dẫn có dấu chưa được nghiệm thu đầy đủ.

Gói chạy sẵn trong `Run/CafeLink-Web-V9.3/` của bộ bàn giao có JRE 17, không cần JDK/Node để chạy. Gói demo thanh toán **LOCAL_SIMULATOR**, không thu tiền thật hoặc yêu cầu thông tin ngân hàng.

## 5. Build từ source

Mở terminal tại thư mục có README này:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-web.ps1
```

Script cài npm theo lock, typecheck/build frontend rồi package Java. Maven được bootstrap vào `.tools` và kiểm SHA-512 khi tải. Output: `target/cafelink-1.0.0.jar`, `target/lib/`, `web/dist/`. Tên Maven artifact `1.0.0` là tên nội bộ giữ tương thích, không phải đang chạy nhầm bản desktop cũ. Mốc phát hành/ảnh giao diện trong gói chạy xác định bằng `RELEASE.json` và hash.

## 6. Tạo dữ liệu và chạy local

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-web.ps1 -Port 8088 -TcpPort 5058 -DatabasePath data/local-demo/cafelink.db
```

Mở `http://127.0.0.1:8088/admin`, tài khoản `admin`, mật khẩu demo `CafeLink@123`. DB mới tự tạo schema, admin, sáu bàn và tám đồ uống. Không cần cài database server hoặc nhập SQL thủ công. Seed không ghi đè mật khẩu/dữ liệu DB đã có.

Admin bấm **Mở tất cả bàn → Bàn 1 → Sao chép link đặt món**. Khách dán nguyên link vào browser/profile khác, hoặc InPrivate/Ẩn danh (`Ctrl+Shift+N` trên Edge/Chrome), bấm **Vào bàn của tôi**. Các tab thường dùng chung cookie admin; các cửa sổ ẩn danh đang mở cũng có thể cùng một phiên riêng tư. Hai khách độc lập cần hai browser/profile/thiết bị độc lập.

Link phải chứa mã `#table=...` lấy từ màn QR. App đọc mã rồi ẩn khỏi thanh địa chỉ; copy `/join` sau khi đã mở có thể thiếu mã. Không cần đăng nhập admin trên trang khách.

Giữ terminal Server mở; Ctrl+C dừng đúng demo. Nếu cổng bận, đổi cả HTTP/TCP sang cặp khác. Script không tự dừng tiến trình khác. Không xóa DB khi đang chạy.

## 7. Demo public HTTPS

Từ source sau build, dùng profile public riêng:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/public-demo.ps1 -SkipBuild -Port 19088 -TcpPort 19058
```

Dùng địa chỉ HTTPS và **mật khẩu tạm in trong terminal**; không dùng mật khẩu local. Mở tất cả bàn rồi cho điện thoại quét QR. Hostname Quick Tunnel có thể đổi khi chạy lại; lúc đó lấy QR mới. Cookie/IndexedDB theo origin không tự chuyển sang hostname mới. Không mở port TCP Core ra Internet.

Nếu dùng gói chạy sẵn, chạy `Start-Local.ps1` hoặc `Start-Public.ps1` trong gói; xem [WEB_V9_3](docs/WEB_V9_3.md). Gói portable chỉ cho một launcher tại một thời điểm. Local/public là profile DB riêng; dừng launcher cũ trước khi chuyển chế độ. Backup/reset/restore offline: [WEB_RELEASE](docs/WEB_RELEASE.md).

## 8. Kiểm thử tự động

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-web.ps1 -Phase V9.4
```

Lệnh chạy Java verify, typecheck/build production + experiment, cài Chromium và chạy các nhóm E2E bằng Core/Gateway/SQLite thật. `-SkipInstall -SkipBrowserInstall` chỉ dùng khi dependencies/browser đã có. Cổng test 18080/18081 phải trống; không tái sử dụng demo đang chạy. Kết quả có JUnit XML, Playwright JSON, ảnh và hash trong `../report/evidence/cafelink-v2/v9.4-gate/<run>/`. Kiểm Firefox/WebKit riêng bằng `scripts/test-browser-compatibility.ps1`; đây vẫn là engine trên Windows, chưa phải điện thoại thật.

Mốc V9.3 đã lưu: **142 Java + 65 Chromium PASS**, không lỗi/bỏ qua/flaky; **21 nhóm kiểm gói sạch PASS** bằng JRE đi kèm. Các lần kiểm mới khi chạy lại có thư mục riêng, không ghi đè evidence đã chốt. Xem báo cáo chính để biết run/hash chính xác và kiểm từ source sạch.

## 9. Thực nghiệm và contribution

```powershell
python -m pip install -r tools/requirements-v8.txt
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/experiment-web.ps1 -OutputPath ..\report\evidence\cafelink-final\my-new-run
```

Chọn thư mục output mới. Trước khi đo phải có JAR và assets từ source hiện tại; script build assets nhưng không thay Java verify. Full: tám tình huống × ba policy × năm lần = 120 ca phục hồi; tải 1/5/10/14 guest × ba lần = 12 lượt, warmup 3 giây/đo 15 giây. Driver chờ màn khách sẵn sàng trước warmup, không retry để che lỗi thao tác. Số 14 là mức tải chọn cho thực nghiệm, không phải hạn mức guest hiện tại.

Giữ raw/metadata/CSV/oracle/biểu đồ, cả lần FAIL và slot lỡ. Không gọi loopback là LAN/điện thoại thật hoặc throughput đo được là công suất tối đa. README không cộng dồn số test giữa các phiên bản. Kết quả cuối, phương pháp và giới hạn nằm trong [báo cáo hiện tại](../report/CafeLink_Technical_Paper_Evidence13_20261029.md).

Hai contribution là tích hợp/đánh giá **phục hồi theo loại yêu cầu** và **barrier/phạm vi phiên chống yêu cầu cũ hồi sinh hoặc tác động sai lượt**. R0 REPLAY_ALL, R1 REVIEW, R2 SEMANTIC cùng giữ receipt, fingerprint, idempotency và quyền/scope. Không gọi ACK/retry/TCP/QR là thuật toán mới; không gán toàn bộ lợi ích chống trùng riêng cho R2 hoặc tuyên bố vượt các POS thương mại.

## 10. Giới hạn và bảo vệ dữ liệu demo

- Thanh toán/hoàn tiền giả lập; không có tích hợp ngân hàng, kho nguyên liệu hoặc nhiều chi nhánh.
- QR là quyền vào/địa chỉ bàn, không xác minh hiện diện vật lý. Browser mất cookie/storage hoặc đổi origin cần hỗ trợ đối chiếu, không tự lấy lại danh tính từ QR chung.
- Giới hạn queue/session/rate được giữ khi đo. Chưa có SLA/công suất tối đa hoặc kết luận kiểm toán an toàn production.
- Nghiệm thu điện thoại/camera/mạng vật lý và đánh giá người dùng thật **chờ người dùng kiểm sau**; không đánh dấu đạt thay người dùng. [Checklist](docs/WEB_USER_ACCEPTANCE.md).
- Không đưa DB, `.qr-key`, journal/cookie, backup phiên thật, `target` private hoặc mật khẩu public vào bộ source chia sẻ. Dữ liệu runtime nằm ngoài manifest pristine.
- Source có workflow Windows; remote CI chỉ được coi đã chạy khi có URL/run evidence thực tế. Hướng dẫn nộp và Compilatio không tự hoàn thành bởi test tự động.

## 11. Tài liệu và nguồn

- [Báo cáo hiện tại](../report/CafeLink_Technical_Paper_Evidence13_20261029.md), [chỉ mục bản Word/PDF và evidence](../report/README.md), [trạng thái chuẩn bị nộp](../report/SUBMISSION_READINESS.md).
- [Kiến trúc bản chốt](docs/FINAL_ARCHITECTURE.md), [giao thức bản chốt](docs/FINAL_PROTOCOL.md).
- [Hướng dẫn V9.3](docs/WEB_V9_3.md), [phục hồi](docs/WEB_RECOVERY.md), [dữ liệu demo](docs/WEB_RELEASE.md).
- [RFC 9293 — TCP](https://www.rfc-editor.org/rfc/rfc9293.html), [RFC 6455 — WebSocket](https://www.rfc-editor.org/rfc/rfc6455.html), [RFC 9110 — HTTP](https://www.rfc-editor.org/rfc/rfc9110.html).
- [W3C IndexedDB](https://www.w3.org/TR/IndexedDB/), [SQLite WAL](https://www.sqlite.org/wal.html), [Square idempotency](https://developer.squareup.com/docs/build-basics/common-api-patterns/idempotency).
