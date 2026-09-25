# Swipe between a strip's tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a phone, a swipe across the page under a tab strip (Inbox, People, Campaigns) carries the page with the
thumb and, let go past a third, presses the tab beside; a tap slides the new page in from the same side.

**Architecture:** data-bits' `touchSwipe` gets a third way that follows the finger, `pages`, asked once per touch for
`{ prev, next, held, follow, go }`. surface-tabs.jsx owns the strip's side: `stripPager` finds the strip over the page,
glides its underline and presses the neighbour; `stripPlace`/`stripSlide` tell the shell which way a new view comes in.
The shell spreads `stripSwipe()` on `.route-view` and tags a view `route-slide-next|prev`. Spec:
`docs/superpowers/specs/2026-09-25-swipe-between-tabs-design.md`.

**Tech Stack:** the legacy shell (React on Babel, no bundler), plain CSS, node:test on a stub React, Playwright (CDP touch).

All paths below are under `apps/dashboard/src/legacy/` unless they start with `tooling/`, `e2e/` or `docs/`.

---

### Task 1: touchSwipe's page way (components/data-bits.jsx)

**Files:**
- Modify: `components/data-bits.jsx` (touchSwipe and its settle/leave, ~lines 321–491)
- Test: `tooling/scripts/tests/it-moves.test.mjs`

- [ ] **Step 1: Write the failing tests** — append after the reduced-motion test (before the `leaving` section):

```js
/* ------------------------------------ a page ------------------------------------ */

const pager = (over = {}) => ({ prev: true, next: true, go() {}, ...over });

test("a page follows the thumb across, both ways, and says how far toward the tab beside it is", () => {
  const seen = [];
  const el = element();
  const h = touchSwipe({ pages: () => pager({ follow: (p, step, how) => seen.push([p, step, how]) }) });
  h.onTouchStart({ touches: [{ clientX: 200, clientY: 300 }], currentTarget: el, target: el });
  h.onTouchMove({ touches: [{ clientX: 125, clientY: 304 }], currentTarget: el });
  assert.equal(el.style.transform, "translate3d(-75px, 0, 0)");
  assert.deepEqual(seen.at(-1), [0.2, 1, "move"], "75px of 375: a fifth of the way to the next");
  h.onTouchMove({ touches: [{ clientX: 275, clientY: 304 }], currentTarget: el });
  assert.equal(el.style.transform, "translate3d(75px, 0, 0)");
  assert.deepEqual(seen.at(-1), [0.2, -1, "move"]);
  h.onTouchCancel({ currentTarget: el });
  assert.deepEqual(seen.at(-1), [0, -1, "settle"]);
});

test("past the last tab a page gives a quarter of the drag, 48px at most, and settles back", () => {
  const went = [];
  const el = element();
  const h = touchSwipe({ pages: () => pager({ next: false, go: (s) => went.push(s) }) });
  h.onTouchStart({ touches: [{ clientX: 300, clientY: 300 }], currentTarget: el, target: el });
  h.onTouchMove({ touches: [{ clientX: 220, clientY: 300 }], currentTarget: el });
  assert.equal(el.style.transform, "translate3d(-20px, 0, 0)");
  h.onTouchMove({ touches: [{ clientX: 40, clientY: 300 }], currentTarget: el });
  assert.equal(el.style.transform, "translate3d(-48px, 0, 0)");
  h.onTouchEnd({ changedTouches: [{ clientX: 40, clientY: 300 }], currentTarget: el });
  assert.equal(el.style.transform, "translate3d(0, 0, 0)", "a flick at a dead end is still nothing");
  assert.deepEqual(went, []);
});

test("let go past a third, a page leaves the way it went, a strip inside it holds still, and then the tab beside is pressed", async () => {
  const went = [];
  const hows = [];
  const el = element();
  const held = element();
  const h = touchSwipe({ pages: () => pager({ prev: false, held, follow: (p, s, how) => hows.push(how), go: (s) => went.push(s) }) });
  drag(h, el, [300, 300], [240, 300], [160, 300]);
  assert.equal(el.style.transform, "translate3d(-375px, 0, 0)", "away, a page's width");
  assert.equal(held.style.transform, "translate3d(375px, 0, 0)", "the strip over it stays where it is");
  assert.equal(hows.at(-1), "leave");
  assert.deepEqual(went, [], "the tab waits for the leaving");
  await wait(220);
  assert.deepEqual(went, [1]);
  // Short of a flick and of a third, it settles back.
  const near = element();
  drag(h, near, [300, 300], [285, 300], [280, 300]);
  assert.equal(near.style.transform, "translate3d(0, 0, 0)");
});

test("a page never moves from the screen's edges, where the page refuses the touch, or where a thread goes back", () => {
  const went = [];
  const h = touchSwipe({ pages: (el, from) => (from && from.__own ? null : pager({ go: (s) => went.push(s) })) });
  const left = element();
  drag(h, left, [10, 300], [120, 300], [200, 300]);
  const right = element();
  drag(h, right, [365, 300], [250, 300], [150, 300]);
  const own = element();
  own.__target = element({ __own: true, parentElement: own });
  drag(h, own, [200, 300], [100, 300], [20, 300]);
  assert.deepEqual(went, []);
  for (const el of [left, right, own]) assert.equal(el.style.transform, undefined);
  const both = touchSwipe({ onBack: () => {}, when: () => true, pages: () => pager({ go: (s) => went.push(s) }) });
  const thread = element();
  drag(both, thread, [60, 300], [140, 300], [260, 300]);
  assert.equal(thread.style.transform, "translate3d(100%, 0, 0)", "a swipe right in a thread is its Back");
  assert.deepEqual(went, []);
});

test("under reduced motion a page still follows, and the switch is at once; a swipe read only at its ends switches too", () => {
  reduced = true;
  try {
    const went = [];
    const h = touchSwipe({ pages: () => pager({ go: (s) => went.push(s) }) });
    drag(h, element(), [300, 300], [200, 300], [100, 300]);
    assert.deepEqual(went, [1]);
    const ends = element();
    h.onTouchStart({ touches: [{ clientX: 100, clientY: 300 }], currentTarget: ends, target: ends });
    h.onTouchEnd({ changedTouches: [{ clientX: 220, clientY: 302 }], currentTarget: ends });
    assert.deepEqual(went, [1, -1]);
  } finally {
    reduced = false;
  }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/it-moves.test.mjs`
