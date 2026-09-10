import { waitedLabel } from "./time";
import { standingOf } from "./standing";
/**
 * ThreadCard/ConversationVM viewmodels (Blueprint §7): pure mapping from API
 * DTOs into the exact shapes the mockup surfaces render. Fed fields only —
 * nothing invented: summaries are factual lines, never fabricated analysis.
 */

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
    /** 'unknown' | 'opted_in' | 'opted_out'. Absent on payloads written before
     *  opt-out was enforced, which is why every reader treats it as optional
     *  and only 'opted_out'/dnc blocks — never the absence of a value. */
    consent?: string | null;
    dnc?: boolean | null;
  };
  messages: MessageDto[];
}

/** The customer asked not to be contacted. Delegates to the one predicate in
 *  ./consent so the view model and every send path cannot disagree. */
export function isOptedOut(dto: Pick<ConversationDto, "contact">): boolean {
  return isOptedOutContact(dto.contact);
}

/* ---- the mockup's conversation shape ---- */

export interface ConversationMessageVM {
  from: "client" | "agent";
  /** Where it happened. A call note is not a WhatsApp bubble, and the
   *  viewer must not draw it as one. */
  channel: "whatsapp" | "phone";
  at: string;
  text: string;
  /** The attachment, when the message is one. */
  media?: MediaVM;
  /** Why the receptionist said it, when the row remembers. */
  why?: ReplyWhyVM;
  /** "Canceled before sending", "Sending…" — absent when there is nothing to
   *  say, which for an ordinary sent message is the honest answer. */
  statusLabel?: string;
  /** False when these words never reached the customer. The bubble must not
   *  read as part of the conversation, because it was not. */
  reachedCustomer?: boolean;
}

/**
 * What happened to a message we tried to send, in the operator's words.
 *
 * ONE vocabulary. The Inbox had its own ternary and the Conversations pane had
 * nothing at all, so the same message read as "Canceled before sending" on one
 * screen and as an ordinary delivered reply on the other — and Conversations is
 * the screen whose entire job is "what is my receptionist saying to people".
 */
export function messageStatusLabel(status: string | undefined): string | undefined {
  switch (status) {
    case "queued": return "Sending…";
    case "failed": return "Didn't send";
    case "canceled": return "Canceled before sending";
    case "read": return "Read";
    case "delivered": return "Delivered";
    default: return undefined;
  }
}

/** Did the customer actually receive these words? */
export function reachedCustomer(status: string | undefined): boolean {
  return status !== "queued" && status !== "failed" && status !== "canceled";
}

export interface ConversationVM {
  id: string;
  who: string;
  /** First name, or the whole thing when it is a number. */
  whoShort: string;
  initials: string;
  clientId: string | null;
  channel: "whatsapp";
  agent: { glyph: string; name: string };
  at: string;
  outcome: "escalated" | "handled" | "open";
  snippet: string;
  summary: { headline: string; bullets: string[] };
  messages: ConversationMessageVM[];
  /** Epoch ms of the previewed message — the SORT key. Rows were being
   *  ordered by localeCompare on display strings ("Aug 26" vs "3:22 AM"),
   *  which is not an ordering at all. */
  ts: number;
  live?: boolean;
  /** False when the customer has only ever phoned. Their calls already have
   *  their own rows, so a chat row with nothing to preview is pure duplication. */
  hasChat: boolean;
}

import { whisperText } from "./whisper";
import { replyWhy, type ReplyWhyVM } from "./brain";
import { formatPhoneDisplay } from "./phone";
import { isOptedOutContact } from "./consent";
import { replyWindow, isLiveCall } from "./policy";
import { callOutcomeWords, tidyCallSummary } from "./call-words";

const AGENT = { glyph: "W", name: "WhatsApp Receptionist" };
const CALL_NOTE_PREFIX = /^\[voice call note [^\]]*\]\s*(Caller phoned the (?:salon|business) line\.\s*)?(Summary:\s*)?/; // trade-word: the older notes said "salon"; the newer say "business"

/**
 * Hoisted formatters. `toLocaleTimeString`/`toLocaleDateString` construct a
 * fresh Intl.DateTimeFormat on EVERY call — measured at ~355ms per 4000
 * messages, 16× slower than reusing one. These mappers run twice per refresh
 * over every message in every conversation, on the main thread, so that cost
 * showed up as a visible freeze whenever a message arrived.
 */
const TIME_FMT = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });
const DATE_FMT = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });

/** `now.toDateString()` is itself not free, and it is constant for a whole
 *  mapping pass — memoise it per Date instance. */
let sameDayKey: Date | null = null;
let sameDayValue = "";
function dayKey(now: Date): string {
  if (sameDayKey !== now) {
    sameDayKey = now;
    sameDayValue = now.toDateString();
  }
  return sameDayValue;
}

export function shortTime(iso: string | null, now: Date): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toDateString() === dayKey(now) ? TIME_FMT.format(d) : DATE_FMT.format(d);
}

