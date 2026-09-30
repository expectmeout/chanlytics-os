/**
 * The judge as the runner uses it (PRD §7.1, E4): what is shown, and one batch asked of the port the edge binds.
 *
 *   - factsOf / fact: a place's listing facts as the judge sees them, each one line without control characters and at
 *     most FACT_MAX characters, never a page's own words.
 *   - judgeBatch: one call for a batch of at most 25 places (contracts LEAD_JUDGE_BATCH), asked once and once more when
 *     the answer is a refusal, a capped answer or out of its shape; refused twice, the batch is Needs review with the
 *     reason JUDGE_REFUSED_REASON. A 429, a 5xx or no answer is thrown, and the jobs ledger's waits retry the job. The
 *     answer comes back by place ref with the judgment to keep, under the operation id (opIdFor) so a replayed page pays
 *     nothing twice.
 *   - JUDGE_TIMEOUT_MS and PAGE_READ_ALLOWANCE_MS: the registry's bound for one call (contracts MODEL_ROUTES.lead_judge),
 *     and why the runner's margin (rules.ts JUDGE_MARGIN_MS) leaves room for it in a tick.
 *
 * The call itself is channels' leadJudge over the edge's model port (apps/edge/lib/leads/lead-wires.ts), which writes each
 * call to the usage ledger for the search's workspace (`tenantId`) and, while the switch is on, puts each place's criteria
 * to a second model in shadow (decision 0023). Nothing of that is seen here: the verb takes a LeadJudge and returns answers.
 */
import {
  judgeOpId,
  MODEL_ROUTES,
  type JudgePlaceAnswer,
  type LeadSearchPlan,
  type PlaceFacts,
} from "@chanlytics/contracts";
import type { LeadJudge } from "@chanlytics/channels";
import type { CleanPlace } from "./clean";
import type { CollectJudgment } from "./ports";

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
 * A low-effort structured call over 25 places answers in well under this.
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

/** One batch, asked once and once more; a throw is the provider's trouble and propagates. */
export async function judgeBatch(
  judge: LeadJudge,
  plan: LeadSearchPlan,
  places: PlaceFacts[],
  opId: string,
  /** The search's workspace: the usage ledger's row for each call. */
  tenantId?: string,
): Promise<JudgedBatch> {
  if (!places.length) return { answers: new Map(), judgment: null, model: null, refused: false, why: null };
  let last: { refused: true; why: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const a = await judge.judge(plan, places, tenantId);
    if ("refused" in a) {
      last = a;
      continue;
    }
    return {
      answers: new Map(a.answers.map((x) => [x.ref, x])),
      judgment: { op_id: opId, batch: 0, request_hash: a.requestHash, answer: a.raw, model: a.model, tokens: a.tokens },
      model: a.model,
      refused: false,
      why: null,
    };
  }
  return { answers: new Map(), judgment: null, model: null, refused: true, why: last?.why ?? null };
}
