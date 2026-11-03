import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";
import { Dialog } from "./Dialog";
import { GuestJoin } from "./Guest";
import { GuestEntryConflict } from "./GuestEntryConflict";
import { GuestWorkspace } from "./GuestWorkspace";
import { CheckoutControls } from "./CheckoutControls";
import { StaffAccountsPanel } from "./StaffAccountsPanel";
import { StaffMenu } from "./StaffMenu";
import { StaffTableDetails } from "./StaffTableDetails";
import { StaffRecovery } from "./StaffRecovery";
import { financialActions, staffJournal } from "./staffJournal";
import { VisitQrPanel } from "./VisitQrPanel";
import { AutomaticTablePanel } from "./AutomaticTablePanel";
import { SupportQueue, CashierQueue } from "./Worklists";
import { searchText, WaitTime } from "./ui";
import { MenuAdmin } from "./MenuAdmin";
import { SalesHistory } from "./SalesHistory";
import { Notifications } from "./Notifications";
import { PrepaidClose } from "./PrepaidClose";
import { Assistance } from "./Assistance";
import { SystemDiagnosticsPanel } from "./SystemDiagnostics";
import { OrderResolution } from "./OrderResolution";
import { AcceptanceQueue } from "./AcceptanceQueue";
import { FinanceReport } from "./FinanceReport";
import { TaxSettingsPanel } from "./TaxSettingsPanel";
import { TableQr } from "./TableQr";
import { Brand, Icon } from "./Icons";
import type { IconName } from "./Icons";
import { DrinkArt } from "./DrinkArt";
import { money, statusName } from "./models";
import type { Bill, SessionInfo, Snapshot, Table } from "./models";

// Fragment is consumed in memory before any exchange and never stored in localStorage.
const initialParams = new URLSearchParams(location.hash.slice(1));
const initialGrant = initialParams.get("grant") ?? initialParams.get("table");
const guestReconnectMessage =
  "Đang khôi phục kết nối tới quán. Yêu cầu chưa rõ kết quả sẽ không tự gửi lại.";
if (location.pathname === "/join" && location.hash)
  history.replaceState(null, "", location.pathname + location.search);

