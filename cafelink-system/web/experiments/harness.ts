import { api, ApiError } from "../src/api";
import { guestScope } from "../src/models";
import { journal, withJournalLock } from "../src/journal";
import { place, reconcile, requestGuestAction } from "../src/orderRecovery";
import type { RecoveryPolicy } from "../src/orderRecovery";

type Sample = {
  action: string;
  status: number;
  durationMs: number;
  requestBodyBytes: number;
  responseBodyBytes: number;
};
let samples: Sample[] = [],
  generation = 0;
const original = window.fetch.bind(window),
  bytes = (s: string) => new TextEncoder().encode(s).length;
window.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
    location.href,
  );
  const body = typeof init?.body === "string" ? init.body : "";
  let action = url.pathname;
  if (url.pathname === "/api/command")
    try {
      action = JSON.parse(body).action;
    } catch {
      /* Malformed traffic is not an experiment command. */
    }
  const began = performance.now(),
    epoch = generation;
  try {
    const result = await original(input, init),
      text = await result.clone().text();
    if (epoch === generation && url.pathname.startsWith("/api/"))
      samples.push({
        action,
        status: result.status,
        durationMs: performance.now() - began,
        requestBodyBytes: bytes(body),
        responseBodyBytes: bytes(text),
      });
    return result;
  } catch (e) {
    if (epoch === generation)
      samples.push({
        action,
        status: 0,
        durationMs: performance.now() - began,
        requestBodyBytes: bytes(body),
        responseBodyBytes: 0,
      });
    throw e;
  }
};
async function read() {
  const info = await api.session(),
    scope = guestScope(info);
  return { scope, ...(await journal.read(scope)), state: await api.state() };
}
async function queueAndSend(action: "PLACE_ORDER" | "CALL_SERVICE") {
  const info = await api.session(),
    scope = guestScope(info);
  try {
    if (action === "CALL_SERVICE")
      await requestGuestAction(scope, action, {
        visitId: scope.visitId,
        note: "Controlled experiment service request",
      });
    else {
      const state = await api.state(),
        item = state.menu.find((i) => i.id === 2)!;
      const cart = await withJournalLock(async () => {
        const value = await journal.read(scope);
        return journal.edit(scope, value.cart.revision, item, 1);
      });
      await place(scope, cart.revision);
    }
  } catch (e) {
    if (!(e instanceof ApiError && e.code === "NETWORK_LOST")) throw e;
  }
  return read();
}
const harness = {
  read,
  queueAndSend,
  startSampling() {
    samples = [];
    generation++;
  },
  samples() {
    return samples.slice();
  },
  async recover(policy: RecoveryPolicy) {
    const began = performance.now();
    const info = await api.session();
    await reconcile(guestScope(info), policy);
    return { ...(await read()), recoveryMs: performance.now() - began };
  },
  async loadStep() {
    const began = performance.now(), info = await api.session(), scope = guestScope(info);
    const state = await api.state(), item = state.menu.find(i => i.id === 2)!;
    const cart = await withJournalLock(async () => {
      const value = await journal.read(scope);
      return journal.edit(scope, value.cart.revision, item, 1);
    });
    let orderId = 0, renderedAt: number | undefined;
    const observe = () => {
      if (orderId && Array.from(document.querySelectorAll("strong")).some(n => n.textContent === `Đơn #${orderId}`))
        renderedAt ??= performance.now();
    };
    const observer = new MutationObserver(observe);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    try {
      await place(scope, cart.revision);
      const entry = (await journal.read(scope)).entries.find(e => e.cartRevision === cart.revision && e.action === "PLACE_ORDER");
      // The accepted receipt is the source of the order identifier.
      orderId = Number(entry?.result?.orderId);
      if (!orderId) throw new Error("Load order has no accepted receipt");
      const responseMs = performance.now() - began;
      observe();
      const payment = await api.command<Record<string, unknown>>(info.csrfToken, "START_ORDER_PAYMENT", {visitId:scope.visitId, orderId}, crypto.randomUUID(), scope);
      await api.command(info.csrfToken,"SIMULATE_PAYMENT",{...payment,outcome:"SUCCESS"},crypto.randomUUID(),scope);
      for(let n=0;n<150 && renderedAt === undefined;n++) await new Promise(ok=>setTimeout(ok,20));
      if(renderedAt === undefined) throw new Error("React did not render the accepted order within 3 seconds");
      return {orderId,responseMs,renderMs:renderedAt-began,totalMs:performance.now()-began};
    } finally { observer.disconnect(); }
  },
  async late() {
    const info = await api.session(),
      scope = guestScope(info),
      entry = (await journal.read(scope)).entries[0];
    try {
      return {
        ok: true,
        result: await api.command(
          info.csrfToken,
          entry.action,
          entry.data,
          entry.id,
          scope,
        ),
      };
    } catch (e) {
      if (e instanceof ApiError) return { ok: false, code: e.code };
      throw e;
    }
  },
};
(window as unknown as { cafeExperiment: typeof harness }).cafeExperiment =
  harness;
