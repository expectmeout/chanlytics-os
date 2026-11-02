/**
 * The pieces every row of Need you draws its work with (decision 0071): what Ask prepared, as words to send or change or
 * a call's brief to read; the send on its way, counted down with Undo; what became of it, with its own undo; the presses
 * at the row's foot, Not now's menu at the left. Drawn under the row's words by the kit's attention row (`work`), from the
 * kit's own parts: the inset panel, the field, the meter, the menu, the button.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  NEED_YOU_WORDS as W,
  NOT_A_PERSON_WORDS,
  type CallBrief,
  type NotNowChoice,
  type TodayQueueRowVM,
} from "@chanlytics/contracts";
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

/**
 * The head over what the row prepared: Ask's mark where the words are Ask's, what they are in the darker ink, whose they
 * are after it ("Reply · drafted by Ask", "Call notes · only you see these"), and the presses at its right. Labels,
 * like every state and press on the card, stand at the small step (need-you.css): what a box is never reads smaller
 * than the time beside a name.
 */
function Head({
  mark = null,
  what,
  by = null,
  children = null,
}: {
  mark?: ReactNode;
  what: ReactNode;
  by?: string | null;
  children?: ReactNode;
}) {
  return (
    <span className="ny-by">
      {mark}
      <span className="ny-by-words">
        <b>{what}</b>
        {by ? ` · ${by}` : null}
      </span>
      {children}
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
 * Where the browser cannot size a box by its words (kit.css .rec-input-words, `field-sizing`), the box grows as they are
 * typed, so nothing scrolls inside it.
 */
function useGrowAsTyped(box: RefObject<HTMLTextAreaElement | null>, text: string) {
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof CSS === "undefined" || CSS.supports("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [box, text]);
}

/**
 * Whose a row's words are, and the way back to the drafted ones, from what was drafted and what the member has typed:
 * the drafted words' own (`by`, Ask's unless said) until the member's differ, theirs where nothing was drafted, and Use
 * Ask's draft only once there is a draft to go back to.
 */
export function whoseWords(
  drafted: string,
  mine: string | null,
  restore: () => void,
  by: string = W.drafted,
): { by: string; onRestore: (() => void) | null } {
  const changed = mine !== null && mine !== drafted;
  return { by: drafted && !changed ? by : W.yours, onRestore: changed && drafted ? restore : null };
}

/**
 * Words that go to them, as the row offers them (the refined canvas, 31 Oct 2026; the 23 Oct canvas drew them so, as a
 * field): on the field's panel, headed by what they are and whose, and typed in where they stand. The words are the
 * box (the kit's Field said in place), at the size they are read at, so beginning to type moves nothing: no second
 * box, no smaller type, no label in the head's place, and the signature stays under them, since what is sent is what is
 * seen. Edit takes the keys at their end, Done or Escape lets them go, and Use Ask's draft puts the drafted words back
 * once the member's differ. A viewer, who sends nothing, reads them in the inset; a phone's card, drawn short of them,
 * shows two lines with Read, and the walk's sheet is where they are typed in.
 */
export function Words({
  what,
  by,
  text,
  who,
  onChange,
  onRestore = null,
  open = false,
  signed = null,
  onSigned = null,
  onRead = null,
}: {
  /** What they are: a reply, a rebook, a public reply, a confirmation. */
  what: string;
  /** Whose they are: drafted by Ask, written by your receptionist, your words. */
  by: string;
  text: string;
  who: string;
  /** The member's words as they type them; null where they may not (a viewer): the words are read, in the inset. */
  onChange: ((text: string) => void) | null;
  /** Where the member's words differ from what was drafted: the drafted words back in their place. */
  onRestore?: (() => void) | null;
  /** Opened by a press (Write it myself): the words take the keys as they are drawn, where the screen lets them. */
  open?: boolean;
  /** The signature an email reply leaves with, its lines as the email carries them (00487); null where it carries none. */
  signed?: string | null;
  /** Where what it signs with is changed: Settings › Connections. */
  onSigned?: (() => void) | null;
  /** The door to the whole work where the row is drawn short of it (WorkProps `read`). */
  onRead?: (() => void) | null;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [typing, setTyping] = useState(false);
  useGrowAsTyped(box, text);
  // Opened by a press, the words take the keys as they are drawn, as a box a press opened does (OpenedBox); on a touch
  // screen the field's panel takes them instead (editorBox), and a tap on the words begins the typing.
  useEffect(() => {
    if (open && focusAsDrawn()) box.current?.focus();
  }, [open]);
  const signature = signed ? <Signature signed={signed} onSigned={onSigned} /> : null;
  // Read where they stand: a viewer's, or a phone's card, whose Edit beside Send opens the sheet that walks the list on it
  // (reply-work.tsx). The inset's ground, as the canvas sets Ask's words under theirs (1 Nov 2026).
  if (!onChange || onRead)
    return (
      <Panel variant="inset" size="sm" className="ny-draft">
        <Head mark={<AskMark />} what={what} by={by} />
        <span className="ny-words">{text}</span>
        {signature}
      </Panel>
    );
  const toTheEnd = () => {
    const el = box.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  };
  // Escape lets the words go and goes no further: in the walk's sheet it would have closed the sheet too.
  const keys = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    box.current?.blur();
  };
  const took = (event: FocusEvent) => event.target === box.current && setTyping(true);
  const left = (event: FocusEvent) => event.target === box.current && setTyping(false);
  return (
    <Panel variant="field" size="sm" className="ny-draft" onFocus={took} onBlur={left} {...(open ? editorBox : {})}>
      <Head mark={<AskMark />} what={what} by={typing ? W.editing : by}>
        {onRestore ? (
          <Button variant="quiet" size="text" onMouseDown={keepKeys} onClick={onRestore}>
            {W.useAsks}
          </Button>
        ) : null}
        <Button
          variant="quiet"
          size="text"
          onMouseDown={keepKeys}
          onClick={typing ? () => box.current?.blur() : toTheEnd}
          aria-label={typing ? undefined : W.editDraft(who)}
          className="ny-edit"
        >
          {typing ? null : <Icon name="pencil" size={12} />}
          {typing ? W.done : W.edit}
        </Button>
      </Head>
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
  );
}

/**
 * Ask writing the words: the row lands first, the draft fills in a moment later, where the four lines it stands on are
 * a draft's usual height (need-you.css .ny-sk-lines), so the words take their place with the row moving as little as it can.
 * It stood on two thin bars, and a draft of five lines pushed everything under it down as it came. It stands on the
 * field the words will be typed in, so the surface does not change as they come.
 */
export function Writing() {
  return (
    <Panel variant="field" size="sm" className="ny-draft" aria-busy="true">
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

/**
 * What a call's notes say to find out, as the key column heads it: "Find out" over "What they were hoping to…". Ask's
 * brief writes it as an order ("Ask what they were hoping to…"), which under the key read "Find out Ask what…".
 */
function findOut(ask: string): string {
  const rest = ask.replace(/^ask\s+(them\s+)?/i, "");
  return rest === ask || !rest ? ask : rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** One part of a call's notes: its key, and what it says, one line or a list. */
function NotesPart({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="ny-notes-part">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** A list in a call's notes: each thing on a line of its own, never run together with a dot that also separates. */
function NotesList({ items }: { items: readonly string[] }) {
  return (
    <ul className="ny-notes-list">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * A call's notes (the refined canvas, 31 Oct 2026): what to open with, what to mention, what to find out, what to avoid,
 * each on a key column. Read on the call and never sent, so it stands in the inset, never on a field, under a head that
 * says so ("Call notes · only you see these"): nothing in it is typed in, and the head says why before anyone wonders.
 * Notes for the member stand a step under the words that pass between them and the person (need-you.css).
 */
export function BriefBox({ brief, onRead = null }: { brief: CallBrief; onRead?: (() => void) | null }) {
  // A phone's card says the first thing to say, with Read for the rest, which the walk's sheet holds whole (his look on a
  // phone, 29 Oct 2026: the brief's own head stood over one line of it).
  if (onRead && brief.opening)
    return (
      <Panel variant="inset" size="sm" className="ny-draft" aria-label={W.brief.title}>
        <span className="ny-by">
          <AskMark />
          <span className="ny-by-words ny-notes-said ny-said">
            <b>{W.brief.say}</b> “{brief.opening}”
          </span>
          {readDoor(onRead)}
        </span>
      </Panel>
    );
  return (
    <Panel variant="inset" size="sm" className="ny-draft">
      <Head mark={<AskMark />} what={W.brief.title} by={W.brief.only}>
        {readDoor(onRead)}
      </Head>
      <dl className="ny-notes">
        {brief.opening ? (
          <NotesPart term={W.brief.say}>
            <span className="ny-notes-said">“{brief.opening}”</span>
          </NotesPart>
        ) : null}
        {brief.points.length ? (
          <NotesPart term={W.brief.points}>
            <NotesList items={brief.points} />
          </NotesPart>
        ) : null}
        {brief.ask ? <NotesPart term={W.brief.ask}>{findOut(brief.ask)}</NotesPart> : null}
        {brief.avoid.length ? (
          <NotesPart term={W.brief.avoid}>
            <NotesList items={brief.avoid} />
          </NotesPart>
        ) : null}
      </dl>
    </Panel>
  );
}

/**
 * Words read and not typed in here: their receptionist's reply going on its own (changed with Ask, never by hand),
 * their own words in the walk's sheet. In the inset, at the size the words between the member and the person are read at.
 */
export function Quote({ what, text }: { what: string; text: string }) {
  return (
    <Panel variant="inset" size="sm" className="ny-draft">
      <Head what={what} />
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
  letGo,
}: {
  who: string;
  label?: string;
  choices: readonly Pick<NotNowChoice, "label" | "when">[];
  caption: string | null;
  onOpen?: () => void;
  onChoose: (i: number) => void;
  busy?: boolean;
  /**
   * Not a person, under the times, where the row may be a program's mail and the member may say so (reply-work.tsx
   * notAPersonOf): never now, rather than not now. Absent everywhere else.
   */
  letGo?: (() => void) | null;
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
