import "server-only";
import type { ZodType } from "zod";
import { AppError, ASK_TURN_BUDGET_MS, MODEL_ROUTES, craftSystem, type AskSkill } from "@chanlytics/contracts";
import { askForJson } from "../../model-json";

/**
 * A skill's craft call (contracts ask-skills): the job done by a call made only for it, with the skill's own words as its
 * system prompt, at the skill's effort, under the skill's gateway purpose, in the skill's JSON, through the one structured
 * answer every draft asks for (server/model-json.ts). What it answers is the skill's to check; a call that does not answer
 * is said as why, never thrown, so the card it serves keeps what it had.
 */

/**
 * What a turn keeps after a tool for a last round, as the loop does (loop.ts: "Time is up for reads" eight seconds
 * before ASK_TURN_BUDGET_MS): a craft call ends before it, so the turn still answers in its time.
 */
const TURN_RESERVE_MS = 8_000;
/** The least a craft call is started with: a call cut before it could answer spends and helps nobody. */
export const CRAFT_MIN_MS = 12_000;
/** One try's bound on the edge for a craft purpose (contracts MODEL_ROUTES.template_draft, whose route it is asked as). */
const CRAFT_MAX_MS = MODEL_ROUTES.template_draft.timeoutMs;

/**
 * When a craft call made in a turn must have answered: the turn's own end (from its clock, the tool context's `now`, which
 * the loop sets at the turn's start) less what a last round needs. The loop's own deadline is not handed to a tool yet;
 * once it is (the design note's section 5), this reads it instead.
 */
export const turnDeadline = (turnStart: Date): number => turnStart.getTime() + ASK_TURN_BUDGET_MS - TURN_RESERVE_MS;

/** Why a craft call's words were not used: each a reason the card keeps its first draft. */
export type CraftKept = "late" | "budget" | "paused" | "unavailable" | "refused" | "unreadable" | "unread" | "checks";

type Crafted<T> = { ok: true; answer: T; ms: number } | { ok: false; why: CraftKept; ms: number; detail?: string };

/** An answer that did not come, as a reason: the day's budget, a paused workspace, the model's refusal, or not now. */
function keptFor(e: AppError): CraftKept {
  if (e.code === "rate_limited") return "budget";
  if (e.code === "payment_required") return "paused";
  if (e.code === "validation") return "refused";
  // A preview, a missing key, an edge that does not know the purpose yet, a model not reached: none of it the words'.
  return e.status === 503 ? "unavailable" : "unreadable";
}

interface CraftCall<T> {
  tenantId: string;
  userId: string;
  /** The job, as the skill's brief says it. */
  question: string;
  schema: Record<string, unknown>;
  answer: ZodType<T>;
  /** When it must have answered (turnDeadline): it is started only with CRAFT_MIN_MS left, and bounded by it. */
  deadline: number;
  /** What it writes, as an error says it ("message"). */
  what: string;
}

/**
 * One craft call: the skill's answer, or why there is none. Never thrown: whatever goes wrong here leaves the card it
 * serves as it was, a fault no one meant included (said as unreadable, with its words for the log).
 */
export async function craftWith<T>(skill: AskSkill, call: CraftCall<T>): Promise<Crafted<T>> {
  const t0 = Date.now();
  const left = Math.min(call.deadline - t0, CRAFT_MAX_MS);
  if (left < CRAFT_MIN_MS) return { ok: false, why: "late", ms: 0 };
  const signal = AbortSignal.timeout(left);
  try {
    const answer = await askForJson(
      {
        tenantId: call.tenantId,
        userId: call.userId,
        purpose: skill.craft.purpose,
        effort: skill.craft.effort,
        signal,
        request: {
          max_tokens: skill.craft.maxTokens,
          system: craftSystem(skill),
          schema: call.schema,
          messages: [{ role: "user", content: call.question }],
        },
      },
      call.answer,
      call.what,
    );
    return { ok: true, answer, ms: Date.now() - t0 };
  } catch (e) {
    const ms = Date.now() - t0;
    if (signal.aborted) return { ok: false, why: "late", ms };
    if (e instanceof AppError) return { ok: false, why: keptFor(e), ms, detail: e.message };
    return { ok: false, why: "unreadable", ms, detail: e instanceof Error ? e.message : String(e) };
  }
}
