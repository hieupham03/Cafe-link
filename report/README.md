# CafeLink - Báo cáo và bằng chứng

## Báo cáo hiện tại

| Định dạng | Bản dùng để đọc/chỉnh sửa |
|---|---|
| Word | [NhomXX_CafeLink_Report_Current_20261030.docx](NhomXX_CafeLink_Report_Current_20261030.docx) |
| PDF | [NhomXX_CafeLink_Report_Current_20261030.pdf](NhomXX_CafeLink_Report_Current_20261030.pdf) |

Bản biên tập ngày **30/10/2026**, **42 trang**, nội dung chính Times New Roman 13. Báo cáo trình bày toàn hệ thống gọi món, Client/Server, giao thức TCP, nhiều kết nối và xử lý lỗi. Mục 9 chia kết quả chức năng, giao tiếp mạng, hiệu năng và phục hồi; chi tiết từng ca/lượt nằm ở phụ lục. Bìa và chỉnh sửa cá nhân được giữ từ bản người dùng đã sửa. Ngày 31/10 đã đồng nhất tên/MSSV trong bảng phân công theo xác nhận của nhóm, rồi cập nhật mục lục và xuất lại PDF.

Word là bản có thể tiếp tục chỉnh; PDF dùng đọc và kiểm bố cục. Bản mới được tạo từ DOCX, không lấy Markdown cũ để ghi đè những chỉnh sửa của người dùng. [Đối chiếu yêu cầu học phần](CafeLink_Requirements_Alignment.md).

## Đọc số liệu đúng phiên bản

| Hồ sơ | Phạm vi | Điểm vào |
|---|---|---|
| Kiểm cuối V9.4/RC4 | 164 Java, 71 Chromium, 20 Firefox, 20 WebKit; 23 nhóm kiểm gói, 8 kiểm public | [Phiếu kiểm](evidence/cafelink-v2/pre-feature-20261030/final-verification.json), [gate](evidence/cafelink-v2/pre-feature-20261030/web-gate.json) |
| Đo V9.4/RC3 ngày 30/10 | 120 ca phục hồi; 12 lượt tải; 1.256/1.350 lượt hoàn tất, 94 lượt chưa phát | [Analysis](evidence/cafelink-v2/v9.4-hardening/measurements-20261030/analysis.json), [môi trường](evidence/cafelink-v2/v9.4-hardening/measurements-20261030/environment.json) |
| Mốc V9.3 ngày 25/10 | Dữ liệu lịch sử: 120 ca phục hồi, 12 lượt tải; 1.348/1.350 lượt hoàn tất | [Analysis cũ](evidence/cafelink-final/20261025-final-r2/analysis.json), giữ tại phụ lục báo cáo mới |
| Hoàn thiện vận hành | Readiness, chẩn đoán, hạn thanh toán, âm thanh, HTTP và kiểm gói | [Hardening](CafeLink_Hardening_20261030.md), [checkpoint](CafeLink_PreFeature_Readiness_20261030.md) |

Số đo tải thuộc RC3; kiểm cuối/gói chạy thuộc RC4. Không ghép mẫu giữa hai phiên bản hoặc cộng số test thành tỷ lệ bao phủ. Raw, oracle và run FAIL giữ để truy vết, không chỉ giữ bảng tổng hợp đẹp.

Nhóm đã xác nhận hoàn thành kiểm thao tác thực tế. Các phiếu tự động trước đó giữ nguyên trạng thái ở thời điểm tạo; ảnh viewport hoặc số đo loopback vẫn được phân biệt với kiểm thiết bị thật.

## Tài liệu liên quan

- [Kiến trúc](../cafelink-system/docs/FINAL_ARCHITECTURE.md), [giao thức](../cafelink-system/docs/FINAL_PROTOCOL.md), [chạy/demo](../cafelink-system/docs/FINAL_RUNBOOK.md).
- [Kiểm thử](../cafelink-system/docs/TESTING.md), [thực nghiệm](../cafelink-system/docs/WEB_EXPERIMENTS.md), [CI](../cafelink-system/docs/CI.md).
- [Instruction](../final-project-2/final-project/Instruction.md), [README mẫu](../final-project-2/final-project/README.md), [Submission](../final-project-2/final-project/Submission.md).
- [Trạng thái nộp và hồ sơ lịch sử](SUBMISSION_READINESS.md).

## Các bản trước

| Bản | Vai trò |
|---|---|
| [Evidence13 Word](NhomXX_CafeLink_Report_Evidence13_20261029.docx), [PDF](NhomXX_CafeLink_Report_Evidence13_20261029.pdf), [Markdown](CafeLink_Technical_Paper_Evidence13_20261029.md) | Bản biên tập ngày 29/10, dùng số liệu V9.3; không còn là báo cáo đọc chính |
| [CafeLink_Final_Report.md](CafeLink_Final_Report.md) | Báo cáo gốc của bộ RC1 ngày 25/10 |
| [Bàn giao RC1](CafeLink_Final_Handoff.md) | Hồ sơ đã niêm phong của mốc cũ; không tự thay bằng source/báo cáo mới |

Các tên file có `Final` hoặc mốc ngày cũ là lịch sử. Công cụ tạo báo cáo và các bản nháp khác giữ local, không phải dependency để chạy CafeLink.

## Chuẩn bị nộp

Theo [Submission](../final-project-2/final-project/Submission.md), bộ cuối có `Source/` và `Report/`; đổi tên DOCX thành `NhomXX_CafeLink_Report.docx` với số nhóm thật. Chỉ nộp một bản báo cáo trên Compilatio. Thông tin khoa, phần việc và tỷ lệ cần do nhóm xác nhận theo thực tế; bảng phân công đề xuất trong trao đổi chưa tự trở thành xác nhận đóng góp.

Xuất Word/PDF, CI đạt hoặc nhóm kiểm chức năng xong không thay kết quả Compilatio và thủ tục nộp chính thức. Không ghi đã có chứng nhận khi chưa có kết quả thật.
