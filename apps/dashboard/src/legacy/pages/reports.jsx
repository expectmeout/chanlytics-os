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

const ReportsSeed = () => {
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

// ====== Real branch — Reports on the receptionist's own numbers ======
// The seeded page led with revenue, bookings and eight agents; none exist.
// This renders window.__REPORTS (the reports override → toReportVM): six
// measured tiles with sparklines and prior-period deltas, one stacked column
// chart of who answered each day, why the receptionist stopped, how fast it
// answers, calls, and new people — every chart with a table twin. The colors
// are tokens in reports.css, validated for both themes.

const useReports = () => {
  const [, tick] = useRpState(0);
  React.useEffect(() => {
    const bump = () => tick((n) => n + 1);
    window.addEventListener("surface:reports", bump);
    return () => window.removeEventListener("surface:reports", bump);
  }, []);
  return window.__REPORTS;
};

// A clean axis maximum whose half is still a whole number.
const rpNice = (max) => {
  const m = Math.max(4, Math.ceil(max || 0));
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  for (const k of [2, 4, 6, 8, 10]) if (k * p >= m) return k * p;
  return 10 * p;
};

// 4px rounded data-end, square at the baseline.
const rpTopRound = (x, y, w, h, r) => {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
};

const RpSpark = ({ points }) => {
  if (!points || points.length < 2) return null;
  const w = 120, h = 32, pad = 3;
  const max = Math.max(1, ...points);
  const step = (w - pad * 2) / (points.length - 1);
  const xy = points.map((v, i) => [pad + i * step, pad + (h - pad * 2) * (1 - v / max)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = xy[xy.length - 1];
  return (
    <svg className="rp2-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <path d={`${d} L${last[0].toFixed(1)},${h - pad} L${pad},${h - pad} Z`} className="rp2-spark-area" />
      <path d={d} className="rp2-spark-line" />
      <circle cx={last[0]} cy={last[1]} r="3" className="rp2-spark-end" />
    </svg>
  );
};

const RpTile = ({ t }) => (
  <div className="rp2-tile" data-tile={t.id}>
    <div className="rp2-tile-label">{t.label}</div>
    <div className="rp2-tile-value">{t.value}</div>
    <div className="rp2-tile-meta">{t.meta}</div>
    <div className="rp2-tile-foot">
      <span className={`rp2-delta ${t.delta ? t.delta.tone : ""}`}>{t.delta ? t.delta.text : ""}</span>
      <RpSpark points={t.spark} />
    </div>
  </div>
);

const RpTable = ({ columns, rows }) => (
  <div className="rp2-tablewrap">
    <table className="rp2-table">
      <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={j ? "num" : ""}>{v}</td>)}</tr>)}
        {rows.length === 0 && <tr><td colSpan={columns.length} className="rp2-empty">Nothing in this period.</td></tr>}
      </tbody>
    </table>
  </div>
);

const RpCard = ({ title, sub, testid, table, children, className = "" }) => {
  const [showTable, setShowTable] = useRpState(false);
  return (
    <section className={`fl-card rp2-card ${className}`} data-testid={testid}>
      <div className="fl-card-head">
        <span className="fl-card-title">{title}</span>
        {sub ? <span className="fl-card-sub">{sub}</span> : null}
        {table && (
          <button className={`btn btn-ghost btn-sm rp2-toggle ${showTable ? "active" : ""}`} aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
            {showTable ? "Chart" : "Table"}
          </button>
        )}
      </div>
      {showTable && table ? <RpTable columns={table.columns} rows={table.rows} /> : children}
    </section>
  );
};

