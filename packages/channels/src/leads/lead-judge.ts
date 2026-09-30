/**
 * The judge's one model call (PRD §7.1): a structured output, no tools, no web,
 * sent the way apps/edge/lib/receptionist/brain.ts sends the receptionist's in production
 * (beta.messages.create, output_config.format beside the effort), and read by
 * contracts' own parser (lead-judge.ts holds the schema and the parser; this
 * file holds the call). The answering model is recorded, because the API's
 * server-side fallback may answer with another model when the chosen one is
 * busy (PRD decision 14); a deployment whose key does not take the beta is
 * asked again once without it, as brain.ts does for a refused format.
 *
 * A refusal, a capped answer (max_tokens) and an answer the parser rejects are
 * all `refused`, an answer and never a throw: the caller asks once more and
 * then marks the batch Needs review. A 429, a 5xx or no answer throws, and the
 * jobs ledger's waits retry the job.
 */
import { createHash } from "node:crypto";
import {
  MODEL_ROUTES,
  JUDGE_OUTPUT_SCHEMA,
  judgeSystemPrompt,
  judgeUserContent,
  parseJudgeAnswer,
  type JudgePlaceAnswer,
  type LeadSearchPlan,
  type PlaceFacts,
} from "@chanlytics/contracts";

/** Twenty-five places at low effort fit in about 3,000 tokens; the rest is room. A cap reached is a refusal, never a split. */
export const LEAD_JUDGE_MAX_TOKENS = MODEL_ROUTES.lead_judge.maxTokens;
export const LEAD_JUDGE_FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** The registry's model for the judge (contracts ai/models.ts); LEAD_JUDGE_MODEL on the edge may name another. */
export const LEAD_JUDGE_DEFAULT_MODEL = MODEL_ROUTES.lead_judge.model;

/**
 * The client as this call uses it: the edge builds one over the model port (apps/edge/lib/leads/lead-wires.ts), which
 * writes each call to the usage ledger for the workspace named in `call`.
 */
export interface LeadJudgeClient {
  beta: { messages: { create(params: Record<string, unknown>, call?: { tenantId?: string }): Promise<unknown> } };
}

export type LeadJudgeAnswer =
  | { answers: JudgePlaceAnswer[]; model: string; tokens: number; raw: unknown; requestHash: string }
  | { refused: true; why: string };

export interface LeadJudge {
  /** One batch judged; `tenantId` is the search's workspace, the usage ledger's row. */
  judge(plan: LeadSearchPlan, places: PlaceFacts[], tenantId?: string): Promise<LeadJudgeAnswer>;
}

interface RawResponse {
  model?: string;
  stop_reason?: string | null;
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** The API refused the REQUEST's beta or format, not the content: a 400 that names it. */
function betaRejected(e: unknown): boolean {
  const err = e as { status?: number; message?: string } | null;
  return err?.status === 400 && /fallback|beta|output_config|json_schema|format/i.test(err.message ?? "");
}

export function leadJudge(client: LeadJudgeClient, model: string, fallbacks: boolean): LeadJudge {
  return {
    async judge(plan, places, tenantId) {
      const system = judgeSystemPrompt(plan);
      const user = judgeUserContent(places);
      const requestHash = createHash("sha256").update(`${system}\n${user}`).digest("hex");
      const base = {
        model,
        max_tokens: LEAD_JUDGE_MAX_TOKENS,
        system,
        messages: [{ role: "user", content: user }],
        output_config: { effort: "low", format: { type: "json_schema", schema: JUDGE_OUTPUT_SCHEMA } },
      };
      let res: RawResponse;
      try {
        res = (await client.beta.messages.create(
          fallbacks ? { ...base, betas: [LEAD_JUDGE_FALLBACK_BETA], fallbacks: "default" } : base,
          { tenantId },
        )) as RawResponse;
      } catch (e) {
        if (!(fallbacks && betaRejected(e))) throw e;
        res = (await client.beta.messages.create(base, { tenantId })) as RawResponse;
      }
      const tokens = (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);
      if (res.stop_reason === "refusal") return { refused: true, why: "the judge refused" };
      if (res.stop_reason === "max_tokens") return { refused: true, why: "max_tokens" };
      const text = (res.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return { refused: true, why: "not JSON" };
      }
      const parsed = parseJudgeAnswer(raw, plan, places);
      if (!parsed.ok) return { refused: true, why: parsed.why };
      return { answers: parsed.answers, model: res.model ?? model, tokens, raw, requestHash };
    },
  };
}
