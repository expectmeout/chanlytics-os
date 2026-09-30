/**
 * One drawing for a language, and the picker every list on Campaigns opens from (moved from
 * legacy/components/campaign-bits.jsx, decision 0015).
 *
 * The picker's body was one 230-line component; the function limits split it into plain helpers, with every hook still
 * called in the order it was: the four cells of state and the five refs (`useLpState`), then the placement effect and
 * the scroll effect.
 */
import { useEffect, useRef, useState } from "react";
import type { Dispatch, KeyboardEvent, ReactNode, RefObject, SetStateAction } from "react";
import ReactDOM from "react-dom";
import { stateOf } from "@chanlytics/contracts";
import type { TemplateLanguage } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { starters } from "../templates/verbs";

/**
 * One language of one message, drawn: filled when WhatsApp approved it, dotted
 * while WhatsApp reads it, struck through when WhatsApp refused it, and an open
 * dashed ring for a language the message does not exist in. The colour is the
 * vocabulary's (tone.ts); `status` null is absence.
 */
const CmLangGlyph = ({ status = null, size = 12 }: { status?: string | null; size?: number }) => {
  const said = status ? stateOf("template", status) : null;
  const tone = said ? said.tone : "none";
  return (
    <svg className="cm-lang-glyph" data-tone={tone} width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <circle
        cx="7"
        cy="7"
        r="5.1"
        fill={tone === "ok" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray={!said ? "2 2.1" : tone === "info" ? "1.3 2.3" : undefined}
      />
      {tone === "danger" && (
        <path d="M3.8 10.2 L10.2 3.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      )}
    </svg>
  );
};

/* ---- The language picker ------------------------------------------------------
   A message is one thing in every language it has, so it has ONE language
   control: a chip that says the language in view and opens every language
   there is -- the ones WhatsApp holds, with their state; the ones the starter
   library has written; and every other language WhatsApp takes -- found by
   typing a name in English or in its own words, a place, or a code. It was a
   slot per language on every row, "EN ES" down a page of sixteen messages, and
   a language nobody had written could not be reached from it at all. */

/** One line the list offers. The rest is `TemplateLanguage`'s where the choice is a language. */
interface PickerChoice {
  id: string;
  label: string;
  name?: string;
  native?: string;
  group?: string;
  /** A status at WhatsApp, null for "not on WhatsApp", absent for no glyph. */
  status?: string | null;
  /** What stands at the right of it, in place of its state or its own name; null for nothing. */
  hint?: string | null;
  /** A glyph in place of the language's state. */
  icon?: string;
  /** A line under its label. */
  sub?: string;
}

/** What a list of something other than languages says of its search. */
interface PickerSearchWords {
  placeholder?: string;
  empty?: (q: string) => ReactNode;
}

/**
 * value     the language in view: "en_US"
 * choices   [{ id, label, name, native, group?, status? }] -- contracts messageLanguageChoices, or any list of languages
 * groups    the headings by group ({ on: "On WhatsApp", ... }); a group with none has none
 * onPick    (id, choice) when a language is chosen
 * status    the glyph for the language in view: a status, null for "not on WhatsApp", undefined for no glyph
 * tag       the chip's letters: "EN"
 * more      how many more languages the message has, said "+1" beside the letters
 * display   "tag" (the letters) or "label" (the words, with a globe: a form's field)
 * label     what the control is for, for a screen reader: "Language for Win-back"
 * search    whether to offer the search box; by default when there are more than seven
 * note      one line under the list: why something is not offered
 * size      "md", or "sm" for a chip inside a chip
 *
 * It is the one list that opens from a control on Campaigns, so it lists more
 * than languages -- a playbook's moment and its message open it too:
 *
 * face         what the control shows instead of the letters: a moment with its glyph, a message's title
 * fit          "trigger": the list as wide as its control, under it
 * triggerClass the control's own class beside the picker's
 * searchWords  { placeholder, empty(q) } for a list of something other than languages
 * and a choice may carry `icon` (a glyph in place of the language's state) and `sub` (a line under its label).
 */
interface PickerProps {
  value?: string | null;
  choices?: readonly PickerChoice[];
  groups?: Readonly<Record<string, string>>;
  onPick?: (id: string, choice: PickerChoice) => void;
  status?: string | null;
  tag?: string | null;
  more?: number;
  display?: "tag" | "label";
  label?: string;
  search?: boolean | null;
  searchWords?: PickerSearchWords | null;
  note?: ReactNode;
  size?: string;
  face?: ReactNode;
  fit?: "trigger" | null;
  triggerClass?: string;
  disabled?: boolean;
  testid?: string | null;
}

/** The props with the picker's defaults put in: every one is what the JSX's parameter list said. */
interface LpProps {
  value: string | null | undefined;
  choices: readonly PickerChoice[];
  groups: Readonly<Record<string, string>>;
  onPick: ((id: string, choice: PickerChoice) => void) | undefined;
  status: string | null | undefined;
  tag: string | null;
  more: number;
  display: "tag" | "label";
  label: string;
  search: boolean | null;
  searchWords: PickerSearchWords | null;
  note: ReactNode;
  size: string;
  face: ReactNode;
  fit: "trigger" | null;
  triggerClass: string;
  disabled: boolean;
  testid: string | null;
}

function lpProps(props: PickerProps): LpProps {
  const {
    value,
    choices = [],
    groups = {},
    onPick,
    status,
    tag = null,
    more = 0,
    display = "tag",
    label = "Language",
    search = null,
    searchWords = null,
    note = null,
    size = "md",
    face = null,
    fit = null,
    triggerClass = "",
    disabled = false,
    testid = null,
  } = props;
  return {
    value,
    choices,
    groups,
    onPick,
    status,
    tag,
    more,
    display,
    label,
    search,
    searchWords,
    note,
    size,
    face,
    fit,
    triggerClass,
    disabled,
    testid,
  };
}

// Under a thumb the list is a sheet from the foot of the screen: the width at
// which mobile.css makes the shell a phone.
const LP_SHEET = "(max-width: 720px)";
const lpSheet = () => {
  try {
    return !!(window.matchMedia && window.matchMedia(LP_SHEET).matches);
  } catch {
    return false;
  }
};
// The contracts' search (findLanguages): a code, an English name, the language's
// own name, a place. It reads a choice's id, label, name and native; a place is
// not read, so a choice that is not a language may stand in as one.
const lpFind = (q: string, list: readonly PickerChoice[]): PickerChoice[] =>
  starters.findLanguages(q, list as readonly (PickerChoice & TemplateLanguage)[]);
// What stands at the right of a language: its state at WhatsApp in the app's one
// vocabulary (tone.ts), else its own name when that
// is not its English one -- "Deutsch" beside German, nothing beside English.
const lpSaid = (status: string | null | undefined) => (status ? stateOf("template", status).label : null);
const lpHint = (c: PickerChoice) =>
  c.hint !== undefined ? c.hint : c.status ? lpSaid(c.status) : c.native && c.native !== c.name ? c.native : null;
const lpTone = (status: string | null | undefined) => {
  if (status === undefined) return undefined;
  const said = status ? stateOf("template", status) : null;
  return said ? said.tone : "none";
};
// The list goes on the document's body, so nothing it opens from can clip it -- or, opened inside a modal (the
// playbook composer's sheet), on the modal: a screen reader keeps to a modal dialog, and a list drawn outside it
// could not be reached.
const lpHost = (el: HTMLElement | null): Element | null =>
  (el && el.closest ? el.closest('[aria-modal="true"]') : null) || document.body;
const lpPortal = (node: ReactNode, host: Element | null): ReactNode =>
  host ? ReactDOM.createPortal(node, host) : node;
let lpSeq = 0;

/** Where the list goes: a sheet under a thumb, else a box by its chip; nothing before the chip is there to measure. */
interface LpPos {
  sheet?: boolean;
  left?: number;
  top?: number;
  bottom?: number;
  width?: number;
  maxHeight?: number;
}

/** What the picker holds between draws: what it has open, what is typed, which option the keys are on, and its nodes. */
interface LpState {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  typed: string;
  setQ: Dispatch<SetStateAction<string>>;
  active: number;
  setActive: Dispatch<SetStateAction<number>>;
  pos: LpPos | null;
  setPos: Dispatch<SetStateAction<LpPos | null>>;
  trigger: RefObject<HTMLButtonElement | null>;
  pop: RefObject<HTMLDivElement | null>;
  input: RefObject<HTMLInputElement | null>;
  list: RefObject<HTMLDivElement | null>;
  uid: RefObject<string | null>;
}

function useLpState(): LpState {
  const [open, setOpen] = useState(false);
  const [typed, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<LpPos | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const pop = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const uid = useRef<string | null>(null);
  if (uid.current === null) uid.current = `lp${++lpSeq}`;
  return { open, setOpen, typed, setQ, active, setActive, pos, setPos, trigger, pop, input, list, uid };
}

interface LpSection {
  group: string;
  items: { c: PickerChoice; i: number }[];
}

/** What the picker draws from what it holds: the words typed, the choices the search left, and where they sit. */
interface LpView {
  q: string;
  searching: boolean;
  shown: PickerChoice[];
  current: PickerChoice | null;
  words: string | null | undefined;
  sections: LpSection[];
  onActive: string | undefined;
  sheet: boolean;
  optId: (i: number) => string;
}

// What the search finds, kept in its groups: a match's rank decides its place
// WITHIN a group, and the groups keep their order, so a heading never repeats.
function lpShown(choices: readonly PickerChoice[], q: string, searching: boolean): PickerChoice[] {
  const order = [...new Set(choices.map((c) => c.group || ""))];
  const found = searching && q.trim() ? lpFind(q, choices) : choices;
  const rank = new Map(found.map((c, i) => [c.id, i]));
  return found
    .slice()
    .sort(
      (a, b) =>
        order.indexOf(a.group || "") - order.indexOf(b.group || "") || Number(rank.get(a.id)) - Number(rank.get(b.id)),
    );
}

function lpSections(shown: PickerChoice[]): LpSection[] {
  const sections: LpSection[] = [];
  shown.forEach((c, i) => {
    const g = c.group || "";
    const at = sections[sections.length - 1];
    if (at && at.group === g) at.items.push({ c, i });
    else sections.push({ group: g, items: [{ c, i }] });
  });
  return sections;
}

function lpView(p: LpProps, st: LpState): LpView {
  // Always words, whatever the cell was handed.
  const q = typeof st.typed === "string" ? st.typed : "";
  const searching = p.search === null ? p.choices.length > 7 : !!p.search;
  const shown = lpShown(p.choices, q, searching);
  const current = p.choices.find((c) => c.id === p.value) || null;
  const words =
    p.display === "label"
      ? current
        ? current.label
        : p.value
      : p.tag ||
        String(p.value || "")
          .slice(0, 2)
          .toUpperCase();
  const optId = (i: number) => `${st.uid.current}-o${i}`;
  const onActive = shown[Math.min(st.active, shown.length - 1)]
    ? optId(Math.min(st.active, shown.length - 1))
    : undefined;
  return {
    q,
    searching,
    shown,
    current,
    words,
    sections: lpSections(shown),
    onActive,
    sheet: !!(st.pos && st.pos.sheet),
    optId,
  };
}

// Where the list goes: under its chip, or over it when the room is above; a
// sheet under a thumb. Measured as it opens, so its first frame is already in
// place -- a list drawn hidden until an effect placed it could not take the
// focus the search box needs, and the first keys typed went nowhere.
function lpMeasure(t: HTMLElement | null, o: { fit: string | null; size: string; display: string }): LpPos | null {
  if (lpSheet()) return { sheet: true };
  if (!t || !t.getBoundingClientRect) return null;
  const r = t.getBoundingClientRect();
  const vw = window.innerWidth || 1024;
  const vh = window.innerHeight || 768;
  const width = Math.min(o.fit === "trigger" ? Math.max(r.width, 260) : o.size === "sm" ? 256 : 304, vw - 16);
  const left = Math.max(
    8,
    Math.min(o.display === "label" || o.fit === "trigger" ? r.left : r.left - 6, vw - width - 8),
  );
  const below = vh - r.bottom - 16;
  const above = r.top - 16;
  const up = below < 260 && above > below;
  const maxHeight = Math.max(180, Math.min(420, up ? above : below));
  return up ? { left, width, maxHeight, bottom: vh - r.top + 6 } : { left, width, maxHeight, top: r.bottom + 6 };
}

/** What the picker does: close, choose, open and shut, and measure where its list goes. */
interface LpActions {
  close: (back: boolean) => void;
  choose: (c: PickerChoice | undefined) => void;
  measure: () => LpPos | null;
  toggle: () => void;
}

function lpActions(p: LpProps, st: LpState): LpActions {
  const { setOpen, setQ, setPos, setActive, trigger } = st;
  const close = (back: boolean) => {
    setOpen(false);
    setQ("");
    setPos(null);
    if (back && trigger.current && trigger.current.focus) trigger.current.focus();
  };
  const choose = (c: PickerChoice | undefined) => {
    if (!c) return;
    close(true);
    if (p.onPick) p.onPick(c.id, c);
  };
  const measure = () => lpMeasure(trigger.current, { fit: p.fit, size: p.size, display: p.display });
  const toggle = () => {
    if (p.disabled) return;
    if (st.open) {
      close(false);
      return;
    }
    setQ("");
    setActive(
      Math.max(
        0,
        p.choices.findIndex((c) => c.id === p.value),
      ),
    );
    setPos(measure());
    setOpen(true);
  };
  return { close, choose, measure, toggle };
}

/** Whether a position is the one before it: moved only when it moved. */
function lpSame(a: LpPos | null, b: LpPos | null): boolean {
  return !!(a && b) && (["left", "top", "bottom", "width", "maxHeight", "sheet"] as const).every((k) => a[k] === b[k]);
}

// Open: kept in place while anything scrolls or the window changes, closed by
// a press anywhere else -- a listener on the document, because a backdrop
// cannot cover the page from inside a list that is its own container -- and
// the search box takes the keys at once, except under a thumb, where a
// keyboard over half the sheet is not what a tap asked for.
function useLpOpen(p: LpProps, st: LpState, act: LpActions, searching: boolean) {
  const { open, pop, trigger, input, list, setPos } = st;
  const { display, size, fit } = p;
  const { close, measure } = act;
  useEffect(() => {
    if (!open) return undefined;
    const sheet = lpSheet();
    // Moved only when it moved: scrolling the list itself is not the page moving,
    // and a scroll tick that changed nothing redraws nothing.
    const place = () => {
      const at = measure();
      if (at) setPos((was) => (lpSame(was, at) ? was : at));
    };
    const onScroll = (e: Event) => {
      if (pop.current && pop.current.contains && pop.current.contains(e.target as Node | null)) return;
      place();
    };
    const onDown = (e: PointerEvent) => {
      const within = (el: Element | null) => !!(el && el.contains && el.contains(e.target as Node | null));
      if (!within(pop.current) && !within(trigger.current)) close(false);
    };
    // Esc closes it wherever the focus went; inside the list the list's own keys take it first.
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onEsc);
    document.addEventListener("pointerdown", onDown, true);
    const focus = () => {
      const el = searching && !sheet ? input.current : list.current;
      if (el && el.focus) el.focus({ preventScroll: true });
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(focus);
    else focus();
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onEsc);
      document.removeEventListener("pointerdown", onDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure is this draw's; the listeners live while it is open
  }, [open, display, searching, size, fit]);
}

// The option the keys are on stays in sight as the arrows walk the list.
function useLpScroll(st: LpState, q: string) {
  const { open, active, uid } = st;
  useEffect(() => {
    if (!open || !document.getElementById) return;
    const el = document.getElementById(`${uid.current}-o${active}`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as the JSX had it: uid is a ref, and does not move
  }, [open, active, q]);
}

/** The list's own keys: the arrows and the pages walk it, Enter chooses, Escape and Tab go back to the control. */
function lpKeys(st: LpState, v: LpView, act: LpActions) {
  const { setActive, input, active } = st;
  const { close, choose } = act;
  return (e: KeyboardEvent<HTMLElement>) => {
    const last = v.shown.length - 1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, last));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "PageDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 8, last));
    } else if (e.key === "PageUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 8, 0));
    } else if ((e.key === "Home" || e.key === "End") && e.target !== input.current) {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : last);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(v.shown[Math.min(active, last)]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
    // Back to its control, and the key goes on from there: the next stop is the one after the control, as a select's is.
    else if (e.key === "Tab") close(true);
  };
}

/** Everything the picker's parts read: its props, what it holds, what it draws, and what it does. */
interface LpCtx {
  p: LpProps;
  st: LpState;
  v: LpView;
  act: LpActions;
}

/** The control's own keys: open, the list takes them once it has the focus, but one pressed before then is still its. */
function lpTriggerKeys(c: LpCtx) {
  const { st, act } = c;
  const { open } = st;
  const { close } = act;
  return (e: KeyboardEvent<HTMLElement>) => {
    // Open, the list takes the keys once it has the focus; a key pressed on the control before then is still
    // the list's. Escape here closed the sheet the control sits in, and Tab left the list open behind it.
    if (open) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      } else if (e.key === "Tab") close(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      act.toggle();
    }
  };
}

/** The chip: the language in view, its glyph and how many more, over the caret that opens the list. */
function lpTriggerFace(c: LpCtx) {
  const { p, v } = c;
  return (
    <>
      {p.display === "label" ? (
        <Icon name="globe" size={13} />
      ) : p.status !== undefined ? (
        <CmLangGlyph status={p.status} size={12} />
      ) : null}
      <span className="lp-words">{v.words}</span>
      {p.more > 0 && (
        <span className="lp-more tally" aria-hidden="true">
          +{p.more}
        </span>
      )}
    </>
  );
}

function lpTrigger(c: LpCtx) {
  const { p, st, v, act } = c;
  const { display, face, size, triggerClass, label, more, testid, disabled, status } = p;
  const { open, trigger } = st;
  const { current, words } = v;
  return (
    <button
      ref={trigger}
      type="button"
      className={`lp-trigger lp-${size}${display === "label" ? " lp-as-label" : ""}${face ? " lp-as-face" : ""}${triggerClass ? ` ${triggerClass}` : ""}${open ? " is-open" : ""}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={`${label}: ${current ? current.label : words}${more > 0 ? `, and ${more} more` : ""}`}
      disabled={disabled}
      onClick={(e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        act.toggle();
      }}
      onKeyDown={lpTriggerKeys(c)}
      data-tone={lpTone(status)}
      data-testid={testid || undefined}
    >
      {face || lpTriggerFace(c)}
      <span className="lp-caret" aria-hidden="true">
        <Icon name="chevron-down" size={10} />
      </span>
    </button>
  );
}

/** The search box over the list: what is typed narrows it, and a clear button empties it. */
function lpSearch(c: LpCtx) {
  const { p, st, v } = c;
  const { searchWords, testid } = p;
  const { input, uid, setQ, setActive } = st;
  const { q, onActive } = v;
  return (
    <div className="lp-search">
      <Icon name="search" size={14} />
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls={`${uid.current}-list`}
        aria-autocomplete="list"
        aria-activedescendant={onActive}
        aria-label={(searchWords && searchWords.placeholder) || "Search languages"}
        placeholder={(searchWords && searchWords.placeholder) || "Search languages"}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        spellCheck={false}
        autoComplete="off"
        data-testid={testid ? `${testid}-search` : undefined}
      />
      {q && (
        <button
          type="button"
          className="lp-clear"
          aria-label="Clear the search"
          onClick={() => {
            setQ("");
            setActive(0);
            if (input.current && input.current.focus) input.current.focus();
          }}
        >
          <Icon name="x" size={12} />
        </button>
      )}
    </div>
  );
}

/** One option: its mark, its words, what stands at its right and its tick. */
function lpOption(c: LpCtx, ch: PickerChoice, i: number) {
  const { p, st, v, act } = c;
  const { value, testid } = p;
  const { active, setActive } = st;
  const hint = lpHint(ch);
  return (
    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/interactive-supports-focus -- as the JSX drew it (decision 0015)
    <div
      key={ch.id}
      id={v.optId(i)}
      role="option"
      aria-selected={ch.id === value}
      className={`lp-opt${i === active ? " is-active" : ""}${ch.id === value ? " is-on" : ""}${ch.sub ? " has-sub" : ""}`}
      onMouseMove={() => {
        if (i !== active) setActive(i);
      }}
      onClick={() => act.choose(ch)}
      data-lang={ch.id}
      data-group={ch.group || undefined}
      data-testid={testid ? `${testid}-option` : undefined}
    >
      <span className="lp-opt-mark" aria-hidden="true">
        {ch.icon ? (
          <Icon name={ch.icon} size={14} />
        ) : ch.status !== undefined ? (
          <CmLangGlyph status={ch.status} size={12} />
        ) : null}
      </span>
      <span className="lp-opt-label">
        {ch.sub ? (
          <>
            <span className="lp-opt-main">{ch.label}</span>
            <span className="lp-opt-sub">{ch.sub}</span>
          </>
        ) : (
          ch.label
        )}
      </span>
      {hint && (
        <span className="lp-opt-hint" data-tone={ch.status ? lpTone(ch.status) : undefined}>
          {hint}
        </span>
      )}
      <span className="lp-opt-check" aria-hidden="true">
        {ch.id === value ? <Icon name="check" size={14} /> : null}
      </span>
    </div>
  );
}

/** The list: its groups under their headings, or the one line that says nothing matched. */
function lpList(c: LpCtx) {
  const { p, st, v } = c;
  const { groups, label, searchWords } = p;
  const { list, uid } = st;
  const { sections, onActive, shown, q } = v;
  return (
    <div
      ref={list}
      className="lp-list"
      id={`${uid.current}-list`}
      role="listbox"
      aria-label={label}
      aria-activedescendant={onActive}
      tabIndex={-1}
    >
      {sections.map((sec) => (
        <div className="lp-group" role="group" aria-label={groups[sec.group] || undefined} key={sec.group || "all"}>
          {groups[sec.group] && (
            <div className="lp-group-head" aria-hidden="true">
              {groups[sec.group]}
            </div>
          )}
          {sec.items.map(({ c: ch, i }) => lpOption(c, ch, i))}
        </div>
      ))}
      {shown.length === 0 && (
        <div className="lp-empty" role="status">
          {searchWords && searchWords.empty ? searchWords.empty(q.trim()) : <>No language called “{q.trim()}”</>}
        </div>
      )}
    </div>
  );
}

/** The list a press opens: a sheet's backdrop where it is a sheet, then the box with its search, its options and its note. */
function lpPop(c: LpCtx, onKey: (e: KeyboardEvent<HTMLElement>) => void) {
  const { p, st, v, act } = c;
  const { size, label, testid, note } = p;
  const { pop, pos } = st;
  const { sheet, searching } = v;
  return (
    <>
      {sheet && <div className="lp-backdrop" onClick={() => act.close(false)} aria-hidden="true" />}
      {/* eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions -- as the JSX drew it (decision 0015) */}
      <div
        ref={pop}
        className={`lp-pop lp-pop-${size}${sheet ? " is-sheet" : ""}`}
        style={
          pos && !pos.sheet
            ? { left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight }
            : undefined
        }
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKey}
        data-testid={testid ? `${testid}-pop` : undefined}
      >
        {searching && lpSearch(c)}
        {lpList(c)}
        {note && (
          <p className="lp-note" data-testid={testid ? `${testid}-note` : undefined}>
            {note}
          </p>
        )}
      </div>
    </>
  );
}

/**
 * The language picker: a chip that says the language in view and opens the list of every one there is (and, for the
 * pages that open it on something else, of any list).
 */
export function CmPicker(props: PickerProps) {
  const p = lpProps(props);
  const st = useLpState();
  const v = lpView(p, st);
  const act = lpActions(p, st);
  useLpOpen(p, st, act, v.searching);
  useLpScroll(st, v.q);
  const onKey = lpKeys(st, v, act);
  const c: LpCtx = { p, st, v, act };
  return (
    <>
      {lpTrigger(c)}
      {st.open && lpPortal(lpPop(c, onKey), lpHost(st.trigger.current))}
    </>
  );
}

// The picker was made for a message's languages, and a language is still what it opens on by default.
export const LanguagePicker = CmPicker;
