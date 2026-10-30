/**
 * One structured answer from the model, for the small drafts a person asks for (a lead's message, a search's
 * suggestions, a list's rows) and for a skill's craft call (ask/skills), asked of the edge's gateway (ask/gateway.ts
 * streamModel) and read by zod here.
 *
 *   - The model is the registry's for these (contracts MODEL_ROUTES.lead_json: JSON_MODEL), never Ask's profile, and the
 *     answer is asked for in its schema at effort "low"; the caller sets a small max_tokens, and the edge clamps it. A
 *     skill's craft call is the exception: it writes words a customer reads, so it asks SKILL_MODEL at its own effort.
 *   - The key stays on the edge, which holds the day's count: the tokens spend Ask's one daily budget (ASK_USAGE_KIND),
 *     under the caller's own limits (the rate buckets, the suggestions' cache), and are written to the usage ledger for
 *     the workspace under the purpose the edge maps (lead_json). No second budget is kept here.
 *   - An answer is bounded at a minute, the edge's own door, unless the caller passes a signal of its own.
 *   - A stream that does not begin is said in words as an AppError, and nothing is guessed: the day's budget spent is
 *     rate_limited, a paused or ended workspace payment_required, and a preview, a missing key, a model that could not be
 *     reached or the API's refusal of the request are one 503 "not available"; a stream that breaks, an answer that
 *     does not parse and one out of shape are upstream_anthropic "unreadable"; the model's own refusal is a 422.
 *
 * The stream is a seam: setModelStream hands a test its own.
 */
import "server-only";
import type { ZodType } from "zod";
import {
  AppError,
  MIN_MS,
  MODEL_ROUTES,
  SKILL_CRAFT_PURPOSES,
  type ModelEffort,
  type SkillCraftPurpose,
} from "@chanlytics/contracts";
import { GatewayRefused, streamModel, type GatewayCall } from "./ask/gateway";

/**
 * The lead purposes' own model, the registry's (contracts MODEL_ROUTES.lead_json), so the edge's default (contracts
 * ASK_MODEL, which Ask's profile moves) never moves them: their answers are small JSON at 400–600 max_tokens, asked of
 * Sonnet 5.5 with its thinking off (the route's: the edge's port sends it), and Opus 5.5's thinking cannot be switched
 * off. One route per purpose, as DRAFT_MODEL is the template drafter's (templates.ts).
 */
export const JSON_MODEL = MODEL_ROUTES.lead_json.model;
/**
 * A skill's craft call's model: the one Ask's route asks (Opus 5.5), the best writer the platform runs and one the
 * gateway lets every purpose name, whatever a deployment's ASK_MODEL moves Ask's own turn to.
 */
const SKILL_MODEL = MODEL_ROUTES.ask.model;
const isCraft = (purpose: ModelJsonCall["purpose"]): purpose is SkillCraftPurpose =>
  (SKILL_CRAFT_PURPOSES as readonly string[]).includes(purpose);

/**
 * The model a purpose asks: the ideas for a new search their own route's (lead_suggest, 00398), a skill's craft call
 * SKILL_MODEL, every other draft JSON_MODEL. An edge that does not know the ideas' model yet refuses it as a bad request;
 * they are asked once more on JSON_MODEL, so either app may deploy first.
 */
const modelOf = (purpose: ModelJsonCall["purpose"]) =>
  purpose === "lead_suggest" ? MODEL_ROUTES.lead_suggest.model : isCraft(purpose) ? SKILL_MODEL : JSON_MODEL;
const unknownModel = (e: unknown, model: string) =>
  model !== JSON_MODEL &&
  e instanceof GatewayRefused &&
  e.refusal.kind === "bad_request" &&
  /unknown model/.test(e.refusal.message);

/** How long one answer may take unless the caller bounds it: the edge's own door stops at a minute (vercel.json). */
const MODEL_JSON_TIMEOUT_MS = MIN_MS;

let stream: typeof streamModel = streamModel;
/** Tests hand in a stream of their own. */
export function setModelStream(s: typeof streamModel | null): void {
  stream = s ?? streamModel;
}

type ModelJsonCall = Omit<GatewayCall, "request" | "purpose"> & {
  purpose: "lead_draft" | "lead_suggest" | "list_draft" | "person_draft" | "sequence_draft" | SkillCraftPurpose;
  /** How hard the model thinks: "low" for the small drafts (unset), a skill's own for its craft call. */
  effort?: ModelEffort;
  request: Omit<GatewayCall["request"], "output_config" | "model"> & { schema: Record<string, unknown> };
};

/** One answer's text and why it stopped, from the model named. */
async function answerFrom(
  call: ModelJsonCall,
  model: string,
  what: string,
): Promise<{ text: string; stop: string | null }> {
  const { schema: json, ...request } = call.request;
  let text = "";
  let stop: string | null = null;
  for await (const ev of stream({
    ...call,
    signal: call.signal ?? AbortSignal.timeout(MODEL_JSON_TIMEOUT_MS),
    request: {
      ...request,
      model,
      output_config: { effort: call.effort ?? "low", format: { type: "json_schema", schema: json } },
    },
  })) {
    if (ev.type === "text") text += ev.text;
    else if (ev.type === "stop") stop = ev.stopReason;
    else if (ev.type === "error")
      throw new AppError("upstream_anthropic", `The ${what} could not be written just now. Try again in a moment.`);
  }
  return { text, stop };
}

export async function askForJson<T>(call: ModelJsonCall, schema: ZodType<T>, what: string): Promise<T> {
  const model = modelOf(call.purpose);
  let answer: { text: string; stop: string | null };
  try {
    answer = await answerFrom(call, model, what).catch((e: unknown) => {
      if (unknownModel(e, model)) return answerFrom(call, JSON_MODEL, what);
      throw e;
    });
  } catch (e) {
    if (e instanceof GatewayRefused) {
      if (e.refusal.kind === "budget")
        throw new AppError("rate_limited", `Today's assistant budget is spent, so the ${what} waits until tomorrow.`);
      if (e.refusal.kind === "paused")
        throw new AppError("payment_required", `The ${what} waits while this workspace is paused.`);
      throw new AppError("upstream_anthropic", `The ${what} is not available here right now.`, 503);
    }
    throw e;
  }
  const { text, stop } = answer;
  if (stop === "refusal") throw new AppError("validation", `Claude would not write this ${what}.`, 422);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AppError("upstream_anthropic", `The ${what} came back unreadable. Try again.`);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError("upstream_anthropic", `The ${what} came back unreadable. Try again.`);
  return parsed.data;
}
