import "server-only";
import { z } from "zod";
import {
  AppError,
  LEAD_CARDS,
  LEAD_LIST_MAX,
  LeadSearchPlanSchema,
  addressOf,
  ProposeAnySearchSchema,
  peopleEstimateUsd,
  peoplePlanSentence,
  planLeadSearch,
  planPeopleSearch,
  planSentence,
  proposalBelowNeeds,
  reachOutAddWords,
  type LeadSearchPlan,
  type ProposePeopleSearch,
  type ReachOutAddDto,
} from "@chanlytics/contracts";
import { leadCardsLive, reachOutRootOf } from "@chanlytics/db";
import { addToReachOut } from "../../../../leads/lead-workbench";
import { answerPlanOf, planFacts, searchRow, waitingQuestionOf, type SearchViewRow } from "../../../../leads/leads";
import { refuseList } from "../../../../leads/lead-lists";
import { requireUuid } from "../../../../request-guards";
import {
  UUID,
  actAction,
  approvalWords,
  defineActions,
  noteRow,
  offeredTo,
  propose,
  refuse,
  str,
  type ActDef,
  type ProposalOutcome,
  type ToolContext,
} from "../../context";

/**
 * The ask as the model writes it, field by field, in the flat shape it is shown. The plan's own schema
 * (ProposeAnySearchSchema, contracts: a places ask or a people ask, by looking_for) judges it after the shaping below,
 * in the handler, so the refusal keeps the plan's words and the role check (a partner or an owner, the route's door)
 * still comes first. What only a places plan reads is optional here, so a people ask is never refused for leaving it out;
 * a places ask without it is refused by the places schema, in words.
 */
