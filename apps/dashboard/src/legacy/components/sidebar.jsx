/* global React, Icon */
// Chanlytics — Sidebar v2
// Team switcher (top) → New Chat → My Intelligence Hub nav → Active Agents → User chip

const NAV_PRIMARY = [
  { id: "home",     icon: "home",     label: "Today",       hint: "Live brief" },
  { id: "inbox",    icon: "inbox",    label: "Inbox",       urgent: true },
];

// Flat nav — merged surfaces are views (SurfaceTabs), not places
const NAV_WORK = [
  { id: "people",        icon: "users",    label: "People" },
  { id: "conversations", icon: "chat",     label: "Conversations" },
  { id: "calendar",      icon: "calendar", label: "Calendar" },
  { id: "campaigns",     icon: "bolt",     label: "Campaigns" },
];

const NAV_INTEL = [
  { id: "agents",  icon: "agents",      label: "Agents" },
  { id: "reports", icon: "trending-up", label: "Reports" },
];

const NAV_FOOT = [
  { id: "admin", icon: "settings", label: "Settings" },
];

const ACTIVE_AGENTS_DEFAULT = [
  { id: "phone",  glyph: "P", name: "Phone Rep",     status: "active",    task: "On call · Selena Cho · 0:42" },
  { id: "ig",     glyph: "I", name: "Chat Agent",    status: "active",    task: "Drafting reply · @marcus_lee" },
  { id: "sms",    glyph: "S", name: "SMS Agent",     status: "scheduled", task: "Birthday offer · 5:00pm" },
  { id: "email",  glyph: "E", name: "Email Agent",   status: "idle",      task: "Last action 3m ago" },
  { id: "qual",   glyph: "Q", name: "Qualifier",     status: "idle",      task: "Waiting for new leads" },
  { id: "rev",    glyph: "R", name: "Review Bot",    status: "scheduled", task: "Auto-send tmrw 10:00am" },
  { id: "obj",    glyph: "O", name: "Objection Coach", status: "idle",    task: "Standby" },
  { id: "rec",    glyph: "X", name: "Recovery Agent", status: "idle",     task: "3 cold leads queued" },
];

