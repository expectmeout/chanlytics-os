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

export type NotificationKind = "needs_you" | "held_draft" | "missed_call" | "invite";

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
}

/** The slice of the Inbox thread view-model the feed reads. */
export interface FeedThread {
  id: string;
  real?: boolean;
  needsYou?: boolean;
  who: string;
  preview?: string;
  waitingMin?: number;
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
      const at = typeof t.waitingMin === "number" ? now - t.waitingMin * 60_000 : now;
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
export function agoLabel(atMs: number, now: number): string {
  const s = Math.max(0, Math.round((now - atMs) / 1000));
  if (s < 60) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** The kinds a device is woken for; an invitation can wait for the bell. */
export const ALERT_KINDS: readonly NotificationKind[] = ["needs_you", "held_draft", "missed_call"];
