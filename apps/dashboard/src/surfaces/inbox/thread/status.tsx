/**
 * What a thread needs from you, one state at a time, and where the conversation stands (moved from
 * pages/inbox-thread.jsx, decision 0015): the status band, the sentence-and-acts a state says, the bar under the header
 * and the customer's own words beside a decision.
 *
 * The band is a function per state, called by `ThreadStatus` and not drawn as a component of its own, so the tree is
 * the tree it was.
 */
import { useState, type ReactElement, type ReactNode } from "react";
import {
  BOOKING_REQUEST_WORDS,
  HOLD_ACT_WORDS,
  heldPill,
  shortName,
  snoozedThreadWords,
  THREAD_PANE_WORDS,
} from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { Notice } from "../../kit/notice/notice";
import { holderName } from "../../holder-names";
import { gate, navigate } from "../shell";
import type { Thread, TimelineEntry as TlEntry } from "../types";
import { ixDockDials } from "./band";
import { hasVeto, SteerBox, VetoBar } from "./veto";
import { Button } from "../../kit/button/button";
import { LinkButton } from "../../kit/link-button/link-button";

/** The other side's move while you read: who did what, and the entries it left behind. */
export interface Stale {
  update: { by: string; note: string; append: TlEntry[] };
}

export interface StatusProps {
  thread: Thread;
  decided: boolean;
  stale: Stale | null;
  onReconcile: () => void;
  onDismissStale: () => void;
  onWake: (threadId: string) => void;
  onTakeOver: (threadId: string) => void;
  onDecide: (threadId: string, action: string) => void;
  onHandBack: (threadId: string) => void;
  veto: number | null;
  vetoPaused: boolean;
  onVetoAct: (threadId: string, act: string) => void;
  /** Archive, which asks first (thread.tsx): "No reply needed" on a thread left unanswered. None where it cannot be done. */
  onArchive?: (() => void) | null;
}

/** The thread whose hand back is being asked about (Hand back when what they wrote has no answer), and how to ask or let go. */
interface HandBackAsk {
  asking: string | null;
  setAsking: (threadId: string | null) => void;
}

type DockProps = StatusProps & HandBackAsk;

// What a real thread asks of you, said one way whatever the state: the dock over the reply box (the phone canvas, B1),
// the kit's notice. The one line of what is owed, one fact the page does not already show after it in the dim ink (never
// the bar's wait, never their last bubble, which is right above it), and at most two acts, the lead a capsule and the
// other words. The state's name -- the pill its row wears, and its wait -- is the bar's under the header (ThreadBar).
// It was a sentence at 600 over their last message quoted again over the acts: three blocks for what the bar named.
interface DockLine {
  fact: ReactNode;
  source?: ReactNode;
  acts?: ReactNode;
  line?: boolean;
  label: string;
  testid: string;
}

const Dock = ({ fact, source = null, acts = null, line = false, label, testid }: DockLine) => (
  <Notice fact={fact} source={source} act={acts} line={line} label={label} className="ix-dock" testid={testid} />
);

// =============== THE THREAD'S STATUS — what it needs from you, one state at a time ===============
// On a real thread it sits under the conversation, by the reply box (InboxThread). Over the timeline it was a stack
// of cards that took a phone's first screen -- Rosa's banner was 262px and her first message started at 427px -- and
// scrolled away with the words. A seeded thread keeps its cards over its story.

/** The other side moved while you were reading: who, what, and how far behind you are. */
function staleBar(p: StatusProps) {
  const { stale, onReconcile, onDismissStale } = p;
  return (
    stale && (
      <div className="ix-stale">
        <span className="ix-stale-dot" />
        <div className="ix-stale-body">
          <div className="ix-stale-title">
            {stale.update.by} {stale.update.note} while you were reading
          </div>
          <div className="ix-stale-sub">
            Your view is {stale.update.append.filter((e) => e.type === "msg").length} message behind — nothing was
            changed for you.
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={onReconcile}>
          <Icon name="refresh" size={12} /> Refresh
        </Button>
        <Button variant="quiet" size="sm" iconOnly onClick={onDismissStale} aria-label="Dismiss">
          <Icon name="x" size={12} />
        </Button>
      </div>
    )
  );
}

