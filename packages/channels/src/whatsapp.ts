/**
 * WhatsApp Cloud API adapter (Blueprint P2): normalizes webhook payloads into
 * canonical events and performs sends. No persistence, no decisions — the edge
 * wires this to the repositories. Config is passed in; env is never read here.
 */
import { CONVERSATION_OPT_IN_PATTERN, MARKETING_OPT_IN_PATTERN, REFERRAL_ID_MAX } from "@chanlytics/contracts";
import { asksToStop } from "./stop-request";
import { answerObject, providerFetch, type SendOutcome } from "./provider-fetch";
import { errField, logger } from "./log/logger";

const GRAPH = "https://graph.facebook.com/v25.0";

export interface WaConfig {
  phoneId: string;
  accessToken: string;
}

/* ------------------------------- inbound ------------------------------- */

export interface WaRawMessage {
  from: string;
  id: string;
  type: string;
  timestamp?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  audio?: { id?: string; mime_type?: string };
  video?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; caption?: string; filename?: string };
  sticker?: { id?: string; mime_type?: string };
  /** Tap on a TEMPLATE quick-reply button. Both fields hold the label. */
  button?: { payload?: string; text?: string };
  /** Tap on an interactive reply button, or a pick from an interactive list. */
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  /** An emoji tapped onto one of OUR messages. Carries no request. */
  reaction?: { message_id?: string; emoji?: string };
  /** A pin drop. Readable by a person, and useful — unlike a voice note. */
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  /** One or more shared contact cards. */
  contacts?: Array<{ name?: { formatted_name?: string }; phones?: Array<{ phone?: string }> }>;
  /** Platform housekeeping (a customer changed their number). Not from a person. */
  system?: { body?: string; type?: string };
  /**
   * Present when the person came in through a click-to-WhatsApp ad or post: Meta names it (`source_id`) and says what
   * it was (`source_type`). The rest of it (headline, link, click id) is never kept. This is the shape Meta documents,
   * not one a message is trusted to have: `adReferralOf` reads it without assuming any of it.
   */
  referral?: { source_id?: string; source_type?: string };
}

export interface WaChangeValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: WaRawMessage[];
  statuses?: Array<{ id?: string; status?: string; recipient_id?: string; errors?: unknown; pricing?: unknown }>;
  message_echoes?: Array<{ to?: string; id?: string; text?: { body?: string } }>;
}

export interface WaMediaRef {
  provider_media_id: string;
  mime_type: string | null;
  caption: string | null;
  filename: string | null;
  fetch_state: "pending" | "stored" | "failed";
  storage_path?: string;
}

/** Canonical view of one inbound customer message. */
export interface NormalizedInbound {
  waId: string; // sender id verbatim (identity external_id)
  phoneDigits: string; // dialable digits (m.from)
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
  referral: { sourceId: string; sourceType: string | null } | null;
}

/**
 * What a referral's id may not hold: a control character (a NUL among them) or a lone surrogate. Postgres refuses both
 * inside the `p_meta` the id travels in (jsonb has no \u0000, and no lone surrogate is valid JSON), which would fail
 * `ingest_inbound`, make `pgIngest` throw IngestFailed and the door answer 503, and Meta would redeliver the same payload
 * for ever: the customer's message would never land. A whitespace control at either end is padding, trimmed before this
 * is asked; one inside the id is refused.
 */
const UNSTORABLE_IN_ID = /[\p{Cc}\p{Cs}]/u;

/**
 * What a referral's kind may be: Meta's own are the words `ad` and `post`, so a word of letters, digits, `_` and `-`, at
 * most 32 long. Anything else (a control character, a lone surrogate, a sentence, megabytes) is not a kind Meta sent and
 * is kept as none; the kind has no column to agree with, so the 32 is said here and nowhere else.
 */
const REFERRAL_KIND = /^[\p{L}\p{N}_-]{1,32}$/u;

