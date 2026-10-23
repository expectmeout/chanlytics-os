/**
 * A people search's plan (the people card, 00430): who, at which companies, where and how many. The provider's own
 * filters are its criteria, so a plan names them in the card's words, and nothing is probed or judged: the titles the
 * people go by, their seniority, their companies' industries and sizes, the US states they work in, and a count. Every
 * address it brings is checked before anyone is written to, as a list's are (00242's J2). Pure, and read in the
 * browser: the route's schema is people-plan-schema.ts.
 */
import { joinWords, plural } from "../../shared/words";
import { LEAD_ESTIMATE_MARGIN } from "./caps";
import { US_STATES } from "./plan";

export const PEOPLE_CARD = "people_at_companies" as const;

/** The seniority words the card's provider filters on, interns left out: a cold email never goes to one. */
export const PEOPLE_SENIORITIES = [
  "owner",
  "founder",
  "c_suite",
  "partner",
  "vp",
  "head",
  "director",
  "manager",
  "senior",
  "entry",
] as const;
export type PeopleSeniority = (typeof PEOPLE_SENIORITIES)[number];

export const PEOPLE_SENIORITY_WORDS: Record<PeopleSeniority, string> = {
  owner: "owners",
  founder: "founders",
  c_suite: "the C-suite",
  partner: "partners",
  vp: "VPs",
  head: "heads of a team",
  director: "directors",
  manager: "managers",
  senior: "senior staff",
  entry: "entry level",
};

/** A company's size as the provider names its ranges. */
export const PEOPLE_COMPANY_SIZES = [
  "1 - 10",
  "11 - 50",
  "51 - 200",
  "201 - 500",
  "501 - 1000",
  "1001 - 5000",
  "5001 - 10000",
  "10001+",
] as const;
export type PeopleCompanySize = (typeof PEOPLE_COMPANY_SIZES)[number];

export const PEOPLE_COUNT_MAX = 500;
/** The least a run's cap is, the provider's and the checker's alike: what a people search reserves for each. */
export const PEOPLE_RUN_FLOOR_USD = 0.5;
export const PEOPLE_TITLES_MAX = 5;
export const PEOPLE_INDUSTRIES_MAX = 5;
export const PEOPLE_STATES_MAX = 10;
/** The longest a title, an industry and the words asked may be (LeadPeoplePlanSchema holds each). */
export const PEOPLE_TITLE_CHARS = 60;
export const PEOPLE_INDUSTRY_CHARS = 80;
export const PEOPLE_ASKED_CHARS = 400;

/**
 * A people search's plan, as lead_people_search_create stores it (lead_searches.plan, lead_rounds.plan). A type, not an
 * interface: it is stored as it is (Json).
 */
export type LeadPeoplePlan = {
  version: 1;
  card: typeof PEOPLE_CARD;
  name: string;
  /** The owner's words. */
  asked: string;
  count: number;
  /** What the people are called ("marketing manager", "office manager"): one to five. */
  titles: string[];
  seniority: PeopleSeniority[];
  /** The companies' industries, in the provider's own names ("Marketing & Advertising"): its list alone (people-industries.ts). */
  industries: string[];
  sizes: PeopleCompanySize[];
  /** Two-letter US states; none is the whole country. */
  states: string[];
  /** Every address is checked: a people search has no phone standard. */
  contact: "email";
  /**
   * What a search's pages read of any plan: no search phrases, and the states it covers as an area (a LeadArea's shape:
   * "Texas and California", or "the US"), so the strip, the rail and the peek say where it looked as they say a place
   * search's. Made by peoplePlanFrom; nothing searches by it.
   */
  terms: [];
  area: { kind: "city"; label: string; state: string; center: null; radius_m: number; query: string };
  /** A places plan's criteria and exclusions, none: the strip and the sentence read them off any search's plan. */
  criteria: [];
  exclusions: [];
  /** Started from an idea (decision 0070), as a places plan says it: the ideas' own measure of whether they are followed. */
  from?: "idea";
};

/** What the owner chose, before it is a plan: the sheet's fields, or Ask's. */
export type PeoplePlanInput = Omit<
  LeadPeoplePlan,
  "version" | "card" | "contact" | "terms" | "area" | "criteria" | "exclusions" | "name"