/** What a decision left on the thread, and who is on it now. */
function resolvedBar(p: StatusProps) {
  const { thread, decided } = p;
  const res = thread.resolution;
  if (!decided || !res) return false;
  const now = thread.real ? (
    <>{thread.agent.name} is back on this thread.</>
  ) : res.declined ? (
    <>
      {thread.agent.name} is handling the fallback
      {thread.approval && thread.approval.fallback ? `: ${thread.approval.fallback}` : ""}.
    </>
  ) : (
    <>{thread.agent.name} is executing the next steps.</>
  );
  return (
    <div className={`ix-resolved ${res.declined ? "declined" : ""}`}>
      <Icon name={res.declined ? "x" : "check"} size={13} />
      <span>
        You chose <b>“{res.action}”</b> at {res.at} — {now}
      </span>
      <LinkButton onClick={() => navigate("conversations")}>
        Transcript <Icon name="arrow-right" size={10} />
      </LinkButton>
    </div>
  );
}

/** A snoozed thread: what a snooze really is on a real thread, and the way to wake it. */
function snoozedBar(p: StatusProps) {
  const { thread, onWake } = p;
  return (
    thread.state === "snoozed" &&
    (thread.real ? (
      // "Nothing happens until then" was false on a real thread: snooze
      // deliberately does NOT mute the receptionist, so it keeps
      // answering, and a new message from the customer reopens the
      // conversation. Say what a snooze actually is — hidden, not
      // paused — and, when the customer asked for a person, say that
      // the request is still standing rather than letting the operator
      // believe it was dealt with.
      <Dock
        testid="ix-snoozed"
        label="Snoozed"
        // The request still standing, in its own words (the row's subject is the reason's label): it said "They
        // asked for a person" over a failed send, a call back and a deadman alike.
        fact={snoozedThreadWords(thread.escalationId && thread.subject ? thread.subject : null)}
        acts={
          <Button
            variant="quiet"
            size="sm"
            onClick={() => onWake(thread.id)}
            {...gate("approve", "wake a conversation")}
          >
            Wake now
          </Button>
        }
      />
    ) : (
      <div className="ix-resolved">
        <Icon name="clock" size={13} />
        <span>
          Snoozed — back <b>{thread.wake || "tomorrow 10:00"}</b>. Nothing happens until then.
        </span>
        <LinkButton onClick={() => onWake(thread.id)} {...gate("approve", "wake a conversation")}>
          Wake now <Icon name="arrow-right" size={10} />
        </LinkButton>
      </div>
    ))
  );
}

/**
 * A time the customer picked by text (decision 0061): Booked it, which drafts the confirmation into the box below, and
 * Can't, which leaves the thread waiting on a reply.
 */
function requestActsOf(thread: Thread, onDecide: StatusProps["onDecide"]) {
  const W = BOOKING_REQUEST_WORDS;
  return (
    <>
      <Button
        size="sm"
        onClick={() => onDecide(thread.id, "__BOOKED__")}
        data-testid="ix-request-booked"
        {...gate("approve", W.gate)}
      >
        {W.booked_it}
      </Button>
      <Button
        variant="quiet"
        size="sm"
        onClick={() => onDecide(thread.id, "__CANT__")}
        data-testid="ix-request-cant"
        {...gate("approve", W.gate)}
      >
        {W.cant_it}
      </Button>
    </>
  );
}

/**
 * Whether what they wrote is still waiting on an answer: of the words exchanged, theirs are the newest (a draft held, a
 * note, a call, our words that never reached them are not an answer). A hand back then sends them nothing, and the
 * receptionist never comes back to a message it held (Daniela Reyes, 20 Sep 2026), so the hand back asks first.
 */
const theyAreWaiting = (thread: Thread): boolean => {
  for (let i = thread.timeline.length - 1; i >= 0; i--) {
    const e = thread.timeline.at(i);
    if (!e || e.type !== "msg" || e.pending || e.channel === "phone") continue;
    if (e.from === "client") return true;
    if (e.reachedCustomer !== false) return false;
  }
  return false;
};

/** Hand back, guarded: where what they wrote has no answer, the dock asks before it lets go (handBackAsk). */
const guardedHandBack = (p: DockProps, go: () => void) => () => {
  if (p.asking !== p.thread.id && theyAreWaiting(p.thread)) p.setAsking(p.thread.id);
  else {
    p.setAsking(null);
    go();
  }
};

