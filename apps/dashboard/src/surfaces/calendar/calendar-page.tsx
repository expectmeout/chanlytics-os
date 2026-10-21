/**
 * Calendar, real: the owner's calendar as the receptionist reads it (moved from legacy/pages/calendar.jsx, decision 0015).
 *
 * One loaded window of days, four views sliced from it. The view is the address's (`calendar/month`: the frame's strip of
 * views, chrome.ts) and the page keeps the day it looks at (the anchor). Everything else is derived: the span a view needs,
 * the frames it draws, the marks a day carries. A view's SHAPE comes from dates alone (seven columns, forty-two cells,
 * fourteen rows) while its CONTENT comes from the window, so a switch is instant and a read that is still landing changes
 * nothing but the words inside. Only a move outside the window reads again.
 *
 * Every block is the feed's or a booking email's, every band a closure or the hours the business keeps, every open window
 * a time the receptionist would offer a caller, the same function the phone tool uses. Beside them, under Show, the
 * campaigns over the same days (runs-surface.ts), which are marks and never blocks. Nothing is booked, moved or cancelled
 * here: the calendar or the booking tool does that, as an open visit's footnote says.
 *
 * A real workspace draws what the seam gives (`useSurface("calendar")`); a demo session draws the same page from the sample
 * (sample.ts); before either, the board's frame, still, so the page has its shape while the weeks are read (CAL-25).
 */
import { useEffect, useMemo } from "react";
import {
  MIN_MS,
  appointmentWords,
  calendarRunMarksOf,
  clockInZone,
  runMarkShown,
  type CalendarBlockVM,
  type CalendarRunMark,
  type CalendarRunsDto,
} from "@chanlytics/contracts";
import { useStanding } from "../kit/head/standing";
import { useSlide } from "../kit/motion/use-slide";
import { viewDeck } from "../kit/motion/view-deck";
import { canDo, navigate, onAPhone } from "../legacy-verbs";
import { heldEmailsSheet } from "../settings/business/held-emails";
import { usePartShown, useSurface } from "../use-surface";
import { visitWordHere } from "../workspace-word";
import { refreshAct, swipePagesOf } from "./acts";
import { calendarDayRoute, calendarViewNamed, calendarViewOf } from "./address";
import { CrAgenda, CrAgendaDay, CrBoard, CrMonth, type ViewAct } from "./blocks";
import { calendarAct, calendarHead, noticeSlot, rulesSheet } from "./board-parts";
import { crPhone } from "./board-dom";
import { RunSheet } from "./marks";
import { wantRuns } from "./runs-surface";
import { useCalendarDemo } from "./demo";
import { touchSwipeStaying } from "./shell-verbs";
import type { CalendarSurface } from "./surface";
import type { CalendarFrame } from "./types";
import {
  useBoardEffects,
  useCalendarState,
  useKeptView,
  useMinute,
  useVisitAddress,
  type CalendarShow,
} from "./use-calendar";
import { calendar } from "./verbs";
import { OpenVisit, walkFrom } from "./visit/visit-sheet";
import { CR_VIEWS, crStep } from "./words";

/** The views in the strip's order: a view arrives from the side its tab stands on. */
const VIEW_ORDER: readonly string[] = CR_VIEWS.map(([id]) => id);

/**
 * The page for one address: what follows `calendar/` (`param`: a view's word, a day, a visit, or a view's word before
 * either), the day it names, and the visit whose panel it opens (contracts calendarParamParts).
 */
interface CalendarAddress {
  param?: string | null;
  initialVisitId?: string | null;
  initialDay?: string | null;
}

/**
 * The board's frame before its first read (CAL-25): the bar's place and the board's, still, saying it is reading. It drew
 * nothing at all, and the strip of views stood over an empty page until the weeks landed. On a desk the bar is the act on
 * the row of views (board-parts.tsx calendarAct), so the reading is said there, and the board stands where it will.
 */
function ColdFrame() {
  const phone = onAPhone();
  const reading = (
    <span className="cal-title-reading" role="status">
      Reading…
    </span>
  );
  useStanding(phone ? null : { act: <div className="cal-act cal-bar-cold">{reading}</div> });
  return (
    <div className="calendar" data-testid="calendar-cold" data-loading="">
      {phone ? (
        <div className="cal-head">
          <div className="cal-bar cal-bar-cold">{reading}</div>
        </div>
      ) : null}
      <div className="cal-pane">
        <div className="cal-body cal-body-cold" aria-busy="true" />
      </div>
    </div>
  );
}

