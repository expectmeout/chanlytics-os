/* global React, Icon, AskBar, DashboardA, Inbox, ClientsA, ClientProfile, Sidebar, Topbar, CLIENTS */
// Chanlytics — App Shell
// The live product frame: hash routing, sidebar click-throughs, page transitions,
// global Ask Chanlytics (⌘K), and intentional landings for unbuilt surfaces.
//
// Routes:
//   #/today                → Operator's brief
//   #/inbox                → Inbox
//   #/clients              → Clients portfolio
//   #/clients/<id>         → Client profile
//   #/soon/<surface>       → In-design landing (pipeline, calendar, fleet, …)

const { useState: useShellState, useEffect: useShellEffect, useCallback: useShellCallback } = React;

// Is this route's data actually available? The bridge installs __surfaceGate
// for flipped surfaces; unflipped ones are seeded and always ready.
const routeReady = (page, param) => !window.__surfaceGate || window.__surfaceGate(page, param);
// A flipped surface whose fetch failed. Painting the mockup here would show
// invented customers as real, so the shell says so instead.
const routeFailed = (page, param) => !!window.__surfaceFailed && window.__surfaceFailed(page, param);

const SurfaceUnavailable = ({ onNavigate }) => (
  <div className="soon">
    <div className="soon-glyph"><Icon name="alert" size={22} /></div>
    <div className="soon-title">Can't reach your workspace</div>
    <div className="soon-blurb">
      This isn't a quiet day — the connection failed. Nothing here would be your real data,
      so we're not showing anything. Your messages are still being received and answered.
    </div>
    <div className="soon-actions">
      <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
        <Icon name="refresh" size={12} /> Retry
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("today")}>
        <Icon name="home" size={12} /> Back to Today
      </button>
    </div>
  </div>
);

