/**
 * Why to post now (the content loop PRD's 10.1): one reader of the reasons a business has this week, each with its
 * evidence, shared by the content plan and Campaigns so the fact is worked out once. Open time on a day (the book's room,
 * by contracts roomOf, the count Campaigns' paced offer reads), a new review of four or five stars, fresh footage, an
 * offer that runs, a service the owner said is new. A domain of its own that imports no other: Content and Campaigns
 * both lean on it.
 *
 * Pure over the facts its callers read (the edge's lib/opportunities, the dashboard's readers/plan.ts): no database,
 * provider or clock inside.
 */
import {
  claimsStanding,
  DAY_MS,
  dayInZone,
  freeWindows,
  roomOf,
  shiftKey,
  weekdayShortOf,
  type BookingRulesLike,
  type BusyBlock,
  type Closure,
  type Hours,
  type Opportunity,
  type OwnerClaim,
} from "@chanlytics/contracts";

/** A review as the reader needs it: its own id, its stars, the reviewer's first name and initial only, its words. */
export interface ReviewFact {
  id: string;
  rating: number;
  /** "Ana R.": a first name and an initial, never a full name (PRD 10.5). */
  by: string | null;
  words: string;
  at: string;
}

/** A file new this week that could be posted: what it is and what it shows, and whether its look found it usable. */
export interface FreshFileFact {
  id: string;
  kind: "image" | "video";
  shows: readonly string[];
  at: string;
  usable: boolean;
}

/** The business's hours, as the calendar's own readers take them. */
export interface HoursFacts {
  hours: Record<string, Hours | undefined> | undefined;
  closures: Closure[] | undefined;
  rules: BookingRulesLike | null;
}

/** Everything the reader reads, for one workspace, at one moment. */
export interface OpportunityFacts {
  zone: string;
  nowMs: number;
  /** The days the reasons are wanted for, day keys in the business's zone, first and last included. */
  from: string;
  to: string;
  hours: HoursFacts | null;
  /** What takes the book's time: its feed's appointments and Chanlytics' own, as busy blocks. Null where no book is read. */
  busy: readonly BusyBlock[] | null;
  reviews: readonly ReviewFact[];
  files: readonly FreshFileFact[];
  claims: readonly OwnerClaim[];
  /** Services the owner said are new (content_goals introduce_service), by the business's own name for each. */
  newServices: readonly string[];
}

/** Open time on a day is a reason to post once at least this much of the day's hours is open, and this many hours. */
const OPEN_SHARE_AT_LEAST = 0.4;
const OPEN_HOURS_AT_LEAST = 2;
/** A review is new for this many days. */
const REVIEW_NEW_DAYS = 14;

const WEEKDAY_LONG: Readonly<Record<string, string>> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};
/** A day key's weekday, as a sentence names it: "Thursday". */
const weekdayLongOf = (key: string): string => WEEKDAY_LONG[weekdayShortOf(key)] ?? key;

const windowDays = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let key = from; key <= to && out.length < 31; key = shiftKey(key, 1)) out.push(key);
  return out;
};

/**
 * Open time, day by day (PRD 10.1, open_capacity): the book's room by contracts roomOf, the count a paced offer reads, on
 * each day of the window that is at least partly open. Each says how many hours are open of how many the hours offer.
 */
