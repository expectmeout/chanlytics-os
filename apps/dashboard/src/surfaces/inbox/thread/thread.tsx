/**
 * The Inbox's thread pane (moved from pages/inbox-thread.jsx, decision 0015): the conversation, wherever it opens.
 *
 * Inbox Thread Pane — perfectionist refinement.
 * New structure:
 *   1. Header (compact — name, channels, actions)
 *   2. Context strip (4 micro-facts the operator wants at a glance)
 *   3. Approval card v2 (only if needs/drafts) — $ impact strip, evidence expander, next-steps row
 *   4. Narrative summary (1-line story)
 *   5. Timeline (softer agent bubbles)
 *   6. Composer (right-anchored, Approve & Send combo)
 *
 * The pane is a function per part, called by `InboxThread` and not drawn as a component of its own, so the tree is the
 * tree it was; its hooks stay in `InboxThread`, in the order they were. The parts are beside it in this folder:
 * header, status, approval, timeline, call, who, composer and veto.
 */
import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from "react";
import { Confirm } from "../../kit/confirm/confirm";
import { EmptyState } from "../../kit/empty/empty";
import { ReplyStrip } from "./reply-strip";
import { touchSwipe } from "../shell";
import { repliesDoor } from "./shell-thread";
import type { Approval, Thread, TimelineEntry as TlEntry, VerdictOption } from "../types";
import { ApprovalCard, ContextStrip, hasVerdict, NarrativeSummary, VerdictCard, type DecideExtra } from "./approval";
import { Composer, type OnSend } from "./composer";
import { ThreadHeader } from "./header";
import { ThreadBar, ThreadStatus, type Stale, type StatusProps } from "./status";
import { TimelineEntry } from "./timeline";

// The newest thing said in a thread: its last message, written or a call. A flag after it is not something said.
const ixNewestSaid = (timeline: TlEntry[] | null | undefined) => {
  const tl = timeline || [];
  for (let i = tl.length - 1; i >= 0; i--) if (tl[i].type === "msg") return i;
  return -1;
};

// Where a real thread opens: at the message it was opened at (a call, from Conversations), or where a call began when a
// call is the newest thing said -- its lines are below it, and play is the next thing to press -- else at its newest
// message (null).
export const ixOpensAt = (thread: Thread | null | undefined, focusMessageId: string | null = null) => {
  if (focusMessageId) return focusMessageId;
  const tl = (thread && thread.timeline) || [];
  const i = ixNewestSaid(tl);
  const at = tl[i];
  return thread && thread.real && i >= 0 && at && at.type === "msg" && at.channel === "phone" && at.messageId
    ? at.messageId
    : null;
};

// The phone's width, where a thread is the screen and Back is its list (mobile.css, 720px).
const ixPhone = () => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);
// While a thumb carries a thread away, its list is drawn under it (components.css, data-going on the page's grid).
const ixGoing = (el: Element | null, on: boolean) => {
  const host = el && el.parentElement;
  if (host && host.toggleAttribute) host.toggleAttribute("data-going", !!on);
};
// A thread on a phone goes back to its list under the thumb, as Back does: swiped right, it follows the finger and the
// list shows under it (data-bits touchSwipe). Nothing without a Back, and nothing wider than a phone.
export const ixSwipeBack = (onBack: (() => void) | null | undefined): HTMLAttributes<HTMLDivElement> =>
  (onBack ? touchSwipe({ onBack, when: ixPhone, onGrab: ixGoing }) : null) ?? {};

/** What the pane asks of its page: the thread, and what to do with each press. */
export interface InboxThreadProps {
  thread: Thread | null;
  onBack?: (() => void) | null;
  channelLabels: Record<string, string>;
  veto?: number | null;
  vetoPaused?: boolean;
  onVetoAct?: (threadId: string, act: string) => void;
  onVerdict?: (threadId: string, option: VerdictOption) => void;
  stale?: Stale | null;
  onReconcile?: () => void;
  onDismissStale?: () => void;
  onOpenClient?: (clientId: string | null | undefined) => void;
  onDecide?: (threadId: string, action: string, extra?: DecideExtra) => void;
  onSnooze?: (threadId: string) => void;
  onSend?: OnSend;
  onTakeOver?: (threadId: string) => void;
  onWake?: (threadId: string) => void;
  onHandBack?: (threadId: string) => void;
  onMarkUnread?: (threadId: string) => void;
  onArchive?: ((threadId: string) => void) | null;
  planParam?: number;
  onPlanParam?: (i: number) => void;
  notice?: ReactNode;
  focusMessageId?: string | null;
}

