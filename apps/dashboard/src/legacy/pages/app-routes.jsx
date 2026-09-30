/* global React, Icon, SettingsPage, LiveMonitorPage, OutboundPage, MessagesPage, BroadcastsPage */
// Chanlytics — The route table
// One row per route the shell draws (SHELL_ROUTES, at the foot), in the order the shell's router matched them, each
// naming what it draws (its page component and props), which addresses of its page it takes (`when`: the param's
// shape, or a fact about the workspace), what its view is mounted under (`mount`) and what it reads to name its crumbs
// and its primary act; the landings a
// route can end at (ComingSoon, NotFound); and the honesty gate's one interception (routeGated),
// applied to every row's answer by drawRoute. app-shell.jsx's ChanlyticsApp reads the table through drawRoute and
// draws the chrome around the answer; the hooks (the gate's clocks, the navigation, the listeners) stay there.
//
// No hooks here: a row is a function of the address and of what the window holds at the draw, called during the
// shell's own render, so a row's elements are created exactly where the router's branches created them.

// A real workspace: the bridge is here (it publishes the registry) and the session did not declare itself a demo.
// Not a gate (the honesty gate is the one gate); which of two real drawings a route gets before its surface lands.
const realWorkspace = () => !window.__DEMO_MODE && !!window.__surfaceState;

// A page of the mockup's own (legacy/demo/: Agents, Content, the Deal board, the seeded Lists), drawn by its name on
// the window. Those files load only in a session that declared itself a demo (manifest-demo.ts), so on a real
// workspace the name was never published: the row draws nothing, where a bare name would throw, and the honesty gate
// draws the route's landing in its place (routeGated) whatever the row answered.
const demoPage = (name, props) => {
  const Page = window[name];
  return Page ? <Page {...props} /> : null;
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
        {/* Outside a demo askAbout opens the Line, which answers about this
            workspace, and a page this release does not have is nothing to ask
            it about: the button is the demo's, where the seed palette answers. */}
        {window.__DEMO_MODE && (
          <button className="btn btn-ghost btn-sm" onClick={() => window.askAbout({ mode: "compose", prompt: "About " + meta.title + ": " })}>
            <Icon name="sparkle" size={12} /> Ask about {meta.title}
          </button>
        )}
      </div>
    </div>
  );
};

// ---- Not-found states -----------------------------------------------------
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

// ---- The rows ---------------------------------------------------------------
// Each takes the route as the shell resolved it (app-shell.jsx routeAt: `page` and `param` as drawn, `retiredTo`,
// `soonState`) with the shell's doors (`navigate`, `openAsk`, `backToPeople`), and
// answers what the route draws: `activeNav` (the sidebar item it lights), `crumbs`, `pane` (a surface with its own
// panes, full-bleed), `primaryAction` (the top bar's act, or null) and `content`.

// ---- People's rows: the view they draw in, their crumb, and a row's press ---------------------------------------
// Every People route lights People in the nav and draws a surface with its own panes (inPeople), names People as its
// first crumb (PEOPLE_CRUMB, a person's with the page's own Back), and hands the page the door a row's press opens
// the person by (personDoor).
const inPeople = (drawn) => ({ activeNav: "clients", pane: true, ...drawn });
const PEOPLE_CRUMB = { label: "People", to: "clients" };
const personDoor = (navigate) => ({ onOpenProfile: (id) => navigate(`clients/${id}`) });

// People's list, its views and the New list door left the shell for an App Router page (surfaces/people, routes.ts): it
// draws what drawPeople, drawPeopleView and drawNewList drew, and the frame's chrome comes from the surface's own
// `chrome`. What is left here are the addresses of People that are not its list: Leads and the Pipeline, until each
// leaves the shell, and a person.
const drawLeads = ({ param, navigate }) => {
  // People › Leads: the same page, its other scope. The address carries the view (clients/leads:s-<search>:l-<list>:c-<class>),
  // and `key` remounts the page when the scope changes, so its state starts from the view it is showing rather
  // than the other one's sort and columns.
  const search = window.__LEADS && window.__leadsRouteParse
    ? (window.__LEADS.searches || []).find((s) => s.id === (window.__leadsRouteParse(param) || {}).searchId)
    : null;
  const Leads = window.LeadsReal;
  return inPeople({
    crumbs: search ? [PEOPLE_CRUMB, { label: "Leads", to: "clients/leads" }, search.name] : [PEOPLE_CRUMB, "Leads"],
    content: window.__LEADS && Leads ? <Leads key="leads" scope="leads" leadsRoute={param} onNavigate={navigate} {...personDoor(navigate)} /> : null,
  });
};

