/**
 * The second model port: TypeSafe's System One (Jev), asked in shadow (scorecard move 10, step 12; decision 0023).
 *
 * One adapter over providerFetch (provider `typesafe`): `POST https://api.typesafe.ai/v1/systemone` with the bearer key,
 * the pinned model and the named questions (contracts ai/system-one.ts holds the shapes), and one outcome back. Every
 * call has a bound (the shadow's SHADOW_TIMEOUT_MS unless the caller names a sooner one) and is asked once: a second
 * opinion is never worth a retry, and an open breaker means a dead provider costs the next call nothing.
 *
 * What a call comes to:
 *   ok           the API answered and its answers read: the answers by question name, the model that answered (the
 *                versioned id) and the input tokens it counted (output is free).
 *   rejected     the API refused the request itself: a 401 (the key), a 422 (the body) or any other refusal.
 *   throttled    a 429: not now.
 *   unavailable  a 529 (overloaded), a 5xx, a timeout, a dropped connection, an open breaker, or an answer that is not
 *                the shape asked for.
 *
 * The key is a header and nowhere else: nothing here logs, and an error's words are scrubbed of it before they leave.
 */
import {
  SHADOW_TIMEOUT_MS,
  SYSTEM_ONE_MODEL,
  parseSystemOneResponse,
  type SystemOneAnswer,
  type SystemOneQuestion,
  type SystemOneRequest,
} from "@chanlytics/contracts";
import { answerObject, providerFetch, type ProviderReply } from "../provider-fetch";
import type { ModelDeps } from "./anthropic";

export const SYSTEM_ONE_URL = "https://api.typesafe.ai/v1/systemone";

export type SystemOneReply =
  | { outcome: "ok"; model: string; answers: Record<string, SystemOneAnswer>; inputTokens: number }
  | { outcome: "rejected" | "throttled" | "unavailable"; status: number; error: string };

export interface SystemOneAsk {
  state: string;
  questions: Record<string, SystemOneQuestion>;
  /** A sooner bound than the shadow's own. */
  timeoutMs?: number;
  /** The caller's own end: an abandoned call is a timeout. */
  signal?: AbortSignal;
}

/** Words with the key taken out, and cut short: an error's text never carries the credential it was made with. */
function scrubbed(text: string, key: string): string {
  return (key ? text.split(key).join("[key]") : text).slice(0, 200);
}

/** The API's own explanation of a refusal, or the network's words. */
function errorOf(a: ProviderReply, key: string): string {
  const j = answerObject(a);
  const detail = j && typeof j.detail === "string" ? j.detail : null;
  const nested = j && j.error && typeof j.error === "object" ? (j.error as { message?: unknown }).message : null;
  const message =
    detail ?? (typeof nested === "string" ? nested : null) ?? (typeof j?.error === "string" ? j.error : null);
  return scrubbed(message ?? a.error ?? `status ${a.status}`, key);
}

/** How a provider outcome is said: a 4xx is the API's no, a 429 is not now, everything else is no answer. */
function failureOf(a: ProviderReply): "rejected" | "throttled" | "unavailable" {
  if (a.outcome === "refused") return "rejected";
  if (a.status === 429) return "throttled";
  return "unavailable";
}

/** One System One call; never thrown. */
export async function askSystemOne(key: string, ask: SystemOneAsk, deps: ModelDeps = {}): Promise<SystemOneReply> {
  const request: SystemOneRequest = { state: ask.state, model: SYSTEM_ONE_MODEL, questions: ask.questions };
  const a = await providerFetch(
    "typesafe",
    SYSTEM_ONE_URL,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(request),
      timeoutMs: ask.timeoutMs ?? SHADOW_TIMEOUT_MS,
      tries: 1,
      ...(ask.signal ? { signal: ask.signal } : {}),
    },
    deps,
  );
  if (a.outcome !== "ok") return { outcome: failureOf(a), status: a.status, error: errorOf(a, key) };
  const read = parseSystemOneResponse(a.json);
  if (!read.ok)
    return { outcome: "unavailable", status: a.status, error: scrubbed(`unreadable answer: ${read.error}`, key) };
  return {
    outcome: "ok",
    model: read.value.model,
    answers: read.value.answers,
    inputTokens: read.value.usage.input_tokens,
  };
}
