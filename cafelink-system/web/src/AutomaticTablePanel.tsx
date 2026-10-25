import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "./api";
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
    [error, setError] = useState("");
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
        QR cố định · Mỗi trình duyệt một phiên riêng · Tự hoàn tất sau khi trả
        tiền, phục vụ và hỗ trợ xong.
      </p>
      <p>
        {table.activeSessions ?? 0} phiên đang xử lý. Con số này không biểu thị
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
          <p className="muted">
            Thử làm khách: dán link vào cửa sổ InPrivate/Ẩn danh
            (Ctrl+Shift+N trên Edge/Chrome), trình duyệt khác hoặc quét QR bằng điện thoại.
            Tab thường dùng chung phiên quản lý.
          </p>
          <button className="secondary" onClick={download}>
            Tải QR bàn
          </button>
          <p className="muted">
            Có thể dùng lại qua nhiều lượt khách. Nếu đổi địa chỉ demo Internet,
            hãy tải QR mới.
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
      <h3 className="spaced">Đơn đang xử lý tại bàn ({orders.length})</h3>
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
    </section>
  );
}