/** Transcript bubbles keep day context across multi-day threads. */
function bubbleTime(iso: string, now: Date): string {
  const d = new Date(iso);
  const time = TIME_FMT.format(d);
  if (d.toDateString() === dayKey(now)) return time;
  return `${DATE_FMT.format(d)} · ${time}`;
}

/** The display name for a contact, without building a whole thread viewmodel
 *  to read one field (Today was doing exactly that per open escalation). */
export function contactName(dto: ConversationDto): string {
  return (
    dto.contact.display_name ||
    dto.contact.wa_profile_name ||
    formatPhoneDisplay(dto.contact.phone_e164) ||
    "Unknown"
  );
}

/** The "WhatsApp · +1 …" subtitle line, same source as the thread viewmodel; "Phone · …" for a caller with no thread. */
export function contactMeta(dto: ConversationDto, channel: "WhatsApp" | "Phone" = "WhatsApp"): string {
  const phone = formatPhoneDisplay(dto.contact.phone_e164);
  return contactName(dto) === phone ? `${channel} · no name saved` : `${channel} · ${phone ?? "no phone"}`;
}

export function initialsOf(name: string): string {
  const digits = name.replace(/[^\d]/g, "");
  // phone-like display: last two digits distinguish contacts (never a "+1" avatar)
  if (digits.length >= 7 && /^[+\d\s()-]+$/.test(name)) return digits.slice(-2);
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  const p = parts[0] || "?";
  return p.slice(0, 2).toUpperCase();
}

/**
 * A reply the receptionist has WRITTEN but not sent — it is sitting out its veto
 * window, and until that expires a human can withdraw or replace it.
 *
 * The distinction matters most in the UI: rendered as an ordinary agent bubble a
 * held draft looks exactly like a message the customer has already read, so an
 * operator would either ignore it or apologise for something that never went out.
 */
export function isHeldDraft(m: MessageDto): boolean {
  return m.status === "queued" && m.sender === "ai";
}

/** When a held draft is due to send, in epoch ms. */
export function draftSendsAtMs(m: MessageDto): number {
  const delay = typeof m.meta?.delay_ms === "number" ? m.meta.delay_ms : 0;
  return new Date(m.created_at).getTime() + delay;
}

/** An attachment as the thread draws it. */
export interface MediaVM {
  messageId: string;
  kind: "image" | "audio" | "video" | "document" | "other";
  mime: string | null;
  filename: string | null;
  caption: string | null;
  /** Stored and servable; false while it is fetching or after a failed fetch. */
  available: boolean;
}

const MEDIA_LABEL: Record<MediaVM["kind"], string> = {
  image: "Photo", audio: "Voice note", video: "Video", document: "Document", other: "Attachment",
};

/** What kind of thing an attachment is: from its mime, else from WhatsApp's own word for it. */
export function mediaKind(mime: string | null | undefined, raw?: string | null): MediaVM["kind"] {
  const t = (mime ?? "").toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("application/") || t.startsWith("text/")) return "document";
  switch (raw) {
    case "image": case "sticker": return "image";
    case "audio": return "audio";
    case "video": return "video";
    case "document": return "document";
    default: return "other";
  }
}

/** The attachment on a message, as the thread draws it; null for words. */
export function mediaVM(m: MessageDto): MediaVM | null {
  if (m.type !== "media" || !m.media) return null;
  const mime = m.media.mime_type ?? null;
  return {
    messageId: m.id,
    kind: mediaKind(mime, (m.meta && (m.meta.raw_type as string)) || null),
    mime,
    filename: m.media.filename ?? null,
    caption: m.media.caption ?? null,
    available: m.media.fetch_state === "stored",
  };
}

export function messageText(m: MessageDto): string {
  if (m.type === "call_summary" && m.body) {
    // the body already names itself ("Inbound call · 3 min — …"); the legacy
    // Blob-era prefix is stripped for rows written before Slice 3
    return m.body.replace(CALL_NOTE_PREFIX, "").trim();
  }
  if (m.body) return m.body;
  if (m.type === "media") {
    // "Photo: the caption" over "[image attachment]": the thread draws the
    // attachment itself now, and this line is what sits above it.
    const label = MEDIA_LABEL[mediaKind(m.media?.mime_type, (m.meta && (m.meta.raw_type as string)) || null)];
    const caption = m.media?.caption?.trim();
    return caption ? `${label}: ${caption}` : label;
  }
  return `[${m.type}]`;
}

/* ---- Inbox ThreadVM (Blueprint §7): escalations + conversations mapped into
   the mockup's thread shape. Fed fields only — approvals/confidence/$ are
   v1.1 and never fabricated. ---- */

export interface EscalationDto {
  id: string;
  reason: string;
  details: string | null;
  state: "open" | "resolved";
  created_at: string;
}

