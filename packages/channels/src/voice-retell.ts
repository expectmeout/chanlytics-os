/**
 * Retell voice adapter (Blueprint P2) — the second channel, mirroring the
 * WhatsApp adapter's shape: normalize provider payloads into a canonical
 * object, expose provider I/O, own provider-specific crypto. No persistence,
 * no decisions, no tenant facts: config is passed in.
 *
 * Field names verified against the LIVE Retell account (2026-08-27).
 */
import crypto from "node:crypto";

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
  status: "registered" | "ongoing" | "ended" | "error";
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
}

const E164 = /^\+[1-9]\d{6,14}$/;

function toStatus(s: string | undefined): NormalizedCall["status"] {
  switch (s) {
    case "registered": return "registered";
    case "ongoing": return "ongoing";
    case "error": return "error";
    default: return "ended";
  }
}

export function normalizeCall(c: RetellCall): NormalizedCall {
  const analysis = c.call_analysis ?? {};
  const from = c.from_number ?? null;
  const computedDuration =
    c.duration_ms ??
    (c.start_timestamp && c.end_timestamp ? c.end_timestamp - c.start_timestamp : null);
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
    transcriptObject: c.transcript_object ?? null,
    recordingUrl: c.recording_url ?? null,
    publicLogUrl: c.public_log_url ?? null,
    cost: c.call_cost ?? null,
    latency: c.latency ?? null,
  };
}

/** The one-line note a call leaves in the customer's cross-channel thread. */
export function callSummaryLine(n: NormalizedCall): string {
  const mins = n.durationMs ? Math.max(1, Math.round(n.durationMs / 60000)) : null;
  const head = n.direction === "inbound" ? "Inbound call" : "Outbound call";
  const dur = mins ? ` · ${mins} min` : "";
  const body = n.summary?.trim() || (n.inVoicemail ? "Reached voicemail." : "No summary available.");
  return `${head}${dur} — ${body}`;
}

/* -------------------------------- provider I/O ------------------------------- */

export interface ListCallsPage {
  calls: RetellCall[];
  /** Pass back as paginationKey to continue; null when exhausted. */
  nextKey: string | null;
}

/**
 * Backfill/history read. ALWAYS filter by agent id: one Retell account can host
 * many agents (the live account holds 432 calls across 8 agents, only 4 of them
 * this tenant's) — an unfiltered import would cross tenants.
 */
export async function listCalls(
  cfg: RetellConfig,
  opts: { agentId: string; limit?: number; paginationKey?: string; afterStartMs?: number },
): Promise<ListCallsPage> {
  const limit = Math.min(opts.limit ?? 100, 1000);
  const filter: Record<string, unknown> = { agent_id: [opts.agentId] };
  if (opts.afterStartMs) filter.start_timestamp = { lower_threshold: opts.afterStartMs };
  const body: Record<string, unknown> = {
    limit,
    sort_order: "descending",
    filter_criteria: filter,
    ...(opts.paginationKey ? { pagination_key: opts.paginationKey } : {}),
  };
  const r = await fetch(`${API}/v2/list-calls`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`list-calls ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const out = (await r.json()) as RetellCall[] | { calls?: RetellCall[] };
  const calls = Array.isArray(out) ? out : (out.calls ?? []);
  return {
    calls,
    nextKey: calls.length === limit ? (calls[calls.length - 1]?.call_id ?? null) : null,
  };
}

export async function getCall(cfg: RetellConfig, callId: string): Promise<RetellCall | null> {
  const r = await fetch(`${API}/v2/get-call/${callId}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  });
  if (!r.ok) return null;
  return (await r.json()) as RetellCall;
}

/**
 * Recording bytes. Retell serves these from an UNSIGNED public CDN URL
 * (verified: HEAD 200 with no auth) — so we copy customer audio into private
 * storage rather than leaving it one guessed link away.
 */
export async function fetchRecording(
  url: string,
): Promise<{ bytes: ArrayBuffer; mime: string | null } | null> {
  const r = await fetch(url);
  if (!r.ok) return null;
  return { bytes: await r.arrayBuffer(), mime: r.headers.get("content-type") };
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
  const expected = crypto.createHmac("sha256", apiKey).update(rawBody + ts).digest("hex");
  const a = Buffer.from(digest.toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
