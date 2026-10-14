/**
 * Where an opened visit stands (the Calendar's lane E): on a phone the kit's Sheet, from the bottom edge, modal, with its
 * handle and its pull to close; on a desk a peek at the board's right edge in the grammar of People's, the Pipeline's and
 * Leads' peeks (`aside.pk`), over the right columns and never narrowing the week, which stays live: another block pressed
 * opens in its place, ‹ › and J and K walk the day's visits, Escape closes it. Both draw the same parts (visit.tsx) from
 * the same view model (contracts visitSheetOf). It replaced Ask's legacy modal and the demo Store's foot (panel.tsx).
 *
 * The open visit is the address's (use-calendar.ts useVisitAddress): closing goes back, so a phone's Back closes the sheet.
 */
import { useSyncExternalStore } from "react";
import {
  CALENDAR_VISIT_SHEET_WORDS as W,
  dealsAreOn,
  visitSheetOf,
  type CalendarBlockVM,
  type CalendarMomentDto,
} from "@chanlytics/contracts";
import { workspaceOverride } from "@/legacy-bridge/surface-data";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";
import { onAPhone } from "../../legacy-verbs";
import type { CalendarFrame } from "../types";
import { calendar } from "../verbs";
import { crDur, crNotesWorth, crWhen } from "../words";
import { VisitBody, VisitFoot, whenWords, type VisitCtx } from "./visit";
import { visitWordHere } from "../../visit-line";

/** What the open visit is drawn from: the block, its day, the board around it, and what closing and walking do. */
interface OpenVisitProps {
  b: CalendarBlockVM;
  day: CalendarFrame;
  todayKey: string;
  tz: string;
  /** The calendar's name, for the footnote ("Google Calendar"). */
  source: string;
  bookingLink: string | null;
  /** The campaigns the board read beside it (calendar_runs), for the reminder line; null before they are. */
  moments: readonly CalendarMomentDto[] | null;
  /** Every day the board holds, for their next visit after this one. */
  days: readonly CalendarFrame[];
  onClose: () => void;
  /** Open another of the day's visits in this one's place (the desk's walk). */
  onWalk: (b: CalendarBlockVM) => void;
  flash: (text: string) => void;
}

/** A phone, by the kit's own breakpoint (900px), heard as it changes so a turned tablet moves between the two. */
const PHONE = "(max-width: 900px)";
function hearPhone(changed: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
  const m = window.matchMedia(PHONE);
  m.addEventListener("change", changed);
  return () => m.removeEventListener("change", changed);
}
const usePhone = (): boolean => useSyncExternalStore(hearPhone, onAPhone, () => false);

/** Their next visit after this one among the days the board holds: "Tue, Oct 27 · 2 PM", or null. */
function nextVisitOf(b: CalendarBlockVM, days: readonly CalendarFrame[]): string | null {
  const who = b.person?.id;
  if (!who) return null;
  const after = Date.parse(b.end);
  for (const d of days)
    for (const x of d.blocks)
      if (x.person?.id === who && Date.parse(x.start) >= after && x.visit?.status !== "cancelled")
        return `${d.dow}, ${d.date} · ${calendar.clockLabel(x.t)}`;
  return null;
}

/** The day's visits in the order the board draws them, the all-day first: what the desk's walk steps through. */
function dayWalk(day: CalendarFrame): CalendarBlockVM[] {
  return [...day.allDay, ...day.blocks];
}

/** The parts' context: the view model for this visit at this minute, and what its acts do. */
function ctxOf(p: OpenVisitProps): VisitCtx {
  const { b, day } = p;
  const word = visitWordHere();
  const contacts = b.contacts;
  const vm = visitSheetOf({
    block: b,
    day: { key: day.key, today: day.today, date: day.date, dow: day.dow, long: day.long },
    rel: crWhen(day, p.todayKey),
    dur: crDur(b.dur),
    nowMs: Date.now(),
    tz: p.tz,
    word,
    source: p.source,
    bookingLink: p.bookingLink,
    dealsOn: dealsAreOn(workspaceOverride.current()?.sells_by ?? null),
    notes: crNotesWorth(b.description, b.person, contacts),
    next: nextVisitOf(b, p.days),
    moments: p.moments,
  });
  return { b, vm, word, bookingLink: p.bookingLink, close: p.onClose, flash: p.flash };
}

/** The desk's walk: "‹ 2 of 4 ›" through the day's visits, each step opening the next in this one's place. */
function walkNav(p: OpenVisitProps) {
  const all = dayWalk(p.day);
  const at = all.findIndex((x) => x.id === p.b.id);
  if (all.length < 2 || at < 0) return null;
  const step = (n: number) => {
    const next = all[(at + n + all.length) % all.length];
    if (next) p.onWalk(next);
  };
  return (
    <span className="cal-side-walk" data-testid="cal-side-walk">
      <Button variant="quiet" size="sm" iconOnly aria-label={W.previous} onClick={() => step(-1)}>
        <Icon name="chevron" size={12} className="cal-flip" />
      </Button>
      <span className="cal-side-walk-at tabular">{W.walk(at + 1, all.length)}</span>
      <Button variant="quiet" size="sm" iconOnly aria-label={W.following} onClick={() => step(1)}>
        <Icon name="chevron" size={12} />
      </Button>
    </span>
  );
}

/** The step the desk's J and K take through the day's visits, from the open one: the block it lands on, or null. */
export function walkFrom(day: CalendarFrame, id: string, n: number): CalendarBlockVM | null {
  const all = dayWalk(day);
  const at = all.findIndex((x) => x.id === id);
  if (all.length < 2 || at < 0) return null;
  return all[(at + n + all.length) % all.length] ?? null;
}

/** The desk's peek: its head (what, when, the walk, Close), its body and its foot, beside a board that stays live. */
function VisitPeek(p: OpenVisitProps) {
  const c = ctxOf(p);
  return (
    <aside className="pk cal-side" role="dialog" aria-label={c.vm.title} data-testid="cal-panel">
      <header className="cal-side-head">
        <div className="cal-side-titles">
          <h2 className="cal-side-title" id="cal-panel-title">
            {c.vm.title}
          </h2>
          <p className="cal-side-when" data-testid="cal-panel-when">
            {whenWords(c.vm)}
          </p>
        </div>
        {walkNav(p)}
        <Button
          variant="quiet"
          size="sm"
          iconOnly
          aria-label={W.close}
          title={W.close}
          onClick={p.onClose}
          data-testid="cal-panel-close"
        >
          <Icon name="x" size={13} />
        </Button>
      </header>
      <div className="pk-body cal-side-body">
        <VisitBody c={c} />
      </div>
      <VisitFoot c={c} />
    </aside>
  );
}

/** The phone's sheet: the kit's, its title the visit's, the when line under it, the body, and the foot that holds still. */
function VisitSheetPhone(p: OpenVisitProps) {
  const c = ctxOf(p);
  return (
    <Sheet
      open
      onClose={p.onClose}
      title={c.vm.title}
      sub={whenWords(c.vm)}
      close={{ label: W.close, glyph: <Icon name="x" size={13} /> }}
      foot={c.vm.nobody ? undefined : <VisitFoot c={c} />}
      testid="cal-panel"
    >
      <VisitBody c={c} />
    </Sheet>
  );
}

/** The open visit: the kit's sheet on a phone, the peek on a desk. */
export function OpenVisit(p: OpenVisitProps) {
  return usePhone() ? <VisitSheetPhone {...p} /> : <VisitPeek {...p} />;
}
