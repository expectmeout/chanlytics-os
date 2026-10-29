/**
 * The judge as the runner uses it (PRD §7.1, E4): what is shown, and one batch asked of the port the edge binds.
 *
 *   - factsOf / fact: a place's listing facts as the judge sees them, each one line without control characters and at
 *     most FACT_MAX characters, never a page's own words.
 *   - judgeBatch: one call, asked once and once more when the answer is a refusal, a capped answer or out of its
 *     shape; refused twice, its places are Needs review with the reason JUDGE_REFUSED_REASON. A 429, a 5xx or no answer
 *     is thrown, and the jobs ledger's waits retry the job. The answer comes back by place ref with the judgment to
 *     keep, under the operation id (opIdFor) so a replayed page pays nothing twice.
 *   - judgeInCalls: a batch (contracts judgeBatchPlaces) asked in the calls the judge can answer in time (contracts
 *     judgeCallPlaces, sized from what the plan asks of each place), side by side, each under its own operation id.
 *   - JUDGE_TIMEOUT_MS and PAGE_READ_ALLOWANCE_MS: the registry's bound for one call (contracts MODEL_ROUTES.lead_judge),
 *     and why the runner's margin (rules.ts JUDGE_MARGIN_MS) leaves room for it in a tick.
 *
 * The call itself is channels' leadJudge over the edge's model port (apps/edge/lib/leads/lead-wires.ts), which writes each
 * call to the usage ledger for the search's workspace (the round's `tenant_id`), names the round it is paid in as the row's
 * subject (`subject_id`: the judge's cost per search is the ledger's lead_judge rows joined to their round), and, while the
 * switch is on, puts each place's criteria to a second model in shadow (decision 0023), its rows naming the same round.
 * Nothing of that is seen here: the verb takes a LeadJudge and the round, and returns answers.
 */
import {
  judgeCallPlaces,
  judgeOpId,
  MODEL_ROUTES,
  type CompanyFacts,
  type CompanyFitAnswer,
  type JudgePlaceAnswer,
  type LeadPeoplePlan,
  type LeadSearchPlan,
  type PlaceFacts,
} from "@chanlytics/contracts";
import type { LeadJudge } from "@chanlytics/channels";
import type { CleanPlace } from "./clean";
import type { CollectCompany, CollectJudgment } from "./ports";

export const JUDGE_REFUSED_REASON = "the judge could not read these";
export const FACT_MAX = 120;
/**
 * How long one judge call may take: the registry's route for the judge (contracts MODEL_ROUTES.lead_judge), which the
 * model port bounds each call by (no retry, no fallback: an overload is the ledger's retry), and the runner's
 * JUDGE_MARGIN_MS covers it, so a call is never started with less time left than it may take.
 */
export const JUDGE_TIMEOUT_MS: number = MODEL_ROUTES.lead_judge.timeoutMs;

/**
 * Why 28 and not more. A collect is claimed up to CLAIM_FOR_MS (20s) into a
 * tick and handed a deadline LEAD_YIELD_AT_MS (52s) from the tick's start
 * (packages/jobs ledger.ts), so the least it is promised is 32 seconds; it
 * reads its page from the provider first (PAGE_READ_ALLOWANCE_MS), and the
 * judge, which is never started with less than its own timeout left
 * (runner/rules.ts JUDGE_MARGIN_MS), must fit in what remains. Core does not import
 * the ledger, so tick-geometry.test.mjs holds these numbers to each other.
 * A call is sized to answer well under this (contracts judgeCallPlaces): 25 places at seven questions each did not.
 */
export const PAGE_READ_ALLOWANCE_MS = 4_000;

/** A fact as the judge sees it: one line, no control characters, at most 120 characters. */
export function fact(v: string | null): string | null {
  if (v === null) return null;
  const s = v
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FACT_MAX);
  return s || null;
}

/** Listing facts only, never a page's words (PRD §7.1). */
export function factsOf(ref: number, p: CleanPlace): PlaceFacts {
  return {
    ref,
    name: fact(p.raw.title) ?? "",
    category: fact(p.raw.category),
    city: fact(p.raw.city),
    state: p.region ?? fact(p.raw.state),
    host: fact(p.host),
    rating: p.raw.rating,
    reviews: p.raw.reviews,
    emails: p.emails.map((e) => fact(e) ?? "").filter(Boolean),
    phone_matches_site: p.phoneSources === 0 ? null : p.phoneSources === 2,
  };
}

