interface WaConfig {
    phoneId: string;
    accessToken: string;
}
interface WaRawMessage {
    from: string;
    id: string;
    type: string;
    timestamp?: string;
    text?: {
        body?: string;
    };
    image?: {
        id?: string;
        mime_type?: string;
        caption?: string;
    };
    audio?: {
        id?: string;
        mime_type?: string;
    };
    video?: {
        id?: string;
        mime_type?: string;
        caption?: string;
    };
    document?: {
        id?: string;
        mime_type?: string;
        caption?: string;
        filename?: string;
    };
    sticker?: {
        id?: string;
        mime_type?: string;
    };
}
interface WaChangeValue {
    metadata?: {
        phone_number_id?: string;
        display_phone_number?: string;
    };
    contacts?: Array<{
        wa_id?: string;
        profile?: {
            name?: string;
        };
    }>;
    messages?: WaRawMessage[];
    statuses?: Array<{
        id?: string;
        status?: string;
        recipient_id?: string;
        errors?: unknown;
    }>;
    message_echoes?: Array<{
        to?: string;
        id?: string;
        text?: {
            body?: string;
        };
    }>;
}
interface WaMediaRef {
    provider_media_id: string;
    mime_type: string | null;
    caption: string | null;
    filename: string | null;
    fetch_state: "pending" | "stored" | "failed";
    storage_path?: string;
}
/** Canonical view of one inbound customer message. */
interface NormalizedInbound {
    waId: string;
    phoneDigits: string;
    profileName: string | null;
    messageId: string;
    type: "text" | "media";
    rawType: string;
    body: string | null;
    channelTsIso: string | null;
    media: WaMediaRef | null;
    optOut: boolean;
    /** An explicit START/ALTA — the only thing that lifts an opt-out. */
    optIn: boolean;
}
declare function normalizeInbound(m: WaRawMessage, value: WaChangeValue): NormalizedInbound;
interface SendResult {
    ok: boolean;
    wamid: string | null;
    status: number;
    errorBody?: string;
}
declare function sendText(cfg: WaConfig, to: string, body: string): Promise<SendResult>;
/** Approved-template send — the only legal path outside the 24h window. */
declare function sendTemplate(cfg: WaConfig, to: string, template: {
    name: string;
    language: string;
    params: string[];
}): Promise<SendResult>;
/**
 * Meta media URLs expire in minutes — fetch at ingest. Returns the bytes and
 * mime so the caller can store them (Supabase Storage via the service client).
 */
declare function fetchMediaBytes(cfg: WaConfig, providerMediaId: string): Promise<{
    bytes: ArrayBuffer;
    mime: string | null;
} | null>;

interface RetellConfig {
    apiKey: string;
}
interface RetellTranscriptTurn {
    role: string;
    content: string;
    words?: Array<{
        word: string;
        start: number;
        end: number;
    }>;
}
interface RetellCall {
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
interface NormalizedCall {
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
declare function normalizeCall(c: RetellCall): NormalizedCall;
/** The one-line note a call leaves in the customer's cross-channel thread. */
declare function callSummaryLine(n: NormalizedCall): string;
interface ListCallsPage {
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
declare function listCalls(cfg: RetellConfig, opts: {
    agentId: string;
    limit?: number;
    paginationKey?: string;
    ascending?: boolean;
    includeTotal?: boolean;
}): Promise<ListCallsPage>;
/** Full call detail — the only source of transcript/transcript_object. */
declare function getCall(cfg: RetellConfig, callId: string): Promise<RetellCall | null>;
/** True when a v3 list row still needs a getCall to be complete. */
declare function needsHydration(c: RetellCall): boolean;
/**
 * Recording bytes. Retell serves these from an UNSIGNED public CDN URL
 * (verified: HEAD 200 with no auth) — so we copy customer audio into private
 * storage rather than leaving it one guessed link away.
 */
declare function fetchRecording(url: string): Promise<{
    bytes: ArrayBuffer;
    mime: string | null;
} | null>;
/** Retell webhook signature: `v={ts},d={hmac}` over rawBody+ts, keyed by the API key. */
declare function verifyRetellSignature(rawBody: string, header: string | null | undefined, apiKey: string | undefined): boolean;

export { type ListCallsPage, type NormalizedCall, type NormalizedInbound, type RetellCall, type RetellConfig, type RetellTranscriptTurn, type SendResult, type WaChangeValue, type WaConfig, type WaMediaRef, type WaRawMessage, callSummaryLine, fetchMediaBytes, fetchRecording, getCall, listCalls, needsHydration, normalizeCall, normalizeInbound, sendTemplate, sendText, verifyRetellSignature };
