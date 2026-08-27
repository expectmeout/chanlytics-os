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

const AGENT = { glyph: "W", name: "WhatsApp Receptionist" };

function shortTime(iso: string | null, now: Date): string {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function initialsOf(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} +]/gu, "").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const p = parts[0] || "?";
  return p.slice(0, 2).toUpperCase();
}

function messageText(m: MessageDto): string {
  if (m.body) return m.body;
  if (m.type === "media") {
    const kind = (m.meta && (m.meta.raw_type as string)) || "media";
    return `[${kind} attachment]`;
  }
  return `[${m.type}]`;
}

export function toConversationVM(dto: ConversationDto, now = new Date()): ConversationVM {
  const who =
    dto.contact.display_name ||
    dto.contact.wa_profile_name ||
    dto.contact.phone_e164 ||
    "Unknown";
  const msgs = dto.messages.map((m): ConversationMessageVM => ({
    from: m.sender === "customer" ? "client" : "agent",
    at: shortTime(m.created_at, now),
    text: messageText(m),
  }));
  const lastInbound = [...dto.messages].reverse().find((m) => m.sender === "customer");
  const last = dto.messages[dto.messages.length - 1];
  const paused = !!dto.paused_until && new Date(dto.paused_until) > now;
  const needsHuman = dto.state === "needs_human" || paused;
  return {
    id: dto.id,
    who,
    initials: initialsOf(who),
    clientId: null,
    channel: "whatsapp",
    agent: AGENT,
    at: shortTime(dto.last_message_at, now),
    outcome: needsHuman ? "escalated" : dto.state === "snoozed" ? "open" : "handled",
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