/** The props with what the page did without each: its Back none, its handlers nothing, its countdown unread. */
function withDefaults(props: InboxThreadProps) {
  const {
    thread,
    onBack = null,
    channelLabels,
    veto = null,
    vetoPaused = false,
    onVetoAct = () => {},
    onVerdict = () => {},
    stale = null,
    onReconcile = () => {},
    onDismissStale = () => {},
    onOpenClient = () => {},
    onDecide = () => {},
    onSnooze = () => {},
    onSend = () => {},
    onTakeOver = () => {},
    onWake = () => {},
    onHandBack = () => {},
    onMarkUnread = () => {},
    onArchive = null,
    planParam = 0,
    onPlanParam = () => {},
    notice = null,
    focusMessageId = null,
  } = props;
  return {
    thread,
    onBack,
    channelLabels,
    veto,
    vetoPaused,
    onVetoAct,
    onVerdict,
    stale,
    onReconcile,
    onDismissStale,
    onOpenClient,
    onDecide,
    onSnooze,
    onSend,
    onTakeOver,
    onWake,
    onHandBack,
    onMarkUnread,
    onArchive,
    planParam,
    onPlanParam,
    notice,
    focusMessageId,
  };
}
type Held = ReturnType<typeof withDefaults>;

/** What the pane keeps between draws to open a real thread at its newest message. */
interface EndRefs {
  thread: RefObject<Thread | null>;
  focus: RefObject<string | null>;
  stuck: RefObject<boolean>;
}

/**
 * A real thread opens at its newest message and stays with it as messages arrive, unless you have scrolled up to read.
 * Opened at a message -- a call, from Conversations -- or at the start of a call that is the newest thing said, it
 * opens there instead (ixOpensAt), once the pane has a size to scroll. The thread is read when the effect runs, which
 * is when it first arrives, not when the pane first drew. Answers what lets it go.
 */
function followTheEnd(el: HTMLElement, refs: EndRefs) {
  let aim = ixOpensAt(refs.thread.current, refs.focus.current);
  if (aim) refs.stuck.current = false;
  const toEnd = () => {
    if (aim) {
      if (!el.clientHeight) return;
      const at = el.querySelector(`[data-mid="${aim}"]`);
      aim = null;
      if (at) {
        el.scrollTop += at.getBoundingClientRect().top - el.getBoundingClientRect().top - 16;
        return;
      }
      refs.stuck.current = true; // not in this thread after all: its newest, as ever
    }
    if (refs.stuck.current) el.scrollTop = el.scrollHeight;
  };
  const onScroll = () => {
    refs.stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };
  toEnd();
  el.addEventListener("scroll", onScroll, { passive: true });
  // Shown (a phone opens the pane after it mounts) or grown (a photo lands): back to the end, if you were there.
  const seen = typeof ResizeObserver === "function" ? new ResizeObserver(toEnd) : null;
  if (seen) {
    seen.observe(el);
    if (el.lastElementChild) seen.observe(el.lastElementChild);
  }
  return () => {
    el.removeEventListener("scroll", onScroll);
    if (seen) seen.disconnect();
  };
}

/** Archive asks first: it closes the customer's request. */
function archiveAsk(p: Held, thread: Thread, setAskArchive: (v: boolean) => void) {
  const { onArchive } = p;
  return (
    onArchive && (
      <Confirm
        block
        question={`Archive ${thread.who}'s conversation?`}
        detail="It leaves the Inbox and their request is closed. If they write again, it comes back."
        yes="Yes, archive"
        no="Not now"
        onYes={() => {
          setAskArchive(false);
          onArchive(thread.id);
        }}
        onNo={() => setAskArchive(false)}
        testid="ix-archive"
      />
    )
  );
}