export function App() {
  const [grant, setGrant] = useState(initialGrant);
  const [tableGrant, setTableGrant] = useState(initialParams.has("table"));
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState("tables");
  const [selected, setSelected] = useState<Table | null>(null);
  const [bill, setBill] = useState<Bill | null>(null);
  const [confirmPay, setConfirmPay] = useState(false);
  const [confirmAll, setConfirmAll] = useState<"pause" | "end" | null>(null);
  const [confirmRevision, setConfirmRevision] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [requestQuery, setRequestQuery] = useState(""),
    [showHandled, setShowHandled] = useState(false),
    [orderFilter, setOrderFilter] = useState("all"),
    [tableFilter, setTableFilter] = useState("all");
  const [replies, setReplies] = useState<Record<number, string>>({});
  const commandLock = useRef(false);
  const isManager = session?.identity.role === "ADMIN";
  useEffect(()=>{if(session?.identity.role==='STAFF'&&!['tables','orders','requests','menu'].includes(view))setView('tables');},[session?.identity.role,view]);
  const selectedVersion = state?.tables.find(
    (t) => t.id === selected?.id,
  )?.version;
  useEffect(() => {
    setBill(null);
    setConfirmPay(false);
  }, [selected?.id, selectedVersion]);
  useEffect(() => {
    const changed = () => {
      if (location.pathname !== "/join" || !location.hash) return;
      const params = new URLSearchParams(location.hash.slice(1));
      setGrant(params.get("grant") ?? params.get("table"));
      setTableGrant(params.has("table"));
      history.replaceState(null, "", location.pathname + location.search);
      setError("");
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);

  useEffect(() => {
    let live = true;
    api
      .session()
      .then((value) => {
        if (!live) return;
        setSession(value);
      })
      .catch((e) => {
        if (live && (!(e instanceof ApiError) || e.code !== "UNAUTHENTICATED"))
          setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!grant || !session?.identity.membershipId) return;
    let live = true;
    api.join(grant, tableGrant).catch((e) => {
      if (live) setError((e as Error).message);
    });
    return () => {
      live = false;
    };
  }, [grant, tableGrant, session?.identity.membershipId]);
  useEffect(() => {
    if (!session || session.identity.role === "GUEST" ||
        ["/join", "/guest"].includes(location.pathname)) {
      setState(null);
      setConnected(false);
      return;
    }
    let disposed = false,
      retry: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined,
      ping: ReturnType<typeof setInterval> | undefined;
    let failures = 0;
    const accept = (value: Snapshot) =>
      setState((previous) =>
        !previous || value.revision >= previous.revision ? value : previous,
      );
    const open = async () => {
      try {
        const info = await api.session();
        if (disposed) return;
        if (info.csrfToken !== session.csrfToken) {
          setSession(info);
          return;
        }
        if (!info.connected) {
          setConnected(false);
          setError(
            "Mất kết nối TCP tới quán. Đăng nhập lại và đối chiếu trạng thái trước khi thao tác tiếp.",
          );
          return;
        }
        socket = new WebSocket(
          `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/state`,
        );
        socket.onopen = () => {
          if (disposed) return;
          failures = 0;
          setConnected(true);
          if (session.identity.role === "GUEST")
            setError((previous) =>
              previous === guestReconnectMessage ? "" : previous,
            );
          ping = setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) socket.send("PING");
          }, 20_000);
        };
        socket.onmessage = (event) => {
          if (disposed) return;
          const message = JSON.parse(event.data);
          if (message.type === "STATE") accept(message.state);
          else if (message.type === "SESSION_ENDED") {
            setSession(null);setState(null);setConnected(false);setError("Tài khoản đã bị khóa hoặc phiên đã được thu hồi. Vui lòng liên hệ quản lý.");
          }
          else if (message.type === "CONNECTION_LOST") {
            setConnected(false);
            setError(
              session.identity.role === "GUEST"
                ? guestReconnectMessage
                : "Kết nối TCP tới quán đã ngắt. Đăng nhập lại để đối chiếu dữ liệu.",
            );
            if (session.identity.role === "GUEST") socket?.close();
          }
        };
        socket.onclose = () => {
          clearInterval(ping);
          if (disposed) return;
          setConnected(false);
          // Re-establish the read channel only. Never replay a business command here.
          retry = setTimeout(open, Math.min(1000 * 2 ** failures++, 10_000));
        };
        const snapshot = await api.state();
        if (!disposed) accept(snapshot);
      } catch (e) {
        if (disposed) return;
        setConnected(false);
        if (e instanceof ApiError && e.status === 401) {
          setSession(null);
          setError(e.message);
        } else {
          setError((e as Error).message);
          retry = setTimeout(open, Math.min(1000 * 2 ** failures++, 10_000));
        }
      }
    };
    void open();
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearInterval(ping);
      socket?.close();
    };
  }, [session]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function run<T>(action: string, data: unknown): Promise<T | undefined> {
    if (!session || commandLock.current || !connected) return;
    commandLock.current = true;
    setBusy(true);
    setError("");
    try {
      if (session.identity.storeId && !action.startsWith("GET_"))
        await staffJournal.assertNone(session);
      const result =
        session.identity.storeId && financialActions.has(action)
          ? ((await staffJournal.execute(
              session,
              action,
              data as Record<string, unknown>,
            )) as T)
          : await api.command<T>(session.csrfToken, action, data);
      const refreshed = await api.state();
      setState((previous) =>
        !previous || refreshed.revision >= previous.revision
          ? refreshed
          : previous,
      );
      return result;
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 401) setSession(null);
      if (e instanceof ApiError && (e.status === 503 || e.status === 0))
        setConnected(false);
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (commandLock.current) return;
    commandLock.current = true;
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      setSession(
        await api.login(
          String(data.get("username")),
          String(data.get("password")),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }
  async function logout() {
    if (!session) return;
    try {
      if (session.identity.storeId) await staffJournal.assertNone(session);
      await api.logout(session.csrfToken);
      setSession(null);
      setSelected(null);
      setBill(null);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function checkConnection() {
    if (commandLock.current || !session) return;
    setError("");
    try {
      const current = await api.session();
      if (
        current.identity.username !== session.identity.username ||
        current.identity.storeId !== session.identity.storeId
      )
        throw new Error(
          "Phiên đã đổi. Hãy đăng nhập lại đúng tài khoản để đối chiếu.",
        );
      if (!current.connected)
        throw new Error(
          "Chưa nối được tới quán. Đăng nhập lại cùng tài khoản để kiểm tra các thao tác đang chờ.",
        );
      setSession(current);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loading)
    return (
      <div className="center-screen" role="status">
        Đang mở CafeLink…
      </div>
    );
  if (session && session.identity.role !== "GUEST" && ["/join", "/guest"].includes(location.pathname))
    return <GuestEntryConflict grant={grant} tableGrant={tableGrant} role={session.identity.role} />;
  if (!session && ["/join", "/guest"].includes(location.pathname))
    return (
      <GuestJoin
        grant={grant}
        tableGrant={tableGrant}
        error={error}
        onError={setError}
        onJoined={(value) => {
          setGrant(null);
          setError("");
          setSession(value);
        }}
      />
    );
  if (session?.identity.role === "GUEST")
    return (
      <GuestWorkspace
        key={session.identity.membershipId}
        session={session}
        onRestart={(value) => {
          setGrant(null);
          setError("");
          setSession(value);
        }}
        outerError={error}
        onLeft={() => {
          setSession(null);
          setError("");
        }}
      />
    );
  if (!session)
    return (
      <main className="login-screen">
        <section className="login-story">
          <Brand />
          <div className="login-art" aria-hidden="true">
            <DrinkArt name="Latte" scene />
          </div>
          <span className="eyebrow">MỘT NHỊP PHỤC VỤ, CẢ QUÁN KẾT NỐI</span>
          <h1>
            Chăm chút ly cà phê.
            <br />
            CafeLink kết nối phần còn lại.
          </h1>
          <p>
            Theo dõi bàn, tiếp nhận đơn và phối hợp phục vụ ngay trên một màn
            hình.
          </p>
          <div className="story-card">
            <span>01 / QUẦY ĐIỀU PHỐI</span>
            <strong>
              Nhìn rõ việc cần làm.
              <br />
              Phục vụ khách đúng lúc.
            </strong>
          </div>
        </section>
        <section className="login-panel">
          <form onSubmit={login}>
            <span className="eyebrow">CHÀO MỪNG TRỞ LẠI</span>
            <h2>Đăng nhập quầy</h2>
            <p className="muted">
              Dành cho chủ quán và nhân viên được cấp tài khoản.
            </p>
            <label>
              Tài khoản
              <input
                name="username"
                autoComplete="username"
                required
                maxLength={60}
                autoFocus
              />
            </label>
            <label>
              Mật khẩu
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? "Đang xác thực…" : "Đăng nhập"}
            </button>
          </form>
        </section>
      </main>
    );
  const orders = state?.orders ?? [],
    tickets = state?.tickets ?? [],
    tables = state?.tables ?? [];
  const openTickets = tickets.filter((ticket) => ticket.status === "OPEN");
  const qrTablesWithSessions = tables.filter(table => table.automatic && (table.activeSessions ?? 0) > 0);
  const activeQrSessions = qrTablesWithSessions.reduce((count, table) => count + (table.activeSessions ?? 0), 0);
  const blockedQrTables = qrTablesWithSessions.filter(table =>
    orders.some(order => order.tableId === table.id && !["CANCELLED", "REFUNDED"].includes(order.paymentState ?? "") && (order.paymentState !== "PAID" || order.status !== "SERVED")) ||
    openTickets.some(ticket => ticket.tableId === table.id),
  );
  const currentTable = tables.find((table) => table.id === selected?.id);
  const tableOrders = orders.filter((order) => order.tableId === selected?.id);
  const tableTickets = openTickets.filter(
    (ticket) => ticket.tableId === selected?.id,
  );
  const next: Record<string, string> = {
    SUBMITTED: "PREPARING",
    PREPARING: "READY",
    READY: "SERVED",
  };
  const nextLabel: Record<string, string> = {
    SUBMITTED: "Bắt đầu pha chế",
    PREPARING: "Pha chế xong",
    READY: "Đã mang ra bàn",
  };
  const disabled = busy || !connected;
  const pendingCheckouts =
    state?.checkouts.filter(
      (c) => c.state === "REQUESTED" || c.state === "ACKNOWLEDGED",
    ) ?? [];
  const filteredOrders = orders
    .filter(
      (o) =>
        (!o.paymentState || ["POSTPAY", "PAID"].includes(o.paymentState)) &&
        o.status !== "SERVED" &&
        (orderFilter === "all" || o.status === orderFilter) &&
        searchText(`bàn ${o.tableId} #${o.id}`).includes(
          searchText(query.trim()),
        ),
    )
    .sort((a, b) => Date.parse(a.queuedAt??a.createdAt)-Date.parse(b.queuedAt??b.createdAt)||a.id-b.id);
  return (
    <div className="app-shell" data-view={view}>
      <aside className="sidebar">
        <Brand />
        <p className="workspace-label">{isManager?"KHÔNG GIAN QUẢN LÝ":"KHÔNG GIAN NHÂN VIÊN"}</p>
        <nav aria-label="Điều hướng chính">
          {[
            ["tables", "grid", "Sơ đồ bàn"],
            ["orders", "cup", "Quầy pha chế"],
            ["requests", "help", "Yêu cầu hỗ trợ"],
            ["cashier", "bag", "Thu ngân"],
            ["menu", "menu", "Thực đơn"],
            ["history", "receipt", "Lịch sử hóa đơn"],
            ["finance", "chart", "Thu chi"],
            ["settings", "settings", "Cài đặt quán"],
            ["assistance", "help", "Tra cứu hỗ trợ"],
            ["system", "grid", "Chẩn đoán hệ thống"],
            ["staff", "settings", "Nhân viên"],
          ].filter(([id])=>isManager||["tables","orders","requests","menu"].includes(id)).map(([id, icon, title]) => (
            <button
              key={id}
              className={view === id ? "nav active" : "nav"}
              aria-current={view === id ? "page" : undefined}
              onClick={() => setView(id)}
            >
              <Icon name={icon as IconName} />
              {title}
              {id === "orders" && (
                <b>
                  {
                    orders.filter(
                      (o) =>
                        o.status !== "SERVED" && (o.acceptanceState === "WAITING" ||
                        (!o.paymentState ||
                          ["PAID", "POSTPAY"].includes(o.paymentState))),
                    ).length
                  }
                </b>
              )}
              {id === "requests" && <b>{openTickets.length}</b>}
              {id === "cashier" && (
                <b>
                  {(state?.orders.filter(o=>o.acceptanceState!=='WAITING'&&['UNPAID','PENDING'].includes(o.paymentState??'')).length??0)+(state?.checkouts.filter(
                    (c) =>
                      c.state === "REQUESTED" || c.state === "ACKNOWLEDGED",
                  ).length ?? 0)}
                </b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">
            {session.identity.username.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{session.identity.username}</strong>
            <small>{isManager?"Quản lý quán":"Nhân viên phục vụ"}</small>
          </div>
          <button className="text-button" onClick={logout}>
            Đăng xuất
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">CAFE OPERATIONS</span>
            <h1>
              {view === "tables"
                ? "Sơ đồ bàn"
                : view === "orders"
                  ? "Quầy pha chế"
                  : view === "requests"
                    ? "Yêu cầu hỗ trợ"
                    : view === "cashier"
                      ? "Thu ngân"
                      : view === "history"
                        ? "Lịch sử hóa đơn"
                      : view==='staff'?'Nhân viên': view==='finance'?'Báo cáo thu chi':view==='settings'?'Cài đặt quán':view==='assistance'?'Tra cứu hỗ trợ':view==='system'?'Chẩn đoán hệ thống':"Thực đơn của quán"}
            </h1>
            <p className="muted">
              {new Intl.DateTimeFormat('vi-VN',{weekday:'long',day:'numeric',month:'long'}).format(new Date())} · {isManager?'Quản lý':'Nhân viên'}: {session.identity.username}
            </p>
          </div>
          <span
            className={`connection ${connected ? "online" : "offline"}`}
            role="status"
          >
            ● {connected ? "Đang kết nối" : "Mất kết nối"}
          </span>
        </header>
        <Notifications
          session={session}
          revision={state?.revision}
          onOpen={(event) => {
            if(!isManager){setView(event.type.includes('SERVICE')||event.type==='HANDLE_TICKET'?'requests':'orders');return;}
            const table = state?.tables.find(
              (t) => t.visitId === event.visitId || t.id === event.tableId,
            );
            if (
              event.type === "CALL_SERVICE" ||
              event.type === "HANDLE_TICKET"
            ) {
              setView("requests");
              setRequestQuery(`bàn ${event.tableId}`);
            } else if (
              event.type === "PAY_AND_CLOSE" ||
              event.type === "CLOSE_VISIT"
            ) {
              setView("history");
            } else if (table) {
              setSelected(table);
            } else {
              setView("history");
            }
          }}
        />
        {session.identity.storeId && <StaffRecovery session={session} />}
        {error && (
          <div className="error banner" role="alert">
            {error}
            <button
              aria-label="Đóng thông báo lỗi"
              onClick={() => setError("")}
            >
              ×
            </button>
          </div>
        )}
        {!connected && (
          <div className="warning banner">
            Các thao tác đang tạm khóa để tránh gửi yêu cầu khi chưa rõ trạng
            thái.
            <div className="button-row">
              <button
                className="secondary"
                onClick={() => void checkConnection()}
              >
                Kiểm tra kết nối
              </button>
              <button
                className="text-button"
                onClick={() => {
                  setSession(null);
                  setError(
                    "Đăng nhập lại cùng tài khoản để tiếp tục đối chiếu thao tác đang chờ.",
                  );
                }}
              >
                Đăng nhập lại
              </button>
            </div>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            ✓ {notice}
          </div>
        )}
        <section className="metrics" aria-label="Tổng quan quán">
          <div>
            <span>Bàn có phiên đang xử lý</span>
            <strong>
              {
                tables.filter((t) => t.visitId || (t.activeSessions ?? 0) > 0)
                  .length
              }
              <small> / {tables.length}</small>
            </strong>
          </div>
          <div>
            <span>Đơn chờ nhận / pha chế</span>
            <strong>
              {
                orders.filter(
                  (o) =>
                    o.status !== "SERVED" &&
                    (o.acceptanceState === "WAITING" || !o.paymentState ||
                      ["PAID", "POSTPAY"].includes(o.paymentState)) && !['CANCELLED','REFUNDED'].includes(o.paymentState??''),
                ).length
              }
            </strong>
          </div>
          <div>
            <span>Yêu cầu đang chờ</span>
            <strong>{openTickets.length}</strong>
          </div>
          <div>
            <span>Đơn/yêu cầu chờ thanh toán</span>
            <strong>{pendingCheckouts.length+orders.filter(o=>o.acceptanceState!=='WAITING'&&['UNPAID','PENDING'].includes(o.paymentState??'')).length}</strong>
          </div>
        </section>
        {view === "tables" && (
          <>
          <section className="store-service-bar"><div><span className={`service-dot ${state?.storeAcceptingOrders===false?'paused':''}`}/><strong>{state?.storeAcceptingOrders===false?'Đang tạm dừng đơn mới':'Quán đang nhận đơn'}</strong><p>Tiếp tục xử lý các đơn và yêu cầu đã có.</p></div>{isManager&&<button className="secondary" disabled={disabled} onClick={()=>void run('SET_STORE_ACCEPTING',{enabled:state?.storeAcceptingOrders===false?1:0})}>{state?.storeAcceptingOrders===false?'Tiếp tục nhận đơn toàn quán':'Tạm dừng đơn mới toàn quán'}</button>}</section>
          <>
            <div className="section-heading">
              <h2>Không gian quán</h2>
              <span className="muted">
                Chọn bàn để xem đơn và xử lý yêu cầu
              </span>
            </div>
            <div className="filter-toolbar">
              {isManager&&<button
                className="primary"
                disabled={disabled}
                onClick={async () => {
                  if (await run("OPEN_ALL_TABLES", {}))
                    setNotice(
                      "Tất cả bàn đã nhận khách qua QR cố định. Không cần mở hoặc đóng từng lượt.",
                    );
                }}
              >
                Mở tất cả bàn
              </button>}
              {isManager && <button className="secondary" disabled={disabled || !tables.some(table => table.automatic && table.acceptingOrders)} onClick={() => { setError(""); setConfirmRevision(state?.revision ?? null); setConfirmAll("pause"); }}>Tạm ngưng tất cả bàn</button>}
              {isManager && <button className="secondary" disabled={disabled || activeQrSessions === 0} onClick={() => { setError(""); setConfirmRevision(state?.revision ?? null); setConfirmAll("end"); }}>Kết thúc tất cả phiên QR</button>}
              <label htmlFor="table-filter">Lọc bàn</label>
              <select
                id="table-filter"
                value={tableFilter}
                onChange={(event) => setTableFilter(event.target.value)}
              >
                <option value="all">Tất cả bàn</option>
                <option value="available">Bàn trống</option>
                <option value="occupied">Đang phục vụ</option>
                <option value="paused">Tạm ngưng</option>
                <option value="checkout">Đang tính tiền</option>
              </select>
            </div>
            {isManager && confirmAll && <Dialog label={confirmAll === "pause" ? "Tạm ngưng tất cả bàn" : "Kết thúc tất cả phiên QR"} role="alertdialog" onClose={() => { if (!busy) setConfirmAll(null); }}>
              {confirmAll === "pause" ? <>
                <h2>Tạm ngưng nhận khách mới?</h2>
                <p>Khách mới sẽ không thể vào bằng QR ở tất cả bàn. Các phiên và yêu cầu hiện có vẫn được giữ để tiếp tục phục vụ.</p>
              </> : <>
                <h2>Kết thúc tất cả phiên QR?</h2>
                <p>Thao tác sẽ đăng xuất {activeQrSessions} phiên khách tại {qrTablesWithSessions.length} bàn. QR nhận khách giữ nguyên trạng thái.</p>
                {blockedQrTables.length > 0 ? <p className="warning banner" role="alert">Cần xử lý đơn chưa thanh toán/chưa giao hoặc yêu cầu hỗ trợ tại: {blockedQrTables.map(table => table.name).join(", ")}.</p> : <p>Chỉ tiếp tục khi khách đã rời quán. Các đơn và yêu cầu sẽ được kiểm tra lại trước khi kết thúc.</p>}
              </>}
              {(confirmRevision === null || confirmRevision !== state?.revision) && <p className="warning banner" role="alert">Trạng thái quán đã thay đổi. Hãy hủy và mở lại để kiểm tra trước khi xác nhận.</p>}
              {error && <p className="error" role="alert">{error}</p>}
              <div className="button-row">
                <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmAll(null)}>Hủy</button>
                <button type="button" disabled={disabled || confirmRevision === null || confirmRevision !== state?.revision || (confirmAll === "end" && (blockedQrTables.length > 0 || activeQrSessions === 0))} onClick={async () => {
                  const action = confirmAll === "pause" ? "PAUSE_ALL_TABLES" : "END_ALL_TABLE_SESSIONS";
                  const result = await run<{pausedTables?: number; endedSessions?: number}>(action, { expectedRevision: confirmRevision });
                  if (result) { setConfirmAll(null); setNotice(action === "PAUSE_ALL_TABLES" ? `Đã tạm ngưng nhận khách mới ở ${result.pausedTables} bàn.` : `Đã kết thúc ${result.endedSessions} phiên QR.`); }
                }}>{confirmAll === "pause" ? "Xác nhận tạm ngưng" : "Xác nhận kết thúc tất cả phiên"}</button>
              </div>
            </Dialog>}
            <section className="table-grid">
              {tables
                .filter(
                  (table) =>
                    tableFilter === "all" ||
                    (tableFilter === "available"
                      ? table.automatic &&
                        table.acceptingOrders &&
                        !(table.activeSessions ?? 0)
                      : tableFilter === "paused"
                        ? !table.visitId &&
                          !(table.activeSessions ?? 0) &&
                          (!table.automatic || !table.acceptingOrders)
                      : tableFilter === "checkout"
                        ? table.visitState === "CHECKOUT_REQUESTED"
                        : (!!table.visitId ||
                            (table.activeSessions ?? 0) > 0) &&
                          table.visitState !== "CHECKOUT_REQUESTED"),
                )
                .map((table) => (
                  <article
                    key={table.id}
                    className={`table-card ${table.visitId || (table.activeSessions ?? 0) > 0 ? "occupied" : ""}`}
                  >
                    <button type="button" className="table-card-open" aria-label={`Xem ${table.name}`} onClick={() => { setSelected(table); setBill(null); setConfirmPay(false); }} />
                    <div className="table-card-top">
                      <span className="table-icon"><Icon name="table"/></span>
                      <span className={`pill ${table.visitId || (table.activeSessions ?? 0) > 0 ? "green" : ""}`}>
                        {table.automatic
                          ? (table.activeSessions ?? 0) > 0
                            ? "Đang phục vụ"
                            : table.acceptingOrders
                              ? "Bàn trống · Đang nhận đơn"
                              : "Tạm ngưng"
                          : table.visitState === "CHECKOUT_REQUESTED"
                            ? "Đang tính tiền"
                            : table.visitId
                              ? "Đang phục vụ"
                              : "Tạm ngưng"}
                      </span>
                    </div>
                    <div className="table-card-body"><div><h3>{table.name}</h3>
                    <p>
                      {table.automatic
                        ? `${table.activeSessions ?? 0} lượt · ${orders.filter((o) => o.tableId === table.id && o.paymentState !== "CANCELLED").length} đơn`
                        : table.visitId
                          ? `${orders.filter((o) => o.tableId === table.id).length} đơn · ${table.onlineClients} kết nối`
                          : "Sẵn sàng đón khách"}
                    </p>
                    </div><TableQr tableId={table.id} csrf={session.csrfToken} enabled={!!table.automatic && !!table.acceptingOrders}/></div><div className="table-card-foot">
                      <strong>
                        {money(
                          orders
                            .filter(
                              (o) =>
                                o.tableId === table.id &&
                                o.paymentState !== "CANCELLED",
                            )
                            .reduce((total, o) => total + o.totalVnd, 0),
                        )}
                      </strong>
                      <span aria-hidden="true">Xem bàn →</span>
                    </div>
                  </article>
                ))}
            </section>
          </>
          </>
        )}
        {view === "orders" && (
          <>
            <AcceptanceQueue orders={orders} disabled={disabled} run={run}/>
            <div className="section-heading">
              <h2>Hàng đợi phục vụ</h2>
              <label className="search-label">
                Lọc đơn
                <input
                  aria-label="Tìm đơn theo bàn"
                  placeholder="Tên bàn hoặc mã đơn…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
            <div
              className="filter-toolbar"
              role="group"
              aria-label="Trạng thái đơn"
            >
              {["all", "SUBMITTED", "PREPARING", "READY"].map((status) => (
                <button
                  key={status}
                  className={orderFilter === status ? "chip selected" : "chip"}
                  aria-pressed={orderFilter === status}
                  onClick={() => setOrderFilter(status)}
                >
                  {status === "all" ? "Tất cả đơn chờ" : statusName[status]}
                </button>
              ))}
            </div>
            <section className="orders-grid">
              {filteredOrders.map((order) => (
                <article className="order-card" key={order.id}>
                  <WaitTime since={order.queuedAt??order.createdAt} />
                  <div className="section-heading">
                    <h3>
                      Bàn {order.tableId} <small>#{order.id}</small>
                    </h3>
                    <span className="pill green">
                      {statusName[order.status]}
                    </span>
                  </div>
                  <ul className="order-items">
                    {order.items.map((item, i) => (
                      <li key={i}>
                        <b>{item.quantity}×</b> {item.name}{item.note&&<small> · {item.note}</small>}
                      </li>
                    ))}
                  </ul>
                  {order.note && (
                    <p className="order-note">Ghi chú: {order.note}</p>
                  )}
                  <button
                    className="primary full"
                    disabled={disabled}
                    onClick={() =>
                      void run("SET_ORDER_STATUS", {
                        orderId: order.id,
                        status: next[order.status],
                      })
                    }
                  >
                    {nextLabel[order.status]}
                  </button>
                  <OrderResolution order={order} disabled={disabled} run={run} canRefund={isManager}/>
                  <p className="muted">Giao theo bàn + mã đơn #{order.id}. Chỉ xác nhận đã mang ra khi đủ mọi món.</p>
                </article>
              ))}
              {!orders.some((o) => o.status !== "SERVED"&&['PAID','POSTPAY'].includes(o.paymentState??'POSTPAY')) && (
                <div className="empty">
                  <Icon name="cup"/>
                  <h3>Quầy đã xử lý xong đơn</h3>
                  <p>Đơn đã tiếp nhận và thanh toán sẽ được đưa vào pha chế.</p>
                </div>
              )}
              {orders.some((o) => o.status !== "SERVED"&&['PAID','POSTPAY'].includes(o.paymentState??'POSTPAY')) &&
                !filteredOrders.length && (
                  <div className="empty">
                    <h3>Không có đơn khớp bộ lọc</h3>
                    <p>Vẫn còn đơn đang chờ ở nhóm khác.</p>
                    <button
                      className="secondary"
                      onClick={() => {
                        setOrderFilter("all");
                        setQuery("");
                      }}
                    >
                      Xem tất cả đơn chờ
                    </button>
                  </div>
                )}
            </section>
          </>
        )}
        {view === "menu" && !isManager && <StaffMenu menu={state?.menu??[]} disabled={disabled} run={run}/>}
        {view === "menu" && isManager && (
          <MenuAdmin
            session={session}
            menu={state?.menu ?? []}
            disabled={disabled}
            onChanged={() => {
              void api
                .state()
                .then((next) =>
                  setState((previous) =>
                    !previous || next.revision >= previous.revision
                      ? next
                      : previous,
                  ),
                );
            }}
          />
        )}
        {isManager && view === "history" && <SalesHistory session={session} />}
        {isManager && view === "finance" && <FinanceReport session={session} disabled={disabled}/>}
        {isManager && view === "settings" && <TaxSettingsPanel session={session} disabled={disabled} onChanged={()=>{void api.state().then(setState);}}/>}
        {isManager && view === "assistance" && <Assistance session={session}/>}
        {isManager && view === "system" && <SystemDiagnosticsPanel />}
        {isManager && view === "staff" && <StaffAccountsPanel session={session} disabled={disabled}/>}
        {view === "requests" && (
          <SupportQueue
            state={state}
            disabled={disabled}
            replies={replies}
            onReply={(id, value) =>
              setReplies((previous) => ({ ...previous, [id]: value }))
            }
            run={run}
            query={requestQuery}
            setQuery={setRequestQuery}
            showHandled={showHandled}
            setShowHandled={setShowHandled}
            onOpen={setSelected}
          />
        )}
        {isManager && view === "cashier" && (
          <CashierQueue
            state={state}
            disabled={disabled}
            run={run}
            onOpen={setSelected}
          />
        )}
      </main>
      {selected && (
        <Dialog
          label={`Chi tiết ${selected.name}`}
          onClose={() => {
            setSelected(null);
            setBill(null);
          }}
        >
          <div className="section-heading">
            <div>
              <span className="eyebrow">CHI TIẾT BÀN</span>
              <h2>{selected.name}</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Đóng chi tiết bàn"
              onClick={() => {
                setSelected(null);
                setBill(null);
              }}
            >
              ×
            </button>
          </div>
          {!isManager ? <StaffTableDetails table={currentTable} orders={tableOrders} csrf={session.csrfToken}/> : currentTable?.automatic ? (
            <AutomaticTablePanel
              table={currentTable}
              orders={tableOrders}
              csrf={session.csrfToken}
              disabled={disabled}
              run={run}
            />
          ) : !currentTable?.visitId && session.identity.storeId ? (
            <div className="empty">
              <span>▦</span>
              <h3>Tạm ngưng</h3>
              <p>
                Bàn sẽ nhận khách và tải QR sau khi quản lý bấm “Mở tất cả bàn”.
              </p>
            </div>
          ) : !currentTable?.visitId ? (
            <div className="empty">
              <span>▦</span>
              <h3>Bàn đang trống</h3>
              <p>Mở lượt mới khi khách đến bàn.</p>
              <button
                className="primary"
                disabled={disabled}
                onClick={async () => {
                  if (await run("OPEN_TABLE", { tableId: selected.id }))
                    setNotice("Đã mở lượt khách mới.");
                }}
              >
                Mở lượt khách
              </button>
            </div>
          ) : (
            <>
              <span className="pill green">Đang phục vụ</span>
              <VisitQrPanel
                key={currentTable.visitId}
                visitId={currentTable.visitId}
                csrf={session.csrfToken}
                disabled={disabled}
                refreshKey={`${state?.revision}:${currentTable.onlineClients}`}
              />
              <h3 className="spaced">Đơn tại bàn ({tableOrders.length})</h3>
              {tableOrders.length === 0 && (
                <p className="muted">Bàn chưa có đơn gọi món.</p>
              )}
              {tableOrders.map((order) => (
                <article className="table-order" key={order.id}>
                  <div className="section-heading">
                    <strong>Đơn #{order.id}</strong>
                    <span className="pill">
                      {order.paymentState === "CANCELLED"
                        ? "Đã hủy"
                        : order.paymentState === "UNPAID" ||
                            order.paymentState === "PENDING"
                          ? "Chờ thanh toán"
                          : statusName[order.status]}
                    </span>
                  </div>
                  <ul className="order-items">
                    {order.items.map((item, i) => (
                      <li key={i}>
                        {item.quantity}× {item.name}
                        <span>{money(item.subtotalVnd)}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
              {bill && (
                <div className="bill-total">
                  <span>Tổng tiền cần thu</span>
                  <strong>{money(bill.totalVnd)}</strong>
                  <p>
                    Ghi nhận tiền mặt mô phỏng; không chuyển tiền qua ngân hàng.
                  </p>
                </div>
              )}
              {currentTable.paymentMode === "PREPAY" && (
                <PrepaidClose
                  table={currentTable}
                  orders={tableOrders}
                  support={tableTickets.length}
                  disabled={disabled}
                  run={run}
                />
              )}
              {currentTable.paymentMode !== "PREPAY" &&
                tableOrders.length > 0 &&
                currentTable.visitState && (
                  <CheckoutControls
                    key={currentTable.visitId}
                    table={currentTable}
                    checkout={state?.checkouts?.find(
                      (c) => c.visitId === currentTable.visitId,
                    )}
                    disabled={disabled}
                    run={run}
                  />
                )}
              <div className="drawer-actions">
                {tableOrders.length === 0 ? (
                  <button
                    className="secondary"
                    disabled={disabled || tableTickets.length > 0}
                    onClick={async () => {
                      if (
                        await run("CLOSE_EMPTY_TABLE", {
                          visitId: currentTable.visitId,
                        })
                      )
                        setNotice("Đã đóng bàn trống.");
                    }}
                  >
                    Đóng bàn trống
                  </button>
                ) : currentTable.paymentMode === "PREPAY" ? null : (
                  <>
                    <button
                      className="secondary"
                      disabled={disabled}
                      onClick={async () => {
                        const value = await run<Bill>("GET_BILL", {
                          visitId: currentTable.visitId,
                        });
                        if (value) setBill(value);
                      }}
                    >
                      Xem tạm tính
                    </button>
                    {bill && (
                      <button
                        className="primary"
                        disabled={
                          disabled ||
                          tableTickets.length > 0 ||
                          tableOrders.some((o) => o.status !== "SERVED") ||
                          (currentTable.visitState !== undefined &&
                            !state?.checkouts?.some(
                              (c) =>
                                c.visitId === currentTable.visitId &&
                                c.state === "ACKNOWLEDGED",
                            ))
                        }
                        onClick={() => setConfirmPay(true)}
                      >
                        Ghi nhận tiền mặt
                      </button>
                    )}
                    {bill &&
                      (tableTickets.length > 0 ||
                        tableOrders.some((o) => o.status !== "SERVED")) && (
                        <p className="muted">
                          Cần phục vụ xong đơn và xử lý các yêu cầu trước khi
                          thu tiền.
                        </p>
                      )}
                  </>
                )}
              </div>
            </>
          )}
          {confirmPay && bill && (
            <div
              className="confirm-box"
              role="alertdialog"
              aria-label="Xác nhận thu tiền"
            >
              <h3>Đã nhận {money(bill.totalVnd)}?</h3>
              <p>Xác nhận sẽ kết thúc lượt khách hiện tại.</p>
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() => setConfirmPay(false)}
                >
                  Quay lại
                </button>
                <button
                  className="primary"
                  disabled={disabled}
                  onClick={async () => {
                    if (
                      await run("PAY_AND_CLOSE", {
                        visitId: bill.visitId,
                        expectedBillVersion: bill.billVersion,
                        expectedTotalVnd: bill.totalVnd,
                      })
                    ) {
                      setConfirmPay(false);
                      setBill(null);
                      setNotice("Đã ghi nhận thanh toán và đóng lượt bàn.");
                    }
                  }}
                >
                  Đã nhận tiền
                </button>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
