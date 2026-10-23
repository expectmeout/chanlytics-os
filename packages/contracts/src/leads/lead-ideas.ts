/**
 * The ideas for a new search (§8.9, 00398), decided in code and written by the model: what each kind of business a
 * workspace searched for found and what came of its leads, the places an idea may name, and the question put to the
 * model. Its answer, read back into ready plans, is lead-ideas-read.ts (the two were one module over the length a
 * file may have). Pure: the dashboard's reader (server/leads/lead-suggestions.ts) hands in lead_suggest_history's
 * answer, and the eval runs the same functions over made-up workspaces.
 *
 * The code decides and the model writes (Ruben, 10 Oct 2026). A kind's verdict (it worked, it did not, its leads are
 * not reached yet, too early to say) is counted here and never judged by the model. Since decision 0070's option B an
 * idea may be either card's (places on Maps, or named people at companies) and anywhere in the US: the places listed
 * here (the home, an area searched, an area Claude named beside one) are offered by their ids, and any other US place is
 * named by its city, state or ZIP and planned by the same planner Ask's tool uses. A kind is never planned again in a
 * place it was searched in or ran dry in, whatever the model wrote. What the model may say of the history is the
 * numbers it is given; nothing here hands it a business's name, a person, a lead's address or a reply's words. The
 * question itself is lead-ideas-ask.ts.
 */
import { DAY_MS, MIN_MS } from "../shared/time";
import type { LeadIdeaDto } from "./lead-dtos";
import { leadKindKey, stateCode } from "./search/clean";
import type { LeadArea } from "./search/plan";

/** How many ideas the page shows. */
export const LEAD_IDEAS_MAX = 4;
/** How long a model that would not write them is left before it is asked again: the reads between say so instead. */
export const LEAD_SUGGEST_RETRY_MS = 10 * MIN_MS;
/** The sizes an idea's search may be, the smallest first; those past what is left this month are not offered. */
export const IDEA_SIZES = [25, 50, 100, 200] as const;
/** The most places the model is offered: the home, the areas searched, and the areas beside them. */
const IDEA_PLACES_MAX = 10;
/** The areas beside what was searched, at most. */
const IDEA_BESIDE_MAX = 4;

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

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const fieldText = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
/** A count: a whole number, never below zero. jsonb's numbers arrive as numbers; a bigint as a string. */
const fieldCount = (v: unknown): number => {
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
    Object.entries(obj(v))
      .map(([k, n]) => [k, fieldCount(n)] as const)
      .filter(([, n]) => n > 0),
  );

/** A kind's key, one of them (clean.ts leadKindKey): what a plan keeps and what the ideas group by. */
export const ideaKey = leadKindKey;

/** An area as a plan keeps it, or null where it is not one. */
function areaOf(v: unknown): LeadArea | null {
  const a = obj(v);
  const kind = a.kind === "zip" || a.kind === "city" || a.kind === "radius" ? a.kind : null;
  const label = fieldText(a.label);
  const state = fieldText(a.state).toUpperCase();
  if (!kind || label.length < 2 || !/^[A-Z]{2}$/.test(state)) return null;
  const c = obj(a.center);
  const center = typeof c.lat === "number" && typeof c.lng === "number" ? { lat: c.lat, lng: c.lng } : null;
  const zip = /^\d{5}$/.test(fieldText(a.zip)) ? fieldText(a.zip) : null;
  if ((kind === "radius" && !center) || (kind === "zip" && !zip)) return null;
  const radius = Math.min(200_000, Math.max(500, fieldCount(a.radius_m) || 8_000));
  const query = fieldText(a.query) || `${label}, ${state}, USA`;
  return { kind, label, state, center, radius_m: radius, ...(zip ? { zip } : {}), query };
}

const keyed = (v: unknown) =>
  arr(v)
    .map((x) => ({ key: fieldText(obj(x).key), text: fieldText(obj(x).text) }))
    .filter((x) => x.key && x.text);

