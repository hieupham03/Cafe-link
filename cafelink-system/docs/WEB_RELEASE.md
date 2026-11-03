# CafeLink V10.1 - Phiên bản source và dữ liệu

Bản nộp chạy **từ source V10.1/schema 13**. Dùng [README source](../README.md) và [runbook](FINAL_RUNBOOK.md). Chưa phát hành portable V10.1; policy mang tên candidate `CafeLink-Web-V10.1-RC1`, không có nghĩa đã có gói JRE được nghiệm thu. Archive V9.4/RC4 là mốc lịch sử.

SQLite tự tạo sáu bàn, tám món và tài khoản quản lý khi mở DB mới. Ảnh mẫu ở `web/public/images/menu/`, không cần lấy từ máy tác giả. Ảnh quản lý tải lên vẫn được ưu tiên. Chạy lại cùng `-DatabasePath` giữ dữ liệu. Muốn thử sạch, dừng terminal bằng Ctrl+C rồi dùng đường dẫn DB mới.

Trước nâng cấp DB cũ, dừng Server và sao lưu DB, file `.qr-key` và thư mục `.media` cùng tên. Không dùng runtime cũ mở ngược schema 13. Local/public dùng profile riêng; public dùng mật khẩu tạm terminal in, không dùng mật khẩu local. URL tunnel đổi thì lấy lại QR.

GitHub chứa source, manifest dependency và tài liệu Markdown; bản Word/PDF, evidence, cache, DB/khóa/mật khẩu, skill AI và công cụ biên soạn báo cáo không được lưu trong repository. ZIP E0 trong `dist/` là đối chứng niêm phong, không phải bản web mới. Các công cụ portable trong source phục vụ bản phát hành sau; đường chạy được kiểm ở mốc nộp này là source theo README.
