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
- Source hiện hành là **V10.1/schema 13**; [bản source và trạng thái portable](../cafelink-system/docs/FINAL_RUNBOOK.md#6-bản-source-và-portable).
- Portable V10.1 chưa phát hành; script từ chối đóng gói khi policy còn `NOT_RELEASED`.
- Portable V9.4/RC4 được kiểm trước nâng cấp là hồ sơ lịch sử; phạm vi kiểm được tóm tắt trong [tài liệu kiểm thử](../cafelink-system/docs/TESTING.md). Các tệp evidence chi tiết không còn trong repository.

ZIP/thư mục RC4, UAT kit và các bộ RC1 cũ có thể tồn tại local nhưng không tải kèm khi clone. Giữ riêng dữ liệu runtime, khóa, cookie và backup; các file đó không thuộc source công bố.
