import { useEffect, useState } from "react";
import { api } from "./api";
import type { SessionInfo, TaxSettings } from "./models";
import { money, taxQuote } from "./models";
import { OrderTotals } from "./OrderTotals";
import { Icon } from "./Icons";
import { staffJournal } from "./staffJournal";
export function TaxSettingsPanel({
  session,
  disabled,
  onChanged,
}: {
  session: SessionInfo;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [settings, setSettings] = useState<TaxSettings>(),
    [name, setName] = useState("Thuế"),
    [rate, setRate] = useState("0"),
    [mode, setMode] = useState<TaxSettings["mode"]>("EXCLUSIVE");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    try {
      const value = await api.command<TaxSettings>(
        session.csrfToken,
        "GET_TAX_SETTINGS",
        {},
      );
      setSettings(value);
      setName(value.name);
      setRate(String(value.rateBps / 100));
      setMode(value.mode);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [session.csrfToken]);
  const bps = Math.round(Number(rate) * 100),
    valid =
      Number.isFinite(bps) &&
      bps >= 0 &&
      bps <= 10000 &&
      /^\d+(\.\d{0,2})?$/.test(rate);
  const preview = {
    ...taxQuote(100000, { name, mode, rateBps: valid ? bps : 0, version: 0 }),
    taxName: name,
    taxRateBps: valid ? bps : 0,
    taxIncluded: mode === "INCLUSIVE",
  };
  return (
    <section className="settings-layout">
      <form
        className="surface settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || !settings || busy) return;
          setBusy(true);
          setError("");
          setNotice("");
          try {
            const value = (await staffJournal.execute(
              session,
              "SAVE_TAX_SETTINGS",
              { name, mode, rateBps: bps, expectedVersion: settings.version },
            )) as unknown as TaxSettings;
            setSettings(value);
            setNotice("Đã lưu cấu hình thuế cho các đơn đặt mới.");
            onChanged();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">CẤU HÌNH QUÁN</span>
            <h2>Thuế trên hóa đơn</h2>
          </div>
          <Icon name="receipt" />
        </div>
        <p className="muted">
          Chọn cách hiển thị và tính thuế phù hợp với chính sách của quán.
        </p>
        <label>
          Tên thuế
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
            placeholder="Ví dụ: VAT"
          />
        </label>
        <label>
          Thuế suất (%)
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <label>
          Cách tính thuế
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as TaxSettings["mode"])}
          >
            <option value="EXCLUSIVE">Cộng thuế ngoài giá thực đơn</option>
            <option value="INCLUSIVE">Giá thực đơn đã bao gồm thuế</option>
          </select>
        </label>
        <p className="field-help">
          Thuế suất 0% giữ nguyên giá. Tiền được làm tròn đến một đồng cho mỗi
          đơn.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}{" "}
            <button type="button" onClick={() => void load()}>
              Tải lại cấu hình
            </button>
          </p>
        )}
        {notice && (
          <p className="order-receipt" role="status">
            {notice}
          </p>
        )}
        <button
          className="primary"
          disabled={disabled || busy || !settings || !valid}
        >
          {busy ? "Đang lưu…" : "Lưu cấu hình thuế"}
        </button>
      </form>
      <aside className="surface tax-preview">
        <span className="eyebrow">XEM TRƯỚC HÓA ĐƠN</span>
        <h2>Một đơn {money(100000)}</h2>
        <p className="muted">Tổng giá món trong thực đơn: {money(100000)}</p>
        <OrderTotals order={preview} />
        <div className="info-note">
          <Icon name="check" />
          <p>
            Đơn đã gửi giữ nguyên tiền và thuế. Thay đổi này chỉ áp dụng cho đơn
            mới.
          </p>
        </div>
      </aside>
    </section>
  );
}
