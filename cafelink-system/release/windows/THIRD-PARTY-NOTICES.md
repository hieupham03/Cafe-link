# Thành phần đi kèm

- **Eclipse Temurin JRE 17:** version/nguồn/SHA256 trong `RELEASE.json`; giữ nguyên `runtime/NOTICE` và toàn bộ `runtime/legal/` từ archive upstream.
- **Cloudflare cloudflared 2026.10.3:** khi có sẵn trong `.tools`, SHA256 được launcher kiểm trước khi chạy. Bản LICENSE upstream đi kèm ở `third-party/cloudflared/LICENSE`; nguồn `https://github.com/cloudflare/cloudflared/blob/2026.10.3/LICENSE`.
- **Thư viện Java:** tên/version và hash trong manifest, metadata/legal upstream nằm trong các JAR ở `target/lib`. Bao gồm Jetty, Gson, SQLite JDBC, SLF4J và annotation phụ thuộc.
- **Thư viện web:** React, React DOM và qrcode.react được build vào assets; license/notice đầu ra Vite được giữ nguyên theo bundle. Source lockfile trong workspace ghi phiên bản dùng khi build.

Tài liệu này là chỉ dẫn vị trí thành phần/notice, không thay văn bản license upstream. Dữ liệu demo và backup tạo khi chạy không thuộc bộ source/runtime pristine.