const LeadSearchAsk = z.object({
  looking_for: z.enum(["local_businesses", "people_at_companies", "people", "online_sellers", "other"]),
  country: z.string(),
  count: z.number().int(),
  who: z.string(),
  who_one: z.string().optional(),
  category_key: z.string().optional(),
  terms: z.array(z.string()),
  city: z.string().optional(),
  region: z.string(),
  zip: z.string().optional(),
  contact: z.enum(["phone", "email"]).optional(),
  criteria: z
    .array(z.object({ text: z.string(), standard: z.enum(["likely", "seen"]), required: z.boolean() }))
    .optional(),
  leave_out: z.array(z.object({ words: z.string() })).optional(),
  asked: z.string(),
  amends: z.string().optional(),
  // A people search's own (the people card, 00430).
  seniority: z.array(z.string()).optional(),
  industries: z.array(z.string()).optional(),
  company_sizes: z.array(z.string()).optional(),
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
  // An ask the places card does not answer (people at home, online sellers, anything else) names no kind, standard or
  // criteria: its own words answer it (planLeadSearch's refusal), never a schema's.
  const unplaced = input.looking_for !== "local_businesses" && input.looking_for !== "people_at_companies";
  return {
    ...input,
    ...(unplaced
      ? { who_one: input.who_one ?? input.who, contact: input.contact ?? "phone", criteria: input.criteria ?? [] }
      : {}),
    category_key: keyed || input.category_key || (unplaced ? "other" : undefined),
    country: String(input.country ?? "")
      .replace(/\(.*?\)/g, "")
      .trim(),
    city: str(input.city, 60) || null,
    zip: /^\d{5}$/.test(String(input.zip ?? "")) ? String(input.zip) : null,
    criteria: (Array.isArray(input.criteria) ? input.criteria : []).slice(0, 6),
    leave_out: (Array.isArray(input.leave_out) ? input.leave_out : [])
      .slice(0, 6)
      .map((l) => ({ words: str((l as Record<string, unknown>).words, 40) })),
    // What a people search names, in the card's own words: a seniority in lower case ("C-suite" is c_suite).
    seniority: (Array.isArray(input.seniority) ? input.seniority : []).map((s) =>
      String(s)
        .toLowerCase()
        .replace(/[^a-z]+/g, "_"),
    ),
    industries: (Array.isArray(input.industries) ? input.industries : []).slice(0, 5),
    company_sizes: Array.isArray(input.company_sizes) ? input.company_sizes : [],
  };
};

/** The plan's schema over the shaped ask: one parse, the plan's own words on a refusal. */
const LeadSearchPlanInput = z.preprocess((raw) => shapeAsk(raw as LeadSearchAskInput), ProposeAnySearchSchema);

/**
 * Named people at companies (the people card, 00430), as a card: its own plan, its own facts and its own door. It never
 * stops to ask, so nothing answers one; and while the card finds no leads (lead_card_live) it is said in words instead.
 */
async function proposePeopleSearch(t: ToolContext, ask: ProposePeopleSearch, amends: string): Promise<ProposalOutcome> {
  if (amends) return refuse("a people search does not stop to ask; propose a new one instead");
  // The people card finds leads only once its calibration run proved it (00430 lead_card_live): until then it is not
  // offered, and the owner is told so rather than shown a card the door would refuse.
  const live = await leadCardsLive(t.ctx.supabase).catch(() => [] as string[]);
  if (!live.includes("people_at_companies"))
    return refuse(
      "finding named people at companies opens once it has been checked, and is not open yet: say so, and offer to find local businesses of the kind instead",
    );
  const p = planPeopleSearch(ask);
  if (!p.ok) return refuse(p.refusal.text);
  const brief = LEAD_CARDS.find((c) => c.id === "people_at_companies");
  const facts = await planFacts(t.ctx, t.tenantId, { now: t.now });
  const estimate = peopleEstimateUsd(p.plan.count, {
    perPerson: brief?.costPerPlaceUsd ?? 0.002,
    perCheck: brief?.checkPerEmailUsd ?? 0.00089,
    start: brief?.startUsd ?? 0.01,
  });
  // What it reserves and where its people come from, said on the card before it is approved: the month's leads (the
  // owner's unit, never a price) and the card's source-rights note.
  const month = `Uses up to ${p.plan.count} of your ${facts.leadsLeft} leads left this month.`;
  return propose({
    kind: "people_search",
    title: p.view.title,
    summary: `${peoplePlanSentence(p.plan)}. ${month} ${brief?.rights ?? ""}`.trim(),
    payload: {
      plan: p.plan,
      view: p.view,
      facts: { leads_left: facts.leadsLeft, estimate_usd: estimate, rights: brief?.rights ?? null },
    },
  });
}

/**
 * A lead search as a card an owner or a partner approves. The model says who, how many,
 * where and the standard; the planner in contracts builds the plan, keys every
 * criterion and exclusion and checks the result against release A's own
 * schema, so what the card carries is a plan the door would accept. Nothing is
 * searched, reserved or spent here: the approval posts the plan, and the route
 * is the one that spends. With `amends` (the id of a search that stopped to
 * ask), the card answers that search instead: the plan is the same search with
 * the owner's answer applied, at the version and count the server sets.
 */
async function proposeLeadSearch(t: ToolContext, input: LeadSearchAskInput): Promise<ProposalOutcome> {
  // The lead finder is the owner's and the partner's who sets the workspace up (0012): the card needs a partner, by the
  // one predicate the registry offers it by (context.ts offeredTo).
  if (!offeredTo(leadSearchAct, t.role)) return refuse(proposalBelowNeeds("lead_search"));
  const shaped = LeadSearchPlanInput.safeParse(input);
  if (!shaped.success)
    return refuse(
      `the plan is not complete: ${shaped.error.issues[0]?.path.join(".")} ${shaped.error.issues[0]?.message}`,
    );
  const amends = str(input.amends, 40);
  // Named people at companies (the people card, 00430): its own plan and its own card. A people search never stops to
  // ask, so nothing answers one.
  if (shaped.data.looking_for === "people_at_companies") return proposePeopleSearch(t, shaped.data, amends);
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
  const places = shaped.data;
  const r = planLeadSearch(typeof storedCount === "number" ? { ...places, count: storedCount } : places);
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
    title: r.view.title,
    summary: answer ? `Answers “${answer.question}”: ${planSentence(plan)}` : planSentence(plan),
    payload: {
      plan,
      view: r.view,
      facts: await planFacts(t.ctx, t.tenantId, { categoryKey: places.category_key, now: t.now }),
      ...(answer ? { amends: answer } : {}),
    },
  });
}

