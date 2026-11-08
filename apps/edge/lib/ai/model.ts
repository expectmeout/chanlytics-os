/**
 * The model port, bound where the key is (scorecard move 10): every model call the edge makes goes through here, to
 * channels' adapter (packages/channels/src/ai/anthropic.ts: the registry's route by purpose, the fallback on a 529, a 5xx or
 * a timeout, one outcome), and every one is written to the usage ledger through one writer (packages/db ai/usage.ts
 * recordModelUsage): its tokens by kind, the model that answered, the dollars at list price. The receptionist, the review
 * reply, the lead judge, the notes sweep, the reach-out check, the reply reader and Ask's gateway all ask here.
 *
 *   - no key: nothing is asked, and the answer is null ("no model to ask");
 *   - a purpose a person asks for (Ask, the drafts, the review reply, the notes) first asks whether the workspace may use
 *     the model at all (mayUseModels: not paused, not ended, not unbilled); a workspace that may not gets no call;
 *   - a write to the ledger that fails is logged and never costs the answer;
 *   - a receptionist's turn about a conversation is kept as the model read it (keepTurn; decision 0039), on the same terms;
 *   - every call says whom it is for (decision 0097): the person or the workspace its purpose says, under its profile
 *     (lib/ai/anthropic-profiles/attribution.ts), so one customer's flagged traffic cannot restrict the whole organization. A
 *     paused one gets no call. callModel and streamModelCall are the only two doors to the port, and neither takes an
 *     ask with that answer already in it.
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
} from "@chanlytics/channels/ai";
import {
  MODEL_TURN_WRITE_MS,
  aiUsageBodyOf,
  creditRanOut,
  type ModelCallOutcome,
  type ModelPurpose,
  type ModelUsage,
} from "@chanlytics/contracts";
import { keepModelTurn, recordModelUsage, mayWorkspaceUseModels, type ModelTurnKept } from "@chanlytics/db/ai";
import { pg } from "../shared/pg.js";
import { getAttribution, forgetAnthropicProfiles } from "./anthropic-profiles/attribution.js";
import { pageOperator } from "../shared/alerts/page-operator.js";
import { env } from "../shared/env.js";
import { logger, errField } from "../shared/log.js";
import type { TenantId } from "@chanlytics/contracts";

/**
 * Who a call is for: the ledger's row, and whom Anthropic is told (contracts modelSubjectOf). A call with no workspace (a
 * platform read) is asked and not written, and goes under no profile: `tenantId` is required, so that is said, never left out.
 */
export interface ModelCallFor {
  tenantId: TenantId | null;
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
  // A file's look (decision 0099): a paused, ended or unbilled workspace's files are kept, and not read.
  "file_look",
]);

let deps: ModelDeps = {};
/**
 * For tests: the network (and a sleep that does not wait) every model call uses until reset (null), the second model's
 * (lib/ai/shadow.ts, through modelDeps) as well as the primary's: a test's fetch answers by the address it is asked. A new
 * network forgets the profiles the last one's calls read, so no test inherits another's.
 */
export function setModelFetch(fetcher: typeof fetch | null): void {
  deps = fetcher ? { fetch: fetcher, sleep: async () => {} } : {};
  forgetAnthropicProfiles();
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
  const log = logger({ tenant_id: turn.tenantId });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const tooSlow = new Promise<"late">((resolve) => {
      timer = setTimeout(() => resolve("late"), MODEL_TURN_WRITE_MS);
    });
    const write = keepModelTurn(db, turn).then(() => "kept" as const);
    // Left behind, it may still land or fail after the reply has gone: either way nobody is waiting on it.
    write.catch(() => undefined);
    const kept = (await Promise.race([write, tooSlow])) === "kept";
    if (!kept) log.error("model_turn_write_failed", { turn: turn.turnId, left_behind_ms: MODEL_TURN_WRITE_MS });
    return kept;
  } catch (e) {
    log.error("model_turn_write_failed", { turn: turn.turnId, error: errField(e) });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether this workspace may use the model for a purpose a person asks for: not paused, not ended, not unbilled
 * (contracts mayUseModels). A read that fails holds the call: "we could not check" is not "yes".
 */
export async function mayUseModelFor(purpose: ModelPurpose, tenantId: TenantId | null): Promise<boolean> {
  if (!ASKED_BY_A_PERSON.has(purpose) || !tenantId) return true;
  const db = pg();
  if (!db) return true;
  try {
    return await mayWorkspaceUseModels(db, tenantId);
  } catch (e) {
    logger({ tenant_id: tenantId }).error("ai_spend_read_failed", { purpose, error: errField(e) });
    return false;
  }
}

/**
 * A call that did not go: no call, no row, and the caller says so. `unpaid`, the workspace may not pay; `paused`, Anthropic
 * has paused whom it is for; `unread`, whether it has could not be read.
 */
type ModelHeld = { outcome: "held"; why: "unpaid" | "paused" | "unread" };

/** What a caller asks: all of the port's request but whom it is for, which is decided here and nowhere else. */
type ModelRequest = Omit<ModelAsk, "attribution">;

/**
 * Whether a call for this purpose and person would go now: the two holds callModel asks, asked first by a caller with paid
 * work to save before the call (a copy to make, a picture to read). No key, it would not.
 */
export async function mayModelGo(purpose: ModelPurpose, forWhom: ModelCallFor): Promise<boolean> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return false;
  if (!(await mayUseModelFor(purpose, forWhom.tenantId))) return false;
  return !("held" in (await getAttribution(purpose, forWhom, key, deps)));
}

