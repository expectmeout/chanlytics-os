/**
 * The Leads routes' inputs (a view, a stage, a bulk act, a check again, a draft, a search's name and proposal, the
 * export), apart from lead-plan.ts's address and its words. zod is not built into the browser's contracts (decision
 * 0024, the browser's entry): a page that says these words loads none of it.
 */
import { z } from "zod";
import {
  LEAD_LISTS,
  LEAD_CLASSES,
  LEAD_SORTS,
  LEAD_NOT_A_FIT_WHYS,
  LEAD_CALL_OUTCOMES,
  LEAD_OUTSIDE_US_LINE,
  leadNoCardLine,
  leadNotBusinessesLine,
} from "./lead-words";
import { BUSINESS_LINE_MAX, LEAD_MAX_PLACES } from "./search/caps";
import { LEAD_REACH_FILTERS } from "./search/sets";
import { leadKindKey, stateCode } from "./search/clean";
import { lowerFirst } from "./search/sentence";
import type { LeadArea, LeadSearchPlan } from "./search/plan";
import { LeadSearchPlanSchema } from "./search/plan-schema";
import type { LeadPlanned, PeoplePlanned } from "./lead-plan";
import {
  PEOPLE_COMPANY_SIZES,
  PEOPLE_COUNT_MAX,
  PEOPLE_FIND_WORDS,
  PEOPLE_INDUSTRIES_MAX,
  PEOPLE_INDUSTRY_CHARS,
  PEOPLE_KEYWORDS_MAX,
  PEOPLE_KEYWORD_CHARS,
  PEOPLE_SENIORITIES,
  PEOPLE_STATES_MAX,
  PEOPLE_TITLES_MAX,
  PEOPLE_TITLE_CHARS,
  listTyped,
  peoplePlanFrom,
  usStatesTyped,
} from "./search/people-plan";
import { peopleIndustriesNear, peopleIndustryOf } from "./search/people-industries";
import { LeadPeoplePlanSchema } from "./search/people-plan-schema";

/* --------------------------------------------------------------- requests */

export const LeadsQuerySchema = z.object({
  list: z.enum(LEAD_LISTS).default("all"),
  search: z.string().uuid().optional(),
  class: z.enum(LEAD_CLASSES).optional(),
  sort: z.enum(LEAD_SORTS).default("fit"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  after_key: z.string().max(80).optional(),
  after_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
  /** The pile (sort=pile, 00426): the list its adds go to, whose leads it puts last, and its progress line's numbers. */
  pile_list: z.uuid().optional(),
});

export type LeadsQuery = z.infer<typeof LeadsQuerySchema>;

/** GET leads/[id]: one lead as a row of the page, in the search the view is of when it is one search's (PR 9). */
export const LeadOneQuerySchema = z.object({ search: z.string().uuid().optional() });

/** The view a bulk act names when the owner chose "Select all N that match" (S13): the same keys GET leads takes. */
export const LeadsViewSchema = LeadsQuerySchema.omit({ after_key: true, after_id: true, limit: true });

/** POST leads/[id]/stage, the page's five acts made exclusive. */
export const LeadStageInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stage"), stage: z.enum(["ready", "nurture", "converted"]) }),
  z.object({ kind: z.literal("not_a_fit"), why: z.enum(LEAD_NOT_A_FIT_WHYS) }),
  z.object({ kind: z.literal("said_no") }),
  z.object({
    kind: z.literal("outcome"),
    outcome: z.enum(LEAD_CALL_OUTCOMES),
    note: z.string().trim().max(280).optional(),
    /** Who the call reached (0052): Interested names the person it makes, or a stand-in still named for the business. */
    spoke_with: z.string().trim().max(80).optional(),
  }),
  /** "Did you send it?" Yes. */
  z.object({ kind: z.literal("emailed") }),
]);

export type LeadStageInput = z.infer<typeof LeadStageInputSchema>;

export const LeadsBulkSchema = z.discriminatedUnion("by", [
  // Keep and Exclude (D3) take ids only, and may name the search the Needs review pile is read in.
  z.object({
    by: z.literal("ids"),
    action: z.enum(["contacted", "not_a_fit", "keep", "exclude"]),
    ids: z.array(z.string().uuid()).min(1).max(500),
    search_id: z.string().uuid().optional(),
  }),
  z.object({ by: z.literal("view"), action: z.enum(["contacted", "not_a_fit"]), view: LeadsViewSchema }),
]);

export type LeadsBulkInput = z.infer<typeof LeadsBulkSchema>;