const RpStacked = ({ points, max, days }) => {
  const [tip, setTip] = useRpState(null);
  const W = 720, H = 220, L = 34, R = 8, T = 10, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const nice = rpNice(max);
  const n = Math.max(1, points.length);
  const slot = pw / n;
  const bw = Math.min(24, Math.max(3, slot * 0.68));
  const y = (v) => T + ph * (1 - v / nice);
  const every = days <= 7 ? 1 : days <= 30 ? 5 : 15;
  return (
    <div className="rp2-plot">
      <svg viewBox={`0 0 ${W} ${H}`} className="rp2-svg" role="img" aria-label="Customer messages per day, split by who answered">
        {[0, nice / 2, nice].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="rp2-grid" />
            <text x={L - 6} y={y(t) + 3.5} className="rp2-tick" textAnchor="end">{t}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = L + i * slot + (slot - bw) / 2;
          const rects = [];
          let base = y(0);
          [["ai", p.ai], ["you", p.you], ["none", p.none]].forEach(([k, v]) => {
            if (!v) return;
            const h = ph * (v / nice);
            rects.push({ k, top: base - h, h });
            base = base - h - 2; // a 2px surface gap between segments
          });
          const last = rects[rects.length - 1];
          return (
            <g key={p.day} className={tip && tip.i === i ? "rp2-col hot" : "rp2-col"}>
              {rects.map((r) => (r === last
                ? <path key={r.k} d={rpTopRound(x, r.top, bw, r.h, 4)} className={`rp2-seg ${r.k}`} />
                : <rect key={r.k} x={x} y={r.top} width={bw} height={r.h} className={`rp2-seg ${r.k}`} />))}
              {i % every === 0 && <text x={L + i * slot + slot / 2} y={H - 8} className="rp2-tick" textAnchor="middle">{days <= 7 ? p.label : p.short}</text>}
              <rect x={L + i * slot} y={T} width={slot} height={ph} className="rp2-hit" tabIndex={0}
                onMouseEnter={() => setTip({ i, p })} onFocus={() => setTip({ i, p })}
                onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)} />
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="rp2-tip" style={{ left: `${((L + tip.i * slot + slot / 2) / W) * 100}%` }}>
          <div className="rp2-tip-day">{tip.p.label}</div>
          <div className="rp2-tip-row"><b>{tip.p.in}</b> customer message{tip.p.in === 1 ? "" : "s"}</div>
          <div className="rp2-tip-row"><i className="rp2-key-line ai" /><b>{tip.p.ai}</b> answered by the receptionist</div>
          <div className="rp2-tip-row"><i className="rp2-key-line you" /><b>{tip.p.you}</b> answered by you</div>
          <div className="rp2-tip-row"><i className="rp2-key-line none" /><b>{tip.p.none}</b> unanswered</div>
        </div>
      )}
    </div>
  );
};

const RpColumns = ({ points, field, max, days, label }) => {
  const [tip, setTip] = useRpState(null);
  const W = 360, H = 140, L = 26, R = 6, T = 8, B = 22;
  const pw = W - L - R, ph = H - T - B;
  const nice = rpNice(max);
  const n = Math.max(1, points.length);
  const slot = pw / n;
  const bw = Math.min(24, Math.max(3, slot * 0.68));
  const y = (v) => T + ph * (1 - v / nice);
  const every = days <= 7 ? 1 : days <= 30 ? 5 : 15;
  return (
    <div className="rp2-plot small">
      <svg viewBox={`0 0 ${W} ${H}`} className="rp2-svg" role="img" aria-label={`${label} per day`}>
        {[0, nice / 2, nice].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="rp2-grid" />
            <text x={L - 5} y={y(t) + 3.5} className="rp2-tick" textAnchor="end">{t}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const v = p[field];
          const x = L + i * slot + (slot - bw) / 2;
          const h = ph * (v / nice);
          return (
            <g key={p.day} className={tip && tip.i === i ? "rp2-col hot" : "rp2-col"}>
              {v > 0 && <path d={rpTopRound(x, y(0) - h, bw, h, 4)} className="rp2-seg ai" />}
              {i % every === 0 && <text x={L + i * slot + slot / 2} y={H - 6} className="rp2-tick" textAnchor="middle">{p.short}</text>}
              <rect x={L + i * slot} y={T} width={slot} height={ph} className="rp2-hit" tabIndex={0}
                onMouseEnter={() => setTip({ i, p, v })} onFocus={() => setTip({ i, p, v })}
                onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)} />
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="rp2-tip" style={{ left: `${((L + tip.i * slot + slot / 2) / W) * 100}%` }}>
          <div className="rp2-tip-day">{tip.p.label}</div>
          <div className="rp2-tip-row"><b>{tip.v}</b> {label}</div>
        </div>
      )}
    </div>
  );
};

const RpBars = ({ rows, empty }) => {
  if (!rows.length) return <div className="rp2-empty">{empty}</div>;
  return (
    <div className="rp2-bars">
      {rows.map((r) => (
        <div className="rp2-bar-row" key={r.id}>
          <span className="rp2-bar-label">{r.label}</span>
          <span className="rp2-bar-track"><span className="rp2-bar-fill" style={{ width: `${Math.max(2, r.share * 100)}%` }} /></span>
          <span className="rp2-bar-value">{r.value}</span>
        </div>
      ))}
    </div>
  );
};

