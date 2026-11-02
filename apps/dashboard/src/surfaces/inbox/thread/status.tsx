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
  countdownClock,
  dockLineOf,
  HOLD_ACT_WORDS,
  heldPill,
  shortName,
  snoozedThreadWords,
  stateOf,
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
import { IxWhy } from "./send-words";
import { keptReplyNow } from "./kept-draft";
import { Button } from "../../kit/button/button";
import { LinkButton } from "../../kit/link-button/link-button";
import { routeDoor } from "../../legacy-verbs";

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
  /**
   * Which thread's hand back is being asked about, held by the pane (thread.tsx), where the reply box's Hand back asks
   * it too (composerAside); the band keeps its own where it is not given.
   */
  asking?: string | null;
  setAsking?: (threadId: string | null) => void;
}

/** The thread whose hand back is being asked about (Hand back when what they wrote has no answer), and how to ask or let go. */
interface HandBackAsk {
  asking: string | null;
  setAsking: (threadId: string | null) => void;
}

type DockProps = Omit<StatusProps, "asking" | "setAsking"> & HandBackAsk;

// What a real thread asks of you, said one way whatever the state: the dock over the reply box (the phone canvas, B1),
// the kit's notice. The one line of what is owed, one fact the page does not already show after it in the dim ink (never
// the bar's wait, never their last bubble, which is right above it), and at most two acts, the lead a capsule and the
// other words. The state's name -- the pill its row wears, and its wait -- is the header's, under the name (whereItStands).
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
 * The booking they asked for, as a card under the dock's line (the thread canvas, 1 Nov 2026): its day on a tile, its
 * hours and service, whether it still holds its time on the calendar, the door to that day, then Can't do it and Booked
 * it a thumb tall, half the width each, and what each does. Booked it drafts the confirmation into the box below; Can't
 * leaves the thread waiting on a reply (decision 0061).
 */
