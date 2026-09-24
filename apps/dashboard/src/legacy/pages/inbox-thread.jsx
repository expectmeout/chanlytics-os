/* global React, Icon, ConfidenceDots, TlMedia, EmptyState, FailedRead, Confirm, StatePill */
// Inbox Thread Pane — perfectionist refinement.
// New structure:
//   1. Header (compact — name, channels, actions)
//   2. Context strip (4 micro-facts the operator wants at a glance)
//   3. Approval card v2 (only if needs/drafts) — $ impact strip, evidence expander, next-steps row
//   4. Narrative summary (1-line story)
//   5. Timeline (softer agent bubbles)
//   6. Composer (right-anchored, Approve & Send combo)

const { useState: useCvtState } = React;

// The call is offered once. On a thread the receptionist could not finish by phone, the line under the conversation
// dials and claims it in one press: "I'll call them" only claimed it, and the reply box carried a second Call back
// that only dialled, under a banner telling you to call them back, under a sentence telling you the same. Anywhere
// else on such a thread the reply box carries the call, and for a caller who opted out -- whose reply box offers
// nothing to send -- the header does.
const ixDockDials = (t) => !!(t && t.real && t.phone && t.primaryChannel === "phone"
  && t.state === "escalated" && !t.takenOver && !t.claimedByOther
  && (!window.canDo || window.canDo("approve")));

// Whether the thread's status band offers the call back: the one place it is offered, whichever button it is -- the
// number itself, or taking the thread for a teammate who may not dial it from here. The reply box and the header
// offered their own beside it, so a teammate without approve saw two Call backs saying two different things.
const ixBandCallBack = (t) => !!(t && t.real && t.state === "escalated" && !t.takenOver && !t.claimedByOther
  && (ixDockDials(t) || t.primaryChannel === "phone"));

// The newest thing said in a thread: its last message, written or a call. A flag after it is not something said.
const ixNewestSaid = (timeline) => { for (let i = (timeline || []).length - 1; i >= 0; i--) if (timeline[i].type === "msg") return i; return -1; };

// Where a real thread opens: at the message it was opened at (a call, from Conversations), or where a call began when a
// call is the newest thing said -- its lines are below it, and play is the next thing to press -- else at its newest
// message (null).
const ixOpensAt = (thread, focusMessageId = null) => {
  if (focusMessageId) return focusMessageId;
  const tl = (thread && thread.timeline) || [];
  const i = ixNewestSaid(tl);
  return thread && thread.real && i >= 0 && tl[i].channel === "phone" && tl[i].messageId ? tl[i].messageId : null;
};

// The phone's width, where a thread is the screen and Back is its list (mobile.css, 720px).
const ixPhone = () => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);
// While a thumb carries a thread away, its list is drawn under it (components.css, data-going on the page's grid).
const ixGoing = (el, on) => {
  const host = el && el.parentElement;
  if (host && host.toggleAttribute) host.toggleAttribute("data-going", !!on);
};
// A thread on a phone goes back to its list under the thumb, as Back does: swiped right, it follows the finger and the
// list shows under it (data-bits touchSwipe). Nothing without a Back, and nothing wider than a phone.
const ixSwipeBack = (onBack) => (onBack && window.touchSwipe ? window.touchSwipe({ onBack, when: ixPhone, onGrab: ixGoing }) : {});

const InboxThread = ({ thread, onBack = null, channelLabels, veto = null, vetoPaused = false, onVetoAct = () => {}, onVerdict = () => {}, stale = null, onReconcile = () => {}, onDismissStale = () => {}, onOpenClient = () => {}, onDecide = () => {}, onSnooze = () => {}, onSend = () => {}, onTakeOver = () => {}, onWake = () => {}, onHandBack = () => {}, onMarkUnread = () => {}, onArchive = null, planParam = 0, onPlanParam = () => {}, notice = null, focusMessageId = null }) => {
  // Archive asks first: it closes the customer's request. Above the early return, so the hooks keep their order.
  const [askArchive, setAskArchive] = useCvtState(false);
  // A real thread opens at its newest message and stays with it as messages arrive, unless you have scrolled up to
  // read: it opened at the oldest, and on a phone the words you were answering were two scrolls down. Above the early
  // return, so the hooks keep their order.
  const scrollRef = React.useRef(null);
  const stuckRef = React.useRef(true);
  // How many entries the thread opened with: one that arrives while it is open rises into place (tl-arrived), and the
  // ones it opened with are simply there.
  const seenRef = React.useRef({ id: null, n: 0 });
  // Opened at a message -- a call, from Conversations -- or at the start of a call that is the newest thing said, it
  // opens there instead (ixOpensAt), once the pane has a size to scroll. The thread is read when the effect runs, which
  // is when it first arrives, not when the pane first drew.
  const focusRef = React.useRef(focusMessageId);
  const threadRef = React.useRef(thread);
  threadRef.current = thread;
  const real = !!(thread && thread.real);
  const entries = thread && thread.timeline ? thread.timeline.length : 0;
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!real || !el) return undefined;
    let aim = ixOpensAt(threadRef.current, focusRef.current);
    if (aim) stuckRef.current = false;
    const toEnd = () => {
      if (aim) {
        if (!el.clientHeight) return;
        const at = el.querySelector(`[data-mid="${aim}"]`);
        aim = null;
        if (at) { el.scrollTop += at.getBoundingClientRect().top - el.getBoundingClientRect().top - 16; return; }
        stuckRef.current = true; // not in this thread after all: its newest, as ever
      }
      if (stuckRef.current) el.scrollTop = el.scrollHeight;
    };
    const onScroll = () => { stuckRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; };
    toEnd();
    el.addEventListener("scroll", onScroll, { passive: true });
    // Shown (a phone opens the pane after it mounts) or grown (a photo lands): back to the end, if you were there.
    const seen = typeof ResizeObserver === "function" ? new ResizeObserver(toEnd) : null;
    if (seen) { seen.observe(el); if (el.lastElementChild) seen.observe(el.lastElementChild); }
    return () => { el.removeEventListener("scroll", onScroll); if (seen) seen.disconnect(); };
  }, [real]);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (real && el && stuckRef.current) el.scrollTop = el.scrollHeight;
  }, [real, entries]);
  if (!thread) return <InboxEmpty />;

  const decided = !!thread.resolution;
  const newestSaid = ixNewestSaid(thread.timeline);
  const statusProps = { thread, decided, stale, onReconcile, onDismissStale, onWake, onTakeOver, onDecide, onHandBack, veto, vetoPaused, onVetoAct };
  if (seenRef.current.id !== thread.id) seenRef.current = { id: thread.id, n: thread.timeline.length };
  const seenAt = Math.max(seenRef.current.n, thread.timeline.length - 3);

  return (
    // On a phone the thread is the screen, and a thumb carries it back to its list (ixSwipeBack).
    <div className="ix-thread-pane" {...ixSwipeBack(onBack)}>
      <ThreadHeader thread={thread} channelLabels={channelLabels} onOpenClient={onOpenClient} onSnooze={onSnooze} onMarkUnread={onMarkUnread} onBack={onBack} onArchive={thread.real && onArchive ? () => setAskArchive(true) : null} />
      {thread.real && <ThreadBar thread={thread} />}
      {askArchive && thread.real && onArchive && (
        <Confirm
          block
          question={`Archive ${thread.who}'s conversation?`}
          detail="It leaves the Inbox and their request is closed. If they write again, it comes back."
          yes="Yes, archive"
          no="Not now"
          onYes={() => { setAskArchive(false); onArchive(thread.id); }}
          onNo={() => setAskArchive(false)}
          testid="ix-archive"
        />
      )}
      <ContextStrip thread={thread} />
      {notice && <div className="ix-notice" role="status">{notice}</div>}

      <div className="ix-th-scroll" ref={scrollRef}>
        {!thread.real && <ThreadStatus {...statusProps} />}
        {thread.verdict && !decided && (
          <VerdictCard thread={thread} onVerdict={onVerdict} />
        )}

        {thread.approval && !decided && (
          <ApprovalCard thread={thread} approval={thread.approval} onDecide={onDecide} planParam={planParam} onPlanParam={onPlanParam} />
        )}

        <NarrativeSummary thread={thread} />

        <div className="ix-timeline">
          {thread.timeline.map((entry, i) => {
            // A real thread says a bubble's time once for a run of messages from one side in the same minute, and who
            // sent ours and what became of it on the run's last: every bubble had "WhatsApp · 4:24 PM" over it and
            // "by WhatsApp Receptionist · Read" under it, 79–127px apiece on a phone.
            const run = (a, b) => !!a && !!b && a.type === "msg" && b.type === "msg" && a.from === b.from && a.at === b.at && a.channel === b.channel && (a.agentName || "") === (b.agentName || "") && !!a.byYou === !!b.byYou;
            const lines = thread.real && entry.type === "msg" ? { meta: !run(thread.timeline[i - 1], entry), by: !run(entry, thread.timeline[i + 1]) } : null;
            return <TimelineEntry key={i} entry={entry} thread={thread} channelLabels={channelLabels} lines={lines} focus={!!focusMessageId && entry.messageId === focusMessageId} newest={i === newestSaid} arrived={!!thread.real && i >= seenAt} />;
          })}
        </div>
      </div>
      {thread.real && (
        <div className="ix-th-status" data-testid="ix-th-status">
          <ThreadStatus {...statusProps} />
        </div>
      )}

      {thread.approval?.suggestedReply && !decided && (
        <Composer key={planParam} thread={thread} reply={(thread.approval.plan && thread.approval.plan.param) ? (((thread.approval.plan.param.options || [])[planParam] || {}).reply || thread.approval.suggestedReply) : thread.approval.suggestedReply} hasApproval onSend={onSend} />
      )}
      {/* P0: the mockup hid the composer on "done" because done meant
          "decided, nothing left to do". On real threads "handled" is the
          NORMAL resting state — the receptionist answered and nothing
          escalated — so hiding the composer left the operator with no way to
          follow up with their own customer. Real threads always get a reply
          path; the closed-window branch inside Composer downgrades it to
          approved templates when the 24h window has lapsed. */}
      {(!thread.approval || decided) && (thread.real || thread.state !== "done") && (
        <Composer thread={thread} reply={thread.veto ? thread.veto.draft : ""} onType={thread.veto ? () => onVetoAct(thread.id, "type") : null} onSend={onSend} />
      )}
    </div>
  );
};

