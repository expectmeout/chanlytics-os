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

const InboxThread = ({ thread, onBack = null, channelLabels, veto = null, vetoPaused = false, onVetoAct = () => {}, onVerdict = () => {}, stale = null, onReconcile = () => {}, onDismissStale = () => {}, onOpenClient = () => {}, onDecide = () => {}, onSnooze = () => {}, onSend = () => {}, onTakeOver = () => {}, onWake = () => {}, onHandBack = () => {}, onMarkUnread = () => {}, onArchive = null, planParam = 0, onPlanParam = () => {}, notice = null, focusMessageId = null }) => {
  // Archive asks first: it closes the customer's request. Above the early return, so the hooks keep their order.
  const [askArchive, setAskArchive] = useCvtState(false);
  // A real thread opens at its newest message and stays with it as messages arrive, unless you have scrolled up to
  // read: it opened at the oldest, and on a phone the words you were answering were two scrolls down. Above the early
  // return, so the hooks keep their order.
  const scrollRef = React.useRef(null);
  const stuckRef = React.useRef(true);
  // Opened at a message -- a call, from Conversations -- it opens there instead, once the pane has a size to scroll.
  const focusRef = React.useRef(focusMessageId);
  const real = !!(thread && thread.real);
  const entries = thread && thread.timeline ? thread.timeline.length : 0;
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!real || !el) return undefined;
    let aim = focusRef.current;
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
  const statusProps = { thread, decided, stale, onReconcile, onDismissStale, onWake, onTakeOver, onDecide, onHandBack, veto, vetoPaused, onVetoAct };

  return (
    <div className="ix-thread-pane">
      <ThreadHeader thread={thread} channelLabels={channelLabels} onOpenClient={onOpenClient} onSnooze={onSnooze} onMarkUnread={onMarkUnread} onBack={onBack} onArchive={thread.real && onArchive ? () => setAskArchive(true) : null} />
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
            return <TimelineEntry key={i} entry={entry} thread={thread} channelLabels={channelLabels} lines={lines} focus={!!focusMessageId && entry.messageId === focusMessageId} />;
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
        pill={<StatePill kind="thread" value="snoozed" />}
        meta={`back ${thread.wake || "tomorrow 10:00"}`}
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
        pill={<StatePill kind="thread" value="escalated" />}
        // In the row's own words, and amber past half an hour as the row's pill is.
        meta={thread.waited ? `waiting ${thread.waited}` : null}
        late={thread.waitingMin > 30}
        // The reason's own sentence (ESCALATION_SUMMARIES), never one line for every reason:
        // a held message was not "already answered", and a call back is not a reply.
        says={thread.summary}
        // What they asked, beside the decision: their last message, or what the call left behind.
        ask={thread.ask ? <IxAsk ask={thread.ask} /> : null}
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
        // The pill their row in the list wears, in the same words.
        pill={<StatePill kind="thread" value="theirs" label={`${window.ixAnswerer ? window.ixAnswerer(thread) : "A teammate"} has it`} />}
        meta={thread.waited ? `waiting ${thread.waited}` : null}
        says="The receptionist stays quiet until they hand it back. If you reply, the thread becomes yours."
      />
    )}
    {thread.real && thread.state === "done" && !thread.resolution && (thread.archived ? (
      <IxState
        testid="ix-archived"
        pill={<StatePill kind="thread" value="archived" label="Archived" />}
        says="Their request is closed. If they write again, it comes back."
      />
    // A draft still waiting to go out is the thread's state, said by its bar: "They wrote last — no reply yet"
    // sat over "Auto-sends in 72s", one saying nothing was coming and the other that it was about to.
    ) : thread.lastWord && !thread.veto ? (
      // Who had the last word, and whether a reply didn't send (the view model's lastWord). Every quiet thread
      // read "Answered by the receptionist — no one asked for you", over a reply that never left (I1).
      // A reply that didn't send wears the row's own pill ("Didn't send"); a quiet thread is its one quiet sentence.
      <IxState
        testid="ix-last-word"
        tone={thread.lastWord.tone === "ok" ? null : thread.lastWord.tone}
        pill={thread.lastWord.short ? <StatePill kind="tone" value={thread.lastWord.tone} label={thread.lastWord.short} /> : null}
        says={thread.lastWord.text}
      />
    ) : null)}
    {thread.takenOver && (thread.real ? (
      <IxState
        testid="ix-yours"
        pill={<StatePill kind="thread" value="yours" label="You have it" />}
        // The reason it was flagged is said here, once: "Where this stands" said it below (I1).
        says={<>The receptionist stays quiet while you have it.{thread.escalationId && thread.summary ? <> {thread.summary}</> : null}</>}
        // What they asked, where you answer it: it was only in the timeline (I3).
        ask={thread.ask ? <IxAsk ask={thread.ask} /> : null}
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

// The state a real thread is in, said one way whatever the state: the pill its row in the list wears (StatePill -- one
// vocabulary for both), a quiet word beside it, one sentence, and what you can do about it. It was a dot and a bold
// title here, an icon and a bold name inside a sentence there, a white slab of a button beside a link with an arrow:
// six looks for one line of a thread.
const IxState = ({ pill = null, meta = null, late = false, says = null, ask = null, acts = null, tone = null, testid = null }) => {
  const bare = !pill && !meta && !acts;
  return (
    <div className={`ix-state${tone ? ` ${tone}` : ""}${bare ? " bare" : ""}`} data-testid={testid || undefined}>
      {(pill || meta) && (
        <div className="ix-state-head">
          {pill}
          {meta && <span className={`ix-state-meta tabular${late ? " late" : ""}`}>{meta}</span>}
        </div>
      )}
      {acts && <div className="ix-state-acts">{acts}</div>}
      {(says || ask) && <div className="ix-state-says">{says}{ask}</div>}
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

// =============== HEADER ===============
const ThreadHeader = ({ thread, channelLabels, onOpenClient = () => {}, onSnooze = () => {}, onMarkUnread = () => {}, onBack = null, onArchive = null }) => {
  const channelIcon = (c) => c === "phone" ? "phone" : c === "instagram" ? "instagram" : c === "mail" || c === "email" ? "mail" : "chat";
  const snoozed = thread.state === "snoozed";

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
        <div className="ix-th-avatar" data-priority={thread.priority}>{thread.avatar}</div>
        <div className="ix-th-id">
          <div className="ix-th-name">
            {thread.who}
            {thread.pinned && <Icon name="pin" size={11} style={{ color: "var(--ink-faint)" }} />}
            {thread.hasHumanContact && (
              <span className="ix-th-relation" title="Has spoken with a human before">
                <Icon name="users" size={10} />
              </span>
            )}
            {thread.leadId && (() => {
              const ld = (window.LEADS || []).find((l) => l.id === thread.leadId);
              const label = ld ? ({ ready: "Ready", qualifying: "Qualifying", new: "New", nurture: "Nurturing", converted: "Converted", archived: "Archived" }[ld.stage] || ld.stage) : null;
              return (
                <button className="ix-xlink" title="This decision also sits in your Leads queue" onClick={() => window.CHANLY.nav(window.CHANLY.R.lead(thread.leadId))}>
                  <Icon name="bolt" size={9} /> Also in Leads{label ? ` · ${label}` : ""}
                </button>
              );
            })()}
          </div>
          <div className="ix-th-meta">{thread.real ? ixWires(thread, channelLabels || {}) : thread.whoMeta}</div>
        </div>
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
        {thread.real && thread.phone && thread.primaryChannel === "phone" && thread.optedOut && !ixDockDials(thread) && (
          <a className="btn btn-ghost btn-sm" href={`tel:${thread.phone}`} data-testid="ix-call-back">
            <Icon name="phone" size={12} /> Call back
          </a>
        )}
        {/* A quiet icon, not a boxed button: lit only while its menu is open. The menu says what to do with the
            conversation, then with the person, then the file -- no eyebrow: the menu is the thread's. "Conversation"
            headed a list of five in capitals, and "Receptionist for this person…" broke onto two lines. */}
        <MoreMenu btnClass="btn btn-ghost btn-icon btn-sm ix-th-more" items={ixMenu([
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
          <span className="agent-avatar" style={{ width: 14, height: 14, fontSize: 8 }}>{thread.agent.glyph}</span>
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

const TimelineEntry = ({ entry, thread, channelLabels, lines = null, focus = false }) => {
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

  return <TlMsgEntry entry={entry} thread={thread} channelLabels={channelLabels} lines={lines} channelIcon={channelIcon} focus={focus} />;
};

// The message branch, with the hooks its two disclosures need. It is its own component so those
// hooks are not behind the event and agent-thinking returns above.
const TlMsgEntry = ({ entry, thread, channelLabels, lines, channelIcon, focus = false }) => {
  const [whyOpen, setWhyOpen] = React.useState(false);
  // A call is drawn as the call, where it happened: its note was a dashed bubble of words nobody said.
  if (thread.real && entry.channel === "phone") return <CallCard call={tlCallFor(entry.messageId)} note={entry.body} at={entry.at} mid={entry.messageId} focus={focus} />;
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
    <div className={`tl-msg ${isClient ? "client" : "agent"}${held ? " held" : ""}${undelivered ? " undelivered" : ""}`} data-mid={entry.messageId}>
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
                <span className="agent-avatar" style={{ width: 12, height: 12, fontSize: 7 }}>{entry.agentGlyph || thread.agent.glyph}</span>
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

// =============== A CALL, WHERE IT HAPPENED IN THE THREAD ===============
// A call's note was a dashed bubble -- "Phone · call note", "Inbound call · 3 min — …" -- and the call itself, its
// recording and its transcript, was on a second screen in Conversations, under a card of eight facts, beside a Play
// button that played nothing. Every call with a caller behind it already belongs to a thread, so the note is the call:
// what it was about, how it went in a few quiet words, the recording when there is one, and the transcript on a tap.
// Conversations opens a call here, at its card, and draws a call no thread holds with the same card (CallPane).

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

const TL_LINK_FRESH_MS = 4 * 60 * 1000;
const tlClock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

// The recording, through a short-lived signed link: the provider's own link never reaches the browser. It is read
// through the client (window.__recording), which names the workspace as every read does; the route signs it for five
// minutes, so an old link is read again before playing. A failure says why, and Play tries again -- one failure used
// to disable it for good.
const CallPlayer = ({ callId, length = null }) => {
  const audioRef = React.useRef(null);
  const linkAt = React.useRef(0);
  const [playing, setPlaying] = React.useState(false);
  const [pos, setPos] = React.useState(0);
  const [dur, setDur] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(null); // the sentence, while the recording can't be played

  const toggle = async () => {
    const el = audioRef.current;
    if (!el || loading) return;
    if (playing) { el.pause(); return; }
    if (!el.src || Date.now() - linkAt.current > TL_LINK_FRESH_MS) {
      setLoading(true);
      const r = window.__recording ? await window.__recording(callId) : null;
      setLoading(false);
      if (!r || !r.ok || !r.data || !r.data.url) {
        setFailed((r && r.message) || "Couldn't load the recording.");
        return;
      }
      el.src = r.data.url;
      linkAt.current = Date.now();
    }
    setFailed(null);
    el.play().catch(() => { linkAt.current = 0; setFailed("Couldn't play the recording."); });
  };

  const words = failed ? "Try the recording again" : playing ? "Pause the recording" : "Play the recording";
  return (
    <>
      <div className="tl-call-player">
        <audio
          ref={audioRef}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => setPos(e.target.currentTime)}
          onLoadedMetadata={(e) => setDur(e.target.duration || 0)}
          onError={() => { linkAt.current = 0; setPlaying(false); setFailed("Couldn't play the recording."); }}
        />
        <button type="button" className="tl-call-play" title={words} aria-label={words} onClick={toggle} disabled={loading} data-testid="tl-call-play">
          <Icon name={playing ? "pause" : "play"} size={12} />
        </button>
        <div className="tl-call-track" aria-hidden="true"><div className="tl-call-fill" style={{ width: `${dur ? (pos / dur) * 100 : 0}%` }} /></div>
        <span className="tl-call-clock tabular">{loading ? "Loading…" : `${tlClock(pos)} / ${length || tlClock(dur)}`}</span>
      </div>
      {failed && <div className="tl-call-failed" role="status" data-testid="tl-call-failed">{failed} Press play to try again.</div>}
    </>
  );
};

// `call`: the call itself, when it has been read; `note`: the words it left on the thread, which are all an older call
// has. On the side of the thread it came from: theirs when they phoned, ours when the receptionist did.
const CallCard = ({ call = null, note = null, at, mid, focus = false }) => {
  const [open, setOpen] = React.useState(false);
  const said = call ? null : tlNoteOf(note);
  const direction = call ? call.direction || "inbound" : said.direction;
  const missed = !!(call && call.missed);
  // A seeded call carries its words as the old card's headline.
  const about = call ? ("about" in call ? call.about : call.summary ? call.summary.headline : null) : said.about;
  const length = call ? (missed ? null : call.duration || null) : said.length;
  const kind = missed ? (direction === "outbound" ? "Call didn't connect" : "Missed call") : direction === "outbound" ? "Outbound call" : "Inbound call";
  const facts = (call && call.facts) || [];
  const lines = call && call.transcript && call.transcript.length ? call.transcript : null;
  const them = (call && (call.whoShort || call.who)) || "Caller";
  const file = lines && call.real && !window.__DEMO_MODE && window.__href ? window.__href("GET calls/[id]/export", { id: call.callId }) : null;
  return (
    <div className={`tl-call ${direction}${focus ? " focus" : ""}`} data-mid={mid} data-testid="tl-call">
      <div className="tl-call-card">
        <div className="tl-call-head">
          <span className="tl-call-glyph" aria-hidden="true"><Icon name="phone" size={11} /></span>
          <span className="tl-call-kind">{kind}{length && <span className="tl-call-length tabular"> · {length}</span>}</span>
          <span className="tl-call-at tabular">{at}</span>
        </div>
        {about && <div className="tl-call-about">{about}</div>}
        {facts.length > 0 && <div className="tl-call-facts">{facts.join(" · ")}</div>}
        {call && call.recordingState === "ready" && <CallPlayer callId={call.callId} length={call.duration} />}
        {lines && (
          <button type="button" className="tl-call-open" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="tl-call-open">
            Transcript <Icon name="chevron-down" size={10} />
          </button>
        )}
        {lines && open && (
          <div className="tl-call-lines" data-testid="tl-call-lines">
            {lines.map((line, i) => (
              <div key={i} className={`tl-call-line ${line.speaker}`}>
                <span className="tl-call-who">{line.speaker === "agent" ? "Receptionist" : line.speaker === "whisper" ? "You whispered" : them}</span>
                <span className="tl-call-said">{line.text}</span>
              </div>
            ))}
            {file && <a className="tl-call-file" href={file} download>Download the transcript</a>}
          </div>
        )}
      </div>
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

  // Nothing approved yet. Say so, rather than offering a send that cannot
  // happen: outside the window this is the only thing WhatsApp will deliver,
  // so an operator needs to know the gap is at Meta and not on this screen.
  if (real && templates && templates.length === 0) {
    return (
      <span className="ix-tpl-none">
        No approved template yet — outside the 24-hour window WhatsApp delivers nothing else.
      </span>
    );
  }
  if (real && readTemplates === null) {
    return <FailedRead kind="line" title="Couldn't read your approved templates" body="Outside the 24-hour window only an approved template sends, so none can be offered until they're read." surface="inbox" testid="ix-tpl-failed" />;
  }
  if (real && choice && choice.sendable.length === 0) {
    return (
      <span className="ix-tpl-none">
        No approved message can go to {thread.who} yet.{choice.hidden ? <IxWhy said={choice.hidden} testid="ix-tpl-hidden" /> : null}
      </span>
    );
  }
  if (real && !list) {
    return <span className="ix-tpl-none">Checking which templates are approved…</span>;
  }

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
  const [text, setText] = React.useState(reply);
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
      r.then((ok) => { if (ok !== false) setText(""); }).finally(() => setSending(false));
    } else {
      setText("");
    }
  };

  // ⌘↵ sends · E (from card shortcuts) focuses
  React.useEffect(() => {
    const onKey = (e) => {
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
    const onSent = (e) => { if (e && e.detail && e.detail.threadId === thread.id) setText(""); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("inbox:focus-composer", onFocus);
    window.addEventListener("inbox:reply-sent", onSent);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("inbox:focus-composer", onFocus); window.removeEventListener("inbox:reply-sent", onSent); };
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
            {!ixDockDials(thread) && thread.phone && <a className="btn btn-sm" href={`tel:${thread.phone}`} data-testid="ix-call-back"><Icon name="phone" size={12} /> Call back</a>}
            <TemplateSendButton onSend={onSend} threadId={thread.id} real={!!thread.real} thread={thread} />
          </div>
        </div>
      </div>
    );
  }

  if (thread.real && thread.windowOpen === false) {
    return (
      <div className="ix-composer">
        <div className="ix-composer-banner">
          <Icon name="clock" size={11} />
          <span>The 24-hour WhatsApp window is closed — free-form replies can't be delivered. Approved templates only.</span>
        </div>
        <div className="ix-composer-foot">
          <div className="ix-composer-channel">
            <Icon name="chat" size={12} />
            <span>WhatsApp · to {thread.who}</span>
          </div>
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
          onChange={(e) => { setText(e.target.value); if (onType) onType(); }}
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
        onChange={(e) => { setText(e.target.value); if (onType) onType(); }}
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
// Conversations draws a call no thread holds with the thread's own card.
window.CallCard = CallCard;
window.InboxEmpty = InboxEmpty;
// Published for the-pages-say-only-what-is-true.test.mjs, which draws the composer on its own.
window.InboxComposer = Composer;
