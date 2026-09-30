/**
 * What a thread needs from you, one state at a time, and where the conversation stands (moved from
 * pages/inbox-thread.jsx, decision 0015): the status band, the sentence-and-acts a state says, the bar under the header
 * and the customer's own words beside a decision.
 *
 * The band is a function per state, called by `ThreadStatus` and not drawn as a component of its own, so the tree is
 * the tree it was.
 */
import type { ReactElement, ReactNode } from "react";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { ixAnswerer } from "../answerer";
import { gate, navigate } from "../shell";
import type { Thread, ThreadAsk, TimelineEntry as TlEntry } from "../types";
import { ixDockDials } from "./band";
import { IxWhy } from "./composer";
import { hasVeto, SteerBox, VetoBar } from "./veto";

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
}

// What a real thread's state asks of you, said one way whatever the state: one sentence, what they asked, and what
// you can do about it, under the sentence. It was a dot and a bold title here, an icon and a bold name inside a
// sentence there, a white slab of a button beside a link with an arrow: six looks for one line of a thread. The
// state's name -- the pill its row wears, and its wait -- is the bar's under the header (ThreadBar), said once.
interface IxStateProps {
  says?: ReactNode;
  ask?: ReactNode;
  acts?: ReactNode;
  tone?: string | null;
  testid?: string | null;
}

const IxState = ({ says = null, ask = null, acts = null, tone = null, testid = null }: IxStateProps) => (
  <div className={`ix-state${tone ? ` ${tone}` : ""}`} data-testid={testid || undefined}>
    {(says || ask) && (
      <div className="ix-state-says">
        {says}
        {ask}
      </div>
    )}
    {acts && <div className="ix-state-acts">{acts}</div>}
  </div>
);

// =============== THE THREAD'S STATUS — what it needs from you, one state at a time ===============
// On a real thread it sits under the conversation, by the reply box (InboxThread). Over the timeline it was a stack
// of cards that took a phone's first screen -- Rosa's banner was 262px and her first message started at 427px -- and
// scrolled away with the words. A seeded thread keeps its cards over its story.
// The state's name is the bar's (ThreadBar), under the header: here is what is more than the name -- the reason, what
// they asked, and what to do about it. A quiet thread's one sentence is the bar's, so it says nothing here.

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
        <button className="btn btn-primary btn-sm" onClick={onReconcile}>
          <Icon name="refresh" size={12} /> Refresh
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onDismissStale} aria-label="Dismiss">
          <Icon name="x" size={12} />
        </button>
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
      <button className="cl-bucket-link" onClick={() => navigate("conversations")}>
        Transcript <Icon name="arrow-right" size={10} />
      </button>
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
      <IxState
        testid="ix-snoozed"
        says={
          <>
            Hidden from your queue. The receptionist still answers, and a new message brings it back.
            {thread.escalationId ? " They asked for a person — that's still waiting for you." : ""}
          </>
        }
        acts={
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onWake(thread.id)}
            {...gate("approve", "wake a conversation")}
          >
            Wake now
          </button>
        }
      />
    ) : (
      <div className="ix-resolved">
        <Icon name="clock" size={13} />
        <span>
          Snoozed — back <b>{thread.wake || "tomorrow 10:00"}</b>. Nothing happens until then.
        </span>
        <button
          className="cl-bucket-link"
          onClick={() => onWake(thread.id)}
          {...gate("approve", "wake a conversation")}
        >
          Wake now <Icon name="arrow-right" size={10} />
        </button>
      </div>
    ))
  );
}

