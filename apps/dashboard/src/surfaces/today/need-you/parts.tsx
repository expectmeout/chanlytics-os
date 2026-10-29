/**
 * The pieces every row of Need you draws its work with (decision 0071): what Ask prepared, as words to send or change or
 * a call's brief to read; the send on its way, counted down with Undo; what became of it, with its own undo; the presses
 * at the row's foot, Not now's menu at the left. Drawn under the row's words by the kit's attention row (`work`), from the
 * kit's own parts: the inset panel, the field, the meter, the menu, the button.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NEED_YOU_WORDS as W, type CallBrief, type NotNowChoice, type TodayQueueRowVM } from "@chanlytics/contracts";
import { Button, Field, Menu, Meter, Panel } from "../../kit";
import { Icon } from "../../kit/icon/icon";
import { editorBox, focusAsDrawn } from "../../legacy-verbs";
import type { Flash } from "../shell";

/** What a row's work is handed: the row, how its act is drawn, who may act, the clock, the toast, and the card's hold. */
export interface WorkProps {
  row: TodayQueueRowVM;
  /** The section's one coral: the first open row's act is primary, every other secondary. */
  main: "primary" | "secondary";
  /** A member who acts (an owner or operator): a viewer reads what Ask prepared and presses nothing. */
  may: boolean;
  /** The business's zone, which Not now's times are said in. */
  tz: string;
  flash: (f: Flash) => void;
  /** Keep the row on the card for this visit, whatever the next read says: its receipt and its undo stay in its place. */
  keep: (row: TodayQueueRowVM) => void;
  /**
   * Where the presses stand when the work is drawn in a sheet (need-you/walk-sheet.tsx, a phone's): the sheet's foot,
   * which holds still while the words above it scroll. None everywhere else: the presses stand under the words.
   */
  foot?: HTMLElement | null;
  /**
   * The door to the row's whole work, where the row is drawn short of it: on a phone's card, Ask's words cut to two lines,
   * whose Read opens the sheet that walks the list on it. None everywhere else: the words are whole.
   */
  read?: (() => void) | null;
}

/** Read, beside whose words they are, where the row is drawn short of them (WorkProps `read`). Called, not drawn. */
function readDoor(read: (() => void) | null | undefined) {
  return read ? (
    <Button variant="quiet" size="text" onClick={read} className="ny-read">
      {W.walk.read}
      <Icon name="chevron" size={11} />
    </Button>
  ) : null;
}

/** Ask's mark at the head of what it prepared: the three, in the accent while it writes (Ask is quiet at rest). */
function AskMark({ live = false }: { live?: boolean }) {
  return (
    <span className="ny-three" data-live={live || undefined} aria-hidden="true">
      <Icon name="three" size={14} />
    </span>
  );
}

/** Words Ask prepared, as the row offers them: whose they are over them, and Edit, which opens the box. */
export function Words({
  by,
  text,
  who,
  onEdit,
  signed = null,
  onSigned = null,
  onRead = null,
}: {
  by: string;
  text: string;
  who: string;
  onEdit: (() => void) | null;
  /** The signature an email reply leaves with, its lines as the email carries them (00487); null where it carries none. */
  signed?: string | null;
  /** Where what it signs with is changed: Settings › Connections. */
  onSigned?: (() => void) | null;
  /** The door to the whole work where the row is drawn short of it (WorkProps `read`). */
  onRead?: (() => void) | null;
}) {
  return (
    <Panel variant="inset" size="sm" className="ny-draft">
      <span className="ny-by">
        <AskMark />
        <span className="ny-by-words">{by}</span>
        {onEdit ? (
          <Button variant="quiet" size="text" onClick={onEdit} aria-label={W.editDraft(who)} className="ny-edit">
            <Icon name="pencil" size={12} />
            {W.edit}
          </Button>
        ) : null}
        {readDoor(onRead)}
      </span>
      <span className="ny-words">{text}</span>
      {signed ? (
        <span className="ny-signed" data-testid="ny-signed">
          <span className="ny-signed-words">{signed}</span>
          {onSigned ? (
            <Button variant="quiet" size="text" onClick={onSigned} title={W.changeSignatureTip}>
              {W.changeSignature}
            </Button>
          ) : null}
        </span>
      ) : null}
    </Panel>
  );
}

