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
      // No Lists tab: on a real workspace the lists are the People rail (and a sheet on a phone), and `segments/<id>`
      // lands on People with that list picked. A real workspace has one People tab, so the bar draws nothing there;
      // the demo keeps the seeded Segments page behind the seeded rail's own doors.
    ],
  },
  // One door over one table. inboxOverride and conversationsOverride both read
  // GET conversations (surface-data.ts:261, :400) — the Inbox is the subset that
  // waits on a decision, Conversations is all of them plus the calls. They were
  // two nav items, so an owner who could not tell them apart checked both.
  inbox: {
    match: ["inbox", "conversations", "live"],
    tabs: [
      // The same count the sidebar badge and the phone tab show, from the one
      // rule that owns it (ixWaitsOnYou) — never a second reading of it.
      { id: "inbox", label: "Needs you", to: "inbox", badge: () => (window.sbNeedsCount ? window.sbNeedsCount() : 0) || null, tip: "Waiting on a decision from you" },
      { id: "conversations", label: "Conversations", to: "conversations", tip: "Every chat and call, answered or not" },
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
      // "Templates" is Meta's word and WhatsApp Manager's, which is where an
      // owner meets these and where this page syncs them from. It was
      // "Messages", which made the word mean three things across one nav —
      // a thread in the Inbox, a send in "15 messages, 87% delivered", and
      // the wording on file here — and needed this tip to say which.
      { id: "messages", label: "Templates", to: "messages", tip: "The wording your playbooks and broadcasts send, as the customer sees it" },
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
    // inbox:counts too: the Needs-you tab carries the badge, and the count moves
    // when Today publishes the real one or a decision lands.
    const evs = ["live:ended", "surface:live", "inbox:counts", "inbox:decisions", "leads:verdict"];
    evs.forEach(e => window.addEventListener(e, stBump));
    return () => evs.forEach(e => window.removeEventListener(e, stBump));
  }, []);
  const group = Object.values(ST_GROUPS).find(g => g.match.includes(page));
  if (!group) return null;
  const tabs = group.tabs.filter(t => !t.demoOnly || window.__DEMO_MODE);
  if (tabs.length < 2) return null;
  // Detail views keep their focus: hide on a person's profile. A list (seg:, list:) and a state (state:) are views of
  // People, and the tabs vanished on the last two (the wiring audit's N24).
  if (page === "clients" && param && !/^(seg|list|state):/.test(param)) return null;
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
