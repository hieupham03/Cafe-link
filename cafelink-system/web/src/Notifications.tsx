import { useEffect, useId, useRef, useState } from "react";
import { api } from "./api";
import { guestScope } from "./models";
import type { SessionInfo } from "./models";
import { Dialog } from "./Dialog";

interface Event {
  id: number;
  visitId: string;
  tableId: number;
  type: string;
  entityId: string;
  title: string;
  createdAt: string;
  read: boolean;
}
interface Feed {
  events: Event[];
  hasMore: boolean;
  latest: number;
  unread: number;
  resyncRequired: boolean;
}
const types: Record<string, string> = {
  ORDER_AWAITING_PAYMENT: "Chờ thanh toán",
  PLACE_ORDER: "Đặt món",
  SET_ORDER_STATUS: "Tiến độ đơn",
  CALL_SERVICE: "Hỗ trợ",
  HANDLE_TICKET: "Phản hồi",
  REQUEST_CHECKOUT: "Tính tiền",
  ACK_CHECKOUT: "Tính tiền",
  REOPEN_ORDERING: "Gọi tiếp",
  PAY_AND_CLOSE: "Thanh toán",
  PAYMENT_CONFIRMED: "Thanh toán",
  CLOSE_VISIT: "Kết thúc lượt",
  AUTO_COMPLETE: "Hoàn tất công việc",
  ORDER_RESOLVED: "Hủy / hoàn giả lập",
  AMEND_SERVICE: "Bổ sung hỗ trợ",
  CANCEL_SERVICE: "Rút yêu cầu",
};
function preference(session:SessionInfo){try{const saved=JSON.parse(localStorage.getItem(`cafelink-sound:${session.identity.storeId}:${session.identity.username}`)??'{}');return {sound:saved.sound===true,volume:typeof saved.volume==='number'&&Number.isFinite(saved.volume)?Math.max(0,Math.min(1,saved.volume)):0.3};}catch{return {sound:false,volume:0.3};}}
export function Notifications({
  session,
  revision,
  onOpen,
}: {
  session: SessionInfo;
  revision?: number;
  onOpen: (event: Event) => void;
}) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<Event[]>([]),
    [unread, setUnread] = useState(0),
    [more, setMore] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState<Event[]>([]),
    [filter, setFilter] = useState("all"),
    [onlyUnread, setOnlyUnread] = useState(false),
    [sound, setSound] = useState(()=>preference(session).sound),
    [volume, setVolume] = useState(()=>preference(session).volume);
  const [unlocked,setUnlocked]=useState(false);
  const [activating,setActivating]=useState(false), [soundError,setSoundError]=useState("");
  const activation=useRef<{generation:number;cancel?:()=>void}>({generation:0});
  const settingsKey=`cafelink-sound:${session.identity.storeId}:${session.identity.username}`;
  useEffect(()=>{const sync=(event:StorageEvent)=>{if(event.key===settingsKey){const value=preference(session);setSound(value.sound);setVolume(value.volume);}};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[settingsKey]);
  useEffect(()=>{if(session.identity.role==='ADMIN')try{localStorage.setItem(settingsKey,JSON.stringify({sound,volume}));}catch{setError('Không lưu được tùy chọn âm thanh; hãy kiểm tra lại sau khi tải trang.');}},[sound,volume,settingsKey]);
  const cursor = useRef(0),
    first = useRef(true),
    working = useRef(false),
    audio = useRef<AudioContext | null>(null),
    latest = useRef({ sound, volume }),
    lastSync = useRef(0);
  latest.current = { sound:sound&&unlocked, volume };
  useEffect(()=>()=>{
    ++activation.current.generation;
    activation.current.cancel?.(); activation.current.cancel=undefined;
    const context=audio.current; audio.current=null;
    if(context)void context.close().catch(()=>{});
  },[]);
  async function activate(){
    if(activation.current.cancel)return;
    const own=++activation.current.generation;
    let timer:number|undefined;
    setActivating(true);setSoundError("");
    try{
      const context=audio.current??new AudioContext();audio.current=context;
      await new Promise<void>((resolve,reject)=>{
        activation.current.cancel=()=>reject(new Error("Audio activation cancelled"));
        timer=window.setTimeout(()=>reject(new Error("Audio activation timeout")),2500);
        context.resume().then(resolve,reject);
      });
      if(own!==activation.current.generation)return;
      if(context.state!=="running")throw new Error("Audio unavailable");
      setSound(true);setUnlocked(true);
    }catch{
      if(own===activation.current.generation){
        setUnlocked(false);setSoundError("Trình duyệt chưa cho phép phát âm. Thông báo chữ vẫn được cập nhật. Bạn có thể thử kích hoạt lại.");
        const context=audio.current;audio.current=null;
        if(context)void context.close().catch(()=>{});
      }
    }finally{
      if(timer!==undefined)window.clearTimeout(timer);
      if(own===activation.current.generation){activation.current.cancel=undefined;setActivating(false);}
    }
  }
  const [syncMessage, setSyncMessage] = useState("");
  const [extra, setExtra] = useState(0);
  const synchronize = useRef<() => Promise<void>>(async () => {});
  const filterId = useId();
  const principal = JSON.stringify([
    session.identity.storeId,
    session.identity.membershipId ?? session.identity.username,
  ]);
  const command = <T,>(action: string, data: unknown) =>
    api.command<T>(
      session.csrfToken,
      action,
      data,
      crypto.randomUUID(),
      session.identity.membershipId ? guestScope(session) : undefined,
    );
  function beep() {
    try {
      const ctx = audio.current;
      if (!ctx || ctx.state !== "running") throw Error();
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      gain.gain.value = latest.current.volume;
      oscillator.frequency.value = 660;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.12);
    } catch {
      setUnlocked(false);setSoundError(
        "Âm thanh chưa hoạt động; thông báo bằng chữ vẫn được cập nhật.",
      );
    }
  }
  useEffect(() => {
    let live = true;
    const sync = async () => {
      if (working.current || !live) return;
      working.current = true;
      try {
        const fresh: Event[] = [];
        let feed: Feed;
        let nextCursor = cursor.current;
        if (first.current) {
          feed = await command<Feed>("GET_NOTIFICATIONS", {
            before: 2147483647,
            limit: 50,
          });
          if (!live) return;
          fresh.push(...feed.events);
          nextCursor = feed.latest;
        } else
          do {
            feed = await command<Feed>("GET_NOTIFICATIONS", {
              after: nextCursor,
              limit: 100,
            });
            if (!live) return;
            fresh.push(...feed.events);
            if (feed.events.length) nextCursor = feed.events.at(-1)!.id;
          } while (feed.hasMore);
        if (!live) return;
        const history = await command<Feed>("GET_NOTIFICATIONS", {
          before: 2147483647,
          limit: 50,
        });
        if (!live) return;
        cursor.current = nextCursor;
        setRows((previous) => {
          const map = new Map(previous.map((e) => [e.id, e]));
          for (const e of [...fresh, ...history.events]) map.set(e.id, e);
          return [...map.values()].sort((a, b) => b.id - a.id);
        });
        setUnread(history.unread);
        if (first.current) setMore(history.hasMore);
        setError(
          feed.resyncRequired
            ? "Một phần thông báo cũ đã hết hạn. Đã tải lại công việc hiện tại; xem hàng đợi để xử lý."
            : "",
        );
        const catchingUp =
          first.current || Date.now() - lastSync.current > 10000;
        if (catchingUp && fresh.length)
          setSyncMessage(
            `Đã đồng bộ ${fresh.length} thông báo. Xem lịch sử và hàng đợi để xử lý; không phát chuông cho dữ liệu cũ.`,
          );
        if (
          !catchingUp &&
          fresh.length &&
          document.visibilityState === "visible"
        ) {
          // One presentation leader per origin/profile. The durable feed remains the source.
          await navigator.locks.request(
            `cafelink-notify:${principal}`,
            { ifAvailable: true },
            (lock) => {
              if (!lock) return;
              const last = Number(
                  localStorage.getItem(`cafelink-presented:${principal}`) || 0,
                ),
                unseen = fresh.filter(
                  (e) =>
                    e.id > last &&
                    (session.identity.role === "ADMIN"
                      ? [
                          "PLACE_ORDER",
                          "CALL_SERVICE",
                          "AMEND_SERVICE",
                          "REQUEST_CHECKOUT",
                          "PAYMENT_CONFIRMED",
                        ].includes(e.type)
                      : [
                          "SET_ORDER_STATUS",
                          "HANDLE_TICKET",
                          "ACK_CHECKOUT",
                          "REOPEN_ORDERING",
                          "CLOSE_VISIT",
                        ].includes(e.type)),
                );
              if (unseen.length) {
                localStorage.setItem(
                  `cafelink-presented:${principal}`,
                  String(unseen.at(-1)!.id),
                );
                setToast(unseen.slice(-3));
                setExtra(Math.max(0, unseen.length - 3));
                if (latest.current.sound) beep();
              }
            },
          );
        }
        first.current = false;
        lastSync.current = Date.now();
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        working.current = false;
      }
    };
    synchronize.current = sync;
    void sync();
    const timer = setInterval(() => void sync(), 3000);
    const foreground = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", foreground);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [principal, session.csrfToken]);
  useEffect(() => {
    void synchronize.current();
  }, [revision]);
  useEffect(() => {
    if (!toast.length) return;
    const timer = setTimeout(() => setToast([]), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function read(event: Event) {
    try {
      await command("MARK_NOTIFICATION_READ", { eventId: event.id });
      setRows((r) =>
        r.map((e) => (e.id === event.id ? { ...e, read: true } : e)),
      );
      if (!event.read) setUnread((n) => Math.max(0, n - 1));
      onOpen(event);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="notification-shell">
      {session.identity.role==='ADMIN'&&<div className="sound-controls" aria-label="Trạng thái âm thanh quầy"><span role="status">{activating?'Âm thanh quầy: đang kích hoạt':!sound?'Âm thanh quầy: đã tắt':unlocked?'Âm thanh quầy: đang bật':'Âm thanh quầy: cần kích hoạt sau tải lại'}</span><button className="secondary" disabled={activating} onClick={()=>{if(sound&&unlocked){setSound(false);setUnlocked(false);}else void activate();}}>{activating?'Đang bật âm...':sound&&unlocked?'Tắt chuông quầy':'Kích hoạt chuông quầy'}</button></div>}
      {!open&&soundError&&<p className="warning" role="status" aria-label="Cảnh báo âm thanh">{soundError}</p>}
      <button
        className="secondary"
        onClick={() => setOpen(true)}
        aria-label={`Thông báo, ${unread} chưa đọc`}
      >
        ♧ Thông báo <b>{unread}</b>
      </button>
      {syncMessage && (
        <small className="notification-sync" role="status">
          {syncMessage}
        </small>
      )}
      {toast.length > 0 && (
        <aside className="notification-toasts" role="status">
          {extra > 0 && (
            <button className="text-button" onClick={() => setOpen(true)}>
              Có {extra} thông báo khác. Mở trung tâm thông báo
            </button>
          )}
          {toast.map((e) => (
            <div key={e.id}>
              <button className="text-button" onClick={() => void read(e)}>
                Bàn {e.tableId} · {e.title}
              </button>
            </div>
          ))}
          <button className="text-button" onClick={() => setToast([])}>
            Đóng thông báo nổi
          </button>
        </aside>
      )}
      {open && (
        <Dialog label="Trung tâm thông báo" onClose={() => setOpen(false)}>
          <div className="section-heading">
            <h2>Thông báo</h2>
            <button
              onClick={() => setOpen(false)}
              aria-label="Đóng trung tâm thông báo"
            >
              ×
            </button>
          </div>
          <p className="muted">
            Đọc thông báo không tự xử lý đơn, yêu cầu hoặc thanh toán.
          </p>
          <div className="filter-toolbar">
            <div>
              <label htmlFor={filterId}>Loại thông báo</label>
              <select
                id={filterId}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Tất cả loại</option>
                {Object.entries(types).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <label>
              <input
                type="checkbox"
                checked={onlyUnread}
                onChange={(e) => setOnlyUnread(e.target.checked)}
              />{" "}
              Chưa đọc
            </label>
          </div>
          {session.identity.role === "ADMIN" && (
            <div className="sound-controls">
              <button
                className="secondary"
                disabled={activating}
                onClick={async () => {
                  if (sound&&unlocked) {
                    setSound(false);
                    return;
                  }
                  try {
                    await activate();
                  } catch {
                    setError("Trình duyệt chưa cho phép âm thanh.");
                  }
                }}
              >
                {activating ? "Đang bật âm..." : sound&&unlocked ? "Tắt âm thanh tại quầy" : "Bật âm thanh tại quầy"}
              </button>
              <label>
                Âm lượng{" "}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                />
              </label>
              <button onClick={beep} disabled={!sound||!unlocked}>
                Thử âm
              </button>
            </div>
          )}
          {error && (
            <p className="warning" role="status">
              {error}
            </p>
          )}
          {soundError&&<p className="warning" role="status" aria-label="Cảnh báo âm thanh">{soundError}</p>}
          <div className="notification-list">
            {rows
              .filter(
                (e) =>
                  (filter === "all" || e.type === filter) &&
                  (!onlyUnread || !e.read),
              )
              .map((e) => (
                <button
                  className={`notification-row ${e.read ? "" : "unread"}`}
                  key={e.id}
                  onClick={() => void read(e)}
                >
                  <strong>
                    Bàn {e.tableId} · {e.title}
                  </strong>
                  <small>
                    {new Date(e.createdAt).toLocaleString("vi-VN")} ·{" "}
                    {e.read ? "Đã đọc" : "Chưa đọc"}
                  </small>
                </button>
              ))}
          </div>
          {!rows.length && <p>Chưa có thông báo.</p>}
          {more && (
            <button
              onClick={async () => {
                try {
                  const next = await command<Feed>("GET_NOTIFICATIONS", {
                    before: rows.at(-1)?.id ?? 2147483647,
                    limit: 50,
                  });
                  setRows((r) => [
                    ...r,
                    ...next.events.filter((e) => !r.some((x) => x.id === e.id)),
                  ]);
                  setMore(next.hasMore);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Xem thông báo cũ hơn
            </button>
          )}
        </Dialog>
      )}
    </div>
  );
}
