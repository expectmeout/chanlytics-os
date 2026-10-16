/* global React, Icon */
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
//
// The landing's words for the pages the registry marks demo, and only those (surface-registry.ts SURFACE_STATES; a test
// holds every key to a demo row). A page that has shipped never draws ComingSoon in the app: `soon/<page>` lands on the page
// itself, and a name the registry does not know is not found, so a row for either is words no workspace reads. The
// standalone mockup has no registry; there a page with no row here draws its key as its title.
const SOON_META = {
  pipeline:   { icon: "deal",        title: "Pipeline",   blurb: "Deals kanban with agent attribution — who advanced what, and why." },
  content:    { icon: "content",     title: "Content",    blurb: "Content calendar with agent-drafted posts." },
  fleet:      { icon: "agents",      title: "Agent Fleet", blurb: "Deep management for every agent: autonomy, campaigns, performance." },
  store:      { icon: "agents",      title: "Agent Store", blurb: "Install agents with new abilities — phone, chat, recovery, review." },
  studio:     { icon: "sparkle",     title: "Agent Studio", blurb: "Compose custom agents from skills, tone, and guardrails." },
  tasks:      { icon: "check",       title: "Tasks",      blurb: "The work ledger — a receipt for everything your agents did." },
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

// ---- People ----------------------------------------------------------------------------------------------------
// People left the shell for an App Router page (surfaces/people, routes.ts): its list, its views, the New list door, its
// Leads scope, the Pipeline and a person, each drawn by the page, with the frame's chrome from the surface's own `chrome`
// (surfaces/people/chrome.ts).

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

const drawTasks = () => ({
  activeNav: "tasks",
  crumbs: ["Agents", "Tasks"],
  pane: true,
  content: demoPage("TasksPage"),
});


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

const drawContent = () => ({
  activeNav: "content",
  crumbs: ["Campaigns", "Content"],
  content: demoPage("ContentPage"),
});

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
// open to the address (replaced). A page that seeds state from the param and never looks again would show the wrong
// entity, so a row without one costs the improvement, never correctness. People's own views, Leads and the Pipeline are
// its page's, which follows its address itself and mounts afresh for the one it did not write
// (surfaces/people/people-route.tsx).
const SHELL_ROUTES = [
  // The mockup's seeded Lists page, where there is no workspace to read (a demo session); a real workspace's Lists is the App Router page (surfaces/routes.ts).
  { page: "segments", when: () => !window.__PEOPLE && !realWorkspace(), draw: drawSegments },
  { page: "tasks", draw: drawTasks },

  { page: "pipeline", draw: drawDealBoard },
  { page: "fleet", draw: drawFleet },
  { page: "content", draw: drawContent },
  { page: "studio", draw: drawStudio },
  { page: "store", draw: drawStore },
  { page: "soon", when: (param, r) => !!param && r.soonState === "unknown", draw: drawSoonUnknown },
  { page: "soon", when: (param) => !!param, draw: drawSoon },
];

// The top bar's act a moved surface names (src/surfaces/routes.ts SurfaceAct): a link out (the Calendar's booking link), or the
// Ask door, which only a demo session offers ("New task" opens the Ask overlay, which is a no-op outside a demo: a primary
// button that did nothing sat in the real chrome). The door composes from the words the surface gives (`prompt`), else it opens Ask.
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
    <button className={cls} onClick={act.prompt ? () => window.askAbout({ mode: "compose", prompt: act.prompt }) : openAsk}>
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
// A pane at this address where the route's own says otherwise (Campaigns' Sequences view, a list and a record).
const paneAsked = (chrome) => (chrome && typeof chrome.pane === "boolean" ? { pane: chrome.pane } : {});

const drawRoute = (r) => {
  const row = SHELL_ROUTES.find((x) => x.page === r.page && (!x.when || x.when(r.param, r)));
  // A route that has left the shell (an App Router page, src/surfaces/routes.ts) has no row for the addresses its page
  // takes: the frame draws its chrome around the page the layout gave it (`routePage`), by what the registry says of the
  // route and of the address. A route takes every address under it (`params`) or the ones `takes` says, and its nav item and
  // crumbs may be asked of the param; `chrome` names an address's crumbs, what it is mounted under and whether a demo session
  // offers an act.
  const at = !row && r.surfaceRoutes && Object.prototype.hasOwnProperty.call(r.surfaceRoutes, r.page) ? r.surfaceRoutes[r.page] : null;
  const takes = !!at && (!r.param || at.params === true || (!!at.takes && at.takes(r.param)));
  const surface = takes ? at : null;
  const chrome = surface && surface.chrome ? surface.chrome({ param: r.param, backToPeople: r.backToPeople }) : null;
  // The act an address has: its chrome's (none where the chrome says null), else the route's.
  const act = chrome && chrome.act !== undefined ? chrome.act : surface && surface.act;
  const asked = (v) => (typeof v === "function" ? v(r.param || null) : v);
  const answer = surface
    ? {
        ...surface,
        ...paneAsked(chrome),
        activeNav: asked(surface.activeNav),
        crumbs: chrome ? chrome.crumbs : asked(surface.crumbs),
        // The top bar's Ask in the address's words, where the chrome says some (a person's page: "Ask about Emily").
        ask: chrome && chrome.ask ? chrome.ask : null,
        // The page's views, drawn by the frame's strip of views (SurfaceTabs) like the Inbox's: the page says them, never draws them.
        views: chrome && chrome.views ? chrome.views : null,
        primaryAction: act ? surfaceAct(act, r.openAsk) : null,
        content: r.routePage,
      }
    : row ? row.draw(r) : drawNotFound(r);
  const drawn = { pane: false, primaryAction: null, ...answer, mountKey: (row && row.mount) || (chrome && chrome.mount) || (surface && surface.mount) || r.routeKey };
  // An address with a place to go (r.retiredTo: a retired page, a pane that moved -- admin/setup is the first run) draws nothing while
  // the frame takes it there (app-shell.jsx useRouteMoves, an effect that runs after this draw): not the page, which for a real
  // workspace may be the mockup's, and not the honesty gate's card, which says "Not in this release" of an address the
  // product knows.
  if (r.retiredTo) return { ...drawn, pane: false, primaryAction: null, content: null };
  return r.demoGated ? routeGated(drawn, r) : drawn;
};

// SOON_META is published for a-real-session-hears-only-what-is-sent.test.mjs, which holds its keys to the registry's demo rows.
Object.assign(window, { SHELL_ROUTES, SOON_META, drawRoute });
