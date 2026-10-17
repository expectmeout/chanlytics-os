import { visitDateKey, visitDay } from "../calendar/calendar-people.js";
import { visitDoor } from "../calendar/appointment-key.js";
import { SEASON_BACK_DAYS } from "../calendar/feed-url.js";
import { clockDate } from "../shared/clock.js";
import { visitLineForDto } from "../people/person-row.js";
import { DAY_MS, dateFormat } from "../shared/time.js";
import { appointmentWordWhere, appointmentWords } from "../journey/appointment-word.js";
export const VISITS_TAB_WORDS = {
  toMark: "To mark",
  ahead: "Ahead",
  past: "Past",
  none: "Nothing ahead.",
  /** A missed visit: it is not a gap between visits, so the cadence does not read it. */
  notCounted: "Not counted in the gaps",
  kept: (n) => `${n} kept`,
  missed: (n) => `${n} missed`,
  cadence: (every) => `Usually every ${every}`,
  toMarkN: (n) => `${n} to mark`,
  /** Over how long the line counts: the season the read holds, or since the record's first visit of theirs. */
  over: (days) => `Last ${days} days`,
  since: (day) => `On record since ${day}`,
  /** Said when none was kept this season: the last they kept, before it. */
  lastKept: (day) => `Last kept ${day}`
};
function visitCadenceOf(kept, unmarked) {
  if (kept.length < 3) return null;
  const at = [...kept].sort((a, b) => a - b);
  const first = at[0] ?? 0;
  const last = at[at.length - 1] ?? 0;
  if (unmarked.some((t) => t > first && t < last)) return null;
  const gaps = at.slice(1).map((t, i) => t - (at[i] ?? t));
  gaps.sort((a, b) => a - b);
  const mid = gaps.length % 2 ? gaps[(gaps.length - 1) / 2] ?? 0 : ((gaps[gaps.length / 2 - 1] ?? 0) + (gaps[gaps.length / 2] ?? 0)) / 2;
  const days = Math.round(mid / DAY_MS);
  if (days < 1) return null;
  if (days < 14) return days === 1 ? "day" : `${days} days`;
  const weeks = Math.round(days / 7);
  return `${weeks} weeks`;
}
const EARLIER_KEPT_MAX = 24;
export function earlierVisitsOf(rows, seasonIds) {
  const mine = rows.filter((r) => !seasonIds.has(r.id)).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const oldest = mine.at(-1);
  if (!oldest) return null;
  const kept = mine.filter((r) => r.status === "kept");
  const keptAt = kept.slice(0, EARLIER_KEPT_MAX).map((r) => r.starts_at);
  const floor = keptAt.length ? Date.parse(keptAt.at(-1) ?? "") : Infinity;
  return {
    kept: kept.length,
    missed: mine.filter((r) => r.status === "missed").length,
    last_kept_at: kept.at(0)?.starts_at ?? null,
    kept_at: keptAt,
    unmarked_at: mine.filter((r) => r.status === "booked" && Date.parse(r.starts_at) >= floor).map((r) => r.starts_at),
    first_at: oldest.starts_at
  };
}
function visitsHeadOf(season, earlier, zone, nowMs) {
  const W = VISITS_TAB_WORDS;
  const dayOf = (iso) => clockDate(Date.parse(iso), zone, nowMs);
  const lastKept = season.keptAt.length === 0 && earlier?.last_kept_at ? W.lastKept(dayOf(earlier.last_kept_at)) : null;
  return {
    kept: season.keptAt.length + (earlier?.kept ?? 0),
    missed: season.missed + (earlier?.missed ?? 0),
    cadence: visitCadenceOf(
      [...season.keptAt, ...(earlier?.kept_at ?? []).map((s) => Date.parse(s))],
      [...season.unmarkedAt, ...(earlier?.unmarked_at ?? []).map((s) => Date.parse(s))]
    ),
    toMark: season.toMark,
    lastKept,
    over: earlier ? W.since(dayOf(earlier.first_at)) : W.over(SEASON_BACK_DAYS)
  };
}
export function personVisitsOf({ profile, nowMs, base, dealsOn }) {
  const untitled = appointmentWords(appointmentWordWhere(dealsOn)).Title;
  const toMark = [];
  const ahead = [];
  const past = [];
  const keptAt = [];
  const unmarkedAt = [];
  let missed = 0;
  const visits = profile.visits;
  for (const v of visits?.all ?? []) {
    const t = Date.parse(v.start);
    if (!visits || !Number.isFinite(t)) continue;
    const zone = visits.timezone;
    const line = visitLineForDto(v, { zone, nowMs, person: { id: base.id, name: base.name } });
    const status = line.mark?.status;
    const said = status === "kept" || status === "missed" || status === "cancelled" ? status : null;
    const at = new Date(t);
    const day = visitDay(t, zone, nowMs);
    const weekday = day === "Today" || day === "Tomorrow" ? day : dateFormat("en-US", { timeZone: zone, weekday: "short" }).format(at);
    const start = dateFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(at);
    const row = {
      id: `v-${v.id}`,
      month: dateFormat("en-US", { timeZone: zone, month: "short" }).format(at),
      date: dateFormat("en-US", { timeZone: zone, day: "numeric" }).format(at),
      title: line.title || untitled,
      // A match the calendar guessed (a name) is said on a page about them, as Coming up says it (VisitLineVM.guess).
      sub: [said === "missed" ? VISITS_TAB_WORDS.notCounted : `${weekday} \xB7 ${start}`, line.guess ? line.match : null].filter(Boolean).join(" \xB7 "),
      said,
      saidWord: said && line.state ? line.state.text : null,
      visit: line,
      to: visitDoor(visitDateKey(v.start, zone), v.record_id)
    };
    if (said === "kept") keptAt.push(t);
    if (said === "missed") missed += 1;
    if (line.unmarked) {
      unmarkedAt.push(t);
      toMark.push({ t, row });
    } else if (line.state === null) ahead.push({ t, row });
    else past.push({ t, row });
  }
  const newest = (a, b) => b.t - a.t;
  const season = { keptAt, unmarkedAt, missed, toMark: toMark.length };
  return {
    head: visitsHeadOf(season, visits?.earlier ?? null, visits?.timezone ?? "UTC", nowMs),
    toMark: toMark.sort(newest).map((x) => x.row),
    ahead: ahead.sort((a, b) => a.t - b.t).map((x) => x.row),
    past: past.sort(newest).map((x) => x.row)
  };
}
