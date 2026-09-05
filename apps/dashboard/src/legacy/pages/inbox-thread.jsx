/* global React, Icon, ConfidenceDots */
// Inbox Thread Pane — perfectionist refinement.
// New structure:
//   1. Header (compact — name, channels, actions)
//   2. Context strip (4 micro-facts the operator wants at a glance)
//   3. Approval card v2 (only if needs/drafts) — $ impact strip, evidence expander, next-steps row
//   4. Narrative summary (1-line story)
//   5. Timeline (softer agent bubbles)
//   6. Composer (right-anchored, Approve & Send combo)

const { useState: useCvtState } = React;

const InboxThread = ({ thread, channelLabels, veto = null, vetoPaused = false, onVetoAct = () => {}, onVerdict = () => {}, stale = null, onReconcile = () => {}, onDismissStale = () => {}, onOpenClient = () => {}, onDecide = () => {}, onSnooze = () => {}, onSend = () => {}, onTakeOver = () => {}, onWake = () => {}, onHandBack = () => {}, onMarkUnread = () => {}, planParam = 0, onPlanParam = () => {}, notice = null }) => {
  if (!thread) return <InboxEmpty />;

  const decided = !!thread.resolution;

  return (
    <div className="ix-thread-pane">
      <ThreadHeader thread={thread} channelLabels={channelLabels} onOpenClient={onOpenClient} onSnooze={onSnooze} onMarkUnread={onMarkUnread} />
      <ContextStrip thread={thread} />
      {notice && <div className="ix-notice" role="status">{notice}</div>}

      <div className="ix-th-scroll">
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

        {thread.state === "snoozed" && (
          <div className="ix-resolved">
            <Icon name="clock" size={13} />
            {/* "Nothing happens until then" was false on a real thread: snooze
                deliberately does NOT mute the receptionist, so it keeps
                answering, and a new message from the customer reopens the
                conversation. Say what a snooze actually is — hidden, not
                paused — and, when the customer asked for a person, say that
                the request is still standing rather than letting the operator
                believe it was dealt with. */}
            <span>
              Snoozed — back <b>{thread.wake || "tomorrow 10:00"}</b>.
              {thread.real
                ? " Hidden from your queue; the receptionist still answers, and a new message brings it back."
                : " Nothing happens until then."}
              {thread.real && thread.escalationId ? " They asked for a person — that's still waiting for you." : ""}
            </span>
            <button className="cl-bucket-link" onClick={() => onWake(thread.id)}>
              Wake now <Icon name="arrow-right" size={10} />
            </button>
          </div>
        )}

        {thread.state === "escalated" && !thread.takenOver && (
          <div className="ix-take">
            <Icon name="flag" size={13} />
            <div className="ix-take-body">
              <div className="ix-take-title">
                {thread.real ? <>Waiting on you{thread.waitingMin ? ` · ${thread.waitingMin}m` : ""}</> : "Escalated — needs a human voice"}
              </div>
              <div className="ix-take-sub">{thread.real
                ? <>The receptionist already sent a holding reply and stopped answering this thread. It stays quiet until you reply or hand it back.</>
                : <>{thread.agent.name} stopped drafting. HR-sensitive threads never get suggested replies.</>}</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => onTakeOver(thread.id)} {...window.gate("approve")}>
              {thread.real ? "I'll answer this" : "I'll take this one"}
            </button>
            {thread.real && thread.escalationId && (
              <button className="btn btn-ghost btn-sm" onClick={() => onDecide(thread.id, "__HANDBACK__")} {...window.gate("approve")}>
                Nothing needed — let the AI resume
              </button>
            )}
          </div>
        )}
        {thread.real && thread.state === "done" && !thread.resolution && (
          <div className="ix-resolved">
            <Icon name="check" size={13} />
            <span>Answered by the receptionist — no one asked for you.</span>
          </div>
        )}
        {thread.takenOver && (
          <div className="ix-resolved">
            <Icon name="users" size={13} />
            <span>You own this thread — agents are standing down. Reply below in your own voice.</span>
            <button className="cl-bucket-link" onClick={() => onHandBack(thread.id)}>
              Hand back to {thread.agent.name} <Icon name="arrow-right" size={10} />
            </button>
          </div>
        )}

        {thread.verdict && !decided && (
          <VerdictCard thread={thread} onVerdict={onVerdict} />
        )}

        {/* The same trap the composer already documents: in the mockup "done"
            means decided, nothing left to do. On a REAL thread "handled" is the
            normal resting state — the receptionist answered and nothing
            escalated — which is exactly the state a held draft sits in. Gating
            the VetoBar on state !== "done" hid the controls in the common case
            and left the draft unstoppable from the UI. */}
        {thread.veto && !decided && (thread.real || thread.state !== "done") && (
          <VetoBar thread={thread} remaining={veto} paused={vetoPaused} onAct={onVetoAct} onTakeOver={onTakeOver} />
        )}

        {thread.approval && !decided && (
          <ApprovalCard thread={thread} approval={thread.approval} onDecide={onDecide} planParam={planParam} onPlanParam={onPlanParam} />
        )}

        <NarrativeSummary thread={thread} />

        <div className="ix-timeline">
          {thread.timeline.map((entry, i) => (
            <TimelineEntry key={i} entry={entry} thread={thread} channelLabels={channelLabels} />
          ))}
        </div>
      </div>

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

// =============== HEADER ===============
const ThreadHeader = ({ thread, channelLabels, onOpenClient = () => {}, onSnooze = () => {}, onMarkUnread = () => {} }) => {
  const channelIcon = (c) => c === "phone" ? "phone" : c === "instagram" ? "instagram" : c === "mail" ? "mail" : c === "sms" ? "chat" : "chat";
  const snoozed = thread.state === "snoozed";

  return (
    <header className="ix-th-head">
      <div className="ix-th-head-main">
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
          <div className="ix-th-meta">{thread.whoMeta}</div>
        </div>
      </div>
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
      <div className="ix-th-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => onSnooze(thread.id)} disabled={snoozed} {...window.gate("approve")}>
          <Icon name={snoozed ? "check" : "clock"} size={12} /> {snoozed ? `Wakes ${thread.wake || "tomorrow"}` : "Snooze"}
        </button>
        {thread.clientId && (
          <button className="btn btn-ghost btn-sm" onClick={() => onOpenClient(thread.clientId)} title="Open client profile">
            <Icon name="users" size={12} /> Open client
          </button>
        )}
        <MoreMenu btnClass="btn btn-icon btn-sm" items={[
          { header: "Conversation" },
          // clientId is the contact behind the thread, so the item only renders
          // when there is actually somewhere to go (a phone-only caller has none).
          ...(thread.clientId ? [{ label: "Open client", icon: "users", onClick: () => onOpenClient(thread.clientId) }] : []),
          // On a real thread "Mark as unread" flipped a local flag the next
          // realtime reseed wiped, and "Block sender" opened the Ask overlay,
          // a no-op outside a demo: both promised something that did not
          // happen. The real way to stop the receptionist for one person is
          // the mode on their profile, so that is where a real session goes.
          ...(window.__DEMO_MODE ? [{ label: "Mark as unread", icon: "inbox", onClick: () => onMarkUnread(thread.id) }] : []),
          { label: "Snooze", icon: "clock", onClick: () => onSnooze(thread.id) },
          ...(window.__DEMO_MODE
            ? [{ divider: true }, { label: "Block sender", icon: "x", danger: true, onClick: () => window.askAbout({ mode: "compose", prompt: "Block this sender because " }) }]
            : thread.clientId
              ? [{ divider: true }, { label: "Receptionist for this person…", icon: "shield", onClick: () => onOpenClient(thread.clientId) }]
              : []),
        ]} />
      </div>
    </header>
  );
};

// =============== CONTEXT STRIP — micro-facts under header ===============
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
  if (!thread.summary) return null;
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
const TimelineEntry = ({ entry, thread, channelLabels }) => {
  const channelIcon = (c) => c === "phone" ? "phone" : c === "instagram" ? "instagram" : c === "mail" ? "mail" : c === "sms" ? "chat" : "chat";

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

  const isClient = entry.from === "client";
  // A held draft is a message the customer has NOT seen. Rendered as an
  // ordinary agent bubble it reads as already-sent, and an operator would
  // either ignore it or apologise for something that never went out.
  const held = !!entry.pending;
  return (
    <div className={`tl-msg ${isClient ? "client" : "agent"}${held ? " held" : ""}`}>
      <div className="tl-msg-bubble">
        <div className="tl-msg-meta">
          <Icon name={channelIcon(entry.channel)} size={10} />
          <span>{channelLabels[entry.channel]}</span>
          <span className="tl-msg-time tabular">{entry.at}</span>
        </div>
        <div className="tl-msg-body">{entry.body}</div>
        {!isClient && (
          <div className="tl-msg-by">
            {entry.byYou ? (
              <span>
                by you · {entry.at}
                {/* One vocabulary, computed in the viewmodel. This ternary was
                    the only place these words existed, so the Conversations
                    pane — which shows the same messages — said nothing at all
                    and rendered a canceled reply as a delivered one. */}
                {entry.statusLabel ? ` · ${entry.statusLabel}` : ""}
              </span>
            ) : (
              <>
                {/* Per-bubble when the viewmodel supplies it: a phone call
                    summary is the Phone Receptionist's work, not the WhatsApp
                    one's. Seeded threads carry no per-entry agent and keep the
                    thread-level identity they have always used. */}
                <span className="agent-avatar" style={{ width: 12, height: 12, fontSize: 7 }}>{entry.agentGlyph || thread.agent.glyph}</span>
                <span>by {entry.agentName || thread.agent.name}</span>
                {held && <span className="tl-held-tag">Not sent yet</span>}
              </>
            )}
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

// =============== VETO BAR — countdown on a safe draft ===============
const VetoBar = ({ thread, remaining, paused = false, onAct = () => {}, onTakeOver = () => {} }) => (
  <div className={`ix-veto ${remaining == null ? "held" : paused ? "paused" : remaining <= 10 ? "urgent" : ""}`}>
    <span className="ix-veto-dot"></span>
    <span className="ix-veto-msg" data-tip="This draft sends itself at zero — Edit, Hold, or typing a reply cancels it">
      {remaining != null
        ? (paused ? <>Paused at <b>{remaining}s</b> — you're away</> : <><b>Auto-sends in {remaining}s</b></>)
        : <>Held — manual send</>}
    </span>
    {thread.veto.policyClass && <PolicyChip cls={thread.veto.policyClass} />}
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
const TemplateSendButton = ({ onSend = () => {}, threadId, real = false }) => {
  const [sending, setSending] = useCvtState(false);
  // The workspace's OWN approved templates, published by the seam. The button
  // used to name one by a hardcoded literal — booking_link_v1/en_US — which is
  // right for exactly one workspace and a guaranteed failure for every other,
  // including every newly created one, which has no template row at all.
  const templates = Array.isArray(window.__TEMPLATES) ? window.__TEMPLATES : null;
  const [picked, setPicked] = useCvtState(0);

  // On a seeded thread there is nothing to look up and nothing to send; keep
  // the mockup's own affordance.
  const list = real ? templates : null;
  const chosen = list ? list[Math.min(picked, list.length - 1)] : null;

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
  if (real && list && list.length === 0) {
    return (
      <span className="ix-tpl-none">
        No approved template yet — outside the 24-hour window WhatsApp delivers nothing else.
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
          {list.map((t, i) => (
            <option key={t.id} value={i}>{t.name} · {t.language}</option>
          ))}
        </select>
      )}
      <button
        className="btn btn-sm btn-primary"
        onClick={fire}
        disabled={sending}
        title={
          chosen
            ? `Sends your approved template "${chosen.name}" — the only message WhatsApp delivers outside the 24-hour window`
            : "Sends your approved booking-link template — the only message WhatsApp delivers outside the 24-hour window"
        }
        {...window.gate("approve")}
      >
        <Icon name="send" size={12} />{" "}
        {sending ? "Sending…" : chosen && list.length > 1 ? "Send template" : "Send booking link"}
      </button>
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
    const onFocus = () => taRef.current && taRef.current.focus();
    window.addEventListener("keydown", onKey);
    window.addEventListener("inbox:focus-composer", onFocus);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("inbox:focus-composer", onFocus); };
  }, [text]);

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
            <span>WHATSAPP · to {thread.who}</span>
          </div>
          <div className="ix-composer-actions">
            <TemplateSendButton onSend={onSend} threadId={thread.id} real={!!thread.real} />
          </div>
        </div>
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
        placeholder={thread.real ? "Reply as the salon…" : `Reply via ${thread.primaryChannel?.toUpperCase() || "SMS"}…`}
        rows={3}
      />
      <div className="ix-composer-foot">
        <div className="ix-composer-channel">
          <Icon name={thread.primaryChannel === "phone" ? "phone" : thread.primaryChannel === "mail" ? "mail" : "chat"} size={12} />
          <span>{thread.real ? "WhatsApp" : (thread.primaryChannel?.toUpperCase() || "SMS")} · to {thread.who}</span>
        </div>
        <div className="ix-composer-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1600); }} disabled={saved}>
            {saved ? "Draft saved ✓" : "Save draft"}
          </button>
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
  <div className="ix-empty-state">
    <div className="ix-empty-glyph"><Icon name="inbox" size={28} /></div>
    <div className="ix-empty-title">Inbox zero</div>
    <div className="ix-empty-body">
      Your agents are handling everything in real time. Anything that needs your call will appear here.
    </div>
  </div>
);

window.InboxThread = InboxThread;
window.InboxEmpty = InboxEmpty;