// Stable ranking: active → scheduled → idle → paused, then alphabetical
const STATUS_RANK = { active: 0, scheduled: 1, idle: 2, paused: 3 };
const sortAgents = (list) => [...list].sort((a, b) =>
  (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || a.name.localeCompare(b.name)
);

// Session overlay: FL_STORE pauses + LM_STORE call endings reshape the strip
const sbOverlay = (a) => {
  let next = a;
  const regId = window.CHANLY ? window.CHANLY.agentIdFor(a.name) : a.id;
  const st = window.FL_STORE && window.FL_STORE.statuses && window.FL_STORE.statuses[regId];
  if (st === "paused") next = { ...next, status: "paused", task: "Paused by you — resume in Fleet" };
  if (a.glyph === "P" && window.LM_STORE && window.LM_STORE.isEnded("lc-selena") && /Selena/.test(a.task)) {
    next = { ...next, status: st === "paused" ? "paused" : "idle", task: st === "paused" ? next.task : "Wrapped call · Selena Cho · summary in Conversations" };
  }
  return next;
};

// Seed-honest needs count: live threads in "needs" minus session decisions
const sbNeedsCount = () => {
  const threads = ((window.INBOX_DATA || {}).THREADS) || [];
  return threads.filter(t => {
    if (t.state !== "needs" && !(t.state === "escalated" && !t.takenOver)) return false; // real escalations count too
    const rec = window.IX_STORE && window.IX_STORE.get(t.id);
    return !(rec && (rec.kind === "decided" || rec.kind === "snoozed"));
  }).length;
};

// Credits: shared billing source (Settings › Billing top-ups move this)
const sbCredits = () => {
  const b = window.__BILLING;
  if (!b) return "5,350";
  return (b.creditsTotal + b.topup - b.creditsUsed).toLocaleString();
};

const SidebarRow = ({ item, active, parentActive, onNavigate, depth = 0, expanded, onToggle, badges = {} }) => {
  const badge = badges[item.id] !== undefined ? badges[item.id] : item.badge;
  return (
  <>
    <div
      className={`nav-item ${active === item.id ? "active" : ""} ${parentActive === item.id ? "parent-active" : ""} ${item.urgent ? "urgent" : ""}`}
      style={{ paddingLeft: 10 + depth * 16 }}
      onClick={(e) => { if (item.expandable) { onToggle(item.id); } else { onNavigate(item.id); } }}
    >
      {item.icon && <Icon name={item.icon} />}
      <span>{item.label}</span>
      {item.hint && <span className="nav-hint">{item.hint}</span>}
      {badge ? <span className={`nav-badge ${item.urgent ? "urgent" : ""} tabular`} data-tip={item.id === "inbox" ? "Decisions waiting on you — agents hold until you call it" : item.id === "people" ? "Leads scored ready — your call to make" : null}>{badge}</span> : null}
      {item.expandable && (
        <Icon name="chevron" size={11} style={{
          marginLeft: badge ? 4 : "auto",
          transform: expanded ? "rotate(90deg)" : "none",
          transition: "transform 160ms",
          color: "var(--ink-faint)"
        }} />
      )}
    </div>
    {item.expandable && expanded && item.children?.map((c) => (
      <div
        key={c.id}
        className={`nav-item nav-sub ${active === c.id ? "active" : ""}`}
        style={{ paddingLeft: 38 }}
        onClick={() => onNavigate(c.id)}
      >
        <span>{c.label}</span>
        {c.badge && <span className="nav-badge tabular">{c.badge}</span>}
      </div>
    ))}
  </>
  );
};

// Identity comes from window.__ME (written by the seam's workspace override).
// Falls back to the seeded persona only in demo mode; signed in with no
// identity yet we say so rather than borrow someone else's name.
const sbMe = () => window.__ME || null;
// The workspace being VIEWED, not the first one alphabetically.
//
// Every data surface, the bridge pill and Settings resolve by
// __ACTIVE_WORKSPACE; only the chrome still read [0]. Membership order and
// name order diverge the moment anyone belongs to two workspaces, and the
// result is one business's name standing over another's conversations — which
// the seam's own switchWorkspace comment calls the single worst thing this app
// can do. [0] survives only as the fallback for a boot that has not resolved
// an active workspace yet.
const sbWorkspace = () => {
  const all = window.__WORKSPACES || [];
  return all.find((w) => w.id === window.__ACTIVE_WORKSPACE) || all[0] || null;
};
const sbWorkspaceName = () => {
  const ws = sbWorkspace();
  if (ws && ws.name) return ws.name;
  return window.__DEMO_MODE ? "Chanlytics Sales" : "Workspace";
};
const sbWorkspaceMark = () => {
  const n = sbWorkspaceName();
  const w = n.split(/[\s@._-]+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase() || "—";
};
const sbAccountEmail = () => (sbMe() ? sbMe().email : window.__DEMO_MODE ? "sales@chanlytics.com" : "Signed in");
// Title line is the WORKSPACE, not a name invented from the email's local part
// ("hi@chanlytics.agency" -> "Hi" is technically honest and reads like a bug).
// There is no profile name in the schema yet; when Settings adds one, it wins.
const sbAccountName = () => {
  if (!sbMe()) return window.__DEMO_MODE ? "Sarah Chen" : "Your account";
  const ws = (window.__WORKSPACES || [])[0];
  return (ws && ws.name) || "Your account";
};
const sbInitials = () => {
  if (!sbMe()) return window.__DEMO_MODE ? "SC" : "—";
  const ws = (window.__WORKSPACES || [])[0];
  const src = (ws && ws.name) || sbMe().email || "?";
  const words = src.split(/[\s@._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "—";
};

const Sidebar = ({ active = "home", onNavigate = () => {}, onNewChat = () => {}, onClose = null, agents = ACTIVE_AGENTS_DEFAULT, badges = {} }) => {
  const [, setTick] = React.useState(0);
  const [needs, setNeeds] = React.useState(sbNeedsCount);

  // Live session overlays: fleet pauses, ended calls, decisions, inbox counts, billing
  React.useEffect(() => {
    const bump = () => setTick(n => n + 1);
    const onCounts = (e) => setNeeds(e.detail && typeof e.detail.needs === "number" ? e.detail.needs : sbNeedsCount());
    const onDecisions = () => setNeeds(sbNeedsCount());
    window.addEventListener("fleet:status", bump);
    window.addEventListener("live:ended", bump);
    window.addEventListener("billing:changed", bump);
    window.addEventListener("inbox:counts", onCounts);
    window.addEventListener("inbox:decisions", onDecisions);
    return () => {
      window.removeEventListener("fleet:status", bump);
      window.removeEventListener("live:ended", bump);
      window.removeEventListener("billing:changed", bump);
      window.removeEventListener("inbox:counts", onCounts);
      window.removeEventListener("inbox:decisions", onDecisions);
    };
  }, []);

  const liveAgents = agents.map(sbOverlay);

  // Computed badges — seed-honest counts; caller-supplied badges win
  const computedBadges = {
    inbox: needs > 0 ? String(needs) : null,
    // LEADS is mockup seed data — a real workspace has no leads engine yet, so
    // a "4" here is an invented number sitting in the real chrome.
    people: window.__DEMO_MODE ? (String(((window.LEADS || []).filter(l => l.stage === "ready").length) || "") || null) : null,
    ...badges,
  };

  // Swipe-to-close (mobile drawer) — simple left-swipe threshold, no drag-follow
  const touchX = React.useRef(null);
  const onTouchStart = (e) => { touchX.current = e.touches && e.touches[0] ? e.touches[0].clientX : null; };
  const onTouchEnd = (e) => {
    if (touchX.current == null || !onClose) return;
    const endX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : touchX.current;
    if (touchX.current - endX > 48) onClose();
    touchX.current = null;
  };
  // Route id -> flat nav id (merged surfaces highlight their group)
  const groupMap = {
    people: ["clients", "leads", "segments", "pipeline"],
    conversations: ["conversations", "live", "calls", "chats", "email"],
    campaigns: ["outbound", "content", "broadcasts"],
    agents: ["fleet", "store", "studio", "tasks"],
  };
  const effActive = (() => {
    for (const [k, kids] of Object.entries(groupMap)) if (kids.includes(active)) return k;
    return active;
  })();
  const expanded = {}; const toggle = () => {}; const parentActive = null;

  const renderGroup = (items, label) => (
    <div className="sidebar-section">
      {label && <div className="sidebar-label">{label}</div>}
      {items.map((it) => (
        <SidebarRow
          key={it.id}
          item={it}
          active={effActive}
          parentActive={parentActive}
          onNavigate={onNavigate}
          expanded={expanded[it.id]}
          onToggle={toggle}
          badges={computedBadges}
        />
      ))}
    </div>
  );

  return (
    <aside className="sidebar" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Mobile drawer header — hidden on desktop */}
      <div className="sb-mobile-head">
        <span className="sidebar-brand-mark">C</span>
        <span className="sb-mobile-title">Chanlytics</span>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onClose && onClose()} aria-label="Close menu">
          <Icon name="x" size={14} />
        </button>
      </div>

      {/* Team switcher */}
      <div className="sb-team" onClick={() => onNavigate("admin")}>
        <div className="sb-team-mark">{sbWorkspaceMark()}</div>
        <div className="sb-team-body">
          <div className="sb-team-name">{sbWorkspaceName()}</div>
          {window.__DEMO_MODE && <div className="sb-team-plan">Professional</div>}
        </div>
        <Icon name="chevron-down" size={14} style={{ color: "var(--ink-dim)" }} />
      </div>

      {/* New Chat — primary CTA.
          Opens the Ask assistant, which answers from seed data: invented
          revenue, invented waiting decisions, a refund dispute for a customer
          who does not exist. The other three entry points (window.appAsk, ⌘K,
          the topbar button) were all gated when Ask was stubbed; the most
          prominent control in the chrome was not, so the fabrication the
          registry and the pill exist to prevent was one click away on every
          real workspace. Gated the same way the topbar is, and worded the
          same. */}
      <div className="sb-newchat">
        <button
          className="btn btn-primary"
          style={{ width: "100%", height: 32, justifyContent: "center" }}
          onClick={window.__DEMO_MODE ? onNewChat : undefined}
          disabled={!window.__DEMO_MODE}
          title={window.__DEMO_MODE ? "Start a new Ask thread" : "Ask isn't connected to your data yet"}
        >
          <Icon name="plus" size={13} />
          New Chat
          {window.__DEMO_MODE ? null : <span className="kbd" style={{ marginLeft: 6 }}>Soon</span>}
        </button>
      </div>

      {/* Scrollable nav region — grows/shrinks with the agents block */}
      <div className="sb-nav-scroll">
        {renderGroup(NAV_PRIMARY)}
        {renderGroup(NAV_WORK, "Workspace")}
        {renderGroup(NAV_INTEL, "Intelligence")}
        {renderGroup(NAV_FOOT)}
      </div>

      {/* Active Agents — demo only. The seeded roster claims eight agents doing
          live work ("Phone Rep · On call · Selena Cho · 0:42"); the real
          product runs two, and the Fleet surface that would show them honestly
          is a later slice. An invented roster next to real conversation data
          costs more credibility than the shortcut is worth. */}
      {window.__DEMO_MODE && <div className="sb-agents">
        <div className="sb-agents-head">
          <span className="sidebar-label" style={{ padding: 0 }}>Agents</span>
          <span className="sb-agents-count">
            {liveAgents.filter(a => a.status === "active").length > 0 && <span className="live-dot" style={{ width: 5, height: 5 }} />}
            {liveAgents.filter(a => a.status === "active").length} live
            <span className="sb-agents-sep">·</span>
            {liveAgents.length}
          </span>
        </div>
        <div className="sb-agents-scroll">
          {sortAgents(liveAgents).map((a) => (
            <div className={`sb-agent ${a.status === "paused" ? "sb-agent-paused" : ""}`} key={a.id} title={`${a.name} — ${a.task}`} onClick={() => onNavigate(`fleet/${window.CHANLY ? window.CHANLY.agentIdFor(a.name) : a.id}`)}>
              <div className={`agent-avatar ${a.status === "active" ? "active" : ""}`} style={{ width: 22, height: 22, fontSize: 10, opacity: a.status === "paused" ? 0.55 : 1 }}>
                {a.glyph}
              </div>
              <div className="sb-agent-body">
                <div className="sb-agent-name">
                  {a.name}
                  {a.status === "active" && <span className="live-dot" style={{ width: 6, height: 6 }} />}
                  {a.status === "paused" && <Icon name="pause" size={9} style={{ color: "var(--warn)" }} />}
                </div>
                <div className="sb-agent-task">{a.task}</div>
              </div>
            </div>
          ))}
        </div>
        <button className="sb-agents-foot" onClick={() => onNavigate("store")}>
          <Icon name="plus" size={11} />
          <span>Hire from store</span>
          <span className="sb-agents-foot-meta">
            {(((window.STORE_DATA || {}).STORE_TEMPLATES) || []).filter(t => !t.installed).length || 6} new
          </span>
        </button>
      </div>}

      {/* User chip — the REAL signed-in account when the bridge has it.
          "Sarah Chen · sales@chanlytics.com" was a fabricated person rendered
          as you, on every page. Credits are demo-only: there is no billing
          meter behind that number. */}
      <div className="sidebar-foot">
        <div className="user-chip" onClick={() => onNavigate("admin")}>
          <div className="avatar">{sbInitials()}</div>
          <div className="who">
            <div className="name">{sbAccountName()}</div>
            <div className="email">{sbAccountEmail()}</div>
          </div>
          {window.__DEMO_MODE && <div className="user-credits mono tabular">{sbCredits()}</div>}
        </div>
      </div>
    </aside>
  );
};

window.Sidebar = Sidebar;
window.ACTIVE_AGENTS_DEFAULT = ACTIVE_AGENTS_DEFAULT;
