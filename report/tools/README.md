# Công cụ báo cáo và bàn giao CafeLink V9.3

Chạy từ thư mục gốc workspace. Nội dung chính nằm ở [báo cáo cuối](../CafeLink_Final_Report.md); các mục còn chờ nằm ở [trạng thái bàn giao](../SUBMISSION_READINESS.md).

```powershell
python -m pip install -r report/tools/requirements-final.txt
python report/tools/build_final_report.py
python report/tools/export_final_report.py --source report/CafeLink_Final_Report.md --output report/NhomXX_CafeLink_Report.docx
powershell -NoProfile -ExecutionPolicy Bypass -File report/tools/render_final_report.ps1 -Docx report/NhomXX_CafeLink_Report.docx -Pdf report/NhomXX_CafeLink_Report.pdf -SummaryPath .cleanup/word-render.json
```

- `build_final_report.py`: đọc evidence đã giữ, tạo Markdown và hình từ template.
- `export_final_report.py`: xuất DOCX từ Markdown; kiểm lại bố cục trước khi dùng.
- `render_final_report.ps1`: cập nhật mục lục, lưu DOCX và xuất PDF bằng Word trên Windows; cần cài Microsoft Word. Chạy khi đã đóng tài liệu đang sửa.
- `package_submission.py --bundle dist/TEN_RC_MOI`: tạo bộ source/report/runtime tại đường dẫn mới, kiểm nội dung và ghi manifest. Giữ ZIP V9.3 và ZIP baseline E0 trong `dist/` để công cụ hoạt động.

Bộ RC1 đã chốt được giữ nguyên. Nếu sửa nội dung hoặc source, tạo RC mới và chạy kiểm tra phù hợp. Công cụ thực nghiệm hiện tại nằm ở `cafelink-system/tools/` và `cafelink-system/scripts/experiment-web.ps1`.