/**
 * The ad or post a message came from (K3), read defensively. A click-to-WhatsApp referral's shape is Meta's to change
 * and unverified here, so nothing is assumed of `r`: it may be absent, not an object, or hold an id that is not a string.
 * Only the id and the kind are kept, and only when what they hold can always be written. The id is trimmed (padding is
 * not part of an id, and the trigger trims the same), then it is none when blank, longer than `REFERRAL_ID_MAX` (the one
 * length the column keeps, contracts first-touch.ts; never cut, a cut id would name another ad) or holding what
 * `UNSTORABLE_IN_ID` names: the stamp the database would refuse for it is the person's wire instead. The kind that is
 * not a plain word is null, and the id stands. Never throws, so a referral can cost a message nothing.
 */
function adReferralOf(r: unknown): NormalizedInbound["referral"] {
  if (typeof r !== "object" || r === null) return null;
  const id = "source_id" in r && typeof r.source_id === "string" ? r.source_id.trim() : "";
  if (id.length < 1 || id.length > REFERRAL_ID_MAX || UNSTORABLE_IN_ID.test(id)) return null;
  const kind = "source_type" in r && typeof r.source_type === "string" ? r.source_type.trim() : "";
  return { sourceId: id, sourceType: REFERRAL_KIND.test(kind) ? kind : null };
}

/**
 * What the customer actually chose, for messages where they chose rather than
 * typed — a template quick-reply, an interactive button, a list selection.
 *
 * `label` is the text they saw and tapped; `id` is the developer-set payload
 * behind it. Both are consent-bearing. The label is what a Spanish-speaking
 * customer reads ("Detener"), the id is what the tenant controls and can set to
 * a canonical token, so a button whose label is localised still opts out when
 * its id is "stop". Meta's own webhook reference uses "Unsubscribe" as the
 * example button payload — a word already in OPT_OUT_PATTERN.
 */
function chosenReply(m: WaRawMessage): { label: string; id: string } | null {
  if (m.button) {
    // payload and text both carry the label; payload is the one a tenant can
    // set independently when building the template.
    const label = m.button.text ?? m.button.payload ?? "";
    const id = m.button.payload ?? "";
    return label || id ? { label, id } : null;
  }
  const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
  if (r) {
    const label = r.title ?? "";
    const id = r.id ?? "";
    return label || id ? { label, id } : null;
  }
  return null;
}

/** The attachment a message carries, as a reference to fetch later: nothing is downloaded here. Null without an id. */
function mediaRefOf(
  src: { id?: string; mime_type?: string; caption?: string; filename?: string } | null,
): WaMediaRef | null {
  if (!src?.id) return null;
  return {
    provider_media_id: src.id,
    mime_type: src.mime_type ?? null,
    caption: src.caption ?? null,
    filename: src.filename ?? null,
    fetch_state: "pending",
  };
}

