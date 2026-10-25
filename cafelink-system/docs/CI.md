# V8 — CI Windows

Workflow ở [`.github/workflows/cafelink-v8.yml`](../../.github/workflows/cafelink-v8.yml). **Trạng thái remote: NOT_RUN** cho đến khi repository có một GitHub Actions run thực tế. Kiểm YAML/PowerShell và các thành phần chạy local không thay cho bằng chứng runner GitHub.

## Nội dung

Workflow dùng Windows, Temurin 17, Node 22 và Python 3.13, cache Maven/npm/pip theo manifest. Cách khai báo distribution/cache dựa trên tài liệu chính thức của [setup-java](https://github.com/actions/setup-java/blob/main/README.md) và [setup-node](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md). Các action được ghim commit SHA, chỉ cấp `contents: read`.

Entry point `scripts/test-v8.ps1`: kiểm cấu hình/baseline → Java verify → npm ci → production build → experiment build → cài Chromium → toàn bộ E2E → kiểm bộ phân tích → recovery/load campaign → CSV/plot. Push/PR chạy Quick; `workflow_dispatch` cho chọn full experiment. Quick giảm số lần/thời lượng **campaign**, vẫn chạy đầy đủ bộ regression.

Artifact dùng bước `always()` để giữ lỗi, chỉ chọn hai cây `report/evidence/cafelink-v2/v8` và `v8-gate`, retention 14 ngày; cấu hình theo [upload-artifact](https://github.com/actions/upload-artifact/blob/main/README.md). Không upload `data`, `target/v8-private`, khóa, database hoặc browser storage. Kết quả đo local không được chép vào remote rồi gọi là run remote.

## Khi đưa dự án lên GitHub

Giữ cấu trúc repository: `.github/`, `cafelink-system/`, `dist/CafeLink-Original-1.0.0-Baseline.zip` cùng cấp. ZIP E0 phải giữ SHA256:

```text
60A1E6666F4BAC52B2F0B868A9AAFD9024563991AB22777076D639416E8766EB
```

Workflow sẽ fail rõ nếu thiếu ZIP; không dựng lại baseline từ source V8. Đây là điều kiện chuẩn bị repository, không yêu cầu nhập secret/merchant/tunnel. Dependencies Maven/npm/Python/Chromium cần tải từ mạng trên runner. Không đưa DB demo hay tài khoản sử dụng thật lên repository.

Sau run đầu, lưu URL, run ID, commit SHA, kết luận từng gate và artifact của **run đó** vào báo cáo V8. Hiệu năng runner khác máy local nên báo riêng, không gộp trung vị/p95 hai máy. Nếu workflow lỗi, xem artifact trước khi sửa; không bỏ kiểm thử hoặc tăng rate limit để lấy trạng thái xanh.

## Chạy local

```powershell
cd D:\BTL-LTM\cafelink-system
python -m pip install -r tools/requirements-v8.txt
python tools/verify_v8_workflow.py
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-v8.ps1 -Quick
```

`verify_v8_workflow.py` kiểm cấu trúc YAML, SHA action, cú pháp PowerShell của script/bước inline, artifact path và hash E0. Nó không mô phỏng service GitHub, không kiểm cam kết SLA tải dependencies và không tuyên bố action sẽ chạy thành công trên runner chưa thử.
