# CafeLink - Kiểm thử

Kiểm thử đi qua các lớp Java, TCP, HTTP/WebSocket và Browser. Mỗi kết quả chỉ áp dụng cho commit, môi trường và phạm vi của lượt chạy. Không dùng số ca của một lượt khác làm kết quả mặc định cho source đang xem.

## Chạy kiểm

Từ `cafelink-system`:

```powershell
python tools/verify_publication.py --root ..
python -m unittest discover -s tools -p test_publication.py
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-web.ps1 -Phase V10.1
```

Gate chạy Java verify, build TypeScript/Vite production và experiment, cài Chromium khi cần và chạy các nhóm E2E. Chỉ dùng `-SkipInstall -SkipBrowserInstall` khi dependencies/browser đã có. Cần cổng **18080/18081** trống; mỗi nhóm sở hữu JVM/DB riêng và không dùng lại demo của người chạy.

Java riêng:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/maven.ps1 -B test
```

Tương thích Firefox/WebKit:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-browser-compatibility.ps1
```

Sau build, chạy nhóm storefront tại `web`:

```powershell
cd web
npx.cmd playwright test tests/shop.spec.ts
```

## Nhóm hành vi

| Nhóm | Nội dung kiểm |
|---|---|
| Giao thức/TCP | Header/body chia nhỏ hoặc liền nhau, UTF-8/JSON/length sai, request ID, nhiều peer và Client chậm |
| Danh tính/quyền | Đăng nhập, QR riêng, scope, khách khác phiên, STAFF không có quyền quản lý, thu hồi phiên |
| Đơn/tiền | Menu đổi, tiếp nhận trước thanh toán, tính tiền/thuế, hạn giao dịch, retry và guard phục vụ |
| Hỗ trợ | Một lời gọi mở cùng loại, bổ sung/rút/xử lý theo version |
| Phục hồi | Journal trước gửi, mất response sau commit, chưa nhận, barrier, accept/discard, reload/nhiều tab |
| Bàn/toàn quán | Bật/tạm ngưng, rời phiên, kết thúc phiên đơn lẻ/hàng loạt, không đóng khi còn việc |
| Tài chính | Chốt thuế, ngày thu/hoàn, phiếu chi/hủy, tổng/phân trang và quyền |
| UI | Năm vùng, menu ảnh, focus dialog, thanh giỏ trong viewport, không che điều hướng |
| Vận hành | Readiness, chẩn đoán, âm thanh fallback, origin/CSRF, upload ảnh và dữ liệu riêng |
| Công bố | Phiên bản, link/anchor, tài liệu hiện hành, manifest, loại tệp và nội dung riêng |

Các file chính: `src/test/java/`, `web/tests/shop.spec.ts`, `automatic.spec.ts`, `orders.spec.ts`, `v10.spec.ts`, `roles.spec.ts`, `diagnostics.spec.ts`, `audio.spec.ts`. Runner liệt kê các nhóm tại `web/tests/run-e2e.mjs`.

## Kết quả và bằng chứng

Gate ghi summary cùng JAR/assets/source manifest vào output của lần chạy. Playwright ghi JSON, screenshot/trace theo cấu hình; Java ghi JUnit XML trong `target/surefire-reports`. [CI](CI.md) upload artifact theo allowlist cả khi lỗi; xem đúng run/commit tại [GitHub Actions](https://github.com/hieupham03/Cafe-link/actions).

Giữ nguyên run FAIL để phân tích; sửa nguyên nhân rồi tạo run mới. Không xóa ca hoặc đổi số liệu để thành PASS. Kết quả của một engine không tự đại diện mọi Browser/thiết bị. Các nhóm có phạm vi riêng, không cộng số ca thành tỷ lệ bao phủ phần trăm.

## Kiểm trên thiết bị

Người kiểm ghi thiết bị/Browser, origin và mạng của lần thực hiện, bước thao tác, kết quả mong đợi/thực tế. Đây là tiêu chí kiểm thao tác, không phải bảng trạng thái của dự án.

| Tình huống | Điều kiện đạt |
|---|---|
| Hai khách quét cùng QR | Visit/giỏ/đơn riêng, quầy vẫn thấy cùng địa chỉ giao |
| Tiếp nhận và thanh toán | Khách không trả sớm; từ chối có lý do; không pha chế trước đủ điều kiện tiền |
| Trạng thái và hỗ trợ | Hai phía nhận tiến độ/nhắn tin; một ticket OPEN cùng loại |
| Màn hình nhỏ | Thanh giỏ đủ nội dung, bấm được, không tràn hoặc che menu dưới; bàn phím không khóa thao tác |
| Camera/public | QR mở đúng HTTPS hiện tại trên mạng được dùng |
| Âm thanh | Nghe thực tế khi Browser cho phép; khi bị chặn vẫn có chữ/hàng đợi |
| Mất kết nối | Không tự tạo đơn khác, không đóng visit vì offline; đối chiếu khi trở lại |
| Rời/đóng phiên | Chặn khi còn nghĩa vụ; đóng xong không tác động khách khác |
| Quyền nhân viên | Đúng bốn mục phục vụ, API tài chính bị chặn, khóa tài khoản thu hồi tab cũ |

Ngắt Wi-Fi không xác định chính xác mất response sau commit. Các tình huống đó cần fault có kiểm soát trong [runbook](RUNBOOK.md#demo-2---phục-hồi-có-kiểm-soát) hoặc [harness](EXPERIMENTS.md). Mô phỏng viewport và WebKit Windows không thay iPhone/Android vật lý. Bộ `release/device-acceptance` tạo hồ sơ cho một lượt kiểm cụ thể từ gói có manifest phù hợp, không tự đánh dấu kết quả thay người kiểm.

## Thực nghiệm

Thử phục hồi/tải có cấu hình, raw, oracle và metric riêng. Quick campaign chỉ kiểm ngắn; full campaign theo [phương pháp thực nghiệm](EXPERIMENTS.md). Công suất và độ trễ phải được đo trong môi trường được nêu, không suy từ giới hạn reader/bridge.