// =============== THE THREAD'S STATUS — what it needs from you, one state at a time ===============
// On a real thread it sits under the conversation, by the reply box (InboxThread). Over the timeline it was a stack
// of cards that took a phone's first screen -- Rosa's banner was 262px and her first message started at 427px -- and
// scrolled away with the words. A seeded thread keeps its cards over its story.
// The state's name is the bar's (ThreadBar, under the header): here is what is more than the name -- the reason, what
// they asked, and what to do about it. A quiet thread's one sentence is the bar's, so it says nothing here.
const ThreadStatus = ({ thread, decided, stale, onReconcile, onDismissStale, onWake, onTakeOver, onDecide, onHandBack, veto, vetoPaused, onVetoAct }) => (
  <>
    {stale && (
      <div className="ix-stale">
        <span className="ix-stale-dot" />
        <div className="ix-stale-body">
          <div className="ix-stale-title">{stale.update.by} {stale.update.note} while you were reading</div>
          <div className="ix-stale-sub">Your view is {stale.update.append.filter(e => e.type === "msg").length} message behind — nothing was changed for you.</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onReconcile}><Icon name="refresh" size={12} /> Refresh</button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onDismissStale} aria-label="Dismiss"><Icon name="x" size={12} /></button>
      </div>
    )}
    {decided && (
      <div className={`ix-resolved ${thread.resolution.declined ? "declined" : ""}`}>
        <Icon name={thread.resolution.declined ? "x" : "check"} size={13} />
        <span>You chose <b>“{thread.resolution.action}”</b> at {thread.resolution.at} — {thread.real ? <>{thread.agent.name} is back on this thread.</> : thread.resolution.declined ? <>{thread.agent.name} is handling the fallback{thread.approval && thread.approval.fallback ? `: ${thread.approval.fallback}` : ""}.</> : <>{thread.agent.name} is executing the next steps.</>}</span>
        <button className="cl-bucket-link" onClick={() => window.CHANLY.nav("conversations")}>
          Transcript <Icon name="arrow-right" size={10} />
        </button>
      </div>
    )}

    {thread.state === "snoozed" && (thread.real ? (
      // "Nothing happens until then" was false on a real thread: snooze
      // deliberately does NOT mute the receptionist, so it keeps
      // answering, and a new message from the customer reopens the
      // conversation. Say what a snooze actually is — hidden, not
      // paused — and, when the customer asked for a person, say that
      // the request is still standing rather than letting the operator
      // believe it was dealt with.
      <IxState
        testid="ix-snoozed"
        says={<>Hidden from your queue. The receptionist still answers, and a new message brings it back.{thread.escalationId ? " They asked for a person — that's still waiting for you." : ""}</>}
        acts={<button className="btn btn-ghost btn-sm" onClick={() => onWake(thread.id)} {...window.gate("approve", "wake a conversation")}>Wake now</button>}
      />
    ) : (
      <div className="ix-resolved">
        <Icon name="clock" size={13} />
        <span>Snoozed — back <b>{thread.wake || "tomorrow 10:00"}</b>. Nothing happens until then.</span>
        <button className="cl-bucket-link" onClick={() => onWake(thread.id)} {...window.gate("approve", "wake a conversation")}>
          Wake now <Icon name="arrow-right" size={10} />
        </button>
      </div>
    ))}

    {thread.state === "escalated" && !thread.takenOver && !thread.claimedByOther && (thread.real ? (
      <IxState
        testid="ix-needs-you"
        // The reason's own sentence (ESCALATION_SUMMARIES), never one line for every reason:
        // a held message was not "already answered", and a call back is not a reply.
        says={thread.summary}
        // What they asked, beside the decision: their last message, or what the call left behind.
        ask={thread.ask && thread.ask.kind !== "call" ? <IxAsk ask={thread.ask} /> : null}
        acts={<>
          {ixDockDials(thread) ? (
            <a className="btn btn-sm ix-state-go" href={`tel:${thread.phone}`} onClick={() => onTakeOver(thread.id)} data-testid="ix-call-back">
              <Icon name="phone" size={12} /> Call back
            </a>
          ) : (
            <button className="btn btn-sm ix-state-go" onClick={() => onTakeOver(thread.id)} {...window.gate("approve", "take over a conversation")}>
              {thread.primaryChannel === "phone" ? <><Icon name="phone" size={12} /> Call back</> : "I'll answer this"}
            </button>
          )}
          {/* Two words on the screen, the whole sentence for a screen reader: it was a sentence wearing a button. */}
          {thread.escalationId && (
            <button className="btn btn-ghost btn-sm" onClick={() => onDecide(thread.id, "__HANDBACK__")} aria-label="Nothing needed — hand it back to the receptionist" {...window.gate("approve", "hand a conversation back")}>
              Hand back
            </button>
          )}
        </>}
      />
    ) : (
      <div className="ix-take">
        <Icon name="flag" size={13} />
        <div className="ix-take-body">
          <div className="ix-take-title">Escalated — needs a human voice</div>
          <div className="ix-take-sub">{thread.agent.name} stopped drafting. HR-sensitive threads never get suggested replies.</div>
        </div>
        {/* The buttons beneath the words, wrapping: they shared the words' row, and at 1024 the words were 0px wide (I3). */}
        <div className="ix-take-actions">
          <button className="btn btn-primary btn-sm" onClick={() => onTakeOver(thread.id)} {...window.gate("approve", "take over a conversation")}>
            I'll take this one
          </button>
        </div>
      </div>
    ))}
    {/* A teammate has it. Nothing to take and nothing to hand back: pressing
        "I'll answer this" took it from them without a word, and the hand-back
        resolved their request. A reply still claims it, so that is said first. */}
    {thread.real && thread.claimedByOther && (
      <IxState
        testid="ix-theirs"
        says="The receptionist stays quiet until they hand it back. If you reply, the thread becomes yours."
      />
    )}
    {thread.real && thread.state === "done" && !thread.resolution && (thread.archived ? (
      <IxState
        testid="ix-archived"
        says="Their request is closed. If they write again, it comes back."
      />
    // A draft still waiting to go out is the thread's state, said by its bar: "They wrote last — no reply yet"
    // sat over "Auto-sends in 72s", one saying nothing was coming and the other that it was about to.
    ) : thread.lastWord && !thread.veto && thread.lastWord.short ? (
      // A reply that didn't send: the bar wears the row's pill ("Didn't send"), and here is what it means -- who
      // wrote last and what they know. A quiet thread's one sentence is the bar's alone: it read here too, under
      // "Answered by the receptionist — no one asked for you" over a reply that never left (I1).
      <IxState
        testid="ix-last-word"
        tone={thread.lastWord.tone === "ok" ? null : thread.lastWord.tone}
        says={thread.lastWord.text}
      />
    ) : null)}
    {thread.takenOver && (thread.real ? (
      <IxState
        testid="ix-yours"
        // The reason it was flagged is said here, once: "Where this stands" said it below (I1).
        says={<>The receptionist stays quiet while you have it.{thread.escalationId && thread.summary ? <> {thread.summary}</> : null}</>}
        // What they asked, where you answer it: it was only in the timeline (I3).
        ask={thread.ask && thread.ask.kind !== "call" ? <IxAsk ask={thread.ask} /> : null}
        acts={
          <button className="btn btn-ghost btn-sm" onClick={() => onHandBack(thread.id)} aria-label={`Hand back to ${thread.agent.name}`} {...window.gate("approve", "hand a conversation back")}>
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
        <button className="cl-bucket-link" onClick={() => onHandBack(thread.id)} {...window.gate("approve", "hand a conversation back")}>
          Hand back to {thread.agent.name} <Icon name="arrow-right" size={10} />
        </button>
      </div>
    ))}
    {/* The same trap the composer already documents: in the mockup "done"
        means decided, nothing left to do. On a REAL thread "handled" is the
        normal resting state — the receptionist answered and nothing
        escalated — which is exactly the state a held draft sits in. Gating
        the VetoBar on state !== "done" hid the controls in the common case
        and left the draft unstoppable from the UI. */}
    {thread.veto && !decided && (thread.real || thread.state !== "done") && (
      <VetoBar thread={thread} remaining={veto} paused={vetoPaused} onAct={onVetoAct} onTakeOver={onTakeOver} />
    )}
    {/* The text whisper: only on a real draft that is still counting down.
        A held (manual) draft has Edit; a seeded one has no edge to ask. */}
    {thread.veto && !decided && thread.real && veto != null && thread.veto.messageId && (
      <SteerBox messageId={thread.veto.messageId} />
    )}
  </>
);

// What a real thread's state asks of you, said one way whatever the state: one sentence, what they asked, and what
// you can do about it, under the sentence. It was a dot and a bold title here, an icon and a bold name inside a
// sentence there, a white slab of a button beside a link with an arrow: six looks for one line of a thread. The
// state's name -- the pill its row wears, and its wait -- is the bar's under the header (ThreadBar), said once.
const IxState = ({ says = null, ask = null, acts = null, tone = null, testid = null }) => (
  <div className={`ix-state${tone ? ` ${tone}` : ""}`} data-testid={testid || undefined}>
    {(says || ask) && <div className="ix-state-says">{says}{ask}</div>}
    {acts && <div className="ix-state-acts">{acts}</div>}
  </div>
);

