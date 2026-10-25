import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { guestScope } from "./models";
import type { SessionInfo, Snapshot } from "./models";
import { scopeKey } from "./journal";

export function useGuestConnection(session: SessionInfo, onReady: () => void) {
  const [state, setState] = useState<Snapshot | null>(null),
    [connected, setConnected] = useState(false),
    [error, setError] = useState("");
  const [stopped, setStopped] = useState(false),
    [generation, retry] = useState(0);
  const ready = useRef(onReady);
  ready.current = onReady;
  const expected = scopeKey(guestScope(session));
  useEffect(() => {
    let disposed = false,
      epoch = 0,
      socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined,
      ping: ReturnType<typeof setInterval> | undefined;
    let failures = 0,
      windowStart = Date.now(),
      healthyAt = 0,
      blocked = false,
      halted = false;
    const accept = (value: Snapshot) =>
      setState((previous) =>
        !previous || value.revision >= previous.revision ? value : previous,
      );
    const stopSocket = () => {
      epoch++;
      clearInterval(ping);
      const old = socket;
      socket = undefined;
      old?.close();
    };
    const schedule = () => {
      if (disposed || blocked) return;
      setConnected(false);
      clearTimeout(timer);
      if (!navigator.onLine) {
        setError("Bạn đang mất mạng. Đơn chưa rõ kết quả sẽ không tự gửi lại.");
        return;
      }
      if (healthyAt && Date.now() - healthyAt >= 5000) {
        windowStart = Date.now();
        failures = 0;
      }
      healthyAt = 0;
      if (Date.now() - windowStart >= 60_000) {
        halted = true;
        setStopped(true);
        setError(
          "Đã tạm dừng kết nối lại sau 60 giây. Bạn có thể thử lại khi mạng ổn định.",
        );
        return;
      }
      const delay =
        Math.min(500 * 2 ** Math.min(failures++, 5), 10_000) *
        (0.75 + Math.random() * 0.5);
      timer = setTimeout(boot, delay);
    };
    const boot = async () => {
      clearTimeout(timer);
      stopSocket();
      if (disposed || blocked) return;
      if (!navigator.onLine) {
        schedule();
        return;
      }
      const current = epoch;
      try {
        const info = await api.session();
        if (disposed || current !== epoch) return;
        if (scopeKey(guestScope(info)) !== expected) {
          blocked = true;
          setState(null);
          setConnected(false);
          setError(
            "Phiên ở tab này đã thay đổi. Không chuyển giỏ hoặc yêu cầu cũ sang quyền mới. Hãy mở lại đúng phiên.",
          );
          return;
        }
        if (!info.connected) throw new Error("Chưa nối được tới Core.");
        const snapshot = await api.state();
        if (disposed || current !== epoch) return;
        accept(snapshot);
        const owned = new WebSocket(
          `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/state`,
        );
        socket = owned;
        // A stalled handshake must not hold the reconnect state indefinitely.
        timer = setTimeout(() => owned.close(), 8000);
        owned.onopen = () => {
          if (disposed || current !== epoch) {
            owned.close();
            return;
          }
          healthyAt = Date.now();
          clearTimeout(timer);
          setConnected(true);
          setStopped(false);
          setError("");
          ready.current();
          ping = setInterval(() => {
            if (owned.readyState === WebSocket.OPEN) owned.send("PING");
          }, 20_000);
        };
        owned.onmessage = (event) => {
          if (disposed || current !== epoch) return;
          try {
            const message = JSON.parse(event.data);
            if (message.type === "STATE") accept(message.state);
            else if (message.type === "CONNECTION_LOST") {
              setError(
                "Kết nối tới quán bị ngắt. Đang đối chiếu lại, không tự gửi đơn.",
              );
              owned.close();
            }
          } catch {
            owned.close();
          }
        };
        owned.onclose = () => {
          if (disposed || current !== epoch) return;
          clearInterval(ping);
          schedule();
        };
      } catch (e) {
        if (disposed || current !== epoch) return;
        setConnected(false);
        if (e instanceof ApiError && e.status === 401) {
          blocked = true;
          setState(null);
          setError(e.message);
          return;
        }
        setError(
          "Chưa kết nối được tới quán. Yêu cầu đang lưu sẽ được đối chiếu khi kết nối lại.",
        );
        schedule();
      }
    };
    const online = () => {
      if (!blocked) {
        halted = false;
        windowStart = Date.now();
        failures = 0;
        setStopped(false);
        void boot();
      }
    };
    const offline = () => {
      clearTimeout(timer);
      stopSocket();
      setConnected(false);
      setError("Bạn đang mất mạng. Đơn chưa rõ kết quả sẽ không tự gửi lại.");
    };
    const visible = () => {
      if (document.visibilityState === "visible" && !blocked && !halted)
        void boot();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    void boot();
    return () => {
      disposed = true;
      clearTimeout(timer);
      stopSocket();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [expected, generation]);
  return {
    state,
    connected,
    error,
    stopped,
    retry: () => retry((value) => value + 1),
  };
}
