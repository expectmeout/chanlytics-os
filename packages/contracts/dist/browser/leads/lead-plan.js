import { planWho } from "./search/sentence.js";
import { planMinutes } from "./search/cards.js";
import { LEAD_CLASSES, LEAD_LISTS, leadAllowanceFact, outcomeMove } from "./lead-words.js";
export function stageArgs(i) {
  const none = { p_stage: null, p_reason: null, p_fit_reason: null, p_outcome: null, p_note: null, p_spoke_with: null };
  switch (i.kind) {
    case "stage":
      return { ...none, p_stage: i.stage };
    case "not_a_fit":
      return {
        ...none,
        p_stage: "archived",
        p_reason: i.why === "customer" ? "customer" : "not_a_fit",
        p_fit_reason: i.why
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
        p_spoke_with: i.spoke_with || null
      };
    }
  }
}
export function leadsRoute(v) {
  const parts = ["clients/leads"];
  if (v.searchId) parts.push(`s-${v.searchId}`);
  if (v.list && v.list !== "all") parts.push(`l-${v.list}`);
  if (v.cls) parts.push(`c-${v.cls}`);
  if (v.peek) parts.push(`p-${v.peek}`);
  return parts.join(":");
}
export function parseLeadsRoute(route) {
  const [head, ...segs] = route.split(":");
  if (head !== "clients/leads" && head !== "leads") return null;
  const out = {
    searchId: null,
    list: "all",
    cls: null,
    chips: {},
    peek: null
  };
  for (const s of segs) {
    const dash = s.indexOf("-");
    if (dash < 1) continue;
    const [seg, val] = [s.slice(0, dash), s.slice(dash + 1)];
    if (seg === "s" && /^[0-9a-f-]{36}$/.test(val)) out.searchId = val;
    else if (seg === "l" && LEAD_LISTS.includes(val)) out.list = val;
    else if (seg === "c" && LEAD_CLASSES.includes(val)) out.cls = val;
    else if (seg === "p" && /^[0-9a-f-]{36}$/.test(val)) out.peek = val;
  }
  return out;
}
export const LEAD_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body"],
  properties: { subject: { type: "string" }, body: { type: "string" } }
};
export function leadDraftFooter(business, address) {
  return `

\u2014
${business} \xB7 ${address}
Not interested? Reply "no thanks" and I won't write again.`;
}
export const leadQuestionTitle = (name) => `Your search for ${name} is waiting for your answer`;
export const LEAD_QUESTION_WAIT_LINE = "Nothing is spent while this waits. With no answer in a day, it stops and keeps what it found.";
export const leadQuestionRoute = (searchId) => leadsRoute({ searchId, cls: "excluded" });
export function leadQuestionMail(x) {
  return {
    subject: leadQuestionTitle(x.name),
    body: [x.sentence, "", LEAD_QUESTION_WAIT_LINE, "", `Answer it: ${x.link}`].join("\n")
  };
}
export const LEAD_PRIOR_MIN_PLACES = 50;
export function leadPlanLikely(plan, facts) {
  const p = facts ? facts.prior : null;
  if (!facts || !p || p.places < LEAD_PRIOR_MIN_PLACES || p.matched <= 0) {
    return { emailPct: null, phonePct: null, line: "The share with an email shows after the first 25." };
  }
  const share = Math.min(1, p.with_email / p.matched);
  const emailPct = Math.round(share * 100);
  const withEmail = Math.round(plan.count * share);
  const of = facts.priorOf ? ` \xB7 from past searches for ${facts.priorOf}` : "";
  return { emailPct, phonePct: 100 - emailPct, line: `About ${withEmail} will have an email; the rest you call${of}` };
}
export function leadPlanFacts(plan, facts) {
  return [
    `About ${planMinutes(plan)} minutes \u2014 leave the page if you like`,
    // No number: the card cannot know how many of THIS search's places are already here until it has looked.
    "Anything already yours is skipped",
    facts ? `Counts only matches with a checked phone or email \xB7 ${leadAllowanceFact(facts.leadsLeft)}` : "Counts only matches with a checked phone or email"
  ];
}
export function leadMonthPlanFacts(month, count, nearby, prior) {
  return {
    dupes: 0,
    leadsLeft: month.left,
    bound: month.left < count ? "allowance" : null,
    prior: prior ? prior.counts : null,
    priorOf: prior && prior.counts ? prior.of : null,
    cannotSee: null,
    renewsOn: month.renewsOn,
    nearby: [...nearby]
  };
}
export function leadPlanFactLine(plan, facts) {
  return [
    `About ${planMinutes(plan)} min`,
    ...facts ? [`uses ${Math.max(0, Math.min(plan.count, facts.leadsLeft))} of your ${facts.leadsLeft} leads this month`] : [],
    "skips leads you have"
  ].join(" \xB7 ");
}
export function leadPlanAsk(plan, facts) {
  const binds = !!facts && facts.bound !== null && facts.leadsLeft < plan.count;
  const count = binds && facts ? Math.max(0, facts.leadsLeft) : plan.count;
  const label = count < 1 ? "No leads left this month" : `Find ${count} lead${count === 1 ? "" : "s"}`;
  if (!binds || !facts) return { count, label, covers: null };
  const who = planWho(plan);
  const covers = facts.bound === "budget" ? `Emails for ${who} are hard to find, so this month covers about ${count} more. Find ${count} now?` : `You have ${count} lead${count === 1 ? "" : "s"} left this month. Your leads renew on ${facts.renewsOn}.`;
  return { count, label, covers };
}
