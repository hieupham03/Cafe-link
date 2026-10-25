import type { GuestScope, MenuItem } from "./models";

export interface CartItem {
  note?: string;
  menuId: number;
  name: string;
  priceVnd: number;
  quantity: number;
  version?: number;
}
export interface Cart {
  continuedTo?: string;
  scope: string;
  revision: number;
  items: CartItem[];
  note?: string;
}
export type Status =
  | "PENDING"
  | "CONFIRM_REQUIRED"
  | "BLOCKED"
  | "ACCEPTED"
  | "CANCELLED"
  | "REJECTED";
export interface Intent {
  id: string;
  scope: string;
  owner: GuestScope;
  action: "PLACE_ORDER" | "CALL_SERVICE" | "AMEND_SERVICE" | "CANCEL_SERVICE" | "REQUEST_CHECKOUT";
  data: {
    visitId: string;
    items?: {
      menuId: number;
      quantity: number;
      note?: string;
      expectedPurchaseVersion?: number;
      expectedVersion?: number;
      expectedPriceVnd?: number;
    }[];
    note?: string;
    ticketId?: number;
    expectedVersion?: number;
    expectedVisitVersion?: number;
    expectedCheckoutVersion?: number;
  };
  fingerprint: string;
  cartRevision: number;
  preview: CartItem[];
  createdAt: number;
  status: Status;
  result?: Record<string, unknown>;
  message: string;
}
export class JournalError extends Error {}
export const scopeKey = (scope: GuestScope) =>
  JSON.stringify([scope.storeId, scope.visitId, scope.membershipId]);
export const unresolved = (entry: Intent) =>
  !["ACCEPTED", "CANCELLED", "REJECTED"].includes(entry.status);
