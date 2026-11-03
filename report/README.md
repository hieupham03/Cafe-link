# CafeLink - Báo cáo và bằng chứng

## Báo cáo hiện tại

| Định dạng | Bản dùng để đọc/chỉnh sửa |
|---|---|
| Word | [Nhom11_CafeLink_Report.docx](submission-20261031/Nhom11_CafeLink_Report.docx) |
| PDF | [Nhom11_CafeLink_Report.pdf](submission-20261031/Nhom11_CafeLink_Report.pdf) |

Bản rà soát ngày **31/10/2026**, **51 trang**, nội dung chính Times New Roman 13. Đầu vào là bản Word Discussion được người dùng sửa mới nhất; bìa, phân công, số liệu và hình được giữ. Báo cáo có đủ 19 thành phần của technical paper, gồm công trình liên quan, mô tả toàn hệ thống, giao tiếp mạng, kết quả và thảo luận. Đã bổ sung vòng đời kết nối, phiên bản thư viện, chỉnh cột MSSV và cập nhật mục lục/Word/PDF. [Phiếu rà soát trước nộp](CafeLink_Submission_Review_20261031.md).

Word là bản có thể tiếp tục chỉnh; PDF dùng đọc và kiểm bố cục. Bản mới được tạo từ DOCX, không lấy Markdown cũ để ghi đè chỉnh sửa của người dùng. [Kết quả kiểm đúng cặp tệp](submission-20261031/VALIDATION.json).

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
- [Trạng thái chuẩn bị nộp](SUBMISSION_READINESS.md).

## Phạm vi công bố

Bản công bố chỉ giữ cặp Word/PDF hiện hành trong bảng đầu trang. Bản cũ chỉ còn trong lịch sử Git. Báo cáo RC1, bản Evidence13, ảnh kiểm bố cục và bản nháp trước đó giữ local, không đưa lại vào repo. Lịch sử Git vẫn ghi nhận các lần công bố trước.

Dữ liệu thực nghiệm V9.3 trong phụ lục, phép đo V9.4 và kết quả kiểm RC4 được giữ để kiểm chứng báo cáo. Chúng là bằng chứng theo từng phép thử, không phải các bản ứng dụng hoặc báo cáo để lựa chọn. Công cụ tạo báo cáo và skill AI giữ local.
