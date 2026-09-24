/* global React, Icon, AskBar, DashboardA, Inbox, ClientsA, ClientProfile, Sidebar, Topbar, ShellStatusBar, LiveCallBar, CLIENTS, FailedRead */
// Chanlytics — App Shell
// The live product frame: hash routing, sidebar click-throughs, page transitions,
// global Ask Chanlytics (⌘K), and intentional landings for unbuilt surfaces.
//
// Routes:
//   #/today                → Operator's brief
//   #/inbox                → Inbox
//   #/clients              → Clients portfolio
//   #/clients/pipeline     → People › Pipeline, where deals are on (else People)
//   #/clients/<id>         → Client profile
//   #/soon/<surface>       → In-design landing (pipeline, calendar, fleet, …)

const { useState: useShellState, useEffect: useShellEffect, useCallback: useShellCallback, useRef: useShellRef } = React;

// Is this route's data actually available? The bridge installs __surfaceGate
// for flipped surfaces; unflipped ones are seeded and always ready.
const routeReady = (page, param) => !window.__surfaceGate || window.__surfaceGate(page, param);

/** Surfaces whose own route param is a prop they follow, not a new identity. Live writes the call it opens to the
 *  address (replaced), so each call being its own mount would tear the page down on every click; Conversations writes
 *  the row on its tab (`<tab>:<id>`) the same way. */
const PARAM_FOLLOWED_AS_PROP = new Set(["admin", "inbox", "broadcasts", "live", "conversations"]);
// What a route is MOUNTED under (the long note where it is used says why that is not the route). Leads follows its
// address as a prop -- the page reads `leadsRoute` on every draw and its one read is keyed by it -- so every view of
// Leads, and a lead opened over one, is the page already there. People's own views and a profile keep their whole
// route: only the leads route itself, not an id that starts with the word.
const shellMountKey = (page, param) => {
  if (PARAM_FOLLOWED_AS_PROP.has(page)) return page;
  if (page === "clients" && param && /^leads(:|$)/.test(param)) return "clients/leads";
  // The Pipeline follows its address the same way (0008): its views and a person open over one are the page already there.
  if (page === "clients" && param && /^pipeline(:|$)/.test(param)) return "clients/pipeline";
  return `${page}/${param || ""}`;
};
// A flipped surface whose fetch failed. Painting the mockup here would show
// invented customers as real, so the shell says so instead.
const routeFailed = (page, param) => !!window.__surfaceFailed && window.__surfaceFailed(page, param);
// A real workspace: the bridge is here (it publishes the registry) and the session did not declare itself a demo.
// Not a gate (the honesty gate below is the one gate); which of two real drawings a route gets before its surface lands.
const realWorkspace = () => !window.__DEMO_MODE && !!window.__surfaceState;

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
// The mockup surfaces (Agents: fleet, store, studio, tasks; Content; Pipeline;
// the shared report viewer) stay in the tree and stay hidden from
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

