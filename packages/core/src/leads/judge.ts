/**
 * The judge, as the runner uses it (PRD §7.1, E4): one structured call per
 * batch of at most 25 places, the facts capped and quoted, the answer kept by
 * operation id so a replayed page pays nothing twice. A refusal is asked once
 * more; refused twice, the batch is Needs review with the reason "the judge
 * could not read these". A 429, a 5xx or no answer throws, and the ledger's
 * waits retry the job.
 */
import { judgeOpId, type JudgePlaceAnswer, type LeadSearchPlan, type PlaceFacts } from "@chanlytics/contracts";
import type { LeadJudge } from "@chanlytics/channels";
import type { CleanPlace } from "./clean";
import type { CollectJudgment } from "./ports";

export const JUDGE_REFUSED_REASON = "the judge could not read these";
export const FACT_MAX = 120;
/**
 * How long one judge call may take, said once here: apps/edge/lib/lead-wires.ts
 * binds it on the client (with no retry of the SDK's own, so this is the real
 * bound), and the runner's JUDGE_MARGIN_MS covers it, so a call is never
 * started with less time left than it may take.
 */
export const JUDGE_TIMEOUT_MS = 40_000;

/** A fact as the judge sees it: one line, no control characters, at most 120 characters. */
export function fact(v: string | null): string | null {
  if (v === null) return null;
  const s = v.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, FACT_MAX);
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
export async function judgeBatch(judge: LeadJudge, plan: LeadSearchPlan, places: PlaceFacts[], opId: string): Promise<JudgedBatch> {
  if (!places.length) return { answers: new Map(), judgment: null, model: null, refused: false, why: null };
  let last: { refused: true; why: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const a = await judge.judge(plan, places);
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
