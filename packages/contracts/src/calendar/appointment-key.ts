/**
 * The key an appointment from the owner's calendar is kept under (decision 0002): the event's own UID, and for one
 * occurrence of a repeating event the UID with the occurrence's original start, which is what a moved occurrence's
 * RECURRENCE-ID names, so a moved appointment is the same row moved and never a new one. An event with no UID (the
 * format requires one; a hand-written feed may not have it) is keyed by its start alone.
 *
 * Apart from feed-appointments.ts so calendar-people.ts can give a visit its key without importing what reads people.
 *
 * Its address is here too (visitRoute): a visit is named on the Calendar by the id of its row in the record, the one
 * CalendarBlockVM.visit carries, never by the key (a feed's UID has colons and an `@` in it) or by the block's id.
 */
import type { AppointmentWord } from "../journey/appointment-word";
import type { CalendarView } from "./calendar-views";
import { isDayKey } from "./day-keys";
import type { FeedItem } from "./feed";

export function appointmentKeyOf(item: Pick<FeedItem, "uid" | "start" | "occurrence">): string {
  if (!item.uid) return `ev:${item.start}`;
  return item.occurrence === undefined ? item.uid : `${item.uid}:${item.occurrence}`;
}

/** What a booking's row of the record goes by where an event goes by its UID: its id, behind a prefix no UID takes. */
const RECORD_KEY = "appt:";

/** A row of the record as a visit's key (feedItemOfAppointment's uid, the board's item id): `appt:<id>`. */
export function recordKeyOf(id: string): string {
  return `${RECORD_KEY}${id}`;
}

/** The row a visit's key names when it is a booking's from the record (recordKeyOf); null for a calendar event's. */
export function recordIdOf(key: string): string | null {
  return key.startsWith(RECORD_KEY) ? key.slice(RECORD_KEY.length) : null;
}

/* ---------------------------------------------------------------- the visit's address */

/** A visit's id as an address spells it: a row's uuid, or a seeded one (`priya`); no colon, which divides the day from it. */
const VISIT_ID = /^[A-Za-z0-9_-]+$/;

/** The Calendar's views by the word its address names them with (`calendar/month`), in the order its strip draws them. */
const CALENDAR_VIEWS: readonly CalendarView[] = ["week", "day", "month", "agenda"];

/**
 * Where a visit opens: the Calendar on its day with its panel over it, `calendar/2026-10-09:a-<id>`. With no day to say (a
 * writer that knows the visit and not when it is) `calendar/a-<id>`, which the board opens the panel of as soon as the
 * visit is among the days it holds. The day is the business's, by its zone (visitDateKey).
 *
 * The board names the view the visit was opened over too (`calendar/week:2026-10-09:a-<id>`), so the week stays the week
 * behind the sheet, and a refresh or a link copied from it reopens both. A day alone means Day, so Day says no word.
 */
export function visitRoute(id: string, dayKey?: string | null, view?: CalendarView | null): string {
  const day = dayKey && isDayKey(dayKey) ? dayKey : null;
  const lead = view && !(view === "day" && day) ? `${view}:` : "";
  return `calendar/${lead}${day ? `${day}:` : ""}a-${id}`;
}

/**
 * The door to a visit a page knows by its day and, where the record has a row for it, by that row's id: the visit's own
 * address (visitRoute), else its day's. A visit the hourly sync has not kept a row for is still a link to its day.
 */
export function visitDoor(dayKey: string, id: string | null | undefined): string {
  return id ? visitRoute(id, dayKey) : `calendar/${dayKey}`;
}

/**
 * What a link to a visit says, in the workspace's word for one (contracts appointmentWords): the appointment itself when the
 * record has a row to open it by, else its day (visitDoor).
 */
export function visitLinkWords(id: string | null | undefined, word: AppointmentWord): string {
  return id ? `Open the ${word}` : "Open the day";
}

/** What a Calendar address names: the view by its word, the day it looks at, and the visit whose panel it opens. */
export interface CalendarParam {
  view: CalendarView | null;
  day: string | null;
  visitId: string | null;
}

/** The day and the visit after a view's word, or the whole param: `2026-10-09`, `a-<id>`, `2026-10-09:a-<id>`; null for neither. */
function dayAndVisitOf(s: string): { day: string | null; visitId: string | null } | null {
  // isDayKey is a guard on unknown, which would narrow a string it refuses to nothing: asked as a plain answer.
  const dayOf = (k: string): string | null => (isDayKey(k) ? k : null);
  const alone = dayOf(s);
  if (alone) return { day: alone, visitId: null };
  const at = s.indexOf(":");
  const word = at < 0 ? s : s.slice(at + 1);
  const id = word.startsWith("a-") ? word.slice(2) : "";
  if (!VISIT_ID.test(id)) return null;
  if (at < 0) return { day: null, visitId: id };
  const day = dayOf(s.slice(0, at));
  return day ? { day, visitId: id } : null;
}

/**
 * What the param of a Calendar address names: `month` a view, `2026-10-09` a day, `a-<id>` a visit, `2026-10-09:a-<id>` a
 * visit on its day, and any of the last three after a view's word and a colon (`week:2026-10-09:a-<id>`, visitRoute). A
 * day with no view's word is Day's. Anything else, a half-written date included, names nothing, and the board opens as
 * it does for the route alone.
 */
export function calendarParamParts(param: string | null | undefined): CalendarParam {
  const none: CalendarParam = { view: null, day: null, visitId: null };
  if (!param) return none;
  const cut = param.indexOf(":");
  const lead = cut < 0 ? param : param.slice(0, cut);
  const view = CALENDAR_VIEWS.find((v) => v === lead) ?? null;
  if (view && cut < 0) return { view, day: null, visitId: null };
  const rest = dayAndVisitOf(view ? param.slice(cut + 1) : param);
  return rest ? { view, ...rest } : none;
}
