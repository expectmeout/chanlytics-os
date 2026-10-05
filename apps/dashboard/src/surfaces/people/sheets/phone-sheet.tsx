/**
 * A sheet from the bottom of a phone for People's own small jobs -- Add a person, the open list's rename, delete and
 * "Save these", and what a selection can become: a handle, a title, one way out, and the job (moved whole from
 * legacy/pages/people.jsx, decision 0015). A step inside a sheet (`onBack`) has a way back to the list it came from. The
 * page's own dialog: `pl-sheet` keeps it out of PL_OVERLAY, and the page's one keyboard listener closes it on Esc.
 * Hookless: the page holds what is in it.
 */
import type { ReactNode } from "react";
import { dialogRef, touchSwipe } from "../../legacy-verbs";
import type { GateProps } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import { plPhoneNow } from "../words";

export function PhoneSheet({
  title,
  onClose,
  closeLabel = "Cancel",
  onBack = null,
  testid,
  children,
}: {
  title: string;
  onClose: () => void;
  closeLabel?: string | null;
  onBack?: (() => void) | null;
  testid: string;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="sb-sheet-backdrop" role="presentation" onClick={onClose} />
      {/* Its handle says it can be pulled: a thumb pulls it down, and it goes the way it came (data-bits touchSwipe, leaving); focus is held in it while it is open (dialogRef). */}
      <div
        className="sb-sheet pl-sheet pp-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testid}
        ref={dialogRef("people-sheet")}
        {...touchSwipe({ onDown: onClose, when: plPhoneNow })}
      >
        <div className="pp-sheet-handle" aria-hidden="true" />
        <div className="pp-sheet-head">
          {onBack && (
            <button
              type="button"
              className="pp-sheet-back"
              onClick={onBack}
              aria-label="Back"
              data-testid={`${testid}-back`}
            >
              <Icon name="chevron" size={18} />
            </button>
          )}
          <h2 className="pp-sheet-title">{title}</h2>
          {closeLabel && (
            <button type="button" className="pp-sheet-close" onClick={onClose} data-testid={`${testid}-close`}>
              {closeLabel}
            </button>
          )}
        </div>
        <div className="pp-sheet-body">{children}</div>
      </div>
    </>
  );
}

/**
 * One row of a phone sheet's list: its glyph, its words, what it holds (a file's kind), and a chevron when it opens a
 * step of its own. `gate` is window.gate's answer for a row the member's role refuses: focusable, described, inert.
 */
export function PhoneSheetRow({
  icon = null,
  label,
  meta = null,
  next = false,
  danger = false,
  disabled = false,
  onClick,
  testid,
  gate = null,
}: {
  icon?: string | null;
  label: ReactNode;
  meta?: ReactNode;
  next?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  testid: string;
  gate?: GateProps | null;
}) {
  return (
    <button
      type="button"
      className={`pp-sheet-row${danger ? " danger" : ""}`}
      disabled={disabled}
      onClick={onClick}
      data-testid={testid}
      {...(gate || {})}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      <span className="pp-sheet-row-words">{label}</span>
      {meta ? <span className="pp-sheet-row-meta">{meta}</span> : null}
      {next ? <Icon name="chevron" size={14} className="pp-sheet-row-next" /> : null}
    </button>
  );
}
