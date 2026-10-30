# CafeLink - Đối chiếu yêu cầu học phần

Căn cứ ưu tiên là [bộ final-project-2](../final-project-2/README.md), đặc biệt Instruction và Submission. Các repo khác chỉ được tham khảo cách tổ chức tài liệu. Không lấy đặc tả hoặc số đo của đề tài khác thành kết quả CafeLink.

## Yêu cầu và nơi đáp ứng

| Yêu cầu | Nội dung CafeLink | Nơi đọc |
|---|---|---|
| Problem, objective, scope | Gọi món QR, điều phối quầy; một quán, thanh toán giả lập | README gốc; mục 1-3 của báo cáo |
| Client/Server và architecture | Browser - Gateway - TCP Core - SQLite; vai trò và sơ đồ | [Kiến trúc](../cafelink-system/docs/FINAL_ARCHITECTURE.md); mục 5 |
| Network communication | HTTP/WS phía Browser, TCP Socket phía Core, vòng đời kết nối | [Protocol](../cafelink-system/docs/FINAL_PROTOCOL.md); mục 6 |
| Message format | Tiền tố độ dài 4 byte và JSON UTF-8, request/response/event | `FrameCodec`, `Message`; mục 6.1 |
| Concurrency và error handling | Reader/writer, queue, synchronized, transaction, timeout và reconnect | Mục 5.2, 6.2-6.4; source và test |
| Implementation và thư viện | Module, luồng khách/quầy, Java/React/Jetty/SQLite | [README source](../cafelink-system/README.md); mục 7 |
| Test và experiment | Chức năng, TCP, nhiều Client, phục hồi, tải và dữ liệu đối chiếu | [TESTING](../cafelink-system/docs/TESTING.md); mục 8-9 |
| Kết quả có số liệu | Bảng/biểu đồ từ raw; giữ phiên bản, mẫu số, lỗi và slot chưa phát | Mục 9; [evidence](README.md#đọc-số-liệu-đúng-phiên-bản) |
| Novelty/Contributions | Phục hồi theo loại yêu cầu và lưu quyết định bỏ theo phiên; có baseline chung guard | Mục 4, 9.4, 11 |
| Discussion, limitations, future work | Giá trị, đánh đổi, tải loopback và phạm vi giả lập | Mục 10-14 |
| Technical paper và references | Tóm tắt, từ khóa, nền tảng, phương pháp, kết quả, thảo luận, nguồn và phụ lục | [Word/PDF hiện tại](README.md) |
| Source chạy được, README đầy đủ | Môi trường, build, DB tự tạo, Server, Client, test và demo | [Chạy nhanh](../README.md#chạy-nhanh-trên-windows), [runbook](../cafelink-system/docs/FINAL_RUNBOOK.md) |
| Nộp đúng quy cách | `Source/`, `Report/`, tên nhóm thật và một DOCX trên Compilatio | [Submission](../final-project-2/final-project/Submission.md) |

## Vai trò các file của bộ môn

- `Instruction.md`: yêu cầu kỹ thuật, paper, thực nghiệm, đánh giá và trách nhiệm tác giả.
- `Topics.md`: nhóm đề tài và nội dung mạng; CafeLink theo Topic 3.
- `README.md`: mẫu bố cục có placeholder; áp dụng theo phạm vi, không sao chép nguyên mẫu.
- `SPECIFICATION.md`: ví dụ IoTRPCBroker. CafeLink không bắt buộc CRC16, 1.000 thiết bị hoặc mục tiêu hiệu năng của ví dụ.
- `Submission.md`: cách đặt tên, bộ file và thủ tục nộp chính thức.

Hai PDF thể thức được dùng để tham khảo bố cục Word, không đổi loại bài thành khóa luận hoặc đổi thông tin trường. Bản hiện tại 41 trang, body 13; việc biên tập không phải một lần chạy thực nghiệm mới.

## Trạng thái hồ sơ

Nhóm đã xác nhận hoàn thành kiểm thao tác thực tế. Các bằng chứng tự động cũ vẫn giữ thời điểm/phiên bản và không được đổi thành số liệu thiết bị thật. Compilatio, phần việc/tỷ lệ thực tế và nộp chính thức cần xác nhận riêng; repo không tự cấp các xác nhận đó.