> & {
  name?: string;
};

/** The area a people plan covers, as every page says a search's: its states, or the whole US. */
function peopleAreaOf(states: readonly string[]): LeadPeoplePlan["area"] {
  const names = states.map(usStateName).filter((s): s is string => !!s);
  const label = names.length ? joinWords(names) : "the US";
  return { kind: "city", label, state: states[0] ?? "", center: null, radius_m: 0, query: `${label}, USA` };
}

/** The owner's choice as a plan: named for whom it finds, its area worked out from its states. */
export function peoplePlanFrom(i: PeoplePlanInput): LeadPeoplePlan {
  return {
    version: 1,
    card: PEOPLE_CARD,
    name: (i.name ?? i.titles.join(", ")).trim().slice(0, 80),
    asked: i.asked,
    count: i.count,
    titles: i.titles,
    seniority: i.seniority,
    industries: i.industries,
    sizes: i.sizes,
    states: i.states,
    contact: "email",
    terms: [],
    area: peopleAreaOf(i.states),
    criteria: [],
    exclusions: [],
  };
}

const strs = (v: unknown, max: number, each: number): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((s): s is string => typeof s === "string").map((s) => s.trim().slice(0, each)))]
        .filter(Boolean)
        .slice(0, max)
    : [];

const US_CODES_SET = new Set(Object.values(US_STATES));

/**
 * A stored plan read as a people plan, or null when it is not one (a places plan, or one that does not read): the one
 * reading core's runner and the pages take. Bad parts are left out, never guessed.
 */
export function peoplePlanOf(raw: unknown): LeadPeoplePlan | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.card !== PEOPLE_CARD || o.version !== 1) return null;
  const count = typeof o.count === "number" && Number.isInteger(o.count) ? o.count : 0;
  const titles = strs(o.titles, PEOPLE_TITLES_MAX, 60);
  if (count < 1 || count > PEOPLE_COUNT_MAX || titles.length === 0) return null;
  return peoplePlanFrom({
    name: typeof o.name === "string" ? o.name.trim().slice(0, 120) : "",
    asked: typeof o.asked === "string" ? o.asked.slice(0, 400) : "",
    count,
    titles,
    seniority: strs(o.seniority, PEOPLE_SENIORITIES.length, 20).filter((s): s is PeopleSeniority =>
      (PEOPLE_SENIORITIES as readonly string[]).includes(s),
    ),
    industries: strs(o.industries, PEOPLE_INDUSTRIES_MAX, PEOPLE_INDUSTRY_CHARS),
    sizes: strs(o.sizes, PEOPLE_COMPANY_SIZES.length, 20).filter((s): s is PeopleCompanySize =>
      (PEOPLE_COMPANY_SIZES as readonly string[]).includes(s),
    ),
    states: strs(o.states, PEOPLE_STATES_MAX, 2)
      .map((s) => s.toUpperCase())
      .filter((s) => US_CODES_SET.has(s)),
  });
}

/** A US state's two letters from its name or its letters ("New York", "ny"), or null for anything else. */
export function usStateCode(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(s)) return US_CODES_SET.has(s.toUpperCase()) ? s.toUpperCase() : null;
  return US_STATES[s.toLowerCase()] ?? null;
}

/** A state's whole name from its code, as the provider asks for it ("New York"). */
export function usStateName(code: string): string | null {
  const c = code.trim().toUpperCase();
  const name = Object.entries(US_STATES).find(([, v]) => v === c)?.[0];
  return name ? name.replace(/\b\p{L}/gu, (m) => m.toUpperCase()).replace(/\bOf\b/g, "of") : null;
}

/**
 * What a people search may cost, to reserve (lead_people_search_create holds it under lead_estimate_ceiling('people')):
 * twice the people asked for, each found, judged (their company read against what was asked) and checked, one start,
 * with the room. The card's prices are LEAD_CARDS'.
 */
