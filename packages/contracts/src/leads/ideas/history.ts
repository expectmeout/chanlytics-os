/** Ideas: history. */

import { DAY_MS, MIN_MS } from "../../shared/time";
import { leadKindKey, stateCode } from "../search/clean";
import type { LeadArea } from "../search/plan";
import { US_ZIP } from "../search/caps";
import { recordOrEmpty } from "../../shared/unknown";

/** How many ideas the page shows: three (Ruben, 23 Oct 2026: it was four, one more row than a phone's page holds well). */
export const LEAD_IDEAS_MAX = 3;

/** How long a model that would not write them is left before it is asked again: the reads between say so instead. */
export const LEAD_SUGGEST_RETRY_MS = 10 * MIN_MS;

/** The sizes an idea's search may be, the smallest first; those past what is left this month are not offered. */
export const IDEA_SIZES = [25, 50, 100, 200] as const;

/** The most places the model is offered: the home, the areas searched, and the areas beside them. */
export const IDEA_PLACES_MAX = 10;

/** The areas beside what was searched, at most. */
export const IDEA_BESIDE_MAX = 4;

/* ------------------------------------------------------ what was searched -- */

/** One search as lead_suggest_history answers it, narrowed. */
export interface IdeaSearch {
  /** The plan's category_key, or a key from its name on a plan made before it was kept. */
  kind: string;
  name: string;
  area: LeadArea | null;
  at: string;
  removed: boolean;
  /** Its newest round ended with nothing left to find there (searched everything, or few new matches). */
  ranDry: boolean;
  /** Its newest round is still running, or waiting on the owner's answer. */
  running: boolean;
  /** It was started from an idea (plan.from, 00398): the ideas' own measure of whether they are followed. */
  fromIdea: boolean;
  nearby: LeadArea[];
  exclusions: { key: string; text: string }[];
  criteria: { key: string; text: string }[];
  found: { qualified: number; review: number; excluded: number };
  /** Places left out, by the key that left them out (contracts class.ts: kind, unreachable, owner, a plan's key). */
  leftOut: Record<string, number>;
  leads: {
    contacted: number;
    interested: number;
    booked: number;
    customers: number;
    said_no: number;
    not_a_fit: number;
    with_email: number;
    with_phone: number;
    /** When one of its leads was last contacted, or null. */
    lastContactedAt: string | null;
  };
  /** Why leads were not a fit (LEAD_NOT_A_FIT_WHYS), as the owner said it. */
  notAFit: Record<string, number>;
  /** The reach-out to its leads: emails sent, replies by a person, and when the last email went. */
  reach: { sent: number; replied: number; interested: number; declined: number; lastSentAt: string | null };
  won: { deals: number; cents: number };
}

export interface IdeaHome {
  city: string | null;
  state: string;
  zip: string | null;
}

export interface IdeaHistory {
  /** The end of the newest ended round: what ideas written now are written over. */
  basis: string;
  /** The business record's city, state and ZIP, when the workspace has one. */
  home: IdeaHome | null;
  /** The Google listing's address and its type ("plumber"), when one is linked. */
  listing: { address: string; type: string } | null;
  searches: IdeaSearch[];
}