/** A real thread that needs you: the reason, what they asked, and the two things to do about it. */
function needsYouState(p: StatusProps, thread: Thread) {
  const { onTakeOver, onDecide } = p;
  return (
    <IxState
      testid="ix-needs-you"
      // The reason's own sentence (ESCALATION_SUMMARIES), never one line for every reason:
      // a held message was not "already answered", and a call back is not a reply.
      says={thread.summary}
      // What they asked, beside the decision: their last message, or what the call left behind.
      ask={thread.ask && thread.ask.kind !== "call" ? <IxAsk ask={thread.ask} /> : null}
      acts={
        <>
          {ixDockDials(thread) ? (
            <a
              className="btn btn-sm ix-state-go"
              href={`tel:${thread.phone}`}
              onClick={() => onTakeOver(thread.id)}
              data-testid="ix-call-back"
            >
              <Icon name="phone" size={12} /> Call back
            </a>
          ) : (
            <button
              className="btn btn-sm ix-state-go"
              onClick={() => onTakeOver(thread.id)}
              {...gate("approve", "take over a conversation")}
            >
              {thread.primaryChannel === "phone" ? (
                <>
                  <Icon name="phone" size={12} /> Call back
                </>
              ) : (
                "I'll answer this"
              )}
            </button>
          )}
          {/* Two words on the screen, the whole sentence for a screen reader: it was a sentence wearing a button. */}
          {thread.escalationId && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onDecide(thread.id, "__HANDBACK__")}
              aria-label="Nothing needed — hand it back to the receptionist"
              {...gate("approve", "hand a conversation back")}
            >
              Hand back
            </button>
          )}
        </>
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
        <button
          className="btn btn-primary btn-sm"
          onClick={() => onTakeOver(thread.id)}
          {...gate("approve", "take over a conversation")}
        >
          I'll take this one
        </button>
      </div>
    </div>
  );
}

/** An escalated thread nobody has: real or seeded. */
function escalatedBar(p: StatusProps) {
  const { thread } = p;
  return (
    thread.state === "escalated" &&
    !thread.takenOver &&
    !thread.claimedByOther &&
    (thread.real ? needsYouState(p, thread) : needsYouSeeded(p))
  );
}

/** A thread a teammate has: nothing to take and nothing to hand back. */
function theirsBar(thread: Thread) {
  // A teammate has it. Nothing to take and nothing to hand back: pressing
  // "I'll answer this" took it from them without a word, and the hand-back
  // resolved their request. A reply still claims it, so that is said first.
  return (
    thread.real &&
    thread.claimedByOther && (
      <IxState
        testid="ix-theirs"
        says="The receptionist stays quiet until they hand it back. If you reply, the thread becomes yours."
      />
    )
  );
}

/** A handled real thread: archived, or a reply that did not send. */
function handledBar(thread: Thread) {
  return (
    thread.real &&
    thread.state === "done" &&
    !thread.resolution &&
    (thread.archived ? (
      <IxState testid="ix-archived" says="Their request is closed. If they write again, it comes back." />
    ) : // A draft still waiting to go out is the thread's state, said by its bar: "They wrote last — no reply yet"
    // sat over "Auto-sends in 72s", one saying nothing was coming and the other that it was about to.
    thread.lastWord && !thread.veto && thread.lastWord.short ? (
      // A reply that didn't send: the bar wears the row's pill ("Didn't send"), and here is what it means -- who
      // wrote last and what they know. A quiet thread's one sentence is the bar's alone: it read here too, under
      // "Answered by the receptionist — no one asked for you" over a reply that never left (I1).
      <IxState
        testid="ix-last-word"
        tone={thread.lastWord.tone === "ok" ? null : thread.lastWord.tone}
        says={thread.lastWord.text}
      />
    ) : null)
  );
}

