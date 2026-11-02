# ADR-008 — QR cố định, phiên riêng và public demo

**Ngày:** 22/10/2026. **Trạng thái:** Accepted. Người dùng đã chọn rõ: “QR cố định, đơn/phiên riêng từng điện thoại; bàn tự vận hành”. Quyết định này thay QR theo lượt bàn và đóng/mở thủ công cho luồng AUTO, giữ luồng MANUAL để hoàn tất dữ liệu cũ và chạy đối chứng.

## Quyết định

1. Bàn là địa chỉ giao đồ. `table_access` giữ secret cố định theo bàn, hash để tra cứu, ciphertext AES để cấp lại QR; không lưu secret thô. Không dùng một visit chung cho mọi khách quét cùng bàn.
2. `JOIN_TABLE` cấp visit AUTO/PREPAY và membership riêng cho trình duyệt mới. Quét lại bằng cookie còn hiệu lực phải xác nhận đúng bàn/visit đang hoạt động, giữ nguyên membership. Không âm thầm thay quyền khi visit đã đóng hoặc QR thuộc bàn khác.
3. Schema 9 thêm `visits.service_mode`, thay unique-index active visit bằng unique chỉ cho MANUAL. Một bàn có nhiều AUTO visit nhưng snapshot quản lý vẫn đúng một dòng/bàn. Guest query luôn giới hạn visit/membership; receipt và event không mở phạm vi theo table_id.
4. `OPEN_ALL_TABLES` bật nhận khách một lần, gọi lại không reset QR/phiên/đơn. Chặn bật khi còn MANUAL visit đang mở để tránh thay nghĩa dữ liệu cũ. `SET_TABLE_ACCEPTING` chỉ chặn khách mới, không gián đoạn công việc đã nhận.
5. AUTO visit không tự đóng khi đơn/hỗ trợ hoàn tất; khách có thể tiếp tục gọi trong cùng visit. Chỉ khách rời phiên sau khi hết việc, hoặc quản lý kết thúc các phiên của bàn sau khi xác nhận không còn việc, mới đóng visit. Không dựa vào socket online/offline để suy luận khách rời ghế.
6. Gọi món tiếp tục dùng cùng scope và giữ lịch sử/giỏ nháp; không chuyển sang visit mới sau mỗi đơn. `GET_OWN_TABLE_QR` kiểm scope tại Gateway để tab của phiên cũ không thao tác sau khi quyền đã bị thu hồi.
7. Secret bàn tồn tại qua restart cùng DB/key; URL QR gồm public origin. Quick Tunnel đổi hostname khi khởi động lại, vì vậy không hứa QR in dùng vĩnh viễn. Domain cố định là bước triển khai khác.

## Triển khai Internet

```text
Điện thoại / trình duyệt
        │ HTTPS + WSS
        ▼
Cloudflare Quick Tunnel ── outbound tunnel ── cloudflared trên laptop
                                                │ HTTP loopback
                                                ▼
                                          Java Gateway
                                                │ TCP loopback
                                                ▼
                                           TCP Core / SQLite
```

Proxy mode phải bật tường minh, bind loopback và cấu hình public HTTPS origin. Cookie Secure/HttpOnly/SameSite=Strict, CSRF và kiểm Origin vẫn áp dụng. Không lấy `X-Forwarded-Proto` hoặc Host tùy ý làm căn cứ tin cậy. Không public trực tiếp TCP Core. Lớp tunnel không thay business transport Gateway → TCP Core.

Launcher dùng DB demo riêng mặc định, cloudflared 2026.10.3 pin SHA-256 từ official release asset; khởi động process ẩn, chỉ dọn PID do mình tạo, thử cấp URL tối đa 3 lần, kiểm local/public health. Mật khẩu quản lý được tạo ngẫu nhiên và truyền cho JVM qua environment, chỉ in ra terminal; không đặt trong command arguments hay file startup info. Password hash được cập nhật trên DB public demo khi khởi động.

Nguồn: [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), [Cloudflare Tunnel FAQ](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/), [release cloudflared 2026.10.3](https://github.com/cloudflare/cloudflared/releases/tag/2026.10.3).

## Đánh đổi và giới hạn

- “Từng điện thoại” thực chất là từng browser profile/cookie: hai tab cùng profile dùng chung phiên; xóa cookie/đổi browser tạo người dùng mới. Không nhận diện phần cứng.
- QR cố định là quyền công khai vào địa chỉ bàn, không chứng minh người quét đang ngồi tại quán. Không cho nó quyền đọc visit người khác. Có thể cần QR rotation/duyệt đơn/kiểm soát lạm dụng nếu triển khai thật.
- Không có hóa đơn chung cho nhóm khách, chia tiền, theo dõi ghế trống hay gộp nhiều điện thoại vào một lượt. Đây là lựa chọn sản phẩm đã được người dùng chốt.
- Gateway giới hạn 16 web sessions, Core 32 TCP connections. Sau proxy, rate budget theo địa chỉ loopback tổng hợp; không tin header IP tự khai để vượt hạn. Không khẳng định hỗ trợ lượng khách sản xuất lớn.
- Phiên bỏ dở không tự đóng theo giờ; quản lý dùng **Kết thúc phiên** để dọn các phiên đã hết việc. Tối đa 512 active AUTO visits. Chưa có job tự hủy đơn không thanh toán; không chặn lượt khách mới chỉ vì khách trước chưa hoàn tất.
- Internet demo phụ thuộc laptop/Cloudflare/mạng. Quick Tunnel không có SLA; vẫn giữ demo localhost. Thanh toán tiếp tục giả lập, không có tiền thật.

## Kiểm chứng

`AutomaticTablesTest`, `BusinessWorkflowTest`, `QrWebIntegrationTest`, `ProxyGatewayTest` và `automatic.spec.ts` kiểm quyền riêng, stable QR/restart, giữ migration V8, mở toàn quán không reset, pause, cancellation, payment/support barriers, scope cũ, hồi phục mất phản hồi, phiên còn hoạt động sau khi giao món, khách rời phiên và quản lý kết thúc phiên. Full regression giữ nguyên các demo MANUAL V1–V7. Smoke public xác minh HTTPS, WSS, secure browser APIs, cookie và thanh toán thử; tách khỏi nghiệm thu camera/điện thoại thật.

## Cập nhật vòng đời phiên

Luồng AUTO được cập nhật theo yêu cầu vận hành: giao dịch đã thanh toán/giao xong không tự kết thúc phiên; khách vẫn có thể ở lại và gọi tiếp trong cùng visit. Khách rời phiên sẽ đóng visit sau khi các đơn và hỗ trợ đã hoàn tất. Nếu khách quên, quản lý có thể kết thúc tất cả phiên của bàn trong chi tiết bàn; thao tác bị chặn khi còn đơn chưa thanh toán/chưa giao hoặc hỗ trợ đang mở, đồng thời thu hồi quyền truy cập của các thiết bị trong những phiên đó. Bàn không còn phiên hoạt động sẽ hiện **Bàn trống · Đang nhận đơn** khi QR vẫn bật.
