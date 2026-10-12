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
import { LEAD_MAX_PLACES } from "./search/caps";
import { leadKindKey, stateCode } from "./search/clean";
import type { LeadArea, LeadSearchPlan } from "./search/plan";
import { LeadSearchPlanSchema } from "./search/plan-schema";
import type { LeadPlanned } from "./lead-plan";

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

export const LeadExportQuerySchema = LeadsViewSchema;

export const RenameLeadSearchSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const BusinessLineSchema = z.object({ business_line: z.string().trim().min(3).max(160) });

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
