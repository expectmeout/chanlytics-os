/**
 * The pieces every row of Need you draws its work with (decision 0071; one sheet, 9 Nov 2026): the words that go to them, a
 * field because they are one; a sentence or a line that says where things stand; the send on its way, counted down with
 * Undo; what became of it, with its own undo; the presses, Not now's menu at the left. Drawn under the row's words by the
 * kit's attention row (`work`) or in the sheet that walks the list, from the kit's own parts: the field, the meter, the menu,
 * the button.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  NEED_YOU_WORDS as W,
  NOT_A_PERSON_WORDS,
  type NotNowChoice,
  type TodayQueueRowVM,
} from "@chanlytics/contracts";
import { Button, Field, Menu, Meter, Panel } from "../../kit";
import { useGrowAsTyped } from "../../kit/field/grow-as-typed";
import { Icon } from "../../kit/icon/icon";
import { editorBox, focusAsDrawn } from "../../frame-verbs";
import { useTodayOnPhone } from "../phone";
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
   * Let go of a row kept: the press was refused, or its Undo or Wake put it back. It waits again, so the one count (and the
   * head, the badge and the tabs with it) has it again, as the canvas's undo does.
   */
  unkeep: (row: TodayQueueRowVM) => void;
  /**
   * Where the presses stand when the work is drawn in a sheet (need-you/walk-sheet.tsx, a phone's): the sheet's foot,
   * which holds still while the words above it scroll. None everywhere else: the presses stand under the words.
   */
  foot?: HTMLElement | null;
  /**
   * The door to the row's whole work, where the row is drawn short of it: on a phone's Up next, two lines of Ask's words,
   * whose press opens the sheet that walks the list on it. None everywhere else: the words are whole.
   */
  read?: (() => void) | null;
  /** The row is drawn whole, in a sheet or a desk's place: what was said on it stands over its work. */
  whole?: boolean;
  /** The sheet is pulled up: all that was said on it, not its last three. */
  pulled?: boolean;
}

/** The quiet press at the row's left: a word on the page, and a filled one in a sheet's foot, sized by its word. */
export const startKind = (foot: HTMLElement | null | undefined): "secondary" | "quiet" =>
  foot ? "secondary" : "quiet";

/** A press drawn as words, not a button: Enter and Space press it, as a button's do. */
const pressKeys = (press: () => void) => (e: KeyboardEvent) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  press();
};

/** Ask's mark at the head of what it prepared: the three, in the accent while it writes (Ask is quiet at rest). */
export function AskMark({ live = false }: { live?: boolean }) {
  return (
    <span className="ny-three" data-live={live || undefined} aria-hidden="true">
      <Icon name="three" size={13} />
    </span>
  );
}

/** The signature an email reply leaves with, under its words, and where it is changed. */
function Signature({ signed, onSigned }: { signed: string; onSigned: (() => void) | null }) {
  return (
    <span className="ny-signed" data-testid="ny-signed">
      <span className="ny-signed-words">{signed}</span>
      {onSigned ? (
        <Button variant="quiet" size="text" onClick={onSigned} title={W.changeSignatureTip}>
          {W.changeSignature}
        </Button>
      ) : null}
    </span>
  );
}

/** A press beside words being typed answers its click without taking the keys from them first. */
const keepKeys = (event: MouseEvent) => event.preventDefault();

/**
 * Whose a row's words are, and the way back to the drafted ones, from what was drafted and what the member has typed: the
 * drafted words' own (`by`, Ask's unless said) until the member's differ, theirs where nothing was drafted, and the way back
 * only once there is a draft to go back to.
 */
export function whoseWords(
  drafted: string,
  mine: string | null,
  restore: () => void,
  by: string = W.drafted,
): { by: string; asks: boolean; onRestore: (() => void) | null } {
  const changed = mine !== null && mine !== drafted;
  const asks = !!drafted && !changed;
  return { by: asks ? by : W.yours, asks: asks && by === W.drafted, onRestore: changed && drafted ? restore : null };
}

/**
 * Two lines of what Ask has ready, on a phone's Up next, with no box round them: a press opens the sheet, where they are a
 * field (one row, 9 Nov 2026: a box in a box, with Edit beside Send).
 */
function Peek({ text, onRead, who }: { text: string; onRead: () => void; who: string }) {
  return (
    <span
      className="ny-peek"
      role="button"
      tabIndex={0}
      aria-label={W.editDraft(who)}
      onClick={onRead}
      onKeyDown={pressKeys(onRead)}
    >
      <AskMark />
      <span className="ny-peek-words">{text}</span>
    </span>
  );
}

