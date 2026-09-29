/**
 * The lead finder's wires, bound where the keys are: the provider's token
 * (APIFY_TOKEN, never seen by a model or a browser), the judge's client and
 * model, the address the provider calls back, and the secret every run row's
 * webhook token derives from. Absent when a key is: a lead job then fails
 * loudly (packages/jobs handlers), which is what a deployment without the
 * keys should do.
 *
 * A run row's webhook token is an HMAC of its id under the service-role key,
 * so the token is made once at creation (its sha256 on the row), never
 * rewritten (E1), and any later job of ours can rebuild the URL it sent.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createHmac } from "node:crypto";
import {
  apifyClient,
  leadJudge,
  LEAD_JUDGE_DEFAULT_MODEL,
  type ApifyClient,
  type LeadJudge,
  type LeadJudgeClient,
} from "../packages/channels.js";
import { JUDGE_TIMEOUT_MS } from "../packages/core.js";
import { env, httpsOriginOf } from "../env.js";
import { edgeOrigin } from "../dashboard-origin.js";
import { imageBytes, pageText } from "./lead-marks.js";

export interface LeadWires {
  apify: ApifyClient;
  judge: LeadJudge;
  /** One GET of a page as text, for the engine's own reading (D6: a lead's mark). Null on anything we cannot read. */
  fetchText(url: string, timeoutMs: number): Promise<string | null>;
  /** One GET of an image's bytes, capped (00161: the copy of a lead's mark we keep). Null on anything else. */
  fetchBytes(url: string, timeoutMs: number, maxBytes: number): Promise<Uint8Array | null>;
  webhookBase: string;
  webhookToken(runRowId: string): Promise<string>;
}

/** This deployment's origin, where the provider's webhook lands: LEAD_WEBHOOK_BASE, else the edge's own (EDGE_ORIGIN). */
function leadWebhookBase(): string {
  return httpsOriginOf(env.LEAD_WEBHOOK_BASE) ?? edgeOrigin();
}

async function leadWebhookToken(runRowId: string): Promise<string> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("lead webhook: no key to derive a token from");
  return createHmac("sha256", key).update(`lead-webhook:${runRowId}`).digest("base64url");
}

/** One constant (PRD decision 3), overridable by the env to another Claude model; anything else is the default. */
function leadJudgeModel(v: string | undefined = env.LEAD_JUDGE_MODEL): string {
  return v && /^claude-[a-z0-9.-]+$/.test(v) ? v : LEAD_JUDGE_DEFAULT_MODEL;
}

/** The server-side fallback (decision 14): on unless the env says off. */
function leadJudgeFallbacks(v: string | undefined = env.LEAD_JUDGE_FALLBACKS): boolean {
  return !(v === "off" || v === "0" || v === "false");
}

// output_config and fallbacks predate the SDK pin's types; the API accepts them (brain.ts:54).
// No retry of the SDK's own: a second try doubles the window the runner's
// JUDGE_MARGIN_MS guards, and a slow answer is the ledger's retry to make, not
// the client's inside a job that is about to be killed.
const realJudgeClient = (): LeadJudgeClient =>
  new Anthropic({ timeout: JUDGE_TIMEOUT_MS, maxRetries: 0 }) as unknown as LeadJudgeClient;

export function leadWires(fetchImpl: typeof fetch = fetch): LeadWires | undefined {
  const token = env.APIFY_TOKEN;
  if (!token || !env.ANTHROPIC_API_KEY) return undefined;
  return {
    apify: apifyClient(fetchImpl, token),
    judge: leadJudge(realJudgeClient(), leadJudgeModel(), leadJudgeFallbacks()),
    webhookBase: leadWebhookBase(),
    webhookToken: leadWebhookToken,
    fetchText: (url, timeoutMs) => pageText(fetchImpl, url, timeoutMs),
    fetchBytes: (url, timeoutMs, maxBytes) => imageBytes(fetchImpl, url, timeoutMs, maxBytes),
  };
}
