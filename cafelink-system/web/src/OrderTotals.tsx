import type { Order } from "./models";
import { money } from "./models";
export function OrderTotals({
  order,
}: {
  order: Pick<
    Order,
    | "totalVnd"
    | "subtotalVnd"
    | "taxVnd"
    | "taxName"
    | "taxRateBps"
    | "taxIncluded"
  >;
}) {
  return (
    <dl className="order-totals">
      <div>
        <dt>Tiền hàng chưa thuế</dt>
        <dd>{money(order.subtotalVnd ?? order.totalVnd)}</dd>
      </div>
      <div>
        <dt>
          {order.taxName || "Thuế"} ({(order.taxRateBps ?? 0) / 100}%)
        </dt>
        <dd>{money(order.taxVnd ?? 0)}</dd>
      </div>
      <div className="order-totals-grand">
        <dt>Tổng thanh toán</dt>
        <dd>{money(order.totalVnd)}</dd>
      </div>
    </dl>
  );
}