// ---- Route helpers ----------------------------------------------------
const parseHash = () => {
  const raw = (window.location.hash || "#/today").replace(/^#\/?/, "");
  const [page, param] = raw.split("/");
  return { page: page || "today", param: param || null };
};

// Inbox thread → client profile mapping (identity is consistent across surfaces)
const THREAD_CLIENT = {
  "th-aisha-refund": "c-aisha",
  "th-wellness-partnership": "c-thewellness",
  "th-jordan-discount": "c-jordan",
  "th-maya-recovery": "c-maya",
  "th-david-complaint": "c-david-chen",
};

// Sidebar nav id → route
const NAV_ROUTE = {
  home: "today",
  people: "clients",
  campaigns: "outbound",
  agents: "fleet",
  inbox: "inbox",
  clients: "clients",
  store: "store",
  fleet: "fleet",
  studio: "studio",
  outbound: "outbound",
  content: "content",
  broadcasts: "broadcasts",
  pipeline: "pipeline",
  calendar: "calendar",
  leads: "leads",
  segments: "segments",
  reports: "reports",
  tasks: "tasks",
  admin: "admin",
  conversations: "conversations",
  live: "live",
  calls: "conversations/phone",
  chats: "conversations/chats",
  email: "conversations/mail",
};

// ---- In-design landings ------------------------------------------------
const SOON_META = {
  pipeline:   { icon: "deal",        title: "Pipeline",   blurb: "Deals kanban with agent attribution — who advanced what, and why." },
  calendar:   { icon: "calendar",    title: "Calendar",   blurb: "Appointments with prep status and no-show risk, agent-managed." },
  calls:      { icon: "phone",       title: "Calls",      blurb: "Live transcription and call review with agent summaries." },
  chats:      { icon: "chat",        title: "Chats",      blurb: "Every DM and SMS conversation, threaded by client." },
  email:      { icon: "mail",        title: "Email",      blurb: "Agent-drafted email, sequences, and review queues." },
  outbound:   { icon: "bolt",        title: "Outbound",   blurb: "Campaigns your agents run — offers, win-backs, nudges." },
  content:    { icon: "content",     title: "Content",    blurb: "Content calendar with agent-drafted posts." },
  broadcasts: { icon: "wave",        title: "Broadcasts", blurb: "One-to-many sends with per-segment targeting." },
  fleet:      { icon: "agents",      title: "Agent Fleet", blurb: "Deep management for every agent: autonomy, playbooks, performance." },
  store:      { icon: "agents",      title: "Agent Store", blurb: "Install agents with new abilities — phone, chat, recovery, review." },
  studio:     { icon: "sparkle",     title: "Agent Studio", blurb: "Compose custom agents from skills, tone, and guardrails." },
  reports:    { icon: "trending-up", title: "Reports",    blurb: "Revenue, conversion, and agent performance over time." },
  admin:      { icon: "settings",    title: "Settings",   blurb: "Team, billing, integrations, AI memory, and autonomy defaults." },
  clients:    { icon: "users",       title: "Clients",    blurb: "Every customer's history, spend, and preferences in one profile." },
  leads:      { icon: "bolt",        title: "Leads",      blurb: "New prospects captured, scored, and queued for your call." },
  segments:   { icon: "filter",      title: "Lists",      blurb: "Smart lists that keep themselves current — lapsed, VIP, new." },
  tasks:      { icon: "check",       title: "Tasks",      blurb: "The work ledger — a receipt for everything your agents did." },
  live:       { icon: "phone",       title: "Live",       blurb: "Calls on your line, as they happen." },
  shared:     { icon: "trending-up", title: "Shared reports", blurb: "Read-only report links you can hand to a client or partner." },
};

const ComingSoon = ({ surface, onNavigate }) => {
  const meta = SOON_META[surface] || { icon: "dot", title: surface, blurb: "" };
  return (
    <div className="soon">
      <div className="soon-glyph"><Icon name={meta.icon} size={22} /></div>
      <div className="soon-title">{meta.title}</div>
      <div className="soon-blurb">{meta.blurb}</div>
      <span className="soon-chip">In design — shipping next</span>
      <div className="soon-actions">
        <button className="btn btn-sm" onClick={() => onNavigate("today")}>
          <Icon name="home" size={12} /> Back to Today
        </button>
        {/* askAbout is a no-op outside demo — a button that silently does
            nothing is its own small lie, so it only renders where it works. */}
        {window.__DEMO_MODE && (
          <button className="btn btn-ghost btn-sm" onClick={() => window.askAbout({ mode: "compose", prompt: "About " + meta.title + ": " })}>
            <Icon name="sparkle" size={12} /> Ask about {meta.title}
          </button>
        )}
      </div>
    </div>
  );
};

// ---- Error & not-found states -------------------------------------------
class ShellErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="soon err">
        <div className="soon-glyph"><Icon name="alert" size={22} /></div>
        <div className="soon-title">This surface hit an error</div>
        <div className="soon-blurb">The rest of the OS is fine — this pane failed to render. {String(this.state.err && this.state.err.message || "")}</div>
        <div className="soon-actions">
          <button className="btn btn-sm" onClick={() => { window.location.hash = "/today"; }}>
            <Icon name="home" size={12} /> Back to Today
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}

const NotFound = ({ raw, onNavigate }) => (
  <div className="soon">
    <div className="soon-glyph"><Icon name="search" size={22} /></div>
    <div className="soon-title">No surface at "{raw}"</div>
    <div className="soon-blurb">That route doesn't exist in this workspace.</div>
    <div className="soon-actions">
      <button className="btn btn-sm" onClick={() => onNavigate("today")}><Icon name="home" size={12} /> Back to Today</button>
    </div>
  </div>
);

const ClientNotFound = ({ onNavigate }) => (
  <div className="soon">
    <div className="soon-glyph"><Icon name="users" size={22} /></div>
    <div className="soon-title">Client not found</div>
    <div className="soon-blurb">This profile may have been merged or removed.</div>
    <div className="soon-actions">
      <button className="btn btn-sm" onClick={() => onNavigate("clients")}>All clients <Icon name="arrow-right" size={12} /></button>
    </div>
  </div>
);