// These labels headline a row on Today, where there is no thread open beside
// them to supply context — so each one says what happened AND what it means,
// in the operator's words rather than the system's.
export const ESCALATION_REASON_LABELS: Record<string, string> = {
  human_token: "Customer asked for a person",
  refusal: "Assistant declined to answer",
  brain_error: "The receptionist hit an error — a holding message went out",
  non_text: "Sent a voice note / photo",
  send_failed: "Reply failed to deliver",
  policy_block: "Held by your reply setting — nothing was sent",
  policy_ask: "Set to Ask me first — a person answers this one",
  person_hold: "You handle this person — the receptionist stays out",
  rate_cap: "Too many replies too fast — the receptionist paused itself",
  deadman: "Nobody picked this up — flagged after silence",
  manual: "Flagged manually",
  opt_out: "Asked to stop receiving messages",
  state_unavailable: "The receptionist could not read this thread — needs a human",
  stale: "Arrived hours late — too old to answer automatically",
  budget: "The day's model budget is used up — the receptionist paused itself",
  callback: "Needs a call back — the phone receptionist could not finish it",
  paused: "Held — the workspace is paused until billing resumes",
  carriers: "Held — the carriers have not approved this line for texting yet",
};

/**
 * What the operator is walking into, per reason.
 *
 * This used to be ONE sentence for every escalation: "The customer already got a
 * holding reply — they're expecting a real answer." That is false for five of
 * the eleven reasons. The receptionist deliberately sends NOTHING on opt_out,
 * rate_cap, state_unavailable, and on non_text/policy_block when the workspace
 * has no persona configured — so on exactly the threads where something broke
 * and the customer is sitting in silence, the operator was told the opposite.
 *
 * Split into "a holding message went out" and "nothing was sent", because the
 * first sentence an operator reads decides whether they open with an apology or
 * an answer.
 */
const ESCALATION_SUMMARIES: Record<string, string> = {
  human_token: "They asked for a person. A holding message went out — they're waiting on you.",
  refusal: "The receptionist wouldn't answer this one. A holding message went out.",
  brain_error: "The receptionist errored and sent a holding message. They're waiting on a real answer.",
  non_text: "They sent a voice note or photo the receptionist can't read. Open it and reply yourself.",
  send_failed: "The reply never reached them — as far as the customer knows, nobody answered.",
  policy_block: "Your reply setting holds every message for a person. Nothing was sent — answer them yourself.",
  policy_ask: "Your Autonomy setting hands bookings or service questions to a person. The receptionist told them someone will follow up — that someone is you.",
  person_hold: "You set the receptionist to stay out of this person's thread. Nothing was sent — answer them yourself.",
  rate_cap: "The receptionist hit its daily reply limit and stopped. NOTHING was sent — they're waiting in silence.",
  deadman: "This sat unanswered long enough to flag. Nobody has replied.",
  manual: "Flagged by hand for a human.",
  opt_out: "They asked to stop receiving messages. Nothing was sent, and nothing may be.",
  state_unavailable: "The receptionist couldn't read this thread, so it stayed quiet. No reply went out.",
  stale: "This reached us hours after they sent it, too late to answer automatically. NOTHING was sent — they have been waiting since.",
  callback: "They phoned, and the receptionist could not finish it. Call them back — the details say what they wanted.",
  paused: "The workspace is paused because billing stopped, so the receptionist did not answer. Resume from Settings › Billing, or answer this one yourself.",
  carriers: "This text arrived before the carriers approved your line for texting, so the receptionist did not answer. Answer it yourself, or wait for the approval on Setup.",
};

/** "8m" / "3h" / "2d". An overnight wait is the NORMAL case for a morning
 *  brief, and "561 min" is not a number anyone reads as half a day. */
/** A wait, in the one family every surface reads (time.ts): "1m" at the least, "3h", "2d". */
export function formatWaited(ms: number): string {
  return waitedLabel(ms);
}

