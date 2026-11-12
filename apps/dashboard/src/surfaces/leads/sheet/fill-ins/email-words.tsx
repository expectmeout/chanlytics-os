/**
 * The email's words on the lead's card as they are read (decision 0096), and what decision 0127 adds to them. As they'll
 * read it: a tap on the words, never a drag, begins the typing where it fell; a blank's value is a press of its own
 * (fill-in.tsx), and so is the receptionist's mark. With the blanks shown: the step's own words, each blank by its name,
 * and a tap types nothing. The switch between the two is over them.
 *
 * A press on a fill-in, or inside the bubble it opened, is never a tap to type: React hands a press up from the bubble's
 * portal to the words under it, though it is nowhere in them.
 */
import type { MouseEvent, PointerEvent } from "react";
import { LEAD_CARD_WORDS, type LeadEmailPiece } from "@chanlytics/contracts";
import { GRAB_AT } from "../../../kit/motion/swipe";
import { Segmented } from "../../../kit/segmented/segmented";
import type { SheetMail } from "../facts";
import { LEAD_FILL_WORDS, type EmailBlanks } from "../model/fill-ins";
import { LEAD_SHEET_WORDS } from "../model/view";
import { FillIn, ReceptionistMark } from "./fill-in";

/** Which of the email's boxes a press was on. */
export type BoxPart = "subject" | "body";

/** Begins the typing in one of the email's boxes: the caret where the press fell, or at the words' end. */
type BeginTyping = (part: BoxPart, at: number | null) => void;

/** Where in its piece a point falls, by whichever of the two the browser has. */
function caretAtPoint(left: number, top: number): { node: Node; offset: number } | null {
  const doc: {
    caretPositionFromPoint?: (left: number, top: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (left: number, top: number) => Range | null;
  } = document;
  const at = doc.caretPositionFromPoint?.(left, top);
  if (at) return { node: at.offsetNode, offset: at.offset };
  const range = doc.caretRangeFromPoint?.(left, top);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

/** Where a press on the read email falls in the box's words: its piece's place (`data-at`) and how far into it. */
function offsetAtPress(event: MouseEvent<HTMLElement>): number | null {
  const caret = caretAtPoint(event.clientX, event.clientY);
  if (!caret || !event.currentTarget.contains(caret.node)) return null;
  const within = caret.node instanceof Element ? caret.node : caret.node.parentElement;
  const piece = within?.closest<HTMLElement>("[data-at]");
  if (!piece) return null;
  const walk = document.createTreeWalker(piece, NodeFilter.SHOW_TEXT);
  let into = 0;
  while (walk.nextNode()) {
    if (walk.currentNode === caret.node) return Number(piece.dataset.at) + into + caret.offset;
    into += walk.currentNode.textContent?.length ?? 0;
  }
  return Number(piece.dataset.at) + caret.offset;
}

/** What was pressed, where it is an element of the page. */
const pressedElementOf = (target: EventTarget | null): Element | null =>
  typeof Element !== "undefined" && target instanceof Element ? target : null;

/** A tap on the read email begins the typing: a tap, never the drag that walks the leads, nor words being selected. */
const pressedAt = new WeakMap<HTMLElement, { left: number; top: number }>();
function tapToType(begin: BeginTyping, part: BoxPart) {
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) =>
      pressedAt.set(event.currentTarget, { left: event.clientX, top: event.clientY }),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => pressedAt.delete(event.currentTarget),
    onClick: (event: MouseEvent<HTMLElement>) => {
      // A fill-in's press, and one inside the bubble it opened, are their own: neither is in the words to be typed.
      const pressed = pressedElementOf(event.target);
      if (pressed && (!event.currentTarget.contains(pressed) || pressed.closest("[data-fill]"))) return;
      const from = pressedAt.get(event.currentTarget);
      pressedAt.delete(event.currentTarget);
      if (!from || Math.hypot(event.clientX - from.left, event.clientY - from.top) >= GRAB_AT) return;
      if (window.getSelection?.()?.toString()) return;
      begin(part, part === "body" ? offsetAtPress(event) : null);
    },
  };
}

