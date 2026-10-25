import { useState } from "react";
import type { ReactNode } from "react";
import type { MenuItem } from "./models";
import { money } from "./models";
import { Dialog } from "./Dialog";
import { searchText } from "./ui";
import { MenuPhoto } from "./MenuAdmin";
import { Icon } from "./Icons";
import { GuestSectionHeading } from "./GuestSectionHeading";

export function GuestMenu({
  menu,
  menuControl,
  onChoose,
  disabled,
  error,
}: {
  menu: MenuItem[];
  menuControl?: (item: MenuItem) => ReactNode;
  onChoose?: (item: MenuItem, quantity: number, note?: string) => Promise<boolean>;
  disabled: boolean;
  error: string;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [chosen, setChosen] = useState<MenuItem | null>(null),
    [quantity, setQuantity] = useState(1),
    [sending, setSending] = useState(false),
    [failed, setFailed] = useState(false);
  const categories = [...new Set(menu.map((item) => item.category))];
  const visible = menu.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      searchText(`${item.name} ${item.category}`).includes(
        searchText(query.trim()),
      ),
  );
  const [lineNote,setLineNote]=useState("");
  function open(item: MenuItem) {
    setLineNote("");
    setChosen(item);
    setQuantity(1);
    setFailed(false);
  }
  return (
    <section id="guest-menu" className="guest-menu-section guest-zone" data-guest-zone="menu" aria-labelledby="guest-menu-heading">
      <GuestSectionHeading id="guest-menu-heading" icon="menu" title="Thực đơn của quán"
        description="Chọn đồ uống, xem chi tiết và thêm vào giỏ hàng."
        meta={<span className="menu-result-count" role="status" aria-live="polite">
          {visible.length} đồ uống
        </span>} />
      <label className="menu-search">
        Tìm đồ uống
        <span className="search-field">
          <Icon name="search" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Hôm nay bạn muốn uống gì?"
            autoComplete="off"
          />
        </span>
      </label>
      <div className="category-tabs" role="group" aria-label="Nhóm đồ uống">
        <button
          className={category === "all" ? "chip selected" : "chip"}
          aria-pressed={category === "all"}
          onClick={() => setCategory("all")}
        >
          Tất cả
        </button>
        {categories.map((group) => (
          <button
            key={group}
            className={category === group ? "chip selected" : "chip"}
            aria-pressed={category === group}
            aria-label={`Nhóm ${group === "Đồ uống khác" ? "Trà và đồ uống khác" : group}`}
            onClick={() => setCategory(group)}
          >
            {group === "Đồ uống khác" ? "Trà và đồ uống khác" : group}
          </button>
        ))}
      </div>
      {!visible.length && (
        <div className="empty">
          <h3>Không tìm thấy đồ uống phù hợp.</h3>
          <p>Thử tên khác hoặc xem tất cả đồ uống.</p>
          <button
            className="secondary"
            onClick={() => {
              setQuery("");
              setCategory("all");
            }}
          >
            Xóa bộ lọc
          </button>
        </div>
      )}
      <section className="menu-grid">
        {visible.map((item) => (
          <article
            className={`menu-card ${item.available === false ? "sold-out" : ""}`}
            key={item.id}
          >
            <button
              className="menu-art"
              aria-label={`Xem ${item.name}`}
              onClick={() => open(item)}
            >
              <MenuPhoto item={item} />
              {item.available === false && (
                <span className="sold-out-label">Tạm hết</span>
              )}
            </button>
            <div className="menu-card-content">
              <small>{item.category}</small>
              <h3>{item.name}</h3>
              {item.description && (
                <p className="product-description">{item.description}</p>
              )}
              <div className="product-purchase">
                <strong>{money(item.priceVnd)}</strong>
                {item.available !== false && menuControl?.(item)}
              </div>
              {item.available === false && (
                <p className="unavailable">Tạm hết món</p>
              )}
              <button
                className="text-button menu-detail"
                aria-label={`Chi tiết ${item.name}`}
                onClick={() => open(item)}
              >
                Chọn số lượng <Icon name="arrow" />
              </button>
            </div>
          </article>
        ))}
      </section>
      {chosen && (
        <Dialog
          label={chosen.name}
          onClose={() => {
            if (!sending) setChosen(null);
          }}
        >
          <div className="section-heading">
            <span className="eyebrow">ĐỒ UỐNG CỦA BẠN</span>
            <button
              className="icon-button"
              aria-label="Đóng chi tiết món"
              disabled={sending}
              onClick={() => setChosen(null)}
            >
              ×
            </button>
          </div>
          <div className="drink-preview" aria-hidden="true">
            <MenuPhoto item={chosen} />
          </div>
          <h2>{chosen.name}</h2>
          {chosen.description && <p>{chosen.description}</p>}
          <p className="muted">
            {chosen.category} · {money(chosen.priceVnd)} / phần
          </p>
          <div className="quantity-control">
            <button
              aria-label="Giảm số lượng"
              disabled={sending || quantity <= 1}
              onClick={() => setQuantity((q) => q - 1)}
            >
              −
            </button>
            <output aria-label="Số lượng chọn">{quantity}</output>
            <button
              aria-label="Tăng số lượng"
              disabled={sending || quantity >= 20}
              onClick={() => setQuantity((q) => q + 1)}
            >
              +
            </button>
          </div>
          <label>Ghi chú riêng cho phần này<textarea maxLength={160} value={lineNote} onChange={e=>setLineNote(e.target.value)} placeholder="Ví dụ: ít đá, không đường"/></label>
          <div className="button-row">{["Ít đá","Không đường","Dùng nóng"].map(note=><button key={note} className="chip" onClick={()=>setLineNote(previous=>(previous?previous+", ":"")+note)} disabled={sending}>{note}</button>)}</div>
          <p className="muted">Yêu cầu cách dùng, không tự thêm phụ thu. Nếu quán không đáp ứng được, nhân viên sẽ trao đổi với bạn.</p>
          <p className="menu-subtotal">
            Tạm tính <strong>{money(chosen.priceVnd * quantity)}</strong>
          </p>
          {failed && (
            <p className="error" role="alert">
              {error ||
                "Chưa thêm được món. Hãy kiểm tra giỏ hoặc kết nối rồi thử lại."}
            </p>
          )}
          <button
            className="primary full"
            disabled={
              disabled ||
              sending ||
              !onChoose ||
              menu.find((i) => i.id === chosen.id)?.available === false
            }
            onClick={async () => {
              if (sending || !onChoose) return;
              setSending(true);
              setFailed(false);
              try {
                if (await onChoose(chosen, quantity,lineNote.trim())) setChosen(null);
                else setFailed(true);
              } finally {
                setSending(false);
              }
            }}
          >
            {sending ? "Đang thêm…" : "Thêm vào giỏ"}
          </button>
        </Dialog>
      )}
    </section>
  );
}
