# Lead Finder Release B (the product) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: the shape, not the full plan.** PRD v3 §14 says release B "is written in full once release A is measured (its shape today is the v2 sub-plans 1c and 1d with the release C items taken out)". This is that shape, corrected against origin/main `fbc5d871` (19 September 2026): every task names its anchors on main by file and line, every v2 code block that survives is here with its corrections, and every task that is still a sketch says so in its heading with what the full version must add. Whoever writes it in full after release A starts from a true document, not from v2.

**Goal:** An owner describes the businesses they want in words on the Leads scope of People; Claude proposes the plan as a sentence whose words are pickers; the server runs it in rounds under hard caps (release A); the page shows the run, the question after 25 and one ending from the closed set; the owner works what was found in Qualified, Needs review and Excluded, with a peek that says what was seen and what Claude read, a draft that opens in their own mail app, a call from their own phone with six outcomes, Not a fit, kept searches, the first day's suggestions, the phone; and a converted lead's yes comes only from them, permanently.

**Architecture:** Release B builds on release A's interface (`docs/plans/2026-09-19-lead-finder-A-interface.md`: migration 00139, the contracts `lead-search.ts` and `lead-judge.ts`, the runner, the routes marked A in PRD §12.6). It adds one migration (the next free number at build time), the contracts module `leads.ts` (words, view models, request schemas), the rest of §12.6's routes behind `route()` policies, two Ask tools and the `lead_search` card, two gateway purposes, a `leads` surface in `legacy-bridge` that mirrors People's (`peopleLoaded`/`publishPeople`/`keepSavedView`, keyed by view), a courier of named functions, the People table lifted into `pages/people-table.jsx` and parameterised by its column list, and the Leads scope of `clients-a.jsx` drawn hookless on that table with three new legacy files (`leads-scope.jsx`, `leads-finder.jsx`, `leads-peek.jsx`) and one stylesheet. The seeded `pages/leads.jsx` is retired. Every screen is pinned by a rendered-page test on the people-honest harness, and the nightly proves the seeded state on production.

**Tech Stack:** TypeScript 5.7, zod 4, Next.js route handlers (`apps/dashboard/src/server/route.ts`), Supabase Postgres (RLS, plpgsql), the edge's model gateway (`apps/edge/api/admin/llm.ts`, `apps/edge/lib/ask-gateway.ts`), the legacy React pages (Babel, no bundler; hookless components on the tests' stub React), `node:test` under `tsx`, Playwright for the nightly.

---

## What changed since v2

Each line names the v2 text it replaces (`docs/plans/2026-09-18-lead-finder.md`, its line numbers as of 18 September) and the anchor on main that forced it.

