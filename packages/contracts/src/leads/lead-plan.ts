/**
 * What a search asks and a bulk act changes: the query and view schemas, the stage and bulk inputs, and the plan a
 * search runs to. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import { z } from "zod";
import type { LeadPlanFacts } from "./lead-dtos";
import {
  LEAD_MAX_PLACES,
  type LeadArea,
  type LeadSearchPlan,
  LeadSearchPlanSchema,
  planMinutes,
  planWho,
  stateCode,
} from "./lead-search";
import {
  LEAD_CALL_OUTCOMES,
  LEAD_CLASSES,
  LEAD_LISTS,
  LEAD_NOT_A_FIT_WHYS,
  LEAD_OUTSIDE_US_LINE,
  LEAD_SORTS,
  leadAllowanceFact,
  type LeadClass,
  type LeadList,
  leadNoCardLine,
  leadNotBusinessesLine,
  outcomeMove,
} from "./lead-words";

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

/** The door's arguments (lead_set_stage). The door judges what converts; this only spells the ask. */
export function stageArgs(i: LeadStageInput): {
  p_stage: string | null;
  p_reason: string | null;
  p_fit_reason: string | null;
  p_outcome: string | null;
  p_note: string | null;
} {
  const none = { p_stage: null, p_reason: null, p_fit_reason: null, p_outcome: null, p_note: null };
  switch (i.kind) {
    case "stage":
      return { ...none, p_stage: i.stage };
    case "not_a_fit":
      return {
        ...none,
        p_stage: "archived",
        p_reason: i.why === "customer" ? "customer" : "not_a_fit",
        p_fit_reason: i.why,
      };
    case "said_no":
      return { ...none, p_stage: "archived", p_reason: "said_no" };
    case "emailed":
      return { ...none, p_stage: "nurture", p_outcome: "emailed" };
    case "outcome": {
      const m = outcomeMove(i.outcome);
      return { ...none, p_stage: m.stage, p_reason: m.closedReason, p_outcome: i.outcome, p_note: i.note ?? null };
    }
  }
}

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

/** The card's head. The rest of what the card draws is the plan itself and the workspace's facts. */
export interface LeadPlanView {
  title: string;
}

export type LeadPlanRefusalKind = "outside_us" | "not_businesses" | "no_card" | "not_a_plan";

export type LeadPlanned =
  | { ok: true; plan: LeadSearchPlan; view: LeadPlanView }
  | { ok: false; refusal: { kind: LeadPlanRefusalKind; text: string; what: string | null } };

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

/* ------------------------------------------- a view of the scope, as a route */

/**
 * The chips a view may carry. Release B parses none -- the route grammar keeps the key so the surface, the route and
 * the bulk act agree on one shape, and release C fills it (`2026-09-19-lead-finder-C-extras.md`). It is a type, not a
 * list: an empty record cannot be given a value by accident.
 */
export type LeadChips = Record<string, never>;

/**
 * "clients/leads:s-<search>:l-<list>:c-<class>:p-<lead>". Ask cites a view with neither id as a page (ask/citations.ts
 * PAGE_PREFIX); one with a search's or a lead's id names that row, and grounds only where it was read.
 * Chips join in release C. The lead that is open (`p-`) comes last, so a view's own route is a prefix of the route
 * with a lead open over it: the view is what a read is keyed by, and the open lead is never part of that key.
 */
export function leadsRoute(v: {
  searchId?: string | null;
  list?: LeadList | null;
  cls?: LeadClass | null;
  chips?: Record<string, unknown>;
  peek?: string | null;
}): string {
  const parts = ["clients/leads"];
  if (v.searchId) parts.push(`s-${v.searchId}`);
  if (v.list && v.list !== "all") parts.push(`l-${v.list}`);
  if (v.cls) parts.push(`c-${v.cls}`);
  if (v.peek) parts.push(`p-${v.peek}`);
  return parts.join(":");
}

export function parseLeadsRoute(route: string): {
  searchId: string | null;
  list: LeadList;
  cls: LeadClass | null;
  chips: Record<string, unknown>;
  peek: string | null;
} | null {
  const [head, ...segs] = route.split(":");
  if (head !== "clients/leads" && head !== "leads") return null;
  const out = {
    searchId: null as string | null,
    list: "all" as LeadList,
    cls: null as LeadClass | null,
    chips: {},
    peek: null as string | null,
  };
  for (const s of segs) {
    const dash = s.indexOf("-");
    if (dash < 1) continue;
    const [seg, val] = [s.slice(0, dash), s.slice(dash + 1)];
    if (seg === "s" && /^[0-9a-f-]{36}$/.test(val)) out.searchId = val;
    else if (seg === "l" && (LEAD_LISTS as readonly string[]).includes(val)) out.list = val as LeadList;
    else if (seg === "c" && (LEAD_CLASSES as readonly string[]).includes(val)) out.cls = val as LeadClass;
    else if (seg === "p" && /^[0-9a-f-]{36}$/.test(val)) out.peek = val;
  }
  return out;
}

