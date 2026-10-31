/**
 * The route table (moved from legacy/pages/app-routes.jsx, the one-system plan's step 7a): what an address draws inside
 * the frame. One row per route the frame still draws itself (SHELL_ROUTES), each naming what it draws and which addresses
 * of its page it takes (`when`); the landings a route can end at (ComingSoon, NotFound); and the honesty gate's one
 * interception (routeGated), applied to every answer by drawRoute. A route with an App Router page has no row: the frame
 * draws its chrome around the page the layout gave it (`routePage`), as `surfaceRoutes` (surfaces/routes.ts) says.
 *
 * No hooks here: drawRoute is a function of the address and of what the window holds at the draw, called during the
 * frame's own render. The frame's JSX reads it off the window (frame-globals.ts publishes it) until the frame itself is
 * TypeScript (step 7e), when the parked pages' landing becomes the catch-all page's own. Drawn as the JSX drew it, raw
 * buttons and all, until the frame's kit step (eslint KIT_PENDING).
 */
import type { ReactNode } from "react";
import { askAbout } from "../frame-doors";
import type { HeadFirst } from "../kit/head/standing";
import type { SurfaceAct, SurfaceRoute, SurfaceViews } from "../routes";
import { frameGlyph, isDemoFrame } from "./frame-window";

type Crumb = string | { label: string; to?: string; go?: unknown };

/** What a route draws inside the frame: the item it lights, its crumbs, whether it is a pane, its act and its content. */
interface RouteAnswer {
  activeNav: string;
  crumbs: readonly Crumb[];
  pane: boolean;
  primaryAction: ReactNode;
  content: ReactNode;
  mountKey?: string;
  ask?: string | null;
  views?: SurfaceViews | null;
  ownHead?: boolean;
  head?: HeadFirst | null;
}

/** The route as the frame resolved it (shell-routes.ts routeAt), with the frame's doors and what it hands a moved page. */
interface DrawnRoute {
  page: string;
  param: string | null;
  routeKey: string;
  retiredTo?: string | null;
  soonState?: string;
  demoGated?: boolean;
  navigate: (to: string) => void;
  openAsk?: () => void;
  backToPeople?: unknown;
  routePage?: ReactNode;
  surfaceRoutes?: Readonly<Partial<Record<string, SurfaceRoute>>> | null;
}

interface RouteRow {
  page: string;
  when?: (param: string | null, r: DrawnRoute) => boolean;
  mount?: string;
  draw: (r: DrawnRoute) => Partial<RouteAnswer>;
}

// ---- The mockup's landings ---------------------------------------------
// The parked surfaces (Agents: fleet, store, studio, tasks; Content; Pipeline; the shared report viewer) are hidden from
// every workspace: no nav entry, no tab, the Not-in-this-release card for a hand-typed address. Ruben's decision, 11
// September 2026; their mockups went on 17 October 2026 (git keeps them). Nothing here is a promise to anyone.
//
// The landing's words for the pages the registry marks demo, and only those (surface-registry.ts SURFACE_STATES; a test
// holds every key to a demo row). The standalone mockup has no registry; there a page with no row here draws its key.
export const SOON_META: Readonly<Partial<Record<string, { icon: string; title: string; blurb: string }>>> = {
  pipeline: {
    icon: "deal",
    title: "Pipeline",
    blurb: "Deals kanban with agent attribution — who advanced what, and why.",
  },
  content: { icon: "content", title: "Content", blurb: "Content calendar with agent-drafted posts." },
  fleet: {
    icon: "agents",
    title: "Agent Fleet",
    blurb: "Deep management for every agent: autonomy, campaigns, performance.",
  },
  store: {
    icon: "agents",
    title: "Agent Store",
    blurb: "Install agents with new abilities — phone, chat, recovery, review.",
  },
  studio: { icon: "sparkle", title: "Agent Studio", blurb: "Compose custom agents from skills, tone, and guardrails." },
  tasks: { icon: "check", title: "Tasks", blurb: "The work ledger — a receipt for everything your agents did." },
  shared: {
    icon: "trending-up",
    title: "Shared reports",
    blurb: "Read-only report links you can hand to a client or partner.",
  },
};

const soonTitle = (page: string) => SOON_META[page]?.title || page;

