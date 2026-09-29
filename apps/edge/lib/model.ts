/**
 * The model port, bound where the key is (scorecard move 10): every model call the edge makes goes through here, to
 * channels' adapter (packages/channels/src/models/anthropic.ts: the registry's route by purpose, the fallback on a 529, a 5xx or
 * a timeout, one outcome), and every one is written to the usage ledger through one writer (packages/db ai-usage.ts
 * recordModelUsage): its tokens by kind, the model that answered, the dollars at list price. The receptionist, the review
 * reply, the lead judge, the notes sweep, the reach-out check, the reply reader and Ask's gateway all ask here.
 *
 *   - no key: nothing is asked, and the answer is null ("no model to ask");
 *   - a purpose a person asks for (Ask, the drafts, the review reply, the notes) first asks whether the workspace may use
 *     the model at all (mayUseModels: not paused, not ended, not unbilled); a workspace that may not gets no call;
 *   - a write to the ledger that fails is logged and never costs the answer.
 *
 * askJson is the one JSON transport the platform's small reads share: the answer is asked for in its schema
 * (output_config); an API that refuses the request's format, not its content, is asked again once for plain JSON with
 * the hint the caller gives; a refusal or an answer cut at its cap is no answer (null inside), never half of one; a
 * call that got no answer throws (ModelUnavailable), and the caller counts it.
 */
import { createHash } from "node:crypto";
import {
  askModel as portAsk,
  streamModel as portStream,
  formatRejected,
  type ModelAsk,
  type ModelDeps,
  type ModelReply,
  type ModelStreamReply,
} from "./packages/channels.js";
import { aiUsageBodyOf, type ModelCallOutcome, type ModelPurpose, type ModelUsage } from "./packages/contracts.js";
import { recordModelUsage, workspaceMayUseModels } from "./packages/db.js";
import { pg } from "./pg.js";
import { env } from "./env.js";
import { logger, errField } from "./log.js";

/** Who a call is for: the ledger's row. A call with no workspace (a platform read) is asked and not written. */
export interface ModelCallFor {
  tenantId: string | null;
  /** What it was about: a conversation, a send, a review. */
  subjectId?: string | null;
  /** The person who asked, when one did. */
  userId?: string | null;
  /** The sha256 of what the model was told, when the caller keeps one. */
  promptHash?: string | null;
  /** An answer that came but cannot be used (cut at its cap, out of its shape): the ledger says unreadable. */
  unreadable?: (reply: Extract<ModelReply, { outcome: "ok" }>) => boolean;
}

/** The purposes a person asks for, which the port first checks the workspace may pay for (maySpend's model twin). */
const ASKED_BY_A_PERSON: ReadonlySet<ModelPurpose> = new Set<ModelPurpose>([
  "ask",
  "lead_json",
  "template_draft",
  "review_reply",
  "note_suggest",
]);

let deps: ModelDeps = {};
/** For tests: the network (and a sleep that does not wait) every call uses until reset (null). */
export function setModelFetch(f: typeof fetch | null): void {
  deps = f ? { fetch: f, sleep: async () => {} } : {};
}

/** The first 16 hex of the sha256 of a prompt: what a stored answer names its instructions by. */
export function promptHashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** A call that got no answer: the caller counts it, as it counted a thrown SDK error before. */
export class ModelUnavailable extends Error {
  constructor(public readonly reply: Extract<ModelReply, { outcome: "rejected" | "unreachable" }>) {
    super(`model ${reply.outcome}: ${reply.status} ${reply.error}`);
    this.name = reply.error === "timeout" ? "TimeoutError" : "ModelUnavailable";
  }
}

/** What the ledger says became of a call. */
function outcomeOf(r: ModelReply, forWhom: ModelCallFor): ModelCallOutcome {
  if (r.outcome !== "ok") return r.outcome;
  if (r.message.stop_reason === "refusal") return "refused";
  if (r.message.stop_reason === "max_tokens" || forWhom.unreadable?.(r)) return "unreadable";
  return r.fellBack ? "fell_back" : "answered";
}