/* ------------------------------------------- what the model answers ------- */

export const LEAD_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body"],
  properties: { subject: { type: "string" }, body: { type: "string" } },
} as const;

export const LeadDraftAnswerSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(20).max(2000),
});

export const LEAD_SUGGEST_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["line", "items"],
  properties: {
    line: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["words", "who_for", "category_key"],
        properties: { words: { type: "string" }, who_for: { type: "string" }, category_key: { type: "string" } },
      },
    },
  },
} as const;

export const LeadSuggestAnswerSchema = z.object({
  line: z.string().trim().min(3).max(160),
  items: z
    .array(
      z.object({
        words: z.string().trim().min(3).max(80),
        who_for: z.string().trim().min(3).max(120),
        category_key: z.string().regex(/^[a-z_]{2,40}$/),
      }),
    )
    .min(1)
    .max(4),
});

/** The foot every draft carries: the business's postal address and a way to say no (CAN-SPAM). */
export function leadDraftFooter(business: string, address: string): string {
  return `\n\n—\n${business} · ${address}\nNot interested? Reply "no thanks" and I won't write again.`;
}

/* ------------------------------------------ the question after the probe -- */

/** The bell's title and the email's subject when a search stops to ask (00163 writes the same words in SQL). */
export const leadQuestionTitle = (name: string): string => `Your search for ${name} is waiting for your answer`;

/** What waiting costs and how long it lasts (the sweep ends a question after a day): the strip's line and the email's. */
export const LEAD_QUESTION_WAIT_LINE =
  "Nothing is spent while this waits. With no answer in a day, it stops and keeps what it found.";

/** Where a question opens: its search, on the pile it asks about. A question is only ever asked about places left out. */
export const leadQuestionRoute = (searchId: string): string => leadsRoute({ searchId, cls: "excluded" });

/** The email the runner sends when a search stops to ask: the question, what waiting means, and the way back. */
export function leadQuestionMail(x: { name: string; sentence: string; link: string }): {
  subject: string;
  body: string;
} {
  return {
    subject: leadQuestionTitle(x.name),
    body: [x.sentence, "", LEAD_QUESTION_WAIT_LINE, "", `Answer it: ${x.link}`].join("\n"),
  };
}

/* --------------------------------------------- the plan card (Task 9) -- */

/** Under this many places judged, a prior is too thin to say a number from. */
export const LEAD_PRIOR_MIN_PLACES = 50;

/**
 * The Likely line and its two-part bar (§8.3): what past searches for this
 * kind of business found, never a promise about this one. A kind never
 * searched says the share is checked after the first 25 (P3).
 */
export function leadPlanLikely(
  plan: LeadSearchPlan,
  facts: LeadPlanFacts,
): { emailPct: number | null; phonePct: number | null; line: string } {
  const p = facts.prior;
  if (!p || p.places < LEAD_PRIOR_MIN_PLACES || p.matched <= 0) {
    return { emailPct: null, phonePct: null, line: "How many have an email is checked after the first 25." };
  }
  const share = Math.min(1, p.with_email / p.matched);
  const emailPct = Math.round(share * 100);
  const withEmail = Math.round(plan.count * share);
  const of = facts.priorOf ? ` · from past searches for ${facts.priorOf}` : "";
  return { emailPct, phonePct: 100 - emailPct, line: `About ${withEmail} will have an email; the rest you call${of}` };
}

/** The facts under the sentence (§8.3), in the one unit the owner has: leads. No dollar meter. */
export function leadPlanFacts(plan: LeadSearchPlan, facts: LeadPlanFacts): string[] {
  return [
    `About ${planMinutes(plan)} minutes — leave the page if you like`,
    // No number: the card cannot know how many of THIS search's places are already here until it has looked.
    "Anything already yours is skipped",
    `Counts only matches with a checked phone or email · ${leadAllowanceFact(facts.leadsLeft)}`,
  ];
}

/**
 * What the card asks for, and how it says why it is not what was typed (§0.2,
 * decision 27). When a limit binds the count is clamped to what is left, the
 * button says that number, and one sentence says which limit and what else
 * would fit. There is no dollar meter, and the word is always leads.
 */
export function leadPlanAsk(
  plan: LeadSearchPlan,
  facts: LeadPlanFacts,
): { count: number; label: string; covers: string | null } {
  const binds = facts.bound !== null && facts.leadsLeft < plan.count;
  const count = binds ? Math.max(0, facts.leadsLeft) : plan.count;
  const label = `Find ${count} lead${count === 1 ? "" : "s"}`;
  if (!binds) return { count, label, covers: null };
  const who = planWho(plan);
  const covers =
    facts.bound === "budget"
      ? `Emails for ${who} are hard to find, so this month covers about ${count} more. Find ${count} now?`
      : `You have ${count} lead${count === 1 ? "" : "s"} left this month. Your leads renew on ${facts.renewsOn}.`;
  return { count, label, covers };
}