function searchOf(v: unknown): IdeaSearch | null {
  const s = obj(v);
  const name = fieldText(s.name);
  if (!name) return null;
  const leads = obj(s.leads);
  const reach = obj(s.reach);
  const found = obj(s.found);
  const won = obj(s.won);
  const ending = fieldText(s.ending);
  return {
    kind: ideaKey(fieldText(s.kind) || name),
    name,
    area: areaOf(s.area),
    at: fieldText(s.at),
    removed: s.removed === true,
    ranDry: ending === "searched_everything" || ending === "few_new_matches",
    running: !!fieldText(s.state) && fieldText(s.state) !== "ended",
    fromIdea: s.from_idea === true,
    nearby: arr(s.nearby)
      .map(areaOf)
      .filter((a): a is LeadArea => !!a),
    exclusions: keyed(s.exclusions),
    criteria: keyed(s.criteria),
    found: {
      qualified: fieldCount(found.qualified),
      review: fieldCount(found.review),
      excluded: fieldCount(found.excluded),
    },
    leftOut: fieldCounts(s.left_out),
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
    notAFit: fieldCounts(s.not_a_fit_why),
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
  const h = obj(raw);
  const home = obj(h.home);
  const state = stateCode(fieldText(home.region));
  const listing = obj(h.listing);
  return {
    basis: ideaBasisOf(h.basis),
    home: state
      ? {
          city: fieldText(home.city) || null,
          state,
          zip: /^\d{5}/.test(fieldText(home.zip)) ? fieldText(home.zip).slice(0, 5) : null,
        }
      : null,
    listing: fieldText(listing.address) ? { address: fieldText(listing.address), type: fieldText(listing.type) } : null,
    searches: arr(h.searches)
      .map(searchOf)
      .filter((s): s is IdeaSearch => !!s),
  };
}

/** A round's end as the ideas keep it (lead_suggestions.basis): one spelling, whichever read said it. */
export function ideaBasisOf(v: unknown): string {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
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
  const m = last.match(/^([A-Za-z .]+?)\s+(\d{5})(?:-\d{4})?$/) ?? last.match(/^([A-Za-z .]+)$/);
  const state = m ? stateCode(m[1]) : null;
  if (!state) return null;
  return { city: parts.pop() || null, state, zip: m && m[2] ? m[2] : null };
}

/** Where the workspace is: its business record, else its Google listing's address, else the address its profile gives. */
function ideaHome(h: IdeaHistory, profileAddress: string): IdeaHome | null {
  return h.home ?? (h.listing ? homeOfAddress(h.listing.address) : null) ?? homeOfAddress(profileAddress);
}

/* --------------------------------------------------------- how each went -- */

/** Whether a kind's searches led anywhere, counted, never judged by the model. */
type IdeaVerdict = IdeaKind["verdict"];

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
interface KindSum {
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

function sumOf(searches: IdeaSearch[]): KindSum {
  const s: KindSum = {
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
  for (const x of searches) {
    const { found: f, leads: l, reach: r, won: w } = s;
    s.found = {
      qualified: f.qualified + x.found.qualified,
      review: f.review + x.found.review,
      excluded: f.excluded + x.found.excluded,
    };
    s.leads = {
      contacted: l.contacted + x.leads.contacted,
      interested: l.interested + x.leads.interested,
      booked: l.booked + x.leads.booked,
      customers: l.customers + x.leads.customers,
      said_no: l.said_no + x.leads.said_no,
      not_a_fit: l.not_a_fit + x.leads.not_a_fit,
      with_email: l.with_email + x.leads.with_email,
      with_phone: l.with_phone + x.leads.with_phone,
    };
    s.reach = {
      sent: r.sent + x.reach.sent,
      replied: r.replied + x.reach.replied,
      interested: r.interested + x.reach.interested,
      declined: r.declined + x.reach.declined,
    };
    s.won = { deals: w.deals + x.won.deals, cents: w.cents + x.won.cents };
    addInto(s.leftOut, x.leftOut);
    addInto(s.notAFit, x.notAFit);
    if (x.removed) s.removed++;
    if (x.running) s.running++;
    if (x.fromIdea) s.fromIdea++;
    s.lastSentAt = laterOf(s.lastSentAt, x.reach.lastSentAt);
    s.lastContactedAt = laterOf(s.lastContactedAt, x.leads.lastContactedAt);
    for (const e of [...x.exclusions, ...x.criteria]) s.withWords.set(e.key, e.text);
  }
  return s;
}

/**
 * The verdict, from the counts and the clock alone. A customer, a booking or a deal says the kind worked; so do two
 * interested answers, or replies enough over the emails sent. Silence says it did not work only once the last email
 * has had a week to be answered (SILENCE_DAYS): before that it is too early. A kind mostly said no, mostly not there
 * to find, or whose every search the owner removed, did not work.
 */
function verdictOf(s: KindSum, searches: number, now: Date): IdeaVerdict {
  const interested = s.reach.interested + s.leads.interested;
  if (
    s.leads.customers + s.leads.booked + s.won.deals > 0 ||
    interested >= INTERESTED_TO_SAY ||
    (s.reach.sent >= SENT_TO_SAY && s.reach.replied / s.reach.sent >= REPLIES_THAT_WORK)
  )
    return "worked";
  const closed = s.leads.said_no + s.leads.not_a_fit;
  const judged = s.found.qualified + s.found.review + s.found.excluded;
  const silent = s.reach.sent >= SENT_WITH_NONE && s.reach.replied === 0;
  if (
    (silent && daysAgo(s.lastSentAt, now) >= SILENCE_DAYS) ||
    (closed >= CLOSED_TO_SAY && closed >= CLOSED_THAT_FAIL * Math.max(s.leads.contacted, 1)) ||
    (judged >= JUDGED_TO_SAY && s.found.qualified + s.found.review <= KEPT_THAT_FAIL * judged) ||
    s.removed === searches
  )
    return "did_not_work";
  if (s.running) return "running";
  return s.leads.contacted === 0 && s.reach.sent === 0 ? "not_reached" : "too_early";
}

/** What left places out, in words: the kind, no way to reach them, the owner, or a plan's own exclusion or criterion. */
function leftOutWord(key: string, withWords: Map<string, string>): string {
  if (key === "kind") return "not this kind";
  if (key === "unreachable") return "no phone or email";
  if (key === "owner") return "removed by you";
  const said = withWords.get(key);
  return said ?? key.replace(/_/g, " ");
}

const NOT_A_FIT_WORDS: Record<string, string> = {
  chain: "a chain",
  wrong_kind: "the wrong kind",
  too_far: "too far",
  customer: "already a customer",
  other: "another reason",
};

/** The largest few of a tally, in words: "chains: 14, not this kind: 6". */
function topOf(t: Record<string, number>, word: (k: string) => string, n = 3): string {
  return Object.entries(t)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, c]) => `${word(k)}: ${c}`)
    .join(", ");
}

