# Báo cáo và bằng chứng CafeLink

Source đã nâng cấp V9.4 sau mốc biên tập báo cáo bên dưới. Xem [báo cáo nâng cấp ngày 30/10](CafeLink_Hardening_20261030.md) để đọc các bản sửa, test mới, thực nghiệm và gói chạy tương ứng. DOCX người dùng đang sửa được giữ nguyên; số liệu V9.3 không tự chuyển thành số liệu V9.4.

[Mốc trước tính năng tiếp theo](CafeLink_PreFeature_Readiness_20261030.md) ghi checkpoint, kit nghiệm thu sạch và các phần còn cần người có thiết bị thực hiện.

## Báo cáo hiện tại

| Định dạng | File |
|---|---|
| Word chỉnh sửa được | [NhomXX_CafeLink_Report_Evidence13_20261029.docx](NhomXX_CafeLink_Report_Evidence13_20261029.docx) |
| PDF đọc/kiểm bố cục | [NhomXX_CafeLink_Report_Evidence13_20261029.pdf](NhomXX_CafeLink_Report_Evidence13_20261029.pdf) |
| Nội dung Markdown | [CafeLink_Technical_Paper_Evidence13_20261029.md](CafeLink_Technical_Paper_Evidence13_20261029.md) |

Đây là bản biên tập ngày 29/10/2026, 45 trang, nội dung chữ 13, 17 bảng và 12 hình. Số liệu dùng run CafeLink đã lưu; việc biên tập không phải chạy một experiment mới. Khi nộp, điền thông tin nhóm/phân công thật và đổi tên DOCX thành `NhomXX_CafeLink_Report.docx` với số nhóm đã chốt. Chỉ nộp một báo cáo trên Compilatio theo [Submission](../final-project-2/final-project/Submission.md).

Bản này làm rõ cách đo p95 phục hồi/phản hồi đặt món, phạm vi Web Locks và quyết định phục hồi. Số liệu thực nghiệm giữ nguyên từ ngày 25/10; các chỉnh sửa không tạo thêm lượt đo hoặc kết quả Compilatio.

## Bằng chứng và hướng dẫn liên quan

- [Đối chiếu yêu cầu môn](CafeLink_Requirements_Alignment.md), [trạng thái chuẩn bị nộp](SUBMISSION_READINESS.md).
- [Run phục hồi/tải bản cuối](evidence/cafelink-final/20261025-final-r2/summary.json), [phân tích số liệu](evidence/cafelink-final/20261025-final-r2/analysis.json), [môi trường/hash](evidence/cafelink-final/20261025-final-r2/environment.json).
- [Kiểm phần mềm V9.3](evidence/cafelink-v2/v9.3-gate/20261025-184703-1bdff3d4/summary.json), [kiểm source sạch](evidence/cafelink-final/source-clean/source-proof.json), [kiểm gói chạy](evidence/cafelink-v2/v9.3-package/20261025-release-01/summary.json).
- [Kiểm nội dung Word/PDF](evidence/cafelink-student-paper/evidence13-validation.json), [kiểm bố cục](evidence/cafelink-student-paper/evidence13-visual-review.json). Các file này ghi nhận lần kiểm và hash của bản xuất tương ứng.
- [Kiểm bộ file công bố ngày 29/10](evidence/cafelink-student-paper/publication-20261029-check.json): đối chiếu Word/PDF với Markdown, hash và liên kết từ bản xuất Git.
- [Kiến trúc](../cafelink-system/docs/FINAL_ARCHITECTURE.md), [giao thức](../cafelink-system/docs/FINAL_PROTOCOL.md), [chạy/demo](../cafelink-system/docs/FINAL_RUNBOOK.md), [nghiệm thu người dùng](../cafelink-system/docs/WEB_USER_ACCEPTANCE.md).

Raw/oracle và lượt FAIL được giữ để truy vết; các ảnh mobile Chromium không thay nghiệm thu điện thoại thật. Hình trong `assets/` và biểu đồ thực nghiệm mô tả implementation/dữ liệu CafeLink.

## Hồ sơ RC1 trước lần biên tập

[CafeLink_Final_Report.md](CafeLink_Final_Report.md), [NhomXX_CafeLink_Report.docx](NhomXX_CafeLink_Report.docx) và [NhomXX_CafeLink_Report.pdf](NhomXX_CafeLink_Report.pdf) thuộc mốc RC1 ngày 25/10. Tên file ngắn của chúng không có nghĩa là báo cáo mới nhất. Giữ các file này để đối chiếu [bộ RC1 đã niêm phong](CafeLink_Final_Handoff.md); khi đọc/nộp bản hiện tại, chọn các file trong bảng đầu trang.

Thông tin nhóm, nghiệm thu điện thoại/camera/mạng thật, Compilatio và nộp chính thức vẫn còn chờ. Không coi báo cáo đã xuất hoặc CI thành công là các bước đó đã hoàn tất.
