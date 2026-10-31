import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";
import type { SessionInfo, TaxSettings } from "./models";
import { money, taxPreview } from "./models";
import { Dialog } from "./Dialog";

interface Totals {
  salesVnd: number; otherIncomeVnd: number; expensesVnd: number; refundsVnd: number;
  taxVnd: number; refundedTaxVnd: number; incomeVnd: number; outflowVnd: number; netVnd: number; netTaxVnd: number;
}
interface Report { fromDate: string; toDate: string; totals: Totals; days: (Totals & { date: string })[] }
interface CashEntry { id: number; kind: "INCOME" | "EXPENSE"; amountVnd: number; category: string; note: string; entryDate: string; actor: string; voidedAt?: string; voidReason?: string }
interface EntryPage { entries: CashEntry[]; hasMore: boolean }
interface Pending { id: string; action: string; data: Record<string, unknown> }
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dateLabel = (date: string) => date.split("-").reverse().join("/");

export function FinanceDashboard({ session }: { session: SessionInfo }) {
  const [tab, setTab] = useState<"report" | "tax">("report");
  const [from, setFrom] = useState(() => today().slice(0, 8) + "01"), [to, setTo] = useState(today);
  const [report, setReport] = useState<Report | null>(null), [entries, setEntries] = useState<CashEntry[]>([]), [more, setMore] = useState(false);
  const [settings, setSettings] = useState<TaxSettings | null>(null), [rate, setRate] = useState("0");
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [entryKind, setEntryKind] = useState<"INCOME" | "EXPENSE" | null>(null), [voiding, setVoiding] = useState<CashEntry | null>(null);
  const lock = useRef(false), generation = useRef(0);
  const storageKey = `cafelink-finance:${session.identity.storeId}:${session.identity.username}`;
  const [pending, setPending] = useState<Pending | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as Pending | null; } catch { return null; }
  });
  const command = <T,>(action: string, data: unknown, id?: string) => api.command<T>(session.csrfToken, action, data, id);
  async function load(append = false) {
    const current = ++generation.current;
    setLoading(true); setError("");
    try {
      if (!from || !to || from > to) throw Error("Chọn ngày bắt đầu và kết thúc hợp lệ.");
      const pageData = { fromDate: from, toDate: to, ...(append && entries.length ? { beforeId: entries.at(-1)!.id } : {}) };
      const [nextReport, page] = await Promise.all([
        command<Report>("GET_FINANCE_REPORT", { fromDate: from, toDate: to }),
        command<EntryPage>("GET_CASH_ENTRIES", pageData),
      ]);
      if (current !== generation.current) return;
      setReport(nextReport); setEntries(previous => append ? [...previous, ...page.entries] : page.entries); setMore(page.hasMore);
    } catch (e) { if (current === generation.current) setError((e as Error).message); }
    finally { if (current === generation.current) setLoading(false); }
  }
  async function loadSettings() {
    try { const value = await command<TaxSettings>("GET_TAX_SETTINGS", {}); setSettings(value); setRate(String(value.rateBps / 100)); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); return () => { generation.current++; }; }, [session.csrfToken, from, to]);
  useEffect(() => { void loadSettings(); }, [session.csrfToken]);

  async function perform(action?: string, data?: Record<string, unknown>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    const attempt = pending ?? { id: crypto.randomUUID(), action: action!, data: data! };
    try {
      // Keep the same command ID through uncertain network results and page reloads.
      sessionStorage.setItem(storageKey, JSON.stringify(attempt)); setPending(attempt);
      await command(attempt.action, attempt.data, attempt.id);
      sessionStorage.removeItem(storageKey); setPending(null); setEntryKind(null); setVoiding(null);
      await load();
      if (attempt.action === "SAVE_TAX_SETTINGS") await loadSettings();
      setNotice(attempt.action === "SAVE_TAX_SETTINGS" ? "Đã lưu cấu hình thuế. Áp dụng cho các đơn mới." : "Đã cập nhật sổ thu chi.");
    } catch (e) {
      if (e instanceof ApiError && ["INVALID_INPUT", "INVALID_STATE", "VERSION_CONFLICT", "COMMAND_CONFLICT"].includes(e.code)) {
        sessionStorage.removeItem(storageKey); setPending(null);
      }
      setError((e as Error).message);
    } finally { lock.current = false; setBusy(false); }
  }
  function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void perform("CREATE_CASH_ENTRY", { kind: entryKind, amountVnd: Number(form.get("amount")), category: String(form.get("category")).trim(), note: String(form.get("note")).trim(), entryDate: String(form.get("date")) });
  }
  function download() {
    if (!report) return;
    const rows = [
      ["Ngày", "Thu bán hàng (gồm thuế)", "Thu khác", "Chi khác", "Hoàn tiền", "Tổng thu", "Tổng chi", "Chênh lệch", "Thuế thu", "Thuế hoàn", "Thuế còn lại"],
      ...report.days.map(d => [d.date, d.salesVnd, d.otherIncomeVnd, d.expensesVnd, d.refundsVnd, d.incomeVnd, d.outflowVnd, d.netVnd, d.taxVnd, d.refundedTaxVnd, d.netTaxVnd]),
      ["Tổng", report.totals.salesVnd, report.totals.otherIncomeVnd, report.totals.expensesVnd, report.totals.refundsVnd, report.totals.incomeVnd, report.totals.outflowVnd, report.totals.netVnd, report.totals.taxVnd, report.totals.refundedTaxVnd, report.totals.netTaxVnd],
    ];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(row => row.join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `thu-chi-${report.fromDate}-${report.toDate}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const disabled = busy || !!pending;
  const currentRange = report?.fromDate === from && report?.toDate === to;
  const previewSettings = settings ? { ...settings, rateBps: Math.min(10000, Math.max(0, Math.round((Number(rate) || 0) * 100))) } : undefined;
  const preview = taxPreview(100000, previewSettings);
  return <section className="finance-dashboard">
    <div className="finance-tabs" aria-label="Quản lý tài chính">
      <button className={tab === "report" ? "primary" : "secondary"} aria-pressed={tab === "report"} onClick={() => setTab("report")}>Báo cáo thu chi</button>
      <button className={tab === "tax" ? "primary" : "secondary"} aria-pressed={tab === "tax"} onClick={() => setTab("tax")}>Cấu hình thuế hóa đơn</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="finance-notice" role="status">{notice}</p>}
    {pending && <div className="warning"><p>Đang chờ xác nhận thao tác. Có thể kiểm tra lại với cùng mã yêu cầu để tránh ghi trùng.</p><button className="secondary" disabled={busy} onClick={() => void perform()}>Kiểm tra và tiếp tục</button></div>}
    {tab === "report" ? <>
      <div className="finance-intro"><div><span className="eyebrow">SỔ THU CHI CỦA QUÁN</span><h2>Nắm rõ dòng tiền mỗi ngày</h2><p>Thu bán hàng tự lấy từ hóa đơn đã thanh toán. Ghi thêm các khoản thu, chi khác tại đây.</p></div><div className="button-row"><button className="secondary" disabled={disabled} onClick={() => setEntryKind("INCOME")}>+ Ghi khoản thu</button><button className="primary" disabled={disabled} onClick={() => setEntryKind("EXPENSE")}>+ Ghi khoản chi</button></div></div>
      <div className="finance-filters">
        <label>Từ ngày<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label>Đến ngày<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        <button className="secondary" disabled={loading} onClick={() => void load()}>Tải lại báo cáo</button>
        <button className="secondary" disabled={loading || !report || !currentRange} onClick={download}>Xuất CSV</button>
      </div>
      {loading && <p role="status">Đang tải báo cáo…</p>}
      {report && currentRange && <>
        <div className="finance-metrics">
          <article><span>Tổng thu</span><strong>{money(report.totals.incomeVnd)}</strong><small>Bán hàng {money(report.totals.salesVnd)} · Thu khác {money(report.totals.otherIncomeVnd)}</small></article>
          <article><span>Tổng chi</span><strong>{money(report.totals.outflowVnd)}</strong><small>Chi khác {money(report.totals.expensesVnd)} · Hoàn tiền {money(report.totals.refundsVnd)}</small></article>
          <article><span>Chênh lệch thu − chi</span><strong>{money(report.totals.netVnd)}</strong><small>Số thu còn lại sau các khoản chi trong kỳ</small></article>
          <article><span>Thuế trên hóa đơn</span><strong>{money(report.totals.netTaxVnd)}</strong><small>Đã trừ {money(report.totals.refundedTaxVnd)} thuế của đơn hoàn</small></article>
        </div>
        <p className="muted finance-footnote">Giờ Việt Nam · Thu bán hàng đã gồm thuế. Chênh lệch thu chi không phải lợi nhuận kế toán. Giao dịch thanh toán hiện là giả lập.</p>
        <section className="finance-card"><h3>Theo ngày</h3><div className="finance-table-scroll"><table className="finance-table"><thead><tr><th>Ngày</th><th>Tổng thu</th><th>Tổng chi</th><th>Chênh lệch</th><th>Thuế</th></tr></thead><tbody>
          {report.days.filter(d => d.incomeVnd || d.outflowVnd).map(d => <tr key={d.date}><td>{dateLabel(d.date)}</td><td>{money(d.incomeVnd)}</td><td>{money(d.outflowVnd)}</td><td>{money(d.netVnd)}</td><td>{money(d.netTaxVnd)}</td></tr>)}
          {!report.days.some(d => d.incomeVnd || d.outflowVnd) && <tr><td colSpan={5} className="empty">Chưa có khoản thu chi trong thời gian này.</td></tr>}
        </tbody></table></div></section>
      </>}
      <section className="finance-card"><h3>Các khoản thu chi nhập thêm</h3><p className="muted">Khoản đã hủy vẫn được giữ để đối chiếu và không cộng vào báo cáo.</p>
        {currentRange && <><div className="finance-entry-list">{entries.map(entry => <article className={`finance-entry ${entry.voidedAt ? "is-void" : ""}`} key={entry.id}>
          <div><span className={`finance-kind ${entry.kind.toLowerCase()}`}>{entry.kind === "INCOME" ? "Thu" : "Chi"}</span><strong>{entry.category}</strong><p>{entry.note || "Không có ghi chú"}</p><small>{dateLabel(entry.entryDate)} · {entry.actor} · #{entry.id}</small>{entry.voidedAt && <p>Đã hủy: {entry.voidReason}</p>}</div>
          <div><strong>{money(entry.amountVnd)}</strong>{!entry.voidedAt && <button className="secondary" disabled={disabled} onClick={() => setVoiding(entry)}>Hủy bút toán #{entry.id}</button>}</div>
        </article>)}</div>{!entries.length && !loading && <p className="empty">Chưa ghi thêm khoản thu chi nào.</p>}{more && <button className="secondary" disabled={loading} onClick={() => void load(true)}>Xem bút toán cũ hơn</button>}</>}
      </section>
    </> : <section className="finance-card tax-settings">
      <div><span className="eyebrow">DÀNH CHO CHỦ CỬA HÀNG</span><h2>Cấu hình thuế hóa đơn</h2><p className="muted">Cấu hình áp dụng khi khách gửi đơn mới. Đơn và hóa đơn đã tạo giữ nguyên thuế suất, số tiền.</p></div>
      {settings ? <form onSubmit={e => { e.preventDefault(); void perform("SAVE_TAX_SETTINGS", { ...settings, rateBps: Math.round(Number(rate) * 100), expectedVersion: settings.version }); }}>
        <fieldset disabled={disabled}>
          <label className="finance-check"><input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} />Áp dụng thuế trên hóa đơn</label>
          <div className="finance-form-grid"><label>Tên thuế<input required maxLength={40} value={settings.name} onChange={e => setSettings({ ...settings, name: e.target.value })} placeholder="VAT" /></label><label>Thuế suất (%)<input type="number" required min="0" max="100" step="0.01" value={rate} onChange={e => setRate(e.target.value)} /></label></div>
          <label>Cách tính thuế<select value={settings.inclusive ? "included" : "added"} onChange={e => setSettings({ ...settings, inclusive: e.target.value === "included" })}><option value="added">Cộng thuế vào giá món</option><option value="included">Giá món đã bao gồm thuế</option></select></label>
          <div className="tax-preview"><h3>Ví dụ với giá món 100.000 ₫</h3><div className="tax-breakdown"><span>Tiền hàng trước thuế<strong>{money(preview.subtotalVnd)}</strong></span><span>{settings.name || "Thuế"}<strong>{money(preview.taxVnd)}</strong></span><span>Khách thanh toán<strong>{money(preview.totalVnd)}</strong></span></div><small>Làm tròn tiền thuế đến đồng trên mỗi đơn.</small></div>
          <div className="button-row"><button type="submit" className="primary">{busy ? "Đang lưu…" : "Lưu cấu hình thuế"}</button><button type="button" className="secondary" onClick={() => void loadSettings()}>Tải lại cấu hình</button></div>
        </fieldset>
      </form> : <p role="status">Đang tải cấu hình…</p>}
    </section>}
    {entryKind && <Dialog label={entryKind === "INCOME" ? "Ghi khoản thu" : "Ghi khoản chi"} onClose={() => { if (!busy) setEntryKind(null); }}>
      <div className="section-heading"><h2>{entryKind === "INCOME" ? "Ghi khoản thu" : "Ghi khoản chi"}</h2><button aria-label="Đóng bút toán" disabled={busy} onClick={() => setEntryKind(null)}>×</button></div>
      <form className="finance-form" onSubmit={saveEntry}><fieldset disabled={disabled}>
        <label>Số tiền (VND)<input name="amount" type="number" min="1" max="1000000000" step="1" required autoFocus /></label>
        <label>Nhóm thu chi<input name="category" required maxLength={80} list="cash-categories" placeholder={entryKind === "INCOME" ? "Ví dụ: Thu khác" : "Ví dụ: Nguyên liệu"} /></label>
        <datalist id="cash-categories">{(entryKind === "INCOME" ? ["Thu khác", "Góp vốn"] : ["Nguyên liệu", "Tiền thuê mặt bằng", "Lương nhân viên", "Điện nước", "Mua sắm thiết bị", "Chi khác"]).map(name => <option key={name} value={name} />)}</datalist>
        <label>Ngày ghi nhận<input name="date" type="date" required defaultValue={today()} /></label>
        <label>Ghi chú<textarea name="note" maxLength={500} rows={3} placeholder="Nội dung hoặc mã chứng từ" /></label>
        <button type="submit" className="primary">Lưu bút toán</button>
      </fieldset></form>
      {error && <p className="error" role="alert">{error}</p>}{pending && <button className="secondary" disabled={busy} onClick={() => void perform()}>Kiểm tra và tiếp tục</button>}
    </Dialog>}
    {voiding && <Dialog label="Hủy bút toán" onClose={() => { if (!busy) setVoiding(null); }}>
      <div className="section-heading"><h2>Hủy bút toán #{voiding.id}</h2><button aria-label="Đóng hủy bút toán" disabled={busy} onClick={() => setVoiding(null)}>×</button></div>
      <p>{voiding.category} · {money(voiding.amountVnd)}</p><p>Khoản này sẽ được loại khỏi tổng thu chi, lịch sử vẫn được giữ.</p>
      <form className="finance-form" onSubmit={e => { e.preventDefault(); void perform("VOID_CASH_ENTRY", { entryId: voiding.id, reason: String(new FormData(e.currentTarget).get("reason")).trim() }); }}><label>Lý do hủy<textarea name="reason" required maxLength={500} rows={3} disabled={disabled} /></label><button className="primary" disabled={disabled}>Xác nhận hủy bút toán</button></form>
      {error && <p className="error" role="alert">{error}</p>}{pending && <button className="secondary" disabled={busy} onClick={() => void perform()}>Kiểm tra và tiếp tục</button>}
    </Dialog>}
  </section>;
}
