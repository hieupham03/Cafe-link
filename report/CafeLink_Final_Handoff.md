# CafeLink — Bàn giao RC1 chuẩn bị hạn 31/10/2026

Mốc chốt V9.3/schema 11, chuẩn bị ngày 25/10/2026. Đây là bộ RC1 kiểm được, chưa phải xác nhận đã nộp hoặc được giảng viên duyệt.

## Tệp sử dụng

- Bộ đầy đủ giữ riêng tại workspace: `dist/NhomXX_CafeLink_20261031_RC1.zip`; README nằm ở gốc bộ giải nén. Gói Windows/RC1 không được commit vào GitHub.
- Source ZIP giữ riêng: `dist/NhomXX_CafeLink_Source.zip`. Khi clone GitHub, dùng trực tiếp [README build/run/test của source](../cafelink-system/README.md).
- [DOCX chuẩn bị nộp](NhomXX_CafeLink_Report.docx), [PDF Word 17 trang](NhomXX_CafeLink_Report.pdf); bản niêm phong cùng nội dung nằm trong thư mục Report của bộ RC1.
- [Markdown báo cáo chính](CafeLink_Final_Report.md), [trạng thái chi tiết](SUBMISSION_READINESS.md), [kiểm cuối ZIP/manifest](evidence/cafelink-final/final-delivery.json).

## Bằng chứng đã chốt

Source export ở thư mục sạch có khoảng trắng: 142 Java + 65 Chromium PASS, không bỏ qua/flaky/lỗi; bytecode Java và manifest frontend khớp bản V9.3 frozen. Gói JRE 17 có 21 nhóm PASS. Public Chromium mới có 7 kiểm PASS và đóng listener sạch; không thay điện thoại thật.

Campaign bản cuối: 120/120 ca phục hồi, 12/12 lượt tải PASS, 1.348 flow hoàn tất trên 1.350 slot, giữ 2 slot lỡ. Một lượt FAIL trước sửa readiness của driver được giữ nguyên; regression kiểm chờ UI sẵn sàng đã PASS. Số liệu cũ V8 không được gán cho bản mới.

Báo cáo paper có 9 bảng, 5 hình, references, nguồn Mermaid/SVG, raw/CSV/oracle và các giới hạn. PDF xuất bằng Word, đã xem bố cục 17 trang, kiểm mục lục/bảng/hình và không có block văn bản vượt trang. DOCX/PDF cùng bản nội dung.

Bộ đầy đủ kiểm 1.096 file theo manifest và 93 local link ở tài liệu chính; ZIP CRC và nội dung ZIP khớp thư mục/source đã bàn giao. Không có DB/key/journal/live profile hoặc cache build trong source. Các archive V9/V9.1/V9.2/QR-Fix/V9.3/E0 trước đó giữ nguyên.

## SHA-256

```text
NhomXX_CafeLink_20261031_RC1.zip
22849890840D7F24DD04D1443FCDA817D2F234B566873EC5A796BDD8AD4B3D9F

NhomXX_CafeLink_Source.zip
D011326835F0F89DBE0832F8B1A1BF6CC506702C35B73EF4BFDD3DC26EC6E832
```

## Phần còn chờ theo yêu cầu

Điện thoại/camera/mạng vật lý và usability do người dùng kiểm sau. Thông tin nhóm/lớp/MSSV/giảng viên/phân công chưa có: giữ `XX`, không tạo thông tin giả. Compilatio và bàn giao chính thức chưa thực hiện. Trước nộp thay tên nhóm thật, điền bìa/phân công, kiểm ngưỡng môn học và bàn giao đúng một DOCX trên Compilatio cùng bộ Source/Report theo Submission.md.

Nếu sửa sau RC1, tạo RC tiếp theo có test/evidence/hash phù hợp; không ghi đè archive niêm phong rồi tiếp tục dùng kết quả cũ.

## Dọn workspace sau khi chốt RC1 — 25/10/2026

Theo yêu cầu dọn dẹp, các báo cáo pha cũ, cache khảo sát, fixture và gói V9/V9.1/V9.2/QR-Fix đã được loại khỏi workspace. Dữ liệu/config của các gói demo bị loại được sao lưu riêng tại `.cleanup/retired-demo-data-20261025.zip` ở gốc workspace. Giữ bản sao lưu này nội bộ. Source/data và gói V9.3 đang chạy giữ nguyên; ZIP baseline E0, ZIP V9.3 và bộ RC1 vẫn được giữ. Nhận xét giữ archive ở phần kiểm RC1 phía trên mô tả thời điểm niêm phong, trước lần dọn này. Không sửa nội dung hoặc manifest của bộ RC1.
