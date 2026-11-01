# CafeLink - Bản nộp repository V10.1

## Bản hiện hành

- **Source:** V10.1, schema 13, chạy từ source; portable V9.4/RC4 là mốc trước nâng cấp.
- **Báo cáo:** cặp [Word](submission-20261031/Nhom11_CafeLink_Report.docx) và [PDF](submission-20261031/Nhom11_CafeLink_Report.pdf), 51 trang; tạo từ bản Word người dùng đã sửa ngày 31/10. [Phiếu rà soát](CafeLink_Submission_Review_20261031.md).
- **Yêu cầu áp dụng:** [Instruction](../final-project-2/final-project/Instruction.md), [Topics](../final-project-2/final-project/Topics.md) và [Submission](../final-project-2/final-project/Submission.md). [Bảng đối chiếu](CafeLink_Requirements_Alignment.md) chỉ vị trí đáp ứng từng yêu cầu.

## Kiểm tích hợp hiện hành

[Phiếu kiểm ngày 02/11](evidence/cafelink-integration-20261102/summary.json): 201 Java, 90 Chromium đạt; 37 ca công cụ publication đạt, 8 ảnh khớp byte commit gốc. Hai nhánh thành viên được hợp nhất, giữ tác giả và lịch sử; CafeLive/công cụ biên soạn không công bố. Báo cáo Word/PDF đã chốt giữ nguyên hash.

## Kết quả mốc trước

| Hạng mục | Kết quả và bằng chứng |
|---|---|
| Build và chạy từ source | [README source](../cafelink-system/README.md); build sạch và 8 bước smoke được ghi ở [kiểm công bố](evidence/cafelink-docs-20261030/summary.json) |
| Kiểm phần mềm V9.4/RC4 | 164 Java, 71 Chromium, 20 Firefox, 20 WebKit, 23 nhóm kiểm gói và 8 kiểm public; [phiếu kiểm cuối](evidence/cafelink-v2/pre-feature-20261030/final-verification.json) |
| Thực nghiệm V9.4/RC3 | 120 ca phục hồi và 12 lượt tải; [analysis](evidence/cafelink-v2/v9.4-hardening/measurements-20261030/analysis.json), raw và môi trường đi kèm |
| Thao tác thực tế | Nhóm đã xác nhận hoàn thành; không quy đổi thành số đo camera, thiết bị hoặc mạng chưa được ghi nhận |
| Báo cáo Word/PDF | Cặp hiện hành khớp nội dung, đã xem PDF; [hash và kiểm ngày 31/10](submission-20261031/VALIDATION.json). Phiếu ngày 30/10 chỉ áp dụng bản cũ |
| GitHub CI | [Các run đã xác minh](evidence/cafelink-docs-20261030/summary.json); kết quả chỉ áp dụng commit và phạm vi được ghi |

Các lớp kiểm có mục đích riêng. Số đo RC3 không được gọi là benchmark RC4, và số Client đã thử không phải công suất tối đa.

## Hoàn tất thủ tục nộp

1. Nhóm đọc lại và xác nhận bìa, tên/MSSV/email và phần việc thực tế đã điền. Bản mới đã dùng số nhóm 11, không còn placeholder trong báo cáo.
2. Tổ chức `Source/` và `Report/` theo [Submission](../final-project-2/final-project/Submission.md). Chọn cặp ngày 31/10 bên trên; DOCX đã mang tên `Nhom11_CafeLink_Report.docx`. Thư mục báo cáo mới chưa chứa bộ source. Chốt đúng source V10.1/schema 13; không đưa CafeLive đang tạm dừng vào bản nộp do nhầm thay đổi local.
3. Nộp đúng một báo cáo trên Compilatio và lưu kết quả theo ngưỡng của lớp. Chưa có kết quả thì giữ trạng thái chưa xác nhận.
4. Đối chiếu yêu cầu nguồn của PDF nghiên cứu với phạm vi BTL: hiện có 31 tài liệu gồm công trình, RFC, tài liệu chính thức và hồ sơ dự án, chưa phải 30 bài báo tạp chí. Không nhận đáp ứng nguyên văn điều kiện này nếu giảng viên áp dụng như tiêu chí cứng.
5. Nộp/bàn giao chính thức theo quy định học phần; GitHub và CI không thay bước này. Hạn trong Submission là **23:59 ngày 31/10/2026**. Mốc nộp repo do người dùng cập nhật là 12h; quy định học phần được giữ nguyên để đối chiếu. GitHub không thay xác nhận Compilatio/nộp báo cáo.

## Phạm vi repository

GitHub chỉ giữ source hiện hành, tài liệu chạy/thiết kế/kiểm thử, một cặp báo cáo Word/PDF và bằng chứng cần để kiểm chứng kết quả. Báo cáo cũ, ảnh kiểm bố cục cũ, công cụ biên soạn, skill AI và mẫu của nhóm khác giữ local.

ZIP E0 trong `dist/` là baseline được kiểm tra nguyên vẹn bởi test/CI, không phải bộ cài web hiện tại. Dữ liệu V9.3 được trích trong phụ lục là dữ liệu đối chiếu; không đưa lại các bản báo cáo V9.3/RC1 để người đọc lựa chọn.

Khi đóng gói source, loại DB đã vận hành, khóa QR, cookie/journal, mật khẩu và cache. Dùng [runbook](../cafelink-system/docs/FINAL_RUNBOOK.md) để chạy/demo; không sửa các archive đã niêm phong.
