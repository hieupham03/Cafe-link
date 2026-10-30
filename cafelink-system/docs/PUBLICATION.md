# CafeLink V9.4 - Kiểm tra nội dung công bố

Các bước này kiểm source thực sự được đưa lên GitHub hoặc xuất thành ZIP, cùng tài liệu trong gói portable. File nháp còn ở máy local không được dùng để bù cho file thiếu trong bản công bố.

## Nguồn cấu hình

`release/documentation.json` xác định phiên bản, schema, gói đã kiểm và danh sách hướng dẫn đi kèm portable. Script đóng gói và bộ kiểm dùng chung file này. Phiên bản được đối chiếu với `ApplicationInfo.VERSION`.

GitHub giữ một cặp Word/PDF cùng tên cơ sở. Hai README chính phải trỏ đúng cặp này; hash phải khớp phiếu kiểm báo cáo được cấu hình trong policy. Khi đổi Word, cần xuất lại PDF và kiểm cặp mới trước khi cập nhật phiếu.

## Kiểm bản chuẩn bị push

Tại `cafelink-system`, sau khi stage đúng các thay đổi muốn công bố:

```powershell
python tools/verify_publication.py --root .. --index
python -m unittest discover -s tools -p test_publication.py -v
```

`--index` đọc nội dung đã stage, không lấy bản nháp hoặc thay đổi chưa stage. Với ZIP source vừa giải nén, bỏ `--index`, thêm `--pristine` và đặt `--root` tới gốc source. Chế độ này kiểm cả cache bị đóng nhầm vào ZIP, không cần `.git`. Khi kiểm lại source sau build, không dùng `--pristine`: dependency và output do build tạo ra được bỏ qua, còn hướng dẫn và báo cáo vẫn được kiểm.

| Lỗi bị chặn | Việc cần sửa |
|---|---|
| Hướng dẫn cũ xuất hiện lại, hoặc lệnh chọn phiên bản/RC cũ | Cập nhật hướng dẫn hiện hành và danh sách công bố |
| Liên kết chỉ tồn tại nhờ file local | Đưa đúng tài liệu cần thiết vào Git hoặc sửa liên kết tới tài liệu đã công bố |
| Thiếu file/tiêu đề được liên kết | Sửa đường dẫn hoặc tiêu đề trong cùng bản công bố |
| Nhiều cặp Word/PDF, cặp tên khác nhau, hash không khớp | Chọn một cặp đã xuất và kiểm đồng bộ; giữ bản cũ local |
| Công cụ biên soạn, skill AI hoặc bản nháp bị stage | Bỏ các file đó khỏi index và giữ quy tắc ignore |
| Script đóng gói bỏ qua policy | Dùng danh sách hướng dẫn chung thay cho danh sách riêng |

## Kiểm gói portable

Sau khi tạo và giải nén một gói mới, thay đường dẫn ví dụ bằng thư mục gói thực tế:

```powershell
python tools/verify_publication.py --package '..\dist\THU_MUC_GOI_DA_GIAI_NEN'
```

Bộ kiểm đối chiếu `RELEASE.json`, `docs/DOCUMENTATION.json`, danh sách hướng dẫn, tiêu đề, lệnh chạy và liên kết. Liên kết giữa các file đi kèm gói được giữ local; tài liệu chỉ có trong repo được chuyển thành URL GitHub. Các hướng dẫn chạy chính vẫn đọc được offline.

`Verify-Package.ps1` kiểm hash và chặn file thêm ngoài manifest trong thư mục `docs`, tương tự mã thực thi và assets. Không cần Python trên máy chỉ chạy gói portable.

## CI

Workflow chạy lại khi source, README, báo cáo chính, hình minh họa hoặc bộ yêu cầu thay đổi. `scripts/test-v8.ps1` chạy guard công bố và các ca hồi quy trước bộ kiểm Java/web/thực nghiệm. Tên script V8 được giữ để tương thích; policy xác định phiên bản ứng dụng hiện hành.

Dữ liệu đo của các mốc cũ và baseline E0 được giữ để đối chiếu, không phải các bản hướng dẫn chạy để người dùng lựa chọn. Khi cập nhật phiên bản, sửa policy và tài liệu liên quan trong cùng thay đổi; không sửa dữ liệu thực nghiệm cũ thành kết quả của phiên bản mới.
