/* global React, Icon, AskBar, Sidebar, Topbar, ShellStatusBar, LiveCallBar, SurfaceTabs, TabBar, ShortcutsSheet, FailedRead, useSurface */
// Chanlytics — App Shell
// The live product frame: routing by the address, sidebar click-throughs, page transitions,
// global Ask Chanlytics (⌘K), and intentional landings for unbuilt surfaces.
// What each route draws is the route table's (app-routes.jsx SHELL_ROUTES, read through drawRoute); this file
// resolves the address, holds the gates and the hooks, and draws the chrome around the table's answer.
//
// Routes (the address after /w/<slug>; the standalone mockup writes them after a #/ instead):
//   /today                → Operator's brief
//   /inbox                → Inbox
//   /clients              → Clients portfolio
//   /clients/pipeline     → People › Pipeline
//   /clients/<id>         → Client profile
//   /soon/<surface>       → In-design landing (pipeline, calendar, fleet, …)
// The route is read, followed and moved in one place, CHANLY.address (data/constants.jsx: the bridge's in the app,
// legacy-bridge/workspace.ts; the mockup's own over its hash). Nothing here reads window.location.

const { useState: useShellState, useEffect: useShellEffect, useCallback: useShellCallback, useRef: useShellRef } = React;

// Is this route's data actually available? The bridge installs __surfaceGate
// for flipped surfaces; unflipped ones are seeded and always ready.
// `own`: the route's own surface alone, without the bands its first draw waits for beside it (surface-registry ROUTE_WAITS).
const routeReady = (page, param, own = false) => !window.__surfaceGate || window.__surfaceGate(page, param, own);

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
/** A route's page and its param, from the route as written (`inbox/th-1`). */
const routeParts = (route) => {
  const [page, param] = route.split("/");
  return { page: page || "today", param: param || null };
};
const parseRoute = () => routeParts(window.CHANLY.address.route());

/**
 * The route an address opens, resolved for the table and the gates: `page` and `param` as drawn, `raw` as written,
 * the soon/ answer, where a retired address lands and the gate's key. What its view is mounted under is the table's
 * (app-routes.jsx, a row's `mount`), in drawRoute's answer.
 *
 * soon/<surface> was the landing for a page not built yet, and an old link, a bookmark or a bell row can still name
 * one that has since shipped. The registry decides what it opens, like every other route: a page it lists as real
 * opens, a demo page keeps its landing, and a name it does not know is not found (the wiring audit's N16:
 * /soon/calendar said the Calendar was not in this release). The standalone mockup has no registry and keeps every
 * landing.
 *
 * Where this address lands now, if it moved (surface-registry surfaceRetiredTo): People took over Leads and the Deal
 * board, and Setup left Settings for the first run. Worked out before the rows, so a pane that moved draws nothing
 * for the frame before the redirect (useRouteMoves).
 */
const routeAt = (route) => {
  const soonState = route.page === "soon" && route.param && window.__surfaceState
    ? (window.__surfaceState(route.param) || "unknown")
    : null;
  const { page, param } = soonState === "real" ? { page: route.param, param: null } : route;
  const retiredTo = (window.__surfaceRetired && window.__surfaceRetired(page, param, !!window.__DEMO_MODE)) || null;
  // The gate is asked per PANE, so this key must carry the param. What the surface is MOUNTED under is a different
  // question, the route table's (app-routes.jsx, a row's `mount`).
  const routeKey = `${page}/${param || ""}`;
  return { page, param, raw: route, soonState, retiredTo, routeKey };
};

