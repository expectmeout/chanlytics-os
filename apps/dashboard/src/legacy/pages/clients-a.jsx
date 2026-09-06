/* global React, Icon, CLIENTS, CLIENT_BUCKETS, CLIENT_SEGMENTS, CLIENTS_AGGREGATES,
   ChannelGlyph, TempBar, ClientTag, AgentChip, BucketPill */
// Chanlytics — Clients · Direction A: Relationship Portfolio
// Triage-first hybrid: bucket hero up top, dense table below.

const { useState, useMemo } = React;

// Seed "today" is Apr 26 — numeric days-ago for correct last-visit sorting.
const CL_MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const clDaysAgo = (s) => {
  if (!s || s === "—") return null;
  const [mon, d] = s.split(" ");
  if (!(mon in CL_MONTHS)) return null;
  const now = new Date(2026, 3, 26);
  const dt = new Date(2026, CL_MONTHS[mon], parseInt(d, 10));
  if (dt > now) dt.setFullYear(2025);
  return Math.round((now - dt) / 86400000);
};

// Segment membership for a client (SEGMENT_META, non-lead members)
const clSegsOf = (id) => window.CHANLY.segsOf(id);

// ====== Smart-list rail ======
const ClientsRail = ({ activeSegment, onSegment }) => {
  const smart = CLIENT_SEGMENTS.filter(s => s.kind === "agent");
  const manual = CLIENT_SEGMENTS.filter(s => s.kind === "manual");  return (
    <aside className="cl-rail">
      <div className="cl-rail-section">
        <div className="cl-rail-label">
          <Icon name="sparkle" size={11} />
          Smart lists
        </div>
        {smart.map(s => (
          <button
            key={s.id}
            className={`cl-rail-row smart ${activeSegment === s.id ? "active" : ""}`}
            onClick={() => onSegment(s.id)}
            data-tip={`${s.query} — built by ${s.agent}, kept fresh automatically`}
          >
            <span className="label">{s.label}</span>
            <span className="count">{s.count}</span>
          </button>
        ))}
      </div>
      <div className="cl-rail-section">
        <div className="cl-rail-label">Saved</div>
        {manual.map(s => (
          <button
            key={s.id}
            className={`cl-rail-row ${activeSegment === s.id ? "active" : ""}`}
            onClick={() => onSegment(s.id)}
            data-tip={s.query}
          >
            <span className="label">{s.label}</span>
            <span className="count">{s.count}</span>
          </button>
        ))}
      </div>
      <div className="cl-rail-foot">
        <button className="cl-rail-newseg" onClick={() => {
          window.CHANLY.nav("segments");
          setTimeout(() => window.dispatchEvent(new CustomEvent("segments:new")), 450);
        }}>
          <Icon name="plus" size={11} />
          New segment
        </button>
      </div>
    </aside>
  );
};

// ====== Triage Console — unified tabbed hero ======
// Replaces the 4×3 bulky bucket grid. One card, 4 tabs across the top with
// counts + a 14-cell distribution sparkbar that shows the temperature shape
// of each bucket. Below, a 3-column row of compact decision rows for the
// active tab.

const distributionCells = (clients) => {
  // 14 cells, each colored by avg temp of the slice
  const sorted = [...clients].sort((a,b) => a.temp - b.temp);
  const slice = Math.max(1, Math.floor(sorted.length / 14));
  const cells = [];
  for (let i = 0; i < 14; i++) {
    const start = i * slice;
    const end = i === 13 ? sorted.length : start + slice;
    const sub = sorted.slice(start, end);
    const avg = sub.length ? sub.reduce((a,c) => a + c.temp, 0) / sub.length : 0;
    cells.push(avg);
  }
  return cells;
};

const TempPill = ({ value }) => {
  const pct = Math.round(value * 100);
  return (
    <span className="cl-temp-pill" data-tip={`Temperature ${pct} of 100 — likelihood to book again, from recency, frequency, spend, and replies`}>
      <span className="cl-temp-pill-bar"><span className="cl-temp-pill-pin" style={{ left: `${pct}%` }} /></span>
      <span className="cl-temp-pill-num">{pct}</span>
    </span>
  );
};

const ClientDecisionRow = ({ client, onOpen }) => {
  const c = client;
  if (!c) return null;
  const ag = c.agentActivity;
  const cta =
    ag?.status === "approval" ? { label: "Review", kind: "primary" }
    : ag?.status === "escalated" ? { label: "Take it", kind: "primary" }
    : ag?.status === "stalled" ? { label: "Decide", kind: "primary" }
    : c.bucket === "champion" && c.threadCount > 0 ? { label: "Open", kind: "ghost" }
    : c.bucket === "new" ? { label: "Profile", kind: "ghost" }
    : { label: "Open", kind: "ghost" };

  return (
    <div className="cl-decision" onClick={() => onOpen(c.id)} role="button">
      <div className="cl-decision-l">
        <div className="cl-mini-avatar" data-priority={c.priority}>{c.initials}</div>
        <TempPill value={c.temp} />
      </div>
      <div className="cl-decision-body">
        <div className="cl-decision-name">
          {c.name}
          {c.tags.includes("VIP") && <Icon name="star" size={10} style={{ color: "var(--warn)" }} />}
          <span className="cl-decision-meta">
            {c.ltv > 0 && <>${c.ltv.toLocaleString()}<span className="dim"> LTV</span></>}
            {c.lastVisit !== "—" && <span className="dim"> · last {c.lastVisit}</span>}
          </span>
        </div>
        <div className="cl-decision-narr">{c.narrative}</div>
        {ag && (
          <div className={`cl-decision-agent ${ag.status === "approval" ? "approval" : ag.status === "escalated" ? "escalated" : ""}`}>
            <span className="agent-avatar">{ag.glyph}</span>
            {(ag.status === "in-flight" || ag.status === "approval") && <span className="live-dot" />}
            <span className="cl-decision-agent-text">{ag.agent} · {ag.verb}</span>
          </div>
        )}
      </div>
      <button
        className={`cl-decision-cta ${cta.kind}`}
        onClick={(e) => { e.stopPropagation(); onOpen(c.id); }}
      >
        {cta.label}
      </button>
    </div>
  );
};

