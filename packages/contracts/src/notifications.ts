import { agoShort as spanAgo } from "./time";
/**
 * The bell: what needs the owner, from what the browser already holds.
 *
 * The seeded bell promised five things to read that never happened, and a
 * real session showed nothing. The feed here is built from the rows the
 * surfaces have already fetched — the Inbox threads, the Live calls, the open
 * invitations — so it costs no request and is exactly as fresh as the pages
 * around it. Read state is per device (the bridge keeps it in localStorage):
 * honest, and enough until a person has more than one phone.
 *
 * Pure: the bridge feeds it the globals, the tests feed it fixtures.
 */

export type NotificationKind = "needs_you" | "held_draft" | "missed_call" | "invite" | ServerNotificationKind;

export interface NotificationItem {
  /** Stable across refreshes: the row it stands for. */
  key: string;
  kind: NotificationKind;
  /** When it became true, epoch ms. */
  at: number;
  title: string;
  message: string;
  /** Hash route, without the leading "#/". */
  to: string;
  icon: string;
  tone: "" | "ok" | "warn";
  /** The button under it. */
  action: string;
  /** What a kept row is about, when the edge said: a conversation, a call, a broadcast. */
  about?: { type: string; id: string } | null;
}

/** The slice of the Inbox thread view-model the feed reads. */
export interface FeedThread {
  id: string;
  real?: boolean;
  needsYou?: boolean;
  who: string;
  preview?: string;
  waitingMin?: number;
  /** Absolute times, when the view-model carries them. */
  lastAtMs?: number;
  escalatedAtMs?: number;
  veto?: { window: number; endsAtMs: number; messageId: string; draft: string; why?: { heldFor?: string | null; summary?: string } };
}

/** The slice of the Live call view-model the feed reads. */
export interface FeedCall {
  callId: string;
  cvId: string;
  who: string;
  number?: string | null;
  missed: boolean;
  live: boolean;
  startedAtMs: number | null;
}

export interface FeedInvite {
  id: string;
  email: string;
  created_at: string;
}

export interface FeedInput {
  threads?: FeedThread[] | null;
  calls?: FeedCall[] | null;
  invites?: FeedInvite[] | null;
  now: number;
}

const DAY_MS = 24 * 3600 * 1000;

/** Everything that needs the owner right now, newest first. */
export function buildNotificationFeed(input: FeedInput): NotificationItem[] {
  const { now } = input;
  const items: NotificationItem[] = [];

  for (const t of input.threads ?? []) {
    if (!t.real) continue;
    if (t.needsYou) {
      // An absolute moment, never "minutes ago" from the clock: a time derived
      // from `now` drifts forward on every read and undoes Mark all read.
      const at = t.escalatedAtMs ?? (typeof t.waitingMin === "number" ? now - t.waitingMin * 60_000 : t.lastAtMs ?? now);
      items.push({
        key: `needs:${t.id}`,
        kind: "needs_you",
        at,
        title: `${t.who} needs you`,
        message: t.preview ? `They wrote: “${t.preview}”` : "Flagged for a person.",
        to: `inbox/${t.id}`,
        icon: "inbox",
        tone: "warn",
        action: "Open in Inbox",
      });
    }
    if (t.veto && t.veto.endsAtMs > now) {
      const held = t.veto.why?.heldFor === "low_confidence" ? "Not sure enough to send alone" : "Waiting in the hold window";
      items.push({
        key: `draft:${t.veto.messageId}`,
        kind: "held_draft",
        at: t.veto.endsAtMs - t.veto.window * 1000,
        title: `A reply to ${t.who} is waiting for you`,
        message: `${held} · “${t.veto.draft.slice(0, 90)}${t.veto.draft.length > 90 ? "…" : ""}”`,
        to: `inbox/${t.id}`,
        icon: "clock",
        tone: "",
        action: "Review",
      });
    }
  }

  for (const c of input.calls ?? []) {
    if (!c.missed || c.live || typeof c.startedAtMs !== "number") continue;
    if (now - c.startedAtMs > DAY_MS) continue;
    items.push({
      key: `call:${c.callId}`,
      kind: "missed_call",
      at: c.startedAtMs,
      title: `Missed call · ${c.who}`,
      message: c.number ? `${c.number} — the call never connected.` : "The call never connected.",
      to: `conversations/${c.cvId}`,
      icon: "phone",
      tone: "warn",
      action: "See the call",
    });
  }

  for (const i of input.invites ?? []) {
    const at = Date.parse(i.created_at);
    items.push({
      key: `invite:${i.id}`,
      kind: "invite",
      at: Number.isNaN(at) ? now : at,
      title: `Invitation pending · ${i.email}`,
      message: "They have not accepted yet.",
      to: "admin/workspace",
      icon: "users",
      tone: "",
      action: "Team",
    });
  }

  return items.sort((a, b) => b.at - a.at);
}

/** What one device remembers about the bell. */
export interface NotificationReadState {
  /** "Mark all read" moves this; opening the bell does not, so "New" stays new until the owner says so. */
  seenAt: number;
  read: string[];
  dismissed: string[];
  /** Device alerts while the app is in the background. */
  alerts: boolean;
}

