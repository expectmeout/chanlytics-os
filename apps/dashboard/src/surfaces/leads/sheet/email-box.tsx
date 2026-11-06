/**
 * The email on the lead sheet, and the box it becomes (decision 0096; Ruben, 4 Nov 2026: "click to begin editing this
 * specific email within the sequence"). As Today's draft is typed where it stands (need-you/parts.tsx Words), the same
 * words at the same size in the same place; here it is read until it is pressed, since a text box refuses the sheet's own
 * gestures (kit/motion/swipe.ts swipeOwnDrag), and the email is most of the card. A press draws the box in its own task
 * (drawnNow), so one tap raises the keys and the caret lands where it fell.
 *
 * Nothing is sent from here, so nothing waits for a Send: the words are saved as they are left (Done, a press elsewhere,
 * the sheet closed, the next lead), never as they are typed, since a half sentence could be claimed by the clock. Until the
 * door has them they are kept in the tab (useUnsavedWork). Saving moves nothing else: a held email stays held and a
 * waiting one still waits. What is refused is said under the box, over what was typed.
 *
 * The words are this lead's alone (the door, 00545). Every word is contracts'.
 */
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  LEAD_CARD_WORDS,
  LEAD_SHEET_WORDS as W,
  LEAD_WORDS_BOX as B,
  REWRITE_WORDS,
  leadWordsFromBox,
  leadWordsInBox,
  leadWordsProblem,
  type LeadEmailPiece,
  type LeadEmailText,
  type LeadStepWordsDto,
} from "@chanlytics/contracts";
import { commitVerb, undoVerb } from "@/bridge/verbs/commit";
import { undoRewrite, type RewriteUndo } from "../../campaigns/reach-out/rewrite-ask";
import { pressed, sequenceVerbs } from "../../campaigns/sequences/verbs";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Field, fieldProblem } from "../../kit/field/field";
import { useGrowAsTyped } from "../../kit/field/grow-as-typed";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Menu } from "../../kit/menu/menu";
import { GRAB_AT } from "../../kit/motion/swipe";
import { tabDraft, useUnsavedWork } from "../../kit/record/work";
import { canDo, drawnNow, gate, refusalToast } from "../../frame-verbs";
import type { Flash } from "../peek/types";
import type { SheetFacts, SheetMail, SheetMailEdit } from "./facts";
import { openRecordFor, type SheetRun } from "./run";
import type { useSheetUi } from "./sheet-ui";

/** Which of the email's boxes a press was on. */
type BoxPart = "subject" | "body";

/** The email as it is being typed, and what the box opened with. */
interface Typing {
  edit: SheetMailEdit;
  subject: string | null;
  body: string;
  start: LeadEmailText;
}

const WORK_KIND = "lead_email";
const workKey = (e: SheetMailEdit) => `${e.stepId}:${e.leadId}`;

const same = (a: LeadEmailText, b: LeadEmailText) =>
  (a.subject ?? "") === (b.subject ?? "") && a.body.trimEnd() === b.body.trimEnd();

const inBoxOf = (e: SheetMailEdit, words: LeadEmailText) =>
  leadWordsInBox({ words, lead: e.lead, workspace: e.workspace, opening: e.opening });

/** Words typed where they stand, as tall as they are: the sheet's own email, a sequence's or one of your own. */
export function WordsBox(p: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  readOnly: boolean;
  testid: string;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  useGrowAsTyped(box, p.value);
  return (
    <Field
      ref={box}
      shape="words"
      rows={1}
      aria-label={p.label}
      value={p.value}
      onValueChange={p.onChange}
      maxLength={p.max}
      readOnly={p.readOnly}
      data-testid={p.testid}
    />
  );
}

/** A press beside the words answers its click without taking the keys from them first. */
const keepKeys = (event: MouseEvent) => event.preventDefault();

