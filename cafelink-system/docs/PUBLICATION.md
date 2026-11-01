# CafeLink V10.1 - Kiểm tra nội dung công bố

`release/documentation.json` là policy version/schema, tài liệu, candidate portable và manifest báo cáo. Bản hiện tại chạy từ source; portable ở trạng thái `NOT_RELEASED`.

`tools/verify_publication.py --root ..` đọc các file Git công bố, kiểm phiên bản Java/package/lock/policy, link/heading, lệnh hướng dẫn và đúng một cặp Word/PDF khớp hash. Cặp tại `report/submission-20261031/` khớp `PUBLICATION.json`; không lấy Markdown ghi đè bản Word đã chốt.

Không công bố công cụ/skill AI, báo cáo nháp, mẫu tham khảo, cache, DB/khóa hoặc ZIP runtime cũ. ZIP E0 là đối chứng có hash cố định. Thêm `--index` để kiểm nội dung stage; `--pristine` dùng cho export. `tools/test_publication.py` giữ các ca hồi quy. [CI](CI.md) chạy kiểm này trước ứng dụng.

[Nguồn đóng góp](../../CONTRIBUTIONS.md) ghi cách hợp nhất nhánh; giữ tác giả và thời điểm commit gốc. Kiểm repository không xác nhận Compilatio hoặc quyền tác giả cho từng dòng code.
