# CafeLink - Chuẩn bị nộp ngày 31/10/2026

## Bản hiện hành

- **Source:** V9.4, schema 11; gói portable đã kiểm RC4, cung cấp riêng khi cần.
- **Báo cáo:** cặp [Word](NhomXX_CafeLink_Report_Current_20261030.docx) và [PDF](NhomXX_CafeLink_Report_Current_20261030.pdf), 42 trang; đã đồng nhất tên/MSSV theo xác nhận của nhóm.
- **Yêu cầu áp dụng:** [Instruction](../final-project-2/final-project/Instruction.md), [Topics](../final-project-2/final-project/Topics.md) và [Submission](../final-project-2/final-project/Submission.md). [Bảng đối chiếu](CafeLink_Requirements_Alignment.md) chỉ vị trí đáp ứng từng yêu cầu.

## Kết quả đã có

| Hạng mục | Kết quả và bằng chứng |
|---|---|
| Build và chạy từ source | [README source](../cafelink-system/README.md); build sạch và 8 bước smoke được ghi ở [kiểm công bố](evidence/cafelink-docs-20261030/summary.json) |
| Kiểm phần mềm V9.4/RC4 | 164 Java, 71 Chromium, 20 Firefox, 20 WebKit, 23 nhóm kiểm gói và 8 kiểm public; [phiếu kiểm cuối](evidence/cafelink-v2/pre-feature-20261030/final-verification.json) |
| Thực nghiệm V9.4/RC3 | 120 ca phục hồi và 12 lượt tải; [analysis](evidence/cafelink-v2/v9.4-hardening/measurements-20261030/analysis.json), raw và môi trường đi kèm |
| Thao tác thực tế | Nhóm đã xác nhận hoàn thành; không quy đổi thành số đo camera, thiết bị hoặc mạng chưa được ghi nhận |
| Báo cáo Word/PDF | Cặp hiện hành khớp nội dung; [hash và kiểm bố cục](evidence/cafelink-docs-20261030/report.json) |
| GitHub CI | [Các run đã xác minh](evidence/cafelink-docs-20261030/summary.json); kết quả chỉ áp dụng commit và phạm vi được ghi |

Các lớp kiểm có mục đích riêng. Số đo RC3 không được gọi là benchmark RC4, và số Client đã thử không phải công suất tối đa.

## Hoàn tất thủ tục nộp

1. Xác nhận thông tin bìa, khoa, số nhóm và phần việc thực tế. Dùng số nhóm thật thay `XX` trong tên file nộp.
2. Tổ chức `Source/` và `Report/` theo [Submission](../final-project-2/final-project/Submission.md). Trong `Report/`, đặt tên bản đã chọn là `NhomXX_CafeLink_Report.docx`; PDF là bản đọc cùng nội dung.
3. Nộp đúng một báo cáo trên Compilatio và lưu kết quả theo ngưỡng của lớp. Chưa có kết quả thì giữ trạng thái chưa xác nhận.
4. Nộp/bàn giao chính thức theo quy định học phần; GitHub và CI không thay bước này. Hạn trong Submission là **23:59 ngày 31/10/2026**.

## Phạm vi repository

GitHub chỉ giữ source hiện hành, tài liệu chạy/thiết kế/kiểm thử, một cặp báo cáo Word/PDF và bằng chứng cần để kiểm chứng kết quả. Báo cáo cũ, ảnh kiểm bố cục cũ, công cụ biên soạn, skill AI và mẫu của nhóm khác giữ local.

ZIP E0 trong `dist/` là baseline được kiểm tra nguyên vẹn bởi test/CI, không phải bộ cài web hiện tại. Dữ liệu V9.3 được trích trong phụ lục là dữ liệu đối chiếu; không đưa lại các bản báo cáo V9.3/RC1 để người đọc lựa chọn.

Khi đóng gói source, loại DB đã vận hành, khóa QR, cookie/journal, mật khẩu và cache. Dùng [runbook](../cafelink-system/docs/FINAL_RUNBOOK.md) để chạy/demo; không sửa các archive đã niêm phong.