/** Check again (D3): the leads whose mailbox check did not answer, asked once more. */
export const LeadsCheckAgainSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

export type LeadsCheckAgainInput = z.infer<typeof LeadsCheckAgainSchema>;

export const LeadDraftInputSchema = z.object({
  tone: z.enum(["first", "shorter", "warmer"]).default("first"),
  previous: z.object({ subject: z.string().max(200), body: z.string().max(4000) }).optional(),
});

/** The view as a file, narrowed as the table is by a lead's reach (leadReaches), so it holds the rows the owner saw. */
export const LeadExportQuerySchema = LeadsViewSchema.extend({
  reach: z.array(z.enum(LEAD_REACH_FILTERS)).max(LEAD_REACH_FILTERS.length).optional(),
});

export const RenameLeadSearchSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const BusinessLineSchema = z.object({ business_line: z.string().trim().min(3).max(BUSINESS_LINE_MAX) });

/* --------------------------------------------------------- the planner */

/**
 * What Ask's `propose_lead_search` hands the planner: the ask in fields, not a
 * plan. The model never writes a `LeadSearchPlan` -- it says who, how many,
 * where, the standard and what to leave out, and `planLeadSearch` builds the
 * plan, keys every criterion and exclusion, and checks the result against
 * release A's own schema. A model that gets a field wrong gets a refusal in
 * words, never a plan the door would have had to catch.
 */
const planChip = (max: number) => z.string().trim().min(2).max(max);

export const ProposeLeadSearchSchema = z.object({
  /**
   * What is asked for: local businesses (the Maps card), or people at home, online sellers and anything else, which are
   * answered in words. Named people at companies are ProposePeopleSearchSchema's (00430).
   */
  looking_for: z.enum(["local_businesses", "people", "online_sellers", "other"]),
  country: z.string().trim().min(2).max(40),
  count: z.number().int().min(1).max(LEAD_MAX_PLACES),
  /** Plural, as the sentence says it: "personal trainers". */
  who: planChip(60),
  /** One of them, for the question and the judge's rubric: "personal trainer". */
  who_one: planChip(60),
  category_key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  terms: z.array(planChip(60)).min(1).max(5),
  city: z.string().trim().max(60).nullable().default(null),
  region: z.string().trim().min(2).max(40),
  zip: z
    .string()
    .regex(/^\d{5}$/)
    .nullable()
    .default(null),
  contact: z.enum(["phone", "email"]),
  criteria: z
    .array(z.object({ text: planChip(120), standard: z.enum(["likely", "seen"]), required: z.boolean() }))
    .max(6)
    .default([]),
  leave_out: z
    .array(z.object({ words: planChip(40) }))
    .max(6)
    .default([]),
  asked: z.string().trim().min(1).max(400),
});

export type ProposeLeadSearch = z.infer<typeof ProposeLeadSearchSchema>;

/**
 * A people search's ask (the people card, 00430): what they are called (`terms`, one to five titles), where they work
 * (`region`: US states, or the US), how many companies, and how senior, which industries and what size of company, none
 * of which is any. Nothing of a places plan is asked of it: no kind's key, no city, no standard, no criteria.
 */
export const ProposePeopleSearchSchema = z.object({
  looking_for: z.literal("people_at_companies"),
  country: z.string().trim().min(2).max(40),
  count: z.number().int().min(1).max(PEOPLE_COUNT_MAX),
  /** What to call the search: "Marketing managers at agencies". */
  who: planChip(80),
  terms: z.array(planChip(PEOPLE_TITLE_CHARS)).min(1).max(PEOPLE_TITLES_MAX),
  region: z.string().trim().min(2).max(200),
  asked: z.string().trim().min(1).max(400),
  seniority: z.array(z.enum(PEOPLE_SENIORITIES)).max(PEOPLE_SENIORITIES.length).default([]),
  industries: z.array(planChip(PEOPLE_INDUSTRY_CHARS)).max(PEOPLE_INDUSTRIES_MAX).default([]),
  /** Words the companies' sites use for what they do ("plumbing", "HVAC"): what an industry alone files too broadly. */
  keywords: z.array(planChip(PEOPLE_KEYWORD_CHARS)).max(PEOPLE_KEYWORDS_MAX).default([]),
  company_sizes: z.array(z.enum(PEOPLE_COMPANY_SIZES)).max(PEOPLE_COMPANY_SIZES.length).default([]),
});

export type ProposePeopleSearch = z.infer<typeof ProposePeopleSearchSchema>;

