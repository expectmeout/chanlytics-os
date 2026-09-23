# The One Badge System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every badge in Chanlytics OS is one of five shapes (pill, chip, tally, mark, dot) at one size each, and a colour means one thing on all of them, as the approved spec says.

**Architecture:** The shapes live once, in `components.css` (`.pill` with option B's quiet state for `ok`/`plain`, `.chip`, `.tally`, `.mark`), plus the touch floor in `legacy-bridge/legacy.css`. Every page adds the shape's class to its element and loses its own visual rules, keeping only layout. `StatePill` is unchanged: its tone class already selects filled or quiet. Contracts change in two places: `tone.ts` makes roles plain, and `today.ts` makes Worth a look's two `danger` rows `warn`.

**Tech Stack:** legacy JSX pages (classic scripts, loaded by `legacy-bridge/manifest.ts` in the app and by `Chanlytics.html` in the harness), plain CSS on the app's tokens, `node:test` over the stub React (`tooling/scripts/tests/_legacy-react.mjs`), Playwright specs in `e2e/` (nightly).

**Spec:** `docs/superpowers/specs/2026-09-23-one-badge-system-design.md`. **Review page:** https://claude.ai/artifact/7gHvLSThQ8mnmm3xttY7D5. **Worktree:** `cm-badges`, branch `design/one-badge-system` off `18c79973` (#918).

**Run one test file:** `node --conditions=react-server --import tsx --test tooling/scripts/tests/<file>.test.mjs` from the worktree root.

**See a page:** the dev server `cm-badges-next` (the parent folder's `.claude/launch.json`, port 3291), signed in, at `http://localhost:3291/w/melanys-beauty-salon/#/<route>`. CSS is proved there, never by reading the stylesheet: the source-scan ratchet refuses a new `readCode`/`readRaw`.

**The measuring probe** (paste into the pane's `javascript_tool` once per page load; `__bp()` lists every badge-like element's computed geometry and colours by class):

```js
window.__bp = () => {
  const out = new Map();
  const clear = (c) => !c || c === "transparent" || c === "rgba(0, 0, 0, 0)" || /\/ 0\)$/.test(c);
  for (const el of document.querySelectorAll(".app-root *")) {
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6 || r.height > 32 || r.width > 300) continue;
    const cs = getComputedStyle(el);
    const text = (el.textContent || "").trim().replace(/\s+/g, " ");
    if (text.length > 46 || el.querySelectorAll("*").length > 8) continue;
    const ground = !clear(cs.backgroundColor), edge = parseFloat(cs.borderTopWidth) > 0 && !clear(cs.borderTopColor);
    const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className);
    if (!ground && !edge && !/\b(pill|chip|tally|mark)\b/.test(cls)) continue;
    if (/(^| )btn( |$)/.test(cls)) continue;
    const key = [el.tagName.toLowerCase() + "." + cls.trim().split(/\s+/).slice(0, 3).join("."), "h" + Math.round(r.height * 10) / 10, cs.fontSize, "w" + cs.fontWeight, "p" + cs.paddingTop + "/" + cs.paddingRight, "r" + cs.borderTopLeftRadius, cs.textTransform === "none" ? "" : cs.textTransform, ground ? "bg " + cs.backgroundColor : "", edge ? "bd " + cs.borderTopColor : "", "fg " + cs.color].filter(Boolean).join(" | ");
    const e = out.get(key) || { n: 0, ex: [] };
    e.n++; if (e.ex.length < 3 && !e.ex.includes(text)) e.ex.push(text);
    out.set(key, e);
  }
  return [...out].map(([k, e]) => `${e.n}x ${k} :: ${e.ex.join(" / ")}`).join("\n");
};
```

**The words probe** (Task 7): every piece of text drawn in a raw tone colour, and every "need(s) you" drawn red:

```js
window.__tp = () => {
  const probe = document.createElement("span"); document.body.appendChild(probe);
  const tok = (v) => { probe.style.color = `var(${v})`; return getComputedStyle(probe).color; };
  const raw = Object.fromEntries(["--ok", "--warn", "--info", "--danger", "--accent"].map((v) => [tok(v), v]));
  const reds = new Set([tok("--danger"), tok("--danger-ink")]); probe.remove();
  const hits = [];
  for (const el of document.querySelectorAll(".app-root *")) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
    if (!own || own.length > 60 || !el.getClientRects().length) continue;
    const c = getComputedStyle(el).color, cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className);
    if (raw[c]) hits.push(`raw ${raw[c]}: .${cls} "${own.slice(0, 30)}"`);
    if (reds.has(c) && /needs? you/i.test(own)) hits.push(`red needs-you: .${cls} "${own.slice(0, 30)}"`);
  }
  return hits.join("\n") || "clean";
};
```

**Ground rules**

- The files under `apps/dashboard/src/legacy/` are production (`/w/<slug>` → `LegacyHost` → `manifest.ts`). "legacy" is a folder name.
- Keep every existing class that a test, an e2e spec or another rule uses as a hook; add the shape's class beside it and delete only the visual declarations the shape now owns.
- Mockup-only pages (`agent-fleet`, `agent-store`, `agent-studio`, `content-cal`, `pipeline`, `segments`, `tasks`, and the seeded `calendar.jsx`, `live-monitor.jsx`, `outbound.jsx`, `broadcasts.jsx`) follow the CSS automatically. Touch their markup only where a class this plan deletes would leave an element unstyled; each such spot is named below.
- `next dev` rewrites `apps/dashboard/tsconfig.json` and `apps/dashboard/next-env.d.ts`. Never stage them: `git add` by path.
- Commit after each task. The pre-commit hook formats staged files.
- Line numbers are the files as they stand at `18c79973`, before any task; after an earlier task edits a file, find the rule or line by the text quoted beside its number.

## File map

| File | Tasks | What changes |
|---|---|---|
| `packages/contracts/src/tone.ts` | 1 | `role` row all `plain` |
| `packages/contracts/src/today.ts` | 1 | "Booking gap", "No reply" `danger` → `warn`; `TodayLeakVM.tone` loses `danger` |
| `packages/*/dist` | 1 | rebuilt |
| `apps/dashboard/src/legacy/styles/components.css` | 2, 3, 4, 5, 7 | the shapes; nav, bell, tabs, flag, policy, Playbooks, Templates, agenda rules |
| `apps/dashboard/src/legacy-bridge/legacy.css` | 2 | touch floor: no pill, a chip grows its target |
| `apps/dashboard/src/legacy/styles/{clients,conversations,inbox,live,settings}.css` | 2, 3, 4, 5, 7 | per-page pill overrides gone; rail counts; words |
| `apps/dashboard/src/legacy/styles/{dashboard-a-v2,people,record,reports,calendar,leads,mobile}.css` | 3–8 | per-shape edits |
| `apps/dashboard/src/legacy/components/{sidebar,surface-tabs,topbar,data-bits,record-row,campaign-bits,day-agenda}.jsx` | 3, 4, 5, 7 | shape classes |
| `apps/dashboard/src/legacy/pages/*.jsx` (listed per task) | 3–8 | shape classes, removals |
| `apps/dashboard/src/legacy/Chanlytics.html` | 9 | `?v=` one past main and every open PR, per edited file |
| `apps/dashboard/src/legacy/CLAUDE.md` | 9 | the badge rule; the touch-floor line |
| `tooling/scripts/tests/{state-pill,today-page,one-inbox,broadcasts-honest,people-honest,settings-doors}.test.mjs` | 1, 3–6 | follow the new classes; new assertions |

---

### Task 1: Contracts: a role is a name, and Worth a look never says danger

**Files:**
- Modify: `packages/contracts/src/tone.ts` (the `role:` line inside `TONE_OF`)
- Modify: `packages/contracts/src/today.ts` (`TodayLeakVM.tone`, the two leak rows with `tone: "danger"`)
- Test: `tooling/scripts/tests/state-pill.test.mjs`, `tooling/scripts/tests/today-page.test.mjs`

- [ ] **Step 1: Write the failing tests.** In `state-pill.test.mjs`, replace

```js
  assert.equal(stateTone("role", "owner"), "info", "an owner's badge is distinguished, not live");
```

with

```js
  // A role is a name, not a state. The owner's badge was blue, which on every other badge says "in progress".
  for (const role of ["owner", "operator", "viewer"]) assert.equal(stateTone("role", role), "plain", role);
```

In `today-page.test.mjs`, inside the test `"worth a look: …"`, directly after `assert.equal(rows.length, 2);` add

```js
  // Worth a look asks for a look; a failure is red on every other badge, and these rows are not failures.
  for (const l of rows) assert.ok(["warn", "info"].includes(l.tone), `${l.id} is ${l.tone}`);
```

- [ ] **Step 2: Run them and see them fail.**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/state-pill.test.mjs tooling/scripts/tests/today-page.test.mjs`
Expected: FAIL. `owner` is `"info"`; `never-booked is danger`.

- [ ] **Step 3: Implement.** In `tone.ts`:

```ts
  role: { owner: "plain", operator: "plain", viewer: "plain" },
```

In `today.ts`, the interface:

```ts
  /** A look, never a failure: amber where a person should look, blue for what waits on someone else. */
  tone: "warn" | "info";
```

and in `todayLeaks`, change `tone: "danger"` to `tone: "warn"` on the `never-booked` row (tag "Booking gap") and the `unanswered` row (tag "No reply"). `grep -n 'tone: "danger"' packages/contracts/src/today.ts` must print nothing inside `todayLeaks` afterwards.

- [ ] **Step 4: Rebuild contracts and run the tests.**

Run: `cd packages/contracts && corepack pnpm run build && cd ../..` then the command from Step 2.
Expected: PASS. Then `node --conditions=react-server --import tsx --test tooling/scripts/tests/today-leaks.test.mjs`: PASS.

- [ ] **Step 5: Commit, then check the dists.**

```bash
git add packages/contracts/src/tone.ts packages/contracts/src/today.ts tooling/scripts/tests/state-pill.test.mjs tooling/scripts/tests/today-page.test.mjs packages/contracts/dist
git commit -m "A role is a name and Worth a look never says danger: the tone map's two changes for one badge system"
node tooling/scripts/check-dist.mjs
git diff -w --ignore-cr-at-eol --stat -- packages/*/dist
```

Commit every dist with a real diff (`git add packages/<pkg>/dist && git commit -m "The dists that bundle contracts"`); `git checkout --` only those whose diff is line endings. `check-dist` must end with `dist in sync with src`.

---

### Task 2: The shapes

**Files:**
- Modify: `apps/dashboard/src/legacy/styles/components.css:566-592` (the pill block), `:2371`
- Modify: `apps/dashboard/src/legacy-bridge/legacy.css:48-58`
- Modify: `clients.css:1395-1397, 2348-2349`; `conversations.css:200-207`; `inbox.css:329-335, 2000-2001, 2152-2159`; `live.css:70, 484-491`; `settings.css:164, 212-218`
- Modify: `apps/dashboard/src/legacy/pages/inbox-list.jsx:371-375` (the wait chips join the pill family)
- Test: `tooling/scripts/tests/state-pill.test.mjs` (the REGRESSION test reads `ix-wait`), the page in the pane

- [ ] **Step 1: Replace the pill block** in `components.css` (from `/* ---------- Pills / badges ---------- */` through the `.pill-accent{…}` line) with:

```css
/* ---------- Badges: one shape per job ----------
   docs/superpowers/specs/2026-09-23-one-badge-system-design.md. Five shapes, one size each; no page keeps its own.
     pill   a state (StatePill; the tone is contracts' tone.ts). A ground means "look here": warn, info, danger and
            the live accent are filled. A state at rest (ok, plain) is its 6px dot and its word.
     chip   a name: a list, a person, a role, a service, a source. A hairline and no fill, never a tone.
     tally  a number riding on a tab, a nav row, a filter or an icon. Grey for a total, amber for people who need you.
     mark   what kind of row this is. Neutral always: the row's pill or its words say the tone.
   Words take the tone's -ink, never the raw tone: 4.5:1 or better, on a tint too (tokens.css, #749). */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 20px;
  padding: 0;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: -0.005em;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--ink-muted);
  white-space: nowrap;
}
/* At rest: the dot says the tone and the word says the state. An icon inside a pill is its own marker. */
.pill::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--ink-faint); }
.pill-ok::before { background: var(--ok); }
.pill:has(> .icon)::before { content: none; }
/* Asks to be seen: the tone's ground and its ink, and no dot. A dot inside a filled pill means live, and a live pill
   carries its own (StatePill's .live-dot). */
