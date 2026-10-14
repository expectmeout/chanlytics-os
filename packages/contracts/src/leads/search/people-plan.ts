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

/**
 * The industries the card's provider filters companies by, in its own names, as its pinned build lists them (its input
 * schema, 14 Oct 2026): a run naming any other is refused before it starts, so a plan names these alone
 * (LeadPeoplePlanSchema), and an industry typed otherwise is said with the nearest of them (peopleIndustriesTyped).
 */
export const PEOPLE_INDUSTRIES = [
  "Accounting",
  "Agriculture",
  "Airlines/Aviation",
  "Alternative Dispute Resolution",
  "Alternative Medicine",
  "Animation",
  "Apparel & Fashion",
  "Architecture & Planning",
  "Arts & Crafts",
  "Automotive",
  "Aviation & Aerospace",
  "Banking",
  "Biotechnology",
  "Broadcast Media",
  "Building Materials",
  "Business Supplies & Equipment",
  "Capital Markets",
  "Chemicals",
  "Civic & Social Organization",
  "Civil Engineering",
  "Commercial Real Estate",
  "Computer & Network Security",
  "Computer Games",
  "Computer Hardware",
  "Computer Networking",
  "Computer Software",
  "Construction",
  "Consumer Electronics",
  "Consumer Goods",
  "Consumer Services",
  "Cosmetics",
  "Dairy",
  "Defense & Space",
  "Design",
  "E-Learning",
  "Education Management",
  "Electrical/Electronic Manufacturing",
  "Entertainment",
  "Environmental Services",
  "Events Services",
  "Executive Office",
  "Facilities Services",
  "Farming",
  "Financial Services",
  "Fine Art",
  "Fishery",
  "Food & Beverages",
  "Food Production",
  "Fund-Raising",
  "Furniture",
  "Gambling & Casinos",
  "Glass",
  "Government Administration",
  "Government Relations",
  "Graphic Design",
  "Health",
  "Higher Education",
  "Hospital & Health Care",
  "Hospitality",
  "Human Resources",
  "Import & Export",
  "Individual & Family Services",
  "Industrial Automation",
  "Information Services",
  "Information Technology & Services",
  "Insurance",
  "International Affairs",
  "International Trade & Development",
  "Internet",
  "Investment Banking",
  "Investment Management",
  "Judiciary",
  "Law Enforcement",
  "Law Practice",
  "Legal Services",
  "Legislative Office",
  "Leisure",
  "Libraries",
  "Logistics & Supply Chain",
  "Luxury Goods & Jewelry",
  "Machinery",
  "Management Consulting",
  "Maritime",
  "Market Research",
  "Marketing & Advertising",
  "Mechanical or Industrial Engineering",
  "Media Production",
  "Medical Devices",
  "Medical Practice",
  "Mental Health Care",
  "Military",
  "Mining & Metals",
  "Motion Pictures & Film",
  "Museums & Institutions",
  "Music",
  "Nanotechnology",
  "Newspapers",
  "Nonprofit Organization Management",
  "Oil & Energy",
  "Online Media",
  "Outsourcing/Offshoring",
  "Package/Freight Delivery",
  "Packaging & Containers",
  "Paper & Forest Products",
  "Performing Arts",
  "Pharmaceuticals",
  "Philanthropy",
  "Photography",
  "Plastics",
  "Political Organization",
  "Primary/Secondary Education",
  "Printing",
  "Professional Training & Coaching",
  "Program Development",
  "Public Policy",
  "Public Relations & Communications",
  "Public Safety",
  "Publishing",
  "Railroad Manufacture",
  "Ranching",
  "Real Estate",
  "Recreational Facilities & Services",
  "Religious Institutions",
  "Renewables & Environment",
  "Research",
  "Restaurants",
  "Retail",
  "Security & Investigations",
  "Semiconductors",
  "Shipbuilding",
  "Sporting Goods",
  "Sports",
  "Staffing & Recruiting",
  "Supermarkets",
  "Telecommunications",
  "Textiles",
  "Think Tanks",
  "Tobacco",
  "Translation & Localization",
  "Transportation/Trucking/Railroad",
  "Utilities",
  "Venture Capital & Private Equity",
  "Veterinary",
  "Warehousing",
  "Wholesale",
  "Wine & Spirits",
  "Wireless",
  "Writing & Editing",
  "Other",
  "Specialty",
  "Services",
  "Rentals/Leasing",
  "Other Vehicles",
  "Professional Services software",
  "eBusiness Software",
] as const;
export type PeopleIndustry = (typeof PEOPLE_INDUSTRIES)[number];

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
  /** The companies' industries, in the provider's own names ("Marketing & Advertising"): PEOPLE_INDUSTRIES alone. */
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
    // In the directory's own names where they read as one ("marketing and advertising"); one that does not is kept as
    // typed, for the schema to refuse and the sheet and Ask to say.
    industries: [...new Set(i.industries.map((x) => peopleIndustryOf(x) ?? x))],
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
    industries: strs(o.industries, PEOPLE_INDUSTRIES_MAX, PEOPLE_INDUSTRY_CHARS)
      .map(peopleIndustryOf)
      .filter((s): s is PeopleIndustry => !!s),
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
 * twice the people asked for, each found and checked, one start, with the room. The card's prices are LEAD_CARDS'.
 */
