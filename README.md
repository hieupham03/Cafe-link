# CafeLink - Gọi món QR và điều phối phục vụ V9.4

Hệ thống gọi món tại quán café: khách quét QR, đặt món và thanh toán giả lập; quản lý nhận đơn, điều phối pha chế và xử lý hỗ trợ. Browser kết nối Java Gateway qua HTTP/WebSocket; Gateway trao đổi với Core qua TCP Socket.

## Bắt đầu

- **Nâng cấp source V9.4:** [độ tin cậy, readiness và chẩn đoán](cafelink-system/docs/WEB_HARDENING.md). Báo cáo/thực nghiệm V9.3 bên dưới được giữ làm snapshot đối chiếu; mỗi thay đổi mới có kết quả kiểm riêng.
- **Kết quả kiểm V9.4 ngày 30/10:** [báo cáo nâng cấp, test và giới hạn](report/CafeLink_Hardening_20261030.md), gồm Java/Chromium/Firefox/WebKit, gói portable và thực nghiệm mới. Các phép kiểm điện thoại thật còn chờ.
- **Trước tính năng tiếp theo:** [checkpoint và bộ nghiệm thu sạch](report/CafeLink_PreFeature_Readiness_20261030.md). Kit điện thoại/quầy dùng profile riêng; các ca cần người kiểm vẫn ghi NOT_RUN.

- **Source, build và test:** [cafelink-system/README.md](cafelink-system/README.md).
- **Chạy local/public và demo:** [FINAL_RUNBOOK.md](cafelink-system/docs/FINAL_RUNBOOK.md).
- **Báo cáo hiện tại — 45 trang, chữ 13:** [Word](report/NhomXX_CafeLink_Report_Evidence13_20261029.docx), [PDF](report/NhomXX_CafeLink_Report_Evidence13_20261029.pdf), [Markdown](report/CafeLink_Technical_Paper_Evidence13_20261029.md). Trình bày bài toán, kiến trúc/giao thức, implementation, contribution và thực nghiệm; chưa tự thay ZIP RC1.
- **Chọn đúng báo cáo và evidence:** [report/README.md](report/README.md). Báo cáo RC1 cũ được giữ để đối chiếu.
- **Căn cứ hiện tại:** [chỉ mục tài liệu môn](final-project-2/README.md), [phân tích/đối chiếu](report/CafeLink_Requirements_Alignment.md), [đặc tả CafeLink](cafelink-system/docs/PROJECT_SPECIFICATION.md). SPECIFICATION trong bộ mẫu là đề tài IoT khác, được tham khảo về cách đặc tả.
- **Bộ RC1 chuẩn bị hạn 31/10:** [hướng dẫn bàn giao](report/CafeLink_Final_Handoff.md), [trạng thái còn chờ](report/SUBMISSION_READINESS.md). ZIP đầy đủ được giữ riêng tại workspace, không đưa vào Git.
- **Nghiệm thu người dùng:** [WEB_USER_ACCEPTANCE.md](cafelink-system/docs/WEB_USER_ACCEPTANCE.md). Thử điện thoại/camera/mạng thực tế do người dùng thực hiện sau.

## Chạy từ bản clone GitHub

Trên Windows, chuẩn bị PowerShell, JDK 17+, Node.js theo [yêu cầu môi trường](cafelink-system/README.md#4-yêu-cầu-môi-trường) và Internet cho lần build đầu. Mở PowerShell tại thư mục gốc repo:

```powershell
cd cafelink-system
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-web.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-web.ps1 -Port 8088 -TcpPort 5058 -DatabasePath data/local-demo/cafelink.db
```

Mở `http://127.0.0.1:8088/admin`, đăng nhập `admin / CafeLink@123`. Giữ terminal Server mở. Bấm **Mở tất cả bàn → Bàn 1 → Sao chép link đặt món** và dán nguyên link vào browser/profile khác để làm khách. DB/schema/menu mẫu tự tạo. [Demo public từ source](cafelink-system/README.md#7-demo-public-https) và [kiểm thử](cafelink-system/README.md#8-kiểm-thử-tự-động) dùng các script trong repo.

## Những thư mục được giữ

| Thư mục | Nội dung |
|---|---|
| `cafelink-system/` | Source, test, script, tài liệu hiện hành và môi trường build |
| `report/` | Báo cáo hiện tại, hình/sơ đồ và bằng chứng kiểm thử/thực nghiệm |
| `dist/` | [Baseline E0 niêm phong](dist/README.md) cần cho kiểm hash; Git không kèm runtime V9.3/RC1/source ZIP |
| `final-project-2/` | [Bộ yêu cầu đầy đủ hiện dùng](final-project-2/README.md), gồm Instruction, Topics, README mẫu, SPECIFICATION mẫu và Submission |
| `final-project/` | [Bộ ban đầu](final-project/README.md), giữ đường dẫn tương thích cho hồ sơ RC1; dùng final-project-2 khi đọc yêu cầu hiện tại |

Trong workspace gốc có thể có bộ RC1, gói V9.3 và các ZIP xuất riêng; chúng không phải file tải kèm khi clone GitHub. Dữ liệu runtime và backup riêng tư cũng không đưa lên Git. Để chạy từ repo, dùng quy trình build/run phía trên; gói portable nếu được cung cấp riêng có [hướng dẫn riêng](cafelink-system/docs/FINAL_RUNBOOK.md#6-gói-portable-được-cung-cấp-riêng).

## Phạm vi hồ sơ dự án

Theo [Submission](final-project/Submission.md), chuẩn bị source chạy được cùng cấu hình/dữ liệu mẫu, dependency, README build/run/test và báo cáo; khi nộp chính thức tổ chức thành `Source/` và `Report/`. Công cụ kiểm thử/thực nghiệm trong `cafelink-system/tools/` thuộc dự án và được giữ để kiểm lại kết quả. Các công cụ biên soạn, tài liệu tham khảo và báo cáo nháp chỉ giữ ở workspace local.

Thay `XX` và điền thông tin nhóm/phân công thật trước nộp. Báo cáo DOCX cuối phải mang tên `NhomXX_CafeLink_Report.docx`; chỉ nộp một báo cáo trên Compilatio. Kết quả Compilatio, điện thoại/camera/mạng thực tế và bàn giao chính thức vẫn chờ xác nhận. GitHub phục vụ quản lý source, không thay quy trình nộp của lớp.
