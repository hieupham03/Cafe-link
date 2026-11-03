# CafeLink - Source và hướng dẫn phát triển

Ứng dụng V10.1, schema 13: gọi món QR, tiếp nhận trước thanh toán giả lập, điều phối phục vụ, hỗ trợ, thuế/thu chi và phân quyền quản lý/nhân viên. [Tổng quan và giao diện](../README.md) · [Tài liệu kỹ thuật](docs/README.md).

## Môi trường

| Thành phần | Yêu cầu |
|---|---|
| Server | Windows, PowerShell 5.1+, JDK 17+ |
| Frontend build | Node.js 22.12+ và npm; manifest cũng hỗ trợ nhánh Node 20.19+ |
| Công cụ đo | Python 3.13 và dependency trong `tools/requirements-v8.txt` |
| Browser | Trình duyệt hỗ trợ IndexedDB, Web Locks và Web Crypto; điện thoại truy cập HTTPS |

Internet cần để tải dependency/browser/runtime cho lần đầu. Script bootstrap Maven; không cần cài Maven hoặc SQLite server riêng.

## Build và chạy

Từ thư mục `cafelink-system`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-web.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-web.ps1 -Port 8088 -TcpPort 5058 -DatabasePath data/local-demo/cafelink.db
```

`build-web.ps1` cài dependency bằng lockfile, kiểm TypeScript, build Vite và package Java. Mở **http://127.0.0.1:8088/admin**, dùng local **`admin` / `CafeLink@123`**. Giữ terminal mở, dùng Ctrl+C để dừng.

Quản lý bấm **Mở tất cả bàn**, lấy QR/link đặt món rồi mở ở profile khách độc lập. Khách gửi đơn → quầy tiếp nhận → khách thanh toán giả lập → quầy pha chế/giao. Hai tab cùng profile có thể dùng chung phiên. [Thao tác đầy đủ](docs/USER_GUIDE.md) · [Kịch bản demo](docs/RUNBOOK.md).

## Cấu hình

| Tham số `run-web.ps1` | Mặc định | Ý nghĩa |
|---|---|---|
| `-Port` | `8080` | HTTP/WebSocket Gateway |
| `-TcpPort` | `5051` | TCP Core, bind loopback |
| `-DatabasePath` | `data/v2/cafelink.db` | File SQLite; dùng profile riêng theo mục đích |
| `-BindAddress` | `127.0.0.1` | HTTP local; truy cập từ thiết bị cần HTTPS hợp lệ |
| `-OrderingMode` | `prepay` | Chế độ cấu hình; phiên QR AUTO được tạo theo luồng PREPAY |
| `-AssetsPath` | `web/dist` | Assets production |
| `-QrKeyFile` | Cạnh DB | Khóa QR; giữ cùng profile dữ liệu |
| `-KeyStore` | Không bật | TLS trực tiếp; mật khẩu từ `CAFELINK_KEYSTORE_PASSWORD` |
| `-PublicOrigin`, `-TrustedProxy` | Không bật | HTTPS qua proxy; dùng launcher public để cấu hình đồng bộ |

Đường dẫn tương đối được giải từ `cafelink-system`. Website không tự đọc `.env`. `CAFELINK_QR_KEY` là tùy chọn cấp khóa từ môi trường. [Triển khai và dữ liệu](docs/DEPLOYMENT.md).

### Dữ liệu

SQLite tự tạo/migrate schema, sáu bàn, tám món và tài khoản quản lý khi mở DB mới. Ảnh mẫu nằm tại `web/public/images/menu/`; ảnh do quản lý tải lên được ưu tiên. Seed không reset dữ liệu.

Profile gồm DB, file khóa QR cạnh DB và thư mục media. Browser giữ cookie/journal theo origin. Muốn chạy dữ liệu sạch, dùng đường dẫn DB mới và profile Browser riêng; không xóa DB đang chạy hoặc xóa journal khi còn yêu cầu chưa rõ kết quả.

### Public HTTPS

Sau build, chọn cặp cổng trống:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/public-demo.ps1 -SkipBuild -Port 19088 -TcpPort 19058 -DurationSeconds 1800
```

Dùng URL và mật khẩu tạm do terminal cấp. Core vẫn loopback. Local/public có DB riêng; tunnel đổi địa chỉ thì lấy lại QR. [Public demo](docs/PUBLIC_DEMO.md).

