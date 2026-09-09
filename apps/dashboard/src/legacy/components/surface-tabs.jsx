/* global React, Icon */
// Chanlytics — SurfaceTabs
// The nav-collapse layer: merged surfaces (People, Conversations, Campaigns,
// Agents) are VIEWS under one nav item, not places. Rendered by the shell
// above the routed page; all routes stay unchanged so deep links keep working.

const ST_GROUPS = {
  people: {
    match: ["clients", "leads", "pipeline", "segments"],
    tabs: [
      { id: "clients", label: "People", to: "clients" },
      // badge is demo-only: LEADS is seed data, and this number rendered inside
      // otherwise-real chrome — a fabricated "4" one tab away from real threads.
      // Leads, the deal board and saved lists are Tier 2: seed data with no
      // table behind it. A real workspace sees Clients alone, so the strip
      // hides itself rather than offering three Coming Soon panes.
      { id: "leads", label: "Leads", to: "leads", demoOnly: true, badge: () => (window.__DEMO_MODE ? ((window.LEADS || []).filter(l => l.stage === "ready").length) || null : null), tip: "Leads scored ready — your call to make" },
      { id: "pipeline", label: "Deal board", to: "pipeline", demoOnly: true, tip: "Deals are leads with money attached — same people, board view" },
      // NOT demoOnly: Lists has been real since #123 and the registry calls it
      // "People > Lists". The flag outlived the surface being seed-only, and
      // because it was the only other People tab, the bar fell under the
      // two-tab minimum and vanished -- so a shipped surface was reachable in
      // production only from a "New segment" button in a rail on People.
      { id: "segments", label: "Lists", to: "segments", tip: "The lists kept by hand and the ones an agent keeps for you" },
    ],
  },
  conversations: {
    match: ["conversations", "live"],
    tabs: [
      { id: "conversations", label: "All", to: "conversations" },
      // pulse is demo-only: it advertised a call in progress for an invented
      // caller, always on, beside the REAL Conversations tab.
      // With the bridge running the pulse is the real thing: a call in
      // progress under the heartbeat rule. The seeded pulse stays demo-only.
      { id: "live", label: "Live", to: "live", pulse: () => (window.__LIVE
        // The same heartbeat rule the page applies between refreshes, so the
        // tab does not pulse for a phantom the page has already dropped.
        ? window.__LIVE.now.some((c) => Date.now() - (c.heartbeatAtMs || c.startedAtMs || 0) < window.__LIVE.heartbeatMs)
        : !!window.__DEMO_MODE && !(window.LM_STORE && window.LM_STORE.isEnded("lc-selena"))), tip: "Calls on your line, as they happen" },
    ],
  },
  campaigns: {
    match: ["outbound", "broadcasts", "messages", "content"],
    tabs: [
      { id: "outbound", label: "Playbooks", to: "outbound" },
      { id: "broadcasts", label: "Broadcasts", to: "broadcasts" },
      { id: "messages", label: "Messages", to: "messages", tip: "The WhatsApp messages your playbooks and broadcasts send, as the customer sees them" },
      // Content is seed-only: a real workspace has no such surface yet.
      { id: "content", label: "Content", to: "content", demoOnly: true },
    ],
  },
  agents: {
    match: ["fleet", "store", "studio", "tasks"],
    tabs: [
      // Every tab in this group is a "demo" surface, so in production all four
      // led to the same Coming Soon pane. One honest pane beats four ways to
      // find it; they come back the day their slice ships.
      { id: "fleet", label: "Fleet", to: "fleet", demoOnly: true },
      { id: "store", label: "Store", to: "store", demoOnly: true },
      { id: "studio", label: "Studio", to: "studio", demoOnly: true },
      { id: "tasks", label: "Tasks", to: "tasks", demoOnly: true, tip: "The work ledger — receipts for everything agents did" },
    ],
  },
};

const SurfaceTabs = ({ page, param, onNavigate }) => {
  const [, stBump] = React.useReducer(n => n + 1, 0);
  React.useEffect(() => {
    const evs = ["live:ended", "surface:live", "inbox:decisions", "leads:verdict"];
    evs.forEach(e => window.addEventListener(e, stBump));
    return () => evs.forEach(e => window.removeEventListener(e, stBump));
  }, []);
  const group = Object.values(ST_GROUPS).find(g => g.match.includes(page));
  if (!group) return null;
  const tabs = group.tabs.filter(t => !t.demoOnly || window.__DEMO_MODE);
  if (tabs.length < 2) return null;
  // Detail views keep their focus: hide on a client profile
  if (page === "clients" && param && !param.startsWith("seg:")) return null;
  return (
    <nav className="stabs" aria-label="Section views">
      {tabs.map(t => {
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