export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const fieldText = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** A count: a whole number, never below zero. jsonb's numbers arrive as numbers; a bigint as a string. */
export const fieldCount = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : 0;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** A moment, as an ISO string, or null where there is none. */
const whenOf = (v: unknown): string | null => {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

const fieldCounts = (v: unknown): Record<string, number> =>
  Object.fromEntries(
    Object.entries(recordOrEmpty(v))
      .map(([k, n]) => [k, fieldCount(n)] as const)
      .filter(([, n]) => n > 0),
  );

/** A kind's key, one of them (clean.ts leadKindKey): what a plan keeps and what the ideas group by. */
export const ideaKey = leadKindKey;

/** An area as a plan keeps it, or null where it is not one. */
function areaOf(value: unknown): LeadArea | null {
  const result = recordOrEmpty(value);
  const kind = result.kind === "zip" || result.kind === "city" || result.kind === "radius" ? result.kind : null;
  const label = fieldText(result.label);
  const state = fieldText(result.state).toUpperCase();
  if (!kind || label.length < 2 || !/^[A-Z]{2}$/.test(state)) return null;
  const otherObj = recordOrEmpty(result.center);
  const center =
    typeof otherObj.lat === "number" && typeof otherObj.lng === "number"
      ? { lat: otherObj.lat, lng: otherObj.lng }
      : null;
  const zip = US_ZIP.test(fieldText(result.zip)) ? fieldText(result.zip) : null;
  if ((kind === "radius" && !center) || (kind === "zip" && !zip)) return null;
  const radius = Math.min(200_000, Math.max(500, fieldCount(result.radius_m) || 8_000));
  const query = fieldText(result.query) || `${label}, ${state}, USA`;
  return { kind, label, state, center, radius_m: radius, ...(zip ? { zip } : {}), query };
}

const keyed = (v: unknown) =>
  arr(v)
    .map((x) => ({ key: fieldText(recordOrEmpty(x).key), text: fieldText(recordOrEmpty(x).text) }))
    .filter((x) => x.key && x.text);

function searchOf(value: unknown): IdeaSearch | null {
  const result = recordOrEmpty(value);
  const name = fieldText(result.name);
  if (!name) return null;
  const leads = recordOrEmpty(result.leads);
  const reach = recordOrEmpty(result.reach);
  const found = recordOrEmpty(result.found);
  const won = recordOrEmpty(result.won);
  const ending = fieldText(result.ending);
  return {
    kind: ideaKey(fieldText(result.kind) || name),
    name,
    area: areaOf(result.area),
    at: fieldText(result.at),
    removed: result.removed === true,
    ranDry: ending === "searched_everything" || ending === "few_new_matches",
    running: !!fieldText(result.state) && fieldText(result.state) !== "ended",
    fromIdea: result.from_idea === true,
    nearby: arr(result.nearby)
      .map(areaOf)
      .filter((a): a is LeadArea => !!a),
    exclusions: keyed(result.exclusions),
    criteria: keyed(result.criteria),
    found: {
      qualified: fieldCount(found.qualified),
      review: fieldCount(found.review),
      excluded: fieldCount(found.excluded),
    },
    leftOut: fieldCounts(result.left_out),
    leads: {
      contacted: fieldCount(leads.contacted),
      interested: fieldCount(leads.interested),
      booked: fieldCount(leads.booked),
      customers: fieldCount(leads.customers),
      said_no: fieldCount(leads.said_no),
      not_a_fit: fieldCount(leads.not_a_fit),
      with_email: fieldCount(leads.with_email),
      with_phone: fieldCount(leads.with_phone),
      lastContactedAt: whenOf(leads.last_contacted_at),
    },
    notAFit: fieldCounts(result.not_a_fit_why),
    reach: {
      sent: fieldCount(reach.sent),
      replied: fieldCount(reach.replied),
      interested: fieldCount(reach.interested),
      declined: fieldCount(reach.declined),
      lastSentAt: whenOf(reach.last_sent_at),
    },
    won: { deals: fieldCount(won.deals), cents: fieldCount(won.cents) },
  };
}

/** lead_suggest_history's jsonb, narrowed: anything it does not say is nothing found. */
export function ideaHistoryOf(raw: unknown): IdeaHistory {
  const result = recordOrEmpty(raw);
  const home = recordOrEmpty(result.home);
  const state = stateCode(fieldText(home.region));
  const listing = recordOrEmpty(result.listing);
  return {
    basis: ideaBasisOf(result.basis),
    home: state
      ? {
          city: fieldText(home.city) || null,
          state,
          zip: /^\d{5}/.test(fieldText(home.zip)) ? fieldText(home.zip).slice(0, 5) : null,
        }
      : null,
    listing: fieldText(listing.address) ? { address: fieldText(listing.address), type: fieldText(listing.type) } : null,
    searches: arr(result.searches)
      .map(searchOf)
      .filter((s): s is IdeaSearch => !!s),
  };
}

/** A round's end as the ideas keep it (lead_suggestions.basis): one spelling, whichever read said it. */
export function ideaBasisOf(value: unknown): string {
  const t = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
}

/* ------------------------------------------------------------ where it is -- */

/** "12 Main St, Austin, TX 78701, USA" -> Austin, TX, 78701. */
function homeOfAddress(address: string): IdeaHome | null {
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  while (/^(usa|us|united states( of america)?)$/i.test(parts.at(-1) ?? "")) parts.pop();
  const last = parts.pop() ?? "";
  const match = last.match(/^([A-Za-z .]+?)\s+(\d{5})(?:-\d{4})?$/) ?? last.match(/^([A-Za-z .]+)$/);
  const state = match ? stateCode(match[1]) : null;
  if (!state) return null;
  return { city: parts.pop() || null, state, zip: match && match[2] ? match[2] : null };
}

/** Where the workspace is: its business record, else its Google listing's address, else the address its profile gives. */
export function ideaHome(h: IdeaHistory, profileAddress: string): IdeaHome | null {
  return h.home ?? (h.listing ? homeOfAddress(h.listing.address) : null) ?? homeOfAddress(profileAddress);
}

/* --------------------------------------------------------- how each went -- */

/** Whether a kind's searches led anywhere, counted, never judged by the model. */
export type IdeaVerdict = IdeaKind["verdict"];

/** Replies over emails sent that count as working, once enough were sent to say. */
const REPLIES_THAT_WORK = 0.15;

const SENT_TO_SAY = 5;

/** Interested answers (on a call, or in a reply) that say a kind worked: one is a person, two are a kind. */
const INTERESTED_TO_SAY = 2;

/** Emails sent with no reply at all that say a kind did not work, once the last of them has had this long. */
const SENT_WITH_NONE = 10;

const SILENCE_DAYS = 7;

/**
 * An idea offered this many times and not started is passed on: not offered again, whatever the model wrote. The question
 * asks for none offered before at all (decision 0070: New ideas keeps what was shown to pass it on, so each press is new
 * ideas); the code's own stop is the second showing, so a model that repeats one still leaves the others standing.
 */
export const IDEA_PASSED_ENOUGH = 2;

/** Said no or not a fit, over those contacted, that say a kind did not work, once there are this many. */
const CLOSED_THAT_FAIL = 0.4;

const CLOSED_TO_SAY = 3;

/** Places judged, of which this share or less were kept, that say the kind is mostly not there to find. */
const JUDGED_TO_SAY = 20;

const KEPT_THAT_FAIL = 0.15;

export interface IdeaKind {
  key: string;
  name: string;
  searches: number;
  lastAt: string;
  /** The places it was searched in, by their labels in lower case. */
  places: string[];
  /** The places it ran dry in, the same way. */
  dry: string[];
  verdict: "worked" | "did_not_work" | "running" | "not_reached" | "too_early";
  /** What it found and what came of it, in lines for the model. */
  lines: string[];
}

type Leads = IdeaSearch["leads"];

type Reach = IdeaSearch["reach"];

export interface KindSum {
  found: IdeaSearch["found"];
  /** The counts alone: the moments are summed apart (lastContactedAt, lastSentAt). */
  leads: Omit<Leads, "lastContactedAt">;
  reach: Omit<Reach, "lastSentAt">;
  won: IdeaSearch["won"];
  leftOut: Record<string, number>;
  notAFit: Record<string, number>;
  removed: number;
  running: number;
  fromIdea: number;
  lastSentAt: string | null;
  lastContactedAt: string | null;
  withWords: Map<string, string>;
}

/** The later of two moments, either of which may be missing. */
const laterOf = (a: string | null, b: string | null): string | null =>
  !a ? b : !b ? a : Date.parse(b) > Date.parse(a) ? b : a;

/** How many whole days ago a moment was; a moment missing is long ago. */
const daysAgo = (at: string | null, now: Date): number =>
  at ? Math.floor((now.getTime() - Date.parse(at)) / DAY_MS) : Number.POSITIVE_INFINITY;

const addInto = (into: Record<string, number>, from: Record<string, number>) => {
  for (const [k, n] of Object.entries(from)) into[k] = (into[k] ?? 0) + n;
};

export function sumOf(searches: IdeaSearch[]): KindSum {
  const kindSum: KindSum = {
    found: { qualified: 0, review: 0, excluded: 0 },
    leads: {
      contacted: 0,
      interested: 0,
      booked: 0,
      customers: 0,
      said_no: 0,
      not_a_fit: 0,
      with_email: 0,
      with_phone: 0,
    },
    reach: { sent: 0, replied: 0, interested: 0, declined: 0 },
    won: { deals: 0, cents: 0 },
    leftOut: {},
    notAFit: {},
    removed: 0,
    running: 0,
    fromIdea: 0,
    lastSentAt: null,
    lastContactedAt: null,
    withWords: new Map(),
  };
  for (const search of searches) {
    const { found: f, leads: l, reach: r, won: w } = kindSum;
    kindSum.found = {
      qualified: f.qualified + search.found.qualified,
      review: f.review + search.found.review,
      excluded: f.excluded + search.found.excluded,
    };
    kindSum.leads = {
      contacted: l.contacted + search.leads.contacted,
      interested: l.interested + search.leads.interested,
      booked: l.booked + search.leads.booked,
      customers: l.customers + search.leads.customers,
      said_no: l.said_no + search.leads.said_no,
      not_a_fit: l.not_a_fit + search.leads.not_a_fit,
      with_email: l.with_email + search.leads.with_email,
      with_phone: l.with_phone + search.leads.with_phone,
    };
    kindSum.reach = {
      sent: r.sent + search.reach.sent,
      replied: r.replied + search.reach.replied,
      interested: r.interested + search.reach.interested,
      declined: r.declined + search.reach.declined,
    };
    kindSum.won = { deals: w.deals + search.won.deals, cents: w.cents + search.won.cents };
    addInto(kindSum.leftOut, search.leftOut);
    addInto(kindSum.notAFit, search.notAFit);
    if (search.removed) kindSum.removed++;
    if (search.running) kindSum.running++;
    if (search.fromIdea) kindSum.fromIdea++;
    kindSum.lastSentAt = laterOf(kindSum.lastSentAt, search.reach.lastSentAt);
    kindSum.lastContactedAt = laterOf(kindSum.lastContactedAt, search.leads.lastContactedAt);
    for (const e of [...search.exclusions, ...search.criteria]) kindSum.withWords.set(e.key, e.text);
  }
  return kindSum;
}

/**
 * The verdict, from the counts and the clock alone. A customer, a booking or a deal says the kind worked; so do two
 * interested answers, or replies enough over the emails sent. Silence says it did not work only once the last email
 * has had a week to be answered (SILENCE_DAYS): before that it is too early. A kind mostly said no, mostly not there
 * to find, or whose every search the owner removed, did not work.
 */
export function verdictOf(kindSum: KindSum, searches: number, now: Date): IdeaVerdict {
  const interested = kindSum.reach.interested + kindSum.leads.interested;
  if (
    kindSum.leads.customers + kindSum.leads.booked + kindSum.won.deals > 0 ||
    interested >= INTERESTED_TO_SAY ||
    (kindSum.reach.sent >= SENT_TO_SAY && kindSum.reach.replied / kindSum.reach.sent >= REPLIES_THAT_WORK)
  )
    return "worked";
  const closed = kindSum.leads.said_no + kindSum.leads.not_a_fit;
  const judged = kindSum.found.qualified + kindSum.found.review + kindSum.found.excluded;
  const silent = kindSum.reach.sent >= SENT_WITH_NONE && kindSum.reach.replied === 0;
  if (
    (silent && daysAgo(kindSum.lastSentAt, now) >= SILENCE_DAYS) ||
    (closed >= CLOSED_TO_SAY && closed >= CLOSED_THAT_FAIL * Math.max(kindSum.leads.contacted, 1)) ||
    (judged >= JUDGED_TO_SAY && kindSum.found.qualified + kindSum.found.review <= KEPT_THAT_FAIL * judged) ||
    kindSum.removed === searches
  )
    return "did_not_work";
  if (kindSum.running) return "running";
  return kindSum.leads.contacted === 0 && kindSum.reach.sent === 0 ? "not_reached" : "too_early";
}
