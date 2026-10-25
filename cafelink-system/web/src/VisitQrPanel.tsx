import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "./api";

interface Qr {
  joinUrl: string;
  generation: number;
  expiresAt: string;
}
interface Member {
  membershipId: string;
  status: string;
  createdAt: string;
}
export function VisitQrPanel({
  visitId,
  csrf,
  disabled,
  refreshKey,
}: {
  visitId: string;
  csrf: string;
  disabled: boolean;
  refreshKey: string;
}) {
  const [expanded, setExpanded] = useState(false),
    [qr, setQr] = useState<Qr | null>(null);
  const [members, setMembers] = useState<Member[]>([]),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null),
    lock = useRef(false),
    generation = useRef(0);
  async function load() {
    const current = ++generation.current;
    try {
      const [qrValue, devices] = await Promise.allSettled([
        api.command<Qr>(csrf, "GET_VISIT_QR", { visitId }),
        api.command<{ memberships: Member[] }>(csrf, "GET_VISIT_MEMBERSHIPS", {
          visitId,
        }),
      ]);
      if (current !== generation.current) return;
      setQr(qrValue.status === "fulfilled" ? qrValue.value : null);
      if (devices.status === "fulfilled") setMembers(devices.value.memberships);
      setError(
        qrValue.status === "rejected"
          ? (qrValue.reason as Error).message
          : devices.status === "rejected"
            ? (devices.reason as Error).message
            : "",
      );
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (expanded && !disabled) void load();
    return () => {
      generation.current++;
    };
  }, [expanded, csrf, visitId, refreshKey, disabled]);
  async function confirm() {
    if (lock.current || disabled || !confirmation) return;
    lock.current = true;
    setBusy(true);
    try {
      if (confirmation === "rotate")
        await api.command(csrf, "ROTATE_JOIN_GRANT", { visitId });
      else
        await api.command(csrf, "REVOKE_SESSION", {
          visitId,
          membershipId: confirmation,
        });
      setConfirmation(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function download() {
    if (!svg.current) return;
    const file = new Blob(
      [new XMLSerializer().serializeToString(svg.current)],
      { type: "image/svg+xml" },
    );
    const url = URL.createObjectURL(file),
      link = document.createElement("a");
    link.href = url;
    link.download = "cafelink-qr-luot-khach.svg";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="qr-panel">
      <button
        className="secondary full"
        disabled={disabled}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "Ẩn QR và thiết bị" : "Xem QR và thiết bị"}
      </button>
      {expanded && (
        <>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {!qr && error && (
            <button
              className="secondary full"
              disabled={disabled || busy}
              onClick={() => setConfirmation("rotate")}
            >
              Cấp lại QR
            </button>
          )}
          {qr && (
            <div className="qr-card">
              <h3>Quét để vào bàn</h3>
              <p>QR dành riêng cho lượt khách hiện tại.</p>
              <QRCodeSVG
                ref={svg}
                role="img"
                value={qr.joinUrl}
                size={240}
                level="M"
                marginSize={4}
                title="QR gia nhập lượt khách"
              />
              <p className="muted">
                Mã lần {qr.generation} · Hết hạn{" "}
                {new Date(qr.expiresAt).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              {Date.parse(qr.expiresAt) <= Date.now() && (
                <p className="warning banner">
                  QR đã hết hạn. Hãy cấp lại mã cho khách mới gia nhập.
                </p>
              )}
              <label>
                Đường dẫn cho khách
                <input
                  readOnly
                  value={qr.joinUrl}
                  onFocus={(event) => event.target.select()}
                />
              </label>
              <div className="button-row">
                <button className="secondary" onClick={download}>
                  Tải QR
                </button>
                <button
                  className="secondary"
                  disabled={disabled || busy}
                  onClick={() => setConfirmation("rotate")}
                >
                  Cấp lại QR
                </button>
              </div>
            </div>
          )}
          {!qr && !error && <p role="status">Đang tải QR…</p>}
          <div className="section-heading spaced">
            <h3>Thiết bị của lượt bàn</h3>
            <button
              className="text-button"
              disabled={disabled || busy}
              onClick={() => void load()}
            >
              Làm mới danh sách
            </button>
          </div>
          {members.length === 0 && (
            <p className="muted">Chưa có khách gia nhập bằng QR.</p>
          )}
          {members.map((member) => (
            <article className="member-row" key={member.membershipId}>
              <div>
                <strong>Thiết bị {member.membershipId.slice(0, 6)}</strong>
                <small>
                  {member.status === "ACTIVE"
                    ? "Còn quyền truy cập"
                    : member.status === "REVOKED"
                      ? "Đã thu hồi"
                      : "Đã hết hạn"}
                </small>
              </div>
              {member.status === "ACTIVE" && (
                <button
                  className="text-button"
                  disabled={disabled || busy}
                  onClick={() => setConfirmation(member.membershipId)}
                  aria-label={`Thu hồi thiết bị ${member.membershipId.slice(0, 6)}`}
                >
                  Thu hồi
                </button>
              )}
            </article>
          ))}
          {confirmation && (
            <div
              className="confirm-box"
              role="group"
              aria-label="Xác nhận thay đổi quyền"
            >
              <h3>
                {confirmation === "rotate"
                  ? "Cấp lại QR cho lượt này?"
                  : "Thu hồi thiết bị này?"}
              </h3>
              <p>
                {confirmation === "rotate"
                  ? "QR cũ sẽ không cho khách mới gia nhập. Các thiết bị đã vào bàn vẫn giữ quyền."
                  : "Thiết bị sẽ không thể xem dữ liệu hoặc gửi yêu cầu bằng phiên hiện tại."}
              </p>
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setConfirmation(null)}
                >
                  Quay lại
                </button>
                <button
                  className="primary"
                  disabled={disabled || busy}
                  onClick={() => void confirm()}
                >
                  {busy ? "Đang xử lý…" : "Xác nhận thay đổi"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
