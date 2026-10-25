import { useEffect, useState } from "react";
export const searchText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi");
export const actionTitle: Record<string, string> = {
  RESOLVE_ORDER: "Hủy / hoàn giả lập đơn",
  CREATE_MENU_ITEM: "Thêm món",
  UPDATE_MENU_ITEM: "Sửa món",
  CLOSE_VISIT: "Kết thúc lượt",
  PLACE_ORDER: "Đặt món",
  CALL_SERVICE: "Gọi nhân viên",
  REQUEST_CHECKOUT: "Yêu cầu tính tiền",
  ACK_CHECKOUT: "Tiếp nhận tính tiền",
  REOPEN_ORDERING: "Mở lại gọi món",
  PAY_AND_CLOSE: "Xác nhận thu tiền",
};
export function WaitTime({ since }: { since?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const start = Date.parse(since ?? ""),
    minutes = Number.isFinite(start)
      ? Math.max(0, Math.floor((now - start) / 60_000))
      : 0;
  return (
    <time
      dateTime={since}
      className={minutes >= 10 ? "wait-time overdue" : "wait-time"}
    >
      {minutes ? `Đã chờ ${minutes} phút` : "Vừa nhận"}
    </time>
  );
}