export interface InboxThreadVM {
  id: string;
  real: true;
  conversationId: string;
  /** The contact behind the thread — where "Open client" goes now that People is real. */
  clientId: string | null;
  escalationId: string | null;
  windowOpen: boolean;
  /** The customer asked to stop receiving messages. Stronger than a closed
   *  24h window: an approved template can't reach them either. */
  optedOut: boolean;
  who: string;
  whoMeta: string;
  avatar: string;
  state: "escalated" | "snoozed" | "done";
  takenOver: boolean;
  /**
   * This thread is waiting on a human, and no human has it yet.
   *
   * THE definition of "needs you", emitted once. It was previously re-derived
   * in the Inbox JSX and separately approximated by /metrics' escalations_open,
   * which Today then dispatched over the top of the Inbox's number to "correct"
   * it — two rules that disagree whenever an escalation is open on a thread
   * someone has already claimed, racing to write the same badge.
   */
  needsYou: boolean;
  /**
   * The receptionist's reply, written and waiting out its veto window.
   *
   * Lifted to the thread so the pane can offer the controls without scanning
   * the timeline for them — and so "is there still something I can stop?" is a
   * single truthy check rather than a search that could miss.
   */
  heldDraft: { messageId: string; body: string; sendsAtMs: number } | null;
  /**
   * The SAME shape the mockup's VetoBar and Composer already read.
   *
   * The design for this existed before the backend did — a countdown, Edit /
   * Hold / Take over, and a composer pre-filled with the draft. Mapping the
   * real held reply onto it means the feature arrives as the product was
   * drawn, rather than as a second control that looks nothing like it.
   *
   * `endsAtMs` is the SERVER's deadline. The mockup runs its own countdown in
   * VW_STORE and fabricates the send at zero; on a real thread the job fires
   * server-side and the UI only reports what is already true.
   */
  veto?: { window: number; draft: string; endsAtMs: number; messageId: string; why?: ReplyWhyVM };
  /** The channels the thread has actually used: "whatsapp", "phone", or both. */
  channels: string[];
  primaryChannel: "whatsapp" | "phone";
  /** A WhatsApp thread exists. False for a caller who has only ever phoned: no reply window, phone verbs. */
  hasChat: boolean;
  /** The number to call back, E.164, when known. */
  phone: string | null;
  /** How long the request has waited, in the one family every surface reads ("57m", "2h"). */
  waited?: string;
  agent: { name: string; glyph: string; autonomy: string; tone: string };
  subject: string;
  preview: string;
  summary: string;
  contextStrip: Array<{ label: string; value: string; warn?: boolean }>;
  lastAt: string;
  lastAtFull: string;
  /** Absolute times, epoch ms, for anything that must not drift with the
   *  clock — the bell keys its read state on them. */
  lastAtMs: number;
  escalatedAtMs?: number;
  unread: boolean;
  pinned: false;
  value?: number;      // omitted: no revenue model on real threads (v1.1)
  tags: string[];
  confidence?: number; // omitted: the mockup renders a verdict word from this
  priority: "P2";
  waitingMin?: number;
  wake?: string;
  timeline: Array<
    | {
        type: "msg";
        from: "client" | "agent";
        channel: string;
        at: string;
        body: string;
        /** The attachment, when the message is one. */
        media?: MediaVM;
        /** Why the receptionist said it, when the row remembers. */
        why?: ReplyWhyVM;
        byYou?: boolean;
        /** Sent by a broadcast, not typed: the name the owner gave it. */
        via?: { kind: "broadcast" | "playbook"; name: string };
        status?: string;
        messageId?: string;
        /** Written but NOT sent — sitting out its veto window. */
        pending?: true;
        /** When it fires, epoch ms. Drives the countdown. */
        sendsAtMs?: number;
        /** Per-bubble attribution — a phone summary is not the WhatsApp agent. */
        agentName?: string;
        agentGlyph?: string;
      }
    | { type: "event"; kind: string; at: string; body: string }
  >;
}

/**
 * Where a thread sits and who owes it work — the single implementation.
 *
 * Exported so the sidebar badge and Today's brief can agree without either one
 * re-deriving it. /metrics' `escalations_open` is NOT this number: it counts
 * open escalations, including ones a teammate has already claimed, so it reads
 * high exactly when someone is doing the work.
 */
export function threadStanding(
  dto: ConversationDto,
  escalation: EscalationDto | null,
  now = new Date(),
): { state: InboxThreadVM["state"]; takenOver: boolean; needsYou: boolean } {
  // One rule for the Inbox, People and Today (standing.ts). Snoozed wins over
  // escalated, and that ordering is the whole point.
  //
  // Snoozing used to RESOLVE the open escalation, because otherwise the thread
  // would have stayed in "Needs you" and the snooze would have done nothing.
  // The cost was the customer's request: at wake the thread reappeared as
  // "Handled" under the banner "Answered by the receptionist — no one asked
  // for you", while the person who had asked for a human was still waiting.
  // Snooze now leaves the escalation open and hides the thread by STATE, so
  // "come back to this later" means the request comes back too.
  const v = standingOf({
    state: dto.state,
    paused_until: dto.paused_until,
    assignee_user_id: dto.assignee_user_id,
    assignee_is_me: dto.assignee_is_me,
    open_escalation: !!escalation,
  }, now.getTime());
  const state: InboxThreadVM["state"] = v.standing === "snoozed" ? "snoozed" : v.flagged ? "escalated" : "done";
  return { state, takenOver: v.takenOver, needsYou: v.standing === "needs_you" };
}

