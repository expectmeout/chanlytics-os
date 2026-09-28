/**
 * Retell voice adapter (Blueprint P2) — the second channel, mirroring the
 * WhatsApp adapter's shape: normalize provider payloads into a canonical
 * object, expose provider I/O, own provider-specific crypto. No persistence,
 * no decisions, no tenant facts: config is passed in.
 *
 * Field names verified against the LIVE Retell account (2026-08-27).
 */
import type { SchemaSet } from "@chanlytics/contracts";
import crypto from "node:crypto";
import { callOutcomeWords } from "@chanlytics/contracts";

const API = "https://api.retellai.com";

export interface RetellConfig {
  apiKey: string;
}

/* ------------------------------ raw shapes ------------------------------ */

export interface RetellTranscriptTurn {
  role: string;
  content: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

export interface RetellCall {
  call_id: string;
  agent_id?: string;
  agent_name?: string;
  call_type?: string;
  direction?: string;
  from_number?: string;
  to_number?: string;
  call_status?: string;
  start_timestamp?: number;
  end_timestamp?: number;
  duration_ms?: number;
  disconnection_reason?: string;
  transcript?: string;
  transcript_object?: RetellTranscriptTurn[];
  /** Present on transcript_updated events (every turn, plus a final one):
   *  the turns so far, interleaved with tool-call items. Only the agent and
   *  user turns are speech — see liveTurns. */
  transcript_with_tool_calls?: RetellTranscriptTurn[];
  call_analysis?: {
    call_summary?: string;
    user_sentiment?: string;
    call_successful?: boolean;
    in_voicemail?: boolean;
    custom_analysis_data?: unknown;
  };
  recording_url?: string;
  recording_multi_channel_url?: string;
  public_log_url?: string;
  call_cost?: unknown;
  latency?: unknown;
  telephony_identifier?: unknown;
}

/* ------------------------------ normalized ------------------------------ */

export interface NormalizedCall {
  retellCallId: string;
  agentId: string | null;
  direction: "inbound" | "outbound";
  callType: string | null;
  /** E.164 when the caller id is present and dialable. */
  fromE164: string | null;
  /** Whatever the provider sent, verbatim (withheld ids, SIP URIs, "web_call"). */
  fromRaw: string | null;
  toE164: string | null;
  /** Retell's own lifecycle. not_connected: the dial never connected — it
   *  is recorded as an attempt, never counted as a call. */
  status: SchemaSet<"calls.status">;
  startedAtIso: string | null;
  endedAtIso: string | null;
  durationMs: number | null;
  disconnectionReason: string | null;
  sentiment: string | null;
  callSuccessful: boolean | null;
  inVoicemail: boolean | null;
  summary: string | null;
  transcript: string | null;
  transcriptObject: RetellTranscriptTurn[] | null;
  recordingUrl: string | null;
  publicLogUrl: string | null;
  cost: unknown;
  latency: unknown;
  /** The agent's post-call analysis answers (custom_analysis_data), when the
   *  provider sent an object: the CALL_ANALYSIS_FIELDS answers (voice-shell.ts). */
  analysis: Record<string, unknown> | null;
}

const E164 = /^\+[1-9]\d{6,14}$/;

function plainObject(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function toStatus(s: string | undefined): NormalizedCall["status"] {
  switch (s) {
    case "registered":
      return "registered";
    case "ongoing":
      return "ongoing";
    case "error":
      return "error";
    case "not_connected":
      return "not_connected";
    default:
      return "ended";
  }
}

/**
 * The spoken turns of a LIVE transcript, in the stored turn shape.
 *
 * `transcript_with_tool_calls` interleaves speech with tool invocations and
 * results; the dashboard renders speakers, so tool turns are dropped. An
 * "injected" turn is KEPT: it is a whisper — the owner's words handed to the
 * agent mid-call — and the transcript should show where it landed and
 * whether the agent acted on it. Null when there is nothing spoken yet, so
 * the upsert's coalesce keeps whatever the row already holds.
 */
export function liveTurns(items: RetellCall["transcript_with_tool_calls"]): RetellTranscriptTurn[] | null {
  if (!items?.length) return null;
  const spoken = items.filter((t) => t.role === "agent" || t.role === "user" || t.role === "injected");
  if (!spoken.length) return null;
  return spoken.map(({ role, content, words }) => ({ role, content: content ?? "", ...(words ? { words } : {}) }));
}

/**
 * Turns from the plain transcript text — "Agent: …" / "User: …", one per
 * line, the shape of Retell's `transcript` string. A last resort for a
 * delivery that carries the words and none of the structured fields; a
 * line that names no speaker continues the turn before it.
 */
export function parseTranscriptText(text: string | null | undefined): RetellTranscriptTurn[] | null {
  if (!text) return null;
  const turns: RetellTranscriptTurn[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = /^(Agent|User):\s*(.*)$/.exec(line);
    if (!m) {
      if (turns.length) turns[turns.length - 1].content += ` ${line}`;
      continue;
    }
    turns.push({ role: m[1] === "Agent" ? "agent" : "user", content: m[2] });
  }
  return turns.length ? turns : null;
}

export function normalizeCall(c: RetellCall): NormalizedCall {
  const analysis = c.call_analysis ?? {};
  const from = c.from_number ?? null;
  const computedDuration =
    c.duration_ms ?? (c.start_timestamp && c.end_timestamp ? c.end_timestamp - c.start_timestamp : null);
  return {
    retellCallId: c.call_id,
    agentId: c.agent_id ?? null,
    direction: c.direction === "outbound" ? "outbound" : "inbound",
    callType: c.call_type ?? null,
    fromE164: from && E164.test(from) ? from : null,
    fromRaw: from,
    toE164: c.to_number && E164.test(c.to_number) ? c.to_number : null,
    status: toStatus(c.call_status),
    startedAtIso: c.start_timestamp ? new Date(c.start_timestamp).toISOString() : null,
    endedAtIso: c.end_timestamp ? new Date(c.end_timestamp).toISOString() : null,
    durationMs: computedDuration ?? null,
    disconnectionReason: c.disconnection_reason ?? null,
    sentiment: analysis.user_sentiment ?? null,
    callSuccessful: analysis.call_successful ?? null,
    inVoicemail: analysis.in_voicemail ?? null,
    summary: analysis.call_summary ?? null,
    transcript: c.transcript ?? null,
    transcriptObject: c.transcript_object ?? liveTurns(c.transcript_with_tool_calls),
    recordingUrl: c.recording_url ?? null,
    publicLogUrl: c.public_log_url ?? null,
    cost: c.call_cost ?? null,
    latency: c.latency ?? null,
    analysis: plainObject(analysis.custom_analysis_data),
  };
}

/** The one-line note a call leaves in the customer's cross-channel thread. */
export function callSummaryLine(n: NormalizedCall): string {
  const mins = n.durationMs ? Math.max(1, Math.round(n.durationMs / 60000)) : null;
  const head = n.direction === "inbound" ? "Inbound call" : "Outbound call";
  const dur = mins ? ` · ${mins} min` : "";
  // What the caller wanted, in the analysis's plain words, is the note the
  // WhatsApp receptionist reads back; the provider's summary is the fallback.
  const wanted = typeof n.analysis?.caller_wanted === "string" ? n.analysis.caller_wanted.trim() : "";
  const outcome = wanted ? callOutcomeWords(n.analysis?.outcome) : null;
  const body = wanted || n.summary?.trim() || (n.inVoicemail ? "Reached voicemail." : "No summary available.");
  return `${head}${dur} — ${body}${outcome ? ` (${outcome.toLowerCase()})` : ""}`;
}

/* -------------------------------- provider I/O ------------------------------- */

export interface ListCallsPage {
  calls: RetellCall[];
  /** Pass back as paginationKey to continue; null when exhausted. */
  nextKey: string | null;
  total: number | null;
}

/**
 * History read via **v3** — /v2/list-calls is deprecated and Retell flags
 * accounts still calling it. ALWAYS filter by agent: one account hosts many
 * agents (the live account holds 432 calls across 8, only 4 this tenant's), so
 * an unfiltered import would cross tenants.
 *
 * Verified live: v3 returns {items, has_more, pagination_key, total} and OMITS
 * transcript/transcript_object (hydrate via getCall) while still including
 * recording_url, call_analysis, duration_ms and the phone numbers.
 */
export async function listCalls(
  cfg: RetellConfig,
  opts: {
    agentId: string;
    limit?: number;
    paginationKey?: string;
    ascending?: boolean;
    includeTotal?: boolean;
  },
): Promise<ListCallsPage> {
  const limit = Math.min(opts.limit ?? 100, 1000);
  const body: Record<string, unknown> = {
    limit,
    sort_order: opts.ascending ? "ascending" : "descending",
    filter_criteria: { agent: [{ agent_id: opts.agentId }] }, // documented nested shape
    ...(opts.paginationKey ? { pagination_key: opts.paginationKey } : {}),
    ...(opts.includeTotal ? { include_total: true } : {}),
  };
  const r = await fetch(`${API}/v3/list-calls`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`list-calls ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const out = (await r.json()) as {
    items?: RetellCall[];
    has_more?: boolean;
    pagination_key?: string;
    total?: number;
  };
  const calls = out.items ?? [];
  return {
    calls,
    nextKey: out.has_more ? (out.pagination_key ?? null) : null,
    total: typeof out.total === "number" ? out.total : null,
  };
}

/** Full call detail — the only source of transcript/transcript_object. */
export async function getCall(cfg: RetellConfig, callId: string): Promise<RetellCall | null> {
  const r = await fetch(`${API}/v2/get-call/${callId}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  });
  if (!r.ok) return null;
  return (await r.json()) as RetellCall;
}

/** The agent settings that decide what the call pipeline can show. */
export interface RetellAgentConfig {
  agent_id: string;
  agent_name: string | null;
  version: number | null;
  is_published: boolean | null;
  /** The Retell LLM behind the agent, at the version the agent points at —
   *  what a diagnostic reads to say whether the line runs the product's shell. */
  llm_id: string | null;
  llm_version: number | null;
  webhook_url: string | null;
  /** Whether the live URL still carries the retired `?key=`: the converger plans it away (voice-shell planAgentSettings). */
  webhook_url_keyed: boolean;
  /** Absent means Retell's default: call_started, call_ended, call_analyzed.
   *  transcript_updated (live transcript) is opt-in. */
  webhook_events: string[] | null;
  webhook_timeout_ms: number | null;
  data_storage_setting: string | null;
  /** Days the provider keeps a call; null = forever. */
  data_storage_retention_days: number | null;
  opt_in_signed_url: boolean | null;
  /** The post-call analysis schema on the agent, as stored; the planner
   *  checks ours are on it (voice-shell.ts CALL_ANALYSIS_FIELDS). */
  post_call_analysis_data: unknown[] | null;
}

/** GET /get-agent — the fields above, read-only. Null when the provider says no. */
export async function getAgent(cfg: RetellConfig, agentId: string): Promise<RetellAgentConfig | null> {
  const r = await fetch(`${API}/get-agent/${agentId}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  });
  if (!r.ok) return null;
  const a = (await r.json()) as Record<string, unknown>;
  const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : null);
  const num = (k: string) => (typeof a[k] === "number" ? (a[k] as number) : null);
  const bool = (k: string) => (typeof a[k] === "boolean" ? (a[k] as boolean) : null);
  const engine = (a.response_engine ?? {}) as Record<string, unknown>;
  return {
    agent_id: str("agent_id") ?? agentId,
    agent_name: str("agent_name"),
    version: num("version"),
    is_published: bool("is_published"),
    llm_id: engine.type === "retell-llm" && typeof engine.llm_id === "string" ? engine.llm_id : null,
    llm_version: typeof engine.version === "number" ? engine.version : null,
    // The URL only, never its query string: Retell lets a secret ride there
    // (?key=...) and this object is meant to be printed by a diagnostic. That
    // a key rides there at all is kept as a fact, so the planner can retire it.
    webhook_url: str("webhook_url")?.split("?")[0] ?? null,
    webhook_url_keyed: /[?&]key=/.test(str("webhook_url") ?? ""),
    webhook_events: Array.isArray(a.webhook_events) ? (a.webhook_events as unknown[]).map(String) : null,
    webhook_timeout_ms: num("webhook_timeout_ms"),
    data_storage_setting: str("data_storage_setting"),
    data_storage_retention_days: num("data_storage_retention_days"),
    opt_in_signed_url: bool("opt_in_signed_url"),
    post_call_analysis_data: Array.isArray(a.post_call_analysis_data) ? (a.post_call_analysis_data as unknown[]) : null,
  };
}

/**
 * GET /get-agent, the whole object — for the converge endpoint, which must
 * carry every field back to the provider. Never printed by a diagnostic:
 * the webhook URL may carry a secret in its query string.
 */
export async function getAgentRaw(cfg: RetellConfig, agentId: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(`${API}/get-agent/${agentId}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return null;
  const a = (await r.json()) as unknown;
  return a !== null && typeof a === "object" && !Array.isArray(a) ? (a as Record<string, unknown>) : null;
}

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
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  const text = await r.text();
  let body: Record<string, unknown> | null;
  try {
    const parsed = JSON.parse(text) as unknown;
    body = parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    body = text ? { text: text.slice(0, 300) } : null;
  }
  return { ok: r.ok, status: r.status, body };
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

/** POST /import-phone-number — a number from an elastic SIP trunk, bound like Retell's own (lines-saga.ts builds the body). */
export function importPhoneNumber(cfg: RetellConfig, body: Record<string, unknown>): Promise<RetellWrite> {
  return writeRetell(cfg, "POST", "/import-phone-number", body);
}

/**
 * DELETE /delete-phone-number — an imported number taken off Retell (a line released: the carrier has it back, and
 * Retell must stop answering for a number that may be somebody else's next month). Gone already (404) is gone.
 */
export async function deletePhoneNumber(cfg: RetellConfig, number: string): Promise<{ ok: boolean; status: number }> {
  const r = await fetch(`${API}/delete-phone-number/${encodeURIComponent(number)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(8000),
  });
  await r.body?.cancel().catch(() => undefined);
  return { ok: r.ok || r.status === 404, status: r.status };
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
  const r = await fetch(`${API}/get-phone-number/${encodeURIComponent(number)}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return null;
  const n = (await r.json()) as unknown;
  return n !== null && typeof n === "object" && !Array.isArray(n) ? (n as Record<string, unknown>) : null;
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
  const r = await fetch(`${API}/v2/update-live-call/${encodeURIComponent(callId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(control.variables ? { fields_to_override: { override_dynamic_variables: control.variables } } : {}),
      call_control: {
        additional_context: control.additionalContext,
        ...(control.triggerResponse !== undefined ? { trigger_response: control.triggerResponse } : {}),
      },
    }),
    signal: AbortSignal.timeout(8000),
  });
  return { ok: r.ok, status: r.status };
}

/**
 * POST /v2/stop-call — end a hosted agent's ongoing call. 204 from the
 * provider; returned as a status like updateLiveCall, so a call that ended a
 * moment ago is a sentence in a route, not an exception.
 */
export async function stopCall(cfg: RetellConfig, callId: string): Promise<{ ok: boolean; status: number }> {
  const r = await fetch(`${API}/v2/stop-call/${encodeURIComponent(callId)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(8000),
  });
  return { ok: r.ok, status: r.status };
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

/** GET /get-retell-llm at a version. Null when the provider says no. */
export async function getRetellLlm(
  cfg: RetellConfig,
  llmId: string,
  version?: number | null,
): Promise<RetellLlmConfig | null> {
  const q = version === undefined || version === null ? "" : `?version=${version}`;
  const r = await fetch(`${API}/get-retell-llm/${llmId}${q}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  });
  if (!r.ok) return null;
  const l = (await r.json()) as Record<string, unknown>;
  const str = (k: string) => (typeof l[k] === "string" ? (l[k] as string) : null);
  return {
    llm_id: str("llm_id") ?? llmId,
    version: typeof l.version === "number" ? l.version : null,
    model: str("model"),
    model_temperature: typeof l.model_temperature === "number" ? l.model_temperature : null,
    general_prompt: str("general_prompt"),
    begin_message: str("begin_message"),
    default_dynamic_variables:
      l.default_dynamic_variables && typeof l.default_dynamic_variables === "object"
        ? (l.default_dynamic_variables as Record<string, string>)
        : null,
    general_tools: Array.isArray(l.general_tools)
      ? (l.general_tools as Array<Record<string, unknown> & { type: string; name: string }>)
      : null,
    knowledge_base_ids: Array.isArray(l.knowledge_base_ids) ? (l.knowledge_base_ids as unknown[]).map(String) : null,
  };
}

/** True when a v3 list row still needs a getCall to be complete. */
export function needsHydration(c: RetellCall): boolean {
  return !c.transcript && !c.transcript_object;
}

/**
 * Recording bytes. Retell serves these from an UNSIGNED public CDN URL
 * (verified: HEAD 200 with no auth) — so we copy customer audio into private
 * storage rather than leaving it one guessed link away.
 */
export type RecordingFetch = { ok: true; bytes: ArrayBuffer; mime: string | null } | { ok: false; status: number };

export async function fetchRecording(url: string, opts: { timeoutMs?: number } = {}): Promise<RecordingFetch> {
  // A bounded wait: the webhook that calls this has the agent's delivery
  // timeout over its head, and an unbounded fetch inside it earns a retry of
  // the whole event. A timeout REJECTS; a non-2xx returns its status, so the
  // caller can tell a recording the CDN has not published yet (try again)
  // from one the provider refuses (give up).
  const signal = opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined;
  const r = await fetch(url, signal ? { signal } : undefined);
  if (!r.ok) return { ok: false, status: r.status };
  return { ok: true, bytes: await r.arrayBuffer(), mime: r.headers.get("content-type") };
}

/* --------------------------------- crypto -------------------------------- */

/** Retell webhook signature: `v={ts},d={hmac}` over rawBody+ts, keyed by the API key. */
export function verifyRetellSignature(
  rawBody: string,
  header: string | null | undefined,
  apiKey: string | undefined,
): boolean {
  if (!header || !apiKey) return false;
  const m = /v=(\d+),d=([0-9a-f]+)/i.exec(String(header));
  if (!m) return false;
  const [, ts, digest] = m;
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1000) return false;
  const expected = crypto
    .createHmac("sha256", apiKey)
    .update(rawBody + ts)
    .digest("hex");
  const a = Buffer.from(digest.toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
