import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { journal, withJournalLock } from "./journal";
import { api } from "./api";
import type { MenuItem, SessionInfo, Snapshot } from "./models";
import { GuestMenu } from "./GuestMenu";
import { GuestOrders } from "./GuestOrders";
import type { Order, OrderResolution } from "./models";
import { Brand, Icon } from "./Icons";
import { DrinkArt } from "./DrinkArt";
import type { IconName } from "./Icons";

export function GuestJoin({
  grant,
  tableGrant = false,
  error,
  onJoined,
  onError,
}: {
  grant: string | null;
  tableGrant?: boolean;
  error: string;
  onJoined: (session: SessionInfo) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    lock = useRef(false);
  async function join() {
    if (!grant || lock.current) return;
    lock.current = true;
    setBusy(true);
    onError("");
    try {
      const session = await withJournalLock(async () => {
        await journal.assertNone();
        return api.join(grant, tableGrant);
      });
      history.replaceState(null, "", "/guest");
      onJoined(session);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function leave() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await withJournalLock(async () => {
        await journal.assertNone();
        await api.leave();
      });
      onError("");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="guest-join">
      <div className="guest-welcome">
        <Brand />
        <div className="welcome-art" aria-hidden="true">
          <DrinkArt name="Cà phê sữa" scene />
        </div>
        <span className="eyebrow">CHÀO BẠN ĐẾN VỚI QUÁN</span>
        <h1>
          Một chút cà phê,
          <br />
          một khoảng thảnh thơi.
        </h1>
        <div className="welcome-steps" aria-label="Các bước gọi món">
          <span>
            <b>01</b>Quét mã
          </span>
          <span>
            <b>02</b>Chọn món
          </span>
          <span>
            <b>03</b>Thanh toán
          </span>
        </div>
        <p>
          {tableGrant
            ? "Quét QR tại bàn để đặt và thanh toán. Đơn của bạn được giữ riêng trên trình duyệt này."
            : "Quét QR nhân viên cung cấp để vào đúng lượt bàn của bạn."}
        </p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {grant ? (
          <button
            className="primary full"
            disabled={busy}
            onClick={() => void join()}
          >
            {busy ? "Đang kết nối…" : "Vào bàn của tôi"}
          </button>
        ) : (
          <p className="warning banner">
            Hãy quét lại QR tại bàn hoặc nhờ nhân viên hỗ trợ. Link không còn mã
            gia nhập.
          </p>
        )}
        {error && (
          <>
            <p className="muted">
              Nếu cần đổi sang QR mới, hãy chủ động rời phiên cũ trước.
            </p>
            <button
              className="secondary full"
              disabled={busy}
              onClick={() => void leave()}
            >
              Rời phiên cũ trên trình duyệt
            </button>
          </>
        )}
      </div>
    </main>
  );
}
export function GuestHome({
  session,
  state,
  connected,
  error,
  onLogout,
  onRestart,
  previousOrders = [],
  previousResolutions = [],
  cartQuantity = 0,
  ordering,
  menuControl,
  onChoose,
  disabled = false,
}: {
  session: SessionInfo;
  state: Snapshot | null;
  connected: boolean;
  error: string;
  onLogout: () => void;
  onRestart?: () => void;
  previousOrders?: Order[];
  previousResolutions?: OrderResolution[];
  cartQuantity?: number;
  ordering?: ReactNode;
  menuControl?: (item: MenuItem) => ReactNode;
  onChoose?: (item: MenuItem, quantity: number, note?: string) => Promise<boolean>;
  disabled?: boolean;
}) {
  const table = state?.tables[0],
    ended = table?.status === "SESSION_ENDED";
  const [active, setActive] = useState(location.hash || "#guest-menu");
  useEffect(() => {
    const changed = () => setActive(location.hash || "#guest-menu");
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  const unpaid = state?.orders.filter(order => ["UNPAID", "PENDING"].includes(order.paymentState ?? "")).length ?? 0;
  const waitingSupport = state?.tickets.filter(ticket => ticket.type === "CALL_SERVICE" && ticket.status === "OPEN").length ?? 0;
  const navigation: { href: string; zone: string; icon: IconName; title: string; description: string; count: number }[] = [
    { href: "#guest-menu", zone: "menu", icon: "menu", title: "Thực đơn", description: "Chọn đồ uống yêu thích", count: state?.menu.length ?? 0 },
    { href: "#guest-orders", zone: "orders", icon: "receipt", title: "Đơn đã gọi", description: "Xem tiến độ phục vụ", count: state?.orders.length ?? 0 },
    { href: "#guest-support", zone: "support", icon: "help", title: "Hỗ trợ", description: waitingSupport ? "Yêu cầu đang chờ" : "Nhắn nhân viên tại bàn", count: waitingSupport },
    { href: "#guest-checkout", zone: "payment", icon: "check", title: table?.paymentMode === "PREPAY" ? "Thanh toán" : "Tính tiền", description: table?.paymentMode === "PREPAY" ? (unpaid ? "Đơn chưa thanh toán" : "Kiểm tra thanh toán") : "Yêu cầu tính tiền tại bàn", count: unpaid },
    { href: "#guest-cart", zone: "cart", icon: "bag", title: "Giỏ hàng", description: "Kiểm tra món trước khi gửi", count: cartQuantity },
  ];
  return (
    <main className="guest-home">
      <header className="guest-header">
        <Brand />
        <span className="guest-header-note">
          Gọi món tại bàn · Thanh toán thuận tiện
        </span>
        <button className="text-button" onClick={onLogout}>
          Rời phiên
        </button>
      </header>
      <section className="guest-hero">
        <div className="guest-hero-copy">
          <span className="table-location">
            <Icon name="table" />
            ĐANG PHỤC VỤ TẠI
          </span>
          <h1>{table?.name ?? `Bàn ${session.identity.tableId}`}</h1>
          <h2>
            Một ly ngon.
            <br />
            Một khoảng nghỉ.
          </h2>
          <p>
            {ended
              ? "Các đơn trước đã hoàn tất. Bạn có thể gọi thêm hoặc cần hỗ trợ."
              : "Chọn món bạn thích, chúng mình mang đến tận bàn."}
          </p>
          <span
            className={`connection ${connected ? "online" : "offline"}`}
            role="status"
          >
            ● {connected ? "Đang kết nối" : "Chưa kết nối"}
          </span>
        </div>
        <div className="hero-drinks" aria-hidden="true">
          <span className="hero-orbit" />
          <div className="hero-drink-back">
            <DrinkArt name="Trà đào" scene />
          </div>
          <div className="hero-drink-front">
            <DrinkArt name="Latte" scene />
          </div>
          <span className="hero-caption">
            <Icon name="leaf" />
            Dành một chút thời gian cho bạn
          </span>
        </div>
      </section>
      {(!ended || table?.automatic) && (
        <nav className="guest-nav" aria-label="Điều hướng tại bàn">
          {navigation.map(({ href, zone, icon, title, description, count }) => (
            <a
              key={href}
              href={href}
              data-guest-zone={zone}
              aria-label={title}
              aria-describedby={`nav-${zone}-description nav-${zone}-count`}
              aria-current={active === href ? "location" : undefined}
            >
              <span className="guest-nav-icon"><Icon name={icon} /></span>
              <span className="guest-nav-title">{title}</span>
              <span className="guest-nav-description" id={`nav-${zone}-description`}>{description}</span>
              <span className="guest-nav-count" id={`nav-${zone}-count`}>
                <span className="sr-only">{zone === "cart" ? "Số phần trong giỏ: " : zone === "payment" ? "Số đơn chưa thanh toán: " : zone === "support" ? "Số yêu cầu đang chờ: " : zone === "orders" ? "Số đơn đã gọi: " : "Số món trong thực đơn: "}</span>
                {count}
              </span>
            </a>
          ))}
        </nav>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className={`guest-layout ${ended ? "is-complete" : ""}`}>
        <section className="guest-main">
          {ended ? (
            <div className="empty">
              <h2>Cảm ơn bạn đã ghé quán</h2>
              <p>
                {table?.automatic
                  ? "Các đơn và hỗ trợ đã hoàn tất. Giỏ đang soạn vẫn được giữ. Bắt đầu lần đặt mới để xem lại giỏ hoặc gọi hỗ trợ, không cần nhân viên mở bàn."
                  : "Phiên này không được dùng cho lượt khách mới. Hãy rời phiên và xin QR mới nếu tiếp tục sử dụng bàn."}
              </p>
              {table?.automatic && onRestart && (
                <button
                  className="primary"
                  disabled={disabled}
                  onClick={onRestart}
                >
                  Bắt đầu lần đặt mới
                </button>
              )}
            </div>
          ) : null}
            <>
              <p className="guest-service-note">
                {state?.tables[0]?.paymentMode === "PREPAY"
                  ? "Chọn đồ uống, xác nhận giỏ và thanh toán trước. Quán pha chế sau khi Server xác nhận đã thanh toán."
                  : "Chọn đồ uống và gửi giỏ món đến quán. Bạn có thể gọi nhân viên hoặc yêu cầu tính tiền ngay trên trang này."}
              </p>
              {state ? (
                <GuestMenu
                  menu={state.menu}
                  menuControl={menuControl}
                  onChoose={onChoose}
                  disabled={disabled}
                  error={error}
                />
              ) : (
                <div className="loading-panel" role="status">
                  Đang tải thực đơn và trạng thái bàn…
                </div>
              )}
              <GuestOrders orders={state?.orders ?? []} resolutions={state?.resolutions} />
              {previousOrders.length > 0 && <GuestOrders orders={previousOrders} resolutions={previousResolutions} previous />}
            </>
        </section>
        <aside
          className="guest-rail"
          aria-label="Giỏ món, thanh toán và hỗ trợ"
        >
          {ordering}
        </aside>
      </div>
      <footer className="guest-footer">
        <Brand />
        <span>Cảm ơn bạn đã chọn một khoảng nghỉ cùng CafeLink.</span>
      </footer>
    </main>
  );
}
