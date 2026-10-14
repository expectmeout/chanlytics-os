/**
 * MoreMenu: the shared 3-dot popover (moved whole from data-bits.jsx, decision 0015: the kit's one implementation, which
 * seed-globals publishes as window.MoreMenu for the pages that still read it).
 *
 * items: [{ label, icon, onClick, danger, meta, gate } | { divider:true } | { header:"…" }]
 * Renders its own trigger button; closes on backdrop, Escape, or item click.
 * `gated` (a sentence) keeps the whole menu shut and says why; an item's `gate`
 * is window.gate(...)'s props, spread after its click, so a refused item stays in
 * the menu, says why when pressed, and leaves the menu open.
 * `escape` is for a menu opened inside a pane that scrolls (the People rail): see moreFit.
 * An item with `checked` (true or false) is one of a set: a menuitemradio, ticked when true. `metaBelow` draws its
 * `meta` as a line under the words (.more-item-two), where a sentence beside them would crowd them.
 * A long set opens with the one chosen in the middle of its list (or, with none chosen, the item marked `start`), so a
 * menu of the day's times opens on the time it holds. Opened from a key, focus goes to that item; the arrows, Home and
 * End walk the items, and Escape or a choice gives focus back to the trigger. `ariaLabel` names a trigger whose words
 * are not the whole of it ("Monday opens: 9:30 AM"), and `boxAttrs` are what a trigger that stands for a field carries
 * besides (its id, its value, aria-invalid and aria-describedby), as the kit's box does.
 * Every menu stands on the one ground everything that pops wears (kit.css, "What pops over the page"), so one that
 * opens over a log's coloured lines needs nothing of its own (its `solid` ground went on 10 Oct 2026).
 * On a phone (the kit's 900px) it is the kit Menu's bottom action sheet (kit.css), drawn on the document's body
 * (`data-sheet`), since a card that isolates its layers (.rec-card) held it under the tab bar. There a pull down from its
 * top lets it go, following the finger, as the kit Menu's does (data-bits touchSwipe): it drew the handle and did not
 * answer a pull. The touch stays its own (keepTouch), so a pull on a menu opened in a sheet does not pull the sheet too.
 * There a sentence beside an item's words (a `meta` or a `hint` longer than a few words) goes under them: at the line's
 * end it broke both onto two lines, or was cut (Ruben, 14 Oct 2026, the fitted sheets: a choice reads with what it does).
 * A `grid` menu is a set of short values (a day's times): on a phone they are chips four across under their headings,
 * the one held lit, so a time is one tap with no scroll through thirty rows; a heading marked `fold` keeps its group
 * shut behind it until it is pressed, or while its group holds the value (the night's hours, which few businesses keep).
 */
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gatedProps, keepTouch, onAPhone, touchSwipe } from "../../legacy-verbs";
import { Icon } from "../icon/icon";
import { can, pick, pickAll } from "../record/dom";

/** One item of the menu: a row that acts, a line between two groups, or a heading over the group under it. */
interface MoreMenuItem {
  label?: ReactNode;
  /** A glyph before the words (Icon's names). */
  icon?: string;
  onClick?: () => void;
  danger?: boolean;
  /** A second line beside the words, at the line's end; under them with `metaBelow`. */
  meta?: ReactNode;
  /** The second line under the words, for a sentence too long to stand beside them (what a choice gives). */
  metaBelow?: boolean;
  /** A word at the item's end. */
  hint?: ReactNode;
  /** What pressing does, on hover. */
  title?: string;
  /** One of a set (a sort, say): ticked when true, drawn on every one. */
  checked?: boolean;
  /** The honesty gate's props (`window.gate(...)`), spread after the item's click. */
  gate?: Record<string, unknown>;
  /** What the item stands for, where a set's items are values (a time, "09:30"): said as its `data-value`. */
  value?: string;
  /** Where a long set opens when none of it is chosen (a day's times: nine in the morning). */
  start?: boolean;
  divider?: boolean;
  header?: ReactNode;
  /** A heading whose group stays shut behind it in a `grid` menu on a phone, until pressed or while it holds the value. */
  fold?: boolean;
}

