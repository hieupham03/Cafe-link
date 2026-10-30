# CafeLink V9.4 - Nghiệm thu thiết bị trước khi cập nhật tính năng

Bộ kiểm phần mềm của RC3 đã đạt; các ca dưới đây vẫn **NOT_RUN cho tới khi người kiểm thực hiện thật**. Không cần hoàn thành bìa/Compilatio để tạo mốc source trước nâng cấp. Các công việc nộp môn vẫn được theo dõi riêng.

## Chuẩn bị một lần

Tại `cafelink-system`, tạo kit từ archive RC3 đã xác minh:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-device-acceptance.ps1
```

Lệnh kiểm SHA-256, phiên bản/schema và đường dẫn ZIP, giải nén sang thư mục mới trong `dist/CafeLink-Device-UAT-V9.4-*`. Có JRE đi kèm, launcher, checklist và `RESULTS.json` trống. Không lấy DB/key/media từ các profile đang dùng. Kit không ghi đè thư mục cũ hoặc tự đổi kết quả vật lý thành PASS.

1. Mở `START-PUBLIC.cmd` trong kit. Chờ terminal in HTTPS và mật khẩu tạm.
2. Laptop đăng nhập đúng HTTPS, mở tất cả bàn, chọn Bàn 1 và hiển thị QR.
3. Điện thoại A dùng camera quét QR. Không gõ 127.0.0.1 của laptop trên điện thoại.
4. Ghi thiết bị, hệ điều hành, browser/phiên bản, mạng, người kiểm và thời điểm trong `RESULTS.json`.

Để kiểm local/loa, dừng public bằng Ctrl+C rồi chạy `START-LOCAL.cmd`; mở `http://127.0.0.1:19588/admin`, dùng `admin / CafeLink@123`. Hai chế độ dùng DB riêng trong kit. Public mặc định dừng sau 30 phút. Cổng đã dùng thì chọn cặp khác qua `Run-UAT.ps1`; không dừng tiến trình theo PID tìm được từ cổng.

## Các ca cần người kiểm

| Mã | Thực hiện | Điều kiện để ghi PASS |
|---|---|---|
| P01 | A tắt Wi-Fi, dùng 4G/5G, quét QR; chọn món, xem giỏ, thanh toán giả lập; quầy chuyển đủ trạng thái | Đúng bàn/món/tổng tiền; quầy chỉ pha chế sau PAID; điện thoại nhận tiến độ và kết thúc phiên |
| P02 | Hai thiết bị/browser độc lập cùng quét QR Bàn 1; A đặt món và gửi hỗ trợ, B xem trang của mình | Cùng địa chỉ bàn nhưng khác đơn/giỏ/hỗ trợ. Hai tab trong một profile không tính là hai thiết bị độc lập |
| P03 | Trên màn nhỏ: tìm món, mở chi tiết, nhập ghi chú, tăng/giảm/xóa, xoay ngang, mở bàn phím; đi qua năm vùng | Không tràn ngang/che nút; tổng và ghi chú đúng; có thể đóng hộp thoại, trở lại giỏ và tiếp tục |
| P04 | Khi có giỏ nháp và một đơn đang xử lý, bật chế độ máy bay; chờ báo lỗi, bật lại và đối chiếu | Giữ nháp, có đường kết nối lại; không tự đặt thêm đơn; đơn đã được nhận vẫn theo dõi được. Không mặc định mất mạng đã tạo đúng ranh giới mất ACK |
| P05 | Với đơn mới: thanh toán thử FAILED/CANCELLED, thử lại SUCCESS; bấm nhanh khi đang chờ; tải lại | Không PAID do thất bại; thử lại giao dịch không tạo đơn mới; số đơn và lịch sử thu tiền đúng |
| P06 | Đang theo dõi đơn thì đưa browser xuống nền/khóa màn hình; mở lại/reload; hoàn tất rồi bắt đầu lần đặt mới | Đồng bộ lại đúng trạng thái, giữ nháp đúng phiên; không lộ đơn của thiết bị còn lại |
| A01 | Trên laptop có loa/tai nghe: bật chuông, chỉnh âm lượng vừa nghe, phát thử; tạo yêu cầu từ khách; tắt rồi reload/kích hoạt lại | Người kiểm nghe được và xác nhận thao tác tắt/bật. Chỉ thấy AudioContext chạy không đủ để xác nhận loa thật |
| L01 | Khi có máy B, làm [runbook LAN trong source checkpoint](https://github.com/hieupham03/Cafe-link/blob/checkpoint/v9.4-before-features-20261030/cafelink-system/docs/LAN_ACCEPTANCE.md) bằng hai máy cùng LAN | Ghi máy/IP/JDK/cổng và thực hiện trực tiếp client-server. Hai browser một máy hoặc truy cập qua public tunnel không thay phép thử này |
| U01 | Một người đóng vai khách và một người dùng quầy, tự làm toàn bộ luồng mà không cần đọc code | Ghi rõ thao tác khó hiểu/lỗi. PASS chỉ sau khi người dùng thực hiện và chấp nhận; không tự ghi thay giảng viên |

P01-P06 cần ghi kết quả cho từng loại thiết bị thực có. Không có iPhone thì ghi thiếu Safari/iOS; một Android không đại diện cho mọi điện thoại. Không có máy B thì giữ L01 NOT_RUN. Nếu có cảnh báo audio vì browser/thiết bị không phát được, ghi rõ trường hợp đó; không đổi thành đã nghe được âm thanh.

## Ghi kết quả và xử lý lỗi

Trong `RESULTS.json`, điền `reviewer`, `devices` và từng ca: `result` = PASS/FAIL/NOT_RUN, `testedAt`, `device`, `browser`, `network`, `observations`. Các trạng thái tổng `physicalPhone`, `physicalLan`, `audibleSpeakerOutput` chỉ đổi khi có các ca tương ứng và người kiểm xác nhận phạm vi thực tế. Sử dụng `PARTIAL` nếu còn thiếu loại thiết bị hoặc một số ca chưa làm; không gộp tất cả thành PASS.

Khi báo lỗi, ghi mã ca, bước đã bấm, mong đợi/thực tế và thông báo. Có thể ghi số đơn/ticket để đối chiếu tại quầy. Giữ dữ liệu của ca lỗi để kiểm lại kết quả chưa rõ; không xóa journal/đặt đơn mới thay thế để làm mất dấu vết. Tạo kit mới khi cần một lần chạy sạch khác.

`RESULTS.json` và dữ liệu kit giữ local để người dùng duyệt trước khi công bố. Không gửi mật khẩu tạm, QR đang hoạt động, cookie, DB/key hoặc backup chứa quyền phiên lên GitHub. Thanh toán vẫn là giả lập; không dùng thông tin ngân hàng thật.

## Mốc source trước tính năng mới

Checkpoint Git bảo vệ source đã commit; RC3 ZIP bảo vệ bản chạy đã kiểm. Mốc này không đóng băng DOCX người dùng đang sửa và không đổi các kết quả vật lý còn chờ. Trước sửa tính năng: nhánh/worktree riêng từ checkpoint, mô tả hành vi cần đổi và bất biến cần giữ; sau sửa chạy test liên quan, rồi gate đầy đủ trước đóng gói. [Trạng thái chuẩn bị source tại checkpoint](https://github.com/hieupham03/Cafe-link/blob/checkpoint/v9.4-before-features-20261030/report/CafeLink_PreFeature_Readiness_20261030.md) ghi mốc và hash thực tế.
