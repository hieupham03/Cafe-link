import { useCallback, useEffect, useRef, useState } from "react";
import { GuestHome } from "./Guest";
import { api } from "./api";
import { guestScope, money, taxPreview } from "./models";
import type { MenuItem, SessionInfo, ContinuationContext } from "./models";
import { journal, scopeKey, unresolved, withJournalLock } from "./journal";
import type { Cart, Intent } from "./journal";
import { place, reconcile, recover, requestGuestAction, liveSession } from "./orderRecovery";
import { useGuestConnection } from "./useGuestConnection";
import { CartNote } from "./CartNote";
import { actionTitle } from "./ui";
import { GuestPayments } from "./GuestPayments";
import { Notifications } from "./Notifications";
import { Icon } from "./Icons";
import { GuestSupport } from "./GuestSupport";
import { RecoveryGuide } from "./Assistance";
import { Dialog } from "./Dialog";
import { GuestSectionHeading } from "./GuestSectionHeading";

export function GuestWorkspace({
  session,
  outerError,
  onLeft,
  onRestart,
}: {
  session: SessionInfo;
  outerError: string;
  onLeft: () => void;
  onRestart: (session: SessionInfo) => void;
}) {
  const scope = guestScope(session),
    key = scopeKey(scope);
  const [cart, setCart] = useState<Cart>({
      scope: key,
      revision: 0,
      items: [],
    }),
    [entries, setEntries] = useState<Intent[]>([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const [serviceNote, setServiceNote] = useState("");
  const [noteBlocked, setNoteBlocked] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<number>();
  const [previous, setPrevious] = useState<ContinuationContext>({previousOrders:[],resolutions:[]});
  const [confirmLeave, setConfirmLeave] = useState(false);
  const lock = useRef(false),
    live = useRef(true),
    channel = useRef<BroadcastChannel | null>(null);
  const read = useCallback(async () => {
    const value = await journal.read(scope);
    if (live.current) {
      setCart(value.cart);
      setEntries(value.entries);
    }
    return value;
  }, [key]);
  const announce = () => {
    channel.current?.postMessage("changed");
  };
  const reconcileNow = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setReady(false);
    setBusy(true);
    try {
      const info=await liveSession(scope);
      const context=await api.command<ContinuationContext>(info.csrfToken,"GET_CONTINUATION_CONTEXT",{},crypto.randomUUID(),scope);
      if(context.previousScope)await withJournalLock(()=>journal.continueCart(context.previousScope!,scope),true);
      if(live.current)setPrevious(context);
      await reconcile(scope);
      if (live.current) {
        setReady(true);
        setError("");
      }
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      try {
        await read();
      } catch (e) {
        if (live.current) {
          setReady(false);
          setError((e as Error).message);
        }
      }
      lock.current = false;
      if (live.current) setBusy(false);
      announce();
    }
  }, [key, read]);
  const connection = useGuestConnection(session, () => {
    void reconcileNow();
  });
  useEffect(() => {
    live.current = true;
    const refresh = () => {
      void read().catch((e) => {
        if (live.current) {
          setReady(false);
          setError(e.message);
        }
      });
    };
    const bus =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("cafelink-journal-updates")
        : null;
    channel.current = bus;
    if (bus) bus.onmessage = refresh;
    refresh();
    const poll = setInterval(refresh, 2000);
    return () => {
      live.current = false;
      clearInterval(poll);
      bus?.close();
      channel.current = null;
    };
  }, [read]);
  useEffect(() => {
    if (!connection.connected) setReady(false);
  }, [connection.connected]);
  useEffect(() => {
    if (
      connection.connected &&
      connection.state?.tables[0]?.status === "SESSION_ENDED"
    )
      void reconcileNow();
  }, [connection.connected, connection.state?.tables[0]?.status]);
  async function act(action: () => Promise<unknown>, needsReconcile = false) {
    if (lock.current) return false;
    let succeeded = false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      succeeded = true;
    } catch (e) {
      setError((e as Error).message);
      if (needsReconcile) setReady(false);
    } finally {
      try {
        await read();
      } catch (e) {
        succeeded = false;
        setReady(false);
        setError((e as Error).message);
      }
      lock.current = false;
      setBusy(false);
      announce();
    }
    return succeeded;
  }
  const pending = entries.filter(unresolved),
    current = entries
      .filter((e) => e.scope === key)
      .sort((a, b) => b.createdAt - a.createdAt);
  const disabled =
    busy ||
    !ready ||
    !connection.connected ||
    pending.length > 0 ||
    noteBlocked;
  const table = connection.state?.tables[0],
    checkout = connection.state?.checkouts?.find(
      (c) => c.visitId === scope.visitId,
    );
  const checkoutActive =
    checkout?.state === "REQUESTED" || checkout?.state === "ACKNOWLEDGED";
  const prepaid = table?.paymentMode === "PREPAY";
  const taxSettings = connection.state?.taxSettings;
  const cartAmounts = taxPreview(cart.items.reduce((sum, item) => sum + item.priceVnd * item.quantity, 0), taxSettings);
  const completed = table?.automatic && table.status === "SESSION_ENDED";
  const changedItems = cart.items.filter((row) => {
    const current = connection.state?.menu.find((i) => i.id === row.menuId);
    return (
      connection.state &&
      (!current ||
        current.available === false ||
        current.active === false ||
        row.priceVnd !== current.priceVnd ||
        row.version !== (current.purchaseVersion ?? current.version))
    );
  });
  async function leave(confirmed=false) {
    await act(() =>
      withJournalLock(async () => {
        await journal.assertNone();
        await liveSession(scope);
        const fresh=await api.state();
        if(fresh.tables[0]?.automatic && (fresh.orders.some(o=>!['CANCELLED','REFUNDED'].includes(o.paymentState??'')&&(o.paymentState!=='PAID'||o.status!=='SERVED'))||fresh.tickets.some(t=>t.status==='OPEN')))
          throw new Error('Bạn còn đơn hoặc yêu cầu đang xử lý. Hãy giữ phiên để theo dõi; liên hệ nhân viên nếu cần hỗ trợ.');
        const draft=await journal.read(scope);
        if((draft.cart.items.length||draft.cart.note)&&!confirmed){setConfirmLeave(true);return;}
        await api.leave();
        onLeft();
      }),
    );
  }
  async function restart() {
    await act(() =>
      withJournalLock(async () => {
        await journal.assertNone();
        const current=await liveSession(scope);
        onRestart(await api.continueVisit(current));
      }),
    );
  }
  const ordering = (
    <>
      <RecoveryGuide/>
      {connection.state?.storeAcceptingOrders===false&&<p className="warning" role="status">Quán tạm dừng nhận đơn mới. Đơn đã nhận, thanh toán và hỗ trợ vẫn tiếp tục.</p>}
      <Notifications
        session={session}
        revision={connection.state?.revision}
        onOpen={(event) => {
          const id =
            event.type === "CALL_SERVICE" || event.type === "HANDLE_TICKET"
              ? "guest-support"
              : event.type.includes("PAY")
                ? "guest-checkout"
                : "guest-orders";
          document.getElementById(id)?.scrollIntoView({ block: "start" });
        }}
      />
      <section className="guest-ordering" id="guest-workspace">
          <section
            id="guest-cart"
            className="cart-panel guest-zone"
            data-guest-zone="cart"
            aria-labelledby="cart-heading"
          >
            <GuestSectionHeading id="cart-heading" icon="bag" title="Giỏ hàng của bạn" description="Món đang chọn, chưa gửi đến quán."
              meta={`${cart.items.reduce((sum, item) => sum + item.quantity, 0)} phần`}
              actions={<button
                className="text-button"
                disabled={busy || !connection.connected}
                onClick={() => void reconcileNow()}
              >
                Đối chiếu yêu cầu
              </button>} />
            {!ready && (
              <p className="warning banner">
                Đang khóa gửi mới để kiểm tra kết nối và nhật ký yêu cầu.
              </p>
            )}
            {cart.items.length === 0 ? (
              <p className="muted">
                Chọn đồ uống trong thực đơn để thêm vào giỏ.
              </p>
            ) : (
              <ul className="cart-items">
                {cart.items.map((item) => (
                  <li key={`${item.menuId}:${item.note??""}`}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{money(item.priceVnd)} / phần</small>
                      {item.note&&<p className="order-note">{item.note}</p>}
                    </div>
                    <div className="quantity-control">
                      <button
                        aria-label={`Bớt ${item.name}${item.note?` · ${item.note}`:""}`}
                        disabled={disabled || checkoutActive}
                        onClick={() =>
                          void act(() =>
                            withJournalLock(() =>
                              journal.edit(
                                scope,
                                cart.revision,
                                {
                                  id: item.menuId,
                                  name: item.name,
                                  priceVnd: item.priceVnd,
                                  category: "",
                                },
                                -1,
                                item.note,
                              ),
                            ),
                          )
                        }
                      >
                        −
                      </button>
                      <span aria-label={`Số lượng ${item.name}${item.note?` · ${item.note}`:""}`}>
                        {item.quantity}
                      </span>
                      <button
                        aria-label={`Tăng ${item.name}${item.note?` · ${item.note}`:""}`}
                        disabled={
                          disabled || checkoutActive || item.quantity >= 20
                        }
                        onClick={() =>
                          void act(() =>
                            withJournalLock(() =>
                              journal.edit(
                                scope,
                                cart.revision,
                                {
                                  id: item.menuId,
                                  name: item.name,
                                  priceVnd: item.priceVnd,
                                  category: "",
                                },
                                1,
                                item.note,
                              ),
                            ),
                          )
                        }
                      >
                        +
                      </button>
                      <button
                        className="text-button"
                        aria-label={`Xóa ${item.name}${item.note?` · ${item.note}`:""}`}
                        disabled={disabled || checkoutActive}
                        onClick={() =>
                          void act(() =>
                            withJournalLock(() =>
                              journal.edit(
                                scope,
                                cart.revision,
                                {
                                  id: item.menuId,
                                  name: item.name,
                                  priceVnd: item.priceVnd,
                                  category: "",
                                },
                                -item.quantity,
                                item.note,
                              ),
                            ),
                          )
                        }
                      >
                        Xóa
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <CartNote
              scope={scope}
              note={cart.note ?? ""}
              disabled={
                busy ||
                !ready ||
                pending.length > 0 ||
                checkoutActive ||
                (!table?.visitId && !completed)
              }
              onSaved={async () => {
                const data = await read();
                if (live.current) setError("");
                return data;
              }}
              onBlocked={setNoteBlocked}
              onError={setError}
            />
            {changedItems.length > 0 && (
              <div className="warning" role="status">
                <p>
                  Thực đơn đã thay đổi:{" "}
                  {changedItems.map((i) => i.name).join(", ")}. Xem lại giá; món
                  hết/ngừng bán sẽ được bỏ khỏi giỏ khi xác nhận.
                </p>
                <button
                  disabled={disabled}
                  onClick={() =>
                    void act(() =>
                      withJournalLock(() =>
                        journal.refreshMenu(
                          scope,
                          cart.revision,
                          connection.state?.menu ?? [],
                        ),
                      ),
                    )
                  }
                >
                  Cập nhật giỏ theo thực đơn mới
                </button>
              </div>
            )}
            <div className="cart-footer">
              {taxSettings?.enabled && <div className="tax-breakdown">
                <span>Tiền hàng trước thuế <strong>{money(cartAmounts.subtotalVnd)}</strong></span>
                <span>{taxSettings.name} ({taxSettings.rateBps / 100}%) <strong>{money(cartAmounts.taxVnd)}</strong></span>
                <small>{taxSettings.inclusive ? "Giá thực đơn đã gồm thuế." : "Thuế được cộng thêm vào giá thực đơn."}</small>
              </div>}
              <strong data-testid="cart-total">
                Tổng thanh toán: {money(cartAmounts.totalVnd)}
              </strong>
              <button
                className="primary"
                disabled={
                  disabled ||
                  connection.state?.storeAcceptingOrders === false ||
                  checkoutActive ||
                  (!table?.visitId && !completed) ||
                  !cart.items.length ||
                  (changedItems.length > 0 && !completed)
                }
                onClick={() =>
                  completed ? void restart() : void act(async () => {
                    await place(scope, cart.revision, taxSettings?.version);
                    if (prepaid) {
                      const saved = await journal.read(scope);
                      const accepted = saved.entries
                        .filter(
                          (e) =>
                            e.scope === key &&
                            e.action === "PLACE_ORDER" &&
                            e.status === "ACCEPTED",
                        )
                        .sort((a, b) => b.createdAt - a.createdAt)[0];
                      if (accepted?.result)
                        setPaymentOrder(Number(accepted.result.orderId));
                    }
                  }, true)
                }
              >
                {completed ? "Tiếp tục giỏ ở lần đặt mới" : prepaid ? "Đặt món và thanh toán" : "Gửi đơn gọi món"}
              </button>
            </div>
          </section>
        {pending.length > 0 && (
          <section
            className="recovery-panel"
            aria-label="Yêu cầu cần đối chiếu"
          >
            <h3>Yêu cầu cần đối chiếu</h3>
            {pending.map((entry) => (
              <article key={entry.id}>
                <p>{entry.message}</p>
                <details className="technical-details">
                  <summary>
                    Chi tiết đối chiếu ·{" "}
                    {actionTitle[entry.action] ?? "Yêu cầu"}
                  </summary>
                  <small>
                    Mã: {entry.id} ·{" "}
                    {entry.preview
                      .map((row) => `${row.quantity}× ${row.name}`)
                      .join(", ")}
                  </small>
                </details>
                {entry.scope !== key ? (
                  <p className="error">
                    Yêu cầu thuộc phiên/lượt khác. Không gửi bằng quyền hiện
                    tại; cần quay lại đúng phiên hoặc nhờ nhân viên đối chiếu.
                  </p>
                ) : entry.status === "CONFIRM_REQUIRED" ? (
                  <div className="button-row">
                    <button
                      className="secondary"
                      disabled={busy || !connection.connected}
                      onClick={() =>
                        void act(
                          () => recover(scope, entry.id, "discard"),
                          true,
                        )
                      }
                    >
                      Bỏ yêu cầu chưa nhận
                    </button>
                    <button
                      className="primary"
                      disabled={busy || !connection.connected}
                      onClick={() =>
                        void act(
                          () => recover(scope, entry.id, "confirm"),
                          true,
                        )
                      }
                    >
                      Xác nhận gửi lại
                    </button>
                  </div>
                ) : entry.status === "BLOCKED" ? (
                  <p className="error">
                    Không tự sửa hoặc xóa nhật ký này. Cần nhân viên hỗ trợ.
                  </p>
                ) : (
                  <p className="muted">
                    Nhấn Đối chiếu yêu cầu khi kết nối ổn định.
                  </p>
                )}
              </article>
            ))}
          </section>
        )}
        {current
          .filter((e) => !unresolved(e))
          .slice(0, 5)
          .map((entry) => (
            <p
              key={entry.id}
              className={
                entry.status === "ACCEPTED" ? "order-receipt" : "muted"
              }
              role="status"
            >
              {entry.status === "ACCEPTED" &&
              entry.action === "PLACE_ORDER" &&
              connection.state?.orders.some(
                (o) =>
                  o.id === entry.result?.orderId && o.paymentState === "PAID",
              )
                ? `Quán đã xác nhận thanh toán đơn #${entry.result?.orderId}.`
                : entry.message}
            </p>
          ))}
        {connection.stopped && (
          <button className="secondary" onClick={connection.retry}>
            Thử kết nối lại
          </button>
        )}
        {prepaid ? (
          <GuestPayments
            session={session}
            orders={connection.state?.orders ?? []}
            disabled={disabled}
            autoOrder={paymentOrder}
          />
        ) : (
          <section
            className="checkout-panel guest-zone"
            data-guest-zone="payment"
            id="guest-checkout"
            aria-label="Tính tiền tại bàn"
          >
            <GuestSectionHeading id="guest-payment-heading" icon="check" title="Tính tiền" description="Gửi yêu cầu để nhân viên xác nhận thanh toán tại bàn." />
            <p className="checkout-total">
              Tổng đơn đã gọi{" "}
              <strong>
                {money(
                  connection.state?.orders.reduce(
                    (sum, order) => sum + order.totalVnd,
                    0,
                  ) ?? 0,
                )}
              </strong>
            </p>
            {checkoutActive ? (
              <p role="status">
                {checkout.state === "ACKNOWLEDGED"
                  ? "Quán đã tiếp nhận tính tiền"
                  : "Đã yêu cầu tính tiền"}
                . Bàn tạm dừng gọi thêm món. Liên hệ nhân viên nếu muốn gọi
                tiếp.
              </p>
            ) : checkout?.state === "PAID" ? (
              <p role="status">Đã thanh toán. Cảm ơn bạn!</p>
            ) : (
              <p className="muted">
                Yêu cầu tính tiền khi đã gọi món. Nhân viên sẽ xác nhận tiền mặt
                tại bàn.
              </p>
            )}
            <button
              className="secondary"
              disabled={
                disabled ||
                checkoutActive ||
                !table?.visitId ||
                !connection.state?.orders.length
              }
              onClick={() =>
                void act(
                  () =>
                    requestGuestAction(scope, "REQUEST_CHECKOUT", {
                      visitId: scope.visitId,
                      expectedVisitVersion: table!.version,
                      expectedCheckoutVersion: checkout?.version ?? 0,
                    }),
                  true,
                )
              }
            >
              Yêu cầu tính tiền
            </button>
          </section>
        )}
        {completed ? (
          <section id="guest-support" className="guest-services guest-zone" data-guest-zone="support" aria-labelledby="guest-support-heading">
            <GuestSectionHeading id="guest-support-heading" icon="help" title="Cần hỗ trợ thêm?" description="Liên hệ nhân viên sau khi nhận đủ món." />
            <p>Các việc trước đã hoàn tất. Bạn có thể bắt đầu yêu cầu mới, không cần mua thêm món.</p>
            <button className="secondary" disabled={disabled} onClick={()=>void restart()}>Tiếp tục hỗ trợ tại bàn</button>
          </section>
        ) : (
          <GuestSupport tickets={connection.state?.tickets??[]} disabled={disabled||!table?.visitId} act={(action,data)=>act(()=>requestGuestAction(scope,action,{...data,visitId:scope.visitId}),true)}/>

        )}
      </section>
      {confirmLeave&&<Dialog label="Xác nhận rời phiên" role="alertdialog" onClose={()=>setConfirmLeave(false)}>
        <h2>Rời phiên khi còn giỏ nháp?</h2>
        <p>Giỏ đang soạn chưa được gửi. Quét lại QR sẽ mở phiên khác và không tự mang giỏ này theo.</p>
        <div className="button-row"><button onClick={()=>setConfirmLeave(false)}>Ở lại</button><button disabled={busy} onClick={()=>void leave(true)}>Rời phiên và bỏ giỏ</button></div>
      </Dialog>}
      {(cart.items.length > 0 || pending.length > 0) && (
        <a className="cart-shortcut" href="#guest-cart">
          {pending.length > 0
            ? "Xem yêu cầu cần đối chiếu"
            : `Xem giỏ · ${cart.items.reduce((sum, item) => sum + item.quantity, 0)} phần · ${money(cartAmounts.totalVnd)}`}
        </a>
      )}
    </>
  );
  return (
    <GuestHome
      session={session}
      state={connection.state}
      connected={connection.connected}
      error={error || connection.error || outerError}
      onLogout={() => void leave()}
      onRestart={() => void restart()}
      ordering={ordering}
      previousOrders={previous.previousOrders}
      previousResolutions={previous.resolutions}
      cartQuantity={cart.items.reduce((sum, item) => sum + item.quantity, 0)}
      disabled={
        disabled ||
        checkoutActive ||
        (!table?.visitId && !completed)
      }
      onChoose={(item, quantity, note) =>
        act(() =>
          withJournalLock(() =>
            journal.edit(scope, cart.revision, item, quantity,note),
          ),
        )
      }
      menuControl={(item: MenuItem) => (
        <button
          className="quick-add"
          disabled={disabled || checkoutActive || (!table?.visitId && !completed)}
          aria-label={`Thêm ${item.name}`}
          onClick={() =>
            void act(() =>
              withJournalLock(() =>
                journal.edit(scope, cart.revision, item, 1),
              ),
            )
          }
        >
          <Icon name="plus" />
          <span className="sr-only">Thêm món</span>
        </button>
      )}
    />
  );
}