interface MoreMenuProps {
  items?: MoreMenuItem[];
  align?: "left" | "right";
  size?: number;
  title?: string;
  btnClass?: string;
  /** Words on the trigger, over its glyph. */
  label?: ReactNode;
  /** What the trigger draws in place of words and glyph: a record row's act, which keeps its own (RecordAct `wrap`). */
  face?: ReactNode;
  /** The trigger's glyph where the menu is not a "more". */
  icon?: string;
  /** A sentence: the whole menu stays shut and says why. */
  gated?: string | null;
  /** Placed against the window, for a menu opened inside a pane that scrolls. */
  escape?: boolean;
  testid?: string | null;
  /** The trigger's name, where its words are not the whole of it ("Monday opens: 9:30 AM"). */
  ariaLabel?: string;
  /** What a trigger that stands for a field carries besides: its id, its value, aria-invalid, aria-describedby. */
  boxAttrs?: Record<string, string | boolean | undefined>;
  /** A set of short values (a day's times): chips four across under their headings, on a phone. */
  grid?: boolean;
}

/** Past this many letters, a phone's menu says an item's second line under its words, not at the line's end. */
const MORE_SHORT_WORDS = 20;
const longWords = (n: ReactNode) => typeof n === "string" && n.length > MORE_SHORT_WORDS;

/** The keys that walk a menu's items, and where each goes from the one at `at` of `n`. */
const MORE_WALK: Record<string, (at: number, n: number) => number> = {
  ArrowDown: (at, n) => (at + 1) % n,
  ArrowUp: (at, n) => (at <= 0 ? n - 1 : at - 1),
  Home: () => 0,
  End: (_, n) => n - 1,
};

/**
 * Where a menu that escapes its pane hangs (MoreMenu `escape`). A pane that scrolls cuts off whatever crosses its
 * edge, so a menu in the People rail had to fit beside its trigger: 196px, where every other menu is 232 to 292, and
 * its words broke onto three to six lines. An escaped menu is placed against the window instead: under its trigger, on
 * the side `align` names, above the trigger when the window has more room there, and held inside the window. Where
 * neither side has room for all of it, it takes the room there is and scrolls (the room is its max-height). Until
 * placed it is drawn but not shown (.placed), so it never flashes at the window's corner.
 */
const MORE_EDGE = 8; // kept clear of the window's edges
const MORE_GAP = 8; // between trigger and menu, as .more-menu's own top: calc(100% + 8px)
const moreFit = (wrap: HTMLElement | null) => {
  if (!wrap || !canQuery(wrap)) return;
  const btn = wrap.querySelector<HTMLElement>(":scope > button");
  const menu = wrap.querySelector<HTMLElement>(":scope > .more-menu");
  if (
    !btn ||
    !menu ||
    typeof btn.getBoundingClientRect !== "function" ||
    typeof menu.getBoundingClientRect !== "function"
  )
    return;
  const t = btn.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  const from = menu.classList.contains("align-left") ? t.left : t.right - m.width;
  const left = Math.max(MORE_EDGE, Math.min(from, vw - MORE_EDGE - m.width));
  const below = vh - MORE_EDGE - (t.bottom + MORE_GAP);
  const above = t.top - MORE_GAP - MORE_EDGE;
  const up = below < m.height && above > below;
  const room = Math.max(96, up ? above : below);
  const height = Math.min(m.height, room);
  if (room < m.height) menu.style.maxHeight = `${Math.floor(room)}px`;
  const top = up ? Math.max(MORE_EDGE, t.top - MORE_GAP - height) : t.bottom + MORE_GAP;
  const put = (x: number, y: number) => {
    menu.style.left = `${Math.round(x)}px`;
    menu.style.top = `${Math.round(y)}px`;
  };
  put(left, top);
  // A transformed or filtered ancestor makes itself a fixed box's containing block and moves the menu with it; that
  // offset is taken back, so the menu lands where it was meant to whatever the page around it does.
  const got = menu.getBoundingClientRect();
  if (Math.round(got.left) !== Math.round(left) || Math.round(got.top) !== Math.round(top))
    put(2 * left - got.left, 2 * top - got.top);
  menu.classList.toggle("up", up);
  menu.classList.add("placed");
};

/**
 * Where a menu lands as it opens: a long set with the one chosen in the middle of its list, or the item marked to start
 * at, placed after the menu is (MoreMenu's first effect may have given it a height to scroll in). Opened from a key,
 * focus goes to that item, or to the first. The list scrolls in itself, never the page or the sheet under it.
 */
