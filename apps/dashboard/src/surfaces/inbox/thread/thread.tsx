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
import {
  MAILBOX_SENDERS_WORDS,
  RUN_OPEN_WORDS,
  runRoute,
  runsWaitingSentence,
  shortName,
  THREAD_PANE_WORDS,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { mayAtLeast } from "../../legacy-verbs";
import { personOnThread, useThreadPersonMoved } from "../../people/want-person";
import { carryNotAPerson } from "../carried-reply";
import { demoSession } from "../shell";
import { usePeopleMoved } from "./shell-thread";
import { EmptyState } from "../../kit/empty/empty";
import { useNeedsYouParts, waitingRunsNow } from "../../needs-you";
import { ReplyStrip } from "./reply-strip";
import { touchSwipe } from "../shell";
import { heldAlong, heldUnder, showHeld } from "../../kit/motion/held-list";
import { repliesDoor } from "./shell-thread";
import type { Approval, RealThread, Thread, TimelineEntry as TlEntry, VerdictOption } from "../types";
import { ApprovalCard, ContextStrip, hasVerdict, NarrativeSummary, VerdictCard, type DecideExtra } from "./approval";
import { Composer } from "./composer";
import type { OnSend } from "./send-words";
import { ThreadHeader } from "./header";
import { ThreadStatus, type Stale, type StatusProps } from "./status";
import { useEarlierAsScrolled } from "./earlier";
import { threadEnd, threadScroller, threadShown } from "./scroller";
import { isDocumentScroller, shownHeight } from "../../kit/motion/page-scroll";
import { TimelineEntry } from "./timeline";
import { hasVeto, SteerBox, VetoBar } from "./veto";

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
/** The page each thread a thumb is carrying was grabbed in (ixGoing). */
const goingHosts = new WeakMap<Element, Element>();
// While a thumb carries a thread away, its list is drawn under it (components.css, data-going on the page's grid), where
// it was left (kit/motion/held-list.ts showHeld: the list held under the thread, at the rows you opened it from). A
// thread let go past a third is let go of after it has left (kit/motion/swipe.ts swipeLeave closes it first), when it has no
// parent: the page it was grabbed in is kept from the grab, so the mark always comes off. It stayed on, and the next
// thread opened with its list drawn under it, the two showing through each other (Ruben, 17 Oct 2026), as the
// campaigns' split keeps its own (cmGoing). The same mark as a thread is pushed in over its list (the Inbox's and
// Conversations' arrival, kit/motion/held-list.ts).
export const ixGoing = (el: Element | null, on: boolean) => {
  if (!el) return;
  const host = el.parentElement ?? goingHosts.get(el) ?? null;
  if (!host) return;
  if (on) goingHosts.set(el, host);
  else goingHosts.delete(el);
  host.toggleAttribute("data-going", on);
  showHeld(on);
};
// A thread on a phone goes back to its list under the thumb, as Back does: swiped right, it follows the finger and the
// screen it goes back to comes in under it from a little to its left, the list and the frame's chrome over it as they
// stood (kit/motion/swipe.ts touchSwipe, kit/motion/held-list.ts). Nothing without a Back, and nothing wider than a phone.
export const ixSwipeBack = (onBack: (() => void) | null | undefined): HTMLAttributes<HTMLDivElement> =>
  (onBack
    ? touchSwipe({ onBack, when: ixPhone, onGrab: ixGoing, under: heldUnder, along: heldAlong, backNavigates: true })
    : null) ?? {};

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
  /**
   * What the pane says with no thread open: `zero` under Needs you, the Inbox's "Inbox zero"; `quiet` under any other
   * bucket or a saved view, an empty pane, since the list beside it says what is empty there in that bucket's words.
   */
  nothingOpen?: "zero" | "quiet";
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
 * is when it first arrives, not when the pane first drew. The conversation `el` scrolls itself on a desk, and the window
 * scrolls it on a phone (scroller.ts). Answers what lets it go.
 */
function followTheEnd(el: HTMLElement, refs: EndRefs) {
  const box = threadScroller(el);
  const windowScrolls = isDocumentScroller(box);
  let aim = ixOpensAt(refs.thread.current, refs.focus.current);
  if (aim) refs.stuck.current = false;
  const toEnd = () => {
    // Off the screen (not shown yet, or taken away with its observer not yet let go), it moves nothing: on a phone its box
    // is the window, and the list the thread went back to was pushed to its foot.
    if (!el.isConnected || !el.clientHeight) return;
    if (aim) {
      const at = el.querySelector(`[data-mid="${aim}"]`);
      aim = null;
      if (at) {
        box.scrollTop += at.getBoundingClientRect().top - threadShown(el, box).top - 16;
        return;
      }
      refs.stuck.current = true; // not in this thread after all: its newest, as ever
    }
    if (refs.stuck.current) box.scrollTop = threadEnd(box);
  };
  const onScroll = () => {
    refs.stuck.current = box.scrollHeight - box.scrollTop - shownHeight(box) < 40;
  };
  toEnd();
  const heard: EventTarget = windowScrolls ? window : el;
  heard.addEventListener("scroll", onScroll, { passive: true });
  // Shown (a phone opens the pane after it mounts) or grown (a photo lands): back to the end, if you were there. Where the
  // window scrolls it, the pane grows round it too: its foot, standing over the screen's foot (mobile.css).
  const seen = typeof ResizeObserver === "function" ? new ResizeObserver(toEnd) : null;
  if (seen) {
    seen.observe(el);
    if (el.lastElementChild) seen.observe(el.lastElementChild);
    if (windowScrolls && el.parentElement) seen.observe(el.parentElement);
  }
  return () => {
    heard.removeEventListener("scroll", onScroll);
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

/** What the rows are drawn by: the newest thing said, where the thread stood when it opened, and where its drawing starts. */
interface RowsAt {
  newestSaid: number;
  seenAt: number;
  /** The first entry drawn (earlier.ts): the ones before it are drawn as the mark before it is scrolled near. */
  from: number;
  moreRef: RefObject<HTMLDivElement | null>;
}

/** The conversation, entry by entry: all of it, or from `from` with the mark of what waits before it. */
/** The newest message before `i` in the thread: the one a bubble's day and side are read against. */
const msgBefore = (timeline: TlEntry[], i: number): TlEntry | undefined => {
  for (let j = i - 1; j >= 0; j--) {
    const e = timeline.at(j);
    if (e && e.type === "msg") return e;
  }
  return undefined;
};

/** Two bubbles from one side, on one wire and one day: a run, drawn close together (the phone canvas, D1). */
const sameSide = (a: TlEntry | undefined, b: TlEntry) =>
  !!a &&
  a.type === "msg" &&
  b.type === "msg" &&
  a.from === b.from &&
  !!a.byYou === !!b.byYou &&
  a.channel === b.channel &&
  a.day === b.day;

function timelineRows(p: Held, thread: Thread, at: RowsAt) {
  const { channelLabels, focusMessageId, onSend } = p;
  const { newestSaid, seenAt, from, moreRef } = at;
  // Our words that did not send, sent again as they were or put in the box (timeline.tsx): a real thread's, where words
  // can still go (the window open, no stop), never a seeded one's.
  const again =
    thread.real && thread.windowOpen !== false && !thread.optedOut
      ? {
          send: (text: string) => onSend(thread.id, text),
          edit: (text: string) =>
            window.dispatchEvent(new CustomEvent("inbox:focus-composer", { detail: { threadId: thread.id, text } })),
        }
      : null;
  // A real draft counting down: its countdown and its controls under its own bubble (heldDraftRow).
  const heldId = thread.real && !thread.resolution && hasVeto(thread) ? (thread.veto.messageId ?? null) : null;
  // The thread's subject heads its first email (contracts' emailSubjectsOf), where a chip in the header cut it to "What
  // Reddit's 202…" on a phone (the thread canvas, 1 Nov 2026).
  const firstEmail = thread.real ? thread.timeline.findIndex((e) => e.type === "msg" && e.channel === "email") : -1;
  const topic = thread.real ? (thread.emailSubject ?? null) : null;
  const rows = thread.timeline.slice(from).flatMap((entry, k) => {
    // Its place in the whole thread, which its key and its neighbours are read by.
    const i = from + k;
    const before = msgBefore(thread.timeline, i);
    // A real thread heads each day once, and each bubble says its own time and what became of it in its corner: every
    // bubble had "Sep 17 · 10:13 AM" over it and "by WhatsApp Receptionist · Why · Delivered" under it, 79–127px apiece
    // on a phone (the phone canvas, D1). A run of one side's bubbles stands close together.
    const lines = thread.real && entry.type === "msg" ? { meta: false, by: false, run: sameSide(before, entry) } : null;
    const day =
      thread.real &&
      entry.type === "msg" &&
      entry.day &&
      (!before || before.type !== "msg" || before.day !== entry.day) ? (
        <span key={`day-${i}`} className="tl-day" data-testid="tl-day">
          {entry.day}
        </span>
      ) : null;
    const held = heldId && entry.type === "msg" && entry.messageId === heldId ? heldDraftRow(p, thread, i) : null;
    const row = (
      <TimelineEntry
        key={i}
        entry={entry}
        thread={thread}
        channelLabels={channelLabels}
        topic={i === firstEmail ? topic : null}
        lines={lines}
        again={again}
        focus={!!focusMessageId && entry.type === "msg" && entry.messageId === focusMessageId}
        newest={i === newestSaid}
        arrived={!!thread.real && i >= seenAt}
      />
    );
    return [day, row, held].filter((n): n is NonNullable<typeof n> => !!n);
  });
  // A thread drawn whole is its rows and nothing else, as it always was.
  if (from <= 0) return rows;
  return [<div key="ix-earlier" className="ix-timeline-more" ref={moreRef} aria-hidden="true" />, ...rows];
}

/**
 * A real draft counting down, under its own bubble (the thread canvas, 1 Nov 2026): when it sends and the controls that
 * stop it, then the line that has the receptionist write it again. They stood in the foot, under a reply box filled with
 * the same words, so the draft was on the screen twice and its controls away from it.
 */
function heldDraftRow(p: Held, thread: Thread, i: number) {
  const { veto, vetoPaused, onVetoAct, onTakeOver } = p;
  if (!hasVeto(thread)) return null;
  return (
    <div key={`held-${i}`} className="ix-held-draft" data-testid="ix-held-draft">
      <VetoBar thread={thread} remaining={veto} paused={vetoPaused} onAct={onVetoAct} onTakeOver={onTakeOver} />
      {veto != null && thread.veto.messageId ? <SteerBox messageId={thread.veto.messageId} /> : null}
    </div>
  );
}

/** The pane's scroller: what a seeded thread's cards say over its story, then the story. */
function scrollBody(
  p: Held,
  thread: Thread,
  extra: { scrollRef: RefObject<HTMLDivElement | null>; statusProps: StatusProps; rowsAt: RowsAt },
) {
  const { onVerdict, onDecide, planParam, onPlanParam } = p;
  const { scrollRef, statusProps, rowsAt } = extra;
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

      {/* A thread whose own read is still out draws its conversation when it lands (read-apart.ts). */}
      {thread.real && thread.partial ? (
        <div className="ix-timeline" aria-busy="true" data-testid="ix-timeline-reading" />
      ) : (
        <div className="ix-timeline">{timelineRows(p, thread, rowsAt)}</div>
      )}
      {thread.real && !thread.partial && <FirstEmailAsk thread={thread} onOpenClient={p.onOpenClient} />}
    </div>
  );
}

/**
 * An owner's first email from someone, under the conversation (decision 0080): a newsletter, a notice or a pitch the
 * intake took for a person is said not to be one here, beside what it wrote, with the same act the header's More holds
 * (its page opens with Not a person asked, the typed name and all). It was the fourth item of a menu, owner-only and
 * nowhere near the email that needed it (the thread canvas, 1 Nov 2026). Only where nothing says they are someone the
 * business serves: their first conversation, no deal and no visit, as People's row says; never in a demo.
 */
function FirstEmailAsk({ thread, onOpenClient }: { thread: RealThread; onOpenClient: (id: string) => void }) {
  usePeopleMoved(); // drawn again when People's rows land
  useThreadPersonMoved(); // and when the thread's own read of its person lands
  const clientId = thread.clientId;
  const row = personOnThread(thread.conversationId, clientId)?.row ?? null;
  if (!clientId || !row || demoSession() || thread.archived || thread.primaryChannel !== "email") return null;
  if (!mayAtLeast("owner") || row.threads > 1 || row.deal || row.nextVisitLine || row.lastVisitLine) return null;
  return (
    <div className="ix-first-email" data-testid="ix-first-email">
      <Icon name="user" size={14} className="ix-first-email-glyph" />
      <span className="ix-first-email-words">{THREAD_PANE_WORDS.firstEmail(shortName(thread.who))}</span>
      <Button
        variant="quiet"
        size="sm"
        title={MAILBOX_SENDERS_WORDS.actHint}
        onClick={() => {
          carryNotAPerson(clientId);
          onOpenClient(clientId);
        }}
        data-testid="ix-first-email-act"
      >
        {MAILBOX_SENDERS_WORDS.act}
      </Button>
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
        // A real draft counting down stands once, as the next bubble with its countdown (heldDraftRow): the box holds the
        // member's own words, and Edit puts the draft's in it (thread-verbs.tsx).
        reply={thread.veto ? (thread.real ? "" : thread.veto.draft) : replies ? replies.draftOf(thread.id) : ""}
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
  // A real thread whose conversation waits for its own read (read-apart.ts) is drawn without it until it lands, then
  // opens as a thread does: at its newest, or the message it was opened at, with what it opened with simply there.
  const waiting = !!(thread && thread.real && thread.partial);
  const drawn = !!(thread && thread.real) && !waiting;
  const entries = thread && thread.timeline ? thread.timeline.length : 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (!drawn || !el) return undefined;
    return followTheEnd(el, { thread: threadRef, focus: focusRef, stuck: stuckRef });
  }, [drawn]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!drawn || !el || !stuckRef.current) return;
    const box = threadScroller(el);
    box.scrollTop = threadEnd(box);
  }, [drawn, entries]);
  // A long thread is drawn from its newest entries, and the ones before as its top is scrolled near (earlier.ts).
  const earlier = useEarlierAsScrolled(waiting ? null : thread, focusMessageId, scrollRef);
  if (!thread) return <InboxEmpty quiet={props.nothingOpen === "quiet"} />;

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
    // "No reply needed" on a thread left unanswered is the archive, which asks first.
    onArchive: thread.real && held.onArchive ? () => setAskArchive(true) : null,
  };
  if (!waiting && seenRef.current.id !== thread.id) seenRef.current = { id: thread.id, n: thread.timeline.length };
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
      {askArchive && thread.real && archiveAsk(held, thread, setAskArchive)}
      <ContextStrip thread={thread} />
      {notice && (
        <div className="ix-notice" role="status">
          {notice}
        </div>
      )}

      {scrollBody(held, thread, { scrollRef, statusProps, rowsAt: { newestSaid, seenAt, ...earlier } })}
      {/* The foot: what the thread needs from you and the reply box. One box on a phone, standing over the screen's foot
          as the window scrolls the conversation under it (mobile.css); on a desk no box at all (display: contents). */}
      <div className="ix-th-foot">
        {thread.real && (
          <div className="ix-th-status" data-testid="ix-th-status">
            <ThreadStatus {...statusProps} />
          </div>
        )}

        {approvalBox(held, thread, decided)}
        {/* P0: the mockup hid the composer on "done" ("decided, nothing left to do"). On real threads "handled" is the
            NORMAL resting state, so hiding it left the operator no way to follow up with their own customer. Real threads
            always get a reply path; the closed-window branch inside Composer downgrades it to approved templates past the
            24h window. A reply to a reach-out, read, draws its strip above it, and the receptionist's draft seeds it
            (reply-strip.tsx). */}
        <ReplyStrip thread={thread} />
        {replyBox(held, thread, decided)}
      </div>
    </div>
  );
};