export function peopleEstimateUsd(
  count: number,
  prices: { perPerson: number; perJudge: number; perCheck: number; start: number },
): number {
  const people = Math.min(1000, 2 * Math.max(1, Math.floor(count)));
  const usd = (people * (prices.perPerson + prices.perJudge + prices.perCheck) + prices.start) * LEAD_ESTIMATE_MARGIN;
  // And the floor each run's cap has (the provider's and the checker's): a cap is never set past what the round holds
  // (S6), and what is not spent goes back when the round ends. lead_estimate_ceiling('people') is the same sum.
  return Math.round((Math.ceil(usd * 100) / 100 + 2 * PEOPLE_RUN_FLOOR_USD) * 100) / 100;
}

/**
 * The fewest people the provider takes a run for: it refuses `maxResults` under 100 (its calibration, 14 Oct 2026). A
 * round that wants fewer asks for this many (core's people card), and keeps every company they name: each was paid for,
 * and the check counts only as many as the plan asked against the month (lead_check_commit's room). At $0.002 a person
 * the 100 cost $0.21 with the start, under the cap's floor and inside the floors every people estimate already holds.
 */
export const PEOPLE_PROVIDER_LEAST = 100;

/**
 * About how long a people search takes, said on its card as a places plan's minutes are: the people asked for (twice the
 * companies, never under the provider's least) at the card's rate, and a minute for their addresses' checks. Never under
 * two minutes.
 */
export function peopleMinutes(count: number): number {
  const people = Math.min(1000, Math.max(PEOPLE_PROVIDER_LEAST, 2 * Math.max(1, Math.floor(count))));
  return Math.max(2, Math.ceil(people / 100) + 1);
}

/** The month as a people card reads it: the leads left, and the day they renew. */
export interface PeopleMonth {
  left: number;
  renewsOn: string;
}

/**
 * What a people card asks for, as a places plan's does (leadPlanAsk): the companies the month has room for, the button's
 * words, and the sentence that says why where the month binds. The word is always companies: one lead each.
 */
export function peoplePlanAsk(
  plan: LeadPeoplePlan,
  month: PeopleMonth | null,
): { count: number; label: string; covers: string | null } {
  const binds = !!month && month.left < plan.count;
  const count = binds && month ? Math.max(0, month.left) : plan.count;
  const label = count < 1 ? "No leads left this month" : PEOPLE_FIND_WORDS.start(count);
  if (!binds || !month) return { count, label, covers: null };
  return {
    count,
    label,
    covers: `You have ${plural(count, "lead", "leads")} left this month. Your leads renew on ${month.renewsOn}.`,
  };
}

/**
 * A people card's facts, as a places plan's are (leadPlanFacts): how long, that anyone already the owner's is skipped,
 * and what counts (a company its judge found a fit, whose address checked out: company-judge.ts), with the month where
 * it is known.
 */
export function peoplePlanFacts(plan: LeadPeoplePlan, month: PeopleMonth | null): string[] {
  return [
    `About ${peopleMinutes(plan.count)} minutes — leave the page if you like`,
    "Anyone already yours is skipped",
    month
      ? `Counts only companies that fit, with a checked work email · ${month.left} left this month`
      : "Counts only companies that fit, with a checked work email",
  ];
}

/** The same facts as one line, a phone's. */
export function peoplePlanFactLine(plan: LeadPeoplePlan, month: PeopleMonth | null): string {
  return [
    `About ${peopleMinutes(plan.count)} min`,
    "skips anyone you have",
    ...(month ? [`${month.left} left this month`] : []),
  ].join(" · ");
}

/** What a typed list of states holds: the states it names, and the parts that name none, which are never dropped. */
export function usStatesTyped(text: string): { codes: string[]; unread: string[] } {
  const parts = listTyped(text, PEOPLE_STATES_MAX * 2);
  const codes = [...new Set(parts.map(usStateCode).filter((s): s is string => !!s))].slice(0, PEOPLE_STATES_MAX);
  return { codes, unread: parts.filter((p) => !usStateCode(p)) };
}

/**
 * What is wrong with the Find people sheet as typed, by its box, in its words (the route's schema, said before it is
 * asked): a title or an industry out of its length, a state that reads as none, a count out of its range. Empty when
 * nothing is.
 */