/** How long ago, as a person says it. */
function agoOf(at: string, now: Date): string {
  const days = Math.floor((now.getTime() - Date.parse(at)) / DAY_MS);
  if (!Number.isFinite(days) || days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

const VERDICT_SAYS: Record<IdeaVerdict, string> = {
  worked: "worked: build on it, the same kind in another listed place or a close kind",
  did_not_work: "did not work: do not suggest it again; a close kind only with what went wrong left out",
  running: "a search for it is still running or waiting on your answer: do not search it again now",
  not_reached: "its leads are not reached yet: do not search it again now",
  too_early: "too early to say (its leads were reached only lately): do not repeat it where it was searched",
};

/** What a kind's leads came to, in one line. */
function outcomeLine(s: KindSum): string {
  const parts = [`${s.leads.contacted} contacted`];
  if (s.reach.sent)
    parts.push(
      `${s.reach.sent} emailed, ${s.reach.replied} wrote back (${s.reach.interested} interested, ${s.reach.declined} said no)`,
    );
  if (s.leads.interested) parts.push(`${s.leads.interested} interested on a call`);
  parts.push(`${s.leads.booked} booked`, `${s.leads.customers} became customers`);
  if (s.won.deals) parts.push(`${s.won.deals} deals won (${dollars(s.won.cents)})`);
  if (s.leads.not_a_fit)
    parts.push(`${s.leads.not_a_fit} not a fit (${topOf(s.notAFit, (k) => NOT_A_FIT_WORDS[k] ?? k)})`);
  if (s.leads.said_no) parts.push(`${s.leads.said_no} said no`);
  return `Of its leads: ${parts.join("; ")}`;
}

function kindLines(s: KindSum, group: IdeaSearch[], dry: string[], now: Date): string[] {
  const places = [...new Set(group.map((x) => x.area?.label).filter(Boolean))].join("; ");
  const judged = s.found.qualified + s.found.review + s.found.excluded;
  const kept = s.found.qualified + s.found.review;
  const lines = [
    `Searched ${group.length === 1 ? "" : `${group.length} times, last `}${agoOf(group[0]?.at ?? "", now)}${places ? `, in ${places}` : ""}`,
    `Checked ${judged}: ${s.found.qualified} matched, ${s.found.review} to look at, ${s.found.excluded} left out${
      s.found.excluded ? ` (${topOf(s.leftOut, (k) => leftOutWord(k, s.withWords))})` : ""
    }`,
  ];
  if (kept) lines.push(`${s.leads.with_email} of its ${kept} leads list an email, ${s.leads.with_phone} a phone`);
  if (kept || s.leads.contacted) lines.push(outcomeLine(s));
  if (s.reach.sent && s.lastSentAt) lines.push(`Last emailed ${agoOf(s.lastSentAt, now)}`);
  if (s.running) lines.push("A search for it is still running, or waiting on your answer");
  if (dry.length) lines.push(`Ran dry in: ${dry.join("; ")}`);
  return lines;
}

/** Each kind the workspace searched for, newest first: what it found, what came of it, and the verdict. */
function ideaKinds(searches: IdeaSearch[], now: Date): IdeaKind[] {
  const groups = new Map<string, IdeaSearch[]>();
  for (const s of searches) groups.set(s.kind, [...(groups.get(s.kind) ?? []), s]);
  return [...groups.entries()].map(([key, group]) => {
    const s = sumOf(group);
    const dryLabels = group.flatMap((x) => (x.ranDry && x.area ? [x.area.label] : []));
    const verdict = verdictOf(s, group.length, now);
    return {
      key,
      name: group[0]?.name ?? key,
      searches: group.length,
      lastAt: group[0]?.at ?? "",
      places: [...new Set(group.map((x) => x.area?.label.toLowerCase()).filter((l): l is string => !!l))],
      dry: [...new Set(dryLabels.map((l) => l.toLowerCase()))],
      verdict,
      lines: [...kindLines(s, group, [...new Set(dryLabels)], now), `Verdict: ${VERDICT_SAYS[verdict]}`],
    };
  });
}

/* ---------------------------------------------------------- the places -- */

export interface IdeaPlace {
  /** P1, P2…: what the model names. */
  id: string;
  area: LeadArea;
  /** What the place is to this workspace: its home, an area searched, the area beside one. */
  note: string;
  /** The kinds that ran dry here, or were searched here: never planned here again. */
  takenFor: string[];
}

const zipArea = (zip: string, state: string): LeadArea => ({
  kind: "zip",
  label: `near ${zip}`,
  state,
  center: null,
  radius_m: 8_000,
  zip,
  query: `${zip}, ${state}, USA`,
});
const cityArea = (city: string, state: string): LeadArea => ({
  kind: "city",
  label: `${city}, ${state}`,
  state,
  center: null,
  radius_m: 25_000,
  query: `${city}, ${state}, USA`,
});

/** The places an idea may name, each once: the home first, then the areas searched, then the areas beside them. */
function ideaPlaces(home: IdeaHome | null, searches: IdeaSearch[]): IdeaPlace[] {
  const out: IdeaPlace[] = [];
  const add = (area: LeadArea, note: string) => {
    const label = area.label.toLowerCase();
    if (out.length >= IDEA_PLACES_MAX || out.some((p) => p.area.label.toLowerCase() === label)) return;
    const takenFor = searches.filter((s) => s.area && s.area.label.toLowerCase() === label).map((s) => s.kind);
    out.push({ id: `P${out.length + 1}`, area, note, takenFor: [...new Set(takenFor)] });
  };
  if (home && home.zip) add(zipArea(home.zip, home.state), "home");
  if (home && home.city) add(cityArea(home.city, home.state), "home city");
  for (const s of searches) if (s.area) add(s.area, s.ranDry ? `searched, ran dry for ${s.name}` : "searched");
  let beside = 0;
  for (const s of searches)
    for (const a of s.nearby) {
      if (beside >= IDEA_BESIDE_MAX) break;
      const before = out.length;
      add(a, `beside ${s.area ? s.area.label : "a search"}`);
      if (out.length > before) beside++;
    }
  // The home ZIP lies in the home city: a kind searched in either is taken in both, since the two overlap. (Two
  // searched areas that overlap elsewhere are not known to: the finder itself skips the places already found.)
  const homes = out.filter((x) => x.note === "home" || x.note === "home city");
  if (homes.length === 2) {
    const both = [...new Set(homes.flatMap((x) => x.takenFor))];
    for (const h of homes) h.takenFor = both;
  }
  return out;
}

/* --------------------------------------------------------- the question -- */

/** An idea offered before and not started, by its kind and place, and how many times it was offered. */
export interface IdeaPassed {
  key: string;
  /** The place's label, in lower case. */
  place: string;
  /** The place's label as the page said it. */
  label: string;
  times: number;
}

/** The language the ideas are written in: the workspace's own tag (tenants.locale, "en", "es-MX"); the model writes it. */
export type IdeaLanguage = string;

/** Where an idea finds, as the page names it: its places plan's area, or the states its people plan covers. */
export const ideaWhere = (i: Pick<LeadIdeaDto, "plan" | "people">): string | null =>
  (i.plan ?? i.people)?.area.label ?? null;

/**
 * The ideas offered before and not started since, each counted once more (IDEA_PASSED_ENOUGH says when that is a no),
 * and those started since let go. Earlier counts are kept for ideas not offered this time, at most twelve, so a kind
 * passed on twice stays passed on when it is offered again months later.
 */
export function ideaPassed(
  prev: { items: LeadIdeaDto[]; madeAt: string; passed: IdeaPassed[] },
  searches: IdeaSearch[],
): IdeaPassed[] {
  const since = Date.parse(prev.madeAt);
  const startedSince = (key: string, place: string) =>
    searches.some(
      (s) =>
        s.kind === key &&
        !!s.area &&
        s.area.label.toLowerCase() === place &&
        (!Number.isFinite(since) || Date.parse(s.at) >= since),
    );
  const out = new Map<string, IdeaPassed>();
  for (const x of prev.passed) out.set(`${x.key}@${x.place}`, { ...x });
  for (const i of prev.items) {
    const label = ideaWhere(i);
    if (!label) continue;
    const place = label.toLowerCase();
    const at = `${i.category_key}@${place}`;
    if (startedSince(i.category_key, place)) {
      out.delete(at);
      continue;
    }
    const before = out.get(at);
    out.set(at, { key: i.category_key, place, label, times: (before?.times ?? 0) + 1 });
  }
  return [...out.values()].slice(-12);
}

/** The passed ideas as a row keeps them (lead_suggestions.passed), narrowed. */
export function ideaPassedOf(raw: unknown): IdeaPassed[] {
  return arr(raw).flatMap((x) => {
    const o = obj(x);
    const key = fieldText(o.key);
    const label = fieldText(o.label);
    return key && label
      ? [{ key, place: fieldText(o.place) || label.toLowerCase(), label, times: fieldCount(o.times) || 1 }]
      : [];
  });
}

/**
 * What the workspace says of itself beyond its line: its business profile whole (Ruben, 22 Oct 2026: the ideas read a
 * fuller picture than a line): every service with its length and price where it says them, every note, its website,
 * its hours and the languages it serves in.
 */
export interface IdeaAbout {
  /** "Haircut (45 min, from $45)": each service with what the profile says of it. */
  services: string[];
  notes: string[];
  website: string | null;
  /** Its opening hours, a line a day as the receptionist says them; none where the profile has none. */
  hours?: string[];
  /** The languages it serves customers in. */
  languages?: string[];
}

/**
 * Who the workspace's customers are so far (Ruben, 22 Oct 2026): how its people came, which kinds of business its leads
 * that became customers were, and what its won deals were for and with whom by kind. The strongest word on who buys
 * once there is any, beside what each search found; counted here from the rows (ideaCustomersOf), never by the model.
 */
export interface IdeaCustomers {
  /** People kept in People. */
  people: number;
  /** How they came, the most first: "call", "whatsapp", "lead", "import". */
  arrived: { via: string; n: number }[];
  /** Those who came from Leads. */
  fromLeads: number;
  /** Leads that became customers, by their kind ("dentist"), the most first. */
  converted: { kind: string; n: number }[];
  /** Deals won, standing or since ended: how many, what for, and the kind of business they were with where known. */
  won: { deals: number; services: { name: string; n: number }[]; kinds: { kind: string; n: number }[] };
}

/** The rows the count is made from (packages/db ideaCustomerRows): people, leads and won deals. */
export interface IdeaCustomerRowsIn {
  contacts: { id: string; acquired_via: string | null; lead_id: string | null }[];
  leads: { id: string; category: string | null; stage: string }[];
  deals: { service: string | null; lead_id: string | null; contact_id: string | null }[];
}

/** How many of each count the model is told: the most first, enough to see a pattern without a page of tail. */
const CUSTOMER_TOP = 8;

/** A lead's kind as the model reads it: its category in plain words ("law firm"), or none. */
const kindWords = (category: string | null): string =>
  category ? category.replace(/_/g, " ").trim().toLowerCase() : "";

/** Counts by key, the most first, then by name, at most CUSTOMER_TOP. */
function mostFirst(keys: (string | null)[]): { key: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const k of keys) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, CUSTOMER_TOP)
    .map(([key, n]) => ({ key, n }));
}