// Lists on a real workspace is a view of People: `segments/<id>` is an App Router page that replaces itself with the
// list picked on People (surfaces/people/lists-route.tsx). What is left here is the mockup's own seeded page, for a demo.
const drawSegments = ({ param }) => {
  // The seeded page keeps the demo's segments.
  const segMeta = param ? (window.CLIENT_SEGMENTS || []).find(s => s.id === param) : null;
  return {
    activeNav: "segments",
    crumbs: segMeta ? ["People", { label: "Segments", to: "segments" }, segMeta.label] : ["People", "Segments"],
    pane: true,
    primaryAction: (
      <button className="btn btn-primary btn-sm" onClick={() => window.dispatchEvent(new CustomEvent("segments:new"))}>
        <Icon name="plus" size={12} /> New segment
      </button>
    ),
    content: demoPage("SegmentsPage", { initialId: param }),
  };
};

const drawStart = () => ({
  // The first run (first-run.jsx): drawn full screen by the shell, after every hook; the crumb names the tab.
  crumbs: window.__firstRun ? [window.__firstRun.words.title] : [],
  content: null,
});

const drawSettings = ({ param, retiredTo, navigate }) => {
  // The crumb names the pane Settings opens, by the rule Settings itself
  // uses (SET_TAB), so the two cannot say different things about one route:
  // the bare route opens Business, a retired route answers under its own
  // name, and the back office is found only for the people it exists for --
  // anyone else lands on Profile, and so does the crumb.
  const tabMeta = window.SET_TAB ? window.SET_TAB(param || "workspace") : null;
  return {
    activeNav: "admin",
    crumbs: tabMeta ? [{ label: "Settings", to: "admin" }, tabMeta.label] : ["Settings"],
    pane: true,
    // A pane that moved (surface-registry ROUTES_MOVED) draws nothing for the frame before the redirect.
    content: retiredTo ? null : <SettingsPage tab={param || "workspace"} onTab={(t) => navigate(`admin/${t}`)} />,
  };
};

const drawTasks = () => ({
  activeNav: "tasks",
  crumbs: ["Agents", "Tasks"],
  pane: true,
  content: demoPage("TasksPage"),
});

const drawLive = ({ param }) => {
  // live/<callId>: the call a door names, opened on Live and named in the crumbs. The route had no place
  // for an id, so a door could only open the list.
  const liveCall = param ? [...(((window.__LIVE || {}).now) || []), ...(((window.__LIVE || {}).recent) || [])].find((c) => c.callId === param) : null;
  return {
    activeNav: "live",
    // Live is a view of the Inbox, so the trail starts where the nav item is.
    crumbs: liveCall
      ? [{ label: "Inbox", to: "inbox" }, { label: "Live", to: "live" }, liveCall.who]
      : [{ label: "Inbox", to: "inbox" }, "Live"],
    pane: true,
    content: <LiveMonitorPage initialCallId={param || null} />,
  };
};

const drawDealBoard = ({ openAsk }) => ({
  activeNav: "pipeline",
  crumbs: ["People", "Deal board"],
  pane: true,
  primaryAction: (
    <button className="btn btn-primary btn-sm" onClick={openAsk}>
      <Icon name="plus" size={12} /> New deal
    </button>
  ),
  content: demoPage("PipelinePage"),
});

const drawFleet = ({ param, navigate }) => {
  const fleetAgent = (window.FLEET_DATA?.FLEET_ROSTER || []).find(a => a.id === param);
  return {
    activeNav: "fleet",
    crumbs: fleetAgent ? ["Agents", { label: "Fleet", to: "fleet" }, fleetAgent.name] : ["Agents", "Fleet"],
    pane: true,
    primaryAction: (
      <button className="btn btn-sm" onClick={() => navigate("store")}>
        <Icon name="plus" size={12} /> Hire from store
      </button>
    ),
    content: demoPage("AgentFleetPage", { id: param, onSelect: (id) => navigate(`fleet/${id}`) }),
  };
};

const drawPlaybooks = ({ param, openAsk }) => {
  // outbound/<id> opens Playbooks on one playbook's card -- a source row on
  // Reports links here -- named once the playbooks hold it.
  const pbOpen = param && window.__PLAYBOOKS ? (window.__PLAYBOOKS.rows || []).find(p => p.id === param) : null;
  return {
    activeNav: "outbound",
    crumbs: param ? ["Campaigns", { label: "Playbooks", to: "outbound" }, pbOpen ? pbOpen.name : "Playbook"] : ["Campaigns", "Playbooks"],
    pane: true,
    // A real workspace's New playbook is the page's own, at the right of its one
    // line, where Broadcasts and Templates keep theirs (outbound-real.jsx): the
    // page draws only once the playbooks have loaded, so there is never a button
    // over the skeleton or the failure pane, where the demo's Ask detour opened
    // Ask (N10). The seeded page keeps its detour here.
    primaryAction: !window.__PLAYBOOKS && window.__DEMO_MODE ? (
      <button className="btn btn-primary btn-sm" onClick={openAsk}>
        <Icon name="plus" size={12} /> New campaign
      </button>
    ) : null,
    content: <OutboundPage initialPlaybook={param} />,
  };
};

