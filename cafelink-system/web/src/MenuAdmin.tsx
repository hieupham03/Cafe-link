import { useEffect, useId, useRef, useState } from "react";
import { api } from "./api";
import type { MenuItem, SessionInfo } from "./models";
import { money } from "./models";
import { Dialog } from "./Dialog";
import { staffJournal } from "./staffJournal";
import { searchText } from "./ui";
import { DrinkArt } from "./DrinkArt";
export function MenuPhoto({ item }: { item: MenuItem }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.imageUrl]);
  return item.imageUrl && !failed ? (
    <img
      className="menu-photo"
      src={item.imageUrl.replace(/\.jpg$/, "-thumb.jpg")}
      alt={item.name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="menu-placeholder" aria-label="Ảnh minh họa đồ uống">
      <DrinkArt name={item.name} />
    </span>
  );
}
interface Category {
  name: string;
  version: number;
  sortOrder: number;
}
const blank: MenuItem = {
  id: 0,
  name: "",
  priceVnd: 30000,
  category: "Cà phê",
  description: "",
  imageUrl: "",
  available: true,
  active: true,
  sortOrder: 0,
};
export function MenuAdmin({
  session,
  menu,
  disabled,
  onChanged,
}: {
  session: SessionInfo;
  menu: MenuItem[];
  disabled: boolean;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<MenuItem | null>(null),
    [categories, setCategories] = useState<Category[]>([]),
    [category, setCategory] = useState(""),
    [categoryEdit, setCategoryEdit] = useState<Category | null>(null),
    [categorySort, setCategorySort] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all"),
    [statusFilter, setStatusFilter] = useState("all"),
    [archiveConfirm, setArchiveConfirm] = useState(false);
  const gate = useRef(false);
  const groupFilterId = useId(),
    statusFilterId = useId(),
    categoryId = useId();
  const command = <T,>(action: string, data: unknown) =>
    api.command<T>(session.csrfToken, action, data);
  const groups = () =>
    command<{ categories: Category[] }>("GET_MENU_CATEGORIES", {}).then((r) =>
      setCategories(r.categories),
    );
  useEffect(() => {
    void groups().catch((e) => setError(e.message));
  }, [session.csrfToken]);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function save() {
    if (!draft || gate.current) return;
    if (
      draft.id &&
      draft.active === false &&
      menu.find((i) => i.id === draft.id)?.active !== false &&
      !archiveConfirm
    ) {
      setArchiveConfirm(true);
      return;
    }
    gate.current = true;
    setBusy(true);
    setError("");
    try {
      let imageUrl = draft.imageUrl ?? "";
      if (file) {
        if (file.size > 2 * 1024 * 1024) throw Error("Ảnh tối đa 2 MiB.");
        const response = await fetch("/api/menu/image", {
          method: "POST",
          headers: {
            "Content-Type": file.type,
            "X-CSRF-Token": session.csrfToken,
          },
          body: file,
          signal: AbortSignal.timeout(10000),
        });
        const body = await response.json();
        if (!response.ok) throw Error(body.message);
        imageUrl = body.imageUrl;
      }
      await staffJournal.execute(
        session,
        draft.id ? "UPDATE_MENU_ITEM" : "CREATE_MENU_ITEM",
        {
          ...draft,
          imageUrl,
          ...(draft.id
            ? { menuId: draft.id, expectedVersion: draft.version }
            : {}),
        },
      );
      setDraft(null);
      setArchiveConfirm(false);
      setFile(null);
      setNotice("Đã lưu món. Khách nhận thực đơn mới.");
      await groups();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      gate.current = false;
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="section-heading">
        <h2>Quản lý thực đơn</h2>
        <button
          className="primary"
          disabled={disabled}
          onClick={() => {
            setDraft({ ...blank });
            setArchiveConfirm(false);
            setFile(null);
            setError("");
          }}
        >
          Thêm món
        </button>
      </div>
      {notice && (
        <p className="order-receipt" role="status">
          {notice}
        </p>
      )}
      {error && !draft && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <details className="category-editor">
        <summary>Quản lý nhóm món</summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await command("SAVE_MENU_CATEGORY", {
                name: category,
                originalName: categoryEdit?.name ?? "",
                expectedVersion: categoryEdit?.version,
                sortOrder: categorySort,
              });
              setCategory("");
              setCategoryEdit(null);
              await groups();
              onChanged();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Tên nhóm
            <input
              required
              maxLength={80}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          <label>
            Thứ tự nhóm
            <input
              type="number"
              min="0"
              max="10000"
              value={categorySort}
              onChange={(e) => setCategorySort(Number(e.target.value))}
            />
          </label>
          <button disabled={disabled || busy}>
            {categoryEdit ? "Lưu nhóm" : "Thêm nhóm"}
          </button>
          {categoryEdit && (
            <button
              type="button"
              onClick={() => {
                setCategoryEdit(null);
                setCategory("");
              }}
            >
              Hủy sửa nhóm
            </button>
          )}
        </form>
        {categories.map((c) => (
          <div className="category-row" key={c.name}>
            <span>{c.name}</span>
            <button
              onClick={() => {
                setCategoryEdit(c);
                setCategory(c.name);
                setCategorySort(c.sortOrder);
              }}
            >
              Sửa nhóm {c.name}
            </button>
            <button
              disabled={
                disabled || busy || menu.some((i) => i.category === c.name)
              }
              onClick={async () => {
                try {
                  await command("DELETE_MENU_CATEGORY", {
                    name: c.name,
                    expectedVersion: c.version,
                  });
                  await groups();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Xóa nhóm {c.name}
            </button>
          </div>
        ))}
        <small>Nhóm đang chứa món phải chuyển hết món trước khi xóa.</small>
      </details>
      <label>
        Tìm món quản lý
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="filter-toolbar">
        <div>
          <label htmlFor={groupFilterId}>Nhóm món quản lý</label>
          <select
            id={groupFilterId}
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
          >
            <option value="all">Tất cả nhóm</option>
            {categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={statusFilterId}>Trạng thái món quản lý</label>
          <select
            id={statusFilterId}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang bán</option>
            <option value="soldout">Tạm hết</option>
            <option value="archived">Ngừng bán</option>
          </select>
        </div>
      </div>
      <div className="menu-grid">
        {menu
          .filter(
            (i) =>
              searchText(i.name).includes(searchText(query)) &&
              (groupFilter === "all" || i.category === groupFilter) &&
              (statusFilter === "all" ||
                (statusFilter === "archived"
                  ? i.active === false
                  : statusFilter === "soldout"
                    ? i.active !== false && i.available === false
                    : i.active !== false && i.available !== false)),
          )
          .map((item) => (
            <article className="menu-card" key={item.id}>
              <div className="menu-art">
                <MenuPhoto item={item} />
              </div>
              <div>
                <small>{item.category}</small>
                <h3>{item.name}</h3>
                <strong>{money(item.priceVnd)}</strong>
                <p>
                  {!item.active
                    ? "Ngừng bán"
                    : !item.available
                      ? "Tạm hết"
                      : "Đang bán"}
                </p>
                <button
                  className="secondary"
                  disabled={disabled}
                  onClick={() => {
                    setDraft({ ...item });
                    setArchiveConfirm(false);
                    setFile(null);
                    setError("");
                  }}
                >
                  Sửa {item.name}
                </button>
                {item.active && (
                  <button
                    className="text-button"
                    disabled={disabled || busy}
                    onClick={async () => {
                      if (gate.current) return;
                      gate.current = true;
                      setBusy(true);
                      setError("");
                      try {
                        await staffJournal.execute(
                          session,
                          "UPDATE_MENU_ITEM",
                          {
                            ...item,
                            menuId: item.id,
                            expectedVersion: item.version,
                            available: !item.available,
                          },
                        );
                        onChanged();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        gate.current = false;
                        setBusy(false);
                      }
                    }}
                  >
                    {item.available
                      ? `Tạm hết ${item.name}`
                      : `Bán lại ${item.name}`}
                  </button>
                )}
              </div>
            </article>
          ))}
      </div>
      {draft && (
        <Dialog
          label={draft.id ? "Sửa món" : "Thêm món"}
          onClose={() => {
            if (!busy) {
              setDraft(null);
              setFile(null);
            }
          }}
        >
          <div className="section-heading">
            <h2>{draft.id ? "Sửa món" : "Thêm món"}</h2>
            <button
              disabled={busy}
              aria-label="Đóng sửa món"
              onClick={() => {
                setDraft(null);
                setFile(null);
              }}
            >
              ×
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label>
              Tên món
              <input
                required
                maxLength={100}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              Giá món (VND)
              <input
                type="number"
                min="1000"
                max="10000000"
                step="1000"
                required
                value={draft.priceVnd}
                onChange={(e) =>
                  setDraft({ ...draft, priceVnd: Number(e.target.value) })
                }
              />
            </label>
            <div>
              <label htmlFor={categoryId}>Nhóm món</label>
              <select
                id={categoryId}
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              >
                {[
                  ...new Set([
                    ...categories.map((c) => c.name),
                    draft.category,
                  ]),
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <label>
              Mô tả món
              <textarea
                maxLength={1000}
                value={draft.description ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            <label>
              Thứ tự hiển thị
              <input
                type="number"
                min="0"
                max="10000"
                value={draft.sortOrder ?? 0}
                onChange={(e) =>
                  setDraft({ ...draft, sortOrder: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Ảnh món (JPEG/PNG, tối đa 2 MiB)
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {(preview || draft.imageUrl) && (
              <img
                className="image-preview"
                src={preview || draft.imageUrl}
                alt="Xem trước ảnh món"
              />
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setFile(null);
                setDraft({ ...draft, imageUrl: "" });
              }}
            >
              Bỏ ảnh món
            </button>
            <label>
              <input
                type="checkbox"
                checked={draft.available ?? true}
                onChange={(e) =>
                  setDraft({ ...draft, available: e.target.checked })
                }
              />{" "}
              Còn món
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.active ?? true}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.checked })
                }
              />{" "}
              Hiển thị để bán
            </label>
            <p className="muted">
              Ngừng bán giữ lịch sử đơn cũ. Giá mới không thay giá đơn đã nhận.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {archiveConfirm && (
              <div
                className="confirm-box"
                role="alertdialog"
                aria-label="Xác nhận ngừng bán"
              >
                <p>
                  Ngừng bán {draft.name}? Khách không thể đặt mới; đơn và hóa
                  đơn cũ vẫn giữ.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setArchiveConfirm(false);
                    setDraft({ ...draft, active: true });
                  }}
                >
                  Tiếp tục bán
                </button>
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => void save()}
                >
                  Xác nhận ngừng bán
                </button>
              </div>
            )}
            <button className="primary full" disabled={disabled || busy}>
              {busy ? "Đang tải ảnh và lưu…" : "Lưu món"}
            </button>
          </form>
        </Dialog>
      )}
    </section>
  );
}
