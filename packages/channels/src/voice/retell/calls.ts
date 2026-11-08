/** Retell: calls. */

import type { SchemaSet } from "@chanlytics/contracts";
import {
  callOutcomeWords,
  isE164,
  MISSED_CALL_LINE,
  UNCONNECTED_DIAL_LINE,
  listOrEmpty,
  recordOrEmpty,
} from "@chanlytics/contracts";
import { answerObject, fetchFromProvider, type ProviderReply } from "../../shared/provider-fetch";

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
  /** What the call was made with (create-web-call, or the inbound webhook's answer): stored by the provider, never read by it. */
  metadata?: Record<string, unknown>;
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
   *  provider sent an object: the CALL_ANALYSIS_FIELDS answers (voice/shell/agent-plan.ts). */
  analysis: Record<string, unknown> | null;
}

function plainObject(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? recordOrEmpty(v) : null;
}

function toStatus(text: string | undefined): NormalizedCall["status"] {
  switch (text) {
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
    const match = /^(Agent|User):\s*(.*)$/.exec(line);
    if (!match) {
      const last = turns.at(-1);
      if (last) last.content += ` ${line}`;
      continue;
    }
    turns.push({ role: match[1] === "Agent" ? "agent" : "user", content: match[2] ?? "" });
  }
  return turns.length ? turns : null;
}

export function normalizeCall(retellCall: RetellCall): NormalizedCall {
  const analysis = retellCall.call_analysis ?? {};
  const from = retellCall.from_number ?? null;
  const computedDuration =
    retellCall.duration_ms ??
    (retellCall.start_timestamp && retellCall.end_timestamp
      ? retellCall.end_timestamp - retellCall.start_timestamp
      : null);
  return {
    retellCallId: retellCall.call_id,
    agentId: retellCall.agent_id ?? null,
    direction: retellCall.direction === "outbound" ? "outbound" : "inbound",
    callType: retellCall.call_type ?? null,
    fromE164: isE164(from) ? from : null,
    fromRaw: from,
    toE164: isE164(retellCall.to_number) ? retellCall.to_number : null,
    status: toStatus(retellCall.call_status),
    startedAtIso: retellCall.start_timestamp ? new Date(retellCall.start_timestamp).toISOString() : null,
    endedAtIso: retellCall.end_timestamp ? new Date(retellCall.end_timestamp).toISOString() : null,
    durationMs: computedDuration ?? null,
    disconnectionReason: retellCall.disconnection_reason ?? null,
    sentiment: analysis.user_sentiment ?? null,
    callSuccessful: analysis.call_successful ?? null,
    inVoicemail: analysis.in_voicemail ?? null,
    summary: analysis.call_summary ?? null,
    transcript: retellCall.transcript ?? null,
    transcriptObject: retellCall.transcript_object ?? liveTurns(retellCall.transcript_with_tool_calls),
    recordingUrl: retellCall.recording_url ?? null,
    publicLogUrl: retellCall.public_log_url ?? null,
    cost: retellCall.call_cost ?? null,
    latency: retellCall.latency ?? null,
    analysis: plainObject(analysis.custom_analysis_data),
  };
}

/** The one-line note a call leaves in the customer's cross-channel thread. */
export function callSummaryLine(
  normalizedCall: Pick<NormalizedCall, "direction" | "durationMs" | "summary" | "inVoicemail" | "analysis"> & {
    status?: NormalizedCall["status"];
  },
): string {
  // A call that never connected is a missed call in the thread too, so the receptionist's memory, the next call's
  // context and the person's history all know they rang (it used to leave no line at all).
  if (normalizedCall.status === "not_connected")
    return normalizedCall.direction === "inbound" ? MISSED_CALL_LINE : UNCONNECTED_DIAL_LINE;
  const mins = normalizedCall.durationMs ? Math.max(1, Math.round(normalizedCall.durationMs / 60000)) : null;
  const head = normalizedCall.direction === "inbound" ? "Inbound call" : "Outbound call";
  const dur = mins ? ` · ${mins} min` : "";
  // What the caller wanted, in the analysis's plain words, is the note the
  // WhatsApp receptionist reads back; the provider's summary is the fallback.
  const wanted =
    typeof normalizedCall.analysis?.caller_wanted === "string" ? normalizedCall.analysis.caller_wanted.trim() : "";
  const outcome = wanted ? callOutcomeWords(normalizedCall.analysis?.outcome) : null;
  const body =
    wanted ||
    normalizedCall.summary?.trim() ||
    (normalizedCall.inVoicemail ? "Reached voicemail." : "No summary available.");
  return `${head}${dur} — ${body}${outcome ? ` (${outcome.toLowerCase()})` : ""}`;
}

