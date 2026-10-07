/**
 * ThreadPane — the conversation, wherever it opens (moved from pages/thread-pane.jsx, decision 0015;
 * docs/plans/2026-09-21-one-thread.md).
 *
 * The Inbox drew a conversation with InboxThread and Conversations drew the same one with CvViewer: two headers, two
 * sets of bubbles, two sets of actions. Every fix landed once -- #746 split an email's quoted chain in one of them and
 * the other printed it in full -- and the second screen could not act: "View thread in Inbox" opened the first. This
 * is the one. Given a thread it draws InboxThread and owns the verbs a real thread has. There are two, and both go to
 * the server: the verb, and the hold on a draft counting down (thread-verbs.tsx). A real thread keeps no state in the
 * page -- the verb goes out and the surface:inbox re-read repaints -- so the pane moves no state; it is code both tabs
 * run. The mockup's seeded threads keep the Inbox's own handlers, which the Inbox passes in as `mock`.
 */
import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { EmptyState } from "../../kit/empty/empty";
import { useSurface } from "../../use-surface";
import { TICK_MS } from "../constants";
import { ixAnswerer } from "../answerer";
import { ixDraftKey, ixHeld, ixReadAgain } from "../rules";
import { canDo, presenceAway, useToast, type Flash } from "../shell";
import { inboxData, OWN_VERBS, VW_STORE } from "../store";
import { InboxThread, type InboxThreadProps } from "./thread";
import { threadVerbs } from "./thread-verbs";
import type { RealThread, Thread } from "../types";
import { refreshInbox } from "../verbs";

// ---- A draft counting down, by its own record ----

// Seconds left on a real draft's countdown, to the server's own deadline; none when there is no draft or it is held.
const tpVetoLeft = (t: Thread | null | undefined, nowMs: number = Date.now()): number | null => {
  if (!t || !t.real || !t.veto) return null;
  if (ixHeld(VW_STORE.state, t)) return null;
  return Math.max(0, Math.ceil(((t.veto.endsAtMs ?? NaN) - nowMs) / 1000));
};

// ---- What changed on the open thread between two reads ----

// What changed on the open thread between two reads, in the words the pane shows. The Inbox is
// read again whenever anything moves, and each read used to repaint the open thread in silence.
const IX_BUCKET_WORDS: Record<string, string> = { escalated: "Needs you", done: "Handled", snoozed: "Snoozed" };
export const ixRepaintNotice = (
  before: Thread | null | undefined,
  after: Thread | null | undefined,
  answerer: string | null = null,
): string | null => {
  if (!before || !after || before.id !== after.id) return null;
  if (!before.claimedByOther && after.claimedByOther) return `${answerer || "A teammate"} took this conversation`;
  if (before.state !== after.state || !!before.archived !== !!after.archived) {
    if (after.archived) return "Archived";
    if (after.state === "snoozed") return after.wake ? `Snoozed until ${after.wake}` : "Snoozed";
    if (before.state === "snoozed" && after.state === "escalated") return "Back in Needs you";
    return `Moved to ${IX_BUCKET_WORDS[after.state] || after.state}`;
  }
  const was = (before.timeline || []).length;
  const now = (after.timeline || []).length;
  if (now > was && (after.lastAtMs || 0) > (before.lastAtMs || 0)) {
    const last = after.timeline[now - 1];
    if (last && last.type === "msg" && last.from === "client") return `${after.who} wrote again`;
    return last && last.type === "msg" && last.byYou ? "Someone on the team replied" : "The receptionist replied";
  }
  return null;
};

// ---- The pane ----

/** The threads the Inbox holds. */
const store = () => inboxData().THREADS || [];

/** What a re-read did to the open thread, said on it: kept against its id, so it never shows over another one. */
interface Repaint {
  threadId: string;
  words: string;
}

// A re-read: draw the thread as it now is, and say what happened to it -- unless it was your own act.
function hearInbox(shownRef: { current: Thread | null }, setRepaint: (r: Repaint) => void, redraw: () => void) {
  const onSwap = () => {
    const shown = shownRef.current;
    const next = shown && shown.real ? store().find((x) => x.id === shown.id) : null;
    if (shown && next && OWN_VERBS.n === 0) {
      const words = ixRepaintNotice(shown, next, ixAnswerer(next));
      if (words) setRepaint({ threadId: shown.id, words });
    }
    redraw();
  };
  window.addEventListener("surface:inbox", onSwap);
  return () => window.removeEventListener("surface:inbox", onSwap);
}

// Alone, the pane keeps its own draft's countdown and looks again at zero. Inside the Inbox, the list's tick draws
// it and the list looks again for every thread it holds.
function tickCountdown(shownRef: { current: Thread | null }, redraw: () => void) {
  const tick = () => {
    const cur = shownRef.current;
    if (cur && cur.real && cur.veto && Date.now() >= (cur.veto.endsAtMs ?? NaN)) {
      const st = VW_STORE.state[ixDraftKey(cur)] || (VW_STORE.state[ixDraftKey(cur)] = {});
      if (!st.held && ixReadAgain(st, Date.now())) void refreshInbox();
    }
    redraw();
  };
  const iv = window.setInterval(tick, TICK_MS);
  window.addEventListener("presence:changed", redraw);
  return () => {
    window.clearInterval(iv);
    window.removeEventListener("presence:changed", redraw);
  };
}