/**
 * Ask writing the words: the row lands first, the draft fills in a moment later, where the four lines it stands on are
 * a draft's usual height (need-you.css .ny-sk-lines), so the words take their place with the row moving as little as it can.
 * It stood on two thin bars, and a draft of five lines pushed everything under it down as it came.
 */
export function Writing() {
  return (
    <Panel variant="inset" size="sm" className="ny-draft" aria-busy="true">
      <span className="ny-by">
        <AskMark live />
        <span className="ny-by-words">{W.drafting}</span>
      </span>
      <span className="ny-sk-lines" aria-hidden="true">
        <span className="ny-sk" />
        <span className="ny-sk" />
        <span className="ny-sk" />
        <span className="ny-sk ny-sk-short" />
      </span>
    </Panel>
  );
}

/**
 * A box a press opened in place (Edit, Change it with Ask): it takes the keys as it appears, and on a touch screen its
 * frame takes the focus instead (`editorBox`), so the keyboard rises on a tap and not over the row.
 */
export function OpenedBox(p: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  placeholder?: string;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusAsDrawn()) box.current?.focus();
  }, []);
  return (
    <div className="ny-editor" {...editorBox}>
      <Field
        ref={box}
        label={p.label}
        rows={p.rows}
        value={p.value}
        onValueChange={p.onChange}
        placeholder={p.placeholder}
      />
    </div>
  );
}

/** The words in their box, to change before they go: the member's own from here on. */
export function Editor({ who, value, onChange }: { who: string; value: string; onChange: (v: string) => void }) {
  return <OpenedBox label={W.yourWords(who)} rows={4} value={value} onChange={onChange} />;
}

/** A call's brief: what to say, what to ask, what to leave out. Read, not sent. */
export function BriefBox({ brief, onRead = null }: { brief: CallBrief; onRead?: (() => void) | null }) {
  // A phone's card says the first thing to say, with Read for the rest, which the walk's sheet holds whole (his look on a
  // phone, 29 Oct 2026: the brief's own head stood over one line of it).
  if (onRead && brief.opening)
    return (
      <Panel variant="inset" size="sm" className="ny-draft" aria-label={W.brief.title}>
        <span className="ny-by">
          <AskMark />
          <span className="ny-by-words ny-line ny-said">
            <b>{W.brief.say}</b> {brief.opening}
          </span>
          {readDoor(onRead)}
        </span>
      </Panel>
    );
  return (
    <Panel variant="inset" size="sm" className="ny-draft">
      <span className="ny-by">
        <AskMark />
        <span className="ny-by-words">{W.brief.title}</span>
        {readDoor(onRead)}
      </span>
      {brief.opening ? (
        <span className="ny-line">
          <b>{W.brief.say}</b> {brief.opening}
        </span>
      ) : null}
      {brief.points.map((p, i) => (
        <span key={i} className="ny-line ny-point">
          {p}
        </span>
      ))}
      {brief.ask ? (
        <span className="ny-line">
          <b>{W.brief.ask}</b> {brief.ask}
        </span>
      ) : null}
      {brief.avoid.length ? (
        <span className="ny-line ny-avoid">
          <b>{W.brief.avoid}</b> {brief.avoid.join(" · ")}
        </span>
      ) : null}
    </Panel>
  );
}

/** Something read, not sent: their receptionist's words, a run's first message. */
export function Quote({ by, text }: { by: string; text: string }) {
  return (
    <Panel variant="inset" size="sm" className="ny-draft">
      <span className="ny-by">
        <span className="ny-by-words">{by}</span>
      </span>
      <span className="ny-words">{text}</span>
    </Panel>
  );
}

/**
 * A send counting down: the words, the meter of the grace left, and Undo, the press. The meter is the accent, since the
 * send is live; it empties as the grace runs out. No live region: the seconds change four times a second, and a reader
 * told each one hears nothing else. `takeFocus` where this row's own press started it: Send went with the row's presses, so
 * its press takes the keys, and the keyboard is on Undo instead of thrown back to the page's top.
 */
