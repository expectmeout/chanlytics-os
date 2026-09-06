import type { CallDto, ConversationDto, MessageDto } from "@chanlytics/contracts";

/**
 * Row → DTO mapping, in one place.
 *
 * Three routes read conversations, messages and calls — the Inbox list, the
 * Calls list, and a person's profile — and each used to carry its own copy of
 * the same field-by-field mapping. One copy means one shape: a column added
 * here reaches every reader, and a reader cannot drift into rendering a
 * field the others do not send.
 *
 * The select strings live beside the mappers so the two cannot disagree.
 */

export const CONVERSATION_COLUMNS =
  "id, state, paused_until, snooze_until, assignee_user_id, last_wa_inbound_at, last_message_at, contacts (id, display_name, wa_profile_name, phone_e164, consent, dnc)";

export const MESSAGE_COLUMNS =
  "id, conversation_id, direction, sender, type, body, media, meta, status, created_at, channel_ts";

export const CALL_COLUMNS =
  "id, retell_call_id, direction, call_type, status, from_e164, from_raw, to_e164, started_at, ended_at, duration_ms, disconnection_reason, sentiment, call_successful, in_voicemail, summary, wanted, outcome, follow_up, caller_name, transcript_object, recording, conversation_id, contact_id, message_id, updated_at, contacts (display_name, wa_profile_name, phone_e164)";

export interface ConversationRow {
  id: string;
  state: string;
  paused_until: string | null;
  snooze_until: string | null;
  assignee_user_id: string | null;
  last_wa_inbound_at: string | null;
  last_message_at: string | null;
  contacts: {
    id: string;
    display_name: string | null;
    wa_profile_name: string | null;
    phone_e164: string | null;
    consent: string | null;
    dnc: boolean | null;
  } | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  direction: string;
  sender: string;
  type: string;
  body: string | null;
  media: unknown;
  meta: unknown;
  status: string;
  created_at: string;
  channel_ts: string | null;
}

export interface CallRow {
  id: string;
  retell_call_id: string;
  direction: string;
  call_type: string | null;
  status: string;
  from_e164: string | null;
  from_raw: string | null;
  to_e164: string | null;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string | null;
  duration_ms: number | null;
  disconnection_reason: string | null;
  sentiment: string | null;
  call_successful: boolean | null;
  in_voicemail: boolean | null;
  summary: string | null;
  wanted?: string | null;
  outcome?: string | null;
  follow_up?: string | null;
  caller_name?: string | null;
  transcript_object: unknown;
  recording: unknown;
  conversation_id: string | null;
  contact_id: string | null;
  message_id: string | null;
  contacts: { display_name: string | null; wa_profile_name: string | null; phone_e164: string | null } | null;
}

/**
 * Group message rows by conversation, restoring ascending order.
 *
 * Rows arrive NEWEST-first on purpose: when a global cap bites it drops the
 * oldest history, never a thread's most recent messages. `unshift` puts each
 * conversation back in reading order.
 */
/**
 * The attachment facts a browser may see. The stored JSON also carries the
 * storage path, the provider's media id and a checksum — server business;
 * the bytes are reachable only through /api/v1/messages/:id/media.
 */
export function mediaPublic(raw: unknown): MessageDto["media"] {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const str = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : null);
  return {
    mime_type: str("mime_type"),
    ...(str("fetch_state") ? { fetch_state: str("fetch_state") as string } : {}),
    filename: str("filename"),
    caption: str("caption"),
  };
}