// =============== THE BAR — where the conversation stands, under the header ===============
// One slim line a thread opens on: the pill its row in the list wears (StatePill -- one vocabulary for both) and how
// long they have waited, or a quiet thread's one sentence; and, when WhatsApp's reply window has closed, that it has,
// with why a tap away. It was said three times at the foot of a phone: the standing as a line of its own, the window
// as a red block, and the reply box's refusal under both. Nothing when there is nothing to say.
const ixStanding = (thread) => {
  if (thread.state === "snoozed") return { pill: <StatePill kind="thread" value="snoozed" />, meta: `back ${thread.wake || "tomorrow 10:00"}` };
  if (thread.takenOver) return { pill: <StatePill kind="thread" value="yours" label="You have it" /> };
  const waiting = thread.waited ? `waiting ${thread.waited}` : null;
  if (thread.claimedByOther) return { pill: <StatePill kind="thread" value="theirs" label={`${window.ixAnswerer ? window.ixAnswerer(thread) : "A teammate"} has it`} />, meta: waiting };
  // Amber past half an hour, as the row's pill is.
  if (thread.state === "escalated") return { pill: <StatePill kind="thread" value="escalated" />, meta: waiting, late: thread.waitingMin > 30 };
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

const ThreadBar = ({ thread }) => {
  const standing = ixStanding(thread);
  // Only WhatsApp has a window (replyWindow), and it is the reply box's concern when they opted out, or never
  // wrote on WhatsApp at all: then nothing about a window is true enough to say.
  const closed = thread.hasChat !== false && !thread.optedOut && thread.windowOpen === false;
  if (!standing && !closed) return null;
  return (
    <div className="ix-th-bar" data-testid="ix-th-bar">
      {standing && (
        <span className="ix-th-standing" data-testid="ix-th-standing">
          {standing.pill || <span className={`ix-th-standing-words ${standing.tone}`} title={standing.words}>{standing.words}</span>}
          {standing.meta && <span className={`ix-th-standing-meta tabular${standing.late ? " late" : ""}`}>{standing.meta}</span>}
        </span>
      )}
      {closed && (
        <>
          <span className="ix-th-window" data-testid="ix-th-window">Window closed</span>
          <IxWhy said="The 24-hour WhatsApp window is closed — free-form replies can't be delivered. Approved templates only." testid="ix-th-window-why" />
        </>
      )}
    </div>
  );
};

// The customer's own words beside a decision about them: what they last wrote, or what the call left.
const IxAsk = ({ ask }) => (
  <div className="ix-take-ask" data-testid="ix-take-ask">
    <span className="ix-take-ask-label">{ask.label}</span>
    <span className="ix-take-ask-text">{ask.quoted ? `“${ask.text}”` : ask.text}</span>
  </div>
);

// A file the server writes, fetched the way a link marked `download` fetches it: the menu's items are buttons.
const ixDownload = (href) => {
  const a = document.createElement("a");
  a.href = href;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
};

// The line under the name says the wires the conversation is on, once: "WhatsApp", "Phone · WhatsApp". It spent itself
// on "+1 (917) 555-0114" and "no name saved" -- the number is on their profile, one tap away in the menu.
const ixWires = (thread, labels) => {
  const ws = (thread.channels && thread.channels.length ? thread.channels : [thread.primaryChannel]).filter(Boolean);
  return [...new Set(ws.map((c) => labels[c] || c))].join(" · ");
};

// A menu's groups, a divider between each two that have anything in them.
const ixMenu = (groups) => groups.filter((g) => g.length).flatMap((g, i) => (i ? [{ divider: true }, ...g] : g));

// Who a conversation is with: their face beside their name and the line under it (`children`). Where they have a page
// (`to`), the three are one link to it, as a messaging app's header opens the contact: the whole block is the press, a
// thumb tall on a phone, and the name underlines under a pointer. The call's own header (conversations.jsx) and Live's
// name are the same door.
const IxWho = ({ to = null, go = null, who, avatar, priority = null, children }) => {
  const face = <div className="ix-th-avatar" data-priority={priority || undefined} aria-hidden={to ? "true" : undefined}>{avatar}</div>;
  if (!to || !window.routeDoor) return <div className="ix-th-who">{face}<div className="ix-th-id">{children}</div></div>;
  return (
    <a className="ix-th-who" {...window.routeDoor(to, go)} title={`Open ${who} in People`} data-testid="ix-th-person">
      {face}
      <div className="ix-th-id">{children}</div>
    </a>
  );
};

// =============== HEADER ===============
const ThreadHeader = ({ thread, channelLabels, onOpenClient = () => {}, onSnooze = () => {}, onMarkUnread = () => {}, onBack = null, onArchive = null }) => {
  const channelIcon = (c) => c === "phone" ? "phone" : c === "instagram" ? "instagram" : c === "mail" || c === "email" ? "mail" : "chat";
  const snoozed = thread.state === "snoozed";
  // People lands last on a cold boot (its rows are the heaviest read): a thread opened before it draws the chip below
  // once it does, rather than at the next message.
  const [, peopleTick] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    if (!window.addEventListener) return undefined;
    window.addEventListener("surface:clients", peopleTick);
    return () => window.removeEventListener("surface:clients", peopleTick);
  }, []);
  // Who this is, in one chip beside the wires: their deal when it says more than a visit (0004) -- a client, a
  // proposal waiting -- else a visit ahead on the calendar (People's own day and time), else the last one behind
  // them; nothing when People has none of these, or is not read yet. One chip. Not the band's words: the band says
  // where the conversation stands, this says who they are, which was a page away.
  const person = thread.clientId && window.__PEOPLE && window.__PEOPLE.rows ? window.__PEOPLE.rows.find((p) => p.id === thread.clientId) : null;
  const deal = person && person.deal && person.deal.brief ? person.deal : null;
  // Their proposal's link (0008): contracts' proposalLinkOf over People's row -- the deal's while it is a proposal out,
  // none for a client or someone who passed, the thread's own (the person's) only with no deal, or no row to read.
  // Nothing where deals are off, or before People says whether they are.
  const proposalUrl = window.__PEOPLE && window.__PEOPLE.dealsOn && window.__proposalLinkOf
    ? window.__proposalLinkOf(person ? person.deal : null, thread.proposalUrl)
    : null;
  const visit = deal || !person ? null
    : person.nextVisitDay ? { ahead: true, day: person.nextVisitDay, time: (person.nextVisit || "").split(" · ")[1] || "" }
    : person.lastVisitDay ? { ahead: false, day: `Last · ${person.lastVisitDay}`, time: "" }
    : null;
  // The deal's group (0008): its proposal into the box, and the moves for the stage of the deal People's row carries,
  // each opening the one deal sheet (components/deal-sheet.jsx), which reads them in full. The words are contracts'
  // (deal-sheet.ts dealMenuActs, through window.__deal). The send needs the link above and a wire free text can go on;
  // the moves need a person People has read, on a real workspace.
  const dealKit = window.__deal && window.__deal.menu ? window.__deal : null;
  const DEAL_ICON = { propose: "deal", send: "send", won: "check", lost: "x", edit: "edit", ended: "stop", again: "repeat" };
  // The sheet gives focus back to whatever held it as it opened, and a menu's item is gone by then: the Actions button
  // holds it first, so closing the sheet lands there.
  const toActions = () => {
    const b = typeof document !== "undefined" && document.querySelector ? document.querySelector(".ix-th-head .ix-th-more") : null;
    if (b && b.focus) b.focus();
  };
  const sendItem = dealKit && thread.real && proposalUrl && thread.windowOpen && !thread.optedOut && window.__proposalMessage
    ? {
        label: dealKit.actWords.send,
        hint: window.__linkHost ? window.__linkHost(proposalUrl) : "",
        icon: DEAL_ICON.send,
        onClick: () => window.dispatchEvent(new CustomEvent("inbox:compose", { detail: { text: window.__proposalMessage(proposalUrl), link: proposalUrl } })),
        gate: window.gate("approve", "put the proposal link in the reply"),
      }
    : null;
  const dealItems = dealKit && !window.__DEMO_MODE && thread.clientId && person && window.__PEOPLE.dealsOn && window.openDealSheet
    ? dealKit.menu(person.deal).filter((a) => a.mode).map((a) => ({
        label: a.label,
        icon: DEAL_ICON[a.id] || "deal",
        onClick: () => {
          toActions();
          window.openDealSheet({ personId: thread.clientId, mode: a.mode, dealId: a.mode === "propose" || !person.deal ? null : person.deal.id });
        },
        gate: window.gate("approve", "record a deal"),
      }))
    : [];

  // Who this is opens their page: the face, the name and the line under it are one link (IxWho), as a messaging app's
  // header is. The page was a press away only through Actions › Open profile. A caller with no person has no page.
  const personTo = thread.clientId ? `clients/${thread.clientId}` : null;
  // The seeded "Also in Leads" chip is a button of its own, so it stands beside the link, never inside it.
  const alsoInLeads = thread.leadId ? (() => {
    const ld = (window.LEADS || []).find((l) => l.id === thread.leadId);
    const label = ld ? ({ ready: "Ready", qualifying: "Qualifying", new: "New", nurture: "Nurturing", converted: "Converted", archived: "Archived" }[ld.stage] || ld.stage) : null;
    return (
      <button className="ix-xlink" title="This decision also sits in your Leads queue" onClick={() => window.CHANLY.nav(window.CHANLY.R.lead(thread.leadId))}>
        <Icon name="bolt" size={9} /> Also in Leads{label ? ` · ${label}` : ""}
      </button>
    );
  })() : null;

  return (
    <header className="ix-th-head">
      <div className="ix-th-head-main">
        {/* Phone only (mobile.css): the list and the thread take turns. The arrow alone: the top bar says Inbox over it,
            and "← Inbox" said it again. */}
        {onBack && (
          <button type="button" className="btn btn-ghost btn-sm ix-back" onClick={onBack} aria-label="Back to the list" data-testid="ix-back">
            <span aria-hidden="true">&larr;</span>
          </button>
        )}
        <IxWho to={personTo} go={() => onOpenClient(thread.clientId)} who={thread.who} avatar={thread.avatar} priority={thread.priority}>
          <div className="ix-th-name">
            <span className="ix-th-name-words">{thread.who}</span>
            {thread.pinned && <Icon name="pin" size={11} style={{ color: "var(--ink-faint)" }} />}
            {thread.hasHumanContact && (
              <span className="ix-th-relation" title="Has spoken with a human before">
                <Icon name="users" size={10} />
              </span>
            )}
            {personTo && <span className="ix-th-go" aria-hidden="true"><Icon name="chevron" size={10} /></span>}
          </div>
          <div className="ix-th-sub">
            <div className="ix-th-meta">{thread.real ? ixWires(thread, channelLabels || {}) : thread.whoMeta}</div>
            {deal && (
              <span className={`ix-th-visit${deal.stage === "won" ? " ahead" : ""}`} data-testid="ix-th-deal">
                <Icon name="deal" size={10} />
                <span className="ix-th-visit-words">{deal.brief}</span>
              </span>
            )}
            {visit && (
              <span className={`ix-th-visit${visit.ahead ? " ahead" : ""}`} data-testid="ix-th-visit">
                <Icon name="calendar" size={10} />
                <span className="ix-th-visit-words">
                  {visit.day}
                  {visit.time && <span className="ix-th-visit-time"> · {visit.time}</span>}
                </span>
              </span>
            )}
          </div>
        </IxWho>
        {alsoInLeads}
      </div>
      <div className="ix-th-actions">
        {/* The header says each thing once. A real thread's line under the name names its channel ("WhatsApp · +1 …"),
            and a chip said it again; a seeded thread's line is about the client, so its chips stay. Snooze and the
            profile are in the menu, where they were already. A caller with no WhatsApp thread has Call back in the
            reply box, unless they opted out and the box offers nothing: then it is here. */}
        {!thread.real && (
          <div className="ix-th-channels-meta">
            {thread.channels.map((c) => (
              <span
                key={c}
                className={`ix-channel-chip ${c === thread.primaryChannel ? "primary" : ""}`}
              >
                <Icon name={channelIcon(c)} size={11} />
                {channelLabels[c]}
              </span>
            ))}
          </div>
        )}
        {thread.real && thread.phone && thread.primaryChannel === "phone" && thread.optedOut && !ixBandCallBack(thread) && (
          <a className="btn btn-ghost btn-sm" href={`tel:${thread.phone}`} data-testid="ix-call-back">
            <Icon name="phone" size={12} /> Call back
          </a>
        )}
        {/* A ghost button with a word, lit only while its menu is open: a ⋯ alone in the dim ink was too faint to
            find on a phone. The menu says what to do with the conversation, then with the person, then the file --
            no eyebrow: the menu is the thread's. "Conversation" headed a list of five in capitals, and
            "Receptionist for this person…" broke onto two lines. */}
        <MoreMenu btnClass="btn btn-ghost btn-sm ix-th-more" label="Actions" title="Actions" items={ixMenu([
          [
            // A snoozed thread wakes from its status line ("Wake now"); the header's Snooze button read "Wakes …", disabled.
            ...(snoozed ? [] : [{ label: "Snooze", hint: "until tomorrow 10:00", icon: "clock", onClick: () => onSnooze(thread.id), gate: window.gate("approve", "snooze a conversation") }]),
            // Archive, for the thread in front of you: it lived only in the bulk bar, behind a checkbox a phone never shows.
            ...(onArchive && !thread.archived ? [{ label: "Archive", icon: "check", onClick: onArchive, gate: window.gate("approve", "archive a conversation") }] : []),
            // On a real thread "Mark as unread" flipped a local flag the next
            // realtime reseed wiped, and "Block sender" opened the Ask overlay,
            // a no-op outside a demo: both promised something that did not
            // happen. The real way to stop the receptionist for one person is
            // the mode on their profile, so that is where a real session goes.
            ...(window.__DEMO_MODE ? [{ label: "Mark as unread", icon: "inbox", onClick: () => onMarkUnread(thread.id) }] : []),
          ],
          [
            // clientId is the contact behind the thread, so these only render
            // when there is actually somewhere to go (a phone-only caller has none).
            ...(thread.clientId ? [{ label: "Open profile", icon: "users", onClick: () => onOpenClient(thread.clientId) }] : []),
            ...(!window.__DEMO_MODE && thread.clientId ? [{ label: "Receptionist settings", icon: "shield", onClick: () => onOpenClient(thread.clientId) }] : []),
          ],
          // The deal (0008): its proposal into the box -- the deal's link (above), only where deals are on and free text
          // can go, never to someone who said stop, only on a real thread; the hint says where the link lives
          // (contracts linkHost) -- and the moves for its stage, each opening the sheet. A salon sees none of it.
          [...(sendItem ? [sendItem] : []), ...dealItems],
          [
            // The transcript as a file, from the route that writes it. It was a button in Conversations' header only, so the
            // thread had it in one tab and not the other.
            ...(thread.real && thread.conversationId && window.__href ? [{ label: "Export transcript", icon: "external", onClick: () => ixDownload(window.__href("GET conversations/[id]/export", { id: thread.conversationId })) }] : []),
          ],
          window.__DEMO_MODE ? [{ label: "Block sender", icon: "x", danger: true, onClick: () => window.askAbout({ mode: "compose", prompt: "Block this sender because " }) }] : [],
        ])} />
      </div>
    </header>
  );
};

