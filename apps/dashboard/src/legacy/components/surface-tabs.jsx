/* global React, ViewTabs */
// Chanlytics — SurfaceTabs
// The nav-collapse layer: merged surfaces (People, Conversations, Campaigns,
// Agents) are VIEWS under one nav item, not places. Rendered by the shell
// above the routed page; all routes stay unchanged so deep links keep working.
// The strip itself is the kit's (surfaces/kit/view-tabs/view-tabs.tsx ViewTabs: its links, its highlight, the press that
// starts the page leaving), as is what moves a view (surfaces/kit/motion/view-deck.ts) and the page a swipe walks
// (surfaces/kit/view-tabs/pager.ts). This is the frame's part of it: which views a route's group has, what each
// counts, their addresses warmed, and where a route stands on its strip.

const ST_GROUPS = {
  people: {
    match: ["clients", "leads", "pipeline", "segments"],
    tabs: [
      { id: "clients", label: "People", to: "clients" },
      // No Leads tab here: Leads is a SCOPE of People (clients/leads), and People | Leads (| Pipeline) is the page's own
      // views (PRD §6.1), said by its chrome (surfaces/people/chrome.ts `views`) and drawn by this strip below, not by this
      // group: a tab here would point at the retired `leads` route and bounce through the redirect.
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
      // None of the three says a tip under a pointer: the names stand alone (Ruben, 8 Oct 2026).
      { id: "inbox", label: "Needs you", to: "inbox", tone: "warn", badge: () => (window.sbNeedsCount ? window.sbNeedsCount() : 0) || null },
      { id: "conversations", label: "Conversations", to: "conversations" },
      // pulse is demo-only: it advertised a call in progress for an invented
      // caller, always on, beside the REAL Conversations tab.
      // With the bridge running the pulse is the real thing: a call in
      // progress under the heartbeat rule. The seeded pulse stays demo-only.
      { id: "live", label: "Live", to: "live", pulse: () => (window.__LIVE
        // The same heartbeat rule the page applies between refreshes, so the
        // tab does not pulse for a phantom the page has already dropped.
        ? window.__LIVE.now.some((c) => window.__chrome.liveStillUp(c, window.__LIVE.heartbeatMs, Date.now()))
        : !!window.__DEMO_MODE && !(window.LM_STORE && window.LM_STORE.isEnded("lc-selena"))) },
    ],
  },
  // Campaigns is one page, its home (surfaces/campaigns/home, canvas A), and Sent (broadcasts) and the Library (messages) are its
  // rooms, reached from it: the three-tab strip (Playbooks · Broadcasts · Templates) is gone (3 Oct 2026). Content is seed-only,
  // a real workspace has no such surface, and a strip of one draws nothing.
  campaigns: {
    match: ["content"],
    tabs: [{ id: "content", label: "Content", to: "content", demoOnly: true }],
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

// What the address says of itself, for the routes a press will move to: warmed once the page is idle and when a pointer
// or a finger reaches a tab, so the move that follows asks the server for nothing (workspace.ts warmRoute).
const stAddress = () => (window.CHANLY && window.CHANLY.address) || null;
const stWarm = (route) => { const a = stAddress(); if (a && a.warm) a.warm(route); };
// A tab is a link, as every door is (data-bits routeDoor): its address the route's, so a middle click, a long press or a
// new tab opens that view; a plain press is the app's own move (the kit's ViewTabs decides which a press is).
const stHref = (route) => { const a = stAddress(); return a && a.href ? a.href(route) : `#/${route}`; };

// `views` is a page that says its own views (surfaces/routes.ts SurfaceViews: People's scopes, Reports' lenses, from its
// chrome): the same strip, drawn here once for every page, whether the views are a group's below or the page's own. A
// page's views are its tabs, the one picked is its own to name, and a view is a move to a route like any tab here.
const SurfaceTabs = ({ page, param, views, onNavigate }) => {
  const [, stBump] = React.useReducer(n => n + 1, 0);
  const own = views && views.tabs.length > 1 ? views : null;
  React.useEffect(() => {
    // inbox:counts too: the Needs-you tab carries the badge, and the count moves
    // when Today publishes the real one or a decision lands.
    const evs = ["live:ended", "surface:live", "inbox:counts", "inbox:decisions", "leads:verdict"];
    evs.forEach(e => window.addEventListener(e, stBump));
    return () => evs.forEach(e => window.removeEventListener(e, stBump));
  }, []);
  const [groupKey, group] = own ? [own.name, null] : Object.entries(ST_GROUPS).find(([, g]) => g.match.includes(page)) || [null, null];
  const tabs = own ? own.tabs : group ? group.tabs.filter(t => !t.demoOnly || window.__DEMO_MODE) : [];
  const warmRoutes = tabs.map((t) => t.to).join(" ");
  React.useEffect(() => {
    const a = stAddress();
    if (warmRoutes && a && a.warmSoon) a.warmSoon(warmRoutes.split(" "));
  }, [groupKey, page, warmRoutes]);
  if (tabs.length < 2) return null;
  // Detail views keep their focus: hide on a person's profile. A list (seg:, list:) and a state (state:) are views of
  // People, and the tabs vanished on the last two (the wiring audit's N24). A page that says its own views says none for one.
  if (!own && page === "clients" && param && !/^(seg|list|state):/.test(param)) return null;
  const routeOf = (id) => { const tab = tabs.find((t) => t.id === id); return tab ? tab.to : id; };
  return (
    <ViewTabs
      name={groupKey}
      label={own ? own.label : "Section views"}
      testid={own ? own.testid : undefined}
      picked={own ? own.picked : page}
      tabs={tabs.map((t) => ({
        id: t.id,
        label: t.label,
        href: stHref(t.to),
        count: t.badge ? t.badge() : null,
        tone: t.tone === "warn" ? "warn" : undefined,
        live: t.pulse ? !!t.pulse() : false,
        tip: t.tip,
        testid: t.testid,
        warm: () => stWarm(t.to),
      }))}
      onPick={(id) => onNavigate(routeOf(id))}
    />
  );
};

// ---- Where a route stands on a strip, and which way a view comes in -----------------------------------------------
// People's scopes are People's own views (its chrome's, drawn by SurfaceTabs above), in plScopes' order; every other strip is a group's here. A
// person's page, and a route no strip carries, stand nowhere, and a view arriving there comes in as any other does.
const stripPlace = (page, param) => {
  if (page === "clients") {
    if (!window.plScopes || !window.plScopeRoute) return null;
    const route = param && /^leads(:|$)/.test(param)
      ? "clients/leads"
      : param && /^pipeline(:|$)/.test(param)
        ? "clients/pipeline"
        : !param || /^(seg|list|state):/.test(param) ? "clients" : null;
    const at = route ? window.plScopes(true).map((s) => window.plScopeRoute(s.id)).indexOf(route) : -1;
    return at < 0 ? null : { strip: "people", at };
  }
  const found = Object.entries(ST_GROUPS).find(([key, g]) => key !== "people" && g.match.includes(page));
  if (!found) return null;
  const at = found[1].tabs.filter((t) => !t.demoOnly || window.__DEMO_MODE).findIndex((t) => t.id === page);
  return at < 0 ? null : { strip: found[0], at };
};
const stripSlide = (from, to) => (from && to && from.strip === to.strip && from.at !== to.at ? (to.at > from.at ? "next" : "prev") : null);

// ---- The strip under a thumb (docs/superpowers/specs/2026-09-25-swipe-between-tabs-design.md) ----------------------
// A swipe across the page walks the strip drawn over it: data-bits' touchSwipe reads the touch and the kit's viewPager
// says what a page is (the tab beside the lit one, pressed at the lift, so a swipe is exactly a tap). A strip is walked
// where the shell is narrow enough for a page of one column (900px), and there only where the page says it travels its
// own width (`--view-travel`: the pager asks the deck), which is every page on a phone and People's to 900px.
const stripPhone = () => !!(window.matchMedia && window.matchMedia("(max-width: 900px)").matches);
const stripSwipe = () => (window.touchSwipe && window.viewPager ? window.touchSwipe({ pages: window.viewPager, when: stripPhone }) : {});

Object.assign(window, { SurfaceTabs, stripPlace, stripSlide, stripSwipe });
