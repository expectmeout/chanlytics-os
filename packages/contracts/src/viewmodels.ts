import { waitedLabel } from "./time";
import { clockShort, clockStamp } from "./clock";
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
    /** As stored (00125). Absent on payloads read without it. */
    email?: string | null;
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

/* ---- the mockup's conversation shape ---- */

export interface ConversationMessageVM {
  from: "client" | "agent";
  /** Where it happened. A call note is not a WhatsApp bubble, and the
   *  viewer must not draw it as one -- and neither is a text or an email. */
  channel: "whatsapp" | "sms" | "email" | "phone";
  at: string;
  text: string;
  /** The attachment, when the message is one. */
  media?: MediaVM;
  /** Why the receptionist said it, when the row remembers. */
  why?: ReplyWhyVM;
  /** Who sent it, for our messages: "the receptionist", "your team", "a broadcast (Spring offer)",
   *  "the Win-back playbook" (messageAuthor). Absent for the customer's words and a call note. */
  by?: string;
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
  /** The Inbox thread this chat is: `th-` and the conversation's id, the id the Inbox routes by. */
  threadId: string;
  /** Who sent the last message that reached them, when it was ours; null when they wrote last. */
  answeredBy: MessageAuthor["kind"] | null;
  /** The wire this conversation's words travelled: the last written one, or the phone when that is all there is. */
  channel: "whatsapp" | "sms" | "email" | "phone";
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
import { personName } from "./person-name";
import { isOptedOutContact } from "./consent";
import { replyWindow, isLiveCall } from "./policy";
import { callOutcomeOf, callOutcomeWords, tidyCallSummary } from "./call-words";
import { RECORDING_PURGED_WORDS, RECORDING_RETENTION_DAYS } from "./retention";

/**
 * Who answers a thread on each wire, as the chip under a row names it.
 *
 * It was one constant, "WhatsApp Receptionist", on every row and every thread
 * whatever wire it was on -- so an email thread credited a receptionist that
 * does not answer email at all. On email it is the team, in the words the
 * thread already signs a person's reply with ("by your team"). On the phone
 * the call view models name their own.
 */
const AGENTS = {
  whatsapp: { glyph: "W", name: "WhatsApp Receptionist" },
  sms: { glyph: "T", name: "Text Receptionist" },
  email: { glyph: "Y", name: "Your team" },
  phone: { glyph: "P", name: "Phone Receptionist" },
} as const;
export function agentFor(channel: "whatsapp" | "sms" | "email" | "phone"): { glyph: string; name: string } {
  return AGENTS[channel] ?? AGENTS.whatsapp;
}
const CALL_NOTE_PREFIX = /^\[voice call note [^\]]*\]\s*(Caller phoned the (?:salon|business) line\.\s*)?(Summary:\s*)?/; // trade-word: the older notes said "salon"; the newer say "business"

/**
 * A time in a thread or a call, by the business's clock (clock.ts). The two
 * formatters here were built without a zone, so a message read in the browser's
 * zone and "the same day" meant the browser's day: one call read as two times
 * (the 12 September audit's D5). The formatters are built once per zone there,
 * which keeps what these hoisted ones were for: these mappers run twice per
 * refresh over every message, and constructing a formatter per call froze the
 * page when a message arrived.
 */
export function shortTime(iso: string | null, tz: string, now: Date): string {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? clockShort(ms, tz, now.getTime()) : "";
}

/** Transcript bubbles keep day context across multi-day threads. */
function bubbleTime(iso: string, tz: string, now: Date): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? clockStamp(ms, tz, now.getTime()) : "";
}

/** The display name for a contact, without building a whole thread viewmodel
 *  to read one field (Today was doing exactly that per open escalation). */
export function contactName(dto: ConversationDto): string {
  return personName(dto.contact);
}

/** The wire a written message travelled, as a thread names it. Anything unnamed is WhatsApp, which is what every row was before the column said. */
export function writtenChannelOf(channel: string | null | undefined): "whatsapp" | "sms" | "email" {
  return channel === "sms" ? "sms" : channel === "email" ? "email" : "whatsapp";
}

/** A thread's channel in the words under a person's name. */
const THREAD_CHANNEL_WORDS = { whatsapp: "WhatsApp", phone: "Phone", sms: "Text", email: "Email" } as const;

/**
 * The wire a thread's written words LAST travelled; "phone" when it has none.
 *
 * One derivation, because three surfaces were each answering it their own way
 * and two of them answered "WhatsApp" whatever the row said. Today hard-coded
 * the word onto every escalation, so an email arriving read "WhatsApp \u00b7 waited
 * 12m"; the conversation row derived it properly only after the same defect
 * was found there. A row that names the wrong wire is worse than one that
 * names none: the owner replies in the wrong place, or does not recognise the
 * thread they are being asked about.
 */
export function threadChannelOf(messages: ReadonlyArray<Pick<MessageDto, "type" | "channel">>): "whatsapp" | "sms" | "email" | "phone" {
  const written = [...messages].reverse().find((m) => m.type !== "call_summary");
  return written ? writtenChannelOf(written.channel) : "phone";
}