// =============== CONTEXT STRIP — a seeded thread's micro-facts under the header ===============
// A real thread has none: each fact was said again by its status line and its reply box, and "Paused — you have it"
// sat over a thread nobody had taken.
const ContextStrip = ({ thread }) => {
  if (!thread.contextStrip || thread.contextStrip.length === 0) return null;
  return (
    <div className="ix-context-strip">
      {thread.contextStrip.map((f, i) => {
        const Tag = f.to ? "button" : "div";
        return (
          <Tag
            key={i}
            className={`ix-ctx ${f.warn ? "warn" : ""} ${f.info ? "info" : ""} ${f.to ? "linked" : ""}`}
            title={f.to ? "Open" : undefined}
            onClick={f.to ? () => window.CHANLY.nav(f.to) : undefined}
          >
            <span className="ix-ctx-label">{f.label}</span>
            <span className="ix-ctx-value">{f.value}{f.to && <Icon name="arrow-right" size={8} />}</span>
          </Tag>
        );
      })}
    </div>
  );
};

// =============== NARRATIVE SUMMARY ===============
const NarrativeSummary = ({ thread }) => {
  // A real thread's banner says its one sentence; this said it again below it (I1). The mockup keeps its story.
  if (!thread.summary || thread.real) return null;
  return (
    <div className="ix-summary">
      <span className="ix-summary-eyebrow">{thread.real ? "Where this stands" : "The story so far"}</span>
      <span className="ix-summary-text">{thread.summary}</span>
    </div>
  );
};

