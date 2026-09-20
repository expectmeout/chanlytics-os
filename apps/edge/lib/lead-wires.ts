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
import { apifyClient, leadJudge, LEAD_JUDGE_DEFAULT_MODEL, type ApifyClient, type LeadJudge, type LeadJudgeClient } from "./workspace/channels.js";

const DEFAULT_ORIGIN = "https://chanlytics-messaging.vercel.app";
/** Under the job's 45-second yield, so a slow answer is a retry rather than a killed run. */
const JUDGE_TIMEOUT_MS = 40_000;

export interface LeadWires {
  apify: ApifyClient;
  judge: LeadJudge;
  webhookBase: string;
  webhookToken(runRowId: string): Promise<string>;
}

/** This deployment's origin, where the provider's webhook lands: LEAD_WEBHOOK_BASE, else EDGE_ORIGIN, else the address the edge has always had. */
export function leadWebhookBase(): string {
  const o = process.env.LEAD_WEBHOOK_BASE || process.env.EDGE_ORIGIN;
  return o && /^https:\/\/[a-z0-9.-]+$/i.test(o) ? o : DEFAULT_ORIGIN;
}

export async function leadWebhookToken(runRowId: string): Promise<string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("lead webhook: no key to derive a token from");
  return createHmac("sha256", key).update(`lead-webhook:${runRowId}`).digest("base64url");
}

/** One constant (PRD decision 3), overridable by the env to another Claude model; anything else is the default. */
export function leadJudgeModel(v: string | undefined = process.env.LEAD_JUDGE_MODEL): string {
  return v && /^claude-[a-z0-9.-]+$/.test(v) ? v : LEAD_JUDGE_DEFAULT_MODEL;
}

/** The server-side fallback (decision 14): on unless the env says off. */
export function leadJudgeFallbacks(v: string | undefined = process.env.LEAD_JUDGE_FALLBACKS): boolean {
  return !(v === "off" || v === "0" || v === "false");
}

// output_config and fallbacks predate the SDK pin's types; the API accepts them (brain.ts:54).
const realJudgeClient = (): LeadJudgeClient => new Anthropic({ timeout: JUDGE_TIMEOUT_MS, maxRetries: 1 }) as unknown as LeadJudgeClient;
let judgeClientFor: () => LeadJudgeClient = realJudgeClient;
/** Tests hand in their own; null restores the real one. */
export function setLeadJudgeClient(f: (() => LeadJudgeClient) | null): void {
  judgeClientFor = f ?? realJudgeClient;
}

export function leadWires(fetchImpl: typeof fetch = fetch): LeadWires | undefined {
  const token = process.env.APIFY_TOKEN;
  if (!token || !process.env.ANTHROPIC_API_KEY) return undefined;
  return {
    apify: apifyClient(fetchImpl, token),
    judge: leadJudge(judgeClientFor(), leadJudgeModel(), leadJudgeFallbacks()),
    webhookBase: leadWebhookBase(),
    webhookToken: leadWebhookToken,
  };
}