.pill-warn, .pill-info, .pill-danger, .pill-accent { gap: 5px; padding: 0 8px; }
.pill-warn::before, .pill-info::before, .pill-danger::before, .pill-accent::before { content: none; }
.pill-warn { color: var(--warn-ink); background: var(--warn-soft); }
.pill-info { color: var(--info-ink); background: var(--info-soft); }
.pill-danger { color: var(--danger-ink); background: var(--danger-soft); }
.pill-accent { color: var(--accent-ink); background: var(--accent-soft); }
/* A dot drawn inside a pill by hand says the pill's own dot twice. */
.pill .dot { display: none; }

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  height: 20px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: none;
  font: inherit;
  font-size: 11px;
  font-weight: 400;
  line-height: 1;
  color: var(--ink-muted);
  white-space: nowrap;
  transition: color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out);
}
button.chip, a.chip { cursor: pointer; }
button.chip:hover, a.chip:hover, .chip:has(> button:hover) { color: var(--ink); border-color: var(--line-strong); }
button.chip:focus-visible, a.chip:focus-visible { outline: none; box-shadow: var(--focus-ring); }
/* A chip that opens its name and can be taken off: the name is one button, the × another. */
.chip > button { display: inline-flex; align-items: center; min-width: 0; padding: 0; border: 0; background: none; font: inherit; color: inherit; cursor: pointer; }
.chip > button:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: 4px; }
.chip:has(> .chip-x) { padding-right: 3px; }
.chip > .chip-x { justify-content: center; flex: none; width: 14px; height: 14px; border-radius: 50%; color: var(--ink-faint); }
.chip > .chip-x:hover { color: var(--ink); background: var(--bg-hover); }

.tally {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  min-width: 16px;
  height: 16px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--bg-active);
  color: var(--ink-muted);
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.tally-warn { background: var(--warn-soft); color: var(--warn-ink); }
/* On an icon (the bell, the phone's Inbox tab): a ring of the page lifts it off the glyph, and the amber ground turns
   opaque so the glyph does not show through it. */
.tally-icon { box-shadow: 0 0 0 2px var(--bg); }
.tally-icon.tally-warn { background: color-mix(in oklab, var(--warn) 22%, var(--bg-raised)); }

.mark {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--bg-sunken);
  color: var(--ink-muted);
}
```

Delete `components.css:2371` (`.pb-tile-head > .pill:not([data-tone]) { … }`): at rest, "Not set up" is the quiet state.

- [ ] **Step 2: The touch floor.** In `legacy.css`, replace the block from `/* Inline text-buttons (chips, links-as-buttons) grow by padding instead of` through its closing `}` with:

```css
  /* Inline text-buttons (links-as-buttons) grow by padding instead of
     box height so they don't blow up line layout. */
  html.legacy-on .brief-chip,
  html.legacy-on .td-link {
    min-height: 36px;
    padding-top: 8px;
    padding-bottom: 8px;
  }
  /* A pill is words and a tally is a number: neither is pressed, so neither
     takes a floor (every list row used to undo one on .pill). A chip that is
     pressed keeps its 20px look and grows its target: an invisible margin
     around each of its buttons. */
  html.legacy-on .chip,
  html.legacy-on .chip > button {
    min-height: 0;
  }
  html.legacy-on button.chip,
  html.legacy-on .chip > button {
    position: relative;
  }
  html.legacy-on button.chip::after,
  html.legacy-on .chip > button::after {
    content: "";
    position: absolute;
    inset: -8px -3px;
  }
