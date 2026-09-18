/* global React, Icon, CLIENTS, CLIENT_BUCKETS, CLIENT_SEGMENTS, CLIENTS_AGGREGATES,
   ChannelGlyph, TempBar, ClientTag, AgentChip, BucketPill, FailedRead */
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
    <div className="cl-decision" onClick={() => onOpen(c.id)} onPointerEnter={() => window.__warmPerson && window.__warmPerson(c.id)} role="button">
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
            <EmptyState kind="line" className="empty-center" title="Nobody in this bucket right now." />
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
              onPointerEnter={() => window.__warmPerson && window.__warmPerson(c.id)}
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
                <EmptyState kind="line" className="empty-center" glyph="search" title="No clients match this view." action={{ label: "Clear filters", onClick: onClearFilters }} />
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
              <input ref={searchRef} placeholder="Search by name, tag, staff…" value={clQuery} onChange={(e) => setClQuery(e.target.value)} />
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

const PL_LIST_TIP = {
  needs_you: "An open escalation, or a thread waiting for a person",
  waiting_on_you: "You took over and they wrote last",
  new_week: "First contact in the last 7 days, by evidence — imported history never counts",
  quiet: "No message or call in 30 days",
  phoned_only: "Only ever phoned — no WhatsApp thread",
  opted_in: "Said yes to hearing from you — replies and messages about their own visit",
  offers_ok: "Said yes to OFFERS, separately — the only people a promotional broadcast may reach",
  opted_out: "Asked to stop; the receptionist stays silent, offers included",
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
// The workspace's copy of the view, one save at a time. Each save replaces the member's whole view (member_view_set),
// and two in flight could land out of order and leave the older one on the row: while one is out, only the latest view
// waits, and it goes when that one lands. A save that fails is tried once more, unless a newer view is waiting, which
// carries every key anyway: a timeout dropped the last change.
const plViewSaver = () => {
  let busy = false;
  let next = null;
  const push = (view, retried = false) => {
    if (busy) { next = view; return; }
    // No door to save through: nothing goes, and nothing is left waiting on a save that never lands.
    if (typeof window.__saveView !== "function") return;
    busy = true;
    const landed = (r) => {
      busy = false;
      const waiting = next;
      next = null;
      if (waiting) push(waiting);
      else if (!(r && r.ok) && !retried) push(view, true);
      else if (!(r && r.ok)) console.error("people_view_not_saved", r && r.message);
    };
    window.__saveView("people", view).then(landed, (e) => landed({ ok: false, message: e && e.message }));
  };
  return push;
};
// A selection as a CSV, in the columns the page shows — nothing the schema does not hold.
// The "Offers" column reads the OFFERS answer. It read `consent.state` -- the
// conversational one -- so the column titled Offers showed Yes for everybody who
// had ever texted START, and the composer then refused every one of them.
const PL_OFFERS = { opted_in: ["Yes", "yes"], opted_out: ["No", "no"], unknown: ["Not asked", "unasked"] };
const plCsv = (rows) => {
  const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  // Both answers, because "Consent" alone cannot say which one it means -- and the
  // one an audit asks about is the offers column, which this file did not carry.
  const head = ["Name", "Phone", "Email", "State", "Last contact", "Consent", "Offers", "Next visit", "First contact"];
  const lines = rows.map((p) => [p.name, p.phone || "", p.email || "", p.stateLabel, p.lastContact.label, p.consent.label, (PL_OFFERS[p.consent.marketing] || PL_OFFERS.unknown)[0], p.nextVisit || "", p.firstContact.label].map(esc).join(","));
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

// The person's state as the one pill draws it (contracts/tone.ts): the
// mockup's four-colour class family is the seed's alone now.
const PeopleStatePill = ({ state, label }) => <StatePill kind="person" value={state} label={label} />;

const PeopleChannels = ({ channels }) => (
  <span className="cl-row-channels">
    {/* The wire's own glyph. It was voice -> phone and everything else -> chat, so an email-only person wore WhatsApp's bubble. */}
    {channels.map((ch, i) => <ChannelGlyph key={ch} kind={ch === "voice" ? "phone" : ch} primary={i === 0} size={11} />)}
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
// re-reads the surface, so the new row is the server's. `openSignal` opens the
// box from outside: the shell's and a profile's "New list" (segments:new).
const NewListRow = ({ onCreate, openSignal = 0 }) => {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  React.useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
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
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "new-list-error" : undefined}
          data-testid="new-list-name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") close(); }}
        />
        <button className="btn btn-sm btn-primary" disabled={busy || !name.trim()} onClick={submit} data-testid="new-list-add">Add</button>
      </div>
      <window.FieldError id="new-list-error" message={error} testid="new-list-error" />
    </div>
  );
};

