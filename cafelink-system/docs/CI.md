# CafeLink V9.4 - CI Windows

CI kiểm cả nội dung công bố theo [PUBLICATION](PUBLICATION.md): phiên bản hướng dẫn, liên kết từ bản Git thực tế, một cặp Word/PDF khớp phiếu kiểm và policy tài liệu portable. Các thay đổi README, báo cáo chính, hình và bộ yêu cầu cũng kích hoạt workflow. Bộ hồi quy có các ca đưa lại hướng dẫn cũ, trộn báo cáo, thiếu file local hoặc làm hỏng liên kết portable để kiểm khả năng từ chối.

Workflow: [cafelink-v8.yml](../../.github/workflows/cafelink-v8.yml). Tên file và `scripts/test-v8.ps1` giữ từ pha V8; nội dung hiện kiểm V9.4.

## Pipeline

Windows runner dùng Temurin 17, Node 22 và Python 3.13. Actions ghim SHA, quyền `contents: read`. Pipeline kiểm cấu hình/baseline và guard → Java verify → npm/build production/experiment → Chromium E2E → analyzer → campaign phục hồi/tải.

Push/PR dùng campaign Quick; chạy thủ công có thể chọn full. Quick giảm số lần/thời lượng campaign, không bỏ bộ regression Java/Chromium. [Workflow](../../.github/workflows/cafelink-v8.yml) là nguồn chính xác của trigger, dependency và artifact.

## Bằng chứng đã xác minh

| Commit | Nhánh | Kết quả | Run |
|---|---|---|---|
| `87b7150` | `main` | Success | [41077881036](https://github.com/hieupham03/Cafe-link/actions/runs/41077881036) |
| `87b7150` | `submission/cafelink` | Success | [41077881762](https://github.com/hieupham03/Cafe-link/actions/runs/41077881762) |

Artifact mới của mỗi lượt xác nhận 164 Java, 71 Chromium, không fail/error/skip/flaky và đóng listener test. [Gate main đã lưu](../../report/evidence/cafelink-v2/pre-feature-20261030/ci-publication-gates/main.json), [gate submission](../../report/evidence/cafelink-v2/pre-feature-20261030/ci-publication-gates/submission.json).

Kết quả chỉ áp dụng đúng commit/run. Các lần cập nhật tiếp theo phải xem [Actions](https://github.com/hieupham03/Cafe-link/actions/workflows/cafelink-v8.yml) của chính commit đó; không coi bảng trên là trạng thái live của HEAD.

## Chạy tương đương tại local

Tại `cafelink-system`:

```powershell
python -m pip install -r tools/requirements-v8.txt
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-v8.ps1 -Quick
```

Artifact được tải lên kể cả khi lỗi, theo allowlist của workflow, retention 14 ngày. Java thất bại vẫn giữ JUnit nếu được sinh; lỗi biên dịch không có XML không được ghi thành zero-test PASS. Không upload DB, key, cookie, browser storage hoặc profile private.

Giữ ZIP E0 cạnh source như [README dist](../../dist/README.md); workflow kiểm hash, không tạo baseline lại từ source mới. `remoteCi: NOT_RUN` trong phiếu local chỉ mô tả công cụ đó không gọi GitHub API, không phủ nhận các run remote đã xác minh riêng.

[Kiểm thử](TESTING.md) · [Thực nghiệm](WEB_EXPERIMENTS.md) · [Báo cáo](../../report/README.md).