export function peopleSheetProblems(t: {
  titles: string;
  industries: string;
  states: string;
  count: string;
}): Partial<Record<"titles" | "industries" | "states" | "count", string>> {
  const out: Partial<Record<"titles" | "industries" | "states" | "count", string>> = {};
  // Every part typed, before any limit: more than a field takes is said, never dropped.
  const titles = listTyped(t.titles, Infinity);
  const long = titles.find((x) => x.length > PEOPLE_TITLE_CHARS);
  const short = titles.find((x) => x.length < 2);
  if (!titles.length) out.titles = PEOPLE_FIND_WORDS.needTitle;
  else if (titles.length > PEOPLE_TITLES_MAX)
    out.titles = PEOPLE_FIND_WORDS.tooMany("titles", PEOPLE_TITLES_MAX, titles.length);
  else if (long) out.titles = PEOPLE_FIND_WORDS.titleLong(long);
  else if (short) out.titles = PEOPLE_FIND_WORDS.titleShort(short);
  else if (t.titles.trim().length > PEOPLE_ASKED_CHARS) out.titles = PEOPLE_FIND_WORDS.titlesLong;
  const industries = listTyped(t.industries, Infinity);
  // An industry the directory does not list is the route's to say (LeadPeoplePlanSchema, with the nearest of its own):
  // its list stays on the server, off every page's first load.
  const odd = industries.find((x) => x.length < 2 || x.length > PEOPLE_INDUSTRY_CHARS);
  if (industries.length > PEOPLE_INDUSTRIES_MAX)
    out.industries = PEOPLE_FIND_WORDS.tooMany("industries", PEOPLE_INDUSTRIES_MAX, industries.length);
  else if (odd) out.industries = PEOPLE_FIND_WORDS.industryOdd(odd);
  const typed = usStatesTyped(t.states);
  const unread = typed.unread[0];
  const states = listTyped(t.states, Infinity).length;
  if (unread) out.states = PEOPLE_FIND_WORDS.stateUnread(unread);
  else if (states > PEOPLE_STATES_MAX) out.states = PEOPLE_FIND_WORDS.tooMany("states", PEOPLE_STATES_MAX, states);
  const n = Number(t.count.trim());
  if (!Number.isInteger(n) || n < 1 || n > PEOPLE_COUNT_MAX) out.count = PEOPLE_FIND_WORDS.needCount;
  return out;
}

