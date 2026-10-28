# CafeLink — Phân tích bộ yêu cầu đầy đủ final-project-2

Ngày đối chiếu: 28/10/2026. Bộ dùng làm căn cứ hiện tại gồm năm tài liệu Markdown trong `final-project-2/final-project/` và hai PDF mới trong `final-project-2`. Không thay hoặc sửa các tệp yêu cầu do người dùng cung cấp.

## 1. Vai trò của từng tài liệu

| Tài liệu | Nội dung áp dụng | Cách dùng cho CafeLink |
|---|---|---|
| [Instruction](../final-project-2/final-project/Instruction.md) | Năng lực môn, nội dung technical paper, thực nghiệm, novelty và tiêu chí đánh giá | Giữ đủ title, abstract, keyword, problem, approach, architecture/network, implementation, setup/result/discussion, contribution, limit/future/conclusion, reference/appendix |
| [Topics](../final-project-2/final-project/Topics.md) | Topic 3: trách nhiệm Server/Client, protocol, concurrency, đồng bộ và lỗi | Giải thích Browser, Gateway, TCP Core; phân biệt UI với quyền/nghiệp vụ do Core quyết định |
| [README mẫu](../final-project-2/final-project/README.md) | Hồ sơ dự án 24 nhóm mục: thông tin nhóm, scope, stack, install/run/test, kết quả, demo và bàn giao | Bổ sung phần chạy/tái lập, trạng thái chức năng, demo, mapping hồ sơ và bảng thành viên có email/tỷ lệ chờ điền |
| [SPECIFICATION](../final-project-2/final-project/SPECIFICATION.md) | Đặc tả mang tên IoTRPCBroker, một đề tài khác: binary/CRC16, telemetry/RPC, giả lập IoT | Tham khảo mức độ chi tiết; viết [đặc tả riêng CafeLink](../cafelink-system/docs/PROJECT_SPECIFICATION.md) từ source thực tế |
| [Submission](../final-project-2/final-project/Submission.md) | Một DOCX theo tên nhóm, source hoàn chỉnh, Source/Report, hạn 31/10/2026 | Giữ thông tin nhóm/Compilatio/bàn giao là chưa xác nhận; chuẩn bị đúng phiên bản được chọn làm bản cuối |
| PDF thể thức KLTN, 21 trang | TNR 13, giãn dòng 1,5, lề 3/3/3,5/2 cm, tiêu đề, số trang, tác giả–năm và alphabet tài liệu | Áp dụng quy cách; giữ danh tính PTIT, loại báo cáo BTL và cấu trúc technical paper, không tự đổi thành KLTN Đại học Hà Nội |
| PDF `sau bia chinh.pdf`, 1 trang | Khung nhận xét, điểm số, điểm chữ và chữ ký | Trang 2 sau bìa, để trống, chỉnh sửa được trong Word |

So hash cho thấy Instruction, Topics và Submission giống bộ trước. Hai tệp bổ sung là README và SPECIFICATION. Vì vậy, nội dung paper không cần bỏ cấu trúc cũ; phần thiếu chủ yếu là độ chi tiết của đặc tả, hồ sơ tái lập, phân vai và truy vết từ yêu cầu tới code/evidence.

## 2. Những điểm không được suy diễn từ SPECIFICATION IoT

- Không đổi CafeLink sang giao thức magic/CRC16 chỉ vì ví dụ IoT dùng nó. Code CafeLink dùng header bốn byte độ dài và JSON UTF-8.
- Không nhận các mức 100/500/1.000 thiết bị, 2.000 request/giây hoặc tỷ lệ giảm bytes của IoT thành mục tiêu đã đạt của CafeLink.
- Không mô tả readFully như một codec có tự tái đồng bộ theo magic marker; codec hiện tại đóng peer malformed theo contract.
- Không sao chép nhóm ba người, nhiệm vụ từng thành viên hoặc kế hoạch tám tuần làm lịch sử dự án CafeLink.
- Không chuyển những con số định hướng/đề xuất trong một đặc tả thành số liệu thực nghiệm. Báo cáo CafeLink chỉ dùng run, raw và oracle đã lưu của chính nó.

## 3. Nội dung đã mở rộng trong báo cáo

1. Bài toán có tình huống cụ thể, mục tiêu, tiêu chí kiểm và vị trí theo Topic 3.
2. So sánh R0/R1/R2 với guard chung, phân biệt TCP delivery, tiếp nhận và hoàn tất công việc.
3. Quy tắc quán café, trạng thái tiền/phục vụ, private visit, ticket version và các ngoại lệ.
4. Journal, mã giả recovery, transaction/receipt, hai thứ tự accept/discard và ví dụ lệnh đến muộn.
5. Kiến trúc, ERD rút gọn, nhóm bảng, sequence bình thường, queue/reader/writer và giới hạn cấu hình.
6. Header/body, đọc đủ bytes, envelope, lifecycle connection, lỗi, cookie/Origin/CSRF và phạm vi bảo vệ.
7. Hiện thực theo module, luồng khách/quầy, payment simulator, thông báo, dữ liệu/backup và công nghệ.
8. Thiết kế đối chứng, tầng kiểm, dữ liệu seed, metric, oracle, điều kiện tái lập và các giới hạn suy luận.
9. Kết quả gốc giữ nguyên; thêm bảng theo scenario và khoảng p95 được tính trực tiếp từ raw/analysis.
10. Thảo luận đánh đổi, giá trị thực tế, đe dọa tính đúng, lập luận contribution và hướng phát triển có thứ tự.
11. Phụ lục mapping đủ bộ yêu cầu, lệnh chạy/test/experiment, bằng chứng và trách nhiệm kiểm của tác giả.

Nội dung hiện tại nằm trong [báo cáo CafeLink](CafeLink_Technical_Paper_Refined13.md). Hình mô tả implementation và biểu đồ dùng số liệu đã có của CafeLink; không dựng ảnh bằng chứng hoặc số đo giả.

## 4. Sản phẩm và phần còn chờ

- **Bản hiện tại:** [Word](NhomXX_CafeLink_Report_Refined13_20261028.docx), [PDF](NhomXX_CafeLink_Report_Refined13_20261028.pdf), [Markdown](CafeLink_Technical_Paper_Refined13.md); 45 trang, 17 bảng/12 hình nội dung. [Validation đã ghi nhận](evidence/cafelink-student-paper/refined13-validation.json) kiểm nội dung Word/PDF, các hàng bảng gốc, dữ liệu thực nghiệm và thể thức; công cụ biên soạn báo cáo không thuộc source cần chạy dự án.
- Các bản nháp và tài liệu mẫu giữ local. Git giữ báo cáo hiện tại, số liệu thực nghiệm, hình/sơ đồ và kết quả kiểm phục vụ đánh giá dự án.
- Đặc tả áp dụng: [PROJECT_SPECIFICATION](../cafelink-system/docs/PROJECT_SPECIFICATION.md).
- Vẫn cần nhóm cung cấp: khoa/lớp/nhóm, tên/MSSV/email, giảng viên, phần việc và tỷ lệ thật.
- Vẫn chờ người dùng nghiệm thu camera/điện thoại/mạng vật lý và usability; không cập nhật PASS thay người dùng.
- Compilatio và bàn giao chính thức chưa có xác nhận; báo cáo không cam kết vượt công cụ phát hiện AI hoặc similarity.
- Source nghiệp vụ và RC1 được giữ nguyên. Bản Expanded không tự thay báo cáo đã niêm phong trong RC1; khi chọn bản cuối cần đóng bộ mới và đối chiếu lại nội dung/tên tệp.
