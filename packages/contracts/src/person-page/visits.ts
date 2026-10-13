/**
 * A person's Visits tab (canvas A, V-01): how their visits stand in one line (kept, missed, how often they come, how many
 * wait for a word), then the visits nobody has marked, those ahead, and those past, each a row with its month and day.
 * Read from the calendar's visits the person read carries (`profile.visits.all`), a season back (SEASON_BACK_DAYS), and
 * the record's count of theirs from before it (`profile.visits.earlier`, R7); the line says over how long it counts:
 * what the page holds, never more.
 */
import { visitDateKey, visitDay } from "../calendar/calendar-people";
import { visitDoor } from "../calendar/appointment-key";
import type { VisitLineVM } from "../calendar/calendar-words";
import { SEASON_BACK_DAYS } from "../calendar/feed-url";
import type { EarlierVisitsDto } from "../calendar/calendar-dto";
import { clockDate } from "../shared/clock";
import { visitLineForDto } from "../people/person-row";
import type { PersonCardContext } from "../people/person-cards";
import { DAY_MS, dateFormat } from "../shared/time";

export const VISITS_TAB_WORDS = {
  toMark: "To mark",
  ahead: "Ahead",
  past: "Past",
  none: "No visits ahead.",
  /** A visit the calendar names nothing for. */
  visit: "Visit",
  /** A missed visit: it is not a gap between visits, so the cadence does not read it. */
  notCounted: "Not counted in the gaps",
  kept: (n: number) => `${n} kept`,
  missed: (n: number) => `${n} missed`,
  cadence: (every: string) => `Usually every ${every}`,
  toMarkN: (n: number) => `${n} to mark`,
  /** Over how long the line counts: the season the read holds, or since the record's first visit of theirs. */
  over: (days: number) => `Last ${days} days`,
  since: (day: string) => `On record since ${day}`,
  /** Said when none was kept this season: the last they kept, before it. */
  lastKept: (day: string) => `Last kept ${day}`,
} as const;

/** One visit as the tab draws it: the leaf (month, day of the month), what it is, the line under it, and how it stands. */
export interface PersonVisitRowVM {
  id: string;
  month: string;
  date: string;
  title: string;
  sub: string;
  /** The member's word on it (kept, missed, cancelled); null while nobody has said. */
  said: "kept" | "missed" | "cancelled" | null;
  /** The word drawn for `said`, in the calendar's words; null with it. */
  saidWord: string | null;
  /** The visit as the one visit line, whose two presses a visit to mark asks. */
  visit: VisitLineVM;
  /** Where it opens on the Calendar. */
  to: string;
}

export interface PersonVisitsVM {
  /**
   * The line: what was kept and missed (the season's and the record's before it), how often, what waits for a word, the
   * last kept where none was this season, and over how long it counts.
   */
  head: { kept: number; missed: number; cadence: string | null; toMark: number; lastKept: string | null; over: string };
  /** Ended, and nobody has said whether they came: newest first. */
  toMark: PersonVisitRowVM[];
  /** Not ended and not marked: soonest first. */
  ahead: PersonVisitRowVM[];
  /** Marked, or ended and marked as cancelled: newest first. */
  past: PersonVisitRowVM[];
}

/**
 * How often they come: the middle gap between kept visits, said only from three kept visits on, and only while no visit
 * between the first and the last of them waits for a word (an unmarked one could be a fourth, and the gap would lie).
 * A missed visit is no gap: it is not counted.
 */
function visitCadenceOf(kept: readonly number[], unmarked: readonly number[]): string | null {
  if (kept.length < 3) return null;
  const at = [...kept].sort((a, b) => a - b);
  const first = at[0] ?? 0;
  const last = at[at.length - 1] ?? 0;
  if (unmarked.some((t) => t > first && t < last)) return null;
  const gaps = at.slice(1).map((t, i) => t - (at[i] ?? t));
  gaps.sort((a, b) => a - b);
  const mid =
    gaps.length % 2
      ? (gaps[(gaps.length - 1) / 2] ?? 0)
      : ((gaps[gaps.length / 2 - 1] ?? 0) + (gaps[gaps.length / 2] ?? 0)) / 2;
  const days = Math.round(mid / DAY_MS);
  if (days < 1) return null;
  if (days < 14) return days === 1 ? "day" : `${days} days`;
  const weeks = Math.round(days / 7);
  return `${weeks} weeks`;
}