export interface JudgedBatch {
  answers: Map<number, JudgePlaceAnswer>;
  judgment: CollectJudgment | null;
  model: string | null;
  refused: boolean;
  /** Why the judge refused, in its own word ("max_tokens", "stop"): the members say the plan's sentence, and this is what the collect's line logs. */
  why: string | null;
}

export function opIdFor(runId: string, fromOffset: number, batch: number): string {
  return judgeOpId(runId, fromOffset, batch);
}

/**
 * A company as its judge is shown it (contracts company-judge.ts): what the directory said of it, each a fact as a place's
 * is, its own description longer (the contract caps it), and nothing of its people.
 */
export function companyFactsOf(ref: number, c: CollectCompany): CompanyFacts {
  return {
    ref,
    name: fact(c.name) ?? "",
    industry: fact(c.category),
    size: fact(c.facts.size),
    city: fact(c.city),
    state: fact(c.region),
    host: fact(c.source_key),
    about: c.about?.trim() ? c.about : null,
  };
}

/** A people page's companies judged: each company's answer by its ref, and the batch's judgment to keep. */
export interface JudgedCompanies {
  answers: Map<number, CompanyFitAnswer>;
  judgment: CollectJudgment | null;
  refused: boolean;
  why: string | null;
}

/**
 * One batch of companies, asked once and once more, as a places batch is (judgeBatch); refused twice, its companies wait
 * in Needs review (contracts companyFitOf). A throw is the provider's trouble and propagates.
 */
export async function judgeCompanyBatch(
  judge: LeadJudge,
  plan: LeadPeoplePlan,
  companies: CompanyFacts[],
  opId: string,
  batch: number,
  round: { id: string; tenant_id: string },
): Promise<JudgedCompanies> {
  if (!companies.length) return { answers: new Map(), judgment: null, refused: false, why: null };
  let why: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const a = await judge.judgeCompanies(plan, companies, round.tenant_id, round.id);
    if ("refused" in a) {
      why = a.why;
      continue;
    }
    return {
      answers: new Map(a.answers.map((x) => [x.ref, x])),
      judgment: { op_id: opId, batch, request_hash: a.requestHash, answer: a.raw, model: a.model, tokens: a.tokens },
      refused: false,
      why: null,
    };
  }
  return { answers: new Map(), judgment: null, refused: true, why };
}

/** One call, asked once and once more; a throw is the provider's trouble and propagates. */
export async function judgeBatch(
  judge: LeadJudge,
  plan: LeadSearchPlan,
  places: PlaceFacts[],
  opId: string,
  /** The round the batch is paid in: its workspace is the usage ledger's row for each call, and its id the row's subject. */
  round?: { id: string; tenant_id: string },
  /** Which of its batch's calls this is (judgeInCalls), kept with its judgment. */
  batch = 0,
): Promise<JudgedBatch> {
  if (!places.length) return { answers: new Map(), judgment: null, model: null, refused: false, why: null };
  let last: { refused: true; why: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const a = await judge.judge(plan, places, round?.tenant_id, round?.id);
    if ("refused" in a) {
      last = a;
      continue;
    }
    return {
      answers: new Map(a.answers.map((x) => [x.ref, x])),
      judgment: { op_id: opId, batch, request_hash: a.requestHash, answer: a.raw, model: a.model, tokens: a.tokens },
      model: a.model,
      refused: false,
      why: null,
    };
  }
  return { answers: new Map(), judgment: null, model: null, refused: true, why: last?.why ?? null };
}

/**
 * A batch asked in the calls the judge can answer inside its bound (contracts judgeCallPlaces), side by side, each
 * under its own operation id and numbered in its batch: each call's items with what it answered, by refs of its own.
 * Asked as one call, a page of 22 places a plan asks seven questions of never came back in time (29 Oct 2026).
 */
export async function judgeInCalls<T>(
  judge: LeadJudge,
  plan: LeadSearchPlan,
  items: readonly T[],
  facts: (item: T, ref: number) => PlaceFacts,
  opIdOf: (call: number, items: readonly T[]) => string,
  round?: { id: string; tenant_id: string },
): Promise<{ items: T[]; judged: JudgedBatch }[]> {
  const size = judgeCallPlaces(plan);
  const calls: T[][] = [];
  for (let i = 0; i < items.length; i += size) calls.push(items.slice(i, i + size));
  return Promise.all(
    calls.map(async (c, i) => ({
      items: c,
      judged: await judgeBatch(
        judge,
        plan,
        c.map((x, ref) => facts(x, ref)),
        opIdOf(i, c),
        round,
        i,
      ),
    })),
  );
}