// ---- A route on its way ---------------------------------------------------
// Until its surface lands, the pane a page will fill stays empty and busy, and one status line says it is reading;
// the words wait a beat (components.css .route-reading), so a surface that lands fast is never said. Never a
// skeleton: the one that stood here matched no page and moved every page when it left (what was measured is in
// layout-measure.test.mjs). The route view is keyed on readiness, so the route-in fade plays on the page as it
// lands rather than on the empty pane.

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
  // Calendar, not Live. A call is live for minutes a week and holding a slot the
  // rest of the time; "when is my next opening" is asked between every client.
  // A call in progress is the shell's own bar while it is happening
  // (topbar.jsx LiveCallBar) — which is also the only place with room for it to
  // say who is on the line.
  { id: "calendar", route: "calendar", icon: "calendar", label: "Calendar" },
  { id: "people", route: "clients", icon: "users", label: "People" },
];
const PhoneTabs = ({ page, inboxNeeds, onNavigate, onMenu }) => {
  const activeOf = (t) => page === t.route;
  const badge = (t) => (t.id === "inbox" && inboxNeeds > 0 ? String(inboxNeeds) : null);
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
            {/* Only the Inbox tab has a count, and it counts people who need you: amber, as the sidebar's is. */}
            {badge(t) && <span className="phone-tab-badge tally tally-icon tally-warn">{badge(t)}</span>}
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

  // A navigation is a new entry. `{ replace: true }` is a page saying the same place more exactly -- the lead a peek
  // walked on to -- so it makes none; replaceState fires no hashchange, so the route is read here, at once.
  // The last entry this shell pushed and the address it was pushed from, so a page's own Back can return where the
  // member was rather than push a place of its own. Kept here, never in history.state: Next's router reloads the
  // whole app on a Back to an entry whose state it did not write (app-router.js onPopState), and a state-only
  // replaceState is one it never re-marks.
  const lastPush = React.useRef(null);
  const navigate = useShellCallback((to, opts) => {
    if (opts && opts.replace && window.history && window.history.replaceState) {
      window.history.replaceState(null, "", "#/" + to);
      setRoute(parseHash());
      return;
    }
    lastPush.current = { to: "#/" + to, from: window.location.hash };
    window.location.hash = "/" + to;
  }, []);
  // A person's Back: the People view (a list, a segment, Leads) this profile was opened from, by the browser's own
  // Back, so its place comes with it. It pushed plain People, and the list the member was working through was gone.
  // Reached any other way -- a link, a reload, another page's door, Back from somewhere else -- it is People itself.
  const backToPeople = useShellCallback(() => {
    const p = lastPush.current;
    if (p && p.to === window.location.hash && /^#\/clients(?:$|[/:])/.test(p.from) && window.history && window.history.back) window.history.back();
    else navigate("clients");
  }, [navigate]);
  const openAsk = useShellCallback(() => setAskOpen(true), []);
  // The phone's ✦ is Ask's face too (components/ask-face.jsx), drawn on the button's coral; the sparkle where the three
  // are not loaded.
  const PhoneFace = window.AskFace || null;

  // Expose for deep components (fleet cards, command rows) without prop-drilling
  window.appNavigate = navigate;
  window.appAsk = openAsk;

  useShellEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  // A list's own route (`segments/<id>`) is People with that list picked on a real workspace; the address says so.
  // Replaced, not pushed, so Back leaves People rather than bouncing through the old route.
  // Which list an id names is the People surface's to say, and on a cold load of the old route that surface is
  // still on its way: the redirect waits for it (surface:people when it first lands, surface:clients when a page
  // of it does) rather than running once, finding nothing, and never running again.
  useShellEffect(() => {
    if (route.page !== "segments" || !window.__listRoute) return;
    const names = ["surface:people", "surface:clients"];
    const go = () => {
      if (!window.__PEOPLE) return;
      names.forEach((n) => window.removeEventListener(n, go));
      window.location.replace("#/" + window.__listRoute(route.param));
    };
    if (window.__PEOPLE) { go(); return; }
    names.forEach((n) => window.addEventListener(n, go));
    return () => names.forEach((n) => window.removeEventListener(n, go));
  }, [route.page, route.param]);
  // A person's page opens before People's rows land (it reads its own person), and its crumb and the tab's name come
  // from their row: drawn again when the rows do, once. Asked with what this draw saw, so rows that landed between the
  // draw and this effect draw it again too, rather than waiting for an event that has already gone.
  const peopleAtDraw = !!window.__PEOPLE;
  useShellEffect(() => {
    if (route.page !== "clients" || !route.param || peopleAtDraw) return;
    const again = () => setReadyTick((n) => n + 1);
    if (window.__PEOPLE) { again(); return; }
    window.addEventListener("surface:clients", again, { once: true });
    return () => window.removeEventListener("surface:clients", again);
  }, [route.page, route.param, peopleAtDraw, setReadyTick]);

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
  // soon/<surface> was the landing for a page not built yet, and an old link, a bookmark or a bell row can still name
  // one that has since shipped. The registry decides what it opens, like every other route: a page it lists as real
  // opens, a demo page keeps its landing, and a name it does not know is not found (the wiring audit's N16:
  // #/soon/calendar said the Calendar was not in this release). The standalone mockup has no registry and keeps every
  // landing.
  const soonState = route.page === "soon" && route.param && window.__surfaceState
    ? (window.__surfaceState(route.param) || "unknown")
    : null;
  const { page, param } = soonState === "real" ? { page: route.param, param: null } : route;
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
  } else if (page === "clients" && param && /^leads(:|$)/.test(param)) {
    // People › Leads: the same page, its other scope. The address carries the view (clients/leads:s-<search>:l-<list>:c-<class>),
    // and `key` remounts the page when the scope changes, so its state starts from the view it is showing rather
    // than the other one's sort and columns.
    const search = window.__LEADS && window.__leadsRouteParse
      ? (window.__LEADS.searches || []).find((s) => s.id === (window.__leadsRouteParse(param) || {}).searchId)
      : null;
    activeNav = "clients";
    crumbs = search
      ? [{ label: "People", to: "clients" }, { label: "Leads", to: "clients/leads" }, search.name]
      : [{ label: "People", to: "clients" }, "Leads"];
    pane = true;
    content = <ClientsA key="leads" scope="leads" leadsRoute={param} onNavigate={navigate} onOpenProfile={(id) => navigate(`clients/${id}`)} />;
  } else if (page === "clients" && param && /^pipeline(:|$)/.test(param)) {
    // People › Pipeline (0008): People's rows by where their deal stands, the page's third scope. Only where deals are
    // on, by the People surface's answer (contracts dealsAreOn): anywhere else the address draws People, whose switch
    // offers no Pipeline there. The retired demo board keeps its own address, #/pipeline, which lands on People.
    // The rest of the address is the Pipeline's own (contracts pipelineRoute): the view the rail picked, and the person
    // open over it. The page follows it as a prop, so every one of them is one mount (shellMountKey).
    const dealsOn = !!(window.__PEOPLE && window.__PEOPLE.dealsOn);
    const pv = dealsOn && window.__pipeline && window.__pipeline.parse ? window.__pipeline.parse(param) : null;
    activeNav = "clients";
    crumbs = !dealsOn
      ? ["People"]
      : pv && pv.view !== "all"
        ? [{ label: "People", to: "clients" }, { label: "Pipeline", to: "clients/pipeline" }, window.__pipeline.viewLabel(pv.view)]
        : [{ label: "People", to: "clients" }, "Pipeline"];
    pane = true;
    content = <ClientsA key={dealsOn ? "pipeline" : "people"} scope={dealsOn ? "pipeline" : "people"} pipelineRoute={dealsOn ? param : null} onNavigate={navigate} onOpenProfile={(id) => navigate(`clients/${id}`)} />;
  } else if (page === "clients" && param === "new-list") {
    // People with the New list box open: a door elsewhere (a profile's "Make one on People") says where it goes in
    // the address, rather than navigating and then firing segments:new on a timer it hoped the page had loaded by.
    activeNav = "clients";
    crumbs = [{ label: "People", to: "clients" }, "New list"];
    pane = true;
    content = <ClientsA key="people" scope="people" newList onNavigate={navigate} onOpenProfile={(id) => navigate(`clients/${id}`)} />;
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
    content = <ClientsA key="people" scope="people" initialSegment={segId} initialSaved={savedId} initialState={stateId} onNavigate={navigate} onOpenProfile={(id) => navigate(`clients/${id}`)} />;
  } else if (page === "clients" && param) {
    // A real workspace reads the person itself (people-detail.ts) and never waits for People's rows: the profile
    // fetches in full and says so itself when the id is not here. The crumb names them from their row, else from the
    // copy this tab holds, and is drawn again when People lands (the effect below).
    const people = window.__PEOPLE;
    const client = people ? people.rows.find(c => c.id === param) : (window.CLIENTS || []).find(c => c.id === param);
    const held = !client && window.__peekPerson ? window.__peekPerson(param) : null;
    const real = realWorkspace();
    activeNav = "clients";
    // Its People is the profile's own Back (on a phone the only one: the crumb says ‹ People and the page draws none).
    crumbs = [{ label: "People", to: "clients", go: backToPeople }, client ? client.name : held ? held.name : "Profile"];
    pane = true;
    content = client || people || real
      ? <ClientProfile id={param} onBack={backToPeople} real={real} />
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
    content = <ClientsA key="people" scope="people" onNavigate={navigate} onOpenProfile={(id) => navigate(`clients/${id}`)} />;
  } else if (page === "segments" && (window.__PEOPLE || realWorkspace())) {
    // Lists is a view of People on a real workspace: the list's own route lands on People with that list picked
    // (the People page's rule, window.__listRoute), so Playbooks' list, an answer's jump and a kept address still
    // arrive. Drawn here as that view, and the address is replaced (the effect above) so Back leaves People.
    // On a cold load the surface is still on its way: People draws with no list picked, never the seeded page,
    // and the address is replaced the moment the surface lands.
    const P = window.__PEOPLE || { lists: [], saved: [] };
    const to = window.__listRoute ? window.__listRoute(param) : "clients";
    const kind = to.startsWith("clients/") ? to.slice(8, to.indexOf(":")) : null;
    const listId = kind ? to.slice(to.indexOf(":") + 1) : null;
    const surfaceList = kind === "seg" ? (P.lists || []).find((l) => l.id === listId) : null;
    const savedMeta = kind === "list" ? (P.saved || []).find((s) => s.id === listId) : null;
    activeNav = "clients";
    crumbs = surfaceList || savedMeta ? [{ label: "People", to: "clients" }, surfaceList ? surfaceList.label : savedMeta.name] : ["People"];
    pane = true;
    content = <ClientsA initialSegment={kind === "seg" ? listId : null} initialSaved={kind === "list" ? listId : null} onOpenProfile={(id) => navigate(`clients/${id}`)} />;
  } else if (page === "segments") {
    // The seeded page keeps the demo's segments.
    const segMeta = param ? (window.CLIENT_SEGMENTS || []).find(s => s.id === param) : null;
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
    // it, and offers nothing until the Calendar has loaded: the demo's Ask
    // detour opened Ask over the skeleton or the failure pane (N10). The
    // seeded page keeps it.
    primaryAction = window.__CALENDAR ? (window.__CALENDAR.vm.bookingLink ? (
      <a className="btn btn-primary btn-sm" href={window.__CALENDAR.vm.bookingLink} target="_blank" rel="noreferrer" data-testid="cal-booking-link">
        <Icon name="calendar" size={12} /> Booking link
      </a>
    ) : null) : window.__DEMO_MODE ? (
      <button className="btn btn-primary btn-sm" onClick={openAsk}>
        <Icon name="plus" size={12} /> Book
      </button>
    ) : null;
    // calendar/<YYYY-MM-DD> is a door to a day: the page opens it in Day view. The crumbs stay "Calendar",
    // because the page moves on from the day it opened on.
    content = <CalendarPage initialApptId={param && param.startsWith("a-") ? param : null} initialDay={param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : null} />;
  } else if (page === "live") {
    activeNav = "live";
    // live/<callId>: the call a door names, opened on Live and named in the crumbs. The route had no place
    // for an id, so a door could only open the list.
    const liveCall = param ? [...(((window.__LIVE || {}).now) || []), ...(((window.__LIVE || {}).recent) || [])].find((c) => c.callId === param) : null;
    // Live is a view of the Inbox, so the trail starts where the nav item is.
    crumbs = liveCall
      ? [{ label: "Inbox", to: "inbox" }, { label: "Live", to: "live" }, liveCall.who]
      : [{ label: "Inbox", to: "inbox" }, "Live"];
    pane = true;
    content = <LiveMonitorPage initialCallId={param || null} />;
  } else if (page === "conversations") {
    // A tab or a row's id, a chat's (its conversation's) or a call's (cv-), by the page's one rule
    // (conversations.jsx cvRoute). The shell passed cv- ids alone, so a profile linking a chat opened the first
    // conversation in the list; then it knew only the mockup's three tabs, so a real workspace's WhatsApp and Email
    // opened a conversation called "whatsapp" that nobody could find. The crumb says a tab in its chip's words.
    const cvData = window.CONVERSATIONS_DATA || {};
    const cv = window.CV_ROUTE(param);
    const cvTab = cv.channel !== "all" && (cvData.CV_CHANNELS || []).find((t) => t.id === cv.channel);
    const cvWho = cv.id && ((cvData.CONVERSATIONS || []).find(c => c.id === cv.id) || {}).who;
    activeNav = { phone: "calls", chats: "chats", mail: "email" }[cv.channel] || "conversations";
    crumbs = cvWho
      ? [{ label: "Inbox", to: "inbox" }, { label: "Conversations", to: "conversations" }, cvWho]
      : cvTab
        ? [{ label: "Inbox", to: "inbox" }, { label: "Conversations", to: "conversations" }, cvTab.label]
        : [{ label: "Inbox", to: "inbox" }, "Conversations"];
    pane = true;
    content = <ConversationsPage channel={cv.channel} initialId={cv.id} />;
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
    // outbound/<id> opens Playbooks on one playbook's card -- a source row on
    // Reports links here -- named once the playbooks hold it.
    const pbOpen = param && window.__PLAYBOOKS ? (window.__PLAYBOOKS.rows || []).find(p => p.id === param) : null;
    activeNav = "outbound";
    crumbs = param ? ["Campaigns", { label: "Playbooks", to: "outbound" }, pbOpen ? pbOpen.name : "Playbook"] : ["Campaigns", "Playbooks"];
    pane = true;
    // A real workspace's New playbook is the page's own, at the right of its one
    // line, where Broadcasts and Templates keep theirs (outbound-real.jsx): the
    // page draws only once the playbooks have loaded, so there is never a button
    // over the skeleton or the failure pane, where the demo's Ask detour opened
    // Ask (N10). The seeded page keeps its detour here.
    primaryAction = !window.__PLAYBOOKS && window.__DEMO_MODE ? (
      <button className="btn btn-primary btn-sm" onClick={openAsk}>
        <Icon name="plus" size={12} /> New campaign
      </button>
    ) : null;
    content = <OutboundPage initialPlaybook={param} />;
  } else if (page === "messages") {
    activeNav = "messages";
    crumbs = ["Campaigns", "Templates"];
    pane = true;
    content = <MessagesPage />;
  } else if (page === "content") {
    activeNav = "content";
    crumbs = ["Campaigns", "Content"];
    content = <ContentPage />;
  } else if (page === "broadcasts") {
    // broadcasts/run:<id> opens one broadcast -- a playbook's run, from its
    // card or Today -- named for it once the list holds it. Any other param is
    // the audience the composer opens on: a real workspace names it by the
    // page's own rule (a list or a kept list with this id) and its own label;
    // the demo, its seeded segment.
    const bcRunId = param && param.startsWith("run:") ? param.slice(4) : null;
    // broadcasts/get-yes lands on the "Get their yes" section: the door every
    // "nobody has said yes to offers" on People, Today and Playbooks goes through.
    const bcYes = param === "get-yes";
    const bcAudience = bcRunId || bcYes ? null : param;
    const bcRun = bcRunId && window.__BROADCASTS ? (window.__BROADCASTS.rows || []).find(r => r.id === bcRunId) : null;
    const bcSeg = bcAudience && (window.__BROADCASTS
      ? (window.__BROADCASTS.audiences || []).find(a => (a.kind === "saved" || a.kind === "list") && a.id === bcAudience)
      : (window.CLIENT_SEGMENTS || []).find(s => s.id === bcAudience));
    activeNav = "broadcasts";
    crumbs = bcRunId ? ["Campaigns", { label: "Broadcasts", to: "broadcasts" }, bcRun ? bcRun.name : "Broadcast"]
      : bcYes ? ["Campaigns", { label: "Broadcasts", to: "broadcasts" }, "Get their yes"]
      : bcSeg ? ["Campaigns", { label: "Broadcasts", to: "broadcasts" }, bcSeg.label] : ["Campaigns", "Broadcasts"];
    content = <BroadcastsPage initialSegment={bcAudience} initialRun={bcRunId} initialYes={bcYes} />;
  } else if (page === "studio") {
    activeNav = "studio";
    crumbs = ["Agents", "Studio"];
    pane = true;
    content = <AgentStudioPage />;
  } else if (page === "store") {
    activeNav = "store";
    crumbs = ["Agents", "Store"];
    content = <AgentStore />;
  } else if (page === "soon" && param && soonState === "unknown") {
    activeNav = "home";
    crumbs = ["Not found"];
    content = <NotFound raw={`soon/${param}`} onNavigate={navigate} />;
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
  // workspace lands on People; the mockup keeps a retired page only while it
  // still HAS one to keep. The Deal board's is in the tree, so a demo session
  // stays on it. The seeded Leads page was deleted when Leads became a scope of
  // People, so `#/leads` is an address that moved for everyone: this route has
  // no branch of its own any more, and without this the demo would fall through
  // to Not found for a page that is only somewhere else.
  const seededPageGone = page === "leads";
  const retiredTo = window.__surfaceRetired && (!window.__DEMO_MODE || seededPageGone)
    ? window.__surfaceRetired(page)
    : null;
  useShellEffect(() => {
    if (retiredTo) window.location.hash = "/" + retiredTo;
  }, [retiredTo]);
  // A soon/ link to a page that has shipped: the address becomes the page's own, in place, so Back does not land on
  // the old link again.
  useShellEffect(() => {
    if (soonState === "real") window.location.replace("#/" + route.param);
  }, [soonState, route.param]);

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
  const mountKey = shellMountKey(page, param);
  useShellEffect(() => {
    setNavOpen(false);
    setRouteTimedOut(false);
    if (routeReady(page, param)) return;
    // Re-render when readiness changes; the render below reads the truth.
    const off = window.__onSurfaceReady ? window.__onSurfaceReady(() => setReadyTick((n) => n + 1)) : null;
    // Never strand the operator on the reading pane forever — but time out INTO the
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
  // A move that stays on the page -- People to Leads or the Pipeline and back -- is still a remount (each scope is a
  // mount of its own), and the route fade played on every one, on top of the rows' own draw: the switch read as a
  // wait. The fade is for arriving somewhere else, and for a page landing where the reading pane stood; a view that
  // follows another of the same page draws at once. A person's profile is somewhere else, though its route starts with
  // the list's word.
  // Decided as the view changes, in the draw that mounts it, and kept for that view's life: decided after the mount
  // (an effect, a state) it re-drew the same element with the class, which cancelled the fade on every page one
  // frame in.
  const viewKey = routeLoading ? `${mountKey}/reading` : mountKey;
  const family = page === "clients" && param && !/^(leads(:|$)|pipeline(:|$)|seg:|list:|state:)/.test(param) ? "clients/person" : page;
  const viewRef = useShellRef({ key: null, family: null, reading: false, stay: false });
  if (viewRef.current.key !== viewKey) {
    const prev = viewRef.current;
    viewRef.current = { key: viewKey, family, reading: routeLoading, stay: !routeLoading && prev.key !== null && prev.family === family && !prev.reading };
  }
  const routeStay = viewRef.current.stay;

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
      {/* On a phone the sidebar is a drawer. Open, it is a dialog, so a page's keys hold still behind it (People's Esc
          cleared its selection as the drawer closed). Not aria-modal: it does not move focus into itself. */}
      <div className={`side-wrap ${navOpen ? "open" : ""} ${sidebar === "rail" ? "rail" : ""}`} role={navOpen ? "dialog" : undefined} aria-label={navOpen ? "Navigation" : undefined}>
        <Sidebar
          active={activeNav}
          badges={{ inbox: inboxNeeds > 0 ? String(inboxNeeds) : null }}
          onNavigate={(id) => { setNavOpen(false); navigate(NAV_ROUTE[id] || (id.includes("/") ? id : `soon/${id}`)); }}
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
          themePref={themePref}
          onTheme={onTheme}
          onAsk={openAsk}
          onMenu={() => setNavOpen(true)}
          right={primaryAction}
        />
        {/* A call happening right now outranks a newer build or a stale surface:
            it is the one thing on this line that stops being true by itself. */}
        <LiveCallBar />
        <ShellStatusBar />
        <SurfaceTabs page={page} param={param} onNavigate={navigate} />
        <div
          key={viewKey}
          className={`main-scroll route-view ${pane ? "pane" : ""} ${routeStay ? "route-stay" : ""}`}
          aria-busy={routeLoading ? "true" : undefined}
        >
          <ShellErrorBoundary>
            {routeLoading
              ? <div className="route-reading" role="status">Reading…</div>
              : surfaceUnavailable
                ? <SurfaceUnavailable onNavigate={navigate} />
                : content}
          </ShellErrorBoundary>
        </div>
        <PhoneTabs page={page} inboxNeeds={inboxNeeds} onNavigate={navigate} onMenu={() => setNavOpen(true)} />
        {!askOpen && !navOpen && (
          <button type="button" className="phone-ask" onClick={openAsk} aria-label="Ask Chanlytics" title="Ask Chanlytics" data-testid="phone-ask">
            {PhoneFace
              ? <PhoneFace className="phone-ask-face" tone="accent" testId="phone-ask-face" />
              : <Icon name="sparkle" size={20} />}
          </button>
        )}
      </div>

      <AskBar open={askOpen} onClose={() => setAskOpen(false)} />
      <ShortcutsSheet />
      {/* The one deal sheet (0008), opened from anywhere by window.openDealSheet: the person's card, the thread. */}
      {window.DealSheetHost ? <window.DealSheetHost /> : null}
    </div>
  );
};

window.ChanlyticsApp = ChanlyticsApp;
