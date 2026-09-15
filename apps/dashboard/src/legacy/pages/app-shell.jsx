/* global React, Icon, AskBar, DashboardA, Inbox, ClientsA, ClientProfile, Sidebar, Topbar, ShellStatusBar, CLIENTS, FailedRead */
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

/** Surfaces whose own route param is a prop they follow, not a new identity. */
const PARAM_FOLLOWED_AS_PROP = new Set(["admin", "inbox"]);
// A flipped surface whose fetch failed. Painting the mockup here would show
// invented customers as real, so the shell says so instead.
const routeFailed = (page, param) => !!window.__surfaceFailed && window.__surfaceFailed(page, param);

const SurfaceUnavailable = ({ onNavigate }) => (
  <FailedRead
    kind="page"
    title="Can't reach your workspace"
    body="This isn't a quiet day — the connection failed. Nothing here would be your real data, so we're not showing anything. Your messages are still being received and answered."
    onRetry={() => window.location.reload()}
    also={{ label: "Back to Today", onClick: () => onNavigate("today") }}
    testid="surface-unavailable"
  />
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
  messages: "messages",
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

// ---- The mockup's landings ---------------------------------------------
// The mockup surfaces (Agents: fleet, store, studio, tasks; Content; Pipeline
// and Leads; the shared report viewer) stay in the tree and stay hidden from
// every real workspace: no nav entry, no tab, the Not-in-this-release card for
// a hand-typed address. Ruben's decision, 11 September 2026: most of it is
// revisited when the product is at 100%, and none of those features is built
// before then. Nothing here is a promise to a customer or an operator.
const SOON_META = {
  pipeline:   { icon: "deal",        title: "Pipeline",   blurb: "Deals kanban with agent attribution — who advanced what, and why." },
  calendar:   { icon: "calendar",    title: "Calendar",   blurb: "Your calendar as the receptionist reads it — taken, open, closed." },
  calls:      { icon: "phone",       title: "Calls",      blurb: "Live transcription and call review with agent summaries." },
  chats:      { icon: "chat",        title: "Chats",      blurb: "Every DM and SMS conversation, threaded by client." },
  email:      { icon: "mail",        title: "Email",      blurb: "Agent-drafted email, sequences, and review queues." },
  outbound:   { icon: "bolt",        title: "Playbooks",  blurb: "Standing rules your receptionist runs — win-back, welcome, save our number, the month's offer." },
  content:    { icon: "content",     title: "Content",    blurb: "Content calendar with agent-drafted posts." },
  broadcasts: { icon: "wave",        title: "Broadcasts", blurb: "One-to-many sends with per-segment targeting." },
  fleet:      { icon: "agents",      title: "Agent Fleet", blurb: "Deep management for every agent: autonomy, playbooks, performance." },
  store:      { icon: "agents",      title: "Agent Store", blurb: "Install agents with new abilities — phone, chat, recovery, review." },
  studio:     { icon: "sparkle",     title: "Agent Studio", blurb: "Compose custom agents from skills, tone, and guardrails." },
  reports:    { icon: "trending-up", title: "Reports",    blurb: "Revenue, conversion, and agent performance over time." },
  admin:      { icon: "settings",    title: "Settings",   blurb: "Team, billing, integrations, AI memory, and autonomy defaults." },
  clients:    { icon: "users",       title: "People",    blurb: "Every customer's history, spend, and preferences in one profile." },
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
      <span className="soon-chip">Not in this release</span>
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
const RouteSkeleton = ({ pane, surface }) => (
  // data-surface, so the skeleton's rail can be the width the surface's rail
  // will be. Without it Settings loaded behind a 340px rail and settled into a
  // 220px one.
  <div className={`skel-page ${pane ? "pane" : ""}`} data-surface={surface} aria-hidden="true">
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

const ChanlyticsApp = ({ theme, themePref = theme, onTheme, sidebar = "open", onSidebar = () => {}, inboxDensity, showInboxAgentRail }) => {
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
    // A real thread carries the answer (the view model's needsYou), the rule the
    // Inbox counts by: a thread a teammate or you have is not waiting on you.
    return T.filter((t) => (t.real ? t.needsYou : t.state === "needs" || (t.state === "escalated" && !t.takenOver)) && !D[t.id]).length;
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
  window.appAsk = openAsk;

  useShellEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useShellEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault(); setAskOpen(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ⌘B folds the sidebar to a rail on a desk (the phone has a drawer);
  // ⌘1–9 switch workspaces when there is more than one. Neither fires
  // while typing in a field.
  useShellEffect(() => {
    const handler = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (window.__chrome && window.__chrome.typing(e.target)) return;
      if (e.key === "b") {
        if (window.innerWidth > 900) { e.preventDefault(); onSidebar(sidebar === "rail" ? "open" : "rail"); }
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 9) {
        const all = window.__WORKSPACES || [];
        if (all.length > 1 && all[n - 1] && window.__shell) { e.preventDefault(); window.__shell.switchWorkspace(all[n - 1].id); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sidebar, onSidebar]);

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
    // The id is passed on even when that thread is not loaded: the Inbox says
    // it is missing, rather than opening the first thread in its place.
    const routed = window.ixRouteThread ? window.ixRouteThread(param, window.INBOX_DATA?.THREADS) : { id: param || null, who: null };
    const threadParam = routed.id;
    const threadWho = routed.who;
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
  } else if (page === "clients" && param && /^(seg|list|state):/.test(param)) {
    // One view of People, linkable: a smart list (seg:), a list kept by hand
    // (list:) or a state (state:) — what the assistant and Today point at.
    const kind = param.slice(0, param.indexOf(":"));
    const segId = kind === "seg" ? param.slice(4) : null;
    const savedId = kind === "list" ? param.slice(5) : null;
    const stateId = kind === "state" ? param.slice(6) : null;
    // A real workspace's lists by their own names; the demo's segments only in the demo.
    const segMeta = segId && !window.__PEOPLE && (window.CLIENT_SEGMENTS || []).find(s => s.id === segId);
    const surfaceList = segId && window.__PEOPLE && (window.__PEOPLE.lists || []).find(l => l.id === segId);
    const savedMeta = savedId && window.__PEOPLE && (window.__PEOPLE.saved || []).find(l => l.id === savedId);
    activeNav = "clients";
    crumbs = [{ label: "People", to: "clients" }, surfaceList ? surfaceList.label : segMeta ? segMeta.label : savedMeta ? savedMeta.name : stateId ? stateId.replace(/_/g, " ") : window.__PEOPLE ? "List" : "Segment"];
    pane = true;
    content = <ClientsA initialSegment={segId} initialSaved={savedId} initialState={stateId} onOpenProfile={(id) => navigate(`clients/${id}`)} />;
  } else if (page === "clients" && param) {
    // A real workspace resolves the person from the People surface; the
    // profile fetches in full and says so itself when the id is not here.
    const people = window.__PEOPLE;
    const client = people ? people.rows.find(c => c.id === param) : (window.CLIENTS || []).find(c => c.id === param);
    activeNav = "clients";
    crumbs = [{ label: "People", to: "clients" }, client ? client.name : "Profile"];
    pane = true;
    content = client || people
      ? <ClientProfile id={param} onBack={() => navigate("clients")} />
      : <ClientNotFound onNavigate={navigate} />;
  } else if (page === "clients") {
    activeNav = "clients";
    crumbs = ["People"];
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
    // A real workspace's list by its own name; the seeded page keeps its segments.
    const real = !!window.__PEOPLE;
    const savedMeta = real && param ? ((window.__PEOPLE.saved || []).find((s) => s.id === param) || (window.__PEOPLE.lists || []).find((l) => l.id === param)) : null;
    const segMeta = !real && param ? (window.CLIENT_SEGMENTS || []).find(s => s.id === param) : null;
    const name = savedMeta ? (savedMeta.name || savedMeta.label) : segMeta ? segMeta.label : null;
    activeNav = "segments";
    crumbs = name ? ["People", { label: real ? "Lists" : "Segments", to: "segments" }, name] : ["People", real ? "Lists" : "Segments"];
    pane = true;
    primaryAction = (
      <button className="btn btn-primary btn-sm" onClick={() => window.dispatchEvent(new CustomEvent("segments:new"))}>
        <Icon name="plus" size={12} /> {real ? "New list" : "New segment"}
      </button>
    );
    content = <SegmentsPage initialId={param} />;
  } else if (page === "admin") {
    // The crumb names the pane Settings opens, by the rule Settings itself
    // uses (SET_TAB), so the two cannot say different things about one route:
    // the bare route opens Business, a retired route answers under its own
    // name, and the back office is found only for the people it exists for --
    // anyone else lands on Profile, and so does the crumb.
    const tabMeta = window.SET_TAB ? window.SET_TAB(param || "workspace") : null;
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
    // The demo names its seeded appointment; a real calendar is never named from the seeds.
    const apptWho = !window.__CALENDAR && param && param.startsWith("a-") && (((window.CALENDAR_DATA || {}).CAL_WEEK || []).flatMap(d => d.appts).find(a => a.id === param) || {}).who;
    activeNav = "calendar";
    crumbs = apptWho ? [{ label: "Calendar", to: "calendar" }, apptWho] : ["Calendar"];
    pane = true;
    // A real workspace books through its own link, whichever tool is behind
    // it; the seeded page keeps the demo's Ask detour.
    primaryAction = window.__CALENDAR ? (window.__CALENDAR.vm.bookingLink ? (
      <a className="btn btn-primary btn-sm" href={window.__CALENDAR.vm.bookingLink} target="_blank" rel="noreferrer" data-testid="cal-booking-link">
        <Icon name="calendar" size={12} /> Booking link
      </a>
    ) : null) : (
      <button className="btn btn-primary btn-sm" onClick={openAsk}>
        <Icon name="plus" size={12} /> Book
      </button>
    );
    // calendar/<YYYY-MM-DD> is a door to a day: the page opens it in Day view. The crumbs stay "Calendar",
    // because the page moves on from the day it opened on.
    content = <CalendarPage initialApptId={param && param.startsWith("a-") ? param : null} initialDay={param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : null} />;
  } else if (page === "live") {
    activeNav = "live";
    // live/<callId>: the call a door names, opened on Live and named in the crumbs. The route had no place
    // for an id, so a door could only open the list.
    const liveCall = param ? [...(((window.__LIVE || {}).now) || []), ...(((window.__LIVE || {}).recent) || [])].find((c) => c.callId === param) : null;
    crumbs = liveCall
      ? [{ label: "Conversations", to: "conversations" }, { label: "Live", to: "live" }, liveCall.who]
      : [{ label: "Conversations", to: "conversations" }, "Live"];
    pane = true;
    content = <LiveMonitorPage initialCallId={param || null} />;
  } else if (page === "conversations") {
    // Only the three channels are filters; anything else is a row's id, a chat's (its conversation's)
    // or a call's (cv-). The shell passed cv- ids alone, so a profile linking a chat opened the first
    // conversation in the list.
    const chLabel = { phone: "Calls", chats: "Chats", mail: "Email" }[param];
    const isCvId = !!param && !chLabel;
    const cvWho = isCvId && (((window.CONVERSATIONS_DATA || {}).CONVERSATIONS || []).find(c => c.id === param) || {}).who;
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
    crumbs = ["Campaigns", "Playbooks"];
    pane = true;
    // A real workspace's button opens the composer on the page; the seeded
    // page keeps the demo's Ask detour.
    primaryAction = window.__PLAYBOOKS ? (
      <button className="btn btn-primary btn-sm" onClick={() => window.dispatchEvent(new CustomEvent("playbooks:new"))} data-testid="pb-new" {...window.gate("approve", "start a playbook")}>
        <Icon name="plus" size={12} /> New playbook
      </button>
    ) : (
      <button className="btn btn-primary btn-sm" onClick={openAsk}>
        <Icon name="plus" size={12} /> New campaign
      </button>
    );
    content = <OutboundPage />;
  } else if (page === "messages") {
    activeNav = "messages";
    crumbs = ["Campaigns", "Messages"];
    pane = true;
    content = <MessagesPage />;
  } else if (page === "content") {
    activeNav = "content";
    crumbs = ["Campaigns", "Content"];
    content = <ContentPage />;
  } else if (page === "broadcasts") {
    // A real workspace names the audience the page opens on, by the page's own
    // rule (a list or a kept list with this id) and its own label; the demo,
    // its seeded segment.
    const bcSeg = param && (window.__BROADCASTS
      ? (window.__BROADCASTS.audiences || []).find(a => (a.kind === "saved" || a.kind === "list") && a.id === param)
      : (window.CLIENT_SEGMENTS || []).find(s => s.id === param));
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
    // "New task" opens the Ask overlay, which is a no-op outside a demo: a
    // primary button that did nothing sat in the real chrome. Demo only.
    primaryAction = window.__DEMO_MODE ? (
      <button className="btn btn-primary btn-sm" onClick={() => window.askAbout({ mode: "compose", prompt: "New task: " })}>
        <Icon name="plus" size={12} /> New task
      </button>
    ) : null;
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

  // Retired surfaces: People took over Leads and the Deal board. A real
  // workspace lands on People; the standalone mockup keeps its pages.
  const retiredTo = !window.__DEMO_MODE && window.__surfaceRetired ? window.__surfaceRetired(page) : null;
  useShellEffect(() => {
    if (retiredTo) window.location.hash = "/" + retiredTo;
  }, [retiredTo]);

  // The tab says where this is, most particular first, and counts what needs
  // you (contracts chrome.ts pageTitle): named from the crumbs the top bar
  // draws, after the honesty gate has had its say, so the two cannot differ.
  const tabTitle = window.__chrome && window.__chrome.title ? window.__chrome.title(crumbs, inboxNeeds) : null;
  // Kept, not only written: the layout's own title can land after this, and a page loaded cold went
  // back to "Chanlytics OS" until something it counted changed (shell.ts keepTitle).
  useShellEffect(() => {
    if (!tabTitle) return undefined;
    if (window.__shell && window.__shell.keepTitle) return window.__shell.keepTitle(tabTitle);
    document.title = tabTitle;
    return undefined;
  }, [tabTitle]);

  // The gate is asked per PANE, so this key must carry the param.
  const routeKey = `${page}/${param || ""}`;
  // What the surface is MOUNTED under, which is a different question.
  //
  // Both used to be routeKey, so changing a surface's own param tore the whole
  // surface down and built it again: a second Settings tab, a second Inbox
  // thread. The visible cost is two 240ms route-in fades compounding -- the
  // shell's on .route-view and the pane's own -- which reads as a flash; the
  // invisible cost is the surface's state, its scroll position and its fetches,
  // thrown away on a navigation that never left the surface.
  //
  // A surface joins this list only once it FOLLOWS its param as a prop.
  // Settings derives its active tab on every render; the Inbox has an effect on
  // initialThreadId headed "Deep-link follows later navigations too" -- written
  // for exactly this and defeated by the key. A surface that seeds state from
  // the param and never looks again would show the wrong entity, so the default
  // stays remount and this is opt-in: forgetting a surface costs the
  // improvement, never correctness.
  const mountKey = PARAM_FOLLOWED_AS_PROP.has(page) ? page : routeKey;
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
      <div className={`side-wrap ${navOpen ? "open" : ""} ${sidebar === "rail" ? "rail" : ""}`}>
        <Sidebar
          active={activeNav}
          badges={{ inbox: inboxNeeds > 0 ? String(inboxNeeds) : null }}
          onNavigate={(id) => { setNavOpen(false); navigate(NAV_ROUTE[id] || (id.includes("/") ? id : `soon/${id}`)); }}
          onNewChat={() => { setNavOpen(false); window.dispatchEvent(new CustomEvent("ask:new")); openAsk(); }}
          onClose={() => setNavOpen(false)}
          collapsed={sidebar === "rail"}
          onToggleCollapse={() => onSidebar(sidebar === "rail" ? "open" : "rail")}
          themePref={themePref}
          onTheme={onTheme}
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
        <ShellStatusBar />
        <SurfaceTabs page={page} param={param} onNavigate={navigate} />
        <div key={mountKey} className={`main-scroll route-view ${pane ? "pane" : ""}`}>
          <ShellErrorBoundary>
            {routeLoading
              ? <RouteSkeleton pane={pane} surface={page} />
              : surfaceUnavailable
                ? <SurfaceUnavailable onNavigate={navigate} />
                : content}
          </ShellErrorBoundary>
        </div>
        <PhoneTabs page={page} inboxNeeds={inboxNeeds} onNavigate={navigate} onMenu={() => setNavOpen(true)} />
        {!askOpen && !navOpen && (
          <button type="button" className="phone-ask" onClick={openAsk} aria-label="Ask Chanlytics" title="Ask Chanlytics" data-testid="phone-ask">
            <Icon name="sparkle" size={20} />
          </button>
        )}
      </div>

      <AskBar open={askOpen} onClose={() => setAskOpen(false)} />
      <ShortcutsSheet />
    </div>
  );
};

window.ChanlyticsApp = ChanlyticsApp;