function ComingSoon({ surface, onNavigate }: { surface: string; onNavigate: (to: string) => void }) {
  const meta = SOON_META[surface] || { icon: "dot", title: surface, blurb: "" };
  const Glyph = frameGlyph();
  return (
    <div className="soon">
      <div className="soon-glyph">
        <Glyph name={meta.icon} size={22} />
      </div>
      <div className="soon-title">{meta.title}</div>
      <div className="soon-blurb">{meta.blurb}</div>
      <span className="soon-chip">Not in this release</span>
      <div className="soon-actions">
        <button className="btn btn-sm" onClick={() => onNavigate("today")}>
          <Glyph name="home" size={12} /> Back to Today
        </button>
        {/* Outside a demo askAbout opens the Line, which answers about this workspace, and a page this release does not
            have is nothing to ask it about: the button is the demo's, where the seed palette answers. */}
        {isDemoFrame() && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => askAbout({ mode: "compose", prompt: "About " + meta.title + ": " })}
          >
            <Glyph name="sparkle" size={12} /> Ask about {meta.title}
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Not-found states -----------------------------------------------------
function NotFound({ raw, onNavigate }: { raw: string; onNavigate: (to: string) => void }) {
  const Glyph = frameGlyph();
  return (
    <div className="soon">
      <div className="soon-glyph">
        <Glyph name="search" size={22} />
      </div>
      <div className="soon-title">No surface at &quot;{raw}&quot;</div>
      <div className="soon-blurb">That route doesn&apos;t exist in this workspace.</div>
      <div className="soon-actions">
        <button className="btn btn-sm" onClick={() => onNavigate("today")}>
          <Glyph name="home" size={12} /> Back to Today
        </button>
      </div>
    </div>
  );
}

// ---- The rows ---------------------------------------------------------------
// The parked pages: their mockups went on 17 October 2026 (the closed-loop audit's S2, Ruben's word), so each draws its
// landing wherever it is asked for, a demo session's too; the registry still marks them demo, and the honesty gate says
// the same card.
const drawParked = ({ page, navigate }: DrawnRoute) => ({
  activeNav: page,
  crumbs: [soonTitle(page)],
  content: <ComingSoon surface={page} onNavigate={navigate} />,
});

const drawSoonUnknown = ({ param, navigate }: DrawnRoute) => ({
  activeNav: "home",
  crumbs: ["Not found"],
  content: <NotFound raw={`soon/${param}`} onNavigate={navigate} />,
});

const drawSoon = ({ param, navigate }: DrawnRoute) => ({
  activeNav: param || "",
  crumbs: [soonTitle(param || "")],
  content: <ComingSoon surface={param || ""} onNavigate={navigate} />,
});

/** No row took the address: not found, under the Today item. */
const drawNotFound = ({ page, navigate }: DrawnRoute) => ({
  activeNav: "home",
  crumbs: ["Not found"],
  content: <NotFound raw={page} onNavigate={navigate} />,
});

// ---- The honesty gate, applied -------------------------------------------
// The frame derives whether a route is gated (shell-hooks.ts useRouteGate: the registry marks the surface demo and the
// session did not declare itself one) and hands the answer in as `demoGated`; here the row's answer is replaced by the
// honest card. Everything the row computed from seed data is reset, and the nav item it lit stays lit.
const routeGated = (drawn: RouteAnswer, { page, navigate }: DrawnRoute): RouteAnswer => ({
  ...drawn,
  crumbs: [soonTitle(page)],
  head: null,
  pane: false,
  primaryAction: null,
  content: <ComingSoon surface={page} onNavigate={navigate} />,
});

// ---- THE ROUTE TABLE --------------------------------------------------------
// One row per route, first match wins. `page` is the word before the slash; `when` says which addresses of that page the
// row takes; absent, every address of the page no row above took. A page with no row is not found. soon/<surface>: the
// registry decides what it opens (shell-routes.ts routeAt): a page it lists as real opens as that page (so it never reaches
// these rows), a demo page keeps its landing, and a name it does not know is not found. `mount` is what a row's view is
// mounted under, where its page follows its address; absent, the view is mounted under its whole route.
export const SHELL_ROUTES: readonly RouteRow[] = [
  { page: "tasks", draw: drawParked },
  { page: "pipeline", draw: drawParked },
  { page: "fleet", draw: drawParked },
  { page: "content", draw: drawParked },
  { page: "studio", draw: drawParked },
  { page: "store", draw: drawParked },
  { page: "soon", when: (param, r) => !!param && r.soonState === "unknown", draw: drawSoonUnknown },
  { page: "soon", when: (param) => !!param, draw: drawSoon },
];

// The top bar's act a moved surface names (surfaces/routes.ts SurfaceAct): a link out (the Calendar's booking link), or
// the Ask door, which only a demo session offers (a primary button that did nothing sat in the real chrome). The door
// composes from the words the surface gives (`prompt`), else it opens Ask.
function surfaceAct(act: SurfaceAct, openAsk: (() => void) | undefined): ReactNode {
  const cls = `btn ${act.primary ? "btn-primary " : ""}btn-sm`;
  const Glyph = frameGlyph();
  if (act.href) {
    return (
      <a className={cls} href={act.href} target="_blank" rel="noreferrer" data-testid={act.testid}>
        <Glyph name={act.glyph} size={12} />
        {" " + act.label}
      </a>
    );
  }
  if (!isDemoFrame() || !act.ask) return null;
  const prompt = act.prompt;
  return (
    <button className={cls} onClick={prompt ? () => askAbout({ mode: "compose", prompt }) : openAsk}>
      <Glyph name={act.glyph} size={12} />
      {" " + act.label}
    </button>
  );
}

/** A moved route's surface, where it takes this address: every address under it (`params`), or the ones `takes` says. */
function surfaceAt(r: DrawnRoute, row: RouteRow | undefined): SurfaceRoute | null {
  const routes = r.surfaceRoutes;
  if (row || !routes || !Object.prototype.hasOwnProperty.call(routes, r.page)) return null;
  const at = routes[r.page];
  if (!at) return null;
  const takes = !r.param || at.params === true || (!!at.takes && at.takes(r.param));
  return takes ? at : null;
}

/** What the frame draws around a moved route's page at this address: its chrome's, else the route's own. */
function surfaceAnswer(surface: SurfaceRoute, r: DrawnRoute): Partial<RouteAnswer> & { mount?: string } {
  const chrome = surface.chrome ? surface.chrome({ param: r.param, backToPeople: r.backToPeople }) : null;
  // The act an address has: its chrome's (none where the chrome says null), else the route's.
  const act = chrome && chrome.act !== undefined ? chrome.act : surface.act;
  const activeNav = typeof surface.activeNav === "function" ? surface.activeNav(r.param || null) : surface.activeNav;
  const crumbs = chrome
    ? chrome.crumbs
    : typeof surface.crumbs === "function"
      ? surface.crumbs(r.param || null)
      : surface.crumbs;
  return {
    pane: chrome && typeof chrome.pane === "boolean" ? chrome.pane : surface.pane,
    activeNav,
    crumbs,
    // The top bar's Ask in the address's words, where the chrome says some (a person's page: "Ask about Emily").
    ask: chrome && chrome.ask ? chrome.ask : null,
    // The page's views, drawn by the frame's strip of views (SurfaceTabs): the page says them, never draws them.
    views: chrome && chrome.views ? chrome.views : null,
    // The page draws its own head (a person's hero): the head draws no name over it while it is on its way.
    ownHead: !!(chrome && chrome.ownHead),
    // What the page will say in the head, said from the first draw (Today's greeting): no crumb drawn and taken back.
    head: (chrome && chrome.head) || null,
    primaryAction: act ? surfaceAct(act, r.openAsk) : null,
    content: r.routePage,
    mount: (chrome && chrome.mount) || surface.mount,
  };
}

/**
 * What an address draws: the first row that takes it, else a moved route's page, else not found, then the honesty gate.
 * The answer is the frame's view: `activeNav`, `crumbs`, `pane` (false unless the row says), `primaryAction` (null unless
 * the row says), `content`, and `mountKey`, what the view is mounted under (the row's `mount`, else the route's own key).
 */
export function drawRoute(r: DrawnRoute): RouteAnswer {
  const row = SHELL_ROUTES.find((x) => x.page === r.page && (!x.when || x.when(r.param, r)));
  const surface = surfaceAt(r, row);
  const { mount, ...answer } = surface
    ? surfaceAnswer(surface, r)
    : { ...(row ? row.draw(r) : drawNotFound(r)), mount: undefined };
  const drawn: RouteAnswer = {
    activeNav: "home",
    crumbs: [],
    pane: false,
    primaryAction: null,
    content: null,
    ...answer,
    mountKey: (row && row.mount) || mount || r.routeKey,
  };
  // An address with a place to go (a retired page, a pane that moved) draws nothing while the frame takes it there
  // (shell-hooks.ts useRouteMoves, an effect that runs after this draw): not the page, and not the honesty gate's card.
  if (r.retiredTo) return { ...drawn, pane: false, primaryAction: null, content: null };
  return r.demoGated ? routeGated(drawn, r) : drawn;
}
