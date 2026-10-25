import { api, ApiError } from "./api";
import type { SessionInfo } from "./models";
import { fingerprint, JournalError } from "./journal";

export const financialActions = new Set([
  "REQUEST_CHECKOUT",
  "ACK_CHECKOUT",
  "REOPEN_ORDERING",
  "PAY_AND_CLOSE",
  "CLOSE_VISIT",
  "RESOLVE_ORDER",
  "CREATE_MENU_ITEM",
  "UPDATE_MENU_ITEM",
]);
export interface StaffIntent {
  id: string;
  owner: string;
  scope: { storeId: string; username: string };
  action: string;
  data: Record<string, unknown>;
  fingerprint: string;
  status:
    | "PENDING"
    | "CONFIRM_REQUIRED"
    | "ACCEPTED"
    | "CANCELLED"
    | "REJECTED"
    | "BLOCKED";
  message: string;
  createdAt: number;
  result?: Record<string, unknown>;
}
export const staffPending = (row: StaffIntent) =>
  !["ACCEPTED", "CANCELLED", "REJECTED"].includes(row.status);
const scope = (session: SessionInfo) => {
  const { storeId, username, role } = session.identity;
  if (role !== "ADMIN" || !storeId)
    throw new JournalError("Thiếu phạm vi quản lý của quán.");
  return { storeId, username };
};
const owner = (session: SessionInfo) => JSON.stringify(scope(session));
const req = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
async function transaction<T>(
  work: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  let db: IDBDatabase | undefined,
    tx: IDBTransaction | undefined,
    done: Promise<void> | undefined;
  try {
    const open = indexedDB.open("cafelink-staff-journal", 1);
    open.onupgradeneeded = () =>
      open.result.createObjectStore("commands", { keyPath: "id" });
    db = await req(open);
    tx = db.transaction("commands", "readwrite", { durability: "strict" });
    done = new Promise<void>((resolve, reject) => {
      tx!.oncomplete = () => resolve();
      tx!.onabort = () => reject(tx!.error);
    });
    void done.catch(() => {});
    const result = await work(tx.objectStore("commands"));
    await done;
    return result;
  } catch (e) {
    try {
      tx?.abort();
    } catch {
      /* completed */
    }
    await done?.catch(() => {});
    if (e instanceof JournalError) throw e;
    throw new JournalError(
      "Không ghi/đọc được nhật ký thu ngân. Đã khóa thao tác để tránh thu tiền nhầm.",
    );
  } finally {
    db?.close();
  }
}
async function locked<T>(work: () => Promise<T>) {
  if (!navigator.locks)
    throw new JournalError(
      "Trình duyệt thiếu Web Locks cho thao tác thu ngân.",
    );
  return navigator.locks.request(
    "cafelink-staff-financial",
    { ifAvailable: true },
    (lock) => {
      if (!lock)
        throw new JournalError(
          "Một tab quản lý khác đang thao tác. Hãy chờ rồi đối chiếu.",
        );
      return work();
    },
  );
}
async function live(session: SessionInfo) {
  const current = await api.session();
  if (owner(current) !== owner(session) || !current.connected)
    throw new JournalError(
      "Phiên quản lý đã đổi hoặc chưa kết nối. Hãy đăng nhập và đối chiếu đúng quán.",
    );
  return current;
}
async function save(row: StaffIntent) {
  await transaction(async (store) => {
    store.put(row);
    const rows = (await req(store.getAll())) as StaffIntent[];
    for (const old of rows
      .filter((r) => !staffPending(r))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(200))
      store.delete(old.id);
  });
}
const definite = new Set([
  "INVALID_INPUT",
  "INVALID_STATE",
  "VERSION_CONFLICT",
  "SESSION_CLOSED",
  "FORBIDDEN",
  "NOT_FOUND",
  "COMMAND_DISCARDED",
]);
function validResult(row: StaffIntent, result: Record<string, unknown>) {
  if(row.action==="RESOLVE_ORDER")return result.orderId===row.data.orderId&&result.state===(row.data.resolution==="REFUND"?"REFUNDED":"CANCELLED")&&Number.isSafeInteger(result.amountVnd);
  if (row.action === "CREATE_MENU_ITEM" || row.action === "UPDATE_MENU_ITEM")
    return (
      Number.isSafeInteger(result.id) && Number.isSafeInteger(result.version)
    );
  if (row.action === "CLOSE_VISIT") return result.visitId === row.data.visitId;
  return row.action === "PAY_AND_CLOSE"
    ? Number.isSafeInteger(result.receiptId) &&
        Number.isSafeInteger(result.totalVnd)
    : typeof result.checkoutId === "string" &&
        Number.isSafeInteger(result.version);
}
async function send(session: SessionInfo, row: StaffIntent) {
  try {
    const result = await api.command<Record<string, unknown>>(
      session.csrfToken,
      row.action,
      row.data,
      row.id,
      row.scope,
    );
    if (!validResult(row, result))
      throw new JournalError("Phản hồi chưa đủ để xác nhận. Hãy đối chiếu.");
    row.status = "ACCEPTED";
    row.result = result;
    row.message =
      row.action === "PAY_AND_CLOSE"
        ? `Đã ghi nhận tiền mặt ${result.totalVnd} VND, phiếu #${result.receiptId}. Không thu lại.`
        : "Quán đã ghi nhận thao tác tính tiền.";
    await save(row);
    return result;
  } catch (e) {
    if (e instanceof ApiError && definite.has(e.code)) {
      row.status = "REJECTED";
      row.message = e.message;
      await save(row);
    }
    throw e;
  }
}
async function lookup(session: SessionInfo, row: StaffIntent) {
  if ((await fingerprint(row.action, row.data)) !== row.fingerprint) {
    row.status = "BLOCKED";
    row.message = "Nội dung nhật ký không khớp. Cần đối chiếu thủ công.";
    await save(row);
    return true;
  }
  const known = await api.command<{
    found: boolean;
    action: string;
    fingerprint: string;
    result: Record<string, unknown>;
  }>(
    session.csrfToken,
    "GET_OUTCOME",
    { commandId: row.id },
    crypto.randomUUID(),
    row.scope,
  );
  if (!known.found) return false;
  if (
    known.action !== row.action ||
    known.fingerprint !== row.fingerprint ||
    !known.result ||
    (known.result.cancelledBeforeAcceptance !== true &&
      !validResult(row, known.result))
  ) {
    row.status = "BLOCKED";
    row.message = "Kết quả không khớp ý định thu ngân.";
  } else {
    row.result = known.result;
    row.status = known.result.cancelledBeforeAcceptance
      ? "CANCELLED"
      : "ACCEPTED";
    row.message = known.result.cancelledBeforeAcceptance
      ? "Đã bỏ thao tác chưa được nhận; lệnh đến muộn bị chặn."
      : row.action === "PAY_AND_CLOSE"
        ? `Đã ghi nhận tiền mặt ${known.result.totalVnd} VND, phiếu #${known.result.receiptId}. Không thu lại.`
        : "Đã đối chiếu: quán đã thực hiện thao tác tính tiền.";
  }
  await save(row);
  return true;
}
export const staffJournal = {
  async read(session: SessionInfo) {
    const key = owner(session);
    return transaction(async (store) =>
      ((await req(store.getAll())) as StaffIntent[]).filter(
        (row) => row.owner === key,
      ),
    );
  },
  async assertNone(session: SessionInfo) {
    if ((await this.read(session)).some(staffPending))
      throw new JournalError(
        "Có thao tác thu ngân chưa rõ kết quả. Đối chiếu trước khi thao tác tiếp.",
      );
  },
  async execute(
    session: SessionInfo,
    action: string,
    data: Record<string, unknown>,
  ) {
    return locked(async () => {
      const current = await live(session),
        key = owner(current);
      const row: StaffIntent = {
        id: crypto.randomUUID(),
        owner: key,
        scope: scope(current),
        action,
        data: structuredClone(data),
        fingerprint: await fingerprint(action, data),
        createdAt: Date.now(),
        status: "PENDING",
        message:
          "Chưa rõ kết quả thao tác thu ngân. Không thu tiền hoặc gửi lệnh khác trước khi đối chiếu.",
      };
      await transaction(async (store) => {
        if (
          ((await req(store.getAll())) as StaffIntent[]).some(
            (r) => r.owner === key && staffPending(r),
          )
        )
          throw new JournalError("Có thao tác thu ngân cần đối chiếu.");
        store.add(row);
      });
      return send(current, row);
    });
  },
  async reconcile(session: SessionInfo) {
    return locked(async () => {
      const current = await live(session);
      for (const row of (await this.read(current)).filter(staffPending)) {
        if (row.status === "BLOCKED") continue;
        if (!(await lookup(current, row))) {
          row.status = "CONFIRM_REQUIRED";
          row.message =
            "Server chưa có kết quả. Kiểm tra tình trạng bàn và tiền mặt trước khi thực hiện lại hoặc bỏ thao tác.";
          await save(row);
        }
      }
    });
  },
  async decide(session: SessionInfo, id: string, retry: boolean) {
    return locked(async () => {
      const current = await live(session),
        row = (await this.read(current)).find((r) => r.id === id);
      if (!row || !staffPending(row) || row.status === "BLOCKED")
        throw new JournalError("Không có thao tác hợp lệ cần xử lý.");
      if (await lookup(current, row)) return;
      if (retry) return send(current, row);
      await api.command(
        current.csrfToken,
        "DISCARD_COMMAND",
        { commandId: row.id, action: row.action, payload: row.data },
        crypto.randomUUID(),
        row.scope,
      );
      await lookup(current, row);
    });
  },
};