/** propose_lead_search's description, said whole: it takes no action. */
const LEAD_SEARCH_DESCRIPTION = `Action find proposes a search for businesses in the US the owner could reach, as a plan card they approve; nothing is searched or spent before that. For named people at companies (marketing managers at agencies), looking_for is people_at_companies: terms their titles (one to five), region their US states or US, who a name for it, count how many companies, and when said seniority (owner, founder, c_suite, partner, vp, head, director, manager, senior, entry), industries (the directory's own names, as Marketing & Advertising, Accounting, Construction, Real Estate; a name it lacks comes back with the nearest) and company_sizes (1 - 10, 11 - 50, 51 - 200, 201 - 500, 501 - 1000, 1001 - 5000, 5001 - 10000, 10001+); nothing else is read. The plan: what kind (who, plural, and who_one, one of them, with category_key as one lowercase word), how many (count: 50, 100, 200 or 500 unless they said a number), where (city with its two-letter region, a zip, or a region alone), the contact standard (contact: phone, or email checked), up to three terms (widest first), the criteria each with whether it is seen or likely and whether it is required, who to leave_out (chains, other kinds; short chips in plain words), looking_for (local_businesses, or people, online_sellers or other when that is what was asked: those are answered in words, not searched), and asked, the owner's words. seen is only for what a listing shows (a rating or review count, a website, an email, a phone that matches the site, open or closed) and is judged from those facts alone; what a business is or does (its kind, who owns it, what it serves or sells, who it treats) is likely, never seen, because a listing's name and category do not count as seeing it, and the kind of business itself is checked on every search without being written as a criterion. Read leads with action searches first, so a plan is not repeated: one plan, never a search. amends is the id of a search that stopped to ask (leads with action searches shows its question) when the plan is that search with the owner's answer applied and everything else kept as it was; the card then answers that search instead of starting a new one. Say the plan in one sentence; never promise how many will be found, and never say a search has started until the card is approved. ${approvalWords("lead_search")}.`;

/** A search's plan as a card, propose_lead_search's one definition: named here so its builder asks its own role. */
const leadSearchAct: ActDef<typeof LeadSearchAsk> = {
  kind: "lead_search",
  makes: ["people_search"],
  input: LeadSearchAsk,
  // A new plan, and the same plan answering the search that asked (amends): the owner's answer applied, the rest kept.
  examples: [
    {
      looking_for: "local_businesses",
      country: "US",
      count: 100,
      who: "plumbers",
      who_one: "plumber",
      category_key: "plumber",
      terms: ["plumber", "plumbing company"],
      city: "Austin",
      region: "TX",
      contact: "email",
      criteria: [
        { text: "has a website", standard: "seen", required: true },
        { text: "family-owned", standard: "likely", required: false },
      ],
      leave_out: [{ words: "chains" }],
      asked: "find me 100 plumbers in Austin",
    },
    {
      looking_for: "local_businesses",
      country: "US",
      count: 100,
      who: "plumbers",
      who_one: "plumber",
      category_key: "plumber",
      terms: ["plumber", "plumbing company"],
      city: "Austin",
      region: "TX",
      contact: "email",
      criteria: [
        { text: "has a website", standard: "seen", required: true },
        { text: "family-owned", standard: "likely", required: false },
      ],
      leave_out: [],
      asked: "yes, include the franchises",
      amends: "9c2e4b6d-1f3a-4e5c-8b7d-0a1c2e3f4b5d",
    },
  ],
  label: "Planning a search",
  build: proposeLeadSearch,
};

/**
 * A search's new round (POST lead-searches/:id/more): more of the same businesses (a top-up), or the same search found
 * again from the start (renew), at the count asked, on the plan the search was made with. A list of the workspace's own
 * is never searched again (the door's own refusal, in its words). It spends, so it is the owner's or a partner's.
 */
async function proposeMore(
  t: ToolContext,
  input: { search_id: string; count: number; renew?: boolean },
): Promise<ProposalOutcome> {
  if (!offeredTo(moreAct, t.role)) return refuse(proposalBelowNeeds("lead_search_more"));
  let row: SearchViewRow;
  try {
    row = await searchRow(t.ctx, t.tenantId, requireUuid(str(input.search_id, 40), "search"));
    refuseList(row);
  } catch (e) {
    if (e instanceof AppError) return refuse(e.message);
    throw e;
  }
  const count = Math.round(Number(input.count));
  const plan = LeadSearchPlanSchema.safeParse({ ...(row.plan as object), count });
  if (!plan.success)
    return refuse(
      `that search cannot take a new round as it is: ${plan.error.issues[0]?.path.join(".")} ${plan.error.issues[0]?.message}`,
    );
  const facts = await planFacts(t.ctx, t.tenantId, { now: t.now });
  const name = row.name ?? "The search";
  noteRow(t, "search", row.id, name, `clients/leads:s-${row.id}`);
  return propose({
    kind: "lead_search_more",
    title: `${name}: ${input.renew ? "search again" : `${count} more`}`,
    summary: `${input.renew ? "The same search, found again from the start" : `Up to ${count} more of the same`}. Uses up to ${count} of your ${facts.leadsLeft} leads left this month.`,
    payload: { search_id: row.id, name, purpose: input.renew ? "renew" : "topup", plan: plan.data },
  });
}