/** The hand back asks first, in the dock's place: their message has no answer, and handing back sends none. */
function handBackAsk(p: DockProps, go: () => void) {
  const { thread, setAsking } = p;
  const W = THREAD_PANE_WORDS;
  const said = W.handBackAsk(shortName(thread.who));
  return (
    <Dock
      testid="ix-hand-back-ask"
      label={said}
      fact={<b>{said}</b>}
      source={W.handBackWhy}
      acts={
        <>
          <Button
            size="sm"
            onClick={() => {
              setAsking(null);
              window.dispatchEvent(new CustomEvent("inbox:focus-composer", { detail: { threadId: thread.id } }));
            }}
            data-testid="ix-answer-first"
          >
            {W.answerFirst}
          </Button>
          <Button
            variant="quiet"
            size="sm"
            onClick={guardedHandBack(p, go)}
            data-testid="ix-hand-back-anyway"
            {...gate("approve", "hand a conversation back")}
          >
            {W.handBackAnyway}
          </Button>
        </>
      }
    />
  );
}

/** A real thread that needs you: the reason, and the two things to do about it. */
function needsYouState(p: DockProps, thread: Thread) {
  const { onTakeOver, onDecide } = p;
  const handBack = () => onDecide(thread.id, "__HANDBACK__");
  if (p.asking === thread.id) return handBackAsk(p, handBack);
  return (
    <Dock
      testid="ix-needs-you"
      label={thread.summary}
      // The reason's own sentence (ESCALATION_SUMMARIES), never one line for every reason: a held message was not
      // "already answered", and a call back is not a reply. What they asked is the bubble right above it.
      fact={thread.summary}
      acts={
        thread.holdAct === "confirm" ? (
          requestActsOf(thread, onDecide)
        ) : (
          <>
            {/* A hold nothing may be sent for (its reason's act is to hand back, escalations.ts HOLD_ACT_WORDS) offers no
              reply to write: Hand back is the thread's own verb. */}
            {thread.holdAct === "hand_back" ? null : ixDockDials(thread) ? (
              <Button
                size="sm"
                href={`tel:${thread.phone}`}
                onClick={() => onTakeOver(thread.id)}
                data-testid="ix-call-back"
              >
                <Icon name="phone" size={12} /> Call back
              </Button>
            ) : (
              <Button size="sm" onClick={() => onTakeOver(thread.id)} {...gate("approve", "take over a conversation")}>
                {thread.primaryChannel === "phone" ? (
                  <>
                    <Icon name="phone" size={12} /> Call back
                  </>
                ) : (
                  HOLD_ACT_WORDS.reply.take
                )}
              </Button>
            )}
            {/* Two words on the screen, the whole sentence for a screen reader: it was a sentence wearing a button. */}
            {thread.escalationId && (
              <Button
                variant="quiet"
                size="sm"
                onClick={guardedHandBack(p, handBack)}
                aria-label="Nothing needed — hand it back to the receptionist"
                {...gate("approve", "hand a conversation back")}
              >
                Hand back
              </Button>
            )}
          </>
        )
      }
    />
  );
}

/** A seeded thread that needs a human voice. */
function needsYouSeeded(p: StatusProps) {
  const { thread, onTakeOver } = p;
  return (
    <div className="ix-take">
      <Icon name="flag" size={13} />
      <div className="ix-take-body">
        <div className="ix-take-title">Escalated — needs a human voice</div>
        <div className="ix-take-sub">
          {thread.agent.name} stopped drafting. HR-sensitive threads never get suggested replies.
        </div>
      </div>
      {/* The buttons beneath the words, wrapping: they shared the words' row, and at 1024 the words were 0px wide (I3). */}
      <div className="ix-take-actions">
        <Button
          variant="primary"
          size="sm"
          onClick={() => onTakeOver(thread.id)}
          {...gate("approve", "take over a conversation")}
        >
          I'll take this one
        </Button>
      </div>
    </div>
  );
}

/** An escalated thread nobody has: real or seeded. */
function escalatedBar(p: DockProps) {
  const { thread } = p;
  return (
    thread.state === "escalated" &&
    !thread.takenOver &&
    !thread.claimedByOther &&
    (thread.real ? needsYouState(p, thread) : needsYouSeeded(p))
  );
}

/**
 * A thread left with no answer (contracts unansweredOf): what the hold noted of their ask, when it closed, and the two
 * ways to settle it besides the reply box under it -- a call, or saying no reply is needed, which archives the thread
 * (a new message brings it back). The bar names it, amber, with how long they have waited.
 */
