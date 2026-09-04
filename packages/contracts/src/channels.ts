/**
 * Channels — the numbers a business is reachable on, as facts.
 *
 * The mockup's Integrations pane listed seven "connected" services, six of
 * which do not exist. The real pane lists the rows in tenant_channels and
 * what the schema can say about each: which kind, which number, whether it
 * is switched on, and when a customer last used it.
 */
import { formatPhoneDisplay } from "./phone";

export interface ChannelDto {
  id: string;
  kind: string;
  number_e164: string | null;
  status: string;
  created_at: string;
  /** Newest inbound on this channel: a WhatsApp message's channel_ts, or a
   *  call's started_at. Null when nobody has used it yet. */
  last_inbound_at: string | null;
}

export type ChannelHealth = "receiving" | "quiet" | "off" | "unused";

export interface ChannelVM {
  id: string;
  kind: string;
  /** "WhatsApp Business" / "Phone line" / the kind, capitalised. */
  name: string;
  /** What it does, in one line. */
  what: string;
  icon: "chat" | "phone" | "mail" | "instagram";
  number: string | null;
  on: boolean;
  health: ChannelHealth;
  /** "Receiving · last message 2h ago" and the like. */
  healthLabel: string;
  lastInboundMs: number | null;
}

const DAY_MS = 86_400_000;
const QUIET_AFTER_MS = 7 * DAY_MS;
const DATE_FMT = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });

function ago(ms: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - ms);
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < DAY_MS) return `${Math.round(diff / 3_600_000)}h ago`;
  if (diff < QUIET_AFTER_MS) return `${Math.round(diff / DAY_MS)}d ago`;
  return DATE_FMT.format(new Date(ms));
}

const KIND_META: Record<string, { name: string; what: string; icon: ChannelVM["icon"]; noun: string }> = {
  whatsapp: { name: "WhatsApp Business", what: "Customers text this number; the receptionist answers", icon: "chat", noun: "message" },
  voice: { name: "Phone line", what: "Customers call this number; the receptionist picks up", icon: "phone", noun: "call" },
  sms: { name: "SMS", what: "Text messages", icon: "chat", noun: "message" },
  email: { name: "Email", what: "Email", icon: "mail", noun: "email" },
  instagram: { name: "Instagram", what: "Direct messages", icon: "instagram", noun: "message" },
};

export function toChannelVM(dto: ChannelDto, now = new Date()): ChannelVM {
  const nowMs = now.getTime();
  const meta = KIND_META[dto.kind] ?? { name: dto.kind.charAt(0).toUpperCase() + dto.kind.slice(1), what: "", icon: "chat" as const, noun: "message" };
  const last = dto.last_inbound_at ? new Date(dto.last_inbound_at).getTime() : null;
  const on = dto.status === "active";
  let health: ChannelHealth;
  let healthLabel: string;
  if (!on) {
    health = "off";
    healthLabel = "Switched off — messages are recorded and you are emailed; the receptionist stays silent";
  } else if (last === null) {
    health = "unused";
    healthLabel = `On — no ${meta.noun} has arrived yet`;
  } else if (nowMs - last <= QUIET_AFTER_MS) {
    health = "receiving";
    healthLabel = `Receiving · last ${meta.noun} ${ago(last, nowMs)}`;
  } else {
    health = "quiet";
    healthLabel = `Quiet · last ${meta.noun} ${ago(last, nowMs)}`;
  }
  return {
    id: dto.id,
    kind: dto.kind,
    name: meta.name,
    what: meta.what,
    icon: meta.icon,
    number: formatPhoneDisplay(dto.number_e164),
    on,
    health,
    healthLabel,
    lastInboundMs: last,
  };
}