// =============== EMPTY STATE ===============
// Placed by the page (inbox.css, .ix-zero): a little over the middle of the room it has, and on a phone in the room under
// the search, clear of the tab bar. It stood in the middle of the pane on a desk, under the window's own middle, and at
// the foot of a phone's screen with its button under the tab bar (Ruben, 7 Oct 2026). While a campaign run waits for your
// say (a row of Needs you, pages/inbox-runs.tsx) it says so, with the door to the one run: it said "Inbox zero" beside it.
// Under another bucket the pane stands empty (`quiet`): it said "Inbox zero" beside "Nothing snoozed". Its act is the
// quiet one: the page's one coral is New conversation, above it.
const InboxEmpty = ({ quiet = false }: { quiet?: boolean }) => {
  const runs = useNeedsYouParts()?.runs ?? 0;
  if (quiet) return <EmptyState kind="page" className="ix-zero" testid="inbox-nothing-open" />;
  const [only] = runs === 1 ? waitingRunsNow() : [];
  if (runs > 0)
    return (
      <EmptyState
        kind="page"
        className="ix-zero"
        glyph="bolt"
        title="No customer needs you"
        body={runsWaitingSentence(runs)}
        action={only ? { label: RUN_OPEN_WORDS, to: runRoute(only.id, only.sequence_id) } : undefined}
        testid="inbox-empty"
      />
    );
  return (
    <EmptyState
      kind="page"
      className="ix-zero"
      glyph="inbox"
      title="Inbox zero"
      body="The receptionist is handling everything. Anything that needs your call appears here."
      also={{ label: "See what it handled", to: "conversations" }}
      testid="inbox-empty"
    />
  );
};
