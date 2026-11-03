# CafeLink V10.1 - CI Windows

[Workflow](../../.github/workflows/cafelink-v8.yml) chạy trên push/PR ảnh hưởng source/tài liệu và khi gọi thủ công. Tên file giữ để liên kết lịch sử; bộ kiểm hiện dùng V10.1.

1. Checkout; cài Temurin JDK 17, Node 22, Python 3.13 và dependency được ghim. GitHub Actions dùng commit SHA cố định.
2. Xác nhận baseline E0 nguyên vẹn, quét file công bố, liên kết và phiên bản; nếu có cặp báo cáo Word/PDF thì xác minh cặp và manifest hash. Chạy kiểm hồi quy publication và cấu hình workflow.
3. Chạy `scripts/test-web.ps1 -Phase V10.1`: Java verify, build production/experiment và toàn bộ nhóm Chromium. Mỗi nhóm có Core/Gateway/DB riêng; không bỏ guard để chạy test.
4. Upload kết quả allowlist kể cả khi lỗi. Chỉ thực nghiệm tải đầy đủ khi chọn `full_experiments` trong workflow_dispatch; kết quả lịch sử không đổi nhãn thành benchmark mới.

Chạy local tại `cafelink-system`:

```powershell
python tools/verify_publication.py --root ..
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-web.ps1 -Phase V10.1
```

CI chỉ xác nhận commit và bước đã chạy, không thay nghiệm thu điện thoại/mạng thực tế, ngân hàng, Compilatio hoặc thủ tục nộp. [Kiểm thử](TESTING.md) · [Báo cáo](../../report/README.md).