// ---- Route skeleton (perceived loading on navigation) -------------------
const RouteSkeleton = ({ pane }) => (
  <div className="skel-page" aria-hidden="true">
    <div className="skel-head">
      <div>
        <div className="skel skel-title" />
        <div className="skel skel-sub" />
      </div>
      <div className="skel skel-stats" />
    </div>
    {pane ? (
      <div className="skel-pane">
        <div className="skel-rail">
          {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="skel skel-row" />)}
        </div>
        <div className="skel-main">
          <div className="skel skel-block lg" />
          <div className="skel skel-block" />
          <div className="skel skel-block sm" />
        </div>
      </div>
    ) : (
      <div className="skel-main">
        <div className="skel skel-block lg" />
        <div className="skel-grid">
          {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="skel skel-card" />)}
        </div>
      </div>
    )}
  </div>
);

// ---- Shell -------------------------------------------------------------
// ---- Phone tab bar --------------------------------------------------------
// On a phone the drawer hid the four places an owner actually goes behind a
// menu button. A bar at the thumb instead, with the two counts that matter
// on the salon floor: what needs you, and who is on the line. Real surfaces
// only; everything else stays behind More. Rendered always, shown only
// under the phone breakpoint (mobile.css).
const PHONE_TABS = [
  { id: "home", route: "today", icon: "home", label: "Today" },
  { id: "inbox", route: "inbox", icon: "inbox", label: "Inbox" },
  { id: "people", route: "clients", icon: "users", label: "People" },
  { id: "live", route: "live", icon: "phone", label: "Live" },
];
const liveNow = () => (window.__LIVE && Array.isArray(window.__LIVE.now) ? window.__LIVE.now.filter((c) => c.live).length : 0);
const PhoneTabs = ({ page, inboxNeeds, onNavigate, onMenu }) => {
  const [live, setLive] = useShellState(liveNow);
  useShellEffect(() => {
    const on = () => setLive(liveNow());
    window.addEventListener("surface:live", on);
    return () => window.removeEventListener("surface:live", on);
  }, []);
  const activeOf = (t) => page === t.route;
  const badge = (t) => (t.id === "inbox" && inboxNeeds > 0 ? String(inboxNeeds) : t.id === "live" && live > 0 ? String(live) : null);
  return (
    <nav className="phone-tabs" aria-label="Main" data-testid="phone-tabs">
      {PHONE_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`phone-tab ${activeOf(t) ? "active" : ""}`}
          onClick={() => onNavigate(t.route)}
          aria-current={activeOf(t) ? "page" : undefined}
        >
          <span className="phone-tab-icon">
            <Icon name={t.icon} size={18} />
            {badge(t) && <span className="phone-tab-badge tabular">{badge(t)}</span>}
          </span>
          <span className="phone-tab-label">{t.label}</span>
        </button>
      ))}
      <button type="button" className="phone-tab" onClick={onMenu} aria-label="Menu">
        <span className="phone-tab-icon"><Icon name="menu" size={18} /></span>
        <span className="phone-tab-label">More</span>
      </button>
    </nav>
  );
};