const RpBuckets = ({ rt }) => {
  if (!rt.count) return <div className="rp2-empty">No receptionist replies in this period to time.</div>;
  return (
    <div className="rp2-buckets">
      <div className="rp2-bucket-stats">
        <span><b>{rt.medianLabel}</b> median</span>
        <span><b>{rt.p90Label}</b> slowest tenth</span>
        <span><b>{rt.count}</b> replies</span>
      </div>
      <div className="rp2-bucket-cols">
        {rt.buckets.map((b, i) => (
          <div className="rp2-bucket" key={b.id} title={`${b.value} repl${b.value === 1 ? "y" : "ies"} ${b.label}`}>
            <div className="rp2-bucket-col"><div className={`rp2-bucket-fill r${i + 1}`} style={{ height: `${b.value ? Math.max(4, b.share * 100) : 0}%` }} /></div>
            <div className="rp2-bucket-value">{b.value}</div>
            <div className="rp2-bucket-label">{b.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const RP2_RANGES = [[7, "7 days"], [30, "30 days"], [90, "90 days"]];

const ReportsReal = () => {
  const R = useReports();
  const [busy, setBusy] = useRpState(false);
  const fetchedAt = R ? R.fetchedAt : 0;
  React.useEffect(() => { setBusy(false); }, [fetchedAt]);
  if (!R) return null;
  const vm = R.vm;
  const pick = (days) => {
    if (days === R.days || !window.__setReportDays) return;
    setBusy(true);
    window.__setReportDays(days);
  };
  return (
    <div className="reports" data-testid="reports-real">
      <div className="cl-head">
        <div className="cl-head-titles">
          <div className="cl-page-title">Reports</div>
          <div className="cl-page-sub">What the receptionist handled, day by day · {vm.since} – {vm.until} · {vm.timezone}</div>
        </div>
        <div className="rp2-range cl-tabs" role="group" aria-label="Period">
          {RP2_RANGES.map(([d, l]) => (
            <button key={d} className={`cl-tab ${R.days === d ? "active" : ""}`} aria-pressed={R.days === d} onClick={() => pick(d)}>{l}</button>
          ))}
        </div>
      </div>

      <div className={`rp-body rp2-body ${busy ? "rp2-loading" : ""}`} aria-busy={busy ? "true" : "false"}>
        <div className="rp2-tiles">{vm.tiles.map((t) => <RpTile key={t.id} t={t} />)}</div>

        {vm.empty ? (
          <section className="fl-card rp2-card">
            <div className="fl-card-head"><span className="fl-card-title">Nothing came in</span></div>
            <div className="rp2-empty">Nobody wrote or called between {vm.since} and {vm.until}, so there is nothing to chart. The tiles above are real zeros.</div>
          </section>
        ) : (
          <>
            <RpCard title="Who answered, day by day" sub={`${vm.answered.totals.in} customer messages · last ${vm.rangeLabel}`} testid="chart-answered" table={vm.table} className="rp2-main">
              <div className="rp2-legend">
                <span className="rp2-key"><i className="rp2-swatch ai" />Receptionist <b>{vm.answered.totals.ai}</b></span>
                <span className="rp2-key"><i className="rp2-swatch you" />You <b>{vm.answered.totals.you}</b></span>
                <span className="rp2-key"><i className="rp2-swatch none" />Unanswered <b>{vm.answered.totals.none}</b></span>
              </div>
              <RpStacked points={vm.answered.points} max={vm.answered.max} days={vm.days} />
            </RpCard>

            <div className="rp2-row">
              <RpCard title="Why the receptionist stopped" sub={vm.reasons.length ? `${vm.tiles[3].value} times` : ""} testid="chart-reasons"
                table={{ columns: ["Reason", "Times"], rows: vm.reasons.map((r) => [r.label, r.value]) }}>
                <RpBars rows={vm.reasons} empty="It never stopped in this period — every message was answered without you." />
              </RpCard>
              <RpCard title="How fast it answers" sub="from a customer's message to the receptionist's reply" testid="chart-reply"
                table={{ columns: ["Reply time", "Replies"], rows: vm.replyTime.buckets.map((b) => [b.label, b.value]) }}>
                <RpBuckets rt={vm.replyTime} />
              </RpCard>
            </div>

            <div className="rp2-row">
              <RpCard title="Calls" sub={vm.calls.total ? `${vm.calls.total} calls · ${vm.calls.minutes} min · ${vm.calls.voicemail} to voicemail` : "no calls in this period"} testid="chart-calls"
                table={{ columns: ["Day", "Calls", "Seconds"], rows: vm.calls.points.map((p) => [p.label, p.calls, p.callSeconds]) }}>
                {vm.calls.total ? (
                  <>
                    <RpColumns points={vm.calls.points} field="calls" max={vm.calls.max} days={vm.days} label="calls" />
                    {vm.calls.sentiments.length > 0 && (
                      <div className="rp2-foot">Caller mood, the voice provider's own read: {vm.calls.sentiments.map((s) => `${s.label} ${s.value}`).join(" · ")}</div>
                    )}
                  </>
                ) : <div className="rp2-empty">Nobody phoned in this period.</div>}
              </RpCard>
              <RpCard title="New people" sub={vm.people.total ? `${vm.people.total} first contacts, by evidence` : "nobody new"} testid="chart-people"
                table={{ columns: ["Day", "New people"], rows: vm.people.points.map((p) => [p.label, p.newPeople]) }}>
                {vm.people.total
                  ? <RpColumns points={vm.people.points} field="newPeople" max={vm.people.max} days={vm.days} label="new people" />
                  : <div className="rp2-empty">Nobody new wrote or called in this period.</div>}
              </RpCard>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// A real workspace renders its own numbers; the seeded page keeps the demo.
const ReportsPage = () => (window.__REPORTS === undefined ? <ReportsSeed /> : <ReportsReal />);

window.ReportsPage = ReportsPage;
