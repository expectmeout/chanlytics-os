/**
 * What a search asks and a bulk act changes, as the page says and addresses them: a view's route, a stage's
 * arguments, the question a search stops on and what the plan is likely to find. Moved whole from leads.ts (Reach out
 * Part 2.5), which re-exports it. The routes' inputs, and the plan made from an ask, are leads/plan-schema.ts's.
 */
import type { LeadPlanFacts } from "./dtos";
import { planReadsSites, type LeadArea, type LeadSearchPlan } from "./search/plan";
import type { LeadPeoplePlan } from "./search/people-plan/plan";
import { planWho } from "./search/sentence";
import { planMinutes } from "./search/cards";
import { LEAD_CLASSES, LEAD_LISTS, type LeadClass, type LeadList } from "./words/lists";
import { leadAllowanceFact, outcomeMove } from "./words/notes";
import {
  LEAD_FITS,
  LEAD_REACH_FILTERS,
  LEAD_STATUS_GROUPS,
  type LeadFit,
  type LeadReachFilter,
  type LeadStatusGroup,
} from "./search/sets";
import type { LeadStageInput } from "./plan-schema";
import { UUID } from "../shared/identity";
import { isOneOf } from "../shared/unknown";

/** The door's arguments (lead_set_stage). The door judges what converts; this only spells the ask. */
export function stageArgs(leadStageInput: LeadStageInput): {
  p_stage: string | null;
  p_reason: string | null;
  p_fit_reason: string | null;
  p_outcome: string | null;
  p_note: string | null;
  p_spoke_with: string | null;
} {
  const none = { p_stage: null, p_reason: null, p_fit_reason: null, p_outcome: null, p_note: null, p_spoke_with: null };
  switch (leadStageInput.kind) {
    case "stage":
      return { ...none, p_stage: leadStageInput.stage };
    case "not_a_fit":
      return {
        ...none,
        p_stage: "archived",
        p_reason: leadStageInput.why === "customer" ? "customer" : "not_a_fit",
        p_fit_reason: leadStageInput.why,
      };
    case "said_no":
      return { ...none, p_stage: "archived", p_reason: "said_no" };
    case "emailed":
      return { ...none, p_stage: "nurture", p_outcome: "emailed" };
    case "outcome": {
      const result = outcomeMove(leadStageInput.outcome);
      return {
        ...none,
        p_stage: result.stage,
        p_reason: result.closedReason,
        p_outcome: leadStageInput.outcome,
        p_note: leadStageInput.note ?? null,
        p_spoke_with: leadStageInput.spoke_with || null,
      };
    }
  }
}

/** The card's head. The rest of what the card draws is the plan itself and the workspace's facts. */
export interface LeadPlanView {
  title: string;
}

export type LeadPlanRefusalKind = "outside_us" | "not_businesses" | "no_card" | "not_a_plan";

export type LeadPlanned =
  | { ok: true; plan: LeadSearchPlan; view: LeadPlanView }
  | { ok: false; refusal: { kind: LeadPlanRefusalKind; text: string; what: string | null } };

/** A people search's ask as its plan (00430), or a refusal in words, as a places one's. */
export type PeoplePlanned =
  | { ok: true; plan: LeadPeoplePlan; view: LeadPlanView }
  | { ok: false; refusal: { kind: LeadPlanRefusalKind; text: string; what: string | null } };

/* ------------------------------------------- a view of the scope, as a route */

/** A criterion's key as a plan keys it ("chain", "wrong_kind", "unreachable"): what the Excluded view's chip names. */
export const LEAD_CRITERION_KEY = /^[a-z][a-z0-9_]{0,59}$/;

/** How many characters of the box's words the read takes. */
export const LEAD_WORDS_MAX = 80;

/**
 * The chips a view carries in its route (decision 0083, Phase B, in release C's grammar,
 * `2026-09-19-lead-finder-C-extras.md` item 2): the criterion that left a lead out, a fit, each reach the Filter asks, and
 * each status group a heading's menu asks (00552). The box's words are not a chip: they are typed, and stay in the view's
 * place. A chip's name is the name the read takes it by.
 */
export interface LeadChips {
  excluded_by?: string;
  fit?: LeadFit;
  reach?: LeadReachFilter[];
  status_group?: LeadStatusGroup[];
}

/**
 * "clients/leads:s-<search>:l-<list>:c-<class>:x-<criterion>:f-<fit>:r-email:r-phone:t-needs:t-in:p-<lead>". Ask cites a
 * view with neither id as a page (ask/citations.ts isPageRoute); one with a search's or a lead's id names that row, and
 * grounds only where it was read. The chips come after the class, each once and in their sets' order, so one view
 * has one route. The lead that is open (`p-`) comes last, so a view's own route is a prefix of the route with a lead
 * open over it: the view is what a read is keyed by, and the open lead is never part of that key.
 */
