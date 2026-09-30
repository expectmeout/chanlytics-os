/* global React, Icon, AskBar, Sidebar, Topbar, ShellStatusBar, LiveCallBar, SurfaceTabs, ShortcutsSheet, ReportsPage, FailedRead */
// Chanlytics — App Shell
// The live product frame: hash routing, sidebar click-throughs, page transitions,
// global Ask Chanlytics (⌘K), and intentional landings for unbuilt surfaces.
// What each route draws is the route table's (app-routes.jsx SHELL_ROUTES, read through drawRoute); this file
// resolves the address, holds the gates and the hooks, and draws the chrome around the table's answer.
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
const parseHash = () => {
  const raw = (window.location.hash || "#/today").replace(/^#\/?/, "");
  const [page, param] = raw.split("/");
  return { page: page || "today", param: param || null };
};

/**
 * The route an address opens, resolved for the table and the gates: `page` and `param` as drawn, `raw` as written,
 * the soon/ answer, where a retired address lands and the gate's key. What its view is mounted under is the table's
 * (app-routes.jsx, a row's `mount`), in drawRoute's answer.
 *
 * soon/<surface> was the landing for a page not built yet, and an old link, a bookmark or a bell row can still name
 * one that has since shipped. The registry decides what it opens, like every other route: a page it lists as real
 * opens, a demo page keeps its landing, and a name it does not know is not found (the wiring audit's N16:
 * #/soon/calendar said the Calendar was not in this release). The standalone mockup has no registry and keeps every
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

// ---- Error state --------------------------------------------------------
class ShellErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  // Said, not only drawn: the bridge's host hears this and sends it to the server (src/client/client-error.ts).
  componentDidCatch(e) {
    try {
      window.dispatchEvent(new CustomEvent("chanlytics:shell-error", { detail: { error: e, page: (window.location.hash || "").replace(/^#\/?/, "") } }));
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
          <button className="btn btn-sm" onClick={() => { window.location.hash = "/today"; }}>
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

// ---- The shell's hooks ----------------------------------------------------
// Each holds one concern of ChanlyticsApp, and the state its effects set (the drawer's is useNavDrawer's), called in
// the order the shell always called these hooks, so the effects run in the order they always ran.

/** What needs you, for the sidebar's and the phone bar's count: from the threads at the first draw, then the Inbox's own count. */
const useInboxNeeds = () => {
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
  return inboxNeeds;
};

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
    // Re-render when readiness changes; the render below reads the truth.
    const off = window.__onSurfaceReady ? window.__onSurfaceReady(() => { setReadyTick((n) => n + 1); armWait(); }) : null;
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
 * more exactly -- the lead a peek walked on to -- so it makes none; replaceState fires no hashchange, so the route is
 * read here, at once. The last entry this shell pushed and the address it was pushed from, so a page's own Back can
 * return where the member was rather than push a place of its own. Kept here, never in history.state: Next's router
 * reloads the whole app on a Back to an entry whose state it did not write (app-router.js onPopState), and a
 * state-only replaceState is one it never re-marks.
 */
const useShellNavigate = (setRoute) => {
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
  return { navigate, backToPeople };
};

/** The address, followed: the hash, the phone's keyboard, the old list route, and a person's crumb once People lands. */
const useShellRouting = ({ route, setRoute, setReadyTick }) => {
  useShellEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  // What a phone's keyboard covers, as --kb, for Ask's screen and every sheet (data-bits watchKeyboard).
  useShellEffect(() => (window.watchKeyboard ? window.watchKeyboard() : undefined), []);
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
    const onTop = () => { const el = document.querySelector(".main-scroll"); if (el) el.scrollTo({ top: 0, behavior: "smooth" }); };
    window.addEventListener("shell:menu", onMenu);
    window.addEventListener("shell:top", onTop);
    return () => { window.removeEventListener("shell:menu", onMenu); window.removeEventListener("shell:top", onTop); };
  }, []);
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
  return { navOpen, setNavOpen };
};

/**
 * Retired surfaces and moved panes (retiredTo, resolved with the route). A real workspace lands where the page is
 * now; a demo keeps a retired page only while the mockup still HAS it (the Deal board). `#/leads` has no row of its
 * own any more, so without the move the demo would fall through to Not found for a page that is only somewhere else.
 * And a soon/ link to a page that has shipped: the address becomes the page's own, in place, so Back does not land
 * on the old link again.
 */
