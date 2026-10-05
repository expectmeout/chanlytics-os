# Tab switch parity: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status (5 Oct 2026):** Phases A and B built as local commits 3d2ac8aa7 to 654b7fc7c on perf/tab-switch-parity (not pushed); B1 step 3 and B4 not built, with the evidence beside each. Measured at 4x CPU on a production build: People's tab lit 13 to 37 ms (it lit only with the page, 144 to 876); a phone swipe lift to page 66 to 122 ms (300 to 390, the wrong scope first in 4 of 4); People reads nothing per switch (2 reads); the Inbox mounts each page once (twice); a desk at rest has no long tasks (3.6 to 4.1 s in 5 s).

**Goal:** A press or a swipe on People's strip (People | Leads | Pipeline) answers, moves and lands as the Inbox's strip (Needs you | Conversations | Live) does, and both get faster: the tab lights at once, the page arrives with motion, the right page comes in first time, nothing is read that is already held, and the desk's light stops costing the page its frames.

**Architecture:** The frame takes its route from Next's pathname in the same render as the page (one clock), so every move between two addresses is one background render with one mount. Motion: a move between two views of a strip arrives as the Inbox's tabs do on a desk too; a table's rows rise in on arrival; a list's swap rise reaches Leads and the Pipeline. The Glass pools leave the inherited custom properties for three layers moved by a transform. Leads paints a held view without a re-read while nothing has changed since it was read; People keeps the row objects that did not change, so its rows' memo holds.

**Tech Stack:** Next.js 16.3 App Router (patched history: `ACTION_RESTORE` in `startTransition`), React 19.3, the legacy shell (`apps/dashboard/src/legacy`, JSX bundled by the app, run on the stub React in the node suite), the kit (`apps/dashboard/src/surfaces/kit`), Node's test runner (`node tooling/scripts/checks/test.mjs <file>`), Playwright-core measurement scripts in `Claude Video/dev-tools/load-parity/`.

**Evidence this plan answers:** the analysis of 5 Oct 2026 (memory `project_chanlytics_tab_switch_parity`), measured on a production build of a6c8ec361 with `dev-tools/load-parity/tab-switch.mjs`: People's tab lights only when its scope is drawn (desk ~210 ms, phone ~180 ms at 4x CPU; the Inbox's 55 / 30 ms); on a phone the scope being left slides in first (4 of 4 swipes); no arrival motion for People's scopes on a desk; two Leads reads per switch; the Inbox mounts each page twice per switch; the desk drift holds 75 to 80% of the main thread at 4x.

## Global Constraints

