import { useState } from "react";
import type { Checkout, Table } from "./models";
export function CheckoutControls({
  table,
  checkout,
  disabled,
  run,
}: {
  table: Table;
  checkout?: Checkout;
  disabled: boolean;
  run: <T>(action: string, data: unknown) => Promise<T | undefined>;
}) {
  const [reason, setReason] = useState("");
  const active =
    checkout?.state === "REQUESTED" || checkout?.state === "ACKNOWLEDGED";
  const data = {
    visitId: table.visitId,
    expectedVisitVersion: table.version,
    expectedCheckoutVersion: checkout?.version ?? 0,
  };
  return (
    <section className="checkout-panel" aria-label="Quản lý tính tiền">
      <h3>Tính tiền tại bàn</h3>
      <p>
        {checkout?.state === "ACKNOWLEDGED"
          ? "Quán đã tiếp nhận tính tiền"
          : checkout?.state === "REQUESTED"
            ? "Khách đang chờ tính tiền"
            : "Bàn đang được gọi món"}
      </p>
      {!active && (
        <button
          className="secondary"
          disabled={disabled}
          onClick={() => void run("REQUEST_CHECKOUT", data)}
        >
          Mở yêu cầu tính tiền
        </button>
      )}
      {checkout?.state === "REQUESTED" && (
        <button
          className="primary"
          disabled={disabled}
          onClick={() => void run("ACK_CHECKOUT", data)}
        >
          Tiếp nhận tính tiền
        </button>
      )}
      {active && (
        <>
          <label>
            Lý do mở lại gọi món
            <input
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ví dụ: khách muốn gọi thêm món"
            />
          </label>
          <button
            className="secondary"
            disabled={disabled || !reason.trim()}
            onClick={() => void run("REOPEN_ORDERING", { ...data, reason })}
          >
            Tiếp tục gọi món
          </button>
        </>
      )}
    </section>
  );
}
