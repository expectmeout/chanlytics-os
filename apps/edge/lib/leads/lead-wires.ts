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
import { createHmac } from "node:crypto";
import {
  apifyClient,
  leadJudge,
  LEAD_JUDGE_DEFAULT_MODEL,
  type ApifyClient,
  type LeadJudge,
  type LeadJudgeAnswer,
  type LeadJudgeClient,
} from "../packages/channels.js";
import { judgeShadowSpecs } from "../packages/contracts.js";
import { env } from "../env.js";
import { callModel } from "../model.js";
import { startShadow } from "../shadow.js";
import { imageBytes, pageText } from "./lead-marks.js";

const DEFAULT_ORIGIN = "https://chanlytics-messaging.vercel.app";

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

/** This deployment's origin, where the provider's webhook lands: LEAD_WEBHOOK_BASE, else EDGE_ORIGIN, else the address the edge has always had. */
function leadWebhookBase(): string {
  const o = env.LEAD_WEBHOOK_BASE || env.EDGE_ORIGIN;
  return o && /^https:\/\/[a-z0-9.-]+$/i.test(o) ? o : DEFAULT_ORIGIN;
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

/**
 * The judge's client over the model port (lib/model.ts): the registry's route for the judge (its bound, no retry and no
 * fallback of its own: a slow or overloaded answer is the jobs ledger's retry to make, inside JUDGE_MARGIN_MS), each call
 * written to the usage ledger for the search's workspace. The API's refusal of the request (a 400 naming the beta or the
 * format) is thrown with its status, so the judge asks again without the beta, as it did over the SDK; any other call
 * that got no answer throws, and the job retries.
 */
const portJudgeClient = (): LeadJudgeClient => ({
  beta: {
    messages: {
      async create(params, call) {
        const { model, betas, ...body } = params as { model?: string; betas?: string[] } & Record<string, unknown>;
        const r = await callModel(
          { purpose: "lead_judge", body, ...(typeof model === "string" ? { model } : {}), ...(betas ? { betas } : {}) },
          { tenantId: call?.tenantId ?? null },
        );
        if (!r || r.outcome === "held") throw new Error("lead judge: no model to ask");
        if (r.outcome !== "ok") throw Object.assign(new Error(r.error), { status: r.status });
        return r.message;
      },
    },
  },
});

/** The judge's answer to one criterion of one place, as a label; null when it gave none. */
function judgedLabel(out: LeadJudgeAnswer | undefined, ref: string, criterion: string): string | null {
  if (!out || !("answers" in out)) return null;
  const place = out.answers.find((a) => String(a.ref) === ref);
  return place?.criteria.find((c) => c.key === criterion)?.answer ?? null;
}

/**
 * The judge, with each place's criteria also put to a second model in shadow when it is on (decision 0023): one call a
 * place, its answers compared with the judge's and kept, never read by the run. The judge's own answer, its refusals
 * and its throws pass through as they were.
 */
function shadowed(inner: LeadJudge): LeadJudge {
  return {
    async judge(plan, places, tenantId) {
      const shadow = startShadow("lead_judge", { tenantId: tenantId ?? null }, () => judgeShadowSpecs(plan, places));
      let out: LeadJudgeAnswer | undefined;
      try {
        out = await inner.judge(plan, places, tenantId);
        return out;
      } finally {
        await shadow?.settle((ref, criterion) => judgedLabel(out, ref, criterion));
      }
    },
  };
}

export function leadWires(fetchImpl: typeof fetch = fetch): LeadWires | undefined {
  const token = env.APIFY_TOKEN;
  if (!token || !env.ANTHROPIC_API_KEY) return undefined;
  return {
    apify: apifyClient(fetchImpl, token),
    judge: shadowed(leadJudge(portJudgeClient(), leadJudgeModel(), leadJudgeFallbacks())),
    webhookBase: leadWebhookBase(),
    webhookToken: leadWebhookToken,
    fetchText: (url, timeoutMs) => pageText(fetchImpl, url, timeoutMs),
    fetchBytes: (url, timeoutMs, maxBytes) => imageBytes(fetchImpl, url, timeoutMs, maxBytes),
  };
}
