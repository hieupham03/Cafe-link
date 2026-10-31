import { useEffect, useId, useRef, useState } from "react";
import { api } from "./api";
import { money } from "./models";
import type { SessionInfo, Order, OrderResolution } from "./models";
import { Dialog } from "./Dialog";
import { TaxBreakdown } from "./TaxBreakdown";
interface Receipt {
  resolution?: OrderResolution;
  receiptId: string;
  visitId: string;
  tableId: number;
  totalVnd: number;
  paidAt: string;
  method: string;
  orderId?: number;
  orders?: Order[];
}
interface Page {
  receipts: Receipt[];
  hasMore: boolean;
}
export function SalesHistory({ session }: { session: SessionInfo }) {
  const [rows, setRows] = useState<Receipt[]>([]),
    [more, setMore] = useState(false),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [table, setTable] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Receipt | null>(null);
  const generation = useRef(0);
  const tableId = useId();
  async function load(append = false) {
    const current = ++generation.current;
    setBusy(true);
    setError("");
    try {
      if (from && to && from > to)
        throw Error("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
      const last = append ? rows.at(-1) : null;
      const value = await api.command<Page>(
        session.csrfToken,
        "GET_SALES_HISTORY",
        {
          limit: 20,
          fromDate: from,
          toDate: to,
          ...(table ? { tableId: Number(table) } : {}),
          ...(last
            ? { beforeTime: last.paidAt, beforeId: last.receiptId }
            : {}),
        },
      );
      if (current !== generation.current) return;
      setRows((previous) =>
        append ? [...previous, ...value.receipts] : value.receipts,
      );
      setMore(value.hasMore);
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [session.csrfToken, from, to, table]);
  return (
    <section>
      <div className="section-heading">
        <h2>Lịch sử hóa đơn</h2>
        <button disabled={busy} onClick={() => void load()}>
          Tải lại lịch sử
        </button>
      </div>
      <p className="muted">
        Chỉ giao dịch đã xác nhận. Thanh toán giả lập không thu tiền thật. Lọc
        ngày theo giờ Việt Nam.
      </p>
      <div className="history-filters">
        <label>
          Từ ngày
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Đến ngày
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <div>
          <label htmlFor={tableId}>Lọc lịch sử theo bàn</label>
          <select
            id={tableId}
            value={table}
            onChange={(e) => setTable(e.target.value)}
          >
            <option value="">Tất cả bàn</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                Bàn {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!busy && !rows.length && (
        <div className="empty">Chưa có hóa đơn phù hợp.</div>
      )}
      <div className="history-list">
        {rows.map((r) => (
          <button
            className="receipt-row"
            key={r.receiptId}
            onClick={async () => {
              try {
                setSelected(
                  await api.command<Receipt>(
                    session.csrfToken,
                    "GET_SALES_RECEIPT",
                    { receiptId: r.receiptId },
                  ),
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <strong>
              Bàn {r.tableId} · {money(r.totalVnd)}
            </strong>
            <span>
              {new Date(r.paidAt).toLocaleString("vi-VN")} ·{" "}
              {r.method === "LOCAL_SIMULATOR"
                ? "Thanh toán giả lập"
                : "Tiền mặt mô phỏng"}
            </span>
            <small>{r.receiptId}</small>
            {r.resolution&&<span>Đã hoàn giả lập {money(r.resolution.amountVnd)}</span>}
          </button>
        ))}
      </div>
      {more && (
        <button disabled={busy} onClick={() => void load(true)}>
          Xem hóa đơn cũ hơn
        </button>
      )}
      {busy && <p role="status">Đang tải hóa đơn…</p>}
      {selected && (
        <Dialog label="Chi tiết hóa đơn" onClose={() => setSelected(null)}>
          <div className="section-heading">
            <h2>Hóa đơn Bàn {selected.tableId}</h2>
            <button aria-label="Đóng hóa đơn" onClick={() => setSelected(null)}>
              ×
            </button>
          </div>
          <p>{new Date(selected.paidAt).toLocaleString("vi-VN")}</p>
          {selected.orders?.map((o) => (
            <article key={o.id}>
              <h3>Đơn #{o.id}</h3>
              <ul className="order-items">
                {o.items.map((i, n) => (
                  <li key={n}>
                    {i.quantity}× {i.name}{i.note&&<small> · {i.note}</small>}
                    <strong>{money(i.subtotalVnd)}</strong>
                  </li>
                ))}
              </ul>
              {o.note && <p>Ghi chú: {o.note}</p>}
              <TaxBreakdown order={o} />
            </article>
          ))}
          <p className="bill-total">
            Tổng đã xác nhận <strong>{money(selected.totalVnd)}</strong>
          </p>
          <p className="muted">
            Bản ghi nội bộ cho demo; không phải hóa đơn thuế.
          </p>
          {selected.resolution&&<div className="warning"><p>Đã hoàn giả lập: {money(selected.resolution.amountVnd)}</p><p>Lý do: {selected.resolution.reason}</p><p>Người xử lý: {selected.resolution.actor}</p><p>Khoản thu gốc được giữ để đối chiếu. Không có giao dịch ngân hàng thật.</p></div>}
        </Dialog>
      )}
    </section>
  );
}
