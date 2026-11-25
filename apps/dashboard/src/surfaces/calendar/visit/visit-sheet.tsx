/**
 * Where an opened visit stands (the Calendar's lane E): on a phone the kit's Sheet, from the bottom edge, modal, with its
 * handle and its pull to close; on a desk a peek at the board's right edge in the grammar of People's, the Pipeline's and
 * Leads' peeks (`aside.pk`), over the right columns and never narrowing the week, which stays live: another block pressed
 * opens in its place, ‹ › and J and K walk the day's visits, Escape closes it. Both draw the same parts (visit.tsx) from
 * the same view model (contracts visitSheetOf). It replaced Ask's old modal and the demo Store's foot (panel.tsx).
 *
 * The open visit is the address's (use-calendar.ts useVisitAddress): closing goes back, so a phone's Back closes the sheet.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import type { CalendarBlockVM, CalendarMomentDto } from "@chanlytics/contracts";
import { CALENDAR_VISIT_SHEET_WORDS as W, visitSheetOf, type VisitSheetOutcome } from "./sheet-view";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";
import { useRootFlag } from "../../kit/motion/root-flags";
import { onAPhone } from "../../frame-verbs";
import type { CalendarFrame } from "../types";
import { calendar } from "../verbs";
import { crDur, crNotesWorth, crWhen } from "../words";
import type { VisitCtx } from "./context";
import { nextToMarkOf } from "./next";
import { useVisitOutcome } from "./outcome";
import { VisitBody, VisitFoot, whenWords } from "./visit";
import { visitWordHere } from "../../workspace-word";

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
  /** Open another visit in this one's place (the desk's walk through the day, and the next to mark once one is said). */
  onWalk: (b: CalendarBlockVM) => void;
  flash: (text: string) => void;
  /** Its door to the Calendar, where it is open over another page (Today: the second look, N1). */
  home?: ReactNode;
  /** Open over another page: on a phone the tab bar stands down while it is (mobile.css `.over-page`). */
  over?: boolean;
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

/**
 * The parts' context: the view model for this visit at this minute, and what its acts do. `b` is the visit as the sheet
 * draws it (as it was just told, where a word was said here: useVisitOutcome), with that word's answer and its keeper.
 */
function ctxOf(p: OpenVisitProps, kept: { outcome: VisitSheetOutcome | null; settle: VisitCtx["settle"] }): VisitCtx {
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
    notes: crNotesWorth(b.description, b.person, contacts),
    next: nextVisitOf(b, p.days),
    moments: p.moments,
    outcome: kept.outcome,
  });
  // The next visit to mark is offered once a word is said here, and opens in this one's place (the walk).
  const next = kept.outcome ? nextToMarkOf(p.days, b, { nowMs: Date.now(), word, walk: p.onWalk }) : null;
  return {
    block: b,
    vm,
    word,
    bookingLink: p.bookingLink,
    close: p.onClose,
    flash: p.flash,
    settle: kept.settle,
    next,
  };
}

/** The open visit's context, with the word said in it kept while it stands (useVisitOutcome). */
function useVisitCtx(p: OpenVisitProps): VisitCtx {
  const { block, outcome, settle } = useVisitOutcome(p.b);
  return ctxOf({ ...p, b: block }, { outcome, settle });
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
  const c = useVisitCtx(p);
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
          {/* Its door to the Calendar, under when it is: the head's line keeps the title, the walk and Close. */}
          {p.home}
        </div>
        {walkNav(p)}
        <Button
          variant="quiet"
          size="sm"
          iconOnly
          aria-label={W.close}
          data-tip={W.close}
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
  const c = useVisitCtx(p);
  // Open over the page (`.over-page`): the tab bar stands down while it is, said on the document's root (kit/motion/root-flags.ts).
  useRootFlag("overPage", !!p.over);
  return (
    <Sheet
      open
      onClose={p.onClose}
      title={c.vm.title}
      sub={whenWords(c.vm)}
      close={{ label: W.close, glyph: <Icon name="x" size={13} /> }}
      tools={p.home}
      className={p.over ? "over-page" : undefined}
      solid
      flatFoot
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
