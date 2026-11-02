import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "./api";
export function TableQr({
  tableId,
  csrf,
  enabled,
}: {
  tableId: number;
  csrf: string;
  enabled: boolean;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setUrl("");
    setError("");
    if (enabled) {
      void api
        .command<{ joinUrl: string }>(csrf, "GET_TABLE_QR", { tableId })
        .then((data) => {
          if (active) {
            setUrl(data.joinUrl);
            setError("");
          }
        })
        .catch(() => {
          if (active) setError("Chưa tải được QR");
        });
    }
    return () => {
      active = false;
    };
  }, [tableId, csrf, enabled]);
  if (!enabled)
    return (
      <div className="table-qr-placeholder">
        Mở tất cả bàn để tải QR
      </div>
    );
  return (
    <div className="table-inline-qr">
      {url ? (
        <>
          <QRCodeSVG
            value={url}
            size={112}
            level="M"
            marginSize={2}
            title={`Mã QR gọi món bàn ${tableId}`}
          />
          <span>Quét để gọi món</span>
        </>
      ) : (
        <span>{error || "Đang tải QR…"}</span>
      )}
    </div>
  );
}
