/* global React, Icon, CLIENTS, CLIENT_BUCKETS, CLIENT_SEGMENTS, CLIENTS_AGGREGATES,
   ChannelGlyph, TempBar, ClientTag, AgentChip, BucketPill, FailedRead,
   PeopleTable, PeopleColumnsMenu, plLocked, plShows, plSortKeys, plDrawnColumns, plColumnChoices, plColumnOptions,
   PL_NO_SEL, PL_FIRST_ROWS, LEAD_COLUMNS, LEAD_PHONE_COLUMNS, LeadsScope, leadPeekEscape, leadPeekFollows, leadPeekFocus, leadArmOnReturn */
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
            <button className="cl-bucket-link" onClick={() => window.CHANLY.nav("clients/leads")}>
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
  waiting_on_you: "You have the thread, or nobody does, and they wrote last — a teammate's waits on them",
  // A note with a day (0007, amended): every workspace's.
  steps_due: "Their next step's day has come, or gone by — a note with a day, for the team",
  new_week: "First contact in the last 7 days, by evidence — imported history never counts",
  quiet: "They haven't written or called in 30 days — your own messages don't count, and someone never heard from isn't quiet",
  phoned_only: "Only ever phoned — no WhatsApp thread",
  opted_in: "Said yes to hearing from you — replies and messages about their own visit",
  // The list is who can RECEIVE an offer (contracts mayReceive): a yes with no number to send to is not on it.
  offers_ok: "Said yes to OFFERS, separately, with a number to send to — the only people a promotional broadcast may reach",
  opted_out: "Asked to stop; the receptionist stays silent, offers included",
  booked: "An appointment ahead on your calendar — the booking is the conversion",
  booked_week: "An appointment this week, Monday to Sunday",
  asked_never_booked: "Wrote or called in the last 30 days, and nothing on your calendar since answers it — the people you can still win",
  lapsed: "Forty-five days or more since their last visit, nothing ahead — the win-back list, from visits rather than silence",
  // The journey past the booking (0004): drawn only where deals are a thing here.
  consultation_booked: "A consultation coming up, or one this past week with no proposal since — the Pipeline's Consultations",
  proposal_out: "A proposal went out and is waiting on their answer",
  clients: "Said yes, or paid — the engagement is running",
  deal_passed: "They passed on a proposal",
  deal_ended: "An engagement that ended — the win-back list for clients",
};

// What the page remembers between visits on this device, per scope: the sort and the columns
// ({ sortBy, sortDir, columns }), and under Leads the rail's list too ({ list, sortBy, sortDir, columns }).
const PL_VIEW_KEYS = { people: "chanlytics-people-view", leads: "chanlytics-leads-view", pipeline: "chanlytics-pipeline-view" };
const plLoadView = (scope) => {
  try { return { ...JSON.parse(localStorage.getItem(PL_VIEW_KEYS[scope] || PL_VIEW_KEYS.people) || "{}") }; } catch { return {}; }
};
const plSaveView = (scope, v) => { try { localStorage.setItem(PL_VIEW_KEYS[scope] || PL_VIEW_KEYS.people, JSON.stringify(v)); } catch { /* private mode */ } };
// Where the owner was in each view of People or Leads -- the words in the box, the row the cursor was on, how far the
// list was scrolled, and on Leads whether the map was open ({ q, cursor, top, map }) -- and a Find half-written: both
// in the tab's one store for what pages keep (legacy-bridge/tab-memory.ts, window.__tabMemory), which keys them by the
// workspace, keeps a page's last twelve views, forgets a draft a day old and goes at sign-out. A selection is not part
// of the place: one that came back unseen after a refresh is the kind of thing a bulk act should never find. Where no
// store is published (the standalone harness), the place and the draft live for the page.
const plPlaceLoad = (page, view) => (window.__tabMemory ? window.__tabMemory.place(page, view) : null);
const plPlaceSave = (page, view, place) => { if (window.__tabMemory) window.__tabMemory.keepPlace(page, view, place); };
// The Find kept is its words, and the plan Claude wrote for them with the card it came on. A plan cost a wait to get,
// and approving one only posts it (legacy-bridge ask/commit.ts), so it is as good after a refresh as before. A turn
// still being read, or one being started, is not: it comes back as its words.
const ldFinderLoad = () => (window.__tabMemory ? window.__tabMemory.draft("leads-find") : null);
const ldFinderSave = (f) => {
  if (!window.__tabMemory) return;
  const planned = f.stage === "plan" && !!f.plan;
  if (!f.words && !planned) { window.__tabMemory.dropDraft("leads-find"); return; }
  window.__tabMemory.keepDraft("leads-find", {
    open: !!f.open, words: f.words || "",
    stage: planned ? "plan" : "compose", plan: planned ? f.plan : null, proposal: planned ? f.proposal || null : null, more: planned ? f.more || null : null,
  });
};
/** The viewer's Values ⁄ Signals choice, read in a try: a private window or blocked storage answers Signals. */
const ldValuesPref = () => { try { return !!window.localStorage && window.localStorage.getItem("leads.values") === "1"; } catch (e) { return false; } };
// A cell context for the Leads scope that changes only when a value a cell draws from changes. The doors go to the
// page's latest closures through `acts`, so the object itself is kept across draws (in `kept`) and a memoised row
// handed it is left alone. People's rows ride in it (a converted lead's Client pill reads the person's deal, 0004):
// publishPeople builds a fresh array each time People lands, so the context is new then and the rows redraw -- on a
// cold load of Leads the rows paint before the people, and a row that read the global would say Converted until a
// sort or a search drew it again. `stageShown` is whether the Stage column is drawn: then it says each lead's state,
// and the name's tag gives way (leads-scope.jsx ldBusinessCell), so a row says it once.
const leadCellCtxFor = (acts, kept, values, mixedFits, hasCenter, canFind, peopleRows, stageShown = false) => {
  const k = kept.current;
  if (k && k.values === values && k.mixedFits === mixedFits && k.hasCenter === hasCenter && k.canFind === canFind && k.peopleRows === peopleRows && k.stageShown === stageShown) return k.ctx;
  const door = (name) => (id) => acts.current[name](id);
  const ctx = {
    onOpen: door("onOpen"), onExpand: door("onExpand"),
    values, mixedFits, hasCenter, canFind, peopleRows, stageShown,
    onCall: door("onCall"), onCopy: door("onCopy"), onCopyPhone: door("onCopyPhone"), onLogCall: door("onLogCall"),
    // The row under a pointer or a finger, or reached by Tab (people-table.jsx): its photo is asked for before a press.
    onWarm: door("onWarm"),
    onKeep: door("onKeep"), onExclude: door("onExclude"), onPutBack: door("onPutBack"),
  };
  kept.current = { values, mixedFits, hasCenter, canFind, peopleRows, stageShown, ctx };
  return ctx;
};
// Whether the window is a phone's width: the band People's cards use (clients.css, 900px) and the one the Columns
// menu is judged by. Asked once, with a listener, so a window resized past it draws the other shape at once rather
// than on the next state change; and the table then builds only what a desktop shows.
const PL_PHONE_QUERY = "(max-width: 900px)";
const plPhoneNow = () => !!(window.matchMedia && window.matchMedia(PL_PHONE_QUERY).matches);
// The box that scrolls: on a desktop the table's own (people-table.jsx pl-table-scroll), on a phone the pane itself.
const ldScroller = (pane) => {
  if (!pane) return null;
  const inner = pane.querySelector ? pane.querySelector(".pl-table-scroll") : null;
  return inner && inner.scrollHeight > inner.clientHeight ? inner : pane;
};
// The workspace's copy of the view, one save at a time. Each save replaces the member's whole view (member_view_set),
// and two in flight could land out of order and leave the older one on the row: while one is out, only the latest view
// waits, and it goes when that one lands. A save that fails is tried once more, unless a newer view is waiting, which
// carries every key anyway: a timeout dropped the last change.
const plViewSaver = (page) => {
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
      else if (!(r && r.ok)) console.error("people_view_not_saved", page, r && r.message);
    };
    window.__saveView(page, view).then(landed, (e) => landed({ ok: false, message: e && e.message }));
  };
  return push;
};
// A selection as a CSV, in its own fixed columns, whatever the Columns menu shows — nothing the schema does not hold.
// The "Offers" column reads the OFFERS answer. It read `consent.state` -- the
// conversational one -- so the column titled Offers showed Yes for everybody who
// had ever texted START, and the composer then refused every one of them.
const PL_OFFERS = { opted_in: ["Yes", "yes"], opted_out: ["No", "no"], unknown: ["Not asked", "unasked"] };
const plCsv = (rows) => {
  // One cell as contracts spell it (csvCell, the rule the route's export of everyone uses): quoted when it must be,
  // and a cell a spreadsheet would read as a formula gets a leading apostrophe. This file quoted and nothing more, so
  // a WhatsApp name of "=HYPERLINK(...)" ran in whoever opened a selection's file, and "+1786..." was summed.
  const esc = window.__csvCell;
  // Both answers, because "Consent" alone cannot say which one it means -- and the
  // one an audit asks about is the offers column, which this file did not carry.
  const head = ["Name", "Phone", "Email", "State", "Last contact", "Consent", "Offers", "Next visit", "First contact"];
  const lines = rows.map((p) => [p.name, p.phone || "", p.email || "", p.stateLabel, p.lastContact.label, p.consent.label, (PL_OFFERS[p.consent.marketing] || PL_OFFERS.unknown)[0], p.nextVisit || "", p.firstContact.label].map(esc).join(","));
  return [head.map(esc).join(","), ...lines].join("\r\n");
};
// The owner's own clipboard and the owner's own phone: a lead is emailed from their inbox and called from their
// handset, and nothing is sent from here (PRD 0.4).
const plCopy = (text) => { try { if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(text); } catch { /* a browser that will not */ } };
const plDial = (tel) => { window.location.href = `tel:${tel}`; };
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
// The receptionist's word says what the state pill beside it already says: "escalated" is why they need you, and
// "held for you" is what waiting on you means. Said twice, it was "Needs you  escalated" on the row. Its other words
// -- a reply queued, snoozed, silent -- are news the pill does not carry, and stay.
const plReceptSaysTheState = (p) =>
  (p.receptionist.tone === "escalated" && p.state === "needs_you") || (p.receptionist.tone === "paused" && p.state === "waiting_on_you");
// The sorts a phone offers from its more-menu, in the words it says them in. A desktop sorts by its headings, which a
// phone does not draw: its one button only turned the order round ("Z → A"), whatever the sort was.
const PL_PHONE_SORTS = [
  { by: "state", dir: "desc", label: "Needs you first" },
  { by: "last", dir: "desc", label: "Latest contact first" },
  { by: "name", dir: "asc", label: "Name, A to Z" },
  { by: "name", dir: "desc", label: "Name, Z to A" },
  { by: "visits", dir: "asc", label: "Soonest visit first", needs: (x) => x.withCalendar },
];
// An empty Add a person and an empty list draft: the phone's sheets' drafts are the page's state.
const PL_ADD_EMPTY = { name: "", phone: "", busy: false, error: null };
// How a yes was given, as a phone's Record a yes draws it: a person, a phone, a form. A tick on every row read as a
// list already ticked.
const PL_SOURCE_GLYPH = { in_person: "user", phone: "phone", form: "content" };
const PL_LIST_EMPTY = { name: "", busy: false, error: null };

// A stable empty list, so a workspace without saved lists does not re-run the
// table's memo on every render.
const PL_NO_LISTS = [];

// What a scope has before its surface lands. People's route waits for People and Leads' for Leads
// (surface-registry routeSurfaceFor), so the other scope's surface may not be read yet: the rail's switch is
// drawn in both, and neither may throw for want of the one it is not showing.
const PL_NO_PEOPLE = { rows: [], lists: PL_NO_LISTS, saved: PL_NO_LISTS, aggregates: { total: 0, needsYou: 0, reachedWeek: 0 }, views: {}, attention: {}, savedRead: true };
const PL_NO_LEADS = {
  searches: [], counts: { all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 }, rows: [], next: null,
  offered: 0, view: { searchId: null, list: "all", cls: null, chips: {}, sort: "fit", dir: "asc" },
  route: "clients/leads", suggestions: null, tz: "UTC", readFailed: false, fetchedAt: 0,
};

const usePeople = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:clients", bump);
    return () => window.removeEventListener("surface:clients", bump);
  }, []);
  return window.__PEOPLE || PL_NO_PEOPLE;
};