// =============== APPROVAL CARD v2 ===============
const ApprovalCard = ({ thread, approval, onDecide = () => {}, planParam = 0, onPlanParam = () => {} }) => {
  const [expanded, setExpanded] = React.useState(null); // 'evidence' | 'alternatives' | 'next' | null
  const plan = approval.plan;

  // Format $ delta with sign
  const fmtDelta = (n) => window.CHANLY.fmtDelta(n);
  const fmtLtv = (n) => (n === 0 || n === undefined) ? null : window.CHANLY.fmtDelta(n) + " LTV";

  return (
    <div className="ix-approval">
      {/* Header — neutral framing, no coral fanfare */}
      <div className="ix-approval-head">
        <div className="ix-approval-meta">
          <span className="ix-approval-kind">{approval.kind}</span>
          {approval.policyClass && <PolicyChip cls={approval.policyClass} className="ix-policy" />}
          <span className="ix-approval-summary">{approval.summary}</span>
        </div>
        <div className="ix-approval-conf">
          <span className="ix-approval-conf-label">Decision confidence</span>
          <ConfidenceMeter level={thread.confidence} />
        </div>
      </div>

      {/* The plan — ONE deterministic action. Approve executes it; Decline runs the
          stated fallback. Nuance lives in the draft, never in new verbs (closed set). */}
      <div className="ix-outcomes ix-one">
        <div className="ix-outcome recommended selected ix-plan">
          <span className="ix-outcome-rec-tag">Agent's plan</span>
          <div className="ix-outcome-action-line">
            <span className="ix-outcome-action">{plan.label}</span>
            {plan.confidence !== undefined && (
              <span className="ix-outcome-conf tabular">{Math.round(plan.confidence * 100)}%</span>
            )}
          </div>
          <div className="ix-outcome-impact">
            <div className="ix-outcome-impact-row">
              <span className="ix-outcome-impact-key">Today</span>
              <span className={`ix-outcome-impact-val tabular ${plan.dollarDelta < 0 ? "neg" : plan.dollarDelta > 0 ? "pos" : "neu"}`}>
                {fmtDelta(plan.dollarDelta)}
              </span>
            </div>
            <div className="ix-outcome-impact-row">
              <span className="ix-outcome-impact-key">LTV</span>
              <span className={`ix-outcome-impact-val tabular ${plan.ltv < 0 ? "neg" : plan.ltv > 0 ? "pos" : "neu"}`}>
                {fmtLtv(plan.ltv) || "—"}
              </span>
            </div>
          </div>
          <div className="ix-outcome-oneliner">{plan.oneLine}</div>
          {plan.param && (
            <div className="cl-tabs ix-param">
              <span className="ix-param-label">{plan.param.label}</span>
              {plan.param.options.map((o, i) => (
                <button key={i} className={`cl-tab ${planParam === i ? "active" : ""}`} onClick={() => onPlanParam(i)}>{o.label}</button>
              ))}
            </div>
          )}
          {approval.fallback && (
            <div className="ix-outcome-fallback">If you decline: {approval.fallback}</div>
          )}
        </div>
      </div>

      {/* Expander row — Why / Alternatives / Next */}
      <div className="ix-approval-expanders">
        <ExpanderToggle
          open={expanded === "evidence"}
          onClick={() => setExpanded(expanded === "evidence" ? null : "evidence")}
          icon="search"
          label="Why this recommendation"
          count={approval.evidence?.length}
        />
        <ExpanderToggle
          open={expanded === "alternatives"}
          onClick={() => setExpanded(expanded === "alternatives" ? null : "alternatives")}
          icon="filter"
          label="What was considered"
          count={approval.alternatives?.length}
        />
        <ExpanderToggle
          open={expanded === "next"}
          onClick={() => setExpanded(expanded === "next" ? null : "next")}
          icon="arrow-right"
          label="What happens next"
          count={approval.nextSteps?.length}
        />
      </div>

      {expanded === "evidence" && (
        <ExpanderPanel>
          <div className="ix-approval-evidence">
            {approval.evidence?.map((e, i) => (
              <div key={i} className={`ix-evid ${e.to ? "linked" : ""}`} onClick={e.to ? () => window.CHANLY.nav(e.to) : undefined} role={e.to ? "button" : undefined}>
                <span className={`ix-evid-kind kind-${e.kind}`}>{e.kind}</span>
                <div className="ix-evid-body">
                  <div className="ix-evid-label">{e.label}{e.to && <Icon name="arrow-right" size={9} style={{ marginLeft: 5, color: "var(--ink-faint)" }} />}</div>
                  <div className="ix-evid-detail">{e.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </ExpanderPanel>
      )}

      {expanded === "alternatives" && (
        <ExpanderPanel>
          <div className="ix-approval-alts">
            {approval.alternatives?.map((a, i) => (
              <div key={i} className="ix-alt">
                <Icon name="x" size={11} />
                <div className="ix-alt-body">
                  <div className="ix-alt-label">{a.label}</div>
                  <div className="ix-alt-why">{a.why}</div>
                </div>
              </div>
            ))}
          </div>
        </ExpanderPanel>
      )}

      {expanded === "next" && (
        <ExpanderPanel>
          <div className="ix-approval-next">
            <div className="ix-next-title">If you {approval.recommended.toLowerCase()}, {thread.agent.name} will:</div>
            {approval.nextSteps?.map((s, i) => (
              <div key={i} className="ix-next-step">
                <span className={`ix-next-mark ${s.auto ? "auto" : "manual"}`}>
                  {s.auto ? <Icon name="check" size={10} /> : <Icon name="agents" size={10} />}
                </span>
                <div className="ix-next-body">
                  <div className="ix-next-label">{s.label}</div>
                  {s.hint && <div className="ix-next-hint">{s.hint}</div>}
                </div>
                <span className={`ix-next-tag ${s.auto ? "auto" : "manual"}`}>
                  {s.auto ? "auto" : "next"}
                </span>
              </div>
            ))}
          </div>
        </ExpanderPanel>
      )}

      {/* Footer — decide row + agent attribution + shortcuts */}
      <div className="ix-approval-foot">
        <div className="ix-approval-decide">
          <button className="btn btn-primary btn-sm" onClick={() => onDecide(thread.id, "Approve", plan.param ? { param: (plan.param.options[planParam] || {}).label } : {})} {...window.gate("approve")}>
            <Icon name="check" size={12} /> {plan.cta || "Approve"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => window.dispatchEvent(new CustomEvent("inbox:focus-composer"))}>
            Edit reply
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onDecide(thread.id, "Decline")} {...window.gate("approve")}>
            Decline
          </button>
        </div>
        <span className="ix-approval-hint">
          <span>{thread.agent.name} · {thread.agent.autonomy}</span>
        </span>
        <div className="ix-approval-shortcuts">
          <span className="kbd">A</span><span className="kbd-text">Approve</span>
          <span className="kbd">D</span><span className="kbd-text">Decline</span>
          <span className="kbd">E</span><span className="kbd-text">Edit</span>
        </div>
      </div>
    </div>
  );
};

const ExpanderToggle = ({ open, onClick, icon, label, count }) => (
  <button className={`ix-exp-toggle ${open ? "open" : ""}`} onClick={onClick}>
    <Icon name={icon} size={11} />
    <span>{label}</span>
    {count !== undefined && <span className="ix-exp-count tabular">{count}</span>}
    <Icon name={open ? "chevron-up" : "chevron-down"} size={10} />
  </button>
);

const ExpanderPanel = ({ children }) => (
  <div className="ix-exp-panel">{children}</div>
);

// =============== CONFIDENCE METER (linear) ===============
const ConfidenceMeter = ({ level }) => {
  const pct = Math.round(level * 100);
  const tone = window.CHANLY.confTone(level);
  return (
    <div className={`conf-meter conf-${tone}`}>
      <div className="conf-meter-bar">
        <div className="conf-meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="conf-meter-label tabular">{pct}%</span>
    </div>
  );
};

// =============== TIMELINE ENTRY ===============
// A link in a message is a link. The body is plain text — the customer's words or the
// receptionist's — so it is split on the address and rendered as nodes, never as HTML. The
// address is clipped by CSS (.tl-msg-link), so the whole of it stays selectable and copyable:
// a booking URL took five lines of a bubble and could not be tapped.
const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>()[\]{}"']+[^\s<>()[\]{}"'.,;:!?]/gi;
const Linked = ({ text }) => {
  const s = text == null ? "" : String(text);
  if (!s) return null;
  const out = [];
  let last = 0;
  for (const m of s.matchAll(URL_IN_TEXT)) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(<a key={m.index} className="tl-msg-link" href={m[0]} target="_blank" rel="noopener noreferrer nofollow" title={m[0]}>{m[0]}</a>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return <>{out}</>;
};

// What an email quoted back at us is kept, not shown: "Got it, thanks!" arrived as six lines of
// "On Thu, Sep 17, 2026 at 10:44 PM … wrote: >". The split is the viewmodel's (splitQuotedReply),
// so Conversations draws the same messages the same way.
const TlMsgBody = ({ text, quoted }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Linked text={text} />
      {quoted && (
        <>
          <button type="button" className="tl-msg-quote-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="tl-msg-quote-toggle">
            {open ? "Hide quoted text" : "Show quoted text"}
          </button>
          {open && <div className="tl-msg-quote" data-testid="tl-msg-quote">{quoted}</div>}
        </>
      )}
    </>
  );
};

// Why it said that: the intent and how sure it was. It rode the meta line as two more spans,
// which is what wrapped that line into columns on a phone — and its reason sat in a title
// attribute no touch screen can open. A tap now, with the facts it used. The button belongs to
// the meta line; the panel is that line's sibling, because the line does not wrap.
const TlWhyButton = ({ why, open, onToggle }) => (
  <button
    type="button"
    className="tl-msg-why"
    aria-expanded={open}
    aria-label={`Why the receptionist said this — ${why.summary}`}
    onClick={onToggle}
    data-testid="tl-msg-why"
  >
    <span className="tl-msg-why-full">· {why.summary}</span>
    <span className="tl-msg-why-short">Why</span>
  </button>
);

const TlWhyPanel = ({ why }) => {
  const facts = why.facts && why.facts.length ? why.facts : null;
  return (
    <div className="tl-msg-why-panel" data-testid="tl-msg-why-panel">
      <div className="tl-msg-why-sum">{why.summary}</div>
      {why.reason && <div className="tl-msg-why-reason">{why.reason}</div>}
      {facts && <div className="tl-msg-why-facts">Used: {facts.join(" · ")}</div>}
    </div>
  );
};

const TimelineEntry = ({ entry, thread, channelLabels, lines = null, focus = false, newest = false, arrived = false }) => {
  const channelIcon = (c) => c === "phone" ? "phone" : c === "instagram" ? "instagram" : c === "mail" || c === "email" ? "mail" : "chat";

  if (entry.type === "agent-thinking" || entry.type === "agent-decision") {
    const isDecision = entry.type === "agent-decision";
    return (
      <div className={`tl-agent ${isDecision ? "decision" : "thinking"}`}>
        <span className="tl-agent-glyph">
          <span className="agent-avatar" style={{ width: 18, height: 18, fontSize: 9 }}>{thread.agent.glyph}</span>
        </span>
        <div className="tl-agent-body">
          <div className="tl-agent-head">
            <span className="tl-agent-name">{entry.agent}</span>
            <span className="tl-agent-verb">{isDecision ? "decided" : "thinking"}</span>
            <span className="tl-agent-time tabular">{entry.at}</span>
          </div>
          <div className="tl-agent-text">{entry.body}</div>
        </div>
      </div>
    );
  }

  if (entry.type === "event") {
    return (
      <div className="tl-event">
        <span className="tl-event-spine" />
        <span className="tl-event-text">{entry.body}</span>
        <span className="tl-event-time tabular">{entry.at}</span>
      </div>
    );
  }

  return <TlMsgEntry entry={entry} thread={thread} channelLabels={channelLabels} lines={lines} channelIcon={channelIcon} focus={focus} newest={newest} arrived={arrived} />;
};

// The message branch, with the hooks its two disclosures need. It is its own component so those
// hooks are not behind the event and agent-thinking returns above.
const TlMsgEntry = ({ entry, thread, channelLabels, lines, channelIcon, focus = false, newest = false, arrived = false }) => {
  const [whyOpen, setWhyOpen] = React.useState(false);
  // A call is part of the conversation, where it happened: its note was a dashed bubble of words nobody said. Its lines
  // are shown when it is the newest thing said, or the call Conversations opened the thread at.
  if (thread.real && entry.channel === "phone") return <ThreadCall call={tlCallFor(entry.messageId)} note={entry.body} at={entry.at} mid={entry.messageId} focus={focus} open={focus || newest} />;
  const isClient = entry.from === "client";
  // A held draft is a message the customer has NOT seen. Rendered as an
  // ordinary agent bubble it reads as already-sent, and an operator would
  // either ignore it or apologise for something that never went out.
  const held = !!entry.pending;
  // Words that never left are dashed: the receptionist's failed reply was drawn as a sent bubble (I1).
  const undelivered = !isClient && !held && entry.reachedCustomer === false;
  // A real thread whose words travelled one wire says the time alone: the wire is in the header, and it was over every
  // bubble. A call is drawn as a call, so it is not a second wire for the words.
  const named = !thread.real || (thread.channels || []).filter((c) => c !== "phone").length > 1;
  return (
    <div className={`tl-msg ${isClient ? "client" : "agent"}${held ? " held" : ""}${undelivered ? " undelivered" : ""}${arrived ? " tl-arrived" : ""}`} data-mid={entry.messageId}>
      <div className="tl-msg-bubble">
        {(!lines || lines.meta) && (
          <div className="tl-msg-meta">
            {named && <Icon name={channelIcon(entry.channel)} size={10} />}
            {named && <span>{channelLabels[entry.channel]}</span>}
            <span className="tl-msg-time tabular">{entry.at}</span>
          </div>
        )}
        {/* An email says what it is about before it says it. */}
        {entry.subject && <div className="tl-msg-subject" data-testid="tl-msg-subject">{entry.subject}</div>}
        <div className="tl-msg-body"><TlMsgBody text={entry.body} quoted={entry.quoted} /></div>
        {entry.media && <TlMedia media={entry.media} />}
        {/* An email's files are not kept, and its words only up to a bound: the bubble says so, or "see attached" reads as the whole of it. */}
        {entry.leftOut && <div className="tl-msg-note" data-testid="tl-msg-left-out"><Icon name="info" size={11} /> {entry.leftOut}</div>}
        {/* What became of words that did not reach them is said on their own bubble, whatever follows. */}
        {!isClient && (!lines || lines.by || held || entry.reachedCustomer === false) && (
          <div className="tl-msg-by">
            {entry.byYou ? (
              <>
                {/* The time is over the bubble already (.tl-msg-meta); it was printed twice
                    within forty pixels. What gives way when the line is short is the author —
                    never what became of the message. */}
                <span className="tl-msg-author">by {entry.byWords || (entry.via ? (entry.via.kind === "playbook" ? `the ${entry.via.name} playbook` : `a broadcast (${entry.via.name})`) : "you")}</span>
                {/* One vocabulary, computed in the viewmodel. This ternary was
                    the only place these words existed, so the Conversations
                    pane — which shows the same messages — said nothing at all
                    and rendered a canceled reply as a delivered one. */}
                {entry.statusLabel ? <span> · {entry.statusLabel}</span> : null}
              </>
            ) : (
              <>
                {/* Per-bubble when the viewmodel supplies it: a phone call
                    summary is the Phone Receptionist's work, not the WhatsApp
                    one's. Seeded threads carry no per-entry agent and keep the
                    thread-level identity they have always used. */}
                <span className="tl-msg-author">by {entry.agentName || thread.agent.name}</span>
                {/* Why it said that, when the row remembers: a tap, not a hover. */}
                {entry.why && <TlWhyButton why={entry.why} open={whyOpen} onToggle={() => setWhyOpen((v) => !v)} />}
                {/* What became of it, as the team's bubbles say: "Didn't send", "Canceled before sending", "Read". */}
                {!held && entry.statusLabel ? <span> · {entry.statusLabel}</span> : null}
                {held && <span className="tl-held-tag">Not sent yet</span>}
              </>
            )}
          </div>
        )}
        {entry.why && whyOpen && <TlWhyPanel why={entry.why} />}
      </div>
    </div>
  );
};

// =============== A CALL, IN ITS CONVERSATION ===============
// A call is part of the thread, not a card on it (docs/plans/2026-09-21-calls-you-can-follow.md): a quiet line where it
// began, what was said as the thread's own bubbles -- the caller's on the left, the receptionist's on the right -- and a
// quiet line where it ended. Pressing play, or a line, plays it: a slim player floats at the top of the thread while the
// lines pass under it, and the line being said is outlined and kept in view. It was a 420px card with its transcript
// behind a tap and a strip of a player, and before that a second screen in Conversations (#775).

// The call a note stands for, from the calls Conversations reads: one GET calls page, which every surface boots with.
// A call older than that page is drawn from its note alone.
const tlCallFor = (messageId) => {
  if (!messageId) return null;
  const rows = ((window.CONVERSATIONS_DATA || {}).CONVERSATIONS) || [];
  return rows.find((c) => c.callId && c.messageId === messageId) || null;
};

// A note as the call wrote it (voice-retell.ts callSummaryLine): "Inbound call · 3 min — what they wanted (outcome)".
// A short call's note can say its seconds instead ("Inbound call · 23 s — …"): three of the salon's 34 do.
const tlNoteOf = (body) => {
  const text = String(body || "").trim();
  const m = /^(Inbound|Outbound) call(?: · (\d+) (min|s|sec))? — ([\s\S]*)$/.exec(text);
  if (!m) return { direction: "inbound", length: null, about: text || null };
  const about = m[4].trim();
  return { direction: m[1] === "Outbound" ? "outbound" : "inbound", length: m[2] ? `${m[2]} ${m[3] === "min" ? "min" : "sec"}` : null, about: /^No summary available\.?$/.test(about) ? null : about };
};

const tlClock = (sec) => { const s = Math.max(0, Math.floor(sec || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const TL_SPEEDS = [1, 1.5, 2];
// The line being said at `pos` seconds: the last one that had begun by then. A line with no moment (a whisper) never is.
const tlLineAt = (lines, pos) => { let at = -1; lines.forEach((l, i) => { if (typeof l.start === "number" && l.start <= pos + 0.05) at = i; }); return at; };
// One call plays at a time: the one playing, which the next to play pauses.
const TL_PLAYING = { el: null };
// How far the thread moves to keep the line being said in view, or 0. `view.top` is where reading starts, below the
// player. A line under the player comes out just below it: pressing ▶ puts the player above the call's first line, the
// browser's scroll anchoring slides it over that line, and bringing the line to a quarter of the pane moved the call's
// lines under the reader's finger: 150px on a real thread in a 567px pane, where this moves them 8. A line below the fold
// comes up with some of what follows it in view, and one that starts in view is never pulled back up.
const tlFollowBy = (line, view) => {
  if (line.top >= view.top && line.bottom <= view.bottom - 24) return 0;
  if (line.top < view.top) return line.top - view.top;
  return Math.max(0, line.top - view.top - view.height * 0.25);
};

// `call`: the call itself, when it has been read; `note`: the words it left on the thread, which are all an older call
// has. `open`: its lines shown -- the thread's newest spoken entry, or the call Conversations opened it at. On the side
// it came from, for its direction; drawn across the thread, for it is neither side's words.
const ThreadCall = ({ call = null, note = null, at, mid, open: openFirst = false, focus = false }) => {
  const [open, setOpen] = React.useState(!!openFirst);
  const [listening, setListening] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [pos, setPos] = React.useState(0);
  const [dur, setDur] = React.useState((call && call.durationSec) || 0);
  const [speed, setSpeed] = React.useState(1);
  const [failed, setFailed] = React.useState(null); // the sentence, while the recording can't be played
  const audioRef = React.useRef(null);
  const turnsRef = React.useRef(null);
  const followed = React.useRef(-1);
  const lines = call && call.transcript && call.transcript.length ? call.transcript : null;
  const active = listening && lines ? tlLineAt(lines, pos) : -1;

  // Keep the line being said in view -- unless you have scrolled away from the one before it: then you are reading
  // something else, and the thread does not pull you back.
  React.useEffect(() => {
    const list = turnsRef.current;
    if (!list || active < 0 || !list.closest) return;
    const scroller = list.closest(".ix-th-scroll");
    const now = list.children[active];
    const before = followed.current >= 0 ? list.children[followed.current] : null;
    followed.current = active;
    if (!scroller || !now) return;
    const box = scroller.getBoundingClientRect();
    const bar = list.parentElement ? list.parentElement.querySelector(".tl-listen") : null;
    const top = box.top + (bar ? bar.offsetHeight + 12 : 0);
    const seen = (n) => { if (!n) return true; const r = n.getBoundingClientRect(); return r.bottom > top && r.top < box.bottom; };
    if (!seen(before)) return;
    const by = tlFollowBy(now.getBoundingClientRect(), { top, bottom: box.bottom, height: box.height });
    if (!by) return;
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollBy({ top: by, behavior: still ? "auto" : "smooth" });
  }, [active]);

  const said = call ? null : tlNoteOf(note);
  const direction = call ? call.direction || "inbound" : said.direction;
  const missed = !!(call && call.missed);
  // A seeded call carries its words as the old card's headline.
  const about = call ? ("about" in call ? call.about : call.summary ? call.summary.headline : null) : said.about;
  const length = call ? (missed ? null : call.duration || null) : said.length;
  const kind = missed ? (direction === "outbound" ? "Call didn't connect" : "Missed call") : direction === "outbound" ? "Outbound call" : "Inbound call";
  const facts = (call && call.facts) || [];
  const them = (call && (call.whoShort || call.who)) || "Caller";
  // The recording is the route's own address: it redirects to a link signed for each request, so a seek or a play after a
  // long pause is signed afresh (calls/[id]/recording). The route names the workspace as every read does.
  const real = !!(call && call.real && !window.__DEMO_MODE && window.__href);
  const src = real && call.recordingState === "ready" ? window.__href("GET calls/[id]/recording", { id: call.callId }) : null;
  const file = real && lines ? window.__href("GET calls/[id]/export", { id: call.callId }) : null;

  const el = () => audioRef.current;
  const play = () => {
    const a = el();
    if (!a) return;
    setListening(true);
    setFailed(null);
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => setFailed("Couldn't play the recording."));
  };
  const listen = () => { setOpen(true); play(); };
  const toggle = () => {
    const a = el();
    if (!a) return;
    // Asked again: the route signs a new link for the new request.
    if (failed) { a.load(); play(); return; }
    if (a.paused) play(); else a.pause();
  };
  const seek = (sec) => { const a = el(); if (!a) return; a.currentTime = sec; setPos(sec); };
  const playFrom = (sec) => { const a = el(); if (!a || typeof sec !== "number") return; seek(sec); if (a.paused) play(); else setListening(true); };
  const cycle = () => { const next = TL_SPEEDS[(TL_SPEEDS.indexOf(speed) + 1) % TL_SPEEDS.length]; setSpeed(next); if (el()) el().playbackRate = next; };
  const stop = () => { const a = el(); if (a) a.pause(); setListening(false); };
  const pct = dur ? Math.min(100, (pos / dur) * 100) : 0;

  return (
    <div className={`tl-call ${direction}${listening ? " listening" : ""}${focus ? " focus" : ""}`} data-mid={mid} data-testid="tl-call">
      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onPlay={(e) => {
            // One call at a time: this one playing pauses the one that was.
            if (TL_PLAYING.el && TL_PLAYING.el !== e.target && TL_PLAYING.el.pause) TL_PLAYING.el.pause();
            TL_PLAYING.el = e.target;
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => setPos(e.target.currentTime)}
          onLoadedMetadata={(e) => setDur(e.target.duration || (call && call.durationSec) || 0)}
          onError={() => { setPlaying(false); setFailed("Couldn't play the recording."); }}
        />
      )}
      {src && listening && (
        <div className="tl-listen" role="group" aria-label={`The call with ${them}`} data-testid="tl-listen">
          <button type="button" className="tl-listen-play" onClick={toggle} aria-label={failed ? "Try the recording again" : playing ? "Pause" : "Play"} data-testid="tl-listen-play">
            <Icon name={playing ? "pause" : "play"} size={12} />
          </button>
          <span className="tl-listen-who">{them}</span>
          <input
            type="range"
            className="tl-listen-track"
            min="0"
            max={dur || 0}
            step="0.1"
            value={Math.min(pos, dur || 0)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Position in the call"
            aria-valuetext={`${tlClock(pos)} of ${tlClock(dur)}`}
            style={{ "--fill": `${pct}%` }}
            data-testid="tl-listen-track"
          />
          {failed
            ? <span className="tl-listen-failed" role="status" data-testid="tl-listen-failed">{failed}</span>
            : <span className="tl-listen-clock tabular">{tlClock(pos)} / {tlClock(dur)}</span>}
          <button type="button" className="tl-listen-speed tabular" onClick={cycle} aria-label={`Speed ${speed}×. Change it`} data-testid="tl-listen-speed">{speed}×</button>
          <button type="button" className="tl-listen-close" onClick={stop} aria-label="Stop listening" data-testid="tl-listen-close"><Icon name="x" size={12} /></button>
        </div>
      )}
      <div className="tl-call-mark" data-testid="tl-call-start">
        {src && !listening
          ? <button type="button" className="tl-call-play" onClick={listen} aria-label={`Listen to the call${length ? `, ${length}` : ""}`} data-testid="tl-call-play"><Icon name="play" size={10} /></button>
          : <span className="tl-call-glyph" aria-hidden="true"><Icon name="phone" size={11} /></span>}
        {/* What it was, then when, set apart by space rather than a dot: on a narrow phone the when takes its own line,
            and a dot began it. */}
        <span className="tl-call-words">
          <span className="tl-call-what">
            <span className="tl-call-kind">{kind}</span>
            {length && <span className="tl-call-length tabular">{length}</span>}
            {/* A call with no lines says how it went on its one line: "Missed call · No answer". */}
            {!lines && facts.length > 0 && <span className="tl-call-facts">{facts.join(" · ")}</span>}
          </span>
          <span className="tl-call-at tabular">{at}</span>
        </span>
      </div>
      {lines && open && (
        <>
          <div className="tl-call-turns" ref={turnsRef} data-testid="tl-call-lines">
            {lines.map((line, i) => {
              const whisper = line.speaker === "whisper";
              const playable = !!src && !whisper && typeof line.start === "number";
              return (
                <div
                  key={i}
                  className={`tl-msg ${line.speaker === "client" ? "client" : "agent"} tl-spoken${whisper ? " whisper" : ""}${i === active ? " now" : ""}${playable ? " playable" : ""}`}
                  aria-current={i === active ? "true" : undefined}
                  // A line plays from itself -- unless you were selecting its words to copy them.
                  onClick={playable ? () => { const sel = window.getSelection ? window.getSelection() : null; if (!sel || sel.isCollapsed) playFrom(line.start); } : undefined}
                  data-testid="tl-spoken"
                >
                  <div className="tl-msg-bubble">
                    <div className="tl-msg-meta">
                      {/* Who spoke, for a screen reader: the side says it to the eye. */}
                      {!whisper && <span className="tl-spoken-who">{line.speaker === "agent" ? "Receptionist" : them}</span>}
                      {whisper && <span className="tl-spoken-whisper">You whispered</span>}
                      {playable
                        ? <button type="button" className="tl-spoken-t tabular" onClick={(e) => { e.stopPropagation(); playFrom(line.start); }} aria-label={`Play from ${tlClock(line.start)}`}>{tlClock(line.start)}</button>
                        : !whisper && typeof line.start === "number" ? <span className="tl-msg-time tabular">{tlClock(line.start)}</span> : null}
                    </div>
                    <div className="tl-msg-body">{line.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="tl-call-mark end" data-testid="tl-call-end">
            <span className="tl-call-ended">{["Call ended", ...facts].join(" · ")}</span>
            {file && <a className="tl-call-file" href={file} download aria-label="Download the transcript" title="Download the transcript"><Icon name="download" size={11} /></a>}
          </div>
        </>
      )}
      {lines && !open && (
        <div className="tl-call-folded">
          {about && <span className="tl-call-about">{about}</span>}
          <button type="button" className="tl-call-open" aria-expanded="false" onClick={() => setOpen(true)} data-testid="tl-call-open">
            Show the call · {lines.length} {lines.length === 1 ? "line" : "lines"}
          </button>
        </div>
      )}
      {!lines && about && <div className="tl-call-about">{about}</div>}
    </div>
  );
};

// =============== VERDICT CARD — post-meeting, human-only (closed set) ===============
const VerdictCard = ({ thread, onVerdict = () => {} }) => {
  const v = thread.verdict;
  return (
    <div className="ix-approval ix-verdict">
      <div className="ix-approval-head">
        <div className="ix-approval-meta">
          <span className="ix-approval-kind">Meeting verdict</span>
          <span className="ix-approval-summary">Agents stood down at meeting start.</span>
        </div>
      </div>
      <div className="ix-verdict-opts">
        {v.options.map((o) => (
          <button key={o.verb} className="ix-verdict-opt" onClick={() => onVerdict(thread.id, o)} {...window.gate("approve")}>
            <Icon name={o.icon} size={14} />
            <span className="ix-verdict-label">{o.label}</span>
            <span className="ix-verdict-sub">{o.sub}</span>
          </button>
        ))}
      </div>
      <div className="ix-approval-foot">
        <span className="ix-approval-hint">Unanswered → Interested in 48h. Details editable later.</span>
        {v.apptId && (
          <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.appt(v.apptId))}>
            On the calendar <Icon name="arrow-right" size={10} />
          </button>
        )}
      </div>
    </div>
  );
};

// =============== STEER — rewrite a held draft to the owner's instruction ===============
// The WhatsApp counterpart of the call whisper. One line, and the receptionist
// writes the waiting draft again with it in mind, under the same rules; the
// new draft waits its turn like the first one. Nothing is sent from here.
const SteerBox = ({ messageId }) => {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [toastNode, flash] = window.usePPToast();
  const send = async () => {
    const t = text.trim();
    if (!t || busy || !window.__steerDraft) return;
    setBusy(true);
    const r = await window.__steerDraft(messageId, t);
    setBusy(false);
    if (r.ok) {
      setText("");
      flash({ msg: <>Rewritten — the new draft waits its turn like the first one</> });
    } else {
      flash({ tone: "danger", msg: <>Not rewritten — {r.message}</> });
    }
  };
  return (
    <div className="ix-steer" data-testid="steer-box">
      <Icon name="sparkle" size={12} />
      <input
        className="ix-steer-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") send(); }}
        placeholder="Tell it what to change — “mention Saturday is full”, “shorter, in Spanish”"
        maxLength={500}
        disabled={busy}
        aria-label="Instruction for the rewrite"
      />
      <button className="btn btn-sm" onClick={send} disabled={busy || !text.trim()} {...window.gate("approve")}>
        {busy ? "Rewriting…" : "Rewrite"}
      </button>
      {toastNode}
    </div>
  );
};

// =============== VETO BAR — countdown on a safe draft ===============
const VetoBar = ({ thread, remaining, paused = false, onAct = () => {}, onTakeOver = () => {} }) => (
  <div className={`ix-veto ${remaining == null ? "held" : paused ? "paused" : remaining <= 10 ? "urgent" : ""}`}>
    <span className="ix-veto-dot"></span>
    <span className="ix-veto-msg" role="timer" data-tip={thread.real ? "This draft sends itself at zero. Hold stops it, and so does starting to type a reply." : "This draft sends itself at zero — Edit, Hold, or typing a reply cancels it"}>
      {remaining != null
        ? (paused ? <>Paused at <b>{remaining}s</b> — you're away</> : thread.real && remaining === 0 ? <b>Sending now…</b> : <><b>Auto-sends in {remaining}s</b></>)
        : <>Held — manual send</>}
    </span>
    {/* What a screen reader hears: the hold and the send, not a number every second (I3). */}
    <span className="ix-veto-said" role="status">{remaining == null ? "Held — this draft will not send." : thread.real && remaining === 0 && !paused ? "Sending now." : ""}</span>
    {thread.veto.policyClass && <PolicyChip cls={thread.veto.policyClass} />}
    {thread.veto.why && (
      <span className="ix-veto-why" title={thread.veto.why.reason || ""}>
        {thread.veto.why.heldFor === "low_confidence" ? "Not sure enough to send alone · " : ""}
        {thread.veto.why.summary}
        {thread.veto.why.facts.length ? ` · used: ${thread.veto.why.facts.join(", ")}` : ""}
      </span>
    )}
    {(() => { const t = window.TRUST && window.TRUST.agent(window.CHANLY.agentIdFor(thread.agent.name)); return t ? <span className="ix-veto-trust" data-tip="30-day edit rate — under 5% is the earn-more-autonomy signal">{thread.agent.name} · {window.TRUST.rate(t)}% edit rate</span> : null; })()}
    <span className="ix-veto-spacer"></span>
    {remaining != null && (
      <>
        <button className="btn btn-ghost btn-sm" onClick={() => onAct(thread.id, "edit")} {...window.gate("approve")}>Edit</button>
        <button className="btn btn-sm" onClick={() => onAct(thread.id, "hold")} {...window.gate("approve")}>Hold</button>
      </>
    )}
    <button className="btn btn-ghost btn-sm" onClick={() => onTakeOver(thread.id)} {...window.gate("approve")}>Take over</button>
  </div>
);

// =============== COMPOSER ===============
// Outside the 24-hour window WhatsApp will deliver exactly one thing: a
// pre-approved template. This was referenced by the closed-window composer but
// never actually written — so any escalated thread older than 24h crashed the
// whole Inbox pane rather than offering the one send that would work.
// Named after what it SENDS, not after the mechanism: the operator should know
// what lands on their customer's phone before they click.
// An explanation one tap away, never in the way (the house rule): which templates cannot go to this person, and why,
// was a sentence of its own under the reply box -- thirty-one words to say that nothing could be sent.
const IxWhy = ({ said, testid = null }) => {
  const [open, setOpen] = useCvtState(false);
  return (
    <>
      {" "}
      <button type="button" className="ix-why" aria-expanded={open} onClick={() => setOpen(!open)}>Why?</button>
      {open && <span className="ix-why-said" data-testid={testid || undefined}>{said}</span>}
    </>
  );
};

const TemplateSendButton = ({ onSend = () => {}, threadId, real = false, thread = null }) => {
  const [sending, setSending] = useCvtState(false);
  // The workspace's OWN approved templates, published by the seam. The button
  // used to name one by a hardcoded literal — booking_link_v1/en_US — which is
  // right for exactly one workspace and a guaranteed failure for every other,
  // including every newly created one, which has no template row at all.
  // undefined: still being read. null: the read failed (surface-data.ts), which is not "none approved".
  const readTemplates = window.__TEMPLATES;
  const templates = Array.isArray(readTemplates) ? readTemplates : null;
  const [picked, setPicked] = useCvtState(0);

  // On a seeded thread there is nothing to look up and nothing to send; keep
  // the mockup's own affordance.
  // The templates this person can be sent, in the owner's words, and why the rest are not offered: the composer
  // offered every approved one, and the reply route refuses a promotion to someone who has not said yes to offers
  // and a template with values the Inbox does not fill (I4).
  const choice = real && templates && thread && window.__inboxTemplates
    ? window.__inboxTemplates(templates, { who: thread.who, offersOk: !!thread.offersOk })
    : null;
  const list = real ? (choice ? choice.sendable.map((s) => s.template) : templates) : null;
  const chosenAt = list && list.length ? Math.min(picked, list.length - 1) : -1;
  const chosen = chosenAt >= 0 ? list[chosenAt] : null;
  const chosenTitle = choice && chosenAt >= 0 ? choice.sendable[chosenAt].title : null;

  const fire = () => {
    if (sending || !window.canDo("approve")) return;
    if (real && !chosen) return;
    const r = onSend(threadId, chosen ? { template: chosen } : { template: true });
    if (r && typeof r.then === "function") {
      setSending(true);
      r.finally(() => setSending(false));
    }
  };

  // A caller with no WhatsApp thread whose call back the band offers: the call is what to do, so the reply box says
  // nothing of what cannot be sent beneath it -- "No approved message can go to Emily Chen yet" under Call back.
  const quiet = real && !!thread && thread.hasChat === false && ixBandCallBack(thread);
  // Nothing approved yet. Say so, rather than offering a send that cannot
  // happen: outside the window this is the only thing WhatsApp will deliver,
  // so an operator needs to know the gap is at Meta and not on this screen.
  // The window itself is the bar's to say (ThreadBar): it was said here too.
  if (real && templates && templates.length === 0) {
    return quiet ? null : (
      <span className="ix-tpl-none">
        No approved template yet — nothing can be sent until one is.
      </span>
    );
  }
  if (real && readTemplates === null) {
    return quiet ? null : <FailedRead kind="line" title="Couldn't read your approved templates" body="Outside the 24-hour window only an approved template sends, so none can be offered until they're read." surface="inbox" testid="ix-tpl-failed" />;
  }
  if (real && choice && choice.sendable.length === 0) {
    return quiet ? null : (
      <span className="ix-tpl-none">
        No approved message can go to {thread.who} yet.{choice.hidden ? <IxWhy said={choice.hidden} testid="ix-tpl-hidden" /> : null}
      </span>
    );
  }
  // Still being read: nothing yet. "Checking which templates are approved…" was the machinery talking.
  if (real && !list) return null;

  return (
    <>
      {list && list.length > 1 && (
        <select
          className="sd-input ix-tpl-pick"
          value={picked}
          onChange={(e) => setPicked(Number(e.target.value))}
          aria-label="Which approved template to send"
        >
          {(choice ? choice.sendable : list.map((t) => ({ template: t, label: `${t.name} · ${t.language}` }))).map((s, i) => (
            <option key={s.template.id} value={i}>{s.label}</option>
          ))}
        </select>
      )}
      <button
        className="btn btn-sm btn-primary"
        onClick={fire}
        disabled={sending}
        title={
          chosen
            ? `Sends your approved template "${chosenTitle || chosen.name}" — the only message WhatsApp delivers outside the 24-hour window`
            : "Sends your approved booking-link template — the only message WhatsApp delivers outside the 24-hour window"
        }
        {...window.gate("approve")}
      >
        <Icon name="send" size={12} />{" "}
        {sending ? "Sending…" : chosen && list.length > 1 ? "Send template" : chosenTitle ? `Send “${chosenTitle}”` : "Send booking link"}
      </button>
      {choice && choice.hidden ? <IxWhy said={choice.hidden} testid="ix-tpl-hidden" /> : null}
    </>
  );
};

const Composer = ({ thread, reply, hasApproval, onType = null, onSend = () => {} }) => {
  // What the member wrote to this thread and has not sent, kept for the thread in this tab (tab-memory.ts): the pane is
  // keyed by thread, so opening another one, or a refresh, dropped a half-written reply for good. The receptionist's
  // draft (`reply`) is its own and never kept as theirs; a reply the server took, or a box emptied, lets it go.
  const draftOf = thread && thread.real && window.__tabMemory ? thread.id : null;
  const keepWords = (v) => {
    if (!draftOf) return;
    if (v && v.trim() && v !== reply) window.__tabMemory.keepDraft("reply", v, draftOf);
    else window.__tabMemory.dropDraft("reply", draftOf);
  };
  const [text, setText] = React.useState(() => (draftOf && window.__tabMemory.draft("reply", draftOf)) || reply);
  const write = (v) => { setText(v); keepWords(v); };
  const [alt, setAlt] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const taRef = React.useRef(null);
  const isApproveAndSend = hasApproval && text === reply;

  // Seed the composer when a draft ARRIVES, not only when it mounts.
  //
  // useState(reply) reads its argument once. In the mockup that is enough —
  // the veto draft is in the seed data before the pane renders. On a real
  // thread the receptionist writes its reply while the operator is already
  // looking at the conversation, so the draft always arrives AFTER mount and
  // the composer stayed empty: "Edit" focused a blank box and the words the
  // operator was invited to change were nowhere to be found.
  //
  // Only fills an EMPTY composer. Someone half-way through their own reply
  // must never have it replaced by the bot's.
  React.useEffect(() => {
    if (!reply) return;
    setText((cur) => (cur && cur.trim() ? cur : reply));
  }, [reply]);

  // A reply carried in from a profile ("Text the booking link"): only into
  // an empty composer, only for this thread, and only once.
  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem("chanlytics-compose");
      if (!raw) return;
      const carried = JSON.parse(raw);
      const mine = carried && typeof carried.text === "string" && (carried.threadId === thread.id || carried.threadId === `th-${thread.id}` || `th-${carried.threadId}` === thread.id);
      if (!mine) return;
      sessionStorage.removeItem("chanlytics-compose");
      setText((cur) => (cur && cur.trim() ? cur : carried.text));
      window.setTimeout(() => { if (taRef.current) taRef.current.focus(); }, 60);
    } catch { /* nothing carried */ }
  }, [thread.id]);

  const [sending, setSending] = useCvtState(false);
  const doSend = () => {
    if (sending || !text.trim() || !window.canDo("approve")) return;
    const payload = text.trim();
    const r = onSend(thread.id, payload, isApproveAndSend);
    // Real threads answer with a promise: keep the words until the server
    // accepts them (a closed 24h window rejects, and retyping is unacceptable).
    if (r && typeof r.then === "function") {
      setSending(true);
      r.then((ok) => { if (ok !== false) write(""); }).finally(() => setSending(false));
    } else {
      write("");
    }
  };

  // ⌘↵ sends · E (from card shortcuts) focuses
  React.useEffect(() => {
    const onKey = (e) => {
      // Not a key something else took (a sheet's own ⌘↵ records it), and not one pressed inside a dialog over the page
      // (the deal sheet, any aria-modal): a ⌘↵ there sent whatever was in this box, even while the sheet saved.
      if (e.defaultPrevented || (e.target && e.target.closest && e.target.closest('[aria-modal="true"]'))) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); doSend(); }
    };
    // A card's "Edit in the composer" arrives with the words; a plain focus
    // request arrives with none and leaves what is typed alone.
    const onFocus = (e) => {
      const words = e && e.detail && typeof e.detail.text === "string" ? e.detail.text : null;
      if (words) setText(words);
      if (taRef.current) taRef.current.focus();
    };
    // A reply that waited on a yes (an email going to a different address than it came from) is sent from the
    // toast, after this box was told to keep its words: it lets go of them when that send is accepted.
    const onSent = (e) => { if (e && e.detail && e.detail.threadId === thread.id) write(""); };
    // The header's "Send proposal" arrives with the words (00154): an empty box takes the sentence, a box with
    // words in it takes the address on its own line under them, and the cursor lands in the box either way.
    const onCompose = (e) => {
      const d = (e && e.detail) || {};
      if (typeof d.text !== "string") return;
      write(text && text.trim() ? `${text.trimEnd()}\n${d.link || d.text}` : d.text);
      if (taRef.current) taRef.current.focus();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("inbox:focus-composer", onFocus);
    window.addEventListener("inbox:reply-sent", onSent);
    window.addEventListener("inbox:compose", onCompose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("inbox:focus-composer", onFocus);
      window.removeEventListener("inbox:reply-sent", onSent);
      window.removeEventListener("inbox:compose", onCompose);
    };
  }, [text, thread.id]);

  // The field grows with what is in it, up to its cap: typed, carried in from a profile, or a draft filled in.
  React.useEffect(() => {
    const el = taRef.current;
    if (!thread.real || !el || !el.style) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, thread.real]);

  // Checked BEFORE the window branch: an opt-out is stronger than a closed
  // 24h window, where an approved template still gets through. Here nothing
  // does, so the composer offers no send at all rather than a button whose
  // only outcome is a rejection from the API.
  if (thread.real && thread.optedOut) {
    return (
      <div className="ix-composer">
        <div className="ix-composer-banner">
          <Icon name="shield" size={11} />
          <span>{thread.who} asked to stop receiving messages. Nothing can be sent — they can text START to opt back in.</span>
        </div>
      </div>
    );
  }

  // A caller with no WhatsApp thread: the window never opened, so the honest
  // verbs are the phone and an approved message that starts a thread.
  if (thread.real && thread.hasChat === false) {
    return (
      <div className="ix-composer">
        {/* The header names the channel and the number, and the line above says they phoned: what is left is what can
            be sent. A caller with no WhatsApp thread has no free-form reply, so the verbs are the call -- where the
            line above does not already carry it -- and the approved message that starts a thread. */}
        <div className="ix-composer-foot">
          <div className="ix-composer-actions">
            {!ixBandCallBack(thread) && thread.phone && <a className="btn btn-sm" href={`tel:${thread.phone}`} data-testid="ix-call-back"><Icon name="phone" size={12} /> Call back</a>}
            <TemplateSendButton onSend={onSend} threadId={thread.id} real={!!thread.real} thread={thread} />
          </div>
        </div>
      </div>
    );
  }

  // The window has closed: the bar under the header says so, and why (ThreadBar), and the header names the wire and
  // the person. What is left is the one send that works. It was a red block saying the window had closed, over a
  // line saying "WhatsApp · to Rosa Díaz" again, over the send: three rows at the foot of a phone.
  if (thread.real && thread.windowOpen === false) {
    return (
      <div className="ix-composer">
        <div className="ix-composer-foot">
          <div className="ix-composer-actions">
            <TemplateSendButton onSend={onSend} threadId={thread.id} real={!!thread.real} thread={thread} />
          </div>
        </div>
      </div>
    );
  }

  // A real thread's reply box is one line that grows, with Send beside it: it was a three-line field over a line
  // saying the channel and the name the header already shows, 185px of a phone. The field names the channel.
  if (thread.real) {
    return (
      <div className="ix-composer ix-composer-row">
        <textarea
          ref={taRef}
          className="ix-composer-text"
          value={text}
          onChange={(e) => { write(e.target.value); if (onType) onType(); }}
          placeholder={`${thread.replyVia || "WhatsApp"} to ${thread.who}…`}
          aria-label={`Reply to ${thread.who}`}
          rows={1}
        />
        <button
          className="btn btn-primary ix-composer-send"
          disabled={!text.trim() || sending}
          onClick={doSend}
          {...window.gate("approve")}
        >
          {sending ? "Sending…" : isApproveAndSend ? "Approve & send" : "Send"} <span className="kbd kbd-on-dark">⌘↵</span>
        </button>
      </div>
    );
  }

  return (
    <div className="ix-composer">
      {hasApproval && (
        <div className="ix-composer-banner">
          <Icon name="sparkle" size={11} />
          <span>Suggested by {thread.agent.name}</span>
          <button className="ix-composer-regen" onClick={() => { const a = !alt; setAlt(a); setText(a ? reply.split(". ")[0] + ". Want me to set it up?" : reply); }}>
            <Icon name="refresh" size={11} /> {alt ? "Original" : "Regenerate"}
          </button>
        </div>
      )}
      <textarea
        ref={taRef}
        className="ix-composer-text"
        value={text}
        onChange={(e) => { write(e.target.value); if (onType) onType(); }}
        placeholder={thread.real ? `Reply to ${thread.who}…` : `Reply via ${thread.primaryChannel?.toUpperCase() || "SMS"}…`}
        rows={3}
      />
      <div className="ix-composer-foot">
        <div className="ix-composer-channel">
          <Icon name={thread.primaryChannel === "phone" ? "phone" : thread.primaryChannel === "mail" ? "mail" : "chat"} size={12} />
          <span>{thread.real ? (thread.primaryChannel === "sms" ? "Text" : "WhatsApp") : (thread.primaryChannel?.toUpperCase() || "SMS")} · to {thread.who}</span>
        </div>
        <div className="ix-composer-actions">
          {/* The mockup's Save draft kept nothing: a real thread keeps no drafts, so it offers none. */}
          {!thread.real && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1600); }} disabled={saved}>
              {saved ? "Draft saved ✓" : "Save draft"}
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            disabled={!text.trim() || sending}
            onClick={doSend}
            {...window.gate("approve")}
          >
            {sending ? "Sending…" : isApproveAndSend ? "Approve & send" : "Send"} <span className="kbd kbd-on-dark">⌘↵</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// =============== EMPTY STATE ===============
const InboxEmpty = () => (
  <EmptyState kind="page" glyph="inbox" title="Inbox zero" body="The receptionist is handling everything. Anything that needs your call appears here." action={{ label: "See what it handled", to: "conversations" }} testid="inbox-empty" />
);

window.InboxThread = InboxThread;
// Conversations' call pane goes back the way the thread does, and names who it is with as the thread does.
window.ixSwipeBack = ixSwipeBack;
window.IxWho = IxWho;
// Conversations draws a call no thread holds as the thread draws one; where a thread opens is published for its test.
window.ThreadCall = ThreadCall;
window.ixOpensAt = ixOpensAt;
// Published so the rule can be driven on its own: the effect that applies it measures a laid-out page.
window.tlFollowBy = tlFollowBy;
window.InboxEmpty = InboxEmpty;
// Published for the-pages-say-only-what-is-true.test.mjs, which draws the composer on its own.
window.InboxComposer = Composer;
