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
    /** Tap on a TEMPLATE quick-reply button. Both fields hold the label. */
    button?: {
        payload?: string;
        text?: string;
    };
    /** Tap on an interactive reply button, or a pick from an interactive list. */
    interactive?: {
        type?: string;
        button_reply?: {
            id?: string;
            title?: string;
        };
        list_reply?: {
            id?: string;
            title?: string;
            description?: string;
        };
    };
    /** An emoji tapped onto one of OUR messages. Carries no request. */
    reaction?: {
        message_id?: string;
        emoji?: string;
    };
    /** A pin drop. Readable by a person, and useful — unlike a voice note. */
    location?: {
        latitude?: number;
        longitude?: number;
        name?: string;
        address?: string;
    };
    /** One or more shared contact cards. */
    contacts?: Array<{
        name?: {
            formatted_name?: string;
        };
        phones?: Array<{
            phone?: string;
        }>;
    }>;
    /** Platform housekeeping (a customer changed their number). Not from a person. */
    system?: {
        body?: string;
        type?: string;
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
    /**
     * What KIND of thing arrived, which is not the same question as which column
     * it is stored in.
     *
     * `type` above answers "text or attachment" and maps to messages.type. It
     * cannot answer "should the receptionist apologise for this", and collapsing
     * the two is how a thumbs-up came to mute the bot for a day: anything that
     * was not text or an attachment fell into "media with no body", and the
     * edge's unreadable branch then acknowledged it, paused the receptionist for
     * pauseMs, opened an escalation and emailed the owner. A reaction carries no
     * request; a pin drop is perfectly readable by a person; a system notice is
     * not from the customer at all. Each needs a different answer, so each gets
     * a name.
     */
    kind: "text" | "media" | "reaction" | "location" | "contacts" | "system" | "unsupported";
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
    /** Retell's own lifecycle. not_connected: the dial never connected — it
     *  is recorded as an attempt, never counted as a call. */
    status: "registered" | "ongoing" | "ended" | "error" | "not_connected";
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
     *  provider sent an object: caller_wanted, outcome, follow_up, caller_name. */
    analysis: Record<string, unknown> | null;
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
declare function liveTurns(items: RetellCall["transcript_with_tool_calls"]): RetellTranscriptTurn[] | null;
/**
 * Turns from the plain transcript text — "Agent: …" / "User: …", one per
 * line, the shape of Retell's `transcript` string. A last resort for a
 * delivery that carries the words and none of the structured fields; a
 * line that names no speaker continues the turn before it.
 */
declare function parseTranscriptText(text: string | null | undefined): RetellTranscriptTurn[] | null;
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
/** The agent settings that decide what the call pipeline can show. */
interface RetellAgentConfig {
    agent_id: string;
    agent_name: string | null;
    version: number | null;
    is_published: boolean | null;
    /** The Retell LLM behind the agent, at the version the agent points at —
     *  what a diagnostic reads to say whether the line runs the product's shell. */
    llm_id: string | null;
    llm_version: number | null;
    webhook_url: string | null;
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
declare function getAgent(cfg: RetellConfig, agentId: string): Promise<RetellAgentConfig | null>;
/**
 * GET /get-agent, the whole object — for the converge endpoint, which must
 * carry every field back to the provider. Never printed by a diagnostic:
 * the webhook URL may carry a secret in its query string.
 */
declare function getAgentRaw(cfg: RetellConfig, agentId: string): Promise<Record<string, unknown> | null>;
/** What a provider write answered: the status and the body, never an exception in a route. */
interface RetellWrite {
    ok: boolean;
    status: number;
    body: Record<string, unknown> | null;
}
/** POST /create-agent-version — a new draft from a version; a published version cannot change. */
declare function createAgentVersion(cfg: RetellConfig, agentId: string, baseVersion: number): Promise<RetellWrite>;
/** PATCH /update-agent — the latest (draft) version takes the patch. */
declare function updateAgent(cfg: RetellConfig, agentId: string, patch: Record<string, unknown>): Promise<RetellWrite>;
/** POST /publish-agent-version — a number pinned to latest_published follows it. */
declare function publishAgentVersion(cfg: RetellConfig, agentId: string, version: number, title: string): Promise<RetellWrite>;
/** POST /create-retell-llm — the shell as a new LLM (voice-provision.ts builds the body). */
declare function createRetellLlm(cfg: RetellConfig, body: Record<string, unknown>): Promise<RetellWrite>;
/** POST /create-agent — an agent over a Retell LLM, with the product's voice and webhook. */
declare function createAgent(cfg: RetellConfig, body: Record<string, unknown>): Promise<RetellWrite>;
/** POST /create-phone-number — BUYS a number in an area code; it costs money every month. */
declare function createPhoneNumber(cfg: RetellConfig, body: Record<string, unknown>): Promise<RetellWrite>;
/** POST /import-phone-number — a number from an elastic SIP trunk, bound like Retell's own (lines-saga.ts builds the body). */
declare function importPhoneNumber(cfg: RetellConfig, body: Record<string, unknown>): Promise<RetellWrite>;
/** PATCH /update-phone-number — the agents on a number, its inbound webhook, its nickname. */
declare function updatePhoneNumber(cfg: RetellConfig, number: string, patch: Record<string, unknown>): Promise<RetellWrite>;
/** GET /get-phone-number — the number as stored; null when the provider says no. Never printed whole: the inbound webhook URL carries a key. */
declare function getPhoneNumber(cfg: RetellConfig, number: string): Promise<Record<string, unknown> | null>;
/** What an operator says to the agent mid-call, heard by the agent alone. */
interface LiveCallControl {
    /** Free text, injected into the transcript as "injected" and worked into the next answer. */
    additionalContext: string;
    /** Interrupt the agent (or nudge a silent one) to answer with it now. */
    triggerResponse?: boolean;
}
/**
 * PATCH /v2/update-live-call — the ONE control Retell offers over a hosted
 * agent's ongoing call: no listen-in, no take-over, no hang-up. Returns the
 * status instead of throwing; a whisper into a call that has just ended is a
 * 4xx the caller reports in a sentence, not an exception in a route.
 */
declare function updateLiveCall(cfg: RetellConfig, callId: string, control: LiveCallControl): Promise<{
    ok: boolean;
    status: number;
}>;
/** The fields of a Retell LLM the shell is defined over. */
interface RetellLlmConfig {
    llm_id: string;
    version: number | null;
    /** The text model behind the shell, and its temperature — provisioning parity, readable by the diagnostic. */
    model: string | null;
    model_temperature: number | null;
    general_prompt: string | null;
    begin_message: string | null;
    default_dynamic_variables: Record<string, string> | null;
    /** Retell's tool objects as stored — the booking tool carries a secret header. */
    general_tools: Array<Record<string, unknown> & {
        type: string;
        name: string;
    }> | null;
    knowledge_base_ids: string[] | null;
}
/** GET /get-retell-llm at a version. Null when the provider says no. */
declare function getRetellLlm(cfg: RetellConfig, llmId: string, version?: number | null): Promise<RetellLlmConfig | null>;
/** True when a v3 list row still needs a getCall to be complete. */
declare function needsHydration(c: RetellCall): boolean;
/**
 * Recording bytes. Retell serves these from an UNSIGNED public CDN URL
 * (verified: HEAD 200 with no auth) — so we copy customer audio into private
 * storage rather than leaving it one guessed link away.
 */
type RecordingFetch = {
    ok: true;
    bytes: ArrayBuffer;
    mime: string | null;
} | {
    ok: false;
    status: number;
};
declare function fetchRecording(url: string, opts?: {
    timeoutMs?: number;
}): Promise<RecordingFetch>;
/** Retell webhook signature: `v={ts},d={hmac}` over rawBody+ts, keyed by the API key. */
declare function verifyRetellSignature(rawBody: string, header: string | null | undefined, apiKey: string | undefined): boolean;

/**
 * The Retell "shell": everything the phone agent is told that is NOT a fact.
 *
 * The facts — hours, address, services, closures, the handoff line, the
 * owner's own notes — arrive at call start as dynamic variables, composed by
 * the inbound-call webhook from the same profile the WhatsApp receptionist
 * reads. What is written here is only what the variables cannot say for
 * themselves: where they go in the prompt, which tools exist, and what the
 * agent hears when a variable could not be supplied.
 *
 * ONE definition, in code, for three readers: the converger that brings a
 * live agent onto it, the diagnostic that reports whether a line has
 * drifted off it, and the provisioning endpoint for a new workspace
 * (voice-provision.ts builds the LLM from it; a test proves the converger
 * plans nothing against what it creates). The live agent predates all of this and was
 * typed by hand in Retell's dashboard — its prompt bakes the hours, the
 * address and a transfer number, so correcting the hours in Settings changed
 * what the chat receptionist said and left the phone saying the old ones.
 *
 * Retell's variable semantics decide the shape of the defaults:
 *   - a variable that is omitted or null is substituted from
 *     `default_dynamic_variables`, and left as the literal `{{name}}` when
 *     there is no default either — read aloud, braces and all;
 *   - a variable set to "" is substituted with nothing AND skips the default.
 * So every placeholder in the prompt has a default here that is a real
 * sentence, and the webhook OMITS a variable it cannot fill rather than
 * sending "".
 */
/** The prompt body. Both placeholders are mandatory; a test pins them. */
declare const VOICE_SHELL_PROMPT = "{{business_facts}}\n\nWho you are speaking with:\n{{caller_context}}";
/** Composed by the webhook so the business name never becomes a third copy. */
declare const VOICE_SHELL_BEGIN = "{{greeting}}";
/** The transfer tool dials this; the webhook fills it from the profile. */
declare const HANDOFF_VAR = "{{handoff_number}}";
/**
 * What the agent is told when the business's facts could not be loaded.
 * `apps/edge/api/retell-inbound.ts` keeps a literal copy (a test pins the two
 * equal): the webhook must never depend on a package import to say this.
 */
declare const FACTS_UNAVAILABLE = "The business's details could not be loaded for this call. Do not state opening hours, prices, services or an address from memory \u2014 you do not have them. Say you will have someone confirm, offer to take a message, and offer to text the booking link.";
declare const CALLER_UNKNOWN = "New caller - no prior interactions on record.";
/** The greeting with no business named — never wrong, never a placeholder. */
declare const GREETING_DEFAULT = "Thank you for calling! This call may be recorded. I'm the automated assistant \u2014 how can I help you today?";
/** Where the booking-link tool posts. Overridable for previews. */
declare const DEFAULT_FN_URL = "https://chanlytics-messaging.vercel.app/api/retell-fn";
/** The availability tool posts beside it, on the same host and secret. */
declare function availabilityUrl(fnUrl: string): string;
/** Retell's own tool object, loosely: the fields we set plus whatever it adds. */
type RetellTool = Record<string, unknown> & {
    type: string;
    name: string;
};
interface VoiceShellTarget {
    general_prompt: string;
    begin_message: string;
    default_dynamic_variables: Record<string, string>;
    general_tools: RetellTool[];
}
/**
 * The tools, as Retell stores them.
 *
 * `headers` on the booking-link tool carries the shared secret the edge
 * checks (`x-fn-secret`). The converger never knows it unless told, so the
 * live tool's headers are carried over untouched, and a tool with none is
 * reported rather than silently created secret-less.
 */
declare function voiceShellTools(fnUrl?: string, bookingHeaders?: Record<string, string> | null): RetellTool[];
/** The whole target: what a converged agent's LLM holds. */
declare function desiredVoiceShell(fnUrl?: string, bookingHeaders?: Record<string, string> | null): VoiceShellTarget;
/** What the converger reads off a live Retell LLM. */
interface LiveVoiceLlm {
    general_prompt?: string | null;
    begin_message?: string | null;
    default_dynamic_variables?: Record<string, string> | null;
    general_tools?: RetellTool[] | null;
}
interface VoiceConvergencePlan {
    /** Human-readable, one line per difference. Never carries a secret. */
    drift: string[];
    /** The PATCH body for update-retell-llm, or null when nothing differs. */
    llmPatch: Partial<VoiceShellTarget> | null;
    /** Live tools the shell does not define. Listed, never silently dropped. */
    unknownTools: string[];
}
/**
 * What separates a live LLM from the shell, and the patch that closes it.
 *
 * Pure, so the dry run IS the plan the apply executes: the script prints the
 * result of this function and, with --apply, sends exactly `llmPatch`. Extra
 * default variables on the live LLM are kept (merged), not deleted; tools the
 * shell does not know are reported and would be REPLACED by an apply, which
 * is why they are listed by name in the plan.
 */
declare function planVoiceConvergence(live: LiveVoiceLlm, desired: VoiceShellTarget): VoiceConvergencePlan;
/**
 * The diagnostic's view: on the shell or not, and why not. Strings only —
 * this is printed by /api/diag, and the live tools carry a secret header.
 */
declare function voiceShellDrift(live: LiveVoiceLlm): {
    converged: boolean;
    drift: string[];
};
/** The webhook events the call pipeline is built on. transcript_updated is
 *  opt-in at Retell and is what makes the Live page's transcript live. */
declare const VOICE_WEBHOOK_EVENTS: readonly ["call_started", "call_ended", "call_analyzed", "transcript_updated"];
/** The webhook copies the recording inside its budget; Retell's default 10 s is too short for it. */
declare const VOICE_WEBHOOK_TIMEOUT_MS = 20000;
/**
 * What the agent's post-call analysis fills in after every call, in the
 * caller's own terms: what they wanted, how it ended, what a person should
 * do next, the name they gave. The provider's default summary ("The user
 * called Melany's Beauty Salon to inquire about…") is kept beside it; these
 * are what the strip, the profile and the call card say. The webhook files
 * them through ingest_call (migration 00061).
 */
declare const CALL_ANALYSIS_FIELDS: readonly [{
    readonly type: "string";
    readonly name: "caller_wanted";
    readonly description: "What the caller wanted, in one short sentence in plain words, the way the business owner would say it. Start with the request itself, never with 'The user' or 'The caller'. Leave empty if they asked for nothing.";
    readonly examples: readonly ["Asked whether Saturday at 10 is free.", "Wanted Tuesday's hours and a price.", "Moved Friday's appointment to next week."];
}, {
    readonly type: "enum";
    readonly name: "outcome";
    readonly description: "How the call ended for the caller. answered: their question was answered. booking_link_sent: the receptionist sent them the booking link. callback_needed: a person at the business has to call them back or follow up. voicemail: the call reached voicemail. no_request: they hung up, tested the line or asked for nothing. other: none of these.";
    readonly choices: readonly ["answered", "booking_link_sent", "callback_needed", "voicemail", "no_request", "other"];
}, {
    readonly type: "string";
    readonly name: "follow_up";
    readonly description: "What a person at the business should do next for this caller, in one short sentence. Leave empty when nothing is needed.";
    readonly examples: readonly ["Call back to confirm a Saturday 10:00 gel manicure.", "Text the price list for highlights."];
}, {
    readonly type: "string";
    readonly name: "caller_name";
    readonly description: "The caller's name exactly as they gave it. Leave empty if they did not say one.";
    readonly examples: readonly ["Ana", "Daniela R."];
}];
/** The agent-level fields the plan reads, as get-agent returns them. */
interface LiveAgentSettings {
    webhook_events?: string[] | null;
    webhook_timeout_ms?: number | null;
    opt_in_signed_url?: boolean | null;
    data_storage_retention_days?: number | null;
    post_call_analysis_data?: unknown[] | null;
}
interface AgentPlan {
    drift: string[];
    /** The PATCH body for update-agent, or null when nothing differs. */
    agentPatch: Record<string, unknown> | null;
}
/**
 * The agent settings the pipeline depends on, and the patch that sets them.
 *
 * Signed recording URLs: with opt_in_signed_url off, every recording link
 * Retell hands out is public and permanent (review F10 made this urgent).
 * The pipeline copies audio into private storage within seconds of the call
 * and refetches a fresh link through get-call when a copy has to retry, so a
 * link that expires costs it nothing.
 *
 * Retention is NOT drift. How long the provider keeps a call is a product
 * decision, applied only when the converger is told a number.
 */
declare function planAgentSettings(live: LiveAgentSettings, opts?: {
    retentionDays?: number;
}): AgentPlan;
/** The diagnostic's view of the agent settings. Strings only. */
declare function agentSettingsDrift(live: LiveAgentSettings): {
    converged: boolean;
    drift: string[];
};

/** The model behind the shell. Temperature 0: the facts are read, not improvised. */
declare const VOICE_LLM_DEFAULTS: {
    readonly model: "claude-4.5-haiku";
    readonly model_temperature: 0;
    readonly start_speaker: "agent";
};
/**
 * The product's voice and the call's shape, pinned from the live line so a
 * second workspace sounds like the first. Retention is the product's 90
 * days; the pipeline copies audio into private storage within seconds.
 */
declare const VOICE_AGENT_DEFAULTS: {
    readonly voice_id: "11labs-Andrea";
    readonly language: readonly ["en-US", "es-ES", "fr-FR", "de-DE", "hi-IN", "ru-RU", "pt-PT", "ja-JP", "it-IT", "nl-NL"];
    readonly end_call_after_silence_ms: 30000;
    readonly max_call_duration_ms: 3600000;
    readonly data_storage_setting: "everything";
    readonly data_storage_retention_days: 90;
    readonly post_call_analysis_model: "gpt-4.1";
    readonly allow_user_dtmf: true;
};
/** A local US number through Retell's Twilio pool. Toll-free and Telnyx are later levers. */
declare const VOICE_NUMBER_DEFAULTS: {
    readonly country_code: "US";
    readonly number_provider: "twilio";
};
/** The product's voice endpoints, from the one base the shell already pins. */
declare function voiceEndpoints(fnUrl?: string): {
    fn: string;
    availability: string;
    webhook: string;
    inbound: string;
};
/** The shared secret rides the tool header and, as ?key=, both webhooks (the edge checks each). */
interface ProvisionSecrets {
    fnSecret: string;
}
declare function withKey(url: string, secret: string): string;
/** The URL without its query string — the only form a response or a log may carry. */
declare function stripKey(url: string | null | undefined): string | null;
/** POST /create-retell-llm: the shell, with the secret on its tools. */
declare function voiceLlmCreateBody(s: ProvisionSecrets, fnUrl?: string): Record<string, unknown>;
/** POST /create-agent: the voice, the webhook and its events, the analysis fields, retention. */
declare function voiceAgentCreateBody(o: {
    llmId: string;
    llmVersion: number | null;
    agentName: string;
}, s: ProvisionSecrets, fnUrl?: string): Record<string, unknown>;
/** The agent on the number. Pinned to latest_published, a saved draft cannot go live by itself. */
declare function voiceNumberBinding(o: {
    agentId: string;
    pinned: boolean;
}): Array<Record<string, unknown>>;
/** POST /create-phone-number: a local number in the area code, bound and answering with the facts. */
declare function voiceNumberCreateBody(o: {
    areaCode: number;
    agentId: string;
    pinned: boolean;
    nickname: string;
}, s: ProvisionSecrets, fnUrl?: string): Record<string, unknown>;
/** PATCH /update-phone-number: an existing Retell number, bound the same way. */
declare function voiceNumberBindBody(o: {
    agentId: string;
    pinned: boolean;
    nickname: string;
}, s: ProvisionSecrets, fnUrl?: string): Record<string, unknown>;
interface VoiceProvisionRequest {
    /** An existing Retell number to bind, E.164. */
    number?: string | null;
    /** Or an area code to buy a local number in. */
    areaCode?: number | null;
    /** Resume: an LLM a previous run created before the agent step failed. */
    llmId?: string | null;
    /** Resume: an agent a previous run created before the number or the row landed. */
    agentId?: string | null;
}
interface VoiceProvisionState {
    tenant: {
        id: string;
        name: string;
    };
    /** The workspace's voice row, when one exists. */
    channel: {
        id: string;
        status: string;
        agentId: string;
        number: string | null;
    } | null;
    request: VoiceProvisionRequest;
}
type ProvisionStepId = "llm" | "agent" | "publish" | "number" | "channel" | "notify";
type ProvisionAction = "create" | "reuse" | "adopt" | "publish" | "buy" | "bind" | "insert" | "notify" | "skip";
interface ProvisionStep {
    id: ProvisionStepId;
    action: ProvisionAction;
    detail: string;
}
interface VoiceProvisionPlan {
    ok: boolean;
    errors: string[];
    /** Nothing to do: the line exists, or the request is not actionable. */
    nothing: boolean;
    reason: string | null;
    steps: ProvisionStep[];
    names: {
        agent: string;
        nickname: string;
    };
}
/** What the endpoint will do, in order. Pure: the dry run prints this; the apply follows it. */
declare function planVoiceProvision(st: VoiceProvisionState): VoiceProvisionPlan;

/**
 * Lines — a workspace's own phone number, behind a provider interface.
 *
 * The plan (docs/plans/2026-09-07-onboarding-and-lines.md §5): the product
 * owns lines through a provider, Twilio first, one subaccount per
 * workspace, and a `dry` provider outside production so the whole path
 * runs with fake SIDs. Nothing here touches the network: this file is the
 * interface, the words the product needs from a provider, and the small
 * pure helpers the saga and the endpoint share.
 */
type LineProviderName = "twilio" | "dry";
/** Credentials to act as — the master account, or a workspace's subaccount. */
interface ProviderAccount {
    sid: string;
    token: string;
}
interface AvailableNumber {
    e164: string;
    /** The provider's display form, e.g. "(305) 555-0100". */
    friendly: string;
    locality: string | null;
    region: string | null;
    capabilities: {
        voice: boolean;
        sms: boolean;
        mms: boolean;
    };
}
/**
 * What a line needs from a provider, in the order the saga uses it. Every
 * method is one provider call; idempotency is the saga's job (it records
 * each SID before the next call and skips what exists).
 */
interface LineProvider {
    readonly name: LineProviderName;
    createSubaccount(master: ProviderAccount, friendlyName: string): Promise<ProviderAccount & {
        status: string;
    }>;
    searchLocal(acct: ProviderAccount, q: {
        areaCode: number;
        limit: number;
    }): Promise<AvailableNumber[]>;
    buyNumber(acct: ProviderAccount, e164: string, friendlyName: string): Promise<{
        sid: string;
        e164: string;
    }>;
    releaseNumber(acct: ProviderAccount, numberSid: string): Promise<void>;
    createTrunk(acct: ProviderAccount, o: {
        friendlyName: string;
        domainName: string;
    }): Promise<{
        sid: string;
        domainName: string;
    }>;
    deleteTrunk(acct: ProviderAccount, trunkSid: string): Promise<void>;
    createCredentialList(acct: ProviderAccount, friendlyName: string): Promise<{
        sid: string;
    }>;
    addCredential(acct: ProviderAccount, listSid: string, username: string, password: string): Promise<{
        sid: string;
    }>;
    attachCredentialList(acct: ProviderAccount, trunkSid: string, listSid: string): Promise<void>;
    addOrigination(acct: ProviderAccount, trunkSid: string, o: {
        sipUrl: string;
        friendlyName: string;
    }): Promise<{
        sid: string;
    }>;
    attachNumber(acct: ProviderAccount, trunkSid: string, numberSid: string): Promise<void>;
    /** The Messaging Service a line texts through: inbound to our webhook, the number in its sender pool. */
    createMessagingService(acct: ProviderAccount, o: {
        friendlyName: string;
        inboundUrl: string;
    }): Promise<{
        sid: string;
    }>;
    addNumberToService(acct: ProviderAccount, serviceSid: string, numberSid: string): Promise<{
        sid: string;
    }>;
    /** One text out through the service. Never throws: a refusal is an answer with the provider's code. */
    sendSms(acct: ProviderAccount, o: {
        serviceSid: string;
        to: string;
        body: string;
    }): Promise<SmsSendResult>;
}
interface SmsSendResult {
    ok: boolean;
    /** The provider's message id (SM…), for the row. */
    sid: string | null;
    status: number;
    /** The provider's error code when refused: 21610 = the person opted out at the carrier, 30034 = the line is not registered yet. */
    code: number | null;
}
/** Where Twilio sends a line's calls: Retell's SIP front door (Retell's Twilio guide). */
declare const RETELL_ORIGINATION = "sip:sip.retellai.com";
/** What the page states as fact before billing exists (plan §8). */
declare const LINE_COSTS: {
    readonly local_number_month_usd: 1.15;
    readonly toll_free_month_usd: 2.15;
};
/**
 * Which provider this deployment may use. Real credentials win; the dry
 * provider is for previews and laptops only — production never fakes a
 * line, so with no credentials there is no provider and the Setup page
 * keeps "we set it up with you".
 */
declare function chooseLineProvider(env: {
    sid?: string | null;
    token?: string | null;
    dryRun?: string | null;
    vercelEnv?: string | null;
}): LineProviderName | null;
/** The trunk's SIP domain: unique per line, letters, digits and dashes, on Twilio's suffix. */
declare function trunkDomain(lineId: string): string;
/** The SIP username Retell presents on the trunk (≤ 32 characters at Twilio). */
declare function sipUsername(lineId: string): string;
/**
 * A SIP password Twilio accepts: at least 12 characters, a digit, mixed
 * case (SIP Credential docs). 24 characters here; `random` is injectable so
 * a test can pin one.
 */
declare function sipPassword(random?: () => number): string;
/** Twilio's rule, checked before a password is sent. */
declare function isValidSipPassword(p: string): boolean;
declare const isE164: (s: unknown) => s is string;
declare const isAreaCode: (n: unknown) => n is number;

/**
 * Twilio as a LineProvider. Field and URL names verified against Twilio's
 * REST docs (Subaccounts, AvailablePhoneNumbers Local, IncomingPhoneNumbers,
 * Elastic SIP Trunking: Trunk, CredentialList, OriginationUrl, PhoneNumber;
 * SIP Credential) on 2026-09-07.
 *
 * Every call goes through one `TwilioHttp` port — basic auth as the account
 * given, form-encoded bodies, JSON answers — so a test can pin every URL
 * and parameter without a network, and the edge supplies fetch.
 */

interface TwilioAnswer {
    status: number;
    body: Record<string, unknown> | null;
}
type TwilioHttp = (acct: ProviderAccount, method: "GET" | "POST" | "DELETE", url: string, form?: Record<string, string>) => Promise<TwilioAnswer>;
declare const twilioUrls: {
    subaccounts: string;
    availableLocal: (sid: string, country?: string) => string;
    incomingNumbers: (sid: string) => string;
    incomingNumber: (sid: string, numberSid: string) => string;
    credentialLists: (sid: string) => string;
    credentials: (sid: string, listSid: string) => string;
    trunks: string;
    trunk: (trunkSid: string) => string;
    trunkCredentialLists: (trunkSid: string) => string;
    trunkOriginationUrls: (trunkSid: string) => string;
    trunkPhoneNumbers: (trunkSid: string) => string;
    messagingServices: string;
    serviceNumbers: (serviceSid: string) => string;
    messages: (sid: string) => string;
};
/** A provider refusal as an error the saga records: status, Twilio's code, its message. */
declare class TwilioError extends Error {
    readonly status: number;
    readonly code: number | null;
    constructor(status: number, body: Record<string, unknown> | null, what: string);
}
/** The fetch-backed port: basic auth as `acct`, 15 s per call. */
declare const fetchTwilio: TwilioHttp;
declare function twilioProvider(http?: TwilioHttp): LineProvider;

/**
 * The dry LineProvider: fake SIDs, no network, the shape of every answer a
 * real provider gives. It is the provider on laptops and previews
 * (LINES_DRY_RUN=1) and in the saga's tests; production never uses it
 * (chooseLineProvider). It keeps a ledger of calls so a test can prove a
 * resumed saga repeats nothing.
 */

interface DryCall {
    op: string;
    args: unknown[];
}
interface DryProvider extends LineProvider {
    readonly calls: DryCall[];
    /** Numbers bought and not released, by SID. */
    readonly owned: Map<string, string>;
}
declare function dryProvider(seed?: number): DryProvider;

type LineStep = "subaccount" | "number" | "trunk" | "agent" | "import" | "messaging" | "channel";
declare const LINE_STEPS: readonly LineStep[];
type LineVoiceState = "none" | "provisioning" | "answering" | "failed";
/** The columns the saga reads and writes — a projection of the `lines` row. */
interface LineRow {
    id: string;
    tenant_id: string;
    e164: string | null;
    provider: string;
    area_code: number | null;
    subaccount_sid: string | null;
    number_sid: string | null;
    trunk_sid: string | null;
    credential_list_sid: string | null;
    termination_uri: string | null;
    /** The Messaging Service the line texts through (MG…); null until the messaging step. */
    messaging_service_sid: string | null;
    retell_agent_id: string | null;
    voice_state: LineVoiceState;
    step: LineStep | null;
    last_error: string | null;
    state_since: string;
    facts: Record<string, unknown>;
}
interface LineSecrets {
    /** The subaccount's auth token. */
    auth_token?: string;
    sip_username?: string;
    sip_password?: string;
}
interface LinePorts {
    provider: LineProvider;
    /** The master account: the only one that can create a subaccount. */
    master: ProviderAccount;
    tenant: {
        id: string;
        name: string;
    };
    now: () => string;
    random?: () => number;
    store: {
        /** Persist a patch of the row; the saga keeps its own copy current. */
        save(patch: Partial<LineRow>): Promise<void>;
        getSecrets(): Promise<LineSecrets>;
        /** Merge into what is there. */
        putSecrets(s: LineSecrets): Promise<void>;
    };
    /** The workspace's phone receptionist: an existing agent, or a new one. */
    agent: {
        ensure(): Promise<{
            agentId: string;
            llmId: string | null;
            pinned: boolean;
        }>;
    };
    retell: {
        importNumber(body: Record<string, unknown>): Promise<{
            ok: boolean;
            status: number;
            body: Record<string, unknown> | null;
        }>;
    };
    /** The tenant_channels row that routes calls back — created once per agent. */
    channel: {
        ensure(o: {
            agentId: string;
            e164: string;
            lineId: string;
        }): Promise<{
            channelId: string;
            created: boolean;
        }>;
    };
    /** The tenant_channels row that routes texts back — one per line, keyed on the number. */
    smsChannel: {
        ensure(o: {
            e164: string;
            lineId: string;
            serviceSid: string;
        }): Promise<{
            channelId: string;
            created: boolean;
        }>;
    };
    /** With its key: the inbound-call webhook that fills the facts per call. */
    inboundWebhookUrl: string;
    /** Where the line's texts arrive (no key: the provider signs every request). */
    smsInboundUrl: string;
    nickname: string;
}
type SagaResult = {
    ok: true;
    line: LineRow;
} | {
    ok: false;
    step: LineStep;
    error: string;
    line: LineRow;
};
/** The body Retell's import takes — pure, so a test can pin it. */
declare function retellImportBody(o: {
    e164: string;
    terminationUri: string;
    username: string;
    password: string;
    agentId: string;
    pinned: boolean;
    nickname: string;
    inboundWebhookUrl: string;
}): Record<string, unknown>;
/** The first step whose effect is missing from the row. */
declare function nextLineStep(line: LineRow): LineStep | null;
declare function runLineSaga(start: LineRow, ports: LinePorts): Promise<SagaResult>;

/**
 * SMS on a Chanlytics line, the pure parts: Twilio's inbound webhook read
 * into one shape, that shape handed to the WhatsApp handler as the message
 * it already knows how to answer, the signature every inbound request must
 * carry, the footer the first reply carries, and the words a held text
 * shows. Nothing here touches the network; the edge supplies fetch and the
 * vault, the tests supply fixtures.
 *
 * Verified against Twilio's docs on 2026-09-07: the inbound parameters
 * (MessageSid, From, To, Body, NumMedia, MediaContentType0, OptOutType,
 * MessagingServiceSid) and the X-Twilio-Signature rule — HMAC-SHA1 of the
 * exact URL plus every POST field sorted by name with its value appended,
 * keyed with the auth token of the account the number belongs to, base64.
 */

/** Twilio's inbound message, the fields the product reads. */
interface SmsInbound {
    messageSid: string;
    /** E.164 as Twilio sends it. */
    from: string;
    to: string;
    body: string;
    numMedia: number;
    mediaTypes: string[];
    /** Twilio's own opt-out handling, when it fired: STOP · START · HELP. */
    optOutType: "STOP" | "START" | "HELP" | null;
    messagingServiceSid: string | null;
    accountSid: string | null;
}
/** The form fields of one inbound webhook as one object; null when it is not a message. */
declare function smsInboundFrom(form: Record<string, string>): SmsInbound | null;
/**
 * The inbound text as the WhatsApp handler's message. Words are words; a
 * picture with words is answered for its words and the picture is noted; a
 * picture alone is "unsupported", which the handler acknowledges as it does
 * a sticker. The sender's digits are the thread key, the same form a
 * WhatsApp id takes, so one person is one thread across both channels.
 */
declare function smsAsWaMessage(s: SmsInbound, nowMs?: number): WaRawMessage;
/** What the first reply to a number carries, once. Carrier guidance for A2P traffic. */
declare const SMS_FOOTER = "Msg&data rates may apply. Reply STOP to opt out.";
/** Twilio's ceiling for one message body. */
declare const SMS_MAX_CHARS = 1600;
/** The reply as it goes out: the footer on the first reply to this person, and never over the ceiling. */
declare function smsBody(reply: string, isFirstReply: boolean): string;
/** The hold while the carriers have not approved the line: the Inbox's reason and its words. */
declare const SMS_HELD_REASON = "carriers";
declare const SMS_HELD_DETAILS = "This text arrived on your line before the carriers approved it for texting, so the receptionist did not answer. It is kept here; answer it yourself, or wait for the approval on Setup.";
/** Where a line's texts arrive: beside the voice webhooks, on the same edge. */
declare function smsInboundUrl(fnUrl: string): string;
/** The exact string Twilio signs: the URL as requested, then each POST field sorted by name with its value appended. */
declare function twilioSignedString(url: string, form: Record<string, string>): string;
/** HMAC-SHA1 of the signed string with the auth token, base64 — the value of X-Twilio-Signature. */
declare function twilioSignature(authToken: string, url: string, form: Record<string, string>): Promise<string>;
/** Constant-time equality on the two base64 strings. */
declare function sameSignature(a: string, b: string): boolean;
declare function verifyTwilioSignature(authToken: string, url: string, form: Record<string, string>, header: string | null): Promise<boolean>;

/** Trust Hub policies, by the names Twilio gives them. */
declare const A2P_POLICIES: {
    /** The bundle one customer of an ISV gets. */
    readonly secondaryCustomerProfile: "RNdfbf3fae0e1107f8aded0e7cead80bf5";
    /** The messaging profile a brand is registered from. */
    readonly a2pMessaging: "RNb0d4771c2c98518d916a3d4cd70a8f8b";
    /**
     * A customer with no tax id registers on a PAIR of these instead, and it is
     * a pair -- half of it was here for months and the other half was missing,
     * which is why the path was refused rather than built.
     *
     * Verified against the live Policies API on 2026-09-09, because filing
     * against the wrong policy produces a registration that is refused after it
     * has been paid for:
     *
     *   RN806dd6... "Starter Customer Profile of type Business"
     *   RN670d5d... "Sole Proprietor TrustProduct"
     */
    readonly starterCustomerProfile: "RN806dd6cd175f314e1f96a9727ee271f4";
    readonly soleProprietor: "RN670d5d2e282a6130ae063b234b6019c8";
};
declare const TRUSTHUB = "https://trusthub.twilio.com/v1";
declare const MESSAGING = "https://messaging.twilio.com/v1";
/** What every registration asks of a business, collected once and reused. */
interface BusinessRecord {
    /** The name on the tax filing, not the trading name. */
    legalName: string;
    /** The trading name customers know, when it differs. */
    tradeName?: string | null;
    /** An EIN, or null for a sole proprietor with no tax id. */
    ein: string | null;
    street: string;
    streetSecondary?: string | null;
    city: string;
    /** Two-letter state or province. */
    region: string;
    postalCode: string;
    /** ISO 3166 alpha-2. */
    country: string;
    /** The page a reviewer opens; the workspace's own sign-up page when it has no site. */
    websiteUrl: string;
    /** Twilio's industry vocabulary. */
    industry: string;
    /** The legal form, on Twilio's enum. */
    businessType: string;
    /** Ownership, on Twilio's enum. */
    companyType: string;
    contactFirstName: string;
    contactLastName: string;
    contactEmail: string;
    /** E.164. */
    /**
     * The owner's own mobile. The form has always labelled it "Mobile -- yours,
     * not the business line", and on a sole-proprietor registration that label
     * becomes load-bearing: the carriers TEXT this number and the owner has to
     * reply from it, so it must be a real handset. TCR also caps it at three
     * sole-proprietor registrations across every vendor, for ever.
     */
    contactPhone: string;
    contactTitle: string;
    contactJobPosition: string;
}
type BrandType = "STANDARD" | "SOLE_PROPRIETOR";
/**
 * The carriers' word for the path this record is on.
 *
 * Delegates rather than deciding: the fork is `registrationPathOf` in
 * contracts, which the form and both validators also read, and a second
 * `r.ein && r.ein.trim()` here would be a second place for the two to
 * disagree about the same tax id. This maps one vocabulary onto the other and
 * nothing else.
 */
declare function brandTypeFor(r: Pick<BusinessRecord, "ein">): BrandType;
interface A2PRequest {
    url: string;
    method: "GET" | "POST" | "DELETE";
    /**
     * Form fields; the caller encodes them. A list is sent as REPEATED keys —
     * `MessageSamples=a&MessageSamples=b` — which is the only shape Twilio
     * parses. Indexed keys (`MessageSamples[0]`) come back as
     * "Unable to process JSON".
     */
    form?: Record<string, string | string[]>;
}
/** One place that knows how a list is written on the wire. */
declare function encodeForm(form: Record<string, string | string[]>): string;
/** The customer's own bundle, under our primary profile. */
declare function customerProfileRequest(o: {
    friendlyName: string;
    email: string;
    statusCallback?: string;
}): A2PRequest;
/** The business itself, in the carriers' vocabulary. */
/**
 * The customer profile a business with no tax id gets.
 *
 * Same shape as customerProfileRequest, different policy -- and the difference
 * is the whole path: the Starter profile asks for a person (name, email,
 * phone) and an address, where the Secondary asks for a company, a tax id, an
 * authorised representative and a document proving the address.
 */
declare function starterProfileRequest(o: {
    friendlyName: string;
    email: string;
    statusCallback?: string;
}): A2PRequest;
/**
 * The person, for a starter profile. Four fields, verified from the policy's
 * own requirements rather than a guess: first_name, last_name, email,
 * phone_number.
 */
declare function starterEndUserRequest(r: BusinessRecord): A2PRequest;
/** The messaging profile bundle a sole proprietor's brand is registered from. */
declare function soleProprietorProfileRequest(o: {
    friendlyName: string;
    email: string;
    statusCallback?: string;
}): A2PRequest;
/**
 * The three facts the Sole Proprietor TrustProduct asks for, from its own
 * policy: brand_name, mobile_phone_number, vertical.
 *
 * The mobile is the whole reason this end user exists -- it is where the
 * carriers send the one-time code, and it is the field a business gets wrong
 * by giving the number customers call.
 */
declare function soleProprietorEndUserRequest(r: BusinessRecord, industry: string): A2PRequest;
declare function businessEndUserRequest(r: BusinessRecord): A2PRequest;
/** The person who signs for it. */
declare function representativeEndUserRequest(r: BusinessRecord): A2PRequest;
/** The address as an account resource, which the supporting document points at. */
declare function addressRequest(accountSid: string, r: BusinessRecord): A2PRequest;
declare function supportingDocumentRequest(o: {
    legalName: string;
    addressSid: string;
}): A2PRequest;
/**
 * The business and the person, as they stand now.
 *
 * An owner who corrects a typo after the first attempt would otherwise be
 * evaluated on what they first typed: the end users are made once and the
 * saga skips a step whose receipt it already holds. So the current record
 * is pushed onto them again just before the profile is submitted, which is
 * the last moment it can still matter.
 */
declare function updateEndUserRequest(sid: string, attributes: Record<string, unknown>): A2PRequest;
declare function businessAttributes(r: BusinessRecord): Record<string, unknown>;
/** The starter profile's one end user, refreshed the same way. */
declare function starterAttributes(r: BusinessRecord): Record<string, unknown>;
declare function representativeAttributes(r: BusinessRecord): Record<string, unknown>;
/** Everything a bundle carries is attached the same way. */
declare function assignRequest(bundleSid: string, objectSid: string): A2PRequest;
declare function trustProductAssignRequest(bundleSid: string, objectSid: string): A2PRequest;
/** Ask Twilio whether the bundle is complete before submitting it. */
declare function evaluateRequest(bundleSid: string, policySid?: string): A2PRequest;
declare function submitProfileRequest(bundleSid: string): A2PRequest;
/** The messaging profile a brand is registered from. */
declare function a2pProfileRequest(o: {
    friendlyName: string;
    email: string;
    statusCallback?: string;
}): A2PRequest;
declare function a2pProfileEndUserRequest(o: {
    friendlyName: string;
    companyType: string;
}): A2PRequest;
declare function evaluateTrustProductRequest(bundleSid: string): A2PRequest;
declare function submitTrustProductRequest(bundleSid: string): A2PRequest;
/**
 * The brand. `mock` registers against Twilio's test registry: free, never
 * routes a real message, and gone after thirty days — which is how this
 * whole path is exercised before a customer pays for anything.
 */
/**
 * `skipVetting` is a MONEY decision, so it is stated rather than defaulted.
 *
 * Twilio runs an automatic secondary vetting on a standard brand unless told
 * not to, and it is the expensive half of registering a business: the first
 * real filing this product made cost $46.00 in two one-time events, of which
 * the brand registration itself is $4.
 *
 * What the vetting buys is a brand SCORE, and a score only buys throughput --
 * T-Mobile's higher daily tiers. That filing came back with a score of 46,
 * below the threshold where the tier changes, on a LOW_VOLUME campaign whose
 * whole point is that it sends a handful of messages a day. So it bought
 * nothing, for every customer, for ever.
 *
 * A brand can be vetted later (the Vettings endpoint) if a workspace ever needs
 * the throughput. Paying up front for every salon, in case one of them turns
 * into a sender, is the wrong way round.
 */
declare function brandRequest(o: {
    customerProfileBundleSid: string;
    a2pProfileBundleSid: string;
    brandType: BrandType;
    mock: boolean;
    skipVetting: boolean;
}): A2PRequest;
/** What the campaign says about the messages this workspace will send. */
interface CampaignFacts {
    brandSid: string;
    messagingServiceSid: string;
    /** What the receptionist does, in a reviewer's words. */
    description: string;
    /** How a customer comes to be on the list. */
    messageFlow: string;
    /** Two to five real examples. */
    samples: string[];
    optInMessage: string;
    optInKeywords: string[];
    privacyPolicyUrl: string;
    termsUrl: string;
    useCase: string;
}
/**
 * A keyword is one word.
 *
 * The carriers refuse anything with a space — "Opt In Keywords must contain
 * either alphanumeric or accented characters" — and they refuse it at the
 * campaign, after the brand is registered. Our own opt-in phrase is two
 * words ("YES OFFERS"), which belongs in the message flow, where it is
 * explained, and not in this field. So only single words are declared, and
 * only ones the product actually honours.
 */
declare function keywordsFor(words: readonly string[]): string[];
/**
 * Twilio's code for a small business sending a bit of everything.
 *
 * The same use case for both registrations. A sole proprietor's ceiling is set
 * by the BRAND -- one campaign, one number, a thousand messages a day on
 * T-Mobile: SOLE_PROP_LIMITS, in contracts -- not by the use case, so there is
 * nothing to choose here, and choosing anyway would be a second place for the
 * two paths to disagree.
 */
declare const LOW_VOLUME_USECASE = "LOW_VOLUME";
declare function campaignRequest(f: CampaignFacts): A2PRequest;
/**
 * Correct a campaign the carriers sent back, and resubmit it.
 *
 * NOT a delete and a re-create, and the difference is money. Twilio assesses
 * the campaign vetting fee ONCE PER CAMPAIGN, at its first vetting decision:
 *
 *   "A vetting fee is assessed only once per Campaign. So if a Campaign is
 *    rejected its important to resubmit it rather than deleting and recreating
 *    a new campaign."
 *
 * A replacement campaign is a new submission and is charged again ($15 on the
 * first one this product filed). An edit of the same QE resource is not. So a
 * rejection costs nothing to answer, however many times it takes -- which is
 * the right shape anyway, because a rejection is a correction request and the
 * corrections are usually one line of copy.
 *
 * All seven fields are required on every update, including the four booleans;
 * a campaign TCR has already approved may not change those, so they are passed
 * back exactly as they were sent.
 */
declare function updateCampaignRequest(messagingServiceSid: string, campaignSid: string, f: Pick<CampaignFacts, "description" | "messageFlow" | "samples">): A2PRequest;
/**
 * Take the campaign off a Messaging Service.
 *
 * A service holds ONE campaign, so a second POST is refused while the first is
 * there. That is only a problem for the one case this exists for: a filing made
 * against Twilio's mock registry, which never routes a real message and expires
 * in thirty days, being replaced by a real one. A real campaign is never
 * deleted from here — it was paid for and vetted, and the caller refuses the
 * whole operation before reaching this.
 *
 * The INSTANCE url, not the collection. The collection answers 405 with error
 * 20004 ("does not support the attempted HTTP method DELETE"), which the caller
 * treated as best-effort and swallowed — so the mock campaign stayed on the
 * service and the refile went on to be refused a step later. Verified against
 * the live API on 2026-09-09: the instance url answers 204 and the service's
 * compliance list is then empty.
 */
declare function deleteCampaignRequest(messagingServiceSid: string, campaignSid: string): A2PRequest;
type A2PStep = "profile" | "business" | "representative" | "address" | "document" | "primary" | "submit" | "a2p_profile" | "brand" | "campaign";
declare const A2P_STEPS: readonly A2PStep[];
/** What the registration has made so far. Every field is a receipt for one step. */
interface A2PState {
    profileSid: string | null;
    businessSid: string | null;
    representativeSid: string | null;
    addressSid: string | null;
    documentSid: string | null;
    primaryAssigned: boolean;
    profileSubmitted: boolean;
    a2pProfileSid: string | null;
    brandSid: string | null;
    campaignSid: string | null;
}
declare const EMPTY_A2P_STATE: A2PState;
/**
 * The first step whose receipt is missing; null when the registration is filed.
 *
 * TWO LISTS, because there are two registrations. A business with a tax id
 * files a company: its name, its EIN, an authorised representative who signs
 * for it, and a document proving the address. A sole proprietor files a
 * PERSON: their name, their email, their address, and the mobile the carriers
 * will text. Neither is a subset of the other, so this is a fork rather than a
 * flag -- and the shared steps (address, primary, submit, brand, campaign) are
 * genuinely shared, which is why one function still answers for both.
 */
declare function nextA2PStep(s: A2PState, brandType?: BrandType): A2PStep | null;
/**
 * The campaign cannot be filed until the carriers have finished with the
 * brand. That is a WAIT, not a refusal: everything asked for was accepted,
 * and the last step simply cannot run yet. Told apart here so the row says
 * "waiting on carriers" instead of "something went wrong".
 */
declare function isBrandNotReady(error: string): boolean;
/** Twilio's brand and campaign statuses, in the words `lines.sms_state` uses. */
type SmsRegistrationState = "registering" | "approved" | "active" | "rejected" | "failed";
declare function smsStateFor(o: {
    brandStatus?: string | null;
    campaignStatus?: string | null;
    mock?: boolean;
}): SmsRegistrationState;
/**
 * What the carriers just decided, in the owner's words — or nothing, when
 * the answer is the same as last hour. The sweep runs hourly; a bell that
 * rang every hour would be noise, and the one that matters would be lost
 * in it.
 */
declare function registrationVerdict(before: string, after: SmsRegistrationState, o: {
    number: string | null;
    reason?: string | null;
    mock?: boolean;
}): {
    kind: "number" | "alert";
    title: string;
    body: string;
    route: string;
    event: "line.texting_on" | "line.texting_rejected" | "line.texting_approved";
} | null;

/**
 * The registration, run: one idempotent step at a time over a port that
 * makes the request and hands back what Twilio said. The saga records
 * every receipt before the next call, so a resumed run repeats nothing —
 * which matters here more than anywhere else in this product, because a
 * repeated brand registration is a second fee for the same business.
 *
 * Pure of the network and of the database: the edge supplies both.
 */

interface A2PAnswer {
    status: number;
    body: Record<string, unknown> | null;
}
interface A2PPorts {
    /** One request, as the master account. Never throws for a refusal; the status says it. */
    send(req: A2PRequest): Promise<A2PAnswer>;
    /** The account the address is created under. */
    accountSid: string;
    /** Chanlytics' own approved primary profile: what makes these customers ours. */
    primaryProfileSid: string;
    /** Where Twilio writes about the bundle; the platform's mailbox, not the customer's. */
    email: string;
    /** Where status callbacks land, when the deployment has a public one. */
    statusCallback?: string;
    /** Keep a receipt before the next call runs. */
    save(patch: Partial<A2PState>): Promise<void>;
    /** The workspace, for the names a reviewer reads. */
    workspace: {
        name: string;
    };
    record: BusinessRecord;
    /** Twilio's vertical enum. The sole-proprietor end user asks for it by name. */
    industry: string;
    campaign: Omit<CampaignFacts, "brandSid" | "messagingServiceSid" | "useCase">;
    messagingServiceSid: string;
    useCase: string;
    /** Twilio's free test registry: no fee, no real routing, gone in thirty days. */
    mock: boolean;
    /**
     * Skip the automatic secondary vetting on the brand. It costs about ten times
     * the brand registration and buys only throughput this product's LOW_VOLUME
     * campaigns cannot use -- see brandRequest.
     */
    skipVetting: boolean;
}
type A2PResult = {
    ok: true;
    state: A2PState;
}
/** `pending` is a wait, not a refusal: the carriers have not finished with the brand. */
 | {
    ok: false;
    step: A2PStep;
    error: string;
    pending: boolean;
    state: A2PState;
};
declare function runA2PSaga(start: A2PState, p: A2PPorts): Promise<A2PResult>;

/**
 * Google Places (New): the public listing — what anyone can read on Maps.
 *
 * Two calls, pinned to the documented shapes. Text Search finds the business
 * from its name and address and asks for Pro fields only (a name, an
 * address, a link — never the rating, which would bill the Enterprise SKU
 * for a search the owner confirms by eye anyway). Place Details reads what
 * the listing says: the rating, the count, and the five reviews Google shows
 * first — `reviews` is the Enterprise + Atmosphere field, the one that
 * costs, and it is asked for once a day per workspace.
 *
 * The key travels in a header and the field mask in another; without the
 * mask Google refuses the call. HTTP is a port, so the planner beside this
 * (google-sync.ts) and every test run without a network.
 */
declare const PLACES_BASE = "https://places.googleapis.com/v1";
declare const PLACES_SEARCH_MASK = "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.businessStatus";
declare const PLACES_DETAILS_MASK = "id,displayName,formattedAddress,googleMapsUri,businessStatus,rating,userRatingCount,reviews";
/** Candidates shown to the owner: a handful, never a page of twenty. */
declare const PLACES_SEARCH_LIMIT = 5;
declare const PLACES_TIMEOUT_MS = 10000;
interface PlacesRequest {
    url: string;
    method: "GET" | "POST" | "PUT" | "DELETE";
    headers: Record<string, string>;
    body?: string;
}
/** One HTTP round trip. The real one is placesFetch(); tests hand in a fake. */
type PlacesHttp = (req: PlacesRequest) => Promise<{
    status: number;
    body: string;
}>;
declare class PlacesError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
}
interface PlaceCandidate {
    place_id: string;
    name: string;
    address: string | null;
    maps_uri: string | null;
    business_status: string | null;
}
interface PlaceReview {
    review_id: string;
    rating: number | null;
    author: string | null;
    author_uri: string | null;
    author_photo_uri: string | null;
    text: string | null;
    language_code: string | null;
    published_at: string | null;
    maps_uri: string | null;
}
interface PlaceDetails {
    place_id: string;
    name: string;
    address: string | null;
    maps_uri: string | null;
    business_status: string | null;
    rating: number | null;
    review_count: number | null;
    reviews: PlaceReview[];
}
/** Text Search: the query as the owner or the facts give it; a handful of results. */
declare function placesSearchRequest(key: string, query: string, opts?: {
    limit?: number;
    languageCode?: string;
}): PlacesRequest;
/** Place Details: the listing by its id, with the reviews. */
declare function placesDetailsRequest(key: string, placeId: string, opts?: {
    languageCode?: string;
}): PlacesRequest;
/** A review's id is the last segment of its resource name, places/{place}/reviews/{review}. */
declare function reviewIdOf(name: unknown): string | null;
declare function parsePlacesSearch(json: unknown): PlaceCandidate[];
declare function parsePlaceDetails(json: unknown): PlaceDetails;
declare function searchPlaces(http: PlacesHttp, key: string, query: string, opts?: {
    limit?: number;
    languageCode?: string;
}): Promise<PlaceCandidate[]>;
declare function getPlace(http: PlacesHttp, key: string, placeId: string, opts?: {
    languageCode?: string;
}): Promise<PlaceDetails>;
/** The real port: fetch with a timeout, the body as text whatever the status. */
declare function placesFetch(fetchImpl?: typeof fetch, timeoutMs?: number): PlacesHttp;
/** A place id as Google issues them: letters, digits, dashes and underscores. */
declare const PLACE_ID: RegExp;

/**
 * Google Business Profile: the owner's own listing, with every review and
 * the right to answer them. Three APIs, pinned to the documented shapes:
 * Account Management (whose accounts), Business Information (which
 * locations, with the place id that ties one to the public listing), and
 * the v4 API that still carries reviews and replies.
 *
 * Nothing here holds a token for longer than a call; the edge trades the
 * Vault-held refresh token for one. HTTP is the same port the Places client
 * uses, so the planner beside this runs in tests without a network.
 */

declare const GBP_ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
declare const GBP_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
declare const GBP_V4_BASE = "https://mybusiness.googleapis.com/v4";
/** What a location is asked for: its name, its title, where it is, and the metadata that names its place on Maps. */
declare const GBP_LOCATIONS_READ_MASK = "name,title,storefrontAddress,metadata";
declare const GBP_REVIEWS_PAGE = 50;
/** Pages of fifty read on one sync: a history of two hundred and fifty, then the newest page each day. */
declare const GBP_REVIEWS_MAX_PAGES = 5;
declare function accountsRequest(token: string, pageToken?: string | null): PlacesRequest;
declare function locationsRequest(token: string, accountName: string, pageToken?: string | null): PlacesRequest;
/** The v4 review path: accounts/{a}/locations/{l}, from the account's name and the location's. */
declare function reviewParent(accountName: string, locationName: string): string;
declare function reviewsRequest(token: string, parent: string, pageToken?: string | null): PlacesRequest;
declare function replyRequest(token: string, reviewName: string, comment: string): PlacesRequest;
declare function deleteReplyRequest(token: string, reviewName: string): PlacesRequest & {
    method: "DELETE";
};
interface GbpAccount {
    /** accounts/{id} */
    name: string;
    title: string;
    type: string | null;
}
interface GbpLocation {
    /** locations/{id} */
    name: string;
    title: string;
    address: string | null;
    /** The listing on Maps, when Google has one; null for a location not yet on Maps. */
    place_id: string | null;
    maps_uri: string | null;
    new_review_uri: string | null;
}
interface GbpReview {
    /** accounts/{a}/locations/{l}/reviews/{id} */
    name: string;
    review_id: string;
    rating: number | null;
    author: string | null;
    author_photo_uri: string | null;
    anonymous: boolean;
    text: string | null;
    created_at: string | null;
    updated_at: string | null;
    reply_text: string | null;
    replied_at: string | null;
}
interface GbpReviewsPage {
    reviews: GbpReview[];
    average_rating: number | null;
    total_count: number | null;
    next_page_token: string | null;
}
declare function parseAccounts(json: unknown): {
    accounts: GbpAccount[];
    next: string | null;
};
declare function parseLocations(json: unknown): {
    locations: GbpLocation[];
    next: string | null;
};
/** "FIVE" → 5; anything else → null. */
declare function starRatingNumber(v: unknown): number | null;
declare function parseReviewsPage(json: unknown): GbpReviewsPage;
declare function listAccounts(http: PlacesHttp, token: string): Promise<GbpAccount[]>;
declare function listLocations(http: PlacesHttp, token: string, accountName: string): Promise<GbpLocation[]>;
/** The newest pages of reviews, up to `maxPages`; the rating and the count as Google reports them beside. */
declare function listReviews(http: PlacesHttp, token: string, parent: string, maxPages?: number): Promise<GbpReviewsPage>;
declare function replyToReview(http: PlacesHttp, token: string, reviewName: string, comment: string): Promise<{
    reply_text: string | null;
    replied_at: string | null;
}>;
/** A reply as Google accepts it: words, at most this many characters. */
declare const GBP_REPLY_MAX = 4096;
declare function cleanReply(text: unknown): string;

interface ListingBefore {
    rating: number | null;
    review_count: number | null;
    /** The previous successful read; null before the first. */
    checked_at: string | null;
}
interface ReviewBell {
    title: string;
    body: string;
    /** The review it is about, when it is about one. */
    review_id: string | null;
}
/** More new reviews than this in one check become one row, not a pile. */
declare const REVIEW_BELL_MAX = 3;
/** A review dated up to this long before the previous check still counts as written since it: Google's clock and ours differ, and a review can be dated by its visit. */
declare const FRESH_SLACK_MS: number;
interface NewsItem {
    review_id: string;
    rating: number | null;
    author: string | null;
    text: string | null;
}
/**
 * The bell rows for what is new: one per review up to three, else one
 * summary naming who wrote; with nothing new by name but ratings gained by
 * the count, one row that says why the words are missing.
 */
declare function reviewBells(news: NewsItem[], counted: number, listing: {
    rating: number | null;
    review_count: number | null;
}): ReviewBell[];
interface ListingCheckPlan {
    listing: {
        name: string;
        address: string | null;
        maps_uri: string | null;
        business_status: string | null;
        rating: number | null;
        review_count: number | null;
        checked_at: string;
        check_error: null;
    };
    day: {
        day: string;
        rating: number | null;
        review_count: number;
    };
    /** Every review Google showed, to upsert; the row keeps its first_seen_at. Empty when the profile carries the reviews. */
    reviews: Array<PlaceReview & {
        last_seen_at: string;
    }>;
    /** Not on record and written since the previous check: news. */
    fresh: PlaceReview[];
    /** Ratings gained by Google's count since the previous read; 0 on the first. */
    counted: number;
    bells: ReviewBell[];
}
declare function planListingCheck(before: ListingBefore, knownIds: ReadonlySet<string>, fresh: PlaceDetails, day: string, nowMs: number, opts?: {
    reviews?: boolean;
}): ListingCheckPlan;
interface ProfileBefore {
    /** The previous successful sync; null before the first. */
    last_synced_at: string | null;
}
interface KnownReview {
    updated_at: string | null;
    reply_text: string | null;
}
interface ProfileSyncPlan {
    /** The rating and the count as the profile reports them, when it does. */
    listing: {
        rating: number | null;
        review_count: number | null;
        checked_at: string;
        check_error: null;
    } | null;
    day: {
        day: string;
        rating: number | null;
        review_count: number;
    } | null;
    /** Every review read, to upsert with origin 'profile'; the row keeps its first_seen_at. */
    reviews: Array<GbpReview & {
        last_seen_at: string;
    }>;
    /** Not on record and written since the last sync: news. */
    fresh: GbpReview[];
    /** Reviews whose reply appeared or changed since the last sync — answered on Google, not here. */
    replied: string[];
    bells: ReviewBell[];
    synced_at: string;
}
declare function planProfileSync(before: ProfileBefore, known: ReadonlyMap<string, KnownReview>, page: GbpReviewsPage, day: string, nowMs: number): ProfileSyncPlan;

/**
 * Google OAuth for a web server, pinned to the documented shapes.
 *
 * The owner signs in to Google once; what comes back is a refresh token
 * that the edge keeps in Vault and trades for an hour's access token when
 * it needs one. `access_type=offline` and `prompt=consent` are what make
 * Google return the refresh token, and it does so on the first
 * authorization only — a reconnect goes through consent again on purpose.
 *
 * The state is the CSRF proof: the workspace, the person and a nonce,
 * signed with a secret the dashboard holds, checked on the way back before
 * the code is trusted. Everything here is pure or Web Crypto, so the tests
 * run it without a network.
 */

declare const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
declare const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
declare const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
/** Business Profile, plus the email so the card can say whose account it is. */
declare const PROFILE_SCOPES: readonly ["openid", "email", "https://www.googleapis.com/auth/business.manage"];
/** How long the way to Google and back may take. */
declare const STATE_TTL_MS: number;
interface OAuthClient {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}
declare function authorizeUrl(cfg: Pick<OAuthClient, "clientId" | "redirectUri">, state: string, loginHint?: string | null): string;
declare function tokenExchangeRequest(cfg: OAuthClient, code: string): PlacesRequest;
declare function tokenRefreshRequest(cfg: Pick<OAuthClient, "clientId" | "clientSecret">, refreshToken: string): PlacesRequest;
/** Either token may be revoked; revoking the refresh token ends the grant. */
declare function revokeRequest(token: string): PlacesRequest;
interface TokenGrant {
    access_token: string;
    /** Present on the first authorization (and whenever consent was forced). */
    refresh_token: string | null;
    expires_in: number;
    scope: string;
    id_token: string | null;
}
declare function parseTokenResponse(json: unknown): TokenGrant;
/** The grant's scopes, one by one, so a missing one can be named. */
declare function grantHasScope(grant: Pick<TokenGrant, "scope">, scope: string): boolean;
declare function b64url(bytes: Uint8Array | string): string;
declare function unb64url(s: string): Uint8Array;
/**
 * The id token's claims, read without verification: it arrived in the token
 * endpoint's own answer over TLS, so its issuer is not in question, and the
 * one claim read from it — the email — is shown on a card, never trusted for
 * access. A malformed token yields nothing.
 */
declare function idTokenClaims(idToken: string | null | undefined): {
    email: string | null;
    sub: string | null;
};
interface OAuthState {
    /** The workspace. */
    t: string;
    /** The person. */
    u: string;
    /** A nonce. */
    n: string;
    /** Expiry, epoch ms. */
    exp: number;
}
declare function signState(secret: string, s: OAuthState): Promise<string>;
/** The state back from Google: its signature, its expiry, then its claims — or the reason it is refused. */
declare function verifyState(secret: string, state: string | null | undefined, nowMs: number): Promise<{
    ok: true;
    state: OAuthState;
} | {
    ok: false;
    reason: "missing" | "malformed" | "signature" | "expired";
}>;
declare function newNonce(): string;

export { type A2PAnswer, type A2PPorts, type A2PRequest, type A2PResult, type A2PState, type A2PStep, A2P_POLICIES, A2P_STEPS, type AgentPlan, type AvailableNumber, type BrandType, type BusinessRecord, CALLER_UNKNOWN, CALL_ANALYSIS_FIELDS, type CampaignFacts, DEFAULT_FN_URL, type DryCall, type DryProvider, EMPTY_A2P_STATE, FACTS_UNAVAILABLE, FRESH_SLACK_MS, GBP_ACCOUNTS_URL, GBP_INFO_BASE, GBP_LOCATIONS_READ_MASK, GBP_REPLY_MAX, GBP_REVIEWS_MAX_PAGES, GBP_REVIEWS_PAGE, GBP_V4_BASE, GOOGLE_AUTH_URL, GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL, GREETING_DEFAULT, type GbpAccount, type GbpLocation, type GbpReview, type GbpReviewsPage, HANDOFF_VAR, type KnownReview, LINE_COSTS, LINE_STEPS, LOW_VOLUME_USECASE, type LinePorts, type LineProvider, type LineProviderName, type LineRow, type LineSecrets, type LineStep, type LineVoiceState, type ListCallsPage, type ListingBefore, type ListingCheckPlan, type LiveAgentSettings, type LiveCallControl, type LiveVoiceLlm, MESSAGING, type NormalizedCall, type NormalizedInbound, type OAuthClient, type OAuthState, PLACES_BASE, PLACES_DETAILS_MASK, PLACES_SEARCH_LIMIT, PLACES_SEARCH_MASK, PLACES_TIMEOUT_MS, PLACE_ID, PROFILE_SCOPES, type PlaceCandidate, type PlaceDetails, type PlaceReview, PlacesError, type PlacesHttp, type PlacesRequest, type ProfileBefore, type ProfileSyncPlan, type ProviderAccount, type ProvisionAction, type ProvisionSecrets, type ProvisionStep, type ProvisionStepId, RETELL_ORIGINATION, REVIEW_BELL_MAX, type RecordingFetch, type RetellAgentConfig, type RetellCall, type RetellConfig, type RetellLlmConfig, type RetellTool, type RetellTranscriptTurn, type RetellWrite, type ReviewBell, SMS_FOOTER, SMS_HELD_DETAILS, SMS_HELD_REASON, SMS_MAX_CHARS, STATE_TTL_MS, type SagaResult, type SendResult, type SmsInbound, type SmsRegistrationState, type SmsSendResult, TRUSTHUB, type TokenGrant, type TwilioAnswer, TwilioError, type TwilioHttp, VOICE_AGENT_DEFAULTS, VOICE_LLM_DEFAULTS, VOICE_NUMBER_DEFAULTS, VOICE_SHELL_BEGIN, VOICE_SHELL_PROMPT, VOICE_WEBHOOK_EVENTS, VOICE_WEBHOOK_TIMEOUT_MS, type VoiceConvergencePlan, type VoiceProvisionPlan, type VoiceProvisionRequest, type VoiceProvisionState, type VoiceShellTarget, type WaChangeValue, type WaConfig, type WaMediaRef, type WaRawMessage, a2pProfileEndUserRequest, a2pProfileRequest, accountsRequest, addressRequest, agentSettingsDrift, assignRequest, authorizeUrl, availabilityUrl, b64url, brandRequest, brandTypeFor, businessAttributes, businessEndUserRequest, callSummaryLine, campaignRequest, chooseLineProvider, cleanReply, createAgent, createAgentVersion, createPhoneNumber, createRetellLlm, customerProfileRequest, deleteCampaignRequest, deleteReplyRequest, desiredVoiceShell, dryProvider, encodeForm, evaluateRequest, evaluateTrustProductRequest, fetchMediaBytes, fetchRecording, fetchTwilio, getAgent, getAgentRaw, getCall, getPhoneNumber, getPlace, getRetellLlm, grantHasScope, idTokenClaims, importPhoneNumber, isAreaCode, isBrandNotReady, isE164, isValidSipPassword, keywordsFor, listAccounts, listCalls, listLocations, listReviews, liveTurns, locationsRequest, needsHydration, newNonce, nextA2PStep, nextLineStep, normalizeCall, normalizeInbound, parseAccounts, parseLocations, parsePlaceDetails, parsePlacesSearch, parseReviewsPage, parseTokenResponse, parseTranscriptText, placesDetailsRequest, placesFetch, placesSearchRequest, planAgentSettings, planListingCheck, planProfileSync, planVoiceConvergence, planVoiceProvision, publishAgentVersion, registrationVerdict, replyRequest, replyToReview, representativeAttributes, representativeEndUserRequest, retellImportBody, reviewBells, reviewIdOf, reviewParent, reviewsRequest, revokeRequest, runA2PSaga, runLineSaga, sameSignature, searchPlaces, sendTemplate, sendText, signState, sipPassword, sipUsername, smsAsWaMessage, smsBody, smsInboundFrom, smsInboundUrl, smsStateFor, soleProprietorEndUserRequest, soleProprietorProfileRequest, starRatingNumber, starterAttributes, starterEndUserRequest, starterProfileRequest, stripKey, submitProfileRequest, submitTrustProductRequest, supportingDocumentRequest, tokenExchangeRequest, tokenRefreshRequest, trunkDomain, trustProductAssignRequest, twilioProvider, twilioSignature, twilioSignedString, twilioUrls, unb64url, updateAgent, updateCampaignRequest, updateEndUserRequest, updateLiveCall, updatePhoneNumber, verifyRetellSignature, verifyState, verifyTwilioSignature, voiceAgentCreateBody, voiceEndpoints, voiceLlmCreateBody, voiceNumberBindBody, voiceNumberBinding, voiceNumberCreateBody, voiceShellDrift, voiceShellTools, withKey };