/** How many of the record's earlier kept visits the cadence reads: a couple of dozen gaps say how often they come. */
const EARLIER_KEPT_MAX = 24;

/**
 * The record's rows of one person from before the season (packages/db earlierVisitRows), as the person read carries
 * them: kept and missed counted, the newest kept and the unmarked among them for the cadence, the earliest for "on
 * record since". A row the season already holds (its record_id among `seasonIds`) is left out, so none counts twice;
 * null with nothing earlier.
 */
export function earlierVisitsOf(
  rows: readonly { id: string; status: string; starts_at: string }[],
  seasonIds: ReadonlySet<string>,
): EarlierVisitsDto | null {
  const mine = rows
    .filter((r) => !seasonIds.has(r.id))
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
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
    first_at: oldest.starts_at,
  };
}

/**
 * The tab's line: the season's count and the record's from before it (R7), disjoint, so a regular's kept visits are all of
 * them; the cadence reads the season's kept after the record's newest (every earlier one is older than the season's).
 */
function visitsHeadOf(
  season: { keptAt: number[]; unmarkedAt: number[]; missed: number; toMark: number },
  earlier: EarlierVisitsDto | null,
  zone: string,
  nowMs: number,
): PersonVisitsVM["head"] {
  const W = VISITS_TAB_WORDS;
  const dayOf = (iso: string) => clockDate(Date.parse(iso), zone, nowMs);
  const lastKept = season.keptAt.length === 0 && earlier?.last_kept_at ? W.lastKept(dayOf(earlier.last_kept_at)) : null;
  return {
    kept: season.keptAt.length + (earlier?.kept ?? 0),
    missed: season.missed + (earlier?.missed ?? 0),
    cadence: visitCadenceOf(
      [...season.keptAt, ...(earlier?.kept_at ?? []).map((s) => Date.parse(s))],
      [...season.unmarkedAt, ...(earlier?.unmarked_at ?? []).map((s) => Date.parse(s))],
    ),
    toMark: season.toMark,
    lastKept,
    over: earlier ? W.since(dayOf(earlier.first_at)) : W.over(SEASON_BACK_DAYS),
  };
}

/** Their visits, as the Visits tab draws them. */
export function personVisitsOf({ profile, nowMs, base }: PersonCardContext): PersonVisitsVM {
  const toMark: { t: number; row: PersonVisitRowVM }[] = [];
  const ahead: { t: number; row: PersonVisitRowVM }[] = [];
  const past: { t: number; row: PersonVisitRowVM }[] = [];
  const keptAt: number[] = [];
  const unmarkedAt: number[] = [];
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
    const weekday =
      day === "Today" || day === "Tomorrow"
        ? day
        : dateFormat("en-US", { timeZone: zone, weekday: "short" }).format(at);
    const start = dateFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(at);
    const row: PersonVisitRowVM = {
      id: `v-${v.id}`,
      month: dateFormat("en-US", { timeZone: zone, month: "short" }).format(at),
      date: dateFormat("en-US", { timeZone: zone, day: "numeric" }).format(at),
      title: line.title || VISITS_TAB_WORDS.visit,
      // A match the calendar guessed (a name) is said on a page about them, as Coming up says it (VisitLineVM.guess).
      sub: [said === "missed" ? VISITS_TAB_WORDS.notCounted : `${weekday} · ${start}`, line.guess ? line.match : null]
        .filter(Boolean)
        .join(" · "),
      said,
      saidWord: said && line.state ? line.state.text : null,
      visit: line,
      to: visitDoor(visitDateKey(v.start, zone), v.record_id),
    };
    if (said === "kept") keptAt.push(t);
    if (said === "missed") missed += 1;
    if (line.unmarked) {
      unmarkedAt.push(t);
      toMark.push({ t, row });
    } else if (line.state === null) ahead.push({ t, row });
    else past.push({ t, row });
  }
  const newest = (a: { t: number }, b: { t: number }) => b.t - a.t;
  const season = { keptAt, unmarkedAt, missed, toMark: toMark.length };
  return {
    head: visitsHeadOf(season, visits?.earlier ?? null, visits?.timezone ?? "UTC", nowMs),
    toMark: toMark.sort(newest).map((x) => x.row),
    ahead: ahead.sort((a, b) => a.t - b.t).map((x) => x.row),
    past: past.sort(newest).map((x) => x.row),
  };
}