/** One row of the ledger for one call; never thrown. */
export async function recordCall(
  purpose: ModelPurpose,
  call: { asked: string; model: string; outcome: ModelCallOutcome; usage: ModelUsage },
  forWhom: ModelCallFor,
): Promise<void> {
  const db = pg();
  if (!db || !forWhom.tenantId) return;
  try {
    await recordModelUsage(
      db,
      aiUsageBodyOf({
        tenantId: forWhom.tenantId,
        purpose,
        asked: call.asked,
        answered: call.model,
        outcome: call.outcome,
        usage: call.usage,
        promptHash: forWhom.promptHash ?? null,
        userId: forWhom.userId ?? null,
        subjectId: forWhom.subjectId ?? null,
      }),
    );
  } catch (e) {
    logger({ tenant_id: forWhom.tenantId }).error("ai_usage_write_failed", { purpose, error: errField(e) });
  }
}

/**
 * Whether this workspace may use the model for a purpose a person asks for: not paused, not ended, not unbilled
 * (contracts mayUseModels). A read that fails holds the call: "we could not check" is not "yes".
 */
export async function mayUseModelFor(purpose: ModelPurpose, tenantId: string | null): Promise<boolean> {
  if (!ASKED_BY_A_PERSON.has(purpose) || !tenantId) return true;
  const db = pg();
  if (!db) return true;
  try {
    return await workspaceMayUseModels(db, tenantId);
  } catch (e) {
    logger({ tenant_id: tenantId }).error("ai_spend_read_failed", { purpose, error: errField(e) });
    return false;
  }
}

/** A call the workspace may not pay for: no call, no row, and the caller says so. */
export type ModelHeld = { outcome: "held" };

/** One model call through the port, written to the ledger; null with no key, `held` when the workspace may not pay. */
export async function callModel(ask: ModelAsk, forWhom: ModelCallFor): Promise<ModelReply | ModelHeld | null> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!(await mayUseModelFor(ask.purpose, forWhom.tenantId))) return { outcome: "held" };
  const r = await portAsk(key, ask, deps);
  await recordCall(
    ask.purpose,
    { asked: r.asked, model: r.model, outcome: outcomeOf(r, forWhom), usage: r.usage },
    forWhom,
  );
  return r;
}

/** One streamed call through the port (Ask's gateway); its usage is written by the caller once the stream has said it. */
export async function streamModelCall(ask: ModelAsk): Promise<ModelStreamReply | null> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return portStream(key, ask, deps);
}

/** The first JSON object in a text answer, or null. */
export function firstJson(text: string): unknown {
  const at = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (at < 0 || end <= at) return null;
  try {
    return JSON.parse(text.slice(at, end + 1));
  } catch {
    return null;
  }
}

/** What one call answered, with what it cost. */
export interface JsonAnswer {
  answer: unknown;
  tokens: { input: number; output: number };
}

interface JsonAsk {
  purpose: ModelPurpose;
  system: string;
  user: string;
  schema: object;
  maxTokens: number;
  /** Added to the system prompt when the API refuses the schema and the answer is asked for as plain JSON. */
  plainJsonHint: string;
  /** A sooner bound than the purpose's, and a signal that ends the call sooner. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Who it is for: the ledger's row. */
  for: ModelCallFor;
}

/** One answer in the shape asked; null when there is no model to ask, or the workspace may not pay for one. */
export async function askJson(a: JsonAsk): Promise<JsonAnswer | null> {
  const base: Omit<ModelAsk, "body"> = {
    purpose: a.purpose,
    ...(a.timeoutMs ? { timeoutMs: a.timeoutMs } : {}),
    ...(a.signal ? { signal: a.signal } : {}),
  };
  const body = { max_tokens: a.maxTokens, messages: [{ role: "user", content: a.user }] };
  let r = await callModel(
    {
      ...base,
      body: { ...body, system: a.system, output_config: { format: { type: "json_schema", schema: a.schema } } },
    },
    a.for,
  );
  if (r && r.outcome !== "held" && formatRejected(r)) {
    r = await callModel({ ...base, body: { ...body, system: `${a.system}\n${a.plainJsonHint}` } }, a.for);
  }
  if (!r || r.outcome === "held") return null;
  if (r.outcome !== "ok") throw new ModelUnavailable(r);
  const stop = r.message.stop_reason;
  const answer = stop === "refusal" || stop === "max_tokens" ? null : firstJson(r.text);
  return { answer, tokens: { input: r.usage.input, output: r.usage.output } };
}