// Sidebar nav id → route
const NAV_ROUTE = {
  home: "today",
  people: "clients",
  campaigns: "campaigns",
  agents: "fleet",
  inbox: "inbox",
  clients: "clients",
  store: "store",
  fleet: "fleet",
  studio: "studio",
  outbound: "campaigns",
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

// ---- Error state --------------------------------------------------------
class ShellErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  // Said, not only drawn: the bridge's host hears this and sends it to the server (src/client/client-error.ts).
  componentDidCatch(e) {
    try {
      window.dispatchEvent(new CustomEvent("chanlytics:shell-error", { detail: { error: e, page: window.CHANLY.address.route() } }));
    } catch { /* a report lost, never a second error */ }
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="soon err">
        <div className="soon-glyph"><Icon name="alert" size={22} /></div>
        <div className="soon-title">This surface hit an error</div>
        <div className="soon-blurb">The rest of the OS is fine — this pane failed to render. {String(this.state.err && this.state.err.message || "")}</div>
        <div className="soon-actions">
          <button className="btn btn-sm" onClick={() => { window.CHANLY.address.go("today"); }}>
            <Icon name="home" size={12} /> Back to Today
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}

// ---- A route on its way ---------------------------------------------------
// Until its surface lands, the pane a page will fill stays empty and busy, and one status line says it is reading;
// the words wait a beat (components.css .route-reading), so a surface that lands fast is never said. Never a
// skeleton: the one that stood here matched no page and moved every page when it left (what was measured is in
// layout-measure.test.mjs). The route view is keyed on readiness, so the route-in fade plays on the page as it
// lands rather than on the empty pane.

// ---- Phone tab bar --------------------------------------------------------
// On a phone the drawer hid the four places an owner actually goes behind a
// menu button. A bar at the thumb instead (the kit's TabBar), with the count
// that matters on the salon floor: what needs you. Real surfaces only;
// everything else stays behind More. Rendered always, shown only under the
// phone breakpoint (mobile.css .phone-places).
// A place holds its pages (`holds`): the Inbox its views, Conversations and
// Live; People its own. It is lit on every page it holds, so the lozenge never
// leaves for a view of the place, and pressed there again it goes back to its
// first page, or up to the top of that page when it is on it already, as a
// phone's tab bar does.
const PHONE_TABS = [
  { id: "home", route: "today", icon: "home", label: "Today", holds: ["today"] },
  { id: "inbox", route: "inbox", icon: "inbox", label: "Inbox", holds: ["inbox", "conversations", "live"] },
  // Calendar, not Live. A call is live for minutes a week and holding a slot the
  // rest of the time; "when is my next opening" is asked between every client.
  // A call in progress is the shell's own bar while it is happening
  // (topbar.jsx LiveCallBar) — which is also the only place with room for it to
  // say who is on the line.
  { id: "calendar", route: "calendar", icon: "calendar", label: "Calendar", holds: ["calendar"] },
  { id: "people", route: "clients", icon: "users", label: "People", holds: ["clients", "segments"] },
];
// How long after the tab bar asks for a place the view that arrives is still its move, and cut in (useViewFade): the
// tab's own wait for its address (the kit's TabBar, PENDING_MS).
const PLACE_CUT_MS = 3000;
// Where the phone's drawer goes that its tab bar does not, as its items go there: Settings is `admin` (the sidebar's and the
// account menu's), whose page opens on its first pane itself. Warmed as `admin/workspace`, it was another address, and the
// press on Settings still asked the server.
const DRAWER_ONLY = ["campaigns", "reports", "admin"];
// A pointer that reaches a sidebar item warms its page (workspace.ts warmRoute), so the press that follows asks the server
// for nothing. The item says which it is (sidebar.jsx data-nav).
const sideWarm = (e) => {
  const item = e.target && e.target.closest ? e.target.closest("[data-nav]") : null;
  const a = window.CHANLY && window.CHANLY.address;
  if (item && a && a.warm) a.warm(NAV_ROUTE[item.dataset.nav] || item.dataset.nav);
};
/**
 * The page on screen back to its top: whatever scrolls in it, the route view itself (Today), the list a page of panes
 * scrolls in (the Inbox's threads, People's table), or on a phone the window. The tab bar's place pressed again, and the
 * phone app's tab (shell:top).
 */
const pageToTop = () => {
  const main = document.getElementById("main");
  if (!main) return;
  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior = still ? "auto" : "smooth";
  for (const el of [main, ...main.querySelectorAll("*")]) {
    if (el.scrollTop > 0) el.scrollTo({ top: 0, behavior });
  }
  if (window.scrollY > 0) window.scrollTo({ top: 0, behavior });
};

/**
 * The tab bar's places, drawn by the kit (TabBar: it lights a place and moves its lozenge as the finger lands, then asks
 * for the place a painted frame on). A place another holds is moved to with the page cut in (`onPlace`: no fade, as a
 * phone's tab bar draws the page it opens); the place on screen pressed again goes to its first page, or to the top.
 */
const PhoneTabs = ({ page, param, inboxNeeds, onNavigate, onMenu, onPlace }) => {
  // The four places a thumb goes, kept warm: warmed once the page is idle, again when the tab comes back to the screen or
  // is first pressed after the router let them go, and when a finger reaches one (workspace.ts keepWarm, warmRoute).
  useShellEffect(() => {
    const a = window.CHANLY && window.CHANLY.address;
    if (a && a.keepWarm) a.keepWarm(PHONE_TABS.map((t) => t.route));
  }, [page]);
  const address = () => (window.CHANLY && window.CHANLY.address) || null;
  const warm = (route) => { const a = address(); if (a && a.warm) a.warm(route); };
  const href = (route) => { const a = address(); return a && a.href ? a.href(route) : `#/${route}`; };
  const here = PHONE_TABS.find((t) => t.holds.includes(page)) || null;
  const pick = (id) => {
    const t = PHONE_TABS.find((x) => x.id === id);
    if (!t) return;
    if (here && here.id === t.id) {
      if (page === t.route && !param) pageToTop();
      else onNavigate(t.route);
      return;
    }
    onPlace();
    onNavigate(t.route);
  };
  if (typeof TabBar === "undefined") return null;
  return (
    <TabBar
      label="Main"
      testid="phone-tabs"
      className="phone-places"
      picked={here ? here.id : null}
      places={PHONE_TABS.map((t) => ({
        id: t.id,
        label: t.label,
        href: href(t.route),
        glyph: <Icon name={t.icon} size={18} />,
        // Only the Inbox has a count, and it counts people who need you: amber, as the sidebar's is.
        count: t.id === "inbox" && inboxNeeds > 0 ? inboxNeeds : null,
        tone: t.id === "inbox" ? "warn" : undefined,
        warm: () => warm(t.route),
      }))}
      onPick={pick}
      more={{ label: "Menu", word: "More", glyph: <Icon name="menu" size={18} />, onPress: onMenu }}
    />
  );
};

// ---- The shell's hooks ----------------------------------------------------
// Each holds one concern of ChanlyticsApp, and the state its effects set (the drawer's is useNavDrawer's), called in
// the order the shell always called these hooks, so the effects run in the order they always ran.

/**
 * What needs you, for the sidebar's and the phone bar's count and the tab's title: the one number every surface says
 * (surfaces/needs-you.ts, `window.useNeedsYou`, drawn again when it changes), a selector over the Inbox's threads and the
 * runs waiting for a word. Nothing before the Inbox has been read (an invented "6" stood on the sidebar an inch from Today's
 * honest "0" while it was seeded), and nothing in the standalone mockup's stub, which has no threads to count.
 */
const useInboxNeeds = () => (window.useNeedsYou ? window.useNeedsYou() : 0) || 0;

/**
 * The route gate and the honesty gate, for the route on screen.
 *
 * Only the escape hatches are state. Readiness itself is DERIVED during render — storing it meant a navigation
 * committed the new page with the PREVIOUS route's value, painting one full frame of mockup threads before the effect
 * could correct it. Each hatch is keyed on the route it was armed for, so the next page never draws one frame with the
 * last one's answer: the unavailable timeout, and the wait for a band beside the page (a page whose own surface is in
 * stops waiting for it after the registry's wait, ROUTE_WAIT_MS). `arm()` is what the shell runs as the route changes
 * (its route effect, keyed on routeKey) and returns what undoes it.
 *
 * The honesty gate: one interception, every route. The bridge classifies each surface real-vs-demo
 * (surface-registry.ts) and publishes it as window.__surfaceState. A "demo" surface renders only in a session that
 * declared itself one; in production it shows the same ComingSoon pane Settings pioneered, instead of a
 * finished-looking screen fed by invented customers, invented revenue, and success toasts for sends that never
 * happened. Gating routes one by one is how fifteen of them were missed — the classification IS the gate now, and the
 * route table applies the answer (app-routes.jsx routeGated). Standalone mockup (no bridge): __surfaceState is absent
 * and everything renders, which is right, because the whole artifact is a demo there.
 */
const useRouteGate = ({ page, param, routeKey }) => {
  const [timedOutKey, setTimedOutKey] = useShellState(null);
  const [waitedOutKey, setWaitedOutKey] = useShellState(null);
  const [readyTick, setReadyTick] = useShellState(0);

  const arm = () => {
    if (routeReady(page, param)) return undefined;
    // The wait for a band beside the page counts from the page's own surface landing, not from arriving: a slow own
    // read that used the whole wait would draw the page the moment it landed, and the band would still push it down.
    let w = null;
    const armWait = () => {
      if (w === null && routeReady(page, param, true)) w = setTimeout(() => setWaitedOutKey(routeKey), window.__routeWaitMs || 3000);
    };
    // Re-render when this route's readiness changes, and only then; the render below reads the truth. Any surface's
    // status moving told this, and each notice drew the shell again whatever it was about.
    const readiness = () => `${routeReady(page, param)}|${routeReady(page, param, true)}|${routeFailed(page, param)}`;
    let was = readiness();
    const off = window.__onSurfaceReady ? window.__onSurfaceReady(() => {
      const now = readiness();
      if (now !== was) { was = now; setReadyTick((n) => n + 1); }
      armWait();
    }) : null;
    armWait();
    // Never strand the operator on the reading pane forever — but time out INTO the
    // unavailable pane, never into the mockup's seeds.
    const t = setTimeout(() => setTimedOutKey(routeKey), 8000);
    return () => { if (off) off(); clearTimeout(t); if (w !== null) clearTimeout(w); };
  };

  // Derived every render, so a navigation can never commit the previous
  // route's answer. readyTick is read so the subscription re-evaluates it.
  void readyTick;
  const routeTimedOut = timedOutKey === routeKey;
  const routeWaitedOut = waitedOutKey === routeKey;
  // A band the page waits for beside its own surface (Today's setup, above its queue) holds the first draw so it never
  // lands above content already drawn; once the page's own surface is in, only for so long.
  const surfaceReady = routeReady(page, param) || (routeWaitedOut && routeReady(page, param, true));
  const surfaceUnavailable = !surfaceReady && (routeFailed(page, param) || routeTimedOut);
  const routeLoading = !surfaceReady && !surfaceUnavailable;
  const demoGated = !window.__DEMO_MODE
    && window.__surfaceState && window.__surfaceState(page, param) === "demo";
  return { demoGated, routeLoading, surfaceUnavailable, arm, setReadyTick };
};

/**
 * The shell's two ways of moving. A navigation is a new entry. `{ replace: true }` is a page saying the same place
 * more exactly -- the lead a peek walked on to -- so it makes none, and no one else is told (a listener hears a page
 * arrive, not a page say where it stands); the route is read here, at once. The last entry this shell pushed and the
 * route it was pushed from, so a page's own Back can return where the member was rather than push a place of its own.
 * Kept here, never in history.state: Next's router reloads the whole app on a Back to an entry whose state it did not
 * write (app-router.js onPopState), and a state-only replaceState is one it never re-marks.
 */
// One page, whatever its tab: `clients/<id>` and `clients/<id>/history` are one person (0052, a person's tabs are addresses).
const shellSamePage = (a, b) => String(a).split("/").slice(0, 2).join("/") === String(b).split("/").slice(0, 2).join("/");
const useShellNavigate = (setRoute) => {
  const lastPush = React.useRef(null);
  const navigate = useShellCallback((to, opts) => {
    if (opts && opts.replace) {
      // A replaced entry is the same entry: a person's page stepping to the next person (0052) keeps Back to the list.
      const p = lastPush.current;
      if (p && shellSamePage(p.to, window.CHANLY.address.route())) p.to = to;
      window.CHANLY.address.go(to, { replace: true, quiet: true });
      setRoute(parseRoute());
      return;
    }
    lastPush.current = { to, from: window.CHANLY.address.route() };
    window.CHANLY.address.go(to);
  }, []);
  // A person's Back: the People view (a list, a segment, Leads) this profile was opened from, by the browser's own
  // Back, so its place comes with it. It pushed plain People, and the list the member was working through was gone.
  // Reached any other way -- a link, a reload, another page's door, Back from somewhere else -- it is People itself.
  const backToPeople = useShellCallback(() => {
    const p = lastPush.current;
    if (p && shellSamePage(p.to, window.CHANLY.address.route()) && /^clients(?:$|[/:])/.test(p.from) && window.history && window.history.back) window.history.back();
    else navigate("clients");
  }, [navigate]);
  return { navigate, backToPeople };
};

/**
 * The address, followed: its route, the phone's keyboard, the old list route, and a person's crumb once People lands.
 * `follows`: the shell hears the address itself only where nobody hands it the route (the standalone mockup, a test);
 * in the app the route is the router's (ChanlyticsApp's `routeNow`).
 */
const useShellRouting = ({ route, setRoute, setReadyTick, follows }) => {
  useShellEffect(() => (follows ? window.CHANLY.address.hear(() => setRoute(parseRoute())) : undefined), [follows]);
  // What a phone's keyboard covers, as --kb, for Ask's screen and every sheet (data-bits watchKeyboard).
  useShellEffect(() => (window.watchKeyboard ? window.watchKeyboard() : undefined), []);
  // A list's own route (`segments/<id>`) is People with that list picked on a real workspace: its App Router page replaces
  // the address once People says which list an id names (surfaces/people/lists-route.tsx), and a demo keeps the seeded page.
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
};

/** The shell's keys: ⌘K opens Ask; ⌘B folds the sidebar to a rail on a desk (the phone has a drawer); ⌘1–9 switch workspaces. */
const useShellKeys = ({ setAskOpen, sidebar, onSidebar }) => {
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
};

/**
 * The phone's drawer: whether it is open, and its flows. Escape closes, body scroll locks while open, and a resize past
 * the breakpoint clears the drawer state. `React.useState`, not the file's alias: the lint knows that setter is stable.
 */
const useNavDrawer = () => {
  const [navOpen, setNavOpen] = React.useState(false);
  // Inside the native shell (legacy-bridge/app-bridge.ts): the More tab asks for the drawer, a re-tap for the top.
  useShellEffect(() => {
    const onMenu = () => setNavOpen(true);
    const onTop = pageToTop;
    window.addEventListener("shell:menu", onMenu);
    window.addEventListener("shell:top", onTop);
    return () => { window.removeEventListener("shell:menu", onMenu); window.removeEventListener("shell:top", onTop); };
  }, []);
  useShellEffect(() => {
    if (!navOpen) return;
    // The pages only the drawer leads to (the tab bar holds the other four) are reached for as it opens, a beat before a
    // thumb picks one: their pages warmed, and what Reports reads only when drawn begun (workspace.ts addressApi warm).
    const a = window.CHANLY && window.CHANLY.address;
    if (a && a.warm) DRAWER_ONLY.forEach((route) => a.warm(route));
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
  return { navOpen, setNavOpen };
};

/**
 * Retired surfaces and moved panes (retiredTo, resolved with the route). A real workspace lands where the page is
 * now; a demo keeps a retired page only while the mockup still HAS it (the Deal board). `/leads` has no row of its
 * own any more, so without the move the demo would fall through to Not found for a page that is only somewhere else.
 * And a soon/ link to a page that has shipped: the address becomes the page's own, in place, so Back does not land
 * on the old link again.
 */
const useRouteMoves = ({ retiredTo, soonState, raw }) => {
  useShellEffect(() => {
    // Replaced, so Back never lands on an address that only moves again.
    if (retiredTo) window.CHANLY.address.go(retiredTo, { replace: true });
  }, [retiredTo]);
  useShellEffect(() => {
    if (soonState === "real") window.CHANLY.address.go(raw.param, { replace: true });
  }, [soonState, raw.param]);
};

/**
 * The tab says where this is, most particular first, and counts what needs you (contracts chrome.ts pageTitle):
 * named from the crumbs the top bar draws, after the honesty gate has had its say, so the two cannot differ.
 * Kept, not only written: the layout's own title can land after this, and a page loaded cold went back to
 * "Chanlytics OS" until something it counted changed (shell.ts keepTitle).
 */
const useTabTitle = (crumbs, inboxNeeds) => {
  const tabTitle = window.__chrome && window.__chrome.title ? window.__chrome.title(crumbs, inboxNeeds) : null;
  useShellEffect(() => {
    if (!tabTitle) return undefined;
    if (window.__shell && window.__shell.keepTitle) return window.__shell.keepTitle(tabTitle);
    document.title = tabTitle;
    return undefined;
  }, [tabTitle]);
};

/**
 * Where a person is taken to the page: its first heading, else the page region itself (the `main` landmark, focusable so
 * it can hold focus). `always` for the skip link, which is asked for; otherwise never from where the person is already
 * working inside the page (a field they are typing in, the row the arrows walk).
 */
const focusPage = (always) => {
  const main = document.getElementById ? document.getElementById("main") : null;
  if (!main) return;
  const at = document.activeElement;
  if (!always && at && at !== document.body && main.contains(at)) return;
  const heading = main.querySelector('h1, h2, [role="heading"]');
  const target = heading || main;
  if (target.getAttribute("tabindex") === null) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
};

/**
 * A move to another page moves focus to it, as a page load does: a hash route never loads a page, so a keyboard and a
 * screen reader were left on the link pressed in the sidebar, and read nothing of where they had gone. Once the page has
 * drawn (the reading pane is not the page), and not for the first page the tab opened on. A move within a page -- a thread
 * opened in the Inbox, a peek, a pane -- changes the address and not the page: the page is not read out again.
 */
const usePageFocus = (page, routeLoading) => {
  const handled = useShellRef(null);
  useShellEffect(() => {
    if (routeLoading || handled.current === page) return;
    const first = handled.current === null;
    handled.current = page;
    if (!first) focusPage(false);
  }, [page, routeLoading, handled]);
};

/**
 * How the route view comes in. A move between two views of one strip -- the Inbox's Needs you to Conversations, People
 * to Leads or the Pipeline -- arrives from the side its tab stands on, by the deck every change of view moves by (the
 * kit's viewDeck, surfaces/kit/motion/view-deck.ts): the view says which side (`data-slide`), and the deck brings it in
 * on the timeline of the page it replaced, the same on a desk and a phone, tapped or swiped. A phone had a slide of its
 * own for this and a desk a fade, each begun as the view mounted, whatever the page before it was doing (8 Oct 2026).
 * A view that follows another of the same family and is no strip's move (one person's page to the next) draws at once;
 * a page landing where the reading pane stood, or arriving from somewhere else, fades in (components.css route-in). A
 * person's profile is somewhere else, though its route starts with the list's word.
 * A place the phone's tab bar moved to is cut in, drawn at once with no fade, as a phone's tab bar opens a place (its
 * press says so in `placed`, the moment it asked); a place still reading when it lands fades in as any page does.
 * Decided as the view changes, in the draw that mounts it, and kept for that view's life: decided after the mount
 * (an effect, a state) it re-drew the same element with the class, which cancelled the fade on every page one
 * frame in. `mountKey` is what the view is mounted under, the route table's answer (drawRoute).
 */
const useViewFade = ({ page, param }, mountKey, routeLoading, placed) => {
  const viewKey = routeLoading ? `${mountKey}/reading` : mountKey;
  const family = page === "clients" && param && !/^(leads(:|$)|pipeline(:|$)|seg:|list:|state:)/.test(param) ? "clients/person" : page;
  // Where the view stands on a strip (surface-tabs.jsx stripPlace): a view from the tab beside comes in from its side,
  // whether the tab was tapped or the page swiped, never after a reading pane.
  const place = window.stripPlace ? window.stripPlace(page, param) : null;
  const viewRef = useShellRef({ key: null, family: null, reading: false, stay: false, place: null, slide: null });
  if (viewRef.current.key !== viewKey) {
    const prev = viewRef.current;
    const slide = prev.key !== null && !prev.reading && window.stripSlide ? window.stripSlide(prev.place, place) : null;
    // The tab bar's move, taken by the first view to arrive after it, if it arrived while the move is still the last ask.
    const cut = placed.current !== null && performance.now() - placed.current < PLACE_CUT_MS;
    placed.current = null;
    viewRef.current = {
      key: viewKey,
      family,
      reading: routeLoading,
      place,
      stay: !routeLoading && prev.key !== null && ((prev.family === family && !prev.reading) || cut) && !slide,
      slide,
    };
  }
  return { viewKey, routeStay: viewRef.current.stay, routeSlide: viewRef.current.slide, routeStrip: place ? place.strip : null };
};

// ---- The chrome ---------------------------------------------------------------
// Plain functions, not components: each returns the elements ChanlyticsApp always returned, so a page's state and its
// mount are exactly where they were.

// Shared read-only viewer — chrome-less, rendered AFTER all hooks so the
// hook order stays identical on every route (no early return between hooks).
// Demo-gated like everything else: outside a demo, this URL renders the
// normal chrome with the ComingSoon pane the interception chose,
// instead of "Serenity Spa — Reports · expires in 7 days" over invented
// numbers, ungated, in production.
// The report it shows is the frame's `sharedPage`, drawn by the bridge (LegacyApp): Reports has left the shell, and a page
// of the shell does not name it. The standalone mockup has no bridge, so there the viewer is its banner alone.
const sharedViewer = ({ theme, look, navigate, sharedPage }) => (
  <div className="shared-root" data-theme={theme} data-look={look}>
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
      {sharedPage}
    </div>
  </div>
);

// The first run: full screen, the shell's chrome set aside, after all hooks as the shared viewer is. Its page is an App
// Router page (surfaces/setup/first-run/, the layout's children: `routePage`). Ask is the one piece of the chrome it
// keeps: ⌘K opens the Line over the step, on the start surface (Ask Rewired, Phase 7). No door is drawn for it here; the
// first run draws no chrome, and no key is drawn outside the ? sheet.
const firstRunScreen = ({ theme, look, routePage, askOpen, setAskOpen }) => (
  <div className="fr-shell" data-theme={theme} data-look={look}>
    {routePage}
    <AskBar open={askOpen} onClose={() => setAskOpen(false)} />
  </div>
);

/** The app's chrome around the route view: the sidebar (a drawer on a phone), the top bar, the two bars, the strip, the page, the phone's tabs and ✦, and the sheets. */
/**
 * The frame's places for the kit's head in Glass (pg-head and pg-act, with the row of views between them; the kit draws
 * into them, surfaces/kit/head/frame-head.tsx): over the page where the page is a pane that scrolls inside itself, and
 * at the top of the page's own scroll where the page scrolls (Today), so the name and its sentence go up with the page
 * and only the top bar stays (Ruben, 1 Oct 2026: the greeting stood still over a page that moved). Classic draws the
 * row of views alone, over the page. Called twice, once for each place; one draws, the other draws nothing. The slot
 * says whose views it holds where the page says its own (`data-strip`, the chrome's `views.name`), so the frame's
 * stylesheet knows Reports' row at first paint, before the page under it has drawn (components.css, the phone block).
 */
const glassHead = ({ glass, pane, where, page, param, views, navigate, primaryAction }) => {
  if (!glass) return where === "over" ? <SurfaceTabs page={page} param={param} views={views} onNavigate={navigate} /> : null;
  if ((where === "over") !== pane) return null;
  return (
    <div className="pg-slot" data-strip={views && views.tabs.length > 1 ? views.name : undefined}>
      <div className="pg-head-slot" id="pg-head" />
      <SurfaceTabs page={page} param={param} views={views} onNavigate={navigate} />
      <div className="pg-act-slot">
        <span id="pg-act" />
        {primaryAction}
      </div>
    </div>
  );
};

const appChrome = (s) => {
  const { theme, themePref, onTheme, look, onLook, sidebar, onSidebar, navOpen, setNavOpen, askOpen, setAskOpen, openAsk, inboxNeeds, navigate, onPlace, PhoneFace } = s;
  const { page, param, views, activeNav, crumbs, pane, primaryAction, content, viewKey, routeStay, routeSlide, routeStrip, routeLoading, surfaceUnavailable, ask } = s;
  const glass = look === "glass";
  return (
    <div className="app-root" data-theme={theme} data-look={look}>
      {/* The first stop for Tab: a way past the sidebar and the bars to the page (drawn only while it has focus). */}
      <button type="button" className="skip-link" onClick={() => focusPage(true)}>Skip to the page</button>
      {/* Glass's three pools of light, a layer each, which a desk drifts by a transform (components.css .pg-light). */}
      {glass && <div className="pg-light" aria-hidden="true"><span /><span /><span /></div>}
      {/* On a phone the sidebar is a drawer. Open, it is a dialog, so a page's keys hold still behind it (People's Esc
          cleared its selection as the drawer closed). Not aria-modal: it does not move focus into itself. */}
      <div className={`side-wrap ${navOpen ? "open" : ""} ${sidebar === "rail" ? "rail" : ""}`} role={navOpen ? "dialog" : undefined} aria-label={navOpen ? "Navigation" : undefined} onPointerOver={sideWarm}>
        {/* The wash stands just before the drawer, where a thumb sliding the drawer away finds it to fade (data-bits
            touchSwipe). */}
        {navOpen && <div className="nav-backdrop" role="presentation" onClick={() => setNavOpen(false)} />}
        <Sidebar
          active={activeNav}
          badges={{ inbox: inboxNeeds > 0 ? String(inboxNeeds) : null }}
          onNavigate={(id) => { setNavOpen(false); navigate(NAV_ROUTE[id] || (id.includes("/") ? id : `soon/${id}`)); }}
          onClose={() => setNavOpen(false)}
          collapsed={sidebar === "rail"}
          onToggleCollapse={() => onSidebar(sidebar === "rail" ? "open" : "rail")}
          themePref={themePref}
          onTheme={onTheme}
          look={look}
          onLook={onLook}
        />
      </div>
      <div className="main">
        {/* What stands over the page: no box on a desk; on a phone the one fixed over it as the window scrolls (mobile.css,
            "The window scrolls"; its height is kit/head/frame-top.ts's to measure). */}
        <div className="frame-top">
          {/* In Glass the top bar's row holds the date and time where the crumbs were (a place laid over the bar's left,
              so the bar itself is as it was), and the page's act moves down to the row of views: the frame leaves the
              places (pg-dateline, pg-head, pg-act) and the kit's head draws into them (surfaces/kit/head/frame-head.tsx,
              the interface kit's step 5.4). Classic's tree is as it was. */}
          {glass && <span className="pg-dateline-slot" id="pg-dateline" />}
          <Topbar
            crumbs={glass ? [] : crumbs}
            theme={theme}
            themePref={themePref}
            onTheme={onTheme}
            onAsk={askOpen ? () => setAskOpen(false) : openAsk /* open, it closes, as ⌘K does */}
            askLabel={ask || null}
            onMenu={() => setNavOpen(true)}
            right={glass ? null : primaryAction}
          />
          {/* A call happening right now outranks a newer build or a stale surface:
              it is the one thing on this line that stops being true by itself. */}
          <LiveCallBar />
          <ShellStatusBar />
          {glassHead({ glass, pane, where: "over", page, param, views, navigate, primaryAction })}
        </div>
        {/* The view is the deck's to move: it registers as it mounts and says which side it arrives from. On a phone a
            swipe across it walks the strip over it (surface-tabs.jsx stripSwipe). */}
        <main
          id="main"
          key={viewKey}
          ref={window.viewDeck ? window.viewDeck.view("frame") : undefined}
          className={`main-scroll route-view ${pane ? "pane" : ""} ${routeStay ? "route-stay" : ""}`}
          data-strip={routeStrip || undefined}
          data-slide={routeSlide || undefined}
          aria-busy={routeLoading ? "true" : undefined}
          {...(window.stripSwipe ? window.stripSwipe() : {})}
        >
          {glassHead({ glass, pane, where: "inside", page, param, views, navigate, primaryAction })}
          <ShellErrorBoundary>
            {routeLoading
              ? <div className="route-reading" role="status">Reading…</div>
              : surfaceUnavailable
                ? <SurfaceUnavailable onNavigate={navigate} />
                : content}
          </ShellErrorBoundary>
        </main>
        {/* Inside the app the native tab bar stands here (window.__IN_APP, stamped before paint). */}
        {!window.__IN_APP && (
          <PhoneTabs page={page} param={param} inboxNeeds={inboxNeeds} onNavigate={navigate} onMenu={() => setNavOpen(true)} onPlace={onPlace} />
        )}
        {!askOpen && !navOpen && (
          <button type="button" className="phone-ask" onClick={openAsk} aria-label="Ask Chanlytics" title="Ask Chanlytics" data-testid="phone-ask">
            {/* the disc (ask-face.jsx AskDisc; its usage dot on the rim waits for a usage surface), the three over it on the same surface */}
            {window.AskDisc ? <window.AskDisc testId="phone-ask-disc" /> : null}
            {PhoneFace
              ? <PhoneFace className="phone-ask-face" ground="raised" side={14} testId="phone-ask-face" />
              : <Icon name="sparkle" size={20} />}
          </button>
        )}
      </div>

      <AskBar open={askOpen} onClose={() => setAskOpen(false)} />
      <ShortcutsSheet />
      {/* The one deal sheet (0008), opened from anywhere by window.openDealSheet: the person's card, the thread. */}
      {window.DealSheetHost ? <window.DealSheetHost /> : null}
      {/* And the one step sheet (0007, amended), opened by window.openStepSheet: a deal's next step, set or changed. */}
      {window.StepSheetHost ? <window.StepSheetHost /> : null}
    </div>
  );
};

// ---- Shell -------------------------------------------------------------
// The hooks below are called in the order the shell always called them, so its effects run in the order they always did.
// The look is stamped beside the theme on every root that carries the theme (the interface kit's §3.2), so a rule that
// asks for both -- a look's dark side is [data-look][data-theme="dark"] -- matches wherever the theme's own rules do.
// `routePage` is the page of a route that has left the shell (an App Router page, drawn by the layout's children) and
// `surfaceRoutes` says how the frame wraps it (src/surfaces/routes.ts); `sharedPage` is the shared viewer's report.
// `routeNow` is the route of the router's pathname, which the bridge hands the frame (LegacyHost), the same the pages
// read: the frame and the page move in one render, the router's, so a move is drawn once, in the background, and the
// press that asked for it answers first. The frame heard the address itself before, at once, while the page heard the
// router a beat later: People's view remounted with the scope it was leaving, and every Inbox tab drew its page twice.
// Without it (the standalone mockup, a test) the frame hears the address, as it always did.
const ChanlyticsApp = ({ theme, themePref = theme, onTheme, look, onLook, sidebar = "open", onSidebar = () => {}, inboxDensity, showInboxAgentRail, routePage = null, surfaceRoutes = null, sharedPage = null, routeNow = null, fillDoors = null }) => {
  const [heard, setRoute] = useShellState(parseRoute());
  const route = routeNow !== null ? routeParts(routeNow) : heard;
  const [askOpen, setAskOpen] = useShellState(false);
  const inboxNeeds = useInboxNeeds();
  const at = routeAt(route);
  const { page, param } = at;
  // Drawn again when a surface the route on screen is drawn from moves (who is looking, its own, what it draws beside
  // it: surface-registry.ts routeSurfaces), and not for any other surface's read. The pages hear their own.
  useSurface({ page, param });
  const gate = useRouteGate(at);
  const { demoGated } = gate;
  const { navigate, backToPeople } = useShellNavigate(setRoute);
  const openAsk = useShellCallback(() => setAskOpen(true), []);
  // The phone's ✦ is Ask's face too (components/ask-face.jsx), drawn on the button's coral; the sparkle where the three
  // are not loaded.
  const PhoneFace = window.AskFace || null;

  // The doors every page uses (surfaces/frame-doors.ts), filled before the pages under this draw: the frame's own move, its
  // Ask, and a person's Back to the People view they were opened from (A person's page, an App Router page in
  // surfaces/people/person, takes it from the frame, which knows that view). The bridge hands the frame the filler as
  // `fillDoors`, and publishes the names the pages that have not moved read (seed-globals.ts). Without a bridge (the
  // standalone mockup, a test) the frame publishes them itself, as it always did.
  if (fillDoors) fillDoors({ navigate, openAsk, backToPeople });
  else Object.assign(window, { appNavigate: navigate, appAsk: openAsk, appBackToPeople: backToPeople });

  useShellRouting({ route, setRoute, setReadyTick: gate.setReadyTick, follows: routeNow === null });
  useShellKeys({ setAskOpen, sidebar, onSidebar });
  const { navOpen, setNavOpen } = useNavDrawer();

  // The route table's answer (app-routes.jsx, published on window as every shell file's names are), the honesty gate applied.
  const drawn = window.drawRoute({ ...at, demoGated, navigate, openAsk, backToPeople, inboxDensity, showInboxAgentRail, routePage, surfaceRoutes });

  useRouteMoves(at);
  useTabTitle(drawn.crumbs, inboxNeeds);
  // The crumbs, told to the head Glass draws in the frame's places (the bridge's, absent in the standalone mockup). Leads is
  // a scope of People, picked in the page's own strip (People | Leads), so its head is People's, as its canvas draws it;
  // Conversations and Live are tabs of the Inbox's family (SurfaceTabs ST_GROUPS.inbox), picked in the strip under the
  // head, so each keeps its own name and no way back above it, as a tab has none.
  const leadsScope = page === "clients" && !!param && /^leads(:|$)/.test(param);
  const familyTab = page === "conversations" || page === "live";
  React.useEffect(() => {
    if (look === "glass" && window.__chrome && window.__chrome.crumbsShown)
      window.__chrome.crumbsShown(leadsScope ? drawn.crumbs.slice(0, -1) : familyTab ? drawn.crumbs.slice(-1) : drawn.crumbs);
  }, [drawn.crumbs, look, leadsScope, familyTab]);
  // A route change: the drawer closes, and the gate's clocks start for the new route.
  useShellEffect(() => { setNavOpen(false); return gate.arm(); }, [at.routeKey]);
  // When the tab bar last asked for a place (PhoneTabs `onPlace`): the view that arrives for it is cut in.
  const placed = useShellRef(null);
  const onPlace = useShellCallback(() => { placed.current = performance.now(); }, [placed]);
  const fade = useViewFade(at, drawn.mountKey, gate.routeLoading, placed);
  usePageFocus(page, gate.routeLoading);
  // The shell is mounted and listening (useNavDrawer above): the native app's bridge replays a menu ask that arrived
  // while this was still compiling (legacy-bridge/app-bridge.ts). After the route effect, so the first route's close
  // runs before the replayed open.
  useShellEffect(() => { window.dispatchEvent(new CustomEvent("shell:ready")); }, []);

  // The two full-screen pages, after all hooks so the hook order stays identical on every route.
  if (page === "shared" && !demoGated) return sharedViewer({ theme, look, navigate, sharedPage });
  if (page === "start" && !demoGated && routePage) return firstRunScreen({ theme, look, routePage, askOpen, setAskOpen });

  return appChrome({
    theme, themePref, onTheme, look, onLook, sidebar, onSidebar, navOpen, setNavOpen, askOpen, setAskOpen, openAsk, inboxNeeds, navigate, onPlace, PhoneFace,
    page, param, ...drawn, ...fade, routeLoading: gate.routeLoading, surfaceUnavailable: gate.surfaceUnavailable,
  });
};

// `useSurface` is the bridge's (seed-globals.ts, before any file here loads); where there is no bridge (the standalone
// mockup) nothing is read again, so nothing moves, and this stand-in answers nothing new.
const useSurfaceStill = () => 0;
Object.assign(window, { ChanlyticsApp, useSurface: window.useSurface || useSurfaceStill });
