/**
 * The mockup's Today: a sample workspace's day through the same view models a real one goes through, so the
 * standalone mockup (Chanlytics.html, served by tooling/scripts/serve-legacy.mjs, which builds this as
 * data/today-sample.js) draws the one Today page there is. The app never loads it: a workspace draws its own day.
 *
 * Every figure agrees with its parts: the metrics are COUNTED from the threads and calls (today-sample/metrics.ts),
 * so the receipts add up whatever hour the mockup is opened. Every moment is said relative to `nowMs` through one
 * clock (today-sample/clock.ts), so the day is always today. Each surface has its own builder under today-sample/;
 * `build` below is their composition.
 *
 * Everything the sample publishes besides `TODAY_DATA` and `__today` lives under one namespaced `__TODAY_SAMPLE`,
 * never under the bridge's own global names, so the mockup's other pages keep drawing their own seeds.
 *
 * It imports contracts, reports-sample and the bridge's today.ts, and nothing that imports ./api: this is a browser
 * bundle with no session behind it.
 */
import {
  toTodayVM,
  toLiveVM,
  zoneDayKey,
  clockTime,
  type MetricsSummaryDto,
  type ConversationDto,
  type CallDto,
  type CalendarVM,
  type BroadcastVM,
  type LiveVM,
  type TodayVM,
  type PlaybookCardLike,
} from "@chanlytics/contracts";
import { reportsSample } from "./reports-sample";
import { TODAY_HELPERS } from "./today";
import type { ReportsSurface } from "./surface-data";
// The row the popover draws, from the bridge that owns it. `import type` is erased, so notifications.ts's
// own `./api` import never reaches this browser-only bundle.
import type { BellRow } from "./notifications";
import { ZONE, sampleClock, type SampleDay } from "./today-sample/clock";
import { sampleConversations } from "./today-sample/conversations";
import { sampleEscalations, type SampleEscalation } from "./today-sample/escalations";
import { sampleCalls } from "./today-sample/calls";
import { sampleMetrics } from "./today-sample/metrics";
import { sampleCalendar } from "./today-sample/calendar";
import { samplePeople, type PeopleSample } from "./today-sample/people";
import { sampleBroadcasts } from "./today-sample/broadcasts";
import { samplePlaybooks } from "./today-sample/playbooks";
import { sampleBellRows } from "./today-sample/bell";

export type { SampleDay } from "./today-sample/clock";

export interface TodaySample {
  TODAY_DATA: TodayVM;
  __CALENDAR: { vm: CalendarVM; fetchedAt: number };
  __PLAYBOOKS: { rows: PlaybookCardLike[] };
  __PEOPLE: PeopleSample;
  __BROADCASTS: { rows: BroadcastVM[] };
  __REPORTS: ReportsSurface;
  __LIVE: LiveVM;
  /** The bell as the topbar would hold it: three kept rows and three derived ones the queue already shows. */
  bell: BellRow[];
  metrics: MetricsSummaryDto;
  conversations: ConversationDto[];
  escalations: SampleEscalation[];
  calls: CallDto[];
}

/** The day, surface by surface: the rows first, the metrics counted from them, then each surface's view model. */
function build(nowMs: number, day: SampleDay): TodaySample {
  const busy = day === "busy";
  const clock = sampleClock(nowMs);
  const conversations = sampleConversations(clock, busy);
  const escalations = sampleEscalations(clock, busy);
  const calls = sampleCalls(clock, busy);
  const metrics = sampleMetrics(clock, conversations, escalations, calls);
  return {
    TODAY_DATA: toTodayVM(metrics, conversations, escalations, calls, clock.now),
    __CALENDAR: sampleCalendar(clock, day),
    __PLAYBOOKS: samplePlaybooks(clock),
    __PEOPLE: samplePeople(clock, conversations),
    __BROADCASTS: sampleBroadcasts(clock, busy),
    __REPORTS: reportsSample(7, clock.today),
    __LIVE: toLiveVM(calls, null, ZONE, clock.now),
    bell: sampleBellRows(clock, busy),
    metrics,
    conversations,
    escalations,
    calls,
  };
}

const kept = new Map<string, TodaySample>();

/** The sample as of `nowMs`: the same moment gives the same day, kept rather than rebuilt on every draw. */
export function todaySample(nowMs: number = Date.now(), day: SampleDay = "usual"): TodaySample {
  const key = `${nowMs}:${day}`;
  const hit = kept.get(key);
  if (hit) return hit;
  const built = build(nowMs, day);
  kept.set(key, built);
  return built;
}