const useRouteMoves = ({ retiredTo, soonState, raw }) => {
  useShellEffect(() => {
    // Replaced, so Back never lands on an address that only moves again.
    if (retiredTo) window.location.replace("#/" + retiredTo);
  }, [retiredTo]);
  useShellEffect(() => {
    if (soonState === "real") window.location.replace("#/" + raw.param);
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
 * How the route view comes in. A move that stays on the page -- People to Leads or the Pipeline and back -- is still
 * a remount (each scope is a mount of its own), and the route fade played on every one, on top of the rows' own
 * draw: the switch read as a wait. The fade is for arriving somewhere else, and for a page landing where the reading
 * pane stood; a view that follows another of the same page draws at once. A person's profile is somewhere else,
 * though its route starts with the list's word.
 * Decided as the view changes, in the draw that mounts it, and kept for that view's life: decided after the mount
 * (an effect, a state) it re-drew the same element with the class, which cancelled the fade on every page one
 * frame in. `mountKey` is what the view is mounted under, the route table's answer (drawRoute).
 */
const useViewFade = ({ page, param }, mountKey, routeLoading) => {
  const viewKey = routeLoading ? `${mountKey}/reading` : mountKey;
  const family = page === "clients" && param && !/^(leads(:|$)|pipeline(:|$)|seg:|list:|state:)/.test(param) ? "clients/person" : page;
  // Where the view stands on a strip (surface-tabs.jsx stripPlace): a view from the tab beside comes in from its side on
  // a phone, whether the tab was tapped or the page swiped (components.css route-slide-*), never after a reading pane.
  const place = window.stripPlace ? window.stripPlace(page, param) : null;
  const viewRef = useShellRef({ key: null, family: null, reading: false, stay: false, place: null, slide: null });
  if (viewRef.current.key !== viewKey) {
    const prev = viewRef.current;
    viewRef.current = {
      key: viewKey,
      family,
      reading: routeLoading,
      place,
      stay: !routeLoading && prev.key !== null && prev.family === family && !prev.reading,
      slide: prev.key !== null && !prev.reading && window.stripSlide ? window.stripSlide(prev.place, place) : null,
    };
  }
  return { viewKey, routeStay: viewRef.current.stay, routeSlide: viewRef.current.slide };
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
const sharedViewer = ({ theme, look, navigate }) => (
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
      <ReportsPage />
    </div>
  </div>
);

// The first run: full screen, the shell's chrome set aside, after all hooks as the shared viewer is (first-run.jsx). Ask
// is the one piece of the chrome it keeps: ⌘K opens the Line over the step, on the start surface (Ask Rewired, Phase 7).
// No door is drawn for it here; the first run draws no chrome, and no key is drawn outside the ? sheet.
const firstRunScreen = ({ theme, look, param, navigate, askOpen, setAskOpen }) => (
  <div className="fr-shell" data-theme={theme} data-look={look}>
    <window.FirstRun param={param} onNavigate={navigate} />
    <AskBar open={askOpen} onClose={() => setAskOpen(false)} />
  </div>
);

/** The app's chrome around the route view: the sidebar (a drawer on a phone), the top bar, the two bars, the strip, the page, the phone's tabs and ✦, and the sheets. */
const appChrome = (s) => {
  const { theme, themePref, onTheme, look, onLook, sidebar, onSidebar, navOpen, setNavOpen, askOpen, setAskOpen, openAsk, inboxNeeds, navigate, PhoneFace } = s;
  const { page, param, activeNav, crumbs, pane, primaryAction, content, viewKey, routeStay, routeSlide, routeLoading, surfaceUnavailable } = s;
  return (
    <div className="app-root" data-theme={theme} data-look={look}>
      {/* On a phone the sidebar is a drawer. Open, it is a dialog, so a page's keys hold still behind it (People's Esc
          cleared its selection as the drawer closed). Not aria-modal: it does not move focus into itself. */}
      <div className={`side-wrap ${navOpen ? "open" : ""} ${sidebar === "rail" ? "rail" : ""}`} role={navOpen ? "dialog" : undefined} aria-label={navOpen ? "Navigation" : undefined}>
        {/* The wash stands just before the drawer, where a thumb sliding the drawer away finds it to fade (data-bits
            touchSwipe). */}
        {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
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
        {/* On a phone a swipe across the page walks the strip over it (surface-tabs.jsx stripSwipe). */}
        <div
          key={viewKey}
          className={`main-scroll route-view ${pane ? "pane" : ""} ${routeStay ? "route-stay" : ""} ${routeSlide ? `route-slide-${routeSlide}` : ""}`}
          aria-busy={routeLoading ? "true" : undefined}
          {...(window.stripSwipe ? window.stripSwipe() : {})}
        >
          <ShellErrorBoundary>
            {routeLoading
              ? <div className="route-reading" role="status">Reading…</div>
              : surfaceUnavailable
                ? <SurfaceUnavailable onNavigate={navigate} />
                : content}
          </ShellErrorBoundary>
        </div>
        {/* Inside the app the native tab bar stands here (window.__IN_APP, stamped before paint). */}
        {!window.__IN_APP && (
          <PhoneTabs page={page} inboxNeeds={inboxNeeds} onNavigate={navigate} onMenu={() => setNavOpen(true)} />
        )}
        {!askOpen && !navOpen && (
          <button type="button" className="phone-ask" onClick={openAsk} aria-label="Ask Chanlytics" title="Ask Chanlytics" data-testid="phone-ask">
            {/* the disc with its state dot on the rim (ask-face.jsx AskDisc), the three over it on the same surface */}
            {window.AskDisc ? <window.AskDisc testId="phone-ask-disc" /> : null}
            {PhoneFace
              ? <PhoneFace className="phone-ask-face" ground="raised" side={12.5} testId="phone-ask-face" />
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
const ChanlyticsApp = ({ theme, themePref = theme, onTheme, look, onLook, sidebar = "open", onSidebar = () => {}, inboxDensity, showInboxAgentRail }) => {
  const [route, setRoute] = useShellState(parseHash());
  const [askOpen, setAskOpen] = useShellState(false);
  const inboxNeeds = useInboxNeeds();
  const at = routeAt(route);
  const { page, param } = at;
  const gate = useRouteGate(at);
  const { demoGated } = gate;
  const { navigate, backToPeople } = useShellNavigate(setRoute);
  const openAsk = useShellCallback(() => setAskOpen(true), []);
  // The phone's ✦ is Ask's face too (components/ask-face.jsx), drawn on the button's coral; the sparkle where the three
  // are not loaded.
  const PhoneFace = window.AskFace || null;

  // Expose for deep components (fleet cards, command rows) without prop-drilling
  window.appNavigate = navigate;
  window.appAsk = openAsk;

  useShellRouting({ route, setRoute, setReadyTick: gate.setReadyTick });
  useShellKeys({ setAskOpen, sidebar, onSidebar });
  const { navOpen, setNavOpen } = useNavDrawer();

  // The route table's answer (app-routes.jsx, published on window as every shell file's names are), the honesty gate applied.
  const drawn = window.drawRoute({ ...at, demoGated, navigate, openAsk, backToPeople, inboxDensity, showInboxAgentRail });

  useRouteMoves(at);
  useTabTitle(drawn.crumbs, inboxNeeds);
  // A route change: the drawer closes, and the gate's clocks start for the new route.
  useShellEffect(() => { setNavOpen(false); return gate.arm(); }, [at.routeKey]);
  const fade = useViewFade(at, drawn.mountKey, gate.routeLoading);
  // The shell is mounted and listening (useNavDrawer above): the native app's bridge replays a menu ask that arrived
  // while this was still compiling (legacy-bridge/app-bridge.ts). After the route effect, so the first route's close
  // runs before the replayed open.
  useShellEffect(() => { window.dispatchEvent(new CustomEvent("shell:ready")); }, []);

  // The two full-screen pages, after all hooks so the hook order stays identical on every route.
  if (page === "shared" && !demoGated) return sharedViewer({ theme, look, navigate });
  if (page === "start" && !demoGated && window.FirstRun) return firstRunScreen({ theme, look, param, navigate, askOpen, setAskOpen });

  return appChrome({
    theme, themePref, onTheme, look, onLook, sidebar, onSidebar, navOpen, setNavOpen, askOpen, setAskOpen, openAsk, inboxNeeds, navigate, PhoneFace,
    page, param, ...drawn, ...fade, routeLoading: gate.routeLoading, surfaceUnavailable: gate.surfaceUnavailable,
  });
};

window.ChanlyticsApp = ChanlyticsApp;
