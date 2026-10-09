/**
 * Confirm: the one way an act is confirmed (moved whole from data-bits.jsx, decision 0015: the kit's one implementation,
 * which seed-globals publishes as window.Confirm for the pages that still read it).
 *
 * Armed inline, where the control that armed it was: the question names the thing, the detail says what happens, the
 * Yes names the verb and is a real button (red when the act destroys or cannot be undone), the No is quiet. Both are
 * buttons of one height: side by side at the question's end on a desk, and each half the width under its words on a
 * phone, in a panel and in a sheet's foot (kit.css), where a thumb reaches either.
 * Five idioms did this before -- a hand-rolled Yes/No sentence in four wordings, a button that changed its own label
 * on the first click, a typed name, commit-then-Undo, and nothing at all on the most destructive act on Settings (the
 * audit's D13). One shape now; pure, so any harness can draw it.
 *
 *   <Confirm question="Disconnect Google?" detail="The public listing stays; replies and the history do not."
 *            yes="Yes, disconnect" danger busy={busy} onYes={...} onNo={...} testid="google-disconnect" />
 *
 * `typed` with `value`/`onType` gates the Yes on a typed match -- for erasure only; `ready` overrides the match when
 * the page knows better (a phone number for a name). `block` draws a panel under the row instead of a line beside it.
 * `discard` is the question about what was typed and not saved (Cancel's, a sheet's Close): nothing kept is touched,
 * so its Yes is red words on no ground, never the red fill, and its No ("Keep editing") is the plain button beside it:
 * the answer that keeps the work is the one with a ground. One filled colour at most stands in a question: the red,
 * and only where something kept is destroyed.
 * The Yes takes focus as the question appears; Escape is No.
 * Testids from `testid`: `${testid}-confirm` on the group, -yes, -no, -typed.
 */
import type { KeyboardEvent, ReactNode } from "react";
import { editorBox, focusAsDrawn } from "../../legacy-verbs";

interface ConfirmProps {
  question: ReactNode;
  detail?: ReactNode;
  yes?: ReactNode;
  no?: ReactNode;
  onYes: () => void;
  onNo?: () => void;
  busy?: boolean;
  busyLabel?: ReactNode;
  danger?: boolean;
  /** The question is about what was typed here and not saved: red words, no red fill, and the No is the plain button. */
  discard?: boolean;
  /** What must be typed for the Yes to work (an erasure's name); null for a Yes that needs no typing. */
  typed?: string | null;
  value?: string;
  onType?: ((value: string) => void) | null;
  /** The page's own answer to "may it go", over the typed match. */
  ready?: boolean | null;
  error?: ReactNode;
  block?: boolean;
  className?: string;
  testid?: string | null;
}

/**
 * The question's mark and its two answers' classes. A discard is never the red fill, whatever else it was handed, and
 * its No is the plain button; any other question's No is quiet.
 */
const toneOf = (discard: boolean, danger: boolean) =>
  discard
    ? { mark: " confirm-discard", yes: " btn-ghost danger", no: "" }
    : { mark: danger ? " confirm-danger" : "", yes: danger ? " btn-danger" : "", no: " btn-ghost" };

export function Confirm({
  question,
  detail = null,
  yes = "Yes",
  no = "No",
  onYes,
  onNo,
  busy = false,
  busyLabel = "Working…",
  danger = false,
  discard = false,
  typed = null,
  value = "",
  onType = null,
  ready = null,
  error = null,
  block = false,
  className = "",
  testid = null,
}: ConfirmProps) {
  const ok = ready != null ? !!ready : typed == null || String(value).trim() === String(typed);
  const id = (part: string) => (testid ? `${testid}-${part}` : undefined);
  const tone = toneOf(discard, danger);
  const onKey = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Escape" && !busy && onNo) {
      e.stopPropagation();
      onNo();
    }
  };
  return (
    // eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions -- kept as the JSX drew it: Escape anywhere in the armed question is No
    <span
      className={`confirm${block ? " confirm-block" : ""}${tone.mark}${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={typeof question === "string" ? question : undefined}
      data-testid={id("confirm")}
      onKeyDown={onKey}
      // A question that asks for a typed name opens on itself on a touch screen: the name's field waits for a tap.
      {...(typed != null ? editorBox : null)}
    >
      <span className="confirm-words">
        <span className="confirm-q">{question}</span>
        {detail && <span className="confirm-detail">{detail}</span>}
      </span>
      {typed != null && (
        <input
          className="confirm-typed"
          value={value}
          onChange={(e) => onType && onType(e.target.value)}
          placeholder={String(typed)}
          aria-label={`Type ${typed} to confirm`}
          // eslint-disable-next-line jsx-a11y-x/no-autofocus -- kept as the JSX drew it: the typed name takes focus as the question appears, under a mouse
          autoFocus={focusAsDrawn()}
          disabled={busy}
          data-testid={id("typed")}
        />
      )}
      {error && (
        <span className="confirm-error" role="alert">
          {error}
        </span>
      )}
      <span className="confirm-acts">
        <button
          type="button"
          className={`btn btn-sm${tone.yes}`}
          disabled={busy || !ok}
          onClick={onYes}
          autoFocus={typed == null}
          data-testid={id("yes")}
        >
          {busy ? busyLabel : yes}
        </button>
        <button type="button" className={`btn btn-sm${tone.no}`} disabled={busy} onClick={onNo} data-testid={id("no")}>
          {no}
        </button>
      </span>
    </span>
  );
}