export function toInboxThreadVM(
  dto: ConversationDto,
  escalation: EscalationDto | null,
  now = new Date(),
): InboxThreadVM {
  const who = contactName(dto);
  const paused = !!dto.paused_until && new Date(dto.paused_until) > now;
  const needsHuman = dto.state === "needs_human" || paused;
  // takenOver = a human claimed it (assignee set by take-over/reply) — the pane
  // then shows the owned-thread strip + hand-back instead of the take banner.
  const { state, takenOver, needsYou } = threadStanding(dto, escalation, now);
  // The LAST held draft, not the first: if two ever coexist the newer one is
  // what the customer would receive, so it is the one to offer controls for.
  // Cancelling withdraws every queued AI row on the thread anyway.
  let draftMsg: MessageDto | null = null;
  for (let i = dto.messages.length - 1; i >= 0; i--) {
    if (isHeldDraft(dto.messages[i])) { draftMsg = dto.messages[i]; break; }
  }
  const heldDraft = draftMsg
    ? { messageId: draftMsg.id, body: messageText(draftMsg), sendsAtMs: draftSendsAtMs(draftMsg) }
    : null;
  const claimedByOther = !!dto.assignee_user_id && dto.assignee_is_me === false;
  const reasonLabel = escalation ? (ESCALATION_REASON_LABELS[escalation.reason] ?? escalation.reason) : null;
  const last = [...dto.messages].reverse().find((m) => m.direction === "inbound" || reachedCustomer(m.status));
  const lastInbound = [...dto.messages].reverse().find((m) => m.sender === "customer");
  // replyWindow(), the rule the reply route enforces, not a copy of it. This
  // decides whether the composer tells the operator they can write freely; with
  // two expressions those answers drift the moment either moves, and the
  // operator is told they can send something the server refuses. A text has no
  // window, so where the customer last wrote by SMS the composer is open.
  const win = replyWindow(lastInbound?.channel, dto.last_wa_inbound_at, now).open;
  // The channels the thread has actually used: a call note is the phone, any
  // other row is WhatsApp. A caller with no thread on WhatsApp gets phone
  // verbs, not a notice about a reply window that never opened.
  const hasCalls = dto.messages.some((m) => m.type === "call_summary");
  const hasChat = !!dto.last_wa_inbound_at || dto.messages.some((m) => m.type !== "call_summary");
  const primaryChannel: InboxThreadVM["primaryChannel"] = hasChat || !hasCalls ? "whatsapp" : "phone";
  const channels = [...(hasChat || !hasCalls ? ["whatsapp"] : []), ...(hasCalls ? ["phone"] : [])];

  const timeline: InboxThreadVM["timeline"] = dto.messages.map((m) => {
    const onPhone = m.type === "call_summary";
    const media = mediaVM(m);
    const why = m.sender === "ai" ? replyWhy(m.meta) : null;
    return {
      type: "msg" as const,
      from: m.sender === "customer" ? ("client" as const) : ("agent" as const),
      channel: onPhone ? "phone" : "whatsapp",
      at: bubbleTime(messageAt(m), now),
      body: messageText(m),
      ...(media ? { media } : {}),
      ...(why ? { why } : {}),
      // Who said it, per BUBBLE. The thread carries one agent identity, and the
      // pane rendered that under every agent row — so a phone call summary was
      // signed "by WhatsApp Receptionist", crediting the wrong assistant with
      // work it did not do. The bubble already knows its own channel.
      ...(m.sender !== "customer"
        ? { agentName: onPhone ? "Phone Receptionist" : AGENT.name, agentGlyph: onPhone ? "P" : AGENT.glyph }
        : {}),
      ...(m.sender === "human" ? { byYou: true } : {}),
      ...(m.meta?.source === "broadcast"
        ? { via: m.meta.playbook_name
            ? { kind: "playbook" as const, name: String(m.meta.playbook_name) }
            : { kind: "broadcast" as const, name: String(m.meta.broadcast_name ?? "broadcast") } }
        : {}),
      ...(m.sender !== "customer" && m.status
        ? {
            status: m.status,
            messageId: m.id,
            // The words themselves live in messageStatusLabel, so this pane and
            // the Conversations pane cannot describe the same message
            // differently — which is exactly what they were doing.
            ...(messageStatusLabel(m.status) ? { statusLabel: messageStatusLabel(m.status) } : {}),
          }
        : {}),
      // A held draft is not a sent message and must not read as one.
      ...(isHeldDraft(m) ? { pending: true as const, sendsAtMs: draftSendsAtMs(m) } : {}),
    };
  });
  if (escalation) {
    // insert chronologically — appending would read "reply, then flagged"
    const idx = dto.messages.findIndex((m) => m.created_at > escalation.created_at);
    const entry = {
      type: "event" as const,
      kind: "flag",
      at: shortTime(escalation.created_at, now),
      body: `Flagged for a human — ${reasonLabel}${escalation.details ? ` · “${escalation.details.slice(0, 120)}”` : ""}`,
    };
    if (idx === -1) timeline.push(entry);
    else timeline.splice(idx, 0, entry);
  }

  const waitingMin = escalation
    ? Math.max(1, Math.round((now.getTime() - new Date(escalation.created_at).getTime()) / 60000))
    : undefined;

  return {
    id: `th-${dto.id}`,
    real: true,
    conversationId: dto.id,
    clientId: dto.contact.id || null,
    escalationId: escalation?.id ?? null,
    windowOpen: win,
    optedOut: isOptedOut(dto),
    who,
    whoMeta: contactMeta(dto, primaryChannel === "phone" ? "Phone" : "WhatsApp"),
    avatar: initialsOf(who),
    state,
    takenOver,
    needsYou,
    heldDraft,
    ...(heldDraft
      ? {
          veto: {
            window: Math.max(1, Math.round((heldDraft.sendsAtMs - new Date(draftMsg!.created_at).getTime()) / 1000)),
            draft: heldDraft.body,
            endsAtMs: heldDraft.sendsAtMs,
            messageId: heldDraft.messageId,
            ...(replyWhy(draftMsg!.meta) ? { why: replyWhy(draftMsg!.meta) as ReplyWhyVM } : {}),
          },
        }
      : {}),
    channels,
    primaryChannel,
    hasChat,
    phone: dto.contact.phone_e164 ?? null,
    ...(waitingMin ? { waited: formatWaited(waitingMin * 60000) } : {}),
    agent: { name: "WhatsApp Receptionist", glyph: "W", autonomy: "Pauses on handoff", tone: "Warm · bilingual (EN/ES)" },
    subject:
      (claimedByOther ? "A teammate is answering this" : null) ??
      reasonLabel ??
      (takenOver
        ? "You're answering this one"
        : lastInbound
          ? messageText(lastInbound).slice(0, 80)
          : last
            // A contact who has only ever PHONED has no customer messages, but
            // "No messages yet" reads as "nothing has happened" — their call
            // note is the honest subject.
            ? messageText(last).slice(0, 80)
            : "No messages yet"),
    preview: last ? messageText(last).slice(0, 110) : "",
    summary: escalation
      ? ESCALATION_SUMMARIES[escalation.reason] ?? `${reasonLabel}. Needs a human.`
      : takenOver
        ? "You're answering this one. The receptionist stays quiet until you hand it back."
        : "The receptionist answered this on its own. Nothing is owed.",
    contextStrip: [
      ...(reasonLabel ? [{ label: "Why you", value: reasonLabel }] : []),
      { label: "Waiting", value: waitingMin ? formatWaited(waitingMin * 60000) : "—", ...(waitingMin && waitingMin > 30 ? { warn: true } : {}) },
      { label: "Receptionist", value: needsHuman ? (escalation?.reason === "callback" ? "Paused — call them back" : "Paused — you have it") : "Answering" },
      hasChat
        ? { label: "Reply window", value: win ? "Open — you can write freely" : "Closed — template only" }
        : { label: "WhatsApp", value: "No thread yet — they have only phoned" },
    ],
    lastAt: shortTime(dto.last_message_at, now),
    lastAtFull: shortTime(dto.last_message_at, now),
    lastAtMs: dto.last_message_at ? new Date(dto.last_message_at).getTime() : 0,
    ...(escalation ? { escalatedAtMs: new Date(escalation.created_at).getTime() } : {}),
    unread: state === "escalated" && !takenOver,
    pinned: false,
    tags: [],
    priority: "P2",
    ...(waitingMin !== undefined ? { waitingMin } : {}),
    ...(state === "snoozed" && dto.snooze_until ? { wake: shortTime(dto.snooze_until, now) } : {}),
    timeline,
  };
}