export function normalizeInbound(m: WaRawMessage, value: WaChangeValue): NormalizedInbound {
  // Never guess identity: contacts[0] can belong to a DIFFERENT sender in a
  // batched webhook, and contact_identities.external_id is a permanent mapping.
  const list = value.contacts || [];
  const contact = list.find((c) => c.wa_id === m.from) ?? (list.length === 1 ? list[0] : undefined);
  const mediaSrc = m.image || m.audio || m.video || m.document || m.sticker || null;

  // A tap IS text the customer sent — they just picked it instead of typing it.
  // Treating button and list replies as unreadable was two bugs in one: the
  // consent gate never saw a "Stop" button (so pressing it changed nothing),
  // and the message fell through to the non-text branch, which answered a
  // customer trying to unsubscribe with "sorry, I can't read that".
  const chosen = chosenReply(m);
  const typed = m.type === "text" && !!m.text?.body;
  const isText = typed || !!chosen;

  // Everything that is neither typed text nor an attachment, named rather than
  // lumped together. Location and contacts get a body a person can read, so
  // they reach the operator as a fact rather than as "[location message]".
  const loc = m.location;
  const cards = m.contacts?.length ? m.contacts : null;
  const kind: NormalizedInbound["kind"] = isText
    ? "text"
    : m.type === "reaction" && m.reaction
      ? "reaction"
      : loc && (loc.latitude != null || loc.address || loc.name)
        ? "location"
        : cards
          ? "contacts"
          : m.type === "system"
            ? "system"
            : mediaSrc?.id
              ? "media"
              : "unsupported";

  const describeLocation = (): string => {
    const where = [loc?.name, loc?.address].filter(Boolean).join(", ");
    const coords = loc?.latitude != null && loc?.longitude != null ? `${loc.latitude}, ${loc.longitude}` : null;
    return `Shared a location${where ? `: ${where}` : ""}${coords ? ` (${coords})` : ""}`;
  };
  const describeCards = (): string => {
    const names = (cards ?? []).map((c) => c.name?.formatted_name || c.phones?.[0]?.phone).filter(Boolean);
    return `Shared a contact card${names.length ? `: ${names.join(", ")}` : ""}`;
  };

  const body = typed
    ? m.text!.body!
    : chosen
      ? chosen.label || chosen.id
      : kind === "reaction"
        ? (m.reaction?.emoji ?? null)
        : kind === "location"
          ? describeLocation()
          : kind === "contacts"
            ? describeCards()
            : kind === "system"
              ? (m.system?.body ?? null)
              : null;

  // Consent is tested against the label AND the developer-set id, so a tenant
  // can make a localised button opt out by giving it the id "stop".
  const consentText = [body, chosen?.id].filter((s): s is string => !!s);
  const matches = (re: RegExp) => consentText.some((s) => re.test(s));
  return {
    waId: contact?.wa_id || m.from,
    phoneDigits: m.from,
    profileName: contact?.profile?.name || null,
    messageId: m.id,
    // Reactions, locations, contact cards and system notices all carry words
    // rather than bytes, so they are stored as text — messages.type has no
    // column for them and needs none. `kind` is what routing consults.
    type: isText || (body !== null && kind !== "media") ? "text" : "media",
    kind,
    rawType: m.type,
    body,
    channelTsIso: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
    media: mediaRefOf(mediaSrc),
    optOut: isText && consentText.some((s) => asksToStop(s, "whatsapp")),
    // WHICH yes, and only that one. START, UNSTOP, RESUME and ALTA answer the
    // appointment question; YES OFFERS answers the offers question and nothing
    // else. It used to answer both -- "texting OFFERS is also a way back in from
    // a STOP" -- which is one opt-in enrolling a person in two programs: the
    // thing the carriers refuse a campaign for (30913), and the message flow had
    // to confess it in the field the refusal named. The way back in from a STOP
    // is START, as the carriers' own reply to a STOP says.
    optIn: isText && matches(CONVERSATION_OPT_IN_PATTERN),
    optInMarketing: isText && matches(MARKETING_OPT_IN_PATTERN),
    referral: adReferralOf(m.referral),
  };
}

/**
 * What Meta says a message was billed as, on a `sent`, `delivered` or `read` receipt (K8): whether it is billable, the
 * model that priced it and its category and type. Meta sends no amount and no currency, so none is kept: the operator
 * prices a category by the recipient's country with Meta's rate card. A type alias, so it is a Json without a cast.
 */
export type WaPricing = { billable?: boolean; pricing_model?: string; category?: string; type?: string };

/**
 * A word of Meta's pricing (`PMP`, `utility`, `authentication-international`, `free_customer_service`): letters, digits, `_`
 * and `-`, at most 40. Anything else (a sentence, a control character, a megabyte) is not one. The same word the
 * database's message_keep_cost (00319) accepts, so what this keeps is what it stores: tied to it by
 * tooling/scripts/tests/messages/a-message-keeps-what-it-cost-to-send.db.test.mjs, which runs one table of pricings
 * through both, so an edit to either alone is a red test (database files run in CI when database paths change: run it).
 */
const PRICING_WORD = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * Meta's `pricing` as kept, read without trusting any of it: each key stands or falls on its own, and nothing but the four
 * is kept. The category is the key the operator prices by, and the cost door refuses an answer without one, so a pricing
 * without a valid category is none (null), and the caller says it was dropped. Never throws.
 */
