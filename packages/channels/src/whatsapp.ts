/**
 * WhatsApp Cloud API adapter (Blueprint P2): normalizes webhook payloads into
 * canonical events and performs sends. No persistence, no decisions — the edge
 * wires this to the repositories. Config is passed in; env is never read here.
 */
import { OPT_OUT_PATTERN } from "@chanlytics/contracts";

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
  rawType: string;
  body: string | null;
  channelTsIso: string | null;
  media: WaMediaRef | null;
  optOut: boolean;
}

export function normalizeInbound(m: WaRawMessage, value: WaChangeValue): NormalizedInbound {
  // Never guess identity: contacts[0] can belong to a DIFFERENT sender in a
  // batched webhook, and contact_identities.external_id is a permanent mapping.
  const list = value.contacts || [];
  const contact = list.find((c) => c.wa_id === m.from) ?? (list.length === 1 ? list[0] : undefined);
  const mediaSrc = m.image || m.audio || m.video || m.document || m.sticker || null;
  const isText = m.type === "text" && !!m.text?.body;
  const body = isText ? m.text!.body! : null;
  return {
    waId: contact?.wa_id || m.from,
    phoneDigits: m.from,
    profileName: contact?.profile?.name || null,
    messageId: m.id,
    type: isText ? "text" : "media",
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
    optOut: isText ? OPT_OUT_PATTERN.test(body || "") : false,
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
 */
export async function fetchMediaBytes(
  cfg: WaConfig,
  providerMediaId: string,
): Promise<{ bytes: ArrayBuffer; mime: string | null } | null> {
  const metaRes = await fetch(`${GRAPH}/${providerMediaId}`, {
    headers: { Authorization: `Bearer ${cfg.accessToken}` },
  });
  if (!metaRes.ok) return null;
  const meta = (await metaRes.json().catch(() => ({}))) as { url?: string; mime_type?: string };
  if (!meta.url) return null;
  const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${cfg.accessToken}` } });
  if (!binRes.ok) return null;
  return { bytes: await binRes.arrayBuffer(), mime: meta.mime_type ?? binRes.headers.get("content-type") };
}
