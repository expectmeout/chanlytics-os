import "server-only";
import { z } from "zod";
import {
  AppError,
  ProposeLeadSearchSchema,
  planLeadSearch,
  planSentence,
  type LeadSearchPlan,
} from "@chanlytics/contracts";
import { answerPlanOf, planFacts, searchRow, waitingQuestionOf, type SearchViewRow } from "../../../leads/leads";
import { requireUuid } from "../../../request-guards";
import { defineAct, propose, refuse, str, type ProposalOutcome, type ToolContext } from "../context";

/**
 * The ask as the model writes it, field by field, in the flat shape it is shown. The plan's own schema
 * (ProposeLeadSearchSchema, contracts) judges it after the shaping below, in the handler, so the refusal keeps the
 * plan's words and the owner check still comes first.
 */
const LeadSearchAsk = z.object({
  looking_for: z.enum(["local_businesses", "people", "online_sellers", "other"]),
  country: z.string(),
  count: z.number().int(),
  who: z.string(),
  who_one: z.string(),
  category_key: z.string(),
  terms: z.array(z.string()),
  city: z.string().optional(),
  region: z.string(),
  zip: z.string().optional(),
  contact: z.enum(["phone", "email"]),
  criteria: z.array(z.object({ text: z.string(), standard: z.enum(["likely", "seen"]), required: z.boolean() })),
  leave_out: z.array(z.object({ words: z.string() })).optional(),
  asked: z.string(),
  amends: z.string().optional(),
});

type LeadSearchAskInput = z.output<typeof LeadSearchAsk>;

/**
 * What a model writes that the schema, rightly, will not take as written:
 * a key in Title-Case or with a hyphen, and a country with its code in
 * brackets. Both are made the plan's own shape here; a key with no letters
 * left is passed through so the schema says so in words. The place, when
 * the model packs "Miami, FL" into one field, is the planner's to read
 * (planArea in contracts): the composer and this tool must agree on it.
 */
const shapeAsk = (input: LeadSearchAskInput) => {
  const keyed = String(input.category_key ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/, "")
    .slice(0, 40);
  return {
    ...input,
    category_key: keyed || input.category_key,
    country: String(input.country ?? "")
      .replace(/\(.*?\)/g, "")
      .trim(),
    city: str(input.city, 60) || null,
    zip: /^\d{5}$/.test(String(input.zip ?? "")) ? String(input.zip) : null,
    criteria: (Array.isArray(input.criteria) ? input.criteria : []).slice(0, 6),
    leave_out: (Array.isArray(input.leave_out) ? input.leave_out : [])
      .slice(0, 6)
      .map((l) => ({ words: str((l as Record<string, unknown>).words, 40) })),
  };
};

/** The plan's schema over the shaped ask: one parse, the plan's own words on a refusal. */
const LeadSearchPlanInput = z.preprocess((raw) => shapeAsk(raw as LeadSearchAskInput), ProposeLeadSearchSchema);

/**
 * A lead search as a card the owner approves. The model says who, how many,
 * where and the standard; the planner in contracts builds the plan, keys every
 * criterion and exclusion and checks the result against release A's own
 * schema, so what the card carries is a plan the door would accept. Nothing is
 * searched, reserved or spent here: the approval posts the plan, and the route
 * is the one that spends. With `amends` (the id of a search that stopped to
 * ask), the card answers that search instead: the plan is the same search with
 * the owner's answer applied, at the version and count the server sets.
 */
async function proposeLeadSearch(t: ToolContext, input: LeadSearchAskInput): Promise<ProposalOutcome> {
  if (t.role !== "owner") return refuse("only an owner can start a lead search; say so, and that an owner can ask");
  const shaped = LeadSearchPlanInput.safeParse(input);
  if (!shaped.success)
    return refuse(
      `the plan is not complete: ${shaped.error.issues[0]?.path.join(".")} ${shaped.error.issues[0]?.message}`,
    );
  const amends = str(input.amends, 40);
  let row: SearchViewRow | null = null;
  let question: string | null = null;
  if (amends) {
    // The search it answers is read, never trusted from the words: one not waiting (or not this workspace's) is a
    // refusal in words, so the model says so instead of a card that would start a second search. A database
    // error is not a missing search: it is thrown on, for buildProposal to log and say it could not be checked.
    try {
      row = await searchRow(t.ctx, t.tenantId, requireUuid(amends, "search"));
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
    }
    if (!row) return refuse("that search is not in this workspace; propose a new search instead");
    question = waitingQuestionOf(row);
    if (!question) return refuse("that search is not waiting for an answer; propose a new search instead");
  }
  // An answer is planned at the count the search's plan reserved, so the title and the view say the same number
  // as the plan the card carries; the model's count is only its own for a new search.
  const storedCount = row ? (row.plan as LeadSearchPlan | null)?.count : undefined;
  const r = planLeadSearch(typeof storedCount === "number" ? { ...shaped.data, count: storedCount } : shaped.data);
  // Outside the US, people rather than businesses, an ask no card fits: words
  // for the model to say, never a card with a problem in it.
  if (!r.ok) return refuse(r.refusal.text);
  // The version and the count are the server's (answerPlanOf), the same as the answer route sets them.
  const plan = row ? answerPlanOf(row, r.plan) : r.plan;
  const answer = row && question ? { search_id: row.id, name: row.name, question } : null;
  // The facts under the sentence -- the month's leads left, the duplicates
  // already theirs, what past searches for this kind of business found -- are
  // one read, `planFacts` in server/leads.ts. It lives there and not here
  // because this module reads and never writes a door of its own (a test holds
  // it to that), and the plan card is drawn from exactly what it answers.
  return propose({
    kind: "lead_search",
    needs: "owner",
    title: r.view.title,
    summary: answer ? `Answers “${answer.question}”: ${planSentence(plan)}` : planSentence(plan),
    payload: {
      plan,
      view: r.view,
      facts: await planFacts(t.ctx, t.tenantId, { categoryKey: shaped.data.category_key, now: t.now }),
      ...(answer ? { amends: answer } : {}),
    },
    // An answer carries the round on; there is nothing to undo (Stop is the strip's).
    undo: answer ? null : "Stop the search",
  });
}

export const propose_lead_search = defineAct({
  name: "propose_lead_search",
  description:
    "Propose a search for businesses in the US the owner could reach: what kind (plural, and one of them), how many (50, 100, 200 or 500 unless they said a number), where (a city and its two-letter state, a ZIP, or a state), the contact standard (phone, or email checked), the criteria each with whether it must be seen or is likely from what Claude reads -- seen is only for what a listing shows (a rating or review count, a website, an email, a phone that matches the site, open or closed) and is judged from those facts alone; what a business IS or DOES (its kind, who owns it, what it serves or sells, who it treats) is likely, never seen, because a listing's name and category do not count as seeing it; and the kind of business itself is checked on every search without being written as a criterion -- who to leave out (chains, other kinds; short chips in plain words), up to three search terms (widest first). looking_for is local_businesses, or people, online_sellers or other when that is what was asked: those are answered in words, not searched. asked: the owner's words. It becomes a plan card the owner approves; nothing is searched or spent before that. Owner-only. amends: the id of a search that stopped to ask (list_lead_searches shows its question) when the plan is that search with the owner's answer applied; the card then answers that search instead of starting a new one.",
  input: LeadSearchAsk,
  label: "Planning a search",
  build: proposeLeadSearch,
});
