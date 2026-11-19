/**
 * The Inbox's session stores, typed (moved from data/inbox-data.jsx, decision 0015, step 3): the decisions a session made
 * on seeded threads (`IX_STORE`), the countdown of each seeded draft (`VW_STORE`, with the rules that seed, read and hold
 * it, `VW_UTIL`), and what a page reads of the two surfaces' rows (`inboxData`, `conversationsData`).
 *
 * `IX_STORE` is shared by the Inbox's pages and the count of what needs you (needs-you.ts). The veto store has no reader
 * beyond the Inbox.
 */
import { INBOX_BUCKET_WORDS } from "@chanlytics/contracts";
import { surfaceValue } from "../surface-values";
import type { ConversationsSurface, InboxBucket, InboxSurface, Thread } from "./types";

/* ------------------------------ what the surfaces hold ------------------------------ */

/**
 * The Inbox's three tabs, one question each (Ruben, 19 Nov 2026, decision 0142): yours to do, someone else's move or a
 * clock's, and nobody's; in its tabs' words (contracts INBOX_BUCKET_WORDS). Snoozed had a tab that stood empty most days
 * and stands in Waiting, which it is; what a reading set aside as not a customer's is a fold at Handled's head
 * (pages/inbox-list.tsx asideFold), no tab to keep an eye on.
 */
export const REAL_BUCKETS: InboxBucket[] = [
  {
    id: "escalated",
    label: INBOX_BUCKET_WORDS.escalated,
    hint: "Yours to do: someone asked for a person, nobody answered them, or a reply didn't send",
    icon: "flag",
    accent: true,
  },
  {
    id: "waiting",
    label: INBOX_BUCKET_WORDS.waiting,
    hint: "The next move is theirs, a teammate's, or a snooze's: your follow-up list",
    icon: "users",
  },
  {
    id: "done",
    label: INBOX_BUCKET_WORDS.done,
    hint: "Answered, closed or gone quiet: nothing for you to do",
    icon: "check",
  },
];

/** The wires a real thread travels, as the Inbox's rows name them. */
export const REAL_CHANNEL_LABELS: Readonly<Record<string, string>> = {
  whatsapp: "WhatsApp",
  phone: "Phone",
  sms: "Text",
  email: "Email",
};

/**
 * The Inbox before its first read lands, and while a read that failed is not answered yet: no thread, under its own lists.
 * The demo's seeded threads were this, in every workspace, from boot until the read (the wiring's second audit, X6-1), and
 * went with demo mode (16 Nov 2026).
 */
const UNREAD_INBOX: InboxSurface = {
  INBOX_BUCKETS: REAL_BUCKETS,
  INBOX_VIEWS: [],
  THREADS: [],
  CHANNEL_LABELS: REAL_CHANNEL_LABELS,
  INBOX_BASELINE: { doneThisWeek: 0 },
};

/** Conversations the same way: no row, and the one tab every workspace has (conversations-surface.ts conversationTabs). */
const UNREAD_CONVERSATIONS: ConversationsSurface = { CONVERSATIONS: [], CV_CHANNELS: [{ id: "all", label: "All" }] };

/** The Inbox's rows and words: what the last read published; before it, no thread. */
export function inboxData(): InboxSurface {
  return surfaceValue("inbox") ?? UNREAD_INBOX;
}

/** Conversations' rows: what the last read published; before it, no row. */
export function conversationsData(): ConversationsSurface {
  return surfaceValue("conversations") ?? UNREAD_CONVERSATIONS;
}

/* ------------------------------ session decisions ------------------------------ */

/** A decision made on a seeded thread: what was chosen, when, and whether it was a decline or a snooze. */
export interface Decision {
  action: string;
  at: string;
  declined?: boolean;
  kind: "decided" | "snoozed";
  wake?: string;
  param?: string | null;
}

/**
 * Shared across Inbox, Tasks and the shell badge. Decisions made anywhere overlay the seeded threads for the rest of the
 * session and broadcast `inbox:decisions` (something changed, draw again): the badge is a selector over the threads and
 * these decisions, not a number sent.
 */