export function peopleEstimateUsd(
  count: number,
  prices: { perPerson: number; perCheck: number; start: number },
): number {
  const people = Math.min(1000, 2 * Math.max(1, Math.floor(count)));
  const usd = (people * (prices.perPerson + prices.perCheck) + prices.start) * LEAD_ESTIMATE_MARGIN;
  // And the floor each run's cap has (the provider's and the checker's): a cap is never set past what the round holds
  // (S6), and what is not spent goes back when the round ends. lead_estimate_ceiling('people') is the same sum.
  return Math.round((Math.ceil(usd * 100) / 100 + 2 * PEOPLE_RUN_FLOOR_USD) * 100) / 100;
}

/** What a typed list of states holds: the states it names, and the parts that name none, which are never dropped. */
export function usStatesTyped(text: string): { codes: string[]; unread: string[] } {
  const parts = listTyped(text, PEOPLE_STATES_MAX * 2);
  const codes = [...new Set(parts.map(usStateCode).filter((s): s is string => !!s))].slice(0, PEOPLE_STATES_MAX);
  return { codes, unread: parts.filter((p) => !usStateCode(p)) };
}

/** An industry's key: any case, and "and" for "&", is one ("marketing and advertising" is Marketing & Advertising). */
const industryKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\band\b/g, "&")
    .replace(/[^a-z0-9&]+/g, "");

const INDUSTRY_BY_KEY = new Map<string, PeopleIndustry>(PEOPLE_INDUSTRIES.map((i) => [industryKey(i), i]));

/** The directory's own name for an industry as typed, or null for one it does not list. */
export function peopleIndustryOf(raw: string | null | undefined): PeopleIndustry | null {
  return INDUSTRY_BY_KEY.get(industryKey(raw ?? "")) ?? null;
}

const wordsIn = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && w !== "and" && w !== "the");

/** How many letters two words begin with alike. */
const sharedStart = (a: string, b: string): number => {
  let n = 0;
  while (n < a.length && a[n] === b[n]) n++;
  return n;
};

/**
 * Up to three of the directory's industries nearest what was typed: those whose words begin as a typed word does, five
 * letters alike at least (a shorter word whole), the longest likeness first. "marketing agencies" finds Marketing &
 * Advertising, never Capital Markets; "law firms" Law Enforcement and Law Practice; "dentists" none.
 */
export function peopleIndustriesNear(typed: string): PeopleIndustry[] {
  const typedWords = wordsIn(typed);
  const scored = PEOPLE_INDUSTRIES.map((industry) => {
    let best = 0;
    for (const w of typedWords)
      for (const v of wordsIn(industry)) {
        const n = sharedStart(w, v);
        if (n >= Math.min(5, w.length) && n > best) best = n;
      }
    return { industry, best };
  }).filter((x) => x.best > 0);
  const top = Math.max(0, ...scored.map((x) => x.best));
  return scored
    .filter((x) => x.best >= top - 1)
    .sort((a, b) => b.best - a.best)
    .slice(0, 3)
    .map((x) => x.industry);
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
  // The directory filters by its own industries alone: one it does not list is said with the nearest, never dropped.
  const odd = industries.find((x) => !peopleIndustryOf(x));
  if (industries.length > PEOPLE_INDUSTRIES_MAX)
    out.industries = PEOPLE_FIND_WORDS.tooMany("industries", PEOPLE_INDUSTRIES_MAX, industries.length);
  else if (odd) out.industries = PEOPLE_FIND_WORDS.industryUnread(odd, peopleIndustriesNear(odd));
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
  sub: "Named people at companies, by what they are called and where they work. Every address is checked before anyone is written to.",
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
    if (n === 0) return "No company matched what you asked, with an address that checked out.";
    if (n >= target) return `Found ${plural(n, "company", "companies")}, each address checked`;
    return `Found ${n} of ${plural(target, "company", "companies")}: everything the filters cover, each address checked`;
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