```

- [ ] **Step 3: Delete the per-page undo of the floor and every private pill size.**
  - `clients.css:2348-2349`: the comment `/* A pill is words, not a control: … */` and `html.legacy-on .pl-card > .pill { … }`.
  - `conversations.css:200-207`: the comment and `html.legacy-on .cv-row .pill { … }`.
  - `inbox.css:2152-2159`: the comment and `html.legacy-on .ix-thread .pill { … }`.
  - `live.css:484-491`: the comment and `html.legacy-on .lm-row .pill { … }`; and `live.css:70` (`.lm-row-foot .pill { height: 16px; … uppercase; }`).
  - `settings.css:164` (`.settings .pill { height: 22px; … }`) and `settings.css:212-218` (the comment and its `@media (pointer: coarse)` block).

- [ ] **Step 4: The two heads keep their quiet look.** In `clients.css`, replace lines 1395-1397 with:

```css
.cl-prof-now .pill { padding: 0; background: transparent; gap: 6px; font-size: var(--text-sm); font-weight: 400; }
.cl-prof-now .pill::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
/* The head says every standing as a dot and a word in its own ink (the Quiet record, #915); a green one stays green. */
.cl-prof-now .pill-ok { color: var(--ok-ink); }
.cl-prof-now .pill .live-dot { display: none; }
```

In `inbox.css`, replace lines 2000-2001 with:

```css
.ix-th-standing .pill { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; line-height: 20px; }
/* Inline-block so the words clip: the quiet state's dot is laid inline, and a filled pill draws none. */
.ix-th-standing .pill::before { display: inline-block; margin-right: 6px; vertical-align: 1px; }
```

and in `.ix-thread-meta > .ix-name-pill` (`inbox.css:329-335`) change `line-height: 18px;` to `line-height: 20px;` and add after the rule:

```css
.ix-thread-meta > .ix-name-pill::before { display: inline-block; margin-right: 6px; vertical-align: 1px; }
```

- [ ] **Step 5: The wait chips are pills.** In `inbox-list.jsx:371-375`, change the three spans to:

```jsx
                          <span className="pill pill-accent ix-wait ix-sending tabular"><span className="ix-veto-dot" aria-hidden="true" /> sending in {sending}s</span>
```
```jsx
                          <span className={`pill ix-wait tabular ${t.waitingMin > 30 && (t.real ? t.needsYou : !t.claimedByOther) ? "pill-warn" : ""}`}>waiting {t.waited || `${t.waitingMin}m`}</span>
```
```jsx
                          <span className="pill ix-wait tabular"><Icon name="clock" size={9} /> {t.wake}</span>
```

(keep each line's surrounding condition exactly as it is). In `inbox.css`, reduce the `.ix-wait { … }` block to `.ix-wait { flex: none; }` and delete `.ix-wait.warn { … }`; keep `.ix-sending` and `.ix-sending .ix-veto-dot`.

- [ ] **Step 6: Run the pill tests.**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/state-pill.test.mjs`
Expected: PASS. The REGRESSION test finds `ix-wait` by class and `"warn"` inside `pill-warn`.

- [ ] **Step 7: Measure on the real app.** Start `cm-badges-next`; open `#/clients` at 1440×900, light; paste the probe; run `__bp()`.
Expected: `span.pill.pill-warn` h20, 11px, w500, p0px/8px, warn ground; `span.pill.pill-info` the same with info; `span.pill.pill-ok` h20, p0px/0px, no ground, `fg` = `--ink-muted`; `span.pill` (Quiet) the same. Open `#/conversations`: the plain outcomes are quiet. Open `#/inbox`: `waiting 3d` is `pill pill-warn`. Resize to 390×844: every pill is still h20.

- [ ] **Step 8: Commit.**

```bash
git add apps/dashboard/src/legacy/styles/components.css apps/dashboard/src/legacy-bridge/legacy.css apps/dashboard/src/legacy/styles/clients.css apps/dashboard/src/legacy/styles/conversations.css apps/dashboard/src/legacy/styles/inbox.css apps/dashboard/src/legacy/styles/live.css apps/dashboard/src/legacy/styles/settings.css apps/dashboard/src/legacy/pages/inbox-list.jsx
git commit -m "The badge shapes: a pill at rest is its dot and its word, and a chip, a tally and a mark, one size each"
```

---

### Task 3: Every count is a tally

**Files:**
- Modify: `components/sidebar.jsx:106, 124`; `components/surface-tabs.jsx:30, 108`; `components/topbar.jsx:96, 476`; `pages/app-shell.jsx:231`; `pages/conversations.jsx:281`; `components/campaign-bits.jsx:294`; `pages/activity.jsx:221`; `pages/clients-a.jsx:1211`; mockups `pages/calendar.jsx:500`, `pages/dashboard-a-fleet.jsx:72`, `pages/outbound.jsx:136`
- Modify CSS: `components.css:98-117, 301-306, 923-937, 1271, 1918, 2172-2173, 2275-2276, 2848`; `mobile.css:482-485`; `dashboard-a-v2.css:386-399`; `settings.css:283-292`; `inbox.css:67-68, 85`; `clients.css:115-124, 135`
- Test: `tooling/scripts/tests/one-inbox.test.mjs`, `tooling/scripts/tests/broadcasts-honest.test.mjs`

- [ ] **Step 1: Write the failing test.** In `one-inbox.test.mjs`, the `strip(page)` helper (line 134) maps each tab to `{ label, active, badge }`. Add a field beside `badge`:

```js
    tally: String((findAll(b, (n) => hasClass(n, "stabs-badge"))[0] || { props: {} }).props.className || ""),
```

In the test that holds two threads waiting on you (it asserts `strip("inbox")[0].badge` is `"2"`, around line 231), add directly after that assertion:

```js
  assert.match(strip("inbox")[0].tally, /\btally\b/, "a tab's count is the one tally");
  assert.match(strip("inbox")[0].tally, /\btally-warn\b/, "amber: it counts people who need you, as the Needs you pill does");
```

In `broadcasts-honest.test.mjs:324`, change `n.props?.className === "lp-more"` to `String(n.props?.className || "").split(" ").includes("lp-more")`.

- [ ] **Step 2: Run it and see it fail.**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/one-inbox.test.mjs`
Expected: FAIL. The class is `stabs-badge tabular`.

- [ ] **Step 3: Markup.**
  - `sidebar.jsx:106`: `: <span className={`nav-badge tally${item.urgent ? " urgent tally-warn" : ""}`} data-tip={tip || undefined}>{badge}</span>) : null}`
  - `sidebar.jsx:124`: `{c.badge && <span className="nav-badge tally">{c.badge}</span>}`
  - `surface-tabs.jsx`, the Inbox group's first tab: add `tone: "warn",` after `to: "inbox",`. At line 108:

```jsx
            {badge ? <span className={`stabs-badge tally${(count ? count.tone : t.tone) === "warn" ? " tally-warn" : ""}`} data-tone={(count ? count.tone : t.tone) || "plain"}>{badge}</span> : null}
