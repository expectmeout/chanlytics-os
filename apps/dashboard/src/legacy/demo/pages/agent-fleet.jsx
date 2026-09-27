/* global React, Icon, StatStrip, StatCell, MoreMenu, FLEET_DATA */
// Chanlytics — Agent Fleet
// The per-agent control center: roster on the left, deep management on the right.
// Autonomy is a per-decision contract, not a single dial.
// Wired to the session stores: pending counts overlay IX_STORE decisions;
// permission + status changes go through FL_STORE (shared with the Inbox rail)
// and follow the toast-with-undo contract (CLAUDE.md).

const { useState: useFleetState, useEffect: useFleetEffect } = React;

const FL_CHANNEL_ICON = { phone: "phone", sms: "chat", mail: "mail", instagram: "instagram", chat: "chat" };

// Segment helpers — playbooks are segment-triggered (data/people-data.jsx)
const flSeg = (id) => window.CHANLY.seg(id);
const flPlaybooks = (agentId) => (window.FLEET_PLAYBOOKS || {})[agentId] || [];
const flManaged = (agentId, pausedMap = {}) => {
  const ids = [...new Set(
    flPlaybooks(agentId)
      .filter(p => p.status === "running" && !pausedMap[p.id])
      .map(p => p.segId)
      .filter(Boolean)
  )];
  return ids.reduce((a, id) => a + (flSeg(id)?.count || 0), 0);
};

// Live "awaiting you": seed pending minus this session's decided threads for this agent
const flLivePending = (agent) => {
  const threads = ((window.INBOX_DATA || {}).THREADS) || [];
  const D = ((window.IX_STORE || {}).decisions) || {};
  const decidedOfMine = threads.filter(t =>
    t.agent && t.agent.name === agent.name && D[t.id] && D[t.id].kind === "decided"
  ).length;
  return Math.max(0, (agent.pending || 0) - decidedOfMine);
};

// ---------- Roster (left pane) ----------
const FleetRoster = ({ roster, statuses, activeId, onSelect }) => {
  const { STATUS_META } = window.FLEET_DATA;
  const sorted = [...roster].sort((a, b) =>
    STATUS_META[statuses[a.id] === "paused" ? "idle" : statuses[a.id]].rank -
    STATUS_META[statuses[b.id] === "paused" ? "idle" : statuses[b.id]].rank ||
    a.name.localeCompare(b.name)
  );
  return (
    <aside className="fl-roster">
      <div className="fl-roster-head">
        <span className="fl-roster-label">Fleet</span>
        <span className="fl-roster-count">
          <span className="live-dot" style={{ width: 5, height: 5 }} />
          {Object.values(statuses).filter(s => s === "active").length} live
          <span className="fl-roster-sep">·</span>
          {roster.length}
        </span>
      </div>
      <div className="fl-roster-list">
        {sorted.map(a => {
          const status = statuses[a.id];
          const paused = status === "paused";
          const pending = flLivePending(a);
          return (
            <button
              key={a.id}
              className={`fl-agent ${activeId === a.id ? "active" : ""} ${paused ? "paused" : ""}`}
              onClick={() => onSelect(a.id)}
            >
              <span className={`agent-avatar ${status === "active" ? "active" : ""}`} style={{ width: 26, height: 26, fontSize: 11 }}>
                {a.glyph}
              </span>
              <span className="fl-agent-body">
                <span className="fl-agent-name">
                  {a.name}
                  {status === "active" && <span className="live-dot" style={{ width: 6, height: 6 }} />}
                </span>
                <span className="fl-agent-task">
                  {paused
                    ? "Paused — new work routes to your Inbox"
                    : <>{a.activity.verb}{a.activity.target ? ` · ${a.activity.target}` : ""}</>}
                  {!paused && flManaged(a.id) > 0 && <span className="fl-agent-mgmt tabular"> · {flManaged(a.id)} managed</span>}
                </span>
              </span>
              {pending > 0 && <span className="fl-agent-pending tabular">{pending}</span>}
            </button>
          );
        })}
      </div>
      <button className="sb-agents-foot" onClick={() => window.CHANLY.nav("store")}>
        <Icon name="plus" size={11} />
        <span>Hire from store</span>
        <span className="sb-agents-foot-meta">6 new</span>
      </button>
    </aside>
  );
};