Expected: the five new tests FAIL (no `pages` way: transforms `undefined`, `went` empty); the old ones pass.

- [ ] **Step 3: Implement** in `components/data-bits.jsx`.

Comment block: after the `onBack` paragraph add

```js
// `pages(el, from)` is the third that follows: a page under a strip, walked across (surface-tabs.jsx stripPager). It is
// asked once, as a touch is taken across (never from 24px of either edge, which is the phone's own back), with where
// the touch began: `{ prev, next, held, follow(progress, step, how), go(step) }`, or null for no page. The page moves
// with the finger both ways; toward a side with no page it gives a quarter of the drag, 48px at most. `held` (a strip
// drawn inside what moves) is kept where it is. Let go past a third (160px at most) or with a flick toward a page, it
// leaves that way and then `go(step)`; otherwise it settles. `follow` hears every move ("move") and the end ("leave",
// "settle"). `back` goes first where both are given.
```

Constants beside `GRAB_AT`:

```js
const EDGE = 24;
const RESIST = 0.25;
const RESIST_MAX = 48;
// A page's switch is a navigation, which lands a task or two later than a sheet's close.
const PAGE_KEPT_MS = 400;
const screenWide = (el) => (typeof window.innerWidth === "number" && window.innerWidth) || (el && el.offsetWidth) || 0;
```

`swipeSettle` also brings `g.held` back on the same curve; `swipeLeave` sends a page `-step` widths away (and `held`
the other way), and waits `PAGE_KEPT_MS` before judging whether the page stayed:

```js
const swipeSettle = (g) => {
  const { el, wash, held } = g;
  if (g.onGrab) g.onGrab(el, false);
  if (!el.style) return;
  const now = motionReduced();
  el.style.transition = now ? "none" : `transform ${SETTLE_MS}ms var(--ease-out)`;
  el.style.transform = "translate3d(0, 0, 0)";
  if (held && held.style) {
    held.style.transition = el.style.transition;
    held.style.transform = "translate3d(0, 0, 0)";
  }
  if (wash && wash.style) {
    wash.style.transition = now ? "none" : `opacity ${SETTLE_MS}ms var(--ease-out)`;
    wash.style.opacity = "";
  }
  setTimeout(() => {
    el.style.transition = "";
    el.style.transform = "";
    if (held && held.style) { held.style.transition = ""; held.style.transform = ""; }
    if (wash && wash.style) wash.style.transition = "";
  }, now ? 0 : SETTLE_MS + 20);
};
const swipeLeave = (g, close) => {
  const { el, wash, way, held } = g;
  const done = () => {
    close();
    setTimeout(() => {
      const shown = el.isConnected !== false && (!el.getClientRects || el.getClientRects().length > 0);
      if (shown) { swipeSettle(g); return; }
      if (g.onGrab) g.onGrab(el, false);
      if (!el.style) return;
      el.style.transition = "";
      el.style.transform = "";
      if (held && held.style) { held.style.transition = ""; held.style.transform = ""; }
      if (wash && wash.style) { wash.style.transition = ""; wash.style.opacity = ""; }
    }, way === "page" ? PAGE_KEPT_MS : KEPT_AFTER_MS);
  };
  if (!el.style || motionReduced()) { done(); return; }
  const w = el.offsetWidth || 600;
  el.style.transition = `transform ${LEAVE_MS}ms var(--ease-in)`;
  el.style.transform = way === "down" ? "translate3d(0, 100%, 0)" : way === "page" ? `translate3d(${-g.step * w}px, 0, 0)` : "translate3d(100%, 0, 0)";
  if (held && held.style) {
    held.style.transition = el.style.transition;
    held.style.transform = `translate3d(${g.step * w}px, 0, 0)`;
  }
  if (wash && wash.style) {
    wash.style.transition = `opacity ${LEAVE_MS}ms var(--ease-in)`;
    wash.style.opacity = "0";
  }
  setTimeout(done, LEAVE_MS);
};
```

touchSwipe itself (signature, start, the axis choice, the move, the end and the cancel):

```js
const pageStep = (dx) => (dx < 0 ? 1 : -1);
const pageOpen = (p, step) => !!(p && (step > 0 ? p.next : p.prev));
const touchSwipe = ({ onLeft = null, onRight = null, onDown = null, onBack = null, pages = null, min = 80, when = null, onGrab = null }) => ({
  onTouchStart: (e) => {
    // ...unchanged down to touches.set, which also keeps where it began:
    touches.set(el, { el, x: t.clientX, y: t.clientY, at: Date.now(), top: swipeScrollerAtTop(e.target, el), way: null, onGrab, wash: null, from: e.target, pages: null, held: null, step: 0 });
  },
  onTouchMove: (e) => {
    // ...unchanged down to the axis choice, which becomes:
      if (Math.abs(dy) > Math.abs(dx)) g.way = dy > 0 && g.top && onDown && allowed ? "down" : "none";
      else if (dx > 0 && onBack && allowed && g.x > EDGE) g.way = "back";
      else if (pages && allowed && g.x > EDGE && g.x < screenWide(el) - EDGE) {
        g.pages = pages(el, g.from);
        g.way = g.pages && (g.pages.prev || g.pages.next) ? "page" : "none";
      } else g.way = "none";
      if (g.way === "none") return;
      g.wash = washBehind(el);
      g.held = g.way === "page" ? g.pages.held || null : null;
      if (el.style) el.style.transition = "none";
      if (g.wash && g.wash.style) g.wash.style.transition = "none";
      if (g.held && g.held.style) g.held.style.transition = "none";
      if (onGrab) onGrab(el, true);
    }
    if (!el.style) return;
    if (g.way === "down") { /* unchanged */ }
    else if (g.way === "back") { /* unchanged */ }
    else if (g.way === "page") {
      const step = pageStep(dx);
      const open = pageOpen(g.pages, step);
      const d = open ? dx : Math.sign(dx) * Math.min(RESIST_MAX, Math.abs(dx) * RESIST);
      el.style.transform = `translate3d(${d}px, 0, 0)`;
      if (g.held && g.held.style) g.held.style.transform = `translate3d(${-d}px, 0, 0)`;
      if (g.pages.follow) g.pages.follow(open ? Math.min(1, Math.abs(dx) / (el.offsetWidth || 600)) : 0, step, "move");
    }
  },
  onTouchEnd: (e) => {
    // ...unchanged down to the down/back branch; after it:
    if (g.way === "page") {
      const step = pageStep(dx);
      const size = el.offsetWidth || 600;
      const flick = Math.abs(dx) > 24 && Math.abs(dx) / Math.max(1, Date.now() - g.at) > 0.5;
      if (pageOpen(g.pages, step) && (Math.abs(dx) > Math.min(size / 3, 160) || flick)) {
        g.step = step;
        if (g.pages.follow) g.pages.follow(1, step, "leave");
        swipeLeave(g, () => g.pages.go(step));
      } else {
        if (g.pages.follow) g.pages.follow(0, step, "settle");
        swipeSettle(g);
      }
      return;
    }
    // Nothing followed: read at its ends ... (the across branch gains the page, for a touch reported only at its ends)
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (Math.abs(dx) < min) return;
      const back = dx > 0 && onBack && (!when || when()) && g.x > EDGE;
      if (!back && g.way === null && pages && (!when || when()) && g.x > EDGE && g.x < screenWide(el) - EDGE) {
        const p = pages(el, g.from);
        if (pageOpen(p, pageStep(dx))) { p.go(pageStep(dx)); return; }
      }
      const way = dx < 0 ? onLeft : back ? onBack : onRight;
      if (way) way();
      return;
    }
    // ...unchanged
  },
  onTouchCancel: (e) => {
    const el = e && e.currentTarget;
    const g = el && touches.get(el);
    if (!g) return;
    touches.delete(el);
    if (g.way === "page" && g.pages.follow) g.pages.follow(0, g.step || -1, "settle");
    if (g.way === "down" || g.way === "back" || g.way === "page") swipeSettle(g);
  },
});
```