export function waPricingOf(raw: unknown): WaPricing | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: WaPricing = {};
  if (typeof r.billable === "boolean") out.billable = r.billable;
  for (const key of ["pricing_model", "category", "type"] as const) {
    const word = r[key];
    if (typeof word === "string" && PRICING_WORD.test(word)) out[key] = word;
  }
  return out.category ? out : null;
}

/**
 * Meta's code for a message it did not deliver because the person chose, in WhatsApp, to stop marketing messages from
 * this business (Cloud API error 131050, "This recipient has chosen to stop receiving marketing messages on WhatsApp
 * from your business"). It comes in a failed receipt's `errors`. Not 131049 (Meta's own per-person limit on marketing
 * templates) and not 131047 (the reply window): neither is the person's answer.
 */
const WA_STOPPED_MARKETING = 131050;

/** Whether a receipt's `errors` say the person stopped marketing messages from this business. Never throws. */
export function waStoppedMarketing(errors: unknown): boolean {
  if (!Array.isArray(errors)) return false;
  return errors.some(
    (e) => e !== null && typeof e === "object" && Number((e as { code?: unknown }).code) === WA_STOPPED_MARKETING,
  );
}

/* -------------------------------- sends -------------------------------- */

export interface SendResult {
  ok: boolean;
  wamid: string | null;
  status: number;
  errorBody?: string;
  /** The provider's own error code when it gives one: a text's carrier says 21610 for a person who opted out (sms.ts smsRefusalOf). */
  code?: number | null;
  /**
   * A person's email reply only (core emailSender): whether it left by the own domain it was frozen with, or as the
   * mailbox's request, and why not by its own when it could not.
   */
  leftAs?: "own" | "mailbox";
  leftAsWhy?: EmailLeftAsWhy;
  /**
   * What the send came to (provider-fetch SendOutcome): `retryable` left nothing and may be tried again later;
   * `unknown` may have been taken, and is never sent again blind. Absent from a wire's own refusal (no credentials, a
   * request it will not send), which asked no provider.
   */
  outcome?: SendOutcome;
}

/**
 * Why a person's reply frozen with an own domain left as the mailbox's request instead (N5, G15). `domain_held`: the
 * domain it was frozen with was held between the freeze and the send.
 */
export type EmailLeftAsWhy =
  "no_own_route" | "domain_has_no_route" | "domain_held" | "twin_names_another_recipient" | "route_refuses_twin";

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
export const WHATSAPP_SEND_TIMEOUT_MS = 15_000;