const drawTemplates = () => ({
  activeNav: "messages",
  crumbs: ["Campaigns", "Templates"],
  pane: true,
  content: <MessagesPage />,
});

const drawContent = () => ({
  activeNav: "content",
  crumbs: ["Campaigns", "Content"],
  content: demoPage("ContentPage"),
});

const drawBroadcasts = ({ param }) => {
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
  return {
    activeNav: "broadcasts",
    crumbs: bcRunId ? ["Campaigns", { label: "Broadcasts", to: "broadcasts" }, bcRun ? bcRun.name : "Broadcast"]
      : bcYes ? ["Campaigns", { label: "Broadcasts", to: "broadcasts" }, "Get their yes"]
      : bcSeg ? ["Campaigns", { label: "Broadcasts", to: "broadcasts" }, bcSeg.label] : ["Campaigns", "Broadcasts"],
    content: <BroadcastsPage initialSegment={bcAudience} initialRun={bcRunId} initialYes={bcYes} />,
  };
};

const drawStudio = () => ({
  activeNav: "studio",
  crumbs: ["Agents", "Studio"],
  pane: true,
  content: demoPage("AgentStudioPage"),
});

const drawStore = () => ({
  activeNav: "store",
  crumbs: ["Agents", "Store"],
  content: demoPage("AgentStore"),
});

const drawSoonUnknown = ({ param, navigate }) => ({
  activeNav: "home",
  crumbs: ["Not found"],
  content: <NotFound raw={`soon/${param}`} onNavigate={navigate} />,
});

const drawSoon = ({ param, navigate }) => ({
  activeNav: param,
  crumbs: [SOON_META[param]?.title || param],
  content: <ComingSoon surface={param} onNavigate={navigate} />,
});

/** No row took the address: not found, under the Today item. */
const drawNotFound = ({ page, navigate }) => ({
  activeNav: "home",
  crumbs: ["Not found"],
  content: <NotFound raw={page} onNavigate={navigate} />,
});

// ---- The honesty gate, applied -------------------------------------------
// The shell derives whether a route is gated (app-shell.jsx useRouteGate: the registry marks the surface demo and the
// session did not declare itself one) and hands the answer in as `demoGated`; here the row's answer is replaced by the
// honest card. Everything the row computed from seed data is reset — a crumb carrying an invented client's name over
// an honest pane is still a lie — and the nav item it lit stays lit, as it always has.
const routeGated = (drawn, { page, navigate }) => ({
  ...drawn,
  crumbs: [SOON_META[page]?.title || page],
  pane: false,
  primaryAction: null,
  content: <ComingSoon surface={page} onNavigate={navigate} />,
});

// ---- THE ROUTE TABLE --------------------------------------------------------
// One row per route, first match wins, read by drawRoute below. `page` is the word before the slash; `when` says
// which addresses of that page the row takes (the param's shape, or a fact about the workspace) — absent, every
// address of the page no row above took. A page with no row is not found. soon/<surface>: the registry decides what
// it opens, like every other route (app-shell.jsx routeAt): a page it lists as real opens as that page (so it never
// reaches these rows), a demo page keeps its landing, and a name it does not know is not found (the wiring audit's
// N16: #/soon/calendar said the Calendar was not in this release). The standalone mockup has no registry and keeps
// every landing.
//
// `mount` is what the row's view is mounted under, where the page follows its address as a prop: every address the row
// takes is then the page already there. Absent, the view is mounted under its whole route, so a new param is a new
// mount. The route itself was the key once, and a surface's own param tore the surface down and built it again: a
// second Settings tab, a second Inbox thread, two 240ms route-in fades compounding (the shell's on .route-view and the
// pane's own), and the surface's state, scroll and fetches thrown away on a move that never left it. A row takes a
// `mount` only once its page FOLLOWS the param: Settings derives its tab on every draw, the Inbox follows
// initialThreadId ("Deep-link follows later navigations too"), Live and Conversations write the call or the row they
// open to the address (replaced), and Leads reads `leadsRoute` on every draw and keys its one read by it. A page that
// seeds state from the param and never looks again would show the wrong entity, so a row without one costs the
// improvement, never correctness. A person keeps their whole route: only the leads route, not an id that starts with the word.
// People's own views and the Pipeline are its page's, which follows its address itself and mounts afresh for the one it did not
// write (surfaces/people/people-route.tsx).
const SHELL_ROUTES = [
  { page: "clients", when: (param) => param && /^leads(:|$)/.test(param), mount: "clients/leads", draw: drawLeads },
  // The mockup's seeded Lists page, where there is no workspace to read (a demo session); a real workspace's Lists is the App Router page (surfaces/routes.ts).
  { page: "segments", when: () => !window.__PEOPLE && !realWorkspace(), draw: drawSegments },
  { page: "start", mount: "start", draw: drawStart },
  { page: "admin", mount: "admin", draw: drawSettings },
  { page: "tasks", draw: drawTasks },
  { page: "live", mount: "live", draw: drawLive },
  { page: "pipeline", draw: drawDealBoard },
  { page: "fleet", draw: drawFleet },
  { page: "outbound", draw: drawPlaybooks },
  { page: "messages", draw: drawTemplates },
  { page: "content", draw: drawContent },
  { page: "broadcasts", mount: "broadcasts", draw: drawBroadcasts },
  { page: "studio", draw: drawStudio },
  { page: "store", draw: drawStore },
  { page: "soon", when: (param, r) => !!param && r.soonState === "unknown", draw: drawSoonUnknown },
  { page: "soon", when: (param) => !!param, draw: drawSoon },
];

