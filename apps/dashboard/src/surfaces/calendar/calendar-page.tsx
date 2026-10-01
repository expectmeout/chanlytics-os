/**
 * Calendar, real: the owner's calendar as the receptionist reads it (moved from legacy/pages/calendar.jsx, decision 0015).
 *
 * One loaded window of days, four views sliced from it. The page keeps two things: the view and the day it looks at (the
 * anchor). Everything else is derived: the span a view needs, the frames it draws, the numbers in the strip. A view's SHAPE
 * comes from dates alone (seven columns, forty-two cells, fourteen rows) while its CONTENT comes from the window, so a
 * switch is instant and a read that is still landing changes nothing but the words inside. Only a move outside the window
 * reads again.
 *
 * Every block is the feed's, every band is the business's hours and closures, every dashed window is a time the
 * receptionist would offer a caller, the same function the phone tool uses. Nothing is booked, moved or cancelled here: the
 * booking link does that.
 *
 * A real workspace draws what the seam gives (`useSurface("calendar")`); a demo session draws the same page from the sample
 * (sample.ts); without either the page draws nothing, and the frame's gate says the surface is being read.
 */
import type { CalendarBlockVM } from "@chanlytics/contracts";
import { demoSession } from "../legacy-verbs";
import { useSurface } from "../use-surface";
import { aboutToggleAct, copyLinkAct, refreshAct, swipePagesOf } from "./acts";
import { CrAgenda, CrBoard, CrMonth } from "./blocks";
import {
  calendarFoot,
  calendarHead,
  consultNote,
  failedLine,
  feedCard,
  feedNotes,
  readingLine,
  staleCard,
} from "./board-parts";
import { crPhone } from "./board-dom";
import { CrPanel } from "./panel";
import { calendarSample } from "./sample";
import { touchSwipeStaying } from "./shell-verbs";
import type { CalendarSurface } from "./surface";
import type { CalendarFrame } from "./types";
import { useBoardEffects, useCalendarState } from "./use-calendar";
import { calendar } from "./verbs";
import { crStep } from "./words";

/** The page for one address: which day it names (calendar/<YYYY-MM-DD>), and which appointment (calendar/a-<id>, which the page does not open). */
interface CalendarAddress {
  initialApptId?: string | null;
  initialDay?: string | null;
}

/** The Calendar: what a real workspace's read gives, else a demo's sample, else nothing. */
export function CalendarPage(props: CalendarAddress) {
  const live = useSurface("calendar");
  const C = live ?? (demoSession() ? calendarSample() : undefined);
  if (!C) return null;
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

function CalendarReal({ initialDay = null, C }: CalendarAddress & { C: CalendarSurface }) {
  const st = useCalendarState(initialDay);
  const { view, setView, anchorKey, setAnchorKey, openId, setOpenId, pending, setPending } = st;
  const { failedSpan, setFailedSpan, serviceName, setServiceName, refreshing, setRefreshing } = st;
  const { aboutOpen, setAboutOpen, aboutRef, toastNode, flash } = st;
  const { vm } = C;
  const anchor = anchorKey || vm.today;
  // What the view needs, from the anchor alone; whether the window has it.
  const span = calendar.spanFor(view, anchor);
  const covered = !!calendar.covers(vm.days, span.from, span.days);
  const spanKey = `${span.from}+${span.days}`;
  const { read, keys } = useBoardEffects({ span, vm, view, anchor, covered, spanKey, setPending, setFailedSpan });

  const frames = framesOf(vm, span);
  // Days a failed read left out are not loading: they could not be read.
  const unread = !covered && !pending && failedSpan === spanKey;
  if (unread)
    for (const f of frames)
      if (f.loading) {
        f.loading = false;
        f.unread = true;
      }
  const shown = view === "day" ? frames.filter((f) => f.key === anchor) : frames;
  const feedOk = vm.feed.state === "ok";
  const service = vm.services.find((s) => s.name === serviceName) || null;
  // The phone tool's and the assistant's rule (offerFor): a service's own length, or a consultation's when it needs one first (C5b).
  const fit = (w: { dur: number }) => !service || !service.offerMinutes || w.dur >= service.offerMinutes;
  const monthKey = view === "month" ? anchor.slice(0, 7) : null;

  const move = (n: number) => setAnchorKey(crStep(view, anchor, n, calendar));
  const swipePages = swipePagesOf(move);
  const copyLink = copyLinkAct(vm.bookingLink, flash);
  const refreshNow = refreshAct({ refreshing, setRefreshing, flash });
  const toggleAbout = aboutToggleAct({ aboutOpen, setAboutOpen, aboutRef });
  const openDay = (key: string) => {
    setAnchorKey(key);
    setView("day");
  };
  const onToday =
    view === "month"
      ? anchor.slice(0, 7) === vm.today.slice(0, 7)
      : view === "week"
        ? shown.some((d) => d.today)
        : anchor === vm.today;
  const openBlock = openId
    ? vm.days.flatMap((d) => [...d.blocks, ...d.allDay].map((b) => ({ b, d }))).find((x) => x.b.id === openId)
    : null;
  keys.current = { open: !!openBlock, move, today: () => setAnchorKey(null), close: () => setOpenId(null) };
  const onOpen = (b: CalendarBlockVM) => setOpenId(b.id);
  const cards = { vm, refreshing, refreshNow };
  const label = rangeLabel({ view, anchor, frames, shown });
  const bar = { vm, view, anchor, label, onToday, serviceName, move, setAnchorKey, setServiceName, setView };

  return (
    // Days on their way dim by the one rule every page uses (components.css [data-loading] [data-dims]): after a beat,
    // so a window the tab holds, painted at once, never flickers.
    <div className="calendar" data-testid="calendar-real" data-loading={pending ? "" : undefined}>
      {calendarHead(bar)}
      {/* On a phone the bar stands over the days and only they scroll and pull (mobile.css .cal-pane), as every page's
          strip does, and a swipe across them walks to the next or previous days; on a desk this box is display:
          contents and the page scrolls as one. */}
      <div className="cal-pane" data-testid="cal-pane" {...touchSwipeStaying({ pages: swipePages, when: crPhone })}>
        {consultNote({ vm, service })}
        {feedCard(cards)}
        {staleCard(cards)}
        {feedNotes({ vm, feedOk })}
        {failedLine({ covered, failedSpan, spanKey, read, pending })}
        {/* A read on its way says so in words; the board only dimmed (C2). */}
        {readingLine(pending)}

        <div key={view} className="cal-body" data-dims aria-busy={pending ? "true" : "false"} data-testid="cal-body">
          {view === "month" && (
            <CrMonth frames={frames} monthKey={monthKey} feedOk={feedOk} fit={fit} onDay={openDay} />
          )}
          {view === "agenda" && (
            <CrAgenda frames={frames} feedOk={feedOk} fit={fit} service={service} offer={vm.offer} onOpen={onOpen} />
          )}
          {(view === "week" || view === "day") && (
            <CrBoard
              frames={shown}
              hours={vm.hours}
              now={vm.now}
              wide={view === "day"}
              fit={fit}
              onDay={openDay}
              onOpen={onOpen}
            />
          )}
        </div>

        {calendarFoot({ ...cards, service, aboutOpen, aboutRef, toggleAbout, copyLink })}
      </div>

      {openBlock && (
        <CrPanel
          b={openBlock.b}
          day={openBlock.d}
          todayKey={vm.today}
          source={vm.feed.source || "your calendar"}
          bookingLink={vm.bookingLink}
          onCopyLink={copyLink}
          onClose={() => setOpenId(null)}
        />
      )}
      {toastNode}
    </div>
  );
}
