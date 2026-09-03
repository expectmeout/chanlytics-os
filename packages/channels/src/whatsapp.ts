/**
 * WhatsApp Cloud API adapter (Blueprint P2): normalizes webhook payloads into
 * canonical events and performs sends. No persistence, no decisions — the edge
 * wires this to the repositories. Config is passed in; env is never read here.
 */
import { OPT_IN_PATTERN, OPT_OUT_PATTERN } from "@chanlytics/contracts";

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
}

export interface WaChangeValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: WaRawMessage[];
  statuses?: Array<{ id?: string; status?: string; recipient_id?: string; errors?: unknown }>;
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
  waId: string;               // sender id verbatim (identity external_id)
  phoneDigits: string;        // dialable digits (m.from)
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
    const coords =
      loc?.latitude != null && loc?.longitude != null ? `${loc.latitude}, ${loc.longitude}` : null;
    return `Shared a location${where ? `: ${where}` : ""}${coords ? ` (${coords})` : ""}`;
  };
  const describeCards = (): string => {
    const names = (cards ?? [])
      .map((c) => c.name?.formatted_name || c.phones?.[0]?.phone)
      .filter(Boolean);
    return `Shared a contact card${names.length ? `: ${names.join(", ")}` : ""}`;
  };

  const body = typed
    ? m.text!.body!
    : chosen
      ? chosen.label || chosen.id
      : kind === "reaction"
        ? m.reaction?.emoji ?? null
        : kind === "location"
          ? describeLocation()
          : kind === "contacts"
            ? describeCards()
            : kind === "system"
              ? m.system?.body ?? null
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
    media: mediaSrc?.id
      ? (() => {
          const loose = mediaSrc as { mime_type?: string; caption?: string; filename?: string };
          return {
            provider_media_id: mediaSrc.id!,
            mime_type: loose.mime_type ?? null,
            caption: loose.caption ?? null,
            filename: loose.filename ?? null,
            fetch_state: "pending" as const,
          };
        })()
      : null,
    optOut: isText && matches(OPT_OUT_PATTERN),
    optIn: isText && matches(OPT_IN_PATTERN),
  };
}

/* -------------------------------- sends -------------------------------- */

export interface SendResult {
  ok: boolean;
  wamid: string | null;
  status: number;
  errorBody?: string;
}

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
 * status 0 means "never reached Meta", which is distinct from any HTTP status.
 */
const SEND_TIMEOUT_MS = 15_000;

async function postGraph(cfg: WaConfig, payload: unknown): Promise<SendResult> {
  try {
    const r = await fetch(`${GRAPH}/${cfg.phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const out = (await r.json().catch(() => ({}))) as { messages?: Array<{ id?: string }> };
    return {
      ok: r.ok,
      wamid: out.messages?.[0]?.id ?? null,
      status: r.status,
      errorBody: r.ok ? undefined : JSON.stringify(out).slice(0, 200),
    };
  } catch (e) {
    return { ok: false, wamid: null, status: 0, errorBody: e instanceof Error ? e.message : String(e) };
  }
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
    const metaRes = await fetch(`${GRAPH}/${providerMediaId}`, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      signal: AbortSignal.timeout(MEDIA_META_TIMEOUT_MS),
    });
    if (!metaRes.ok) return null;
    const meta = (await metaRes.json().catch(() => ({}))) as { url?: string; mime_type?: string };
    if (!meta.url) return null;

    const binRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      signal: AbortSignal.timeout(MEDIA_BYTES_TIMEOUT_MS),
    });
    if (!binRes.ok) return null;

    const declared = Number(binRes.headers.get("content-length") ?? "0");
    if (declared > MEDIA_MAX_BYTES) {
      console.error("media_too_large", providerMediaId, declared);
      return null;
    }
    const bytes = await binRes.arrayBuffer();
    if (bytes.byteLength > MEDIA_MAX_BYTES) {
      console.error("media_too_large_after_read", providerMediaId, bytes.byteLength);
      return null;
    }
    return { bytes, mime: meta.mime_type ?? binRes.headers.get("content-type") };
  } catch (e) {
    // A timeout or network fault must return, not throw: the caller stores a
    // 'failed' fetch_state and the conversation still reaches a human.
    console.error("media_fetch_failed", providerMediaId, e instanceof Error ? `${e.name}: ${e.message}` : e);
    return null;
  }
}
