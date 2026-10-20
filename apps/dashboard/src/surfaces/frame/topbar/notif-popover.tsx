/**
 * The bell's notes (moved from legacy/components/topbar.jsx, the one-system plan's step 7d): each one a single press that
 * does what it says, two lines and a time, the way the Inbox's rows read. Notes of one kind are said once ("9 calls",
 * contracts bellSections through the bell's own `sections`) and open with a press. On a phone the notes are a sheet from
 * the bottom, as every other sheet there is (components.css, the bell's sheet), and a thumb slides a note away or marks
 * it read. The frame's JSX and bell-rows.test draw it by its old name (`NotifPopover`, frame-globals.ts) until the frame
 * itself is TypeScript (step 7e). Drawn as the JSX drew it, raw buttons and all, until the frame's kit step.
 */
import { Fragment, useEffect, useRef, useState } from "react";
import type { MouseEvent, RefObject } from "react";
import type { BellRow } from "@/legacy-bridge/notifications";
import { frameBell, frameGlyph, frameRecordSwitch } from "../frame-window";

/** A note the bell draws: the server's row (BellRow), or the demo's seeded one. */
export interface BellNote {
  id: string;
  icon: string;
  tone: string;
  unread: boolean;
  time: string;
  title: string;
  message: string;
  actions?: ReadonlyArray<{ label: string; to: string; primary?: boolean }>;
  kind?: string;
  about?: { type: string; id: string } | null;
}

interface BellLine {
  key: string;
  row: BellNote;
  count: number;
  title: string | null;
  members: BellNote[];
}

/** This device's alerts: whether they can be, whether they are on, and what the browser said. */
export interface BellAlerts {
  on: boolean;
  can: boolean;
  permission: string;
}

const tbnPhone = () => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);
/** A note's one press: its primary act, else its first. */
const tbnVerb = (n: BellNote) => (n.actions || []).find((a) => a.primary) || (n.actions || [])[0] || null;
const tbnSections = (items: BellNote[]): Array<{ label: string; lines: BellLine[] }> => {
  const bell = frameBell();
  if (bell && bell.sections) return bell.sections(items as BellRow[]);
  // The mockup's own bell has no grouping: its notes stand one to a line, new above earlier.
  const one = (n: BellNote): BellLine => ({ key: n.id, row: n, count: 1, title: null, members: [n] });
  return [
    { label: "New", lines: items.filter((n) => n.unread).map(one) },
    { label: "Earlier", lines: items.filter((n) => !n.unread).map(one) },
  ].filter((s) => s.lines.length > 0);
};

// A dismissed note folds shut over this long (components.css .tbn-slot), so the notes under it glide up, then it goes.
const TBN_FOLD_MS = 200;
// While a thumb carries a note, its slot says which way (kit/motion/swipe.ts touchSwipe onGrab): the ground for that way
// shows under it, Mark read to the right and Dismiss to the left; at rest the note stands on the sheet's glass with neither.
const tbnMoving = (el: Element | null, on: boolean, way?: string) => {
  const slot = el && el.parentElement;
  if (!slot) return;
  if (on) slot.setAttribute("data-moving", way === "back" ? "read" : "dismiss");
  else slot.removeAttribute("data-moving");
};
const tbnReduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

// Escape closes what is drawn, for as long as it is drawn, and leaves a key an earlier listener took (a menu or a field).
const useTbnEscape = (onClose: () => void) =>
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

// Mark all read is offered while anything is unread: a row listed, or an older one the bell does not list (S6-10).
const tbnCanReadAll = (items: readonly BellNote[]) => {
  const bell = frameBell();
  return items.some((n) => n.unread) || !!(bell && bell.older && bell.older() > 0);
};
// "All caught up" only over a bell with nothing in it, listed or not.
const tbnCaughtUp = (items: readonly BellNote[]) => items.length === 0 && !tbnCanReadAll(items);

/**
 * A note on its way out: dismissed by its × or slid away by a thumb, its slot folds shut (its height measured, then none,
 * over components.css's transition), then it goes; at once under reduced motion. Undo brings it back open.
 */
