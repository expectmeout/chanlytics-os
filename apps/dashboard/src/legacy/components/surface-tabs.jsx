/* global React, Icon */
// Chanlytics — SurfaceTabs
// The nav-collapse layer: merged surfaces (People, Conversations, Campaigns,
// Agents) are VIEWS under one nav item, not places. Rendered by the shell
// above the routed page; all routes stay unchanged so deep links keep working.

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
      { id: "inbox", label: "Needs you", to: "inbox", tone: "warn", badge: () => (window.sbNeedsCount ? window.sbNeedsCount() : 0) || null, tip: "Waiting on a decision from you" },
      { id: "conversations", label: "Conversations", to: "conversations", tip: "Every chat and call, answered or not" },
      // pulse is demo-only: it advertised a call in progress for an invented
      // caller, always on, beside the REAL Conversations tab.
      // With the bridge running the pulse is the real thing: a call in
      // progress under the heartbeat rule. The seeded pulse stays demo-only.
      { id: "live", label: "Live", to: "live", pulse: () => (window.__LIVE
        // The same heartbeat rule the page applies between refreshes, so the
        // tab does not pulse for a phantom the page has already dropped.
        ? window.__LIVE.now.some((c) => window.__chrome.liveStillUp(c, window.__LIVE.heartbeatMs, Date.now()))
        : !!window.__DEMO_MODE && !(window.LM_STORE && window.LM_STORE.isEnded("lc-selena"))), tip: "Calls on your line, as they happen" },
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
// The press is answered on the screen before the page it asks for is drawn: the tab lit and its underline on its way in
// one painted frame, then the move. A page drawn in one long piece (People's scope, 60 to 120 ms on a phone) began
// before the browser had painted, and the tab lit only with the page (5 Oct 2026); the Inbox's moves had a pause of the
// router's own in between. One frame, where there are frames (the node suite has none and moves at once).
const stAfterPaint = (fn) => {
  if (typeof requestAnimationFrame !== "function") { fn(); return; }
  requestAnimationFrame(() => setTimeout(fn, 0));
};
// A tab is a link, as every door is (data-bits routeDoor): its address the route's, so a middle click, a long press or a
// new tab opens that view; a plain press is the app's own move. A press with a key held, or not the main button, is the
// browser's.
const stHref = (route) => { const a = stAddress(); return a && a.href ? a.href(route) : `#/${route}`; };
const stOwnPress = (e) => !(e && (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey));
// A strip wider than its place scrolls across (Reports' six lenses on a phone), and the view picked is brought into it,
// a step clear of its edge: Reviews stood past the screen's right with the strip at its start, so the page said nothing of
// which view it was (6 Oct 2026). A strip that fits is left as it is.
const stShowPicked = (strip) => {
  if (!strip || strip.scrollWidth <= strip.clientWidth) return;
  const tab = strip.querySelector(".stabs-tab.active");
  if (!tab) return;
  const clear = 16;
  const start = tab.offsetLeft - clear;
  const end = tab.offsetLeft + tab.offsetWidth + clear;
  if (start < strip.scrollLeft) strip.scrollLeft = Math.max(0, start);
  else if (end > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = end - strip.clientWidth;
};

// `views` is a page that says its own views (surfaces/routes.ts SurfaceViews: People's scopes, from its chrome): the same strip,
// drawn here once for every page, whether the views are a group's below or the page's own. A page's views are its tabs,
// the one picked is its own to name, and a view is a move to a route like any tab here.
const SurfaceTabs = ({ page, param, views, onNavigate }) => {
  const [, stBump] = React.useReducer(n => n + 1, 0);
  const own = views && views.tabs.length > 1 ? views : null;
  const pickedId = own ? own.picked : page;
  // The tab pressed answers at once: the address moves when the router lands, which on a slow connection is a beat
  // after the press. It is the page's own again as soon as the address says it is, and never kept past a few seconds.
  const [pending, setPending] = React.useState(null);
  const stripRef = React.useRef(null);
  React.useEffect(() => { setPending(null); }, [page, pickedId]);
  React.useEffect(() => {
    if (!pending) return undefined;
    const t = setTimeout(() => setPending(null), 3000);
    return () => clearTimeout(t);
  }, [pending]);
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
  // Before the strip is painted, so it never shows at its start and then jumps; and again when its tabs change (Reports'
  // Pipeline lens comes in once the workspace's list is read, and pushed the picked one along). A stub React without
  // layout effects runs it as an effect.
  (React.useLayoutEffect || React.useEffect)(() => { stShowPicked(stripRef.current); }, [page, pickedId, pending, warmRoutes]);
  React.useEffect(() => {
    const a = stAddress();
    if (warmRoutes && a && a.warmSoon) a.warmSoon(warmRoutes.split(" "));
  }, [groupKey, page, warmRoutes]);
  if (tabs.length < 2) return null;
  // Detail views keep their focus: hide on a person's profile. A list (seg:, list:) and a state (state:) are views of
  // People, and the tabs vanished on the last two (the wiring audit's N24). A page that says its own views says none for one.
  if (!own && page === "clients" && param && !/^(seg|list|state):/.test(param)) return null;
  return (
    <nav ref={stripRef} className={`stabs stabs-${groupKey}`} aria-label={own ? own.label : "Section views"} data-testid={own ? own.testid : undefined} data-stays={own && own.stays ? "" : undefined}>
      {tabs.map(t => {
        const badge = t.badge ? t.badge() : null;
        const pulse = t.pulse ? t.pulse() : false;
        return (
          <a key={t.id} href={stHref(t.to)} className={`stabs-tab ${(pending || pickedId) === t.id ? "active" : ""}`} aria-current={pickedId === t.id ? "page" : undefined} data-testid={t.testid} data-tip={t.tip || null} data-tip-side="bottom" onPointerEnter={() => stWarm(t.to)} onTouchStart={() => stWarm(t.to)} onFocus={() => stWarm(t.to)} onClick={(e) => { if (!stOwnPress(e)) return; e.preventDefault(); if (pickedId !== t.id) { stripTap(e.currentTarget.parentElement, e.currentTarget); setPending(t.id); } stAfterPaint(() => onNavigate(t.to)); }}>
            {t.label}
            {pulse && <span className="live-dot" style={{ width: 5, height: 5 }} />}
            {badge ? <span className={`stabs-badge tally${t.tone === "warn" ? " tally-warn" : ""}`} data-tone={t.tone || "plain"}>{badge}</span> : null}
          </a>
        );
      })}
    </nav>
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

// ---- The strip under a thumb (a phone, docs/superpowers/specs/2026-09-25-swipe-between-tabs-design.md) ------------
// A swipe across the page walks the strip drawn over it: data-bits' touchSwipe carries the page with the finger; this
// finds the strip (the shell's, over the route view, or People's own inside it), glides its underline toward the tab
// the page is going to, keeps it where it is, and presses the tab beside, so a swipe is exactly a tap. A touch that begins in something that takes touches for itself is never the page's.
const ST_OWN_TOUCH = '[role="dialog"], [aria-modal="true"], [role="menu"], .sb-sheet, .pp-toast, [data-own-drag]';
// A strip is walked where its page is one column: the shell's phone (720px and under), and People's page to 900px,
// where its rows are already a phone's (PL_PHONE_QUERY). The view says whose strip it stands on (app-shell.jsx data-strip).
const stripWide = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
const stripPhone = () => stripWide("(max-width: 900px)");
const stripPhoneFor = (view) => stripWide("(max-width: 720px)") || !!(view && view.dataset && view.dataset.strip === "people");
// The picked tab's own underline comes back at once: eased, it faded in under a glide that had already gone.
const stripUnglide = (strip) => {
  const tabs = Array.from(strip.querySelectorAll(".stabs-tab"));
  for (const t of tabs) t.style.transition = "none";
  strip.removeAttribute("data-glide");
  strip.style.removeProperty("--glide-x");
  strip.style.removeProperty("--glide-w");
  void strip.offsetWidth;
  for (const t of tabs) t.style.transition = "";
};
// A strip drawn inside the page (People's, in its own scroller) stays while all around it moves: what sits beside it
// and beside each box that holds it, up to the view. Moving the view with the strip held in it cut the strip off at the
// view's moving edge, and it vanished as the page left.
const stripAround = (strip, view) => {
  const out = [];
  for (let n = strip; n && n.parentElement && n !== view; n = n.parentElement) {
    for (const s of Array.from(n.parentElement.children)) if (s !== n) out.push(s);
  }
  return out;
};
const stripPager = (view, from) => {
  if (from && from.closest && from.closest(ST_OWN_TOUCH)) return null;
  if (!stripPhoneFor(view)) return null;
  const main = view && view.parentElement;
  const strip = main ? main.querySelector(".stabs") : null;
  if (!strip || strip.getClientRects().length === 0) return null;
  const tabs = Array.from(strip.querySelectorAll(".stabs-tab"));
  const at = tabs.findIndex((t) => t.classList.contains("active"));
  if (at < 0) return null;
  return {
    prev: at > 0,
    next: at < tabs.length - 1,
    // The page stays as its view changes (routes.ts SurfaceViews `stays`, which the strip wears): the view on screen
    // draws the next, so the swipe asks for it once this one has left and brings it in as the Calendar's days come
    // (data-bits swipeLeave); else the next view is a page of its own, drawn while this one leaves.
    stays: strip.hasAttribute("data-stays"),
    moving: view.contains(strip) ? stripAround(strip, view) : null,
    follow: (progress, step, how) => {
      const a = tabs[at];
      const b = tabs[at + step] || a;
      const p = Math.max(0, Math.min(1, progress));
      strip.style.setProperty("--glide-x", `${a.offsetLeft + (b.offsetLeft - a.offsetLeft) * p}px`);
      strip.style.setProperty("--glide-w", `${a.offsetWidth + (b.offsetWidth - a.offsetWidth) * p}px`);
      strip.setAttribute("data-glide", how === "move" ? "" : "ease");
      if (how === "settle") setTimeout(() => stripUnglide(strip), 260);
    },
    // Answers once the view has landed: the tab pressed is the address's own (aria-current, the shell drawn for the
    // new route) and the view has drawn since the press (the page follows the same address), or the strip is gone
    // with its page, or 400 ms have passed (a page's switch is a navigation). The glide clears as soon as the tab is
    // lit. A page that stays comes back in only then, with the next view in it (data-bits swipeLeave).
    go: (step) => {
      const tab = tabs[at + step];
      if (!tab) return Promise.resolve();
      let drew = false;
      const watcher = typeof MutationObserver === "function" ? new MutationObserver(() => { drew = true; }) : null;
      if (watcher) watcher.observe(view, { childList: true, subtree: true, attributes: true });
      tab.click();
      const since = Date.now();
      let lit = false;
      return new Promise((resolve) => {
        const landed = () => {
          const gone = !tab.isConnected;
          const late = Date.now() - since > 400;
          if (!lit && (tab.classList.contains("active") || gone || late)) { stripUnglide(strip); lit = true; }
          if ((tab.getAttribute("aria-current") === "page" && (drew || !watcher)) || gone || late) {
            if (watcher) watcher.disconnect();
            resolve();
          } else setTimeout(landed, 16);
        };
        landed();
      });
    },
  };
};
// A tap on a tab moves the underline as a swipe does: from the tab it stood under to the one pressed, on the same
// ease, and clear again before the page has landed (the picked tab's own underline is hidden while it glides, so there
// is one). Not under reduced motion (components.css, kit.css: the glide has no transition there).
const ST_GLIDE_MS = 260;
const stripTap = (strip, to) => {
  const from = strip.querySelector(".stabs-tab.active");
  if (!from || from === to || strip.hasAttribute("data-glide")) return;
  strip.style.setProperty("--glide-x", `${from.offsetLeft}px`);
  strip.style.setProperty("--glide-w", `${from.offsetWidth}px`);
  strip.setAttribute("data-glide", "");
  void strip.offsetWidth;
  strip.setAttribute("data-glide", "ease");
  strip.style.setProperty("--glide-x", `${to.offsetLeft}px`);
  strip.style.setProperty("--glide-w", `${to.offsetWidth}px`);
  setTimeout(() => stripUnglide(strip), ST_GLIDE_MS);
};
const stripSwipe = () => (window.touchSwipe ? window.touchSwipe({ pages: stripPager, when: stripPhone }) : {});

// ST_OWN_TOUCH is the one list of what keeps its own touch: the Calendar's days refuse the same (calendar-real.jsx).
Object.assign(window, { SurfaceTabs, stripPlace, stripSlide, stripSwipe, ST_OWN_TOUCH });
