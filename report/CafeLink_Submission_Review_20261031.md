# Rà soát báo cáo CafeLink trước nộp - 31/10/2026

Đã rà trên bản Word Discussion người dùng lưu lúc 11:06 ngày 31/10, không lấy PDF xuất trước chỉnh sửa làm bản chuẩn. Bản dẫn xuất hiện hành: [Word](submission-20261031/Nhom11_CafeLink_Report.docx), [PDF](submission-20261031/Nhom11_CafeLink_Report.pdf). Bản Word đầu vào và các bản trước được giữ nguyên.

**Kết luận:** đủ các thành phần nội dung bắt buộc của technical paper; thể thức chính và cặp Word/PDF đã được kiểm. Chưa thể xác nhận hoàn tất mọi điều kiện nộp vì chưa có kết quả Compilatio, chưa bàn giao chính thức và còn điểm cần hiểu đúng về yêu cầu nguồn trong PDF nghiên cứu. Không phát hiện lỗi nội dung nghiêm trọng còn mở trong phạm vi đã rà.

## 1. Căn cứ và cách áp dụng

| Tài liệu | Cách áp dụng |
|---|---|
| `final-project-2/final-project/Instruction.md` | Yêu cầu kỹ thuật, 19 thành phần của paper, thực nghiệm, contribution, Compilatio và trách nhiệm sinh viên |
| `Topics.md`, Topic 3 | Ứng dụng Client/Server, có giao tiếp, trạng thái, nhiều kết nối và xử lý lỗi |
| `Submission.md` | Tên DOCX, một báo cáo trên Compilatio, source chạy được, bộ Source/Report và hạn nộp |
| `README.md` của bộ môn | Mẫu hồ sơ dự án, không phải 24 chương bắt buộc của báo cáo |
| `SPECIFICATION.md` | Ví dụ IoTRPCBroker; không áp CRC16, telemetry hoặc các thông số của đề tài khác vào CafeLink |
| PDF thể thức KLTN, QĐ 612 | Tham khảo bìa, A4, font, lề, đánh số trang và tác giả-năm; giữ tên học viện/BTL của nhóm, không đổi thành luận văn Trường Đại học Hà Nội |
| `sau bia chinh.pdf` | Có trang nhận xét, điểm số, điểm chữ và chữ ký giảng viên; để trống đúng vai trò |
| `NgoVanQuyen_ResearchMethods_2.pdf` | Áp dụng IMRaD, related work có phản biện, mô hình/đầu vào-đầu ra, phương pháp, thực nghiệm và thảo luận; không đưa nội dung RotorNet vào kết quả CafeLink |
| `viet-bao-cao-lt-mang/SKILL.md` và các reference | Đối chiếu nguồn/code/raw; giữ bản sửa của người dùng; xuất Word/PDF, kiểm nội dung và bố cục; không dự đoán similarity/AI |

PDF thể thức là bản scan 21 trang: đã xem bản dựng cả 21 trang, đọc riêng phần thể thức, trích dẫn và mẫu bìa. Các nội dung dành cho luận án/luận văn như bìa ngoại ngữ, tóm tắt A5 hoặc giấy nộp thư viện không tự trở thành thủ tục của BTL. Con số khoảng 30 trang trong phần tóm tắt luận văn A5 không phải giới hạn của toàn bộ báo cáo CafeLink.

## 2. Đối chiếu 19 thành phần nội dung

