import { useEffect, useId, useRef, useState } from "react";
import type { GuestScope } from "./models";
import { journal, withJournalLock } from "./journal";

export function CartNote({
  scope,
  note,
  disabled,
  onSaved,
  onBlocked,
  onError,
}: {
  scope: GuestScope;
  note: string;
  disabled: boolean;
  onSaved: () => Promise<unknown>;
  onBlocked: (blocked: boolean) => void;
  onError: (message: string) => void;
}) {
  const noteId = useId();
  const [value, setValue] = useState(note),
    [status, setStatus] = useState("Ghi chú đã lưu"),
    [failed, setFailed] = useState(false);
  const sequence = useRef(Promise.resolve()),
    generation = useRef(0),
    editing = useRef(false),
    live = useRef(true);
  const callbacks = useRef({ onSaved, onBlocked, onError });
  callbacks.current = { onSaved, onBlocked, onError };
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (!editing.current) setValue(note);
  }, [note]);
  function save(next: string) {
    const current = ++generation.current;
    editing.current = true;
    setValue(next);
    setFailed(false);
    setStatus("Đang lưu ghi chú…");
    callbacks.current.onBlocked(true);
    sequence.current = sequence.current
      .catch(() => {})
      .then(async () => {
        await withJournalLock(() => journal.setNote(scope, next), true);
        await callbacks.current.onSaved();
        if (live.current && current === generation.current) {
          editing.current = false;
          setStatus("Ghi chú đã lưu");
          callbacks.current.onBlocked(false);
        }
      })
      .catch((error) => {
        if (live.current && current === generation.current) {
          setFailed(true);
          setStatus(
            "Chưa lưu được ghi chú. Hãy thử lưu lại trước khi gửi đơn.",
          );
          callbacks.current.onError(error.message);
        }
      });
  }
  return (
    <div className="cart-note">
      <label htmlFor={noteId}>Ghi chú cho đơn</label>
      <textarea
        id={noteId}
        maxLength={500}
        value={value}
        disabled={disabled}
        onChange={(event) => save(event.target.value)}
        placeholder="Ví dụ: ít đá, không đường"
        rows={2}
      />
      <small role="status">{status}</small>
      {failed && (
        <button
          className="secondary"
          disabled={disabled}
          onClick={() => save(value)}
        >
          Thử lưu ghi chú
        </button>
      )}
    </div>
  );
}