export function leadsRoute(values: {
  searchId?: string | null;
  list?: LeadList | null;
  cls?: LeadClass | null;
  chips?: LeadChips;
  peek?: string | null;
}): string {
  const parts = ["clients/leads"];
  if (values.searchId) parts.push(`s-${values.searchId}`);
  if (values.list && values.list !== "all") parts.push(`l-${values.list}`);
  if (values.cls) parts.push(`c-${values.cls}`);
  const chips = values.chips ?? {};
  if (chips.excluded_by && LEAD_CRITERION_KEY.test(chips.excluded_by)) parts.push(`x-${chips.excluded_by}`);
  if (chips.fit) parts.push(`f-${chips.fit}`);
  for (const r of LEAD_REACH_FILTERS) if (chips.reach?.includes(r)) parts.push(`r-${r}`);
  for (const g of LEAD_STATUS_GROUPS) if (chips.status_group?.includes(g)) parts.push(`t-${g}`);
  if (values.peek) parts.push(`p-${values.peek}`);
  return parts.join(":");
}

/**
 * The filters a view asks of the read, or null when it asks none (leads_page's p_filters, lead_view_counts'): the box's
 * words trimmed, the criterion, the fit, and the reaches and status groups each once in their sets' order. The pile asks
 * none (#1978).
 */
export function leadFiltersOf(values: {
  q?: string | null;
  excluded_by?: string | null;
  fit?: LeadFit | null;
  reach?: readonly LeadReachFilter[] | null;
  status_group?: readonly LeadStatusGroup[] | null;
}): {
  q?: string;
  excluded_by?: string;
  fit?: LeadFit;
  reach?: LeadReachFilter[];
  status_group?: LeadStatusGroup[];
} | null {
  const query = (values.q ?? "").trim().slice(0, LEAD_WORDS_MAX);
  const reach = LEAD_REACH_FILTERS.filter((r) => values.reach?.includes(r));
  const groups = LEAD_STATUS_GROUPS.filter((g) => values.status_group?.includes(g));
  const out = {
    ...(query ? { q: query } : {}),
    ...(values.excluded_by && LEAD_CRITERION_KEY.test(values.excluded_by) ? { excluded_by: values.excluded_by } : {}),
    ...(values.fit ? { fit: values.fit } : {}),
    ...(reach.length ? { reach } : {}),
    ...(groups.length ? { status_group: groups } : {}),
  };
  return Object.keys(out).length ? out : null;
}

/** A view's route without its chips: the view a selection belongs to, which a narrowing never changes (0083, §6.8). */
export function leadsRouteUnchipped(route: string): string {
  return route
    .split(":")
    .filter((s) => !/^[xfrt]-/.test(s))
    .join(":");
}

export function parseLeadsRoute(route: string): {
  searchId: string | null;
  list: LeadList;
  cls: LeadClass | null;
  chips: LeadChips;
  peek: string | null;
} | null {
  const [head, ...segs] = route.split(":");
  if (head !== "clients/leads" && head !== "leads") return null;
  const out: NonNullable<ReturnType<typeof parseLeadsRoute>> = {
    searchId: null,
    list: "all",
    cls: null,
    chips: {},
    peek: null,
  };
  const reach = new Set<string>();
  const groups = new Set<string>();
  for (const otherSeg of segs) {
    const dash = otherSeg.indexOf("-");
    if (dash < 1) continue;
    const [seg, val] = [otherSeg.slice(0, dash), otherSeg.slice(dash + 1)];
    if (seg === "s" && UUID.test(val)) out.searchId = val;
    else if (seg === "l" && isOneOf(LEAD_LISTS, val)) out.list = val;
    else if (seg === "c" && isOneOf(LEAD_CLASSES, val)) out.cls = val;
    else if (seg === "x" && LEAD_CRITERION_KEY.test(val)) out.chips.excluded_by = val;
    else if (seg === "f" && isOneOf(LEAD_FITS, val)) out.chips.fit = val;
    else if (seg === "r") reach.add(val);
    else if (seg === "t") groups.add(val);
    else if (seg === "p" && UUID.test(val)) out.peek = val;
  }
  const reaches = LEAD_REACH_FILTERS.filter((r) => reach.has(r));
  if (reaches.length) out.chips.reach = reaches;
  const standing = LEAD_STATUS_GROUPS.filter((g) => groups.has(g));
  if (standing.length) out.chips.status_group = standing;
  return out;
}

/* ------------------------------------------- what the model answers ------- */