/** A real thread says a bubble's time once for a run of messages from one side in the same minute. */
const run = (a: TlEntry | undefined, b: TlEntry | undefined) =>
  !!a &&
  !!b &&
  a.type === "msg" &&
  b.type === "msg" &&
  a.from === b.from &&
  a.at === b.at &&
  a.channel === b.channel &&
  (a.agentName || "") === (b.agentName || "") &&
  !!a.byYou === !!b.byYou;

/** The conversation, entry by entry. */
function timelineRows(p: Held, thread: Thread, newestSaid: number, seenAt: number) {
  const { channelLabels, focusMessageId } = p;
  return thread.timeline.map((entry, i) => {
    // A real thread says a bubble's time once for a run of messages from one side in the same minute, and who
    // sent ours and what became of it on the run's last: every bubble had "WhatsApp · 4:24 PM" over it and
    // "by WhatsApp Receptionist · Read" under it, 79–127px apiece on a phone.
    const lines =
      thread.real && entry.type === "msg"
        ? { meta: !run(thread.timeline[i - 1], entry), by: !run(entry, thread.timeline[i + 1]) }
        : null;
    return (
      <TimelineEntry
        key={i}
        entry={entry}
        thread={thread}
        channelLabels={channelLabels}
        lines={lines}
        focus={!!focusMessageId && entry.type === "msg" && entry.messageId === focusMessageId}
        newest={i === newestSaid}
        arrived={!!thread.real && i >= seenAt}
      />
    );
  });
}

/** The pane's scroller: what a seeded thread's cards say over its story, then the story. */
function scrollBody(
  p: Held,
  thread: Thread,
  extra: { scrollRef: RefObject<HTMLDivElement | null>; statusProps: StatusProps; newestSaid: number; seenAt: number },
) {
  const { onVerdict, onDecide, planParam, onPlanParam } = p;
  const { scrollRef, statusProps, newestSaid, seenAt } = extra;
  const decided = statusProps.decided;
  return (
    <div className="ix-th-scroll" ref={scrollRef}>
      {!thread.real && <ThreadStatus {...statusProps} />}
      {hasVerdict(thread) && !decided && <VerdictCard thread={thread} onVerdict={onVerdict} />}

      {thread.approval && !decided && (
        <ApprovalCard
          thread={thread}
          approval={thread.approval}
          onDecide={onDecide}
          planParam={planParam}
          onPlanParam={onPlanParam}
        />
      )}

      <NarrativeSummary thread={thread} />

      <div className="ix-timeline">{timelineRows(p, thread, newestSaid, seenAt)}</div>
    </div>
  );
}

/** What the seeded card's composer opens with: the plan's chosen wording, else the agent's suggestion. */
const approvalReply = (approval: Approval, suggested: string, planParam: number) =>
  approval.plan && approval.plan.param ? (approval.plan.param.options || [])[planParam]?.reply || suggested : suggested;

/** The card's own reply box, while the card is undecided: the plan's wording (a parameter of the plan) or the suggestion. */
function approvalBox(p: Held, thread: Thread, decided: boolean) {
  const { onSend, planParam } = p;
  return (
    thread.approval?.suggestedReply &&
    !decided && (
      <Composer
        key={planParam}
        thread={thread}
        reply={approvalReply(thread.approval, thread.approval.suggestedReply, planParam)}
        hasApproval
        onSend={onSend}
      />
    )
  );
}

/** The thread's own reply box. */
function replyBox(p: Held, thread: Thread, decided: boolean) {
  const { onSend, onVetoAct } = p;
  const replies = repliesDoor();
  return (
    (!thread.approval || decided) &&
    (thread.real || thread.state !== "done") && (
      <Composer
        thread={thread}
        reply={thread.veto ? thread.veto.draft : replies ? replies.draftOf(thread.id) : ""}
        onType={thread.veto ? () => onVetoAct(thread.id, "type") : null}
        onSend={onSend}
      />
    )
  );
}

