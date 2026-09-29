/**
 * One structured answer through the edge's gateway: the model key stays on the
 * edge, the tokens count in Ask's daily budget (ASK_USAGE_KIND), and the answer
 * is read by zod here. A refusal of any kind (the budget, a preview deployment,
 * an answer out of shape) is an AppError in words; nothing is guessed.
 *
 * The purposes that come through here spend Ask's ONE daily budget, so
 * they are capped three ways and add no second budget: the rate buckets
 * (`lead_draft` 60 an hour, `lead_suggest` 10 an hour -- a person, not a
 * workspace), the suggestions' seven-day cache, and small requests
 * (600 tokens for a draft, 400 for the suggestions, effort "low"). The usage
 * row records the purpose (Task 5), so a share can be read by purpose the day
 * one is wanted.
 */
import "server-only";
import type { ZodType } from "zod";
import { AppError, MIN_MS } from "@chanlytics/contracts";
import { GatewayRefused, streamModel, type GatewayCall } from "./ask/gateway";

/**
 * The lead purposes' own model, named here so the edge's default (contracts
 * ASK_MODEL, which Ask's profile moves) never moves them: their answers are
 * small JSON at 400–600 max_tokens, tuned on Sonnet 5, and Opus 5.5's thinking
 * cannot be switched off. One name per purpose, as DRAFT_MODEL is the template
 * drafter's (templates.ts).
 */
export const JSON_MODEL = "claude-sonnet-5";

/** How long one answer may take unless the caller bounds it: the edge's own door stops at a minute (vercel.json). */
const MODEL_JSON_TIMEOUT_MS = MIN_MS;

let stream: typeof streamModel = streamModel;
/** Tests hand in a stream of their own. */
export function setModelStream(s: typeof streamModel | null): void {
  stream = s ?? streamModel;
}

type ModelJsonCall = Omit<GatewayCall, "request" | "purpose"> & {
  purpose: "lead_draft" | "lead_suggest" | "list_draft";
  request: Omit<GatewayCall["request"], "output_config" | "model"> & { schema: Record<string, unknown> };
};

export async function askForJson<T>(call: ModelJsonCall, schema: ZodType<T>, what: string): Promise<T> {
  const { schema: json, ...request } = call.request;
  let text = "";
  let stop: string | null = null;
  try {
    for await (const ev of stream({
      ...call,
      signal: call.signal ?? AbortSignal.timeout(MODEL_JSON_TIMEOUT_MS),
      request: {
        ...request,
        model: JSON_MODEL,
        output_config: { effort: "low", format: { type: "json_schema", schema: json } },
      },
    })) {
      if (ev.type === "text") text += ev.text;
      else if (ev.type === "stop") stop = ev.stopReason;
      else if (ev.type === "error")
        throw new AppError("upstream_anthropic", `The ${what} could not be written just now. Try again in a moment.`);
    }
  } catch (e) {
    if (e instanceof GatewayRefused) {
      if (e.refusal.kind === "budget")
        throw new AppError("rate_limited", `Today's assistant budget is spent, so the ${what} waits until tomorrow.`);
      throw new AppError("upstream_anthropic", `The ${what} is not available here right now.`, 503);
    }
    throw e;
  }
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