## Kiểm thử

| Lệnh | Phạm vi |
|---|---|
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/maven.ps1 -B test` | Java: codec, TCP, service, DB, Gateway và hồi quy Client |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-web.ps1 -Phase V10.1` | Java verify, build production/experiment và Chromium E2E |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-browser-compatibility.ps1` | Các nhóm tương thích trên Firefox và WebKit |
| `python tools/verify_publication.py --root ..` | Tài liệu, phiên bản, liên kết và nội dung công bố |
| `python -m unittest discover -s tools -p test_publication.py` | Hồi quy kiểm tài liệu và đóng gói hướng dẫn |

Giữ cổng fixture **18080/18081** trống. Mỗi nhóm E2E có Core/Gateway/DB riêng; không dùng lại demo đang chạy. Chỉ dùng `-SkipInstall -SkipBrowserInstall` khi dependency và browser đã được cài. [Phạm vi, kết quả và nghiệm thu](docs/TESTING.md).

## Thực nghiệm

Sau build và kiểm hồi quy:

```powershell
python -m pip install -r tools/requirements-v8.txt
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/experiment-web.ps1 -OutputPath target/experiments/my-run
```

Chọn output mới cho từng lượt; script không ghi đè dữ liệu đã có. Full campaign gồm 120 ca phục hồi và 12 lượt tải; thêm `-Quick` cho lượt ngắn. Sản phẩm dùng SEMANTIC; harness so sánh các policy trên cùng cơ chế nền. [Phương pháp và cách đọc kết quả](docs/EXPERIMENTS.md).

## Cấu trúc source

```text
src/main/java/com/cafelink/
  common/         FrameCodec, Message, model, command và quyền
  client/         NetworkClient và Client phục vụ kiểm tương thích
  server/         TCP, danh tính, nghiệp vụ và SQLite
  web/            HTTP/WebSocket, cookie, bridge và chẩn đoán
src/test/         Java unit/integration tests
web/src/          React khách/quầy và nhật ký Browser
web/tests/        Browser E2E và kiểm triển khai
web/experiments/  Fault có kiểm soát và phát tải
scripts/          Build, run, test, đo và đóng gói
tools/            Oracle read-only, analyzer và guard
release/          Template launcher, runtime pin và công cụ kit
docs/             Tài liệu kỹ thuật
```

`WebMain` khởi tạo Gateway và Core cùng tiến trình; chúng trao đổi qua socket TCP thật. `SessionBridge` giữ một TCP Client cho phiên web. `CafeService` quyết định nghiệp vụ trong transaction; Gateway không ghi trực tiếp bảng đơn/ticket/payment. [Kiến trúc](docs/ARCHITECTURE.md) · [Giao thức](docs/PROTOCOL.md).

## Công nghệ

| Thành phần | Phiên bản ghim | Mục đích |
|---|---|---|
| Java / Maven bootstrap | Target 17 / 3.9.11 | Core, TCP, Gateway và build |
| Jetty | 12.0.40 | HTTP/API và WebSocket |
| Gson | 2.11.0 | JSON |
| SQLite JDBC | 3.50.3.0 | DB nhúng và transaction |
| SLF4J Simple | 2.0.16 | Log |
| React / TypeScript / Vite | 19.3.1 / 5.9.3 / 8.3.5 | UI, kiểm kiểu và assets |
| qrcode.react | 4.2.0 | Hiển thị QR |
| JUnit / Playwright | 5.11.4 / 1.64.1 | Java và Browser tests |

Manifest: [pom.xml](pom.xml), [package.json](web/package.json), [package-lock.json](web/package-lock.json), [Python requirements](tools/requirements-v8.txt). Phiên bản JDK máy chạy, target bytecode và runtime trong một gói phân phối là các khái niệm riêng.

## Phân phối và vận hành

Đường chạy được hướng dẫn cho repository là build từ source. `release/` chứa template và kiểm định cho quy trình tạo gói; chỉ sử dụng một gói có manifest/kiểm định khớp chính gói đó. Chính sách đóng gói tại `release/documentation.json` chặn công bố runtime chưa đủ điều kiện. [Vận hành](docs/OPERATIONS.md) · [Dữ liệu và triển khai](docs/DEPLOYMENT.md).