function useMoreLanding(open: boolean, menuRef: { current: HTMLDivElement | null }, byKey: { current: boolean }) {
  useEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu || !can(menu, "querySelector")) return;
    const at = pick(menu, '[aria-checked="true"]') || pick(menu, "[data-start]");
    if (at && menu.scrollHeight > menu.clientHeight)
      menu.scrollTop = Math.max(0, at.offsetTop - (menu.clientHeight - at.offsetHeight) / 2);
    if (byKey.current) (at || pick(menu, ".more-item"))?.focus();
  }, [open, menuRef, byKey]);
}

/** The arrows, Home and End walk a menu's items, round the ends. */
function moreWalk(e: { key: string; currentTarget: HTMLDivElement; preventDefault: () => void }) {
  const to = MORE_WALK[e.key];
  if (!to || !can(e.currentTarget, "querySelectorAll")) return;
  const items = Array.from(pickAll(e.currentTarget, ".more-item"));
  if (!items.length) return;
  e.preventDefault();
  items[to(items.indexOf(document.activeElement as HTMLElement), items.length)]?.focus();
}

/** How a menu is drawn: the item's press, whether it is a phone's sheet, and the headings of a grid opened to their group. */
interface MoreDraw {
  run: (it: MoreMenuItem) => void;
  sheet: boolean;
  open: (at: number) => void;
}

/** The entries a menu draws: in a phone's grid, a folded heading's group stays out until it is opened. */
function moreEntries(items: MoreMenuItem[], d: MoreDraw, grid: boolean, opened: ReadonlySet<number>) {
  const out: ReactNode[] = [];
  let shut = false;
  items.forEach((it, i) => {
    if (it.header || it.divider) shut = false;
    if (shut) return;
    if (it.header && it.fold && grid && d.sheet) {
      const group = items.slice(i + 1);
      const end = group.findIndex((g) => g.header || g.divider);
      const holds = (end < 0 ? group : group.slice(0, end)).some((g) => g.checked);
      if (!holds && !opened.has(i)) {
        shut = true;
        out.push(
          <button key={i} type="button" className="more-header more-header-fold" onClick={() => d.open(i)}>
            {it.header} <Icon name="chevron-down" size={10} />
          </button>,
        );
        return;
      }
    }
    out.push(moreItem(it, i, d));
  });
  return out;
}

/** One entry of a menu: a line between groups, a heading over the group under it, or an item that acts. */
function moreItem(it: MoreMenuItem, i: number, d: MoreDraw) {
  const { run, sheet } = d;
  if (it.divider) return <div key={i} className="more-divider" />;
  if (it.header)
    return (
      <div key={i} className="more-header">
        {it.header}
      </div>
    );
  // One of a set (a sort, say): a radio item with the tick drawn on every one, hidden where it is not the one chosen
  // (components.css), so the words stand in one column either way.
  const radio = typeof it.checked === "boolean";
  // On a phone a sentence goes under the words, where at the line's end it broke them or was cut.
  const hintUnder = sheet && longWords(it.hint);
  const two = (it.meta && (it.metaBelow || (sheet && longWords(it.meta)))) || hintUnder;
  return (
    <button
      key={i}
      className={`more-item${it.danger ? " danger" : ""}${two ? " more-item-two" : ""}`}
      role={radio ? "menuitemradio" : "menuitem"}
      aria-checked={radio ? it.checked : undefined}
      title={it.title || undefined}
      data-value={it.value}
      data-start={it.start ? "" : undefined}
      onClick={() => run(it)}
      {...(it.gate || {})}
    >
      {radio ? <Icon name="check" size={13} /> : it.icon && <Icon name={it.icon} size={13} />}
      <span className="more-item-label">{it.label}</span>
      {it.meta && <span className="more-item-meta">{it.meta}</span>}
      {it.hint && <span className={hintUnder ? "more-item-meta" : "more-item-hint"}>{it.hint}</span>}
    </button>
  );
}

/** Whether a node can be asked for its parts: an element, or a stand-in that answers `querySelector`. */
const canQuery = (n: object): boolean => typeof Reflect.get(n, "querySelector") === "function";

