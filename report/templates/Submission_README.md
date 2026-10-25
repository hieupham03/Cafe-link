# CafeLink — Bộ chuẩn bị bàn giao 31/10/2026

**Mốc phần mềm V9.3, schema 11. Bộ RC1, chưa nộp chính thức.** Điện thoại do nhóm kiểm sau; thông tin nhóm và Compilatio còn chờ. Đọc [trạng thái bàn giao](SUBMISSION_READINESS.md) trước khi đổi tên/nộp.

## Các thư mục

| Thư mục | Nội dung |
|---|---|
| Source | Mã Java/React, cấu hình, test/experiment, dependencies lock, docs, raw/CSV/biểu đồ/evidence và E0 baseline ZIP cho integrity guard |
| Report | Một DOCX chuẩn bị nộp, PDF xuất bằng Word và Markdown có thể chỉnh sửa |
| Run/CafeLink-Web-V9.3 | Gói Windows x64 có JRE 17, không cần JDK/Node để chạy |

## Chạy demo ngay

Mở PowerShell tại thư mục chứa README này:

```powershell
cd .\Run\CafeLink-Web-V9.3
powershell -NoProfile -ExecutionPolicy Bypass -File Verify-Package.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File Start-Local.ps1 -Port 19588 -TcpPort 19558
```

Vào `http://127.0.0.1:19588/admin`, `admin / CafeLink@123`. Mở tất cả bàn → Bàn 1 → sao chép link nguyên vẹn từ QR, dán vào InPrivate/browser khác. Tab thường cùng profile vẫn là admin. Giữ terminal mở; Ctrl+C dừng đúng demo.

Public: dừng local, chạy `powershell -NoProfile -ExecutionPolicy Bypass -File Start-Public.ps1 -Port 19588 -TcpPort 19558`; dùng HTTPS và mật khẩu tạm in trong terminal. Điện thoại quét QR đúng lần chạy. Local/public có DB riêng; mã QR/IndexedDB theo origin không tự chuyển khi hostname tunnel đổi.

## Build từ source

Từ gốc bộ bàn giao, mở terminal khác:

```powershell
cd .\Source\cafelink-system
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-web.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-web.ps1 -Phase V9.3
```

Cần Windows/PowerShell, JDK 17+, Node.js 20.19+ hoặc 22.12+, Internet lần tải dependencies đầu. Cổng test 18080/18081 phải trống. Xem [README source](Source/cafelink-system/README.md) và [runbook](Source/cafelink-system/docs/FINAL_RUNBOOK.md). Thực nghiệm cần Python và requirements; không bắt điện thoại tham gia để chạy test tự động.

## Báo cáo và bằng chứng

- [DOCX chuẩn bị nộp](Report/NhomXX_CafeLink_Report.docx), [PDF do Word xuất](Report/NhomXX_CafeLink_Report.pdf), [Markdown](Report/CafeLink_Final_Report.md).
- Source sạch: 142 Java + 65 Chromium PASS; runtime 21 nhóm PASS; public Chromium 7 kiểm PASS.
- Bản cuối: 120 ca phục hồi + 12 lượt tải PASS, 1.348 flow hoàn tất và 2 slot lỡ. Có raw/oracle/CSV; giữ lượt FAIL trước sửa driver. Không gán loopback/mobile viewport thành nghiệm thu thiết bị thật.
- `SHA256-MANIFEST.json` kiểm toàn bộ file được bàn giao. Runtime có thêm manifest riêng. `DELIVERY_VALIDATION.json` ghi kiểm tính toàn vẹn/cấu trúc/link của bộ cuối.

## Trước khi nộp

Thay `XX` bằng số nhóm thật, điền bìa/MSSV/giảng viên/phân công, kiểm điện thoại theo yêu cầu, kiểm Compilatio và lưu kết quả. Chỉ nộp **một DOCX** trên Compilatio; PDF là bản đọc. Bàn giao Source/Report đúng phiên bản cho lớp trưởng theo [Submission](Source/final-project/Submission.md). Hạn trong hướng dẫn là **23:59 ngày 31/10/2026**; bộ RC1 không xác nhận đã upload hoặc được duyệt.

Không gửi kèm DB/key/cookie/journal/backup của buổi demo đang dùng. Run sẽ tạo dữ liệu mẫu mới; muốn giữ menu/lịch sử thực hiện backup/restore offline theo runbook. Không xóa dữ liệu khi Server đang chạy hoặc sửa file runtime sau khi niêm phong mà vẫn giữ hash cũ.
