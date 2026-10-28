# CafeLink — Gọi món QR và điều phối phục vụ V9.3

Hệ thống gọi món tại quán café: khách quét QR, đặt món và thanh toán giả lập; quản lý nhận đơn, điều phối pha chế và xử lý hỗ trợ. Browser kết nối Java Gateway qua HTTP/WebSocket; Gateway trao đổi với Core qua TCP Socket.

## Bắt đầu

- **Source, build và test:** [cafelink-system/README.md](cafelink-system/README.md).
- **Chạy local/public và demo:** [FINAL_RUNBOOK.md](cafelink-system/docs/FINAL_RUNBOOK.md).
- **Báo cáo mốc RC1 được giữ nguyên:** [Markdown](report/CafeLink_Final_Report.md), [Word](report/NhomXX_CafeLink_Report.docx), [PDF](report/NhomXX_CafeLink_Report.pdf).
- **Báo cáo hiện tại — 45 trang, chữ 13:** [Word](report/NhomXX_CafeLink_Report_Refined13_20261028.docx), [PDF](report/NhomXX_CafeLink_Report_Refined13_20261028.pdf), [Markdown](report/CafeLink_Technical_Paper_Refined13.md). Trình bày bài toán, kiến trúc/giao thức, implementation, contribution và thực nghiệm; chưa tự thay ZIP RC1.
- **Căn cứ hiện tại:** [bộ yêu cầu đầy đủ](final-project-2/final-project/README.md), [phân tích/đối chiếu](report/CafeLink_Requirements_Alignment.md), [đặc tả CafeLink](cafelink-system/docs/PROJECT_SPECIFICATION.md). SPECIFICATION trong bộ mẫu là đề tài IoT khác, được tham khảo về cách đặc tả.
- **Bộ RC1 chuẩn bị hạn 31/10:** [hướng dẫn bàn giao](report/CafeLink_Final_Handoff.md), [trạng thái còn chờ](report/SUBMISSION_READINESS.md). ZIP đầy đủ được giữ riêng tại workspace, không đưa vào Git.
- **Nghiệm thu người dùng:** [WEB_USER_ACCEPTANCE.md](cafelink-system/docs/WEB_USER_ACCEPTANCE.md). Thử điện thoại/camera/mạng thực tế do người dùng thực hiện sau.

## Những thư mục được giữ

| Thư mục | Nội dung |
|---|---|
| `cafelink-system/` | Source, test, script, tài liệu hiện hành và môi trường build |
| `report/` | Báo cáo hiện tại, hình/sơ đồ và bằng chứng kiểm thử/thực nghiệm |
| `dist/` | V9.3, bộ RC1, source ZIP và baseline E0 cần cho kiểm hash |
| `final-project-2/final-project/` | Bộ yêu cầu đầy đủ hiện dùng, gồm Instruction, Topics, README, SPECIFICATION và Submission |
| `final-project/` | Bộ ban đầu được giữ để đối chiếu |

Đã loại các báo cáo pha cũ, cache khảo sát, gói phát hành cũ và fixture kiểm thử có thể tạo lại. Trong workspace gốc, bộ RC1 và V9.3 đang chạy được giữ nguyên. Dữ liệu runtime, backup riêng tư và gói Windows/RC1 không được đưa lên GitHub; repository chỉ giữ source, báo cáo/evidence đã chọn và ZIP baseline E0 cần cho kiểm hash. Clone repository rồi build theo README source; không cần tải bộ RC1 để chạy từ source.

## Phạm vi hồ sơ dự án

Theo [Submission](final-project/Submission.md), chuẩn bị source chạy được cùng cấu hình/dữ liệu mẫu, dependency, README build/run/test và báo cáo; khi nộp chính thức tổ chức thành `Source/` và `Report/`. Công cụ kiểm thử/thực nghiệm trong `cafelink-system/tools/` thuộc dự án và được giữ để kiểm lại kết quả. Các công cụ biên soạn, tài liệu tham khảo và báo cáo nháp chỉ giữ ở workspace local.

Thay `XX` và điền thông tin nhóm/phân công thật trước nộp. Báo cáo DOCX cuối phải mang tên `NhomXX_CafeLink_Report.docx`; chỉ nộp một báo cáo trên Compilatio. Kết quả Compilatio, điện thoại/camera/mạng thực tế và bàn giao chính thức vẫn chờ xác nhận. GitHub phục vụ quản lý source, không thay quy trình nộp của lớp.
