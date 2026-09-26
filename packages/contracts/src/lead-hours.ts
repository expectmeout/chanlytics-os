/**
 * A listing's hours as the send window reads them (Reach out, Part 3): Maps' own words ("9 AM to 6 PM",
 * "9:30 AM to 12 PM, 1 to 5:30 PM", "Closed", "Open 24 hours"), stored as `[{day, hours}]` (00144:34), turned into open
 * windows per weekday in minutes after the business's local midnight. A window past midnight runs on (6 PM to 2 AM is
 * 1080 to 1560). Hours that cannot be read are the default week, Monday to Friday, nine to five, and `read` says so;
 * the display readers (lead-facts.ts) are left as they are, since they read one range for a line of text.
 */
export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export interface OpenWindow {
  from: number;
  to: number;
}
export type WeekHours = Record<WeekdayKey, OpenWindow[]>;

const NINE_TO_FIVE: OpenWindow[] = [{ from: 9 * 60, to: 17 * 60 }];
export const DEFAULT_WEEK: WeekHours = {
  mon: NINE_TO_FIVE,
  tue: NINE_TO_FIVE,
  wed: NINE_TO_FIVE,
  thu: NINE_TO_FIVE,
  fri: NINE_TO_FIVE,
  sat: [],
  sun: [],
};

const DAY_OF: Record<string, WeekdayKey> = {
  mon: "mon",
  monday: "mon",
  tue: "tue",
  tues: "tue",
  tuesday: "tue",
  wed: "wed",
  wednesday: "wed",
  thu: "thu",
  thur: "thu",
  thurs: "thu",
  thursday: "thu",
  fri: "fri",
  friday: "fri",
  sat: "sat",
  saturday: "sat",
  sun: "sun",
  sunday: "sun",
};

/** "9", "9:30", "12 PM", "noon": minutes after midnight, and whether a meridiem was said. Null for anything else. */
function timeOf(s: string): { min: number; meridiem: "am" | "pm" | null } | null {
  const t = s.trim().toLowerCase().replace(/\./g, "");
  if (t === "noon") return { min: 12 * 60, meridiem: "pm" };
  if (t === "midnight") return { min: 0, meridiem: "am" };
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(t);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2] ?? 0);
  if (hh < 1 || hh > 12 || mm > 59) return hh === 0 && !m[3] ? { min: mm, meridiem: null } : null;
  return { min: (hh % 12) * 60 + mm, meridiem: (m[3] as "am" | "pm" | undefined) ?? null };
}
const withMeridiem = (min: number, meridiem: "am" | "pm") => (meridiem === "pm" ? min + 12 * 60 : min);

/** One range: "9 AM to 6 PM", "8 to 11 AM", "6 PM–2 AM". Null when it is not one. */
function rangeOf(s: string): OpenWindow | null {
  const parts = s.split(/\s*(?:to|–|—|-)\s*/i);
  if (parts.length !== 2) return null;
  const a = timeOf(parts[0]);
  const b = timeOf(parts[1]);
  if (!a || !b || !b.meridiem) return null;
  const to0 = withMeridiem(b.min, b.meridiem);
  // A start with no meridiem borrows its end's, unless that puts it after the end ("11 to 2 PM" is 11 AM).
  let from = a.meridiem ? withMeridiem(a.min, a.meridiem) : withMeridiem(a.min, b.meridiem);
  if (!a.meridiem && from > to0) from = a.min;
  // Midnight at the end is the day's end; an end before the start runs past midnight.
  const to = to0 === 0 ? 24 * 60 : to0 <= from ? to0 + 24 * 60 : to0;
  return { from, to };
}

/** One day's words: every range, or all day, or closed. Null when nothing in it reads. */
function dayOf(words: string): OpenWindow[] | null {
  const w = words.trim().toLowerCase();
  if (w === "closed") return [];
  if (w === "open 24 hours" || w === "24 hours") return [{ from: 0, to: 24 * 60 }];
  const ranges = w.split(/\s*,\s*/).map(rangeOf);
  return ranges.every((r): r is OpenWindow => r !== null) && ranges.length > 0 ? ranges : null;
}

export function weekHoursOf(hours: unknown): { week: WeekHours; read: boolean } {
  if (!Array.isArray(hours) || hours.length === 0) return { week: DEFAULT_WEEK, read: false };
  const week: WeekHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
  let readAny = false;
  for (const e of hours) {
    if (!e || typeof e !== "object") continue;
    const day =
      DAY_OF[
        String((e as { day?: unknown }).day ?? "")
          .trim()
          .toLowerCase()
      ];
    const said = (e as { hours?: unknown }).hours;
    if (!day || typeof said !== "string") continue;
    const windows = dayOf(said);
    if (windows === null) continue;
    week[day] = windows;
    readAny = true;
  }
  return readAny ? { week, read: true } : { week: DEFAULT_WEEK, read: false };
}
