# Ask Rewired, Phase 7: the first run and the last doors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask reaches the last places it did not. On the first run (`#/start`) ⌘K opens the Line over the step, on the
`start` surface, so "what is left to set up?" is asked of the steps in front of the owner; ⌘K jumps to the Pipeline,
to Memory and to the back office, and to every other page a workspace really has; the comments and rows that still
describe the demo's palette, or a registry from before Leads, Lists and the Pipeline were real, say what is true.

**Architecture:** the browser only, and contracts. The shell draws the palette it already draws on every other page
beside the first run's screen; the Line's page, its context provider and the server's `start` provider exist since
Phase 2. The jump index becomes contracts' `askPages(has)`: the pages every workspace has, the Pipeline where deals
are on and the back office for Chanlytics staff, read from the same two bits the pages draw those doors by. No
migration, no route, no model change.

**Spec:** `docs/superpowers/specs/2026-09-25-ask-rewired-design.md` §5.9 and §9 (Phase 7). Written against
`origin/main` at `1388f2cc6` (29 Sep 2026, #1332) after a code map read at that commit. One pull request, pushed once:
this plan, the code, the tests, the spec's "Phase 7, landed" and the program's next item.

---

## 0. What is decided, and what this plan decides

### 0.1 Approved, and kept here

- **§9, Phase 7:** "The palette mounted on `#/start` with the `start` surface; ⌘K jumps for Pipeline, Memory and the
  back office; the demo palette's stale comments and the registry's stale rows corrected. No migration. **Proof:** the
  e2e first-run spec asks a question; the jump index test lists every real surface."
- **§5.9:** "the first run gets the palette mounted (⌘K flips a hidden state there today) with the `start` surface, so
  'what is left to set up?' is answered from the steps in front of the person."
- **Ruben, 23 Sep:** no key is drawn anywhere but the `?` sheet (#925, being landed again by another session). The
  jump works; its symbol is not shown.
- **Ruben, 28 Sep (via the lanes review):** Part B of the Ask-on-a-phone spec ("answer blocks") is this program's, the
  phase after this one, planned the day it starts. Not built here.
- **Ruben, 29 Sep:** "continue" — Phase 7 as one pull request, merged on green.

### 0.2 This plan's own (D1–D11), with why

| #   | Decision | Why |
| --- | -------- | --- |
| D1  | **The palette on the first run.** `firstRunScreen` (app-shell.jsx) draws `<AskBar open onClose>` on the `fr-shell` root beside `FirstRun`, from the shell's own `askOpen`. The shell's ⌘K already listens on every route (its keys hook runs before the two full-screen returns), so ⌘K, `window.appAsk` and `askAbout` open it there. The Line reads the route as it does everywhere: `surfaceFor("start")` is `start`, the context provider sends the step as the view, the warm and the server's `start` provider (Phase 2) do the rest. | The spec's sentence; the turn needs nothing new. |
| D2  | **No door is drawn on the first run.** No button, no hint, no ✦. | The first run sets the chrome aside by its own design (first-run spec, PR 1), and ⌘K's glyph is drawn nowhere but the `?` sheet (Ruben, 23 Sep). The spec asks for the palette mounted, not a door; a phone reaches Ask from the ✦ once it leaves the first run. A drawn door is a change to the first run's design, Ruben's to ask for. |
| D3  | **The start surface's own questions.** "What is left to set up?" (the page's question) and "What are our hours this week?" (the facts the first run checks) lead its chips, in English and Spanish; the Line's heading there is "Ask about setting up". `CHIPS_OF.start` (other's chips: an offer to a list, a win-back playbook) goes. The first question is the model's, answered from the context the server's `start` provider already builds (the step, Setup's readiness sentence, "N of M set up", the next step), never a quick answer. | §5.9 names the question. A quick answer would be a second reading of Setup's rows beside `setupSteps`, and a new fast path is a new mechanism. |
| D4  | **The page's questions are one table.** `buildAskSuggestions`' per-page `switch` becomes `PAGE_QUESTIONS` (surface → the keys of its questions); Conversations' and Live's call question keeps its own line (its quickness depends on the day). Same order, same words, same result for every surface but `start`. | D3 adds a surface; a table adds none of the branches the complexity ratchet holds (`buildAskSuggestions` 49 today), and banks a fall. |
| D5  | **⌘K jumps where a workspace has the page.** Contracts `askPages({ dealsOn, platformAdmin })`: `ASK_PAGES` (every workspace's), the Pipeline (`clients/pipeline`, after Leads, answering to "deals" too) where deals are on, and the back office (`admin/platform`) for Chanlytics staff. The bridge's `jumpIndexFrom` reads `__PEOPLE.dealsOn` (the bit People's scope strip draws the Pipeline by, people.jsx `plScopes`) and `__ME.platform_admin` (the bit Settings' rail draws the back office by, settings.jsx `isPlatformAdmin`). | Where deals are off the Pipeline's address draws People; to anyone but staff the back office's address draws Profile. A jump to either would promise a page that is not there. |
| D6  | **Memory's jump stays on Business.** "Receptionist memory" keeps landing on `admin/workspace` and answers to "AI memory", the unlisted pane's own name. | #417 (11 Sep, team-writes.test.mjs:217): never a jump to the pane that says "Not built yet"; what the receptionist knows is in Business, which that pane points at. |
| D7  | **Partner gets its jump.** Settings › Partner (`admin/partner`, 0012) is in every workspace's rail since 27 Sep, after the spec was written, and had no jump. | "The jump index test lists every real surface": the test found it. |
| D8  | **Every jump lands on a page a citation may name.** `ASK_PAGE_ROUTES` gains `clients/pipeline`, `admin/partner` and `admin/platform`. | The #417 test's rule, held for `askPages` too. `PAGE_PREFIX` already admits all three, so nothing a turn keeps or drops changes. |
| D9  | **The stale comments and rows.** The registry's People row (Leads and Lists are real; the Pipeline is a scope), the block that said "render entirely from seed data" over rows that are real, and the Deal board's row; the demo palette's header, `askAbout`'s shape and its jump list; app-routes.jsx's "askAbout is a no-op outside demo"; the legacy CLAUDE.md's `askAbout`; context.ts's "Phase 7". The retired `#/pipeline` keeps landing on People. | The wiring map's stale-comments row (app-routes.jsx:67, surface-registry.ts:33, legacy/CLAUDE.md:62). The redirect is pinned on purpose by the Pipeline's own test (pipeline.test.mjs:642) and is not a stale row. |
| D10 | **The first-run spec asks a question, nightly, for nothing.** setup.spec.ts: ⌘K on `#/start` opens the Line over the step, the start question is offered, no key is drawn, and asking it sends the question with the `start` surface and the page's context. Without `E2E_PAID_MODEL` the turn is stopped in the browser before it leaves (as `refuseAnswers` does for the waiting search), so the nightly spends nothing; with it, the answer lands. | The spec's proof, run every night; a paid-only test would skip every night. |
| D11 | **The local harness draws the first run and the Line.** The fixture publishes the first run's helpers (contracts `FIRST_RUN_HELPERS`, as setup.ts does) and, in a browser, installs Ask's client (`installAsk`), so the spec runs on `e2e:local`. | The house rule: an e2e change is run against the harness, not production. |

---

## 1. Facts, read at `1388f2cc6`

- **The first run draws no palette.** `firstRunScreen` (app-shell.jsx:497-502) returns `.fr-shell` with `FirstRun`
  alone; `AskBar` is drawn only in `appChrome` (:574). The shell returns the first run at :625, after
  `useShellKeys` (:607), whose ⌘K flips `askOpen` (:343-344): the state changes and nothing is drawn.
- **The Line already knows the page.** `surfaceFor` maps `start` to `start` (legacy-bridge/ask/palette.ts:116-117);
  the context provider sends the step (legacy-bridge/ask/context.ts:173-174, its comment "the palette opens there in
  Phase 7"); the server's provider reads Setup's steps (server/ask/context/pages.ts:175-189: the view, the readiness
  sentence, "N of M set up", the next step). `AskReal` draws nothing without `window.__ask` (ask-real.jsx:999).
- **The start surface borrows other's chips.** `CHIPS_OF.start = "other"` (contracts ask-suggestions.ts:14-19), so its
  home offers "Send an offer to a list" and "Start a win-back playbook" (:215-216); the Line's heading map has no
  `start` (ask-text.jsx:27-39, :108-120: "Ask about this page"). `buildAskSuggestions` is at 85 lines and 49 branches
  (baselines/complexity.json:722).
- **The jump index.** `ASK_PAGES` (contracts ask-jump.ts:27-71): 23 entries, every workspace's; "Receptionist
  memory" lands on `admin/workspace` (:64-70). `jumpIndexFrom` (palette.ts:123-145) spreads it and adds threads,
  people and calls. `PaletteGlobals` reads `__PEOPLE.dealsOn` (:60) and `__ME.role` (:64).
- **No jump for four real pages.** The Pipeline is People's third scope where deals are on (people.jsx:1134-1138,
  `plScopes`; `clients/pipeline`). The back office is `admin/platform`, in the rail for platform staff alone
  (settings.jsx:129-130). Partner is `admin/partner`, in every rail (settings.jsx:96-97). AI memory is
  `admin/memory`, an unlisted pane that says "Not built yet" and points at Business (settings.jsx:118, :1763-1768).
- **What holds the jumps.** team-writes.test.mjs:217-228 (every `ASK_PAGES` target is in `ASK_PAGE_ROUTES`, and
  `admin/memory` is not); ask.test.mjs:140-171 ("only real pages": no `pipeline` in `ASK_PAGES`' targets, the demo
  board's word); ask-palette.test.mjs:2620-2667 (N18) and :3019-3036 (the old names). `ASK_PAGE_ROUTES`
  (contracts citations.ts:70-92) is read by tests only; `PAGE_PREFIX` (:96-97) is what a turn keeps pages by.
- **The registry's stale rows.** surface-registry.ts:33 ("Leads / Deal board / Lists stay demo": Leads and Lists
  are real, :46-47); :37-44 heads fifteen rows, most of them real, "Render entirely from seed data"; :48 calls the
  Deal board "retired into People, like leads" (Leads came back as a scope, and so did a Pipeline). `admin/memory`
  (:68-73) is right. `SURFACE_RETIRED.pipeline = "clients"` (:305-308) is pinned by pipeline.test.mjs:642.
- **The demo palette's stale comments.** dashboard-a-ask.jsx:2-5 (its answers "link out to real surfaces": they link
  to the mockup's), :358-360 (`askAbout`'s shape is the seed's; the Line reads `prompt`, `mode`, `thread`, `about`,
  ask-real.jsx:323-354), :366 (its jump list is the demo's; a workspace's is contracts'). app-routes.jsx:67-68 says
  `askAbout` is a no-op outside a demo: it opens the Line (dashboard-a-ask.jsx:361-364, ask-real.jsx:326-329).
  legacy/CLAUDE.md:62 lists the seed's shape.
- **The e2e.** The first run's spec is e2e/setup.spec.ts (5 tests, none opens Ask). e2e/ask.spec.ts opens the Line
  with Control+k and holds "no key is drawn" (:49); its paid turns skip without `E2E_PAID_MODEL`, which the skip
  ceiling does not count (e2e/skip-ceiling.ts:23). `refuseAnswers` stops a turn in the browser (e2e/waiting-search.ts).
- **The harness.** fixture-src.ts publishes `__SETUP` (:205) but not `__firstRun`, so `FirstRun` draws its empty root
  (first-run.jsx:1081); it installs no `__ask`, so the Line draws nothing (e2e/ask.spec.ts:297 skips on it).

## 2. Files

| File | What |
| --- | --- |
| `apps/dashboard/src/legacy/pages/app-shell.jsx` | D1: the palette beside the first run |
| `packages/contracts/src/ask/ask-suggestions.ts` | D3, D4: the start surface's questions; `PAGE_QUESTIONS` |
| `apps/dashboard/src/legacy/pages/ask-text.jsx` | D3: "Ask about setting up" |
| `packages/contracts/src/ask/ask-jump.ts`, `ask/index.ts` | D5–D7: `askPages`, Partner, "AI memory" |
| `packages/contracts/src/ask/citations.ts` | D8 |
| `apps/dashboard/src/legacy-bridge/ask/palette.ts` | D5: `jumpIndexFrom` over `askPages` |
| `apps/dashboard/src/legacy-bridge/ask/context.ts`, `surface-registry.ts` | D9 |
| `apps/dashboard/src/legacy/pages/dashboard-a-ask.jsx`, `app-routes.jsx`, `legacy/CLAUDE.md` | D9 |
| `apps/dashboard/src/legacy/Chanlytics.html` | `?v=` of each legacy file changed, one past main's |
| `tooling/scripts/e2e-harness/fixture-src.ts` | D11 |
| `e2e/setup.spec.ts` | D10 |
| `tooling/scripts/tests/ask/ask-jumps.test.mjs` (new) | the jump index against every real surface |
| `tooling/scripts/tests/ask/ask-palette.test.mjs`, `ask/ask.test.mjs`, `shell/surfaces/shell-status.test.mjs`, `e2e/e2e-harness.test.mjs` | the mount, the start Line, the chips, the harness |
| `docs/superpowers/specs/2026-09-25-ask-rewired-design.md`, `docs/system-prd.md` | "Phase 7, landed", the status line, the next item; S-18.1 and Setting up's row |

## 3. Steps, each with its tests

- [ ] **3.1 The palette on the first run (D1, D2).** `firstRunScreen` takes `askOpen`/`setAskOpen` and draws `AskBar`
      after `FirstRun`. *Test* (shell-status.test.mjs, the shell as drawn): at `#/start` the `fr-shell` root holds
      `FirstRun` then `AskBar`, closed; the shell's ⌘K opens it and its `onClose` closes it; `#/today` still draws it
      in the chrome, once. *Test* (ask-palette.test.mjs, the Line as drawn over the bridge's palette): at `#/start`
      the Line is on `start`, headed "Ask about setting up", offers "What is left to set up?" first, draws no key, and
      the question sent carries `surface: "start"` and the context the page gives.
- [ ] **3.2 The start surface's questions (D3, D4).** *Test* (ask.test.mjs): `buildAskSuggestions` on `start`, English
      and Spanish, leads with the two questions and offers neither the offer nor the playbook; every other surface's
      chips are what they were (a table of today's answers for each surface, taken on main before the change).
- [ ] **3.3 The jumps (D5–D8).** *Test* (ask-jumps.test.mjs, new): the jump index lists every real surface —
      every route the registry calls real, and People's scopes, reached by a named jump that lands where that page is
      drawn (a moved address at its new one; Memory on Business; Lists on People); every jump lands on a real surface
      and on a page a citation may name; the Pipeline only where deals are on, after Leads; the back office only for
      staff; the bridge's index over the window's two bits; "pipe", "deals", "back office", "ai memory", "partner"
      each reach their page.
- [ ] **3.4 The stale comments and rows (D9).** Comments only, and CLAUDE.md's line; no behaviour.
- [ ] **3.5 The harness and the e2e (D10, D11).** *Test* (e2e-harness.test.mjs): the fixture publishes the first run's
      helpers from contracts for every record, and installs Ask's client only in a browser. *Run*: `corepack pnpm
      e2e:local -- e2e/setup.spec.ts --grep "asks"` green on the nightly record; the test fails when the palette is
      taken off the first run (a mutation, restored).
- [ ] **3.6 Docs.** The spec's status line ("Phases 0–7 landed"), "Phase 7, landed", and the next item (Part B,
      answer blocks); the PRD's S-18.1 step 1 and Setting up's row; the wiring map's Phase 7 rows re-read and
      republished; the memory note's dated paragraph.
- [ ] **3.7 Gates.** Packages built, typecheck, lint, Prettier, dead exports, `check:dist`, the Ask suites, the full
      check line once; banks only fall. One combined review, its fixes, `origin/main` merged in, one push.

## 4. Spec coverage

| Spec | Where |
| --- | --- |
| §9: the palette mounted on `#/start` with the `start` surface | D1, D2, D3; 3.1, 3.2 |
| §9: ⌘K jumps for Pipeline, Memory and the back office | D5, D6, D8; 3.3 |
| §9: the demo palette's stale comments and the registry's stale rows corrected | D9; 3.4 |
| §9: no migration | nothing under `supabase/` |
| §9 proof: the e2e first-run spec asks a question | D10, D11; 3.5 |
| §9 proof: the jump index test lists every real surface | 3.3 (and D7, which it found) |
| §5.9: "what is left to set up?" answered from the steps in front of the person | D3 (the server's `start` provider, Phase 2) |

## 5. Self-review

- **One predicate per rule.** The Pipeline's jump follows `__PEOPLE.dealsOn`, the bit the scope strip draws by; the
  back office's follows `__ME.platform_admin`, the bit the rail draws by. No second reading of either.
- **No new mechanism.** The palette is the shell's own, drawn on one more root; the first question is the model's
  over a context that exists; the jump list is the one list with two entries that wait on a bit.
- **Either deploy order.** Browser and contracts only; no route, no wire, no migration.
- **Nothing drawn that says a key.** No door, no hint; the e2e and the Line's test both hold "no key is drawn".
- **What is left for Ruben.** A drawn door on the first run (D2), if he wants one.
