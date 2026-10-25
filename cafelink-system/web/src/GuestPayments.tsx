import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { guestScope, money } from "./models";
import type { Order, SessionInfo } from "./models";
import { Dialog } from "./Dialog";
import { GuestSectionHeading } from "./GuestSectionHeading";
interface Payment {
  paymentId: string;
  orderId: number;
  visitId: string;
  amountVnd: number;
  state: string;
  expiresAt: string;
  token?: string;
}
export function GuestPayments({
  session,
  orders,
  disabled,
  autoOrder,
}: {
  session: SessionInfo;
  orders: Order[];
  disabled: boolean;
  autoOrder?: number;
}) {
  const [payment, setPayment] = useState<Payment | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false),
    opened = useRef(0);
  const command = <T,>(action: string, data: unknown) =>
    api.command<T>(
      session.csrfToken,
      action,
      data,
      crypto.randomUUID(),
      guestScope(session),
    );
  async function start(orderId: number) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      setPayment(
        await command<Payment>("START_ORDER_PAYMENT", {
          visitId: session.identity.visitId,
          orderId,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      autoOrder &&
      autoOrder !== opened.current &&
      !disabled &&
      orders.some((o) => o.id === autoOrder)
    ) {
      opened.current = autoOrder;
      void start(autoOrder);
    }
  }, [autoOrder, disabled, orders]);
  async function simulate(outcome: string) {
    if (!payment || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await command<Payment>("SIMULATE_PAYMENT", {
        ...payment,
        outcome,
      });
      if (result.state === "PAID") {
        setNotice(
          `Đơn #${result.orderId} đã thanh toán giả lập. Bạn có thể theo dõi tiến độ phục vụ trong mục Đơn đã gọi.`,
        );
        setPayment(null);
      } else {
        setNotice(
          `Giao dịch ${result.state === "FAILED" ? "thất bại" : result.state === "EXPIRED" ? "hết hạn" : "đã hủy"}. Đơn chưa trả tiền; bạn có thể thử lại hoặc hủy đơn.`,
        );
        setPayment(null);
      }
    } catch (e) {
      setError(
        (e as Error).message +
          " Chưa rõ kết quả: tải lại để kiểm tra trạng thái đơn; không đặt đơn mới.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section id="guest-checkout" className="checkout-panel guest-zone" data-guest-zone="payment" aria-labelledby="guest-payment-heading">
      <GuestSectionHeading id="guest-payment-heading" icon="check" title="Thanh toán đơn hàng" description="Kiểm tra tiền và thanh toán cho đơn đã gửi." meta={`${orders.filter(order => ["UNPAID", "PENDING"].includes(order.paymentState ?? "")).length} chưa trả`} />
      <p className="warning">
        Cổng giả lập học tập — không thu tiền thật, không nhập thông tin ngân
        hàng.
      </p>
      {notice && (
        <p className="order-receipt" role="status">
          {notice}
        </p>
      )}
      {error && !payment && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!orders.length && (
        <p>Chọn món và xác nhận giỏ để thanh toán trước khi quán pha chế.</p>
      )}
      {orders.map((o) => (
        <article className="payment-row" key={o.id}>
          <div>
            <strong>
              Đơn #{o.id} · {money(o.totalVnd)}
            </strong>
            <p>
              {o.paymentState === "REFUNDED"
                ? "Đã hoàn giả lập — xem lý do ở đơn đã gọi"
                : o.paymentState === "PAID"
                ? "Đã thanh toán giả lập"
                : o.paymentState === "CANCELLED"
                  ? "Đã hủy đơn"
                  : "Chưa thanh toán — quán chưa pha chế"}
            </p>
          </div>
          {["UNPAID", "PENDING"].includes(o.paymentState ?? "") && (
            <div className="button-row">
              <button
                className="primary"
                disabled={disabled || busy}
                onClick={() => void start(o.id)}
              >
                Thanh toán đơn #{o.id}
              </button>
              <button
                className="secondary"
                disabled={disabled || busy}
                onClick={async () => {
                  if (lock.current) return;
                  lock.current = true;
                  setBusy(true);
                  try {
                    await command("CANCEL_UNPAID_ORDER", {
                      visitId: session.identity.visitId,
                      orderId: o.id,
                    });
                    setNotice(`Đã hủy đơn chưa thanh toán #${o.id}.`);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    lock.current = false;
                    setBusy(false);
                  }
                }}
              >
                Hủy đơn #{o.id}
              </button>
            </div>
          )}
        </article>
      ))}
      {payment && (
        <Dialog
          label="Cổng thanh toán giả lập"
          onClose={() => {
            if (!busy) setPayment(null);
          }}
        >
          <div className="section-heading">
            <h2>Thanh toán thử</h2>
            <button
              aria-label="Đóng cổng giả lập"
              disabled={busy}
              onClick={() => setPayment(null)}
            >
              ×
            </button>
          </div>
          <p className="warning">MÔ PHỎNG CỤC BỘ · KHÔNG THU TIỀN THẬT</p>
          <h3>Đơn #{payment.orderId}</h3>
          <div className="bill-total">
            <strong>{money(payment.amountVnd)}</strong>
          </div>
          <p>
            Thử một kết quả. Server kiểm tra mã giao dịch, chữ ký và số tiền,
            sau đó cập nhật đơn.
          </p>
          <small>
            Hết hạn: {new Date(payment.expiresAt).toLocaleTimeString("vi-VN")}
          </small>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="sandbox-actions">
            <button
              className="primary"
              disabled={disabled || busy}
              onClick={() => void simulate("SUCCESS")}
            >
              Giả lập thanh toán thành công
            </button>
            <button
              disabled={disabled || busy}
              onClick={() => void simulate("FAILED")}
            >
              Giả lập thanh toán thất bại
            </button>
            <button
              disabled={disabled || busy}
              onClick={() => void simulate("CANCELLED")}
            >
              Hủy giao dịch thử
            </button>
          </div>
          <p className="muted">
            Đóng cửa sổ này không tự hủy giao dịch. Có thể mở lại từ đơn đang
            chờ.
          </p>
        </Dialog>
      )}
    </section>
  );
}
