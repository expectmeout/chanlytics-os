/* global React, Icon, StatStrip, StatCell, REPORTS_DATA, Sparkline */
// Chanlytics — Reports
// Owner-first: what came in, which agents earned it, and how your judgment
// layer performed. Range tabs rescale everything.

const { useState: useRpState, useMemo: useRpMemo } = React;

const rpMoney = (n) => window.CHANLY.fmtMoney(n);

// Quiet area chart (system grammar: ink line, faint fill)
const RpAreaChart = ({ data, height = 160 }) => {
  const w = 720, h = height;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const coords = data.map((v, i) => [i * step, h - 14 - ((v - min) / range) * (h - 28)]);
  const pts = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  const [lx, ly] = coords[coords.length - 1];
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="rp-chart">
      <defs>
        <linearGradient id="rpFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ink-faint)" stopOpacity="0.26" />
          <stop offset="100%" stopColor="var(--ink-faint)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#rpFade)" />
      <polyline points={pts} fill="none" stroke="var(--ink-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="rp-chart-dot" cx={lx} cy={ly} r="3" fill="var(--accent)" />
    </svg>
  );
};

// Share dialog — read-only public link (scoped, expiring, PII-safe)
const RpShareDialog = ({ rangeLabel, onClose }) => {
  const [copied, setCopied] = useRpState(false);
  const [hideNames, setHideNames] = useRpState(true);
  const [expires, setExpires] = useRpState(true);
  const [allowExport, setAllowExport] = useRpState(false);
  const link = "chanlytics.app/s/rpt-8f3k2";
  const copy = () => {
    try { navigator.clipboard?.writeText("https://" + link)?.catch(() => {}); } catch (e) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="ask-overlay" onClick={onClose}>
      <div className="ask-modal cal-ev" onClick={(e) => e.stopPropagation()}>
        <header className="st-modal-head">
          <span className="st-tile lg installed"><Icon name="external" size={15} /></span>
          <div className="st-card-titles">
            <span className="st-modal-name">Share this view</span>
            <span className="st-card-role">Reports · last {rangeLabel} · read-only</span>
          </div>
        </header>
        <section className="st-modal-section">
          <div className="rp-share-link">
            <Icon name="external" size={12} />
            <span className="rp-share-url mono">{link}</span>
            <button className={"btn btn-sm " + (copied ? "" : "btn-primary")} onClick={copy} disabled={copied}>
              {copied ? <><Icon name="check" size={12} /> Copied</> : "Copy link"}
            </button>
          </div>
        </section>
        <section className="st-modal-section">
          <div className="set-row"><div className="set-row-info"><span className="set-row-label">Hide client names</span><span className="set-row-hint">Viewers see aggregates, never PII</span></div><SetToggle on={hideNames} onChange={setHideNames} /></div>
          <div className="set-row"><div className="set-row-info"><span className="set-row-label">Expires in 7 days</span><span className="set-row-hint">Link dies quietly after Aug 2</span></div><SetToggle on={expires} onChange={setExpires} /></div>
          <div className="set-row"><div className="set-row-info"><span className="set-row-label">Allow CSV export</span><span className="set-row-hint">Off — view only</span></div><SetToggle on={allowExport} onChange={setAllowExport} /></div>
        </section>
        <footer className="st-modal-foot">
          <span className="cal-av-foot-note"><Icon name="shield" size={11} /> No login, no Inbox, no client access — just this page</span>
          <div className="st-modal-foot-actions">
            <button className="btn btn-sm" onClick={onClose}>Done</button>
            <button className="btn btn-primary btn-sm" onClick={() => { onClose(); window.CHANLY.nav("reports"); }} title="Viewers get this same page, read-only">
              Done — viewers see this page <Icon name="check" size={11} />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

const ReportsPage = () => {
  const { RP_RANGES, RP_SERIES, RP_STATS, RP_AGENTS, RP_CHANNELS, RP_DECISIONS } = window.REPORTS_DATA;
  const [range, setRange] = useRpState("30d");
  const [shareOpen, setShareOpen] = useRpState(false);
  const [, setTick] = useRpState(0);

  // Session decisions bump the judgment layer live
  React.useEffect(() => {
    const bump = () => setTick(n => n + 1);
    window.addEventListener("inbox:decisions", bump);
    return () => window.removeEventListener("inbox:decisions", bump);
  }, []);
  const sessionDecisions = Object.values((window.IX_STORE || {}).decisions || {}).filter(r => r && r.kind === "decided");
  const sessionApproved = sessionDecisions.filter(r => !r.declined).length;

  const stats = RP_STATS[range];
  const series = RP_SERIES[range];
  const factor = range === "7d" ? 7 / 30 : range === "90d" ? 3 : 1;
  // Lead sources seed is a WEEKLY base; scale to the selected window
  const srcFactor = range === "7d" ? 1 : range === "90d" ? 13 : 4.3;

  const asksShown = stats.asks + sessionDecisions.length;
  const approvedShown = stats.approved + sessionApproved;

  const agents = useRpMemo(() =>
    RP_AGENTS.map(a => ({
      ...a,
      convosR: Math.round(a.convos * factor),
      bookingsR: Math.round(a.bookings * factor),
      revenueR: Math.round(a.revenue * factor),
      // Same factor for revenue AND credits — return-per-credit must not drift with the tab
      roi: a.revenue > 0 ? (a.revenue * factor) / (a.credits * factor) : 0,
    })).sort((a, b) => b.revenueR - a.revenueR),
  [range, factor]);

  const maxAgentRevenue = Math.max(...agents.map(a => a.revenueR));
  const rangeLabel = RP_RANGES.find(r => r.id === range).label;

  return (
    <div className="reports">
      <div className="cl-head">
        <div className="cl-head-titles">
          <div className="cl-page-title">Reports</div>
          <div className="cl-page-sub">
            What came in, which agents earned it, and how your judgment layer performed.
          </div>
        </div>
        <StatStrip className="cl-head-stats">
          <StatCell label="Revenue" value={rpMoney(stats.revenue)} meta={`last ${rangeLabel}`} />
          <StatCell label="Bookings" tip="Agent-handled = the agent ran the whole conversation · this range" value={stats.bookings} meta={`${stats.agentShare} agent-handled`} />
          <StatCell label="Your decisions" tip="Agent asks you approved ÷ asks raised · this range" value={`${approvedShown}/${asksShown}`} meta={sessionDecisions.length > 0 ? `asks approved · ${sessionDecisions.length} today` : "asks approved"} />
          <StatCell label="Auto-sent" value={stats.auto.sent} meta={`${Math.round(stats.auto.edited / stats.auto.sent * 100)}% edited · ${stats.auto.caught} held in veto`} metaTone="pos" tip="Edited = you changed a draft before it sent · Held in veto = you stopped a draft during its countdown · 30d window" />
        </StatStrip>
      </div>

      <div className="cl-controls">
        <div className="cal-weeklabel">
          <span className="cal-week-range">Revenue over time</span>
        </div>
        <div className="cl-controls-right">
          <div className="cl-tabs">
            {RP_RANGES.map(r => (
              <button key={r.id} className={`cl-tab ${range === r.id ? "active" : ""}`} onClick={() => setRange(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          <button className="btn btn-sm" onClick={() => setShareOpen(true)}>
            <Icon name="external" size={12} /> Share
          </button>
        </div>
      </div>

      <div className="rp-body">
        {/* Revenue chart + decisions */}
        <div className="rp-row">
          <section className="fl-card rp-chart-card">
            <div className="rp-chart-meta">
              <span className="rp-chart-big tabular">{rpMoney(stats.revenue)}</span>
              <span className="rp-chart-sub">daily totals · last {rangeLabel}</span>
              <span className="rp-chart-hint"><Icon name="trending-up" size={11} /> strongest day {rpMoney(Math.max(...series))}</span>
            </div>
            <RpAreaChart key={range} data={series} />
          </section>

          <section className="fl-card rp-decisions">
            <div className="fl-card-head">
              <span className="fl-card-title">Your judgment layer</span>
              <span className="fl-card-sub">last {rangeLabel}</span>
            </div>
            <div className="rp-dec-stats">
              <div className="rp-dec-cell">
                <span className="rp-dec-num tabular">{asksShown}</span>
                <span className="rp-dec-lbl">agent asks</span>
              </div>
              <div className="rp-dec-cell">
                <span className="rp-dec-num tabular ok">{approvedShown}</span>
                <span className="rp-dec-lbl">approved</span>
              </div>
              <div className="rp-dec-cell">
                <span className="rp-dec-num tabular">{RP_DECISIONS.medianResponse}</span>
                <span className="rp-dec-lbl">median response</span>
              </div>
            </div>
            <ul className="rp-dec-notes">
              {RP_DECISIONS.notes.map((n, i) => (
                <li key={i}><span className="cv-bullet-dot" /><span>{n}</span></li>
              ))}
            </ul>
          </section>
        </div>

        {/* Agent attribution table */}
        <section className="fl-card rp-agents">
          <div className="fl-card-head">
            <span className="fl-card-title">Agent performance</span>
            <span className="fl-card-sub">revenue attributed · return per credit spent</span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Agent</th><th className="num">Convos</th><th className="num">Bookings</th>
                <th className="num" data-tip="Bookings ÷ conversations">Conv.</th><th className="num" data-tip="Auto-sends you edited ÷ auto-sent · 30d">Edit rate</th><th>Revenue</th><th className="num">Return / credit</th>
              </tr>
            </thead>
            <tbody key={range}>
              {agents.map(a => (
                <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => window.CHANLY.nav(window.CHANLY.R.agent(a.id))}>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span className="agent-avatar" style={{ width: 20, height: 20, fontSize: 10 }}>{a.glyph}</span>
                      <span style={{ fontWeight: 500 }}>{a.name}</span>
                      {a.note && <span className="ix-tag">{a.note}</span>}
                    </span>
                  </td>
                  <td className="num">{a.convosR.toLocaleString()}</td>
                  <td className="num">{a.bookingsR > 0 ? a.bookingsR : "—"}</td>
                  <td className="num muted">{a.conv}</td>
                  <td className="num muted">{(() => { const t = window.TRUST && window.TRUST.agent(a.id); return t ? window.TRUST.rate(t) + "%" : "—"; })()}</td>
                  <td>
                    <span className="rp-revbar-wrap">
                      {a.revenueR > 0 && <span className="rp-revbar" style={{ width: `${(a.revenueR / maxAgentRevenue) * 100}%` }} />}
                      <span className="rp-revbar-num tabular">{a.revenueR > 0 ? rpMoney(a.revenueR) : "—"}</span>
                    </span>
                  </td>
                  <td className="num">{a.roi > 0 ? `${a.roi.toFixed(1)}×` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Segment health */}
        <section className="fl-card rp-agents">
          <div className="fl-card-head">
            <span className="fl-card-title">Segment health</span>
            <span className="fl-card-sub">list size, movement, and attributed return · trailing 30d</span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Segment</th><th className="num">Size</th><th>8-wk trend</th><th>Attributed</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {(window.SEGMENT_HEALTH || []).map(h => {
                const s = (window.CLIENT_SEGMENTS || []).find(x => x.id === h.segId);
                const m = (window.SEGMENT_META || {})[h.segId];
                if (!s) return null;
                const maxRev = Math.max(...(window.SEGMENT_HEALTH || []).map(x => x.revenue), 1);
                return (
                  <tr key={h.segId} style={{ cursor: "pointer" }} onClick={() => window.CHANLY.nav(window.CHANLY.R.segment(h.segId))}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 500 }}>
                        <Icon name={s.kind === "agent" ? "sparkle" : "filter"} size={11} style={{ color: "var(--ink-faint)" }} />
                        {s.label}
                      </span>
                    </td>
                    <td className="num">
                      <span className="tabular">{s.count}</span>
                      {m && <span className={`sg-stat-meta ${m.deltaTone}`} style={{ marginLeft: 7 }}>{m.delta}</span>}
                    </td>
                    <td>{m && <Sparkline data={m.trend} width={70} height={16} stroke="var(--ink-dim)" />}</td>
                    <td>
                      <span className="rp-revbar-wrap">
                        {h.revenue > 0 && <span className="rp-revbar" style={{ width: `${(h.revenue / maxRev) * 100}%` }} />}
                        <span className="rp-revbar-num tabular">{h.revenue > 0 ? rpMoney(h.revenue) : "—"}</span>
                      </span>
                    </td>
                    <td className="muted">{h.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Lead sources */}
        <section className="fl-card rp-agents">
          <div className="fl-card-head">
            <span className="fl-card-title">Lead sources</span>
            <span className="fl-card-sub">captured → ready → converted · last {rangeLabel} · click a source to open Leads filtered</span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Source</th><th>Funnel</th><th>Est. value</th><th>First touch</th>
              </tr>
            </thead>
            <tbody key={range}>
              {(window.LEAD_SOURCES || []).map(s => {
                const cap = Math.round(s.captured * srcFactor);
                const rdy = Math.round(s.ready * srcFactor);
                const won = Math.round(s.converted * srcFactor);
                const est = Math.round(s.est * srcFactor);
                const maxEst = Math.max(...(window.LEAD_SOURCES || []).map(x => x.est * srcFactor), 1);
                return (
                  <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => window.CHANLY.nav(`leads/src:${s.id}`)}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 500 }}>
                        <Icon name={s.icon} size={11} style={{ color: "var(--ink-faint)" }} />
                        {s.label}
                      </span>
                    </td>
                    <td><span className="tabular" style={{ fontSize: 12, color: "var(--ink-muted)" }}>{cap} → {rdy} → <b style={{ color: "var(--ink)" }}>{won}</b></span></td>
                    <td>
                      <span className="rp-revbar-wrap">
                        {est > 0 && <span className="rp-revbar" style={{ width: `${(est / maxEst) * 100}%` }} />}
                        <span className="rp-revbar-num tabular">{est > 0 ? rpMoney(est) : "—"}</span>
                      </span>
                    </td>
                    <td className="muted tabular">{s.touch}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Channel mix */}
        <section className="fl-card rp-channels">
          <div className="fl-card-head">
            <span className="fl-card-title">Where bookings come from</span>
            <span className="fl-card-sub">share of booked revenue · last {rangeLabel}</span>
          </div>
          <div className="rp-mix" key={range}>
            {RP_CHANNELS.map(ch => (
              <div key={ch.id} className="rp-mix-row">
                <span className="rp-mix-label"><Icon name={ch.icon} size={12} /> {ch.label}</span>
                <span className="rp-mix-track"><span className="rp-mix-fill" style={{ width: `${ch.pct}%` }} /></span>
                <span className="rp-mix-pct tabular">{ch.pct}%</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      {shareOpen && <RpShareDialog rangeLabel={rangeLabel} onClose={() => setShareOpen(false)} />}
    </div>
  );
};

window.ReportsPage = ReportsPage;