// ---------- Detail (right pane) ----------
// ---------- Connection (external agents only) ----------
// Carries the Studio connect-flow contract into Fleet: provenance, endpoint,
// version, push, scopes, budget, redaction, handoffs — plus the kill switch.
const FlConnection = ({ agent, onFlash }) => {
  const c = agent.connection;
  if (!c) return null;
  return (
    <section className="fl-card">
      <div className="fl-card-head">
        <span className="fl-card-title">Connection</span>
        <span className="st-ext-tag">External · via A2A</span>
      </div>
      <div className="st-prov" style={{ marginBottom: 10 }}>
        <span>by {c.publisher}</span>
        {c.verified && <span className="st-prov-check" data-tip="Verified publisher — identity and claims checked in review"><Icon name="check" size={10} /></span>}
        {!c.verified && <span className="st-ext-tag">new publisher</span>}
      </div>
      <div className="st-conn">
        <div className="st-conn-row"><span className="st-conn-key">Endpoint</span><span className="st-conn-val mono">{c.endpoint}</span></div>
        {c.auth && <div className="st-conn-row"><span className="st-conn-key">Auth</span><span className="st-conn-val">{c.auth}</span></div>}
        {c.version && <div className="st-conn-row"><span className="st-conn-key">Version</span><span className="st-conn-val mono">v{c.version} · {c.policy}</span></div>}
        {c.push && <div className="st-conn-row"><span className="st-conn-key">Push</span><span className="st-conn-val">{c.push}</span></div>}
        {c.scopes && <div className="st-conn-row"><span className="st-conn-key">Data access</span><span className="st-conn-val">{c.scopes.granted} of {c.scopes.total} scopes granted</span></div>}
        {c.dataOut && <div className="st-conn-row"><span className="st-conn-key">Leaves workspace</span><span className="st-conn-val">{c.dataOut}</span></div>}
        {c.budget && <div className="st-conn-row"><span className="st-conn-key">Budget</span><span className="st-conn-val">{c.budget}</span></div>}
        {c.redaction && <div className="st-conn-row"><span className="st-conn-key">Redaction</span><span className="st-conn-val">{c.redaction}</span></div>}
        {c.handoffs && <div className="st-conn-row"><span className="st-conn-key">Handoffs</span><span className="st-conn-val">{c.handoffs}</span></div>}
        <div className="st-conn-row">
          <span className="st-conn-key">Monitoring</span>
          <span className="st-conn-val">checks every 60s · healthy since {c.since} — if it stops answering, the alert lands in your Inbox</span>
          <span className="pill pill-ok" style={{ marginLeft: "auto", flex: "none" }}>Healthy</span>
        </div>
      </div>
      <div className="st-floor">
        <Icon name="shield" size={12} />
        <span>Workspace guardrails and quiet hours bind this agent regardless of publisher. Disconnecting revokes its token immediately.</span>
      </div>
      <div className="sd-pub-row" style={{ marginTop: 10 }}>
        <button className="btn btn-sm" onClick={() => window.CHANLY.nav("studio")}>Review in Studio</button>
        <button className="btn btn-sm btn-danger-ghost" onClick={() => {
          window.AS_STORE.uninstall(agent.id);
          onFlash({
            msg: <><b>{agent.name}</b> disconnected — token revoked, push callback removed</>,
            undo: () => window.AS_STORE.addToFleet(agent),
          });
        }} {...window.gate("disconnect")}>Disconnect</button>
      </div>
    </section>
  );
};

