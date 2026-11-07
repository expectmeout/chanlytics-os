/** Retell: agents. */

import crypto from "node:crypto";
import { answerObject } from "../../shared/provider-fetch";
import { answered, retell, type RetellConfig } from "./calls";

export { MISSED_CALL_LINE } from "@chanlytics/contracts";

/** What a provider write answered: the status and the body, never an exception in a route. */
export interface RetellWrite {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
}

async function writeRetell(
  cfg: RetellConfig,
  method: "POST" | "PATCH",
  path: string,
  payload: unknown,
): Promise<RetellWrite> {
  const r = answered(await retell(cfg, method, path, { body: payload }), path);
  const body = answerObject(r) ?? (r.json === null && r.text ? { text: r.text.slice(0, 300) } : null);
  return { ok: r.outcome === "ok", status: r.status, body };
}

/** POST /create-agent-version — a new draft from a version; a published version cannot change. */
export function createAgentVersion(cfg: RetellConfig, agentId: string, baseVersion: number): Promise<RetellWrite> {
  return writeRetell(cfg, "POST", `/create-agent-version/${agentId}`, { base_version: baseVersion });
}

/** PATCH /update-agent — the latest (draft) version takes the patch. */
export function updateAgent(cfg: RetellConfig, agentId: string, patch: Record<string, unknown>): Promise<RetellWrite> {
  return writeRetell(cfg, "PATCH", `/update-agent/${agentId}`, patch);
}

/** POST /publish-agent-version — a number pinned to latest_published follows it. */
export function publishAgentVersion(
  cfg: RetellConfig,
  agentId: string,
  version: number,
  title: string,
): Promise<RetellWrite> {
  return writeRetell(cfg, "POST", `/publish-agent-version/${agentId}`, { version, version_title: title });
}

/* ------------------------------ web calls ------------------------------ */

/** Its body and its answer's shape are voice/web-call.ts's (webCallBody, webCallMadeOf). */
/** POST /v3/create-web-call — a call a browser joins with the token it answers; nothing is dialed. */
export function createWebCall(cfg: RetellConfig, body: Record<string, unknown>): Promise<RetellWrite> {
  return writeRetell(cfg, "POST", "/v3/create-web-call", body);
}

/* ------------------------------ provisioning ------------------------------ */

/** POST /create-retell-llm — the shell as a new LLM (voice-provision.ts builds the body). */
export function createRetellLlm(cfg: RetellConfig, body: Record<string, unknown>): Promise<RetellWrite> {
  return writeRetell(cfg, "POST", "/create-retell-llm", body);
}

/** POST /create-agent — an agent over a Retell LLM, with the product's voice and webhook. */
export function createAgent(cfg: RetellConfig, body: Record<string, unknown>): Promise<RetellWrite> {
  return writeRetell(cfg, "POST", "/create-agent", body);
}

/** POST /create-phone-number — BUYS a number in an area code; it costs money every month. */
export function createPhoneNumber(cfg: RetellConfig, body: Record<string, unknown>): Promise<RetellWrite> {
  return writeRetell(cfg, "POST", "/create-phone-number", body);
}

/** POST /import-phone-number — a number from an elastic SIP trunk, bound like Retell's own (lines/saga.ts builds the body). */
export function importPhoneNumber(cfg: RetellConfig, body: Record<string, unknown>): Promise<RetellWrite> {
  return writeRetell(cfg, "POST", "/import-phone-number", body);
}

/**
 * DELETE /delete-phone-number — an imported number taken off Retell (a line released: the carrier has it back, and
 * Retell must stop answering for a number that may be somebody else's next month). Gone already (404) is gone.
 */
export async function deletePhoneNumber(cfg: RetellConfig, number: string): Promise<{ ok: boolean; status: number }> {
  const r = answered(
    await retell(cfg, "DELETE", `/delete-phone-number/${encodeURIComponent(number)}`),
    "delete-phone-number",
  );
  return { ok: r.outcome === "ok" || r.status === 404, status: r.status };
}

/**
 * DELETE /delete-agent — an agent taken off Retell, every version of it (a lead's preview ended, decision 0079: its
 * workspace is erased, and nothing answers in its agent again). Gone already (404) is gone.
 */
export async function deleteAgent(cfg: RetellConfig, agentId: string): Promise<{ ok: boolean; status: number }> {
  const r = answered(await retell(cfg, "DELETE", `/delete-agent/${encodeURIComponent(agentId)}`), "delete-agent");
  return { ok: r.outcome === "ok" || r.status === 404, status: r.status };
}

/** DELETE /delete-retell-llm — the LLM an agent was over, taken off Retell with it. Gone already (404) is gone. */
export async function deleteRetellLlm(cfg: RetellConfig, llmId: string): Promise<{ ok: boolean; status: number }> {
  const r = answered(
    await retell(cfg, "DELETE", `/delete-retell-llm/${encodeURIComponent(llmId)}`),
    "delete-retell-llm",
  );
  return { ok: r.outcome === "ok" || r.status === 404, status: r.status };
}