/** A thread you have: what it means for the receptionist, what they asked, and the way to hand it back. */
function yoursBar(p: StatusProps) {
  const { thread, onHandBack } = p;
  return (
    thread.takenOver &&
    (thread.real ? (
      <IxState
        testid="ix-yours"
        // The reason it was flagged is said here, once: "Where this stands" said it below (I1).
        says={
          <>
            The receptionist stays quiet while you have it.
            {thread.escalationId && thread.summary ? <> {thread.summary}</> : null}
          </>
        }
        // What they asked, where you answer it: it was only in the timeline (I3).
        ask={thread.ask && thread.ask.kind !== "call" ? <IxAsk ask={thread.ask} /> : null}
        acts={
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onHandBack(thread.id)}
            aria-label={`Hand back to ${thread.agent.name}`}
            {...gate("approve", "hand a conversation back")}
          >
            Hand back
          </button>
        }
      />
    ) : (
      <div className="ix-resolved ix-owned">
        <Icon name="users" size={13} />
        <div className="ix-take-body">
          <span>You own this thread — agents are standing down. Reply below in your own voice.</span>
        </div>
        <button
          className="cl-bucket-link"
          onClick={() => onHandBack(thread.id)}
          {...gate("approve", "hand a conversation back")}
        >
          Hand back to {thread.agent.name} <Icon name="arrow-right" size={10} />
        </button>
      </div>
    ))
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

export const ThreadStatus = (props: StatusProps) => (
  <>
    {staleBar(props)}
    {resolvedBar(props)}

    {snoozedBar(props)}

    {escalatedBar(props)}
    {theirsBar(props.thread)}
    {handledBar(props.thread)}
    {yoursBar(props)}
    {vetoStatus(props)}
    {steerStatus(props)}
  </>
);

// =============== THE BAR — where the conversation stands, under the header ===============
// One slim line a thread opens on: the pill its row in the list wears (StatePill -- one vocabulary for both) and how
// long they have waited, or a quiet thread's one sentence; and, when WhatsApp's reply window has closed, that it has,
// with why a tap away. It was said three times at the foot of a phone: the standing as a line of its own, the window
// as a red block, and the reply box's refusal under both. Nothing when there is nothing to say.

/** Where a thread stands: the pill its row wears with how long they have waited, or a quiet thread's one sentence. */
interface Standing {
  pill?: ReactElement;
  meta?: string | null;
  late?: boolean;
  words?: string;
  tone?: string;
}

const ixStanding = (thread: Thread): Standing | null => {
  if (thread.state === "snoozed")
    return {
      pill: <StatePill kind="thread" value="snoozed" />,
      meta: `back ${thread.wake || "tomorrow 10:00"}`,
    };
  if (thread.takenOver) return { pill: <StatePill kind="thread" value="yours" label="You have it" /> };
  const waiting = thread.waited ? `waiting ${thread.waited}` : null;
  if (thread.claimedByOther)
    return {
      pill: <StatePill kind="thread" value="theirs" label={`${ixAnswerer(thread)} has it`} />,
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
  // A reply that didn't send wears the row's own pill ("Didn't send"); a quiet thread is its one quiet sentence.
  return thread.lastWord.short
    ? { pill: <StatePill kind="tone" value={thread.lastWord.tone} label={thread.lastWord.short} /> }
    : { words: thread.lastWord.text, tone: thread.lastWord.tone };
};

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
          {standing.pill || (
            <span className={`ix-th-standing-words ${standing.tone}`} title={standing.words}>
              {standing.words}
            </span>
          )}
          {standing.meta && (
            <span className={`ix-th-standing-meta tabular${standing.late ? " late" : ""}`}>{standing.meta}</span>
          )}
        </span>
      )}
      {closed && (
        <>
          <span className="ix-th-window" data-testid="ix-th-window">
            Window closed
          </span>
          <IxWhy
            said="The 24-hour WhatsApp window is closed — free-form replies can't be delivered. Approved templates only."
            testid="ix-th-window-why"
          />
        </>
      )}
    </div>
  );
};

// The customer's own words beside a decision about them: what they last wrote, or what the call left.
const IxAsk = ({ ask }: { ask: ThreadAsk }) => (
  <div className="ix-take-ask" data-testid="ix-take-ask">
    <span className="ix-take-ask-label">{ask.label}</span>
    <span className="ix-take-ask-text">{ask.quoted ? `“${ask.text}”` : ask.text}</span>
  </div>
);
