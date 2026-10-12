/**
 * What a search asks and a bulk act changes, as the page says and addresses them: a view's route, a stage's
 * arguments, the question a search stops on and what the plan is likely to find. Moved whole from leads.ts (Reach out
 * Part 2.5), which re-exports it. The routes' inputs, and the plan made from an ask, are lead-plan-schema.ts's.
 */
import type { LeadPlanFacts } from "./lead-dtos";
import type { LeadArea, LeadSearchPlan } from "./search/plan";
import { planWho } from "./search/sentence";
import { planMinutes } from "./search/cards";
import { LEAD_CLASSES, LEAD_LISTS, leadAllowanceFact, type LeadClass, type LeadList, outcomeMove } from "./lead-words";
import type { LeadStageInput } from "./lead-plan-schema";

/** The door's arguments (lead_set_stage). The door judges what converts; this only spells the ask. */
export function stageArgs(i: LeadStageInput): {
  p_stage: string | null;
  p_reason: string | null;
  p_fit_reason: string | null;
  p_outcome: string | null;
  p_note: string | null;
  p_spoke_with: string | null;
} {
  const none = { p_stage: null, p_reason: null, p_fit_reason: null, p_outcome: null, p_note: null, p_spoke_with: null };
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
      return {
        ...none,
        p_stage: m.stage,
        p_reason: m.closedReason,
        p_outcome: i.outcome,
        p_note: i.note ?? null,
        p_spoke_with: i.spoke_with || null,
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

/* ------------------------------------------- a view of the scope, as a route */

/**
 * The chips a view may carry. Release B parses none -- the route grammar keeps the key so the surface, the route and
 * the bulk act agree on one shape, and release C fills it (`2026-09-19-lead-finder-C-extras.md`). It is a type, not a
 * list: an empty record cannot be given a value by accident.
 */
export type LeadChips = Record<string, never>;

/**
 * "clients/leads:s-<search>:l-<list>:c-<class>:p-<lead>". Ask cites a view with neither id as a page (ask/citations.ts
 * isPageRoute); one with a search's or a lead's id names that row, and grounds only where it was read.
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
  facts: LeadPlanFacts | null,
): { emailPct: number | null; phonePct: number | null; line: string } {
  const p = facts ? facts.prior : null;
  if (!facts || !p || p.places < LEAD_PRIOR_MIN_PLACES || p.matched <= 0) {
    return { emailPct: null, phonePct: null, line: "The share with an email shows after the first 25." };
  }
  const share = Math.min(1, p.with_email / p.matched);
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
    cannotSee: null,
    renewsOn: month.renewsOn,
    nearby: [...nearby],
  };
}

/** The same facts as one line, a phone's (§8.3): how long, what it skips, and what is left where that is known. */
export function leadPlanFactLine(plan: LeadSearchPlan, facts: LeadPlanFacts | null): string {
  return [
    `About ${planMinutes(plan)} min`,
    "skips leads you have",
    ...(facts ? [leadAllowanceFact(facts.leadsLeft)] : []),
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
  const who = planWho(plan);
  const covers =
    facts.bound === "budget"
      ? `Emails for ${who} are hard to find, so this month covers about ${count} more. Find ${count} now?`
      : `You have ${count} lead${count === 1 ? "" : "s"} left this month. Your leads renew on ${facts.renewsOn}.`;
  return { count, label, covers };
}
