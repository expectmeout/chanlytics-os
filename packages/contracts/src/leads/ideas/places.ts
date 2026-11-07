/** Ideas: places. */

import { DAY_MS } from "../../shared/time";
import type { LeadIdeaDto } from "../dtos";
import { leadKindKey } from "../search/clean";
import type { LeadArea } from "../search/plan";
import {
  IDEA_BESIDE_MAX,
  IDEA_PLACES_MAX,
  IDEA_SIZES,
  arr,
  fieldCount,
  fieldText,
  ideaHome,
  sumOf,
  type IdeaHistory,
  type IdeaHome,
  type IdeaKind,
  type IdeaSearch,
  type IdeaVerdict,
  type KindSum,
  verdictOf,
} from "./history";
import { recordOrEmpty } from "../../shared/unknown";

/** What left places out, in words: the kind, no way to reach them, the owner, or a plan's own exclusion or criterion. */
function leftOutWord(key: string, withWords: Map<string, string>): string {
  if (key === "kind") return "not this kind";
  if (key === "unreachable") return "no phone or email";
  if (key === "owner") return "removed by you";
  const sentence = withWords.get(key);
  return sentence ?? key.replace(/_/g, " ");
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
function outcomeLine(kindSum: KindSum): string {
  const parts = [`${kindSum.leads.contacted} contacted`];
  if (kindSum.reach.sent)
    parts.push(
      `${kindSum.reach.sent} emailed, ${kindSum.reach.replied} wrote back (${kindSum.reach.interested} interested, ${kindSum.reach.declined} said no)`,
    );
  if (kindSum.leads.interested) parts.push(`${kindSum.leads.interested} interested on a call`);
  parts.push(`${kindSum.leads.booked} booked`, `${kindSum.leads.customers} became customers`);
  if (kindSum.won.deals) parts.push(`${kindSum.won.deals} deals won (${dollars(kindSum.won.cents)})`);
  if (kindSum.leads.not_a_fit)
    parts.push(`${kindSum.leads.not_a_fit} not a fit (${topOf(kindSum.notAFit, (k) => NOT_A_FIT_WORDS[k] ?? k)})`);
  if (kindSum.leads.said_no) parts.push(`${kindSum.leads.said_no} said no`);
  return `Of its leads: ${parts.join("; ")}`;
}

function kindLines(kindSum: KindSum, group: IdeaSearch[], dry: string[], now: Date): string[] {
  const places = [...new Set(group.map((x) => x.area?.label).filter(Boolean))].join("; ");
  const judged = kindSum.found.qualified + kindSum.found.review + kindSum.found.excluded;
  const kept = kindSum.found.qualified + kindSum.found.review;
  const lines = [
    `Searched ${group.length === 1 ? "" : `${group.length} times, last `}${agoOf(group[0]?.at ?? "", now)}${places ? `, in ${places}` : ""}`,
    `Checked ${judged}: ${kindSum.found.qualified} matched, ${kindSum.found.review} to look at, ${kindSum.found.excluded} left out${
      kindSum.found.excluded ? ` (${topOf(kindSum.leftOut, (k) => leftOutWord(k, kindSum.withWords))})` : ""
    }`,
  ];
  if (kept)
    lines.push(`${kindSum.leads.with_email} of its ${kept} leads list an email, ${kindSum.leads.with_phone} a phone`);
  if (kept || kindSum.leads.contacted) lines.push(outcomeLine(kindSum));
  if (kindSum.reach.sent && kindSum.lastSentAt) lines.push(`Last emailed ${agoOf(kindSum.lastSentAt, now)}`);
  if (kindSum.running) lines.push("A search for it is still running, or waiting on your answer");
  if (dry.length) lines.push(`Ran dry in: ${dry.join("; ")}`);
  return lines;
}

/** Each kind the workspace searched for, newest first: what it found, what came of it, and the verdict. */
function ideaKinds(searches: IdeaSearch[], now: Date): IdeaKind[] {
  const groups = new Map<string, IdeaSearch[]>();
  for (const s of searches) groups.set(s.kind, [...(groups.get(s.kind) ?? []), s]);
  return [...groups.entries()].map(([key, group]) => {
    const sum = sumOf(group);
    const dryLabels = group.flatMap((x) => (x.ranDry && x.area ? [x.area.label] : []));
    const verdict = verdictOf(sum, group.length, now);
    return {
      key,
      name: group[0]?.name ?? key,
      searches: group.length,
      lastAt: group[0]?.at ?? "",
      places: [...new Set(group.map((x) => x.area?.label.toLowerCase()).filter((l): l is string => !!l))],
      dry: [...new Set(dryLabels.map((l) => l.toLowerCase()))],
      verdict,
      lines: [...kindLines(sum, group, [...new Set(dryLabels)], now), `Verdict: ${VERDICT_SAYS[verdict]}`],
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
export const ideaWhere = (leadIdea: Pick<LeadIdeaDto, "plan" | "people">): string | null =>
  (leadIdea.plan ?? leadIdea.people)?.area.label ?? null;

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
  for (const item of prev.items) {
    const label = ideaWhere(item);
    if (!label) continue;
    const place = label.toLowerCase();
    const at = `${item.category_key}@${place}`;
    if (startedSince(item.category_key, place)) {
      out.delete(at);
      continue;
    }
    const before = out.get(at);
    out.set(at, { key: item.category_key, place, label, times: (before?.times ?? 0) + 1 });
  }
  return [...out.values()].slice(-12);
}

/** The passed ideas as a row keeps them (lead_suggestions.passed), narrowed. */
export function ideaPassedOf(raw: unknown): IdeaPassed[] {
  return arr(raw).flatMap((x) => {
    const o = recordOrEmpty(x);
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

/** The rows the count is made from (packages/db getIdeaCustomerRows): people, leads and won deals. */
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
export function ideaPacket(input: {
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
  const home = ideaHome(input.history, input.profileAddress);
  const room = Math.max(IDEA_SIZES[0], input.leadsLeft);
  const type = input.history.listing && input.history.listing.type ? input.history.listing.type : "";
  return {
    line: input.line,
    about: input.about ?? { services: [], notes: [], website: null },
    memory: input.memory ?? [],
    customers: input.customers ?? null,
    listingType: type ? type.replace(/_/g, " ") : null,
    ownKind: type ? leadKindKey(type) : null,
    passed: input.passed,
    language: input.language,
    home,
    leadsLeft: Math.max(0, input.leadsLeft),
    sizes: IDEA_SIZES.filter((n) => n <= room),
    places: ideaPlaces(home, input.history.searches),
    kinds: ideaKinds(input.history.searches, input.now),
    now: input.now,
  };
}