- Worktree `Claude Video/cm-load-path`, branch `perf/tab-switch-parity` from origin/main a1b7dec8f. Commits are local; **nothing is pushed and no PR is opened** until Ruben says so (5 Oct: "all approved continue as you recommend do not push").
- Every `Agent` dispatch runs on Sonnet (`model: "sonnet"`).
- Tests: only the files a change touches, one per command (`node tooling/scripts/checks/test.mjs tooling/scripts/tests/<file>`), plus the ratchets (`repo/code-health-ratchets`, `styles/style-measures`, `styles/kit-css`, `repo/debt-register`), `corepack pnpm -r typecheck` (or the dashboard's `corepack pnpm --filter @chanlytics/dashboard typecheck`) and `corepack pnpm lint`. Never the whole suite.
- Every edited legacy stylesheet or JSX file gets its `?v=` bumped in `apps/dashboard/src/legacy/Chanlytics.html` (the harness), the next number, never one another branch took.
- Run Prettier from the repo root only (`corepack pnpm exec prettier --write <files>`); the legacy tree is in the root `.prettierignore`.
- A stylesheet reads colours from `tokens.css` (`style-values.json` may only fall).
- Grep `e2e/` and `tooling/scripts/tests/` for any class, test id, role or text a change moves (`feedback_grep_e2e_pins`).
- Prove each "feel" change on a production build (`next build` in `apps/dashboard` with `.env.local` sourced, `next start --port 3312`, `node dev-tools/live-signin.mjs 3312`), with `tab-switch.mjs` before and after, then stop both servers by PID.

## File map

| File | Change |
| --- | --- |
| `apps/dashboard/src/legacy-bridge/LegacyHost.tsx` | `Frame` takes the route from the pathname and hands it on |
| `apps/dashboard/src/legacy-bridge/LegacyApp.tsx` | passes `route` through `useShellApp` to `ChanlyticsApp` as `routeNow` |
| `apps/dashboard/src/legacy/pages/app-shell.jsx` | `routeNow` is the route when given; the heard route only without it; `useViewFade` decides against the committed view and a strip move arrives; the light's layer element |
| `apps/dashboard/src/legacy/components/surface-tabs.jsx` | tabs are links; swipe to 900 for People's own strip |
| `apps/dashboard/src/legacy/components/data-bits.jsx` | a page walked across moves as the finger lets go |
| `apps/dashboard/src/legacy/styles/components.css` | the light's layers and their drift; slide rules for People's strip up to 900 |
| `apps/dashboard/src/legacy/styles/tokens.css` | the pools' tints as tokens; the `@property` registrations go |
| `apps/dashboard/src/surfaces/kit/motion/use-swap-motion.ts` | may animate the parts a list is drawn in (`tbody`s) |
| `apps/dashboard/src/surfaces/kit/motion/use-rows-arrive.ts` (new) | a table's first rows rise in, once, as it mounts |
| `apps/dashboard/src/surfaces/people/table/table.tsx` | rows arrive; the swap ref reaches sectioned tables |
| `apps/dashboard/src/surfaces/leads/page/*`, `apps/dashboard/src/surfaces/leads/scope/scope.tsx` | Leads' table takes the swap rise |
| `apps/dashboard/src/surfaces/people/pipeline/*` | the Pipeline's table takes the swap rise |
| `apps/dashboard/src/surfaces/leads/surface.ts` | a held view read since the last change paints with no read behind |
| `apps/dashboard/src/surfaces/people/surface.ts` | rows that did not change keep their object |
| tests | `shell/surfaces/shell-status`, `styles/page-light-drift`, `people/people-honest`, `people/moments/people-views`, `shell/surfaces/one-inbox`, the Leads surface test, the People surface test |

---

## Phase A: what you feel

### Task A1: One clock for the address

The frame follows the address through `hearAddress` (told synchronously by `goToRoute`), and the page follows Next's `usePathname` (told in a transition). People's moves were a synchronous render of the whole scope with the tab's answer held behind it, and on a phone the scope being left mounted first; the Inbox's moves rendered each page twice. The frame takes the route from the same pathname the page reads, in the same render.

**Files:** `LegacyHost.tsx`, `LegacyApp.tsx`, `app-shell.jsx`; test `tooling/scripts/tests/shell/surfaces/shell-status.test.mjs`.

- [x] **Step 1: the failing test.** Beside "a move that stays on the page…" in `shell-status.test.mjs`:

```js
test("given the router's route (routeNow), the frame draws it and nothing else: an address heard before the router lands moves nothing", () => {
  shell.installShell(win);
  const draw = (routeNow) => {
    deep = false;
    frames.begin();
    const t = win.ChanlyticsApp({ ...PAGES, theme: "dark", themePref: "dark", sidebar: "open", onSidebar() {}, onTheme() {}, routeNow });
    deep = true;
    return t;
  };
  const viewOf = (t) => find(t, (n) => typeof n.props?.className === "string" && n.props.className.includes("route-view"));
  mount("#/clients");
  const before = viewOf(draw("clients")).key;
  // The address moves first (a pushed entry the router has not drawn yet): the frame still draws People.
  placeAt("#/clients/leads");
  fire("popstate");
  assert.equal(viewOf(draw("clients")).key, before, "the heard address does not move the frame");
  // The router lands: Leads, under its own mount.
  assert.equal(viewOf(draw("clients/leads")).key, "clients/leads");
});
```

- [x] **Step 2: run it, red** (`routeNow` is ignored): `node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/shell-status.test.mjs`.

- [x] **Step 3: the frame.** In `app-shell.jsx`:

```js
/** A route's page and param, from the route as written (`inbox/th-1`). */
const routeParts = (r) => {
  const [page, param] = r.split("/");
  return { page: page || "today", param: param || null };
};
const parseRoute = () => routeParts(window.CHANLY.address.route());
```

`ChanlyticsApp` takes `routeNow = null`; `const [heard, setRoute] = useShellState(parseRoute()); const route = routeNow !== null ? routeParts(routeNow) : heard;`. `useShellRouting` takes `follows: routeNow === null` and subscribes `hear` only then (`useShellEffect(() => (follows ? window.CHANLY.address.hear(() => setRoute(parseRoute())) : undefined), [follows])`). The comment over `ChanlyticsApp` says why: the router's route is the one clock, so the frame and the page change in one render.

- [x] **Step 4: the host.** `LegacyHost.tsx`: `const Frame = memo(function Frame({ page, route }: { page: ReactNode; route: string | null }) { return <LegacyApp routePage={page} route={route} />; });` and `<Frame page={…} route={home ? null : routeOfPath(pathname) || "today"} />`. `LegacyApp` takes `route?: string | null`, `useShellApp(…, routePage, route)` passes `routeNow={route ?? null}` and lists `route` in the memo's deps; `ChanlyticsAppComponent` gains `routeNow?: string | null`.

- [x] **Step 5 (as built): `useViewFade` keeps its render-time record.** The node suite's stub React runs an effect once per hook, so the "committed" record below cannot be kept there; the record made in render already holds across a transition that is rendered again (the same key keeps its decision), and only a move abandoned mid-flight compares with the abandoned one, whose slide points the same way. Kept as it was; Task A2 adds `!slide` to `stay`.
- [x] **Step 5b (found while measuring): the press paints first.** Next applies a pushed entry in a transition, but People's scope draws in one piece of 60 to 120 ms at 4x that started before the browser painted, so the tab still lit with the page. `surface-tabs.jsx` `stAfterPaint`: the move goes after one painted frame (`requestAnimationFrame` then a task); at once where there are no frames (the node suite). Measured: People's tab lit 25 to 31 ms on a phone (the Inbox's 18 to 35).
- Not built (kept for the record), the committed-view variant:

```js
const useViewFade = ({ page, param }, mountKey, routeLoading) => {
  const viewKey = routeLoading ? `${mountKey}/reading` : mountKey;
  const family = …as now…;
  const place = window.stripPlace ? window.stripPlace(page, param) : null;
  const committed = useShellRef({ key: null, family: null, reading: false, place: null });
  const decided = useShellRef({ key: null, stay: false, slide: null });
  if (decided.current.key !== viewKey) {
    const prev = committed.current;
    const slide = prev.key !== null && !prev.reading && window.stripSlide ? window.stripSlide(prev.place, place) : null;
    decided.current = { key: viewKey, slide, stay: !routeLoading && prev.key !== null && prev.family === family && !prev.reading && !slide };
  }
  React.useLayoutEffect(() => { committed.current = { key: viewKey, family, reading: routeLoading, place }; });
  return { viewKey, routeStay: decided.current.stay, routeSlide: decided.current.slide };
};
```

(`!slide` in `stay` is Task A2's; write it here once.) If the stub React has no `useLayoutEffect`, `useShellEffect` holds the same meaning there.

- [x] **Step 6: green.** Run the test file again; then `one-inbox.test.mjs`, `people/people-honest.test.mjs`, `workspace/workspace-path.test.mjs`, `people/moments/people-views.test.mjs`.

- [x] **Step 7: measure** (production build, `tab-switch.mjs` both families, desk and phone, tap and swipe): People's tab lit within ~50 ms on a phone at 4x; no `ins[]` line with the departing scope's root in the new `main`; the Inbox's `ins[]` shows one page root per switch.

- [x] **Step 8: commit** `The frame takes its route from the router, so a move draws once and the tab answers first`.

### Task A2: Motion parity

- [x] **Step 1: the route-stay test says the new rule.** In `shell-status.test.mjs` the test "a move that stays on the page…" becomes "a move between two views of one strip arrives as the Inbox's tabs do; a move within one family that is no strip move draws at once": People → Leads and back are **not** `route-stay`; `#/clients/c-aisha` → `#/clients/c-bob` **is**; the reading-pane cases stay as they are. Red, then Task A1's `!slide` makes it green.

- [x] **Step 2: the rows rise in on arrival.** New `apps/dashboard/src/surfaces/kit/motion/use-rows-arrive.ts`:

```ts
/**
 * A table's rows rise in as the table arrives, as the Inbox's and Conversations' rows do (components.css, the entrance
 * stagger, `rise-in`): the first twelve, 30 ms apart, once, on the draw that mounts it. Rows drawn later (the budget's next
 * three hundred, a refresh) come as they are. Not under reduced motion.
 */
import { useLayoutEffect, useRef } from "react";

const RISE_PX = 4;
const RISE_MS = 260;
const STEP_MS = 30;
const FIRST = 12;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

export function useRowsArrive<T extends HTMLElement = HTMLTableElement>() {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>(":scope > tbody > tr")).slice(0, FIRST);
    rows.forEach((tr, i) =>
      tr.animate(
        [{ opacity: 0, transform: `translateY(${RISE_PX}px)` }, { opacity: 1, transform: "none" }],
        { duration: RISE_MS, delay: Math.min(i, 8) * STEP_MS, easing: EASE_OUT, fill: "backwards" },
      ),
    );
  }, []);
  return ref;
}
```

`PeopleTable` takes it on its `<table>` (`const arrive = useRowsArrive<HTMLTableElement>();` … `<table ref={arrive} …>`). Export it from the kit's barrel beside `useSwapMotion` if that is where `useSwapMotion` is exported.

- [x] **Step 3: a test for it** in the kit's motion test (find it: `grep -rln "useSwapMotion" tooling/scripts/tests`), on the stub DOM the file already uses: twelve of twenty rows animate, the delays are 0, 30 … 240, 240; nothing animates under reduced motion.

- [x] **Step 4: the swap rise reaches Leads and the Pipeline.** `useSwapMotion(key, parts?)`: with `parts` (a selector), it animates each matching child of the ref's element instead of the element. `PeopleTable`: in the sections branch the `swapRef` goes on the `<table>` and the page asks `useSwapMotion(key, ":scope > tbody")`. Leads: `LeadsReal` asks `useSwapMotion<HTMLTableSectionElement>(viewRoute)` keyed on the view's route without the lead open over it (`clients/leads:s-…:l-…:c-…`, never `:p-…`) and threads it through `props.tsx` and `scope/scope.tsx` to `PeopleTable swapRef`. The Pipeline: `scope-state.ts` asks `useSwapMotion<HTMLTableElement>(view, ":scope > tbody")` keyed on the rail's view and threads it to its `PeopleTable`. Tests: the existing Leads and Pipeline page tests find `swapRef` on the table they draw.

- [x] **Step 5: green, measure, look.** `tab-switch.mjs` desk: People ↔ Leads `anim route-in`; phone: `route-slide-*`. Screenshot the arrival on a desk at 1440 and a phone at 390.

- [x] **Step 6: commit** `People's scopes arrive as the Inbox's tabs do, and their rows rise in`.

### Task A3: The light drifts on layers of its own

`pg-drift` animates six registered, inherited properties on `.app-root`, so every element of the page is styled again on every frame (idle at 4x: 3.6 to 4.1 s of long tasks in 5 s, 15 fps; unthrottled 44 fps).

- [x] **Step 1: the test says the new rule.** `tooling/scripts/tests/styles/page-light-drift.test.mjs`: (1) no rule sets an animation on `.app-root` at any width or motion preference; (2) no `@keyframes` in `components.css` sets a custom property; (3) the pools' layers (`.pg-light > *`) animate on a desk with no motion preference and at no phone width and under reduced motion at none, by the same media reading the file already does; (4) the keyframes they run set only `transform`. Red.

- [x] **Step 2: the tints are tokens.** In both Glass blocks of `tokens.css`, `--pool-a-tint`, `--pool-b-tint`, `--pool-c-tint` take today's three colours, and `--surface-page-light` is written over them (the same gradients, the same positions). The six `@property` registrations go, and their comment.

- [x] **Step 3: the layer.** `app-shell.jsx` `appChrome`: first child of `.app-root`, `{glass && <div className="pg-light" aria-hidden="true"><span /><span /><span /></div>}`.

- [x] **Step 4: the rules** (components.css, where `pg-drift` stood):

```css
/* The pools of light move as the canvases' do, each on a layer of its own moved by a transform, which the compositor
   runs: nothing of the page is styled again. On a desk the ground is the document's (html's --surface-page-fill), the
   body and the app's root let it through, and the layers stand between, 10% past every edge so a moving pool never
   shows its layer's side. A phone keeps the root's own paint (the page's top over the pools) and no layers. */
.pg-light { display: none; }
@media (min-width: 901px) {
  html[data-look="glass"]:has(.app-root) body,
  .app-root[data-look="glass"] { background: transparent; }
  :where([data-look="glass"]) .pg-light { display: block; position: fixed; inset: 0; z-index: -1; pointer-events: none; }
  .pg-light > span { position: absolute; inset: -10%; will-change: transform; }
  .pg-light > :nth-child(1) { background: radial-gradient(calc(39% / 1.2) calc(40% / 1.2) at calc((23% + 10%) / 1.2) calc((6% + 10%) / 1.2), var(--pool-a-tint), transparent); }
  .pg-light > :nth-child(2) { background: radial-gradient(calc(43% / 1.2) calc(36% / 1.2) at calc((89% + 10%) / 1.2) calc((40% + 10%) / 1.2), var(--pool-b-tint), transparent); }
  .pg-light > :nth-child(3) { background: radial-gradient(calc(37% / 1.2) calc(33% / 1.2) at calc((39% + 10%) / 1.2) calc((91% + 10%) / 1.2), var(--pool-c-tint), transparent); }
}
@media (min-width: 901px) and (prefers-reduced-motion: no-preference) {
  .pg-light > :nth-child(1) { animation: pg-pool-a 20s ease-in-out infinite alternate; }
  .pg-light > :nth-child(2) { animation: pg-pool-b 20s ease-in-out infinite alternate; }
  .pg-light > :nth-child(3) { animation: pg-pool-c 20s ease-in-out infinite alternate; }
}
/* The canvases' drift, as a move of each layer by a share of the window (the layer is 1.2 windows wide and tall). */
@keyframes pg-pool-a { to { transform: translate(calc(6% / 1.2), calc(6% / 1.2)); } }
@keyframes pg-pool-b { to { transform: translate(calc(-5% / 1.2), calc(6% / 1.2)); } }
@keyframes pg-pool-c { to { transform: translate(calc(6% / 1.2), calc(-5% / 1.2)); } }
```

(The literal positions are the tokens' `--pool-*-x/y`; write them through `var()` if `calc()` over a `var()` percentage paints the same in Chrome and Safari, else keep the literals with a comment naming the tokens.)

- [x] **Step 5: prove the light did not move.** With every animation finished at its start (`document.getAnimations().forEach(a => a.pause())`, `currentTime = 0`), screenshot Today and the Inbox at 1440×900 light and dark, before (HEAD~) and after: per-pixel difference under 1% of channels by more than 2 levels. Then `idle.mjs inbox 1440 900 4` and `1`: no long tasks idle at 1x, fps 60.

- [x] **Step 6: commit** `Glass's light drifts on layers moved by a transform, so a desk's page is not styled again every frame`.

### Task A4: A page walked across moves as the finger lets go

`swipeLeave` plays the leave (180 ms) and only then presses the tab: with the move a background render now, it starts at the lift.

- [x] **Step 1: the test.** In the data-bits gesture test (find it: `grep -rln "touchSwipe" tooling/scripts/tests`): a `pages` walk past a third calls `go` before the leave's timer fires, once; a walk short of it never calls it; a page that `stays` is still turned in after `go`, as now.

- [x] **Step 2:** `swipeLeave(g, close)`: `const early = way === "page" && !(g.pages && g.pages.stays); if (early) close();` and in `done`, `if (!early) close();`. The check after `PAGE_KEPT_MS` is unchanged.

- [x] **Step 3: green; measure** `tab-switch.mjs … swipe`: lift → new page down by ~180 ms on both families. **Commit** `A swipe across the strip moves as the finger lets go`.

## Phase B: less work, and the small ones

### Task B1: Leads paints a held view it read since the last change, with no read behind

- [x] **Step 1: the test** (Leads' surface test; find it: `grep -rln "leadsView\|readView" tooling/scripts/tests/leads`): over the fake wire, `leadsView(route)` twice with no change between asks the wire once; after `leadsOverride.apply()` (a change) the second asks again; a view held longer than `LEADS_HELD_FRESH_MS` asks again.

- [x] **Step 2:** `LeadsLoaded` gains `readAt: number`, set by `readPageOne` and `refreshView`; a module `let changedAt = 0`, set to `Date.now()` at the start of `leadsOverride.apply`; `readView`'s held branch refreshes behind only when `have.readAt < changedAt || Date.now() - have.readAt > LEADS_HELD_FRESH_MS` (two minutes, from `contracts/shared/time.ts`).

- [ ] **Step 3 (not built, 5 Oct, measured first): the server counts the rail once.** The two counts run in parallel inside two requests the page sends in parallel; `GET leads` page one (~95 ms app time here) sets the wait, not `GET lead-searches` (~70), so dropping one count saves database work and no time anyone sees, and Step 2 already removes most of the refreshes that asked for both. It would need a query on the route, a contracts schema, the generated client and the API reference. Left as it was. The plan as first written: `GET lead-searches` takes `counts=none` (a query schema in contracts beside the route's DTOs; `read({ query })` as `GET leads` does), and `searchesOf(ctx, tenantId, { counts })` skips `listCounts` then; the Leads page passes it from `readPageOne` and `refreshView`, where page one's counts are the ones used (`page.counts ?? searches.counts`). Regenerate `node tooling/scripts/gen/route-types.mjs`, `corepack pnpm gen:api-reference`; a route test proves `counts=none` answers no counts and the default still does.

- [x] **Step 4: green; measure** (`tab-switch.mjs people … tap`): `reqs 0` on a switch within two minutes. **Commit** `Leads paints a view it already read with no read behind it, and the rail is counted once`.

### Task B2: People keeps the rows that did not change

- [x] **Step 1: the test** (People's surface test): publish twice with one contact changed; every other row VM, and the attention entries of every other row, are the same objects (`assert.equal(a, b)`), and the `attention` map is the same object when nothing changed.

- [x] **Step 2:** in `people/surface.ts`, after `peopleSurfaceOf`, `keepUnchanged(prev, next)`: a row whose new VM is structurally equal to the last published VM of that id keeps the last object; the same for `attention[id]`; an `attention` map with every entry kept is the last map. One structural-equality helper, in the module (search first for one in contracts: `grep -rn "export function sameShape\|deepEqual" packages/contracts/src apps/dashboard/src`).

- [x] **Step 3: green; measure** a refresh on People (`window.dispatchEvent(new Event("surface:clients"))` is not a refresh; use the runner's `refreshSurface("people")` from the console of the measuring page): the long task it causes before and after. **Commit** `People keeps the rows that did not change, so a refresh redraws only what moved`.

### Task B3: People's strip swipes where its page is one column, and the tabs are links

- [x] **Step 1: tests.** `people-honest.test.mjs`: the strip's tabs are `<a>` with the route's href (`/w/<slug>/people/leads`), `aria-current="page"` on the picked one; `people-views.test.mjs` walks `a` where it walked `button`. `one-inbox.test.mjs`'s `strip()` still reads labels, active and badges.
- [x] **Step 2:** `SurfaceTabs` draws `<a className="stabs-tab …" href={stHref(t.to)} onClick={…}>`: a plain press (`button 0`, no modifier) prevents the browser's own move and does what the button did; any other press is the browser's (a new tab). `kit.css` `.stabs-tab`: `text-decoration: none` (and `color: inherit` if the link colour shows). Gallery entry (`tooling/scripts/e2e-harness/kit-gallery.mjs`) draws `<a class="stabs-tab">`; `kit-gallery.test.mjs`'s two samples follow.
- [x] **Step 3:** `app-shell.jsx` stamps `data-strip={place && place.strip}` on `main`; `stripPager` answers for a view whose strip is `people` up to 900px, every other strip up to 720 (`stripPhone(view)`); components.css adds the slide rules for `[data-strip="people"]` between 721 and 900.
- [x] **Step 4: e2e pins** (`grep -rn "stabs-tab\|getByRole(\"button\", { name: \"\(Leads\|People\|Pipeline\|Needs you\|Conversations\|Live\)\"" e2e`): a pin that names the role button moves to link. **Commit** `The strip's tabs are links, and People's strip swipes wherever its page is one column`.

### Task B4: Keep visited scopes alive (decided by measurement)

**Decided 5 Oct 2026, not built (both gates failed):** (1) with A1 to B1 in, People's switch is at the Inbox's (phone taps at 4x: People 68 to 198 ms to the page, the Inbox 63 to 222; swipes 63 to 142 ms on both; the Inbox remounts each tab too), so keeping scopes alive goes past parity rather than to it. (2) A hidden scope keeps its DOM, and People, Leads and the Pipeline draw one table: twenty e2e locators count `.cl-table tbody tr` (and `.cl-row-bucket-pill`, `people-table-scroll`, `bulk-bar`, `lead-name`) across the page (`e2e/people/*.spec.ts`), which a kept scope would double, and only the production nightly runs them. Building it means scoping those locators to the visible scope first; left for Ruben to call.

Ruben approved keeping People's scopes alive with React `<Activity>`. Before building it, after A1 to A4 and B1:

- [ ] **Step 1: measure** People ↔ Leads at 4x on a phone with A1 to B1 in. If press → page is at the Inbox's (within 30 ms of its median), the remaining gain of keeping the scopes alive is the mount alone.
- [ ] **Step 2: the duplicate audit.** A hidden scope keeps its DOM (`display: none`): list every test id and class two scopes draw (`PeopleTable`'s `people-table-scroll`, `select-all`, the rail, the phone bar) that an e2e spec locates without `.first()` or a visible filter, and every `document.querySelector` in `surfaces/people`, `surfaces/leads` and the frame that would find the hidden one first.
- [ ] **Step 3: decide and say.** Build it (one mount for the three scopes in `people/chrome.ts`; `PeopleRoute` draws each scope visited under `<Activity mode>`; the frame plays the arrival on `main` with the Web Animations API when the strip's place moves under one mount; `stripPager` turns a page that `stays` in only once the tab's `aria-current` has moved) only if steps 1 and 2 show a gain worth the duplicates' fixes; otherwise record the numbers and the audit in this plan and in memory, and leave it for Ruben.

## Phase C: the kit and Base UI track

A second plan, `docs/superpowers/plans/2026-10-05-the-strip-and-the-kit-on-base-ui.md`, written once Phase B is green: the strip as the kit's TSX `ViewTabs` (links, the glide), Leads' menus on the kit `Menu`, a checkbox group in the kit `Menu` for People's Columns, and the phone's sheets on Base UI's `Drawer`, each with its gallery entry, its `kit-behaves` spec and its bundle budget.

## Self-review

- Spec coverage: fixes 1 (A1), 2 (A1, the press's sync update paints before the transition), 3 (A2), 4 (B4), 5 (B1, B2; realtime notices carrying ids need a migration and stay Ruben's), 6 (A4), 7 (A3), 8 (B3); Base UI (Phase C).
- Names: `routeNow`, `routeParts`, `useRowsArrive`, `useSwapMotion(key, parts)`, `LEADS_HELD_FRESH_MS`, `readAt`, `changedAt`, `keepUnchanged`, `.pg-light`, `--pool-*-tint`, `pg-pool-a/b/c`, `data-strip`.
