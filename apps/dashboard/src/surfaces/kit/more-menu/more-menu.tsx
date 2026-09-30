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
 * An item with `checked` (true or false) is one of a set: a menuitemradio, ticked when true.
 */
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { gatedProps } from "../../legacy-verbs";
import { Icon } from "../icon/icon";

/** One item of the menu: a row that acts, a line between two groups, or a heading over the group under it. */
export interface MoreMenuItem {
  label?: ReactNode;
  /** A glyph before the words (Icon's names). */
  icon?: string;
  onClick?: () => void;
  danger?: boolean;
  /** A second line under the words. */
  meta?: ReactNode;
  /** A word at the item's end. */
  hint?: ReactNode;
  /** What pressing does, on hover. */
  title?: string;
  /** One of a set (a sort, say): ticked when true, drawn on every one. */
  checked?: boolean;
  /** The honesty gate's props (`window.gate(...)`), spread after the item's click. */
  gate?: Record<string, unknown>;
  divider?: boolean;
  header?: ReactNode;
}

interface MoreMenuProps {
  items?: MoreMenuItem[];
  align?: "left" | "right";
  size?: number;
  title?: string;
  btnClass?: string;
  /** Words on the trigger, over its glyph. */
  label?: ReactNode;
  /** The trigger's glyph where the menu is not a "more". */
  icon?: string;
  /** A sentence: the whole menu stays shut and says why. */
  gated?: string | null;
  /** Placed against the window, for a menu opened inside a pane that scrolls. */
  escape?: boolean;
  testid?: string | null;
}

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
  icon = "more",
  gated = null,
  escape = false,
  testid = null,
}: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    if (!escape) return () => window.removeEventListener("keydown", onKey);
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
  }, [open, escape]);

  const run = (it: MoreMenuItem) => {
    // Synchronous: fire the action, then close. Deferring the action behind a
    // timeout let a re-render/close race swallow clicks on lower items.
    if (it.onClick) it.onClick();
    setOpen(false);
  };

  return (
    <div className="more-wrap" ref={wrapRef}>
      <button
        className={btnClass}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testid || undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        {...(gated ? gatedProps(gated) : {})}
      >
        {label ? (
          <>
            {label} <Icon name="chevron-down" size={10} />
          </>
        ) : (
          <Icon name={icon} size={size} />
        )}
      </button>
      {open && (
        <>
          <div
            className="more-backdrop"
            role="presentation"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          {/* eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/interactive-supports-focus -- kept as the JSX drew it: the click is only kept from reaching what is under the menu; its items are the buttons */}
          <div
            className={`more-menu ${align === "left" ? "align-left" : "align-right"}${escape ? " escape" : ""}`}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((it, i) => {
              if (it.divider) return <div key={i} className="more-divider" />;
              if (it.header)
                return (
                  <div key={i} className="more-header">
                    {it.header}
                  </div>
                );
              // One of a set (a sort, say): a radio item with the tick drawn on every one, hidden where it is not the
              // one chosen (components.css), so the words stand in one column either way.
              const radio = typeof it.checked === "boolean";
              return (
                <button
                  key={i}
                  className={`more-item ${it.danger ? "danger" : ""}`}
                  role={radio ? "menuitemradio" : "menuitem"}
                  aria-checked={radio ? it.checked : undefined}
                  title={it.title || undefined}
                  onClick={() => run(it)}
                  {...(it.gate || {})}
                >
                  {radio ? <Icon name="check" size={13} /> : it.icon && <Icon name={it.icon} size={13} />}
                  <span className="more-item-label">{it.label}</span>
                  {it.meta && <span className="more-item-meta">{it.meta}</span>}
                  {it.hint && <span className="more-item-hint">{it.hint}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