(The cancel's `step` for the settle is only the glide's direction back to the picked tab; any value settles it.)

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/it-moves.test.mjs`
Expected: all pass. Then the other callers' tests: `leads-peek.test.mjs`, `record-kit.test.mjs` — pass.

- [ ] **Step 5: Commit** — `git add` the two files; message "touchSwipe: a page walked across follows the thumb (the third way)".

### Task 2: the strip's side (components/surface-tabs.jsx, pages/clients-a.jsx)

**Files:**
- Modify: `components/surface-tabs.jsx` (append before `window.SurfaceTabs = SurfaceTabs;`, and the export)
- Modify: `pages/clients-a.jsx:3929` (add `plScopes` to the window export)
- Test: `tooling/scripts/tests/one-inbox.test.mjs`, `tooling/scripts/tests/people-honest.test.mjs`

- [ ] **Step 1: Write the failing tests.** In one-inbox.test.mjs, after the strip tests:

```js
test("a view from the tab beside comes in from that side: the strip's own order, and nowhere off a strip", () => {
  const at = (page) => win.stripPlace(page, null);
  assert.deepEqual(at("inbox"), { strip: "inbox", at: 0 });
  assert.deepEqual(at("live"), { strip: "inbox", at: 2 });
  assert.deepEqual(at("messages"), { strip: "campaigns", at: 2 });
  assert.equal(at("today"), null);
  assert.equal(at("content"), null, "a demo-only tab is on no real strip");
  assert.equal(win.stripSlide(at("inbox"), at("conversations")), "next");
  assert.equal(win.stripSlide(at("live"), at("inbox")), "prev");
  assert.equal(win.stripSlide(at("inbox"), at("inbox")), null);
  assert.equal(win.stripSlide(at("live"), at("outbound")), null, "another strip is somewhere else");
  assert.equal(win.stripSlide(null, at("inbox")), null);
});
```

In people-honest.test.mjs (it loads clients-a.jsx), add near the phone scope test:

```js
test("People's scopes are its strip's order: People, Leads, the Pipeline; a person's page is on no strip", async () => {
  await import("../../../apps/dashboard/src/legacy/components/surface-tabs.jsx");
  const w = globalThis.window;
  assert.deepEqual(w.stripPlace("clients", null), { strip: "people", at: 0 });
  assert.deepEqual(w.stripPlace("clients", "seg:needs-you"), { strip: "people", at: 0 });
  assert.deepEqual(w.stripPlace("clients", "leads:s-abc"), { strip: "people", at: 1 });
  assert.deepEqual(w.stripPlace("clients", "pipeline"), { strip: "people", at: 2 });
  assert.equal(w.stripPlace("clients", "c-123"), null);
  assert.equal(w.stripSlide(w.stripPlace("clients", "leads"), w.stripPlace("clients", null)), "prev");
});
```

- [ ] **Step 2: Run to see them fail** — `node --conditions=react-server --import tsx --test tooling/scripts/tests/one-inbox.test.mjs tooling/scripts/tests/people-honest.test.mjs`; expected: `win.stripPlace is not a function`.

- [ ] **Step 3: Implement.** clients-a.jsx: add `plScopes` to the `Object.assign(window, { ... })` list. surface-tabs.jsx, before the export:

```js
// ---- Where a route stands on a strip, and which way a view comes in -----------------------------------------------
// People's scopes are People's own strip (PeoplePhoneBar), in plScopes' order; every other strip is a group's here. A
// person's page, and a route no strip carries, stand nowhere, and a view arriving there comes in as any other does.
const stripPlace = (page, param) => {
  if (page === "clients") {
    if (!window.plScopes || !window.plScopeRoute) return null;
    const route = param && /^leads(:|$)/.test(param) ? "clients/leads"
      : param && /^pipeline(:|$)/.test(param) ? "clients/pipeline"
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
// the page is going to, holds it still when it is inside what moves, and presses the tab beside, so a swipe is exactly
// a tap. A touch that begins in something that takes touches for itself is never the page's.
const ST_OWN_TOUCH = '[role="dialog"], [aria-modal="true"], [role="menu"], .sb-sheet, .pp-toast, [data-own-drag]';
const stripPhone = () => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);
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
const stripPager = (view, from) => {
  if (from && from.closest && from.closest(ST_OWN_TOUCH)) return null;
  const main = view && view.parentElement;
  const strip = main ? main.querySelector(".stabs") : null;
  if (!strip || strip.getClientRects().length === 0) return null;
  const tabs = Array.from(strip.querySelectorAll(".stabs-tab"));
  const at = tabs.findIndex((t) => t.classList.contains("active"));
  if (at < 0) return null;
  return {
    prev: at > 0,
    next: at < tabs.length - 1,
    held: view.contains(strip) ? strip : null,
    follow: (progress, step, how) => {
      const a = tabs[at];
      const b = tabs[at + step] || a;
      const p = Math.max(0, Math.min(1, progress));
      strip.style.setProperty("--glide-x", `${a.offsetLeft + (b.offsetLeft - a.offsetLeft) * p}px`);
      strip.style.setProperty("--glide-w", `${a.offsetWidth + (b.offsetWidth - a.offsetWidth) * p}px`);
      strip.setAttribute("data-glide", how === "move" ? "" : "ease");
      if (how === "settle") setTimeout(() => stripUnglide(strip), 260);
    },
    go: (step) => {
      const tab = tabs[at + step];
      if (!tab) return;
      tab.click();
      const since = Date.now();
      const landed = () => {
        if (tab.classList.contains("active") || !tab.isConnected || Date.now() - since > 400) stripUnglide(strip);
        else setTimeout(landed, 16);
      };
      landed();
    },
  };
};
const stripSwipe = () => (window.touchSwipe ? window.touchSwipe({ pages: stripPager, when: stripPhone }) : {});

Object.assign(window, { SurfaceTabs, stripPlace, stripSlide, stripSwipe });
```

(replacing `window.SurfaceTabs = SurfaceTabs;`).

- [ ] **Step 4: Run** both test files; expected PASS. Also `legacy-harness.test.mjs` (one namespace: the new top-level names are unique).

- [ ] **Step 5: Commit** — "The strip walks under a thumb: stripPager, stripPlace and stripSlide".

### Task 3: the shell, the CSS and what keeps its own touch

**Files:**
- Modify: `pages/app-shell.jsx` (~821–826 viewRef; ~896–900 the route view)
- Modify: `styles/components.css` (`.stabs`/`.stabs-tab` ~1936–1945; route transition ~908–917; reduced motion ~3431–3437)
- Modify: `styles/clients.css:2404-2408` (the People strip's clip goes: the cause is gone)
- Modify: `pages/leads-scope.jsx:692`, `pages/live-monitor-real.jsx:286` (`data-own-drag`)
- Modify: `Chanlytics.html` (bump each edited file's `?v=`, one past main and every open PR)

- [ ] **Step 1: The shell.** viewRef keeps each view's place and decides its slide as it mounts:

```js
  const place = window.stripPlace ? window.stripPlace(page, param) : null;
  const viewRef = useShellRef({ key: null, family: null, reading: false, stay: false, place: null, slide: null });
  if (viewRef.current.key !== viewKey) {
    const prev = viewRef.current;
    viewRef.current = {
      key: viewKey, family, reading: routeLoading, place,
      stay: !routeLoading && prev.key !== null && prev.family === family && !prev.reading,
      // The tab beside comes in from its side (a tap or a swipe, components.css route-slide-*), never after a reading pane.
      slide: prev.key !== null && !prev.reading && window.stripSlide ? window.stripSlide(prev.place, place) : null,
    };
  }
  const routeStay = viewRef.current.stay;
  const routeSlide = viewRef.current.slide;
```

and the route view:

```jsx
        <div
          key={viewKey}
          className={`main-scroll route-view ${pane ? "pane" : ""} ${routeStay ? "route-stay" : ""} ${routeSlide ? `route-slide-${routeSlide}` : ""}`}
          aria-busy={routeLoading ? "true" : undefined}
          {...(window.stripSwipe ? window.stripSwipe() : {})}
        >
```

- [ ] **Step 2: The strip's rule inside it, and the glide** (components.css). Replace the `.stabs`/`.stabs-tab` rules:

```css
.stabs { display: flex; align-items: center; gap: 4px; padding: 6px 18px 0; background: var(--bg); box-shadow: inset 0 -1px 0 var(--line); flex: none; position: relative; }
.stabs-tab { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 12px; font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--ink-dim); border-bottom: 2px solid transparent; transition: color 110ms; }
```

with the comment saying the rule is an inset shadow so the picked tab's 2px underline lies over it inside the strip:
a border under it lay outside what a strip that scrolls across shows (the phone's), and the Inbox's and Campaigns'
underlines drew 1px of their 2 (People's clipped instead) — confirm that on the dev server before writing it (Task 5,
step 2), and write what was measured. After the `.stabs-tab.active` rule:

```css
/* A thumb carrying the page (surface-tabs.jsx stripPager): one underline, between the tab picked and the one the page
   is going to; the picked tab's own is clear meanwhile. */
