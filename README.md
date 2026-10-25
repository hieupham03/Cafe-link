# CafeLink — Workspace bản chốt V9.3

Hệ thống gọi món tại quán café: khách quét QR, đặt món và thanh toán giả lập; quản lý nhận đơn, điều phối pha chế và xử lý hỗ trợ. Browser kết nối Java Gateway qua HTTP/WebSocket; Gateway trao đổi với Core qua TCP Socket.

## Bắt đầu

- **Source, build và test:** [cafelink-system/README.md](cafelink-system/README.md).
- **Chạy local/public và demo:** [FINAL_RUNBOOK.md](cafelink-system/docs/FINAL_RUNBOOK.md).
- **Báo cáo chính:** [Markdown](report/CafeLink_Final_Report.md), [Word](report/NhomXX_CafeLink_Report.docx), [PDF](report/NhomXX_CafeLink_Report.pdf).
- **Bộ RC1 chuẩn bị hạn 31/10:** [hướng dẫn bàn giao](report/CafeLink_Final_Handoff.md), [trạng thái còn chờ](report/SUBMISSION_READINESS.md). ZIP đầy đủ được giữ riêng tại workspace, không đưa vào Git.
- **Nghiệm thu người dùng:** [WEB_USER_ACCEPTANCE.md](cafelink-system/docs/WEB_USER_ACCEPTANCE.md). Thử điện thoại/camera/mạng thực tế do người dùng thực hiện sau.

## Những thư mục được giữ

| Thư mục | Nội dung |
|---|---|
| `cafelink-system/` | Source, test, script, tài liệu hiện hành và môi trường build |
| `report/` | Báo cáo cuối, template, công cụ xuất báo cáo và evidence bản cuối |
| `dist/` | V9.3, bộ RC1, source ZIP và baseline E0 cần cho kiểm hash |
| `final-project/` | Yêu cầu và hướng dẫn nộp của môn học |
| `.cleanup/` | Nhật ký dọn workspace và backup riêng tư dữ liệu các bản demo đã bỏ |

Đã loại các báo cáo pha cũ, cache khảo sát, gói phát hành cũ và fixture kiểm thử có thể tạo lại. Trong workspace gốc, bộ RC1 và V9.3 đang chạy được giữ nguyên. Dữ liệu runtime, backup riêng tư và gói Windows/RC1 không được đưa lên GitHub; repository chỉ giữ source, báo cáo/evidence đã chọn và ZIP baseline E0 cần cho kiểm hash. Clone repository rồi build theo README source; không cần tải bộ RC1 để chạy từ source.
