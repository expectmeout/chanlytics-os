/* global React, Icon */
// Agent Fleet — the bottom section of Dashboard A.
// Each agent is a card showing:
//   - status + current activity
//   - today's contribution (mini stats)
//   - autonomy meter (1-4) — represents trust/delegation
//   - quick actions (pause, give task, view transcripts)
// Active agents have a subtle pulse, idle ones recede.

const AgentFleet = () => {
  const { AGENT_FLEET } = window.CHANLY_DATA;
  const [showAll, setShowAll] = React.useState(false);
  const [filter, setFilter] = React.useState("all"); // all | active | scheduled | idle
  const [toastNode, ppFlash] = window.usePPToast();
  const [, setTick] = React.useState(0);

  // FL_STORE overlay — pauses made here or on the Fleet page reflect live
  React.useEffect(() => {
    const bump = () => setTick(n => n + 1);
    window.addEventListener("fleet:status", bump);
    return () => window.removeEventListener("fleet:status", bump);
  }, []);
  const fleet = AGENT_FLEET.map(a => {
    const s = window.FL_STORE && window.FL_STORE.statuses[window.CHANLY.agentIdFor(a.name)];
    return s ? { ...a, status: s } : a;
  });

  // Rank: active → scheduled → idle/paused, then by today's revenue (busier first)
  const STATUS_RANK = { active: 0, scheduled: 1, idle: 2, paused: 3 };
  const ranked = [...fleet].sort((a, b) => {
    const r = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
    return r !== 0 ? r : (b.today.revenue || 0) - (a.today.revenue || 0);
  });

  const filtered = filter === "all" ? ranked : ranked.filter(a => filter === "idle" ? (a.status === "idle" || a.status === "paused") : a.status === filter);

  // Cap visible to 6 cards before "Show all" reveals the rest
  const VISIBLE_CAP = 6;
  const visible = showAll ? filtered : filtered.slice(0, VISIBLE_CAP);
  const hiddenCount = Math.max(0, filtered.length - VISIBLE_CAP);

  // Computed meta — never hardcoded
  const liveCount = fleet.filter(a => a.status === "active").length;
  const scheduledCount = fleet.filter(a => a.status === "scheduled").length;
  const reviewQueue = fleet.reduce((s, a) => s + (a.pendingReviews || 0), 0);

  const filterChips = [
    { id: "all",       label: "All",       count: fleet.length },
    { id: "active",    label: "Live",      count: liveCount },
    { id: "scheduled", label: "Scheduled", count: scheduledCount },
    { id: "idle",      label: "Idle",      count: fleet.filter(a => a.status === "idle" || a.status === "paused").length },
  ];

  return (
    <section className="fleet">
      <header className="fleet-head">
        <div>
          <h3 className="fleet-title">Agent fleet</h3>
          <p className="fleet-sub">
            {fleet.length} agents · {liveCount} live · {reviewQueue} review{reviewQueue === 1 ? "" : "s"} queued
          </p>
        </div>
        <div className="fleet-head-actions">
          <div className="fleet-filter">
            {filterChips.map(c => (
              <button
                key={c.id}
                className={`fleet-filter-chip ${filter === c.id ? "active" : ""}`}
                onClick={() => { setFilter(c.id); setShowAll(false); }}
              >
                {c.label}
                <span className="fleet-filter-count tabular">{c.count}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-sm" onClick={() => window.CHANLY.nav("fleet")}>
            Manage agents <Icon name="arrow-right" size={12} />
          </button>
        </div>
      </header>

      <div className="fleet-grid">
        {visible.map((a) => (
          <FleetCard key={a.glyph} agent={a} ppFlash={ppFlash} />
        ))}
        {!showAll && hiddenCount > 0 && (
          <button className="fleet-more" onClick={() => setShowAll(true)}>
            <span className="fleet-more-num tabular">+{hiddenCount}</span>
            <span className="fleet-more-label">Show all agents</span>
            <span className="fleet-more-meta">
              {filtered.slice(VISIBLE_CAP).map(a => a.glyph).join(" · ")}
            </span>
          </button>
        )}
        {showAll && (
          <button className="fleet-add" onClick={() => window.CHANLY.nav("store")}>
            <span className="fleet-add-mark">
              <Icon name="plus" size={16} />
            </span>
            <span className="fleet-add-label">Hire from store</span>
            <span className="fleet-add-meta">6 new abilities</span>
          </button>
        )}
      </div>

      {showAll && filtered.length > VISIBLE_CAP && (
        <button className="fleet-collapse" onClick={() => setShowAll(false)}>
          <Icon name="chevron-up" size={12} />
          Collapse
        </button>
      )}

      {toastNode}
    </section>
  );
};

const FleetCard = ({ agent: a, ppFlash = () => {} }) => {
  const channelIcon = a.activity.channel === "phone" ? "phone" : a.activity.channel === "instagram" ? "instagram" : a.activity.channel === "mail" ? "mail" : "chat";
  const agentId = window.CHANLY.agentIdFor(a.name);
  // Trust digest — same numbers as Fleet's Trust card and the veto bar (window.TRUST)
  const tr = window.TRUST && window.TRUST.agent(agentId);
  const editRate = tr ? window.TRUST.rate(tr) : null;

  return (
    <article className={`fcard fcard-${a.status} ${a.status === "paused" ? "fcard-paused" : ""}`} onClick={() => window.CHANLY.nav(window.CHANLY.R.agent(agentId))} style={{ cursor: "pointer" }}>
      {/* Header: avatar + status + name + pending count */}
      <header className="fcard-head">
        <span className={`fcard-avatar ${a.status}`}>
          {a.glyph}
          {a.status === "active" && <span className="fcard-pulse" />}
        </span>
        <div className="fcard-head-meta">
          <div className="fcard-name">{a.name}</div>
          <div className="fcard-status">
            <span className={`fcard-status-dot ${a.status}`} />
            {a.status === "active" ? "Live" : a.status === "scheduled" ? "Scheduled" : a.status === "paused" ? "Paused" : "Idle"}
          </div>
        </div>
        {a.pendingReviews > 0 && (
          <span className="fcard-pending mono" title={`${a.pendingReviews} reviews queued`}>
            {a.pendingReviews}
          </span>
        )}
      </header>

      {/* Activity line — what they're doing right now */}
      <div className="fcard-activity">
        <Icon name={channelIcon} size={11} style={{ color: "var(--ink-dim)" }} />
        <span className="fcard-activity-text">
          <strong>{a.activity.verb}</strong>
          {a.activity.target && <span className="muted"> · {a.activity.target}</span>}
        </span>
        {a.activity.elapsed && (
          <span className="fcard-elapsed mono">{a.activity.elapsed}</span>
        )}
      </div>

      {/* Today's stats — three columns */}
      <div className="fcard-stats">
        <div className="fcard-stat">
          <span className="fcard-stat-num tabular">{a.today.convos}</span>
          <span className="fcard-stat-lbl">convos</span>
        </div>
        <div className="fcard-stat">
          <span className="fcard-stat-num tabular">{a.today.bookings}</span>
          <span className="fcard-stat-lbl">bookings</span>
        </div>
        <div className="fcard-stat">
          <span className="fcard-stat-num tabular">
            {a.today.revenue ? `$${(a.today.revenue / 1000).toFixed(1)}k` : "—"}
          </span>
          <span className="fcard-stat-lbl">revenue</span>
        </div>
      </div>

      {/* Trust digest — live edit rate + streak, not a dead meter */}
      <div className="fcard-auton">
        <div className="fcard-auton-head">
          <span className="fcard-auton-label">Trust · 30d</span>
          {tr ? (
            <span className={`fcard-auton-level ${editRate <= 5 ? "trust-ok" : "trust-watch"}`}>{editRate}% edit rate</span>
          ) : (
            <span className="fcard-auton-level muted">Earning — no auto-sends yet</span>
          )}
        </div>
        {tr && (
          <div className="fcard-trust-line" data-tip="Clean streak counts consecutive auto-sends you didn't edit · 30d window">
            {window.TRUST.line(tr)}
            {tr.next && <span className="fcard-trust-next"> · {window.TRUST.next(tr)}</span>}
          </div>
        )}
      </div>

      {/* Footer actions — only show on hover, but always reserve space for layout */}
      <footer className="fcard-foot" onClick={(e) => e.stopPropagation()}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            const paused = a.status === "paused";
            if (window.FL_STORE) window.FL_STORE.setStatus(agentId, paused ? null : "paused");
            ppFlash({
              msg: paused
                ? <><b>{a.name}</b> resumed — it picks up where it left off</>
                : <><b>{a.name}</b> paused — in-flight work holds, nothing new starts</>,
              undo: () => window.FL_STORE && window.FL_STORE.setStatus(agentId, paused ? "paused" : null),
            });
          }}
          {...window.gate("autonomy")}
        >
          {a.status === "paused" ? "Resume" : "Pause"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => window.askAbout({
          prompt: "Give " + a.name + " a task",
          answer: a.name + " is ready. Tell me what to hand off and it runs inside its autonomy rules — it has " + (a.pendingReviews || 0) + " review" + (a.pendingReviews === 1 ? "" : "s") + " waiting on you right now.",
          links: [{ label: "Open its Fleet page", to: window.CHANLY.R.agent(agentId) }],
        })}>Give task</button>
        <MoreMenu items={[
          { header: a.name },
          { label: "Open agent", icon: "arrow-right", onClick: () => window.CHANLY.nav(window.CHANLY.R.agent(agentId)) },
          { label: "View transcripts", icon: "chat", onClick: () => window.CHANLY.nav("conversations") },
          { label: "Autonomy & rules", icon: "shield", onClick: () => window.askAbout({ mode: "compose", prompt: "Change " + a.name + "'s autonomy: " }) },
          { divider: true },
          { label: "Disable agent", icon: "pause", danger: true, onClick: () => window.askAbout({ prompt: "Disable " + a.name + "?", answer: a.name + " stops taking new work; in-flight items move to your Inbox.", links: [{ label: "Open its Fleet page", to: window.CHANLY.R.agent(agentId) }] }) },
        ]} />
      </footer>
    </article>
  );
};

window.AgentFleet = AgentFleet;

// Weekly trust review — the 5-second ritual (#2): what auto-sent, one widening,
// one tightening. Dismiss persists for the session via ST_STORE.
const TrustReview = () => {
  const [dismissed, setDismissed] = React.useState(() => !!(window.ST_STORE && window.ST_STORE.get && window.ST_STORE.get("trustReview.done")));
  if (dismissed) return null;
  const T = window.TRUST;
  const reply = T && T.cls("reply");
  const email = T && T.agent("email-agent");
  const chat = T && T.agent("chat-agent");
  const done = () => { window.ST_STORE && window.ST_STORE.set && window.ST_STORE.set("trustReview.done", 1); setDismissed(true); };
  return (
    <section className="trust-review">
      <div className="tr-head">
        <Icon name="shield" size={13} style={{ color: "var(--accent)" }} />
        <span className="tr-title">Weekly trust review</span>
        <span className="tr-meta">30 days · 5 seconds to read</span>
        <button className="btn btn-ghost btn-sm" onClick={done}>Done</button>
      </div>
      <div className="tr-rows">
        <div className="tr-row">
          <span className="tr-verb ok">Held up</span>
          <span className="tr-text">{reply ? `${reply.sent.toLocaleString()} auto-sent · ${T.rate(reply)}% edited — under the 5% widen signal.` : "Agents ran clean this month."}</span>
        </div>
        <div className="tr-row">
          <span className="tr-verb accent">Widen</span>
          <span className="tr-text">Email Agent: {email ? `${email.streak} clean in a row — ${Math.max(0, email.next.need - email.streak)} more unlocks ${email.next.label}.` : "clean streak building."}</span>
          <button className="brief-chip" onClick={() => window.CHANLY.nav(window.CHANLY.R.agent("email-agent"))}>Review & enable</button>
        </div>
        <div className="tr-row">
          <span className="tr-verb warn">Tighten</span>
          <span className="tr-text">Chat Agent edit rate {chat ? T.rate(chat) : 10}% on partnership DMs — worth Ask-first there.</span>
          <button className="brief-chip" onClick={() => window.CHANLY.nav("admin/autonomy")}>Open matrix</button>
        </div>
      </div>
    </section>
  );
};
window.TrustReview = TrustReview;