/** The mockup picks its day from the page's query, `Chanlytics.html?day=busy#/today` or `?day=unreadable`; anything else is the usual day. */
export function sampleDayOf(win: Record<string, unknown>): SampleDay {
  const search = (win.location as { search?: string } | undefined)?.search ?? "";
  const m = /[?&]day=(busy|unreadable)(&|$)/.exec(search);
  return m ? (m[1] as SampleDay) : "usual";
}

/** The bell as Today and the topbar read it, over the sample's rows, with this page's read marks kept in memory. */
function sampleBell(rows: BellRow[]) {
  const read = new Set<string>();
  const dismissed = new Set<string>();
  const subs = new Set<() => void>();
  const notify = () => subs.forEach((cb) => cb());
  const feed = () =>
    rows.filter((r) => !dismissed.has(r.id)).map((r) => ({ ...r, unread: r.unread && !read.has(r.id) }));
  return {
    feed,
    unread: () => feed().filter((r) => r.unread).length,
    seenAll: () => {
      rows.forEach((r) => read.add(r.id));
      notify();
    },
    read: (key: string) => {
      read.add(key);
      notify();
    },
    dismiss: (key: string) => {
      dismissed.add(key);
      notify();
    },
    restore: (key: string) => {
      dismissed.delete(key);
      notify();
    },
    onChange: (cb: () => void) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
  };
}

/**
 * Every surface Today's page scripts read besides `TODAY_DATA` and `__today`, namespaced under one global so a
 * demo session's other pages never see it.
 */
export interface TodaySampleSurfaces {
  __CALENDAR: TodaySample["__CALENDAR"];
  __PLAYBOOKS: TodaySample["__PLAYBOOKS"];
  __PEOPLE: TodaySample["__PEOPLE"];
  __BROADCASTS: TodaySample["__BROADCASTS"];
  __REPORTS: TodaySample["__REPORTS"];
  __LIVE: TodaySample["__LIVE"];
  __clock: { dayKey: (ms: number) => string; time: (ms: number) => string };
  __notifs: ReturnType<typeof sampleBell>;
  __inboxVerb: () => Promise<{ ok: true; data: Record<string, never> }>;
  __broadcasts: {
    approve: (id: string) => Promise<{ ok: true; data: { recipient_count: number } }>;
    cancel: () => Promise<{ ok: true; data: Record<string, never> }>;
  };
  __refreshPlaybooks: () => void;
}

/**
 * Publishes the sample where the app's globals are absent, and nothing where they stand: the app boots its own
 * surfaces from the bridge, and this file is never loaded there. The mockup loads it before its page scripts.
 *
 * `TODAY_DATA` and `__today` are the two globals Today's own files read, so they keep their usual names. Every
 * other surface goes under one namespaced `__TODAY_SAMPLE`, never under the bridge's own names (`__CALENDAR`,
 * `__PEOPLE`, `__BROADCASTS`, ...): those are what the mockup's OTHER pages (`#/calendar`, `#/clients`,
 * `#/broadcasts`, `#/outbound`, ...) read to switch from their seeded variant to their "-real" one, and a real page
 * fed this sample's day-shaped, partial rows hits its error boundary or draws near-empty rather than its seed. The
 * sample is a day, not a workspace, so it must not look like one to a page that is not Today. PR B's Today page
 * reads `__TODAY_SAMPLE` through one accessor, in a demo session only.
 */
export function installTodaySample(
  win: Record<string, unknown>,
  nowMs: number = Date.now(),
  day: SampleDay = sampleDayOf(win),
): void {
  const s = todaySample(nowMs, day);
  const put = (key: string, value: unknown) => {
    if (win[key] === undefined) win[key] = value;
  };
  put("TODAY_DATA", s.TODAY_DATA);
  put("__today", TODAY_HELPERS);
  const surfaces: TodaySampleSurfaces = {
    __CALENDAR: s.__CALENDAR,
    __PLAYBOOKS: s.__PLAYBOOKS,
    __PEOPLE: s.__PEOPLE,
    __BROADCASTS: s.__BROADCASTS,
    __REPORTS: s.__REPORTS,
    __LIVE: s.__LIVE,
    __clock: { dayKey: (ms: number) => zoneDayKey(ms, ZONE), time: (ms: number) => clockTime(ms, ZONE) },
    __notifs: sampleBell(s.bell),
    // The verbs a row offers land nowhere in a mockup; they answer as the edge would after a success.
    __inboxVerb: async () => ({ ok: true, data: {} }),
    __broadcasts: {
      approve: async (id: string) => ({
        ok: true,
        data: { recipient_count: s.__BROADCASTS.rows.find((r) => r.id === id)?.recipient_count ?? 0 },
      }),
      cancel: async () => ({ ok: true, data: {} }),
    },
    __refreshPlaybooks: () => {},
  };
  put("__TODAY_SAMPLE", surfaces);
}
