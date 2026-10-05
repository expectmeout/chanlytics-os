/**
 * What People's small jobs on a phone hold in the kit's Sheet (kit/sheet/sheet.tsx, `shape="job"`; PhoneSheet drew
 * them until 5 Oct 2026, moved whole from legacy/pages/people.jsx, decision 0015): Add a person, the open list's
 * rename, delete and "Save these", and what a selection can become. The word that closes one, a step's way back to
 * the list it came from, and a row of a sheet's list.
 */
import type { ReactNode } from "react";
import type { GateProps } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import type { SheetBack } from "../../kit/sheet/sheet";

/** A job's word to close it. */
export const JOB_CANCEL = { word: "Cancel" };

/** A step's way back to the list it came from: the chevron, which kit.css turns to point back. */
export const jobBack = (onBack: () => void): SheetBack => ({
  label: "Back",
  glyph: <Icon name="chevron" size={18} />,
  onBack,
});

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