function unansweredDock(p: StatusProps, thread: Thread) {
  const u = thread.unanswered;
  if (!u) return null;
  const W = THREAD_PANE_WORDS;
  const mayCall = !!thread.phone && !thread.dnc && !thread.optedOut;
  const acts =
    mayCall || p.onArchive ? (
      <>
        {mayCall && (
          <Button size="sm" href={`tel:${thread.phone}`} data-testid="ix-unanswered-call">
            <Icon name="phone" size={12} /> {W.call}
          </Button>
        )}
        {p.onArchive && (
          <Button
            variant="quiet"
            size="sm"
            onClick={p.onArchive}
            data-testid="ix-no-reply-needed"
            {...gate("approve", "archive a conversation")}
          >
            {W.noReplyNeeded}
          </Button>
        )}
      </>
    ) : null;
  return <Dock testid="ix-unanswered" label={u.line} fact={u.line} source={u.closed} acts={acts} />;
}

/**
 * A handled real thread: archived, or left with no answer. A reply that did not send is said by the bar ("Didn't send")
 * and acted on at its own bubble (timeline.tsx: Send again, Edit); a sentence here said it a third time.
 */
function handledBar(p: StatusProps) {
  const { thread } = p;
  if (!thread.real || thread.state !== "done" || thread.resolution) return null;
  if (thread.archived)
    return (
      <Dock testid="ix-archived" label="Archived" fact="Their request is closed. If they write again, it comes back." />
    );
  // A draft still waiting to go out is the thread's state, said by its countdown.
  return thread.veto ? null : unansweredDock(p, thread);
}

/** A thread you have: what it means for the receptionist, and the way to hand it back, on one line. */
function yoursBar(p: DockProps) {
  const { thread, onHandBack } = p;
  const W = THREAD_PANE_WORDS;
  const handBack = () => onHandBack(thread.id);
  if (!thread.takenOver) return false;
  if (thread.real && p.asking === thread.id) return handBackAsk(p, handBack);
  return thread.real ? (
    <Dock
      testid="ix-yours"
      line
      label={W.yours}
      fact={W.yours}
      // The reason it was flagged is said here, once: "Where this stands" said it below (I1).
      source={thread.escalationId && thread.summary ? thread.summary : W.yoursFact}
      acts={
        <Button
          variant="quiet"
          size="sm"
          onClick={guardedHandBack(p, handBack)}
          aria-label={`Hand back to ${thread.agent.name}`}
          {...gate("approve", "hand a conversation back")}
        >
          Hand back
        </Button>
      }
    />
  ) : (
    <div className="ix-resolved ix-owned">
      <Icon name="users" size={13} />
      <div className="ix-take-body">
        <span>You own this thread — agents are standing down. Reply below in your own voice.</span>
      </div>
      <LinkButton onClick={() => onHandBack(thread.id)} {...gate("approve", "hand a conversation back")}>
        Hand back to {thread.agent.name} <Icon name="arrow-right" size={10} />
      </LinkButton>
    </div>
  );
}

/** The countdown on a draft, and the controls that stop it. */
function vetoStatus(p: StatusProps) {
  const { thread, decided, veto, vetoPaused, onVetoAct, onTakeOver } = p;
  // The same trap the composer already documents: in the mockup "done"
  // means decided, nothing left to do. On a REAL thread "handled" is the
  // normal resting state — the receptionist answered and nothing
  // escalated — which is exactly the state a held draft sits in. Gating
  // the VetoBar on state !== "done" hid the controls in the common case
  // and left the draft unstoppable from the UI.
  return (
    hasVeto(thread) &&
    !decided &&
    (thread.real || thread.state !== "done") && (
      <VetoBar thread={thread} remaining={veto} paused={vetoPaused} onAct={onVetoAct} onTakeOver={onTakeOver} />
    )
  );
}

/** The text whisper: only on a real draft that is still counting down. */
function steerStatus(p: StatusProps) {
  const { thread, decided, veto } = p;
  // A held (manual) draft has Edit; a seeded one has no edge to ask.
  return (
    hasVeto(thread) &&
    !decided &&
    thread.real &&
    veto != null &&
    thread.veto.messageId && <SteerBox messageId={thread.veto.messageId} />
  );
}

/**
 * What the thread needs from you. A thread a teammate has says nothing here: its reply box says what a reply does
 * ("Reply to take it from …", composer.tsx), the one thing left to know.
 */
export const ThreadStatus = (props: StatusProps) => {
  // Which thread's hand back is being asked about: kept by its id, so it never shows over another thread.
  const [asking, setAsking] = useState<string | null>(null);
  const p: DockProps = { ...props, asking, setAsking };
  return (
    <>
      {staleBar(p)}
      {resolvedBar(p)}

      {snoozedBar(p)}

      {escalatedBar(p)}
      {handledBar(p)}
      {yoursBar(p)}
      {vetoStatus(p)}
      {steerStatus(p)}
    </>
  );
};

