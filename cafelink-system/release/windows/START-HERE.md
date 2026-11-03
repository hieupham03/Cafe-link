# CafeLink - Hướng dẫn launcher

Repository được chạy theo [README source](../../README.md) và [runbook](../../docs/RUNBOOK.md). Thư mục `release/windows` cung cấp template cho quy trình đóng gói; không chạy riêng template như một ứng dụng có sẵn runtime.

Trong gói phân phối được tạo hợp lệ, kiểm RELEASE/VERIFICATION và chạy Verify-Package trước khi dùng launcher. START-LOCAL dùng profile local; START-PUBLIC cấp HTTPS và mật khẩu quản lý tạm. Giữ terminal chạy và dừng bằng Ctrl+C. Lấy QR từ Server đang chạy, dùng profile khách riêng với quản lý.

Backup/Reset/Restore chỉ dùng trong đúng gói sau khi dừng launcher. Giữ DB, khóa và media cùng profile; không dùng việc reset để bỏ qua yêu cầu chưa rõ kết quả. [Dữ liệu và triển khai](../../docs/DEPLOYMENT.md).