/** The same question, in the words a row shows. */
export function threadChannelWords(messages: ReadonlyArray<Pick<MessageDto, "type" | "channel">>): "WhatsApp" | "Text" | "Email" | "Phone" {
  return THREAD_CHANNEL_WORDS[threadChannelOf(messages)];
}

/** An email's subject, as the intake kept it (core email-ingest.ts). */
function emailSubjectOf(m: MessageDto): string | null {
  const email = (m.meta as { email?: { subject?: unknown } } | null)?.email;
  return typeof email?.subject === "string" && email.subject.trim() ? email.subject.trim() : null;
}

/**
 * What an email carried that the thread does not show. The intake keeps the
 * names of an email's files and never the files, and a bounded amount of its
 * words (core email-ingest.ts); an owner reading "see the attached floor plan"
 * above nothing at all would take the email for the whole of it. Said in one
 * line under the words, and only when something was left out.
 */
export function emailLeftOutOf(meta: unknown): string | null {
  const email = (meta as { email?: { attachments?: unknown; more_attachments?: unknown; truncated?: unknown } } | null)?.email;
  if (!email) return null;
  const files = Array.isArray(email.attachments) ? email.attachments : [];
  const unnamed = typeof email.more_attachments === "number" && email.more_attachments > 0 ? email.more_attachments : 0;
  const names = files.map((f) => (f as { filename?: unknown } | null)?.filename).filter((n): n is string => typeof n === "string" && n.trim().length > 0);
  const total = files.length + unnamed;
  const said: string[] = [];
  if (total) {
    const rest = total - names.length;
    const listed = names.length ? `: ${names.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}` : "";
    said.push(`${total === 1 ? "1 attachment was" : `${total} attachments were`} not kept${listed}.`);
  }
  if (email.truncated === true) said.push("This email was longer than Chanlytics keeps; the rest was left out.");
  return said.length ? said.join(" ") : null;
}

/**
 * A name that is an identifier, a number or an address, has no first name to
 * shorten to: "+1" as a speaker label is nobody, and neither is "ana@".
 */
