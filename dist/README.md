# CafeLink - Baseline và gói chạy

## File có trong Git

Chỉ giữ **`CafeLink-Original-1.0.0-Baseline.zip`** trong thư mục này. Đây là baseline E0 niêm phong phục vụ kiểm hash/CI, không phải gói web hiện tại để chạy demo.

SHA-256 phải giữ nguyên:

```text
60A1E6666F4BAC52B2F0B868A9AAFD9024563991AB22777076D639416E8766EB
```

Không dựng lại ZIP này từ source mới. Phép so sánh chính sách R0/R1/R2 của web khác với việc giữ archive E0 để bảo toàn lịch sử.

## Chạy phiên bản hiện tại

- Clone GitHub: [build/run từ source](../cafelink-system/README.md).
- Gói Windows có JRE được cung cấp riêng: [runbook portable](../cafelink-system/docs/FINAL_RUNBOOK.md#6-gói-portable-được-cung-cấp-riêng).
- Tạo một gói mới: `cafelink-system/scripts/package-web.ps1`.
- Phiên bản đã kiểm tại workspace: **CafeLink-Web-V9.4-RC4**; [phiếu kiểm và hash](../report/evidence/cafelink-v2/pre-feature-20261030/final-verification.json).

ZIP/thư mục RC4, UAT kit và các bộ RC1 cũ có thể tồn tại local nhưng không tải kèm khi clone. Giữ riêng dữ liệu runtime, khóa, cookie và backup; các file đó không thuộc source công bố.
