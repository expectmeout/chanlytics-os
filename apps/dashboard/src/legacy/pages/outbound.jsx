/* global React, Icon, StatStrip, StatCell */
// Chanlytics — Campaigns › Outbound
// The offers your agents run: audience (smart segments), schedule, live results.
// Segment-backed audiences link to People › Segments and pull live counts.
// Every campaign is agent-executed; approvals route through the Inbox.

const { useState: useObState, useMemo: useObMemo } = React;

const obSegment = (id) => window.CHANLY.seg(id);

const OB_CAMPAIGNS = [
  { id: "ob-birthday", name: "Birthday offer — April", status: "approval",
    agent: { glyph: "S", name: "SMS Agent" }, channels: ["chat"],
    audience: { label: "Birthday this week", count: 8, held: 1, to: "clients" },
    schedule: "Today 5:00 PM · one send",
    note: "20% off · queued — you review offer batches over 5 people",
    results: null },
  { id: "ob-winback", name: "Win-back · 30% return offer", status: "running",
    agent: { glyph: "X", name: "Recovery Agent" }, channels: ["chat", "mail"],
    audience: { label: "Lapsed 60+ days", count: 23, to: "clients", segId: "lapsed-60" },
    schedule: "Drip · max 3 touches · quiet hours respected",
    progress: 68,
    results: { sent: 41, replies: 12, booked: 9, revenue: 2740 } },
  { id: "ob-pkg", name: "Package-expiry nudges", status: "running",
    agent: { glyph: "S", name: "SMS Agent" }, channels: ["chat"],
    audience: { label: "Package ending soon", count: 18, to: "clients", segId: "pkg-ending" },
    schedule: "Evergreen · 14 days before expiry",
    progress: 100,
    results: { sent: 26, replies: 14, booked: 11, revenue: 3150 } },
  { id: "ob-review", name: "Review capture", status: "running",
    agent: { glyph: "R", name: "Review Bot" }, channels: ["chat", "mail"],
    audience: { label: "After a 5★ visit", count: null, to: "clients" },
    schedule: "Evergreen · next morning, 10:00 AM",
    progress: 100,
    results: { sent: 34, replies: 19, booked: null, revenue: null, extra: "19 reviews · 4.9 avg" } },
  { id: "ob-referral", name: "Referral thank-you flow", status: "draft",
    agent: { glyph: "E", name: "Email Agent" }, channels: ["mail"],
    audience: { label: "Advocates", count: 14, to: "clients", segId: "advocates" },
    schedule: "Draft — triggers when a referral books",
    note: "Drafted after Maya → Jordan · reward both sides",
    results: null },
  { id: "ob-spring", name: "Spring couples promo", status: "ended",
    agent: { glyph: "S", name: "SMS Agent" }, channels: ["chat", "instagram"],
    audience: { label: "All active clients", count: 120, to: "clients" },
    schedule: "Ended Apr 14",
    results: { sent: 120, replies: 22, booked: 9, revenue: 3060 } },
];

const OB_FILTERS = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "approval", label: "Needs you" },
  { id: "scheduled", label: "Scheduled" },
  { id: "draft", label: "Drafts" },
  { id: "ended", label: "Ended" },
];

const ObPill = ({ s }) =>
  s === "running" ? <span className="pill pill-accent"><span className="live-dot" style={{ width: 5, height: 5 }} />Running</span>
  : s === "approval" ? <span className="pill pill-accent">Needs you</span>
  : s === "scheduled" ? <span className="pill">Scheduled</span>
  : s === "draft" ? <span className="pill">Draft</span>
  : <span className="pill">Ended</span>;

const OB_CH_ICON = { chat: "chat", mail: "mail", instagram: "instagram", phone: "phone" };