export function isIdentifierName(name: string): boolean {
  return /^[+\d(]/.test(name) || name.includes("@");
}

/** The "WhatsApp · +1 …" subtitle line, same source as the thread viewmodel; "Phone · …" for a caller with no thread. */
export function contactMeta(dto: ConversationDto, channel: "WhatsApp" | "Phone" | "Text" | "Email" = "WhatsApp"): string {
  // The identifier under the name: the number, else the address. When it IS
  // the name, the line says so instead of repeating it.
  const id = formatPhoneDisplay(dto.contact.phone_e164) ?? dto.contact.email ?? null;
  return contactName(dto) === id ? `${channel} · no name saved` : `${channel} · ${id ?? "no phone"}`;
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

/* An email replies by quoting the whole of what it answers. "Got it, thanks!" arrived as six
   lines of "On Thu, Sep 17, 2026 at 10:44 PM Melany's Beauty Salon <…> wrote: > testing back at
   you >", and the thread drew every one of them. The chain is kept — an operator may need to see
   what the customer was answering — but it is not what the bubble says.

   Only the shapes a mail client actually writes are cut, each anchored to the START of a line:
   an attribution line ending in "wrote:", Outlook's divider, and a run of "> " quotes. Anything
   else is left alone, because a false positive silently hides a customer's words. */
/* A divider, or a run of ">" quotes, each at the start of its own line. */
const QUOTE_BLOCK = /^[ \t]*(?:(?:-{2,}[ \t]*Original Message[ \t]*-{2,})|(?:_{5,})|(?:>[ \t]?))/m;
/* "On <date> <someone> wrote:", which the wire does NOT always put on its own line. The body this
   was written against arrived flattened — "Got it, thanks! On Thu, Sep 17, 2026 at 10:44 PM
   Melany's Beauty Salon <…> wrote: > testing back at you >", all one line — so it is not anchored
   to a line start. Instead the attribution only counts when a quote actually follows it: a newline
   or a ">". "On Tuesday my friend wrote: yes" is a customer's sentence, and stays one. */
const QUOTE_ATTRIBUTION = /\bOn\b[\s\S]{0,240}?\bwrote:[ \t]*(?=\r?\n|>)/;

/** An email's own words, and the chain it quoted back at us. `quoted` is null when there is none. */
export function splitQuotedReply(body: string): { text: string; quoted: string | null } {
  const cuts = [QUOTE_ATTRIBUTION.exec(body), QUOTE_BLOCK.exec(body)]
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m.index);
  if (cuts.length === 0) return { text: body, quoted: null };
  const cut = Math.min(...cuts);
  const text = body.slice(0, cut).trim();
  const quoted = body.slice(cut).trim();
  // A reply that is ONLY the quote keeps its words: better a long bubble than an empty one.
  if (!text || !quoted) return { text: body, quoted: null };
  return { text, quoted };
}

/* What a message says, wherever it is shown: an email's own words, without the chain it quoted back
   (splitQuotedReply). One function, because each place that said it its own way drifted: the bubble split
   the chain, while the Conversations row previewed it and the status band's "They wrote" printed it whole. */
export function messageWords(m: MessageDto): string {
  return m.channel === "email" ? splitQuotedReply(messageText(m)).text : messageText(m);
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
  email_review: "Wrote by email — a person answers",
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
  callback: "They phoned and the receptionist couldn't finish it.",
  paused: "The workspace is paused because billing stopped, so the receptionist did not answer. Resume from Settings › Billing, or answer this one yourself.",
  carriers: "This text arrived before the carriers approved your line for texting, so the receptionist did not answer. Answer it yourself, or wait for the approval on Setup.",
  email_review: "They wrote by email. The receptionist does not answer email yet, so nothing was sent. Read it and reply from here.",
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
  /** They said yes to offers, so a promotional template may go to them: the composer offers only what can send (I4). */
  offersOk: boolean;
  who: string;
  whoMeta: string;
  avatar: string;
  state: "escalated" | "snoozed" | "done";
  takenOver: boolean;
  /** A teammate has this thread: the page names them and offers no take-over. */
  claimedByOther: boolean;
  /** Who has it, when someone does -- the page names them from the team. */
  assigneeUserId: string | null;
  /**
   * The customer's own words beside the decision: what they last wrote, quoted,
   * or what the call left behind for a call back. Null when nothing is being decided.
   * `kind` says which: a call back's is the thread's own sentence (`summary`), so the
   * band does not say it again beneath; the row and its search still read `text`.
   */
  ask: { kind: "call" | "wrote" | "sent"; label: string; text: string; quoted: boolean } | null;
  /** Archived: closed, not handled. The pane says so, and that a new message brings it back. */
  archived: boolean;
  /**
   * A quiet thread's one line: who had the last word, in the words Conversations uses, and whether a reply
   * didn't send. Null unless the thread is Handled and not archived. Every quiet thread read "Answered by the
   * receptionist — no one asked for you", over a customer who wrote last and a reply that never left (I1).
   */
  lastWord: { text: string; tone: "ok" | "plain" | "warn" | "danger"; short: string | null } | null;
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
  primaryChannel: "whatsapp" | "phone" | "sms" | "email";
  /** That channel in the words a reply box names it by: "WhatsApp", "Text", "Email". One map, so a new wire is one entry and not a ternary per screen. */
  replyVia: string;
  /** A WhatsApp thread exists. False for a caller who has only ever phoned: no reply window, phone verbs. */
  hasChat: boolean;
  /** The number to call back, E.164, when known. */
  phone: string | null;
  /** That number as people read it, "+1 (917) 555-0106": the composer said "+19175550106" under a header that did not (I4). */
  phoneDisplay: string | null;
  /** How long the request has waited, in the one family every surface reads ("57m", "2h"). */
  waited?: string;
  /** Who answers, by name and glyph -- and nothing it was never given: an autonomy line and a voice were written into every thread, and the rail said them. */
  agent: { name: string; glyph: string };
  /** Why a person is needed, as the list's row says it: the reason's label, or empty when nobody is. */
  subject: string;
  /** The last thing that happened: the newest message that came in or reached them, never a draft. */
  preview: string;
  summary: string;
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
        /** An email's subject line; absent on every other wire. */
        subject?: string;
        /** The chain an email quoted back at us, when it did: kept, and shown on a tap. */
        quoted?: string;
        /** What an email carried that is not shown: files whose names alone were kept, words past the bound (emailLeftOutOf). */
        leftOut?: string;
        /** The attachment, when the message is one. */
        media?: MediaVM;
        /** Why the receptionist said it, when the row remembers. */
        why?: ReplyWhyVM;
        byYou?: boolean;
        /** Who sent it, when a person or a run did, in the words Conversations uses: "your team", "a broadcast (…)". */
        byWords?: string;
        /** Sent by a broadcast, not typed: the name the owner gave it. */
        via?: { kind: "broadcast" | "playbook"; name: string };
        status?: string;
        /** "Didn't send", "Canceled before sending", "Read" (messageStatusLabel). */
        statusLabel?: string;
        /** False when these words never reached the customer: the page dashes them, as Conversations does. */
        reachedCustomer?: boolean;
        /** The message's own id, on every bubble: a call's note finds its call by it, and a link opens the thread there. */
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
): { state: InboxThreadVM["state"]; takenOver: boolean; needsYou: boolean; claimedByOther: boolean } {
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
  return { state, takenOver: v.takenOver, needsYou: v.standing === "needs_you", claimedByOther: v.claimedByOther };
}

export function toInboxThreadVM(
  dto: ConversationDto,
  escalation: EscalationDto | null,
  /** The workspace's zone: every time in the thread is said by its clock. */
  tz: string,
  now = new Date(),
): InboxThreadVM {
  const who = contactName(dto);
  // takenOver = a human claimed it (assignee set by take-over/reply) — the pane
  // then shows the owned-thread strip + hand-back instead of the take banner.
  const { state, takenOver, needsYou, claimedByOther } = threadStanding(dto, escalation, now);
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
  // The wire a reply goes out on, as the reply route picks it: where they last wrote. A text thread said WhatsApp,
  // its window read closed, and its composer offered only templates, which the route refuses on a text (I5).
  const chatChannel = writtenChannelOf(lastInbound?.channel);
  const primaryChannel: InboxThreadVM["primaryChannel"] = hasChat || !hasCalls ? chatChannel : "phone";
  // Every wire the thread's written words travelled, the one a reply goes out on first: with more than one, each
  // bubble says its own (the page names a bubble's channel only when a thread has several).
  const written = [...new Set(dto.messages.filter((m) => m.type !== "call_summary").map((m) => writtenChannelOf(m.channel)))];
  const channels = [...(hasChat || !hasCalls ? [chatChannel, ...written.filter((c) => c !== chatChannel)] : []), ...(hasCalls ? ["phone"] : [])];

  const timeline: InboxThreadVM["timeline"] = dto.messages.map((m) => {
    const onPhone = m.type === "call_summary";
    const media = mediaVM(m);
    const why = m.sender === "ai" ? replyWhy(m.meta) : null;
    const subject = m.channel === "email" ? emailSubjectOf(m) : null;
    const leftOut = m.channel === "email" ? emailLeftOutOf(m.meta) : null;
    // Only an email quotes; a WhatsApp message that happens to start a line with ">" is words.
    const said = m.channel === "email" ? splitQuotedReply(messageText(m)) : null;
    return {
      type: "msg" as const,
      messageId: m.id,
      from: m.sender === "customer" ? ("client" as const) : ("agent" as const),
      channel: onPhone ? "phone" : writtenChannelOf(m.channel),
      // An email's subject line, above its words.
      ...(subject ? { subject } : {}),
      ...(leftOut ? { leftOut } : {}),
      at: bubbleTime(messageAt(m), tz, now),
      body: said ? said.text : messageText(m),
      ...(said && said.quoted ? { quoted: said.quoted } : {}),
      ...(media ? { media } : {}),
      ...(why ? { why } : {}),
      // Who said it, per BUBBLE. The thread carries one agent identity, and the
      // pane rendered that under every agent row — so a phone call summary was
      // signed "by WhatsApp Receptionist", crediting the wrong assistant with
      // work it did not do. The bubble already knows its own channel.
      ...(m.sender !== "customer"
        ? (() => { const a = agentFor(onPhone ? "phone" : writtenChannelOf(m.channel)); return { agentName: a.name, agentGlyph: a.glyph }; })()
        : {}),
      ...(m.sender === "human" ? { byYou: true } : {}),
      // The words Conversations says too (messageAuthor): a person's reply is the team's.
      ...(m.sender === "human" && messageAuthor(m) ? { byWords: (messageAuthor(m) as MessageAuthor).words } : {}),
      ...(m.meta?.source === "broadcast"
        ? { via: m.meta.playbook_name
            ? { kind: "playbook" as const, name: String(m.meta.playbook_name) }
            : { kind: "broadcast" as const, name: String(m.meta.broadcast_name ?? "broadcast") } }
        : {}),
      ...(m.sender !== "customer" && m.status
        ? {
            status: m.status,
            // The words themselves live in messageStatusLabel, so this pane and
            // the Conversations pane cannot describe the same message
            // differently — which is exactly what they were doing.
            ...(messageStatusLabel(m.status) ? { statusLabel: messageStatusLabel(m.status) } : {}),
            // Whether the words left: the receptionist's failed reply was drawn as a sent bubble (I1).
            reachedCustomer: reachedCustomer(m.status),
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
      at: shortTime(escalation.created_at, tz, now),
      // Why it was flagged, not what to do: the open escalation's details are the band's sentence, and quoting them here
      // said a call back's to-do a third time.
      body: `Flagged for a human — ${reasonLabel}`,
    };
    if (idx === -1) timeline.push(entry);
    else timeline.splice(idx, 0, entry);
  }

  const waitingMin = escalation
    ? Math.max(1, Math.round((now.getTime() - new Date(escalation.created_at).getTime()) / 60000))
    : undefined;

  // The customer's own words where the decision is made. The reason's sentence
  // says why a person is needed; this says what they asked: the last thing they
  // wrote, which is what they are waiting on, or for a call back what the call
  // left behind -- the details the call back's sentence promises.
  const ask: InboxThreadVM["ask"] = !escalation
    ? null
    : escalation.reason === "callback"
      ? (escalation.details?.trim() ? { kind: "call" as const, label: "From the call", text: escalation.details.trim(), quoted: false } : null)
      : lastInbound
        ? lastInbound.type === "text"
          ? { kind: "wrote" as const, label: "They wrote", text: messageWords(lastInbound), quoted: true }
          : { kind: "sent" as const, label: "They sent", text: messageWords(lastInbound), quoted: false }
        : null;

  // A quiet thread's one line: who had the last word, and whether a reply didn't send (lastWordOf, I1).
  const lastWord = state === "done" && dto.state !== "archived" ? lastWordOf(dto) : null;

  return {
    id: `th-${dto.id}`,
    real: true,
    conversationId: dto.id,
    clientId: dto.contact.id || null,
    escalationId: escalation?.id ?? null,
    windowOpen: win,
    optedOut: isOptedOut(dto),
    offersOk: dto.contact.marketing_consent === "opted_in",
    who,
    whoMeta: contactMeta(dto, THREAD_CHANNEL_WORDS[primaryChannel]),
    avatar: initialsOf(who),
    state,
    takenOver,
    needsYou,
    claimedByOther,
    assigneeUserId: dto.assignee_user_id ?? null,
    ask,
    archived: dto.state === "archived",
    lastWord,
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
    replyVia: THREAD_CHANNEL_WORDS[primaryChannel],
    hasChat,
    phone: dto.contact.phone_e164 ?? null,
    phoneDisplay: formatPhoneDisplay(dto.contact.phone_e164),
    ...(waitingMin ? { waited: formatWaited(waitingMin * 60000) } : {}),
    agent: agentFor(primaryChannel),
    // The list's row says each thing once: why a person is needed (this), whose it is (its pill), how long they have
    // waited (beside the name) and what they asked (ask). A thread nobody needs to act on has no reason, and its row is
    // the last thing that happened. The subject said "A teammate is answering this" under a pill naming the teammate,
    // "You're answering this one" under "You have it", and a quiet thread's last words twice when they wrote last.
    subject: reasonLabel ?? "",
    // A contact who has only ever phoned has no message of their own: their call note is the last thing that happened.
    preview: last ? messageWords(last).slice(0, 110) : "",
    // A thread a teammate has is theirs to answer: the reason's sentence ("they're
    // waiting on you") would tell everyone else the opposite of what is true.
    summary: claimedByOther
      ? "A teammate is answering this. The receptionist stays quiet until they hand it back."
      : escalation
      // A call back's to-do is its one sentence: "They phoned and the receptionist couldn't finish it." sat beneath the
      // call it describes, over "From the call: <the to-do>". Without a to-do, the reason's sentence.
      ? (escalation.reason === "callback" && escalation.details?.trim() ? escalation.details.trim() : ESCALATION_SUMMARIES[escalation.reason] ?? `${reasonLabel}. Needs a human.`)
      : takenOver
        ? "You're answering this one. The receptionist stays quiet until you hand it back."
        : lastWord
          ? lastWord.text
          : "The receptionist answered this on its own. Nothing is owed.",
    lastAt: shortTime(dto.last_message_at, tz, now),
    lastAtFull: shortTime(dto.last_message_at, tz, now),
    lastAtMs: dto.last_message_at ? new Date(dto.last_message_at).getTime() : 0,
    ...(escalation ? { escalatedAtMs: new Date(escalation.created_at).getTime() } : {}),
    // The dot means a person is needed and nobody has it: needsYou, the one rule.
    // "Escalated and not mine" lit it on a thread a teammate is answering too.
    unread: needsYou,
    pinned: false,
    tags: [],
    priority: "P2",
    ...(waitingMin !== undefined ? { waitingMin } : {}),
    ...(state === "snoozed" && dto.snooze_until ? { wake: shortTime(dto.snooze_until, tz, now) } : {}),
    timeline,
  };
}

export interface MessageAuthor {
  kind: "receptionist" | "team" | "broadcast" | "playbook";
  /** How a bubble names them: "the receptionist", "your team", "a broadcast (Spring offer)". */
  words: string;
}

/**
 * Who sent one of our messages, in the words the Inbox and Conversations both use.
 *
 * A person's reply is the team's: the row does not record which member sent
 * it, and the Inbox said "by you" for all of them. A broadcast or a playbook
 * run is named from the run. The customer's words and a call note have no
 * author here.
 */
export function messageAuthor(m: MessageDto): MessageAuthor | null {
  if (m.sender === "customer" || m.sender === "system" || m.type === "call_summary") return null;
  if (m.meta?.source === "broadcast") {
    return m.meta.playbook_name
      ? { kind: "playbook", words: `the ${String(m.meta.playbook_name)} playbook` }
      : { kind: "broadcast", words: m.meta.broadcast_name ? `a broadcast (${String(m.meta.broadcast_name)})` : "a broadcast" };
  }
  return m.sender === "ai" ? { kind: "receptionist", words: "the receptionist" } : { kind: "team", words: "your team" };
}

/** A chat row's second line: that a person has the thread, or who had the last word. */
function lastWordLine(needsHuman: boolean, last: MessageDto | undefined, author: MessageAuthor | null): string {
  if (needsHuman) return "Receptionist paused — a human has this thread";
  if (!last) return "No messages yet";
  if (last.direction === "inbound") return "They wrote last — no reply yet";
  if (!author) return "Answered automatically";
  if (author.kind === "receptionist") return "Answered by the receptionist";
  if (author.kind === "team") return "Answered by your team";
  return `Last message: ${author.words}`;
}

/**
 * A quiet thread's one line in the Inbox: who had the last word, in Conversations' words (lastWordLine), and
 * whether a later message of ours didn't send. Every quiet thread read "Answered by the receptionist — no one
 * asked for you": over a customer who wrote last, and over a reply that never left (I1). A reply someone
 * canceled is not a failure: the customer is simply waiting.
 */
function lastWordOf(dto: ConversationDto): NonNullable<InboxThreadVM["lastWord"]> {
  const chat = dto.messages.filter((m) => m.type !== "call_summary");
  // Back from the newest: our words that never left, down to the last thing that happened between them.
  let at = chat.length - 1;
  let failed: MessageDto | null = null;
  for (; at >= 0; at--) {
    const m = chat[at];
    if (m.direction === "inbound" || reachedCustomer(m.status)) break;
    if (!failed && m.status === "failed") failed = m;
  }
  const last = at >= 0 ? chat[at] : null;
  const failedBy = failed ? (messageAuthor(failed)?.words ?? "us") : null;
  if (!last) {
    if (failedBy) return { text: `Nothing has reached them — the message from ${failedBy} didn't send.`, tone: "danger", short: "Didn't send" };
    return dto.messages.some((m) => m.type === "call_summary")
      ? { text: "The phone receptionist handled their call — no one asked for you.", tone: "ok", short: null }
      : { text: "No messages yet.", tone: "plain", short: null };
  }
  if (last.direction === "inbound") {
    return failedBy
      ? { text: `They wrote last, and the reply from ${failedBy} didn't send — as far as they know, nobody answered.`, tone: "danger", short: "Didn't send" }
      : { text: "They wrote last — no reply yet.", tone: "plain", short: null };
  }
  const said = lastWordLine(false, last, messageAuthor(last));
  return failedBy
    ? { text: `${said} — the last message from ${failedBy} didn't send.`, tone: "warn", short: "Didn't send" }
    : { text: `${said} — no one asked for you.`, tone: "ok", short: null };
}

/** Words cut after a whole word, with an ellipsis, when they run past `max`; whole when they fit. */
export function clipAtWord(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : t.slice(0, max)).replace(/[\s,;:—-]+$/u, "")}…`;
}

export function toConversationVM(dto: ConversationDto, tz: string, now = new Date()): ConversationVM {
  const who = contactName(dto);
  // An identifier is not split: "+1" is nobody's first name. The viewer
  // read "Latest from +1" for a person known only by number.
  const whoShort = isIdentifierName(who) ? who : who.split(" ")[0] || who;
  // The status travels with the bubble. It used to be dropped here, and the
  // conversations API filters nothing — so a queued draft still inside its veto
  // window, a send that failed, and a reply an operator canceled all arrived on
  // this surface indistinguishable from words the customer actually read. On a
  // live account that showed one message twice, identically, when one of the
  // two had been canceled before it ever left.
  const msgs = dto.messages.map((m): ConversationMessageVM => ({
    from: m.sender === "customer" ? "client" : "agent",
    // The row's own channel, not an assumption. Every bubble on this surface
    // was drawn as WhatsApp -- so a text conversation, live since the SMS
    // channel shipped, has been labelled WhatsApp on the Conversations page
    // this whole time, and an email one would be too. The Inbox has read the
    // column since I1 (toInboxThreadVM); these two view models had drifted.
    channel: m.type === "call_summary" ? "phone" : writtenChannelOf(m.channel),
    at: bubbleTime(messageAt(m), tz, now),
    text: messageWords(m),
    ...(mediaVM(m) ? { media: mediaVM(m) as MediaVM } : {}),
    ...(m.sender === "ai" && replyWhy(m.meta) ? { why: replyWhy(m.meta) as ReplyWhyVM } : {}),
    ...(messageAuthor(m) ? { by: (messageAuthor(m) as MessageAuthor).words } : {}),
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
  // Who had that last word, when it was ours: the receptionist, the team, or a run. The row said
  // "Answered by the receptionist" whoever answered, and when the customer had spoken last.
  const lastAuthor = last && last.direction === "outbound" ? messageAuthor(last) : null;
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
    // The Inbox's id for this conversation (toInboxThreadVM): the door from a transcript to its thread.
    threadId: `th-${dto.id}`,
    answeredBy: lastAuthor ? lastAuthor.kind : null,
    // The wire the conversation's last written words travelled. A thread with
    // nothing but a call note is the phone, which is what it looks like.
    channel: threadChannelOf(dto.messages),
    agent: agentFor(threadChannelOf(dto.messages)),
    // The row's time and its preview must come from the SAME message —
    // last_message_at ignored call notes, so a row read "3:22 AM" beside a
    // preview imported at 2:15 PM.
    at: shortTime(last ? messageAt(last) : dto.last_message_at, tz, now),
    outcome,
    snippet: last ? messageWords(last).slice(0, 110) : "",
    hasChat: chat.length > 0,
    ts: last ? new Date(messageAt(last)).getTime() : dto.last_message_at ? new Date(dto.last_message_at).getTime() : 0,
    summary: {
      headline: lastInbound ? messageWords(lastInbound).slice(0, 110) : "No customer messages yet.",
      bullets: [
        `${chat.length} message${chat.length === 1 ? "" : "s"}${
          callNotes ? ` · ${callNotes} call${callNotes === 1 ? "" : "s"}` : ""
        }${dto.messages[0] ? ` · started ${shortTime(messageAt(dto.messages[0]), tz, now)}` : ""}`,
        lastWordLine(needsHuman, last, lastAuthor),
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
  /** Turns. `start`/`end` (seconds) are the turn's first and last word; `words` is
   *  the raw provider shape and is stripped by the list route (F15). */
  transcript_object: Array<{ role?: string; content?: string; start?: number; end?: number; words?: Array<{ start?: number; end?: number }> }> | null;
  /** storage_path and provider_url are stripped server-side — audio is only
   *  reachable through the signed-URL route. */
  recording: { fetch_state?: string; mime?: string | null; bytes?: number } | null;
  conversation_id: string | null;
  contact_id: string | null;
  message_id: string | null;
  contact: { display_name: string | null; wa_profile_name: string | null; phone_e164: string | null } | null;
}

/**
 * A caller who reached the receptionist and left with nothing.
 *
 * DELIBERATELY NOT "missed". This product already uses that word for exactly
 * one thing — `status === "not_connected"`, a dial that never connected — and
 * the Ask assistant, the day's snapshot and the conversations page all read it
 * that way. Today keeps those out of the attention region on purpose: an
 * attempt is not a call.
 *
 * This is the inbound one nobody had a word for. Somebody rang the business,
 * the receptionist began to speak, and they hung up a few seconds later. The
 * product filed it as `handled`, because technically it was, and Today either
 * dropped the row or labelled it "No summary from the voice provider" — our
 * machine's problem, not their departure. For a salon it is the most
 * commercially interesting event of the day, and the only lost one that leaves
 * a phone number behind.
 *
 * Fifteen seconds because the greeting carries a recording notice and the AI
 * disclosure and takes most of ten: a caller gone before that heard a machine
 * start talking and nothing else.
 *
 * The reason must be the CUSTOMER leaving. The receptionist ending a call, a
 * transfer to a person, and a call that ran out of time are all endings
 * somebody chose.
 */
export const ABANDONED_MS = 15_000;

export function abandonedCall(
  dto: Pick<CallDto, "direction" | "status" | "duration_ms" | "disconnection_reason" | "in_voicemail">,
): boolean {
  if (dto.direction !== "inbound") return false;
  // A dial that never connected is the other thing entirely, and a call that
  // reached voicemail already has its own row.
  if (dto.status === "not_connected" || dto.in_voicemail) return false;
  const ms = dto.duration_ms;
  if (typeof ms !== "number" || ms <= 0 || ms >= ABANDONED_MS) return false;
  return dto.disconnection_reason === "user_hangup";
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
  // The endings the Live page's own controls produce, and the provider's
  // newer names for a transfer.
  manual_stopped: "Ended from the dashboard",
  call_take_over: "A person took over the call",
  transfer_bridged: "Transferred to a person",
  transfer_cancelled: "Transfer did not go through",
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
  outcome: "live" | "handled" | "missed" | "callback" | "abandoned";
  live?: boolean;
  snippet: string;
  summary: { headline: string; bullets: string[] };
  /** Each line with its moment in the call, in seconds: where it starts and where it ends (null for a whisper, which
   *  is not a sound in the recording). The thread plays from a line and lights the one being said by these. */
  transcript: Array<{ t: string; speaker: "agent" | "client" | "whisper"; text: string; start: number | null; end: number | null }>;
  /** The call's length in seconds: the player's track before the audio says its own. */
  durationSec: number | null;
  recordingState: "ready" | "pending" | "failed" | "purged" | "none";
  recordingUrl?: string;
  threadId?: string;
  /** The note this call left on its thread (a call_summary message): the thread draws the call there. */
  messageId?: string;
  direction: "inbound" | "outbound";
  /** It never connected. */
  missed: boolean;
  /** What the call was about: what the caller wanted, in the analysis's plain words, or the provider's first sentence.
   *  Null when it never connected or nothing was said about it -- never a sentence saying there is no sentence. */
  about: string | null;
  /** How it went, a few words each: how the caller sounded, how it ended, why there is no recording to play. The call
   *  card's one quiet line. */
  facts: string[];
}

function mmss(ms: number | null | undefined): string | undefined {
  if (!ms || ms < 0) return undefined;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** A call's length in words, the way the product says it everywhere: "2 min 5 sec", "6 sec". */
export function spokenDuration(ms: number | null): string {
  if (!ms) return "Duration not recorded";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m ? `${m} min ${sec} sec` : `${sec} sec`;
}

// How the caller sounded, as the voice provider read it, where that says anything: "Neutral" and "Unknown" do not.
const CALL_MOOD: Record<string, string> = { Positive: "Sounded positive", Negative: "Sounded negative" };
// Why a call has no recording to play. A call never recorded says so: said nothing, it looked like a player that failed
// to draw (Emily's call, which is filler and was never a call at all).
const RECORDING_NOTE: Partial<Record<CallVM["recordingState"], string>> = {
  none: "No recording",
  pending: "Recording still processing",
  failed: "Recording couldn't be saved",
  purged: `Recording removed after ${RECORDING_RETENTION_DAYS} days`,
};

export function toCallVM(dto: CallDto, tz: string, now = new Date()): CallVM {
  const withheld = !dto.from_e164 && !dto.from_raw;
  const phone = formatPhoneDisplay(dto.from_e164);
  const name = dto.contact?.display_name || dto.contact?.wa_profile_name || null;
  const who = withheld ? "Caller ID withheld" : name || phone || dto.from_raw || "Unknown caller";
  const whoShort = name ? (isIdentifierName(name) ? name : name.split(" ")[0]) : "Caller";
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
  const ending = dto.disconnection_reason ? (DISCONNECTION_LABELS[dto.disconnection_reason] ?? dto.disconnection_reason.replace(/_/g, " ")) : null;
  if (ending) bullets.push(`Ended: ${ending}`);
  if (dto.sentiment) {
    bullets.push(`Caller sentiment: ${dto.sentiment} — the voice provider's own read`);
  }
  const outcomeWords = callOutcomeWords(dto.outcome);
  if (outcomeWords) bullets.push(outcomeWords);
  if (dto.follow_up?.trim()) bullets.push(`To do: ${dto.follow_up.trim()}`);
  if (dto.caller_name?.trim()) bullets.push(`Gave their name as ${dto.caller_name.trim()}`);
  // "purged": the audio was removed on the schedule the privacy page states
  // (retention.ts); the row keeps the transcript. Said so, rather than left to
  // read as "still processing" for ever.
  const recState: CallVM["recordingState"] =
    dto.recording?.fetch_state === "stored" ? "ready" :
    dto.recording?.fetch_state === "failed" ? "failed" :
    dto.recording?.fetch_state === "purged" ? "purged" :
    dto.recording ? "pending" : "none";
  if (!missed) {
    bullets.push(
      recState === "ready" ? "Recording saved" :
      recState === "pending" ? "Recording still processing" :
      recState === "failed" ? "Recording couldn't be saved from the voice provider" :
      recState === "purged" ? RECORDING_PURGED_WORDS :
      "No recording for this call",
    );
  }
  if (dto.message_id && !withheld) bullets.push(`Noted on ${whoShort}'s thread in the Inbox`);

  // Each line's moment in the call, in seconds: the provider's own start, or halfway between its neighbours for a line
  // it gave none (two of the salon's 244 real lines, short replies with no words); its end, or where the next line
  // begins. A whisper -- an injected turn, the owner's own words to the receptionist -- is not a sound in the recording,
  // so it has no moment.
  const turns = dto.transcript_object ?? [];
  const given = turns.map((turn) => (turn.role === "injected" ? null : turn.start ?? turn.words?.[0]?.start ?? null));
  const starts = given.map((s, i) => {
    if (s != null || turns[i].role === "injected") return s;
    const before = given.slice(0, i).reverse().find((x) => x != null) ?? null;
    const after = given.slice(i + 1).find((x) => x != null) ?? null;
    return before != null && after != null ? (before + after) / 2 : before ?? after;
  });
  const transcript = turns.map((turn, i) => {
    // An injected turn is a whisper: the owner's own words, shown as theirs.
    if (turn.role === "injected") {
      return { t: "—", speaker: "whisper" as const, text: whisperText(turn.content), start: null, end: null };
    }
    const own = given[i];
    const start = starts[i];
    const next = start == null ? null : starts.slice(i + 1).find((x) => x != null && x > start) ?? null;
    const end = start == null ? null : turn.end ?? turn.words?.[turn.words.length - 1]?.end ?? next;
    return {
      t: typeof own === "number" ? `${Math.floor(own / 60)}:${String(Math.floor(own % 60)).padStart(2, "0")}` : "—",
      speaker: (turn.role === "agent" ? "agent" : "client") as "agent" | "client",
      text: turn.content ?? "",
      start,
      end,
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
    at: shortTime(dto.started_at, tz, now),
    ts: dto.started_at ? new Date(dto.started_at).getTime() : 0,
    ...(dur ? { duration: dur } : {}),
    outcome: live ? "live" : missed ? "missed" : abandonedCall(dto) ? "abandoned" : callOutcomeOf(dto.outcome) === "callback_needed" ? "callback" : "handled",
    ...(live ? { live: true } : {}),
    snippet: withheld
      ? `${dto.direction === "inbound" ? "Inbound" : "Outbound"} call${dur ? ` · ${dur}` : ""} — caller ID withheld, so this call isn't linked to a customer.`
      : `${dto.direction === "inbound" ? "Inbound" : "Outbound"} call${dur ? ` · ${dur}` : ""} — ${snippetBody}`,
    summary: { headline: wanted || firstSentence || snippetBody, bullets },
    transcript,
    durationSec: dto.duration_ms ? Math.round(dto.duration_ms / 1000) : null,
    recordingState: recState,
    ...(recState === "ready" ? { recordingUrl: `/api/v1/calls/${dto.id}/recording` } : {}),
    ...(dto.conversation_id ? { threadId: `th-${dto.conversation_id}` } : {}),
    // The call's facts as facts, for the thread's call card: they were only inside the bullets' sentences.
    ...(dto.message_id ? { messageId: dto.message_id } : {}),
    direction: dto.direction === "outbound" ? "outbound" : "inbound",
    missed,
    // A voicemail says so in how it ended; "Reached voicemail." here said it twice.
    about: missed ? null : wanted || firstSentence || null,
    facts: [CALL_MOOD[dto.sentiment ?? ""], ending, missed ? undefined : RECORDING_NOTE[recState]].filter((f): f is string => !!f),
  };
}