// The Leads surface (legacy-bridge/leads.ts): the searches, the counts, the rows of one view, how many a refresh
// found and is holding back, and the first day's suggestions. Its own event, so a People refresh does not
// re-render Leads and the other way round.
const useLeads = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:leads", bump);
    return () => window.removeEventListener("surface:leads", bump);
  }, []);
  return window.__LEADS || PL_NO_LEADS;
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
// A new list: a name kept by hand, or -- "Describe who" -- a smart list whose rule the assistant drafts from the owner's
// own words (window.__lists.draft) and the page shows back as chips with who it holds for today, before anything is
// saved. The mockup's plain-English composer (segments.jsx), on real data: a rule in a vocabulary the row can answer.
const NewListRow = ({ onCreate, openSignal = 0 }) => {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [smart, setSmart] = React.useState(false);
  const [words, setWords] = React.useState("");
  const [draft, setDraft] = React.useState(null);
  React.useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
  const close = () => { setOpen(false); setName(""); setError(null); setSmart(false); setWords(""); setDraft(null); };
  const submit = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true); setError(null);
    const r = await onCreate(n, draft ? draft.rule : null);
    setBusy(false);
    if (!r.ok) { setError(r.message || "Could not make the list."); return; }
    close();
  };
  const build = async () => {
    const w = words.trim();
    if (!w || busy || !window.__lists || !window.__lists.draft) return;
    setBusy(true); setError(null);
    const r = await window.__lists.draft(w);
    setBusy(false);
    if (!r.ok) { setError(r.message || "Could not draft the list."); return; }
    setDraft(r.data);
    setName(r.data.name);
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
  if (smart && !draft) {
    return (
      <div className="cl-rail-foot">
        <div className="cl-rail-newlist">
          <input
            autoFocus
            value={words}
            placeholder="Describe who — “haven’t visited in two months”"
            maxLength={300}
            disabled={busy}
            aria-label="Describe who is on the list"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "new-list-error" : undefined}
            data-testid="new-list-words"
            onChange={(e) => setWords(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") build(); if (e.key === "Escape") close(); }}
          />
          <button className="btn btn-sm btn-primary" disabled={busy || !words.trim()} onClick={build} data-testid="new-list-build">{busy ? "Building…" : "Build"}</button>
        </div>
        <window.FieldError id="new-list-error" message={error} testid="new-list-error" />
        <button type="button" className="cl-bucket-link cl-rail-newlist-mode" onClick={() => { setSmart(false); setError(null); }} data-testid="new-list-hand">Keep one by hand instead</button>
      </div>
    );
  }
  // Who a drafted rule holds for today, over the people the page has read (contracts listMembers, via the courier).
  const holds = draft && window.__lists && window.__lists.count ? window.__lists.count(draft.rule) : null;
  return (
    <div className="cl-rail-foot">
      {draft && (
        <div className="cl-rail-draft" data-testid="new-list-draft">
          <div className="cl-tag-stack">{window.__lists.parts(draft.rule).map((part) => <span key={part} className="chip chip-wrap" data-testid="new-list-rule">{part}</span>)}</div>
          {holds !== null && <div className="cl-rail-hint" data-testid="new-list-holds">{holds === 1 ? "1 person" : `${holds} people`} on it today, and it keeps itself current.</div>}
          {draft.cannot && <div className="cl-rail-hint" data-testid="new-list-cannot">Left out: {draft.cannot}</div>}
        </div>
      )}
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
        <button className="btn btn-sm btn-primary" disabled={busy || !name.trim()} onClick={submit} data-testid="new-list-add">{draft ? "Save" : "Add"}</button>
      </div>
      <window.FieldError id="new-list-error" message={error} testid="new-list-error" />
      {draft
        ? <button type="button" className="cl-bucket-link cl-rail-newlist-mode" onClick={() => { setDraft(null); setError(null); }} data-testid="new-list-redescribe">Describe it again</button>
        : window.__lists && window.__lists.draft && <button type="button" className="cl-bucket-link cl-rail-newlist-mode" onClick={() => { setSmart(true); setError(null); }} data-testid="new-list-smart">Or describe who, and it keeps itself current</button>}
    </div>
  );
};

// A list's acts, one door each, for a desktop's title line and the phone's sheet alike: what the door answered, and the
// sentence to show where it refused. Rename and delete were written into their two components, and a list made with
// people on it into two more (Save these, the bulk bar's New list); the phone's sheet would have been a fifth copy.
const plRenameList = async (list, name) => {
  const r = await window.__lists.rename(list.id, name);
  return r.ok ? { ok: true } : { ok: false, error: r.message || "Could not rename the list." };
};
const plDeleteList = async (list) => {
  const r = await window.__lists.remove(list.id);
  return r.ok ? { ok: true } : { ok: false, error: r.message || "The list could not be deleted." };
};
// Made, then filled. A list whose filling the server refused (more people than it takes at once, say) is taken back,
// so no empty list is left behind. `made` is the make's answer, `filled` the fill's (null when nothing was made).
const plMakeListWith = async (name, ids) => {
  const made = await window.__lists.create(name);
  if (!made.ok) return { made, filled: null, id: null };
  const id = plMadeId(made, name);
  const filled = id ? await window.__lists.add(id, ids) : { ok: false, message: "The list was made but not found again." };
  if (!filled.ok && id) await window.__lists.remove(id);
  return { made, filled, id };
};
// Somebody the business meets before they ever write or call, added by hand through the door the calendar sweep uses:
// a number already here opens that person rather than making a second one. The desktop's form and the phone's sheet
// add through this and say it the same way.
const plAddPerson = async ({ name, phone }) => {
  const r = await window.__addPerson({ phone: phone.trim(), ...(name.trim() ? { name: name.trim() } : {}) });
  if (r.ok) return { ok: true, id: r.data.contact_id, existed: !!r.data.existed };
  // The field's own sentence where the route named one, else the refusal's.
  return { ok: false, error: (r.fields && Object.values(r.fields)[0]) || r.message || "Could not add them." };
};
const plAddedWords = ({ name, phone }, existed) => (existed ? <><b>{name.trim() || phone.trim()}</b> was already here — opened</> : <><b>{name.trim() || phone.trim()}</b> added</>);

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
    const r = await plDeleteList(list);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
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
    const r = await plRenameList(list, n);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setEditing(false);
    onRenamed(n);
  };
  if (!editing) {
    return (
      <span className="cl-section-title" data-testid="saved-filter">
        <Icon name={list.byHand ? "filter" : "sparkle"} size={12} />
        {list.name}
        {/* A smart list says its rule once, quietly, beside its name: who is on it and why. One it can't count says
            why instead (lists.ts listUnknownWords), never a 0. */}
        {list.rule && <span className="cl-list-rule" data-testid="list-rule">{list.rule.join(" · ")}</span>}
        {list.unknown && <span className="cl-list-rule" data-testid="list-unknown">{list.unknown}</span>}
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
const PeopleListsSheet = ({ onClose, title = "Lists", children }) => {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="sb-sheet-backdrop" onClick={onClose} />
      {/* It goes the way it came as it closes, and a thumb pulls it down (data-bits leaving, touchSwipe). */}
      <div className="sb-sheet pl-sheet" role="dialog" aria-label={title} data-testid="people-lists-sheet" ref={window.leaving ? window.leaving("people-lists") : undefined} {...(window.touchSwipe ? window.touchSwipe({ onDown: onClose, when: plPhoneNow }) : {})}>
        <div className="sb-sheet-head">
          <span className="sb-sheet-title">{title}</span>
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

// The page's scopes, in the switch's order: People and Leads everywhere, and the Pipeline only where deals are on (the
// People surface's dealsOn, contracts dealsAreOn, 0008) -- a workspace whose customers book is never offered one.
const PL_SCOPES = [{ id: "people", label: "People" }, { id: "leads", label: "Leads" }, { id: "pipeline", label: "Pipeline" }];
const plScopes = (dealsOn) => (dealsOn ? PL_SCOPES : PL_SCOPES.slice(0, 2));
// Where the switch goes: each scope is an address of People's (app-shell.jsx). `#/pipeline` is the retired demo board's
// address, which still lands on People; the Pipeline scope is `clients/pipeline`.
const plScopeRoute = (to) => (to === "leads" ? "clients/leads" : to === "pipeline" ? "clients/pipeline" : "clients");

// People | Leads (| Pipeline): the one switch between this page's scopes (PRD 6.1). A tablist, because they are views
// of one page, not pages; on a phone the switch is the slim bar's (Task 18).
const PeopleScopeTabs = ({ scope, onScope, dealsOn = false }) => (
  <div className="pt-scope" role="tablist" aria-label="Which people" data-testid="people-scope">
    {plScopes(dealsOn).map((s) => (
      <button key={s.id} type="button" role="tab" aria-selected={scope === s.id} className={scope === s.id ? "on" : ""} onClick={() => onScope(s.id)} data-testid={`scope-${s.id}`}>{s.label}</button>
    ))}
  </div>
);

/* ------------------------------------------------------------ the rail kit
   One rail for both scopes of People. People's lists and Leads' lists and searches are the same thing to the rail:
   sections, perhaps groups in them, and rows, each one thing to pick with its count. Leads drew its own rows beside
   People's and they drifted apart -- its headings were a group's, a row's edges took no press, and its picks combined
   where People's replace, so a list pressed while a search was open only narrowed inside the search, and the rail
   lit neither. Now both scopes draw these, and both pick the same way: one row at a time (aria-current), a pick
   replaces what was picked, and pressing the picked row again goes back to all of them (railToggle). Hookless, like
   the table: what is picked is the page's, and arrives as a prop. */

/** The rail's one rule for a pick: the row pressed, unless it was the one picked, which goes back to none. */
const railToggle = (current, id) => (current === id ? null : id);

const RailSection = ({ label, icon = null, testid = null, children }) => (
  <div className="cl-rail-section" data-testid={testid || undefined}>
    {label ? (
      <div className="cl-rail-label">
        {icon ? <Icon name={icon} size={11} /> : null}
        {label}
      </div>
    ) : null}
    {children}
  </div>
);

/**
 * A phone's Lists sheet is compact (Ruben, 24 Sep: the sheet "takes most of the screen"): a list with nobody in it
 * gets no cell of its own there, only its name in one quiet line under its block. The one picked is always drawn,
 * empty or not, and so is the list of all of them. `quietOf` answers the rows that step back; `RailEmpty` says them.
 */
const railQuiet = (rows, keep) => rows.filter((r) => r.count === 0 && !keep(r));
const RailEmpty = ({ labels, testid = null }) =>
  labels.length ? (
    <p className="cl-rail-empty" data-testid={testid || undefined}>
      Empty now: {labels.join(" · ")}
    </p>
  ) : null;

const RailGroup = ({ label, testid = null, children }) => (
  <div className="cl-rail-group" data-testid={testid || undefined}>
    <div className="cl-rail-group-label">{label}</div>
    {children}
  </div>
);

/**
 * One row. Its mark, label and count are the pick. A row with acts of its own (a search's menu) keeps them beside
 * the pick, never a button inside a button, and the pick fills the row, so a press anywhere on it but the acts picks
 * it. While the row is being named, `edit` stands in for the pick and its acts; `after` hangs under it (a Confirm).
 */
// `onWarm` is the row under the pointer, or reached by Tab: a scope may read the view its press would open ahead of
// the press (the Leads scope does), as the Settings rail warms a tab. A press asks for nothing of its own.
const RailRow = ({ label, count = null, active = false, onPick, onWarm = null, smart = false, tip = null, mark = null, menu = null, edit = null, after = null, testid = null, className = "", pickClass = "" }) => {
  const cls = `cl-rail-row${smart ? " smart" : ""}${active ? " active" : ""}${className ? ` ${className}` : ""}`;
  const said = (
    <>
      {mark}
      <span className="label">{label}</span>
      {count === null || count === undefined ? null : <span className="count">{count}</span>}
    </>
  );
  if (!menu && !edit && !after) {
    return <button type="button" className={cls} onClick={onPick} onPointerEnter={onWarm || undefined} onFocus={onWarm || undefined} aria-current={active ? "true" : undefined} data-tip={tip || undefined} data-testid={testid || undefined}>{said}</button>;
  }
  return (
    <div className={`${cls} has-acts`}>
      {edit || (
        <button type="button" className={`cl-rail-pick${pickClass ? ` ${pickClass}` : ""}`} onClick={onPick} onPointerEnter={onWarm || undefined} onFocus={onWarm || undefined} aria-current={active ? "true" : undefined} data-tip={tip || undefined} data-testid={testid || undefined}>{said}</button>
      )}
      {edit ? null : menu}
      {after}
    </div>
  );
};

// The rail. The switch heads it in both scopes; under Leads the rows below it are the Leads scope's (LeadsRailRows,
// leads-scope.jsx), drawn with the same kit, so the smart lists and the lists kept by hand are People's alone.
// `scopeTabs` is false in the phone's sheet, whose bar has the switch; `everyone` ({ count, active, onPick }) is the
// sheet's first row, the way back to everyone. `dealsOn` puts the Pipeline in the switch. Under the Pipeline the rows
// are People's own lists, and a pick opens that list on People (pipeline-scope.jsx).
// `compact` is the phone's sheet: one level of heading (the groups), and the empty lists said in a line, not drawn.
const PeopleRail = ({ scope = "people", onScope = () => {}, scopeTabs = true, dealsOn = false, everyone = null, children = null, lists = PL_NO_LISTS, groups = PL_DEFAULT_GROUPS, active, onPick, saved = [], savedRead = true, activeSaved = null, onPickSaved = () => {}, canEdit = false, onCreateList = null, newListSignal = 0, compact = false }) => (
  <aside className="cl-rail">
    {scopeTabs && <PeopleScopeTabs scope={scope} onScope={onScope} dealsOn={dealsOn} />}
    {scope === "leads" ? children : (
    <>
    {/* The way back to everyone, first, where a phone looks for it: a desktop's is Show everyone on the list's title
        line, which a phone does not draw. */}
    {everyone && (
      <div className="cl-rail-section cl-rail-everyone">
        <RailRow label="Everyone" count={everyone.count} active={everyone.active} onPick={everyone.onPick} testid="rail-everyone" />
      </div>
    )}
    <RailSection label={compact ? null : "Smart lists"} icon="sparkle">
      {groups.map((g) => {
        const own = lists.filter((l) => (l.group || "reach") === g.id);
        if (own.length === 0) return null;
        const quiet = compact ? railQuiet(own, (l) => active === l.id) : [];
        // A group with nobody in any of its lists has nothing to draw but its name: the one line says them.
        if (quiet.length === own.length) return null;
        return (
          <RailGroup key={g.id} label={g.label} testid={`rail-group-${g.id}`}>
            {own.filter((l) => !quiet.includes(l)).map((l) => (
              // A list of people who need you counts in amber (the tone map decides which: warn); every other count is a total.
              <RailRow key={l.id} smart label={l.label} count={l.count} active={active === l.id} onPick={() => onPick(l.id)} tip={PL_LIST_TIP[l.id] || null} className={window.__chrome && window.__chrome.state && window.__chrome.state("person", l.id).tone === "warn" ? "asks" : ""} />
            ))}
          </RailGroup>
        );
      })}
      {/* The sheet's one quiet line: every empty list, in the rail's own order (a line a group read as clutter). */}
      {compact ? <RailEmpty labels={railQuiet(lists, (l) => active === l.id).map((l) => l.label)} testid="rail-empty" /> : null}
    </RailSection>
    <RailSection label="Saved" testid="saved-lists">
      {/* Lists that could not be read are not "no lists": the read failed, and the people above stand. */}
      {!savedRead && <FailedRead kind="line" what="your saved lists" surface="people" testid="people-lists-failed" />}
      {saved.map((s) => (
        // A list that can't be counted here draws a dash and says why on hover: can't tell is not nobody.
        <RailRow key={s.id} smart={!s.byHand} label={s.name} count={s.unknown ? "—" : s.count} active={activeSaved === s.id} onPick={() => onPickSaved(s.id)} tip={s.unknown || (s.byHand ? "A list kept by hand — add people from their profile" : `Keeps itself current: ${(s.rule || []).join(" · ")}`)} testid={s.byHand ? undefined : "saved-smart"} />
      ))}
      {savedRead && saved.length === 0 && !compact && (
        <div className="cl-rail-hint">No lists yet. Keep one by hand — regulars, one staff member's customers — or describe who, and it keeps itself current.</div>
      )}
    </RailSection>
    {canEdit && onCreateList && <NewListRow onCreate={onCreateList} openSignal={newListSignal} />}
    </>
    )}
  </aside>
);

// One line above the table: how many people there are, how many need a person, and how many were reached this
// week -- and the middle one is the tap that shows them. It replaces a page title under a top bar that already
// says People, two sentences explaining the page, four stat cards, and a 320px strip of five tabs and three rows.
// The strip drew the same two people the table's own first rows drew, with the same sentences; "Needs you" was
// said in four places at once (the rail, a stat card, a tab, and every matching row's pill). Every number it
// held is still on the page: the rail counts each state, and each row says its own.
// On a phone the list being shown is the bar's (PeoplePhoneBar); the line keeps the counts.
// Under Leads the line is leadsStanding's (contracts leads.ts, Task 4.6): "322 leads · 272 ready · 3 searches",
// and "1 search needs you" is the tap that opens the search waiting on an answer.
const PeopleStanding = ({ scope = "people", leads = null, agg = null, needsShown = false, onNeeds }) => (
  scope === "leads" ? (
    <div className="pl-standing" data-testid="leads-standing">
      <span className="pl-standing-total">{leads.total}</span>
      {leads.parts.map((part) => (
        <span key={part} className="pl-standing-part">
          <span className="pl-standing-dot" aria-hidden="true">·</span>
          <span className="pl-standing-reached">{part}</span>
        </span>
      ))}
      {leads.needsYou && (
        <span className="pl-standing-part">
          <span className="pl-standing-dot" aria-hidden="true">·</span>
          <button type="button" className="pl-standing-needs on" onClick={() => onNeeds(leads.needsYou.searchId)} data-testid="leads-standing-needs">
            {leads.needsYou.count} {leads.needsYou.count === 1 ? "search needs" : "searches need"} you
          </button>
        </span>
      )}
    </div>
  ) : (
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
  </div>
  )
);

// The phone's top (900px and under, the band the rows and the Lists sheet use), the same for every scope of People:
// the scopes as the Inbox draws its views -- the shell's own tab strip (.stabs), a row of its own with the one picked
// underlined -- and under it the bar: the list being shown, search behind a button, and the scope's own last control
// (People's more-menu, Leads' Find, the Pipeline's +). The switch was a boxed control squeezed into the bar beside
// the list button, which shortened the list's name ("All deals 6" at 375px) and looked like no other page's views.
// Nothing else sits above the rows but the one line under the bar. Searching, the bar is the field, full width and
// 16px, so a phone never zooms into it, and Cancel gives the bar back; the scopes stay above it, as the Inbox's views
// stay over its search. Words in the box keep it open (a view of Leads comes back with its own) without taking focus.
// Hookless: its state is the page's (`searchOpen`), so the page's one keyboard listener opens it on /.
// `listCount` (Leads') stands apart from the name and never gives way: the name is what an ellipsis shortens. As one
// string, "All leads · 96" was drawn "All leads · …" on a 375px phone. `dealsOn` puts the Pipeline in the switch; with
// no `onLists` there is no list to pick and the bar draws no list button.
const PeoplePhoneBar = ({ scope, onScope, dealsOn = false, listLabel = null, listCount = null, onLists = null, listsOpen = false, q, onQ, searchRef, searchOpen = false, onSearchOpen, searchLabel, trailing = null, testid }) => {
  const id = (part) => `${testid}-phone-${part}`;
  // The two rows are one top: `-phone-bar` names both, so what reads the bar (the scopes, the list, search) finds them.
  return (
    <div className="pp-top" data-testid={id("bar")}>
      <div className="stabs stabs-people" role="tablist" aria-label="Which people" data-testid={id("scopes")}>
        {plScopes(dealsOn).map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={scope === s.id} className={`stabs-tab${scope === s.id ? " active" : ""}`} onClick={() => onScope(s.id)}>{s.label}</button>
        ))}
      </div>
      {searchOpen || q ? (
        <PeoplePhoneSearch id={id} q={q} onQ={onQ} searchRef={searchRef} searchOpen={searchOpen} onSearchOpen={onSearchOpen} searchLabel={searchLabel} />
      ) : (
        <div className="pp-bar">
          {onLists ? (
            <button type="button" className="pp-bar-pick" aria-haspopup="dialog" aria-expanded={!!listsOpen} onClick={onLists} data-testid={id("lists")}>
              <span className="pp-bar-pick-words">{listLabel}</span>
              {listCount != null ? <span className="pp-bar-pick-count" data-testid={id("lists-count")}>{Number(listCount).toLocaleString()}</span> : null}
              <Icon name="chevron-down" size={11} />
            </button>
          ) : null}
          <button type="button" className="pp-bar-icon pp-bar-push" aria-label={searchLabel} onClick={() => onSearchOpen(true)} data-testid={id("search-open")}>
            <Icon name="search" size={18} />
          </button>
          {trailing}
        </div>
      )}
    </div>
  );
};

// The bar, searching: the field, full width, and Cancel to give the bar back.
const PeoplePhoneSearch = ({ id, q, onQ, searchRef, searchOpen, onSearchOpen, searchLabel }) => (
  <div className="pp-bar is-searching">
    <label className="pp-bar-field">
      <Icon name="search" size={16} />
      <input
        ref={searchRef}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoFocus={searchOpen}
        value={q}
        placeholder={searchLabel}
        aria-label={searchLabel}
        onChange={(e) => onQ(e.target.value)}
        data-testid={id("search")}
      />
      {q ? (
        <button type="button" className="pp-bar-clear" aria-label="Clear the search" onClick={() => { onQ(""); if (searchRef && searchRef.current) searchRef.current.focus(); }} data-testid={id("search-clear")}>
          <Icon name="x" size={12} />
        </button>
      ) : null}
    </label>
    <button type="button" className="pp-bar-cancel" onClick={() => { onQ(""); onSearchOpen(false); }} data-testid={id("search-cancel")}>Cancel</button>
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
// A person's face on a card: their initials, or the glyph for what names them while nobody has named them.
const plFace = (p) => ({ initials: p.initials, glyph: plIsNumber(p.name) ? "phone" : plIsAddress(p) ? "mail" : null });
// What the search box says it finds, in both of its places: the desktop's placeholder and the phone's bar.
const PL_SEARCH_LABEL = "Search by name or phone";
// Who the words in the box find: the name, the number, the address, their name on WhatsApp -- and the words on the
// row: their last message, their visits and their deal's service, so "balayage" finds people and "ad management" finds
// the deals for it. The server's search and count match the same (00125). People's views and the Pipeline ask it
// alike. Null for no words, which finds everyone.
const plMatcher = (q) => {
  const needle = q.trim().toLowerCase();
  if (!needle) return null;
  const digits = needle.replace(/\D/g, "");
  return (p) =>
    p.name.toLowerCase().includes(needle) ||
    (p.waName || "").toLowerCase().includes(needle) ||
    (p.email || "").includes(needle) ||
    (digits.length >= 3 && (p.phone || "").replace(/\D/g, "").includes(digits)) ||
    (p.quote || "").toLowerCase().includes(needle) ||
    (p.nextVisit || "").toLowerCase().includes(needle) ||
    (p.lastVisit || "").toLowerCase().includes(needle) ||
    ((p.deal && p.deal.service) || "").toLowerCase().includes(needle);
};
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
// from a row and what the page knows (`x`: bookingLink, attention, onOpen, drop, listsOf, shows).
// Person is pinned and always shown; on a desktop a member shows or hides any other with the Columns menu, and the
// choice rides with their view (views.people.columns); a phone's cards draw what they draw by default whatever the
// choice (plDrawnColumns). With a calendar connected the outcome takes the column the receptionist's
// state held ("Answering" on every row said nothing); the receptionist stays a column a member can show, and while it
// is hidden its word sits beside the state. Offers is the fact that gates every campaign. First contact lives in the
// identity cell; the last column is the row's own actions, shown on hover and on the keyboard's row.

// The identity cell: who, on which wires, since when, and their last words.
// Who they are and what they last said: two lines. A third line under the name used to carry five facts at once --
// the channels, the number, their WhatsApp name, "1 thread · 10 calls" and "since Aug 26" -- so every row read
// jam-packed. The number and the channels are Reach, a column of their own; when they first wrote is First contact,
// a column of its own; their WhatsApp name is the name's tip; the counts are the profile's (an owner acts on who and
// why, not on how many threads).
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
            {/* Their own name on WhatsApp, where it differs, is the name's tip rather than a third thing on the row. */}
            <span className={byNumber ? "tabular" : ""} title={!numbered && p.waName && p.waName !== p.name ? `${p.waName} on WhatsApp` : undefined}>{p.name}</span>
            {numbered && <button className="cl-row-name-them" onClick={(e) => { e.stopPropagation(); onOpen(p.id); }} title="Give them a name on their profile" data-testid="row-name-them">Name them <Icon name="arrow-right" size={9} /></button>}
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
        {/* The receptionist's word beside the state, said once. On a desktop the stylesheet hides this one while its own
            column shows (is-in-column); a card draws that column's cell whatever the member chose, so a card hides this
            one wherever Visits does not take the cell's place. */}
        {p.receptionist.tone !== "answering" && !plReceptSaysTheState(p) && <span className={`cl-row-recept-mark${x.shows.receptionist ? " is-in-column" : ""}`} title={p.receptionist.label}>{PL_RECEPT_MARK[p.receptionist.tone] || p.receptionist.tone}</span>}
        {p.stateDetail && <span className="cl-row-state-detail" title={p.stateDetail} data-testid="row-state-detail">{p.stateDetail}</span>}
      </td>
    ),
  },
  // How to reach them: the channels they use, and the number -- or the address when there is no number (a row says one
  // identifier). Someone named only by their number or address says it as their name already, so here only the
  // channels. It was the third line under every name.
  { key: "reach", label: "Reach", sortable: false, cell: (p) => {
    const named = !plIsNumber(p.name) && !plIsAddress(p);
    const id = named ? p.phone || p.email || null : null;
    return (
      <td key="reach" className="shrink cl-reach-cell" data-testid="row-reach">
        <span className="cl-row-reach">
          <PeopleChannels channels={p.channels} />
          {id ? <span className={p.phone ? "tabular" : ""}>{id}</span> : null}
        </span>
      </td>
    );
  } },
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
  // When they first wrote, off until asked for: it was "since Aug 26" on every row, true and seldom why anyone opens People.
  { key: "since", label: "First contact", sortable: false, on: false, cell: (p) => (
    <td key="since" className="shrink dim cl-since-cell" data-testid="row-since" title={p.firstContact.estimate ? "The earliest row we hold; the true first contact is earlier" : undefined}>
      {p.firstContact.label !== "—" ? p.firstContact.label : ""}
    </td>
  ) },
  { key: "email", label: "Email", sortable: false, on: false, cell: (p) => <td key="email" className="shrink dim cl-email-cell" data-testid="row-email">{p.email || ""}</td> },
  { key: "lists", label: "Lists", sortable: false, on: false, cell: (p, x) => <td key="lists" className="dim cl-lists-cell" data-testid="row-lists">{(x.listsOf[p.id] || []).join(", ")}</td> },
  // The deal's stage as the one pill (0004), off until asked for, and offered only where deals are a thing here: a
  // salon never sees "Deal" in the menu. The row's second line already says a proposal waiting.
  { key: "deal", label: "Deal", sortable: false, on: false, needs: (x) => !!x.dealsOn, cell: (p) => <td key="deal" className="shrink cl-deal-cell" data-testid="row-deal">{p.deal ? <StatePill kind="deal" value={p.deal.stage} /> : ""}</td> },
  { key: "actions", label: "", sortable: false, fixed: true, cell: (p, x) => <td key="actions" className="shrink cl-actions-cell"><PeopleRowActions p={p} bookingLink={x.bookingLink} drop={x.drop} /></td> },
];
// A person on a phone, in one cell (900px and under): the Inbox's row. Their face, their name and their state on the
// first line; on the second, why they need a person when they do, else their own last words; on the third, when they
// are coming and when you last spoke. The desktop's columns say the same things; a phone says them once, in this order,
// and leaves the answer to offers, the receptionist's word, where they came from and their lists to their page, one tap
// away. It was the desktop's cells re-gridded into a box: 119 to 168px a person, the face squeezed to an oval, the state
// 36px tall against the box's edge, the visit broken over two lines, three left edges in one card. The member's
// desktop columns do not reach it: whatever they hid, the row says the state.
// A row on a phone, the same for a person and a lead (the phone pass, D8): the face, the name and the state; one line
// of detail; one line of facts. People's cell (plCardCell) and Leads' (ldCardCell, leads-scope.jsx) are drawn by this
// one function, so the two scopes' lists are one list to the eye, part for part. `face` is initials or a glyph, and a
// picture over them (a lead's listing photo) that, failing to load, leaves the initials showing. The face is also the
// row's checkbox (clients.css): a tap there selects, and a tap on the rest opens.
// `tail`: a line of its own under the facts, where a page has one more thing to say of the row (the Pipeline's next
// step); People and Leads have none.
const plRowCard = ({ face, name, numeric = false, pill, lead = null, leadTestid = "row-words", facts, tail = null }) => (
  <td key="card" className="pl-card-cell">
    <div className="pl-card">
      <div className={`ix-thread-avatar pl-card-face${face.glyph ? " cl-row-avatar-glyph" : ""}`} aria-hidden="true">
        {face.glyph ? <Icon name={face.glyph} size={12} className="pl-card-glyph" /> : <span className="pl-card-initials">{face.initials}</span>}
        {face.image ? <img className="pl-card-photo" src={face.image} alt="" loading="lazy" decoding="async" onError={(e) => { const t = e && e.currentTarget; if (t && t.style) t.style.display = "none"; }} /> : null}
        {/* A lead's own mark over its photo, on its plate: one that fails to load uncovers the photo, as the desktop's
            tile does (LeadTile). A person has none. */}
        {face.mark ? <img className="pl-card-photo pl-card-mark" src={face.mark} alt="" loading="lazy" decoding="async" data-testid="row-mark" onError={(e) => { const t = e && e.currentTarget; if (t && t.style) t.style.display = "none"; }} /> : null}
        <Icon name="check" size={14} className="pl-card-tick" />
      </div>
      <div className={`pl-card-name${numeric ? " tabular" : ""}`}>{name}</div>
      {pill}
      {lead ? <div className="pl-card-lead" data-testid={leadTestid}>{lead}</div> : null}
      <div className="pl-card-facts">{facts}</div>
      {tail ? <div className="pl-card-tail">{tail}</div> : null}
    </div>
  </td>
);
const plCardCell = (p, { attention }) => {
  const byNumber = plIsNumber(p.name);
  const said = attention && attention[p.id];
  const words = said && (said.quoted || p.callSummary) ? (said.quoted ? `“${said.sentence}”` : said.sentence) : null;
  const asks = p.state === "needs_you" || p.state === "waiting_on_you";
  const time = p.nextVisitDay ? (p.nextVisit || "").split(" · ")[1] || "" : "";
  return plRowCard({
    face: plFace(p),
    name: p.name,
    numeric: byNumber,
    pill: <PeopleStatePill state={p.state} label={p.stateLabel} />,
    lead: asks && p.stateDetail ? p.stateDetail : words,
    leadTestid: asks && p.stateDetail ? "row-state-detail" : "row-words",
    facts: [
      p.nextVisitDay ? <span key="visit" className="pl-card-visit" data-testid="row-next-visit"><Icon name="calendar" size={11} />{time ? `${p.nextVisitDay} · ${time}` : p.nextVisitDay}</span> : null,
      <span key="last" className="pl-card-last">{p.lastContact.label}</span>,
    ],
  });
};
// A phone's one column, and the class its rows wear (clients.css draws the row from it).
const PL_PHONE_COLUMNS = [{ key: "card", label: "Person", sortable: false, pinned: true, cell: plCardCell }];
const plCardRowClass = () => "pl-card-row";
// The batch doors take fifty people at a time (contacts/consent, /receptionist, /notes).
const PL_BATCH = 50;
// The loaded rows and what a search found past them, each person once.
const plWithFound = (loaded, found) => { const seen = new Set(loaded.map((p) => p.id)); return [...loaded, ...found.filter((p) => !seen.has(p.id))]; };
// What People says while more people follow than it has loaded ("1,000 of 1,400 loaded"): its line under the table,
// and the Pipeline's line, which counts only the loaded too.
const plLoadedWords = (loaded, total) => `${loaded.toLocaleString()} of ${total.toLocaleString()} loaded`;
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
// `phone`: the bar is docked along the foot of a phone's pane and scrolls sideways, so its menus are placed against the
// window (MoreMenu escape), which that scroll cannot cut off.
// `lead` is a page's own act, drawn first after the count (the Pipeline's Mark as passed · N); `acts` names which of
// People's own it keeps ("lists", "consent", "receptionist", "note", "export"), every one where it is not given.
const PeopleBulkBar = ({ sel, rows, saved, savedRead = true, canEdit, canExport, onClear, onKeep = () => {}, flash, activeSaved = null, phone = false, sheet = null, onSheet = () => {}, onSelectAll = null, lead = null, acts = null }) => {
  const keeps = (a) => !acts || acts.includes(a);
  const [busy, setBusy] = React.useState(false);
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState("");
  // What is shown and selected, in the order shown. A person the view no longer shows -- a refresh moved them out of
  // Needs you, say -- is not counted, exported or written to. The bar used to count and write to every id selected,
  // and export only the loaded ones.
  const picked = rows.filter((p) => sel.has(p.id));
  const ids = picked.map((p) => p.id);
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
    const { made, filled, id } = await plMakeListWith(n, ids);
    if (!made.ok) { setBusy(false); flash({ tone: "danger", msg: <>{made.message || "Could not make the list."}</> }); return; }
    setBusy(false); setNaming(false); setName(""); onSheet(null);
    flash(filled.ok ? { msg: <>{ids.length} on the new list <b>{n}</b></>, undo: () => plUndoList(id, n, flash) } : window.refusalToast(filled, id ? `${n} was not made` : "Not added to the new list"));
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
  // With a list kept by hand open, the selection can leave it; the people stay.
  const dropFromList = () => run(() => window.__lists.drop(activeSaved.id, batch), () => <>{batch.length} taken off <b>{activeSaved.name}</b>{restWords}</>, () => { if (rest.length) onKeep(rest); else onClear(); });
  const exportCsv = () => { plDownload(`people-${new Date().toISOString().slice(0, 10)}.csv`, plCsv(picked)); flash({ msg: <>{picked.length} exported as a CSV</> }); };
  const isOwner = !!(window.__ME && window.__ME.role === "owner");
  const [noting, setNoting] = React.useState(false);
  const [note, setNote] = React.useState("");
  // A yes on sign-up forms waits for the note that says which forms: a stack of
  // signed slips is attested by it. The spoken ways are recorded at once.
  const [slips, setSlips] = React.useState(null);
  const [slipsNote, setSlipsNote] = React.useState("");
  const yesBy = (purpose, s) => (s.id === "form" ? () => { setSlips({ purpose, source: s }); setSlipsNote(""); } : () => yes(purpose, s));
  const closeSlips = () => { setSlips(null); setSlipsNote(""); onSheet(null); };
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
    if (r.ok) { setNoting(false); setNote(""); onSheet(null); if (rest.length) onKeep(rest); else onClear(); }
  };
  const sources = (window.__consentSources || []).filter((s) => s.id !== "customer_message");
  // A yes to offers is written (00100), so the only way a desk records one for a
  // whole selection is the form they signed.
  const offersSources = (window.__offersYesSources || []).filter((s) => s.id !== "customer_message");
  // On a phone (spec 4.5): one row docked along the foot of the pane -- ✕, the count, Add to list and ⋯ -- and a sheet
  // with the rest, where an act that asks something first asks it as a step. The step is the page's (`sheet`), so its
  // one keyboard listener shuts the sheet on Esc; the drafts are this bar's, as on a desktop. The row stacked seven
  // controls into a 312px pill over the rows, and each of its three forms ran off the screen's edge.
  if (phone) {
    const n = ids.length;
    const back = () => onSheet("more");
    // A spoken yes is recorded at the tap; a sign-up form's waits for the note that says which forms.
    const yesOnPhone = (purpose, s) => () => {
      if (s.id === "form") { setSlips({ purpose, source: s }); setSlipsNote(""); onSheet("slips"); return; }
      onSheet(null);
      yes(purpose, s);
    };
    const newList = () => { setName(""); onSheet("naming"); };
    const steps = {
      more: {
        title: `${n} selected`,
        body: (
          <div className="pp-sheet-rows">
            {onSelectAll && n < rows.length ? <PhoneSheetRow icon="check" label={`Select all ${rows.length}`} onClick={() => { onSheet(null); onSelectAll(); }} testid="bulk-select-all" /> : null}
            {canEdit && window.__setPersonConsentMany && sources.length > 0 ? <PhoneSheetRow icon="shield" label="Record a yes" next disabled={busy} onClick={() => onSheet("yes")} testid="bulk-yes" /> : null}
            {canEdit && isOwner && window.__setPersonReceptionistMany ? <PhoneSheetRow icon="agents" label="Receptionist" next disabled={busy} onClick={() => onSheet("receptionist")} testid="bulk-receptionist" /> : null}
            {canEdit && window.__appendPersonNotesMany ? <PhoneSheetRow icon="edit" label="Add a note" next disabled={busy} onClick={() => { setNote(""); onSheet("note"); }} testid="bulk-note" /> : null}
            {canExport ? <PhoneSheetRow icon="external" label="Export" meta="CSV" disabled={busy} onClick={() => { onSheet(null); exportCsv(); }} testid="bulk-export" /> : null}
            {canEdit && window.__lists && activeSaved && activeSaved.byHand ? <PhoneSheetRow icon="x" label={`Take off ${activeSaved.name}`} disabled={busy} onClick={() => { onSheet(null); dropFromList(); }} testid="bulk-drop-list" /> : null}
            {!canEdit ? <p className="pp-sheet-hint pp-sheet-rows-note">Only an owner or operator can add to lists or record a yes.</p> : null}
          </div>
        ),
      },
      yes: {
        title: "Record a yes",
        onBack: back,
        body: (
          <div className="pp-sheet-rows">
            <div className="pp-sheet-rows-h">To messages about their visit</div>
            {sources.map((s) => <PhoneSheetRow key={s.id} icon={PL_SOURCE_GLYPH[s.id] || "check"} label={s.label} next={s.id === "form"} disabled={busy} onClick={yesOnPhone("conversational", s)} testid={`bulk-yes-conversational-${s.id}`} />)}
            {window.__setPersonMarketingConsentMany && offersSources.length > 0 ? (
              <>
                <div className="pp-sheet-rows-h">To offers and news</div>
                {offersSources.map((s) => <PhoneSheetRow key={s.id} icon={PL_SOURCE_GLYPH[s.id] || "tag"} label={s.label} next={s.id === "form"} disabled={busy} onClick={yesOnPhone("marketing", s)} testid={`bulk-yes-marketing-${s.id}`} />)}
              </>
            ) : null}
          </div>
        ),
      },
      slips: {
        title: "Which forms they signed",
        onBack: () => { setSlips(null); setSlipsNote(""); onSheet("yes"); },
        body: (
          <>
            <input className="pp-input" autoFocus value={slipsNote} placeholder="Which slips, e.g. Saturday's" maxLength={200} disabled={busy} aria-label="Which forms they signed" onChange={(e) => setSlipsNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") recordSlips(); if (e.key === "Escape") closeSlips(); }} data-testid="bulk-form-note" />
            <button type="button" className="btn btn-primary pp-sheet-go" disabled={busy || !slipsNote.trim()} onClick={recordSlips} data-testid="bulk-form-save">Record</button>
          </>
        ),
      },
      receptionist: {
        title: "Receptionist",
        onBack: back,
        body: (
          <div className="pp-sheet-rows">
            <div className="pp-sheet-rows-h">For these people</div>
            {PL_MODES.map((m) => <PhoneSheetRow key={m.id} icon={m.icon} label={plModeWord(m.id)} disabled={busy} onClick={() => { onSheet(null); receptionist({ ...m, label: plModeWord(m.id) }); }} testid={`bulk-mode-${m.id}`} />)}
          </div>
        ),
      },
      note: {
        title: "Add a note",
        onBack: back,
        body: (
          <>
            <input className="pp-input" autoFocus value={note} placeholder="One line, under their notes" maxLength={200} disabled={busy} aria-label="The note" onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addNote(); if (e.key === "Escape") { setNote(""); onSheet(null); } }} data-testid="bulk-note-line" />
            <button type="button" className="btn btn-primary pp-sheet-go" disabled={busy || !note.trim()} onClick={addNote} data-testid="bulk-note-save">Add</button>
          </>
        ),
      },
      naming: {
        title: "New list",
        body: (
          <>
            <input className="pp-input" autoFocus value={name} placeholder="Name the list" maxLength={60} disabled={busy} aria-label="The list's name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createAndAdd(); if (e.key === "Escape") { setName(""); onSheet(null); } }} data-testid="bulk-list-name" />
            <button type="button" className="btn btn-primary pp-sheet-go" disabled={busy || !name.trim()} onClick={createAndAdd} data-testid="bulk-list-save">Make it</button>
          </>
        ),
      },
    };
    const step = n > 0 && sheet ? steps[sheet] : null;
    return (
      <>
        <div className="cl-bulk pp-bulk" role="toolbar" aria-label="Selected people" data-testid="bulk-bar">
          <button type="button" className="pp-bar-icon" aria-label="Clear the selection" onClick={onClear} data-testid="bulk-clear"><Icon name="x" size={18} /></button>
          <span className="cl-bulk-count">{n ? <><b>{n}</b> selected</> : "Tap people to select them"}</span>
          {canEdit && window.__lists && n > 0 && (
            <MoreMenu
              btnClass="btn btn-sm"
              escape
              label="Add to list"
              title="Add to a list"
              gated={busy ? "One moment — the last change is still saving" : null}
              items={savedRead ? [
                { header: "Add to" },
                ...saved.filter((s) => s.byHand).map((s) => ({ label: s.name, icon: "filter", onClick: () => addTo(s) })),
                { label: "New list…", icon: "plus", onClick: newList },
              ] : [
                // Lists that could not be read are not offered; a new one can still be made.
                { header: "Your saved lists couldn't be read" },
                { label: "New list…", icon: "plus", onClick: newList },
              ]}
            />
          )}
          {n > 0 && <button type="button" className="pp-bar-icon" aria-label={`More for the ${n} selected`} aria-haspopup="dialog" onClick={() => onSheet("more")} data-testid="bulk-more"><Icon name="more" size={18} /></button>}
        </div>
        {step && (
          <PhoneSheet title={step.title} onBack={step.onBack || null} onClose={() => onSheet(null)} testid="bulk-sheet">
            {step.body}
          </PhoneSheet>
        )}
      </>
    );
  }
  return (
    <div className="cl-bulk" role="toolbar" aria-label="Selected people" data-testid="bulk-bar">
      <span className="cl-bulk-count"><b>{ids.length}</b> selected</span>
      {lead}
      {canEdit && keeps("lists") && window.__lists && !naming && (
        <MoreMenu
          btnClass="btn btn-sm"
          escape={phone}
          label="Add to list"
          title="Add to a list"
          gated={busy ? "One moment — the last change is still saving" : null}
          items={savedRead ? [
            { header: "Add to" },
            ...saved.filter((s) => s.byHand).map((s) => ({ label: s.name, icon: "filter", onClick: () => addTo(s) })),
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
      {/* With a list kept by hand open, the selection can leave it; the people stay. The rows leave the view, so the bar closes with them.
          A smart list's rule says who is on it: nobody is taken off one by hand. */}
      {canEdit && window.__lists && activeSaved && activeSaved.byHand && !naming && (
        <button className="btn btn-sm" disabled={busy} onClick={dropFromList} data-testid="bulk-drop-list">
          <Icon name="x" size={11} /> Take off {activeSaved.name}
        </button>
      )}
      {canEdit && keeps("consent") && window.__setPersonConsentMany && sources.length > 0 && !slips && (
        <MoreMenu
          btnClass="btn btn-sm"
          escape={phone}
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
      {canEdit && keeps("receptionist") && isOwner && window.__setPersonReceptionistMany && (
        <MoreMenu
          btnClass="btn btn-sm"
          escape={phone}
          label="Receptionist"
          title="What the receptionist does for these people"
          gated={busy ? "One moment — the last change is still saving" : null}
          items={[
            { header: "For these people…" },
            ...PL_MODES.map((m) => ({ label: plModeWord(m.id), icon: m.icon, onClick: () => receptionist({ ...m, label: plModeWord(m.id) }) })),
          ]}
        />
      )}
      {canEdit && keeps("note") && window.__appendPersonNotesMany && !noting && (
        <button className="btn btn-sm" disabled={busy} onClick={() => setNoting(true)} data-testid="bulk-note"><Icon name="edit" size={12} /> Add a note</button>
      )}
      {canEdit && noting && (
        <span className="cl-bulk-naming">
          <input autoFocus value={note} placeholder="One line, under their notes" maxLength={200} disabled={busy} data-testid="bulk-note-line" onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addNote(); if (e.key === "Escape") { setNoting(false); setNote(""); } }} />
          <button className="btn btn-sm btn-primary" disabled={busy || !note.trim()} onClick={addNote}>Add</button>
        </span>
      )}
      {canExport && keeps("export") && <button className="btn btn-sm" disabled={busy} onClick={exportCsv} data-testid="bulk-export"><Icon name="external" size={12} /> Export CSV</button>}
      {!canEdit && <span className="cl-prof-aut-hint">{keeps("consent") ? "Only an owner or operator can add to lists or record a yes." : window.gateTitle ? window.gateTitle("approve", "add people to a list") : null}</span>}
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
    const { made, filled, id } = await plMakeListWith(n, ids);
    if (!made.ok) { setBusy(false); flash({ tone: "danger", msg: <>{made.message || "Could not make the list."}</> }); return; }
    setBusy(false); setOpen(false); setName("");
    flash(filled.ok ? { msg: <>{ids.length} kept as <b>{n}</b></>, undo: () => plUndoList(id, n, flash) } : window.refusalToast(filled, "Not kept as a list"));
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
    const r = await plAddPerson({ name, phone });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    flash({ msg: plAddedWords({ name, phone }, r.existed) });
    close();
    onAdded(r.id);
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

// A sheet from the bottom of a phone for People's own small jobs -- Add a person, the open list's rename, delete and
// "Save these", and what a selection can become: a handle, a title, one way out, and the job. A step inside a sheet
// (`onBack`) has a way back to the list it came from. The page's own dialog: `pl-sheet` keeps it out of PL_OVERLAY,
// and the page's one keyboard listener closes it on Esc. Hookless: the page holds what is in it.
const PhoneSheet = ({ title, onClose, closeLabel = "Cancel", onBack = null, testid, children }) => (
  <>
    <div className="sb-sheet-backdrop" onClick={onClose} />
    {/* Its handle says it can be pulled: a thumb pulls it down, and it goes the way it came (data-bits touchSwipe, leaving). */}
    <div className="sb-sheet pl-sheet pp-sheet" role="dialog" aria-modal="true" aria-label={title} data-testid={testid} ref={window.leaving ? window.leaving("people-sheet") : undefined} {...(window.touchSwipe ? window.touchSwipe({ onDown: onClose, when: plPhoneNow }) : {})}>
      <div className="pp-sheet-handle" aria-hidden="true" />
      <div className="pp-sheet-head">
        {onBack && <button type="button" className="pp-sheet-back" onClick={onBack} aria-label="Back" data-testid={`${testid}-back`}><Icon name="chevron" size={18} /></button>}
        <h2 className="pp-sheet-title">{title}</h2>
        {closeLabel && <button type="button" className="pp-sheet-close" onClick={onClose} data-testid={`${testid}-close`}>{closeLabel}</button>}
      </div>
      <div className="pp-sheet-body">{children}</div>
    </div>
  </>
);

// One row of a phone sheet's list: its glyph, its words, what it holds (a file's kind), and a chevron when it opens a
// step of its own. `gate` is window.gate's answer for a row the member's role refuses: focusable, described, inert.
const PhoneSheetRow = ({ icon = null, label, meta = null, next = false, danger = false, disabled = false, onClick, testid, gate = null }) => (
  <button type="button" className={`pp-sheet-row${danger ? " danger" : ""}`} disabled={disabled} onClick={onClick} data-testid={testid} {...(gate || {})}>
    {icon ? <Icon name={icon} size={16} /> : null}
    <span className="pp-sheet-row-words">{label}</span>
    {meta ? <span className="pp-sheet-row-meta">{meta}</span> : null}
    {next ? <Icon name="chevron" size={14} className="pp-sheet-row-next" /> : null}
  </button>
);

// Add a person on a phone: the two fields stacked, 16px, a number pad for the number, one wide button. The desktop's
// form stands inline in its controls row; on a phone it was that row, 479px wide on a 365px screen, with Add and
// Cancel past the edge and the page scrolling sideways.
const PeopleAddSheet = ({ draft, onDraft, onAdd, onClose }) => (
  <PhoneSheet title="Add a person" onClose={onClose} testid="add-person-sheet">
    <label className="pp-field">
      <span className="pp-field-label">Name <span className="pp-field-opt">(optional)</span></span>
      <input className="pp-input" autoFocus value={draft.name} maxLength={80} autoComplete="name" disabled={draft.busy} onChange={(e) => onDraft({ name: e.target.value })} data-testid="add-person-name" />
    </label>
    <label className="pp-field">
      <span className="pp-field-label">Mobile number</span>
      <input className="pp-input" type="tel" inputMode="tel" autoComplete="tel" value={draft.phone} maxLength={24} disabled={draft.busy} aria-invalid={draft.error ? true : undefined} aria-describedby={draft.error ? "add-person-error" : undefined} onChange={(e) => onDraft({ phone: e.target.value, error: null })} onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }} data-testid="add-person-phone" />
    </label>
    <window.FieldError id="add-person-error" message={draft.error} testid="add-person-error" />
    <p className="pp-sheet-hint">A number that is already here opens that person instead of adding them twice.</p>
    <button type="button" className="btn btn-primary pp-sheet-go" disabled={draft.busy || !draft.phone.trim()} onClick={onAdd} data-testid="add-person-save">{draft.busy ? "Adding…" : "Add"}</button>
  </PhoneSheet>
);

// The open list's own acts on a phone, from the more-menu: rename it, delete it, or keep what is shown as a list. A
// desktop does these on the list's title line, which a phone does not draw. The doors are the desktop's.
const PeopleListActSheet = ({ act, list, count, draft, onDraft, onGo, onClose }) => {
  if (act === "delete") {
    return (
      <PhoneSheet title="Delete the list" onClose={onClose} closeLabel={null} testid="list-act-sheet">
        <Confirm block question={`Delete “${list.name}”?`} detail="The people stay." yes="Yes, delete" danger busy={draft.busy} error={draft.error} onYes={onGo} onNo={onClose} testid="delete-list" />
      </PhoneSheet>
    );
  }
  const renaming = act === "rename";
  return (
    <PhoneSheet title={renaming ? "Rename the list" : `Save these ${count} as a list`} onClose={onClose} testid="list-act-sheet">
      <label className="pp-field">
        <span className="pp-field-label">{renaming ? "Its name" : "Name the list"}</span>
        <input className="pp-input" autoFocus value={draft.name} maxLength={60} disabled={draft.busy} aria-invalid={draft.error ? true : undefined} aria-describedby={draft.error ? "list-act-error" : undefined} onChange={(e) => onDraft({ name: e.target.value, error: null })} onKeyDown={(e) => { if (e.key === "Enter") onGo(); }} data-testid={renaming ? "list-rename-name" : "save-shown-name"} />
      </label>
      <window.FieldError id="list-act-error" message={draft.error} testid="list-act-error" />
      <button type="button" className="btn btn-primary pp-sheet-go" disabled={draft.busy || !draft.name.trim()} onClick={onGo} data-testid={renaming ? "list-rename-save" : "save-shown-save"}>{draft.busy ? "Saving…" : renaming ? "Save" : "Keep it"}</button>
    </PhoneSheet>
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
// Hold to talk is Ask's own hook (ask-hooks.jsx), loaded before this file in both lists (manifest.ts:52,
// Chanlytics.html:90). Where it is not -- a unit harness that draws this page on its own -- the stand-in answers
// "no recogniser", and declares the SAME THREE HOOKS the real one does (one state, two refs) so LeadsReal keeps
// one hook order either way and the finder simply offers no mic.
const PL_NO_TALK = { canTalk: false, listening: false, start: () => {}, stop: () => {} };
const usePlNoTalk = () => { useState(false); React.useRef(null); React.useRef(""); React.useRef(false); return PL_NO_TALK; };

const PL_OVERLAY = '.app-root [role="menu"]:not(.pl-sheet):not(.pl-cols-menu):not(.pl-peek):not(.pl-finder), .app-root [role="dialog"]:not(.pl-sheet):not(.pl-cols-menu):not(.pl-peek):not(.pl-finder)';

/* ------------------------------------------------------------ the list page, in both scopes */
// People and Leads are one page with two scopes, and each scope is a component of its own: PeopleReal and LeadsReal,
// which the shell mounts apart (app-shell.jsx shellMountKey), each holding only its own state. What a list page is in
// either scope they take from these two hooks, in this order: usePlControls before the view works out its rows (the
// width, the toast, the selection, the saved sort and columns, the words in the box), and usePlPlace after (the
// cursor, the place each view is left in, the first rows, and the page's one keyboard listener).

/**
 * A list page's controls, before it knows its rows.
 * - scope: "people" | "leads", whose saved view this is (memberships.views, and this device's copy).
 * - cols, phoneCols: the columns a desktop may show, and a phone's one cell a row.
 * - colCtx: what a column's default depends on, `{ withCalendar }` or `{ hasCenter }`.
 * - people: the People surface, which carries the workspace's copy of every view, Leads' included.
 * - sortFirst: `{ by, dir }`, the sort before anyone chose one.
 * - railRow: under Leads, the rail's row, which its saved view carries too.
 */
// `extraDefaults`: the page's own keys in its saved view, beside the sort and the columns, with their defaults (the
// Pipeline's `{ layout }`). A value of another type than its default's is not the member's choice, and the default stands.
const usePlControls = ({ scope, cols, phoneCols, colCtx, people, sortFirst, railRow = null, extraDefaults = null }) => {
  // The phone's search: open, the bar is the field (PeoplePhoneBar). Words in the box keep it open.
  const [searchOpen, setSearchOpen] = useState(false);
  // A selection on a phone: the step its sheet is on (null when shut), and More › Select people, a selection begun with
  // nobody picked yet. The page's, so its one keyboard listener shuts the sheet on Esc and the sheet is hookless.
  const [bulkSheet, setBulkSheet] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [phone, setPhone] = useState(plPhoneNow);
  React.useEffect(() => {
    const mq = window.matchMedia ? window.matchMedia(PL_PHONE_QUERY) : null;
    if (!mq || !mq.addEventListener) return undefined;
    const on = () => setPhone(!!mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const canExport = !!(window.__href && (!window.canDo || window.canDo("export")));
  const [toastNode, plFlash] = window.usePPToast();
  // The selection, by id. Cleared when the view changes: a bar counting people
  // that are no longer on screen is the kind of bug bulk actions are made of.
  const [sel, setSel] = useState(() => new Set());
  // One function for the page's life: a memoised row (people-table.jsx PeopleRow) is handed it, and a new one every
  // draw would redraw every row on every draw.
  const toggleSel = React.useCallback((id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  // "Select all 1,240 that match": the bulk bar hands the view's filters to the server instead of a list of ids.
  const [allMatching, setAllMatching] = useState(false);
  // Clearing a selection lets go of everything that came with it: the view "all N that match" stood for, the
  // Select-people mode and the sheet's step. Esc, ✕ and Clear all clear it here. Esc left "all N that match" set, and
  // the next lead selected was counted, and acted on, as the whole view.
  const clearSelection = () => { setSel(new Set()); setAllMatching(false); setSelectMode(false); setBulkSheet(null); };
  // The view the workspace remembers for this member (memberships.views, read
  // with the surface) wins over what this device remembers; the device copy
  // stays as the fallback for a route that is not there yet.
  const remembered = React.useMemo(() => ({ ...plLoadView(scope), ...((people.views && people.views[scope]) || {}) }), []); // eslint-disable-line react-hooks/exhaustive-deps
  // The sort as the page starts it: the member's where it is one this page can draw, else the page's own first.
  const firstBy = plSortKeys(cols).includes(remembered.sortBy) ? remembered.sortBy : sortFirst.by;
  const firstDir = remembered.sortDir === "asc" || remembered.sortDir === "desc" ? remembered.sortDir : sortFirst.dir;
  const [sortBy, setSortBy] = useState(firstBy);
  const [sortDir, setSortDir] = useState(firstDir);
  // The columns this member chose to show or hide with the Columns menu; a column they never touched keeps its
  // default (PL_COLUMNS). The menu's open state is the page's, so its one keyboard listener closes it on Esc.
  const [colChoices, setColChoices] = useState(() => plColumnChoices(cols, remembered.columns));
  const [colsOpen, setColsOpen] = useState(false);
  // Whether the table has scrolled sideways, for the hairline beside Person: kept here so the table stays hookless.
  const [scrolledX, setScrolledX] = useState(false);
  // A view is the sort and the columns, and under Leads the rail's row. The strip's tab was remembered too; a view
  // saved before it went carries an attentionTab this ignores, and the next save drops it. Every save sends every key
  // the page owns, because member_view_set replaces the page's whole object (00113): a save of the sort alone would
  // lose the columns.
  const pickExtra = (v) => {
    if (!extraDefaults) return null;
    const out = {};
    for (const k of Object.keys(extraDefaults)) out[k] = v && typeof v[k] === typeof extraDefaults[k] ? v[k] : extraDefaults[k];
    return out;
  };
  const [extraView, setExtraViewState] = useState(() => pickExtra(remembered));
  const viewAs = (by, dir, columns, row, extra) => ({
    ...(scope === "leads" ? { list: row, sortBy: by, sortDir: dir, columns } : { sortBy: by, sortDir: dir, columns }),
    ...(extra || {}),
  });
  // What the server is taken to hold: the view as the page starts it, so a view nobody touched is never written back.
  // It was the raw remembered view, whose missing sort compared unequal to the page's first one, so a member who had
  // saved nothing wrote the defaults on every first open.
  const savedView = React.useRef(JSON.stringify(viewAs(firstBy, firstDir, plColumnChoices(cols, remembered.columns), remembered.list || "all", pickExtra(remembered))));
  // One saver for the page's life, so its saves go one at a time (plViewSaver), and it saves THIS scope's view:
  // People's is views.people, the Leads scope's is views.leads, and the page is remounted when the scope changes.
  const viewSaver = React.useRef(null);
  if (!viewSaver.current) viewSaver.current = plViewSaver(scope);
  // The workspace's copy of every view rides with the People surface. On a cold open of Leads that surface lands
  // AFTER the page is up (the boot reads the page in the address first, and Leads' gate waits for Leads alone), so
  // `remembered` above had only this device's copy to go on -- and the page then SAVED that copy, or its defaults,
  // over what the member had chosen on another computer. Until the workspace's copy has been seen nothing is saved
  // back, unless the owner chose a sort or a column here, which stands. When the copy arrives it is taken, once;
  // taking it is not a change to save back either.
  const peopleLanded = people !== PL_NO_PEOPLE;
  const serverView = (peopleLanded && people.views && people.views[scope]) || null;
  const viewKnown = React.useRef(peopleLanded);
  const viewTouched = React.useRef(false);
  React.useEffect(() => {
    if (viewKnown.current || !peopleLanded) return;
    viewKnown.current = true;
    if (viewTouched.current || !serverView) return;
    const by = plSortKeys(cols).includes(serverView.sortBy) ? serverView.sortBy : sortBy;
    const dir = serverView.sortDir === "asc" || serverView.sortDir === "desc" ? serverView.sortDir : sortDir;
    const columns = plColumnChoices(cols, serverView.columns);
    const extra = pickExtra(serverView);
    savedView.current = JSON.stringify(viewAs(by, dir, columns, railRow, extra));
    setSortBy(by);
    setSortDir(dir);
    setColChoices(columns);
    if (extra) setExtraViewState(extra);
  }, [peopleLanded]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const view = viewAs(sortBy, sortDir, colChoices, railRow, extraView);
    plSaveView(scope, view);
    // The workspace's copy, once per change and never for the view it already holds. The choices change only when
    // what they say does (pickColumn keeps them for Person), so this runs once per change.
    const key = JSON.stringify(view);
    if (key === savedView.current || !window.__saveView) return;
    if (!viewKnown.current && !viewTouched.current) return;
    savedView.current = key;
    viewSaver.current(view);
  }, [sortBy, sortDir, colChoices, railRow, JSON.stringify(extraView)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [q, setQ] = useState("");
  const searchRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  // D5: a list that is moving shows no hover: the pane carries data-scrolling while the list scrolls, and the tips and
  // cards hide under it (leads.css). Heard on the pane in the capture phase: a scroll does not bubble, and on a desktop
  // the box that scrolls is the table's own, inside the pane, so the pane's own scroll never came and the cards stayed
  // up over a moving list. Only the list's box counts (ldScroller): a menu scrolling inside the pane is not the list
  // moving. One listener for the page's life, taken down with it.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || !el.addEventListener) return undefined;
    let t = null;
    const on = (e) => {
      if (!e || !e.target || e.target !== ldScroller(el)) return;
      el.setAttribute("data-scrolling", "1");
      if (t) clearTimeout(t);
      t = setTimeout(() => el.removeAttribute("data-scrolling"), 160);
    };
    el.addEventListener("scroll", on, { passive: true, capture: true });
    return () => { el.removeEventListener("scroll", on, { capture: true }); if (t) clearTimeout(t); };
  }, []);

  const onSort = (key) => {
    viewTouched.current = true;
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    // A name starts at A, the soonest visit first, and the Pipeline's Stage in its own order and its next step the
    // soonest first (Leads' stage column is a rank of its own, most first); any other number, most first.
    else { setSortBy(key); setSortDir(key === "name" || key === "visits" || (scope === "pipeline" && (key === "stage" || key === "next")) ? "asc" : "desc"); }
  };
  // A sort the member picked from a menu rather than a heading (a phone's more-menu): theirs, like a heading's.
  const pickSort = (by, dir) => { viewTouched.current = true; setSortBy(by); setSortDir(dir); };
  // One of the page's own keys, chosen: theirs, saved with the rest of the view.
  const setExtraView = (patch) => { viewTouched.current = true; setExtraViewState((x) => ({ ...(x || {}), ...patch })); };
  // The columns drawn (every one this scope can show, those this member turned off marked for a desktop to hide).
  // Kept while nothing they are made of changed, so a memoised row sees the same list from one draw to the next.
  // On a phone both scopes draw one cell a row, People's: plCardCell for a person, ldCardCell (leads-scope.jsx) for a
  // lead, one plRowCard between them. Leads' cards of every column (#789) were a second look for the same list.
  const colKey = JSON.stringify(colCtx);
  const columns = React.useMemo(() => (phone ? phoneCols : plShownColumns(plDrawnColumns(cols, colChoices, colCtx), phone)), [cols, colChoices, colKey, phone]); // eslint-disable-line react-hooks/exhaustive-deps
  const colOptions = plColumnOptions(cols, colChoices, colCtx);
  // Show or hide one column; Person and the row's actions are not the member's to hide. A column put back the way its
  // default has it is no choice any more, so it follows the default again: a receptionist turned off and on again
  // gives way to Visits once a calendar connects, as it does for everyone.
  const pickColumn = (key) => setColChoices((ch) => {
    viewTouched.current = true;
    const c = cols.find((x) => x.key === key);
    if (!c || plLocked(c)) return ch;
    const on = !plShows(c, ch, colCtx);
    const rest = { ...ch };
    delete rest[key];
    return on === plShows(c, {}, colCtx) ? rest : { ...rest, [key]: on };
  });
  // Where Esc puts focus when it closes the menu: back on the button that opened it.
  const colsButton = React.useRef(null);
  return {
    phone, searchOpen, setSearchOpen, bulkSheet, setBulkSheet, selectMode, setSelectMode, canExport, toastNode, plFlash,
    sel, setSel, toggleSel, allMatching, setAllMatching, clearSelection,
    sortBy, setSortBy, sortDir, setSortDir, onSort, pickSort, colsOpen, setColsOpen, scrolledX, setScrolledX,
    columns, colOptions, pickColumn, colsButton, q, setQ, searchRef, scrollRef,
    extraView, setExtraView,
  };
};

/**
 * The rows' place, once the view has worked out its rows: the cursor, where each view was left, the first rows, and
 * the page's one keyboard listener.
 * - controls: usePlControls' answer, whose words, selection and scrolling pane these are.
 * - page: "people" | "leads", whose places the tab keeps (window.__tabMemory); view: the view the rows are of.
 * - ids: the rows shown, in their order. noun: what the table calls a row (people-table.jsx), its rows' id.
 * - landed: whether the rows on screen are this view's, in the order asked; a place's scroll waits for them.
 * - selectionOf: what a selection belongs to; when it changes, the selection goes.
 * - extra, onPlace(p, again): what else a view's place holds (Leads' map), and the view's own part of putting one
 *   back (`again`: a view opened after the first).
 */
const usePlPlace = ({ controls, page, view, ids, noun, landed = true, selectionOf, extra = null, onPlace = null }) => {
  const { phone, setSearchOpen, setBulkSheet, selectMode, setSelectMode, sel, setSel, toggleSel, setAllMatching, clearSelection, colsOpen, setColsOpen, colsButton, q, setQ, searchRef, scrollRef } = controls;
  // The selection goes with the VIEW, not with the words in the box: someone who selects forty, types a name to find
  // two more and clears it again still has their forty. Both bars count and act on only the rows they show
  // (shown AND selected), so a row the words hide is never acted on unseen; "all N that match" is a claim about what
  // is shown, so the words do take that back.
  React.useEffect(() => { setSel(new Set()); setAllMatching(false); setSelectMode(false); setBulkSheet(null); }, [selectionOf]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { setAllMatching(false); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  // A keyboard walks the rows the way the Inbox walks threads: J/K or ↓/↑ move the cursor, x or Space selects the row
  // under it, Enter opens it, / goes to the search, Esc closes the Columns menu and then clears the selection. Never
  // while typing, never with a modifier, never behind a menu or a sheet. The cursor's row shows its actions, as a
  // hovered row does (clients.css).
  const [cursor, setCursor] = useState(null);
  React.useEffect(() => { setCursor((c) => (c && ids.includes(c) ? c : null)); }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const moveCursor = (step) => setCursor((c) => {
    const i = c ? ids.indexOf(c) : -1;
    return ids[step > 0 ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1)];
  });
  // The cursor's row takes focus, so a screen reader says it and Tab carries on from it, and is scrolled to (under the
  // sticky header: scroll-padding-top). Not when focus is already on it or in it: a row focused by Tab or a click put
  // the cursor here itself (onFocus). It was a scroll inside the state updater, and the row never took focus.
  // A cursor that came back with the view (the page keeps the owner's place, below) marks its row and takes nothing:
  // the list has just been put back where it was, and a scrollIntoView after that moved it on again.
  const cursorCameBack = React.useRef(null);
  React.useEffect(() => {
    if (!cursor || !document.getElementById) return;
    if (cursorCameBack.current === cursor) { cursorCameBack.current = null; return; }
    cursorCameBack.current = null;
    // The row's id wears the table's own noun (people-table.jsx), so the cursor and the peek's focus rule find the
    // same element under Leads as under People.
    const row = document.getElementById(`${noun}-${cursor}`);
    const active = document.activeElement;
    if (!row || row === active || (active && row.contains && row.contains(active))) return;
    if (row.focus) row.focus({ preventScroll: true });
    if (row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
  }, [cursor]);   // eslint-disable-line react-hooks/exhaustive-deps
  // The page keeps the owner's place in each view (plPlaceLoad, above), each with its own words in the box, its cursor
  // and its scroll, and under Leads its map. Leads stays mounted from one view to the next, so a view that is opened
  // -- by the first draw, the rail, Back -- is given ITS place, or none, and never the last view's filters. People's
  // views keep theirs the same way (the loading standard's F): everyone, a smart list, a kept list or a state -- a
  // search typed on a list was gone after a trip to a profile.
  const placeOf = React.useRef(undefined);  // the view whose place the state below holds
  const placeNow = React.useRef(null);      // that view and its place as last drawn: what a scroll is saved with
  const placeTop = React.useRef(0);
  const placeDue = React.useRef(null);      // a scroll position waiting for its view's rows
  // A fresh mount draws its first rows only (PL_FIRST_ROWS) and the rest a frame later: the switch between People
  // and Leads is a remount, and the table's rows were most of what it waited on (measured on the salon: a 250 ms
  // draw of 96 leads, 125 ms with the first 24). A place to put back -- a scroll, a cursor -- needs every row on the
  // first draw, so it draws them all. The budget is the mount's: a view change inside the page never narrows it.
  const [rowBudget, setRowBudget] = useState(() => {
    const p = plPlaceLoad(page, view);
    return p && (p.top || p.cursor) ? Infinity : PL_FIRST_ROWS;
  });
  React.useEffect(() => {
    if (rowBudget === Infinity) return undefined;
    const lift = () => setRowBudget(Infinity);
    if (typeof requestAnimationFrame !== "function") { lift(); return undefined; }
    // The next frame, or a beat: a tab in the background gets no frames, and its rows must not wait for one.
    const frame = requestAnimationFrame(lift);
    const beat = setTimeout(lift, 120);
    return () => { cancelAnimationFrame(frame); clearTimeout(beat); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const p = plPlaceLoad(page, view) || {};
    setQ(p.q || "");
    cursorCameBack.current = p.cursor || null;
    setCursor(p.cursor || null);
    if (onPlace) onPlace(p, placeOf.current !== undefined);
    placeTop.current = p.top || 0;
    placeDue.current = { view, top: p.top || 0, q: p.q || "", fresh: true };
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  // Saved as it changes. The draw that opens a view still holds the last view's state, so it saves nothing.
  const extraKey = extra ? JSON.stringify(extra) : "";
  React.useEffect(() => {
    if (placeOf.current !== view) { placeOf.current = view; return; }
    plPlaceSave(page, view, { q, cursor, ...extra, top: placeTop.current });
  }, [view, q, cursor, extraKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (placeOf.current === view) placeNow.current = { view, place: { q, cursor, ...extra } };
  // The list goes back to where it was once the rows on screen are this view's (the surface says which view it
  // holds) AND are the ones its own words leave. Scrolled before the view landed, it would be the last view's rows
  // that moved. Scrolled on the draw that opens the view -- which still draws every row, the words being put back
  // only on the next -- the browser re-anchored the list as the words shrank it: 500 became 122 on production.
  // Words that are no longer the place's are the owner's, typed since: they have moved on, and nothing is put back.
  React.useEffect(() => {
    const due = placeDue.current;
    if (!due || due.view !== view) return;
    if (q !== due.q) { if (!due.fresh) placeDue.current = null; due.fresh = false; return; }
    due.fresh = false;
    if (!landed) return;
    placeDue.current = null;
    const sc = ldScroller(scrollRef.current);
    if (sc) sc.scrollTop = due.top;
  }, [view, landed, q]); // eslint-disable-line react-hooks/exhaustive-deps
  // How far the list is scrolled, heard on the pane in the capture phase: a scroll does not bubble, and on a desktop
  // the box that scrolls is the table's own, inside the pane. Saved once it settles, with the place as last drawn.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || !el.addEventListener) return undefined;
    let t = null;
    const on = (e) => {
      const sc = e && e.target;
      if (!sc || sc !== ldScroller(el)) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const now = placeNow.current;
        // A scroll while a view's place still waits for its rows is the browser fitting the rows before them.
        if (!now || placeDue.current) return;
        placeTop.current = sc.scrollTop;
        plPlaceSave(page, now.view, { ...now.place, top: sc.scrollTop });
      }, 200);
    };
    el.addEventListener("scroll", on, { passive: true, capture: true });
    return () => { el.removeEventListener("scroll", on, { capture: true }); if (t) clearTimeout(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
      // The page's own overlays first, in the order Esc closes them: the peek, then the finder, then the Columns
      // menu, then the selection. The peek holds only Esc -- J and K keep walking the rows behind it, and the peek
      // follows the cursor -- so it is not in PL_OVERLAY either.
      if (e.key === "Escape" && k.peekOpen) { e.preventDefault(); k.closePeek(); return; }
      // The finder holds every key while it is open: its input, its pickers and its buttons are its own.
      if (k.finderOpen) { if (e.key === "Escape") { e.preventDefault(); k.closeFinder(); } return; }
      // The Columns menu: Esc closes it, and the rows hold still behind it. At a phone's
      // width the stylesheet hides it (clients.css, 900px and under), so one left open as the window narrowed is closed
      // and the key is the page's as ever: it held every key but Esc, the lists sheet's Esc included. The phone's lists
      // sheet listens for its own Esc.
      // Asked at the key, not from the last draw: the window may have narrowed since, and this is the one moment it matters.
      if (k.menuOpen && plPhoneNow()) k.closeMenu();
      else if (k.menuOpen) { if (e.key === "Escape") { e.preventDefault(); k.closeMenu(); } return; }
      // The phone's sheets hold every key; the Lists sheet closes on its own Esc listener, People's own two on this one.
      if (k.sheetOpen) { if (e.key === "Escape" && k.closeSheet) { e.preventDefault(); k.closeSheet(); } return; }
      // Anything else open over the page has the keys: a menu, the notifications or a sidebar menu listens from when it
      // opens, after this listener, so it is still on the page as this one hears the key; the ? sheet takes its Esc.
      if (document.querySelector(PL_OVERLAY)) return;
      if (e.key === "/") { e.preventDefault(); k.focusSearch(); return; }
      // Esc clears a selection wherever focus is, a bulk-bar button included.
      if (e.key === "Escape") {
        if (k.selected) { e.preventDefault(); k.clearSel(); }
        return;
      }
      // F opens the finder on the Leads scope, for whoever may find; the gate says why to everyone else, at the
      // button, so the key is simply not theirs.
      if ((e.key === "f" || e.key === "F") && k.canFind) { e.preventDefault(); k.find(); return; }
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
      // C calls the lead under the cursor from the owner's own phone, and arms the call question.
      else if ((e.key === "c" || e.key === "C") && k.cursor && k.call) { e.preventDefault(); k.call(k.cursor); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // What the keyboard's one listener reads, left by the view as its draw ends: this draw's rows, cursor and doors, and
  // the view's own (`own`: what Enter opens, whether a row may be selected, the sheets, and under Leads the peek, the
  // finder, F and C).
  const keysWith = (own) => {
    keys.current = {
      ids,
      cursor,
      move: moveCursor,
      toggle: toggleSel,
      // sel.size, not the rows shown as the bar counts them: Esc can still drop a selection nobody can see.
      // A Select-people selection with nobody picked yet is one too.
      selected: sel.size > 0 || (phone && selectMode),
      clearSel: clearSelection,
      // On a phone the field is the bar's, behind its button: / opens it, and the field takes focus as it draws.
      focusSearch: () => { if (phone) setSearchOpen(true); if (searchRef.current) searchRef.current.focus(); },
      menuOpen: colsOpen,
      closeMenu: () => { setColsOpen(false); if (colsButton.current) colsButton.current.focus(); },
      ...own,
    };
  };
  const toggleAll = () => { setAllMatching(false); setSel((s) => (ids.length && ids.every((id) => s.has(id)) ? new Set() : new Set(ids))); };
  return { cursor, setCursor, rowBudget, keysWith, toggleAll };
};

/* ------------------------------------------------------------------------------ People */
const PeopleReal = ({ onOpenProfile = () => {}, initialSegment = null, initialSaved = null, initialState = null, onNavigate = null, newList = false }) => {
  const people = usePeople();
  const nav = onNavigate || ((to) => window.CHANLY.nav(to));
  const rows = people.rows;
  const lists = people.lists;
  const agg = people.aggregates;
  const withCalendar = !!(people.calendar && people.calendar.state === "ok");
  // Whether deals are on here (the surface's dealsOn, 0008): the Deal column is offered, and the switch has the
  // Pipeline, only then.
  const dealsOn = !!people.dealsOn;
  const listFor = (id) => (id && lists.some((l) => l.id === id) ? id : null);
  const [listId, setListId] = useState(listFor(initialSegment));
  React.useEffect(() => { setListId(listFor(initialSegment)); }, [initialSegment]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = people.saved || PL_NO_LISTS;
  const [savedId, setSavedId] = useState(initialSaved);
  React.useEffect(() => { setSavedId(initialSaved); }, [initialSaved]);
  const [tab, setTab] = useState(initialState && PL_TABS.includes(initialState) ? initialState : "all");
  React.useEffect(() => { if (initialState && PL_TABS.includes(initialState)) setTab(initialState); }, [initialState]);
  const controls = usePlControls({ scope: "people", cols: PL_COLUMNS, phoneCols: PL_PHONE_COLUMNS, colCtx: { withCalendar, dealsOn }, people, sortFirst: { by: "last", dir: "desc" } });
  const { phone, searchOpen, setSearchOpen, bulkSheet, setBulkSheet, selectMode, setSelectMode, canExport, toastNode, plFlash, sel, setSel, toggleSel, clearSelection, sortBy, sortDir, onSort, pickSort, colsOpen, setColsOpen, scrolledX, setScrolledX, columns, colOptions, pickColumn, colsButton, q, setQ, searchRef, scrollRef } = controls;
  // The phone's list picker (the rail, as a sheet), and the New list box. The shell's and a profile's "New list"
  // (segments:new) open the box; on a phone the sheet comes up with it, since the rail it sits in is not drawn there.
  const [listsOpen, setListsOpen] = useState(() => !!newList && plPhoneNow());
  // Arrived at clients/new-list: the box is open from the first draw (and on a phone, the sheet it sits in).
  const [newListSignal, setNewListSignal] = useState(newList ? 1 : 0);
  // People's own sheets on a phone -- Add a person, and the open list's rename, delete and "Save these" -- with their
  // drafts. The page holds them, so its one keyboard listener closes them on Esc and the sheets are hookless.
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState(PL_ADD_EMPTY);
  const [listAct, setListAct] = useState(null);
  const [listDraft, setListDraft] = useState(PL_LIST_EMPTY);
  // Import people: the owner's sheet over the page (people-import.jsx). The refresh-map re-reads People after each part.
  const [importOpen, setImportOpen] = useState(false);
  React.useEffect(() => {
    const onNew = () => {
      setNewListSignal((n) => n + 1);
      // The rail is hidden at 900px and under (mobile.css), so there the box opens in the sheet: this asked 720px, and
      // from 721 to 900 it opened inside a rail nobody could see.
      if (plPhoneNow()) setListsOpen(true);
    };
    window.addEventListener("segments:new", onNew);
    return () => window.removeEventListener("segments:new", onNew);
  }, []);
  const canEditLists = !!(window.__ME && (window.__ME.role === "owner" || window.__ME.role === "operator"));
  // A list made on the rail says so and is the one shown: the rail used to close
  // with no word, the new list somewhere down it. The answer goes back to the
  // rail, which shows a refusal where the name was typed.
  const createList = async (name, rule = null) => {
    const r = await window.__lists.create(name, rule);
    if (r.ok) {
      plFlash({ msg: rule ? <><b>{name}</b> made. It keeps itself current.</> : <><b>{name}</b> made. Pick people and use Add to list, or add them from their profile.</> });
      if (r.data && r.data.id) { setListId(null); setSavedId(r.data.id); }
      setListsOpen(false);
    }
    return r;
  };
  // The view in the address, so a list or a state can be sent to someone —
  // the assistant and Today link here. Replaced, never pushed: Back leaves People.
  // The Pipeline's address draws People where deals are off (app-shell.jsx), and People's own address takes its place.
  React.useEffect(() => {
    const cur = (window.location.hash || "").replace(/^#\/?/, "");
    if (!cur.startsWith("clients")) return;
    if (/^clients\/(?!seg:|list:|state:|pipeline(:|$))./.test(cur)) return;
    const want = listId ? `seg:${listId}` : savedId ? `list:${savedId}` : tab !== "all" ? `state:${tab}` : "";
    const next = want ? `#/clients/${want}` : "#/clients";
    if (window.location.hash !== next) window.history.replaceState(null, "", next);
  }, [listId, savedId, tab]);
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
  // Whether the server is being asked right now: the line under the table says so and the table is busy while it is
  // (the loading standard's one on-its-way rule). It was silent, and the rows the server found landed unannounced.
  const [searching, setSearching] = useState(false);
  React.useEffect(() => {
    if (!hasMore || !q.trim() || !window.__peopleSearch) { setFound(null); setSearchFailed(false); setSearching(false); return undefined; }
    let on = true;
    const t = setTimeout(() => {
      setSearching(true);
      window.__peopleSearch(q)
        .then((r) => { if (on) { setFound(r.rows); setSearchMore(!!r.more); setSearchFailed(false); setSearching(false); } })
        .catch(() => { if (on) { setFound(null); setSearchFailed(true); setSearching(false); } });
    }, 250);
    return () => { on = false; clearTimeout(t); setSearching(false); };
  }, [q, hasMore]);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMore = async () => {
    if (!window.__peopleMore || loadingMore) return;
    setLoadingMore(true);
    // A page of people that could not be read says so: Show more used to go quiet and stay.
    try { await window.__peopleMore(); } catch (e) { plFlash(window.refusalToast({ message: e && e.message }, "No more people loaded")); } finally { setLoadingMore(false); }
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
    const match = plMatcher(q);
    if (match) list = list.filter(match);
    // By state: who needs a person first, then who is waiting on one, then the rest in the rail's order. The ranks ran
    // the other way, so "By state" (the descending sort a first press gives) put Active first and Needs you last.
    // Never heard from sits with the quiet, under them: nothing is asked of anyone there (decision 0009).
    const order = { needs_you: 6, waiting_on_you: 5, opted_out: 4, new: 3, quiet: 2, unheard: 1, active: 0 };
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

  const activeList = listId && lists.find((l) => l.id === listId);
  const activeSaved = savedId && saved.find((s) => s.id === savedId);
  const listStep = (activeSaved && activeSaved.action) || (activeList && activeList.action) || null;
  // One list open at a time: it is the page's title, so two open at once would be a title over a table it does
  // not describe. Picking the open one again shows everyone.
  const pickSmart = (id) => { setSavedId(null); setListId((cur) => railToggle(cur, id)); };
  const pickSaved = (id) => { setListId(null); setSavedId((cur) => railToggle(cur, id)); };
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
  const listsOf = useMemo(() => {
    const m = {};
    for (const s of saved) for (const id of s.ids) (m[id] = m[id] || []).push(s.name);
    return m;
  }, [saved]);
  // What a cell needs, behind ONE object that holds still until something in it changes: the rows are PeopleRowMemo,
  // which draws a row again only when a prop of its own changed, and a context made new on every draw redrew every
  // row on every keystroke (the same fault the Leads scope's cellCtxLeads fixed). The doors are the latest closures
  // behind refs, so a new closure is not a new context; the columns are told apart by their keys, not their array.
  // What a cell draws from: the booking link, each row's words, the list open for taking people off, their lists, and
  // which columns a desktop shows.
  const cellOpenRef = React.useRef(onOpenProfile);
  cellOpenRef.current = onOpenProfile;
  const cellDropRef = React.useRef(dropFromList);
  cellDropRef.current = dropFromList;
  const cellCtxRef = React.useRef(null);
  const cellCtxKey = [people.bookingLink || null, people.attention, saved, activeSaved ? activeSaved.id : null, canEditLists && !!window.__lists, columns.map((c) => (c.off ? `-${c.key}` : c.key)).join(",")];
  if (!cellCtxRef.current || cellCtxRef.current.key.some((v, i) => !Object.is(v, cellCtxKey[i]))) {
    cellCtxRef.current = {
      key: cellCtxKey,
      ctx: {
        bookingLink: people.bookingLink || null,
        attention: people.attention,
        onOpen: (id) => cellOpenRef.current(id),
        // Read a person before their row is pressed: a pointer arriving, a finger coming down, the cursor landing.
        onWarm: (id) => { if (window.__warmPerson) window.__warmPerson(id); },
        drop: activeSaved && activeSaved.byHand && canEditLists && window.__lists ? { list: activeSaved, onDrop: (person) => cellDropRef.current(person) } : null,
        listsOf,
        shows: Object.fromEntries(columns.filter((c) => !c.off).map((c) => [c.key, true])),
      },
    };
  }
  const cellCtx = cellCtxRef.current.ctx;
  // What a row press does, behind one function for the same reason: the shell hands the page a new onOpenProfile on
  // every route change, and a phone in a selection turns a press into a toggle, so the door changes while the rows should not.
  const rowOpenRef = React.useRef(null);
  const rowOpen = React.useRef((id) => rowOpenRef.current(id)).current;
  const filtered = tab !== "all" || !!listId || !!savedId || !!q.trim();
  const shownIds = shown.map((r) => r.id);
  // Each view keeps its own place: everyone, a smart list, a kept list or a state.
  const peopleView = listId ? `seg:${listId}` : savedId ? `list:${savedId}` : tab !== "all" ? `state:${tab}` : "all";
  const { cursor, setCursor, rowBudget, keysWith, toggleAll } = usePlPlace({ controls, page: "people", view: peopleView, ids: shownIds, noun: "person", selectionOf: `${tab}|${listId}|${savedId}` });
  // The people this view shows first, read in the background once the boot is in, so a press opens a page the tab
  // already holds, whole (people-detail.ts warmPeople): a person not read yet opens on nothing of theirs until it is.
  const aheadKey = shownIds.slice(0, 12).join(",");
  React.useEffect(() => { if (aheadKey && window.__warmPeople) window.__warmPeople(aheadKey.split(",")); }, [aheadKey]);
  // The phone's Add a person: the desktop's door (plAddPerson), the page's draft. Added, the sheet closes and their
  // page opens, as the desktop's form does.
  const addOnPhone = async () => {
    const d = addDraft;
    if (d.busy || !d.phone.trim() || !window.__addPerson) return;
    setAddDraft({ ...d, busy: true, error: null });
    const r = await plAddPerson(d);
    if (!r.ok) { setAddDraft((x) => ({ ...x, busy: false, error: r.error })); return; }
    plFlash({ msg: plAddedWords(d, r.existed) });
    setAddOpen(false);
    setAddDraft(PL_ADD_EMPTY);
    onOpenProfile(r.id);
  };
  const closePhoneSheet = () => { setAddOpen(false); setAddDraft(PL_ADD_EMPTY); setListAct(null); setListDraft(PL_LIST_EMPTY); };
  // The open list's acts on a phone (the more-menu's): the desktop's doors, the page's draft, the desktop's words.
  const listActGo = async () => {
    const d = listDraft;
    if (d.busy || !window.__lists) return;
    const n = d.name.trim();
    if (listAct !== "delete" && !n) return;
    if (listAct !== "save" && !activeSaved) return;
    if (listAct === "rename" && n === activeSaved.name) { closePhoneSheet(); return; }
    setListDraft({ ...d, busy: true, error: null });
    if (listAct === "delete") {
      const r = await plDeleteList(activeSaved);
      if (!r.ok) { setListDraft((x) => ({ ...x, busy: false, error: r.error })); return; }
      closePhoneSheet();
      setSavedId(null);
      return;
    }
    if (listAct === "rename") {
      const r = await plRenameList(activeSaved, n);
      if (!r.ok) { setListDraft((x) => ({ ...x, busy: false, error: r.error })); return; }
      closePhoneSheet();
      plFlash({ msg: <>Renamed to <b>{n}</b></> });
      return;
    }
    const ids = shownIds;
    const { made, filled, id } = await plMakeListWith(n, ids);
    if (!made.ok) { setListDraft((x) => ({ ...x, busy: false, error: made.message || "Could not make the list." })); return; }
    closePhoneSheet();
    plFlash(filled.ok ? { msg: <>{ids.length} kept as <b>{n}</b></>, undo: () => plUndoList(id, n, plFlash) } : window.refusalToast(filled, "Not kept as a list"));
  };
  // What the keyboard's one listener reads (usePlPlace): Enter opens the person, and People's own sheets.
  keysWith({
    open: onOpenProfile,
    canSelect: canEditLists || canExport,
    // The selection's sheet is a phone's (drawn only there): a window widened past 900px with it open holds no keys.
    sheetOpen: listsOpen || addOpen || !!listAct || (phone && !!bulkSheet),
    closeSheet: addOpen || listAct ? closePhoneSheet : phone && bulkSheet ? () => setBulkSheet(null) : null,
  });

  // Whether anyone shown is selected, or a phone's Select people is on: the bar shows then, and on a phone a tap on a
  // row selects it rather than opening the person (Gmail's way; the face is the checkbox, clients.css).
  const selecting = (phone && selectMode) || shown.some((p) => sel.has(p.id));
  rowOpenRef.current = phone && selecting ? toggleSel : onOpenProfile;
  // People's more-menu on a phone, the bar's last control: the acts a desktop spreads over its controls row and a list's
  // title line. Add a person; the sorts a desktop's headings give (a phone draws none); everyone as a file; and with a
  // list open, that list's own acts.
  const phoneMenu = [
    // A selection begun from here, with nobody picked yet, for whoever a selection could do something for.
    ...((canEditLists || canExport) && shown.length > 0 ? [{ label: "Select people", icon: "check", onClick: () => setSelectMode(true) }] : []),
    ...(canEditLists && window.__addPerson ? [{ label: "Add a person", icon: "plus", onClick: () => { setAddDraft(PL_ADD_EMPTY); setAddOpen(true); } }] : []),
    // A client list as a file, for the owner (the import door is the owner's, as the export is).
    ...(canExport && window.__importPeople && window.PeopleImportSheet ? [{ label: "Import people", icon: "download", meta: "CSV", onClick: () => setImportOpen(true) }] : []),
    { header: "Sort" },
    ...PL_PHONE_SORTS.filter((s) => !s.needs || s.needs({ withCalendar })).map((s) => ({ label: s.label, checked: sortBy === s.by && sortDir === s.dir, onClick: () => pickSort(s.by, s.dir) })),
    // The route's file of everyone: a download (it answers as an attachment), so the page stays where it is.
    ...(window.__href ? [{ divider: true }, { label: "Export everyone", icon: "external", meta: "CSV", onClick: () => window.location.assign(window.__href("GET contacts/export")), ...(canExport ? {} : { gate: window.gate("export") }) }] : []),
    ...(activeSaved && canEditLists && window.__lists ? [
      { divider: true },
      { label: "Rename this list", icon: "edit", onClick: () => { setListDraft({ ...PL_LIST_EMPTY, name: activeSaved.name }); setListAct("rename"); } },
      { label: "Delete this list…", icon: "x", danger: true, onClick: () => { setListDraft(PL_LIST_EMPTY); setListAct("delete"); } },
    ] : []),
    ...(!activeSaved && filtered && shown.length > 0 && canEditLists && window.__lists ? [
      { divider: true },
      { label: `Save these ${shown.length} as a list`, icon: "filter", onClick: () => { setListDraft({ ...PL_LIST_EMPTY, name: activeList ? activeList.label : tab !== "all" ? PL_TAB_LABEL[tab] : "" }); setListAct("save"); } },
    ] : []),
  ];

  return (
    <div className="clients">
      <PeopleRail
        scope="people"
        onScope={(to) => nav(plScopeRoute(to))}
        dealsOn={dealsOn}
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
        <div className="cl-main-scroll pl-main" ref={scrollRef}>
          {/* A phone's one bar: the switch, the list, search and the more-menu (PeoplePhoneBar). */}
          {phone && (
            <PeoplePhoneBar
              scope="people"
              onScope={(to) => nav(plScopeRoute(to))}
              dealsOn={dealsOn}
              listLabel={activeSaved ? activeSaved.name : activeList ? activeList.label : "Everyone"}
              onLists={() => setListsOpen(true)}
              listsOpen={listsOpen}
              q={q}
              onQ={setQ}
              searchRef={searchRef}
              searchOpen={searchOpen}
              onSearchOpen={setSearchOpen}
              searchLabel={PL_SEARCH_LABEL}
              testid="people"
              trailing={<MoreMenu items={phoneMenu} title="More" size={18} btnClass="pp-bar-icon" escape />}
            />
          )}
          <PeopleStanding
            scope="people"
            agg={agg}
            needsShown={tab === "needs_you"}
            onNeeds={() => setTab((t) => (t === "needs_you" ? "all" : "needs_you"))}
          />

          {!phone && (
          <div className="cl-controls">
            <div className="cl-search-wrap">
              <Icon name="search" size={13} />
              <input ref={searchRef} placeholder={`${PL_SEARCH_LABEL}…`} value={q} onChange={(e) => setQ(e.target.value)} />
              <span className="kbd">/</span>
            </div>
            <div className="cl-controls-right">
              {canEditLists && window.__addPerson && <AddPersonButton onAdded={onOpenProfile} flash={plFlash} />}
              {/* A client list as a file, for the owner: read in the browser, counted, then written in parts of fifty
                  (people-import.jsx). */}
              {canExport && window.__importPeople && window.PeopleImportSheet && (
                <button className="btn btn-ghost btn-sm" onClick={() => setImportOpen(true)} data-testid="import-people"><Icon name="download" size={12} /> Import</button>
              )}
              {/* Everyone as a CSV, from the route: owner only, and the button
                  says so for anyone else instead of leading to a refusal. */}
              {window.__href && (
                window.canDo && !window.canDo("export")
                  ? <button className="btn btn-ghost btn-sm" {...window.gate("export")}><Icon name="external" size={12} /> Export CSV</button>
                  : <a className="btn btn-ghost btn-sm" href={window.__href("GET contacts/export")} download title="Download everyone as a CSV file"><Icon name="external" size={12} /> Export CSV</a>
              )}
              {/* No sort button: every heading that sorts is a button with its arrow (cl-th-sort), so "Z → A" beside
                  them only turned round an order the table already shows and changes. */}
              <PeopleColumnsMenu open={colsOpen} onOpenChange={setColsOpen} options={colOptions} onPick={pickColumn} buttonRef={colsButton} />
            </div>
          </div>
          )}

          {/* A phone draws no list head: the bar names the list, the Lists sheet has Everyone and the more-menu the
              list's own acts. A list's own step stays, one card. */}
          {(!phone || listStep) && (
          <div className="cl-section">
            {!phone && (
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
                  <span className="chip" data-testid="state-filter">
                    <Icon name="filter" size={10} />
                    {PL_TAB_LABEL[tab]}
                    <button className="chip-x" title="Show everyone" aria-label="Show everyone" onClick={() => setTab("all")}>
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
            )}
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
          )}

          <PeopleTable
            budget={rowBudget}
            noun="person"
            columns={columns}
            ctx={cellCtx}
            selectable={canEditLists || canExport}
            sel={sel}
            onToggle={toggleSel}
            onToggleAll={toggleAll}
            cursor={cursor}
            onCursor={setCursor}
            rows={shown}
            rowClass={phone ? plCardRowClass : null}
            total={people.page && people.page.has_more ? people.page.total : rows.length}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={onSort}
            onOpen={rowOpen}
            selectMode={phone && selectMode}
            filtered={filtered}
            onClearFilters={() => { setQ(""); setTab("all"); setListId(null); setSavedId(null); }}
            scrolled={scrolledX}
            onScrolled={setScrolledX}
            busy={searching}
            empty={activeSaved && activeSaved.count === 0 && tab === "all" && !listId && !q.trim() ? (activeSaved.unknown ? { title: `${activeSaved.name} can't be counted right now`, body: activeSaved.unknown, action: { label: "Show everyone", onClick: () => setSavedId(null) } } : activeSaved.byHand ? { title: `Nobody on ${activeSaved.name} yet`, body: "Pick people and use Add to list, or add them from their profile.", action: { label: "Show everyone", onClick: () => setSavedId(null) } } : { title: `Nobody on ${activeSaved.name} right now`, body: "It keeps itself current: its people appear here when its rule holds for them.", action: { label: "Show everyone", onClick: () => setSavedId(null) } }) : null}
          />
          {hasMore && (
            <div className="cl-section-sub pl-more" data-testid="people-more">
              {plLoadedWords(rows.length, people.page.total)}{q.trim() ? (searching ? " · searching everyone…" : searchFailed ? " · couldn't search past them, so these are matches among the loaded" : ` · names and numbers searched across everyone, words among the ${rows.length.toLocaleString()} loaded${searchMore ? " · the first 1,000 matches" : ""}`) : ""}
              {" "}
              <button className="btn btn-ghost btn-sm" disabled={loadingMore} onClick={loadMore} data-testid="people-more-btn">{loadingMore ? "Loading…" : "Show more"}</button>
            </div>
          )}
        </div>
        {/* The bar counts, and acts on, the people shown and selected. */}
        {selecting && <PeopleBulkBar sel={sel} rows={shown} saved={saved} savedRead={people.savedRead !== false} canEdit={canEditLists} canExport={canExport} onClear={clearSelection} onKeep={(rest) => setSel(new Set(rest))} flash={plFlash} activeSaved={activeSaved || null} phone={phone} sheet={phone ? bulkSheet : null} onSheet={setBulkSheet} onSelectAll={() => setSel(new Set(shownIds))} />}
        {/* The phone's rail, as a sheet (the rail itself is not drawn at 900px and under), last in the tree. Its
            switch is the bar's; its first row is Everyone. */}
        {listsOpen && (
          <PeopleListsSheet onClose={() => setListsOpen(false)}>
            <PeopleRail
              compact
              scope="people"
              scopeTabs={false}
              everyone={{ count: agg.total, active: !listId && !savedId, onPick: () => { setListId(null); setSavedId(null); setListsOpen(false); } }}
              onScope={(to) => nav(plScopeRoute(to))}
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
        {/* People's own two sheets on a phone, last in the tree like the Lists sheet. */}
        {phone && addOpen && (
          <PeopleAddSheet draft={addDraft} onDraft={(patch) => setAddDraft((d) => ({ ...d, ...patch }))} onAdd={addOnPhone} onClose={closePhoneSheet} />
        )}
        {phone && listAct && (listAct === "save" || activeSaved) && (
          <PeopleListActSheet act={listAct} list={activeSaved} count={shown.length} draft={listDraft} onDraft={(patch) => setListDraft((d) => ({ ...d, ...patch }))} onGo={listActGo} onClose={closePhoneSheet} />
        )}
        {/* Import people, at every width: the record kit's sheet, drawn in .app-root, where the page's keys hold still
            while it is open (PL_OVERLAY) and it closes on its own Esc. */}
        {importOpen && window.PeopleImportSheet && (
          <window.PeopleImportSheet onClose={() => setImportOpen(false)} flash={plFlash} />
        )}
        {toastNode}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------------------- Leads */
// The Leads scope's state lives here: every component of the scope is hookless, from its rail to its bulk bar
// (leads-scope.jsx), and everything it needs is a prop.
const LeadsReal = ({ onOpenProfile = () => {}, leadsRoute = null, onNavigate = null }) => {
  // The workspace's copy of every view rides with the People surface (usePlControls), and so do the first day's
  // facts about the calendar and the people.
  const people = usePeople();
  const leads = useLeads();
  const nav = onNavigate || ((to) => window.CHANLY.nav(to));
  // Which search, which list and which class this address names (contracts parseLeadsRoute, through the courier).
  // The address is the one place the Leads view's list lives, so the rail, the table and the saved view agree.
  const leadView = window.__leadsRouteParse ? (window.__leadsRouteParse(leadsRoute || "clients/leads") || { searchId: null, list: "all", cls: null, chips: {}, peek: null }) : null;
  // The view's own route, with no lead open over it, and the lead the address names. The page stays mounted across
  // its views (app-shell.jsx shellMountKey), so what belongs to a view follows `viewRoute`, never `leadsRoute`: a
  // lead opened over a view is the same view, and must not read it again or drop what is selected in it.
  const viewRoute = leadView && window.__leadsRouteOf ? window.__leadsRouteOf({ searchId: leadView.searchId, list: leadView.list, cls: leadView.cls }) : null;
  const addrPeek = (leadView && leadView.peek) || null;
  // The rail's row, as a name of its own: what a saved view carries and what a read is keyed by, and a name a
  // dependency array can be checked against (an expression in one cannot).
  const leadList = leadView ? leadView.list : null;
  const hasCenter = leads.searches.some((s) => s.plan && s.plan.area && !!s.plan.area.center);
  // The columns this scope draws with: the Leads scope's (LEAD_COLUMNS, leads-scope.jsx).
  const controls = usePlControls({ scope: "leads", cols: LEAD_COLUMNS, phoneCols: LEAD_PHONE_COLUMNS, colCtx: { hasCenter }, people, sortFirst: { by: "fit", dir: "asc" }, railRow: leadList });
  const { phone, searchOpen, setSearchOpen, bulkSheet, setBulkSheet, canExport, toastNode, plFlash, sel, setSel, toggleSel, allMatching, setAllMatching, clearSelection, sortBy, setSortBy, sortDir, setSortDir, onSort, colsOpen, setColsOpen, scrolledX, setScrolledX, columns, colOptions, pickColumn, colsButton, q, setQ, searchRef, scrollRef } = controls;
  // The phone's list picker: the rail, as a sheet.
  const [listsOpen, setListsOpen] = useState(false);
  const [peekId, setPeekId] = useState(null);
  const [finderOpen, setFinderOpen] = useState(false);
  const [finderStage, setFinderStage] = useState("compose");
  const [finderWords, setFinderWords] = useState("");
  const [finderProposal, setFinderProposal] = useState(null);
  const [finderRefusal, setFinderRefusal] = useState(null);
  // The first day's "Not right? Change it" (Task 17): the line the owner is
  // rewriting, or null when the form is closed. Saving it keeps the line with
  // no items, so the read that follows asks Claude again -- which is the only
  // control that renews the suggestions, and why their age is never drawn.
  const [leadLine, setLeadLine] = useState(null);
  // The plan the card is showing and the owner is editing, the trace line while Claude reads, and which of the
  // sentence's words has its picker open (Task 9). A plan opened from a strip's next step carries whose round it
  // belongs to and what approving it does -- `answer: true` answers the question that is still waiting, else it
  // is another round on the same search (Task 10 step 6).
  const [finderPlan, setFinderPlan] = useState(null);
  const [finderTrace, setFinderTrace] = useState(null);
  const [finderPick, setFinderPick] = useState(null);
  const [finderMore, setFinderMore] = useState(null);
  // The five whys, asked once for a whole selection (Task 15).
  const [bulkWhy, setBulkWhy] = useState(false);
  // The peek's own pane ("info" while it is just showing the lead; "why" and "draft" are Tasks 15 and 13) and
  // the draft it is holding.
  const [peekMode, setPeekMode] = useState("info");
  const [draft, setDraft] = useState(null);
  // "Did you send it?" after a draft, "How did the call go?" after a call:
  // { kind: "sent" | "call", leadId, asked, outcome, note }. `asked` turns true only once the tab is theirs
  // again (leadArmOnReturn, Task 13), so nothing is asked while they are away.
  const [armed, setArmed] = useState(null);
  // D5: the row's Values ⁄ Signals choice (kept per viewer, read in a try: a private window may refuse), the photo
  // expanded, and the band's fit filter.
  const [values, setValues] = useState(ldValuesPref());
  const [lightboxId, setLightboxId] = useState(null);
  const [fitChip, setFitChip] = useState(null);
  const [benchGroup, setBenchGroup] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapBy, setMapBy] = useState("fit");
  const [mapPick, setMapPick] = useState(null);

  // One criterion of the Excluded view, from the chips at its head.
  const [chip, setChip] = useState(null);
  // The search being renamed, and the one being removed: each asked where the search is, on the rail.
  const [renaming, setRenaming] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [leadBusy, setLeadBusy] = useState(false);
  const [removeError, setRemoveError] = useState(null);
  // Hold to talk, as Ask does it: the browser's own recogniser, started on press and stopped on release, handing
  // back what it heard. Nothing is recorded and nothing is uploaded -- the words go into the finder's input, and
  // the owner still presses Plan it. It is off for anyone who may not find, and while a plan is on the screen.
  const talkLang = window.__ask && window.__ask.language ? window.__ask.language() : "en";
  const talk = ((window.AskHooks && window.AskHooks.useAskTalk) || usePlNoTalk)({
    lang: talkLang,
    disabled: finderStage !== "compose" || (!!window.canDo && !window.canDo("find")),
    onWords: setFinderWords,
    onHeard: (heard, error) => {
      if (heard) { setFinderWords(heard); return; }
      // The two things a browser can say about a microphone, in Ask's own words (ask-text.jsx): one spelling.
      const t = window.askText ? window.askText(talkLang) : null;
      if (!t) return;
      if (error === "not-allowed") plFlash({ msg: <>{t.micDenied}</> });
      else if (error && error !== "aborted" && error !== "no-speech") plFlash({ msg: <>{t.micFailed}</> });
    },
  });
  // One read per view (PRD 0.5, the review's E8): the address says which search, list and class, and this
  // member's own view says the sort. Every key goes at once, and the surface drops an answer a newer ask
  // supersedes, so a slow page of the old view never lands on the new one.
  React.useEffect(() => {
    if (!window.__leadsView) return;
    window.__leadsView({ searchId: leadView.searchId, list: leadView.list, cls: leadView.cls, chips: leadView.chips, sort: sortBy, dir: sortDir });
  }, [viewRoute, sortBy, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps
  // The next page, its own flag, so the button says Loading… while THIS is out and not while a Keep is (it read
  // leadBusy), and a second press while it loads asks for nothing.
  const [leadsMoreBusy, setLeadsMoreBusy] = useState(false);
  const leadsMore = async () => {
    if (!window.__leadsMore || leadsMoreBusy) return;
    setLeadsMoreBusy(true);
    try { await window.__leadsMore(); } catch (e) { plFlash(window.refusalToast({ message: e && e.message }, "No more leads loaded")); } finally { setLeadsMoreBusy(false); }
  };
  // The leads loaded, filtered at once by the box (their name, their kind and their area) and by one criterion
  // of the Excluded view. A sentence is not sent anywhere: words to chips is release C.
  const leadShown = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = leads.rows;
    if (chip) list = list.filter((l) => l.excludedBy === chip);
    if (fitChip) list = list.filter((l) => l.fit === fitChip);
    if (!needle) return list;
    return list.filter((l) => l.name.toLowerCase().includes(needle) || (l.category || "").toLowerCase().includes(needle) || (l.area || "").toLowerCase().includes(needle));
  }, [leads.rows, q, chip, fitChip]);
  const filtered = !!q.trim() || !!chip || !!fitChip || !!leadView.cls || leadView.list !== "all";
  const shownIds = leadShown.map((r) => r.id);
  // The surface holds the view the address names, in the order this page asked for: a sort is a read too (never the
  // page's to re-order; leads_page's order is the one rule), and the rows on screen are the old order until it lands.
  const viewLanded = leads.route === viewRoute && leads.view.sort === sortBy && leads.view.dir === sortDir;
  // Each view keeps its place by the address's view (viewRoute), its map with it. A view opened after the first starts
  // with none of the last one's filters.
  const { cursor, setCursor, rowBudget, keysWith, toggleAll } = usePlPlace({
    controls, page: "leads", view: viewRoute, ids: shownIds, noun: "lead", landed: viewLanded, selectionOf: `${viewRoute}|${chip}`,
    extra: { map: mapOpen },
    onPlace: (p, again) => {
      setMapOpen(!!p.map);
      if (again) { setChip(null); setFitChip(null); setBenchGroup(null); setMapPick(null); setLightboxId(null); setBulkWhy(false); }
    },
  });
  // The peek's deck (D5): the lead before or after the one open, by the order on screen. It moves the cursor too,
  // so the rows behind it follow and the keyboard carries on from where the thumb left off.
  const deckMove = (step) => {
    const i = shownIds.indexOf(peekId);
    const to = shownIds[step > 0 ? Math.min(shownIds.length - 1, i + 1) : Math.max(0, i - 1)];
    if (!to || to === peekId) return;
    setCursor(to);
    setPeekId(to);
  };
  // The photos either side of the lead open are asked for now, so the deck, a swipe, and J and K find them there.
  React.useEffect(() => {
    if (!peekId || !window.leadPhotoWarm) return;
    const i = shownIds.indexOf(peekId);
    if (i < 0) return;
    for (const j of [i + 1, i - 1]) {
      const r = leadShown[j];
      if (r && r.tile) window.leadPhotoWarm(r.tile.band);
    }
  }, [peekId, shownIds.length]);
  // The peek follows the row cursor while it is open, so J and K walk the leads behind it -- unless it is asking
  // a question or holding a draft, which keeps it on its own lead (leadPeekFollows, leads-peek.jsx, Task 12).
  React.useEffect(() => {
    if (!peekId || !cursor || cursor === peekId || !leadPeekFollows(peekMode, armed)) return;
    setPeekId(cursor);
  }, [cursor]); // eslint-disable-line react-hooks/exhaustive-deps
  // The owner left for their own mail app or their own phone; the peek asks how it went only once they are back
  // (leadArmOnReturn, leads-peek.jsx). Nothing is asked while the tab is hidden, and the listeners go with the arming.
  React.useEffect(() => leadArmOnReturn(armed, setArmed), [armed && armed.kind, armed && armed.leadId, armed && armed.asked]);
  // The dialog's focus rule (leadPeekFocus): focus moves into the peek when it opens and back to the row when it
  // closes, and the row is the cursor, so Tab carries on from where the owner was.
  React.useEffect(() => { leadPeekFocus(peekId, cursor); }, [peekId]); // eslint-disable-line react-hooks/exhaustive-deps
  // The lead that is open is part of the address (contracts leadsRoute, `p-`): a refresh keeps it, Back closes it, and
  // it can be sent to someone. The page's own state still draws the peek; this keeps the two saying one thing.
  // When the ADDRESS moved -- a link, Back or Forward, a rail pick, the first draw -- the page follows it, and a view
  // that changed under an open lead closes it. When the PAGE moved, it says so: opening pushes an entry, the cursor
  // walking the peek on replaces it, and closing goes back to the entry the opening made. A lead that came with the
  // address has no entry of the page's behind it, so it closes by replacing: going back would leave Leads.
  const peekAddr = React.useRef({ view: undefined, peek: undefined, asked: null, pushed: false });
  React.useEffect(() => {
    if (!window.__leadsRouteOf) return;
    const a = peekAddr.current;
    if (a.view !== viewRoute || a.peek !== addrPeek) {
      a.view = viewRoute;
      a.peek = addrPeek;
      a.asked = null;
      if (!addrPeek) a.pushed = false;
      // The lead the address names takes the cursor too: the cursor this tab kept for the view (usePlPlace) would
      // otherwise walk the peek, and the address, off it on the next draw.
      if (peekId !== addrPeek) { setPeekId(addrPeek); if (addrPeek) setCursor(addrPeek); setPeekMode("info"); setArmed(null); setDraft(null); }
      return;
    }
    if (peekId === addrPeek) return;
    const want = window.__leadsRouteOf({ searchId: leadView.searchId, list: leadView.list, cls: leadView.cls, peek: peekId });
    // Said once: a push is answered a task later (hashchange), and every draw until then finds the address as it was.
    if (a.asked === want) return;
    a.asked = want;
    if (peekId && !addrPeek && !a.pushed) { a.pushed = true; nav(want); }
    else if (!peekId && a.pushed && window.history && window.history.back) { a.pushed = false; window.history.back(); }
    else nav(want, { replace: true });
  }, [viewRoute, addrPeek, peekId]); // eslint-disable-line react-hooks/exhaustive-deps
  // A Find half-written comes back with the page (ldFinderLoad, above), and is kept as it changes. The first pass
  // still holds the page's empty state, so it keeps nothing: it would clear the draft it is about to be given.
  const finderKept = React.useRef(false);
  React.useEffect(() => {
    const d = ldFinderLoad();
    if (!d) return;
    setFinderWords(d.words || "");
    setFinderPlan(d.plan || null);
    setFinderProposal(d.proposal || null);
    setFinderMore(d.more || null);
    setFinderStage(d.stage === "plan" && d.plan ? "plan" : "compose");
    setFinderOpen(!!d.open);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!finderKept.current) { finderKept.current = true; return; }
    ldFinderSave({ open: finderOpen, stage: finderStage, words: finderWords, plan: finderPlan, proposal: finderProposal, more: finderMore });
  }, [finderOpen, finderStage, finderWords, finderPlan, finderProposal, finderMore]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------------------------------------------- the Leads scope's acts */
  // Every one goes through the courier the bridge installed (legacy-bridge/leads.ts): the route, then the
  // surface patched in place. A toast says what happened and offers Undo through the operation the door
  // answered, which is the only thing an undo names (the review's E9).
  const canFind = !window.canDo || window.canDo("find");
  const leadById = (id) => leads.rows.find((l) => l.id === id) || null;
  const searchById = (id) => leads.searches.find((s) => s.id === id) || null;
  const leadUndo = (r) => (r.data && r.data.op_id
    ? { undo: async () => { const u = await window.__leadUndo(r.data.op_id, r.data.version); if (!u.ok) plFlash(window.refusalToast(u, "Nothing was put back")); } }
    : {});
  const leadAct = async (fn, said) => {
    if (leadBusy) return;
    setLeadBusy(true);
    const r = await fn();
    setLeadBusy(false);
    if (!r.ok) { plFlash(window.refusalToast(r, "That did not go through")); return; }
    plFlash({ msg: said, ...leadUndo(r) });
  };
  const searchOf = (l) => (leadView && leadView.searchId) || (l && l.searchId) || null;
  // Keep counts the place as Qualified the month it is kept; Exclude is free; Put back is the owner's override
  // of an exclusion, through the door that counts (PRD 8.7). Each names the search whose class it is in, which
  // is what release A's routes take ({ search_id }); the door answers the operation, and the toast offers it.
  // A selection's act (D3): the door's own sentence is the flash -- it says how many, and what stopped or skipped
  // part of it -- and the selection is spent.
  const leadSaid = async (fn) => {
    if (leadBusy) return;
    setLeadBusy(true);
    const r = await fn();
    setLeadBusy(false);
    if (!r.ok) { plFlash(window.refusalToast(r, "That did not go through")); return; }
    setSel(new Set());
    setAllMatching(false);
    plFlash({ msg: r.data.toast, ...leadUndo(r) });
  };
  const keepLead = (id) => leadAct(() => window.__leadKeep(searchOf(leadById(id)), id), <>Kept. It counts as a lead this month.</>);
  const excludeLead = (id) => leadAct(() => window.__leadExclude(searchOf(leadById(id)), id), <>Excluded. Nothing counted.</>);
  const putBackLead = (id) => leadAct(() => window.__leadPutBack(searchOf(leadById(id)), id), <>Put back. It counts as a lead now.</>);
  // The owner's own phone dials; coming back to the tab asks how it went (Task 14).
  // The owner's own phone dials, and the peek opens on that lead: "How did the call go?" and its six outcomes
  // are drawn there, so a call from a row and a call from the peek end in the same place (Task 14 step 4).
  const callLead = (id) => {
    const l = leadById(id);
    if (!l || !l.phone) return;
    setArmed({ kind: "call", leadId: id, asked: false, outcome: null, note: "" });
    setPeekMode("info");
    setPeekId(id);
    plDial(l.phone);
  };
  const copyLead = (id) => {
    const l = leadById(id);
    if (!l || !l.email) return;
    plCopy(l.email);
    plFlash({ msg: <>Copied <b>{l.email}</b></> });
  };
  // The peek's phone line copies the number as it dials (the stored number), and names it as the peek draws it
  // (contracts' formatPhoneDisplay, published as __phoneDisplay).
  // A call made from a desk phone, a softphone or a mobile that is not this one: the same six outcomes the button
  // arms, without ringing anybody. There was no way to record one, so those calls left no mark on the lead.
  const logLeadCall = (id) => {
    const l = leadById(id);
    if (!l) return;
    setArmed({ kind: "call", leadId: id, asked: false, outcome: null, note: "" });
    setPeekMode("info");
    setPeekId(id);
  };
  const copyPhone = (id) => {
    const l = leadById(id);
    if (!l || !l.phone) return;
    plCopy(l.phone);
    plFlash({ msg: <>Copied <b>{(window.__phoneDisplay && window.__phoneDisplay(l.phone)) || l.phone}</b></> });
  };
  // Copy emails says how many of the selection had none you can use, because a silent 12-of-15 is a lie.
  const copyEmails = (picked) => {
    const usable = picked.filter((l) => l.email && l.emailState !== "invalid");
    plCopy(usable.map((l) => l.email).join(", "));
    const none = picked.length - usable.length;
    plFlash({ msg: <>Copied {usable.length} email{usable.length === 1 ? "" : "s"}{none ? `; ${none} had none you can use` : ""}</> });
  };
  const bulkLeads = (body) => leadAct(() => window.__leadsBulk(body), body.action === "contacted" ? <>Marked contacted.</> : <>Not a fit.</>);
  // Not a fit, for everything selected: the same five whys the peek asks, asked once, one operation, one Undo
  // (Task 15 step 4). The why is the owner's pick; the route records not_a_fit for every row it touched.
  const bulkNotAFit = (why, body) => {
    setBulkWhy(false);
    // The pick closes the list; the body is the one LeadsBulkSchema takes, which carries no reason -- the route
    // records not_a_fit for every row it touched, and release C reads the why.
    return leadAct(() => window.__leadsBulk(body), <>Not a fit.</>);
  };
  /* -------------------------------------------- the finder (Tasks 8, 9, 10) */
  // The setters leadFinderPlan and leadFinderApprove take (leads-finder.jsx), and `more`, which says whose round
  // an approval belongs to when the plan was opened from a strip rather than typed.
  const finderSet = {
    open: setFinderOpen, stage: setFinderStage, words: setFinderWords, trace: setFinderTrace,
    refusal: setFinderRefusal, proposal: setFinderProposal, plan: setFinderPlan, pick: setFinderPick,
    more: finderMore,
  };
  const finderPlanIt = (words) => window.leadFinderPlan(words, finderSet);
  const finderApprove = async (plan) => {
    const answering = !!(finderMore && finderMore.answer);
    const r = await window.leadFinderApprove(finderProposal, plan, finderSet);
    if (r && r.ok) setFinderMore(null);
    if (r && r.ok && answering) plFlash({ msg: <>Carrying on with your change.</> });
    // A new search lands the owner on it: the strip narrating the run, the
    // classes filling, the address the search's own. Without this they stayed
    // on All leads with a live dot in the rail and nothing saying what was
    // happening -- the receipt's "Leads shows it" was a promise the page had
    // not kept. A top-up or an answer is on a search already open, so it stays.
    const started = r && r.ok && r.undo && r.undo.search_id;
    if (started && !leadView.searchId && window.__leadsRouteOf) nav(window.__leadsRouteOf({ searchId: started, list: "all", cls: null }));
    return r;
  };
  // What answering a search's question carries (leadFinderAmendAsk, leadFinderApprove): the question, the round's
  // version and the count it reserved, and what was first asked, so one Ask turn can amend the same search.
  const answerOf = (s) => ({
    answer: true,
    question: s.round && s.round.question ? s.round.question.sentence : "",
    baseVersion: s.plan_version || (s.plan && s.plan.version) || 1,
    count: s.plan.count,
    name: s.name,
    asked: s.asked,
    leavingOut: (s.plan.exclusions || []).map((x) => x.text),
  });
  // A fresh Find is never an answer: an answer left half-done must not turn the next search into one.
  const openFind = () => {
    setFinderMore(null);
    setFinderProposal(null);
    setFinderPlan(null);
    setFinderRefusal(null);
    setFinderStage("compose");
    setFinderOpen(true);
  };
  // A next step opens the plan card with what would run; nothing starts until the owner approves it there.
  const openPlanFor = (s, plan, how) => {
    // Answering, the composer behind the card (Change what I asked) is the owner's answer: what they first asked
    // sent back as the answer amended nothing.
    setFinderWords(how === "answer" ? "" : s.asked);
    setFinderProposal(null);
    setFinderPlan(plan);
    setFinderMore({ searchId: s.id, purpose: "topup", ...(how === "answer" ? answerOf(s) : { answer: false }) });
    setFinderRefusal(null);
    setFinderPick(null);
    setFinderStage("plan");
    setFinderOpen(true);
  };
  // Undo removes the leads nobody has touched and gives their month back; the toast says both numbers and offers
  // the operation the door answered, which is the only thing an undo names (E9).
  const undoRound = async (searchId) => {
    if (leadBusy || !searchId) return;
    setLeadBusy(true);
    const r = await window.__leadSearchUndo(searchId);
    setLeadBusy(false);
    if (!r.ok) { plFlash(window.refusalToast(r, "Nothing was removed")); return; }
    const d = r.data || {};
    if (!d.removed) { plFlash({ msg: <>Nothing to remove — you have worked every one of them.</> }); return; }
    plFlash({ msg: <>Removed {d.removed} · {d.credited} given back</>, ...leadUndo(r) });
  };
  /* ------------------------------------------------ a search, kept (PRD 8.10) */
  const renameSearch = async (s, name) => {
    const n = (name || "").trim();
    if (!n || leadBusy) return;
    setLeadBusy(true);
    const r = await window.__leadSearchRename(s.id, n);
    setLeadBusy(false);
    if (!r.ok) { plFlash(window.refusalToast(r, `${s.name} was not renamed`)); return; }
    setRenaming(null);
    plFlash({ msg: <>Renamed to <b>{n}</b></> });
  };
  // Removing keeps the leads already worked, and the sentence says how many; the rail loses the row, so the view
  // goes back to all the leads rather than a search that is no longer there.
  const removeSearch = async (s) => {
    if (leadBusy) return;
    setLeadBusy(true);
    setRemoveError(null);
    const r = await window.__leadSearchRemove(s.id);
    setLeadBusy(false);
    if (!r.ok) { setRemoveError(r.message || "The search could not be removed."); return; }
    setRemoving(null);
    plFlash({ msg: <>Removed. The {r.data.kept} you contacted or are talking to are kept.</> });
    nav("clients/leads");
  };
  // The first day's business line. The courier's PUT keeps it with no items, so
  // the refresh that follows writes new suggestions from the owner's own words.
  const saveBusinessLine = async () => {
    const line = String((leadLine && leadLine.draft) || "").trim();
    if (!line) { setLeadLine((l) => ({ ...l, error: "Say what this business does." })); return; }
    setLeadLine((l) => ({ ...l, busy: true, error: null }));
    const r = await window.__leadBusinessLine(line);
    if (!r.ok) { setLeadLine((l) => ({ ...l, busy: false, error: r.message || "That could not be saved." })); return; }
    setLeadLine(null);
    plFlash({ msg: <>Saved. New suggestions from what you said.</> });
  };
  // Find new ones runs the same plan again, and only places not already in your leads count (P3).
  const findNewOnes = (s) => {
    const dto = searchById(s.id);
    if (!dto) return;
    return leadAct(() => window.__leadSearchMore(dto.id, "renew", dto.plan), <>Looking for new ones. Only places not already in your leads count.</>);
  };
  // Search again, changed opens the plan card with what was asked, so the owner edits it before anything runs.
  const searchAgain = (s) => {
    const dto = searchById(s.id);
    if (!dto) return;
    setFinderWords(dto.asked);
    setFinderMore(null);
    setFinderProposal({ searchId: dto.id, plan: dto.plan, purpose: "renew" });
    setFinderRefusal(null);
    setFinderStage("plan");
    setFinderOpen(true);
  };
  const searchWordsFor = (id) => (window.__leadSearchWords ? window.__leadSearchWords(searchById(id), leads.tz) : { askedLine: "", keepsLine: "" });
  const exportHrefFor = (s) => (window.__href ? window.__href("GET leads/export", undefined, { search: s.id, list: "all", sort: "fit", dir: "asc" }) : null);

  // The Leads cells' doors (see cellCtxLeads below): the latest closures, behind one context that holds still.
  const leadCellActs = React.useRef({});
  const leadCellKept = React.useRef(null);
  // What the keyboard's one listener reads (usePlPlace): Enter peeks the lead, and the Leads scope's own overlays.
  keysWith({
    open: setPeekId,
    canSelect: canFind || canExport,
    // The selection's sheet is a phone's (drawn only there): a window widened past 900px with it open holds no keys.
    sheetOpen: listsOpen || (phone && !!bulkSheet),
    closeSheet: phone && bulkSheet ? () => setBulkSheet(null) : null,
    peekOpen: !!peekId || !!lightboxId,
    // One press backs out one step: the question the peek asked, then the pane it opened, then the peek itself
    // (leadPeekEscape, leads-peek.jsx, Task 12). The order OUT here is the page's: the peek, the finder, the
    // Columns menu, the selection.
    closePeek: () => leadPeekEscape({ mode: peekMode, armed, setMode: setPeekMode, setArmed, setPeekId, lightbox: lightboxId, setLightbox: setLightboxId }),
    finderOpen,
    // Esc lets an answer go as the close button does: what the tab keeps of a Find is never an answer.
    closeFinder: () => { setFinderOpen(false); setFinderMore(null); },
    canFind,
    find: openFind,
    call: callLead,
  });

  const rail = window.__leadRail ? window.__leadRail(leads.counts, leads.searches) : { lists: [], searches: [] };
  const standing = window.__leadsStanding ? window.__leadsStanding(leads.counts, leads.searches) : { total: "", parts: [], needsYou: null };
  const openSearch = searchById(leadView.searchId);
  // The band (D5): the search's whole shape, and whether its fits differ (which is when a row wears its fit).
  const band = window.__LEAD_VM && window.__LEAD_VM.leadBand ? window.__LEAD_VM.leadBand(openSearch) : null;
  // What a cell needs. The acts are this draw's closures (over the view, the busy flag), so the ref holds the
  // latest and the context hands out doors to it: the context itself changes only when a value a cell draws from
  // changes, and a memoised row is left alone otherwise.
  // A lead's band photo, asked for as its row is rested on, touched or reached by Tab (leads-peek.jsx leadPhotoWarm).
  // After a beat and only the last row: a pointer swept down the list passes over every row, and asking for each
  // photo it crossed would be a burst Google's photo service answers with refusals.
  const warmRest = React.useRef(null);
  const warmLeadPhoto = (id) => {
    if (warmRest.current) clearTimeout(warmRest.current);
    warmRest.current = setTimeout(() => {
      warmRest.current = null;
      const r = window.leadPhotoWarm ? leadShown.find((x) => x.id === id) : null;
      if (r && r.tile) window.leadPhotoWarm(r.tile.band);
    }, 120);
  };
  React.useEffect(() => () => { if (warmRest.current) clearTimeout(warmRest.current); }, []);
  leadCellActs.current = { onWarm: warmLeadPhoto, onOpen: setPeekId, onExpand: setLightboxId, onCall: callLead, onCopy: copyLead, onCopyPhone: copyPhone, onLogCall: logLeadCall, onKeep: keepLead, onExclude: excludeLead, onPutBack: putBackLead };
  // Whether the Stage column is drawn: then it says each lead's state, and the name's tag does not say it again.
  const stageShown = columns.some((c) => c.key === "stage");
  const cellCtxLeads = leadCellCtxFor(leadCellActs, leadCellKept, values, !!(band && band.mixed), hasCenter, canFind, people.rows, stageShown);
  const goto = (patch) => nav(window.__leadsRouteOf({ searchId: leadView.searchId, list: leadView.list, cls: leadView.cls, ...patch }));
  // Where a rail row's press goes (railToggle: one row at a time; the picked row pressed again shows all leads).
  const pickListRoute = (id) => window.__leadsRouteOf({ searchId: null, list: railToggle(leadView.searchId ? null : leadView.list, id) || "all", cls: null });
  // A search waiting on its question opens on the places the question is about (a question is only ever asked about
  // places left out); its counted view is empty while it waits.
  const waitsOn = (id) => {
    const s = id ? searchById(id) : null;
    return !!(s && s.round && s.round.state === "waiting_on_owner");
  };
  const pickSearchRoute = (id) => {
    const to = railToggle(leadView.searchId, id);
    return window.__leadsRouteOf({ searchId: to, list: "all", cls: to && waitsOn(to) ? "excluded" : null });
  };
  // What each strip control does (Task 10 step 6). Every act goes out through its route; the six that would
  // make a new round open the plan card instead, because nothing that counts against the month may start
  // without the owner approving what runs.
  // The strip's view model: contracts' where contracts has it (Task 10 step 7a puts `leadStrip` in the
  // derivations bag), and until then the page's own file, published beside the component that draws it.
  const ldStrip = (window.__LEAD_VM && window.__LEAD_VM.leadStrip) || window.leadStrip;
  // "12 new": the view read again in its order. The strip's door and the list head's are this one.
  const takeOffered = () => window.__leadsTakeOffered && window.__leadsTakeOffered();
  const onStripAction = (id, arg) => {
    const s = openSearch;
    if (!s) return;
    if (id === "stop") return leadAct(() => window.__leadSearchStop(s.id), <>Stopping. The emails of what was found are still being checked.</>);
    if (id === "keep") return leadAct(() => window.__leadSearchAnswer(s.id, "keep"), <>Carrying on.</>);
    if (id === "stop_here") return leadAct(() => window.__leadSearchAnswer(s.id, "stop"), <>Stopped. The ones already found are yours.</>);
    // The no that changes the search: the finder opens under the question, empty, and what comes back from Ask is
    // this round's next version (leadFinderApprove answers it; it never starts a second search).
    if (id === "change") {
      setFinderWords("");
      setFinderProposal(null);
      setFinderPlan(null);
      setFinderRefusal(null);
      setFinderPick(null);
      setFinderMore({ searchId: s.id, purpose: "topup", ...answerOf(s) });
      setFinderStage("compose");
      setFinderOpen(true);
      return undefined;
    }
    // Include takes the thing it asked about back out of the plan, which planVersionOf makes a new version of:
    // the route is given the version the owner approved, not the one the round started on.
    if (id === "include") {
      const V = window.__LEAD_VM || {};
      const plan = V.planVersionOf ? V.planVersionOf(s.plan, { exclusions: s.plan.exclusions.filter((x) => x.key !== arg) }) : s.plan;
      return openPlanFor(s, plan, "answer");
    }
    if (id === "excluded" || id === "review") return goto({ cls: arg });
    if ((window.LEAD_ROUND_MAKERS || []).indexOf(id) >= 0) return openPlanFor(s, arg && arg.version ? arg : s.plan, "more");
    if (id === "undo") return undoRound(arg && arg.searchId);
    // Sort by fit is a new read of the same view, not a re-order of the rows on the page: the sort is the
    // page's own state and the effect above asks the surface for it (E8).
    if (id === "sort_fit") { setSortBy("fit"); setSortDir("asc"); return undefined; }
    if (id === "take_offered") return takeOffered();
    return undefined;
  };
  // What the phone's bar says it is showing: the search that is open, or the list, and its count apart, which the
  // bar never shortens (Task 18; PeoplePhoneBar's listCount).
  const openList = rail.lists.find((l) => l.id === leadView.list);
  const railLabel = openSearch ? openSearch.name : openList ? openList.label : "All leads";
  const railCount = openSearch ? openSearch.round.counted : openList ? openList.count : null;
  return (
    <LeadsScope
      surface={leads}
      rail={rail}
      railLabel={railLabel}
      railCount={railCount}
      listTitle={openList ? openList.label : "All leads"}
      listsOpen={listsOpen}
      onLists={() => setListsOpen(true)}
      onCloseLists={() => setListsOpen(false)}
      standing={standing}
      view={leadView}
      search={openSearch}
      strip={ldStrip ? ldStrip(openSearch, new Date(), { offered: leads.offered }) : null}
      rows={leadShown}
      rowBudget={rowBudget}
      phone={phone}
      // The rows drawn are the last view's, or its last order, until the surface holds the one the address names in
      // the order asked (a view read before paints at once; one not yet read is on its way): said, not left looking
      // right and being wrong.
      loading={!viewLanded}
      total={leads.counts[leadView.list] ?? leads.counts.all}
      columns={columns}
      colOptions={colOptions}
      colsOpen={colsOpen}
      colsButton={colsButton}
      onColsOpen={setColsOpen}
      onPickColumn={pickColumn}
      cellCtx={cellCtxLeads}
      sortBy={sortBy}
      sortDir={sortDir}
      onSort={onSort}
      q={q}
      onQ={setQ}
      searchRef={searchRef}
      searchOpen={searchOpen}
      onSearchOpen={setSearchOpen}
      scrollRef={scrollRef}
      scrolled={scrolledX}
      onScrolled={setScrolledX}
      filtered={filtered}
      onClearFilters={() => { setQ(""); setChip(null); setFitChip(null); goto({ list: "all", cls: null }); }}
      band={band}
      // Needs review, as a workbench (D5): the groups are contracts', the pile is the rows this view loaded, and
      // the month is the surface's, so what a press costs is a number the owner can see.
      // The same leads, on the ground (D5): the plot is contracts', from the points the door returned and the
      // area the search asked for. A view whose leads the source placed nowhere has no map to draw.
      mapOpen={mapOpen}
      onMap={setMapOpen}
      mapBy={mapBy}
      onMapBy={setMapBy}
      mapPick={mapPick}
      onMapPick={setMapPick}
      plot={mapOpen && window.__LEAD_VM && window.__LEAD_VM.leadMapPlot ? window.__LEAD_VM.leadMapPlot(leadShown, (openSearch && openSearch.plan && openSearch.plan.area) || null) : null}
      onWiden={() => { if (!openSearch) return; const a = openSearch.plan.area; onStripAction("nearby", { ...openSearch.plan, area: { ...a, radius_m: Math.min(60000, Math.round((a.radius_m || 8000) * 2)) } }); }}
      benchGroups={leadView.cls === "review" && window.__LEAD_VM && window.__LEAD_VM.leadReviewGroups ? window.__LEAD_VM.leadReviewGroups(leads.rows, openSearch) : []}
      benchGroup={benchGroup}
      onBenchGroup={setBenchGroup}
      month={leads.month}
      onNearby={(area) => onStripAction("nearby", { ...openSearch.plan, area })}
      fit={fitChip}
      onPickFit={setFitChip}
      values={values}
      onValues={(v) => { setValues(v); try { if (window.localStorage) window.localStorage.setItem("leads.values", v ? "1" : "0"); } catch (e) { /* a private window: the choice lives for the page */ } }}
      empty={leadView.cls === "review"
        ? { title: "Nothing needs a look.", body: "Every lead here has been checked or decided.", action: null }
        : !leadView.cls && waitsOn(leadView.searchId)
        ? { title: "Nothing is counted yet.", body: "It is waiting for your answer above.", action: null }
        : { title: "No leads in this view yet.", body: "Describe the businesses you want and Claude finds them.", action: canFind ? { label: "Find leads", onClick: openFind } : null }}
      sel={sel}
      onToggle={toggleSel}
      onToggleAll={toggleAll}
      onClearSel={clearSelection}
      onSelectIds={(ids) => { setSel(new Set(ids)); setAllMatching(false); }}
      // Needs review's resolvers (D3). Keep and Exclude go through the bulk door (00145), which takes the member's
      // own door once per lead; Check again through its own. Find an email draws only once its courier exists, so
      // the bar never offers what no door can do.
      review={{
        actsFor: (ids) => {
          const V = window.__LEAD_VM || {};
          const groups = V.leadReviewGroups ? V.leadReviewGroups(leads.rows.filter((l) => ids.indexOf(l.id) >= 0), openSearch) : [];
          return [...new Set(groups.flatMap((g) => g.acts))];
        },
        canCheckAgain: typeof window.__leadCheckAgain === "function",
        canFindEmail: typeof window.__leadFindEmail === "function",
        onCheckAgain: (ids) => window.__leadCheckAgain && leadSaid(() => window.__leadCheckAgain(ids)),
        onFindEmail: (ids) => window.__leadFindEmail && leadAct(() => window.__leadFindEmail(ids), <>Looking for {ids.length === 1 ? "an email" : `${ids.length} emails`}.</>),
        onKeep: (ids) => leadSaid(() => window.__leadsBulk({ by: "ids", action: "keep", ids, ...(leadView.searchId ? { search_id: leadView.searchId } : {}) })),
        onExclude: (ids) => leadSaid(() => window.__leadsBulk({ by: "ids", action: "exclude", ids, ...(leadView.searchId ? { search_id: leadView.searchId } : {}) })),
      }}
      allMatching={allMatching}
      onSelectAllMatching={() => setAllMatching(true)}
      bulkView={{ list: leadView.list, ...(leadView.searchId ? { search: leadView.searchId } : {}), ...(leadView.cls ? { class: leadView.cls } : {}), sort: sortBy, dir: sortDir }}
      bulkBusy={leadBusy}
      onBulk={bulkLeads}
      bulkWhy={bulkWhy}
      onBulkWhy={setBulkWhy}
      bulkSheet={phone ? bulkSheet : null}
      onBulkSheet={setBulkSheet}
      onBulkNotAFit={bulkNotAFit}
      onCopyEmails={copyEmails}
      cursor={cursor}
      onCursor={setCursor}
      canFind={canFind}
      canExport={canExport}
      exportHref={window.__href ? window.__href("GET leads/export", undefined, { list: leadView.list, ...(leadView.searchId ? { search: leadView.searchId } : {}), ...(leadView.cls ? { class: leadView.cls } : {}), sort: sortBy, dir: sortDir }) : null}
      onScope={(to) => nav(plScopeRoute(to))}
      // The Pipeline is in the switch where deals are on (0008): People's surface says so, and it lands after Leads' on a
      // cold load of Leads, when the switch gains its third tab.
      dealsOn={!!people.dealsOn}
      // The rail picks as People's does (railToggle): a list or a search, one at a time. A list pressed while a
      // search was open used to keep the search and narrow inside it, and the rail lit neither; a search picked
      // kept the list, and showed fewer of its leads than its count said. The class and the chip start over.
      onPickList={(id) => { setChip(null); nav(pickListRoute(id)); }}
      onPickSearch={(id) => { setChip(null); nav(pickSearchRoute(id)); }}
      // The row under the pointer reads its view ahead of the press (the surface holds it; leads.ts warmLeadsView).
      onWarmList={(id) => window.__leadsWarm && window.__leadsWarm(pickListRoute(id))}
      onWarmSearch={(id) => window.__leadsWarm && window.__leadsWarm(pickSearchRoute(id))}
      onPickClass={(cls) => { setChip(null); goto({ cls }); }}
      chip={chip}
      onPickChip={setChip}
      onNeedsYou={(id) => nav(window.__leadsRouteOf({ searchId: id, list: "all", cls: "excluded" }))}
      exportHrefFor={exportHrefFor}
      searchWordsFor={searchWordsFor}
      renaming={renaming}
      onRename={setRenaming}
      onRenameSave={renameSearch}
      onRenameCancel={() => setRenaming(null)}
      removing={removing}
      onRemoveAsk={(s) => { setRemoveError(null); setRemoving(s); }}
      onUndo={(s) => undoRound(s.id)}
      onRemoveYes={removeSearch}
      onRemoveNo={() => { setRemoving(null); setRemoveError(null); }}
      removeBusy={leadBusy}
      removeError={removeError}
      onFindNewOnes={findNewOnes}
      onSearchAgain={searchAgain}
      onFind={openFind}
      finderOpen={finderOpen}
      finderStage={finderStage}
      finderWords={finderWords}
      finderProposal={finderProposal}
      finderRefusal={finderRefusal}
      finderBusy={leadBusy}
      finderPlan={finderPlan}
      finderTrace={finderTrace}
      finderPick={finderPick}
      onFinderWords={setFinderWords}
      onFinderPlan={finderPlanIt}
      onFinderApprove={finderApprove}
      onFinderChangePlan={setFinderPlan}
      onFinderPick={setFinderPick}
      onFinderBack={() => setFinderStage("compose")}
      onCloseFinder={() => { setFinderOpen(false); setFinderMore(null); }}
      finderAnswering={finderMore && finderMore.answer ? finderMore : null}
      talk={talk}
      peek={peekId && window.__leadPeekVM ? window.__leadPeekVM(peekId) : null}
      // Where this lead sits in the pile, and the two ways through it (D5). Moving the deck moves the page's own
      // cursor as J and K do, so the rows behind the peek move with it.
      deck={peekId && shownIds.indexOf(peekId) >= 0
        ? {
          at: shownIds.indexOf(peekId) + 1,
          of: shownIds.length,
          onPrev: () => deckMove(-1),
          onNext: () => deckMove(1),
        }
        : null}
      peekMode={peekMode}
      onPeekMode={setPeekMode}
      armed={armed}
      onArmed={setArmed}
      draft={draft}
      onDraftState={setDraft}
      // On a phone, while anyone is selected a tap on a row selects it, as on People (the face is the checkbox).
      onPeek={phone && leadShown.some((l) => sel.has(l.id)) ? toggleSel : setPeekId}
      onPeekId={setPeekId}
      onOpenPerson={onOpenProfile}
      flash={plFlash}
      onClosePeek={() => leadPeekEscape({ mode: peekMode, armed, setMode: setPeekMode, setArmed, setPeekId, lightbox: lightboxId, setLightbox: setLightboxId })}
      onExpandPhoto={setLightboxId}
      lightbox={lightboxId && window.__leadPeekVM ? window.__leadPeekVM(lightboxId) : null}
      onCloseLightbox={() => setLightboxId(null)}
      onCall={callLead}
      onKeep={keepLead}
      onExclude={excludeLead}
      onPutBack={putBackLead}
      onCopy={copyLead}
      onCopyPhone={copyPhone}
      onLogCall={logLeadCall}
      onStripAction={onStripAction}
      onTakeOffered={takeOffered}
      onMore={leadsMore}
      loadingMore={leadsMoreBusy}
      firstDay={leads.searches.length === 0 && !leads.readFailed}
      // The three ways claim only what THIS tab has read: the line is the setup
      // surface's, which this route does not load on a cold open, so it is passed
      // only when the owner came from Setup in this tab (Task 17, decision 2).
      ways={window.__leadWays ? window.__leadWays({
        voice: window.__SETUP && window.__SETUP.dto ? window.__SETUP.dto.channels.voice : null,
        whatsapp: window.__SETUP && window.__SETUP.dto ? window.__SETUP.dto.channels.whatsapp : null,
        calendar: (people.calendar && people.calendar.state) || "none",
        people: (people.aggregates && people.aggregates.total) || 0,
      }) : []}
      lineOpen={!!leadLine}
      lineDraft={leadLine ? leadLine.draft : ""}
      lineError={leadLine ? leadLine.error : null}
      lineBusy={!!(leadLine && leadLine.busy)}
      onOpenLine={() => setLeadLine({ draft: leads.suggestions ? leads.suggestions.business_line : "", error: null, busy: false })}
      onLineDraft={(draft) => setLeadLine((l) => ({ ...l, draft, error: null }))}
      onSaveLine={saveBusinessLine}
      onCancelLine={() => setLeadLine(null)}
      onGo={(to) => nav(to)}
      onBusinessLine={(line) => window.__leadBusinessLine && window.__leadBusinessLine(line)}
      toastNode={toastNode}
    />
  );
};

// A real workspace renders its own people; the seeded page keeps the demo. The Leads scope is real as soon as
// its own surface has landed, whether or not People's has: the route gate waits on the surface the address names
// (surface-registry routeSurfaceFor), and the seeded page has no Leads scope to draw.
// The Pipeline is the third scope (pipeline-scope.jsx), People's own rows by their deals, and only where deals are on:
// on a workspace whose customers book, its address draws People.
const ClientsA = (props) => {
  if (props.scope === "leads") return window.__LEADS ? <LeadsReal {...props} /> : <ClientsASeed {...props} />;
  if (props.scope === "pipeline" && window.__PEOPLE && window.__PEOPLE.dealsOn && window.PipelineScope) return <window.PipelineScope {...props} />;
  return window.__PEOPLE ? <PeopleReal {...props} /> : <ClientsASeed {...props} />;
};

window.ClientsA = ClientsA;
// Drawn on their own by refusals-on-the-page.test.mjs; the rail, the standing line and the table's noun are the
// Leads scope's too (leads-scope.jsx draws them with scope="leads"). The Pipeline (pipeline-scope.jsx) is a third view
// over the same list page, and takes its hooks, its person cell and its search from here: one rule each.
Object.assign(window, { plAddPerson, plAddedWords, PL_ADD_EMPTY, NewListRow, AddPersonButton, DeleteListButton, PeopleRail, PeopleStanding, PeopleScopeTabs, PeopleListsSheet, PeopleBulkBar, PeoplePhoneBar, PhoneSheet, PhoneSheetRow, plRowCard, RailSection, RailGroup, RailRow, RailEmpty, railQuiet, railToggle, usePeople, usePlControls, usePlPlace, plNameCell, plFace, plIsNumber, plMatcher, plScopeRoute, plLoadedWords, PL_SEARCH_LABEL });
