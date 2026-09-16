/* global React, Icon, StatStrip, StatCell, REPORTS_DATA, Sparkline, EmptyState, FailedRead */
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

// A number, what it is, and one line of what it holds. It also drew a seven-point sparkline beside a number the chart
// below plots properly, and a delta that claimed percentages on counts of two -- "+100% vs prior 7 days" is 2 to 4,
// and "-100%" is a zero. The view model still carries both: Ask reads the change, and every chart draws the period
// before as its own faint line.
const RpTile = ({ t }) => (
  <div className="rp2-tile" data-tile={t.id}>
    <div className="rp2-tile-label" title={t.label}>{t.label}</div>
    <div className="rp2-tile-value">{t.value}</div>
    <div className="rp2-tile-meta" title={t.meta}>{t.meta}</div>
  </div>
);

const RpTable = ({ columns, rows }) => (
  <div className="rp2-tablewrap">
    <table className="rp2-table">
      <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={j ? "num" : ""}>{v}</td>)}</tr>)}
        {rows.length === 0 && <tr><td colSpan={columns.length}><EmptyState kind="line" title="Nothing in this period." /></td></tr>}
      </tbody>
    </table>
  </div>
);

// A card's table as a CSV file: the columns and rows its Table view shows, nothing else, with a byte-order mark so
// a spreadsheet reads it as UTF-8, as People's export does.
const RP_BOM = String.fromCharCode(0xfeff);
const rpCsv = (table) => {
  const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  return [table.columns, ...table.rows].map((r) => r.map(esc).join(",")).join("\r\n");
};
const rpSaveCsv = (title, table) => {
  const blob = new Blob([RP_BOM + rpCsv(table)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

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
        {table && (
          <button className="btn btn-ghost btn-sm rp2-toggle" onClick={() => rpSaveCsv(title, table)} aria-label={`Save “${title}” as a CSV file`} data-testid="card-csv">CSV</button>
        )}
      </div>
      {showTable && table ? <RpTable columns={table.columns} rows={table.rows} /> : children}
    </section>
  );
};

// One keyboard stop per chart. Focus lands on the latest day, the arrows move a day at a time, Home and End go to
// the ends, and the day is said in a polite live region. A stop per day was up to 270 stops at 90 days, none named.
const useRpTip = (n) => {
  const [tip, setTip] = useRpState(null);
  const keys = {
    tabIndex: 0,
    onFocus: () => setTip((t) => (t === null ? n - 1 : t)),
    onBlur: () => setTip(null),
    onKeyDown: (e) => {
      const at = tip === null ? n - 1 : tip;
      const to = e.key === "ArrowRight" ? at + 1 : e.key === "ArrowLeft" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
      if (to === null) return;
      e.preventDefault();
      setTip(Math.max(0, Math.min(n - 1, to)));
    },
  };
  return [tip, setTip, keys];
};
// The period before, as a faint line through the middle of each day's slot, over the days it has.
const rpPriorPoints = (prior, slot, L, y) => (prior || []).map((v, i) => (v === null || v === undefined ? null : `${(L + i * slot + slot / 2).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(" ");
const rpPriorMax = (prior) => Math.max(0, ...(prior || []).map((v) => v || 0));
const rpCap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const RpStacked = ({ points, max, days, prior = null, priorLabel = "" }) => {
  const [tip, setTip, keys] = useRpTip(points.length);
  const W = 1100, H = 200, L = 34, R = 8, T = 10, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const nice = rpNice(Math.max(max, rpPriorMax(prior)));
  const n = Math.max(1, points.length);
  const slot = pw / n;
  const bw = Math.min(24, Math.max(3, slot * 0.68));
  const y = (v) => T + ph * (1 - v / nice);
  const every = days <= 7 ? 1 : days <= 30 ? 5 : 15;
  const priorPoints = rpPriorPoints(prior, slot, L, y);
  const day = tip === null ? null : points[tip];
  const was = tip === null || !prior ? null : prior[tip] ?? null;
  const said = day ? `${day.label}: ${day.in} customer message${day.in === 1 ? "" : "s"}, ${day.ai} answered by the receptionist, ${day.you} by you, ${day.none} unanswered${was === null ? "" : `; ${was} on the matching day of ${priorLabel}`}` : "";
  return (
    <div className="rp2-plot" {...keys} aria-label="Customer messages per day, split by who answered. The arrow keys read each day.">
      <svg viewBox={`0 0 ${W} ${H}`} className="rp2-svg" aria-hidden="true">
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
            <g key={p.day} className={tip === i ? "rp2-col hot" : "rp2-col"}>
              {rects.map((r) => (r === last
                ? <path key={r.k} d={rpTopRound(x, r.top, bw, r.h, 4)} className={`rp2-seg ${r.k}`} />
                : <rect key={r.k} x={x} y={r.top} width={bw} height={r.h} className={`rp2-seg ${r.k}`} />))}
              {i % every === 0 && <text x={L + i * slot + slot / 2} y={H - 8} className="rp2-tick" textAnchor="middle">{p.label}</text>}
              <rect x={L + i * slot} y={T} width={slot} height={ph} className="rp2-hit" onMouseEnter={() => setTip(i)} onMouseLeave={() => setTip(null)} />
            </g>
          );
        })}
        {priorPoints && <polyline points={priorPoints} className="rp2-prior" />}
      </svg>
      {day && (
        <div className="rp2-tip" style={{ left: `${((L + tip * slot + slot / 2) / W) * 100}%` }}>
          <div className="rp2-tip-day">{day.label}</div>
          <div className="rp2-tip-row"><b>{day.in}</b> customer message{day.in === 1 ? "" : "s"}</div>
          <div className="rp2-tip-row"><i className="rp2-key-line ai" /><b>{day.ai}</b> answered by the receptionist</div>
          <div className="rp2-tip-row"><i className="rp2-key-line you" /><b>{day.you}</b> answered by you</div>
          <div className="rp2-tip-row"><i className="rp2-key-line none" /><b>{day.none}</b> unanswered</div>
          {was !== null && <div className="rp2-tip-row"><i className="rp2-key-line prior" /><b>{was}</b> on the matching day of {priorLabel}</div>}
        </div>
      )}
      <span className="rp2-live" aria-live="polite">{said}</span>
    </div>
  );
};

const RpColumns = ({ points, field, max, days, label, prior = null, priorLabel = "" }) => {
  const [tip, setTip, keys] = useRpTip(points.length);
  const W = 560, H = 150, L = 28, R = 6, T = 8, B = 22;
  const pw = W - L - R, ph = H - T - B;
  const nice = rpNice(Math.max(max, rpPriorMax(prior)));
  const n = Math.max(1, points.length);
  const slot = pw / n;
  const bw = Math.min(24, Math.max(3, slot * 0.68));
  const y = (v) => T + ph * (1 - v / nice);
  const every = days <= 7 ? 1 : days <= 30 ? 5 : 15;
  const priorPoints = rpPriorPoints(prior, slot, L, y);
  const day = tip === null ? null : points[tip];
  const was = tip === null || !prior ? null : prior[tip] ?? null;
  const said = day ? `${day.label}: ${day[field]} ${label}${was === null ? "" : `; ${was} on the matching day of ${priorLabel}`}` : "";
  return (
    <div className="rp2-plot small" {...keys} aria-label={`${rpCap(label)} per day. The arrow keys read each day.`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="rp2-svg" aria-hidden="true">
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
            <g key={p.day} className={tip === i ? "rp2-col hot" : "rp2-col"}>
              {v > 0 && <path d={rpTopRound(x, y(0) - h, bw, h, 4)} className="rp2-seg ai" />}
              {i % every === 0 && <text x={L + i * slot + slot / 2} y={H - 6} className="rp2-tick" textAnchor="middle">{i === 0 || days <= 7 ? p.label : p.short}</text>}
              <rect x={L + i * slot} y={T} width={slot} height={ph} className="rp2-hit" onMouseEnter={() => setTip(i)} onMouseLeave={() => setTip(null)} />
            </g>
          );
        })}
        {priorPoints && <polyline points={priorPoints} className="rp2-prior" />}
      </svg>
      {day && (
        <div className="rp2-tip" style={{ left: `${((L + tip * slot + slot / 2) / W) * 100}%` }}>
          <div className="rp2-tip-day">{day.label}</div>
          <div className="rp2-tip-row"><b>{day[field]}</b> {label}</div>
          {was !== null && <div className="rp2-tip-row"><i className="rp2-key-line prior" /><b>{was}</b> on the matching day of {priorLabel}</div>}
        </div>
      )}
      {priorPoints && <div className="rp2-legend"><span className="rp2-key"><i className="rp2-key-line prior" />{rpCap(priorLabel)}</span></div>}
      <span className="rp2-live" aria-live="polite">{said}</span>
    </div>
  );
};

const RpBars = ({ rows, empty }) => {
  if (!rows.length) return <EmptyState kind="line" title={empty} />;
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
  if (!rt.count) return <EmptyState kind="line" title="No receptionist replies in this period to time." />;
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

// A section: one line of small capitals and a hairline, the way the rest of
// the OS labels its rails — the page reads as three questions, not a grid
// of cards.
const RpSection = ({ label, meta }) => (
  <div className="rp2-section" role="separator" aria-label={label}>
    <span className="rp2-section-label">{label}</span>
    {meta ? <span className="rp2-section-meta">{meta}</span> : null}
  </div>
);

// A share in a table cell: the number, with a thin bar behind it.
const RpShare = ({ pct, n, of }) => (
  <span className="rp2-share" title={pct === null ? "nothing sent" : `${n} of ${of}`}>
    <span className="rp2-share-track"><span className="rp2-share-fill" style={{ width: `${pct === null ? 0 : Math.max(pct ? 2 : 0, pct)}%` }} /></span>
    <span className="rp2-share-num tabular">{pct === null ? "—" : `${pct}%`}</span>
  </span>
);

// The current period by source: a playbook's runs together, a one-off
// broadcast alone; the shares are of that source's own sent.
const RpSources = ({ rows }) => {
  if (!rows.length) return <EmptyState kind="line" title="No broadcast or playbook run reached anyone in this period." />;
  const title = (s) => (window.__starters && s.templateName ? window.__starters.title(s.templateName) : s.template);
  return (
    <div className="rp2-tablewrap">
      <table className="rp2-table rp2-sources">
        <thead><tr><th>Source</th><th className="num">Sent</th><th>Delivered</th><th>Replied</th><th>Last</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} data-testid="source-row">
              <td>
                {/* The row's own door: a playbook's card, or the broadcast's own page (broadcasts/run:<id>). */}
                <button type="button" className="rp2-src-name rp2-src-open" onClick={() => window.CHANLY.nav(s.kind === "broadcast" ? `broadcasts/run:${s.id}` : `outbound/${s.id}`)} data-testid="source-open">{s.name}</button>
                <span className="rp2-src-meta">{s.kindLabel}{s.kind === "playbook" ? ` · ${s.runs} run${s.runs === 1 ? "" : "s"}` : ""}{title(s) ? ` · ${title(s)}` : ""}</span>
              </td>
              <td className="num">{s.sent}</td>
              <td><RpShare pct={s.deliveredPct} n={s.delivered} of={s.sent} /></td>
              <td><RpShare pct={s.repliedPct} n={s.replied} of={s.sent} /></td>
              <td className="rp2-src-last">{s.lastLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// An answer to a review, on Google, in the business's own words: a link
// under the review, a few lines, Send. Google keeps one reply per review,
// so sending again replaces it. Shown only when the Business Profile is
// connected and the review came through it.
// The composer under a review. Under Ask (and Auto, for one the receptionist
// has not reached), opening it asks the receptionist for a draft first, so a
// reply is one tap: read, change anything, send. Under Never the box opens
// empty and nothing is asked.
const ReviewReply = ({ r, mode }) => {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(r.replyText || "");
  const [busy, setBusy] = React.useState(false);
  const [drafting, setDrafting] = React.useState(false);
  // null · "yes" (the words in the box are the receptionist's) · a sentence saying why there is none
  const [drafted, setDrafted] = React.useState(null);
  const [toastNode, flash] = window.usePPToast();
  const openIt = async () => {
    setOpen(true);
    if (r.replied || mode === "never" || !window.__google || !window.__google.draft) return;
    setDrafting(true);
    const d = await window.__google.draft(r.id);
    setDrafting(false);
    if (d.ok) { setText(d.text); setDrafted("yes"); }
    else setDrafted(d.message || "No draft this time — write the reply yourself.");
  };
  const send = async () => {
    if (!window.__google || busy || drafting || !text.trim()) return;
    setBusy(true);
    const res = await window.__google.reply(r.id, text);
    setBusy(false);
    flash({ tone: res.ok ? "ok" : "danger", msg: res.ok ? <>Your reply is on Google, under the review.</> : <>{res.message}</> });
    if (res.ok) setOpen(false);
  };
  return (
    <div className="rp2-review-reply">
      {r.replied && !open && <p className="rp2-review-replytext"><b>You replied:</b> {r.replyText}</p>}
      {!open ? (
        <button className="cl-bucket-link" onClick={openIt} data-testid="google-reply">{r.replied ? "Change the reply" : "Reply"}</button>
      ) : (
        <div className="rp2-review-composer" data-testid="google-reply-composer">
          <textarea className="rp2-review-textarea" rows={3} value={text} maxLength={4096} disabled={drafting} onChange={(e) => { setText(e.target.value); if (drafted === "yes") setDrafted(null); }} placeholder={drafting ? "The receptionist is writing a draft…" : "Thank them, or answer them — it appears on Google under the review, in the business's name."} data-testid="google-reply-text" />
          {drafted === "yes" && <span className="rp2-review-drafted" data-testid="google-reply-drafted">Drafted by the receptionist — change anything, then send.</span>}
          {drafted && drafted !== "yes" && <span className="rp2-review-drafted dim" data-testid="google-reply-undrafted">{drafted}</span>}
          <div className="bc-chips">
            <button className="btn btn-primary btn-sm" onClick={send} disabled={busy || drafting || !text.trim()} data-testid="google-reply-send">{busy ? "Sending…" : "Send to Google"}</button>
            <button className="cl-bucket-link" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
      {toastNode}
    </div>
  );
};

// Google reviews: the listing as the edge last read it, over the period
// above. Four measured tiles, the ratings gained day by day (from the
// day-by-day count, a table twin beside), and the latest reviews with their
// words — the five Google shows first, and said so. Nothing linked: an
// honest card that leads to Setup. Nothing at all when this deployment
// cannot look listings up.
const GoogleSection = ({ days }) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:google", bump);
    return () => window.removeEventListener("surface:google", bump);
  }, []);
  const G = window.__GOOGLE;
  if (!G || (!G.dto.ready.places && !G.dto.ready.profile && !G.dto.listing) || !window.__google) return null;
  const vm = window.__google.vm(G.dto, days);
  const operator = window.canDo ? window.canDo("approve") : false;
  if (!vm.listing) {
    return (
      <>
        <RpSection label="Google reviews" />
        <section className="fl-card rp2-card" data-testid="google-none">
          <div className="fl-card-head"><span className="fl-card-title">Your listing on Google</span></div>
          <EmptyState kind="line" title="Find your business on Google once." body="Its rating, its count and its newest reviews show here for the period, with a line on Today and a row on the bell when one lands." action={{ label: "Find it on Setup", to: "admin/setup" }} />
        </section>
      </>
    );
  }
  const L = vm.listing;
  return (
    <>
      <RpSection label="Google reviews" meta={`${L.name} · ${L.checked.charAt(0).toLowerCase()}${L.checked.slice(1)}`} />
      <div className="rp2-tiles rp2-strip-google four" data-testid="google-tiles">{vm.tiles.map((t) => <RpTile key={t.id} t={t} />)}</div>
      <div className="rp2-row rp2-row-wide">
        <RpCard title="Ratings gained, day by day" sub={vm.gained.total === null ? "needs a second day of reading" : `${vm.gained.total} in the period, by Google's count`} testid="chart-google-gained"
          table={{ columns: ["Day", "Gained"], rows: vm.gained.points.map((p) => [p.label, p.gained]) }}>
          {vm.gained.points.length && vm.gained.total !== null
            ? <RpColumns points={vm.gained.points} field="gained" max={vm.gained.max} days={days} label="ratings gained" />
            : <EmptyState kind="line" title="The count is read once a day; the first difference shows after the second read." />}
        </RpCard>
        <RpCard title="Latest reviews" sub={vm.latest.length ? (vm.reply.words ? `${vm.source} · ${vm.reply.words}` : vm.source) : ""} testid="chart-google-latest" table={vm.table}>
          {vm.latest.length ? (
            <div className="rp2-reviews">
              {vm.latest.map((r) => (
                <div key={r.id} className={"rp2-review" + (r.isNew ? " is-new" : "")} data-testid="google-review">
                  <div className="rp2-review-head">
                    <span className="rp2-review-stars" aria-label={`${r.rating == null ? 0 : r.rating} of 5`}>{r.stars}</span>
                    <span className="rp2-review-who">{r.author}</span>
                    <span className="rp2-review-when">{r.when}{r.isNew ? " · new" : ""}{r.replied ? " · replied" : ""}</span>
                  </div>
                  {r.text ? <p className="rp2-review-text">{r.text}</p> : <p className="rp2-review-text dim">A rating without words.</p>}
                  {vm.canReply && operator && r.fromProfile
                    ? <ReviewReply r={r} mode={vm.reply.mode} />
                    : r.replied ? <p className="rp2-review-replytext"><b>Replied:</b> {r.replyText}</p> : null}
                </div>
              ))}
            </div>
          ) : <EmptyState kind="line" title="Google shows no written reviews for this listing yet." />}
        </RpCard>
      </div>
    </>
  );
};

const RP2_RANGES = [[7, "7 days"], [30, "30 days"], [90, "90 days"]];

const ReportsReal = () => {
  const R = useReports();
  const [busy, setBusy] = useRpState(false);
  // The period that failed to load, if any: the page keeps the old one and
  // says so, instead of dimming forever and switching later on its own.
  const [failed, setFailed] = useRpState(null);
  const fetchedAt = R ? R.fetchedAt : 0;
  React.useEffect(() => { setBusy(false); }, [fetchedAt]);
  const vm = R.vm;
  const cm = R.campaigns || null;
  const bk = R.booking || { present: false, headline: "—", sub: "", pct: null, asked: 0, booked: 0 };
  const [widest, widestLabel] = RP2_RANGES[RP2_RANGES.length - 1];
  const pick = async (days) => {
    // One period at a time: while one loads the tabs hold, rather than start a second load over the first.
    if (busy || days === R.days || !window.__setReportDays) return;
    setBusy(true);
    setFailed(null);
    const ok = await window.__setReportDays(days);
    if (!ok) {
      setBusy(false);
      setFailed(days);
    }
  };
  return (
    <div className="reports" data-testid="reports-real">
      {/* One line above the numbers: the period, and the days it covers. The top bar says Reports, and a sub-headline
          under that title said what the page is for -- 162px of a phone before a single number. */}
      <div className="rp2-head">
        <div className="rp2-range cl-tabs" role="group" aria-label="Period">
          {RP2_RANGES.map(([d, l]) => (
            <button key={d} className={`cl-tab ${R.days === d ? "active" : ""}`} aria-pressed={R.days === d} aria-disabled={busy} onClick={() => pick(d)}>{l}</button>
          ))}
        </div>
        <span className="rp2-head-dates" title={`Days follow ${vm.timezone}`}>{vm.since} – {vm.until}</span>
        {failed && (
          <span className="rp2-range-failed" role="status">
            Couldn't load {(RP2_RANGES.find(([d]) => d === failed) || [])[1]} — still showing {(RP2_RANGES.find(([d]) => d === R.days) || [])[1]}.
          </span>
        )}
      </div>

      <div className={`rp-body rp2-body ${busy ? "rp2-loading" : ""}`} aria-busy={busy ? "true" : "false"}>
        {/* The period is the control above, once. */}
        <RpSection label="The receptionist" />
        <div className="rp2-tiles rp2-strip-reception">{vm.tiles.map((t) => <RpTile key={t.id} t={t} />)}</div>

        {vm.empty ? (
          <EmptyState kind="card" glyph="wave" title="Nothing came in" body={`Nobody wrote or called between ${vm.since} and ${vm.until}, so there is nothing to chart. The numbers above are real zeros.`} action={R.days !== widest ? { label: `Look at ${widestLabel}`, onClick: () => pick(widest) } : null} />
        ) : (
          <>
            {/* The strip above says how many messages came in; the legend below says who answered them. */}
            <RpCard title="Who answered, day by day" testid="chart-answered" table={vm.table} className="rp2-main">
              <div className="rp2-legend">
                <span className="rp2-key"><i className="rp2-swatch ai" />Receptionist <b>{vm.answered.totals.ai}</b></span>
                <span className="rp2-key"><i className="rp2-swatch you" />You <b>{vm.answered.totals.you}</b></span>
                <span className="rp2-key"><i className="rp2-swatch none" />Unanswered <b>{vm.answered.totals.none}</b></span>
                {(vm.answered.prior || []).some((v) => v !== null) && <span className="rp2-key"><i className="rp2-swatch prior" />The {vm.rangeLabel} before</span>}
              </div>
              {vm.answered.totals.in
                ? <RpStacked points={vm.answered.points} max={vm.answered.max} days={vm.days} prior={vm.answered.prior} priorLabel={`the ${vm.rangeLabel} before`} />
                : <EmptyState kind="line" title="No customer messages in this period — the receptionist had nothing to answer by text. Calls are below." />}
            </RpCard>

            <div className="rp2-row">
              <RpCard title="Why the receptionist stopped" testid="chart-reasons"
                table={{ columns: ["Reason", "Times"], rows: vm.reasons.map((r) => [r.label, r.value]) }}>
                <RpBars rows={vm.reasons} empty={vm.answered.totals.you === 0 && vm.answered.totals.none === 0
                  ? "It never stopped in this period — every message was answered without you."
                  : "It never stopped in this period, though some messages were answered by you or by nobody — see above."} />
              </RpCard>
              <RpCard title="How fast it answers" sub="from a customer's message to the receptionist's reply" testid="chart-reply"
                table={{ columns: ["Reply time", "Replies"], rows: vm.replyTime.buckets.map((b) => [b.label, b.value]) }}>
                <RpBuckets rt={vm.replyTime} />
              </RpCard>
            </div>
          </>
        )}

        <RpSection label="Campaigns" meta="what your broadcasts and playbooks sent" />
        {cm ? (
          <>
            <div className="rp2-tiles rp2-strip-campaigns five" data-testid="campaign-tiles">{cm.tiles.map((t) => <RpTile key={t.id} t={t} />)}</div>
            {cm.empty ? (
              <EmptyState kind="card" glyph="wave" title="Nothing went out" body={`No broadcast or playbook run reached anyone between ${vm.since} and ${vm.until}, and nobody said yes or asked to stop.`} action={{ label: "Open Broadcasts", to: "broadcasts" }} testid="chart-campaigns" />
            ) : (
              <div className="rp2-row rp2-row-wide">
                <RpCard title="Sent, day by day" sub={cm.totals.sent ? `${cm.totals.sent} messages · ${cm.totals.replied} wrote back` : "nothing sent"} testid="chart-campaigns" table={cm.table}>
                  {cm.totals.sent
                    ? <RpColumns points={cm.points} field="sent" max={cm.max} days={vm.days} label="messages sent" prior={cm.prior} priorLabel={`the ${vm.rangeLabel} before`} />
                    : <EmptyState kind="line" title="No message went out in this period; the yeses and stops above are the people's own." />}
                </RpCard>
                <RpCard title="By playbook and broadcast" sub={cm.sources.length ? `${cm.sources.length} source${cm.sources.length === 1 ? "" : "s"} · shares of each one's own sent` : ""} testid="chart-sources"
                  table={{ columns: ["Source", "Kind", "Sends", "Sent", "Delivered", "Replied"], rows: cm.sources.map((x) => [x.name, x.kindLabel, x.runs, x.sent, x.delivered, x.replied]) }}>
                  <RpSources rows={cm.sources} />
                </RpCard>
              </div>
            )}
          </>
        ) : (
          <FailedRead kind="card" what="the campaign numbers" body="The receptionist's own numbers above are current." surface="reports" testid="chart-campaigns" />
        )}

        <GoogleSection days={R.days} />

        {!vm.empty && (
          <>
            <RpSection label="Calls and people" />
            <div className="rp2-row rp2-row-three">
              <RpCard title="Calls" sub={vm.calls.total ? "" : "no calls in this period"} testid="chart-calls"
                table={{ columns: ["Day", "Calls", "Seconds"], rows: vm.calls.points.map((p) => [p.label, p.calls, p.callSeconds]) }}>
                {vm.calls.total ? (
                  <>
                    <RpColumns points={vm.calls.points} field="calls" max={vm.calls.max} days={vm.days} label="calls" prior={vm.calls.prior} priorLabel={`the ${vm.rangeLabel} before`} />
                    {vm.calls.sentiments.length > 0 && (
                      <div className="rp2-foot">Caller mood, the voice provider's own read: {vm.calls.sentiments.map((x) => `${x.label} ${x.value}`).join(" · ")}</div>
                    )}
                  </>
                ) : <EmptyState kind="line" title="Nobody phoned in this period." />}
              </RpCard>
              <RpCard title="New people" sub={vm.people.total ? "" : "nobody new"} testid="chart-people"
                table={{ columns: ["Day", "New people"], rows: vm.people.points.map((p) => [p.label, p.newPeople]) }}>
                {vm.people.total
                  ? <RpColumns points={vm.people.points} field="newPeople" max={vm.people.max} days={vm.days} label="new people" prior={vm.people.prior} priorLabel={`the ${vm.rangeLabel} before`} />
                  : <EmptyState kind="line" title="Nobody new wrote or called in this period." />}
              </RpCard>
              <RpCard title="Asked → booked" sub={bk.present ? "the booking is the conversion" : "needs the calendar"} testid="chart-booking">
                <div className="rp2-booking">
                  <div className="rp2-booking-big tabular">{bk.pct !== null ? `${bk.pct}%` : "—"}</div>
                  <div className="rp2-booking-head">{bk.headline}</div>
                  {bk.pct !== null && <div className="rp2-booking-bar"><span style={{ width: `${bk.pct}%` }} /></div>}
                  <div className="rp2-booking-sub">{bk.sub}</div>
                </div>
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
// Today draws the period with the same tile.
Object.assign(window, { RpTile });
