/**
 * The Inbox's session stores, typed (moved from data/inbox-data.jsx, decision 0015, step 3): the decisions a session made
 * on seeded threads (`IX_STORE`), the countdown of each seeded draft (`VW_STORE`, with the rules that seed, read and hold
 * it, `VW_UTIL`), and what a page reads of the two surfaces' rows (`inboxData`, `conversationsData`).
 *
 * `IX_STORE` is shared: the sidebar's badge, the top bar's bell, Today and the demo's pages read it. It is published once,
 * under its old name, for the pages that have not moved (legacy-globals.ts). The veto store has no reader beyond the
 * Inbox, and is not published.
 */
import { surfaceValue } from "../surface-values";
import { presenceAway, demoSession } from "./shell";
import { conversationsSample, inboxSample, SEED_THREADS } from "./sample";
import type { ConversationsSurface, InboxSurface, Thread } from "./types";

/* ------------------------------ what the surfaces hold ------------------------------ */

/** The Inbox's rows and words: what the last read published, else the demo's seed (which is `window.INBOX_DATA` to the shell). */
export function inboxData(): InboxSurface {
  return surfaceValue("inbox") ?? inboxSample;
}

/** Conversations' rows: what the last read published, else the demo's seed (which is `window.CONVERSATIONS_DATA` to the shell). */
export function conversationsData(): ConversationsSurface {
  return surfaceValue("conversations") ?? conversationsSample;
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
 * session and broadcast two events: `inbox:decisions` (something changed, draw again) and `inbox:counts` ({ needs }, for
 * the sidebar badge).
 */
export const IX_STORE = {
  decisions: {} as Record<string, Decision>,
  _broadcast() {
    const needs = SEED_THREADS.filter((t) => t.state === "needs" && !this.decisions[t.id]).length;
    window.dispatchEvent(new CustomEvent("inbox:decisions"));
    window.dispatchEvent(new CustomEvent("inbox:counts", { detail: { needs } }));
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

/** Freeze and thaw the countdowns as the member goes Away and comes back; once, when the surfaces start. */
export function hearPresence(): () => void {
  const onChange = () => VW_UTIL.onPresence();
  window.addEventListener("presence:changed", onChange);
  return () => window.removeEventListener("presence:changed", onChange);
}

/* ------------------------------- your own verbs in flight ------------------------------- */

/**
 * Your own verbs in flight, counted across every pane and the Inbox's bulk acts: the re-read each one makes is not news
 * for the pane, whose toast has already said what happened.
 */
export const OWN_VERBS = { n: 0 };