function useFold(onDismiss: (id: string) => void) {
  const slotEls = useRef(new Map<string, HTMLElement>());
  const [going, setGoing] = useState<string | null>(null);
  const fold = (id: string) => {
    const el = slotEls.current.get(id);
    const now = tbnReduced();
    if (el && el.style && !now) {
      el.style.height = `${el.offsetHeight}px`;
      void el.offsetWidth;
      el.style.height = "0px";
    }
    setGoing(id);
    setTimeout(
      () => {
        onDismiss(id);
        setGoing((g) => (g === id ? null : g));
        if (el && el.style) el.style.height = "";
      },
      now ? 0 : TBN_FOLD_MS,
    );
  };
  return { slotEls, going, fold };
}

/** What a note's and a group's draw read of the popover. */
interface BellDraw {
  asIs: Map<string, BellNote>;
  going: string | null;
  slotEls: RefObject<Map<string, HTMLElement>>;
  fold: (id: string) => void;
  read: (id: string) => void;
  onRead: ((id: string) => void) | null;
  onAction: (id: string, to: string | null) => void;
  openGroup: string | null;
  setOpenGroup: (key: string | null) => void;
}

function bellNote(d: BellDraw, n0: BellNote, inGroup: boolean) {
  const Glyph = frameGlyph();
  const n = d.asIs.get(n0.id) || n0;
  const verb = tbnVerb(n);
  // On a phone a thumb slides the note (kit/motion/swipe.ts touchSwipe): left over Dismiss, right over Mark read while it
  // is unread. The read note comes back read; the dismissed one stays aside while its slot folds.
  const swipe = window.touchSwipe
    ? window.touchSwipe({
        onAway: () => d.fold(n.id),
        onBack: n.unread && d.onRead ? () => d.read(n.id) : null,
        when: tbnPhone,
        onGrab: tbnMoving,
      })
    : {};
  return (
    <div
      key={n.id}
      className="tbn-slot"
      data-going={d.going === n.id ? "true" : undefined}
      ref={(el) => {
        if (el) d.slotEls.current.set(n.id, el);
        else d.slotEls.current.delete(n.id);
      }}
    >
      <div className="tbn-slot-in">
        <span className="tbn-ground tbn-ground-read" aria-hidden="true">
          {n.unread ? "Mark read" : ""}
        </span>
        <span className="tbn-ground tbn-ground-dismiss" aria-hidden="true">
          Dismiss
        </span>
        <div
          className={`tbn-item${n.unread ? " unread" : ""}${inGroup ? " in-group" : ""}`}
          data-tone={n.tone}
          {...swipe}
        >
          <button
            type="button"
            className="tbn-open"
            aria-label={verb ? `${verb.label}: ${n.title}` : n.title}
            onClick={() => d.onAction(n.id, verb ? verb.to : null)}
          >
            {n.unread && <span className="tbn-dot" />}
            {/* The mark says what kind of note this is, never its tone: a warning's title says that (components.css). */}
            {!inGroup && (
              <span className="mark tbn-icon">
                <Glyph name={n.icon} size={13} />
              </span>
            )}
            <span className="tbn-body">
              <span className="tbn-line1">
                <span className="tbn-item-title">{n.title}</span>
                <span className="tbn-time tabular">{n.time}</span>
              </span>
              {n.message && <span className="tbn-msg">{n.message}</span>}
            </span>
          </button>
          <button className="tbn-x" title="Dismiss" aria-label={`Dismiss “${n.title}”`} onClick={() => d.fold(n.id)}>
            <Glyph name="x" size={10} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** A switch that holds the page still where the frame has it, else the change alone. */
const holdIt = (e: MouseEvent<HTMLButtonElement> | null, change: () => void) =>
  (window.holdStill || ((_: Element | null | undefined, f: () => void) => f()))(e && e.currentTarget, change);

function bellLine(d: BellDraw, l: BellLine) {
  if (l.count < 2) return bellNote(d, l.row, false);
  const Glyph = frameGlyph();
  const open = d.openGroup === l.key;
  const unread = l.members.some((m) => (d.asIs.get(m.id) || m).unread);
  return (
    <div key={l.key} className={`tbn-group${open ? " open" : ""}`} data-testid="bell-group">
      <div className={`tbn-item tbn-item-group${unread ? " unread" : ""}`} data-tone={l.row.tone}>
        <button
          type="button"
          className="tbn-open"
          aria-expanded={open}
          aria-label={`${l.title}: ${open ? "hide them" : "show them"}`}
          onClick={(e) => holdIt(e, () => d.setOpenGroup(open ? null : l.key))}
        >
          {unread && <span className="tbn-dot" />}
          <span className="mark tbn-icon">
            <Glyph name={l.row.icon} size={13} />
          </span>
          <span className="tbn-body">
            <span className="tbn-line1">
              <span className="tbn-item-title">{l.title}</span>
              <span className="tbn-time tabular">{l.row.time}</span>
            </span>
            <span className="tbn-msg">{l.row.title}</span>
          </span>
          <span className="tbn-chev" aria-hidden="true">
            <Glyph name="chevron-down" size={12} />
          </span>
        </button>
      </div>
      {open && l.members.map((m) => bellNote(d, m, true))}
    </div>
  );
}

/** Device alerts, outside a demo: a system notification when something new needs the owner while the app is away. */
function bellAlerts(alerts: BellAlerts, onAlerts: (on: boolean) => void) {
  const Switch = frameRecordSwitch();
  return (
    <footer className="tbn-foot" data-testid="notif-alerts">
      {!alerts.can ? (
        <span className="tbn-foot-note">This browser can&apos;t show alerts.</span>
      ) : alerts.permission === "denied" ? (
        <span className="tbn-foot-note">Alerts are blocked in your browser settings.</span>
      ) : (
        <div className="tbn-alert">
          <span className="tbn-alert-words" id="tbn-alert-words">
            Alert this device when something needs you
          </span>
          <Switch labelledBy="tbn-alert-words" on={!!alerts.on} onChange={(on: boolean) => onAlerts(on)} />
        </div>
      )}
    </footer>
  );
}

/** The list: All caught up over an empty bell, else each section and its lines. */
function bellList(d: BellDraw, items: BellNote[], readHere: Set<string>) {
  const Glyph = frameGlyph();
  const sections = tbnSections(items.map((n) => (readHere.has(n.id) ? { ...n, unread: true } : n)));
  return (
    <div className="tbn-list">
      {tbnCaughtUp(items) && (
        <div className="tbn-empty">
          <Glyph name="check" size={18} />
          <span>All caught up</span>
        </div>
      )}
      {sections.map((sec) => (
        <Fragment key={sec.label}>
          <div className="tbn-sec">{sec.label}</div>
          {sec.lines.map((l) => bellLine(d, l))}
        </Fragment>
      ))}
    </div>
  );
}

interface NotifPopoverProps {
  items: BellNote[];
  onAction: (id: string, to: string | null) => void;
  onReadAll: () => void;
  onDismiss: (id: string) => void;
  onRead?: ((id: string) => void) | null;
  onClose: () => void;
  alerts?: BellAlerts | null;
  onAlerts?: (on: boolean) => void;
}

export function NotifPopover({
  items,
  onAction,
  onReadAll,
  onDismiss,
  onRead = null,
  onClose,
  alerts = null,
  onAlerts = () => {},
}: NotifPopoverProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  useTbnEscape(onClose);
  const { slotEls, going, fold } = useFold(onDismiss);
  // A note marked read under the thumb (slid right) keeps its place while the sheet is open, rather than jumping down to
  // Earlier: the sections are worked out as if it were still unread, and it is drawn as it is. The sheet is drawn anew
  // each time it opens, and regroups then.
  const readHere = useRef(new Set<string>());
  const read = (id: string) => {
    readHere.current.add(id);
    if (onRead) onRead(id);
  };
  const asIs = new Map(items.map((n) => [n.id, n]));
  const d: BellDraw = { asIs, going, slotEls, fold, read, onRead, onAction, openGroup, setOpenGroup };
  return (
    <>
      <div className="tbn-backdrop" role="presentation" onClick={onClose} />
      {/* Its handle says it can be pulled: a thumb pulls it down, and it goes the way it came (kit/motion/swipe.ts
          touchSwipe, leaving). A popover under the bell on a wider screen, where neither moves it: the kit's pop panel. */}
      <div
        className="tbn-pop panel panel-pop panel-flush"
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        ref={window.dialogRef ? window.dialogRef("bell") : undefined}
        {...(window.touchSwipe ? window.touchSwipe({ onDown: onClose, when: tbnPhone }) : {})}
      >
        <div className="tbn-handle" aria-hidden="true" />
        <header className="tbn-head">
          <span className="tbn-title">Notifications</span>
          {tbnCanReadAll(items) && (
            <button className="tbn-readall" onClick={onReadAll}>
              Mark all read
            </button>
          )}
        </header>
        {bellList(d, items, readHere.current)}
        {alerts && bellAlerts(alerts, onAlerts)}
      </div>
    </>
  );
}
