/**
 * Broadcasts: one approved template to the people who said yes.
 *
 * The first honest campaign. Everything a broadcast may do is decided here,
 * once, and executed by execution-tested code on both sides: the route that
 * enrols the recipients and the job that sends to them use the same
 * predicate for "may this person receive an offer", the same renderer for
 * the words, and the same pacing constants.
 *
 * What a broadcast is NOT: a message to people who have not said yes. The
 * category of the template (marketing, utility) changes Meta's price and its
 * rules, never ours — a proactive message needs the customer's recorded yes
 * whatever the template is called.
 */
import { PEOPLE_LISTS, type PersonRowVM } from "./people";

export const BROADCAST_STATES = ["scheduled", "sending", "sent", "canceled", "failed"] as const;
export type BroadcastState = (typeof BROADCAST_STATES)[number];

export const RECIPIENT_STATES = ["queued", "sent", "skipped", "failed"] as const;
export type RecipientState = (typeof RECIPIENT_STATES)[number];

export const BROADCAST_STATE_LABELS: Record<BroadcastState, string> = {
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  canceled: "Canceled",
  failed: "Failed",
};

/** How many go in one job, and the breath between two sends. */
export const BROADCAST_CHUNK = 25;
export const BROADCAST_GAP_MS = 300;
/** More than this is not a salon's list; it is a mistake. */
export const BROADCAST_MAX_RECIPIENTS = 2000;
/** Meta's ceiling for one body parameter. */
export const BROADCAST_PARAM_MAX = 1024;
export const BROADCAST_SCHEDULE_MAX_DAYS = 30;
export const BROADCAST_NAME_MAX = 80;

export type AudienceKind = "everyone" | "list" | "saved";
export const AUDIENCE_KINDS: readonly AudienceKind[] = ["everyone", "list", "saved"];

export interface Audience {
  kind: AudienceKind;
  /** A People list id (kind "list") or a saved list id (kind "saved"). */
  id: string | null;
  label: string;
}

export const EVERYONE_LABEL = "Everyone who said yes";

/** The one predicate: a recorded yes, no do-not-contact, and a number to send to. */
export function mayReceiveOffers(r: Pick<PersonRowVM, "consent" | "phone">): boolean {
  return r.consent.state === "opted_in" && !r.consent.dnc && !!r.phone;
}

/**
 * The people a broadcast may reach: the audience crossed with mayReceiveOffers.
 * The route enrols exactly these; the page shows exactly these counts.
 */
export function eligibleFor(
  rows: PersonRowVM[],
  kind: AudienceKind,
  id: string | null | undefined,
  savedIds: ReadonlySet<string> | null,
): PersonRowVM[] {
  let pool: PersonRowVM[] = rows;
  if (kind === "list") {
    const l = PEOPLE_LISTS.find((x) => x.id === id);
    if (!l) return [];
    pool = rows.filter(l.test);
  } else if (kind === "saved") {
    if (!savedIds) return [];
    pool = rows.filter((r) => savedIds.has(r.id));
  }
  return pool.filter(mayReceiveOffers);
}

/** The words a person will read: the body with its numbered slots filled. */
export function renderTemplate(body: string | null | undefined, params: readonly string[]): string {
  return String(body ?? "").replace(/\{\{(\d+)\}\}/g, (m, n: string) => {
    const v = params[Number(n) - 1];
    return typeof v === "string" && v !== "" ? v : m;
  });
}

/**
 * One body value as Meta will accept it: trimmed, no line breaks or tabs, no
 * run of four spaces, under the ceiling. Null means "not acceptable".
 */
export function cleanParam(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || v.length > BROADCAST_PARAM_MAX) return null;
  if (/[\n\r\t]/.test(v) || /\s{4,}/.test(v)) return null;
  return v;
}

/** A name when the owner gave none: the template and the day. */
export function broadcastName(templateName: string, now = new Date()): string {
  const day = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${templateName.replace(/_/g, " ")} · ${day}`.slice(0, BROADCAST_NAME_MAX);
}

export interface BroadcastCounts {
  queued: number;
  sent: number;
  skipped: number;
  failed: number;
  delivered: number;
  read: number;
  replied: number;
}

export interface BroadcastDto {
  id: string;
  name: string;
  template_id: string;
  template_name: string;
  template_language: string;
  params: string[];
  audience: Audience;
  state: BroadcastState;
  scheduled_for: string;
  started_at: string | null;
  finished_at: string | null;
  recipient_count: number;
  failure: string | null;
  created_at: string;
  counts: BroadcastCounts;
}

export interface BroadcastVM extends BroadcastDto {
  stateLabel: string;
  /** "today 9:00 AM" / "Sep 12 · 10:00 AM". */
  when: string;
  /** Delivered or read, over sent. Null until something was sent. */
  deliveredPct: number | null;
  readPct: number | null;
  /** Still to come: scheduled or sending. */
  open: boolean;
  /** Sent + skipped + failed over enrolled, for the sending row. */
  progress: number;
}

export function whenLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `today ${time}`;
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${time}`;
}

