# Tích hợp đóng góp CafeLink

Lịch sử Git giữ nguyên tác giả và thời điểm commit gốc. Bản nộp dùng một triển khai nghiệp vụ thống nhất; không giữ module/API cũ chỉ để tăng số file hoặc ghi công sai thực tế.

| Tác giả Git | Phần được tích hợp | Nguồn |
|---|---|---|
| PhamHieu | Nền tảng và bản local V10.1: tiếp nhận trước thanh toán, UI, thuế/thu chi hiện hành, phân quyền/thu hồi phiên, phục hồi; tích hợp các nhánh | Các commit triển khai trong lịch sử main |
| KMorty99 | Nhánh tài chính/thuế; giữ commit gốc và chuyển 7 kịch bản `FinanceTest` sang API V10.1: snapshot hóa đơn, quyền, lưu bền/chống trùng, ngày thu/hoàn, phân trang, trả sau và migration | [ada0b948](https://github.com/hieupham03/Cafe-link/commit/ada0b94873a5bf492b15a798d709e6c9da3e557c) |
| quanghuy | 8 ảnh đồ uống được đưa vào thực đơn chạy thật, giữ nguyên byte ảnh gốc và chuyển vào tài nguyên web | [4d4fe865](https://github.com/hieupham03/Cafe-link/commit/4d4fe865843e05a0118892077d9ce03fc809760d) |

Ảnh ở `cafelink-system/web/public/images/menu/`. Ảnh tải lên được ưu tiên; món mẫu đổi tên không tự dùng lại ảnh cũ. Không chỉnh ngày, giả tác giả hoặc gắn co-author cho phần chưa xác nhận. Bảng ghi nguồn tích hợp, không thay xác nhận phần việc khi bảo vệ.

`Finance.java`/`FinanceDashboard` dùng contract cũ, được thay bởi `StoreFinance`/`FinanceReport` đã kiểm ở bản local. Các luồng browser tương ứng có trong `v10.spec.ts`, không giữ E2E gọi API cũ. CafeLive đang tạm dừng và không thuộc bản công bố.
