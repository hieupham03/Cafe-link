import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { SessionInfo } from "./models";
import { money } from "./models";
import { Dialog } from "./Dialog";
import { Icon } from "./Icons";
import { financialActions, staffJournal } from "./staffJournal";
interface Expense {
  id: number;
  amountVnd: number;
  category: string;
  note: string;
  spentOn: string;
  createdBy: string;
  voidedAt?: string;
  voidReason?: string;
}
interface Day {
  date: string;
  grossVnd: number;
  refundVnd: number;
  netVnd: number;
  expenseVnd: number;
  balanceVnd: number;
}
interface Report {
  fromDate: string;
  toDate: string;
  grossVnd: number;
  refundVnd: number;
  netVnd: number;
  expenseVnd: number;
  balanceVnd: number;
  netTaxVnd: number;
  paymentsCount: number;
  daily: Day[];
  expenses: Expense[];
  hasMore: boolean;
}
const localDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const csvCell = (value: unknown) =>
  '"' +
  String(value)
    .replace(/^[=+@-]/, "'$&")
    .replaceAll('"', '""') +
  '"';
export function FinanceReport({
  session,
  disabled,
}: {
  session: SessionInfo;
  disabled: boolean;
}) {
  const today = localDate(),
    [from, setFrom] = useState(today.slice(0, 8) + "01"),
    [to, setTo] = useState(today),
    [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState({ fromDate: from, toDate: to }),
    [report, setReport] = useState<Report>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [adding, setAdding] = useState(false),
    [voiding, setVoiding] = useState<Expense>(),
    [reason, setReason] = useState(""),
    [saving, setSaving] = useState(false),
    [formError, setFormError] = useState("");
  const generation = useRef(0);
  const command = async <T,>(action: string, data: unknown): Promise<T> =>
    financialActions.has(action)
      ? ((await staffJournal.execute(
          session,
          action,
          data as Record<string, unknown>,
        )) as T)
      : api.command<T>(session.csrfToken, action, data);
  async function load() {
    const turn = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const data = await command<Report>("GET_FINANCE_REPORT", {
        ...filter,
        offset,
      });
      if (turn === generation.current) setReport(data);
    } catch (e) {
      if (turn === generation.current) setError((e as Error).message);
    } finally {
      if (turn === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [filter, offset, session.csrfToken]);
  function exportCsv() {
    if (!report) return;
    const rows = [
      [
        "Ngày",
        "Tổng thu (VND)",
        "Hoàn tiền (VND)",
        "Thu ròng (VND)",
        "Chi phí (VND)",
        "Chênh lệch (VND)",
      ],
      ...report.daily.map((d) => [
        d.date,
        d.grossVnd,
        d.refundVnd,
        d.netVnd,
        d.expenseVnd,
        d.balanceVnd,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `CafeLink-thu-chi-${report.fromDate}-${report.toDate}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const max = report
    ? Math.max(1, ...report.daily.flatMap((d) => [d.grossVnd, d.expenseVnd]))
    : 1;
  return (
    <section className="finance-report">
      <div className="section-heading">
        <div>
          <span className="eyebrow">TỔNG QUAN KINH DOANH</span>
          <h2>Báo cáo thu chi</h2>
          <p className="muted">Theo dõi dòng tiền và các khoản chi của quán.</p>
        </div>
        <div className="button-row">
          <button
            className="secondary"
            disabled={!report || busy}
            onClick={exportCsv}
          >
            Xuất CSV tổng hợp
          </button>
          <button
            className="primary"
            disabled={disabled}
            onClick={() => {
              setFormError("");
              setAdding(true);
            }}
          >
            <Icon name="plus" /> Ghi khoản chi
          </button>
        </div>
      </div>
      <form
        className="surface date-filter"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setFilter({ fromDate: from, toDate: to });
        }}
      >
        <label>
          Từ ngày
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </label>
        <label>
          Đến ngày
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </label>
        <button className="primary" disabled={disabled || busy}>
          {busy ? "Đang tải…" : "Xem báo cáo"}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setOffset(0);
            setFrom(today);
            setTo(today);
            setFilter({ fromDate: today, toDate: today });
          }}
        >
          Hôm nay
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <>
          <div className="finance-metrics">
            {[
              [
                "Tổng thu",
                report.grossVnd,
                "Các khoản thanh toán đã xác nhận",
                "income",
              ],
              [
                "Hoàn tiền",
                report.refundVnd,
                "Theo ngày ghi nhận hoàn",
                "refund",
              ],
              ["Thu ròng", report.netVnd, "Tổng thu trừ hoàn tiền", "net"],
              [
                "Chi phí",
                report.expenseVnd,
                "Phiếu chi còn hiệu lực",
                "expense",
              ],
              [
                "Chênh lệch thu - chi",
                report.balanceVnd,
                "Thu ròng trừ chi phí",
                "balance",
              ],
            ].map(([title, value, help, kind]) => (
              <article
                className={`surface finance-metric ${kind}`}
                key={String(title)}
              >
                <span>{title}</span>
                <strong>{money(Number(value))}</strong>
                <small>{help}</small>
              </article>
            ))}
          </div>
          <div className="info-note">
            <Icon name="receipt" />
            <p>
              {report.paymentsCount} khoản thanh toán · Thuế thu ròng:{" "}
              <strong>{money(report.netTaxVnd)}</strong>. Chênh lệch thu - chi
              là dòng tiền, chưa phải lợi nhuận kế toán. Các thanh toán hiện
              dùng mô phỏng.
            </p>
          </div>
          <section className="surface finance-chart">
            <div className="section-heading">
              <h3>Thu và chi theo ngày</h3>
              <div className="chart-legend">
                <span className="legend-income">Thu</span>
                <span className="legend-expense">Chi</span>
              </div>
            </div>
            {!report.daily.some((d) => d.grossVnd || d.expenseVnd) ? (
              <div className="empty compact">
                <Icon name="receipt" />
                <h3>Chưa có giao dịch trong khoảng ngày này</h3>
                <p>
                  Các khoản đã thanh toán và phiếu chi sẽ được tổng hợp tại đây.
                </p>
              </div>
            ) : (
              <div
                className="chart-scroll"
                role="region"
                aria-label="Biểu đồ thu chi theo ngày"
                tabIndex={0}
              >
                <div className="daily-bars">
                  {report.daily.map((day) => (
                    <div
                      className="day-column"
                      key={day.date}
                      title={`${day.date}: thu ${money(day.grossVnd)}, chi ${money(day.expenseVnd)}`}
                    >
                      <div className="bar-pair">
                        <span
                          className="income-bar"
                          style={{
                            height: `${Math.max(day.grossVnd ? 2 : 0, (day.grossVnd / max) * 100)}%`,
                          }}
                        />
                        <span
                          className="expense-bar"
                          style={{
                            height: `${Math.max(day.expenseVnd ? 2 : 0, (day.expenseVnd / max) * 100)}%`,
                          }}
                        />
                      </div>
                      <small>
                        {day.date.slice(8)}/{day.date.slice(5, 7)}
                      </small>
                      <span className="sr-only">
                        Thu {money(day.grossVnd)}, chi {money(day.expenseVnd)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <details>
              <summary>Xem số liệu theo ngày</summary>
              <div className="data-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Ngày</th>
                      <th>Tổng thu</th>
                      <th>Hoàn tiền</th>
                      <th>Chi phí</th>
                      <th>Chênh lệch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.daily.map((d) => (
                      <tr key={d.date}>
                        <td>{d.date}</td>
                        <td>{money(d.grossVnd)}</td>
                        <td>{money(d.refundVnd)}</td>
                        <td>{money(d.expenseVnd)}</td>
                        <td>{money(d.balanceVnd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <section className="surface">
            <div className="section-heading">
              <h3>Sổ chi phí</h3>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void load()}
              >
                Làm mới
              </button>
            </div>
            {!report.expenses.length ? (
              <div className="empty compact">
                <p>Chưa có phiếu chi trong khoảng ngày đã chọn.</p>
              </div>
            ) : (
              <div className="data-table-scroll">
                <table className="expense-table">
                  <thead>
                    <tr>
                      <th>Ngày chi</th>
                      <th>Nội dung</th>
                      <th>Nhóm chi</th>
                      <th>Số tiền</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.expenses.map((e) => (
                      <tr key={e.id} className={e.voidedAt ? "voided" : ""}>
                        <td>{e.spentOn}</td>
                        <td>
                          <strong>{e.note}</strong>
                          <small>
                            #{e.id} · {e.createdBy}
                          </small>
                          {e.voidedAt && (
                            <small>Lý do hủy: {e.voidReason}</small>
                          )}
                        </td>
                        <td>{e.category}</td>
                        <td>{money(e.amountVnd)}</td>
                        <td>
                          <span className={`pill ${e.voidedAt ? "" : "green"}`}>
                            {e.voidedAt ? "Đã hủy phiếu" : "Đã ghi chi"}
                          </span>
                        </td>
                        <td>
                          {!e.voidedAt && (
                            <button
                              className="text-button"
                              disabled={disabled}
                              onClick={() => {
                                setVoiding(e);
                                setReason("");
                                setFormError("");
                              }}
                            >
                              Hủy phiếu #{e.id}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pagination">
              <button
                disabled={!offset || busy}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Trang trước
              </button>
              <span>Trang {offset / 50 + 1}</span>
              <button
                disabled={!report.hasMore || busy}
                onClick={() => setOffset(offset + 50)}
              >
                Trang sau
              </button>
            </div>
          </section>
        </>
      )}
      {adding && (
        <Dialog
          label="Ghi khoản chi"
          onClose={() => {
            if (!saving) setAdding(false);
          }}
        >
          <div className="section-heading">
            <h2>Ghi khoản chi</h2>
            <button
              type="button"
              aria-label="Đóng ghi chi"
              disabled={saving}
              onClick={() => setAdding(false)}
            >
              ×
            </button>
          </div>
          <p className="muted">
            Ghi nhận chi phí đã phát sinh. Phiếu được giữ để đối chiếu.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (saving) return;
              const form = new FormData(e.currentTarget);
              setSaving(true);
              setFormError("");
              try {
                await command("CREATE_EXPENSE", {
                  amountVnd: Number(form.get("amount")),
                  category: form.get("category"),
                  note: form.get("note"),
                  spentOn: form.get("spentOn"),
                });
                setAdding(false);
                await load();
              } catch (e) {
                setFormError((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <label>
              Số tiền chi (VND)
              <input
                name="amount"
                type="number"
                required
                min="1"
                max="1000000000"
                step="1"
                inputMode="numeric"
              />
            </label>
            <label>
              Nhóm chi
              <select name="category">
                {[
                  "Nguyên liệu",
                  "Nhân sự",
                  "Mặt bằng",
                  "Điện nước",
                  "Thiết bị",
                  "Khác",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Nội dung chi
              <input
                name="note"
                required
                maxLength={500}
                placeholder="Ví dụ: nhập sữa và cà phê"
              />
            </label>
            <label>
              Ngày chi
              <input
                name="spentOn"
                type="date"
                required
                defaultValue={today}
                max={today}
              />
            </label>
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <button className="primary full" disabled={saving || disabled}>
              {saving ? "Đang ghi…" : "Lưu khoản chi"}
            </button>
          </form>
        </Dialog>
      )}
      {voiding && (
        <Dialog
          label="Hủy phiếu chi"
          onClose={() => {
            if (!saving) setVoiding(undefined);
          }}
        >
          <h2>Hủy phiếu chi #{voiding.id}?</h2>
          <p>
            {voiding.note} · <strong>{money(voiding.amountVnd)}</strong>
          </p>
          <p className="muted">
            Phiếu vẫn được giữ trong sổ. Khoản chi sẽ không tính vào tổng sau
            khi hủy.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (saving) return;
              setSaving(true);
              setFormError("");
              try {
                await command("VOID_EXPENSE", {
                  expenseId: voiding.id,
                  reason,
                });
                setVoiding(undefined);
                await load();
              } catch (e) {
                setFormError((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <label>
              Lý do hủy
              <input
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
            </label>
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <div className="button-row">
              <button
                type="button"
                disabled={saving}
                onClick={() => setVoiding(undefined)}
              >
                Giữ phiếu
              </button>
              <button
                className="primary"
                disabled={saving || disabled || !reason.trim()}
              >
                Xác nhận hủy phiếu
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