export function Going({
  line,
  sub,
  share,
  act,
  takeFocus = false,
}: {
  line: string;
  sub: string;
  share: number;
  act: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean };
  takeFocus?: boolean;
}) {
  const press = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const at = document.activeElement;
    if (takeFocus && (!at || at === document.body)) press.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it is drawn: a later draw never moves the keys
  }, []);
  return (
    <div className="ny-going">
      <span className="ny-going-words">
        <span className="ny-going-line">{line}</span>
        <span className="ny-going-sub">{sub}</span>
        <Meter
          className="ny-going-bar"
          size="sm"
          parts={[
            { share: Math.max(0.001, share), color: "var(--accent)" },
            { share: Math.max(0, 1 - share), tone: "rest" },
          ]}
          aria-label={sub}
        />
      </span>
      <Button
        ref={press}
        onClick={act.onPress}
        disabled={act.busy || act.disabled}
        aria-busy={act.busy || undefined}
        aria-label={`${act.label}: ${sub}`}
      >
        {act.label}
      </Button>
    </div>
  );
}

/** What became of a row, in its place for this visit, with the undo while it lasts. */
export function Done({
  words,
  detail,
  tone = "ok",
  act,
}: {
  words: string;
  detail?: string | null;
  tone?: "ok" | "rest";
  act?: { label: string; onPress: () => void; busy?: boolean } | null;
}) {
  return (
    <div className="ny-done" data-tone={tone}>
      <Icon name={tone === "ok" ? "check" : "clock"} size={13} />
      <span className="ny-done-words">
        <b>{words}</b>
        {detail ? ` · ${detail}` : ""}
      </span>
      {act ? (
        <Button variant="quiet" size="sm" onClick={act.onPress} disabled={act.busy} className="ny-done-act">
          {act.label}
        </Button>
      ) : null}
    </div>
  );
}

/** A line about the row's state that is not words to send: why it cannot go, what changed, what Ask needs to know. */
export function Note({ tone = "plain", children }: { tone?: "plain" | "warn" | "danger"; children: ReactNode }) {
  return (
    <span className="ny-note" data-tone={tone}>
      {children}
    </span>
  );
}

/** The row's presses: what is at the left (Not now, a quiet second), then the room, then the act; in a sheet, its foot. */
export function Acts({ start, end, foot = null }: { start?: ReactNode; end?: ReactNode; foot?: HTMLElement | null }) {
  const acts = (
    <div className="ny-acts">
      {start}
      <span className="ny-room" />
      {end}
    </div>
  );
  return foot ? createPortal(acts, foot) : acts;
}

/**
 * Not now: a menu of when it comes back, on the business's clock, and that their next message brings it sooner. `label`
 * names the menu where it is not about the person coming back (a step's day moved). `onOpen` is told as its trigger is
 * reached (a pointer pressing it, the keys arriving on it), so the times are worked out as it opens, never hours before.
 */
export function NotNow({
  who,
  label,
  choices,
  caption,
  onOpen,
  onChoose,
  busy,
}: {
  who: string;
  label?: string;
  choices: readonly Pick<NotNowChoice, "label" | "when">[];
  caption: string | null;
  onOpen?: () => void;
  onChoose: (i: number) => void;
  busy?: boolean;
}) {
  return (
    <Menu
      align="start"
      label={label ?? W.notNowFor(who)}
      trigger={
        <Button variant="quiet" disabled={busy} className="ny-not-now" onPointerDown={onOpen} onFocus={onOpen}>
          {W.notNow}
          <Icon name="chevron-down" size={12} />
        </Button>
      }
      groups={[
        {
          items: choices.map((c, i) => ({ label: c.label, hint: c.when, onSelect: () => onChoose(i) })),
          ...(caption ? { caption } : {}),
        },
      ]}
    />
  );
}

/** A clock that ticks while `on`: a countdown that is not a send of ours (the receptionist's reply) draws by it. */
export function useTick(on: boolean, everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [on, everyMs]);
  return now;
}
