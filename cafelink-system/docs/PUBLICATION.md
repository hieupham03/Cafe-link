# CafeLink V10.1 - Kiểm tra nội dung công bố

`release/documentation.json` là policy version/schema, tài liệu và candidate portable. Bản hiện tại chạy từ source; portable ở trạng thái `NOT_RELEASED`.

`tools/verify_publication.py --root ..` đọc các file Git công bố, kiểm phiên bản Java/package/lock/policy, link/heading và lệnh hướng dẫn. Báo cáo Word/PDF và manifest kiểm định đã được xóa khỏi repository theo yêu cầu.

Không công bố công cụ/skill AI, báo cáo nháp, mẫu tham khảo, cache, DB/khóa hoặc ZIP runtime cũ. ZIP E0 là đối chứng có hash cố định. Thêm `--index` để kiểm nội dung stage; `--pristine` dùng cho export. `tools/test_publication.py` giữ các ca hồi quy. [CI](CI.md) chạy kiểm này trước ứng dụng.

Lịch sử Git ghi nhận các lần hợp nhất, tác giả và thời điểm commit gốc. Kiểm repository không xác nhận Compilatio hoặc quyền tác giả cho từng dòng code.