/**
 * Words that go to them: what they are, a line over them, and the field itself, because it is one. Pressing it is how they
 * are changed, so there is no Edit, no second box and no smaller type, and the signature stays under them since what is sent
 * is what is seen. A viewer, or a send on its way, reads them as they stand. A phone's Up next draws two lines of them (Peek).
 */
export function Words({
  label,
  asks = false,
  text,
  who,
  onChange,
  onRestore = null,
  undo = null,
  open = false,
  busy = false,
  signed = null,
  onSigned = null,
  onRead = null,
}: {
  /** What stands over them: Ask's draft, Yours now, What they'll get, Going to Chris. */
  label: string;
  /** They are Ask's: its mark stands before the label. */
  asks?: boolean;
  text: string;
  who: string;
  /** The member's words as they type them; null where they may not (a viewer, a send on its way): the words are read. */
  onChange: ((text: string) => void) | null;
  /** Where the member's words differ from what was drafted: the drafted words back in their place. */
  onRestore?: (() => void) | null;
  /** Right after Ask changed them: the words they had before. */
  undo?: (() => void) | null;
  /** Opened by a press (Write it myself): the words take the keys as they are drawn, where the screen lets them. */
  open?: boolean;
  /** Ask is changing them: they stand, dimmed, until the new ones come. */
  busy?: boolean;
  /** The signature an email reply leaves with, its lines as the email carries them (00487); null where it carries none. */
  signed?: string | null;
  /** Where what it signs with is changed: Settings › Connections. */
  onSigned?: (() => void) | null;
  /** The door to the whole work where the row is drawn short of it (WorkProps `read`). */
  onRead?: (() => void) | null;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  useGrowAsTyped(box, text);
  // Opened by a press, the words take the keys as they are drawn, as a box a press opened does (OpenedBox); on a touch
  // screen the field's panel takes them instead (editorBox), and a tap on the words begins the typing.
  useEffect(() => {
    if (open && focusAsDrawn()) box.current?.focus();
  }, [open]);
  if (onRead) return <Peek text={text} onRead={onRead} who={who} />;
  const signature = signed ? <Signature signed={signed} onSigned={onSigned} /> : null;
  // Escape lets the words go and goes no further: in the walk's sheet it would have closed the sheet too.
  const keys = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    box.current?.blur();
  };
  const head = (
    <span className="ny-by">
      {asks || busy ? <AskMark live={busy} /> : null}
      <span className="ny-by-words">{busy ? W.say.changing : label}</span>
      {!busy && undo ? (
        <Button variant="quiet" size="text" onMouseDown={keepKeys} onClick={undo}>
          {W.undo}
        </Button>
      ) : null}
      {!busy && onRestore ? (
        <Button variant="quiet" size="text" onMouseDown={keepKeys} onClick={onRestore}>
          {W.useAsks}
        </Button>
      ) : null}
    </span>
  );
  if (!onChange || busy)
    return (
      <div className="ny-draft">
        {head}
        <Panel variant="field" size="sm" className="ny-draft-box" data-busy={busy || undefined}>
          <span className="ny-words">{text}</span>
          {signature}
        </Panel>
      </div>
    );
  return (
    <div className="ny-draft">
      {head}
      <Panel variant="field" size="sm" className="ny-draft-box" {...(open ? editorBox : {})}>
        <Field
          ref={box}
          aria-label={W.yourWords(who)}
          shape="words"
          rows={1}
          value={text}
          onValueChange={onChange}
          onKeyDown={keys}
          placeholder={W.writeHere(who)}
          className="ny-typed"
        />
        {signature}
      </Panel>
    </div>
  );
}

/**
 * Ask writing the words: the row lands first, the draft fills in a moment later, where the lines it stands on are a draft's
 * usual height, so the words take their place with the row moving as little as it can. On a phone's Up next, two lines.
 */
export function Writing({ short = false }: { short?: boolean }) {
  return (
    <div className="ny-draft" aria-busy="true">
      <span className="ny-by">
        <AskMark live />
        <span className="ny-by-words">{W.drafting}</span>
      </span>
      {short ? null : (
        <Panel variant="field" size="sm" className="ny-draft-box">
          <span className="ny-sk-lines" aria-hidden="true">
            <span className="ny-sk" />
            <span className="ny-sk" />
            <span className="ny-sk ny-sk-short" />
          </span>
        </Panel>
      )}
    </div>
  );
}