// Deleting a list keeps the people; only the grouping goes. Asked once,
// inline, in the words that say so. A refusal keeps the question open and
// says why: it used to close with no word, the list still on screen.
const DeleteListButton = ({ list, onDeleted }) => {
  const [arm, setArm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const go = async () => {
    if (!window.__lists || busy) return;
    setBusy(true);
    setError(null);
    const r = await window.__lists.remove(list.id);
    setBusy(false);
    if (!r.ok) { setError(r.message || "The list could not be deleted."); return; }
    setArm(false);
    onDeleted();
  };
  if (!arm) {
    return <button className="cl-bucket-link danger" style={{ marginLeft: 8 }} onClick={() => { setError(null); setArm(true); }} data-testid="delete-list">Delete list…</button>;
  }
  return (
    <span style={{ marginLeft: 8 }}>
      <Confirm question={`Delete “${list.name}”?`} detail="The people stay." yes="Yes, delete" danger busy={busy} error={error} onYes={go} onNo={() => { setArm(false); setError(null); }} testid="delete-list" />
    </span>
  );
};

// A list kept by hand is named where it is shown: the title turns into the box, Enter saves, Escape leaves.
// Lists had a Rename button of its own; here the list IS the page's title while it is open.
const ListTitle = ({ list, canEdit, onRenamed }) => {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const save = async () => {
    const n = name.trim();
    if (!n || busy || !window.__lists) return;
    if (n === list.name) { setEditing(false); return; }
    setBusy(true); setError(null);
    const r = await window.__lists.rename(list.id, n);
    setBusy(false);
    if (!r.ok) { setError(r.message || "Could not rename the list."); return; }
    setEditing(false);
    onRenamed(n);
  };
  if (!editing) {
    return (
      <span className="cl-section-title" data-testid="saved-filter">
        <Icon name="filter" size={12} />
        {list.name}
        {canEdit && (
          <button type="button" className="cl-list-rename" title="Rename the list" aria-label="Rename the list" onClick={() => { setName(list.name); setError(null); setEditing(true); }} data-testid="list-rename">
            <Icon name="edit" size={11} />
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="cl-bulk-naming cl-list-renaming" data-testid="saved-filter">
      <input
        autoFocus
        value={name}
        maxLength={60}
        disabled={busy}
        aria-label="The list's name"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "list-rename-error" : undefined}
        data-testid="list-rename-name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
      />
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
      <button type="button" className="btn btn-sm btn-primary" disabled={busy || !name.trim()} onClick={save} data-testid="list-rename-save">{busy ? "Saving…" : "Save"}</button>
      <window.FieldError id="list-rename-error" message={error} testid="list-rename-error" />
    </span>
  );
};

// On a phone the rail is not drawn, so its lists come up behind one tap on the standing line, as a sheet: the
// same rows, the same counts and the same New list, and a pick closes it. They were a Lists tab of their own,
// with a chip row above a second table of the same people.
const PeopleListsSheet = ({ onClose, children }) => {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="sb-sheet-backdrop" onClick={onClose} />
      <div className="sb-sheet pl-sheet" role="dialog" aria-label="Lists" data-testid="people-lists-sheet">
        <div className="sb-sheet-head">
          <span className="sb-sheet-title">Lists</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} data-testid="people-lists-close">Done</button>
        </div>
        {children}
      </div>
    </>
  );
};

// Where a list's own route lands now that Lists is a view of People: the list, picked, by its kind. A link that
// named the old page (Playbooks' list, an answer's jump, an address someone kept) still arrives. The shell asks.
const plListRoute = (id) => {
  const people = window.__PEOPLE;
  if (!id || !people) return "clients";
  if ((people.saved || []).some((s) => s.id === id)) return `clients/list:${id}`;
  if ((people.lists || []).some((l) => l.id === id)) return `clients/seg:${id}`;
  return "clients";
};
window.__listRoute = plListRoute;

const PL_DEFAULT_GROUPS = [{ id: "attention", label: "Attention" }, { id: "journey", label: "Journey" }, { id: "reach", label: "Reach" }];

const PeopleRail = ({ lists, groups = PL_DEFAULT_GROUPS, active, onPick, saved = [], savedRead = true, activeSaved = null, onPickSaved = () => {}, canEdit = false, onCreateList = null, newListSignal = 0 }) => (
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
      {/* Lists that could not be read are not "no lists": the read failed, and the people above stand. */}
      {!savedRead && <FailedRead kind="line" what="your saved lists" surface="people" testid="people-lists-failed" />}
      {saved.map((s) => (
        <button key={s.id} className={`cl-rail-row ${activeSaved === s.id ? "active" : ""}`} onClick={() => onPickSaved(s.id)} data-tip="A list kept by hand — add people from their profile">
          <span className="label">{s.name}</span>
          <span className="count">{s.count}</span>
        </button>
      ))}
      {savedRead && saved.length === 0 && (
        <div className="cl-rail-hint">No lists yet. Keep one by hand — regulars, one staff member's customers, a special group — and add people from their profile.</div>
      )}
    </div>
    {canEdit && onCreateList && <NewListRow onCreate={onCreateList} openSignal={newListSignal} />}
  </aside>
);

// One line above the table: how many people there are, how many need a person, and how many were reached this
// week -- and the middle one is the tap that shows them. It replaces a page title under a top bar that already
// says People, two sentences explaining the page, four stat cards, and a 320px strip of five tabs and three rows.
// The strip drew the same two people the table's own first rows drew, with the same sentences; "Needs you" was
// said in four places at once (the rail, a stat card, a tab, and every matching row's pill). Every number it
// held is still on the page: the rail counts each state, and each row says its own.
// On a phone, where the rail is not drawn, the line also holds the way to the lists: one word, or the name of
// the list that is open, and a tap brings the rail up as a sheet. Hidden on a desktop, whose rail is beside it.
const PeopleStanding = ({ agg, needsShown, onNeeds, onLists = null, listWord = null }) => (
  <div className="pl-standing" data-testid="people-standing">
    <span className="pl-standing-total">{agg.total.toLocaleString()} {agg.total === 1 ? "person" : "people"}</span>
    {agg.needsYou > 0 && (
      <span className="pl-standing-part">
        <span className="pl-standing-dot" aria-hidden="true">·</span>
        <button
          type="button"
          className={`pl-standing-needs ${needsShown ? "on" : ""}`}
          aria-pressed={needsShown}
          onClick={onNeeds}
          data-testid="people-standing-needs"
        >
          {agg.needsYou} need you
        </button>
      </span>
    )}
    {agg.reachedWeek > 0 && (
      <span className="pl-standing-part">
        <span className="pl-standing-dot" aria-hidden="true">·</span>
        <span className="pl-standing-reached">{agg.reachedWeek} reached this week</span>
      </span>
    )}
    {onLists && (
      <span className="pl-standing-part pl-standing-lists">
        <span className="pl-standing-dot" aria-hidden="true">·</span>
        <button type="button" className={`pl-standing-needs ${listWord ? "on" : ""}`} onClick={onLists} data-testid="people-lists-pick">
          {listWord || "Lists"} <Icon name="chevron-down" size={10} />
        </button>
      </span>
    )}
  </div>
);

// The receptionist's four modes for a selection. The words are contracts' (PERSON_MODE_WORDS, through the
// chrome bridge), the same ones the profile and a pill say: this list said "Answer them" and "Stay out" for
// the profile's Answer and Never.
const PL_MODES = [
  { id: "auto", icon: "sparkle" },
  { id: "ask", icon: "eye" },
  { id: "never", icon: "pause" },
  { id: "inherit", icon: "refresh" },
];
const plModeWord = (id) => (window.__chrome && window.__chrome.state ? window.__chrome.state("mode", id).label : id);

const plIsNumber = (name) => /^[+\d(]/.test(name || "");
// A person shown by their address because they have no name and no number (contracts personName).
const plIsAddress = (p) => !!p.email && p.name === p.email;
// The exact moment, by the business's clock (window.__clock): "Sep 6, 2026 · 3:10 PM".
const plWhen = (iso) => { const ms = iso ? Date.parse(iso) : NaN; return Number.isNaN(ms) ? undefined : `${window.__clock.dateYear(ms)} · ${window.__clock.time(ms)}`; };

// The row's own next steps, on hover: the thread, and the booking link when
// there is one — a reply carried in inside the 24-hour window, the template
// outside it. Nothing is sent from the row.
// With a list kept by hand open, the row also takes the person off it (`drop`): the one thing the Lists page
// could do that this table could not.
const PeopleRowActions = ({ p, bookingLink, drop = null }) => {
  if (!p.threadId && !drop) return null;
  const open = () => window.CHANLY.nav(window.CHANLY.R.thread(p.threadId));
  const link = () => {
    if (p.bookingLinkAction.ready) {
      try { sessionStorage.setItem("chanlytics-compose", JSON.stringify({ threadId: p.threadId, text: `Here's the link to book your appointment: ${bookingLink}` })); } catch { /* nothing to carry */ }
    }
    open();
  };
  return (
    <span className="cl-row-actions" onClick={(e) => e.stopPropagation()}>
      {p.threadId && <button className="cl-row-act" title="Open the thread" aria-label="Open the thread" onClick={open} data-testid="row-open-thread"><Icon name="chat" size={12} /></button>}
      {p.threadId && bookingLink && (
        <button className="cl-row-act" title={p.bookingLinkAction.title} aria-label={p.bookingLinkAction.label} onClick={link} data-testid="row-booking-link"><Icon name="calendar" size={12} /></button>
      )}
      {drop && (
        <button className="cl-row-act cl-row-act-drop" title={`Take ${p.name} off ${drop.list.name}`} aria-label={`Take ${p.name} off ${drop.list.name}`} onClick={() => drop.onDrop(p)} data-testid="row-drop-list"><Icon name="x" size={11} /></button>
      )}
    </span>
  );
};

// ---- The table, drawn from its columns -------------------------------------------------------------------------
// Each column is defined once: its heading, whether it sorts, whether a member may hide it, and how its cell is drawn
// from a row and what the page knows (`x`: withCalendar, bookingLink, attention, onOpen, drop, listsOf, shows).
// Person is pinned and always shown; a member shows or hides any other with the Columns menu, and the choice rides
// with their view (views.people.columns). With a calendar connected the outcome takes the column the receptionist's
// state held ("Answering" on every row said nothing); the receptionist stays a column a member can show, and while it
// is hidden its word sits beside the state. Offers is the fact that gates every campaign. First contact lives in the
// identity cell; the last column is the row's own actions, shown on hover and on the keyboard's row.

// The identity cell: who, on which wires, since when, and their last words.
const plNameCell = (p, { attention, onOpen }) => {
  // Named by an identifier, a number or an address: nobody has named them yet.
  const byNumber = plIsNumber(p.name);
  const numbered = byNumber || plIsAddress(p);
  // Their words, or what they said on the phone, as the attention strip says them: a row in Needs you
  // said neither, and gave no reason for the state either.
  const said = attention && attention[p.id];
  const words = said && (said.quoted || p.callSummary) ? (said.quoted ? `“${said.sentence}”` : said.sentence) : null;
  return (
    <td key="name" className="cl-name-cell pl-pin">
      <div className="cl-row-name">
        {numbered
          ? <div className="ix-thread-avatar cl-row-avatar-glyph" title="No name yet"><Icon name={byNumber ? "phone" : "mail"} size={12} /></div>
          : <div className="ix-thread-avatar">{p.initials}</div>}
        <div className="cl-row-name-block">
          <div className="cl-row-fullname">
            <span className={byNumber ? "tabular" : ""}>{p.name}</span>
            {numbered && <button className="cl-row-name-them" onClick={(e) => { e.stopPropagation(); onOpen(p.id); }} title="Give them a name on their profile" data-testid="row-name-them">Name them <Icon name="arrow-right" size={9} /></button>}
          </div>
          <div className="cl-row-meta">
            <PeopleChannels channels={p.channels} />
            {!numbered && p.phone && <><span className="dot" /><span className="tabular">{p.phone}</span></>}
            {/* The address stands in for the number only when there is none: a row says one identifier. */}
            {!numbered && !p.phone && p.email && <><span className="dot" /><span>{p.email}</span></>}
            {!numbered && p.waName && p.waName !== p.name && <><span className="dot" /><span title="Their name on WhatsApp">{p.waName} on WhatsApp</span></>}
            <span className="dot" />
            <span>{p.threads === 0 && p.calls === 0 ? "no messages yet" : `${p.threads} thread${p.threads === 1 ? "" : "s"}${p.calls ? ` · ${p.calls} call${p.calls === 1 ? "" : "s"}` : ""}`}</span>
            {p.firstContact.label !== "—" && <><span className="dot" /><span title={p.firstContact.estimate ? "The earliest row we hold; the true first contact is earlier" : "First contact"}>since {p.firstContact.label.replace(/^Before /, "before ")}</span></>}
          </div>
          {words && <div className="cl-row-words" title={words} data-testid="row-words">{words}</div>}
        </div>
      </div>
    </td>
  );
};

// The Offers cell reads the OFFERS answer, and its tooltip is that answer's own history.
const plOffersCell = (p) => {
  const offers = PL_OFFERS[p.consent.marketing] || PL_OFFERS.unknown;
  return <td key="offers" className="shrink cl-offers-cell" title={p.consent.marketingSub} data-testid="row-offers"><span className={`cl-row-offers ${offers[1]}`}>{offers[0]}</span></td>;
};

const PL_COLUMNS = [
  { key: "name", label: "Person", sortable: true, pinned: true, cell: plNameCell },
  {
    key: "state", label: "State", sortable: true,
    cell: (p, x) => (
      <td key="state" className="shrink cl-state-cell">
        <PeopleStatePill state={p.state} label={p.stateLabel} />
        {/* The receptionist's word beside the state, said once. While its own column shows (is-in-column), the stylesheet hides
            this one wherever that column's cell is on screen: always on a desktop, and on a card without the Visits column. */}
        {p.receptionist.tone !== "answering" && <span className={`cl-row-recept-mark${x.shows.receptionist ? " is-in-column" : ""}`} title={p.receptionist.label}>{PL_RECEPT_MARK[p.receptionist.tone] || p.receptionist.tone}</span>}
        {p.stateDetail && <span className="cl-row-state-detail" title={p.stateDetail} data-testid="row-state-detail">{p.stateDetail}</span>}
      </td>
    ),
  },
  { key: "last", label: "Last contact", sortable: true, cell: (p) => <td key="last" className="shrink dim cl-last-cell" title={plWhen(p.lastContact.at)}>{p.lastContact.label}</td> },
  {
    key: "visits", label: "Visits", sortable: true, needs: (x) => x.withCalendar,
    cell: (p) => (
      <td key="visits" className="shrink cl-visits-cell" title={p.nextVisit || p.lastVisit || "Never on the calendar"} data-testid="row-next-visit">
        {p.nextVisitDate || p.lastVisitDate
          ? (
            // The visit opens its day on the Calendar; the row around it opens the person.
            <button type="button" className="cl-row-visit" onClick={(e) => { e.stopPropagation(); window.CHANLY.nav(`calendar/${p.nextVisitDate || p.lastVisitDate}`); }} title={`Open ${p.nextVisitDay || p.lastVisitDay} on the Calendar`} data-testid="row-visit-open">
              {p.nextVisitDay
                ? <><span className="cl-row-next">{p.nextVisitDay}</span><span className="dim"> · {(p.nextVisit || "").split(" · ")[1] || ""}</span></>
                : <span className="cl-row-last-visit">Last · {p.lastVisitDay}</span>}
            </button>
          )
          : <span className="dim">—</span>}
      </td>
    ),
  },
  { key: "receptionist", label: "Receptionist", sortable: false, on: (x) => !x.withCalendar, cell: (p) => <td key="receptionist" className="cl-recept-cell"><PeopleReceptionist r={p.receptionist} /></td> },
  { key: "offers", label: "Offers", sortable: true, cell: plOffersCell },
  // Where they first came from: people_list's came_from, in contracts' words; nothing when nothing says.
  { key: "came_from", label: "Came from", sortable: false, cell: (p) => <td key="came_from" className="shrink dim cl-came-cell" data-testid="row-came-from">{p.cameFrom ? p.cameFrom.label : ""}</td> },
  { key: "email", label: "Email", sortable: false, on: false, cell: (p) => <td key="email" className="shrink dim cl-email-cell" data-testid="row-email">{p.email || ""}</td> },
  { key: "lists", label: "Lists", sortable: false, on: false, cell: (p, x) => <td key="lists" className="dim cl-lists-cell" data-testid="row-lists">{(x.listsOf[p.id] || []).join(", ")}</td> },
  { key: "actions", label: "", sortable: false, fixed: true, cell: (p, x) => <td key="actions" className="shrink cl-actions-cell"><PeopleRowActions p={p} bookingLink={x.bookingLink} drop={x.drop} /></td> },
];
// The keys a view may sort by: the columns whose headings sort.
const PL_SORT_KEYS = PL_COLUMNS.filter((c) => c.sortable).map((c) => c.key);

// Whether a column shows: Person and the row's actions always; any other by the member's own choice, else its default.
const plShows = (c, choices, x) => !!(c.pinned || c.fixed) || (typeof choices[c.key] === "boolean" ? choices[c.key] : typeof c.on === "function" ? c.on(x) : c.on !== false);
// The columns a member sees, in their order: the ones this workspace can show (Visits needs a calendar), as chosen.
const plVisibleColumns = (choices, x) => PL_COLUMNS.filter((c) => (!c.needs || c.needs(x)) && plShows(c, choices, x));

// The table, for any rows: the columns it is given, what a cell needs (`cell`), a selection, a keyboard cursor and a
// way to open a row. People draws it; Leads, a scope of People in Phase 1, will draw it with columns of its own. It
// stays in this file until then: a legacy file of its own must join the manifest, Chanlytics.html and every test that
// loads the page, and nothing else draws it yet. Still a <table class="cl-table">, so the page's selectors and the
// phone's card rules hold. On a desktop it scrolls in its own box (pl-table-scroll): the header sticks to its top and
// the pinned column to its left, and the hairline beside that column shows once it has scrolled sideways (`scrolled`,
// the page's state). Hookless on purpose: the tests' stub React keys state by call order, and a list's own controls
// above the table come and go.
const PeopleTable = ({ columns, cell, rows, total, sortBy, sortDir, onSort, onOpen, filtered, onClearFilters, selectable = false, sel = PL_NO_SEL, onToggle = () => {}, onToggleAll = () => {}, cursor = null, empty = null, scrolled = false, onScrolled = () => {} }) => {
  const selecting = rows.some((p) => sel.has(p.id));
  return (
    <div className={`cl-table-wrap pl-table-wrap ${selecting ? "selecting" : ""}`}>
      <div className={`pl-table-scroll ${scrolled ? "scrolled" : ""}`} onScroll={(e) => { const on = e.currentTarget.scrollLeft > 0; if (on !== scrolled) onScrolled(on); }} data-testid="people-table-scroll">
        {/* pl-table is the phone's hook: on a narrow screen these rows stop being a
            sideways scroll and stack, so the state is on the row instead of off the
            right edge. The seeded page, Leads and Lists keep the table. */}
        <table className="cl-table pl-table">
          <thead>
            <tr>
              {selectable && (
                <th className="cl-sel">
                  <input type="checkbox" className="cl-check" checked={rows.length > 0 && rows.every((p) => sel.has(p.id))} onChange={onToggleAll} aria-label="Select everyone shown" title="Select everyone shown" data-testid="select-all" />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} className={`${c.sortable ? "sortable" : ""} ${c.pinned ? "pl-pin" : ""} ${c.key === "actions" ? "cl-actions-head" : ""}`} onClick={() => c.sortable && onSort(c.key)} aria-sort={sortBy === c.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
                  {c.label}
                  {sortBy === c.key && <span className="sort-arr">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} id={`person-${p.id}`} className={`${sel.has(p.id) ? "selected" : ""} ${cursor === p.id ? "focused" : ""}`} aria-selected={selectable ? sel.has(p.id) : undefined} onClick={() => onOpen(p.id)}>
                {selectable && (
                  <td className="cl-sel" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="cl-check" checked={sel.has(p.id)} onChange={() => onToggle(p.id)} aria-label={`Select ${p.name}`} data-testid="row-select" />
                  </td>
                )}
                {columns.map((c) => c.cell(p, cell))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)}>
                  <EmptyState kind="line" className="empty-center" glyph="search" title={empty ? empty.title : total === 0 ? "Nobody has written or phoned yet." : "No one matches this view."} body={empty ? empty.body : undefined} action={empty ? empty.action : total > 0 && filtered ? { label: "Clear filters", onClick: onClearFilters } : null} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="cl-table-foot">
        <span>{filtered ? `Showing ${rows.length} of ${total}` : `${total} ${total === 1 ? "person" : "people"}`}</span>
        <span className="cl-table-keys"><kbd>J</kbd><kbd>K</kbd> move · {selectable && <><kbd>x</kbd> selects · <kbd>esc</kbd> clears · </>}<kbd>↵</kbd> opens · <kbd>/</kbd> searches</span>
      </div>
    </div>
  );
};

// A saved `columns` value, read with care: only the columns a member may hide, and only true or false. A view is the
// member's own JSON, and an older page or another device may have written anything into it.
const plColumnChoices = (raw) => {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const c of PL_COLUMNS) if (!c.pinned && !c.fixed && typeof raw[c.key] === "boolean") out[c.key] = raw[c.key];
  return out;
};
// The Columns menu's rows: every column this workspace can show, whether it shows, and Person, which always does.
const plColumnOptions = (choices, x) => PL_COLUMNS
  .filter((c) => !c.fixed && (!c.needs || c.needs(x)))
  .map((c) => ({ key: c.key, label: c.label, on: plShows(c, choices, x), locked: !!c.pinned }));

// Which columns show, as a menu that stays open while they are switched: MoreMenu closes on every item, which is right
// for an action and wrong for a set of switches. Hookless, with its open state the page's, whose one keyboard listener
// closes it on Esc and puts focus back on its button (`buttonRef`, the page's); pl-cols-menu keeps it out of
// PL_OVERLAY, what is open over the page and not the page's. A phone draws cards, not columns, so it is hidden there
// (clients.css).
const PeopleColumnsMenu = ({ open, onOpenChange, options, onPick, buttonRef = null }) => (
  <div className="more-wrap pl-cols">
    <button type="button" ref={buttonRef} className="btn btn-ghost btn-sm" aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); onOpenChange(!open); }} data-testid="people-columns">
      <Icon name="eye" size={12} /> Columns
    </button>
    {open && (
      <>
        <div className="more-backdrop" onClick={(e) => { e.stopPropagation(); onOpenChange(false); }} />
        <div className="more-menu align-right pl-cols-menu" role="menu" aria-label="Columns" data-testid="people-columns-menu" onClick={(e) => e.stopPropagation()}>
          <div className="more-header">Show on the table</div>
          {options.map((c) => (
            <button key={c.key} type="button" className="more-item" role="menuitemcheckbox" aria-checked={c.on} aria-disabled={c.locked ? true : undefined} onClick={() => { if (!c.locked) onPick(c.key); }} data-testid={`column-${c.key}`}>
              <Icon name="check" size={13} />
              <span className="more-item-label">{c.label}</span>
              {c.locked && <span className="more-item-meta">Always</span>}
            </button>
          ))}
        </div>
      </>
    )}
  </div>
);

