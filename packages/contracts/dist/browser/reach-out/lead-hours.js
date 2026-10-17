const NINE_TO_FIVE = [{ from: 9 * 60, to: 17 * 60 }];
export const DEFAULT_WEEK = {
  mon: NINE_TO_FIVE,
  tue: NINE_TO_FIVE,
  wed: NINE_TO_FIVE,
  thu: NINE_TO_FIVE,
  fri: NINE_TO_FIVE,
  sat: [],
  sun: []
};
const DAY_OF = {
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
  mo: "mon",
  tu: "tue",
  we: "wed",
  weds: "wed",
  th: "thu",
  fr: "fri",
  sa: "sat",
  su: "sun"
};
const dayNameOf = (raw) => DAY_OF[String(raw ?? "").replace(/\([^)]*\)/g, "").replace(/\./g, "").trim().toLowerCase()] ?? null;
function timeOf(s) {
  const t = s.trim().toLowerCase().replace(/\./g, "");
  if (t === "noon") return { min: 0, meridiem: "pm" };
  if (t === "midnight") return { min: 0, meridiem: "am" };
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(t);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2] ?? 0);
  if (mm > 59) return null;
  if (hh === 0) return m[3] ? null : { min: mm, meridiem: "am" };
  if (hh > 12) return null;
  return { min: hh % 12 * 60 + mm, meridiem: m[3] ?? null };
}
const withMeridiem = (min, meridiem) => meridiem === "pm" ? min + 12 * 60 : min;
function rangeOf(s) {
  const parts = s.split(/\s*(?:to|–|—|-)\s*/i);
  if (parts.length !== 2) return null;
  const a = timeOf(parts[0]);
  const b = timeOf(parts[1]);
  if (!a || !b || !b.meridiem) return null;
  const to0 = withMeridiem(b.min, b.meridiem);
  let from = a.meridiem ? withMeridiem(a.min, a.meridiem) : withMeridiem(a.min, b.meridiem);
  if (!a.meridiem && from > to0) from = a.min;
  const to = to0 === 0 ? 24 * 60 : to0 <= from ? to0 + 24 * 60 : to0;
  return { from, to };
}
function dayOf(words) {
  const w = words.replace(/\([^)]*\)/g, "").trim().toLowerCase();
  if (w === "closed") return [];
  if (w === "open 24 hours" || w === "24 hours") return [{ from: 0, to: 24 * 60 }];
  const ranges = w.split(/\s*,\s*/).map(rangeOf);
  return ranges.every((r) => r !== null) && ranges.length > 0 ? ranges : null;
}
export function weekHoursOf(hours) {
  if (!Array.isArray(hours) || hours.length === 0) return { week: DEFAULT_WEEK, read: false };
  const week = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
  let readAny = false;
  for (const e of hours) {
    const day = e && typeof e === "object" ? dayNameOf(e.day) : null;
    if (!day) return { week: DEFAULT_WEEK, read: false };
    const said = e.hours;
    const windows = typeof said === "string" ? dayOf(said) : null;
    week[day] = windows ?? DEFAULT_WEEK[day];
    if (windows !== null) readAny = true;
  }
  return readAny ? { week, read: true } : { week: DEFAULT_WEEK, read: false };
}
