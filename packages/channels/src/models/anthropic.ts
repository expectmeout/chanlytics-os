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
 *                format it does not know). Asking again, anywhere, gets the same answer; but for a 404, which says
 *                the API has no such model, and the purpose's other model may well exist.
 *   unreachable  no answer came: a 429 or 408 ("not now"), a 5xx or a 529 (overloaded), a try that ran out of time or a
 *                connection that dropped, after the fallback was asked too. Never "the model refused": the model was
 *                never heard.
 *
 * Retry by kind: a "not now" is asked again on the same model up to the route's retries (providerFetch's backoff, inside
 * the deadline); an answer that never came (5xx, 529, a timeout), or a model the API does not know (a 404: a name a
 * variable misspelt, an id since retired), is asked once of the purpose's fallback model, when there is one and the
 * deadline leaves room. A model's own refusal (stop_reason "refusal") is an answer, ok, and the
 * caller reads it. The calls are always made (breaker "count"): an overloaded model says nothing of the others.
 *
 * The streaming form hands back the API's event stream unread for the gateway to forward; the fallback is asked only
 * before the first byte.
 *
 * Each model is sent only what it takes (contracts MODEL_TAKES): fast mode's `speed` and its beta to a model that runs
 * it, a thinking type to a model that accepts it, an effort said in the messages and its beta to a model that takes
 * one (the request's own effort for one that does not), so a request written for one model is still an answer from its
 * fallback. And fast mode has a limit and a capacity of its own: a fast request
 * either refuses (a 429 or a 529) is asked once more of the same model at standard speed while the deadline leaves
 * room, so a turn never fails for it, and the answer says it was slowed; the model is then held at standard speed on
 * this instance for FAST_HOLD_MS (fastHeld).
 */
import {
  EFFORT_MESSAGE_BETA,
  FAST_MODE_BETA,
  MIN_MS,
  fallbackModel,
  foldEffortMessages,
  isEffortMessage,
  modelRoute,
  modelTakes,
  usageOf,
  NO_USAGE,
} from "@chanlytics/contracts";
import type { ModelPurpose, ModelSpeed, ModelUsage } from "@chanlytics/contracts";
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
  /** The speed the last try was sent at: fast only where the request asked it of a model that runs it. */
  speed: ModelSpeed;
  /** Whether fast mode refused the request (its limit's 429 or its capacity's 529): it went on at standard speed. */
  slowed: boolean;
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
  /**
   * The request without its model: system, messages, tools, output_config, … (max_tokens the route's unless named);
   * `speed: "fast"` asks for fast mode, and its beta is added for a model that runs it.
   */
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
/** Whether the API has no such model (its 404): the one refusal another model may not share. */
const modelUnknown = (a: ProviderReply): boolean => a.status === 404;

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

/** A request as one model is sent it: its body and betas, and the speed it goes at. */
interface Sent {
  body: Record<string, unknown>;
  betas: string[];
  speed: ModelSpeed;
}

/**
 * The request as `model` takes it (contracts MODEL_TAKES): fast mode only for a model that runs it, and never once it
 * was `slowed` (fast mode refused it, or the model is held), the beta with it; a thinking type only for a model that
 * accepts it, which otherwise thinks as it does by default; an effort said in the messages (contracts ai/effort.ts),
 * with its beta, only to a model that takes one, and for one that does not, the effort they ended on as the request's
 * own (foldEffortMessages): Opus 5.5's draft falls back to Sonnet 5 asked as hard. A model the registry does not list
 * is sent what it was asked.
 */
function sentFor(ask: ModelAsk, model: string, slowed: boolean): Sent {
  const takes = modelTakes(model);
  const { speed, thinking, ...asked } = ask.body;
  const fast = speed === "fast" && !slowed && (takes?.fast ?? true);
  const type = thinking && typeof thinking === "object" ? (thinking as { type?: unknown }).type : undefined;
  const thinks = thinking !== undefined && (!takes || (takes.thinking as readonly unknown[]).includes(type));
  const said = Array.isArray(asked.messages) && asked.messages.some(isEffortMessage);
  const told = said && (takes?.effortMessages ?? true);
  const body = said && !told ? foldEffortMessages(asked) : asked;
  const betas = (ask.betas ?? []).filter((b) => b !== FAST_MODE_BETA && b !== EFFORT_MESSAGE_BETA);
  return {
    body: { ...body, ...(thinks ? { thinking } : {}), ...(fast ? { speed: "fast" } : {}) },
    betas: [...betas, ...(told ? [EFFORT_MESSAGE_BETA] : []), ...(fast ? [FAST_MODE_BETA] : [])],
    speed: fast ? "fast" : "standard",
  };
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

/**
 * How long a model whose fast request was refused is asked at standard speed on this instance: the rounds after it do
 * not each pay the refusal, and its cache stays at one speed, since a cache written at one speed is not read at the
 * other. An organization without fast mode's research-preview access has a fast limit of zero tokens a minute
 * (Anthropic's 429, 15 Oct 2026): each instance then asks fast once per hold, and fast mode begins by itself once
 * access is granted, with no deploy.
 */
const FAST_HOLD_MS = 5 * MIN_MS;
/** Each model's hold, until when (this instance's clock); cleared by resetFastHolds. */
const fastHolds = new Map<string, number>();

/** Every hold lifted: for a test, which must not inherit the last test's refusal. */
export function resetFastHolds(): void {
  fastHolds.clear();
}

/** Whether `model` is held at standard speed now. */
const fastHeld = (model: string, p: Plan): boolean => (fastHolds.get(model) ?? 0) > p.d.now();

/** Whether fast mode turned a fast request down: its own limit (a 429) or its capacity (a 529). */
const fastRefused = (a: ProviderReply): boolean => a.status === 429 || a.status === 529;

/** What is left of the call's deadline, in ms; Infinity when it has none. */
const leftOf = (ask: ModelAsk, p: Plan): number =>
  ask.deadlineMs === undefined ? Infinity : ask.deadlineMs - (p.d.now() - p.started);

/** One model's tries: the route's bound (or the caller's sooner one), its retries on "not now", inside the deadline. */
function tryModel(
  key: string,
  ask: ModelAsk,
  p: Plan,
  model: string,
  sent: Sent,
  stream: boolean,
): Promise<ProviderReply> {
  const left = leftOf(ask, p);
  const timeoutMs = Math.max(1, Math.min(ask.timeoutMs ?? p.route.timeoutMs, left));
  return providerFetch(
    "anthropic",
    ANTHROPIC_MESSAGES_URL,
    {
      method: "POST",
      headers: headersFor(key, sent.betas),
      body: JSON.stringify({ max_tokens: p.route.maxTokens, ...sent.body, model, ...(stream ? { stream: true } : {}) }),
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

/** Whether another try is worth asking: the caller has not given up, and the deadline leaves it room. */
const roomFor = (ask: ModelAsk, p: Plan): boolean => !ask.signal?.aborted && leftOf(ask, p) >= FALLBACK_FLOOR_MS;

/** Whether the fallback may still be asked: there is one, and the deadline leaves it room. */
function fallbackFor(ask: ModelAsk, p: Plan, failed: ProviderReply): string | null {
  if (!(neverCame(failed) || modelUnknown(failed))) return null;
  const next = fallbackModel(ask.purpose, p.first);
  return next && roomFor(ask, p) ? next : null;
}

const failure = (a: ProviderReply): "rejected" | "unreachable" =>
  a.outcome === "refused" ? "rejected" : "unreachable";

/**
 * The tries of one call, either form: the first model (at standard speed while it is held); again at standard speed
 * when fast mode refused a fast request (a 429 or a 529), which holds the model; then the fallback when no answer came
 * or the model is unknown. What the last try was.
 */
async function triesOf(key: string, ask: ModelAsk, p: Plan, stream: boolean) {
  let model = p.first;
  let sent = sentFor(ask, model, fastHeld(model, p));
  let a = await tryModel(key, ask, p, model, sent, stream);
  let slowed = false;
  if (sent.speed === "fast" && fastRefused(a)) {
    fastHolds.set(model, p.d.now() + FAST_HOLD_MS);
    slowed = true;
    if (roomFor(ask, p)) {
      sent = sentFor(ask, model, true);
      a = await tryModel(key, ask, p, model, sent, stream);
    }
  }
  let fellBack = false;
  const next = a.outcome === "ok" ? null : fallbackFor(ask, p, a);
  if (next) {
    model = next;
    fellBack = true;
    sent = sentFor(ask, model, fastHeld(model, p));
    a = await tryModel(key, ask, p, model, sent, stream);
  }
  return { a, model, base: { asked: p.first, fellBack, status: a.status, speed: sent.speed, slowed } };
}

/** One answer from the model the purpose names, or its fallback; never thrown. */
export async function askModel(key: string, ask: ModelAsk, deps: ModelDeps = {}): Promise<ModelReply> {
  const { a, model, base } = await triesOf(key, ask, planOf(ask, deps), false);
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
  const { a, model, base } = await triesOf(key, ask, planOf(ask, deps), true);
  if (a.outcome === "ok" && a.body) return { ...base, model, outcome: "ok", body: a.body, headers: a.headers };
  return { ...base, model, outcome: failure(a), error: errorOf(a), detail: a.text.slice(0, 300) };
}
