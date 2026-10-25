import type { Snapshot, Table } from "./models";
import { money } from "./models";
import { searchText, WaitTime } from "./ui";
import { OrderResolution } from "./OrderResolution";
type Run = <T>(action: string, data: unknown) => Promise<T | undefined>;
export function SupportQueue({
  state,
  disabled,
  replies,
  onReply,
  run,
  query,
  setQuery,
  showHandled,
  setShowHandled,
  onOpen,
}: {
  state: Snapshot | null;
  disabled: boolean;
  replies: Record<number, string>;
  onReply: (id: number, value: string) => void;
  run: Run;
  query: string;
  setQuery: (query: string) => void;
  showHandled: boolean;
  setShowHandled: (value: boolean) => void;
  onOpen: (table: Table) => void;
}) {
  const tickets = (state?.tickets ?? [])
    .filter(
      (t) =>
        (showHandled || t.status === "OPEN") &&
        searchText(`bàn ${t.tableId} ${t.note} ${t.reply}`).includes(
          searchText(query),
        ),
    )
    .sort((a, b) => a.id - b.id);
  return (
    <section className="requests">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PHỤC VỤ ĐÚNG LÚC</span>
          <h2>Yêu cầu tại bàn</h2>
        </div>
        <label className="search-label">
          Tìm yêu cầu
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Bàn hoặc nội dung…"
          />
        </label>
      </div>
      <label className="checkbox-filter">
        <input
          type="checkbox"
          checked={showHandled}
          onChange={(event) => setShowHandled(event.target.checked)}
        />
        Hiện cả yêu cầu đã xử lý
      </label>
      {!tickets.length && (
        <div className="empty">
          <h3>
            {query
              ? "Không có yêu cầu khớp bộ lọc"
              : "Đã xử lý hết yêu cầu hỗ trợ"}
          </h3>
          <p>Yêu cầu mới của khách sẽ xuất hiện ở đây.</p>
        </div>
      )}
      {tickets.map((ticket) => (
        <article className="request-row" key={ticket.id}>
          <div>
            <div className="section-heading">
              <strong>
                Bàn {ticket.tableId} ·{" "}
                {ticket.type === "REQUEST_BILL"
                  ? "Yêu cầu tính tiền"
                  : "Gọi nhân viên"}
              </strong>
              <span
                className={
                  ticket.status === "OPEN" ? "pill amber" : "pill green"
                }
              >
                {ticket.status === "OPEN" ? "Đang chờ" : ticket.status==='CANCELLED'?'Khách đã rút':"Đã xử lý"}
              </span>
            </div>
            <p>{ticket.note || "Khách cần hỗ trợ tại bàn."}</p>
            {ticket.status === "OPEN" && <WaitTime since={ticket.createdAt} />}
            <button
              className="text-button"
              onClick={() => {
                const table = state?.tables.find(
                  (t) => t.id === ticket.tableId,
                );
                if (table) onOpen(table);
              }}
            >
              Xem bàn {ticket.tableId}
            </button>
          </div>
          {ticket.status === "OPEN" ? (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                await run("HANDLE_TICKET", {
                  ticketId: ticket.id,
                  expectedVersion: ticket.version??0,
                  reply: replies[ticket.id] || "Nhân viên đã hỗ trợ xong.",
                });
              }}
            >
              <input
                aria-label={`Phản hồi yêu cầu ${ticket.id}`}
                placeholder="Lời nhắn cho khách…"
                maxLength={500}
                value={replies[ticket.id] || ""}
                onChange={(event) => onReply(ticket.id, event.target.value)}
              />
              <button className="secondary" disabled={disabled}>
                Đã xử lý
              </button>
            </form>
          ) : (
            <p className="order-receipt">
              {ticket.reply || "Yêu cầu đã được xử lý."}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
export function CashierQueue({
  state,
  disabled,
  run,
  onOpen,
}: {
  state: Snapshot | null;
  disabled: boolean;
  run: Run;
  onOpen: (table: Table) => void;
}) {
  const pending = (state?.checkouts ?? []).filter(
    (c) => c.state === "REQUESTED" || c.state === "ACKNOWLEDGED",
  );
  return (
    <section>
      {state?.tables
        .filter(
          (t) =>
            (t.visitId && t.paymentMode === "PREPAY") ||
            (t.automatic && (t.activeSessions ?? 0) > 0),
        )
        .map((table) => {
          const orders = state.orders.filter((o) =>
              table.automatic
                ? o.tableId === table.id
                : o.visitId === table.visitId,
            ),
            paid = orders
              .filter((o) => o.paymentState === "PAID")
              .reduce((sum, o) => sum + o.totalVnd, 0),
            unpaid = orders
              .filter(
                (o) =>
                  o.paymentState === "UNPAID" || o.paymentState === "PENDING",
              )
              .reduce((sum, o) => sum + o.totalVnd, 0);
          return (
            <article className="cashier-card" key={table.id}>
              <h3>{table.name} · Thanh toán trước</h3>
              <p>
                Đã xác nhận: <strong>{money(paid)}</strong>
              </p>
              <p>Chưa thanh toán: {money(unpaid)}</p>
              {orders.filter(o=>o.status==='SUBMITTED'&&['UNPAID','PENDING','PAID'].includes(o.paymentState??'')).map(order=><div className="table-order" key={order.id}><p>Đơn #{order.id} · {money(order.totalVnd)} · {order.paymentState==='PAID'?'Đã trả tiền':'Chưa trả tiền'}</p><OrderResolution order={order} disabled={disabled} run={run}/></div>)}
              <p className="muted">
                {table.automatic
                  ? "Mỗi khách thanh toán riêng; phiên tự kết thúc sau khi giao đồ và hỗ trợ xong."
                  : "Đơn đã trả tiền chuyển sang quầy; đóng lượt khi phục vụ xong."}
              </p>
              <button className="secondary" onClick={() => onOpen(table)}>
                Xem thanh toán {table.name}
              </button>
            </article>
          );
        })}
      {pending.length>0&&<div className="section-heading">
        <div>
          <span className="eyebrow">QUY TRÌNH THANH TOÁN SAU</span>
          <h2>Yêu cầu tính tiền trả sau</h2>
        </div>
        <span className="count">{pending.length}</span>
      </div>}
      {!pending.length &&
        !state?.tables.some(
          (t) =>
            (t.visitId && t.paymentMode === "PREPAY") ||
            (t.automatic && (t.activeSessions ?? 0) > 0),
        ) && (
          <div className="empty">
            <h3>Chưa có đơn cần thu ngân xử lý</h3>
            <p>
              Đơn chưa thanh toán và các trường hợp cần xử lý sẽ xuất hiện tại đây.
            </p>
          </div>
        )}
      <div className="cashier-grid">
        {pending.map((checkout) => {
          const table = state?.tables.find(
            (t) => t.visitId === checkout.visitId,
          );
          if (!table) return null;
          const orders = state!.orders.filter(
              (o) => o.visitId === checkout.visitId,
            ),
            unserved = orders.filter((o) => o.status !== "SERVED").length,
            support = state!.tickets.filter(
              (t) => t.visitId === checkout.visitId && t.status === "OPEN",
            ).length;
          return (
            <article className="cashier-card" key={checkout.checkoutId}>
              <div className="section-heading">
                <h3>{table.name}</h3>
                <span
                  className={
                    checkout.state === "REQUESTED" ? "pill amber" : "pill green"
                  }
                >
                  {checkout.state === "REQUESTED"
                    ? "Chờ tiếp nhận"
                    : "Đã tiếp nhận"}
                </span>
              </div>
              <WaitTime since={checkout.updatedAt} />
              <strong className="cashier-total">
                {money(orders.reduce((sum, o) => sum + o.totalVnd, 0))}
              </strong>
              <p>
                {unserved
                  ? `Còn ${unserved} đơn chưa phục vụ`
                  : "Tất cả đơn đã phục vụ"}
                {support ? ` · ${support} yêu cầu hỗ trợ chưa xử lý` : ""}
              </p>
              <div className="button-row">
                {checkout.state === "REQUESTED" && (
                  <button
                    className="primary"
                    disabled={disabled}
                    onClick={() =>
                      void run("ACK_CHECKOUT", {
                        visitId: checkout.visitId,
                        expectedVisitVersion: table.version,
                        expectedCheckoutVersion: checkout.version,
                      })
                    }
                  >
                    Tiếp nhận {table.name}
                  </button>
                )}
                <button className="secondary" onClick={() => onOpen(table)}>
                  Xem hóa đơn {table.name}
                </button>
              </div>
              <small className="muted">
                Thu tiền mặt mô phỏng trong chi tiết bàn sau khi kiểm hóa đơn.
              </small>
            </article>
          );
        })}
      </div>
    </section>
  );
}