const moreAct = actAction({
  kind: "lead_search_more",
  input: z.object({
    search_id: z.string().describe("The search, from leads with action searches."),
    count: z.number().int().describe("How many more to find: 50, 100, 200 or 500 unless they said a number."),
    renew: z.boolean().optional().describe("true to find the same search again from the start, not more of it."),
  }),
  examples: [{ search_id: "9c2e4b6d-1f3a-4e5c-8b7d-0a1c2e3f4b5d", count: 100 }],
  label: "Planning more leads",
  words: `Action more finds more for a search that ended (a top-up), or the same search again (renew), on the plan it was made with. ${approvalWords("lead_search_more")}.`,
  build: proposeMore,
});

/**
 * Finding leads (D11, the operator, 15 Oct 2026): a new search planned as a card, or the answer to one that stopped to
 * ask (find, the one definition before), and a search's new round (more).
 */
export const propose_lead_search = defineActions({
  name: "propose_lead_search",
  description:
    "Propose finding leads, as a plan card the owner or a partner approves; nothing is searched or spent before that: a new search for businesses or for named people at companies in the US, the owner's answer to a search that stopped to ask, or more for a search that ended.",
  actions: {
    find: actAction({ ...leadSearchAct, words: LEAD_SEARCH_DESCRIPTION }),
    more: moreAct,
  },
});

/* ------------------------------------------------------------- adding leads to a reach-out (00426) -- */

/**
 * Leads added to a reach-out fed by a list: the card says, before anything is written, what the add would do (the add
 * door asked dry, by the same rule: how many would join, and why each other would not), and Approve makes the add. It
 * never sends and never approves a run: the reach-out's next run plans the first email and waits for its owner's say.
 */
async function proposeReachOutAdd(
  t: ToolContext,
  input: { root_id: string; lead_ids: string[] },
): Promise<ProposalOutcome> {
  const rootId = str(input.root_id, 40);
  const ids = [...new Set((input.lead_ids ?? []).map((x) => str(x, 40)))].filter((x) => UUID.test(x));
  if (!UUID.test(rootId)) return refuse("root_id must be a reach-out's id a read returned");
  if (!ids.length) return refuse("lead_ids must name at least one lead a read returned");
  const root = await reachOutRootOf(t.ctx.supabase, rootId);
  if (!root || root.tenant_id !== t.tenantId) return refuse("no such reach-out in this workspace");
  let dry: ReachOutAddDto;
  try {
    dry = await addToReachOut(t.ctx, rootId, { lead_ids: ids }, true);
  } catch (e) {
    // A finder-fed reach-out (its search keeps it current), a removed list, a role the door refuses: in its own words.
    return refuse(e instanceof Error ? e.message : String(e));
  }
  const said = reachOutAddWords(dry, root.name);
  if (!dry.would_add) return refuse(`${said.text}. Say so; nothing was proposed`);
  noteRow(t, "playbook", rootId, root.name, addressOf({ kind: "reach_out", id: rootId }));
  return propose({
    kind: "reach_out_add",
    title: `Add to “${root.name}”`,
    summary: `${said.text}. Nothing is written to them until its next run, which waits for your say.`,
    payload: { root_id: rootId, name: root.name, lead_ids: ids },
  });
}

/** Leads added to a reach-out fed by a list: an action of propose_sequence (the cap is twenty tools a role). */
export const reachOutAddAction = actAction({
  kind: "reach_out_add",
  input: z.object({ root_id: z.string(), lead_ids: z.array(z.string()).min(1).max(LEAD_LIST_MAX) }),
  examples: [
    {
      root_id: "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f",
      lead_ids: ["5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b", "6f7a8b9c-0d1e-4f2a-9b3c-4d5e6f7a8b9c"],
    },
  ],
  label: "Checking who can be added",
  words:
    "Action leads adds leads to a reach-out fed by a list (one made from leads chosen or imported, not a search's own): root_id is the reach-out's id (reach_out on leads with action lead, or the reach-out the page has open), lead_ids the leads' ids from leads. The card says first what the add would do -- how many would join and why each other would not (already written to, a customer, no checked address, with another reach-out) -- by the add's own rule, and is refused in words when none would. It sends nothing and approves no run: the reach-out's next run plans the first email and waits for their say. A reach-out a search keeps current is refused: its search's new leads join it by themselves.",
  build: proposeReachOutAdd,
});
