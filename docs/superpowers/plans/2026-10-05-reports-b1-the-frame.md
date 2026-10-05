# Reports B1: the frame — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reports becomes one page of six lenses, each at its own address (`/w/<slug>/reports/<lens>`, the Overview at `/w/<slug>/reports`), drawn on one `[[...lens]]` App Router page the way People is, with a lens registry in contracts, the period one parameter with Month in it, the head saying the lens's answer, today's sections moved into their lenses by value, Reports' controls on the kit, and the kit's `Figure` drawing the strip of counts (spec §5 phase B, the part that needs no database change).

**Architecture:** One address per lens, one mount. `surfaces/routes.ts` gives the `reports` row a `takes` (the five lens words that are not the Overview) and a `chrome`; the frame's strip of views (`SurfaceViews`, drawn by `SurfaceTabs` as links since #1412) is the lens strip, exactly as People's scopes are, so `surface-tabs.jsx` and `app-shell.jsx` are not touched. The page follows its own address (`usePathname()`, as `PeopleRoute` does), so a move between lenses is a pushed or replaced entry and never a page request. The data does not know the lens: the `reports` surface holds its views by **period**, as it does today, and every lens draws from that one read, so a move between lenses asks for nothing and never blanks the body. Contracts hold the registry (`reports/lenses.ts`), the periods (`REPORT_RANGES` extended, `report-periods.ts`), the tile builders with their metric ids (`report-tiles.ts`) and the head's sentence (`lens-answer.ts`); the three report SQL calls move into `packages/db`; the kit gains `Figure` and one download helper.

**Tech Stack:** Next.js App Router (TSX surfaces), TypeScript (`packages/contracts`, `packages/db`), the interface kit (Base UI parts, `kit.css`, the gallery), `node:test` through `tooling/scripts/checks/test.mjs`, Playwright for the journeys. No migration, no new route.

