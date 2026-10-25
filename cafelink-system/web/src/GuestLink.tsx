import { useState } from "react";

export function GuestLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function copy() {
    setCopied(false);
    setError("");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Chọn ô link bên dưới, nhấn Ctrl+C hoặc chạm giữ để sao chép thủ công.");
    }
  }
  return (
    <div className="guest-link">
      <button className="secondary" onClick={() => void copy()}>
        Sao chép link đặt món
      </button>
      {copied && <p role="status">Đã sao chép. Dán link vào cửa sổ riêng tư hoặc gửi tới điện thoại dùng thử.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <label>
        Link đặt món
        <input readOnly value={url} onFocus={(event) => event.target.select()} />
      </label>
    </div>
  );
}
