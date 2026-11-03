# CafeLink - Quy tắc công bố repository

Repository chứa một bộ tài liệu hiện hành cho source, cùng test/script/dependency để build và kiểm chứng. README mô tả sản phẩm, hướng dẫn mô tả cách sử dụng; lịch sử chỉnh sửa được lưu trong Git.

## Nội dung công bố

- README tổng quan, README source và chỉ mục kỹ thuật.
- Đặc tả, kiến trúc, giao thức, phân quyền, sử dụng, phục hồi và vận hành.
- Lệnh kiểm, phương pháp thực nghiệm và CI.
- Template/công cụ phân phối và fixture kiểm tương thích có mục đích rõ.

Repository công bố một cặp báo cáo Word/PDF chính thức tại [thư mục báo cáo](../../report/README.md), được xác định bằng manifest SHA-256 và liên kết từ README. Không đưa công cụ/skill AI, bản nháp, nhật ký nâng cấp, tài liệu thay thế, cache, DB, khóa hoặc backup vào cây công bố. ZIP đối chứng có hash cố định là fixture, không là bản ứng dụng để người dùng lựa chọn.

## Kiểm tra

Tại `cafelink-system`:

```powershell
python tools/verify_publication.py --root ..
python -m unittest discover -s tools -p test_publication.py
```

Thêm `--index` để kiểm đúng snapshot đã stage; `--pristine` cho export sạch. Guard đối chiếu `release/documentation.json` với ApplicationInfo và package/lockfile; kiểm link/anchor, script, tài liệu cũ và tệp riêng. Mỗi hướng dẫn là một tài liệu tự đầy đủ, không cần đọc ghi chú nâng cấp để hiểu quy trình hiện tại.

Policy cũng quy định danh sách hướng dẫn trong portable. `package-documentation.ps1` sao chép và viết lại liên kết theo cùng policy; gói được kiểm qua manifest thay vì tên thư mục. Trạng thái release kiểm soát việc tạo gói runtime, độc lập với khả năng build source.

## Kết quả

Kết quả test/benchmark phải gắn với run/commit thật. Không đổi nhãn số liệu để tuyên bố đã kiểm một phiên bản khác. Lịch sử tác giả/hợp nhất nằm trong commit; README không xác nhận quyền tác giả cho từng dòng hoặc kết quả Compilatio.
