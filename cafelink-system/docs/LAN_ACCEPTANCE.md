# Nghiệm thu LAN hai máy — TCP client desktop đối chứng

Tài liệu này dành cho luồng desktop gốc còn giữ trong source để đối chứng. Demo chính V9.4 dùng browser và Gateway; xem [FINAL_RUNBOOK](FINAL_RUNBOOK.md) cho local/public và [bộ nghiệm thu thiết bị](WEB_DEVICE_ACCEPTANCE.md) để kiểm điện thoại. Luồng LAN desktop ở đây có dữ liệu/tài khoản riêng, không thay nghiệm thu website hoặc public tunnel.

**Trạng thái: NOT RUN.** Người dùng xác nhận hiện chỉ có một máy. Các kết quả hiện có chạy TCP loopback; nhiều JVM không thay thế hai máy vật lý. Script `lan-check.ps1` chỉ kiểm tra mở kết nối, không xác nhận nghiệp vụ.

## Chuẩn bị

Hai máy Windows cùng mạng riêng, có Java theo launcher source; bản đóng gói chứa JAR + `target/lib` nên không cần tải Maven/dependency để chạy. Chạy `scripts/verify-package.ps1` trước sử dụng. JDK 24.0.2 đã kiểm; năm ca desktop Swing cũng đã đạt trên JRE 17.0.20.1 trong [kiểm phần 4](../../report/evidence/cafelink-v2/v9.4-hardening/phase4-ui-ordering/summary.json). Các phép kiểm đó dùng loopback, chưa xác nhận hai máy LAN. Ghi OS/Java/IP và loại kết nối Wi-Fi/Ethernet vào biên bản.

Giải nén vào đường dẫn ASCII, có thể có khoảng trắng như `D:\CafeLink Demo\`. Trên máy kiểm tra JDK24/Windows Cp1252, tên thư mục tiếng Việt làm hỏng tham số launcher; ca này chưa đạt, không coi là được hỗ trợ.

Trên máy A, dùng `ipconfig` lấy IPv4 của adapter đang dùng. Trong thư mục `cafelink-system`, chạy:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-server.ps1 -BindAddress 0.0.0.0 -Port 5050 -DatabasePath data/lan-acceptance.db
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-client.ps1 -Username admin
```

Trên máy B, thay `192.168.1.10` bằng IP của A:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lan-check.ps1 -ServerAddress 192.168.1.10 -Port 5050 -OutputFile lan-connectivity.json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-client.ps1 -ServerAddress 192.168.1.10 -Username ban1
```

Nếu probe không kết nối: xác nhận IP/cổng, server bind `0.0.0.0`, mạng Private và firewall cho Java/cổng TCP đã chọn; kiểm tra AP client isolation/VPN. Bộ script không tự thay firewall hoặc dừng ứng dụng khác. TCP demo chưa mã hóa; dùng tài khoản demo trên LAN.

## Biên bản cần điền khi có máy B

| Ca | Thao tác và kết quả mong đợi | Kết quả thực tế |
|---|---|---|
| L01 | Sai mật khẩu bị từ chối; guest không mở bàn/đọc bàn khác | NOT RUN |
| L02 | A mở bàn 1; B nhận cập nhật, đặt 2 cà phê sữa = 60.000 VND; A thấy đúng đơn | NOT RUN |
| L03 | A chuyển đủ 4 trạng thái; B nhận tiến độ không bấm refresh | NOT RUN |
| L04 | B gọi phục vụ/yêu cầu tính tiền; A trả lời; B nhận phản hồi | NOT RUN |
| L05 | Tắt Wi-Fi B hoặc rút cáp: guest báo ngắt và khóa mutation; bật lại, đăng nhập lại chủ động; dữ liệu cũ còn | NOT RUN |
| L06 | Mất ACK sau commit: chạy DB riêng với `-Fault drop-order-ack`; B đặt rồi đăng nhập lại; chỉ một đơn | NOT RUN |
| L07 | Chưa nhận lời gọi: DB riêng với `-Fault drop-service-before`; B gọi, A đóng bàn trống/mở lượt mới, B đăng nhập lại; ý định cũ STALE, không xuất hiện ở lượt mới | NOT RUN |
| L08 | Phục vụ hết đơn và xử lý ticket; A thanh toán; B thấy kết thúc lượt; tổng bằng giá server | NOT RUN |
| L09 | Dừng server rồi mở lại cùng DB; các đơn/ticket/payment được giữ | NOT RUN |

Mỗi ca ghi thời điểm, số đơn/ticket, ID lượt và ảnh hai màn hình. L06/L07 là fault tại tầng ứng dụng; L05 là ngắt mạng thật. Không xem chúng là cùng một loại thử nghiệm. Dùng DB mới riêng cho từng fault demo; giữ journal cũ để kiểm tra phục hồi, không xóa để né lỗi. Khi mở lại terminal cho khách mới, dùng “Bắt đầu lượt khách mới” đúng điều kiện lượt cũ đã đóng.

Khi xong, lưu biên bản và log đã loại credential/password vào `report/evidence/lan-acceptance/`. Không đưa file `data/client-state/*.json` lên sheet/repo. Chưa có biên bản thực tế thì giữ trạng thái NOT RUN.
