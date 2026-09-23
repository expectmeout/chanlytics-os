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
      // No Leads tab: Leads is a SCOPE of People (clients/leads), and its switch is the rail's own
      // People | Leads (PRD §6.1). A tab here would point at the retired `leads` route and bounce
      // through the redirect to reach the scope the page is already showing.
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
      // It counts people who need you, so it is amber, as the Needs you pill is (tone.ts warn).
      { id: "inbox", label: "Needs you", to: "inbox", tone: "warn", badge: () => (window.sbNeedsCount ? window.sbNeedsCount() : 0) || null, tip: "Waiting on a decision from you" },
      { id: "conversations", label: "Conversations", to: "conversations", tip: "Every chat and call, answered or not" },
      // pulse is demo-only: it advertised a call in progress for an invented
      // caller, always on, beside the REAL Conversations tab.
      // With the bridge running the pulse is the real thing: a call in
      // progress under the heartbeat rule. The seeded pulse stays demo-only.
      { id: "live", label: "Live", to: "live", pulse: () => (window.__LIVE
        // The same heartbeat rule the page applies between refreshes, so the
        // tab does not pulse for a phantom the page has already dropped.
        ? window.__LIVE.now.some((c) => window.__chrome.liveStillUp(c, window.__LIVE.heartbeatMs, Date.now()))
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

// What each Campaigns tab says is behind it, from the surface that page reads:
// the playbooks running, the runs waiting on the owner, the templates on file.
// A surface not read yet says nothing, never a 0 -- a tab visited first reads its
// own, and the others fill in as they are read. Only the runs waiting on you are
// a warning; the other two are counts.
const ST_COUNTS = {
  outbound: { tone: "plain", n: () => (window.__PLAYBOOKS && window.__PLAYBOOKS.rows ? window.__PLAYBOOKS.rows.filter((p) => p.state === "running").length : 0) },
  broadcasts: { tone: "warn", n: () => (window.__BROADCASTS && window.__BROADCASTS.rows ? window.__BROADCASTS.rows.filter((r) => r.state === "pending_approval").length : 0) },
  messages: { tone: "plain", n: () => (Array.isArray(window.__TEMPLATES_ALL) ? window.__TEMPLATES_ALL.filter((t) => !t.hidden_at && t.name !== "hello_world").length : 0) },
};

const SurfaceTabs = ({ page, param, onNavigate }) => {
  const [, stBump] = React.useReducer(n => n + 1, 0);
  React.useEffect(() => {
    // inbox:counts too: the Needs-you tab carries the badge, and the count moves
    // when Today publishes the real one or a decision lands.
    // The Campaigns surfaces too: each tab's count is read off them.
    const evs = ["live:ended", "surface:live", "inbox:counts", "inbox:decisions", "leads:verdict", "surface:playbooks", "surface:broadcasts", "surface:settings"];
    evs.forEach(e => window.addEventListener(e, stBump));
    return () => evs.forEach(e => window.removeEventListener(e, stBump));
  }, []);
  const [groupKey, group] = Object.entries(ST_GROUPS).find(([, g]) => g.match.includes(page)) || [null, null];
  if (!group) return null;
  const tabs = group.tabs.filter(t => !t.demoOnly || window.__DEMO_MODE);
  if (tabs.length < 2) return null;
  // Detail views keep their focus: hide on a person's profile. A list (seg:, list:) and a state (state:) are views of
  // People, and the tabs vanished on the last two (the wiring audit's N24).
  if (page === "clients" && param && !/^(seg|list|state):/.test(param)) return null;
  return (
    <nav className={`stabs stabs-${groupKey}`} aria-label="Section views">
      {tabs.map(t => {
        const count = groupKey === "campaigns" ? ST_COUNTS[t.id] : null;
        const badge = t.badge ? t.badge() : count ? count.n() || null : null;
        const pulse = t.pulse ? t.pulse() : false;
        return (
          <button key={t.id} className={`stabs-tab ${page === t.id ? "active" : ""}`} data-tip={t.tip || null} data-tip-side="bottom" onClick={() => onNavigate(t.to)}>
            {t.label}
            {pulse && <span className="live-dot" style={{ width: 5, height: 5 }} />}
            {badge ? <span className={`stabs-badge tally${(count ? count.tone : t.tone) === "warn" ? " tally-warn" : ""}`} data-tone={(count ? count.tone : t.tone) || "plain"}>{badge}</span> : null}
          </button>
        );
      })}
    </nav>
  );
};

window.SurfaceTabs = SurfaceTabs;
