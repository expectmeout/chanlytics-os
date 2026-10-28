import dns from 'node:dns';
import https from 'node:https';
import { ModelPurpose, ModelSpeed, ModelUsage, SystemOneQuestion, SystemOneAnswer, ChannelKind, SchemaSet, LineCodeDto, EmailClaim, GoogleListingFacts, MailboxProvider, mailboxConnectionDtoOf, MailboxConnectionDto, CompanyFitAnswer, LeadSearchPlan, PlaceFacts, JudgePlaceAnswer, LeadPeoplePlan, CompanyFacts } from '@chanlytics/contracts';
export { EmailClaim, GREETING_DEFAULT, greetingFor } from '@chanlytics/contracts';

/** Every provider a call leaves for: the breaker keeps one state per name. */
declare const PROVIDER_NAMES: readonly ["meta", "twilio", "retell", "resend", "google", "apify", "expo", "anthropic", "typesafe", "elevenlabs", "microsoft", "instagram"];
type Provider = (typeof PROVIDER_NAMES)[number];
/** What a call to a provider came to (the header says each). */
type SendOutcome = "ok" | "refused" | "retryable" | "unknown";
interface ProviderReply {
    outcome: SendOutcome;
    /** The HTTP status, or 0 when no answer came. */
    status: number;
    /** The answer's body as text ("" when none). */
    text: string;
    /** The body parsed as JSON, or null. */
    json: unknown;
    /** A 2xx answer's body, unread, when the call asked for it (`stream`); null otherwise. */
    body: ReadableStream<Uint8Array> | null;
    headers: Headers | null;
    /** How long the provider asked us to wait (Retry-After), in ms, when it said. */
    retryAfterMs: number | null;
    /** Why no answer came: "timeout", "breaker_open", or the network's own words. Null when one came. */
    error: string | null;
    /** How many requests left: 0 when the breaker held the call. */
    tries: number;
}
interface ProviderCall extends Omit<RequestInit, "signal"> {
    /** Each try's bound. Required: a call to a provider without one is the fault this module ends. */
    timeoutMs: number;
    /** Tries in all, the first included (1, no retry, unless said). */
    tries?: number;
    /** Asking again cannot do the work twice: a read, or a write under the provider's idempotency key. */
    idempotent?: boolean;
    /** The longest the whole call may take, its retries and waits included. */
    deadlineMs?: number;
    /** "count": always made, its faults counted, never held by an open breaker (a send to a person). Default "hold". */
    breaker?: "hold" | "count";
    /** The caller's own end, beside each try's bound: a call it abandons ends as a timeout does. */
    signal?: AbortSignal;
    /**
     * Hand a 2xx answer's body back unread (`body`), for a caller that forwards it as it arrives (a model's event
     * stream). Each try's bound still ends the body; any other answer is read as usual.
     */
    stream?: boolean;
}
/** What a test hands in instead of the network and the clock. */
interface ProviderDeps {
    fetch?: typeof fetch;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    /** The draw a backoff is lengthened by (contracts jittered); Math.random when absent. */
    random?: () => number;
}
/** A provider's breaker as it stands: what a report of the platform's health, or a test, reads. */
declare function breakerOf(provider: Provider, now?: number): {
    open: boolean;
    failures: number;
};
/** Every provider's breaker as it stands in this instance, and until when an open one holds: what /api/diag says. */
declare function breakerStates(now?: number): {
    provider: Provider;
    open: boolean;
    failures: number;
    opened: number;
    open_until: string | null;
}[];
/** Every breaker closed: for a test, which must not inherit the last test's outage. */
declare function resetBreakers(): void;
/** One call to a provider, bounded, never thrown, retried only when asking again cannot do the work twice. */
declare function providerFetch(provider: Provider, url: string, call: ProviderCall, deps?: ProviderDeps): Promise<ProviderReply>;
/** An answer's JSON as an object, or null: what most adapters read. */
declare function answerObject(a: ProviderReply): Record<string, unknown> | null;

/**
 * A fetch of an address a person typed: resolve the name, refuse every private answer, and connect to the address that
 * was checked.
 *
 * `feedUrlOk` (contracts) judges the address as a string, so a public name that RESOLVES to a private address passed:
 * a calendar feed at `feed.example.com` whose record points at 169.254.169.254 (a cloud's metadata service) or 10.0.0.5
 * was read from inside the platform's own network, by the preview, the receptionist's availability tool and Ask's
 * openings. Checking the name's addresses first and connecting afterwards is no better: a name can answer once with a
 * public address and again with a private one (DNS rebinding) between the check and the connect. So the check is the
 * connect: the socket's own lookup is replaced by one that resolves the name, refuses the connection if ANY of its
 * addresses is not a public one (a name that answers both is the attack), and hands the socket the address it judged.
 * A redirect is followed hop by hop (up to five; `redirect: "manual"` answers the 3xx as it is), each hop connected to
 * through the same lookup, so a redirect to a private name is refused at its own connect.
 *
 * https and http only; a host that is an IP literal is judged before any socket is made (a literal skips the lookup).
 * The body arrives as a stream, decompressed as fetch does, and capped once decoded (RESPONSE_MAX_BYTES): the callers
 * read a whole page, feed or listing, and a small file that inflates to a gigabyte is an error to the reader, not
 * the platform's memory.
 */

/** One address a name resolved to. */
interface Resolved {
    address: string;
    family: number;
}
/** Every address a name answers (the resolver's seam: a test hands a fake one). */
type Resolve = (host: string) => Promise<Resolved[]>;
/** Whether an address is on the public internet: what a fetch of a person's address may connect to. */
declare function isPublicAddress(address: string): boolean;
/** A name's refusal: it answered an address that is not the public internet's, or nothing. */
declare class NotPublicError extends Error {
    constructor(host: string, detail: string);
}
type LookupCallback = (err: Error | null, address: string | dns.LookupAddress[], family?: number) => void;
/**
 * The lookup a socket is given instead of the system's: it resolves, judges every address, and answers the socket an
 * address that passed. This is what makes the check the connect.
 */
declare function publicLookup(resolve: Resolve): (host: string, options: dns.LookupOptions | number | undefined, callback: LookupCallback) => void;
/** What a caller may supply: the resolver (a test's), and the transport (a test's). */
interface PublicFetchDeps {
    resolve?: Resolve;
    request?: typeof https.request;
}
/**
 * A `fetch` for addresses a person typed. `redirect: "manual"` answers the 3xx as it is (the caller judges the next
 * address); the default follows up to REDIRECTS_MAX hops, each connected to through the same lookup, so a redirect to a
 * private address is refused at its own connect. It takes an AbortSignal. The default resolves through the system and
 * uses node's own http and https; the deps are the seams a test uses.
 */
declare function publicFetch(deps?: PublicFetchDeps): typeof fetch;
/**
 * The fetch every server-side read of an address a person typed goes through: the guarded one, or a test's.
 * (`setPublicFetch`, as `setPg` and `setBearerVerifier` are the other seams the suites stand in for.)
 */
declare function publicFetcher(): typeof fetch;
/** For tests only: stand in for the network. Returns the one before, to put back; null restores the guarded one. */
declare function setPublicFetch(f: typeof fetch | null): typeof fetch | null;

/**
 * A business's own website, read for what it says about itself: its home page as text, and one image it names, each
 * with a time and a byte cap. The lead finder reads other businesses' sites for their marks (D6, the edge's
 * lib/leads/lead-marks.ts), and the dashboard reads a workspace's own site for its logo (00407) on the owner's press:
 * one reading, wherever it is done.
 *
 * The fetch is the caller's (`publicFetcher()` in production, which refuses any address that is not on the public
 * internet, at every hop). Both answer null rather than throwing: a page or an image that cannot be read says nothing,
 * and nothing is wrong.
 */
/** Who is asking, for a site that wants to know: the platform's own reader, with the page that says what it does. */
declare const BOT_USER_AGENT = "ChanlyticsBot/1.0 (+https://chanlytics.com/bot)";
/**
 * One GET of a page as text, for our own reading. It is a business's own home page, asked for once: no redirect chain
 * beyond the platform's own, no cookie kept, nothing followed off the page, and the first ninety kilobytes only -- the
 * head is at the top and the rest is not ours. Anything that is not a page we can read answers null.
 */
declare function pageText(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<string | null>;
/**
 * One GET of an image, never more than `maxBytes`: a length said up front past it is refused before a byte is read,
 * and a body that runs past it is cut off and refused. No AVIF or SVG is asked for, since neither is kept.
 */
declare function imageBytes(fetchImpl: typeof fetch, url: string, timeoutMs: number, maxBytes: number): Promise<Uint8Array | null>;

/** A content block as the port reads it: text is all the platform's callers take from an answer. */
interface ModelBlock {
    type: string;
    text?: string;
    [k: string]: unknown;
}
/** The API's message, as much of it as the callers read. */
interface ModelMessage {
    id: string | null;
    model: string | null;
    stop_reason: string | null;
    content: ModelBlock[];
    usage: Record<string, unknown> | null;
}
type ModelOutcome = "ok" | "rejected" | "unreachable";
interface Asked {
    /** The model the purpose asked first. */
    asked: string;
    /** The model that answered, or the last one tried. */
    model: string;
    /** Whether the fallback was asked. */
    fellBack: boolean;
    /** The HTTP status of the last try (0 when none came). */
    status: number;
    /** The speed the last try was sent at: fast only where the request asked it of a model that runs it. */
    speed: ModelSpeed;
    /** Whether fast mode refused the request (its limit's 429 or its capacity's 529): it went on at standard speed. */
    slowed: boolean;
}
type ModelReply = (Asked & {
    outcome: "ok";
    message: ModelMessage;
    usage: ModelUsage;
    text: string;
}) | (Asked & {
    outcome: "rejected" | "unreachable";
    /** The network's words, "timeout", or the API's error message. */
    error: string;
    /** The API's error type (invalid_request_error, overloaded_error), or timeout or network when none answered. */
    errorType: string;
    /** The API's own body, cut short, for the log. */
    detail: string;
    usage: ModelUsage;
});
type ModelStreamReply = (Asked & {
    outcome: "ok";
    body: ReadableStream<Uint8Array>;
    headers: Headers | null;
}) | (Asked & {
    outcome: "rejected" | "unreachable";
    error: string;
    errorType: string;
    detail: string;
});
interface ModelAsk {
    purpose: ModelPurpose;
    /**
     * The request without its model: system, messages, tools, output_config, … (max_tokens the route's unless named);
     * `speed: "fast"` asks for fast mode, and its beta is added for a model that runs it.
     */
    body: Record<string, unknown>;
    /** The model to ask first; the purpose's own when absent (Ask names its profile, the judge its setting). */
    model?: string;
    /** Beta features, sent as the anthropic-beta header. */
    betas?: string[];
    /** A sooner bound than the route's, for one try. */
    timeoutMs?: number;
    /** Tries after the first on a "not now"; the route's when absent. */
    retries?: number;
    /** The whole call's end (the tries, the waits and the fallback), in ms from its start. */
    deadlineMs?: number;
    /** The caller's own end: an abandoned call is a timeout. */
    signal?: AbortSignal;
}
/** What a test hands in instead of the network and the clock. */
interface ModelDeps {
    fetch?: typeof fetch;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}
/**
 * The API refused the request's format or a beta it names, not its content: a 400 that says so. The caller asks again
 * without it (plain JSON, no beta), as it always has.
 */
declare function formatRejected<R extends {
    outcome: ModelOutcome;
    status: number;
    error?: string;
}>(r: R): r is R & {
    outcome: "rejected";
    error: string;
};
/** Every hold lifted: for a test, which must not inherit the last test's refusal. */
declare function resetFastHolds(): void;
/** One answer from the model the purpose names, or its fallback; never thrown. */
declare function askModel(key: string, ask: ModelAsk, deps?: ModelDeps): Promise<ModelReply>;
/** The API's event stream for one request, from the model the purpose names or its fallback; never thrown. */
declare function streamModel(key: string, ask: ModelAsk, deps?: ModelDeps): Promise<ModelStreamReply>;

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

declare const SYSTEM_ONE_URL = "https://api.typesafe.ai/v1/systemone";
type SystemOneReply = {
    outcome: "ok";
    model: string;
    answers: Record<string, SystemOneAnswer>;
    inputTokens: number;
} | {
    outcome: "rejected" | "throttled" | "unavailable";
    status: number;
    error: string;
};
interface SystemOneAsk {
    state: string;
    questions: Record<string, SystemOneQuestion>;
    /** A sooner bound than the shadow's own. */
    timeoutMs?: number;
    /** The caller's own end: an abandoned call is a timeout. */
    signal?: AbortSignal;
}
/** One System One call; never thrown. */
declare function askSystemOne(key: string, ask: SystemOneAsk, deps?: ModelDeps): Promise<SystemOneReply>;

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
    /**
     * Present when the person came in through a click-to-WhatsApp ad or post: Meta names it (`source_id`) and says what
     * it was (`source_type`). The rest of it (headline, link, click id) is never kept. This is the shape Meta documents,
     * not one a message is trusted to have: `adReferralOf` reads it without assuming any of it.
     */
    referral?: {
        source_id?: string;
        source_type?: string;
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
        pricing?: unknown;
    }>;
    message_echoes?: Array<{
        to?: string;
        id?: string;
        text?: {
            body?: string;
        };
    }>;
    /** A chunk of the chat history the business shared as its app was kept (coexistence, the `history` field). */
    history?: WaHistoryChunk[];
    /** The app's contacts, as the business keeps them there (coexistence, the `smb_app_state_sync` field). */
    state_sync?: WaStateSyncItem[];
    errors?: WaGraphNotice[];
}
/** An error Meta puts in a webhook's value: its code and its words. */
interface WaGraphNotice {
    code?: number;
    title?: string;
    message?: string;
}
/** One message of a shared chat: `to` only on what the business sent. A type-named object holds the contents. */
interface WaHistoryMessage extends Partial<Omit<WaRawMessage, "from" | "id" | "type">> {
    from?: string;
    to?: string;
    id?: string;
    type?: string;
    history_context?: {
        status?: string;
    };
}
/**
 * A chunk of the history (Meta's "Onboarding WhatsApp Business app users"): which of the three phases it belongs to
 * (0 the day before the number connected, 1 back to 90 days, 2 back to 180), its place, how far the whole has come
 * (100 is all of it), and the one-to-one chats in it. A business that turned sharing off is told as an error instead.
 */
interface WaHistoryChunk {
    metadata?: {
        phase?: number;
        chunk_order?: number;
        progress?: number;
    };
    threads?: Array<{
        id?: string;
        messages?: WaHistoryMessage[];
    }>;
    errors?: WaGraphNotice[];
}
/** One contact of the kept app: added or removed, with the names it is kept under (none on a removal). */
interface WaStateSyncItem {
    type?: string;
    contact?: {
        full_name?: string;
        first_name?: string;
        phone_number?: string;
    };
    action?: string;
    metadata?: {
        timestamp?: string;
    };
}
/** Meta's code for a history the business chose not to share, in the app's own prompt. */
declare const WA_HISTORY_NOT_SHARED = 2593109;
/** A message of the history, as the edge keeps it: whose chat, which way it went, its words, and when. */
interface WaHistoryRead {
    /** The chat's WhatsApp id: the customer's, as a message from them names them. */
    thread: string;
    messageId: string;
    direction: "inbound" | "outbound";
    type: "text" | "media";
    body: string | null;
    at: string;
    rawType: string;
    status: string | null;
}
/** What one delivery's history change says: its phase and progress, a refusal to share, and its messages in order. */
interface WaHistoryOf {
    phase: number | null;
    progress: number | null;
    declined: boolean;
    messages: WaHistoryRead[];
}
/**
 * A `history` change read: every chunk's chats as messages, each named by its chat (a business-sent one by its `to`),
 * the furthest phase and progress any chunk says, and whether the business declined to share (code 2593109, on the
 * value or on a chunk). Group chats are never in it; what has no id or no time is left out.
 */
declare function sharedHistoryOf(v: WaChangeValue): WaHistoryOf;
/** A contact the kept app shared: its number as dialled, and the name it is kept under. */
interface WaSyncedContact {
    phone: string;
    name: string | null;
}
/** The contacts a `smb_app_state_sync` change adds; a removal is the app's own business and changes nothing here. */
declare function contactsSyncedOf(v: WaChangeValue): WaSyncedContact[];
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
    /** The ad or post this person clicked to write, when Meta says: its id and kind (K3). Null for a message with none. */
    referral: {
        sourceId: string;
        sourceType: string | null;
    } | null;
}
/**
 * A referral's id and kind as a message may carry them, by the rules above: the id trimmed and kept only when it can
 * always be written, the kind only when it is a plain word. Every wire's adapter reads its own referral through this
 * one rule (an Instagram DM's ad or link too, instagram/instagram-events.ts). Never throws.
 */
declare function storableReferral(rawId: unknown, rawKind: unknown): NormalizedInbound["referral"];
declare function normalizeInbound(m: WaRawMessage, value: WaChangeValue): NormalizedInbound;
/**
 * A WhatsApp message as the one inbound shape (inbound.ts, decision 0001): the normaliser's reading of it, on its wire,
 * by its person. The sender's id is their identity on WhatsApp, and the digits Meta sent it from their number.
 */