// The top bar's act a moved surface names (src/surfaces/routes.ts SurfaceAct): a link out (the Calendar's booking link), or the
// Ask door, which only a demo session offers (Ask opens there over seeded pages; a real workspace has nothing to ask: a
// primary button that did nothing sat in the real chrome), composing from the words the surface gives where it gives some.
const surfaceAct = (act, openAsk) => {
  const cls = `btn ${act.primary ? "btn-primary " : ""}btn-sm`;
  if (act.href) {
    return (
      <a className={cls} href={act.href} target="_blank" rel="noreferrer" data-testid={act.testid}>
        <Icon name={act.glyph} size={12} />{" " + act.label}
      </a>
    );
  }
  return window.__DEMO_MODE && act.ask ? (
    <button className={cls} onClick={() => (act.prompt ? window.askAbout({ mode: "compose", prompt: act.prompt }) : openAsk())}>
      <Icon name={act.glyph} size={12} />{" " + act.label}
    </button>
  ) : null;
};

/**
 * What an address draws: the first row that takes it, else not found, then the honesty gate. `r` is the route as the
 * shell resolved it (app-shell.jsx routeAt: its page, its param and its key, `routeKey`), with the shell's doors and
 * the Inbox's preferences (see the rows). Every route lands here, and the answer is the shell's view: `activeNav`,
 * `crumbs`, `pane` (false unless the row says), `primaryAction` (null unless the row says), `content`, and `mountKey`,
 * what the view is mounted under (the row's `mount`, else the route's own key).
 */
const drawRoute = (r) => {
  const row = SHELL_ROUTES.find((x) => x.page === r.page && (!x.when || x.when(r.param, r)));
  // A route that has left the shell (an App Router page, src/surfaces/routes.ts) has no row for the addresses its page
  // takes: the frame draws its chrome around the page the layout gave it (`routePage`), by what the registry says of the
  // route and of the address. An address under it is its page where the route takes every one (`params`) or its page says
  // it takes that one (`takes`); its nav item and crumbs may be asked of it, or (`chrome`) its crumbs, what it is mounted
  // under and whether a demo session offers an act.
  const at = !row && r.surfaceRoutes && Object.prototype.hasOwnProperty.call(r.surfaceRoutes, r.page) ? r.surfaceRoutes[r.page] : null;
  const takes = !!at && (!r.param || at.params === true || (!!at.takes && at.takes(r.param)));
  const asked = (v) => (typeof v === "function" ? v(r.param || null) : v);
  const chrome = takes && at.chrome ? at.chrome({ param: r.param, backToPeople: r.backToPeople }) : null;
  const act = chrome ? chrome.act : takes ? at.act : null;
  const answer = takes
    ? {
        activeNav: asked(at.activeNav),
        crumbs: chrome ? chrome.crumbs : asked(at.crumbs),
        pane: at.pane,
        content: r.routePage,
        ...(act ? { primaryAction: surfaceAct(act, r.openAsk) } : {}),
      }
    : row ? row.draw(r) : drawNotFound(r);
  const drawn = { pane: false, primaryAction: null, ...answer, mountKey: (row && row.mount) || (chrome && chrome.mount) || (takes && at.mount) || r.routeKey };
  return r.demoGated ? routeGated(drawn, r) : drawn;
};

Object.assign(window, { SHELL_ROUTES, drawRoute });