const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
let database: Promise<IDBDatabase> | undefined;
function open() {
  if (!globalThis.indexedDB)
    throw new JournalError(
      "Trình duyệt không hỗ trợ IndexedDB. Không thể gửi yêu cầu an toàn.",
    );
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("cafelink-web-journal", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("carts", { keyPath: "scope" });
        req.result.createObjectStore("commands", { keyPath: "id" });
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => {
          req.result.close();
          database = undefined;
        };
        resolve(req.result);
      };
      req.onerror = () => {
        database = undefined;
        reject(req.error);
      };
      req.onblocked = () => {
        database = undefined;
        reject(
          new JournalError(
            "Nhật ký đang bị một tab cũ giữ. Hãy đóng tab cũ rồi thử lại.",
          ),
        );
      };
    });
  return database;
}
async function transaction<T>(
  mode: IDBTransactionMode,
  work: (carts: IDBObjectStore, commands: IDBObjectStore) => Promise<T>,
): Promise<T> {
  let tx: IDBTransaction | undefined, done: Promise<void> | undefined;
  try {
    const db = await open();
    tx = db.transaction(
      ["carts", "commands"],
      mode,
      mode === "readwrite" ? { durability: "strict" } : undefined,
    );
    done = new Promise<void>((resolve, reject) => {
      tx!.oncomplete = () => resolve();
      tx!.onabort = () => reject(tx!.error ?? new Error("Transaction aborted"));
    });
    // Observe rejection immediately, including synchronous put()/quota failures.
    void done.catch(() => {});
    const result = await work(
      tx.objectStore("carts"),
      tx.objectStore("commands"),
    );
    await done;
    return result;
  } catch (e) {
    try {
      tx?.abort();
    } catch {
      /* already completed */
    }
    await done?.catch(() => {});
    if (e instanceof JournalError) throw e;
    throw new JournalError(
      "Không ghi/đọc được nhật ký trình duyệt. Đã khóa gửi mới; hãy kiểm tra dung lượng hoặc quyền lưu dữ liệu.",
    );
  }
}
export async function withJournalLock<T>(
  action: () => Promise<T>,
  wait = false,
): Promise<T> {
  if (!navigator.locks)
    throw new JournalError(
      "Trình duyệt thiếu Web Locks. Hãy dùng Chrome/Edge hoặc trình duyệt được hỗ trợ để gửi món.",
    );
  return navigator.locks.request(
    "cafelink-guest-journal-v2",
    wait ? { signal: AbortSignal.timeout(10_000) } : { ifAvailable: true },
    async (lock) => {
      if (!lock)
        throw new JournalError(
          "Một tab khác đang xử lý. Chờ tab đó hoàn tất rồi thử lại.",
        );
      return action();
    },
  );
}
export async function fingerprint(
  action: string,
  data: unknown,
): Promise<string> {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value !== null && typeof value === "object")
      return (
        "{" +
        Object.keys(value)
          .sort()
          .map(
            (key) =>
              JSON.stringify(key) +
              ":" +
              canonical((value as Record<string, unknown>)[key]),
          )
          .join(",") +
        "}"
      );
    // Gson (HTML escaping disabled) still escapes these two line separators.
    return JSON.stringify(value)
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(action + "\n" + canonical(data)),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
const empty = (scope: string): Cart => ({ scope, revision: 0, items: [] });
function assertNone(entries: Intent[]) {
  if (entries.some(unresolved))
    throw new JournalError(
      "Có yêu cầu chưa rõ kết quả. Hãy đối chiếu trước khi gửi mới hoặc rời phiên.",
    );
}
async function prune(commands: IDBObjectStore) {
  const entries = (await request(commands.getAll())) as Intent[];
  for (const item of entries
    .filter((e) => !unresolved(e))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(200))
    commands.delete(item.id);
}
export const journal = {
  async continueCart(previous: GuestScope, next: GuestScope) {
    if(previous.storeId!==next.storeId||scopeKey(previous)===scopeKey(next))throw new JournalError("Không chuyển giỏ sang phạm vi không hợp lệ.");
    return transaction("readwrite",async(carts,commands)=>{
      const oldKey=scopeKey(previous),newKey=scopeKey(next);
      const source=((await request(carts.get(oldKey))) as Cart|undefined)??empty(oldKey);
      if(source.continuedTo===newKey)return;
      if(source.continuedTo)throw new JournalError("Giỏ đã được chuyển ở tab khác. Hãy tải lại.");
      assertNone((await request(commands.getAll())) as Intent[]);
      const target=(await request(carts.get(newKey))) as Cart|undefined;
      if(target&&(target.items.length||target.note))throw new JournalError("Giỏ mới đã có nội dung. Không ghi đè giỏ; hãy nhờ nhân viên hỗ trợ.");
      carts.put({...source,scope:newKey,revision:(target?.revision??0)+1});
      carts.put({...empty(oldKey),revision:source.revision+1,continuedTo:newKey});
    });
  },
  async read(scope: GuestScope) {
    const key = scopeKey(scope);
    return transaction("readonly", async (carts, commands) => ({
      cart: ((await request(carts.get(key))) as Cart | undefined) ?? empty(key),
      entries: (await request(commands.getAll())) as Intent[],
    }));
  },
  async assertNone() {
    await transaction("readonly", async (_, commands) =>
      assertNone((await request(commands.getAll())) as Intent[]),
    );
  },
  async edit(
    scope: GuestScope,
    revision: number,
    item: MenuItem,
    delta: number,
    note = "",
  ) {
    return transaction("readwrite", async (carts, commands) => {
      if(note.length>160)throw new JournalError("Ghi chú từng phần tối đa 160 ký tự.");
      assertNone((await request(commands.getAll())) as Intent[]);
      const key = scopeKey(scope),
        cart =
          ((await request(carts.get(key))) as Cart | undefined) ?? empty(key);
      if (cart.continuedTo) throw new JournalError("Phiên đã đổi. Hãy tải lại để sửa đúng giỏ.");
      if (cart.revision !== revision)
        throw new JournalError(
          "Giỏ đã thay đổi ở tab khác. Hãy xem lại giỏ mới nhất.",
        );
      const existing = cart.items.find((row) => row.menuId === item.id && (row.note??"") === note),
        quantity = (existing?.quantity ?? 0) + delta;
      if (quantity < 0 || quantity > 20)
        throw new JournalError("Mỗi món tối đa 20 phần.");
      cart.items = cart.items.filter((row) => row.menuId !== item.id || (row.note??"") !== note);
      if (quantity > 0)
        cart.items.push({
          menuId: item.id,
          note,
          name: existing?.name ?? item.name,
          priceVnd: existing?.priceVnd ?? item.priceVnd,
          quantity,
          version: existing?.version ?? item.purchaseVersion ?? item.version,
        });
      if (cart.items.length > 20)
        throw new JournalError("Mỗi đơn tối đa 20 món.");
      if(cart.items.filter(row=>row.menuId===item.id).reduce((sum,row)=>sum+row.quantity,0)>20)throw new JournalError("Mỗi món tối đa 20 phần, gồm mọi ghi chú khác nhau.");
      cart.items.sort((a, b) => a.menuId - b.menuId || (a.note??"").localeCompare(b.note??"","vi"));
      cart.revision++;
      carts.put(cart);
      return cart;
    });
  },
  async queue(scope: GuestScope, revision: number) {
    const snapshot = await journal.read(scope);
    assertNone(snapshot.entries);
    if (!snapshot.cart.items.length)
      throw new JournalError("Chọn món trước khi gửi đơn.");
    const data = {
      visitId: scope.visitId,
      items: snapshot.cart.items.map((row) => ({
        menuId: row.menuId,
        ...(row.note?{note:row.note}:{}),
        quantity: row.quantity,
        ...(row.version === undefined
          ? {}
          : { expectedVersion: row.version, expectedPurchaseVersion: row.version, expectedPriceVnd: row.priceVnd }),
      })),
      note: snapshot.cart.note ?? "",
    };
    const entry: Intent = {
      id: crypto.randomUUID(),
      scope: scopeKey(scope),
      owner: { ...scope },
      action: "PLACE_ORDER",
      data,
      fingerprint: await fingerprint("PLACE_ORDER", data),
      cartRevision: revision,
      preview: snapshot.cart.items,
      createdAt: Date.now(),
      status: "PENDING",
      message: "Đang chờ xác nhận từ quán.",
    };
    return transaction("readwrite", async (carts, commands) => {
      assertNone((await request(commands.getAll())) as Intent[]);
      const cart =
        ((await request(carts.get(entry.scope))) as Cart | undefined) ??
        empty(entry.scope);
      if(cart.continuedTo)throw new JournalError("Phiên đã đổi. Không gửi giỏ ở tab cũ.");
      if (cart.revision !== revision || snapshot.cart.revision !== revision)
        throw new JournalError(
          "Giỏ đã thay đổi ở tab khác. Hãy xem lại trước khi gửi.",
        );
      await prune(commands);
      commands.add(entry);
      return entry;
    });
  },
  async refreshMenu(scope: GuestScope, revision: number, menu: MenuItem[]) {
    return transaction("readwrite", async (carts, commands) => {
      assertNone((await request(commands.getAll())) as Intent[]);
      const key = scopeKey(scope),
        cart =
          ((await request(carts.get(key))) as Cart | undefined) ?? empty(key);
      if (cart.revision !== revision)
        throw new JournalError("Giỏ đã đổi. Hãy xem lại.");
      if(cart.continuedTo)throw new JournalError("Phiên đã đổi. Hãy tải lại để sửa đúng giỏ.");
      cart.items = cart.items.flatMap((row) => {
        const item = menu.find((i) => i.id === row.menuId);
        return !item || item.active === false || item.available === false
          ? []
          : [
              {
                ...row,
                name: item.name,
                priceVnd: item.priceVnd,
                version: item.purchaseVersion ?? item.version,
              },
            ];
      });
      cart.revision++;
      carts.put(cart);
      return cart;
    });
  },
  async mark(
    id: string,
    status: Status,
    message: string,
    result?: Record<string, unknown>,
  ) {
    return transaction("readwrite", async (carts, commands) => {
      const entry = (await request(commands.get(id))) as Intent | undefined;
      if (!entry)
        throw new JournalError(
          "Không tìm thấy nhật ký yêu cầu. Không tự gửi lại.",
        );
      if (!unresolved(entry) && entry.status !== status)
        throw new JournalError(
          "Kết quả nhật ký không khớp. Cần nhân viên hỗ trợ.",
        );
      entry.status = status;
      entry.message = message;
      entry.result = result;
      commands.put(entry);
      if (!unresolved(entry)) {
        const cart = (await request(carts.get(entry.scope))) as
          | Cart
          | undefined;
        if (
          entry.action === "PLACE_ORDER" &&
          cart?.revision === entry.cartRevision
        ) {
          cart.revision++;
          if (status !== "REJECTED") {
            cart.items = [];
            cart.note = "";
          }
          carts.put(cart);
        }
        await prune(commands);
      }
      return entry;
    });
  },
  async setNote(scope: GuestScope, note: string) {
    if (note.length > 500) throw new JournalError("Ghi chú tối đa 500 ký tự.");
    return transaction("readwrite", async (carts, commands) => {
      assertNone((await request(commands.getAll())) as Intent[]);
      const key = scopeKey(scope),
        cart =
          ((await request(carts.get(key))) as Cart | undefined) ?? empty(key);
      if (cart.note !== note) {
        if(cart.continuedTo)throw new JournalError("Phiên đã đổi. Hãy tải lại để sửa đúng giỏ.");
        cart.note = note;
        cart.revision++;
        carts.put(cart);
      }
      return cart;
    });
  },
  async queueAction(
    scope: GuestScope,
    action: "CALL_SERVICE" | "AMEND_SERVICE" | "CANCEL_SERVICE" | "REQUEST_CHECKOUT",
    data: Intent["data"],
  ) {
    if (data.visitId !== scope.visitId)
      throw new JournalError("Yêu cầu không thuộc lượt này.");
    const entry: Intent = {
      id: crypto.randomUUID(),
      scope: scopeKey(scope),
      owner: { ...scope },
      action,
      data: structuredClone(data),
      fingerprint: await fingerprint(action, data),
      cartRevision: -1,
      preview: [],
      createdAt: Date.now(),
      status: "PENDING",
      message: "Đang chờ quán xác nhận yêu cầu.",
    };
    return transaction("readwrite", async (_, commands) => {
      assertNone((await request(commands.getAll())) as Intent[]);
      await prune(commands);
      commands.add(entry);
      return entry;
    });
  },
};