```

  - `topbar.jsx:476`: `{unread > 0 && <span className="tb-bell-badge tally tally-icon">{unread}</span>}`
  - `topbar.jsx:96`: `{fresh.length > 0 && <span className="tbn-count tally">{fresh.length} new</span>}`
  - `app-shell.jsx:231` (only the Inbox tab has a badge, and it counts people who need you): `{badge(t) && <span className="phone-tab-badge tally tally-icon tally-warn">{badge(t)}</span>}`
  - `conversations.jsx:281`, `calendar.jsx:500`, `dashboard-a-fleet.jsx:72`, `outbound.jsx:136`: `className="fleet-filter-count tally"` (drop `tabular`).
  - `campaign-bits.jsx:294`: `{more > 0 && <span className="lp-more tally" aria-hidden="true">+{more}</span>}`
  - `activity.jsx:221`: `<span className="act-day-n tally">{perDay[i]}</span>`
  - `clients-a.jsx:1211`, the smart list's RailRow: add `className={window.__chrome && window.__chrome.state && window.__chrome.state("person", l.id).tone === "warn" ? "asks" : ""}` (the tone map decides which lists count people who need you).

- [ ] **Step 4: CSS.**
  - `components.css:98-117` becomes:

```css
/* A nav row's count is the one tally (.tally): amber when it counts people who need you. The row's icon stays its
   own ink; the count already says it. */
.nav-badge { margin-left: auto; }
.nav-item.urgent.active { background: var(--bg-raised); }
```

  - Delete `components.css:301-306` (`.nav-item .badge`, no element carries it).
  - `components.css:923-937` becomes `.tb-bell-badge { position: absolute; top: -4px; right: -6px; }`.
  - Delete `components.css:1271` (`.tbn-count`), `:1918` (`.stabs-badge`), `:2275-2276` (the Campaigns `.stabs-badge` pair), and `:2848` (`.lp-more`).
  - `components.css:2173`: `.nav-dot.urgent { background: var(--warn); }`
  - `mobile.css:482-485` becomes `.phone-tab-badge { position: absolute; top: -6px; right: -12px; }`.
  - Delete `dashboard-a-v2.css:386-399` (`.fleet-filter-count` and its active variant).
  - `settings.css:283-292`: delete the whole `.act-day-n { … }` rule (the tally draws it).
  - `inbox.css`: delete lines 67-68 (`.ix-bucket.accent .icon`, `.ix-bucket.active.accent`); line 85 becomes `.ix-bucket.accent .ix-bucket-count { color: var(--warn-ink); font-weight: 500; }`.
  - `clients.css`: delete 115-124 (the smart list's coral bar) and 135; add after the `.cl-rail-row .count` rule:

```css
/* A list of people who need you counts in amber; every other count is a total, in the dim ink. */
.cl-rail-row.asks .count { color: var(--warn-ink); font-weight: 500; }
```

- [ ] **Step 5: Run the tests.**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/one-inbox.test.mjs tooling/scripts/tests/broadcasts-honest.test.mjs`
Expected: PASS.

- [ ] **Step 6: Measure.** In the pane, `#/today` then `#/inbox`, `#/conversations`, `#/outbound`, `#/messages`, `#/admin/activity`: every count is `tally` h16, 11px, w500, p0px/5px; the sidebar's and the Needs you tab's are the amber ground; the bell's is the grey ground with a ring; no count is coral. At 390×844 the phone tab bar's Inbox count is amber with a ring.

- [ ] **Step 7: Commit.**

```bash
git add apps/dashboard/src/legacy/components/sidebar.jsx apps/dashboard/src/legacy/components/surface-tabs.jsx apps/dashboard/src/legacy/components/topbar.jsx apps/dashboard/src/legacy/pages/app-shell.jsx apps/dashboard/src/legacy/pages/conversations.jsx apps/dashboard/src/legacy/pages/calendar.jsx apps/dashboard/src/legacy/pages/dashboard-a-fleet.jsx apps/dashboard/src/legacy/pages/outbound.jsx apps/dashboard/src/legacy/components/campaign-bits.jsx apps/dashboard/src/legacy/pages/activity.jsx apps/dashboard/src/legacy/pages/clients-a.jsx apps/dashboard/src/legacy/styles/components.css apps/dashboard/src/legacy/styles/mobile.css apps/dashboard/src/legacy/styles/dashboard-a-v2.css apps/dashboard/src/legacy/styles/settings.css apps/dashboard/src/legacy/styles/inbox.css apps/dashboard/src/legacy/styles/clients.css tooling/scripts/tests/one-inbox.test.mjs tooling/scripts/tests/broadcasts-honest.test.mjs
git commit -m "Every count is one tally: amber where it counts people who need you, grey where it counts things, never coral"
```

---

### Task 4: Every name is a chip

**Files:**
- Modify: `pages/client-profile.jsx:221, 456, 797-835`; `pages/settings.jsx:373, 616, 1416`; `components/sidebar.jsx:278`; `components/data-bits.jsx:488-490`; `components/record-row.jsx:178, 183`; `pages/messages.jsx:228`; `pages/activity.jsx:187`; `pages/broadcasts-real.jsx:81`
- Modify CSS: `people.css:281-298`; `clients.css:2219-2220`; `settings.css:656, 670`; `components.css:1889-1893, 2639-2643, 2812-2815`; `inbox.css:1860-1863`; `record.css:76`
- Test: `tooling/scripts/tests/people-honest.test.mjs`, `tooling/scripts/tests/settings-doors.test.mjs`

- [ ] **Step 1: Write the failing test.** Append to `people-honest.test.mjs`:

```js
test("a person's lists are chips: a list is a name, at the pill's size and in no state's colour", async () => {
  await freshPage({ people: [person(1)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
  cells = [];
  frames.begin();
  const tree = globalThis.window.PersonLists({ personId: "p1", canEdit: true, first: "Person", flash: () => {} });
  const chip = byTestId(tree, "person-list-chip");
  const cls = String(chip.props.className || "").split(" ");
  assert.ok(cls.includes("chip"), "the one chip");
  assert.ok(!cls.includes("seg-chip"), "not the blue 10px chip People kept for itself");
  const x = find(chip, (n) => n.type === "button" && String(n.props?.className || "").split(" ").includes("chip-x"));
  assert.ok(x, "the chip's × takes them off");
  assert.equal(x.props["aria-label"], "Take Person off Regulars");
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-honest.test.mjs`
Expected: FAIL, the class is `seg-chip`.

- [ ] **Step 3: Markup.**
  - `client-profile.jsx:797-799` (smart lists):