/**
 * A send counting down: what it is doing, the meter of the grace left, and Undo, the press. The meter is the accent, since
 * the send is live; it empties as the grace runs out. No live region: the seconds change four times a second, and a reader
 * told each one hears nothing else. `takeFocus` where this row's own press started it: Send went with the row's presses, so
 * its press takes the keys, and the keyboard is on Undo instead of thrown back to the page's top. In a sheet it stands in the
 * foot, where the presses were.
 */
export function Going({
  line,
  sub,
  share,
  act,
  takeFocus = false,
  foot = null,
}: {
  line: string;
  sub: string;
  share: number;
  act: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean };
  takeFocus?: boolean;
  foot?: HTMLElement | null;
}) {
  const press = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const at = document.activeElement;
    if (takeFocus && (!at || at === document.body)) press.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it is drawn: a later draw never moves the keys
  }, []);
  const going = (
    <div className="ny-going">
      <span className="ny-going-words">
        <span className="ny-going-line">{line}</span>
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
  return foot ? createPortal(going, foot) : going;
}

/** What became of a row, in its place for this visit, with the undo while it lasts; in a sheet, in its foot. */
export function Done({
  words,
  detail,
  tone = "ok",
  act,
  foot = null,
}: {
  words: string;
  detail?: string | null;
  tone?: "ok" | "rest";
  act?: { label: string; onPress: () => void; busy?: boolean } | null;
  foot?: HTMLElement | null;
}) {
  const done = (
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
  return foot ? createPortal(done, foot) : done;
}

/** A line about the row's state that is not words to send: why it cannot go, what changed, what Ask needs to know. */
export function Note({ tone = "plain", children }: { tone?: "plain" | "warn" | "danger" | "ok"; children: ReactNode }) {
  return (
    <span className="ny-note" data-tone={tone}>
      <i aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

/** The sentence a sheet stands on, where no words were said (a call back's, a search's, a to-do's). */
export function State({ children, small = null }: { children: ReactNode; small?: ReactNode }) {
  return (
    <p className="ny-state">
      {children}
      {small ? <small>{small}</small> : null}
    </p>
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
  markDone,
  letGo,
  foot,
}: {
  who: string;
  label?: string;
  choices: readonly Pick<NotNowChoice, "label" | "when">[];
  caption: string | null;
  onOpen?: () => void;
  onChoose: (i: number) => void;
  busy?: boolean;
  /**
   * Mark done, under the times, where the row is a hold the receptionist can have back (reply-work.tsx useMarkDone): it
   * leaves Need you now, whatever its age, as Mark all done lets a week's go. Absent everywhere else.
   */
  markDone?: (() => void) | null;
  /**
   * Not a person, last, where the row may be a program's mail and the member may say so (reply-work.tsx notAPersonOf):
   * never now, rather than not now. Absent everywhere else.
   */
  letGo?: (() => void) | null;
  /** The sheet's foot it stands in, where it does: there it is filled, sized by its word. */
  foot?: HTMLElement | null;
}) {
  // On a phone the sheet says whose it is at its head (Ruben, 20 Oct 2026: a phone's menu heads with what it is about),
  // and each time wears a clock, so every row's words stand on one edge with Mark done's and Not a person's (the phone
  // pass, 3 Nov 2026: three edges, 30, 52 and 57).
  const phone = useTodayOnPhone();
  return (
    <Menu
      align="start"
      label={label ?? W.notNowFor(who)}
      head={phone ? { title: `${W.notNow} · ${who}`, close: <Icon name="x" size={13} /> } : undefined}
      trigger={
        <Button
          variant={startKind(foot)}
          disabled={busy}
          className="ny-not-now"
          onPointerDown={onOpen}
          onFocus={onOpen}
        >
          {W.notNow}
          <Icon name="chevron-down" size={12} />
        </Button>
      }
      groups={[
        {
          items: choices.map((c, i) => ({
            label: c.label,
            hint: c.when,
            glyph: <Icon name="clock" size={13} />,
            onSelect: () => onChoose(i),
          })),
          ...(caption ? { caption } : {}),
        },
        ...(markDone
          ? [
              {
                items: [
                  {
                    label: W.oldDone.yes,
                    meta: W.oldDone.detail,
                    glyph: <Icon name="check" size={13} />,
                    onSelect: markDone,
                  },
                ],
              },
            ]
          : []),
        ...(letGo
          ? [
              {
                items: [
                  {
                    label: NOT_A_PERSON_WORDS.act,
                    meta: NOT_A_PERSON_WORDS.actHint,
                    glyph: <Icon name="ban" size={13} />,
                    tone: "danger" as const,
                    onSelect: letGo,
                  },
                ],
              },
            ]
          : []),
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