**Spec:** `docs/superpowers/specs/2026-10-02-reports-lenses-design.md` (§5 B, §6.1 to §6.3, §7 as the closed set of ids, §8 Figure, §13, §15). Phase A (#1391) and phase D (#1393) are on main; Classic is retired (#1367), so there is one look. This plan replaces `2026-10-05-reports-b-the-frame.md` (reviewed, not approved), which stays as it is.

**Written against** `52053ca98` (5 Oct 2026, branch `reports/b-the-frame`). Every path, name and line below was read on that tree; a line number is a locator, so re-find it by its text if main has moved.

---

## What this pull request is, and is not

It is PR 1 of phase B, "the frame". It adds no migration and no route to the API, and every task ends green (its own tests, `corepack pnpm -r typecheck` where a package or a type moved, and the ratchets it touches).

### Not in this plan

- **The headline read and Today's switch** (PR 2, "Today's reads"): no new SQL function; the small read sums `report_series` on the server with contracts' `periodFactsOf`; the `__REPORTS` mirror (`declareSurfaceValue("reports", "__REPORTS")`, `legacy-bridge/ask/context.ts`, Today's card) is deleted there. Here Today keeps reading the whole `reports` surface, which stays what it was but for the period.
- **Today's reply-speed sentence against the hold** (PR 2): it reuses contracts' `classOf`/`holdOf` on reply pairs, with no SQL copy of the 10-second rule. `metrics_summary` (Today's) is the one report SQL call that stays called by name from the dashboard until that PR.
- **"A person is new by one rule"** (`person_moments.new_at`, PR 3, with its own runbook).
- **Lens tiles on the Overview, "Export this lens", Ask's `lens` tool parameter and its eval case** (phase C). Ask's `report` tool and its context provider keep reading days.
- **The frame's strip itself** (tabs as links landed with #1412). This plan only says which tabs there are.
- **`Figure` on Today** (its figures are the next user; see "What phase C starts from"), the kit's `n`/`minN` greying (the first lens that draws a ratio adds it), Calendar, Usage and Leads rows in the registry (each joins in the PR that draws its first tile), a centred chosen tab on a phone's strip (that is `surface-tabs.jsx`, which this plan may not touch), and `Meter pace`, `Funnel`, `HeatGrid`, `DotPlot`, `DotMap` (phase C).

## Choices this plan makes where the brief did not settle them

1. **The recorder cannot draw a real surface, so Task 1 says so.** The harness is the mockup's static server; an App Router page is drawn by Next alone (`people-src.ts`: "People's page is an App Router page, which only the app draws"). Task 1 empties `PAGES`/`SCENES` of every route that left the shell (it keeps the kit's gallery, the one record the harness still draws), guards the list with a test so it cannot rot again, and writes into the runbook and the skill what proves a page's restyle instead: a by-value test for a move, the gallery's spec for a kit part, and a looked-at run of the app for a page's own look. No step of this plan says "meant to be seen, no recording": each names its proof.
2. **`REPORT_RANGES` grows a Month row, `days: null`** (it has no days of its own: the days since the 1st in the workspace's zone, today included). One table, one new module of functions beside it (`report-periods.ts`). Month's label stays "Month" on the control; the sentences say "Last 5 days" (`rangeLabel` is the days' words), as the report already does for any count of days.
3. **`days=` stays for a release, with a dated end.** The three routes accept `period=` and, until **19 October 2026**, the `days=` that open tabs and the old Campaigns prefetch still send. `report-periods.test.mjs` says in every run that the day has passed and is a red build 30 days after it (the pattern of `ai/flag-registry.test.mjs`); the change that removes `days` deletes its branch and that test together. Not both for ever.
4. **The stored period resets once.** The tab's key changes from `chanlytics.report.days` to `chanlytics.report.period`; a member who had picked 7 or 90 days sees 30 once. A migration of the old key would be code with no second reader.
5. **Ask's view of Reports stays a count of days** (`__REPORTS.days`, read by `legacy-bridge/ask/context.ts`), so no deploy order matters; the server's provider now accepts any whole count from 1 to 90 (`reportDaysAsked`), so a page on Month is described over the days it shows.
6. **The strip is decided from the workspace list the shell already holds** (`workspaceOverride.current()`, an import: `legacy-bridge/surface-data.ts`, as `surfaces/campaigns/broadcasts/surface.ts` reads it), and Reports' first draw waits for that list (`ROUTE_WAITS.reports = ["workspace"]`), so the strip never gains a tab after it is drawn and never waits on a read of its own.
7. **Every tile builder in contracts names its figure** (the 6 of the receptionist's report, Booked, the campaigns' 5 and Google's 4: 16 ids), not only the six the first draft of the brief listed, because `ReportTileVM` is one type and one required field is the only way a tile cannot lack one. To make room, `reports.ts` (799 of its 800 lines) hands its tiles and the words that compare them to `report-tiles.ts`, a pure move.
8. **`Figure` has no `n`/`minN`** (nothing in this PR draws a ratio with a count), draws a `div` of a term and its definitions for the page's `dl`, and takes its door as the kit's press props (`door?: PressAct | PressDoor`). Its meta line clamps at two lines instead of one line and a native `title`.
9. **Reviews draws an honest empty** where it drew nothing (the deployment cannot look listings up), from the registry's words; Pipeline draws its empty where deals are on and none was recorded, and at its address where they are off.
10. **A lens's "empty state's words" are the registry's** (`empty(range)`), and the page's existing empty cards ("Nothing came in", "Nothing went out") read them, with their sentences unchanged.

---

## File map

| File | Change | Responsibility |
| --- | --- | --- |
| `tooling/scripts/checks/style-equality.mjs` | modify | `PAGES`/`SCENES`: the routes the harness can draw (the kit's gallery) |
| `tooling/scripts/tests/styles/style-equality-pages.test.mjs` | create | The recorder opens no route that left the shell |
| `docs/runbook.md`, `.claude/skills/chanlytics-interface/SKILL.md` | modify | What proves a page's restyle, now that the recorder draws the kit alone |
| `apps/dashboard/src/surfaces/kit/download.ts` | create | The one file-download helper (`downloadCsv`) |
| `apps/dashboard/src/surfaces/kit/charts/card.tsx`, `apps/dashboard/src/surfaces/people/bulk/bulk-acts.tsx` | modify | Both import it |
| `apps/dashboard/src/surfaces/people/bulk/download.ts` | delete | Its twin |
| `tooling/scripts/tests/styles/kit-download.test.mjs` | create | The helper, in the browser and in the phone app |
| `packages/contracts/src/reports/report-tiles.ts` | create | The tile builders, their metric ids, `bookedTileOf`, the words that compare (moved out of `reports.ts`) |
| `packages/contracts/src/reports/report-periods.ts` | create | `ReportPeriodId`, how a request names a period, Month's days |
| `packages/contracts/src/reports/lenses.ts` | create | The lens registry and every list derived from it |
| `packages/contracts/src/reports/lens-answer.ts` | create | The head's sentence for a lens |
| `packages/contracts/src/reports/reports.ts`, `campaign-report.ts`, `index.ts`, `packages/contracts/src/google/google.ts` | modify | Tiles name their figure; the table gains Month; "1 day"; the barrel |
| `packages/contracts/src/ask/ask-jump.ts`, `citations.ts` | modify | The palette's jumps and Ask's page routes, derived from the registry |
| `packages/contracts/src/shell/chrome.ts` | modify | `PREFETCH_READS.broadcasts` says `period=30d` |
| `packages/contracts/src/browser.generated.ts`, `packages/*/dist` | regenerate | From the barrels and the sources |
| `packages/db/src/repositories/reports.ts`, `packages/db/src/index.ts` | create, modify | `reportSeries`, `campaignSeries`, `reachOutReport`: the one place the three functions are called by name |
| `apps/dashboard/src/server/readers/report.ts` | create | The one query the three report routes take and the days it means |
| `apps/dashboard/src/server/readers/report.ts`, `campaign-report.ts`, `apps/dashboard/src/server/campaigns/reach-out-report.ts` | modify | Call `packages/db` |
| `apps/dashboard/app/api/v1/reports/route.ts`, `campaigns/route.ts`, `reach-outs/route.ts` | modify | One `period` parameter (and `days` until its day) |
| `apps/dashboard/src/server/ask/context/pages.ts` | modify | Reports' context reads any count of days from 1 to 90 |
| `apps/dashboard/app/(os)/w/[workspace]/reports/[[...lens]]/page.tsx` | move, modify | One page for every lens |
| `apps/dashboard/src/surfaces/routes.ts` | modify | The `reports` row: `takes`, `mount`, `chrome` |
| `apps/dashboard/src/legacy-bridge/surface-registry.ts` | modify | `ROUTE_WAITS.reports` |
| `apps/dashboard/src/surfaces/reports/chrome.ts` | create | Which addresses the page takes; the strip, the crumbs, the mount |
| `apps/dashboard/src/surfaces/reports/head.ts` | create | What Reports says to the frame's head |
| `apps/dashboard/src/surfaces/reports/lenses/{shared,overview,receptionist,people,pipeline,campaigns,reviews}.tsx` | create | Today's sections, moved by value, one file per lens; what they share (props, the empty cards) |
| `apps/dashboard/src/surfaces/reports/sections.tsx` | delete | Moved into the lenses |
| `apps/dashboard/src/surfaces/reports/{surface,period,reports-page,sample,blocks,google,reach-outs}.ts(x)` | modify | Period state, the page by lens, the kit step, `Figure` |
| `apps/dashboard/src/surfaces/kit/figure/figure.tsx`, `figure.type-test.ts` | create | The kit's figure |
| `apps/dashboard/src/surfaces/kit/{index.ts,kit.css,classes.json}` | modify | Its rules, its names, its export |
| `tooling/scripts/e2e-harness/{kit-gallery.mjs,kit-behaves-entries.tsx}`, `e2e/kit/kit-behaves.spec.ts`, `tooling/scripts/tests/styles/kit-components.test.mjs` | modify | Its two gallery families and their holds |
| `apps/dashboard/src/legacy/styles/reports.css`, `eslint.config.mjs`, `tooling/scripts/tests/baselines/*.json` | modify | Rules that fell; Reports leaves `KIT_PENDING`; banked falls |
| `tooling/scripts/tests/reports/*`, `tooling/scripts/tests/ask/*`, `tooling/scripts/tests/shell/*`, `e2e/reports.spec.ts`, `e2e/today/today.spec.ts` | modify, create | The tests each task names |
| `CLAUDE.md`, `apps/dashboard/src/legacy/CLAUDE.md`, `docs/system-prd.md`, `docs/api.md` | modify | The docs the work changes |

## Standing rules for how this is done

- **Local commits only.** Nothing is pushed and no pull request is opened until Ruben says so. One pull request for the whole plan.
- **Sub-agents run on Sonnet.** Never `supabase db reset`; there is no database here.
- **Never run the whole `pnpm test`.** Run the touched test files one per command, `node tooling/scripts/checks/test.mjs <one test file>`; the ratchets and the debt register at a task's end where it says so; `corepack pnpm -r typecheck`, `corepack pnpm lint`, `corepack pnpm check:dead-exports` and `corepack pnpm format:check` where it says so. Before the push, Task 14's `changed-tests.mjs`.
- **Tests import `@chanlytics/contracts` and `@chanlytics/db` from `dist`.** After a contracts or db change: `corepack pnpm --filter "./packages/*" build`, then keep every dist file whose `git diff -w --ignore-cr-at-eol --quiet -- <file>` is not clean, and `git checkout --` the line-ending-only ones. On this Windows machine `packages/db/dist/index.d.ts` gets four `agrees?:` comments spliced in by any build while `packages/db/src/database.types.ts` is CRLF, and that is a real diff the loop below would keep. So, **before the first build of this work**, make that source LF in the working copy (git sees no change, and it stays LF): `node -e "const fs=require('fs');const f='packages/db/src/database.types.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'))"`. After a build, `git diff --stat -- packages/db/dist/index.d.ts` shows nothing, or only the declarations Task 7 adds.
- **Contracts' browser entry.** After a contracts barrel changes: `node tooling/scripts/gen/contracts-browser-entry.mjs`, and `corepack pnpm --filter "./packages/*" build`.
- **Edits are exact replacements or whole-file writes, never `sed`** (Git Bash's `sed` flips CRLF on this machine). Prettier owns formatting: `corepack pnpm exec prettier --write <files>` on every touched file under `apps/`, `packages/`, `tooling/`, `e2e/`, `CLAUDE.md` and `docs/*.md` before `git add` (`docs/superpowers/` is Prettier-ignored).
- **Disk:** check free space before a dashboard build (`df -h .`), and delete this worktree's `apps/dashboard/.next` afterwards. A page change is looked at in the real app (`corepack pnpm --filter @chanlytics/dashboard dev`, `/w/<slug>/reports`), never the standalone mockup.
- **One look.** Never write a `[data-look=...]` selector. **No customer in the code:** fixtures say `harbor`, `Harbor Studio`, `+1555010xxxx`, `example.com`.
- **A media query this plan adds splits at 720px or 900px.** It adds none: the strip's grid keeps its 1180 and 760 rules in `reports.css` (held in `breakpoints.json`), and a held entry that falls is banked in Task 14.

## Review Focus

1. **A move changes no value.** Task 10 draws the old sections and the new lens bodies on the stub React and compares them as text, for a full period and an empty one, before the old module is deleted.
2. **Moving between lenses asks for nothing and never blanks.** Task 11's test counts the reads and the body's cards across a move.
3. **The strip never gains a tab after it is drawn.** `ROUTE_WAITS.reports`, and the chrome reading what the shell already holds (Task 11).
4. **The `days` parameter has a day it ends** (Task 4's test), and no second periods table exists.
5. **The six raw controls are gone, and Reports is out of `KIT_PENDING`** (Task 12), with the baselines that fell banked (Task 14).

---

### Task 1: The style-equality recorder says what it can draw

**Why first:** the plan restyles a real page, and the first thing to know is what can prove that. On main `style-equality.mjs`'s `PAGES` names `clients`, `calendar` and a person's page, and its scenes press them; the harness (`tooling/scripts/e2e-harness/server.mjs`) draws the shell's table (`apps/dashboard/src/legacy/pages/app-routes.jsx`: `segments`, `tasks`, `pipeline`, `fleet`, `content`, `studio`, `store`, `soon`) and the kit's gallery, and answers any other route with "No surface at ...", which `record` refuses. A route in `SURFACE_ROUTES` (`apps/dashboard/src/surfaces/routes.ts`) is drawn by Next alone, so no repair can make the recorder draw one. The smallest honest repair is to say so: list only what draws, hold the list with a test, and write the other proofs down.

**Files:**
- Modify: `tooling/scripts/checks/style-equality.mjs` (the `PERSON` constant, `PAGES`, `SCENES`)
- Create: `tooling/scripts/tests/styles/style-equality-pages.test.mjs`
- Modify: `docs/runbook.md` ("Prove a style change"), `.claude/skills/chanlytics-interface/SKILL.md` ("Prove a change")

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/styles/style-equality-pages.test.mjs`:

```js
/**
 * What the style-equality recorder opens (tooling/scripts/checks/style-equality.mjs, PAGES and SCENES) is only ever a
 * route the harness can draw. The harness is the mockup's static server: it draws the shell's own table and the kit's
 * gallery, and answers an App Router page (every route in apps/dashboard/src/surfaces/routes.ts) with "No surface at",
 * which `record` refuses. A page that leaves the shell takes its route out of the list in the same change; this holds
 * the list to it, so the recorder cannot rot into a tool that fails on its first page again (it did, on 5 Oct 2026).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGES, SCENES } from "../../checks/style-equality.mjs";
import { importSrc } from "../_source.mjs";

const { routeHasPage } = await importSrc("apps/dashboard/src/surfaces/routes.ts");

/** Every route the recorder opens, with the record or scene that opens it. */
const opened = () => [
  ...Object.entries(PAGES).flatMap(([record, routes]) => routes.map((route) => [record, route])),
  ...Object.entries(SCENES).map(([name, scene]) => [`scene "${name}"`, scene.route]),
];

test("the recorder opens no route that has left the shell: an App Router page is drawn by Next alone", () => {
  const gone = opened()
    .filter(([, route]) => routeHasPage(route))
    .map(([at, route]) => `${at}: ${route}`);
  assert.deepEqual(gone, [], "a route that left the shell comes out of PAGES and SCENES in the change that moves it");
});

test("a record opens something, and a scene runs in a record that exists", () => {
  for (const [record, routes] of Object.entries(PAGES)) assert.ok(routes.length > 0, `${record} opens no route`);
  for (const [name, scene] of Object.entries(SCENES))
    assert.ok(Object.hasOwn(PAGES, scene.record), `scene "${name}": the record ${scene.record} opens no route`);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/style-equality-pages.test.mjs`
Expected: the first test FAILS with `gone` listing `salon: clients`, `salon: clients/c-aisha`, `salon: calendar`, `pipeline: clients`, `pipeline: clients/pipeline`, `pipeline: clients/leads`, `pipeline: clients/5c0e0000-0000-4000-8000-000000000003` and the seven scenes; the second passes.

- [ ] **Step 3: Say what the recorder draws**

In `tooling/scripts/checks/style-equality.mjs`, replace everything from the comment line `/** The pipeline record's third person (scenarios.mjs \`uuidOf\`): a proposal out, a conversation, a number. */` through the closing `};` of `SCENES` (the line before `/** A desk and a phone.`) with:

```js
/**
 * The harness's records and the routes each is opened at (the address after `#/`). The harness is the standalone mockup's
 * static server (e2e-harness/server.mjs): it draws the shell's own table and the kit's gallery, and nothing else. A page that
 * has left the shell (an App Router page, src/surfaces/routes.ts: Today, the Inbox, People, Leads, the Calendar, Reports,
 * Campaigns, Settings, the first run) is drawn by Next alone, so the harness answers it with "No surface at", which `record`
 * refuses. What is left to record is the kit's gallery, which draws every class of the kit (e2e-harness/kit-gallery.mjs) and has
 * no routes, so its one is a name. A page that leaves the shell takes its route out of this list in the same change, and
 * styles/style-equality-pages.test.mjs fails the one that does not. A change to a page that has left is proved elsewhere
 * (docs/runbook.md, "Prove a style change").
 */
export const PAGES = {
  kit: ["kit"],
};

/**
 * What is drawn only after a press, each recorded as a page of its own: the record and route it opens, its presses (`click`,
 * `hover` or `focus` on the first element a selector finds, or `key`, the key named third pressed there), and what must then be
 * on screen. None now: the scenes pressed the pages that left (a person's menu, a confirm, a toast, a fold, a danger item, a
 * focused button, the tooltip on Today's bell), and the kit's states are held in a browser by e2e/kit/kit-behaves.spec.ts.
 */
export const SCENES = {};
```

Also change the sentence in the file's header (the paragraph starting `` `record` starts the e2e harness``) from "...opens each route of PAGES and each scene of SCENES (a route and a press or two, for what is drawn only after one: a menu, a confirm, a toast, a sheet, a fold, a combobox's list, a control in its hovered, focused, picked or on state, a tooltip)..." to "...opens each route of PAGES and each scene of SCENES (a route and a press or two, for what is drawn only after one; none today)...". Keep the rest of that paragraph.

- [ ] **Step 4: Run the tests**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/style-equality-pages.test.mjs` — PASS.
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/style-equality.test.mjs` — PASS (the comparison it holds does not read `PAGES`).

- [ ] **Step 5: Write down what proves a page's restyle**

In `docs/runbook.md`, "Prove a style change":

1. Replace the paragraph that begins `` `record` starts the harness above for each record `` and ends `` A full recording takes ten to fifteen minutes. `` with:

```md
`record` starts the harness above for each record and opens each route at 1440 by 900 and at a phone's 390 by 844 with a
coarse pointer, dark and light. The harness is the mockup's static server, so it draws the shell's own table and the kit's
gallery and nothing else: a page that has left the shell (an App Router page, `apps/dashboard/src/surfaces/routes.ts`:
Today, the Inbox, People, Leads, the Calendar, Reports, Campaigns, Settings, the first run) is drawn by Next alone, and the
harness answers it with "No surface at", which `record` refuses. What `record` opens today is the kit's gallery, which draws
every class of the kit (a recording made before the gallery joined, or with other records, is not compared with one after:
exit 2); the salon's and the pipeline's pages and the eleven scenes it once pressed left with the pages they pressed
(`styles/style-equality-pages.test.mjs` fails a list that names a page that has left). Motion is stopped before a page
draws, and its clock stands still at one moment and moves only as the recorder steps it, ten simulated seconds a route, so a
timer's work is in every recording or in none. It writes every element's edges, to 1/64 of a pixel, and every computed
longhand, a `::before`, `::after`, `::marker` and `::placeholder`'s included, and which rules of each stylesheet the pages
drew. It refuses a page that did not draw what it opened: an empty root, a "No surface at" card, the wrong theme, an error
the page threw, a stylesheet or a font that did not load or answered with an error, 4xx or 5xx (a page drawn without its
rules or in a fallback face is another page), or a request that never ended. A full recording takes a few minutes.

A change to a page that has left the shell is proved by what can draw it: a **move** by value, in a test that draws the old
and the new on the page's stub React and compares them (decision 0015; Reports' lenses, `tooling/scripts/tests/reports/`);
a **kit part** by the gallery's spec (`e2e/kit/kit.spec.ts`), which holds each rule to the tokens it reads in both themes,
both widths and the one look; and a page's **own restyle** by the running app, looked at at 1440 and at 390 in both themes
("See a real page", above), with the change's list of what must differ written in the pull request.
```

2. In "What it cannot prove", replace the bullet beginning `- a route it does not record, and the real surfaces the mockup stubs:` with:

```md
- a page that has left the shell, which the harness cannot draw (above), and the real surfaces the mockup stubs: Today, the
  Inbox, the Calendar and Live draw the seeded page, and Leads waits and then says it could not be read;
```

In `.claude/skills/chanlytics-interface/SKILL.md`, "Prove a change", after the code block of the first bullet, add:

```md
  The recorder draws the kit's gallery and the shell's table, and nothing else: a surface that has left the shell is drawn by
  Next, so the recorder refuses it (`docs/runbook.md`, "Prove a style change"). For such a page prove a move by value (a test
  that draws the old and the new on the stub React and compares them), a kit part by the gallery's spec, and a page's own
  restyle by looking at the running app at 1440 and 390 in both themes.
```

- [ ] **Step 6: Run the tool once by hand**

On a machine with the network (the page loads React and its fonts from the CDNs): `corepack pnpm check:style-equality -- self-test`. Expected: exit 0 (two recordings of the kit's gallery agree; a third, with `--radius-md` moved one step, does not).

- [ ] **Step 7: Format, check the docs' paths, commit**

```bash
corepack pnpm exec prettier --write tooling/scripts/checks/style-equality.mjs tooling/scripts/tests/styles/style-equality-pages.test.mjs docs/runbook.md .claude/skills/chanlytics-interface/SKILL.md
node tooling/scripts/checks/test.mjs tooling/scripts/tests/docs/docs-paths.test.mjs
git add tooling/scripts/checks/style-equality.mjs tooling/scripts/tests/styles/style-equality-pages.test.mjs docs/runbook.md .claude/skills/chanlytics-interface/SKILL.md
git commit -m "The style recorder opens only what the harness draws, the kit's gallery, and the runbook says what proves a page that left the shell." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: One file-download helper, in the kit

**Why:** `kit/charts/card.tsx` (`ckSaveCsv`) and `people/bulk/download.ts` (`downloadCsv`) each build a CSV blob, click an anchor and revoke the address; only the card's hands the file to the phone app first. One helper, with the phone app's door, in the kit.

**Files:**
- Create: `apps/dashboard/src/surfaces/kit/download.ts`, `tooling/scripts/tests/styles/kit-download.test.mjs`
- Modify: `apps/dashboard/src/surfaces/kit/charts/card.tsx`, `apps/dashboard/src/surfaces/people/bulk/bulk-acts.tsx`
- Delete: `apps/dashboard/src/surfaces/people/bulk/download.ts`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/styles/kit-download.test.mjs`:

```js
/**
 * The kit's one file download (surfaces/kit/download.ts), which the chart card's CSV and People's export both save through:
 * a CSV with a byte-order mark under its name, its address let go once the save has begun; and inside the phone app, where a
 * WebView cannot save a file made in the page, the same words handed to the app's share sheet through the `app:file` event
 * (legacy-bridge/app-bridge.ts) and nothing saved.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";

installLegacyReact();
const { downloadCsv } = await importSrc("apps/dashboard/src/surfaces/kit/download.ts");
const BOM = String.fromCharCode(0xfeff);

/** The browser's save, stood in for: what was made, what was clicked, what was let go. */
const saving = async (run) => {
  const saved = [];
  const clicked = [];
  const revoked = [];
  const real = { create: URL.createObjectURL, revoke: URL.revokeObjectURL, el: globalThis.document.createElement };
  URL.createObjectURL = (blob) => {
    saved.push(blob);
    return "blob:kit";
  };
  URL.revokeObjectURL = (url) => revoked.push(url);
  globalThis.document.createElement = () => ({
    style: {},
    setAttribute() {},
    click() {
      clicked.push({ href: this.href, download: this.download });
    },
    remove() {},
  });
  try {
    await run();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    return { saved, clicked, revoked };
  } finally {
    URL.createObjectURL = real.create;
    URL.revokeObjectURL = real.revoke;
    globalThis.document.createElement = real.el;
  }
};

test("a CSV is saved with its byte-order mark under its name, and its address is let go afterwards", async () => {
  const { saved, clicked, revoked } = await saving(() => downloadCsv("people-2026-10-05.csv", "Name\r\nHarbor Studio"));
  assert.deepEqual(clicked, [{ href: "blob:kit", download: "people-2026-10-05.csv" }]);
  assert.equal(saved[0].type, "text/csv;charset=utf-8");
  const bytes = new Uint8Array(await saved[0].arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "a spreadsheet reads the accents");
  assert.equal((await saved[0].text()).replace(BOM, ""), "Name\r\nHarbor Studio");
  assert.deepEqual(revoked, ["blob:kit"]);
});

test("inside the phone app the same words go to its share sheet, mark and all, and the page saves nothing", async () => {
  const handed = [];
  const real = globalThis.window.dispatchEvent;
  globalThis.window.dispatchEvent = (event) => {
    if (event.type === "app:file") (handed.push(event.detail), event.preventDefault());
    return !event.defaultPrevented;
  };
  try {
    const { saved, clicked } = await saving(() => downloadCsv("calls.csv", "Day,Calls"));
    assert.deepEqual([saved.length, clicked.length], [0, 0], "a blob the WebView would drop without a word");
    assert.deepEqual(handed, [{ name: "calls.csv", type: "text/csv", text: `${BOM}Day,Calls` }]);
  } finally {
    globalThis.window.dispatchEvent = real;
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-download.test.mjs`
Expected: FAIL, `apps/dashboard/src/surfaces/kit/download.ts` cannot be found.

- [ ] **Step 3: Write the helper**

Create `apps/dashboard/src/surfaces/kit/download.ts`:

```ts
/**
 * A file the browser saves, the kit's one door for it (the chart card's CSV and People's export each had a copy): text as a
 * CSV with a byte-order mark, so a spreadsheet reads its accents. Inside the phone app a WebView cannot save a file made in the
 * page: the app's bridge takes the same words to the share sheet and cancels the event (legacy-bridge/app-bridge.ts); anywhere
 * else nothing listens, and the browser saves it.
 */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** How long the file's address is kept once it is offered: the download has begun by then. */
const REVOKE_AFTER_MS = 1000;

export function downloadCsv(name: string, text: string): void {
  const asked = new CustomEvent("app:file", {
    cancelable: true,
    detail: { name, type: "text/csv", text: BYTE_ORDER_MARK + text },
  });
  if (typeof window.dispatchEvent === "function" && !window.dispatchEvent(asked)) return;
  const blob = new Blob([BYTE_ORDER_MARK + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
```

- [ ] **Step 4: Point both users at it**

In `apps/dashboard/src/surfaces/kit/charts/card.tsx`: add `import { downloadCsv } from "../download";` beside the other imports; delete the constants `CK_BOM` and `REVOKE_AFTER_MS` (and their comment lines `/** The browser has started the save by then: the address made for it is let go. */`), and replace the body of `ckSaveCsv` from `const asked = new CustomEvent(` through `window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);` (and the comment above it, "Inside the phone app a WebView cannot save a file...") with `downloadCsv(name, body);`. `ckSaveCsv` keeps its `body` and `name` lines and its signature:

```ts
function ckSaveCsv(title: string, table: ChartTableData): void {
  const body = [table.columns, ...table.rows].map((r) => r.map((v) => csvCell(v)).join(",")).join("\r\n");
  const name = `${String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}.csv`;
  downloadCsv(name, body);
}
```

In `apps/dashboard/src/surfaces/people/bulk/bulk-acts.tsx` change line 20 `import { downloadCsv } from "./download";` to `import { downloadCsv } from "../../kit/download";`. Delete `apps/dashboard/src/surfaces/people/bulk/download.ts` (`git rm`).

- [ ] **Step 5: Run the helper's test and the two users' regressions**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-download.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/chart-kit.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/people/people-honest.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/mobile/app-bridge-page.test.mjs
```
Expected: all PASS (the chart card's CSV and the phone app's hand-off, People's bulk export by its blob, the bridge's `app:file`).

- [ ] **Step 6: Format and commit**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/kit/download.ts apps/dashboard/src/surfaces/kit/charts/card.tsx apps/dashboard/src/surfaces/people/bulk/bulk-acts.tsx tooling/scripts/tests/styles/kit-download.test.mjs
git add apps/dashboard/src/surfaces/kit/download.ts apps/dashboard/src/surfaces/kit/charts/card.tsx apps/dashboard/src/surfaces/people/bulk/bulk-acts.tsx tooling/scripts/tests/styles/kit-download.test.mjs
git rm apps/dashboard/src/surfaces/people/bulk/download.ts
git commit -m "A CSV is saved by one helper in the kit, with the phone app's hand-off, for the chart card and People's export alike." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Every tile names its figure, where it is built

**Why:** "Each tile builder in contracts declares its `metric` id where it is built (typed, a closed union)", with no lookup map, no fallback, no copy of the label and no free-prose source. `ReportTileVM` is one type three modules build (the receptionist's six, the campaigns' five, Google's four) and the page adds a seventh (Booked), so one required field is the only way a tile cannot lack its id. `reports.ts` is 799 lines and the file-length ratchet holds files to 800, so the tiles and the words that compare them move to `report-tiles.ts` first (a pure move: the existing tests run unchanged and prove it).

**Files:**
- Create: `packages/contracts/src/reports/report-tiles.ts`
- Modify: `packages/contracts/src/reports/reports.ts`, `packages/contracts/src/reports/campaign-report.ts`, `packages/contracts/src/google/google.ts`, `packages/contracts/src/reports/index.ts`
- Modify (tests): `tooling/scripts/tests/reports/reports-vm.test.mjs`, `tooling/scripts/tests/reports/campaign-report.test.mjs`, `tooling/scripts/tests/google/google.test.mjs`
- Regenerate: `packages/contracts/src/browser.generated.ts`, `packages/*/dist`

- [ ] **Step 1: Write the failing tests**

In `tooling/scripts/tests/reports/reports-vm.test.mjs` change the import line to `import { toReportVM, deltaOf, quantile, fmtSeconds, fmtDay, REPORT_RANGES, bookedTileOf, toBookingReportVM } from "@chanlytics/contracts";` and append:

```js
test("each tile names the figure it says where it is built, once: the report's six, in the order the view model lists them", () => {
  assert.deepEqual(
    toReportVM(dto(), { profile: null }).tiles.map((t) => [t.id, t.metric]),
    [
      ["messages", "customer_messages"],
      ["answered", "answered_share"],
      ["reply", "reply_median"],
      ["needed", "handovers"],
      ["calls", "calls"],
      ["people", "new_people"],
    ],
  );
});

test("Booked is a tile of contracts', with its figure: a count where the calendar was read, and why there is none where not", () => {
  assert.deepEqual(bookedTileOf(toBookingReportVM({ calendar: "ok", days: 7, asked: 8, booked: 3 })), {
    id: "booked",
    metric: "booked",
    label: "Booked",
    value: "3",
    meta: "of 8 who asked",
    compare: null,
  });
  const why = (b) => {
    const t = bookedTileOf(b);
    return [t.value, t.meta];
  };
  assert.deepEqual(why(toBookingReportVM({ calendar: "unavailable", days: 7, asked: 4, booked: 0 })), [
    "—",
    "the calendar could not be read",
  ]);
  assert.deepEqual(why(toBookingReportVM({ calendar: "none", days: 7, asked: 0, booked: 0 })), [
    "—",
    "no calendar to read",
  ]);
  assert.deepEqual(why(null), ["—", "no calendar to read"]);
});
```

In `tooling/scripts/tests/reports/campaign-report.test.mjs`, in the test `totals, shares of sent, and deltas over the prior period`, after `assert.equal(by.replied.value, "20%");` add:

```js
  assert.deepEqual(
    vm.tiles.map((t) => t.metric),
    ["messages_sent", "delivered_share", "replied_share", "said_yes", "asked_to_stop"],
    "each names its figure where it is built",
  );
```

In `tooling/scripts/tests/google/google.test.mjs`, in the test `the view model: four measured tiles...`, after `assert.equal(vm.tiles[3].meta, "★★★★★ · Ana P.");` add:

```js
  assert.deepEqual(
    vm.tiles.map((t) => t.metric),
    ["rating", "reviews", "ratings_gained", "newest_review"],
    "each names its figure where it is built",
  );
```

- [ ] **Step 2: Run them to verify they fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-vm.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/campaign-report.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/google/google.test.mjs
```
Expected: FAIL: `bookedTileOf` is not exported (reports-vm), and `t.metric` is `undefined` in the three.

- [ ] **Step 3: Write `report-tiles.ts`**

Create `packages/contracts/src/reports/report-tiles.ts`. The functions `fmtSeconds`, `deltaOf`, `pointsDelta` and `compareWords` and the six builders are `reports.ts`'s, **moved verbatim** (cut them from `reports.ts` in Step 4; the six builders gain one line, `metric`):

```ts
/**
 * The tiles of a report, and the words that compare them (moved out of reports.ts, which the file-length ratchet holds to 800
 * lines): a number over the period, what it is, a line under it, and the period before beside it. A tile names the figure it
 * says, by one id, where its builder builds it (`metric`): a closed set, so a tile that says what no id names is a compile
 * error rather than a lookup that falls back, and the id is what the figure is called wherever it is read (the page's
 * figures today; a definition's tooltip, Ask's block and the headline of a later phase). Not prefixed by a lens: a tile moves
 * between lenses (the lenses spec, D18) and its id does not. The receptionist's tiles are built here; the campaigns' and
 * Google's are built where their reports are, and name their figures from this same set.
 */
import type { BookingReportVM } from "../calendar/calendar-people";
import { durationWords } from "../shared/clock";
import { holdNote } from "./report-speed";
import type { PeriodFacts } from "./reports";

/** Every figure a tile says. */
type ReportMetric =
  | "customer_messages"
  | "answered_share"
  | "reply_median"
  | "handovers"
  | "calls"
  | "new_people"
  | "booked"
  | "messages_sent"
  | "delivered_share"
  | "replied_share"
  | "said_yes"
  | "asked_to_stop"
  | "rating"
  | "reviews"
  | "ratings_gained"
  | "newest_review";

export interface ReportTileVM {
  id: string;
  /** The figure this tile says: one id, declared by the builder of the tile. */
  metric: ReportMetric;
  label: string;
  value: string;
  meta: string;
  /** Signed change against the previous period, or null when there is no
   *  prior data to compare with (never a fabricated 0%). Ask reads it. */
  delta: { text: string; tone: "pos" | "neg" | "" } | null;
  /** One point per day of the current period (Ask and Today read these). */
  spark: number[];
  /** The period before, in counts ("up from 99"); null when there is nothing to compare with. */
  compare: string | null;
}

/** A duration in an owner's words (durationWords), or a dash where there is none. */
export function fmtSeconds(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "—";
  return durationWords(s);
}

/*
 * deltaOf, pointsDelta and compareWords: paste them here from reports.ts exactly as they stand (their doc comments too),
 * `export function` each. They name ReportTileVM["delta"], which is above.
 */

/** A tile: a number over the period, what it is, a line under it, and the period before beside it. */
type ReportTile = (f: PeriodFacts) => ReportTileVM;

const messagesTile: ReportTile = ({ days, current, points, tot, prev, noun, rangeLabel, priorHadAny }) => ({
  id: "messages",
  metric: "customer_messages",
  label: "Customer messages",
  value: String(tot.in),
  meta: tot.in ? `on ${current.filter((d) => d.messages_in > 0).length} of ${days} days` : "none in this period",
  delta: deltaOf(tot.in, prev.in, true, noun),
  spark: points.map((p) => p.in),
  compare: compareWords(tot.in, prev.in, rangeLabel, priorHadAny),
});

const answeredTile: ReportTile = ({ points, tot, noun, answeredTotal, aiShare, prevShare }) => ({
  id: "answered",
  metric: "answered_share",
  label: "Receptionist answered",
  value: aiShare === null ? "—" : `${aiShare}%`,
  meta: answeredTotal
    ? `${tot.ai} of ${answeredTotal} · ${tot.you} by you · ${tot.none} unanswered`
    : "nothing to answer",
  // A share compares in POINTS. Against counts, the share could fall from
  // 100% to 60% while the delta read +20% in green.
  delta: pointsDelta(aiShare, prevShare, noun),
  spark: points.map((p) => p.ai),
  compare: null,
});

const replyTile: ReportTile = ({ sortedReply, median, p90, hold }) => ({
  id: "reply",
  metric: "reply_median",
  label: "Median reply time",
  value: fmtSeconds(median),
  // The reply time includes the hold the owner set, and says so where replies waited one (spec D14).
  meta: sortedReply.length
    ? `slowest tenth ${fmtSeconds(p90)} · ${sortedReply.length} replies${holdNote(hold)}`
    : "no receptionist replies yet",
  delta: null,
  spark: [],
  compare: null,
});

const neededTile: ReportTile = ({ points, tot, prev, noun, rangeLabel, priorHadAny }) => ({
  id: "needed",
  metric: "handovers",
  label: "Needed you",
  value: String(tot.escalations),
  meta: tot.escalations ? "times the receptionist stopped" : "the receptionist never stopped",
  delta: deltaOf(tot.escalations, prev.escalations, false, noun),
  spark: points.map((p) => p.escalations),
  compare: compareWords(tot.escalations, prev.escalations, rangeLabel, priorHadAny),
});

const callsTile: ReportTile = ({ dto, points, tot, prev, noun, rangeLabel, priorHadAny }) => ({
  id: "calls",
  metric: "calls",
  label: "Calls",
  value: String(tot.calls),
  meta: tot.calls
    ? `${Math.max(1, Math.round(tot.callSeconds / 60))} min on the phone · ${dto.voicemail ?? 0} to voicemail`
    : "no calls",
  delta: deltaOf(tot.calls, prev.calls, true, noun),
  spark: points.map((p) => p.calls),
  compare: compareWords(tot.calls, prev.calls, rangeLabel, priorHadAny),
});

const peopleTile: ReportTile = ({ points, tot, prev, noun, rangeLabel, priorHadAny }) => ({
  id: "people",
  metric: "new_people",
  label: "New people",
  value: String(tot.newPeople),
  meta: tot.newPeople ? "first contact in this period, by evidence" : "nobody new",
  delta: deltaOf(tot.newPeople, prev.newPeople, true, noun),
  spark: points.map((p) => p.newPeople),
  compare: compareWords(tot.newPeople, prev.newPeople, rangeLabel, priorHadAny),
});

/** The six tiles, in the order the view model has always listed them. */
export const REPORT_TILES: readonly ReportTile[] = [
  messagesTile,
  answeredTile,
  replyTile,
  neededTile,
  callsTile,
  peopleTile,
];

/** What the page's strip draws of a tile: its figure, its words, and the period before beside it. */
export type ReportStripTile = Pick<ReportTileVM, "id" | "metric" | "label" | "value" | "meta" | "compare">;

/** Booked, from the calendar: a count where one was read, and why there is none where not (moved from the page's strip). */
export function bookedTileOf(booking: BookingReportVM | null): ReportStripTile {
  const tile = { id: "booked", metric: "booked", label: "Booked", compare: null } as const;
  if (booking && booking.present)
    return { ...tile, value: String(booking.booked), meta: booking.asked ? `of ${booking.asked} who asked` : "nobody asked" };
  return {
    ...tile,
    value: "—",
    meta: booking && booking.calendar === "unavailable" ? "the calendar could not be read" : "no calendar to read",
  };
}
```

Replace the block comment `/* deltaOf, pointsDelta and compareWords: paste them here ... */` with the three functions themselves, pasted from `reports.ts` (lines 262 to 307 on this tree: `deltaOf`, `pointsDelta`, `compareWords`, each with its doc comment, `export function` as they are). Nothing else of them changes.

- [ ] **Step 4: Cut them out of `reports.ts`, and let the other builders name their figures**

In `packages/contracts/src/reports/reports.ts`:
1. Line 17: change `import { absoluteBuckets, heroSpeed, holdBuckets, holdLine, holdNote, holdOf, type ReportHoldVM } from "./report-speed";` to the same without `holdNote, `. Delete line 19, `import { durationWords } from "../shared/clock";`. Add `import { REPORT_TILES, fmtSeconds, type ReportTileVM } from "./report-tiles";` after the `./report-closed` import.
2. Delete the `export interface ReportTileVM { ... }` block (from `export interface ReportTileVM {` through its closing `}`, just after `REPORT_RANGES`).
3. Delete `fmtSeconds` (with the comment line above it), `deltaOf`, `pointsDelta` and `compareWords`, each with its doc comment (they are in `report-tiles.ts` now). Keep `dayDate`, `fmtDay`, `quantile`, and everything from `bars` on.
4. Change `type PeriodFacts = ReturnType<typeof periodFactsOf>;` to `export type PeriodFacts = ReturnType<typeof periodFactsOf>;` (`report-tiles.ts` reads it as a type).
5. Delete the comment `/** A tile: a number over the period, ... */`, `type ReportTile = ...`, the six builders `messagesTile` to `peopleTile` and `REPORT_TILES` with its comment: everything from `/** A tile: a number over the period` down to and including the line `const REPORT_TILES: readonly ReportTile[] = [messagesTile, ...];`.

In `packages/contracts/src/reports/campaign-report.ts`: replace line 12 with

```ts
import { dayDate, fmtDay, priorOf } from "./reports";
import { deltaOf, pointsDelta, type ReportTileVM } from "./report-tiles";
```

and add a `metric` line under each tile's `id`:

| tile `id` | add under it |
| --- | --- |
| `id: "sent",` | `metric: "messages_sent",` |
| `id: "delivered",` | `metric: "delivered_share",` |
| `id: "replied",` | `metric: "replied_share",` |
| `id: "optins",` | `metric: "said_yes",` |
| `id: "optouts",` | `metric: "asked_to_stop",` |

In `packages/contracts/src/google/google.ts`: replace line 21 with

```ts
import { dayDate, fmtDay } from "../reports/reports";
import { deltaOf, type ReportTileVM } from "../reports/report-tiles";
```

and add under each tile's `id`: `id: "rating",` gets `metric: "rating",`; `id: "reviews",` gets `metric: "reviews",`; `id: "gained",` gets `metric: "ratings_gained",`; `id: "newest",` gets `metric: "newest_review",`.

In `packages/contracts/src/reports/index.ts`: delete `fmtSeconds,`, `deltaOf,`, `pointsDelta,` and `compareWords,` from the `export { ... } from "./reports";` list and `ReportTileVM,` from the `export type { ... } from "./reports";` list, and add after them:

```ts
export { fmtSeconds, deltaOf, pointsDelta, compareWords, bookedTileOf } from "./report-tiles";
export type { ReportTileVM, ReportStripTile } from "./report-tiles";
```

- [ ] **Step 5: Build, regenerate the browser entry, run**

```bash
corepack pnpm exec prettier --write packages/contracts/src/reports packages/contracts/src/google/google.ts
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter "./packages/*" build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-vm.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/campaign-report.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/google/google.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/contracts-import-cycles.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs
corepack pnpm -r typecheck
```
Expected: all PASS. `reports-page.test.mjs` is the proof the move changed no value (it runs unchanged). `contracts-import-cycles` passes because `report-tiles.ts` imports `reports.ts` for a type alone.

- [ ] **Step 6: Commit**

```bash
for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done
git status --short packages
git add packages/contracts/src/reports packages/contracts/src/google/google.ts packages/contracts/src/browser.generated.ts packages/*/dist tooling/scripts/tests/reports/reports-vm.test.mjs tooling/scripts/tests/reports/campaign-report.test.mjs tooling/scripts/tests/google/google.test.mjs
git commit -m "Every tile a report draws names the figure it says where its builder builds it, and the receptionist's tiles and the words that compare them have a module of their own." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
---

### Task 4: One periods table, Month in it, one period parameter's words

**Why:** `REPORT_RANGES` (7, 30, 90 days) has ten users; it is the one table, so Month joins it as a row (`days: null`: the days since the 1st in the workspace's zone, today included), and the functions that read it live beside it in `report-periods.ts`. The three routes take `period=7d|30d|90d|month` (Task 5); `days=` is read until 19 October 2026 because tabs opened before the deploy and the document head's old prefetch still send it, and a test holds the day.

**Files:**
- Create: `packages/contracts/src/reports/report-periods.ts`, `tooling/scripts/tests/reports/periods/report-periods.test.mjs`
- Modify: `packages/contracts/src/reports/reports.ts` (the table, "1 day"), `report-tiles.ts`, `campaign-report.ts`, `reach-out-report.ts` and `packages/contracts/src/google/google.ts` ("1 day" where they count days), `packages/contracts/src/reports/index.ts`, `tooling/scripts/tests/reports/reports-vm.test.mjs`
- Regenerate: `packages/contracts/src/browser.generated.ts`, `packages/*/dist`

The users of `REPORT_RANGES`, found by `grep -rn REPORT_RANGES apps packages tooling e2e` on this tree: the three routes (Task 5), `server/ask/context/pages.ts` (Task 5), `server/ask/tools/read/report.ts` (unchanged: its `r.days === days` still reads 7, 30 and 90), `surfaces/reports/surface.ts` (Task 6), `reports.ts` itself (`rangeLabel`), and `reports-vm.test.mjs`.

- [ ] **Step 1: Write the failing tests**

In `tooling/scripts/tests/reports/reports-vm.test.mjs`, replace the `assert.deepEqual(REPORT_RANGES.map((r) => r.days), [7, 30, 90]);` block in `every chart has a table twin with the same numbers` with:

```js
  assert.deepEqual(
    REPORT_RANGES.map((r) => [r.id, r.days, r.label]),
    [
      ["7d", 7, "7 days"],
      ["30d", 30, "30 days"],
      ["90d", 90, "90 days"],
      ["month", null, "Month"],
    ],
    "one table, and Month has no days of its own",
  );
```

and append:

```js
test("a one-day period says one day: Month on the first of the month is read over one", () => {
  const vm = toReportVM(
    dto({
      days: 1,
      span_days: 2,
      today: "2026-09-04",
      series: [day("2026-09-03"), day("2026-09-04", { messages_in: 1, answered_ai: 1, conversations: 1 })],
    }),
    { profile: null },
  );
  assert.equal(vm.rangeLabel, "1 day");
  assert.equal(vm.tiles[0].meta, "on 1 of 1 day", "and every line that counts the days says it so");
});
```

Create `tooling/scripts/tests/reports/periods/report-periods.test.mjs`:

```js
/**
 * The periods Reports offers and how a request names one (contracts reports/report-periods.ts over REPORT_RANGES): Month is
 * the days since the 1st in the workspace's own zone, today included; `period` names one, and `days`, which every page sent
 * before there was a Month, is read until its day, which this file holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS,
  REPORT_PERIOD_DEFAULT,
  REPORT_RANGES,
  fixedDaysOf,
  isReportPeriod,
  monthDaysAt,
  reportDaysAsked,
  reportPeriodOf,
  zoneDayKey,
} from "@chanlytics/contracts";

test("the periods are the table's: three counts of days and Month, thirty days by default", () => {
  assert.deepEqual(
    REPORT_RANGES.map((r) => r.id),
    ["7d", "30d", "90d", "month"],
  );
  assert.equal(REPORT_PERIOD_DEFAULT, "30d");
  for (const id of ["7d", "30d", "90d", "month"]) assert.ok(isReportPeriod(id), id);
  for (const no of ["14d", "7", "Month", "", null, undefined, 30]) assert.ok(!isReportPeriod(no), String(no));
  assert.deepEqual(["7d", "30d", "90d", "month"].map(fixedDaysOf), [7, 30, 90, null]);
});

test("Month is the day of the month in the workspace's zone, today included, not the server's", () => {
  assert.equal(monthDaysAt("2026-10-05"), 5);
  assert.equal(monthDaysAt("2026-10-31"), 31);
  // 02:30 UTC on 1 October is still 30 September in Los Angeles and already the afternoon of the 1st in Auckland.
  const at = Date.parse("2026-10-01T02:30:00Z");
  assert.equal(monthDaysAt(zoneDayKey(at, "America/Los_Angeles")), 30);
  assert.equal(monthDaysAt(zoneDayKey(at, "Pacific/Auckland")), 1);
  assert.equal(monthDaysAt(zoneDayKey(at, "UTC")), 1);
});

test("a request names a period or, until its day, its days; none named is thirty days; anything else is none of ours", () => {
  assert.equal(reportPeriodOf({}), "30d");
  assert.equal(reportPeriodOf({ period: "month" }), "month");
  assert.equal(reportPeriodOf({ period: "7d", days: "90" }), "7d", "period wins");
  assert.equal(reportPeriodOf({ days: "90" }), "90d", "what open tabs still send");
  assert.equal(reportPeriodOf({ days: "7" }), "7d");
  for (const bad of [{ days: "45" }, { days: "month" }, { period: "14d" }, { period: "" }, { period: "7" }])
    assert.equal(reportPeriodOf(bad), null, JSON.stringify(bad));
});

test("a page that says it shows N days is described over N days, for any whole count the report can read", () => {
  assert.equal(reportDaysAsked("7"), 7);
  assert.equal(reportDaysAsked("5"), 5, "Month on the 5th");
  assert.equal(reportDaysAsked("90"), 90);
  for (const no of ["91", "0", "-3", "7.5", "month", "", null, undefined]) assert.equal(reportDaysAsked(no), null, String(no));
});

// The `days` parameter is read until REMOVE_AFTER. Its day passed is said in every run, and a month after it is a red build:
// no unrelated change is stopped on the day, and nobody can leave it for good (the pattern of ai/flag-registry.test.mjs).
const REMOVE_AFTER = "2026-10-19";
const GRACE_DAYS = 30;

test("the days parameter ends on 19 October 2026: the change that removes it deletes its branch in report-periods.ts and this test", (t) => {
  assert.equal(reportPeriodOf({ days: "30" }), "30d", "still read, for the tabs and the head's old prefetch");
  const today = new Date().toISOString().slice(0, 10);
  const lastDay = new Date(Date.parse(`${REMOVE_AFTER}T00:00:00Z`) + GRACE_DAYS * DAY_MS).toISOString().slice(0, 10);
  if (today > REMOVE_AFTER)
    t.diagnostic(`its day (${REMOVE_AFTER}) has passed: remove the days parameter from the three report routes`);
  assert.ok(
    today <= lastDay,
    `the days parameter's day (${REMOVE_AFTER}) passed more than ${GRACE_DAYS} days ago: remove it (report-periods.ts reportPeriodOf, the three routes' query) and this test`,
  );
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/periods/report-periods.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-vm.test.mjs
```
Expected: `report-periods` FAILS (the names are not exported); `reports-vm` FAILS on the table and on `"1 days"`.

- [ ] **Step 3: The table, the noun, and the functions beside it**

In `packages/contracts/src/reports/reports.ts`, replace

```ts
export const REPORT_RANGES: readonly { days: number; id: string; label: string }[] = [
  { days: 7, id: "7d", label: "7 days" },
  { days: 30, id: "30d", label: "30 days" },
  { days: 90, id: "90d", label: "90 days" },
];
```

with

```ts
/**
 * The periods Reports offers, said once. Three are a count of days; Month has none of its own: it is the days since the 1st in
 * the workspace's zone, today included (report-periods.ts), read against the same number of days before, as every period is.
 * `id` is what a request, the tab's storage and the control's choice call the period.
 */
export const REPORT_RANGES = [
  { days: 7, id: "7d", label: "7 days" },
  { days: 30, id: "30d", label: "30 days" },
  { days: 90, id: "90d", label: "90 days" },
  { days: null, id: "month", label: "Month" },
] as const;
```

and change `const noun = `${days} days`;` to `const noun = plural(days, "day");`, importing it: `import { capitalize, plural } from "../shared/words";`. Month on the 1st is one day, and four more places count the days in words, so each says "1 day" through the same `plural` (`shared/words.ts`):

- `report-tiles.ts`, `messagesTile`: `of ${days} days` becomes `of ${plural(days, "day")}`, and the file imports `plural` from `"../shared/words"`.
- `campaign-report.ts`: `const noun = `${days} days`;` becomes `const noun = plural(days, "day");`, and the file imports `plural` from `"../shared/words"`.
- `google/google.ts`: `const noun = `${periodDays} days`;` becomes `const noun = plural(periodDays, "day");` (it imports `plural` already).
- `reach-out-report.ts`, `linesOf`: `written in these ${dto.days} days.` becomes `written in these ${plural(dto.days, "day")}.` and `in the last ${dto.days} days.` becomes `in the last ${plural(dto.days, "day")}.` (it imports `plural` already).

Create `packages/contracts/src/reports/report-periods.ts`:

```ts
/**
 * The periods Reports offers and how a request names one (the table is REPORT_RANGES, reports.ts: said once). Three are a
 * count of days; Month is the days since the 1st in the workspace's own zone, today included, so on the 5th it is 5 days,
 * against the 5 before. A request names `period`; `days`, which every page sent before there was a Month, is read for a
 * release longer so a tab opened before the deploy still reads (either deploy order works), and the day it ends is held by
 * tests/reports/periods/report-periods.test.mjs.
 */
import { REPORT_RANGES } from "./reports";

/** What a period is called in a request, the tab's storage and the control. */
export type ReportPeriodId = (typeof REPORT_RANGES)[number]["id"];

/** The period a report is read over when none is named. */
export const REPORT_PERIOD_DEFAULT: ReportPeriodId = "30d";

/** The most days the report reads: the SQL clamps its `p_days` there. */
const MOST_DAYS = Math.max(...REPORT_RANGES.map((r) => r.days ?? 0));

export const isReportPeriod = (value: unknown): value is ReportPeriodId => REPORT_RANGES.some((r) => r.id === value);

/** The days of a period that is a count of days; null for Month. */
export const fixedDaysOf = (period: ReportPeriodId): number | null =>
  REPORT_RANGES.find((r) => r.id === period)?.days ?? null;

/** Month to date at a business day ("2026-10-05" is 5): the day of the month, today included. */
export const monthDaysAt = (dayKey: string): number => Number(dayKey.slice(8, 10));

/**
 * The period a request names: `period`, else (until its day) the `days` a page sent before there was a Month, else the
 * default. Null when what it names is none of ours.
 */
export function reportPeriodOf(asked: { period?: string | undefined; days?: string | undefined }): ReportPeriodId | null {
  if (asked.period !== undefined) return isReportPeriod(asked.period) ? asked.period : null;
  if (asked.days !== undefined)
    return REPORT_RANGES.find((r) => r.days !== null && r.days === Number(asked.days))?.id ?? null;
  return REPORT_PERIOD_DEFAULT;
}

/** The days a page said it shows (Ask's view of Reports): a whole count the report can read, else null. */
export function reportDaysAsked(view: string | null | undefined): number | null {
  const asked = Number(view);
  return Number.isInteger(asked) && asked >= 1 && asked <= MOST_DAYS ? asked : null;
}
```

In `packages/contracts/src/reports/index.ts`, add after the `report-tiles` exports:

```ts
export {
  REPORT_PERIOD_DEFAULT,
  isReportPeriod,
  fixedDaysOf,
  monthDaysAt,
  reportPeriodOf,
  reportDaysAsked,
} from "./report-periods";
export type { ReportPeriodId } from "./report-periods";
```

- [ ] **Step 4: Build and run**

```bash
corepack pnpm exec prettier --write packages/contracts/src/reports tooling/scripts/tests/reports/periods/report-periods.test.mjs tooling/scripts/tests/reports/reports-vm.test.mjs
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter "./packages/*" build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/periods/report-periods.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-vm.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/contracts-import-cycles.test.mjs
corepack pnpm -r typecheck
```
Expected: all PASS. (Typecheck passes: the three routes and the surface still compare `r.days === days` with a `number`, which a `7 | 30 | 90 | null` accepts.)

- [ ] **Step 5: Commit**

```bash
for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done
git add packages/contracts/src/reports packages/contracts/src/browser.generated.ts packages/*/dist tooling/scripts/tests/reports/periods/report-periods.test.mjs tooling/scripts/tests/reports/reports-vm.test.mjs
git commit -m "Reports' one table of periods gains Month, the days since the 1st in the workspace's zone, and a request names a period, with the old days read until 19 October." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 5: The three report routes take one period

**Why:** One query, one place that says what it means. `period=7d|30d|90d|month` on `GET reports`, `GET reports/campaigns` and `GET reports/reach-outs`, with `days=` read until 19 October (Task 4's test). Month's days are read in the workspace's zone and only when Month is asked (the zone is the membership's own, `readerContext` seeds it, so no read is added). The Campaigns home and the head's prefetch move to `period=30d` in the same task, so a client and a server from either side of the deploy still agree.

**Files:**
- Create: `apps/dashboard/src/server/readers/report.ts`, `tooling/scripts/tests/reports/periods/report-routes.test.mjs`
- Modify: `apps/dashboard/app/api/v1/reports/route.ts`, `apps/dashboard/app/api/v1/reports/campaigns/route.ts`, `apps/dashboard/app/api/v1/reports/reach-outs/route.ts`, `apps/dashboard/src/server/ask/context/pages.ts`, `apps/dashboard/src/surfaces/campaigns/broadcasts/surface.ts`, `packages/contracts/src/shell/chrome.ts`
- Modify (tests): `tooling/scripts/tests/reports/campaign-report.test.mjs`, `tooling/scripts/tests/ask/ask-routes.test.mjs`, `tooling/scripts/tests/ask/ask-context.test.mjs`
- Regenerate: `docs/api.md`, `packages/contracts/dist`

- [ ] **Step 1: Write the failing tests**

Create `tooling/scripts/tests/reports/periods/report-routes.test.mjs`:

```js
/**
 * The one query the three report routes take (readers/report.ts): `period` names the window, `days` is read until
 * its day (report-periods.test.mjs holds it), and Month is the days since the 1st in the workspace's own zone, read from the
 * membership's facts and only when Month is asked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const { readerContext } = await importSrc("apps/dashboard/src/server/readers/index.ts");
const { reportDaysFor } = await importSrc("apps/dashboard/src/server/readers/report.ts");

const W = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** A reader context for a workspace in `timezone` at `iso`; its supabase is never touched (the facts are seeded). */
const at = (iso, timezone) =>
  readerContext(
    { userId: "u1", supabase: null },
    { tenantId: W, role: "viewer", facts: { name: "Harbor Studio", timezone } },
    new Date(iso),
  );

test("a request's period is its days: the three presets as they are, Month in the workspace's zone", async () => {
  const la = at("2026-10-01T02:30:00Z", "America/Los_Angeles");
  assert.deepEqual(
    await Promise.all(["7d", "30d", "90d"].map((period) => reportDaysFor(la, { period }))),
    [7, 30, 90],
  );
  assert.equal(await reportDaysFor(la, { period: "month" }), 30, "still 30 September in Los Angeles");
  assert.equal(
    await reportDaysFor(at("2026-10-01T02:30:00Z", "Pacific/Auckland"), { period: "month" }),
    1,
    "the 1st already in Auckland: one day",
  );
  assert.equal(await reportDaysFor(at("2026-10-05T12:00:00Z", "America/New_York"), { period: "month" }), 5);
});

test("`days`, which open tabs still send, means what it meant; none named is thirty days; a period that is none of ours is refused in words", async () => {
  const rc = at("2026-10-05T12:00:00Z", "America/New_York");
  assert.equal(await reportDaysFor(rc, { days: "90" }), 90);
  assert.equal(await reportDaysFor(rc, {}), 30);
  for (const bad of [{ days: "45" }, { period: "14d" }, { period: "" }])
    await assert.rejects(
      reportDaysFor(rc, bad),
      (e) => e.status === 400 && e.message === "period must be 7d, 30d, 90d or month.",
      JSON.stringify(bad),
    );
});
```

In `tooling/scripts/tests/reports/campaign-report.test.mjs`, in the first test that runs the route (`const week = await route.GET.run(`), replace the `days=45` refusal's message check:

```js
    (e) => e.status === 400 && e.message === "period must be 7d, 30d, 90d or month.",
    "the same periods as the receptionist's report",
```

and, right after that `await assert.rejects(...)` call, add:

```js
  assert.deepEqual(
    await route.GET.run(new Request(`http://localhost/api/v1/reports/campaigns?period=90d&workspace=${W}`), ctx()),
    { report: { days: 90 } },
    "one period parameter: `period` names the window",
  );
  await assert.rejects(
    route.GET.run(new Request(`http://localhost/api/v1/reports/campaigns?period=14d&workspace=${W}`), ctx()),
    (e) => e.status === 400,
  );
```

In `tooling/scripts/tests/ask/ask-routes.test.mjs`, in `the reports: the three presets and no other...`, replace both `"days must be 7, 30 or 90.",` with `"period must be 7d, 30d, 90d or month.",`.

In `tooling/scripts/tests/ask/ask-context.test.mjs`, in `Reports: the period the page shows, its tiles and lines...`, after `assert.match(textOf(b.blocks[0]), /^Reports, 7 days · /);` add:

```js
  // A page on Month shows however many days the month has run: described over those, not over thirty.
  clearContextCache();
  const month = await buildContext(
    rcIn(ctxFor(tables(), { ...RPCS, report_series: series })),
    page("reports", [], { view: "5" }),
  );
  assert.match(textOf(month.blocks[0]), /^Reports, 5 days · /);
```

- [ ] **Step 2: Run them to verify they fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/periods/report-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/campaign-report.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-context.test.mjs
```
Expected: `report-routes` FAILS (the module is not there); the others FAIL on the new message, on `period=90d` (the route does not know `period`) and on `Reports, 5 days` (it says 30).

- [ ] **Step 3: The shared query**

Create `apps/dashboard/src/server/readers/report.ts`:

```ts
import "server-only";
import { z } from "zod";
import { AppError, fixedDaysOf, monthDaysAt, reportPeriodOf, zoneDayKey } from "@chanlytics/contracts";
import { load, type ReaderContext } from "./index";
import * as facts from "./facts";

/**
 * The one query the three report routes take (GET reports, reports/campaigns and reports/reach-outs): the window they
 * read, said once, so the three never disagree about it.
 */
export const ReportQuery = z.object({
  /** `7d`, `30d`, `90d` or `month`; thirty days when none is named. */
  period: z.string().optional(),
  /** What the pages sent before `period` existed: read until 19 October 2026 (contracts report-periods.ts, and the day is held by tests/reports/periods/report-periods.test.mjs). */
  days: z.string().optional(),
});

/**
 * The days a request's period is. Month is the days since the 1st in the workspace's own zone, today included (the zone is
 * the membership's, which `readerContext` seeds: nothing is read for it, and nothing at all for a period of fixed days).
 * A period that is none of ours is the request's refusal.
 */
export async function reportDaysFor(rc: ReaderContext, input: z.infer<typeof ReportQuery>): Promise<number> {
  const period = reportPeriodOf(input);
  if (period === null) throw new AppError("validation", "period must be 7d, 30d, 90d or month.");
  const fixed = fixedDaysOf(period);
  if (fixed !== null) return fixed;
  const zone = (await load(rc, facts.facts, undefined)).data.timezone;
  return monthDaysAt(zoneDayKey(rc.now.getTime(), zone));
}
```

- [ ] **Step 4: The three routes**

Replace `apps/dashboard/app/api/v1/reports/route.ts` with:

```ts
import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { ReportQuery, report, reportDaysFor } from "@/server/readers/report";

/**
 * GET /api/v1/reports?period=7d|30d|90d|month — the receptionist's numbers, day by day.
 *
 * One SECURITY INVOKER function computes the series in the tenant's own time zone under the caller's RLS. The payload spans
 * two periods so the client can show deltas without a second round trip. Only the four periods are accepted: a report that
 * anyone can point at a different window than the one beside it stops agreeing with itself (readers/report.ts says
 * what each means, and the `days` the pages sent before). Counted with the other aggregate reads. The body is its reader's
 * (readers/report.ts), which Ask reads too.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReportQuery,
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    return (await load(rc, report, { days: await reportDaysFor(rc, input) })).data;
  },
});
```

Replace `apps/dashboard/app/api/v1/reports/campaigns/route.ts` with:

```ts
import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { campaignReport } from "@/server/readers/campaign-report";
import { ReportQuery, reportDaysFor } from "@/server/readers/report";

/**
 * GET /api/v1/reports/campaigns?period=7d|30d|90d|month — what the offers earned.
 *
 * The twin of /api/v1/reports: one SECURITY INVOKER function computes the series in the tenant's own time zone under the
 * caller's RLS, over two periods so the page can show a change, plus the current period by playbook or broadcast. The same
 * four periods, for the same reason. The body is its reader's (readers/campaign-report.ts).
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReportQuery,
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    return (await load(rc, campaignReport, { days: await reportDaysFor(rc, input) })).data;
  },
});
```

Replace `apps/dashboard/app/api/v1/reports/reach-outs/route.ts` with:

```ts
import { read, workspace } from "@/server/route";
import { readerContext } from "@/server/readers";
import { ReportQuery, reportDaysFor } from "@/server/readers/report";
import { reachOutReportOf } from "@/server/campaigns/reach-out-report";

/**
 * GET /api/v1/reports/reach-outs?period=7d|30d|90d|month — what the workspace's reach-outs wrote over Reports' period, and
 * what came of it (Reach out Part 6, H1, H3–H6): written, delivered, wrote back, interested, booked, said no and bounced,
 * each reach-out with its steps, replies by angle, sends by domain, and written by day. The twin of
 * /api/v1/reports/campaigns, over the same four periods. Any member.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReportQuery,
  handle: async ({ ctx, member, input }) =>
    reachOutReportOf(ctx, member.tenantId, await reportDaysFor(readerContext(ctx, member), input)),
});
```

In `apps/dashboard/src/server/ask/context/pages.ts`: in the import list at the top delete `REPORT_RANGES,` and add `reportDaysAsked,` after `nextRunLabel,`; and replace

```ts
  const asked = Number(ctx.view);
  const days = REPORT_RANGES.some((r) => r.days === asked) ? asked : 30;
```

with

```ts
  // The days the page shows (Reports' view is a count): any whole count the report can read, so Month is described over the days it has run.
  const days = reportDaysAsked(ctx.view) ?? 30;
```

In `apps/dashboard/src/surfaces/campaigns/broadcasts/surface.ts`: replace the two lines

```ts
/** The period Campaigns' home reports over: one of the campaign report's three presets (the route refuses any other). */
const HOME_REPORT_DAYS = 30;
```

with

```ts
/** The period Campaigns' home reports over (the route's `period`): thirty days, which the document head starts too (contracts PREFETCH_READS). */
const HOME_REPORT_PERIOD = "30d";
```

and `read("GET reports/campaigns", { query: { days: String(HOME_REPORT_DAYS) } })` with `read("GET reports/campaigns", { query: { period: HOME_REPORT_PERIOD } })`.

In `packages/contracts/src/shell/chrome.ts`: in `PREFETCH_READS`, change `"reports/campaigns?days=30"` to `"reports/campaigns?period=30d"`, and the comment above it from `(broadcasts/surface.ts HOME_REPORT_DAYS)` to `(broadcasts/surface.ts HOME_REPORT_PERIOD)`.

- [ ] **Step 5: Regenerate and run**

```bash
corepack pnpm exec prettier --write apps/dashboard/app/api/v1/reports apps/dashboard/src/server/readers/report.ts apps/dashboard/src/server/ask/context/pages.ts apps/dashboard/src/surfaces/campaigns/broadcasts/surface.ts packages/contracts/src/shell/chrome.ts tooling/scripts/tests/reports tooling/scripts/tests/ask/ask-routes.test.mjs tooling/scripts/tests/ask/ask-context.test.mjs
corepack pnpm --filter "./packages/*" build
corepack pnpm gen:api-reference
node tooling/scripts/gen/route-types.mjs --check
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/periods/report-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/campaign-report.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-context.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/readers.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/back-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/route-prefetch.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/route-policy.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/api-reference.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/route-types.test.mjs
corepack pnpm -r typecheck
```
Expected: all PASS; `docs/api.md` now lists `period` and `days` under the three routes (`git diff docs/api.md` shows the two query rows), and `route-types.mjs --check` reports no change (no route was added).

- [ ] **Step 6: Commit**

```bash
for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done
git add apps/dashboard/app/api/v1/reports apps/dashboard/src/server/readers/report.ts apps/dashboard/src/server/ask/context/pages.ts apps/dashboard/src/surfaces/campaigns/broadcasts/surface.ts packages/contracts/src/shell/chrome.ts packages/*/dist docs/api.md tooling/scripts/tests/reports tooling/scripts/tests/ask/ask-routes.test.mjs tooling/scripts/tests/ask/ask-context.test.mjs
git commit -m "The three report routes take one period, Month included in the workspace's own zone, and the Campaigns home and the head's prefetch ask for it by that name." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The Reports surface and its page keep a period, not days

**Why:** The surface holds its views by period (`heldViews<ReportsSurface>(4)`, four periods now), reads the three routes with `period`, keeps the choice under a key of its own, and publishes `period` beside the resolved `days`, which Today and Ask still read. The page's four buttons come from `REPORT_RANGES`. Nothing else about the page moves in this task.

**Files:**
- Modify: `apps/dashboard/src/surfaces/reports/surface.ts` (whole file), `period.ts` (whole file), `sample.ts`, `reports-page.tsx` (whole file), `sections.tsx`
- Modify (tests): `tooling/scripts/tests/reports/reports-page.test.mjs`, `reports-sample.test.mjs`, `metrics-truth.test.mjs`, `campaign-report.test.mjs`, `tooling/scripts/tests/shell/empty-failed.test.mjs`, `tooling/scripts/tests/today/today-leaks.test.mjs`

- [ ] **Step 1: Move the tests to the new API (they fail until Step 2)**

`tooling/scripts/tests/reports/reports-page.test.mjs`:

1. In `surface()` replace `    facts: reportFacts(vm, cm),\n    days: 7,\n    fetchedAt: 1,` with `    facts: reportFacts(vm, cm),\n    period: "7d",\n    days: 7,\n    fetchedAt: 1,`.
2. Replace the block from `const period = { asked: [], held: [], mode: "hold" };` through the end of `const refuse = async () => { ... };` (the fetch's stand-in, `land` and `refuse`) with:

```js
const period = { asked: [], held: [], mode: "hold" };
/** The days each period's answer says it covers (Month on this fixture's day: four). */
const DAYS_OF = { "7d": 7, "30d": 30, "90d": 90, month: 4 };
const answer = (id) =>
  json(200, {
    ok: true,
    data: {
      report: reportDto({ days: DAYS_OF[id] }),
      booking: { ...CALENDAR, days: DAYS_OF[id] },
      deals: null,
    },
  });
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.test");
  if (/\/reports\/(campaigns|reach-outs)$/.test(u.pathname))
    return json(500, { ok: false, error: { code: "internal", message: "not read here" } });
  if (!u.pathname.endsWith("/reports")) return json(404, { ok: false, error: { code: "not_found", message: "no" } });
  const id = u.searchParams.get("period");
  period.asked.push(id);
  if (period.mode === "refuse") return json(500, { ok: false, error: { code: "internal", message: "down" } });
  if (period.mode === "answer") return answer(id);
  return new Promise((res) => period.held.push({ id, res }));
};
/** A period asked for and held is answered (it lands) or refused (it fails), and the read behind it is over. */
const land = async () => {
  for (const h of period.held.splice(0)) h.res(answer(h.id));
  for (let i = 0; i < 12; i++) await settle();
};
const refuse = async () => {
  for (const h of period.held.splice(0)) h.res(json(500, { ok: false, error: { code: "internal", message: "down" } }));
  for (let i = 0; i < 12; i++) await settle();
};
```

3. In `a period with nothing in it...` replace `assert.deepEqual(period.asked, [90]);` with `assert.deepEqual(period.asked, ["90d"]);`; in `REGRESSION (C27)` replace `assert.deepEqual(period.asked, [30], "REGRESSION: a second load began");` with `assert.deepEqual(period.asked, ["30d"], "REGRESSION: a second load began");`.
4. After the C27 test add:

```js
test("Month is a period of its own: its tab, its read by that name, and the page says the days it holds", async () => {
  await inPeriodTest("hold", async () => {
    let tree = page();
    assert.deepEqual(
      all(cls(tree, "rpt-range"), (n) => n.type === "button").map(textOf),
      ["7 days", "30 days", "90 days", "Month"],
    );
    press(tabOf(tree, "Month"));
    assert.deepEqual(period.asked, ["month"]);
    await land();
    redraw();
    tree = redraw();
    assert.equal(tabOf(tree, "Month").props["aria-pressed"], true);
    assert.equal(cls(tree, "rpt-failed"), null, "nothing failed");
  });
});
```

`tooling/scripts/tests/reports/reports-sample.test.mjs`: replace its calls by period: `reportsSample(30, TODAY)` → `reportsSample("30d", TODAY)` (three places in the first test), `reportsSample(7, TODAY)` → `reportsSample("7d", TODAY)`, `reportsSample(90, TODAY)` → `reportsSample("90d", TODAY)`, `reportsSample(14, TODAY).days, 30` → `reportsSample("14d", TODAY).days, 30` (keep the message), and in the other two tests `for (const days of [7, 30, 90])` → `for (const id of ["7d", "30d", "90d"])` with `const days = fixedDaysOf(id);` as the first line of the loop body and `reportsSample(id, TODAY)` for the call (import `fixedDaysOf` from `@chanlytics/contracts` at the top). Add:

```js
test("Month is the days since the 1st: eighteen on the 18th, said as a period of its own", () => {
  const month = reportsSample("month", TODAY);
  assert.deepEqual([month.period, month.days, month.vm.answered.points.length], ["month", 18, 18]);
  assert.equal(reportsSample("90d", TODAY).period, "90d");
});
```

`tooling/scripts/tests/reports/metrics-truth.test.mjs`: replace the two assertions on `verbs` with

```js
  assert.ok(verbs.includes("export async function setReportRange(period: ReportPeriodId): Promise<boolean>"));
  assert.ok(verbs.includes("keepReportPeriod(prev);"), "the preferred period goes back on failure");
```

`tooling/scripts/tests/reports/campaign-report.test.mjs`: replace `'read("GET reports/campaigns", { query: { days: String(days) } })'` with `'read("GET reports/campaigns", { query: { period } })'`.

`tooling/scripts/tests/today/today-leaks.test.mjs`: replace `reportsSample(7, "2026-09-18")` with `reportsSample("7d", "2026-09-18")`.

`tooling/scripts/tests/shell/empty-failed.test.mjs`, in `a period the page has read paints at once when picked again...`: replace the body between `const parked = [];` and the `try {` line, and the `try` block, with the period's names:

```js
  const parked = [];
  const asked = [];
  globalThis.window.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    asked.push(`${u.pathname.replace("/api/v1/", "")} ${u.searchParams.get("period")}`);
    await new Promise((r) => parked.push({ period: u.searchParams.get("period"), r }));
    if (u.pathname.endsWith("/reports/campaigns")) return json(200, { ok: true, data: { report: campaignsDto() } });
    return json(200, {
      ok: true,
      data: { report: reportDto(), booking: { calendar: "none", days: 7, asked: 0, booked: 0 } },
    });
  };
  const keepDoc = globalThis.document;
  globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
  const pause = () => new Promise((r) => setTimeout(r, 5));
  // Let parked answers go -- only those for `id` when named -- so a test can say which lands first.
  const release = async (id = null) => {
    for (let i = 0; i < 40; i += 1) {
      for (const p of [...parked])
        if (id === null || p.period === id) {
          parked.splice(parked.indexOf(p), 1);
          p.r();
        }
      await pause();
    }
  };
  const shown = () => globalThis.window.__REPORTS?.period;
  // A runner to refresh through (setReportRange reads the real surface through it); this one joins no live feed.
  const stop = startSurfaces([{ ...reportsOverride, refreshOnMessageInserts: false }]);
  try {
    await release();
    assert.equal(shown(), "30d", "the saved period, read at boot");
    const to7 = setReportRange("7d");
    await release();
    assert.equal(await to7, true);
    assert.equal(shown(), "7d");
    // Back to 30: held, painted before any read lands, and read again behind.
    asked.length = 0;
    let back = null;
    setReportRange("30d").then((ok) => {
      back = ok;
    });
    await pause();
    assert.equal(shown(), "30d", "REGRESSION: the period the page had shown waited on a read of its own");
    assert.equal(back, true, "the pick answered at once");
    assert.ok(asked.includes("reports 30d"), "and 30 days is read again behind");
    // A pick while that read is out: 90 lands first, then 30's refresh -- a late answer for a period left, which must
    // never land on the new one.
    const to90 = setReportRange("90d");
    await release("90d");
    await to90;
    assert.equal(shown(), "90d");
    await release("30d");
    assert.equal(shown(), "90d", "REGRESSION: 30's refresh landed last and put the old period back over 90");
  } finally {
```

(the `finally { stop(); await release(); globalThis.document = keepDoc; }` that follows stays as it is.)

- [ ] **Step 2: Run them to verify they fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-sample.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/metrics-truth.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/empty-failed.test.mjs
```
Expected: FAIL (the surface still reads `days`, `setReportRange` takes a number, `reportsSample` a count).

- [ ] **Step 3: The surface**

Replace `apps/dashboard/src/surfaces/reports/surface.ts` with:

```ts
/**
 * The Reports override: the period the page shows (kept in this browser) and the report over it. Part of the SurfaceData
 * seam (legacy-bridge/surface-data.ts); the page reads what it publishes through `useSurface("reports")`. The lens on screen
 * is the address's, not this surface's: every lens draws from this one read, so a move between lenses asks for nothing.
 */

import { read } from "@/legacy-bridge/api";
import { heldViews } from "@/legacy-bridge/held-views";
import {
  REPORT_PERIOD_DEFAULT,
  isReportPeriod,
  reportFacts,
  toBookingReportVM,
  toCampaignReportVM,
  toDealReportVM,
  toReachOutReportVM,
  toReportVM,
  type BookingReportVM,
  type CampaignReportVM,
  type DealReportVM,
  type ReachOutReportVM,
  type ReportFactVM,
  type ReportPeriodId,
  type ReportVM,
} from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { DEFAULT_REFRESH_TABLES } from "@/legacy-bridge/surface-realtime";
import { onlyOnItsPage } from "@/legacy-bridge/surface-registry";
import { declareSurfaceValue, setSurfaceValue } from "../surface-values";

// Today and Ask, which have not moved, still read this under its old name.
declareSurfaceValue("reports", "__REPORTS");

/* ------------------------------- Reports --------------------------------- */

const REPORT_PERIOD_KEY = "chanlytics.report.period";
let reportPeriod: ReportPeriodId = REPORT_PERIOD_DEFAULT;
try {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(REPORT_PERIOD_KEY);
    if (isReportPeriod(saved)) reportPeriod = saved;
  }
} catch {
  /* storage unavailable: the default period stands */
}

/** The one period every chart on Reports is scoped to, kept in this browser. */
export function keepReportPeriod(period: ReportPeriodId): void {
  if (!isReportPeriod(period)) return;
  reportPeriod = period;
  try {
    window.localStorage.setItem(REPORT_PERIOD_KEY, period);
  } catch {
    /* a preference, not a fact */
  }
}

export interface ReportsSurface {
  vm: ReportVM;
  /** What the broadcasts and playbooks sent over the same period; null when that read failed and the receptionist's own numbers still stand (D9). */
  campaigns: CampaignReportVM | null;
  /** Asked, then booked: the one conversion line, from the calendar. */
  booking: BookingReportVM;
  /** Deals: one cohort and the stock; present only where a deal was ever recorded (0004). */
  deals: DealReportVM;
  /**
   * What the reach-outs wrote and what came back over the same period (Reach out Part 6, H3); null when that read failed,
   * absent where nothing reads it (the demo): the section then draws nothing of its own.
   */
  reachOuts?: ReachOutReportVM | null;
  /** Worth knowing: at most three facts from these same numbers (contracts' reportFacts). */
  facts: ReportFactVM[];
  /** The period this is of: what the control says is chosen, and what the views are held by. */
  period: ReportPeriodId;
  /** The days the period is (Month: the days since the 1st): what Today and Ask read. */
  days: number;
  fetchedAt: number;
}

/**
 * Reports — the receptionist's own numbers over a period.
 *
 * The mockup drew revenue, bookings and eight agents. This publishes the
 * report view model built from one SQL function that already applies the
 * Today metrics' rules (tenant time zone, no undated imports, answered-by =
 * first reply). Realtime message inserts re-apply so today's column moves.
 */
/** The periods this tab has read (held views): going back to one paints at once, and the read behind it keeps it current. */
const reportsHeld = heldViews<ReportsSurface>(4);
/** Paint a period this tab holds for the period now asked for; whether it did. The read behind it is the caller's. */
export function paintHeldReports(): boolean {
  const have = reportsHeld.get(reportPeriod);
  if (!have) return false;
  setSurfaceValue("reports", have);
  window.dispatchEvent(new CustomEvent("surface:reports"));
  return true;
}

export const reportsOverride: SurfaceOverride = {
  key: "reports",
  value: "reports",
  events: ["surface:reports"],
  refreshOnMessageInserts: true,
  // A message moves the period's numbers: read again only while its page is on screen, and once when it comes back
  // (surface-registry.ts).
  refreshWhen: onlyOnItsPage("reports", DEFAULT_REFRESH_TABLES),
  debounceMs: 800,
  // A period's reads take their turn; a pick of another period is read at once (activateOverride).
  view: () => reportPeriod,
  apply: async () => {
    const period = reportPeriod;
    const [data, campaigns, reachOuts] = await Promise.all([
      read("GET reports", { query: { period } }),
      // The offers' numbers are their own read. A failure there used to fail
      // the whole surface -- the page went blank, and its own "could not be
      // read" line could never render (the audit's D9). Null is its state.
      read("GET reports/campaigns", { query: { period } }).catch((e: unknown) => e as Error),
      // The reach-outs' are too (Part 6): their section says it could not read them, and the rest stands.
      read("GET reports/reach-outs", { query: { period } }).catch((e: unknown) => e as Error),
    ]);
    if (campaigns instanceof Error) console.error("reports_campaigns_fetch_failed", campaigns.message);
    if (reachOuts instanceof Error) console.error("reports_reach_outs_fetch_failed", reachOuts.message);
    // A pick of another period while this read was out: its answer is for a period left, and never lands on the new
    // one. A held period answers a pick at once and is read again behind it, so two reads can be out together.
    if (period !== reportPeriod) return;
    const vm = toReportVM(data.report, { profile: data.profile });
    const surface: Omit<ReportsSurface, "facts"> = {
      vm,
      campaigns: campaigns instanceof Error ? null : toCampaignReportVM(campaigns.report),
      booking: toBookingReportVM(data.booking),
      // The period's name is the report's, so the two sentences never disagree about the range.
      deals: toDealReportVM(data.deals, vm.rangeLabel),
      reachOuts: reachOuts instanceof Error ? null : toReachOutReportVM(reachOuts.report),
      period,
      days: vm.days,
      fetchedAt: Date.now(),
    };
    // Worth knowing is derived here, once, from the same two view models the page draws: never in the page.
    const whole: ReportsSurface = { ...surface, facts: reportFacts(surface.vm, surface.campaigns) };
    reportsHeld.hold(period, whole);
    setSurfaceValue("reports", whole);
  },
};
```

Replace `apps/dashboard/src/surfaces/reports/period.ts` with:

```ts
/**
 * The period Reports shows, changed (moved from legacy-bridge/inbox-verbs.ts, decision 0015): the choice is kept in
 * this browser, and the read goes through the runner, so the cache, the status and the pill agree with what is on screen.
 */
import type { ReportPeriodId } from "@chanlytics/contracts";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import { surfaceValue } from "../surface-values";
import { keepReportPeriod, paintHeldReports, reportsOverride } from "./surface";

/** Whether the period was changed: `false` when its read failed, and the page still shows the one it had. */
export async function setReportRange(period: ReportPeriodId): Promise<boolean> {
  const prev = surfaceValue("reports")?.period ?? period;
  keepReportPeriod(period);
  // A period this tab has read paints at once; the read behind it keeps it current (the loading standard's held
  // views). Only a period never read waits for its read.
  if (paintHeldReports()) {
    void refreshSurfaces([reportsOverride]);
    return true;
  }
  await refreshSurfaces([reportsOverride]);
  // The override writes the period it fetched. Anything else means the fetch failed and the page is still showing the
  // old period, so the preferred period goes back too, or the next background refresh would load the new one silently.
  if (surfaceValue("reports")?.period !== period) {
    keepReportPeriod(prev);
    return false;
  }
  return true;
}
```

In `apps/dashboard/src/surfaces/reports/sample.ts`: extend the contracts import with `REPORT_PERIOD_DEFAULT, fixedDaysOf, isReportPeriod, monthDaysAt, type ReportPeriodId,`; replace the doc comment and the head of `reportsSample` through `const key = ...` with

```ts
/** The demo's report for a period (anything that is none of ours is the default) as of `today`, a YYYY-MM-DD key in the business's zone. */
export function reportsSample(period: ReportPeriodId, today: string = todayIn(ZONE)): ReportsSurface {
  const id = isReportPeriod(period) ? period : REPORT_PERIOD_DEFAULT;
  const n = fixedDaysOf(id) ?? monthDaysAt(today);
  const key = `${id}:${today}`;
```

and in the surface it builds, replace `    days: n,\n    fetchedAt: 0,` with `    period: id,\n    days: n,\n    fetchedAt: 0,`.

In `apps/dashboard/src/surfaces/reports/sections.tsx`: extend the contracts type import to `import type { CampaignReportVM, DealReportVM, ReportPeriodId, ReportVM } from "@chanlytics/contracts";` and make four exact replacements:
- `function nothingCameIn(vm: ReportVM, days: number, pick: (days: number) => Promise<void>) {` → `function nothingCameIn(vm: ReportVM, period: ReportPeriodId, pick: (period: ReportPeriodId) => Promise<void>) {`
- `action={days !== 90 ? { label: "Look at 90 days", onClick: () => void pick(90) } : null}` → `action={period !== "90d" ? { label: "Look at 90 days", onClick: () => void pick("90d") } : null}`
- `export function ReportsSections({ R, pick }: { R: ReportsSurface; pick: (days: number) => Promise<void> }) {` → `export function ReportsSections({ R, pick }: { R: ReportsSurface; pick: (period: ReportPeriodId) => Promise<void> }) {`
- `{nothingCameIn(vm, days, pick)}` → `{nothingCameIn(vm, R.period, pick)}`; and in the comment above `ReportsSections` change `pick(days)` to `pick(period)`.

Replace `apps/dashboard/src/surfaces/reports/reports-page.tsx` with:

```tsx
/**
 * Chanlytics, Reports: the page shell (moved from legacy/pages/reports.jsx, decision 0015). One row above everything
 * (the period, its days and the Ask door), then the sections (sections.tsx), then the reach-outs and Google's reviews.
 * A real workspace draws the bridge's own numbers (`useSurface("reports")`); a demo session draws the same page from the
 * contracts sample (sample.ts); without either, the page says what Reports reads.
 */
import { useEffect, useState } from "react";
import { REPORT_PERIOD_DEFAULT, REPORT_RANGES, type ReportPeriodId } from "@chanlytics/contracts";
import { askAbout, demoSession } from "../legacy-verbs";
import { EmptyState } from "../kit/empty/empty";
import { Icon } from "../kit/icon/icon";
import { useSurface } from "../use-surface";
import { GoogleSection } from "./google";
import { setReportRange } from "./period";
import { RptReachOuts } from "./reach-outs";
import { reportsSample } from "./sample";
import { ReportsSections } from "./sections";
import type { ReportsSurface } from "./surface";

/** Reports read nothing: a session with no workspace, and no demo to draw. */
function readsAWorkspace() {
  return (
    <div className="rpt" data-testid="reports-none">
      <div className="rpt-inner">
        <EmptyState
          kind="page"
          glyph="wave"
          title="Reports reads a workspace's own numbers"
          body="Open a workspace to see what its receptionist answered, who reached it, and what its campaigns sent."
        />
      </div>
    </div>
  );
}

/** One row above everything: the period, the days it covers, and a door to ask about them. */
function periodRow(p: {
  R: ReportsSurface;
  busy: boolean;
  failed: ReportPeriodId | null;
  pick: (period: ReportPeriodId) => Promise<void>;
}) {
  const { R, busy, failed, pick } = p;
  const vm = R.vm;
  return (
    <div className="rpt-head">
      <div className="rpt-range" role="group" aria-label="Period">
        {REPORT_RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            className={R.period === r.id ? "on" : ""}
            aria-pressed={R.period === r.id}
            aria-disabled={busy}
            onClick={() => void pick(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <span className="rpt-dates" title={`Days follow ${vm.timezone}`}>
        {vm.since} to {vm.until}
      </span>
      {failed && (
        <span className="rpt-failed" role="status" aria-live="polite">
          Couldn't load {REPORT_RANGES.find((r) => r.id === failed)?.label}. Still showing {vm.rangeLabel}.
        </span>
      )}
      <button
        type="button"
        className="rpt-ask"
        aria-label="Ask about this period"
        onClick={() => askAbout({ prompt: `What stood out in my last ${vm.rangeLabel}?` })}
        data-testid="reports-ask"
      >
        <Icon name="sparkle" size={13} />
        <span className="rpt-ask-label">Ask about this period</span>
      </button>
    </div>
  );
}

export function ReportsPage() {
  const live = useSurface("reports");
  // A demo's own period: the sample answers at once, so the tabs switch it here.
  const [samplePeriod, setSamplePeriod] = useState<ReportPeriodId>(REPORT_PERIOD_DEFAULT);
  const [busy, setBusy] = useState(false);
  // The period that failed to load, if any: the page keeps the old one and says so, instead of dimming forever and
  // switching later on its own.
  const [failed, setFailed] = useState<ReportPeriodId | null>(null);
  const fetchedAt = live ? live.fetchedAt : 0;
  useEffect(() => {
    setBusy(false);
  }, [fetchedAt]);
  const R = live || (demoSession() ? reportsSample(samplePeriod) : null);
  if (!R) return readsAWorkspace();
  const pick = async (period: ReportPeriodId) => {
    // One period at a time: while one loads the tabs hold, rather than start a second load over the first.
    if (busy || period === R.period) return;
    if (!live) {
      setSamplePeriod(period);
      return;
    }
    setBusy(true);
    setFailed(null);
    const ok = await setReportRange(period);
    if (!ok) {
      setBusy(false);
      setFailed(period);
    }
  };
  return (
    // A period on its way dims by the one rule every page uses (components.css [data-loading] [data-dims]).
    <div className="rpt" data-testid={live ? "reports-real" : "reports-sample"} data-loading={busy ? "" : undefined}>
      <div className="rpt-inner">
        {/* One row above everything: the period, the days it covers, and a door to ask about them. The top bar says
            Reports; the page does not title itself. */}
        {periodRow({ R, busy, failed, pick })}
        <div className="rpt-body" data-dims aria-busy={busy ? "true" : "false"}>
          <ReportsSections R={R} pick={pick} />
          {/* What the reach-outs wrote and what came back (Reach out Part 6, H3): a section of its own, after Campaigns. */}
          <RptReachOuts R={R} />
          <GoogleSection days={R.days} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/reports tooling/scripts/tests/reports tooling/scripts/tests/shell/empty-failed.test.mjs tooling/scripts/tests/today/today-leaks.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-sample.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/metrics-truth.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/campaign-report.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-seam.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/empty-failed.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/today/today-leaks.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/surface-seam.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/surface-boot.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/workspace-scoping.test.mjs
corepack pnpm -r typecheck
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/surfaces/reports tooling/scripts/tests/reports tooling/scripts/tests/shell/empty-failed.test.mjs tooling/scripts/tests/today/today-leaks.test.mjs
git commit -m "Reports keeps its period under a key and a read of its own, four periods held at once, and the page's tabs come from the one table." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The report SQL is called from `packages/db`

**Why:** `report_series` (`readers/report.ts`), `campaign_series` (`readers/campaign-report.ts`) and `reach_out_report` (`campaigns/reach-out-report.ts`) are called by name from the dashboard (three entries in `tables.json`). They move into `packages/db/src/repositories/reports.ts`, the one place those functions are typed. `metrics_summary` (Today's) stays for PR 2.

**Files:**
- Create: `packages/db/src/repositories/reports.ts`, `tooling/scripts/tests/reports/report-repository.test.mjs`
- Modify: `packages/db/src/index.ts`, `apps/dashboard/src/server/readers/report.ts`, `apps/dashboard/src/server/readers/campaign-report.ts`, `apps/dashboard/src/server/campaigns/reach-out-report.ts`, `tooling/scripts/tests/baselines/tables.json`
- Regenerate: `packages/*/dist`; `docs/debt.md` and `docs/takeover.md` (measured blocks)

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/reports/report-repository.test.mjs`:

```js
/**
 * The three report functions as packages/db calls them (repositories/reports.ts): by name, for the workspace and the days,
 * over whatever client the caller holds (the session's, so RLS decides what a member reads). A read that fails throws;
 * the reach-outs' say the database's refusal with its code, for the door to word.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignSeries, reachOutReport, reportSeries } from "@chanlytics/db";

const W = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** A database that answers a function by name and keeps what it was asked. */
const dbWith = (answers) => {
  const asked = [];
  return { asked, db: { rpc: async (name, args) => (asked.push([name, args]), answers[name]) } };
};

test("each function is asked for the workspace and the days, and answers what the database says", async () => {
  const { db, asked } = dbWith({
    report_series: { data: { days: 7 }, error: null },
    campaign_series: { data: { days: 30 }, error: null },
    reach_out_report: { data: { days: 90 }, error: null },
  });
  assert.deepEqual(await reportSeries(db, W, 7), { days: 7 });
  assert.deepEqual(await campaignSeries(db, W, 30), { days: 30 });
  assert.deepEqual(await reachOutReport(db, W, 90), { ok: true, data: { days: 90 } });
  assert.deepEqual(asked, [
    ["report_series", { p_tenant_id: W, p_days: 7 }],
    ["campaign_series", { p_tenant_id: W, p_days: 30 }],
    ["reach_out_report", { p_tenant_id: W, p_days: 90 }],
  ]);
});

test("a read that fails throws, never nothing; the reach-outs' refusal keeps the code the door words it by", async () => {
  const down = { data: null, error: { message: "connection refused", code: "08006" } };
  await assert.rejects(reportSeries(dbWith({ report_series: down }).db, W, 7), /report_series.*connection refused/);
  await assert.rejects(campaignSeries(dbWith({ campaign_series: down }).db, W, 7), /campaign_series.*connection refused/);
  const refused = { data: null, error: { message: "No workspace.", code: "P0002" } };
  assert.deepEqual(await reachOutReport(dbWith({ reach_out_report: refused }).db, W, 7), {
    ok: false,
    code: "P0002",
    message: "No workspace.",
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/report-repository.test.mjs`
Expected: FAIL, `reportSeries` is not exported by `@chanlytics/db`.

- [ ] **Step 3: The repository**

Create `packages/db/src/repositories/reports.ts`:

```ts
/**
 * The report functions Reports reads (00251, 00304, 00241): the receptionist's series, the campaigns' and the reach-outs',
 * each over a period of days and the period before it. The one place they are called by name; the dashboard asks on the
 * session client, so RLS decides what a member reads (`report_series` and `campaign_series` are SECURITY INVOKER;
 * `reach_out_report` is a definer that checks the member again). A read that fails throws: "we could not read" is never "none".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";

type Db = SupabaseClient<Database>;

/** The receptionist's numbers day by day for `days` and the same number before them (`report_series`, 00304). */
export async function reportSeries(db: Db, tenantId: string, days: number): Promise<Json> {
  const { data, error } = await db.rpc("report_series", { p_tenant_id: tenantId, p_days: days });
  if (error) throw new Error(`report_series: ${error.message}`);
  return data;
}

/** What the broadcasts and playbooks sent, day by day for `days` and the same number before, and the period by source (`campaign_series`, 00251). */
export async function campaignSeries(db: Db, tenantId: string, days: number): Promise<Json> {
  const { data, error } = await db.rpc("campaign_series", { p_tenant_id: tenantId, p_days: days });
  if (error) throw new Error(`campaign_series: ${error.message}`);
  return data;
}

/**
 * What the workspace's reach-outs wrote over `days`, and what came of it (`reach_out_report`, 00241). The function raises
 * contracts' own refusals with a code the door words (not found, not as it may be); they come back as they are, not thrown.
 */
export async function reachOutReport(
  db: Db,
  tenantId: string,
  days: number,
): Promise<{ ok: true; data: Json } | { ok: false; code: string; message: string }> {
  const { data, error } = await db.rpc("reach_out_report", { p_tenant_id: tenantId, p_days: days });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, data };
}
```

In `packages/db/src/index.ts`, after the `reach-out-sheet` export blocks, add:

```ts
export { reportSeries, campaignSeries, reachOutReport } from "./repositories/reports";
```

- [ ] **Step 4: The three readers call it**

`apps/dashboard/src/server/readers/report.ts`: add `import { reportSeries } from "@chanlytics/db";` after the contracts import and replace

```ts
    const { data, error } = await ctx.supabase.rpc("report_series", { p_tenant_id: tenantId, p_days: days });
    if (error) throw new Error(error.message);
    const report = data as unknown as ReportDto;
```

with

```ts
    const report = (await reportSeries(ctx.supabase, tenantId, days)) as unknown as ReportDto;
```

`apps/dashboard/src/server/readers/campaign-report.ts`: add `import { campaignSeries } from "@chanlytics/db";` and replace

```ts
    const { data, error } = await ctx.supabase.rpc("campaign_series", { p_tenant_id: tenantId, p_days: days });
    if (error) throw new Error(error.message);
    const report = data as unknown as CampaignReportDto;
```

with

```ts
    const report = (await campaignSeries(ctx.supabase, tenantId, days)) as unknown as CampaignReportDto;
```

`apps/dashboard/src/server/campaigns/reach-out-report.ts`: add `import { reachOutReport } from "@chanlytics/db";` and replace

```ts
  const { data, error } = await ctx.supabase.rpc("reach_out_report", { p_tenant_id: tenantId, p_days: days });
  if (error) throw reachOutRefusal(error);
  return { report: dtoOf<ReachOutReportDto>(data) };
```

with

```ts
  const answered = await reachOutReport(ctx.supabase, tenantId, days);
  if (!answered.ok) throw reachOutRefusal({ code: answered.code, message: answered.message });
  return { report: dtoOf<ReachOutReportDto>(answered.data) };
```

- [ ] **Step 5: Build, bank, run**

```bash
corepack pnpm exec prettier --write packages/db/src/repositories/reports.ts packages/db/src/index.ts apps/dashboard/src/server/readers apps/dashboard/src/server/campaigns/reach-out-report.ts tooling/scripts/tests/reports/report-repository.test.mjs
node -e "const fs=require('fs');const f='packages/db/src/database.types.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'))"
corepack pnpm --filter "./packages/*" build
git diff --stat -- packages/db/dist/index.d.ts
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/report-repository.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/campaign-report.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/readers.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/back-routes.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
git diff --stat -- tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
corepack pnpm -r typecheck
```
Expected: the new test and the route tests PASS; `git diff --stat packages/db/dist/index.d.ts` shows only the three added declarations (no `agrees?:` hunks); the bank removes exactly `apps/dashboard/src/server/campaigns/reach-out-report.ts::rpc`, `apps/dashboard/src/server/readers/campaign-report.ts::rpc` and `apps/dashboard/src/server/readers/report.ts::rpc` from `tables.json`, and `debt-register` rewrites the measured number of SQL functions called by name outside `packages/db` in `docs/debt.md` and `docs/takeover.md` (down by three).

- [ ] **Step 6: Commit**

```bash
for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done
git add packages/db/src/repositories/reports.ts packages/db/src/index.ts packages/*/dist apps/dashboard/src/server/readers apps/dashboard/src/server/campaigns/reach-out-report.ts tooling/scripts/tests/reports/report-repository.test.mjs tooling/scripts/tests/baselines/tables.json docs/debt.md docs/takeover.md
git commit -m "The three report functions are called from packages/db, the one place they are typed, and three SQL calls leave the dashboard." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 8: The lens registry, and every list of lenses read from it

**Why:** Six lenses, one table, in contracts: each row carries its id, its label (the strip's word), the palette's sub-line, when it is shown, the least role that may read it (`Role`, from `config/workspace-config/role-perms.ts`; `roleAtLeast` reads it) and its empty state's words. The route's `takes`, the strip, the palette's jumps and Ask's page routes are all derived from it; none spells a lens id. No row for a lens that is not drawn.

**Files:**
- Create: `packages/contracts/src/reports/lenses.ts`, `packages/contracts/src/reports/lens-answer.ts`, `tooling/scripts/tests/reports/report-lenses.test.mjs`
- Modify: `packages/contracts/src/reports/index.ts`, `packages/contracts/src/ask/ask-jump.ts`, `packages/contracts/src/ask/citations.ts`, `tooling/scripts/tests/ask/ask.test.mjs`
- Regenerate: `packages/contracts/src/browser.generated.ts`, `packages/*/dist`

- [ ] **Step 1: Write the failing tests**

Create `tooling/scripts/tests/reports/report-lenses.test.mjs`:

```js
/**
 * Reports' lenses as contracts hold them (reports/lenses.ts): six, in the strip's order, each at an address, shown by one
 * predicate, with its words; and every other list of them (the palette's jumps, Ask's page routes) read from the table, never
 * spelled again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASK_PAGES,
  ASK_PAGE_ROUTES,
  LENS_ROUTES,
  REPORT_LENSES,
  askJump,
  askPages,
  isLensParam,
  lensAnswerOf,
  lensEmpty,
  lensIsShown,
  lensOfRoute,
  lensRoute,
  lensesFor,
  toCampaignReportVM,
  toDealReportVM,
  toReportVM,
} from "@chanlytics/contracts";

const OWNER = { sellsBy: "booking", role: "owner" };

test("six lenses in the strip's order, each with its words, and none for a lens that is not drawn", () => {
  assert.deepEqual(
    REPORT_LENSES.map((l) => l.id),
    ["overview", "receptionist", "people", "pipeline", "campaigns", "reviews"],
  );
  for (const l of REPORT_LENSES) {
    assert.ok(l.label && l.sub, `${l.id}: the strip's word and the palette's sub-line`);
    assert.equal(l.role, "viewer", `${l.id}: any member reads it`);
    const empty = l.empty({ since: "Aug 29", until: "Sep 4" });
    assert.ok(empty.title && empty.body, `${l.id}: its empty state's words`);
  }
  assert.equal(
    lensEmpty("overview", { since: "Aug 29", until: "Sep 4" }).body,
    "Nobody wrote or called between Aug 29 and Sep 4.",
    "the words the page said, unchanged",
  );
});

test("a lens is an address: the Overview is /reports, every other /reports/<lens>, and nothing else is one", () => {
  assert.deepEqual(
    REPORT_LENSES.map((l) => lensRoute(l.id)),
    ["reports", "reports/receptionist", "reports/people", "reports/pipeline", "reports/campaigns", "reports/reviews"],
  );
  assert.deepEqual(LENS_ROUTES, REPORT_LENSES.map((l) => lensRoute(l.id)));
  assert.equal(lensOfRoute("reports"), "overview");
  assert.equal(lensOfRoute("reports/campaigns"), "campaigns");
  for (const no of ["reports/overview", "reports/usage", "reports/leads", "reports/anything", "reports/", "clients/people", "today"])
    assert.equal(lensOfRoute(no), null, no);
  assert.ok(isLensParam("pipeline") && !isLensParam("overview") && !isLensParam("usage"));
});

test("Pipeline is shown where deals are on and nowhere else; the other five are shown to every member", () => {
  const ids = (who) => lensesFor(who).map((l) => l.id);
  assert.deepEqual(ids(OWNER), ["overview", "receptionist", "people", "campaigns", "reviews"]);
  assert.deepEqual(ids({ sellsBy: "proposal", role: "operator" }), REPORT_LENSES.map((l) => l.id));
  assert.deepEqual(ids({ sellsBy: null, role: "viewer" }), ["overview", "receptionist", "people", "campaigns", "reviews"]);
  assert.ok(lensIsShown("pipeline", { sellsBy: "proposal", role: "viewer" }));
  assert.ok(!lensIsShown("pipeline", OWNER));
  assert.deepEqual(ids({ sellsBy: "proposal", role: undefined }), REPORT_LENSES.map((l) => l.id), "a role not yet known reads as a viewer");
  assert.deepEqual(ids({ sellsBy: "proposal", role: "stranger" }), [], "a role the ladder does not know stands on no rung");
});

test("the palette and Ask's page routes are the registry's: no lens spelled twice", () => {
  for (const route of LENS_ROUTES) assert.ok(ASK_PAGE_ROUTES.includes(route), `${route} is a page an answer may name`);
  const labels = (has) => askPages({ platformAdmin: false, ...has }).map((e) => e.label);
  const off = labels({ dealsOn: false });
  assert.deepEqual(
    off.filter((l) => l.startsWith("Reports")),
    ["Reports", "Reports › Receptionist", "Reports › People", "Reports › Campaigns", "Reports › Reviews"],
  );
  assert.ok(labels({ dealsOn: true }).includes("Reports › Pipeline"));
  assert.ok(!off.includes("Reports › Pipeline"), "where deals are off the lens has no jump");
  assert.equal(askJump("receptionist", ASK_PAGES)[0]?.to, "reports/receptionist", "a word of the lens finds it");
  assert.equal(askJump("reports", ASK_PAGES)[0]?.to, "reports", "and Reports itself stays first");
});

test("the head says the lens's own sentence, from the view models that hold it", () => {
  const day = (d, over = {}) => ({
    day: d, messages_in: 0, conversations: 0, answered_ai: 0, answered_you: 0, unanswered: 0,
    out_ai: 0, out_you: 0, escalations: 0, calls: 0, call_seconds: 0, new_contacts: 0, ...over,
  });
  const busy = day("2026-09-04", { messages_in: 2, conversations: 1, answered_ai: 2 });
  const dto = (series) => ({
    timezone: "America/New_York", days: 1, span_days: 2, today: "2026-09-04", series,
    reasons: {}, reply_seconds: [], sentiments: {}, voicemail: 0,
  });
  const vm = toReportVM(dto([day("2026-09-03"), busy]), { profile: null });
  const quiet = toReportVM(dto([day("2026-09-03"), day("2026-09-04")]), { profile: null });
  const sent = (n) => ({
    timezone: "America/New_York",
    days: 1,
    span_days: 2,
    today: "2026-09-04",
    series: [
      { day: "2026-09-03", sent: 0, delivered: 0, read: 0, replied: 0, opt_ins: 0, opt_outs: 0 },
      { day: "2026-09-04", sent: n, delivered: n, read: 0, replied: 0, opt_ins: 0, opt_outs: 0 },
    ],
    sources: [],
  });
  const campaigns = toCampaignReportVM(sent(3));
  const deals = toDealReportVM(
    { any: true, sent: 1, won: 0, lost: 0, waiting: 1, clients: 0, monthly_cents: 0, median_days_to_yes: null, open: { count: 0, amounts: [] }, sources: [], reasons: [] },
    "1 day",
  );
  const parts = { vm, campaigns, deals };
  assert.equal(lensAnswerOf("overview", parts), vm.lines.hero);
  assert.equal(lensAnswerOf("receptionist", parts), vm.lines.answered ?? undefined);
  assert.equal(lensAnswerOf("people", parts), vm.lines.channels ?? undefined);
  assert.equal(lensAnswerOf("pipeline", parts), deals.headline);
  assert.equal(lensAnswerOf("campaigns", parts), campaigns.lines.funnel);
  assert.equal(lensAnswerOf("reviews", parts), undefined, "Reviews says nothing of itself in this phase");
  assert.equal(lensAnswerOf("overview", { ...parts, vm: quiet }), undefined, "a period nobody wrote in has nothing to say");
  assert.equal(lensAnswerOf("campaigns", { ...parts, campaigns: null }), undefined, "a campaign read that failed says nothing");
  assert.equal(lensAnswerOf("pipeline", { ...parts, deals: toDealReportVM(null, "1 day") }), undefined);
});
```

In `tooling/scripts/tests/ask/ask.test.mjs`: add `REPORT_LENSES, lensRoute` to the existing import from `@chanlytics/contracts` (the list that starts at line 16 and ends at `} from "@chanlytics/contracts";` on line 44), and after `const SCOPES = ["clients/pipeline"];` add:

```js
// Reports' lenses are addresses of `reports`, which the registry routes as one page: each lens's jump is derived from the
// lens registry (contracts REPORT_LENSES), so a lens that joins it is a jump here without a line of this table.
for (const lens of REPORT_LENSES.filter((l) => l.id !== "overview")) {
  REACHED[lensRoute(lens.id)] = [`Reports › ${lens.label}`, lensRoute(lens.id)];
  SCOPES.push(lensRoute(lens.id));
}
```

- [ ] **Step 2: Run them to verify they fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/report-lenses.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask.test.mjs
```
Expected: FAIL: `REPORT_LENSES` is not exported (`ask.test.mjs` fails at its import).

- [ ] **Step 3: The registry**

Create `packages/contracts/src/reports/lenses.ts`:

```ts
/**
 * Reports' lenses (the reports-lenses spec, §6): one page, a lens to each thing the business runs, each at its own address,
 * `/w/<slug>/reports/<lens>` and the Overview at `/w/<slug>/reports`. This is the one table every list of them is read from:
 * the frame's strip and the route's `takes` (the dashboard's surfaces/reports/chrome.ts), the palette's jumps and Ask's page
 * routes (ask/ask-jump.ts, ask/citations.ts). Six lenses are drawn; a lens joins here in the change that draws its first tile
 * (Calendar, Usage and Leads each in phase C), so no row stands for a lens that is not there. A lens that exists and is not
 * shown to a workspace draws its `empty` at its address, never a not-found: Ask and ⌘K may link it.
 */
import { roleAtLeast } from "../config/roles";
import type { Role } from "../config/workspace-config/role-perms";
import { dealsAreOn } from "../deals/sells-by";

/** The period a lens's words are about: the report's own dates, as the page says them ("Aug 29" to "Sep 4"). */
export interface LensRange {
  since: string;
  until: string;
}

/** What a lens says where it has nothing to draw: a title, a sentence, and where to go from there. */
export interface LensEmpty {
  title: string;
  body: string;
  door: { label: string; to: string } | null;
}

/** What a row of the table is. */
interface ReportLens {
  /** The address's word (`/reports/<id>`); the Overview's is the address of Reports itself. */
  id: string;
  /** The strip's word. */
  label: string;
  /** The palette's sub-line. */
  sub: string;
  /**
   * When the lens is shown: always, or only where deals are on (`sells_by`, the one predicate `dealsAreOn`). Campaigns and
   * Reviews are shown to every workspace for now (an owner sees "Nothing went out" today, and nothing an owner sees
   * disappears in this phase); each narrows to its spec's rule in the change that gives it its own tiles.
   */
  shownWhen: "always" | "deals_on";
  /** The least role that may read it. */
  role: Role;
  /** What it says where it has nothing to draw (a period nobody wrote in, a lens the workspace has no use for). */
  empty: (range: LensRange) => LensEmpty;
}

const NOTHING_CAME_IN = (r: LensRange): LensEmpty => ({
  title: "Nothing came in",
  body: `Nobody wrote or called between ${r.since} and ${r.until}.`,
  door: null,
});

export const REPORT_LENSES = [
  {
    id: "overview",
    label: "Overview",
    sub: "how the period went, and what needs a look",
    shownWhen: "always",
    role: "viewer",
    empty: NOTHING_CAME_IN,
  },
  {
    id: "receptionist",
    label: "Receptionist",
    sub: "who answered, how fast, and why it stopped",
    shownWhen: "always",
    role: "viewer",
    empty: NOTHING_CAME_IN,
  },
  {
    id: "people",
    label: "People",
    sub: "who reached you, and where and when",
    shownWhen: "always",
    role: "viewer",
    empty: NOTHING_CAME_IN,
  },
  {
    id: "pipeline",
    label: "Pipeline",
    sub: "proposals, and what became of them",
    shownWhen: "deals_on",
    role: "viewer",
    empty: () => ({
      title: "No proposals to report",
      body: "Proposals you send, and what became of them, show here. Where your customers book directly, there is nothing to report.",
      door: { label: "Open Settings", to: "admin/workspace" },
    }),
  },
  {
    id: "campaigns",
    label: "Campaigns",
    sub: "what went out, and who wrote back",
    shownWhen: "always",
    role: "viewer",
    empty: (r) => ({
      title: "Nothing went out",
      body: `No broadcast or playbook run reached anyone between ${r.since} and ${r.until}, and nobody said yes or asked to stop.`,
      door: { label: "Open Sent", to: "broadcasts" },
    }),
  },
  {
    id: "reviews",
    label: "Reviews",
    sub: "what customers say on Google",
    shownWhen: "always",
    role: "viewer",
    empty: () => ({
      title: "Find your business on Google once.",
      body: "Its rating, its count and its newest reviews show here for the period, with a line on Today and a row on the bell when one lands.",
      door: { label: "Find it", to: "start/find" },
    }),
  },
] as const satisfies readonly ReportLens[];

/** A lens's address word, from the table. */
export type LensId = (typeof REPORT_LENSES)[number]["id"];

/** A row of the table, with its id as the literal it is. */
export type LensRow = (typeof REPORT_LENSES)[number];

/** The route a lens is at: the Overview is `reports`, every other `reports/<lens>`. */
export const lensRoute = (id: LensId): string => (id === "overview" ? "reports" : `reports/${id}`);

/** Every lens's route, in the strip's order (Ask's page routes read them). */
export const LENS_ROUTES: readonly string[] = REPORT_LENSES.map((l) => lensRoute(l.id));

/** Whether a param under `reports` is a lens's: every one but the Overview, which is `reports` itself. */
export const isLensParam = (param: string): param is Exclude<LensId, "overview"> =>
  REPORT_LENSES.some((l) => l.id === param && l.id !== "overview");

/** The lens a route is: `reports` is the Overview, `reports/<lens>` that lens, and anything else none. */
export function lensOfRoute(route: string): LensId | null {
  if (route === "reports") return "overview";
  const param = route.startsWith("reports/") ? route.slice("reports/".length) : "";
  return isLensParam(param) ? param : null;
}

/** What decides which lenses a workspace is shown: how its customers buy, and the role of the person looking. */
export interface LensWho {
  sellsBy: string | null | undefined;
  /** Not yet known reads as a viewer, the lowest rung; a role the ladder does not know stands on none. */
  role: string | null | undefined;
}

/** The lenses shown to this person in this workspace, in the strip's order. */
export function lensesFor(who: LensWho): LensRow[] {
  return REPORT_LENSES.filter(
    (l) => (l.shownWhen === "always" || dealsAreOn(who.sellsBy)) && roleAtLeast(who.role ?? "viewer", l.role),
  );
}

/** Whether a lens is shown to this person here. */
export const lensIsShown = (id: LensId, who: LensWho): boolean => lensesFor(who).some((l) => l.id === id);

/** A lens's row. */
export function lensOf(id: LensId): LensRow {
  const found = REPORT_LENSES.find((l) => l.id === id);
  if (!found) throw new Error(`Reports has no lens ${id}`);
  return found;
}

/** What a lens says where it has nothing to draw, over the period's dates. */
export const lensEmpty = (id: LensId, range: LensRange): LensEmpty => lensOf(id).empty(range);
```

Create `packages/contracts/src/reports/lens-answer.ts`:

```ts
/**
 * The one sentence the head says for a lens (the lenses spec, D4: the head stays "Reports" and the lens's answer stands beside
 * it): taken from the view model that holds it, never composed on the page. A lens with nothing to say of itself says
 * nothing, and the head is its name alone.
 */
import type { DealReportVM } from "../deals/deal-report";
import type { CampaignReportVM } from "./campaign-report";
import type { LensId } from "./lenses";
import type { ReportVM } from "./reports";

export function lensAnswerOf(
  lens: LensId,
  parts: { vm: ReportVM; campaigns: CampaignReportVM | null; deals: DealReportVM | null | undefined },
): string | undefined {
  const { vm, campaigns, deals } = parts;
  switch (lens) {
    case "overview":
      return vm.empty ? undefined : vm.lines.hero;
    case "receptionist":
      return vm.empty ? undefined : (vm.lines.answered ?? undefined);
    case "people":
      return vm.empty ? undefined : (vm.lines.channels ?? undefined);
    case "pipeline":
      return deals?.present ? deals.headline : undefined;
    case "campaigns":
      return campaigns && !campaigns.empty ? campaigns.lines.funnel : undefined;
    case "reviews":
      return undefined;
  }
}
```

In `packages/contracts/src/reports/index.ts` add:

```ts
export {
  REPORT_LENSES,
  LENS_ROUTES,
  lensRoute,
  isLensParam,
  lensOfRoute,
  lensesFor,
  lensIsShown,
  lensOf,
  lensEmpty,
} from "./lenses";
export type { LensId, LensRow, LensRange, LensEmpty, LensWho } from "./lenses";
export { lensAnswerOf } from "./lens-answer";
```

In `packages/contracts/src/ask/citations.ts`: add `import { LENS_ROUTES } from "../reports/lenses";` with the other imports; change `export const ASK_PAGE_ROUTES = [` to `export const ASK_PAGE_ROUTES: readonly string[] = [`; replace the element `  "reports",` with `  ...LENS_ROUTES,`; and change the closing `] as const;` of that array to `];`.

In `packages/contracts/src/ask/ask-jump.ts`: add `import { REPORT_LENSES, lensRoute, type LensRow } from "../reports/lenses";` under the header comment; above `export const ASK_PAGES` add

```ts
/** A lens of Reports as the palette jumps to it: its name beside Reports', and its own sub-line (the registry's). */
const lensJump = (lens: LensRow): JumpEntry => ({
  label: `Reports › ${lens.label}`,
  to: lensRoute(lens.id),
  kind: "page",
  sub: lens.sub,
});

/** The lenses every workspace has, which sit under Reports; the Overview is Reports itself. */
const LENS_JUMPS: JumpEntry[] = REPORT_LENSES.filter((l) => l.id !== "overview" && l.shownWhen === "always").map(lensJump);

/** The lenses only a workspace with deals on has (the Pipeline's): after the others, where deals are on. */
const DEALS_LENS_JUMPS: JumpEntry[] = REPORT_LENSES.filter((l) => l.shownWhen === "deals_on").map(lensJump);
```

replace `  { label: "Reports", to: "reports", kind: "page" },` in `ASK_PAGES` with

```ts
  { label: "Reports", to: "reports", kind: "page" },
  ...LENS_JUMPS,
```

and in `askPages` replace the loop body

```ts
  for (const p of ASK_PAGES) {
    out.push(p);
    if (p.to === "clients/leads" && has.dealsOn) out.push(PIPELINE);
  }
```

with

```ts
  const lastLens = LENS_JUMPS.at(-1)?.to;
  for (const p of ASK_PAGES) {
    out.push(p);
    if (p.to === "clients/leads" && has.dealsOn) out.push(PIPELINE);
    if (p.to === lastLens && has.dealsOn) out.push(...DEALS_LENS_JUMPS);
  }
```

- [ ] **Step 4: Regenerate, build, run**

```bash
corepack pnpm exec prettier --write packages/contracts/src/reports packages/contracts/src/ask tooling/scripts/tests/reports/report-lenses.test.mjs tooling/scripts/tests/ask/ask.test.mjs
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter "./packages/*" build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/report-lenses.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-palette.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/workspace/team-writes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/contracts-import-cycles.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs
corepack pnpm -r typecheck
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done
git add packages/contracts/src/reports packages/contracts/src/ask packages/contracts/src/browser.generated.ts packages/*/dist tooling/scripts/tests/reports/report-lenses.test.mjs tooling/scripts/tests/ask/ask.test.mjs
git commit -m "Reports has six lenses in one table, and the palette, Ask's page routes and the head's sentence are read from it." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The kit's Figure, designed once

**Why:** One figure on the page: a number, what it counts, the period before beside it in plain ink, one line under it; its definition in the kit's `Tooltip` (never a native `title`); its door the kit's press (`PressAct | PressDoor`, `kit/press.tsx`) where the number opens something. It reproduces Reports' tile, with the strip's grid, dividers and padding left to the page. Task 13 draws Reports' strip with it; Today's figures are the next user, and not this PR's.

**Files:**
- Create: `apps/dashboard/src/surfaces/kit/figure/figure.tsx`, `apps/dashboard/src/surfaces/kit/figure/figure.type-test.ts`
- Modify: `apps/dashboard/src/surfaces/kit/index.ts`, `apps/dashboard/src/surfaces/kit/kit.css`, `apps/dashboard/src/surfaces/kit/classes.json`
- Modify: `tooling/scripts/e2e-harness/kit-gallery.mjs`, `tooling/scripts/e2e-harness/kit-behaves-entries.tsx`, `e2e/kit/kit-behaves.spec.ts`, `tooling/scripts/tests/styles/kit-components.test.mjs`

- [ ] **Step 1: Write the failing test**

In `tooling/scripts/tests/styles/kit-components.test.mjs`: add `import { Figure } from "../../../../apps/dashboard/src/surfaces/kit/figure/figure.tsx";` with the other kit imports, and append at the end of the file:

```js
/** The gallery's Figure family, entry by entry, as a surface draws it with the kit's component. */
const FIGURES = {
  figure: () => h(Figure, { label: "Customer messages", value: "17", meta: "on 6 of 7 days" }),
  "figure-change": () =>
    h(Figure, { label: "Customer messages", value: "17", change: "up from 7", meta: "on 6 of 7 days" }),
  "figure-door": () =>
    h(Figure, {
      label: "Customer messages",
      value: "17",
      meta: "on 6 of 7 days",
      door: { href: "/w/harbor/inbox" },
    }),
  "figure-door-act": () =>
    h(Figure, { label: "Customer messages", value: "17", meta: "on 6 of 7 days", door: { onClick } }),
};

test("Figure draws the gallery's Figure family: a term and its definitions, the number a door where it opens something, the page's class last", () => {
  assert.deepEqual(parting(FAMILIES, "Figure", FIGURES), HELD);
  const defined = (node) => keysOf(node).filter((k) => node.props[k] !== undefined);
  const fig = drawn(h(Figure, { label: "Calls", value: "3", id: "calls", "data-testid": "fig", className: "rpt-cell" }));
  assert.equal(fig.props.className, "figure rpt-cell", "the page's layout class comes last");
  assert.deepEqual(defined(fig), ["className", "data-figure", "data-testid"]);
  assert.equal(fig.props["data-figure"], "calls");
  assert.deepEqual(defined(drawn(h(Figure, { label: "Calls", value: "3" }))), ["className"], "no id, no attribute");
  const rows = (props) =>
    drawn(h(Figure, { label: "Calls", value: "3", ...props }))
      .props.children.filter(Boolean)
      .map((c) => c.props.className);
  assert.deepEqual(rows({}), ["figure-label", "figure-value"], "no line under it where there is nothing to say");
  assert.deepEqual(rows({ meta: "no calls" }), ["figure-label", "figure-value", "figure-meta"]);
  assert.deepEqual(rows({ meta: null, change: null }), ["figure-label", "figure-value"]);
  // The number is a link where the door has an address, and a button that acts where it has none.
  const numberOf = (door) => drawn(h(Figure, { label: "Calls", value: "3", door })).props.children[1].props.children[0];
  const link = numberOf({ href: "/w/harbor/inbox" }).rendered;
  assert.deepEqual([link.type, link.props.href, link.props.className], ["a", "/w/harbor/inbox", "figure-door"]);
  const act = numberOf({ onClick }).rendered;
  assert.deepEqual([act.type, act.props.type, act.props.className], ["button", "button", "figure-door"]);
  assert.equal(drawn(h(Figure, { label: "Calls", value: "3" })).props.children[1].props.children[0], "3");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-components.test.mjs`
Expected: FAIL, `kit/figure/figure.tsx` cannot be found.

- [ ] **Step 3: The component, its type test, its export**

Create `apps/dashboard/src/surfaces/kit/figure/figure.tsx`:

```tsx
/**
 * The kit's figure (kit.css, "Figure"; the reports lenses spec, §8): a number, what it counts, the period before beside it in
 * plain ink, and one line under it. It draws the `div` that holds a term and its definitions, so the page draws the `dl` that
 * holds several (Reports' strip). Where the words need a definition (what is counted, and what is not) the label is a stop for
 * the kit's Tooltip, never a native `title`; where the number opens something it is a door: the kit's press (press.tsx), a link
 * where it has an address and a button where it acts. A figure is not a tone: its change is plain ink, never green or red.
 *
 * It draws what the gallery's Figure families draw (tooling/scripts/e2e-harness/kit-gallery.mjs): "Figure", entry for entry,
 * and "Figure, on Base UI" for the label that carries a definition. `className` is for the page's layout, and comes last.
 */
import type { PressAct, PressDoor } from "../press";
import { Press } from "../press";
import { Tooltip } from "../tooltip/tooltip";
import { cx } from "../variants";

/** A figure: what it counts, its number as said, and what goes beside and under it. */
export type FigureProps = {
  /** What it counts, in the words an owner uses. */
  label: string;
  /** The number as said: "17", "62%", "—". */
  value: string;
  /** The period before beside the number, in counts ("up from 7"); none where there is nothing to compare with. */
  change?: string | null;
  /** One line under the number; two lines at most. */
  meta?: string | null;
  /** What is counted and what is not, said in the kit's tooltip over the label. */
  definition?: string;
  /** Where the number opens something: a link where it has an address, a press that acts where it has none. */
  door?: PressAct | PressDoor;
  /** What the figure is, for a page's tests and a later phase's definitions (`data-figure`). */
  id?: string;
  className?: string;
  /** The id a test finds the figure by; the label's stop, where it has one, is `<id>-term`. */
  "data-testid"?: string;
};

/** A figure: a term, its number and what sits with it. */
export function Figure({
  label,
  value,
  change = null,
  meta = null,
  definition,
  door,
  id,
  className,
  "data-testid": testid,
}: FigureProps) {
  const term =
    definition === undefined ? (
      label
    ) : (
      <Tooltip tip={definition}>
        {/* eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a focus stop for its tip, the one way a keyboard reads what is counted */}
        <span
          className="figure-term"
          tabIndex={0}
          aria-description={definition}
          data-testid={testid === undefined ? undefined : `${testid}-term`}
        >
          {label}
        </span>
      </Tooltip>
    );
  const number =
    door === undefined ? (
      value
    ) : (
      <Press {...door} className="figure-door">
        {value}
      </Press>
    );
  return (
    <div className={cx("figure", className)} data-figure={id} data-testid={testid}>
      <dt className="figure-label">{term}</dt>
      <dd className="figure-value">
        {number}
        {change ? <span className="figure-change">{change}</span> : null}
      </dd>
      {meta ? <dd className="figure-meta">{meta}</dd> : null}
    </div>
  );
}
```

Create `apps/dashboard/src/surfaces/kit/figure/figure.type-test.ts`:

```ts
/**
 * What the kit's Figure takes, proved where the compiler reads it (figure.tsx): the words it counts and says, the period
 * before and the line under as words or none, a definition as words, a door as the kit's press props (a link's address or an
 * act), and the page's class and ids. A label or a number missing, a number that is not said, a definition that is an
 * element, and a door whose address is not words stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line under
 * `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the dashboard's
 * `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no bundle reaches it,
 * and the calls are in a function nothing calls.
 */
import type { ComponentProps } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { FigureProps } from "../index";
import type { PressAct, PressDoor } from "../press";
import { Figure } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _figureTakes(now: { door: PressAct | PressDoor | undefined; change: string | null }): void {
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Figure>, FigureProps>>,
    Holds<Exactly<FigureProps["door"], PressAct | PressDoor | undefined>>,
    Holds<Exactly<FigureProps["change"], string | null | undefined>>,
  ];
  Figure({ label: "Customer messages", value: "17" });
  Figure({ label: "Customer messages", value: "17", change: "up from 7", meta: "on 6 of 7 days", id: "customer_messages" });
  Figure({ label: "Customer messages", value: "17", definition: "What customers wrote or phoned in.", "data-testid": "fig" });
  Figure({ label: "Needed you", value: "3", door: { href: "/w/harbor/inbox" }, className: "rpt-cell" });
  Figure({ label: "Needed you", value: "3", door: { onClick: () => undefined } });
  // Chosen as the page runs: a door or none, and a change or none.
  Figure({ label: "Needed you", value: "3", door: now.door, change: now.change });

  // @ts-expect-error a figure says what it counts: its label
  Figure({ value: "17" });
  // @ts-expect-error a figure's number is said (words), never a number the page has not formatted
  Figure({ label: "Calls", value: 3 });
  // @ts-expect-error a definition is words, drawn in the kit's tooltip, never an element
  Figure({ label: "Calls", value: "3", definition: { words: "What customers wrote." } });
  // @ts-expect-error a door that is a link has an address in words
  Figure({ label: "Calls", value: "3", door: { href: 3 } });
  // @ts-expect-error the label is words: a glyph or markup beside it is the page's, not the figure's
  Figure({ label: { words: "Calls" }, value: "3" });
}
```

In `apps/dashboard/src/surfaces/kit/index.ts` add, after the `Face` export lines (alphabetical):

```ts
export { Figure } from "./figure/figure";
export type { FigureProps } from "./figure/figure";
```

- [ ] **Step 4: Its rules, and its names**

Append to `apps/dashboard/src/surfaces/kit/kit.css` (after its last rule):

```css

/* ---------- Figure: a number, what it counts, the period before beside it, one line under ----------
   The reports lenses spec, §8. A term and its definitions in the page's <dl> (the figure draws the <div> that holds them):
   the label in the muted ink, the number at the large step in the medium weight, the period before beside it in the dim ink
   and never a tone (the badge rules: a change is plain ink), and one line under it, at two lines at most. A definition rides
   on the label as the kit's tooltip (the label is its stop); the number is a door where it opens something. The page places
   the figure (a strip's grid, its dividers and its padding are the page's): the kit knows no grid. */
.figure {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.figure > dt,
.figure > dd {
  margin: 0;
}
.figure-label {
  font-size: var(--text-sm);
  color: var(--ink-muted);
}
.figure-value {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  font-size: var(--text-2xl);
  font-weight: var(--weight-medium);
  letter-spacing: -0.025em;
  line-height: 1.2;
  color: var(--ink);
}
.figure-door {
  color: inherit;
  text-decoration: none;
}
.figure-door:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.figure-door:focus-visible,
.figure-term:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: var(--radius-xs);
}
.figure-change {
  overflow: hidden;
  font-size: var(--text-xs);
  font-weight: var(--weight-regular);
  letter-spacing: 0;
  color: var(--ink-dim);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.figure-meta {
  display: -webkit-box;
  overflow: hidden;
  font-size: var(--text-xs);
  line-height: 1.35;
  color: var(--ink-dim);
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
```

In `apps/dashboard/src/surfaces/kit/classes.json`, in `"classes"`, add these seven names between `"field-error-words"` and `"input"`:

```json
    "figure",
    "figure-change",
    "figure-door",
    "figure-label",
    "figure-meta",
    "figure-term",
    "figure-value",
```

- [ ] **Step 5: Its two gallery families, and their holds**

In `tooling/scripts/e2e-harness/kit-gallery.mjs`:

1. After the `kitTooltip` constant (it ends with `...</div></div>\`;`), add:

```js
/** The kit's Figure as its component draws it: a term and its definitions, in the page's list (`.gx-figs` is the gallery's). */
const figure = ({
  term = "Customer messages",
  value = "17",
  change = null,
  meta = "on 6 of 7 days",
  door = null,
} = {}) => {
  const number =
    door === "a"
      ? `<a class="figure-door" href="#">${value}</a>`
      : door === "button"
        ? `<button type="button" class="figure-door">${value}</button>`
        : value;
  return (
    `<dl class="gx-figs"><div class="figure"><dt class="figure-label">${term}</dt>` +
    `<dd class="figure-value">${number}${change ? `<span class="figure-change">${change}</span>` : ""}</dd>` +
    `${meta ? `<dd class="figure-meta">${meta}</dd>` : ""}</div></dl>`
  );
};

/** The figure whose label carries a definition, shown: the kit's Tooltip over the term. */
const figureDefined = () =>
  figure({ term: `<span class="figure-term" tabindex="0">Customer messages</span>` }) +
  `<div class="tip-place" role="presentation" ${placed("top: 64px; left: 16px;")}>` +
  `<div class="ui-tip show" tabindex="-1">What customers wrote or phoned in. Your replies and your campaigns are not counted.</div></div>`;
```

2. Add this family after the `Meter` family (before `family: "Sheet"`):

```js
  {
    family: "Figure",
    about:
      "The kit's figure (surfaces/kit/figure/figure.tsx): a term and its definitions in the page's list -- what it counts, " +
      "the number at the large step, the period before beside it in plain ink, one line under it. The number a link where " +
      "it has an address and a button where it acts. Reports' strip is drawn with it.",
    entries: [
      { id: "figure", html: figure() },
      { id: "figure-change", html: figure({ change: "up from 7" }) },
      { id: "figure-door", html: figure({ door: "a" }) },
      { id: "figure-door-act", html: figure({ door: "button" }) },
    ],
  },
```

3. Add this family after the `Tooltip, on Base UI` family:

```js
  {
    family: "Figure, on Base UI",
    about:
      "The kit's Figure (surfaces/kit/figure/figure.tsx) with a definition on its label: the label is a stop for the kit's " +
      "Tooltip, shown over the term, never a native title.",
    entries: [{ id: "figure-defined", stage: "pop", html: figureDefined() }],
  },
```

4. In the gallery's stylesheet, after the line `.gx-narrow { max-width: 220px; }`, add `.gx-figs { margin: 0; max-width: 240px; }`.

In `tooling/scripts/e2e-harness/kit-behaves-entries.tsx`: add `Figure as KitFigure,` to the import from the kit's index (alphabetical, after `Field,`); add

```tsx
/** A figure whose label carries a definition: the kit's Tooltip over the term. */
function FigureDefined() {
  return (
    <Figure id="figure-defined" about="the kit's Figure, its label carrying a definition">
      <dl className="gx-figs">
        <KitFigure
          label="Customer messages"
          value="17"
          meta="on 6 of 7 days"
          definition="What customers wrote or phoned in. Your replies and your campaigns are not counted."
          data-testid="figure-kit"
        />
      </dl>
    </Figure>
  );
}
```

after `TooltipKit`, and `{ id: "figure-defined", Draw: FigureDefined, closed: false },` after the `tooltip-kit` row of `ENTRIES`.

In `e2e/kit/kit-behaves.spec.ts`, in `STATES`, after the `tooltip-kit` row add:

```ts
  { entry: "figure-defined", bring: (p) => p.getByTestId("figure-kit-term").hover(), ready: ".ui-tip.show" },
```

- [ ] **Step 6: Run what a node can run, then the browser's**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/kit tooling/scripts/e2e-harness e2e/kit tooling/scripts/tests/styles/kit-components.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-components.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-gallery.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-css.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-behaves.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/style-measures.test.mjs
corepack pnpm -r typecheck
corepack pnpm e2e:local -- e2e/kit/kit.spec.ts --scenario=kit
corepack pnpm e2e:local -- e2e/kit/kit-behaves.spec.ts --scenario=kit
```
Expected: the node tests PASS (the plain family drawn entry for entry, every registry name drawn by an entry, `kit.css` reading tokens alone with no `@media`, the running page and the gallery's "on Base UI" families in step, no literal added to any count); typecheck compiles `figure.type-test.ts`; both browser specs PASS and show the two new families (`Figure`: four entries; `Figure, on Base UI`: one, its tip shown on hover and on focus).

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/surfaces/kit tooling/scripts/e2e-harness/kit-gallery.mjs tooling/scripts/e2e-harness/kit-behaves-entries.tsx e2e/kit/kit-behaves.spec.ts tooling/scripts/tests/styles/kit-components.test.mjs
git commit -m "The kit has a Figure: a number, what it counts, the period before beside it in plain ink, its definition in the kit's tooltip and its number a door." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Today's sections move into their lenses, equal by value

**Why:** `surfaces/reports/sections.tsx` (604 lines) draws today's whole page: the headline, Worth knowing and the strip; the receptionist's cards; Deals; "Your customers"; Campaigns. Each part is a lens's body, so each moves to `lenses/<lens>.tsx`, unchanged. The page still draws all six, one after the other in the old order, so the app is whole at every commit; Task 11 is the one that draws a lens alone. The move is proved by value: while both modules exist, a test draws the old sections and the six new bodies on the stub React and compares them as text, for a full period, an empty period and a period with a failed campaigns read. The old module is deleted in the step that makes the comparison impossible, and the test with it; what the page says is then held by the fixed expectations `reports-page.test.mjs` already holds (every card under its testid, every sentence, every state), and by the source-text pins re-pointed below.

**Files:**
- Create: `tooling/scripts/tests/reports/_report-world.mjs`, `tooling/scripts/tests/reports/reports-lenses-move.test.mjs` (deleted in Step 6), `apps/dashboard/src/surfaces/reports/lenses/{shared,overview,receptionist,people,pipeline,campaigns,reviews}.tsx`
- Modify: `tooling/scripts/tests/reports/reports-page.test.mjs`, `tooling/scripts/tests/reports/campaign-report.test.mjs`, `tooling/scripts/tests/calendar/calendar-people.test.mjs`, `apps/dashboard/src/surfaces/reports/reports-page.tsx`
- Delete: `apps/dashboard/src/surfaces/reports/sections.tsx`

- [ ] **Step 1: Share the fixtures**

Create `tooling/scripts/tests/reports/_report-world.mjs` (a helper several tests of the folder share, so it keeps its place at the folder's root): cut from `reports-page.test.mjs` the block from the comment `/* ------------- a week that has everything: Sat Aug 29 to Fri Sep 4, 2026, after a quieter week ------------- */` through the end of `const surface = ({ ... }) => { ... };` (the line before `/* ------------- the period's read: period.ts over a fetch this test holds`), put it under this header, and `export` each of `reportDto`, `quiet`, `campaignDto`, `dealsDto`, `CALENDAR`, `NO_DEALS`, `DEALS` and `surface`:

```js
/**
 * The world Reports' tests draw: a week that has everything, Sat Aug 29 to Fri Sep 4, 2026, after a quieter week, as the
 * bridge's contracts functions make its view models (the fixtures every Reports test shares; nothing here is a real
 * business: Harbor Studio's numbers are made up).
 */
import {
  toReportVM,
  toCampaignReportVM,
  toBookingReportVM,
  toDealReportVM,
  reportFacts,
} from "@chanlytics/contracts";
```

In `reports-page.test.mjs` delete the cut block and add `import { reportDto, quiet, campaignDto, dealsDto, CALENDAR, NO_DEALS, DEALS, surface } from "./_report-world.mjs";` after the `_legacy-react.mjs` import; remove from its `@chanlytics/contracts` import the names it no longer uses: `corepack pnpm exec eslint tooling/scripts/tests/reports/reports-page.test.mjs` names each one that `no-unused-vars` finds (expected: `toBookingReportVM`, `toDealReportVM` and `reportFacts`, which only the fixtures used).

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-page.test.mjs`. Expected: PASS, as before (the fixtures moved with no value changed).

- [ ] **Step 2: Write the failing comparison**

Create `tooling/scripts/tests/reports/reports-lenses-move.test.mjs`:

```js
/**
 * The proof, by value, that today's sections moved into their lenses unchanged (decision 0015; the Reports lenses plan,
 * Task 10): the old module (surfaces/reports/sections.tsx, with the reach-outs' and Google's sections the page drew after it)
 * and the six lens bodies in the old order draw the same tree, spelled as text, for a full period, an empty one and one whose
 * campaigns read failed. Deleted with the old module in the same task: what the page says is then held by reports-page.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh } from "../_legacy-react.mjs";
import { DEALS, NO_DEALS, quiet, surface } from "./_report-world.mjs";

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
const S = "../../../../apps/dashboard/src";
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { ReportsSections } = await import(`${S}/surfaces/reports/sections.tsx`);
const { RptReachOuts } = await import(`${S}/surfaces/reports/reach-outs.tsx`);
const { GoogleSection } = await import(`${S}/surfaces/reports/google.tsx`);
const { OverviewLens } = await import(`${S}/surfaces/reports/lenses/overview.tsx`);
const { ReceptionistLens } = await import(`${S}/surfaces/reports/lenses/receptionist.tsx`);
const { PipelineLens } = await import(`${S}/surfaces/reports/lenses/pipeline.tsx`);
const { PeopleLens } = await import(`${S}/surfaces/reports/lenses/people.tsx`);
const { CampaignsLens } = await import(`${S}/surfaces/reports/lenses/campaigns.tsx`);
const { ReviewsLens } = await import(`${S}/surfaces/reports/lenses/reviews.tsx`);

const h = (type, props) => globalThis.React.createElement(type, props);

/** A drawn tree as text: each element's tag, its props in order of name (a function is "[fn]"), and what it holds. */
function spell(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(spell).join("");
  if (typeof node !== "object") return String(node);
  if (typeof node.type === "function") return spell(node.rendered);
  if (node.type === "Fragment") return spell(node.props.children);
  const props = Object.entries(node.props)
    .filter(([key]) => key !== "children" && key !== "key")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${typeof value === "function" ? "[fn]" : JSON.stringify(value)}`)
    .join(" ");
  return `<${String(node.type)} ${props}>${spell(node.props.children)}</${String(node.type)}>`;
}

/** Google linked to nothing: the section's "find your business" card. */
const GOOGLE_NONE = {
  dto: { ready: { places: true, profile: false }, listing: null, connection: null, reviews: [], days: [], reply_mode: "ask" },
  fetchedAt: 1,
};

const CASES = {
  "a full period: deals recorded, the reach-outs' read failed, Google not linked": {
    R: { ...surface({ deals: DEALS }), reachOuts: null },
    google: GOOGLE_NONE,
  },
  "an empty period, the section the page drew under it, and no Google": {
    R: surface({ report: quiet(), deals: NO_DEALS }),
    google: undefined,
  },
  "a period whose campaigns read failed, with no deals": { R: surface({ campaigns: null }), google: undefined },
};

for (const [name, { R, google }] of Object.entries(CASES)) {
  test(`the six lens bodies, in the old order, draw what the page's sections drew: ${name}`, () => {
    setSurfaceValue("google", google);
    fresh();
    const pick = () => Promise.resolve();
    const was = spell([h(ReportsSections, { R, pick }), h(RptReachOuts, { R }), h(GoogleSection, { days: R.days })]);
    const props = { R, pick, phone: false };
    const now = spell([
      h(OverviewLens, props),
      h(ReceptionistLens, props),
      h(PipelineLens, props),
      h(PeopleLens, props),
      h(CampaignsLens, props),
      h(ReviewsLens, props),
    ]);
    assert.ok(was.length > 400, "something was drawn");
    assert.equal(now, was);
    setSurfaceValue("google", undefined);
  });
}
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-lenses-move.test.mjs`
Expected: FAIL, `surfaces/reports/lenses/overview.tsx` cannot be found.

- [ ] **Step 4: Write the lens files by moving the functions**

Every function below is **moved verbatim** from `apps/dashboard/src/surfaces/reports/sections.tsx` (copy it, with the comment above it; `sections.tsx` stays whole until Step 6, so the comparison has something to compare). Each file starts with its header and imports, then the moved functions, then its component.

`apps/dashboard/src/surfaces/reports/lenses/shared.tsx`:

```tsx
/**
 * What the lenses share (moved from sections.tsx, decision 0015): the props every lens body takes, and the card a period
 * nobody wrote or called in draws.
 */
import type { ReportPeriodId, ReportVM } from "@chanlytics/contracts";
import { EmptyState } from "../../kit/empty/empty";
import type { ReportsSurface } from "../surface";

/** What a lens body draws from: the one read the surface holds, the row's own period switch, and whether the page is a phone's. */
export interface LensProps {
  R: ReportsSurface;
  pick: (period: ReportPeriodId) => Promise<void>;
  phone: boolean;
}

/*
 * nothingCameIn: moved here from sections.tsx exactly as it stands, `function nothingCameIn(vm: ReportVM, period:
 * ReportPeriodId, pick: (period: ReportPeriodId) => Promise<void>)` (the signature Task 6 gave it), now `export`ed.
 */
```

(Replace the block comment with the function itself, `export function nothingCameIn`.)

`lenses/overview.tsx`:

```tsx
/**
 * The Overview lens: the receptionist's share of the answered beside Worth knowing, and the strip of counts (moved from
 * sections.tsx, decision 0015). A period nobody wrote or called in says so under the strip.
 */
import { RptFacts, RptHero, RptTiles } from "../blocks";
import { nothingCameIn, type LensProps } from "./shared";

export function OverviewLens({ R, pick, phone }: LensProps) {
  const vm = R.vm;
  return (
    <>
      <section className="rpt-grid rpt-top" aria-label="This period">
        <RptHero vm={vm} phone={phone} />
        {!vm.empty && <RptFacts facts={R.facts || []} />}
      </section>
      <RptTiles vm={vm} booking={R.booking || null} />
      {vm.empty ? nothingCameIn(vm, R.period, pick) : null}
    </>
  );
}
```

`lenses/receptionist.tsx`: header comment (`The Receptionist lens: who answered, how fast, why it stopped, the calls, and who booked (moved from sections.tsx).`), these imports:

```tsx
import type { ReportVM } from "@chanlytics/contracts";
import { navigate } from "../../legacy-verbs";
import { BarChart, BarList } from "../../kit/charts/bar";
import { ChartCard, SegmentBar } from "../../kit/charts/card";
import { ckSecondsLabel } from "../../kit/charts/geometry";
import { LineChart } from "../../kit/charts/line";
import { EmptyState } from "../../kit/empty/empty";
import { RptBooked, RptSection } from "../blocks";
import { RPT_ANSWERED, RPT_CALLS, RPT_REPLY, rptMood, rptPlural, rptSpread } from "../series";
import type { ReportsSurface } from "../surface";
import type { LensProps } from "./shared";
```

the functions `answeredCard`, `replyTable`, `replyBody`, `replyCard`, `reasonsCard`, `callsCard` and `receptionistSection`, and

```tsx
export function ReceptionistLens({ R, phone }: LensProps) {
  return R.vm.empty ? null : receptionistSection(R, phone);
}
```

`lenses/people.tsx`: header (`The People lens: where they reach you, and when, and how many are new (moved from sections.tsx).`), imports:

```tsx
import type { ReportVM } from "@chanlytics/contracts";
import { ChartCard, SegmentBar } from "../../kit/charts/card";
import { HeatStrip } from "../../kit/charts/heat";
import { LineChart } from "../../kit/charts/line";
import { PieChart } from "../../kit/charts/pie";
import { RadarChart } from "../../kit/charts/radar";
import { EmptyState } from "../../kit/empty/empty";
import { RptSection } from "../blocks";
import { RPT_CHANNELS, rptPeriods, rptPlural } from "../series";
import type { LensProps } from "./shared";
```

the functions `channelsCard`, `rhythmTable`, `rhythmCard`, `peopleCard` and `customersSection`, and

```tsx
export function PeopleLens({ R }: LensProps) {
  return R.vm.empty ? null : customersSection(R.vm, R.days);
}
```

`lenses/pipeline.tsx`: header (`The Pipeline lens: the proposals of the period and what became of them, and the clients now (moved from sections.tsx; the Deals section's own comment stays with it).`), imports:

```tsx
import type { DealReportVM } from "@chanlytics/contracts";
import { BarList } from "../../kit/charts/bar";
import { ChartCard } from "../../kit/charts/card";
import { RptSection } from "../blocks";
import type { LensProps } from "./shared";
```

the function `dealsSection` with the long comment above it, and

```tsx
export function PipelineLens({ R }: LensProps) {
  return dealsSection(R.deals);
}
```

`lenses/campaigns.tsx`: header (`The Campaigns lens: what the broadcasts and playbooks sent, and what the reach-outs wrote (moved from sections.tsx).`), imports:

```tsx
import type { CampaignReportVM, ReportVM } from "@chanlytics/contracts";
import { BarChart, BarList } from "../../kit/charts/bar";
import { ChartCard } from "../../kit/charts/card";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { RptSection, RptSources } from "../blocks";
import { RptReachOuts } from "../reach-outs";
import { RPT_SENT } from "../series";
import type { LensProps } from "./shared";
```

the functions `funnelCard`, `sentCard` and `campaignsBody`, and

```tsx
export function CampaignsLens({ R }: LensProps) {
  return (
    <>
      <RptSection title="Campaigns" meta="what your broadcasts and playbooks sent">
        {campaignsBody(R.vm, R.campaigns || null, R.days)}
      </RptSection>
      {/* What the reach-outs wrote and what came back (Reach out Part 6, H3): a section of its own, after Campaigns. */}
      <RptReachOuts R={R} />
    </>
  );
}
```

`lenses/reviews.tsx`:

```tsx
/** The Reviews lens: Google's listing, its rating and its newest reviews, over the period (google.tsx draws the section). */
import { GoogleSection } from "../google";
import type { LensProps } from "./shared";

export function ReviewsLens({ R }: LensProps) {
  return <GoogleSection days={R.days} />;
}
```

- [ ] **Step 5: Run the comparison**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/reports/lenses tooling/scripts/tests/reports
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-lenses-move.test.mjs
```
Expected: PASS for the three cases: the six bodies draw, as text, exactly what `ReportsSections`, `RptReachOuts` and `GoogleSection` drew.

- [ ] **Step 6: The page draws the lenses; the old module and its comparison go**

In `apps/dashboard/src/surfaces/reports/reports-page.tsx`: replace the imports `import { GoogleSection } from "./google";`, `import { RptReachOuts } from "./reach-outs";` and `import { ReportsSections } from "./sections";` with

```tsx
import { useRptPhone } from "./blocks";
import { CampaignsLens } from "./lenses/campaigns";
import { OverviewLens } from "./lenses/overview";
import { PeopleLens } from "./lenses/people";
import { PipelineLens } from "./lenses/pipeline";
import { ReceptionistLens } from "./lenses/receptionist";
import { ReviewsLens } from "./lenses/reviews";
```

add `const phone = useRptPhone();` as the first line of `ReportsPage`'s body (before `const live = ...`: a hook is called every time), and replace

```tsx
          <ReportsSections R={R} pick={pick} />
          {/* What the reach-outs wrote and what came back (Reach out Part 6, H3): a section of its own, after Campaigns. */}
          <RptReachOuts R={R} />
          <GoogleSection days={R.days} />
```

with

```tsx
          {/* Task 11 draws one of these by the address; until then the page draws them all, in the order it always did. */}
          <OverviewLens R={R} pick={pick} phone={phone} />
          <ReceptionistLens R={R} pick={pick} phone={phone} />
          <PipelineLens R={R} pick={pick} phone={phone} />
          <PeopleLens R={R} pick={pick} phone={phone} />
          <CampaignsLens R={R} pick={pick} phone={phone} />
          <ReviewsLens R={R} pick={pick} phone={phone} />
```

Delete `apps/dashboard/src/surfaces/reports/sections.tsx` and `tooling/scripts/tests/reports/reports-lenses-move.test.mjs` (`git rm` both). Re-point the two source-text pins that read the old module:

`tooling/scripts/tests/calendar/calendar-people.test.mjs`: replace `readCode("apps/dashboard/src/surfaces/reports/sections.tsx").includes('testid="chart-booking"')` with `readCode("apps/dashboard/src/surfaces/reports/lenses/receptionist.tsx").includes('testid="chart-booking"')`.

`tooling/scripts/tests/reports/campaign-report.test.mjs`: replace the block from `const p = readCode("apps/dashboard/src/surfaces/reports/sections.tsx");` through the `nothing in dollars` assertion (the one that ends `"nothing in dollars",\n  );`) with:

```js
  const lens = (name) => readCode(`apps/dashboard/src/surfaces/reports/lenses/${name}.tsx`);
  const p = lens("campaigns");
  assert.ok(
    p.includes('testid="chart-funnel"'),
    "the funnel: sent, delivered, wrote back (the campaign tiles folded into it: each number once)",
  );
  assert.ok(
    p.includes('testid="chart-campaigns"'),
    "chart-campaigns: the card, the empty and the failed read all carry it",
  );
  assert.ok(
    p.includes('testid="chart-sources"') && p.includes('title="By playbook and broadcast"'),
    "the sources card",
  );
  assert.ok(
    p.includes('<RptSection title="Campaigns"') && lens("overview").includes("<RptTiles "),
    "the page is sectioned, and the strip is one frame (its testid is executed: reports-page.test.mjs)",
  );
  assert.ok(
    !/\$\d|revenue|booked from/i.test(
      ["overview", "receptionist", "people", "pipeline", "campaigns", "reviews"].map(lens).join("\n"),
    ),
    "nothing in dollars",
  );
```

- [ ] **Step 7: Run what holds the page now**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/reports tooling/scripts/tests/reports tooling/scripts/tests/calendar/calendar-people.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/campaign-report.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-honest.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/calendar/calendar-people.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/google/google.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/back-pages.test.mjs
corepack pnpm -r typecheck
```
Expected: all PASS. `reports-page.test.mjs` is the fixed expectation the moved bodies are held to: it draws the page on its own fixtures and holds every card under its testid, every sentence and every state, none of which changed in this task.

- [ ] **Step 8: Commit**

```bash
git add apps/dashboard/src/surfaces/reports tooling/scripts/tests/reports tooling/scripts/tests/calendar/calendar-people.test.mjs
git commit -m "Today's sections are one file per lens, drawn on the page in the order they always were, equal by value to the module they left." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(The two `git rm`s of Step 6 are already staged; `git add` stages the rest.)

---

### Task 11: A lens is an address: one page, the frame's strip, the head, the lens alone

**Why:** The feature. `reports/[[...lens]]/page.tsx` draws every lens address; `takes`, `mount` and `chrome` in `surfaces/routes.ts` say which addresses the page draws and what the frame draws around each; the strip is the lens registry's `lensesFor`, decided from what the shell already holds (`workspaceOverride.current()`), and Reports' first draw waits for the workspace list so it never gains a tab; the head says "Reports" and the lens's answer (`lensAnswerOf`); each lens draws its body alone, an empty state from the registry where the workspace has no use for it, and the same data for every lens, so a move between them asks for nothing.

**Files:**
- Move: `apps/dashboard/app/(os)/w/[workspace]/reports/page.tsx` to `apps/dashboard/app/(os)/w/[workspace]/reports/[[...lens]]/page.tsx`
- Create: `apps/dashboard/src/surfaces/reports/chrome.ts`, `apps/dashboard/src/surfaces/reports/head.ts`, `tooling/scripts/tests/reports/reports-address.test.mjs`, `tooling/scripts/tests/reports/reports-lens-page.test.mjs`
- Modify: `apps/dashboard/src/surfaces/routes.ts`, `apps/dashboard/src/legacy-bridge/surface-registry.ts`, `apps/dashboard/src/surfaces/reports/reports-page.tsx`, `apps/dashboard/src/surfaces/reports/google.tsx`, `apps/dashboard/src/surfaces/reports/lenses/{shared,receptionist,people,pipeline,campaigns,reviews}.tsx`, `CLAUDE.md`
- Modify (tests): `tooling/scripts/tests/shell/surfaces/route-waits.test.mjs`, `tooling/scripts/tests/google/google.test.mjs`, `tooling/scripts/tests/reports/reports-page.test.mjs`, `e2e/reports.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `tooling/scripts/tests/reports/reports-address.test.mjs`:

```js
/**
 * Reports' addresses and what the frame draws around each (surfaces/routes.ts, surfaces/reports/chrome.ts): one page that takes
 * the Overview's address and each lens's, a move between two of them a pushed or replaced entry on that page, and a strip of views
 * that is the lens registry's, decided from the workspace list the shell already holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";

installLegacyReact();
const { SURFACE_ROUTES, routeHasPage, onOnePage } = await importSrc("apps/dashboard/src/surfaces/routes.ts");

/** The workspace list the shell holds, with the active one. */
const hold = (sellsBy, role = "owner") => {
  globalThis.__WORKSPACES = [
    { id: "w1", slug: "harbor", name: "Harbor Studio", status: "active", timezone: "America/New_York", sells_by: sellsBy, role },
  ];
  globalThis.__ACTIVE_WORKSPACE = "w1";
};
const chromeAt = (param) => SURFACE_ROUTES.reports.chrome({ param, backToPeople: null });

test("the page takes the Overview's address and each lens's, and no other address under reports", () => {
  for (const route of ["reports", "reports/receptionist", "reports/people", "reports/pipeline", "reports/campaigns", "reports/reviews"])
    assert.ok(routeHasPage(route), route);
  for (const no of ["reports/overview", "reports/usage", "reports/leads", "reports/anything"])
    assert.ok(!routeHasPage(no), `${no} is the frame table's: not found`);
});

test("a move between two lenses is a pushed or replaced entry on the one page, never a request for a page", () => {
  assert.ok(onOnePage("reports", "reports/people"));
  assert.ok(onOnePage("reports/people", "reports/campaigns"));
  assert.ok(onOnePage("reports/campaigns", "reports"));
  assert.ok(!onOnePage("reports/people", "today"), "away from Reports is the router's");
  assert.ok(!onOnePage("reports/people", "clients/pipeline"));
});

test("the strip is the frame's: the lens registry's tabs as links to each lens's route, the page mounted once across them", () => {
  hold("booking");
  const overview = chromeAt(null);
  assert.deepEqual(overview.crumbs, ["Reports"]);
  assert.equal(overview.mount, "reports", "one mount across every lens, so a move never remounts the page");
  assert.deepEqual(overview.views, {
    name: "reports",
    label: "Which report",
    testid: "reports-lenses",
    picked: "overview",
    tabs: [
      { id: "overview", label: "Overview", to: "reports", testid: "lens-overview" },
      { id: "receptionist", label: "Receptionist", to: "reports/receptionist", testid: "lens-receptionist" },
      { id: "people", label: "People", to: "reports/people", testid: "lens-people" },
      { id: "campaigns", label: "Campaigns", to: "reports/campaigns", testid: "lens-campaigns" },
      { id: "reviews", label: "Reviews", to: "reports/reviews", testid: "lens-reviews" },
    ],
  });
  const people = chromeAt("people");
  assert.deepEqual(people.crumbs, [{ label: "Reports", to: "reports" }, "People"]);
  assert.equal(people.views.picked, "people");
});

test("Pipeline is a tab where deals are on, in its place, and nowhere else; the strip reads only what the shell holds", () => {
  hold("proposal");
  assert.deepEqual(
    chromeAt(null).views.tabs.map((t) => t.id),
    ["overview", "receptionist", "people", "pipeline", "campaigns", "reviews"],
  );
  hold("booking");
  assert.ok(!chromeAt(null).views.tabs.some((t) => t.id === "pipeline"));
  assert.equal(chromeAt("pipeline").views.picked, "pipeline", "an address typed by hand is still the one picked");
  delete globalThis.__WORKSPACES;
  delete globalThis.__ACTIVE_WORKSPACE;
  assert.ok(!chromeAt(null).views.tabs.some((t) => t.id === "pipeline"), "no workspace list yet: deals are not on");
});
```

Create `tooling/scripts/tests/reports/reports-lens-page.test.mjs`:

```js
/**
 * Reports' page by lens (surfaces/reports/reports-page.tsx), EXECUTED on the stub React over the one read the surface holds: each
 * lens draws its own body and none another's, the head says "Reports" and the lens's answer, a move between lenses asks for
 * nothing and never blanks the body, and a lens the workspace has no use for, or a period with nothing in it, says so in the
 * registry's words.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, all, byTestId, textOf, classes, find } from "../_legacy-react.mjs";
import { DEALS, NO_DEALS, quiet, surface } from "./_report-world.mjs";

const reads = [];
installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
globalThis.window.fetch = async (url) => {
  reads.push(String(url));
  return new Response(JSON.stringify({ ok: false, error: { code: "internal", message: "not read here" } }), { status: 500 });
};
const S = "../../../../apps/dashboard/src";
const { ReportsPage } = await import(`${S}/surfaces/reports/reports-page.tsx`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { standingSaid, forgetStanding } = await import(`${S}/surfaces/kit/head/standing.ts`);
const { lensAnswerOf } = await import("@chanlytics/contracts");
after(() => forgetStanding());

const at = (lens) => `/w/harbor/reports${lens === "overview" ? "" : `/${lens}`}`;
const workspace = (sellsBy) => {
  globalThis.__WORKSPACES = [
    { id: "w1", slug: "harbor", name: "Harbor Studio", status: "active", timezone: "America/New_York", sells_by: sellsBy, role: "owner" },
  ];
  globalThis.__ACTIVE_WORKSPACE = "w1";
};
const GOOGLE_NONE = {
  dto: { ready: { places: true, profile: false }, listing: null, connection: null, reviews: [], days: [], reply_mode: "ask" },
  fetchedAt: 1,
};
/** The lens drawn over a surface: the page for its address. */
const draw = (lens, opts = {}) => {
  setSurfaceValue("reports", opts.R ?? surface({ deals: DEALS }));
  setSurfaceValue("google", "google" in opts ? opts.google : GOOGLE_NONE);
  fresh();
  return ReportsPage({ pathname: at(lens) });
};
const has = (tree, ids) => ids.map((id) => !!byTestId(tree, id));

const BODIES = {
  overview: ["reports-hero", "reports-facts", "reports-tiles"],
  receptionist: ["chart-answered", "chart-reply", "chart-reasons", "chart-calls", "chart-booking"],
  people: ["chart-channels", "chart-rhythm", "chart-people"],
  pipeline: ["rpt-deals"],
  campaigns: ["chart-funnel", "chart-campaigns", "chart-sources"],
  reviews: ["google-none"],
};

test("each lens draws its own body and none another's, from one read, under the page's testid", () => {
  workspace("proposal");
  for (const [lens, ids] of Object.entries(BODIES)) {
    const tree = draw(lens);
    assert.ok(byTestId(tree, "reports-real"), `${lens}: the page`);
    assert.equal(byTestId(tree, "reports-real").props["data-lens"], lens);
    assert.deepEqual(has(tree, ids), ids.map(() => true), `${lens}: its cards`);
    for (const [other, theirs] of Object.entries(BODIES))
      if (other !== lens) assert.deepEqual(has(tree, theirs), theirs.map(() => false), `${lens} draws none of ${other}'s`);
  }
});

test("a move between lenses asks for nothing, and the body is never blank: every lens is drawn from the read already held", () => {
  workspace("proposal");
  reads.length = 0;
  for (const lens of ["people", "receptionist", "overview", "campaigns", "people"]) {
    const tree = draw(lens);
    assert.equal(byTestId(tree, "reports-real").props["data-loading"], undefined, `${lens}: nothing on its way`);
    assert.ok(all(tree, (n) => classes(n).includes("ck-card")).length > 0, `${lens}: a body, not a blank`);
  }
  assert.deepEqual(reads, [], "no read was made");
});

test("the head says Reports and the lens's own answer, from contracts, on every lens", () => {
  workspace("proposal");
  const R = surface({ deals: DEALS });
  for (const lens of Object.keys(BODIES)) {
    draw(lens, { R });
    const said = standingSaid();
    assert.equal(said.title, "Reports", lens);
    assert.equal(said.sentence, lensAnswerOf(lens, R), `${lens}: its answer`);
  }
  assert.equal(standingSaid().sentence, undefined, "Reviews says nothing of itself");
});

test("a lens the workspace has no use for says so at its address, in the registry's words, and draws none of its cards", () => {
  workspace("booking");
  const tree = draw("pipeline", { R: surface({ deals: DEALS }) });
  const empty = byTestId(tree, "lens-empty");
  assert.equal(textOf(find(empty, (n) => classes(n).includes("empty-title"))), "No proposals to report");
  assert.ok(textOf(empty).includes("Open Settings"));
  assert.equal(byTestId(tree, "rpt-deals"), null);
  workspace("proposal");
  const none = draw("pipeline", { R: surface({ deals: NO_DEALS }) });
  assert.ok(byTestId(none, "lens-empty"), "deals on and none ever recorded: the same words, never a blank");
});

test("a period with nothing in it says so on each lens that draws sections, and Reviews says what it needs where Google cannot be read", () => {
  workspace("booking");
  const R = surface({ report: quiet(), deals: NO_DEALS });
  for (const lens of ["overview", "receptionist", "people"]) {
    const tree = draw(lens, { R });
    assert.ok(textOf(byTestId(tree, "reports-empty")).includes("Nobody wrote or called between Aug 29 and Sep 4."), lens);
  }
  const reviews = draw("reviews", { google: undefined });
  assert.ok(textOf(byTestId(reviews, "lens-empty")).includes("Find your business on Google once."));
});
```

In `tooling/scripts/tests/shell/surfaces/route-waits.test.mjs` add:

```js
test("Reports waits for the workspace list beside its own surface, so the strip of lenses never gains a tab after it is drawn", () => {
  assert.deepEqual(reg.ROUTE_WAITS.reports, ["workspace"]);
  assert.equal(gate("reports"), false, "nothing in yet");
  status.setStatus("reports", "live");
  assert.equal(gate("reports"), false, "REGRESSION: the page drawn before the list that decides its strip");
  assert.equal(gate("reports", null, true), true, "its own surface is in: the shell draws after the wait regardless");
  status.setStatus("workspace", "live");
  assert.equal(gate("reports"), true, "the strip and the page draw together");
});
```

In `tooling/scripts/tests/google/google.test.mjs`, in the test that holds `google.tsx`'s source, replace

```js
      reports.includes("if (!G || (!G.dto.ready.places && !G.dto.ready.profile && !G.dto.listing)) return null;"),
```

with

```js
      reports.includes("export const googleReadable = ") && reports.includes("if (!googleReadable(G)) return null;"),
```

- [ ] **Step 2: Run them to verify they fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-address.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-lens-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/route-waits.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/google/google.test.mjs
```
Expected: FAIL (the route has no `takes`, the page takes no pathname, `ROUTE_WAITS.reports` is undefined, `googleReadable` does not exist).

- [ ] **Step 3: The address, the chrome, the head**

```bash
mkdir -p "apps/dashboard/app/(os)/w/[workspace]/reports/[[...lens]]"
git mv "apps/dashboard/app/(os)/w/[workspace]/reports/page.tsx" "apps/dashboard/app/(os)/w/[workspace]/reports/[[...lens]]/page.tsx"
```

Replace `apps/dashboard/app/(os)/w/[workspace]/reports/[[...lens]]/page.tsx` with:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { ReportsPage } from "@/surfaces/reports/reports-page";

/**
 * /w/<slug>/reports, and the lens addresses under it (`reports/receptionist`, `people`, `pipeline`, `campaigns`, `reviews`: the
 * lens registry, contracts `REPORT_LENSES`): one page draws every address it takes (`takes` in `src/surfaces/routes.ts`), the frame's
 * strip of views is the lens strip (`src/surfaces/reports/chrome.ts`), and the page follows its own address, so a move between two
 * of them is a pushed or replaced entry, never a request for a page. Reports was the first surface to leave the shell (decision
 * 0015, step 3): its code is `src/surfaces/reports/`, and the frame in the layout draws its chrome around this page.
 */
export default function Page() {
  // A move between two of the page's addresses is a pushed or replaced entry, which usePathname follows and a router request
  // would not: the page reads its lens from the path (src/surfaces/reports/reports-page.tsx).
  return <ReportsPage pathname={usePathname()} />;
}
```

Create `apps/dashboard/src/surfaces/reports/chrome.ts`:

```ts
/**
 * What the frame draws around Reports' page: which addresses under `reports` the page takes (a lens), and the crumbs, the mount and
 * the strip of views each has (surfaces/routes.ts). The strip is the frame's one (`SurfaceTabs`, its tabs links), as People's scopes
 * are: the page says which lenses there are, the frame draws and moves them. Which are shown is decided from what the shell already
 * holds of the workspace (its list, which Reports' first draw waits for: ROUTE_WAITS), never from a read of Reports' own, so the strip
 * stands at first paint and never gains a tab.
 */
import { isLensParam, lensOf, lensOfRoute, lensRoute, lensesFor, type LensId } from "@chanlytics/contracts";
import { workspaceOverride } from "@/legacy-bridge/surface-data";
import type { SurfaceViews } from "../routes";

/** Which params of `reports` the page draws: a lens's. The Overview is `reports` itself; `reports/overview` is no address. */
export const reportsTakes = (param: string): boolean => isLensParam(param);

/** The lenses shown here, as the frame's strip draws them; `picked` is the one the address names. */
function lensViews(picked: LensId): SurfaceViews {
  const ws = workspaceOverride.current();
  const tabs = lensesFor({ sellsBy: ws?.sells_by, role: ws?.role }).map((l) => ({
    id: l.id,
    label: l.label,
    to: lensRoute(l.id),
    testid: `lens-${l.id}`,
  }));
  return { name: "reports", label: "Which report", testid: "reports-lenses", picked, tabs };
}

/**
 * The crumbs, the mount and the views of an address: Reports alone for the Overview, Reports then the lens for any other, and one
 * mount for them all, because the page follows its address (reports-page.tsx): a lens picked is said in the path, and a page mounted
 * afresh for each would lose its period's dimming and its place with every pick.
 */
export function reportsChrome({ param }: { param: string | null }) {
  const lens = lensOfRoute(param ? `reports/${param}` : "reports") ?? "overview";
  const crumbs = lens === "overview" ? ["Reports"] : [{ label: "Reports", to: "reports" }, lensOf(lens).label];
  return { crumbs, mount: "reports", views: lensViews(lens) };
}
```

Create `apps/dashboard/src/surfaces/reports/head.ts`:

```ts
/**
 * What Reports says to the frame's head (the lenses spec, D4): its name on every lens, and the lens's own answer beside it, one
 * sentence from contracts (`lensAnswerOf`), taken from the view models the page draws, so no two of them say different numbers.
 * Nothing while the page has no read to answer from.
 */
import { lensAnswerOf, type LensId } from "@chanlytics/contracts";
import { useStanding } from "../kit/head/standing";
import type { ReportsSurface } from "./surface";

export function useReportsStanding(lens: LensId, R: ReportsSurface | null): void {
  useStanding({ title: "Reports", sentence: R ? lensAnswerOf(lens, R) : undefined });
}
```

In `apps/dashboard/src/surfaces/routes.ts`: add `import { reportsChrome, reportsTakes } from "./reports/chrome";` with the other chrome imports (alphabetical, after `./people/chrome`), and replace the row

```ts
  reports: { activeNav: "reports", crumbs: ["Reports"], pane: true },
```

with

```ts
  // Reports, one page of lenses: the Overview's address and each lens's (reports/chrome.ts), one mount across them.
  reports: {
    activeNav: "reports",
    crumbs: ["Reports"],
    pane: true,
    takes: (param) => reportsTakes(param),
    mount: "reports",
    chrome: (at) => reportsChrome(at),
  },
```

In `apps/dashboard/src/legacy-bridge/surface-registry.ts` replace

```ts
export const ROUTE_WAITS: Record<string, readonly string[]> = {
  today: ["setup"],
};
```

with

```ts
export const ROUTE_WAITS: Record<string, readonly string[]> = {
  today: ["setup"],
  // Reports' strip of lenses is decided from the workspace list (how its customers buy: the Pipeline is shown only where deals
  // are on) and draws above the page's body, so a list that landed after it would add a tab to a strip already drawn.
  reports: ["workspace"],
};
```

- [ ] **Step 4: The page by lens, the lenses alone**

In `apps/dashboard/src/surfaces/reports/google.tsx`: change `import { draftReply, replyToReview } from "@/legacy-bridge/google";` to `import { draftReply, replyToReview, type GoogleSurface } from "@/legacy-bridge/google";`; extend its contracts imports to `import { lensEmpty, toGoogleVM } from "@chanlytics/contracts";` and `import type { GoogleReviewVM, GoogleVM, LensRange } from "@chanlytics/contracts";`; add, above `GoogleSection`,

```tsx
/** Whether Reviews has anything to draw: this deployment can look listings up, or a listing is kept (the one predicate: the lens and the section ask it). */
export const googleReadable = (G: GoogleSurface | undefined): G is GoogleSurface =>
  !!G && (G.dto.ready.places || G.dto.ready.profile || !!G.dto.listing);
```

and change `export function GoogleSection({ days }: { days: number }) {` to `export function GoogleSection({ days, range }: { days: number; range: LensRange }) {`, the line `if (!G || (!G.dto.ready.places && !G.dto.ready.profile && !G.dto.listing)) return null;` to `if (!googleReadable(G)) return null;`, and the not-linked card's `EmptyState` from its three literals to the registry's words:

```tsx
  if (!L) {
    const none = lensEmpty("reviews", range);
    return (
      <RptSection title="Google reviews">
        <div className="rpt-grid">
          <ChartCard className="rpt-span-12" title="Your listing on Google" testid="google-none">
            <EmptyState
              kind="line"
              title={none.title}
              body={none.body}
              action={none.door ? { label: none.door.label, to: none.door.to } : null}
            />
          </ChartCard>
        </div>
      </RptSection>
    );
  }
```

In `lenses/shared.tsx`: add `import { lensEmpty, type LensId, type ReportPeriodId, type ReportVM } from "@chanlytics/contracts";` (replacing the type-only import), make `nothingCameIn` say the registry's words,

```tsx
export function nothingCameIn(vm: ReportVM, period: ReportPeriodId, pick: (period: ReportPeriodId) => Promise<void>) {
  const words = lensEmpty("overview", { since: vm.since, until: vm.until });
  return (
    <EmptyState
      kind="card"
      glyph="wave"
      title={words.title}
      testid="reports-empty"
      body={words.body}
      action={period !== "90d" ? { label: "Look at 90 days", onClick: () => void pick("90d") } : null}
    />
  );
}

/** What a lens says where it has nothing to draw: the registry's words, a door where it has one. */
export function LensEmpty({ lens, vm, testid = "lens-empty" }: { lens: LensId; vm: ReportVM; testid?: string }) {
  const words = lensEmpty(lens, { since: vm.since, until: vm.until });
  return (
    <EmptyState
      kind="card"
      glyph="wave"
      title={words.title}
      body={words.body}
      testid={testid}
      action={words.door ? { label: words.door.label, to: words.door.to } : null}
    />
  );
}
```

`lenses/receptionist.tsx`: `ReceptionistLens` becomes `export function ReceptionistLens({ R, pick, phone }: LensProps) { return R.vm.empty ? nothingCameIn(R.vm, R.period, pick) : receptionistSection(R, phone); }` and imports `nothingCameIn` with `type LensProps` from `./shared`. `lenses/people.tsx`: `export function PeopleLens({ R, pick }: LensProps) { return R.vm.empty ? nothingCameIn(R.vm, R.period, pick) : customersSection(R.vm, R.days); }`, same import. `lenses/pipeline.tsx`: `export function PipelineLens({ R }: LensProps) { return R.deals && R.deals.present ? dealsSection(R.deals) : <LensEmpty lens="pipeline" vm={R.vm} />; }`, importing `LensEmpty`. `lenses/campaigns.tsx`: in `campaignsBody` replace the `if (cm.empty) return ( <EmptyState kind="card" glyph="wave" title="Nothing went out" testid="chart-campaigns" body={...} action={{ label: "Open Sent", to: "broadcasts" }} /> );` with `if (cm.empty) return <LensEmpty lens="campaigns" vm={vm} testid="chart-campaigns" />;` (import `LensEmpty`; `EmptyState` is still used by `funnelCard` and `sentCard`). `lenses/reviews.tsx` becomes:

```tsx
/** The Reviews lens: Google's listing, its rating and its newest reviews, over the period (google.tsx draws the section). */
import { useSurface } from "../../use-surface";
import { GoogleSection, googleReadable } from "../google";
import { LensEmpty, type LensProps } from "./shared";

export function ReviewsLens({ R }: LensProps) {
  const G = useSurface("google");
  return googleReadable(G) ? (
    <GoogleSection days={R.days} range={{ since: R.vm.since, until: R.vm.until }} />
  ) : (
    <LensEmpty lens="reviews" vm={R.vm} />
  );
}
```

Replace `apps/dashboard/src/surfaces/reports/reports-page.tsx` with:

```tsx
/**
 * Chanlytics, Reports: the page on its App Router route (`reports/[[...lens]]`, decision 0015, and the lenses spec). One page of
 * lenses, each at its own address (`/w/<slug>/reports/<lens>`, the Overview at `/w/<slug>/reports`). The page follows its own
 * address, as People's does (the path the App Router page hands it), so a move between two lenses is a pushed or replaced entry and
 * never a request for a page, and every lens draws from the one read the surface holds, so a move asks for nothing and never
 * blanks the body. The frame draws the strip of lenses (chrome.ts, its `views`) and the head (head.ts); the page draws one row above
 * everything (the period, its days and the Ask door) and the lens's body (lenses/). A real workspace draws the bridge's own numbers
 * (`useSurface("reports")`); a demo session draws the same page from the contracts sample (sample.ts); without either, the page says
 * what Reports reads.
 */
import { useEffect, useState } from "react";
import {
  REPORT_PERIOD_DEFAULT,
  REPORT_RANGES,
  lensIsShown,
  lensOfRoute,
  routeOfPath,
  type LensId,
  type ReportPeriodId,
} from "@chanlytics/contracts";
import { workspaceOverride } from "@/legacy-bridge/surface-data";
import { askAbout, demoSession } from "../legacy-verbs";
import { EmptyState } from "../kit/empty/empty";
import { Icon } from "../kit/icon/icon";
import { useSurface } from "../use-surface";
import { useRptPhone } from "./blocks";
import { useReportsStanding } from "./head";
import { CampaignsLens } from "./lenses/campaigns";
import { OverviewLens } from "./lenses/overview";
import { PeopleLens } from "./lenses/people";
import { PipelineLens } from "./lenses/pipeline";
import { ReceptionistLens } from "./lenses/receptionist";
import { ReviewsLens } from "./lenses/reviews";
import { LensEmpty, type LensProps } from "./lenses/shared";
import { setReportRange } from "./period";
import { reportsSample } from "./sample";
import type { ReportsSurface } from "./surface";

/** Reports read nothing: a session with no workspace, and no demo to draw. */
function readsAWorkspace() {
  return (
    <div className="rpt" data-testid="reports-none">
      <div className="rpt-inner">
        <EmptyState
          kind="page"
          glyph="wave"
          title="Reports reads a workspace's own numbers"
          body="Open a workspace to see what its receptionist answered, who reached it, and what its campaigns sent."
        />
      </div>
    </div>
  );
}

/** One row above everything: the period, the days it covers, and a door to ask about them. */
function periodRow(p: {
  R: ReportsSurface;
  busy: boolean;
  failed: ReportPeriodId | null;
  pick: (period: ReportPeriodId) => Promise<void>;
}) {
  const { R, busy, failed, pick } = p;
  const vm = R.vm;
  return (
    <div className="rpt-head">
      <div className="rpt-range" role="group" aria-label="Period">
        {REPORT_RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            className={R.period === r.id ? "on" : ""}
            aria-pressed={R.period === r.id}
            aria-disabled={busy}
            onClick={() => void pick(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <span className="rpt-dates" title={`Days follow ${vm.timezone}`}>
        {vm.since} to {vm.until}
      </span>
      {failed && (
        <span className="rpt-failed" role="status" aria-live="polite">
          Couldn't load {REPORT_RANGES.find((r) => r.id === failed)?.label}. Still showing {vm.rangeLabel}.
        </span>
      )}
      <button
        type="button"
        className="rpt-ask"
        aria-label="Ask about this period"
        onClick={() => askAbout({ prompt: `What stood out in my last ${vm.rangeLabel}?` })}
        data-testid="reports-ask"
      >
        <Icon name="sparkle" size={13} />
        <span className="rpt-ask-label">Ask about this period</span>
      </button>
    </div>
  );
}

/** The lens's body, or what it says where this workspace has no use for it. */
function lensBody(lens: LensId, props: LensProps, shown: boolean) {
  if (!shown) return <LensEmpty lens={lens} vm={props.R.vm} />;
  switch (lens) {
    case "overview":
      return <OverviewLens {...props} />;
    case "receptionist":
      return <ReceptionistLens {...props} />;
    case "people":
      return <PeopleLens {...props} />;
    case "pipeline":
      return <PipelineLens {...props} />;
    case "campaigns":
      return <CampaignsLens {...props} />;
    case "reviews":
      return <ReviewsLens {...props} />;
  }
}

export function ReportsPage({ pathname }: { pathname: string | null }) {
  // The lens the address names; the frame hands the page only the addresses it takes (surfaces/routes.ts), so an address that is no
  // lens is not drawn here at all.
  const lens = lensOfRoute(routeOfPath(pathname) ?? "reports") ?? "overview";
  const phone = useRptPhone();
  const live = useSurface("reports");
  // A demo's own period: the sample answers at once, so the tabs switch it here.
  const [samplePeriod, setSamplePeriod] = useState<ReportPeriodId>(REPORT_PERIOD_DEFAULT);
  const [busy, setBusy] = useState(false);
  // The period that failed to load, if any: the page keeps the old one and says so, instead of dimming forever and
  // switching later on its own.
  const [failed, setFailed] = useState<ReportPeriodId | null>(null);
  const fetchedAt = live ? live.fetchedAt : 0;
  useEffect(() => {
    setBusy(false);
  }, [fetchedAt]);
  const R = live || (demoSession() ? reportsSample(samplePeriod) : null);
  useReportsStanding(lens, R);
  if (!R) return readsAWorkspace();
  const pick = async (period: ReportPeriodId) => {
    // One period at a time: while one loads the tabs hold, rather than start a second load over the first.
    if (busy || period === R.period) return;
    if (!live) {
      setSamplePeriod(period);
      return;
    }
    setBusy(true);
    setFailed(null);
    const ok = await setReportRange(period);
    if (!ok) {
      setBusy(false);
      setFailed(period);
    }
  };
  const ws = workspaceOverride.current();
  const shown = lensIsShown(lens, { sellsBy: ws?.sells_by, role: ws?.role });
  return (
    // A period on its way dims by the one rule every page uses (components.css [data-loading] [data-dims]).
    <div
      className="rpt"
      data-testid={live ? "reports-real" : "reports-sample"}
      data-lens={lens}
      data-loading={busy ? "" : undefined}
    >
      <div className="rpt-inner">
        {/* One row above everything: the period, the days it covers, and a door to ask about them. The frame's head says
            Reports and the lens's answer; the page does not title itself. */}
        {periodRow({ R, busy, failed, pick })}
        <div className="rpt-body" data-dims aria-busy={busy ? "true" : "false"}>
          {lensBody(lens, { R, pick, phone }, shown)}
        </div>
      </div>
    </div>
  );
}
```

In root `CLAUDE.md`, "The canonical example of each thing", the row `A real surface`: change `` `apps/dashboard/app/(os)/w/[workspace]/reports/page.tsx` `` to `` `apps/dashboard/app/(os)/w/[workspace]/reports/[[...lens]]/page.tsx` ``, and re-run `corepack pnpm exec prettier --write CLAUDE.md` (it re-pads that table; commit what it does).

- [ ] **Step 5: Move the page's tests to the lenses, and the end-to-end spec**

`tooling/scripts/tests/reports/reports-page.test.mjs`: its tests keep reading cards across the old whole page, so `page()` becomes the six lenses drawn in the strip's order, and `draw()` the one lens the address names. After `installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });` add the workspace the page is drawn in (deals are on, so the Pipeline lens is shown and draws the Deals section the tests below read):

```js
globalThis.__WORKSPACES = [
  { id: "w1", slug: "harbor", name: "Harbor Studio", status: "active", timezone: "America/New_York", sells_by: "proposal", role: "owner" },
];
globalThis.__ACTIVE_WORKSPACE = "w1";
```

Replace `const draw = () => ReportsPage();` and the `page` helper (`const page = (opts) => { setSurfaceValue("reports", surface(opts)); fresh(); went.length = 0; asked.length = 0; return draw(); };`) with:

```js
/** Reports' lenses' addresses, in the strip's order: the page's old whole is these six drawn one after another. */
const LENS_PATHS = ["", "/receptionist", "/people", "/pipeline", "/campaigns", "/reviews"].map((l) => `/w/harbor/reports${l}`);
/** The lens the address names: the Overview, unless a test says another. */
let lensAt = LENS_PATHS[0];
const draw = () => ReportsPage({ pathname: lensAt });
/** One lens drawn over a surface, as a person at its address sees it. */
const pageOnce = (opts) => {
  setSurfaceValue("reports", surface(opts));
  fresh();
  went.length = 0;
  asked.length = 0;
  return draw();
};
/**
 * Every lens's body in one tree, for what a test reads across the old page (a card, a row, a sentence). The Overview is drawn
 * last, so the frame the stub keeps (what `redraw` draws again, and where a press's state lands) is the Overview's, whose period
 * row the tests press.
 */
const page = (opts) => {
  const trees = new Map();
  for (const path of [...LENS_PATHS].reverse()) {
    lensAt = path;
    trees.set(path, pageOnce(opts));
  }
  lensAt = LENS_PATHS[0];
  return { type: "Fragment", props: { children: LENS_PATHS.map((path) => trees.get(path)) } };
};
```

`redraw` stays `again(draw)`, and `Google's reviews under the period...` keeps `page()` (the Reviews lens is one of the six). The demo's test (`a demo draws the same page from the sample...`) draws the Overview and the People lens alone, since no surface is set there: replace its first assertion

```js
    assert.ok(
      byTestId(tree, "reports-sample") && byTestId(tree, "reports-hero") && byTestId(tree, "chart-channels"),
      "the one Reports page, on the sample",
    );
```

with

```js
    assert.ok(byTestId(tree, "reports-sample") && byTestId(tree, "reports-hero"), "the one Reports page, on the sample");
    lensAt = LENS_PATHS[2];
    fresh();
    assert.ok(byTestId(draw(), "chart-channels"), "and its People lens");
    lensAt = LENS_PATHS[0];
    fresh();
    tree = draw();
```

Add:

```js
test("the page's head row stands over every lens, once, and the lens alone is drawn under it", () => {
  for (const path of LENS_PATHS) {
    lensAt = path;
    const tree = pageOnce();
    assert.equal(all(tree, (n) => classes(n).includes("rpt-head")).length, 1, `${path}: the period row, once`);
  }
  lensAt = LENS_PATHS[0];
});
```

The headings test (`every card is drawn...`) keeps its four headings, `"Worth knowing", "The receptionist", "Your customers", "Campaigns"`: the six lenses drawn in order draw those four in that order (the Pipeline's empty and Reviews' say nothing in an `h2`).
`e2e/reports.spec.ts`: replace the first test (`the headline, five tiles, one period control above everything, cards with table twins, no money`) with

```ts
  test("the Overview: the headline, five tiles, one period control above everything, no money; each lens its own cards with table twins", async ({
    page,
  }) => {
    await page.goto("/#/reports");
    await page.waitForLoadState("networkidle");
    const report = page.getByTestId("reports-real");
    await expect(report).toBeVisible();

    const text = await report.innerText();
    for (const s of INVENTED) expect(text, `invented copy: "${s}"`).not.toContain(s);
    expect(text, "revenue has no column").not.toMatch(/\$\d/);

    await expect(report.getByTestId("reports-hero")).toContainText("answered by your receptionist");

    const tiles = report.getByTestId("reports-tiles").locator(".rpt-tile");
    await expect(tiles).toHaveCount(5);
    const labels = (await tiles.locator(".rpt-tile-label").allInnerTexts()).map((l) => l.trim().toLowerCase());
    expect(labels).toEqual(["customer messages", "calls", "new people", "booked", "needed you"]);
    // A count (or a dash with no calendar), and the period before in counts when it had some: never a percentage.
    for (const v of await tiles.locator(".rpt-tile-value").allInnerTexts()) {
      expect(v.trim()).toMatch(
        /^(\d+|—)\s*(up from \d+|down from \d+|same as the \d+ days before|none the \d+ days before)?$/,
      );
    }

    const ranges = report.locator(".rpt-range button");
    await expect(ranges).toHaveCount(4);
    await expect(ranges.filter({ hasText: "30 days" })).toHaveAttribute("aria-pressed", "true");
    await expect(report.getByRole("button", { name: "Ask about this period" })).toBeVisible();

    // A workspace nobody reached in the period has one honest card instead of the charts, and no Worth knowing.
    if (await report.getByTestId("reports-empty").count()) {
      await expect(report.getByTestId("reports-facts")).toHaveCount(0);
      return;
    }
    await expect(report.getByTestId("reports-facts")).toContainText("Worth knowing");
    // The receptionist's lens: who answered, with a table twin.
    await page.getByTestId("lens-receptionist").click();
    const main = report.getByTestId("chart-answered");
    await expect(main).toBeVisible();
    if (await main.locator(".empty").count()) {
      await expect(main.getByText("No customer messages in this period")).toBeVisible();
    } else {
      for (const who of ["Receptionist", "You", "Unanswered"])
        await expect(main.locator(".ck-legend-item", { hasText: who })).toHaveCount(1);
      await expect(main.locator("svg").first()).toBeVisible();
    }
    // Either way it has a table twin.
    await main.hover();
    await main.getByTestId("card-table").click();
    await expect(main.locator("table")).toBeVisible();
    for (const id of ["chart-reply", "chart-reasons", "chart-calls", "chart-booking"]) {
      await expect(report.getByTestId(id), id).toBeVisible();
    }
    await page.getByTestId("lens-people").click();
    for (const id of ["chart-channels", "chart-rhythm", "chart-people"]) {
      await expect(report.getByTestId(id), id).toBeVisible();
    }
    await page.getByTestId("lens-campaigns").click();
    await expect(report.getByTestId("chart-campaigns")).toBeVisible();
  });
```

(Open `e2e/reports.spec.ts` first: the lines this replaces are the first test's body, from `test("the headline, five tiles, ...` to its closing `});`, which end with `await expect(report.getByTestId(id), id).toBeVisible();\n    }\n  });` around line 91; keep every line of its first half and its table-twin step as they stand, which the block above reproduces.)

Replace the last part of the address test, from `// Reports has one address: an address under it is not a report.` to the end of that test, with:

```ts
    // A lens is an address on this one page: the strip's tabs are links, and a press moves the address without a request for a page.
    const documents: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "document") documents.push(r.url());
    });
    await expect(page.getByTestId("reports-lenses")).toBeVisible();
    await page.getByTestId("lens-receptionist").click();
    await expect.poll(() => routeOf(page.url())).toBe("reports/receptionist");
    await expect(page.getByTestId("chart-answered")).toBeVisible();
    await expect(page.getByTestId("reports-hero")).toHaveCount(0);
    await page.getByTestId("lens-people").click();
    await expect.poll(() => routeOf(page.url())).toBe("reports/people");
    await expect(page.getByTestId("chart-channels")).toBeVisible();
    await page.goBack();
    await expect.poll(() => routeOf(page.url())).toBe("reports/receptionist");
    await expect(page.getByTestId("chart-answered")).toBeVisible();
    await page.getByTestId("lens-overview").click();
    await expect.poll(() => routeOf(page.url())).toBe("reports");
    await expect(page.getByTestId("reports-hero")).toBeVisible();
    expect(documents, "a move between lenses is never a page request").toEqual([]);

    // A lens address loads on its own, the frame around it; the Overview is `reports` and `reports/overview` is no address.
    await page.goto(`/w/${slug}/reports/campaigns`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("chart-campaigns")).toBeVisible();
    await expect(page.getByTestId("lens-campaigns")).toHaveAttribute("aria-current", "page");
    await page.goto(`/w/${slug}/reports/overview`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("reports-real")).toHaveCount(0);
    await page.goto(`/w/${slug}/reports/anything`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("reports-real")).toHaveCount(0);

    // The Pipeline's address is a lens even where deals are off: its empty state, never a not-found.
    await page.goto(`/w/${slug}/reports/pipeline`);
    await expect(page.getByTestId("sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("rpt-deals").or(page.getByTestId("lens-empty"))).toBeVisible();
  });
```

and delete the old comment and the two assertions it kept (`// Reports has one address: an address under it is not a report.` through `await expect(page.getByTestId("reports-real")).toHaveCount(0);`).

- [ ] **Step 6: Run**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces apps/dashboard/src/legacy-bridge/surface-registry.ts "apps/dashboard/app/(os)/w/[workspace]/reports" tooling/scripts/tests/reports tooling/scripts/tests/shell/surfaces/route-waits.test.mjs tooling/scripts/tests/google/google.test.mjs e2e/reports.spec.ts CLAUDE.md
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-address.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-lens-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/route-waits.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/surface-registry.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/google/google.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/google/google-profile.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/google/review-reply.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/docs/docs-paths.test.mjs
corepack pnpm -r typecheck
```
Expected: all PASS.

- [ ] **Step 7: Look at it in the real app**

`corepack pnpm --filter @chanlytics/dashboard dev`, then `http://localhost:3100/w/<slug>/reports` (docs/runbook.md, "See a real page"), a workspace with deals on and one with them off. At 1440 and at 390, in both themes, read: the frame's strip shows Overview, Receptionist, People, [Pipeline,] Campaigns, Reviews with the tab in ink and its underline gliding; a press on a tab changes the address and the body at once, with no loading dim and nothing refetched (the network panel shows no request); the head says "Reports" with the lens's sentence; Back walks the lenses; a reload of `/reports/people` boots on it; `/reports/overview` and `/reports/usage` are not found; on a workspace with deals off `/reports/pipeline` says "No proposals to report" with its Settings door. Then, with the local session minted as `docs/runbook.md` says, run the journeys: `E2E_BASE_URL=http://localhost:3100 corepack pnpm e2e -- e2e/reports.spec.ts` (the period control's and the tiles' lines of the spec change in Tasks 12 and 13).

- [ ] **Step 8: Commit**

```bash
git add "apps/dashboard/app/(os)/w/[workspace]/reports" apps/dashboard/src/surfaces apps/dashboard/src/legacy-bridge/surface-registry.ts tooling/scripts/tests/reports tooling/scripts/tests/shell/surfaces/route-waits.test.mjs tooling/scripts/tests/google/google.test.mjs e2e/reports.spec.ts CLAUDE.md
git commit -m "Each lens of Reports is an address on one page, the frame draws their strip and the head says the lens's answer, and a move between them asks for nothing." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 12: Reports' kit step: the six raw controls become the kit's

**Why:** Spec §2 says the lens work is Reports' kit step. Reports leaves `KIT_PENDING` (`eslint.config.mjs`), and the six raw controls its lint refuses become the kit's parts:

| Where (on this tree) | Raw control | The kit's part |
| --- | --- | --- |
| `blocks.tsx`, `factRow` | `<button className="rpt-fact-row">` (a fact's whole row is its door) | `LinkButton`, the page's `rpt-fact-row` class placing it |
| `blocks.tsx`, `sourceRow` | `<button className="rpt-src">` (a source's name opens its run) | `LinkButton` |
| `reach-outs.tsx`, `RptReachOutSources` | `<button className="rpt-src">` | `LinkButton` |
| `google.tsx`, `ReviewReply` | `<textarea className="rp2-review-textarea">` | `Field` (`rows`), named by its `aria-label`, `readOnly` while a draft is on its way |
| `reports-page.tsx`, `periodRow` | the four `<button>`s of `.rpt-range` | `Segmented`, its `readOnly` while a period loads (never `disabled`), a testid on each option |
| `reports-page.tsx`, `periodRow` | `<button className="rpt-ask">` | `Button`, `size="sm"` |

The proof of a restyle that cannot be recorded (Task 1): each part is the kit's own, already held in both themes and at both widths by the gallery's spec; the page's tests hold that each control is the kit's component with the props the old control had (below); the lint holds that none is raw (`rawElementsRule` now covers the folder); and Step 6 looks at the page at 1440 and 390, light and dark. The differences a person will see are listed there, and go in the pull request.

**Files:**
- Modify: `apps/dashboard/src/surfaces/reports/blocks.tsx`, `reach-outs.tsx`, `google.tsx`, `reports-page.tsx`, `apps/dashboard/src/legacy/styles/reports.css`, `eslint.config.mjs`
- Modify (tests): `tooling/scripts/tests/reports/reports-page.test.mjs`, `e2e/reports.spec.ts`

- [ ] **Step 1: Move the tests to the kit's parts (they fail until Step 3)**

In `tooling/scripts/tests/reports/reports-page.test.mjs` replace the helper

```js
const tabOf = (tree, label) => find(cls(tree, "rpt-range"), (n) => n.type === "button" && textOf(n) === label);
```

with

```js
const { Segmented } = await import(`${S}/surfaces/kit/segmented/segmented.tsx`);
const { Field } = await import(`${S}/surfaces/kit/field/field.tsx`);
/** The period control: the kit's segmented control, and the option a person presses, by its words. */
const control = (tree) => find(tree, (n) => n.type === Segmented);
const choose = (tree, label) => {
  const c = control(tree);
  c.props.onValueChange(c.props.options.find((o) => o.label === label).value);
};
const chosen = (tree) => {
  const c = control(tree);
  return c.props.options.find((o) => o.value === c.props.value)?.label;
};
```

and change each test that pressed or read a tab:

- `a period on its way keeps the one showing...`: `press(tabOf(tree, "90 days"));` becomes `choose(tree, "90 days");`, and `assert.equal(tabOf(tree, "90 days").props["aria-pressed"], true, "and it is the period the read answered");` becomes `assert.equal(chosen(tree), "90 days", "and it is the period the read answered");`.
- `a period that fails to load says so...`: `press(tabOf(tree, "30 days"));` becomes `choose(tree, "30 days");`; `assert.equal(tabOf(tree, "90 days").props["aria-disabled"], false, "the tabs hold only while a period loads");` becomes `assert.equal(control(tree).props.readOnly, false, "the control holds only while a period loads");`; `assert.equal(tabOf(tree, "7 days").props["aria-pressed"], true);` becomes `assert.equal(chosen(tree), "7 days");`.
- the demo's test: `assert.equal(tabOf(tree, "30 days").props["aria-pressed"], true);` becomes `assert.equal(chosen(tree), "30 days");`; `press(tabOf(tree, "90 days"));` becomes `choose(tree, "90 days");`; `assert.equal(tabOf(tree, "90 days").props["aria-pressed"], true, "the sample's own period");` becomes `assert.equal(chosen(tree), "90 days", "the sample's own period");`.
- `REGRESSION (C27)`: replace its body's lines from `press(tabOf(tree, "30 days"));` through `press(tabOf(tree, "90 days"));` with

```js
    choose(tree, "30 days");
    tree = redraw();
    assert.equal(control(tree).props.readOnly, true, "REGRESSION: pressable while a period loaded");
    choose(tree, "90 days");
```

- the Month test (Task 6): replace its body's lines with

```js
    let tree = page();
    assert.deepEqual(
      control(tree).props.options.map((o) => o.label),
      ["7 days", "30 days", "90 days", "Month"],
    );
    choose(tree, "Month");
    assert.deepEqual(period.asked, ["month"]);
    await land();
    redraw();
    tree = redraw();
    assert.equal(chosen(tree), "Month");
    assert.equal(cls(tree, "rpt-failed"), null, "nothing failed");
```

and add, to the tests, one that holds what each control now is:

```js
test("the period control is the kit's Segmented over the table's periods, each option with a test id, and the Ask door is the kit's Button", () => {
  const tree = page();
  const c = control(tree);
  assert.deepEqual(
    c.props.options.map((o) => [o.value, o.label, o.testid]),
    [
      ["7d", "7 days", "period-7d"],
      ["30d", "30 days", "period-30d"],
      ["90d", "90 days", "period-90d"],
      ["month", "Month", "period-month"],
    ],
  );
  assert.equal(c.props.label, "Period");
  assert.equal(c.props.readOnly, false, "nothing on its way");
  const ask = byTestId(tree, "reports-ask");
  assert.equal(ask.props.size, "sm");
  assert.equal(ask.props["aria-label"], "Ask about this period");
});
```

In `Google's reviews under the period...`, after the `assert.ok(byTestId(card(tree, "chart-google-latest"), "google-reply"), ...)` assertion add:

```js
    // The reply box is the kit's Field: its words kept, a limit of 4096, and no typing while a draft is on its way.
    lensAt = LENS_PATHS[5];
    const reviews = pageOnce();
    press(byTestId(card(reviews, "chart-google-latest"), "google-reply"));
    const box = find(again(draw), (n) => n.type === Field);
    assert.deepEqual(
      [box.props.rows, box.props.maxLength, box.props.readOnly, box.props["data-testid"]],
      [3, 4096, true, "google-reply-text"],
    );
    assert.ok(box.props["aria-label"], "named, with no label drawn");
    lensAt = LENS_PATHS[0];
```

In `e2e/reports.spec.ts`: in the first test replace

```ts
    const ranges = report.locator(".rpt-range button");
    await expect(ranges).toHaveCount(4);
    await expect(ranges.filter({ hasText: "30 days" })).toHaveAttribute("aria-pressed", "true");
```

with

```ts
    await expect(report.locator('[data-testid^="period-"]')).toHaveCount(4);
    await expect(report.getByTestId("period-30d")).toHaveAttribute("aria-checked", "true");
```

in the period test replace the request match `r.url().includes("days=7")` with `r.url().includes("period=7d")`, `await report.locator(".rpt-range button", { hasText: "7 days" }).click();` with `await report.getByTestId("period-7d").click();`, and `await expect(report.locator(".rpt-range button", { hasText: "7 days" })).toHaveAttribute("aria-pressed", "true");` with `await expect(report.getByTestId("period-7d")).toHaveAttribute("aria-checked", "true");`; in the booking test replace `"/api/v1/reports?days=30"` with `"/api/v1/reports?period=30d"`.

- [ ] **Step 2: Run them to verify they fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-page.test.mjs`
Expected: FAIL (`control(tree)` is `null`: the control is still four buttons).

- [ ] **Step 3: Draw the controls with the kit**

`apps/dashboard/src/surfaces/reports/blocks.tsx`: in `factRow` replace

```tsx
        <button type="button" className="rpt-fact-row" title={said} onClick={() => navigate(door.to)}>
          {body}
        </button>
```

with

```tsx
        <LinkButton className="rpt-fact-row" title={said} onClick={() => navigate(door.to)}>
          {body}
        </LinkButton>
```

and in `sourceRow` replace

```tsx
        <button
          type="button"
          className="rpt-src"
          onClick={() => navigate(s.kind === "broadcast" ? `broadcasts/run:${s.id}` : `outbound/${s.id}`)}
          data-testid="source-open"
        >
          {s.name}
        </button>
```

with

```tsx
        <LinkButton
          className="rpt-src"
          onClick={() => navigate(s.kind === "broadcast" ? `broadcasts/run:${s.id}` : `outbound/${s.id}`)}
          data-testid="source-open"
        >
          {s.name}
        </LinkButton>
```

(`LinkButton` is already imported there.)

`apps/dashboard/src/surfaces/reports/reach-outs.tsx`: add `import { LinkButton } from "../kit/link-button/link-button";` with the other kit imports, and replace

```tsx
                  <button
                    type="button"
                    className="rpt-src"
                    onClick={() => s.to && navigate(s.to)}
                    data-testid="ro-source-open"
                  >
                    {s.name}
                  </button>
```

with

```tsx
                  <LinkButton className="rpt-src" onClick={() => s.to && navigate(s.to)} data-testid="ro-source-open">
                    {s.name}
                  </LinkButton>
```

`apps/dashboard/src/surfaces/reports/google.tsx`: add `import { Field } from "../kit/field/field";` and replace the `<textarea ... />` of `ReviewReply` (from `<textarea` through its `data-testid="google-reply-text"` and `/>`) with

```tsx
          <Field
            aria-label="Your reply to this review"
            rows={3}
            value={text}
            maxLength={4096}
            readOnly={drafting}
            onValueChange={(next) => {
              setText(next);
              if (drafted === "yes") setDrafted(null);
            }}
            placeholder={
              drafting
                ? "The receptionist is writing a draft…"
                : "Thank them, or answer them — it appears on Google under the review, in the business's name."
            }
            data-testid="google-reply-text"
          />
```

`apps/dashboard/src/surfaces/reports/reports-page.tsx`: add `import { Button } from "../kit/button/button";` and `import { Segmented } from "../kit/segmented/segmented";`, and replace the whole `periodRow` function with:

```tsx
/** One row above everything: the period, the days it covers, and a door to ask about them. */
function periodRow(p: {
  R: ReportsSurface;
  busy: boolean;
  failed: ReportPeriodId | null;
  pick: (period: ReportPeriodId) => Promise<void>;
}) {
  const { R, busy, failed, pick } = p;
  const vm = R.vm;
  return (
    <div className="rpt-head">
      {/* While a period loads the control keeps its choice and says so (readOnly), rather than start a second load over the first. */}
      <Segmented
        label="Period"
        value={R.period}
        onValueChange={(next) => void pick(next)}
        options={REPORT_RANGES.map((r) => ({ value: r.id, label: r.label, testid: `period-${r.id}` }))}
        readOnly={busy}
      />
      <span className="rpt-dates" title={`Days follow ${vm.timezone}`}>
        {vm.since} to {vm.until}
      </span>
      {failed && (
        <span className="rpt-failed" role="status" aria-live="polite">
          Couldn't load {REPORT_RANGES.find((r) => r.id === failed)?.label}. Still showing {vm.rangeLabel}.
        </span>
      )}
      <Button
        size="sm"
        className="rpt-ask"
        aria-label="Ask about this period"
        onClick={() => askAbout({ prompt: `What stood out in my last ${vm.rangeLabel}?` })}
        data-testid="reports-ask"
      >
        <Icon name="sparkle" size={13} />
        <span className="rpt-ask-label">Ask about this period</span>
      </Button>
    </div>
  );
}
```

`eslint.config.mjs`: delete the line `  "apps/dashboard/src/surfaces/reports",` from `KIT_PENDING` (its comment above it stays: it lists the surfaces that wait).

- [ ] **Step 4: The rules that fell with the controls**

In `apps/dashboard/src/legacy/styles/reports.css` (each an exact replacement; the rule, written on one line, is what is there today):

1. Delete the rules `.rpt-range { display: inline-flex; }`, `.rpt-range button { ... }`, `.rpt-range button:hover { ... }`, `.rpt-range button.on { ... }` and `.rpt-range button[aria-disabled="true"] { ... }`.
2. Replace `.rpt-range button:focus-visible, .rpt-ask:focus-visible, .rpt-fact-row:focus-visible, .rpt-src:focus-visible { outline: none; box-shadow: var(--focus-ring); }` with `.rpt-fact-row:focus-visible, .rpt-src:focus-visible { outline: none; box-shadow: var(--focus-ring); }`.
3. Replace the two rules `.rpt-ask { margin-left: auto; display: inline-flex; ... }` and `.rpt-ask:hover { ... }` with `.rpt-ask { margin-left: auto; }`.
4. `.rpt-fact-row { display: grid; ... }` becomes `.rpt-fact .rpt-fact-row { display: grid; ... }` (its declarations as they are): the kit's `.link-btn` sets `display: inline-flex` at a specificity of one class, and this rule outranks it rather than rely on which sheet loads last.
5. `.rpt-src { font-size: 13px; ... }` becomes `.rpt-sources .rpt-src { font-size: 13px; ... }` and `.rpt-src:hover { ... }` becomes `.rpt-sources .rpt-src:hover { ... }`, for the same reason.
6. In the Glass block at the foot of the file, delete the four rules `.rpt-range { ... }`, `.rpt-range button { ... }`, `.rpt-range button.on { ... }` and `.rpt-ask { ... }` (the kit's `Segmented` and `Button` are Glass's own capsules), and fix its header comment's first sentence to say the period row stands on the page under the frame's head with the kit's segmented control and Ask's door.
7. In the `@media (max-width: 760px)` block delete `.rpt-ask { padding: 8px 10px; }` (the label's visually-hidden rule `.rpt-ask-label { ... }` stays).
8. Delete the two rules `.rp2-review-textarea { ... }` and `.rp2-review-textarea:focus { ... }`.

- [ ] **Step 5: Run**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/reports eslint.config.mjs tooling/scripts/tests/reports/reports-page.test.mjs e2e/reports.spec.ts
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/back-pages.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/google/google-profile.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/google/review-reply.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/lint-boundaries.test.mjs
corepack pnpm exec eslint apps/dashboard/src/surfaces/reports eslint.config.mjs
corepack pnpm -r typecheck
```
Expected: PASS; ESLint prints nothing for the folder (no raw control is left in `surfaces/reports`, which `rawElementsRule` now covers); `lint-boundaries` holds that `KIT_PENDING` names only folders that exist.

- [ ] **Step 6: Look at it**

Run the app as in Task 11's Step 7, at 1440 and 390, light and dark, on `/w/<slug>/reports` and a lens with a table. Read, and write into the pull request as the list of differences: the period is the kit's segmented capsule with four options (7 days, 30 days, 90 days, Month) where it was a hand-made capsule of three, the chosen one raised, the keys walking it (arrows); a period on its way keeps the choice and dims the body (no second press starts a second load); Ask's door is the kit's small button; a fact with a door, a source's name and a reach-out's name are the kit's quiet link buttons in their old place and size (13px, ink, hover underline for a source); the review's reply box is the kit's field (the record kit's box, a limit of 4096, read-only while the draft is written). Nothing else on the page moves.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/surfaces/reports apps/dashboard/src/legacy/styles/reports.css eslint.config.mjs tooling/scripts/tests/reports/reports-page.test.mjs e2e/reports.spec.ts
git commit -m "Reports draws its controls with the kit, the period a segmented control with Month in it, and leaves the surfaces that wait for their kit step." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: One figure on the page: the strip is drawn with the kit's Figure

**Why:** Reports' `RptTiles` (`dl.rpt-tiles > div.rpt-tile`) is the figure Task 9 designed, so the page has one. The strip's grid, hairline dividers and padding are the page's (`.rpt-figures`, `.rpt-cell`, neither named for a primitive); the figure's label, number, period before and line under are the kit's. Each figure is named by its tile's metric id. Booked's builder is contracts' (`bookedTileOf`, Task 3). Today's figures are not touched.

**Files:**
- Modify: `apps/dashboard/src/surfaces/reports/blocks.tsx`, `apps/dashboard/src/legacy/styles/reports.css`
- Modify (tests): `tooling/scripts/tests/reports/reports-page.test.mjs`, `e2e/reports.spec.ts`, `e2e/today/today.spec.ts`

- [ ] **Step 1: Move the tests to the figure (they fail until Step 2)**

In `tooling/scripts/tests/reports/reports-page.test.mjs`, replace the test `the tiles: five counts, ...` with:

```js
test("the strip's figures: five counts, each named by its metric, the period before said in counts beside the value, booked from the calendar", () => {
  const read = (t) => [
    t.props["data-figure"],
    ...["figure-label", "figure-value", "figure-meta"].map((c) => textOf(cls(t, c))),
  ];
  const figures = (opts) =>
    all(card(page(opts), "reports-tiles"), (n) => n.type === "div" && classes(n).includes("figure")).map(read);
  assert.deepEqual(figures(), [
    ["customer_messages", "Customer messages", "17up from 7", "on 6 of 7 days"],
    ["calls", "Calls", "3none the 7 days before", "7 min on the phone · 1 to voicemail"],
    ["new_people", "New people", "2down from 3", "first contact in this period, by evidence"],
    ["booked", "Booked", "3", "of 8 who asked"],
    ["handovers", "Needed you", "3none the 7 days before", "times the receptionist stopped"],
  ]);
  assert.deepEqual(figures({ booking: { calendar: "none", days: 7, asked: 0, booked: 0 } })[3], [
    "booked",
    "Booked",
    "—",
    "no calendar to read",
  ]);
  assert.deepEqual(figures({ booking: { calendar: "unavailable", days: 7, asked: 4, booked: 0 } })[3], [
    "booked",
    "Booked",
    "—",
    "the calendar could not be read",
  ]);
  const strip = card(page(), "reports-tiles");
  assert.equal(strip.type, "dl", "terms and their values");
  assert.deepEqual(all(strip, (n) => n.type === "dt").length, 5);
});
```

and in `REGRESSION: a tile is a number, what it is and one line under it...` replace `assert.equal(all(tree, (n) => classes(n).includes("rpt-tile")).length, 5);` with `assert.equal(all(tree, (n) => n.type === "div" && classes(n).includes("rpt-cell")).length, 5);`.

In `e2e/reports.spec.ts` (first test) replace the tiles block

```ts
    const tiles = report.getByTestId("reports-tiles").locator(".rpt-tile");
    await expect(tiles).toHaveCount(5);
    const labels = (await tiles.locator(".rpt-tile-label").allInnerTexts()).map((l) => l.trim().toLowerCase());
    expect(labels).toEqual(["customer messages", "calls", "new people", "booked", "needed you"]);
    // A count (or a dash with no calendar), and the period before in counts when it had some: never a percentage.
    for (const v of await tiles.locator(".rpt-tile-value").allInnerTexts()) {
```

with

```ts
    const tiles = report.getByTestId("reports-tiles").locator(".figure");
    await expect(tiles).toHaveCount(5);
    const labels = (await tiles.locator(".figure-label").allInnerTexts()).map((l) => l.trim().toLowerCase());
    expect(labels).toEqual(["customer messages", "calls", "new people", "booked", "needed you"]);
    // A count (or a dash with no calendar), and the period before in counts when it had some: never a percentage.
    for (const v of await tiles.locator(".figure-value").allInnerTexts()) {
```

In `e2e/today/today.spec.ts` replace the comment and the locator `// Reports' messages tile, over the same range, prints the same count (the tiles are one list since #928, each\n    // named by data-tile).` and `page.getByTestId("reports-tiles").locator('[data-tile="messages"] .rpt-tile-value')` with `// Reports' messages figure, over the same range, prints the same count (the strip is one list of the kit's figures, each\n    // named by its metric in data-figure).` and `page.getByTestId("reports-tiles").locator('[data-figure="customer_messages"] .figure-value')`.

- [ ] **Step 2: Run to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-page.test.mjs`
Expected: FAIL (the strip still draws `.rpt-tile`).

- [ ] **Step 3: Draw the strip with the figure**

`apps/dashboard/src/surfaces/reports/blocks.tsx`: replace the contracts type import with

```tsx
import {
  bookedTileOf,
  type BookingReportVM,
  type CampaignSourceVM,
  type ReportFactVM,
  type ReportStripTile,
  type ReportVM,
} from "@chanlytics/contracts";
```

add `import { Figure } from "../kit/figure/figure";`, delete `type StripTile`, its comment (`/** What the strip draws of a tile: ... */`) and the function `bookedTile` with its comment, and replace `RptTiles` with:

```tsx
// The strip: three of the receptionist's counts, the one conversion and the handovers, each the kit's figure with the period
// before in counts beside its value. The answered share and the reply time are the hero's. Each figure is named by its tile's
// metric (contracts report-tiles.ts); the grid, the dividers and the padding are the page's.
export function RptTiles({ vm, booking }: { vm: ReportVM; booking: BookingReportVM | null }) {
  const by = Object.fromEntries(vm.tiles.map((t) => [t.id, t]));
  const tiles = [by.messages, by.calls, by.people, bookedTileOf(booking), by.needed].filter(
    (t): t is ReportStripTile => !!t,
  );
  return (
    <dl className="rpt-figures" data-testid="reports-tiles">
      {tiles.map((t) => (
        <Figure
          key={t.id}
          className="rpt-cell"
          id={t.metric}
          label={t.label}
          value={t.value}
          change={t.compare}
          meta={t.meta}
        />
      ))}
    </dl>
  );
}
```

`apps/dashboard/src/legacy/styles/reports.css`: replace the block from the comment `/* The strip: five counts in one frame with hairline dividers, a list of terms and their values. */` through `.rpt-tile-meta { ... }` (eight rules) with

```css
/* The strip: five figures (the kit's Figure) in one frame with hairline dividers, a list of terms and their values. */
.rpt-figures { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); margin: 0; background: var(--bg-raised); border: 1px solid var(--line); border-radius: var(--radius-lg); }
.rpt-cell { padding: 12px 18px 13px; }
.rpt-cell + .rpt-cell { border-left: 1px solid var(--line); }
```

and in the two `@media` blocks replace the strip's rules:

- in `@media (max-width: 1180px)`: `.rpt-tiles, .rpt .rp2-tiles, .rpt .rp2-tiles.four { ... }`, `.rpt-tile:nth-child(4) { ... }` and `.rpt-tile:nth-child(n + 4) { ... }` become the same three rules with `.rpt-tiles` written `.rpt-figures` and `.rpt-tile` written `.rpt-cell`;
- in `@media (max-width: 760px)`: the same renaming for `.rpt-tiles`, `.rpt-tile:nth-child(n)`, `.rpt-tile:nth-child(even)`, `.rpt-tile:nth-child(n + 3)` and `.rpt-tile:last-child`; and delete the comment `/* Half a phone is narrow for a meta line: ... */` with its `.rpt-tile-meta { ... }` rule (the figure's line under clamps at two lines everywhere).

Both media blocks keep their widths (1180 and 760, held in `breakpoints.json`); no query is added.

- [ ] **Step 4: Run, bank, look**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/reports tooling/scripts/tests/reports/reports-page.test.mjs e2e/reports.spec.ts e2e/today/today.spec.ts
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/today/today-leaks.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
git diff --stat -- tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
corepack pnpm -r typecheck
```
Expected: PASS; the bank removes `reports.css::rpt-tile`, `::rpt-tile-compare`, `::rpt-tile-label`, `::rpt-tile-meta`, `::rpt-tile-value` and `::rpt-tiles` and `::rp2-review-textarea` from `kit-primitives.json`, lowers `reports.css`'s `font` count in `style-values.json` by the two `12px` literals the tile wrote, and rewrites the measured blocks of `docs/debt.md` and `docs/takeover.md`.

Then look at it (Task 11's Step 7), at 1440 and 390, both themes: the strip is five cells in one frame with hairline dividers, 3 columns under 1180 and 2 under 760 as before; each cell reads label (12.5px, muted), number (22px, medium), the period before beside it (now 11.5px, the type scale's step: it was 12px, the one size that was a literal), and the line under it, which wraps at two lines instead of one line cut short; nothing is a tone. These are the differences, for the pull request.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/surfaces/reports apps/dashboard/src/legacy/styles/reports.css tooling/scripts/tests/reports/reports-page.test.mjs e2e/reports.spec.ts e2e/today/today.spec.ts tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
git commit -m "Reports' strip of counts is drawn with the kit's Figure, each named by its metric, and the tile's own rules leave the page." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: The docs, and the verification before the push

**Files:**
- Modify: `apps/dashboard/src/legacy/CLAUDE.md`, `docs/system-prd.md`
- Regenerate/bank: `tooling/scripts/tests/baselines/*.json`, `docs/debt.md`, `docs/takeover.md`, the lint and dead-export baselines

- [ ] **Step 1: The docs say what moved**

`apps/dashboard/src/legacy/CLAUDE.md`, in the paragraph "**Charts** are one kit": replace the sentence `Reports itself is \`../surfaces/reports/\` (the page in \`reports-page.tsx\`, everything the period scopes in \`sections.tsx\`, Google in \`google.tsx\`);` with

```
Reports itself is `../surfaces/reports/`: one page of six lenses at `reports[/<lens>]` (the page in `reports-page.tsx` following its own address, the addresses and the frame's strip in `chrome.ts`, the head's sentence in `head.ts`, each lens's body in `lenses/`, Google in `google.tsx`; the lenses are contracts' `REPORT_LENSES`, and one read draws them all, held by period);
```

and in the "Routes" paragraph, after `People's scopes People | Leads | Pipeline are \`surfaces/people/chrome.ts\`'s, with no strip of their own on the page, so they stand, glide, warm and swipe as the Inbox's do)` add `; Reports' lenses are \`surfaces/reports/chrome.ts\`'s, from the lens registry, drawn the same way`.

`docs/system-prd.md`, the Reports row of the surfaces table (its columns are the surface, its address, what it shows and what a person does): replace its address cell `` `#/reports` `` with `` `/w/<slug>/reports[/<lens>]` ``, its third cell (what it shows) with

```
One row for the period (7, 30 or 90 days, or the month so far), its dates and Ask, over one page of six lenses, each at its own address (`/w/<slug>/reports/<lens>`, the Overview at `/w/<slug>/reports`; contracts `REPORT_LENSES`): Overview (the receptionist's share beside Worth knowing, five figures in counts against the period before), Receptionist (who answered and how fast, why it stopped, calls, asked then booked), People (where and when they reach the business), Pipeline (deals, only where they are on), Campaigns (sent, and the reach-outs) and Reviews (Google). The frame's strip draws the lenses and one read draws them all. `report_series` v5 (00304) and `campaign_series`, called from `packages/db`, over `period=7d|30d|90d|month`; every sentence from the view model
```

and its fourth cell (what a person does) with `Change the period; move between lenses; ask about the period; every fact and row a door; a table and a CSV on each chart; answer reviews`. Then `corepack pnpm exec prettier --write docs/system-prd.md apps/dashboard/src/legacy/CLAUDE.md` (the cells are shorter than the table's widest, so only this row changes; check with `git diff --stat docs/system-prd.md`).

- [ ] **Step 2: Everything that is not a test of a file**

```bash
corepack pnpm --filter "./packages/*" build
git status --short packages
corepack pnpm -r typecheck
corepack pnpm lint
corepack pnpm check:dead-exports
corepack pnpm format:check
```
Expected: no dist drift after the Task 8 commit (`git status --short packages` empty); typecheck, lint and format clean; `check:dead-exports` clean (every export this plan added has a reader: `LENS_ROUTES` Ask's routes; `lensOf`, `lensEmpty`, `lensesFor`, `lensIsShown`, `lensOfRoute`, `lensRoute`, `isLensParam` the chrome, the page and the palette; `bookedTileOf` the strip; `fixedDaysOf`, `monthDaysAt`, `reportPeriodOf`, `reportDaysAsked`, `isReportPeriod`, `REPORT_PERIOD_DEFAULT` the routes, the surface, the sample and Ask; `Figure` the strip). A fall is banked with `corepack pnpm lint -- --update` and `corepack pnpm check:dead-exports -- --update`; a number that rose is a stop, not a bank.

- [ ] **Step 3: The ratchets bank what fell**

```bash
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
git diff --stat -- tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
```
Expected: only falls: `tables.json` (three entries, Task 7), `kit-primitives.json` (the tile's and the textarea's classes), `style-values.json` (`reports.css`'s two `12px`), possibly `breakpoints.json` where a held width's last rule left, and the measured blocks of the two docs. Nothing rose; if the ratchets name a rise, find what added it and remove it before going on.

- [ ] **Step 4: Reports' tests, and the tests of what this branch changed**

```bash
for f in $(find tooling/scripts/tests/reports -name "*.test.mjs" ! -name "*.db.test.mjs" ! -name "*.integration.test.mjs" | sort); do node tooling/scripts/checks/test.mjs "$f" || break; done
node tooling/scripts/checks/changed-tests.mjs --list origin/main HEAD
```
Run each file the second command lists, one per command (`node tooling/scripts/checks/test.mjs <file>`); expected all PASS. The list holds, at least, the Ask, kit, shell, google, calendar, today, people and routes files this plan touched, and the rules and ratchets it always runs. The database suites (`*.db.test.mjs`) are not run here: no migration changed, and CI's replay runs them only when database paths change.

- [ ] **Step 5: The build, the bundle, the journeys**

```bash
df -h .
corepack pnpm --filter @chanlytics/dashboard build
corepack pnpm check:bundle
E2E_BASE_URL=http://localhost:3100 corepack pnpm e2e -- e2e/reports.spec.ts e2e/today/today.spec.ts
corepack pnpm e2e:local -- e2e/kit/kit.spec.ts --scenario=kit
corepack pnpm e2e:local -- e2e/kit/kit-behaves.spec.ts --scenario=kit
```
Expected: the build and `check:bundle` pass within the workspace route's budget (it prints the figures: say them in the pull request). If it reports growth past the band, raise by the gzipped growth with `corepack pnpm check:bundle -- --raise js=<bytes>` in this change and a row under "Rises" in `docs/debt.md` arguing it (the lens modules and `Figure`; Base UI's tooltip and segmented parts are in the route already, drawn by Campaigns and People), never to what was measured; a fall is banked with `-- --update`. The Reports and Today specs need the local dashboard running with the session minted as `docs/runbook.md` ("See a real page") and `e2e/session.ts` say; the kit specs run on the harness. Then delete this worktree's `apps/dashboard/.next`.

- [ ] **Step 6: Commit what the verification changed**

```bash
git add apps/dashboard/src/legacy/CLAUDE.md docs/system-prd.md tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
git commit -m "The docs say Reports is one page of six lenses, and what fell in this phase is banked." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## What phase C starts from

When this branch lands, Reports is one page of six lenses on `reports/[[...lens]]`, holding exactly today's sections, each in its own file under `surfaces/reports/lenses/`, drawn from one read the `reports` surface holds by period (`7d`, `30d`, `90d`, `month`); `GET reports`, `reports/campaigns` and `reports/reach-outs` take `period` (and `days` until 19 October, a test holds the day) and call `packages/db`; the registry (`contracts/src/reports/lenses.ts`) is where a lens joins (Calendar, Usage and Leads each in the PR that draws its first tile: a row, a `shownWhen`, its `empty` words, and its body in `lenses/`), and its `shownWhen` is where Campaigns and Reviews narrow to the spec's rules. Each tile builder names its figure from one closed set in `report-tiles.ts`; a figure's definition (the spec's registry words) joins as the `definition` the kit's `Figure` already takes, with its `n`/`minN` greying for the first ratio a lens draws. The lens strip, its crumbs and the head are in place; `lensAnswerOf` is where a lens's own headline sentence grows. The kit has `Figure` and one download helper, the recorder says what it can draw, and Reports is out of `KIT_PENDING`.

What phase C finds waiting: **Today's figures** (`today/pages/card.tsx` `figuresRow`, `TodayFigure`) are the next user of `Figure` and are not touched here; **PR 2** ("Today's reads": the small read, the `__REPORTS` mirror's deletion, the reply-speed sentence against the hold) and **PR 3** (`person_moments.new_at`) are separate; **one read per lens** (`report_<lens>` and its route) replaces the shared read lens by lens, with `Overview` tiles per lens from a headline read; the strip's chosen tab is not centred on a phone (that is `surface-tabs.jsx`, frozen here); Ask's context still reads days, and Ask's `lens` parameter and eval case are phase C's.

## Self-review

**Spec coverage (phase B, the part with no database change):**

| Spec | Where |
| --- | --- |
| §5 B: addresses, the lens registry, the head, the strip, periods, today's sections moved unchanged, the metric ids, Figure | Tasks 8, 11, 4 to 6, 10, 3, 9 and 13 |
| §5 B: the headline read (Today switches) | **Not here:** PR 2 |
| §6.1 addresses: `[[...lens]]`, `takes`, `mount`, `chrome`; `reports/overview` no address; a lens not shown draws its empty state | Task 11 (`takes`, `mount`, `chrome`, `reports/overview` not found, `LensEmpty`); the period in the address is not built, as the spec says |
| §6.1 the period kept per lens in `localStorage` | **Changed:** one period for the page (Task 6), as today's, because the lenses all draw from one read held by period; per-lens periods wait for per-lens reads (phase C) |
| §6.2 the registry, "shown when", roles | Task 8 (six rows, `shownWhen`, `Role`); Pipeline shown where deals are on (`dealsAreOn`), decided at first paint from `workspaceOverride` and `ROUTE_WAITS.reports`; the "and a deal was ever recorded" half is the lens's empty state, not a hidden tab (Calendar, Usage, Leads join in phase C) |
| §6.3 the head says Reports and the lens's headline; the strip is links; the period is `Segmented`; "Ask about this lens", the Menu | Tasks 11, 12 (head, links from the frame, `Segmented` with Month). **Not here:** "Ask about this lens" and the lens Menu (phase C); a phone's single capsule; `SubTabs href` (dropped: the frame's strip is the one, #1412); the chosen tab centred |
| §6.4 one read per lens, readers, contracts per lens | **Not here** (phase C); the SQL called by name moves into `packages/db` (Task 7) |
| §6.5 the headline read and Today | **Not here:** PR 2 |
| §6.6 live refresh per lens | **Not here:** the surface keeps its one `onlyOnItsPage` refresh |
| §6.7 Ask, ⌘K and citations | Task 8: the palette and Ask's page routes derive from the registry; citations already take one segment under `reports`. **Not here:** Ask's `lens` parameter |
| §7 the metric registry | Task 3 as the closed set of ids a tile builder declares; words, definitions, windows, sources and roles join with their first reader (a tooltip, Ask) |
| §8 Figure; Charts on pane roles; Meter `pace`, Funnel, HeatGrid, DotPlot, DotMap | Task 9 and 13 (Figure, without `n`/`minN`). **Not here:** charts on pane roles and the rest (phase C) |
| §12 A5 ("1 days") | Task 4's `plural` for a one-day Month; the rest of phase A is on main |
| §13 testing: moves equal by value; the page's e2e; registry test | Task 10 (by value), Tasks 11 to 13 (`reports.spec.ts` per lens, the strip, the period), Tasks 3 and 8 (the ids and the registry) |
| §15 rollout: B lands with the lenses holding exactly today's sections | Task 10 and 11; Reviews and Pipeline draw an honest empty where they drew nothing |

**The brief's sixteen points:** 1 (address per lens, People's way, no change to `surface-tabs.jsx` or `app-shell.jsx`) Task 11; 2 (six lenses, derived lists) Task 8; 3 (Pipeline's "shown when" from the boot's workspace list, through an import) Tasks 8 and 11; 4 (the head from contracts) Tasks 8 and 11; 5 (`REPORT_RANGES` extended, one parameter, `days` dated) Tasks 4 and 5; 6 (held views by period, no window reads, no new mirror) Task 6 and 11; 7 (sections moved, proved by value, no recorded fixture) Task 10; 8 (metric ids) Task 3; 9 (kit step, six controls) Task 12; 10 (Figure once, Tooltip, door props, gallery, type test, RptTiles) Tasks 9 and 13; 11 (one download helper) Task 2; 12 (SQL into `packages/db`, `tables.json`) Task 7; 13 (Ask and the palette) Task 8; 14 (the recorder) Task 1; 15 (breakpoints) no query added, falls banked in Tasks 13 and 14; 16 (verification) Task 14.

**Placeholders:** none. Where a task moves code it names the function and the file it comes from, and a test (or the tests that already hold it) proves the move.

**Type and name consistency, checked by reading:** `ReportPeriodId` (Task 4) is what `reportsSample`, `keepReportPeriod`, `setReportRange`, `ReportsSurface.period`, `periodRow` and `nothingCameIn` take; `LensId`, `LensRow`, `LensRange`, `LensEmpty`, `LensWho` (Task 8) are what `chrome.ts`, `head.ts`, `lenses/shared.tsx` and `google.tsx` import; `LensProps` (Task 10) is what the six bodies and `lensBody` take; `ReportStripTile` and `bookedTileOf` (Task 3) are what `RptTiles` (Task 13) reads; `FigureProps["door"]` is the kit's `PressAct | PressDoor`.
