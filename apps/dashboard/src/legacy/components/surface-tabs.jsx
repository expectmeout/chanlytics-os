/* global React, Icon */
// Chanlytics — SurfaceTabs
// The nav-collapse layer: merged surfaces (People, Conversations, Campaigns,
// Agents) are VIEWS under one nav item, not places. Rendered by the shell
// above the routed page; all routes stay unchanged so deep links keep working.

const ST_GROUPS = {
  people: {
    match: ["clients", "leads", "pipeline", "segments"],
    tabs: [
      { id: "clients", label: "Clients", to: "clients" },
      { id: "leads", label: "Leads", to: "leads", badge: () => ((window.LEADS || []).filter(l => l.stage === "ready").length) || null, tip: "Leads scored ready — your call to make" },
      { id: "pipeline", label: "Deal board", to: "pipeline", tip: "Deals are leads with money attached — same people, board view" },
      { id: "segments", label: "Lists", to: "segments" },
    ],
  },
  conversations: {
    match: ["conversations", "live"],
    tabs: [
      { id: "conversations", label: "All", to: "conversations" },
      { id: "live", label: "Live", to: "live", pulse: () => !(window.LM_STORE && window.LM_STORE.isEnded("lc-selena")), tip: "Happening right now — watch, whisper, or take over" },
    ],
  },
  campaigns: {
    match: ["outbound", "broadcasts", "content"],
    tabs: [
      { id: "outbound", label: "Outbound", to: "outbound" },
      { id: "broadcasts", label: "Broadcasts", to: "broadcasts" },
      { id: "content", label: "Content", to: "content" },
    ],
  },
  agents: {
    match: ["fleet", "store", "studio", "tasks"],
    tabs: [
      { id: "fleet", label: "Fleet", to: "fleet" },
      { id: "store", label: "Store", to: "store" },
      { id: "studio", label: "Studio", to: "studio" },
      { id: "tasks", label: "Tasks", to: "tasks", tip: "The work ledger — receipts for everything agents did" },
    ],
  },
};

const SurfaceTabs = ({ page, param, onNavigate }) => {
  const [, stBump] = React.useReducer(n => n + 1, 0);
  React.useEffect(() => {
    const evs = ["live:ended", "inbox:decisions", "leads:verdict"];
    evs.forEach(e => window.addEventListener(e, stBump));
    return () => evs.forEach(e => window.removeEventListener(e, stBump));
  }, []);
  const group = Object.values(ST_GROUPS).find(g => g.match.includes(page));
  if (!group) return null;
  // Detail views keep their focus: hide on a client profile
  if (page === "clients" && param && !param.startsWith("seg:")) return null;
  return (
    <nav className="stabs" aria-label="Section views">
      {group.tabs.map(t => {
        const badge = t.badge ? t.badge() : null;
        const pulse = t.pulse ? t.pulse() : false;
        return (
          <button key={t.id} className={`stabs-tab ${page === t.id ? "active" : ""}`} data-tip={t.tip || null} data-tip-side="bottom" onClick={() => onNavigate(t.to)}>
            {t.label}
            {pulse && <span className="live-dot" style={{ width: 5, height: 5 }} />}
            {badge ? <span className="stabs-badge tabular">{badge}</span> : null}
          </button>
        );
      })}
    </nav>
  );
};

window.SurfaceTabs = SurfaceTabs;