export function toConversationVM(dto: ConversationDto, now = new Date()): ConversationVM {
  const who = contactName(dto);
  // A phone-like name is not split: "+1" is nobody's first name. The
  // viewer read "Latest from +1" for a person known only by number.
  const whoShort = /^[+\d(]/.test(who) ? who : who.split(" ")[0] || who;
  // The status travels with the bubble. It used to be dropped here, and the
  // conversations API filters nothing — so a queued draft still inside its veto
  // window, a send that failed, and a reply an operator canceled all arrived on
  // this surface indistinguishable from words the customer actually read. On a
  // live account that showed one message twice, identically, when one of the
  // two had been canceled before it ever left.
  const msgs = dto.messages.map((m): ConversationMessageVM => ({
    from: m.sender === "customer" ? "client" : "agent",
    channel: m.type === "call_summary" ? "phone" : "whatsapp",
    at: bubbleTime(messageAt(m), now),
    text: messageText(m),
    ...(mediaVM(m) ? { media: mediaVM(m) as MediaVM } : {}),
    ...(m.sender === "ai" && replyWhy(m.meta) ? { why: replyWhy(m.meta) as ReplyWhyVM } : {}),
    // Only for OUR messages. A customer's inbound message has no send status,
    // and labelling it would be inventing one.
    ...(m.sender !== "customer"
      ? {
          ...(messageStatusLabel(m.status) ? { statusLabel: messageStatusLabel(m.status) } : {}),
          reachedCustomer: reachedCustomer(m.status),
        }
      : {}),
  }));
  const lastInbound = [...dto.messages].reverse().find((m) => m.sender === "customer");
  // A call has its OWN row on this surface, so the chat row must summarise the
  // MESSAGING thread only. Including call notes made one call appear twice —
  // once as its own row, once as the preview of the thread sitting above it —
  // and, because a call note is direction:"inbound", it also flipped the pill
  // to "open" ("they spoke last, you owe a reply") for a customer who had
  // merely phoned and been handled.
  const chat = dto.messages.filter((m) => m.type !== "call_summary");
  const callNotes = dto.messages.length - chat.length;
  // The last thing that actually happened between them: a queued or cancelled
  // draft is not the thread's last word, and previewing it read "handled".
  const last = [...chat].reverse().find((m) => m.direction === "inbound" || reachedCustomer(m.status));
  const paused = !!dto.paused_until && new Date(dto.paused_until) > now;
  const needsHuman = dto.state === "needs_human" || paused;
  // Honest pills: escalated when a human has it; open while the last word is
  // the customer's; handled only when the thread is actually answered/closed.
  const outcome: ConversationVM["outcome"] = needsHuman
    ? "escalated"
    : last?.direction === "inbound" || dto.state === "snoozed"
      ? "open"
      : "handled";
  return {
    id: dto.id,
    who,
    whoShort,
    initials: initialsOf(who),
    clientId: dto.contact.id || null,
    channel: "whatsapp",
    agent: AGENT,
    // The row's time and its preview must come from the SAME message —
    // last_message_at ignored call notes, so a row read "3:22 AM" beside a
    // preview imported at 2:15 PM.
    at: shortTime(last ? messageAt(last) : dto.last_message_at, now),
    outcome,
    snippet: last ? messageText(last).slice(0, 110) : "",
    hasChat: chat.length > 0,
    ts: last ? new Date(messageAt(last)).getTime() : dto.last_message_at ? new Date(dto.last_message_at).getTime() : 0,
    summary: {
      headline: lastInbound ? messageText(lastInbound).slice(0, 110) : "No customer messages yet.",
      bullets: [
        `${chat.length} message${chat.length === 1 ? "" : "s"}${
          callNotes ? ` · ${callNotes} call${callNotes === 1 ? "" : "s"}` : ""
        }${dto.messages[0] ? ` · started ${shortTime(messageAt(dto.messages[0]), now)}` : ""}`,
        needsHuman ? "Receptionist paused — a human has this thread" : "Answered by the receptionist",
      ],
    },
    messages: msgs,
  };
}


/* ---- Calls (Slice 3): a call row answers "is my AI saying the right things
   on the phone", while the thread answers "am I on the hook to reply". A call
   row therefore carries NO decision affordance — only a link back to the
   thread, so exactly one queue owns "needs you". ---- */

export interface CallDto {
  id: string;
  retell_call_id: string;
  direction: "inbound" | "outbound";
  call_type: string | null;
  status: string;
  from_e164: string | null;
  from_raw: string | null;
  to_e164: string | null;
  started_at: string | null;
  ended_at: string | null;
  /** Moves on every provider event — the heartbeat isLiveCall() reads. */
  updated_at?: string | null;
  duration_ms: number | null;
  disconnection_reason: string | null;
  sentiment: string | null;
  call_successful: boolean | null;
  in_voicemail: boolean | null;
  summary: string | null;
  /** From the post-call analysis (calls.wanted …): what the caller wanted in
   *  plain words, how it ended, what to do next, the name they gave. Absent
   *  on calls analysed before the schema existed. */
  wanted?: string | null;
  outcome?: string | null;
  follow_up?: string | null;
  caller_name?: string | null;
  /** Turns. `start` (seconds) is the turn's first word; `words` is the raw
   *  provider shape and is stripped by the list route (F15). */
  transcript_object: Array<{ role?: string; content?: string; start?: number; words?: Array<{ start?: number }> }> | null;
  /** storage_path and provider_url are stripped server-side — audio is only
   *  reachable through the signed-URL route. */
  recording: { fetch_state?: string; mime?: string | null; bytes?: number } | null;
  conversation_id: string | null;
  contact_id: string | null;
  message_id: string | null;
  contact: { display_name: string | null; wa_profile_name: string | null; phone_e164: string | null } | null;
}

/** Why the call ended, in words a salon owner uses. */
export const DISCONNECTION_LABELS: Record<string, string> = {
  user_hangup: "Customer hung up",
  agent_hangup: "Receptionist ended the call",
  call_transfer: "Transferred to a person",
  voicemail_reached: "Reached voicemail",
  dial_no_answer: "No answer",
  dial_busy: "Line was busy",
  dial_failed: "Call couldn't connect",
  inactivity: "Ended after silence",
  max_duration_reached: "Hit the call length limit",
  concurrency_limit_reached: "Line was busy — all agents in use",
  user_declined: "Customer declined the call",
  marked_as_spam: "Flagged as spam by the carrier",
};

export interface CallVM {
  id: string;
  real: true;
  callId: string;
  who: string;
  whoShort: string;
  initials: string;
  clientId: string | null;
  channel: "phone";
  agent: { glyph: string; name: string };
  at: string;
  duration?: string;
  ts: number;
  /** live: in progress under the heartbeat rule · missed: the dial never
   *  connected (Retell's not_connected) · handled: everything else. */
  outcome: "live" | "handled" | "missed";
  live?: boolean;
  snippet: string;
  summary: { headline: string; bullets: string[] };
  transcript: Array<{ t: string; speaker: "agent" | "client" | "whisper"; text: string }>;
  recordingState: "ready" | "pending" | "failed" | "none";
  recordingUrl?: string;
  threadId?: string;
}

function mmss(ms: number | null | undefined): string | undefined {
  if (!ms || ms < 0) return undefined;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function spokenDuration(ms: number | null): string {
  if (!ms) return "Duration not recorded";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m ? `${m} min ${sec} sec` : `${sec} sec`;
}

export function toCallVM(dto: CallDto, now = new Date()): CallVM {
  const withheld = !dto.from_e164 && !dto.from_raw;
  const phone = formatPhoneDisplay(dto.from_e164);
  const name = dto.contact?.display_name || dto.contact?.wa_profile_name || null;
  const who = withheld ? "Caller ID withheld" : name || phone || dto.from_raw || "Unknown caller";
  const whoShort = name ? (/^[+\d(]/.test(name) ? name : name.split(" ")[0]) : "Caller";
  const dur = mmss(dto.duration_ms);
  // Not `status === "ongoing"`. A lost call_ended leaves that flag set forever,
  // and this viewmodel is what the Live surface would render from.
  const live = isLiveCall(dto, now);
  // Retell's not_connected: the dial never connected. An attempt, not a call.
  const missed = dto.status === "not_connected";
  // What the caller wanted, in the analysis's plain words, leads; the
  // provider's own summary is the fallback, its opening folded.
  const wanted = (dto.wanted || "").trim();
  const headSummary = tidyCallSummary(dto.summary) ?? "";
  const firstSentence = headSummary ? (headSummary.split(/(?<=[.!?])\s/)[0] ?? headSummary) : "";

  const bullets: string[] = [
    `${dto.direction === "inbound" ? "Inbound" : "Outbound"} · ${missed ? "never connected" : spokenDuration(dto.duration_ms)}`,
  ];
  if (dto.disconnection_reason) {
    bullets.push(`Ended: ${DISCONNECTION_LABELS[dto.disconnection_reason] ?? dto.disconnection_reason.replace(/_/g, " ")}`);
  }
  if (dto.sentiment) {
    bullets.push(`Caller sentiment: ${dto.sentiment} — the voice provider's own read`);
  }
  const outcomeWords = callOutcomeWords(dto.outcome);
  if (outcomeWords) bullets.push(outcomeWords);
  if (dto.follow_up?.trim()) bullets.push(`To do: ${dto.follow_up.trim()}`);
  if (dto.caller_name?.trim()) bullets.push(`Gave their name as ${dto.caller_name.trim()}`);
  const recState: CallVM["recordingState"] =
    dto.recording?.fetch_state === "stored" ? "ready" :
    dto.recording?.fetch_state === "failed" ? "failed" :
    dto.recording ? "pending" : "none";
  if (!missed) {
    bullets.push(
      recState === "ready" ? "Recording saved" :
      recState === "pending" ? "Recording still processing" :
      recState === "failed" ? "Recording couldn't be saved from the voice provider" :
      "No recording for this call",
    );
  }
  if (dto.message_id && !withheld) bullets.push(`Noted on ${whoShort}'s WhatsApp thread`);

  const transcript = (dto.transcript_object ?? []).map((turn) => {
    const start = turn.start ?? turn.words?.[0]?.start;
    // An injected turn is a whisper: the owner's own words, shown as theirs.
    if (turn.role === "injected") {
      return { t: "—", speaker: "whisper" as const, text: whisperText(turn.content) };
    }
    return {
      t: typeof start === "number" ? `${Math.floor(start / 60)}:${String(Math.floor(start % 60)).padStart(2, "0")}` : "—",
      speaker: (turn.role === "agent" ? "agent" : "client") as "agent" | "client",
      text: turn.content ?? "",
    };
  });

  const snippetBody = missed
    ? "The call never connected."
    : wanted || firstSentence || (dto.in_voicemail ? "Reached voicemail." : "No summary from this call.");
  return {
    id: `cv-${dto.id}`,
    real: true,
    callId: dto.id,
    who,
    whoShort,
    initials: withheld ? "–" : initialsOf(who),
    clientId: dto.contact_id,
    channel: "phone",
    agent: { glyph: "P", name: "Phone Receptionist" },
    at: shortTime(dto.started_at, now),
    ts: dto.started_at ? new Date(dto.started_at).getTime() : 0,
    ...(dur ? { duration: dur } : {}),
    outcome: live ? "live" : missed ? "missed" : "handled",
    ...(live ? { live: true } : {}),
    snippet: withheld
      ? `${dto.direction === "inbound" ? "Inbound" : "Outbound"} call${dur ? ` · ${dur}` : ""} — caller ID withheld, so this call isn't linked to a customer.`
      : `${dto.direction === "inbound" ? "Inbound" : "Outbound"} call${dur ? ` · ${dur}` : ""} — ${snippetBody}`,
    summary: { headline: wanted || firstSentence || snippetBody, bullets },
    transcript,
    recordingState: recState,
    ...(recState === "ready" ? { recordingUrl: `/api/v1/calls/${dto.id}/recording` } : {}),
    ...(dto.conversation_id ? { threadId: `th-${dto.conversation_id}` } : {}),
  };
}