export function groupMessages(rows: MessageRow[]): Map<string, MessageDto[]> {
  const byConv = new Map<string, MessageDto[]>();
  for (const m of rows) {
    const list = byConv.get(m.conversation_id) ?? [];
    list.unshift({
      id: m.id,
      direction: m.direction as MessageDto["direction"],
      sender: m.sender as MessageDto["sender"],
      type: m.type,
      body: m.body,
      media: mediaPublic(m.media),
      meta: m.meta as MessageDto["meta"],
      status: m.status,
      created_at: m.created_at,
      channel_ts: m.channel_ts,
    });
    byConv.set(m.conversation_id, list);
  }
  // Reading order is CHANNEL time — when the message happened on WhatsApp, or
  // when the call started — never created_at, which for an imported row is
  // the import moment and for a call note the moment the analysis arrived.
  // On the live line the Aug 26 call note rendered below the Aug 27 messages.
  for (const list of byConv.values()) {
    list.sort((a, b) => Date.parse(a.channel_ts ?? a.created_at) - Date.parse(b.channel_ts ?? b.created_at));
  }
  return byConv;
}

export function toConversationDto(c: ConversationRow, messages: MessageDto[], userId: string): ConversationDto {
  return {
    id: c.id,
    state: c.state as ConversationDto["state"],
    paused_until: c.paused_until,
    snooze_until: c.snooze_until,
    assignee_user_id: c.assignee_user_id,
    assignee_is_me: c.assignee_user_id ? c.assignee_user_id === userId : undefined,
    last_wa_inbound_at: c.last_wa_inbound_at,
    last_message_at: c.last_message_at,
    contact: {
      id: c.contacts?.id ?? "",
      display_name: c.contacts?.display_name ?? null,
      wa_profile_name: c.contacts?.wa_profile_name ?? null,
      phone_e164: c.contacts?.phone_e164 ?? null,
      consent: c.contacts?.consent ?? null,
      dnc: c.contacts?.dnc ?? false,
    },
    messages,
  };
}

/**
 * A call's turns without their word timings.
 *
 * The list route returned up to a hundred calls with a per-word start/end
 * array on every turn on every refresh — most of the payload by weight, and
 * the reason the conversations snapshot tripped the 2 MB cache cap and every
 * surface booted cold (review F15). The viewers need one number per turn,
 * where it starts; that survives as `start`.
 */
export function stripWordTimings(raw: unknown): CallDto["transcript_object"] {
  if (!Array.isArray(raw)) return null;
  return raw.map((t) => {
    const turn = (t ?? {}) as { role?: string; content?: string; words?: Array<{ start?: number }>; start?: number };
    const start = typeof turn.start === "number" ? turn.start : turn.words?.[0]?.start;
    return { role: turn.role, content: turn.content, ...(typeof start === "number" ? { start } : {}) };
  });
}

export function toCallDto(c: CallRow): CallDto {
  const rec = c.recording as { fetch_state?: string; mime?: string | null; bytes?: number } | null;
  return {
    id: c.id,
    retell_call_id: c.retell_call_id,
    direction: c.direction as CallDto["direction"],
    call_type: c.call_type,
    status: c.status,
    from_e164: c.from_e164,
    from_raw: c.from_raw,
    to_e164: c.to_e164,
    started_at: c.started_at,
    ended_at: c.ended_at,
    updated_at: c.updated_at,
    duration_ms: c.duration_ms,
    disconnection_reason: c.disconnection_reason,
    sentiment: c.sentiment,
    call_successful: c.call_successful,
    in_voicemail: c.in_voicemail,
    summary: c.summary,
    wanted: c.wanted ?? null,
    outcome: c.outcome ?? null,
    follow_up: c.follow_up ?? null,
    caller_name: c.caller_name ?? null,
    transcript_object: stripWordTimings(c.transcript_object),
    // storage_path and provider_url never leave the server: audio is reachable
    // only through the signed-URL route.
    recording: rec ? { fetch_state: rec.fetch_state, mime: rec.mime ?? null, bytes: rec.bytes } : null,
    conversation_id: c.conversation_id,
    contact_id: c.contact_id,
    message_id: c.message_id,
    contact: c.contacts
      ? {
          display_name: c.contacts.display_name,
          wa_profile_name: c.contacts.wa_profile_name,
          phone_e164: c.contacts.phone_e164,
        }
      : null,
  };
}