1. **The migration numbers.** v2:19–20 gave 1a `00137` and 1b `00138`. Both are taken on main (`supabase/migrations/00137_their_own_message_is_one_they_sent.sql`, `00138_a_person_says_where_they_came_from.sql`). Release A takes `00139`; release B takes the next free number at build time, re-listed immediately before pushing.
2. **The commit trailer.** v2:39 ended commits with `Claude Opus 5`. Commits here end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
3. **The table is lifted out, not exported.** v2:6923 said Phase 0 keeps the table in `clients-a.jsx` and exports it with `Object.assign(window, { PeopleTable })`. On main nothing exports it (`clients-a.jsx:2029` exports `NewListRow, AddPersonButton, DeleteListButton` only) and the helpers close over `PL_COLUMNS` (`PL_SORT_KEYS` :1148, `plDrawnColumns` :1159, `plColumnChoices` :1233, `plColumnOptions` :1240). Task 1 lifts `pages/people-table.jsx` and parameterises them by the column list.
4. **The column shape.** v2:6929 gave `LEAD_COLUMNS` the keys `key, label, sortable, pinned, on, cell`. Main's shape is `{ key, label, sortable, pinned, fixed, on, needs, cell(p, ctx) }` (`clients-a.jsx:1106–1146`): `fixed` is the actions column nobody may hide (`plLocked` :1151), `needs` a column the workspace may lack (Visits :1123), `on` a default or a function of the ctx (:1139).
5. **Where Leads' state lives.** v2:6921 kept `LeadsScope({ route, onNavigate, onOpenPerson })` and `ClientsA({ scope, leadsRoute })`. On main `ClientsA` is one line that picks real or seed (`clients-a.jsx:2025`), and people-honest draws `window.ClientsA` directly (`tooling/scripts/tests/people-honest.test.mjs:258`) on a stub React that keys hooks by call order, so `LeadsScope` is hookless and its state is `ClientsAReal`'s hooks, declared unconditionally in both scopes (Task 2).
6. **The Leads view rides on People's views.** v2 named `PUT views/leads` and no saver. On main the saver is `plViewSaver` (`clients-a.jsx:680–700`) with the page name `"people"` spelled inside it (:696) and the views come with the People surface (`surface-data.ts:751, :764`, `__PEOPLE.views`). Task 2 parameterises the saver by page, saves `views.leads` as `{ list, sortBy, sortDir, columns }` every time, through `__saveView("leads", …)` (`people-detail.ts:194`) and `keepSavedView` (`surface-data.ts:660`), one save at a time. The 2,000-character limit is the route's (`apps/dashboard/app/api/v1/views/[page]/route.ts:26`).
7. **One keyboard listener, with Esc's order corrected.** v2:6944 said Esc closes the peek, then the finder, then clears the selection. Main's one listener (`clients-a.jsx:1818–1857`) already closes the Columns menu on Esc before anything else (:1831–1832). Task 2 makes the order: the peek, then the finder, then the Columns menu, then the selection, as branches in that listener reading `keys.current` (:1861), and adds `F` and `C` there and to contracts `SHORTCUTS` (`packages/contracts/src/chrome.ts:149–159`). Never a second listener.
8. **`PL_OVERLAY` names the page's own overlays.** v2 did not touch it. Main's selector (`clients-a.jsx:1563`) keeps `.pl-sheet` and `.pl-cols-menu` out of "what is open over the page"; the peek (`.pl-peek`) and the finder sheet (`.pl-finder`) join that list, or the page's keys would go quiet while either is open.
9. **The phone band is 900px, not 720.** v2:7055 folded the rail under 720px and PRD §6.6 says "≤ 720px". Main's cards are `@media (max-width: 900px)` (`clients.css:1787–1802`), the Columns menu hides at 900 (:1778), the listener judges the menu at 900 (`clients-a.jsx:1831`), the desktop rules are `(width > 900px)` (`clients.css:1783`, :1823). Only the lists sheet's opener uses 720 (`clients-a.jsx:1584`). Task 18 draws the phone at ≤900px with lead grid areas; PRD v3 §6.6 was corrected to say so on 19 September (cards at 900px and under; 720px is the phone's slim bar).
10. **The Leads surface reads by view (E8).** v2:6851–6880 re-read page one on every refresh and `leadsMore` appended after a view change. Task 3 keys every read by workspace, search, list, chips and sort, ignores a superseded answer, patches changed rows and keeps loaded pages, selection and cursor, and offers new results ("12 new"), never re-sorted under the owner.
11. **Undo is a server record (E9).** v2:5990–5993 and :6889–6894 sent "previous" rows (`LeadRestoreSchema`, `LeadBulkRestoreSchema`, `__leadRestore`, `__leadsBulkRestore`). Release A's `lead_undo(p_op_id, p_version)` and `POST lead-operations/[id]/undo` replace them: the client sends only the operation id and the version it saw. `leads/[id]/restore` and `leads/bulk/restore` are gone.
12. **Bulk acts on ids or the view's filters (S13).** v2:5992's `LeadBulkSchema { ids, action }` becomes `{ action, ids } | { action, view }`: the header box selects the loaded rows that match; "Select all 1,240 that match" hands the view to the server.
13. **Put back, Keep and Exclude are the owner's (S9).** v2:6459 made `leads/[id]/put-back` an operator route. Release A ships `POST leads/[id]/keep|exclude|put-back` with permission `find`; Task 11 draws them for owners and shows them disabled to operators with the gate's sentence (`window.gate`, `data-bits.jsx:266`).
14. **A stage click never converts.** v2:5945 mapped `{ kind: "stage", stage: "converted" }` to a conversion and :7079 toasted "<name> is in People now" on Talking. PRD §9.6 and the review's "Not adopted" 3: a lead becomes a person only on a real conversation (an Interested call, or a write-in); marking Talking by hand keeps the lead a lead and the stage says so.
15. **Not a fit keeps the question and "Already a customer"; the learning is C.** v2:5957 and :7085 taught `lead_preferences` from three of the five reasons. Task 15 asks why and suppresses on "Already a customer"; the "you said" chips and the scoped learning are release C.
16. **`AppError` has no `upstream`.** v2:6218–6230 threw `AppError("upstream", …)`. The codes are `errors.ts:6–30` (`upstream_anthropic` 502, `rate_limited` 429, `validation`, `conflict`), the constructor `(code, message, status?, details?)` (:41). Task 4's `askForJson` uses `upstream_anthropic`.
17. **Two gateway purposes, not three; the format is stripped today.** v2:6295 listed `["ask", "lead_draft", "lead_suggest", "chips"]`. `chips` is C. On main `llm.ts:53` refuses any purpose but `"ask"`, and `validateGatewayRequest(raw)` (`ask-gateway.ts:144`) takes one argument and keeps only `effort` from `output_config` (:169–170): a JSON-schema format never reaches the model. Task 5 adds the second argument and the format for the two purposes. Both draw on Ask's one daily budget (`ASK_TOKENS_DAY`, `llm.ts:68–70`; `ASK_USAGE_KIND`, `ask-gateway.ts:17`); Task 4 says how they are capped.
18. **Two Ask tools, not three.** v2:6395–6437 added `search_leads`, `list_lead_searches` and `propose_lead_search`. `search_leads` is C. Today the count is 24 (14 in `tools.ts`, `finish` at :150 included, and 10 in `proposals.ts`) against `GATEWAY_MAX_TOOLS = 40` (`ask-gateway.ts:141`); the test allows 36 (`ask.test.mjs:599–606`); 26 after B.
19. **`PROPOSAL_GATE.lead_search = "find"` needs the permission first.** v2:5779 recorded it. On main the map's type is `Record<AskProposal["kind"], "approve" | "autonomy" | "settings" | "team">` (`packages/contracts/src/ask.ts:393`) and `ROLE_PERMS` has no `find` (`config.ts:21`). Release A adds `find` to `ROLE_PERMS` and `PERM_DOING` (`refusal.ts:199`); Task 6 widens the gate's type and the pin at `ask.test.mjs:375` changes value.
20. **`roleGate(role, perm, doing?)`.** v2:5794 wrote `roleGate("find", "operator")`. Main's order is role first (`refusal.ts:215`): `roleGate("operator", "find").reason === "Only an owner can find leads."`.
21. **The composer's scope is the page.** v2:6966 posted the Ask turn "with People · Leads as its scope". `scopeFromRoute("clients", "leads:…")` returns null on main (`ask.ts:483–489`: only a uuid on `clients` is a scope), so the composer sends `scope: null` with `surface: "clients"` (`legacy-bridge/ask/api.ts:89`) and names "Leads" itself. `scopeFromRoute` is not changed.
22. **The consent doors refuse permanently, on the 00137 signatures.** v2's 1a restated `set_contact_consent` with `lead_consent_quarantine_days` and 1c Task 7 (v2:6544) pinned a 90-day sentence. Decision 19 makes it permanent. Task 4 `create or replace`s exactly `set_contact_consent(uuid, text, text, text, uuid)` (`00137:165–171`) and `set_marketing_consent(uuid, uuid, text, text, text, jsonb, uuid)` (`00137:45–53`), never 00043's four-argument one (dropped at `00137:163`).
23. **Decision 20 is done in #675.** v2:6536 said the desk's `customer_message` was taken from any operator without the message. Since 00137 both doors take `p_message_id` and both routes accept `message_id` (`contacts/[id]/consent/route.ts:10, 48–50`; `marketing-consent/route.ts:10, 63–65`). Task 7 tests the converted-lead refusal on that door; it does not rebuild it.
24. **The bell has kinds.** v2 named the bell without kinds. Task 4 adds `leads_ready` and `leads_question` to 00134's CHECK (`00134:15–17`), `SERVER_NOTIFICATION_KINDS` (`notifications.ts:187`), `SERVER_LOOK` (:211) with icons existing kinds draw, and `schema-sets.generated.ts` (:74).
25. **The routes schedule nothing.** v2:6150–6190 gave the routes a ledger seam (`lead-jobs.ts`, `scheduleOnce`, `afterStop`) with the job kinds `lead_search_start | lead_search_collect | lead_verify`. Release A's doors insert their own jobs (`lead_round_start | lead_collect | lead_check`), so the seam is dropped and B's routes call doors only.
26. **The route list.** v2:6440–6470 wrote 17 routes. Release A ships `POST/GET lead-searches`, `GET lead-searches/[id]`, `/answer`, `/more`, `/stop`, `GET leads`, `POST leads/[id]/keep|exclude|put-back`, `POST lead-operations/[id]/undo`. B ships `PATCH/DELETE lead-searches/[id]`, `POST leads/[id]/stage`, `/draft`, `POST leads/bulk`, `DELETE leads/[id]`, `GET leads/export`, `GET/PUT lead-suggestions`. `restore`, `bulk/restore` and the search's own `undo` route are gone; `chips` is C.
27. **The registry and shell anchors moved.** v2:6785 cited `surface-registry.ts:34-44, :180-200` and v2:6790 `app-shell.jsx:401-455`. On main: `leads: "demo"` :42, `ROUTE_SURFACE` :85–118 (`clients: "people"` :89), `routeSurfaceFor` :168, `SURFACE_RETIRED` :193–196; the shell's `clients` branches :401–438, the `leads` branch :439–454, the retired redirect :686–689.
28. **The nightly may run a real search.** v2:7066 said "No search is ever started by the nightly; the platform switch is not touched". Decision 30 lists the test workspace in `lead_platform.tenants_on`, so a real search can run there; it runs only behind `E2E_PAID_LEADS=1`, modelled on `E2E_PAID_MODEL` (`e2e/ask.spec.ts:18–19`, absent in `nightly-e2e.yml:105`). The seed rows live beside `PEOPLE` in `tooling/scripts/e2e-workspace.mjs:66`; the checks in `e2e/signals.ts`.
29. **The old bookmark test changes value.** `e2e/people.spec.ts:150–155` pins `#/leads` landing on `#/clients`; `calendar-people.test.mjs:506` pins `leads: "clients",`. Both assertions' values change to `clients/leads` (v2:6913 had the second).
30. **The seeded stages are not the real ones.** `people-data.jsx:6` (`LEAD_STAGES`: `ready | qualifying | new | nurture | converted | archived`, the mockup's set in `legacy/CLAUDE.md`) is never read by the real scope. The stored set is A's `leads.stage` (`ready | nurture | converted | archived`) with `closed_reason`; the words are B's `LEAD_STAGE_WORDS`.
31. **`SpendWords` may already be A's.** v2 Task 1 (1c, :5800–5830) added `spendWords` to a write and `requireSpend(ctx, member, doing)`. On main `requireSpend(ctx, member)` (`with-route.ts:242`) calls `whyCannotSpend(mode, status)` (:253). Release A's `POST lead-searches` spends; if A shipped it saying "buying a number", Task 4 carries v2's code; if A added the words, Task 4 skips it.
32. **The interface's `leads_page` has no list argument.** `leads_page(p_tenant_id, p_search_id, p_class, p_sort, p_after_key, p_limit)` filters by class; PRD §6.1's rail lists (Ready, Contacted, Talking, Said no, Not a fit) are stage lists. Task 4 `create or replace`s it with `p_list` appended and the column sorts added to its sort keys, and adds `lead_list_counts`.
33. **Where the strip's Undo gets its operation.** Release A's `lead_undo(p_op_id, p_version)` and the kind `undo_search` exist, but no view says which operation a finished round's Undo names. Task 4 adds `undo_op_id, undo_version` to `lead_searches_view`.

## How to read this plan

**The spec** is `docs/plans/2026-09-17-people-table-and-lead-finder.md` (PRD v3). Section numbers below are its. **The interface** release A ships is `docs/plans/2026-09-19-lead-finder-A-interface.md` (names and shapes win there; the PRD wins for behaviour). **The review** is `docs/plans/2026-09-18-lead-finder-review.md` (E8, E9, P1–P5, S9, S12, S13, S16, and the gates G4, G5). **The design** is the canvas (21 artboards; the PRD's head names it) and its States artboard. **Release C** is `docs/plans/2026-09-19-lead-finder-C-extras.md`: none of it is built before owners use this release.

**Written in full** here: Task 1 (the lifted table), Task 3 (the surface and courier), Task 4's contracts, doors and routes, Task 5 (the gateway), Task 6 (Ask), Task 7 (the consent paths), Task 20 (the retired page's readers). **Sketches** (heading suffix "(sketch: written in full after release A)"): Task 2's components and Tasks 8–19 and 21. A sketch carries its props, its state machine where v2 had one, what it draws, what test proves it, and a list of what the full version must add: anchors, tests, expected outputs.

**House rules this plan keeps, everywhere** (v2:13–39, carried over with the numbers corrected):

- **Never add a `readCode(`/`readRaw(` assertion.** `source-scan-ratchet.test.mjs` counts them per file; a count may only fall. Every new test here runs code: real functions, a route's `run`, a page on the stub React. Where an existing pin's *value* changes (`PROPOSAL_GATE` at `ask.test.mjs:375`, `leads: "clients",` at `calendar-people.test.mjs:506`, the four `readCode` reads of `clients-a.jsx` at `calendar-people.test.mjs:509, 600, 642, 702` whose strings may move into `people-table.jsx`), the assertion is edited, not added.
- **Migrations:** take the next free number and **re-list `supabase/migrations` immediately before pushing**; two sessions have taken the same number and the CLI skips the second silently (`migrations.test.mjs` fails duplicates). `00138` is in production (19 Sep); release A writes `00139`; this release writes the next free number when it is built. **The agent runs the production `db push` (Ruben, 18 Sep):** once CI is green, from the PR's branch, a dry run that lists only this release's migration, then `db push --linked --yes` with the cached CLI, a read-back with `db query --linked`, then the merge. If the auto-mode classifier refuses, never reroute: hand Ruben the PowerShell one-liner. Every migration is re-runnable (`if not exists`, `create or replace`, `drop … if exists`).
- **Widening a CHECK set** takes the migration, the contracts list and `schema-sets.generated.ts` (`corepack pnpm gen:schema-sets` with `supabase start`); `schema-sets.ts:69, :85` hold `jobs.kind` and `notifications.kind` equal to their contracts lists.
- **Package dists are committed.** After any change under `packages/`, run `node tooling/scripts/check-dist.mjs`, keep only dists with a real diff (`for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done`), commit them.
- **Tests import `packages/*/src/*.ts` directly**, so a red test is never a stale dist. Tests that import `@chanlytics/contracts` read the dist: rebuild it before believing a red.
- **Legacy JSX:** bump `?v=N` in `apps/dashboard/src/legacy/Chanlytics.html` for every edited file; a new file goes in BOTH `apps/dashboard/src/legacy-bridge/manifest.ts` and `Chanlytics.html` (`legacy-harness.test.mjs:64` holds them together in order); a new stylesheet goes in both `Chanlytics.html` and `apps/dashboard/src/legacy-bridge/legacy.css` (:8–9 is where `clients.css` and `people.css` sit). Lint and build never execute the legacy `.jsx`: render it loaded, and mutation-check that each test fails when the code is wrong. `@container` rules come after what they override.
- **Routes:** every route declares `read(...)`/`write({ scope, role, rate, spend?, input })` (`route.ts:112, :181`); then `UPDATE_ROUTE_POLICY=1 node --conditions=react-server --import tsx --test tooling/scripts/tests/route-policy.test.mjs` and `node tooling/scripts/gen-route-types.mjs`.
- **`emitEvent` kinds are linted from literals** (`event-kinds.test.mjs:38–43` reads the first dotted literal of each `insert into events` in a migration; :30 refuses a kind not in `EVENT_KINDS`, :32 a declared kind nothing writes). Every lead event here is written from SQL; the five kinds join `EVENT_KINDS` (`enums.ts:102`).
- **Fixtures copy the real shape** with fictional values: phones in `555-0100..0199`, every domain under `.example`, place ids `ChIJfixture…`. No token-looking strings: Gitleaks reads every commit.
- **Commands** here are for the agent's Git Bash. A step the owner runs is a PowerShell 5.1 one-liner (no `&&`, `git -C`, `$env:NAME='…'` first).
- **Commits:** one sentence in the house voice, no prefix, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Every PR is green on `corepack pnpm -r typecheck`, `corepack pnpm lint` and `corepack pnpm test`; `next build` runs once, before merge.
- **The page's rules** (`apps/dashboard/src/legacy/CLAUDE.md:60, :64, :65`): one keyboard listener for the page's life reading a keys ref; a saved view replaced whole, every key every time, one save at a time; the table and its Columns menu hookless with their state the page's; a phone shows the work first, with nothing above the rows but the strip.

**Test commands:**

- One file: `node --conditions=react-server --import tsx --test tooling/scripts/tests/<file>.test.mjs`
- Whole suite: `corepack pnpm test`
- DB tests: `supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector`, then export `SUPABASE_URL=http://127.0.0.1:54321` and the keys from `supabase status -o env`, then the file as above (`*.db.test.mjs` refuses a URL that is not this machine).
- Types from the database: `corepack pnpm gen:db-types`, checked by `corepack pnpm check:db-types`.
- The nightly locally: `E2E_BASE_URL=<preview> corepack pnpm e2e -- e2e/leads.spec.ts`.

## File structure

| File | Responsibility | Task |
|---|---|---|
| Create `apps/dashboard/src/legacy/pages/people-table.jsx` | `PeopleTable`, `PeopleColumnsMenu`, `plLocked`, `plShows`, `plSortKeys`, `plDrawnColumns`, `plColumnChoices`, `plColumnOptions`, `PL_NO_SEL`, all taking the column list; `noun`; `Object.assign(window, …)` | 1 |
| Modify `apps/dashboard/src/legacy/pages/clients-a.jsx` | The table gone from it; `PL_COLUMNS` stays; `ClientsA({ scope, leadsRoute })`; the `People | Leads` tablist; the Leads scope's state, keys and view; `PL_OVERLAY` | 1, 2 |
| Modify `apps/dashboard/src/legacy-bridge/manifest.ts:55`, `Chanlytics.html:93`, `legacy.css:9` | `people-table.jsx` before `clients-a.jsx`; the three lead files after `client-profile.jsx`; `leads.css` after `people.css`; the seeded `leads.jsx` gone (:61, :95) | 1, 2, 20 |
| Modify `tooling/scripts/tests/people-honest.test.mjs:219`, `person-honest.test.mjs:183`, `refusals-on-the-page.test.mjs:239`, `calendar-people.test.mjs:509, 600, 642, 702` | Import `people-table.jsx` before the page; re-point the `readCode` strings that moved | 1 |
| Create `apps/dashboard/src/legacy-bridge/leads.ts` | `leadsOverride` (the surface, keyed by view), `window.__LEADS`, `installLeadsCourier` | 3 |
| Modify `apps/dashboard/src/legacy-bridge/LegacyApp.tsx:19, :32, :59, :104`, `refresh-map.ts:41`, `surface-registry.ts:42, :85, :193`, `packages/db/src/realtime.ts:24` | Register the surface and courier; the lead routes patch the surface; `leads` real and fed; the old route lands on `clients/leads`; the lead tables watched | 3 |
| Create `supabase/migrations/<next>_the_leads_are_worked.sql` | The doors: stage and outcome, bulk, erase, export mark, `lead_suggestions`, `leads_page` with `p_list`, `lead_list_counts`, the view's undo fields, the bell's two kinds, the five events, the consent doors' refusal | 4 |
| Create `packages/contracts/src/leads.ts`; modify `enums.ts:102`, `notifications.ts:187, :211`, `ask.ts:379, :393`, `chrome.ts:149`, `schema-sets.generated.ts` | The sets, the words, the VMs, the request schemas, `leadsRoute`/`parseLeadsRoute`, `stageArgs`, the draft's foot; the kinds; the gate; the keys | 4, 6 |
| Create `apps/dashboard/src/server/leads.ts`, `model-json.ts`; modify `rate-limit.ts:141`, `service.ts` | The routes' shared work; one structured answer through the gateway; four rate buckets; `saveLeadSuggestions` | 4 |
| Create the route files under `apps/dashboard/app/api/v1/{lead-searches/[id],leads/[id]/stage,leads/[id]/draft,leads/[id],leads/bulk,leads/export,lead-suggestions}` | Policies and thin handlers | 4 |
| Modify `apps/edge/api/admin/llm.ts:53`, `apps/edge/lib/ask-gateway.ts:132–170` | `GATEWAY_PURPOSES`; a JSON-schema format for the two that are not Ask | 5 |
| Modify `apps/dashboard/src/server/ask/{tools,proposals,prompt}.ts`, `legacy-bridge/ask/commit.ts:62, :156`, `legacy/pages/ask-turn.jsx:122–124` | `propose_lead_search`, `list_lead_searches`; the rules; the card's commit, undo, kind, icon and link | 6 |
| Create `apps/dashboard/src/legacy/pages/leads-scope.jsx`, `leads-finder.jsx`, `leads-peek.jsx`, `styles/leads.css` | `LeadsScope`; `LeadFinder`, `LeadPlanCard`, `LeadStrip`, `LeadsFirstDay`; `LeadPeek`, `LeadShape`; the styles and the phone rules | 2, 8–19 |
| Delete `apps/dashboard/src/legacy/pages/leads.jsx`; modify its readers (Task 20's list) | Retire the seeded page | 20 |
| Modify `tooling/scripts/e2e-workspace.mjs:66`, `e2e/signals.ts`, `e2e/people.spec.ts:150`; create `e2e/leads.spec.ts` | The seed, the checks, the nightly | 21 |
| Create tests `people-table.test.mjs`, `leads-bridge.test.mjs`, `leads-vm.test.mjs`, `lead-routes.test.mjs`, `leads.db.test.mjs`, `lead-gateway.test.mjs`, `lead-ask.test.mjs`, `consent-paths.test.mjs`, `consent-paths.db.test.mjs`, `leads-honest.test.mjs`; modify `ask.test.mjs:375`, `calendar-people.test.mjs:506`, `surface-registry.test.mjs:261` | — | all |

## Task 0: a worktree of its own, and what must be on main

- [ ] `git -C cm-leads fetch origin`, `git -C cm-leads worktree add ../cm-leads-product -b feat/leads-product origin/main`, install. Confirm release A is on main and measured: `supabase/migrations/00139_*` present, `packages/contracts/src/lead-search.ts` and `lead-judge.ts` present, `packages/core/src/leads/` present, the A routes in `apps/dashboard/src/client/routes.generated.ts`, `lead_platform.tenants_on` holding the nightly's workspace, and the G2 and G3 records in `docs/plans/2026-09-19-lead-finder-A2-pipeline.md`. Read `clients-a.jsx` as it then stands: the names below are main's at `fbc5d871` and must be checked against the merged code before any component is written.
- [ ] Record the lift of the Leads decision where release A did not already: `apps/dashboard/src/legacy/CLAUDE.md:3–7` (the status paragraph that keeps Leads hidden "until the product is at 100%"), the registry's comment (`surface-registry.ts:36–41`) and `docs/system-prd.md:643` ("leads and pipeline redirect to People"). Ruben lifted it on 18 September for this slice (the PRD's head).

## Task 1: the table lifted out, parameterised by its columns (written in full)

**Files:** Create `apps/dashboard/src/legacy/pages/people-table.jsx` · Modify `apps/dashboard/src/legacy/pages/clients-a.jsx`, `apps/dashboard/src/legacy-bridge/manifest.ts:55`, `apps/dashboard/src/legacy/Chanlytics.html:93`, `tooling/scripts/tests/people-honest.test.mjs:219`, `person-honest.test.mjs:183`, `refusals-on-the-page.test.mjs:239`, `calendar-people.test.mjs:509, 600, 642, 702` · Test `tooling/scripts/tests/people-table.test.mjs`

**What moves, and why it must.** The table and its menu are `clients-a.jsx:1148–1272`: `PL_SORT_KEYS` (:1148), `plLocked` (:1151), `plShows` (:1154), `plDrawnColumns` (:1159), `PeopleTable` (:1170), `plColumnChoices` (:1233), `plColumnOptions` (:1240), `PeopleColumnsMenu` (:1249), `PL_NO_SEL` (:1272). Four of them close over `PL_COLUMNS` (:1106), so Leads could not draw them with columns of its own; the comment above `PeopleTable` (:1161–1169) says it stays in the file "until then". Then is now. `PL_COLUMNS` and every People cell stay in `clients-a.jsx`; the generic parts go to a file loaded before it, and each takes the column list.

- [ ] **Step 1: The failing tests.** On the people-honest harness's stub React (copy its setup, `people-honest.test.mjs:200–262`: the window, the stub, `walk`/`all`/`find`/`byTestId`/`textOf`), loading only `data-bits.jsx` and `people-table.jsx`:

```js
// tooling/scripts/tests/people-table.test.mjs
const T = globalThis.window;
const td = (key, text) => (p) => T.React.createElement("td", { key }, text(p));
const COLS = [
  { key: "name", label: "Person", sortable: true, pinned: true, cell: td("name", (p) => p.name) },
  { key: "state", label: "State", sortable: true, cell: td("state", (p) => p.state) },
  { key: "visits", label: "Visits", sortable: true, needs: (x) => x.withCalendar, cell: td("visits", () => "") },
  { key: "receptionist", label: "Receptionist", sortable: false, on: (x) => !x.withCalendar, cell: td("receptionist", () => "") },
  { key: "email", label: "Email", sortable: false, on: false, cell: td("email", (p) => p.email || "") },
  { key: "actions", label: "", sortable: false, fixed: true, cell: td("actions", () => "") },
];
const ROWS = [{ id: "a1", name: "Ada Example", state: "new" }, { id: "b2", name: "Bo Example", state: "quiet" }];
const table = (over = {}) => T.PeopleTable({ columns: T.plDrawnColumns(COLS, {}, { withCalendar: false }), ctx: {}, rows: ROWS, total: 2, sortBy: "name", sortDir: "asc", onSort() {}, onOpen() {}, filtered: false, onClearFilters() {}, ...over });

test("the helpers take the column list: sort keys, drawn columns, choices and options come from it", () => {
  assert.deepEqual(T.plSortKeys(COLS), ["name", "state", "visits"]);
  assert.deepEqual(T.plDrawnColumns(COLS, {}, { withCalendar: false }).map((c) => [c.key, !!c.off]), [["name", false], ["state", false], ["receptionist", false], ["email", true], ["actions", false]]);
  assert.deepEqual(T.plDrawnColumns(COLS, { email: true }, { withCalendar: true }).map((c) => [c.key, !!c.off]), [["name", false], ["state", false], ["visits", false], ["receptionist", true], ["email", false], ["actions", false]]);
  assert.deepEqual(T.plColumnChoices(COLS, { name: false, actions: false, email: true, state: "yes", junk: 1 }), { email: true }, "only the columns a member may hide, and only booleans");
  assert.deepEqual(T.plColumnOptions(COLS, {}, { withCalendar: true }).map((o) => [o.key, o.on, o.locked]), [["name", true, true], ["state", true, false], ["visits", true, false], ["receptionist", false, false], ["email", false, false]], "the fixed column is not offered; the pinned one is locked");
});

test("the table says its noun: the foot, the select-all label and the row ids follow it", () => {
  const leads = table({ selectable: true, noun: "lead" });
  assert.equal(textOf(find(leads, (n) => n.props?.className === "cl-table-foot")).startsWith("2 leads"), true);
  assert.equal(byTestId(leads, "select-all").props["aria-label"], "Select every lead shown");
  assert.deepEqual(all(leads, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id), ["lead-a1", "lead-b2"]);
  const one = table({ rows: [ROWS[0]], total: 1 });
  assert.equal(textOf(find(one, (n) => n.props?.className === "cl-table-foot")).startsWith("1 person"), true, "person is the default");
  assert.deepEqual(all(one, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id), ["person-a1"]);
});

test("a heading that sorts is a button with aria-sort on its th; an off column carries pl-col-off on its heading and every cell", () => {
  const t = table({ sortBy: "state", sortDir: "desc" });
  const ths = all(t, (n) => n.type === "th");
  assert.equal(ths.find((n) => textOf(n).startsWith("State")).props["aria-sort"], "descending");
  assert.equal(all(t, (n) => n.props?.className === "cl-th-sort").length, 2, "Person and State sort; Visits is not drawn without a calendar");
  assert.equal(all(t, (n) => /pl-col-off/.test(n.props?.className || "")).length, 1 + ROWS.length, "the Email heading and its two cells");
});
```

Mutation checks, each once: make `plSortKeys` read `PL_COLUMNS` (undefined here) and see the first test throw; drop `noun` from the foot and see the second fail; drop `aria-sort` and see the third.

- [ ] **Step 2: The lift.** `people-table.jsx` holds main's `clients-a.jsx:1148–1272` moved as they are, with these changes and no others:

```jsx
// apps/dashboard/src/legacy/pages/people-table.jsx
/* global React, Icon, EmptyState */
// The table for any rows, and its Columns menu, for People and for Leads (a scope of People): the columns they are
// given, what a cell needs (`ctx`), a selection, a keyboard cursor and a way to open a row. Lifted out of
// clients-a.jsx (release B of the lead finder): four of these helpers closed over People's PL_COLUMNS, so Leads could
// not draw the table with columns of its own. Every helper takes the column list. Hookless, as before: the tests'
// stub React keys state by call order, and a list's own controls above the table come and go.
const plLocked = (c) => !!(c.pinned || c.fixed);
const plShows = (c, choices, x) => plLocked(c) || (typeof choices[c.key] === "boolean" ? choices[c.key] : typeof c.on === "function" ? c.on(x) : c.on !== false);
// The keys a view may sort by: the columns whose headings sort.
const plSortKeys = (columns) => columns.filter((c) => c.sortable).map((c) => c.key);
const plDrawnColumns = (columns, choices, x) => columns.filter((c) => !c.needs || c.needs(x)).map((c) => (plShows(c, choices, x) ? c : { ...c, off: true }));
const plColumnChoices = (columns, raw) => {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const c of columns) if (!plLocked(c) && typeof raw[c.key] === "boolean") out[c.key] = raw[c.key];
  return out;
};
const plColumnOptions = (columns, choices, x) => columns
  .filter((c) => !c.fixed && (!c.needs || c.needs(x)))
  .map((c) => ({ key: c.key, label: c.label, on: plShows(c, choices, x), locked: !!c.pinned }));
const PL_NO_SEL = new Set();
// What the table calls its rows: the foot's count, the select-all label, and the row id prefix the page's cursor
// effect reads (document.getElementById(`${noun}-${cursor}`)).
const PL_NOUNS = { person: { one: "person", many: "people", all: "Select everyone shown" }, lead: { one: "lead", many: "leads", all: "Select every lead shown" } };

const PeopleTable = ({ columns, ctx, rows, total, sortBy, sortDir, onSort, onOpen, filtered, onClearFilters, selectable = false, sel = PL_NO_SEL, onToggle = () => {}, onToggleAll = () => {}, cursor = null, onCursor = () => {}, empty = null, scrolled = false, onScrolled = () => {}, noun = "person" }) => {
  const words = PL_NOUNS[noun] || PL_NOUNS.person;
  // … main's body (clients-a.jsx:1171–1229) unchanged, except:
  //   aria-label={words.all} title={words.all}                      (was "Select everyone shown", :1183)
  //   id={`${words.one}-${p.id}`}                                   (was `person-${p.id}`, :1201)
  //   `${total} ${total === 1 ? words.one : words.many}`            (was person/people, :1224)
  //   the empty state's default title stays People's ("Nobody has written or phoned yet.") only when noun is person;
  //   Leads passes `empty` (Task 2), so the default is never drawn for a lead.
};

const PeopleColumnsMenu = ({ open, onOpenChange, options, onPick, buttonRef = null }) => ( /* main's :1249–1271, unchanged */ );

Object.assign(window, { PeopleTable, PeopleColumnsMenu, plLocked, plShows, plSortKeys, plDrawnColumns, plColumnChoices, plColumnOptions, PL_NO_SEL });
```

`clients-a.jsx` loses :1148–1272 and reads them from `window` at its call sites: `PL_SORT_KEYS.includes(remembered.sortBy)` (:1614) becomes `plSortKeys(PL_COLUMNS).includes(…)`; `plColumnChoices(remembered.columns)` (:1618, :1625) becomes `plColumnChoices(PL_COLUMNS, …)`; `plDrawnColumns(colChoices, colCtx)` and `plColumnOptions(colChoices, colCtx)` (:1764–1765) gain `PL_COLUMNS` first; `pickColumn` (:1769–1776) keeps `PL_COLUMNS.find` and `plShows` as they are; the `<PeopleTable …/>` (:1968) passes `noun="person"` (the default, spelled anyway so the cursor effect's `person-` (:1810) is visibly the same word); the comment above `PeopleTable` (:1161–1169) goes with it, minus its "until then". `/* global */` at the file's head names the nine window names.

- [ ] **Step 3: Load it everywhere the page loads.** `manifest.ts:55` gains `import "@/legacy/pages/people-table.jsx";` on the line before `clients-a.jsx`; `Chanlytics.html:93` gains `<script type="text/babel" src="pages/people-table.jsx?v=1"></script>` on the line before `clients-a.jsx?v=19` (which becomes `?v=20`). Every harness that imports the page imports the table first: `people-honest.test.mjs:219`, `person-honest.test.mjs:183`, `refusals-on-the-page.test.mjs:239` each gain `await import("../../../apps/dashboard/src/legacy/pages/people-table.jsx");` on the line before. `calendar-people.test.mjs:509, 600, 642, 702` read `clients-a.jsx` as text; run the file, and for each `includes(…)` that now fails because its string moved, point that existing read at `people-table.jsx` (the assertion count in the file does not change).
- [ ] **Step 4: `LEAD_COLUMNS`, in the real shape** (drawn in Task 2; defined here so the shape is one thing). PRD §6.2's Leads rows, each `{ key, label, sortable, pinned, fixed, on, needs, cell(l, x) }`; the sort keys are the ones `leads_page` takes (Task 4):

| key | label | sortable | pinned / fixed / on / needs | cell |
|---|---|---|---|---|
| `business` | Business | yes | pinned | a rounded-square mark, the name (opens the peek), "2 locations" when `l.places > 1`, `category · area`; Call and Copy on hover and cursor |
| `fit` | Fit | yes | | Qualified: Strong fit / Worth a look / Long shot; Needs review: why ("Couldn't check the email", "No location"); Excluded: the criterion ("Chain") |
| `email` | Email | no | | the address and its state in words (`LEAD_EMAIL_WORDS`; `catch_all` reads "Unconfirmed", S12); a left-out row says "Not checked" |
| `phone` | Phone | no | | the number; a double tick when Maps and the website agree; struck through when marked wrong |
| `why` | Why it fits | no | | the judge's reason, one line, dim |
| `rating` | Rating | yes | | "4.9 · 88" |
| `stage` | Stage | yes | | the stage word with its dot (`LEAD_STAGE_WORDS`); nothing on an Excluded row |
| `found` | Found | yes | | "now", "6m", "3d" |
| `distance` | Distance | yes | `needs: (x) => x.hasCenter`, `on: (x) => x.hasCenter` | from the search's center (S4) |
| `source` | Source | no | `on: false` | "Google Maps listing" |
| `website` | Website | no | `on: false` | the host |
| `search` | Search | no | `on: false` | the search's name |
| `actions` | | no | fixed | `LeadRowActions`: Call, Copy; Keep / Exclude on a Needs review row, Put back on an Excluded row (owner; gated for others) |

- [ ] **Step 5:** Run `people-table.test.mjs people-honest.test.mjs person-honest.test.mjs refusals-on-the-page.test.mjs legacy-harness.test.mjs calendar-people.test.mjs` → PASS. Commit — "The People table takes its columns from whoever draws it, and says what it calls its rows".

## Task 2: the Leads scope of People (sketch: written in full after release A)

**Files:** Modify `apps/dashboard/src/legacy/pages/clients-a.jsx` (`ClientsAReal` :1565, `PL_OVERLAY` :1563, the listener :1818–1857, `keys.current` :1861, `plViewSaver` :680, `PeopleRail` :926, `PeopleStanding` :975, `ClientsA` :2025), `app-shell.jsx:401–454, :686–689`, `packages/contracts/src/chrome.ts:149–159` · Create `apps/dashboard/src/legacy/pages/leads-scope.jsx` · Tests `leads-honest.test.mjs` (the people-honest harness), `people-honest.test.mjs` (the keys tests it already has stay green)

**The requirements this task must meet, each with its anchor:**

1. **`ClientsA({ scope = "people", leadsRoute = null, …props })`** (`clients-a.jsx:2025`) passes both through to `ClientsAReal`; the seeded page ignores them. The shell draws `<ClientsA key={scope} scope="leads" leadsRoute={`clients/${param}`} …/>` from a new branch before `page === "clients" && param` (`app-shell.jsx:416`), matching `/^leads(:|$)/`, with `activeNav = "clients"` and crumbs `People › Leads › <search name>`; the `key` remounts the page on a scope change so its state starts from the other view. The `page === "leads"` branch (:439–454) goes; `SURFACE_RETIRED.leads` becomes `"clients/leads"` (`surface-registry.ts:194`) so the retired redirect (:686–689) lands there.
2. **`LeadsScope` is hookless and its state is `ClientsAReal`'s.** People-honest draws `window.ClientsA(props)` on the stub React (`people-honest.test.mjs:258`), which keys hooks by call order within one draw; so every hook the Leads scope needs is declared in `ClientsAReal` in both scopes, in one order: `peekId`, `finderOpen`, `finderStage` (`compose | thinking | plan | starting`), `finderWords`, `finderProposal`, `armed` (`{ kind: "sent" | "call", leadId } | null`, for "Did you send it?" and "How did the call go?"), `offered` (the "12 new" the surface holds back, read from it), beside the hooks People already has (`sel`, `cursor`, `colChoices`, `colsOpen`, `scrolledX`, `q`, the toast). A test draws People then Leads and pins that the stub's hook sequence length is the same after each draw.
3. **The rail's `People | Leads`** is a segmented control with `role="tablist"` at the head of `PeopleRail` (`clients-a.jsx:927`), the two `role="tab"` buttons carrying `aria-selected`; under Leads the rail rows are `leadRail(counts, searches)` (contracts, Task 4): All leads, Ready, Contacted, Talking, Said no (only when any), Not a fit, then **Searches** with each search's count, a live dot on a running one, a "?" in the accent on one waiting on the owner; the rail's smart lists and saved lists are drawn only under People. On a phone the switch is the slim bar's (Task 18).
4. **The standing line** (`PeopleStanding` :975) takes a `scope`: under Leads it says `leadsStanding(counts, searches)`: "322 leads · 272 ready · 3 searches", and "1 search needs you" is a button to that search's view (`data-testid="leads-standing-needs"`).
5. **The view.** `remembered` (:1611) reads `plLoadView(scope)` (`PL_VIEW_KEY` :672 becomes a function of the scope: `chanlytics-people-view`, `chanlytics-leads-view`) under `people.views[scope]`; `sortBy` defaults to `"fit"` for leads (`"last"` for people, :1614); `plViewSaver(page)` (:680) takes the page name and `window.__saveView(page, view)` (:696) sends it; the save effect (:1629–1638) sends `{ list, sortBy, sortDir, columns }` under Leads and `{ sortBy, sortDir, columns }` under People, every key every time, one save at a time, and never for the view it already holds. `list` is the rail's row (`all | ready | nurture | converted | said_no | not_a_fit`), the same value the route carries (`clients/leads:l-ready`).
6. **The one listener** (:1818–1857) gains branches, never a second listener:
   - Esc, in this order, one per press: `k.peekOpen → k.closePeek()`; else `k.finderOpen → k.closeFinder()`; else the Columns menu (:1831–1832, as it is); else the selection (:1839–1842).
   - While the finder is open, every other key is the finder's: `if (k.finderOpen && e.key !== "Escape") return;` right after the Columns-menu branch.
   - `F` (not typing, no modifier): `if (k.canFind) { e.preventDefault(); k.find(); }` — `canFind` is `scope === "leads" && (!window.canDo || window.canDo("find"))`.
   - `C`: `if (k.cursor && k.call) { e.preventDefault(); k.call(k.cursor); }` — `call` dials `tel:` for the cursor lead and arms the call question (Task 14).
   - `keys.current` (:1861) gains `peekOpen, closePeek, finderOpen, closeFinder, canFind, find, call`. Under People the four Leads values are `false`/`null`, so People's tests keep passing unchanged.
   - `SHORTCUTS` (`chrome.ts:155–159`, group "People") gains `{ group: "People", keys: ["F"], does: "Find leads (on Leads)" }` and `{ group: "People", keys: ["C"], does: "Call the lead under the cursor (on Leads)" }`; the `?` sheet draws them.
7. **`PL_OVERLAY`** (:1563) becomes `'.app-root [role="menu"]:not(.pl-sheet):not(.pl-cols-menu):not(.pl-peek):not(.pl-finder), .app-root [role="dialog"]:not(.pl-sheet):not(.pl-cols-menu):not(.pl-peek):not(.pl-finder)'`: the peek (`role="dialog"`, `.pl-peek`) and the finder sheet (`.pl-finder`) are the page's own, so J/K keep moving the cursor under an open peek and Esc reaches the listener.
8. **The phone band is ≤900px** (`clients.css:1787`), with lead grid areas (Task 18); nothing here uses 720.
9. **The search box** under Leads filters the loaded rows at once by name, category and area (the words); a sentence is not sent anywhere (words to chips is release C), and the placeholder says "Search leads".
10. **Bulk** (`PeopleBulkBar` :1289 is People's; Leads draws `LeadsBulkBar` in `leads-scope.jsx`): Copy emails ("Copied 12 emails; 3 had none you can use"), Mark contacted, Not a fit, Export (owner), each on the selected rows among those loaded; the header box's label offers **Select all 1,240 that match** when the view holds more than the loaded rows (S13), which hands the view to `POST leads/bulk { action, view }`. Each toasts with Undo through `POST lead-operations/[id]/undo { version }`.
11. **Rows arrive and never re-sort under the owner (E8).** Under the `found` sort, a running search's new rows append in the order found; under any other sort they are held as `offered` and the strip says "12 new" with a tap that merges them; at an ending the strip offers **Sort by fit**, and nothing re-sorts by itself.

**What `LeadsScope({ route, view, surface, keys, onNavigate, onOpenPerson, …state and setters })` draws, top to bottom** (v2:6925–6927, kept): the rail rows; the standing line; the controls (the search input, Columns, Export, **Find leads** with `F`, gated for an operator with `window.gate("find", "find leads")`); the finder when open (Task 8); the strip for the view's search, or the newest open one (Task 10); the table (`window.PeopleTable` with `LEAD_COLUMNS`, `noun="lead"`, `ctx = { onOpen: peek, onCall, onCopy, onKeep, onExclude, onPutBack, hasCenter, canFind }`); the foot with the keys (J K move · x selects · ↵ peeks · C calls · F finds · / searches); the bulk bar when rows are selected; the peek (Task 12); the toast.

**Pinning tests** (`leads-honest.test.mjs`, rendering `ClientsA` with `scope="leads"` through the real `leadsOverride.apply()` over a faked fetch, as people-honest does with `peopleOverride`):
- "the Leads scope draws the rows the surface read, strongest fit first, each state a word beside a shape" (the first three rows' names in `fit` order; every email cell has a `LeadShape` and its word as the title; a catch-all reads Unconfirmed).
- "the rail counts what the lists hold, a waiting search wears a question mark, and the standing line says who needs you".
- "drawing People then Leads keeps the hook order" (the stub's sequence length after each draw).
- "the Leads view is saved with list, sortBy, sortDir and columns every time, through __saveView('leads', …), one save at a time" (`saveView` recorded; two quick changes make one request then one).
- "keys: J and K move, Enter peeks, x selects, C calls, F opens the finder, Esc closes the peek, then the finder, then the Columns menu, then the selection; the window has one keydown listener before and after the scope draws".
- "an operator sees Find leads, Keep, Exclude and Put back disabled with the gate's sentence, and F does nothing for them".
- "the bulk bar acts on the leads loaded and selected; Select all N that match hands the view to the server" (`__leadsBulk` called with `{ view }`).
- "new rows under a fit sort are offered as N new, not drawn; under the found sort they append".
- "an old #/leads bookmark lands on clients/leads" (the registry's `surfaceRetiredTo("leads")`).
- "no word the page says names the vendor" (every text node, `/apify|compass|bounceverify/i`).

**What the full version must add:** the hook list with its line in the merged `ClientsAReal`; `LeadsScope`'s full markup with class names from the canvas (`lf-*`, `ld-*` are the seeded page's and are not reused: Task 20); `leadRail`, `leadsStanding` in contracts `leads.ts` with their tests and expected strings for the seeded workspace (Task 21's six leads: "6 leads · 2 ready · 1 search"); the `?v=` bumps (`clients-a.jsx`, `app-shell.jsx`, `Chanlytics.html`); the mutation checks (a second listener added on render makes the listener-count test fail; Esc reordered makes the keys test fail); the surface-registry test's new lines (`routeSurfaceFor("clients", "leads") === "leads"`, `…("clients", "leads:l-ready") === "leads"`, a uuid still `"people"`, `routeSurfaceFor("leads") === undefined` kept at :261); `calendar-people.test.mjs:506`'s value `leads: "clients/leads",`.

### Task 2's listener, spelled against main's

Main's listener is `clients-a.jsx:1818–1857`. The full version replaces its body with this, and nothing else about it changes: still one `useEffect(…, [])`, still one `window.addEventListener("keydown", onKey)`, still reading `keys.current`. The lines that are main's are marked; the rest are the branches.

```jsx
  const keys = React.useRef(null);
  React.useEffect(() => {
    const onKey = (e) => {
      const k = keys.current;                                                                     // main :1821
      const from = e.target && e.target.nodeType === 1 ? e.target : document.activeElement;      // main :1824
      if (!k || e.defaultPrevented || plTyping(from) || e.metaKey || e.ctrlKey || e.altKey) return; // main :1826
      // The page's own overlays first, in the order Esc closes them: the peek, then the finder, then the Columns menu.
      // The peek holds only Esc: J and K keep walking the rows behind it, and the peek follows the cursor.
      if (e.key === "Escape" && k.peekOpen) { e.preventDefault(); k.closePeek(); return; }
      // The finder holds every key while it is open: its input, its pickers and its buttons are its own.
      if (k.finderOpen) { if (e.key === "Escape") { e.preventDefault(); k.closeFinder(); } return; }
      if (k.menuOpen && window.matchMedia && window.matchMedia("(max-width: 900px)").matches) k.closeMenu();   // main :1831
      else if (k.menuOpen) { if (e.key === "Escape") { e.preventDefault(); k.closeMenu(); } return; }         // main :1832
      if (k.sheetOpen) return;                                                                    // main :1833
      if (document.querySelector(PL_OVERLAY)) return;                                             // main :1836
      if (e.key === "/") { e.preventDefault(); k.focusSearch(); return; }                          // main :1837
      if (e.key === "Escape") {                                                                    // main :1839-1842
        if (k.selected) { e.preventDefault(); k.clearSel(); }
        return;
      }
      // F opens the finder on the Leads scope, for whoever may find (the gate says why to everyone else).
      if ((e.key === "f" || e.key === "F") && k.canFind) { e.preventDefault(); k.find(); return; }
      if (!k.ids.length) return;                                                                   // main :1843
      if ((e.key === "Enter" || e.key === " ") && from && from.closest && from.closest(PL_CONTROL)) return;   // main :1846
      const down = e.key === "ArrowDown" || e.key === "j" || e.key === "J";                        // main :1847
      const up = e.key === "ArrowUp" || e.key === "k" || e.key === "K";                            // main :1848
      if (e.repeat && !(down || up)) return;                                                       // main :1850
      if (down || up) { e.preventDefault(); k.move(down ? 1 : -1); }
      else if (e.key === "Enter" && k.cursor) { e.preventDefault(); k.open(k.cursor); }
      else if ((e.key === " " || e.key === "x" || e.key === "X") && k.cursor && k.canSelect) { e.preventDefault(); k.toggle(k.cursor); }
      // C calls the lead under the cursor from the owner's own phone, and arms the call question (Task 14).
      else if ((e.key === "c" || e.key === "C") && k.cursor && k.call) { e.preventDefault(); k.call(k.cursor); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
```

and `keys.current` (main :1861–1876) gains the Leads values, each false or null under People so nothing People's tests read changes:

```jsx
  keys.current = {
    ids: shownIds, cursor, move: moveCursor,
    // Enter opens the person under People and peeks the lead under Leads.
    open: scope === "leads" ? peekLead : onOpenProfile,
    toggle: toggleSel, canSelect: canEditLists || canExport, selected: sel.size > 0,
    clearSel: () => setSel(new Set()),
    focusSearch: () => { if (searchRef.current) searchRef.current.focus(); },
    sheetOpen: listsOpen, menuOpen: colsOpen,
    closeMenu: () => { setColsOpen(false); if (colsButton.current) colsButton.current.focus(); },
    peekOpen: scope === "leads" && !!peekId, closePeek: () => setPeekId(null),
    finderOpen: scope === "leads" && finderOpen, closeFinder: () => setFinderOpen(false),
    canFind: scope === "leads" && (!window.canDo || window.canDo("find")), find: () => setFinderOpen(true),
    call: scope === "leads" ? callLead : null,
  };
```

### `LEAD_COLUMNS`, spelled in the real shape

Task 1's table, as `leads-scope.jsx` writes it (the cells are sketches; each `ld*Cell` is a `<td key=…>` with a class the phone's grid areas name, Task 18):

```jsx
/* global React, Icon, PeopleTable, PeopleColumnsMenu, plSortKeys, plDrawnColumns, plColumnChoices, plColumnOptions, PL_NO_SEL */
const LEAD_COLUMNS = [
  { key: "business", label: "Business", sortable: true, pinned: true, cell: ldBusinessCell },   // the mark, the name (opens the peek), "2 locations", category · area; Call and Copy on hover and cursor
  { key: "fit", label: "Fit", sortable: true, cell: (l) => <td key="fit" className={`shrink ld-fit-cell ${l.cls}`} title={l.fitTitle}>{l.fitLabel}</td> },   // Strong fit · why it needs review · the criterion that excluded it
  { key: "email", label: "Email", sortable: false, cell: (l) => <td key="email" className="shrink ld-email-cell" title={l.emailWord}><LeadShape state={l.emailState} />{l.emailLabel}</td> },   // "Not checked" on an Excluded row
  { key: "phone", label: "Phone", sortable: false, cell: (l) => <td key="phone" className={`shrink ld-phone-cell ${l.phoneWrong ? "wrong" : ""}`}>{l.phone}{l.phoneAgrees && <span className="ld-tick2" title="Maps and their website agree">✓✓</span>}</td> },
  { key: "why", label: "Why it fits", sortable: false, cell: (l) => <td key="why" className="dim ld-why-cell" title={l.why}>{l.why}</td> },
  { key: "rating", label: "Rating", sortable: true, cell: (l) => <td key="rating" className="shrink ld-rating-cell">{l.rating}</td> },   // "4.9 · 88"
  { key: "stage", label: "Stage", sortable: true, cell: (l) => <td key="stage" className="shrink ld-stage-cell">{l.cls !== "excluded" && <><span className={`ld-dot ${l.stage}`} aria-hidden="true" />{l.stageLabel}</>}</td> },
  { key: "found", label: "Found", sortable: true, cell: (l) => <td key="found" className="shrink dim ld-found-cell" title={l.foundAt}>{l.foundLabel}</td> },
  { key: "distance", label: "Distance", sortable: true, needs: (x) => x.hasCenter, on: (x) => x.hasCenter, cell: (l) => <td key="distance" className="shrink dim ld-distance-cell">{l.distance}</td> },
  { key: "source", label: "Source", sortable: false, on: false, cell: (l) => <td key="source" className="shrink dim ld-source-cell">{l.source}</td> },   // "Google Maps listing"
  { key: "website", label: "Website", sortable: false, on: false, cell: (l) => <td key="website" className="shrink dim ld-website-cell">{l.host}</td> },
  { key: "search", label: "Search", sortable: false, on: false, cell: (l) => <td key="search" className="shrink dim ld-search-cell">{l.searchName}</td> },
  { key: "actions", label: "", sortable: false, fixed: true, cell: (l, x) => <td key="actions" className="shrink cl-actions-cell"><LeadRowActions l={l} onCall={x.onCall} onCopy={x.onCopy} onKeep={x.onKeep} onExclude={x.onExclude} onPutBack={x.onPutBack} canFind={x.canFind} /></td> },
];
const LEAD_SORT_KEYS = plSortKeys(LEAD_COLUMNS);   // business, fit, rating, stage, found, distance: the six leads_page takes (Task 4)
```

`LeadRowActions` draws Call and Copy on every row, Keep and Exclude on a `review` row, Put back on an `excluded` row; the three take `{...window.gate("find", "keep this lead")}` after their handlers when `canFind` is false (`legacy/CLAUDE.md`'s role-gate pattern; `data-bits.jsx:266`).

## Task 3: the Leads surface and the courier (written in full)

**Files:** Create `apps/dashboard/src/legacy-bridge/leads.ts` · Modify `apps/dashboard/src/legacy-bridge/LegacyApp.tsx:32, :59, :104`, `refresh-map.ts:41`, `surface-registry.ts:42, :85, :168, :193`, `packages/db/src/realtime.ts:24` · Test `tooling/scripts/tests/leads-bridge.test.mjs`

**The shape it mirrors.** People keeps what it loaded in a module variable (`peopleLoaded`, `surface-data.ts:607`), derives the surface from it every time (`publishPeople`, :620), walks every page once (`everyPerson`, :710) and takes a saved view before the request goes (`keepSavedView`, :660). The Leads surface keeps the same split, and adds what E8 asks: every read is made under a key (the workspace and the whole view), a read that finishes under a newer key is dropped, a refresh patches rows by id and keeps the loaded pages, and rows a refresh finds that are not loaded are offered, never sorted in under the owner. The selection and the cursor are the page's (Task 2), so the surface never touches them.

- [ ] **Step 1: The failing tests.** `wire({ … })` fakes `fetch` for `GET lead-searches`, `GET leads`, `GET lead-suggestions` and `GET views`, answering rows of the real shape (`LeadSearchDto`, `LeadRowDto` from Task 4's contracts, fictional values), and can hold an answer until told (`w.release(n)`), as people-honest's `wire` does for `GET contacts`.

```js
// tooling/scripts/tests/leads-bridge.test.mjs
test("the Leads surface reads the searches and one view's rows, and publishes them for the page", async () => {
  const w = wire({ searches: [SEARCH_DONE], rows: ROWS, counts: COUNTS });
  await leadsOverride.apply();
  assert.deepEqual(w.reads, ["GET /api/v1/lead-searches", "GET /api/v1/leads?list=all&sort=fit&dir=asc&limit=500"]);
  const L = window.__LEADS;
  assert.deepEqual([L.rows.length, L.view.list, L.counts.all, L.searches[0].name, L.next, L.offered, L.route], [ROWS.length, "all", 322, "Personal trainers · Austin", null, 0, "clients/leads"]);
});

test("a read is keyed by the view: a slow answer for an old view is dropped, and the rows are the new view's", async () => {
  const w = wire({ searches: [SEARCH_DONE], rows: ROWS, counts: COUNTS, hold: true });
  const first = window.__leadsView("clients/leads:l-ready");          // held
  const second = window.__leadsView("clients/leads:l-nurture");       // held
  w.release(1); await second; w.release(0); await first;
  assert.equal(window.__LEADS.view.list, "nurture");
  assert.ok(window.__LEADS.rows.every((r) => r.stage === "nurture"), "the ready rows never landed");
});

test("a refresh patches changed rows, keeps the loaded pages, and offers what is new under a fit sort", async () => {
  const w = wire({ searches: [SEARCH_DONE], rows: PAGE1, next: PAGE2, counts: COUNTS });
  await leadsOverride.apply();
  await window.__leadsMore();
  assert.equal(window.__LEADS.rows.length, PAGE1.length + PAGE2.length);
  w.now({ rows: [{ ...PAGE1[0], stage: "nurture" }, ...PAGE1.slice(1), NEW_A, NEW_B, NEW_C] });
  await leadsOverride.apply();                                          // what refresh-map and Realtime call
  const L = window.__LEADS;
  assert.equal(L.rows.length, PAGE1.length + PAGE2.length, "no page was dropped");
  assert.equal(L.rows[0].stage, "nurture", "the changed row was patched in place");
  assert.equal(L.offered, 3, "12 new, said as a count; nothing re-sorted under the owner");
  await window.__leadsTakeOffered();
  assert.equal(window.__LEADS.offered, 0);
  assert.ok(window.__LEADS.rows.some((r) => r.id === NEW_A.id));
});

test("under the found sort new rows append in the order found", async () => {
  const w = wire({ searches: [SEARCH_RUNNING], rows: PAGE1, counts: COUNTS });
  await window.__leadsView({ sort: "found", dir: "desc" });
  w.now({ rows: [NEW_A, ...PAGE1] });
  await leadsOverride.apply();
  assert.deepEqual([window.__LEADS.offered, window.__LEADS.rows.at(-1).id], [0, NEW_A.id], "appended after what the owner is reading, not on top of it");
});

test("leadsMore appends only under the same view; its late answer after a view change is dropped", async () => {
  const w = wire({ searches: [SEARCH_DONE], rows: PAGE1, next: PAGE2, counts: COUNTS, hold: true });
  w.release(0); w.release(1); await leadsOverride.apply();
  const more = window.__leadsMore();                                   // held
  await window.__leadsView("clients/leads:l-ready"); w.release(3); w.release(2); await more;
  assert.equal(window.__LEADS.view.list, "ready");
  assert.ok(!window.__LEADS.rows.some((r) => PAGE2.some((p) => p.id === r.id)), "page two of the old view never joined the new one");
});

test("a failed read is its own state, never an empty list", async () => {
  wire({ fail: "GET /api/v1/leads" });
  await leadsOverride.apply().catch(() => {});
  assert.equal(window.__LEADS.readFailed, true);
});

test("the first day's suggestions are read only when the workspace has no search", async () => {
  const w = wire({ searches: [], rows: [], counts: ZERO, suggestions: SUGGESTIONS });
  await leadsOverride.apply();
  assert.equal(w.reads.at(-1), "GET /api/v1/lead-suggestions");
  assert.equal(window.__LEADS.suggestions.items.length, 3);
});

test("every act goes through its route with the id and the version it saw, never with rows", async () => {
  const w = wire({ searches: [SEARCH_DONE], rows: ROWS, counts: COUNTS });
  await window.__leadUndo(OP, 4);
  await window.__leadKeep(SEARCH_DONE.id, ROWS[0].id);
  await window.__leadsBulk({ action: "contacted", view: window.__LEADS.view });
  assert.deepEqual(w.writes.map((x) => [x.key, x.body]), [
    [`POST /api/v1/lead-operations/${OP}/undo`, { version: 4 }],
    [`POST /api/v1/leads/${ROWS[0].id}/keep`, { search_id: SEARCH_DONE.id }],
    ["POST /api/v1/leads/bulk", { action: "contacted", view: { searchId: null, list: "all", cls: null, chips: {}, sort: "fit", dir: "asc" } }],
  ]);
});
```

- [ ] **Step 2: Write the bridge.**

```ts
// apps/dashboard/src/legacy-bridge/leads.ts
/**
 * The Leads scope's surface and acts (PRD §6, §8, §9; the review's E8, E9,
 * S13). The page reads window.__LEADS and calls the window functions
 * installed here; every act goes through its route (routes.generated.ts) and
 * refresh-map re-applies this surface after a write, which PATCHES what is
 * loaded rather than reading it again: a run adds rows every few seconds, and
 * an owner reading page three must not be put back on page one, re-sorted, or
 * have their selection dropped. The selection and the cursor are the page's.
 *
 * Every read is made under a key -- the workspace and the whole view -- and an
 * answer that lands under a newer key is dropped. New rows a refresh finds are
 * offered ("12 new"), not sorted in, unless the owner is reading in the order
 * found, where they append after what is already read.
 */
import {
  leadsRoute, parseLeadsRoute, toLeadRowVM,
  type LeadChips, type LeadClass, type LeadCounts, type LeadList, type LeadRowDto, type LeadRowVM, type LeadSearchDto, type LeadSort, type LeadStageInput, type LeadSuggestionsDto, type LeadsBulkInput,
} from "@chanlytics/contracts";
import { api, read } from "./api";
import { workspaceZone } from "./zone";
import { getActiveWorkspace } from "./workspace";
import type { SurfaceOverride } from "./surface-data";
import type { ApiResult } from "../client/api";

export interface LeadsView { searchId: string | null; list: LeadList; cls: LeadClass | null; chips: Partial<LeadChips>; sort: LeadSort; dir: "asc" | "desc" }
export interface LeadsSurface {
  searches: LeadSearchDto[];
  counts: LeadCounts;
  rows: LeadRowVM[];
  next: { key: string; id: string } | null;
  /** How many rows a refresh found that are not drawn, under a sort that is not the order found. */
  offered: number;
  view: LeadsView;
  /** The view as a route, for the address and for Ask's citations: clients/leads:s-<search>:l-<list>. */
  route: string;
  suggestions: LeadSuggestionsDto | null;
  tz: string;
  readFailed: boolean;
  fetchedAt: number;
}

const DEFAULT_VIEW: LeadsView = { searchId: null, list: "all", cls: null, chips: {}, sort: "fit", dir: "asc" };
const PAGE = 500;

/** What the Leads surface holds between reads. */
let leadsLoaded: {
  tz: string;
  view: LeadsView;
  key: string;
  searches: LeadSearchDto[];
  counts: LeadCounts;
  rows: LeadRowDto[];
  next: { key: string; id: string } | null;
  offered: LeadRowDto[];
  suggestions: LeadSuggestionsDto | null;
} | null = null;
let view: LeadsView = DEFAULT_VIEW;
/** Bumped by every read that replaces the rows; a read that finishes under a newer number is dropped. */
let reads = 0;

/** The key a read is made under: the workspace and every part of the view. */
function viewKey(v: LeadsView): string {
  return `${getActiveWorkspace() ?? ""}|${leadsRoute(v)}|${v.sort}|${v.dir}`;
}

function queryOf(v: LeadsView, after?: { key: string; id: string } | null): Record<string, string> {
  const q: Record<string, string> = { list: v.list, sort: v.sort, dir: v.dir, limit: String(PAGE) };
  if (v.searchId) q.search = v.searchId;
  if (v.cls) q.class = v.cls;
  for (const [k, val] of Object.entries(v.chips)) if (val !== undefined && val !== null && val !== "") q[k] = String(val);
  if (after) { q.after_key = after.key; q.after_id = after.id; }
  return q;
}

function publishLeads(failed = false): void {
  const now = Date.now();
  const L = leadsLoaded;
  (window as unknown as { __LEADS?: LeadsSurface }).__LEADS = {
    searches: L?.searches ?? [],
    counts: L?.counts ?? { all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 },
    rows: (L?.rows ?? []).map((r) => toLeadRowVM(r, L?.tz ?? "UTC", now)),
    next: L?.next ?? null,
    offered: L?.offered.length ?? 0,
    view,
    route: leadsRoute(view),
    suggestions: L?.suggestions ?? null,
    tz: L?.tz ?? "UTC",
    readFailed: failed,
    fetchedAt: now,
  };
}

/** A new view: page one under its key. The old rows go with the old key. */
async function readView(v: LeadsView): Promise<void> {
  const mine = ++reads;
  const key = viewKey(v);
  const [searches, page, tz] = await Promise.all([read("GET lead-searches"), read("GET leads", { query: queryOf(v) }), workspaceZone()]);
  if (mine !== reads) return; // superseded: a newer view asked after this one
  const suggestions = searches.searches.length === 0 ? await read("GET lead-suggestions").catch(() => null) : leadsLoaded?.suggestions ?? null;
  if (mine !== reads) return;
  leadsLoaded = { tz, view: v, key, searches: searches.searches, counts: page.counts ?? searches.counts, rows: page.rows, next: page.next, offered: [], suggestions };
  publishLeads();
}

/** The same view again, after a write or a Realtime change: patch, keep the pages, offer the rest. */
async function refreshView(): Promise<void> {
  const L = leadsLoaded;
  if (!L) return readView(view);
  const key = L.key;
  const [searches, page] = await Promise.all([read("GET lead-searches"), read("GET leads", { query: queryOf(L.view) })]);
  if (!leadsLoaded || leadsLoaded.key !== key) return; // the view moved while this was out
  const fresh = new Map(page.rows.map((r) => [r.id, r]));
  const loaded = new Set(L.rows.map((r) => r.id));
  const rows = L.rows.map((r) => fresh.get(r.id) ?? r);
  const arrived = page.rows.filter((r) => !loaded.has(r.id) && !L.offered.some((o) => o.id === r.id));
  if (L.view.sort === "found") rows.push(...arrived);            // the order found: after what is already read
  else L.offered.push(...arrived);                                // any other order: offered, never sorted in
  L.searches = searches.searches;
  L.counts = page.counts ?? searches.counts;
  L.rows = rows;
  publishLeads();
}

export const leadsOverride: SurfaceOverride = {
  key: "leads",
  globals: ["__LEADS"],
  events: ["surface:leads"],
  // A run commits a page every few seconds and a check lands per batch: the strip and the rows follow the database.
  refreshOnTables: ["leads", "lead_searches", "lead_rounds", "lead_search_members"],
  debounceMs: 800,
  apply: async () => {
    try {
      await (leadsLoaded ? refreshView() : readView(view));
    } catch (e) {
      publishLeads(true);
      throw e;
    }
  },
};

/** A new view: a route (clients/leads:…) or a patch of the current one. Answers when the rows are in. */
export async function leadsView(to: string | Partial<LeadsView>): Promise<void> {
  const parsed = typeof to === "string" ? parseLeadsRoute(to) : null;
  view = parsed ? { ...DEFAULT_VIEW, searchId: parsed.searchId, list: parsed.list, cls: parsed.cls, chips: parsed.chips, sort: view.sort, dir: view.dir } : { ...view, ...(to as Partial<LeadsView>) };
  await readView(view);
  window.dispatchEvent(new CustomEvent("surface:leads"));
}

/** The next 500 of the same view; dropped if the view moved while it was out. */
export async function leadsMore(): Promise<void> {
  const L = leadsLoaded;
  if (!L?.next) return;
  const key = L.key;
  const page = await read("GET leads", { query: queryOf(L.view, L.next) });
  if (!leadsLoaded || leadsLoaded.key !== key) return;
  const seen = new Set(leadsLoaded.rows.map((r) => r.id));
  leadsLoaded.rows = [...leadsLoaded.rows, ...page.rows.filter((r) => !seen.has(r.id))];
  leadsLoaded.next = page.next;
  publishLeads();
  window.dispatchEvent(new CustomEvent("surface:leads"));
}

/** "12 new": the owner asked for them, so the view is read again in its order. */
export async function leadsTakeOffered(): Promise<void> {
  await readView(view);
  window.dispatchEvent(new CustomEvent("surface:leads"));
}

/* --------------------------------------------------------------- the acts */
// Named functions, one per door, in people-detail.ts's style: the page calls window.__leadX, the tests call these.

export async function setLeadStage(id: string, input: LeadStageInput): Promise<ApiResult<{ stage: string; contact_id: string | null; op_id: string; version: number; toast: string }>> {
  return api()("POST leads/[id]/stage", { params: { id }, body: input });
}
export async function keepLead(searchId: string, id: string) { return api()("POST leads/[id]/keep", { params: { id }, body: { search_id: searchId } }); }
export async function excludeLead(searchId: string, id: string) { return api()("POST leads/[id]/exclude", { params: { id }, body: { search_id: searchId } }); }
export async function putBackLead(searchId: string, id: string) { return api()("POST leads/[id]/put-back", { params: { id }, body: { search_id: searchId } }); }
/** Undo names the operation and the version the page saw (E9): the server refuses when anyone changed it since. */
export async function undoLeadOperation(opId: string, version: number) { return api()("POST lead-operations/[id]/undo", { params: { id: opId }, body: { version } }); }
export async function draftForLead(id: string, input: { tone: "first" | "shorter" | "warmer"; previous?: { subject: string; body: string } }) {
  return api()("POST leads/[id]/draft", { params: { id }, body: input, refresh: false });
}
export async function eraseLead(id: string) { return api()("DELETE leads/[id]", { params: { id } }); }
/** The selected ids, or the view for "Select all N that match" (S13). */
export async function bulkLeads(body: LeadsBulkInput) { return api()("POST leads/bulk", { body }); }
export async function answerSearch(id: string, answer: "keep" | "include" | "stop", plan?: unknown) { return api()("POST lead-searches/[id]/answer", { params: { id }, body: { answer, ...(plan ? { plan } : {}) } }); }
export async function moreForSearch(id: string, purpose: "topup" | "renew", plan: unknown) { return api()("POST lead-searches/[id]/more", { params: { id }, body: { purpose, plan } }); }
export async function stopSearch(id: string) { return api()("POST lead-searches/[id]/stop", { params: { id } }); }
export async function renameSearch(id: string, name: string) { return api()("PATCH lead-searches/[id]", { params: { id }, body: { name } }); }
export async function removeSearch(id: string) { return api()("DELETE lead-searches/[id]", { params: { id } }); }
export async function setBusinessLine(business_line: string) { return api()("PUT lead-suggestions", { body: { business_line } }); }

export function installLeadsCourier(): void {
  window.__leadsView = leadsView;
  window.__leadsMore = leadsMore;
  window.__leadsTakeOffered = leadsTakeOffered;
  window.__leadsRouteOf = leadsRoute;
  window.__leadStage = setLeadStage;
  window.__leadKeep = keepLead;
  window.__leadExclude = excludeLead;
  window.__leadPutBack = putBackLead;
  window.__leadUndo = undoLeadOperation;
  window.__leadDraft = draftForLead;
  window.__leadErase = eraseLead;
  window.__leadsBulk = bulkLeads;
  window.__leadSearchAnswer = answerSearch;
  window.__leadSearchMore = moreForSearch;
  window.__leadSearchStop = stopSearch;
  window.__leadSearchRename = renameSearch;
  window.__leadSearchRemove = removeSearch;
  window.__leadBusinessLine = setBusinessLine;
}

declare global {
  interface Window {
    __LEADS?: LeadsSurface;
    __leadsView?: typeof leadsView;
    __leadsMore?: typeof leadsMore;
    __leadsTakeOffered?: typeof leadsTakeOffered;
    __leadsRouteOf?: typeof leadsRoute;
    __leadStage?: typeof setLeadStage;
    __leadKeep?: typeof keepLead;
    __leadExclude?: typeof excludeLead;
    __leadPutBack?: typeof putBackLead;
    __leadUndo?: typeof undoLeadOperation;
    __leadDraft?: typeof draftForLead;
    __leadErase?: typeof eraseLead;
    __leadsBulk?: typeof bulkLeads;
    __leadSearchAnswer?: typeof answerSearch;
    __leadSearchMore?: typeof moreForSearch;
    __leadSearchStop?: typeof stopSearch;
    __leadSearchRename?: typeof renameSearch;
    __leadSearchRemove?: typeof removeSearch;
    __leadBusinessLine?: typeof setBusinessLine;
  }
}
```

The body shapes above (`{ search_id }` on keep/exclude/put-back, `{ answer, plan? }`, `{ purpose, plan }`, `{ version }`) are release A's routes as the interface names their doors; check them against `routes.generated.ts` on main before writing, and change the courier, never the routes.

- [ ] **Step 3: Register it.** `LegacyApp.tsx`: beside `import { installPeopleCourier } from "./people-detail";` (:32) add `import { installLeadsCourier, leadsOverride } from "./leads";`; after `installPeopleCourier();` (:59) add `installLeadsCourier();`; `SURFACES` (:104) gains `leadsOverride`. `refresh-map.ts` (:41): `const leads = () => [leadsOverride];` and the entries `"POST lead-searches"`, `"POST lead-searches/[id]/answer"`, `"POST lead-searches/[id]/more"`, `"POST lead-searches/[id]/stop"`, `"PATCH lead-searches/[id]"`, `"DELETE lead-searches/[id]"`, `"POST leads/[id]/keep"`, `"POST leads/[id]/exclude"`, `"POST leads/[id]/put-back"`, `"POST lead-operations/[id]/undo"`, `"POST leads/bulk"`, `"DELETE leads/[id]"`, `"PUT lead-suggestions"` map to it; `"POST leads/[id]/stage": () => [leadsOverride, peopleOverride]` (an Interested call makes a person). These entries patch: `apply` above re-reads nothing the page already holds. `surface-registry.ts`: `leads: "real"` (:42) with the comment `// Lifted 18 Sep 2026 (Ruben): a scope of People at clients/leads, fed by the leads surface.`; `ROUTE_SURFACE` gains `leads: "leads"` (:85, so the registry test's real-has-an-override rule holds); `routeSurfaceFor` (:168) answers `"leads"` for `page === "clients"` when `pane` matches `/^leads(:|$)/`, before the `ROUTE_SURFACE[page]` fallback; `SURFACE_RETIRED.leads` (:194) becomes `"clients/leads"`. `realtime.ts` `WATCHED` (:24) gains `{ table: "leads", event: "*" }`, `{ table: "lead_searches", event: "*" }`, `{ table: "lead_rounds", event: "*" }`, `{ table: "lead_search_members", event: "*" }` with the comment `// a round's page committed, a check landed, a class changed: the Leads scope repaints (00139)`.
- [ ] **Step 4:** Run `leads-bridge.test.mjs surface-registry.test.mjs calendar-people.test.mjs` → PASS (`surface-registry.test.mjs:261` keeps `routeSurfaceFor("leads") === undefined`; `calendar-people.test.mjs:506`'s value becomes `leads: "clients/leads",`). Commit — "The Leads surface reads by view, patches what is loaded, and every act goes through its route with the version it saw".

## Task 4: the contracts, release B's migration, the server module and the routes (written in full where v2 was; the doors' bodies are sketched)

**Files:** Create `packages/contracts/src/leads.ts`, `supabase/migrations/<next>_the_leads_are_worked.sql`, `apps/dashboard/src/server/leads.ts`, `apps/dashboard/src/server/model-json.ts`, the route files · Modify `packages/contracts/src/enums.ts:102`, `notifications.ts:187, :211`, `schema-sets.generated.ts`, `apps/dashboard/src/server/rate-limit.ts:141`, `service.ts` · Tests `leads-vm.test.mjs`, `lead-routes.test.mjs`, `leads.db.test.mjs`

### 4.1 The contracts (`leads.ts`)

- [ ] **Step 1: The failing tests** (v2:5875–5911, corrected: the route carries the search, the list and the class, not chips; a stage click is only arguments, the door decides what it means; no chips schema).

```js
// tooling/scripts/tests/leads-vm.test.mjs
import { leadsRoute, parseLeadsRoute, stageArgs, LeadStageInputSchema, leadDraftFooter, LEAD_DRAFT_JSON_SCHEMA, LEAD_SUGGEST_JSON_SCHEMA, LEAD_EMAIL_WORDS, outcomeMove } from "../../../packages/contracts/src/leads.ts";

test("a view of the Leads scope is a route Ask can cite and the page can read back", () => {
  const route = leadsRoute({ searchId: "5e000000-0000-4000-8000-000000000001", list: "ready", cls: "review" });
  assert.equal(route, "clients/leads:s-5e000000-0000-4000-8000-000000000001:l-ready:c-review");
  assert.match(route.slice("clients/".length), /^[A-Za-z0-9:_-]+$/, "the citation grammar Ask grounds pages with (ask.ts PAGE_PREFIX)");
  assert.deepEqual(parseLeadsRoute(route), { searchId: "5e000000-0000-4000-8000-000000000001", list: "ready", cls: "review", chips: {} });
  assert.deepEqual(parseLeadsRoute("clients/leads"), { searchId: null, list: "all", cls: null, chips: {} });
  assert.equal(parseLeadsRoute("clients/p-123"), null);
});

test("a stage change in the page's words becomes the door's arguments; the door, not the page, decides what converts", () => {
  const args = (x) => stageArgs(LeadStageInputSchema.parse(x));
  assert.deepEqual(args({ kind: "stage", stage: "nurture" }), { p_stage: "nurture", p_reason: null, p_fit_reason: null, p_outcome: null, p_note: null });
  assert.deepEqual(args({ kind: "stage", stage: "converted" }), { p_stage: "converted", p_reason: null, p_fit_reason: null, p_outcome: null, p_note: null }, "a click says Talking; it never says convert");
  assert.deepEqual(args({ kind: "not_a_fit", why: "customer" }), { p_stage: "archived", p_reason: "customer", p_fit_reason: "customer", p_outcome: null, p_note: null });
  assert.deepEqual(args({ kind: "not_a_fit", why: "chain" }), { p_stage: "archived", p_reason: "not_a_fit", p_fit_reason: "chain", p_outcome: null, p_note: null });
  assert.deepEqual(args({ kind: "said_no" }), { p_stage: "archived", p_reason: "said_no", p_fit_reason: null, p_outcome: null, p_note: null });
  assert.deepEqual(args({ kind: "outcome", outcome: "interested", note: "Wants a call Tuesday" }), { p_stage: "converted", p_reason: null, p_fit_reason: null, p_outcome: "interested", p_note: "Wants a call Tuesday" });
  assert.deepEqual(args({ kind: "outcome", outcome: "wrong_number" }), { p_stage: null, p_reason: null, p_fit_reason: null, p_outcome: "wrong_number", p_note: null });
  assert.deepEqual(args({ kind: "emailed" }), { p_stage: "nurture", p_reason: null, p_fit_reason: null, p_outcome: "emailed", p_note: null });
  assert.deepEqual([outcomeMove("interested").converts, outcomeMove("call_back").converts], [true, false], "only Interested makes a person");
});

test("the email states are words that claim only what was seen: a catch-all is Unconfirmed", () => {
  assert.deepEqual(LEAD_EMAIL_WORDS, { none: "No email", checking: "Checking", ok: "Checked", catch_all: "Unconfirmed", unknown: "Couldn't check", invalid: "Bounces" });
});

test("a draft's foot is code's: the business's address and a way to say no, as US law asks", () => {
  assert.equal(leadDraftFooter("Zilker Strength Lab", "1200 Barton Springs Rd, Austin, TX 78704"), "\n\n—\nZilker Strength Lab · 1200 Barton Springs Rd, Austin, TX 78704\nNot interested? Reply \"no thanks\" and I won't write again.");
});

test("the answer schemas are the structured-output shape: every property required, no length keywords", () => {
  for (const s of [LEAD_DRAFT_JSON_SCHEMA, LEAD_SUGGEST_JSON_SCHEMA]) {
    assert.equal(s.additionalProperties, false);
    assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
    assert.equal(/minLength|maxLength|minimum|maximum/.test(JSON.stringify(s)), false);
  }
});
```

- [ ] **Step 2: Write `leads.ts`.** The sets mirror release A's CHECKs (`schema-sets.ts` holds each equal to its generated set: add `leads.stage`, `leads.closed_reason`, `leads.email_state`, `lead_search_members.class`, `lead_search_members.fit`, `lead_operations.kind` there); the words are the PRD's; the request schemas are v2's (v2:5915–5993) corrected:

```ts
// packages/contracts/src/leads.ts  (release B: the words, the view models, the requests)
import { z } from "zod";
import { LeadSearchPlanSchema } from "./lead-search";

export const LEAD_STAGES = ["ready", "nurture", "converted", "archived"] as const;
export const LEAD_CLOSED_REASONS = ["said_no", "not_a_fit", "customer", "stale", "search_removed"] as const;
export const LEAD_CLASSES = ["qualified", "review", "excluded"] as const;
export const LEAD_FITS = ["strong", "look", "long"] as const;
export const LEAD_EMAIL_STATES = ["none", "checking", "ok", "catch_all", "unknown", "invalid"] as const;
export const LEAD_OPERATION_KINDS = ["undo_search", "keep", "exclude", "put_back", "include", "stop", "stage", "bulk"] as const;  // A's six, and B's two
export const LEAD_LISTS = ["all", "ready", "nurture", "converted", "said_no", "not_a_fit"] as const;
export const LEAD_SORTS = ["fit", "found", "distance", "business", "rating", "stage"] as const;   // leads_page's p_sort (B widens A's three)
export const LEAD_CALL_OUTCOMES = ["interested", "call_back", "not_interested", "voicemail", "no_answer", "wrong_number"] as const;
export const LEAD_NOT_A_FIT_WHYS = ["chain", "wrong_kind", "too_far", "customer", "other"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number]; export type LeadClass = (typeof LEAD_CLASSES)[number]; export type LeadList = (typeof LEAD_LISTS)[number]; export type LeadSort = (typeof LEAD_SORTS)[number];

/** Stored values are never shown (§9.1). */
export const LEAD_STAGE_WORDS: Record<LeadStage, string> = { ready: "Ready", nurture: "Contacted", converted: "Talking", archived: "Closed" };
export const LEAD_CLOSED_WORDS: Record<(typeof LEAD_CLOSED_REASONS)[number], string> = { said_no: "Said no", not_a_fit: "Not a fit", customer: "Already a customer", stale: "Went quiet", search_removed: "Search removed" };
export const LEAD_FIT_WORDS: Record<(typeof LEAD_FITS)[number], string> = { strong: "Strong fit", look: "Worth a look", long: "Long shot" };
/** Claims only what the check saw (S12): a catch-all server accepts anything, so the check cannot tell. */
export const LEAD_EMAIL_WORDS: Record<(typeof LEAD_EMAIL_STATES)[number], string> = { none: "No email", checking: "Checking", ok: "Checked", catch_all: "Unconfirmed", unknown: "Couldn't check", invalid: "Bounces" };
export const LEAD_CALL_OUTCOME_WORDS: Record<(typeof LEAD_CALL_OUTCOMES)[number], string> = { interested: "Interested", call_back: "Call back later", not_interested: "Not interested", voicemail: "Left a voicemail", no_answer: "No answer", wrong_number: "Wrong number" };
export const LEAD_LOCKED_LINE = "Wait for their yes. Once they write back, they're in People and your yes page works for them.";
export const LEAD_DRAFT_NOTE = "Your business address and a way to say no are added at the foot, as US law asks.";
export const LEAD_NO_ADDRESS = "Add your business address in Settings first. US law asks for it at the foot of every email you send a business.";
/** Both consent doors say this, permanently, for a person a lead is linked to (decision 19). */
export const LEAD_CONSENT_REFUSAL = "This person came from a lead you found. A yes has to come from them: their own message, or your yes page.";

/** What a call outcome does to the stage (§9.4). Only Interested converts; Wrong number keeps the stage. */
export function outcomeMove(o: (typeof LEAD_CALL_OUTCOMES)[number]): { stage: LeadStage | null; closedReason: string | null; converts: boolean } {
  switch (o) {
    case "interested": return { stage: "converted", closedReason: null, converts: true };
    case "not_interested": return { stage: "archived", closedReason: "said_no", converts: false };
    case "wrong_number": return { stage: null, closedReason: null, converts: false };
    default: return { stage: "nurture", closedReason: null, converts: false };
  }
}

/* --------------------------------------------------------------- requests */

export const LeadsQuerySchema = z.object({
  list: z.enum(LEAD_LISTS).default("all"),
  search: z.string().uuid().optional(),
  class: z.enum(LEAD_CLASSES).optional(),
  sort: z.enum(LEAD_SORTS).default("fit"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  after_key: z.string().max(80).optional(),
  after_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});
export type LeadsQuery = z.infer<typeof LeadsQuerySchema>;
/** The view a bulk act names when the owner chose "Select all N that match" (S13): the same keys GET leads takes. */
export const LeadsViewSchema = LeadsQuerySchema.omit({ after_key: true, after_id: true, limit: true });

/** POST leads/[id]/stage, the page's five acts made exclusive. */
export const LeadStageInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stage"), stage: z.enum(["ready", "nurture", "converted"]) }),
  z.object({ kind: z.literal("not_a_fit"), why: z.enum(LEAD_NOT_A_FIT_WHYS) }),
  z.object({ kind: z.literal("said_no") }),
  z.object({ kind: z.literal("outcome"), outcome: z.enum(LEAD_CALL_OUTCOMES), note: z.string().trim().max(280).optional() }),
  /** "Did you send it?" Yes. */
  z.object({ kind: z.literal("emailed") }),
]);
export type LeadStageInput = z.infer<typeof LeadStageInputSchema>;

/** The door's arguments (lead_set_stage). The door judges what converts; this only spells the ask. */
export function stageArgs(i: LeadStageInput): { p_stage: string | null; p_reason: string | null; p_fit_reason: string | null; p_outcome: string | null; p_note: string | null } {
  const none = { p_stage: null, p_reason: null, p_fit_reason: null, p_outcome: null, p_note: null };
  switch (i.kind) {
    case "stage": return { ...none, p_stage: i.stage };
    case "not_a_fit": return { ...none, p_stage: "archived", p_reason: i.why === "customer" ? "customer" : "not_a_fit", p_fit_reason: i.why };
    case "said_no": return { ...none, p_stage: "archived", p_reason: "said_no" };
    case "emailed": return { ...none, p_stage: "nurture", p_outcome: "emailed" };
    case "outcome": {
      const m = outcomeMove(i.outcome);
      return { ...none, p_stage: m.stage, p_reason: m.closedReason, p_outcome: i.outcome, p_note: i.note ?? null };
    }
  }
}
export const LeadsBulkSchema = z.discriminatedUnion("by", [
  z.object({ by: z.literal("ids"), action: z.enum(["contacted", "not_a_fit"]), ids: z.array(z.string().uuid()).min(1).max(500) }),
  z.object({ by: z.literal("view"), action: z.enum(["contacted", "not_a_fit"]), view: LeadsViewSchema }),
]);
export type LeadsBulkInput = z.infer<typeof LeadsBulkSchema>;
export const LeadDraftInputSchema = z.object({
  tone: z.enum(["first", "shorter", "warmer"]).default("first"),
  previous: z.object({ subject: z.string().max(200), body: z.string().max(4000) }).optional(),
});
export const LeadExportQuerySchema = LeadsViewSchema;
export const RenameLeadSearchSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const BusinessLineSchema = z.object({ business_line: z.string().trim().min(3).max(160) });

/* ------------------------------------------- a view of the scope, as a route */

/** "clients/leads:s-<search>:l-<list>:c-<class>" — the grammar Ask's page citations admit (ask.ts PAGE_PREFIX). Chips join in release C. */
export function leadsRoute(v: { searchId?: string | null; list?: LeadList | null; cls?: LeadClass | null; chips?: Record<string, unknown> }): string {
  const parts = ["clients/leads"];
  if (v.searchId) parts.push(`s-${v.searchId}`);
  if (v.list && v.list !== "all") parts.push(`l-${v.list}`);
  if (v.cls) parts.push(`c-${v.cls}`);
  return parts.join(":");
}
export function parseLeadsRoute(route: string): { searchId: string | null; list: LeadList; cls: LeadClass | null; chips: Record<string, unknown> } | null {
  const [head, ...segs] = route.split(":");
  if (head !== "clients/leads" && head !== "leads") return null;
  const out = { searchId: null as string | null, list: "all" as LeadList, cls: null as LeadClass | null, chips: {} };
  for (const s of segs) {
    const dash = s.indexOf("-");
    if (dash < 1) continue;
    const [seg, val] = [s.slice(0, dash), s.slice(dash + 1)];
    if (seg === "s" && /^[0-9a-f-]{36}$/.test(val)) out.searchId = val;
    else if (seg === "l" && (LEAD_LISTS as readonly string[]).includes(val)) out.list = val as LeadList;
    else if (seg === "c" && (LEAD_CLASSES as readonly string[]).includes(val)) out.cls = val as LeadClass;
  }
  return out;
}

/* ------------------------------------------- what the model answers ------- */

export const LEAD_DRAFT_JSON_SCHEMA = { type: "object", additionalProperties: false, required: ["subject", "body"], properties: { subject: { type: "string" }, body: { type: "string" } } } as const;
export const LeadDraftAnswerSchema = z.object({ subject: z.string().trim().min(3).max(120), body: z.string().trim().min(20).max(2000) });
export const LEAD_SUGGEST_JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["line", "items"],
  properties: { line: { type: "string" }, items: { type: "array", items: { type: "object", additionalProperties: false, required: ["words", "who_for", "category_key"], properties: { words: { type: "string" }, who_for: { type: "string" }, category_key: { type: "string" } } } } },
} as const;
export const LeadSuggestAnswerSchema = z.object({
  line: z.string().trim().min(3).max(160),
  items: z.array(z.object({ words: z.string().trim().min(3).max(80), who_for: z.string().trim().min(3).max(120), category_key: z.string().regex(/^[a-z_]{2,40}$/) })).min(1).max(4),
});
/** The foot every draft carries: the business's postal address and a way to say no (CAN-SPAM). */
export function leadDraftFooter(business: string, address: string): string {
  return `\n\n—\n${business} · ${address}\nNot interested? Reply "no thanks" and I won't write again.`;
}
```

Also here, each with its test in `leads-vm.test.mjs` (the full version writes them out): `LeadRowDto`, `LeadSearchDto`, `LeadCounts`, `LeadSuggestionsDto`; `toLeadRowVM(dto, tz, now)` (the cells' words and shapes: fit, class reason, email word, phone with its double tick, found as "6m"); `toLeadPeekVM(row, search, tz, now)` (§9.2: the sub-line, the fit sentence, How you can reach them, the six checks each `seen` or `read` with its reason and `unknown`, the other addresses folded, Found, the site); `leadRail(counts, searches)`; `leadsStanding(counts, searches)`; `leadStrip(search, now)` returning `{ state, title, parts, actions, alert }` for every open state and every ending in `LEAD_ENDING_WORDS` (A's), plus "Stopping · checking the emails of the N found" while a stopped round still checks. Before relying on `type: ["string", "null"]` with `enum` in a structured-output schema, check the structured-outputs doc (https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md) and use `anyOf` if a type array is refused.

- [ ] **Step 3:** Run → PASS; rebuild contracts' dist. Commit — "A view of Leads is a route, a stage change is the door's arguments, and every word a lead wears claims only what was seen".

### 4.2 The migration (sketch: the doors' bodies are written in full after release A)

The next free number at build time; `<next>_the_leads_are_worked.sql`. Every statement re-runnable. The doors are SECURITY DEFINER with `set search_path = public`, checking `is_acting_member()` and the role the way A's do; `authenticated` may execute; `anon` may not. What it holds, each with the rule the full version writes as plpgsql:

1. **`lead_set_stage(p_lead_id uuid, p_stage text, p_reason text, p_fit_reason text, p_outcome text, p_note text) returns jsonb`** — operator. Sets `leads.stage` and `closed_reason`; **never converts on `p_stage = 'converted'` alone** (§9.6): the row reads Talking with `contact_id` null, and the answer says `converted: false`. On `p_outcome = 'interested'`: the real conversation. It finds the person whose phone is the lead's (`contact_identities`, the way the intake links a caller), else the one whose email is (00125's `set_person_email` shape), else creates one through `create_person` with `source = 'lead'` (00138 reads that `contact.added` as "A lead you found", `00138:143`) named for the business; links `leads.contact_id`; writes `lead.converted` and `lead.call` with the note. Never a second person for a number already in People (decision 25). `wrong_number` sets `leads.phone_wrong = true` (a B column) and keeps the stage. `p_reason = 'customer'` inserts `lead_suppressions(kind 'place', what 'customer')` for the place id, and `lead.not_a_fit` names the why. `emailed` writes `lead.emailed` (S12: it records that the owner said they sent it). Every call writes `lead_operations(kind 'stage', before, after, version)` and returns `{ stage, closed_reason, contact_id, existed, converted, op_id, version }`.
2. **`lead_bulk(p_tenant_id uuid, p_action text, p_ids uuid[], p_view jsonb) returns jsonb`** — operator; `p_ids` or `p_view` (the same filters `leads_page` reads, without paging), never both; `contacted` → nurture, `not_a_fit` → archived not_a_fit; one `lead_operations(kind 'bulk')` row holding every id's before; returns `{ done, op_id, version }`. `lead_undo` (A's) restores a `bulk` row's befores the way it restores `keep`'s.
3. **`lead_erase(p_lead_id uuid) returns jsonb`** — owner. Blanks every column but the id and the tenant, writes `lead_suppressions(kind 'place', what 'erased')` and the email and phone hashes the way 00131 writes `erased_email_hash`, so the finder never inserts the place again (§0.4) and nothing else in the product reads a name that is gone. No operation row: final.
4. **`lead_export_mark(p_tenant_id uuid, p_ids uuid[]) returns int`** — owner; `leads.exported_at = now()` where null; the export route calls it after the file is built, so an exported lead keeps its charge on Undo (E9; A's `lead_undo` reads `exported_at`).
5. **`leads_page(…, p_list text default 'all')`** — `create or replace` A's with the argument appended (A's callers still resolve), the list as a stage filter (`ready`, `nurture`, `converted`, `said_no` = archived+said_no, `not_a_fit` = archived+not_a_fit|customer, `all` = every stage), and the sort keys `business | rating | stage` added to A's `found | fit | distance`, keyset on `(sort_key, id)`. **`lead_list_counts(p_tenant_id uuid) returns jsonb`** — `{ all, ready, nurture, converted, said_no, not_a_fit }`, never over erased or blanked rows.
6. **`lead_searches_view`** — `create or replace` with `undo_op_id uuid, undo_version int` (the latest ended round's `undo_search` operation while its 24 hours run), and `asked_on` (the search's `created_at`), for the strip and the kept-search menu.
7. **`lead_suggestions`** — `tenant_id uuid primary key references tenants(id) on delete cascade, business_line text not null, by_owner boolean not null default false, items jsonb not null, made_at timestamptz not null default now()`; member-select RLS; no member write (the service writes it, 4.3).
8. **The bell.** `notifications_kind_check` (00134:15–17) re-created with `leads_ready` and `leads_question` added; a trigger `lead_rounds_notify` after update of `state` on `lead_rounds`: `waiting_on_owner` → one `leads_question` row ("Your search for <name> needs you", route `clients/leads:s-<search>`), `ended` → one `leads_ready` row ("Your search for <name> is done", the same route), written the way `calendar_people` rows are (one per workspace, every member's marks their own). `SERVER_NOTIFICATION_KINDS` (`notifications.ts:187`) and `SERVER_LOOK` (:211) gain both: `leads_ready: { icon: "users", tone: "ok", action: "Open Leads", to: "clients/leads" }` (the icon `calendar_people` draws), `leads_question: { icon: "alert", tone: "warn", action: "Answer it", to: "clients/leads" }` (the icon `handoff` draws). `schema-sets.generated.ts` (:74) regenerates.
9. **The events.** `lead.stage`, `lead.emailed`, `lead.call`, `lead.converted`, `lead.not_a_fit`, each written by a door above as `insert into events (tenant_id, kind, category, subject_type, subject_id, data) values (…, 'lead.stage', 'lead', 'lead', p_lead_id, …)` with the literal first (the lint reads it, `event-kinds.test.mjs:38–43`); the five join `EVENT_KINDS` (`enums.ts:102`).
10. **The consent doors refuse a linked person, permanently (decision 19).** `create or replace function public.set_marketing_consent(p_tenant_id uuid, p_contact_id uuid, p_consent text, p_source text, p_note text default null, p_evidence jsonb default null, p_message_id uuid default null)` and `create or replace function public.set_contact_consent(p_contact_id uuid, p_consent text, p_source text, p_note text default null, p_message_id uuid default null)`: 00137's bodies (`00137:45–155`, `:165–263`) with one block added after each erased check (`00137:101–103`, `:214–216`):

```sql
  -- A converted lead's yes comes only from them (PRD decision 19; permanent, replacing v2's 90 days). A signed-in
  -- caller may record a no, or unknown, for a person a lead is linked to; never a yes, whatever the source, and
  -- however the message is named. The edge (no session) records what they texted; the yes page records what they
  -- chose. The sentence is contracts' LEAD_CONSENT_REFUSAL; leads-consent.db.test.mjs holds the two doors equal.
  if auth.uid() is not null and p_consent = 'opted_in'
     and exists (select 1 from public.leads l where l.contact_id = p_contact_id and l.tenant_id = <the tenant>) then
    raise exception 'This person came from a lead you found. A yes has to come from them: their own message, or your yes page.' using errcode = '42501';
  end if;
```

Neither 00043's `set_contact_consent(uuid, text, text, text)` (dropped at `00137:163`) nor 00110's six-argument `set_marketing_consent` (dropped at `00137:43`) is re-created: a `create or replace` with those argument lists would bring back an ambiguous overload. The comments, revokes and grants are re-stated for the 00137 signatures.

11. **The CHECK sets widened:** `lead_operations.kind` gains `stage | bulk`; `leads` gains `phone_wrong boolean not null default false`. `corepack pnpm gen:schema-sets` and `gen:db-types` after.

**What the full version must add:** every door's plpgsql body; `leads.db.test.mjs` on the real local Postgres with these cases, each a test: a stage click to Talking keeps the lead (no contact, `converted: false`); Interested makes a person with `source = 'lead'` and `came_from` reads "A lead you found" (`people_list`); a lead whose phone is already someone's converts into them and no second person is made; Wrong number keeps the stage and marks the phone; Already a customer hides the place (a second search's insert is refused by A's suppression read); erase blanks the row and writes the tombstones; export marks `exported_at` and A's `lead_undo` keeps the exported lead charged; bulk by view acts on every matching row and undoes as one; the trigger writes exactly one `leads_question` and one `leads_ready` per round; both consent doors refuse a linked person's yes with `LEAD_CONSENT_REFUSAL` and accept their no; a person with no lead is unaffected. Expected outputs are the door's jsonb answers spelled in the test.

### 4.3 The seams: a structured answer through the gateway, four rates, the suggestions' save (v2:6192–6256, corrected)

- [ ] **Step 1: `model-json.ts`** — v2's `askForJson` with the codes `errors.ts` declares (`upstream_anthropic` 502, `rate_limited` 429, `validation` 422 by status) and the purposes narrowed to two:

```ts
// apps/dashboard/src/server/model-json.ts
/**
 * One structured answer through the edge's gateway: the model key stays on the
 * edge, the tokens count in Ask's daily budget (ASK_USAGE_KIND), and the answer
 * is read by zod here. A refusal of any kind (the budget, a preview deployment,
 * an answer out of shape) is an AppError in words; nothing is guessed.
 */
import "server-only";
import type { ZodType } from "zod";
import { AppError } from "@chanlytics/contracts";
import { GatewayRefused, streamModel, type GatewayCall } from "./ask/gateway";

let stream: typeof streamModel = streamModel;
/** Tests hand in a stream of their own. */
export function setModelStream(s: typeof streamModel | null): void { stream = s ?? streamModel; }

export async function askForJson<T>(call: Omit<GatewayCall, "request"> & { purpose: "lead_draft" | "lead_suggest"; request: Omit<GatewayCall["request"], "output_config"> & { schema: Record<string, unknown> } }, schema: ZodType<T>, what: string): Promise<T> {
  const { schema: json, ...request } = call.request;
  let text = "";
  let stop: string | null = null;
  try {
    for await (const ev of stream({ ...call, request: { ...request, output_config: { effort: "low", format: { type: "json_schema", schema: json } } } })) {
      if (ev.type === "text") text += ev.text;
      else if (ev.type === "stop") stop = ev.stopReason;
      else if (ev.type === "error") throw new AppError("upstream_anthropic", `The ${what} could not be written just now. Try again in a moment.`);
    }
  } catch (e) {
    if (e instanceof GatewayRefused) {
      if (e.refusal.kind === "budget") throw new AppError("rate_limited", `Today's assistant budget is spent, so the ${what} waits until tomorrow.`);
      throw new AppError("upstream_anthropic", `The ${what} is not available here right now.`, 503);
    }
    throw e;
  }
  if (stop === "refusal") throw new AppError("validation", `Claude would not write this ${what}.`, 422);
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new AppError("upstream_anthropic", `The ${what} came back unreadable. Try again.`); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError("upstream_anthropic", `The ${what} came back unreadable. Try again.`);
  return parsed.data;
}
```

`GatewayCall` (`gateway.ts:21`) gains `purpose?: "ask" | "lead_draft" | "lead_suggest"` and `request.output_config?.format`; `streamModel` (:56) sends `purpose: call.purpose ?? "ask"` where :64 spells `"ask"` today.

**How the two purposes are capped.** They spend Ask's one daily budget (`ASK_TOKENS_DAY`, read at `llm.ts:68–70`), so a workspace that drafts sixty emails eats into its Ask. The plan caps them three ways and adds no second budget: the rate buckets below (a person, not a workspace: `lead_draft` 60 an hour, `lead_suggest` 10 an hour); the suggestions' seven-day cache (one model call a week per workspace unless the owner changes the line); and small requests (`max_tokens` 600 for a draft, 400 for the suggestions, `effort: "low"`). The usage row records `purpose` (Task 5), so `askTokensLast24h` can be read by purpose the day a share is wanted; that is one constant later, not now.

- [ ] **Step 2: The rates** (`rate-limit.ts`, after `export` at :141):

```ts
  // The lead finder (PRD §12.6). A search's own bucket (lead_search) is release A's.
  lead_edit: { limit: 120, windowMs: 60_000, noun: "lead changes" },
  lead_bulk: { limit: 30, windowMs: 60_000, noun: "changes to many leads" },
  lead_draft: { limit: 60, windowMs: 3_600_000, noun: "email drafts" },
  lead_suggest: { limit: 10, windowMs: 3_600_000, noun: "suggestion requests" },
```

- [ ] **Step 3: `service.ts`** gains v2's `saveLeadSuggestions` (v2:6198–6202, unchanged: an upsert on `tenant_id` with the service role). Nothing else from v2 Task 3: no scheduler, no live-runs read (the doors insert their own jobs, and Stop is A's door).
- [ ] **Step 4:** Commit with 4.4.

### 4.4 The server module and the routes (v2:6258–6470, corrected)

- [ ] **Step 1: The failing tests** (`lead-routes.test.mjs`, on `people-routes.test.mjs`'s harness: `ctxFor(tables, params, rpcs)` :45, `send` :47, `refused` :48, a memory rate store; `setModelStream` answering from a fixture; `world({ role, address, … })` building `memberships`, `billing_accounts`, `tenants`, `tenant_config` with `profile.address`, `leads`, `lead_searches`, `lead_search_members`, and `rpcs` answering `lead_set_stage`, `lead_bulk`, `lead_erase`, `lead_export_mark`, `leads_page`, `lead_list_counts`, `lead_search_rename`, `lead_search_remove` with rows of the real shape, recording their arguments as `rpcCalls(name)`):

```js
test("a stage change goes through the door with the page's words made its arguments, and a click to Talking says the lead is still a lead", async () => {
  const tables = world({ role: "operator" });
  const click = await stage.POST.run(send("POST", { kind: "stage", stage: "converted" }, inA), ctxFor(tables, { id: LEAD }, rpcs));
  assert.deepEqual(rpcCalls("lead_set_stage")[0], { p_lead_id: LEAD, p_stage: "converted", p_reason: null, p_fit_reason: null, p_outcome: null, p_note: null });
  assert.equal(click.toast, "Marked talking. They join People when they write or call in, or when a call goes well.");
  const call = await stage.POST.run(send("POST", { kind: "outcome", outcome: "interested", note: "Tuesday" }, inA), ctxFor(tables, { id: LEAD }, rpcs));
  assert.equal(call.toast, "Travis Heights Coaching Co. is in People now, with this call on their page.");
  assert.equal(call.undo, null, "a person made is not undone from a toast");
});

test("a viewer is refused every write; an operator may work leads but not erase, export or remove a search", async () => {
  for (const [route, method, body, params, role] of [
    [stage, "POST", { kind: "said_no" }, { id: LEAD }, "viewer"],
    [erase, "DELETE", undefined, { id: LEAD }, "operator"],
    [exportRoute, "GET", undefined, {}, "operator"],
    [search, "DELETE", undefined, { id: SEARCH }, "operator"],
  ]) await refused(route[method].run(send(method, body, inA), ctxFor(world({ role }), params, rpcs)), "forbidden", 403);
});

test("a draft needs the business's address, its foot is code's, and the model is asked once with the lead's facts quoted", async () => {
  await assert.rejects(draft.POST.run(send("POST", {}, inA), ctxFor(world({ role: "operator", address: null }), { id: LEAD })), (e) => e.message === LEAD_NO_ADDRESS);
  assert.equal(modelCalls.length, 0, "no model call without an address");
  const out = await draft.POST.run(send("POST", {}, inA), ctxFor(world({ role: "operator" }), { id: LEAD }));
  assert.ok(out.body.endsWith("Not interested? Reply \"no thanks\" and I won't write again."));
  assert.equal(out.mailto.startsWith("mailto:hello%40travisheightscoaching.example?subject="), true);
  assert.deepEqual([modelCalls[0].purpose, modelCalls[0].request.max_tokens], ["lead_draft", 600]);
  await assert.rejects(draft.POST.run(send("POST", {}, inA), ctxFor(world({ role: "operator", email: "invalid" }), { id: LEAD })), (e) => e.message === "This lead has no address that reaches them. Call instead.");
});

test("bulk acts on the ids, or on the view for Select all that match; the door gets one or the other", async () => {
  const tables = world({ role: "operator" });
  await bulk.POST.run(send("POST", { by: "ids", action: "contacted", ids: [LEAD] }, inA), ctxFor(tables, {}, rpcs));
  await bulk.POST.run(send("POST", { by: "view", action: "not_a_fit", view: { list: "ready", sort: "fit", dir: "asc" } }, inA), ctxFor(tables, {}, rpcs));
  assert.deepEqual(rpcCalls("lead_bulk").map((a) => [a.p_action, a.p_ids, a.p_view?.list]), [["contacted", [LEAD], undefined], ["not_a_fit", null, "ready"]]);
});

test("the export is the owner's, on the ledger like contacts/export, and marks what it took", async () => {
  const tables = world({ role: "owner" });
  const res = await exportRoute.GET.run(get(`${inA}&list=ready`), ctxFor(tables, {}, rpcs));
  assert.match(res.headers.get("content-disposition"), /^attachment; filename="leads-.*\.csv"$/);
  assert.equal(rpcCalls("lead_export_mark").length, 1);
  assert.deepEqual(tables.events.filter((e) => e.kind === "decision").map((e) => e.data.action), ["export"]);
});

test("GET leads pages by the key the database answered, with the list, the class and the sort in SQL", async () => {
  await leads.GET.run(get(`${inA}&list=ready&class=review&sort=rating&dir=desc&after_key=4.8&after_id=${LEAD}`), ctxFor(world({ role: "viewer" }), {}, rpcs));
  assert.deepEqual(rpcCalls("leads_page")[0], { p_tenant_id: A, p_search_id: null, p_class: "review", p_sort: "rating", p_after_key: "4.8", p_limit: 500, p_list: "ready", p_dir: "desc", p_after_id: LEAD });
});
```

(`GET leads` is release A's route; the test above is B's because B widens its query. If A's route file already exists, B edits it and moves A's test cases into this file unchanged.)

- [ ] **Step 2: The server module.** v2's `leadScope`/`leadSearchScope` (v2:6276–6291) survive with A's columns (`leads`: `id, tenant_id, business_name, email, email_state, stage, closed_reason, contact_id, place_id, erased_at, blanked_at`; `lead_searches`: `id, tenant_id, name, plan, removed_at`). `planFacts` (v2:6296–6330) is A's now (the route computes the estimate; `lead_niche_prior` and `lead_searches_on` are A's doors); B's `searchesOf` reads `lead_searches_view` and `lead_list_counts`. The functions, each one door and no scheduling:

| Function | Door | Answers |
|---|---|---|
| `renameSearch(ctx, s, name)` | `lead_search_rename` (A) | `{ name }` |
| `removeSearch(ctx, s)` | `lead_search_remove` (A) | `{ archived, kept }` and "Removed. The 18 you contacted or are talking to are kept." |
| `searchesOf(ctx, tenantId)` | `lead_searches_view` + `lead_list_counts` | `{ searches, counts }` |
| `leadsPage(ctx, tenantId, q)` | `leads_page` (with `p_list`, `p_dir`, `p_after_id`) and, on the first page, `lead_list_counts` | `{ rows, next, counts? }`, `next` the last row's `{ key, id }` when the page was full |
| `setStage(ctx, lead, input)` | `lead_set_stage(p_lead_id, …stageArgs(input))` | `{ stage, contact_id, existed, converted, op_id, version, toast, undo }`: `undo` is `{ op_id, version }` unless a person was made; the toast is `LEAD_CALL_OUTCOME_WORDS`-based for an outcome ("Interested" → "<name> is in People now, with this call on their page."), "Marked talking. They join People when they write or call in, or when a call goes well." for a click to Talking, "Marked contacted." / "Marked as said no." / "Not a fit." / "Hidden from every future search." (customer) otherwise |
| `bulkStage(ctx, tenantId, input)` | `lead_bulk` | `{ done, op_id, version, toast }` |
| `eraseLead(ctx, lead)` | `lead_erase` | `{ erased: true }`; the ledger row `recordDecision(ctx, tenantId, "lead", id, "erase", {})` |
| `draftFor(ctx, lead, input)` | — (reads the lead, `tenants.name`, `tenant_config.config.profile.address`, the first five service names) | `{ to, subject, body, mailto }` through `askForJson` purpose `lead_draft`, `LeadDraftAnswerSchema`; refuses `LEAD_NO_ADDRESS` before any model call when the address is empty; refuses "This lead has no address that reaches them. Call instead." when `email_state` is `none` or `invalid`; the body gets `leadDraftFooter(name, address)`; `DRAFT_SYSTEM` is v2's (v2:6403–6412), unchanged |
| `suggestionsFor(ctx, tenantId)` | — | the kept `lead_suggestions` row when younger than seven days; else `askForJson` purpose `lead_suggest` from the business line (the owner's when `by_owner`, else "<name>: <first five services>"), saved with `saveLeadSuggestions`; each item gains `reach` from `lead_niche_prior(category_key)` ("about 6 in 10 have an email") when the prior exists; a gateway refusal answers `{ items: [], note: "Suggestions are not available right now." }` instead of failing the page |
| `setBusinessLine(ctx, tenantId, line)` | — | saves `{ business_line, by_owner: true, items: [] }` so the next read asks again |
| `exportLeads(ctx, tenantId, q)` | reads every page of `leads_page` for the view, then `lead_export_mark` | `attachment("leads-<workspace>-<date>.csv", leadsCsv(rows, tz), "text/csv")` (`export.ts:215`, :199, :192) and `recordDecision(ctx, tenantId, "workspace", tenantId, "export", { what: "leads", rows })` (`contacts/export/route.ts:25`'s shape) |

- [ ] **Step 3: The routes.** Each file this shape (v2:6440–6470, the B set):

```ts
// apps/dashboard/app/api/v1/lead-searches/[id]/route.ts  (A has GET here; B adds two)
/** PATCH — rename. An operator's: a name changes nothing that is spent. */
export const PATCH = write({ scope: leadSearchScope, role: "operator", rate: "lead_edit", input: RenameLeadSearchSchema, handle: ({ ctx, row, input }) => renameSearch(ctx, row, input.name) });
/** DELETE — remove the search, keeping the leads contacted or talking. An owner's. */
export const DELETE = write({ scope: leadSearchScope, role: "owner", rate: "lead_edit", handle: ({ ctx, row }) => removeSearch(ctx, row) });
// apps/dashboard/app/api/v1/leads/[id]/stage/route.ts — operator; only an Interested call makes a person
export const POST = write({ scope: leadScope, role: "operator", rate: "lead_edit", input: LeadStageInputSchema, handle: ({ ctx, row, input }) => setStage(ctx, row, input) });
// apps/dashboard/app/api/v1/leads/[id]/draft/route.ts — operator; a model call, counted in Ask's day
export const POST = write({ scope: leadScope, role: "operator", rate: "lead_draft", input: LeadDraftInputSchema, handle: ({ ctx, row, input }) => draftFor(ctx, row, input) });
// apps/dashboard/app/api/v1/leads/[id]/route.ts — owner: erase and never find again
export const DELETE = write({ scope: leadScope, role: "owner", rate: "erase", handle: ({ ctx, row }) => eraseLead(ctx, row) });
// apps/dashboard/app/api/v1/leads/bulk/route.ts — operator: the selected ids, or every lead the view matches
export const POST = write({ scope: workspace, role: "operator", rate: "lead_bulk", input: LeadsBulkSchema, handle: ({ ctx, member, input }) => bulkStage(ctx, member.tenantId, input) });
// apps/dashboard/app/api/v1/leads/export/route.ts — owner, on the ledger like contacts/export
export const GET = read({ scope: workspace, role: "owner", rate: "export", query: LeadExportQuerySchema, handle: ({ ctx, member, input }) => exportLeads(ctx, member.tenantId, input) });
// apps/dashboard/app/api/v1/lead-suggestions/route.ts — read (a week's cache); PUT the business line, owner
export const GET = read({ scope: workspace, rate: "lead_suggest", handle: ({ ctx, member }) => suggestionsFor(ctx, member.tenantId) });
export const PUT = write({ scope: workspace, role: "owner", rate: "lead_suggest", input: BusinessLineSchema, handle: ({ ctx, member, input }) => setBusinessLine(ctx, member.tenantId, input.business_line) });
```

`GET leads` (A's file) takes `LeadsQuerySchema` with `list`, `class` and the six sorts. **`SpendWords`** (v2 Task 1, 1c): check `POST lead-searches` on main; if a refusal to spend there still says "buying a number", add v2:5800–5830's `SpendWords`, `SPEND_LEADS`, `whyCannotSpend(mode, status, doing)`, `spendWords` on `WriteSpec` (`route.ts:112`) and `requireSpend(ctx, member, doing)` (`with-route.ts:242`) here, with v2's `may-spend.test.mjs` cases; the lines door's two calls keep the default.

- [ ] **Step 4: Regenerate.** `UPDATE_ROUTE_POLICY=1 node --conditions=react-server --import tsx --test tooling/scripts/tests/route-policy.test.mjs`, then `node tooling/scripts/gen-route-types.mjs`, then `route-policy.test.mjs route-types.test.mjs lead-routes.test.mjs` → PASS. Review `route-policy.json`'s diff line by line: nine new entries, `spend: true` on none of them (the spending routes are A's).
- [ ] **Step 5: The migration's tests** (`leads.db.test.mjs`, 4.2's list) → PASS on the local Postgres. Commit — "A lead is worked through its doors: stages, calls, drafts, bulk, erase and export, and a converted lead's yes comes only from them".


### 4.5 The key door, sketched: `lead_set_stage`

The one door the peek, the call question, the draft's "Did you send it?" and Not a fit all reach. Written as plpgsql here because its rules are the release's hardest (§9.4, §9.6, decision 25, §0.4); the full version fills the two placeholders and tests every branch on Postgres (4.2's list).

```sql
create or replace function public.lead_set_stage(
  p_lead_id    uuid,
  p_stage      text default null,   -- ready | nurture | converted | archived, or null to keep it (wrong_number)
  p_reason     text default null,   -- said_no | not_a_fit | customer when archived
  p_fit_reason text default null,   -- chain | wrong_kind | too_far | customer | other (Not a fit's why)
  p_outcome    text default null,   -- a call's outcome, or 'emailed'
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead     public.leads%rowtype;
  v_before   jsonb;
  v_contact  uuid;
  v_existed  boolean := false;
  v_convert  boolean := p_outcome = 'interested';   -- the one act that makes a person (§9.6): never a stage click
  v_op       uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
  select * into v_lead from public.leads where id = p_lead_id;
  if v_lead.id is null or not public.is_acting_member(v_lead.tenant_id) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if v_lead.erased_at is not null or v_lead.blanked_at is not null then
    raise exception 'This lead is gone.' using errcode = 'P0002';
  end if;
  if p_stage is not null and p_stage not in ('ready', 'nurture', 'converted', 'archived') then
    raise exception 'stage must be ready, nurture, converted or archived' using errcode = '22023';
  end if;
  if p_note is not null and length(p_note) > 280 then raise exception 'Note too long.' using errcode = '22023'; end if;
  v_before := jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason, 'phone_wrong', v_lead.phone_wrong, 'contact_id', v_lead.contact_id);

  if v_convert then
    -- A real conversation. The person whose phone this is (decision 25: never a second one), else whose email, else a new one.
    select ci.contact_id into v_contact from public.contact_identities ci
     where ci.tenant_id = v_lead.tenant_id and ci.channel = 'voice' and ci.external_id = v_lead.phone limit 1;   -- <the intake's identity shape: check 00021/00125>
    if v_contact is null and v_lead.email is not null then
      select c.id into v_contact from public.contacts c where c.tenant_id = v_lead.tenant_id and lower(c.email) = lower(v_lead.email) and c.erased_at is null limit 1;
    end if;
    v_existed := v_contact is not null;
    if v_contact is null then
      v_contact := (public.create_person(v_lead.tenant_id, v_lead.phone, v_lead.business_name, 'lead')->>'contact_id')::uuid;   -- <create_person's real signature; 00138 reads source 'lead' as "A lead you found">
      if v_lead.email is not null then perform public.set_person_email(v_contact, v_lead.email); end if;               -- 00125
    end if;
    update public.leads set contact_id = v_contact, stage = 'converted', closed_reason = null where id = p_lead_id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.converted', 'lead', 'lead', p_lead_id, jsonb_build_object('contact_id', v_contact, 'existed', v_existed, 'how', 'call'));
  elsif p_outcome = 'wrong_number' then
    update public.leads set phone_wrong = true where id = p_lead_id;
  elsif p_stage is not null then
    update public.leads set stage = p_stage, closed_reason = case when p_stage = 'archived' then p_reason else null end where id = p_lead_id;
  end if;

  if p_outcome is not null and p_outcome <> 'emailed' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.call', 'lead', 'lead', p_lead_id, jsonb_build_object('outcome', p_outcome, 'note', p_note, 'by', auth.uid()));
  elsif p_outcome = 'emailed' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.emailed', 'lead', 'lead', p_lead_id, jsonb_build_object('by', auth.uid()));   -- the owner said they sent it (S12)
  elsif p_reason in ('not_a_fit', 'customer') then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.not_a_fit', 'lead', 'lead', p_lead_id, jsonb_build_object('why', p_fit_reason, 'by', auth.uid()));
    if p_reason = 'customer' then
      insert into public.lead_suppressions (tenant_id, kind, key_hash, what) values (v_lead.tenant_id, 'place', public.lead_hash(v_lead.place_id), 'customer') on conflict do nothing;   -- <A's hash helper>
    end if;
  else
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.stage', 'lead', 'lead', p_lead_id, jsonb_build_object('stage', p_stage, 'reason', p_reason, 'by', auth.uid()));
  end if;

  select * into v_lead from public.leads where id = p_lead_id;
  insert into public.lead_operations (tenant_id, kind, lead_id, before, after, by_user, version)
  values (v_lead.tenant_id, 'stage', p_lead_id, v_before,
          jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason, 'phone_wrong', v_lead.phone_wrong, 'contact_id', v_lead.contact_id),
          auth.uid(), v_lead.version)
  returning id into v_op;
  return jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason, 'contact_id', v_lead.contact_id,
                            'existed', v_existed, 'converted', v_convert, 'op_id', v_op, 'version', v_lead.version);
end $$;
revoke execute on function public.lead_set_stage(uuid, text, text, text, text, text) from public, anon;
grant  execute on function public.lead_set_stage(uuid, text, text, text, text, text) to authenticated;
```

The three `<…>` placeholders are what the full version reads from A's 00139 and the older migrations before writing a line: the identity row's shape, `create_person`'s signature and `lead_hash`. Two things are fixed whatever they turn out to be: a click to `converted` writes `lead.stage`, never `lead.converted`, and `contact_id` stays null; and `lead_undo` (A's) restores `before` for a `stage` operation, which for a customer also removes the suppression this door wrote (never an opt-out's).

### 4.6 The view models, spelled

The functions `leads.ts` exports for the page, each with its test in `leads-vm.test.mjs` (the full version writes the bodies and the expected strings for the seeded rows, Task 21):

```ts
export interface LeadRowDto { id: string; search_id: string; place_id: string; business_name: string; category: string | null; city: string | null; state: string | null; street: string | null; phone: string | null; phone_agrees: boolean; phone_wrong: boolean; email: string | null; email_state: LeadEmailState; website: string | null; instagram: string | null; rating: number | null; reviews: number | null; stage: LeadStage; closed_reason: string | null; contact_id: string | null; places: number; found_at: string; exported_at: string | null; version: number; member: { class: LeadClass; fit: "strong" | "look" | "long" | null; reason: string; excluded_by: string | null; distance_m: number | null; counted: boolean; checks: LeadCheck[]; other_emails: { email: string; why: string }[] } }
export interface LeadCheck { key: "on_maps" | "phone_two_sources" | "mailbox" | "in_area" | "independent" | "right_kind" | "own_address"; how: "seen" | "read"; answer: "yes" | "no" | "unknown"; source: string; reason: string | null }
export interface LeadSearchDto { id: string; name: string; asked: string; asked_on: string; plan: LeadSearchPlan; plan_version: number; round: { id: string; seq: number; purpose: string; state: string; ending: LeadRoundEnding | null; question: { sentence: string; criterion_key: string } | null; target: number; counted: number; qualified: number; review: number; excluded: number; emails_checked: number; cost_usd: number; ended_at: string | null; undo_op_id: string | null; undo_version: number | null } }
export interface LeadCounts { all: number; ready: number; nurture: number; converted: number; said_no: number; not_a_fit: number }
export interface LeadSuggestionsDto { business_line: string; by_owner: boolean; made_at: string; items: { words: string; who_for: string; category_key: string; reach: string | null }[]; note?: string }

/** One row's words and shapes (§6.2). Nothing here is a stored value. */
export function toLeadRowVM(r: LeadRowDto, tz: string, now: Date): LeadRowVM;
/** The peek (§9.2, P2): the sub-line, the fit sentence, how to reach them, the checks in two groups, the other addresses, found. */
export function toLeadPeekVM(r: LeadRowDto, search: LeadSearchDto | null, tz: string, now: Date): LeadPeekVM;
/** The rail's rows under Leads (§6.1): the six lists with counts, then the searches with their marks. */
export function leadRail(counts: LeadCounts, searches: LeadSearchDto[]): { lists: { id: LeadList; label: string; count: number }[]; searches: { id: string; name: string; count: number; mark: "live" | "question" | null }[] };
/** "322 leads · 272 ready · 3 searches", and "1 search needs you" when one waits. */
export function leadsStanding(counts: LeadCounts, searches: LeadSearchDto[]): { total: string; parts: string[]; needsYou: { count: number; searchId: string } | null };
/** The strip for one search: every open state and every ending, claiming only what was seen (P3, S12, §8.8). */
export function leadStrip(s: LeadSearchDto, now: Date): { state: "running" | "checking" | "question" | "ended"; alert: boolean; title: string; parts: string[]; progress: number | null; actions: { id: string; label: string; primary?: boolean; arg?: unknown }[] };
```

```js
test("the strip says every ending in the PRD's words, one next step each, and nothing about money", () => {
  for (const ending of LEAD_ROUND_ENDINGS) {
    const vm = leadStrip(searchWith({ state: "ended", ending, counted: 61, target: 200 }), NOW);
    assert.equal(vm.state, "ended");
    assert.equal(vm.title.startsWith(LEAD_ENDING_WORDS[ending].split(" ")[0]), true, `${ending}: the title opens with the ending's own word`);
    assert.ok(vm.actions.length <= 2 && !/\$/.test(vm.title + vm.parts.join(" ")), ending);
  }
  const stopped = leadStrip(searchWith({ state: "checking", ending: null, counted: 61, target: 200, stopping: true }), NOW);
  assert.equal(stopped.title, "Stopping · checking the emails of the 61 found · nothing else was counted");
  const question = leadStrip(searchWith({ state: "waiting_on_owner", question: { sentence: "Most of the first 25 were chain gyms. Keep leaving them out?", criterion_key: "chain" } }), NOW);
  assert.deepEqual([question.alert, question.actions.map((a) => a.id)], [true, ["keep", "include", "stop_here"]]);
});

test("the rail and the standing line count what the lists hold, and say who needs you", () => {
  const rail = leadRail(COUNTS, [SEARCH_WAITING, SEARCH_DONE]);
  assert.deepEqual(rail.lists.map((l) => [l.label, l.count]), [["All leads", 322], ["Ready", 272], ["Contacted", 31], ["Talking", 9], ["Said no", 6], ["Not a fit", 4]]);
  assert.deepEqual(rail.searches.map((s) => s.mark), ["question", null]);
  assert.deepEqual(leadsStanding(COUNTS, [SEARCH_WAITING, SEARCH_DONE]), { total: "322 leads", parts: ["272 ready", "2 searches"], needsYou: { count: 1, searchId: SEARCH_WAITING.id } });
  assert.deepEqual(leadRail({ ...COUNTS, said_no: 0 }, []).lists.map((l) => l.label), ["All leads", "Ready", "Contacted", "Talking", "Not a fit"], "Said no only when there are any");
});
```
## Task 5: the gateway takes two more purposes (written in full; v2:6262–6310 corrected)

**Files:** `apps/edge/api/admin/llm.ts:53, :62–66`, `apps/edge/lib/ask-gateway.ts:132–170` · Test `tooling/scripts/tests/lead-gateway.test.mjs`

- [ ] **Step 1: The failing tests.**

```js
// tooling/scripts/tests/lead-gateway.test.mjs
const { validateGatewayRequest, GATEWAY_PURPOSES } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/ask-gateway.ts")).href);
const base = { model: "claude-sonnet-5", max_tokens: 600, system: "s", messages: [{ role: "user", content: "hi" }] };
const format = { type: "json_schema", schema: { type: "object", additionalProperties: false, required: ["subject"], properties: { subject: { type: "string" } } } };

test("three purposes, and only the two that are not Ask may name an output format", () => {
  assert.deepEqual([...GATEWAY_PURPOSES], ["ask", "lead_draft", "lead_suggest"]);
  const draft = validateGatewayRequest({ ...base, output_config: { effort: "low", format } }, "lead_draft");
  assert.deepEqual(draft.request.output_config, { effort: "low", format });
  const ask = validateGatewayRequest({ ...base, output_config: { effort: "low", format } }, "ask");
  assert.deepEqual(ask.request.output_config, { effort: "low" }, "Ask's own turn is unchanged");
  assert.deepEqual(validateGatewayRequest({ ...base, output_config: { effort: "low" } }).request.output_config, { effort: "low" }, "the second argument defaults to ask, so every caller on main still resolves");
});

test("a format that is not a JSON schema, or is too large, is refused", () => {
  assert.equal(validateGatewayRequest({ ...base, output_config: { format: { type: "text" } } }, "lead_draft").ok, false);
  const big = { type: "json_schema", schema: { type: "object", description: "x".repeat(9_000) } };
  assert.equal(validateGatewayRequest({ ...base, output_config: { format: big } }, "lead_draft").ok, false);
});
```

- [ ] **Step 2: Write it.** `ask-gateway.ts`: `GatewayRequest.output_config` (:132) gains `format?: { type: "json_schema"; schema: Record<string, unknown> }`; after `EFFORTS` (:135):

```ts
/** What the gateway spends the key on. Every purpose counts in Ask's own daily budget (ASK_USAGE_KIND). */
export const GATEWAY_PURPOSES = ["ask", "lead_draft", "lead_suggest"] as const;
export type GatewayPurpose = (typeof GATEWAY_PURPOSES)[number];
const FORMAT_MAX = 8_000;

function formatOf(raw: unknown): { type: "json_schema"; schema: Record<string, unknown> } | null | "bad" {
  if (raw === undefined) return null;
  const f = raw as { type?: unknown; schema?: unknown } | null;
  if (!f || f.type !== "json_schema" || !f.schema || typeof f.schema !== "object" || Array.isArray(f.schema)) return "bad";
  return JSON.stringify(f.schema).length > FORMAT_MAX ? "bad" : { type: "json_schema", schema: f.schema as Record<string, unknown> };
}
```

`validateGatewayRequest(raw, purpose: GatewayPurpose = "ask")` (:144) keeps every rule it has and builds `output_config` as: the effort when it is one of `EFFORTS` (:169–170, as today), plus, when `purpose !== "ask"`, the format from `formatOf((r.output_config as { format?: unknown })?.format)`, refusing `{ ok: false, error: "output_config.format: a JSON schema under 8,000 characters" }` on `"bad"`. `llm.ts:53` becomes `if (!UUID.test(tenantId) || !UUID.test(userId) || !(GATEWAY_PURPOSES as readonly string[]).includes(String(body.purpose)))` with the error `"tenant_id, user_id and a purpose required"`, then `validateGatewayRequest(body.request, body.purpose as GatewayPurpose)`; `recordAskUsage`'s data gains `purpose: body.purpose` (the usage row says which of Ask's uses spent it).

- [ ] **Step 3:** Run `lead-gateway.test.mjs` and the existing `ask*.test.mjs` → PASS. Commit — "The model gateway writes a draft and the first day's suggestions, both in Ask's budget".

## Task 6: Ask's two tools and the card (written in full; v2:6312–6478 corrected)

**Files:** `apps/dashboard/src/server/ask/tools.ts:81, :606`, `proposals.ts:65, :530, :551`, `prompt.ts:37`, `packages/contracts/src/ask.ts:379, :393`, `apps/dashboard/src/legacy-bridge/ask/commit.ts:62, :156`, `apps/dashboard/src/legacy/pages/ask-turn.jsx:122–124` (+ `?v=` in `Chanlytics.html:80`) · Tests `lead-ask.test.mjs`; `ask.test.mjs:375` (an existing assertion's value changes); `ask.test.mjs:599–606` stays green (26 against 36)

- [ ] **Step 1: The failing tests** (v2:6320–6352 minus `search_leads`; `toolContext`, `world` and `fakeClient` follow `ask.test.mjs`'s and `ask-commit.test.mjs`'s helpers):

```js
// tooling/scripts/tests/lead-ask.test.mjs
test("propose_lead_search makes a plan card for an owner; the model's plan is completed and checked, never trusted", async () => {
  const t = toolContext({ role: "owner", tables: world() });
  const out = await buildProposal(t, "propose_lead_search", MODEL_INPUT);
  assert.equal(out.isError, false);
  assert.deepEqual([out.proposal.kind, out.proposal.needs, out.proposal.title], ["lead_search", "owner", "Find 200 personal trainers"]);
  assert.equal(out.proposal.summary, "Find 200 personal trainers in Austin, TX with a website, then find their email and check it. Leaving out: chain gyms.");
  assert.equal(out.proposal.payload.plan.version, 1);
  assert.match(JSON.parse(out.result).note, /Nothing has happened yet/);
});

test("the planner's refusals are words for the model to say, and no card", async () => {
  const t = toolContext({ role: "owner", tables: world() });
  const out = await buildProposal(t, "propose_lead_search", { ...MODEL_INPUT, country: "CA", region: "ON" });
  assert.deepEqual([out.proposal, out.isError], [null, true]);
  assert.match(JSON.parse(out.result).error, /I can only find businesses in the US for now/);
  const op = await buildProposal(toolContext({ role: "operator", tables: world() }), "propose_lead_search", MODEL_INPUT);
  assert.match(JSON.parse(op.result).error, /only an owner can start a lead search/);
});

test("list_lead_searches says what was asked, in the owner's words, and how each ended", async () => {
  const s = JSON.parse((await runTool(toolContext({ role: "viewer", tables: world() }), { name: "list_lead_searches", input: {} })).result);
  assert.deepEqual(Object.keys(s.searches[0]).sort(), ["asked", "asked_on", "counted", "ending", "id", "name", "qualified", "review", "state"]);
  assert.ok(s.searches.every((x) => Object.values(x).every((v) => typeof v !== "string" || v.length <= 120)));
});

test("the card commits to POST lead-searches marked as Ask's, and its undo stops the search", async () => {
  const { client, calls } = fakeClient({ "POST /api/v1/lead-searches": { search_id: SEARCH, round_id: ROUND }, [`POST /api/v1/lead-searches/${SEARCH}/stop`]: { ok: true } });
  const done = await commitProposal(win, { id: "p1", kind: "lead_search", needs: "owner", title: "Find 200 personal trainers", summary: "…", payload: { plan: PLAN }, undo: "Stop the search" }, client);
  assert.deepEqual([done.ok, done.receipt, done.undo], [true, "Finding 200 personal trainers. It carries on if you leave; Leads shows it.", { search_id: SEARCH }]);
  assert.equal(calls[0].headers["x-via"], "ask");
  const undone = await undoProposal(win, { kind: "lead_search" }, { state: "done", receipt: done.receipt, atMs: Date.now(), undo: done.undo }, client);
  assert.deepEqual([undone.ok, undone.receipt], [true, "Stopping. Whatever it found is kept, and the emails already found are still checked."]);
});
```

- [ ] **Step 2: The permission and the gate.** `ask.ts:379`: `AskProposal["kind"]` gains `| "lead_search"`; :393: the map's type gains `| "find"` and the object `lead_search: "find"` (release A added `find` to `ROLE_PERMS` (`config.ts:21`) and `PERM_DOING` (`refusal.ts:199`); if it did not, add both here with v2:5787–5792's two lines, and the test `assert.equal(roleGate("operator", "find").reason, "Only an owner can find leads.")` — role first, `refusal.ts:215`). `ask.test.mjs:375`'s object gains `lead_search: "find"`.
- [ ] **Step 3: The tool schemas.** In `tools.ts`'s `READ_TOOLS` (:81), after `get_calendar` (:143):

```ts
  {
    name: "list_lead_searches",
    description: "The workspace's lead searches, newest first: what was asked in the owner's words and when, its state or ending in words, and how many qualified, need review and were counted. Read this before proposing a search, so a plan is not repeated.",
    input_schema: obj({}),
  },
```

and in `proposals.ts`'s `ACT_TOOLS` (:65), after `propose_invite` (:135):

```ts
  {
    name: "propose_lead_search",
    description: "Propose a search for businesses in the US the owner could reach: what kind (plural, and one of them), how many (50, 100, 200 or 500 unless they said a number), where (a city and its two-letter state, a ZIP, or a state), the contact standard (phone, or email checked), the criteria each with whether it must be seen or is likely from what Claude reads, who to leave out (chains, other kinds; short chips in plain words), up to three search terms (widest first). looking_for is local_businesses, or people, online_sellers or other when that is what was asked: those are answered in words, not searched. asked: the owner's words. It becomes a plan card the owner approves; nothing is searched or spent before that. Owner-only.",
    input_schema: obj({
      looking_for: { type: "string", enum: ["local_businesses", "people", "online_sellers", "other"] },
      country: { type: "string" }, count: { type: "integer" }, who: { type: "string" }, who_one: { type: "string" }, category_key: { type: "string" },
      terms: { type: "array", items: { type: "string" } },
      city: { type: "string" }, region: { type: "string" }, zip: { type: "string" },
      contact: { type: "string", enum: ["phone", "email"] },
      criteria: { type: "array", items: obj({ text: { type: "string" }, standard: { type: "string", enum: ["likely", "seen"] }, required: { type: "boolean" } }, ["text", "standard", "required"]) },
      leave_out: { type: "array", items: obj({ words: { type: "string" } }, ["words"]) },
      asked: { type: "string" },
    }, ["looking_for", "country", "count", "who", "who_one", "category_key", "terms", "region", "contact", "criteria", "asked"]),
  },
```

`buildProposal`'s switch (:530) gains `case "propose_lead_search": return await proposeLeadSearch(t, input);`; `PROPOSAL_LABELS` (:551) gains `propose_lead_search: "Planning a search"`; `toolLabel` (:606) gains `list_lead_searches: "Reading your searches"`. The builder is v2:6451–6475's `proposeLeadSearch` with the shaped input above handed to `planLeadSearch(shaped, facts)` from `lead-search.ts` (PRD §12.8 names it A's; if the interface did not ship it, it is written here beside `planSentence`: it turns the shaped ask into a `LeadSearchPlan` with `version: 1`, the sentence's parts, the estimate and the allowance folded in, or one of the three refusals in words: outside the US, people, no card fits, which is logged as demand), and `facts` from A's reads (the switch, the month, the priors). It never writes:

```ts
async function proposeLeadSearch(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  if (t.role !== "owner") return refuse("only an owner can start a lead search; say so, and that an owner can ask");
  const shaped = ProposeLeadSearchSchema.safeParse({
    ...input,
    city: str(input.city, 60) || null,
    zip: /^\d{5}$/.test(String(input.zip ?? "")) ? String(input.zip) : null,
    criteria: (Array.isArray(input.criteria) ? input.criteria : []).slice(0, 6),
    leave_out: (Array.isArray(input.leave_out) ? input.leave_out : []).slice(0, 6).map((l) => ({ words: str((l as Record<string, unknown>).words, 40) })),
  });
  if (!shaped.success) return refuse(`the plan is not complete: ${shaped.error.issues[0]?.path.join(".")} ${shaped.error.issues[0]?.message}`);
  const facts = await planFacts(t.ctx, t.tenantId);           // release A's reads: the switch, the month, the priors
  const r = planLeadSearch(shaped.data, facts);               // lead-search.ts: a plan (version 1), its sentence, or a refusal in words
  if (!r.ok) return refuse(r.refusal.text);
  return propose({ kind: "lead_search", needs: "owner", title: r.view.title, summary: planSentence(r.plan), payload: { plan: r.plan, view: r.view, facts }, undo: "Stop the search" });
}
```

`listLeadSearches` reads `searchesOf` on the caller's session, cuts every string to 120 characters, answers `{ searches: [{ id, name, asked, asked_on, state, ending, qualified, review, counted }] }`.

- [ ] **Step 4: The rules the model reads.** `prompt.ts`'s `ASK_RULES` (:37) gains:

```ts
  "Leads are businesses Claude found for the owner to reach; People are the ones who reached the business. To find businesses, read list_lead_searches, then propose_lead_search: one plan, never a search. Say the plan in one sentence; never promise how many will be found, and never say a search has started until the card is approved.",
  "Only in the US. Never find people at home: suggest businesses whose clients need the owner next. A lead is emailed or called by the owner from their own inbox and phone; texts and offers wait for the lead's own yes, so never propose a broadcast, a playbook or a consent change for a lead.",
```

and the rule that lists proposable acts gains "a lead search".

- [ ] **Step 5: The card.** `commit.ts`'s `commitProposal` (:62) gains:

```ts
    case "lead_search": {
      const plan = (pl.plan ?? {}) as { count?: number; terms?: string[] };
      const r = await viaAsk(client, "POST lead-searches", { body: pl.plan as never });
      if (!r.ok) return r;
      return { ok: true, receipt: `Finding ${plan.count ?? ""} ${plan.terms?.[0] ?? "businesses"}. It carries on if you leave; Leads shows it.`.replace(/\s+/g, " "), undo: { search_id: r.data.search_id } };
    }
```

and `undoProposal` (:156):

```ts
    case "lead_search": {
      const r = await viaAsk(client, "POST lead-searches/[id]/stop", { params: { id: s(u.search_id) } }, undoOf);
      if (!r.ok) return r;
      return { ok: true, receipt: "Stopping. Whatever it found is kept, and the emails already found are still checked.", undo: null };
    }
```

`ask-turn.jsx`: `KIND` (:122) gains `lead_search: t.kLeads`, `ICON` (:123) `lead_search: "search"`, `openRoute` (:124) gains `p.kind === "lead_search" ? "clients/leads" :` before the Inbox fallback; the words map gains `kLeads: "Leads"`. Bump its `?v=` (`Chanlytics.html:80`). Task 9 replaces the card's body with the plan card; until then the summary is the sentence. The route's own sentence on a refusal (402, 409: paused, the month used, the budget used) is the card's `err`, as every other card shows one.

- [ ] **Step 6:** Run `lead-ask.test.mjs ask.test.mjs ask-commit.test.mjs` → PASS (the cap test counts 15 reads and 11 acts: 26 ≤ 36). Commit — "Ask plans a lead search as a card an owner approves, and reads what was searched before".

## Task 7: every consent path refuses a converted lead's borrowed yes (written in full; v2:6480–6530 corrected)

**Files:** Tests `tooling/scripts/tests/consent-paths.test.mjs`, `consent-paths.db.test.mjs` (4.2's `leads.db.test.mjs` holds the doors themselves)

The check is PRD §14's "every consent path refuses a converted lead in a test". The rule lives in the two doors (Task 4.2, item 10), proven on Postgres there. This task proves the other half: **every path a person can take to record a yes reaches one of those doors and carries its refusal back in words**, nothing writes consent around them, and the send paths keep refusing a person with no yes.

- [ ] **Step 1: The tests.**

```js
// tooling/scripts/tests/consent-paths.test.mjs
/**
 * Every way a member can record a yes reaches a consent door, and a door's
 * refusal is what the member reads (PRD §0.4, decision 19: a converted lead's
 * yes comes only from them, permanently). The doors are proven on Postgres
 * (leads.db.test.mjs); here the routes run over fakeDb whose doors refuse as
 * release B's do.
 */
import { LEAD_CONSENT_REFUSAL, mayMessageFor } from "../../../packages/contracts/src/index.ts";
const doorRefuses = {
  set_contact_consent: () => { throw Object.assign(new Error(LEAD_CONSENT_REFUSAL), { code: "42501" }); },
  set_marketing_consent: () => { throw Object.assign(new Error(LEAD_CONSENT_REFUSAL), { code: "42501" }); },
};

test("ACCEPTANCE: the four consent routes refuse a converted lead's yes in the door's words, and write consent nowhere else", async () => {
  const cases = [
    [one, { consent: "opted_in", source: "in_person" }, { id: P1 }],
    [many, { ids: [P1], consent: "opted_in", source: "phone" }, {}],
    [oneMarketing, { consent: "opted_in", source: "form" }, { id: P1 }],
    [manyMarketing, { ids: [P1], consent: "opted_in", source: "form" }, {}],
    // The desk's own-message door (00137, #675) names a real message and is still refused: the yes must come through the edge.
    [oneMarketing, { consent: "opted_in", source: "customer_message", message_id: MSG }, { id: P1 }],
  ];
  for (const [route, body, params] of cases) {
    const ctx = ctxFor(world(), params, doorRefuses);
    const out = await route.PUT.run(send("PUT", body, inA), ctx).catch((e) => e);
    const said = out instanceof Error ? out.message : out.failed?.[0]?.message;
    assert.equal(said, LEAD_CONSENT_REFUSAL);
    assert.equal(ctx.supabase.seen.filter((q) => q.table === "contacts" && q.op === "update").length, 0, "no write around the door");
  }
});

test("a converted lead with no yes is refused by every send path, as any person with no yes is", () => {
  const lead = { consent: "unknown", marketing_consent: "unknown", dnc: false, phone_e164: "+15550100" };
  assert.notEqual(mayMessageFor(lead, "marketing", { proactive: true }), null);
  assert.notEqual(mayMessageFor(lead, "conversational", { proactive: true }), null);
});

test("Ask has no act that could record a yes", () => {
  assert.deepEqual(ACT_TOOLS.map((t) => t.name).filter((n) => /consent|yes|opt/.test(n)), []);
});
```

```js
// tooling/scripts/tests/consent-paths.db.test.mjs (leads.db.test.mjs's world: a lead converted by an Interested call)
test("ACCEPTANCE: a member cannot write consent except through a door: a direct update changes nothing", { skip }, async () => {
  const { data, error } = await owner.from("contacts").update({ consent: "opted_in", consent_source: "in_person" }).eq("id", convertedContact).select("id");
  assert.equal(error, null);
  assert.deepEqual(data, [], "contacts has no member UPDATE policy: RLS turns the write into nothing (a forbidden UPDATE succeeds with 0 rows)");
  const { data: after } = await db.from("contacts").select("consent").eq("id", convertedContact).single();
  assert.equal(after.consent, "unknown");
});

test("ACCEPTANCE: the doors a member can call that write consent are exactly the two that refuse a converted lead's borrowed yes", { skip }, () => {
  const rows = query(`select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')
       and p.prosrc ~* 'update\\s+(public\\.)?contacts\\s+set[^;]*consent\\s*=' order by 1`);
  assert.deepEqual(rows.map((r) => r.name), ["set_contact_consent", "set_marketing_consent"]);
});
```

The skip is the credentialed one every `*.db.test.mjs` carries; it fails, with the sign-in error, whenever the database is there (E11). The yes page's `form` path and the inbound `customer_message` path run as the service role with no session and are accepted by design; `leads.db.test.mjs` shows both landing a yes on a converted lead. The send paths' own suites (`broadcasts.test.mjs`, `outbound-gate.test.mjs`, `voice-doors.test.mjs`, `deliver.test.mjs`) each gain one case whose person is a converted lead with `consent: "unknown"`, asserting the refusal they already give a person with no yes: nothing new in the code, one new row in each fixture.

- [ ] **Step 2:** Run both → PASS. Mutation checks: make `recordConsentMany` (`server/consent.ts:59`) update `contacts` directly for one id and see the first test fail; add a throwaway definer function that sets `consent` and see the catalog test name it. Commit — "Every consent path reaches a door, and a converted lead's borrowed yes is refused in its words, for good".

## The screens (Tasks 8–19)

Every screen below is a task of its own, each a sketch: its props, its state machine where v2 had one (v2:6960–7060, corrected), what it draws, the test that proves it, and what the full version must add. Common to all of them: the components are hookless with their state in `ClientsAReal` (Task 2); every act is the courier's (Task 3); every word is contracts' (Task 4.1) and the vendor is never named; the design is the canvas's States artboard and nothing is redesigned; the tests run on the people-honest harness (`leads-honest.test.mjs`), and the phone is Task 18. A hook a screen needs (hold-to-talk, `visibilitychange`) is declared in `ClientsAReal` and handed down.

## Task 8: the composer, typing and voice (sketch: written in full after release A)

**Props:** `LeadFinder({ open, stage, words, proposal, refusal, busy, suggestions, talk, onWords, onPlan, onApprove, onBack, onClose })` in `leads-finder.jsx`; `stage` is `compose | thinking | plan | starting`; `talk` is `useAskTalk`'s answer (`ask-hooks.jsx:16`: hold to talk on the browser's own recogniser, nothing uploaded), declared in `ClientsAReal` and handed down.

**The state machine** (v2:6971–6988, corrected: the turn is Ask's own, sent with `scope: null` and `surface: "clients"`, `legacy-bridge/ask/api.ts:89`; the scope shown is the finder's own word "Leads"):

```
idle ──F · Find leads · New search · a suggestion──▶ compose
compose ──hold the mic──▶ compose            (talk fills the input with what was heard, interim words as they come)
compose ──Enter · Plan it──▶ thinking         (one Ask turn through window.__ask.send; the trace line streams)
thinking ──a lead_search proposal──▶ plan     (the card: plan, view and facts from the proposal's payload, Task 9)
thinking ──words and no card──▶ compose       (a refusal: outside the US, people, no card fits, paused; the words under the input)
plan ──Change what I asked──▶ compose         (the words kept)
plan ──Find N leads──▶ starting               (Task 9's approve: commitProposal, POST lead-searches marked as Ask's)
starting ──ok──▶ idle                          (the strip takes over from the surface's newest search)
starting ──refused (402, 409, 429)──▶ plan    (the route's sentence under the actions)
compose · thinking · plan ──Esc · ×──▶ idle
```

**What it draws:** the input ("Describe the businesses you want", a mic held to talk, `aria-pressed` while listening), the trace line while thinking, three suggestions "for <workspace>, from what your business does", each with how reachable that kind is ("about 6 in 10 have an email"; the first-day suggestions, Task 17), and the refusal's words under the input when there is one. On a desktop it folds out above the table; on a phone it is the bottom sheet (Task 18).

**Pinning tests:** "the composer turns words into a plan card through one Ask turn, sent with no scope and the clients surface" (the fake `__ask.send` answers a `lead_search` proposal; the fetch log shows one turn); "a refusal is words under the input and no card"; "hold-to-talk fills the input with what was heard and uploads nothing" (the fake recogniser); "Esc closes the finder before it clears a selection" (Task 2's listener).

**What the full version must add:** the `SendEvent` shapes the composer listens to (`api.ts:89`'s `on(ev)`: the proposal event's payload keys); the words of the trace line; the `?v=` numbers; the mutation checks (a second Ask turn on a picked token fails the first test).

## Task 9: the plan card (sketch: written in full after release A)

**Props:** `LeadPlanCard({ plan, view, facts, busy, refusal, onChange(plan), onApprove(plan), onBack })`, hookless; the Ask card's body too (`ask-turn.jsx`, the `lead_search` kind, Task 6: the pickers edit the proposal's plan in the card's own state before the commit sends it).

**What it draws (§8.3, §0.1, §0.2):**
- The sentence, every bold word a picker: "Find **200** **personal trainers** **in Austin, TX** that have **a website**, then find **their email** and check it." The count picker shows minutes per option (50 · about 3 min; 100; 200 · about 8; 500). The contact standard is in the sentence and is a picker: "then find their email and check it" or "a phone is enough". Each criterion shows its standard: *seen* or *likely*; a criterion that must be seen and the card cannot see is said before anything is spent, with the likely version offered, and the owner chooses (§0.1). A picked token re-plans in the page through A's `planVersionOf(plan, changed)` and `planSentence`; no model call.
- **Leaving out** chips, each removable: Claude's reading of the ask ("Chain gyms"). The "you said" chips are release C.
- **Likely**: the two-part bar and "About 116 will have an email; the rest you call · from past searches for trainers", from `lead_niche_prior`; a kind never searched says "checked after the first 25".
- **Facts**: "About 8 minutes — leave the page if you like · Skips the 14 already yours · Counts only matches you can reach · 486 left this month". The estimate says it **updates after the first 25** (P3). The allowance and the budget are folded into the one unit, leads: when the budget binds, the sentence says why and offers a smaller search or a phone standard ("Emails for law firms are hard to find, so this month covers about 60 more. Find 60 now?", decision 27). There is no dollar meter.
- **Find 200 leads** and **Change what I asked**; the foot: "You can email and call leads. Texts and offers wait for their yes."
- Near the month's limit: **Find 36 now** (the count clamped to what is left) and the day the leads renew, said. The PRD's "or all 200 when your leads renew on Oct 1" needs a scheduled start that release A's `lead_search_create` does not take; the full version decides between a bell on renewal day and a `start_after` on the door (the self-review lists it).

A picked token is one call on the page, no model:

```js
// leads-honest.test.mjs, the plan card
test("a changed count re-plans without the model, and a changed area makes a new version the owner approves", async () => {
  await composeToPlan("200 personal trainers in Austin with a website");      // one fake Ask turn answers the proposal
  assert.equal(seen.filter((r) => r.key === "POST /api/v1/ask").length, 1);
  pick(byTestId(tree, "plan-count"), "50");
  assert.equal(textOf(byTestId(tree, "plan-sentence")), "Find 50 personal trainers in Austin, TX with a website, then find their email and check it. Leaving out: chain gyms.");
  assert.equal(textOf(byTestId(tree, "plan-count")).includes("about 3 min"), true);
  assert.equal(planShown().version, 1, "a count alone keeps the version");
  pick(byTestId(tree, "plan-area"), "Round Rock, TX");
  assert.equal(planShown().version, 2, "the area is one of the five that make a new version (S15)");
  assert.equal(seen.filter((r) => r.key === "POST /api/v1/ask").length, 1, "still one turn");
});
```

**Pinning tests:** the test above; "the contact standard is in the sentence and its picker switches it, and the estimate changes with it"; "a must-be-seen fact the card cannot see is said before spending, with the likely version offered"; "the estimate says it updates after the first 25, and the allowance and the budget are one sentence in leads; when the budget binds it says why and offers a smaller search or a phone standard"; "Find N leads commits the card through POST lead-searches; a 402 is said under the button in the route's words"; "near the limit the card offers what is left and says when the leads renew"; "the Ask card draws the same plan card, and approving it sends the plan as changed".

**What the full version must add:** the picker markup and its keyboard (a picker is a `<button aria-haspopup="listbox">`, its options `role="option"`, Esc closes it without reaching the page's listener: `PL_OVERLAY` sees a `role="listbox"`? It does not; the pickers are `.pl-finder`'s own and close on their own key handler); the minutes per count from A's `estimateRoundUsd` and the card's brief; the exact strings for the seeded plan; the version bump rule (a change to the area, count, contact, criteria or spend makes version 2; the card shows "changed" and approve sends version 2).

## Task 10: the strip and the question (sketch: written in full after release A)

**Props:** `LeadStrip({ vm, onAction(id, arg) })`, hookless; `vm = leadStrip(search, now)` (contracts, Task 4.1) with `{ state, title, parts, actions, alert, progress }`.

**What it draws:**
- **Running:** a live dot, "Finding personal trainers in Austin · 86 of 200 · 41 emails checked · about 4 min left · estimates update after the first 25", **Stop**, a 2px progress line in the accent. Rows arrive in the order found (Task 2's rule 11): Excluded places dimmed with their criterion and "Not checked"; Needs review rows say why; Qualified leads say "Checking" until their check lands.
- **The question after 25** (§8.5, P4): the strip becomes the question in the accent tint with `role="alert"`: the sentence from A's `questionAfterProbe` (an intent check, never "relax a requirement"), "Nothing is spent while this waits. Answer and it carries on.", **Yes, keep going**, **Include <the criterion>**, **Stop here**. The 25 rows stay visible under it. The rail marks the search "?" and the standing line says "1 search needs you"; the bell's `leads_question` row says it too.
- **Every ending** (§8.8), one strip each, from `LEAD_ENDING_WORDS` (A's) with the counts filled in, claiming only what was seen (P3), and one next step that makes a new round:

| `ending` | The owner reads | The step |
|---|---|---|
| `target_reached` | "Found 200 personal trainers · 88 you can email · 72 by phone · 40 left out" | **40 left out** opens `c-excluded`; **Sort by fit** |
| `searched_everything` | "Found 160 personal trainers · everything these searches returned in Austin"; when nothing matched: "There are 3 personal trainers in Marfa, TX, and all three are chains, which you asked me to leave out. Nothing was counted." | **Find 40 more nearby** (the areas in its tooltip: the finder at plan with Claude's nearby areas as the where word); **Look in Alpine and Fort Davis** · **Include chains** |
| `month_leads_used` | "Stopped at 464 · this month's leads are used · the 464 found are yours" (the before-the-round form is the plan card's, Task 9) | when the leads renew, said |
| `budget_used` | "Stopped at 61 · this month's searching is used up · the 61 found are yours" | a phone standard next month, said |
| `few_new_matches` | "All 64 chiropractors in Austin are already yours. Look further out, in Round Rock and Pflugerville?" | **Look further out** (the finder with the nearby areas) |
| `stopped` | "Stopping · checking the emails of the 61 found · nothing else was counted" while the check runs (S12); then "Stopped at 61 · the 61 found are yours" | **Carry on** (`more`, purpose `topup`) |
| `source_failed` | "Stopped at 86: the source stopped answering · the 61 found are yours · nothing more was counted" | **Try again** (`more`, `topup`) |
| `question_unanswered` | "Stopped after a day without your answer · the 12 found before it asked are yours" | **Answer now** (`more`, `topup`, with the answer's plan) |
| `paused` | "Lead searches are paused for now · your leads are all here · nothing is being counted" | none |

When a round ended at its limit rather than the area's, the strip offers **Find more in Austin** (`more`, `topup`, the same plan). **Undo** (within 24 hours) names `undo_op_id, undo_version` from the view (`__leadUndo`) and says "Removed the 160 you had not touched. The 3 you worked are kept." — exported leads stay (E9). **12 new** (E8) merges through `__leadsTakeOffered`. The bell's `leads_ready` row says "Your search for personal trainers in Austin is done".

**Actions to the courier:** `stop` → `__leadSearchStop(id)`; `keep`/`include`/`stop_here` → `__leadSearchAnswer(id, answer, plan?)` (Include's toast is the route's words, "Chain gyms count now, including the 9 already found."); `excluded`/`review` → `__leadsView` with `c-`; `more`/`nearby`/`look_further` → the finder at plan, whose approve calls `__leadSearchMore(id, "topup", plan)`; `carry_on`/`try_again`/`answer_now` → `__leadSearchMore(id, "topup", plan)`; `undo` → `__leadUndo`; `sort_fit` → `__leadsView({ sort: "fit", dir: "asc" })`; `take_offered` → `__leadsTakeOffered`; `not_now` → dismissed for the session.

**Pinning tests:** "the running strip says what is true and its Stop posts stop"; "the question strip is the accent tint with role alert, its three answers post what they say, nothing else in the strip moves while it waits, and the 25 rows stay under it"; "every ending is one strip with one next step" (table-driven over `LEAD_ENDING_WORDS`'s nine keys: each title, its parts, its action and the route or courier call it makes); "after Stop the strip says the emails of the N found are still being checked, then that the N are the owner's"; "Done never re-sorts: it offers Sort by fit and says 12 new; the rows under it hold their order".

**What the full version must add:** `leadStrip`'s contract test with the expected string for every state on the seeded search; the progress line's arithmetic (counted over target, capped); the `role="alert"` timing (set once when the state becomes `waiting_on_owner`, so a screen reader says it once); the bell rows' exact titles (Task 4.2 item 8) pinned in `notifications.test.mjs`'s style.

## Task 11: Qualified, Needs review and Excluded (sketch: written in full after release A)

**What it draws (§8.7, §0.1, S9):** with a search picked, its three counts under its rail row, each a view (`c-qualified`, `c-review`, `c-excluded`). **Needs review**: each row says why in the Fit column ("Couldn't check the email", "No location", "Read, not seen: independent"), with **Keep** (counts, the month it is kept) and **Exclude** (free) on the row (hover and cursor) and in the peek. **Excluded**: chips by criterion at the head of the view ("Chains 26 · Not a personal trainer 14"), each row's criterion in the Fit column, "Not checked" for its email, and **Put back** on the row and in the peek: the owner's override, through the door that counts. The three take the owner permission `find` (release A's routes); an operator sees them disabled with the gate's sentence (`window.gate("find", "keep this lead")`, `data-bits.jsx:266`: `aria-disabled`, `aria-description`, the sentence at the control on a press, never `disabled` + `title`). Each toasts with Undo through the operation the door answered (`{ op_id, version }`): "Kept. It counts as a lead this month." · "Excluded. Nothing counted." · "Put back. It counts as a lead now." A refusal is the route's sentence: a hidden place ("Already a customer, so it stays hidden"), one outside the area, the month's leads used.

The row's three acts, gated the page's way (`legacy/CLAUDE.md`'s role-gate pattern: the gate spread after the handler; denied → `aria-disabled`, `aria-description`, the sentence at the control on a press):

```jsx
const LeadRowActions = ({ l, onCall, onCopy, onKeep, onExclude, onPutBack, canFind }) => (
  <span className="cl-row-actions ld-row-actions">
    {l.phone && !l.phoneWrong && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onCall(l.id); }} title="Call from your phone"><Icon name="phone" size={11} /></button>}
    {l.email && l.emailState !== "invalid" && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onCopy(l.id); }} title="Copy the email"><Icon name="copy" size={11} /></button>}
    {l.cls === "review" && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onKeep(l.id); }} {...window.gate("find", "keep this lead")}>Keep</button>}
    {l.cls === "review" && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onExclude(l.id); }} {...window.gate("find", "exclude this lead")}>Exclude</button>}
    {l.cls === "excluded" && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onPutBack(l.id); }} {...window.gate("find", "put this lead back")}>Put back</button>}
  </span>
);
```

**Pinning tests:** "a Needs review row says why; Keep counts it and Exclude is free, each with Undo through its operation"; "an Excluded row shows its criterion and Not checked, and Put back counts it; a hidden or out-of-area place's Put back is refused in a sentence"; "an operator sees Keep, Exclude and Put back disabled with the gate's sentence, and pressing one shows it at the control"; "the Excluded view's chips count by criterion and each narrows the rows".

**What the full version must add:** the door answers' shapes from A (`{ op_id, version }` and the three refusals `{ error: 'hidden' | 'out_of_area' | 'month_leads_used' }`) and the route's sentence for each; the chips' derivation from `lead_search_members.excluded_by`; the expected counts on the seeded search (2 qualified, 1 review, 1 excluded).

## Task 12: the peek (sketch: written in full after release A)

**Props:** `LeadPeek({ vm, mode, armed, draft, onClose, onStage, onNotAFit, onCall, onDraft, onKeep, onExclude, onPutBack, onCopy })` in `leads-peek.jsx`, hookless; `role="dialog"` with `.pl-peek` (Task 2's `PL_OVERLAY`), 408px beside the table on a desktop, a full-height sheet on a phone; `vm = toLeadPeekVM(row, search, tz, now)`.

**The state machine** (v2:7069–7087, corrected: a stage click to Talking keeps the lead; the draft and the call are Tasks 13 and 14):

```
closed ──a row · Enter──▶ info
info ──the stage control──▶ info      (stage {kind:"stage"}; Talking says "They join People when they write or call in, or when a call goes well", with Undo)
info ──Not a fit──▶ why ──a reason──▶ info   (Task 15)
info ──Draft──▶ draft                  (Task 13)          info ──Call · C──▶ info, call-armed   (Task 14)
info (review) ──Keep · Exclude──▶ info;  info (excluded) ──Put back──▶ info   (Task 11)
any ──Esc · ×──▶ closed                (Esc: the listener's first branch, Task 2)
```

**What it shows (§9.2, P2, S12):** the business and its sub-line; the stage control (`role="radiogroup"`, Ready · Contacted · Talking) and **Not a fit**; the fit as a sentence ("Strong fit. Independent coaching · 5.0 from 16 reviews · email checked."); **How you can reach them**: the phone with its sources and **Call**, the email with its state in words (`catch_all` reads **Unconfirmed**), **Copy** and **Draft**, and texts and WhatsApp shown locked with `LEAD_LOCKED_LINE`; **Checked**, in two groups: **Seen** (open on Maps, the phone on two sources, the mailbox's answer, the area by coordinates) and **Claude's read** (independent, the right kind, the business's own address), each read with its reason and its `unknown` state as "Couldn't tell", and nothing read wearing a plain check mark; **2 other addresses on their site**, folded, with why Claude picked this one ("a personal inbox; 2 others on their site", E10); **Found** (three timestamps); the website and Instagram.

**Pinning tests:** "the peek names where every check came from, in two groups, and nothing Claude read wears a plain check"; "a catch-all email reads Unconfirmed and the plan's standard is said beside it"; "texts and WhatsApp are locked with the reason"; "the stage control marks Talking and says the lead is still a lead, with Undo"; "Esc closes the peek before anything else".

**What the full version must add:** `toLeadPeekVM`'s contract test with the seeded lead's exact sentences; the check keys from A's `lead_judgments` (which fact keys the judge cited) mapped to the six checks; the dialog's focus rule (focus moves into the peek on open and back to the row on close; the row is the cursor); the phone sheet's markup.

## Task 13: the draft (sketch: written in full after release A)

**What it does (§9.3, P6, S12):** **Draft** turns the peek into a draft: To, Subject, the body Claude wrote from what it found and what the workspace offers, **Shorter** and **Warmer** (`__leadDraft(id, { tone, previous })`), the note `LEAD_DRAFT_NOTE` ("Your business address and a way to say no are added at the foot, as US law asks"), **Open in your email** (`mailto:` from the route), **Copy**, and "Sent from your own inbox". The foot is code's (`leadDraftFooter`, the CAN-SPAM kit: a truthful sender and subject, the ad identified, the postal address, an opt-out honoured within ten business days; the owner's mail app sends it). With no business address in Settings the draft says `LEAD_NO_ADDRESS` with a link to Settings, and no model is called. When the owner comes back to the tab (`visibilitychange`, `focus`: a hook in `ClientsAReal`), the peek asks **Did you send it?** — **Yes, mark contacted** posts `{ kind: "emailed" }` (Contacted, `lead.emailed`; the toast "Marked contacted." with Undo), **Not yet** closes the question. Nothing promises to see replies.

The `mailto:` is the route's, built in `server/leads.ts` beside `draftFor`, so the page never encodes a body:

```ts
/** A mailto: for the owner's own mail app: the address, the subject and the body, each encoded once; CRLF line breaks, as mail apps read them. */
export function leadMailto(to: string, subject: string, body: string): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, "\r\n"));
  return `mailto:${enc(to)}?subject=${enc(subject)}&body=${enc(body)}`;
}
```

```js
test("the mailto encodes each part once, keeps a quote and an ampersand, and breaks lines the way a mail app reads them", () => {
  const m = leadMailto("hello@zilkerstrength.example", "Coffee & a question", "Hi Dana,\nOne idea \"for you\".");
  assert.equal(m, "mailto:hello%40zilkerstrength.example?subject=Coffee%20%26%20a%20question&body=Hi%20Dana%2C%0D%0AOne%20idea%20%22for%20you%22.");
});
```

**Pinning tests:** "Draft opens the owner's own mail app with the foot the law asks for, and asks Did you send it? on return; Yes marks them contacted with Undo"; "with no business address the draft asks for it first, and no model is called"; "Shorter and Warmer send the previous draft back with the tone"; "a lead whose email bounces is offered Call instead"; the mailto test above in `lead-routes.test.mjs`.

**What the full version must add:** the `mailto:` encoding rule (subject and body `encodeURIComponent`, CRLF line breaks) with a test on a body holding `&` and a quote; the return-to-tab arming (armed only after Open in your email or Copy, never after Draft alone); the expected draft from the fixture stream.

## Task 14: calls and their six outcomes (sketch: written in full after release A)

**What it does (§9.4):** **Call** on the row, in the peek, or `C` dials `tel:` and arms the call question. When the owner comes back, the peek asks **How did the call go?**: Interested · Call back later · Not interested · Left a voicemail · No answer · Wrong number, with a note. **Interested** → `{ kind: "outcome", outcome: "interested", note }`: Talking, and the door makes them a person (or links the one whose phone it already is) with the call and the note on their page; the toast "<name> is in People now, with this call on their page." offers **Open** and no Undo. Call back later, voicemail and no answer → Contacted; Not interested → Said no; Wrong number → the phone struck through and the stage kept. On a phone the six are a 2 × 3 grid of 44px targets (Task 18).

**Pinning tests:** "Call dials tel: and asks how it went when the tab comes back; Interested says they are in People and offers to open them, with no Undo"; "a wrong number keeps the stage and strikes the phone"; "the other four move the stage as §9.4 says, each with Undo"; "C on the cursor row dials and arms the question".

**What the full version must add:** the `tel:` format (E.164 as stored); the door's `existed` answer drawn ("…is in People now" versus "…was already in People; this call is on their page"); the note's 280-character cap said in the field.

## Task 15: Not a fit (sketch: written in full after release A)

**What it does (§9.5, P5, release B's share):** one tap asks why: A chain or franchise · The wrong kind of business · Too far away · Already a customer · Something else. Each posts `{ kind: "not_a_fit", why }`: the lead is closed `not_a_fit` (or `customer`); **Already a customer** hides that place from every future search (the door's suppression) and the toast says "Hidden from every future search." with Undo; the other four toast "Not a fit." with Undo and teach nothing in this release (the scoped "you said" chips, the narrowed radius and the learning are release C; the toast never says "learned"). Wrong contact details, not a fit, no answer and an opt-out stay four different signals. The bulk bar's Not a fit takes the same five whys once for the selection.

**Pinning tests:** "Not a fit asks why in five ways; Already a customer hides the place and says so; the others close the lead and say Not a fit; each has Undo through its operation"; "Undo puts the lead back as it was and, for a customer, lifts the suppression" (E9: the operation's `before`).

**What the full version must add:** the door's suppression row shape and its Undo (`lead_undo` restores `before` and deletes the `customer` suppression it wrote, never an opt-out); the bulk form's operation.

## Task 16: a search, kept (sketch: written in full after release A)

**What it draws (§8.10):** each search row in the rail has a menu (`MoreMenu`, `data-bits.jsx:64`, which closes after each item): what was asked and left out, in the owner's words and the date ("You asked on Sep 18: …", from `asked` and `asked_on`); **Rename** (`__leadSearchRename`, operator); **Find new ones** ("Only places not already in your leads count", P3: `__leadSearchMore(id, "renew", plan)`); **Search again, changed** (the finder at plan with this plan; approve makes a new version through `planVersionOf` and `more` with `renew`); **Export these 160** (`GET leads/export?search=<id>`, owner; a `<a download>` from `window.__href`, gated for others as People's Export CSV is, `clients-a.jsx:1913–1917`); **Remove this search** ("Keeps the 18 you contacted or are talking to": `__leadSearchRemove`, owner). A month later the owner can see exactly what they asked for.

**Pinning tests:** "a kept search's menu says what was asked and when, in the owner's words"; "Rename renames through its route; Remove is the owner's, keeps the contacted and talking, and says so"; "Find new ones posts a renew round with the same plan; Search again, changed opens the plan card"; "Export these N is a download of the search's view, on the ledger".

**What the full version must add:** the menu's `gated` sentence per role; the confirm before Remove (the same pattern `DeleteListButton` uses, `clients-a.jsx:2029`'s export); the expected receipt strings.

## Task 17: the first day (sketch: written in full after release A)

**What it draws (§8.9):** with no search kept, the Leads scope shows "Your people gather here", the three ways people arrive (they reach you — the number is live, **Connect WhatsApp**; your calendar — **Connect**; clients you already have — **Add someone**), then "Or have Claude find businesses worth reaching": the composer (Task 8) and three or four suggestions from `GET lead-suggestions`, written by Claude from the workspace's business line ("For a personal training studio in Denver · **Not right? Change it**" → a one-line form to `PUT lead-suggestions`), each saying who it is for ("Partners · their patients often need a trainer next") and how reachable that kind is. The foot: "Claude finds businesses, not people at home." A salon sees wedding planners, photographers and bridal shops; a law firm sees chiropractors, body shops and towing companies. Never a seeded example. A gateway refusal shows "Suggestions are not available right now." and the composer still works.

**Pinning tests:** "the first day shows suggestions written for this business and never a seeded example"; "Not right? Change it saves the line through its route and asks again"; "a refused suggestions read leaves the composer working with a note".

**What the full version must add:** the suggestion cache's age shown ("from what your business does, a week ago") or not; the three ways' live states from the settings surface (`__SETTINGS`, `__CHANNELS`); the seeded workspace's expected line.

## Task 18: the phone (sketch: written in full after release A)

**What it draws (§6.6, at ≤900px: Task 2's rule 8):** one slim bar holds the `People | Leads` switch, search and Find (✦); the work starts under it (nothing above the rows but the strip: `feedback_mobile_work_first`). A running search is a two-line card; the question after 25 is a card with two 44px answers and Stop here under them; rows are cards with a 44px **Call** button, on the lead grid areas: `"sel business fit" "sel email phone" "sel stage found"` (the People cards' pattern, `clients.css:1791–1802`, with `.cl-table td.ld-*-cell` areas in `leads.css`); a lead opens full screen with Call and Email; after a call the six outcomes as a 2 × 3 grid; Find opens a bottom sheet (`.pl-finder`, `role="dialog"`) whose first control is hold-to-talk. The rail folds into the bar's switch and a list menu (the People lists sheet's pattern, `PeopleListsSheet` `clients-a.jsx:893`). `leads.css` carries the design's `lf-*` and `pk-*` classes and the lead cells over `.cl-table`, the dark theme through the existing tokens, `prefers-reduced-motion`, and the phone rules; loaded in both `Chanlytics.html` (after `people.css?v=12`, :18) and `legacy.css` (after :9); `@container` rules after what they override.

**The browser check (G4):** the people-table plan's harness (`layout-measure`'s real CSS in a browser): at 375px the first lead row's top is inside the first screen with the strip above it and nothing else; at 720, 800 and 960 the cards hold and the bar wraps nothing off-screen; at 1280 the peek is 408px and the table scrolls in its own box; at 1440 the controls sit on one row; the question strip's contrast holds in dark; keyboard only: F → the composer, Enter → plan, Tab reaches every picker, Esc backs out, J/K/Enter/C work the rows, Tab reaches Keep/Exclude/Put back on the cursor row.

**Pinning tests:** the browser check above, recorded with its measurements in the PR; "on a phone the switch, search and Find are one bar and the first row is on the first screen" (the harness's `matchMedia` at 375).

**What the full version must add:** the grid areas per class (an Excluded card drops the phone row); the sheet's Esc listener (its own, like `PeopleListsSheet`'s, and `keys.sheetOpen` set so the page's listener holds still); the six widths' measurements as expected numbers.

## Task 19: the guardrails in the owner's words (sketch: written in full after release A)

**What it holds:** every sentence the owner can hit, from contracts, said where it happens, and none of them a dollar amount or a vendor name: the platform paused (`paused`'s strip); the month's leads used (the plan card before, the strip mid-round); the searching budget bound (the plan card's offer of a smaller search or a phone standard; the strip when it binds mid-round); the day cap ("Today's searching is used up; it starts again tomorrow"); the planner's three refusals (outside the US; people rather than businesses, with two suggestions; no card fits, "I can't search Etsy shops yet"); the locked channels line; the draft's law note and `LEAD_NO_ADDRESS`; the consent refusal `LEAD_CONSENT_REFUSAL` on a converted lead's page in People (the profile's consent controls draw the door's sentence as they draw any refusal); the gate's sentences for an operator (find leads, export, remove a search, erase); the 501st Qualified lead refused in a sentence (A's door, the plan card's words).

**Pinning tests:** "every guardrail the owner can hit is a sentence from contracts, and no text the page says holds a dollar sign or a vendor name" (walk every text node of every state the harness can draw: `/\$\d|apify|compass|bounceverify/i` finds nothing); "no exported word in `leads.ts` or `lead-search.ts` names the vendor" (v2's decision 11 test, over both modules).

**What the full version must add:** the list of sentences with their contracts names and the state that draws each; the profile's converted-lead case (`person-honest.test.mjs`'s harness: a person with a lead link shows the consent controls with the door's refusal on a yes).

## Task 20: the retired seeded `leads.jsx`, and every reader on main (written in full)

`apps/dashboard/src/legacy/pages/leads.jsx` (592 lines; `LeadsPage` :387, `window.LeadsPage` :591) is deleted, its line removed from `manifest.ts:61` (and "leads" from the comment above it, :57–60) and from `Chanlytics.html:95` (`leads.jsx?v=17`). Its readers on main, from a grep of `LeadsPage`, `window.LEADS`, `LEAD_STAGES`, `LEAD_SOURCES`, `LEADS_AGGREGATES`, `"leads"` and `leads/`, and what each becomes:

| Reader | On main | Becomes |
|---|---|---|
| `app-shell.jsx:439–454` | the `page === "leads"` branch drawing `LeadsPage` with `LEAD_SOURCES` and `LEADS` for its crumbs | gone; `clients/leads…` is a branch of `clients` (Task 2); `#/leads` lands on `clients/leads` through `SURFACE_RETIRED` (:686–689) |
| `app-shell.jsx:72` (`leads: "leads"` in the route map), `:106` (the `soon` card's blurb "New prospects captured, scored, and queued for your call") | the route's nav key and its Not-in-this-release card | the map entry stays (the route exists, redirected); the `soon` blurb goes: no real workspace reaches it |
| `surface-tabs.jsx:9, :17–18` | the People tab group matches `leads` and draws a demo-only Leads tab with a badge counting `window.LEADS` ready | the Leads tab is gone (the rail's `People | Leads` is the switch, §6.1); `pipeline` stays demo-only; the group still matches `leads` so an old address highlights People |
| `sidebar.jsx:359, :376` | a comment saying `LEADS` is seed data with no real engine; the `people` group lists `leads` | the comment goes; the group keeps `leads` (the redirect) |
| `topbar.jsx:218, :246, :269–285` | seeded bell pushes with "Leads" / "Open lead" actions to `leads/ld-riley`; listeners for `leads:converted` and `leads:arrived` (the demo's scripted arrival) | the actions point at `clients/leads`; the two listeners stay for the demo (`LD_STORE` in `people-data.jsx:510–532` fires them) and never fire on a real workspace; the real bell rows are `leads_ready`/`leads_question` (Task 4.2) |
| `client-profile.jsx:27, :218` | `openLead` from `window.LEADS` by `clientId`, a chip "This person also has an open lead" navigating `leads/<id>` | the seeded chip stays demo-only (guarded by `window.__DEMO_MODE`); on a real workspace the profile reads `came_from` ("A lead you found", `people.ts:372`) with the search and the dates in its title (PRD §9.6), which Phase 0 already draws (`clients-a.jsx:1142`); no `leads/<id>` link on a real workspace |
| `inbox-thread.jsx:293`, `inbox.jsx:15, :301, :320–324` | the verdict flow's lead lookups and `leads:verdict`/`leads:converted` events, the "Leads" link to `leads` | demo-only as they are (the verdict flow is the mockup's); the link becomes `clients/leads` |
| `broadcasts.jsx:74`, `dashboard-a-ask.jsx:193, :205, :368, :380` | the seeded audience names and the demo Ask's jump entries over `window.LEADS`, `leads/<id>` | demo-only as they are; `leads` and `leads/<id>` become `clients/leads` (a real workspace's Ask jump list is contracts' `JUMP_PAGES`, `ask.ts:527–549`, which gains `{ label: "Leads", to: "clients/leads", kind: "page", sub: "businesses Claude found for you" }`) |
| `reports.jsx:295–302` | the seeded "by source" table over `LEAD_SOURCES`, rows navigating `leads/src:<id>` | demo-only as it is; the row's navigation becomes `clients/leads` |
| `pipeline.jsx:63, :132`, `segments.jsx:152, :353, :412`, `constants.jsx:27` (`R.lead`) | "Also in Leads" chips and `R.lead(id)` to `leads/<id>` | demo-only as they are; `R.lead` answers `clients/leads` (the demo has no lead detail route any more) |
| `people-data.jsx:6, :13, :215, :386, :484, :533–541` | `LEAD_STAGES`, `LEADS`, `LEADS_AGGREGATES`, `LEAD_SOURCES` and the scripted arrival, on `window` | stay: the demo's other pages (segments, pipeline, the demo Inbox, the demo bell) still draw them; nothing real reads them (Task 2's rule: the real stages are contracts' `LEAD_STAGES`, `LEAD_STAGE_WORDS`) |
| `styles/people.css:637–650, :941–960` (`.ld-*`, `.sg-*` rules) | the seeded page's styles | the `.ld-*` rules the deleted page alone used go (`ld-src`, `ld-funnel`, `ld-drawer`, `ld-sla`, `ld-inbox-xlink`); the `.sg-*` rules stay (segments); `leads.css` never reuses `ld-*` |
| `legacy/CLAUDE.md:3–7` (the status paragraph), the "Lead stage" canonical enum, the routes line (`leads[/src:source-id | /ld-id]`), the window events (`leads:converted`, `leads:verdict`, `leads:arrived`) | the mockup's contracts | the status paragraph records the lift (Task 0); "Lead stage" says the demo's set is the mockup's and the real set is contracts'; the route line becomes `clients/leads[:s-<search>][:l-<list>][:c-<class>]`; the events are marked demo-only |
| `surface-registry.ts:42, :194`, `docs/system-prd.md:643` | `leads: "demo"`, retired to `clients`, the PRD's "leads and pipeline redirect to People" | Task 3 and Task 0 |
| `e2e/people.spec.ts:150–155`, `calendar-people.test.mjs:506`, `surface-registry.test.mjs:261` | the pins on the redirect and the registry | the two values change to `clients/leads`; :261 stays |
| `Architecture Readiness Audit.html`, `Decision Logic and Autonomy Model.html`, `Frontend Completeness Audit.html`, `Inbox Deep Dive.html`, `Platform Workflow Map.html`, `Redesign Gap Analysis.html`, `audit/standards-roundup.md` (under `apps/dashboard/src/legacy/`) | the mockup's own audits, naming its Leads page | untouched: records of the mockup, not the product |

A render of `LeadsPage` anywhere is replaced by `navigate("clients/leads")`; a link to `leads` or `leads/…` points at `clients/leads`; demo seeds that nothing renders any more go with their readers; seeds another demo page still draws stay (they are the demo's). After the edits: `grep -rn "LeadsPage\|leads/\|\"leads\"" apps/dashboard/src/legacy` lists only the demo-only readers above and the redirect; `legacy-harness.test.mjs` passes (the manifest and the page list agree); the whole legacy suite passes.

## Task 21: the nightly e2e (sketch: written in full after release A)

**Files:** Modify `tooling/scripts/e2e-workspace.mjs` (beside `PEOPLE`, :66; `converge`, :168), `e2e/signals.ts`, `e2e/people.spec.ts:150–155` · Create `e2e/leads.spec.ts` · `.github/workflows/nightly-e2e.yml` unchanged (`E2E_PAID_LEADS` is not set there)

**What the nightly proves, and what it cannot.** The nightly runs against production (`playwright.config.ts`: `E2E_BASE_URL` defaults to `https://app.chanlytics.com`) as the seeded workspace's owner (`nightly-e2e.yml:43–44`), after `e2e-workspace.mjs --apply` puts that workspace in its known state (:78–84). It proves the seeded state on the page: the scope, the rail, the strip's ending, the peek's two groups, Not a fit and Undo, Put back and Undo, the old bookmark. It cannot prove a search for free: a real search spends on Apify and the judge. Decision 30 lists the test workspace in `lead_platform.tenants_on` (release A's migration seeds it from `SLUG`, `e2e-workspace.mjs:58`), so a real search **can** run there while the switch is off for everyone else; it runs only behind **`E2E_PAID_LEADS=1`**, modelled on `E2E_PAID_MODEL` (`e2e/ask.spec.ts:16–19`: "a real model turn costs money"), which the nightly does not set (`nightly-e2e.yml:105` says why for Ask). The two paid tests skip with a stated reason and count toward the skip ceiling (`e2e/skip-ceiling.ts:26`, `E2E_MAX_SKIPS` default 8): Ask's five paid skips and these two make seven, so the ceiling holds; a third paid lead test raises `E2E_MAX_SKIPS` in the workflow first.

- [ ] **The seed.** `e2e-workspace.mjs` gains `LEAD_SEED`, inserted with the service role after the people (fictional values: `.example` hosts, `555-01xx` numbers, `ChIJfixture…` place ids, the `example.com` mailbox), and `converge` deletes and re-inserts it every run so the specs read one state:

```js
/** One finished search and six leads, in every class and stage the specs read (e2e/leads.spec.ts). */
export const LEAD_SEARCH = { name: "Personal trainers · Austin", asked: "personal trainers in Austin with a website, then find their email", via: "people" };
export const LEAD_PLAN = { version: 1, card: "local_businesses", name: LEAD_SEARCH.name, asked: LEAD_SEARCH.asked, terms: ["personal trainer"], area: { kind: "city", label: "Austin, TX", state: "TX", center: { lat: 30.2672, lng: -97.7431 }, radius_m: 15000, query: "Austin, TX" }, count: 25, contact: "email", criteria: [{ key: "independent", text: "independent, not a chain", standard: "likely", required: true }, { key: "website", text: "has a website", standard: "seen", required: true }], exclusions: [{ key: "chain", text: "chain gyms", origin: "claude" }] };
export const LEAD_ROUND = { seq: 1, purpose: "probe", state: "ended", ending: "target_reached", target: 6, plan_version: 1 };
export const LEADS = [
  { place_id: "ChIJfixture0001", business_name: "Zilker Strength Lab", category: "Personal trainer", city: "Austin", state: "TX", street: "1200 Barton Springs Rd", phone: "+15125550101", email: "hello@zilkerstrength.example", email_state: "ok", website: "https://zilkerstrength.example", rating: 5.0, reviews: 16, stage: "ready", member: { class: "qualified", fit: "strong", reason: "Independent coaching, 5.0 from 16 reviews", counted: true } },
  { place_id: "ChIJfixture0002", business_name: "Travis Heights Coaching Co.", category: "Personal trainer", city: "Austin", state: "TX", street: "1500 S Congress Ave", phone: "+15125550102", email: "hello@travisheightscoaching.example", email_state: "ok", website: "https://travisheightscoaching.example", rating: 4.9, reviews: 88, stage: "ready", member: { class: "qualified", fit: "strong", reason: "Independent, one location, 88 reviews", counted: true } },
  { place_id: "ChIJfixture0003", business_name: "Mueller Movement Studio", category: "Personal trainer", city: "Austin", state: "TX", street: "1900 Aldrich St", phone: "+15125550103", email: "info@muellermovement.example", email_state: "catch_all", website: "https://muellermovement.example", rating: 4.7, reviews: 40, stage: "ready", member: { class: "review", fit: null, reason: "Couldn't confirm the email", counted: false } },
  { place_id: "ChIJfixture0004", business_name: "East Side Kettlebell", category: "Personal trainer", city: "Austin", state: "TX", street: "2200 E 7th St", phone: "+15125550104", email: null, email_state: "none", website: null, rating: 4.8, reviews: 22, stage: "ready", member: { class: "review", fit: null, reason: "No email to check; a phone only", counted: false } },
  { place_id: "ChIJfixture0005", business_name: "FitCorp Austin Central", category: "Gym", city: "Austin", state: "TX", street: "500 W 6th St", phone: "+15125550105", email: null, email_state: "none", website: "https://fitcorp.example", rating: 4.1, reviews: 900, stage: "ready", member: { class: "excluded", excluded_by: "chain", fit: null, reason: "A chain gym", counted: false } },
  { place_id: "ChIJfixture0006", business_name: "Hyde Park Personal Training", category: "Personal trainer", city: "Austin", state: "TX", street: "4300 Speedway", phone: "+15125550106", email: "hi@hydeparkpt.example", email_state: "ok", website: "https://hydeparkpt.example", rating: 4.9, reviews: 31, stage: "nurture", member: { class: "qualified", fit: "look", reason: "Independent; one review mentions a waitlist", counted: true } },
];
```

The counters are seeded to match (three counted, the month's allowance `used = 3`), and `lead_platform.tenants_on` holds the workspace's id (release A seeds it; `converge` asserts it and stops with a sentence when it is missing, as it stops on a drifted consent state). Nothing in the seed is a real business, and `verify()` refuses a workspace whose lead rows drifted from this state.

- [ ] **`signals.ts`** gains the checks the spec and the harness share, in its style ("reached" means in the viewport): `expectLeadsScope(page)` (the rail's `role="tablist"` with Leads selected, the standing line "6 leads · 4 ready · 1 search", the first row's business name); `expectStripEnding(page, words)` (the strip's title in view); `expectPeekSeenVersusRead(page)` (the two group headings, no plain check under Claude's read); `expectRowUnchangedAfterUndo(page, name, before)`.
- [ ] **`e2e/leads.spec.ts`** — `test.describe("Leads on a real workspace")`, signed in as the owner the way `people.spec.ts:35` is:
  - "the Leads scope shows the seeded search and its leads, strongest fit first, and the strip says how it ended" (Zilker, Travis Heights first; the strip reads "Found 3 personal trainers · everything these searches returned in Austin · 3 you can email · 1 left out"; **1 left out** opens the Excluded view with FitCorp dimmed and "Chain").
  - "the peek names every check's source in two groups, texts are locked with the reason, and a catch-all reads Unconfirmed" (Mueller Movement).
  - "Not a fit, then Undo, leaves the lead as it was and no row behind" (Hyde Park: the request is the real one, intercepted and checked for `{ kind: "not_a_fit", why: "chain" }`; Undo posts `lead-operations/<id>/undo { version }`; the row reads Contacted again; the workspace's `lead_operations` count for the lead is read back through the API and the seed's `verify()` passes on the next run).
  - "Put back, then Undo, leaves the left-out place as it was" (FitCorp; the two requests intercepted; `counted` back to false).
  - "Keep on a Needs review row counts it this month, and Undo gives it back" (East Side Kettlebell).
  - "an old #/leads bookmark lands on the Leads scope" (`#/clients/leads`, the standing line visible) — and `people.spec.ts:150–155`'s `for (const gone of ["leads", "pipeline"])` loop changes value: `leads` → `#/clients/leads`, `pipeline` → `#/clients`.
  - "the keyboard walks the leads: J focuses, Enter peeks, C dials, F opens the finder, Esc backs out in order" (`tel:` and the finder checked by their DOM, nothing dialled).
  - "at a phone's width the switch, search and Find are one bar and the first lead is on the first screen" (`page.setViewportSize({ width: 375, height: 812 })`, `toBeInViewport({ ratio: 1 })`).
  - Only with `E2E_PAID_LEADS=1`: "Find leads turns words into a plan card, and nothing is started when it is closed" (one Ask turn; `GET lead-searches` unchanged); and "a small search runs end to end from the page on the listed workspace" (count 25, contact phone, the strip through running to an ending, the round's `cost_usd` read back under $0.50, then **Remove this search** so the seed is clean; skipped with `WHY_UNPAID` otherwise).
  The spec's shape, in `people.spec.ts`'s style (its `apiGet`, its sign-in, its intercepts):

```ts
// e2e/leads.spec.ts
import { expect, test } from "@playwright/test";
import { expectLeadsScope, expectPeekSeenVersusRead, expectRowUnchangedAfterUndo, expectStripEnding } from "./signals";
import { LEADS, LEAD_SEARCH } from "../tooling/scripts/e2e-workspace.mjs";

const PAID = process.env.E2E_PAID_LEADS === "1";
const WHY_UNPAID = "a real search spends on the source and the judge: set E2E_PAID_LEADS=1 to run it";

test.describe("Leads on a real workspace", () => {
  test.beforeEach(async ({ page }) => { /* the owner's session, as people.spec.ts:35-40 makes it */ });

  test("the Leads scope shows the seeded search and its leads, strongest fit first, and the strip says how it ended", async ({ page }) => {
    await page.goto("/#/clients/leads");
    await expectLeadsScope(page, { standing: "6 leads · 4 ready · 1 search", first: LEADS[0].business_name });
    await expectStripEnding(page, "Found 3 personal trainers · everything these searches returned in Austin");
    await page.getByRole("button", { name: "1 left out" }).click();
    await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\/clients\/leads:s-[0-9a-f-]{36}:c-excluded$/);
    await expect(page.locator(".cl-table tbody tr").first()).toContainText("Chain");
  });

  test("Not a fit, then Undo, leaves the lead as it was and no row behind", async ({ page }) => {
    const sent: unknown[] = [];
    await page.route("**/api/v1/leads/*/stage", async (route) => { sent.push(route.request().postDataJSON()); await route.continue(); });
    await page.goto("/#/clients/leads:l-nurture");
    const row = page.locator(".cl-table tbody tr", { hasText: LEADS[5].business_name });
    const before = await row.innerText();
    await row.hover(); await row.getByRole("button", { name: "Not a fit" }).click();
    await page.getByRole("menuitem", { name: "A chain or franchise" }).click();
    expect(sent).toEqual([{ kind: "not_a_fit", why: "chain" }]);
    await page.getByRole("button", { name: "Undo" }).click();
    await expectRowUnchangedAfterUndo(page, LEADS[5].business_name, before);
  });

  test("Find leads turns words into a plan card, and nothing is started when it is closed", async ({ page }) => {
    test.skip(!PAID, WHY_UNPAID);
    // …one Ask turn; the card; Esc; GET lead-searches unchanged
  });
});
```

- [ ] Run locally against a preview with `E2E_BASE_URL`, then leave it to the nightly.

**What the full version must add:** the exact seed columns from A's 00139 (`leads`, `lead_search_members`, `lead_rounds`, `lead_counters`) and the `converge` order (search → round → leads → members → counters); the read-back queries for Undo; the paid test's budget line and its cleanup; the `verify()` rules.

## Task 22: dists, the full suite, the production push, ship

- [ ] **Step 1:** `node tooling/scripts/check-dist.mjs`, keep real dist diffs, `corepack pnpm -r typecheck`, `corepack pnpm lint`, `corepack pnpm test` → green; `corepack pnpm gen:db-types` and `check:db-types`; `gen:schema-sets`.
- [ ] **Step 2:** Push, open the PR ("Leads is a scope of People: find businesses, work them, and turn the ones who answer into people"). On green, from the PR's branch: re-list `supabase/migrations` (the number is still free), the dry run listing only this release's migration, `db push --linked --yes`, the read-back (`select proname from pg_proc where proname in ('lead_set_stage','lead_bulk','lead_erase','lead_export_mark','set_contact_consent','set_marketing_consent')` and the two notification kinds in the CHECK), then `next build`, then the merge. If the classifier refuses the push, hand Ruben: `supabase db push --linked --yes` from the PR's branch, in PowerShell, one line.
- [ ] **Step 3: Ruben's.** The switch (`update public.lead_platform set searches_on = true;` in the SQL editor, or `supabase db query --linked "update public.lead_platform set searches_on = true;"`), `APIFY_TOKEN` on the edge (release A), and G5's cohort: the invited list, and the five measures (time to the first useful result, kept-lead precision, contact-ownership accuracy, duplicate charges, cost per kept lead, and customer-message latency on the shared jobs queue) read from the ledger for the first two weeks.

## Done-when (PRD §14, release B), each mapped to a task and a test

| PRD §14 release B says | Task | Proven by |
|---|---|---|
| A search runs end to end on production from the page | 8, 9, 10, 22 | `e2e/leads.spec.ts` "a small search runs end to end from the page on the listed workspace" (with `E2E_PAID_LEADS=1`, run once by hand before the merge and recorded in the PR); then Ruben's first search after the switch |
| The question fires on a fixture with 12 of 25 passing and nothing more is started until it is answered | 10 (the strip); release A (the engine) | `leads-honest.test.mjs` "the question strip is the accent tint with role alert, its three answers post what they say, nothing else in the strip moves while it waits, and the 25 rows stay under it"; release A's `lead-search-replay.test.mjs` fixture with 12 of 25 (the collect leaves the round `waiting_on_owner` and inserts no start job) |
| Every consent path refuses a converted lead in a test | 4.2 (item 10), 7 | `leads.db.test.mjs` "both consent doors refuse a linked person's yes with LEAD_CONSENT_REFUSAL and accept their no"; `consent-paths.test.mjs` "ACCEPTANCE: the four consent routes refuse…" and "Ask has no act that could record a yes"; `consent-paths.db.test.mjs` "a member cannot write consent except through a door" and "…exactly the two that refuse"; one converted-lead row in `broadcasts.test.mjs`, `outbound-gate.test.mjs`, `voice-doors.test.mjs`, `deliver.test.mjs` |
| G4's widths and keyboard-only pass | 2, 18 | the browser check's measurements in the PR (375, 720, 800, 960, 1280, 1440; keyboard only); `leads-honest.test.mjs` "keys: J and K move, Enter peeks, x selects, C calls, F opens the finder, Esc closes the peek, then the finder, then the Columns menu, then the selection; one keydown listener"; `e2e/leads.spec.ts` "the keyboard walks the leads…" and "at a phone's width…" |
| G5's cohort is invited | 22 | not a test: Ruben's list and the five measures, read from the ledger |

Beyond §14's list, the rest of the product half is carried by: the table lifted and parameterised (Task 1, `people-table.test.mjs`); the surface keyed by view (Task 3, `leads-bridge.test.mjs` "a read is keyed by the view…" and "a refresh patches changed rows…"); Undo as a server record (Task 3 "every act goes through its route with the id and the version it saw"; Task 4.2's `lead_undo` cases); bulk on ids or the view (Task 4.4 "bulk acts on the ids, or on the view…"); Keep, Exclude and Put back as the owner's (Task 11); a stage click that never converts (Task 4.2 "a stage click to Talking keeps the lead", Task 4.4's route test); Seen versus Claude's read and Unconfirmed (Task 12); the draft's foot and "Did you send it?" (Task 13); the six outcomes (Task 14); Not a fit and Already a customer (Task 15); kept searches (Task 16); the first day (Task 17); the guardrails in words (Task 19); the retired page (Task 20, `legacy-harness.test.mjs`); the bell's two kinds (Task 4.2, `notifications.test.mjs`'s style); Ask's card (Task 6, `lead-ask.test.mjs`); the gateway's purposes (Task 5, `lead-gateway.test.mjs`).

## Self-review (done while writing; what is reconciled and what is not)

- **Spec coverage.** Every item PRD §14 names for release B has a task: the Leads scope on the shared table (1, 2), the composer (8), the plan card (9), the strip and the question (10), the three lists (11), the peek with Seen versus Claude's read (12), drafts (13), calls and outcomes (14), stages and conversion on a real conversation (4.2, 12, 14), Not a fit (15), kept searches (16), the first day (17), every ending (10), the guardrails (19), the phone (18), Ask's proposal and card (6), the consent doors' refusals (4.2, 7). Every release C item is out (`search_leads`, chips, the learning, More like these, enrichment, the scout, more cards): `2026-09-19-lead-finder-C-extras.md`.
- **Names.** The courier's names (`__leadsView`, `__leadsMore`, `__leadsTakeOffered`, `__leadStage`, `__leadKeep`, `__leadExclude`, `__leadPutBack`, `__leadUndo`, `__leadDraft`, `__leadErase`, `__leadsBulk`, `__leadSearchAnswer`, `__leadSearchMore`, `__leadSearchStop`, `__leadSearchRename`, `__leadSearchRemove`, `__leadBusinessLine`), the contracts' (`LEAD_STAGE_WORDS`, `LEAD_EMAIL_WORDS`, `LEAD_CONSENT_REFUSAL`, `LEAD_LOCKED_LINE`, `LEAD_NO_ADDRESS`, `stageArgs`, `outcomeMove`, `leadsRoute`, `parseLeadsRoute`, `toLeadRowVM`, `toLeadPeekVM`, `leadRail`, `leadsStanding`, `leadStrip`), the doors' (`lead_set_stage`, `lead_bulk`, `lead_erase`, `lead_export_mark`, `leads_page`, `lead_list_counts`) and the table's (`plSortKeys`, `plDrawnColumns`, `plColumnChoices`, `plColumnOptions`, `noun`) are spelled the same in every task. Release A's names are the interface's.
- **Not reconciled, for whoever writes this in full** (each one line to decide):
  1. **The phone band.** PRD §6.6 says ≤720px; main's cards, Columns menu and listener are at 900px (`clients.css:1787`, :1778; `clients-a.jsx:1831`) and only the lists sheet opener uses 720 (:1584). This plan follows the code (900). The PRD, or the lists sheet, should say the same number.
  2. **"All 200 when your leads renew."** PRD §8.8's `month_leads_used` offers a start on renewal day; release A's `lead_search_create` takes no `start_after`. Task 9 offers Find N now and says the day; the wait is either a bell or a door argument in A.
  3. **`leads_page` has no list.** The interface's signature filters by class only; §6.1's rail lists are stages. Task 4.2 appends `p_list` and the three column sorts. Better done in A's 00139 if A is not yet built when this is read.
  4. **The strip's Undo operation.** A's `lead_undo(p_op_id, p_version)` exists; nothing in the interface says where the page reads the finished round's `undo_search` operation id. Task 4.2 adds `undo_op_id, undo_version` to `lead_searches_view`; A could carry them from the start.
  5. **`planLeadSearch`.** PRD §12.8 lists it under A's `lead-search.ts`; the interface does not. Task 6 writes it there if A did not.
  6. **`SpendWords`.** A's `POST lead-searches` spends; whether its refusal says "before finding leads" depends on A (Task 4.4).
  7. **`lead_operations.kind`.** A's set has six kinds; B's stage and bulk acts need two more (Task 4.2, item 11), a CHECK widening A could include.
  8. **The seed rows' home.** The brief for this plan placed them in `e2e/signals.ts`; on main the seed is `tooling/scripts/e2e-workspace.mjs` (:66) and `signals.ts` holds the shared checks. This plan keeps main's split.
  9. **The bell's recipients.** Task 4.2 writes one row per workspace the way `calendar_people` does; the full version confirms that against 00134's table before the trigger is written.
- **What is not written out,** on purpose and said where it occurs: the doors' plpgsql bodies (4.2), the twelve screens' markup and their exact strings (8–19), the nightly's seed columns (21). Each sketch lists what its full version must add, so nothing is left to be discovered twice.
