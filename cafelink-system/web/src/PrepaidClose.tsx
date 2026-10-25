import { useEffect, useState } from "react";
import type { Order, Table } from "./models";
export function PrepaidClose({
  table,
  orders,
  support,
  disabled,
  run,
}: {
  table: Table;
  orders: Order[];
  support: number;
  disabled: boolean;
  run: <T>(action: string, data: unknown) => Promise<T | undefined>;
}) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [table.visitId, table.version]);
  const blocked =
    disabled ||
    support > 0 ||
    orders.some(
      (o) =>
        o.paymentState !== "CANCELLED" &&
        (o.paymentState !== "PAID" || o.status !== "SERVED"),
    );
  return (
    <div className="prepaid-close">
      <p className="muted">
        Lượt trả trước: đóng lượt chỉ kết thúc bàn, không thu thêm tiền. Cần
        phục vụ xong đơn đã trả tiền, hủy đơn chưa trả và xử lý hết hỗ trợ.
      </p>
      <button
        className="primary"
        disabled={blocked}
        onClick={() => setConfirm(true)}
      >
        Kết thúc lượt khách
      </button>
      {confirm && (
        <div
          className="confirm-box"
          role="alertdialog"
          aria-label="Xác nhận kết thúc lượt"
        >
          <p>
            Kết thúc lượt của {table.name}? Quyền và QR lượt này không dùng cho
            khách mới.
          </p>
          <button onClick={() => setConfirm(false)}>Quay lại</button>
          <button
            disabled={blocked}
            onClick={async () => {
              if (await run("CLOSE_VISIT", { visitId: table.visitId }))
                setConfirm(false);
            }}
          >
            Xác nhận kết thúc
          </button>
        </div>
      )}
    </div>
  );
}