declare function inboundFromWhatsapp(m: WaRawMessage, value: WaChangeValue): InboundMessage & {
    channel: "whatsapp";
};
/**
 * What Meta says a message was billed as, on a `sent`, `delivered` or `read` receipt (K8): whether it is billable, the
 * model that priced it and its category and type. Meta sends no amount and no currency, so none is kept: the operator
 * prices a category by the recipient's country with Meta's rate card. A type alias, so it is a Json without a cast.
 */
type WaPricing = {
    billable?: boolean;
    pricing_model?: string;
    category?: string;
    type?: string;
};
/**
 * Meta's `pricing` as kept, read without trusting any of it: each key stands or falls on its own, and nothing but the four
 * is kept. The category is the key the operator prices by, and the cost door refuses an answer without one, so a pricing
 * without a valid category is none (null), and the caller says it was dropped. Never throws.
 */
declare function waPricingOf(raw: unknown): WaPricing | null;
/** Whether a receipt's `errors` say the person stopped marketing messages from this business. Never throws. */
declare function waStoppedMarketing(errors: unknown): boolean;
interface SendResult {
    ok: boolean;
    wamid: string | null;
    status: number;
    errorBody?: string;
    /** The provider's own error code when it gives one: a text's carrier says 21610 for a person who opted out (sms.ts smsRefusalOf). */
    code?: number | null;
    /** Graph's error_subcode, where it gives one: Instagram's refusal of a DM outside its window is code 10, subcode 2018278. */
    subcode?: number | null;
    /**
     * A person's email reply only (core emailSender): whether it left by the connected mailbox it was frozen with, or as
     * the workspace's hosted mailbox's request, and why not by its own when it could not.
     */
    leftAs?: "own" | "mailbox";
    leftAsWhy?: EmailLeftAsWhy;
    /**
     * An email sent from a connected mailbox (decision 0056): the Message-ID it went under and the provider's thread it
     * sits in, which no receipt will bring later. The door stamps both on its row (meta.email.message_id, thread_id).
     */
    email?: {
        messageId: string | null;
        threadId: string | null;
        mailboxId: string;
    };
    /**
     * What the send came to (provider-fetch SendOutcome): `retryable` left nothing and may be tried again later;
     * `unknown` may have been taken, and is never sent again blind. Absent from a wire's own refusal (no credentials, a
     * request it will not send), which asked no provider.
     */
    outcome?: SendOutcome;
}
/**
 * Why a person's reply frozen with a connected mailbox left as the hosted mailbox's request instead (N5, G15).
 * `own_not_sending`: the mailbox it was frozen with stopped sending (signed out, paused, held) between the freeze and
 * the send; `own_has_no_route`: it was removed.
 */
type EmailLeftAsWhy = "no_own_route" | "own_has_no_route" | "own_not_sending" | "twin_names_another_recipient" | "route_refuses_twin";
/**
 * Every Graph send goes through here. Two reasons:
 *
 * 1. A bare `fetch` REJECTS on a network fault (DNS, reset, TLS). That
 *    rejection escaped the webhook's per-message loop into a single outer
 *    catch that returns 200 — so Meta never retried, the loud send-failure
 *    branch never ran, and the remaining messages in the batch were dropped
 *    silently. A send adapter must RETURN a result, never throw.
 * 2. It was unbounded. One hung connection to Graph could consume the whole
 *    60s invocation and take the rest of the batch with it.
 *
 * status 0 means "never reached Meta", which is distinct from any HTTP status. Both are providerFetch's now, which
 * also says what the send came to: Graph's "not now" (graphThrottled) left nothing, so it is `retryable` whatever
 * its HTTP status.
 *
 * One try, under this bound and nothing shorter: the job runner starts a send only while the bound still ends inside its
 * function (jobs ledger startByAt).
 */
declare const WHATSAPP_SEND_TIMEOUT_MS = 15000;
/** Whether Graph refused a send as too many, too fast: HTTP 429, or one of GRAPH_THROTTLE_CODES. */
declare function graphThrottled(r: {
    ok: boolean;
    status: number;
    code?: number | null;
}): boolean;
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
 * One inbound customer message, whatever brought it (decision 0001): the shape each channel's adapter makes at its door
 * and the message path reads. A WhatsApp message (whatsapp.ts inboundFromWhatsapp), a text (lines/sms.ts
 * inboundFromSms) and an Instagram DM (instagram/instagram-events.ts inboundFromInstagram) are made into it; email keeps
 * its own intake (decision 0001, step 6, met by 0071).
 *
 * It is NormalizedInbound (whatsapp.ts) with the wire it came on, and the person as an identity rather than WhatsApp's
 * own two words for them: a wa_id, and the digits a message was sent from, mean nothing in a mailbox or a DM. The rest
 * reads as the normaliser reads it, field for field.
 */

/**
 * An attachment a wire hands over as a link to its bytes rather than an id to ask for them (an Instagram DM's photo, on
 * Meta's CDN): fetched by the link, which expires, so at ingest as WhatsApp's are. Otherwise as WaMediaRef.
 */
interface LinkedMediaRef {
    url: string;
    mime_type: string | null;
    caption: string | null;
    filename: string | null;
    fetch_state: "pending" | "stored" | "failed";
    storage_path?: string;
}
/** An attachment as a message carries it: by the provider's id (WhatsApp), or by a link to it (an Instagram DM). */
type MediaRef = WaMediaRef | LinkedMediaRef;
/** Whether an attachment is reached by its link rather than asked for by the provider's id. */
declare const isLinkedMedia: (m: MediaRef) => m is LinkedMediaRef;
interface InboundMessage {
    /** The wire it came on: every channel a person writes on, which is every channel kind but a call. */
    channel: Exclude<ChannelKind, "voice">;
    /** The provider's id for this delivery: the replay gate. */
    externalId: string;
    /**
     * How this person is known here: their id on the wire (a wa_id, a number's digits, an Instagram-scoped id), their
     * number in E.164 when the wire has one, their address when it is a mailbox.
     */
    identity: {
        externalId: string;
        phoneE164: string | null;
        email: string | null;
    };
    profileName: string | null;
    /** Text or attachment: what messages.type stores. */
    type: NormalizedInbound["type"];
    /**
     * What KIND arrived, which is not the same question (whatsapp.ts NormalizedInbound.kind). A `share` is a post or a reel
     * a person passed on in a DM: legible to a person, with its link in the words, and not the receptionist's to answer.
     */
    kind: NormalizedInbound["kind"] | "share";
    /** The provider's own word for it, for the words an owner reads ("Customer sent a sticker message"). */
    rawType: string;
    body: string | null;
    channelTsIso: string | null;
    media: MediaRef | null;
    /** What the person said about being written to: the wire's own words for stop and start, and its carrier's verdict. */
    consent: {
        optOut: boolean;
        optIn: boolean;
        optInMarketing: boolean;
    };
    /** The ad, post or link this person came from, when the wire says (K3). */
    referral: NormalizedInbound["referral"];
}

/** The header Meta signs a delivery under. */
declare const META_SIGNATURE_HEADER = "x-hub-signature-256";
/** Whether `header` is Meta's signature of `raw` under one of `secrets`; an unset or blank secret proves nothing. */
declare function metaSignatureValid(raw: string, header: string | null | undefined, secrets: ReadonlyArray<string | null | undefined>): boolean;

/** A referral as an Instagram message carries it: a click-to-Instagram ad's id, or an ig.me link's `ref`. */
interface IgReferral {
    source?: string;
    type?: string;
    ad_id?: string;
    ref?: string;
}
/** One `messaging[]` item, as Meta documents it; every field optional, as a payload read defensively is. */
interface IgMessaging {
    sender?: {
        id?: string;
    };
    recipient?: {
        id?: string;
    };
    /** Epoch milliseconds. */
    timestamp?: number;
    message?: {
        mid?: string;
        text?: string;
        is_echo?: boolean;
        is_deleted?: boolean;
        is_unsupported?: boolean;
        attachments?: Array<{
            type?: string;
            payload?: {
                url?: string;
                title?: string;
            };
        }>;
        reply_to?: {
            mid?: string;
            story?: {
                id?: string;
                url?: string;
            };
        };
        quick_reply?: {
            payload?: string;
        };
        referral?: IgReferral;
    };
    postback?: {
        mid?: string;
        title?: string;
        payload?: string;
    };
    reaction?: {
        mid?: string;
        action?: string;
        reaction?: string;
        emoji?: string;
    };
    read?: {
        mid?: string;
    };
    message_edit?: {
        mid?: string;
        text?: string;
        num_edit?: number;
    };
    referral?: IgReferral;
}
/**
 * What one item of a delivery is, for the door:
 *  - message: a person wrote (or tapped): answered through the one shape.
 *  - echo: the business's own message on the thread, from the Instagram app or from us.
 *  - unsent: the person took a message back; its words are not kept.
 *  - ignored: asks nothing of anyone (a reaction, a read, an edit), or is not a message at all.
 */
type InstagramEvent = {
    kind: "message";
    account: string;
    from: string;
    mid: string;
    item: IgMessaging;
} | {
    kind: "echo";
    account: string;
    to: string;
    mid: string;
    text: string | null;
    atIso: string | null;
} | {
    kind: "unsent";
    account: string;
    from: string;
    mid: string;
} | {
    kind: "ignored";
    account: string;
    what: "reaction" | "read" | "edit" | "unknown";
};
/** Every item of an Instagram delivery, in the order Meta sent them; anything that is not its envelope is none. */
declare function instagramEventsOf(body: unknown): InstagramEvent[];
/**
 * A person's DM as the one inbound shape: the item's `mid` is the replay gate, the sender's IGSID their identity (no
 * number, no address), and what they called themselves is the door's to hand in (Meta's webhook carries no name; the
 * door reads it from the person's profile). Typed words, a quick reply's words and a tapped icebreaker's title are words,
 * answered; an attachment is what attachmentOf says. A stop in words stops, START is the way back (both as WhatsApp's
 * reading, stop-request.ts); a DM is never a yes to offers, which go by WhatsApp alone. Null for an item with no id or
 * no sender: there is no replay gate, and nobody to answer.
 */
declare function inboundFromInstagram(item: IgMessaging, profileName: string | null): (InboundMessage & {
    channel: "instagram";
}) | null;

/** The longest text one DM may hold, in UTF-8 bytes. */
declare const INSTAGRAM_DM_MAX_BYTES = 1000;
/** One request, as the wire will make it. */
interface InstagramRequest {
    url: string;
    method: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
}
/** The app as the way in knows it: its Instagram app id, its secret, and the address Meta sends the person back to. */
interface InstagramApp {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}
/** A business's account as a send needs it: its Instagram account id (`/me`'s user_id), and its token. */
interface InstagramConfig {
    accountId: string;
    accessToken: string;
}
/** Instagram's consent screen, for the business's professional account, with the signed state that brings it back. */
declare function instagramAuthorizeUrl(app: Pick<InstagramApp, "clientId" | "redirectUri">, state: string): string;
/** The code as Meta hands it back: it may end in `#_`, which is not part of it. */
declare const instagramCodeOf: (raw: string | null | undefined) => string;
/** The code (valid for an hour, once) traded for a short-lived token. */
declare function instagramCodeRequest(app: InstagramApp, code: string): InstagramRequest;
/** A short-lived token traded for a long-lived one (60 days). */
declare function instagramLongLivedRequest(clientSecret: string, shortToken: string): InstagramRequest;
/** A long-lived token refreshed for another 60 days: at least a day old, and not yet expired. */
declare function instagramRefreshRequest(token: string): InstagramRequest;
/** The account the token speaks for: its Instagram account id (the webhooks' `entry.id`), its handle and its name. */
declare function instagramMeRequest(token: string): InstagramRequest;
/** The account's DMs sent to this app's webhook. */
declare function instagramSubscribeRequest(token: string, accountId: string): InstagramRequest;
/** Graph's own error, when it gave one: its code, subcode and words. */
interface InstagramGraphError {
    code: number | null;
    subcode: number | null;
    message: string;
}
declare function instagramErrorOf(json: unknown): InstagramGraphError | null;
/** What the code exchange gave: the short token, the account's app-scoped id, and what it was granted. */
interface InstagramCodeGrant {
    accessToken: string;
    userId: string;
    permissions: string[];
}
/** The code exchange's answer (Meta documents it as `data[0]`, and has answered it flat); throws with Meta's words when none. */
declare function parseInstagramCodeGrant(json: unknown): InstagramCodeGrant;
/** A long-lived token's answer, from the exchange or a refresh; throws with Meta's words when none. */
declare function parseInstagramToken(json: unknown): {
    accessToken: string;
    expiresInS: number;
};
/** The account `/me` names: its Instagram account id is what its webhooks are addressed to. Throws when it names none. */
declare function parseInstagramMe(json: unknown): {
    accountId: string;
    username: string | null;
    name: string | null;
};
/** What a person is called, from their profile: their name, else their handle, else nothing said. */
declare function instagramNameOf(json: unknown): string | null;
/** What a call to Instagram's Graph came to: providerFetch's answer, and its JSON as an object. */
interface InstagramAnswer {
    outcome: SendOutcome;
    status: number;
    json: Record<string, unknown> | null;
    error: string | null;
}
/** The test's network, or the real one. */
interface InstagramDeps {
    fetch?: typeof fetch;
    now?: () => number;
}
/** One request to Instagram, bounded and never thrown. A read may be asked twice; a write once. */
declare function instagramCall(req: InstagramRequest, opts?: {
    timeoutMs?: number;
    send?: boolean;
}, deps?: InstagramDeps): Promise<InstagramAnswer>;
/** A person's name as their profile has it, or null when it could not be read (never a reason to hold a message). */
declare function readInstagramName(token: string, igsid: string, deps?: InstagramDeps): Promise<string | null>;
/** Whether Instagram refused a send as too many, too fast. */
declare function instagramThrottled(r: {
    ok: boolean;
    status: number;
    code?: number | null;
}): boolean;
/**
 * What Instagram's refusal of a send was, named at the wire so a caller says it in words:
 *  - window_closed: the person last wrote more than 24 hours ago (code 10, subcode 2018278).
 *  - not_reachable: the person cannot be written to now: blocked us, left, or is not found (551; 100 with 2018001).
 *  - token: the business's token is no longer good (190): reconnect.
 * Null for any other failure, and for a send that went.
 */
declare function instagramRefusalOf(r: Pick<SendResult, "ok" | "code" | "subcode">): "window_closed" | "not_reachable" | "token" | null;
/**
 * A reply as the DMs that carry it: one when it fits, else parts of at most `maxBytes` UTF-8 bytes, each ended at the
 * latest paragraph, sentence or word in its second half (else at the room's end), and never inside a character as a
 * person sees one (a grapheme: an accented letter, a flag, a family emoji). Blank parts are not sent.
 */
declare function instagramDmChunks(words: string, maxBytes?: number): string[];
/**
 * A reply sent as one DM or several, in order (instagramDmChunks), from the business's account to the person's IGSID.
 * Its id is the first DM's. A first part that fails is the send's failure as Instagram said it; a later one is a reply
 * the person has the start of: failed, outcome `unknown`, its words saying how many parts left. No part starts once
 * INSTAGRAM_SEND_DEADLINE_MS is spent.
 */
declare function sendInstagramText(cfg: InstagramConfig, to: string, words: string, deps?: InstagramDeps): Promise<SendResult>;
/**
 * An attachment's bytes by its link (a DM's photo or voice note: LinkedMediaRef), or null: a link that is not Meta's CDN's,
 * an answer that is not a 2xx, a body past LINKED_MEDIA_MAX_BYTES (refused from its length up front, or cut off), or any
 * fault. `fetchImpl` is the guarded public fetch (public-fetch.ts), so a link that resolves inside our network is never
 * read. Never throws: the caller stores a 'failed' fetch_state, and the thread still reaches a person.
 */