```jsx
    <span key={l.id} className="chip" data-testid="person-smart-chip">
      <button type="button" onClick={() => window.CHANLY.nav(window.CHANLY.R.clientSeg(l.id))} title={`${l.label} keeps itself current — open it on People`}>{l.label}</button>
    </span>
```

  - `client-profile.jsx:819-835` (kept lists): `className="seg-chip"` → `className="chip"`; the open button loses `className="seg-chip-open"` (keep its `data-testid="person-list-open"`); the × button's `className="cl-seg-filter-x"` → `className="chip-x"`.
  - `client-profile.jsx:221` (the seeded profile's lead link): `className="seg-chip seg-chip--warn"` → `className="chip"`. `client-profile.jsx:456` (seeded segments): `className="seg-chip"` → `className="chip"`.
  - `settings.jsx:373`:

```jsx
// A role is a name, not a state (tone.ts `role` is plain): a chip, in the words contracts keeps for it.
const RolePill = ({ role }) => <span className="chip" data-role={role}>{window.__chrome && window.__chrome.state ? window.__chrome.state("role", role).label : role}</span>;
```

  - `settings.jsx:616`: `<span className="chip set-team-you">You</span>`
  - `settings.jsx:1416`: `<span className="chip set-notif-platform">to Chanlytics</span>`
  - `sidebar.jsx:278`: `<span className="chip sb-role" data-testid="sb-me-role">{who.role}</span>`
  - `data-bits.jsx:488`, PolicyChip's button: `className={`chip pol-chip ${className}`}` (the locked words "Owner-only · …" stay; the amber goes: a lock is a rule, not a person needed).
  - `record-row.jsx:178` and `:183`: `className="chip rec-chip"`.
  - `messages.jsx:228`:

```jsx
              {tag && (tag.state
                ? <span className={`pill${tag.tone && tag.tone !== "plain" ? ` pill-${tag.tone}` : ""} msg-tag`} data-tone={tag.tone} data-testid="template-status">{tag.words}</span>
                : <span className="chip msg-tag" data-testid="template-origin">{tag.words}</span>)}
```

  - `activity.jsx:187`: the person filter span `className="cl-seg-filter"` → `className="chip"`, its × `className="cl-seg-filter-x"` → `className="chip-x"`.
  - `broadcasts-real.jsx:81` (a recipient's state is a state):

```jsx
    <span className={`pill${p.pill.tone && p.pill.tone !== "plain" ? ` pill-${p.pill.tone}` : ""} bc-person-pill`} data-tone={p.pill.tone}>{p.pill.label}</span>
```

- [ ] **Step 4: CSS.**
  - `people.css:281-298`: delete the `/* Segment chip — ONE pattern everywhere … */` comment and the `.seg-chip, .cl-tag-seg, .fl-pb-seg { … }`, `:hover`, `.seg-chip--warn` and `.fl-pb-seg` rules. Then `grep -rn "seg-chip\|cl-tag-seg\|fl-pb-seg" apps/dashboard/src/legacy/pages apps/dashboard/src/legacy/components` and change every remaining `className` that uses one of them to `chip` (keep any other class on the element).
  - `clients.css:2219-2220`: delete `.seg-chip-open` and its hover.
  - `settings.css:656`: `.set-team-you { margin-left: 8px; vertical-align: 1px; }`; `settings.css:670`: `.set-role-def .chip { justify-self: start; }`.
  - `components.css:1889-1893`: delete the PolicyChip block (`button.pol-chip…`). `inbox.css:1860-1863`: delete the `button.ix-policy…` block.
  - `components.css:2639-2643` becomes `.bc-person-pill { flex: none; }`; `:2812-2815` becomes `.msg-tag { flex: none; }`.
  - `record.css:76` becomes:

```css
/* The chip (components.css), except that a long name wraps rather than being cut: a rule's words run long. */
.rec-chip { gap: 5px; height: auto; min-height: 20px; padding-block: 2px; line-height: 1.35; white-space: normal; overflow-wrap: anywhere; }
```

- [ ] **Step 5: Run the tests.**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-honest.test.mjs tooling/scripts/tests/settings-doors.test.mjs tooling/scripts/tests/business-tab-answers.test.mjs tooling/scripts/tests/business-tab-offer.test.mjs tooling/scripts/tests/record-kit.test.mjs tooling/scripts/tests/broadcasts-honest.test.mjs tooling/scripts/tests/state-pill.test.mjs`
Expected: PASS. If `settings-doors` pinned a role pill by `"pill"`, it now reads the role chip by `"chip"`: update that one assertion's class name, not its meaning.

- [ ] **Step 6: Measure.** A person's page (`#/clients`, open Ruben): the Lists chips are `span.chip` h20, 11px, w400, hairline, no fill, `--ink-muted`. `#/admin/team`: Owner, Operator, Viewer and You are chips. `#/admin/workspace`: services are chips. `#/broadcasts`: policy chips are chips.

- [ ] **Step 7: Commit.**

```bash
git add apps/dashboard/src/legacy/pages/client-profile.jsx apps/dashboard/src/legacy/pages/settings.jsx apps/dashboard/src/legacy/components/sidebar.jsx apps/dashboard/src/legacy/components/data-bits.jsx apps/dashboard/src/legacy/components/record-row.jsx apps/dashboard/src/legacy/pages/messages.jsx apps/dashboard/src/legacy/pages/activity.jsx apps/dashboard/src/legacy/pages/broadcasts-real.jsx apps/dashboard/src/legacy/styles/people.css apps/dashboard/src/legacy/styles/clients.css apps/dashboard/src/legacy/styles/settings.css apps/dashboard/src/legacy/styles/components.css apps/dashboard/src/legacy/styles/inbox.css apps/dashboard/src/legacy/styles/record.css tooling/scripts/tests/people-honest.test.mjs tooling/scripts/tests/settings-doors.test.mjs
git commit -m "Every name is a chip: a list, a person, a role, a service, a source, at the pill's size and in no state's colour"
```

(Add any file the Step 4 grep touched.)

---

### Task 5: Every mark is neutral, and the tone moves to the words

**Files:**
- Modify: `components/topbar.jsx:67, 72`; `pages/dashboard-a-week.jsx:143`; `pages/dashboard-a-brief.jsx:42, 61-62, 79, 193, 205`; `components/day-agenda.jsx:56`; `pages/outbound-real.jsx:193, 246`; `pages/messages.jsx:221`; `pages/reports-sections.jsx:93`; `pages/activity.jsx:53-55, 208`
- Modify CSS: `components.css:1248-1260, 2364-2366, 2803-2806, 3112-3123`; `dashboard-a-v2.css:1330-1337`; `reports.css:176-177`; `settings.css:297, 316, 330-345, 354`
- Test: `tooling/scripts/tests/broadcasts-honest.test.mjs:2182`

- [ ] **Step 1: Follow the mark in the test that reads it.** `broadcasts-honest.test.mjs:2182`: change `String(n.props?.className || "") === "msg-row-mark"` to `String(n.props?.className || "").split(" ").includes("msg-row-mark")`. The test still reads `data-kind`, which stays.

- [ ] **Step 2: Markup.**
  - `topbar.jsx:67`: `<div key={n.id} className={`tbn-item ${n.unread ? "unread" : ""}`} data-tone={n.tone}>`; `:72`: `<span className="mark tbn-icon"><Icon name={n.icon} size={13} /></span>`.
  - `dashboard-a-week.jsx:143`: `<span className="mark tbn-icon"><Icon name={n.icon} size={13} /></span>`.
  - `dashboard-a-brief.jsx`: lines 42, 79, 193 and 205 become `className="mark brief-beat-glyph"` (drop `ok`, `danger` and the trailing space). Line 61 becomes `<span className="mark brief-beat-glyph"><Icon name="settings" size={12} /></span>` and line 62:

```jsx
      <span className="brief-beat-text" style={S.vm.readiness.answering ? undefined : { color: "var(--warn-ink)" }}>{S.vm.line}</span>
```

  (not answering yet is a warning, said by the words as the failed reply's line says its own)
  - `day-agenda.jsx:56`: `<span className="mark ag-item-glyph">`.
  - `outbound-real.jsx:193`: `<span className="mark pb-tile-mark" aria-hidden="true"><Icon name={pbIcon(p.trigger)} size={14} /></span>`; `:246`: `<span className="mark pb-tile-mark" aria-hidden="true"><Icon name={pbIcon(t.id)} size={14} /></span>`.
  - `messages.jsx:221`: `className="mark msg-row-mark"` (keep `data-kind` and `data-tip`).
  - `reports-sections.jsx:93`: `<span className="mark rpt-fact-icon" aria-hidden="true"><Icon name={f.icon} size={14} /></span>`.
  - `activity.jsx:53-55`:

```jsx
  const tone = window.__activity && window.__activity.tone ? window.__activity.tone(r.kind) : "plain";
  return (
    <div className="act-row" data-testid="act-row" data-tone={tone}>
      <span className="mark act-glyph" aria-hidden="true">
```

  (the `const tone` goes above the existing `return`) and `:208`: `<span className="mark act-glyph" />`.

- [ ] **Step 3: CSS.**
  - `components.css:1248-1260` becomes:

```css
.tbn-icon { margin-top: 1px; }
/* The mark is neutral; a warning's or a failure's words carry it. */
.tbn-item[data-tone="warn"] .tbn-item-title { color: var(--warn-ink); }
.tbn-item[data-tone="danger"] .tbn-item-title { color: var(--danger-ink); }
```

  - Delete `components.css:2364-2366` (`.pb-tile-mark` and its two tones).
  - `components.css:2803-2806` becomes:

```css
/* Marketing or utility, as a mark: the glyph says which (a gift, a bell) and the tip says what it means for who it
   reaches. Neutral, as every mark is: amber says a person is needed, and a marketing message needs nobody. */
```

  (the two `.msg-row-mark` rules go).
  - `components.css:3112-3123` becomes `.ag-item-glyph { margin-top: 1px; }`.
  - Delete `dashboard-a-v2.css:1330-1337` (`.brief-beat-glyph` and its three tones); keep the comment above it only if it still describes the tile ("the tile says which kind of line it is"): it does, keep it.
  - `reports.css:176-177` becomes `.rpt-fact.is-warn .rpt-fact-text { color: var(--warn-ink); }`.
  - `settings.css`: in `.act-row { grid-template-columns: 22px 62px … }` (line 297) use `24px`; the spine's `left: calc(var(--set-row-y) * 0.5 + 11px)` (line 316) uses `12px`; the phone's `.act-row { grid-template-columns: 22px … }` (line 354) uses `24px`. Lines 330-345 become:

```css
/* A node on the log's spine: the round mark, neutral as every mark is. A failure is said by its words, below. */
.act-glyph { align-self: center; position: relative; z-index: 1; border-radius: var(--radius-full); }
.act-row[data-tone="warn"] .act-what { color: var(--warn-ink); }
.act-row[data-tone="danger"] .act-what { color: var(--danger-ink); }
```

- [ ] **Step 4: Run the tests.**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/broadcasts-honest.test.mjs tooling/scripts/tests/today-page.test.mjs tooling/scripts/tests/today-away-page.test.mjs`
Expected: PASS.

- [ ] **Step 5: Measure.** `#/today`: every mark in the day card and While you were away is `mark` h24, radius 6px, `--bg-sunken`, glyph `--ink-muted`; the warn titles are `--warn-ink`. `#/outbound`, `#/messages`, `#/reports`: marks the same. `#/admin/activity`: round marks h24 on the spine, the spine through their centres.

- [ ] **Step 6: Commit.**

```bash
git add apps/dashboard/src/legacy/components/topbar.jsx apps/dashboard/src/legacy/pages/dashboard-a-week.jsx apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx apps/dashboard/src/legacy/components/day-agenda.jsx apps/dashboard/src/legacy/pages/outbound-real.jsx apps/dashboard/src/legacy/pages/messages.jsx apps/dashboard/src/legacy/pages/reports-sections.jsx apps/dashboard/src/legacy/pages/activity.jsx apps/dashboard/src/legacy/styles/components.css apps/dashboard/src/legacy/styles/dashboard-a-v2.css apps/dashboard/src/legacy/styles/reports.css apps/dashboard/src/legacy/styles/settings.css tooling/scripts/tests/broadcasts-honest.test.mjs
git commit -m "Every mark is neutral and one size; a warning's words carry its tone"
```

---

### Task 6: Today's Worth a look says its tone once

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/dashboard-a-week.jsx:1, 60-75`
- Modify CSS: `dashboard-a-v2.css:1181, 1197-1216, 1356-1357, 1361-1362`
- Test: `tooling/scripts/tests/today-page.test.mjs` (the worth a look test)

- [ ] **Step 1: Write the failing test.** In `today-page.test.mjs`, add `stateOf` to the `@chanlytics/contracts` import list. In the test `"worth a look: …"`, rename it to `"worth a look: the tone once, as the row's pill; who is waiting as chips; Ask why with the row's own facts; the doors; the count past the cap"`, set the bridge before drawing (`set({ TODAY_DATA: vm, __REPORTS: reports(), __PEOPLE: people(), __chrome: { state: stateOf } })`), and replace the two lines

```js
    assert.equal(textOf(find(row, (n) => classes(n).includes("tl-tag"))), l.tag);
    assert.equal(find(row, (n) => n.type === "Icon").props.name, l.icon);
```

with

```js
    const tag = find(row, (n) => n.type === "span" && classes(n).includes("tl-tag"));
    assert.equal(textOf(tag), l.tag);
    assert.ok(classes(tag).includes("pill") && classes(tag).includes(`pill-${l.tone}`), "the tone is the row's one pill");
    assert.equal(find(row, (n) => classes(n).includes("tl-glyph")), null, "no tile: it said the pill's tone a second time");
```

and after `const waiting = …` add

```js
  assert.ok(waiting.every((b) => classes(b).includes("chip")), "a person waiting is a name: the one chip");
```

- [ ] **Step 2: Run it and see it fail.**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/today-page.test.mjs`
Expected: FAIL at "the tone is the row's one pill".

- [ ] **Step 3: Markup.** `dashboard-a-week.jsx:1`: `/* global React, Icon, FailedRead, StatePill */`. In `TodayLeaks`, the row becomes:

```jsx
          <div key={l.id} className={`tl-row tl-${l.tone}`} data-testid={`today-leak-${l.id}`}>
            <span className="tl-body">
              {/* The row's tone, once: the one pill, in front of its sentence. A tinted tile and an amber word said it twice. */}
              <span className="tl-line">
                <StatePill kind="tone" value={l.tone} label={l.tag} className="tl-tag" />
                {phone ? (
                  <button type="button" className="tl-text tl-text-door" aria-expanded={open === l.id} aria-controls={`today-leak-math-${l.id}`} onClick={() => setOpen(open === l.id ? null : l.id)} data-testid={`today-leak-text-${l.id}`}>{l.text}</button>
                ) : (
                  <span className="tl-text">{l.text}</span>
                )}
              </span>
              <span className="tl-math tabular" id={`today-leak-math-${l.id}`} hidden={phone && open !== l.id}>{l.math}</span>
              {l.people.length > 0 && (
                <span className="tl-people">
                  <span className="tl-people-lead">Waiting now</span>
                  {l.people.map((p) => <button key={p.id} type="button" className="chip tl-person" onClick={() => twNav(p.to)} title={`Open ${p.name}'s thread`}>{p.name}</button>)}
                </span>
              )}
            </span>
```

(the `tl-acts` span after it is unchanged; keep the existing comment about who is waiting above `l.people`). Update the file's comment above `TodayLeaks` from "Each row wears a word and an icon for its tone (never colour alone)" to "Each row wears its tone once, as the one pill with a word in it (never colour alone)".

- [ ] **Step 4: CSS in `dashboard-a-v2.css`.**
  - Line 1181: remove `.tl-person:focus-visible, ` from the selector list (a chip has its own focus ring).
  - Line 1197: `.tl-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 0 12px; padding: 12px 14px 12px 16px; border-top: 1px solid var(--line); }`
  - Delete 1199-1202 (`.tl-glyph` and its three tones), 1204-1206 (`.tl-tag` and its two tones), 1212-1213 (`.tl-person` and its hover), 1356-1357 (the later `.tl-tag` pair) and 1361-1362 (the later `.tl-glyph` pair).
  - Add after `.tl-body { … }`:

```css
/* The pill, then the sentence; on a narrow card the sentence wraps under its pill. */
.tl-line { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
.tl-line > .tl-text, .tl-line > .tl-text-door { flex: 1 1 12rem; min-width: 0; }
```

  - The comment above `.tl-list` ("a glyph and a word for the tone") becomes "one pill for the tone".

- [ ] **Step 5: Run the tests.**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/today-page.test.mjs`
Expected: PASS. `e2e/today.spec.ts:133` reads `.tl-tag` text, which the pill keeps.

- [ ] **Step 6: Measure.** `#/today` at 1440: each Worth a look row starts with `span.pill.pill-warn` (or `pill-info` for "Gone quiet") h20, then the sentence; no `tl-glyph`; "Priya Nair" and "Marcus Bell" are `button.chip` h20, 11px, w400, no fill. At 390×844 the sentence is the door under its pill, and each chip is h20 (its target grows invisibly).

- [ ] **Step 7: Commit.**

```bash
git add apps/dashboard/src/legacy/pages/dashboard-a-week.jsx apps/dashboard/src/legacy/styles/dashboard-a-v2.css tooling/scripts/tests/today-page.test.mjs
git commit -m "Worth a look says its tone once, as the one pill, and who is waiting as chips at the pill's size"
```

---

### Task 7: Words take their ink, and "needs you" is amber

**Files:**
- Modify: `components/campaign-bits.jsx:40-45`
- Modify CSS: `dashboard-a-v2.css:1141-1142`; `components.css:2245, 2248-2253, 2356, 2378, 3097-3111, 3150-3158`; `clients.css:1635, 1893, 1932-1933, 2091, 2174-2178, 2353`; `inbox.css:2028`; `leads.css:874`

- [ ] **Step 1: The flag is a pill.** `campaign-bits.jsx:40-45`:

```jsx
const CmFlag = ({ tone = "warn", children, testid = null }) => (
  <span className={`pill pill-${tone} cm-flag`} data-tone={tone} data-testid={testid || undefined}>
    {children}
  </span>
);
```

`components.css:2248-2253` becomes `.cm-flag { flex: none; }`.

- [ ] **Step 2: "Needs you" is amber in every sentence.**
  - `dashboard-a-v2.css:1141-1142`:

```css
/* "1 needs you" is amber, as "needs you" is on every badge; red is for what failed. */
.td-frame-note .warn { color: var(--warn-ink); font-weight: 500; }
```

  - `components.css:3097-3111` (the agenda flag): `color: var(--warn-ink);` and in `::before` `width: 6px; height: 6px; background: var(--warn);`. Its comment becomes `/* Their thread needs someone: amber, as needs you is everywhere; never the coral accent, never red. */`.
  - `clients.css:2091`: in `.pl-standing-needs`, `color: var(--danger);` → `color: var(--warn-ink);`.

- [ ] **Step 3: Good news is said in the quiet ink (B).**
  - `clients.css:1893`: `.cl-row-next { color: var(--ink-muted); font-weight: 500; }`
  - `clients.css:2353`: in `.pl-card-visit`, `color: var(--ok-ink);` → `color: var(--ink-muted);`
  - `clients.css:1932-1933`: `.cl-row-offers.yes { color: var(--ink-muted); font-weight: 500; }` and `.cl-row-offers.no { color: var(--ink-muted); }`
  - `clients.css:1635`: delete `.cl-prof-run-out[data-tone="ok"] { … }`.
  - `inbox.css:2028`: `.ix-th-visit.ahead { color: var(--ink-muted); font-weight: 500; }`
  - `components.css:2245`: `.cm-head-ok { color: var(--ink-muted); }`
  - `leads.css:874`: in `.pk-today`, `color: var(--ok-ink);` → `color: var(--ink-muted);`

- [ ] **Step 4: Tone words take the ink.** `clients.css:2174-2178`:

```css
.cl-attn-row.tone-warn .cl-attn-status .lead { color: var(--warn-ink); }
.cl-attn-row.tone-info .cl-attn-status .lead { color: var(--info-ink); }
.cl-attn-row.tone-accent .cl-attn-status .lead { color: var(--accent-ink); }
.cl-attn-row.tone-danger .cl-attn-status .lead { color: var(--danger-ink); }
```

(the `tone-ok` line goes: at rest, the lead keeps `--ink-muted`).

- [ ] **Step 5: The agenda's open times are a sentence.** `components.css:3150-3158` (`.ag-window`) becomes:

```css
/* The times it would offer, said after the page's label as one line ("Open 3 – 5 PM · 9:30 – 10:30 AM"): numbers as
   words, not a row of outlined badges in a private green. */
.ag-window { color: var(--ink-muted); font-size: 11px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ag-window + .ag-window::before { content: "·"; margin-right: 6px; color: var(--ink-faint); }
```

- [ ] **Step 6: Playbooks say it once.** Delete `components.css:2356` (`.pb-tile.is-warn { border-color: … }`) and `:2378` (`.pb-tile-next.is-warn { color: … }`): the card's pill says it.

- [ ] **Step 7: Run the node suite for the pages touched.**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/today-page.test.mjs tooling/scripts/tests/people-honest.test.mjs tooling/scripts/tests/broadcasts-honest.test.mjs tooling/scripts/tests/thread-controls.test.mjs tooling/scripts/tests/leads-peek.test.mjs`
Expected: PASS.

- [ ] **Step 8: Measure.** Run `__tp()` (the words probe) on `#/today`, `#/clients`, `#/broadcasts`, `#/admin/platform`: no `red needs-you` line, and no `raw` line except the accent on the live and "now" marks (the agenda's current time, a live call). The flag is `pill pill-warn` h20 in `__bp()`.

- [ ] **Step 9: Commit.**

```bash
git add apps/dashboard/src/legacy/components/campaign-bits.jsx apps/dashboard/src/legacy/styles/dashboard-a-v2.css apps/dashboard/src/legacy/styles/components.css apps/dashboard/src/legacy/styles/clients.css apps/dashboard/src/legacy/styles/inbox.css apps/dashboard/src/legacy/styles/leads.css
git commit -m "Needs you is amber in every sentence, good news is said in the quiet ink, and a tone's words take its ink"
```

---

### Task 8: Say it once: the repeats go

**Files:**
- Modify: `pages/inbox-list.jsx:400-404`; `pages/conversations.jsx:104-107`; `pages/live-monitor-real.jsx:409`; `pages/inbox-thread.jsx:742, 940`; `pages/calendar-real.jsx:267, 368`; `pages/leads-scope.jsx:252`; `pages/clients-a.jsx:714-726, 3286`; `pages/integrations-real.jsx:135`
- Modify CSS: `calendar.css:70-80, 506`; `leads.css:650-666, 852-858, 919-925`
- Test: `tooling/scripts/tests/leads-honest.test.mjs`

- [ ] **Step 1: Write the failing test.** In `leads-honest.test.mjs`, the test that draws rows `p1` to `p7` and asserts each `lead-state-tag` (around line 3190) ends after its `lead-fit-tag` assertions. Append inside it:

```js
  // Said once: while the Stage column shows a lead's state, the name's tag does not say it again.
  const rowNode = find(tree, (n) => n.type && (n.type.name === "PeopleRow" || (n.type.type && n.type.type.name === "PeopleRow")));
  const business = globalThis.window.LEAD_COLUMNS.find((c) => c.key === "business");
  const tagIn = (td) => find(td, (n) => n.props?.testid === "lead-state-tag");
  const out = rows.find((r) => r.id === "p5");
  assert.ok(tagIn(business.cell(out, { ...rowNode.props.ctx, stageShown: false })), "without the column, the name wears it");
  assert.equal(tagIn(business.cell(out, { ...rowNode.props.ctx, stageShown: true })), null, "with the column, only the column says it");
```

- [ ] **Step 2: Run it and see it fail.**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-honest.test.mjs`
Expected: FAIL, the tag is drawn with the column on.

- [ ] **Step 3: Leads.**
  - `leads-scope.jsx:252`:

```jsx
          {ldClientOf(l, x) ? <StatePill kind="deal" value="won" testid="lead-state-tag" /> : l.stateTag && !x.stageShown ? <StatePill kind="lead_row_state" value={l.state} label={l.stateTag} testid="lead-state-tag" /> : null}
```

  - `clients-a.jsx:714-726` (`leadCellCtxFor`): add a `stageShown` parameter after `peopleRows`; include it in the cache check (`&& k.stageShown === stageShown`), in `ctx` and in `kept.current`.
  - `clients-a.jsx:3286`:

```jsx
  // Whether the Stage column is drawn: then it says each lead's state, and the name's tag does not say it again.
  const stageShown = columns.some((c) => c.key === "stage");
  const cellCtxLeads = leadCellCtxFor(leadCellActs, leadCellKept, values, !!(band && band.mixed), hasCenter, canFind, people.rows, stageShown);
```

  - `leads.css`: a placeholder's initials are not a state. In `.ld-tile` (650), `.pk-band` (852) and `.ld-lb-photo` (919) add `--tint: var(--bg-active); --tint-ink: var(--ink-muted);` to the base rule and delete their `.tint-1` … `.tint-6` rules (661-666, 853-858, 920-925).

- [ ] **Step 4: The letter marks go.**
  - `inbox-list.jsx:402`, `conversations.jsx:105`, `live-monitor-real.jsx:409`, `inbox-thread.jsx:742` and `inbox-thread.jsx:940`: delete the `<span className="agent-avatar" … >{…}</span>` line; the name beside it stays.

- [ ] **Step 5: The Calendar says today once.**
  - `calendar-real.jsx:267` and `:368`: delete `{d.today && <span className="cal-today-chip">Today</span>}`.
  - `calendar.css:70-80`: delete `.cal-today-chip { … }`. After `.cal-agenda-day.today { border-color: var(--accent); }` (506) add:

```css
.cal-agenda-day.today .cal-dow, .cal-agenda-day.today .cal-date { color: var(--accent-ink); }
```

- [ ] **Step 6: Connections draws no second dot.** `integrations-real.jsx:135`: `<StatePill kind="tone" value={r.tone} label={r.stateWords} />`.

- [ ] **Step 7: Run the tests.**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-honest.test.mjs tooling/scripts/tests/leads-peek.test.mjs tooling/scripts/tests/one-inbox.test.mjs tooling/scripts/tests/inbox-decision.test.mjs tooling/scripts/tests/inbox-true.test.mjs tooling/scripts/tests/thread-controls.test.mjs`
Expected: PASS.

- [ ] **Step 8: Measure.** `#/clients/leads` with Stage turned on in Columns: a row that is not a fit says so once, in Stage. `#/inbox`, `#/conversations`, `#/live`: no `agent-avatar` element in any row. `#/calendar` (Week and Agenda): no TODAY chip; today's date is `--accent-ink`.

- [ ] **Step 9: Commit.**

```bash
git add apps/dashboard/src/legacy/pages/inbox-list.jsx apps/dashboard/src/legacy/pages/conversations.jsx apps/dashboard/src/legacy/pages/live-monitor-real.jsx apps/dashboard/src/legacy/pages/inbox-thread.jsx apps/dashboard/src/legacy/pages/calendar-real.jsx apps/dashboard/src/legacy/pages/leads-scope.jsx apps/dashboard/src/legacy/pages/clients-a.jsx apps/dashboard/src/legacy/pages/integrations-real.jsx apps/dashboard/src/legacy/styles/calendar.css apps/dashboard/src/legacy/styles/leads.css tooling/scripts/tests/leads-honest.test.mjs
git commit -m "Say it once: no letter mark before its own name, no TODAY beside today's date, no state twice on a lead"
```

---

### Task 9: Prove it and ship

**Files:**
- Modify: `apps/dashboard/src/legacy/Chanlytics.html`, `apps/dashboard/src/legacy/CLAUDE.md`, the spec (§4's rows the build refined)
- Test: the whole node suite; `e2e/` grep

- [ ] **Step 1: The whole suite, typecheck, lint, format.**

Run: `corepack pnpm test` then `corepack pnpm run typecheck`, `corepack pnpm run lint`, `corepack pnpm run format:check`.
Expected: all green. A red test names a class or a word this plan changed: follow it to the new class, never back.

- [ ] **Step 2: e2e pins.** `grep -rn "agent-avatar\|cal-today-chip\|seg-chip\|tl-glyph\|tl-person\|stabs-badge\|nav-badge\|tb-bell-badge\|cm-flag\|fleet-filter-count\|pb-tile-mark\|msg-row-mark\|rec-chip\|pol-chip\|ix-wait\|cl-row-next\|pill-ok\|\.pill\b" e2e`. Each hit either still holds (the class kept as a hook) or is updated to the shape it now is. `e2e/people.spec.ts:223` counts `.cl-row-next`: the class stays, the count holds.

- [ ] **Step 3: Version keys.** For every legacy file edited in Tasks 2–8, bump its `?v=` in `Chanlytics.html` to one past the highest of `main`'s key and every open PR's key for that file (`gh pr list --repo expectmeout/chanlytics-os --state open --json number,files`), and past any key a live session has claimed (`ListAgents`).

- [ ] **Step 4: Docs.** In `apps/dashboard/src/legacy/CLAUDE.md`:
  - In the "One row for every list on a phone" bullet, replace "A pill on a row is words, not a control, so each row undoes the 36px touch floor `legacy-bridge/legacy.css` puts on `.pill`; that floor, not the padding, is what made a row taller than a person's." with "A pill is words, not a control, and `legacy-bridge/legacy.css` puts no touch floor on it (it used to, and every row undid it)."
  - Add a bullet: "**Badges: one shape per job** (`docs/superpowers/specs/2026-09-23-one-badge-system-design.md`): a state is `StatePill` (filled for warn/info/danger/accent, a dot and a word at rest), a name is `.chip`, a number on a tab/nav/filter/icon is `.tally` (`tally-warn` for people who need you), a row's kind is `.mark` (never toned). One size each, defined once in components.css; a page adds the class and keeps only layout. "Needs you" is amber everywhere; the accent is live only; tone words take the `-ink`."
  - Update the spec's §4 rows that the build refined: the agenda's open times became a sentence (Task 7 Step 5); the Fit column stays words (its quiet pill in the peek reads the same); the Activity words carry its warnings.

- [ ] **Step 5: Measure every page, before and after.** With the probe, on `main` (a second dev server on `chanlytics-messaging` is not needed: the analysis's numbers are the "before") and on this branch, at 1440×900 and 390×844, light and dark: Today, Inbox (Needs you, Conversations, Live), People, a person, Leads (with the peek), Calendar (Week, Agenda), Campaigns (Playbooks, Broadcasts, Templates), Reports, Settings (Profile, Business, Team, Connections, Notifications, Activity, Back office). Every badge-like element is one of `pill` (h20), `chip` (h20), `tally` (h16), `mark` (h24) or a word. Contrast: the chip, the tally and the quiet words at 4.5:1 or better in both themes (composite over the real ground, as the analysis did). Screenshot Today's Worth a look and a person's Lists, before and after, for Ruben.

- [ ] **Step 6: Clean tree, commit, push, PR.**

```bash
git checkout -- apps/dashboard/tsconfig.json apps/dashboard/next-env.d.ts
git status --short
git add apps/dashboard/src/legacy/Chanlytics.html apps/dashboard/src/legacy/CLAUDE.md docs/superpowers/specs/2026-09-23-one-badge-system-design.md
git commit -m "One badge system: the version keys, the house rule in legacy/CLAUDE.md, and the spec as built"
git push -u origin design/one-badge-system
gh pr create --repo expectmeout/chanlytics-os --title "One badge system: a state, a name, a count and a row's kind, one shape and one size each" --body-file <scratchpad>/pr-body.md
```

The PR body: Ruben's words, the measured before (more than forty looks; the heights and contrast table from the review page), the five shapes, D1–D8, what each page changed, the after measurements, the screenshots, and that it supersedes People on a phone D6. End with the attribution line.

- [ ] **Step 7: CI, merge, confirm.** When every check is green, `gh pr merge <n> --repo expectmeout/chanlytics-os --squash --delete-branch` from the scratchpad. Confirm the squash carries `Chanlytics.html`, that `main`'s next CI run is green, and that production shows the new badges (`/api/version`, then a reload of the signed-in tab).
