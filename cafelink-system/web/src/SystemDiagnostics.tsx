import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { DiagnosticsSnapshot } from "./models";
import "./system-diagnostics.css";

const number = (value: number) => value.toLocaleString("vi-VN");
const ms = (value: number) => `${value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ms`;
const memory = (value: number) => value < 0 ? "Chưa xác định" : `${(value / 1024 / 1024).toFixed(1)} MiB`;
const time = (value: string) => new Date(value).toLocaleTimeString("vi-VN");

export function SystemDiagnosticsPanel() {
  const [data, setData] = useState<DiagnosticsSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const generation = useRef(0);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const own = ++generation.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    pending.current = true;
    setBusy(true);
    try {
      const snapshot = await api.diagnostics(request.signal);
      if (own !== generation.current) return;
      setData(snapshot);
      setError("");
    } catch (failure) {
      if (own === generation.current) setError((failure as Error).message);
    } finally {
      if (own === generation.current) { pending.current = false; setBusy(false); }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const check = () => { if (!document.hidden && !pending.current) void refresh(); };
    const interval = window.setInterval(check, 5000);
    document.addEventListener("visibilitychange", check);
    return () => {
      ++generation.current;
      controller.current?.abort();
      pending.current = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
    };
  }, [refresh]);

  const rows = data?.core.recent.filter((row) =>
    `${row.requestId} ${row.action} ${row.outcome}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [];

  return <section className="system-diagnostics" aria-label="Chẩn đoán hệ thống" aria-busy={busy}>
    <div className="diagnostic-toolbar">
      <div><h2>Tình trạng phục vụ</h2><p className="muted">Tự cập nhật mỗi 5 giây khi trang đang hiển thị. Chỉ quản lý được xem.</p></div>
      <button className="secondary" onClick={() => void refresh()} disabled={busy}>{busy ? "Đang kiểm tra..." : "Làm mới chẩn đoán"}</button>
    </div>
    {error && <div className="warning diagnostic-alert" role="alert">
      <strong>Chưa cập nhật được chẩn đoán</strong><p>{error}</p>
      {data && <p>Dữ liệu bên dưới là lần kiểm lúc {time(data.sampledAt)}, chưa xác nhận trạng thái hiện tại.</p>}
    </div>}
    {!data && !error && <p role="status">Đang kiểm tra Gateway, TCP Core và cơ sở dữ liệu...</p>}
    {data && <>
      <div className={`diagnostic-readiness ${error ? "stale" : data.readiness.status === "READY" ? "ready" : "not-ready"}`} role="status">
        <strong>{error ? "Dữ liệu lần kiểm trước" : data.readiness.status === "READY" ? "Hệ thống sẵn sàng phục vụ" : "Hệ thống chưa sẵn sàng phục vụ"}</strong>
        <span>Gateway: {data.readiness.gateway} · TCP Core: {data.readiness.core} · DB: {data.readiness.database}</span>
        <small>{data.version} · Đọc số liệu lúc {time(data.sampledAt)} · Kiểm phụ thuộc lúc {time(data.readiness.checkedAt)}</small>
      </div>
      <div className="diagnostic-cards">
        <article><span>Kết nối TCP đang mở</span><strong>{number(data.core.connections)}</strong><small>{number(data.core.authenticatedConnections)} kết nối đã xác thực</small></article>
        <article><span>Phiên web đang giữ</span><strong>{number(data.gateway.sessions)} / {data.gateway.sessionLimit}</strong><small>{data.gateway.guestSessions} khách · {data.gateway.adminSessions} quản lý</small></article>
        <article><span>Yêu cầu Core đã xử lý</span><strong>{number(data.core.requests)}</strong><small>Không tính PING và thao tác giám sát</small></article>
        <article><span>Yêu cầu bị từ chối hoặc lỗi</span><strong>{number(data.core.errors)}</strong><small>Tính cả lỗi quyền và dữ liệu không hợp lệ</small></article>
      </div>
      <div className="diagnostic-details">
        <article><h3>Kết nối và hàng đợi</h3><dl>
          <dt>Reader đang dùng / giới hạn</dt><dd>{data.core.readerActive} / {data.core.readerLimit}</dd>
          <dt>Bản tin đang đợi gửi</dt><dd>{data.core.outboundQueuedMessages}</dd>
          <dt>Giới hạn hàng đợi mỗi kết nối</dt><dd>{data.core.outboundQueueLimitPerConnection}</dd>
          <dt>Đóng kết nối chậm do đầy hàng đợi</dt><dd>{data.core.slowDisconnects}</dd>
          <dt>Lỗi đọc kết nối</dt><dd>{data.core.readFailures}</dd>
          <dt>WebSocket / lệnh web đang chờ</dt><dd>{data.gateway.webSockets} / {data.gateway.inFlight}</dd>
        </dl></article>
        <article><h3>Thời gian xử lý và tiến trình Java</h3><dl>
          <dt>Thời gian xử lý Core trung bình</dt><dd>{ms(data.core.averageDispatchMs)}</dd>
          <dt>Thời gian xử lý Core lớn nhất</dt><dd>{ms(data.core.maxDispatchMs)}</dd>
          <dt>Bộ nhớ heap đang dùng</dt><dd>{memory(data.jvm.heapUsedBytes)}</dd>
          <dt>Giới hạn heap</dt><dd>{memory(data.jvm.heapMaxBytes)}</dd>
          <dt>Số thread trong JVM</dt><dd>{data.jvm.threads}</dd>
          <dt>Thời gian từ khi tạo Core</dt><dd>{Math.floor(data.core.uptimeMs / 1000)} giây</dd>
        </dl><p className="muted">Số liệu JVM gồm cả Gateway và Core trong cùng tiến trình. Thời gian Core chưa gồm truyền mạng hoặc hiển thị.</p></article>
      </div>
      <article className="diagnostic-trace"><h3>Yêu cầu TCP gần đây</h3>
        <label htmlFor="diagnostic-filter">Tìm mã yêu cầu, lệnh hoặc kết quả</label>
        <input id="diagnostic-filter" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder="Mã yêu cầu hoặc PLACE_ORDER" />
        <p className="muted">Giữ tối đa {data.core.traceCapacity} yêu cầu trong bộ nhớ, mới nhất ở trên. Không lưu nội dung món, mật khẩu, cookie hoặc mã QR. Mã khác định dạng UUID được thay bằng hash rút gọn.</p>
        <div className="diagnostic-table-scroll" tabIndex={0} role="region" aria-label="Lịch sử yêu cầu TCP"><table>
          <thead><tr><th>Thời gian</th><th>Mã yêu cầu</th><th>Lệnh</th><th>Vai trò</th><th>Kết quả Core</th><th>Xử lý tại Core</th></tr></thead>
          <tbody>{rows.map((row, index) => <tr key={`${row.at}-${row.requestId}-${index}`}>
            <td>{time(row.at)}</td><td><code>{row.requestId}</code></td><td><code>{row.action}</code></td>
            <td>{row.role === "ADMIN" ? "Quản lý" : row.role === "GUEST" ? "Khách" : "Chưa xác thực"}</td>
            <td>{row.outcome}</td><td>{ms(row.durationMs)}</td>
          </tr>)}</tbody>
        </table></div>
        {!rows.length && <p>Không có yêu cầu phù hợp.</p>}
        <p className="muted">Kết quả OK nghĩa là Core xử lý thành công, chưa chứng minh Browser đã nhận phản hồi. Bộ đếm và lịch sử này bắt đầu lại khi khởi động Core; không thay lịch sử đơn lưu trong DB.</p>
      </article>
    </>}
  </section>;
}