export function toBroadcastVM(d: BroadcastDto, now = new Date()): BroadcastVM {
  const c = d.counts;
  const attempted = c.sent + c.skipped + c.failed;
  return {
    ...d,
    stateLabel: BROADCAST_STATE_LABELS[d.state] ?? d.state,
    when: whenLabel(d.finished_at ?? d.started_at ?? d.scheduled_for, now),
    deliveredPct: c.sent > 0 ? Math.round((c.delivered / c.sent) * 100) : null,
    readPct: c.sent > 0 ? Math.round((c.read / c.sent) * 100) : null,
    open: d.state === "scheduled" || d.state === "sending",
    progress: d.recipient_count > 0 ? Math.min(1, attempted / d.recipient_count) : 0,
  };
}

/** The reasons a person is held back at the wire, in the owner's words. */
export const HELD_REASONS: Record<string, string> = {
  opted_out: "asked to stop",
  not_opted_in: "no recorded yes",
  no_phone: "no number",
  human_has_it: "a person had the thread",
  erased: "deleted",
  send_failed: "WhatsApp refused",
};

/* ---- The number's health: what WhatsApp has said about it, and what that permits ---- */

/** Meta's messaging-limit tiers: business-initiated conversations in a rolling day. */
export const LIMIT_TIERS: Record<string, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY,
};

export function dailyLimit(tier: string | null | undefined): number | null {
  if (!tier) return null;
  const n = LIMIT_TIERS[String(tier).toUpperCase()];
  return typeof n === "number" ? n : null;
}

export interface NumberHealthInput {
  /** Meta's quality rating as read at connection: GREEN, YELLOW, RED, UNKNOWN. */
  quality: string | null | undefined;
  /** The newest quality webhook: FLAGGED, UNFLAGGED, DOWNGRADE, UPGRADE. */
  event: string | null | undefined;
  /** The newest messaging limit webhook: TIER_250 and the like. */
  limit: string | null | undefined;
}

export interface NumberHealth {
  canSend: boolean;
  tone: "ok" | "warn" | "danger" | "unknown";
  label: string;
  limitPerDay: number | null;
  refusal: string | null;
}

/**
 * The one reading of a number's health. A flagged or red number cannot
 * broadcast: sending more marketing on it risks the number itself. Anything
 * Meta has not reported is said so, never assumed good or bad.
 */
export function numberHealth(n: NumberHealthInput): NumberHealth {
  const q = String(n.quality ?? "").toUpperCase();
  const ev = String(n.event ?? "").toUpperCase();
  const limit = dailyLimit(n.limit);
  const limitWords = limit === null
    ? "daily limit not reported yet"
    : limit === Number.POSITIVE_INFINITY ? "no daily limit" : `up to ${limit.toLocaleString("en-US")} new conversations a day`;
  if (q === "RED" || ev === "FLAGGED") {
    return { canSend: false, tone: "danger", limitPerDay: limit, label: `WhatsApp flagged this number's quality · ${limitWords}`, refusal: "WhatsApp flagged this number's quality. Sending more marketing now risks the number; wait for it to recover." };
  }
  if (q === "YELLOW" || ev === "DOWNGRADE") return { canSend: true, tone: "warn", limitPerDay: limit, label: `Number quality: medium · ${limitWords}`, refusal: null };
  if (q === "GREEN" || ev === "UNFLAGGED" || ev === "UPGRADE") return { canSend: true, tone: "ok", limitPerDay: limit, label: `Number quality: good · ${limitWords}`, refusal: null };
  return { canSend: true, tone: "unknown", limitPerDay: limit, label: `Number quality not reported yet · ${limitWords}`, refusal: null };
}

/** Null when the audience fits the day's limit; otherwise the refusal, with the numbers. */
export function overLimitRefusal(h: NumberHealth, audience: number): string | null {
  if (h.limitPerDay === null || audience <= h.limitPerDay) return null;
  return `This number can start up to ${h.limitPerDay.toLocaleString("en-US")} new conversations a day; this audience is ${audience.toLocaleString("en-US")}. Send to a smaller list or split it.`;
}

/* ---- One broadcast's people ---- */

export interface BroadcastRecipientDto {
  contact_id: string;
  name: string;
  phone: string | null;
  state: RecipientState;
  /** Why they were held back or not reached, as the job recorded it. */
  reason: string | null;
  sent_at: string | null;
  /** The message's status from WhatsApp's receipts: sent, delivered, read, failed. */
  message_status: string | null;
  conversation_id: string | null;
  /** Their thread heard from them after the broadcast reached them. */
  replied: boolean;
}

export interface BroadcastDetailDto {
  broadcast: BroadcastDto;
  recipients: BroadcastRecipientDto[];
}
