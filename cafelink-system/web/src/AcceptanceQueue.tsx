import type { Order } from "./models";
import { money } from "./models";
import { OrderResolution } from "./OrderResolution";
import { OrderTotals } from "./OrderTotals";
import { WaitTime } from "./ui";
import { Icon } from "./Icons";
export function AcceptanceQueue({
  orders,
  disabled,
  run,
}: {
  orders: Order[];
  disabled: boolean;
  run: (action: string, data: Record<string, unknown>) => Promise<unknown>;
}) {
  const waiting = orders
    .filter(
      (o) =>
        o.acceptanceState === "WAITING" &&
        !["CANCELLED", "REFUNDED"].includes(o.paymentState ?? ""),
    )
    .sort((a, b) => a.id - b.id);
  return (
    <section className="acceptance-queue" aria-label="Đơn chờ tiếp nhận">
      <div className="section-heading">
        <div>
          <span className="eyebrow">BƯỚC 01 · KIỂM TRA ĐƠN</span>
          <h2>
            Đơn chờ tiếp nhận <span className="count">{waiting.length}</span>
          </h2>
          <p className="muted">
            Kiểm tra món và khả năng phục vụ trước khi khách thanh toán.
          </p>
        </div>
        <Icon name="receipt" />
      </div>
      {!waiting.length && (
        <div className="empty compact">
          <Icon name="check" />
          <h3>Đã tiếp nhận hết đơn mới</h3>
          <p>Đơn khách vừa gửi sẽ xuất hiện ở đây.</p>
        </div>
      )}
      <div className="orders-grid">
        {waiting.map((order) => (
          <article className="order-card awaiting-card" key={order.id}>
            <div className="section-heading">
              <h3>
                Bàn {order.tableId} <small>#{order.id}</small>
              </h3>
              <span className="pill amber">Chờ tiếp nhận</span>
            </div>
            <WaitTime since={order.createdAt} />
            <ul className="order-items">
              {order.items.map((item, i) => (
                <li key={i}>
                  <span>
                    <b>{item.quantity}×</b> {item.name}
                    {item.note && <small> · {item.note}</small>}
                  </span>
                  <strong>{money(item.subtotalVnd)}</strong>
                </li>
              ))}
            </ul>
            {order.note && <p className="order-note">{order.note}</p>}
            <OrderTotals order={order} />
            <button
              className="primary full"
              disabled={disabled}
              onClick={() => void run("ACCEPT_ORDER", { orderId: order.id })}
            >
              Tiếp nhận đơn #{order.id}
            </button>
            <OrderResolution order={order} disabled={disabled} run={run} />
          </article>
        ))}
      </div>
    </section>
  );
}