/**
 * One piece of the email as it reads: its words; the line written for them, that it is being written, or what is still
 * to come; a blank's value as a press of its own; the receptionist's link as its mark; or a blank by its name.
 */
function PieceOf({
  piece,
  mail,
  onFill,
}: {
  piece: LeadEmailPiece;
  mail: SheetMail;
  onFill: ((at: number) => void) | null;
}) {
  if (piece.kind === "words") return <span data-at={piece.at}>{piece.text}</span>;
  if (piece.kind === "blank")
    return (
      <span className="lw-blank" data-testid="lead-card-blank">
        {piece.text}
      </span>
    );
  if (piece.kind === "value")
    return <FillIn piece={piece} lead={mail.edit ? mail.edit.lead : null} onChange={onFill} />;
  if (piece.kind === "mark" && piece.slot === "their preview")
    return <ReceptionistMark leadId={mail.leadId} at={piece.at} />;
  const line = piece.kind === "line" || piece.slot === "opening";
  if (line && mail.writing)
    return (
      <span className="lw-open" data-at={piece.at} data-testid="lead-card-opening">
        {LEAD_SHEET_WORDS.mail.writing}
      </span>
    );
  if (piece.kind === "mark")
    return (
      <span
        className={line ? "lw-open" : "lw-hole"}
        data-at={piece.at}
        data-testid={line ? "lead-card-opening" : "lead-card-gap"}
      >
        {line ? LEAD_CARD_WORDS.opening : piece.text}
      </span>
    );
  const marked = mail.opening;
  return (
    <span className="lw-opening" data-at={piece.at} data-testid="lead-card-opening">
      {marked ? marked.before : piece.text}
      {marked && marked.said ? (
        <mark className="lw-refused" data-testid="lead-card-refused">
          {marked.said}
        </mark>
      ) : null}
      {marked ? marked.after : null}
    </span>
  );
}

/** The switch over the email: as they'll read it, or the step's words with each blank named. */
export function ViewSwitch({ blanks, onBlanks }: { blanks: boolean; onBlanks: (on: boolean) => void }) {
  const words = LEAD_FILL_WORDS.view;
  return (
    <Segmented
      className="lw-now-view"
      label={words.label}
      value={blanks ? "blanks" : "read"}
      onValueChange={(view: "read" | "blanks") => onBlanks(view === "blanks")}
      options={[
        { value: "read", label: words.read, testid: "lead-card-view-read" },
        { value: "blanks", label: words.blanks, testid: "lead-card-view-blanks" },
      ]}
    />
  );
}

/**
 * The subject and the words. As they'll read it: a tap away from being typed in (`begin`; null for a member who may not,
 * or an email that takes none), each blank's value a press of its own. With the blanks shown (`named`): the step's own
 * words, each blank by its name, and a tap types nothing.
 */
export function EmailWords({
  mail,
  begin,
  clip,
  named,
}: {
  mail: SheetMail;
  begin: BeginTyping | null;
  clip: string;
  named: EmailBlanks | null;
}) {
  const beginHere = named === null ? begin : null;
  const onFill = beginHere ? (at: number) => beginHere("body", at) : null;
  return (
    <>
      {mail.subject ? (
        <p
          className={beginHere ? "lw-now-subj is-typable" : "lw-now-subj"}
          data-testid="lead-card-subject"
          {...(beginHere ? tapToType(beginHere, "subject") : {})}
        >
          {named && named.subject
            ? named.subject.map((piece) => <PieceOf key={piece.at} piece={piece} mail={mail} onFill={null} />)
            : mail.subject}
        </p>
      ) : null}
      <div
        className={`lw-now-body${clip}${beginHere ? " is-typable" : ""}`}
        data-testid="lead-card-body"
        {...(beginHere ? tapToType(beginHere, "body") : {})}
      >
        {(named ? named.body : mail.pieces).map((piece) => (
          <PieceOf key={piece.at} piece={piece} mail={mail} onFill={onFill} />
        ))}
      </div>
      {named && !(mail.edit && mail.edit.own) ? (
        <p className="lw-note" data-testid="lead-card-view-note">
          {LEAD_FILL_WORDS.view.note}
        </p>
      ) : null}
    </>
  );
}