// =============== THE BAR — where the conversation stands, under the header ===============
// One slim line a thread opens on: the pill its row in the list wears (StatePill -- one vocabulary for both) and how
// long they have waited, or a quiet thread's one sentence; and, when WhatsApp's reply window has closed, that it has,
// with why a tap away. It was said three times at the foot of a phone: the standing as a line of its own, the window
// as a red block, and the reply box's refusal under both. Nothing when there is nothing to say.

/** Where a thread stands: the pill its row wears with how long they have waited, or a quiet thread's one sentence. */
interface Standing {
  pill: ReactElement;
  meta?: string | null;
  late?: boolean;
}

const ixStanding = (thread: Thread): Standing | null => {
  if (thread.state === "snoozed")
    return {
      pill: <StatePill kind="thread" value="snoozed" />,
      meta: `back ${thread.wake || "tomorrow 10:00"}`,
    };
  if (thread.takenOver) return { pill: <StatePill kind="thread" value="yours" /> };
  const waiting = thread.waited ? `waiting ${thread.waited}` : null;
  if (thread.claimedByOther)
    return {
      pill: <StatePill kind="thread" value="theirs" label={heldPill("theirs", holderName(thread.assigneeUserId))} />,
      meta: waiting,
    };
  // Amber past half an hour, as the row's pill is.
  if (thread.state === "escalated")
    return {
      pill: <StatePill kind="thread" value="escalated" />,
      meta: waiting,
      late: (thread.waitingMin ?? 0) > 30,
    };
  if (thread.state !== "done" || thread.resolution) return null;
  if (thread.archived) return { pill: <StatePill kind="thread" value="archived" label="Archived" /> };
  // A draft still waiting to go out is the thread's state, said by its countdown: "They wrote last — no reply yet"
  // sat over "Auto-sends in 72s", one saying nothing was coming and the other that it was about to.
  if (!thread.lastWord || thread.veto) return null;
  // A reply that didn't send, or what they wrote held and closed with nothing sent (contracts unansweredOf), wears the
  // row's own pill and, beside it, when the words that didn't send were written, or how long they have waited. A quiet
  // thread says nothing here: the conversation shows who had the last word, and a sentence for the ordinary state stood
  // over every thread (the phone canvas, A1).
  if (!thread.lastWord.short) return null;
  return {
    pill: <StatePill kind="tone" value={thread.lastWord.tone} label={thread.lastWord.short} />,
    // The tone says it once, in the pill: the time beside it is the dim ink.
    meta: thread.unanswered ? `waiting ${thread.unanswered.waited}` : thread.lastWord.at || null,
  };
};

/**
 * WhatsApp's window, shut: one quiet fact at the bar's end, a lock and its words, that opens why on a press. It was a dot
 * in the warning's amber, "Window closed" and an underlined "Why?" over a 44px press, which made the bar 64px and cut the
 * standing beside it to "Answered by the receptionist — n…" on a phone (the phone canvas, A1). Amber says one thing.
 */
function ChatClosed() {
  const [open, setOpen] = useState(false);
  const W = THREAD_PANE_WORDS;
  return (
    <>
      <Button
        variant="quiet"
        size="text"
        className="ix-th-window"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="ix-th-window"
      >
        <Icon name="lock" size={12} />
        {W.chatClosed}
        <Icon name="info" size={12} />
      </Button>
      {open && (
        <span className="ix-why-said" data-testid="ix-th-window-why">
          {W.chatClosedWhy}
        </span>
      )}
    </>
  );
}

export const ThreadBar = ({ thread }: { thread: Thread }) => {
  const standing = ixStanding(thread);
  // Only WhatsApp has a window (replyWindow), and it is the reply box's concern when they opted out, or never
  // wrote on WhatsApp at all: then nothing about a window is true enough to say.
  const closed = thread.hasChat !== false && !thread.optedOut && thread.windowOpen === false;
  if (!standing && !closed) return null;
  return (
    <div className="ix-th-bar" data-testid="ix-th-bar">
      {standing && (
        <span className="ix-th-standing" data-testid="ix-th-standing">
          {standing.pill}
          {standing.meta && (
            <span className={`ix-th-standing-meta tabular${standing.late ? " late" : ""}`}>· {standing.meta}</span>
          )}
        </span>
      )}
      {closed && <ChatClosed />}
    </div>
  );
};
