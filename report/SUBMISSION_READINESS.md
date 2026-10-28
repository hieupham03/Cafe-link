# CafeLink — Trạng thái chuẩn bị nộp ngày 31/10/2026

**Báo cáo hiện tại:** [Word](NhomXX_CafeLink_Report_Refined13_20261028.docx), [PDF](NhomXX_CafeLink_Report_Refined13_20261028.pdf), [Markdown](CafeLink_Technical_Paper_Refined13.md). Các bảng bên dưới ghi nhận mốc phần mềm/bộ RC1 ngày 25/10; bản báo cáo biên tập ngày 28/10 chưa thay ZIP RC1. Thông tin nhóm, Compilatio và nghiệm thu điện thoại vẫn chờ.

**Mốc chốt phần mềm:** V9.3/schema 11. **Bộ bàn giao:** `NhomXX_CafeLink_20261031_RC1`. Đây là release candidate chuẩn bị nộp, chưa phải xác nhận đã nộp hoặc được giảng viên phê duyệt. Ngày chuẩn bị/thực nghiệm: 25/10/2026; hạn theo tài liệu môn học: 23:59 ngày 31/10/2026.

## 1. Đã hoàn tất trong bộ bàn giao

| Hạng mục | Trạng thái | Căn cứ |
|---|---|---|
| Source web/TCP hiện tại | PASS | Source được xuất theo allowlist, không lấy DB/key/journal/live logs từ demo |
| README build/run/test | Hoàn tất | Viết lại theo V9.3, giải thích website→Gateway→TCP Core, tách local/public, lỗi cookie admin/link QR |
| Build/kiểm source sạch | 142 Java + 65 Chromium PASS | [source-proof](evidence/cafelink-final/source-clean/source-proof.json); thư mục có khoảng trắng; bytecode/frontend khớp bản frozen |
| Runtime Windows/JRE 17 | 21 nhóm PASS | [gate gói](evidence/cafelink-v2/v9.3-package/20261025-release-01/summary.json); runtime có manifest riêng |
| HTTPS/WSS public tự động | 7 kiểm PASS, cleanup PASS | [public-final](evidence/cafelink-final/public-final/public-package.json), không thay điện thoại thật |
| So sánh phục hồi | 120/120 ca PASS | [full campaign](evidence/cafelink-final/20261025-final-r2/summary.json), raw và oracle đi kèm |
| Tải bản cuối | 12/12 lượt PASS | 1.348/1.350 slot hoàn tất, 2 slot lỡ, không loại lượt chậm |
| Kiểm sửa công cụ đo | PASS | [readiness check](evidence/cafelink-final/readiness-check/readiness.json); giữ lượt FAIL trước sửa |
| Báo cáo kỹ thuật | Markdown + DOCX + PDF | [báo cáo chính](CafeLink_Final_Report.md), đủ phần paper và references, hình/bảng từ raw |
| Bố cục | Kiểm PDF do Word xuất | [word-render](evidence/cafelink-final/word-render.json), ảnh kiểm bố cục; không chỉ kiểm XML |
| CI/config/analyzer | Kiểm local PASS | Cấu hình và analyzer có kiểm riêng; remote CI vẫn NOT_RUN |

Runtime V9.3 ZIP niêm phong giữ SHA-256 `FDCA5E041BCB83F61260056BB8B6DB859BB513EE19A8F626F4BD464F77C83CA6`. Tên JAR nội bộ `1.0.0` không phải phiên bản phát hành; kiểm RELEASE/manifest để phân biệt. Source sạch có thể khác hash ZIP JAR do timestamp nhưng bytecode đã được so khớp. Không sửa code nghiệp vụ sau gate source sạch.

## 2. Đối chiếu cấu trúc báo cáo theo Instruction.md

| Yêu cầu paper | Vị trí trong báo cáo cuối |
|---|---|
| Title, Abstract, 4–6 Keywords | Tên đề tài, Tóm tắt và sáu từ khóa đầu báo cáo |
| Introduction | Mục 1 |
| Background/Related Work | Mục 2; nguồn chuẩn/RFC và tài liệu chính thức |
| Problem Definition | Mục 3, tác nhân/input/output/constraints/invariants |
| Proposed Approach | Mục 4, journal/semantic/barrier/scope |
| System Architecture | Mục 5 và Hình 2 |
| Network Communication Design | Mục 6, framing/message/connection/push/error |
| Implementation | Mục 7, module và trách nhiệm |
| Experimental Setup | Mục 8, topology/hardware/workload/metric/baseline |
| Results | Mục 9, bảng/biểu đồ và raw |
| Discussion | Mục 10, chi phí/giả định/giới hạn nhân quả |
| Novelty/Contributions | Mục 11, implementation/evidence và phạm vi claim |
| Limitations/Future Work/Conclusion | Mục 12/13/14 |
| References/Appendix | Mục 15/16 |

## 3. Các việc chủ động giữ chờ

1. **Điện thoại/camera/mạng vật lý, usability:** người dùng kiểm sau theo yêu cầu; không tự đổi UAT thành Đạt. Dùng checklist của source, đặc biệt P01–P03 và U24.
2. **Thông tin nhóm, lớp, MSSV, giảng viên, phân công:** chưa cung cấp; không tạo tên/mức đóng góp giả. Khi có thông tin, cập nhật bìa/phân công và đổi `XX` trong tên file/thư mục thành số nhóm thật.
3. **Compilatio:** chưa upload/chưa có chứng nhận. Nhóm tự nộp đúng một DOCX, kiểm ngưỡng theo quy định môn học (≤20%), chỉnh trích dẫn/nội dung nếu cần và lưu kết quả.
4. **Nộp/bàn giao chính thức:** chưa upload Drive/Compilatio hoặc gửi lớp trưởng. Bàn giao Source/Report theo [Submission](../final-project/Submission.md); bản DOCX cuối sau chỉnh phải khớp bản nộp.
5. **Bảo vệ và đóng góp cá nhân:** các thành viên tự diễn tập giải thích code/flow/metric và xác nhận phần việc thực tế; test tự động không xác nhận điều này.

Không cần mở rộng sang ngân hàng/kho/nhiều chi nhánh để hoàn thành phạm vi đã chốt. Nếu điện thoại phát hiện lỗi cần sửa, tạo RC tiếp theo và kiểm lại phần bị ảnh hưởng, cập nhật report/hash; không sửa archive niêm phong hoặc tự giữ kết quả cũ cho source đã đổi.

## 4. Hướng dẫn bàn giao

Toàn bộ: `NhomXX_CafeLink_20261031_RC1.zip`. Source riêng: `NhomXX_CafeLink_Source.zip`. Báo cáo nộp: `Report/NhomXX_CafeLink_Report.docx`; PDF là bản đọc/so bố cục. Chỉ nộp một file báo cáo trên Compilatio. Run chứa gói Windows chạy sẵn, Source vẫn chứa đầy đủ mã build được.

Manifest SHA-256 ở gốc bộ bàn giao bao phủ source/report/runtime; giữ cùng bộ. DB/menu demo mới tự tạo khi chạy. Không đưa DB đã vận hành, `.qr-key`, cookie/journal/backup có quyền phiên vào thư mục nộp. File bìa/phân công, kết quả Compilatio và kiểm điện thoại mới chỉ được coi hoàn tất khi có dữ liệu thật.
