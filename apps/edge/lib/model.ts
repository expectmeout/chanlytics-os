/**
 * One call to a model for an answer in a JSON shape: the transport every small read of the platform shares (the note
 * sweep's suggestion, the reach-out check's writer and reader). The rules each answer is held to are contracts'; this
 * asks, and says what came back.
 *
 *   - no key: nothing is asked, and the answer is null ("no model to ask");
 *   - the answer is asked for in its schema (output_config); an API that refuses the request's format, not its
 *     content, is asked again once for plain JSON, with the hint the caller gives;
 *   - a refusal or an answer cut at its token cap is no answer (null inside), never half of one;
 *   - each call keeps to the caller's deadline: an AbortSignal, a timeout, and the retries it allows. A call that runs
 *     past it throws, and the caller counts it.
 */
import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";

/** What one call answered, with what it cost. */
export interface JsonAnswer {
  answer: unknown;
  tokens: { input: number; output: number };
}

export interface JsonAsk {
  model: string;
  system: string;
  user: string;
  schema: object;
  maxTokens: number;
  /** Added to the system prompt when the API refuses the schema and the answer is asked for as plain JSON. */
  plainJsonHint: string;
  /** The call's deadline: how long it may take, the retries it may make, and a signal that ends it sooner. */
  timeoutMs: number;
  maxRetries: number;
  signal?: AbortSignal;
}

interface MessagesClient {
  messages: {
    create(
      body: unknown,
      options?: { signal?: AbortSignal; timeout?: number; maxRetries?: number },
    ): Promise<{
      content: Array<{ type: string; text?: string }>;
      stop_reason?: string | null;
      usage?: { input_tokens: number; output_tokens: number };
    }>;
  };
}

let client: MessagesClient | null = null;
let override: MessagesClient | null = null;

/** For tests: the client every call uses until reset (null). */
export function setModelClient(c: MessagesClient | null): void {
  override = c;
}

function anthropic(): MessagesClient {
  if (override) return override;
  // Built on first use: the sweeps that ride with this module must run on a deployment without a key.
  if (!client) client = new Anthropic({ maxRetries: 0 }) as unknown as MessagesClient;
  return client;
}

/** The API refused the request's format, not its content. */
function formatRejected(e: unknown): boolean {
  const err = e as { status?: number; message?: string } | null;
  return err?.status === 400 && /output_config|output_format|json_schema|schema|format/i.test(err.message ?? "");
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

/** One answer in the shape asked; null when there is no model to ask. */
export async function askJson(a: JsonAsk): Promise<JsonAnswer | null> {
  if (!env.ANTHROPIC_API_KEY) return null;
  const c = anthropic();
  const options = {
    timeout: a.timeoutMs,
    maxRetries: a.maxRetries,
    ...(a.signal ? { signal: a.signal } : {}),
  };
  const base = {
    model: a.model,
    max_tokens: a.maxTokens,
    system: a.system,
    messages: [{ role: "user", content: a.user }],
  };
  let res;
  try {
    res = await c.messages.create(
      { ...base, output_config: { format: { type: "json_schema", schema: a.schema } } },
      options,
    );
  } catch (e) {
    if (!formatRejected(e)) throw e;
    res = await c.messages.create({ ...base, system: `${a.system}\n${a.plainJsonHint}` }, options);
  }
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
  const answer = res.stop_reason === "refusal" || res.stop_reason === "max_tokens" ? null : firstJson(text);
  return { answer, tokens: { input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0 } };
}
