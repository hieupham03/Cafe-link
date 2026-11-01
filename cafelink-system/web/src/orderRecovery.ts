import { api, ApiError } from "./api";
import { guestScope } from "./models";
import type { GuestScope, SessionInfo } from "./models";
import {
  fingerprint,
  journal,
  JournalError,
  scopeKey,
  unresolved,
  withJournalLock,
} from "./journal";
import type { Intent } from "./journal";

interface Outcome {
  found: boolean;
  action?: string;
  fingerprint?: string;
  result?: Record<string, unknown>;
}
const definitive = new Set([
  "INVALID_INPUT",
  "NOT_FOUND",
  "FORBIDDEN",
  "STALE_SESSION",
  "SESSION_CLOSED",
  "INVALID_STATE",
  "ORDERING_PAUSED",
  "MENU_CHANGED",
  "TAX_CHANGED",
  "ITEM_UNAVAILABLE",
  "CHECKOUT_IN_PROGRESS",
  "COMMAND_DISCARDED",
  "TICKET_ALREADY_OPEN",
  "VERSION_CONFLICT",
]);
export async function liveSession(scope: GuestScope): Promise<SessionInfo> {
  const info = await api.session();
  if (scopeKey(guestScope(info)) !== scopeKey(scope))
    throw new JournalError(
      "Phiên đã thay đổi. Không chuyển yêu cầu cũ sang người dùng hoặc lượt bàn mới.",
    );
  if (!info.connected)
    throw new JournalError(
      "Chưa kết nối được tới quán. Không gửi lại yêu cầu lúc này.",
    );
  return info;
}
async function resolve(entry: Intent, known: Outcome) {
  if (
    known.action !== entry.action ||
    known.fingerprint !== entry.fingerprint ||
    !known.result ||
    (known.result.cancelledBeforeAcceptance !== true &&
      !validResult(entry, known.result))
  ) {
    await journal.mark(
      entry.id,
      "BLOCKED",
      "Kết quả không khớp nội dung đã lưu. Cần nhân viên hỗ trợ.",
    );
    return;
  }
  const cancelled = known.result.cancelledBeforeAcceptance === true;
  await journal.mark(
    entry.id,
    cancelled ? "CANCELLED" : "ACCEPTED",
    cancelled
      ? entry.action === "CALL_SERVICE"
        ? "Lời gọi cũ chưa được nhận đã được bỏ. Nếu vẫn cần, hãy gọi nhân viên lại."
        : "Đã bỏ yêu cầu chưa được nhận; lệnh đến muộn bị khóa."
      : acceptedMessage(entry, known.result),
    known.result,
  );
}
function validResult(entry: Intent, result: Record<string, unknown>) {
  if(entry.action==='AMEND_SERVICE'||entry.action==='CANCEL_SERVICE')return result.ticketId===entry.data.ticketId&&result.version===(entry.data.expectedVersion??-1)+1&&result.state===(entry.action==='CANCEL_SERVICE'?'CANCELLED':'OPEN');
  if (["CALL_SERVICE","AMEND_SERVICE","CANCEL_SERVICE"].includes(entry.action))
    return Number.isSafeInteger(result.ticketId);
  if (entry.action === "REQUEST_CHECKOUT")
    return (
      typeof result.checkoutId === "string" &&
      Number.isSafeInteger(result.version)
    );
  return (
    Number.isSafeInteger(result.orderId) &&
    Number.isSafeInteger(result.totalVnd)
  );
}
function acceptedMessage(entry: Intent, result: Record<string, unknown>) {
  if(entry.action==='AMEND_SERVICE')return `Quán đã nhận nội dung bổ sung cho yêu cầu #${result.ticketId}.`;
  if(entry.action==='CANCEL_SERVICE')return `Đã rút yêu cầu #${result.ticketId}.`;
  if (["CALL_SERVICE","AMEND_SERVICE","CANCEL_SERVICE"].includes(entry.action))
    return `Quán đã nhận lời gọi #${result.ticketId}.`;
  if (entry.action === "REQUEST_CHECKOUT")
    return "Quán đã nhận yêu cầu tính tiền. Theo dõi trạng thái tính tiền của bàn.";
  return result.paymentRequired
    ? `Đã lưu đơn #${result.orderId}. Thanh toán để quán bắt đầu pha chế.`
    : `Quán đã nhận đơn #${result.orderId}.`;
}
async function lookup(info: SessionInfo, scope: GuestScope, entry: Intent) {
  if (
    entry.scope !== scopeKey(scope) ||
    entry.data.visitId !== scope.visitId ||
    (await fingerprint(entry.action, entry.data)) !== entry.fingerprint
  ) {
    await journal.mark(
      entry.id,
      "BLOCKED",
      "Nhật ký sai phạm vi hoặc nội dung. Không gửi yêu cầu này.",
    );
    return true;
  }
  const known = await api.command<Outcome>(
    info.csrfToken,
    "GET_OUTCOME",
    { commandId: entry.id },
    crypto.randomUUID(),
    scope,
  );
  if (known.found) {
    await resolve(entry, known);
    return true;
  }
  return false;
}
async function send(info: SessionInfo, scope: GuestScope, entry: Intent) {
  try {
    const result = await api.command<Record<string, unknown>>(
      info.csrfToken,
      entry.action,
      entry.data,
      entry.id,
      scope,
    );
    if (!validResult(entry, result))
      throw new JournalError(
        "Phản hồi chưa đủ để xác nhận đơn. Hãy đối chiếu lại.",
      );
    await journal.mark(
      entry.id,
      "ACCEPTED",
      acceptedMessage(entry, result),
      result,
    );
  } catch (e) {
    if (e instanceof ApiError && definitive.has(e.code))
      await journal.mark(entry.id, "REJECTED", e.message);
    // Transport, auth, database, malformed ACK or local persistence failures remain unresolved.
    else throw e;
  }
}
async function discard(info: SessionInfo, scope: GuestScope, entry: Intent) {
  const known = await api.command<Outcome>(
    info.csrfToken,
    "DISCARD_COMMAND",
    { commandId: entry.id, action: entry.action, payload: entry.data },
    crypto.randomUUID(),
    scope,
  );
  await resolve(entry, known);
}
export type RecoveryPolicy = "REPLAY_ALL" | "REVIEW" | "SEMANTIC";
// Product UI uses the default; explicit baselines are exercised by the isolated harness.
export async function reconcile(
  scope: GuestScope,
  policy: RecoveryPolicy = "SEMANTIC",
) {
  if (!["REPLAY_ALL", "REVIEW", "SEMANTIC"].includes(policy))
    throw new JournalError("Invalid recovery policy");
  return withJournalLock(async () => {
    const info = await liveSession(scope),
      snapshot = await api.state(),
      data = await journal.read(scope);
    for (const entry of data.entries.filter(
      (e) =>
        e.scope === scopeKey(scope) && unresolved(e) && e.status !== "BLOCKED",
    )) {
      if (policy === "REPLAY_ALL") {
        if (
          entry.data.visitId !== scope.visitId ||
          (await fingerprint(entry.action, entry.data)) !== entry.fingerprint
        ) {
          await journal.mark(
            entry.id,
            "BLOCKED",
            "Nhật ký sai phạm vi hoặc nội dung. Không gửi yêu cầu này.",
          );
        } else await send(info, scope, entry);
        continue;
      }
      if (await lookup(info, scope, entry)) continue;
      if (
        policy === "SEMANTIC" &&
        (["CALL_SERVICE","AMEND_SERVICE"].includes(entry.action) ||
          snapshot.tables[0]?.visitId !== scope.visitId)
      )
        await discard(info, scope, entry);
      else if (snapshot.tables[0]?.visitId !== scope.visitId)
        await journal.mark(
          entry.id,
          "REJECTED",
          "Lượt khách đã kết thúc; không chuyển yêu cầu sang lượt mới.",
        );
      else
        await journal.mark(
          entry.id,
          "CONFIRM_REQUIRED",
          entry.action === "REQUEST_CHECKOUT"
            ? "Chưa có kết quả cho yêu cầu tính tiền này. Kiểm tra trạng thái tính tiền hiện tại của bàn trước khi xác nhận hoặc bỏ."
            : "Quán chưa ghi nhận đơn này. Chỉ gửi lại nếu bạn vẫn muốn đặt.",
        );
    }
    return snapshot;
  }, true);
}
export async function requestGuestAction(
  scope: GuestScope,
  action: "CALL_SERVICE" | "AMEND_SERVICE" | "CANCEL_SERVICE" | "REQUEST_CHECKOUT",
  data: Intent["data"],
) {
  return withJournalLock(async () => {
    const info = await liveSession(scope);
    const entry = await journal.queueAction(scope, action, data);
    await send(info, scope, entry);
  });
}
export async function place(scope: GuestScope, revision: number, expectedTaxVersion?: number) {
  return withJournalLock(async () => {
    const info = await liveSession(scope);
    const entry = await journal.queue(scope, revision, expectedTaxVersion);
    await send(info, scope, entry);
  });
}
export async function recover(
  scope: GuestScope,
  id: string,
  decision: "confirm" | "discard",
) {
  return withJournalLock(async () => {
    const info = await liveSession(scope),
      data = await journal.read(scope);
    const entry = data.entries.find(
      (row) => row.id === id && row.scope === scopeKey(scope),
    );
    if (!entry || !unresolved(entry) || entry.status === "BLOCKED")
      throw new JournalError(
        "Yêu cầu không còn chờ phục hồi hoặc cần nhân viên hỗ trợ.",
      );
    if (await lookup(info, scope, entry)) return;
    if (decision === "discard") await discard(info, scope, entry);
    else {
      const snapshot = await api.state();
      if (snapshot.tables[0]?.visitId !== scope.visitId)
        await discard(info, scope, entry);
      else await send(info, scope, entry);
    }
  });
}