/** What a list typed with commas holds: each part trimmed, once, at most `max` of them. */
export function listTyped(text: string, max: number): string[] {
  return [
    ...new Set(
      text
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, max);
}

/** The words of Leads' Find people sheet (the people card, 00430). */
export const PEOPLE_FIND_WORDS = {
  door: "Find people",
  title: "Find people at companies",
  sub: "Named people at companies, by what they are called and where they work. Each company is checked for fit, and every address before anyone is written to.",
  titles: "What they are called",
  titlesHint: "Up to five, with commas between: marketing manager, office manager",
  seniority: "How senior",
  seniorityAny: "Any seniority",
  industries: "Their companies' industries",
  industriesHint: "Up to five, with commas between, as the directory names them: Marketing & Advertising, Accounting",
  sizes: "Company size",
  sizesAny: "Any size",
  states: "Where they work",
  statesHint: "Up to ten US states, with commas between: TX, CA. None is the whole US.",
  count: "How many companies",
  countHint: `1 to ${PEOPLE_COUNT_MAX}`,
  start: (n: number) => `Find ${n} ${n === 1 ? "company" : "companies"}`,
  starting: "Starting…",
  cancel: "Cancel",
  needTitle: "Say what they are called.",
  needCount: `Say how many, 1 to ${PEOPLE_COUNT_MAX}.`,
  titleLong: (t: string) => `“${t}” is longer than ${PEOPLE_TITLE_CHARS} characters: say it shorter.`,
  titleShort: (t: string) => `“${t}” is too short to be a title.`,
  tooMany: (what: string, max: number, n: number) => `Up to ${max} ${what}: this has ${n}.`,
  titlesLong: `What they are called is too long: ${PEOPLE_ASKED_CHARS} characters at most.`,
  industryOdd: (t: string) => `“${t}”: an industry is 2 to ${PEOPLE_INDUSTRY_CHARS} characters.`,
  industryUnread: (t: string, near: readonly string[]) => {
    const tried = near.map((n) => `“${n}”`);
    return tried.length
      ? `“${t}” isn't one of the directory's industries: try ${tried.length > 1 ? `${tried.slice(0, -1).join(", ")} or ` : ""}${tried[tried.length - 1]}.`
      : `“${t}” isn't one of the directory's industries. Say it as the directory names it (Accounting, Construction, Real Estate), or leave industries empty and say who by what they are called.`;
  },
  stateUnread: (s: string) => `${s} isn't a US state: use its name or its two letters.`,
  more: "Find more like these",
  closed: "Finding people at companies opens once it has been checked. Nothing was started.",
  done: "Looking now. They land on Leads as each address checks out.",
  failed: "Couldn't start the search. Nothing was spent; try again.",
  tick: "Chosen",
} as const;

/** Who a people search looks for, as its strip says it: "people called “marketing manager” at Accounting companies in TX". */
export function peopleWho(p: LeadPeoplePlan): string {
  const called = `people called ${joinWords(p.titles.map((t) => `“${t}”`))}`;
  const at = p.industries.length ? ` at ${joinWords(p.industries)} companies` : " at companies";
  return `${called}${at}${p.states.length ? ` in ${joinWords(p.states)}` : " in the US"}`;
}

/**
 * A people search's strip (00430), in its own words: companies found while its run reads them, the addresses being
 * checked, then how it ended against the companies asked for. Never "found what you asked for" before the checks say so.
 */
export const PEOPLE_STRIP_WORDS = {
  none: (who: string) => `Nothing has run for ${who} yet`,
  running: (who: string) => `Finding ${who}`,
  found: (n: number) => `${plural(n, "company", "companies")} found so far`,
  checked: (n: number) => `${plural(n, "address", "addresses")} checked`,
  checking: (n: number) => `Checking the addresses of the ${plural(n, "company", "companies")} found`,
  stop: "Stop",
  ended: (ending: string | null, n: number, target: number): string => {
    if (ending === "source_failed")
      return "The directory could not be read. Nothing was counted for what was not found.";
    if (ending === "stopped")
      return `Stopped with ${plural(n, "company", "companies")} found. Their addresses were checked.`;
    // Ended before it searched, or before its companies were checked: said as it is, never as a search that found none.
    if (ending === "paused")
      return `Lead searches are paused for now. ${plural(n, "company", "companies")} counted; nothing more is being counted.`;
    if (ending === "budget_used" || ending === "month_leads_used")
      return `Stopped at ${plural(n, "company", "companies")}: this month's searching is used up. It renews next month.`;
    if (n === 0) return "No company that fits what you asked had an address that checked out.";
    if (n >= target) return `Found ${plural(n, "company", "companies")}, each a fit with its address checked`;
    return `Found ${n} of ${plural(target, "company", "companies")}: every fit the filters cover, each address checked`;
  },
  more: "Find more like these",
} as const;

/**
 * The plan in one sentence, as its card says it: "Up to 100 Marketing & Advertising companies of 11 - 50 people in TX
 * and CA, each through someone called “marketing manager” (owners or managers), each address checked". The count is
 * companies: one lead each, written to through one person.
 */
export function peoplePlanSentence(p: LeadPeoplePlan): string {
  const what = p.industries.length ? `${joinWords(p.industries)} ${p.count === 1 ? "company" : "companies"}` : null;
  const companies = what ? `${p.count} ${what.replace(/^\d+ /, "")}` : plural(p.count, "company", "companies");
  const size = p.sizes.length ? ` of ${p.sizes.join(", ")} people` : "";
  const where = p.states.length ? ` in ${joinWords(p.states)}` : " in the US";
  const called = joinWords(p.titles.map((t) => `“${t}”`));
  const level = p.seniority.length ? ` (${p.seniority.map((s) => PEOPLE_SENIORITY_WORDS[s]).join(" or ")})` : "";
  return `Up to ${companies}${size}${where}, each through someone called ${called}${level}, each address checked`;
}
