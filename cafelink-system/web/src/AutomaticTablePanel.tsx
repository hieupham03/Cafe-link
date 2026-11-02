import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "./api";
import { Dialog } from "./Dialog";
import { GuestLink } from "./GuestLink";
import { money, statusName } from "./models";
import type { Table, Order } from "./models";

export function AutomaticTablePanel({
  table,
  orders,
  csrf,
  disabled,
  run,
}: {
  table: Table;
  orders: Order[];
  csrf: string;
  disabled: boolean;
  run: (action: string, data: Record<string, unknown>) => Promise<unknown>;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [confirmEnd, setConfirmEnd] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let live = true;
    api
      .command<{ joinUrl: string }>(csrf, "GET_TABLE_QR", { tableId: table.id })
      .then((value) => {
        if (live) setUrl(value.joinUrl);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [csrf, table.id]);
  function download() {
    if (!svg.current) return;
    const link = document.createElement("a"),
      objectUrl = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(svg.current)], {
          type: "image/svg+xml",
        }),
      );
    link.href = objectUrl;
    link.download = `cafelink-ban-${table.id}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  return (
    <section className="qr-panel">
      <span className={`pill ${table.acceptingOrders ? "green" : ""}`}>
        {table.acceptingOrders ? "Nhận khách mới qua QR" : "Tạm dừng khách mới"}
      </span>
      <p>
        QR gọi món tại bàn · Mỗi khách có đơn và thanh toán riêng.
      </p>
      <p>
        {table.activeSessions ?? 0} phiên đang phục vụ. Con số này không biểu thị
        số người còn ngồi tại bàn.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {url && (
        <div className="qr-card">
          <h3>Quét QR đặt món · {table.name}</h3>
          <QRCodeSVG
            ref={svg}
            value={url}
            size={220}
            level="M"
            marginSize={4}
          />
          <a href={url} target="_blank" rel="noreferrer">
            Mở trang đặt món {table.name}
          </a>
          <GuestLink key={url} url={url} />
          <button className="secondary" onClick={download}>
            Tải QR bàn
          </button>
          <p className="muted">
            Dùng chung mã tại bàn. Mỗi khách có đơn và thanh toán riêng.
          </p>
        </div>
      )}
      <button
        className="secondary"
        disabled={disabled}
        onClick={() =>
          void run("SET_TABLE_ACCEPTING", {
            tableId: table.id,
            enabled: table.acceptingOrders ? 0 : 1,
          })
        }
      >
        {table.acceptingOrders ? "Tạm dừng khách mới" : "Tiếp tục nhận khách"}
      </button>
      {(table.activeSessions ?? 0) > 0 && (
        <button
          className="secondary"
          disabled={disabled}
          onClick={() => setConfirmEnd(true)}
        >
          Kết thúc phiên
        </button>
      )}
      <h3 className="spaced">Đơn trong các phiên tại bàn ({orders.length})</h3>
      {orders.length === 0 && (
        <p className="muted">
          Khách có thể quét và đặt ngay, không cần mở lượt.
        </p>
      )}
      {orders.map((order) => (
        <article className="table-order" key={order.id}>
          <div className="section-heading">
            <strong>Đơn #{order.id}</strong>
            <span className="pill">
              {order.paymentState === "CANCELLED"
                ? "Đã hủy"
                : ["UNPAID", "PENDING"].includes(order.paymentState ?? "")
                  ? "Chờ thanh toán"
                  : statusName[order.status]}
            </span>
          </div>
          <p>
            {order.items
              .map((item) => `${item.quantity}× ${item.name}`)
              .join(", ")}
          </p>
          <strong>{money(order.totalVnd)}</strong>
        </article>
      ))}
      {confirmEnd && (
        <Dialog
          label="Xác nhận kết thúc phiên"
          role="alertdialog"
          onClose={() => setConfirmEnd(false)}
        >
          <h2>Kết thúc tất cả phiên tại {table.name}?</h2>
          <p>
            Khách sẽ bị đăng xuất khỏi các phiên của bàn này. Chỉ có thể kết thúc
            khi mọi đơn đã thanh toán và giao, mọi yêu cầu hỗ trợ đã xử lý.
          </p>
          <div className="button-row">
            <button onClick={() => setConfirmEnd(false)}>Hủy</button>
            <button
              className="secondary"
              disabled={disabled}
              onClick={async () => {
                await run("END_TABLE_SESSIONS", { tableId: table.id });
                setConfirmEnd(false);
              }}
            >
              Xác nhận kết thúc phiên
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
