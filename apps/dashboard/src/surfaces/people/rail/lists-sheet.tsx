/**
 * On a phone the rail is not drawn, so its lists come up behind one tap on the standing line, as a sheet: the same
 * rows, the same counts and the same New list, and a pick closes it (moved whole from legacy/pages/people.jsx, decision
 * 0015). It goes the way it came as it closes, and a thumb pulls it down (leaving, touchSwipe).
 */
import { useEffect } from "react";
import type { ReactNode } from "react";
import { leaving, touchSwipe } from "../../legacy-verbs";
import { plPhoneNow } from "../words";

export function PeopleListsSheet({
  onClose,
  title = "Lists",
  children,
}: {
  onClose: () => void;
  title?: string;
  children?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="sb-sheet-backdrop" role="presentation" onClick={onClose} />
      {/* It goes the way it came as it closes, and a thumb pulls it down (data-bits leaving, touchSwipe). */}
      <div
        className="sb-sheet pl-sheet"
        role="dialog"
        aria-label={title}
        data-testid="people-lists-sheet"
        ref={leaving("people-lists")}
        {...touchSwipe({ onDown: onClose, when: plPhoneNow })}
      >
        <div className="sb-sheet-head">
          <span className="sb-sheet-title">{title}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} data-testid="people-lists-close">
            Done
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