export function openTimeByDay(facts: OpportunityFacts): { day: string; openHours: number; share: number }[] {
  if (!facts.hours || !facts.busy) return [];
  const today = dayInZone(facts.zone, facts.nowMs).key;
  const days = windowDays(facts.from, facts.to).filter((day) => day > today);
  if (days.length === 0) return [];
  const ahead = Math.round((Date.parse(`${facts.to}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY_MS) + 1;
  const free = {
    hours: facts.hours.hours,
    closures: facts.hours.closures,
    tz: facts.zone,
    rules: { ...facts.hours.rules, max_days_ahead: ahead },
    now: new Date(facts.nowMs),
  };
  const slotMin = facts.hours.rules?.slot_min ?? 30;
  const open = roomOf(freeWindows({ ...free, busy: [...facts.busy] }), free, ahead).by_day;
  const offered = roomOf(freeWindows({ ...free, busy: [] }), free, ahead).by_day;
  return days.flatMap((day) => {
    const all = offered.find((d) => d.day === day)?.open ?? 0;
    if (all === 0) return [];
    const left = open.find((d) => d.day === day)?.open ?? 0;
    return [{ day, openHours: Math.floor((left * slotMin) / 60), share: left / all }];
  });
}

function openCapacity(facts: OpportunityFacts): Opportunity[] {
  return openTimeByDay(facts)
    .filter((d) => d.share >= OPEN_SHARE_AT_LEAST && d.openHours >= OPEN_HOURS_AT_LEAST)
    .map((d) => ({
      key: `open_capacity:${d.day}`,
      kind: "open_capacity",
      says: `${weekdayLongOf(d.day)} has ${d.openHours} hours open`,
      day: d.day,
      until: d.day,
      service: null,
      strength: Math.min(1, d.share),
      evidence: { open_hours: d.openHours, open_share: Math.round(d.share * 100) / 100 },
    }));
}

function newReviews(facts: OpportunityFacts): Opportunity[] {
  const since = facts.nowMs - REVIEW_NEW_DAYS * DAY_MS;
  return facts.reviews
    .filter((r) => r.rating >= 4 && Date.parse(r.at) >= since && r.words.trim().length >= 12)
    .map((r) => ({
      key: `new_review:${r.id}`,
      kind: "new_review",
      says: r.by ? `${r.by} left ${r.rating} stars` : `A new ${r.rating}-star review`,
      day: null,
      until: null,
      service: null,
      strength: r.rating === 5 ? 0.8 : 0.6,
      evidence: { review_id: r.id, rating: r.rating, by: r.by },
    }));
}

function freshFootage(facts: OpportunityFacts): Opportunity[] {
  return facts.files
    .filter((f) => f.usable)
    .map((f) => ({
      key: `fresh_footage:${f.id}`,
      kind: "fresh_footage",
      says: f.kind === "video" ? "A new clip came in this week" : "A new photo came in this week",
      day: null,
      until: null,
      service: null,
      strength: f.kind === "video" ? 0.6 : 0.4,
      evidence: { file_id: f.id, shows: f.shows.slice(0, 3).join(", ") || null },
    }));
}

function offers(facts: OpportunityFacts): Opportunity[] {
  const today = dayInZone(facts.zone, facts.nowMs).key;
  return claimsStanding(
    facts.claims.filter((c) => c.kind === "offer"),
    today,
  ).map((c) => ({
    key: `offer:${c.id}`,
    kind: "offer",
    says: c.text,
    day: null,
    until: c.valid_until,
    service: null,
    strength: c.valid_until && c.valid_until <= facts.to ? 0.9 : 0.7,
    evidence: { claim_id: c.id },
  }));
}

function newServices(facts: OpportunityFacts): Opportunity[] {
  return facts.newServices.map((service) => ({
    key: `new_service:${service.toLowerCase()}`,
    kind: "new_service",
    says: `${service} is new`,
    day: null,
    until: null,
    service,
    strength: 0.7,
    evidence: { service },
  }));
}

/** The footage the reader reads, from the rows the plan reads: usable where its look found nothing to stop a post. */
export const freshFilesOf = (
  rows: readonly {
    id: string;
    kind: "image" | "video";
    shows: readonly string[];
    at: string;
    issues: readonly string[];
  }[],
): FreshFileFact[] =>
  rows.map((row) => ({ id: row.id, kind: row.kind, shows: row.shows, at: row.at, usable: row.issues.length === 0 }));

/** The services the owner said are new, from what their posts are for (content_goals introduce_service). */
export const newServicesOf = (goals: readonly { goal: string; service: string | null }[]): string[] =>
  goals.flatMap((goal) => (goal.goal === "introduce_service" && goal.service ? [goal.service] : []));

/** Every reason to post the facts hold, strongest first (PRD 10.1). */
export function opportunitiesFrom(facts: OpportunityFacts): Opportunity[] {
  return [
    ...openCapacity(facts),
    ...offers(facts),
    ...newServices(facts),
    ...newReviews(facts),
    ...freshFootage(facts),
  ].sort((a, b) => b.strength - a.strength || a.key.localeCompare(b.key));
}