/** PATCH /update-phone-number — the agents on a number, its inbound webhook, its nickname. */
export function updatePhoneNumber(
  cfg: RetellConfig,
  number: string,
  patch: Record<string, unknown>,
): Promise<RetellWrite> {
  return writeRetell(cfg, "PATCH", `/update-phone-number/${encodeURIComponent(number)}`, patch);
}

/** GET /get-phone-number — the number as stored; null when the provider says no. Never printed whole: the inbound webhook URL carries a key. */
export async function getPhoneNumber(cfg: RetellConfig, number: string): Promise<Record<string, unknown> | null> {
  const r = answered(await retell(cfg, "GET", `/get-phone-number/${encodeURIComponent(number)}`), "get-phone-number");
  return r.outcome === "ok" ? answerObject(r) : null;
}

/** What an operator says to the agent mid-call, heard by the agent alone. */
export interface LiveCallControl {
  /** Free text, injected into the transcript as "injected" and worked into the next answer. */
  additionalContext: string;
  /** Interrupt the agent (or nudge a silent one) to answer with it now. */
  triggerResponse?: boolean;
  /** Dynamic variables overridden on the running call, the delta only: the hand-over's line. */
  variables?: Record<string, string>;
}

/**
 * PATCH /v2/update-live-call — what Retell offers over a hosted agent's
 * ongoing call by API, with stop-call below: a sentence into it and a nudge,
 * its variables, and an end. Listening to the audio and a person joining
 * from a microphone are its own dashboard's, not the API's. Returns the
 * status instead of throwing; a whisper into a call that has just ended is a
 * 4xx the caller reports in a sentence, not an exception in a route.
 */
export async function updateLiveCall(
  cfg: RetellConfig,
  callId: string,
  control: LiveCallControl,
): Promise<{ ok: boolean; status: number }> {
  const item = answered(
    await retell(cfg, "PATCH", `/v2/update-live-call/${encodeURIComponent(callId)}`, {
      body: {
        ...(control.variables ? { fields_to_override: { override_dynamic_variables: control.variables } } : {}),
        call_control: {
          additional_context: control.additionalContext,
          ...(control.triggerResponse !== undefined ? { trigger_response: control.triggerResponse } : {}),
        },
      },
    }),
    "update-live-call",
  );
  return { ok: item.outcome === "ok", status: item.status };
}

/**
 * POST /v2/stop-call — end a hosted agent's ongoing call. 204 from the
 * provider; returned as a status like updateLiveCall, so a call that ended a
 * moment ago is a sentence in a route, not an exception.
 */
export async function stopCall(cfg: RetellConfig, callId: string): Promise<{ ok: boolean; status: number }> {
  const r = answered(await retell(cfg, "POST", `/v2/stop-call/${encodeURIComponent(callId)}`), "stop-call");
  return { ok: r.outcome === "ok", status: r.status };
}

/**
 * POST /v2/create-phone-call — a call placed from a number the account holds, answered on the other end by whatever
 * answers that number. Only the platform's canary places one (lib/voice/watch/voice-canary.ts): a scripted caller ringing a
 * workspace of ours, so the whole road a customer's call takes is walked once a day. The receptionist never calls a
 * customer (decision 0038 is not built).
 */
export function createPhoneCall(
  cfg: RetellConfig,
  body: { from_number: string; to_number: string; override_agent_id?: string; metadata?: Record<string, unknown> },
): Promise<RetellWrite> {
  return writeRetell(cfg, "POST", "/v2/create-phone-call", body);
}

/**
 * DELETE /v2/delete-call — the provider's copy of one call (its audio, transcript and log) taken off it: the erasure's
 * last leg (decision 0036), since our own rows going leaves what the provider keeps until its retention. Gone already
 * (404) is gone.
 */
export async function deleteCall(cfg: RetellConfig, callId: string): Promise<{ ok: boolean; status: number }> {
  const r = answered(await retell(cfg, "DELETE", `/v2/delete-call/${encodeURIComponent(callId)}`), "delete-call");
  return { ok: r.outcome === "ok" || r.status === 404, status: r.status };
}

/** How many calls the account is on now and how many it may hold at once, as the provider says; null fields it did not. */
export interface RetellConcurrency {
  current: number | null;
  limit: number | null;
}

/**
 * GET /get-concurrency — one account serves every workspace's line, so its limit is everybody's: a busy workspace can
 * fill it and leave the other lines answering busy (concurrency_limit_reached). The health sweep reads it
 * (lib/voice/watch/voice-watch.ts). Null when the provider gave no answer it could read; never throws on a refusal.
 */
