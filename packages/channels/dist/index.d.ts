import { SchemaSet } from '@chanlytics/contracts';

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
    /** The words were the OFFERS ones specifically -- express written consent to be marketed to, which is a separate answer. */
    optInMarketing: boolean;
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

/**
 * Retell voice adapter (Blueprint P2) — the second channel, mirroring the
 * WhatsApp adapter's shape: normalize provider payloads into a canonical
 * object, expose provider I/O, own provider-specific crypto. No persistence,
 * no decisions, no tenant facts: config is passed in.
 *
 * Field names verified against the LIVE Retell account (2026-08-27).
 */

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
declare function updateLiveCall(cfg: RetellConfig, callId: string, control: LiveCallControl): Promise<{
    ok: boolean;
    status: number;
}>;
/**
 * POST /v2/stop-call — end a hosted agent's ongoing call. 204 from the
 * provider; returned as a status like updateLiveCall, so a call that ended a
 * moment ago is a sentence in a route, not an exception.
 */
declare function stopCall(cfg: RetellConfig, callId: string): Promise<{
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
 *
 * It must never be omitted and never be empty. Retell leaves an unsupplied
 * variable in the prompt AS the literal `{{business_facts}}`, and treats ""
 * as a real value that also skips this default -- so the two ways of saying
 * "we have nothing" are an agent reading its own placeholder aloud, or an
 * agent with no knowledge and no idea that it has none. This is the third
 * option: no facts, and told so. The call-start judgement on the edge
 * (apps/edge/lib/call-start.ts) sends this same constant as its fallback, so
 * the shell's default and the webhook's answer cannot drift apart.
 */
declare const FACTS_UNAVAILABLE = "The business's details could not be loaded for this call. Do not state opening hours, prices, services or an address from memory \u2014 you do not have them. Say you will have someone confirm, offer to take a message, and offer to text the booking link.";
/** What the agent is told about a caller when nothing could be read: the shell's default, and the webhook's fallback. */
declare const CALLER_UNKNOWN = "New caller - no prior interactions on record.";
/**
 * The opening line, with the business named only when we know which it is.
 *
 * Composed here rather than typed into Retell's dashboard, so the business
 * NAME does not become a third hand-kept copy of a fact the product already
 * owns -- a rename would otherwise leave the phone greeting saying the old one.
 *
 * A whole sentence, not the name on its own: Retell leaves a variable it
 * cannot fill in the prompt verbatim, and "Thank you for calling
 * {{business_name}}" read down a phone line is worse than any wording. When
 * the business is unknown this simply greets nobody by name, which is never
 * wrong -- and is the shell's own default, below, so the two are one sentence.
 *
 * Both disclosures -- recording, and that this is an automated assistant --
 * live here rather than in the agent's config, because they are promises the
 * product makes and should not be editable by whoever last opened Retell.
 */
declare function greetingFor(name: string | null): string;
/** The greeting with no business named -- never wrong, never a placeholder. */
declare const GREETING_DEFAULT: string;
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
    /**
     * The call webhook's URL. Raw from the provider it may still carry the
     * retired `?key=`; parsed (voice-retell getAgent) the query is gone and
     * webhook_url_keyed says it was there. Either form is the same drift.
     */
    webhook_url?: string | null;
    webhook_url_keyed?: boolean | null;
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
 * second workspace sounds like the first. The voice is Tamsin (MiniMax):
 * Ruben chose it on the salon's line on 17 September 2026 (agent v6, then v7)
 * after Andrea (ElevenLabs) had opened every call before that, and a new
 * workspace should sound like the line customers already hear. The converger
 * never touches an existing agent's voice, so this only reaches agents
 * provisioned from now on. Retention is the product's 90 days; the pipeline
 * copies audio into private storage within seconds.
 */
declare const VOICE_AGENT_DEFAULTS: {
    readonly voice_id: "minimax-Tamsin";
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
/**
 * The shared secret rides the tool header and, as ?key=, the call-start webhook (retell-inbound), whose only
 * credential it is. The call webhook (retell-webhook) carries none: Retell signs every delivery with the badged
 * key, and the signature is that door's credential -- a secret in a URL rides in Retell's dashboard and in access
 * logs, and anyone holding it could forge a call_analyzed.
 */
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
    /**
     * The number this account ALREADY owns, if it owns it. Null when it does not.
     *
     * Buying is the one step of the saga that spends money and the only one whose
     * effect was not checked before it ran. Every other step reads its own receipt --
     * `nextLineStep` derives the whole plan from SIDs and facts on the row -- but a
     * receipt is only written AFTER the provider answers, and the saga's worst case is
     * three times its own lambda ceiling. Killed in that window, the number is bought
     * and the row does not know: we pay for it every month, `release` skips releasing
     * it (`if (line.number_sid)`), `number_drift()` never asks the provider, and a
     * retry can never succeed because a carrier will not sell you a number you
     * already hold.
     *
     * One lookup before the purchase closes all four.
     */
    ownedNumber(acct: ProviderAccount, e164: string): Promise<{
        sid: string;
        e164: string;
    } | null>;
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
    /** `statusCallback`: where the carrier's word on this text is posted (sms-status); without it a text is "sent" forever. */
    sendSms(acct: ProviderAccount, o: {
        serviceSid: string;
        to: string;
        body: string;
        statusCallback?: string;
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

/**
 * Getting a line: a saga of idempotent steps, each recorded on the row
 * before the next runs (plan §5).
 *
 *   subaccount → number → trunk → agent → import → channel
 *
 * A step checks its own effect on the row first and skips what exists, so
 * a retry resumes at the step that failed instead of buying twice. A
 * failure leaves voice_state = failed with the step and the provider's
 * words in last_error; success leaves answering. The saga is pure over its
 * ports — the provider, the row store, the vault, the agent, Retell, the
 * channel row — so the whole thing runs in a test with the dry provider
 * and fakes, and the edge wires the real ones.
 *
 * Secrets (the subaccount token, the SIP password) go to the vault port
 * and never onto the row's facts.
 */

type LineStep = SchemaSet<"lines.step">;
declare const LINE_STEPS: readonly LineStep[];
type LineVoiceState = SchemaSet<"lines.voice_state">;
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
/**
 * What the carrier already decided about this text, and what the carriers'
 * own words say.
 *
 * Twilio recognises the standard opt-out and opt-in words itself, acts on
 * them at the carrier, and says so in OptOutType -- but only when Advanced
 * Opt-Out is switched on for the Messaging Service, so the words are read as
 * well. Either source is enough: a number the carrier has blocked is
 * unreachable whatever our record says, so the record must agree with the
 * carrier. Neither is applied to WhatsApp, which has no carrier rule.
 */
interface CarrierConsent {
    optOut: boolean;
    optIn: boolean;
}
declare function carrierConsent(s: Pick<SmsInbound, "optOutType">): CarrierConsent | null;
/** The carriers' opt-out words, whole-message. Opt-in words stay the product's own (START, UNSTOP, RESUME). */
declare function smsKeywordConsent(body: string | null | undefined): CarrierConsent | null;
declare function mergeConsent(a: CarrierConsent | null, b: CarrierConsent | null): CarrierConsent | null;
/** The normalized message with the carrier's verdict added to its own. Either source is enough. */
declare function withCarrierConsent(n: NormalizedInbound, c: CarrierConsent | null): NormalizedInbound;
/**
 * What the first reply to a number carries, once. Carrier guidance for A2P
 * traffic: the rates disclosure, how to stop, and how to get help -- the third
 * was missing while every sample the campaign files promised it.
 */
declare const SMS_FOOTER = "Msg & data rates may apply. Reply STOP to opt out, HELP for help.";
/** Twilio's ceiling for one message body. */
declare const SMS_MAX_CHARS = 1600;
/** The reply as it goes out: the footer on the first reply to this person, and never over the ceiling. */
declare function smsBody(reply: string, isFirstReply: boolean): string;
/** The hold while the carriers have not approved the line: the Inbox's reason and its words. */
declare const SMS_HELD_REASON = "carriers";
declare const SMS_HELD_DETAILS = "This text arrived on your line before the carriers approved it for texting, so the receptionist did not answer. It is kept here; answer it yourself, or wait for the approval on Setup.";
/** Where a line's texts arrive: beside the voice webhooks, on the same edge. */
declare function smsInboundUrl(fnUrl: string): string;
/** Where the carrier's word on a text we sent arrives: the StatusCallback on every send. */
declare function smsStatusUrl(fnUrl: string): string;
/** One status callback's fields as one object; null when it is not one. */
interface SmsStatus {
    messageSid: string;
    /** Twilio's word: queued, accepted, sending, sent, delivered, undelivered, failed, canceled, read. */
    status: string;
    /** The carrier's reason when it refused, as Twilio numbers it (30007 filtered, 30003 unreachable, ...). */
    errorCode: string | null;
    /** The number the text left from: the line. */
    from: string;
    /** The person it went to. */
    to: string;
    messagingServiceSid: string | null;
    accountSid: string | null;
}
declare function smsStatusFrom(form: Record<string, string>): SmsStatus | null;
/**
 * The row's word for the carrier's. The row is already `sent` when the
 * provider accepted the text, so only what the carrier adds is recorded:
 * delivered, read, or a refusal. The interim words (queued, accepted,
 * sending, scheduled) say nothing the row does not know, and are ignored.
 */
declare function smsStatusToRow(status: string): "sent" | "delivered" | "read" | "failed" | null;
/** The exact string Twilio signs: the URL as requested, then each POST field sorted by name with its value appended. */
declare function twilioSignedString(url: string, form: Record<string, string>): string;
/** HMAC-SHA1 of the signed string with the auth token, base64 — the value of X-Twilio-Signature. */
declare function twilioSignature(authToken: string, url: string, form: Record<string, string>): Promise<string>;
/** Constant-time equality on the two base64 strings. */
declare function sameSignature(a: string, b: string): boolean;
declare function verifyTwilioSignature(authToken: string, url: string, form: Record<string, string>, header: string | null): Promise<boolean>;

/**
 * Email, the part with no network in it: a workspace's addresses, the subject
 * a reply carries, and the REQUEST an email leaves as.
 *
 * The request is built once and frozen. It is written to the queued message's
 * row before the first attempt (meta.email.request) and the wire sends those
 * bytes: a retry repeats them exactly, under the same idempotency key, so a
 * send the provider accepted before a worker died cannot leave twice, and an
 * owner's edit is a new message with a new approval rather than a mutation of
 * one that may already be in somebody's inbox. Everything in it is derived by
 * the server from stored rows. The model writes `text` and nothing else: it is
 * never read for a subject, a recipient or a header.
 *
 * docs/plans/2026-09-17-email-channel.md, §7.
 */
/** What an email is a reply to, read off the stored parent row. */
interface EmailParent {
    /** The Chanlytics message being answered. */
    messageId: string;
    /** Its own Message-ID header, when it had one. */
    rfcMessageId: string | null;
    /** The chain it carried, oldest first. */
    references: string[];
    subject: string | null;
}
/** Who a workspace's email leaves as. */
interface EmailIdentity {
    fromName: string;
    fromAddress: string;
    replyTo: string;
}
/** The frozen request: the body of Resend's POST /emails, and the key it is sent under. */
interface EmailRequest {
    from: string;
    to: string[];
    reply_to: string[];
    subject: string;
    text: string;
    html: string;
    headers: Record<string, string>;
    tags: Array<{
        name: string;
        value: string;
    }>;
    idempotency_key: string;
}
interface EmailRequestInput {
    identity: EmailIdentity;
    /** The person's stored address (normalizeEmail's spelling). */
    to: string;
    parent: EmailParent;
    /** The words, as the receptionist or a person wrote them. */
    body: string;
    /** Composed from the business's profile by the caller; null sends none. */
    signature: string | null;
    /** Who wrote the words: decides Auto-Submitted. */
    actor: "ai" | "human";
    /** The queued row this request belongs to: the idempotency key, and the tag every receipt names it by. */
    messageId: string;
    tenantId: string;
}
/** bestmovers@mail.chanlytics.com: the address a workspace publishes and sends from. */
declare function hostedAddress(localPart: string, domain: string): string;
/** r+<token>@mail.chanlytics.com: where a reply comes back. It routes to a workspace; it authenticates nobody. */
declare function replyRouteAddress(replyToken: string, domain: string): string;
/** A workspace's hosted identity, from its mailbox row and the deployment's mail domain. */
declare function hostedIdentity(mailbox: {
    local_part: string;
    reply_token: string;
    from_name: string;
}, domain: string): EmailIdentity;
/** `"Name" <address>`, the name quoted so a comma or a bracket in it cannot end it early. */
declare function mailboxHeader(name: string, address: string): string;
/** "Re: <their subject>", once, however many prefixes the chain has stacked. A parent without one still gets a subject a person can find. */
declare function replySubject(parentSubject: string | null | undefined): string;
/**
 * The HTML twin of plain words: paragraphs and line breaks, escaped, nothing
 * else. It exists because mail clients render plain text worse than they
 * should, not to carry design; no markup from the words survives into it.
 */
declare function emailHtml(text: string): string;
/** A Message-ID as a header carries it, angle brackets and all; null for anything that is not one. */
declare function messageIdHeader(id: string | null | undefined): string | null;
/** The chain a reply carries: the parent's chain, then the parent. Bounded, oldest dropped first, the root kept. */
declare function referencesFor(parent: Pick<EmailParent, "rfcMessageId" | "references">): string[];
/**
 * The request one reply leaves as.
 *
 * - From and Reply-To are the workspace's identity; To is the person's stored
 *   address. Neither is read from the parent's headers or from the words.
 * - In-Reply-To and References thread it under the parent in the customer's
 *   client. No Message-ID is minted here: the provider assigns one and reports
 *   it on the sent event, which is where the ledger learns it.
 * - A receptionist's reply says so in the header a mail system reads
 *   (Auto-Submitted: auto-replied, RFC 3834), so an auto-responder on the
 *   other side does not answer it and start a loop. A person's own reply
 *   carries no such mark.
 * - The tags name the row and the workspace, so a receipt finds its message
 *   without a lookup by the provider's id, even one that arrives before the
 *   send's own write.
 */
declare function buildEmailRequest(i: EmailRequestInput): EmailRequest;
/** Is this stored value a request the wire may send? The row's meta is JSON; the wire trusts its shape, not its type. */
declare function isEmailRequest(v: unknown): v is EmailRequest;
interface SvixHeaders {
    id: string | null;
    timestamp: string | null;
    signature: string | null;
}
/** How far a webhook's clock may be from ours: a captured delivery is not replayable for longer. */
declare const WEBHOOK_TOLERANCE_S = 300;
/** The signature Svix computes for one delivery, base64; null when the secret is not one. Exported because a test signs with it, as twilioSignature is. */
declare function resendWebhookSignature(secret: string, id: string, timestamp: string, rawBody: string): Promise<string | null>;
/**
 * Is this delivery Resend's? Resend signs with Svix: HMAC-SHA256 over
 * `<svix-id>.<svix-timestamp>.<raw body>`, keyed with the bytes behind the
 * endpoint's `whsec_` secret, sent as one or more space-separated `v1,<base64>`
 * entries (more than one while a secret is being rotated). The RAW body, as it
 * arrived: a re-serialised one signs differently. Web Crypto, like the Meta,
 * Twilio and Retell verifiers beside it, so it runs on the edge as it is.
 *
 * It proves who sent the EVENT. It says nothing about who sent the email the
 * event is about.
 */
declare function verifyResendWebhook(secret: string | undefined, h: SvixHeaders, rawBody: string, nowMs: number): Promise<boolean>;
/** Which of the platform's addresses a delivery names: a workspace's published one, or a reply route. */
type PlatformRecipient = {
    kind: "mailbox";
    localPart: string;
} | {
    kind: "reply";
    token: string;
};
/**
 * An address on the platform's mail domain, read for what it routes to; null
 * for any other address. Exact: the domain must be the deployment's, the local
 * part one the table could hold (00126). Nothing is inferred from a display
 * name, and a plus tag on a published address is not a second mailbox.
 */
declare function platformRecipient(address: string, domain: string): PlatformRecipient | null;
/** `Ana Reyes <ana@x.com>` or `ana@x.com`: the address and the phrase, apart. The phrase is the sender's own and proves nothing. */
declare function addressOf(header: string | null | undefined): {
    address: string;
    name: string | null;
} | null;
/** One received email as the webhook announces it: a pointer, and who it was delivered to. */
interface EmailReceivedEvent {
    type: "email.received";
    receivedId: string;
    /**
     * The addresses this delivery was made to, lower-cased. `received_for` is the
     * envelope: who the provider accepted the email FOR, which is what a forward
     * and a blind copy arrive under, and which the sender's own To and Cc lines
     * cannot rewrite. When an event carries it, nothing else routes. An event
     * without it is read by its To, Cc and Bcc, which can only name more of the
     * platform's own addresses than the envelope did, never somebody else's.
     */
    recipients: string[];
}
/** The received event, or null for any other event or shape. Lenient about a list that arrives as one string. */
declare function emailReceivedEventFrom(payload: unknown): EmailReceivedEvent | null;
/** One received email as the provider hands it over when asked for it by id. */
interface ReceivedEmail {
    id: string;
    from: {
        address: string;
        name: string | null;
    } | null;
    to: string[];
    cc: string[];
    subject: string | null;
    text: string | null;
    html: string | null;
    /** Lower-cased names; a header that repeats keeps its first value. */
    headers: Record<string, string>;
    messageId: string | null;
    createdAt: string | null;
    attachments: Array<{
        filename: string | null;
        contentType: string | null;
        size: number | null;
    }>;
}
/** The fetched email, or null when the answer is not one. Headers as a map or as a list of pairs, whichever the provider sends. */
declare function receivedEmailFrom(body: unknown): ReceivedEmail | null;
/** The ids a header lists, as headers carry them. */
declare function messageIdsIn(header: string | null | undefined): string[];
/**
 * What a received email CLAIMS to be, from headers anyone can write. The order
 * is the rule: a delivery report and an automatic reply are tested before the
 * generic automated mark, because both carry it, and each is handled apart.
 *
 *   report     a bounce or a delivery status notification, by email. Recorded
 *              for a person; what stops sends to an address is the provider's
 *              signed receipt, never this.
 *   auto_reply an out-of-office or a responder answering something of ours
 *              (RFC 3834 auto-replied, and the markers older systems use).
 *              Never answered: two responders answering each other is a loop.
 *   automated  mail a program produced or a list sent. Kept, and kept from the
 *              receptionist. (A lead notification is automated mail too; the
 *              day one is parsed, its source is tested before this.)
 *   person     none of the above.
 */
type EmailClaim = "report" | "auto_reply" | "automated" | "person";
declare function classifyReceived(e: Pick<ReceivedEmail, "headers" | "from">): EmailClaim;
type EmailReceiptType = "sent" | "delivered" | "delivery_delayed" | "bounced" | "complained" | "failed" | "suppressed";
interface EmailReceipt {
    type: EmailReceiptType;
    /** The provider's id for the email. */
    providerId: string;
    /** The Message-ID it left with, as a header carries it. */
    rfcMessageId: string | null;
    /** Who it was addressed to, lower-cased. */
    to: string[];
    /** The row and the workspace the request was tagged with; null on an email that was not a workspace's (a platform notification). */
    messageId: string | null;
    tenantId: string | null;
    /** The provider's own account of a bounce, a failure or a suppression. Kept on the row as the provider's words, never shown as ours. */
    detail: {
        kind: string | null;
        subKind: string | null;
        message: string | null;
    };
}
/** A receipt, or null for any other event or shape. */
declare function emailReceiptFrom(payload: unknown): EmailReceipt | null;
/** Why an address stopped being sent to (00126's CHECK). */
type EmailSuppressionReason = "hard_bounce" | "complaint" | "provider";
interface EmailReceiptEffect {
    /** Where the row moves, when it moves. Forward only and terminal kept: messages_guard's rule, not this function's. */
    status: "delivered" | "failed" | null;
    /** What the row keeps about a failure. */
    error: {
        provider: EmailReceiptType;
        kind: string | null;
        sub_kind: string | null;
        message: string | null;
    } | null;
    /** The address stops being sent to. About the ADDRESS, so it is kept apart from the row's own fate. */
    suppress: EmailSuppressionReason | null;
}
/**
 * What one receipt changes.
 *
 * A bounce fails the row, and stops the address only when the provider calls it
 * permanent: a full mailbox is not a dead one. A complaint arrives after
 * delivery, so the row stays delivered and the address stops. A send the
 * provider suppressed never left, so it failed, and the address is on the
 * provider's list whatever ours says. `sent` and `delivery_delayed` move
 * nothing: the first is the send's own word to say (deliver.ts), the second is
 * interim.
 */
declare function emailReceiptEffect(r: EmailReceipt): EmailReceiptEffect;
/** The addresses one workspace's email may leave as and be answered at: what the wire holds a frozen request to. */
interface EmailSendsAs {
    /** The From address. */
    address: string;
    /** Every Reply-To that still routes to this workspace: the live reply route, and the rotated-out one until it is revoked. */
    replyRoutes: string[];
}
/** What a mailbox row sends as, on the deployment's mail domain. */
declare function sendsAs(mailbox: {
    local_part: string;
    reply_token: string;
    reply_token_prev: string | null;
}, domain: string): EmailSendsAs;
/**
 * Does this frozen request leave as this workspace and nobody else? The
 * request is JSON on a row; the wire is bound to a workspace's mailbox. A
 * request whose From or Reply-To is another's is refused rather than sent, the
 * same promise the WhatsApp wire keeps by taking its credentials from the
 * tenant and never from the environment.
 */
declare function requestLeavesAs(request: EmailRequest, as: EmailSendsAs): boolean;
/** What a domain is configured FOR. Not whether it works: a verified domain can be configured not to receive at all. */
type MailCapability = "enabled" | "disabled" | "unknown";
/**
 * One domain as the provider describes it. `status` is kept as the word that
 * arrived rather than narrowed to a union: a status this code has never heard
 * of must read as "not verified", never as healthy, and a union would have to
 * guess which. The judgement is the caller's (edge mail-domain.ts).
 */
interface MailDomainFacts {
    name: string;
    status: string;
    sending: MailCapability;
    receiving: MailCapability;
}
/** The domains in a list answer; null when the answer is not a list of domains at all, which is not the same as "no domains". */
declare function mailDomainsFrom(body: unknown): MailDomainFacts[] | null;

declare function emailPlainText(e: Pick<ReceivedEmail, "text" | "html">): string | null;

/**
 * Email over Resend: the one function with a network in it.
 *
 * It sends a request that was built and frozen elsewhere (email.ts) and says
 * what happened. Like every send adapter here it RETURNS a result and never
 * throws, and it is bounded: a hung connection must not take the worker's
 * whole run with it (whatsapp.ts postGraph says why).
 *
 * The Idempotency-Key is the request's own, which is the queued row's id.
 * Resend honours a key for 24 hours and answers a repeated key with the first
 * send's result, so the one retry the ledger allows cannot deliver twice; a
 * repeated key with a different payload is refused (409), which a frozen
 * request never produces.
 */

interface ResendConfig {
    apiKey: string;
}
declare function sendEmail(cfg: ResendConfig, request: EmailRequest): Promise<SendResult>;
/**
 * One received email, by the id its webhook named. `null` is the provider
 * saying it has no such email (404): a fact, and the intake ends. Anything
 * else that is not an email THROWS, because "we could not ask" is not "it is
 * gone": the ledger keeps the job and tries it again later (packages/jobs
 * RETRY_WAITS_MS), and fails it only when the last try throws too.
 */
declare function fetchReceivedEmail(cfg: ResendConfig, receivedId: string): Promise<ReceivedEmail | null>;
/**
 * Every domain this account holds, with what the provider makes of each. Read
 * by the health check to see whether the one we send and receive on is still
 * verified.
 *
 * It THROWS rather than answering an empty list when it cannot ask, for the
 * reason fetchReceivedEmail does: "we could not reach the provider" is not
 * "the provider has no such domain", and only one of those is worth waking
 * somebody for.
 */
declare function fetchMailDomains(cfg: ResendConfig): Promise<MailDomainFacts[]>;

/**
 * A2P 10DLC: registering one workspace with the carriers, as pure parts.
 *
 * The shape of it, from Twilio's ISV walkthrough: the business on record
 * becomes a secondary customer profile under Chanlytics' own approved
 * primary profile, that profile carries the business, the person who
 * signs for it and the address, it is evaluated and submitted, an A2P
 * messaging profile is built beside it, a brand is registered from the
 * two, and a campaign is attached to the line's Messaging Service. Each
 * step records what it made before the next runs, so a resumed
 * registration repeats nothing and pays nothing twice.
 *
 * Policy ids read from Twilio's own Policies endpoint on 2026-09-08, not
 * copied from a blog. Request shapes verified the same day against the
 * ISV onboarding guide, the BrandRegistrations resource and the
 * UsAppToPerson resource.
 *
 * WHOSE ACCOUNT. Every call here is made as the WORKSPACE'S OWN subaccount,
 * which is what Twilio's ISV guide asks for: "create a Secondary Customer
 * Profile under the customer's subaccount and register a Brand under the
 * customer's subaccount". A brand registered on the parent is not shared
 * with the subaccount that owns the Messaging Service, and the campaign is
 * refused with 21717 — after the brand is registered and, on a real filing,
 * paid for. Chanlytics' own primary profile is not moved into the
 * subaccount; it is REFERENCED by sid, and that reference is the whole
 * declaration that this business is ours.
 */

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
/**
 * Correct a campaign in place, which is the whole remedy for a refused one.
 *
 * EVERYTHING TWILIO WILL ACCEPT, and no more. Their documentation is explicit
 * about both halves: the update takes the description, the message flow, the
 * samples, the four booleans and the two policy URLs -- and "any parameters
 * included in the original Campaign CREATE call, but not specifically mentioned
 * in the update table, cannot be edited under any circumstances", naming opt-in,
 * opt-out and help information and the use case. Those need a delete and a
 * recreate, which is a second vetting fee.
 *
 * The two URLs were being dropped, and the map of this file called that out:
 * seven of the fourteen fields the create sends were written once and could
 * never be corrected. Two of them can be, and now are. A campaign filed from an
 * edge deployment whose DASHBOARD_ORIGIN was unset carries a wrong privacy URL
 * permanently otherwise.
 *
 * Editing a FAILED campaign is free: "a vetting fee is assessed only once per
 * Campaign."
 */
declare function updateCampaignRequest(messagingServiceSid: string, campaignSid: string, f: Pick<CampaignFacts, "description" | "messageFlow" | "samples" | "privacyPolicyUrl" | "termsUrl">): A2PRequest;
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
type A2PStep = SchemaSet<"lines.reg_step">;
/** In the order the saga walks them; schema-agreement.ts holds them to the column. */
declare const A2P_STEPS: readonly ["profile", "business", "representative", "address", "document", "primary", "submit", "a2p_profile", "brand", "campaign"];
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
/**
 * Why the carriers refused, in their own words -- or null when nothing was
 * refused.
 *
 * THE DEFECT THIS EXISTS FOR. The sweep read `brand.failure_reason` and nothing
 * else, so a refused CAMPAIGN -- which is most of them, and the only kind that
 * can be fixed and resent -- fell through to the generic
 * "the carriers sent the registration back". That sentence is what the owner's
 * row showed, what the bell said, and what the back office had to work from:
 * a rejection with the reason deleted, which is the same thing as no rejection
 * notice at all. Twilio had the answer the whole time, in
 * `compliance[0].errors[]`, one level below where anyone looked -- the same
 * mistake, in the same object, that once left every text held for weeks.
 *
 * The carriers' own description is kept verbatim apart from their standard
 * preamble ("The campaign submission has been reviewed and it was rejected
 * because ..."), which repeats on every error and pushes the substance past
 * where anybody reads. Stripped only when it matches exactly; anything
 * unfamiliar is passed through untouched rather than mangled.
 */
interface CampaignError {
    description?: string | null;
    error_code?: number | string | null;
    fields?: readonly string[] | null;
}
declare function refusalWords(o: {
    brandFailureReason?: string | null;
    campaignErrors?: readonly CampaignError[] | null;
}): string | null;
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

declare const EDGE_TOKEN_TTL_MS = 60000;
interface EdgeClaims {
    /** The door this token opens, as its path: "/api/admin/lines". */
    aud: string;
    /** The workspace the call is for, or null for a call about no workspace. */
    ws: string | null;
    /** The person behind the call, or null. */
    user: string | null;
    iat: number;
    exp: number;
    nonce: string;
}
declare function signEdgeToken(secret: string, aud: string, ctx?: {
    workspace?: string | null;
    user?: string | null;
}, nowMs?: number): string;
type EdgeTokenVerdict = {
    ok: true;
    claims: EdgeClaims;
} | {
    ok: false;
    reason: "malformed" | "signature" | "audience" | "expired";
};
/** Signature first, in constant time; only a signed payload is parsed. */
declare function verifyEdgeToken(secret: string, token: string, aud: string, nowMs?: number): EdgeTokenVerdict;

export { type A2PAnswer, type A2PPorts, type A2PRequest, type A2PResult, type A2PState, type A2PStep, A2P_POLICIES, A2P_STEPS, type AgentPlan, type AvailableNumber, type BrandType, type BusinessRecord, CALLER_UNKNOWN, CALL_ANALYSIS_FIELDS, type CampaignError, type CampaignFacts, type CarrierConsent, DEFAULT_FN_URL, type DryCall, type DryProvider, EDGE_TOKEN_TTL_MS, EMPTY_A2P_STATE, type EdgeClaims, type EdgeTokenVerdict, type EmailClaim, type EmailIdentity, type EmailParent, type EmailReceipt, type EmailReceiptEffect, type EmailReceiptType, type EmailReceivedEvent, type EmailRequest, type EmailRequestInput, type EmailSendsAs, type EmailSuppressionReason, FACTS_UNAVAILABLE, FRESH_SLACK_MS, GBP_ACCOUNTS_URL, GBP_INFO_BASE, GBP_LOCATIONS_READ_MASK, GBP_REPLY_MAX, GBP_REVIEWS_MAX_PAGES, GBP_REVIEWS_PAGE, GBP_V4_BASE, GOOGLE_AUTH_URL, GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL, GREETING_DEFAULT, type GbpAccount, type GbpLocation, type GbpReview, type GbpReviewsPage, HANDOFF_VAR, type KnownReview, LINE_COSTS, LINE_STEPS, LOW_VOLUME_USECASE, type LinePorts, type LineProvider, type LineProviderName, type LineRow, type LineSecrets, type LineStep, type LineVoiceState, type ListCallsPage, type ListingBefore, type ListingCheckPlan, type LiveAgentSettings, type LiveCallControl, type LiveVoiceLlm, MESSAGING, type MailCapability, type MailDomainFacts, type NormalizedCall, type NormalizedInbound, type OAuthClient, type OAuthState, PLACES_BASE, PLACES_DETAILS_MASK, PLACES_SEARCH_LIMIT, PLACES_SEARCH_MASK, PLACES_TIMEOUT_MS, PLACE_ID, PROFILE_SCOPES, type PlaceCandidate, type PlaceDetails, type PlaceReview, PlacesError, type PlacesHttp, type PlacesRequest, type PlatformRecipient, type ProfileBefore, type ProfileSyncPlan, type ProviderAccount, type ProvisionAction, type ProvisionSecrets, type ProvisionStep, type ProvisionStepId, RETELL_ORIGINATION, REVIEW_BELL_MAX, type ReceivedEmail, type RecordingFetch, type ResendConfig, type RetellAgentConfig, type RetellCall, type RetellConfig, type RetellLlmConfig, type RetellTool, type RetellTranscriptTurn, type RetellWrite, type ReviewBell, SMS_FOOTER, SMS_HELD_DETAILS, SMS_HELD_REASON, SMS_MAX_CHARS, STATE_TTL_MS, type SagaResult, type SendResult, type SmsInbound, type SmsRegistrationState, type SmsSendResult, type SmsStatus, type SvixHeaders, TRUSTHUB, type TokenGrant, type TwilioAnswer, TwilioError, type TwilioHttp, VOICE_AGENT_DEFAULTS, VOICE_LLM_DEFAULTS, VOICE_NUMBER_DEFAULTS, VOICE_SHELL_BEGIN, VOICE_SHELL_PROMPT, VOICE_WEBHOOK_EVENTS, VOICE_WEBHOOK_TIMEOUT_MS, type VoiceConvergencePlan, type VoiceProvisionPlan, type VoiceProvisionRequest, type VoiceProvisionState, type VoiceShellTarget, WEBHOOK_TOLERANCE_S, type WaChangeValue, type WaConfig, type WaMediaRef, type WaRawMessage, a2pProfileEndUserRequest, a2pProfileRequest, accountsRequest, addressOf, addressRequest, agentSettingsDrift, assignRequest, authorizeUrl, availabilityUrl, b64url, brandRequest, brandTypeFor, buildEmailRequest, businessAttributes, businessEndUserRequest, callSummaryLine, campaignRequest, carrierConsent, chooseLineProvider, classifyReceived, cleanReply, createAgent, createAgentVersion, createPhoneNumber, createRetellLlm, customerProfileRequest, deleteCampaignRequest, deleteReplyRequest, desiredVoiceShell, dryProvider, emailHtml, emailPlainText, emailReceiptEffect, emailReceiptFrom, emailReceivedEventFrom, encodeForm, evaluateRequest, evaluateTrustProductRequest, fetchMailDomains, fetchMediaBytes, fetchReceivedEmail, fetchRecording, fetchTwilio, getAgent, getAgentRaw, getCall, getPhoneNumber, getPlace, getRetellLlm, grantHasScope, greetingFor, hostedAddress, hostedIdentity, idTokenClaims, importPhoneNumber, isAreaCode, isBrandNotReady, isE164, isEmailRequest, isValidSipPassword, keywordsFor, listAccounts, listCalls, listLocations, listReviews, liveTurns, locationsRequest, mailDomainsFrom, mailboxHeader, mergeConsent, messageIdHeader, messageIdsIn, needsHydration, newNonce, nextA2PStep, nextLineStep, normalizeCall, normalizeInbound, parseAccounts, parseLocations, parsePlaceDetails, parsePlacesSearch, parseReviewsPage, parseTokenResponse, parseTranscriptText, placesDetailsRequest, placesFetch, placesSearchRequest, planAgentSettings, planListingCheck, planProfileSync, planVoiceConvergence, planVoiceProvision, platformRecipient, publishAgentVersion, receivedEmailFrom, referencesFor, refusalWords, registrationVerdict, replyRequest, replyRouteAddress, replySubject, replyToReview, representativeAttributes, representativeEndUserRequest, requestLeavesAs, resendWebhookSignature, retellImportBody, reviewBells, reviewIdOf, reviewParent, reviewsRequest, revokeRequest, runA2PSaga, runLineSaga, sameSignature, searchPlaces, sendEmail, sendTemplate, sendText, sendsAs, signEdgeToken, signState, sipPassword, sipUsername, smsAsWaMessage, smsBody, smsInboundFrom, smsInboundUrl, smsKeywordConsent, smsStateFor, smsStatusFrom, smsStatusToRow, smsStatusUrl, soleProprietorEndUserRequest, soleProprietorProfileRequest, starRatingNumber, starterAttributes, starterEndUserRequest, starterProfileRequest, stopCall, stripKey, submitProfileRequest, submitTrustProductRequest, supportingDocumentRequest, tokenExchangeRequest, tokenRefreshRequest, trunkDomain, trustProductAssignRequest, twilioProvider, twilioSignature, twilioSignedString, twilioUrls, unb64url, updateAgent, updateCampaignRequest, updateEndUserRequest, updateLiveCall, updatePhoneNumber, verifyEdgeToken, verifyResendWebhook, verifyRetellSignature, verifyState, verifyTwilioSignature, voiceAgentCreateBody, voiceEndpoints, voiceLlmCreateBody, voiceNumberBindBody, voiceNumberBinding, voiceNumberCreateBody, voiceShellDrift, voiceShellTools, withCarrierConsent, withKey };
