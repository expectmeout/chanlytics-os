/**
 * The Inbox's thread view model: the shape the thread and its row draw (`InboxThreadVM`). Types only; the
 * mapping that builds it is inbox-thread.ts.
 */
import type { ReplyWhyVM } from "../config/brain";
import type { MediaVM } from "./message-media";

/* ---- Inbox ThreadVM (Blueprint §7): escalations + conversations mapped into
   the mockup's thread shape. Fed fields only — approvals/confidence/$ are
   v1.1 and never fabricated. ---- */

export interface InboxThreadVM {
  id: string;
  real: true;
  conversationId: string;
  /** The contact behind the thread — where "Open client" goes now that People is real. */
  clientId: string | null;
  escalationId: string | null;
  windowOpen: boolean;
  /** The customer asked to stop receiving messages. Stronger than a closed
   *  24h window: an approved template can't reach them either. */
  optedOut: boolean;
  /** They said yes to offers, so a promotional template may go to them: the composer offers only what can send (I4). */
  offersOk: boolean;
  /** The owner's proposal link for this person (00154), or null: the header's Actions put it in the reply. */
  proposalUrl: string | null;
  who: string;
  whoMeta: string;
  avatar: string;
  state: "escalated" | "snoozed" | "done";
  takenOver: boolean;
  /** A teammate has this thread: the page names them and offers no take-over. */
  claimedByOther: boolean;
  /** Who has it, when someone does -- the page names them from the team. */
  assigneeUserId: string | null;
  /**
   * The customer's own words beside the decision: what they last wrote, quoted,
   * or what the call left behind for a call back. Null when nothing is being decided.
   * `kind` says which: a call back's is the thread's own sentence (`summary`), so the
   * band does not say it again beneath; the row and its search still read `text`.
   */
  ask: { kind: "call" | "wrote" | "sent"; label: string; text: string; quoted: boolean } | null;
  /** Archived: closed, not handled. The pane says so, and that a new message brings it back. */
  archived: boolean;
  /**
   * A quiet thread's one line: who had the last word, in the words Conversations uses, and whether a reply
   * didn't send. Null unless the thread is Handled and not archived. Every quiet thread read "Answered by the
   * receptionist — no one asked for you", over a customer who wrote last and a reply that never left (I1).
   */
  lastWord: { text: string; tone: "ok" | "plain" | "warn" | "danger"; short: string | null } | null;
  /**
   * This thread is waiting on a human, and no human has it yet.
   *
   * THE definition of "needs you", emitted once. It was previously re-derived
   * in the Inbox JSX and separately approximated by /metrics' escalations_open,
   * which Today then dispatched over the top of the Inbox's number to "correct"
   * it — two rules that disagree whenever an escalation is open on a thread
   * someone has already claimed, racing to write the same badge.
   */
  needsYou: boolean;
  /**
   * The receptionist's reply, written and waiting out its veto window.
   *
   * Lifted to the thread so the pane can offer the controls without scanning
   * the timeline for them — and so "is there still something I can stop?" is a
   * single truthy check rather than a search that could miss.
   */
  heldDraft: { messageId: string; body: string; sendsAtMs: number } | null;
  /**
   * The SAME shape the mockup's VetoBar and Composer already read.
   *
   * The design for this existed before the backend did — a countdown, Edit /
   * Hold / Take over, and a composer pre-filled with the draft. Mapping the
   * real held reply onto it means the feature arrives as the product was
   * drawn, rather than as a second control that looks nothing like it.
   *
   * `endsAtMs` is the SERVER's deadline. The mockup runs its own countdown in
   * VW_STORE and fabricates the send at zero; on a real thread the job fires
   * server-side and the UI only reports what is already true.
   */
  veto?: { window: number; draft: string; endsAtMs: number; messageId: string; why?: ReplyWhyVM };
  /** The channels the thread has actually used: "whatsapp", "phone", or both. */
  channels: string[];
  primaryChannel: "whatsapp" | "phone" | "sms" | "email";
  /** That channel in the words a reply box names it by: "WhatsApp", "Text", "Email". One map, so a new wire is one entry and not a ternary per screen. */
  replyVia: string;
  /** A WhatsApp thread exists. False for a caller who has only ever phoned: no reply window, phone verbs. */
  hasChat: boolean;
  /** The number to call back, E.164, when known. */
  phone: string | null;
  /** That number as people read it, "+1 (917) 555-0106": the composer said "+19175550106" under a header that did not (I4). */
  phoneDisplay: string | null;
  /** How long the request has waited, in the one family every surface reads ("57m", "2h"). */
  waited?: string;
  /** Who answers, by name and glyph -- and nothing it was never given: an autonomy line and a voice were written into every thread, and the rail said them. */
  agent: { name: string; glyph: string };
  /** Why a person is needed, as the list's row says it: the reason's label, or empty when nobody is. */
  subject: string;
  /** The last thing that happened: the newest message that came in or reached them, never a draft. */
  preview: string;
  summary: string;
  lastAt: string;
  lastAtFull: string;
  /** Absolute times, epoch ms, for anything that must not drift with the
   *  clock — the bell keys its read state on them. */
  lastAtMs: number;
  escalatedAtMs?: number;
  unread: boolean;
  pinned: false;
  value?: number; // omitted: no revenue model on real threads (v1.1)
  tags: string[];
  confidence?: number; // omitted: the mockup renders a verdict word from this
  priority: "P2";
  waitingMin?: number;
  wake?: string;
  timeline: Array<
    | {
        type: "msg";
        from: "client" | "agent";
        channel: string;
        at: string;
        body: string;
        /** An email's subject line; absent on every other wire. */
        subject?: string;
        /** The chain an email quoted back at us, when it did: kept, and shown on a tap. */
        quoted?: string;
        /** What an email carried that is not shown: files whose names alone were kept, words past the bound (emailLeftOutOf). */
        leftOut?: string;
        /** The attachment, when the message is one. */
        media?: MediaVM;
        /** Why the receptionist said it, when the row remembers. */
        why?: ReplyWhyVM;
        byYou?: boolean;
        /** Who sent it, when a person or a run did, in the words Conversations uses: "your team", "a broadcast (…)". */
        byWords?: string;
        /** Sent by a broadcast, not typed: the name the owner gave it. */
        via?: { kind: "broadcast" | "playbook"; name: string };
        status?: string;
        /** "Didn't send", "Canceled before sending", "Read" (messageStatusLabel). */
        statusLabel?: string;
        /** False when these words never reached the customer: the page dashes them, as Conversations does. */
        reachedCustomer?: boolean;
        /** The message's own id, on every bubble: a call's note finds its call by it, and a link opens the thread there. */
        messageId?: string;
        /** Written but NOT sent — sitting out its veto window. */
        pending?: true;
        /** When it fires, epoch ms. Drives the countdown. */
        sendsAtMs?: number;
        /** Per-bubble attribution — a phone summary is not the WhatsApp agent. */
        agentName?: string;
        agentGlyph?: string;
      }
    | { type: "event"; kind: string; at: string; body: string }
  >;
}
