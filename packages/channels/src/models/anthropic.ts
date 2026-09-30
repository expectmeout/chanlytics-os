/**
 * The model port: the one way a request leaves for Anthropic's Messages API (scorecard move 10).
 *
 * Before it, four SDK clients (the receptionist, the review reply, the lead judge, the JSON reads) and the gateway's own
 * fetch each asked the API their own way: a 529 was retried by some and forwarded by others, and the dashboard read the
 * gateway's forwarded 529 as "the model refused the question". Now every purpose asks through here, over providerFetch
 * and its outcome rules, and the route contracts' registry gives it (ai/models.ts) says the model, the fallback, the
 * bound and the retries.
 *
 * What a call comes to:
 *   ok           the API answered: its message, its usage, and the model that answered (a fallback's, when it did).
 *   rejected     the API refused the request itself (a 4xx but 408 and 429: a bad request, a key it will not take, a
 *                format it does not know). Asking again, anywhere, gets the same answer.
 *   unreachable  no answer came: a 429 or 408 ("not now"), a 5xx or a 529 (overloaded), a try that ran out of time or a
 *                connection that dropped, after the fallback was asked too. Never "the model refused": the model was
 *                never heard.
 *
 * Retry by kind: a "not now" is asked again on the same model up to the route's retries (providerFetch's backoff, inside
 * the deadline); an answer that never came (5xx, 529, a timeout) is asked once of the purpose's fallback model, when
 * there is one and the deadline leaves room. A model's own refusal (stop_reason "refusal") is an answer, ok, and the
 * caller reads it. The calls are always made (breaker "count"): an overloaded model says nothing of the others.
 *
 * The streaming form hands back the API's event stream unread for the gateway to forward; the fallback is asked only
 * before the first byte.
 */
import { fallbackModel, modelRoute, usageOf, NO_USAGE } from "@chanlytics/contracts";
import type { ModelPurpose, ModelUsage } from "@chanlytics/contracts";
import { providerFetch, type ProviderReply } from "../provider-fetch";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** A content block as the port reads it: text is all the platform's callers take from an answer. */
export interface ModelBlock {
  type: string;
  text?: string;
  [k: string]: unknown;
}

/** The API's message, as much of it as the callers read. */
export interface ModelMessage {
  id: string | null;
  model: string | null;
  stop_reason: string | null;
  content: ModelBlock[];
  usage: Record<string, unknown> | null;
}

export type ModelOutcome = "ok" | "rejected" | "unreachable";

interface Asked {
  /** The model the purpose asked first. */
  asked: string;
  /** The model that answered, or the last one tried. */
  model: string;
  /** Whether the fallback was asked. */
  fellBack: boolean;
  /** The HTTP status of the last try (0 when none came). */
  status: number;
}

export type ModelReply =
  | (Asked & { outcome: "ok"; message: ModelMessage; usage: ModelUsage; text: string })
  | (Asked & {
      outcome: "rejected" | "unreachable";
      /** The network's words, "timeout", or the API's error message. */
      error: string;
      /** The API's own body, cut short, for the log. */
      detail: string;
      usage: ModelUsage;
    });

export type ModelStreamReply =
  | (Asked & { outcome: "ok"; body: ReadableStream<Uint8Array>; headers: Headers | null })
  | (Asked & { outcome: "rejected" | "unreachable"; error: string; detail: string });

export interface ModelAsk {
  purpose: ModelPurpose;
  /** The request without its model: system, messages, tools, output_config, … (max_tokens the route's unless named) */
  body: Record<string, unknown>;
  /** The model to ask first; the purpose's own when absent (Ask names its profile, the judge its setting). */
  model?: string;
  /** Beta features, sent as the anthropic-beta header. */
  betas?: string[];
  /** A sooner bound than the route's, for one try. */
  timeoutMs?: number;
  /** Tries after the first on a "not now"; the route's when absent. */
  retries?: number;
  /** The whole call's end (the tries, the waits and the fallback), in ms from its start. */
  deadlineMs?: number;
  /** The caller's own end: an abandoned call is a timeout. */
  signal?: AbortSignal;
}

/** What a test hands in instead of the network and the clock. */
export interface ModelDeps {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** The least time a fallback is worth asking with: under it, the caller's deadline has already been spent. */
const FALLBACK_FLOOR_MS = 1_500;

function headersFor(key: string, betas: string[] | undefined): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": ANTHROPIC_VERSION,
    ...(betas && betas.length ? { "anthropic-beta": betas.join(",") } : {}),
  };
}

/** The API's error message from its body, or the network's words. */
function errorOf(a: ProviderReply): string {
  const j = a.json as { error?: { message?: unknown; type?: unknown } } | null;
  const m = j && typeof j === "object" && j.error && typeof j.error.message === "string" ? j.error.message : null;
  return m ?? a.error ?? `status ${a.status}`;
}

/** Whether an answer that did not come is worth the fallback: a 5xx or 529, a timeout, a dropped connection. */
const neverCame = (a: ProviderReply): boolean => a.outcome === "unknown";

