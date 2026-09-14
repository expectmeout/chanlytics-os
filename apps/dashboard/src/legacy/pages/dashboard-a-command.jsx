/* global React, Icon, useHotkey, PolicyChip, EmptyState */
// Agent Command — the decide-at-a-glance queue on Today.
// Redesigned for signal over chrome: one command bar (title + Now/Soon/Done +
// Open Inbox), a single context line (AI insight · agents present · Approve all
// safe), then clean single-column rows whose Approve/Decline are ALWAYS visible.
// Expanding a row leads with the draft you're approving + one recommendation
// line; alternatives hide behind a disclosure. Same queue + stores as the Inbox.

// Done lives in Tasks (the receipts ledger) — the queue only competes on Now/Soon
const AC_BUCKETS = [
  { id: "now",  label: "Now",  hint: "Needs you" },
  { id: "soon", label: "Soon", hint: "Next 4 hrs" },
];

// Slice 4: with window.TODAY_DATA present the queue is the REAL escalation
// queue — same chrome, same rows, real verbs (open/snooze via the courier;
// there are no drafts in the real product, so no Approve/Decline). Seeded
// mockup otherwise, untouched.
const AgentCommand = () => {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const bump = () => force((n) => n + 1);
    window.addEventListener("surface:today", bump);
    return () => window.removeEventListener("surface:today", bump);
  }, []);
  return window.TODAY_DATA ? <TodayQueue vm={window.TODAY_DATA} /> : <AgentCommandSeed />;
};

// Needs you: ONE list in the strip's row grammar (attention-bits.jsx) —
// WhatsApp handoffs, callers who need a call back, reply windows closing,
// calls worth an ear (contracts/today.ts queue), and the playbook runs that
// wait for a word or sit under a Stop (the broadcasts surface) — the longest
// wait first, each with its one verb and, where the state asks it, a second.
// A call in progress rides above the list while it lasts.
const useSurfaceTick = (name) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener(name, bump);
    return () => window.removeEventListener(name, bump);
  }, [name]);
};

const tqClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const LiveRail = ({ nav }) => {
  useSurfaceTick("surface:live");
  const [nowMs, setNowMs] = React.useState(Date.now());
  const L = window.__LIVE;
  // The heartbeat rule, re-applied between refreshes, the way the Live page does.
  const live = L ? L.now.filter((c) => nowMs - (c.heartbeatAtMs || c.startedAtMs || 0) < L.heartbeatMs) : [];
  const count = live.length;
  React.useEffect(() => {
    if (!count) return undefined;
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [count]);
  if (!count) return null;
  return live.map((c) => {
    const last = [...c.transcript].reverse().find((t) => t.speaker !== "whisper");
    const elapsed = Math.max(0, Math.floor((nowMs - (c.startedAtMs || nowMs)) / 1000));
    return (
      <div key={c.callId} className="tq-live" data-testid="brief-live-call">
        <span className="live-dot" />
        <span className="tq-live-text">
          <b>{c.who}</b> is on the line · {tqClock(elapsed)}
          {last ? <span className="tq-live-last"> · {last.speaker === "client" ? c.whoShort : "Receptionist"}: &ldquo;{last.text.slice(0, 90)}&rdquo;</span> : null}
        </span>
        <button className="cl-attn-cta primary" onClick={() => nav("live")}>Open Live</button>
      </div>
    );
  });
};

// A playbook's run that waits for a person, or one under the veto window —
// scheduled, not yet sending — as rows of the same grammar, with Approve or
// Stop where the button goes. What already went out is the hero's receipt.
const runRows = (nav, flash) => {
  const all = (window.__BROADCASTS && window.__BROADCASTS.rows) || [];
  const waiting = all.filter((r) => r.state === "pending_approval");
  const soon = all.filter((r) => r.state === "scheduled" && r.playbook_id && Date.parse(r.scheduled_for) > Date.now());
  const people = (r) => `${r.recipient_count} ${r.recipient_count === 1 ? "person" : "people"}`;
  const can = window.canDo && window.canDo("approve");
  const stop = async (r) => {
    if (!can || !window.__broadcasts) return;
    const res = await window.__broadcasts.cancel(r.id);
    if (res.ok && window.__refreshPlaybooks) window.__refreshPlaybooks();
    flash(res.ok ? { msg: <><b>{r.audience.label}</b> stopped — nothing sends</> } : window.refusalToast(res, "Not stopped"));
  };
  const approve = async (r) => {
    if (!can || !window.__broadcasts) return;
    const res = await window.__broadcasts.approve(r.id);
    if (res.ok && window.__refreshPlaybooks) window.__refreshPlaybooks();
    const n = res.ok ? (res.data.recipient_count || r.recipient_count) : 0;
    flash(res.ok ? { msg: <><b>{r.audience.label}</b> approved — {n} {n === 1 ? "person" : "people"}, sending now</> } : window.refusalToast(res, "Not approved"));
  };
  return [
    ...waiting.map((r) => (
      <window.AttnRow
        key={`run-${r.id}`}
        initials="▶"
        glyph="bolt"
        name={r.audience.label}
        meta="Playbook · ready"
        sentence={`${people(r)} · nothing sends until you say so`}
        status={["Waiting for your approval"]}
        tone="escalated"
        cta={{ label: "Approve", kind: "primary", onClick: () => approve(r) }}
        also={{ label: "Open Playbooks", onClick: () => nav("outbound") }}
        onOpen={() => nav("outbound")}
        testid="brief-run-row"
      />
    )),
    ...soon.map((r) => (
      <window.AttnRow
        key={`run-${r.id}`}
        initials="▶"
        glyph="bolt"
        name={r.audience.label}
        meta={`Playbook · sends ${r.when}`}
        sentence={`${people(r)} · stop it if you'd rather not`}
        status={["Scheduled", `sends ${r.when}`]}
        tone="warn"
        cta={{ label: "Open", kind: "primary", onClick: () => nav("broadcasts") }}
        also={{ label: "Stop", onClick: () => stop(r), gate: window.gate("approve") }}
        onOpen={() => nav("broadcasts")}
        testid="brief-run-soon"
      />
    )),
  ];
};

const TodayQueue = ({ vm }) => {
  useSurfaceTick("surface:broadcasts");
  const [toastNode, ppFlash] = window.usePPToast();
  const nav = (to) => window.appNavigate && window.appNavigate(to);
  const verb = async (r, which) => {
    if (!(window.canDo && window.canDo("approve"))) return;
    const res = await window.__inboxVerb(
      { conversationId: r.also.conversationId, escalationId: r.also.escalationId, who: r.who },
      which, {},
    );
    ppFlash(res.ok
      ? { msg: which === "snooze" ? <><b>{r.who}</b> snoozed — hidden until they wake or reply</> : <><b>{r.who}</b> — done, the receptionist has the thread back</> }
      : window.refusalToast(res, which === "snooze" ? "Not snoozed" : "Not resolved"));
  };
  const rows = vm.queue.rows;
  const runs = runRows(nav, ppFlash);
  const total = rows.length + runs.length + vm.queue.more;
  return (
    <section className="tq" data-testid="today-queue">
      <div className="tq-head">
        <span className="tq-title">Your queue</span>
        <span className={`tq-count tabular ${total ? "" : "calm"}`}>{total}</span>
        <span className="tq-sub">
          {[...vm.queue.parts, runs.length ? `${runs.length} run${runs.length === 1 ? "" : "s"} waiting` : ""].filter(Boolean).join(" · ") || (vm.standing.alert ? "nothing in the queue" : "nothing needs you")}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => nav("inbox")}>Open Inbox <Icon name="arrow-right" size={11} /></button>
      </div>
      <LiveRail nav={nav} />
      <div className="tq-list">
        {rows.map((r) => (
          <window.AttnRow
            key={r.id}
            initials={r.initials}
            glyph={r.channel === "Phone" && /^[+\d(]/.test(r.who) ? "phone" : null}
            name={r.who}
            meta={`${r.channel} · ${r.when}`}
            sentence={r.sentence}
            quoted={r.quoted}
            status={r.status}
            tone={r.tone}
            cta={{ label: r.cta.label, kind: "primary", onClick: () => nav(r.cta.to) }}
            also={r.also ? { label: r.also.label, onClick: () => verb(r, r.also.verb), gate: window.gate("approve"), testid: `queue-${r.also.verb}` } : null}
            onOpen={() => nav(r.cta.to)}
            testid={`queue-${r.kind}`}
          />
        ))}
        {runs}
        {total === 0 && (vm.standing.alert
          // A dark line: an empty queue is not "the receptionist is answering".
          ? <EmptyState kind="line" glyph="alert" tone="warn" title="Nothing in the queue — new messages go unanswered until the line is back." testid="today-queue-empty-down" />
          : <EmptyState kind="line" glyph="check" tone="ok" title="All caught up — the receptionist is answering on its own." />
        )}
      </div>
      {vm.queue.more > 0 && (
        <div className="tq-foot">
          <span>{vm.queue.more} more in the Inbox</span>
          <button className="cl-attn-cta ghost" onClick={() => nav("inbox")}>See all</button>
        </div>
      )}
      {toastNode}
    </section>
  );
};

const AgentCommandSeed = () => {
  const { AGENT_TASKS, AGENT_FLEET } = window.CHANLY_DATA;
  const [bucket, setBucket] = React.useState("now");
  const [agentFilter, setAgentFilter] = React.useState(null);
  const [openRow, setOpenRow] = React.useState("t1");
  const [toastNode, ppFlash] = window.usePPToast();

  // Decision state — thread-linked tasks read/write IX_STORE so Today and the
  // Inbox are ONE queue (CLAUDE.md); local-only for tasks without a thread.
  const allDecidable = [...AGENT_TASKS.now, ...AGENT_TASKS.soon];
  function syncFromStore(base) {
    const next = { ...base };
    const S = window.IX_STORE;
    if (!S) return next;
    allDecidable.forEach((t) => {
      if (!t.threadId) return;
      const rec = S.get(t.threadId);
      if (rec && rec.kind === "decided") next[t.id] = rec.declined ? "declined" : "approved";
      else if (next[t.id] === "approved" || next[t.id] === "declined") delete next[t.id];
    });
    return next;
  }
  const [decisions, setDecisions] = React.useState(() => syncFromStore({}));
  React.useEffect(() => {
    const sync = () => setDecisions((d) => syncFromStore(d));
    window.addEventListener("inbox:decisions", sync);
    return () => window.removeEventListener("inbox:decisions", sync);
  }, []);
  const decide = (id, kind) => {
    if (!window.canDo("approve")) return;
    const t = allDecidable.find((x) => x.id === id);
    if (t && t.threadId && window.IX_STORE) {
      if (kind === undefined) window.IX_STORE.clear(t.threadId);
      else if (kind === "declined") window.IX_STORE.set(t.threadId, { action: "Decline", at: window.CHANLY.IX_NOW, declined: true, kind: "decided" });
      else window.IX_STORE.set(t.threadId, { action: t.recommended || "Approve", at: window.CHANLY.IX_NOW, kind: "decided" });
    }
    setDecisions((d) => { const n = { ...d }; if (kind === undefined) delete n[id]; else n[id] = kind; return n; });
  };

  // "Safe" = the one shared threshold (CONF.SAFE), mapped from the 1–3 dot scale
  const approveAllSafe = () => {
    if (!window.canDo("approve")) return;
    const safe = AGENT_TASKS.now.filter((t) => !decisions[t.id] && window.CHANLY.confFromDots(t.confidence) >= window.CHANLY.CONF.SAFE);
    if (!safe.length) return;
    safe.forEach((t) => decide(t.id, "approved"));
    ppFlash({
      msg: <><b>{safe.length} safe draft{safe.length === 1 ? "" : "s"}</b> approved — agents are sending</>,
      undo: () => safe.forEach((t) => decide(t.id, undefined)),
    });
  };
  useHotkey(
    (e, typing) => !typing && e.shiftKey && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === "a" && bucket === "now",
    approveAllSafe
  );

  const decidedIn = (list) => list.filter((t) => decisions[t.id]).length;
  const counts = {
    now: AGENT_TASKS.now.length - decidedIn(AGENT_TASKS.now),
    soon: AGENT_TASKS.soon.length - decidedIn(AGENT_TASKS.soon),
  };
  let tasks = AGENT_TASKS[bucket];
  if (agentFilter) tasks = tasks.filter((t) => t.agentGlyph === agentFilter);
  const trueNeeds = (window.THREADS || []).filter((t) => t.state === "needs" && !(window.IX_STORE && window.IX_STORE.get(t.id))).length;
  const moreInInbox = Math.max(0, trueNeeds - counts.now);

  // FL_STORE overlay so pauses made anywhere reflect here
  const fleetLive = AGENT_FLEET.map((a) => {
    const s = window.FL_STORE && window.FL_STORE.statuses[window.CHANLY.agentIdFor(a.name)];
    return s ? { ...a, status: s } : a;
  });
  React.useEffect(() => {
    const bump = () => setDecisions((d) => ({ ...d }));
    window.addEventListener("fleet:status", bump);
    return () => window.removeEventListener("fleet:status", bump);
  }, []);

  // Agent filter is CONTEXT, not chrome: only the agents present in this bucket.
  const presentGlyphs = [...new Set(AGENT_TASKS[bucket].map((t) => t.agentGlyph))];
  const presentAgents = presentGlyphs.map((g) => fleetLive.find((a) => a.glyph === g) || { glyph: g, name: g });

  // Insight tracks live decisions — never claims work that's already done
  const undecidedNow = AGENT_TASKS.now.filter((t) => !decisions[t.id]);
  const posSum = undecidedNow.filter((t) => (t.value || 0) > 0).reduce((s, t) => s + t.value, 0);
  const nowInsight = undecidedNow.length === 0
    ? "Queue clear — everything decided. Soon runs on schedule; Done shows the last 30 minutes."
    : `${undecidedNow.length} waiting on you.`
      + (undecidedNow.some((t) => t.id === "t1") ? " Aisha's refund is owner-handled — the plan books her with you at 4:30." : "")
      + (posSum > 0 ? ` $${posSum}+ on the table if you confirm fast${undecidedNow.some((t) => t.id === "t3") ? " — Jordan's intro-call offer is ready to send" : ""}.` : "");
  const insight = bucket === "now"
    ? nowInsight
    : "3 queued in the next few hours. Two are auto-confident and will run unless you pause them.";

  return (
    <section className="ac">
      {/* One compact command bar */}
      <div className="ac-bar">
        <span className="ac-bar-title">Agent Command</span>
        <div className="ac-seg" role="tablist" aria-label="Queue bucket">
          {AC_BUCKETS.map((b) => (
            <button
              key={b.id}
              role="tab"
              aria-selected={bucket === b.id}
              data-tip={b.hint}
              className={`ac-seg-btn ${bucket === b.id ? "active" : ""} ${b.id === "now" && counts.now > 0 ? "urgent" : ""}`}
              onClick={() => setBucket(b.id)}
            >
              {b.label}
              <span className="ac-seg-count tabular">{counts[b.id]}</span>
            </button>
          ))}
        </div>
        <div className="ac-bar-r">
          <button className="btn btn-ghost btn-sm" data-tip="Receipts for everything agents finished — the Done ledger" onClick={() => window.CHANLY.nav("tasks")}>Receipts</button>
          <button className="btn btn-ghost btn-sm ac-bar-inbox" onClick={() => window.CHANLY.nav("inbox")}>
            Open Inbox <Icon name="arrow-right" size={11} />
          </button>
        </div>
      </div>

      {/* One context line: AI insight · agents present · batch approve */}
      <div className="ac-insight">
        <Icon name="sparkle" size={12} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 3 }} />
        <p className="ac-insight-text">{insight}</p>
        <div className="ac-insight-r">
          {presentAgents.length > 1 && (
            <div className="ac-agents" role="group" aria-label="Filter by agent">
              <button className={`ac-agent-chip ${!agentFilter ? "active" : ""}`} onClick={() => setAgentFilter(null)}>All</button>
              {presentAgents.map((a) => (
                <button
                  key={a.glyph}
                  className={`ac-agent-chip glyph ${agentFilter === a.glyph ? "active" : ""}`}
                  onClick={() => setAgentFilter(agentFilter === a.glyph ? null : a.glyph)}
                  title={a.name}
                >
                  {a.glyph}
                </button>
              ))}
            </div>
          )}
          {bucket === "now" && (
            <button className="btn btn-sm ac-safe" data-tip="Approves every draft at 80%+ confidence in one go — a single Undo reverses the batch" onClick={approveAllSafe} {...window.gate("approve")}>
              <Icon name="zap" size={12} /> Approve all safe
              <span className="kbd" style={{ marginLeft: 4 }}>⇧A</span>
            </button>
          )}
        </div>
      </div>

      {/* Decisions */}
      <div className="ac-list">
        {tasks.length === 0 && (
          <div className="ac-empty">
            <div className="ac-empty-line"><Icon name="check" size={16} style={{ color: "var(--ok)" }} /> All caught up — nothing needs you here.</div>
            {bucket === "now" && counts.soon > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setBucket("soon")}>{counts.soon} queued for later — view Soon <Icon name="arrow-right" size={11} /></button>
            )}
            <div className="ghost-row" aria-hidden="true">
              <span className="dr-kind" style={{ color: "var(--ink-faint)" }}>Refund</span>
              <span>Aisha Khan</span><span className="dot"></span><span>−$120 at stake</span><span className="dot"></span><span>Approve · Edit · Decline</span>
              <span className="ghost-tag">how decisions look</span>
            </div>
          </div>
        )}
        {tasks.map((t) => (
          <DecisionRow
            key={t.id}
            task={t}
            bucket={bucket}
            isOpen={openRow === t.id}
            onToggle={() => setOpenRow(openRow === t.id ? null : t.id)}
            decision={decisions[t.id]}
            onDecide={decide}
          />
        ))}
        {tasks.length > 0 && (
          <div className="ac-list-foot">
            <span className="ac-list-foot-meta">
              {tasks.length} {bucket === "now" ? "needing your call" : "queued"}
              {agentFilter && <> · <strong>{presentAgents.find((a) => a.glyph === agentFilter)?.name}</strong></>}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav("inbox")}>
              {bucket === "now" && moreInInbox > 0 ? `+${moreInInbox} more in Inbox` : "View all in Inbox"} <Icon name="arrow-right" size={11} />
            </button>
          </div>
        )}
      </div>
      {toastNode}
    </section>
  );
};