/** Where in its piece a point falls, by whichever of the two the browser has. */
function caretAtPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc: {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  } = document;
  const at = doc.caretPositionFromPoint?.(x, y);
  if (at) return { node: at.offsetNode, offset: at.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

/** Where a press on the read email falls in the box's words: its piece's place (`data-at`) and how far into it. */
function offsetAtPress(e: MouseEvent<HTMLElement>): number | null {
  const caret = caretAtPoint(e.clientX, e.clientY);
  if (!caret || !e.currentTarget.contains(caret.node)) return null;
  const el = caret.node.nodeType === 3 ? caret.node.parentElement : (caret.node as Element);
  const piece = el?.closest<HTMLElement>("[data-at]");
  if (!piece) return null;
  const walk = document.createTreeWalker(piece, NodeFilter.SHOW_TEXT);
  let into = 0;
  while (walk.nextNode()) {
    if (walk.currentNode === caret.node) return Number(piece.dataset.at) + into + caret.offset;
    into += walk.currentNode.textContent?.length ?? 0;
  }
  return Number(piece.dataset.at) + caret.offset;
}

/**
 * What a save just took stands on the sheet until the read after it lands: the words are theirs at once, and the read
 * that follows says the same. The lead's own read otherwise.
 */
export function useSaidWords<R extends { words: readonly LeadStepWordsDto[] }>(leadId: string | null, read: R) {
  const [said, setSaid] = useState<{ leadId: string | null; stepId: string; words: LeadEmailText | null } | null>(null);
  const words = read.words;
  useEffect(() => setSaid(null), [words]);
  const held = said && said.leadId === leadId ? said : null;
  return {
    emails: held
      ? {
          ...read,
          words: [
            ...words.filter((w) => w.step_id !== held.stepId),
            ...(held.words ? [{ ...held.words, step_id: held.stepId, at: "" }] : []),
          ],
        }
      : read,
    say: (stepId: string, next: LeadEmailText | null) => setSaid({ leadId, stepId, words: next }),
  };
}

/**
 * The card's email and its presses (00505): Rewrite the opening, asked in the dock's place first; the email said as being
 * written while it is; the Undo a landed rewrite keeps beside it while that email is on the card; and its box.
 */
export function emailActsOf(d: {
  run: SheetRun | null;
  facts: SheetFacts | null;
  sheet: ReturnType<typeof useSheetUi>;
  flash: Flash;
  moved: () => void;
  box: EmailBox;
}) {
  const { run, facts, sheet } = d;
  const mail = facts && facts.mail && sheet.ui.writing ? { ...facts.mail, writing: true, rewrite: false } : facts?.mail;
  const undo = sheet.ui.undo;
  const sendId = facts && facts.place ? facts.place.place.send_id : null;
  const undoNow = (kept: RewriteUndo) => {
    sheet.put({ undo: null });
    void undoRewrite(kept, d.flash).then(d.moved);
  };
  return {
    mail: mail ?? null,
    onRewrite: run && mail && mail.rewrite ? () => sheet.put({ whole: false, ask: "rewrite" }) : null,
    onUndo: undo && undo.sendId === sendId ? () => undoNow(undo.kept) : null,
    box: d.box,
  };
}

/** A step that went, as it went: read when it is opened, so a sheet opening asks for nothing more. */
export function SentEmail({ leadId, sendId, box }: { leadId: string; sendId: string; box: EmailBox }) {
  const [read, setRead] = useState<{ send: string; mail: { subject: string | null; body: string } | null } | null>(
    null,
  );
  useEffect(() => {
    let live = true;
    void sequenceVerbs.leadSent(leadId, sendId).then((r) => {
      if (live) setRead({ send: sendId, mail: r.ok ? r.data : null });
    });
    return () => {
      live = false;
    };
  }, [leadId, sendId]);
  const got = read && read.send === sendId ? read : null;
  if (!got || !got.mail)
    return (
      <p className="lw-note" data-testid="lead-sheet-sent-note">
        {got ? B.unread : B.reading}
      </p>
    );
  const mail: SheetMail = {
    to: "",
    subject: got.mail.subject,
    pieces: [{ at: 0, kind: "words", text: got.mail.body }],
    ending: null,
    opening: null,
    writing: false,
    rewrite: false,
    tall: false,
    edit: null,
    wordsUnread: false,
  };
  return <SheetEmail mail={mail} whole onWhole={null} onRewrite={null} onUndo={null} box={box} />;
}

interface EmailBoxOf {
  leadId: string | null;
  flash: Flash;
  moved: () => void;
  open: () => void;
  said: (stepId: string, words: LeadEmailText | null) => void;
}

/** The door, with the words the member's press says: its receipt with Undo, or its refusal in its words. */
async function commitWords(p: EmailBoxOf, edit: SheetMailEdit, words: LeadEmailText | null): Promise<string | null> {
  const r = await commitVerb("sequence_lead_words", {
    sequence_id: edit.sequenceId,
    step_id: edit.stepId,
    lead_id: edit.leadId,
    name: edit.name,
    words,
  });
  if (!r.ok) return r.message ?? B.cantGo;
  p.said(edit.stepId, words);
  const kept = r.undo;
  p.flash({
    tone: "ok",
    msg: r.receipt,
    undo: kept
      ? async () => {
          const u = await undoVerb("sequence_lead_words", kept);
          p.flash(u.ok ? { tone: "ok", msg: u.receipt } : refusalToast(u));
          p.moved();
        }
      : null,
  });
  p.moved();
  return null;
}

/** A press leaving the words for nothing of the box's: saved behind. A switch to another app is no leaving. */
function leftTheBox(e: FocusEvent<HTMLElement>, done: () => Promise<boolean>): void {
  if (typeof document !== "undefined" && document.hasFocus && !document.hasFocus()) return;
  const to = e.relatedTarget;
  if (to && (e.currentTarget.contains(to) || to.closest?.('[data-email-box], [role="menu"]'))) return;
  void done();
}

/** Escape lets the words go, as Done does, and goes no further: it would have closed the sheet too. */
function boxKeys(e: KeyboardEvent, done: () => Promise<boolean>): void {
  if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
    e.preventDefault();
    e.stopPropagation();
    void done();
  }
}

