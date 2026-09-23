/**
 * The workspace's zone, for everything that says a time (contracts clock.ts).
 *
 * A message's minute, a call's start, when a broadcast goes and a day on a person's
 * timeline are said by the business's clock, not the browser's. The workspace
 * surface publishes the zone with `__WORKSPACES`, but on a workspace page every
 * surface boots at once (surface-runner.ts), so the Inbox can map its threads
 * before that read lands. It makes the same read instead, which the client shares
 * with the workspace surface's while both are in flight (client/api.ts).
 *
 * Reads the published globals rather than importing the workspace surface, which
 * imports the surfaces that ask for this.
 */
import {
  DEFAULT_TIMEZONE,
  clockDateYear,
  clockDayLabel,
  clockStamp,
  clockTime,
  clockWhen,
  fromZonedInput,
  nextOpenMoment,
  SENDING_HOURS_WORDS,
  timezoneCity,
  zoneDayKey,
  zonedInputValue,
  fmtDay,
} from "@chanlytics/contracts";
import { read } from "./api";
import { pathWorkspace } from "./workspace";

interface ZoneGlobals {
  __WORKSPACES?: Array<{ id: string; timezone?: string | null }>;
  __ACTIVE_WORKSPACE?: string;
}

/** The zone the workspace read answered here, for whatever paints before the workspace surface publishes it. */
let lastRead: string | null = null;

/**
 * The zone this browser last saw for each workspace, by the slug in its address. A cold boot -- a new tab, a phone
 * reopening the app, where the tab's surface cache is empty -- had no zone until the workspace read answered, and the
 * Calendar's first read waited that whole round trip (about 650ms on production, 23 Sep) only to learn which day is
 * today, so Today's day card drew half a second after the queue beside it. The one it remembers answers at once; the
 * workspace's own, once published or read, wins over it and is remembered in its place. A zone names no one, so it
 * outlives a sign-out.
 */
const ZONES_STORE = "chanlytics.zones.v1";
// Per window: what this window last wrote, and what it read, once per workspace -- a page's clock asks for the zone
// for every time it says, and a boot says hundreds.
const memo = new WeakMap<Window, { noted: string | null; recalled: { slug: string; zone: string | null } | null }>();
const memoOf = (win: Window) => {
  let m = memo.get(win);
  if (!m) memo.set(win, (m = { noted: null, recalled: null }));
  return m;
};

function remembered(win: Window, slug: string): string | null {
  const m = memoOf(win);
  if (m.recalled && m.recalled.slug === slug) return m.recalled.zone;
  let zone: string | null = null;
  try {
    const all = JSON.parse(win.localStorage.getItem(ZONES_STORE) || "{}") as Record<string, unknown>;
    zone = typeof all[slug] === "string" && all[slug] ? (all[slug] as string) : null;
  } catch {
    zone = null;
  }
  m.recalled = { slug, zone };
  return zone;
}

function remember(win: Window, slug: string | null, zone: string): void {
  const m = memoOf(win);
  if (!slug || m.noted === `${slug}|${zone}`) return;
  m.noted = `${slug}|${zone}`;
  m.recalled = { slug, zone };
  try {
    const all = JSON.parse(win.localStorage.getItem(ZONES_STORE) || "{}") as Record<string, unknown>;
    if (all[slug] === zone) return;
    win.localStorage.setItem(ZONES_STORE, JSON.stringify({ ...all, [slug]: zone }));
  } catch {
    /* storage blocked: the next cold boot reads the workspace first, as it always did */
  }
}

const slugOf = (win: Window): string | null => (win.location ? pathWorkspace(win.location.pathname) : null);

/**
 * The workspace's zone as far as this tab knows it: the published one, else the one read here, else the one this
 * browser remembers for the workspace in its address; null before any of them.
 */
export function knownZone(win: Window = window): string | null {
  const w = win as unknown as ZoneGlobals;
  const fresh = w.__WORKSPACES?.find((t) => t.id === w.__ACTIVE_WORKSPACE)?.timezone || lastRead;
  const slug = slugOf(win);
  if (fresh) {
    remember(win, slug, fresh);
    return fresh;
  }
  return slug ? remembered(win, slug) : null;
}

/** The workspace's zone: the one this tab knows, or the workspace read itself. */
export async function workspaceZone(win: Window = window): Promise<string> {
  const known = knownZone(win);
  if (known) return known;
  const data = await read("GET workspaces");
  // Every workspace is made with a zone; the default is for a row that somehow has none.
  lastRead = data.workspaces.find((t) => t.id === data.activeWorkspaceId)?.timezone || DEFAULT_TIMEZONE;
  remember(win, slugOf(win), lastRead);
  return lastRead;
}

/** The clock the classic pages read: `window.__clock`. Every method says the workspace's time. */
export interface PageClock {
  /** The zone in use: the workspace's; before any workspace is known (the demo), the browser's. */
  zone: () => string;
  /** "Tokyo", for "Tokyo time". */
  city: () => string;
  /** "3:10 PM" */
  time: (atMs: number) => string;
  /** The time today; before it, "Sep 6 · 3:10 PM". */
  stamp: (atMs: number) => string;
  /** "today 6:00 PM" · "tomorrow 10:00 AM" · "Sep 12 · 10:00 AM" */
  when: (atMs: number) => string;
  /** "Sep 6, 2026" */
  dateYear: (atMs: number) => string;
  /** A day above the rows that belong to it: "Today · Sep 4" · "Yesterday · Sep 3" · "Sep 2". */
  dayLabel: (atMs: number) => string;
  /**
   * A DAY KEY ("2026-08-25") as words: "Aug 25". A run's day is a calendar day,
   * not an instant, so it is not put through a zone -- it was printed raw on a
   * playbook's card and in every row of its history.
   */
  dayWords: (day: string) => string;
  /** The business's day: "2026-09-06". */
  dayKey: (atMs: number) => string;
  /** A datetime-local box's value for an instant, by the workspace's clock. */
  inputValue: (atMs: number) => string;
  /** The instant a datetime-local box's value names, by the workspace's clock; null for none. */
  fromInput: (value: string) => number | null;
  /** When a send asked for at that moment goes: outside the sending hours, the next nine o'clock (playbooks.ts). */
  nextOpen: (atMs: number) => { at: number; moved: boolean };
  /** The hours a send may go out in, as the pages say them (contracts SENDING_HOURS_WORDS). */
  hours: typeof SENDING_HOURS_WORDS;
}

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function pageClock(win: Window = window): PageClock {
  const zone = () => knownZone(win) ?? browserZone();
  return {
    zone,
    city: () => timezoneCity(zone()),
    time: (atMs) => clockTime(atMs, zone()),
    stamp: (atMs) => clockStamp(atMs, zone(), Date.now()),
    when: (atMs) => clockWhen(atMs, zone(), Date.now()),
    dateYear: (atMs) => clockDateYear(atMs, zone()),
    dayLabel: (atMs) => clockDayLabel(atMs, zone(), Date.now()),
    dayWords: (day) => fmtDay(day),
    dayKey: (atMs) => zoneDayKey(atMs, zone()),
    inputValue: (atMs) => zonedInputValue(atMs, zone()),
    fromInput: (value) => fromZonedInput(value, zone()),
    nextOpen: (atMs) => {
      const open = nextOpenMoment(zone(), new Date(atMs));
      return { at: open.at.getTime(), moved: open.moved };
    },
    hours: SENDING_HOURS_WORDS,
  };
}

declare global {
  interface Window {
    __clock?: PageClock;
  }
}

export function installClock(win: Window = window): void {
  win.__clock = pageClock(win);
}
