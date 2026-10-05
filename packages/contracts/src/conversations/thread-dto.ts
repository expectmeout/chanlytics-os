/**
 * A thread on the wire: the message and conversation DTOs the conversations route returns, when a message
 * happened, and whether its person asked not to be contacted. The view models over them are inbox-thread.ts,
 * conversation-vm.ts and, for a call's own row, call-vm.ts over call-dto.ts.
 */
import { isOptedOutContact } from "../consent/consent";

/* ---- wire DTOs (what /api/v1/conversations returns) ---- */

export interface MessageDto {
  id: string;
  direction: "inbound" | "outbound";
  sender: "customer" | "ai" | "human" | "system";
  /** The wire it travelled — whatsapp · sms · voice; absent from older readers. */
  channel?: string;
  type: string;
  body: string | null;
  /** The attachment facts a browser may see; the bytes are behind
   *  /api/v1/messages/:id/media. Absent for words. */
  media: { mime_type?: string | null; fetch_state?: string; filename?: string | null; caption?: string | null } | null;
  meta: Record<string, unknown> | null;
  status?: string;
  created_at: string;
  /**
   * When the event actually happened on its channel, as the provider reported
   * it — Meta's message timestamp, or the moment a call started.
   *
   * `created_at` is when WE wrote the row, which is the same thing for a live
   * WhatsApp message and emphatically not for a call: three calls placed at
   * 20:59, 21:01 and 23:39 were imported in one batch and rendered as three
   * rows one second apart, all reading "1:59 AM". The true time was already in
   * this column; nothing selected it.
   */
  channel_ts?: string | null;
}

/** When a message happened, preferring the channel's own clock over ours. */
export function messageAt(m: MessageDto): string {
  return m.channel_ts ?? m.created_at;
}

/** The keys of a message's meta that are the operator's, never a member's: what it cost to send (K8). */
const OPERATOR_META_KEYS = ["pricing"] as const;

/**
 * A message's meta as a member's browser, or Ask, may be sent it: every key but the operator's. The one door every
 * member-facing read of a message's meta passes through (the Inbox's and a person's messages, the thread route's, Ask's
 * thread reader). A meta that is not an object (a column the read left out) is null, which is what the DTO already
 * allows. Never changes the row it is given. The owner's own workspace export says meta as stored, and does not pass
 * here. The guarantee is the dashboard's and Ask's: a member's own session can still read the row through
 * messages_member_select, as it reads ai_usage.
 */
export function memberMetaOf(meta: unknown): Record<string, unknown> | null {
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) return null;
  const kept: Record<string, unknown> = { ...meta };
  for (const key of OPERATOR_META_KEYS) delete kept[key];
  return kept;
}

export interface ConversationDto {
  id: string;
  state: "open" | "needs_human" | "snoozed" | "archived";
  paused_until: string | null;
  snooze_until?: string | null;
  assignee_user_id?: string | null;
  assignee_is_me?: boolean;
  last_wa_inbound_at?: string | null;
  last_message_at: string | null;
  contact: {
    id: string;
    display_name: string | null;
    wa_profile_name: string | null;
    phone_e164: string | null;
    /** As stored (00125). Absent on payloads read without it. */
    email?: string | null;
    /** The owner's proposal link (00154). Absent on payloads read without it. */
    proposal_url?: string | null;
    /** 'unknown' | 'opted_in' | 'opted_out'. Absent on payloads written before
     *  opt-out was enforced, which is why every reader treats it as optional
     *  and only 'opted_out'/dnc blocks — never the absence of a value. */
    consent?: string | null;
    dnc?: boolean | null;
    /** Yes to OFFERS: a promotional template goes only to someone who said it (the reply route's rule). */
    marketing_consent?: string | null;
  };
  messages: MessageDto[];
}

/** The customer asked not to be contacted. Delegates to the one predicate in
 *  ./consent so the view model and every send path cannot disagree. */
export function isOptedOut(dto: Pick<ConversationDto, "contact">): boolean {
  return isOptedOutContact(dto.contact);
}
