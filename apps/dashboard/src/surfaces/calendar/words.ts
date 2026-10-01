/**
 * The Calendar's small decisions, pure (moved from legacy/pages/calendar.jsx, decision 0015): where a step takes the board,
 * how long an appointment runs, when it is said relative to today, whether its notes say anything the panel has not. The
 * JSX published them on `window` so a test could run them; a test imports them now.
 */
import { DAY_MS, MIN_MS, type CalendarView } from "@chanlytics/contracts";

/** How tall an hour is on the board, in px. */
export const CR_HOUR_PX = 64;

export const CR_VIEWS: ReadonlyArray<readonly [CalendarView, string]> = [
  ["week", "Week"],
  ["day", "Day"],
  ["month", "Month"],
  ["agenda", "Agenda"],
];

/** Five minutes: the board reads itself again while open, so what it draws follows the clock. */
export const CR_REFRESH_MS = 5 * MIN_MS;

/**
 * What the page says of a read that gives no reason of its own (the feed's `problem` is contracts' sentence when there is
 * one): a last good read that could not be refreshed, and a calendar that could not be read.
 */
export const CR_FEED_WORDS = {
  stale: "The calendar could not be refreshed.",
  unavailable: "The address is saved; check it in Settings › Business if this keeps happening.",
};

/**
 * Settings › Business states the same calendar's last read in its own row (pages/business-tab-open.jsx). It keeps a read
 * for as long as this board does, and says these two states in these words: one number and one spelling, here, published
 * as `window.__calendarPage` (verbs.ts) for the row, which is still the shell's.
 */
export const CALENDAR_PAGE = { refreshMs: CR_REFRESH_MS, words: CR_FEED_WORDS };

/**
 * What can be open over the board and has the keys while it is: the deal sheet, Ask, a menu. Only the app's (each sits
 * inside .app-root), by People's rule (clients-a.jsx PL_OVERLAY), so a dialog a browser extension adds cannot silence the
 * board. The appointment's own dialog is the page's: it holds Escape, and the key handler asks it first.
 */
export const CR_OVERLAY = '.app-root [role="dialog"], .app-root [role="menu"]';

/** The date arithmetic a step takes: contracts' own, reached through the bridge's verbs. */
interface StepKit {
  shiftKey: (key: string, n: number) => string;
  shiftMonth: (key: string, n: number) => string;
}

/**
 * Where ‹ › and ← → take the board, one rule per view: a day in Day view, a week in Week view, fourteen days in Agenda, a
 * month in Month. Day view used to fall through to the week branch and jump seven days.
 */
export const crStep = (view: CalendarView, anchor: string, n: number, cal: StepKit): string =>
  view === "month"
    ? cal.shiftMonth(anchor, n)
    : view === "agenda"
      ? cal.shiftKey(anchor, 14 * n)
      : view === "day"
        ? cal.shiftKey(anchor, n)
        : cal.shiftKey(anchor, 7 * n);

/** "1h", "45m", "1h 30m": the same words the day's rows use (contracts durationLabel). */
export const crDur = (min: number): string => {
  if (!Number.isFinite(min) || min <= 0) return "";
  const h = Math.floor(min / 60),
    m = Math.round(min % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

/**
 * When it is, said the way a person asks it: the day relative to now first, because "Tomorrow" is what an owner checks
 * for, and the date after it for the ones that are neither today nor tomorrow.
 */
export const crWhen = (day: { today?: boolean; key?: string }, todayKey: string | null): string | null => {
  if (day.today) return "Today";
  if (!todayKey || !day.key) return null;
  const at = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  const days = Math.round((at(day.key) - at(todayKey)) / DAY_MS);
  return days === 1 ? "Tomorrow" : days === -1 ? "Yesterday" : null;
};

/** What the notes are checked against: the person the panel names, and the numbers and addresses it prints above them. */
interface NotesContacts {
  phones?: string[];
  e164?: string[];
  emails?: string[];
}

/**
 * Whether the notes say anything the panel has not already said. A booking tool writes the person's name and number into
 * the event's description, and this dialog prints both above it; a box repeating them is noise a reader has to look past.
 * Strip what is already shown, and if no letter or digit survives, there is nothing to show.
 */
export const crNotesWorth = (
  desc: string | null | undefined,
  person: { name?: string } | null | undefined,
  contacts: NotesContacts | null | undefined,
): string | null => {
  if (!desc) return null;
  let rest = desc;
  const shown = [
    person?.name,
    ...(contacts?.phones ?? []),
    ...(contacts?.e164 ?? []),
    ...(contacts?.emails ?? []),
  ].filter((s): s is string => !!s);
  for (const s of shown) rest = rest.split(s).join(" ");
  // A number written differently is the same number, so its digits decide: the last ten of them, because
  // "+1 917 555 0103" and "(917) 555-0103" are one number with and without its country code.
  for (const ph of [...(contacts?.phones ?? []), ...(contacts?.e164 ?? [])]) {
    const digits = String(ph).replace(/\D/g, "").slice(-10);
    if (digits.length >= 7) rest = rest.replace(new RegExp(digits.split("").join("\\D*"), "g"), " ");
  }
  return /[a-z0-9]/i.test(rest) ? desc : null;
};