const PL_NO_SEL = new Set();
// The batch doors take fifty people at a time (contacts/consent, /receptionist, /notes).
const PL_BATCH = 50;
// The loaded rows and what a search found past them, each person once.
const plWithFound = (loaded, found) => { const seen = new Set(loaded.map((p) => p.id)); return [...loaded, ...found.filter((p) => !seen.has(p.id))]; };
// A list just made, by its own answer's id; by name only when the answer carries none. The server
// tidies the spaces in a name, so a lookup by name alone could miss the list it had just made.
const plMadeId = (c, name) => (c.data && c.data.id) || (((window.__PEOPLE && window.__PEOPLE.saved) || []).find((s) => s.name === name) || {}).id || null;
// Undoing a list made with its people deletes the list; the people stay.
const plUndoList = async (id, name, flash) => {
  const u = await window.__lists.remove(id);
  if (!u.ok) flash(window.refusalToast(u, `${name} is still there`));
};

// What a selection can become: people on a list, a yes on record, a file.
// Adding to a list and recording a yes are owner-or-operator on the server;
// the bar shows what the role allows and says why when it does not.
const PeopleBulkBar = ({ sel, rows, saved, savedRead = true, canEdit, canExport, onClear, onKeep = () => {}, flash, activeSaved = null }) => {
  const [busy, setBusy] = React.useState(false);
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState("");
  const ids = [...sel];
  const picked = rows.filter((p) => sel.has(p.id));
  // Fifty at a press: the batch doors take fifty, and a bigger selection keeps
  // the rest selected, said so. The people past fifty used to be dropped
  // without a word.
  const batch = ids.slice(0, PL_BATCH);
  const rest = ids.slice(PL_BATCH);
  const restWords = rest.length ? ` · ${rest.length} more still selected — fifty at a time` : "";
  const keepRest = () => { if (rest.length) onKeep(rest); };
  const run = async (fn, done, after = null) => {
    if (busy) return;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { flash({ tone: "danger", msg: <>{r.message || "That did not go through."}</> }); return; }
    flash({ msg: done(r) });
    if (after) after(r);
  };
  // Who an add really adds: the people already on the list stay out of the
  // count and out of the Undo, which takes off only the people this put on.
  const addTo = async (list) => {
    if (busy || !window.__lists) return;
    const before = new Set(list.members || list.ids);
    const added = ids.filter((id) => !before.has(id));
    if (!added.length) { flash({ tone: "info", msg: <>Everyone selected is already on <b>{list.name}</b></> }); return; }
    setBusy(true);
    const r = await window.__lists.add(list.id, added);
    setBusy(false);
    if (!r.ok) { flash(window.refusalToast(r, `Not added to ${list.name}`)); return; }
    const already = ids.length - added.length;
    flash({
      msg: <>{added.length} added to <b>{list.name}</b>{already ? ` · ${already} already on it` : ""}</>,
      undo: async () => {
        const u = await window.__lists.drop(list.id, added);
        if (!u.ok) flash(window.refusalToast(u, `Still on ${list.name}`));
      },
    });
  };
  const createAndAdd = async () => {
    const n = name.trim();
    if (!n || busy || !window.__lists) return;
    setBusy(true);
    const c = await window.__lists.create(n);
    if (!c.ok) { setBusy(false); flash({ tone: "danger", msg: <>{c.message || "Could not make the list."}</> }); return; }
    const madeId = plMadeId(c, n);
    const a = madeId ? await window.__lists.add(madeId, ids) : { ok: false, message: "The list was made but not found again." };
    // An add the server refused (more people than it takes at once, say) leaves no empty list behind.
    if (!a.ok && madeId) await window.__lists.remove(madeId);
    setBusy(false); setNaming(false); setName("");
    flash(a.ok ? { msg: <>{ids.length} on the new list <b>{n}</b></>, undo: () => plUndoList(madeId, n, flash) } : window.refusalToast(a, madeId ? `${n} was not made` : "Not added to the new list"));
  };
  // A yes recorded for a whole class at once — and WHICH yes, because they are two
  // separate answers and only one of them puts a person on a broadcast. This
  // control was titled for offers and wrote the conversational column, so a salon
  // recording thirty signed marketing consents changed the one field that does not
  // authorise a promotion, and the composer then refused all thirty.
  // Each door checked before it is called (Window contracts): the menu below only
  // gates on the conversational one, and a missing global inside `run` would leave
  // `busy` set for good.
  const yes = (purpose, source, note = null) => {
    const send = purpose === "marketing" ? window.__setPersonMarketingConsentMany : window.__setPersonConsentMany;
    if (!send) { flash({ msg: <>That answer cannot be recorded here.</> }); return; }
    return run(
    () => send(
      batch,
      note ? { consent: "opted_in", source: source.id, note } : { consent: "opted_in", source: source.id },
    ),
    (r) => (
      <>
        {purpose === "marketing" ? "A yes to offers" : "A yes to messages"} on record for <b>{r.done}</b>
        {r.failed ? ` · ${r.failed} not recorded` : ""} · {source.label.toLowerCase()}{restWords}
      </>
    ),
    keepRest,
    );
  };
  const exportCsv = () => { plDownload(`people-${new Date().toISOString().slice(0, 10)}.csv`, plCsv(picked)); flash({ msg: <>{picked.length} exported as a CSV</> }); };
  const isOwner = !!(window.__ME && window.__ME.role === "owner");
  const [noting, setNoting] = React.useState(false);
  const [note, setNote] = React.useState("");
  // A yes on sign-up forms waits for the note that says which forms: a stack of
  // signed slips is attested by it. The spoken ways are recorded at once.
  const [slips, setSlips] = React.useState(null);
  const [slipsNote, setSlipsNote] = React.useState("");
  const yesBy = (purpose, s) => (s.id === "form" ? () => { setSlips({ purpose, source: s }); setSlipsNote(""); } : () => yes(purpose, s));
  const closeSlips = () => { setSlips(null); setSlipsNote(""); };
  const recordSlips = () => {
    const line = slipsNote.trim();
    if (!line || !slips || busy) return;
    closeSlips();
    return yes(slips.purpose, slips.source, line);
  };
  const receptionist = async (m) => {
    setBusy(true);
    const r = await window.__setPersonReceptionistMany(batch, m.id);
    setBusy(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>Receptionist: <b>{m.label}</b> for {r.done} {r.done === 1 ? "person" : "people"}{restWords}</> : <>{r.message}</> });
    if (r.ok) { if (rest.length) onKeep(rest); else onClear(); }
  };
  const addNote = async () => {
    const line = note.trim();
    if (!line || busy) return;
    setBusy(true);
    const r = await window.__appendPersonNotesMany(batch, line);
    setBusy(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>Noted on {r.done} {r.done === 1 ? "person" : "people"}: <b>{line}</b>{restWords}</> : <>{r.message}</> });
    if (r.ok) { setNoting(false); setNote(""); if (rest.length) onKeep(rest); else onClear(); }
  };
  const sources = (window.__consentSources || []).filter((s) => s.id !== "customer_message");
  // A yes to offers is written (00100), so the only way a desk records one for a
  // whole selection is the form they signed.
  const offersSources = (window.__offersYesSources || []).filter((s) => s.id !== "customer_message");
  return (
    <div className="cl-bulk" role="toolbar" aria-label="Selected people" data-testid="bulk-bar">
      <span className="cl-bulk-count"><b>{sel.size}</b> selected</span>
      {canEdit && window.__lists && !naming && (
        <MoreMenu
          btnClass="btn btn-sm"
          label="Add to list"
          title="Add to a list"
          gated={busy ? "One moment — the last change is still saving" : null}
          items={savedRead ? [
            { header: "Add to" },
            ...saved.map((s) => ({ label: s.name, icon: "filter", onClick: () => addTo(s) })),
            { label: "New list…", icon: "plus", onClick: () => setNaming(true) },
          ] : [
            // Lists that could not be read are not offered; a new one can still be made.
            { header: "Your saved lists couldn't be read" },
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
      {/* With a list kept by hand open, the selection can leave it; the people stay. The rows leave the view, so the bar closes with them. */}
      {canEdit && window.__lists && activeSaved && !naming && (
        <button className="btn btn-sm" disabled={busy} onClick={() => run(() => window.__lists.drop(activeSaved.id, batch), () => <>{batch.length} taken off <b>{activeSaved.name}</b>{restWords}</>, () => { if (rest.length) onKeep(rest); else onClear(); })} data-testid="bulk-drop-list">
          <Icon name="x" size={11} /> Take off {activeSaved.name}
        </button>
      )}
      {canEdit && window.__setPersonConsentMany && sources.length > 0 && !slips && (
        <MoreMenu
          btnClass="btn btn-sm"
          label="Record a yes"
          title="Which yes, and how it was given — the two are separate answers"
          gated={busy ? "One moment — the last change is still saving" : null}
          items={[
            { header: "Yes to messages about their visit…" },
            ...sources.map((s) => ({ label: s.label, icon: "check", onClick: yesBy("conversational", s) })),
            ...(window.__setPersonMarketingConsentMany && offersSources.length > 0
              ? [{ header: "Yes to offers and news…" }, ...offersSources.map((s) => ({ label: s.label, icon: "tag", onClick: yesBy("marketing", s) }))]
              : []),
          ]}
        />
      )}
      {canEdit && slips && (
        <span className="cl-bulk-naming">
          <input autoFocus value={slipsNote} placeholder="Which slips, e.g. Saturday's" maxLength={200} disabled={busy} aria-label="Which forms they signed" data-testid="bulk-form-note" onChange={(e) => setSlipsNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") recordSlips(); if (e.key === "Escape") closeSlips(); }} />
          <button className="btn btn-sm btn-primary" disabled={busy || !slipsNote.trim()} onClick={recordSlips} data-testid="bulk-form-save">Record</button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={closeSlips}>Cancel</button>
        </span>
      )}
      {canEdit && isOwner && window.__setPersonReceptionistMany && (
        <MoreMenu
          btnClass="btn btn-sm"
          label="Receptionist"
          title="What the receptionist does for these people"
          gated={busy ? "One moment — the last change is still saving" : null}
          items={[
            { header: "For these people…" },
            ...PL_MODES.map((m) => ({ label: plModeWord(m.id), icon: m.icon, onClick: () => receptionist({ ...m, label: plModeWord(m.id) }) })),
          ]}
        />
      )}
      {canEdit && window.__appendPersonNotesMany && !noting && (
        <button className="btn btn-sm" disabled={busy} onClick={() => setNoting(true)} data-testid="bulk-note"><Icon name="edit" size={12} /> Add a note</button>
      )}
      {canEdit && noting && (
        <span className="cl-bulk-naming">
          <input autoFocus value={note} placeholder="One line, under their notes" maxLength={200} disabled={busy} data-testid="bulk-note-line" onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addNote(); if (e.key === "Escape") { setNoting(false); setNote(""); } }} />
          <button className="btn btn-sm btn-primary" disabled={busy || !note.trim()} onClick={addNote}>Add</button>
        </span>
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
    if (!c.ok) { setBusy(false); flash({ tone: "danger", msg: <>{c.message || "Could not make the list."}</> }); return; }
    const madeId = plMadeId(c, n);
    const a = madeId ? await window.__lists.add(madeId, ids) : { ok: false, message: "The list was made but not found again." };
    // An add the server refused (more people than it takes at once, say) leaves no empty list behind.
    if (!a.ok && madeId) await window.__lists.remove(madeId);
    setBusy(false); setOpen(false); setName("");
    flash(a.ok ? { msg: <>{ids.length} kept as <b>{n}</b></>, undo: () => plUndoList(madeId, n, flash) } : window.refusalToast(a, "Not kept as a list"));
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

// Somebody the business meets before they ever write or call: a number and,
// if known, a name, through the door the calendar sweep already uses. The
// route existed for a year with no screen calling it. An existing number opens
// that person rather than making a second one.
const AddPersonButton = ({ onAdded, flash }) => {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const close = () => { setOpen(false); setName(""); setPhone(""); setError(null); };
  const submit = async () => {
    if (busy || !phone.trim() || !window.__addPerson) return;
    setBusy(true); setError(null);
    const r = await window.__addPerson({ phone: phone.trim(), ...(name.trim() ? { name: name.trim() } : {}) });
    setBusy(false);
    // The field's own sentence where the route named one, else the refusal's.
    if (!r.ok) { setError((r.fields && Object.values(r.fields)[0]) || r.message || "Could not add them."); return; }
    flash({ msg: r.data.existed ? <><b>{name.trim() || phone.trim()}</b> was already here — opened</> : <><b>{name.trim() || phone.trim()}</b> added</> });
    close();
    onAdded(r.data.contact_id);
  };
  if (!open) {
    return <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} data-testid="add-person"><Icon name="plus" size={12} /> Add a person</button>;
  }
  return (
    <span className="cl-bulk-naming" data-testid="add-person-form">
      <input autoFocus value={name} placeholder="Name (optional)" maxLength={80} disabled={busy} data-testid="add-person-name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") close(); }} />
      <input value={phone} placeholder="Mobile number" maxLength={24} disabled={busy} aria-invalid={error ? true : undefined} aria-describedby={error ? "add-person-error" : undefined} data-testid="add-person-phone" onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") close(); }} />
      <button className="btn btn-sm btn-primary" disabled={busy || !phone.trim()} onClick={submit} data-testid="add-person-save">Add</button>
      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={close}>Cancel</button>
      <window.FieldError id="add-person-error" message={error} testid="add-person-error" />
    </span>
  );
};

// Typing: a field that takes words, or a radio, whose arrow keys move its choice. A row's checkbox is not one, so after
// a click on it J, K, x and Esc still work.
const plTyping = (el) => !!el && ((el.tagName === "INPUT" && !/^checkbox$/i.test(el.type || "")) || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || !!el.isContentEditable);
// What Enter and Space press when it has focus, instead of the row under the cursor.
const PL_CONTROL = 'button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="tab"], [role="option"]';
// What can be open over the page and has the keys while it is: a menu, Ask, the ? sheet, the notifications, a sidebar
// menu, the phone's drawer. Only the app's (every one sits inside .app-root), so a hidden dialog a browser extension
// adds cannot silence the page. Not the page's own overlays, the lists sheet (.pl-sheet) and the Columns menu
// (.pl-cols-menu), which the listener names apart.
const PL_OVERLAY = '.app-root [role="menu"]:not(.pl-sheet):not(.pl-cols-menu), .app-root [role="dialog"]:not(.pl-sheet):not(.pl-cols-menu)';

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
  // The phone's list picker (the rail, as a sheet), and the New list box. The shell's and a profile's "New list"
  // (segments:new) open the box; on a phone the sheet comes up with it, since the rail it sits in is not drawn there.
  const [listsOpen, setListsOpen] = useState(false);
  const [newListSignal, setNewListSignal] = useState(0);
  React.useEffect(() => {
    const onNew = () => {
      setNewListSignal((n) => n + 1);
      if (window.matchMedia && window.matchMedia("(max-width: 720px)").matches) setListsOpen(true);
    };
    window.addEventListener("segments:new", onNew);
    return () => window.removeEventListener("segments:new", onNew);
  }, []);
  const canEditLists = !!(window.__ME && (window.__ME.role === "owner" || window.__ME.role === "operator"));
  const canExport = !!(window.__href && (!window.canDo || window.canDo("export")));
  const [toastNode, plFlash] = window.usePPToast();
  // A list made on the rail says so and is the one shown: the rail used to close
  // with no word, the new list somewhere down it. The answer goes back to the
  // rail, which shows a refusal where the name was typed.
  const createList = async (name) => {
    const r = await window.__lists.create(name);
    if (r.ok) {
      plFlash({ msg: <><b>{name}</b> made. Pick people and use Add to list, or add them from their profile.</> });
      if (r.data && r.data.id) { setListId(null); setSavedId(r.data.id); }
      setListsOpen(false);
    }
    return r;
  };
  // The selection, by id. Cleared when the view changes: a bar counting people
  // that are no longer on screen is the kind of bug bulk actions are made of.
  const [sel, setSel] = useState(() => new Set());
  const toggleSel = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // The view the workspace remembers for this member (memberships.views, read
  // with the surface) wins over what this device remembers; the device copy
  // stays as the fallback for a route that is not there yet.
  const remembered = React.useMemo(() => ({ ...plLoadView(), ...((people.views && people.views.people) || {}) }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState(initialState && PL_TABS.includes(initialState) ? initialState : "all");
  React.useEffect(() => { if (initialState && PL_TABS.includes(initialState)) setTab(initialState); }, [initialState]);
  const [sortBy, setSortBy] = useState(PL_SORT_KEYS.includes(remembered.sortBy) ? remembered.sortBy : "last");
  const [sortDir, setSortDir] = useState(remembered.sortDir === "asc" ? "asc" : "desc");
  // The columns this member chose to show or hide with the Columns menu; a column they never touched keeps its
  // default (PL_COLUMNS). The menu's open state is the page's, so its one keyboard listener closes it on Esc.
  const [colChoices, setColChoices] = useState(() => plColumnChoices(remembered.columns));
  const [colsOpen, setColsOpen] = useState(false);
  // A view is the sort and the columns. The strip's tab was remembered too; a view saved before it went carries an
  // attentionTab this ignores, and the next save drops it. Every save sends every key the page owns, because
  // member_view_set replaces the page's whole object (00113): a save of the sort alone would lose the columns.
  const savedView = React.useRef(JSON.stringify({ sortBy: remembered.sortBy, sortDir: remembered.sortDir, columns: plColumnChoices(remembered.columns) }));
  // One saver for the page's life, so its saves go one at a time (plViewSaver).
  const viewSaver = React.useRef(null);
  if (!viewSaver.current) viewSaver.current = plViewSaver();
  React.useEffect(() => {
    const view = { sortBy, sortDir, columns: colChoices };
    plSaveView(view);
    // The workspace's copy, once per change and never for the view it already holds. The choices change only when
    // what they say does (pickColumn keeps them for Person), so this runs once per change.
    const key = JSON.stringify(view);
    if (key === savedView.current || !window.__saveView) return;
    savedView.current = key;
    viewSaver.current(view);
  }, [sortBy, sortDir, colChoices]);
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
  // When the page does not hold everyone (past the fifty pages the surface
  // reads), the box also asks the server, which matches names and numbers. What
  // it finds sits beside the loaded rows, which the box still searches by their
  // words: its matches used to stand in for the loaded rows, so a loaded person
  // found by their last words vanished, and a search that could not ask the
  // server said nothing and searched only what was loaded.
  const hasMore = !!(people.page && people.page.has_more);
  const [found, setFound] = useState(null);
  const [searchMore, setSearchMore] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  React.useEffect(() => {
    if (!hasMore || !q.trim() || !window.__peopleSearch) { setFound(null); setSearchFailed(false); return undefined; }
    let on = true;
    const t = setTimeout(() => {
      window.__peopleSearch(q)
        .then((r) => { if (on) { setFound(r.rows); setSearchMore(!!r.more); setSearchFailed(false); } })
        .catch(() => { if (on) { setFound(null); setSearchFailed(true); } });
    }, 250);
    return () => { on = false; clearTimeout(t); };
  }, [q, hasMore]);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMore = async () => {
    if (!window.__peopleMore || loadingMore) return;
    setLoadingMore(true);
    // A page of people that could not be read says so: Show more used to go quiet and stay.
    try { await window.__peopleMore(); } catch (e) { plFlash(window.refusalToast({ message: e && e.message }, "No more people loaded")); } finally { setLoadingMore(false); }
  };
  const searchRef = React.useRef(null);
  const scrollRef = React.useRef(null);

  const onSort = (key) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir(key === "name" || key === "visits" ? "asc" : "desc"); }
  };

  const shown = useMemo(() => {
    let list = found ? plWithFound(rows, found) : rows;
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
      // The name, the number, the address, their name on WhatsApp — and the
      // words on the row: their last message and their visits, so "balayage"
      // finds people. The server's search and count match the same (00125).
      list = list.filter((p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.waName || "").toLowerCase().includes(needle) ||
        (p.email || "").includes(needle) ||
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
        case "offers": { const rank = { opted_in: 0, unknown: 1, opted_out: 2 }; av = rank[a.consent.marketing] ?? 1; bv = rank[b.consent.marketing] ?? 1; if (av === bv) { av = a.lastContact.ts ?? -Infinity; bv = b.lastContact.ts ?? -Infinity; } break; }
        default: av = a.lastContact.ts ?? -Infinity; bv = b.lastContact.ts ?? -Infinity;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, found, lists, saved, tab, listId, savedId, q, sortBy, sortDir]);

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
  const listStep = (activeSaved && activeSaved.action) || (activeList && activeList.action) || null;
  // One list open at a time: it is the page's title, so two open at once would be a title over a table it does
  // not describe. Picking the open one again shows everyone.
  const pickSmart = (id) => { setSavedId(null); setListId((cur) => (cur === id ? null : id)); };
  const pickSaved = (id) => { setListId(null); setSavedId((cur) => (cur === id ? null : id)); };
  // One person off the list kept by hand that is open, from their row; Undo puts them back.
  const dropFromList = async (p) => {
    if (!window.__lists || !activeSaved) return;
    const list = activeSaved;
    const r = await window.__lists.drop(list.id, [p.id]);
    if (!r.ok) { plFlash(window.refusalToast(r, `Still on ${list.name}`)); return; }
    plFlash({
      msg: <><b>{p.name}</b> is off <b>{list.name}</b></>,
      undo: async () => { const u = await window.__lists.add(list.id, [p.id]); if (!u.ok) plFlash(window.refusalToast(u, `Not back on ${list.name}`)); },
    });
  };
  // The columns this member sees (PL_COLUMNS: Person always, any other as chosen, else by its default), and what a
  // cell needs to draw itself: the booking link, each row's words, the list open for taking people off, their lists.
  const colCtx = { withCalendar };
  const columns = plVisibleColumns(colChoices, colCtx);
  const colOptions = plColumnOptions(colChoices, colCtx);
  // Show or hide one column; Person and the row's actions are not the member's to hide. A column put back the way its
  // default has it is no choice any more, so it follows the default again: a receptionist turned off and on again
  // gives way to Visits once a calendar connects, as it does for everyone.
  const pickColumn = (key) => setColChoices((ch) => {
    const c = PL_COLUMNS.find((x) => x.key === key);
    if (!c || c.pinned || c.fixed) return ch;
    const on = !plShows(c, ch, colCtx);
    const rest = { ...ch };
    delete rest[key];
    return on === plShows(c, {}, colCtx) ? rest : { ...rest, [key]: on };
  });
  // Where Esc puts focus when it closes the menu: back on the button that opened it.
  const colsButton = React.useRef(null);
  const listsOf = useMemo(() => {
    const m = {};
    for (const s of saved) for (const id of s.ids) (m[id] = m[id] || []).push(s.name);
    return m;
  }, [saved]);
  const cellCtx = {
    withCalendar,
    bookingLink: people.bookingLink || null,
    attention: people.attention,
    onOpen: onOpenProfile,
    drop: activeSaved && canEditLists && window.__lists ? { list: activeSaved, onDrop: dropFromList } : null,
    listsOf,
    shows: Object.fromEntries(columns.map((c) => [c.key, true])),
  };
  const filtered = tab !== "all" || !!listId || !!savedId || !!q.trim();
  React.useEffect(() => { setSel(new Set()); }, [tab, listId, savedId, q]);
  const shownIds = shown.map((p) => p.id);
  // A keyboard walks the rows the way the Inbox walks threads: J/K or ↓/↑ move the cursor, x or Space selects the row
  // under it, Enter opens it, / goes to the search, Esc closes the Columns menu and then clears the selection. Never
  // while typing, never with a modifier, never behind a menu or a sheet. The cursor's row shows its actions, as a
  // hovered row does (clients.css).
  const [cursor, setCursor] = useState(null);
  React.useEffect(() => { setCursor((c) => (c && shownIds.includes(c) ? c : null)); }, [shownIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const moveCursor = (step) => setCursor((c) => {
    const i = c ? shownIds.indexOf(c) : -1;
    const id = shownIds[step > 0 ? Math.min(shownIds.length - 1, i + 1) : Math.max(0, i - 1)];
    const row = document.getElementById(`person-${id}`);
    if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
    return id;
  });
  // One listener for the page's life, reading what the latest render left in `keys`: the Calendar's pattern. It was
  // taken down and added again on every render, and / had a second listener of its own.
  const keys = React.useRef(null);
  React.useEffect(() => {
    const onKey = (e) => {
      const k = keys.current;
      // Where the key was pressed, not where focus is now: React hears it first, and a field's own Esc can close the
      // field and take focus with it, so the body had focus by the time this heard an Esc typed in the list's name.
      const from = e.target && e.target.nodeType === 1 ? e.target : document.activeElement;
      // A key an earlier listener took (the ? sheet's Esc) is not the page's.
      if (!k || e.defaultPrevented || plTyping(from) || e.metaKey || e.ctrlKey || e.altKey) return;
      // The page's own overlays first. The Columns menu: Esc closes it, and the rows hold still behind it. At a phone's
      // width the stylesheet hides it (clients.css, 900px and under), so one left open as the window narrowed is closed
      // and the key is the page's as ever: it held every key but Esc, the lists sheet's Esc included. The phone's lists
      // sheet listens for its own Esc.
      if (k.menuOpen && window.matchMedia && window.matchMedia("(max-width: 900px)").matches) k.closeMenu();
      else if (k.menuOpen) { if (e.key === "Escape") { e.preventDefault(); k.closeMenu(); } return; }
      if (k.sheetOpen) return;
      // Anything else open over the page has the keys: a menu, the notifications or a sidebar menu listens from when it
      // opens, after this listener, so it is still on the page as this one hears the key; the ? sheet takes its Esc.
      if (document.querySelector(PL_OVERLAY)) return;
      if (e.key === "/") { e.preventDefault(); k.focusSearch(); return; }
      // Esc clears a selection wherever focus is, a bulk-bar button included.
      if (e.key === "Escape") {
        if (k.selected) { e.preventDefault(); k.clearSel(); }
        return;
      }
      if (!k.ids.length) return;
      // Enter and Space on a focused button, link, box, tab or menu item are that control's: they opened the profile
      // under the cursor, or selected its row, instead of pressing what had focus.
      if ((e.key === "Enter" || e.key === " ") && from && from.closest && from.closest(PL_CONTROL)) return;
      const down = e.key === "ArrowDown" || e.key === "j" || e.key === "J";
      const up = e.key === "ArrowUp" || e.key === "k" || e.key === "K";
      // A held key walks on; a held x, Space or Enter acts once, so a row is not selected and unselected over and over.
      if (e.repeat && !(down || up)) return;
      if (down || up) { e.preventDefault(); k.move(down ? 1 : -1); }
      else if (e.key === "Enter" && k.cursor) { e.preventDefault(); k.open(k.cursor); }
      else if ((e.key === " " || e.key === "x" || e.key === "X") && k.cursor && k.canSelect) { e.preventDefault(); k.toggle(k.cursor); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const toggleAll = () => setSel((s) => (shownIds.length && shownIds.every((id) => s.has(id)) ? new Set() : new Set(shownIds)));

  // What the keyboard's one listener reads: this render's rows, cursor and doors.
  keys.current = {
    ids: shownIds,
    cursor,
    move: moveCursor,
    open: onOpenProfile,
    toggle: toggleSel,
    canSelect: canEditLists || canExport,
    selected: sel.size > 0,
    clearSel: () => setSel(new Set()),
    focusSearch: () => { if (searchRef.current) searchRef.current.focus(); },
    sheetOpen: listsOpen,
    menuOpen: colsOpen,
    closeMenu: () => { setColsOpen(false); if (colsButton.current) colsButton.current.focus(); },
  };

  return (
    <div className="clients">
      <PeopleRail
        lists={lists}
        groups={people.groups || PL_DEFAULT_GROUPS}
        active={listId}
        onPick={pickSmart}
        saved={saved}
        activeSaved={savedId}
        onPickSaved={pickSaved}
        canEdit={canEditLists}
        onCreateList={window.__lists ? createList : null}
        savedRead={people.savedRead !== false}
        newListSignal={newListSignal}
      />

      <div className="cl-main">
        <div className="cl-main-scroll" ref={scrollRef}>
          <PeopleStanding
            agg={agg}
            needsShown={tab === "needs_you"}
            onNeeds={() => setTab((t) => (t === "needs_you" ? "all" : "needs_you"))}
            onLists={() => setListsOpen(true)}
            listWord={activeSaved ? activeSaved.name : activeList ? activeList.label : null}
          />

          <div className="cl-controls">
            <div className="cl-search-wrap">
              <Icon name="search" size={13} />
              <input ref={searchRef} placeholder="Search by name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
              <span className="kbd">/</span>
            </div>
            <div className="cl-controls-right">
              {canEditLists && window.__addPerson && <AddPersonButton onAdded={onOpenProfile} flash={plFlash} />}
              {/* Everyone as a CSV, from the route: owner only, and the button
                  says so for anyone else instead of leading to a refusal. */}
              {window.__href && (
                window.canDo && !window.canDo("export")
                  ? <button className="btn btn-ghost btn-sm" {...window.gate("export")}><Icon name="external" size={12} /> Export CSV</button>
                  : <a className="btn btn-ghost btn-sm" href={window.__href("GET contacts/export")} download title="Download everyone as a CSV file"><Icon name="external" size={12} /> Export CSV</a>
              )}
              <PeopleColumnsMenu open={colsOpen} onOpenChange={setColsOpen} options={colOptions} onPick={pickColumn} buttonRef={colsButton} />
              <button className="btn btn-ghost btn-sm" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
                <Icon name="sort" size={12} /> {sortLabel}
              </button>
            </div>
          </div>

          <div className="cl-section">
            <div className="cl-section-head">
              <div className="cl-section-lead">
                {/* The count is the line above and the table's own foot; here it would be a third. A list picked is
                    the title, not a chip beside "Everyone": the table IS that list, so its name, its rename and its
                    delete sit on the one line, where the Lists page had them over a second table of the same people. */}
                {activeSaved
                  ? <ListTitle list={activeSaved} canEdit={canEditLists && !!window.__lists} onRenamed={(n) => plFlash({ msg: <>Renamed to <b>{n}</b></> })} />
                  : activeList
                    ? <span className="cl-section-title" data-testid="smart-filter"><Icon name="sparkle" size={12} />{activeList.label}</span>
                    : <span className="cl-section-title">Everyone</span>}
                {(activeList || activeSaved) && (
                  <button type="button" className="cl-bucket-link" onClick={() => { setListId(null); setSavedId(null); }} data-testid="show-everyone">Show everyone</button>
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
                  : (filtered ? "Filtered" : "")}
              </span>
            </div>
            {/* The list's own step: a smart list's next move, or a kept list's one door, a broadcast to those on it who
                said yes (contracts peopleListAction and savedListAction, the one sentence for both). */}
            {listStep && (
              <div className="cl-list-action" data-testid="list-action">
                <span className="cl-list-action-text">{listStep.text}</span>
                <button className={`btn btn-sm ${listStep.enabled ? "btn-primary" : ""}`} disabled={!listStep.enabled} onClick={() => window.CHANLY.nav(listStep.to)}>
                  {listStep.cta} <Icon name="arrow-right" size={10} />
                </button>
              </div>
            )}
          </div>

          <PeopleTable
            columns={columns}
            cell={cellCtx}
            selectable={canEditLists || canExport}
            sel={sel}
            onToggle={toggleSel}
            onToggleAll={toggleAll}
            cursor={cursor}
            rows={shown}
            total={people.page && people.page.has_more ? people.page.total : rows.length}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={onSort}
            onOpen={onOpenProfile}
            filtered={filtered}
            onClearFilters={() => { setQ(""); setTab("all"); setListId(null); setSavedId(null); }}
            empty={activeSaved && activeSaved.count === 0 && tab === "all" && !listId && !q.trim() ? { title: `Nobody on ${activeSaved.name} yet`, body: "Pick people and use Add to list, or add them from their profile.", action: { label: "Show everyone", onClick: () => setSavedId(null) } } : null}
          />
          {hasMore && (
            <div className="cl-section-sub" style={{ padding: "8px 0 16px" }} data-testid="people-more">
              {rows.length.toLocaleString()} of {people.page.total.toLocaleString()} loaded{q.trim() ? (searchFailed ? " · couldn't search past them, so these are matches among the loaded" : ` · names and numbers searched across everyone, words among the ${rows.length.toLocaleString()} loaded${searchMore ? " · the first 1,000 matches" : ""}`) : ""}
              {" "}
              <button className="btn btn-ghost btn-sm" disabled={loadingMore} onClick={loadMore} data-testid="people-more-btn">{loadingMore ? "Loading…" : "Show more"}</button>
            </div>
          )}
        </div>
        {sel.size > 0 && <PeopleBulkBar sel={sel} rows={rows} saved={saved} savedRead={people.savedRead !== false} canEdit={canEditLists} canExport={canExport} onClear={() => setSel(new Set())} onKeep={(rest) => setSel(new Set(rest))} flash={plFlash} activeSaved={activeSaved || null} />}
        {/* The phone's rail, as a sheet (the rail itself is not drawn under 720px). Last in the tree, after everything
            whose state a stub React keys by order. */}
        {listsOpen && (
          <PeopleListsSheet onClose={() => setListsOpen(false)}>
            <PeopleRail
              lists={lists}
              groups={people.groups || PL_DEFAULT_GROUPS}
              active={listId}
              onPick={(id) => { pickSmart(id); setListsOpen(false); }}
              saved={saved}
              activeSaved={savedId}
              onPickSaved={(id) => { pickSaved(id); setListsOpen(false); }}
              canEdit={canEditLists}
              onCreateList={window.__lists ? createList : null}
              savedRead={people.savedRead !== false}
              newListSignal={newListSignal}
            />
          </PeopleListsSheet>
        )}
        {toastNode}
      </div>
    </div>
  );
};

// A real workspace renders its own people; the seeded page keeps the demo.
const ClientsA = (props) => (window.__PEOPLE ? <ClientsAReal {...props} /> : <ClientsASeed {...props} />);

window.ClientsA = ClientsA;
// Drawn on their own by refusals-on-the-page.test.mjs.
Object.assign(window, { NewListRow, AddPersonButton, DeleteListButton });