function RequestCard({ thread, onDecide }: { thread: Thread; onDecide: StatusProps["onDecide"] }) {
  const W = BOOKING_REQUEST_WORDS;
  const r = thread.real ? thread.request : undefined;
  if (!r) return null;
  return (
    <div className="ix-request" data-testid="ix-request">
      <div className="ix-request-when">
        <span className="ix-request-day" role="img" aria-label={r.dayLong}>
          <span className="ix-request-weekday">{r.weekday}</span>
          <span className="ix-request-date">{r.date}</span>
        </span>
        <span className="ix-request-said">
          <span className="ix-request-hours" data-testid="ix-request-hours">
            {r.hours}
            {r.service ? <span className="ix-request-service"> · {r.service}</span> : null}
          </span>
          <span className={`ix-request-holds${r.holds ? "" : " lapsed"}`} data-testid="ix-request-holds">
            <Icon name={r.holds ? "check" : "clock"} size={12} />
            {r.holds ? W.holds : W.lapsed}
          </span>
        </span>
        <LinkButton className="ix-request-door" {...routeDoor(r.to)} title={W.dayDoor(r.dayLong)}>
          {W.day}
          <Icon name="chevron" size={12} />
        </LinkButton>
      </div>
      <div className="ix-request-acts">
        <Button
          variant="outline"
          size="touch"
          onClick={() => onDecide(thread.id, "__CANT__")}
          data-testid="ix-request-cant"
          {...gate("approve", W.gate)}
        >
          {W.cant_do_it}
        </Button>
        <Button
          variant="primary"
          size="touch"
          onClick={() => onDecide(thread.id, "__BOOKED__")}
          data-testid="ix-request-booked"
          {...gate("approve", W.gate)}
        >
          <Icon name="check" size={15} />
          {W.booked_it}
        </Button>
      </div>
      <p className="ix-request-foot">{W.card_foot}</p>
    </div>
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

/**
 * Whether words can go to them from the reply box under the dock: free words or an approved message. Sending one is the
 * answer, and takes the thread (core reply: takeControl, resolveEscalation), so the dock offers no take-over beside it;
 * where nothing can go (a stop, an address that stopped, Instagram shut, a caller with no chat), taking it is the act.
 */
const replyGoes = (thread: Thread): boolean =>
  !!thread.real &&
  !thread.optedOut &&
  !thread.emailStopped &&
  thread.hasChat !== false &&
  !(thread.windowOpen === false && thread.primaryChannel === "instagram");

/**
 * Whether taking the thread without a word is More's to offer (header.tsx): a hold that asks for a reply, where the reply
 * box can send one, so the dock offers no take-over (takeAct). Claiming it first still tells the team it is yours, and
 * pauses the receptionist, before a word is written (to call them, say).
 */
export const takeInTheMenu = (thread: Thread): boolean =>
  !!thread.real &&
  thread.state === "escalated" &&
  !thread.takenOver &&
  !thread.claimedByOther &&
  thread.holdAct !== "hand_back" &&
  thread.holdAct !== "confirm" &&
  !ixDockDials(thread) &&
  thread.primaryChannel !== "phone" &&
  replyGoes(thread);

/** The whole of why it was held, and what the hold noted, a press away under the dock's line (contracts holdWordsOf). */
function holdWhy(thread: Thread): ReactNode {
  if (!thread.real || !thread.holdWhy) return null;
  return (
    <IxWhy
      said={
        <>
          {thread.holdWhy}
          {thread.holdNote ? <> “{thread.holdNote}”</> : null}
        </>
      }
      testid="ix-hold-why"
    />
  );
}

/** The lead act of a hold that asks for a person: a call back, or taking it where no reply can go; none where one can. */
function takeAct(p: DockProps, thread: Thread): ReactNode {
  const { onTakeOver } = p;
  if (thread.holdAct === "hand_back") return null;
  if (ixDockDials(thread))
    return (
      <Button size="sm" href={`tel:${thread.phone}`} onClick={() => onTakeOver(thread.id)} data-testid="ix-call-back">
        <Icon name="phone" size={12} /> Call back
      </Button>
    );
  if (thread.primaryChannel === "phone")
    return (
      <Button size="sm" onClick={() => onTakeOver(thread.id)} {...gate("approve", "take over a conversation")}>
        <Icon name="phone" size={12} /> Call back
      </Button>
    );
  if (replyGoes(thread)) return null;
  return (
    <Button size="sm" onClick={() => onTakeOver(thread.id)} {...gate("approve", "take over a conversation")}>
      {HOLD_ACT_WORDS.reply.take}
    </Button>
  );
}

/**
 * Whether the reply box under the dock answers this hold, with Hand back beside its Send (composerAside): a hold that asks
 * for a reply, on a real thread nobody has taken, where free words can go, in the box's drafted shape (an email, or the
 * receptionist's draft kept for it: composer.tsx realComposer). A chat's one line, or an approved message's box past
 * WhatsApp's window, draws nothing beside its Send, and Hand back stays on the dock's line.
 */
const boxAnswers = (thread: Thread): boolean =>
  !!thread.real &&
  thread.windowOpen !== false &&
  (thread.primaryChannel === "email" || !!keptReplyNow(thread)) &&
  thread.state === "escalated" &&
  !!thread.escalationId &&
  thread.holdAct === "reply" &&
  !thread.takenOver &&
  !thread.claimedByOther &&
  !ixDockDials(thread) &&
  thread.primaryChannel !== "phone" &&
  replyGoes(thread);

/** Hand back, as the quiet act beside a coral one: outlined, a thumb tall, its glyph the way back. */
function handBackButton(p: DockProps, go: () => void) {
  return (
    <Button
      variant="outline"
      size="touch"
      onClick={guardedHandBack(p, go)}
      aria-label="Nothing needed — hand it back to the receptionist"
      data-testid="ix-hand-back"
      {...gate("approve", "hand a conversation back")}
    >
      <Icon name="undo" size={15} />
      {THREAD_PANE_WORDS.handBack}
    </Button>
  );
}

/**
 * What the reply box draws beside its Send, from the thread's state (the thread canvas, 1 Nov 2026: "Hand back" at the
 * left, "Send email" at the right, under the draft): Hand back, where the box answers the hold. The pane holds which
 * thread's hand back is asked about (thread.tsx), so the dock's question and this press are one.
 */
export function composerAside(p: StatusProps): ReactNode {
  const { thread, onDecide, asking = null, setAsking = () => undefined } = p;
  if (!boxAnswers(thread) || asking === thread.id) return null;
  return handBackButton({ ...p, asking, setAsking }, () => onDecide(thread.id, "__HANDBACK__"));
}

/** The dock's one line, as the canvas draws it: a dot in the coral, what is owed at 600, the clause after it muted. */
function dockLine({ lead, rest }: { lead: string; rest: string | null }) {
  return (
    <span className="ix-dock-line">
      <span className="ix-dock-dot" aria-hidden="true" />
      <b>{lead}</b>
      {rest ? <span className="ix-dock-rest"> — {rest}</span> : null}
    </span>
  );
}

/**
 * A real thread that needs you: the one line of what is owed (contracts reasonLineOf; "Check the draft" where the
 * receptionist drafted its reply into the box), its whole why a press away where the box holds no draft to say it, and
 * what to do about it. Where the reply box under it answers the hold, Hand back stands beside the box's Send
 * (composerAside) and the dock is its line alone (the thread canvas, 1 Nov 2026).
 */
function needsYouState(p: DockProps, thread: Thread) {
  const { onDecide } = p;
  const handBack = () => onDecide(thread.id, "__HANDBACK__");
  if (p.asking === thread.id) return handBackAsk(p, handBack);
  const drafted = boxAnswers(thread) && !!keptReplyNow(thread);
  const said = dockLineOf((thread.real && thread.holdLine) || thread.summary);
  const line = drafted ? { lead: THREAD_PANE_WORDS.checkDraft, rest: said.rest } : said;
  const label = line.rest ? `${line.lead} — ${line.rest}` : line.lead;
  // A request its card draws (RequestCard) answers there; one whose time the hold does not carry keeps its two words.
  const card = thread.holdAct === "confirm" && thread.real && !!thread.request;
  const acts = card ? null : thread.holdAct === "confirm" ? (
    requestActsOf(thread, onDecide)
  ) : (
    <>
      {/* A hold nothing may be sent for (its reason's act is to hand back, escalations.ts HOLD_ACT_WORDS) offers no
            reply to write: Hand back is the thread's own verb. */}
      {takeAct(p, thread)}
      {thread.escalationId && !boxAnswers(thread) && (
        <Button
          variant="quiet"
          size="sm"
          onClick={guardedHandBack(p, handBack)}
          aria-label="Nothing needed — hand it back to the receptionist"
          data-testid="ix-hand-back"
          {...gate("approve", "hand a conversation back")}
        >
          {THREAD_PANE_WORDS.handBack}
        </Button>
      )}
    </>
  );
  const dock = (
    <Dock
      testid="ix-needs-you"
      label={label}
      fact={dockLine(line)}
      // Why it was held, a press away, where the box holds no draft whose own Why this? says what it read, and no card says
      // what was asked.
      source={drafted || card ? null : holdWhy(thread)}
      line
      acts={acts}
    />
  );
  return card ? (
    <>
      {dock}
      <RequestCard thread={thread} onDecide={onDecide} />
    </>
  ) : (
    dock
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
      // The reason it was flagged is said here, once: "Where this stands" said it below (I1). What the hold noted (the
      // cause of a failed send) is a press away, as the dock for Needs you keeps it: the mark in the conversation quoted it.
      source={
        thread.escalationId && thread.summary ? (
          <>
            {thread.summary}
            {thread.real && thread.holdNote ? <IxWhy said={`“${thread.holdNote}”`} testid="ix-hold-why" /> : null}
          </>
        ) : (
          W.yoursFact
        )
      }
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

/**
 * The countdown on a seeded draft, and the controls that stop it. A real thread's stand under the draft's own bubble
 * (thread.tsx heldDraftRow), once its conversation is drawn.
 */
const draftInTheConversation = (thread: Thread): boolean => !!thread.real && !thread.partial;

/** The countdown on a draft, and the controls that stop it. */
function vetoStatus(p: StatusProps) {
  const { thread, decided, veto, vetoPaused, onVetoAct, onTakeOver } = p;
  if (draftInTheConversation(thread)) return false;
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
  if (draftInTheConversation(thread)) return false;
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
  // Which thread's hand back is being asked about: kept by its id, so it never shows over another thread. The pane's
  // where it holds it (thread.tsx), since the reply box's Hand back asks it too; the band's own otherwise.
  const [own, setOwn] = useState<string | null>(null);
  const p: DockProps = {
    ...props,
    asking: props.setAsking ? (props.asking ?? null) : own,
    setAsking: props.setAsking ?? setOwn,
  };
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

// =============== WHERE IT STANDS — the header's second line ===============
// What the thread's row in the list wears (StatePill -- one vocabulary for both) and how long they have waited, said
// under the name in the header (header.tsx), where the wires were (the thread canvas, 1 Nov 2026). It was a bar of its
// own under the header, a row of the phone's height for one pill, over the dock that said the reason again. WhatsApp's
// window, shut, is the template box's to say (ChatClosed, template-box.tsx): the line under the name is the person's
// link, and a press inside a link is not one. Nothing when there is nothing to say: the header says the wires instead.

/** Where a thread stands: the pill its row wears, lit on its tone, with how long they have waited in the mono face. */
interface Standing {
  pill: ReactElement;
  meta?: string | null;
  /** What the bare wait means, on a hover ("waiting 40m"). */
  title?: string;
}

/** A draft counting down to send, as the head's state says it: the seconds left (none once held) and whether you are away. */
export interface Countdown {
  remaining: number | null;
  paused: boolean;
}

/**
 * Where a thread stands, lit (the thread canvas, 1 Nov 2026): a hold is "Needs you" in the coral with the wait beside it
 * ("2h"); a draft counting down "Sends in 0:42" in the amber with its clock; a thread nothing waits on "Handled" in the
 * green with its tick; a snooze, a thread somebody has, and a reply that did not send, in their own tones.
 */
const ixStanding = (thread: Thread, countdown: Countdown): Standing | null => {
  const W = THREAD_PANE_WORDS;
  if (thread.state === "snoozed")
    return {
      pill: <StatePill kind="thread" value="snoozed" lit />,
      meta: `back ${thread.wake || "tomorrow 10:00"}`,
    };
  if (thread.takenOver) return { pill: <StatePill kind="thread" value="yours" lit /> };
  if (thread.claimedByOther)
    return {
      pill: (
        <StatePill kind="thread" value="theirs" lit label={heldPill("theirs", holderName(thread.assigneeUserId))} />
      ),
      meta: thread.waited || null,
      title: thread.waited ? `waiting ${thread.waited}` : undefined,
    };
  // Its wait beside it in the quiet mono ink (the canvas's "2h"): the coral pill is the one signal, and the number says
  // how long.
  if (thread.state === "escalated")
    return {
      pill: <StatePill kind="tone" value="accent" lit label={stateOf("thread", "escalated").label} />,
      meta: thread.waited || null,
      title: thread.waited ? `waiting ${thread.waited}` : undefined,
    };
  // A draft counting down is where the thread stands: when it sends, as its own line under the bubble says it.
  if (thread.real && thread.veto && countdown.remaining != null && !thread.resolution)
    return {
      pill: (
        <StatePill
          kind="tone"
          value="warn"
          lit
          glyph={<Icon name="clock" size={11} />}
          label={
            <>
              {W.sendsIn} <span className="tabular">{countdownClock(countdown.remaining)}</span>
            </>
          }
        />
      ),
    };
  if (thread.state !== "done" || thread.resolution) return null;
  if (thread.archived) return { pill: <StatePill kind="thread" value="archived" label="Archived" lit /> };
  if (thread.veto) return null;
  // A reply that didn't send, or what they wrote held and closed with nothing sent (contracts unansweredOf), wears the
  // row's own pill and, beside it, how long they have waited. Every other thread nothing waits on is handled.
  if (thread.lastWord && thread.lastWord.short)
    return {
      pill: <StatePill kind="tone" value={thread.lastWord.tone} lit label={thread.lastWord.short} />,
      meta: thread.unanswered ? thread.unanswered.waited : thread.lastWord.at || null,
    };
  return { pill: <StatePill kind="tone" value="ok" lit glyph={<Icon name="check" size={11} />} label={W.handled} /> };
};

/** Where a real thread stands, as the header's second line says it; null where it stands nowhere worth a word. */
export function whereItStands(
  thread: Thread,
  countdown: Countdown = { remaining: null, paused: false },
): ReactElement | null {
  const standing = ixStanding(thread, countdown);
  if (!standing) return null;
  return (
    <span className="ix-th-standing" data-testid="ix-th-standing">
      {standing.pill}
      {standing.meta && (
        <span className="ix-th-standing-meta tabular" title={standing.title}>
          {standing.meta}
        </span>
      )}
    </span>
  );
}

/**
 * WhatsApp's window, shut: a lock and its words, that open why on a press, at the head of the template box that is the
 * one send left (template-box.tsx). A DM's says why in Instagram's words. It stood at the end of the bar under the header,
 * away from the box it explains.
 */
export function ChatClosed({ dm, who }: { dm: boolean; who: string }) {
  const [open, setOpen] = useState(false);
  const W = THREAD_PANE_WORDS;
  return (
    <>
      <div className="ix-closed-line" data-testid="ix-th-window">
        <Icon name="lock" size={14} className="ix-closed-lock" />
        <span className="ix-closed-words">
          <b>{W.chatClosedLead}</b>
          <span className="ix-dock-rest"> — {W.chatClosedRest(shortName(who))}</span>
        </span>
        <Button
          variant="quiet"
          size="text"
          className="ix-closed-why ix-press"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          data-testid="ix-th-window-toggle"
        >
          {W.why}
        </Button>
      </div>
      {open && (
        <span className="ix-why-said" data-testid="ix-th-window-why">
          {dm ? W.dmClosedWhy : W.chatClosedWhy}
        </span>
      )}
    </>
  );
}
