import { Brand } from "./Icons";
import { GuestLink } from "./GuestLink";

export function GuestEntryConflict({ grant, tableGrant }: {
  grant: string | null;
  tableGrant: boolean;
}) {
  const url = grant
    ? `${location.origin}/join#${tableGrant ? "table" : "grant"}=${encodeURIComponent(grant)}`
    : null;
  return (
    <main className="guest-join">
      <section className="guest-welcome">
        <Brand />
        <h1>Bạn đang đăng nhập quản lý</h1>
        <p>Các tab trong cùng hồ sơ trình duyệt dùng chung phiên đăng nhập. Để dùng thử như khách, hãy mở link đặt món bằng cửa sổ InPrivate/Ẩn danh (Ctrl+Shift+N trên Edge/Chrome), trình duyệt khác hoặc quét QR bằng điện thoại.</p>
        <p>Phiên quản lý vẫn được giữ nguyên. Mở thêm tab thường vẫn dùng chung phiên này.</p>
        {url ? <GuestLink url={url} /> : <p className="warning banner">Link hiện tại không còn mã gia nhập. Về màn hình quản lý, mở QR của bàn rồi sao chép link đặt món hoặc quét lại bằng điện thoại.</p>}
        <a className="secondary" href="/admin">Về màn hình quản lý</a>
      </section>
    </main>
  );
}
