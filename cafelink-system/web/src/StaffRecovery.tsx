import { useEffect, useState } from "react";
import type { SessionInfo } from "./models";
import { staffJournal, staffPending } from "./staffJournal";
import type { StaffIntent } from "./staffJournal";
import { money } from "./models";
import { actionTitle } from "./ui";

export function StaffRecovery({ session }: { session: SessionInfo }) {
  const [rows, setRows] = useState<StaffIntent[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const read = () =>
      staffJournal
        .read(session)
        .then((value) => {
          if (active) setRows(value);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    void staffJournal
      .reconcile(session)
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(read);
    const timer = setInterval(() => void read(), 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session.identity.storeId, session.identity.username]);
  async function act(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      try {
        setRows(await staffJournal.read(session));
      } catch (e) {
        setError((e as Error).message);
      }
      setBusy(false);
    }
  }
  const pending = rows.filter(staffPending),
    latest = rows
      .filter((r) => r.action === "PAY_AND_CLOSE" && !staffPending(r))
      .sort((a, b) => b.createdAt - a.createdAt)[0];
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {pending.length > 0 && (
        <section className="recovery-panel" aria-label="Đối chiếu thu ngân">
          <h2>Có thao tác quản lý cần đối chiếu</h2>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void act(() => staffJournal.reconcile(session))}
          >
            Đối chiếu thu ngân
          </button>
          {pending.map((row) => (
            <article key={row.id}>
              <p>{row.message}</p>
              <details className="technical-details">
                <summary>
                  {actionTitle[row.action] ?? "Thao tác"} · Chi tiết đối chiếu
                </summary>
                <small>
                  Mã {row.id.slice(0, 8)} · {row.action} ·{" "}
                  {row.data.visitId
                    ? `lượt ${String(row.data.visitId).slice(0, 8)}`
                    : "thực đơn"}
                </small>
              </details>
              {row.status === "CONFIRM_REQUIRED" && (
                <div className="button-row">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(() => staffJournal.decide(session, row.id, true))
                    }
                  >
                    Đã kiểm tra, thực hiện lại
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        staffJournal.decide(session, row.id, false),
                      )
                    }
                  >
                    Bỏ thao tác chưa nhận
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
      {latest && (
        <p className="order-receipt" role="status">
          {latest.status === "ACCEPTED" &&
          Number.isSafeInteger(latest.result?.totalVnd)
            ? `Đã ghi nhận tiền mặt ${money(Number(latest.result!.totalVnd))}, phiếu #${latest.result!.receiptId}. Không thu lại.`
            : latest.message}
        </p>
      )}
    </>
  );
}
