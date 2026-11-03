# CafeLink - Continuous integration

[Workflow Windows](../../.github/workflows/cafelink-v8.yml) chạy khi push/PR ảnh hưởng source/tài liệu và khi gọi thủ công. [Các run và artifact](https://github.com/hieupham03/Cafe-link/actions).

## Pipeline

1. Checkout và cài Temurin JDK 17, Node 22, Python 3.13; dependency theo manifest/lockfile, action theo SHA đã ghim.
2. Kiểm fixture đối chứng, nội dung công bố, phiên bản/link và hồi quy guard/workflow.
3. Chạy `scripts/test-web.ps1 -Phase V10.1`: Java verify, build production/experiment và các nhóm Chromium trên Core/Gateway/DB riêng.
4. Upload kết quả theo allowlist kể cả khi lỗi. Full experiment được chọn bằng `full_experiments` khi gọi workflow thủ công.

## Kiểm local

Tại `cafelink-system`:

```powershell
python tools/verify_publication.py --root ..
python -m unittest discover -s tools -p test_publication.py
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-web.ps1 -Phase V10.1
```

Fixture E2E dùng 18080/18081 và không chiếm/dừng demo khác. Khi đọc kết quả, đối chiếu SHA commit, các bước thực sự chạy và artifact của run đó. Trạng thái xanh không xác nhận điện thoại/camera, ngân hàng thật hoặc thủ tục nộp học phần.

## Dữ liệu kiểm

Chỉ upload kết quả được cho phép; DB, key, cookie, log chứa quyền phiên và runtime profile không thuộc source công bố. Run FAIL được giữ để truy nguyên. Không dùng số đo của một run khác làm benchmark cho commit đang kiểm.

[Kiểm thử](TESTING.md) · [Thực nghiệm](EXPERIMENTS.md) · [Quy tắc công bố](PUBLICATION.md).