/** The Calendar: what a real workspace's read gives, else a demo's sample, else its frame while the read is out. */
export function CalendarPage(props: CalendarAddress) {
  const live = useSurface("calendar");
  const demo = useCalendarDemo();
  const C = live ?? (demo ? demo.calendarSample() : undefined);
  // The Calendar's first part (client/page-speed.ts): its board, drawn once the weeks are in.
  usePartShown("calendar", "board", !!C);
  if (!C) return <ColdFrame />;
  return <CalendarReal {...props} C={C} />;
}

/** The days a view draws: the loaded window's, and for a day it has not read, the frame its date alone gives. */
function framesOf(vm: CalendarSurface["vm"], span: { from: string; days: number }): CalendarFrame[] {
  const byKey = new Map(vm.days.map((d) => [d.key, d]));
  const frames: CalendarFrame[] = [];
  for (let i = 0; i < span.days; i++) {
    const k = calendar.shiftKey(span.from, i);
    frames.push(
      byKey.get(k) || {
        ...calendar.frameOf(k, vm.today),
        loading: true,
        closed: { yes: false, note: null },
        bands: [],
        blocks: [],
        allDay: [],
        windows: [],
      },
    );
  }
  return frames;
}

/** The range the bar says: the day in Day view, the month in Month, else the first and last days on screen. */
function rangeLabel(p: { view: string; anchor: string; frames: CalendarFrame[]; shown: CalendarFrame[] }): string {
  const { view, anchor, frames, shown } = p;
  const first = frames.at(0);
  const last = frames.at(-1);
  const one = shown.at(0);
  if (view === "day" && one) return `${one.dow} · ${one.date}`;
  if (view === "month") return calendar.monthLabel(anchor);
  if (!first || !last) return "";
  return `${first.date} – ${last.key.slice(0, 7) === first.key.slice(0, 7) ? last.date.replace(/^[A-Za-z]+ /, "") : last.date}`;
}

/** No marks: a day Show leaves its campaigns off, or before they are read. */
const NO_MARKS: readonly CalendarRunMark[] = [];

/**
 * The campaigns over the board's days, under Show (lane C): read only while Show draws campaigns or cold email (the
 * surface follows the board's span, runs-surface.ts), made into each day's marks at the board's minute, and its own part
 * of the page's speed (decision 0053). A demo session draws the sample's runs.
 */
function useCalendarRuns(show: CalendarShow, nowMs: number) {
  const wanted = show.campaigns || show.cold;
  useEffect(() => {
    wantRuns(wanted);
    return () => wantRuns(false);
  }, [wanted]);
  const live = useSurface("calendar_runs");
  const demo = useCalendarDemo();
  const dto: CalendarRunsDto | null = live?.dto ?? (demo ? demo.sampleRuns() : null);
  usePartShown("calendar", "campaigns", !!dto, wanted ? "" : null);
  const minute = Math.floor(nowMs / MIN_MS);
  const marks = useMemo(() => (dto ? calendarRunMarksOf(dto, new Date(minute * MIN_MS)) : null), [dto, minute]);
  const marksOf = (key: string): readonly CalendarRunMark[] =>
    wanted && marks ? (marks.get(key) ?? NO_MARKS).filter((m) => runMarkShown(m, show)) : NO_MARKS;
  return {
    marksOf,
    moments: dto?.moments ?? null,
    offers: {
      campaigns: !!dto?.moments.some((m) => !m.reach_out) || !!dto?.runs.some((r) => !r.reach_out),
      cold: !!dto?.moments.some((m) => m.reach_out),
    },
  };
}

/** The open visit, where one is: the block and its day among the days the board holds. */
function openOf(vm: CalendarSurface["vm"], openId: string | null): { b: CalendarBlockVM; d: CalendarFrame } | null {
  if (!openId) return null;
  for (const d of vm.days) {
    const b = [...d.blocks, ...d.allDay].find((x) => x.id === openId);
    if (b) return { b, d };
  }
  return null;
}

