/**
 * The Inbox's session stores, typed (moved from data/inbox-data.jsx, decision 0015, step 3): the decisions a session made
 * on seeded threads (`IX_STORE`), the countdown of each seeded draft (`VW_STORE`, with the rules that seed, read and hold
 * it, `VW_UTIL`), and what a page reads of the two surfaces' rows (`inboxData`, `conversationsData`).
 *
 * `IX_STORE` is shared: the sidebar's badge, the top bar's bell, Today and the demo's pages read it. It is published once,
 * under its old name, for the pages that have not moved (legacy-globals.ts). The veto store has no reader beyond the
 * Inbox, and is not published.
 */
import { INBOX_BUCKET_WORDS } from "@chanlytics/contracts";
import { surfaceValue } from "../surface-values";
import { presenceAway, demoSession } from "./shell";
import type { ConversationsSurface, InboxBucket, InboxSurface, Thread } from "./types";

/* ------------------------------ what the surfaces hold ------------------------------ */

/** The only lists real threads can reach (the Blueprint's honesty rule), in its tabs' words (contracts INBOX_BUCKET_WORDS). */
export const REAL_BUCKETS: InboxBucket[] = [
  {
    id: "escalated",
    label: INBOX_BUCKET_WORDS.escalated,
    hint: "The receptionist stopped and asked for a human",
    icon: "flag",
    accent: true,
  },
  {
    id: "done",
    label: INBOX_BUCKET_WORDS.done,
    hint: "Answered by the receptionist, or a teammate has it — nothing for you to do",
    icon: "check",
  },
  { id: "snoozed", label: INBOX_BUCKET_WORDS.snoozed, hint: "Hidden until they wake", icon: "clock" },
];

/** The wires a real thread travels, as the Inbox's rows name them. */
export const REAL_CHANNEL_LABELS: Readonly<Record<string, string>> = {
  whatsapp: "WhatsApp",
  phone: "Phone",
  sms: "Text",
  email: "Email",
};

/**
 * A real session's Inbox before its first read lands, and while a read that failed is not answered yet: no thread, under its
 * own lists. The demo's seeded threads are a demo session's alone (the wiring's second audit, X6-1): they were this, in every
 * workspace, from boot until the read, and only the route gate and a mismatch of ids kept an invented customer off a page.
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

/**
 * The demo's seeded rows (sample.ts), held here once a module that draws them has loaded them: a page of the Inbox's
 * imports them, and sample.ts hands them over as it is evaluated. Imported here, every session's first load carried a
 * demo's threads and calls that only a demo draws (the loadability review, 19 Oct 2026).
 */
let seeded: { inbox: InboxSurface; conversations: ConversationsSurface } | null = null;

/** The demo's seeded rows, held for the two reads below (sample.ts). */
export function holdDemoSeed(inbox: InboxSurface, conversations: ConversationsSurface): void {
  seeded = { inbox, conversations };
}

/** The Inbox's rows and words: what the last read published; before it, the demo's seed in a demo, else no thread. */
export function inboxData(): InboxSurface {
  return surfaceValue("inbox") ?? (demoSession() && seeded ? seeded.inbox : UNREAD_INBOX);
}

/** Conversations' rows: what the last read published; before it, the demo's seed in a demo, else no row. */
export function conversationsData(): ConversationsSurface {
  return surfaceValue("conversations") ?? (demoSession() && seeded ? seeded.conversations : UNREAD_CONVERSATIONS);
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
 * session and broadcast `inbox:decisions` (something changed, draw again), which the count of what needs you hears in a demo
 * session (needs-you.ts): the badge is a selector over the threads and these decisions, not a number sent.
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
      if (t.veto && !VW.state[t.id] && !IX_STORE.get(t.id)) {
        VW.state[t.id] =
          !demoSession() || presenceAway()
            ? { frozen: (t.veto.window || 30) * 1000 } // outside demo: countdowns render frozen, never auto-send
            : { endsAt: Date.now() + (t.veto.window || 30) * 1000 };
      }
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
  onPresence() {
    const away = presenceAway();
    Object.values(this.store().state).forEach((s) => {
      if (s.held || s.sent) return;
      if (away && s.endsAt) {
        s.frozen = Math.max(0, s.endsAt - Date.now());
        delete s.endsAt;
      } else if (!away && s.frozen != null) {
        s.endsAt = Date.now() + s.frozen;
        delete s.frozen;
      }
    });
  },
};

/**
 * Freeze and thaw the countdowns as the member goes Away and comes back; once, when the surfaces start. Away is the demo's:
 * its control is drawn only in a demo session (frame/topbar/topbar.tsx), and the countdowns it freezes are the seeded threads', so a real
 * session registers no listener at all.
 */
export function hearPresence(): () => void {
  if (!demoSession()) return () => {};
  const onChange = () => VW_UTIL.onPresence();
  window.addEventListener("presence:changed", onChange);
  return () => window.removeEventListener("presence:changed", onChange);
}

/**
 * Presence, Take transfers (moved from legacy/components/data-bits.jsx, the one-system plan's step 2): phone agents check
 * it before warm-transferring. Away is a manual switch the top bar holds in a demo session: it freezes the veto timers and
 * forces the holding line. Published as `PR_STORE` for the top bar and the Inbox's shell, which read it there.
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