export async function getConcurrency(cfg: RetellConfig): Promise<RetellConcurrency | null> {
  const r = await retell(cfg, "GET", "/get-concurrency");
  if (r.status === 0 || r.outcome !== "ok") return null;
  const o = answerObject(r);
  if (!o) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { current: num(o.current_concurrency), limit: num(o.concurrency_limit) };
}

/** The fields of a Retell LLM the shell is defined over. */
export interface RetellLlmConfig {
  llm_id: string;
  version: number | null;
  /** The text model behind the shell, and its temperature — provisioning parity, readable by the diagnostic. */
  model: string | null;
  model_temperature: number | null;
  general_prompt: string | null;
  begin_message: string | null;
  default_dynamic_variables: Record<string, string> | null;
  /** Retell's tool objects as stored — the booking tool carries a secret header. */
  general_tools: Array<Record<string, unknown> & { type: string; name: string }> | null;
  knowledge_base_ids: string[] | null;
}

/**
 * PATCH /update-retell-llm — the shell's own fields on an LLM (planVoiceConvergence's `llmPatch`): the edge's converger,
 * so the provider key never leaves the edge (lib/voice/converge.ts, `shell: true`).
 */
export function updateRetellLlm(
  cfg: RetellConfig,
  llmId: string,
  patch: Record<string, unknown>,
): Promise<RetellWrite> {
  return writeRetell(cfg, "PATCH", `/update-retell-llm/${encodeURIComponent(llmId)}`, patch);
}

/** GET /get-retell-llm at a version. Null when the provider says no. */
export async function getRetellLlm(
  cfg: RetellConfig,
  llmId: string,
  version?: number | null,
): Promise<RetellLlmConfig | null> {
  const query = version === undefined || version === null ? "" : `?version=${version}`;
  const answer = answered(await retell(cfg, "GET", `/get-retell-llm/${llmId}${query}`), "get-retell-llm");
  const result = answerObject(answer);
  if (answer.outcome !== "ok" || !result) return null;
  const str = (k: string) => (typeof result[k] === "string" ? result[k] : null);
  return {
    llm_id: str("llm_id") ?? llmId,
    version: typeof result.version === "number" ? result.version : null,
    model: str("model"),
    model_temperature: typeof result.model_temperature === "number" ? result.model_temperature : null,
    general_prompt: str("general_prompt"),
    begin_message: str("begin_message"),
    default_dynamic_variables:
      result.default_dynamic_variables && typeof result.default_dynamic_variables === "object"
        ? (result.default_dynamic_variables as Record<string, string>)
        : null,
    general_tools: Array.isArray(result.general_tools)
      ? (result.general_tools as Array<Record<string, unknown> & { type: string; name: string }>)
      : null,
    knowledge_base_ids: Array.isArray(result.knowledge_base_ids)
      ? (result.knowledge_base_ids as unknown[]).map(String)
      : null,
  };
}

/**
 * Recording bytes, by the link the provider signs for a day (opt_in_signed_url,
 * on every agent; the link was once public and permanent) — copied into private
 * storage, so the audio is ours to keep and to erase.
 */
export type RecordingFetch = { ok: true; bytes: ArrayBuffer; mime: string | null } | { ok: false; status: number };

/** A recording's download when its caller names no bound: the calls sweep's own. */
const RECORDING_TIMEOUT_MS = 20_000;

export async function fetchRecording(url: string, opts: { timeoutMs?: number } = {}): Promise<RecordingFetch> {
  // A bounded wait: the webhook that calls this has the agent's delivery
  // timeout over its head, and an unbounded fetch inside it earns a retry of
  // the whole event. A timeout REJECTS; a non-2xx returns its status, so the
  // caller can tell a recording the CDN has not published yet (try again)
  // from one the provider refuses (give up).
  // Bytes, not a provider's JSON, so not providerFetch; bounded all the same, a caller's bound or RECORDING_TIMEOUT_MS.
  const response = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? RECORDING_TIMEOUT_MS) });
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, bytes: await response.arrayBuffer(), mime: response.headers.get("content-type") };
}

/* --------------------------------- crypto -------------------------------- */

/** Retell webhook signature: `v={ts},d={hmac}` over rawBody+ts, keyed by the API key. */
export function verifyRetellSignature(
  rawBody: string,
  header: string | null | undefined,
  apiKey: string | undefined,
): boolean {
  if (!header || !apiKey) return false;
  const match = /v=(\d+),d=([0-9a-f]+)/i.exec(String(header));
  if (!match) return false;
  const [, ts = "", digest = ""] = match;
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1000) return false;
  const expected = crypto
    .createHmac("sha256", apiKey)
    .update(rawBody + ts)
    .digest("hex");
  const items = Buffer.from(digest.toLowerCase());
  const result = Buffer.from(expected);
  return items.length === result.length && crypto.timingSafeEqual(items, result);
}
