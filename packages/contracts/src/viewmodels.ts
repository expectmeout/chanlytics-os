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
  type: string;
  body: string | null;
  media: { mime_type?: string | null; fetch_state?: string } | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface ConversationDto {
  id: string;
  state: "open" | "needs_human" | "snoozed" | "archived";
  paused_until: string | null;
  snooze_until?: string | null;
  last_wa_inbound_at?: string | null;
  last_message_at: string | null;
  contact: {
    id: string;
    display_name: string | null;
    wa_profile_name: string | null;
    phone_e164: string | null;
  };
  messages: MessageDto[];
}

/* ---- the mockup's conversation shape ---- */

export interface ConversationMessageVM {
  from: "client" | "agent";
  at: string;
  text: string;
}

export interface ConversationVM {
  id: string;
  who: string;
  initials: string;
  clientId: null;
  channel: "whatsapp";
  agent: { glyph: string; name: string };
  at: string;
  outcome: "escalated" | "handled" | "open";
  snippet: string;
  summary: { headline: string; bullets: string[] };
  messages: ConversationMessageVM[];
  live?: boolean;
}

import { formatPhoneDisplay } from "./phone";

const AGENT = { glyph: "W", name: "WhatsApp Receptionist" };
const CALL_NOTE_PREFIX = /^\[voice call note [^\]]*\]\s*(Caller phoned the salon line\.\s*)?(Summary:\s*)?/;