const FleetDetail = ({ agent, status, onToggleStatus, onFlash }) => {
  const [, flPolTick] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("policy:changed", flPolTick);
    window.addEventListener("presence:changed", flPolTick);
    return () => { window.removeEventListener("policy:changed", flPolTick); window.removeEventListener("presence:changed", flPolTick); };
  }, []);
  const [perms, setPerms] = useFleetState(() => ({
    ...Object.fromEntries(agent.permissions.map(p => [p.id, p.value])),
    ...(window.FL_STORE ? window.FL_STORE.getPerms(agent.id) : {}),
  }));
  // Seeded from the session store — pauses survive navigation (FL_STORE)
  const [pbPaused, setPbPaused] = useFleetState(() =>
    Object.fromEntries(flPlaybooks(agent.id).map(pb => [pb.id, !!(window.FL_STORE && window.FL_STORE.isPbPaused(pb.id))]))
  );
  const [, setLmTick] = useFleetState(0);
  useFleetEffect(() => {
    const bump = () => setLmTick(n => n + 1);
    window.addEventListener("live:ended", bump);
    return () => window.removeEventListener("live:ended", bump);
  }, []);
  const playbooks = flPlaybooks(agent.id);
  const guardrails = window.SEG_GUARDRAILS || [];
  const isPaused = status === "paused";
  const statusLabel = isPaused ? "Paused" : window.FLEET_DATA.STATUS_META[status].label;
  const pending = flLivePending(agent);

  const setPerm = (p, v) => {
    if (!window.canDo("autonomy")) return;
    const prev = perms[p.id];
    if (prev === v) return;
    setPerms(cur => ({ ...cur, [p.id]: v }));
    if (window.FL_STORE) window.FL_STORE.setPerm(agent.id, p.id, v);
    const label = (p.options.find(o => o.v === v) || {}).label || v;
    onFlash({
      msg: <><b>{agent.name}</b> · {p.label} → {label}</>,
      undo: () => {
        setPerms(cur => ({ ...cur, [p.id]: prev }));
        if (window.FL_STORE) window.FL_STORE.setPerm(agent.id, p.id, prev);
      },
    });
  };

  const togglePb = (pb) => {
    if (!window.canDo("autonomy")) return;
    const wasPaused = !!pbPaused[pb.id];
    setPbPaused(m => ({ ...m, [pb.id]: !wasPaused }));
    if (window.FL_STORE) window.FL_STORE.setPbPaused(agent.id, pb.id, !wasPaused);
    onFlash({
      msg: <><b>{pb.name}</b> {wasPaused ? "resumed" : "paused"} — {agent.name} {wasPaused ? "picks the list back up" : "stops working this list"}</>,
      undo: () => {
        setPbPaused(m => ({ ...m, [pb.id]: wasPaused }));
        if (window.FL_STORE) window.FL_STORE.setPbPaused(agent.id, pb.id, wasPaused);
      },
    });
  };

  // Ended live call reshapes "Right now" for the agent that was on it
  const lmEnded = agent.glyph === "P" && window.LM_STORE && window.LM_STORE.isEnded("lc-selena") && /Selena/.test((agent.activity || {}).target || "");

  return (
    <div className="fl-detail">
      {/* Header */}
      <header className="fl-head">
        <span className={`st-tile lg ${status === "active" ? "" : "installed"}`}>{agent.glyph}</span>
        <div className="fl-head-titles">
          <div className="fl-head-name">
            {agent.name}
            <span className={`pill ${status === "active" ? "pill-accent" : isPaused ? "pill-warn" : ""}`}>
              {status === "active" && <span className="live-dot" style={{ width: 5, height: 5 }} />}
              {statusLabel}
            </span>
          </div>
          <div className="fl-head-role">{agent.role}</div>
          <div className="fl-head-meta">
            <span className="fl-chips">
              {agent.channels.map(c => (
                <span key={c} className="st-chip st-chip-ch"><Icon name={FL_CHANNEL_ICON[c]} size={11} /></span>
              ))}
            </span>
            <span>Installed {agent.since}</span>
            <span className="fl-head-dot" />
            <span className="tabular">{agent.price} credits/mo</span>
            {agent.identity && <>
              <span className="fl-head-dot" />
              <span data-tip="The identity this agent sends and speaks as">Sends as {agent.identity}</span>
            </>}
          </div>
        </div>
        <div className="fl-head-actions">
          <button className="btn btn-sm" onClick={onToggleStatus} {...window.gate("autonomy")}>
            <Icon name={isPaused ? "play" : "pause"} size={12} />
            {isPaused ? "Resume" : "Pause"}
          </button>
          <button className="btn btn-sm" onClick={() => window.askAbout({
            prompt: "Give " + agent.name + " a task",
            answer: agent.name + " is ready. Tell me what to hand off — a client to chase, a call to place, a follow-up to prep — and it runs inside the autonomy rules below. It currently has " + pending + " item" + (pending === 1 ? "" : "s") + " waiting on you.",
            links: [{ label: "Its queue in Inbox", to: "inbox" }],
          })}>
            <Icon name="sparkle" size={12} /> Give task
          </button>
          <MoreMenu items={[
            { header: agent.name },
            { label: "View transcripts", icon: "chat", onClick: () => window.CHANLY.nav("conversations") },
            { label: "Edit in Studio", icon: "sparkle", onClick: () => window.CHANLY.nav("studio") },
            { label: "Duplicate agent", icon: "plus", onClick: () => window.askAbout({ mode: "compose", prompt: "Duplicate " + agent.name + " as " }) },
            { label: "Autonomy & rules", icon: "shield", onClick: () => window.askAbout({ mode: "compose", prompt: "Change " + agent.name + "'s autonomy: " }) },
            { divider: true },
            { label: "Disable agent", icon: "pause", danger: true, onClick: () => window.askAbout({ prompt: "Disable " + agent.name + "?", answer: agent.name + " stops taking new work immediately; in-flight items move to your Inbox. Re-enable any time from the Store.", links: [{ label: "Open Store", to: "store" }] }) },
          ]} />
        </div>
      </header>

      <div className="fl-scroll">
        {/* Today's numbers */}
        <StatStrip className="fl-stats">
          <StatCell label="Conversations" value={agent.today.convos} meta="today" />
          <StatCell label="Bookings" tip="Bookings ÷ conversations · today" value={agent.today.bookings} meta={`${agent.today.conv} conversion`} />
          <StatCell label="Revenue" value={agent.today.revenue ? window.CHANLY.fmtMoney(agent.today.revenue) : "—"} meta="attributed today" />
          <StatCell label="Awaiting you" value={pending} meta={pending > 0 ? "in your Inbox" : "all clear"} metaTone={pending > 0 ? "neg" : "pos"} />
          <StatCell label="Under management" tip="People an active playbook is working right now" value={flManaged(agent.id, pbPaused) || "—"} meta="people via playbooks" />
          <StatCell label="14-day activity" spark={agent.spark} />
        </StatStrip>

        {/* Connection — external agents carry their Studio contract */}
        <FlConnection agent={agent} onFlash={onFlash} />

        <div className="fl-cols">
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          {/* Autonomy — the control-center core */}
          {window.TRUST && window.TRUST.agent(agent.id) && (() => {
            const t = window.TRUST.agent(agent.id);
            const rate = window.TRUST.rate(t);
            return (
              <section className="fl-card fl-trust">
                <div className="fl-card-head">
                  <span className="fl-card-title">Trust</span>
                  <span className="fl-card-sub">30 days — the numbers behind its autonomy</span>
                </div>
                <StatStrip>
                  <StatCell label="Auto-sent" tip="Messages sent without your review · 30d" value={t.sent.toLocaleString()} meta="messages · 30d" />
                  <StatCell label="Edit rate" tip="Auto-sends you edited ÷ auto-sent · 30d · under 5% is the widen-autonomy signal" value={rate + "%"} meta={rate <= 5 ? "healthy · under 5%" : "watch · above 5%"} metaTone={rate <= 5 ? "pos" : "warn"} />
                  <StatCell label="Clean streak" tip="Consecutive auto-sends with no edit — streaks unlock the next autonomy mode" value={t.streak} meta="consecutive · no edits" />
                </StatStrip>
                {t.next && (
                  <div className="fl-trust-next">
                    <div className="fl-trust-bar"><span style={{ width: Math.min(100, Math.round((t.streak / t.next.need) * 100)) + "%" }}></span></div>
                    <span className="fl-trust-note">{t.streak} of {t.next.need} clean — unlocks {t.next.label}</span>
                  </div>
                )}
              </section>
            );
          })()}

          <section className="fl-card fl-perms">
            <div className="fl-card-head">
              <span className="fl-card-title">Autonomy</span>
              <span className="fl-card-sub">Per decision — overrides the workspace matrix</span>
              <button className="fl-matrix-link" onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("autonomy"))}>Policy matrix <Icon name="arrow-right" size={9} /></button>
            </div>
            {agent.permissions.map(p => (
              <div key={p.id} className="fl-perm">
                <div className="fl-perm-info">
                  <span className="fl-perm-label">{p.label}</span>
                  {window.POLICY.forPerm[p.id] && (
                    <button className={`fl-perm-policy ${window.POLICY.modeOf(window.POLICY.forPerm[p.id]) === "Never" ? "never" : ""}`} data-tip="Workspace policy — the same class everywhere · set in Settings \u00b7 Autonomy" onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("autonomy"))}>
                      {(window.POLICY.row(window.POLICY.forPerm[p.id]) || {}).locked && <Icon name="shield" size={9} />} Workspace · {window.POLICY.modeOf(window.POLICY.forPerm[p.id])}
                    </button>
                  )}
                  {p.hint && (
                    p.hintThread ? (
                      <button className="fl-perm-hint fl-hint-link" onClick={() => window.CHANLY.nav(window.CHANLY.R.thread(p.hintThread))}>
                        {p.hint} <Icon name="arrow-right" size={9} />
                      </button>
                    ) : (
                      <span className="fl-perm-hint">{p.hint}</span>
                    )
                  )}
                </div>
                {(window.POLICY.row(window.POLICY.forPerm[p.id] || "") || {}).locked ? (
                  <span className="fl-perm-locked"><Icon name="shield" size={11} /> Never — books a call with you</span>
                ) : (
                <div className="cl-tabs fl-perm-seg">
                  {p.options.map(o => (
                    <button
                      key={o.v}
                      className={`cl-tab ${perms[p.id] === o.v ? "active" : ""}`}
                      onClick={() => setPerm(p, o.v)}
                      {...window.gate("autonomy")}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                )}
              </div>
            ))}
            <div className="fl-escalates">
              <span className="fl-escalates-label" data-tip="Topics this agent never handles alone — it sends the holding line and hands you the thread. Money isn't listed: the locked rows above own it."><Icon name="shield" size={11} /> Hands to you</span>
              <span className="fl-chips">
                {agent.escalates.map(e => {
                  const it = typeof e === "string" ? { label: e } : e;
                  const dec = it.threadId && window.IX_STORE && window.IX_STORE.get(it.threadId);
                  const waiting = !!it.threadId && !dec;
                  return it.threadId ? (
                    <button key={it.label} className={`st-chip fl-esc-chip ${waiting ? "waiting" : ""}`} data-tip={waiting ? "One is in your Inbox right now — click to open" : "Last one handled — open the receipt"} onClick={() => window.CHANLY.nav(window.CHANLY.R.thread(it.threadId))}>
                      {waiting && <span className="fl-esc-dot" />}{it.label} <Icon name="arrow-right" size={9} />
                    </button>
                  ) : (
                    <span key={it.label} className="st-chip" data-tip="Sends the holding line, then hands you the thread — nothing auto-sent">{it.label}</span>
                  );
                })}
              </span>
              {(agent.channels || []).includes("phone") && (
                <span className="fl-escalate-route">
                  Right now → {(window.PR_STORE && window.PR_STORE.reachable() && window.PR_STORE.transfers) ? "warm transfer to you" : "holding line + async approval in Inbox"}
                </span>
              )}
            </div>
          </section>

          {/* Playbooks — segment-triggered work */}
          <section className="fl-card">
            <div className="fl-card-head">
              <span className="fl-card-title">Playbooks</span>
              <span className="fl-card-sub">Lists drive the work — enter a segment, the playbook starts</span>
            </div>
            {playbooks.map(pb => {
              const s = pb.segId && flSeg(pb.segId);
              const isPbPaused = pbPaused[pb.id];
              const guard = pb.segId && guardrails.find(g => g.segId === pb.segId);
              return (
                <div key={pb.id} className="fl-pb">
                  <div className="fl-pb-main">
                    <span className="fl-pb-name">{pb.name}</span>
                    <span className="fl-pb-trigger">
                      {s ? (
                        <>
                          when someone {pb.trigger || "enters"}{" "}
                          <button className="chip fl-pb-seg" onClick={() => window.CHANLY.nav(window.CHANLY.R.segment(pb.segId))}>
                            <Icon name="sparkle" size={9} />{s.label} · {s.count}
                          </button>
                          {pb.stop && <> → stops when {pb.stop}</>}
                        </>
                      ) : (
                        <>on {pb.event}</>
                      )}
                    </span>
                    <span className="fl-pb-note">
                      {pb.note}
                      {guard && (
                        <button className="fl-guard-link" data-tip="Your guardrail — the agent can\u2019t cross it · set in Settings \u203a Autonomy" onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("autonomy"))}>
                          <Icon name="shield" size={9} /> {guard.label}: {guard.value}
                        </button>
                      )}
                    </span>
                  </div>
                  {isPbPaused ? <span className="pill pill-warn">Paused</span>
                    : pb.status === "draft" ? <span className="pill">Draft</span>
                    : <span className="pill pill-accent"><span className="live-dot" style={{ width: 5, height: 5 }} />Running</span>}
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    title={isPbPaused ? "Resume playbook" : pb.status === "draft" ? "Finish in Ask" : "Pause playbook"}
                    onClick={() => pb.status === "draft"
                      ? window.askAbout({ mode: "compose", prompt: `Finish the \u201c${pb.name}\u201d playbook for ${agent.name}: ` })
                      : togglePb(pb)}
                    {...window.gate("autonomy")}
                  >
                    <Icon name={pb.status === "draft" ? "sparkle" : isPbPaused ? "play" : "pause"} size={12} />
                  </button>
                </div>
              );
            })}
            {playbooks.length === 0 && (
              <div className="sg-usage-empty">No playbooks yet — point {agent.name} at a list and it works the members automatically.</div>
            )}
            <button className="cl-rail-newseg" style={{ marginTop: 8 }} onClick={() => window.askAbout({ mode: "compose", prompt: `Point ${agent.name} at a segment: ` })}>
              <Icon name="plus" size={11} />
              Point at a segment
            </button>
          </section>
          </div>

          <div className="fl-side">
            {/* Right now */}
            <section className="fl-card">
              <div className="fl-card-head">
                <span className="fl-card-title">
                  {status === "active" ? <span className="live-dot" style={{ width: 7, height: 7, marginRight: 6 }} /> : null}
                  Right now
                </span>
              </div>
              <div className="fl-now">
                <span className="fl-now-verb">{isPaused ? "Paused" : lmEnded ? "Wrapped call" : agent.activity.verb}</span>
                {!isPaused && lmEnded && <span className="fl-now-target"> · Selena Cho — booked Swedish 60</span>}
                {!isPaused && !lmEnded && agent.activity.target && <span className="fl-now-target"> · {agent.activity.target}</span>}
                {!isPaused && !lmEnded && agent.activity.elapsed && <span className="fl-now-elapsed mono tabular">{agent.activity.elapsed}</span>}
              </div>
              {lmEnded && !isPaused && (
                <button className="btn btn-ghost btn-sm fl-inbox-link" onClick={() => window.CHANLY.nav(window.CHANLY.R.conversation("cv-selena-live"))}>
                  Open the transcript <Icon name="arrow-right" size={11} />
                </button>
              )}
              <div className="fl-recent">
                {agent.recent.map((r, i) => (
                  <div key={i} className="fl-recent-row">
                    <span className="fl-recent-at mono tabular">{r.at}</span>
                    <span className={`fl-recent-dot ${r.kind}`} />
                    <span className="fl-recent-text">{r.text}</span>
                  </div>
                ))}
              </div>
              {pending > 0 && (
                <button className="btn btn-ghost btn-sm fl-inbox-link" onClick={() => window.CHANLY.nav("inbox")}>
                  Review {pending} in Inbox <Icon name="arrow-right" size={11} />
                </button>
              )}
            </section>

            {/* Voice */}
            <section className="fl-card">
              <div className="fl-card-head">
                <span className="fl-card-title">Voice</span>
                <button className="btn btn-ghost btn-sm" onClick={() => window.askAbout({ mode: "compose", prompt: "Make " + agent.name + "’s voice " })}>
                  <Icon name="edit" size={11} /> Tune
                </button>
              </div>
              <div className="fl-voice">{agent.tone}</div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- Page ----------