const ChanlyticsApp = ({ theme, onTheme, inboxDensity, showInboxAgentRail }) => {
  const [route, setRoute] = useShellState(parseHash());
  const [askOpen, setAskOpen] = useShellState(false);
  const [inboxNeeds, setInboxNeeds] = useShellState(() => {
    let T = (window.INBOX_DATA || {}).THREADS || [];
    // On a real workspace, only real threads may count. A COLD boot runs this
    // before the inbox override applies, when THREADS is still the seed array —
    // which put an invented "6" on the sidebar an inch from Today's honest "0".
    // Cache-hydrated real threads carry t.real and still count.
    if (window.__surfaceState && window.__surfaceState("inbox") === "real" && !window.__DEMO_MODE) {
      T = T.filter((t) => t.real);
    }
    const D = (window.IX_STORE || {}).decisions || {};
    return T.filter((t) => (t.state === "needs" || (t.state === "escalated" && !t.takenOver)) && !D[t.id]).length;
  });

  // Live Inbox badge — decisions made in the Inbox update the sidebar count
  React.useEffect(() => {
    const onCounts = (e) => setInboxNeeds(e.detail?.needs ?? 0);
    window.addEventListener("inbox:counts", onCounts);
    return () => window.removeEventListener("inbox:counts", onCounts);
  }, []);
  const [navOpen, setNavOpen] = useShellState(false);
  // Only the escape hatch is state. Readiness itself is DERIVED during render
  // (below) — storing it meant a navigation committed the new page with the
  // PREVIOUS route's value, painting one full frame of mockup threads before
  // the effect could correct it.
  const [routeTimedOut, setRouteTimedOut] = useShellState(false);
  const [readyTick, setReadyTick] = useShellState(0);

  const navigate = useShellCallback((to) => { window.location.hash = "/" + to; }, []);
  const openAsk = useShellCallback(() => setAskOpen(true), []);

  // Expose for deep components (fleet cards, command rows) without prop-drilling
  window.appNavigate = navigate;
  window.appAsk = window.__DEMO_MODE ? openAsk : () => {}; // Ask stubbed outside demo (real Ask is v1.x)

  useShellEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useShellEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        if (!window.__DEMO_MODE) return; // Ask stubbed outside demo
        e.preventDefault(); setAskOpen(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Mobile drawer flows: Escape closes, body scroll locks while open,
  // and a resize past the breakpoint clears the drawer state.
  useShellEffect(() => {
    if (!navOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setNavOpen(false); };
    const onResize = () => { if (window.innerWidth > 900) setNavOpen(false); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [navOpen]);

  // Route → view config
  const { page, param } = route;
  let content, crumbs, activeNav, pane = false, primaryAction = null;

  if (page === "inbox") {
    const threadParam = param && (window.INBOX_DATA?.THREADS || []).some(t => t.id === param) ? param : null;
    const threadWho = threadParam && ((window.INBOX_DATA?.THREADS || []).find(t => t.id === threadParam) || {}).who;
    activeNav = "inbox";
    crumbs = threadWho ? [{ label: "Inbox", to: "inbox" }, threadWho] : ["Inbox"];
    pane = true;
    content = (
      <Inbox
        density={inboxDensity}
        showAgentRail={showInboxAgentRail}
        initialThreadId={threadParam}
        onOpenClient={(clientId) => navigate(clientId ? `clients/${clientId}` : "clients")}
      />
    );
  } else if (page === "clients" && param && param.startsWith("seg:")) {
    const segId = param.slice(4);
    const segMeta = (window.CLIENT_SEGMENTS || []).find(s => s.id === segId);
    activeNav = "clients";
    crumbs = ["People", { label: "Clients", to: "clients" }, segMeta ? segMeta.label : "Segment"];
    pane = true;
    content = <ClientsA initialSegment={segId} onOpenProfile={(id) => navigate(`clients/${id}`)} />;
  } else if (page === "clients" && param) {
    // A real workspace resolves the person from the People surface; the
    // profile fetches in full and says so itself when the id is not here.
    const people = window.__PEOPLE;
    const client = people ? people.rows.find(c => c.id === param) : (window.CLIENTS || []).find(c => c.id === param);
    activeNav = "clients";
    crumbs = ["People", { label: "Clients", to: "clients" }, client ? client.name : "Profile"];
    pane = true;
    content = client || people
      ? <ClientProfile id={param} onBack={() => navigate("clients")} />
      : <ClientNotFound onNavigate={navigate} />;
  } else if (page === "clients") {
    activeNav = "clients";
    crumbs = ["People", "Clients"];
    pane = true;
    // "Add client" opens the Ask overlay, which is demo theater; a real
    // workspace gains people when they write or phone.
    primaryAction = window.__DEMO_MODE ? (
      <button className="btn btn-sm" onClick={openAsk}>
        <Icon name="plus" size={12} /> Add client
      </button>
    ) : null;
    content = <ClientsA onOpenProfile={(id) => navigate(`clients/${id}`)} />;
  } else if (page === "leads") {
    const srcParam = param && param.startsWith("src:") ? param.slice(4) : null;
    const srcMeta = srcParam && (window.LEAD_SOURCES || []).find(s => s.id === srcParam);
    const leadParam = param && param.startsWith("ld-") && (window.LEADS || []).some(l => l.id === param) ? param : null;
    const leadWho = leadParam && ((window.LEADS || []).find(l => l.id === leadParam) || {}).name;
    activeNav = "leads";
    crumbs = leadWho ? ["People", { label: "Leads", to: "leads" }, leadWho]
      : srcMeta ? ["People", { label: "Leads", to: "leads" }, srcMeta.label]
      : ["People", "Leads"];
    pane = true;
    primaryAction = (
      <button className="btn btn-sm" onClick={openAsk}>
        <Icon name="plus" size={12} /> Add lead
      </button>
    );
    content = <LeadsPage initialSrc={srcMeta ? srcParam : null} initialLead={leadParam} onOpenClient={(id) => navigate(`clients/${id}`)} />;
  } else if (page === "segments") {
    const segMeta = param && (window.CLIENT_SEGMENTS || []).find(s => s.id === param);
    activeNav = "segments";
    crumbs = segMeta ? ["People", { label: "Segments", to: "segments" }, segMeta.label] : ["People", "Segments"];
    pane = true;
    primaryAction = (
      <button className="btn btn-primary btn-sm" onClick={() => window.dispatchEvent(new CustomEvent("segments:new"))}>
        <Icon name="plus" size={12} /> New segment
      </button>
    );
    content = <SegmentsPage initialId={param} />;
  } else if (page === "admin") {
    const tabMeta = (window.SET_TABS || []).find(t => t.id === param);
    activeNav = "admin";
    crumbs = tabMeta ? [{ label: "Settings", to: "admin" }, tabMeta.label] : ["Settings"];
    pane = true;
    content = <SettingsPage tab={param || "workspace"} onTab={(t) => navigate(`admin/${t}`)} />;
  } else if (page === "tasks") {
    activeNav = "tasks";
    crumbs = ["Agents", "Tasks"];
    pane = true;
    content = <TasksPage />;
  } else if (page === "reports") {
    activeNav = "reports";
    crumbs = ["Reports"];
    pane = true;
    content = <ReportsPage />;
  } else if (page === "calendar") {
    const apptWho = param && param.startsWith("a-") && (((window.CALENDAR_DATA || {}).CAL_WEEK || []).flatMap(d => d.appts).find(a => a.id === param) || {}).who;
    activeNav = "calendar";
    crumbs = apptWho ? [{ label: "Calendar", to: "calendar" }, apptWho] : ["Calendar"];
    pane = true;
    primaryAction = (
      <button className="btn btn-primary btn-sm" onClick={openAsk}>
        <Icon name="plus" size={12} /> Book
      </button>
    );
    content = <CalendarPage initialApptId={param && param.startsWith("a-") ? param : null} />;
  } else if (page === "live") {
    activeNav = "live";
    crumbs = [{ label: "Conversations", to: "conversations" }, "Live"];
    pane = true;
    content = <LiveMonitorPage />;
  } else if (page === "conversations") {
    const isCvId = param && param.startsWith("cv-");
    const chLabel = { phone: "Calls", chats: "Chats", mail: "Email" }[param];
    const cvWho = param && param.startsWith("cv-") && (((window.CONVERSATIONS_DATA || {}).CONVERSATIONS || []).find(c => c.id === param) || {}).who;
    activeNav = { phone: "calls", chats: "chats", mail: "email" }[param] || "conversations";
    crumbs = cvWho ? [{ label: "Conversations", to: "conversations" }, cvWho] : chLabel ? [{ label: "Conversations", to: "conversations" }, chLabel] : ["Conversations"];
    pane = true;
    content = (
      <ConversationsPage
        channel={["phone", "chats", "mail"].includes(param) ? param : "all"}
        initialId={isCvId ? param : null}
      />
    );
  } else if (page === "pipeline") {
    activeNav = "pipeline";
    crumbs = ["People", "Deal board"];
    pane = true;
    primaryAction = (
      <button className="btn btn-primary btn-sm" onClick={openAsk}>
        <Icon name="plus" size={12} /> New deal
      </button>
    );
    content = <PipelinePage />;
  } else if (page === "fleet") {
    const fleetAgent = (window.FLEET_DATA?.FLEET_ROSTER || []).find(a => a.id === param);
    activeNav = "fleet";
    crumbs = fleetAgent ? ["Agents", { label: "Fleet", to: "fleet" }, fleetAgent.name] : ["Agents", "Fleet"];
    pane = true;
    primaryAction = (
      <button className="btn btn-sm" onClick={() => navigate("store")}>
        <Icon name="plus" size={12} /> Hire from store
      </button>
    );
    content = <AgentFleetPage id={param} onSelect={(id) => navigate(`fleet/${id}`)} />;
  } else if (page === "outbound") {
    activeNav = "outbound";
    crumbs = ["Campaigns", "Outbound"];
    pane = true;
    primaryAction = (
      <button className="btn btn-primary btn-sm" onClick={openAsk}>
        <Icon name="plus" size={12} /> New campaign
      </button>
    );
    content = <OutboundPage />;
  } else if (page === "content") {
    activeNav = "content";
    crumbs = ["Campaigns", "Content"];
    content = <ContentPage />;
  } else if (page === "broadcasts") {
    const bcSeg = param && (window.CLIENT_SEGMENTS || []).find(s => s.id === param);
    activeNav = "broadcasts";
    crumbs = bcSeg ? ["Campaigns", { label: "Broadcasts", to: "broadcasts" }, bcSeg.label] : ["Campaigns", "Broadcasts"];
    content = <BroadcastsPage initialSegment={param} />;
  } else if (page === "studio") {
    activeNav = "studio";
    crumbs = ["Agents", "Studio"];
    pane = true;
    content = <AgentStudioPage />;
  } else if (page === "store") {
    activeNav = "store";
    crumbs = ["Agents", "Store"];
    content = <AgentStore />;
  } else if (page === "soon" && param) {
    activeNav = param;
    crumbs = [SOON_META[param]?.title || param];
    content = <ComingSoon surface={param} onNavigate={navigate} />;
  } else if (page === "today") {
    activeNav = "home";
    crumbs = ["Today"];
    primaryAction = (
      <button className="btn btn-primary btn-sm" onClick={() => window.askAbout({ mode: "compose", prompt: "New task: " })}>
        <Icon name="plus" size={12} /> New task
      </button>
    );
    content = <DashboardA onAsk={openAsk} />;
  } else {
    activeNav = "home";
    crumbs = ["Not found"];
    content = <NotFound raw={page} onNavigate={navigate} />;
  }

  // ---- The honesty gate: one interception, every route -----------------
  // The bridge classifies each surface real-vs-demo (surface-registry.ts) and
  // publishes it as window.__surfaceState. A "demo" surface renders only in a
  // session that declared itself one; in production it shows the same
  // ComingSoon pane Settings pioneered, instead of a finished-looking screen
  // fed by invented customers, invented revenue, and success toasts for sends
  // that never happened. Gating routes one by one is how fifteen of them were
  // missed — the classification IS the gate now. Standalone mockup (no
  // bridge): __surfaceState is absent and everything renders, which is right,
  // because the whole artifact is a demo there.
  const demoGated = !window.__DEMO_MODE
    && window.__surfaceState && window.__surfaceState(page, param) === "demo";
  if (demoGated) {
    const soonTitle = SOON_META[page]?.title || page;
    // Reset everything the branch above computed from seed data — a crumb
    // carrying an invented client's name over an honest pane is still a lie.
    crumbs = [soonTitle];
    pane = false;
    primaryAction = null;
    content = <ComingSoon surface={page} onNavigate={navigate} />;
  }

  const routeKey = `${page}/${param || ""}`;
  useShellEffect(() => {
    setNavOpen(false);
    setRouteTimedOut(false);
    if (routeReady(page, param)) return;
    // Re-render when readiness changes; the render below reads the truth.
    const off = window.__onSurfaceReady ? window.__onSurfaceReady(() => setReadyTick((n) => n + 1)) : null;
    // Never strand the operator on a skeleton forever — but time out INTO the
    // unavailable pane, never into the mockup's seeds.
    const t = setTimeout(() => setRouteTimedOut(true), 8000);
    return () => { if (off) off(); clearTimeout(t); };
  }, [routeKey]);

  // Derived every render, so a navigation can never commit the previous
  // route's answer. readyTick is read so the subscription re-evaluates it.
  void readyTick;
  const surfaceReady = routeReady(page, param);
  const surfaceUnavailable = !surfaceReady && (routeFailed(page, param) || routeTimedOut);
  const routeLoading = !surfaceReady && !surfaceUnavailable;

  // Shared read-only viewer — chrome-less, rendered AFTER all hooks so the
  // hook order stays identical on every route (no early return between hooks).
  // Demo-gated like everything else: outside a demo, this URL renders the
  // normal chrome with the ComingSoon pane the interception above chose,
  // instead of "Serenity Spa — Reports · expires in 7 days" over invented
  // numbers, ungated, in production.
  if (page === "shared" && !demoGated) {
    return (
      <div className="shared-root" data-theme={theme}>
        <div className="shared-banner">
          <span className="sidebar-brand-mark">C</span>
          <span className="shared-banner-title">Serenity Spa — Reports</span>
          <span className="pill">Read-only</span>
          <span className="shared-banner-meta">Shared link · expires in 7 days</span>
          <span className="cal-sync-spacer" />
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("reports")}>Exit preview</button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate("today")}>
            <Icon name="sparkle" size={12} /> Get Chanlytics
          </button>
        </div>
        <div className="shared-body">
          <ReportsPage />
        </div>
      </div>
    );
  }

  return (
    <div className="app-root" data-theme={theme}>
      <div className={`side-wrap ${navOpen ? "open" : ""}`}>
        <Sidebar
          active={activeNav}
          badges={{ inbox: inboxNeeds > 0 ? String(inboxNeeds) : null }}
          onNavigate={(id) => navigate(NAV_ROUTE[id] || (id.includes("/") ? id : `soon/${id}`))}
          onNewChat={() => { setNavOpen(false); window.dispatchEvent(new CustomEvent("ask:new")); openAsk(); }}
          onClose={() => setNavOpen(false)}
        />
      </div>
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <div className="main">
        <Topbar
          crumbs={crumbs}
          theme={theme}
          onTheme={onTheme}
          onAsk={openAsk}
          onMenu={() => setNavOpen(true)}
          right={primaryAction}
        />
        <SurfaceTabs page={page} param={param} onNavigate={navigate} />
        <div key={routeKey} className={`main-scroll route-view ${pane ? "pane" : ""}`}>
          <ShellErrorBoundary>
            {routeLoading
              ? <RouteSkeleton pane={pane} />
              : surfaceUnavailable
                ? <SurfaceUnavailable onNavigate={navigate} />
                : content}
          </ShellErrorBoundary>
        </div>
        <PhoneTabs page={page} inboxNeeds={inboxNeeds} onNavigate={navigate} onMenu={() => setNavOpen(true)} />
      </div>

      <AskBar open={askOpen} onClose={() => setAskOpen(false)} />
    </div>
  );
};

window.ChanlyticsApp = ChanlyticsApp;