/**
 * Who the customers are, counted from the rows: a won deal's kind is its lead's, or the lead its person came from.
 * Pure: the server reads the rows, this decides what they say.
 */
export function ideaCustomersOf(rows: IdeaCustomerRowsIn): IdeaCustomers {
  const kindOfLead = new Map(rows.leads.map((l) => [l.id, kindWords(l.category)]));
  const leadOfPerson = new Map(rows.contacts.map((c) => [c.id, c.lead_id]));
  const leadOfDeal = (d: IdeaCustomerRowsIn["deals"][number]) =>
    d.lead_id ?? (d.contact_id ? (leadOfPerson.get(d.contact_id) ?? null) : null);
  return {
    people: rows.contacts.length,
    arrived: mostFirst(rows.contacts.map((c) => c.acquired_via)).map(({ key, n }) => ({ via: key, n })),
    fromLeads: rows.contacts.filter((c) => c.lead_id).length,
    converted: mostFirst(rows.leads.filter((l) => l.stage === "converted").map((l) => kindWords(l.category))).map(
      ({ key, n }) => ({ kind: key, n }),
    ),
    won: {
      deals: rows.deals.length,
      services: mostFirst(rows.deals.map((d) => d.service?.trim() || null)).map(({ key, n }) => ({ name: key, n })),
      kinds: mostFirst(
        rows.deals.map((d) => {
          const lead = leadOfDeal(d);
          return lead ? kindOfLead.get(lead) || null : null;
        }),
      ).map(({ key, n }) => ({ kind: key, n })),
    },
  };
}

