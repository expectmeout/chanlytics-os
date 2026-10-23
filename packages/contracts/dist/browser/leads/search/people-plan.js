import { joinWords, plural } from "../../shared/words.js";
import { LEAD_ESTIMATE_MARGIN } from "./caps.js";
import { US_STATES } from "./plan.js";
export const PEOPLE_CARD = "people_at_companies";
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
  "entry"
];
export const PEOPLE_SENIORITY_WORDS = {
  owner: "owners",
  founder: "founders",
  c_suite: "the C-suite",
  partner: "partners",
  vp: "VPs",
  head: "heads of a team",
  director: "directors",
  manager: "managers",
  senior: "senior staff",
  entry: "entry level"
};
export const PEOPLE_COMPANY_SIZES = [
  "1 - 10",
  "11 - 50",
  "51 - 200",
  "201 - 500",
  "501 - 1000",
  "1001 - 5000",
  "5001 - 10000",
  "10001+"
];
export const PEOPLE_COUNT_MAX = 500;
export const PEOPLE_RUN_FLOOR_USD = 0.5;
export const PEOPLE_TITLES_MAX = 5;
export const PEOPLE_INDUSTRIES_MAX = 5;
export const PEOPLE_STATES_MAX = 10;
export const PEOPLE_TITLE_CHARS = 60;
export const PEOPLE_INDUSTRY_CHARS = 80;
export const PEOPLE_ASKED_CHARS = 400;
function peopleAreaOf(states) {
  const names = states.map(usStateName).filter((s) => !!s);
  const label = names.length ? joinWords(names) : "the US";
  return { kind: "city", label, state: states[0] ?? "", center: null, radius_m: 0, query: `${label}, USA` };
}
export function peoplePlanFrom(i) {
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
    exclusions: []
  };
}
const strs = (v, max, each) => Array.isArray(v) ? [...new Set(v.filter((s) => typeof s === "string").map((s) => s.trim().slice(0, each)))].filter(Boolean).slice(0, max) : [];
const US_CODES_SET = new Set(Object.values(US_STATES));
export function peoplePlanOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = raw;
  if (o.card !== PEOPLE_CARD || o.version !== 1) return null;
  const count = typeof o.count === "number" && Number.isInteger(o.count) ? o.count : 0;
  const titles = strs(o.titles, PEOPLE_TITLES_MAX, 60);
  if (count < 1 || count > PEOPLE_COUNT_MAX || titles.length === 0) return null;
  return peoplePlanFrom({
    name: typeof o.name === "string" ? o.name.trim().slice(0, 120) : "",
    asked: typeof o.asked === "string" ? o.asked.slice(0, 400) : "",
    count,
    titles,
    seniority: strs(o.seniority, PEOPLE_SENIORITIES.length, 20).filter(
      (s) => PEOPLE_SENIORITIES.includes(s)
    ),
    industries: strs(o.industries, PEOPLE_INDUSTRIES_MAX, PEOPLE_INDUSTRY_CHARS),
    sizes: strs(o.sizes, PEOPLE_COMPANY_SIZES.length, 20).filter(
      (s) => PEOPLE_COMPANY_SIZES.includes(s)
    ),
    states: strs(o.states, PEOPLE_STATES_MAX, 2).map((s) => s.toUpperCase()).filter((s) => US_CODES_SET.has(s))
  });
}
export function usStateCode(raw) {
  const s = (raw ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(s)) return US_CODES_SET.has(s.toUpperCase()) ? s.toUpperCase() : null;
  return US_STATES[s.toLowerCase()] ?? null;
}
export function usStateName(code) {
  const c = code.trim().toUpperCase();
  const name = Object.entries(US_STATES).find(([, v]) => v === c)?.[0];
  return name ? name.replace(/\b\p{L}/gu, (m) => m.toUpperCase()).replace(/\bOf\b/g, "of") : null;
}
export function peopleEstimateUsd(count, prices) {
  const people = Math.min(1e3, 2 * Math.max(1, Math.floor(count)));
  const usd = (people * (prices.perPerson + prices.perJudge + prices.perCheck) + prices.start) * LEAD_ESTIMATE_MARGIN;
  return Math.round((Math.ceil(usd * 100) / 100 + 2 * PEOPLE_RUN_FLOOR_USD) * 100) / 100;
}
export const PEOPLE_PROVIDER_LEAST = 100;
export function peopleMinutes(count) {
  const people = Math.min(1e3, Math.max(PEOPLE_PROVIDER_LEAST, 2 * Math.max(1, Math.floor(count))));
  return Math.max(2, Math.ceil(people / 100) + 1);
}
export function peoplePlanAsk(plan, month) {
  const binds = !!month && month.left < plan.count;
  const count = binds && month ? Math.max(0, month.left) : plan.count;
  const label = count < 1 ? "No leads left this month" : PEOPLE_FIND_WORDS.start(count);
  if (!binds || !month) return { count, label, covers: null };
  return {
    count,
    label,
    covers: `You have ${plural(count, "lead", "leads")} left this month. Your leads renew on ${month.renewsOn}.`
  };
}
export function peoplePlanFacts(plan, month) {
  return [
    `About ${peopleMinutes(plan.count)} minutes \u2014 leave the page if you like`,
    "Anyone already yours is skipped",
    month ? `Counts only companies that fit, with a checked work email \xB7 ${month.left} left this month` : "Counts only companies that fit, with a checked work email"
  ];
}
export function peoplePlanFactLine(plan, month) {
  return [
    `About ${peopleMinutes(plan.count)} min`,
    "skips anyone you have",
    ...month ? [`${month.left} left this month`] : []
  ].join(" \xB7 ");
}
export function usStatesTyped(text) {
  const parts = listTyped(text, PEOPLE_STATES_MAX * 2);
  const codes = [...new Set(parts.map(usStateCode).filter((s) => !!s))].slice(0, PEOPLE_STATES_MAX);
  return { codes, unread: parts.filter((p) => !usStateCode(p)) };
}
export function peopleSheetProblems(t) {
  const out = {};
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
export function listTyped(text, max) {
  return [
    ...new Set(
      text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
    )
  ].slice(0, max);
}
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
  start: (n) => `Find ${n} ${n === 1 ? "company" : "companies"}`,
  starting: "Starting\u2026",
  cancel: "Cancel",
  needTitle: "Say what they are called.",
  needCount: `Say how many, 1 to ${PEOPLE_COUNT_MAX}.`,
  titleLong: (t) => `\u201C${t}\u201D is longer than ${PEOPLE_TITLE_CHARS} characters: say it shorter.`,
  titleShort: (t) => `\u201C${t}\u201D is too short to be a title.`,
  tooMany: (what, max, n) => `Up to ${max} ${what}: this has ${n}.`,
  titlesLong: `What they are called is too long: ${PEOPLE_ASKED_CHARS} characters at most.`,
  industryOdd: (t) => `\u201C${t}\u201D: an industry is 2 to ${PEOPLE_INDUSTRY_CHARS} characters.`,
  industryUnread: (t, near) => {
    const tried = near.map((n) => `\u201C${n}\u201D`);
    return tried.length ? `\u201C${t}\u201D isn't one of the directory's industries: try ${tried.length > 1 ? `${tried.slice(0, -1).join(", ")} or ` : ""}${tried[tried.length - 1]}.` : `\u201C${t}\u201D isn't one of the directory's industries. Say it as the directory names it (Accounting, Construction, Real Estate), or leave industries empty and say who by what they are called.`;
  },
  stateUnread: (s) => `${s} isn't a US state: use its name or its two letters.`,
  more: "Find more like these",
  closed: "Finding people at companies opens once it has been checked. Nothing was started.",
  done: "Looking now. They land on Leads as each address checks out.",
  failed: "Couldn't start the search. Nothing was spent; try again.",
  tick: "Chosen"
};
export function peopleWho(p) {
  const called = `people called ${joinWords(p.titles.map((t) => `\u201C${t}\u201D`))}`;
  const at = p.industries.length ? ` at ${joinWords(p.industries)} companies` : " at companies";
  return `${called}${at}${p.states.length ? ` in ${joinWords(p.states)}` : " in the US"}`;
}
export const PEOPLE_STRIP_WORDS = {
  none: (who) => `Nothing has run for ${who} yet`,
  running: (who) => `Finding ${who}`,
  found: (n) => `${plural(n, "company", "companies")} found so far`,
  checked: (n) => `${plural(n, "address", "addresses")} checked`,
  checking: (n) => `Checking the addresses of the ${plural(n, "company", "companies")} found`,
  stop: "Stop",
  ended: (ending, n, target) => {
    if (ending === "source_failed")
      return "The directory could not be read. Nothing was counted for what was not found.";
    if (ending === "stopped")
      return `Stopped with ${plural(n, "company", "companies")} found. Their addresses were checked.`;
    if (ending === "paused")
      return `Lead searches are paused for now. ${plural(n, "company", "companies")} counted; nothing more is being counted.`;
    if (ending === "budget_used" || ending === "month_leads_used")
      return `Stopped at ${plural(n, "company", "companies")}: this month's searching is used up. It renews next month.`;
    if (n === 0) return "No company that fits what you asked had an address that checked out.";
    if (n >= target) return `Found ${plural(n, "company", "companies")}, each a fit with its address checked`;
    return `Found ${n} of ${plural(target, "company", "companies")}: every fit the filters cover, each address checked`;
  },
  more: "Find more like these"
};
export function peoplePlanSentence(p) {
  const what = p.industries.length ? `${joinWords(p.industries)} ${p.count === 1 ? "company" : "companies"}` : null;
  const companies = what ? `${p.count} ${what.replace(/^\d+ /, "")}` : plural(p.count, "company", "companies");
  const size = p.sizes.length ? ` of ${p.sizes.join(", ")} people` : "";
  const where = p.states.length ? ` in ${joinWords(p.states)}` : " in the US";
  const called = joinWords(p.titles.map((t) => `\u201C${t}\u201D`));
  const level = p.seniority.length ? ` (${p.seniority.map((s) => PEOPLE_SENIORITY_WORDS[s]).join(" or ")})` : "";
  return `Up to ${companies}${size}${where}, each through someone called ${called}${level}, each address checked`;
}