function shortTime(iso: string | null, now: Date): string {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Transcript bubbles keep day context across multi-day threads. */
function bubbleTime(iso: string, now: Date): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

function initialsOf(name: string): string {
  const digits = name.replace(/[^\d]/g, "");
  // phone-like display: last two digits distinguish contacts (never a "+1" avatar)
  if (digits.length >= 7 && /^[+\d\s()\-]+$/.test(name)) return digits.slice(-2);
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  const p = parts[0] || "?";
  return p.slice(0, 2).toUpperCase();
}

function messageText(m: MessageDto): string {
  if (m.type === "call_summary" && m.body) {
    return `Phone call — ${m.body.replace(CALL_NOTE_PREFIX, "").trim()}`;
  }
  if (m.body) return m.body;
  if (m.type === "media") {
    const kind = (m.meta && (m.meta.raw_type as string)) || "media";
    return `[${kind} attachment]`;
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

export const ESCALATION_REASON_LABELS: Record<string, string> = {
  human_token: "Customer asked for a person",
  refusal: "Assistant declined to answer",
  brain_error: "Assistant error — canned fallback sent",
  non_text: "Sent a voice note / photo",
  send_failed: "Reply failed to deliver",
  policy_block: "Pricing question — held by policy",
  rate_cap: "Reply rate limit reached",
  deadman: "No-activity check",
  manual: "Flagged manually",
};

export interface InboxThreadVM {
  id: string;
  real: true;
  conversationId: string;
  escalationId: string | null;
  windowOpen: boolean;
  who: string;
  whoMeta: string;
  avatar: string;
  state: "escalated" | "snoozed" | "done";
  takenOver: boolean;
  channels: string[];
  primaryChannel: "whatsapp";
  agent: { name: string; glyph: string; autonomy: string; tone: string };
  subject: string;
  preview: string;
  summary: string;
  contextStrip: Array<{ label: string; value: string }>;
  lastAt: string;
  lastAtFull: string;
  unread: boolean;
  pinned: false;
  value: 0;
  tags: string[];
  confidence: 0;
  priority: "P2";
  waitingMin?: number;
  wake?: string;
  resolution?: { action: string; at: string };
  timeline: Array<
    | { type: "msg"; from: "client" | "agent"; channel: string; at: string; body: string; byYou?: boolean }
    | { type: "event"; kind: string; at: string; body: string }
  >;
}

export function toInboxThreadVM(
  dto: ConversationDto,
  escalation: EscalationDto | null,
  now = new Date(),
): InboxThreadVM {
  const who =
    dto.contact.display_name || dto.contact.wa_profile_name ||
    formatPhoneDisplay(dto.contact.phone_e164) || "Unknown";
  const paused = !!dto.paused_until && new Date(dto.paused_until) > now;
  const needsHuman = dto.state === "needs_human" || paused;
  const state: InboxThreadVM["state"] =
    escalation || needsHuman ? "escalated" : dto.state === "snoozed" ? "snoozed" : "done";
  const takenOver = state === "escalated" && !escalation && needsHuman;
  const reasonLabel = escalation ? (ESCALATION_REASON_LABELS[escalation.reason] ?? escalation.reason) : null;
  const last = dto.messages[dto.messages.length - 1];
  const win = new Date(new Date(dto.last_wa_inbound_at ?? 0).getTime() + 24 * 3600 * 1000) > now;

  const timeline: InboxThreadVM["timeline"] = dto.messages.map((m) => ({
    type: "msg" as const,
    from: m.sender === "customer" ? ("client" as const) : ("agent" as const),
    channel: "whatsapp",
    at: shortTime(m.created_at, now),
    body: messageText(m),
    ...(m.sender === "human" ? { byYou: true } : {}),
  }));
  if (escalation) {
    timeline.push({
      type: "event",
      kind: "flag",
      at: shortTime(escalation.created_at, now),
      body: `Agent flagged for a human — ${reasonLabel}${escalation.details ? ` · “${escalation.details.slice(0, 120)}”` : ""}`,
    });
  }

  const waitingMin = escalation
    ? Math.max(1, Math.round((now.getTime() - new Date(escalation.created_at).getTime()) / 60000))
    : undefined;

  return {
    id: `th-${dto.id}`,
    real: true,
    conversationId: dto.id,
    escalationId: escalation?.id ?? null,
    windowOpen: win,
    who,
    whoMeta: `WhatsApp · ${formatPhoneDisplay(dto.contact.phone_e164) ?? "no phone"}`,
    avatar: initialsOf(who),
    state,
    takenOver,
    channels: ["whatsapp"],
    primaryChannel: "whatsapp",
    agent: { name: "WhatsApp Receptionist", glyph: "W", autonomy: "Pauses on handoff", tone: "Warm · bilingual (EN/ES)" },
    subject: reasonLabel ?? (takenOver ? "You have this thread" : "Conversation"),
    preview: last ? messageText(last).slice(0, 110) : "",
    summary: escalation
      ? `The receptionist paused itself and asked for a human: ${reasonLabel}.`
      : takenOver
        ? "A human took this thread — the receptionist stays quiet until it's handed back."
        : "Handled by the receptionist.",
    contextStrip: [
      { label: "Channel", value: "WhatsApp" },
      ...(reasonLabel ? [{ label: "Reason", value: reasonLabel }] : []),
      { label: "Window", value: win ? "Open — free-form replies" : "Closed — template only" },
    ],
    lastAt: shortTime(dto.last_message_at, now),
    lastAtFull: shortTime(dto.last_message_at, now),
    unread: state === "escalated" && !takenOver,
    pinned: false,
    value: 0,
    tags: [],
    confidence: 0,
    priority: "P2",
    ...(waitingMin !== undefined ? { waitingMin } : {}),
    ...(state === "snoozed" && dto.snooze_until ? { wake: shortTime(dto.snooze_until, now) } : {}),
    ...(state === "done" ? { resolution: { action: "Resolved", at: shortTime(dto.last_message_at, now) } } : {}),
    timeline,
  };
}

export function toConversationVM(dto: ConversationDto, now = new Date()): ConversationVM {
  const who =
    dto.contact.display_name ||
    dto.contact.wa_profile_name ||
    formatPhoneDisplay(dto.contact.phone_e164) ||
    "Unknown";
  const msgs = dto.messages.map((m): ConversationMessageVM => ({
    from: m.sender === "customer" ? "client" : "agent",
    at: bubbleTime(m.created_at, now),
    text: messageText(m),
  }));
  const lastInbound = [...dto.messages].reverse().find((m) => m.sender === "customer");
  const last = dto.messages[dto.messages.length - 1];
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
    initials: initialsOf(who),
    clientId: null,
    channel: "whatsapp",
    agent: AGENT,
    at: shortTime(dto.last_message_at, now),
    outcome,
    snippet: last ? messageText(last).slice(0, 110) : "",
    summary: {
      headline: lastInbound ? messageText(lastInbound).slice(0, 110) : "No customer messages yet.",
      bullets: [
        `${dto.messages.length} message${dto.messages.length === 1 ? "" : "s"} · WhatsApp`,
        needsHuman ? "Bot paused — a human is handling this thread" : "AI receptionist active",
      ],
    },
    messages: msgs,
  };
}