export const IX_STORE = {
  decisions: {} as Record<string, Decision>,
  _broadcast() {
    window.dispatchEvent(new CustomEvent("inbox:decisions"));
  },
  set(threadId: string, rec: Decision) {
    this.decisions[threadId] = rec;
    this._broadcast();
  },
  clear(threadId: string) {
    delete this.decisions[threadId];
    this._broadcast();
  },
  get(threadId: string): Decision | null {
    return this.decisions[threadId] || null;
  },
};

/* --------------------------- the veto window's countdowns --------------------------- */

/** One draft's countdown: when it goes out, or the milliseconds left while frozen; held or sent, it counts no more. */
export interface VetoState {
  endsAt?: number;
  frozen?: number;
  held?: boolean;
  sent?: boolean;
  /** A real draft let go now (Send now): it reads as going until the send reaches the tab. */
  going?: boolean;
  /** A real draft's reads at zero: how many, and when the last was (thread-pane.tsx `ixReadAgain`). */
  tries?: number;
  lastTry?: number;
}

/** Per-draft countdown state, by the draft's key (a seeded thread's id, or a real draft's `draft:<messageId>`). */
export const VW_STORE: { state: Record<string, VetoState> } = { state: {} };

/**
 * Veto-window helpers (shared: the Inbox strip and Today's rail). The presence rule (Away freezes every countdown) lives
 * here so it applies on every surface, not just when the Inbox is mounted.
 */
export const VW_UTIL = {
  store() {
    return VW_STORE;
  },
  seed(threads: Thread[] | null | undefined) {
    const VW = this.store();
    (threads || []).forEach((t) => {
      // Real threads are skipped: their countdown belongs to a scheduled job, and this store simulates one. Seeding both
      // would put two clocks on the same draft, disagreeing about when the customer hears from us.
      if (t.real) return;
      // A seeded countdown renders frozen and never auto-sends: the demo that ran it went with demo mode (16 Nov 2026).
      if (t.veto && !VW.state[t.id] && !IX_STORE.get(t.id)) VW.state[t.id] = { frozen: (t.veto.window || 30) * 1000 };
    });
  },
  remaining(id: string): number | null {
    const s = this.store().state[id];
    if (!s || s.held || s.sent) return null;
    if (s.frozen != null) return Math.ceil(s.frozen / 1000);
    if (!s.endsAt) return null;
    return Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000));
  },
  holdAll(ids: string[] | null | undefined) {
    const VW = this.store();
    (ids || []).forEach((id) => {
      const s = VW.state[id] || (VW.state[id] = {});
      if (!s.sent) s.held = true;
    });
  },
};

/**
 * Presence, Take transfers (moved from legacy/components/data-bits.jsx, the one-system plan's step 2): phone agents check
 * it before warm-transferring. Away forces the holding line; the top bar's switch for it went with demo mode (16 Nov 2026).
 * Published as `PR_STORE` for the Inbox's shell, which reads it there.
 */
export interface PresenceStore {
  away: boolean;
  transfers: boolean;
  reachable(): boolean;
  _emit(): void;
  setAway(v: boolean): void;
  setTransfers(v: boolean): void;
}

/** A presence store as the JSX made it: Available, transfers allowed. */
export function makePresenceStore(): PresenceStore {
  return {
    away: false,
    transfers: true,
    reachable() {
      return !this.away;
    },
    _emit() {
      window.dispatchEvent(
        new CustomEvent("presence:changed", { detail: { away: this.away, transfers: this.transfers } }),
      );
    },
    setAway(v) {
      this.away = v;
      this._emit();
    },
    setTransfers(v) {
      this.transfers = v;
      this._emit();
    },
  };
}

/* ------------------------------- your own verbs in flight ------------------------------- */

/**
 * Your own verbs in flight, counted across every pane and the Inbox's bulk acts: the re-read each one makes is not news
 * for the pane, whose toast has already said what happened.
 */
export const OWN_VERBS = { n: 0 };
