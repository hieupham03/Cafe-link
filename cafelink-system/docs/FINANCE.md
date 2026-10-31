# Thu chi và thuế hóa đơn

Mở **Quản lý → Thu chi & thuế** bằng tài khoản chủ quán (`ADMIN`). Khách không có quyền đọc sổ thu chi hay thay đổi cấu hình thuế.

## Báo cáo thu chi

- Chọn ngày bắt đầu và kết thúc theo giờ Việt Nam, tối đa 366 ngày; mặc định tháng hiện tại.
- Thu bán hàng lấy từ giao dịch đã thanh toán, gồm thuế. Đơn chưa trả tiền, giao dịch thất bại và giao dịch hủy không tạo doanh thu.
- Hoàn tiền được tính vào tổng chi ở ngày hoàn, đồng thời trừ thuế của đơn hoàn tại ngày đó. Giao dịch thu gốc vẫn giữ nguyên.
- Dùng **Ghi khoản thu / Ghi khoản chi** cho các khoản khác: nhóm do chủ quán nhập, số tiền nguyên VND, ngày, ghi chú.
- Bút toán sai có thể hủy kèm lý do. Lịch sử, người tạo và người hủy vẫn được lưu; bút toán hủy bị loại khỏi báo cáo.
- Báo cáo tính toàn bộ dữ liệu trong kỳ, độc lập với phân trang sổ. **Xuất CSV** tải số liệu từng ngày và dòng tổng, đọc được bằng Excel.
- Khi kết quả gửi chưa rõ, **Kiểm tra và tiếp tục** dùng lại mã yêu cầu đã lưu trong tab, tránh ghi trùng; tải lại tab vẫn giữ mã này.

Chênh lệch thu chi là dòng tiền trong kỳ, không phải lợi nhuận kế toán. Báo cáo phản ánh dữ liệu giả lập của ứng dụng, không thực hiện giao dịch ngân hàng.

## Thuế hóa đơn

Trong **Cấu hình thuế hóa đơn**, chủ quán có thể bật/tắt, đặt tên thuế, thuế suất 0–100% (hai chữ số thập phân) và chọn:

- **Cộng thuế vào giá món:** tiền hàng 100.000 đồng, thuế 8% → khách trả 108.000 đồng.
- **Giá món đã bao gồm thuế:** giá 100.000 đồng, thuế 8% → thuế 7.407 đồng, tiền trước thuế 92.593 đồng, khách trả 100.000 đồng.

Thuế làm tròn đến đồng trên tổng mỗi đơn. Máy chủ chốt tên, mức thuế, cách tính và số tiền khi nhận đơn. Đổi cấu hình chỉ tác động đơn mới; hóa đơn cũ và đơn đang chờ trả tiền giữ nguyên. Nếu cấu hình đổi giữa lúc xem giỏ và gửi đơn, máy chủ từ chối để khách xem lại tổng tiền.

Giỏ hàng hiển thị tổng sau thuế. Thanh toán, đơn đã gọi, hóa đơn thu ngân và chi tiết lịch sử cùng dùng số tiền đã chốt. Đây vẫn là hóa đơn nội bộ của bản demo, chưa tích hợp phát hành hóa đơn điện tử.

## Dữ liệu và API

Schema **12** bổ sung cấu hình `tax_config`, các cột thuế trên `orders` và bảng `cash_entries`. Khi nâng cấp schema 11, các đơn cũ giữ tiền hàng ban đầu với thuế bằng 0; mặc định tính thuế tắt. Không cần xóa database.

Các lệnh quản lý: `GET_TAX_SETTINGS`, `SAVE_TAX_SETTINGS`, `GET_FINANCE_REPORT`, `GET_CASH_ENTRIES`, `CREATE_CASH_ENTRY`, `VOID_CASH_ENTRY`. Các lệnh ghi dùng command receipt để chống trùng; lưu cấu hình có `expectedVersion`. Đặt đơn gửi `expectedTaxVersion` cùng phiên bản cấu hình đang hiển thị.

Kiểm thử: `FinanceTest` (tính thuế, phân quyền, chống trùng, hoàn tiền/ngày, phân trang, thanh toán sau, migration) và `web/tests/finance.spec.ts` (thao tác chủ quán, khách, hóa đơn, xuất CSV, mobile, mất phản hồi).