function CalendarReal({
  param = null,
  initialDay = null,
  initialVisitId = null,
  C,
}: CalendarAddress & { C: CalendarSurface }) {
  const st = useCalendarState(initialDay, C.vm.feed.notices.heldList.length);
  // The view the address shows, by the rule the frame's strip lights its tab by (address.ts).
  const view = calendarViewOf(param);
  useKeptView(calendarViewNamed(param));
  const slide = useSlide(VIEW_ORDER, view);
  const nowMs = useMinute();
  const { anchorKey, setAnchorKey, openId, setOpenId, pending, setPending, show } = st;
  const { failedSpan, setFailedSpan, serviceName, refreshing, setRefreshing, flash } = st;
  const { vm } = C;
  const anchor = anchorKey || vm.today;
  // What the view needs, from the anchor alone; whether the window has it.
  const span = calendar.spanFor(view, anchor);
  const covered = !!calendar.covers(vm.days, span.from, span.days);
  const spanKey = `${span.from}+${span.days}`;
  const { read, keys } = useBoardEffects({ span, vm, view, anchor, covered, spanKey, setPending, setFailedSpan });
  const runs = useCalendarRuns(show, nowMs);

  // The visit open and the address agree: a link that names one opens its panel once the board holds it, a press pushes
  // its address, and Back closes it (contracts visitRoute).
  const visit = useVisitAddress({
    visitId: initialVisitId,
    view,
    anchor,
    day: initialDay,
    days: vm.days,
    covered: covered && !pending,
    fetchedAt: C.fetchedAt,
    setOpenId,
  });

  const frames = framesOf(vm, span);
  // Days a failed read left out are not loading: they could not be read.
  if (!covered && !pending && failedSpan === spanKey)
    for (const f of frames)
      if (f.loading) {
        f.loading = false;
        f.unread = true;
      }
  const shown = view === "day" ? frames.filter((f) => f.key === anchor) : frames;
  const service = vm.services.find((s) => s.name === serviceName) || null;
  // The phone tool's and the assistant's rule (offerFor): a service's own length, or a consultation's when it needs one
  // first (C5b). Open times are drawn only while Show draws them.
  const fit = (w: { dur: number }) => show.open && (!service || !service.offerMinutes || w.dur >= service.offerMinutes);
  const move = (n: number) => setAnchorKey(crStep(view, anchor, n, calendar));
  const refreshNow = refreshAct({ refreshing, setRefreshing, flash });
  const openHeld = () => st.setHeldOpen(true);
  const open = openOf(vm, openId);
  const phone = onAPhone();
  keys.current = {
    open: !!open,
    move,
    today: () => setAnchorKey(null),
    close: visit.close,
    walk:
      open && !phone
        ? (n: number) => {
            const next = walkFrom(open.d, open.b.id, n);
            if (next) visit.open(next);
          }
        : null,
  };
  const a: ViewAct = {
    nowMs,
    marksOf: runs.marksOf,
    onOpen: (b) => visit.open(b),
    onRuns: (d) => st.setRunsDay(d.key),
  };
  const word = visitWordHere();
  const bar = {
    vm,
    anchor,
    label: rangeLabel({ view, anchor, frames, shown }),
    pending,
    onToday: onTodayOf(view, anchor, vm.today, shown),
    serviceName,
    move,
    setAnchorKey,
    setServiceName: st.setServiceName,
    refreshing,
    refreshNow,
    openRules: () => st.setRulesOpen(true),
    show,
    setShow: st.setShow,
    offers: runs.offers,
    many: appointmentWords(word).Many,
    phone,
  };
  // The bar on a desk, and Settings on a phone, stand on the frame's row of views (board-parts.tsx calendarAct).
  useStanding({ act: calendarAct(bar) });

  return (
    // Days on their way dim by the one rule every page uses (components.css [data-loading] [data-dims]): after a beat,
    // so a window the tab holds, painted at once, never flickers.
    <div
      className="calendar"
      data-testid="calendar-real"
      data-loading={pending ? "" : undefined}
      data-peek={open && !phone ? "" : undefined}
    >
      {calendarHead(bar)}
      {/* On a phone the bar stands over the days, under the frame's strip of views, and the pane under it holds still
          (mobile.css .cal-pane); a swipe across the days walks to the next or previous days. It is the pane's own touch
          (data-own-drag), so the strip's pager never walks the views under the same finger. On a desk this box is display:
          contents and the page scrolls as one. */}
      <div
        className="cal-pane"
        data-testid="cal-pane"
        data-own-drag
        {...touchSwipeStaying({ pages: swipePagesOf(move), when: crPhone })}
      >
        {noticeSlot({ vm, service, refreshing, refreshNow, covered, failedSpan, spanKey, read, pending, openHeld })}
        {/* The view: the element the deck moves when a tab of the strip is pressed (kit/motion/view-deck.ts), as Reports'
            lens body is, arriving from its tab's side. */}
        <div
          key={view}
          ref={viewDeck.view("calendar")}
          data-slide={slide}
          className="cal-body"
          data-dims
          aria-busy={pending ? "true" : "false"}
          data-testid="cal-body"
        >
          {viewBody({ view, frames, shown, anchor, vm, fit, service, a, phone, st, nowMs, show })}
        </div>
      </div>

      {overlays({ vm, open, runs, visit, st, frames, refreshNow, flash: (text) => flash({ msg: <>{text}</> }) })}
    </div>
  );
}