/* -------------------------------- provider I/O ------------------------------- */

/**
 * Every call below leaves through providerFetch: bounded, and held by Retell's breaker when the provider is down.
 * Each keeps the contract it had: a read that could get no answer at all throws where it threw, and says so where it
 * said so (getCall).
 */
const RETELL_CALL_TIMEOUT_MS = 8_000;

/** One call to Retell with its key, as providerFetch answers it. Reads are asked twice when the first got no answer. */
export function retell(
  cfg: RetellConfig,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options: { body?: unknown; timeoutMs?: number } = {},
) {
  const read = method === "GET" || path === "/v3/list-calls";
  return fetchFromProvider("retell", `${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    timeoutMs: options.timeoutMs ?? RETELL_CALL_TIMEOUT_MS,
    ...(read ? { idempotent: true, tries: 2 } : {}),
  });
}

/** An answer that is no answer at all, thrown by name, as the bare fetch it replaces threw. */
export function answered(a: ProviderReply, text: string): ProviderReply {
  if (a.status === 0) throw new Error(a.error ?? `retell ${text}: no answer`);
  return a;
}

export interface ListCallsPage {
  calls: RetellCall[];
  /** Pass back as paginationKey to continue; null when exhausted. */
  nextKey: string | null;
  total: number | null;
}

/**
 * History read via **v3** — /v2/list-calls is deprecated and Retell flags
 * accounts still calling it. ALWAYS filter by agent: one account hosts every
 * workspace's agents, so an unfiltered import would cross tenants.
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
  const answer = answered(
    await retell(cfg, "POST", "/v3/list-calls", { body, timeoutMs: RETELL_READ_TIMEOUT_MS }),
    "list-calls",
  );
  if (answer.outcome !== "ok") throw new Error(`list-calls ${answer.status}: ${answer.text.slice(0, 200)}`);
  const out = (answerObject(answer) ?? {}) as {
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

/**
 * How long a call read waits for the provider. The calls sweep reads inside a
 * sixty-second function, twenty-five rows a tick: a read that never answered
 * used to be waited for until the platform cut the function off.
 */
const RETELL_READ_TIMEOUT_MS = 10_000;

/**
 * What a read of one call came back as. `null` once stood for every non-2xx
 * alike, and the calls sweep counted each one as a try against the recording:
 * a Retell outage, a rate limit or a revoked key marked every pending
 * recording failed within three ticks. The four answers a caller tells apart:
 *
 *   found        the call, as the provider holds it;
 *   not_found    the provider answered and has no such call -- a 404, or any
 *                other refusal of the request: asking again will not change it;
 *   unavailable  the provider could not answer just now: a 408, a 425, a 429,
 *                a 5xx, a body that is not a call, a timeout or a network
 *                error, with the wait it named when it named one; `status` is
 *                null when no answer came at all, a body that stalled included;
 *   auth         the key is refused (401, 403): every read will be, until it is fixed.
 */
export type RetellCallRead =
  | { kind: "found"; call: RetellCall }
  | { kind: "not_found"; status: number }
  | { kind: "unavailable"; status: number | null; retryAfterMs: number | null }
  | { kind: "auth"; status: number };

/**
 * Retry-After as the provider spells it: seconds, or an HTTP-date. Null when
 * absent, unreadable, or no wait at all — a zero, or a date already past,
 * which RFC 9110 reads as "retry now" and a caller must not hold a tick for.
 */
function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const h = header.trim();
  const ms = /^\d+$/.test(h) ? Number(h) * 1000 : Date.parse(h) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** A body the provider answered as a call: an object carrying the call's id. */
function isCallBody(v: unknown): v is RetellCall {
  const o = plainObject(v);
  return o !== null && typeof o.call_id === "string";
}

/**
 * Full call detail — the only source of transcript/transcript_object. Never
 * throws: the answer says what happened, so a sweep can tell a row the
 * provider has no record of from a provider that could not be asked.
 */
export async function getCall(
  cfg: RetellConfig,
  callId: string,
  opts: { timeoutMs?: number } = {},
): Promise<RetellCallRead> {
  // One try: the calls sweep reads twenty-five rows a tick, and asks again next tick.
  const response = await fetchFromProvider("retell", `${API}/v2/get-call/${callId}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    timeoutMs: opts.timeoutMs ?? RETELL_READ_TIMEOUT_MS,
  });
  // A timeout, a refused connection, a reset, a body that stalled past the bound, the breaker: no answer at all.
  if (response.status === 0) return { kind: "unavailable", status: null, retryAfterMs: null };
  if (response.outcome === "ok")
    // A 200 that is not a call is a proxy's page in front of the provider, not its word.
    return isCallBody(response.json)
      ? { kind: "found", call: response.json }
      : { kind: "unavailable", status: response.status, retryAfterMs: null };
  if (response.status === 401 || response.status === 403) return { kind: "auth", status: response.status };
  if (response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500)
    return {
      kind: "unavailable",
      status: response.status,
      retryAfterMs: retryAfterMs(response.headers?.get("retry-after") ?? null),
    };
  return { kind: "not_found", status: response.status };
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
  /** The longest a call may run, and how long a silent line is held (voice/shell/agent-plan.ts CALL_LIMITS); null = the default. */
  max_call_duration_ms: number | null;
  end_call_after_silence_ms: number | null;
  opt_in_signed_url: boolean | null;
  /** The post-call analysis schema on the agent, as stored; the planner
   *  checks ours are on it (voice/shell/agent-plan.ts CALL_ANALYSIS_FIELDS). */
  post_call_analysis_data: unknown[] | null;
  /** How long a caller's silence waits before the agent speaks again, and how often; null = the provider's default. */
  reminder_trigger_ms: number | null;
  reminder_max_count: number | null;
  /** How a call sounds and takes turns (voice/shell/agent-plan.ts CALL_FEEL, CALL_HANDBOOK); null = the provider's default. */
  interruption_sensitivity: number | null;
  begin_message_delay_ms: number | null;
  enable_backchannel: boolean | null;
  handbook_config: Record<string, unknown> | null;
}