| Thành phần của Instruction mục 8 | Vị trí hiện tại | Nội dung đã kiểm |
|---|---|---|
| 8.1 Title | Bìa | CafeLink, học phần, nhóm 11, lớp, giảng viên và ba thành viên |
| 8.2 Abstract | Tóm tắt, trang v | Bài toán toàn hệ thống, kiến trúc, triển khai, kết quả và đóng góp; 238 đơn vị tách theo khoảng trắng |
| 8.3 Keywords | Cuối tóm tắt | 5 từ khóa, nằm trong khoảng 4-6 của Instruction |
| 8.4 Introduction | Mục 1 | Bối cảnh quán, vấn đề mất phản hồi, mục tiêu, phạm vi, ba câu hỏi và hai cải tiến |
| 8.5 Background/Related Work | Mục 2; nền giao thức ở mục 6 | 2.1 RPC, 2.2 end-to-end, 2.3 RIFL; 2.4 phân tích giới hạn khi áp dụng, lựa chọn và đánh đổi của nhóm |
| 8.6 Problem Definition | Mục 3 | Vai trò, QR chung/phiên riêng, trả trước/phục vụ, điều kiện đúng, đầu vào-đầu ra và giả định |
| 8.7 Proposed Approach | Mục 4 | Luồng thường, lookup, C1/C2, lưu đồ, mã giả và thứ tự nhận/bỏ |
| 8.8 System Architecture | Mục 5 | Browser, Gateway, TCP Core, SQLite; sơ đồ, concurrency, dữ liệu và quyền |
| 8.9 Network Communication Design | Mục 6 | TCP framing, envelope, JSON, requestId, vòng đời socket, timeout, PING, RESUME, WS, lỗi và bảo vệ truy cập |
| 8.10 Implementation | Mục 7; cơ chế đồng bộ ở 5.2 | Module/class, stack và phiên bản RC4, chức năng khách/quầy, ảnh thực tế của giao diện |
| 8.11 Experimental Setup | Mục 8 | Phần cứng, OS, JDK/Node/Python, loopback, fixture, policy, lỗi giả lập, workload, metric và cách kiểm DB |
| 8.12 Results | Mục 9 | Chức năng, cơ chế mạng, tải và phục hồi; bảng, biểu đồ, số liệu có raw |
| 8.13 Discussion | Mục 10.1-10.5 | Mức đáp ứng nghiệp vụ; chi phí hai chặng; đồng bộ/tải; lợi ích và chi phí phục hồi; điều kiện áp dụng |
| 8.14 Novelty/Contributions | Mục 11 | Bảng C1/C2, phần thực hiện và bằng chứng; không nhận thuật toán mới trên thế giới |
| 8.15 Limitations | Mục 12 | Simulator, QR chia sẻ, dữ liệu trình duyệt, loopback, thời gian đo ngắn, phục vụ toàn đơn |
| 8.16 Future Work | Mục 13 | Đo từng thành phần, workload dài, vận hành/sao lưu định kỳ, thanh toán thật và giao/hoàn từng phần |
| 8.17 Conclusion | Mục 14 | Kết luận về cả luồng khách-quầy và nội dung môn học, có kết quả/giới hạn |
| 8.18 References | Mục 15 | 31 mục, tác giả-năm, alphabet; đã đối chiếu citation hai chiều |
| 8.19 Appendix | Mục 16, A-D | JSON lỗi/sự kiện, kịch bản, từng lượt đo, tập lịch sử và cách tái lập |

Không thiếu thành phần chỉ vì báo cáo có 16 mục đánh số: Title, Abstract và Keywords nằm ở đầu báo cáo. Phần lập trình mạng được trình bày trực tiếp ở mục 5-6 và kết quả 9.2, không chỉ nằm trong contribution. Mục 9 giữ cách trình bày kết quả chính; tên ca/lượt và công thức chi tiết ở phụ lục.

## 3. Thể thức và bố cục đã kiểm

