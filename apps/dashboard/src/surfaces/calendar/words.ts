/**
 * The Calendar's small decisions, pure (moved from legacy/pages/calendar.jsx, decision 0015): where a step takes the board,
 * how long an appointment runs, when it is said relative to today, whether its notes say anything the panel has not. The
 * JSX published them on `window` so a test could run them; a test imports them now.
 */
import { DAY_MS, MIN_MS, type CalendarView } from "@chanlytics/contracts";

/**
 * The least an hour may be on a phone's board, in px. A desk draws 64 where its day fits (fitDeskHourPx); a phone shares the room the
 * page leaves among the day's hours (blocks.tsx CrBoard), and under this a half-hour block (22px at the least) would cover
 * more than a sliver of the one after it. Nine hours fit a 375px phone at it; a longer day scrolls inside its pane.
 */
const CR_HOUR_MIN_PX = 40;

/**
 * The hour's height that fits `hours` of the day in `room` px of board, never under the floor: a phone's board holds
 * still where the day fits, and scrolls inside its pane where it cannot. Whole pixels, so the hour lines stay crisp.
 */
export const fitHourPx = (room: number, hours: number): number =>
  Math.max(CR_HOUR_MIN_PX, Math.floor(Math.max(0, room) / Math.max(1, hours)));

/** A desk's hour where the day fits at it (calendar.css `--cal-hour`), and the least a desk's hour is drawn at. */
const CR_DESK_HOUR_PX = 64;
const CR_DESK_HOUR_MIN_PX = 48;

/**
 * A desk's hour: the stylesheet's 64px where the day fits at it, else what fits, never under 48. A desk's board holds still
 * where its day fits, as a phone's does: at a flat 64px an 8 AM to 7 PM day was 704px in a board of about 620, so it
 * always scrolled, and opening an hour above five-thirty pushed the morning, a 9 AM visit with it, off the top (Ruben's
 * screenshots, 18 Oct 2026). Only a day too long for 48px scrolls, and that one opens at now (CAL-7).
 */
export const fitDeskHourPx = (room: number, hours: number): number =>
  Math.min(CR_DESK_HOUR_PX, Math.max(CR_DESK_HOUR_MIN_PX, Math.floor(Math.max(0, room) / Math.max(1, hours))));

export const CR_VIEWS: ReadonlyArray<readonly [CalendarView, string]> = [
  ["week", "Week"],
  ["day", "Day"],
  ["month", "Month"],
  ["agenda", "Agenda"],
];

/** Five minutes: the board reads itself again while open, so what it draws follows the clock. */
export const CR_REFRESH_MS = 5 * MIN_MS;

/** A second: how long the board stands still on a view before it reads the weeks beside it, so a run of arrow presses reads none. */
export const CR_WARM_MS = 1000;

/**
 * What the page says of a read that gives no reason of its own (the feed's `problem` is contracts' sentence when there is
 * one): a last good read that could not be refreshed, and a calendar that could not be read.
 */
export const CR_FEED_WORDS = {
  stale: "The calendar could not be refreshed.",
  unavailable: "The address is saved; check it in Settings › Hours & booking if this keeps happening.",
};

/** The card's door where nothing is connected, beside "No calendar connected.", which says the rest (Ruben, 21 Oct 2026). */
export const CR_CONNECT = "Connect";

/**
 * Settings › Business states the same calendar's last read in its own row (pages/business-tab-open.jsx). It keeps a read
 * for as long as this board does, and says these two states in these words: one number and one spelling, here, which
 * the row imports.
 */
export const CALENDAR_PAGE = { refreshMs: CR_REFRESH_MS, words: CR_FEED_WORDS };

/**
 * What can be open over the board and has the keys while it is: the deal sheet, Ask, a menu, and the kit's own Menu and
 * Sheet, which are drawn on the document's body past .app-root and named by their class (People's rule, PL_OVERLAY), so
 * a dialog a browser extension adds cannot silence the board. Not the board's own peek, which the key handler asks first:
 * the board stays live beside it. It named the app's alone, so the kit's Menu at the bar's end and every kit sheet let the
 * arrows move the days behind them.
 */
export const CR_OVERLAY = [
  '.app-root [role="dialog"]:not(.cal-side)',
  '.app-root [role="menu"]',
  '.more-menu[role="menu"]',
  '.sheet[role="dialog"]',
].join(", ");

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

/** A text as a pattern that matches it and nothing else. */
const literally = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A number however it is written, as a pattern: its national digits with a few spaces, dots, dashes or brackets between
 * them, after its country code where the number has one ("+1 917 555 0116", "1-917-555-0116"), or any short code where it
 * has none, so "+1 (917) 555-0116" is the number "(917) 555-0116" too. Null for fewer than seven digits.
 */
function numberPattern(phone: string): RegExp | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  const national = digits.slice(-10);
  const code = digits.slice(0, digits.length - national.length);
  const spaced = (d: string) => d.split("").join("\\D{0,3}");
  const lead = code ? `(?:\\+?\\s*${spaced(code)}\\D{0,3})?` : "(?:\\+?\\d{1,3}\\D{0,3})?";
  return new RegExp(`${lead}${spaced(national)}`, "g");
}

/**
 * Whether the notes say anything the panel has not already said. A booking tool writes the person's name and number into
 * the event's description, and the sheet prints both above it; a box repeating them is noise a reader has to look past.
 * Strip what is already shown, in any case, and every number whole, its country code with it, and if no letter or digit
 * survives, there is nothing to show. The number's last ten digits alone were taken out, so "+1 917 555 0116" left its
 * "+1" behind, and every note of a booking tool's ("Tom Baker · +1 917 555 0116") was shown, saying nothing new.
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
  ].filter((s): s is string => !!s && !!s.trim());
  for (const s of shown) rest = rest.replace(new RegExp(literally(s.trim()), "gi"), " ");
  // A number written differently is the same number, so its digits decide.
  for (const ph of [...(contacts?.phones ?? []), ...(contacts?.e164 ?? [])]) {
    const pattern = numberPattern(String(ph));
    if (pattern) rest = rest.replace(pattern, " ");
  }
  return /[\p{L}\p{N}]/u.test(rest) ? desc : null;
};