async function postGraph(cfg: WaConfig, payload: unknown): Promise<SendResult> {
  const a = await providerFetch("meta", `${GRAPH}/${cfg.phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: WHATSAPP_SEND_TIMEOUT_MS,
    // A reply is always put on the wire: another call's timeouts never fail it (provider-fetch's breaker).
    breaker: "count",
  });
  if (a.status === 0)
    return { ok: false, wamid: null, status: 0, errorBody: a.error ?? "no answer", outcome: a.outcome };
  const out = (answerObject(a) ?? {}) as { messages?: Array<{ id?: string }>; error?: { code?: unknown } };
  const ok = a.outcome === "ok";
  const sent: SendResult = {
    ok,
    wamid: out.messages?.[0]?.id ?? null,
    status: a.status,
    errorBody: ok ? undefined : JSON.stringify(out).slice(0, 200),
    // Read before the body is cut: Graph writes its message first, and a long one pushes the code past 200 characters.
    code: !ok && typeof out.error?.code === "number" ? out.error.code : null,
  };
  return { ...sent, outcome: graphThrottled(sent) ? "retryable" : a.outcome };
}

/**
 * Meta's "not now": the codes Graph answers when this number, this app or this
 * business account has sent faster than it may. The message was not taken, so
 * it may be tried again later, and nobody after it will get through sooner.
 *
 *   4        the app's calls ran over its rate limit
 *   80007    the business account's rate limit
 *   130429   the number's message throughput
 *   131048   too many of the number's messages were blocked or reported, so
 *            Meta is limiting how many it may send
 *   131056   too many messages to the same person in a short while
 *
 * Distinct from a failure whose outcome is unknown: a timeout (status 0) or a
 * 5xx may have been taken all the same, and is never read as a throttle.
 */
const GRAPH_THROTTLE_CODES: readonly number[] = [4, 80007, 130429, 131048, 131056];

/** Whether Graph refused a send as too many, too fast: HTTP 429, or one of GRAPH_THROTTLE_CODES. */
export function graphThrottled(r: { ok: boolean; status: number; code?: number | null }): boolean {
  if (r.ok) return false;
  return r.status === 429 || (typeof r.code === "number" && GRAPH_THROTTLE_CODES.includes(r.code));
}

export async function sendText(cfg: WaConfig, to: string, body: string): Promise<SendResult> {
  return postGraph(cfg, { messaging_product: "whatsapp", to, type: "text", text: { body } });
}

/** Approved-template send — the only legal path outside the 24h window. */
export async function sendTemplate(
  cfg: WaConfig,
  to: string,
  template: { name: string; language: string; params: string[] },
): Promise<SendResult> {
  return postGraph(cfg, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      components: template.params.length
        ? [{ type: "body", parameters: template.params.map((t) => ({ type: "text", text: t })) }]
        : [],
    },
  });
}

/* -------------------------------- media -------------------------------- */

/**
 * Meta media URLs expire in minutes — fetch at ingest. Returns the bytes and
 * mime so the caller can store them (Supabase Storage via the service client).
 *
 * BOUNDED, because this is awaited BEFORE the customer's acknowledgement goes
 * out and before the rest of the webhook batch is handled. Both calls used to
 * be bare `fetch` with no signal and no size limit, so one large video or one
 * hung connection could consume the entire 60s invocation: the sender gets no
 * reply, and every other message in that batch is dropped with it. Meta's
 * retry then finds them already ingested and suppresses redelivery.
 *
 * The size cap is checked from Content-Length BEFORE reading the body, so an
 * oversized file costs one round trip rather than the memory.
 */
const MEDIA_META_TIMEOUT_MS = 8_000;
const MEDIA_BYTES_TIMEOUT_MS = 15_000;
const MEDIA_MAX_BYTES = 25 * 1024 * 1024; // Meta's own document ceiling

export async function fetchMediaBytes(
  cfg: WaConfig,
  providerMediaId: string,
): Promise<{ bytes: ArrayBuffer; mime: string | null } | null> {
  try {
    // The media's address is Graph's JSON, asked through providerFetch; its bytes are a download, fetched below.
    const metaRes = await providerFetch("meta", `${GRAPH}/${providerMediaId}`, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      timeoutMs: MEDIA_META_TIMEOUT_MS,
      idempotent: true,
      tries: 2,
    });
    // No answer at all is said as the thrown fetch was; Graph's own no is a null, as it was.
    if (metaRes.status === 0) logger().error("media_fetch_failed", { media_id: providerMediaId, error: metaRes.error });
    if (metaRes.outcome !== "ok") return null;
    const meta = (answerObject(metaRes) ?? {}) as { url?: string; mime_type?: string };
    if (!meta.url) return null;

    const binRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      signal: AbortSignal.timeout(MEDIA_BYTES_TIMEOUT_MS),
    });
    if (!binRes.ok) return null;

    const declared = Number(binRes.headers.get("content-length") ?? "0");
    if (declared > MEDIA_MAX_BYTES) {
      logger().error("media_too_large", { media_id: providerMediaId, bytes: declared });
      return null;
    }
    const bytes = await binRes.arrayBuffer();
    if (bytes.byteLength > MEDIA_MAX_BYTES) {
      logger().error("media_too_large_after_read", { media_id: providerMediaId, bytes: bytes.byteLength });
      return null;
    }
    return { bytes, mime: meta.mime_type ?? binRes.headers.get("content-type") };
  } catch (e) {
    // A timeout or network fault must return, not throw: the caller stores a
    // 'failed' fetch_state and the conversation still reaches a human.
    logger().error("media_fetch_failed", { media_id: providerMediaId, error: errField(e) });
    return null;
  }
}