- A4; lề trên/dưới 3 cm, trái 3,5 cm, phải 2 cm; nội dung chính Times New Roman 13, giãn dòng 1,5. Bảng, chú thích và code dùng cỡ phù hợp để đọc; code giữ font đơn cách. Không gọi đây là áp nguyên văn toàn bộ thể thức luận án.
- Bìa và trang chấm không hiện số; phần đầu i-v, nội dung chính từ 1 đến 44. Tổng PDF 51 trang: 2 trang bìa/chấm, 5 trang đầu, 34 trang mục 1-14, 4 trang tham khảo và 6 trang phụ lục.
- Có mục lục hai trang, danh mục 15 hình và 20 bảng. Tổng 16 ảnh nhúng gồm logo; 22 bảng gồm bảng chấm và bảng thành viên.
- Đã cập nhật field, TOC, danh mục và số trang bằng Microsoft Word. Có 31 hyperlink trong Word. Không còn lỗi field, trang trắng không chủ ý, chữ vượt khổ trang hoặc đoạn/ô bảng bị mất khi xuất PDF trong các phép kiểm đã chạy.
- Đã xem contact sheet toàn bộ PDF và phóng lớn trang bìa, bảng thành viên, lưu đồ/mã giả, JSON, sequence, UI, kết quả, tham khảo và phụ lục. Chỉnh độ rộng bảng thành viên để MSSV nằm trên một dòng; giữ nguyên dữ liệu phân công và tỷ lệ 1/3.

## 4. Kiểm nội dung kỹ thuật và số liệu

| Nội dung | Căn cứ | Kết quả |
|---|---|---|
| Browser HTTP/WS, Gateway raw TCP tới Core | WebMain, WebGateway, SessionBridge, NetworkClient | Mô tả đúng hai chặng và việc Gateway/Core cùng JVM, dùng socket loopback |
| Frame bốn byte big-endian + JSON UTF-8 | FrameCodec.read/write | N = 1-262144 byte; đọc đủ; phân biệt read và message |
| Nhiều kết nối/khóa/transaction | CafeServer, CafeService, Database | Reader/writer/queue khác khóa cập nhật chung; không gán giới hạn cấu hình thành công suất |
| Đối chiếu và bỏ ý định | orderRecovery.ts, CafeService.outcome/discard/execute | C1 theo loại; C2 giữ đúng thứ tự accept/discard; bỏ CANCEL chưa nhận không tự hủy ticket gốc |
| Phục hồi ngày 30/10 | 120 bản ghi raw và analysis.json | Tính lại: 40 ca/policy; lời gọi ngoài nhu cầu 10/5/0; chờ 0/15/5; p95 42,0/35,6/50,4 ms |
| Chống lặp/phiên | Cùng raw phục hồi | 0 đơn trùng và 0 tác dụng sai phiên ở cả ba policy; không gán riêng cho R2 |
| Tải ngày 30/10 | 12 lượt raw, từng flow và thời gian đo | Tính lại nearest-rank và throughput; 1.256/1.350 lượt, 94 chưa phát ở mức 14; từng dòng Phụ lục B khớp |
| Gate RC4 | pre-feature-20261030/final-verification.json | 164 Java, 71 Chromium, 20 mỗi Firefox/WebKit, 23 portable và 8 public; không cộng thành cùng loại kiểm |
| Lịch sử ngày 25/10 | analysis.json của run cũ | 1.348/1.350, hai slot chưa phát; giữ riêng Phụ lục C, không ghép vào run 30/10 |
| Thao tác thực tế | Xác nhận của người dùng trong hội thoại | Giữ kết quả định tính; không tự tạo thông số điện thoại/LAN hoặc sửa trạng thái raw cũ |

Đã parse bốn JSON minh họa; ví dụ PREPAY có các trường phiên bản/giá cần thiết. Đã đọc lại nguồn gốc của RPC, end-to-end, RIFL và các tài liệu chính thức Square/Cloudflare liên quan. Các giới hạn của công trình được xét theo phạm vi CafeLink, không mô tả chúng là giải pháp sai hoặc nhận CafeLink tốt hơn sản phẩm thương mại.

Không chạy experiment mới trong lượt này. Tính lại dữ liệu đã lưu không phải đo lại RC4. Báo cáo vẫn nói rõ số đo chính thuộc RC3, kết quả kiểm bản chốt thuộc RC4.

## 5. Những thay đổi trong lượt rà soát

