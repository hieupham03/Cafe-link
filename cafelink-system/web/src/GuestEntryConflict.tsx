import { Brand } from "./Icons";
import { GuestLink } from "./GuestLink";

export function GuestEntryConflict({ grant, tableGrant, role = "ADMIN" }: {
  grant: string | null;
  tableGrant: boolean;
  role?: string;
}) {
  const url = grant
    ? `${location.origin}/join#${tableGrant ? "table" : "grant"}=${encodeURIComponent(grant)}`
    : null;
  return (
    <main className="guest-join">
      <section className="guest-welcome">
        <Brand />
        <h1>Bạn đang đăng nhập {role === "STAFF" ? "nhân viên" : "quản lý"}</h1>
        <p>Trang này đang dùng tài khoản tại quầy. Khách vui lòng quét mã QR bằng điện thoại để mở đơn riêng tại bàn.</p>
        <p>Phiên tại quầy vẫn được giữ nguyên. Mở thêm tab thường vẫn dùng chung phiên này.</p>
        {url ? <GuestLink url={url} /> : <p className="warning banner">Link hiện tại không còn mã gia nhập. Về màn hình quản lý, mở QR của bàn rồi sao chép link đặt món hoặc quét lại bằng điện thoại.</p>}
        <a className="secondary" href="/admin">{role === "STAFF" ? "Về màn hình nhân viên" : "Về màn hình quản lý"}</a>
      </section>
    </main>
  );
}
