import { agoWords, DATE_FMT, DAY_MS } from "../shared/time";
/**
 * Channels — the numbers a business is reachable on, as facts.
 *
 * The mockup's Integrations pane listed seven "connected" services, six of
 * which do not exist. The real pane lists the rows in tenant_channels and
 * what the schema can say about each: which kind, which number, whether it
 * is switched on, and when a customer last used it.
 */
import { formatPhoneDisplay } from "../shared/phone";

export interface ChannelDto {
  id: string;
  kind: string;
  number_e164: string | null;
  status: string;
  created_at: string;
  /** Newest inbound on this channel: a WhatsApp message's channel_ts, or a
   *  call's started_at. Null when nobody has used it yet. */
  last_inbound_at: string | null;
  /** What WhatsApp has said about the number, from the channel row's config:
   *  the quality rating read at connection, the newest quality and limit
   *  webhooks, and when. All null until Meta has said something. */
  quality?: string | null;
  quality_event?: string | null;
  messaging_limit?: string | null;
  quality_at?: string | null;
}

/**
 * The row that speaks for a kind.
 *
 * A workspace can legitimately hold more than one row of a kind, and the way it
 * gets there is the escape from a line that stopped: `release` "switches off, never
 * deletes" the routing row so calls keep their history, so a released-then-rebought
 * number leaves a `disabled` voice row beside the new active one. Postgres row
 * order is unspecified, so a bare `.find(c => c.kind === kind)` picks arbitrarily
 * between them — and picking the disabled one made Setup say "your line is
 * switched off" about a line that was answering, drop `tryIt`, and bounce the owner
 * back onto Setup.
 *
 * `facts.ts` already resolved this correctly for the receptionist's own facts, and
 * `ensureVoiceAgent`, `line_forwarding_set` and `businessPageFor` all filter and
 * order too. This is that same rule where the two page-facing readers can share it.
 *
 * ACTIVE FIRST, then the oldest of them — deterministic, and the oldest active row
 * is the one every other resolver in this repo chooses. Falling back to any row of
 * the kind keeps "is there a row at all" answerable, which is what `present` means.
 */
export interface ChannelPickable {
  kind: string;
  /** `tenant_channels.status`. Absent on a shape that has already resolved it. */
  status?: string | null;
  /** The resolved form of the same fact, as `ChannelVM` carries it. */
  on?: boolean;
  created_at?: string | null;
}

const channelIsOn = (c: ChannelPickable): boolean =>
  typeof c.on === "boolean" ? c.on : (c.status ?? "active") === "active";

export function channelFor<T extends ChannelPickable>(rows: readonly T[], kind: string): T | null {
  const mine = rows.filter((c) => c.kind === kind);
  if (mine.length === 0) return null;
  const on = mine.filter(channelIsOn);
  const pool = on.length > 0 ? on : mine;
  return [...pool].sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""))[0] ?? pool[0];
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
  /** What WhatsApp has said about the number (the row's config), for numberHealth: null until Meta has said something. */
  quality: string | null;
  qualityEvent: string | null;
  messagingLimit: string | null;
  /** When the row was made. Carried so `channelFor` can break a tie the same way on
   *  either shape; the DTO has always had it. */
  created_at: string;
}

const QUIET_AFTER_MS = 7 * DAY_MS;

function ago(ms: number, nowMs: number): string {
  return agoWords(ms, nowMs, { dateAfterMs: QUIET_AFTER_MS, date: (at) => DATE_FMT.format(new Date(at)) });
}

/**
 * A wire, in the owner's words: the one place a `tenant_channels.kind` (or
 * email, which has no row there) becomes a word for a sentence. Today's chips,
 * its count, its alert and its proof rows read it, so no page can print "sms".
 *
 * Three maps look like this one and answer different questions, deliberately:
 * `REPORT_CHANNELS` (reports.ts) labels a MEASUREMENT ("Calls", not "Phone
 * line"); `THREAD_CHANNEL_WORDS` (thread-channel.ts) and `PERSON_CHANNEL_WORDS`
 * (people.ts) label what a MESSAGE arrived on; the Connections titles name the
 * product ("WhatsApp Business"). This one names the wire.
 */
export const CHANNEL_KIND_WORDS: Record<string, string> = {
  whatsapp: "WhatsApp",
  voice: "Phone line",
  sms: "Texting",
  email: "Email",
  instagram: "Instagram",
};

/** The word for a wire; an unknown kind is capitalised rather than shouted as a column value. */
export function channelKindWords(kind: string): string {
  return CHANNEL_KIND_WORDS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
}

/**
 * The wires the receptionist answers on by itself. Email is not one: every
 * email waits for a person (mailbox.ts EMAIL_NOT_ANSWERED_SENTENCE, and
 * setup.ts's `answering`, which counts WhatsApp and the phone line only).
 * When the receptionist learns to draft email, this is the line that changes.
 */
export const CHANNEL_ANSWERED: ReadonlySet<string> = new Set(["whatsapp", "voice", "sms"]);

const KIND_META: Record<string, { name: string; what: string; icon: ChannelVM["icon"]; noun: string }> = {
  whatsapp: {
    name: `${CHANNEL_KIND_WORDS.whatsapp} Business`,
    what: "Customers text this number; the receptionist answers",
    icon: "chat",
    noun: "message",
  },
  voice: {
    name: CHANNEL_KIND_WORDS.voice,
    what: "Customers call this number; the receptionist picks up",
    icon: "phone",
    noun: "call",
  },
  sms: { name: CHANNEL_KIND_WORDS.sms, what: "Text messages", icon: "chat", noun: "message" },
  email: { name: CHANNEL_KIND_WORDS.email, what: "Email", icon: "mail", noun: "email" },
  instagram: { name: CHANNEL_KIND_WORDS.instagram, what: "Direct messages", icon: "instagram", noun: "message" },
};

export function toChannelVM(dto: ChannelDto, now = new Date()): ChannelVM {
  const nowMs = now.getTime();
  const meta = KIND_META[dto.kind] ?? {
    name: channelKindWords(dto.kind),
    what: "",
    icon: "chat" as const,
    noun: "message",
  };
  const last = dto.last_inbound_at ? new Date(dto.last_inbound_at).getTime() : null;
  const on = dto.status === "active";
  let health: ChannelHealth;
  let healthLabel: string;
  if (!on) {
    // What the code does with a switched-off channel, not what a kinder
    // product would: the control plane routes nothing to it (routing.ts), so
    // a text is neither answered nor recorded and the platform is told
    // (alertUnroutable) -- and a call is picked up by the receptionist with
    // no facts to answer with and is not recorded. This sentence said the
    // opposite of both until 12 Sep 2026.
    health = "off";
    healthLabel =
      dto.kind === "voice"
        ? "Switched off — calls are picked up without your facts and are not recorded; Chanlytics is told, you are not"
        : `Switched off — ${meta.noun}s to it are neither answered nor recorded; Chanlytics is told they are arriving, you are not`;
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
    quality: dto.quality ?? null,
    qualityEvent: dto.quality_event ?? null,
    messagingLimit: dto.messaging_limit ?? null,
    created_at: dto.created_at,
  };
}