1. Tạo bản dẫn xuất từ đúng Word người dùng đã lưu; xuất lại PDF đồng bộ.
2. Bổ sung mục 6.2: connect timeout 3 s, PING 5 s, đóng socket/future khi lỗi, RESUME có điều kiện và trình tự shutdown.
3. Bổ sung phiên bản thư viện ở mục 7.1, gắn rõ với RC4; không đổi môi trường raw RC3.
4. Sửa mục 13: hệ thống đã có công cụ backup/restore; phần mở rộng là lịch, kiểm khôi phục định kỳ và theo dõi vận hành.
5. Chỉnh độ rộng bảng thành viên; không thay tên, email, mã sinh viên, phân công hoặc tỷ lệ.
6. Đặt tên báo cáo theo Submission và cập nhật chỉ mục local từng trỏ tới Word cũ đã bị xóa. Chưa push GitHub, chưa tạo/thay bộ source nộp.

## 6. Tuân thủ skill và các việc còn chờ

| Nội dung | Trạng thái |
|---|---|
| Giữ bản Word người dùng, hình và số liệu | Đã kiểm hash và bảo toàn nội dung; chỉ bốn thay đổi nội dung được ghi ở trên |
| Nguồn, code và phép tính tách biệt | Đã rà, có bản ghi local cho lượt nguồn và lượt bằng chứng |
| Rà độc lập nhiều agent | Chưa thực hiện được do giới hạn sử dụng; dùng các lượt tách biệt của điều phối viên theo phương án dự phòng trong skill, không khai là hai người đã duyệt |
| Văn phong và dấu gạch | Không thấy placeholder/vết hội thoại/đoạn trùng dài trong kiểm local; dùng ASCII `-`, không có en/em dash trong văn bản. Không suy ra xác suất AI |
| Chống ký tự che giấu | Không thấy ký tự ẩn đã kiểm, chữ ẩn theo định dạng hoặc tracked insertion/deletion chưa xử lý |
| Tự hiểu và xác nhận phần việc | Nhóm chịu trách nhiệm đọc, giải thích code/số liệu và xác nhận đúng thực tế; công cụ không chứng nhận thay |
| Sử dụng AI | Instruction cho phép hỗ trợ và quy định trách nhiệm sinh viên; không bắt buộc một mục AI riêng. Không dùng thay dấu câu, paraphrase máy móc hoặc che nguồn để nhận điểm detector thấp |
| Compilatio | **NOT_RUN**. Phải kiểm đúng DOCX cuối và lưu kết quả <=20% theo quy định lớp; không có dự đoán tỷ lệ |
| Nguồn trong PDF nghiên cứu | Có 31 tài liệu nhưng chỉ 3 công trình nghiên cứu (2 bài tạp chí và 1 bài hội nghị); phần còn lại là chuẩn/tài liệu kỹ thuật/hồ sơ. Không nhận là 30 bài báo tạp chí; cần xác nhận nếu giảng viên áp nguyên văn phần nguồn của mẫu nghiên cứu như điều kiện cứng |
| Nộp và bàn giao Source/Report | Chưa thực hiện trong lượt này. Thư mục báo cáo mới không phải bộ source hoàn chỉnh; cần chọn đúng source RC4 và loại phần CafeLive đang tạm dừng |

Chưa có bằng chứng Compilatio hoặc tiếp nhận bài nộp nên không đánh dấu toàn bộ dự án “100% đủ nộp”. Với nội dung và thể thức đã kiểm, bản mới là bản nên dùng để nhóm đọc chốt và thực hiện các bước nộp còn lại.

## 7. Bằng chứng của lần rà

[VALIDATION.json](submission-20261031/VALIDATION.json) gắn kết quả với hash đúng cặp Word/PDF. Hồ sơ local tại `.cleanup/submission-review-20261031/` gồm snapshot, manifest, lượt nguồn/bằng chứng, script xuất/kiểm, phép tính raw, bản trích nội dung, ảnh xem PDF và biên bản nghiệm thu. Những công cụ/skill này không đưa vào source nộp hoặc tự push.

Nếu sửa Word sau lần rà, cần xuất lại PDF, cập nhật field/số trang và kiểm lại; kết quả hiện tại chỉ áp dụng hash đã ghi.
