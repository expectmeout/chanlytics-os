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
 *   - a write to the ledger that fails is logged and never costs the answer;
 *   - a receptionist's turn about a conversation is kept as the model read it (keepTurn; decision 0039), on the same terms.
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
import {
  MODEL_TURN_WRITE_MS,
  aiUsageBodyOf,
  creditRanOut,
  type ModelCallOutcome,
  type ModelPurpose,
  type ModelUsage,
} from "./packages/contracts.js";
import { keepModelTurn, recordModelUsage, workspaceMayUseModels, type ModelTurnKept } from "./packages/db.js";
import { pg } from "./pg.js";
import { pageOperator } from "./ops/page-operator.js";
import { env } from "./env.js";
import { logger, errField } from "./log.js";

/** Who a call is for: the ledger's row. A call with no workspace (a platform read) is asked and not written. */
export interface ModelCallFor {
  tenantId: string | null;
  /** What it was about: a conversation, a send, a review, or the lead round a judge's batch was paid in. */
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
  // Ask's journal (decision 0070): a paused, ended or unbilled workspace's day is not written.
  "ask_journal",
  // A rehearsal's review and the fix router (decision 0069): the owner's press, spent as Try it's is.
  "receptionist_review",
  "fix_route",
]);

let deps: ModelDeps = {};
/**
 * For tests: the network (and a sleep that does not wait) every model call uses until reset (null), the second model's
 * (lib/shadow.ts, through modelDeps) as well as the primary's: a test's fetch answers by the address it is asked.
 */
export function setModelFetch(f: typeof fetch | null): void {
  deps = f ? { fetch: f, sleep: async () => {} } : {};
}

/** What every port's calls run over: the platform's network and clock, or a test's. */
export function modelDeps(): ModelDeps {
  return deps;
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

/** The page when the key's credit has run out: one per window, whichever workspace's call found it. */
const MODEL_CREDIT_PAGE_KEY = "model_credit";

/**
 * One row of the ledger for one call, with what the API said when it got no answer (00469); never thrown. A refusal
 * that says the key's credit ran out pages the platform, once per window: every model call stops until it is topped up.
 */
export async function recordCall(
  purpose: ModelPurpose,
  call: {
    asked: string;
    model: string;
    outcome: ModelCallOutcome;
    usage: ModelUsage;
    error?: { type: string; message: string } | null;
  },
  forWhom: ModelCallFor,
): Promise<void> {
  const db = pg();
  if (!db || !forWhom.tenantId) return;
  if (creditRanOut(call.error))
    await pageOperator(
      { db },
      MODEL_CREDIT_PAGE_KEY,
      "The model key's credit has run out",
      `A ${purpose} call was refused: "${call.error?.message ?? ""}". Every model call (the receptionist, Ask, the drafts, ` +
        `the lead finder) is refused until the key's credit is topped up in the Claude Console. The Console's Health ` +
        `lists each refused call under Model calls.\n`,
    ).catch((e: unknown) =>
      logger({ tenant_id: forWhom.tenantId }).error("model_credit_page_failed", { error: errField(e) }),
    );
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
        error: call.error ?? null,
      }),
    );
  } catch (e) {
    logger({ tenant_id: forWhom.tenantId }).error("ai_usage_write_failed", { purpose, error: errField(e) });
  }
}

/**
 * One receptionist turn kept as the model read it, with the text of its prompt (decision 0039; packages/db
 * keepModelTurn). Never thrown, and never waited on longer than MODEL_TURN_WRITE_MS: a turn that cannot be kept, or is
 * not kept in time, is logged and the answer goes as it would have. Answers whether it was kept, so a reply names
 * only a turn that is there.
 */
export async function keepTurn(turn: ModelTurnKept): Promise<boolean> {
  const db = pg();
  if (!db) return false;
  const L = logger({ tenant_id: turn.tenantId });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const tooSlow = new Promise<"late">((resolve) => {
      timer = setTimeout(() => resolve("late"), MODEL_TURN_WRITE_MS);
    });
    const write = keepModelTurn(db, turn).then(() => "kept" as const);
    // Left behind, it may still land or fail after the reply has gone: either way nobody is waiting on it.
    write.catch(() => undefined);
    const kept = (await Promise.race([write, tooSlow])) === "kept";
    if (!kept) L.error("model_turn_write_failed", { turn: turn.turnId, left_behind_ms: MODEL_TURN_WRITE_MS });
    return kept;
  } catch (e) {
    L.error("model_turn_write_failed", { turn: turn.turnId, error: errField(e) });
    return false;
  } finally {
    clearTimeout(timer);
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
type ModelHeld = { outcome: "held" };

/** One model call through the port, written to the ledger; null with no key, `held` when the workspace may not pay. */
export async function callModel(ask: ModelAsk, forWhom: ModelCallFor): Promise<ModelReply | ModelHeld | null> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!(await mayUseModelFor(ask.purpose, forWhom.tenantId))) return { outcome: "held" };
  const r = await portAsk(key, ask, deps);
  await recordCall(
    ask.purpose,
    {
      asked: r.asked,
      model: r.model,
      outcome: outcomeOf(r, forWhom),
      usage: r.usage,
      error: r.outcome === "ok" ? null : { type: r.errorType, message: r.error },
    },
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
  /**
   * How hard the model thinks (output_config.effort), where the caller says: a model that thinks by default spends its
   * thinking inside maxTokens, so a short answer asks for less of it. Unsaid, the model's own default.
   */
  effort?: "low" | "medium" | "high";
  /** A sooner bound than the purpose's (never a later one: channels tryBound), and a signal that ends the call sooner. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** The whole call's end, its fallback's try included (the port asks none with too little left), in ms from its start. */
  deadlineMs?: number;
  /** Who it is for: the ledger's row. */
  for: ModelCallFor;
}

/** One answer in the shape asked; null when there is no model to ask, or the workspace may not pay for one. */
export async function askJson(a: JsonAsk): Promise<JsonAnswer | null> {
  const base: Omit<ModelAsk, "body"> = {
    purpose: a.purpose,
    ...(a.timeoutMs ? { timeoutMs: a.timeoutMs } : {}),
    ...(a.signal ? { signal: a.signal } : {}),
    ...(a.deadlineMs ? { deadlineMs: a.deadlineMs } : {}),
  };
  const body = { max_tokens: a.maxTokens, messages: [{ role: "user", content: a.user }] };
  const effort = a.effort ? { effort: a.effort } : {};
  let r = await callModel(
    {
      ...base,
      body: {
        ...body,
        system: a.system,
        output_config: { format: { type: "json_schema", schema: a.schema }, ...effort },
      },
    },
    a.for,
  );
  // The plain retry keeps the effort: only the format was refused.
  if (r && r.outcome !== "held" && formatRejected(r)) {
    r = await callModel(
      {
        ...base,
        body: { ...body, system: `${a.system}\n${a.plainJsonHint}`, ...(a.effort ? { output_config: effort } : {}) },
      },
      a.for,
    );
  }
  if (!r || r.outcome === "held") return null;
  if (r.outcome !== "ok") throw new ModelUnavailable(r);
  const stop = r.message.stop_reason;
  const answer = stop === "refusal" || stop === "max_tokens" ? null : firstJson(r.text);
  return { answer, tokens: { input: r.usage.input, output: r.usage.output } };
}