// --- Decision row: single column, actions always visible, draft-first expand ---
const DecisionRow = ({ task, bucket, isOpen, onToggle, decision, onDecide = () => {} }) => {
  const [showAlts, setShowAlts] = React.useState(false);
  const channelIcon = task.channel === "phone" ? "phone" : task.channel === "instagram" ? "instagram" : task.channel === "mail" ? "mail" : "chat";
  const isNow = bucket === "now";
  const isSoon = bucket === "soon";
  const canExpand = isNow && !!(task.plan || task.suggestedReply);
  const alts = task.alternatives || [];

  const topProps = canExpand
    ? { role: "button", tabIndex: 0, onClick: onToggle, onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } } }
    : {};

  return (
    <article className={`dr ${isNow ? "is-now" : ""} ${bucket === "done" ? "is-done" : ""} ${isOpen ? "is-open" : ""} ${decision ? "is-decided" : ""}`}>
      <div className={`dr-top ${canExpand ? "clickable" : ""}`} {...topProps}>
        <div className="dr-l1">
          <span className="dr-kind">{task.kind}</span>
          <span className="dr-who">{task.who}</span>
          <Icon name={channelIcon} size={11} className="dr-chan" />
          {task.value != null && (
            <span className={`dr-money ${task.value < 0 ? "neg" : "pos"} mono`}>
              {task.value < 0 ? "−" : "+"}${Math.abs(task.value).toLocaleString()}
            </span>
          )}
          {task.policyClass && <PolicyChip cls={task.policyClass} className="dec-policy" />}
          <span className="dr-grow" />
          <span className="dr-time mono">{task.time}</span>
          {canExpand && <Icon name="chevron-down" size={13} className="dr-chev" />}
        </div>
        <div className="dr-detail">
          {task.detail}
          {task.whoMeta && <span className="dr-meta"> · {task.whoMeta}</span>}
        </div>
      </div>

      {isOpen && isNow && (
        <div className="dr-expand">
          {task.plan && (
            <div className="dr-rec">
              <span className="dr-rec-k">Recommends</span>
              <span className="dr-rec-action">{task.plan.label}</span>
              {task.plan.note && <span className="dr-rec-note">{task.plan.note}</span>}
              {alts.length > 0 && (
                <button className="dr-alt-toggle" onClick={() => setShowAlts((v) => !v)}>
                  {showAlts ? "Hide options" : `${alts.length} other option${alts.length === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
          )}
          {showAlts && alts.map((a, i) => (
            <div key={i} className="dr-alt">
              <span className="dr-alt-action">{a.label}</span>
              <span className="dr-alt-note">{a.note}</span>
            </div>
          ))}
          {task.suggestedReply && (
            <div className="dr-draft">
              <div className="dr-draft-head">
                <Icon name="sparkle" size={10} />
                Draft reply
                <span className="dr-draft-by">· {task.agent}</span>
                {task.threadId && (
                  <button className="dr-draft-edit" onClick={() => window.CHANLY.nav(window.CHANLY.R.thread(task.threadId))}>
                    <Icon name="edit" size={11} /> Edit in thread
                  </button>
                )}
              </div>
              <p className="dr-draft-body">{task.suggestedReply}</p>
            </div>
          )}
        </div>
      )}

      <div className="dr-foot">
        <span className="dr-agent">
          <span className={`agent-avatar ${isNow ? "active" : ""}`}>{task.agentGlyph}</span>
          <strong>{task.agent}</strong>
          <span className="dr-agent-state">
            {isNow ? "waiting on you" : isSoon ? "queued" : "handled"}
            {task.reason ? ` · ${task.reason}` : ""}
          </span>
        </span>
        <div className="dr-acts">
          {(isNow || isSoon) && decision && (
            <span className={`dr-decided ${decision === "sent" ? "approved" : decision === "paused" ? "declined" : decision}`}>
              <Icon name={decision === "approved" || decision === "sent" ? "check" : "x"} size={11} />
              {decision === "approved" ? `Approved — ${task.agent} is sending`
                : decision === "sent" ? `Sent — ${task.agent} delivered it`
                : decision === "paused" ? `Paused — ${task.agent} will hold`
                : `Declined — polite pass`}
              <button className="dr-undo" onClick={() => onDecide(task.id, undefined)}>Undo</button>
            </span>
          )}
          {isNow && !decision && (
            <>
              <button className="btn btn-sm btn-primary" onClick={() => onDecide(task.id, "approved")} {...window.gate("approve")}>
                Approve <span className="kbd kbd-on-primary">A</span>
              </button>
              <button className="btn btn-sm" onClick={() => window.CHANLY.nav(task.threadId ? `inbox/${task.threadId}` : "inbox")}>
                Edit <span className="kbd">E</span>
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => onDecide(task.id, "declined")} {...window.gate("approve")}>
                Decline <span className="kbd">D</span>
              </button>
            </>
          )}
          {isSoon && !decision && (
            <>
              <button className="btn btn-sm" onClick={() => onDecide(task.id, "sent")} {...window.gate("approve")}>Send now</button>
              <button className="btn btn-ghost btn-sm" onClick={() => onDecide(task.id, "paused")} {...window.gate("approve")}>Pause</button>
            </>
          )}
          {bucket === "done" && (
            <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(task.threadId ? `inbox/${task.threadId}` : "inbox")}>View thread</button>
          )}
        </div>
      </div>
    </article>
  );
};

window.AgentCommand = AgentCommand;