/** One model call through the port, written to the ledger; null with no key, `held` when it may not go. */
export async function callModel(ask: ModelRequest, forWhom: ModelCallFor): Promise<ModelReply | ModelHeld | null> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!(await mayUseModelFor(ask.purpose, forWhom.tenantId))) return { outcome: "held", why: "unpaid" };
  const attribution = await getAttribution(ask.purpose, forWhom, key, deps);
  if ("held" in attribution) return { outcome: "held", why: attribution.held };
  const result = await portAsk(key, { ...ask, attribution: attribution.attribution }, deps);
  await recordCall(
    ask.purpose,
    {
      asked: result.asked,
      model: result.model,
      outcome: outcomeOf(result, forWhom),
      usage: result.usage,
      error: result.outcome === "ok" ? null : { type: result.errorType, message: result.error },
    },
    forWhom,
  );
  return result;
}

/** One streamed call through the port (Ask's gateway); its usage is written by the caller once the stream has said it. */
export async function streamModelCall(
  ask: ModelRequest,
  forWhom: ModelCallFor,
): Promise<ModelStreamReply | ModelHeld | null> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const attribution = await getAttribution(ask.purpose, forWhom, key, deps);
  if ("held" in attribution) return { outcome: "held", why: attribution.held };
  return portStream(key, { ...ask, attribution: attribution.attribution }, deps);
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

/** What one call answered, with what it cost. `refused` tells a refusal from an answer that could not be read. */
export interface JsonAnswer {
  answer: unknown;
  tokens: { input: number; output: number };
  refused?: true;
}

interface JsonAsk {
  purpose: ModelPurpose;
  system: string;
  /** The words, or the content blocks where a picture goes with them. */
  user: string | readonly Record<string, unknown>[];
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
export async function askJson(jsonAsk: JsonAsk): Promise<JsonAnswer | null> {
  const base: Omit<ModelRequest, "body"> = {
    purpose: jsonAsk.purpose,
    ...(jsonAsk.timeoutMs ? { timeoutMs: jsonAsk.timeoutMs } : {}),
    ...(jsonAsk.signal ? { signal: jsonAsk.signal } : {}),
    ...(jsonAsk.deadlineMs ? { deadlineMs: jsonAsk.deadlineMs } : {}),
  };
  const body = { max_tokens: jsonAsk.maxTokens, messages: [{ role: "user", content: jsonAsk.user }] };
  const effort = jsonAsk.effort ? { effort: jsonAsk.effort } : {};
  let result = await callModel(
    {
      ...base,
      body: {
        ...body,
        system: jsonAsk.system,
        output_config: { format: { type: "json_schema", schema: jsonAsk.schema }, ...effort },
      },
    },
    jsonAsk.for,
  );
  // The plain retry keeps the effort: only the format was refused.
  if (result && result.outcome !== "held" && formatRejected(result)) {
    result = await callModel(
      {
        ...base,
        body: {
          ...body,
          system: `${jsonAsk.system}\n${jsonAsk.plainJsonHint}`,
          ...(jsonAsk.effort ? { output_config: effort } : {}),
        },
      },
      jsonAsk.for,
    );
  }
  if (!result || result.outcome === "held") return null;
  if (result.outcome !== "ok") throw new ModelUnavailable(result);
  const stop = result.message.stop_reason;
  const answer = stop === "refusal" || stop === "max_tokens" ? null : firstJson(result.text);
  return {
    answer,
    tokens: { input: result.usage.input, output: result.usage.output },
    ...(stop === "refusal" ? { refused: true as const } : {}),
  };
}