/**
 * What opens over the board: the visit (the kit's sheet on a phone, the peek on a desk), a day's campaigns, and the
 * hours and rules; and the board's toast.
 */
function overlays(p: {
  vm: CalendarSurface["vm"];
  open: { b: CalendarBlockVM; d: CalendarFrame } | null;
  runs: ReturnType<typeof useCalendarRuns>;
  visit: ReturnType<typeof useVisitAddress>;
  st: ReturnType<typeof useCalendarState>;
  frames: CalendarFrame[];
  refreshNow: () => void | Promise<void>;
  flash: (text: string) => void;
}) {
  const { vm, open, runs, visit, st } = p;
  const runsDay = st.runsDay ? (p.frames.find((f) => f.key === st.runsDay) ?? null) : null;
  return (
    <>
      {open && (
        <OpenVisit
          b={open.b}
          day={open.d}
          todayKey={vm.today}
          tz={vm.timezone}
          source={vm.feed.source || "your calendar"}
          bookingLink={vm.bookingLink}
          moments={runs.moments}
          days={vm.days}
          onClose={visit.close}
          onWalk={(b) => visit.open(b)}
          flash={p.flash}
        />
      )}
      <RunSheet
        day={runsDay ? `${runsDay.dow}, ${runsDay.date}` : null}
        marks={runsDay ? runs.marksOf(runsDay.key) : NO_MARKS}
        canSend={canDo("approve")}
        onClose={() => st.setRunsDay(null)}
      />
      {rulesSheet({
        open: st.rulesOpen,
        onClose: () => st.setRulesOpen(false),
        vm,
        refreshing: st.refreshing,
        refreshNow: p.refreshNow,
      })}
      {heldEmailsSheet({ open: st.heldOpen, onClose: () => st.setHeldOpen(false), notices: vm.feed.notices })}
      {st.toastNode}
    </>
  );
}

/** Whether Today is where the board stands: this month in Month, a week holding today in Week, else the day itself. */
function onTodayOf(view: string, anchor: string, todayKey: string, shown: CalendarFrame[]): boolean {
  if (view === "month") return anchor.slice(0, 7) === todayKey.slice(0, 7);
  if (view === "week") return shown.some((d) => d.today);
  return anchor === todayKey;
}

/** The view's own body: the month (on a phone a month of dots over the day picked, D7), the agenda, or the board. */
function viewBody(p: {
  view: string;
  frames: CalendarFrame[];
  shown: CalendarFrame[];
  anchor: string;
  vm: CalendarSurface["vm"];
  fit: (w: { dur: number }) => boolean;
  service: CalendarSurface["vm"]["services"][number] | null;
  a: ViewAct;
  phone: boolean;
  st: ReturnType<typeof useCalendarState>;
  nowMs: number;
  show: CalendarShow;
}) {
  const { view, frames, shown, anchor, vm, fit, service, a, phone, st, show } = p;
  const feedOk = vm.feed.state === "ok";
  // A day pressed in the month on a desk is that day's address, in Day view: Back returns to the month.
  const openDay = (key: string) => navigate(calendarDayRoute(key));
  // The now line and a block's phase at the board's own minute (useMinute), on the day the read calls today.
  const clock = clockInZone(vm.timezone, p.nowMs);
  const now = vm.days.some((d) => d.today) ? clock.hh + clock.mm / 60 : null;
  const agenda = { feedOk, fit, service, offer: vm.offer, now, openOn: show.open, todayKey: vm.today, a };
  if (view === "month") {
    const picked = phone ? (st.monthPick ?? anchor) : null;
    const day = picked ? frames.find((f) => f.key === picked) : null;
    return (
      <CrMonth
        frames={frames}
        monthKey={anchor.slice(0, 7)}
        feedOk={feedOk}
        fit={fit}
        onDay={phone ? st.setMonthPick : openDay}
        a={a}
        picked={picked}
        under={day ? <CrAgendaDay {...agenda} day={day} /> : null}
      />
    );
  }
  if (view === "agenda") return <CrAgenda {...agenda} frames={frames} />;
  return <CrBoard frames={shown} hours={vm.hours} now={now} wide={view === "day"} fit={fit} onDay={openDay} a={a} />;
}