const TriageConsole = ({ buckets, clients, onOpen, attentionTab, setAttentionTab, onSeeAll }) => {
  const counts = useMemo(() => {
    const m = {};
    buckets.forEach(b => {
      m[b.id] = clients.filter(c => c.bucket === b.id).length;
    });
    return m;
  }, [buckets, clients]);

  const dists = useMemo(() => {
    const m = {};
    buckets.forEach(b => {
      m[b.id] = distributionCells(clients.filter(c => c.bucket === b.id));
    });
    return m;
  }, [buckets, clients]);

  const active = buckets.find(b => b.id === attentionTab) || buckets[0];
  const rows = clients.filter(c => c.bucket === active.id).slice(0, 3);
  const totalInBucket = counts[active.id];
  const activeInBucket = clients.filter(c => c.bucket === active.id && c.agentActivity).length;

  return (
    <section className="cl-triage">
      {/* Tab strip */}
      <div className="cl-triage-tabs" role="tablist">
        {buckets.map(b => {
          const isActive = b.id === active.id;
          return (
            <button
              key={b.id}
              role="tab"
              aria-selected={isActive}
              className={`cl-triage-tab ${isActive ? "active" : ""} ${b.accent ? "accent" : ""}`}
              onClick={() => setAttentionTab(b.id)}
            >
              <div className="cl-triage-tab-row">
                <span className="cl-triage-tab-label">
                  <Icon name={b.glyph} size={11} />
                  {b.label}
                </span>
                <span className="cl-triage-tab-count">{counts[b.id]}</span>
              </div>
              <div className="cl-triage-tab-strip">
                {dists[b.id].map((t, i) => (
                  <span
                    key={i}
                    className="cl-triage-cell"
                    style={{
                      "--t": t,
                      background: `oklch(${0.6 + (1 - t) * 0.05} ${0.08 + (Math.abs(t - 0.5) * 0.16)} ${t > 0.5 ? 80 - t*60 : 235 - t*120})`
                    }}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active tab body */}
      <div className="cl-triage-body">
        <div className="cl-triage-body-head">
          <div className="cl-triage-body-titles">
            <span className="cl-triage-body-title">{active.label}</span>
            <span className="cl-triage-body-sub">{active.sub}</span>
          </div>
          <div className="cl-triage-body-meta">
            <span>{activeInBucket} agent{activeInBucket === 1 ? "" : "s"} active</span>
            <span className="dot" />
            <button className="cl-triage-seeall" onClick={() => onSeeAll(active.id)}>
              See all {totalInBucket}
              <Icon name="arrow-right" size={10} />
            </button>
          </div>
        </div>
        <div className="cl-decision-grid">
          {rows.map(c => <ClientDecisionRow key={c.id} client={c} onOpen={onOpen} />)}
          {rows.length === 0 && (
            <div className="cl-decision-empty">No clients in this bucket right now.</div>
          )}
        </div>
      </div>
    </section>
  );
};

// ====== Table ======
// One metric per row (Health); LTV + next visit live on hover and in the profile
const headerCols = [
  { key: "checkbox", label: "", sortable: false },
  { key: "name",     label: "Client", sortable: true },
  { key: "bucket",   label: "State", sortable: true },
  { key: "temp",     label: "Health", sortable: true },
  { key: "agent",    label: "Agent activity", sortable: false },
  { key: "lastVisit",label: "Last visit", sortable: true },
];

const ClientsTable = ({ clients, sortBy, sortDir, onSort, selected, onToggle, onOpen, onClearFilters = () => {} }) => {
  return (
    <div className="cl-table-wrap">
      <table className="cl-table">
        <thead>
          <tr>
            {headerCols.map(c => (
              <th
                key={c.key}
                className={`${c.sortable ? "sortable" : ""} ${c.num ? "num" : ""}`}
                onClick={() => c.sortable && onSort(c.key)}
              >
                {c.label}
                {sortBy === c.key && <span className="sort-arr">{sortDir === "asc" ? "▲" : "▼"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {clients.map(c => { const rowSegs = clSegsOf(c.id); return (
            <tr
              key={c.id}
              className={selected.has(c.id) ? "checked" : ""}
              onClick={() => onOpen(c.id)}
            >
              <td className="shrink" onClick={(e) => { e.stopPropagation(); onToggle(c.id); }}>
                <input type="checkbox" className="cl-row-checkbox" checked={selected.has(c.id)} readOnly />
              </td>
              <td data-tip={`$${(c.ltv || 0).toLocaleString()} LTV · ${c.nextAppt ? "next " + c.nextAppt : "none booked"}${c.signals.length ? " · " + c.signals.join(", ") : ""}`}>
                <div className="cl-row-name">
                  <div className="ix-thread-avatar" data-priority={c.priority}>{c.initials}</div>
                  <div className="cl-row-name-block">
                    <div className="cl-row-fullname">
                      {c.name}
                      {c.tags.includes("VIP") && <Icon name="star" size={11} style={{ color: "var(--warn)" }} />}
                    </div>
                    <div className="cl-row-meta">
                      <span className="cl-row-channels">
                        {c.channels.map((ch, i) => <ChannelGlyph key={i} kind={ch} primary={ch === c.primaryChannel} size={11} />)}
                      </span>
                      <span className="dot" />
                      <span>{c.therapist !== "—" ? c.therapist : c.source}</span>
                      <span className="dot" />
                      <span>{c.visits} visit{c.visits === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                </div>
              </td>
              <td className="shrink"><BucketPill bucket={c.bucket} /></td>
              <td className="shrink">
                <div className="cl-temp-cell">
                  <TempBar value={c.temp} sizeClass="bar-md" />
                  <span className="cl-temp-num">{Math.round(c.temp * 100)}</span>
                </div>
              </td>
              <td><AgentChip activity={c.agentActivity} /></td>
              <td className="shrink dim">{c.lastVisit}</td>
            </tr>
          ); })}
          {clients.length === 0 && (
            <tr>
              <td colSpan={6}>
                <div className="cl-table-empty">
                  <Icon name="search" size={15} />
                  <span>No clients match this view.</span>
                  <button className="cl-bucket-link" onClick={onClearFilters}>
                    Clear filters <Icon name="arrow-right" size={10} />
                  </button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="cl-table-foot">
        <span>Showing {clients.length} of {CLIENTS_AGGREGATES.total}</span>
        <span>Sort any column · press / to search</span>
      </div>
    </div>
  );
};

// ====== Main ======
const ClientsASeed = ({ onOpenProfile = () => {}, initialSegment = null }) => {
  const [activeSegment, setSegment] = useState(initialSegment);
  React.useEffect(() => { setSegment(initialSegment); }, [initialSegment]);
  const [selected, setSelected] = useState(new Set());
  const [sortBy, setSortBy] = useState("temp");
  const [sortDir, setSortDir] = useState("desc");
  const [tab, setTab] = useState("all");
  const [attentionTab, setAttentionTab] = useState("needs-you");
  const [showTriage, setShowTriage] = useState(true);
  const [clQuery, setClQuery] = useState("");
  const [healthOpen, setHealthOpen] = useState(false);
  const [bulkMenu, setBulkMenu] = useState(null);   // "segment" | "agent" | null
  const [flash, setFlash] = useState(null);
  const searchRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const tableRef = React.useRef(null);

  useHotkey(
    (e, typing) => !typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === "/",
    () => searchRef.current && searchRef.current.focus()
  );

  const seeAll = (id) => {
    setTab(id);
    setAttentionTab(id);
    const sc = scrollRef.current, el = tableRef.current;
    if (sc && el) sc.scrollTo({ top: Math.max(0, el.offsetTop - 12), behavior: "smooth" });
  };

  // Bulk-bar flash timer lives at module scope — per-render closure expandos
  // (fn._t) reset every render, letting stale timers clear a fresh flash.
  const bulkFlash = (msg) => {
    setBulkMenu(null);
    bulkFlash._sel = new Set(selected);
    setFlash(msg);
    window.clearTimeout(window.__clBulkTimer);
    window.__clBulkTimer = window.setTimeout(() => { setFlash(null); setSelected(new Set()); }, 3200);
  };
  const bulkUndo = () => {
    window.clearTimeout(window.__clBulkTimer);
    setFlash(null);
    if (bulkFlash._sel) setSelected(bulkFlash._sel);
  };

  const onSort = (key) => {
    if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(key); setSortDir("desc"); }
  };

  const onToggle = (id) => setSelected(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const sorted = useMemo(() => {
    const arr = [...CLIENTS];
    arr.sort((a, b) => {
      let av, bv;
      switch (sortBy) {
        case "name": av = a.name; bv = b.name; break;
        case "ltv": av = a.ltv; bv = b.ltv; break;
        case "temp": av = a.temp; bv = b.temp; break;
        case "lastVisit": av = clDaysAgo(a.lastVisit) ?? 9999; bv = clDaysAgo(b.lastVisit) ?? 9999; break;
        case "bucket": av = a.bucket; bv = b.bucket; break;
        default: av = a.name; bv = b.name;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [sortBy, sortDir]);

  const tabbed = useMemo(() => {
    let list = tab === "all" ? sorted : sorted.filter(c => c.bucket === tab);
    const segMeta = activeSegment && (window.SEGMENT_META || {})[activeSegment];
    if (segMeta) {
      const ids = new Set(segMeta.members.filter(m => !m.lead).map(m => m.id));
      list = list.filter(c => ids.has(c.id));
    }
    if (clQuery.trim()) {
      const q = clQuery.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.therapist || "").toLowerCase().includes(q) ||
        c.tags.some(t => t.toLowerCase().includes(q)) ||
        c.signals.some(s => s.toLowerCase().includes(q))
      );
    }
    return list;
  }, [sorted, tab, clQuery, activeSegment]);

  const activeSegMeta = activeSegment && CLIENT_SEGMENTS.find(s => s.id === activeSegment);
  const segHasMembers = !activeSegment || !!(window.SEGMENT_META || {})[activeSegment];

  // Sort button label follows the active column; [desc label, asc label]
  const sortLabels = {
    temp: ["Warmest first", "Coolest first"],
    ltv: ["Highest LTV first", "Lowest LTV first"],
    name: ["Z → A", "A → Z"],
    lastVisit: ["Oldest visit first", "Recent visits first"],
    bucket: ["By state", "By state · reversed"],
  };
  const sortLabel = (sortLabels[sortBy] || ["Sorted", "Sorted"])[sortDir === "desc" ? 0 : 1];

  return (
    <div className="clients">
      <ClientsRail activeSegment={activeSegment} onSegment={(id) => setSegment(cur => cur === id ? null : id)} />

      <div className="cl-main">
        <div className="cl-main-scroll" ref={scrollRef}>
          {/* Header */}
          <div className="cl-head">
            <div className="cl-head-titles">
              <div className="cl-page-title">Clients</div>
              <div className="cl-page-sub">
                Your relationships under management. Agents handle the routine — you step in where judgment matters.
              </div>
            </div>
            <StatStrip className="cl-head-stats">
              <StatCell label="Total book" value={CLIENTS_AGGREGATES.total} meta={`+${CLIENTS_AGGREGATES.newThisMonth} this month`} metaTone="pos" />
              <StatCell label="Active touches" value={CLIENTS_AGGREGATES.activeAgentTouches} meta={`today · ${CLIENTS_AGGREGATES.agentsActive} agents`} />
              <span className="cl-health-wrap" onClick={() => setHealthOpen(v => !v)} data-tip="How this is computed — click to expand">
                <StatCell label="Health index" value={Math.round(CLIENTS_AGGREGATES.health.score * 100)} meta={`${CLIENTS_AGGREGATES.healthDelta} · why?`} metaTone="neg" />
                {healthOpen && (
                  <>
                    <div className="more-backdrop" onClick={(e) => { e.stopPropagation(); setHealthOpen(false); }} />
                    <div className="cl-health-pop" onClick={(e) => e.stopPropagation()}>
                      <div className="cl-health-pop-title">Health index · {Math.round(CLIENTS_AGGREGATES.health.score * 100)}</div>
                      <div className="cl-health-pop-sub">Weighted blend of the lists that predict revenue</div>
                      {[
                        { seg: "drifting-vips", label: "Drifting VIPs", val: "4", tone: "neg", w: "35%" },
                        { seg: "pkg-ending", label: "Packages ending", val: "18", tone: "warn", w: "25%" },
                        { seg: "high-no-show", label: "No-show rate", val: "4%", tone: "neg", w: "20%" },
                        { seg: "advocates", label: "Advocates", val: "14 ↑", tone: "pos", w: "20%" },
                      ].map(r => (
                        <button key={r.seg} className="cl-health-row" onClick={() => window.CHANLY.nav(CHANLY.R.segment(r.seg))}>
                          <span className="cl-health-row-label">{r.label}</span>
                          <span className={`cl-health-row-val ${r.tone}`}>{r.val}</span>
                          <span className="cl-health-row-w tabular">{r.w}</span>
                          <Icon name="arrow-right" size={10} />
                        </button>
                      ))}
                      <div className="cl-health-pop-foot">↓ 2 this week — driven by +1 Drifting VIP</div>
                    </div>
                  </>
                )}
              </span>
            </StatStrip>

          </div>

          {/* Search row */}
          <div className="cl-controls">
            <div className="cl-search-wrap">
              <Icon name="search" size={13} />
              <input ref={searchRef} placeholder="Search by name, tag, therapist…" value={clQuery} onChange={(e) => setClQuery(e.target.value)} />
              <span className="kbd">/</span>
            </div>
            <div className="cl-controls-right">
              <button className="btn btn-ghost btn-sm" onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}>
                <Icon name="sort" size={12} /> {sortLabel}
              </button>
            </div>
          </div>

          {/* Triage Console — unified tabbed hero */}
          <div className="cl-buckets">
            <div className="cl-buckets-head">
              <div>
                <span className="cl-buckets-title">Where your attention matters</span>
                <span className="cl-buckets-sub" style={{ marginLeft: 10 }}>
                  Updated {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <button className="cl-buckets-toggle" onClick={() => setShowTriage(v => !v)}>
                <Icon name="eye" size={11} />
                {showTriage ? "Hide" : "Show"}
              </button>
            </div>
            {showTriage && (
              <TriageConsole
                buckets={CLIENT_BUCKETS}
                clients={CLIENTS}
                onOpen={onOpenProfile}
                attentionTab={attentionTab}
                setAttentionTab={(id) => { setAttentionTab(id); setTab(id); }}
                onSeeAll={seeAll}
              />
            )}
          </div>

          {/* New from Leads — closes the leads → clients loop */}
          <div className="cl-conv-strip">
            <Icon name="bolt" size={11} />
            <span>
              <b>{(window.LEADS_AGGREGATES || {}).convertedThisWeek?.count ?? 6} new clients from Leads</b> this week · ${((window.LEADS_AGGREGATES || {}).convertedThisWeek?.value ?? 2870).toLocaleString()} est. first-year value
            </span>
            <button className="cl-bucket-link" onClick={() => window.CHANLY.nav("leads")}>
              Open Leads <Icon name="arrow-right" size={10} />
            </button>
          </div>

          {/* Table section */}
          <div className="cl-section" ref={tableRef}>
            <div className="cl-section-head">
              <div>
                <span className="cl-section-title">All clients</span>
                <span className="cl-section-sub" style={{ marginLeft: 10 }}>
                  {selected.size > 0 ? `${selected.size} selected` : `${tabbed.length} shown`}
                </span>
                {activeSegMeta && (
                  <span className="cl-seg-filter">
                    <Icon name={activeSegMeta.kind === "agent" ? "sparkle" : "filter"} size={10} />
                    {activeSegMeta.label}
                    {!segHasMembers && <span className="cl-seg-filter-note">preview — open in Segments for members</span>}
                    <button className="cl-seg-filter-x" title="Clear segment filter" onClick={() => setSegment(null)}>
                      <Icon name="x" size={9} />
                    </button>
                    <button className="cl-seg-filter-open" title="Open in Segments" onClick={() => window.CHANLY.nav(CHANLY.R.segment(activeSegMeta.id))}>
                      <Icon name="external" size={9} />
                    </button>
                  </span>
                )}
              </div>
              <div className="cl-tabs">
                {["all", "needs-you", "drifting", "champion", "new"].map(t => (
                  <button
                    key={t}
                    className={`cl-tab ${tab === t ? "active" : ""}`}
                    onClick={() => setTab(t)}
                  >
                    {t === "all" ? "All" : t === "needs-you" ? "Needs you" : t === "champion" ? "Champions" : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <ClientsTable
            clients={tabbed}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={onSort}
            selected={selected}
            onToggle={onToggle}
            onOpen={onOpenProfile}
            onClearFilters={() => { setClQuery(""); setTab("all"); setSegment(null); }}
          />

          {selected.size > 0 && (
            <div className="cl-bulkbar" role="toolbar" aria-label="Bulk actions">
              {flash ? (
                <span className="cl-bulkbar-flash">
                  <Icon name="check" size={12} />{flash}
                  <button className="cl-bulkbar-undo" onClick={bulkUndo}>Undo</button>
                </span>
              ) : (
                <>
                  <span className="cl-bulkbar-count tabular">{selected.size} selected</span>
                  <span className="cl-bulkbar-sep" />
                  <div className="more-wrap">
                    <button className="btn btn-sm" onClick={() => setBulkMenu(m => m === "segment" ? null : "segment")}>
                      <Icon name="filter" size={12} /> Add to segment <Icon name="chevron-down" size={10} />
                    </button>
                    {bulkMenu === "segment" && (
                      <>
                        <div className="more-backdrop" onClick={() => setBulkMenu(null)} />
                        <div className="more-menu cl-bulkbar-menu" role="menu">
                          <div className="more-header">Saved filters</div>
                          {CLIENT_SEGMENTS.filter(s => s.kind === "manual").map(s => (
                            <button key={s.id} className="more-item" role="menuitem" onClick={() => bulkFlash(`Added ${selected.size} to “${s.label}”`)}>
                              <Icon name="filter" size={12} /><span className="more-item-label">{s.label}</span>
                            </button>
                          ))}
                          <button className="more-item" role="menuitem" onClick={() => { setBulkMenu(null); window.CHANLY.nav("segments"); setTimeout(() => window.dispatchEvent(new CustomEvent("segments:new")), 450); }}>
                            <Icon name="plus" size={12} /><span className="more-item-label">New segment…</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="more-wrap">
                    <button className="btn btn-sm" onClick={() => setBulkMenu(m => m === "agent" ? null : "agent")}>
                      <Icon name="agents" size={12} /> Assign agent <Icon name="chevron-down" size={10} />
                    </button>
                    {bulkMenu === "agent" && (
                      <>
                        <div className="more-backdrop" onClick={() => setBulkMenu(null)} />
                        <div className="more-menu cl-bulkbar-menu" role="menu">
                          <div className="more-header">Work these {selected.size} clients</div>
                          {((window.FLEET_DATA && window.FLEET_DATA.FLEET_ROSTER) || []).map(a => (
                            <button key={a.id} className="more-item" role="menuitem" onClick={() => bulkFlash(`${a.name} will review ${selected.size} clients — plan lands in your Inbox`)}>
                              <span className="agent-avatar" style={{ width: 16, height: 16, fontSize: 8.5 }}>{a.glyph}</span>
                              <span className="more-item-label">{a.name}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <button className="btn btn-sm" onClick={() => window.CHANLY.nav("broadcasts")}>
                    <Icon name="wave" size={12} /> Broadcast
                  </button>
                  <button className="btn btn-sm" onClick={() => bulkFlash(`Exported ${selected.size} rows to CSV`)}>
                    <Icon name="external" size={12} /> Export
                  </button>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelected(new Set())} title="Clear selection" aria-label="Clear selection">
                    <Icon name="x" size={12} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ====== Real branch — People · Clients on the workspace's actual contacts ======
// Same markup and classes as the seeded page above; every number is a column
// fact from window.__PEOPLE, fed by the People override on the SurfaceData
// seam and derived by the tested rule in contracts. Nothing here scores,
// estimates or invents: no health, no LTV, no visits, no therapist.

const PL_TABS = ["needs_you", "waiting_on_you", "new", "quiet", "active"];
const PL_TAB_LABEL = { all: "All", needs_you: "Needs you", waiting_on_you: "Waiting on you", new: "New", quiet: "Quiet", active: "Active" };
const PL_TAB_SUB = {
  needs_you: "The receptionist stopped and is waiting for a person",
  waiting_on_you: "You own the thread and they wrote last",
  new: "First contact within 7 days, by evidence",
  quiet: "Nothing heard in 30 days",
  active: "Answered and current",
};
const PL_PILL = { needs_you: "b-needs-you", waiting_on_you: "b-drifting", new: "b-new", quiet: "b-steady", active: "b-champion", opted_out: "b-steady" };
const PL_LIST_TIP = {
  needs_you: "An open escalation, or a thread waiting for a person",
  waiting_on_you: "You took over and they wrote last",
  new_week: "First contact in the last 7 days, by evidence — imported history never counts",
  quiet: "No message or call in 30 days",
  phoned_only: "Only ever phoned — no WhatsApp thread",
  opted_in: "Said yes to offers by WhatsApp — the only people a broadcast may reach",
  opted_out: "Asked to stop; the receptionist stays silent",
  booked: "An appointment ahead on your calendar — the booking is the conversion",
  booked_week: "An appointment in the next seven days",
  asked_never_booked: "Wrote or called in the last 30 days, and your calendar has never had them — the people you can still win",
  lapsed: "Forty-five days or more since their last visit, nothing ahead — the win-back list, from visits rather than silence",
};

// What the page remembers between visits: the sort, the attention tab, the strip.
const PL_VIEW_KEY = "chanlytics-people-view";
const plLoadView = () => {
  try { return { ...JSON.parse(localStorage.getItem(PL_VIEW_KEY) || "{}") }; } catch { return {}; }
};
const plSaveView = (v) => { try { localStorage.setItem(PL_VIEW_KEY, JSON.stringify(v)); } catch { /* private mode */ } };
// A selection as a CSV, in the columns the page shows — nothing the schema does not hold.
const plCsv = (rows) => {
  const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const head = ["Name", "Phone", "State", "Last contact", "Consent", "Next visit", "First contact"];
  const lines = rows.map((p) => [p.name, p.phone || "", p.stateLabel, p.lastContact.label, p.consent.label, p.nextVisit || "", p.firstContact.label].map(esc).join(","));
  return [head.map(esc).join(","), ...lines].join("\r\n");
};
const plDownload = (name, text) => {
  const blob = new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
// The receptionist, in one word beside the state, only when it is not simply answering.
const PL_RECEPT_MARK = { escalated: "escalated", queued: "reply queued", snoozed: "snoozed", paused: "held for you", silent: "silent" };

const plAgo = (ms) => {
  const diff = Math.max(0, Date.now() - ms);
  if (diff < 3600000) return `${Math.max(1, Math.round(diff / 60000))}m`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h`;
  return `${Math.round(diff / 86400000)}d`;
};

// A stable empty list, so a workspace without saved lists does not re-run the
// table's memo on every render.
const PL_NO_LISTS = [];

const usePeople = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:clients", bump);
    return () => window.removeEventListener("surface:clients", bump);
  }, []);
  return window.__PEOPLE;
};

const PeopleStatePill = ({ state, label }) => (
  <span className={`cl-row-bucket-pill ${PL_PILL[state] || "b-steady"}`}>{label}</span>
);

const PeopleChannels = ({ channels }) => (
  <span className="cl-row-channels">
    {channels.map((ch, i) => <ChannelGlyph key={ch} kind={ch === "voice" ? "phone" : "chat"} primary={i === 0} size={11} />)}
  </span>
);

const PeopleReceptionist = ({ r }) => (
  <span className={`cl-row-agent ${r.tone === "escalated" ? "escalated" : r.tone === "queued" ? "approval" : ""}`}>
    <span className="agent-avatar">W</span>
    {r.tone === "queued" && <span className="live-dot" />}
    <span className="cl-row-agent-verb">{r.label}</span>
  </span>
);

// A list kept by hand, named on the rail. The name is the only thing typed
// here; people join from their profile. The POST answers before the rail
// re-reads the surface, so the new row is the server's.
const NewListRow = ({ onCreate }) => {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const close = () => { setOpen(false); setName(""); setError(null); };
  const submit = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true); setError(null);
    const r = await onCreate(n);
    setBusy(false);
    if (!r.ok) { setError(r.message || "Could not make the list."); return; }
    close();
  };
  if (!open) {
    return (
      <div className="cl-rail-foot">
        <button className="cl-rail-newseg" onClick={() => setOpen(true)} data-testid="new-list">
          <Icon name="plus" size={11} />
          New list
        </button>
      </div>
    );
  }
  return (
    <div className="cl-rail-foot">
      <div className="cl-rail-newlist">
        <input
          autoFocus
          value={name}
          placeholder="Name the list"
          maxLength={60}
          disabled={busy}
          data-testid="new-list-name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") close(); }}
        />
        <button className="btn btn-sm btn-primary" disabled={busy || !name.trim()} onClick={submit}>Add</button>
      </div>
      {error && <div className="cl-rail-hint" style={{ color: "var(--danger)" }}>{error}</div>}
    </div>
  );
};

// Deleting a list keeps the people; only the grouping goes. Asked once,
// inline, in the words that say so.
const DeleteListButton = ({ list, onDeleted }) => {
  const [arm, setArm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const go = async () => {
    if (!window.__lists || busy) return;
    setBusy(true);
    const r = await window.__lists.remove(list.id);
    setBusy(false);
    setArm(false);
    if (r.ok) onDeleted();
  };
  if (!arm) {
    return <button className="cl-bucket-link" style={{ marginLeft: 8 }} onClick={() => setArm(true)} data-testid="delete-list">Delete list…</button>;
  }
  return (
    <span className="cl-section-sub" style={{ marginLeft: 8 }}>
      Delete “{list.name}”? The people stay.{" "}
      <button className="cl-bucket-link" disabled={busy} onClick={go}>Yes, delete</button>{" "}
      <button className="cl-bucket-link" disabled={busy} onClick={() => setArm(false)}>No</button>
    </span>
  );
};

const PL_DEFAULT_GROUPS = [{ id: "attention", label: "Attention" }, { id: "journey", label: "Journey" }, { id: "reach", label: "Reach" }];

const PeopleRail = ({ lists, groups = PL_DEFAULT_GROUPS, active, onPick, saved = [], activeSaved = null, onPickSaved = () => {}, canEdit = false, onCreateList = null }) => (
  <aside className="cl-rail">
    <div className="cl-rail-section">
      <div className="cl-rail-label">
        <Icon name="sparkle" size={11} />
        Smart lists
      </div>
      {groups.map((g) => {
        const own = lists.filter((l) => (l.group || "reach") === g.id);
        if (own.length === 0) return null;
        return (
          <div key={g.id} className="cl-rail-group" data-testid={`rail-group-${g.id}`}>
            <div className="cl-rail-group-label">{g.label}</div>
            {own.map((l) => (
              <button key={l.id} className={`cl-rail-row smart ${active === l.id ? "active" : ""}`} onClick={() => onPick(l.id)} data-tip={PL_LIST_TIP[l.id] || null}>
                <span className="label">{l.label}</span>
                <span className="count">{l.count}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
    <div className="cl-rail-section" data-testid="saved-lists">
      <div className="cl-rail-label">Saved</div>
      {saved.map((s) => (
        <button key={s.id} className={`cl-rail-row ${activeSaved === s.id ? "active" : ""}`} onClick={() => onPickSaved(s.id)} data-tip="A list kept by hand — add people from their profile">
          <span className="label">{s.name}</span>
          <span className="count">{s.count}</span>
        </button>
      ))}
      {saved.length === 0 && (
        <div className="cl-rail-hint">No lists yet. Keep one by hand — a stylist's clients, the package holders — and add people from their profile.</div>
      )}
    </div>
    {canEdit && onCreateList && <NewListRow onCreate={onCreateList} />}
  </aside>
);

const PeopleDecisionRow = ({ p, onOpen }) => {
  const toInbox = p.threadId ? () => window.CHANLY.nav(window.CHANLY.R.thread(p.threadId)) : null;
  const cta = (p.state === "needs_you" || p.state === "waiting_on_you") && toInbox
    ? { label: "Open in Inbox", kind: "primary", go: toInbox }
    : { label: "Profile", kind: "ghost", go: () => onOpen(p.id) };
  const since = p.needsYouSinceMs ? ` · since ${plAgo(p.needsYouSinceMs)} ago` : "";
  return (
    <div className="cl-decision" onClick={() => onOpen(p.id)} role="button">
      <div className="cl-decision-l"><div className="cl-mini-avatar">{p.initials}</div></div>
      <div className="cl-decision-body">
        <div className="cl-decision-name">
          {p.name}
          <span className="cl-decision-meta"><span className="dim"> · {p.lastContact.label}</span></span>
        </div>
        <div className="cl-decision-narr">{p.quote ? `\u201c${p.quote}\u201d` : p.calls ? "Phoned — nothing written to quote" : "Nothing written yet"}</div>
        <div className={`cl-decision-agent ${p.receptionist.tone === "escalated" ? "escalated" : ""}`}>
          <span className="agent-avatar">W</span>
          <span className="cl-decision-agent-text">{p.receptionist.label}{since}</span>
        </div>
      </div>
      <button className={`cl-decision-cta ${cta.kind}`} onClick={(e) => { e.stopPropagation(); cta.go(); }}>{cta.label}</button>
    </div>
  );
};

const PeopleTriage = ({ rows, recency, attentionTab, setAttentionTab, onOpen, onSeeAll }) => {
  const counts = {};
  PL_TABS.forEach((t) => { counts[t] = rows.filter((r) => r.state === t).length; });
  const active = PL_TABS.includes(attentionTab) ? attentionTab : "needs_you";
  const shown = rows.filter((r) => r.state === active).slice(0, 3);
  return (
    <section className="cl-triage">
      {/* Five states on the seeded four-column strip would wrap the fifth. */}
      <div className="cl-triage-tabs" role="tablist" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {PL_TABS.map((t) => {
          const cells = (recency && recency[t]) || [];
          const max = Math.max(1, ...cells.map((c) => c.count));
          return (
            <button key={t} role="tab" aria-selected={t === active} className={`cl-triage-tab ${t === active ? "active" : ""} ${t === "needs_you" ? "accent" : ""}`} onClick={() => setAttentionTab(t)}>
              <div className="cl-triage-tab-row">
                <span className="cl-triage-tab-label">{PL_TAB_LABEL[t]}</span>
                <span className="cl-triage-tab-count">{counts[t]}</span>
              </div>
              <div className="cl-triage-tab-strip" data-tip="Days since last contact — most recent on the left">
                {cells.map((c, i) => (
                  <span key={c.label} className="cl-triage-cell" style={{ background: i < 3 ? "var(--ok)" : i < 5 ? "var(--warn)" : "var(--line-strong)", opacity: c.count ? 0.35 + 0.65 * (c.count / max) : 0.15 }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
      <div className="cl-triage-body">
        <div className="cl-triage-body-head">
          <div className="cl-triage-body-titles">
            <span className="cl-triage-body-title">{PL_TAB_LABEL[active]}</span>
            <span className="cl-triage-body-sub">{PL_TAB_SUB[active]}</span>
          </div>
          <div className="cl-triage-body-meta">
            <button className="cl-triage-seeall" onClick={() => onSeeAll(active)}>
              See all {counts[active]}
              <Icon name="arrow-right" size={10} />
            </button>
          </div>
        </div>
        <div className="cl-decision-grid">
          {shown.map((p) => <PeopleDecisionRow key={p.id} p={p} onOpen={onOpen} />)}
          {shown.length === 0 && <div className="cl-decision-empty">Nobody here right now.</div>}
        </div>
      </div>
    </section>
  );
};

// With a calendar connected the outcome takes the column the receptionist's
// state held: "Answering" on every row said nothing, the next visit does.
// The columns answer the three questions an owner brings to the page — who
// needs me, who is booked, who can I message. With a calendar connected the
// outcome takes the column the receptionist's state held ("Answering" on
// every row said nothing). Offers is the fact that gates every campaign.
// First contact lives in the identity cell now; the last column is the
// row's own actions, shown on hover.
const plCols = (withCalendar) => [
  { key: "name", label: "Client", sortable: true },
  { key: "state", label: "State", sortable: true },
  { key: "last", label: "Last contact", sortable: true },
  withCalendar ? { key: "visits", label: "Visits", sortable: true } : { key: "receptionist", label: "Receptionist", sortable: false },
  { key: "offers", label: "Offers", sortable: true },
  { key: "actions", label: "", sortable: false },
];
const PL_SORT_KEYS = ["last", "name", "state", "visits", "offers"];

const plIsNumber = (name) => /^[+\d(]/.test(name || "");
const plWhen = (iso) => { if (!iso) return undefined; const d = new Date(iso); return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); };
const PL_OFFERS = { opted_in: ["Yes", "yes"], opted_out: ["No", "no"], unknown: ["Not asked", "unasked"] };

// The row's own next steps, on hover: the thread, and the booking link when
// there is one — a reply carried in inside the 24-hour window, the template
// outside it. Nothing is sent from the row.
const PeopleRowActions = ({ p, bookingLink }) => {
  if (!p.threadId) return null;
  const open = () => window.CHANLY.nav(window.CHANLY.R.thread(p.threadId));
  const link = () => {
    if (p.replyWindow && p.replyWindow.open) {
      try { sessionStorage.setItem("chanlytics-compose", JSON.stringify({ threadId: p.threadId, text: `Here's the link to book your appointment: ${bookingLink}` })); } catch { /* nothing to carry */ }
    }
    open();
  };
  return (
    <span className="cl-row-actions" onClick={(e) => e.stopPropagation()}>
      <button className="cl-row-act" title="Open the thread" aria-label="Open the thread" onClick={open} data-testid="row-open-thread"><Icon name="chat" size={12} /></button>
      {bookingLink && (
        <button className="cl-row-act" title={p.replyWindow && p.replyWindow.open ? `Text the booking link · ${p.replyWindow.hoursLeft}h left in their reply window` : "Send the booking-link template — their reply window is closed"} aria-label="Booking link" onClick={link} data-testid="row-booking-link"><Icon name="calendar" size={12} /></button>
      )}
    </span>
  );
};

const PeopleTable = ({ rows, total, sortBy, sortDir, onSort, onOpen, filtered, onClearFilters, withCalendar = false, selectable = false, sel = PL_NO_SEL, onToggle = () => {}, onToggleAll = () => {}, cursor = null, bookingLink = null }) => (
  <div className={`cl-table-wrap ${sel.size ? "selecting" : ""}`}>
    <table className="cl-table">
      <thead>
        <tr>
          {selectable && (
            <th className="cl-sel">
              <input type="checkbox" className="cl-check" checked={rows.length > 0 && rows.every((p) => sel.has(p.id))} onChange={onToggleAll} aria-label="Select everyone shown" title="Select everyone shown" data-testid="select-all" />
            </th>
          )}
          {plCols(withCalendar).map((c) => (
            <th key={c.key} className={`${c.sortable ? "sortable" : ""} ${c.key === "actions" ? "cl-actions-head" : ""}`} onClick={() => c.sortable && onSort(c.key)} aria-sort={sortBy === c.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
              {c.label}
              {sortBy === c.key && <span className="sort-arr">{sortDir === "asc" ? "▲" : "▼"}</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const numbered = plIsNumber(p.name);
          const offers = PL_OFFERS[p.consent.state] || PL_OFFERS.unknown;
          return (
            <tr key={p.id} id={`person-${p.id}`} className={`${sel.has(p.id) ? "selected" : ""} ${cursor === p.id ? "focused" : ""}`} onClick={() => onOpen(p.id)}>
              {selectable && (
                <td className="cl-sel" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="cl-check" checked={sel.has(p.id)} onChange={() => onToggle(p.id)} aria-label={`Select ${p.name}`} data-testid="row-select" />
                </td>
              )}
              <td className="cl-name-cell">
                <div className="cl-row-name">
                  {numbered
                    ? <div className="ix-thread-avatar cl-row-avatar-glyph" title="No name yet"><Icon name="phone" size={12} /></div>
                    : <div className="ix-thread-avatar">{p.initials}</div>}
                  <div className="cl-row-name-block">
                    <div className="cl-row-fullname">
                      <span className={numbered ? "tabular" : ""}>{p.name}</span>
                      {numbered && <button className="cl-row-name-them" onClick={(e) => { e.stopPropagation(); onOpen(p.id); }} title="Give them a name on their profile" data-testid="row-name-them">Name them <Icon name="arrow-right" size={9} /></button>}
                    </div>
                    <div className="cl-row-meta">
                      <PeopleChannels channels={p.channels} />
                      {!numbered && p.phone && <><span className="dot" /><span className="tabular">{p.phone}</span></>}
                      {!numbered && p.waName && p.waName !== p.name && <><span className="dot" /><span title="Their name on WhatsApp">{p.waName} on WhatsApp</span></>}
                      <span className="dot" />
                      <span>{p.threads === 0 && p.calls === 0 ? "no messages yet" : `${p.threads} thread${p.threads === 1 ? "" : "s"}${p.calls ? ` · ${p.calls} call${p.calls === 1 ? "" : "s"}` : ""}`}</span>
                      {p.firstContact.label !== "—" && <><span className="dot" /><span title={p.firstContact.estimate ? "The earliest row we hold; the true first contact is earlier" : "First contact"}>since {p.firstContact.label.replace(/^Before /, "before ")}</span></>}
                    </div>
                  </div>
                </div>
              </td>
              <td className="shrink cl-state-cell">
                <PeopleStatePill state={p.state} label={p.stateLabel} />
                {withCalendar && p.receptionist.tone !== "answering" && <span className="cl-row-recept-mark" title={p.receptionist.label}>{PL_RECEPT_MARK[p.receptionist.tone] || p.receptionist.tone}</span>}
              </td>
              <td className="shrink dim cl-last-cell" title={plWhen(p.lastContact.at)}>{p.lastContact.label}</td>
              {withCalendar
                ? (
                  <td className="shrink cl-visits-cell" title={p.nextVisit || p.lastVisit || "Never on the calendar"} data-testid="row-next-visit">
                    {p.nextVisitDay
                      ? <><span className="cl-row-next">{p.nextVisitDay}</span><span className="dim"> · {(p.nextVisit || "").split(" · ")[1] || ""}</span></>
                      : p.lastVisitDay
                        ? <span className="cl-row-last-visit">Last · {p.lastVisitDay}</span>
                        : <span className="dim">—</span>}
                  </td>
                )
                : <td className="cl-recept-cell"><PeopleReceptionist r={p.receptionist} /></td>}
              <td className="shrink cl-offers-cell" title={p.consent.sub} data-testid="row-offers"><span className={`cl-row-offers ${offers[1]}`}>{offers[0]}</span></td>
              <td className="shrink cl-actions-cell"><PeopleRowActions p={p} bookingLink={bookingLink} /></td>
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr>
            <td colSpan={selectable ? 7 : 6}>
              <div className="cl-table-empty">
                <Icon name="search" size={15} />
                <span>{total === 0 ? "Nobody has written or phoned yet." : "No one matches this view."}</span>
                {total > 0 && filtered && (
                  <button className="cl-bucket-link" onClick={onClearFilters}>
                    Clear filters <Icon name="arrow-right" size={10} />
                  </button>
                )}
              </div>
            </td>
          </tr>
        )}
      </tbody>
    </table>
    <div className="cl-table-foot">
      <span>{filtered ? `Showing ${rows.length} of ${total}` : `${total} ${total === 1 ? "person" : "people"}`}</span>
      <span className="cl-table-keys"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>↵</kbd> opens · <kbd>space</kbd> selects · <kbd>/</kbd> searches</span>
    </div>
  </div>
);

const PL_NO_SEL = new Set();

// What a selection can become: people on a list, a yes on record, a file.
// Adding to a list and recording a yes are owner-or-operator on the server;
// the bar shows what the role allows and says why when it does not.
const PeopleBulkBar = ({ sel, rows, saved, canEdit, canExport, onClear, flash }) => {
  const [busy, setBusy] = React.useState(false);
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState("");
  const ids = [...sel];
  const picked = rows.filter((p) => sel.has(p.id));
  const run = async (fn, done) => {
    if (busy) return;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { flash({ msg: <>{r.message || "That did not go through."}</> }); return; }
    flash({ msg: done(r) });
  };
  const addTo = (list) => run(() => window.__lists.add(list.id, ids), () => <>{ids.length} added to <b>{list.name}</b></>);
  const createAndAdd = async () => {
    const n = name.trim();
    if (!n || busy || !window.__lists) return;
    setBusy(true);
    const c = await window.__lists.create(n);
    if (!c.ok) { setBusy(false); flash({ msg: <>{c.message || "Could not make the list."}</> }); return; }
    const made = ((window.__PEOPLE && window.__PEOPLE.saved) || []).find((s) => s.name === n);
    const a = made ? await window.__lists.add(made.id, ids) : { ok: false, message: "The list was made but not found again." };
    setBusy(false); setNaming(false); setName("");
    flash({ msg: a.ok ? <>{ids.length} on the new list <b>{n}</b></> : <>{a.message}</> });
  };
  const yes = (source) => run(
    () => window.__setPersonConsentMany(ids, { consent: "opted_in", source: source.id }),
    (r) => <>A yes on record for <b>{r.done}</b>{r.failed ? ` · ${r.failed} not recorded` : ""} · {source.label.toLowerCase()}</>,
  );
  const exportCsv = () => { plDownload(`people-${new Date().toISOString().slice(0, 10)}.csv`, plCsv(picked)); flash({ msg: <>{picked.length} exported as a CSV</> }); };
  const sources = (window.__consentSources || []).filter((s) => s.id !== "customer_message");
  return (
    <div className="cl-bulk" role="toolbar" aria-label="Selected people" data-testid="bulk-bar">
      <span className="cl-bulk-count"><b>{sel.size}</b> selected</span>
      {canEdit && window.__lists && !naming && (
        <MoreMenu
          btnClass="btn btn-sm"
          label="Add to list"
          title="Add to a list"
          gated={busy ? "One moment — the last change is still saving" : null}
          items={[
            { header: "Add to" },
            ...saved.map((s) => ({ label: s.name, icon: "filter", onClick: () => addTo(s) })),
            { label: "New list…", icon: "plus", onClick: () => setNaming(true) },
          ]}
        />
      )}
      {canEdit && naming && (
        <span className="cl-bulk-naming">
          <input autoFocus value={name} placeholder="Name the list" maxLength={60} disabled={busy} data-testid="bulk-list-name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createAndAdd(); if (e.key === "Escape") { setNaming(false); setName(""); } }} />
          <button className="btn btn-sm btn-primary" disabled={busy || !name.trim()} onClick={createAndAdd}>Make it</button>
        </span>
      )}
      {canEdit && window.__setPersonConsentMany && sources.length > 0 && (
        <MoreMenu
          btnClass="btn btn-sm"
          label="Record a yes"
          title="A yes to offers by WhatsApp — say how it was given"
          gated={busy ? "One moment — the last change is still saving" : null}
          items={[{ header: "They said yes…" }, ...sources.map((s) => ({ label: s.label, icon: "check", onClick: () => yes(s) }))]}
        />
      )}
      {canExport && <button className="btn btn-sm" disabled={busy} onClick={exportCsv} data-testid="bulk-export"><Icon name="external" size={12} /> Export CSV</button>}
      {!canEdit && <span className="cl-prof-aut-hint">Only an owner or operator can add to lists or record a yes.</span>}
      <button className="btn btn-ghost btn-sm" onClick={onClear} data-testid="bulk-clear"><Icon name="x" size={11} /> Clear</button>
    </div>
  );
};

// Everyone shown, kept as a list by hand — a filter frozen into something a broadcast can reach later.
const SaveShownAsList = ({ ids, suggested, flash }) => {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    const n = name.trim();
    if (!n || busy || !window.__lists) return;
    setBusy(true);
    const c = await window.__lists.create(n);
    if (!c.ok) { setBusy(false); flash({ msg: <>{c.message || "Could not make the list."}</> }); return; }
    const made = ((window.__PEOPLE && window.__PEOPLE.saved) || []).find((s) => s.name === n);
    const a = made ? await window.__lists.add(made.id, ids) : { ok: false, message: "The list was made but not found again." };
    setBusy(false); setOpen(false); setName("");
    flash({ msg: a.ok ? <>{ids.length} kept as <b>{n}</b></> : <>{a.message}</> });
  };
  if (!open) return <button className="cl-bucket-link" onClick={() => { setName(suggested || ""); setOpen(true); }} data-testid="save-shown">Save these {ids.length} as a list <Icon name="arrow-right" size={10} /></button>;
  return (
    <span className="cl-bulk-naming">
      <input autoFocus value={name} placeholder="Name the list" maxLength={60} disabled={busy} data-testid="save-shown-name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setOpen(false); }} />
      <button className="btn btn-sm btn-primary" disabled={busy || !name.trim()} onClick={submit}>Keep it</button>
      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
};

const ClientsAReal = ({ onOpenProfile = () => {}, initialSegment = null, initialSaved = null, initialState = null }) => {
  const people = usePeople();
  const rows = people.rows;
  const lists = people.lists;
  const agg = people.aggregates;
  const withCalendar = !!(people.calendar && people.calendar.state === "ok");
  const listFor = (id) => (id && lists.some((l) => l.id === id) ? id : null);
  const [listId, setListId] = useState(listFor(initialSegment));
  React.useEffect(() => { setListId(listFor(initialSegment)); }, [initialSegment]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = people.saved || PL_NO_LISTS;
  const [savedId, setSavedId] = useState(initialSaved);
  React.useEffect(() => { setSavedId(initialSaved); }, [initialSaved]);
  const canEditLists = !!(window.__ME && (window.__ME.role === "owner" || window.__ME.role === "operator"));
  const canExport = !!(window.__scoped && (!window.canDo || window.canDo("export")));
  const [toastNode, plFlash] = window.usePPToast();
  // The selection, by id. Cleared when the view changes: a bar counting people
  // that are no longer on screen is the kind of bug bulk actions are made of.
  const [sel, setSel] = useState(() => new Set());
  const toggleSel = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const remembered = React.useMemo(plLoadView, []);
  const [tab, setTab] = useState(initialState && PL_TABS.includes(initialState) ? initialState : "all");
  React.useEffect(() => { if (initialState && PL_TABS.includes(initialState)) setTab(initialState); }, [initialState]);
  const [attentionTab, setAttentionTab] = useState(PL_TABS.includes(remembered.attentionTab) ? remembered.attentionTab : "needs_you");
  const [showTriage, setShowTriage] = useState(remembered.showTriage !== false);
  const [sortBy, setSortBy] = useState(PL_SORT_KEYS.includes(remembered.sortBy) ? remembered.sortBy : "last");
  const [sortDir, setSortDir] = useState(remembered.sortDir === "asc" ? "asc" : "desc");
  React.useEffect(() => { plSaveView({ attentionTab, showTriage, sortBy, sortDir }); }, [attentionTab, showTriage, sortBy, sortDir]);
  // The view in the address, so a list or a state can be sent to someone —
  // the assistant and Today link here. Replaced, never pushed: Back leaves People.
  React.useEffect(() => {
    const cur = (window.location.hash || "").replace(/^#\/?/, "");
    if (!cur.startsWith("clients")) return;
    if (/^clients\/(?!seg:|list:|state:)./.test(cur)) return;
    const want = listId ? `seg:${listId}` : savedId ? `list:${savedId}` : tab !== "all" ? `state:${tab}` : "";
    const next = want ? `#/clients/${want}` : "#/clients";
    if (window.location.hash !== next) window.history.replaceState(null, "", next);
  }, [listId, savedId, tab]);
  const [q, setQ] = useState("");
  const searchRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const tableRef = React.useRef(null);

  useHotkey(
    (e, typing) => !typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === "/",
    () => searchRef.current && searchRef.current.focus()
  );

  const seeAll = (id) => {
    setTab(id);
    setAttentionTab(id);
    const sc = scrollRef.current, el = tableRef.current;
    if (sc && el) sc.scrollTo({ top: Math.max(0, el.offsetTop - 12), behavior: "smooth" });
  };
  const onSort = (key) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir(key === "name" || key === "visits" ? "asc" : "desc"); }
  };

  const shown = useMemo(() => {
    let list = rows;
    if (tab !== "all") list = list.filter((p) => p.state === tab);
    if (listId) {
      const l = lists.find((x) => x.id === listId);
      const ids = new Set(l ? l.ids : []);
      list = list.filter((p) => ids.has(p.id));
    }
    if (savedId) {
      const s = saved.find((x) => x.id === savedId);
      const ids = new Set(s ? s.ids : []);
      list = list.filter((p) => ids.has(p.id));
    }
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    if (needle) {
      // The name, the number, their name on WhatsApp — and the words on the
      // row: their last message and their visits, so "balayage" finds people.
      list = list.filter((p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.waName || "").toLowerCase().includes(needle) ||
        (digits.length >= 3 && (p.phone || "").replace(/\D/g, "").includes(digits)) ||
        (p.quote || "").toLowerCase().includes(needle) ||
        (p.nextVisit || "").toLowerCase().includes(needle) ||
        (p.lastVisit || "").toLowerCase().includes(needle)
      );
    }
    const order = { needs_you: 0, waiting_on_you: 1, opted_out: 2, new: 3, quiet: 4, active: 5 };
    return [...list].sort((a, b) => {
      let av, bv;
      switch (sortBy) {
        case "name": av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case "state": av = order[a.state]; bv = order[b.state]; break;
        // Ahead first (soonest), then the most recent visit, then never.
        case "visits": { const none = sortDir === "asc" ? Infinity : -Infinity; av = a.nextVisitMs ?? (a.lastVisitMs !== null ? 1e15 + (1e15 - a.lastVisitMs) : none); bv = b.nextVisitMs ?? (b.lastVisitMs !== null ? 1e15 + (1e15 - b.lastVisitMs) : none); break; }
        case "offers": { const rank = { opted_in: 0, unknown: 1, opted_out: 2 }; av = rank[a.consent.state] ?? 1; bv = rank[b.consent.state] ?? 1; if (av === bv) { av = a.lastContact.ts ?? -Infinity; bv = b.lastContact.ts ?? -Infinity; } break; }
        default: av = a.lastContact.ts ?? -Infinity; bv = b.lastContact.ts ?? -Infinity;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, lists, saved, tab, listId, savedId, q, sortBy, sortDir]);

  const sortLabels = {
    last: ["Latest contact first", "Oldest contact first"],
    first: ["Newest people first", "Oldest people first"],
    name: ["Z → A", "A → Z"],
    state: ["By state", "By state · reversed"],
    visits: ["Latest visit first", "Soonest visit first"],
    offers: ["Said no first", "Said yes first"],
  };
  const sortLabel = (sortLabels[sortBy] || ["Sorted", "Sorted"])[sortDir === "desc" ? 0 : 1];
  const activeList = listId && lists.find((l) => l.id === listId);
  const activeSaved = savedId && saved.find((s) => s.id === savedId);
  const filtered = tab !== "all" || !!listId || !!savedId || !!q.trim();
  React.useEffect(() => { setSel(new Set()); }, [tab, listId, savedId, q]);
  const shownIds = shown.map((p) => p.id);
  // A keyboard walks the rows like the Inbox walks threads: ↑ ↓ move, Enter
  // opens, Space selects. Never while typing, never with a modifier.
  const [cursor, setCursor] = useState(null);
  React.useEffect(() => { setCursor((c) => (c && shownIds.includes(c) ? c : null)); }, [shownIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey || !shownIds.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => {
          const i = c ? shownIds.indexOf(c) : -1;
          const next = e.key === "ArrowDown" ? Math.min(shownIds.length - 1, i + 1) : Math.max(0, i - 1);
          const id = shownIds[next];
          const row = document.getElementById(`person-${id}`);
          if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
          return id;
        });
      } else if (e.key === "Enter" && cursor) { e.preventDefault(); onOpenProfile(cursor); }
      else if (e.key === " " && cursor && (canEditLists || canExport)) { e.preventDefault(); toggleSel(cursor); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleAll = () => setSel((s) => (shownIds.length && shownIds.every((id) => s.has(id)) ? new Set() : new Set(shownIds)));
  const ws = (window.__WORKSPACES || []).find((w) => w.id === window.__ACTIVE_WORKSPACE) || (window.__WORKSPACES || [])[0];
  const fetched = people.fetchedAt ? new Date(people.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="clients">
      <PeopleRail
        lists={lists}
        groups={people.groups || PL_DEFAULT_GROUPS}
        active={listId}
        onPick={(id) => setListId((cur) => (cur === id ? null : id))}
        saved={saved}
        activeSaved={savedId}
        onPickSaved={(id) => setSavedId((cur) => (cur === id ? null : id))}
        canEdit={canEditLists}
        onCreateList={window.__lists ? (name) => window.__lists.create(name) : null}
      />

      <div className="cl-main">
        <div className="cl-main-scroll" ref={scrollRef}>
          <div className="cl-head">
            <div className="cl-head-titles">
              <div className="cl-page-title">Clients</div>
              <div className="cl-page-sub">
                Everyone who has written to or phoned {ws ? ws.name : "your business"}. The receptionist handles the routine — these lists show where you matter.
              </div>
            </div>
            <StatStrip className="cl-head-stats">
              <StatCell label="People" value={agg.total} meta={agg.newThisMonth ? `+${agg.newThisMonth} this month` : "none new this month"} metaTone={agg.newThisMonth ? "pos" : ""} />
              <StatCell label="Needs you" value={agg.needsYou} meta={agg.needsYouOldestMs ? `oldest ${plAgo(agg.needsYouOldestMs)}` : "nobody waiting"} metaTone={agg.needsYou ? "neg" : ""} />
              <StatCell label="Reached this week" value={agg.reachedWeek} meta={`${agg.reachedWeekNew} new`} />
              {people.calendar && people.calendar.state === "ok" && (
                <StatCell label="Booked" tip="An appointment ahead on your calendar. The booking is the conversion Chanlytics counts" value={agg.booked} meta={agg.askedNotBooked ? `${agg.askedNotBooked} never booked` : "everyone who asked"} metaTone={agg.askedNotBooked ? "neg" : ""} />
              )}
            </StatStrip>
          </div>

          <div className="cl-controls">
            <div className="cl-search-wrap">
              <Icon name="search" size={13} />
              <input ref={searchRef} placeholder="Search by name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
              <span className="kbd">/</span>
            </div>
            <div className="cl-controls-right">
              {/* Everyone as a CSV, from the route: owner only, and the button
                  says so for anyone else instead of leading to a refusal. */}
              {window.__scoped && (
                window.canDo && !window.canDo("export")
                  ? <button className="btn btn-ghost btn-sm" disabled title={window.gateTitle("export")}><Icon name="external" size={12} /> Export CSV</button>
                  : <a className="btn btn-ghost btn-sm" href={window.__scoped("/api/v1/contacts/export")} download title="Download everyone as a CSV file"><Icon name="external" size={12} /> Export CSV</a>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
                <Icon name="sort" size={12} /> {sortLabel}
              </button>
            </div>
          </div>

          <div className="cl-buckets">
            <div className="cl-buckets-head">
              <div>
                <span className="cl-buckets-title">Where your attention matters</span>
                {fetched && <span className="cl-buckets-sub" style={{ marginLeft: 10 }}>Updated {fetched}</span>}
              </div>
              <button className="cl-buckets-toggle" onClick={() => setShowTriage((v) => !v)}>
                <Icon name="eye" size={11} />
                {showTriage ? "Hide" : "Show"}
              </button>
            </div>
            {showTriage && (
              <PeopleTriage rows={rows} recency={people.recency} attentionTab={attentionTab} setAttentionTab={(id) => { setAttentionTab(id); setTab(id); }} onOpen={onOpenProfile} onSeeAll={seeAll} />
            )}
          </div>

          <div className="cl-section" ref={tableRef}>
            <div className="cl-section-head">
              <div>
                <span className="cl-section-title">All clients</span>
                <span className="cl-section-sub" style={{ marginLeft: 10 }}>{shown.length} shown</span>
                {activeList && (
                  <span className="cl-seg-filter">
                    <Icon name="sparkle" size={10} />
                    {activeList.label}
                    <button className="cl-seg-filter-x" title="Clear list filter" onClick={() => setListId(null)}>
                      <Icon name="x" size={9} />
                    </button>
                  </span>
                )}
                {activeSaved && (
                  <span className="cl-seg-filter" data-testid="saved-filter">
                    <Icon name="filter" size={10} />
                    {activeSaved.name}
                    <button className="cl-seg-filter-x" title="Clear list filter" onClick={() => setSavedId(null)}>
                      <Icon name="x" size={9} />
                    </button>
                  </span>
                )}
                {activeSaved && canEditLists && <DeleteListButton list={activeSaved} onDeleted={() => setSavedId(null)} />}
                {tab !== "all" && (
                  <span className="cl-seg-filter" data-testid="state-filter">
                    <Icon name="filter" size={10} />
                    {PL_TAB_LABEL[tab]}
                    <button className="cl-seg-filter-x" title="Show everyone" onClick={() => setTab("all")}>
                      <Icon name="x" size={9} />
                    </button>
                  </span>
                )}
              </div>
              <span className="cl-section-sub">
                {filtered && shown.length > 0 && canEditLists && window.__lists
                  ? <SaveShownAsList ids={shownIds} suggested={activeList ? activeList.label : activeSaved ? `${activeSaved.name} copy` : tab !== "all" ? PL_TAB_LABEL[tab] : ""} flash={plFlash} />
                  : (filtered ? "Filtered from the rail and the strip above" : "The rail and the strip above narrow this")}
              </span>
            </div>
            {activeList && activeList.action && (
              <div className="cl-list-action" data-testid="list-action">
                <span className="cl-list-action-text">{activeList.action.text}</span>
                <button className={`btn btn-sm ${activeList.action.enabled ? "btn-primary" : ""}`} disabled={!activeList.action.enabled} onClick={() => window.CHANLY.nav(activeList.action.to)}>
                  {activeList.action.cta} <Icon name="arrow-right" size={10} />
                </button>
              </div>
            )}
          </div>

          <PeopleTable
            withCalendar={withCalendar}
            selectable={canEditLists || canExport}
            sel={sel}
            onToggle={toggleSel}
            onToggleAll={toggleAll}
            cursor={cursor}
            bookingLink={people.bookingLink || null}
            rows={shown}
            total={rows.length}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={onSort}
            onOpen={onOpenProfile}
            filtered={filtered}
            onClearFilters={() => { setQ(""); setTab("all"); setListId(null); setSavedId(null); }}
          />
        </div>
        {sel.size > 0 && <PeopleBulkBar sel={sel} rows={rows} saved={saved} canEdit={canEditLists} canExport={canExport} onClear={() => setSel(new Set())} flash={plFlash} />}
        {toastNode}
      </div>
    </div>
  );
};

// A real workspace renders its own people; the seeded page keeps the demo.
const ClientsA = (props) => (window.__PEOPLE ? <ClientsAReal {...props} /> : <ClientsASeed {...props} />);

window.ClientsA = ClientsA;