/** What Ask's propose_lead_search takes: a places ask or a people ask, told apart by what is looked for. */
export const ProposeAnySearchSchema = z.discriminatedUnion("looking_for", [
  ProposeLeadSearchSchema,
  ProposePeopleSearchSchema,
]);

export const LeadDraftAnswerSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(20).max(2000),
});

// The plan from the ask (server: Ask's lead-search tool), read against its schema: here with the schema, so the browser,
// which reads lead-plan.ts's address and words, loads none of it.
const US_NAMES = new Set([
  "us",
  "usa",
  "u.s.",
  "u.s.a.",
  "united states",
  "united states of america",
  "the united states",
  "america",
  "the us",
  "the usa",
]);

/** "United States (US)" and "the U.S." are the same country as "US"; brackets and a leading "the" say nothing more. */
const countryKey = (c: string) =>
  c
    .trim()
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Where the state is, when the model put "Miami, FL" in one field and a city
 * in the other. The tool asks for a city and its two-letter state apart, and
 * a model reliably packs them together instead; that is a plan that is
 * complete in every way that matters, so it is read rather than refused.
 */
function placeOf(input: Pick<ProposeLeadSearch, "city" | "region">): { city: string | null; state: string | null } {
  const region = (input.region ?? "").trim();
  const city = (input.city ?? "").trim();
  const direct = stateCode(region);
  if (direct) return { city: city || null, state: direct };
  // "Miami, FL" or "Miami, Florida" in either field: the last part is the state.
  for (const packed of [region, city]) {
    const m = packed.match(/^(.*?),\s*([A-Za-z .]+)$/);
    if (m && stateCode(m[2])) return { city: m[1].trim() || city || null, state: stateCode(m[2]) };
  }
  // The state alone in the city field, with a city in the region field.
  if (stateCode(city) && !stateCode(region)) return { city: region || null, state: stateCode(city) };
  return { city: city || null, state: null };
}

/** A criterion's or an exclusion's own key, from its words, so the judge's rubric and the chips name the same thing. */
function planKey(text: string, fallback: string, taken: Set<string>): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/, "");
  let key = /^[a-z]/.test(base) ? base : fallback;
  let n = 2;
  while (taken.has(key)) key = `${fallback}_${n++}`;
  taken.add(key);
  return key;
}

/** Title Case for a state written out ("new mexico" -> "New Mexico"); a two-letter code keeps its own case. */
const titleWords = (s: string) => s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

/** Where to look, as the plan spells it: a ZIP, a city and its state, or the state on its own. */
function planArea(input: ProposeLeadSearch): LeadArea | null {
  const place = placeOf(input);
  const state = place.state;
  if (!state) return null;
  if (input.zip)
    return {
      kind: "zip",
      label: `near ${input.zip}`,
      state,
      center: null,
      radius_m: 8_000,
      zip: input.zip,
      query: `${input.zip}, ${state}, USA`,
    };
  const city = place.city ?? "";
  if (city)
    return {
      kind: "city",
      label: `${city}, ${state}`,
      state,
      center: null,
      radius_m: 25_000,
      query: `${city}, ${state}, USA`,
    };
  const label = /^[A-Za-z]{2}$/.test(input.region.trim()) ? state : titleWords(input.region.trim());
  return { kind: "city", label, state, center: null, radius_m: 200_000, query: `${label}, USA` };
}

/**
 * A people search's ask as its plan (the people card, 00430): its terms are what the people are called, its region the
 * US states they work in ("TX", "Texas, California", or the US for all), and its own fields how senior and which
 * companies. Refused in words outside the US, or when the plan does not read.
 */