/** Only a node can be inside the menu: a resize's target is the window, which contains() refuses with a throw. */
const isNode = (t: EventTarget): t is Node => typeof Reflect.get(t, "nodeType") === "number";

// `icon` is the trigger's glyph where the menu is not a "more": Leads' Call opens the ways of calling, and a ⋯
// there would hide what the button is for.
export function MoreMenu({
  items = [],
  align = "right",
  size = 13,
  title = "More",
  btnClass = "btn btn-ghost btn-icon btn-sm",
  label = null,
  face = null,
  icon = "more",
  gated = null,
  escape = false,
  testid = null,
  ariaLabel,
  boxAttrs,
  grid = false,
}: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  // The folded headings of a grid opened to their group, while the menu is open.
  const [opened, setOpened] = useState<ReadonlySet<number>>(() => new Set());
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Whether the menu was opened from a key (a click a key made counts no presses): then focus goes into it.
  const byKey = useRef(false);
  const shut = () => {
    setOpen(false);
    const btn = btnRef.current;
    if (btn && typeof btn.focus === "function") btn.focus();
  };
  // A phone's menu is a sheet from the foot, on the body: read as it opens, the width it opened at.
  const sheet = open && onAPhone() && typeof document !== "undefined";

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Focus goes back to the trigger the menu came from (shut, below, which a choice takes).
      const btn = btnRef.current;
      if (btn && typeof btn.focus === "function") btn.focus();
    };
    window.addEventListener("keydown", onKey);
    // A sheet stands at the foot over its wash: nothing behind it scrolls it away, and nothing places it.
    if (!escape || sheet) return () => window.removeEventListener("keydown", onKey);
    // Placed against the window, an escaped menu would stay put while the page under it moved, so a scroll anywhere
    // but inside the menu itself, or a resize, closes it rather than leave it beside the wrong row. Only a node can be
    // inside it: a resize's target is the window, which contains() refuses with a throw.
    const wrap = wrapRef.current;
    moreFit(wrap);
    const menu = wrap && canQuery(wrap) ? wrap.querySelector(":scope > .more-menu") : null;
    const inside = (t: EventTarget | null | undefined) =>
      !!(menu && t && isNode(t) && typeof menu.contains === "function" && menu.contains(t));
    const onMove = (e?: Event) => {
      if (!inside(e && e.target)) setOpen(false);
    };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, escape, sheet]);

  useMoreLanding(open, menuRef, byKey);

  const run = (it: MoreMenuItem) => {
    // Synchronous: fire the action, then close. Deferring the action behind a
    // timeout let a re-render/close race swallow clicks on lower items.
    if (it.onClick) it.onClick();
    shut();
  };

  // What opens: the wash a press outside closes it through, and the menu.
  const pop = open ? (
    <>
      <div
        className="more-backdrop"
        role="presentation"
        data-sheet={sheet ? "" : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(false);
        }}
      />
      {/* eslint-disable-next-line jsx-a11y-x/interactive-supports-focus -- kept as the JSX drew it: the click is only kept from reaching what is under the menu; its items are the buttons, which the keys walk */}
      <div
        ref={menuRef}
        className={`more-menu ${align === "left" ? "align-left" : "align-right"}${escape ? " escape" : ""}${grid ? " more-menu-grid" : ""}`}
        role="menu"
        data-sheet={sheet ? "" : undefined}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={moreWalk}
        {...(sheet ? keepTouch(touchSwipe({ onDown: () => setOpen(false), when: onAPhone })) : {})}
      >
        {moreEntries(items, { run, sheet, open: (at) => setOpened(new Set([...opened, at])) }, grid, opened)}
      </div>
    </>
  ) : null;

  return (
    <div className="more-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        className={btnClass}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testid || undefined}
        {...(boxAttrs || {})}
        onClick={(e) => {
          e.stopPropagation();
          byKey.current = e.detail === 0;
          setOpened(new Set());
          setOpen((v) => !v);
        }}
        {...(gated ? gatedProps(gated) : {})}
      >
        {face ? (
          face
        ) : label ? (
          <>
            {label} <Icon name="chevron-down" size={10} />
          </>
        ) : (
          <Icon name={icon} size={size} />
        )}
      </button>
      {sheet ? createPortal(pop, document.body) : pop}
    </div>
  );
}
