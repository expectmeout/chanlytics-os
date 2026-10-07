/**
 * The demo's Inbox and Conversations: the mockup's seeded threads (a refund waiting on a call, a partnership, a booking
 * conflict, two drafts counting down, a verdict after a consult), its buckets and saved views, the one thread that
 * changes while it is read, and the calls and chats Conversations lists. Moved whole from data/inbox-data.jsx and
 * data/conversations-data.jsx (decision 0015, step 3), where the mockup kept them for one shared global scope.
 *
 * A demo session draws these through the one Inbox there is; a real workspace draws none of them (its threads are the
 * bridge's, surface.ts), and a page that has not moved yet still reads them off `window.INBOX_DATA` and
 * `window.CONVERSATIONS_DATA`, which legacy-globals.ts publishes.
 */
import type { InboxBucket, InboxSurface, InboxView, TimelineEntry } from "./types";
import { conversationsSample } from "./sample/conversations";
import { NEEDING_YOU } from "./sample/threads-needing-you";
import { WATCHING } from "./sample/threads-watching";

const INBOX_BUCKETS: InboxBucket[] = [
  { id: "needs", label: "Needs my call", hint: "Approvals queued", icon: "alert", accent: true, count: 4 },
  { id: "watching", label: "Watching", hint: "Agents handling, you're cc'd", icon: "eye", count: 12 },
  { id: "drafts", label: "Drafts", hint: "Replies prepared, not sent", icon: "edit", count: 4 },
  { id: "escalated", label: "Escalated", hint: "Agent asked for help", icon: "flag", count: 1 },
  { id: "snoozed", label: "Snoozed", hint: "Come back later", icon: "clock", count: 7 },
  { id: "done", label: "Done", hint: "Resolved this week", icon: "check", count: 48 },
];

const INBOX_VIEWS: InboxView[] = [
  { id: "vip", label: "VIP clients", icon: "star", count: 4 },
  { id: "at-risk", label: "At-risk revenue", icon: "alert", count: 2 },
  { id: "high-conf", label: "High-confidence approvals", icon: "sparkle", count: 7 },
  { id: "new-leads", label: "New leads today", icon: "plus", count: 9 },
];

export const SEED_THREADS = [...NEEDING_YOU, ...WATCHING];

const CHANNEL_LABELS: Record<string, string> = {
  phone: "Phone",
  sms: "SMS",
  mail: "Email",
  chat: "Chat",
  instagram: "Instagram",
};

/** Scripted concurrent change: one thread mutates while you read it, to show the stale-view reconcile (no real-time backend in this build). */
export const IX_CONCURRENT: Record<string, { afterMs: number; by: string; note: string; append: TimelineEntry[] }> = {
  "th-noah-nurture": {
    afterMs: 11000,
    by: "Noah Williams",
    note: "replied to the nurture email",
    append: [
      { type: "event", kind: "opened", at: "12:03", body: "Reply received while you were reading" },
      {
        type: "msg",
        from: "client",
        channel: "mail",
        at: "12:04",
        body: "Actually — do you have anything Saturday morning? Been meaning to come back in.",
      },
    ],
  },
};

/** Resolved before the visible list. */
const INBOX_BASELINE = { doneThisWeek: 48 };

/** The one an Inbox draws in a demo session, and what a page that has not moved reads as `window.INBOX_DATA` until a real read replaces it. */
export const inboxSample: InboxSurface = {
  INBOX_BASELINE,
  INBOX_BUCKETS,
  INBOX_VIEWS,
  THREADS: SEED_THREADS,
  CHANNEL_LABELS,
};

export { conversationsSample };
