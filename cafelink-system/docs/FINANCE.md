# CafeLink V10.1 - Thu chi và thuế

ADMIN mở **Thu chi** để xem dòng tiền, ghi/hủy phiếu chi và xuất CSV; mở **Cài đặt quán** để đặt tên, tỷ lệ và cách tính thuế. STAFF và khách không có các quyền này.

- Đơn phải được quầy tiếp nhận trước khi khách thanh toán. Đơn chưa trả, giao dịch thất bại/hủy không tạo khoản thu.
- Thuế ngoài giá: 100.000 đồng + 8% = 108.000 đồng. Thuế trong giá: tổng 100.000 đồng gồm thuế 7.407 đồng. Đây là ví dụ cấu hình, không phải mức thuế bắt buộc.
- Tiền dùng số nguyên VND, làm tròn trên mỗi đơn. Tên, tỷ lệ, cách tính và số tiền được chốt khi gửi đơn. Đổi cấu hình chỉ tác động đơn mới; giỏ cũ phải xem lại tổng.
- Báo cáo theo ngày Việt Nam, tối đa 366 ngày. Thu giữ ngày thanh toán gốc; hoàn trừ ở ngày hoàn. Phiếu chi cần số tiền, nhóm, nội dung và ngày không nằm trong tương lai.
- Hủy phiếu giữ dòng gốc và lý do. Tổng kỳ tính toàn bộ dữ liệu, độc lập với trang 50 phiếu đang xem. Chênh lệch dòng tiền chưa phải lợi nhuận kế toán.
- Mất phản hồi: journal/receipt giữ mã thao tác; tra kết quả trước khi quyết định gửi lại, không tạo khoản chi mới để thay thao tác chưa rõ kết quả.

`StoreFinance.java`, `FinanceReport.tsx`, `TaxSettingsPanel.tsx`, `OrderTotals.tsx` là các thành phần hiện hành. Lệnh: `GET_TAX_SETTINGS`, `SAVE_TAX_SETTINGS`, `GET_FINANCE_REPORT`, `CREATE_EXPENSE`, `VOID_EXPENSE`. Lưu thuế có `expectedVersion`; giỏ gửi `expectedTaxVersion`. Schema hiện hành 13.

7 kịch bản `FinanceTest` từ nhánh thành viên được chuyển sang contract hiện tại; browser được kiểm trong `v10.spec.ts`. Không giữ hai sổ/CSS/tính thuế song song. Lịch sử hợp nhất được lưu trong Git. [Quyền](UPGRADE_V10_1_ROLES.md) · [Giao thức](FINAL_PROTOCOL.md). Thanh toán/hoàn vẫn giả lập.