const OutboundPage = () => {
  const [filter, setFilter] = useObState("all");
  const [paused, setPaused] = useObState({});
  const [approved, setApproved] = useObState({});   // campaignId -> true (session)
  const [toastNode, ppFlash] = window.usePPToast();
  const [, setObTick] = useObState(0);
  React.useEffect(() => {
    const bump = () => setObTick(n => n + 1);
    window.addEventListener("guardrails:changed", bump);
    return () => window.removeEventListener("guardrails:changed", bump);
  }, []);

  const flash = (msg, undo = null) => ppFlash({ msg, undo });

  // Session overlay: approved batches become scheduled
  const campaigns = OB_CAMPAIGNS.map(c => approved[c.id]
    ? { ...c, status: "scheduled", note: "Approved — sends today 5:00 PM · SMS Agent handles replies" }
    : c);

  const statusOf = (c) => paused[c.id] ? "paused" : c.status;
  const visible = filter === "all" ? campaigns : campaigns.filter(c =>
    filter === "scheduled" ? (c.status === "approval" || c.status === "scheduled") : c.status === filter);

  const running = campaigns.filter(c => statusOf(c) === "running").length;
  const revenue = campaigns.reduce((a, c) => a + (c.results?.revenue || 0), 0);
  const sent = campaigns.reduce((a, c) => a + (c.results?.sent || 0), 0);
  const channelCount = new Set(campaigns.flatMap(c => c.channels)).size;

  const approveBirthday = (c) => {
    if (!window.canDo("approve")) return;
    setApproved(a => ({ ...a, [c.id]: true }));
    window.dispatchEvent(new CustomEvent("outbound:approved", { detail: { id: c.id, name: c.name || "Birthday batch", count: c.audience.count } }));
    flash(
      <><b>{c.name}</b> approved — {c.audience.count} sends queued for 5:00 PM{c.audience.held ? ` · ${c.audience.held} held — DNC` : ""}</>,
      () => setApproved(a => { const n = { ...a }; delete n[c.id]; return n; })
    );
  };

  const togglePause = (c) => {
    const wasPaused = !!paused[c.id];
    setPaused(p => ({ ...p, [c.id]: !wasPaused }));
    flash(
      <><b>{c.name}</b> {wasPaused ? "resumed — drip continues" : "paused — in-flight touches hold"}</>,
      () => setPaused(p => ({ ...p, [c.id]: wasPaused }))
    );
  };

  return (
    <div className="reports">
      <div className="cl-head">
        <div className="cl-head-titles">
          <div className="cl-page-title">Outbound</div>
          <div className="cl-page-sub">
            The offers your agents run — audiences come from your smart segments, sends respect quiet hours, batches over 5 ask you first.
          </div>
        </div>
        <StatStrip className="cl-head-stats">
          <StatCell label="Running" value={running} meta="agent-executed" />
          <StatCell label="Sent this season" value={sent} meta={`across ${channelCount} channels`} />
          <StatCell label="Attributed" tip="Revenue from bookings that started from an outbound touch · this season" value={`$${revenue.toLocaleString()}`} meta="booked from outbound" metaTone="pos" />
        </StatStrip>
      </div>

      <div className="cl-controls">
        <div className="cl-controls-right" style={{ marginLeft: 0 }}>
          <div className="fleet-filter">
            {OB_FILTERS.map(f => (
              <button key={f.id} className={`fleet-filter-chip ${filter === f.id ? "active" : ""}`} onClick={() => setFilter(f.id)}>
                {f.label}
                <span className="fleet-filter-count tally">
                  {f.id === "all" ? campaigns.length
                    : f.id === "scheduled" ? campaigns.filter(c => c.status === "approval" || c.status === "scheduled").length
                    : campaigns.filter(c => c.status === f.id).length}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rp-body">
        {visible.map(c => {
          const isPaused = paused[c.id];
          return (
            <section key={c.id} className={`fl-card ob-card ${c.status === "approval" ? "is-approval" : ""}`}>
              <div className="ob-head">
                <div className="ob-titles">
                  <span className="ob-name">{c.name}</span>
                  <span className="ob-meta">
                    <span className="agent-avatar" style={{ width: 16, height: 16, fontSize: 8.5 }}>{c.agent.glyph}</span>
                    {c.agent.name}
                    <span className="fl-head-dot" />
                    {c.channels.map(ch => <Icon key={ch} name={OB_CH_ICON[ch]} size={11} />)}
                    <span className="fl-head-dot" />
                    <span>{c.schedule}</span>
                  </span>
                </div>
                {isPaused ? <span className="pill pill-warn">Paused</span> : <ObPill s={c.status} />}
              </div>

              <div className="ob-row">
                {(() => {
                  const seg = c.audience.segId && obSegment(c.audience.segId);
                  const obHeld = seg ? (window.CHANLY.membersOf(seg.id) || []).filter((m) => !window.CHANLY.canMessage(m.id)).length : (c.audience.held || 0);
                  const count = seg ? Math.max(0, seg.count - obHeld) : c.audience.count;
                  const label = seg ? seg.label : c.audience.label;
                  // Event-based audiences aren't lists — render as plain chips
                  if (!c.audience.segId) return (
                    <span className="ob-audience ob-audience-event" data-tip="Event-triggered — fires per person when the moment happens, not from a saved list">
                      <Icon name="bolt" size={12} />
                      {label}{count ? ` · ${count}` : ""}
                    </span>
                  );
                  const obGuard = (window.SEG_GUARDRAILS || []).find(g => g.segId === c.audience.segId);
                  return (
                    <>
                    <button
                      className="ob-audience"
                      data-tip="Smart segment — the agent keeps this list fresh · click to open"
                      onClick={() => window.CHANLY.nav(window.CHANLY.R.segment(c.audience.segId))}
                    >
                      <Icon name="sparkle" size={12} />
                      {label}{count ? ` · ${count}` : ""}
                      <Icon name="arrow-right" size={10} />
                    </button>
                    {obGuard && (
                      <button className="fl-guard-link" data-tip={`${obGuard.hint} — binds this campaign · set in Settings › Autonomy`} onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("autonomy"))}>
                        <Icon name="shield" size={9} /> {obGuard.label}: {obGuard.value}
                      </button>
                    )}
                    </>
                  );
                })()}
                {c.note && <span className="ob-note">{c.note}</span>}
              </div>

              {c.results && (
                <div className="ob-results">
                  <span className="ob-stat"><strong className="tabular">{c.results.sent}</strong> sent</span>
                  <span className="fl-head-dot" />
                  <span className="ob-stat" data-tip={`${Math.round((c.results.replies / Math.max(1, c.results.sent)) * 100)}% reply rate`}><strong className="tabular">{c.results.replies}</strong> replies</span>
                  {c.results.booked != null && <><span className="fl-head-dot" /><span className="ob-stat" data-tip={`${Math.round((c.results.booked / Math.max(1, c.results.replies)) * 100)}% of replies booked`}><strong className="tabular">{c.results.booked}</strong> booked</span></>}
                  {c.results.revenue != null && <><span className="fl-head-dot" /><span className="ob-stat ok"><strong className="tabular">+${c.results.revenue.toLocaleString()}</strong></span></>}
                  {c.results.extra && <><span className="fl-head-dot" /><span className="ob-stat">{c.results.extra}</span></>}
                  {c.progress != null && c.progress < 100 && (
                    <span className="ob-progress"><span className="ob-progress-fill" style={{ width: `${c.progress}%` }} /></span>
                  )}
                </div>
              )}

              <div className="ob-actions">
                {c.status === "approval" && (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => approveBirthday(c)} {...window.gate("approve")}>
                      <Icon name="check" size={12} /> Approve batch · {c.audience.count} sends
                    </button>
                    <PolicyChip cls="campaign" />
                    <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav("tasks")}>
                      In Tasks <Icon name="arrow-right" size={10} />
                    </button>
                  </>
                )}
                {c.status === "scheduled" && approved[c.id] && (
                  <span className="ct-done-note"><Icon name="check" size={11} /> Approved — SMS Agent sends at 5:00 PM and handles replies</span>
                )}
                {c.status === "running" && (
                  <button className="btn btn-sm" onClick={() => togglePause(c)}>
                    <Icon name={isPaused ? "play" : "pause"} size={12} /> {isPaused ? "Resume" : "Pause"}
                  </button>
                )}
                {c.status === "draft" && (
                  <button className="btn btn-sm" onClick={() => window.askAbout({
                    prompt: "Finish the “" + c.name + "” draft",
                    answer: "It targets " + c.audience.label + " (" + c.audience.count + " people). I'll tighten the copy in " + c.agent.name + "'s voice and queue it ask-first — you approve the final send.",
                    links: c.audience.segId ? [{ label: "Open the audience", to: "segments/" + c.audience.segId }] : [{ label: "Open Segments", to: "segments" }],
                  })}>
                    <Icon name="sparkle" size={12} /> Finish with Chanlytics
                  </button>
                )}
                {c.status === "ended" && (
                  <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav("reports")}>
                    Full results in Reports <Icon name="arrow-right" size={11} />
                  </button>
                )}
                {c.results && c.status !== "ended" && (
                  <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(CHANLY.R.conversation("chats"))}>Threads</button>
                )}
              </div>
            </section>
          );
        })}
        {visible.length === 0 && <div className="cv-empty">Nothing here — agents will list campaigns as they're created.</div>}
      </div>

      {toastNode}
    </div>
  );
};

// A real workspace renders its playbooks (outbound-real.jsx); the seeded page keeps the demo.
window.OutboundSeed = OutboundPage;