export const InboxThread = (props: InboxThreadProps) => {
  const held = withDefaults(props);
  const { thread, onBack, channelLabels, onOpenClient, onSnooze, onMarkUnread, notice, focusMessageId } = held;
  const { stale, onReconcile, onDismissStale, onWake, onTakeOver, onDecide, onHandBack, veto, vetoPaused, onVetoAct } =
    held;
  // Archive asks first: it closes the customer's request. Above the early return, so the hooks keep their order.
  const [askArchive, setAskArchive] = useState(false);
  // A real thread opens at its newest message and stays with it as messages arrive, unless you have scrolled up to
  // read: it opened at the oldest, and on a phone the words you were answering were two scrolls down. Above the early
  // return, so the hooks keep their order.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stuckRef = useRef(true);
  // How many entries the thread opened with: one that arrives while it is open rises into place (tl-arrived), and the
  // ones it opened with are simply there.
  const seenRef = useRef<{ id: string | null; n: number }>({ id: null, n: 0 });
  // Opened at a message -- a call, from Conversations -- or at the start of a call that is the newest thing said, it
  // opens there instead (ixOpensAt), once the pane has a size to scroll. The thread is read when the effect runs, which
  // is when it first arrives, not when the pane first drew.
  const focusRef = useRef<string | null>(focusMessageId);
  const threadRef = useRef<Thread | null>(thread);
  threadRef.current = thread;
  const real = !!(thread && thread.real);
  const entries = thread && thread.timeline ? thread.timeline.length : 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (!real || !el) return undefined;
    return followTheEnd(el, { thread: threadRef, focus: focusRef, stuck: stuckRef });
  }, [real]);
  useEffect(() => {
    const el = scrollRef.current;
    if (real && el && stuckRef.current) el.scrollTop = el.scrollHeight;
  }, [real, entries]);
  if (!thread) return <InboxEmpty />;

  const decided = !!thread.resolution;
  const newestSaid = ixNewestSaid(thread.timeline);
  const statusProps: StatusProps = {
    thread,
    decided,
    stale,
    onReconcile,
    onDismissStale,
    onWake,
    onTakeOver,
    onDecide,
    onHandBack,
    veto,
    vetoPaused,
    onVetoAct,
  };
  if (seenRef.current.id !== thread.id) seenRef.current = { id: thread.id, n: thread.timeline.length };
  const seenAt = Math.max(seenRef.current.n, thread.timeline.length - 3);

  return (
    // On a phone the thread is the screen, and a thumb carries it back to its list (ixSwipeBack).
    <div className="ix-thread-pane" {...ixSwipeBack(onBack)}>
      <ThreadHeader
        thread={thread}
        channelLabels={channelLabels}
        onOpenClient={onOpenClient}
        onSnooze={onSnooze}
        onMarkUnread={onMarkUnread}
        onBack={onBack}
        onArchive={thread.real && held.onArchive ? () => setAskArchive(true) : null}
      />
      {thread.real && <ThreadBar thread={thread} />}
      {askArchive && thread.real && archiveAsk(held, thread, setAskArchive)}
      <ContextStrip thread={thread} />
      {notice && (
        <div className="ix-notice" role="status">
          {notice}
        </div>
      )}

      {scrollBody(held, thread, { scrollRef, statusProps, newestSaid, seenAt })}
      {thread.real && (
        <div className="ix-th-status" data-testid="ix-th-status">
          <ThreadStatus {...statusProps} />
        </div>
      )}

      {approvalBox(held, thread, decided)}
      {/* P0: the mockup hid the composer on "done" ("decided, nothing left to do"). On real threads "handled" is the NORMAL
          resting state, so hiding it left the operator no way to follow up with their own customer. Real threads always get
          a reply path; the closed-window branch inside Composer downgrades it to approved templates past the 24h window.
          A reply to a reach-out, read, draws its strip above it, and the receptionist's draft seeds it (reply-strip.tsx). */}
      <ReplyStrip thread={thread} />
      {replyBox(held, thread, decided)}
    </div>
  );
};

// =============== EMPTY STATE ===============
const InboxEmpty = () => (
  <EmptyState
    kind="page"
    glyph="inbox"
    title="Inbox zero"
    body="The receptionist is handling everything. Anything that needs your call appears here."
    action={{ label: "See what it handled", to: "conversations" }}
    testid="inbox-empty"
  />
);