export const LEAD_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body"],
  properties: { subject: { type: "string" }, body: { type: "string" } },
} as const;

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
export function leadQuestionMail(input: { name: string; sentence: string; link: string }): {
  subject: string;
  body: string;
} {
  return {
    subject: leadQuestionTitle(input.name),
    body: [input.sentence, "", LEAD_QUESTION_WAIT_LINE, "", `Answer it: ${input.link}`].join("\n"),
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
  facts: LeadPlanFacts | null,
): { emailPct: number | null; phonePct: number | null; line: string } {
  const item = facts ? facts.prior : null;
  if (!facts || !item || item.places < LEAD_PRIOR_MIN_PLACES || item.matched <= 0) {
    return { emailPct: null, phonePct: null, line: "The share with an email shows after the first 25." };
  }
  const share = Math.min(1, item.with_email / item.matched);
  const emailPct = Math.round(share * 100);
  const withEmail = Math.round(plan.count * share);
  const of = facts.priorOf ? ` · from past searches for ${facts.priorOf}` : "";
  return { emailPct, phonePct: 100 - emailPct, line: `About ${withEmail} will have an email; the rest you call${of}` };
}

/**
 * The facts under the sentence (§8.3), in the one unit the owner has: leads. No dollar meter. Facts not read yet say no
 * allowance: a card that had none drew "0 left this month" over a search that could run (Ruben, 10 Oct 2026).
 */
export function leadPlanFacts(plan: LeadSearchPlan, facts: LeadPlanFacts | null): string[] {
  return [
    `About ${planMinutes(plan)} minutes — leave the page if you like`,
    // No number: the card cannot know how many of THIS search's places are already here until it has looked.
    "Anything already yours is skipped",
    facts
      ? `Counts only matches with a checked phone or email · ${leadAllowanceFact(facts.leadsLeft)}`
      : "Counts only matches with a checked phone or email",
  ];
}

/**
 * The facts for a plan opened from a search itself (Widen, an area nearby, the map's), which no Ask turn gave any: the
 * month the page already reads (leads_page's month, the same counter planFacts reads, so the number is spelled once),
 * the search's own nearby areas, and nothing it cannot know (no prior, no skips counted). The allowance binds where the
 * plan asks for more than is left. Without these the card said "0 left this month" over a search that could run, then
 * said no allowance at all (Ruben, 10 Oct 2026). An idea's plan brings its kind's prior, which its read already had
 * (00398), and the kind it is of.
 */
export function leadMonthPlanFacts(
  month: { left: number; renewsOn: string },
  count: number,
  nearby: readonly LeadArea[],
  prior: { of: string; counts: LeadPlanFacts["prior"] } | null,
): LeadPlanFacts {
  return {
    dupes: 0,
    leadsLeft: month.left,
    bound: month.left < count ? "allowance" : null,
    prior: prior ? prior.counts : null,
    priorOf: prior && prior.counts ? prior.of : null,
    renewsOn: month.renewsOn,
    nearby: [...nearby],
  };
}

/** The same facts as one line, a phone's (§8.3): how long, what it skips, and what is left where that is known. */
export function leadPlanFactLine(plan: LeadSearchPlan, facts: LeadPlanFacts | null): string {
  // In the people card's order and words (people-plan.ts peoplePlanFactLine; Ruben, 23 Oct 2026: one card for both).
  return [
    `About ${planMinutes(plan)} min`,
    ...(facts
      ? [`uses ${Math.max(0, Math.min(plan.count, facts.leadsLeft))} of your ${facts.leadsLeft} leads this month`]
      : []),
    ...(planReadsSites(plan) ? ["reads each one's website"] : []),
    "skips leads you have",
  ].join(" · ");
}

/**
 * What the card asks for, and how it says why it is not what was typed (§0.2,
 * decision 27). When a limit binds the count is clamped to what is left, the
 * button says that number, and one sentence says which limit and what else
 * would fit. There is no dollar meter, and the word is always leads.
 */
export function leadPlanAsk(
  plan: LeadSearchPlan,
  facts: LeadPlanFacts | null,
): { count: number; label: string; covers: string | null } {
  const binds = !!facts && facts.bound !== null && facts.leadsLeft < plan.count;
  const count = binds && facts ? Math.max(0, facts.leadsLeft) : plan.count;
  // None left is said on the button, which cannot be pressed, rather than "Find 0 leads".
  const label = count < 1 ? "No leads left this month" : `Find ${count} lead${count === 1 ? "" : "s"}`;
  if (!binds || !facts) return { count, label, covers: null };
  const otherPlanWho = planWho(plan);
  const covers =
    facts.bound === "budget"
      ? `Emails for ${otherPlanWho} are hard to find, so this month covers about ${count} more. Find ${count} now?`
      : `You have ${count} lead${count === 1 ? "" : "s"} left this month. Your leads renew on ${facts.renewsOn}.`;
  return { count, label, covers };
}
