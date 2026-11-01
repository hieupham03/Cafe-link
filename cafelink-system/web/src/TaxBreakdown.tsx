import type { Order } from "./models";
import { money } from "./models";

export function TaxBreakdown({ order }: { order: Order }) {
  return <div className="tax-breakdown">
    <span>Tiền hàng trước thuế <strong>{money(order.subtotalVnd ?? order.totalVnd)}</strong></span>
    <span>{order.taxName ?? "Thuế"} ({(order.taxRateBps ?? 0) / 100}%) <strong>{money(order.taxVnd ?? 0)}</strong></span>
    {order.taxRateBps > 0 && <small>{order.taxInclusive ? "Thuế đã gồm trong giá món." : "Thuế cộng thêm vào giá món."}</small>}
  </div>;
}