declare function fetchLinkedMedia(url: string, fetchImpl: typeof fetch): Promise<{
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
    /** What the call was made with (create-web-call, or the inbound webhook's answer): stored by the provider, never read by it. */
    metadata?: Record<string, unknown>;
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
     *  provider sent an object: the CALL_ANALYSIS_FIELDS answers (voice-shell.ts). */
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
type RetellCallRead = {
    kind: "found";
    call: RetellCall;
} | {
    kind: "not_found";
    status: number;
} | {
    kind: "unavailable";
    status: number | null;
    retryAfterMs: number | null;
} | {
    kind: "auth";
    status: number;
};
/**
 * Full call detail — the only source of transcript/transcript_object. Never
 * throws: the answer says what happened, so a sweep can tell a row the
 * provider has no record of from a provider that could not be asked.
 */
declare function getCall(cfg: RetellConfig, callId: string, opts?: {
    timeoutMs?: number;
}): Promise<RetellCallRead>;
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
    /** How long a caller's silence waits before the agent speaks again, and how often; null = the provider's default. */
    reminder_trigger_ms: number | null;
    reminder_max_count: number | null;
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
/** What a browser joins a web call with (POST /v3/create-web-call's answer): the call, its token, its transport. */
interface WebCallMade {
    call_id: string;
    access_token: string;
    transport: string | null;
    ice_servers: unknown[];
    /** When the token stops letting a browser join, epoch ms. */
    expires_at: number | null;
}
/**
 * A web call's request (decision 0069): the agent, the variables a real call's plan gives it (call-start.ts), the call's
 * own voice and length (agent_override, the saved agent untouched), and what the call is in our records (metadata, the
 * provider's to keep and ours to read back on every delivery and tool call). Pure, so a test reads what is sent.
 */
declare function webCallBody(o: {
    agentId: string;
    variables: Record<string, string>;
    voiceId: string | null;
    /** How fast the voice speaks (decision 0073, R7), as a call on the line hears it; null or absent for its own pace. */
    voiceSpeed?: number | null;
    maxMs: number;
    metadata: Record<string, string | number>;
}): Record<string, unknown>;
/** The answer as a browser needs it, or null when it is not one: a call id and a token are the least a join needs. */
declare function webCallMadeOf(body: Record<string, unknown> | null): WebCallMade | null;
/** POST /v3/create-web-call — a call a browser joins with the token it answers; nothing is dialed. */
declare function createWebCall(cfg: RetellConfig, body: Record<string, unknown>): Promise<RetellWrite>;
/** POST /create-retell-llm — the shell as a new LLM (voice-provision.ts builds the body). */
declare function createRetellLlm(cfg: RetellConfig, body: Record<string, unknown>): Promise<RetellWrite>;
/** POST /create-agent — an agent over a Retell LLM, with the product's voice and webhook. */
declare function createAgent(cfg: RetellConfig, body: Record<string, unknown>): Promise<RetellWrite>;
/** POST /create-phone-number — BUYS a number in an area code; it costs money every month. */
declare function createPhoneNumber(cfg: RetellConfig, body: Record<string, unknown>): Promise<RetellWrite>;
/** POST /import-phone-number — a number from an elastic SIP trunk, bound like Retell's own (lines-saga.ts builds the body). */
declare function importPhoneNumber(cfg: RetellConfig, body: Record<string, unknown>): Promise<RetellWrite>;
/**
 * DELETE /delete-phone-number — an imported number taken off Retell (a line released: the carrier has it back, and
 * Retell must stop answering for a number that may be somebody else's next month). Gone already (404) is gone.
 */
declare function deletePhoneNumber(cfg: RetellConfig, number: string): Promise<{
    ok: boolean;
    status: number;
}>;
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
 * (apps/edge/lib/voice/call-start.ts) sends this same constant as its fallback, so
 * the shell's default and the webhook's answer cannot drift apart. It offers nothing it may not be able to do: with no
 * details there is no knowing whether the business has a booking link or a WhatsApp line to send one by, so it takes a
 * message (11 Oct 2026: it offered the link by WhatsApp to every call it was said on).
 */
declare const FACTS_UNAVAILABLE = "The business's details could not be loaded for this call. Do not state opening hours, prices, services or an address from memory \u2014 you do not have them. Say you will have someone confirm, and offer to take their name and a message so the team can call them back. Do not offer to send anything.";
/** What the agent is told about a caller when nothing could be read: the shell's default, and the webhook's fallback. */
declare const CALLER_UNKNOWN = "New caller - no prior interactions on record.";
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
declare function voiceShellTools(fnUrl: string, bookingHeaders?: Record<string, string> | null): RetellTool[];
/** The whole target: what a converged agent's LLM holds. */
declare function desiredVoiceShell(fnUrl: string, bookingHeaders?: Record<string, string> | null): VoiceShellTarget;
/** What the converger reads off a live Retell LLM. */
interface LiveVoiceLlm {
    /** Read for the notes alone: a model or temperature is never changed here (a model change goes through the gate). */
    model?: string | null;
    model_temperature?: number | null;
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
    /** What differs from the product's defaults and is reported, never changed: the model and its temperature. */
    notes: string[];
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
declare function voiceShellDrift(live: LiveVoiceLlm, fnUrl: string): {
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
 * do next, the name they gave, the email address they spelled out, what the
 * call was mainly about and the language it was spoken in (Reports read both,
 * as the receptionist's texts carry the same two: contracts BRAIN_INTENTS,
 * BRAIN_LANGUAGES). The provider's default summary ("The user called Marisa's
 * Beauty Salon to inquire about…") is kept beside it; these are what the strip,
 * the profile and the call card say. The webhook files them through ingest_call
 * (migration 00061): the first four as columns, the rest inside the analysis it
 * keeps whole (calls.analysis). The name and the address are suggestions for the
 * person's page, never applied to the contact by themselves.
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
}, {
    readonly type: "string";
    readonly name: "caller_email";
    readonly description: "The email address the caller gave, exactly as they spelled it out. Leave empty if they did not give one.";
    readonly examples: readonly ["ana.ruiz@example.com", "daniela.r@example.net"];
}, {
    readonly type: "enum";
    readonly name: "topic";
    readonly description: "What the call was mainly about. booking: someone wants to book, reschedule or cancel. pricing: Service and pricing questions, when it is about what something costs. services: Service and pricing questions, when it is about what the business offers. money: a refund, a discount, a deposit, a payment plan or any change to what someone pays. hours: when the business is open. location: where it is or how to get there. complaint: they were unhappy about something. smalltalk: a greeting or a chat with no request. other: none of these.";
    readonly choices: readonly ["booking", "pricing", "money", "hours", "services", "location", "complaint", "smalltalk", "other"];
}, {
    readonly type: "enum";
    readonly name: "language";
    readonly description: "The language the caller mostly spoke. en: English. es: Spanish. other: any other language.";
    readonly choices: readonly ["en", "es", "other"];
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
    /** A locale, a list of them, or the deprecated "multi" (stored as its ten locales); unset is en-US. */
    language?: string | string[] | null;
    reminder_trigger_ms?: number | null;
    reminder_max_count?: number | null;
    voice_id?: string | null;
    post_call_analysis_model?: string | null;
}
interface AgentPlan {
    drift: string[];
    /** The PATCH body for update-agent, or null when nothing differs. */
    agentPatch: Record<string, unknown> | null;
    /** What differs from the product's defaults and is reported, never changed: the voice and the post-call model. */
    notes: string[];
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
    locales?: readonly string[];
}): AgentPlan;
/**
 * The locales an agent listens for, from the languages its workspace speaks, or why what it listens for is kept. Every
 * agent was given Retell's ten-locale "multi", which has recognition choose among ten languages on every word; a
 * workspace that speaks English and Spanish now listens for those two. English is always among them: the greeting is
 * English, so a caller may answer in it. The line is left as it is when the workspace names no language, or names one
 * the table has no locale for (typed by hand, "Spanish (Mexico)", or one Retell lacks, Haitian Creole): narrowed to
 * the rest, a line that understood those callers would stop, for a word nobody meant as a setting.
 */
declare function retellLocalesFor(languages: readonly string[] | null | undefined): {
    locales: string[];
} | {
    kept: string;
};
/**
 * Said whenever the agent's latest version is an unpublished draft. The converger never publishes a draft it did not
 * make in that run: it may hold edits made elsewhere. 11 Oct 2026: a draft was patched in place in silence, and the
 * line kept the old words.
 */
declare function unpublishedLatestNote(version: unknown): string;
/** Said when the converger made a draft and was not told to publish it: a second run will find it and leave it. */
declare function newDraftNote(draft: unknown, published: unknown): string;
/** The diagnostic's view of the agent settings. Strings only. */
declare function agentSettingsDrift(live: LiveAgentSettings): {
    converged: boolean;
    drift: string[];
};

/** The model behind the shell, in Retell's name for it (contracts RETELL_MODELS). Temperature 0: the facts are read, not improvised. */
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
 * provisioned from now on; a workspace's own choice is sent with each call
 * (contracts PHONE_VOICES, the inbound webhook's agent_override). Retention is the product's 90 days; the pipeline
 * copies audio into private storage within seconds.
 */
declare const VOICE_AGENT_DEFAULTS: {
    readonly voice_id: "minimax-Tamsin";
    readonly language: readonly ["en-US", "es-ES", "fr-FR", "de-DE", "hi-IN", "ru-RU", "pt-PT", "ja-JP", "it-IT", "nl-NL"];
    readonly end_call_after_silence_ms: 30000;
    readonly reminder_trigger_ms: 4000;
    readonly reminder_max_count: 2;
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
declare function voiceEndpoints(fnUrl: string): {
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
declare function voiceLlmCreateBody(s: ProvisionSecrets, fnUrl: string): Record<string, unknown>;
/** POST /create-agent: the voice, the webhook and its events, the analysis fields, retention. */
declare function voiceAgentCreateBody(o: {
    llmId: string;
    llmVersion: number | null;
    agentName: string;
}, s: ProvisionSecrets, fnUrl: string): Record<string, unknown>;
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
}, s: ProvisionSecrets, fnUrl: string): Record<string, unknown>;
/** PATCH /update-phone-number: an existing Retell number, bound the same way. */
declare function voiceNumberBindBody(o: {
    agentId: string;
    pinned: boolean;
    nickname: string;
}, s: ProvisionSecrets, fnUrl: string): Record<string, unknown>;
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
 * ElevenLabs Agents, the wire (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.2, §3.6): the agent's
 * conversation token for one browser session, minted on the edge where the key lives; the erase of a conversation
 * once its minutes are written; and the post-call webhook's signature. The agent itself is provisioned from code
 * (tooling/scripts/voice/elevenlabs-agent.mjs) and the custom LLM it calls is the dashboard's brain door, which this
 * module knows nothing of. Every call leaves through providerFetch, bounded and never thrown, and comes back as one of
 * the outcomes a door can answer with: `ok`, `rejected` (the vendor said no; asking again gets the same answer) or
 * `unreachable` (no answer, or "not now": a 429 is the vendor's concurrency or rate limit, sources §9).
 */

/** How far a webhook delivery's clock may be from ours, in seconds: the vendor's own window for a replayed delivery. */
declare const ELEVENLABS_WEBHOOK_TOLERANCE_S: number;
/** The header the post-call webhook's signature rides in: `t=<unix seconds>,v0=<hex>`. */
declare const ELEVENLABS_SIGNATURE_HEADER = "elevenlabs-signature";
interface ElevenLabsConfig {
    apiKey: string;
    agentId: string;
}
type Deps$7 = Parameters<typeof providerFetch>[3];
type ConversationMint = {
    outcome: "ok";
    token: string;
    conversationId: string;
} | {
    outcome: "rejected" | "unreachable";
    status: number;
    error: string;
};
/**
 * A WebRTC conversation token for the private agent, good for one conversation started within minutes (sources §2):
 * `GET /v1/convai/conversation/token?agent_id=…` with the key. The answer names the conversation too, which the
 * post-call webhook will name again.
 */
declare function mintConversationToken(cfg: ElevenLabsConfig, deps?: Deps$7): Promise<ConversationMint>;
type SpeechStream = {
    outcome: "ok";
    body: ReadableStream<Uint8Array>;
    contentType: string;
} | {
    outcome: "rejected" | "unreachable";
    status: number;
    error: string;
};
/**
 * Words spoken, as they are made (`POST /v1/text-to-speech/{voice_id}/stream` with the key): the one-way speech, a
 * brief or an answer read aloud, in Ask's one voice. The vendor's own normaliser reads the figures ("3:30", "12%") as
 * the agent's does (`apply_text_normalization: "on"`); MP3 at 44.1 kHz and 128 kb/s is the format every plan may ask
 * for and every browser plays. The body comes back unread, for the door to hand on as it arrives; the vendor's first
 * byte came in 300 to 550 ms on this account (4 Oct 2026, both models, `apply_text_normalization: on` accepted), so a
 * person hears the first word about when the connection is up. It comes sooner the fewer the words: 280 to 300 ms for
 * one sentence against 470 to 550 for a brief of 600 characters (9 Oct 2026), which is why a reading asks for its
 * first sentence as a clip of its own. `previousText`: the words read just before these in another clip, which the
 * vendor reads these as carrying on from (`previous_text`, accepted on the stream by Turbo v2 and Flash v2.5), so two
 * clips of one reading keep one breath.
 */
declare function speakText(cfg: Pick<ElevenLabsConfig, "apiKey">, input: {
    voiceId: string;
    modelId: string;
    text: string;
    previousText?: string;
}, deps?: Deps$7): Promise<SpeechStream>;
/** The vendor's record of a conversation, erased (`DELETE /v1/convai/conversations/{id}`): what door D does once the minutes are written. */
declare function deleteConversation(cfg: Pick<ElevenLabsConfig, "apiKey">, conversationId: string, deps?: Deps$7): Promise<{
    outcome: "ok" | "rejected" | "unreachable";
    status: number;
}>;
/**
 * The signature the vendor computes for one delivery: HMAC-SHA256, keyed with the webhook's secret, over
 * `<timestamp>.<raw body>`, hex, prefixed `v0=`. Web Crypto, like the Resend, Twilio, Meta and Retell verifiers, so
 * it runs on the edge as it is. Exported because a test signs with it.
 */
declare function elevenLabsWebhookSignature(secret: string, timestamp: string, rawBody: string): Promise<string>;
/**
 * Is this delivery the vendor's? The header's `t` within the window of now, and its `v0` the signature over the RAW
 * body as it arrived (a re-serialised one signs differently). It proves who sent the event and nothing about the
 * conversation it names: the door matches that to a session row of its own.
 */
declare function verifyElevenLabsWebhook(secret: string | undefined, signatureHeader: string | null, rawBody: string, nowMs: number): Promise<boolean>;

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
    findSubaccount(master: ProviderAccount, friendlyName: string): Promise<ProviderAccount | null>;
    findTrunk(acct: ProviderAccount, domainName: string): Promise<{
        sid: string;
        domainName: string;
    } | null>;
    findCredentialList(acct: ProviderAccount, friendlyName: string): Promise<{
        sid: string;
    } | null>;
    findCredential(acct: ProviderAccount, listSid: string, username: string): Promise<{
        sid: string;
    } | null>;
    /** A credential whose password was lost with the run that made it: removed, so it can be made again. */
    deleteCredential(acct: ProviderAccount, listSid: string, credentialSid: string): Promise<void>;
    findOrigination(acct: ProviderAccount, trunkSid: string, sipUrl: string): Promise<{
        sid: string;
    } | null>;
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
    /**
     * The texts that arrived on `to` since `sinceMs`, newest first, a page of twenty at most, from the provider's own record
     * (the account's list of messages): nothing of ours is kept. A read that FAILS throws, so a caller never mistakes it for
     * a number nobody wrote to.
     */
    recentTexts(acct: ProviderAccount, to: string, sinceMs: number): Promise<ReceivedText[]>;
}
/**
 * A text that arrived on one of the account's numbers, as the provider keeps it: the provider's own record, never ours.
 * `atMs` is when the provider says it was sent (Twilio's `date_sent`, in milliseconds).
 */
interface ReceivedText {
    sid: string;
    from: string;
    body: string;
    atMs: number;
}
interface SmsSendResult {
    ok: boolean;
    /** The provider's message id (SM…), for the row. */
    sid: string | null;
    status: number;
    /** The provider's error code when refused: 21610 = the person opted out at the carrier, 30034 = the line is not registered yet. */
    code: number | null;
    /** What the send came to (provider-fetch SendOutcome), when the provider's port said. */
    outcome?: SendOutcome;
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
/**
 * The line's subaccount's name: the workspace's, and the line's own tag, so a look for it by name can only find this
 * line's (Twilio's names are not unique, and two workspaces may share one). Within Twilio's 64 characters.
 */
declare function subaccountName(tenantName: string, lineId: string): string;
declare function sipUsername(lineId: string): string;
/**
 * A SIP password Twilio accepts: at least 12 characters, a digit, mixed
 * case (SIP Credential docs). 24 characters here, from node:crypto -- the
 * source the edge token's nonce is minted from (edge-token.ts), never
 * Math.random, which nothing in production seeds; `random` is injectable so
 * a test can pin one.
 */
declare function sipPassword(random?: () => number): string;
/** Twilio's rule, checked before a password is sent. */
declare function isValidSipPassword(p: string): boolean;
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
    /** The HTTP status, or 0 when no answer came (the body then says why, as `error`). */
    status: number;
    body: Record<string, unknown> | null;
    /** What the call came to (provider-fetch SendOutcome); absent from a test double that does not say. */
    outcome?: SendOutcome;
}
type TwilioHttp = (acct: ProviderAccount, method: "GET" | "POST" | "DELETE", url: string, form?: Record<string, string>) => Promise<TwilioAnswer>;
/**
 * The longest one call to Twilio waits unless its caller says: a text's send is one try under it, and the job runner
 * starts one only while it still ends inside its function (jobs ledger startByAt).
 */
declare const TWILIO_TIMEOUT_MS = 15000;
declare const twilioUrls: {
    subaccounts: string;
    availableLocal: (sid: string, country?: string) => string;
    incomingNumbers: (sid: string) => string;
    incomingNumber: (sid: string, numberSid: string) => string;
    credentialLists: (sid: string) => string;
    credentials: (sid: string, listSid: string) => string;
    credential: (sid: string, listSid: string, credentialSid: string) => string;
    trunks: string;
    trunk: (trunkSid: string) => string;
    trunkCredentialLists: (trunkSid: string) => string;
    trunkOriginationUrls: (trunkSid: string) => string;
    trunkPhoneNumbers: (trunkSid: string) => string;
    messagingServices: string;
    serviceNumbers: (serviceSid: string) => string;
    messages: (sid: string) => string;
    lookup: (e164: string) => string;
};
/** What Twilio Lookup said of a number's line (line type intelligence): its type and its carrier, as Twilio words them. */
interface LineTypeAnswer {
    type: string | null;
    carrier: string | null;
}
/**
 * A number's line, by the carrier's own records (decision 0073, R11: Twilio Lookup v2, line_type_intelligence): mobile,
 * landline, fixed or non-fixed VoIP and the rest, and the carrier. A few cents a number, asked once at step 4. Null when
 * Twilio could not say (no answer, a refusal, or a number it has no record of); never throws.
 */
declare function lookupLineType(acct: ProviderAccount, e164: string): Promise<LineTypeAnswer | null>;
/** A provider refusal as an error the saga records: status, Twilio's code, its message. */
declare class TwilioError extends Error {
    readonly status: number;
    readonly code: number | null;
    constructor(status: number, body: Record<string, unknown> | null, what: string);
}
/**
 * One call to Twilio as `acct`, through providerFetch: basic auth, a form body already encoded (the port's, or A2P's
 * own encoder), 15 s unless said. A read is asked twice when the first got no answer quickly.
 */
declare function twilioRequest(acct: ProviderAccount, method: "GET" | "POST" | "DELETE", url: string, o?: {
    form?: string;
    timeoutMs?: number;
    breaker?: "hold" | "count";
}): Promise<ProviderReply>;
/**
 * The fetch-backed port: basic auth as `acct`, 15 s per call, through twilioRequest. It never throws: a call that got
 * no answer is status 0 with the network's words as `error` (a text's send said "never throws" while this threw),
 * which a saga step's `need` refuses as any other failure.
 */
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
    /** A text that "arrived" on `to`, for recentTexts to answer: the dry provider has no carrier to receive one. */
    plantText(to: string, text: ReceivedText): void;
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
    /** A source for the SIP password a test can pin; absent, as the edge wires it, the password comes from node:crypto. */
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
    /**
     * Milliseconds until the run must start no more provider calls (the job's deadline). A carrier call's own timeout
     * fits in the gap between that deadline and the function's ceiling; a step that makes more than one is asked for
     * the difference first. At zero the saga stops between two calls, the row says where, and the job hands the rest
     * to the next one. Absent: the run goes to the end, as it always did.
     */
    timeLeft?: () => number;
}
/**
 * `later`: the run stopped at its deadline between two provider calls, nothing failed, and the rest is the next run's
 * (the row stays "provisioning" at `step`, and every receipt so far is on it).
 */
type SagaResult = {
    ok: true;
    line: LineRow;
    later?: undefined;
} | {
    ok: true;
    later: true;
    step: LineStep;
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
 * into one shape and made into the one inbound shape the receptionist reads
 * (inboundFromSms, decision 0001), the signature every inbound request must
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
 * The inbound text as the one inbound shape (inbound.ts, decision 0001), read from Twilio's fields. Words are a text,
 * and a picture with words is answered for its words with the picture noted; a picture alone, or nothing, is
 * "unsupported", which the receptionist acknowledges as it does a sticker. The sender's digits are their id, the same
 * form a WhatsApp id takes, so one person is one thread across both wires. It came the second it reached us. A stop is
 * the carriers' own words for a line, which hold every word and sentence the normaliser reads as one and more
 * (stop-request.ts), or the carrier's verdict, which outranks the words.
 */
declare function inboundFromSms(s: SmsInbound, nowMs?: number): InboundMessage & {
    channel: "sms";
};
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
/**
 * The carriers' opt-out words, and the same request written as a sentence (stop-request.ts), whole-message. Opt-in
 * words stay the product's own (START, UNSTOP, RESUME).
 */
declare function smsKeywordConsent(body: string | null | undefined): CarrierConsent | null;
declare function mergeConsent(a: CarrierConsent | null, b: CarrierConsent | null): CarrierConsent | null;
/**
 * Whether a text is a one-time code some service sent (Meta's, when an owner connects the line's number to WhatsApp), and
 * which. The receptionist never answers one, no person or message is made of it, and its delivery is not kept
 * (apps/edge/lib/sms), so the rule is conservative on purpose: a text taken for a code silences a customer for good, and
 * one missed is only answered as it was. It is a text of at most 320 characters with no question mark, in a sender's own
 * shape, with a sender's own sign beside it:
 *   - "your <Name> [kind] code <code>" or "<code> is your <Name> [kind] code", the phrase ending there, and a sender's kind
 *     of code named (verification, one-time, login, sign-in, authentication: never security, access or confirmation, which a
 *     customer's alarm, gate or booking has too, and which rule the text out) or, with no kind named, the warning not to
 *     share it ("Your WhatsApp code: 788-963 / Don't share this code with others");
 *   - "your <kind> code <code>" with a sender's kind and the warning; "<code> is your <kind> code" with a sender's kind or
 *     the warning;
 *   - "use <code> to verify" (or activate, authenticate: never confirm or sign in, a gate's words too) and the warning;
 *   - a leading `<#>`, Android's retriever mark, and exactly one code.
 * A customer's text has the words of one at most ("the gate code is 4512, don't share it", "your Rewards code 123456
 * doesn't work", "I tried your Summer code 2024"): none of them is a sender's shape and sign together. Digits only, four to
 * eight. It answers the code as it was written, and the name of the service when the text says one.
 */
declare function oneTimeCodeOf(body: string): {
    code: string;
    from: string | null;
} | null;
/**
 * The codes among a number's recent texts, as the page says them: the ones sent within LINE_CODES_WITHIN_MS of `nowMs`,
 * newest first, at most LINE_CODES_MAX, each with the instant the provider says it was sent. The provider's list is read
 * for the number (recentTexts); nothing here is stored.
 */
declare function lineCodesFrom(texts: readonly ReceivedText[], nowMs: number): LineCodeDto[];
/**
 * The carrier's verdict on the way OUT, as carrierConsent is its verdict on
 * the way in.
 *
 * Twilio refuses a text to a number that replied STOP to it with 21610,
 * "attempt to send to unsubscribed recipient": the person's own no, which the
 * carrier kept and we never heard -- it went to the carrier, or came before
 * the line's webhook pointed here. The number is unreachable whatever our
 * record says, so the send door (core deliver.ts) records it as the STOP it is
 * and refuses as it refuses a recorded no. Every other code -- an unregistered
 * line (30034), a bad number, a limit -- is a failure of ours, and stays one.
 */
declare const SMS_OPTED_OUT_CODE = 21610;
declare function smsRefusalOf(r: {
    ok: boolean;
    code?: number | null;
}): "opted_out" | null;
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
/** What a campaign carries that a reply does not: how a person stops it, and the lines its foot owes. */
interface EmailCampaign {
    /** One click, no sign-in (RFC 8058): an https address that takes a POST. */
    unsubscribeUrl: string;
    /**
     * The same by mail, for a client that only knows mailto: a bare address, and only one the mailbox's intake reads
     * (an address nothing receives is an unsubscribe into nothing). Optional: RFC 8058's one click needs the https
     * address alone.
     */
    unsubscribeMailto?: string;
    /** Why they are hearing from us, the business's name and postal address, the way to say no. Composed by the caller; never empty. */
    footer: string;
    /**
     * The same foot in HTML (contracts emailFootHtml), the link reading "Unsubscribe" as the canvas draws it. When
     * given it ends the HTML twin in place of the text foot, and it must carry the unsubscribe link itself.
     */
    footerHtml?: string;
}
interface EmailRequestInput {
    identity: EmailIdentity;
    /** The person's stored address (normalizeEmail's spelling). */
    to: string;
    /** The email this answers. Null for a first email, which then names its own subject. */
    parent: EmailParent | null;
    /** A first email's subject. Read only when there is no parent: a reply's is always its parent's, once, with Re:. */
    subject?: string;
    /** The words, as the receptionist or a person wrote them. */
    body: string;
    /** Composed from the business's profile by the caller; null sends none. */
    signature: string | null;
    /**
     * The signature as its own markup, where it has one (a mailbox's Gmail signature, mailboxSignatureOf): the HTML part
     * carries it under the words, as Gmail does, and the words part carries `signature`. A plain email carries words alone.
     */
    signatureHtml?: string | null;
    /** Who wrote the words: with the parent and the campaign, decides Auto-Submitted. */
    actor: "ai" | "human";
    /**
     * Mail a program sends on its own schedule (a reach-out, an offer): marked as such, with its unsubscribe and its
     * footer. Its parent, when it has one, is our own earlier email in the same campaign (a nudge), never the person's:
     * an answer to them is a reply, and goes without this.
     */
    campaign?: EmailCampaign;
    /** The queued row this request belongs to: the idempotency key, and the tag every receipt names it by. */
    messageId: string;
    tenantId: string;
    /**
     * Words alone, with no HTML twin: a cold email from a business's own mailbox (decision 0056, 7), which reads as a
     * person's email and carries no link markup. Its foot is the text foot.
     */
    plain?: boolean;
    /**
     * Whether a campaign is marked Auto-Submitted (RFC 3834): true by default. A cold email from a business's own mailbox
     * is not (decision 0056), so an out-of-office answers it and the chain hears they are away (00226).
     */
    autoSubmitted?: boolean;
}
/** `"Name" <address>`, the name quoted so a comma or a bracket in it cannot end it early. */
declare function mailboxHeader(name: string, address: string): string;
/** "Re: <their subject>", once, however many prefixes the chain has stacked. A parent without one still gets a subject a person can find. */
declare function replySubject(parentSubject: string | null | undefined): string;
/**
 * The HTML twin of plain words: paragraphs and line breaks, escaped, nothing
 * else -- except that a web address in the words is a link, so a proposal or
 * a booking link opens where the client does not link plain text itself. It
 * exists because mail clients render plain text worse than they should, not
 * to carry design; no markup from the words survives into it.
 */
declare function emailHtml(text: string): string;
/** The chain a reply carries: the parent's chain, then the parent. Bounded, oldest dropped first, the root kept. */
declare function referencesFor(parent: Pick<EmailParent, "rfcMessageId" | "references">): string[];
declare function buildEmailRequest(i: EmailRequestInput): EmailRequest;
/** Is this stored value a request the wire may send? The row's meta is JSON; the wire trusts its shape, not its type. */
declare function isEmailRequest(v: unknown): v is EmailRequest;

/**
 * The header values the rest of email/ reads and writes: one line (oneLine), a Message-ID as a header carries it,
 * and an address apart from its phrase, one or a list. The request is request.ts; what arrives is intake.ts.
 */
/** A header value is one line: a newline in one is how a second header is smuggled in. */
declare const oneLine: (s: string) => string;
/** A Message-ID as a header carries it, angle brackets and all; null for anything that is not one. */
declare function messageIdHeader(id: string | null | undefined): string | null;
/** `Ana Reyes <ana@x.com>` or `ana@x.com`: the address and the phrase, apart. The phrase is the sender's own and proves nothing. */
declare function addressOf(header: string | null | undefined): {
    address: string;
    name: string | null;
} | null;

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
 * What the mailbox sends OFFERS as (One message, every channel, step 4; the spec's 4.6): From on the campaigns domain, so a
 * complaint about an offer never touches the domain replies and visit messages leave from, and answered at the same reply
 * routes as every other email, on the mail domain (the one that receives): a reply to an offer lands in the Inbox.
 */
declare function sendsAsCampaigns(mailbox: {
    local_part: string;
    reply_token: string;
    reply_token_prev: string | null;
}, campaignsDomain: string, mailDomain: string): EmailSendsAs;
/** The identity an offer is frozen with: the mailbox's name and local part on the campaigns domain, Reply-To its live reply route on the mail domain. */
declare function campaignsIdentity(mailbox: {
    local_part: string;
    reply_token: string;
    from_name: string;
}, campaignsDomain: string, mailDomain: string): EmailIdentity;
/**
 * What a mailbox the business connected sends as (decision 0056): From its own address, and answered at the same
 * address, since a reply to it lands in it and the sync reads it back. The wire holds a request frozen for it to that
 * address alone.
 */
declare function sendsAsConnected(mailbox: {
    address: string;
}): EmailSendsAs;
/** The identity a request leaving from a connected mailbox is frozen with: its name, its address, its address again to answer. */
declare function connectedIdentity(mailbox: {
    address: string;
    from_name: string;
}): EmailIdentity;
/**
 * Does this frozen request leave as this workspace and nobody else? The
 * request is JSON on a row; the wire is bound to a workspace's mailbox. A
 * request whose From or Reply-To is another's is refused rather than sent, the
 * same promise the WhatsApp wire keeps by taking its credentials from the
 * tenant and never from the environment.
 */
declare function requestLeavesAs(request: EmailRequest, as: EmailSendsAs): boolean;

/**
 * Whether a webhook delivery is Resend's: the Svix signature over it, computed and checked inside the replay window.
 * The first thing intake asks; what a delivery carries is intake.ts and receipts.ts.
 */
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

/**
 * What arrives by email, read: which of the platform's addresses a delivery names, the received event, the fetched
 * email, the ids a header lists, and what a message claims to be. Whether a delivery is Resend's at all is
 * webhook-signature.ts; the header values it reads are header-values.ts.
 */

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
    /**
     * What the provider's receiving side concluded about the sender as the email arrived (Resend's `authentication`): SPF,
     * DKIM and DMARC, each in the provider's own word (`pass`, `fail`, `gray`, `processing_failed`, `unknown`). The server
     * that took the email in computes it; it is a field of the provider's answer, never a line of the message, so nothing
     * a sender writes reaches it. Null when the provider handed none over (it gives none for an email from before it kept
     * one), or handed over something that is not one: no proof, either way (`senderAuthenticated`).
     */
    authentication: {
        spf: string;
        dkim: string;
        dmarc: string;
    } | null;
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
 * Whether the receiving side PROVES the sender is who the From line says, from the provider's own verdict on the email
 * (`authentication`, above): DMARC passed, which is by definition an SPF or a DKIM pass aligned with the From domain; or
 * DKIM passed and DMARC said nothing against it. The provider documents a DKIM pass as a signature by the From domain
 * (one by another domain it calls `gray`), and it is how a sender whose domain publishes no policy is proved. Anything
 * else is no proof: no verdict, an SPF pass alone (SPF speaks for the envelope, not the From), a DKIM pass beside a
 * DMARC failure or beside a word this does not know, and a From that is not one mailbox, plainly (`oneMailbox`): the
 * one the provider names, and the message's own From line where the provider lists it, which must name the same.
 * FAILS CLOSED, which is the point: a yes to offers widens what may be sent, and a From line is one anyone can write.
 * A no (STOP, UNSUBSCRIBE) never asks it, since a no only narrows.
 *
 * No header is read for the verdict. An `Authentication-Results` header is words: a sender can write one into its own
 * mail, under any name and anywhere among the headers, so reading it meant knowing which one the receiver wrote, by a
 * name each deployment had to be told by hand (EMAIL_AUTHSERV_ID). Production was never told, and so proved no sender at
 * all. The verdict is not in the message, and needs nothing set.
 */
declare function senderAuthenticated(e: Pick<ReceivedEmail, "from" | "headers" | "authentication">): boolean;
declare function classifyReceived(e: Pick<ReceivedEmail, "headers" | "from" | "subject" | "text">): EmailClaim;

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

/**
 * Two answers the provider gives a call, read: what a refusal means for the next send (resendLimitOf), and what it
 * thinks of the mail domain (mailDomainsFrom). The calls themselves are ./email-resend.ts.
 */
/**
 * What a refusal from the provider means for the next send, read from the
 * names Resend documents for its 429 and 409 answers:
 *   rate       too many requests this second; the next second takes it
 *   in_flight  a request under the same key is still being worked; its result is coming
 *   daily      the day's sending is used up, for every workspace on the key
 *   monthly    the month's is
 * Null for anything else, a success included. A 429 that names nothing is read
 * as the one that passes: the provider did not take the email, and waiting a
 * second costs nothing.
 */
type ResendLimit = "rate" | "in_flight" | "daily" | "monthly";
declare function resendLimitOf(r: {
    ok?: boolean;
    status: number;
    errorBody?: string | null;
}): ResendLimit | null;
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
 * It sends a request that was built and frozen elsewhere (email/request.ts) and says
 * what happened. Like every send adapter here it RETURNS a result and never
 * throws, and it is bounded: a hung connection must not take the worker's
 * whole run with it (whatsapp.ts postGraph says why).
 *
 * The Idempotency-Key is the request's own, which is the queued row's id.
 * Resend honours a key for 24 hours and answers a repeated key with the first
 * send's result, so the one retry the ledger allows cannot deliver twice; a
 * repeated key with a different payload is refused (409), which a frozen
 * request never produces.
 *
 * A refusal that means "not this second" (resendLimitOf: rate, in_flight) is
 * waited out once, when the provider's wait is short, and the same bytes are
 * posted again under the same key: the provider did not take the first, or it
 * answers the second with the first's result. A longer wait, a used-up day or
 * month, or a second refusal is handed back as it came.
 *
 * An email the provider took as the last its rate allowed (ratelimit-remaining
 * 0) waits out the reset before it returns (Reach out C14), so the next email
 * this instance sends meets an open second rather than a 429.
 */

interface ResendConfig {
    apiKey: string;
}
/**
 * The most one send may take, both tries and a short wait included, when its caller has no ceiling of its own: Part 1
 * measured the worst case at 32 s. A caller that runs inside a function's ceiling (the jobs tick yields at 45 s of 60,
 * and a send may start at the yield) passes what is left of it (`deadlineMs`), which is less: this is only the cap, and
 * ops-hygiene.test.mjs holds the room a send is given at the yield point, plus the yield, under the ceiling.
 */
declare const SEND_DEADLINE_MS = 32000;
/**
 * The least a caller's ceiling may leave one send (the email wire raises a smaller one to it): a request cannot be made in
 * no time, and a send that starts when a function has none left to give would only time out, with the email possibly taken.
 */
declare const SEND_MIN_MS = 3000;
/** What the provider answered, or that it did not: status 0 is no answer, and `timedOut` says whether we gave up. */
interface ResendAnswer {
    status: number;
    json: unknown;
    raw: string;
    headers: Headers | null;
    timedOut: boolean;
    /** What the call came to (provider-fetch SendOutcome). */
    outcome: SendOutcome;
}
interface SendEmailOptions {
    /** How a short wait is waited (a test hands its own). */
    wait?: (ms: number) => Promise<void>;
    /**
     * The most this send may take, every try included: never more than SEND_DEADLINE_MS, which is what it takes when none is
     * given. A caller inside a function's ceiling gives what is left of it (the email wire, SEND_MIN_MS at the least).
     */
    deadlineMs?: number;
    /** Epoch ms, injected so the deadline is testable. */
    now?: () => number;
}
/**
 * Post the frozen request, and try once more when the answer allows it, always under the same idempotency key, so a
 * second try is the same email (the provider keeps a key a day):
 *   - the provider's "not this second" (rate, in flight), waited out when it asks for 2 s or less;
 *   - a timeout, when at least 5 s of the deadline are left: the first may never have arrived.
 * A network failure that is not a timeout is not tried again: nothing left.
 */
declare function sendEmail(cfg: ResendConfig, request: EmailRequest, opts?: SendEmailOptions): Promise<SendResult>;
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

declare const PLACES_BASE = "https://places.googleapis.com/v1";
declare const PLACES_SEARCH_MASK: string;
declare const PLACES_DETAILS_MASK: string;
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
    /** Google's name for the kind of place ("Moving company"), when it gives one. */
    category: string | null;
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
    /** What the listing says beyond its name and address, for the owner to check. */
    facts: GoogleListingFacts;
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
/**
 * The real port: providerFetch with a timeout, the body as text whatever the status. A call that got no answer throws
 * the network's words, as the bare fetch it replaces did; a read (a GET) is asked twice first.
 */
declare function placesFetch(fetchImpl?: typeof fetch, timeoutMs?: number): PlacesHttp;
/** A place id as Google issues them: letters, digits, dashes and underscores. */
declare const PLACE_ID: RegExp;

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
    /** Which provider a mailbox is being connected at (decision 0056); absent for Google Business Profile's. */
    p?: string;
    /** The mailbox being connected again, when it is a Reconnect: the account that comes back must be that one. */
    m?: string;
    /** 1 when the way out is a Microsoft admin's consent for their organisation, not a member's sign-in. */
    a?: number;
    /**
     * Where the owner comes back to, when it is not the connection's own Settings page: `start`, the first run that asked
     * (decision 0073: Where it answers' tiles, Your business's Connect Google).
     */
    b?: string;
    /** 1 when the consent was asked with PKCE's challenge: the way back sends its verifier (an edge that passes it on). */
    k?: number;
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

/**
 * A mailbox connected with OAuth (decision 0056): the way to the provider's consent screen, the code traded for a grant,
 * the grant refreshed, and the scopes a grant must hold. Google's and Microsoft's, side by side; pure, so the tests run
 * it without a network, and the edge makes each request (lib/email/mailbox/mailbox-credentials.ts).
 *
 * Google asks the least that does the job: gmail.send (a sensitive scope: Google's review only) and gmail.readonly (a
 * restricted one: the review and its security assessment), never gmail.modify or the whole mailbox. Microsoft asks
 * Mail.Send and Mail.ReadWrite (a draft is made from the MIME, its Message-ID read, then sent), and offline_access for a
 * lasting grant. The state that rides the way out and back is google-oauth.ts's (signState, verifyState), with the
 * provider in it.
 *
 * Asked beside them, never required (decision 0073, R18 to R20): the owner's contacts and the people they wrote to, and
 * their calendars, read-only, so what the mailbox connects brings its people and its visits too. The owner may untick
 * either on Google's screen; the mailbox still connects, and what it holds is asked of the grant (grantHolds). Google's
 * screen keeps what an earlier consent gave (include_granted_scopes), so one app files every scope once.
 */

/** What each provider is asked for. */
declare const MAILBOX_SCOPES: Record<MailboxProvider, readonly string[]>;
/** What a grant may bring beside its mail, each read only where the owner left it ticked (grantHolds). */
type MailboxReach = "contacts" | "calendar";
interface MailboxOAuthClient {
    clientId: string;
    clientSecret: string;
    /** The dashboard's callback, registered with the provider as it is written here. */
    redirectUri: string;
}
/** One request to a provider, made by the edge (its http) and read back here. */
interface MailboxRequest {
    url: string;
    method: "GET" | "POST" | "PATCH" | "DELETE";
    headers: Record<string, string>;
    body?: string;
}
/**
 * The PKCE verifier for a Google mailbox's consent (RFC 7636, S256; RFC 9700 asks it of a confidential client too):
 * derived from the signed state's nonce with the dashboard's own key, so it never travels in a URL and nothing is kept
 * between the consent and the callback. 43 characters, as the RFC's shortest.
 */
declare function mailboxPkceVerifier(secret: string, nonce: string): Promise<string>;
/** The challenge the consent screen is asked with: the verifier's SHA-256, base64url. */
declare function mailboxPkceChallenge(verifier: string): Promise<string>;
/**
 * The provider's consent screen, asked for this mailbox's grant. Google: offline access, consent every time (it hands a
 * refresh token on a first consent only, and a reconnect is a first consent on purpose), no scopes granted before folded
 * in, and PKCE's challenge where one is given. Microsoft: offline_access already asks for the refresh token;
 * select_account so a person signed in to two picks.
 */
declare function mailboxAuthorizeUrl(provider: MailboxProvider, cfg: Pick<MailboxOAuthClient, "clientId" | "redirectUri">, state: string, opts?: {
    loginHint?: string | null;
    challenge?: string | null;
}): string;
/**
 * The link a Microsoft 365 admin opens to approve Chanlytics once for their whole organisation, where the tenant lets no
 * member consent alone (Entra's v2 admin consent: `organizations`, since a personal account approves nothing for a
 * tenant). It asks the same Graph scopes a member's sign-in does, and comes back to the callback with
 * `admin_consent=True` and the state.
 */
declare function mailboxAdminConsentUrl(cfg: Pick<MailboxOAuthClient, "clientId" | "redirectUri">, state: string): string;
/** The code's exchange, with PKCE's verifier where the consent was asked with its challenge. */
declare function mailboxTokenRequest(provider: MailboxProvider, cfg: MailboxOAuthClient, code: string, verifier?: string | null): MailboxRequest;
declare function mailboxRefreshRequest(provider: MailboxProvider, cfg: Pick<MailboxOAuthClient, "clientId" | "clientSecret">, refreshToken: string): MailboxRequest;
/**
 * The grant given back: Google revokes a token (the refresh token ends the grant); Microsoft has no single-token
 * revocation for a delegated grant, so there is nothing to ask, and removing the mailbox drops the token here.
 */
declare function mailboxRevokeRequest(provider: MailboxProvider, token: string): MailboxRequest | null;
type MailboxGrant = TokenGrant;
/** The token endpoint's answer, read: the same shape at both providers (RFC 6749). Throws on an answer with no token. */
declare function parseMailboxGrant(json: unknown): MailboxGrant;
/** The required scopes a grant does not hold: none missing is a mailbox that can send and be read. */
declare function grantScopesMissing(provider: MailboxProvider, granted: string): string[];
/** The grant's scopes, as the row keeps them. */
declare function grantScopes(granted: string): string[];
/** Whether a grant (its scopes, as a string or as the row keeps them) reaches beyond the mail to this. */
declare function grantHolds(provider: MailboxProvider, granted: string | readonly string[], reach: MailboxReach): boolean;

/**
 * A connected mailbox's past, listed through its own grant (decision 0073, R19): the messages newer than a moment, a page
 * at a time, under every folder but spam and the bin, as ids with their threads (and, from Graph, who wrote each before it
 * is read). The edge reads each one (gmailMessage, graphMessage), sorts it as the intake sorts any email (intake.ts
 * classifyReceived) and keeps mail from people and booking notices as before Chanlytics. Every call returns what it came
 * to and never throws (provider-fetch.ts); a token is the caller's to hold.
 */

type Deps$6 = Parameters<typeof providerFetch>[3];
/** One message of the past, as the list names it: its id and thread, and (Graph's) its sender and when it came. */
interface ListedMail {
    id: string;
    threadId: string | null;
    /** The sender's address, lower-cased, where the list says it (Graph); null where it does not (Gmail's list is ids). */
    from: string | null;
}
/** A page of the past: the messages on it, and where the next page starts (null at the last). */
type MailPage = {
    ok: true;
    listed: ListedMail[];
    next: string | null;
} | {
    ok: false;
    reply: ProviderReply;
};
/** The span a history read covers: from its first moment, up to (not including) the moment the mailbox connected. */
interface MailWindow {
    from: string;
    to: string;
    /** Only mail from this address: a sender the owner brought in (00483). A lower-cased address, never a query. */
    sender?: string;
}
/**
 * Gmail's messages received inside the window, newest first, every label but spam and the bin (the list's default),
 * mail sent from the mailbox among them: the owner's replies are half of a thread with a person.
 */
declare function gmailListSince(token: string, window: MailWindow, pageToken: string | null, deps?: Deps$6): Promise<MailPage>;
/**
 * Graph's messages received inside the window, newest first, in every folder (the inbox, its rules' folders and Sent
 * Items alike), drafts left out; `link` is the page Graph named next. Junk and Deleted Items are listed too, and the
 * sorting keeps what a person wrote.
 */
declare function graphListSince(token: string, window: MailWindow, link: string | null, deps?: Deps$6): Promise<MailPage>;

/**
 * The people a connected mailbox's grant knows (decision 0073, R19): the owner's contacts (Google's People API, Graph's
 * contacts); never Google's "other contacts", everyone the owner ever wrote to. Each a name, the
 * addresses and the numbers as the provider holds them; the edge brings them into People as a client list's are, never
 * a yes. A page at a time; every call returns what it came to and never throws (provider-fetch.ts).
 */

type Deps$5 = Parameters<typeof providerFetch>[3];
/** One person a mailbox knows: what they are called, and every address and number the provider holds for them. */
interface KnownPerson {
    name: string | null;
    emails: string[];
    phones: string[];
}
/** A page of people, and where the next one starts (null at the last). */
type PeoplePage = {
    ok: true;
    people: KnownPerson[];
    next: string | null;
} | {
    ok: false;
    reply: ProviderReply;
};
/** The owner's own Google contacts (contacts.readonly), a page at a time. */
declare function googleContacts(token: string, pageToken: string | null, deps?: Deps$5): Promise<PeoplePage>;
/** The owner's Outlook contacts (Contacts.Read), a page at a time; `link` is the page Graph named next. */
declare function graphContacts(token: string, link: string | null, deps?: Deps$5): Promise<PeoplePage>;

type Deps$4 = Parameters<typeof providerFetch>[3];
/** One event of the owner's calendar, as the feed writes it. */
interface CalendarEvent {
    uid: string;
    /** Epoch ms; an all-day event's day as YYYY-MM-DD beside it. */
    start: number;
    end: number;
    allDay: boolean;
    startDay: string | null;
    endDay: string | null;
    title: string;
    description: string | null;
    location: string | null;
    attendees: Array<{
        name: string | null;
        email: string | null;
    }>;
    organizer: string | null;
    /** For one occurrence of a series, the instant it was due before it was moved (epoch ms); null for a single event. */
    due: number | null;
    /** Marked free on the calendar (Google's transparency, Graph's showAs free): no time is taken. */
    free: boolean;
}
/** A page of events, and where the next starts (null at the last). */
type EventsPage = {
    ok: true;
    events: CalendarEvent[];
    next: string | null;
} | {
    ok: false;
    reply: ProviderReply;
};
/** The calendars of an account, by id. */
type CalendarIds = {
    ok: true;
    ids: string[];
} | {
    ok: false;
    reply: ProviderReply;
};
/** Every calendar of a Google account the grant reads, but the ones Google makes for everyone. */
declare function googleCalendarIds(token: string, deps?: Deps$4): Promise<CalendarIds>;
/** One calendar's events between two instants, a page at a time, each occurrence of a series apart. */
declare function googleEvents(token: string, calendarId: string, window: {
    from: string;
    to: string;
}, pageToken: string | null, deps?: Deps$4): Promise<EventsPage>;
/** Every calendar of a Microsoft 365 account the grant reads. */
declare function graphCalendarIds(token: string, deps?: Deps$4): Promise<CalendarIds>;
/** One calendar's events between two instants (its calendar view), a page at a time, each occurrence apart. */
declare function graphEvents(token: string, calendarId: string, window: {
    from: string;
    to: string;
}, link: string | null, deps?: Deps$4): Promise<EventsPage>;
/**
 * The events as one iCal feed, what the owner's calendar link would have said of them: each event's UID, its time (an
 * all-day one by its days), its words, its guests and organizer, an occurrence's RECURRENCE-ID, and a free one marked
 * transparent, so the feed's reader (contracts parseIcs) takes from it exactly what it takes from a link.
 */
declare function calendarIcs(events: readonly CalendarEvent[]): string;

/** The Message-ID a mailbox's email is sent under: the row's id, on the mailbox's own host, so it is ours to find. */
declare function mailboxMessageId(rowId: string, host: string): string;
/**
 * The message, written out. `messageId` is the one it is sent under (mailboxMessageId); `boundary` is the
 * multipart's, given by the caller so the same request writes the same bytes.
 */
declare function buildMime(r: EmailRequest, p: {
    messageId: string;
    at: Date;
    boundary?: string;
}): string;

/** A received email from a mailbox, with the provider's thread it sits in and every report part's words. */
interface MailboxEmail extends ReceivedEmail {
    /** Gmail's threadId, Graph's conversationId: what a reach-out's email was stamped with when it left. */
    threadId: string | null;
    /** The delivery-status and original-headers parts of a report, as text; null for an email that carries none. */
    reportText: string | null;
    /** Gmail's labels on the message (its labelIds: INBOX, CATEGORY_PROMOTIONS, ...); none from Graph. */
    labels: string[];
}
/**
 * Whether Gmail filed a message under Updates. Google calls the tab "automated confirmations, notifications,
 * statements, and reminders that may not need immediate attention", but Gmail sorts each message by a model it does not
 * publish, and what a person sends through a tool (a signature request, a booking form, a help desk's reply, a
 * supplier's invoice) is filed there with the receipts. So the tab alone leaves nothing: a reader weighs it with who
 * sent it and whether it answers anything (edge mailbox-sorting.ts), and lists what it leaves, one press from coming in.
 */
declare function filedUnderUpdates(e: Pick<MailboxEmail, "labels">): boolean;
/**
 * Whether Gmail filed a message under one of the tabs above. A mailbox's own sorting, read only from a mailbox (never
 * by the hosted intake, which has none), and never inside a thread a reach-out started: a reply there is a reply,
 * whatever Gmail calls it.
 */
declare function filedAsBulk(e: Pick<MailboxEmail, "labels">): boolean;
/**
 * What a provider's refusal of one message's read means for a reader (gmailReadVerdict, graphReadVerdict), with its
 * status and the provider's own word for why, for the log and the error:
 *   refused  that one message, for good: a reader goes on without it
 *   paced    a pace or a quota of requests: no failure; a reader rests, then reads it again
 *   again    anything else (the grant, a timeout, the provider's bad minute): asked again later
 */
interface ReadVerdict {
    verdict: "refused" | "paced" | "again";
    status: number;
    reason: string | null;
    /** How long the provider asked a reader to wait (Retry-After), in ms, when it said. */
    retryAfterMs: number | null;
}
/**
 * What a look in a mailbox for an email it may have sent found (gmailFindSent, graphFindSent): the email, with the id,
 * thread and Message-ID it went under; or nothing, with the draft it left behind when there is one (Graph's), which
 * proves it never left.
 */
type FoundSent = {
    found: true;
    id: string;
    threadId: string | null;
    messageId: string | null;
} | {
    found: false;
    draftId?: string;
};
/** Gmail's message, read in full (users.messages.get, format=full); null for an answer that is not one. */
declare function gmailEmailOf(json: unknown): MailboxEmail | null;
/**
 * Graph's message (users/{id}/messages/{id}, with its internetMessageHeaders and its body as text); null for an answer
 * that is not one. Graph hands a report's words as its body; its original's headers, Exchange quotes in them.
 */
declare function graphEmailOf(json: unknown): MailboxEmail | null;
/**
 * What a bounce says of whom (decision 0056, and RFC 3463 as Gmail and Microsoft 365 write it):
 *
 *   hard          the address is not one to write to (5.1.1, 5.1.10, 5.2.1, 5.4.1 "access denied"): it is suppressed.
 *   blocked       the receiving side refused the sender (5.7.x: spam, reputation, SPF, DKIM, DMARC, policy): the
 *                 mailbox's to answer for, never the address's.
 *   sender_limit  the sender's own provider refused it for its quota (Gmail 5.4.5, Exchange 5.2.0 / 5.1.90 / 5.7.705):
 *                 the mailbox rests, and the address is not judged.
 *   soft          anything temporary or the recipient's passing state (a full mailbox, 4.x.x, a code nobody names).
 */
type BounceClass = "hard" | "blocked" | "sender_limit" | "soft";
/** What a delivery report says of an email of ours: which, to whom, and whether for good. */
interface DeliveryReport {
    /** Our row's id, read off the Message-ID we sent it under (mailboxMessageId: <cl.<id>@host>); null when not quoted. */
    rowId: string | null;
    /** The original's Message-ID as the report quotes it, ours or not. */
    originalMessageId: string | null;
    recipient: string | null;
    /** RFC 3463's status ("5.1.1"); null when the report gives none. */
    status: string | null;
    /** Whose fault, and so what follows (BounceClass). */
    bounce: BounceClass;
    /** The address is not one to write to: `bounce` is hard. */
    permanent: boolean;
    /** Only a delay (Action: delayed, or a 4.x.x not yet given up on): nothing failed yet, and nothing is applied. */
    delayed: boolean;
    /** The receiving server's own words, cut to a line, for the log. */
    diagnostic: string | null;
}
/** Our row id in a Message-ID we minted (mailbox-mime.ts mailboxMessageId), as a uuid. */
declare function rowIdOfMessageId(id: string | null | undefined): string | null;
/**
 * A delivery report, read (RFC 3464, and Exchange's own words where it writes none): null for an email that is not
 * one. The original is found by the Message-ID the report quotes; ours are minted so that the row is in the id itself.
 * A status is read from the Status field, or from an SMTP reply in the server's words ("550 5.1.1"): never from any
 * dotted number, which a quoted header's address would be. Whose fault it is, is judged on the Diagnostic-Code and the
 * report's own text before its copy of the original.
 */
declare function deliveryReportOf(e: Pick<MailboxEmail, "headers" | "from" | "subject" | "text" | "reportText">): DeliveryReport | null;

type Deps$3 = Parameters<typeof providerFetch>[3];
/**
 * Whether a refusal is the mailbox's own day used up (Gmail's sending limits): the mailbox rests until the time Gmail
 * names, and its sends wait. Gmail says it as a 429 whose words end "(Mail sending)"; the same "User-rate limit
 * exceeded" without them is a pace of requests (the next tick sends), never a day.
 */
declare function gmailDayUsed(r: Pick<ProviderReply, "status" | "json" | "text">): boolean;
/** Whether the grant is gone (revoked, expired for good, the account suspended): the owner connects it again. */
declare function gmailSignedOut(r: Pick<ProviderReply, "status" | "json">): boolean;
/**
 * Gmail's refusal of one message's read, judged (mailbox-read.ts readVerdictOf), with its reason: Gmail says a pace or a
 * quota of requests as a 403 too (rateLimitExceeded, userRateLimitExceeded), and its reason names it.
 */
declare function gmailReadVerdict(r: Pick<ProviderReply, "status" | "json" | "retryAfterMs">): ReadVerdict;
interface GmailSent {
    ok: boolean;
    status: number;
    outcome: SendOutcome;
    /** Gmail's id for the sent message, and its thread. */
    id: string | null;
    threadId: string | null;
    error: string | null;
    reply: ProviderReply;
}
declare function gmailSend(token: string, mime: string, threadId: string | null, p?: {
    deadlineMs?: number;
}, deps?: Deps$3): Promise<GmailSent>;
/** The message (and its thread) Gmail holds under this Message-ID, or null; throws when Gmail could not be asked. */
declare function gmailThreadOf(token: string, rfcMessageId: string, deps?: Deps$3): Promise<{
    id: string;
    threadId: string;
} | null>;
/** A sent message's Message-ID header as Gmail kept it, or null; throws when Gmail could not be asked. */
declare function gmailSentIds(token: string, id: string, deps?: Deps$3): Promise<{
    messageId: string | null;
}>;
declare function gmailProfile(token: string, deps?: Deps$3): Promise<ProviderReply>;
/**
 * The signature the owner keeps in Gmail for this address (users.settings.sendAs, which gmail.readonly reads): its HTML,
 * as Gmail keeps it, or null where it keeps none. An address Gmail does not send as answers 404: none.
 */
declare function gmailSignature(token: string, address: string, deps?: Deps$3): Promise<{
    ok: true;
    html: string | null;
} | {
    ok: false;
    reply: ProviderReply;
}>;
/**
 * Whether Gmail said the account has no mailbox: a Google account that is not a Gmail one (or one whose Gmail is
 * switched off) answers 400 failedPrecondition ("Mail service not enabled"). Gmail says the same now and then of a
 * mailbox that has one, so a caller asks twice before it believes it.
 */
declare function gmailNoMailbox(r: Pick<ProviderReply, "status" | "json">): boolean;
/** What history said: the messages added since the cursor, with their threads, and the cursor to read from next. */
type GmailHistory = {
    ok: true;
    /** Each message added, with the labels it arrived under (SPAM, SENT, DRAFT…): what it is, before it is read. */
    added: Array<{
        id: string;
        threadId: string;
        labels: string[];
    }>;
    next: string | null;
    nextPage: string | null;
} | {
    ok: false;
    expired: boolean;
    reply: ProviderReply;
};
/**
 * The messages added to the mailbox since `startHistoryId`, a page at a time, under any label: a reply a filter filed
 * away, or one Gmail took for spam, is a reply all the same (the caller reads only threads a reach-out started). A
 * cursor Gmail no longer keeps (404) is `expired`: the caller starts again from the profile's cursor, after reading the
 * threads it knows directly.
 */
declare function gmailHistory(token: string, startHistoryId: string, pageToken: string | null, deps?: Deps$3): Promise<GmailHistory>;
/** One message, in full: its headers and its parts (mailbox-read.ts gmailEmailOf reads it). */
declare function gmailMessage(token: string, id: string, deps?: Deps$3): Promise<ProviderReply>;
/**
 * The mailbox's changes, published to the topic, under every label (as the history read is): the history cursor it
 * starts from, and when it lapses (epoch ms).
 */
declare function gmailWatch(token: string, topic: string, deps?: Deps$3): Promise<{
    ok: true;
    historyId: string;
    expiresAt: number;
} | {
    ok: false;
    reply: ProviderReply;
}>;
/**
 * The delivery reports the mailbox received since `afterSec` (epoch seconds), spam included (Google files some there),
 * as ids alone: a report that sits outside the thread of the email it is about is found by who wrote it, never by
 * its thread. Throws when Gmail could not be asked.
 */
declare function gmailReports(token: string, afterSec: number, deps?: Deps$3): Promise<Array<{
    id: string;
}>>;
/**
 * Whether the mailbox sent an email whose send's outcome was unknown (a timeout after Gmail may have taken it): by the
 * Message-ID it was sent under, then among what it sent to that address since, by that Message-ID kept as Gmail's
 * "original" (Gmail may put its own in its place) or by its subject. Found or not; throws when Gmail could not be
 * asked, and the caller looks again later.
 */
declare function gmailFindSent(token: string, want: {
    messageId: string;
    to: string;
    subject: string | null;
    sinceMs: number;
}, deps?: Deps$3): Promise<FoundSent>;
declare function gmailStop(token: string, deps?: Deps$3): Promise<ProviderReply>;

/**
 * Gmail's signature as it goes in an email: its markup, less anything that runs or loads a page; null where nothing of
 * it is left or it is past what a mailbox keeps.
 */
declare function cleanGmailSignature(html: string | null | undefined): string | null;
/** Gmail's signature as words: its lines, its links by their words, its pictures left out. Null where it says nothing. */
declare function gmailSignatureWords(html: string | null | undefined): string | null;
/** A mailbox's row, as far as its signature goes. */
type SignedRow = {
    signature: string | null;
    signature_off?: boolean;
    from_name: string;
    gmail_signature?: string | null;
    gmail_signature_at?: string | null;
};
/**
 * What an email from this mailbox carries under its words: the words, and Gmail's HTML where it signs with Gmail's;
 * null where its owner sends none.
 */
declare function mailboxSignatureOf(row: SignedRow): {
    text: string;
    html: string | null;
} | null;
/** A mailbox's row as the pages are told of it, its Gmail signature said in words (contracts mailboxConnectionDtoOf). */
declare function mailboxDtoOf(row: Parameters<typeof mailboxConnectionDtoOf>[0] & {
    gmail_signature: string | null;
}, day?: Parameters<typeof mailboxConnectionDtoOf>[1]): MailboxConnectionDto;

type Deps$2 = Parameters<typeof providerFetch>[3];
/** The mailbox's day used up: Exchange's sending limits answer a send so. */
declare function graphDayUsed(r: Pick<ProviderReply, "status" | "json" | "text">): boolean;
/** Whether the grant is gone, or the mailbox cannot be reached by Graph: the owner connects it again. */
declare function graphSignedOut(r: Pick<ProviderReply, "status" | "json">): boolean;
/**
 * Graph's refusal of one message's read, judged (mailbox-read.ts readVerdictOf), with its code: Graph says a pace with
 * 429 and Retry-After, and a limit's code names it.
 */
declare function graphReadVerdict(r: Pick<ProviderReply, "status" | "json" | "retryAfterMs">): ReadVerdict;
/** Who the grant is: the account's id, its address and its name; null when Graph could not say. */
declare function graphMe(token: string, deps?: Deps$2): Promise<{
    id: string;
    address: string | null;
    name: string | null;
} | null>;
/** The account's inbox, read once at connect: an account with no Exchange mailbox answers it with a refusal. */
declare function graphInbox(token: string, deps?: Deps$2): Promise<ProviderReply>;
/**
 * Whether Graph said the account has no mailbox to send from: no Exchange Online mailbox or licence (404
 * MailboxNotEnabledForRESTAPI), one held on-premises, or a 403 that refuses the mailbox itself to a grant that holds
 * the mail scopes (a licence missing).
 */
declare function graphNoMailbox(r: Pick<ProviderReply, "status" | "json">): boolean;
interface GraphSent {
    ok: boolean;
    status: number;
    outcome: SendOutcome;
    /** Graph's id for the message, its Message-ID and its conversation: known from the draft, before it left. */
    id: string | null;
    messageId: string | null;
    threadId: string | null;
    error: string | null;
    reply: ProviderReply;
}
/**
 * The MIME as a draft (POST /me/messages, text/plain, base64), then the draft sent (POST .../send). A draft that could
 * not be made sent nothing; one made and refused is deleted, so the business's Drafts keep no half-sent email. Only the
 * second call may leave an email whose outcome is unknown.
 */
declare function graphSend(token: string, mime: string, p?: {
    deadlineMs?: number;
}, deps?: Deps$2): Promise<GraphSent>;
/** One message, its body as text, with its headers (mailbox-read.ts graphEmailOf reads it). */
declare function graphMessage(token: string, id: string, deps?: Deps$2): Promise<ProviderReply>;
/** What a delta read said: the messages added to the inbox, with their conversations, and where to read from next. */
type GraphDelta = {
    ok: true;
    added: Array<{
        id: string;
        threadId: string | null;
        from: string | null;
    }>;
    nextLink: string | null;
    deltaLink: string | null;
} | {
    ok: false;
    expired: boolean;
    reply: ProviderReply;
};
/**
 * The inbox's messages since a delta link; with none, those received since `sinceIso` (a delta started from now, so
 * the messages already there are never enumerated). A link Graph no longer keeps is `expired`.
 */
declare function graphDelta(token: string, link: string | null, deps?: Deps$2, sinceIso?: string): Promise<GraphDelta>;
/** A subscription to the inbox's new messages, told to `url` with `clientState`; its id and when it lapses. */
declare function graphSubscribe(token: string, url: string, clientState: string, nowMs: number, deps?: Deps$2): Promise<{
    ok: true;
    id: string;
    expiresAt: number;
} | {
    ok: false;
    reply: ProviderReply;
}>;
/** A subscription kept for another six days; `gone` when Graph no longer has it, and a new one is made. */
declare function graphRenew(token: string, id: string, nowMs: number, deps?: Deps$2): Promise<{
    ok: true;
    expiresAt: number;
} | {
    ok: false;
    gone: boolean;
    reply: ProviderReply;
}>;
/** A message deleted: a refused send's draft, or one the reconciliation found never left. */
declare function graphDeleteMessage(token: string, id: string, deps?: Deps$2): Promise<ProviderReply>;
/**
 * Whether the mailbox sent an email whose send's outcome was unknown (graphSend's second call timed out): by the
 * Message-ID it was made under, anywhere in the mailbox; then among what Sent Items holds since, by its subject and its
 * recipient. Our draft of it still a draft proves it never left (its id comes back to be deleted). Throws when Graph
 * could not be asked, and the caller looks again later.
 */
declare function graphFindSent(token: string, want: {
    messageId: string;
    to: string;
    subject: string | null;
    sinceMs: number;
}, deps?: Deps$2): Promise<FoundSent>;
/**
 * What arrived in Junk Email since `sinceIso`, as ids, conversations and senders alone: a reply Exchange took for junk
 * is a reply all the same (the caller reads only threads a reach-out started). Graph keeps no delta of it here, so the
 * sync asks from its last read. Throws when Graph could not be asked.
 */
declare function graphJunkSince(token: string, sinceIso: string, deps?: Deps$2): Promise<Array<{
    id: string;
    threadId: string | null;
    from: string | null;
}>>;
declare function graphUnsubscribe(token: string, id: string, deps?: Deps$2): Promise<ProviderReply>;

/**
 * One frozen request sent from a connected mailbox (decision 0056): the wire the email door's `own` route calls.
 *
 * The request is the one approved and kept on its row; it leaves as MIME under a Message-ID minted from the row's id on
 * the mailbox's own host (mailboxMessageId), so a reply and a delivery report find its row by the id alone. A nudge, or
 * a person's answer, goes in the thread of the email it answers: Gmail is asked which thread holds the Message-ID its
 * In-Reply-To names. What the provider kept is read back (Gmail may keep its own Message-ID; Graph's is known from the
 * draft before it leaves) and handed to the door to stamp, since no receipt comes from a mailbox.
 *
 * Returns, never throws. A refusal that is the mailbox's own day used up, or its grant gone, says so (`cause`): the
 * edge rests the mailbox until tomorrow, or asks its owner to connect it again, and the send waits either way.
 */

type Deps$1 = Parameters<typeof gmailSend>[4];
interface MailboxSendInput {
    provider: MailboxProvider;
    /** An access token the edge holds now (mailbox-credentials.ts tokenFor). */
    token: string;
    mailbox: {
        id: string;
        host: string;
    };
    request: EmailRequest;
    /** The caller's ceiling, when it has one (Delivery.sendBy). */
    deadlineMs?: number;
    now?: () => number;
}
/**
 * A send from a mailbox, as the door hears it, with why a refusal was the mailbox's own and not the email's; a day used
 * up says when it turns over, when the provider named a time (Gmail's "Retry after").
 */
type MailboxSendResult = SendResult & {
    cause?: "day_used" | "signed_out";
    restUntil?: number;
};
declare function sendFromMailbox(i: MailboxSendInput, deps?: Deps$1): Promise<MailboxSendResult>;

/**
 * What DNS says of a connected mailbox's domain, judged (decision 0056): SPF names the provider's servers, a DKIM key is
 * published under the provider's selector, DMARC has a record, and the domain receives mail. Pure over the answers the
 * edge reads (lib/email/mailbox/mailbox-dns.ts); "could not read" is the edge's to keep apart, never "missing".
 */

/** TXT answers as a resolver gives them: each record's chunks, which are joined before a test (a record is split at 255). */
type TxtAnswer = readonly (readonly string[])[];
/** Whether a set of TXT answers holds a DMARC record: one beginning `v=DMARC1` (RFC 7489 §6.4). */
declare function dmarcOf(txt: TxtAnswer): "found" | "missing";
/** The SPF include that names each provider's sending servers: the first is the one a record is given. */
declare const SPF_INCLUDES: Record<MailboxProvider, readonly [string, ...string[]]>;
/** The SPF records among a name's TXT answers: those that begin `v=spf1` (RFC 7208 4.5 discards the rest). */
declare function spfRecordsOf(txt: TxtAnswer): string[];
/** Whether one SPF record names the provider's servers itself: its include, with no qualifier but a pass. */
declare function spfNamesProvider(record: string, provider: MailboxProvider): boolean;
/**
 * What one SPF record spends of SPF's ten lookups by itself (RFC 7208 4.6.4: include, a, mx, ptr, exists, and the
 * redirect modifier; all, ip4 and ip6 spend none), and the names its includes and redirect point at, to follow.
 */
declare function spfTermsOf(record: string): {
    lookups: number;
    follow: string[];
};
/** The selectors each provider signs under: Google's default, Microsoft's two (published as CNAMEs to its keys). */
declare const DKIM_SELECTORS: Record<MailboxProvider, readonly string[]>;
/** Whether a selector's TXT answer is a DKIM key: `v=DKIM1`, or a `p=` with a key in it. */
declare function dkimOf(txt: TxtAnswer): "found" | "missing";

type Deps = Parameters<typeof providerFetch>[3];
/** Why a push's token was refused, for the door's line; null when it stands. */
type PushTokenRefusal = "no_token" | "malformed" | "unknown_key" | "bad_signature" | "wrong_audience" | "expired" | "wrong_issuer";
/**
 * A Pub/Sub push's bearer token, checked: signed by Google (RS256, a published key), issued by Google, for `audience`,
 * and live. Returns the token's email (the subscription's service account) when it stands.
 */
declare function verifyGooglePushToken(authorization: string | null, audience: string, p?: {
    now?: number;
    deps?: Deps;
}): Promise<{
    ok: true;
    email: string | null;
} | {
    ok: false;
    why: PushTokenRefusal;
}>;
/** A Gmail push's message: the mailbox that changed, and its history id then. Null for a body that is not one. */
declare function gmailPushOf(body: unknown): {
    address: string;
    historyId: string | null;
} | null;
/** Graph's notifications: each subscription that says it changed, with the clientState it carries. */
declare function graphNotificationsOf(body: unknown): Array<{
    subscriptionId: string;
    clientState: string | null;
}>;
/** A notification's clientState against the one the subscriptions were made with, in constant time (as hashes). */
declare function clientStateMatches(a: string | null, b: string): boolean;

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
 *
 * This module holds the wire's own vocabulary: the Trust Hub policies, the two
 * hosts, and a request and how its form is written. The requests themselves are
 * trust-hub.ts (the profiles, the end users, the address) and brand-campaign.ts
 * (the brand and the campaign); the business they describe is
 * business-record.ts; the saga's steps are steps.ts and what the carriers
 * answer is verdict.ts.
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
/**
 * The name the brand is filed under: a sole proprietor's trading name where it has one (the carriers show it beside the
 * texts), and the legal name otherwise. One rule for the filing that sends it and the line that keeps it, so the save can
 * say which name the carriers hold (the wiring's second audit, X4-3).
 */
declare function brandNameOf(r: Pick<BusinessRecord, "ein" | "legalName" | "tradeName">): string;

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
 * The Messaging API half of a registration, as requests: the brand registered from the two profiles, and the
 * campaign on the line's Messaging Service, filed, corrected in place or taken off. The profiles are trust-hub.ts;
 * the policies, the hosts and the request's shape are wire.ts.
 */

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

/**
 * The registration's steps and their receipts: the order the saga walks them (A2P_STEPS), what it has made so far
 * (A2PState), and the next step on either registration (nextA2PStep). The saga that runs them is ../a2p-saga.ts.
 */

type A2PStep = SchemaSet<"lines.reg_step">;
/** In the order the saga walks them; lines/lines.type-test.ts holds them to the column. */
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
 * What the carriers answered, in the product's words: a wait told apart from a refusal (isBrandNotReady), why they
 * refused (refusalWords), the line's sms_state (smsStateFor), and the bell a change rings (registrationVerdict).
 */
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
/**
 * Pages read on a location's first sync (decision 0073, R17): every review it has, as far as one sync can read in its
 * function's time, two thousand at most; reviews_complete says whether that was all of them.
 */
declare const GBP_REVIEWS_FIRST_PAGES = 40;
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
/**
 * One location read alone by its name (locations/{id}): one call whatever the size of the account, read in the fields
 * each of an account's list is (parseLocations). A refusal is named, as every call's is; an answer that names no
 * location is Google's fault (502).
 */
declare function readLocation(http: PlacesHttp, token: string, locationName: string): Promise<GbpLocation>;
/** The newest pages of reviews, up to `maxPages`; the rating and the count as Google reports them beside. */
declare function listReviews(http: PlacesHttp, token: string, parent: string, maxPages?: number): Promise<GbpReviewsPage>;
declare function replyToReview(http: PlacesHttp, token: string, reviewName: string, comment: string): Promise<{
    reply_text: string | null;
    replied_at: string | null;
}>;
/** A reply as Google accepts it: words, at most this many characters. */
declare const GBP_REPLY_MAX = 4096;
declare function cleanReply(text: unknown): string;
/** One opening period, as the Places listing's week keeps one (day 0 is Sunday); no close is around the clock. */
interface GbpPeriod {
    open: {
        day: number;
        hour: number;
        minute: number;
    };
    close: {
        day: number;
        hour: number;
        minute: number;
    } | null;
}
/** A location's details, as the first run's Check offers them (each kept only on the owner's tap). */
interface GbpLocationDetails {
    hours: GbpPeriod[] | null;
    /** Days the location says it is closed, YYYY-MM-DD, each run of days with its last. */
    closed: Array<{
        date: string;
        until: string | null;
    }>;
    phone: string | null;
    website: string | null;
    /** Its primary category's name ("Hair salon"), and the rest. */
    category: string | null;
    categories: string[];
    description: string | null;
    /** Its services as the profile lists them, each with its price where it gives one ("$65", "65 EUR"). */
    services: Array<{
        name: string;
        price_note: string | null;
    }>;
}
/** A connected location's details (locations.get with GBP_DETAILS_READ_MASK); throws a PlacesError when Google refuses. */
declare function readLocationDetails(http: PlacesHttp, token: string, locationName: string): Promise<GbpLocationDetails>;

/**
 * The check: what a fresh read of the listing changes, decided once, purely.
 *
 * Two sources, one rule for news. The public listing shows the five reviews
 * Google finds most relevant, never a feed, and counts every rating, with
 * or without words: a review is new when it was not on record and was
 * written since the previous check (a relevance shift can surface an old
 * one, and that is not news), and the count is the truth for how many
 * ratings arrived. The owner's Business Profile carries every review, so
 * there the rule is simply: not on record, written since the last sync.
 * The first read after linking or connecting is history and raises
 * nothing. The edge runs these plans against the tables and the bell; the
 * tests run them against fixtures.
 */

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
        /** What the listing says now beyond its name and address (google_listings.facts), for the first run to offer. */
        facts: GoogleListingFacts;
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
    /**
     * Whether Google's list of the location's reviews ended on this pass, with no page left when the pages the sync may
     * read ran out: the reviews on record are then every one Google lists (google_connections.reviews_complete).
     */
    complete: boolean;
    /**
     * Whether the reviews on record that this read did not list may go (decision 0036, 00392): only after a complete read
     * that holds as many reviews as Google counts (or holds reviews, when Google gives no count), or one Google says holds
     * none. A complete read with no reviews and no count is a page that came back without its list, and one with fewer
     * than the count a list cut short, never a location that lost them: the purge's ninety days take what this leaves.
     */
    prune: boolean;
}
declare function planProfileSync(before: ProfileBefore, known: ReadonlyMap<string, KnownReview>, page: GbpReviewsPage, day: string, nowMs: number): ProfileSyncPlan;

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
    /** Minted fresh for every token: the edge refuses one it has seen before the token expires. */
    nonce: string;
    /** The request this call was made in, when the dashboard was serving one: a name shaped by `requestIdShaped`. */
    rid?: string | null;
    /** The body's hash (edgeBodyHash), when the call has a body: the token opens the door for that body only. */
    bh?: string;
}
declare function signEdgeToken(secret: string, aud: string, ctx?: {
    workspace?: string | null;
    user?: string | null;
    request?: string | null;
    body?: string;
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
/** Whether a body is the one a token's hash names, in constant time. A token that names no body says nothing here. */
declare function edgeBodyMatches(claims: Pick<EdgeClaims, "bh">, body: string): boolean;

/**
 * One request's name: how it is chosen, and what a name may look like. "What happened to this click?" is then one
 * search across both apps' logs, the jobs the click queued and the events it wrote.
 *
 * This file chooses and checks names; it holds none. The name of the request being served is held in log/request.ts
 * (an AsyncLocalStorage on globalThis, so every bundled copy of channels sees one store): `withRequestId` runs work
 * inside a name and `requestId()` reads it back. It is read by
 *   - the logger (log/logger.ts), which puts `request_id` on every line written inside a request;
 *   - scheduleJob (packages/jobs schedule.ts), which stamps it into a job's payload as `request_id`, unless the
 *     payload already names one;
 *   - dispatchJob (packages/jobs handlers.ts), which runs a job under its payload's name, else under its own row id;
 *   - the service-role database client (packages/db observe.ts namedFetch, made in service-client.ts), which sends it
 *     as x-chanlytics-request-id on every call, so `events.request_id` is filled whether TypeScript or a SQL function
 *     wrote the row (00277);
 *   - the edge's door() and the dashboard's withRoute, which name a request as it enters, run it inside its name and
 *     answer it back in REQUEST_ID_HEADER; and the dashboard's edgeHeaders, which sends it on to the edge in the same
 *     header and signs it into the edge token (edge-token.ts `rid`).
 *
 * `requestIdOf(headers, { trustCaller })` picks the name as a request enters: the caller's x-request-id, only where
 * the caller is trusted to name its own request and the value is shaped like a name; else the platform's own for the
 * invocation (x-vercel-id); else a fresh uuid. Only the edge's admin doors, called by the dashboard, trust their
 * caller. A browser's header is never taken, since it could name its requests after someone else's: withRoute passes
 * trustCaller false, and a webhook's door is named by the platform. An admin door first takes the name signed into a
 * verified edge token (door() in apps/edge/lib/log.ts), so a header alone never renames a call whose token verified;
 * this is what it falls back to.
 *
 * `requestIdShaped` is the one shape check: 8 to 128 letters, digits and . _ : - (a log field, never a sentence or a
 * payload). The edge token uses it to admit a name to sign and to read one back; the job runner, to read a payload's
 * `request_id`.
 */
/** The header a request's name rides in: from the dashboard to the edge, and back to the browser on every answer. */
declare const REQUEST_ID_HEADER = "x-request-id";
/**
 * The name this request goes by. The caller's, when it is trusted to give one (the edge's admin doors, called by the
 * dashboard with a token) and gave a sane one; else the platform's own for this request (x-vercel-id); else a fresh
 * one. A browser's header is not taken: it could name its requests after someone else's.
 */
declare function requestIdOf(headers: Headers, opts: {
    trustCaller: boolean;
}): string;
/** A value that may name a request (a job's payload, a header), trimmed, or null when it is not one. */
declare function requestIdShaped(value: unknown): string | null;

type LogLevel = "info" | "warn" | "error";
/** A line's fields: anything JSON can carry. An undefined field is dropped, not written as null. */
type LogFields = Record<string, unknown>;
/**
 * A logger with context bound to it. Pass the workspace once, as `tenant_id`, where it becomes known, and every line
 * beneath carries it. `E` is the app's closed set of names: tsc refuses a name outside it wherever the logger is typed.
 */
interface Logger<E extends string = string> {
    info(event: E, fields?: LogFields): void;
    warn(event: E, fields?: LogFields): void;
    error(event: E, fields?: LogFields): void;
    /** A logger with more context bound: per message inside a batch. */
    child(extra: LogFields): Logger<E>;
}
declare function logger<E extends string = string>(base?: LogFields): Logger<E>;
/** An error rendered for a log field: name and message, never a stack blob (the logger adds the stack on an error line). */
declare function errField(e: unknown): string;

/** One name's share of a request's time: how long all of it took, and how many there were. */
interface RequestTiming {
    ms: number;
    n: number;
}
/** Run `fn` as the request named `id`: every line it logs, every job it schedules and every event it writes carries the name. */
declare function withRequestId<T>(id: string, fn: () => T): T;
/** The name of the request the code running now serves, or null outside one (a script, a test, a clock's own SQL). */
declare function requestId(): string | null;
/**
 * The workspace this request acts on, said once where it is resolved (the dashboard's route pipeline): the lines
 * logged after it carry `tenant_id` without each call site passing it. Outside a request it does nothing.
 */
declare function noteTenant(tenantId: string): void;
/** The workspace the request running now acts on, when it has said. */
declare function requestTenant(): string | null;
/**
 * A share of the request's time, said where it was spent: the database client after each call, a reader after each read.
 * Durations add up under one name and are counted, so `db` is every call and how many. Outside a request it does
 * nothing, and it never holds more than a few dozen names: past that a new name is not kept.
 */
declare function noteTiming(name: string, ms: number): void;
/** Where the request running now has spent its time so far, by name; none outside a request. */
declare function requestTimings(): ReadonlyMap<string, RequestTiming>;
/**
 * A table one of the request's database calls touched, and how (`read`, `INSERT`, `UPDATE`, `DELETE`), or a SQL function it
 * called (`rpc:<name>`, `call`): said by the database client after each call (packages/db observe.ts namedFetch). A sample of
 * production's requests says them in their answered line, and what the trace of a route says it reads and writes
 * (tooling/scripts/trace-routes.mjs) is held to them (decision 0058, the wiring's second audit, lane R7). Outside a request it
 * does nothing, and it holds a few dozen at most: past that a new one is not kept.
 */
declare function noteTouch(table: string, how: string): void;
/** The tables and functions the request running now has touched so far, each with how; none outside a request. */
declare function requestTouches(): ReadonlyMap<string, ReadonlySet<string>>;

/** What a link seals: whose it is, and the email it came in. */
interface SealedClaims {
    tenantId: string;
    contactId: string;
    messageId: string;
}

/**
 * The unsubscribe link a campaign email carries: whose "stop" it is, sealed.
 *
 * RFC 8058's one click takes no sign-in, so the link is the authority: it names the workspace, the person and the
 * email it came in, and a keyed MAC makes it unforgeable. It never expires. The law wants the way out working for
 * at least thirty days (CAN-SPAM), a stop pressed late must still stop, and all a token can ever do is narrow what
 * may be sent, so a leaked one costs the person nothing they did not ask for.
 *
 * The seal is sealed-link.ts's, under this link's own label and UNSUBSCRIBE_SECRET, which the edge (minting, Reach
 * out Part 3) and the dashboard (the page, apps/dashboard/app/u/[token]) share. The page also opens a link sealed
 * under UNSUBSCRIBE_SECRET_PREVIOUS, so the secret can be rotated without closing a link already sent.
 */

type UnsubscribeClaims = SealedClaims;
/** Where the page lives on the dashboard's origin. */
declare const UNSUBSCRIBE_PATH = "/u/";
declare function signUnsubscribeToken(secret: string, c: UnsubscribeClaims): string;
/**
 * The claims a token seals, or null for anything that is not a token one of these secrets made. Never throws.
 * `secrets` is the current secret and, while a rotation settles, the one before it: a link already in somebody's
 * inbox must keep working for at least thirty days (CAN-SPAM), so a rotation never closes one. A blank is skipped.
 */
declare function verifyUnsubscribeToken(secrets: readonly (string | null | undefined)[], token: string): UnsubscribeClaims | null;
/** The link, on an origin: what the footer shows and List-Unsubscribe carries. */
declare function unsubscribeUrl(origin: string, token: string): string;

/**
 * The link a sign-up's confirmation email carries (a website's form, 00489): pressed, it is the person's yes to offers
 * by email, proven by the press, since only the inbox the email reached holds the link.
 *
 * It names the workspace, the person and the confirmation email, sealed as the unsubscribe link is (sealed-link.ts)
 * under its own label, so neither kind of link opens as the other though both use UNSUBSCRIBE_SECRET (and its previous
 * value while a rotation settles). It carries no time: how long it works is read off the email's row by the yes door
 * (set_email_offers_yes, confirmed_signup), the one place that says it. The edge mints it; the dashboard's page
 * (apps/dashboard/app/c/[token]) opens it.
 */

type ConfirmClaims = SealedClaims;
/** Where the page lives on the dashboard's origin. */
declare const CONFIRM_PATH = "/c/";
declare function signConfirmToken(secret: string, c: ConfirmClaims): string;
/** The claims a token seals, or null for anything that is not a confirmation link one of these secrets made. */
declare function verifyConfirmToken(secrets: readonly (string | null | undefined)[], token: string): ConfirmClaims | null;
/** The link, on the dashboard's origin: what the confirmation email carries. */
declare function confirmUrl(origin: string, token: string): string;

/**
 * The lead finder's provider, over its HTTP API (https://docs.apify.com/api/v2).
 *
 * No SDK: six documented calls, each pinned to its shape, with fetch handed in
 * so every test runs without a network (google-places.ts's pattern). The token
 * travels in a header, never in a URL. A 429 or a 5xx, or no answer at all,
 * throws ApifyRetryable, and the jobs ledger's own waits retry the job
 * (RETRY_WAITS_MS); any other 4xx throws ApifyRefused, which is an answer.
 * Items are read with a field projection and never `clean` or `skipEmpty`:
 * both drop items, and an offset must always mean the same item.
 *
 * Nothing here is shown to an owner, so the vendor's name is fine in code and
 * never in a word the product says.
 */
declare const APIFY_BASE = "https://api.apify.com/v2";
declare const APIFY_TIMEOUT_MS = 20000;
/** The run endings an ad-hoc webhook fires on (https://docs.apify.com/integrations/webhooks/events). */
declare const APIFY_RUN_END_EVENTS: readonly ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"];
/** Waiting may help: the provider is busy, broken, or did not answer at all (status null). */
declare class ApifyRetryable extends Error {
    readonly status: number | null;
    constructor(status: number | null, message: string);
}
/** An answer: the request itself is wrong, or the account may not do this. Waiting changes nothing. */
declare class ApifyRefused extends Error {
    readonly status: number;
    constructor(status: number, message: string);
}
interface ApifyRun {
    id: string;
    status: string;
    datasetId: string | null;
    usageTotalUsd: number | null;
    startedAt: string | null;
    finishedAt: string | null;
}
interface ApifyClient {
    startRun(actor: string, input: unknown, opts: {
        build: string;
        timeoutSecs: number;
        memoryMb?: number;
        maxTotalChargeUsd: number;
        webhooks: {
            eventTypes: string[];
            requestUrl: string;
        }[];
    }): Promise<{
        id: string;
        datasetId: string;
    }>;
    getRun(id: string): Promise<ApifyRun>;
    listActorRuns(actor: string, sinceIso: string): Promise<{
        id: string;
        status: string;
        startedAt: string;
        datasetId: string | null;
    }[]>;
    /** The input a run was started with, read from its own key-value store: how the sweep tells our run from anyone else's. */
    runInput(id: string): Promise<unknown>;
    listItems(datasetId: string, offset: number, limit: number, fields: string[]): Promise<{
        items: unknown[];
        total: number | null;
    }>;
    abortRun(id: string): Promise<void>;
    eventPrices(actor: string): Promise<Record<string, number>>;
    /** The build number the actor's `latest` tag names today, or null when it names none: what a gone pin is moved to. */
    latestBuild(actor: string): Promise<string | null>;
    /**
     * The build number a build's id names, or null when the provider has no such build: a pin it deleted. Read without
     * the key: the provider answers a build to whoever holds its id, and a key it does not know is refused (401).
     */
    buildNumberOf(buildId: string): Promise<string | null>;
}
declare function apifyClient(fetchImpl: typeof fetch, token: string): ApifyClient;

/** Twenty-five places at low effort fit in about 3,000 tokens; the rest is room. A cap reached is a refusal, never a split. */
declare const LEAD_JUDGE_MAX_TOKENS: 6000;
declare const LEAD_JUDGE_FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** The registry's model for the judge (contracts ai/models.ts); LEAD_JUDGE_MODEL on the edge may name another. */
declare const LEAD_JUDGE_DEFAULT_MODEL: "claude-opus-5";
/**
 * The client as this call uses it: the edge builds one over the model port (apps/edge/lib/leads/lead-wires.ts), which
 * writes each call to the usage ledger for the workspace named in `call`, with the round it was paid in as the row's
 * subject.
 */
interface LeadJudgeClient {
    beta: {
        messages: {
            create(params: Record<string, unknown>, call?: {
                tenantId?: string;
                roundId?: string;
            }): Promise<unknown>;
        };
    };
}
type LeadJudgeAnswer = {
    answers: JudgePlaceAnswer[];
    model: string;
    tokens: number;
    raw: unknown;
    requestHash: string;
} | {
    refused: true;
    why: string;
};
/** A people search's batch of companies, judged (contracts company-judge.ts): as a places batch is answered. */
type CompanyJudgeAnswer = {
    answers: CompanyFitAnswer[];
    model: string;
    tokens: number;
    raw: unknown;
    requestHash: string;
} | {
    refused: true;
    why: string;
};
interface LeadJudge {
    /**
     * One batch judged; `tenantId` is the search's workspace, the usage ledger's row, and `roundId` the round the batch is
     * paid in, the row's subject (and the second model's rows for the same call): what the judge cost a search is read off
     * the ledger by it. A call that names no round leaves the subject empty.
     */
    judge(plan: LeadSearchPlan, places: PlaceFacts[], tenantId?: string, roundId?: string): Promise<LeadJudgeAnswer>;
    /** One batch of a people search's companies read against what it asked for, paid as a places batch is. */
    judgeCompanies(plan: LeadPeoplePlan, companies: CompanyFacts[], tenantId?: string, roundId?: string): Promise<CompanyJudgeAnswer>;
}
declare function leadJudge(client: LeadJudgeClient, model: string, fallbacks: boolean): LeadJudge;

export { type A2PAnswer, type A2PPorts, type A2PRequest, type A2PResult, type A2PState, type A2PStep, A2P_POLICIES, A2P_STEPS, APIFY_BASE, APIFY_RUN_END_EVENTS, APIFY_TIMEOUT_MS, type AgentPlan, type ApifyClient, ApifyRefused, ApifyRetryable, type ApifyRun, type AvailableNumber, BOT_USER_AGENT, type BounceClass, type BrandType, type BusinessRecord, CALLER_UNKNOWN, CALL_ANALYSIS_FIELDS, CONFIRM_PATH, type CalendarEvent, type CalendarIds, type CampaignError, type CampaignFacts, type CarrierConsent, type CompanyJudgeAnswer, type ConfirmClaims, type ConversationMint, DKIM_SELECTORS, type DeliveryReport, type DryCall, type DryProvider, EDGE_TOKEN_TTL_MS, ELEVENLABS_SIGNATURE_HEADER, ELEVENLABS_WEBHOOK_TOLERANCE_S, EMPTY_A2P_STATE, type EdgeClaims, type EdgeTokenVerdict, type ElevenLabsConfig, type EmailCampaign, type EmailIdentity, type EmailLeftAsWhy, type EmailParent, type EmailReceipt, type EmailReceiptEffect, type EmailReceiptType, type EmailReceivedEvent, type EmailRequest, type EmailRequestInput, type EmailSendsAs, type EmailSuppressionReason, type EventsPage, FACTS_UNAVAILABLE, FRESH_SLACK_MS, type FoundSent, GBP_ACCOUNTS_URL, GBP_INFO_BASE, GBP_LOCATIONS_READ_MASK, GBP_REPLY_MAX, GBP_REVIEWS_FIRST_PAGES, GBP_REVIEWS_MAX_PAGES, GBP_REVIEWS_PAGE, GBP_V4_BASE, GOOGLE_AUTH_URL, GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL, type GbpAccount, type GbpLocation, type GbpLocationDetails, type GbpPeriod, type GbpReview, type GbpReviewsPage, type GmailHistory, type GmailSent, type GraphDelta, type GraphSent, HANDOFF_VAR, INSTAGRAM_DM_MAX_BYTES, type IgMessaging, type IgReferral, type InboundMessage, type InstagramAnswer, type InstagramApp, type InstagramCodeGrant, type InstagramConfig, type InstagramDeps, type InstagramEvent, type InstagramGraphError, type InstagramRequest, type KnownPerson, type KnownReview, LEAD_JUDGE_DEFAULT_MODEL, LEAD_JUDGE_FALLBACK_BETA, LEAD_JUDGE_MAX_TOKENS, LINE_COSTS, LINE_STEPS, LOW_VOLUME_USECASE, type LeadJudge, type LeadJudgeAnswer, type LeadJudgeClient, type LinePorts, type LineProvider, type LineProviderName, type LineRow, type LineSecrets, type LineStep, type LineTypeAnswer, type LineVoiceState, type LinkedMediaRef, type ListCallsPage, type ListedMail, type ListingBefore, type ListingCheckPlan, type LiveAgentSettings, type LiveCallControl, type LiveVoiceLlm, type LogFields, type LogLevel, type Logger, MAILBOX_SCOPES, MESSAGING, META_SIGNATURE_HEADER, type MailCapability, type MailDomainFacts, type MailPage, type MailWindow, type MailboxEmail, type MailboxGrant, type MailboxOAuthClient, type MailboxReach, type MailboxRequest, type MailboxSendInput, type MailboxSendResult, type MediaRef, type ModelAsk, type ModelBlock, type ModelDeps, type ModelMessage, type ModelOutcome, type ModelReply, type ModelStreamReply, type NormalizedCall, type NormalizedInbound, NotPublicError, type OAuthClient, type OAuthState, PLACES_BASE, PLACES_DETAILS_MASK, PLACES_SEARCH_LIMIT, PLACES_SEARCH_MASK, PLACES_TIMEOUT_MS, PLACE_ID, PROFILE_SCOPES, type PeoplePage, type PlaceCandidate, type PlaceDetails, type PlaceReview, PlacesError, type PlacesHttp, type PlacesRequest, type PlatformRecipient, type ProfileBefore, type ProfileSyncPlan, type Provider, type ProviderAccount, type ProviderCall, type ProviderReply, type ProvisionAction, type ProvisionSecrets, type ProvisionStep, type ProvisionStepId, type PublicFetchDeps, type PushTokenRefusal, REQUEST_ID_HEADER, RETELL_ORIGINATION, REVIEW_BELL_MAX, type ReadVerdict, type ReceivedEmail, type ReceivedText, type RecordingFetch, type RequestTiming, type ResendAnswer, type ResendConfig, type ResendLimit, type Resolve, type Resolved, type RetellAgentConfig, type RetellCall, type RetellCallRead, type RetellConfig, type RetellLlmConfig, type RetellTool, type RetellTranscriptTurn, type RetellWrite, type ReviewBell, SEND_DEADLINE_MS, SEND_MIN_MS, SMS_FOOTER, SMS_HELD_DETAILS, SMS_HELD_REASON, SMS_MAX_CHARS, SMS_OPTED_OUT_CODE, SPF_INCLUDES, STATE_TTL_MS, SYSTEM_ONE_URL, type SagaResult, type SendEmailOptions, type SendOutcome, type SendResult, type SmsInbound, type SmsRegistrationState, type SmsSendResult, type SmsStatus, type SpeechStream, type SvixHeaders, type SystemOneAsk, type SystemOneReply, TRUSTHUB, TWILIO_TIMEOUT_MS, type TokenGrant, type TwilioAnswer, TwilioError, type TwilioHttp, type TxtAnswer, UNSUBSCRIBE_PATH, type UnsubscribeClaims, VOICE_AGENT_DEFAULTS, VOICE_LLM_DEFAULTS, VOICE_NUMBER_DEFAULTS, VOICE_SHELL_BEGIN, VOICE_SHELL_PROMPT, VOICE_WEBHOOK_EVENTS, VOICE_WEBHOOK_TIMEOUT_MS, type VoiceConvergencePlan, type VoiceProvisionPlan, type VoiceProvisionRequest, type VoiceProvisionState, type VoiceShellTarget, WA_HISTORY_NOT_SHARED, WEBHOOK_TOLERANCE_S, WHATSAPP_SEND_TIMEOUT_MS, type WaChangeValue, type WaConfig, type WaHistoryChunk, type WaHistoryOf, type WaHistoryRead, type WaMediaRef, type WaPricing, type WaRawMessage, type WaStateSyncItem, type WaSyncedContact, type WebCallMade, a2pProfileEndUserRequest, a2pProfileRequest, accountsRequest, addressOf, addressRequest, agentSettingsDrift, answerObject, apifyClient, askModel, askSystemOne, assignRequest, authorizeUrl, availabilityUrl, b64url, brandNameOf, brandRequest, brandTypeFor, breakerOf, breakerStates, buildEmailRequest, buildMime, businessAttributes, businessEndUserRequest, calendarIcs, callSummaryLine, campaignRequest, campaignsIdentity, carrierConsent, chooseLineProvider, classifyReceived, cleanGmailSignature, cleanReply, clientStateMatches, confirmUrl, connectedIdentity, contactsSyncedOf, createAgent, createAgentVersion, createPhoneNumber, createRetellLlm, createWebCall, customerProfileRequest, deleteCampaignRequest, deleteConversation, deletePhoneNumber, deleteReplyRequest, deliveryReportOf, desiredVoiceShell, dkimOf, dmarcOf, dryProvider, edgeBodyMatches, elevenLabsWebhookSignature, emailHtml, emailPlainText, emailReceiptEffect, emailReceiptFrom, emailReceivedEventFrom, encodeForm, errField, evaluateRequest, evaluateTrustProductRequest, fetchLinkedMedia, fetchMailDomains, fetchMediaBytes, fetchReceivedEmail, fetchRecording, fetchTwilio, filedAsBulk, filedUnderUpdates, formatRejected, getAgent, getAgentRaw, getCall, getPhoneNumber, getPlace, getRetellLlm, gmailDayUsed, gmailEmailOf, gmailFindSent, gmailHistory, gmailListSince, gmailMessage, gmailNoMailbox, gmailProfile, gmailPushOf, gmailReadVerdict, gmailReports, gmailSend, gmailSentIds, gmailSignature, gmailSignatureWords, gmailSignedOut, gmailStop, gmailThreadOf, gmailWatch, googleCalendarIds, googleContacts, googleEvents, grantHasScope, grantHolds, grantScopes, grantScopesMissing, graphCalendarIds, graphContacts, graphDayUsed, graphDeleteMessage, graphDelta, graphEmailOf, graphEvents, graphFindSent, graphInbox, graphJunkSince, graphListSince, graphMe, graphMessage, graphNoMailbox, graphNotificationsOf, graphReadVerdict, graphRenew, graphSend, graphSignedOut, graphSubscribe, graphThrottled, graphUnsubscribe, hostedAddress, hostedIdentity, idTokenClaims, imageBytes, importPhoneNumber, inboundFromInstagram, inboundFromSms, inboundFromWhatsapp, instagramAuthorizeUrl, instagramCall, instagramCodeOf, instagramCodeRequest, instagramDmChunks, instagramErrorOf, instagramEventsOf, instagramLongLivedRequest, instagramMeRequest, instagramNameOf, instagramRefreshRequest, instagramRefusalOf, instagramSubscribeRequest, instagramThrottled, isAreaCode, isBrandNotReady, isEmailRequest, isLinkedMedia, isPublicAddress, isValidSipPassword, keywordsFor, leadJudge, lineCodesFrom, listAccounts, listCalls, listLocations, listReviews, liveTurns, locationsRequest, logger, lookupLineType, mailDomainsFrom, mailboxAdminConsentUrl, mailboxAuthorizeUrl, mailboxDtoOf, mailboxHeader, mailboxMessageId, mailboxPkceChallenge, mailboxPkceVerifier, mailboxRefreshRequest, mailboxRevokeRequest, mailboxSignatureOf, mailboxTokenRequest, mergeConsent, messageIdHeader, messageIdsIn, metaSignatureValid, mintConversationToken, newDraftNote, newNonce, nextA2PStep, nextLineStep, normalizeCall, normalizeInbound, noteTenant, noteTiming, noteTouch, oneLine, oneTimeCodeOf, pageText, parseAccounts, parseInstagramCodeGrant, parseInstagramMe, parseInstagramToken, parseLocations, parseMailboxGrant, parsePlaceDetails, parsePlacesSearch, parseReviewsPage, parseTokenResponse, parseTranscriptText, placesDetailsRequest, placesFetch, placesSearchRequest, planAgentSettings, planListingCheck, planProfileSync, planVoiceConvergence, planVoiceProvision, platformRecipient, providerFetch, publicFetch, publicFetcher, publicLookup, publishAgentVersion, readInstagramName, readLocation, readLocationDetails, receivedEmailFrom, referencesFor, refusalWords, registrationVerdict, replyRequest, replyRouteAddress, replySubject, replyToReview, representativeAttributes, representativeEndUserRequest, requestId, requestIdOf, requestIdShaped, requestLeavesAs, requestTenant, requestTimings, requestTouches, resendLimitOf, resendWebhookSignature, resetBreakers, resetFastHolds, retellImportBody, retellLocalesFor, reviewBells, reviewIdOf, reviewParent, reviewsRequest, revokeRequest, rowIdOfMessageId, runA2PSaga, runLineSaga, sameSignature, searchPlaces, sendEmail, sendFromMailbox, sendInstagramText, sendTemplate, sendText, senderAuthenticated, sendsAs, sendsAsCampaigns, sendsAsConnected, setPublicFetch, sharedHistoryOf, signConfirmToken, signEdgeToken, signState, signUnsubscribeToken, sipPassword, sipUsername, smsBody, smsInboundFrom, smsInboundUrl, smsKeywordConsent, smsRefusalOf, smsStateFor, smsStatusFrom, smsStatusToRow, smsStatusUrl, soleProprietorEndUserRequest, soleProprietorProfileRequest, speakText, spfNamesProvider, spfRecordsOf, spfTermsOf, starRatingNumber, starterAttributes, starterEndUserRequest, starterProfileRequest, stopCall, storableReferral, streamModel, stripKey, subaccountName, submitProfileRequest, submitTrustProductRequest, supportingDocumentRequest, tokenExchangeRequest, tokenRefreshRequest, trunkDomain, trustProductAssignRequest, twilioProvider, twilioRequest, twilioSignature, twilioSignedString, twilioUrls, unb64url, unpublishedLatestNote, unsubscribeUrl, updateAgent, updateCampaignRequest, updateEndUserRequest, updateLiveCall, updatePhoneNumber, verifyConfirmToken, verifyEdgeToken, verifyElevenLabsWebhook, verifyGooglePushToken, verifyResendWebhook, verifyRetellSignature, verifyState, verifyTwilioSignature, verifyUnsubscribeToken, voiceAgentCreateBody, voiceEndpoints, voiceLlmCreateBody, voiceNumberBindBody, voiceNumberBinding, voiceNumberCreateBody, voiceShellDrift, voiceShellTools, waPricingOf, waStoppedMarketing, webCallBody, webCallMadeOf, withKey, withRequestId };
