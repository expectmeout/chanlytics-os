/**
 * One structured answer from the model, for the three small drafts a person asks for (a lead's message, a search's
 * suggestions, a list's rows), asked of the edge's gateway (ask/gateway.ts streamModel) and read by zod here.
 *
 *   - The model is the registry's for these (contracts MODEL_ROUTES.lead_json: JSON_MODEL), never Ask's profile, and the
 *     answer is asked for in its schema at effort "low"; the caller sets a small max_tokens, and the edge clamps it.
 *   - The key stays on the edge, which holds the day's count: the tokens spend Ask's one daily budget (ASK_USAGE_KIND),
 *     under the caller's own limits (the rate buckets, the suggestions' cache), and are written to the usage ledger for
 *     the workspace under the purpose the edge maps (lead_json). No second budget is kept here.
 *   - A stream that does not begin is said in words as an AppError, and nothing is guessed: the day's budget spent is
 *     rate_limited, a paused or ended workspace payment_required, and a preview, a missing key, a model that could not be
 *     reached or the API's refusal of the request are one 503 "not available"; a stream that breaks, an answer that
 *     does not parse and one out of shape are upstream_anthropic "unreadable"; the model's own refusal is a 422.
 *
 * The stream is a seam: setModelStream hands a test its own.
 */
import "server-only";
import type { ZodType } from "zod";
import { AppError, MIN_MS, MODEL_ROUTES } from "@chanlytics/contracts";
import { GatewayRefused, streamModel, type GatewayCall } from "./ask/gateway";

/**
 * The lead purposes' own model, the registry's (contracts MODEL_ROUTES.lead_json), so the edge's default (contracts
 * ASK_MODEL, which Ask's profile moves) never moves them: their answers are small JSON at 400–600 max_tokens, tuned on
 * Sonnet 5, and Opus 5.5's thinking cannot be switched off. One route per purpose, as DRAFT_MODEL is the template
 * drafter's (templates.ts).
 */
export const JSON_MODEL = MODEL_ROUTES.lead_json.model;

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
      if (e.refusal.kind === "paused")
        throw new AppError("payment_required", `The ${what} waits while this workspace is paused.`);
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