const AgentFleetPage = ({ id, onSelect = () => {} }) => {
  const { FLEET_ROSTER } = window.FLEET_DATA;
  const [, setTick] = useFleetState(0);
  const [toastNode, flash] = window.usePPToast();

  // Statuses come from the session store so pauses survive navigation
  const statusesOf = () => Object.fromEntries(FLEET_ROSTER.map(a => [a.id, window.FL_STORE ? window.FL_STORE.statusOf(a) : a.status]));
  const [statuses, setStatuses] = useFleetState(statusesOf);

  // Live re-render when decisions land or fleet stores change elsewhere
  useFleetEffect(() => {
    const bump = () => { setStatuses(statusesOf()); setTick(n => n + 1); };
    window.addEventListener("inbox:decisions", bump);
    window.addEventListener("fleet:perms", bump);
    window.addEventListener("fleet:status", bump);
    window.addEventListener("guardrails:changed", bump);
    window.addEventListener("fleet:playbooks", bump);
    window.addEventListener("store:installed", bump);
    window.addEventListener("presence:changed", bump);
    window.addEventListener("inbox:decisions", bump);
    return () => {
      window.removeEventListener("inbox:decisions", bump);
      window.removeEventListener("fleet:perms", bump);
      window.removeEventListener("fleet:status", bump);
      window.removeEventListener("guardrails:changed", bump);
      window.removeEventListener("fleet:playbooks", bump);
      window.removeEventListener("store:installed", bump);
      window.removeEventListener("presence:changed", bump);
      window.removeEventListener("inbox:decisions", bump);
    };
  }, []);


  const agent = FLEET_ROSTER.find(a => a.id === id) || FLEET_ROSTER[0];
  const status = statuses[agent.id];

  const toggleStatus = () => {
    if (!window.canDo("autonomy")) return;
    const wasPaused = status === "paused";
    if (window.FL_STORE) window.FL_STORE.setStatus(agent.id, wasPaused ? null : "paused");
    setStatuses(statusesOf());
    flash({
      msg: wasPaused
        ? <><b>{agent.name}</b> resumed — picking work back up</>
        : <><b>{agent.name}</b> paused — in-flight items move to your Inbox</>,
      undo: () => {
        if (window.FL_STORE) window.FL_STORE.setStatus(agent.id, wasPaused ? "paused" : null);
        setStatuses(statusesOf());
      },
    });
  };

  return (
    <div className="fleet-page">
      <FleetRoster
        roster={FLEET_ROSTER}
        statuses={statuses}
        activeId={agent.id}
        onSelect={onSelect}
      />
      <FleetDetail key={agent.id} agent={agent} status={status} onToggleStatus={toggleStatus} onFlash={flash} />

      {toastNode}
    </div>
  );
};

window.AgentFleetPage = AgentFleetPage;