export interface IdeaPacket {
  /** The business, as its owner said it or as the workspace says it is. */
  line: string;
  about: IdeaAbout;
  /** What the team told Ask about the business (decision 0070): its memory's lines, the newest first. */
  memory: string[];
  /** Who its customers are so far, or null where they could not be read. */
  customers: IdeaCustomers | null;
  /** The Google listing's own type, when one is linked: "plumber". */
  listingType: string | null;
  /** The workspace's own kind, keyed, when its listing says one: never an idea, since those are its competitors. */
  ownKind: string | null;
  /** Ideas offered before and not started, each with how many times. */
  passed: IdeaPassed[];
  language: IdeaLanguage;
  home: IdeaHome | null;
  leadsLeft: number;
  sizes: number[];
  places: IdeaPlace[];
  kinds: IdeaKind[];
  now: Date;
}

/** Everything the model is told, decided here. */
export function ideaPacket(x: {
  line: string;
  about?: IdeaAbout;
  memory?: string[];
  customers?: IdeaCustomers | null;
  history: IdeaHistory;
  profileAddress: string;
  leadsLeft: number;
  passed: IdeaPassed[];
  language: IdeaLanguage;
  now: Date;
}): IdeaPacket {
  const home = ideaHome(x.history, x.profileAddress);
  const room = Math.max(IDEA_SIZES[0], x.leadsLeft);
  const type = x.history.listing && x.history.listing.type ? x.history.listing.type : "";
  return {
    line: x.line,
    about: x.about ?? { services: [], notes: [], website: null },
    memory: x.memory ?? [],
    customers: x.customers ?? null,
    listingType: type ? type.replace(/_/g, " ") : null,
    ownKind: type ? leadKindKey(type) : null,
    passed: x.passed,
    language: x.language,
    home,
    leadsLeft: Math.max(0, x.leadsLeft),
    sizes: IDEA_SIZES.filter((n) => n <= room),
    places: ideaPlaces(home, x.history.searches),
    kinds: ideaKinds(x.history.searches, x.now),
    now: x.now,
  };
}