/** GET /get-agent — the fields above, read-only. Null when the provider says no. */
export async function getAgent(cfg: RetellConfig, agentId: string): Promise<RetellAgentConfig | null> {
  const answer = answered(await retell(cfg, "GET", `/get-agent/${agentId}`), "get-agent");
  const result = answerObject(answer);
  if (answer.outcome !== "ok" || !result) return null;
  const str = (k: string) => (typeof result[k] === "string" ? result[k] : null);
  const num = (k: string) => (typeof result[k] === "number" ? result[k] : null);
  const bool = (k: string) => (typeof result[k] === "boolean" ? result[k] : null);
  const engine = recordOrEmpty(result.response_engine);
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
    webhook_events: Array.isArray(result.webhook_events) ? listOrEmpty(result.webhook_events).map(String) : null,
    webhook_timeout_ms: num("webhook_timeout_ms"),
    data_storage_setting: str("data_storage_setting"),
    data_storage_retention_days: num("data_storage_retention_days"),
    max_call_duration_ms: num("max_call_duration_ms"),
    end_call_after_silence_ms: num("end_call_after_silence_ms"),
    opt_in_signed_url: bool("opt_in_signed_url"),
    post_call_analysis_data: Array.isArray(result.post_call_analysis_data)
      ? listOrEmpty(result.post_call_analysis_data)
      : null,
    reminder_trigger_ms: num("reminder_trigger_ms"),
    reminder_max_count: num("reminder_max_count"),
    interruption_sensitivity: num("interruption_sensitivity"),
    begin_message_delay_ms: num("begin_message_delay_ms"),
    enable_backchannel: bool("enable_backchannel"),
    handbook_config:
      result.handbook_config && typeof result.handbook_config === "object" && !Array.isArray(result.handbook_config)
        ? recordOrEmpty(result.handbook_config)
        : null,
  };
}

/**
 * GET /get-agent, the whole object — for the converge endpoint, which must
 * carry every field back to the provider. Never printed by a diagnostic:
 * the webhook URL may carry a secret in its query string.
 */
export async function getAgentRaw(cfg: RetellConfig, agentId: string): Promise<Record<string, unknown> | null> {
  const r = answered(await retell(cfg, "GET", `/get-agent/${agentId}`), "get-agent");
  return r.outcome === "ok" ? answerObject(r) : null;
}
