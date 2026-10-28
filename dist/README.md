# Baseline được giữ trong Git

Git chỉ kèm `CafeLink-Original-1.0.0-Baseline.zip` trong thư mục này. Đây là baseline E0 niêm phong để test/CI đối chiếu; không phải gói web V9.3 hiện tại.

SHA-256 phải giữ nguyên:

```text
60A1E6666F4BAC52B2F0B868A9AAFD9024563991AB22777076D639416E8766EB
```

Không dựng lại hoặc thay ZIP này bằng source mới. Script test/CI có thể báo lỗi nếu baseline thiếu hoặc sai hash. Gói portable V9.3, bộ RC1 và source ZIP xuất riêng có thể có trong workspace local nhưng không tải kèm khi clone repo.

Để chạy CafeLink hiện tại, dùng [build/run từ source](../cafelink-system/README.md) và [runbook](../cafelink-system/docs/FINAL_RUNBOOK.md). Việc có ZIP baseline không loại bỏ yêu cầu JDK/Node khi build source.