export const EMPTY_READ_STATE: NotificationReadState = { seenAt: 0, read: [], dismissed: [], alerts: false };

export interface NotificationRow extends NotificationItem {
  unread: boolean;
}

/** The feed as a device sees it: dismissed rows gone, unread decided. */
export function applyReadState(items: NotificationItem[], state: NotificationReadState): NotificationRow[] {
  const read = new Set(state.read);
  const gone = new Set(state.dismissed);
  return items
    .filter((i) => !gone.has(i.key))
    .map((i) => ({ ...i, unread: i.at > state.seenAt && !read.has(i.key) }));
}

/** "now", "5m", "2h", "3d" — the bell's clock (the Inbox has its own `ago`). */
/** The bell's time: one family with every other surface (time.ts). */
export function agoLabel(atMs: number, now: number): string {
  return spanAgo(atMs, now);
}

/** The kinds a device is woken for; an invitation can wait for the bell. */
export const ALERT_KINDS: readonly NotificationKind[] = ["needs_you", "held_draft", "missed_call"];

/* ------------------------------------------------- rows the workspace keeps */

/** What the edge writes when it raises an alert: the same kinds it emails. */
export const SERVER_NOTIFICATION_KINDS = ["handoff", "deadman", "call", "number", "sweep", "job_failed", "playbook", "calendar_people", "alert"] as const;
export type ServerNotificationKind = (typeof SERVER_NOTIFICATION_KINDS)[number];

export interface NotificationDto {
  id: string;
  kind: string;
  title: string;
  body: string;
  /** A hash route without the leading "#/", or null. */
  route: string | null;
  subject_type: string | null;
  subject_id: string | null;
  created_at: string;
  /** This person's marks. */
  read: boolean;
  dismissed: boolean;
}

/** What `GET /api/v1/notifications` returns: the month's rows and this person's "seen everything" moment. */
export interface NotificationsDto {
  notifications: NotificationDto[];
  seen_at: string | null;
}

const SERVER_LOOK: Record<string, { icon: string; tone: "" | "ok" | "warn"; action: string; to: string }> = {
  handoff: { icon: "alert", tone: "warn", action: "Open the Inbox", to: "inbox" },
  deadman: { icon: "alert", tone: "warn", action: "Open the Inbox", to: "inbox" },
  call: { icon: "phone", tone: "", action: "Open the calls", to: "conversations/phone" },
  number: { icon: "shield", tone: "warn", action: "Open Integrations", to: "admin/integrations" },
  sweep: { icon: "alert", tone: "warn", action: "Open Integrations", to: "admin/integrations" },
  job_failed: { icon: "alert", tone: "warn", action: "Open the Inbox", to: "inbox" },
  playbook: { icon: "bolt", tone: "ok", action: "Open Playbooks", to: "outbound" },
  calendar_people: { icon: "users", tone: "ok", action: "Open People", to: "clients" },
  alert: { icon: "bell", tone: "", action: "Open Today", to: "today" },
};

/** A kept row's key on the bell, so the bridge can tell it from a derived one. */
export const SERVER_KEY_PREFIX = "n:";

/**
 * The kept rows as the bell shows them: dismissed ones gone, unread decided
 * by the person's seen moment and their own read mark — the same on every
 * device, because both live on the server.
 */
export function serverNotificationRows(dto: NotificationsDto | null | undefined): NotificationRow[] {
  if (!dto) return [];
  const seen = dto.seen_at ? Date.parse(dto.seen_at) : 0;
  return dto.notifications
    .filter((n) => !n.dismissed)
    .map((n) => {
      const look = SERVER_LOOK[n.kind] ?? SERVER_LOOK.alert;
      const at = Date.parse(n.created_at);
      return {
        key: `${SERVER_KEY_PREFIX}${n.id}`,
        kind: (SERVER_NOTIFICATION_KINDS as readonly string[]).includes(n.kind) ? (n.kind as NotificationKind) : "alert",
        at,
        title: n.title,
        message: n.body.split("\n").find((l) => l.trim())?.trim().slice(0, 160) ?? "",
        to: n.route ?? look.to,
        icon: look.icon,
        tone: look.tone,
        action: look.action,
        unread: at > seen && !n.read,
        about: n.subject_type && n.subject_id ? { type: n.subject_type, id: n.subject_id } : null,
      };
    });
}

/**
 * One row per thing. A derived "needs you" row and the kept handoff (or
 * call-back) row for the same conversation said the same thing twice, in two
 * voices. While the derived row stands, the kept one about that conversation
 * is not shown; once the thread is answered the derived row goes and the kept
 * row remains as the record.
 */
export function dedupeFeed(rows: NotificationRow[]): NotificationRow[] {
  const covered = new Set(rows.filter((r) => r.kind === "needs_you" && r.key.startsWith("needs:th-")).map((r) => r.key.slice("needs:th-".length)));
  return rows.filter((r) => !(r.key.startsWith(SERVER_KEY_PREFIX) && r.about?.type === "conversation" && covered.has(r.about.id)));
}