/**
 * The email's box, kept by the sheet so its dock can answer for it: what is being typed, and what ends it. `said` shows
 * the words a save just took until the read after it lands.
 */
export function useEmailBox(p: EmailBoxOf) {
  const [typing, setTyping] = useState<Typing | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A press that closed the sheet, or moved on, over words that could not be saved: the dock asks what becomes of them.
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const subjectRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const current = typing ? { subject: typing.subject, body: typing.body } : null;
  const dirty = !!typing && !!current && !same(current, typing.start);
  const work = useUnsavedWork(WORK_KIND, typing ? workKey(typing.edit) : null, {
    value: current,
    dirty,
    onLeave: () => setTyping(null),
  });
  useGrowAsTyped(subjectRef, typing ? (typing.subject ?? "") : "");
  useGrowAsTyped(bodyRef, typing ? typing.body : "");

  const commit = (edit: SheetMailEdit, words: LeadEmailText | null) => commitWords(p, edit, words);

  /** What was typed, saved: true once nothing is left to keep, false with what is wrong said under the box. */
  const save = async (t: Typing): Promise<boolean> => {
    const typed = { subject: t.subject, body: t.body };
    if (same(typed, t.start)) return true;
    const { edit } = t;
    // Typed back to what the step says for them: the step's words, not a copy of them that would stop following it.
    const words = same(typed, inBoxOf(edit, edit.stepWritten))
      ? null
      : leadWordsFromBox({ typed, base: edit.written, lead: edit.lead, workspace: edit.workspace });
    const wrong = words && leadWordsProblem({ words, first: edit.first, lead: edit.lead, workspace: edit.workspace });
    if (wrong) {
      setProblem(wrong);
      return false;
    }
    setSaving(true);
    const refused = await commit(edit, words);
    setSaving(false);
    setProblem(refused);
    return refused === null;
  };

  const end = () => {
    work.done();
    setTyping(null);
    setProblem(null);
    setLeaving(null);
  };

  /** Done, or the words left: saved, and the box lets go. */
  const done = async (): Promise<boolean> => {
    if (!typing || saving) return !typing;
    const ok = await save(typing);
    if (ok) end();
    return ok;
  };

  // Moved on to another lead with the box open (a row pressed, the deck walked): saved behind, the words kept in the tab
  // and said where they could not be. The ref carries what was typed at the last draw into the effect's clean-up.
  const typedNow = useRef<Typing | null>(null);
  typedNow.current = typing;
  useEffect(
    () => () => {
      const t = typedNow.current;
      if (!t) return;
      setTyping(null);
      setProblem(null);
      void save(t).then((ok) => {
        if (!ok) p.flash({ tone: "warn", msg: B.cantGo });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per lead: what it saves is what stood as the lead changed
    [p.leadId],
  );

  return {
    typing,
    problem,
    saving,
    leaving: leaving !== null,
    dirty,
    subjectRef,
    bodyRef,
    /** A press on the email or Edit: the box drawn in this task, whole, the sheet raised, the keys on the words. */
    begin(edit: SheetMailEdit, part: BoxPart, at: number | null) {
      const start = inBoxOf(edit, edit.written);
      const kept = tabDraft(WORK_KIND, workKey(edit)) as LeadEmailText | null;
      drawnNow(() => {
        setTyping({ edit, subject: kept?.subject ?? start.subject, body: kept?.body ?? start.body, start });
        setProblem(null);
        p.open();
      });
      const el = part === "subject" ? subjectRef.current : bodyRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      const to = at ?? el.value.length;
      el.setSelectionRange(to, to);
      el.scrollIntoView?.({ block: "nearest" });
    },
    type(change: Partial<LeadEmailText>) {
      setProblem(null);
      setTyping((t) => (t ? { ...t, ...change } : t));
    },
    done,
    /** Use the sequence's words: this lead goes back to the step's, and the box lets go. */
    async back(edit: SheetMailEdit | null = typing ? typing.edit : null) {
      if (!edit) return;
      if (edit.own) {
        setSaving(true);
        const refused = await commit(edit, null);
        setSaving(false);
        if (refused) {
          if (typing) setProblem(refused);
          else p.flash({ tone: "danger", msg: refused });
          return;
        }
      }
      end();
    },
    /** The sheet closing, or anything else leaving the box: saved first, or asked. */
    async leave(then: () => void) {
      if (!typing) return then();
      if (await done()) return then();
      setLeaving(() => then);
    },
    stay: () => setLeaving(null),
    drop: () => {
      const then = leaving;
      end();
      then?.();
    },
    left: (e: FocusEvent<HTMLElement>) => leftTheBox(e, done),
    keys: (e: KeyboardEvent) => boxKeys(e, done),
    /** A subject is one line, whatever it wraps to: Enter goes on to the words. */
    subjectKeys(e: KeyboardEvent) {
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        bodyRef.current?.focus();
      }
    },
  };
}

export type EmailBox = ReturnType<typeof useEmailBox>;

/** A tap on the read email begins the typing: a tap, never the drag that walks the leads, nor words being selected. */
const pressedAt = new WeakMap<HTMLElement, { x: number; y: number }>();
function tapToType(box: EmailBox, edit: SheetMailEdit, part: BoxPart) {
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => pressedAt.set(e.currentTarget, { x: e.clientX, y: e.clientY }),
    onPointerCancel: (e: PointerEvent<HTMLElement>) => pressedAt.delete(e.currentTarget),
    onClick: (e: MouseEvent<HTMLElement>) => {
      const at = pressedAt.get(e.currentTarget);
      pressedAt.delete(e.currentTarget);
      if (!at || Math.hypot(e.clientX - at.x, e.clientY - at.y) >= GRAB_AT) return;
      if (window.getSelection?.()?.toString()) return;
      box.begin(edit, part, part === "body" ? offsetAtPress(e) : null);
    },
  };
}

/** One piece of the email as it reads: the line written for them, that it is being written, what is still to come, or words. */
function PieceOf({ piece, mail }: { piece: LeadEmailPiece; mail: SheetMail }) {
  if (piece.kind === "words") return <span data-at={piece.at}>{piece.text}</span>;
  const line = piece.kind === "line" || piece.slot === "opening";
  if (line && mail.writing)
    return (
      <span className="lw-open" data-at={piece.at} data-testid="lead-card-opening">
        {W.mail.writing}
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
  const o = mail.opening;
  return (
    <span className="lw-opening" data-at={piece.at} data-testid="lead-card-opening">
      {o ? o.before : piece.text}
      {o && o.said ? (
        <mark className="lw-refused" data-testid="lead-card-refused">
          {o.said}
        </mark>
      ) : null}
      {o ? o.after : null}
    </span>
  );
}

/** How it ends under the words, as the send ends it: nobody types a second sign-off over one they cannot see. */
const EndingOf = ({ mail }: { mail: SheetMail }) =>
  mail.ending ? (
    <p className="lw-now-end-words" data-testid="lead-card-ending">
      {mail.ending}
    </p>
  ) : null;

/** The words being typed: the same words, at the same size, in the same place. */
function TypedEmail({ mail, box, typing }: { mail: SheetMail; box: EmailBox; typing: Typing }) {
  const readOnly = box.saving;
  return (
    <div className="lw-now-mail is-typing" data-testid="lead-card-email" data-email-box="" onBlur={box.left}>
      {mail.to ? (
        <div className="lw-now-head">
          <p className="lw-now-to" data-testid="lead-card-to">
            {mail.to}
          </p>
        </div>
      ) : null}
      {typing.subject !== null ? (
        <div className="lw-now-subj">
          <Field
            ref={box.subjectRef}
            shape="words"
            rows={1}
            aria-label={B.subject}
            value={typing.subject}
            onValueChange={(subject) => box.type({ subject: subject.replace(/\r?\n/g, " ") })}
            onKeyDown={(e) => {
              box.subjectKeys(e);
              box.keys(e);
            }}
            readOnly={readOnly}
            data-testid="lead-sheet-box-subject"
          />
        </div>
      ) : null}
      <div className="lw-now-body">
        <Field
          ref={box.bodyRef}
          shape="words"
          rows={1}
          aria-label={B.bodyOf(typing.edit.name)}
          value={typing.body}
          onValueChange={(body) => box.type({ body })}
          onKeyDown={box.keys}
          readOnly={readOnly}
          data-testid="lead-sheet-box-body"
          {...fieldProblem(box.problem)}
        />
      </div>
      <EndingOf mail={mail} />
      <p className="lw-note" data-testid="lead-sheet-box-foot">
        {B.foot}
      </p>
    </div>
  );
}

/** The email on the card: as it goes, a few lines of it until it is asked for whole, and a press away from being typed in. */
export function SheetEmail(p: {
  mail: SheetMail;
  whole: boolean;
  onWhole: (() => void) | null;
  onRewrite: (() => void) | null;
  onUndo: (() => void) | null;
  box: EmailBox;
}) {
  const { mail, box } = p;
  const edit = mail.edit && canDo("approve") ? mail.edit : null;
  const typing = box.typing;
  if (typing && mail.edit && typing.edit.stepId === mail.edit.stepId)
    return <TypedEmail mail={mail} box={box} typing={typing} />;
  const clip = p.whole || !p.onWhole ? "" : mail.tall ? " is-clipped is-tall" : " is-clipped";
  return (
    <div className="lw-now-mail" data-testid="lead-card-email">
      <div className="lw-now-head">
        {mail.to ? (
          <p className="lw-now-to" data-testid="lead-card-to">
            {mail.to}
          </p>
        ) : (
          <span />
        )}
        {edit ? (
          <Button
            variant="quiet"
            size="text"
            className="lw-now-edit"
            onMouseDown={keepKeys}
            onClick={() => box.begin(edit, "body", null)}
            aria-label={B.editOf(edit.name)}
            data-testid="lead-sheet-box-edit"
            {...gate("approve", "edit this email")}
          >
            <Icon name="pencil" size={12} />
            {B.edit}
          </Button>
        ) : null}
      </div>
      {mail.subject ? (
        <p
          className={edit ? "lw-now-subj is-typable" : "lw-now-subj"}
          data-testid="lead-card-subject"
          {...(edit && mail.subject !== null ? tapToType(box, edit, "subject") : {})}
        >
          {mail.subject}
        </p>
      ) : null}
      <div
        className={`lw-now-body${clip}${edit ? " is-typable" : ""}`}
        data-testid="lead-card-body"
        {...(edit ? tapToType(box, edit, "body") : {})}
      >
        {mail.pieces.map((piece) => (
          <PieceOf key={piece.at} piece={piece} mail={mail} />
        ))}
      </div>
      {p.whole || !p.onWhole ? <EndingOf mail={mail} /> : null}
      <div className="lw-now-acts">
        {p.onWhole ? (
          <LinkButton className="lw-link" onClick={p.onWhole} data-testid="lead-sheet-read-all">
            {p.whole ? W.mail.less : W.mail.readAll}
          </LinkButton>
        ) : (
          <span />
        )}
        {p.onRewrite ? (
          <LinkButton
            className="lw-link q"
            onClick={p.onRewrite}
            data-testid="lead-sheet-rewrite"
            {...gate("approve", "rewrite the opening")}
          >
            {W.mail.rewrite}
          </LinkButton>
        ) : null}
        {p.onUndo ? (
          <LinkButton
            className="lw-link q"
            onClick={p.onUndo}
            data-testid="lead-sheet-rewrite-undo"
            {...gate("approve", "put the earlier opening back")}
          >
            {REWRITE_WORDS.undo}
          </LinkButton>
        ) : null}
      </div>
      {mail.wordsUnread ? (
        <p className="lw-now-own" data-testid="lead-sheet-words-unread">
          <span>{B.wordsUnread}</span>
        </p>
      ) : null}
      {mail.edit && mail.edit.own ? (
        <p className="lw-now-own" data-testid="lead-sheet-own">
          <span>{B.only(mail.edit.name)}</span>
          {edit ? (
            <LinkButton
              className="lw-link q"
              onClick={() => void box.back(edit)}
              data-testid="lead-sheet-own-back"
              {...gate("approve", "put the sequence's words back")}
            >
              {B.back}
            </LinkButton>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The dock's place while the words are typed (as it holds Take out's question, or what should change): Done, and what
 * else there is to do with them under its caret. Or, leaving words that cannot go, what becomes of them.
 */
export function SheetBoxDock(p: { box: EmailBox; run: SheetRun | null; flash: Flash; moved: () => void }) {
  const { box, run } = p;
  const typing = box.typing;
  if (!typing) return null;
  const { edit } = typing;
  // The sequence's own record, where the words for everyone are written.
  const everyone = () => void box.leave(() => run && openRecordFor(run, edit.sequenceId, "steps"));
  // A test of what was typed, as the send sends it: saved first.
  const test = async () => {
    if (!(await box.done())) return;
    const lead = { sequence_id: edit.sequenceId, step_id: edit.stepId, lead_id: edit.leadId };
    await pressed("sequence_test", lead, p.flash, p.moved);
  };
  if (box.leaving)
    return (
      <Confirm
        question={B.cantGo}
        detail={box.problem ?? undefined}
        yes={B.drop}
        no={B.stay}
        onYes={box.drop}
        onNo={box.stay}
        testid="lead-sheet-box-leaving"
      />
    );
  const canBack = typing.edit.own || box.dirty;
  return (
    <div className="lw-dock" data-email-box="" data-testid="lead-sheet-box-dock">
      {canBack ? (
        <Button
          variant="secondary"
          className="lw-dock-b"
          disabled={box.saving}
          onMouseDown={keepKeys}
          onClick={() => void box.back()}
          data-testid="lead-sheet-box-back"
          {...gate("approve", "put the sequence's words back")}
        >
          <span className="lw-dock-w">{B.back}</span>
        </Button>
      ) : null}
      <span className="lw-split">
        <Button
          variant="primary"
          className="lw-dock-b"
          disabled={box.saving}
          aria-busy={box.saving || undefined}
          onMouseDown={keepKeys}
          onClick={() => void box.done()}
          data-testid="lead-sheet-box-done"
          {...gate("approve", "edit this email")}
        >
          <span className="lw-dock-w">{B.done}</span>
        </Button>
        <Menu
          label={B.more}
          trigger={
            <Button
              variant="primary"
              iconOnly
              className="lw-split-more"
              disabled={box.saving}
              onMouseDown={keepKeys}
              aria-label={B.more}
              data-testid="lead-sheet-box-more"
            >
              <Icon name="chevron-down" size={13} />
            </Button>
          }
          groups={[
            {
              items: [
                { label: B.everyone, onSelect: everyone },
                { label: B.test, onSelect: () => void test() },
              ],
            },
          ]}
        />
      </span>
    </div>
  );
}
