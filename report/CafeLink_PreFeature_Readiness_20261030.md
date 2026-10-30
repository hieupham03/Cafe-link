# CafeLink - Mốc chuẩn bị trước khi cập nhật tính năng

Ngày 30/10/2026. **Phần chuẩn bị phần mềm đã hoàn tất; đủ cơ sở bắt đầu làm tính năng trên nhánh/worktree riêng.** Nghiệm thu thiết bị/người dùng vẫn chờ kết quả thật, không được diễn giải thành hoàn thành toàn bộ nghiệm thu.

## 1. Mốc khôi phục

- Checkpoint Git: `checkpoint/v9.4-before-features-20261030`. Tag ghi nhận source đã commit và công cụ chuẩn bị nghiệm thu, không ghi nhận DOCX người dùng đang sửa chưa commit.
- Runtime đã kiểm: `dist/CafeLink-Web-V9.4-RC3.zip`; SHA-256 `6FE0B497F2B1CBBA404312A6977B6E3D9F31ACBF2510986CB1C7197EBA4A7BB3`.
- Đã đối chiếu **88 file source runtime/build** với commit `90d2116`: không đổi nghiệp vụ, giao thức, schema hoặc frontend của RC3 trong bước chuẩn bị này. [Manifest source](evidence/cafelink-v2/pre-feature-20261030/runtime-source-manifest.json).
- E0/RC1 và DOCX đang chỉnh sửa được giữ nguyên. Thẻ Git không đồng nghĩa đã chốt nội dung Word hoặc hoàn tất nộp bài.

## 2. Những việc đã xử lý

| Công việc | Kết quả |
|---|---|
| Kiểm lại bản chạy trước nâng cấp | Manifest RC3: 360 file đạt; hash ZIP RC3 và E0 khớp bằng chứng đã lưu |
| Tạo bộ nghiệm thu sạch | `dist/CafeLink-Device-UAT-V9.4-20261030`, lấy từ ZIP đã xác minh; không sao chép DB/key/media đang vận hành |
| Giữ test riêng khỏi dữ liệu thật | Kit có profile local/public riêng. Chưa tạo `app/data` trong kit sạch giao cho người kiểm |
| Bảo vệ kết quả thủ công | Chín ca và các trạng thái tổng mặc định NOT_RUN; chuẩn bị hoặc chạy probe không tự chuyển thành PASS |
| Kiểm công cụ chuẩn bị | 9 test đạt: checksum sai, output cũ, ZIP path/link/duplicate, profile riêng, phiên bản sai, trạng thái kiểm chưa đủ và tham số launcher |
| Kiểm launcher bằng ứng dụng thật | 5 kiểm đạt trong đường dẫn có khoảng trắng, dùng JRE đi kèm; admin gọi API qua Gateway/TCP; đã dừng các tiến trình/listener do test tạo |
| Đồng bộ tài liệu | Checklist người kiểm, public demo và LAN ghi rõ mốc V9.4; bảng V9.3/RC1 giữ số liệu lịch sử |

[Bằng chứng chuẩn bị](evidence/cafelink-v2/pre-feature-20261030/summary.json), [kiểm launcher thật](evidence/cafelink-v2/pre-feature-20261030/device-kit-smoke.json). Bộ Java/Chromium/Firefox/WebKit và phép đo của runtime RC3 nằm ở [báo cáo nâng cấp](CafeLink_Hardening_20261030.md). Các kiểm mới ở đây không cộng vào số ca Java/web cũ hoặc biến chúng thành tỷ lệ bao phủ.

## 3. Các việc còn chờ và người thực hiện

| Việc | Trạng thái | Lý do/phạm vi |
|---|---|---|
| Điện thoại, camera, Safari/iOS, Chrome/Android, 4G/5G | NOT_RUN | Cần người có thiết bị quét và thao tác thật; kit đã chuẩn bị |
| Hai máy LAN vật lý | NOT_RUN | Hiện chưa có máy B; nhiều browser trên một máy không thay phép kiểm này |
| Âm thanh phát ra loa/tai nghe | NOT_RUN | API chạy hoặc test fixture không chứng minh người dùng nghe được |
| Đánh giá tiện dụng và nghiệm thu giảng viên | NOT_RUN | Cần người dùng làm quy trình và ghi nhận xét/chấp thuận |
| Thông tin nhóm, bìa/phân công, Word, Compilatio và nộp bài | Giữ chờ theo phạm vi trước | Không phải điều kiện để bắt đầu code tính năng trên môi trường thử riêng |
| Mức tải 14 khách/nhịp một flow mỗi khách mỗi giây | Giới hạn đã ghi nhận | 94 slot chưa phát trong run đã lưu; chưa có bản sửa hiệu năng hoặc phép đo mới trong bước chuẩn bị này |

Các việc cần người/thiết bị không thể được hoàn thành bằng cách chạy lại các test mô phỏng. Kết quả UAT sau này chỉ áp dụng cho đúng thiết bị, phiên bản/hash và môi trường được ghi.

## 4. Kiểm thiết bị khi người dùng sẵn sàng

```powershell
cd D:\BTL-LTM\dist\CafeLink-Device-UAT-V9.4-20261030
.\START-PUBLIC.cmd
```

Đợi HTTPS/mật khẩu tạm, đăng nhập ở laptop, mở tất cả bàn và đưa QR Bàn 1 cho điện thoại. Làm `CHECKLIST.md`, điền `RESULTS.json`; giữ kết quả và dữ liệu local để duyệt trước khi công bố. Kit tự giới hạn public 30 phút và không dừng demo khác nếu cổng đang dùng. Muốn đổi cổng:

```powershell
.\Run-UAT.ps1 -Mode Public -Port 19688 -TcpPort 19658 -DurationSeconds 1800
```

Thử quầy/loa bằng `START-LOCAL.cmd` sau khi đã dừng public. Local mở `http://127.0.0.1:19588/admin`, dùng `admin / CafeLink@123`. Tạo kit mới bằng `cafelink-system/scripts/prepare-device-acceptance.ps1` nếu cần lần nghiệm thu sạch khác; công cụ từ chối ghi đè kit đã có.

## 5. Quy tắc cho lần cập nhật tiếp theo

1. Ghi hành vi mới, tác nhân và bất biến cần giữ. Bắt đầu nhánh/worktree từ checkpoint để không đụng DOCX và môi trường đang dùng.
2. Dùng DB/profile thử riêng. Giữ ID/receipt/scope, guard thanh toán, lịch sử giá và quyền khách khi thay tính năng có liên quan.
3. Kiểm ca mới và các ca hồi quy chịu ảnh hưởng, rồi chạy gate Java/web; kiểm engine/thiết bị liên quan khi đổi UI hoặc kết nối.
4. Commit/push theo phần đã kiểm. Khi đóng gói, bắt buộc khớp JAR/frontend với gate mới; tạo RC tiếp theo, giữ RC3 và checkpoint để đối chiếu.
5. Không mang kết quả vật lý, hiệu năng hoặc CI của RC3 sang bản khác nếu chưa xác minh tương ứng.
