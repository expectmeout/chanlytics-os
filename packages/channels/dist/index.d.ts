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
}
/**
 * The spoken turns of a LIVE transcript, in the stored turn shape.
 *
 * `transcript_with_tool_calls` interleaves speech with tool invocations and
 * results; the dashboard renders speakers, so everything that is not an
 * agent or user turn is dropped. Null when there is nothing spoken yet, so
 * the upsert's coalesce keeps whatever the row already holds.
 */
declare function liveTurns(items: RetellCall["transcript_with_tool_calls"]): RetellTranscriptTurn[] | null;
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
}
/** GET /get-agent — the fields above, read-only. Null when the provider says no. */
declare function getAgent(cfg: RetellConfig, agentId: string): Promise<RetellAgentConfig | null>;
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
 * ONE definition, in code, for three readers: the converger script that
 * brings a live agent onto it, the diagnostic that reports whether a line
 * has drifted off it, and the provisioning script for a new tenant (a mirror,
 * pinned equal by a test). The live salon agent predates all of this and was
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
/** The agent-level fields the plan reads, as get-agent returns them. */
interface LiveAgentSettings {
    webhook_events?: string[] | null;
    webhook_timeout_ms?: number | null;
    opt_in_signed_url?: boolean | null;
    data_storage_retention_days?: number | null;
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

export { type AgentPlan, CALLER_UNKNOWN, DEFAULT_FN_URL, FACTS_UNAVAILABLE, GREETING_DEFAULT, HANDOFF_VAR, type ListCallsPage, type LiveAgentSettings, type LiveCallControl, type LiveVoiceLlm, type NormalizedCall, type NormalizedInbound, type RecordingFetch, type RetellAgentConfig, type RetellCall, type RetellConfig, type RetellLlmConfig, type RetellTool, type RetellTranscriptTurn, type SendResult, VOICE_SHELL_BEGIN, VOICE_SHELL_PROMPT, VOICE_WEBHOOK_EVENTS, VOICE_WEBHOOK_TIMEOUT_MS, type VoiceConvergencePlan, type VoiceShellTarget, type WaChangeValue, type WaConfig, type WaMediaRef, type WaRawMessage, agentSettingsDrift, callSummaryLine, desiredVoiceShell, fetchMediaBytes, fetchRecording, getAgent, getCall, getRetellLlm, listCalls, liveTurns, needsHydration, normalizeCall, normalizeInbound, planAgentSettings, planVoiceConvergence, sendTemplate, sendText, updateLiveCall, verifyRetellSignature, voiceShellDrift, voiceShellTools };