/** What the Inbox hands the pane to draw a thread: the thread, or the id of one a Conversations row carries. */
interface ThreadPaneProps {
  /** The one the Inbox holds (a seeded one carries the mockup's overlays). */
  thread?: Thread | null;
  /** The one a Conversations row carries, found in the Inbox's store -- every workspace surface boots together, and the Inbox reads the same GET conversations page Conversations lists. */
  threadId?: string | null;
  onBack?: (() => void) | null;
  onOpenClient?: (clientId: string | null | undefined) => void;
  notice?: ReactNode;
  /** The host's toast; alone, the pane keeps its own stack. */
  flash?: ((flash: Flash) => void) | null;
  /** The Inbox's own handlers for a seeded thread, which only the mockup reaches. */
  mock?: Partial<InboxThreadProps> | null;
  /** The message it opens at instead of its newest -- a call, opened from Conversations. */
  focusMessageId?: string | null;
}

/** Asked for by id before the Inbox's read has it: say it is on its way, and open nobody else's in its place. */
function opening() {
  return (
    <div className="ix-thread-pane tp-opening" data-testid="tp-opening">
      <EmptyState
        kind="page"
        glyph="chat"
        title="Opening this conversation…"
        body="It shows here as soon as it has been read."
        action={{ label: "Read it again", onClick: () => void refreshInbox() }}
      />
    </div>
  );
}

/** A real thread: InboxThread with the two verbs, and the role first, for every one. */
function realThread(
  p: ThreadPaneProps & {
    t: RealThread;
    say: (flash: Flash) => void;
    labels: Record<string, string>;
    words: ReactNode;
    redraw: () => void;
    ownToast: ReactNode;
  },
) {
  const {
    t,
    say,
    labels,
    words,
    redraw,
    ownToast,
    onBack = null,
    onOpenClient = () => {},
    flash = null,
    focusMessageId = null,
  } = p;
  const { verb, hold } = threadVerbs(say);
  const can = () => canDo("approve");
  return (
    <>
      {!flash && ownToast}
      <InboxThread
        thread={t}
        onBack={onBack}
        channelLabels={labels}
        onOpenClient={onOpenClient}
        notice={words}
        focusMessageId={focusMessageId}
        veto={tpVetoLeft(t)}
        vetoPaused={presenceAway()}
        onVetoAct={(_id, act) => hold(t, act, redraw)}
        // The role first, for every verb: a real thread's hand-back used to skip the check and reach the server.
        onDecide={(_id, action) => {
          if (can() && action === "__HANDBACK__")
            void verb(t, "hand-back", undefined, "cleared — the receptionist is answering again");
        }}
        onSnooze={() => {
          if (can() && t.state !== "snoozed") void verb(t, "snooze", {}, "snoozed until tomorrow 10:00");
        }}
        onWake={() => {
          if (can() && t.state === "snoozed") void verb(t, "wake", {}, "awake — back in the queue");
        }}
        onTakeOver={() => {
          if (can()) void verb(t, "take-over", undefined, "you have it — the receptionist is paused");
        }}
        onHandBack={() => {
          if (can() && t.takenOver) void verb(t, "hand-back", undefined, "handed back — the receptionist resumes");
        }}
        onArchive={() => {
          if (can()) void verb(t, "archive", {}, "archived");
        }}
        onSend={(_id, text) => {
          if (!can()) return undefined;
          return text && typeof text === "object" && text.template
            ? // Forward the CHOSEN template: a hardcoded booking_link_v1/en_US was right for one workspace and a
              // guaranteed server rejection for every other.
              verb(
                t,
                "reply-template",
                typeof text.template === "object" ? { template: text.template } : undefined,
                typeof text.template === "object" ? `${text.template.name} on its way` : "booking link on its way",
                true,
              )
            : verb(t, "reply", { text: typeof text === "string" ? text : "" }, "reply on its way", true);
        }}
      />
    </>
  );
}

export const ThreadPane = (props: ThreadPaneProps) => {
  const {
    thread: given = null,
    threadId = null,
    onBack = null,
    onOpenClient = () => {},
    notice = null,
    flash = null,
    mock = null,
  } = props;
  const [ownToast, ownFlash] = useToast();
  const say = flash || ownFlash;
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // What a re-read did to the open thread, said on it -- kept against its id, so it never shows over another one.
  const [repaint, setRepaint] = useState<Repaint | null>(null); // { threadId, words }
  const shownRef = useRef<Thread | null>(null);
  const t = given || (threadId ? store().find((x) => x.id === threadId) : null) || null;
  shownRef.current = t;
  const standalone = !given;

  useEffect(() => hearInbox(shownRef, setRepaint, redraw), []);
  // A call's card reads the calls Conversations holds (thread/call.tsx tlCallFor): drawn again when they are read.
  useSurface("conversations");

  // Alone, the pane keeps its own draft's countdown and looks again at zero. Inside the Inbox, the list's tick draws
  // it and the list looks again for every thread it holds.
  const live = !!(standalone && t && t.real && t.veto);
  const liveId = live ? t.id : null;
  useEffect(() => (live ? tickCountdown(shownRef, redraw) : undefined), [live, liveId]);

  const labels = inboxData().CHANNEL_LABELS || {};
  if (!t) {
    // An empty bucket in the Inbox: the thread's own empty state.
    if (!threadId) return <InboxThread thread={null} onBack={onBack} channelLabels={labels} {...(mock || {})} />;
    return opening();
  }

  // Your notice first (a link's "isn't among the newest"), then what a re-read did to this thread.
  const words = notice || (repaint && repaint.threadId === t.id ? repaint.words : null);
  if (!t.real) {
    // The mockup's seeded thread, drawn as the Inbox always drew it.
    return (
      <InboxThread
        thread={t}
        onBack={onBack}
        channelLabels={labels}
        onOpenClient={onOpenClient}
        notice={words}
        {...(mock || {})}
      />
    );
  }

  return realThread({ ...props, t, say, labels, words, redraw, ownToast });
};