export function planPeopleSearch(input: ProposePeopleSearch): PeoplePlanned {
  if (!US_NAMES.has(countryKey(input.country)))
    return { ok: false, refusal: { kind: "outside_us", text: LEAD_OUTSIDE_US_LINE, what: input.country.trim() } };
  const where = input.region.trim();
  // A state that reads as none is said, never dropped: dropped, a search meant for two states searched one, or the US.
  const typed = US_NAMES.has(countryKey(where)) ? { codes: [], unread: [] } : usStatesTyped(where);
  if (typed.unread.length)
    return {
      ok: false,
      refusal: { kind: "not_a_plan", text: PEOPLE_FIND_WORDS.stateUnread(typed.unread[0] ?? where), what: where },
    };
  const states = typed.codes;
  if (!states.length && !US_NAMES.has(countryKey(where)))
    return { ok: false, refusal: { kind: "outside_us", text: LEAD_OUTSIDE_US_LINE, what: where } };
  // More states than a plan takes is said, never cut to the first ten.
  if (listTyped(where, Infinity).length > PEOPLE_STATES_MAX)
    return {
      ok: false,
      refusal: {
        kind: "not_a_plan",
        text: PEOPLE_FIND_WORDS.tooMany("states", PEOPLE_STATES_MAX, listTyped(where, Infinity).length),
        what: where,
      },
    };
  // An industry the directory does not list is said with its nearest, never dropped: dropped, a search meant for one
  // industry would search them all.
  const odd = input.industries.find((i) => !peopleIndustryOf(i));
  if (odd !== undefined)
    return {
      ok: false,
      refusal: {
        kind: "not_a_plan",
        text: PEOPLE_FIND_WORDS.industryUnread(odd, peopleIndustriesNear(odd)),
        what: odd,
      },
    };
  const plan = peoplePlanFrom({
    name: input.who,
    asked: input.asked,
    count: Math.min(input.count, PEOPLE_COUNT_MAX),
    titles: [...new Set(input.terms.map((t) => t.trim()).filter(Boolean))].slice(0, PEOPLE_TITLES_MAX),
    seniority: input.seniority,
    industries: input.industries,
    keywords: [...new Set(input.keywords.map((k) => k.trim()).filter(Boolean))].slice(0, PEOPLE_KEYWORDS_MAX),
    sizes: input.company_sizes,
    states,
  });
  const checked = LeadPeoplePlanSchema.safeParse(plan);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    return {
      ok: false,
      refusal: {
        kind: "not_a_plan",
        text: `the plan is not complete: ${issue?.path.join(".")} ${issue?.message}`,
        what: null,
      },
    };
  }
  // Who it finds, one at each company, as its card's press says them (Ruben, 23 Oct 2026: the title said "Find 50
  // companies" over a press that said "Find 50 owners").
  return {
    ok: true,
    plan: checked.data,
    view: { title: `Find ${checked.data.count} ${lowerFirst(checked.data.name)}` },
  };
}

/**
 * The ask as a plan, or one of the three refusals in words (§8.8): outside the
 * US, people rather than businesses, and an ask no source card fits, which is
 * logged as demand. Nothing here reads anything: the same function answers the
 * composer and Ask's tool, so a plan made by typing and a plan made by asking
 * are the same plan.
 */
export function planLeadSearch(input: ProposeLeadSearch): LeadPlanned {
  if (!US_NAMES.has(countryKey(input.country)))
    return { ok: false, refusal: { kind: "outside_us", text: LEAD_OUTSIDE_US_LINE, what: input.country.trim() } };
  if (input.looking_for === "people")
    return { ok: false, refusal: { kind: "not_businesses", text: leadNotBusinessesLine(null), what: input.who } };
  if (input.looking_for !== "local_businesses")
    return { ok: false, refusal: { kind: "no_card", text: leadNoCardLine(input.who), what: input.who } };
  const area = planArea(input);
  if (!area) return { ok: false, refusal: { kind: "outside_us", text: LEAD_OUTSIDE_US_LINE, what: input.region } };
  const taken = new Set<string>();
  const plan: LeadSearchPlan = {
    version: 1,
    card: "local_businesses",
    name: input.who,
    // The kind, kept as one key (leadKindKey: one of them, "plumber" for "plumbers"): a round that ends adds to its
    // counts, and the ideas read a workspace's searches by it (00398).
    category_key: leadKindKey(input.category_key),
    asked: input.asked,
    // Widest first, and at most the three the tool asks the model for.
    terms: [...new Set(input.terms.map((t) => t.trim()).filter(Boolean))].slice(0, 3),
    area,
    count: input.count,
    contact: input.contact,
    criteria: input.criteria.map((c, i) => ({
      key: planKey(c.text, `c${i + 1}`, taken),
      text: c.text,
      standard: c.standard,
      required: c.required,
    })),
    exclusions: input.leave_out.map((l, i) => ({
      key: planKey(l.words, `x${i + 1}`, taken),
      text: l.words,
      origin: "claude" as const,
    })),
  };
  const checked = LeadSearchPlanSchema.safeParse(plan);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    return {
      ok: false,
      refusal: {
        kind: "not_a_plan",
        text: `the plan is not complete: ${issue?.path.join(".")} ${issue?.message}`,
        what: null,
      },
    };
  }
  return { ok: true, plan: checked.data, view: { title: `Find ${checked.data.count} ${checked.data.name}` } };
}