.stabs[data-glide]::after { content: ""; position: absolute; left: 0; bottom: 0; width: var(--glide-w, 0px); height: 2px; background: var(--accent); transform: translateX(var(--glide-x, 0px)); pointer-events: none; }
.stabs[data-glide="ease"]::after { transition: transform 180ms var(--ease-out), width 180ms var(--ease-out); }
.stabs[data-glide] .stabs-tab { transition: color var(--duration-base) var(--ease-out); }
.stabs[data-glide] .stabs-tab.active { border-bottom-color: transparent; }
```

After `.route-view.route-stay { animation: none; }` and `@keyframes route-in`:

```css
/* A view from the tab beside comes in from that side on a phone (app-shell.jsx routeSlide), so a tap and a swipe read
   as one control. It outranks route-stay (People's scopes), and moves `translate`, never `transform`: a finger that
   takes the page as it lands keeps it. */
@media (max-width: 720px) and (prefers-reduced-motion: no-preference) {
  .route-view.route-slide-next { animation: route-slide-next 220ms var(--ease-out); }
  .route-view.route-slide-prev { animation: route-slide-prev 220ms var(--ease-out); }
}
@keyframes route-slide-next { from { opacity: 0.4; translate: 32px 0; } }
@keyframes route-slide-prev { from { opacity: 0.4; translate: -32px 0; } }
```

In the reduced-motion block at the file's end add `.stabs[data-glide="ease"]::after, .stabs[data-glide] .stabs-tab { transition: none; }`.

clients.css: delete `.stabs-people { overflow-x: clip; }` and its comment (the tab no longer overlaps the strip's
edge, so no strip scrolls 1px); keep `.pp-top`'s rule.

- [ ] **Step 3: What keeps its own touch.** leads-scope.jsx: `<div className="ld-map-streets" data-testid="lead-map-streets" data-own-drag>`;
live-monitor-real.jsx: the hold-to-talk button gets `data-own-drag`. Bump `?v=` for every edited file in `Chanlytics.html`.

- [ ] **Step 4: Run** the node suite files touched: `it-moves`, `one-inbox`, `people-honest`, `legacy-harness`,
`leads-peek`, `record-kit`, `layout-measure`, `chrome`; expected PASS.

- [ ] **Step 5: Commit** — "A swipe across a phone's page walks its strip, and the tab beside slides in from its side".

### Task 4: the journey, with real touches (e2e/phone.spec.ts)

- [ ] **Step 1: Write the test** after "the section tabs are one strip":

```ts
  /**
   * A swipe across the page walks its strip (25 Sep, docs/superpowers/specs/2026-09-25-swipe-between-tabs-design.md):
   * the page follows the thumb, and let go past a third of the screen the tab beside is pressed. Real touches through
   * the browser's own input (CDP), as today.spec.ts pulls Ask down.
   */
  test("a swipe across the page walks its strip: the Inbox, People and Campaigns, and never past an end", async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    const swipe = async (from: number, to: number, y = 520) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from, y }] });
      for (let i = 1; i <= 6; i += 1) {
        const x = from + ((to - from) * i) / 6;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    const inbox = page.locator(".stabs.stabs-inbox .stabs-tab.active");
    await page.goto("/#/inbox");
    await page.waitForLoadState("networkidle");
    await expect(inbox).toHaveText(/^Needs you/);
    await swipe(300, 90);
    await expect(page).toHaveURL(/#\/conversations/);
    await expect(inbox).toHaveText(/^Conversations/);
    await swipe(90, 300);
    await expect(page).toHaveURL(/#\/inbox/);
    await swipe(90, 300);
    await page.waitForTimeout(600);
    await expect(page, "nothing before the first tab").toHaveURL(/#\/inbox$/);

    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    await swipe(300, 90);
    await expect(page).toHaveURL(/#\/clients\/leads/);
    await expect(page.getByTestId("leads-phone-scopes").locator(".stabs-tab.active")).toHaveText("Leads");

    await page.goto("/#/outbound");
    await page.waitForLoadState("networkidle");
    await swipe(300, 90);
    await expect(page).toHaveURL(/#\/broadcasts/);
  });
```

- [ ] **Step 2: Run on the harness** — `node tooling/scripts/e2e-harness/run.mjs e2e/phone.spec.ts --scenario=pipeline --grep "walks its strip" --reporter=line`; expected PASS.
- [ ] **Step 3: Mutation** — remove the `stripSwipe()` spread from the route view, rerun: expected FAIL at the first URL; restore.
- [ ] **Step 4: Commit** — "e2e: a swipe walks each strip".

### Task 5: see it, say it, ship it

- [ ] **Step 1:** Dev server (`cm-tab-strip-app`, `/w/<slug>/`), 375×812. Drive synthetic touches with `javascript_tool`
  (`new Touch`/`new TouchEvent` on the route view): screenshot mid-drag (the page off by ~120px, the underline between
  two tabs), after the switch, and at an end; read `document.documentElement.scrollWidth === innerWidth` mid-drag.
- [ ] **Step 2:** Before/after pixel check of the underline on the Inbox (2px after); write the measured words into the
  `.stabs` comment.
- [ ] **Step 3:** `apps/dashboard/src/legacy/CLAUDE.md`: one sentence in the strip's clause (a swipe walks it on a phone;
  `data-own-drag` for anything that takes its own touch) and in "How things come and go" (touchSwipe's `pages`).
- [ ] **Step 4:** Format, rebase on main, recheck the `?v=` keys against main and open PRs, PR, CI, squash-merge, check
  production's `/api/version`.