function messageOf(json: unknown): ModelMessage {
  const j = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const content = Array.isArray(j.content) ? (j.content as ModelBlock[]) : [];
  return {
    id: typeof j.id === "string" ? j.id : null,
    model: typeof j.model === "string" ? j.model : null,
    stop_reason: typeof j.stop_reason === "string" ? j.stop_reason : null,
    content,
    usage: j.usage && typeof j.usage === "object" ? (j.usage as Record<string, unknown>) : null,
  };
}

/** The text of an answer's text blocks, joined. */
function messageTextOf(message: Pick<ModelMessage, "content">): string {
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => (typeof b.text === "string" ? b.text : ""))
    .join("");
}

/**
 * The API refused the request's format or a beta it names, not its content: a 400 that says so. The caller asks again
 * without it (plain JSON, no beta), as it always has.
 */
export function formatRejected<R extends { outcome: ModelOutcome; status: number; error?: string }>(
  r: R,
): r is R & { outcome: "rejected"; error: string } {
  return (
    r.outcome === "rejected" &&
    r.status === 400 &&
    /output_config|output_format|json_schema|schema|format|fallback|beta/i.test(r.error ?? "")
  );
}

interface Plan {
  route: ReturnType<typeof modelRoute>;
  first: string;
  started: number;
  d: Required<ModelDeps>;
}

function planOf(ask: ModelAsk, deps: ModelDeps): Plan {
  const d: Required<ModelDeps> = {
    fetch: deps.fetch ?? globalThis.fetch,
    now: deps.now ?? Date.now,
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
  const route = modelRoute(ask.purpose);
  return { route, first: ask.model ?? route.model, started: d.now(), d };
}

/** One model's tries: the route's bound (or the caller's sooner one), its retries on "not now", inside the deadline. */
function tryModel(key: string, ask: ModelAsk, p: Plan, model: string, stream: boolean): Promise<ProviderReply> {
  const left = ask.deadlineMs === undefined ? Infinity : ask.deadlineMs - (p.d.now() - p.started);
  const timeoutMs = Math.max(1, Math.min(ask.timeoutMs ?? p.route.timeoutMs, left));
  return providerFetch(
    "anthropic",
    ANTHROPIC_MESSAGES_URL,
    {
      method: "POST",
      headers: headersFor(key, ask.betas),
      body: JSON.stringify({ max_tokens: p.route.maxTokens, ...ask.body, model, ...(stream ? { stream: true } : {}) }),
      timeoutMs,
      tries: 1 + Math.max(0, ask.retries ?? p.route.retries),
      ...(Number.isFinite(left) ? { deadlineMs: left } : {}),
      breaker: "count",
      ...(ask.signal ? { signal: ask.signal } : {}),
      ...(stream ? { stream: true } : {}),
    },
    p.d,
  );
}

/** Whether the fallback may still be asked: there is one, and the deadline leaves it room. */
function fallbackFor(ask: ModelAsk, p: Plan, failed: ProviderReply): string | null {
  if (!neverCame(failed) || ask.signal?.aborted) return null;
  const next = fallbackModel(ask.purpose, p.first);
  if (!next) return null;
  const left = ask.deadlineMs === undefined ? Infinity : ask.deadlineMs - (p.d.now() - p.started);
  return left >= FALLBACK_FLOOR_MS ? next : null;
}

const failure = (a: ProviderReply): "rejected" | "unreachable" =>
  a.outcome === "refused" ? "rejected" : "unreachable";

/** One answer from the model the purpose names, or its fallback; never thrown. */
export async function askModel(key: string, ask: ModelAsk, deps: ModelDeps = {}): Promise<ModelReply> {
  const p = planOf(ask, deps);
  let model = p.first;
  let a = await tryModel(key, ask, p, model, false);
  let fellBack = false;
  const next = a.outcome === "ok" ? null : fallbackFor(ask, p, a);
  if (next) {
    model = next;
    fellBack = true;
    a = await tryModel(key, ask, p, model, false);
  }
  const base = { asked: p.first, fellBack, status: a.status };
  if (a.outcome !== "ok") {
    return {
      ...base,
      model,
      outcome: failure(a),
      error: errorOf(a),
      detail: a.text.slice(0, 300),
      usage: NO_USAGE,
    };
  }
  const message = messageOf(a.json);
  return {
    ...base,
    model: message.model ?? model,
    outcome: "ok",
    message,
    usage: usageOf(message.usage),
    text: messageTextOf(message).trim(),
  };
}

/** The API's event stream for one request, from the model the purpose names or its fallback; never thrown. */
export async function streamModel(key: string, ask: ModelAsk, deps: ModelDeps = {}): Promise<ModelStreamReply> {
  const p = planOf(ask, deps);
  let model = p.first;
  let a = await tryModel(key, ask, p, model, true);
  let fellBack = false;
  const next = a.outcome === "ok" ? null : fallbackFor(ask, p, a);
  if (next) {
    model = next;
    fellBack = true;
    a = await tryModel(key, ask, p, model, true);
  }
  const base = { asked: p.first, model, fellBack, status: a.status };
  if (a.outcome === "ok" && a.body) return { ...base, outcome: "ok", body: a.body, headers: a.headers };
  return { ...base, outcome: failure(a), error: errorOf(a), detail: a.text.slice(0, 300) };
}
