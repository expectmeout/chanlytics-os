# Lead Finder Release B (the product) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: written in full, 20 September 2026.** PRD v3 §14 said release B "is written in full once release A is measured". Release A is on main — A1 (`00140`, the data and the doors) and A2 (`1441f5bc`, the runtime) — and this is the full plan, written against it: twenty-two tasks, every one with its files, its failing test in full, the code in full, the run, and the commit. Nothing here is a sketch, nothing is deferred to a later writer, and no step says to do what another task did.

**How it was proved.** The sixteen tasks that were sketches in the shape (Task 2, 4.2, 4.5, 8–19, 21) were each written by a writer in a scratch worktree detached at `origin/main` `1441f5bc`, who applied the code to that worktree and ran the tests in it before writing a word of the task. What each proved, in their own numbers:

| Tasks | Applied and run | Result |
|---|---|---|
| 2, 11, 16 (+ Task 1 applied in full first) | `leads-honest.test.mjs` on the people-honest harness, over the real `clients-a.jsx`, `people-table.jsx`, `leads-scope.jsx` and `data-bits.jsx` | `people-table` 3/3, `leads-honest` **20/20**, and the neighbours green (`people-honest` 56/56, `person-honest` 29/29, `refusals-on-the-page` 11/11, `calendar-people` 32/32, `legacy-harness` 9/9, `surface-registry` 25/25, `source-scan-ratchet` 3/3); 8 mutation checks, all killed |
| 4.2, 4.5, `leads.db.test.mjs`, `consent-paths.db.test.mjs` | the whole migration and every door body applied to the local Postgres inside one `begin … rollback`, with `do $$ … $$` assert blocks | **19 assert blocks, 19 proved, 0 errors**, then a 20th run proving the file re-runnable twice in one transaction, and a third run answering the three catalog queries `consent-paths.db.test.mjs` asks; the two DB tests parse and skip cleanly with no database (15 and 5 skipped) |
| 8, 9, 10 | `lead-search.test.mjs`, `leads-vm.test.mjs`, `leads-finder.test.mjs`, `legacy-harness.test.mjs` | **58/58**, plus 99/99 on the neighbours; the plan-sentence bug reproduced and fixed with the three existing `planSentence` pins holding their exact values; 3 mutation checks |
| 12, 13, 14, 15 | `leads-peek.test.mjs` (a harness modelled on `refusals-on-the-page.test.mjs`), the contracts unit tests, `legacy-harness.test.mjs` | **31/31** on the peek and contracts, 105/105 with the neighbours; `tsc --noEmit -p packages/contracts` and `eslint` clean; 8 mutation checks, each killing exactly one test |
| 17, 18, 19, 21 | the components on the stub React, the guardrail sweep, the e2e seed's converge test, `playwright test --list` | **121/121** across ten files; `e2e/leads.spec.ts` lists 11 tests, `people.spec.ts` + `leads.spec.ts` 22; 6 mutation checks |

Every command and its counts are in the writers' reports. What none of them could prove, and what therefore stays open, is in the self-review at the foot — honestly, and at the level of the one step that is unproved rather than the whole task.

**Goal:** An owner describes the businesses they want in words on the Leads scope of People; Claude proposes the plan as a sentence whose words are pickers; the server runs it in rounds under hard caps (release A); the page shows the run, the question after 25 and one ending from the closed set; the owner works what was found in Qualified, Needs review and Excluded, with a peek that says what was seen and what Claude read, a draft that opens in their own mail app, a call from their own phone with six outcomes, Not a fit, kept searches, the first day's suggestions, the phone; and a converted lead's yes comes only from them, permanently.

**Architecture:** Release B builds on release A's interface (`docs/plans/2026-09-19-lead-finder-A-interface.md`: migration 00140, the contracts `lead-search.ts` and `lead-judge.ts`, the runner, the routes marked A in PRD §12.6). It adds one migration (`00142`, the next free number as of 20 September 2026, re-listed at build time), the contracts module `leads.ts` (words, view models, request schemas), the rest of §12.6's routes behind `route()` policies, two Ask tools and the `lead_search` card, two gateway purposes, a `leads` surface in `legacy-bridge` that mirrors People's (`peopleLoaded`/`publishPeople`/`keepSavedView`, keyed by view), a courier of named functions, the People table lifted into `pages/people-table.jsx` and parameterised by its column list, and the Leads scope of `clients-a.jsx` drawn hookless on that table with three new legacy files (`leads-scope.jsx`, `leads-finder.jsx`, `leads-peek.jsx`) and one stylesheet. The seeded `pages/leads.jsx` is retired. Every screen is pinned by a rendered-page test on the people-honest harness, and the nightly proves the seeded state on production.

**Tech Stack:** TypeScript 5.7, zod 4, Next.js route handlers (`apps/dashboard/src/server/route.ts`), Supabase Postgres (RLS, plpgsql), the edge's model gateway (`apps/edge/api/admin/llm.ts`, `apps/edge/lib/ask-gateway.ts`), the legacy React pages (Babel, no bundler; hookless components on the tests' stub React), `node:test` under `tsx`, Playwright for the nightly.

---

## What changed since v2

Each line names the v2 text it replaces (`docs/plans/2026-09-18-lead-finder.md`, its line numbers as of 18 September) and the anchor on main that forced it.

1. **The migration numbers.** v2:19–20 gave 1a `00137` and 1b `00138`. Both are taken on main (`supabase/migrations/00137_their_own_message_is_one_they_sent.sql`, `00138_a_person_says_where_they_came_from.sql`). Release A takes `00140` and 00141 landed on 19 September, so release B takes **`00142`** — written into 4.2 and into every command that names it, and re-listed immediately before pushing (Task 22 step 2).
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
24. **The bell has kinds.** v2 named the bell without kinds. Task 4.2 adds `leads_ready` and `leads_question` to the bell's CHECK — **00141's, not 00134's**: `00141_a_broadcast_that_went_out_is_not_a_failure.sql` added `broadcast_sent` and `broadcast_stopped` and its head warns the lead finder to build on its list (W2 read both) — and to `SERVER_NOTIFICATION_KINDS` (`notifications.ts:198`), `SERVER_LOOK` (`:252`) with icons existing kinds draw, and `schema-sets.generated.ts`.
25. **The routes schedule nothing.** v2:6150–6190 gave the routes a ledger seam (`lead-jobs.ts`, `scheduleOnce`, `afterStop`) with the job kinds `lead_search_start | lead_search_collect | lead_verify`. Release A's doors insert their own jobs (`lead_round_start | lead_collect | lead_check`), so the seam is dropped and B's routes call doors only.
26. **The route list.** v2:6440–6470 wrote 17 routes. Release A ships `POST/GET lead-searches`, `GET lead-searches/[id]`, `/answer`, `/more`, `/stop`, `GET leads`, `POST leads/[id]/keep|exclude|put-back`, `POST lead-operations/[id]/undo`. B ships `PATCH/DELETE lead-searches/[id]`, **`POST lead-searches/[id]/undo`**, `POST leads/[id]/stage`, `/draft`, `POST leads/bulk`, `DELETE leads/[id]`, `GET leads/export`, `GET/PUT lead-suggestions` — ten entries. `restore` and `bulk/restore` are gone, and so is v2's search `undo`, which undid a *removal*; the new one is the Done strip's, which takes a finished round's untouched leads back and credits the month (§8.6, W2's `lead_search_undo`). `chips` is C.
27. **The registry and shell anchors moved.** v2:6785 cited `surface-registry.ts:34-44, :180-200` and v2:6790 `app-shell.jsx:401-455`. On main: `leads: "demo"` :42, `ROUTE_SURFACE` :85–118 (`clients: "people"` :89), `routeSurfaceFor` :168, `SURFACE_RETIRED` :193–196; the shell's `clients` branches :401–438, the `leads` branch :439–454, the retired redirect :686–689.
28. **The nightly may run a real search.** v2:7066 said "No search is ever started by the nightly; the platform switch is not touched". Decision 30 lists the test workspace in `lead_platform.tenants_on`, so a real search can run there; it runs only behind `E2E_PAID_LEADS=1`, modelled on `E2E_PAID_MODEL` (`e2e/ask.spec.ts:18–19`, absent in `nightly-e2e.yml:105`). The seed rows live beside `PEOPLE` in `tooling/scripts/e2e-workspace.mjs:66`; the checks in `e2e/signals.ts`.
29. **The old bookmark test changes value.** `e2e/people.spec.ts:150–155` pins `#/leads` landing on `#/clients`; `calendar-people.test.mjs:506` pins `leads: "clients",`. Both assertions' values change to `clients/leads` (v2:6913 had the second).
30. **The seeded stages are not the real ones.** `people-data.jsx:6` (`LEAD_STAGES`: `ready | qualifying | new | nurture | converted | archived`, the mockup's set in `legacy/CLAUDE.md`) is never read by the real scope. The stored set is A's `leads.stage` (`ready | nurture | converted | archived`) with `closed_reason`; the words are B's `LEAD_STAGE_WORDS`.
31. **`SpendWords` is not A's; it is Task 4.4's work.** v2 Task 1 (1c, :5800–5830) added `spendWords` to a write and `requireSpend(ctx, member, doing)`. Read at `1441f5bc`: `requireSpend(ctx, member)` still takes no `doing` (`with-route.ts:242`) and `whyCannotSpend(mode, status)` still says "buying a number" (`billing.ts:149–155`). So Task 4.4 carries v2's code. Task 19's pin that no lead refusal says "buying a number" passes today only because `refusalOf`'s own sentences never did; it bites the moment a spend refusal reaches a lead screen.
32. **The interface's `leads_page` has no list argument, and cannot be `create or replace`d.** `leads_page(p_tenant_id, p_search_id, p_class, p_sort, p_after_key, p_limit)` filters by class; PRD §6.1's rail lists (Ready, Contacted, Talking, Said no, Not a fit) are stage lists. Task 4.2 **drops it and writes the nine-argument one** — adding a parameter makes a second function and every six-argument call ambiguous, and `create or replace` cannot change a `returns table` at all (W2 hit both on the local stack; `00140:574` makes the same move for `lead_reserve`). A's callers name their arguments, so they resolve to the new one, and `sort_key` stays packed so A's paging assertion still holds. `lead_list_counts` is added beside it.
33. **Where the strip's Undo gets its operation.** Release A's `lead_undo(p_op_id, p_version)` and the kind `undo_search` exist, but no view says which operation a finished round's Undo names. Task 4 adds `undo_op_id, undo_version` to `lead_searches_view`.

## What is in this plan, and where

Twenty-two tasks, in the order an engineer takes them. Every line number below is this file's, as it stands; every task's own anchors are `origin/main`'s at `1441f5bc`.

| # | Task | Line |
|---|---|---|
|  | What changed since v2 | 27 |
|  | Reconciled while stitching | 110 |
|  | How to read this plan | 136 |
|  | File structure | 165 |
| 0 | a worktree of its own, and what must be on main | 189 |
| 1 | the table lifted out, parameterised by its columns (written in full) | 198 |
| 2 | the Leads scope of People | 333 |
| 3 | the Leads surface and the courier (written in full) | 2049 |
| 4 | the contracts, release B's migration, the server module and the routes (written in full, doors' bodies included) | 2386 |
|   4.1 | The contracts (`leads.ts`) | 2390 |
|   4.2 | The migration | 2599 |
|   4.3 | The seams: a structured answer through the gateway, four rates, the suggestions' save (v2:6192–6256, corrected) | 4438 |
|   4.4 | The server module and the routes (v2:6258–6470, corrected) | 4505 |
|   4.5 | The key door: `lead_set_stage` | 4612 |
|   4.6 | The view models, spelled | 4833 |
| 5 | the gateway takes two more purposes (written in full; v2:6262–6310 corrected) | 4939 |
| 6 | Ask's two tools and the card (written in full; v2:6312–6478 corrected) | 4987 |
| 7 | every consent path refuses a converted lead's borrowed yes (written in full; v2:6480–6530 corrected) | 5116 |
|  | The screens (Tasks 8–19) | 5205 |
| 8 | the composer, typing and voice | 5215 |
| 9 | the plan card | 5773 |
| 10 | the strip and the question | 6507 |
| 11 | Qualified, Needs review and Excluded | 7042 |
| 12 | the peek | 7320 |
| 13 | the draft | 8353 |
| 14 | calls and their six outcomes | 8681 |
| 15 | Not a fit | 8896 |
| 16 | a search, kept | 9051 |
| 17 | the first day | 9437 |
| 18 | the phone | 9834 |
| 19 | the guardrails in the owner's words | 10193 |
|    | 19.1 Every guardrail, with its sentence and where it is said | 10199 |
|    | 19.2 The nine endings, said once | 10228 |
| 20 | the retired seeded `leads.jsx`, and every reader on main (written in full) | 10591 |
| 21 | the nightly e2e | 10635 |
| 22 | dists, the full suite, the production push, ship | 11188 |
|  | Done-when (PRD §14, release B), each mapped to a task and a test | 11215 |
|  | Self-review (what is reconciled, and what is not) | 11254 |

## Reconciled while stitching

The sixteen tasks that were sketches were written against the code, not against the shape, and what they found changed eleven places in the tasks that were already written in full. Each line says what moved, and the proof that moved it.

1. **Task 1's three harnesses copy the nine lifted names onto `globalThis`.** A legacy file's `Object.assign(window, …)` writes to `globalThis.window`, a plain object in these harnesses, while the page reads the names as bare globals. W1 applied Task 1 and watched `people-honest`, `person-honest` and `refusals-on-the-page` go red with `PeopleTable is not defined`; with the copy line, 56/56, 29/29 and 11/11.
2. **Task 1's own test seeds `window.React`.** Its `td` helper builds a cell with `T.React.createElement` and the harness sets only `globalThis.React` (W1; the app does the same in `seed-globals.ts`).
3. **Task 1 hoists `calendar-people.test.mjs`'s four reads into one and lowers the ratchet 47 → 45.** Three strings the assertions read moved into `people-table.jsx` (and the foot's changed shape), and a fifth `readCode(` may not be added. W1 ran `UPDATE_SOURCE_SCAN_BASELINE=1` and re-ran: `calendar-people` 32/32, `source-scan-ratchet` 3/3. **This is the only `readCode(` change in the release**, and it is a fall.
4. **Task 1 specifies `LEAD_COLUMNS`; Task 2 writes the constant** in `leads-scope.jsx`, with `LEAD_SORT_KEYS = plSortKeys(LEAD_COLUMNS)` beside it. One home, one shape.
5. **Task 2 does not touch `surface-registry.ts`.** The sketch gave it `SURFACE_RETIRED.leads`; Task 3, written in full, already changes that line and three others in the same file (W1 left the whole file to Task 3 and says so in Task 2's preamble, so the two cannot both edit `:194`).
6. **Task 3's courier gains `__leadSearchUndo`, and `refresh-map.ts` gains its route.** The Done strip's Undo (PRD §8.6) had no door in release A and no route in the shape; W2 wrote `lead_search_undo(p_search_id)` and proved it end to end (assert block 15: `{removed:3, credited:2}`, the worked lead kept, the exported one gone but still charged, `{error:"too_late"}` at 25 hours), and 4.4 now carries `POST lead-searches/[id]/undo`.
7. **Task 3 publishes neither the words nor the derivations.** `window.__LEAD_WORDS` is a record of strings and `window.__LEAD_VM` a bag of pure contracts functions: both are seeded in `seed-globals.ts` beside `__FACT_WORDS`, by the task that writes what they carry (12, then 9, 10, 19). The courier keeps the acts, and gains `__leadPeekVM` (W4), `__leadsRouteParse`, `__leadRail`, `__leadsStanding` (W1, Task 2) and `__leadSearchWords` (W1, Task 16), each added by the task that needs it.
8. **One words record.** W4's `LEAD_PAGE_WORDS` (the peek's markup words) and W5's `LEAD_WORDS` (the stages, the endings, the guardrail sentences) were two records for one fact; they are one `LEAD_WORDS`, declared in Task 12 and extended in Tasks 17 and 19, and Task 19's "the words the pages read are the contracts' own, in one record" test reads both halves.
9. **One `LeadShape`.** W1 drew it as `<Icon name={LEAD_SHAPES[state]} />` and W4 as five inline SVG shapes, both `Object.assign`ed onto `window` from two files, of which the peek's would silently have won. W4's shapes are the ones — `icons.jsx` has no `help`, `xcircle`, `spin` or `minus`, and an unknown name draws a plain circle (`icons.jsx:73`), which would say the same thing about five different states — and they now live once, in Task 2's `leads-scope.jsx`, which is the file that draws first. Task 12 reads `window.LeadShape`.
10. **4.1 imports the five stored sets from `lead-search.ts` instead of declaring them again.** W5 added `export * from "./leads"` to the barrel and reproduced five `TS2308 … has already exported a member named …`; W2 found `schema-sets.ts:122` holding `LEAD_OPERATION_KINDS` `Exactly` equal to `lead_operations.kind`. B widens that one set in `lead-search.ts`, in the same commit as the migration and `gen:schema-sets`. `LEAD_CLASSES` is `LEAD_MEMBER_CLASSES` under B's screen word, not a second list.
11. **4.2's `leads_page` is dropped and rewritten, not `create or replace`d.** W2 proved on the local stack that adding `p_list` makes a second function and every six-argument call ambiguous, and that `create or replace` cannot change a `returns table` at all; the migration drops the six-argument one first, which is the move `00140:574` already makes for `lead_reserve`. A's nine-argument callers and its packed-`sort_key` paging still hold (assert block 11).
12. **`leads.version` is added, and A's `lead_undo` is de-ambiguated.** The sketch's `lead_set_stage` read `v_lead.version` on a column that does not exist. Adding it broke A's `undo_search` branch (`column reference "version" is ambiguous`, seen in the proof) — `version = version + 1 … from public.leads l2` becomes `m2.version + 1`, the only statement in 00140 with that shape.
13. **4.3 adds three rate buckets, not four.** v2's `lead_edit` was `{ limit: 120, windowMs: 60_000, noun: "lead changes" }`, which is `RATE.lead_member` on main to the character (W5, `rate-limit.ts:149`). Two buckets with one noun make a refusal nobody can tell apart; every route that edited one lead or one search now says `rate: "lead_member"`.
14. **4.4 builds `planFacts`; it is not release A's.** The shape said "A's now"; W3 grepped release A and found only `lead_niche_prior`, `lead_searches_on` and `estimateForRound`. The function answers 4.6's `LeadPlanFacts`, which is what the plan card was proved against.
15. **4.6 is the one declaration site for the DTOs, and carries what the doors actually return.** `LeadSearchRoundDto` gains `with_phone` and `ending_pending` (W2 put both on the view; without the second the strip cannot tell Stopping from Checking, which is S12's whole point) and `waiting_since`; `LeadRowDto` gains `email_checked_at` and the four worked-state columns. Tasks 10 and 12 had each declared a `LeadSearchDto` of their own — a `TS2300` in one module — and now quote 4.6's instead.
16. **4.6's strip assertion could not hold and is replaced.** `vm.title.startsWith(LEAD_ENDING_WORDS[ending].split(" ")[0])` fails for seven of the nine endings, because `LEAD_ENDING_WORDS` is the ending's *name* and §8.8's sentence is its own ("Searched everything this plan covers" against "Found 160 personal trainers"). W3 and W5 reached this independently and both proved it; Task 19 owns the nine sentences as `leadEndingLine`, Task 10 composes from it, and the assertion is `assert.equal(vm.title, leadEndingLine(ending, facts).title)`.
17. **Task 7's catalog query answers three names, not two.** W2 ran it against the migrated state: `erase_contact` also writes `contacts … consent =` and is a definer function `authenticated` may execute (`00027:298–300`). The test asserts the true set, then asserts what the acceptance is actually about — erasure only ever writes `'unknown'`, and the two doors that can grant a yes both carry `LEAD_CONSENT_REFUSAL` verbatim.
18. **Task 16's `leadSearchWords` reads `plan.exclusions[].text`.** It was written against `criteria[].{exclude, words}`, a shape release A does not have: `LeadSearchPlanSchema` spells a criterion `{ key, text, standard, required }` and an exclusion `{ key, text, origin }`.
19. **`leads.css` is created and registered once, in Task 8**, and every later task appends its own block; the `legacy.css` head comment's "18 legacy stylesheets" becomes 19 there. Three writers had each created and registered it. Task 18 keeps the lead cells and the phone, which nothing else writes, and its cells follow Task 2's own class names (`.ld-biz-cell`, not `.ld-business-cell`).
20. **Every `?v=` is assigned once, in Task 22 step 1a**, with the table of every edited file and its one new number. The writers had bumped per task, which gives one file two numbers.
21. **The migration is `00142` everywhere**, with the re-list rule stated in 4.2 step 1 and again in Task 22 step 2.

## How to read this plan

**The spec** is `docs/plans/2026-09-17-people-table-and-lead-finder.md` (PRD v3). Section numbers below are its. **The interface** release A ships is `docs/plans/2026-09-19-lead-finder-A-interface.md` (names and shapes win there; the PRD wins for behaviour). **The review** is `docs/plans/2026-09-18-lead-finder-review.md` (E8, E9, P1–P5, S9, S12, S13, S16, and the gates G4, G5). **The design** is the canvas (21 artboards; the PRD's head names it) and its States artboard. **Release C** is `docs/plans/2026-09-19-lead-finder-C-extras.md`: none of it is built before owners use this release.

**Every task is written in full**, in one format: **Files** (create/modify/test, with the anchors on main), then bite-sized steps with checkboxes — the failing test in full, the command that runs it and the failure to expect, the implementation in full (an `old`/`new` pair for every modify, anchored on text that occurs exactly once), the run, the mutation checks, and the commit message in the house voice. Where a task's text was written after its sketch and corrected it, the correction is stated in the task and listed under "Reconciled while stitching" below, with what proved it.

**House rules this plan keeps, everywhere** (v2:13–39, carried over with the numbers corrected):

- **Never add a `readCode(`/`readRaw(` assertion.** `source-scan-ratchet.test.mjs` counts them per file; a count may only fall. Every new test here runs code: real functions, a route's `run`, a page on the stub React. Where an existing pin's *value* changes (`PROPOSAL_GATE` at `ask.test.mjs:375`, `leads: "clients",` at `calendar-people.test.mjs:506`, the four `readCode` reads of `clients-a.jsx` at `calendar-people.test.mjs:509, 600, 642, 702` whose strings may move into `people-table.jsx`), the assertion is edited, not added.
- **Migrations:** take the next free number and **re-list `supabase/migrations` immediately before pushing**; two sessions have taken the same number and the CLI skips the second silently (`migrations.test.mjs` fails duplicates). `00138` is in production (19 Sep); release A writes `00140`, #686 wrote `00141`; this release writes **`00142`**, and re-lists before the push in case a session took it first. **The agent runs the production `db push` (Ruben, 18 Sep):** once CI is green, from the PR's branch, a dry run that lists only this release's migration, then `db push --linked --yes` with the cached CLI, a read-back with `db query --linked`, then the merge. If the auto-mode classifier refuses, never reroute: hand Ruben the PowerShell one-liner. Every migration is re-runnable (`if not exists`, `create or replace`, `drop … if exists`).
- **Widening a CHECK set** takes the migration, the contracts list and `schema-sets.generated.ts` (`corepack pnpm gen:schema-sets` with `supabase start`); `schema-sets.ts:69, :85` hold `jobs.kind` and `notifications.kind` equal to their contracts lists.
- **Package dists are committed.** After any change under `packages/`, run `node tooling/scripts/check-dist.mjs`, keep only dists with a real diff (`for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done`), commit them.
- **Tests import `packages/*/src/*.ts` directly**, so a red test is never a stale dist. Tests that import `@chanlytics/contracts` read the dist: rebuild it before believing a red.
- **Legacy JSX:** bump `?v=N` in `apps/dashboard/src/legacy/Chanlytics.html` for every edited file — **once per file for the whole release, in one place: Task 22 step 1a**, which holds the table of every file this release touches and its one new number. A task that bumps the same file again in its own step gives the release two numbers for one file, and a task that forgets leaves a browser on the old one; both are avoided by nobody but Task 22 choosing a number. A file this release *creates* is written `?v=1` by the task that creates it and is not in Task 22's table. a new file goes in BOTH `apps/dashboard/src/legacy-bridge/manifest.ts` and `Chanlytics.html` (`legacy-harness.test.mjs:64` holds them together in order); a new stylesheet goes in both `Chanlytics.html` and `apps/dashboard/src/legacy-bridge/legacy.css` (:8–9 is where `clients.css` and `people.css` sit). Lint and build never execute the legacy `.jsx`: render it loaded, and mutation-check that each test fails when the code is wrong. `@container` rules come after what they override.
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
| Modify `tooling/scripts/tests/people-honest.test.mjs:219`, `person-honest.test.mjs:183`, `refusals-on-the-page.test.mjs:239` | Import `people-table.jsx` before the page, and copy its nine names from `window` onto `globalThis` | 1 |
| Modify `tooling/scripts/tests/calendar-people.test.mjs:509, 600, 642, 702`, `tooling/scripts/tests/source-scan-baseline.json` | Hoist four `readCode` reads into one, add one for `people-table.jsx`, re-point the strings that moved; the ratchet baseline 47 → 45 (the only baseline change in the release) | 1 |
| Create `apps/dashboard/src/legacy-bridge/leads.ts` | `leadsOverride` (the surface, keyed by view), `window.__LEADS`, `installLeadsCourier` | 3 |
| Modify `apps/dashboard/src/legacy-bridge/LegacyApp.tsx:19, :32, :59, :104`, `refresh-map.ts:41`, `surface-registry.ts:42, :85, :193`, `packages/db/src/realtime.ts:24` | Register the surface and courier; the lead routes patch the surface; `leads` real and fed; the old route lands on `clients/leads`; the lead tables watched | 3 |
| Create `supabase/migrations/00142_the_leads_are_worked.sql` | The doors: stage and outcome, bulk, erase, export mark, `lead_suggestions`, `leads_page` with `p_list`, `lead_list_counts`, the view's undo fields, the bell's two kinds, the five events, the consent doors' refusal | 4 |
| Create `packages/contracts/src/leads.ts`; modify `index.ts:65`, `lead-search.ts:50` (`LEAD_OPERATION_KINDS` widened) and `:167–205` (the plan sentence), `enums.ts:198`, `notifications.ts:198, :252`, `ask.ts:379, :393`, `chrome.ts:159`, `schema-sets.generated.ts:56, :103` | The words (one `LEAD_WORDS` record), the DTOs and view models, the request schemas, `leadsRoute`/`parseLeadsRoute`, `stageArgs`, the draft's foot, the endings' sentences, `leadSearchWords`; the kinds; the gate; the two keys. The stored sets stay in `lead-search.ts` and are imported, never re-declared | 4, 6, 9, 10, 12, 16, 17, 19 |
| Modify `apps/dashboard/src/server/leads.ts` (A's), create `model-json.ts`; modify `rate-limit.ts:141`, `service.ts` | The routes' shared work (`planFacts`, `setStage`, `bulkStage`, `draftFor`, `leadMailto`, `undoSearch`, `exportLeads`, `suggestionsFor`); one structured answer through the gateway; **three** new rate buckets (A's `lead_member` is reused); `saveLeadSuggestions` | 4, 13, 17, 19 |
| Create the route files under `apps/dashboard/app/api/v1/{lead-searches/[id],lead-searches/[id]/undo,leads/[id]/stage,leads/[id]/draft,leads/[id],leads/bulk,leads/export,lead-suggestions}` | Policies and thin handlers; ten new entries in `route-policy.json`. `lead-searches/[id]/undo` is the Done strip's Undo (§8.6), which §12.6's B list did not carry | 4 |
| Modify `apps/edge/api/admin/llm.ts:53`, `apps/edge/lib/ask-gateway.ts:132–170` | `GATEWAY_PURPOSES`; a JSON-schema format for the two that are not Ask | 5 |
| Modify `apps/dashboard/src/server/ask/{tools,proposals,prompt}.ts`, `legacy-bridge/ask/commit.ts:62, :156`, `legacy/pages/ask-turn.jsx:122–124` | `propose_lead_search`, `list_lead_searches`; the rules; the card's commit, undo, kind, icon and link | 6 |
| Create `apps/dashboard/src/legacy/pages/leads-scope.jsx` (Task 2), `leads-finder.jsx` (Task 8), `leads-peek.jsx` (Task 12), `styles/leads.css` (Task 8) | `LeadsScope`, `LeadsBulkBar`, `LeadRowActions`, `LeadShape`, `LeadSearchMenu`, `LeadsPhoneBar`, `LeadFinderSheet`, `LEAD_COLUMNS`; `LeadFinder`, `LeadPlanCard`, `LeadPick`, `LeadStrip`, `LeadsFirstDay`; `LeadPeek`, `LeadPeekActions`, `leadPeekEscape`, `leadPeekFollows`, `leadPeekFocus`, `leadArmOnReturn`; the styles and the phone rules. Each file is created and registered once, by the task named here; every later task appends | 2, 8–19 |
| Modify `apps/dashboard/src/legacy/components/icons.jsx:63`, `apps/dashboard/src/legacy-bridge/seed-globals.ts:11, :29, :75`, `inbox-verbs.ts:438`, `apps/dashboard/src/legacy/pages/settings.jsx:16–19` | The nine missing icon cases, added once; `window.__LEAD_WORDS`, `__LEAD_VM` and `__leadWays` seeded; `href(key, params, query?)` widened so a download can name its view; `find` in the mockup's own role table | 8, 9, 10, 12, 16, 17, 19 |
| Delete `apps/dashboard/src/legacy/pages/leads.jsx`; modify its readers (Task 20's list) | Retire the seeded page | 20 |
| Modify `tooling/scripts/e2e-workspace.mjs:66`, `e2e/signals.ts`, `e2e/people.spec.ts:150`; create `e2e/leads.spec.ts` | The seed, the checks, the nightly | 21 |
| Create tests `people-table.test.mjs` (1), `leads-bridge.test.mjs` (3), `leads-vm.test.mjs` (4.1, appended by 9, 10, 12–15, 17, 19), `lead-routes.test.mjs` (4.4), `leads.db.test.mjs` (4.2), `consent-paths.db.test.mjs` (4.2/7), `lead-gateway.test.mjs` (5), `lead-ask.test.mjs` (6), `consent-paths.test.mjs` (7), `leads-honest.test.mjs` (2, appended by 11, 16, 17, 18, 19), `leads-finder.test.mjs` (8, appended by 9, 10), `leads-peek.test.mjs` (12, appended by 13–15) | The one page harness is `leads-honest.test.mjs`; the peek and the finder have their own, because each draws a file of its own | all |
| Modify tests `ask.test.mjs:375`, `calendar-people.test.mjs:506`, `surface-registry.test.mjs:261`, `chrome.test.mjs`, `lead-search.test.mjs:41–48`, `notifications.test.mjs`, `e2e-workspace.test.mjs`, `e2e/people.spec.ts:150`; create `e2e/leads.spec.ts` | Existing assertions whose **value** changes, never a new `readCode(` | 1, 2, 3, 6, 9, 10, 21 |

## Task 0: a worktree of its own, and what must be on main

- [ ] `git -C cm-leads fetch origin`, `git -C cm-leads worktree add ../cm-leads-product -b feat/leads-product origin/main`, install.
- [ ] **Release A is on main; this plan is written against it.** A1 is `supabase/migrations/00140_the_lead_finder_engine.sql` with `packages/contracts/src/lead-search.ts` and `lead-judge.ts` (#685); A2 is the runtime — `packages/core/src/leads/`, `packages/channels/src/{apify,lead-judge}.ts`, `apps/edge/lib/lead-{db,wires,pipeline,sweep}.ts`, `apps/edge/api/apify-webhook.ts`, `apps/edge/api/cron/leads.ts`, the ten A routes and `apps/dashboard/src/server/leads.ts` — merged as **`1441f5bc`** (#687), which is the commit every anchor in this plan was read at. Confirm it: `git log --oneline -1 origin/main` and the A routes in `apps/dashboard/src/client/routes.generated.ts`.
- [ ] **What is NOT a gate for this release.** PRD §14 says B is written once A is *measured*; the measurement is G2's labelled run (the judge's precision against a hand-labelled set) and it is **pending**. Nothing in release B waits on it: no number it produces is copy on any screen, the reachability lines come from `lead_niche_priors` (seeded from A1's calibration), and the plan card says its estimate updates after the first 25 rather than claiming a precision. Read the G2/G3 records in `docs/plans/2026-09-19-lead-finder-A2-pipeline.md` when they land; do not wait for them to start Task 1.
- [ ] **`lead_platform.tenants_on` does not list the nightly's workspace yet.** Release A's migration creates the row with `tenants_on` defaulting to `'{}'` and lists nobody (`00140:57–66`); Task 21's `converge` writes it, additively. Do not read this as A being incomplete.
- [ ] Read `clients-a.jsx` as it then stands: every anchor below is main's at `1441f5bc` and must be checked against the merged code before any component is written.
- [ ] Record the lift of the Leads decision where release A did not already: `apps/dashboard/src/legacy/CLAUDE.md:3–7` (the status paragraph that keeps Leads hidden "until the product is at 100%"), the registry's comment (`surface-registry.ts:36–41`) and `docs/system-prd.md:643` ("leads and pipeline redirect to People"). Ruben lifted it on 18 September for this slice (the PRD's head).

## Task 1: the table lifted out, parameterised by its columns (written in full)

**Files:** Create `apps/dashboard/src/legacy/pages/people-table.jsx` · Modify `apps/dashboard/src/legacy/pages/clients-a.jsx`, `apps/dashboard/src/legacy-bridge/manifest.ts:55`, `apps/dashboard/src/legacy/Chanlytics.html:93`, `tooling/scripts/tests/people-honest.test.mjs:219`, `person-honest.test.mjs:183`, `refusals-on-the-page.test.mjs:239`, `calendar-people.test.mjs:509, 600, 642, 702` · Test `tooling/scripts/tests/people-table.test.mjs`

**What moves, and why it must.** The table and its menu are `clients-a.jsx:1148–1272`: `PL_SORT_KEYS` (:1148), `plLocked` (:1151), `plShows` (:1154), `plDrawnColumns` (:1159), `PeopleTable` (:1170), `plColumnChoices` (:1233), `plColumnOptions` (:1240), `PeopleColumnsMenu` (:1249), `PL_NO_SEL` (:1272). Four of them close over `PL_COLUMNS` (:1106), so Leads could not draw them with columns of its own; the comment above `PeopleTable` (:1161–1169) says it stays in the file "until then". Then is now. `PL_COLUMNS` and every People cell stay in `clients-a.jsx`; the generic parts go to a file loaded before it, and each takes the column list.

- [ ] **Step 1: The failing tests.** On the people-honest harness's stub React (copy its setup, `people-honest.test.mjs:200–262`: the window, the stub, `walk`/`all`/`find`/`byTestId`/`textOf`), loading only `data-bits.jsx` and `people-table.jsx`. Two lines the harness needs that `people-honest.test.mjs` does not (proved while Task 1 was applied, W1): `globalThis.window.React = globalThis.React;` before the import, because the `td` helper below builds its cell with `T.React.createElement` and the harness sets only `globalThis.React` (this is what `seed-globals.ts` does in the app); and, after the import, the copy line that Step 3 gives the three page harnesses, because a legacy file's `Object.assign(window, …)` writes to `globalThis.window`, which here is a plain object:

```js
globalThis.window.React = globalThis.React;
await import("../../../apps/dashboard/src/legacy/pages/people-table.jsx");
for (const k of ["PeopleTable", "PeopleColumnsMenu", "plLocked", "plShows", "plSortKeys", "plDrawnColumns", "plColumnChoices", "plColumnOptions", "PL_NO_SEL"]) globalThis[k] = globalThis.window[k];
```


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

- [ ] **Step 3: Load it everywhere the page loads.** `manifest.ts:55` gains `import "@/legacy/pages/people-table.jsx";` on the line before `clients-a.jsx`; `Chanlytics.html:93` gains `<script type="text/babel" src="pages/people-table.jsx?v=1"></script>` on the line before `clients-a.jsx` (every `?v=` number in this release is Task 22's, assigned once). Every harness that imports the page imports the table first: `people-honest.test.mjs:219`, `person-honest.test.mjs:183`, `refusals-on-the-page.test.mjs:239` each gain, on the line before their import of `clients-a.jsx`:

```js
await import("../../../apps/dashboard/src/legacy/pages/people-table.jsx");
for (const k of ["PeopleTable", "PeopleColumnsMenu", "plLocked", "plShows", "plSortKeys", "plDrawnColumns", "plColumnChoices", "plColumnOptions", "PL_NO_SEL"]) globalThis[k] = globalThis.window[k];
```

The second line is not optional and is the one the lift needs: `Object.assign(window, …)` in a legacy file writes to `globalThis.window`, which in these harnesses is a plain object, while the page reads the nine names as bare globals — `data-bits.jsx`'s names already get the same line. Without it the three harnesses go red with `PeopleTable is not defined` (W1 saw exactly that).

`calendar-people.test.mjs:509, 600, 642, 702` read `clients-a.jsx` as text, and three of the strings they read move out of it (`data-testid="select-all"`, `data-testid="row-select"`, and the foot's `${total} … person/people`, which moves **and** becomes `words.one`/`words.many`). **A fifth `readCode(` may not be added** (the house rule, and `source-scan-ratchet.test.mjs` counts them per file; `calendar-people.test.mjs` sits at its baseline of 47). So: hoist the file's four reads of `clients-a.jsx` into one module-level `const PEOPLE_PAGE = readCode("apps/dashboard/src/legacy/pages/clients-a.jsx");`, add one `const PEOPLE_TABLE = readCode("apps/dashboard/src/legacy/pages/people-table.jsx");`, point each moved `includes(…)` at `PEOPLE_TABLE` (the foot's at `words.one`), and lower the baseline with `UPDATE_SOURCE_SCAN_BASELINE=1 node --conditions=react-server --import tsx --test tooling/scripts/tests/source-scan-ratchet.test.mjs`: **47 → 45**, one line of `source-scan-baseline.json`. Five reads become two; the ratchet only ever falls. This is the one baseline change in the release, and no task anywhere adds a `readCode(`/`readRaw(` assertion.
- [ ] **Step 4: `LEAD_COLUMNS`, in the real shape** — the specification, so the shape is one thing; **the constant itself is written in Task 2's `leads-scope.jsx`** (`LEAD_COLUMNS`, `LEAD_SORT_KEYS = plSortKeys(LEAD_COLUMNS)`) and nothing here declares a second one. PRD §6.2's Leads rows, each `{ key, label, sortable, pinned, fixed, on, needs, cell(l, x) }`; the sort keys are the ones `leads_page` takes (Task 4):

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

- [ ] **Step 5:** Run `people-table.test.mjs people-honest.test.mjs person-honest.test.mjs refusals-on-the-page.test.mjs legacy-harness.test.mjs calendar-people.test.mjs source-scan-ratchet.test.mjs` → PASS (W1 ran exactly this list after applying Task 1: `people-table.test.mjs` 3/3, `people-honest` 56/56, `person-honest` 29/29, `refusals-on-the-page` 11/11, `calendar-people` 32/32, `legacy-harness` 9/9, `source-scan-ratchet` 3/3). Commit — "The People table takes its columns from whoever draws it, and says what it calls its rows". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

## Task 2: the Leads scope of People

**Files:** Modify `apps/dashboard/src/legacy/pages/clients-a.jsx` (`PL_VIEW_KEY` :672, `plViewSaver` :680, `plDownload` :714, `usePeople` :729, `PeopleRail` :926, `PeopleStanding` :975, `PL_OVERLAY` :1563 — all as they stand **after Task 1's lift**, which removes :1147–1272 from the file), `apps/dashboard/src/legacy/pages/app-shell.jsx:401`, `:416`, `:437`, `packages/contracts/src/chrome.ts:159`, `apps/dashboard/src/legacy-bridge/manifest.ts:64`, `apps/dashboard/src/legacy/Chanlytics.html:105`, `tooling/scripts/tests/calendar-people.test.mjs`, `chrome.test.mjs` · Create `apps/dashboard/src/legacy/pages/leads-scope.jsx`, `tooling/scripts/tests/leads-honest.test.mjs`

**What this task owns, and what the tasks after it add.** This task makes Leads a *scope* of the People page: the address, the switch, the rail, the standing line, the view, the columns, the one keyboard listener, the search box, the bulk bar, and the frame `LeadsScope` that the rest of release B fills in. It writes `leads-scope.jsx` whole, because a legacy file is written once; the three class acts on a row are Task 11's, the kept search's menu is Task 16's, and the finder, the strip, the peek and the first day (Tasks 8, 10, 12, 17) are drawn here as `LeadFinder`, `LeadStrip`, `LeadPeek` and `LeadsFirstDay`, each in its own file from the same manifest. Task 3 (the surface and the courier) must be applied first: this page reads `window.__LEADS` and calls `window.__leadsView`, `__leadsMore`, `__leadKeep`, `__leadExclude`, `__leadPutBack`, `__leadUndo`, `__leadsBulk`, `__leadSearchRename`, `__leadSearchRemove`, `__leadSearchMore`, `__leadsRouteOf` and `__href`, all of which that task installs. Task 3 also flips `surface-registry.ts`'s `leads: "real"`, `ROUTE_SURFACE.leads`, `routeSurfaceFor` and `SURFACE_RETIRED.leads = "clients/leads"`; this task does not touch that file.

**Two names this task adds to Task 3's courier, in `installLeadsCourier` (`legacy-bridge/leads.ts`).** The page needs the view models contracts holds for the rail and the standing line, and the parser for the address it is given. `leadsRoute` is already there as `__leadsRouteOf`; `parseLeadsRoute`, `leadRail` and `leadsStanding` (all contracts `leads.ts`, Task 4.1 and 4.6) join it as `__leadsRouteParse`, `__leadRail` and `__leadsStanding`. Step 3 below spells the edit.

**The requirements this task must meet, each with its anchor:**

1. **`ClientsA({ scope = "people", leadsRoute = null, onNavigate = null, …props })`** passes all three through to `ClientsAReal`; the seeded page ignores them. The shell draws the Leads scope from a new branch *before* `page === "clients" && param && /^(seg|list|state):/` (`app-shell.jsx:401`), matching `/^leads(:|$)/` on `param`, with `activeNav = "clients"` and crumbs `People › Leads › <search name>`; `key="leads"` remounts the page on a scope change so its state starts from the view it is showing. Both People branches gain `key="people" scope="people" onNavigate={navigate}`.
2. **`LeadsScope` is hookless and its state is `ClientsAReal`'s.** The harness draws `window.ClientsA(props)` on a stub React that keys hooks by call order within one draw (`people-honest.test.mjs:258`), so every hook the Leads scope needs is declared in `ClientsAReal` in **both** scopes, in one order. The fifteen: `peekId`, `finderOpen`, `finderStage`, `finderWords`, `finderProposal`, `finderRefusal`, `peekMode`, `draft`, `armed`, `chip`, `allMatching`, `renaming`, `removing`, `leadBusy`, `removeError`, beside `useLeads()`'s reducer and effect at the head and People's own (`sel`, `cursor`, `colChoices`, `colsOpen`, `scrolledX`, `q`, the toast). `peekMode` (`info | why | draft`) and `draft` are the peek's panes (Tasks 12 and 13); `armed` carries `{ kind: "sent" | "call", leadId, asked, outcome, note }`, where `asked` turns true only once the tab is the owner's again (`leadArmOnReturn`, Task 13), so nothing is asked while they are away. A test draws People then Leads and pins that the stub's hook sequence length is the same after each.
3. **The rail's `People | Leads`** is `PeopleScopeTabs`, a `role="tablist"` at the head of `PeopleRail`, its two `role="tab"` buttons carrying `aria-selected`. Under Leads the rows below it are `LeadsRailRows`, drawn from `leadRail(counts, searches)`: All leads, Ready, Contacted, Talking, Said no (only when any), Not a fit, then **Searches** with each search's count, a live dot on a running one and a `?` in the accent on one waiting on the owner. The smart lists and the lists kept by hand are drawn only under People.
4. **The standing line** (`PeopleStanding`) takes a `scope`: under Leads it draws `leadsStanding(counts, searches)` — "322 leads · 272 ready · 3 searches" — and "1 search needs you" is a button to that search's view (`data-testid="leads-standing-needs"`).
5. **The view.** `remembered` reads `plLoadView(scope)` (`PL_VIEW_KEYS`: `chanlytics-people-view`, `chanlytics-leads-view`) under `people.views[scope]`; `sortBy` defaults to `"fit"` for leads and `"last"` for people; `plViewSaver(page)` takes the page name and `window.__saveView(page, view)` sends it; the save effect sends `{ list, sortBy, sortDir, columns }` under Leads and `{ sortBy, sortDir, columns }` under People, every key every time, one save at a time, and never for the view it already holds. `list` is the rail's row (`all | ready | nurture | converted | said_no | not_a_fit`), read from the address (`parseLeadsRoute(leadsRoute)`), which is the one place it lives.
6. **The one listener** gains its branches, never a second listener: Esc closes the peek, then the finder, then the Columns menu, then the selection, one press each; the finder holds every other key while it is open; `F` opens the finder for whoever may find; `C` calls the lead under the cursor. `keys.current` gains `peekOpen, closePeek, finderOpen, closeFinder, canFind, find, call`, each false or null under People. `closePeek` is `leadPeekEscape({ mode, armed, setMode, setArmed, setPeekId })` (`leads-peek.jsx`, Task 12): one press backs out one step **inside** the peek — the question it asked, then the pane it opened, then the peek itself — while the order OUT stays this task's. `SHORTCUTS` (`chrome.ts`) gains `F` and `C` in the People group.
   **The peek follows the cursor** while it is open, so J and K walk the leads behind it — unless it is asking a question or holding a draft, which `leadPeekFollows(mode, armed)` (Task 12) says. The cursor effect's own `document.getElementById(`person-${cursor}`)` (`clients-a.jsx:1810`) is **not** changed here: Task 12 fixes it to the table's noun (`lead-<id>`, Task 1) as part of the peek's focus rule.
7. **`PL_OVERLAY`** excludes the page's own two new overlays, `.pl-peek` and `.pl-finder`, so J and K keep walking the rows under an open peek and Esc reaches the listener.
8. **The phone band is ≤900px** (`clients.css:1787`); nothing here uses 720. The lead grid areas and `leads.css` are Task 18's.
9. **The search box** under Leads filters the loaded rows at once by name, category and area; nothing is sent anywhere (words to chips is release C) and the placeholder says "Search leads".
10. **Bulk**: `LeadsBulkBar` (this file) — Copy emails ("Copied 12 emails; 3 had none you can use"), Mark contacted, Not a fit, Export — each on the rows shown **and** selected; the bar offers **Select all 1,240 that match** when the view holds more than the loaded rows, which hands the view's filters to `POST leads/bulk { by: "view", action, view }`. Each toasts with Undo through `POST lead-operations/[id]/undo { version }`.
11. **Rows never re-sort under the owner.** The page draws `window.__LEADS.rows` in the order the surface read them and sorts nothing itself: a heading press is one more read, keyed by the whole view (`__leadsView({ …, sort, dir })`), and the rows on screen hold their order until that read lands. The "12 new" the surface holds back is the strip's (Task 10).

- [ ] **Step 1: The failing test.** `tooling/scripts/tests/leads-honest.test.mjs`, on the people-honest harness (its window, its stub React, `walk`/`all`/`find`/`byTestId`/`textOf`/`press`/`click`). The Leads surface and the courier are faked here — Task 3's `leads-bridge.test.mjs` proves the real ones over a fake wire — so what this file proves is the page. `leadsRoute` and `parseLeadsRoute` are copied from Task 4.1 verbatim, because the page's view IS the address and a stand-in that parsed it differently would prove nothing.

```js
// tooling/scripts/tests/leads-honest.test.mjs
/**
 * The Leads scope of People: the same page, its other scope.
 *
 * Drawn the way people-honest.test.mjs draws People -- window.ClientsA on a stub React that keys hooks by call
 * order -- with scope="leads" and the address's view. The surface (window.__LEADS) and the courier
 * (window.__leadX) are faked here: release B's Task 3 writes the real ones, and leads-bridge.test.mjs proves
 * them over a fake wire. What this file proves is the PAGE: its rail, its standing line, its view, its one
 * keyboard listener, its bulk bar, and the three classes' acts.
 *
 * leadsRoute / parseLeadsRoute below are Task 4.1's, copied as that task spells them, because the page's view
 * IS the address and a stand-in that parsed it differently would prove nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_PERMS, roleGate } from "@chanlytics/contracts";

/* ----------------------------- the view, as a route (Task 4.1's, verbatim) ---- */

const LEAD_LISTS = ["all", "ready", "nurture", "converted", "said_no", "not_a_fit"];
const LEAD_CLASSES = ["qualified", "review", "excluded"];
function leadsRoute(v) {
  const parts = ["clients/leads"];
  if (v.searchId) parts.push(`s-${v.searchId}`);
  if (v.list && v.list !== "all") parts.push(`l-${v.list}`);
  if (v.cls) parts.push(`c-${v.cls}`);
  return parts.join(":");
}
function parseLeadsRoute(route) {
  const [head, ...segs] = route.split(":");
  if (head !== "clients/leads" && head !== "leads") return null;
  const out = { searchId: null, list: "all", cls: null, chips: {} };
  for (const s of segs) {
    const dash = s.indexOf("-");
    if (dash < 1) continue;
    const [seg, val] = [s.slice(0, dash), s.slice(dash + 1)];
    if (seg === "s" && /^[0-9a-f-]{36}$/.test(val)) out.searchId = val;
    else if (seg === "l" && LEAD_LISTS.includes(val)) out.list = val;
    else if (seg === "c" && LEAD_CLASSES.includes(val)) out.cls = val;
  }
  return out;
}

/* ------------------------------------------------------------- the fixtures */

const SEARCH_A = "5e000000-0000-4000-8000-000000000001";
const SEARCH_B = "5e000000-0000-4000-8000-000000000002";
const COUNTS = { all: 322, ready: 272, nurture: 31, converted: 9, said_no: 6, not_a_fit: 4 };

/** A search with its latest round, the shape lead_searches_view answers (Task 4.6's LeadSearchDto). */
const search = (over = {}) => ({
  id: SEARCH_A,
  name: "Personal trainers · Austin",
  asked: "personal trainers in Austin with a website, about 200",
  asked_on: "2026-09-18T15:00:00.000Z",
  plan: { where: { area: "Austin, TX" }, count: 200 },
  plan_version: 1,
  round: { id: "r1", seq: 1, purpose: "main", state: "ended", ending: "target_reached", question: null, target: 200, counted: 161, qualified: 2, review: 1, excluded: 1, emails_checked: 88, cost_usd: 4.2, ended_at: "2026-09-18T16:00:00.000Z", undo_op_id: "op-1", undo_version: 3 },
  ...over,
});
const waiting = { ...search({ id: SEARCH_B, name: "Chiropractors · Round Rock" }), round: { ...search().round, id: "r2", state: "waiting_on_owner", ending: null, question: { sentence: "Most of the first 25 were chains. Keep leaving them out?", criterion_key: "chain" }, counted: 25 } };

/** One row as toLeadRowVM (Task 4.6) answers it: every word the table draws, none of them a stored value. */
const lead = (over = {}) => ({
  id: "l1", searchId: SEARCH_A, searchName: "Personal trainers · Austin",
  mark: "ZS", name: "Zilker Strength Lab", places: 1, category: "Personal trainer", area: "78704 · Austin, TX",
  cls: "qualified", fitLabel: "Strong fit", fitTitle: "Independent coaching · 5.0 from 16 reviews",
  email: "hello@zilkerstrength.example", emailState: "ok", emailLabel: "hello@zilkerstrength.example", emailWord: "Checked",
  phone: "+15125550101", phoneAgrees: true, phoneWrong: false,
  why: "Independent studio, one location, coaching only", rating: "5.0 · 16",
  stage: "ready", stageLabel: "Ready", foundLabel: "6m", foundAt: "Sep 18, 2026 · 2:14 PM",
  distance: "1.2 mi", source: "Google Maps listing", host: "zilkerstrength.example",
  excludedBy: null, version: 1,
  ...over,
});
const ROWS = [
  lead(),
  lead({ id: "l2", mark: "BC", name: "Barton Creek Coaching", fitLabel: "Worth a look", email: "team@bartoncreekcoaching.example", emailLabel: "team@bartoncreekcoaching.example", emailState: "catch_all", emailWord: "Unconfirmed", phone: "+15125550102", phoneAgrees: false, rating: "4.8 · 61", foundLabel: "12m" }),
  lead({ id: "l3", mark: "LS", name: "Lamar Strength Co.", cls: "review", fitLabel: "Couldn't check the email", fitTitle: "Their server would not answer", email: "info@lamarstrength.example", emailLabel: "info@lamarstrength.example", emailState: "unknown", emailWord: "Couldn't check", phone: "+15125550103", rating: "4.6 · 22", foundLabel: "20m" }),
  lead({ id: "l4", mark: "GF", name: "GigaFit Austin", cls: "excluded", fitLabel: "Chain", fitTitle: "Left out: chain gyms", excludedBy: "Chain", email: null, emailLabel: "", emailState: "none", emailWord: "No email", phone: "+15125550104", rating: "4.1 · 903", foundLabel: "22m", stage: "ready", stageLabel: "Ready" }),
  lead({ id: "l5", mark: "PT", name: "Pflugerville Training", cls: "excluded", fitLabel: "Not a personal trainer", excludedBy: "Not a personal trainer", email: null, emailLabel: "", emailState: "none", emailWord: "No email", phone: "+15125550105", rating: "4.4 · 12", foundLabel: "24m" }),
];

/** The Leads surface, as legacy-bridge/leads.ts publishes it (Task 3's LeadsSurface). */
const surface = (over = {}) => ({
  searches: [search(), waiting],
  counts: COUNTS,
  rows: ROWS,
  next: null,
  offered: 0,
  view: { searchId: null, list: "all", cls: null, chips: {}, sort: "fit", dir: "asc" },
  route: "clients/leads",
  suggestions: null,
  tz: "America/Chicago",
  readFailed: false,
  fetchedAt: Date.now(),
  ...over,
});

/* ------------------------------- the window ------------------------------- */

const listeners = {};
let overlayOpen = null;
const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = {
  body: {},
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  querySelector: (sel) => (overlayOpen && sel.split(",").some((part) => part.includes(`[role="${overlayOpen.role}"]`) && (overlayOpen.inApp !== false || !part.includes(".app-root")) && !String(overlayOpen.className || "").split(/\s+/).some((c) => c && part.includes(`:not(.${c})`))) ? overlayOpen : null),
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  location: { pathname: "/w/salon", hash: "#/clients/leads", origin: "https://app.chanlytics.com", href: "" },
  history: { replaceState: (_s, _t, hash) => { globalThis.window.location.hash = hash; } },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => { (listeners[type] ||= new Set()).add(fn); },
  removeEventListener: (type, fn) => { listeners[type]?.delete(fn); },
  dispatchEvent: (ev) => { for (const fn of [...(listeners[ev.type] || [])]) fn(ev); return true; },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  matchMedia: (q) => ({ matches: /max-width: 900px/.test(q) ? globalThis.__phone === true : false }),
};

let cells = [];
let seq = 0;
const flashes = [];
const went = [];
const opened = [];
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = type(props);
    return node;
  },
  cloneElement: (el, props) => ({ ...el, props: { ...el.props, ...props } }),
  useState: (init) => { const k = seq++; if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init; return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }]; },
  useReducer: (red, init) => { const k = seq++; if (!(k in cells)) cells[k] = init; return [cells[k], (a) => { cells[k] = red(cells[k], a); }]; },
  useRef: (init) => { const k = seq++; if (!(k in cells)) cells[k] = { current: init }; return cells[k]; },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: (fn, deps) => {
    const k = seq++;
    const prev = cells[k];
    if (prev && deps && prev.deps && deps.length === prev.deps.length && deps.every((d, i) => Object.is(d, prev.deps[i]))) return;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    cells[k] = { deps, cleanup: undefined };
    cells[k].cleanup = fn();
  },
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.window.React = globalThis.React;
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill"]) globalThis[k] = globalThis.window[k];
// Menus and questions as their props, hookless, so the page's own hook order is all the stub counts.
globalThis.MoreMenu = (p) => { menus.push(p); return null; };
globalThis.Confirm = (p) => { confirms.push(p); return null; };
globalThis.ChannelGlyph = () => null;
globalThis.useHotkey = () => {};
const menus = [];
const confirms = [];
await import("../../../apps/dashboard/src/legacy/pages/people-table.jsx");
for (const k of ["PeopleTable", "PeopleColumnsMenu", "plLocked", "plShows", "plSortKeys", "plDrawnColumns", "plColumnChoices", "plColumnOptions", "PL_NO_SEL"]) globalThis[k] = globalThis.window[k];
await import("../../../apps/dashboard/src/legacy/pages/clients-a.jsx");
for (const k of ["PeopleRail", "PeopleStanding", "PeopleScopeTabs"]) globalThis[k] = globalThis.window[k];
// The boards this task does not write: the finder (Task 8), the strip (Task 10), the peek (Task 12) and the
// first day (Task 17). Drawn here as their props, so what THIS task hands them is what is pinned.
const finders = [];
const strips = [];
const peeks = [];
globalThis.LeadFinder = (p) => { finders.push(p); return null; };
globalThis.LeadStrip = (p) => { strips.push(p); return null; };
globalThis.LeadPeek = (p) => { peeks.push(p); return null; };
globalThis.LeadsFirstDay = () => null;
// The peek's two seams the page reads (Task 12's leads-peek.jsx): Esc backs out one step, and the peek follows
// the row cursor only while it is just showing the lead.
globalThis.leadPeekEscape = ({ mode, armed, setMode, setArmed, setPeekId }) => {
  if (armed && armed.asked) { setArmed(null); return "armed"; }
  if (mode && mode !== "info") { setMode("info"); return "mode"; }
  setPeekId(null);
  return "peek";
};
globalThis.leadPeekFollows = (mode, armed) => (!mode || mode === "info") && !armed;
await import("../../../apps/dashboard/src/legacy/pages/leads-scope.jsx");
for (const k of ["LeadsScope", "LEAD_COLUMNS", "LEAD_SORT_KEYS", "ldExcludedChips"]) globalThis[k] = globalThis.window[k];

const walk = (n, fn) => { if (n == null || typeof n !== "object") return; fn(n); for (const k of n.props?.children ?? []) walk(k, fn); if (n.rendered) walk(n.rendered, fn); };
const all = (tree, pred) => { const out = []; walk(tree, (n) => { if (pred(n)) out.push(n); }); return out; };
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return (n.props?.children ?? []).map(textOf).join("");
};
const click = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {}, currentTarget: {} });
const sortByHeading = (tree, label) => click(find(tree, (n) => n.type === "button" && String(n.props?.className || "").split(/\s+/).includes("cl-th-sort") && textOf(n).startsWith(label)));
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 8) => { for (let i = 0; i < n; i += 1) await tick(); };
const press = (key, target = null, { focus = target, ...mods } = {}) => {
  globalThis.document.activeElement = focus;
  let taken = false;
  const ev = { key, target, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, defaultPrevented: false, preventDefault() { taken = true; ev.defaultPrevented = true; } };
  Object.assign(ev, mods);
  for (const fn of [...(listeners.keydown || [])]) fn(ev);
  return taken;
};

/* ------------------------- the surface and the courier, faked ------------------------- */

/**
 * `leadRail` and `leadsStanding` are contracts' (Task 4.6); these stand-ins answer exactly what that task's own
 * test pins, so the page is drawn from the shape it will really be given. `leadSearchWords` is Task 16's.
 */
const railOf = (counts, searches) => ({
  lists: [
    { id: "all", label: "All leads", count: counts.all },
    { id: "ready", label: "Ready", count: counts.ready },
    { id: "nurture", label: "Contacted", count: counts.nurture },
    { id: "converted", label: "Talking", count: counts.converted },
    ...(counts.said_no > 0 ? [{ id: "said_no", label: "Said no", count: counts.said_no }] : []),
    { id: "not_a_fit", label: "Not a fit", count: counts.not_a_fit },
  ],
  searches: searches.map((s) => ({
    id: s.id,
    name: s.name,
    count: s.round.counted,
    mark: s.round.state === "waiting_on_owner" ? "question" : ["queued", "probing", "running", "checking"].includes(s.round.state) ? "live" : null,
  })),
});
const standingOf = (counts, searches) => {
  const waitingOn = searches.filter((s) => s.round.state === "waiting_on_owner");
  return {
    total: `${counts.all} leads`,
    parts: [`${counts.ready} ready`, `${searches.length} ${searches.length === 1 ? "search" : "searches"}`],
    needsYou: waitingOn.length ? { count: waitingOn.length, searchId: waitingOn[0].id } : null,
  };
};

const calls = [];
const ok = (data = {}) => ({ ok: true, data });
const install = ({ role = "owner", refuse = null } = {}) => {
  calls.length = 0;
  Object.assign(globalThis.window, {
    __leadsRouteOf: leadsRoute,
    __leadsRouteParse: parseLeadsRoute,
    __leadRail: railOf,
    __leadsStanding: standingOf,
    // The derivations bag (seed-globals.ts): Task 9 installs it, Task 10 puts `leadStrip` in it.
    __LEAD_VM: { leadStrip: (s) => ({ state: "ended", alert: false, title: `Found ${s.round.counted} personal trainers`, parts: [], progress: 1, actions: [] }) },
    __leadPeekVM: (id) => { const r = surface().rows.find((x) => x.id === id); return r ? { id: r.id, name: r.name } : null; },
    __leadSearchWords: (s) => (s ? { askedLine: `You asked on Sep 18: “${s.asked}”.`, keepsLine: "Keeps the ones you contacted or are talking to." } : { askedLine: "", keepsLine: "" }),
    __leadsView: async (v) => { calls.push(["view", v]); },
    __leadsMore: async () => { calls.push(["more", null]); },
    __leadsTakeOffered: async () => { calls.push(["takeOffered", null]); },
    __leadKeep: async (s, id) => { calls.push(["keep", { search_id: s, id }]); return refuse || ok({ op_id: "op-k", version: 4 }); },
    __leadExclude: async (s, id) => { calls.push(["exclude", { search_id: s, id }]); return refuse || ok({ op_id: "op-e", version: 5 }); },
    __leadPutBack: async (s, id) => { calls.push(["putBack", { search_id: s, id }]); return refuse || ok({ op_id: "op-p", version: 6 }); },
    __leadUndo: async (op, version) => { calls.push(["undo", { op, version }]); return ok({}); },
    __leadsBulk: async (body) => { calls.push(["bulk", body]); return ok({ done: 2, op_id: "op-b", version: 7 }); },
    __leadSearchRename: async (id, name) => { calls.push(["rename", { id, name }]); return refuse || ok({ name }); },
    __leadSearchRemove: async (id) => { calls.push(["remove", { id }]); return refuse || ok({ archived: 143, kept: 18 }); },
    __leadSearchMore: async (id, purpose, plan) => { calls.push(["more_round", { id, purpose, plan }]); return ok({ round_id: "r9" }); },
    __href: (key, params, query) => `/api/v1/${key.split(" ")[1]}?${new URLSearchParams(Object.entries(query || {}).filter(([, v]) => v !== undefined)).toString()}`,
    __roleGate: roleGate,
    __ME: { role },
    ST_STORE: { myRole: () => role, can: (a) => !!(ROLE_PERMS[role] || {})[a] },
    usePPToast: () => [null, (t) => flashes.push(t)],
    CHANLY: { nav: (to) => went.push(to), R: { thread: (id) => `inbox/${id}` } },
    __clock: { dateYear: () => "Sep 18, 2026", time: () => "2:14 PM" },
    __csvCell: (s) => String(s ?? ""),
  });
};

/** A page with the surface landed and nothing drawn yet. */
const fresh = ({ leads = surface(), views = {}, role = "owner", refuse = null, people = true } = {}) => {
  install({ role, refuse });
  globalThis.window.__LEADS = leads;
  globalThis.window.__PEOPLE = people
    ? { rows: [], lists: [], saved: [], groups: [], aggregates: { total: 0, needsYou: 0, reachedWeek: 0 }, views, attention: {}, savedRead: true, page: null, calendar: null }
    : undefined;
  cells = [];
  flashes.length = 0;
  went.length = 0;
  opened.length = 0;
  menus.length = 0;
  confirms.length = 0;
  finders.length = 0;
  strips.length = 0;
  peeks.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.document.activeElement = null;
  overlayOpen = null;
  globalThis.__phone = false;
  globalThis.localStorage.removeItem("chanlytics-people-view");
  globalThis.localStorage.removeItem("chanlytics-leads-view");
  delete globalThis.window.__saveView;
};
const draw = (props = {}) => { seq = 0; return globalThis.window.ClientsA({ scope: "leads", leadsRoute: "leads", onNavigate: (to) => went.push(to), onOpenProfile: (id) => opened.push(id), ...props }); };

/* ---------------------------------- the rows ---------------------------------- */

const rowOf = (tree, id) => find(tree, (n) => n.type === "tr" && n.props?.id === `lead-${id}`);
const names = (tree) => all(tree, (n) => n.props?.["data-testid"] === "lead-name").map(textOf);
const headings = (tree) => all(tree, (n) => n.type === "th" && !/\bpl-col-off\b/.test(String(n.props?.className || ""))).map((th) => textOf(th).replace(/[▲▼]/g, "").trim()).filter(Boolean);

test("the Leads scope draws the rows the surface read, in the order it read them, each email's state a word beside a shape", () => {
  fresh();
  const tree = draw();
  assert.deepEqual(names(tree), ["Zilker Strength Lab", "Barton Creek Coaching", "Lamar Strength Co.", "GigaFit Austin", "Pflugerville Training"], "the surface's order, strongest fit first; the page never re-sorts what it was given");
  assert.deepEqual(headings(tree), ["Business", "Fit", "Email", "Phone", "Why it fits", "Rating", "Stage", "Found"], "PRD 6.2's Leads columns; Distance waits for a search with a center, and Source, Website and Search are off");
  const email = (id) => byTestId(rowOf(tree, id), "lead-email");
  assert.equal(email("l1").props.title, "Checked");
  assert.equal(email("l2").props.title, "Unconfirmed", "a catch-all server accepts anything, so the check cannot tell (S12)");
  assert.equal(email("l3").props.title, "Couldn't check");
  assert.ok(find(email("l2"), (n) => /\bld-shape\b/.test(String(n.props?.className || ""))), "the state is a shape as well as a word, never colour alone");
  assert.match(textOf(email("l4")), /Not checked/, "a left-out place's email was never checked, and the row says so");
  assert.equal(textOf(byTestId(rowOf(tree, "l4"), "lead-stage")).trim(), "", "an excluded place has no stage: the class is not a stage");
  assert.ok(find(rowOf(tree, "l1"), (n) => n.props?.className === "ld-tick2"), "Maps and their website agree on the number");
  assert.equal(textOf(find(tree, (n) => n.props?.className === "cl-table-foot")).startsWith("322 leads"), true, "the table calls its rows leads");
});

test("the rail counts what the lists hold, a waiting search wears a question mark, and the standing line says who needs you", () => {
  fresh();
  const tree = draw();
  const rows = all(byTestId(tree, "leads-lists"), (n) => n.type === "button").map((b) => [textOf(find(b, (x) => x.props?.className === "label")), textOf(find(b, (x) => x.props?.className === "count"))]);
  assert.deepEqual(rows, [["All leads", "322"], ["Ready", "272"], ["Contacted", "31"], ["Talking", "9"], ["Said no", "6"], ["Not a fit", "4"]]);
  assert.ok(byTestId(tree, `leads-search-${SEARCH_A}`) && byTestId(tree, `leads-search-${SEARCH_B}`), "both searches are on the rail");
  assert.ok(find(byTestId(tree, `leads-search-${SEARCH_B}`), (n) => n.props?.className === "rail-q"), "the one waiting on an answer wears a ? in the accent");
  assert.equal(find(byTestId(tree, `leads-search-${SEARCH_A}`), (n) => n.props?.className === "rail-q"), null, "the one that ended does not");
  assert.equal(textOf(byTestId(tree, "leads-standing")).replace(/·/g, "·"), "322 leads·272 ready·2 searches·1 search needs you");
  click(byTestId(tree, "leads-standing-needs"));
  assert.deepEqual(went, [`clients/leads:s-${SEARCH_B}`], "and it is the tap that opens the search waiting on you");
});

test("the People | Leads switch is a tablist in both scopes, and picking the other one navigates to it", () => {
  fresh();
  let tree = draw();
  const tabs = byTestId(tree, "people-scope");
  assert.equal(tabs.props.role, "tablist");
  assert.deepEqual(all(tabs, (n) => n.props?.role === "tab").map((n) => [textOf(n), n.props["aria-selected"]]), [["People", false], ["Leads", true]]);
  click(byTestId(tree, "scope-people"));
  assert.deepEqual(went, ["clients"]);
  went.length = 0;
  cells = [];
  tree = draw({ scope: "people", leadsRoute: null });
  assert.deepEqual(all(byTestId(tree, "people-scope"), (n) => n.props?.role === "tab").map((n) => n.props["aria-selected"]), [true, false], "and People's rail carries the same switch");
  click(byTestId(tree, "scope-leads"));
  assert.deepEqual(went, ["clients/leads"]);
});

test("drawing People then Leads keeps the page's hook order: every hook the Leads scope needs is declared in both", () => {
  fresh();
  draw({ scope: "people", leadsRoute: null });
  const asPeople = seq;
  cells = [];
  draw();
  assert.equal(seq, asPeople, "one call order, whichever scope is drawn");
  assert.ok(asPeople > 20, `and it is the page's own hooks that were counted (${asPeople})`);
});

test("the Leads view is saved with its list, sort and columns every time, through __saveView('leads', …), one save at a time", async () => {
  fresh({ views: { leads: { list: "all", sortBy: "fit", sortDir: "asc", columns: { website: true } } } });
  const held = [];
  globalThis.window.__saveView = (page, view) => new Promise((land) => held.push({ page, view: JSON.parse(JSON.stringify(view)), land }));
  let tree = draw();
  assert.ok(headings(tree).includes("Website"), "the member's own columns");
  assert.deepEqual(held, [], "the view it already holds is not saved again");
  click(byTestId(tree, "people-columns"));
  tree = draw();
  click(byTestId(tree, "column-source"));
  tree = draw();
  assert.equal(held.length, 1);
  assert.deepEqual(held[0], { page: "leads", view: { list: "all", sortBy: "fit", sortDir: "asc", columns: { website: true, source: true } }, land: held[0].land }, "every key the page owns, the list included");
  // A second change while the first is out waits for it: two in flight could land out of order.
  sortByHeading(tree, "Rating");
  draw();
  assert.equal(held.length, 1, "one save at a time");
  held[0].land({ ok: true, data: {} });
  await settle();
  assert.equal(held.length, 2);
  assert.deepEqual(held[1].view, { list: "all", sortBy: "rating", sortDir: "desc", columns: { website: true, source: true } }, "the latest view, whole");
  held[1].land({ ok: true, data: {} });
  await settle();
  assert.equal(held.length, 2, "and nothing after it");
});

test("a sort is the surface's to read, not the page's to re-order: the rows hold their order until the read lands", () => {
  fresh();
  let tree = draw();
  assert.deepEqual(calls.filter((c) => c[0] === "view").length, 1, "one read for the view the address names");
  sortByHeading(tree, "Rating");
  tree = draw();
  const views = calls.filter((c) => c[0] === "view");
  assert.equal(views.length, 2, "the new sort is one more read, keyed by the whole view");
  assert.deepEqual([views[1][1].sort, views[1][1].dir, views[1][1].list], ["rating", "desc", "all"]);
  assert.deepEqual(names(tree), ["Zilker Strength Lab", "Barton Creek Coaching", "Lamar Strength Co.", "GigaFit Austin", "Pflugerville Training"], "and nothing moved under the owner while it was out");
});

test("a click on a lead's row peeks it, as Enter does", () => {
  fresh();
  const tree = draw();
  find(tree, (n) => n.type === "tr" && n.props?.id === "lead-l3").props.onClick();
  draw();
  assert.equal(peeks.at(-1).vm.id, "l3", "the row is the peek's way in; the name inside it is the other");
  assert.deepEqual(opened, [], "and a lead is never a profile");
});

test("the search box filters the leads loaded, by name, kind and area, and sends nothing", () => {
  fresh();
  let tree = draw();
  const box = find(tree, (n) => n.type === "input" && n.props?.placeholder === "Search leads");
  const before = calls.length;
  box.props.onChange({ target: { value: "lamar" } });
  tree = draw();
  assert.deepEqual(names(tree), ["Lamar Strength Co."]);
  box.props.onChange({ target: { value: "78704" } });
  tree = draw();
  assert.deepEqual(names(tree).length, 5, "the area they are all in");
  box.props.onChange({ target: { value: "gigafit" } });
  tree = draw();
  assert.deepEqual(names(tree), ["GigaFit Austin"]);
  assert.equal(calls.length, before, "nothing was asked of the server: words to chips is release C");
});

/* ------------------------------------ the keys ------------------------------------ */

const cursorRow = (tree) => find(tree, (n) => n.type === "tr" && /\bfocused\b/.test(n.props?.className || ""))?.props.id ?? null;

test("the keys: J and K move, Enter peeks, x selects, C calls, F finds; one listener before and after the scope draws", () => {
  fresh();
  draw();
  assert.equal(listeners.keydown?.size, 1, "one listener for the page's life");
  const [only] = listeners.keydown;
  draw();
  draw();
  assert.equal(listeners.keydown.size, 1);
  assert.ok(listeners.keydown.has(only), "a draw does not put a new listener in its place");
  press("j");
  assert.equal(cursorRow(draw()), "lead-l1");
  press("j");
  assert.equal(cursorRow(draw()), "lead-l2");
  press("k");
  assert.equal(cursorRow(draw()), "lead-l1");
  assert.equal(press("x"), true);
  assert.match(textOf(byTestId(draw(), "leads-bulk-bar")), /1 selected/, "x selects the lead under the cursor");
  assert.equal(press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null }), true);
  assert.ok(byTestId(draw(), "leads-bulk-bar"), "the selection is still there");
  assert.equal(peeks.at(-1).vm.id, "l1", "Enter peeks the lead under the cursor, and never opens a profile");
  assert.deepEqual(opened, []);
  assert.equal(press("c"), true);
  assert.equal(globalThis.window.location.href, "tel:+15125550101", "C dials the lead under the cursor from the owner's own phone");
  assert.equal(press("f"), true);
  assert.equal(draw() && finders.at(-1).open, true, "F opens the finder");
});

test("Esc closes the peek, then the finder, then the Columns menu, then the selection -- one press each, in that order", () => {
  fresh();
  byTestId(draw(), "select-all").props.onChange();
  draw();
  press("j");
  draw();
  press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null });
  draw();
  press("f");
  draw();
  click(byTestId(draw(), "people-columns"));
  // Everything the page can have open at once, opened: the peek, the finder, the Columns menu and a selection.
  let tree = draw();
  const drawn = { peeks: peeks.length, finders: finders.length };
  assert.ok(byTestId(tree, "people-columns-menu"), "the menu is open");
  assert.equal(peeks.at(-1).vm.id, "l1", "so is the peek");
  assert.equal(finders.at(-1).open, true, "and the finder");
  assert.equal(press("j"), false, "the finder holds every key while it is open");
  assert.equal(press("Escape"), true);
  tree = draw();
  assert.equal(peeks.length, drawn.peeks, "the peek went first: it is not drawn any more");
  assert.equal(finders.length, drawn.finders + 1, "and the finder is still open");
  assert.equal(press("Escape"), true);
  tree = draw();
  assert.equal(finders.length, drawn.finders + 1, "the finder went second");
  assert.ok(byTestId(tree, "people-columns-menu"), "the Columns menu is still open");
  assert.equal(press("Escape"), true);
  tree = draw();
  assert.equal(byTestId(tree, "people-columns-menu"), null, "the Columns menu went third");
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /5 selected/, "and the selection is still there");
  assert.equal(press("Escape"), true);
  assert.equal(byTestId(draw(), "leads-bulk-bar"), null, "the selection goes last");
});

test("the peek is the page's own overlay: J and K keep walking the rows behind it, and a menu over the page still silences them", () => {
  fresh();
  draw();
  press("j");
  draw();
  press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null });
  draw();
  // The peek is a dialog with .pl-peek, which PL_OVERLAY leaves out.
  overlayOpen = { role: "dialog", className: "pl-peek" };
  assert.equal(press("j"), true, "the rows walk on under the peek");
  assert.equal(cursorRow(draw()), "lead-l2");
  draw();
  assert.equal(peeks.at(-1).vm.id, "l2", "and the peek follows the cursor while it is just showing the lead");
  // A question or a draft holds it on its own lead (leadPeekFollows, Task 12).
  peeks.at(-1).onArmed({ kind: "call", leadId: "l2", asked: true });
  draw();
  press("j");
  draw();
  assert.equal(peeks.at(-1).vm.id, "l2", "the peek asked something, so it stays on the lead it asked about");
  assert.equal(press("Escape"), true);
  draw();
  assert.equal(peeks.at(-1).armed, null, "and Esc backs out the question first, not the peek");
  overlayOpen = { role: "menu" };
  assert.equal(press("j"), false, "anything else open over the page has the keys");
});

/* ------------------------------------ the bulk bar ------------------------------------ */

test("the bulk bar acts on the leads loaded and selected; Select all N that match hands the view to the server", async () => {
  fresh();
  byTestId(draw(), "select-all").props.onChange();
  let tree = draw();
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /5 selected/);
  click(byTestId(tree, "leads-bulk-contacted"));
  await settle();
  assert.deepEqual(calls.at(-1), ["bulk", { by: "ids", action: "contacted", ids: ["l1", "l2", "l3", "l4", "l5"] }]);
  assert.equal(textOf(flashes.at(-1).msg), "Marked contacted.");
  await flashes.at(-1).undo();
  assert.deepEqual(calls.at(-1), ["undo", { op: "op-b", version: 7 }], "one operation for the lot, undone as one");
  click(byTestId(draw(), "leads-select-matching"));
  tree = draw();
  assert.match(textOf(byTestId(tree, "leads-bulk-bar")), /322 selected/, "every lead the view matches, not every id");
  click(byTestId(tree, "leads-bulk-not-a-fit"));
  await settle();
  assert.deepEqual(calls.at(-1), ["bulk", { by: "view", action: "not_a_fit", view: { list: "all", sort: "fit", dir: "asc" } }], "the view's filters go to the server, never 1,240 ids");
  click(byTestId(draw(), "leads-bulk-copy"));
  assert.equal(textOf(flashes.at(-1).msg), "Copied 3 emails; 2 had none you can use", "what was copied, and what could not be");
});

/* ------------------------------------ the words ------------------------------------ */

test("no word the Leads scope says names the vendor, and no number on it is a dollar amount", () => {
  fresh();
  const said = [];
  for (const route of ["leads", `leads:s-${SEARCH_A}`, `leads:s-${SEARCH_A}:c-excluded`, "leads:l-ready"]) {
    cells = [];
    walk(draw({ leadsRoute: route }), (n) => {
      for (const kid of n.props?.children ?? []) if (typeof kid === "string") said.push(kid);
      for (const key of ["title", "aria-label", "placeholder", "aria-description", "data-tip"]) if (typeof n.props?.[key] === "string") said.push(n.props[key]);
    });
    for (const m of menus) for (const i of m.items) said.push(i.header || "", i.label || "", i.meta || "");
  }
  const bad = said.filter((s) => /apify|compass|bounceverify|\$\d/i.test(s));
  assert.deepEqual(bad, [], "the owner sees Claude finding businesses, and one unit: leads");
});
```

- [ ] **Step 2: Run it and see it fail.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-honest.test.mjs` → the file will not even load: `Cannot find module '…/apps/dashboard/src/legacy/pages/leads-scope.jsx'`.

- [ ] **Step 3: Two more names on the courier.** In `apps/dashboard/src/legacy-bridge/leads.ts` (Task 3), the import list gains `parseLeadsRoute`, `leadRail` and `leadsStanding` (already imported: `leadsRoute`, `parseLeadsRoute`, `toLeadRowVM`; add the two view models), and `installLeadsCourier` gains three lines.

old (`legacy-bridge/leads.ts`, Task 3's `installLeadsCourier`):
```ts
  window.__leadsRouteOf = leadsRoute;
```
new:
```ts
  window.__leadsRouteOf = leadsRoute;
  // The page's view IS the address (clients/leads:s-…:l-…:c-…), so it reads the address with the same parser
  // the surface keys its reads by, and draws the rail and the standing line from the words contracts holds.
  window.__leadsRouteParse = parseLeadsRoute;
  window.__leadRail = leadRail;
  window.__leadsStanding = leadsStanding;
```
and the `declare global` block gains, beside `__leadsRouteOf?: typeof leadsRoute;`:
```ts
    __leadsRouteParse?: typeof parseLeadsRoute;
    __leadRail?: typeof leadRail;
    __leadsStanding?: typeof leadsStanding;
```

- [ ] **Step 4: `leads-scope.jsx`.** The new legacy file. `LeadRowActions`'s Keep, Exclude and Put back are Task 11's; the rail row's menu, its rename box and its Confirm are Task 16's; `LeadClassTabs` and `LeadExcludedChips` are Task 11's. Everything below is this task's.

```jsx
// apps/dashboard/src/legacy/pages/leads-scope.jsx
/* global React, Icon, MoreMenu, Confirm, EmptyState, FailedRead, PeopleRail, PeopleStanding, PeopleTable,
   PeopleColumnsMenu, plSortKeys, plDrawnColumns, plColumnOptions, PL_NO_SEL, LeadFinder, LeadStrip, LeadPeek,
   LeadsFirstDay */
// The Leads scope of People: the rail's lead rows and its kept searches, the standing line, the controls, the
// table drawn with LEAD_COLUMNS, the bulk bar, and the three classes (Qualified · Needs review · Excluded).
//
// Hookless, every one of them: the page's one stub-React call order is ClientsAReal's, and this file's components
// are drawn inside it (people-honest's harness keys hooks by call order). Every piece of state here is the page's
// and arrives as a prop; every act goes out through the courier the bridge installed (legacy-bridge/leads.ts).
//
// Nothing here names the vendor: the owner sees Claude finding businesses, and where each fact came from.

/* ------------------------------------------------------------------ the row */

// Call and Copy on every row, on hover and on the keyboard's cursor. Keep, Exclude and Put back join them in
// Task 11 (Qualified, Needs review and Excluded).
const LeadRowActions = ({ l, onCall, onCopy }) => (
  <span className="cl-row-actions ld-row-actions">
    {l.phone && !l.phoneWrong && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onCall(l.id); }} title="Call from your phone" aria-label={`Call ${l.name}`} data-testid="lead-call"><Icon name="phone" size={11} /></button>}
    {l.email && l.emailState !== "invalid" && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onCopy(l.id); }} title="Copy the email" aria-label={`Copy ${l.name}'s email`} data-testid="lead-copy"><Icon name="copy" size={11} /></button>}
  </span>
);

// The shape beside an email's address, so its state is not colour alone (§6.7): a check for a mailbox that
// answered, a dashed ring for one that cannot be told apart from any other (catch_all: "Unconfirmed", S12), a
// question for a server that would not answer, a cross for one that bounces, a turning ring while it is checked,
// and nothing at all when there is no address.
//
// It is drawn, not named: `icons.jsx` has no `help`, `xcircle`, `spin` or `minus`, and an unknown name renders a
// plain circle (`icons.jsx:73`), which would say the same thing about five different states. Five inline paths in
// one component instead of five names that do not exist.
//
// **This is the one LeadShape in the release.** Task 12's peek draws the same component from `window` (its email
// line is `<LeadShape state={vm.reach.email.state} />`) and declares no second one: `leads-peek.jsx` loads after
// `leads-scope.jsx`, so a second declaration would silently take this one's place.
const LD_SHAPE_CHECK = "M3.5 8.5l3 3 6-6.5";
const LeadShape = ({ state, word, size = 13 }) => {
  const p = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
  const wrap = (kids, extra) => <span className={`ld-shape ld-shape-${state}${extra ? ` ${extra}` : ""}`} title={word || undefined}><svg {...p}>{kids}</svg></span>;
  if (state === "ok") return wrap(<path d={LD_SHAPE_CHECK} />);
  if (state === "catch_all") return wrap(<circle cx="8" cy="8" r="5.5" strokeDasharray="2.5 2.5" />);
  if (state === "unknown") return wrap(<><path d="M6 6.2a2 2 0 113 1.8v1" /><circle cx="8" cy="11.6" r="0.8" fill="currentColor" stroke="none" /></>);
  if (state === "invalid") return wrap(<><circle cx="8" cy="8" r="5.5" /><path d="M5.5 10.5l5-5" /></>);
  if (state === "checking") return wrap(<circle cx="8" cy="8" r="5.5" strokeDasharray="17 17" />, "spin");
  return null;
};

// The identity cell: the mark, the name (which peeks), a second location said, and the kind and the area.
const ldBusinessCell = (l, x) => (
  <td key="business" className="cl-name-cell pl-pin ld-biz-cell">
    <div className="cl-row-name">
      <span className="ld-mark" aria-hidden="true">{l.mark}</span>
      <div className="cl-row-name-block">
        <div className="cl-row-fullname">
          <button type="button" className="ld-biz-name" onClick={(e) => { e.stopPropagation(); x.onOpen(l.id); }} data-testid="lead-name">{l.name}</button>
          {l.places > 1 && <span className="ld-badge" title="Two listings on the map for one business">{l.places} locations</span>}
        </div>
        <div className="cl-row-meta"><span>{l.category}</span><span className="dot" /><span>{l.area}</span></div>
      </div>
      <LeadRowActions l={l} onCall={x.onCall} onCopy={x.onCopy} onKeep={x.onKeep} onExclude={x.onExclude} onPutBack={x.onPutBack} canFind={x.canFind} />
    </div>
  </td>
);

// PRD §6.2's Leads columns, in the shape the table takes (people-table.jsx): { key, label, sortable, pinned,
// fixed, on, needs, cell(l, x) }. The six that sort are the six `leads_page` takes (Task 4).
const LEAD_COLUMNS = [
  { key: "business", label: "Business", sortable: true, pinned: true, cell: ldBusinessCell },
  { key: "fit", label: "Fit", sortable: true, cell: (l) => <td key="fit" className={`shrink ld-fit-cell ${l.cls}`} title={l.fitTitle} data-testid="lead-fit">{l.fitLabel}</td> },
  { key: "email", label: "Email", sortable: false, cell: (l) => <td key="email" className="shrink ld-email-cell" title={l.emailWord} data-testid="lead-email">{l.cls === "excluded" ? <span className="dim">Not checked</span> : <><LeadShape state={l.emailState} word={l.emailWord} />{l.emailLabel}</>}</td> },
  { key: "phone", label: "Phone", sortable: false, cell: (l) => <td key="phone" className={`shrink ld-phone-cell ${l.phoneWrong ? "wrong" : ""}`} data-testid="lead-phone">{l.phone}{l.phoneAgrees && <span className="ld-tick2" title="Maps and their website agree">✓✓</span>}</td> },
  { key: "why", label: "Why it fits", sortable: false, cell: (l) => <td key="why" className="dim ld-why-cell" title={l.why}>{l.why}</td> },
  { key: "rating", label: "Rating", sortable: true, cell: (l) => <td key="rating" className="shrink ld-rating-cell">{l.rating}</td> },
  { key: "stage", label: "Stage", sortable: true, cell: (l) => <td key="stage" className="shrink ld-stage-cell" data-testid="lead-stage">{l.cls !== "excluded" && <><span className={`ld-dot ${l.stage}`} aria-hidden="true" />{l.stageLabel}</>}</td> },
  { key: "found", label: "Found", sortable: true, cell: (l) => <td key="found" className="shrink dim ld-found-cell" title={l.foundAt}>{l.foundLabel}</td> },
  { key: "distance", label: "Distance", sortable: true, needs: (x) => x.hasCenter, on: (x) => x.hasCenter, cell: (l) => <td key="distance" className="shrink dim ld-distance-cell">{l.distance}</td> },
  { key: "source", label: "Source", sortable: false, on: false, cell: (l) => <td key="source" className="shrink dim ld-source-cell">{l.source}</td> },
  { key: "website", label: "Website", sortable: false, on: false, cell: (l) => <td key="website" className="shrink dim ld-website-cell">{l.host}</td> },
  { key: "search", label: "Search", sortable: false, on: false, cell: (l) => <td key="search" className="shrink dim ld-search-cell">{l.searchName}</td> },
  { key: "actions", label: "", sortable: false, fixed: true, cell: () => <td key="actions" className="shrink cl-actions-cell" /> },
];
// business, fit, rating, stage, found, distance: what a saved Leads view may sort by.
const LEAD_SORT_KEYS = plSortKeys(LEAD_COLUMNS);

/* ------------------------------------------------------- the rail's searches */

// The rail under Leads: the lists, then the searches, each with its count, a live dot while it runs and a "?" in
// the accent while it waits on the owner. The search's own menu is Task 16's.
const LeadsRailRows = ({ rail, list, searchId, canFind, onPickList, onPickSearch, onNew }) => (
  <>
    <div className="cl-rail-section" data-testid="leads-lists">
      <div className="cl-rail-group-label">Leads</div>
      {rail.lists.map((l) => (
        <button key={l.id} type="button" className={`cl-rail-row ${list === l.id && !searchId ? "active" : ""}`} onClick={() => onPickList(l.id)} data-testid={`leads-list-${l.id}`}>
          <span className="label">{l.label}</span>
          <span className="count">{l.count}</span>
        </button>
      ))}
    </div>
    <div className="cl-rail-section" data-testid="leads-searches">
      <div className="cl-rail-group-label">Searches</div>
      {rail.searches.map((s) => (
        <div key={s.id} className={`cl-rail-row ld-search-row ${searchId === s.id ? "active" : ""}`}>
          <button type="button" className="ld-search-pick" onClick={() => onPickSearch(s.id)} data-testid={`leads-search-${s.id}`}>
            {s.mark === "live" && <span className="live-dot" aria-hidden="true" />}
            {s.mark === "question" && <span className="rail-q" title="This search needs you">?</span>}
            <span className="label">{s.name}</span>
            <span className="count">{s.count}</span>
          </button>
        </div>
      ))}
      {rail.searches.length === 0 && <div className="cl-rail-hint">No searches yet. Describe the businesses you want and Claude finds them.</div>}
    </div>
    <div className="cl-rail-foot">
      <button type="button" className="cl-rail-newseg" onClick={onNew} data-testid="leads-new-search" {...(canFind ? {} : window.gate("find", "find leads"))}>
        <Icon name="plus" size={11} /> New search
      </button>
    </div>
  </>
);

/* --------------------------------------------------------------- the bulk bar */

// What a selection of leads can become (§6.4, S13): their emails on the clipboard, all contacted, all not a fit,
// a file. Each acts on the rows shown AND selected; the header box's "Select all N that match" hands the view's
// filters to the server instead of a list of ids, so a view of 1,240 does not become 1,240 ids in a request.
const LeadsBulkBar = ({ sel, rows, total, view, canFind, canExport, busy, whyNot, onClear, onSelectAllMatching, allMatching, onCopyEmails, onContacted, onNotAFit, exportHref }) => {
  const picked = rows.filter((l) => sel.has(l.id));
  const ids = picked.map((l) => l.id);
  const count = allMatching ? total : ids.length;
  return (
    <div className="cl-bulk ld-bulk" role="toolbar" aria-label="Selected leads" data-testid="leads-bulk-bar">
      <span className="cl-bulk-count"><b>{count}</b> selected</span>
      {!allMatching && total > rows.length && (
        <button type="button" className="cl-bucket-link" onClick={onSelectAllMatching} data-testid="leads-select-matching">Select all {total.toLocaleString()} that match</button>
      )}
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onCopyEmails(picked)} data-testid="leads-bulk-copy"><Icon name="copy" size={12} /> Copy emails</button>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onContacted(allMatching ? { by: "view", action: "contacted", view } : { by: "ids", action: "contacted", ids })} data-testid="leads-bulk-contacted" {...(canFind ? {} : window.gate("find", "mark these leads contacted"))}><Icon name="check" size={12} /> Mark contacted</button>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onNotAFit(allMatching ? { by: "view", action: "not_a_fit", view } : { by: "ids", action: "not_a_fit", ids })} data-testid="leads-bulk-not-a-fit" {...(canFind ? {} : window.gate("find", "mark these leads not a fit"))}><Icon name="ban" size={12} /> Not a fit</button>
      {canExport
        ? <a className="btn btn-sm" href={exportHref} download title="Download these leads as a CSV file" data-testid="leads-bulk-export"><Icon name="external" size={12} /> Export</a>
        : <button type="button" className="btn btn-sm" {...window.gate("export", "export these leads")} data-testid="leads-bulk-export"><Icon name="external" size={12} /> Export</button>}
      {whyNot && <span className="cl-prof-aut-hint">{whyNot}</span>}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} data-testid="leads-bulk-clear"><Icon name="x" size={11} /> Clear</button>
    </div>
  );
};

/* ------------------------------------------------------------ the scope itself */

const LeadsScope = (p) => {
  const L = p.surface;
  const rail = p.rail;
  const standing = p.standing;
  const search = p.search;
  return (
    <div className="clients leads-scope">
      <PeopleRail scope="leads" onScope={p.onScope}>
        <LeadsRailRows
          rail={rail}
          list={p.view.list}
          searchId={p.view.searchId}
          canFind={p.canFind}
          onPickList={p.onPickList}
          onPickSearch={p.onPickSearch}
          onNew={p.onFind}
        />
      </PeopleRail>

      <div className="cl-main">
        <div className="cl-main-scroll pl-main" ref={p.scrollRef}>
          <PeopleStanding scope="leads" leads={standing} onNeeds={p.onNeedsYou} onScope={p.onScope} />

          <div className="cl-controls">
            <div className="cl-search-wrap">
              <Icon name="search" size={13} />
              <input ref={p.searchRef} placeholder="Search leads" aria-label="Search leads" value={p.q} onChange={(e) => p.onQ(e.target.value)} />
              <span className="kbd">/</span>
            </div>
            <div className="cl-controls-right">
              <PeopleColumnsMenu open={p.colsOpen} onOpenChange={p.onColsOpen} options={p.colOptions} onPick={p.onPickColumn} buttonRef={p.colsButton} />
              {p.canExport
                ? <a className="btn btn-ghost btn-sm" href={p.exportHref} download title="Download these leads as a CSV file" data-testid="leads-export"><Icon name="external" size={12} /> Export</a>
                : <button type="button" className="btn btn-ghost btn-sm" {...window.gate("export", "export these leads")} data-testid="leads-export"><Icon name="external" size={12} /> Export</button>}
              <button type="button" className="btn btn-primary btn-sm" onClick={p.onFind} data-testid="leads-find" {...(p.canFind ? {} : window.gate("find", "find leads"))}>
                <Icon name="sparkle" size={12} /> Find leads <span className="kbd">F</span>
              </button>
            </div>
          </div>

          {p.finderOpen && (
            <LeadFinder
              open
              stage={p.finderStage}
              words={p.finderWords}
              proposal={p.finderProposal}
              refusal={p.finderRefusal}
              busy={p.finderBusy}
              suggestions={L.suggestions}
              talk={p.talk}
              onWords={p.onFinderWords}
              onPlan={p.onFinderPlan}
              onApprove={p.onFinderApprove}
              onBack={p.onFinderBack}
              onClose={p.onCloseFinder}
            />
          )}

          {search && <LeadStrip vm={p.strip} onAction={p.onStripAction} />}

          {L.readFailed
            ? <FailedRead kind="block" what="your leads" surface="leads" testid="leads-failed" />
            : (
              <PeopleTable
                noun="lead"
                columns={p.columns}
                ctx={p.cellCtx}
                rows={p.rows}
                total={p.total}
                sortBy={p.sortBy}
                sortDir={p.sortDir}
                onSort={p.onSort}
                onOpen={p.onPeek}
                filtered={p.filtered}
                onClearFilters={p.onClearFilters}
                selectable={p.canFind || p.canExport}
                sel={p.sel}
                onToggle={p.onToggle}
                onToggleAll={p.onToggleAll}
                cursor={p.cursor}
                onCursor={p.onCursor}
                scrolled={p.scrolled}
                onScrolled={p.onScrolled}
                empty={p.empty}
              />
            )}
          {L.next && (
            <div className="cl-section-sub" style={{ padding: "8px 0 16px" }} data-testid="leads-more">
              {p.rows.length.toLocaleString()} of {p.total.toLocaleString()} loaded{" "}
              <button type="button" className="btn btn-ghost btn-sm" disabled={p.loadingMore} onClick={p.onMore} data-testid="leads-more-btn">{p.loadingMore ? "Loading…" : "Show more"}</button>
            </div>
          )}
        </div>
        {p.sel.size > 0 && p.rows.some((l) => p.sel.has(l.id)) && (
          <LeadsBulkBar
            sel={p.sel}
            rows={p.rows}
            total={p.total}
            view={p.bulkView}
            canFind={p.canFind}
            canExport={p.canExport}
            busy={p.bulkBusy}
            whyNot={p.canFind ? null : "Only an owner can change leads."}
            allMatching={p.allMatching}
            onSelectAllMatching={p.onSelectAllMatching}
            onClear={p.onClearSel}
            onCopyEmails={p.onCopyEmails}
            onContacted={p.onBulk}
            onNotAFit={p.onBulk}
            exportHref={p.exportHref}
          />
        )}
        {/* The peek (Task 12): the page's state and its setters, so its own acts (LeadPeekActions) are built
            from them on every draw and nothing in leads-peek.jsx keeps state of its own. */}
        {p.peek && <LeadPeek vm={p.peek} mode={p.peekMode} armed={p.armed} draft={p.draft} busy={p.bulkBusy} flash={p.flash} onClose={p.onClosePeek} onMode={p.onPeekMode} onArmed={p.onArmed} onDraftState={p.onDraftState} onPeekId={p.onPeekId} onOpenPerson={p.onOpenPerson} onCall={p.onCall} onKeep={p.onKeep} onExclude={p.onExclude} onPutBack={p.onPutBack} onCopy={p.onCopy} />}
        {p.firstDay && <LeadsFirstDay suggestions={L.suggestions} onPick={p.onFinderWords} onFind={p.onFind} onBusinessLine={p.onBusinessLine} />}
        {p.toastNode}
      </div>
    </div>
  );
};

Object.assign(window, { LeadsScope, LeadsBulkBar, LeadRowActions, LeadShape, LeadsRailRows, LEAD_COLUMNS, LEAD_SORT_KEYS });
```

- [ ] **Step 5: the page, edit by edit.** Every anchor below occurs exactly once in `clients-a.jsx` after Task 1's lift.

**5a. The `/* global */` head names the two window names this scope reads** (Task 1 put the table's nine there).

old:
```
   plColumnChoices, plColumnOptions, PL_NO_SEL */
```
new:
```
   plColumnChoices, plColumnOptions, PL_NO_SEL, LEAD_COLUMNS, LeadsScope, leadPeekEscape, leadPeekFollows */
```

**5b. The view is remembered per scope.**

old:
```jsx
// What the page remembers between visits on this device: the sort and the columns ({ sortBy, sortDir, columns }).
const PL_VIEW_KEY = "chanlytics-people-view";
const plLoadView = () => {
  try { return { ...JSON.parse(localStorage.getItem(PL_VIEW_KEY) || "{}") }; } catch { return {}; }
};
const plSaveView = (v) => { try { localStorage.setItem(PL_VIEW_KEY, JSON.stringify(v)); } catch { /* private mode */ } };
```
new:
```jsx
// What the page remembers between visits on this device, per scope: the sort and the columns
// ({ sortBy, sortDir, columns }), and under Leads the rail's list too ({ list, sortBy, sortDir, columns }).
const PL_VIEW_KEYS = { people: "chanlytics-people-view", leads: "chanlytics-leads-view" };
const plLoadView = (scope) => {
  try { return { ...JSON.parse(localStorage.getItem(PL_VIEW_KEYS[scope] || PL_VIEW_KEYS.people) || "{}") }; } catch { return {}; }
};
const plSaveView = (scope, v) => { try { localStorage.setItem(PL_VIEW_KEYS[scope] || PL_VIEW_KEYS.people, JSON.stringify(v)); } catch { /* private mode */ } };
```

**5c. The saver takes the page it saves** — three edits in `plViewSaver`.

old: `const plViewSaver = () => {`
new: `const plViewSaver = (page) => {`

old: `    window.__saveView("people", view).then(landed, (e) => landed({ ok: false, message: e && e.message }));`
new: `    window.__saveView(page, view).then(landed, (e) => landed({ ok: false, message: e && e.message }));`

old: `      else if (!(r && r.ok)) console.error("people_view_not_saved", r && r.message);`
new: `      else if (!(r && r.ok)) console.error("people_view_not_saved", page, r && r.message);`

**5d. The owner's own clipboard and phone**, beside the download People already has.

old:
```jsx
const plDownload = (name, text) => {
```
new:
```jsx
// The owner's own clipboard and the owner's own phone: a lead is emailed from their inbox and called from their
// handset, and nothing is sent from here (PRD 0.4).
const plCopy = (text) => { try { if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(text); } catch { /* a browser that will not */ } };
const plDial = (tel) => { window.location.href = `tel:${tel}`; };
const plDownload = (name, text) => {
```

**5e. The two surfaces, and what a scope has before its own lands.**

old:
```jsx
const usePeople = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:clients", bump);
    return () => window.removeEventListener("surface:clients", bump);
  }, []);
  return window.__PEOPLE;
};
```
new:
```jsx
// What a scope has before its surface lands. People's route waits for People and Leads' for Leads
// (surface-registry routeSurfaceFor), so the other scope's surface may not be read yet: the rail's switch is
// drawn in both, and neither may throw for want of the one it is not showing.
const PL_NO_PEOPLE = { rows: [], lists: PL_NO_LISTS, saved: PL_NO_LISTS, aggregates: { total: 0, needsYou: 0, reachedWeek: 0 }, views: {}, attention: {}, savedRead: true };
const PL_NO_LEADS = {
  searches: [], counts: { all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 }, rows: [], next: null,
  offered: 0, view: { searchId: null, list: "all", cls: null, chips: {}, sort: "fit", dir: "asc" },
  route: "clients/leads", suggestions: null, tz: "UTC", readFailed: false, fetchedAt: 0,
};

const usePeople = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:clients", bump);
    return () => window.removeEventListener("surface:clients", bump);
  }, []);
  return window.__PEOPLE || PL_NO_PEOPLE;
};

// The Leads surface (legacy-bridge/leads.ts): the searches, the counts, the rows of one view, how many a refresh
// found and is holding back, and the first day's suggestions. Its own event, so a People refresh does not
// re-render Leads and the other way round.
const useLeads = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:leads", bump);
    return () => window.removeEventListener("surface:leads", bump);
  }, []);
  return window.__LEADS || PL_NO_LEADS;
};
```

**5f. The rail's switch.**

old:
```jsx
const PeopleRail = ({ lists, groups = PL_DEFAULT_GROUPS, active, onPick, saved = [], savedRead = true, activeSaved = null, onPickSaved = () => {}, canEdit = false, onCreateList = null, newListSignal = 0 }) => (
  <aside className="cl-rail">
    <div className="cl-rail-section">
```
new:
```jsx
// People | Leads: the one switch between this page's two scopes (PRD 6.1). A tablist, because they are two views
// of one page, not two pages; on a phone the switch is the slim bar's (Task 18).
const PeopleScopeTabs = ({ scope, onScope }) => (
  <div className="pt-scope" role="tablist" aria-label="Which people" data-testid="people-scope">
    <button type="button" role="tab" aria-selected={scope === "people"} className={scope === "people" ? "on" : ""} onClick={() => onScope("people")} data-testid="scope-people">People</button>
    <button type="button" role="tab" aria-selected={scope === "leads"} className={scope === "leads" ? "on" : ""} onClick={() => onScope("leads")} data-testid="scope-leads">Leads</button>
  </div>
);

// The rail. The switch heads it in both scopes; under Leads the rows below it are the Leads scope's own
// (LeadsRailRows, leads-scope.jsx), so the smart lists and the lists kept by hand are People's alone.
const PeopleRail = ({ scope = "people", onScope = () => {}, children = null, lists = PL_NO_LISTS, groups = PL_DEFAULT_GROUPS, active, onPick, saved = [], savedRead = true, activeSaved = null, onPickSaved = () => {}, canEdit = false, onCreateList = null, newListSignal = 0 }) => (
  <aside className="cl-rail">
    <PeopleScopeTabs scope={scope} onScope={onScope} />
    {scope === "leads" ? children : (
    <>
    <div className="cl-rail-section">
```

and its close:

old:
```jsx
    {canEdit && onCreateList && <NewListRow onCreate={onCreateList} openSignal={newListSignal} />}
  </aside>
);
```
new:
```jsx
    {canEdit && onCreateList && <NewListRow onCreate={onCreateList} openSignal={newListSignal} />}
    </>
    )}
  </aside>
);
```

**5g. The standing line speaks for the scope.**

old:
```jsx
const PeopleStanding = ({ agg, needsShown, onNeeds, onLists = null, listWord = null }) => (
  <div className="pl-standing" data-testid="people-standing">
```
new:
```jsx
// Under Leads the line is leadsStanding's (contracts leads.ts, Task 4.6): "322 leads · 272 ready · 3 searches",
// and "1 search needs you" is the tap that opens the search waiting on an answer.
const PeopleStanding = ({ scope = "people", leads = null, agg = null, needsShown = false, onNeeds, onLists = null, listWord = null }) => (
  scope === "leads" ? (
    <div className="pl-standing" data-testid="leads-standing">
      <span className="pl-standing-total">{leads.total}</span>
      {leads.parts.map((part) => (
        <span key={part} className="pl-standing-part">
          <span className="pl-standing-dot" aria-hidden="true">·</span>
          <span className="pl-standing-reached">{part}</span>
        </span>
      ))}
      {leads.needsYou && (
        <span className="pl-standing-part">
          <span className="pl-standing-dot" aria-hidden="true">·</span>
          <button type="button" className="pl-standing-needs on" onClick={() => onNeeds(leads.needsYou.searchId)} data-testid="leads-standing-needs">
            {leads.needsYou.count} {leads.needsYou.count === 1 ? "search needs" : "searches need"} you
          </button>
        </span>
      )}
    </div>
  ) : (
  <div className="pl-standing" data-testid="people-standing">
```

and its close:

old:
```jsx
        <button type="button" className={`pl-standing-needs ${listWord ? "on" : ""}`} onClick={onLists} data-testid="people-lists-pick">
          {listWord || "Lists"} <Icon name="chevron-down" size={10} />
        </button>
      </span>
    )}
  </div>
);
```
new:
```jsx
        <button type="button" className={`pl-standing-needs ${listWord ? "on" : ""}`} onClick={onLists} data-testid="people-lists-pick">
          {listWord || "Lists"} <Icon name="chevron-down" size={10} />
        </button>
      </span>
    )}
  </div>
  )
);
```

**5h. `PL_OVERLAY` names the page's own overlays.**

old:
```jsx
const PL_OVERLAY = '.app-root [role="menu"]:not(.pl-sheet):not(.pl-cols-menu), .app-root [role="dialog"]:not(.pl-sheet):not(.pl-cols-menu)';
```
new:
```jsx
const PL_OVERLAY = '.app-root [role="menu"]:not(.pl-sheet):not(.pl-cols-menu):not(.pl-peek):not(.pl-finder), .app-root [role="dialog"]:not(.pl-sheet):not(.pl-cols-menu):not(.pl-peek):not(.pl-finder)';
```

**5i. `ClientsAReal` takes the scope and reads both surfaces.**

old:
```jsx
const ClientsAReal = ({ onOpenProfile = () => {}, initialSegment = null, initialSaved = null, initialState = null }) => {
  const people = usePeople();
  const rows = people.rows;
```
new:
```jsx
const ClientsAReal = ({ onOpenProfile = () => {}, initialSegment = null, initialSaved = null, initialState = null, scope = "people", leadsRoute = null, onNavigate = null }) => {
  const people = usePeople();
  // Both surfaces are read in both scopes, and every hook below is declared in both, in one order: the stub React
  // the page's tests draw it on keys hooks by call order (people-honest.test.mjs), so a hook behind an
  // `if (scope === "leads")` would move People's.
  const leads = useLeads();
  const onLeads = scope === "leads";
  const nav = onNavigate || ((to) => window.CHANLY.nav(to));
  const rows = people.rows;
```

**5j. The Leads scope's own state, in one block, declared in both scopes.**

old:
```jsx
  // Whether the table has scrolled sideways, for the hairline beside Person: kept here so the table stays hookless.
  const [scrolledX, setScrolledX] = useState(false);
```
new:
```jsx
  // Whether the table has scrolled sideways, for the hairline beside Person: kept here so the table stays hookless.
  const [scrolledX, setScrolledX] = useState(false);
  // The Leads scope's state. It lives here because every component of that scope is hookless (leads-scope.jsx),
  // and it is declared under People too, where each value is false or null and nothing draws it.
  const [peekId, setPeekId] = useState(null);
  const [finderOpen, setFinderOpen] = useState(false);
  const [finderStage, setFinderStage] = useState("compose");
  const [finderWords, setFinderWords] = useState("");
  const [finderProposal, setFinderProposal] = useState(null);
  const [finderRefusal, setFinderRefusal] = useState(null);
  // The peek's own pane ("info" while it is just showing the lead; "why" and "draft" are Tasks 15 and 13) and
  // the draft it is holding.
  const [peekMode, setPeekMode] = useState("info");
  const [draft, setDraft] = useState(null);
  // "Did you send it?" after a draft, "How did the call go?" after a call:
  // { kind: "sent" | "call", leadId, asked, outcome, note }. `asked` turns true only once the tab is theirs
  // again (leadArmOnReturn, Task 13), so nothing is asked while they are away.
  const [armed, setArmed] = useState(null);
  // One criterion of the Excluded view, from the chips at its head.
  const [chip, setChip] = useState(null);
  // "Select all 1,240 that match": the bulk bar hands the view's filters to the server instead of a list of ids.
  const [allMatching, setAllMatching] = useState(false);
  // The search being renamed, and the one being removed: each asked where the search is, on the rail.
  const [renaming, setRenaming] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [leadBusy, setLeadBusy] = useState(false);
  const [removeError, setRemoveError] = useState(null);
```

**5k. The view: this scope's, from this scope's keys.**

old:
```jsx
  const remembered = React.useMemo(() => ({ ...plLoadView(), ...((people.views && people.views.people) || {}) }), []); // eslint-disable-line react-hooks/exhaustive-deps
```
new:
```jsx
  const remembered = React.useMemo(() => ({ ...plLoadView(scope), ...((people.views && people.views[scope]) || {}) }), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Which search, which list and which class this address names (contracts parseLeadsRoute, through the courier).
  // The address is the one place the Leads view's list lives, so the rail, the table and the saved view agree.
  const leadView = onLeads && window.__leadsRouteParse ? (window.__leadsRouteParse(leadsRoute || "clients/leads") || { searchId: null, list: "all", cls: null, chips: {} }) : null;
  // The columns this scope draws with: People's, or the Leads scope's (LEAD_COLUMNS, leads-scope.jsx).
  const cols = onLeads ? LEAD_COLUMNS : PL_COLUMNS;
```

old:
```jsx
  const [sortBy, setSortBy] = useState(plSortKeys(PL_COLUMNS).includes(remembered.sortBy) ? remembered.sortBy : "last");
  const [sortDir, setSortDir] = useState(remembered.sortDir === "asc" ? "asc" : "desc");
```
new:
```jsx
  const [sortBy, setSortBy] = useState(plSortKeys(cols).includes(remembered.sortBy) ? remembered.sortBy : onLeads ? "fit" : "last");
  const [sortDir, setSortDir] = useState(remembered.sortDir === "asc" || remembered.sortDir === "desc" ? remembered.sortDir : onLeads ? "asc" : "desc");
```

old: `  const [colChoices, setColChoices] = useState(() => plColumnChoices(PL_COLUMNS, remembered.columns));`
new: `  const [colChoices, setColChoices] = useState(() => plColumnChoices(cols, remembered.columns));`

old:
```jsx
  const savedView = React.useRef(JSON.stringify({ sortBy: remembered.sortBy, sortDir: remembered.sortDir, columns: plColumnChoices(PL_COLUMNS, remembered.columns) }));
  // One saver for the page's life, so its saves go one at a time (plViewSaver).
  const viewSaver = React.useRef(null);
  if (!viewSaver.current) viewSaver.current = plViewSaver();
  React.useEffect(() => {
    const view = { sortBy, sortDir, columns: colChoices };
    plSaveView(view);
```
new:
```jsx
  const savedView = React.useRef(JSON.stringify(onLeads
    ? { list: remembered.list || "all", sortBy: remembered.sortBy, sortDir: remembered.sortDir, columns: plColumnChoices(cols, remembered.columns) }
    : { sortBy: remembered.sortBy, sortDir: remembered.sortDir, columns: plColumnChoices(cols, remembered.columns) }));
  // One saver for the page's life, so its saves go one at a time (plViewSaver), and it saves THIS scope's view:
  // People's is views.people, the Leads scope's is views.leads, and the page is remounted when the scope changes.
  const viewSaver = React.useRef(null);
  if (!viewSaver.current) viewSaver.current = plViewSaver(scope);
  React.useEffect(() => {
    const view = onLeads ? { list: leadView.list, sortBy, sortDir, columns: colChoices } : { sortBy, sortDir, columns: colChoices };
    plSaveView(scope, view);
```

old:
```jsx
    savedView.current = key;
    viewSaver.current(view);
  }, [sortBy, sortDir, colChoices]);
```
new:
```jsx
    savedView.current = key;
    viewSaver.current(view);
  }, [sortBy, sortDir, colChoices, leadView && leadView.list]);
  // One read per view (PRD 0.5, the review's E8): the address says which search, list and class, and this
  // member's own view says the sort. Every key goes at once, and the surface drops an answer a newer ask
  // supersedes, so a slow page of the old view never lands on the new one.
  React.useEffect(() => {
    if (!onLeads || !window.__leadsView) return;
    window.__leadsView({ searchId: leadView.searchId, list: leadView.list, cls: leadView.cls, chips: leadView.chips, sort: sortBy, dir: sortDir });
  }, [scope, leadsRoute, sortBy, sortDir]);
```

**5l. The columns this scope draws with.**

old:
```jsx
  const colCtx = { withCalendar };
  const columns = plDrawnColumns(PL_COLUMNS, colChoices, colCtx);
  const colOptions = plColumnOptions(PL_COLUMNS, colChoices, colCtx);
```
new:
```jsx
  const colCtx = onLeads ? { hasCenter: leads.searches.some((s) => s.plan && s.plan.where && s.plan.where.center) } : { withCalendar };
  const columns = plDrawnColumns(cols, colChoices, colCtx);
  const colOptions = plColumnOptions(cols, colChoices, colCtx);
```

old: `    const c = PL_COLUMNS.find((x) => x.key === key);`
new: `    const c = cols.find((x) => x.key === key);`

**5m. The rows this scope shows, and the cursor that walks them.**

old:
```jsx
  const filtered = tab !== "all" || !!listId || !!savedId || !!q.trim();
  React.useEffect(() => { setSel(new Set()); }, [tab, listId, savedId, q]);
  const shownIds = shown.map((p) => p.id);
```
new:
```jsx
  // The leads loaded, filtered at once by the box (their name, their kind and their area) and by one criterion
  // of the Excluded view. A sentence is not sent anywhere: words to chips is release C.
  const leadShown = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = leads.rows;
    if (chip) list = list.filter((l) => l.excludedBy === chip);
    if (!needle) return list;
    return list.filter((l) => l.name.toLowerCase().includes(needle) || (l.category || "").toLowerCase().includes(needle) || (l.area || "").toLowerCase().includes(needle));
  }, [leads.rows, q, chip]);
  // What this scope shows, for the table, the keyboard's cursor and the bulk bar: one list, whichever scope.
  const rowsShown = onLeads ? leadShown : shown;
  const filtered = onLeads ? !!q.trim() || !!chip || !!leadView.cls || leadView.list !== "all" : tab !== "all" || !!listId || !!savedId || !!q.trim();
  React.useEffect(() => { setSel(new Set()); setAllMatching(false); }, [tab, listId, savedId, q, leadsRoute, chip]);
  const shownIds = rowsShown.map((r) => r.id);
```

old:
```jsx
  const toggleAll = () => setSel((s) => (shownIds.length && shownIds.every((id) => s.has(id)) ? new Set() : new Set(shownIds)));
```
new:
```jsx
  const toggleAll = () => { setAllMatching(false); setSel((s) => (shownIds.length && shownIds.every((id) => s.has(id)) ? new Set() : new Set(shownIds))); };
```

**5n-0. The peek follows the cursor**, above the one listener.

old:
```jsx
  // One listener for the page's life, reading what the latest render left in `keys`: the Calendar's pattern. It was
  // taken down and added again on every render, and / had a second listener of its own.
```
new:
```jsx
  // The peek follows the row cursor while it is open, so J and K walk the leads behind it -- unless it is asking
  // a question or holding a draft, which keeps it on its own lead (leadPeekFollows, leads-peek.jsx, Task 12).
  React.useEffect(() => {
    if (!onLeads || !peekId || !cursor || cursor === peekId || !leadPeekFollows(peekMode, armed)) return;
    setPeekId(cursor);
  }, [cursor]); // eslint-disable-line react-hooks/exhaustive-deps
  // One listener for the page's life, reading what the latest render left in `keys`: the Calendar's pattern. It was
  // taken down and added again on every render, and / had a second listener of its own.
```

**5n. The scope's acts, before `keys.current` reads them.** Keep, Exclude and Put back are Task 11's; rename, remove, Find new ones and Search again are Task 16's; this task writes the block, the gate, the two that the keyboard needs (`callLead`, `copyLead`) and bulk.

old:
```jsx
  // What the keyboard's one listener reads: this render's rows, cursor and doors.
  keys.current = {
```
new:
```jsx
  /* ---------------------------------------------------- the Leads scope's acts */
  // Every one goes through the courier the bridge installed (legacy-bridge/leads.ts): the route, then the
  // surface patched in place. A toast says what happened and offers Undo through the operation the door
  // answered, which is the only thing an undo names (the review's E9).
  const canFind = onLeads && (!window.canDo || window.canDo("find"));
  const leadById = (id) => leads.rows.find((l) => l.id === id) || null;
  const searchById = (id) => leads.searches.find((s) => s.id === id) || null;
  const leadUndo = (r) => (r.data && r.data.op_id
    ? { undo: async () => { const u = await window.__leadUndo(r.data.op_id, r.data.version); if (!u.ok) plFlash(window.refusalToast(u, "Nothing was put back")); } }
    : {});
  const leadAct = async (fn, said) => {
    if (leadBusy) return;
    setLeadBusy(true);
    const r = await fn();
    setLeadBusy(false);
    if (!r.ok) { plFlash(window.refusalToast(r, "That did not go through")); return; }
    plFlash({ msg: said, ...leadUndo(r) });
  };
  const searchOf = (l) => (leadView && leadView.searchId) || (l && l.searchId) || null;
  // The owner's own phone dials; coming back to the tab asks how it went (Task 14).
  const callLead = (id) => {
    const l = leadById(id);
    if (!l || !l.phone) return;
    setArmed({ kind: "call", leadId: id, asked: false });
    plDial(l.phone);
  };
  const copyLead = (id) => {
    const l = leadById(id);
    if (!l || !l.email) return;
    plCopy(l.email);
    plFlash({ msg: <>Copied <b>{l.email}</b></> });
  };
  // Copy emails says how many of the selection had none you can use, because a silent 12-of-15 is a lie.
  const copyEmails = (picked) => {
    const usable = picked.filter((l) => l.email && l.emailState !== "invalid");
    plCopy(usable.map((l) => l.email).join(", "));
    const none = picked.length - usable.length;
    plFlash({ msg: <>Copied {usable.length} email{usable.length === 1 ? "" : "s"}{none ? `; ${none} had none you can use` : ""}</> });
  };
  const bulkLeads = (body) => leadAct(() => window.__leadsBulk(body), body.action === "contacted" ? <>Marked contacted.</> : <>Not a fit.</>);

  // What the keyboard's one listener reads: this render's rows, cursor and doors.
  keys.current = {
```

**5o. The one listener gains its branches** — still one `useEffect(…, [])`, still one `addEventListener`, still reading `keys.current`.

old:
```jsx
      if (!k || e.defaultPrevented || plTyping(from) || e.metaKey || e.ctrlKey || e.altKey) return;
      // The page's own overlays first. The Columns menu: Esc closes it, and the rows hold still behind it. At a phone's
```
new:
```jsx
      if (!k || e.defaultPrevented || plTyping(from) || e.metaKey || e.ctrlKey || e.altKey) return;
      // The page's own overlays first, in the order Esc closes them: the peek, then the finder, then the Columns
      // menu, then the selection. The peek holds only Esc -- J and K keep walking the rows behind it, and the peek
      // follows the cursor -- so it is not in PL_OVERLAY either.
      if (e.key === "Escape" && k.peekOpen) { e.preventDefault(); k.closePeek(); return; }
      // The finder holds every key while it is open: its input, its pickers and its buttons are its own.
      if (k.finderOpen) { if (e.key === "Escape") { e.preventDefault(); k.closeFinder(); } return; }
      // The Columns menu: Esc closes it, and the rows hold still behind it. At a phone's
```

old:
```jsx
      if (e.key === "Escape") {
        if (k.selected) { e.preventDefault(); k.clearSel(); }
        return;
      }
      if (!k.ids.length) return;
```
new:
```jsx
      if (e.key === "Escape") {
        if (k.selected) { e.preventDefault(); k.clearSel(); }
        return;
      }
      // F opens the finder on the Leads scope, for whoever may find; the gate says why to everyone else, at the
      // button, so the key is simply not theirs.
      if ((e.key === "f" || e.key === "F") && k.canFind) { e.preventDefault(); k.find(); return; }
      if (!k.ids.length) return;
```

old:
```jsx
      else if ((e.key === " " || e.key === "x" || e.key === "X") && k.cursor && k.canSelect) { e.preventDefault(); k.toggle(k.cursor); }
    };
```
new:
```jsx
      else if ((e.key === " " || e.key === "x" || e.key === "X") && k.cursor && k.canSelect) { e.preventDefault(); k.toggle(k.cursor); }
      // C calls the lead under the cursor from the owner's own phone, and arms the call question.
      else if ((e.key === "c" || e.key === "C") && k.cursor && k.call) { e.preventDefault(); k.call(k.cursor); }
    };
```

**5p. `keys.current` gains the Leads values**, each false or null under People.

old:
```jsx
    open: onOpenProfile,
    toggle: toggleSel,
    canSelect: canEditLists || canExport,
```
new:
```jsx
    // Enter opens the person under People and peeks the lead under Leads.
    open: onLeads ? setPeekId : onOpenProfile,
    toggle: toggleSel,
    canSelect: onLeads ? canFind || canExport : canEditLists || canExport,
```

old:
```jsx
    closeMenu: () => { setColsOpen(false); if (colsButton.current) colsButton.current.focus(); },
  };
```
new:
```jsx
    closeMenu: () => { setColsOpen(false); if (colsButton.current) colsButton.current.focus(); },
    peekOpen: onLeads && !!peekId,
    // One press backs out one step: the question the peek asked, then the pane it opened, then the peek itself
    // (leadPeekEscape, leads-peek.jsx, Task 12). The order OUT here is the page's: the peek, the finder, the
    // Columns menu, the selection.
    closePeek: () => leadPeekEscape({ mode: peekMode, armed, setMode: setPeekMode, setArmed, setPeekId }),
    finderOpen: onLeads && finderOpen,
    closeFinder: () => setFinderOpen(false),
    canFind,
    find: () => { setFinderRefusal(null); setFinderStage("compose"); setFinderOpen(true); },
    call: onLeads ? callLead : null,
  };
```

**5q. The Leads scope is drawn instead of People's body**, after every hook this component owns.

old:
```jsx
  return (
    <div className="clients">
      <PeopleRail
        lists={lists}
```
new:
```jsx
  // The Leads scope, drawn after every hook this component owns, so the two scopes declare one hook order.
  // Everything it needs is a prop: leads-scope.jsx is hookless from its rail to its bulk bar.
  if (onLeads) {
    const rail = window.__leadRail ? window.__leadRail(leads.counts, leads.searches) : { lists: [], searches: [] };
    const standing = window.__leadsStanding ? window.__leadsStanding(leads.counts, leads.searches) : { total: "", parts: [], needsYou: null };
    const openSearch = searchById(leadView.searchId);
    const cellCtxLeads = {
      onOpen: setPeekId,
      onCall: callLead,
      onCopy: copyLead,
      hasCenter: colCtx.hasCenter,
      canFind,
    };
    const goto = (patch) => nav(window.__leadsRouteOf({ searchId: leadView.searchId, list: leadView.list, cls: leadView.cls, ...patch }));
    return (
      <LeadsScope
        surface={leads}
        rail={rail}
        standing={standing}
        view={leadView}
        search={openSearch}
        strip={openSearch && window.__LEAD_VM ? window.__LEAD_VM.leadStrip(openSearch, new Date()) : null}
        rows={rowsShown}
        total={leads.counts[leadView.list] ?? leads.counts.all}
        columns={columns}
        colOptions={colOptions}
        colsOpen={colsOpen}
        colsButton={colsButton}
        onColsOpen={setColsOpen}
        onPickColumn={pickColumn}
        cellCtx={cellCtxLeads}
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={onSort}
        q={q}
        onQ={setQ}
        searchRef={searchRef}
        scrollRef={scrollRef}
        scrolled={scrolledX}
        onScrolled={setScrolledX}
        filtered={filtered}
        onClearFilters={() => { setQ(""); setChip(null); goto({ list: "all", cls: null }); }}
        empty={{ title: "No leads in this view yet.", body: "Describe the businesses you want and Claude finds them.", action: canFind ? { label: "Find leads", onClick: () => { setFinderStage("compose"); setFinderOpen(true); } } : null }}
        sel={sel}
        onToggle={toggleSel}
        onToggleAll={toggleAll}
        onClearSel={() => { setSel(new Set()); setAllMatching(false); }}
        allMatching={allMatching}
        onSelectAllMatching={() => setAllMatching(true)}
        bulkView={{ list: leadView.list, ...(leadView.searchId ? { search: leadView.searchId } : {}), ...(leadView.cls ? { class: leadView.cls } : {}), sort: sortBy, dir: sortDir }}
        bulkBusy={leadBusy}
        onBulk={bulkLeads}
        onCopyEmails={copyEmails}
        cursor={cursor}
        onCursor={setCursor}
        canFind={canFind}
        canExport={canExport}
        exportHref={window.__href ? window.__href("GET leads/export", undefined, { list: leadView.list, ...(leadView.searchId ? { search: leadView.searchId } : {}), ...(leadView.cls ? { class: leadView.cls } : {}), sort: sortBy, dir: sortDir }) : null}
        onScope={(to) => nav(to === "leads" ? "clients/leads" : "clients")}
        onPickList={(id) => goto({ list: id, searchId: leadView.searchId })}
        onPickSearch={(id) => nav(window.__leadsRouteOf({ searchId: leadView.searchId === id ? null : id, list: leadView.list, cls: null }))}
        chip={chip}
        onPickChip={setChip}
        onNeedsYou={(id) => nav(window.__leadsRouteOf({ searchId: id, list: "all", cls: null }))}
        onFind={() => { setFinderRefusal(null); setFinderStage("compose"); setFinderOpen(true); }}
        finderOpen={finderOpen}
        finderStage={finderStage}
        finderWords={finderWords}
        finderProposal={finderProposal}
        finderRefusal={finderRefusal}
        finderBusy={leadBusy}
        onFinderWords={setFinderWords}
        onFinderPlan={setFinderProposal}
        onFinderApprove={setFinderStage}
        onFinderBack={() => setFinderStage("compose")}
        onCloseFinder={() => setFinderOpen(false)}
        talk={null}
        peek={peekId && window.__leadPeekVM ? window.__leadPeekVM(peekId) : null}
        peekMode={peekMode}
        onPeekMode={setPeekMode}
        armed={armed}
        onArmed={setArmed}
        draft={draft}
        onDraftState={setDraft}
        onPeek={setPeekId}
        onPeekId={setPeekId}
        onOpenPerson={onOpenProfile}
        flash={plFlash}
        onClosePeek={() => leadPeekEscape({ mode: peekMode, armed, setMode: setPeekMode, setArmed, setPeekId })}
        onCall={callLead}
        onCopy={copyLead}
        onStripAction={() => {}}
        onMore={() => window.__leadsMore && window.__leadsMore()}
        loadingMore={leadBusy}
        firstDay={leads.searches.length === 0 && !leads.readFailed}
        onBusinessLine={(line) => window.__leadBusinessLine && window.__leadBusinessLine(line)}
        toastNode={toastNode}
      />
    );
  }

  return (
    <div className="clients">
      <PeopleRail
        scope="people"
        onScope={(to) => nav(to === "leads" ? "clients/leads" : "clients")}
        lists={lists}
```

old:
```jsx
          <PeopleStanding
            agg={agg}
```
new:
```jsx
          <PeopleStanding
            scope="people"
            agg={agg}
```

**5r. The page picks the real scope, and publishes what the Leads scope draws with.**

old:
```jsx
// A real workspace renders its own people; the seeded page keeps the demo.
const ClientsA = (props) => (window.__PEOPLE ? <ClientsAReal {...props} /> : <ClientsASeed {...props} />);

window.ClientsA = ClientsA;
// Drawn on their own by refusals-on-the-page.test.mjs.
Object.assign(window, { NewListRow, AddPersonButton, DeleteListButton });
```
new:
```jsx
// A real workspace renders its own people; the seeded page keeps the demo. The Leads scope is real as soon as
// its own surface has landed, whether or not People's has: the route gate waits on the surface the address names
// (surface-registry routeSurfaceFor), and the seeded page has no Leads scope to draw.
const ClientsA = (props) => ((props.scope === "leads" ? window.__LEADS : window.__PEOPLE) ? <ClientsAReal {...props} /> : <ClientsASeed {...props} />);

window.ClientsA = ClientsA;
// Drawn on their own by refusals-on-the-page.test.mjs; the rail, the standing line and the table's noun are the
// Leads scope's too (leads-scope.jsx draws them with scope="leads").
Object.assign(window, { NewListRow, AddPersonButton, DeleteListButton, PeopleRail, PeopleStanding, PeopleScopeTabs });
```

- [ ] **Step 6: the shell's branch.** `app-shell.jsx`, three edits.

old:
```jsx
  } else if (page === "clients" && param && /^(seg|list|state):/.test(param)) {
```
new:
```jsx
  } else if (page === "clients" && param && /^leads(:|$)/.test(param)) {
    // People › Leads: the same page, its other scope. The address carries the view (clients/leads:s-<search>:l-<list>:c-<class>),
    // and `key` remounts the page when the scope changes, so its state starts from the view it is showing rather
    // than the other one's sort and columns.
    const search = window.__LEADS && window.__leadsRouteParse
      ? (window.__LEADS.searches || []).find((s) => s.id === (window.__leadsRouteParse(param) || {}).searchId)
      : null;
    activeNav = "clients";
    crumbs = search
      ? [{ label: "People", to: "clients" }, { label: "Leads", to: "clients/leads" }, search.name]
      : [{ label: "People", to: "clients" }, "Leads"];
    pane = true;
    content = <ClientsA key="leads" scope="leads" leadsRoute={param} onNavigate={navigate} onOpenProfile={(id) => navigate(`clients/${id}`)} />;
  } else if (page === "clients" && param && /^(seg|list|state):/.test(param)) {
```

old:
```jsx
    content = <ClientsA initialSegment={segId} initialSaved={savedId} initialState={stateId} onOpenProfile={(id) => navigate(`clients/${id}`)} />;
```
new:
```jsx
    content = <ClientsA key="people" scope="people" initialSegment={segId} initialSaved={savedId} initialState={stateId} onNavigate={navigate} onOpenProfile={(id) => navigate(`clients/${id}`)} />;
```

old:
```jsx
    content = <ClientsA onOpenProfile={(id) => navigate(`clients/${id}`)} />;
```
new:
```jsx
    content = <ClientsA key="people" scope="people" onNavigate={navigate} onOpenProfile={(id) => navigate(`clients/${id}`)} />;
```

- [ ] **Step 7: the two keys in the sheet.** `packages/contracts/src/chrome.ts`:

old:
```ts
  { group: "People", keys: ["Esc"], does: "Clear the selection" },
```
new:
```ts
  { group: "People", keys: ["Esc"], does: "Clear the selection" },
  { group: "People", keys: ["F"], does: "Find leads (on Leads)" },
  { group: "People", keys: ["C"], does: "Call the lead under the cursor (on Leads)" },
```

and the pin in `tooling/scripts/tests/chrome.test.mjs` changes value (edited, not added):

old:
```js
    [["/", "Search People"], ["J K ↓ ↑", "Next and previous person"], ["X Space", "Select the person"], ["↵", "Open their profile"], ["Esc", "Clear the selection"]],
```
new:
```js
    [["/", "Search People"], ["J K ↓ ↑", "Next and previous person"], ["X Space", "Select the person"], ["↵", "Open their profile"], ["Esc", "Clear the selection"], ["F", "Find leads (on Leads)"], ["C", "Call the lead under the cursor (on Leads)"]],
```

- [ ] **Step 8: load it, everywhere the page loads.** `manifest.ts` gains `import "@/legacy/pages/leads-scope.jsx";` on the line after `client-profile.jsx`; `Chanlytics.html` gains `<script type="text/babel" src="pages/leads-scope.jsx?v=1"></script>` on the line after `client-profile.jsx?v=20` (a new file starts at 1). `clients-a.jsx` and `app-shell.jsx` are edited, not created, so their numbers are not chosen here: Task 22 step 1a bumps each edited file once for the release. `legacy-harness.test.mjs:64` holds the two lists together in order, so it fails until both have it.

- [ ] **Step 9: the two pins whose VALUE changes** in `calendar-people.test.mjs` (edited, never added; the file's `readCode(` count does not rise).

old:
```js
  assert.ok(page.includes('const PL_VIEW_KEY = "chanlytics-people-view";') && page.includes("plSaveView(view);") && page.includes('window.__saveView("people", view)'), "remembered: on this device, and on the member's row in the workspace");
```
new:
```js
  assert.ok(page.includes('const PL_VIEW_KEYS = { people: "chanlytics-people-view", leads: "chanlytics-leads-view" };') && page.includes("plSaveView(scope, view);") && page.includes("window.__saveView(page, view)"), "remembered: on this device, and on the member's row in the workspace, per scope");
```

old:
```js
  assert.ok(page.includes("React.useEffect(() => { setSel(new Set()); }, [tab, listId, savedId, q]);"), "a selection never outlives its view");
```
new:
```js
  assert.ok(page.includes("React.useEffect(() => { setSel(new Set()); setAllMatching(false); }, [tab, listId, savedId, q, leadsRoute, chip]);"), "a selection never outlives its view");
```

- [ ] **Step 10: run and see it pass.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-honest.test.mjs people-honest.test.mjs person-honest.test.mjs refusals-on-the-page.test.mjs people-table.test.mjs calendar-people.test.mjs legacy-harness.test.mjs chrome.test.mjs source-scan-ratchet.test.mjs surface-registry.test.mjs` → PASS. Rebuild contracts' dist before believing a red in `chrome.test.mjs` (`corepack pnpm --filter @chanlytics/contracts build`).

- [ ] **Step 11: the mutation checks**, each once, each reverted after: a second `window.addEventListener("keydown", …)` in the render → the keys test fails on the listener count; `if (k.finderOpen)` moved above the peek's Esc → the Esc-order test fails; `rowsShown` sorted by name on the page → the first test's order, the sort test and the bulk test fail; the `C` branch deleted → the keys test fails; `noun="lead"` dropped from `PeopleTable` → the foot says "people" and the row ids go back to `person-`, so five tests fail; the saved view sent without `list` → the view test fails; the bulk bar sending ids while `allMatching` → the bulk test fails.

- [ ] **Step 12: commit** — "Leads is a scope of People: one switch, one table, one keyboard, and a view that is the address". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

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
/** The Done strip's Undo (§8.6, Task 4.2's `lead_search_undo`): the untouched leads of the ended round leave and the month is credited. */
export async function removeRoundLeads(id: string) { return api()("POST lead-searches/[id]/undo", { params: { id } }); }
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
  window.__leadSearchUndo = removeRoundLeads;
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
    __leadSearchUndo?: typeof removeRoundLeads;
    __leadSearchRename?: typeof renameSearch;
    __leadSearchRemove?: typeof removeSearch;
    __leadBusinessLine?: typeof setBusinessLine;
  }
}
```

The body shapes above (`{ search_id }` on keep/exclude/put-back, `{ answer, plan? }`, `{ purpose, plan }`, `{ version }`) are release A's routes as the interface names their doors; check them against `routes.generated.ts` on main before writing, and change the courier, never the routes.

- [ ] **Step 3: Register it.** `LegacyApp.tsx`: beside `import { installPeopleCourier } from "./people-detail";` (:32) add `import { installLeadsCourier, leadsOverride } from "./leads";`; after `installPeopleCourier();` (:59) add `installLeadsCourier();`; `SURFACES` (:104) gains `leadsOverride`. `refresh-map.ts` (:41): `const leads = () => [leadsOverride];` and the entries `"POST lead-searches"`, `"POST lead-searches/[id]/answer"`, `"POST lead-searches/[id]/more"`, `"POST lead-searches/[id]/stop"`, `"POST lead-searches/[id]/undo"`, `"PATCH lead-searches/[id]"`, `"DELETE lead-searches/[id]"`, `"POST leads/[id]/keep"`, `"POST leads/[id]/exclude"`, `"POST leads/[id]/put-back"`, `"POST lead-operations/[id]/undo"`, `"POST leads/bulk"`, `"DELETE leads/[id]"`, `"PUT lead-suggestions"` map to it; `"POST leads/[id]/stage": () => [leadsOverride, peopleOverride]` (an Interested call makes a person). These entries patch: `apply` above re-reads nothing the page already holds. `surface-registry.ts`: `leads: "real"` (:42) with the comment `// Lifted 18 Sep 2026 (Ruben): a scope of People at clients/leads, fed by the leads surface.`; `ROUTE_SURFACE` gains `leads: "leads"` (:85, so the registry test's real-has-an-override rule holds); `routeSurfaceFor` (:168) answers `"leads"` for `page === "clients"` when `pane` matches `/^leads(:|$)/`, before the `ROUTE_SURFACE[page]` fallback; `SURFACE_RETIRED.leads` (:194) becomes `"clients/leads"`. `realtime.ts` `WATCHED` (:24) gains `{ table: "leads", event: "*" }`, `{ table: "lead_searches", event: "*" }`, `{ table: "lead_rounds", event: "*" }`, `{ table: "lead_search_members", event: "*" }` with the comment `// a round's page committed, a check landed, a class changed: the Leads scope repaints (00140)`.
- [ ] **Step 4:** Run `leads-bridge.test.mjs surface-registry.test.mjs calendar-people.test.mjs` → PASS (`surface-registry.test.mjs:261` keeps `routeSurfaceFor("leads") === undefined`; `calendar-people.test.mjs:506`'s value becomes `leads: "clients/leads",`). Commit — "The Leads surface reads by view, patches what is loaded, and every act goes through its route with the version it saw". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

## Task 4: the contracts, release B's migration, the server module and the routes (written in full, doors' bodies included)

**Files:** Create `packages/contracts/src/leads.ts`, `supabase/migrations/00142_the_leads_are_worked.sql`, `apps/dashboard/src/server/leads.ts`, `apps/dashboard/src/server/model-json.ts`, the route files · Modify `packages/contracts/src/enums.ts:102`, `notifications.ts:187, :211`, `schema-sets.generated.ts`, `apps/dashboard/src/server/rate-limit.ts:141`, `service.ts` · Tests `leads-vm.test.mjs`, `lead-routes.test.mjs`, `leads.db.test.mjs`

### 4.1 The contracts (`leads.ts`)

**Files:** Create `packages/contracts/src/leads.ts` · Modify `packages/contracts/src/index.ts:65` (`export * from "./leads";` after `./lead-search`) · Test `tooling/scripts/tests/leads-vm.test.mjs`

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

- [ ] **Step 2: Write `leads.ts`.** The stored sets are **release A's already**, in `packages/contracts/src/lead-search.ts`, where `schema-sets.ts` holds each equal to its column's CHECK (`leads.stage`, `leads.closed_reason`, `leads.email_state`, `lead_search_members.class`, `lead_search_members.fit`, `lead_operations.kind` are all listed there on main). This file imports and re-exports them and declares none of them again — a second copy is both a duplicate export from one package (W5 reproduced five `TS2308 Module "./lead-search" has already exported a member named …` on the barrel) and two homes for one CHECK. The words are the PRD's; the request schemas are v2's (v2:5915–5993) corrected:

```ts
// packages/contracts/src/leads.ts  (release B: the words, the view models, the requests)
import { z } from "zod";
import {
  LEAD_CLOSED_REASONS, LEAD_EMAIL_STATES, LEAD_FITS, LEAD_MEMBER_CLASSES, LEAD_OPERATION_KINDS, LEAD_STAGES,
  LeadSearchPlanSchema, type LeadEmailState, type LeadFit, type LeadMemberClass, type LeadStage,
} from "./lead-search";

/**
 * One home per set. Release A declares all six in `lead-search.ts` and `schema-sets.ts:122` holds
 * `LEAD_OPERATION_KINDS` Exactly equal to `lead_operations.kind`; B widens that one by `stage` and `bulk`
 * **in `lead-search.ts`**, in the same commit as 4.2's migration and `gen:schema-sets` (4.2 step 5) -- widening it
 * here first fails `schema-sets.ts:122` with `Type 'false' does not satisfy the constraint 'true'` until the
 * generated set carries the two new kinds. Nothing below re-declares a stored set.
 */
export { LEAD_CLOSED_REASONS, LEAD_EMAIL_STATES, LEAD_FITS, LEAD_OPERATION_KINDS, LEAD_STAGES };
/** B's screen word for A's stored set (`lead_search_members.class`): one set, two names, never two lists. */
export const LEAD_CLASSES = LEAD_MEMBER_CLASSES;
export type LeadClass = LeadMemberClass;
export const LEAD_LISTS = ["all", "ready", "nurture", "converted", "said_no", "not_a_fit"] as const;
export const LEAD_SORTS = ["fit", "found", "distance", "business", "rating", "stage"] as const;   // leads_page's p_sort (B widens A's three)
export const LEAD_CALL_OUTCOMES = ["interested", "call_back", "not_interested", "voicemail", "no_answer", "wrong_number"] as const;
export const LEAD_NOT_A_FIT_WHYS = ["chain", "wrong_kind", "too_far", "customer", "other"] as const;
export type { LeadEmailState, LeadFit, LeadStage };   // A's, re-exported so a page reads one name
export type LeadList = (typeof LEAD_LISTS)[number]; export type LeadSort = (typeof LEAD_SORTS)[number];
export type LeadCallOutcome = (typeof LEAD_CALL_OUTCOMES)[number]; export type LeadNotAFitWhy = (typeof LEAD_NOT_A_FIT_WHYS)[number];

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

/**
 * The chips a view may carry. Release B parses none — the route grammar keeps the key so the surface, the route and
 * the bulk act agree on one shape, and release C fills it (`2026-09-19-lead-finder-C-extras.md`). It is a type, not a
 * list: an empty record cannot be given a value by accident.
 */
export type LeadChips = Record<string, never>;

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

Also here, each with its test in `leads-vm.test.mjs` — **the DTOs and the signatures are 4.6's, written once**, and Tasks 9, 10, 12, 17 and 19 write the bodies into this same file where each one says: `LeadRowDto`, `LeadSearchRoundDto`, `LeadSearchDto`, `LeadCounts`, `LeadSuggestionsDto`, `LeadPlanFacts`; `toLeadRowVM(dto, tz, now)` (the cells' words and shapes: fit, class reason, email word, phone with its double tick, found as "6m"); `toLeadPeekVM(row, search, tz, now)` (§9.2: the sub-line, the fit sentence, How you can reach them, the six checks each `seen` or `read` with its reason and `unknown`, the other addresses folded, Found, the site); `leadRail(counts, searches)`; `leadsStanding(counts, searches)`; `leadStrip(search, now, extra?)` returning `{ state, title, parts, progress, actions, alert }` for every open state and every one of the nine endings, composed from Task 19's `leadEndingLine` and never spelling a sentence of its own, plus "Stopping · checking the emails of the N found" while a stopped round still checks (4.6 spells the signature; Task 10 writes the body). Before relying on `type: ["string", "null"]` with `enum` in a structured-output schema, check the structured-outputs doc (https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md) and use `anyOf` if a type array is refused.

- [ ] **Step 3:** Run → PASS; rebuild contracts' dist. Commit — "A view of Leads is a route, a stage change is the door's arguments, and every word a lead wears claims only what was seen". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

### 4.2 The migration

**Files:** Create `supabase/migrations/<next>_the_leads_are_worked.sql`, `tooling/scripts/tests/leads.db.test.mjs`, `tooling/scripts/tests/consent-paths.db.test.mjs` · Modify `packages/contracts/src/lead-search.ts:50` (`LEAD_OPERATION_KINDS`), `packages/contracts/src/notifications.ts:198` (`SERVER_NOTIFICATION_KINDS`), `:252` (`SERVER_LOOK`), `packages/contracts/src/enums.ts:198` (`EVENT_KINDS`), `packages/contracts/src/schema-sets.generated.ts:56, :103` (regenerated), `packages/db/src/database.types.ts` (regenerated)

What it holds, in the order the file writes it: the lead's `version` and an index for the lists; three CHECK sets widened (`lead_operations.kind`, `notifications.kind`); the `lead_suggestions` table; `lead_in_list`, the rail's list rule held once; the doors `lead_set_stage` (4.5), `lead_bulk`, `lead_erase`, `lead_export_mark`, `lead_search_undo`; the reads `leads_page` (A's, with the list, the direction and three column sorts) and `lead_list_counts`; `lead_searches_view` again, with the round's ending, who can be emailed and called, and the operation a finished search's Undo names; `lead_undo` again, with the `stage` and `bulk` branches; the trigger `lead_rounds_notify` and the bell's two kinds; and the two consent doors, refusing a converted lead's borrowed yes for good.

Five things this file does NOT do, each because main already does it or forbids it:

- **`leads.phone_wrong` is already there.** 00140 ships it (`00140:214`), so nothing adds it. The door reads and writes it.
- **`leads.version` is not.** 00140 gave `lead_search_members` a version (`:279`) because A's undo-able acts all change a membership. B's change the LEAD, so the lead gets its own, and `lead_undo`'s new branches guard on it.
- **The bell's list is 00141's, not 00134's.** `00141:25` widened `notifications_kind_check` again (`broadcast_sent`, `broadcast_stopped`) and its own head warns that the next widening "must be written from the list as it stands then, or it silently removes these two". The full list below is 00141's plus the two.
- **`lead_operations.kind` widens the list that already exists in contracts.** `LEAD_OPERATION_KINDS` is `lead-search.ts:50` (A's), held `Exactly` to the column by `schema-sets.ts:122`. `stage` and `bulk` join it there; nothing declares a second list.
- **One route is missing from §12.6's B list, and 4.4 must carry it.** `lead_search_undo` is the Done strip's Undo (§8.6), and "What changed since v2" 26 struck "the search's own `undo` route" because v2's undid a REMOVAL, which `POST lead-operations/[id]/undo` now does. This is a different act, and nothing else reaches it: 4.4 adds `apps/dashboard/app/api/v1/lead-searches/[id]/undo/route.ts` — `export const POST = write({ scope: leadSearchScope, role: "owner", rate: "lead_member", handle: ({ ctx, row }) => undoSearch(ctx, row) })` — answering `{ removed, credited, op_id, version }`, whose toast's own Undo is A's `POST lead-operations/[id]/undo`.
- **The view gains no `asked_on`.** It already selects `s.created_at`, which IS the date the search was asked on; a second column with the same value is the drift the house rule against two homes for one fact exists to stop. `LeadSearchDto.asked_on` (4.6) is filled from `created_at` in `searchesOf` (4.4).

- [ ] **Step 1: Take the number.** `ls supabase/migrations | tail -5`. **`00142` below is the next free number as of 20 September 2026** (`00141_a_broadcast_that_went_out_is_not_a_failure.sql` is the last on main), and it is the number this task is written with — but the number is taken at build time, not now: if anything has landed since, take the next free one and use it in the file name and in every command below. **Re-list `supabase/migrations` again immediately before pushing**, whatever this step said: two sessions have taken the same number and the CLI skips the second silently (`migrations.test.mjs` fails duplicates).

- [ ] **Step 2: The failing tests.** Two files. `leads.db.test.mjs` proves the doors on the real local Postgres with real sessions; `consent-paths.db.test.mjs` proves that the two consent doors are the only way a member can record an answer at all and that neither will record a borrowed yes (Task 7 proves the routes above them).

```js
// tooling/scripts/tests/leads.db.test.mjs
/**
 * The doors that work a lead, proved on a real Postgres with real sessions:
 * the stage and the six call outcomes, "Did you send it?", Not a fit, bulk
 * over a selection and over a view, erase, the export mark, the lists and
 * their counts, the page's sorts, the bell's two kinds, and the undo of each
 * (release B, migration 00142_the_leads_are_worked.sql; PRD v3 §9, §0.4).
 *
 * Runs the way lead-engine.db.test.mjs does: against the database
 * `supabase start` builds on this machine, never production. The sessions are
 * real -- users made with the admin API, signed in with a password through the
 * anon key -- so every door judges auth.uid() as the dashboard's client would.
 * A failed sign-in fails the test (review E11).
 *
 * The fixtures are fictional: every domain under .example, every phone in
 * 555-0100..0199, every place id ChIJfixture.... That database is shared with
 * every other worktree on this machine, so this suite leaves no row behind.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { leadSuppressionHash } from "@chanlytics/contracts";
import { stageArgs, LEAD_CONSENT_REFUSAL } from "../../../packages/contracts/src/leads.ts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite makes users, workspaces and leads"
    : !ANON
      ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
      : false;

let db;
let A;          // the workspace under test, in America/Chicago
let owner;      // an owner of A
let operator;   // an operator of A
let viewer;     // a viewer of A
const users = [];
const ids = {}; // what the tests hand each other, in order

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
/** The error a door raised, as the client reads it. */
const said = async (p) => {
  const res = await p;
  assert.notEqual(res.error, null, `expected a refusal, got ${JSON.stringify(res.data)}`);
  return res.error.message;
};

/** A real session for a fresh user with this role in this workspace. */
async function memberClient(role, tenant) {
  const email = `leadsb-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: made.data.user.id };
}

/** The stage door as the route calls it: the page's words, through contracts. */
const setStage = (who, leadId, input) => who.client.rpc("lead_set_stage", { p_lead_id: leadId, ...stageArgs(input) });
const leadRow = async (id) => ok(await db.from("leads").select("*").eq("id", id).single());
const events = async (subjectId) => ok(await db.from("events").select("kind, data").eq("subject_id", subjectId));

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(await db.from("tenants").insert({ slug: `leads-b-${Date.now()}`, name: "Leads B", timezone: "America/Chicago" }).select("id").single()).id;
  owner = await memberClient("owner", A);
  operator = await memberClient("operator", A);
  viewer = await memberClient("viewer", A);
  ids.search = ok(await db.from("lead_searches").insert({
    tenant_id: A, created_by: owner.userId, via: "people", card: "local_businesses",
    name: "personal trainers", asked: "personal trainers in Austin", plan: { version: 1 },
  }).select("id").single()).id;
  ids.round = ok(await db.from("lead_rounds").insert({
    tenant_id: A, search_id: ids.search, seq: 1, purpose: "probe", plan: { version: 1 }, plan_version: 1,
    target: 200, state: "queued", month: "2026-09", day: "2026-09-19", platform_day: "2026-09-19",
  }).select("id").single()).id;
  // Six places: five qualified and counted, one in Needs review. The sixth has
  // no number, so the address-only conversion has something to take, and
  // found_at is explicit so every keyset tie-break is the same twice.
  for (let i = 1; i <= 6; i++) {
    const lead = ok(await db.from("leads").insert({
      tenant_id: A, place_id: `ChIJfixtureB${i}`, business_name: `Fixture ${i}`, category: "Personal trainer",
      street: `${i} Fixture St`, city: "Austin", region: "TX", postal_code: "78704",
      website_host: `fixture${i}.example`,
      phone_e164: i === 6 ? null : `+151255501${String(i).padStart(2, "0")}`, phone_sources: i === 6 ? 0 : 2,
      email: `hello@fixture${i}.example`, email_state: i === 5 ? "catch_all" : "ok",
      rating: 4 + i / 10, reviews: 10 + i, found_at: `2026-09-19T10:0${i}:00Z`,
    }).select("id").single()).id;
    ok(await db.from("lead_search_members").insert({
      search_id: ids.search, lead_id: lead, round_id: ids.round, tenant_id: A,
      judgment: { reasons: [], shares: [] }, class: i === 5 ? "review" : "qualified",
      fit: i === 5 ? null : "strong", reason: "A fixture.", distance_m: 1200 + i,
      counted: i !== 5, counted_month: i === 5 ? null : "2026-09",
    }));
    ids[`lead${i}`] = lead;
  }
});

// The local stack is shared with every other worktree, so this suite leaves
// nothing behind. Everything carrying a tenant_id cascades from the workspace;
// events have no foreign key to it, so they go by hand.
after(async () => {
  if (skip) return;
  await db.from("events").delete().eq("tenant_id", A);
  await db.from("tenants").delete().eq("id", A);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("a stage click to Talking keeps the lead a lead: no person, converted false, and the event says stage", { skip }, async () => {
  const a = ok(await setStage(operator, ids.lead1, { kind: "stage", stage: "converted" }));
  assert.equal(a.stage, "converted");
  assert.equal(a.converted, false, "a click says Talking; it never says convert");
  assert.equal(a.contact_id, null);
  const row = await leadRow(ids.lead1);
  assert.equal(row.contact_id, null);
  assert.equal(row.converted_at, null);
  assert.equal(row.version, 2, "the version the page sends back with an Undo");
  assert.deepEqual((await events(ids.lead1)).map((e) => e.kind), ["lead.stage"]);
  const op = ok(await db.from("lead_operations").select("*").eq("id", a.op_id).single());
  assert.deepEqual([op.kind, op.version, op.lead_ids], ["stage", 2, [ids.lead1]]);
  assert.deepEqual([op.before.stage, op.after.stage], ["ready", "converted"]);
});

test("an Interested call makes a person with source lead, links it, and keeps the call and the note", { skip }, async () => {
  const a = ok(await setStage(operator, ids.lead2, { kind: "outcome", outcome: "interested", note: "Wants a call Tuesday" }));
  assert.deepEqual([a.converted, a.existed, a.stage], [true, false, "converted"]);
  const person = ok(await db.from("contacts").select("*").eq("id", a.contact_id).single());
  assert.equal(person.display_name, "Fixture 2", "named for the business until a person's name is known");
  assert.equal(person.phone_e164, "+15125550102");
  assert.equal(person.email, "hello@fixture2.example", "00125's door adds the lead's address");
  assert.deepEqual([person.consent, person.marketing_consent], ["unknown", "unknown"], "their consent starts unknown");
  const added = ok(await db.from("events").select("data").eq("subject_id", person.id).eq("kind", "contact.added").single());
  assert.equal(added.data.source, "lead", "People's Came from reads it as \"A lead you found\" (00138)");
  const kinds = (await events(ids.lead2)).map((e) => e.kind).sort();
  assert.deepEqual(kinds, ["lead.call", "lead.converted"]);
  const row = await leadRow(ids.lead2);
  assert.deepEqual([row.contact_id, row.last_outcome, row.last_note], [person.id, "interested", "Wants a call Tuesday"]);
  assert.ok(row.converted_at && row.contacted_at, "the lead is contacted and converted");
  ids.person2 = person.id;
});

test("a place whose number is already someone's converts into them; nothing makes a second person", { skip }, async () => {
  const mine = ok(await db.from("contacts").insert({ tenant_id: A, phone_e164: "+15125550103", display_name: "Dana Reyes" }).select("id").single()).id;
  const a = ok(await setStage(operator, ids.lead3, { kind: "outcome", outcome: "interested" }));
  assert.deepEqual([a.contact_id, a.existed], [mine, true]);
  const all = ok(await db.from("contacts").select("id, display_name").eq("tenant_id", A).eq("phone_e164", "+15125550103"));
  assert.deepEqual(all, [{ id: mine, display_name: "Dana Reyes" }], "one person, with their own name (25)");
});

test("Wrong number marks the number and keeps the stage; \"Did you send it?\" moves them to Contacted", { skip }, async () => {
  const a = ok(await setStage(operator, ids.lead4, { kind: "outcome", outcome: "wrong_number" }));
  assert.equal(a.stage, "ready", "the stage is kept");
  assert.equal((await leadRow(ids.lead4)).phone_wrong, true);
  ok(await setStage(operator, ids.lead4, { kind: "emailed" }));
  const row = await leadRow(ids.lead4);
  assert.equal(row.stage, "nurture");
  assert.ok(row.contacted_at);
  const kinds = (await events(ids.lead4)).map((e) => e.kind).sort();
  assert.deepEqual(kinds, ["lead.call", "lead.emailed"], "what was recorded is that the owner said they sent it");
});

test("Already a customer hides the place from every future search, and Undo takes the act and its suppression back, once", { skip }, async () => {
  const a = ok(await setStage(operator, ids.lead5, { kind: "not_a_fit", why: "customer" }));
  const hash = await leadSuppressionHash(A, "ChIJfixtureB5");
  const hidden = ok(await db.from("lead_suppressions").select("what").eq("tenant_id", A).eq("kind", "place").eq("hash", hash));
  assert.deepEqual(hidden, [{ what: "customer" }]);
  const why = ok(await db.from("events").select("data").eq("subject_id", ids.lead5).eq("kind", "lead.not_a_fit").single());
  assert.equal(why.data.why, "customer");
  assert.deepEqual([(await leadRow(ids.lead5)).stage, (await leadRow(ids.lead5)).closed_reason], ["archived", "customer"]);
  const undone = ok(await owner.client.rpc("lead_undo", { p_op_id: a.op_id, p_version: a.version }));
  assert.equal(undone.ok, true);
  assert.deepEqual([(await leadRow(ids.lead5)).stage, (await leadRow(ids.lead5)).closed_reason], ["ready", null]);
  assert.deepEqual(ok(await db.from("lead_suppressions").select("what").eq("tenant_id", A).eq("hash", hash)), [], "the suppression this act wrote went with it");
  assert.equal(ok(await owner.client.rpc("lead_undo", { p_op_id: a.op_id, p_version: a.version })).error, "undone", "undone once");
});

test("a person who was made is never unmade from a toast", { skip }, async () => {
  const op = ok(await db.from("lead_operations").select("id, version").eq("kind", "stage").contains("lead_ids", [ids.lead2]).order("at", { ascending: false }).limit(1).single());
  assert.equal(ok(await owner.client.rpc("lead_undo", { p_op_id: op.id, p_version: op.version })).error, "person");
});

test("a viewer is a stranger to both doors, and only an owner erases", { skip }, async () => {
  assert.equal(await said(setStage(viewer, ids.lead1, { kind: "stage", stage: "nurture" })), "Lead not found.");
  assert.equal(await said(viewer.client.rpc("lead_erase", { p_lead_id: ids.lead1 })), "Only an owner can erase a lead.");
  assert.equal(await said(operator.client.rpc("lead_erase", { p_lead_id: ids.lead1 })), "Only an owner can erase a lead.");
  const a = ok(await owner.client.rpc("lead_erase", { p_lead_id: ids.lead1 }));
  assert.deepEqual([a.erased, a.already], [true, false]);
  const row = await leadRow(ids.lead1);
  assert.ok(row.erased_at && row.blanked_at);
  assert.deepEqual([row.place_id, row.business_name, row.phone_e164, row.email], [null, "", null, null], "nothing names or reaches the place");
  const tombs = ok(await db.from("lead_suppressions").select("kind").eq("tenant_id", A).eq("what", "erased"));
  assert.deepEqual(tombs.map((t) => t.kind).sort(), ["email", "phone", "place"]);
  assert.equal(ok(await owner.client.rpc("lead_erase", { p_lead_id: ids.lead1 })).already, true, "a second request is answered, not re-executed");
});

test("the export mark stamps each lead once, skips an erased one, and is the owner's", { skip }, async () => {
  assert.equal(ok(await owner.client.rpc("lead_export_mark", { p_tenant_id: A, p_ids: [ids.lead2, ids.lead3, ids.lead1] })), 2);
  assert.equal(ok(await owner.client.rpc("lead_export_mark", { p_tenant_id: A, p_ids: [ids.lead2] })), 0, "a lead already charged is not charged twice");
  assert.equal(await said(operator.client.rpc("lead_export_mark", { p_tenant_id: A, p_ids: [ids.lead4] })), "Workspace not found.");
});

test("bulk acts on every lead a view matches, refuses ids and a view together, and undoes as one, keeping what moved since", { skip }, async () => {
  const a = ok(await operator.client.rpc("lead_bulk", { p_tenant_id: A, p_action: "contacted", p_ids: null, p_view: { list: "converted", class: "qualified" } }));
  assert.equal(a.done, 2, "lead2 and lead3 were Talking");
  assert.equal(ok(await db.from("leads").select("id").eq("tenant_id", A).eq("stage", "nurture")).length, 3);
  const one = ok(await db.from("events").select("data").eq("tenant_id", A).eq("kind", "lead.stage").contains("data", { bulk: true }));
  assert.equal(one.length, 1, "one event for the act, not one per lead");
  assert.equal(
    await said(operator.client.rpc("lead_bulk", { p_tenant_id: A, p_action: "contacted", p_ids: [ids.lead4], p_view: { list: "all" } })),
    "name the leads, or the view, and not both");
  // One lead moves under the owner's feet before they press Undo.
  ok(await setStage(operator, ids.lead3, { kind: "stage", stage: "ready" }));
  const undone = ok(await owner.client.rpc("lead_undo", { p_op_id: a.op_id, p_version: a.version }));
  assert.deepEqual([undone.restored, undone.kept], [1, 1]);
  assert.equal((await leadRow(ids.lead2)).stage, "converted", "the untouched one is back where it was");
  assert.equal((await leadRow(ids.lead3)).stage, "ready", "the one that moved since is left alone");
});

test("the page takes the list, the direction and the three new sorts; A's six arguments still page as they did", { skip }, async () => {
  const page = (args) => owner.client.rpc("leads_page", { p_tenant_id: A, p_search_id: ids.search, ...args });
  const a = ok(await page({ p_class: "qualified", p_sort: "found", p_after_key: null, p_limit: 200 }));
  assert.equal(a.length, 4, "the qualified leads that are left");
  const first = ok(await page({ p_class: "qualified", p_sort: "found", p_after_key: null, p_limit: 1 }));
  assert.equal(ok(await page({ p_class: "qualified", p_sort: "found", p_after_key: first[0].sort_key, p_limit: 200 })).length, 3, "A's packed key still pages");
  const names = (rows) => rows.map((r) => r.business_name);
  assert.deepEqual(names(ok(await page({ p_class: "qualified", p_sort: "business", p_list: "all", p_dir: "asc", p_limit: 200 }))), ["Fixture 2", "Fixture 3", "Fixture 4", "Fixture 6"]);
  assert.deepEqual(names(ok(await page({ p_class: "qualified", p_sort: "rating", p_list: "all", p_dir: "desc", p_limit: 200 }))), ["Fixture 6", "Fixture 4", "Fixture 3", "Fixture 2"], "best first");
  assert.deepEqual(names(ok(await page({ p_class: "qualified", p_sort: "stage", p_list: "all", p_dir: "asc", p_limit: 200 }))), ["Fixture 6", "Fixture 3", "Fixture 4", "Fixture 2"], "Ready, then Contacted, then Talking, newest first inside each");
  assert.equal(ok(await page({ p_class: "qualified", p_sort: "fit", p_list: "nurture", p_limit: 200 })).length, 1, "the Contacted list");
  assert.equal(ok(await page({ p_class: "review", p_sort: "fit", p_list: "all", p_limit: 200 })).length, 1, "Needs review is a class, not a list");
  const one = ok(await page({ p_class: "qualified", p_sort: "business", p_list: "all", p_dir: "asc", p_limit: 1 }));
  const next = ok(await page({ p_class: "qualified", p_sort: "business", p_after_key: one[0].page_key, p_after_id: one[0].member_id, p_list: "all", p_dir: "asc", p_limit: 200 }));
  assert.deepEqual(names(next), ["Fixture 3", "Fixture 4", "Fixture 6"], "the key and the row's id carry on");
  assert.deepEqual(ok(await owner.client.rpc("lead_list_counts", { p_tenant_id: A })),
    { all: 4, ready: 2, nurture: 1, converted: 1, said_no: 0, not_a_fit: 0 }, "each lead counted once, however many searches found it");
});

test("the bell rings twice: once when a round asks, once when it ends, and never for one that was stopped", { skip }, async () => {
  const bell = async (kind) => ok(await db.from("notifications").select("title, body, route, subject_id").eq("tenant_id", A).eq("kind", kind));
  ok(await db.from("lead_rounds").update({ state: "probing" }).eq("id", ids.round));
  ok(await db.from("lead_rounds").update({
    state: "waiting_on_owner", waiting_since: new Date().toISOString(),
    question: { sentence: "Most of the first 25 were chain gyms. Keep leaving them out?", criterion_key: "chain" },
  }).eq("id", ids.round));
  const asked = await bell("leads_question");
  assert.equal(asked.length, 1);
  assert.equal(asked[0].title, "Your search for personal trainers needs you");
  assert.equal(asked[0].body, "Most of the first 25 were chain gyms. Keep leaving them out?");
  assert.equal(asked[0].route, `clients/leads:s-${ids.search}`);
  ok(await db.from("lead_rounds").update({ state: "waiting_on_owner", waiting_since: new Date().toISOString() }).eq("id", ids.round));
  assert.equal((await bell("leads_question")).length, 1, "one question row per round");
  // A search the owner stopped, or removed, ends its round 'stopped'.
  const other = ok(await db.from("lead_searches").insert({ tenant_id: A, via: "people", card: "local_businesses", name: "yoga studios", asked: "yoga studios in Austin", plan: { version: 1 } }).select("id").single()).id;
  const stopped = ok(await db.from("lead_rounds").insert({ tenant_id: A, search_id: other, seq: 1, purpose: "probe", plan: { version: 1 }, plan_version: 1, target: 50, state: "queued", month: "2026-09", day: "2026-09-19", platform_day: "2026-09-19" }).select("id").single()).id;
  ok(await db.from("lead_rounds").update({ state: "ended", ending: "stopped", ended_at: new Date().toISOString() }).eq("id", stopped));
  assert.deepEqual(await bell("leads_ready"), [], "nothing rings for a round the owner stopped");
  ok(await db.from("lead_rounds").update({ state: "running" }).eq("id", ids.round));
  ok(await db.from("lead_rounds").update({ state: "ended", ending: "target_reached", ended_at: new Date().toISOString() }).eq("id", ids.round));
  const done = await bell("leads_ready");
  assert.equal(done.length, 1, "one done row per round");
  assert.equal(done[0].title, "Your search for personal trainers is done");
  assert.equal(done[0].body, "4 found.");
  assert.equal(done[0].route, `clients/leads:s-${ids.search}`);
});

test("the view carries the round's ending, who can be emailed and called, and the operation Undo names for a day", { skip }, async () => {
  const view = async () => ok(await owner.client.from("lead_searches_view").select("*").eq("id", ids.search).single());
  let row = await view();
  assert.deepEqual([row.qualified, row.review], [4, 1], "a blanked membership is gone from Qualified");
  assert.equal(row.emails_checked, 4, "an address the check answered for");
  assert.equal(row.with_phone, 2, "a number nobody has marked wrong");
  assert.deepEqual([row.ending, row.ended_at === null], ["target_reached", false]);
  assert.equal(row.undo_op_id, null, "nothing to undo yet");
  const op = ok(await db.from("lead_operations").insert({ tenant_id: A, kind: "undo_search", search_id: ids.search, lead_ids: [], before: {}, after: {}, version: 1, by: owner.userId }).select("id").single()).id;
  row = await view();
  assert.deepEqual([row.undo_op_id, row.undo_version], [op, 1]);
  ok(await db.from("lead_operations").update({ at: new Date(Date.now() - 25 * 3600_000).toISOString() }).eq("id", op));
  assert.equal((await view()).undo_op_id, null, "and lets it go when the day is out");
});

test("a lead with only an address converts into an email-only person, with the same event", { skip }, async () => {
  const a = ok(await setStage(operator, ids.lead6, { kind: "outcome", outcome: "interested" }));
  assert.deepEqual([a.converted, a.existed], [true, false]);
  const person = ok(await db.from("contacts").select("*").eq("id", a.contact_id).single());
  assert.equal(person.phone_e164, null, "a person with no number");
  assert.equal(person.email, "hello@fixture6.example", "the address is the identity");
  assert.equal(person.display_name, "Fixture 6");
  const added = ok(await db.from("events").select("data").eq("subject_id", person.id).eq("kind", "contact.added").single());
  assert.equal(added.data.source, "lead", "the same event says where they came from");
  assert.equal((await leadRow(ids.lead6)).contact_id, person.id);
});

test("ACCEPTANCE: the Done strip's Undo removes what nobody touched, credits the month they counted in, and is itself undone", { skip }, async () => {
  // A month with four leads spent on it, and a round about to end.
  ok(await db.from("lead_counters").insert({ tenant_id: A, kind: "allowance", period: "2026-09", used: 4 }));
  const search = ok(await db.from("lead_searches").insert({ tenant_id: A, via: "people", card: "local_businesses", name: "chiropractors", asked: "chiropractors in Austin", plan: { version: 1 } }).select("id").single()).id;
  const round = ok(await db.from("lead_rounds").insert({ tenant_id: A, search_id: search, seq: 1, purpose: "probe", plan: { version: 1 }, plan_version: 1, target: 50, state: "queued", month: "2026-09", day: "2026-09-19", platform_day: "2026-09-19" }).select("id").single()).id;
  const now = new Date().toISOString();
  const four = {};
  for (const [name, extra] of [
    ["untouched", {}],
    ["worked", { stage: "nurture", contacted_at: now }],   // the owner has been in touch
    ["exported", { exported_at: now }],                    // it has left the building
    ["untouched2", {}],
  ]) {
    four[name] = ok(await db.from("leads").insert({
      tenant_id: A, place_id: `ChIJfixtureD${name}`, business_name: `Fixture ${name}`, city: "Austin", region: "TX",
      phone_e164: null, email: `hello@${name}.example`, email_state: "ok", ...extra,
    }).select("id").single()).id;
    ok(await db.from("lead_search_members").insert({ search_id: search, lead_id: four[name], round_id: round, tenant_id: A, judgment: {}, class: "qualified", fit: "strong", reason: "A fixture.", counted: true, counted_month: "2026-09" }));
  }
  const used = async () => Number(ok(await db.from("lead_counters").select("used").eq("tenant_id", A).eq("kind", "allowance").eq("period", "2026-09").single()).used);
  const member = async (lead) => ok(await db.from("lead_search_members").select("blanked_at, counted, counted_month").eq("search_id", search).eq("lead_id", lead).single());

  assert.equal(ok(await owner.client.rpc("lead_search_undo", { p_search_id: search })).error, "running", "a round still going has nothing to take back");
  ok(await db.from("lead_rounds").update({ state: "ended", ending: "target_reached", ended_at: now }).eq("id", round));
  assert.equal(await said(operator.client.rpc("lead_search_undo", { p_search_id: search })), "Search not found.", "an operator may work the leads; only the owner gives them back");

  const a = ok(await owner.client.rpc("lead_search_undo", { p_search_id: search }));
  assert.deepEqual([a.removed, a.credited], [3, 2], "three left the search, two went back to the month");
  assert.equal((await member(four.worked)).blanked_at, null, "the one the owner worked stays");
  assert.equal((await member(four.worked)).counted, true, "and stays charged");
  assert.notEqual((await member(four.exported)).blanked_at, null, "the exported one leaves");
  assert.equal((await member(four.exported)).counted, true, "and keeps its charge");
  assert.equal((await member(four.untouched)).counted, false, "the untouched ones are given back");
  assert.equal(await used(), 2, "the month they counted in has two back");
  const op = ok(await db.from("lead_operations").select("before, kind").eq("id", a.op_id).single());
  assert.equal(op.kind, "undo_search");
  assert.deepEqual(op.before.credited, { [four.untouched]: "2026-09", [four.untouched2]: "2026-09" }, "which leads were credited, and in which month");
  assert.equal(ok(await owner.client.from("lead_searches_view").select("undo_op_id").eq("id", search).single()).undo_op_id, a.op_id, "the strip names it while it can be pressed");

  const undone = ok(await owner.client.rpc("lead_undo", { p_op_id: a.op_id, p_version: a.version }));
  assert.deepEqual([undone.restored, undone.kept, undone.recharged], [2, 1, 2], "put back, and charged again");
  assert.equal(await used(), 4, "the month is charged again");
  assert.deepEqual(await member(four.untouched), { blanked_at: null, counted: true, counted_month: "2026-09" }, "in the month it counted in");
  assert.notEqual((await member(four.exported)).blanked_at, null, "an exported lead stays where the act left it (E9)");

  // A day later it is too late. A round is final once ended, so the day-old
  // one is a round of its own, ended with its own time.
  const old = ok(await db.from("lead_searches").insert({ tenant_id: A, via: "people", card: "local_businesses", name: "dentists", asked: "dentists in Austin", plan: { version: 1 } }).select("id").single()).id;
  const oldRound = ok(await db.from("lead_rounds").insert({ tenant_id: A, search_id: old, seq: 1, purpose: "probe", plan: { version: 1 }, plan_version: 1, target: 50, state: "queued", month: "2026-09", day: "2026-09-19", platform_day: "2026-09-19" }).select("id").single()).id;
  ok(await db.from("lead_rounds").update({ state: "ended", ending: "target_reached", ended_at: new Date(Date.now() - 25 * 3600_000).toISOString() }).eq("id", oldRound));
  assert.equal(ok(await owner.client.rpc("lead_search_undo", { p_search_id: old })).error, "too_late", "twenty-four hours, and no longer");
});

test("ACCEPTANCE: both consent doors refuse a converted lead's borrowed yes, accept their no, and leave everyone else alone", { skip }, async () => {
  const other = ok(await db.from("contacts").insert({ tenant_id: A, phone_e164: "+15125550199", display_name: "Not from a lead" }).select("id").single()).id;
  for (const call of [
    () => owner.client.rpc("set_contact_consent", { p_contact_id: ids.person2, p_consent: "opted_in", p_source: "form", p_note: "they signed a slip" }),
    () => owner.client.rpc("set_marketing_consent", { p_tenant_id: A, p_contact_id: ids.person2, p_consent: "opted_in", p_source: "form", p_note: "they signed a slip" }),
    () => owner.client.rpc("set_marketing_consent", { p_tenant_id: A, p_contact_id: ids.person2, p_consent: "opted_in", p_source: "customer_message", p_message_id: "5e000000-0000-4000-8000-0000000000aa" }),
  ]) assert.equal(await said(call()), LEAD_CONSENT_REFUSAL);
  assert.equal(ok(await owner.client.rpc("set_contact_consent", { p_contact_id: ids.person2, p_consent: "opted_out", p_source: "phone" })).consent, "opted_out", "a no is theirs to record");
  assert.equal(ok(await owner.client.rpc("set_marketing_consent", { p_tenant_id: A, p_contact_id: ids.person2, p_consent: "opted_out", p_source: "phone" })).marketing_consent, "opted_out");
  assert.equal(ok(await owner.client.rpc("set_contact_consent", { p_contact_id: other, p_consent: "opted_in", p_source: "form", p_note: "a paper slip" })).consent, "opted_in", "a person no lead is linked to is untouched");
  assert.equal(ok(await db.rpc("set_marketing_consent", { p_tenant_id: A, p_contact_id: ids.person2, p_consent: "opted_in", p_source: "customer_message", p_evidence: { words: "YES OFFERS" } })).marketing_consent, "opted_in",
    "the edge holds the service key and no session: what they texted is still recorded");
});
```

```js
/**
 * A converted lead's yes comes only from them, permanently (PRD v3 §0.4,
 * decision 19), proved where the rule lives: on the database.
 *
 * consent-paths.test.mjs proves that every route a member can reach goes
 * through one of the two consent doors and carries its refusal back in words.
 * This file proves the other half: that the two doors are the only definer
 * doors a member can call that record an answer at all, that neither will
 * write a yes for a person a lead is linked to, and that a member cannot write
 * consent around them -- contacts has no member UPDATE policy, so a forbidden
 * UPDATE succeeds with zero rows.
 *
 * Runs against the database `supabase start` builds on this machine, never
 * production, the way lead-engine.db.test.mjs does; the catalog is read
 * through the CLI the way privileges.db.test.mjs reads it (SUPABASE_CLI names
 * the binary when `supabase` is not on PATH). A failed sign-in fails the test
 * (review E11).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { LEAD_CONSENT_REFUSAL } from "../../../packages/contracts/src/leads.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite makes users, workspaces and leads"
    : !ANON
      ? "no SUPABASE_ANON_KEY in env: the session this suite signs in with needs it"
      : false;

/** One statement through `supabase db query --local`, and the rows it returned. */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) throw new Error(`supabase db query exited ${r.status}: ${[r.stderr, r.stdout].map((s) => (s ?? "").trim()).filter(Boolean).join("\n").slice(-800)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const end = out.lastIndexOf(out[start] === "{" ? "}" : "]");
  const parsed = JSON.parse(out.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

let db;
let A;
let owner;
let fromALead;   // a person a lead is linked to
let anyoneElse;  // a person no lead is linked to
const users = [];
const ok = (res) => { assert.equal(res.error, null, res.error?.message); return res.data; };

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(await db.from("tenants").insert({ slug: `consent-paths-${Date.now()}`, name: "Consent paths" }).select("id").single()).id;
  const email = `consent-owner-${Date.now()}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  owner = { client, userId: made.data.user.id };
  // A person a lead you found is linked to -- as an Interested call leaves
  // them (leads.db.test.mjs makes one through the door; here the shape is
  // what matters, so it is written directly with the service key).
  fromALead = ok(await db.from("contacts").insert({ tenant_id: A, phone_e164: "+15125550151", display_name: "Fixture Strength Lab" }).select("id").single()).id;
  anyoneElse = ok(await db.from("contacts").insert({ tenant_id: A, phone_e164: "+15125550152", display_name: "Walked in" }).select("id").single()).id;
  ok(await db.from("leads").insert({
    tenant_id: A, place_id: "ChIJfixtureConsent1", business_name: "Fixture Strength Lab", city: "Austin", region: "TX",
    phone_e164: "+15125550151", email: "hello@fixturestrength.example", email_state: "ok",
    stage: "converted", contact_id: fromALead, converted_at: new Date().toISOString(),
  }));
});

after(async () => {
  if (skip) return;
  await db.from("events").delete().eq("tenant_id", A);
  await db.from("tenants").delete().eq("id", A);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("ACCEPTANCE: neither door will write a yes for a person a lead is linked to, and both say the same sentence", { skip }, async () => {
  for (const call of [
    () => owner.client.rpc("set_contact_consent", { p_contact_id: fromALead, p_consent: "opted_in", p_source: "form", p_note: "they signed a slip" }),
    () => owner.client.rpc("set_marketing_consent", { p_tenant_id: A, p_contact_id: fromALead, p_consent: "opted_in", p_source: "form", p_note: "they signed a slip" }),
    // The desk's own-message door (00137, #675) names a real message and is
    // still refused: the yes has to come through the edge.
    () => owner.client.rpc("set_marketing_consent", { p_tenant_id: A, p_contact_id: fromALead, p_consent: "opted_in", p_source: "customer_message", p_message_id: "5e000000-0000-4000-8000-0000000000aa" }),
  ]) {
    const res = await call();
    assert.notEqual(res.error, null, `expected a refusal, got ${JSON.stringify(res.data)}`);
    assert.equal(res.error.message, LEAD_CONSENT_REFUSAL);
  }
  const after_ = ok(await db.from("contacts").select("consent, marketing_consent").eq("id", fromALead).single());
  assert.deepEqual(after_, { consent: "unknown", marketing_consent: "unknown" }, "nothing moved");
  // A no, and unknown, stay the owner's to record; so does anyone else's yes.
  assert.equal(ok(await owner.client.rpc("set_contact_consent", { p_contact_id: fromALead, p_consent: "opted_out", p_source: "phone" })).consent, "opted_out");
  assert.equal(ok(await owner.client.rpc("set_marketing_consent", { p_tenant_id: A, p_contact_id: fromALead, p_consent: "unknown", p_source: "operator" })).marketing_consent, "unknown");
  assert.equal(ok(await owner.client.rpc("set_contact_consent", { p_contact_id: anyoneElse, p_consent: "opted_in", p_source: "form", p_note: "a paper slip" })).consent, "opted_in");
});

test("ACCEPTANCE: the paths with no session -- the edge and the yes page -- still land a yes on a converted lead", { skip }, async () => {
  // The edge holds the service key, so auth.uid() is null: it records what the
  // customer texted, with the evidence it read. The yes page's 'form' is the
  // same path. Both are accepted by design (§0.4).
  assert.equal(ok(await db.rpc("set_marketing_consent", {
    p_tenant_id: A, p_contact_id: fromALead, p_consent: "opted_in", p_source: "customer_message",
    p_evidence: { words: "YES OFFERS", channel: "sms" },
  })).marketing_consent, "opted_in");
});

test("ACCEPTANCE: a member cannot write consent except through a door: a direct update changes nothing", { skip }, async () => {
  const { data, error } = await owner.client.from("contacts").update({ consent: "opted_in", consent_source: "in_person" }).eq("id", fromALead).select("id");
  assert.equal(error, null);
  assert.deepEqual(data, [], "contacts has no member UPDATE policy: RLS turns the write into nothing (a forbidden UPDATE succeeds with 0 rows)");
  assert.equal(ok(await db.from("contacts").select("consent").eq("id", fromALead).single()).consent, "opted_out", "still the answer they gave");
});

test("ACCEPTANCE: the definer doors a member can call that write consent are the two answer doors and the erasure", { skip }, () => {
  const rows = query(`select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')
       and p.prosrc ~* 'update\\s+(public\\.)?contacts\\s+set[^;]*consent\\s*=' order by 1`);
  assert.deepEqual(rows.map((r) => r.name), ["erase_contact", "set_contact_consent", "set_marketing_consent"]);
  // The third is the right to be forgotten (00027), and the only value it
  // writes is the absence of an answer: it can record no yes for anybody.
  const erase = query(`select p.prosrc ~ 'consent\\s*=\\s*''unknown''' as clears,
                              p.prosrc ~ 'consent\\s*=\\s*''opted_in''' as grants
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'erase_contact'`);
  assert.deepEqual(erase, [{ clears: true, grants: false }]);
  // And the two that do record an answer both refuse a converted lead's in the
  // same words, so an owner reads one sentence whichever of them refused.
  const both = query(`select p.proname as name, position(${sqlLiteral(LEAD_CONSENT_REFUSAL)} in p.prosrc) > 0 as says
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('set_contact_consent', 'set_marketing_consent') order by 1`);
  assert.deepEqual(both, [{ name: "set_contact_consent", says: true }, { name: "set_marketing_consent", says: true }]);
});

/** The sentence as SQL reads it: contracts' words, quoted for the catalog query. */
function sqlLiteral(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

test("ACCEPTANCE: no member policy lets anyone write a contact's row directly", { skip }, () => {
  const rows = query(`select cmd, roles::text as roles from pg_policies
     where schemaname = 'public' and tablename = 'contacts' and cmd in ('UPDATE', 'ALL', 'INSERT') order by 1`);
  assert.deepEqual(rows.filter((r) => r.roles.includes("authenticated")), []);
});
```

- [ ] **Step 3: Run them and see them fail.** With the local stack up (`supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector`, then `SUPABASE_URL=http://127.0.0.1:54321` and the keys from `supabase status -o env`):

```sh
node --conditions=react-server --import tsx --test tooling/scripts/tests/leads.db.test.mjs
node --conditions=react-server --import tsx --test tooling/scripts/tests/consent-paths.db.test.mjs
```

`leads.db.test.mjs`: 15 tests, 0 pass, 15 fail — the first is `Could not find the function public.lead_set_stage(p_fit_reason, p_lead_id, p_note, p_outcome, p_reason, p_stage) in the schema cache`, because no door of that name exists yet. `consent-paths.db.test.mjs`: 5 tests, 1 pass (the direct-update one: RLS already refuses), 4 fail — the first refusal case returns no error at all, so `expected a refusal, got {...}` names it. Without the stack both files skip every test (`# skipped 15` / `# skipped 5`), which is what CI's replay does when it has no database; a skip is not a pass, so the stack has to be up for this step to mean anything.

- [ ] **Step 4: Write the migration.** The whole file, in the order §4.2 lists it. `lead_set_stage`'s body is 4.5's, spelled there branch by branch; it is written here as part of the file.

```sql
-- supabase/migrations/00142_the_leads_are_worked.sql
-- 00142 · The leads are worked.
--
-- Release B's one migration (PRD v3 §9, §0.4, §6.1; the plan is
-- docs/plans/2026-09-19-lead-finder-B-product.md, Task 4.2 and 4.5). 00140
-- found the leads; this file is what an owner does with them afterwards: the
-- stage and the six call outcomes, the draft's "Did you send it?", Not a fit,
-- bulk over a selection or over a view, erase, the export mark, the first
-- day's suggestions, the lists and their counts, the bell's two kinds, and the
-- rule that a converted lead's yes comes only from them, permanently.
--
-- Every door here follows 00140's: SECURITY DEFINER with search_path pinned,
-- auth.uid() read inside (never a parameter, 00021's rule), membership and
-- role checked through the existing helpers (is_acting_member for an
-- operator's act, has_permission for the owner's), a refusal returned as
-- jsonb {error: ...} where the owner will read a sentence and raised only for
-- a caller's bug, execute revoked from public and anon and granted to
-- authenticated. Members read their workspace's rows through row-level
-- security and write nothing directly.
--
-- Two statements here take ACCESS EXCLUSIVE on a table a live workspace is
-- reading -- the CHECK on notifications and the new column on leads -- and
-- both are held until COMMIT while the rest of the file runs. Behind a long
-- read that queues every reader behind us, so the same three-second guard
-- 00140 set is set here, and says so out loud when the file is applied
-- outside a transaction, where SET LOCAL does nothing.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------- 1. columns and sets -- */

-- What the client echoes back to Undo (E9). 00140 gave lead_search_members a
-- version and the leads themselves none, because A's only undo-able acts were
-- Keep, Exclude and Put back, which change a membership. B's acts change the
-- LEAD -- its stage, its closed reason, the wrong number -- so the lead
-- carries the number the page saw, and lead_undo refuses when it moved.
alter table public.leads add column if not exists version integer not null default 1;
comment on column public.leads.version is
  'Bumped by every door that changes this lead. The page sends it back with an Undo and lead_undo refuses when anyone changed the row since (E9).';

-- The lists of the rail are stage lists over the leads a workspace owns, so
-- the stage is read for every one of them.
create index if not exists leads_tenant_stage on public.leads (tenant_id, stage)
  where erased_at is null and blanked_at is null;

-- B's two acts join A's six. Widened with the full list, never an add: the
-- constraint is dropped and re-added, so re-running the file is safe.
alter table public.lead_operations drop constraint if exists lead_operations_kind_check;
alter table public.lead_operations add constraint lead_operations_kind_check
  check (kind in ('undo_search', 'keep', 'exclude', 'put_back', 'include', 'stop', 'stage', 'bulk'));

-- The bell's list as it stands after 00141, plus the finder's two. 00141's own
-- head says it: every widening of this CHECK is drop-and-add with its own full
-- list, so one written from an older list silently removes the newer kinds and
-- recordNotification swallows the insert error.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert','review','billing','template_ready','template_blocked','broadcast_sent','broadcast_stopped','leads_ready','leads_question'));

-- The first day's suggestions (§8.9): one row per workspace, written by the
-- service (server/service.ts saveLeadSuggestions) after a model call, read by
-- every member. A week old and it is asked again; an owner who changes the
-- business line clears the items and the next read asks at once.
create table if not exists public.lead_suggestions (
  tenant_id     uuid primary key references public.tenants (id) on delete cascade,
  business_line text not null check (char_length(business_line) between 3 and 160),
  by_owner      boolean not null default false,
  items         jsonb not null default '[]'::jsonb,
  made_at       timestamptz not null default now()
);
comment on table public.lead_suggestions is
  'The three or four kinds of business worth reaching, written from the workspace''s business line (§8.9). One row per workspace; by_owner says the line is the owner''s own words, not the workspace''s name and services. The service writes it; members read it.';

alter table public.lead_suggestions enable row level security;
drop policy if exists lead_suggestions_member_select on public.lead_suggestions;
create policy lead_suggestions_member_select on public.lead_suggestions
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke insert, update, delete on public.lead_suggestions from anon, authenticated;
revoke all on public.lead_suggestions from anon;

/* ----------------------------------------------------------- 2. helpers -- */

-- Which of the rail's lists a lead is in (§6.1), held in one place because
-- three readers ask it: the page, the counts and bulk over a view. The lists
-- are stages, never classes: class is whether the place met the plan and lives
-- on the membership.
--
-- 'all' is every lead the workspace owns, so an archived lead closed 'stale'
-- or 'search_removed' is in All and in no other list: the five named lists are
-- the five the owner can act on, not a partition.
create or replace function public.lead_in_list(p_stage text, p_closed_reason text, p_list text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(case coalesce(p_list, 'all')
    when 'all'       then true
    when 'ready'     then p_stage = 'ready'
    when 'nurture'   then p_stage = 'nurture'
    when 'converted' then p_stage = 'converted'
    when 'said_no'   then p_stage = 'archived' and p_closed_reason = 'said_no'
    when 'not_a_fit' then p_stage = 'archived' and p_closed_reason in ('not_a_fit', 'customer')
    else false
  end, false)
$$;
comment on function public.lead_in_list(text, text, text) is
  'The rail''s lists as one rule (§6.1): all, ready, nurture (Contacted), converted (Talking), said_no, not_a_fit (which holds "Already a customer" too). leads_page, lead_list_counts and lead_bulk all ask it, so the lists cannot drift apart.';
revoke execute on function public.lead_in_list(text, text, text) from public, anon;
grant execute on function public.lead_in_list(text, text, text) to authenticated, service_role;

/* -------------------------------------------------------- 3. the doors -- */

-- The one door the peek's stage control, the call question, the draft's "Did
-- you send it?" and Not a fit all reach.
--
-- The rule that costs the most to get wrong: a stage click NEVER converts
-- (§9.6). Marking Talking by hand leaves contact_id null and the answer says
-- converted false. A person is made by one act only -- a call marked
-- Interested -- and then by the person whose number this is when the
-- workspace already has them (25): never a second one.
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
  v_user     uuid := auth.uid();
  v_lead     public.leads%rowtype;
  v_before   jsonb;
  v_contact  uuid;
  v_made     jsonb;
  v_existed  boolean := false;
  v_convert  boolean := coalesce(p_outcome = 'interested', false);   -- the one act that makes a person (§9.6)
  v_stage    text;
  v_hash     text;
  v_supp     boolean := false;
  v_op       uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_lead from public.leads where id = p_lead_id;
  -- A stranger learns nothing: not a member reads as not found (00027's rule).
  -- Viewers read only, so they are strangers to this door too.
  if not found or not public.is_acting_member(v_lead.tenant_id) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if v_lead.erased_at is not null or v_lead.blanked_at is not null then
    raise exception 'This lead is gone.' using errcode = 'P0002';
  end if;
  if p_stage is not null and p_stage not in ('ready', 'nurture', 'converted', 'archived') then
    raise exception 'stage must be ready, nurture, converted or archived' using errcode = '22023';
  end if;
  if p_reason is not null and p_reason not in ('said_no', 'not_a_fit', 'customer', 'stale', 'search_removed') then
    raise exception 'reason must be one of the closed reasons' using errcode = '22023';
  end if;
  if p_fit_reason is not null and p_fit_reason not in ('chain', 'wrong_kind', 'too_far', 'customer', 'other') then
    raise exception 'fit_reason must be chain, wrong_kind, too_far, customer or other' using errcode = '22023';
  end if;
  if p_outcome is not null and p_outcome not in ('interested', 'call_back', 'not_interested', 'voicemail', 'no_answer', 'wrong_number', 'emailed') then
    raise exception 'outcome must be one of the six, or emailed' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 280 then
    raise exception 'Note too long.' using errcode = '22023';
  end if;

  v_before := jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                                 'phone_wrong', v_lead.phone_wrong, 'contact_id', v_lead.contact_id);
  v_stage  := case when v_convert then 'converted' else p_stage end;

  if v_convert then
    -- A real conversation. The person whose number this is, else the person
    -- whose address it is, else a new one named for the business.
    if v_lead.contact_id is not null then
      v_contact := v_lead.contact_id;
      v_existed := true;
    elsif v_lead.phone_e164 ~ '^\+[1-9][0-9]{7,14}$' then
      -- create_person is get-or-create by number (00053), so the workspace
      -- never gets a second person for a number it already has (25), and its
      -- contact.added event with source 'lead' is what People reads back as
      -- "A lead you found" (00138).
      v_made    := public.create_person(v_lead.tenant_id, v_lead.phone_e164, left(nullif(v_lead.business_name, ''), 80), 'lead');
      v_contact := (v_made->>'contact_id')::uuid;
      v_existed := coalesce((v_made->>'existed')::boolean, false);
      -- 00125's door adds the address to a person created by phone, but only
      -- when they have none and nobody else here holds it: a unique violation
      -- inside this door would lose the whole act.
      if v_lead.email is not null
         and not exists (select 1 from public.contacts c where c.id = v_contact and c.email is not null)
         and not exists (select 1 from public.contacts c where c.tenant_id = v_lead.tenant_id and c.email = lower(btrim(v_lead.email))) then
        perform public.set_person_email(v_contact, v_lead.email);
      end if;
    else
      -- A lead with no number converts the way an email-only person arrives:
      -- the address is the identity, and the same contact.added event says
      -- where they came from.
      select c.id into v_contact from public.contacts c
       where c.tenant_id = v_lead.tenant_id and c.email = lower(btrim(coalesce(v_lead.email, '')))
         and c.erased_at is null and c.merged_into_contact_id is null
       limit 1;
      v_existed := v_contact is not null;
      if v_contact is null then
        insert into public.contacts (tenant_id, display_name, email)
        values (v_lead.tenant_id, left(nullif(v_lead.business_name, ''), 80), nullif(lower(btrim(coalesce(v_lead.email, ''))), ''))
        returning id into v_contact;
        insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
        values (v_lead.tenant_id, 'contact.added', 'contact', 'contact', v_contact,
                jsonb_build_object('source', 'lead', 'title', null, 'by', v_user));
      end if;
    end if;
  end if;

  -- One statement, so the version moves exactly once however the lead was
  -- worked, and a stage that was not named is kept (wrong_number).
  update public.leads
     set stage         = coalesce(v_stage, stage),
         closed_reason = case when v_stage = 'archived' then p_reason
                              when v_stage is not null then null
                              else closed_reason end,
         phone_wrong   = (phone_wrong or coalesce(p_outcome, '') = 'wrong_number'),
         contact_id    = coalesce(v_contact, contact_id),
         converted_at  = case when v_convert then coalesce(converted_at, now()) else converted_at end,
         contacted_at  = case when coalesce(v_stage, '') in ('nurture', 'converted') then coalesce(contacted_at, now()) else contacted_at end,
         last_outcome  = coalesce(p_outcome, last_outcome),
         last_note     = case when p_outcome is not null then p_note else last_note end,
         version       = version + 1
   where id = p_lead_id
  returning * into v_lead;

  if v_convert then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.converted', 'lead', 'lead', p_lead_id,
            jsonb_build_object('contact_id', v_contact, 'existed', v_existed, 'how', 'call', 'by', v_user));
  end if;

  if p_outcome is not null and p_outcome <> 'emailed' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.call', 'lead', 'lead', p_lead_id,
            jsonb_build_object('outcome', p_outcome, 'note', p_note, 'by', v_user));
  elsif p_outcome = 'emailed' then
    -- S12: what is recorded is that the OWNER said they sent it.
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.emailed', 'lead', 'lead', p_lead_id,
            jsonb_build_object('by', v_user));
  elsif p_reason in ('not_a_fit', 'customer') then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.not_a_fit', 'lead', 'lead', p_lead_id,
            jsonb_build_object('why', p_fit_reason, 'by', v_user));
    -- "Already a customer" hides the place from every future search (§0.4,
    -- S8). The hash is A's keyed digest, so the collect's suppression read
    -- refuses the place byte for byte.
    if p_reason = 'customer' and v_lead.place_id is not null then
      v_hash := public.lead_suppression_hash(v_lead.tenant_id, v_lead.place_id);
      insert into public.lead_suppressions (tenant_id, kind, hash, what)
      values (v_lead.tenant_id, 'place', v_hash, 'customer')
      on conflict (tenant_id, kind, hash) do nothing;
      v_supp := found;
    end if;
  else
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.stage', 'lead', 'lead', p_lead_id,
            jsonb_build_object('stage', v_stage, 'reason', p_reason, 'by', v_user));
  end if;

  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (v_lead.tenant_id, 'stage', null, array[p_lead_id], v_before,
          jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                             'phone_wrong', v_lead.phone_wrong, 'contact_id', v_lead.contact_id,
                             'converted', v_convert, 'suppressed', v_supp, 'place_hash', v_hash),
          v_lead.version, v_user)
  returning id into v_op;

  return jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                            'contact_id', v_lead.contact_id, 'existed', v_existed, 'converted', v_convert,
                            'op_id', v_op, 'version', v_lead.version);
end $$;
comment on function public.lead_set_stage(uuid, text, text, text, text, text) is
  'Operator. The one door for a lead''s stage, its six call outcomes, "Did you send it?" and Not a fit. A click to converted marks Talking and nothing else: contact_id stays null and the answer says converted false (§9.6). Only outcome interested makes a person -- the one whose number this is when the workspace has them, else whose address, else a new one named for the business with source lead -- and links it. wrong_number marks the number and keeps the stage. reason customer hides the place from every future search. Writes one lead_operations row (kind stage) with the lead''s new version.';
revoke execute on function public.lead_set_stage(uuid, text, text, text, text, text) from public, anon;
grant  execute on function public.lead_set_stage(uuid, text, text, text, text, text) to authenticated;


-- Many at once (S13): the ids the owner selected, or every lead the view
-- matches when they chose "Select all 1,240 that match". One or the other,
-- never both, and one operation row so the whole act undoes as one.
create or replace function public.lead_bulk(
  p_tenant_id uuid,
  p_action    text,
  p_ids       uuid[] default null,
  p_view      jsonb  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_ids    uuid[];
  v_stage  text;
  v_reason text;
  v_before jsonb := '{}'::jsonb;
  v_done   integer := 0;
  v_op     uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_action not in ('contacted', 'not_a_fit') then
    raise exception 'action must be contacted or not_a_fit' using errcode = '22023';
  end if;
  if (p_ids is null) = (p_view is null) then
    raise exception 'name the leads, or the view, and not both' using errcode = '22023';
  end if;
  v_stage  := case p_action when 'contacted' then 'nurture' else 'archived' end;
  v_reason := case p_action when 'not_a_fit' then 'not_a_fit' else null end;

  -- The same rows the page would show: the selection, or the view's filters
  -- with no paging. lead_in_list holds the list rule for both.
  if p_ids is not null then
    select coalesce(array_agg(l.id), '{}') into v_ids
      from public.leads l
     where l.tenant_id = p_tenant_id and l.id = any (p_ids)
       and l.erased_at is null and l.blanked_at is null;
  else
    select coalesce(array_agg(distinct m.lead_id), '{}') into v_ids
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.tenant_id = p_tenant_id
       and (p_view->>'search' is null or m.search_id = (p_view->>'search')::uuid)
       and m.class = coalesce(p_view->>'class', 'qualified')
       and (m.class <> 'qualified' or m.counted)
       and public.lead_in_list(l.stage, l.closed_reason, coalesce(p_view->>'list', 'all'))
       and m.blanked_at is null and l.blanked_at is null and l.erased_at is null;
  end if;
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return jsonb_build_object('done', 0, 'op_id', null, 'version', 1);
  end if;

  -- What each row was, read before anything is written, with the version this
  -- act will leave it at: Undo restores only the rows nobody touched since.
  select coalesce(jsonb_object_agg(l.id::text, jsonb_build_object(
           'stage', l.stage, 'closed_reason', l.closed_reason, 'seen', l.version + 1)), '{}'::jsonb)
    into v_before
    from public.leads l
   where l.tenant_id = p_tenant_id and l.id = any (v_ids);

  update public.leads l
     set stage         = v_stage,
         closed_reason = case when v_stage = 'archived' then v_reason else null end,
         contacted_at  = case when v_stage = 'nurture' then coalesce(l.contacted_at, now()) else l.contacted_at end,
         version       = l.version + 1
   where l.tenant_id = p_tenant_id and l.id = any (v_ids);
  get diagnostics v_done = row_count;

  -- One event for the act, not one per lead: the operation row holds the ids,
  -- and an activity log with 1,240 rows in it says nothing.
  if p_action = 'not_a_fit' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.not_a_fit', 'lead', 'lead', null,
            jsonb_build_object('why', null, 'count', v_done, 'bulk', true, 'by', v_user));
  else
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.stage', 'lead', 'lead', null,
            jsonb_build_object('stage', v_stage, 'reason', v_reason, 'count', v_done, 'bulk', true, 'by', v_user));
  end if;

  -- version 1: a bulk row names no single lead, so the operation is guarded by
  -- undone_at and each lead by the version in `before`.
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (p_tenant_id, 'bulk', null, v_ids, v_before,
          jsonb_build_object('action', p_action, 'done', v_done), 1, v_user)
  returning id into v_op;
  return jsonb_build_object('done', v_done, 'op_id', v_op, 'version', 1);
end $$;
comment on function public.lead_bulk(uuid, text, uuid[], jsonb) is
  'Operator. Marks many leads contacted, or not a fit: the ids the owner selected, or every lead the view matches (the same filters leads_page reads, with no paging), never both. One lead_operations row (kind bulk) holds every id with what it was and the version this act leaves it at, so lead_undo restores the rows nobody touched since and says how many it kept. Returns {done, op_id, version}.';
revoke execute on function public.lead_bulk(uuid, text, uuid[], jsonb) from public, anon;
grant  execute on function public.lead_bulk(uuid, text, uuid[], jsonb) to authenticated;

-- Erase one lead, for good (§0.4). The owner's alone, like erasing a person:
-- an operator who can work a lead must not be able to delete it.
create or replace function public.lead_erase(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_lead public.leads%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found or not exists (select 1 from public.memberships m where m.tenant_id = v_lead.tenant_id and m.user_id = v_user) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.memberships m where m.tenant_id = v_lead.tenant_id and m.user_id = v_user and m.role = 'owner') then
    raise exception 'Only an owner can erase a lead.' using errcode = '42501';
  end if;
  if v_lead.erased_at is not null then
    -- Idempotent: a second request is answered, not re-executed.
    return jsonb_build_object('erased', true, 'already', true);
  end if;
  -- The tombstones first, exactly as an erased person''s leads are hashed
  -- (00140 leads_erase_on_contact), so no search ever finds this place, this
  -- number or this address again (§0.4).
  if v_lead.place_id is not null then
    insert into public.lead_suppressions (tenant_id, kind, hash, what)
    values (v_lead.tenant_id, 'place', public.lead_suppression_hash(v_lead.tenant_id, v_lead.place_id), 'erased')
    on conflict (tenant_id, kind, hash) do nothing;
  end if;
  if v_lead.phone_e164 is not null then
    insert into public.lead_suppressions (tenant_id, kind, hash, what)
    values (v_lead.tenant_id, 'phone', public.lead_suppression_hash(v_lead.tenant_id, v_lead.phone_e164), 'erased')
    on conflict (tenant_id, kind, hash) do nothing;
  end if;
  if v_lead.email is not null then
    insert into public.lead_suppressions (tenant_id, kind, hash, what)
    values (v_lead.tenant_id, 'email', public.lead_suppression_hash(v_lead.tenant_id, v_lead.email), 'erased')
    on conflict (tenant_id, kind, hash) do nothing;
  end if;
  perform public.lead_blank(p_lead_id);
  update public.leads set erased_at = now(), version = version + 1 where id = p_lead_id;
  -- No operation row: this one is final.
  return jsonb_build_object('erased', true, 'already', false);
end $$;
comment on function public.lead_erase(uuid) is
  'Owner. Erases one lead for good: the place, the number and the address are hashed onto lead_suppressions as erased first, so no search finds them again (§0.4), then lead_blank takes everything that names or reaches the place and erased_at is set. No operation row, because nothing undoes it. Idempotent.';
revoke execute on function public.lead_erase(uuid) from public, anon;
grant  execute on function public.lead_erase(uuid) to authenticated;

-- The export mark (E9): a lead that has left the building keeps its charge,
-- and a removed search that is undone leaves it alone (lead_undo reads
-- exported_at). The route calls this after the file is built.
create or replace function public.lead_export_mark(p_tenant_id uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_n    integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(v_user, p_tenant_id, 'export') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  update public.leads
     set exported_at = now()
   where tenant_id = p_tenant_id and id = any (coalesce(p_ids, '{}'::uuid[]))
     and exported_at is null and erased_at is null and blanked_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
comment on function public.lead_export_mark(uuid, uuid[]) is
  'Owner (permission export). Stamps exported_at on the leads a download took, once each, and answers how many it marked. An exported lead keeps its charge when a removed search is undone (E9).';
revoke execute on function public.lead_export_mark(uuid, uuid[]) from public, anon;
grant  execute on function public.lead_export_mark(uuid, uuid[]) to authenticated;

-- The Done strip's Undo (PRD v3 §8.6, E9, S11). A round that has just ended
-- delivered leads and charged the month for them; for twenty-four hours the
-- owner may take that back: every lead of that round NOBODY HAS TOUCHED leaves
-- the search, and the ones that counted go back to the allowance of the month
-- they counted in, never to the searching budget (S11).
--
-- Touched is read off the work itself, never off a flag: the stage moved, a
-- person was made, the owner recorded a call or said they sent an email, a
-- number was marked wrong, or the membership was kept, put back or excluded by
-- hand. A lead exported or copied has left the building, so it is removed from
-- the search but keeps its charge (§0.2).
--
-- The act writes one undo_search operation, so the toast's own Undo puts it
-- back through lead_undo like every other act, and lead_searches_view names it
-- for as long as it can be pressed.
create or replace function public.lead_search_undo(p_search_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  s          public.lead_searches;
  r          public.lead_rounds;
  v_ids      uuid[] := '{}';
  v_credit   jsonb := '{}'::jsonb;
  v_counter  public.lead_counters;
  v_removed  integer := 0;
  v_credited integer := 0;
  v_op       uuid;
  rec        record;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into s from public.lead_searches where id = p_search_id for update;
  -- The owner's alone (permission find): it gives leads back to the month, and
  -- only the person who spends them may.
  if not found or not public.has_permission(v_user, s.tenant_id, 'find') then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  if s.removed_at is not null then
    return jsonb_build_object('error', 'removed');
  end if;
  select * into r from public.lead_rounds where search_id = p_search_id order by seq desc limit 1;
  if not found or r.state <> 'ended' then
    return jsonb_build_object('error', 'running');
  end if;
  if r.ended_at is null or r.ended_at < now() - interval '24 hours' then
    return jsonb_build_object('error', 'too_late');
  end if;

  for rec in
    select m.id as member_id, m.lead_id, m.counted, m.counted_month, l.exported_at
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.search_id = p_search_id and m.round_id = r.id and m.blanked_at is null
       and l.erased_at is null and l.blanked_at is null
       -- untouched, read off the work
       and l.stage = 'ready' and l.contact_id is null and l.contacted_at is null
       and l.last_outcome is null and not l.phone_wrong
       and m.kept_at is null and coalesce(m.excluded_by, '') <> 'owner'
     for update of m
  loop
    if rec.counted and rec.exported_at is null then
      v_counter := public.lead_counter_take(s.tenant_id, 'allowance', rec.counted_month);
      update public.lead_counters set used = greatest(used - 1, 0), updated_at = now() where id = v_counter.id;
      v_credit   := v_credit || jsonb_build_object(rec.lead_id::text, rec.counted_month);
      v_credited := v_credited + 1;
      update public.lead_search_members
         set blanked_at = now(), counted = false, counted_month = null, version = version + 1
       where id = rec.member_id;
    else
      -- Exported, or never counted: it leaves the search and keeps its charge.
      update public.lead_search_members set blanked_at = now(), version = version + 1 where id = rec.member_id;
    end if;
    v_ids     := array_append(v_ids, rec.lead_id);
    v_removed := v_removed + 1;
  end loop;

  if v_removed = 0 then
    -- Everything here has been worked: there is nothing to give back, and an
    -- operation row with no leads in it is nothing to undo.
    return jsonb_build_object('removed', 0, 'credited', 0, 'op_id', null, 'version', 1);
  end if;
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (s.tenant_id, 'undo_search', p_search_id, v_ids,
          jsonb_build_object('removed_at', null, 'credited', v_credit),
          jsonb_build_object('round_id', r.id, 'removed', v_removed, 'credited', v_credited), 1, v_user)
  returning id into v_op;
  return jsonb_build_object('removed', v_removed, 'credited', v_credited, 'op_id', v_op, 'version', 1);
end $$;
comment on function public.lead_search_undo(uuid) is
  'Owner (permission find). The Done strip''s Undo, for twenty-four hours after a round ends (§8.6): every lead of that round nobody has touched leaves the search, and the ones that counted go back to the allowance of the month they counted in (S11), except a lead exported or copied, which leaves but keeps its charge (§0.2). Touched is read off the work: the stage moved, a person was made, a call or an email was recorded, a number was marked wrong, or the membership was kept, put back or excluded by hand. Writes one undo_search operation so the toast can put it back through lead_undo. {error: removed | running | too_late} when it cannot.';
revoke execute on function public.lead_search_undo(uuid) from public, anon;
grant  execute on function public.lead_search_undo(uuid) to authenticated;

/* ---------------------------------------------------------- 4. reads --- */

-- A's page with the rail's list, a direction and the three column sorts
-- added, and the columns the peek reads (the judgment, the other addresses,
-- the duplicate listings, the version the page sends back with an Undo).
--
-- The argument list grows, so the old function is DROPPED and written again:
-- a create-or-replace with more parameters leaves both, and a call naming
-- A's six resolves to neither ("function is not unique"). Every A caller
-- names its arguments, so they all resolve to this one, defaults filling the
-- rest (the same move 00140 made for lead_reserve).
drop function if exists public.leads_page(uuid, uuid, text, text, text, integer);
create or replace function public.leads_page(
  p_tenant_id uuid,
  p_search_id uuid    default null,
  p_class     text    default 'qualified',
  p_sort      text    default 'found',
  p_after_key text    default null,
  p_limit     integer default 200,
  p_list      text    default 'all',
  p_dir       text    default 'asc',
  p_after_id  uuid    default null
)
returns table (
  member_id uuid, lead_id uuid, place_id text, search_id uuid, round_id uuid, class text, excluded_by text, fit text, reason text, distance_m integer,
  counted boolean, counted_month text, judgment jsonb, shares jsonb,
  business_name text, category text, street text, city text, region text, postal_code text, lat double precision, lng double precision,
  website_host text, instagram_url text, phone_e164 text, phone_sources smallint, phone_wrong boolean, email text, email_alternates jsonb,
  email_state text, email_checked_at timestamptz, rating numeric, reviews integer, stage text, closed_reason text, last_outcome text, last_note text,
  contact_id uuid, contacted_at timestamptz, converted_at timestamptz, exported_at timestamptz, found_at timestamptz,
  places integer, version integer, page_key text, sort_key text
)
language sql
stable
security invoker
set search_path = public
as $$
  with args as (
    select coalesce(p_dir, 'asc') = 'desc' as descending,
           case when p_after_id is not null then p_after_key else split_part(coalesce(p_after_key, ''), '|', 1) end as after_k,
           coalesce(p_after_id::text, nullif(split_part(coalesce(p_after_key, ''), '|', 2), '')) as after_id
  ),
  base as (
    select m.id as member_id, m.lead_id, l.place_id, m.search_id, m.round_id, m.class, m.excluded_by, m.fit, m.reason, m.distance_m,
           m.counted, m.counted_month, m.judgment, coalesce(m.judgment->'shares', '[]'::jsonb) as shares,
           l.business_name, l.category, l.street, l.city, l.region, l.postal_code, l.lat, l.lng, l.website_host, l.instagram_url,
           l.phone_e164, l.phone_sources, l.phone_wrong, l.email, l.email_alternates, l.email_state, l.email_checked_at, l.rating, l.reviews,
           l.stage, l.closed_reason, l.last_outcome, l.last_note, l.contact_id, l.contacted_at, l.converted_at, l.exported_at, l.found_at,
           (select count(*)::integer from public.lead_places p where p.lead_id = l.id) as places, l.version,
           case coalesce(p_sort, 'found')
             when 'fit' then (case m.fit when 'strong' then '0' when 'look' then '1' when 'long' then '2' else '3' end)
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             when 'distance' then lpad(coalesce(m.distance_m, 999999999)::text, 9, '0')
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             -- The three column sorts B adds. A key is text and never holds
             -- the "|" the packed key splits on.
             when 'business' then left(replace(lower(coalesce(nullif(l.business_name, ''), 'zzzz')), '|', ' '), 60)
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             when 'rating' then lpad(coalesce((l.rating * 10)::integer, 0)::text, 3, '0')
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             when 'stage' then (case l.stage when 'ready' then '0' when 'nurture' then '1' when 'converted' then '2' else '3' end)
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             else lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
           end as k
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.tenant_id = p_tenant_id
       and (p_search_id is null or m.search_id = p_search_id)
       and m.class = coalesce(p_class, 'qualified')
       and (m.class <> 'qualified' or m.counted)
       and public.lead_in_list(l.stage, l.closed_reason, coalesce(p_list, 'all'))
       and m.blanked_at is null and l.blanked_at is null and l.erased_at is null
  )
  select b.member_id, b.lead_id, b.place_id, b.search_id, b.round_id, b.class, b.excluded_by, b.fit, b.reason, b.distance_m,
         b.counted, b.counted_month, b.judgment, b.shares,
         b.business_name, b.category, b.street, b.city, b.region, b.postal_code, b.lat, b.lng, b.website_host, b.instagram_url,
         b.phone_e164, b.phone_sources, b.phone_wrong, b.email, b.email_alternates, b.email_state, b.email_checked_at, b.rating, b.reviews,
         b.stage, b.closed_reason, b.last_outcome, b.last_note, b.contact_id, b.contacted_at, b.converted_at, b.exported_at, b.found_at,
         b.places, b.version,
         b.k as page_key,
         b.k || '|' || b.member_id::text as sort_key
    from base b, args a
   where p_after_key is null
      or (a.descending and (b.k, b.member_id::text) < (a.after_k, a.after_id))
      or (not a.descending and (b.k, b.member_id::text) > (a.after_k, a.after_id))
   -- One query, two directions: the pair that is not this call's is a constant
   -- null for every row and sorts nothing.
   order by (case when a.descending then b.k end) desc, (case when a.descending then b.member_id::text end) desc,
            (case when not a.descending then b.k end) asc, (case when not a.descending then b.member_id::text end) asc
   limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;
comment on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid) is
  'A page of members of one class (qualified: the counted ones; review; excluded) joined to their leads, narrowed to one of the rail''s lists (lead_in_list), keyset-paged on the sort key in either direction, under the caller''s row security. Six sorts: found, fit, distance, business, rating, stage. Hand the last row''s page_key and member_id back as p_after_key and p_after_id; A''s packed sort_key still works on its own, split here, so a caller that names only A''s six arguments pages exactly as it did.';
revoke execute on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid) from public, anon;
grant execute on function public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid) to authenticated, service_role;

-- The rail's numbers (§6.1). A lead found by two searches is one lead here.
create or replace function public.lead_list_counts(p_tenant_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with mine as (
    select distinct l.id, l.stage, l.closed_reason
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.tenant_id = p_tenant_id and m.class = 'qualified' and m.counted
       and m.blanked_at is null and l.blanked_at is null and l.erased_at is null
  )
  select jsonb_build_object(
    'all',       count(*),
    'ready',     count(*) filter (where public.lead_in_list(stage, closed_reason, 'ready')),
    'nurture',   count(*) filter (where public.lead_in_list(stage, closed_reason, 'nurture')),
    'converted', count(*) filter (where public.lead_in_list(stage, closed_reason, 'converted')),
    'said_no',   count(*) filter (where public.lead_in_list(stage, closed_reason, 'said_no')),
    'not_a_fit', count(*) filter (where public.lead_in_list(stage, closed_reason, 'not_a_fit'))
  ) from mine
$$;
comment on function public.lead_list_counts(uuid) is
  'The six numbers under Leads in the rail: every lead the workspace owns (a qualified membership that counted, not blanked, not erased) and the five stage lists over them, counted once per lead however many searches found it. Never over an erased or blanked row. all is the total, not the sum: a lead closed stale or search_removed is in All and in no other list.';
revoke execute on function public.lead_list_counts(uuid) from public, anon;
grant execute on function public.lead_list_counts(uuid) to authenticated, service_role;

-- A's view with the round's ending time, how many of its leads can be emailed
-- and called, and the operation a finished search's Undo names while its
-- twenty-four hours run. Dropped and written again rather than replaced: a
-- create-or-replace may only add columns at the end, and the round's own
-- columns belong together.
drop view if exists public.lead_searches_view;
create view public.lead_searches_view with (security_invoker = true) as
select s.id, s.tenant_id, s.created_by, s.via, s.card, s.name, s.asked, s.plan, s.removed_at, s.created_at,
       r.id as round_id, r.seq, r.purpose, r.state, r.ending, r.ending_pending, r.question, r.answered, r.target,
       r.plan_version, r.judge_tokens, r.cost_usd, r.waiting_since, r.ended_at,
       coalesce(c.qualified, 0) as qualified, coalesce(c.review, 0) as review, coalesce(c.excluded, 0) as excluded,
       coalesce(c.counted, 0) as counted, coalesce(c.emails_checked, 0) as emails_checked, coalesce(c.with_phone, 0) as with_phone,
       u.id as undo_op_id, u.version as undo_version
  from public.lead_searches s
  left join lateral (
    select r.id, r.seq, r.purpose, r.state, r.ending, r.ending_pending, r.question, r.answered, r.target,
           r.plan_version, r.judge_tokens, r.cost_usd, r.waiting_since, r.ended_at
      from public.lead_rounds r where r.search_id = s.id order by r.seq desc limit 1
  ) r on true
  left join lateral (
    select count(*) filter (where m.class = 'qualified' and m.blanked_at is null) as qualified,
           count(*) filter (where m.class = 'review' and m.blanked_at is null)    as review,
           count(*) filter (where m.class = 'excluded')                           as excluded,
           count(*) filter (where m.counted)                                      as counted,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and l.email_state = 'ok')  as emails_checked,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and l.phone_e164 is not null and not l.phone_wrong) as with_phone
      from public.lead_search_members m join public.leads l on l.id = m.lead_id where m.search_id = s.id
  ) c on true
  left join lateral (
    select o.id, o.version from public.lead_operations o
     where o.search_id = s.id and o.kind = 'undo_search' and o.undone_at is null and o.at > now() - interval '24 hours'
     order by o.at desc limit 1
  ) u on true;
comment on view public.lead_searches_view is
  'Every column of lead_searches with its latest round (round_id, seq, purpose, state, ending, ending_pending, question, answered, target, plan_version, judge_tokens, cost_usd -- what that round has spent, so cost per Qualified lead is read from here -- waiting_since and ended_at) and its counts over the members: qualified, review, excluded, counted, emails_checked (a qualified lead whose address was checked and answered) and with_phone (a qualified lead with a number nobody has marked wrong). Excluded members stay counted after their details are blanked, so "40 left out" stays 40. undo_op_id and undo_version name the operation this search''s Undo takes while its twenty-four hours run, and are null once it is undone or the day is out.';
revoke all on public.lead_searches_view from public, anon;
grant select on public.lead_searches_view to authenticated, service_role;

/* --------------------------------------------------------- 5. the undo -- */

-- A's door with B's two kinds. Everything above the branches is A's, word for
-- word; the keep/exclude/put_back/include and undo_search branches are A's
-- unchanged.
create or replace function public.lead_undo(p_op_id uuid, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  op        public.lead_operations;
  m         public.lead_search_members;
  l         public.leads;
  v_counter public.lead_counters;
  v_restored integer := 0;
  v_kept     integer := 0;
  v_recharged integer := 0;
  r          record;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into op from public.lead_operations where id = p_op_id for update;
  if not found or not public.has_permission(v_user, op.tenant_id, 'find') then
    raise exception 'Operation not found.' using errcode = 'P0002';
  end if;
  if op.undone_at is not null then
    return jsonb_build_object('error', 'undone');
  end if;
  if op.version <> p_version then
    return jsonb_build_object('error', 'changed');
  end if;
  if op.kind in ('keep', 'exclude', 'put_back', 'include') then
    select * into m from public.lead_search_members where search_id = op.search_id and lead_id = op.lead_ids[1] for update;
    if not found or m.version <> op.version then
      return jsonb_build_object('error', 'changed');
    end if;
    update public.lead_search_members
       set class = op.before->>'class', excluded_by = op.before->>'excluded_by',
           counted = (op.before->>'counted')::boolean, counted_month = op.before->>'counted_month',
           kept_at = (op.before->>'kept_at')::timestamptz, kept_by = (op.before->>'kept_by')::uuid,
           version = version + 1
     where id = m.id
    returning * into m;
    -- The lead goes back to the allowance of the month it counted in, never
    -- to the budget (S11); a refund after that month credits that month.
    if (op.after->>'counted')::boolean and not (op.before->>'counted')::boolean then
      v_counter := public.lead_counter_take(op.tenant_id, 'allowance', op.after->>'counted_month');
      update public.lead_counters set used = greatest(used - 1, 0), updated_at = now() where id = v_counter.id;
    end if;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'version', m.version);
  end if;
  if op.kind = 'undo_search' then
    -- Two acts write this kind and one branch puts both back: a search that was
    -- removed (lead_search_remove) and a finished round the owner took back
    -- (lead_search_undo). The search comes back with the memberships the act
    -- blanked, except a lead exported or copied since: those are kept as they
    -- are and stay charged (E9).
    update public.lead_searches set removed_at = null where id = op.search_id;
    -- version is qualified on the right: since release B the LEAD has one too,
    -- and an UPDATE ... FROM leads leaves a bare `version` ambiguous (A's line
    -- read `version + 1` and stopped compiling the moment leads.version
    -- existed).
    update public.lead_search_members m2
       set blanked_at = null, version = m2.version + 1
      from public.leads l2
     where m2.search_id = op.search_id and m2.lead_id = l2.id and m2.lead_id = any (op.lead_ids)
       and l2.exported_at is null and l2.blanked_at is null and l2.erased_at is null;
    get diagnostics v_restored = row_count;
    v_kept := coalesce(array_length(op.lead_ids, 1), 0) - v_restored;
    -- And what the act gave back to the month is taken again, lead by lead, in
    -- the month each counted in (S11), and only for the memberships that came
    -- back: one left blanked is exported or was never credited, and either way
    -- it is not charged twice.
    for r in select key, value from jsonb_each_text(coalesce(op.before->'credited', '{}'::jsonb)) loop
      update public.lead_search_members
         set counted = true, counted_month = r.value
       where search_id = op.search_id and lead_id = r.key::uuid and blanked_at is null and not counted;
      if found then
        v_counter := public.lead_counter_take(op.tenant_id, 'allowance', r.value);
        update public.lead_counters set used = used + 1, updated_at = now() where id = v_counter.id;
        v_recharged := v_recharged + 1;
      end if;
    end loop;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'restored', v_restored, 'kept', v_kept, 'recharged', v_recharged);
  end if;
  if op.kind = 'stage' then
    -- A person who was made is never unmade from a toast: the route offers no
    -- Undo after a conversion, and the door refuses one if it is asked.
    if coalesce((op.after->>'converted')::boolean, false) then
      return jsonb_build_object('error', 'person');
    end if;
    select * into l from public.leads where id = op.lead_ids[1] for update;
    if not found or l.erased_at is not null or l.blanked_at is not null or l.version <> op.version then
      return jsonb_build_object('error', 'changed');
    end if;
    update public.leads
       set stage = op.before->>'stage', closed_reason = op.before->>'closed_reason',
           phone_wrong = coalesce((op.before->>'phone_wrong')::boolean, false),
           contact_id = (op.before->>'contact_id')::uuid,
           version = version + 1
     where id = l.id
    returning * into l;
    -- "Already a customer" wrote a suppression; taking the act back takes it
    -- back too. Only the one this act wrote, and only a customer's: an email
    -- opt-out and an erasure are nobody's to lift.
    if coalesce((op.after->>'suppressed')::boolean, false) and op.after->>'place_hash' is not null then
      delete from public.lead_suppressions
       where tenant_id = op.tenant_id and kind = 'place' and what = 'customer' and hash = op.after->>'place_hash';
    end if;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'version', l.version);
  end if;
  if op.kind = 'bulk' then
    for r in select key as lead_id, value as was from jsonb_each(op.before) loop
      update public.leads
         set stage = r.was->>'stage', closed_reason = r.was->>'closed_reason', version = version + 1
       where id = r.lead_id::uuid and version = (r.was->>'seen')::integer
         and erased_at is null and blanked_at is null;
      if found then v_restored := v_restored + 1; else v_kept := v_kept + 1; end if;
    end loop;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'restored', v_restored, 'kept', v_kept);
  end if;
  return jsonb_build_object('error', 'kind');
end $$;
comment on function public.lead_undo(uuid, integer) is
  'Owner. Undoes one operation by its id and the version the client saw: {error: changed} when the operation or any touched row moved since; restores `before`; returns a counted lead to the allowance of the month it counted in, never the budget; a removed search, or a finished round the owner took back, comes back without the leads exported since and takes its credit again; a stage change goes back and takes its "Already a customer" suppression with it, unless it made a person, which is never unmade here; a bulk act restores every row nobody has touched and says how many it kept.';

/* ---------------------------------------------------------- 6. the bell -- */

-- Two kinds on the workspace's bell: a round that stopped to ask, and a
-- search that is done. One row per round per kind, whoever is looking; every
-- member marks their own (00057).
--
-- Nothing rings for the ending 'stopped'. The owner who pressed Stop knows,
-- and removing a search ends its live rounds stopped before the search is
-- marked removed -- so without this, tidying up would tell the workspace the
-- search it just deleted was done.
create or replace function public.lead_rounds_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_n    integer;
begin
  select s.name into v_name from public.lead_searches s where s.id = NEW.search_id;
  if v_name is null then return null; end if;
  if NEW.state = 'waiting_on_owner' and coalesce(OLD.state, '') <> 'waiting_on_owner' then
    insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
    select NEW.tenant_id, 'leads_question', left('Your search for ' || v_name || ' needs you', 200),
           coalesce(NEW.question->>'sentence', ''), 'clients/leads:s-' || NEW.search_id::text, 'lead_round', NEW.id::text
     where not exists (select 1 from public.notifications n
                        where n.tenant_id = NEW.tenant_id and n.kind = 'leads_question' and n.subject_id = NEW.id::text);
  elsif NEW.state = 'ended' and coalesce(OLD.state, '') <> 'ended' and coalesce(NEW.ending, '') <> 'stopped' then
    select count(*)::integer into v_n from public.lead_search_members m
     where m.round_id = NEW.id and m.class = 'qualified' and m.blanked_at is null;
    insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
    select NEW.tenant_id, 'leads_ready', left('Your search for ' || v_name || ' is done', 200),
           case when v_n > 0 then v_n || ' found.' else 'Nothing new was counted.' end,
           'clients/leads:s-' || NEW.search_id::text, 'lead_round', NEW.id::text
     where not exists (select 1 from public.notifications n
                        where n.tenant_id = NEW.tenant_id and n.kind = 'leads_ready' and n.subject_id = NEW.id::text);
  end if;
  return null;
end $$;
drop trigger if exists lead_rounds_notify on public.lead_rounds;
create trigger lead_rounds_notify after update of state on public.lead_rounds
  for each row execute function public.lead_rounds_notify();
comment on function public.lead_rounds_notify() is
  'The bell''s two lead kinds: one leads_question row when a round stops to ask, one leads_ready row when it ends with anything but "stopped", each once per round, each pointing at the search on People. A member''s own read mark is notification_marks'', as for every other kind.';
revoke execute on function public.lead_rounds_notify() from public, anon, authenticated;

/* ------------------------------------------------- 7. the consent doors -- */

-- A converted lead's yes comes only from them, permanently (PRD decision 19).
--
-- Both bodies are 00137's, word for word, with one block added after the
-- erased check. Neither 00043's four-argument set_contact_consent (dropped at
-- 00137:163) nor 00110's six-argument set_marketing_consent (dropped at
-- 00137:43) is re-created: a create-or-replace with those argument lists
-- would bring back an ambiguous overload and PostgREST would refuse every
-- call. The comments, the revokes and the grants are re-stated for the 00137
-- signatures.

create or replace function public.set_marketing_consent(
  p_tenant_id  uuid,
  p_contact_id uuid,
  p_consent    text,
  p_source     text,
  p_note       text default null,
  p_evidence   jsonb default null,
  p_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      public.contacts%rowtype;
  v_msg      public.messages%rowtype;
  v_words    text;
  v_evidence jsonb := p_evidence;
begin
  if p_consent not in ('unknown', 'opted_in', 'opted_out') then
    raise exception 'consent must be unknown, opted_in or opted_out' using errcode = '22023';
  end if;
  if p_source not in ('in_person', 'phone', 'form', 'customer_message', 'operator') then
    raise exception 'source must be in_person, phone, form, customer_message or operator' using errcode = '22023';
  end if;
  -- A yes to offers is written, or it is not a yes to offers (00100).
  if p_consent = 'opted_in' and p_source not in ('form', 'customer_message') then
    raise exception 'a yes to offers must be in writing: a form the customer signed, or their own message' using errcode = '22023';
  end if;
  if p_note is not null and length(p_note) > 200 then
    raise exception 'note is too long' using errcode = '22023';
  end if;

  -- A signed-in caller must be allowed to act in this workspace. No session at
  -- all is the edge, holding the service key, recording what a customer texted.
  if auth.uid() is not null and not public.is_acting_member(p_tenant_id) then
    raise exception 'Not allowed to act in this workspace.' using errcode = '42501';
  end if;

  -- A member's evidence is read from the message they name, never handed in.
  if auth.uid() is not null and p_evidence is not null then
    raise exception 'The evidence is read from their message. Name the message instead.' using errcode = '22023';
  end if;
  if p_message_id is not null and p_source <> 'customer_message' then
    raise exception 'Only an answer in their own message names a message.' using errcode = '22023';
  end if;
  if auth.uid() is not null and p_source = 'customer_message' and p_message_id is null then
    raise exception 'Choose the message where they said it. If they wrote to you somewhere Chanlytics doesn''t see, record a sign-up form and say where in the note.' using errcode = '22023';
  end if;

  select * into v_row from public.contacts
   where id = p_contact_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'no such contact' using errcode = 'P0002';
  end if;
  if v_row.erased_at is not null then
    raise exception 'that person has been erased' using errcode = '42501';
  end if;

  -- A converted lead's yes comes only from them (PRD decision 19; permanent,
  -- replacing v2's 90 days). A signed-in caller may record a no, or unknown,
  -- for a person a lead is linked to; never a yes, whatever the source, and
  -- however the message is named. The edge (no session) records what they
  -- texted; the yes page records what they chose. The sentence is contracts'
  -- LEAD_CONSENT_REFUSAL; consent-paths.db.test.mjs holds the two doors equal.
  if auth.uid() is not null and p_consent = 'opted_in'
     and exists (select 1 from public.leads l where l.contact_id = p_contact_id and l.tenant_id = p_tenant_id) then
    raise exception 'This person came from a lead you found. A yes has to come from them: their own message, or your yes page.' using errcode = '42501';
  end if;

  -- The message, read here: theirs, to this workspace, on a written wire. A
  -- call's note is the system's, and a reply is ours.
  if p_message_id is not null then
    select m.* into v_msg
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     where m.id = p_message_id
       and m.tenant_id = p_tenant_id
       and c.tenant_id = p_tenant_id
       and c.contact_id = p_contact_id
       and m.direction = 'inbound'
       and m.sender = 'customer'
       and m.channel not in ('voice', 'system');
    if not found then
      raise exception 'That isn''t a message this person sent you. Choose one of theirs.' using errcode = '22023';
    end if;
    v_words := coalesce(
      nullif(btrim(regexp_replace(coalesce(v_msg.body, ''), '\s+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(coalesce(v_msg.media->>'caption', ''), '\s+', ' ', 'g')), ''));
    if v_words is null then
      raise exception 'That message has no words in it to show their answer. Choose the one where they said it.' using errcode = '22023';
    end if;
    v_evidence := jsonb_build_object(
      'message_id', v_msg.id,
      'channel', v_msg.channel,
      'message_external_id', case when v_msg.external_id like 'backfill:%' then null else v_msg.external_id end,
      'words', left(v_words, 80));
  end if;

  -- `dnc` is deliberately NOT touched (00095): declining offers is not a
  -- request to stop hearing about your own appointment.
  update public.contacts
     set marketing_consent            = p_consent,
         marketing_consent_source     = p_source,
         marketing_consent_updated_at = now()
   where id = p_contact_id and tenant_id = p_tenant_id
  returning * into v_row;

  -- The same ledger the conversational answer writes to, with the purpose named.
  -- Consent events are never purged (00038).
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
          jsonb_build_object('purpose', 'marketing', 'consent', p_consent, 'source', p_source, 'note', p_note)
          || coalesce(v_evidence, '{}'::jsonb));

  return jsonb_build_object(
    'marketing_consent', v_row.marketing_consent,
    'marketing_consent_source', v_row.marketing_consent_source,
    'marketing_consent_updated_at', v_row.marketing_consent_updated_at
  );
end $$;

comment on function public.set_marketing_consent(uuid, uuid, text, text, text, jsonb, uuid) is
  'Records a person''s answer about OFFERS, separately from their answer about conversation and appointments. A yes must be written (form or their own message), and never for a person a lead you found is linked to: theirs comes from their own message through the edge, or the yes page (decision 19). A signed-in member''s "their own message" names the inbound message it was given in (p_message_id), and the event keeps that message''s id, wire, provider id and words; p_evidence is the edge''s alone, for an answer the customer texted. Never touches dnc.';

revoke execute on function public.set_marketing_consent(uuid, uuid, text, text, text, jsonb, uuid) from public, anon;
grant  execute on function public.set_marketing_consent(uuid, uuid, text, text, text, jsonb, uuid) to authenticated, service_role;

create or replace function public.set_contact_consent(
  p_contact_id uuid,
  p_consent    text,
  p_source     text,
  p_note       text default null,
  p_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_tenant   uuid;
  v_erased   timestamptz;
  v_before   text;
  v_dnc      boolean;
  v_msg      public.messages%rowtype;
  v_words    text;
  v_evidence jsonb;
begin
  -- The caller is auth.uid(), read HERE, never a parameter (00021's rule).
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_consent is null or p_consent not in ('opted_in', 'opted_out', 'unknown') then
    raise exception 'Consent must be opted_in, opted_out or unknown.' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('in_person', 'phone', 'form', 'customer_message', 'operator') then
    raise exception 'Source must say how the answer was given.' using errcode = '22023';
  end if;
  if p_note is not null and length(p_note) > 200 then
    raise exception 'Note too long.' using errcode = '22023';
  end if;
  if p_message_id is not null and p_source <> 'customer_message' then
    raise exception 'Only an answer in their own message names a message.' using errcode = '22023';
  end if;
  if p_source = 'customer_message' and p_message_id is null then
    raise exception 'Choose the message where they said it. If they wrote to you somewhere Chanlytics doesn''t see, record a sign-up form and say where in the note.' using errcode = '22023';
  end if;

  select c.tenant_id, c.erased_at, c.consent into v_tenant, v_erased, v_before
    from contacts c where c.id = p_contact_id;
  -- A stranger learns nothing: not a member reads as not found (00027's
  -- rule). Viewers read only, so they are strangers to this door too.
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;
  if v_erased is not null then
    raise exception 'This person was deleted.' using errcode = 'P0002';
  end if;

  -- A converted lead's yes comes only from them (PRD decision 19; permanent,
  -- replacing v2's 90 days). A signed-in caller may record a no, or unknown,
  -- for a person a lead is linked to; never a yes, whatever the source, and
  -- however the message is named. The edge (no session) records what they
  -- texted; the yes page records what they chose. The sentence is contracts'
  -- LEAD_CONSENT_REFUSAL; consent-paths.db.test.mjs holds the two doors equal.
  if p_consent = 'opted_in'
     and exists (select 1 from public.leads l where l.contact_id = p_contact_id and l.tenant_id = v_tenant) then
    raise exception 'This person came from a lead you found. A yes has to come from them: their own message, or your yes page.' using errcode = '42501';
  end if;

  -- The message, read here, as the offers door reads it.
  if p_message_id is not null then
    select m.* into v_msg
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     where m.id = p_message_id
       and m.tenant_id = v_tenant
       and c.tenant_id = v_tenant
       and c.contact_id = p_contact_id
       and m.direction = 'inbound'
       and m.sender = 'customer'
       and m.channel not in ('voice', 'system');
    if not found then
      raise exception 'That isn''t a message this person sent you. Choose one of theirs.' using errcode = '22023';
    end if;
    v_words := coalesce(
      nullif(btrim(regexp_replace(coalesce(v_msg.body, ''), '\s+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(coalesce(v_msg.media->>'caption', ''), '\s+', ' ', 'g')), ''));
    if v_words is null then
      raise exception 'That message has no words in it to show their answer. Choose the one where they said it.' using errcode = '22023';
    end if;
    v_evidence := jsonb_build_object(
      'message_id', v_msg.id,
      'channel', v_msg.channel,
      'message_external_id', case when v_msg.external_id like 'backfill:%' then null else v_msg.external_id end,
      'words', left(v_words, 80));
  end if;

  -- dnc follows the answer the way the ingest sets it: a no is a no on every
  -- channel, and a yes or a reset lifts the operator's own block.
  v_dnc := (p_consent = 'opted_out');
  update contacts
     set consent = p_consent, dnc = v_dnc,
         consent_source = p_source, consent_updated_at = now()
   where id = p_contact_id;

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
          jsonb_build_object('consent', p_consent, 'source', p_source, 'previous', v_before,
                             'by', v_user, 'note', p_note)
          || coalesce(v_evidence, '{}'::jsonb));

  return jsonb_build_object(
    'contact_id', p_contact_id, 'consent', p_consent, 'dnc', v_dnc,
    'source', p_source, 'previous', v_before, 'updated_at', now());
end $$;

comment on function public.set_contact_consent(uuid, text, text, text, uuid) is
  'Owner or operator records a customer''s answer about messages on their own visit (not offers, which are set_marketing_consent''s since 00095): consent, dnc and the source together, plus the contact.consent_changed event. Never a yes for a person a lead you found is linked to: theirs comes from their own message through the edge, or the yes page (decision 19). "Their own message" names the inbound message it was given in (p_message_id), and the event keeps that message''s id, wire, provider id and words. The ledger row is the route''s.';

revoke execute on function public.set_contact_consent(uuid, text, text, text, uuid) from public, anon;
grant  execute on function public.set_contact_consent(uuid, text, text, text, uuid) to authenticated;
```

- [ ] **Step 5: The lists the widened CHECKs are held to.** Four edits by hand, then two regenerations. Each `old` below occurs exactly once on main.

`packages/contracts/src/lead-search.ts` — `schema-sets.ts:122` holds this list `Exactly` equal to `lead_operations.kind`, so it moves with the constraint:

old
```ts
export const LEAD_OPERATION_KINDS = ["undo_search", "keep", "exclude", "put_back", "include", "stop"] as const;
```
new
```ts
/** A's six, and release B's two: a lead's stage, and many at once. */
export const LEAD_OPERATION_KINDS = ["undo_search", "keep", "exclude", "put_back", "include", "stop", "stage", "bulk"] as const;
```

`packages/contracts/src/notifications.ts` — the bell's kinds, held `Exactly` equal to `notifications.kind` by `schema-sets.ts:90`:

old
```ts
export const SERVER_NOTIFICATION_KINDS = ["handoff", "deadman", "call", "number", "sweep", "job_failed", "playbook", "calendar_people", "alert", "review", "billing", "template_ready", "template_blocked", "broadcast_sent", "broadcast_stopped"] as const;
```
new
```ts
export const SERVER_NOTIFICATION_KINDS = ["handoff", "deadman", "call", "number", "sweep", "job_failed", "playbook", "calendar_people", "alert", "review", "billing", "template_ready", "template_blocked", "broadcast_sent", "broadcast_stopped", "leads_ready", "leads_question"] as const;
```

and how the two read, in `SERVER_LOOK`, with the icons kinds already on the bell draw (`calendar_people`'s `users`, `handoff`'s `alert`):

old
```ts
  calendar_people: { icon: "users", tone: "ok", action: "Open People", to: "clients" },
```
new
```ts
  calendar_people: { icon: "users", tone: "ok", action: "Open People", to: "clients" },
  /** A search that finished: good news, on the page the leads are on. */
  leads_ready: { icon: "users", tone: "ok", action: "Open Leads", to: "clients/leads" },
  /** A round that stopped to ask. It waits a day and then ends, so it is a warning. */
  leads_question: { icon: "alert", tone: "warn", action: "Answer it", to: "clients/leads" },
```

`packages/contracts/src/enums.ts` — the five kinds the migration writes, each as the first dotted literal of its own `insert into events` (`event-kinds.test.mjs:38–43` reads them that way):

old
```ts
  /** An ask no source card fits, logged as demand (§0.3): the words asked, never a place. */
  "lead.no_card",
] as const;
```
new
```ts
  /** An ask no source card fits, logged as demand (§0.3): the words asked, never a place. */
  "lead.no_card",
  /** A lead worked: its stage moved, the owner said they sent the email, a call happened, it became a person, or it was not a fit (release B). */
  "lead.stage",
  "lead.emailed",
  "lead.call",
  "lead.converted",
  "lead.not_a_fit",
] as const;
```

Then, with the stack up and the migration applied to it (`corepack pnpm exec supabase db reset` is never run here; `supabase migration up --local` applies only what is new):

```sh
corepack pnpm gen:schema-sets
corepack pnpm gen:db-types && corepack pnpm check:db-types
```

`schema-sets.generated.ts` gains exactly two changed lines — `"lead_operations.kind"` grows by `"stage", "bulk"` and `"notifications.kind"` by `"leads_ready", "leads_question"` — plus `"leads.version"`'s absence (an integer column has no CHECK, so it appears nowhere). `database.types.ts` gains `lead_suggestions`, the new `leads_page` argument and return columns, `lead_list_counts`, `lead_set_stage`, `lead_bulk`, `lead_erase`, `lead_export_mark`, and `lead_searches_view`'s six new columns. Read the diff: nothing else may move.

- [ ] **Step 6: Run and see them pass.**

```sh
node --conditions=react-server --import tsx --test tooling/scripts/tests/leads.db.test.mjs
node --conditions=react-server --import tsx --test tooling/scripts/tests/consent-paths.db.test.mjs
node --conditions=react-server --import tsx --test tooling/scripts/tests/event-kinds.test.mjs tooling/scripts/tests/migrations.test.mjs tooling/scripts/tests/lead-engine.db.test.mjs
```

`leads.db.test.mjs` 15/15, `consent-paths.db.test.mjs` 5/5. `event-kinds.test.mjs` passes only once the five kinds are in `EVENT_KINDS` (it fails both ways: an emitted kind nobody declared, and a declared kind nobody writes). `lead-engine.db.test.mjs` is release A's and must stay green: it calls `leads_page` with A's six named arguments and pages on the packed `sort_key`, both of which this migration keeps working on purpose.

- [ ] **Step 7: Commit** — "A lead is worked through its doors: stages, calls, drafts, bulk, erase and export, and a converted lead's yes comes only from them". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

```
A lead is worked through its doors: stages, calls, drafts, bulk, erase and export, and a converted lead's yes comes only from them

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

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
  // The lead finder (PRD §12.6). A search's own bucket (lead_search) and a lead's
  // own (lead_member) are release A's; B adds three, and every B route that edits
  // one lead or one search uses A's lead_member.
  lead_bulk: { limit: 30, windowMs: 60_000, noun: "changes to many leads" },
  lead_draft: { limit: 60, windowMs: 3_600_000, noun: "email drafts" },
  lead_suggest: { limit: 10, windowMs: 3_600_000, noun: "suggestion requests" },
```

**Three, not four.** v2 proposed a fourth, `lead_edit`, at `{ limit: 120, windowMs: 60_000, noun: "lead changes" }` — which is, to the character, `RATE.lead_member` on main (`rate-limit.ts:149`, release A, used by `POST leads/[id]/keep|exclude|put-back`). Two buckets with one noun make a refusal nobody can tell apart, so B reuses A's: every `rate:` in 4.4 that v2 wrote as `lead_edit` is `lead_member`.

- [ ] **Step 3: `service.ts`** gains v2's `saveLeadSuggestions` (v2:6198–6202, unchanged: an upsert on `tenant_id` with the service role). Nothing else from v2 Task 3: no scheduler, no live-runs read (the doors insert their own jobs, and Stop is A's door).
- [ ] **Step 4:** Commit with 4.4.

### 4.4 The server module and the routes (v2:6258–6470, corrected)

**Files:** Modify `apps/dashboard/src/server/leads.ts` (release A's; B adds the functions in step 2) · Create the eight route files in step 3 under `apps/dashboard/app/api/v1/` · Modify `apps/dashboard/src/client/routes.generated.ts` and `tooling/scripts/tests/route-policy.json` (both regenerated, step 4) · Test `tooling/scripts/tests/lead-routes.test.mjs`

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

- [ ] **Step 2: The server module.** v2's `leadScope`/`leadSearchScope` (v2:6276–6291) survive with A's columns (`leads`: `id, tenant_id, business_name, email, email_state, stage, closed_reason, contact_id, place_id, erased_at, blanked_at`; `lead_searches`: `id, tenant_id, name, plan, removed_at`). **`planFacts` is not on main** — v2 said "A's now", and a grep of release A finds only `lead_niche_prior`, `lead_searches_on` and `estimateForRound`, no such function. B writes it here, and it answers exactly Task 9's `LeadPlanFacts` (4.6): `{ dupes, leadsLeft, bound, prior, priorOf, cannotSee, renewsOn, nearby }`, built from `lead_niche_prior` (A's door), the month's counter and the plan's criteria. It is what `propose_lead_search` puts in `payload.facts` (Task 6) and what the plan card draws (Task 9's `leadPlanLikely`, `leadPlanFacts`, `leadPlanAsk`); B's `searchesOf` reads `lead_searches_view` and `lead_list_counts`. The functions, each one door and no scheduling:

| Function | Door | Answers |
|---|---|---|
| `renameSearch(ctx, s, name)` | `lead_search_rename` (A) | `{ name }` |
| `removeSearch(ctx, s)` | `lead_search_remove` (A) | `{ archived, kept }` and "Removed. The 18 you contacted or are talking to are kept." |
| `undoSearch(ctx, s)` | `lead_search_undo(p_search_id)` (4.2, 4.5) | `{ removed, credited, op_id, version }`, or `{ error: "running" \| "too_late" \| "removed" }` carried back through `refusalOf` as the route's sentence. This is the Done strip's Undo (§8.6): the leads of the ended round that nobody touched leave the search and go back to the month they were counted in; a lead exported or copied leaves without a credit; a worked lead stays. Its own toast's Undo is A's `POST lead-operations/[id]/undo { version }` |
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
export const PATCH = write({ scope: leadSearchScope, role: "operator", rate: "lead_member", input: RenameLeadSearchSchema, handle: ({ ctx, row, input }) => renameSearch(ctx, row, input.name) });
/** DELETE — remove the search, keeping the leads contacted or talking. An owner's. */
export const DELETE = write({ scope: leadSearchScope, role: "owner", rate: "lead_member", handle: ({ ctx, row }) => removeSearch(ctx, row) });
// apps/dashboard/app/api/v1/lead-searches/[id]/undo/route.ts — the Done strip's Undo (§8.6). An owner's: it gives leads back to the month.
export const POST = write({ scope: leadSearchScope, role: "owner", rate: "lead_member", handle: ({ ctx, row }) => undoSearch(ctx, row) });
// apps/dashboard/app/api/v1/leads/[id]/stage/route.ts — operator; only an Interested call makes a person
export const POST = write({ scope: leadScope, role: "operator", rate: "lead_member", input: LeadStageInputSchema, handle: ({ ctx, row, input }) => setStage(ctx, row, input) });
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

`GET leads` (A's file) takes `LeadsQuerySchema` with `list`, `class` and the six sorts. **`SpendWords`** (v2 Task 1, 1c): check `POST lead-searches` on main — as of `1441f5bc` `whyCannotSpend(mode, status)` still says "buying a number" (`packages/contracts/src/billing.ts:149–155`) and `requireSpend(ctx, member)` still takes no `doing` (`with-route.ts:242`), so this is live work, not a check that passes. If a refusal to spend there still says "buying a number", add v2:5800–5830's `SpendWords`, `SPEND_LEADS`, `whyCannotSpend(mode, status, doing)`, `spendWords` on `WriteSpec` (`route.ts:112`) and `requireSpend(ctx, member, doing)` (`with-route.ts:242`) here, with v2's `may-spend.test.mjs` cases; the lines door's two calls keep the default.

- [ ] **Step 4: Regenerate.** `UPDATE_ROUTE_POLICY=1 node --conditions=react-server --import tsx --test tooling/scripts/tests/route-policy.test.mjs`, then `node tooling/scripts/gen-route-types.mjs`, then `route-policy.test.mjs route-types.test.mjs lead-routes.test.mjs` → PASS. Review `route-policy.json`'s diff line by line: **ten** new entries (`PATCH` and `DELETE lead-searches/[id]`, `POST lead-searches/[id]/undo`, `POST leads/[id]/stage`, `POST leads/[id]/draft`, `DELETE leads/[id]`, `POST leads/bulk`, `GET leads/export`, `GET` and `PUT lead-suggestions`), `spend: true` on none of them (the spending routes are A's).
- [ ] **Step 5: The migration's tests** (`leads.db.test.mjs`, 4.2's list) → PASS on the local Postgres. Commit — "A lead is worked through its doors: stages, calls, drafts, bulk, erase and export, and a converted lead's yes comes only from them". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.


### 4.5 The key door: `lead_set_stage`

**Files:** this section writes no file of its own — the door's body is inside `supabase/migrations/00142_the_leads_are_worked.sql` (4.2 step 4), its cases are `tooling/scripts/tests/leads.db.test.mjs` (4.2 step 2, blocks 1–6 and 14), and it lands in 4.2's commit. What is here is every decision the body makes and the line of main it was read against, so the body can be checked rather than trusted.

The one door the peek's stage control, the call question, the draft's "Did you send it?" and Not a fit all reach. Its rules are the release's hardest (§9.4, §9.6, decision 25, §0.4), so they are spelled here; the file that holds it is 4.2's, and every body below is written there in full. Nothing in this section is a second copy of the migration: `lead_set_stage` is repeated because it is the door the release turns on, and the rest of the section is what each body decided and against which line of main.

**The three placeholders the sketch left, resolved against main.** Each was read before a line was written:

| The sketch said | What main says | Where |
|---|---|---|
| "`contact_identities`, the way the intake links a caller" | Nothing looks a person up by identity row. `create_person(p_tenant_id, p_phone_e164, p_display_name, p_source, p_title default null)` IS get-or-create by `contacts.phone_e164`, and answers `{contact_id, existed, source}`. So the door calls it and reads `existed`: decision 25 is kept by the function that already keeps it. | `00053:16–76`, the lookup at `00053:44–51` |
| "`create_person`'s real signature" | Five arguments since 00053 (00052's four-argument one was dropped at `00053:14`). It refuses a number that is not `^\+[1-9][0-9]{7,14}$` and a name over 80 characters, both by raising, so the door checks the number's shape itself and passes `left(business_name, 80)`. | `00053:16`, `:36–41` |
| "`lead_hash`" | There is no `lead_hash`. The keyed digest is `lead_suppression_hash(p_tenant_id, p_value)` — sha256 hex of `"<tenant>:<value>"`, the same bytes contracts' `leadSuppressionHash` computes — and `lead_suppressions` keys on `(tenant_id, kind, hash, what)`, not `key_hash`. | `00140:527–536`, the table at `:340–352` |

Two more the sketch got wrong against main, and what was done:

- **`lead_operations` has no `lead_id` and no `by_user`.** Its columns are `(tenant_id, kind, search_id, lead_ids uuid[], before, after, version, by, at, undone_at)` (`00140:309–321`). The door writes `lead_ids = array[p_lead_id]`, `search_id = null` (a stage is the lead's, not one search's) and `by = auth.uid()`, exactly as `lead_member_move` writes its row (`00140:1734–1735`).
- **`leads` had no `version`.** `v_lead.version` in the sketch reads nothing on main. 4.2 adds the column, every door here bumps it in the one statement that writes the row, and `lead_undo` guards on it.

**Two things are fixed whatever else changes**, and each has its own case in `leads.db.test.mjs`: a click to `converted` writes `lead.stage`, never `lead.converted`, and leaves `contact_id` null; and a `stage` operation that made a person is never undone — `lead_undo` answers `{error: "person"}`, because unmaking a person is erasing one, and that is People's door, not a toast's.

**Where the branches go.** One statement writes the row, so the version moves exactly once however the lead was worked, and a stage nobody named is kept:

| The page's act (4.1 `stageArgs`) | What changes | The event |
|---|---|---|
| `{kind: "stage", stage}` | `stage`; `contacted_at` when it becomes Contacted or Talking | `lead.stage` |
| `{kind: "said_no"}` | `stage = archived`, `closed_reason = said_no` | `lead.stage` |
| `{kind: "not_a_fit", why}` | `stage = archived`, `closed_reason = not_a_fit`; `customer` also writes the place's suppression | `lead.not_a_fit` |
| `{kind: "emailed"}` | `stage = nurture`, `last_outcome = emailed` | `lead.emailed` |
| `{kind: "outcome", outcome: "interested", note}` | the person, `contact_id`, `stage = converted`, `converted_at` | `lead.converted` **and** `lead.call` |
| `{kind: "outcome", outcome: "wrong_number"}` | `phone_wrong`; the stage is kept | `lead.call` |
| every other outcome | what `outcomeMove` says: `not_interested` → archived/said_no, the rest → nurture | `lead.call` |

The `elsif` chain that picks the event is null-safe: `p_reason in ('not_a_fit', 'customer')` with `p_reason` null is NULL, not true, so it falls through to `lead.stage`, which is what a Talking click and a Said no both want.

**The body, as 4.2's file holds it:**

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
  v_user     uuid := auth.uid();
  v_lead     public.leads%rowtype;
  v_before   jsonb;
  v_contact  uuid;
  v_made     jsonb;
  v_existed  boolean := false;
  v_convert  boolean := coalesce(p_outcome = 'interested', false);   -- the one act that makes a person (§9.6)
  v_stage    text;
  v_hash     text;
  v_supp     boolean := false;
  v_op       uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_lead from public.leads where id = p_lead_id;
  -- A stranger learns nothing: not a member reads as not found (00027's rule).
  -- Viewers read only, so they are strangers to this door too.
  if not found or not public.is_acting_member(v_lead.tenant_id) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if v_lead.erased_at is not null or v_lead.blanked_at is not null then
    raise exception 'This lead is gone.' using errcode = 'P0002';
  end if;
  if p_stage is not null and p_stage not in ('ready', 'nurture', 'converted', 'archived') then
    raise exception 'stage must be ready, nurture, converted or archived' using errcode = '22023';
  end if;
  if p_reason is not null and p_reason not in ('said_no', 'not_a_fit', 'customer', 'stale', 'search_removed') then
    raise exception 'reason must be one of the closed reasons' using errcode = '22023';
  end if;
  if p_fit_reason is not null and p_fit_reason not in ('chain', 'wrong_kind', 'too_far', 'customer', 'other') then
    raise exception 'fit_reason must be chain, wrong_kind, too_far, customer or other' using errcode = '22023';
  end if;
  if p_outcome is not null and p_outcome not in ('interested', 'call_back', 'not_interested', 'voicemail', 'no_answer', 'wrong_number', 'emailed') then
    raise exception 'outcome must be one of the six, or emailed' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 280 then
    raise exception 'Note too long.' using errcode = '22023';
  end if;

  v_before := jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                                 'phone_wrong', v_lead.phone_wrong, 'contact_id', v_lead.contact_id);
  v_stage  := case when v_convert then 'converted' else p_stage end;

  if v_convert then
    -- A real conversation. The person whose number this is, else the person
    -- whose address it is, else a new one named for the business.
    if v_lead.contact_id is not null then
      v_contact := v_lead.contact_id;
      v_existed := true;
    elsif v_lead.phone_e164 ~ '^\+[1-9][0-9]{7,14}$' then
      -- create_person is get-or-create by number (00053), so the workspace
      -- never gets a second person for a number it already has (25), and its
      -- contact.added event with source 'lead' is what People reads back as
      -- "A lead you found" (00138).
      v_made    := public.create_person(v_lead.tenant_id, v_lead.phone_e164, left(nullif(v_lead.business_name, ''), 80), 'lead');
      v_contact := (v_made->>'contact_id')::uuid;
      v_existed := coalesce((v_made->>'existed')::boolean, false);
      -- 00125's door adds the address to a person created by phone, but only
      -- when they have none and nobody else here holds it: a unique violation
      -- inside this door would lose the whole act.
      if v_lead.email is not null
         and not exists (select 1 from public.contacts c where c.id = v_contact and c.email is not null)
         and not exists (select 1 from public.contacts c where c.tenant_id = v_lead.tenant_id and c.email = lower(btrim(v_lead.email))) then
        perform public.set_person_email(v_contact, v_lead.email);
      end if;
    else
      -- A lead with no number converts the way an email-only person arrives:
      -- the address is the identity, and the same contact.added event says
      -- where they came from.
      select c.id into v_contact from public.contacts c
       where c.tenant_id = v_lead.tenant_id and c.email = lower(btrim(coalesce(v_lead.email, '')))
         and c.erased_at is null and c.merged_into_contact_id is null
       limit 1;
      v_existed := v_contact is not null;
      if v_contact is null then
        insert into public.contacts (tenant_id, display_name, email)
        values (v_lead.tenant_id, left(nullif(v_lead.business_name, ''), 80), nullif(lower(btrim(coalesce(v_lead.email, ''))), ''))
        returning id into v_contact;
        insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
        values (v_lead.tenant_id, 'contact.added', 'contact', 'contact', v_contact,
                jsonb_build_object('source', 'lead', 'title', null, 'by', v_user));
      end if;
    end if;
  end if;

  -- One statement, so the version moves exactly once however the lead was
  -- worked, and a stage that was not named is kept (wrong_number).
  update public.leads
     set stage         = coalesce(v_stage, stage),
         closed_reason = case when v_stage = 'archived' then p_reason
                              when v_stage is not null then null
                              else closed_reason end,
         phone_wrong   = (phone_wrong or coalesce(p_outcome, '') = 'wrong_number'),
         contact_id    = coalesce(v_contact, contact_id),
         converted_at  = case when v_convert then coalesce(converted_at, now()) else converted_at end,
         contacted_at  = case when coalesce(v_stage, '') in ('nurture', 'converted') then coalesce(contacted_at, now()) else contacted_at end,
         last_outcome  = coalesce(p_outcome, last_outcome),
         last_note     = case when p_outcome is not null then p_note else last_note end,
         version       = version + 1
   where id = p_lead_id
  returning * into v_lead;

  if v_convert then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.converted', 'lead', 'lead', p_lead_id,
            jsonb_build_object('contact_id', v_contact, 'existed', v_existed, 'how', 'call', 'by', v_user));
  end if;

  if p_outcome is not null and p_outcome <> 'emailed' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.call', 'lead', 'lead', p_lead_id,
            jsonb_build_object('outcome', p_outcome, 'note', p_note, 'by', v_user));
  elsif p_outcome = 'emailed' then
    -- S12: what is recorded is that the OWNER said they sent it.
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.emailed', 'lead', 'lead', p_lead_id,
            jsonb_build_object('by', v_user));
  elsif p_reason in ('not_a_fit', 'customer') then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.not_a_fit', 'lead', 'lead', p_lead_id,
            jsonb_build_object('why', p_fit_reason, 'by', v_user));
    -- "Already a customer" hides the place from every future search (§0.4,
    -- S8). The hash is A's keyed digest, so the collect's suppression read
    -- refuses the place byte for byte.
    if p_reason = 'customer' and v_lead.place_id is not null then
      v_hash := public.lead_suppression_hash(v_lead.tenant_id, v_lead.place_id);
      insert into public.lead_suppressions (tenant_id, kind, hash, what)
      values (v_lead.tenant_id, 'place', v_hash, 'customer')
      on conflict (tenant_id, kind, hash) do nothing;
      v_supp := found;
    end if;
  else
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.stage', 'lead', 'lead', p_lead_id,
            jsonb_build_object('stage', v_stage, 'reason', p_reason, 'by', v_user));
  end if;

  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (v_lead.tenant_id, 'stage', null, array[p_lead_id], v_before,
          jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                             'phone_wrong', v_lead.phone_wrong, 'contact_id', v_lead.contact_id,
                             'converted', v_convert, 'suppressed', v_supp, 'place_hash', v_hash),
          v_lead.version, v_user)
  returning id into v_op;

  return jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                            'contact_id', v_lead.contact_id, 'existed', v_existed, 'converted', v_convert,
                            'op_id', v_op, 'version', v_lead.version);
end $$;
comment on function public.lead_set_stage(uuid, text, text, text, text, text) is
  'Operator. The one door for a lead''s stage, its six call outcomes, "Did you send it?" and Not a fit. A click to converted marks Talking and nothing else: contact_id stays null and the answer says converted false (§9.6). Only outcome interested makes a person -- the one whose number this is when the workspace has them, else whose address, else a new one named for the business with source lead -- and links it. wrong_number marks the number and keeps the stage. reason customer hides the place from every future search. Writes one lead_operations row (kind stage) with the lead''s new version.';
revoke execute on function public.lead_set_stage(uuid, text, text, text, text, text) from public, anon;
grant  execute on function public.lead_set_stage(uuid, text, text, text, text, text) to authenticated;
```

**What every other body decides**, each written in full in 4.2's file, each with its own case in `leads.db.test.mjs`:

- **`lead_bulk(p_tenant_id, p_action, p_ids, p_view)`** — operator (`is_acting_member`). `p_ids` or `p_view`, never both: `(p_ids is null) = (p_view is null)` refuses with "name the leads, or the view, and not both". The view's keys are `LeadsViewSchema`'s (`search`, `class`, `list`, `sort`, `dir`), and the rows it names are the rows `leads_page` would show, because both ask `lead_in_list` — with no paging, so "Select all 1,240 that match" acts on 1,240 and not on 500. `contacted` → `nurture` with `contacted_at`; `not_a_fit` → `archived` with `closed_reason = 'not_a_fit'`. One event for the act, never one per lead: an activity log with 1,240 rows in it says nothing. One operation row holds every id, what each row was, and the version this act leaves it at (`seen`), so `lead_undo` restores the rows nobody has touched since and answers `{restored, kept}` the way it does for a removed search. The row's own `version` is 1 — a bulk names no single lead, so the operation is guarded by `undone_at` and each lead by its own `seen`.
- **`lead_erase(p_lead_id)`** — owner, checked the way the most destructive verb in the product checks it: membership first, then `m.role = 'owner'`, with `erase_contact`'s own shape of sentence ("Only an owner can erase a lead.", `00027:130–138`). The tombstones are written BEFORE the blanking, because blanking takes the place id, the number and the address away: place, phone and email each onto `lead_suppressions` as `erased`, exactly as `leads_erase_on_contact` writes them when a person is erased (`00140:781–806`). Then `lead_blank(p_lead_id)` — the one function retention and erasure blank through, so what a lead keeps is listed in one place (`00140:671–697`) — then `erased_at`. No operation row: this one is final. Idempotent: a second call answers `{erased: true, already: true}` without re-executing.
- **`lead_export_mark(p_tenant_id, p_ids)`** — owner, through `has_permission(v_user, p_tenant_id, 'export')`, the permission `contacts/export` already runs under. `exported_at = now()` where it is null and the lead is neither erased nor blanked, and it answers how many it marked, so a second download does not charge a lead twice and an exported lead keeps its charge when a removed search comes back (`lead_undo`'s `undo_search` branch reads `exported_at`).
- **`leads_page(…, p_list, p_dir, p_after_id)`** — A's read with the rail's list, a direction and three more sorts. **Dropped and written again, not replaced:** `create or replace` with more parameters leaves both functions, and a call naming A's six then resolves to neither ("function is not unique"); the drop is how 00140 itself added an argument to `lead_reserve` (`00140:574`). Every A caller names its arguments (`apps/dashboard/app/api/v1/leads/route.ts:27`, `lead-engine.db.test.mjs:633`), so they all resolve to this one with the three defaults filling the rest. `sort_key` stays A's packed `"<k>|<member_id>"` and still pages on its own; `page_key` is the raw key beside it, for the `{key, id}` pair 4.4's `leadsPage` hands back as `next`. The two directions are one query: the pair of sort expressions that is not this call's is a constant null for every row and sorts nothing.
- **`lead_list_counts(p_tenant_id)`** — the rail's six numbers over the leads the workspace owns (a qualified membership that counted, not blanked, not erased), counted once per lead however many searches found it. `all` is the total and not the sum: a lead closed `stale` or `search_removed` is in All and in no named list, which is why the five lists are what the owner can act on rather than a partition.
- **`lead_searches_view`** — A's, with `ending_pending`, `waiting_since` and `ended_at` from the round, `emails_checked` and `with_phone` over the members (the strip's "88 you can email · 72 by phone", §8.6), and `undo_op_id`/`undo_version`: the newest `undo_search` operation of this search that nobody has undone and that is less than twenty-four hours old. Dropped and written again rather than replaced, because `create or replace view` may only add columns at the end and the round's columns belong together; no SQL object depends on it, and every reader names its columns.
- **`lead_search_undo(p_search_id)`** — owner (`has_permission … 'find'`), the Done strip's Undo (§8.6, E9, S11). Only while the search's latest round is `ended` and its `ended_at` is under twenty-four hours old: otherwise `{error: 'running' | 'too_late'}`, and `{error: 'removed'}` on a search already removed. **Touched is read off the work, never off a flag** — `stage <> 'ready'`, a `contact_id`, a `contacted_at`, a `last_outcome` (a call, or the owner saying they sent the email), `phone_wrong`, `kept_at` (Keep or Put back) or `excluded_by = 'owner'` — so every one of those leads stays where it is, charged. Every other member of that round is blanked; the ones that counted go back to the allowance of the month in `counted_month` (never the budget, S11), except a lead with `exported_at`, which leaves the search and keeps its charge (§0.2). One `undo_search` operation records the ids and a `credited` map of lead → month, so the toast's Undo puts it back through `lead_undo`; with nothing untouched it writes no operation and answers `{removed: 0, credited: 0, op_id: null, version: 1}`.
- **`lead_undo`** — A's, with three changes and everything else untouched, word for word. **One of them is forced:** A's `undo_search` branch writes `set blanked_at = null, version = version + 1 from public.leads l2`, and the moment `leads` has a `version` column too, that bare `version` is ambiguous and the function stops compiling; it becomes `version = m2.version + 1`. The branch also takes back what `lead_search_undo` credited, lead by lead, in the month each counted in, and only for the memberships that came back — one left blanked is exported or was never credited, and either way it is not charged twice — and answers `{ok, restored, kept, recharged}`. `stage`: refuses `{error: "person"}` when the act made one, else guards on the lead's version, restores `before`, and deletes the suppression the act wrote — only the one whose hash the act recorded, and only a `customer` one, because an email opt-out and an erasure are nobody's to lift. `bulk`: walks `before`, restores each lead whose version is still the one the act left, and answers `{restored, kept}`.
- **`lead_rounds_notify`** — one `leads_question` row when a round starts waiting, one `leads_ready` row when it ends, each once per round (the guard is `subject_id = the round`, so a repeated write of the same state rings nothing). **Nothing rings for the ending `stopped`**: the owner who pressed Stop knows, and `lead_search_remove` ends a search's live rounds `stopped` *before* it sets `removed_at` (`00140:1888–1907`), so without that exception, removing a search would tell the workspace the search it just deleted was done.
- **The two consent doors** — 00137's bodies, word for word, with one block added after each erased check (`00137:101–103`, `:214–216`) and nothing else changed. The block is `auth.uid() is not null and p_consent = 'opted_in' and exists (a lead of this workspace linked to this person)`, raising contracts' `LEAD_CONSENT_REFUSAL` with `42501`. It sits before the message is read, so naming a real inbound message the person did send is refused in the same words rather than in the message door's. Neither 00043's four-argument `set_contact_consent` (dropped at `00137:163`) nor 00110's six-argument `set_marketing_consent` (dropped at `00137:43`) is re-created: a `create or replace` with those argument lists would bring back an ambiguous overload and PostgREST would refuse every call.

### 4.6 The view models, spelled

**Files:** `packages/contracts/src/leads.ts` (4.1's file: these interfaces and signatures are written in 4.1 step 2) · Test `tooling/scripts/tests/leads-vm.test.mjs` (4.1 step 1; Tasks 9, 10, 12–15, 17 and 19 append their cases as they write each body) · it lands in 4.1's commit.

The DTOs and the functions `leads.ts` exports for the page, each with its test in `leads-vm.test.mjs`. **This is the one declaration site for the five DTOs**: Tasks 10 and 12 write the *bodies* of the functions below into the same file and add their own types (`LeadPeekReach`, `LeadPeekVM`, `LeadStripVM`, `LeadPlanFacts`), but neither declares a DTO again — a second `LeadSearchDto` in one module is a `TS2300`, and the fields below are what W2's migration actually returns (`leads_page`'s widened columns and `lead_searches_view`'s new ones, 4.2 §3).

```ts
export interface LeadCheck { key: LeadCheckKey; how: "seen" | "read"; answer: "yes" | "no" | "unknown"; source: string; reason: string | null }
/** The seven checks §0.1 and the interface name, four seen and three read; §9.2's "six" is the PRD's count of one screen. */
export const LEAD_CHECK_KEYS = ["on_maps", "in_area", "phone_two_sources", "mailbox", "independent", "right_kind", "own_address"] as const;
export type LeadCheckKey = (typeof LEAD_CHECK_KEYS)[number];
export interface LeadRowDto {
  id: string; search_id: string; place_id: string; business_name: string; category: string | null;
  city: string | null; state: string | null; street: string | null;
  phone: string | null; phone_agrees: boolean; phone_wrong: boolean;
  email: string | null; email_state: LeadEmailState; email_checked_at: string | null;
  website: string | null; instagram: string | null; rating: number | null; reviews: number | null;
  stage: LeadStage; closed_reason: string | null; contact_id: string | null;
  /** How the lead has been worked, from `leads_page` (4.2): a fixture copies the real shape even where B draws none of it. */
  last_outcome: string | null; last_note: string | null; contacted_at: string | null; converted_at: string | null;
  places: number; found_at: string; exported_at: string | null; version: number;
  member: { class: LeadClass; fit: "strong" | "look" | "long" | null; reason: string; excluded_by: string | null; distance_m: number | null; counted: boolean; checks: LeadCheck[]; other_emails: { email: string; why: string }[] };
}
export interface LeadSearchRoundDto {
  id: string; seq: number; purpose: string; state: string; ending: LeadRoundEnding | null;
  question: { sentence: string; criterion_key: string } | null;
  target: number; counted: number; qualified: number; review: number; excluded: number;
  /** Counted leads whose address was found and checked: "88 you can email", and "41 emails checked" while it runs. */
  emails_checked: number;
  /** Counted leads reachable by phone: "72 by phone" (§8.6's sentence needs both, W2 put both on the view). */
  with_phone: number;
  /** The round is stopping and still checking what it found (S12): the only way to tell Stopping from Checking. */
  ending_pending: boolean;
  waiting_since: string | null; cost_usd: number; ended_at: string | null;
  undo_op_id: string | null; undo_version: number | null;
}
export interface LeadSearchDto { id: string; name: string; asked: string; asked_on: string; plan: LeadSearchPlan; plan_version: number; round: LeadSearchRoundDto | null }
export interface LeadCounts { all: number; ready: number; nurture: number; converted: number; said_no: number; not_a_fit: number }
export interface LeadSuggestionsDto { business_line: string; by_owner: boolean; made_at: string; items: { words: string; who_for: string; category_key: string; reach: string | null }[]; note?: string }
/** What the plan card is given beside the plan (Task 9); `planFacts` in `server/leads.ts` (4.4) builds exactly this. */
export interface LeadPlanFacts { dupes: number; leadsLeft: number; bound: "month" | "budget" | null; prior: { places: number; matched: number; with_email: number } | null; priorOf: string | null; cannotSee: string[]; renewsOn: string; nearby: string[] }

/**
 * One row as the table draws it (§6.2). Every field is a word or a shape, and not one of them is a stored value:
 * `stage` rides along only so the row's dot has a class. Task 2's `LEAD_COLUMNS` reads exactly these and nothing else.
 */
export interface LeadRowVM {
  id: string; searchId: string; searchName: string; mark: string; name: string; places: number;
  category: string; area: string; cls: LeadClass;
  fitLabel: string; fitTitle: string;
  email: string | null; emailState: LeadEmailState; emailLabel: string; emailWord: string;
  phone: string | null; phoneAgrees: boolean; phoneWrong: boolean;
  why: string; rating: string; stage: LeadStage; stageLabel: string;
  foundLabel: string; foundAt: string; distance: string; source: string; host: string;
  excludedBy: string | null; version: number;
}
/** One row's words and shapes (§6.2). Nothing here is a stored value. */
export function toLeadRowVM(r: LeadRowDto, tz: string, now: Date): LeadRowVM;
/** The peek (§9.2, P2): the sub-line, the fit sentence, how to reach them, the checks in two groups, the other addresses, found. Task 12 writes it. */
export function toLeadPeekVM(r: LeadRowDto, search: LeadSearchDto | null, tz: string, now: Date): LeadPeekVM;
/** The rail's rows under Leads (§6.1): the six lists with counts, then the searches with their marks. */
export function leadRail(counts: LeadCounts, searches: LeadSearchDto[]): { lists: { id: LeadList; label: string; count: number }[]; searches: { id: string; name: string; count: number; mark: "live" | "question" | null }[] };
/** "322 leads · 272 ready · 3 searches", and "1 search needs you" when one waits. */
export function leadsStanding(counts: LeadCounts, searches: LeadSearchDto[]): { total: string; parts: string[]; needsYou: { count: number; searchId: string } | null };
/** The strip for one search: every open state and every ending, claiming only what was seen (P3, S12, §8.8). Task 10 writes it; `extra` carries what the round does not hold. */
export function leadStrip(s: LeadSearchDto, now: Date, extra?: { offered?: number; nearby?: string[] }): LeadStripVM;
```

**`asked_on` is `lead_searches_view.created_at`.** W2's view gains no `asked_on` column because it already selects the same fact; 4.4's `searchesOf` fills the DTO field from it.

**The strip's ending sentences are not spelled here, and not asserted by their ending's name.** v2's illustrative assertion was

```js
assert.equal(vm.title.startsWith(LEAD_ENDING_WORDS[ending].split(" ")[0]), true);   // WRONG: seven of nine fail
```

`LEAD_ENDING_WORDS` is release A's short *name* for an ending (`searched_everything` → "Searched everything this plan covers"), while §8.8's sentence for that ending opens "Found 160 personal trainers"; `month_leads_used` is "This month's leads are used" against a line that opens "Stopped at 464". W3 and W5 reached this independently, and both proved it. So: **Task 19 owns the nine sentences** (`leadEndingLine(ending, facts)` → `{ mark, title, parts, step }`, with `LEAD_ENDING_WORDS[ending]` riding along as `mark` for the strip's accessible name and the kept-search menu), Task 10's `leadStrip` composes from it, and the test is

```js
test("the strip says every ending in the PRD's words, one next step each, and nothing about money", () => {
  for (const ending of LEAD_ROUND_ENDINGS) {
    const facts = endingFactsOf(searchWith({ state: "ended", ending, counted: 61, target: 200 }), {});
    const vm = leadStrip(searchWith({ state: "ended", ending, counted: 61, target: 200 }), NOW);
    assert.equal(vm.state, "ended");
    assert.equal(vm.title, leadEndingLine(ending, facts).title, `${ending}: the strip says Task 19's sentence, never one of its own`);
    assert.ok(vm.actions.length <= 3, ending);
    assert.equal(/\$|apify|compass|bounceverify/i.test(vm.title + vm.parts.join(" ")), false, ending);
  }
  const stopped = leadStrip(searchWith({ state: "checking", ending: "stopped", ending_pending: true, counted: 61, target: 200 }), NOW);
  assert.equal(stopped.title, "Stopping");
  assert.deepEqual(stopped.parts, ["checking the emails of the 61 found", "nothing else was counted"]);
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

Task 2's page is drawn against exactly these two answers (W1 stood `leadRail` and `leadsStanding` in against this test's values), and `toLeadRowVM` answers exactly the fields Task 2's `LEAD_COLUMNS` reads: `id, searchId, searchName, mark, name, places, category, area, cls, fitLabel, fitTitle, email, emailState, emailLabel, emailWord, phone, phoneAgrees, phoneWrong, why, rating, stage, stageLabel, foundLabel, foundAt, distance, source, host, excludedBy, version`.

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

- [ ] **Step 3:** Run `lead-gateway.test.mjs` and the existing `ask*.test.mjs` → PASS. Commit — "The model gateway writes a draft and the first day's suggestions, both in Ask's budget". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

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

`ask-turn.jsx`: `KIND` (:122) gains `lead_search: t.kLeads`, `ICON` (:123) `lead_search: "search"`, `openRoute` (:124) gains `p.kind === "lead_search" ? "clients/leads" :` before the Inbox fallback; the words map gains `kLeads: "Leads"`. `ask-turn.jsx` is edited here and again in Task 9; its `?v=` is bumped once for the whole release, in Task 22's step 1a (`Chanlytics.html:80`). Task 9 replaces the card's body with the plan card; until then the summary is the sentence. The route's own sentence on a refusal (402, 409: paused, the month used, the budget used) is the card's `err`, as every other card shows one.

- [ ] **Step 6:** Run `lead-ask.test.mjs ask.test.mjs ask-commit.test.mjs` → PASS (the cap test counts 15 reads and 11 acts: 26 ≤ 36). Commit — "Ask plans a lead search as a card an owner approves, and reads what was searched before". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

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

test("ACCEPTANCE: the doors a member can call that write consent are exactly three, and only two of them can say yes", { skip }, () => {
  const rows = query(`select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')
       and p.prosrc ~* 'update\\s+(public\\.)?contacts\\s+set[^;]*consent\\s*=' order by 1`);
  // Three, not two: the right to be forgotten writes consent too (00027:298-300,
  // `consent = 'unknown', consent_source = 'erasure'`), and it is a definer
  // function `authenticated` may execute. It CLEARS a yes and can never grant one.
  assert.deepEqual(rows.map((r) => r.name), ["erase_contact", "set_contact_consent", "set_marketing_consent"]);
  const erase = query(`select prosrc from pg_proc where proname = 'erase_contact'`)[0].prosrc;
  assert.equal(/consent\s*=\s*'opted_in'/.test(erase), false, "erasure never grants a yes");
  assert.equal(/consent\s*=\s*'unknown'/.test(erase), true);
  // And the two that CAN say yes both carry the refusal, word for word (4.2).
  for (const name of ["set_contact_consent", "set_marketing_consent"]) {
    const src = query(`select prosrc from pg_proc where proname = '${name}'`)[0].prosrc;
    assert.equal(src.includes(LEAD_CONSENT_REFUSAL), true, `${name} says the refusal in contracts' words`);
  }
});
```

The skip is the credentialed one every `*.db.test.mjs` carries; it fails, with the sign-in error, whenever the database is there (E11). The yes page's `form` path and the inbound `customer_message` path run as the service role with no session and are accepted by design; `leads.db.test.mjs` shows both landing a yes on a converted lead. The send paths' own suites (`broadcasts.test.mjs`, `outbound-gate.test.mjs`, `voice-doors.test.mjs`, `deliver.test.mjs`) each gain one case whose person is a converted lead with `consent: "unknown"`, asserting the refusal they already give a person with no yes: nothing new in the code, one new row in each fixture.

**Why three and not two** (W2 ran the query against the migrated state and read the answer back): the catalog test above was written expecting `set_contact_consent` and `set_marketing_consent`, and on main the same query returns `erase_contact` as well. It is not a hole — erasure must write consent, and it writes `'unknown'` — so the test asserts the true set and then asserts the thing the acceptance is actually about: erasure can only clear, and the two doors that can grant both carry `LEAD_CONSENT_REFUSAL` verbatim. `consent-paths.db.test.mjs` imports `LEAD_CONSENT_REFUSAL` from contracts and `query(sql)` from `privileges.db.test.mjs:33–52`'s helper.

- [ ] **Step 1a: Run them and see them fail.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/consent-paths.test.mjs tooling/scripts/tests/consent-paths.db.test.mjs` — the first file fails to load (`Cannot find module '…/consent-paths.test.mjs'` before it is written; once written, `LEAD_CONSENT_REFUSAL is not exported` until 4.1 lands), and the second reports `tests 5 · pass 0 · fail 0 · skipped 5` with no database in the environment, which is the skip path CI replays. With the local stack up and 4.2 applied, the catalog case is the one that fails first if the migration's doors do not carry the refusal verbatim.

- [ ] **Step 2:** Run both → PASS. Mutation checks: make `recordConsentMany` (`server/consent.ts:59`) update `contacts` directly for one id and see the first test fail; add a throwaway definer function that sets `consent` and see the catalog test name it (a fourth name breaks the `deepEqual`). Commit — "Every consent path reaches a door, and a converted lead's borrowed yes is refused in its words, for good". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

## The screens (Tasks 8–19)

Every screen below is a task of its own, written in full: its props, its state machine where v2 had one (v2:6960–7060, corrected), what it draws, the code, the test that proves it, the run, and the commit. Common to all of them: the components are hookless with their state in `ClientsAReal` (Task 2); every act is the courier's (Task 3); every word is contracts' (Task 4.1) and the vendor is never named; the design is the canvas's States artboard and nothing is redesigned; the tests run on the people-honest harness (`leads-honest.test.mjs`), and the phone is Task 18. A hook a screen needs (hold-to-talk, `visibilitychange`) is declared in `ClientsAReal` and handed down.

**Three places where a later task's contracts code is needed by an earlier task's screen**, said here once rather than in each task:

1. **`planWords` and its family** (Task 9 step 4, in `lead-search.ts`) are read by Task 8's placeholder plan card — but only at draw time, through `window.__LEAD_VM`, and a legacy `.jsx` file imports nothing and is never executed by lint or the build. Task 8 commits green; its own tests install the bag by hand.
2. **`window.__LEAD_VM` is assembled in three edits**, each in the task that writes the functions it carries: Task 9 step 7a installs it in `seed-globals.ts` with the plan derivations, Task 10 step 7a adds `leadStrip`, Task 19 step 6 adds `leadEndingLine`. Nothing installs a name before it exists.
3. **`leadEndingLine` is Task 19's and Task 10 composes from it.** Task 10 cannot draw an ended strip without it, so **either take Task 19 before Task 10, or write Task 19's §19.2 block (`leadEndingLine`, `LeadEndingFacts`, `leadAnd`, `LEAD_PAUSED_TITLE`) as part of Task 10's step 4** and leave §19.2 as the test and the sweep. Both writers proved it this way; what must not happen is Task 10 spelling an ending sentence of its own.

## Task 8: the composer, typing and voice

**Files:** Create `apps/dashboard/src/legacy/pages/leads-finder.jsx`, `apps/dashboard/src/legacy/styles/leads.css`, `tooling/scripts/tests/leads-finder.test.mjs` · Modify `apps/dashboard/src/legacy/components/icons.jsx:63` (the last case before `default`), `apps/dashboard/src/legacy-bridge/manifest.ts:63`, `apps/dashboard/src/legacy/Chanlytics.html:18, :49, :104`, `apps/dashboard/src/legacy-bridge/legacy.css:1, :9`, `apps/dashboard/src/legacy-bridge/leads.ts` (Task 3's `installLeadsCourier`)

**What this task is.** The finder is the door on the Leads scope: `F`, **Find leads**, **New search** or a suggestion opens it; the owner describes the businesses they want in words or by holding the mic; one Ask turn comes back either as a plan card or as a refusal in words under the input. It is hookless (`legacy/CLAUDE.md:65`): every piece of its state is `ClientsAReal`'s (Task 2's hook list) and arrives as props, and the turn itself is a named function the page calls with its setters, so the tests run it without the page.

**The state machine** (the turn is Ask's own, sent with `scope: null` and `surface: "clients"` — `scopeFromRoute("clients", "leads:…")` is null on main, `ask.ts:483–489` — and the finder names Leads in the words it sends):

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

**The `SendEvent` shapes it listens to** are `legacy-bridge/ask/api.ts:15–20`, and no others exist:

| event | shape | what the finder does |
|---|---|---|
| `thread` | `{ t: "thread"; id; title }` | nothing: the finder keeps no conversation, it asks once |
| `trace` | `{ t: "trace"; text }` | `set.trace(text)` — the line beside the pulsing dot while it thinks |
| `delta` | `{ t: "delta"; text }` | nothing: the finder waits for the whole answer, which `final` carries |
| `final` | `{ t: "final"; message: AskMessageVM }` | a `lead_search` in `message.proposals` (`ask.ts:455`) is the card; otherwise `message.text` is the refusal |
| `error` | `{ t: "error"; text }` | `text` is the refusal, in the client's own words (`refusalOf`, `api.ts:104–112`) |

- [ ] **Step 1: The icons these three screens name.** `components/icons.jsx` is a `switch` on the name that draws a plain circle for anything it does not know (`:63`, `default:`). It has no `mic`, `stop`, `undo`, `lock`, `dashring`, `copy`, `pencil`, `ban` or `globe`, all of which the finder, the peek, the draft and the row acts name. Add them once, here, before `default:` — old: `    case "download": return <svg {...props}><path d="M8 2.5v8M4.5 7L8 10.5 11.5 7"/><path d="M3 13h10"/></svg>;` · new: that line, then

```jsx
    // The lead finder's own (release B): a held mic, the stop and undo of a
    // round, the lock on what a found lead may receive, a fact that could not
    // be confirmed, and the row acts the peek and the table draw.
    case "mic":      return <svg {...props}><rect x="6" y="2" width="4" height="7" rx="2"/><path d="M3.5 7.5a4.5 4.5 0 009 0M8 12v2"/></svg>;
    case "stop":     return <svg {...props}><rect x="4" y="4" width="8" height="8" rx="1.5"/></svg>;
    case "undo":     return <svg {...props}><path d="M3 7h7a3.5 3.5 0 010 7H6"/><path d="M5.5 4.5L3 7l2.5 2.5"/></svg>;
    case "lock":     return <svg {...props}><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>;
    case "dashring": return <svg {...props}><path d="M8 2a6 6 0 013.2 1M14 6.2a6 6 0 010 3.6M11.2 13A6 6 0 018 14M4.8 13A6 6 0 012 9.8M2 6.2A6 6 0 014.8 3"/></svg>;
    case "copy":     return <svg {...props}><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 00-1-1h-6a1 1 0 00-1 1v6a1 1 0 001 1h2"/></svg>;
    case "pencil":   return <svg {...props}><path d="M11 2.5l2.5 2.5-7.5 7.5H3.5V10z"/><path d="M9.5 4l2.5 2.5"/></svg>;
    case "ban":      return <svg {...props}><circle cx="8" cy="8" r="5.5"/><path d="M4.1 11.9l7.8-7.8"/></svg>;
    case "globe":    return <svg {...props}><circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 2.5c1.6 1.7 2.4 3.6 2.4 5.5S9.6 12.3 8 13.5C6.4 12.3 5.6 10.4 5.6 8S6.4 4.2 8 2.5z"/></svg>;
```

`components/icons.jsx` is edited here and nowhere else in this release; its `?v=` is bumped once for the whole release, in Task 22's step 1a (`Chanlytics.html:49`). `sparkle`, `search`, `check`, `x`, `clock`, `users`, `shield`, `phone`, `mail`, `instagram`, `download`, `plus` and `refresh` are already there and are used as they are.

- [ ] **Step 2: The failing tests.** `tooling/scripts/tests/leads-finder.test.mjs`, on the stub React `refusals-on-the-page.test.mjs:18–34` sets up, with `walk`/`all`/`find`/`byTestId`/`textOf` from `people-honest.test.mjs:222–235`. The whole head, once; Tasks 9 and 10 append their tests to this file and use the same helpers and fixtures:

```js
/**
 * The finder, the plan card and the strip, drawn (release B, Tasks 8, 9, 10).
 *
 * Hookless components on the tests' stub React, as refusals-on-the-page does:
 * each is called with the props LeadsScope hands it, pressed, and read. The
 * page itself (Task 2) is proved in leads-honest.test.mjs; here the three
 * components are proved on their own props, so a change to one of them fails
 * here and not four files away.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LeadSearchPlanSchema, LEAD_ROUND_ENDINGS, LEAD_COUNT_CHOICES, planArea, planMinutes, planSaid, planSentence, planVersionOf, planWhere, planWho, planWords } from "../../../packages/contracts/src/lead-search.ts";
import { leadEndingLine, leadPlanAsk, leadPlanFacts, leadPlanLikely, leadStrip } from "../../../packages/contracts/src/leads.ts";

let cells = [];
let seq = 0;
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = type(props);
    return node;
  },
  useState: (init) => { const k = seq++; if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init; return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }]; },
  useRef: (init) => { const k = seq++; if (!(k in cells)) cells[k] = { current: init }; return cells[k]; },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: () => {},
};
globalThis.ReactDOM = { createPortal: (n) => n };
globalThis.window = globalThis.window || {};
Object.assign(globalThis.window, {
  __LEAD_VM: { planWords, planSaid, planWhere, planWho, planArea, planMinutes, planSentence, planVersionOf, LEAD_COUNT_CHOICES, leadStrip, leadEndingLine, leadPlanLikely, leadPlanFacts, leadPlanAsk },
});
await import("../../../apps/dashboard/src/legacy/components/icons.jsx");
await import("../../../apps/dashboard/src/legacy/pages/leads-finder.jsx");

const walk = (n, fn) => { if (n == null || typeof n !== "object") return; fn(n); for (const k of n.props?.children ?? []) walk(k, fn); if (n.rendered) walk(n.rendered, fn); };
const all = (tree, pred) => { const out = []; walk(tree, (n) => { if (pred(n)) out.push(n); }); return out; };
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const allTestId = (tree, id) => all(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return (n.props?.children ?? []).map(textOf).join("");
};
const click = (n) => { assert.ok(n, "nothing to press"); return n.props.onClick({ preventDefault() {}, stopPropagation() {} }); };
const press = (n, key, mods = {}) => {
  let taken = false;
  n.props.onKeyDown({ key, ...mods, preventDefault() { taken = true; }, stopPropagation() {} });
  return taken;
};

/* ------------------------------------------------------------ fixtures */

const PLAN = LeadSearchPlanSchema.parse({
  version: 1, card: "local_businesses", name: "personal trainers", asked: "200 personal trainers in Austin with a website",
  terms: ["personal trainer", "strength coach", "fitness coach"],
  area: { kind: "city", label: "Austin, TX", state: "TX", center: { lat: 30.2672, lng: -97.7431 }, radius_m: 25_000, query: "Austin, TX, USA" },
  count: 200, contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
});
const NEARBY = { kind: "city", label: "Round Rock, TX", state: "TX", center: { lat: 30.5083, lng: -97.6789 }, radius_m: 25_000, query: "Round Rock, TX, USA" };
const FACTS = { dupes: 14, leadsLeft: 486, bound: null, prior: { places: 1_200, matched: 700, with_email: 406 }, priorOf: "trainers", cannotSee: null, renewsOn: "Oct 1", nearby: [NEARBY] };
const CARD = { id: "p1", kind: "lead_search", needs: "owner", title: "Find 200 personal trainers", summary: planSentence(PLAN), payload: { plan: PLAN, view: { title: "Find 200 personal trainers" }, facts: FACTS }, undo: "Stop the search" };
const SUGGESTIONS = {
  forWho: "Chanlytics",
  items: [
    { words: "Personal trainers in Austin with a website, about 200", reach: "about 6 in 10 have an email" },
    { words: "Physical therapists within 5 miles", reach: "about 7 in 10 have an email" },
    { words: "Chiropractors in Round Rock", reach: "about 6 in 10 have an email" },
    { words: "A fourth nobody asked for", reach: null },
  ],
};

/** The page's finder state, as ClientsAReal holds it, with the setters leadFinderPlan and leadFinderApprove take. */
const page = (over = {}) => {
  const st = { open: true, stage: "compose", words: "", trace: null, refusal: null, proposal: null, plan: null, pick: null, ...over };
  const set = {
    open: (v) => { st.open = v; }, stage: (v) => { st.stage = v; }, words: (v) => { st.words = v; }, trace: (v) => { st.trace = v; },
    refusal: (v) => { st.refusal = v; }, proposal: (v) => { st.proposal = v; }, plan: (v) => { st.plan = v; }, pick: (v) => { st.pick = v; },
  };
  return { st, set };
};
const drawFinder = (st, over = {}) => {
  seq = 0;
  return globalThis.window.LeadFinder({
    open: st.open, stage: st.stage, words: st.words, proposal: st.proposal, plan: st.plan, facts: null,
    refusal: st.refusal, busy: false, trace: st.trace, suggestions: SUGGESTIONS, talk: null, pick: st.pick,
    onWords: (v) => { st.words = v; }, onPlan: () => {}, onChangePlan: (p) => { st.plan = p; },
    onApprove: () => {}, onBack: () => { st.stage = "compose"; }, onClose: () => { st.open = false; },
    onPick: (v) => { st.pick = v; }, ...over,
  });
};
```

and Task 8's own tests:

```js
/* -------------------------------------------------- Task 8: the composer */

test("every icon these three name draws a shape of its own, not the fallback circle", () => {
  const Real = globalThis.window.Icon;
  const kids = (n) => (n.props.children || []).filter(Boolean);
  const fallback = (n) => kids(n).length === 1 && kids(n)[0].type === "circle" && kids(n)[0].props.r === "3";
  for (const name of ["mic", "stop", "undo", "lock", "dashring", "copy", "pencil", "ban", "globe", "sparkle", "search", "check", "x", "clock", "users", "shield"]) {
    assert.ok(kids(Real({ name, size: 14 })).length >= 1, name);
    assert.equal(fallback(Real({ name, size: 14 })), false, `${name} falls through to the circle`);
  }
  assert.equal(fallback(Real({ name: "not-an-icon" })), true, "an unknown name still draws the circle");
});

test("the composer turns words into a plan card through one Ask turn, sent with no scope and the clients surface", async () => {
  const sent = [];
  globalThis.window.__ask = {
    send: async (input, on) => {
      sent.push(input);
      on({ t: "thread", id: "t1", title: "Find leads" });
      on({ t: "trace", text: "Reading what you asked" });
      on({ t: "trace", text: "Sizing the search" });
      on({ t: "delta", text: "Here's the plan." });
      on({ t: "final", message: { id: "m1", text: "Here's the plan. Nothing runs until you approve it.", proposals: [CARD] } });
    },
  };
  const { st, set } = page({ words: "200 personal trainers in Austin with a website" });
  const card = await globalThis.window.leadFinderPlan(st.words, set);
  assert.equal(sent.length, 1, "one turn, not one per word");
  assert.deepEqual([sent[0].scope, sent[0].surface, sent[0].threadId], [null, "clients", null], "scopeFromRoute has no scope for clients/leads, so the words name Leads themselves");
  assert.match(sent[0].text, /Leads/, sent[0].text);
  assert.match(sent[0].text, /200 personal trainers in Austin with a website/);
  assert.deepEqual([st.stage, st.trace, st.refusal, card.id], ["plan", "Sizing the search", null, "p1"]);
  assert.equal(st.plan.count, 200, "the card's plan is what the page now holds");
  const tree = drawFinder(st);
  assert.ok(byTestId(tree, "lead-plan"), "the card is drawn");
  assert.equal(byTestId(tree, "finder-thinking"), null, "the trace line is gone");
  assert.equal(byTestId(tree, "finder-refusal"), null);
});

test("a refusal is words under the input and no card, and the finder is back where the owner can change what they asked", async () => {
  globalThis.window.__ask = {
    send: async (input, on) => {
      on({ t: "trace", text: "Reading what you asked" });
      on({ t: "final", message: { id: "m2", text: "I can only find businesses in the US for now.", proposals: [] } });
    },
  };
  const { st, set } = page({ words: "dentists in Toronto" });
  const card = await globalThis.window.leadFinderPlan(st.words, set);
  assert.deepEqual([card, st.stage, st.proposal], [null, "compose", null]);
  const tree = drawFinder(st);
  const said = byTestId(tree, "finder-refusal");
  assert.equal(textOf(said), "I can only find businesses in the US for now.");
  assert.equal(said.props.role, "status");
  assert.equal(byTestId(tree, "lead-plan"), null, "no card");
  assert.equal(byTestId(tree, "finder-input").props.value, "dentists in Toronto", "what they typed is still there to change");
  globalThis.window.__ask = { send: async (input, on) => on({ t: "error", text: "Chanlytics didn't answer — ask again in a moment." }) };
  const again = page({ words: "dentists in Austin" });
  await globalThis.window.leadFinderPlan(again.st.words, again.set);
  assert.equal(again.st.refusal, "Chanlytics didn't answer — ask again in a moment.", "the stream's own error is said the same way");
});

test("hold-to-talk fills the input with what was heard and uploads nothing; with no recogniser there is no button", () => {
  const { st } = page();
  const heard = [];
  const talk = { canTalk: true, listening: true, start: () => heard.push("start"), stop: () => heard.push("stop") };
  const tree = drawFinder(st, { talk, onWords: (v) => { st.words = v; } });
  const mic = byTestId(tree, "finder-talk");
  assert.equal(mic.props["aria-pressed"], true, "it says it is listening");
  mic.props.onPointerDown();
  mic.props.onPointerUp();
  assert.deepEqual(heard, ["start", "stop"], "press starts the browser's own recogniser, release stops it");
  // What was heard arrives through useAskTalk's onWords, which ClientsAReal points at the finder's words.
  st.words = "wedding planners around Austin";
  assert.equal(byTestId(drawFinder(st, { talk }), "finder-input").props.value, "wedding planners around Austin");
  assert.equal(byTestId(drawFinder(st, { talk: { canTalk: false } }), "finder-talk"), null, "a browser with no recogniser is offered nothing");
});

test("the composer offers three suggestions, each with how reachable that kind is, and picking one fills the input", () => {
  const { st } = page();
  const tree = drawFinder(st);
  const items = allTestId(tree, "finder-suggestion");
  assert.equal(items.length, 3, "three, whatever the server sent");
  assert.equal(textOf(byTestId(tree, "finder-suggestions")).startsWith("Suggested for Chanlytics, from what your business does"), true, textOf(byTestId(tree, "finder-suggestions")));
  assert.match(textOf(items[0]), /about 6 in 10 have an email/);
  click(items[1]);
  assert.equal(st.words, "Physical therapists within 5 miles");
  const thinking = drawFinder({ ...st, stage: "thinking", trace: "Sizing the search" });
  assert.equal(byTestId(thinking, "finder-suggestions"), null, "nothing to pick while it thinks");
  assert.equal(textOf(byTestId(thinking, "finder-thinking")), "Sizing the search");
  assert.equal(byTestId(thinking, "finder-input").props.disabled, true);
});

test("the finder is the page's own overlay, and Enter plans what was typed", () => {
  const { st } = page({ words: "200 personal trainers in Austin" });
  let planned = 0;
  const tree = drawFinder(st, { onPlan: () => { planned += 1; } });
  const panel = byTestId(tree, "lead-finder");
  assert.equal(panel.props.role, "dialog");
  assert.match(panel.props.className, /\bpl-finder\b/, "PL_OVERLAY excludes .pl-finder, so the page's keys stay awake");
  assert.equal(press(byTestId(tree, "finder-input"), "Enter"), true);
  assert.equal(planned, 1);
  click(byTestId(tree, "finder-plan"));
  assert.equal(planned, 2);
  assert.equal(byTestId(drawFinder(page({ words: "" }).st), "finder-plan").props.disabled, true, "nothing typed, nothing to plan");
  assert.equal(globalThis.window.LeadFinder({ open: false, stage: "compose", words: "", onWords() {}, onPlan() {}, onApprove() {}, onBack() {}, onClose() {} }), null);
});
```

- [ ] **Step 3: Run and see them fail.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-finder.test.mjs` → `Cannot find module '…/pages/leads-finder.jsx'`, 1 test, 0 pass, 1 fail.

- [ ] **Step 4: Write the composer.** `apps/dashboard/src/legacy/pages/leads-finder.jsx`, whole. (The card it draws is a placeholder that says the sentence; Task 9 replaces it with the real card, in this file, and Task 10 adds the strip at the foot.)

```jsx
/* global React, Icon */
// The finder: the composer an owner describes businesses in (Task 8), the plan
// card whose words are pickers (Task 9), and the strip that says what a round
// is doing and how it ended (Task 10). Hookless, as every part of People is:
// the stub React the tests draw on keys state by call order, so all of it
// lives in ClientsAReal and arrives here as props.
//
// Nothing here names the vendor that runs a search: the owner sees Claude
// finding businesses, and where each fact came from.

// The words a lead wears live once, in contracts; the bridge hands them over
// as window.__LEAD_VM (legacy-bridge/leads.ts). Read at draw time, never at
// load time: the page's scripts load before the bridge installs anything.
/* ------------------------------------------------------ the one Ask turn */

/**
 * The words the finder sends. scopeFromRoute("clients", "leads:...") answers
 * null on main (only a uuid on clients is a scope), so the turn goes with no
 * scope and the clients surface, and the question names Leads itself.
 */
const leadFinderAsk = (words) => `On People › Leads, find businesses I could reach: ${String(words || "").trim()}`;

/**
 * One Ask turn, through window.__ask.send (legacy-bridge/ask/api.ts). The
 * SendEvent shapes are that file's: thread, trace, delta, final, error. The
 * finder listens for the trace line while it waits and for the `final`
 * message: a lead_search proposal is the plan card, and words with no card are
 * a refusal said under the input. The page hands its setters in, so this is a
 * plain function the tests can run.
 */
const leadFinderPlan = async (words, set) => {
  const A = window.__ask;
  set.stage("thinking");
  set.refusal(null);
  set.proposal(null);
  set.plan(null);
  set.trace("Reading what you asked");
  if (!A || typeof A.send !== "function") {
    set.stage("compose");
    set.refusal("Claude isn't available here yet — try again in a moment.");
    return null;
  }
  let card = null;
  let said = "";
  await A.send({ text: leadFinderAsk(words), threadId: null, scope: null, surface: "clients" }, (ev) => {
    if (!ev || !ev.t) return;
    if (ev.t === "trace") set.trace(ev.text);
    else if (ev.t === "final") {
      const m = ev.message || {};
      said = m.text || "";
      card = (m.proposals || []).filter((p) => p && p.kind === "lead_search")[0] || null;
    } else if (ev.t === "error") said = ev.text || "";
  });
  if (card) {
    set.proposal(card);
    set.plan((card.payload || {}).plan || null);
    set.stage("plan");
    return card;
  }
  set.refusal(said || "Nothing came back — ask again in a moment.");
  set.stage("compose");
  return null;
};

/**
 * Find N leads. An Ask card goes through commitProposal (legacy-bridge
 * ask/commit.ts), which posts the plan to POST lead-searches marked as Ask's;
 * a plan the finder opened from a strip's next step goes through
 * __leadSearchMore on that search. Either way the route's own sentence on a
 * refusal (402, 409, 429) is said under the button, in its words.
 */
const leadFinderApprove = async (proposal, plan, set) => {
  set.stage("starting");
  set.refusal(null);
  let r;
  if (proposal) {
    const A = window.__ask;
    r = A && typeof A.commit === "function"
      ? await A.commit({ ...proposal, payload: { ...(proposal.payload || {}), plan } })
      : { ok: false, message: "Claude isn't available here yet — try again in a moment." };
  } else if (set.more && window.__leadSearchMore) {
    r = await window.__leadSearchMore(set.more.searchId, set.more.purpose || "topup", plan);
  } else {
    r = { ok: false, message: "Nothing to start — describe what you want again." };
  }
  if (r && r.ok) {
    set.stage("compose");
    set.open(false);
    set.words("");
    set.proposal(null);
    set.plan(null);
    return r;
  }
  set.refusal((r && (r.message || (r.error && r.error.message))) || "It didn't start. Try again in a moment.");
  set.stage("plan");
  return r;
};

// The card's body until Task 9: the plan as the one sentence contracts spells.
const LeadPlanCard = ({ plan }) => (plan ? (
  <div className="lf-plan" data-testid="lead-plan">
    <p className="lf-sentence" data-testid="plan-sentence">{(window.__LEAD_VM || {}).planSaid(plan)}</p>
  </div>
) : null);

/* -------------------------------------------------------- the composer -- */

/**
 * The finder itself: the input with a mic held to talk, the trace line while
 * Claude reads, the three suggestions, the refusal in words under the input,
 * and the plan card once a card comes back (sections 8.2, 8.3).
 *
 * stage: compose | thinking | plan | starting. Every hook it needs is
 * ClientsAReal's; `talk` is useAskTalk's answer (ask-hooks.jsx), declared
 * there and handed down, so nothing is recorded or uploaded here.
 */
const LeadFinder = ({
  open, stage, words, proposal, plan = null, facts = null, refusal, busy, trace, suggestions, talk, pick = null,
  onWords, onPlan, onChangePlan = () => {}, onApprove, onBack, onClose, onPick = () => {},
}) => {
  if (!open) return null;
  const card = proposal && proposal.payload ? proposal.payload : {};
  const shown = plan || card.plan || null;
  const composing = stage === "compose";
  const planning = stage === "plan" || stage === "starting";
  return (
    <div className="lf-panel pl-finder" role="dialog" aria-label="Find leads" data-testid="lead-finder">
      <div className="lf-compose">
        <span className={`lf-spark ${stage === "thinking" ? "live" : ""}`}><Icon name="sparkle" size={16} /></span>
        <input
          className="lf-input"
          type="text"
          value={words || ""}
          maxLength={400}
          placeholder="Describe the businesses you want"
          aria-label="Describe the businesses you want"
          data-testid="finder-input"
          disabled={!composing}
          onChange={(e) => onWords(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && composing && !busy && (words || "").trim()) { e.preventDefault(); onPlan(words); } }}
        />
        {talk && talk.canTalk ? (
          <button
            type="button"
            className={`lf-mic ${talk.listening ? "on" : ""}`}
            data-testid="finder-talk"
            aria-pressed={!!talk.listening}
            aria-label="Hold to talk"
            title="Hold to talk"
            disabled={!composing}
            onPointerDown={talk.start}
            onPointerUp={talk.stop}
            onPointerLeave={talk.stop}
            onPointerCancel={talk.stop}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Icon name="mic" size={14} />
          </button>
        ) : null}
        {composing ? (
          <button type="button" className="btn btn-primary btn-sm" data-testid="finder-plan" disabled={!!busy || !(words || "").trim()} onClick={() => onPlan(words)}>Plan it</button>
        ) : null}
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Close" data-testid="finder-close" onClick={onClose}><Icon name="x" size={12} /></button>
      </div>
      {composing && refusal ? <p className="lf-said" role="status" data-testid="finder-refusal">{refusal}</p> : null}
      {composing && suggestions && suggestions.items && suggestions.items.length ? (
        <div className="lf-examples" data-testid="finder-suggestions">
          <div className="lf-ex-h">Suggested for {suggestions.forWho}, from what your business does</div>
          {suggestions.items.slice(0, 3).map((s) => (
            <button key={s.words} type="button" className="lf-ex" data-testid="finder-suggestion" onClick={() => onWords(s.words)}>
              <Icon name="search" size={13} />
              <span>{s.words}</span>
              {s.reach ? <span className="k">{s.reach}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {stage === "thinking" ? (
        <div className="lf-think" role="status" data-testid="finder-thinking">
          <span className="ask-trace-dot" aria-hidden="true" />
          <span>{trace || "Reading what you asked"}</span>
        </div>
      ) : null}
      {planning && shown ? (
        <LeadPlanCard
          plan={shown}
          view={card.view || null}
          facts={facts || card.facts || null}
          baseVersion={(card.plan && card.plan.version) || 1}
          busy={stage === "starting" || !!busy}
          refusal={refusal}
          pick={pick}
          onPick={onPick}
          onChange={onChangePlan}
          onApprove={onApprove}
          onBack={onBack}
        />
      ) : null}
      <div className="lf-foot">
        <span className="lock"><Icon name="lock" size={12} />You can email and call leads. Texts and offers wait for their yes.</span>
        <span className="sp" />
        <span className="keys"><span className="kbd">{"↵"}</span>{composing ? "plan it" : "approve"}</span>
        <span className="keys"><span className="kbd">esc</span>close</span>
      </div>
    </div>
  );
};

Object.assign(window, { LeadFinder, LeadPlanCard, leadFinderPlan, leadFinderApprove, leadFinderAsk });
```

- [ ] **Step 5: The composer's styles.** Create `apps/dashboard/src/legacy/styles/leads.css` with its head comment and the finder's rules. Every rule is the canvas's (`lead-finder-design/canvas/lib.mjs:129–150`), on tokens `tokens.css` already publishes; Tasks 9 and 10 append the plan card's and the strip's to this same file.

```css
/* The Leads scope of People: the finder, the plan card and the strip.
   Every rule is the canvas's (lead-finder-design/canvas), on the tokens
   tokens.css already publishes. The seeded page's .ld-* rules are not reused:
   that page is retired (release B, Task 20). */

/* ---------------------------------------------------------- the finder -- */

.lf-panel {
  margin: 12px 28px 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg-raised);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  animation: lf-in 200ms var(--ease-out) backwards;
  flex: none;
}
@keyframes lf-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.lf-compose { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 16px; }
.lf-spark { color: var(--ink-dim); display: inline-flex; }
.lf-spark.live { color: var(--accent); }
.lf-input {
  flex: 1; min-width: 0; border: 0; outline: 0; background: transparent;
  font-family: inherit; font-size: 15px; letter-spacing: -0.01em; color: var(--ink); padding: 0;
}
.lf-input::placeholder { color: var(--ink-faint); }
.lf-mic {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--line);
  background: transparent; color: var(--ink-dim); cursor: pointer;
}
.lf-mic:hover { color: var(--ink); background: var(--bg-hover); }
.lf-mic.on { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
.lf-examples { display: flex; flex-direction: column; gap: 1px; padding: 0 8px 8px; }
.lf-ex-h { font-size: 11px; color: var(--ink-dim); padding: 2px 8px 4px; display: flex; gap: 6px; align-items: center; }
.lf-ex {
  display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; border: 0;
  background: transparent; text-align: left; cursor: pointer; font-size: 13px; color: var(--ink); width: 100%;
}
.lf-ex:hover { background: var(--bg-hover); }
.lf-ex .i { color: var(--ink-faint); }
.lf-ex .k { margin-left: auto; font-size: 11px; color: var(--ink-dim); white-space: nowrap; }
.lf-think { display: flex; align-items: center; gap: 10px; padding: 2px 16px 16px 44px; font-size: 12.5px; color: var(--ink-dim); }
.lf-said { font-size: 12px; color: var(--ink-dim); margin: 0; padding: 0 16px 10px 44px; }
.lf-foot {
  display: flex; align-items: center; gap: 14px; padding: 9px 16px;
  border-top: 1px solid var(--line); background: var(--bg-sunken); font-size: 11.5px; color: var(--ink-dim);
}
.lf-foot .sp { flex: 1; }
.lf-foot .lock { display: inline-flex; align-items: center; gap: 6px; }
.lf-foot .i { color: var(--ink-faint); }
.lf-foot .keys { display: inline-flex; align-items: center; gap: 6px; }
```

- [ ] **Step 6: Load the file and the stylesheet.** Both lists, in order (`legacy/CLAUDE.md`: a new file goes in BOTH, and `legacy-harness.test.mjs:64` holds them together).
  - `manifest.ts`, old: `import "@/legacy/pages/client-profile.jsx";` · new: that line, then `import "@/legacy/pages/leads-finder.jsx";`
  - `Chanlytics.html`, old: `  <script type="text/babel" src="pages/client-profile.jsx?v=20"></script>` · new: that line, then `  <script type="text/babel" src="pages/leads-finder.jsx?v=1"></script>`
  - `Chanlytics.html`, old: `  <link rel="stylesheet" href="styles/people.css?v=12" />` · new: that line, then `  <link rel="stylesheet" href="styles/leads.css?v=1" />`
  - `legacy-bridge/legacy.css`, old: `@import "../legacy/styles/people.css";` · new: that line, then `@import "../legacy/styles/leads.css";`
  - `legacy-bridge/legacy.css`, old: `/* The 18 legacy stylesheets in the EXACT Chanlytics.html cascade order —` · new: the same line with `19` for `18`.

  Task 2 registers `leads-scope.jsx` and `leads-peek.jsx` and must not add `leads-finder.jsx` a second time: `legacy-harness.test.mjs:64` fails on a doubled entry.

- [ ] **Step 7: Where the derivations come from (nothing is installed here).** The words are contracts' one `LEAD_WORDS` record, seeded as `window.__LEAD_WORDS` by `seed-globals.ts` (Task 12 step 8). The *functions* cannot live in a record of strings, so they get one global of their own beside it, `window.__LEAD_VM` — **installed in `seed-globals.ts` by Task 9 step 7a, where the functions it carries are written**, and grown by one name in Task 10 (`leadStrip`) and one in Task 19 (`leadEndingLine`). Nothing is added to `legacy-bridge/leads.ts` here: a bag of pure contracts functions is a global seeded once at boot, not a courier, and this task cannot import `planWords` before Task 9 writes it.

  This task's placeholder card reads `window.__LEAD_VM` at draw time (`(window.__LEAD_VM || {}).planSaid(plan)`), never at load, and its own tests install the bag by hand in the harness — which is why Task 8's five tests are green before any of Task 9's contracts code exists.

- [ ] **Step 8: Run and see them pass.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-finder.test.mjs legacy-harness.test.mjs` → 6 + 9 tests, all pass.

  Mutation checks, each once, each reverted: send the turn with `scope: { kind: "page", id: "leads" }` and the Ask-turn test fails on `[null, "clients", null]`; drop the `pl-finder` class and the overlay test fails; take one name back out of `icons.jsx` and the icon test fails on the fallback circle.

- [ ] **Step 9: Commit** — "The finder takes words or a held mic, asks once, and shows either a plan or the refusal in words". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

## Task 9: the plan card

**Files:** Modify `packages/contracts/src/lead-search.ts:167–205` (`planSentence` and the helpers around it), `packages/contracts/src/leads.ts` (Task 4.1's file), `apps/dashboard/src/server/leads.ts:83–84`, `apps/dashboard/src/legacy/pages/leads-finder.jsx` (Task 8's), `apps/dashboard/src/legacy/styles/leads.css`, `apps/dashboard/src/legacy/Chanlytics.html:19, :105`, `apps/dashboard/src/legacy/pages/ask-turn.jsx`, `tooling/scripts/tests/lead-search.test.mjs:41–48`, `tooling/scripts/tests/leads-vm.test.mjs` (Task 4.1's), `tooling/scripts/tests/leads-finder.test.mjs` (Task 8's)

**The sentence is derived once, and it is not derived from `plan.name`.** On main `planSentence` (`lead-search.ts:177–183`) writes ``Find ${plan.count} ${plan.name} in ${plan.area.label}``. Both halves are the model's own words, and both can carry the place: for a plan whose `name` is `"Hair salons in Brooklyn"` and whose `area.label` is `"in Brooklyn, NY"` it renders

> Find 60 Hair salons in Brooklyn in in Brooklyn, NY, then find their email and check it.

which is what the product's sentence must never say. So:

1. **The words of the sentence become the one derivation** — `planWords(plan)`, in `lead-search.ts`, returns the sentence as parts, each marked with the picker it opens: `count` (the plan's count), `who` (`planWho`), `where` (`planWhere(plan.area)`), one `criterion` per `plan.criteria` and `contact` (`plan.contact`). Nothing else is read.
2. **`planWho` takes the area out of the plural.** A trailing place clause (`in|near|around|within|across|throughout|at|inside|serving …`) whose words also appear in the area's label, query, ZIP, state code or state name is dropped; a clause about something else ("pharmacies inside supermarkets") is kept; a `name` that is only the area falls back to the plan's `terms`, which are the words the source is actually searched with (`cards.ts:88`, `searchStringsArray: [term]`, with `locationQuery` separate).
3. **`planWhere` puts exactly one preposition there, and it is code's.** A label that already says where it is (`"in Brooklyn, NY"`, `"within 25 miles of Austin"`) is said as it stands; anything else (`"Austin, TX"`, `"78704"`) gets `in `. Its twin `planArea` gives the bare noun, for a sentence that supplies its own preposition ("There are 3 personal trainers in Austin, TX") — Task 19's `leadEndingLine` reads that one.
4. **`planSentence` becomes `planSaid(plan) + planLeavingOut(plan)`** — the words joined, then what the plan leaves out. It keeps the same signature and the same value for a well-written plan, so Ask's card summary (`proposals.ts`, Task 6) and the runner's log keep their pin; the plan card draws the same `planWords` as buttons, so a card, a receipt and a log can never say the plan differently.

`plan.name` keeps its one job: the search's name in the rail (`lead_search_create` stores `left(p_plan->>'name', 120)` as `lead_searches.name`, `00140:1448–1449`). The sentence never reads it directly again.

- [ ] **Step 1: The failing contracts tests.** Append to `tooling/scripts/tests/lead-search.test.mjs`, and add `planWords, planWho, planWhere, planArea, planMinutes, planSaid, planLeavingOut, LEAD_COUNT_CHOICES, LEAD_ASSUMED_YIELD,` to its import from `lead-search.ts` (after `endingOfRound, cleanEmailCandidates, usPhone, siteHost, stateCode, leadMonth,`):

```js
/* ------------------------------------------------ the sentence, derived once (release B, Task 9) */

/** The plan a model wrote with the area inside its plural, and a label that says "in" for itself. */
const brooklyn = (over = {}) => LeadSearchPlanSchema.parse({
  version: 1, card: "local_businesses", name: "Hair salons in Brooklyn", asked: "60 hair salons in Brooklyn",
  terms: ["hair salon", "beauty salon"],
  area: { kind: "city", label: "in Brooklyn, NY", state: "NY", center: { lat: 40.6782, lng: -73.9442 }, radius_m: 15_000, query: "Brooklyn, NY, USA" },
  count: 60, contact: "email", criteria: [], exclusions: [],
  ...over,
});

test("REGRESSION: the sentence says the area once -- a plural that carried the area read \"Find 60 Hair salons in Brooklyn in in Brooklyn, NY\"", () => {
  assert.equal(planSentence(brooklyn()), "Find 60 hair salons in Brooklyn, NY, then find their email and check it.");
  assert.equal(planWho(brooklyn()), "hair salons", "the place clause whose words are the area's is dropped");
  assert.equal(planWhere(brooklyn().area), "in Brooklyn, NY", "the label already says where: no second preposition");
  assert.equal(planArea(brooklyn().area), "Brooklyn, NY", "and the bare noun, for a sentence that says its own \"in\"");
  assert.equal(planWho(brooklyn({ name: "Pharmacies inside supermarkets", terms: ["pharmacy"] })), "pharmacies inside supermarkets", "a clause about something else is kept");
  assert.equal(planWho(brooklyn({ name: "in Brooklyn" })), "hair salon and beauty salon", "a plural that is only the area falls back to the terms");
  const radius = { kind: "radius", label: "within 25 miles of Austin", state: "TX", center: { lat: 30.2672, lng: -97.7431 }, radius_m: 40_000, query: "Austin, TX, USA" };
  assert.deepEqual([planWhere(radius), planArea(radius)], ["within 25 miles of Austin", "Austin"]);
  assert.equal(planWhere({ kind: "zip", label: "78704", state: "TX", center: null, radius_m: 5_000, zip: "78704", query: "78704" }), "in 78704");
});

test("the sentence is the plan card's words joined: every picker is one word of it, and nothing else reads the plan", () => {
  const p = plan();
  assert.deepEqual(planWords(p).filter((w) => w.pick).map((w) => [w.pick, w.text]), [
    ["count", "200"], ["who", "personal trainers"], ["where", "in Austin, TX"], ["criterion", "with a website"], ["contact", "then find their email and check it"],
  ]);
  assert.equal(planWords(p).find((w) => w.pick === "criterion").key, "website", "a criterion word names the criterion it opens");
  assert.equal(planSaid(p), "Find 200 personal trainers in Austin, TX with a website, then find their email and check it.");
  assert.equal(planLeavingOut(p), " Leaving out: chain gyms.");
  assert.equal(planSentence(p), `${planSaid(p)}${planLeavingOut(p)}`, "one derivation: the receipt and the card cannot say the plan differently");
  assert.equal(planLeavingOut(plan({ exclusions: [] })), "");
  const phone = plan({ contact: "phone" });
  assert.equal(planWords(phone).find((w) => w.pick === "contact").text, "a phone is enough");
});

test("the count picker's options each say about how long they take, and a plan never claims under two minutes", () => {
  const three = (n) => plan({ count: n, terms: ["personal trainer", "strength coach", "fitness coach"] });
  assert.deepEqual([...LEAD_COUNT_CHOICES], [50, 100, 200, 500]);
  assert.deepEqual(LEAD_COUNT_CHOICES.map((n) => planMinutes(three(n))), [3, 5, 8, 8], "the canvas's 3, 5 and 8; 500 is the same round, capped at what one round may ask for");
  assert.equal(planMinutes(plan({ count: 1 })), 2, "never under two minutes");
  assert.equal(LEAD_ASSUMED_YIELD, 0.5);
});
```

and append to `tooling/scripts/tests/leads-vm.test.mjs` (Task 4.1's file), whose imports gain `leadPlanAsk, leadPlanFacts, leadPlanLikely` from `packages/contracts/src/leads.ts`. `CARD_PLAN` is the plan Task 10's fixtures also use:

```js
const CARD_PLAN = LeadSearchPlanSchema.parse({
  version: 1, card: "local_businesses", name: "personal trainers", asked: "200 personal trainers in Austin with a website",
  terms: ["personal trainer", "strength coach", "fitness coach"],
  area: { kind: "city", label: "Austin, TX", state: "TX", center: { lat: 30.2672, lng: -97.7431 }, radius_m: 25_000, query: "Austin, TX, USA" },
  count: 200, contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
});

/* ------------------------------------------------- the plan card's words */

const FACTS = { dupes: 14, leadsLeft: 486, bound: null, prior: { places: 1_200, matched: 700, with_email: 406 }, priorOf: "trainers", cannotSee: null, renewsOn: "Oct 1", nearby: [] };

test("the plan card's facts are the PRD's three, in leads, with no dollar meter", () => {
  assert.deepEqual(leadPlanFacts(CARD_PLAN, FACTS), [
    "About 8 minutes — leave the page if you like",
    "Skips the 14 already yours",
    "Counts only matches you can reach · 486 left this month",
  ]);
  assert.equal(/\$/.test(leadPlanFacts(CARD_PLAN, FACTS).join(" ")), false);
});

test("Likely says what past searches found, and a kind never searched says the share is checked after the first 25", () => {
  assert.deepEqual(leadPlanLikely(CARD_PLAN, FACTS), { emailPct: 58, phonePct: 42, line: "About 116 will have an email; the rest you call · from past searches for trainers" });
  const fresh = leadPlanLikely(CARD_PLAN, { ...FACTS, prior: null });
  assert.deepEqual(fresh, { emailPct: null, phonePct: null, line: "How many have an email is checked after the first 25." });
  const thin = leadPlanLikely(CARD_PLAN, { ...FACTS, prior: { places: 12, matched: 7, with_email: 4 } });
  assert.equal(thin.emailPct, null, "too few places judged to say a number from");
});

test("when a limit binds, the count is clamped to what is left, the button says that number and one sentence says why", () => {
  assert.deepEqual(leadPlanAsk(CARD_PLAN, FACTS), { count: 200, label: "Find 200 leads", covers: null });
  const budget = leadPlanAsk(CARD_PLAN, { ...FACTS, leadsLeft: 60, bound: "budget" });
  assert.deepEqual(budget, { count: 60, label: "Find 60 leads", covers: "Emails for personal trainers are hard to find, so this month covers about 60 more. Find 60 now?" });
  const month = leadPlanAsk(CARD_PLAN, { ...FACTS, leadsLeft: 36, bound: "allowance" });
  assert.deepEqual(month, { count: 36, label: "Find 36 leads", covers: "You have 36 leads left this month. Your leads renew on Oct 1." });
  assert.equal(/\$/.test(`${budget.covers} ${month.covers}`), false, "no dollar meter, ever");
  assert.equal(leadPlanAsk(CARD_PLAN, { ...FACTS, leadsLeft: 600, bound: "allowance" }).covers, null, "a limit above the ask does not bind");
});
```

- [ ] **Step 2: The failing card tests.** Append to `tooling/scripts/tests/leads-finder.test.mjs` (Task 8's head gives every helper and fixture):

```js
/* ------------------------------------------------- Task 9: the plan card */

const drawCard = (st, over = {}) => {
  seq = 0;
  return globalThis.window.LeadPlanCard({
    plan: st.plan, view: { title: "Find 200 personal trainers" }, facts: FACTS, busy: false, refusal: st.refusal,
    baseVersion: 1, pick: st.pick, onPick: (v) => { st.pick = v; },
    onChange: (p) => { st.plan = p; }, onApprove: () => {}, onBack: () => {}, ...over,
  });
};
/** Open a picker and take one of its options: what a mouse does, in two presses. */
const pickOption = (st, id, option, over = {}) => {
  click(byTestId(drawCard(st, over), `plan-${id}`));
  click(byTestId(drawCard(st, over), `plan-${id}-${option}`));
};

test("a changed count re-plans without the model, and a changed area makes a new version the owner approves", () => {
  const sent = [];
  globalThis.window.__ask = { send: async (i) => { sent.push(i); } };
  const st = { plan: PLAN, pick: null, refusal: null };
  assert.equal(textOf(byTestId(drawCard(st), "plan-sentence")), "Find 200 personal trainers in Austin, TX with a website, then find their email and check it.");
  pickOption(st, "count", "50");
  assert.equal(textOf(byTestId(drawCard(st), "plan-sentence")), "Find 50 personal trainers in Austin, TX with a website, then find their email and check it.");
  assert.equal(st.plan.version, 2, "the count is one of the five that make a new version (S15; planVersionOf on main)");
  const counts = byTestId((click(byTestId(drawCard(st), "plan-count")), drawCard(st)), "plan-count-50");
  assert.match(textOf(counts), /about 3 min/, "every count says about how long it takes");
  st.pick = null;
  pickOption(st, "area", "Round Rock, TX");
  assert.equal(st.plan.version, 3, "and so is the area");
  assert.equal(textOf(byTestId(drawCard(st), "plan-sentence")), "Find 50 personal trainers in Round Rock, TX with a website, then find their email and check it.");
  assert.equal(textOf(byTestId(drawCard(st), "plan-changed")), "changed");
  assert.equal(sent.length, 0, "no model call: a picked word re-plans on the page");
});

test("the contact standard is in the sentence and its picker switches it, and the sentence says so", () => {
  const st = { plan: PLAN, pick: null, refusal: null };
  const tok = byTestId(drawCard(st), "plan-contact");
  assert.equal(textOf(tok), "then find their email and check it");
  assert.equal(tok.props["aria-haspopup"], "listbox");
  pickOption(st, "contact", "phone");
  assert.equal(textOf(byTestId(drawCard(st), "plan-contact")), "a phone is enough");
  assert.equal(st.plan.version, 2, "the contact standard makes a new version");
  const open = (click(byTestId(drawCard(st), "plan-contact")), drawCard(st));
  const box = byTestId(open, "plan-contact-options");
  assert.equal(box.props.role, "listbox");
  assert.deepEqual(all(box, (n) => n.props?.role === "option").map((n) => n.props["aria-selected"]), [false, true]);
  assert.equal(press(byTestId(open, "plan-contact"), "Escape"), true, "Esc closes the picker here, before the page's listener");
  assert.equal(st.pick, null);
});

test("a criterion says how sure it has to be, and a fact the card cannot see is said before anything is spent, with the likely version offered", () => {
  const seen = planVersionOf(PLAN, { criteria: [{ key: "otc", text: "Already sell OTC medicine", standard: "seen", required: true }] });
  const cannotSee = { key: "otc", text: "Already sell OTC medicine", likely: "Could sell OTC medicine" };
  const st = { plan: seen, pick: null, refusal: null };
  const facts = { ...FACTS, cannotSee };
  const tree = drawCard(st, { facts });
  assert.match(textOf(byTestId(tree, "plan-sentence")), /already sell OTC medicine \(confirmed\)/);
  assert.match(textOf(byTestId(tree, "plan-cannot-see")), /can't be confirmed\. Nothing has been spent\./);
  assert.equal(byTestId(tree, "plan-approve").props.disabled, true, "nothing starts until the owner chooses");
  click(byTestId(tree, "plan-take-likely"));
  assert.deepEqual([st.plan.criteria[0].standard, st.plan.criteria[0].text], ["likely", "Could sell OTC medicine"]);
  assert.equal(byTestId(drawCard(st, { facts }), "plan-approve").props.disabled, false, "chosen: it can start");
  assert.equal(byTestId(drawCard(st, { facts }), "plan-cannot-see"), null);
  const other = { plan: seen, pick: null, refusal: null };
  click(byTestId(drawCard(other, { facts }), "plan-drop-unseen"));
  assert.deepEqual(other.plan.criteria, [], "or the criterion goes, and the sentence with it");
});

test("Leaving out is chips the owner can take back, Likely says what past searches found, and the facts are in leads with no dollar meter", () => {
  const st = { plan: PLAN, pick: null, refusal: null };
  const tree = drawCard(st);
  assert.equal(textOf(byTestId(tree, "plan-likely")), "About 116 will have an email; the rest you call · from past searches for trainers");
  assert.equal(textOf(byTestId(tree, "plan-facts")), "About 8 minutes — leave the page if you likeSkips the 14 already yoursCounts only matches you can reach · 486 left this month");
  assert.equal(/\$/.test(textOf(tree)), false, "there is no dollar meter");
  const chip = byTestId(tree, "plan-leaving-chain");
  assert.match(textOf(chip), /Chain gyms/);
  click(find(chip, (n) => n.type === "button"));
  assert.deepEqual(st.plan.exclusions, [], "the chip is removable");
  assert.equal(st.plan.version, 2, "and that is a new version");
  assert.equal(byTestId(drawCard(st), "plan-leaving"), null);
  const fresh = drawCard({ plan: PLAN, pick: null, refusal: null }, { facts: { ...FACTS, prior: null } });
  assert.equal(textOf(byTestId(fresh, "plan-likely")), "How many have an email is checked after the first 25.");
});

test("Find N leads commits the card through the route, and a refusal is said under the button in the route's words", async () => {
  const committed = [];
  globalThis.window.__ask = { commit: async (p) => { committed.push(p); return { ok: false, message: "This month's searching budget is used. A smaller search, or a phone standard, may still fit." }; } };
  const { st, set } = page({ stage: "plan", proposal: CARD, plan: PLAN });
  await globalThis.window.leadFinderApprove(st.proposal, st.plan, set);
  assert.equal(committed.length, 1);
  assert.equal(committed[0].payload.plan.count, 200, "the plan the card holds, not the one the model first wrote");
  assert.deepEqual([st.stage, st.open], ["plan", true], "a refused start leaves the card where it was");
  const refused = byTestId(drawCard({ plan: PLAN, pick: null, refusal: st.refusal }), "plan-refusal");
  assert.equal(textOf(refused), "This month's searching budget is used. A smaller search, or a phone standard, may still fit.");
  assert.equal(refused.props.role, "alert");
  globalThis.window.__ask = { commit: async () => ({ ok: true, receipt: "Finding 200 personal trainers. It carries on if you leave; Leads shows it.", undo: { search_id: "s1" } }) };
  const ok = page({ stage: "plan", proposal: CARD, plan: PLAN, words: "x" });
  const r = await globalThis.window.leadFinderApprove(ok.st.proposal, ok.st.plan, ok.set);
  assert.deepEqual([r.ok, ok.st.open, ok.st.stage, ok.st.proposal, ok.st.words], [true, false, "compose", null, ""], "the strip takes over from the surface's newest search");
});

test("near the month's limit the card offers what is left and says when the leads renew", () => {
  const st = { plan: PLAN, pick: null, refusal: null };
  const month = drawCard(st, { facts: { ...FACTS, leadsLeft: 36, bound: "allowance" } });
  assert.equal(textOf(byTestId(month, "plan-approve")), "Find 36 leads");
  assert.equal(textOf(byTestId(month, "plan-covers")), "You have 36 leads left this month. Your leads renew on Oct 1.");
  const budget = drawCard(st, { facts: { ...FACTS, leadsLeft: 60, bound: "budget" } });
  assert.equal(textOf(byTestId(budget, "plan-covers")), "Emails for personal trainers are hard to find, so this month covers about 60 more. Find 60 now?");
  let approved = null;
  click(byTestId(drawCard(st, { facts: { ...FACTS, leadsLeft: 36, bound: "allowance" }, onApprove: (p) => { approved = p; } }), "plan-approve"));
  assert.deepEqual([approved.count, approved.version], [36, 2], "the clamped count is what is approved, as a new version");
  assert.equal(byTestId(drawCard(st), "plan-covers"), null, "nothing to say when nothing binds");
});
```

- [ ] **Step 3: Run and see them fail.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/lead-search.test.mjs leads-vm.test.mjs leads-finder.test.mjs` → `planWords is not a function` in the first, `leadPlanFacts is not defined` in the second, and the six card tests fail on `plan-count`.

- [ ] **Step 4: The sentence, derived once.** In `packages/contracts/src/lead-search.ts`, replace main's `planSentence` block whole. Old (`:172–183`, the comment through the closing brace):

```ts
/**
 * The plan as one sentence, whose words are the controls (§7 step 2, §8.3).
 * "Find 200 personal trainers in Austin, TX with a website, then find their
 * email and check it. Leaving out: chain gyms." A seen criterion says so.
 */
export function planSentence(plan: LeadSearchPlan): string {
  const have = plan.criteria.map((c) => (c.standard === "seen" ? `${lowerFirst(c.text)} (confirmed)` : lowerFirst(c.text)));
  const contact = plan.contact === "email" ? "then find their email and check it" : "a phone is enough";
  const head = `Find ${plan.count} ${plan.name} in ${plan.area.label}${have.length ? ` ${list(have)}` : ""}, ${contact}.`;
  const out = plan.exclusions.map((e) => lowerFirst(e.text));
  return out.length ? `${head} Leaving out: ${list(out)}.` : head;
}
```

New:

```ts
/** A place clause the model may have written into the plural it was asked for ("hair salons in Brooklyn"). */
const PLACE_CLAUSE = /\s+(?:in|near|around|within|across|throughout|at|inside|serving)\s+\S.*$/i;
/** A label that already says where it is ("in Brooklyn, NY", "within 25 miles of Austin"). */
const SAYS_WHERE = /^(?:in|near|around|within|across|throughout|at|inside)\s+/i;
const US_NAMES: Record<string, string> = Object.fromEntries(Object.entries(US_STATES).map(([name, code]) => [code, name]));
const bits = (s: string): string[] => s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];

/**
 * The plural the sentence calls them, with the area taken out of it (§8.3).
 * `name` is the model's own words, and a model asked for a plural writes the
 * place into it ("Hair salons in Brooklyn"), which the sentence then says
 * twice. A trailing place clause whose words are the area's is dropped; a
 * clause about something else ("pharmacies inside supermarkets") is kept. With
 * nothing left, the terms say who is sought, since those are the words the
 * source is actually searched with.
 */
export function planWho(plan: LeadSearchPlan): string {
  const m = PLACE_CLAUSE.exec(plan.name);
  const a = plan.area;
  const known = new Set(bits(`${a.label} ${a.query} ${a.zip ?? ""} ${a.state} ${US_NAMES[a.state] ?? ""}`));
  const whole = SAYS_WHERE.test(plan.name) && bits(plan.name).some((w) => known.has(w));
  const cut = whole ? "" : m && bits(m[0]).some((w) => known.has(w)) ? plan.name.slice(0, m.index).trim() : plan.name.trim();
  return lowerFirst(cut) || list(plan.terms.map(lowerFirst));
}

/**
 * Where the sentence says to look, with exactly one preposition -- code's, not
 * the model's. A label that already says where it is ("in Brooklyn, NY",
 * "within 25 miles of Austin") is said as it stands; anything else gets "in".
 */
export function planWhere(area: LeadArea): string {
  const label = area.label.trim();
  return SAYS_WHERE.test(label) ? label : `in ${label}`;
}

/**
 * The area as a bare noun, for a sentence that supplies its own preposition
 * ("There are 3 personal trainers in Austin, TX"): the label with a leading
 * place word and a radius phrase taken off, so nothing says "in" twice.
 */
export function planArea(area: LeadArea): string {
  const bare = area.label.trim().replace(/^within\s+[\d.]+\s*\w+\s+of\s+/i, "").replace(/^(?:in|at|inside|near|around|throughout|across)\s+/i, "").trim();
  return bare || area.label.trim();
}

/** One part of the plan's sentence: plain words, or a word the plan card makes a picker of. */
export interface LeadPlanWord {
  text: string;
  /** Which picker this word opens on the card; null for the words between the pickers. */
  pick: "count" | "who" | "where" | "criterion" | "contact" | null;
  /** The criterion this word is, for a criterion picker. */
  key?: string;
}

/**
 * The plan as the words of one sentence, each marked with the picker it opens
 * (§7 step 2, §8.3): "Find 200 personal trainers in Austin, TX with a website,
 * then find their email and check it." The count, the plural, the area, each
 * criterion and the contact standard are the plan's own; nothing here reads
 * anything else. The sentence is derived once, here: the plan card draws these
 * words as buttons and `planSentence` joins them, so a card and a receipt can
 * never say the plan differently.
 */
export function planWords(plan: LeadSearchPlan): LeadPlanWord[] {
  const out: LeadPlanWord[] = [
    { text: "Find ", pick: null },
    { text: String(plan.count), pick: "count" },
    { text: " ", pick: null },
    { text: planWho(plan), pick: "who" },
    { text: " ", pick: null },
    { text: planWhere(plan.area), pick: "where" },
  ];
  for (const c of plan.criteria) {
    out.push({ text: " ", pick: null });
    out.push({ text: c.standard === "seen" ? `${lowerFirst(c.text)} (confirmed)` : lowerFirst(c.text), pick: "criterion", key: c.key });
  }
  out.push({ text: ", ", pick: null });
  out.push({ text: plan.contact === "email" ? "then find their email and check it" : "a phone is enough", pick: "contact" });
  out.push({ text: ".", pick: null });
  return out;
}

/** What the sentence's words say, with nothing marked: the sentence itself. */
export function planSaid(plan: LeadSearchPlan): string {
  return planWords(plan).map((w) => w.text).join("");
}

/** What the plan leaves out, as one clause: " Leaving out: chain gyms." Empty when it leaves out nothing. */
export function planLeavingOut(plan: LeadSearchPlan): string {
  const out = plan.exclusions.map((e) => lowerFirst(e.text));
  return out.length ? ` Leaving out: ${list(out)}.` : "";
}

/**
 * The plan as one sentence, for a receipt, an Ask card's summary and a log:
 * the sentence the card draws, and what it leaves out. Every caller reads the
 * same words (§8.3).
 */
export function planSentence(plan: LeadSearchPlan): string {
  return `${planSaid(plan)}${planLeavingOut(plan)}`;
}

/** The counts the card's picker offers, unless the owner asked for a number of their own (§8.3). */
export const LEAD_COUNT_CHOICES = [50, 100, 200, 500] as const;

/**
 * About how long a round takes, in minutes, for the card's "About 8 minutes --
 * leave the page if you like" and for the minutes beside each count in the
 * picker. From the places the round would ask for at the yield assumed before
 * a probe has measured one, the probe's own 25, and the card's rate. Never
 * under two minutes: a search that answers faster still reads as a moment.
 */
export function planMinutes(plan: LeadSearchPlan): number {
  const places = LEAD_PROBE_PLACES + placesToAsk(plan, plan.count, LEAD_ASSUMED_YIELD).total;
  return Math.max(2, Math.round(places / cardOf(plan).placesPerMinute));
}
```

Three more edits in the same file, each anchored on text that occurs once:

- Old: `/** A round's estimate is reserved with this much room (§13.3: the cap is the estimate with room). */` · New: that line preceded by

```ts
/** The yield assumed before a probe has measured one: half the places asked for qualify. The card's minutes and the route's estimate both read it. */
export const LEAD_ASSUMED_YIELD = 0.5;
```

- Old:

```ts
  /** One search on the source tops out near this many places (§7 step 3). */
  maxPerTerm: number;
```

New: those two lines, then

```ts
  /** How many places this card gets through in a minute, discovery, contacts, judging and checks together: the card's "About 8 minutes". */
  placesPerMinute: number;
```

- Old: `    maxPerTerm: 120,` · New: that line, then `    placesPerMinute: 50,`

And in `apps/dashboard/src/server/leads.ts` (release A's), so the number lives once — old:

```ts
/** The yield assumed before a probe has measured one: half the places qualify. */
export const ASSUMED_YIELD = 0.5;
```

New:

```ts
/** The yield assumed before a probe has measured one: half the places qualify (contracts' LEAD_ASSUMED_YIELD, which the plan card's minutes read too). */
export const ASSUMED_YIELD = LEAD_ASSUMED_YIELD;
```

with `LEAD_ASSUMED_YIELD` added to that file's import from `@chanlytics/contracts`.

- [ ] **Step 5: The card's words, in `packages/contracts/src/leads.ts`.** Append to Task 4.1's file:

```ts
/* --------------------------------------------- the plan card (Task 9) -- */

/** What the card knows beyond the plan: the reads release A's doors answer, folded into one unit (§0.2). */
export interface LeadPlanFacts {
  /** Places already in People or Leads this plan would skip: "Skips the 14 already yours". */
  dupes: number;
  /** Leads this month still covers, every limit folded in. */
  leadsLeft: number;
  /** Which limit made that number, when one of them binds before the plan's own count. */
  bound: "allowance" | "budget" | null;
  /** The platform-wide prior for this kind of business (lead_niche_prior), or null when it was never searched. */
  prior: { places: number; matched: number; with_email: number } | null;
  /** The kind of business the prior is for, in the owner's words: "trainers". */
  priorOf: string | null;
  /** A must-be-seen criterion the chosen card cannot see (§0.1), with the likely version offered. */
  cannotSee: { key: string; text: string; likely: string } | null;
  /** The day the month's leads renew, in the workspace's zone: "Oct 1". */
  renewsOn: string;
  /** Claude's nearby areas, for the card's area picker and for a round further out. */
  nearby: LeadArea[];
}

/** Under this many places judged, a prior is too thin to say a number from. */
export const LEAD_PRIOR_MIN_PLACES = 50;

/**
 * The Likely line and its two-part bar (§8.3): what past searches for this
 * kind of business found, never a promise about this one. A kind never
 * searched says the share is checked after the first 25 (P3).
 */
export function leadPlanLikely(plan: LeadSearchPlan, facts: LeadPlanFacts): { emailPct: number | null; phonePct: number | null; line: string } {
  const p = facts.prior;
  if (!p || p.places < LEAD_PRIOR_MIN_PLACES || p.matched <= 0) {
    return { emailPct: null, phonePct: null, line: "How many have an email is checked after the first 25." };
  }
  const share = Math.min(1, p.with_email / p.matched);
  const emailPct = Math.round(share * 100);
  const withEmail = Math.round(plan.count * share);
  const of = facts.priorOf ? ` · from past searches for ${facts.priorOf}` : "";
  return { emailPct, phonePct: 100 - emailPct, line: `About ${withEmail} will have an email; the rest you call${of}` };
}

/** The facts under the sentence (§8.3), in the one unit the owner has: leads. No dollar meter. */
export function leadPlanFacts(plan: LeadSearchPlan, facts: LeadPlanFacts): string[] {
  return [
    `About ${planMinutes(plan)} minutes — leave the page if you like`,
    `Skips the ${facts.dupes} already yours`,
    `Counts only matches you can reach · ${facts.leadsLeft} left this month`,
  ];
}

/**
 * What the card asks for, and how it says why it is not what was typed (§0.2,
 * decision 27). When a limit binds the count is clamped to what is left, the
 * button says that number, and one sentence says which limit and what else
 * would fit. There is no dollar meter, and the word is always leads.
 */
export function leadPlanAsk(plan: LeadSearchPlan, facts: LeadPlanFacts): { count: number; label: string; covers: string | null } {
  const binds = facts.bound !== null && facts.leadsLeft < plan.count;
  const count = binds ? Math.max(0, facts.leadsLeft) : plan.count;
  const label = `Find ${count} lead${count === 1 ? "" : "s"}`;
  if (!binds) return { count, label, covers: null };
  const who = planWho(plan);
  const covers = facts.bound === "budget"
    ? `Emails for ${who} are hard to find, so this month covers about ${count} more. Find ${count} now?`
    : `You have ${count} lead${count === 1 ? "" : "s"} left this month. Your leads renew on ${facts.renewsOn}.`;
  return { count, label, covers };
}
```

That file's import from `./lead-search` gains `planMinutes`, `planWho` and `type LeadArea`.

- [ ] **Step 6: The card itself.** In `apps/dashboard/src/legacy/pages/leads-finder.jsx`, replace Task 8's placeholder card. Old:

```jsx
// The card's body until Task 9: the plan as the one sentence contracts spells.
const LeadPlanCard = ({ plan }) => (plan ? (
  <div className="lf-plan" data-testid="lead-plan">
    <p className="lf-sentence" data-testid="plan-sentence">{(window.__LEAD_VM || {}).planSaid(plan)}</p>
  </div>
) : null);
```

New:

```jsx
/* --------------------------------------------------------- the pickers -- */

// A picker is a button that opens a listbox of its own. It is not in
// PL_OVERLAY (the finder is the page's own overlay), so the page's keys stay
// awake behind it; Esc closes the picker here, before the page's listener.
const LeadPick = ({ id, label, cls, title, open, options, onOpen, onPick }) => (
  <span className="lf-pick">
    <button
      type="button"
      className={`tok ${cls || ""} ${open ? "open" : ""}`}
      data-testid={`plan-${id}`}
      title={title || label}
      aria-haspopup="listbox"
      aria-expanded={!!open}
      onClick={() => onOpen(open ? null : id)}
      onKeyDown={(e) => { if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); onOpen(null); } }}
    >
      {label}
    </button>
    {open ? (
      <span className="lf-pop" role="listbox" aria-label={title || label} data-testid={`plan-${id}-options`}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`lf-pop-row ${o.on ? "on" : ""}`}
            role="option"
            aria-selected={!!o.on}
            data-testid={`plan-${id}-${o.id}`}
            onClick={() => { onOpen(null); onPick(o); }}
          >
            <span className="tab">{o.label}</span>
            {o.note ? <span className="r">{o.note}</span> : null}
          </button>
        ))}
        {options.length === 0 ? <span className="lf-pop-note">Change what I asked to change this.</span> : null}
      </span>
    ) : null}
  </span>
);

/* ------------------------------------------------------- the plan card -- */

/**
 * The plan as one sentence whose words are pickers, what it leaves out, how
 * many are likely to have an email, the facts in leads, and the two buttons
 * (sections 8.3, 0.1, 0.2). A picked word re-plans here, on the page, through
 * planVersionOf and planWords: no model call, ever.
 */
const LeadPlanCard = ({ plan, view, facts, busy, refusal, baseVersion = 1, pick = null, onPick = () => {}, onChange, onApprove, onBack }) => {
  const C = window.__LEAD_VM || {};
  if (!plan) return null;
  const f = facts || { dupes: 0, leadsLeft: 0, bound: null, prior: null, priorOf: null, cannotSee: null, renewsOn: "", nearby: [] };
  const change = (over) => onChange(C.planVersionOf(plan, over));
  const likely = C.leadPlanLikely(plan, f);
  const ask = C.leadPlanAsk(plan, f);
  const cannot = f.cannotSee && plan.criteria.some((c) => c.key === f.cannotSee.key && c.standard === "seen") ? f.cannotSee : null;
  const options = (id) => {
    if (id === "count") {
      const choices = C.LEAD_COUNT_CHOICES || [50, 100, 200, 500];
      const counts = choices.includes(plan.count) ? [...choices] : [...choices, plan.count].sort((a, b) => a - b);
      return counts.map((n) => ({ id: String(n), label: String(n), note: `about ${C.planMinutes({ ...plan, count: n })} min`, on: n === plan.count, apply: () => change({ count: n }) }));
    }
    if (id === "area") {
      return [plan.area, ...(f.nearby || [])].map((a) => ({ id: a.label, label: C.planWhere(a), on: a.label === plan.area.label, apply: () => change({ area: a }) }));
    }
    if (id === "contact") {
      return [
        { id: "email", label: "then find their email and check it", on: plan.contact === "email", apply: () => change({ contact: "email" }) },
        { id: "phone", label: "a phone is enough", note: "goes further this month", on: plan.contact === "phone", apply: () => change({ contact: "phone" }) },
      ];
    }
    if (id === "who") return [];
    const c = plan.criteria.filter((x) => x.key === id)[0];
    if (!c) return [];
    return [
      { id: "seen", label: "It has to be seen", on: c.standard === "seen", apply: () => change({ criteria: plan.criteria.map((x) => (x.key === c.key ? { ...x, standard: "seen" } : x)) }) },
      { id: "likely", label: "Claude's read is enough", on: c.standard === "likely", apply: () => change({ criteria: plan.criteria.map((x) => (x.key === c.key ? { ...x, standard: "likely" } : x)) }) },
      { id: "drop", label: "Take it out of the plan", apply: () => change({ criteria: plan.criteria.filter((x) => x.key !== c.key) }) },
    ];
  };
  const words = C.planWords(plan).map((w, i) => {
    if (!w.pick) return <span key={`w${i}`}>{w.text}</span>;
    const id = w.pick === "criterion" ? w.key : w.pick === "where" ? "area" : w.pick;
    return (
      <LeadPick
        key={`w${i}`}
        id={id}
        cls={w.pick === "count" ? "num" : ""}
        label={w.text}
        title={{ count: "Change how many", who: "Change who you want", area: "Change where to look", contact: "Change what to find" }[id] || "Change how sure this has to be"}
        open={pick === id}
        options={options(id)}
        onOpen={onPick}
        onPick={(o) => o.apply()}
      />
    );
  });
  return (
    <div className="lf-plan" data-testid="lead-plan">
      <p className="lf-sentence" data-testid="plan-sentence">{words}</p>
      {plan.version > baseVersion ? <span className="lf-changed" data-testid="plan-changed">changed</span> : null}
      {cannot ? (
        <div className="lf-cannot" role="status" data-testid="plan-cannot-see">
          <Icon name="dashring" size={13} />
          <span>A listing doesn't show that, so "{cannot.text}" can't be confirmed. Nothing has been spent.</span>
          <button type="button" className="btn btn-sm" data-testid="plan-take-likely" onClick={() => change({ criteria: plan.criteria.map((x) => (x.key === cannot.key ? { ...x, standard: "likely", text: cannot.likely } : x)) })}>{cannot.likely}</button>
          <button type="button" className="btn btn-ghost btn-sm" data-testid="plan-drop-unseen" onClick={() => change({ criteria: plan.criteria.filter((x) => x.key !== cannot.key) })}>Take it out</button>
        </div>
      ) : null}
      {plan.exclusions.length ? (
        <div className="lf-leaving" data-testid="plan-leaving">
          <span>Leaving out</span>
          {plan.exclusions.map((e) => (
            <span key={e.key} className="tok-x" data-testid={`plan-leaving-${e.key}`}>
              {e.text}
              <button type="button" aria-label={`Keep ${e.text}`} title="Don't leave these out" onClick={() => change({ exclusions: plan.exclusions.filter((x) => x.key !== e.key) })}><Icon name="x" size={11} /></button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="lf-likely" data-testid="plan-likely">
        {likely.emailPct === null ? null : (
          <span className="bar" aria-hidden="true">
            <span className="b-email" style={{ width: `${likely.emailPct}%` }} />
            <span className="b-phone" style={{ width: `${likely.phonePct}%` }} />
          </span>
        )}
        <span>{likely.line}</span>
      </div>
      <div className="lf-facts" data-testid="plan-facts">
        {C.leadPlanFacts(plan, f).map((t, i) => (
          <span key={t} className="lf-fact">
            <Icon name={["clock", "users", "shield"][i] || "shield"} size={13} />
            {t}
          </span>
        ))}
      </div>
      {ask.covers ? <p className="lf-said" data-testid="plan-covers">{ask.covers}</p> : null}
      {refusal ? <p className="field-error" role="alert" data-testid="plan-refusal">{refusal}</p> : null}
      <div className="lf-actions">
        <button
          type="button"
          className="btn btn-primary btn-lg"
          data-testid="plan-approve"
          disabled={!!busy || !!cannot || ask.count < 1}
          onClick={() => onApprove(ask.count === plan.count ? plan : C.planVersionOf(plan, { count: ask.count }))}
        >
          <Icon name="sparkle" size={13} />{busy ? "Starting…" : ask.label}
        </button>
        <button type="button" className="btn btn-ghost" data-testid="plan-back" onClick={onBack}>Change what I asked</button>
        {view && view.title ? <span className="lf-said" data-testid="plan-title">{view.title}</span> : null}
      </div>
    </div>
  );
};
```

and the file's last line — old: `Object.assign(window, { LeadFinder, LeadPlanCard, leadFinderPlan, leadFinderApprove, leadFinderAsk });` · new: `Object.assign(window, { LeadFinder, LeadPlanCard, LeadPick, leadFinderPlan, leadFinderApprove, leadFinderAsk });`

- [ ] **Step 7: The card's styles.** Append to `apps/dashboard/src/legacy/styles/leads.css` (the canvas, `lib.mjs:153–168, 291–300, 412–414`):

```css
/* ------------------------------------------------------- the plan card -- */

.lf-plan { padding: 2px 20px 16px 44px; display: flex; flex-direction: column; gap: 12px; }
.lf-sentence {
  font-size: 18px; line-height: 1.7; letter-spacing: -0.014em; color: var(--ink);
  max-width: 60ch; margin: 0; text-wrap: pretty;
}
.lf-pick { position: relative; display: inline-block; }
.tok {
  font-family: inherit; font-size: inherit; letter-spacing: inherit; line-height: 1.3; color: var(--ink);
  background: var(--bg-sunken); border: 1px solid var(--line); border-radius: 6px;
  padding: 1px 7px; margin: 0 1px; cursor: pointer; white-space: nowrap;
}
.tok:hover { border-color: var(--line-strong); background: var(--bg-hover); }
.tok.num { font-variant-numeric: tabular-nums; }
.tok.open { border-color: var(--ink-faint); box-shadow: 0 0 0 3px var(--bg-active); }
.lf-changed { align-self: flex-start; font-size: 11px; color: var(--ink-dim); }
.lf-pop {
  position: absolute; z-index: 12; top: calc(100% + 6px); left: 0; display: flex; flex-direction: column;
  background: var(--bg-raised); border: 1px solid var(--line); border-radius: 10px;
  box-shadow: var(--shadow-lg); padding: 6px; min-width: 228px;
}
.lf-pop-row {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px;
  font-size: 12.5px; color: var(--ink); border: 0; background: transparent; width: 100%; text-align: left; cursor: pointer;
}
.lf-pop-row:hover, .lf-pop-row.on { background: var(--bg-hover); }
.lf-pop-row .r { margin-left: auto; font-size: 11px; color: var(--ink-dim); font-variant-numeric: tabular-nums; white-space: nowrap; }
.lf-pop-note { font-size: 11px; color: var(--ink-dim); padding: 6px 8px 4px; line-height: 1.45; max-width: 260px; }
.lf-cannot { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 12.5px; color: var(--ink); }
.lf-cannot .i { color: var(--ink-dim); }
.lf-leaving { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 12px; color: var(--ink-dim); }
.tok-x {
  display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 4px 0 9px;
  border: 1px solid var(--line); border-radius: 999px; background: var(--bg-sunken); color: var(--ink); font-size: 12px;
}
.tok-x button {
  width: 18px; height: 18px; border: 0; border-radius: 999px; background: transparent;
  color: var(--ink-faint); display: grid; place-items: center; padding: 0; cursor: pointer;
}
.tok-x button:hover { color: var(--ink); background: var(--bg-hover); }
.lf-likely { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--ink-dim); flex-wrap: wrap; }
.lf-likely .bar { display: flex; width: 180px; height: 6px; border-radius: 999px; overflow: hidden; background: var(--bg-active); }
.lf-likely .bar span { display: block; height: 100%; }
.lf-likely .b-email { background: var(--ok); }
.lf-likely .b-phone { background: oklch(from var(--ok) l c h / 0.45); }
.lf-facts { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--ink-dim); }
.lf-fact { display: inline-flex; align-items: center; gap: 6px; }
.lf-fact .i { color: var(--ink-faint); }
.lf-actions { display: flex; align-items: center; gap: 8px; padding-top: 2px; }
```

`leads-finder.jsx` and `leads.css` are appended to here, in Task 10 and (the stylesheet) in Tasks 12–15, 17 and 18. No number is chosen in any of those tasks: its `?v=` is bumped once for the whole release, in Task 22's step 1a, one new number per file.

- [ ] **Step 7a: The derivations go on the window, once.** Every sentence the Leads pages say about a plan or a round is a contracts function; the legacy pages import nothing, so the functions are handed over in one bag beside the words. `apps/dashboard/src/legacy-bridge/seed-globals.ts` — its import (`:11`) gains `LEAD_COUNT_CHOICES, planArea, planMinutes, planSaid, planSentence, planVersionOf, planWhere, planWho, planWords, leadPlanAsk, leadPlanFacts, leadPlanLikely`, its `declare global` block gains the line below under `__LEAD_WORDS`, and after `window.__LEAD_WORDS = LEAD_WORDS;` (Task 12 step 8):

```ts
  // One derivation per fact: __LEAD_WORDS holds the words, __LEAD_VM holds what
  // derives them, and the pages spell neither. Task 10 adds `leadStrip` to this
  // object and Task 19 adds `leadEndingLine`, each where the function is written.
  window.__LEAD_VM = { planWords, planSaid, planSentence, planWho, planWhere, planArea, planMinutes, planVersionOf, LEAD_COUNT_CHOICES, leadPlanLikely, leadPlanFacts, leadPlanAsk };
```

  with `__LEAD_VM: { planWords: typeof planWords; planSaid: typeof planSaid; planSentence: typeof planSentence; planWho: typeof planWho; planWhere: typeof planWhere; planArea: typeof planArea; planMinutes: typeof planMinutes; planVersionOf: typeof planVersionOf; LEAD_COUNT_CHOICES: typeof LEAD_COUNT_CHOICES; leadPlanLikely: typeof leadPlanLikely; leadPlanFacts: typeof leadPlanFacts; leadPlanAsk: typeof leadPlanAsk; leadStrip?: typeof leadStrip; leadEndingLine?: typeof leadEndingLine };` in `seed-globals.ts`'s `declare global` block (the two optional members are imported as types only here and filled in by Tasks 10 and 19, where they stop being optional).

- [ ] **Step 8: The Ask card draws the same card.** `ask-turn.jsx`'s `lead_search` branch (Task 6 step 5 put the sentence there as a summary) draws `window.LeadPlanCard` instead, with the proposal's payload, the picked plan in that turn's own state and sent on Approve: in the card's summary slot, `p.kind === "lead_search" && window.LeadPlanCard ? window.LeadPlanCard({ plan: edited || p.payload.plan, view: p.payload.view, facts: p.payload.facts, busy, refusal: err, pick, onPick: setPick, onChange: setEdited, onApprove: () => onApprove({ ...p, payload: { ...p.payload, plan: edited || p.payload.plan } }), onBack: () => A.editReply(p) }) : <p className="ask-card-summary">{p.summary}</p>`, with `edited` and `pick` two more of that turn's hooks. (`ask-turn.jsx` is edited in Task 6 too; its `?v=` is bumped once for the whole release, in Task 22's step 1a.)

- [ ] **Step 9: Run and see them pass.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/lead-search.test.mjs leads-vm.test.mjs leads-finder.test.mjs lead-ask.test.mjs ask.test.mjs` → all pass; `node tooling/scripts/check-dist.mjs`, then keep only dists with a real diff.

  Mutation checks, each once, each reverted: make `planWho` return `lowerFirst(plan.name)` and the REGRESSION test fails; make `planWhere` always prefix `in ` and it fails again; make the count picker call `window.__ask.send` and "no model call" fails; drop `disabled` from the approve button and the cannot-see test fails.

- [ ] **Step 10: Commit** — "The plan is one sentence whose words are pickers, and it says the area once". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

## Task 10: the strip and the question

**Files:** Modify `packages/contracts/src/leads.ts` (Task 4.1's file; Task 19's `leadEndingLine` is its ending sentences), `apps/dashboard/src/legacy/pages/leads-finder.jsx`, `apps/dashboard/src/legacy/styles/leads.css`, `apps/dashboard/src/legacy/Chanlytics.html:19, :105`, `tooling/scripts/tests/leads-vm.test.mjs`, `tooling/scripts/tests/leads-finder.test.mjs`

**What the strip is.** One line above the table for the view's search, or the newest open one: a live dot while it runs, the question after 25 in the accent tint with `role="alert"`, or one of the nine endings with one next step. Every word of it is `leadStrip(search, now, extra)` in contracts, so the page says nothing of its own and the nightly can pin the same sentences. **The nine ending sentences are Task 19's `leadEndingLine(ending, facts)`** — the strip composes from it and never spells one; `LEAD_ENDING_WORDS` (release A) stays the ending's short name and rides along as `mark`, for the strip's accessible name and the kept-search menu. The running, checking and question lines are this task's.

**The columns `lead_searches_view` carries** are Task 4.2's (writer W2, settled): `ending_pending`, `waiting_since`, `ended_at`, `emails_checked`, `with_phone`, `undo_op_id` and `undo_version`, beside A's `state`, `ending`, `question`, `target`, `counted`, `qualified`, `review` and `excluded` (`00140:1936–1951`). The strip reads `emails_checked` for one fact said two ways — "41 emails checked" while a round runs and "88 you can email" when it ends — and `with_phone` for "72 by phone". It never reads `waiting_since` (the 24-hour question timeout is the server's).

**Undo on the Done strip** removes the leads the owner has not touched and gives their month back: `POST lead-searches/[id]/undo` (owner; W2's 4.4 route) → `lead_search_undo(p_search_id)`, answering `{removed, credited, op_id, version}`, or `{removed: 0, credited: 0, op_id: null, version: 1}` when every lead has been worked, or `{error: "running" | "too_late" | "removed"}`. The strip offers it while the round ended under 24 hours ago **and** the view carries no `undo_op_id` yet — once it does, the removal has happened and what the view holds is the operation the toast's own Undo puts back, through A's `POST lead-operations/[id]/undo { version }` (`lead_undo`'s `undo_search` branch, answering `{ok, restored, kept, recharged}`).

- [ ] **Step 1: The failing contracts tests.** Append to `tooling/scripts/tests/leads-vm.test.mjs`, whose imports gain `leadStrip, LEAD_ROUND_MAKERS` from `packages/contracts/src/leads.ts` and `LEAD_ROUND_ENDINGS` from `lead-search.ts` (Task 9's `CARD_PLAN` is the plan these fixtures carry):

```js
const NOW = new Date("2026-09-19T15:00:00Z");
const NOW = new Date("2026-09-19T15:00:00Z");
const CARD_PLAN = LeadSearchPlanSchema.parse({
  version: 1, card: "local_businesses", name: "personal trainers", asked: "200 personal trainers in Austin with a website",
  terms: ["personal trainer", "strength coach", "fitness coach"],
  area: { kind: "city", label: "Austin, TX", state: "TX", center: { lat: 30.2672, lng: -97.7431 }, radius_m: 25_000, query: "Austin, TX, USA" },
  count: 200, contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
});

const search = (round = {}, plan = CARD_PLAN) => ({
  id: "5e000000-0000-4000-8000-000000000001",
  name: "Personal trainers · Austin", asked: plan.asked, asked_on: "2026-09-18T10:00:00Z", plan, plan_version: plan.version,
  round: round === null ? null : {
    id: "5e000000-0000-4000-8000-0000000000a1", seq: 1, purpose: "probe", state: "running", ending: null, ending_pending: null,
    question: null, target: 200, counted: 0, qualified: 0, review: 0, excluded: 0, emails_checked: 0, with_phone: 0,
    cost_usd: 0, ended_at: null, undo_op_id: null, undo_version: null, ...round,
  },
});
const ended = (ending, over = {}) => search({ state: "ended", ending, counted: 61, excluded: 40, emails_checked: 34, with_phone: 27, ended_at: "2026-09-19T14:00:00Z", ...over });
const ids = (vm) => vm.actions.map((a) => a.id);

test("the running strip says what is true and offers Stop; the estimate says it updates after the first 25, and stops saying it once they are in", () => {
  const vm = leadStrip(search({ state: "running", counted: 12, emails_checked: 5 }), NOW);
  assert.deepEqual([vm.state, vm.alert, vm.title], ["running", false, "Finding personal trainers in Austin, TX"]);
  assert.deepEqual(vm.parts, ["12 of 200", "5 emails checked", "about 8 min left", "estimates update after the first 25"]);
  assert.deepEqual(ids(vm), ["stop"]);
  assert.equal(Math.round(vm.progress * 1000) / 1000, 0.06);
  const on = leadStrip(search({ state: "running", counted: 86, emails_checked: 41 }), NOW);
  assert.deepEqual(on.parts, ["86 of 200", "41 emails checked", "about 5 min left"], "past the first 25 the estimate is measured, so it no longer says it will change");
});

test("the question strip is the alert, with the three answers the owner can give, and Include names what was left out", () => {
  const vm = leadStrip(search({ state: "waiting_on_owner", counted: 9, question: { sentence: "Most of the first 25 were chain gyms. Keep leaving them out?", criterion_key: "chain" } }), NOW);
  assert.deepEqual([vm.state, vm.alert], ["question", true]);
  assert.equal(vm.title, "Most of the first 25 were chain gyms. Keep leaving them out?");
  assert.deepEqual(vm.parts, ["Nothing is spent while this waits. Answer and it carries on."]);
  assert.deepEqual(ids(vm), ["keep", "include", "stop_here"]);
  assert.deepEqual(vm.actions.map((a) => a.label), ["Yes, keep going", "Include chain gyms", "Stop here"]);
  assert.equal(vm.actions[1].arg, "chain", "the answer carries the criterion the owner is including");
  const unknown = leadStrip(search({ state: "waiting_on_owner", question: { sentence: "Keep going?", criterion_key: "gone" } }), NOW);
  assert.equal(unknown.actions[1].label, "Include what I left out", "a key the plan no longer holds never puts a stored word on the screen");
});

test("after Stop the strip says the emails of the found are still being checked, then that they are the owner's", () => {
  const stopping = leadStrip(search({ state: "checking", ending_pending: "stopped", counted: 61 }), NOW);
  assert.equal([stopping.title, ...stopping.parts].join(" · "), "Stopping · checking the emails of the 61 found · nothing else was counted");
  assert.deepEqual([stopping.state, stopping.actions.length], ["checking", 0], "nothing to press while it finishes");
  const checking = leadStrip(search({ state: "checking", ending_pending: "target_reached", counted: 200 }), NOW);
  assert.equal(checking.title, "Checking the emails of the 200 found", "a round that finished is not Stopping");
  const after = leadStrip(ended("stopped"), NOW);
  assert.deepEqual([after.title, after.parts], ["Stopped at 61", ["the 61 found are yours", "nothing else was counted"]]);
  assert.deepEqual(ids(after), ["carry_on", "undo"]);
});

test("every ending is one strip with one next step, says what was kept and counted, and never says a price", () => {
  for (const ending of LEAD_ROUND_ENDINGS) {
    const vm = leadStrip(ended(ending), NOW);
    const said = `${vm.title} ${vm.parts.join(" ")} ${vm.actions.map((a) => a.label).join(" ")}`;
    assert.equal(vm.state, "ended", ending);
    assert.equal(/\$|dollar|cent|budget of/.test(said), false, `${ending} says money: ${said}`);
    assert.ok(vm.actions.filter((a) => LEAD_ROUND_MAKERS.includes(a.id)).length <= 1, `${ending} offers more than one next step`);
    assert.ok(vm.actions.length <= 3, `${ending} has ${vm.actions.length} actions`);
    assert.ok(vm.title.length > 0 && !/undefined|NaN|null/.test(said), `${ending}: ${said}`);
  }
});

test("each ending says the PRD's sentence, with this round's numbers in it", () => {
  assert.deepEqual(
    LEAD_ROUND_ENDINGS.map((e) => { const v = leadStrip(ended(e), NOW); return [e, [v.title, ...v.parts].join(" · "), ids(v)]; }),
    [
      ["target_reached", "Found 61 personal trainers · 34 you can email · 27 by phone · 40 left out", ["excluded", "sort_fit", "undo"]],
      ["searched_everything", "Found 61 personal trainers · everything these searches returned in Austin, TX", ["nearby", "sort_fit", "undo"]],
      ["month_leads_used", "Stopped at 61 · this month's leads are used · the 61 found are yours", ["undo"]],
      ["budget_used", "Stopped at 61 · this month's searching is used up · the 61 found are yours", ["undo"]],
      ["few_new_matches", "All 40 personal trainers in Austin, TX are already yours.", ["undo"]],
      ["stopped", "Stopped at 61 · the 61 found are yours · nothing else was counted", ["carry_on", "undo"]],
      ["source_failed", "Stopped at 40: the source stopped answering · the 61 found are yours · nothing more was counted", ["try_again", "undo"]],
      ["question_unanswered", "Stopped after a day without your answer · the 61 found before it asked are yours", ["answer_now", "undo"]],
      ["paused", "Lead searches are paused for now · your leads are all here · nothing is being counted", ["undo"]],
    ],
  );
  assert.equal(leadStrip(ended("target_reached"), NOW).actions[0].label, "40 left out");
  assert.equal(leadStrip(ended("searched_everything"), NOW).actions[0].label, "Find 139 more nearby");
});

test("nothing matched, and nothing new: the two empty endings name what happened and offer the one step that could change it", () => {
  const none = leadStrip(ended("searched_everything", { counted: 0, excluded: 3 }), NOW, { nearby: ["Alpine", "Fort Davis"] });
  assert.equal(none.title, "There are 3 personal trainers in Austin, TX, and all of them are chain gyms, which you asked me to leave out.");
  assert.deepEqual([none.parts, ids(none)], [["Nothing was counted."], ["nearby", "undo"]], "nothing was counted, so nothing is worth re-sorting");
  assert.equal(none.actions[0].label, "Look in Alpine and Fort Davis");
  const nowhere = leadStrip(ended("searched_everything", { counted: 0, excluded: 3 }), NOW);
  assert.deepEqual(ids(nowhere), ["undo"], "with nowhere else to look there is no next step to offer");
  const owned = leadStrip(ended("few_new_matches", { counted: 0 }), NOW, { nearby: ["Round Rock", "Pflugerville"] });
  assert.equal(owned.title, "All 40 personal trainers in Austin, TX are already yours.");
  assert.deepEqual([owned.parts, ids(owned)], [["Look further out, in Round Rock and Pflugerville?"], ["look_further", "undo"]]);
});

test("Undo is offered for a day after a round ends, names the search, and goes once it has been used", () => {
  const fresh = leadStrip(ended("target_reached"), NOW).actions.find((a) => a.id === "undo");
  assert.deepEqual(fresh.arg, { searchId: "5e000000-0000-4000-8000-000000000001" }, "POST lead-searches/[id]/undo takes the search");
  const old = leadStrip(ended("target_reached", { ended_at: "2026-09-18T10:00:00Z" }), NOW);
  assert.equal(ids(old).includes("undo"), false, "over a day later there is nothing to undo");
  const done = leadStrip(ended("target_reached", { undo_op_id: "5e000000-0000-4000-8000-0000000000b1", undo_version: 1 }), NOW);
  assert.equal(ids(done).includes("undo"), false, "already undone: the view carries the operation the toast puts back");
  const running = leadStrip(search({ state: "running", counted: 12 }), NOW);
  assert.equal(ids(running).includes("undo"), false, "a round still going has nothing to undo");
});
```

- [ ] **Step 2: The failing strip tests.** Append to `tooling/scripts/tests/leads-finder.test.mjs`:

```js
/* --------------------------------------------------- Task 10: the strip */

const SEARCH = {
  id: "5e000000-0000-4000-8000-000000000001", name: "Personal trainers · Austin", asked: PLAN.asked, asked_on: "2026-09-18T10:00:00Z",
  plan: PLAN, plan_version: 1,
  round: {
    id: "5e000000-0000-4000-8000-0000000000a1", seq: 1, purpose: "probe", state: "running", ending: null, ending_pending: null,
    question: null, target: 200, counted: 86, qualified: 80, review: 4, excluded: 40, emails_checked: 41, with_phone: 45,
    cost_usd: 0.4, ended_at: null, undo_op_id: null, undo_version: null,
  },
};
const NOW = new Date("2026-09-19T15:00:00Z");
const withRound = (over) => ({ ...SEARCH, round: { ...SEARCH.round, ...over } });
const drawStrip = (search, acted, extra = {}) => {
  seq = 0;
  return globalThis.window.LeadStrip({ vm: leadStrip(search, NOW, extra), onAction: (id, arg) => acted.push([id, arg]) });
};

test("the running strip says what is true, and its Stop is the only thing to press", () => {
  const acted = [];
  const tree = drawStrip(SEARCH, acted);
  assert.equal(textOf(byTestId(tree, "strip-title")), "Finding personal trainers in Austin, TX");
  assert.equal(textOf(byTestId(tree, "strip-parts")), " · 86 of 200 · 41 emails checked · about 5 min left");
  assert.equal(byTestId(tree, "lead-strip").props.role, "status");
  assert.equal(all(tree, (n) => n.type === "button").length, 1);
  click(byTestId(tree, "strip-stop"));
  assert.deepEqual(acted, [["stop", undefined]]);
  const bar = find(tree, (n) => n.props?.className === "lf-strip-bar");
  assert.equal(bar.props.style.width, "43%");
  const early = drawStrip(withRound({ counted: 12 }), []);
  assert.match(textOf(byTestId(early, "strip-parts")), /estimates update after the first 25$/);
});

test("the question strip is the accent with role alert, and its three answers hand back what they say", () => {
  const acted = [];
  const q = withRound({ state: "waiting_on_owner", counted: 9, question: { sentence: "Half of the first 25 are chain gyms, which I'm leaving out. Keep going this way?", criterion_key: "chain" } });
  const tree = drawStrip(q, acted);
  const strip = byTestId(tree, "lead-strip");
  assert.equal(strip.props.role, "alert");
  assert.match(strip.props.className, /\bask\b/, "the accent tint");
  assert.equal(textOf(byTestId(tree, "strip-title")), "Half of the first 25 are chain gyms, which I'm leaving out. Keep going this way?");
  assert.equal(textOf(byTestId(tree, "strip-parts")), "Nothing is spent while this waits. Answer and it carries on.");
  assert.deepEqual(all(tree, (n) => n.type === "button").map((n) => textOf(n)), ["Yes, keep going", "Include chain gyms", "Stop here"]);
  click(byTestId(tree, "strip-keep"));
  click(byTestId(tree, "strip-include"));
  click(byTestId(tree, "strip-stop_here"));
  assert.deepEqual(acted, [["keep", undefined], ["include", "chain"], ["stop_here", undefined]]);
  assert.equal(textOf(byTestId(drawStrip(q, []), "strip-title")), textOf(byTestId(tree, "strip-title")), "the question does not move while it waits, so it is announced once");
});

test("after Stop the strip says the emails of the found are still being checked, then that the found are the owner's", () => {
  const stopping = drawStrip(withRound({ state: "checking", ending_pending: "stopped", counted: 61 }), []);
  assert.equal(`${textOf(byTestId(stopping, "strip-title"))}${textOf(byTestId(stopping, "strip-parts"))}`, "Stopping · checking the emails of the 61 found · nothing else was counted");
  assert.equal(all(stopping, (n) => n.type === "button").length, 0);
  const acted = [];
  const done = drawStrip(withRound({ state: "ended", ending: "stopped", counted: 61, ended_at: "2026-09-19T14:30:00Z" }), acted);
  assert.equal(textOf(byTestId(done, "strip-title")), "Stopped at 61");
  click(byTestId(done, "strip-carry_on"));
  click(byTestId(done, "strip-undo"));
  assert.deepEqual([acted[0][0], acted[0][1].count, acted[1]], ["carry_on", 200, ["undo", { searchId: "5e000000-0000-4000-8000-000000000001" }]]);
});

test("every ending is one strip with one next step, and each draws its own words", () => {
  for (const ending of LEAD_ROUND_ENDINGS) {
    const acted = [];
    const tree = drawStrip(withRound({ state: "ended", ending, counted: 61, ended_at: "2026-09-19T14:30:00Z" }), acted);
    const strip = byTestId(tree, "lead-strip");
    assert.match(strip.props.className, /\bdone\b/, ending);
    assert.equal(strip.props.role, "status", ending);
    assert.ok(textOf(byTestId(tree, "strip-title")).length > 0, ending);
    const buttons = all(tree, (n) => n.type === "button");
    assert.ok(buttons.length <= 3, `${ending}: ${buttons.length} buttons`);
    assert.equal(/\$|apify|compass|bounceverify/i.test(textOf(tree)), false, `${ending} says something it must not: ${textOf(tree)}`);
    for (const b of buttons) click(b);
    assert.equal(acted.length, buttons.length, ending);
  }
  const reached = drawStrip(withRound({ state: "ended", ending: "target_reached", counted: 200, emails_checked: 88, with_phone: 112, excluded: 40 }), []);
  assert.equal(textOf(byTestId(reached, "strip-title")), "Found 200 personal trainers");
  assert.equal(textOf(byTestId(reached, "strip-parts")), " · 88 you can email · 112 by phone · 40 left out");
  assert.equal(byTestId(reached, "strip-excluded").props.className, "lnk", "40 left out is a link into the view, not a button beside the next step");
  assert.equal(textOf(byTestId(reached, "strip-excluded")), "40 left out");
});

test("an ending never re-sorts by itself: it offers Sort by fit, and says how many new ones are waiting", () => {
  const acted = [];
  const tree = drawStrip(withRound({ state: "ended", ending: "target_reached", counted: 200, emails_checked: 88, with_phone: 112 }), acted, { offered: 12 });
  assert.equal(textOf(byTestId(tree, "strip-take_offered")), "12 new");
  click(byTestId(tree, "strip-take_offered"));
  click(byTestId(tree, "strip-sort_fit"));
  assert.deepEqual(acted, [["take_offered", undefined], ["sort_fit", undefined]]);
  assert.equal(byTestId(drawStrip(withRound({ state: "ended", ending: "target_reached" }), []), "strip-take_offered"), null, "nothing waiting, nothing said");
  assert.equal(globalThis.window.LeadStrip({ vm: null, onAction() {} }), null);
});
```

- [ ] **Step 3: Run and see them fail.** `leadStrip is not a function` in `leads-vm.test.mjs`; `globalThis.window.LeadStrip is not a function` in `leads-finder.test.mjs`.

- [ ] **Step 4: `leadStrip`, in `packages/contracts/src/leads.ts`.** Task 4.6 declares its signature; this replaces that declaration with the body, above Task 9's plan-card section. Its import from `./lead-search` gains `LEAD_ENDING_WORDS`, `LEAD_PROBE_PLACES`, `planArea`, `planWhere` and `type LeadRoundEnding`; `leadEndingLine`, `LeadEndingFacts`, `leadAnd` and `LEAD_PAUSED_TITLE` are Task 19's, in this same file.

```ts
/**
 * Release B's words and view models for the Leads scope of People.
 *
 * NOTE (release B, writer W3): this file is Task 4.1's. Only what Tasks 9 and
 * 10 need is written here, to prove them; Task 4 writes the rest of the file
 * around it, in the order 4.1 and 4.6 spell.
 */
import { LEAD_ENDING_WORDS, LEAD_PROBE_PLACES, planArea, planMinutes, planWhere, planWho, type LeadArea, type LeadRoundEnding, type LeadSearchPlan } from "./lead-search";

/* ----------------------------------------------- the DTOs are 4.6's -- */
// `LeadSearchRoundDto` and `LeadSearchDto` are written once, in Task 4.1's step 2
// from 4.6's block (with `with_phone`, `ending_pending` and `waiting_since` on the
// round, which this task reads). Nothing here re-declares them; the block below is
// quoted so the fields this strip reads are visible while you write it.
/*
export interface LeadSearchRoundDto {
  id: string;
  seq: number;
  purpose: string;
  state: string;
  ending: LeadRoundEnding | null;
  /** The ending a collect decided while the emails were still being checked (00140's lead_rounds.ending_pending). */
  ending_pending: LeadRoundEnding | null;
  question: { sentence: string; criterion_key: string } | null;
  target: number;
  counted: number;
  qualified: number;
  review: number;
  excluded: number;
  /** Counted leads whose email was found and checked: "88 you can email", and, while a round runs, "41 emails checked". */
  emails_checked: number;
  /** Counted leads reachable by phone: "72 by phone". */
  with_phone: number;
  cost_usd: number;
  ended_at: string | null;
  undo_op_id: string | null;
  undo_version: number | null;
}
export interface LeadSearchDto {
  id: string;
  name: string;
  asked: string;
  asked_on: string;
  plan: LeadSearchPlan;
  plan_version: number;
  round: LeadSearchRoundDto | null;
}
*/

/* ------------------------------------------------ the strip (Task 10) -- */

/** How long a finished round's Undo stays true to offer (§8.6). */
export const LEAD_UNDO_MS = 24 * 3_600_000;

export interface LeadStripAction {
  id: "stop" | "keep" | "include" | "stop_here" | "excluded" | "review" | "more" | "nearby" | "look_further" | "carry_on" | "try_again" | "answer_now" | "undo" | "sort_fit" | "take_offered" | "not_now";
  label: string;
  primary?: boolean;
  /** What the page hands the courier: a plan for a new round, an exclusion key for Include, a class for a link. */
  arg?: unknown;
}
export interface LeadStripVM {
  state: "running" | "checking" | "question" | "ended";
  /** True while the round waits on the owner: the strip is the question, announced once. */
  alert: boolean;
  title: string;
  parts: string[];
  /** 0 to 1 for the 2px line, null when the round asked for nothing. */
  progress: number | null;
  actions: LeadStripAction[];
}

/** The actions that make a new round. A strip offers one (§8.8: one next step). */
export const LEAD_ROUND_MAKERS = ["more", "nearby", "look_further", "carry_on", "try_again", "answer_now"] as const;

const lowerFirst = (s: string) => (s && s[1] && s[1] === s[1].toLowerCase() && s[1] !== s[1].toUpperCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s);
/** What the plan leaves out, by key: "chain gyms" for Include and for the nothing-matched sentence. */
function leftOutWords(plan: LeadSearchPlan, key: string | null): string | null {
  const e = plan.exclusions.find((x) => x.key === key) ?? plan.criteria.find((x) => x.key === key);
  return e ? lowerFirst(e.text) : null;
}

/**
 * One search's strip: what is true of its latest round, in the owner's words
 * (§8.4, §8.5, §8.8; P3, S12). Every open state and all nine endings, each
 * saying what happened, what was kept and what was counted, and offering one
 * next step. Nothing here says a number nothing measured, and nothing says a
 * price: the owner's unit is leads (§0.2).
 *
 * `offered` is what a refresh found and the surface is holding back, because
 * the owner is not reading in the order found (E8): the strip says the count
 * and nothing re-sorts under them until it is pressed.
 */
export function leadStrip(s: LeadSearchDto, now: Date, extra: { offered?: number; nearby?: string[] } = {}): LeadStripVM {
  const vm = stripOf(s, now, extra.nearby ?? []);
  const n = extra.offered ?? 0;
  return n > 0 ? { ...vm, actions: [{ id: "take_offered", label: `${n} new` }, ...vm.actions] } : vm;
}

/** What leadEndingLine (Task 19) needs, read off the search's latest round and its plan. */
function endingFactsOf(s: LeadSearchDto, nearby: string[]): LeadEndingFacts {
  const r = s.round as LeadSearchRoundDto;
  const only = s.plan.exclusions.length === 1 ? lowerFirst(s.plan.exclusions[0].text) : null;
  return {
    name: planWho(s.plan),
    area: planArea(s.plan.area),
    counted: r.counted,
    target: r.target,
    emails: r.emails_checked,
    phones: r.with_phone,
    excluded: r.excluded,
    checking: r.state === "checking",
    foundBefore: r.counted,
    nearby,
    // What the source returned at all: every place this round judged, however it was classed.
    seen: r.qualified + r.review + r.excluded,
    leftOutBy: only,
  };
}

function stripOf(s: LeadSearchDto, now: Date, nearby: string[]): LeadStripVM {
  const r = s.round;
  const plan = s.plan;
  const who = planWho(plan);
  const where = planWhere(plan.area);
  if (!r) return { state: "ended", alert: false, title: `Nothing has run for ${who} yet`, parts: [], progress: null, actions: [] };
  const counted = r.counted;
  const progress = r.target > 0 ? Math.min(1, counted / r.target) : null;
  // Undo removes the leads the owner has not touched and gives their month back
  // (POST lead-searches/[id]/undo). It is offered for a day after the round
  // ended, and not once it has been used: the view then carries the operation
  // the toast's own Undo puts back (undo_op_id, undo_version).
  const undoable = !r.undo_op_id && !!r.ended_at && now.getTime() - Date.parse(r.ended_at) < LEAD_UNDO_MS;
  const undo: LeadStripAction[] = undoable ? [{ id: "undo", label: "Undo", arg: { searchId: s.id } }] : [];

  if (r.state === "waiting_on_owner" && r.question) {
    const out = leftOutWords(plan, r.question.criterion_key);
    return {
      state: "question",
      alert: true,
      title: r.question.sentence,
      parts: ["Nothing is spent while this waits. Answer and it carries on."],
      progress,
      actions: [
        { id: "keep", label: "Yes, keep going", primary: true },
        { id: "include", label: out ? `Include ${out}` : "Include what I left out", arg: r.question.criterion_key },
        { id: "stop_here", label: "Stop here" },
      ],
    };
  }

  if (r.state === "checking") {
    // After Stop the emails of what was already found are still checked, and the
    // strip says so in the ending's own words, with `checking` true (S12, 17).
    if (r.ending_pending === "stopped") {
      const line = leadEndingLine("stopped", endingFactsOf(s, nearby));
      return { state: "checking", alert: false, title: line.title, parts: line.parts, progress, actions: [] };
    }
    return { state: "checking", alert: false, title: `Checking the emails of the ${counted} found`, parts: [], progress, actions: [] };
  }

  if (r.state !== "ended") {
    const minutesLeft = Math.max(1, Math.round(planMinutes(plan) * (1 - (progress ?? 0))));
    const parts = [`${counted} of ${r.target}`, `${r.emails_checked} emails checked`, `about ${minutesLeft} min left`];
    // The first 25 size the rest of the round (S6), so until they are in, the estimate is an assumption and says so (P3).
    if (counted < LEAD_PROBE_PLACES) parts.push("estimates update after the first 25");
    return { state: "running", alert: false, title: `Finding ${who} ${where}`, parts, progress, actions: [{ id: "stop", label: "Stop" }] };
  }

  // Every ending is said once, by leadEndingLine (Task 19). The strip composes:
  // the sentence's own next step, then Sort by fit where the table is worth
  // re-ordering, then Undo while the round's operation is still open.
  const line = leadEndingLine(r.ending ?? "paused", endingFactsOf(s, nearby));
  const step: LeadStripAction[] = line.step
    ? [{ id: line.step.id as LeadStripAction["id"], label: line.step.label, primary: line.step.id !== "excluded" && line.step.id !== "sort_fit", arg: line.step.id === "excluded" ? "excluded" : plan }]
    : [];
  const sorts = counted > 0 && (r.ending === "target_reached" || r.ending === "searched_everything") && line.step?.id !== "sort_fit"
    ? [{ id: "sort_fit", label: "Sort by fit" } as LeadStripAction]
    : [];
  return { state: "ended", alert: false, title: line.title, parts: line.parts, progress: 1, actions: [...step, ...sorts, ...undo] };
}
```

- [ ] **Step 5: `LeadStrip`.** In `apps/dashboard/src/legacy/pages/leads-finder.jsx`, before the file's last line. Old: `Object.assign(window, { LeadFinder, LeadPlanCard, LeadPick, leadFinderPlan, leadFinderApprove, leadFinderAsk });` · New:

```jsx
/* ----------------------------------------------------------- the strip -- */

/**
 * One search's strip above the table: running, checking, the question after 25
 * in the accent with role="alert", or one of the nine endings (sections 8.4,
 * 8.5, 8.8). Every word is leadStrip's (contracts), so the page says nothing
 * of its own; every button hands its id and its argument back.
 */
const LeadStrip = ({ vm, onAction }) => {
  if (!vm) return null;
  const tone = vm.state === "question" ? "ask" : vm.state === "ended" ? "done" : "";
  const quiet = new Set(["undo", "excluded", "review", "stop", "stop_here", "sort_fit", "not_now"]);
  return (
    <div className={`lf-strip ${tone}`} role={vm.alert ? "alert" : "status"} data-testid="lead-strip">
      {vm.state === "running" ? <span className="live-dot" aria-hidden="true" /> : null}
      {vm.state === "question" ? <span className="qmark" aria-hidden="true">?</span> : null}
      {vm.state === "ended" ? <span className="ok-mark"><Icon name="check" size={16} /></span> : null}
      {vm.state === "question" ? (
        <span className="lf-ask-text">
          <span className="lf-q" data-testid="strip-title">{vm.title}</span>
          <span className="lf-q-sub" data-testid="strip-parts">{vm.parts.join(" · ")}</span>
        </span>
      ) : (
        <>
          <span className="lf-strip-title" data-testid="strip-title">{vm.title}</span>
          {vm.parts.length ? <span className="lf-strip-parts" data-testid="strip-parts">{vm.parts.map((p) => ` · ${p}`).join("")}</span> : null}
        </>
      )}
      <span className="sp" />
      {vm.actions.map((a) => (
        <button
          key={a.id}
          type="button"
          className={a.id === "excluded" || a.id === "review" ? "lnk" : `btn btn-sm ${a.primary ? "btn-primary" : quiet.has(a.id) ? "btn-ghost" : ""}`}
          data-testid={`strip-${a.id}`}
          onClick={() => onAction(a.id, a.arg)}
        >
          {a.label}
        </button>
      ))}
      {vm.progress === null ? null : <span className="lf-strip-bar" style={{ width: `${Math.round(vm.progress * 100)}%` }} aria-hidden="true" />}
    </div>
  );
};

Object.assign(window, { LeadFinder, LeadPlanCard, LeadStrip, LeadPick, leadFinderPlan, leadFinderApprove, leadFinderAsk });
```

- [ ] **Step 6: What the page does with each action.** `LeadsScope` (Task 2) passes one `onAction(id, arg)`; it reads, in this order, and does nothing else:

| id | what the page does |
|---|---|
| `stop` | `window.__leadSearchStop(search.id)` |
| `keep` | `window.__leadSearchAnswer(search.id, "keep")` |
| `include` | opens the finder at `plan` with that exclusion dropped; its approve calls `window.__leadSearchAnswer(search.id, "include", plan)` while the round is still waiting, else `window.__leadSearchMore(search.id, "topup", plan)`; the toast is the route's words |
| `stop_here` | `window.__leadSearchAnswer(search.id, "stop")` |
| `excluded` / `review` | `window.__leadsView({ cls: arg })` (`clients/leads:…:c-excluded`) |
| `more` / `nearby` / `look_further` / `carry_on` / `try_again` / `answer_now` | opens the finder at `plan` with `arg` as the plan and `set.more = { searchId: search.id, purpose: "topup" }`, so Task 8's `leadFinderApprove` posts `POST lead-searches/[id]/more` |
| `undo` | `window.__leadSearchUndo(arg.searchId)`; on `{removed, credited, op_id, version}` the toast says **"Removed 160 · 160 given back"** with its own Undo, which calls `window.__leadUndo(op_id, version)`; `removed: 0` toasts "Nothing to remove — you have worked every one of them."; a door refusal (`running`, `too_late`, `removed`) is shown as the route's sentence |
| `sort_fit` | `window.__leadsView({ sort: "fit", dir: "asc" })` |
| `take_offered` | `window.__leadsTakeOffered()` |
| `not_now` | dismissed for the session, on the page's own state |

`window.__leadSearchUndo` is a Task 3 courier function of its own (`removeRoundLeads(searchId)` → `api()("POST lead-searches/[id]/undo", { params: { id: searchId } })`), added beside `__leadSearchStop`; `refresh-map.ts` maps that route to `leadsOverride`.

- [ ] **Step 7: The strip's styles.** Append to `apps/dashboard/src/legacy/styles/leads.css` (the canvas, `lib.mjs:169–176, 407–410, 109, 514–515`):

```css
/* ----------------------------------------------------------- the strip -- */

.lf-strip {
  position: relative; margin: 12px 28px 0; display: flex; align-items: center; gap: 10px;
  padding: 0 6px 0 14px; height: 42px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--bg-raised); font-size: 12.5px; overflow: hidden; flex: none;
  animation: lf-in 200ms var(--ease-out) backwards;
}
.lf-strip-title { font-weight: 500; white-space: nowrap; }
.lf-strip-parts {
  display: flex; align-items: center; gap: 6px; color: var(--ink-dim);
  font-variant-numeric: tabular-nums; white-space: nowrap; min-width: 0; overflow: hidden;
}
.lf-strip .sp { flex: 1; }
.lf-strip .ok-mark { color: var(--ok-ink); display: inline-flex; }
.lf-strip .lnk {
  border: 0; background: none; padding: 0 2px; font: inherit; color: var(--ink-muted);
  text-decoration: underline; text-decoration-color: var(--line-strong); text-underline-offset: 3px;
  cursor: pointer; white-space: nowrap;
}
.lf-strip .lnk:hover { color: var(--ink); }
.lf-strip-bar { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--accent); transition: width 300ms var(--ease-out); }
.lf-strip.done .lf-strip-bar { background: var(--ok); }
.lf-strip.ask {
  height: auto; min-height: 48px; padding: 8px 8px 8px 14px; flex-wrap: wrap; row-gap: 6px;
  border-color: oklch(from var(--accent) l c h / 0.45);
  background: oklch(from var(--accent) l c h / 0.06);
}
.lf-strip.ask .lf-q { font-weight: 500; color: var(--ink); }
.lf-strip.ask .lf-q-sub { color: var(--ink-dim); font-size: 12px; }
.lf-strip .qmark {
  width: 20px; height: 20px; border-radius: 999px; display: grid; place-items: center;
  background: var(--accent); color: var(--accent-fg); font-size: 12px; font-weight: 600; flex: none;
}
.lf-ask-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1 1 360px; }
```

No `?v=` is chosen here either: its `?v=` is bumped once for the whole release, in Task 22's step 1a.

- [ ] **Step 7a: `leadStrip` joins the bag.** `seed-globals.ts` — its import gains `leadStrip`, and:

  old: `  window.__LEAD_VM = { planWords, planSaid, planSentence, planWho, planWhere, planArea, planMinutes, planVersionOf, LEAD_COUNT_CHOICES, leadPlanLikely, leadPlanFacts, leadPlanAsk };`
  new: `  window.__LEAD_VM = { planWords, planSaid, planSentence, planWho, planWhere, planArea, planMinutes, planVersionOf, LEAD_COUNT_CHOICES, leadPlanLikely, leadPlanFacts, leadPlanAsk, leadStrip };`

  (`leadStrip?:` in the `declare global` block becomes `leadStrip:`.) `refresh-map.ts` already sends `POST lead-searches/[id]/undo` to `leadsOverride` (Task 3 step 3), so the strip's Undo repaints the scope without a re-read.

- [ ] **Step 8: The bell says the same two things.** Task 4.2 item 8's rows, pinned in `notifications.test.mjs`'s style: `leads_ready` titles "Your search for personal trainers in Austin, TX is done" (`Your search for ${planWho(plan)} ${planWhere(plan.area)} is done`) and `leads_question` "Your search for personal trainers in Austin, TX needs you" — both from the same two functions the strip reads, so the bell and the strip cannot drift.

- [ ] **Step 9: Run and see them pass.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-vm.test.mjs leads-finder.test.mjs lead-search.test.mjs notifications.test.mjs` → all pass; `node tooling/scripts/check-dist.mjs`, keep only dists with a real diff.

  Mutation checks, each once, each reverted: drop `role="alert"` from the question strip and the question test fails; make `stripOf` always push "estimates update after the first 25" and the running test fails; let the ended branch spell its own title instead of calling `leadEndingLine` and the ending table fails; make Undo ignore `ended_at` and the Undo test fails.

- [ ] **Step 10: Commit** — "One strip says what a round is doing, asks after 25, and ends it in the words of the closed set". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

## Task 11: Qualified, Needs review and Excluded

**Files:** Modify `apps/dashboard/src/legacy/pages/leads-scope.jsx` (Task 2's: `LeadRowActions`, `ldBusinessCell`, `LeadsScope`), `apps/dashboard/src/legacy/pages/clients-a.jsx` (`ClientsAReal`'s acts block and its `LeadsScope` props, both Task 2's), `tooling/scripts/tests/leads-honest.test.mjs` (Task 2's) · Uses release A's `POST leads/[id]/keep`, `/exclude`, `/put-back` and `POST lead-operations/[id]/undo` through Task 3's courier (`__leadKeep`, `__leadExclude`, `__leadPutBack`, `__leadUndo`)

**What it draws (§8.7, §0.1, S9).** A place has one class per search it was found by — Qualified, Needs review or Excluded — and the class is not a stage (§9.1). With a search picked, its three counts sit under the strip, each a view of that search (`c-qualified`, `c-review`, `c-excluded`, the address's `c-` segment, Task 2's `parseLeadsRoute`). The counts are the round's own (`lead_searches_view`'s `qualified`, `review`, `excluded`, release A).

- **Needs review**: each row says why in the Fit column, from the judgment ("Couldn't check the email", "No location", "Read, not seen: independent"), with **Keep** (it counts, as Qualified, the month it is kept) and **Exclude** (free) on the row — on hover and on the keyboard's cursor — and in the peek (Task 12 passes the same three handlers).
- **Excluded**: chips by criterion at the head of the view ("Chains 26 · Not a personal trainer 14"), each row's criterion in the Fit column, "Not checked" for its email (it was never checked, and Task 2's Email cell already says so), no stage word, and **Put back** on the row and in the peek: the owner's override of an exclusion, through the door that counts.
- The three take the owner permission `find` (release A's routes are `role: "owner"`, `rate: "lead_member"`, body `{ search_id }`); an operator sees them on the page, in the tab order, refusing with the gate's sentence (`window.gate("find", …)`, `data-bits.jsx:266`: `aria-disabled`, `aria-description`, the sentence shown at the control on a press, never `disabled` + `title`).
- Each toasts with Undo through the operation the door answered (`{ op_id, version }`): **"Kept. It counts as a lead this month."** · **"Excluded. Nothing counted."** · **"Put back. It counts as a lead now."** Undo is `POST lead-operations/[id]/undo { version }` and names nothing but the operation and the version the page saw (E9).
- A refusal is the route's own sentence, as `server/leads.ts`'s `refusalOf` spells it (release A, on main): a hidden place — "This place is hidden: it is already a customer, or was erased." — one outside the area — "This place is outside the area the search covers." — or the month's leads — "This month's leads are used up. Nothing more counts until next month." The page says it through `window.refusalToast`, and nothing on screen says the lead was kept.

- [ ] **Step 1: The failing tests.** Four tests appended to `tooling/scripts/tests/leads-honest.test.mjs` (Task 2 created it; its harness, its `fresh`, `draw`, `rowOf`, `names`, `click`, `press`, `settle` and its faked courier are reused as they are).

```js
/* ---------------------------- the classes, and their acts ---------------------------- */

test("a Needs review row offers Keep and Exclude, an Excluded row offers Put back, and each toasts with Undo through its operation", async () => {
  fresh();
  let tree = draw();
  const review = rowOf(tree, "l3");
  assert.ok(byTestId(review, "lead-keep") && byTestId(review, "lead-exclude"), "Keep counts it; Exclude is free");
  assert.equal(byTestId(review, "lead-put-back"), null);
  const excluded = rowOf(tree, "l4");
  assert.ok(byTestId(excluded, "lead-put-back"), "Put back is the owner's override");
  assert.equal(byTestId(excluded, "lead-keep"), null);
  click(byTestId(review, "lead-keep"));
  await settle();
  assert.deepEqual(calls.at(-1), ["keep", { search_id: SEARCH_A, id: "l3" }], "the lead names the search whose class it is in");
  assert.equal(textOf(flashes.at(-1).msg), "Kept. It counts as a lead this month.");
  await flashes.at(-1).undo();
  assert.deepEqual(calls.at(-1), ["undo", { op: "op-k", version: 4 }], "Undo names the operation and the version it saw, never rows");
  click(byTestId(rowOf(draw(), "l4"), "lead-put-back"));
  await settle();
  assert.deepEqual(calls.at(-1), ["putBack", { search_id: SEARCH_A, id: "l4" }]);
  assert.equal(textOf(flashes.at(-1).msg), "Put back. It counts as a lead now.");
  click(byTestId(rowOf(draw(), "l3"), "lead-exclude"));
  await settle();
  assert.deepEqual(calls.at(-1), ["exclude", { search_id: SEARCH_A, id: "l3" }]);
  assert.equal(textOf(flashes.at(-1).msg), "Excluded. Nothing counted.");
});

test("a refused Keep is the route's sentence, and nothing says it was kept", async () => {
  fresh({ refuse: { ok: false, status: 409, code: "conflict", message: "This place is hidden: it is already a customer, or was erased." } });
  click(byTestId(rowOf(draw(), "l3"), "lead-keep"));
  await settle();
  assert.equal(flashes.at(-1).tone, "danger");
  assert.match(textOf(flashes.at(-1).msg), /already a customer/);
});

test("an operator sees Find leads, Keep, Exclude and Put back refusing in the gate's sentence, and F does nothing for them", () => {
  fresh({ role: "operator" });
  const tree = draw();
  const gated = (n) => [n.props["aria-disabled"], n.props["aria-description"]];
  assert.deepEqual(gated(byTestId(tree, "leads-find")), [true, "Only an owner can find leads."]);
  assert.deepEqual(gated(byTestId(rowOf(tree, "l3"), "lead-keep")), [true, "Only an owner can keep this lead."]);
  assert.deepEqual(gated(byTestId(rowOf(tree, "l3"), "lead-exclude")), [true, "Only an owner can exclude this lead."]);
  assert.deepEqual(gated(byTestId(rowOf(tree, "l4"), "lead-put-back")), [true, "Only an owner can put this lead back."]);
  assert.equal(press("f"), false, "and the key is not theirs either");
  assert.equal(finders.length, 0);
});

test("the Excluded view's chips count by criterion, and each narrows the rows", () => {
  fresh();
  let tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-excluded` });
  const chips = all(byTestId(tree, "lead-excluded-chips"), (n) => n.props?.["data-testid"]?.startsWith("lead-chip-")).map((n) => textOf(n).trim());
  assert.deepEqual(chips, ["Chain 1", "Not a personal trainer 1"]);
  click(byTestId(tree, "lead-chip-Chain"));
  tree = draw({ leadsRoute: `leads:s-${SEARCH_A}:c-excluded` });
  assert.deepEqual(names(tree), ["GigaFit Austin"]);
  assert.deepEqual(all(byTestId(tree, "lead-classes"), (n) => n.props?.role === "tab").map((n) => [textOf(n).trim(), n.props["aria-selected"]]), [["Qualified 2", false], ["Needs review 1", false], ["Excluded 1", true]], "the three classes, each a view of the search");
});
```

- [ ] **Step 2: Run them and see them fail.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-honest.test.mjs` → four failures: `Cannot read properties of null (reading 'props')` on `byTestId(review, "lead-keep")` (the row has Call and Copy only), and `lead-classes` / `lead-excluded-chips` are not drawn.

- [ ] **Step 3: the row's three acts.** `leads-scope.jsx`.

old:
```jsx
// Call and Copy on every row, on hover and on the keyboard's cursor. Keep, Exclude and Put back join them in
// Task 11 (Qualified, Needs review and Excluded).
const LeadRowActions = ({ l, onCall, onCopy }) => (
  <span className="cl-row-actions ld-row-actions">
    {l.phone && !l.phoneWrong && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onCall(l.id); }} title="Call from your phone" aria-label={`Call ${l.name}`} data-testid="lead-call"><Icon name="phone" size={11} /></button>}
    {l.email && l.emailState !== "invalid" && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onCopy(l.id); }} title="Copy the email" aria-label={`Copy ${l.name}'s email`} data-testid="lead-copy"><Icon name="copy" size={11} /></button>}
  </span>
);
```
new:
```jsx
// The row's acts: Call and Copy on every row, on hover and on the keyboard's cursor; and the class's own three
// (§8.7, S9): Keep and Exclude move a place out of Needs review, Put back is the owner's override of an
// exclusion. All three count, so all three are the owner's permission `find`; anyone else sees them on the page,
// in the tab order, saying why when pressed (window.gate, data-bits.jsx), never disabled and never silent.
const LeadRowActions = ({ l, onCall, onCopy, onKeep, onExclude, onPutBack, canFind }) => (
  <span className="cl-row-actions ld-row-actions">
    {l.phone && !l.phoneWrong && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onCall(l.id); }} title="Call from your phone" aria-label={`Call ${l.name}`} data-testid="lead-call"><Icon name="phone" size={11} /></button>}
    {l.email && l.emailState !== "invalid" && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onCopy(l.id); }} title="Copy the email" aria-label={`Copy ${l.name}'s email`} data-testid="lead-copy"><Icon name="copy" size={11} /></button>}
    {l.cls === "review" && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onKeep(l.id); }} data-testid="lead-keep" {...(canFind ? {} : window.gate("find", "keep this lead"))}>Keep</button>}
    {l.cls === "review" && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onExclude(l.id); }} data-testid="lead-exclude" {...(canFind ? {} : window.gate("find", "exclude this lead"))}>Exclude</button>}
    {l.cls === "excluded" && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onPutBack(l.id); }} data-testid="lead-put-back" {...(canFind ? {} : window.gate("find", "put this lead back"))}>Put back</button>}
  </span>
);
```

(The Business cell already hands them down: Task 2 wrote `<LeadRowActions l={l} onCall={x.onCall} onCopy={x.onCopy} onKeep={x.onKeep} onExclude={x.onExclude} onPutBack={x.onPutBack} canFind={x.canFind} />`, and this step is what makes those four props mean something.)

- [ ] **Step 4: the three classes, and the Excluded view's chips.** `leads-scope.jsx`, inserted between `LeadsRailRows` and the bulk bar.

old:
```jsx
/* --------------------------------------------------------------- the bulk bar */
```
new:
```jsx
/* ------------------------------------------------- the three classes (§8.7) */

// Qualified · Needs review · Excluded, under the search that is open: each a count and a view (c-qualified,
// c-review, c-excluded). The class is not a stage (§9.1): it says whether the place met the plan.
const LEAD_CLASS_WORDS = { qualified: "Qualified", review: "Needs review", excluded: "Excluded" };
const LeadClassTabs = ({ counts, cls, onPick }) => (
  <div className="ld-classes" role="tablist" aria-label="What the search made of each place" data-testid="lead-classes">
    {["qualified", "review", "excluded"].map((k) => (
      <button key={k} type="button" role="tab" aria-selected={cls === k} className={`ld-class ${k} ${cls === k ? "on" : ""}`} onClick={() => onPick(cls === k ? null : k)} data-testid={`lead-class-${k}`}>
        {LEAD_CLASS_WORDS[k]} <span className="count">{counts[k]}</span>
      </button>
    ))}
  </div>
);

// The Excluded view's head: what each criterion left out, most first, each one narrowing the rows (§8.7). The
// counts are the loaded rows' own `excludedBy` (lead_search_members.excluded_by, said in words by toLeadRowVM),
// so the chips say what is on screen.
const ldExcludedChips = (rows) => {
  const by = new Map();
  for (const l of rows) if (l.cls === "excluded" && l.excludedBy) by.set(l.excludedBy, (by.get(l.excludedBy) || 0) + 1);
  return [...by.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
};
const LeadExcludedChips = ({ chips, active, onPick }) => (
  chips.length === 0 ? null : (
    <div className="ld-chips" data-testid="lead-excluded-chips">
      {chips.map((c) => (
        <button key={c.key} type="button" className={`ld-chip ${active === c.key ? "on" : ""}`} aria-pressed={active === c.key} onClick={() => onPick(active === c.key ? null : c.key)} data-testid={`lead-chip-${c.key}`}>
          {c.key} <span className="count">{c.count}</span>
        </button>
      ))}
    </div>
  )
);

/* --------------------------------------------------------------- the bulk bar */
```

- [ ] **Step 5: `LeadsScope` draws them**, under the strip and above the table.

old:
```jsx
const LeadsScope = (p) => {
  const L = p.surface;
  const rail = p.rail;
  const standing = p.standing;
  const search = p.search;
```
new:
```jsx
const LeadsScope = (p) => {
  const L = p.surface;
  const rail = p.rail;
  const standing = p.standing;
  const chips = ldExcludedChips(L.rows);
  const search = p.search;
```

old:
```jsx
          {search && <LeadStrip vm={p.strip} onAction={p.onStripAction} />}

          {L.readFailed
```
new:
```jsx
          {search && <LeadStrip vm={p.strip} onAction={p.onStripAction} />}

          {search && <LeadClassTabs counts={{ qualified: search.round.qualified, review: search.round.review, excluded: search.round.excluded }} cls={p.view.cls} onPick={p.onPickClass} />}
          {p.view.cls === "excluded" && <LeadExcludedChips chips={chips} active={p.chip} onPick={p.onPickChip} />}

          {L.readFailed
```

and the file's window exports gain the four names:

old:
```jsx
Object.assign(window, { LeadsScope, LeadsBulkBar, LeadRowActions, LeadShape, LeadsRailRows, LEAD_COLUMNS, LEAD_SORT_KEYS });
```
new:
```jsx
Object.assign(window, { LeadsScope, LeadsBulkBar, LeadRowActions, LeadShape, LeadsRailRows, LeadClassTabs, LeadExcludedChips, ldExcludedChips, LEAD_COLUMNS, LEAD_SORT_KEYS, LEAD_CLASS_WORDS });
```

- [ ] **Step 6: the page's three acts**, in `clients-a.jsx`'s Leads acts block (Task 2's `searchOf` names the search the class belongs to: the view's, or the row's own when every search is shown).

old:
```jsx
  const searchOf = (l) => (leadView && leadView.searchId) || (l && l.searchId) || null;
  // The owner's own phone dials; coming back to the tab asks how it went (Task 14).
```
new:
```jsx
  const searchOf = (l) => (leadView && leadView.searchId) || (l && l.searchId) || null;
  // Keep counts the place as Qualified the month it is kept; Exclude is free; Put back is the owner's override
  // of an exclusion, through the door that counts (PRD 8.7). Each names the search whose class it is in, which
  // is what release A's routes take ({ search_id }); the door answers the operation, and the toast offers it.
  const keepLead = (id) => leadAct(() => window.__leadKeep(searchOf(leadById(id)), id), <>Kept. It counts as a lead this month.</>);
  const excludeLead = (id) => leadAct(() => window.__leadExclude(searchOf(leadById(id)), id), <>Excluded. Nothing counted.</>);
  const putBackLead = (id) => leadAct(() => window.__leadPutBack(searchOf(leadById(id)), id), <>Put back. It counts as a lead now.</>);
  // The owner's own phone dials; coming back to the tab asks how it went (Task 14).
```

and the cells and the peek are given them:

old:
```jsx
    const cellCtxLeads = {
      onOpen: setPeekId,
      onCall: callLead,
      onCopy: copyLead,
      hasCenter: colCtx.hasCenter,
      canFind,
    };
```
new:
```jsx
    const cellCtxLeads = {
      onOpen: setPeekId,
      onCall: callLead,
      onCopy: copyLead,
      onKeep: keepLead,
      onExclude: excludeLead,
      onPutBack: putBackLead,
      hasCenter: colCtx.hasCenter,
      canFind,
    };
```

old:
```jsx
        chip={chip}
        onPickChip={setChip}
```
new:
```jsx
        onPickClass={(cls) => { setChip(null); goto({ cls }); }}
        chip={chip}
        onPickChip={setChip}
```

old:
```jsx
        onCall={callLead}
        onDraft={() => {}}
        onCopy={copyLead}
```
new:
```jsx
        onCall={callLead}
        onDraft={() => {}}
        onKeep={keepLead}
        onExclude={excludeLead}
        onPutBack={putBackLead}
        onCopy={copyLead}
```

- [ ] **Step 7: run and see them pass.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-honest.test.mjs` → PASS. Then the mutation checks, each once, reverted after: the gate spread dropped from Keep → the operator test fails; `l.cls === "review"` widened to every row → the first test's "an Excluded row has no Keep" fails; `leadUndo` dropped from `leadAct` → the first test's Undo fails; the chips derived from the round's counts rather than the loaded rows' `excludedBy` → the chips test fails.

- [ ] **Step 8: commit** — "A place the search set aside is the owner's to keep, exclude or put back, and the toast says what it costs". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

## Task 12: the peek

**Files:** Create `apps/dashboard/src/legacy/pages/leads-peek.jsx`, `tooling/scripts/tests/leads-peek.test.mjs` · Modify `packages/contracts/src/leads.ts` (Task 4.1), `apps/dashboard/src/legacy/styles/leads.css` (Task 8 created and registered it; this task appends the peek's block), `apps/dashboard/src/legacy-bridge/leads.ts` (Task 3), `apps/dashboard/src/legacy-bridge/manifest.ts`, `apps/dashboard/src/legacy/Chanlytics.html`, `apps/dashboard/src/legacy-bridge/legacy.css`, `apps/dashboard/src/legacy/pages/clients-a.jsx:1810` (the cursor effect's noun)

**What the peek is.** 408px beside the table, `role="dialog"` with `.pl-peek`, which Task 2's `PL_OVERLAY` names apart, so J and K keep walking the rows behind it and Esc reaches the page's one listener. Hookless: every piece of its state is `ClientsAReal`'s (`peekId`, `peekMode`, `armed`, `draft`), so the tests' stub React keys hooks by one call order. It says nothing of its own: every sentence is contracts' `toLeadPeekVM` or contracts' `LEAD_WORDS`, handed to the page as `window.__leadPeekVM` (Task 3's courier, step 8 below) and `window.__LEAD_WORDS` (seeded in `seed-globals.ts`, step 8 below), and every toast is the route's own sentence, because the door decides what happened (§9.6).

**Props:** `LeadPeek({ vm, mode, armed, draft, busy, onClose, onStage, onNotAFit, onCall, onDraft, onKeep, onExclude, onPutBack, onCopy })`. `mode` is `info | why | draft`; `armed` is `{ kind: "sent" | "call", leadId, asked, outcome, note } | null` (Task 2's `armed` hook, carrying what the two questions need); `draft` is `{ busy, tone, to, subject, body, mailto, refusal } | null` (a new hook of `ClientsAReal`, beside `peekMode`: see the report).

**The state machine** (v2:7069–7087, corrected: a stage click to Talking keeps the lead; the draft and the call are Tasks 13 and 14):

```
closed ──a row · Enter──▶ info
info ──the stage control──▶ info      (stage {kind:"stage"}; Talking says "They join People when they write or call in, or when a call goes well", with Undo)
info ──Not a fit──▶ why ──a reason──▶ info   (Task 15)
info ──Draft──▶ draft                  (Task 13)          info ──Call · C──▶ info, call-armed   (Task 14)
info (review) ──Keep · Exclude──▶ info;  info (excluded) ──Put back──▶ info   (Task 11)
any ──Esc · ×──▶ closed                (Esc backs out one step: `leadPeekEscape`, below)
```

**The one door every act here reaches** is `lead_set_stage(p_lead_id, p_stage, p_reason, p_fit_reason, p_outcome, p_note)` (Task 4.5), through `POST leads/[id]/stage` (Task 4.4) and `window.__leadStage` (Task 3). It answers `{ stage, closed_reason, contact_id, existed, converted, op_id, version }`; the route adds `toast` (its own sentence, built from `closed_reason` for a Not a fit and from `converted`/`existed` for a call) and `undo` (`{ op_id, version }`, or null when a person was made). The peek shows `toast`, offers Undo through `POST lead-operations/[id]/undo { version }` when `undo` is there, and offers **Open** instead when `converted && contact_id`. It decides none of this itself: the door decides what happened (§9.6).

- [ ] **Step 1: The failing tests.** A harness modelled on `refusals-on-the-page.test.mjs:17–58` (the stub React keyed by call order, the window, `walk`/`all`/`find`/`byTestId`/`textOf`), loading only `icons.jsx`, `data-bits.jsx` and `leads-peek.jsx`, and holding the page's state in this file the way `ClientsAReal` holds it. The head is written once; Tasks 13–15 append their tests to it.

```js
// tooling/scripts/tests/leads-peek.test.mjs
/**
 * The peek, and everything the owner does to one lead from it: the stage, Not a fit and its five whys, Keep and
 * Exclude, Put back, a call from their own phone with its six outcomes, and a draft for their own inbox.
 *
 * Drawn on the tests' stub React, as refusals-on-the-page does: the components are hookless, so a draw is a call and
 * the state is this file's, the way ClientsAReal holds it on the real page. Nothing is mocked that the owner reads:
 * the view model is contracts' own toLeadPeekVM and the words are contracts' LEAD_WORDS.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { roleGate } from "../../../packages/contracts/src/refusal.ts";
import {
  LEAD_WORDS, LEAD_EMAIL_WORDS, LEAD_LOCKED_LINE, LEAD_DRAFT_NOTE, LEAD_NO_ADDRESS,
  LEAD_CHECK_GROUP_WORDS, LEAD_CHECK_UNSURE, LEAD_NOT_A_FIT_WORDS, LEAD_CONTACT_STANDARD_WORDS,
  outcomeMove, leadDraftFooter, toLeadPeekVM,
} from "../../../packages/contracts/src/leads.ts";

let cells = [];
let seq = 0;
const listeners = {};
const flashes = [];
const opened = [];
const dialled = [];
const copied = [];

globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = type(props);
    return node;
  },
  useState: (init) => { const k = seq++; if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init; return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }]; },
  useRef: (init) => { const k = seq++; if (!(k in cells)) cells[k] = { current: init }; return cells[k]; },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: (fn) => { const k = seq++; if (!(k in cells)) { cells[k] = true; fn(); } },
};
globalThis.ReactDOM = { createPortal: (node) => node };
const on = (bag) => (name, fn) => { (bag[name] = bag[name] || []).push(fn); };
const off = (bag) => (name, fn) => { bag[name] = (bag[name] || []).filter((f) => f !== fn); };
globalThis.document = {
  body: {},
  hidden: false,
  addEventListener: on(listeners),
  removeEventListener: off(listeners),
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  document: globalThis.document,
  addEventListener: on(listeners),
  removeEventListener: off(listeners),
  dispatchEvent() {},
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  location: { assign: (href) => dialled.push(href) },
  navigator: { clipboard: { writeText: async (t) => { copied.push(t); } } },
  __roleGate: roleGate,
  __chrome: {},
};
await import("../../../apps/dashboard/src/legacy/components/icons.jsx");
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
globalThis.Icon = globalThis.window.Icon;
await import("../../../apps/dashboard/src/legacy/pages/leads-scope.jsx");   // Task 2's: LeadShape is its, and this file draws it
await import("../../../apps/dashboard/src/legacy/pages/leads-peek.jsx");
for (const k of ["LeadPeek", "LeadShape", "LeadPeekActions", "leadPeekEscape", "leadPeekFollows", "leadPeekFocus", "leadArmOnReturn"]) globalThis[k] = globalThis.window[k];
globalThis.window.__LEAD_WORDS = LEAD_WORDS;

/* ------------------------------------------------------------ the helpers */

const walk = (n, fn) => { if (n == null || typeof n !== "object") return; fn(n); for (const k of n.props?.children ?? []) walk(k, fn); if (n.rendered) walk(n.rendered, fn); };
const all = (tree, pred) => { const out = []; walk(tree, (n) => { if (pred(n)) out.push(n); }); return out; };
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return (n.props?.children ?? []).map(textOf).join("");
};
const press = async (node) => { assert.ok(node, "no such control"); await node.props.onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: node }); };
const settle = async (n = 6) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setTimeout(r, 0)); };

/* ----------------------------------------------------------- the fixtures */

const LEAD = "5e000000-0000-4000-8000-000000000111";
const SEARCH_ID = "5e000000-0000-4000-8000-000000000001";
const PLAN = {
  version: 1, card: "local_businesses", name: "Personal trainers · Austin", asked: "200 personal trainers in Austin with a website",
  terms: ["personal trainer"], area: { kind: "city", label: "Austin, TX", state: "TX", center: { lat: 30.26, lng: -97.74 }, radius_m: 20000, query: "Austin, TX" },
  count: 200, contact: "email",
  criteria: [{ key: "independent", text: "independent", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
};
const SEARCH = {
  id: SEARCH_ID, name: "Personal trainers · Austin", asked: PLAN.asked, asked_on: "2026-09-18T14:00:00.000Z", plan: PLAN, plan_version: 1,
  round: { id: "r1", seq: 2, purpose: "main", state: "ended", ending: "target_reached", question: null, target: 200, counted: 160, qualified: 160, review: 12, excluded: 40, emails_checked: 88, cost_usd: 3.2, ended_at: "2026-09-18T14:40:00.000Z", undo_op_id: null, undo_version: null },
};
const CHECKS = [
  { key: "on_maps", how: "seen", answer: "yes", source: "Google Maps", reason: null },
  { key: "in_area", how: "seen", answer: "yes", source: "Google Maps · the plan", reason: "Travis Heights, inside 20km of the center" },
  { key: "phone_two_sources", how: "seen", answer: "yes", source: "Maps · website", reason: null },
  { key: "mailbox", how: "seen", answer: "yes", source: "Mailbox check", reason: null },
  { key: "independent", how: "read", answer: "yes", source: "Claude · the listing", reason: "one address, no brand in the name" },
  { key: "right_kind", how: "read", answer: "yes", source: "Claude · the listing", reason: "listed as a personal trainer" },
  { key: "own_address", how: "read", answer: "yes", source: "Claude · website", reason: "on their own domain and answers bookings" },
];
const row = (over = {}) => ({
  id: LEAD, search_id: SEARCH_ID, place_id: "ChIJfixture0000000000000001",
  business_name: "Travis Heights Coaching Co.", category: "Personal trainer", city: "Austin", state: "TX", street: "1200 Barton Springs Rd",
  phone: "+15125550142", phone_agrees: true, phone_wrong: false,
  email: "hello@travisheightscoaching.example", email_state: "ok", email_checked_at: "2026-09-18T19:16:00.000Z",
  website: "travisheightscoaching.example", instagram: "https://instagram.example/travisheights",
  rating: 5, reviews: 16, stage: "ready", closed_reason: null, contact_id: null,
  last_outcome: null, last_note: null, contacted_at: null, converted_at: null,
  places: 1, found_at: "2026-09-18T19:14:00.000Z", exported_at: null, version: 3,
  ...over,
  member: {
    class: "qualified", fit: "strong", reason: "Independent coaching · 5.0 from 16 reviews · email checked",
    excluded_by: null, distance_m: 2400, counted: true, checks: CHECKS,
    other_emails: [{ email: "careers@travisheightscoaching.example", why: "for job seekers" }, { email: "A coach's personal mailbox", why: "not the business" }],
    ...(over.member || {}),
  },
});
const NOW = new Date("2026-09-18T20:00:00.000Z");
const TZ = "America/Chicago";
const vmOf = (over) => toLeadPeekVM(row(over), SEARCH, TZ, NOW);

/** A courier that answers as the routes do, and records what it was asked. */
const courierOf = (over = {}) => {
  const seen = [];
  const api = {
    seen,
    __leadStage: async (id, input) => { seen.push(["stage", id, input]); return over.stage ? over.stage(input) : { ok: true, data: { stage: "nurture", closed_reason: null, contact_id: null, existed: false, converted: false, op_id: "op-1", version: 4, toast: "Marked contacted.", undo: { op_id: "op-1", version: 4 } } }; },
    __leadDraft: async (id, input) => { seen.push(["draft", id, input]); return over.draft ? over.draft(input) : { ok: true, data: { to: "hello@travisheightscoaching.example", subject: "Missed calls at Travis Heights", body: `Hi,\n\nI came across Travis Heights Coaching Co. on Google Maps.${leadDraftFooter("Melany's Beauty Salon", "1 Main St, Austin, TX 78701")}`, mailto: "mailto:hello%40travisheightscoaching.example?subject=Missed%20calls" } }; },
    __leadUndo: async (opId, version) => { seen.push(["undo", opId, version]); return over.undo ? over.undo() : { ok: true, data: {} }; },
  };
  return api;
};

/** The page's own state, the way ClientsAReal holds it: peekMode, armed and draft beside peekId. */
const page = (over = {}) => {
  const st = { peekId: LEAD, mode: "info", armed: null, draft: null, ...over };
  const p = {
    vm: over.vm || vmOf(),
    searchId: SEARCH_ID,
    courier: over.courier || courierOf(),
    flash: (t) => flashes.push(t),
    onOpenPerson: (id) => opened.push(id),
    keep: (id) => flashes.push({ msg: `keep ${id}` }),
    exclude: (id) => flashes.push({ msg: `exclude ${id}` }),
    putBack: (id) => flashes.push({ msg: `put back ${id}` }),
    copyEmail: (id) => copied.push(`email ${id}`),
    dial: (href) => dialled.push(href),
    setPeekId: (v) => { st.peekId = v; },
    setMode: (v) => { st.mode = v; },
    setArmed: (v) => { st.armed = typeof v === "function" ? v(st.armed) : v; },
    setDraft: (v) => { st.draft = typeof v === "function" ? v(st.draft) : v; },
    get armed() { return st.armed; },
    get draft() { return st.draft; },
    get mode() { return st.mode; },
  };
  const draw = () => {
    seq = 0;
    const acts = globalThis.LeadPeekActions(p);
    return { tree: globalThis.LeadPeek({ vm: p.vm, mode: st.mode, armed: st.armed, draft: st.draft, ...acts }), acts };
  };
  return { st, p, draw };
};

const reset = () => { cells = []; seq = 0; flashes.length = 0; opened.length = 0; dialled.length = 0; copied.length = 0; for (const k of Object.keys(listeners)) delete listeners[k]; delete globalThis.window.ST_STORE; };

/* ================================================== Task 12: the peek ==== */

test("the peek names the business, its sub-line, the fit as a sentence and the stage it is at", () => {
  reset();
  const { tree } = page().draw();
  assert.equal(tree.props.role, "dialog");
  assert.equal(/\bpl-peek\b/.test(tree.props.className), true, "the page's own overlay: PL_OVERLAY names it apart");
  assert.equal(textOf(byTestId(tree, "peek-name")), "Travis Heights Coaching Co.");
  assert.equal(textOf(byTestId(tree, "peek-sub")), "Personal trainer · Austin, TX");
  assert.equal(textOf(byTestId(tree, "peek-fit")), "Strong fit. Independent coaching · 5.0 from 16 reviews · email checked");
  const stage = byTestId(tree, "peek-stage");
  assert.equal(stage.props.role, "radiogroup");
  assert.deepEqual(all(stage, (n) => n.props?.role === "radio").map((n) => [textOf(n), n.props["aria-checked"]]), [["Ready", true], ["Contacted", false], ["Talking", false]]);
});

test("How you can reach them: the phone with its sources and Call, the email with its state in words and Copy and Draft, and texts and WhatsApp locked with the reason", async () => {
  reset();
  const { tree, acts } = page().draw();
  assert.equal(textOf(byTestId(tree, "peek-phone-value")), "+15125550142");
  assert.equal(textOf(find(byTestId(tree, "peek-phone"), (n) => n.props?.className === "pk-rn")), "The same number on Google Maps and their website");
  assert.ok(byTestId(tree, "peek-call"), "Call is on the phone row");
  assert.equal(textOf(byTestId(tree, "peek-email-value")), "hello@travisheightscoaching.example");
  assert.equal(textOf(byTestId(tree, "peek-email-word")), LEAD_EMAIL_WORDS.ok);
  assert.equal(byTestId(tree, "peek-copy").props["aria-label"], "Copy the email");
  assert.ok(byTestId(tree, "peek-draft"));
  assert.equal(textOf(byTestId(tree, "peek-locked-line")), LEAD_LOCKED_LINE);
  assert.equal(all(byTestId(tree, "peek-locked"), (n) => n.type === "button" || n.type === "a").length, 0, "nothing sends a text to a lead");
  await press(byTestId(tree, "peek-copy"));
  assert.deepEqual(copied, [`email ${LEAD}`]);
  assert.equal(typeof acts.onDraft, "function");
});

test("a catch-all email reads Unconfirmed, wears the dashed ring and says the search's own standard beside it", () => {
  reset();
  const { tree } = page({ vm: vmOf({ email_state: "catch_all" }) }).draw();
  assert.equal(textOf(byTestId(tree, "peek-email-word")), "Unconfirmed");
  assert.equal(textOf(byTestId(tree, "peek-email-note")), "Their server accepts every address, so the check can't tell");
  assert.equal(textOf(byTestId(tree, "peek-email-standard")), LEAD_CONTACT_STANDARD_WORDS.email);
  const shape = find(byTestId(tree, "peek-email"), (n) => /ld-shape-catch_all/.test(n.props?.className || ""));
  assert.ok(shape, "the dashed ring, not a check");
  assert.equal(all(byTestId(tree, "peek-email"), (n) => /ld-shape-ok/.test(n.props?.className || "")).length, 0);
});

test("the checks come in two groups -- what was seen and what Claude read -- each with where it came from, and nothing Claude read wears a plain check", () => {
  reset();
  const { tree } = page().draw();
  const seen = byTestId(tree, "peek-checks-seen");
  const read = byTestId(tree, "peek-checks-read");
  assert.equal(textOf(find(seen, (n) => n.props?.className === "pk-group-label")), LEAD_CHECK_GROUP_WORDS.seen);
  assert.equal(textOf(find(read, (n) => n.props?.className === "pk-group-label")), "Claude's read");
  assert.deepEqual(all(seen, (n) => /^pk-ck /.test(n.props?.className || "")).map((n) => textOf(find(n, (x) => x.props?.className === "pk-ck-t"))), [
    "Open for business",
    "In the area you asked for — Travis Heights, inside 20km of the center",
    "Phone matches on two sources",
    "Mailbox exists",
  ]);
  assert.deepEqual(all(read, (n) => /^pk-ck /.test(n.props?.className || "")).map((n) => textOf(find(n, (x) => x.props?.className === "from"))), ["Claude · the listing", "Claude · the listing", "Claude · website"]);
  assert.equal(all(read, (n) => /pk-ck-check/.test(n.props?.className || "")).length, 0, "nothing read wears a plain check mark (P2)");
  assert.equal(all(seen, (n) => /pk-ck-check/.test(n.props?.className || "")).length, 4, "what was seen does");
});

test("a criterion Claude could not tell says so, in its own group, and never a check", () => {
  reset();
  const unsure = CHECKS.map((c) => (c.key === "independent" ? { ...c, answer: "unknown", reason: "the listing does not say" } : c));
  const { tree } = page({ vm: vmOf({ member: { checks: unsure } }) }).draw();
  const ck = byTestId(tree, "peek-check-independent");
  assert.equal(textOf(find(ck, (n) => n.props?.className === "pk-ck-t")), `${LEAD_CHECK_UNSURE} — the listing does not say`);
  assert.equal(/\bwarn\b/.test(ck.props.className), true);
  assert.equal(all(ck, (n) => /pk-ck-check/.test(n.props?.className || "")).length, 0);
});

test("the other addresses are folded, with why Claude picked this one; Found is three lines; the site and Instagram are the foot", () => {
  reset();
  const { tree } = page().draw();
  const others = byTestId(tree, "peek-others");
  assert.equal(others.type, "details", "folded, not open");
  assert.equal(textOf(byTestId(tree, "peek-others-summary")), "2 other addresses on their site");
  assert.deepEqual(all(others, (n) => n.type === "li").map(textOf), ["careers@travisheightscoaching.example — for job seekers", "A coach's personal mailbox — not the business"]);
  assert.equal(textOf(byTestId(tree, "peek-others-why")), "on their own domain and answers bookings");
  assert.deepEqual(all(byTestId(tree, "peek-found"), (n) => n.props?.className === "pk-tr").map(textOf), [
    "2:14 PMOn Google Maps, searching “personal trainer”",
    "2:14 PMTheir website, travisheightscoaching.example: an email on the contact page",
    "2:16 PMMailbox check: Mailbox exists",
  ]);
  assert.equal(byTestId(tree, "peek-website").props.href, "https://travisheightscoaching.example");
  assert.equal(byTestId(tree, "peek-instagram").props.href, "https://instagram.example/travisheights");
});

test("a Needs review lead says so and offers Keep and Exclude; an Excluded one says it does not count and offers Put back", async () => {
  reset();
  const review = page({ vm: vmOf({ member: { class: "review", fit: null, reason: "Couldn't check the email" } }) });
  let tree = review.draw().tree;
  assert.equal(textOf(byTestId(tree, "peek-fit")), "Needs review. Couldn't check the email");
  await press(byTestId(tree, "peek-keep"));
  await press(byTestId(tree, "peek-exclude"));
  assert.deepEqual(flashes.map((f) => f.msg), [`keep ${LEAD}`, `exclude ${LEAD}`]);

  reset();
  const out = page({ vm: vmOf({ member: { class: "excluded", fit: null, excluded_by: "chain", reason: "Part of Crunch Fitness, a chain with many locations" } }) });
  tree = out.draw().tree;
  assert.equal(textOf(byTestId(tree, "peek-fit")), "Chain gyms. Part of Crunch Fitness, a chain with many locations", "the owner's own word for the criterion");
  assert.equal(byTestId(tree, "peek-stage"), null, "an excluded place has no stage");
  assert.equal(textOf(byTestId(tree, "peek-left-out")), "Left out of this search. It doesn't count.");
  await press(byTestId(tree, "peek-put-back"));
  assert.deepEqual(flashes.map((f) => f.msg), [`put back ${LEAD}`]);
});

test("an operator sees Not a fit, Keep, Exclude and Put back disabled with the gate's sentence, and pressing one does nothing", async () => {
  reset();
  globalThis.window.ST_STORE = { can: (a) => a !== "find", myRole: () => "operator" };
  const { tree } = page({ vm: vmOf({ member: { class: "review", fit: null, reason: "Couldn't check the email" } }) }).draw();
  for (const [id, doing] of [["peek-not-a-fit", "set this lead aside"], ["peek-keep", "keep this lead"], ["peek-exclude", "exclude this lead"]]) {
    const b = byTestId(tree, id);
    assert.equal(b.props["aria-disabled"], true, id);
    assert.equal(b.props["aria-description"], `Only an owner can ${doing}.`, id);
    assert.equal(b.props.disabled, false, `${id}: never disabled + title, which no keyboard reaches`);
  }
  await press(byTestId(tree, "peek-keep"));
  assert.deepEqual(flashes, [], "the gate replaced the handler");
});

test("a stage click goes through the one door and says what the door said, with Undo; it never converts", async () => {
  reset();
  const courier = courierOf({ stage: () => ({ ok: true, data: { stage: "converted", closed_reason: null, contact_id: null, existed: false, converted: false, op_id: "op-9", version: 5, toast: "Marked talking. They join People when they write or call in, or when a call goes well.", undo: { op_id: "op-9", version: 5 } } }) });
  const P = page({ courier });
  await press(byTestId(P.draw().tree, "peek-stage-converted"));
  await settle();
  assert.deepEqual(courier.seen[0], ["stage", LEAD, { kind: "stage", stage: "converted" }], "a click says Talking; it never says convert");
  assert.equal(flashes[0].msg, "Marked talking. They join People when they write or call in, or when a call goes well.");
  await flashes[0].undo();
  assert.deepEqual(courier.seen[1], ["undo", "op-9", 5]);
  assert.deepEqual(opened, [], "nobody was made a person");
});

test("Esc backs out one step: the question it asked, then the pane it opened, then the peek", () => {
  reset();
  const st = { mode: "draft", armed: { kind: "call", leadId: LEAD, asked: true }, peekId: LEAD };
  const arg = { mode: st.mode, armed: st.armed, setMode: (v) => { st.mode = v; }, setArmed: (v) => { st.armed = v; }, setPeekId: (v) => { st.peekId = v; } };
  assert.equal(globalThis.leadPeekEscape(arg), "armed");
  assert.equal(st.armed, null);
  assert.equal(globalThis.leadPeekEscape({ ...arg, armed: st.armed }), "mode");
  assert.equal(st.mode, "info");
  assert.equal(globalThis.leadPeekEscape({ ...arg, armed: null, mode: st.mode }), "peek");
  assert.equal(st.peekId, null);
  assert.deepEqual([globalThis.leadPeekFollows("info", null), globalThis.leadPeekFollows("draft", null), globalThis.leadPeekFollows("info", { kind: "call" })], [true, false, false], "a question or a draft holds the peek on its lead");
});

test("focus moves into the peek when it opens and back to the row when it closes, and the return watcher takes its listeners down", () => {
  reset();
  const focused = [];
  const el = (id) => ({ id, focus: () => focused.push(id) });
  globalThis.document.getElementById = (id) => el(id);
  globalThis.leadPeekFocus(LEAD, null);
  globalThis.leadPeekFocus(null, LEAD);
  assert.deepEqual(focused, ["lead-peek-close", `lead-${LEAD}`], "the row is the cursor's, by the table's own noun");
  globalThis.document.getElementById = undefined;

  const st = { armed: { kind: "call", leadId: LEAD, asked: false } };
  const stop = globalThis.leadArmOnReturn(st.armed, (v) => { st.armed = typeof v === "function" ? v(st.armed) : v; });
  assert.deepEqual([(listeners.focus || []).length, (listeners.visibilitychange || []).length], [1, 1]);
  globalThis.document.hidden = true;
  for (const fn of listeners.focus) fn();
  assert.equal(st.armed.asked, false, "nothing is asked while the tab is still hidden");
  globalThis.document.hidden = false;
  for (const fn of listeners.focus) fn();
  assert.equal(st.armed.asked, true);
  stop();
  assert.deepEqual([(listeners.focus || []).length, (listeners.visibilitychange || []).length], [0, 0], "no listener is left behind");
  assert.equal(globalThis.leadArmOnReturn(st.armed, () => {}), undefined, "an answered question arms nothing");
});

test("a refused act is the route's sentence, and nothing on the page pretends it happened", async () => {
  reset();
  const courier = courierOf({ stage: () => ({ ok: false, message: "This lead is gone.", code: "not_found", status: 404 }) });
  const P = page({ courier });
  await press(byTestId(P.draw().tree, "peek-stage-nurture"));
  await settle();
  assert.equal(flashes[0].tone, "danger");
  assert.equal(textOf(flashes[0].msg).includes("This lead is gone."), true);
});
```

`LEAD_DRAFT_NOTE`, `LEAD_NO_ADDRESS`, `LEAD_NOT_A_FIT_WORDS` and `outcomeMove` are imported here and first read by Tasks 13–15; `leadArmOnReturn` is Task 13's and is proven here beside the focus rule, because both are the dialog's.

- [ ] **Step 2: Run it and see it fail.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-peek.test.mjs` → every test fails at the import (`Cannot find module '.../packages/contracts/src/leads.ts'` if Task 4.1 has not landed) or, once it has, at `TypeError: globalThis.LeadPeekActions is not a function`: the page file does not exist yet.

- [ ] **Step 3: The words and the view model, in contracts.** Append to `packages/contracts/src/leads.ts` (Task 4.1's file), after `export const LEAD_CONSENT_REFUSAL = …` (that line occurs exactly once):

```ts
/* --------------------------------------------- release B, tasks 12-15 ---- */

/** Not a fit's five whys, in the order the peek and the bulk bar offer them (§9.5). */
export const LEAD_NOT_A_FIT_WORDS: Record<LeadNotAFitWhy, string> = {
  chain: "A chain or franchise",
  wrong_kind: "The wrong kind of business",
  too_far: "Too far away",
  customer: "Already a customer",
  other: "Something else",
};
export const LEAD_NOT_A_FIT_TITLE = "What makes it not a fit?";
/** The one why that hides the place from every future search; the rest teach nothing in this release. */
export const LEAD_SUPPRESSING_WHY: LeadNotAFitWhy = "customer";
export const LEAD_REVIEW_WORD = "Needs review";
export const LEAD_LEFT_OUT_WORD = "Left out";
/** The peek's two groups of checks (P2, §0.1). Nothing read wears a plain check mark. */
export const LEAD_CHECK_GROUP_WORDS: Record<"seen" | "read", string> = { seen: "Seen", read: "Claude's read" };
export const LEAD_CHECK_UNSURE = "Couldn't tell";
// LEAD_CHECK_KEYS and LeadCheckKey are 4.6's, written with the DTOs in step 2 of
// Task 4.1; the seven are four seen and three read. Nothing here declares them again.
/** One label per check and answer; the particulars are the check's own reason. */
export const LEAD_CHECK_WORDS: Record<LeadCheckKey, Record<"yes" | "no" | "unknown", string>> = {
  on_maps: { yes: "Open for business", no: "Not open for business", unknown: LEAD_CHECK_UNSURE },
  in_area: { yes: "In the area you asked for", no: "Outside the area you asked for", unknown: LEAD_CHECK_UNSURE },
  phone_two_sources: { yes: "Phone matches on two sources", no: "Phone from one source only", unknown: LEAD_CHECK_UNSURE },
  mailbox: { yes: "Mailbox exists", no: "Mailbox doesn't exist", unknown: LEAD_CHECK_UNSURE },
  independent: { yes: "Not a chain", no: "Part of a chain", unknown: LEAD_CHECK_UNSURE },
  right_kind: { yes: "The kind you asked for", no: "Not the kind you asked for", unknown: LEAD_CHECK_UNSURE },
  own_address: { yes: "The business's own address", no: "Not the business's own address", unknown: LEAD_CHECK_UNSURE },
};
/** The mailbox check says the state it saw, never a word for it (§10.4, S12). */
export const LEAD_MAILBOX_WORDS: Record<LeadEmailState, string> = {
  none: "No email found on their site",
  checking: "Checking the mailbox",
  ok: "Mailbox exists",
  catch_all: "Their server accepts every address, so the check can't tell",
  unknown: "Their mail server wouldn't answer",
  invalid: "That mailbox doesn't exist",
};
/** What the peek says under the email, from the plan's own contact standard (§0.1). */
export const LEAD_CONTACT_STANDARD_WORDS: Record<"phone" | "email", string> = {
  phone: "This search counts a phone as enough.",
  email: "This search asked for a checked email.",
};
/** The note under the email of a lead that came with none, and the one thing left to do. */
export const LEAD_NO_EMAIL_LINE = "Checked their home, contact and about pages. Call instead.";
/** Both questions the peek asks when the owner comes back to the tab (§9.3, §9.4). */
export const LEAD_SENT_QUESTION = "Did you send it?";
export const LEAD_CALL_QUESTION = "How did the call go?";
export const LEAD_NOTE_PLACEHOLDER = "A note for next time, if you like";
export const LEAD_NOTE_MAX = 280;
/** A stage click never converts (§9.6): the control says where the yes comes from. */
export const LEAD_TALKING_NOTE = "They join People when they write or call in, or when a call goes well.";

/** How much of the note is left, said in the field (§9.4). */
export function leadNoteLeft(left: number, max: number): string {
  return left >= max ? `Up to ${max} characters` : `${left} left`;
}

/**
 * Every word the Leads scope's own markup says, spelled once here and seeded onto the window as `window.__LEAD_WORDS`
 * by `seed-globals.ts` (step 8 below), because the legacy pages import nothing. A words record is a global seeded once
 * at boot, like `__FACT_WORDS`, not a courier's -- the courier carries acts. Task 19 adds the facts' own words (the
 * stages, the endings, the guardrail sentences) to THIS record; there is one `LEAD_WORDS` and nothing else holds a
 * lead's words. A sentence the server also says is not here: the routes' toasts are the routes' own.
 */
export const LEAD_WORDS = {
  close: "Close",
  open: "Open",
  stageLabel: "Stage",
  notFit: LEAD_CLOSED_WORDS.not_a_fit,
  notFitTitle: LEAD_NOT_A_FIT_TITLE,
  whys: LEAD_NOT_A_FIT_WHYS.map((id) => ({ id, label: LEAD_NOT_A_FIT_WORDS[id] })),
  keep: "Keep",
  exclude: "Exclude",
  putBack: "Put back",
  leftOut: "Left out of this search. It doesn't count.",
  reach: "How you can reach them",
  checked: "Checked",
  found: "Found",
  call: "Call",
  copy: "Copy",
  copyAria: "Copy the email",
  draft: "Draft",
  noWebsite: "No website listed",
  instagram: "Instagram",
  talkingNote: LEAD_TALKING_NOTE,
  sentQuestion: LEAD_SENT_QUESTION,
  sentYes: "Yes, mark contacted",
  sentNo: "Not yet",
  callQuestion: LEAD_CALL_QUESTION,
  callSave: "Save",
  callCancel: "I didn't call",
  outcomes: LEAD_CALL_OUTCOMES.map((id) => ({ id, label: LEAD_CALL_OUTCOME_WORDS[id] })),
  noteLabel: "A note about the call",
  notePlaceholder: LEAD_NOTE_PLACEHOLDER,
  noteMax: LEAD_NOTE_MAX,
  noteLeft: leadNoteLeft,
  backTo: "Back to",
  to: "To",
  subject: "Subject",
  draftRewrite: "Rewrite",
  tones: [{ id: "shorter", label: "Shorter" }, { id: "warmer", label: "Warmer" }],
  draftWriting: "Writing it…",
  draftNote: LEAD_DRAFT_NOTE,
  draftOpen: "Open in your email",
  draftFrom: "Sent from your own inbox",
  copiedDraft: "Copied the email.",
} as const;
```

and, after `export function leadDraftFooter(business: string, address: string): string { … }` (that function occurs exactly once), the row's shape and the peek's:

`LeadCheck`, `LeadRowDto`, `LeadSearchRoundDto` and `LeadSearchDto` are **already in this file**: Task 4.1's step 2 writes them from 4.6's block, with `email_checked_at`, the four worked-state columns and the seven `LEAD_CHECK_KEYS` that this task's peek reads (`judgment` and `email_alternates` reach them through `leads_page`, 4.2). Nothing below re-declares one — a second `LeadRowDto` in one module is a `TS2300`. What this task adds is the peek's own two types and its functions:

```ts
/* ---------------------------------------------------------------- the peek */

export interface LeadPeekReach {
  phone: { value: string; note: string; tel: string | null; wrong: boolean } | null;
  email: { value: string; note: string; standard: string; state: LeadEmailState; word: string; address: string | null; canDraft: boolean };
  locked: { title: string; line: string };
}
export interface LeadPeekVM {
  id: string;
  searchId: string | null;
  mark: string;
  name: string;
  /** The first two words of the name, for "Back to Zilker Strength". */
  short: string;
  sub: string;
  cls: LeadClass;
  stage: LeadStage;
  stages: { id: "ready" | "nurture" | "converted"; label: string; on: boolean }[];
  canStage: boolean;
  notFitWord: string;
  fit: { word: string; cls: string; sentence: string };
  reach: LeadPeekReach;
  groups: { how: "seen" | "read"; label: string; checks: { key: LeadCheckKey; label: string; answer: "yes" | "no" | "unknown"; source: string; reason: string | null }[] }[];
  others: { summary: string; picked: string | null; items: { email: string; why: string }[] } | null;
  found: { at: string; what: string }[];
  links: { website: { label: string; href: string } | null; instagram: { label: string; href: string } | null };
  version: number;
}

/** The initials a place wears in the table and at the head of the peek. */
export function leadMark(name: string): string {
  const w = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase() || "?";
}
/** The owner's own word for the criterion a place was left out by; the plan holds it. */
export function leadExclusionWord(search: LeadSearchDto | null, key: string | null): string {
  if (!key) return LEAD_LEFT_OUT_WORD;
  const plan = search?.plan;
  const ex = plan?.exclusions.find((e) => e.key === key);
  if (ex) return ex.text;
  const cr = plan?.criteria.find((c) => c.key === key);
  return cr ? cr.text : LEAD_LEFT_OUT_WORD;
}
/** A clock time on the day it happened, and the date too once it is not today (the peek is read weeks later). */
function clockIn(tz: string, iso: string | null, now: Date): string {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at);
  if (day(at) === day(now)) return clock;
  return `${new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(at)}, ${clock}`;
}

/**
 * The peek (§9.2, P2, S12): the sub-line, the fit sentence, how to reach them, the checks in two groups (what was
 * seen, and what Claude read), the other addresses, Found, the site. Every sentence here, so the page says nothing
 * of its own.
 */
export function toLeadPeekVM(r: LeadRowDto, search: LeadSearchDto | null, tz: string, now: Date): LeadPeekVM {
  const m = r.member;
  const area = [r.city, r.state].filter(Boolean).join(", ");
  const sub = [r.category, area].filter(Boolean).join(" · ") + (r.places > 1 ? ` · ${r.places} locations` : "");
  const fitWord = m.class === "qualified"
    ? (m.fit ? LEAD_FIT_WORDS[m.fit] : LEAD_FIT_WORDS.look)
    : m.class === "review" ? LEAD_REVIEW_WORD : leadExclusionWord(search, m.excluded_by);
  const fitCls = m.class === "qualified" ? (m.fit ?? "look") : m.class === "review" ? "review" : "out";
  const standard = LEAD_CONTACT_STANDARD_WORDS[search?.plan.contact === "email" ? "email" : "phone"];
  const emailNote = r.email
    ? r.email_state === "ok" ? `${LEAD_MAILBOX_WORDS.ok} · checked ${clockIn(tz, r.email_checked_at, now)}`
      : r.email_state === "checking" ? LEAD_MAILBOX_WORDS.checking
      : r.email_state === "invalid" ? `${LEAD_MAILBOX_WORDS.invalid}. Call instead.`
      : LEAD_MAILBOX_WORDS[r.email_state]
    : LEAD_NO_EMAIL_LINE;
  const mailboxLabel = LEAD_MAILBOX_WORDS[r.email_state];
  const seen: LeadPeekVM["groups"][number]["checks"] = [];
  const read: LeadPeekVM["groups"][number]["checks"] = [];
  for (const c of m.checks) {
    const label = c.key === "mailbox" ? mailboxLabel : LEAD_CHECK_WORDS[c.key][c.answer];
    (c.how === "seen" ? seen : read).push({ key: c.key, label, answer: c.answer, source: c.source, reason: c.reason });
  }
  const others = m.other_emails.length
    ? {
        summary: `${m.other_emails.length} other address${m.other_emails.length === 1 ? "" : "es"} on their site`,
        picked: m.checks.find((c) => c.key === "own_address")?.reason ?? null,
        items: m.other_emails,
      }
    : null;
  const host = r.website;
  const siteLine = host
    ? r.email_state === "none"
      ? `Their website, ${host}: no email on the home, contact or about pages`
      : `Their website, ${host}: an email on the contact page`
    : "No website to check";
  const term = search?.plan.terms[0] ?? null;
  return {
    id: r.id,
    searchId: r.search_id ?? null,
    mark: leadMark(r.business_name),
    name: r.business_name,
    short: r.business_name.split(/\s+/).slice(0, 2).join(" "),
    sub,
    cls: m.class,
    stage: r.stage,
    stages: (["ready", "nurture", "converted"] as const).map((id) => ({ id, label: LEAD_STAGE_WORDS[id], on: r.stage === id })),
    canStage: m.class !== "excluded",
    notFitWord: LEAD_CLOSED_WORDS.not_a_fit,
    fit: { word: fitWord, cls: fitCls, sentence: m.reason },
    reach: {
      phone: r.phone
        ? {
            value: r.phone,
            note: r.phone_wrong ? "You marked this number wrong." : r.phone_agrees ? "The same number on Google Maps and their website" : "From their Google Maps listing",
            tel: r.phone_wrong ? null : `tel:${r.phone}`,
            wrong: r.phone_wrong,
          }
        : null,
      email: {
        value: r.email ?? "No email on their site",
        note: emailNote,
        standard,
        state: r.email_state,
        word: LEAD_EMAIL_WORDS[r.email_state],
        address: r.email,
        canDraft: !!r.email && r.email_state !== "invalid" && r.email_state !== "none",
      },
      locked: { title: "Texts and WhatsApp", line: LEAD_LOCKED_LINE },
    },
    groups: [
      { how: "seen", label: LEAD_CHECK_GROUP_WORDS.seen, checks: seen },
      { how: "read", label: LEAD_CHECK_GROUP_WORDS.read, checks: read },
    ].filter((g) => g.checks.length > 0) as LeadPeekVM["groups"],
    others,
    found: [
      { at: clockIn(tz, r.found_at, now), what: term ? `On Google Maps, searching “${term}”` : "On a Google Maps listing" },
      { at: clockIn(tz, r.found_at, now), what: siteLine },
      { at: clockIn(tz, r.email_checked_at ?? r.found_at, now), what: `Mailbox check: ${mailboxLabel}` },
    ],
    links: {
      website: host ? { label: host, href: `https://${host}` } : null,
      instagram: r.instagram ? { label: "Instagram", href: r.instagram } : null,
    },
    version: r.version,
  };
}
```

`LeadRowDto` is the shape `leads_page` returns after Task 4.2 widens it (W2's settled list: `judgment`, `email_alternates`, `last_outcome`, `last_note`, `contacted_at`, `converted_at`, `exported_at`, `places`, `version`, `page_key` beside release A's columns). `member.checks` is built from `judgment`, `member.other_emails` from `email_alternates`; `last_outcome`, `last_note`, `contacted_at` and `converted_at` are in the DTO because the door returns them and a fixture copies the real shape — release B's peek draws the three finding steps §9.2 names and nothing from them.

The listing and the site were read by one run, so the first two **Found** lines share `found_at`; only the mailbox has a time of its own (`email_checked_at`). `LEAD_CHECK_KEYS` is seven, not §9.2's "six": §0.1 names four that were seen (open on Maps, the area by coordinates, the phone on two sources, the mailbox) and three Claude read (independent, the right kind, the business's own address), and `LeadCheck["key"]` in Task 4.6 is those seven.

- [ ] **Step 4: The peek.** Create `apps/dashboard/src/legacy/pages/leads-peek.jsx`:

```jsx
/* global React, Icon */
// The peek: one lead, beside the table (408px) or full height on a phone, and everything the owner does to it
// without leaving the rows -- the stage, Not a fit, Keep and Exclude, Put back, a call from their own phone, and a
// draft for their own inbox. Hookless, as the page's rules ask: every piece of state here is ClientsAReal's
// (peekId, peekMode, armed, draft), handed down, so the tests' stub React keys its hooks by one call order.
//
// Nothing in this file writes a sentence of its own. The words are contracts' (window.__LEAD_WORDS) and the view
// model is contracts' (window.__leadPeekVM), so a word the owner reads is spelled once; the toasts are the route's
// own sentences, because the door decides what happened (a stage click never converts: PRD 9.6).

const LD_MARKS = {
  check: "M3.5 8.5l3 3 6-6.5",
  cross: "M4.5 4.5l7 7M11.5 4.5l-7 7",
};

// `LeadShape` is `leads-scope.jsx`'s (Task 2), which draws the same five shapes for the same five email states and
// is loaded before this file. It is read from `window` here and declared nowhere twice; `.ld-shape*` is one class
// in one stylesheet.

/**
 * A check's mark. Nothing Claude read wears a plain check (PRD 0.1, P2): what was seen gets the check, what was read
 * gets a dashed ring, and either can say it could not tell.
 */
const ldCheckMark = (how, answer) => {
  const p = { width: 13, height: 13, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
  if (answer === "unknown") return <span className="pk-ck-mark pk-ck-ask"><svg {...p}><path d="M6 6.2a2 2 0 113 1.8v1" /><circle cx="8" cy="11.6" r="0.8" fill="currentColor" stroke="none" /></svg></span>;
  if (answer === "no") return <span className={`pk-ck-mark pk-ck-cross${how === "read" ? " pk-ck-read" : ""}`}><svg {...p}><path d={LD_MARKS.cross} /></svg></span>;
  if (how === "read") return <span className="pk-ck-mark pk-ck-read"><svg {...p}><circle cx="8" cy="8" r="5.5" strokeDasharray="2.5 2.5" /></svg></span>;
  return <span className="pk-ck-mark pk-ck-check"><svg {...p}><path d={LD_MARKS.check} /></svg></span>;
};

/** Esc backs out one step: the question it asked, then the pane it opened, then the peek itself. */
const leadPeekEscape = ({ mode, armed, setMode, setArmed, setPeekId }) => {
  if (armed && armed.asked) { setArmed(null); return "armed"; }
  if (mode && mode !== "info") { setMode("info"); return "mode"; }
  setPeekId(null);
  return "peek";
};
/**
 * The dialog's focus rule: focus moves into the peek when it opens, and back to the row when it closes. The row is
 * the cursor (`lead-<id>`, the table's own id from its noun), so Tab carries on from where the owner was.
 */
const leadPeekFocus = (peekId, cursor) => {
  const doc = window.document;
  if (!doc || !doc.getElementById) return;
  const el = peekId ? doc.getElementById("lead-peek-close") : cursor && doc.getElementById(`lead-${cursor}`);
  if (el && el.focus) el.focus({ preventScroll: true });
};
/** The peek follows the row cursor only while it is just showing the lead: a question or a draft holds it still. */
const leadPeekFollows = (mode, armed) => (!mode || mode === "info") && !armed;

const LeadPeekHead = ({ vm, onClose }) => {
  const W = window.__LEAD_WORDS;
  return (
    <div className="pk-head">
      <span className="pk-mark" aria-hidden="true">{vm.mark}</span>
      <div className="pk-titles">
        <h2 className="pk-name" data-testid="peek-name">{vm.name}</h2>
        <div className="pk-sub" data-testid="peek-sub">{vm.sub}</div>
      </div>
      <button type="button" className="pk-x" id="lead-peek-close" aria-label={W.close} data-testid="peek-close" onClick={onClose}><Icon name="x" size={16} /></button>
    </div>
  );
};

const LeadPeekInfo = ({ vm, mode, armed, busy, on }) => {
  const W = window.__LEAD_WORDS;
  return (
    <>
      <div className="pk-top">
        {vm.canStage ? (
          <>
            <div className="seg" role="radiogroup" aria-label={W.stageLabel} data-testid="peek-stage">
              {vm.stages.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={s.on} className={s.on ? "on" : ""} disabled={busy} data-testid={`peek-stage-${s.id}`} onClick={() => on.onStage(s.id)}>{s.label}</button>
              ))}
            </div>
            <span className="sp" />
            <button type="button" className="btn btn-ghost btn-sm" data-testid="peek-not-a-fit" onClick={on.onNotAFit} {...window.gate("find", "set this lead aside")}>{W.notFit}</button>
          </>
        ) : (
          <>
            <span className="pk-out-note" data-testid="peek-left-out">{W.leftOut}</span>
            <span className="sp" />
            <button type="button" className="btn btn-sm" data-testid="peek-put-back" onClick={() => on.onPutBack(vm.id)} {...window.gate("find", "put this lead back")}>{W.putBack}</button>
          </>
        )}
      </div>
      <div className="pk-body">
        <p className="pk-fit" data-testid="peek-fit"><b className={vm.fit.cls}>{`${vm.fit.word}.`}</b>{` ${vm.fit.sentence}`}</p>
        {vm.cls === "review" ? (
          <div className="pk-decide" data-testid="peek-decide">
            <button type="button" className="btn btn-sm" data-testid="peek-keep" onClick={() => on.onKeep(vm.id)} {...window.gate("find", "keep this lead")}>{W.keep}</button>
            <button type="button" className="btn btn-ghost btn-sm" data-testid="peek-exclude" onClick={() => on.onExclude(vm.id)} {...window.gate("find", "exclude this lead")}>{W.exclude}</button>
          </div>
        ) : null}
        <div>
          <div className="pk-label">{W.reach}</div>
          {vm.reach.phone ? (
            <div className="pk-rr" data-testid="peek-phone">
              <Icon name="phone" />
              <div>
                <div className={`pk-rv${vm.reach.phone.wrong ? " wrong" : ""}`} data-testid="peek-phone-value">{vm.reach.phone.value}</div>
                <div className="pk-rn">{vm.reach.phone.note}</div>
              </div>
              {vm.reach.phone.tel ? <button type="button" className="btn btn-sm" data-testid="peek-call" onClick={() => on.onCall(vm.id)}><Icon name="phone" size={12} />{W.call}</button> : <span />}
            </div>
          ) : null}
          <div className={`pk-rr${vm.reach.email.address ? "" : " locked"}`} data-testid="peek-email">
            <Icon name="mail" />
            <div>
              <div className="pk-rv">
                <LeadShape state={vm.reach.email.state} />
                <span data-testid="peek-email-value">{vm.reach.email.value}</span>
                <span className="pk-rw" data-testid="peek-email-word">{vm.reach.email.word}</span>
              </div>
              <div className="pk-rn" data-testid="peek-email-note">{vm.reach.email.note}</div>
              <div className="pk-rn" data-testid="peek-email-standard">{vm.reach.email.standard}</div>
            </div>
            {vm.reach.email.canDraft ? (
              <span className="pk-rr-acts">
                <button type="button" className="btn btn-sm" aria-label={W.copyAria} data-testid="peek-copy" onClick={() => on.onCopy(vm.id)}>{W.copy}</button>
                <button type="button" className="btn btn-sm" data-testid="peek-draft" onClick={() => on.onDraft(vm.id)}><Icon name="edit" size={12} />{W.draft}</button>
              </span>
            ) : <span />}
          </div>
          <div className="pk-rr locked" data-testid="peek-locked">
            <Icon name="chat" />
            <div>
              <div className="pk-rv">{vm.reach.locked.title}</div>
              <div className="pk-rn" data-testid="peek-locked-line">{vm.reach.locked.line}</div>
            </div>
            <span />
          </div>
        </div>
        <div data-testid="peek-checks">
          <div className="pk-label">{W.checked}</div>
          {vm.groups.map((g) => (
            <div key={g.how} className={`pk-group pk-group-${g.how}`} data-testid={`peek-checks-${g.how}`}>
              <div className="pk-group-label">{g.label}</div>
              <div className="pk-checks">
                {g.checks.map((c) => (
                  <div key={c.key} className={`pk-ck ${g.how}${c.answer === "no" ? " no" : c.answer === "unknown" ? " warn" : ""}`} data-testid={`peek-check-${c.key}`}>
                    {ldCheckMark(g.how, c.answer)}
                    <span className="pk-ck-t">{c.label}{c.reason ? <span className="pk-ck-why">{` — ${c.reason}`}</span> : null}</span>
                    <span className="from">{c.source}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {vm.others ? (
          <details className="pk-alt" data-testid="peek-others">
            <summary data-testid="peek-others-summary">{vm.others.summary}</summary>
            <ul>{vm.others.items.map((o) => <li key={o.email}>{`${o.email} — ${o.why}`}</li>)}</ul>
            {vm.others.picked ? <p className="pk-alt-why" data-testid="peek-others-why">{vm.others.picked}</p> : null}
          </details>
        ) : null}
        <div data-testid="peek-found">
          <div className="pk-label">{W.found}</div>
          <div className="pk-tl">
            {vm.found.map((f) => (
              <div className="pk-tr" key={f.what}><span className="t">{f.at}</span><span>{f.what}</span></div>
            ))}
          </div>
        </div>
      </div>
      <div className="pk-foot">
        {vm.links.website
          ? <a className="btn btn-ghost btn-sm" href={vm.links.website.href} target="_blank" rel="noopener noreferrer" data-testid="peek-website"><Icon name="external" size={12} />{vm.links.website.label}</a>
          : <span className="pk-rn" data-testid="peek-no-website">{W.noWebsite}</span>}
        <span className="sp" />
        {vm.links.instagram
          ? <a className="btn btn-ghost btn-sm" href={vm.links.instagram.href} target="_blank" rel="noopener noreferrer" data-testid="peek-instagram"><Icon name="instagram" size={12} />{W.instagram}</a>
          : null}
      </div>
    </>
  );
};

/**
 * One lead, beside the rows. role="dialog" with .pl-peek, which PL_OVERLAY names apart (the page's own overlay), so
 * J and K keep walking the rows behind it and Esc reaches the page's one listener.
 */
const LeadPeek = ({ vm, mode = "info", armed = null, draft = null, busy = false, ...on }) => {
  if (!vm) return null;
  return (
    <aside className="pk pl-peek" role="dialog" aria-label={vm.name} data-testid="lead-peek">
      <LeadPeekHead vm={vm} onClose={on.onClose} />
      <LeadPeekInfo vm={vm} mode={mode} armed={armed} busy={busy} on={on} />
    </aside>
  );
};

/**
 * The peek's acts, as named functions over the page's state and the courier. A factory, not a hook: LeadsScope calls
 * it on every draw with what it holds, so nothing here keeps state of its own. Keep, Exclude, Put back and Copy are
 * the scope's own (Task 11); this hands them on so the peek has one shape of props.
 */
const LeadPeekActions = (p) => {
  const api = p.courier || window;
  const vm = p.vm;
  const refuse = (r, what) => p.flash(window.refusalToast ? window.refusalToast(r, what) : { tone: "danger", msg: (r && r.message) || what });
  const undoOf = (undo) => (undo ? async () => {
    const u = await api.__leadUndo(undo.op_id, undo.version);
    if (!u.ok) refuse(u, "Not undone");
  } : undefined);
  // Every sentence here is the route's: the door decided what happened, so the page never guesses (PRD 9.6).
  const said = (d) => p.flash({
    msg: d.toast,
    undo: undoOf(d.undo),
    action: d.converted && d.contact_id ? { label: window.__LEAD_WORDS.open, onClick: () => p.onOpenPerson(d.contact_id) } : undefined,
  });
  const post = async (input, what) => {
    const r = await api.__leadStage(vm.id, input);
    if (!r.ok) { refuse(r, what); return null; }
    said(r.data);
    return r.data;
  };
  // The owner's own phone and their own mail app: an href this page hands to the browser, never a call we place.
  const dial = p.dial || ((href) => { if (href && window.location && window.location.assign) window.location.assign(href); });
  return {
    onClose: () => { p.setArmed(null); p.setMode("info"); p.setDraft(null); p.setPeekId(null); },
    onStage: (stage) => post({ kind: "stage", stage }, "Not changed"),
    onNotAFit: () => p.setMode("why"),
    onKeep: p.keep,
    onExclude: p.exclude,
    onPutBack: p.putBack,
    onCopy: p.copyEmail,
    onCall: () => dial(vm.reach.phone ? vm.reach.phone.tel : null),
  };
};

Object.assign(window, { LeadPeek, LeadPeekActions, leadPeekEscape, leadPeekFollows, leadPeekFocus });
```

- [ ] **Step 5: The styles.** Append to `apps/dashboard/src/legacy/styles/leads.css` (Task 8 created it, with its head comment and the finder's rules, and registered it in `Chanlytics.html` and `legacy.css`; every task after that appends its own block and registers nothing). The classes are the canvas's (`lead-finder-design/canvas/lib.mjs:255–290`, `css2.css:36–50`), on the product's own tokens; the phone's rules for them are Task 18's.

```css
/* Leads — a scope of People. The finder, the strip and the rows are lf-* and ld-*; the peek is pk-*, from the
   canvas (lead-finder-design). The seeded leads.jsx's own ld-* rules lived in people.css and go with it (Task 20);
   nothing here reuses one. @container rules come AFTER what they override. */

/* ---------------------------------------------------------------- the peek */
/* Beside the table on a desktop, the page's own overlay: PL_OVERLAY names .pl-peek apart, so J and K keep walking
   the rows behind it. The phone's full-height sheet is in the phone block (Task 18). */
.pk { position: absolute; top: 0; right: 0; bottom: 0; width: 408px; background: var(--bg-raised); border-left: 1px solid var(--line); box-shadow: var(--shadow-lg); display: flex; flex-direction: column; z-index: 10; animation: pk-in 220ms var(--ease-out) backwards; }
@keyframes pk-in { from { transform: translateX(12px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .pk { animation: none; } }

.pk-head { display: flex; align-items: flex-start; gap: 12px; padding: 18px 14px 14px 18px; border-bottom: 1px solid var(--line); }
.pk-mark { width: 40px; height: 40px; border-radius: 10px; background: var(--bg-sunken); border: 1px solid var(--line); display: grid; place-items: center; font-size: 13px; font-weight: 500; color: var(--ink-muted); flex: none; }
.pk-titles { flex: 1; min-width: 0; }
.pk-name { font-size: 16px; font-weight: 600; letter-spacing: -0.015em; line-height: 1.3; margin: 0; }
.pk-sub { font-size: 12px; color: var(--ink-dim); margin-top: 2px; }
.pk-x { width: 30px; height: 30px; border-radius: 8px; border: 0; background: transparent; color: var(--ink-dim); display: grid; place-items: center; cursor: pointer; flex: none; }
.pk-x:hover { background: var(--bg-hover); color: var(--ink); }

.pk-top { display: flex; align-items: center; gap: 8px; padding: 12px 14px 12px 18px; border-bottom: 1px solid var(--line); }
.pk-top .sp { flex: 1; }
.pk-out-note { font-size: 12px; color: var(--ink-dim); }
.seg { display: inline-grid; grid-auto-flow: column; gap: 2px; padding: 2px; background: var(--bg-active); border-radius: 8px; }
.seg button { height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ink-muted); font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; }
.seg button.on { background: var(--bg-raised); color: var(--ink); box-shadow: var(--shadow-sm); }

.pk-body { flex: 1; min-height: 0; overflow: auto; padding: 16px 18px 20px; display: flex; flex-direction: column; gap: 20px; }
.pk-fit { font-size: 13px; line-height: 1.55; color: var(--ink); margin: 0; text-wrap: pretty; }
.pk-fit b { font-weight: 600; }
.pk-fit b.strong { color: var(--ok-ink); }
.pk-fit b.look { color: var(--ink); }
.pk-fit b.long, .pk-fit b.out { color: var(--ink-muted); }
.pk-fit b.review { color: var(--warn-ink); }
.pk-decide { display: flex; gap: 6px; margin-top: -12px; }
.pk-label { font-size: 10px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-dim); margin: 0 0 4px; }

.pk-rr { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 9px 0; border-top: 1px solid var(--line); }
.pk-rr:first-of-type { border-top: 0; }
.pk-rr > .icon { margin-top: 2px; color: var(--ink-dim); }
.pk-rv { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 500; min-width: 0; }
.pk-rv > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-rv.wrong { text-decoration: line-through; color: var(--ink-muted); }
.pk-rw { font-size: 11px; font-weight: 400; color: var(--ink-dim); flex: none; }
.pk-rn { font-size: 11.5px; color: var(--ink-dim); margin-top: 1px; }
.pk-rr-acts { display: flex; gap: 6px; }
.pk-rr.locked .pk-rv { color: var(--ink-muted); font-weight: 400; }
.pk-rr.locked > .icon { color: var(--ink-faint); }

/* What was seen and what Claude read, apart: nothing read wears a plain check (PRD 0.1, P2). */
.pk-group + .pk-group { margin-top: 10px; }
.pk-group-label { font-size: 11px; color: var(--ink-dim); margin: 0 0 4px; }
.pk-checks { display: flex; flex-direction: column; gap: 6px; }
.pk-ck { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px; color: var(--ink); }
.pk-ck-t { min-width: 0; }
.pk-ck-why { color: var(--ink-dim); }
.pk-ck-mark { flex: none; margin-top: 2px; display: grid; place-items: center; }
.pk-ck-check { color: var(--ok-ink); }
.pk-ck-read { color: var(--ink-muted); }
.pk-ck-ask { color: var(--warn-ink); }
.pk-ck-cross { color: var(--ink-faint); }
.pk-ck.no { color: var(--ink-muted); }
.pk-ck .from { font-size: 11px; color: var(--ink-dim); margin-left: auto; white-space: nowrap; padding-left: 8px; }

.pk-alt { font-size: 12px; color: var(--ink-dim); border-top: 1px solid var(--line); padding-top: 10px; }
.pk-alt summary { cursor: pointer; color: var(--ink-muted); }
.pk-alt ul { margin: 8px 0 0; padding-left: 16px; }
.pk-alt-why { margin: 6px 0 0; }
.pk-tl { display: flex; flex-direction: column; gap: 6px; }
.pk-tr { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 8px; font-size: 12px; color: var(--ink-muted); }
.pk-tr .t { color: var(--ink-dim); font-variant-numeric: tabular-nums; }
.pk-foot { display: flex; align-items: center; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--line); }
.pk-foot .sp { flex: 1; }

/* The shape an email state wears beside its word (PRD 10.4). */
.ld-shape { display: inline-grid; place-items: center; flex: none; }
.ld-shape-ok { color: var(--ok-ink); }
.ld-shape-catch_all, .ld-shape-checking { color: var(--ink-muted); }
.ld-shape-unknown { color: var(--warn-ink); }
.ld-shape-invalid { color: var(--ink-faint); }
.ld-shape.spin { animation: ld-spin 1.1s linear infinite; }
@keyframes ld-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ld-shape.spin { animation: none; } }
```

- [ ] **Step 6: Load it, and hand the page the words and the view model.**
  - `apps/dashboard/src/legacy-bridge/manifest.ts`: after `import "@/legacy/pages/client-profile.jsx";` and after the lead files Tasks 2 and 8 added, `import "@/legacy/pages/leads-peek.jsx";`. Both lists take it at the same place, in the same order (`legacy-harness.test.mjs:64` compares them in order).
  - `apps/dashboard/src/legacy/Chanlytics.html`: `<script type="text/babel" src="pages/leads-peek.jsx?v=1"></script>` on the same line of the list (a new file starts at 1). `styles/leads.css` is **already** listed here and in `legacy.css` — Task 8 created and registered it — so nothing about the stylesheet is added in this task.
  - `apps/dashboard/src/legacy-bridge/legacy.css`: nothing. The `@import` and the head comment's count (18 → 19) are Task 8's, and `legacy-harness.test.mjs` has held them since.
  - `apps/dashboard/src/legacy-bridge/leads.ts` (Task 3): two names, so the page reads the peek's sentences from contracts and never writes one.

```ts
import { LEAD_WORDS, toLeadPeekVM, type LeadPeekVM } from "@chanlytics/contracts";

/** The peek's view model for one loaded lead: the DTO, its search, the workspace's zone (§9.2). */
export function peekVMFor(leadId: string): LeadPeekVM | null {
  const L = leadsLoaded;
  if (!L) return null;
  const row = L.rows.find((r) => r.id === leadId);
  if (!row) return null;
  return toLeadPeekVM(row, L.searches.find((s) => s.id === row.search_id) ?? null, L.tz, new Date());
}
```

and in `installLeadsCourier()`, beside `window.__leadsRouteOf = leadsRoute;`:

```ts
  window.__leadPeekVM = peekVMFor;
```

with `__leadPeekVM?: typeof peekVMFor;` in the file's `declare global` block. (The import above is `toLeadPeekVM` and the type only; `LEAD_WORDS` does not come through the courier.)

**The words are seeded, not couriered.** `window.__LEAD_WORDS` is a record of strings, which is a global seeded once at boot beside `__FACT_WORDS` and `ROLE_PERMS`, not an act. `apps/dashboard/src/legacy-bridge/seed-globals.ts` — its import (`:11`) gains `LEAD_WORDS`, its `declare global` block (after `__csvCell`, `:29`) gains `__LEAD_WORDS: typeof LEAD_WORDS;`, and after `window.__csvCell = csvCell;` (`:75`):

```ts
  // Every word the Leads scope says, from contracts. The legacy pages are
  // classic scripts and cannot import; without this each page would spell the
  // stage, the email state and the questions again, and a word spelled twice is
  // a word that drifts (contracts leads.ts LEAD_WORDS; Task 19 adds the facts'
  // own words to the same record, Task 17 the ways beside it).
  window.__LEAD_WORDS = LEAD_WORDS;
```
  - `apps/dashboard/src/legacy/pages/clients-a.jsx`: the cursor effect focuses the row by the table's noun, so the peek's focus rule finds it under Leads too.

```
old: const row = document.getElementById(`person-${cursor}`);
new: const row = document.getElementById(`${scope === "leads" ? "lead" : "person"}-${cursor}`);
```

(one occurrence on main, `:1810`; `scope` is `ClientsAReal`'s prop from Task 2). No `?v=` is chosen here: Task 22 step 1a bumps `clients-a.jsx` and `leads.css` once each for the release.

- [ ] **Step 7: Run it and see it pass.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-peek.test.mjs legacy-harness.test.mjs source-scan-ratchet.test.mjs` → PASS. Mutation checks, each once, each turning exactly one test red: make `ldCheckMark` give a read check the plain check (`if (how === "never")`) and see "nothing Claude read wears a plain check" fail; change `LEAD_EMAIL_WORDS.catch_all` to "Probably reaches them" and see "a catch-all email reads Unconfirmed" fail; make `leadPeekFocus` always focus the peek and see the focus test fail; drop `leadPeekEscape`'s first branch and see "Esc backs out one step" fail.
- [ ] **Step 8:** Commit — "The peek says what was seen and what Claude read, and never claims more than the check did

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

## Task 13: the draft

**Files:** Modify `apps/dashboard/src/legacy/pages/leads-peek.jsx` (Task 12), `apps/dashboard/src/legacy/styles/leads.css`, `apps/dashboard/src/legacy/pages/clients-a.jsx` (the return-to-tab effect), `apps/dashboard/src/server/leads.ts` (Task 4.4), `tooling/scripts/tests/leads-peek.test.mjs` (Task 12), `tooling/scripts/tests/lead-routes.test.mjs` (Task 4.4)

**What it does (§9.3, P6, S12).** **Draft** turns the peek into a draft: To, Subject, the body Claude wrote from what it found and what the workspace offers, **Shorter** and **Warmer** (`window.__leadDraft(id, { tone, previous })`), the note `LEAD_DRAFT_NOTE` ("Your business address and a way to say no are added at the foot, as US law asks."), **Open in your email** (the `mailto:` the route built), **Copy**, and "Sent from your own inbox". The foot of the body is code's: `leadDraftFooter` (Task 4.1), the CAN-SPAM kit — a truthful sender and subject, the ad identified, the postal address, an opt-out honoured within ten business days; the owner's own mail app sends it. With no business address in Settings the route refuses with `LEAD_NO_ADDRESS` before any model call, and the draft shows that sentence with nothing to open. When the owner comes back to the tab, the peek asks **Did you send it?** — **Yes, mark contacted** posts `{ kind: "emailed" }` (Contacted, `lead.emailed`; the route's toast "Marked contacted." with Undo), **Not yet** closes the question. Nothing promises to see replies.

**To, Subject and the body are shown, not edited.** The `mailto:` is the route's, built beside `draftFor`, so the page never encodes a body (a body edited here would have to be encoded on the page, and an encoding written twice is written wrong once). The owner shapes it with Shorter and Warmer, and does their own editing where they will send it.

**Armed only after they could have sent it.** Draft alone arms nothing. **Open in your email** and **Copy** arm `{ kind: "sent", leadId, asked: false }`; the question appears when the tab is theirs again (`leadArmOnReturn`), never while they are away.

- [ ] **Step 1: The failing tests.** Append to `tooling/scripts/tests/leads-peek.test.mjs` (after the last test Task 12 wrote):

```js
/* ================================================= Task 13: the draft ==== */

test("Draft asks the route once, shows what it wrote with the foot the law asks for, and never a field the page would have to encode", async () => {
  reset();
  const courier = courierOf();
  const P = page({ courier });
  await press(byTestId(P.draw().tree, "peek-draft"));
  await settle();
  const { tree } = P.draw();
  assert.deepEqual(courier.seen, [["draft", LEAD, { tone: "first" }]]);
  assert.equal(textOf(byTestId(tree, "peek-draft-to")), "hello@travisheightscoaching.example");
  assert.equal(textOf(byTestId(tree, "peek-draft-subject")), "Missed calls at Travis Heights");
  assert.equal(textOf(byTestId(tree, "peek-draft-body")).endsWith('Not interested? Reply "no thanks" and I won\'t write again.'), true);
  assert.equal(textOf(byTestId(tree, "peek-draft-note")), LEAD_DRAFT_NOTE);
  assert.equal(all(tree, (n) => n.type === "input" || n.type === "textarea").length, 0, "the mailto: is the route's; an edited body here would need encoding the page must not do");
  assert.equal(byTestId(tree, "peek-open-mail").props.href, "mailto:hello%40travisheightscoaching.example?subject=Missed%20calls");
  assert.equal(textOf(find(tree, (n) => n.props?.className === "pk-foot" && /Sent from your own inbox/.test(textOf(n)))).includes("Sent from your own inbox"), true);
});

test("Shorter and Warmer send what is on screen back with the tone, and the answer replaces it", async () => {
  reset();
  const courier = courierOf({ draft: (input) => ({ ok: true, data: { to: "hello@travisheightscoaching.example", subject: input.tone === "shorter" ? "Quick one" : "Missed calls at Travis Heights", body: input.tone === "shorter" ? "Two lines only." : "Long.", mailto: "mailto:x" } }) });
  const P = page({ courier });
  await press(byTestId(P.draw().tree, "peek-draft"));
  await settle();
  await press(byTestId(P.draw().tree, "peek-tone-shorter"));
  await settle();
  assert.deepEqual(courier.seen[1], ["draft", LEAD, { tone: "shorter", previous: { subject: "Missed calls at Travis Heights", body: "Long." } }]);
  assert.equal(textOf(byTestId(P.draw().tree, "peek-draft-subject")), "Quick one");
});

test("with no business address the draft asks for it in the route's words, and there is nothing to open", async () => {
  reset();
  const courier = courierOf({ draft: () => ({ ok: false, message: LEAD_NO_ADDRESS }) });
  const P = page({ courier });
  await press(byTestId(P.draw().tree, "peek-draft"));
  await settle();
  const { tree } = P.draw();
  assert.equal(textOf(byTestId(tree, "peek-draft-error")), LEAD_NO_ADDRESS);
  assert.equal(byTestId(tree, "peek-draft-error").props.role, "alert");
  assert.equal(byTestId(tree, "peek-open-mail").props["aria-disabled"], true);
});

test("a lead whose email bounces is offered Call instead: no Copy, no Draft, and the note says so", () => {
  reset();
  const { tree } = page({ vm: vmOf({ email_state: "invalid" }) }).draw();
  assert.equal(textOf(byTestId(tree, "peek-email-word")), "Bounces");
  assert.equal(textOf(byTestId(tree, "peek-email-note")), "That mailbox doesn't exist. Call instead.");
  assert.equal(byTestId(tree, "peek-draft"), null);
  assert.equal(byTestId(tree, "peek-copy"), null);
  assert.ok(byTestId(tree, "peek-call"), "the phone is what is left");
});

test("Did you send it? is asked when the tab comes back, not when the draft opened; Yes marks them contacted with Undo", async () => {
  reset();
  const courier = courierOf({ stage: () => ({ ok: true, data: { stage: "nurture", closed_reason: null, contact_id: null, existed: false, converted: false, op_id: "op-3", version: 6, toast: "Marked contacted.", undo: { op_id: "op-3", version: 6 } } }) });
  const P = page({ courier });
  await press(byTestId(P.draw().tree, "peek-draft"));
  await settle();
  assert.equal(P.st.armed, null, "Draft alone arms nothing");
  await press(byTestId(P.draw().tree, "peek-open-mail"));
  assert.deepEqual([P.st.armed.kind, P.st.armed.asked], ["sent", false]);
  P.draw();
  assert.equal(byTestId(P.draw().tree, "peek-sent-ask"), null, "nothing is asked while they are away");

  const stop = globalThis.leadArmOnReturn(P.st.armed, P.p.setArmed);
  for (const fn of listeners.focus || []) fn();
  assert.equal(P.st.armed.asked, true);
  stop();
  P.st.mode = "info";
  const { tree } = P.draw();
  assert.equal(textOf(find(byTestId(tree, "peek-sent-ask"), (n) => n.props?.className === "t")), "Did you send it?");
  await press(byTestId(tree, "peek-sent-yes"));
  await settle();
  assert.deepEqual(courier.seen.at(-1), ["stage", LEAD, { kind: "emailed" }]);
  assert.equal(flashes.at(-1).msg, "Marked contacted.");
  assert.equal(typeof flashes.at(-1).undo, "function");
  assert.equal(P.st.armed, null);
});

test("Copy copies the subject and the body and arms the same question", async () => {
  reset();
  const P = page();
  await press(byTestId(P.draw().tree, "peek-draft"));
  await settle();
  await press(byTestId(P.draw().tree, "peek-copy-draft"));
  await settle();
  assert.equal(copied[0].startsWith("Missed calls at Travis Heights\n\nHi,"), true);
  assert.equal(P.st.armed.kind, "sent");
  assert.equal(flashes.at(-1).msg, "Copied the email.");
});
```

and, in `tooling/scripts/tests/lead-routes.test.mjs` (Task 4.4's file), beside its other cases:

```js
test("the mailto encodes each part once, keeps a quote and an ampersand, and breaks lines the way a mail app reads them", () => {
  const m = leadMailto("hello@zilkerstrength.example", "Coffee & a question", "Hi Dana,\nOne idea \"for you\".");
  assert.equal(m, "mailto:hello%40zilkerstrength.example?subject=Coffee%20%26%20a%20question&body=Hi%20Dana%2C%0D%0AOne%20idea%20%22for%20you%22.");
});

test("a body that already carries CRLF is not doubled, and the CAN-SPAM foot survives the trip", () => {
  const foot = leadDraftFooter("Melany's Beauty Salon", "1 Main St, Austin, TX 78701");
  const once = leadMailto("a@b.example", "s", `Hi.${foot}`);
  const twice = leadMailto("a@b.example", "s", `Hi.${foot}`.replace(/\n/g, "\r\n"));
  assert.equal(once, twice);
  assert.equal(decodeURIComponent(once.split("&body=")[1]), `Hi.${foot}`.replace(/\n/g, "\r\n"));
});
```

with `leadMailto` imported from `../../../apps/dashboard/src/server/leads.ts` and `leadDraftFooter` from `../../../packages/contracts/src/leads.ts`.

- [ ] **Step 2: Run them and see them fail.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-peek.test.mjs` → the six new tests fail: `no such control` at `byTestId(tree, "peek-draft-to")` (the draft pane does not exist) and `TypeError: on.onDraft is not a function`. `lead-routes.test.mjs` fails at the import: `leadMailto` is not exported.

- [ ] **Step 3: The `mailto:`, in the server module.** In `apps/dashboard/src/server/leads.ts` (Task 4.4), beside `draftFor`:

```ts
/** A mailto: for the owner's own mail app: the address, the subject and the body, each encoded once; CRLF line breaks, as mail apps read them. */
export function leadMailto(to: string, subject: string, body: string): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, "\r\n"));
  return `mailto:${enc(to)}?subject=${enc(subject)}&body=${enc(body)}`;
}
```

`draftFor` answers `{ to, subject, body, mailto: leadMailto(to, subject, body) }`, with `body` already carrying `leadDraftFooter(tenants.name, tenant_config.config.profile.address)` (Task 4.4).

- [ ] **Step 4: The draft pane and the question.** In `apps/dashboard/src/legacy/pages/leads-peek.jsx`, after `const LeadPeekHead = ({ vm, onClose }) => { … };` (that component occurs exactly once), add:

```jsx
/** "Did you send it?" -- asked when the owner comes back to the tab, never before (PRD 9.3). */
const LeadSentAsk = ({ busy, on }) => {
  const W = window.__LEAD_WORDS;
  return (
    <div className="pk-ask pl-peek" role="group" aria-label={W.sentQuestion} data-testid="peek-sent-ask">
      <div className="t">{W.sentQuestion}</div>
      <div className="row">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} data-testid="peek-sent-yes" onClick={on.onSaidSent}>{W.sentYes}</button>
        <button type="button" className="btn btn-ghost btn-sm" data-testid="peek-sent-no" onClick={on.onNotYet}>{W.sentNo}</button>
      </div>
    </div>
  );
};

/**
 * The draft (PRD 9.3). To, Subject and the body are shown as written, never as fields: the mailto: the route built is
 * the one the mail app opens, and a body edited here would need encoding the page must not do. Shorter and Warmer ask
 * the route again with what is on screen; the owner does their own editing where they will send it.
 */
const LeadDraftPane = ({ vm, draft, busy, on }) => {
  const W = window.__LEAD_WORDS;
  const d = draft || {};
  return (
    <>
      <div className="pk-top">
        <button type="button" className="btn btn-ghost btn-sm" data-testid="peek-draft-back" onClick={on.onBack}>{`${W.backTo} ${vm.short}`}</button>
      </div>
      <div className="pk-body">
        <div className="pk-draft">
          {d.refusal ? <div className="field-error" role="alert" data-testid="peek-draft-error">{d.refusal}</div> : null}
          <div className="pk-field"><span className="l">{W.to}</span><span className="pk-rv" data-testid="peek-draft-to">{d.to || vm.reach.email.address}</span></div>
          <div className="pk-field"><span className="l">{W.subject}</span><span className="pk-rv" data-testid="peek-draft-subject">{d.subject || ""}</span></div>
          <div className="pk-text" data-testid="peek-draft-body">{d.busy ? W.draftWriting : (d.body || "")}</div>
          <div className="pk-tone">
            <span className="pk-label">{W.draftRewrite}</span>
            {W.tones.map((t) => (
              <button key={t.id} type="button" className={`ask-follow-chip${d.tone === t.id ? " on" : ""}`} disabled={busy || d.busy || !d.body} data-testid={`peek-tone-${t.id}`} onClick={() => on.onTone(t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="pk-foot-note"><Icon name="shield" size={12} /><span data-testid="peek-draft-note">{W.draftNote}</span></div>
        </div>
      </div>
      <div className="pk-foot">
        <a className="btn btn-primary btn-sm" href={d.mailto || "#"} data-testid="peek-open-mail" aria-disabled={!d.mailto} onClick={on.onOpenMail}><Icon name="mail" size={12} />{W.draftOpen}</a>
        <button type="button" className="btn btn-sm" disabled={!d.body} data-testid="peek-copy-draft" onClick={on.onCopyDraft}>{W.copy}</button>
        <span className="sp" />
        <span className="pk-rn">{W.draftFrom}</span>
      </div>
    </>
  );
};
```

then draw the question and the pane:

```
old:       <div className="pk-body">
        <p className="pk-fit" data-testid="peek-fit">
new:       <div className="pk-body">
        {armed && armed.asked && armed.kind === "sent" ? <LeadSentAsk busy={busy} on={on} /> : null}
        <p className="pk-fit" data-testid="peek-fit">
```

```
old:       <LeadPeekHead vm={vm} onClose={on.onClose} />
      <LeadPeekInfo vm={vm} mode={mode} armed={armed} busy={busy} on={on} />
new:       <LeadPeekHead vm={vm} onClose={on.onClose} />
      {mode === "draft"
        ? <LeadDraftPane vm={vm} draft={draft} busy={busy} on={on} />
        : <LeadPeekInfo vm={vm} mode={mode} armed={armed} busy={busy} on={on} />}
```

and the acts (`LeadPeekActions`), which gain the arming and the six draft entries:

```
old:   // The owner's own phone and their own mail app: an href this page hands to the browser, never a call we place.
  const dial =
new:   const armFor = (kind) => p.setArmed({ kind, leadId: vm.id, asked: false, outcome: null, note: "" });
  // The owner's own phone and their own mail app: an href this page hands to the browser, never a call we place.
  const dial =
```

```
old:     onNotAFit: () => p.setMode("why"),
new:     onBack: () => p.setMode("info"),
    onNotAFit: () => p.setMode("why"),
```

```
old:     onCall: () => dial(vm.reach.phone ? vm.reach.phone.tel : null),
  };
};
new:     onCall: () => dial(vm.reach.phone ? vm.reach.phone.tel : null),
    // The draft: the route writes it and builds the mailto:, so the page encodes nothing.
    onDraft: async () => {
      p.setMode("draft");
      p.setDraft({ busy: true, tone: "first", to: vm.reach.email.address, subject: "", body: "", mailto: null, refusal: null });
      const r = await api.__leadDraft(vm.id, { tone: "first" });
      if (!r.ok) { p.setDraft({ busy: false, tone: "first", to: vm.reach.email.address, subject: "", body: "", mailto: null, refusal: r.message }); return; }
      p.setDraft({ busy: false, tone: "first", to: r.data.to, subject: r.data.subject, body: r.data.body, mailto: r.data.mailto, refusal: null });
    },
    onTone: async (tone) => {
      const d = p.draft || {};
      p.setDraft({ ...d, busy: true, tone, refusal: null });
      const r = await api.__leadDraft(vm.id, { tone, previous: { subject: d.subject, body: d.body } });
      if (!r.ok) { p.setDraft({ ...d, busy: false, tone, refusal: r.message }); return; }
      p.setDraft({ busy: false, tone, to: r.data.to, subject: r.data.subject, body: r.data.body, mailto: r.data.mailto, refusal: null });
    },
    // Opening the mail app or copying the words is the moment they might send it; Draft alone is not.
    onOpenMail: () => { if (p.draft && p.draft.mailto) armFor("sent"); },
    onCopyDraft: async () => {
      const d = p.draft || {};
      if (!d.body) return;
      if (window.navigator && window.navigator.clipboard) await window.navigator.clipboard.writeText(`${d.subject}\n\n${d.body}`);
      armFor("sent");
      p.flash({ msg: window.__LEAD_WORDS.copiedDraft });
    },
    onSaidSent: async () => { p.setArmed(null); await post({ kind: "emailed" }, "Not marked"); },
    onNotYet: () => p.setArmed(null),
  };
};
```

and, at the foot of the file, the watcher and its export:

```
old: Object.assign(window, { LeadPeek, LeadPeekActions, leadPeekEscape, leadPeekFollows, leadPeekFocus });
new: /**
 * The tab comes back, so the peek may ask. Armed when the owner left for their phone or their mail app; asked only
 * once they are here to answer. One listener pair, taken down with the arming.
 */
const leadArmOnReturn = (armed, setArmed) => {
  if (!armed || armed.asked) return undefined;
  const wake = () => { if (!window.document || !window.document.hidden) setArmed((a) => (a && !a.asked ? { ...a, asked: true } : a)); };
  window.addEventListener("focus", wake);
  window.document.addEventListener("visibilitychange", wake);
  return () => {
    window.removeEventListener("focus", wake);
    window.document.removeEventListener("visibilitychange", wake);
  };
};

Object.assign(window, { LeadPeek, LeadPeekActions, leadPeekEscape, leadPeekFollows, leadPeekFocus, leadArmOnReturn });
```

- [ ] **Step 5: The page watches for their return.** `ClientsAReal` runs the watcher as one effect, keyed by what is armed, beside the cursor effect (`clients-a.jsx:1810–1817`):

```
old:     if (row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
  }, [cursor]);
new:     if (row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
  }, [cursor]);
  // The owner left for their own mail app or their own phone; the peek asks how it went only once they are back
  // (leads-peek.jsx). Nothing is asked while the tab is hidden, and the listeners go with the arming.
  React.useEffect(() => leadArmOnReturn(armed, setArmed), [armed && armed.kind, armed && armed.leadId, armed && armed.asked]);
  // Focus moves into the peek when it opens and back to the row when it closes; the row is the cursor.
  React.useEffect(() => { leadPeekFocus(peekId, cursor); }, [peekId]);   // eslint-disable-line react-hooks/exhaustive-deps
```

(`armed`, `setArmed` and `peekId` are Task 2's hooks; under People they are `null`, so both effects are no-ops there. `/* global */` at the head of `clients-a.jsx` gains `leadArmOnReturn, leadPeekFocus`.) No `?v=` is chosen here: Task 22 step 1a bumps each edited file once.

- [ ] **Step 6: The draft's styles.** Append to `apps/dashboard/src/legacy/styles/leads.css`:

```css
/* --------------------------------------------------------------- the draft */
.pk-draft { display: flex; flex-direction: column; gap: 10px; }
.pk-field { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 8px; align-items: center; font-size: 12.5px; }
.pk-field .l { color: var(--ink-dim); }
.pk-text { width: 100%; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); padding: 10px 12px; font-family: inherit; font-size: 13px; line-height: 1.55; color: var(--ink); white-space: pre-wrap; overflow: auto; max-height: 340px; }
.pk-tone { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.pk-tone .pk-label { margin: 0; align-self: center; }
.pk-foot-note { font-size: 11.5px; color: var(--ink-dim); display: flex; gap: 6px; align-items: flex-start; line-height: 1.45; }
.pk-foot-note > .icon { margin-top: 2px; flex: none; }
.pk-draft .field-error { margin: 0; }

/* -------------------------------------------- the two questions, and a why */
.pk-ask { padding: 12px 14px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--bg-sunken); display: flex; flex-direction: column; gap: 10px; }
.pk-ask .t { font-size: 13px; font-weight: 500; }
.pk-ask .row { display: flex; gap: 6px; flex-wrap: wrap; }
```

- [ ] **Step 7: Run and see them pass.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-peek.test.mjs` and `… lead-routes.test.mjs` → PASS. Mutation checks: arm the question inside `onDraft` and see "Did you send it? is asked when the tab comes back" fail; make the body a `<textarea>` and see "never a field the page would have to encode" fail; drop the `\r\n` replacement from `leadMailto` and see the mailto test fail.
- [ ] **Step 8:** Commit — "A draft opens in the owner's own mail app, with the foot US law asks for, and the peek asks whether they sent it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

## Task 14: calls and their six outcomes

**Files:** Modify `apps/dashboard/src/legacy/pages/leads-peek.jsx` (Tasks 12, 13), `apps/dashboard/src/legacy/styles/leads.css`, `apps/dashboard/src/legacy/pages/leads-scope.jsx` (Task 2: `callLead`, the row's Call and the `C` key), `tooling/scripts/tests/leads-peek.test.mjs`, `tooling/scripts/tests/leads-vm.test.mjs` (Task 4.1)

**What it does (§9.4).** **Call** on the row (`LeadRowActions`, Task 11), in the peek, or `C` on the cursor row (Task 2's one listener) opens `tel:` — the owner's own phone dials; Chanlytics places no call. The same act arms the question. When the owner comes back, the peek asks **How did the call go?**: Interested · Call back later · Not interested · Left a voicemail · No answer · Wrong number, as one `role="radiogroup"` of chips, with a note (280 characters, said in the field) and **Save**; **I didn't call** clears it and posts nothing. Save posts `{ kind: "outcome", outcome, note? }` to `POST leads/[id]/stage` and shows the route's own sentence.

**What each outcome does** is contracts' `outcomeMove` (Task 4.1), and the door's, never the page's:

| Outcome | Stage | The owner reads |
|---|---|---|
| Interested | Talking, **and the door makes them a person** (or links the one whose phone it already is) with the call and the note on their page | "&lt;name&gt; is in People now, with this call on their page." — **Open**, and no Undo: a person made is not undone from a toast |
| Call back later · Left a voicemail · No answer | Contacted | the route's "Marked contacted.", with Undo |
| Not interested | Closed, `said_no` | the route's "Marked as said no.", with Undo |
| Wrong number | **the stage is kept**; `leads.phone_wrong` is set | the route's sentence, with Undo; the number is struck through and Call is gone from the row and the peek |

A lead becomes a person only on a real conversation (§9.6): an Interested call, or their own message. The page never decides it — `lead_set_stage` does, and the answer's `converted` and `contact_id` say what happened.

On a phone the six are a 2 × 3 grid of 44px targets (Task 18's rules over `.pk-chips`).

- [ ] **Step 1: The failing tests.** Append to `tooling/scripts/tests/leads-peek.test.mjs`:

```js
/* ================================================= Task 14: the calls ==== */

test("Call dials tel: from the peek and asks how it went when the tab comes back; the six are one radiogroup and the note says its cap", async () => {
  reset();
  const P = page();
  await press(byTestId(P.draw().tree, "peek-call"));
  assert.deepEqual(dialled, ["tel:+15125550142"]);
  assert.deepEqual([P.st.armed.kind, P.st.armed.asked], ["call", false]);
  assert.equal(byTestId(P.draw().tree, "peek-call-ask"), null);
  const stop = globalThis.leadArmOnReturn(P.st.armed, P.p.setArmed);
  for (const fn of listeners.visibilitychange || []) fn();
  stop();
  const { tree } = P.draw();
  assert.equal(textOf(find(byTestId(tree, "peek-call-ask"), (n) => n.props?.className === "t")), "How did the call go?");
  const chips = find(tree, (n) => n.props?.className === "pk-chips");
  assert.equal(chips.props.role, "radiogroup");
  assert.deepEqual(all(chips, (n) => n.props?.role === "radio").map(textOf), ["Interested", "Call back later", "Not interested", "Left a voicemail", "No answer", "Wrong number"]);
  assert.equal(byTestId(tree, "peek-note").props.maxLength, 280);
  assert.equal(textOf(byTestId(tree, "peek-note-left")), "Up to 280 characters");
  assert.equal(byTestId(tree, "peek-call-save").props.disabled, true, "Save waits for an outcome");
});

test("Interested says they are in People now and offers to open them, with no Undo", async () => {
  reset();
  const courier = courierOf({ stage: () => ({ ok: true, data: { stage: "converted", closed_reason: null, contact_id: "c-77", existed: false, converted: true, op_id: "op-4", version: 7, toast: "Travis Heights Coaching Co. is in People now, with this call on their page.", undo: null } }) });
  const P = page({ courier, armed: { kind: "call", leadId: LEAD, asked: true, outcome: null, note: "" } });
  await press(byTestId(P.draw().tree, "peek-outcome-interested"));
  byTestId(P.draw().tree, "peek-note").props.onChange({ target: { value: "Wants a call Tuesday" } });
  assert.equal(textOf(byTestId(P.draw().tree, "peek-note-left")), "260 left");
  await press(byTestId(P.draw().tree, "peek-call-save"));
  await settle();
  assert.deepEqual(courier.seen[0], ["stage", LEAD, { kind: "outcome", outcome: "interested", note: "Wants a call Tuesday" }]);
  assert.equal(flashes[0].msg, "Travis Heights Coaching Co. is in People now, with this call on their page.");
  assert.equal(flashes[0].undo, undefined, "a person made is not undone from a toast");
  assert.equal(flashes[0].action.label, "Open");
  flashes[0].action.onClick();
  assert.deepEqual(opened, ["c-77"]);
});

test("the other five post what they say, each with Undo; a wrong number keeps the stage and strikes the phone", async () => {
  for (const [outcome, stage, toast] of [
    ["call_back", "nurture", "Marked contacted."],
    ["voicemail", "nurture", "Marked contacted."],
    ["no_answer", "nurture", "Marked contacted."],
    ["not_interested", "archived", "Marked as said no."],
    ["wrong_number", "ready", "That number is marked wrong."],
  ]) {
    reset();
    const courier = courierOf({ stage: () => ({ ok: true, data: { stage, closed_reason: stage === "archived" ? "said_no" : null, contact_id: null, existed: false, converted: false, op_id: "op-5", version: 8, toast, undo: { op_id: "op-5", version: 8 } } }) });
    const P = page({ courier, armed: { kind: "call", leadId: LEAD, asked: true, outcome: null, note: "" } });
    await press(byTestId(P.draw().tree, `peek-outcome-${outcome}`));
    await press(byTestId(P.draw().tree, "peek-call-save"));
    await settle();
    assert.deepEqual(courier.seen[0], ["stage", LEAD, { kind: "outcome", outcome }], outcome);
    assert.equal(flashes[0].msg, toast, outcome);
    assert.equal(typeof flashes[0].undo, "function", outcome);
    assert.deepEqual(opened, [], outcome);
  }
  reset();
  const { tree } = page({ vm: vmOf({ phone_wrong: true }) }).draw();
  assert.equal(/\bwrong\b/.test(byTestId(tree, "peek-phone-value").props.className), true);
  assert.equal(byTestId(tree, "peek-call"), null, "a number marked wrong is not dialled again");
  assert.equal(textOf(find(byTestId(tree, "peek-phone"), (n) => n.props?.className === "pk-rn")), "You marked this number wrong.");
});

test("I didn't call clears the question and posts nothing", async () => {
  reset();
  const courier = courierOf();
  const P = page({ courier, armed: { kind: "call", leadId: LEAD, asked: true, outcome: "voicemail", note: "" } });
  await press(byTestId(P.draw().tree, "peek-call-cancel"));
  assert.equal(P.st.armed, null);
  assert.deepEqual(courier.seen, []);
});
```

and, in `tooling/scripts/tests/leads-vm.test.mjs` (Task 4.1's file), the outcome-to-stage mapping as a contracts test:

```js
test("a call outcome becomes the door's arguments; only Interested converts, and Wrong number keeps the stage", () => {
  const args = (x) => stageArgs(LeadStageInputSchema.parse(x));
  assert.deepEqual(args({ kind: "outcome", outcome: "interested", note: "Wants a call Tuesday" }), { p_stage: "converted", p_reason: null, p_fit_reason: null, p_outcome: "interested", p_note: "Wants a call Tuesday" });
  assert.deepEqual(args({ kind: "outcome", outcome: "wrong_number" }), { p_stage: null, p_reason: null, p_fit_reason: null, p_outcome: "wrong_number", p_note: null });
  assert.deepEqual(args({ kind: "outcome", outcome: "not_interested" }), { p_stage: "archived", p_reason: "said_no", p_fit_reason: null, p_outcome: "not_interested", p_note: null });
  for (const o of ["call_back", "voicemail", "no_answer"]) assert.equal(args({ kind: "outcome", outcome: o }).p_stage, "nurture", o);
  assert.deepEqual(args({ kind: "emailed" }), { p_stage: "nurture", p_reason: null, p_fit_reason: null, p_outcome: "emailed", p_note: null });
  assert.deepEqual(LEAD_CALL_OUTCOMES.map((o) => outcomeMove(o).converts), [true, false, false, false, false, false]);
  assert.throws(() => args({ kind: "outcome", outcome: "interested", note: "x".repeat(281) }), "the note's cap is the schema's");
});
```

- [ ] **Step 2: Run them and see them fail.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-peek.test.mjs` → `no such control` at `byTestId(tree, "peek-outcome-interested")`: the question does not exist. `leads-vm.test.mjs` fails at `LEAD_NOTE_MAX`: nothing caps the note until Task 12's words land (they do; if Task 12 is applied this test passes on the contracts side and only the page's four fail).

- [ ] **Step 3: The question.** In `leads-peek.jsx`, after `const LeadSentAsk = ({ busy, on }) => { … };` (that component occurs exactly once), add:

```jsx
/** "How did the call go?" -- the six outcomes, a note, and Save (PRD 9.4). On a phone they are a 2 x 3 grid. */
const LeadCallAsk = ({ armed, busy, on }) => {
  const W = window.__LEAD_WORDS;
  const note = (armed && armed.note) || "";
  const left = W.noteMax - note.length;
  return (
    <div className="pk-ask pl-peek" data-testid="peek-call-ask">
      <div className="t">{W.callQuestion}</div>
      <div className="pk-chips" role="radiogroup" aria-label={W.callQuestion}>
        {W.outcomes.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={armed && armed.outcome === o.id}
            className={`pk-chip${armed && armed.outcome === o.id ? " on" : ""}`}
            data-testid={`peek-outcome-${o.id}`}
            onClick={() => on.onOutcome(o.id)}
          >{o.label}</button>
        ))}
      </div>
      <input
        className="pk-input"
        type="text"
        value={note}
        maxLength={W.noteMax}
        placeholder={W.notePlaceholder}
        aria-label={W.noteLabel}
        aria-describedby="peek-note-left"
        data-testid="peek-note"
        onChange={(e) => on.onNote(e.target.value)}
      />
      <div className="pk-note-left" id="peek-note-left" data-testid="peek-note-left">{W.noteLeft(left, W.noteMax)}</div>
      <div className="row">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !(armed && armed.outcome)} data-testid="peek-call-save" onClick={on.onSaveCall}>{W.callSave}</button>
        <button type="button" className="btn btn-ghost btn-sm" data-testid="peek-call-cancel" onClick={on.onCancelCall}>{W.callCancel}</button>
      </div>
    </div>
  );
};
```

draw it beside the other question:

```
old:         {armed && armed.asked && armed.kind === "sent" ? <LeadSentAsk busy={busy} on={on} /> : null}
new:         {armed && armed.asked && armed.kind === "sent" ? <LeadSentAsk busy={busy} on={on} /> : null}
        {armed && armed.asked && armed.kind === "call" ? <LeadCallAsk armed={armed} busy={busy} on={on} /> : null}
```

and make Call arm it, with the four acts it needs:

```
old:     onCall: () => dial(vm.reach.phone ? vm.reach.phone.tel : null),
new:     // The owner's own phone dials; the question waits until they are back at the tab.
    onCall: () => { armFor("call"); dial(vm.reach.phone ? vm.reach.phone.tel : null); },
    onOutcome: (outcome) => p.setArmed({ ...p.armed, outcome }),
    onNote: (note) => p.setArmed({ ...p.armed, note: note.slice(0, window.__LEAD_WORDS.noteMax) }),
    onCancelCall: () => p.setArmed(null),
    onSaveCall: async () => {
      const a = p.armed;
      if (!a || !a.outcome) return;
      p.setArmed(null);
      await post({ kind: "outcome", outcome: a.outcome, ...(a.note ? { note: a.note } : {}) }, "Not recorded");
    },
```

- [ ] **Step 4: Call from the row, and `C`.** `leads-scope.jsx` (Task 2) holds one `callLead`, which the row's Call (`LEAD_COLUMNS`'s `ctx.onCall`, Task 11's `LeadRowActions`), the peek's Call and the page's `C` all reach, so a call from anywhere opens the same question on the same lead:

```jsx
  // Call from the row, from the peek, or with C on the cursor: the peek opens on that lead and the question is armed.
  const callLead = (id) => {
    const vm = window.__leadPeekVM && window.__leadPeekVM(id);
    if (!vm || !vm.reach.phone || !vm.reach.phone.tel) return;
    setPeekId(id);
    setPeekMode("info");
    setArmed({ kind: "call", leadId: id, asked: false, outcome: null, note: "" });
    if (window.location && window.location.assign) window.location.assign(vm.reach.phone.tel);
  };
```

`keys.current.call` is this function (Task 2's listener branch `(e.key === "c" || e.key === "C") && k.cursor && k.call`), and the peek's own `onCall` (Task 12's `LeadPeekActions`) does the same two things for the lead it is showing. No `?v=` is chosen here: Task 22 step 1a bumps each edited file once.

- [ ] **Step 5: The chips' styles.** Append to `apps/dashboard/src/legacy/styles/leads.css`:

```css
.pk-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pk-chip { height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg-raised); font-family: inherit; font-size: 12.5px; color: var(--ink); cursor: pointer; }
.pk-chip.on { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink) inset; }
.pk-input { width: 100%; height: 32px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); padding: 0 10px; font-family: inherit; font-size: 12.5px; color: var(--ink); }
.pk-note-left { font-size: 11px; color: var(--ink-dim); }
```

- [ ] **Step 6: Run and see them pass.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-peek.test.mjs leads-vm.test.mjs` → PASS. Mutation checks: make `outcomeMove("wrong_number")` archive the lead and see the contracts test fail; drop `armFor("call")` from `onCall` and see "Call dials tel: … and asks how it went" fail.
- [ ] **Step 7:** Commit — "A call is dialled from the owner's own phone, and its six endings are the door's to decide

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

## Task 15: Not a fit

**Files:** Modify `apps/dashboard/src/legacy/pages/leads-peek.jsx` (Tasks 12–14), `apps/dashboard/src/legacy/styles/leads.css`, `apps/dashboard/src/legacy/pages/leads-scope.jsx` (Task 2's bulk bar), `tooling/scripts/tests/leads-peek.test.mjs`, `tooling/scripts/tests/leads-vm.test.mjs` (Task 4.1)

**What it does (§9.5, P5, release B's share).** **Not a fit** is one tap, and it asks why: A chain or franchise · The wrong kind of business · Too far away · Already a customer · Something else. Each posts `{ kind: "not_a_fit", why }` to `POST leads/[id]/stage`; `stageArgs` (Task 4.1) turns it into `p_stage 'archived'`, `p_reason 'customer'` for Already a customer and `'not_a_fit'` for the other four, and `p_fit_reason` is always the why the owner picked, so release C can read what they said without asking again.

**Already a customer hides the place from every future search**: `lead_set_stage` writes `lead_suppressions(kind 'place', what 'customer')` for the place id (Task 4.5), and the route's toast says so — "Hidden from every future search." — with Undo, which `lead_undo` honours by restoring `before` and deleting the suppression it wrote (never an opt-out's). The other four toast the route's "Not a fit." with Undo.

**The learning is release C.** No `lead_preferences` row is written here, the plan card grows no "you said" chip, no search's radius narrows, and **no toast says anything was learned**: the why list carries no promise under it, unlike the canvas board, whose "Claude leaves out places like it in your next searches" belongs to the release that does it. Wrong contact details, not a fit, no answer and an opt-out stay four different signals (§0.4).

**The bulk bar asks the same five whys once for the selection** (Task 2's `LeadsBulkBar`): the same `LeadNotFitWhy` list, one `POST leads/bulk { by, action: "not_a_fit", ids | view }`, one operation, one Undo.

- [ ] **Step 1: The failing tests.** Append to `tooling/scripts/tests/leads-peek.test.mjs`:

```js
/* =============================================== Task 15: Not a fit ====== */

test("Not a fit asks why in five ways, and the list teaches nothing in this release", async () => {
  reset();
  const P = page();
  await press(byTestId(P.draw().tree, "peek-not-a-fit"));
  const { tree } = P.draw();
  const why = byTestId(tree, "peek-why");
  assert.equal(why.props.role, "menu");
  assert.equal(textOf(find(why, (n) => n.props?.className === "pop-h")), "What makes it not a fit?");
  assert.deepEqual(all(why, (n) => n.props?.role === "menuitem").map(textOf), [
    LEAD_NOT_A_FIT_WORDS.chain, LEAD_NOT_A_FIT_WORDS.wrong_kind, LEAD_NOT_A_FIT_WORDS.too_far, LEAD_NOT_A_FIT_WORDS.customer, LEAD_NOT_A_FIT_WORDS.other,
  ]);
  assert.equal(/learn|next searches|you said/i.test(textOf(why)), false, "the scoped learning and the you-said chips are release C");
});

test("Already a customer hides the place and says so; the other four close the lead and say Not a fit; each has Undo", async () => {
  for (const [why, toast] of [
    ["customer", "Hidden from every future search."],
    ["chain", "Not a fit."],
    ["wrong_kind", "Not a fit."],
    ["too_far", "Not a fit."],
    ["other", "Not a fit."],
  ]) {
    reset();
    const courier = courierOf({ stage: () => ({ ok: true, data: { stage: "archived", closed_reason: why === "customer" ? "customer" : "not_a_fit", contact_id: null, existed: false, converted: false, op_id: "op-6", version: 9, toast, undo: { op_id: "op-6", version: 9 } } }) });
    const P = page({ courier });
    await press(byTestId(P.draw().tree, "peek-not-a-fit"));
    await press(byTestId(P.draw().tree, `peek-why-${why}`));
    await settle();
    assert.deepEqual(courier.seen[0], ["stage", LEAD, { kind: "not_a_fit", why }], why);
    assert.equal(flashes[0].msg, toast, why);
    await flashes[0].undo();
    assert.deepEqual(courier.seen[1], ["undo", "op-6", 9], why);
    assert.equal(P.st.mode, "info", "the why list closes behind the answer");
  }
});

test("no word the peek says names the vendor, or a dollar", () => {
  reset();
  const states = ["ok", "catch_all", "unknown", "invalid", "none", "checking"];
  for (const email_state of states) {
    for (const cls of ["qualified", "review", "excluded"]) {
      const vm = vmOf({ email_state, member: { class: cls, fit: cls === "qualified" ? "strong" : null, excluded_by: cls === "excluded" ? "chain" : null } });
      for (const mode of ["info", "why"]) {
        for (const armed of [null, { kind: "sent", leadId: LEAD, asked: true }, { kind: "call", leadId: LEAD, asked: true, outcome: null, note: "" }]) {
          const P = page({ vm, mode, armed });
          const said = textOf(P.draw().tree);
          assert.equal(/apify|compass|bounceverify|crawler|\$\d/i.test(said), false, `${email_state}/${cls}/${mode}: ${said.slice(0, 120)}`);
        }
      }
    }
  }
});
```

and, in `tooling/scripts/tests/leads-vm.test.mjs` (Task 4.1's file):

```js
test("Not a fit's five whys say what the owner picked, and only Already a customer hides the place", () => {
  assert.deepEqual(LEAD_NOT_A_FIT_WHYS.map((w) => LEAD_NOT_A_FIT_WORDS[w]), ["A chain or franchise", "The wrong kind of business", "Too far away", "Already a customer", "Something else"]);
  const args = (why) => stageArgs(LeadStageInputSchema.parse({ kind: "not_a_fit", why }));
  assert.equal(args("customer").p_reason, "customer");
  for (const w of ["chain", "wrong_kind", "too_far", "other"]) assert.equal(args(w).p_reason, "not_a_fit", w);
  assert.deepEqual(LEAD_NOT_A_FIT_WHYS.map((w) => args(w).p_fit_reason), [...LEAD_NOT_A_FIT_WHYS]);
  assert.equal(LEAD_SUPPRESSING_WHY, "customer", "one why hides a place; the rest teach nothing in this release");
});
```

- [ ] **Step 2: Run them and see them fail.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-peek.test.mjs` → `no such control` at `byTestId(tree, "peek-why-customer")`: `mode === "why"` draws nothing yet.

- [ ] **Step 3: The why list.** In `leads-peek.jsx`, after `const LeadPeekHead = ({ vm, onClose }) => { … };` (that component occurs exactly once), add:

```jsx
/** "What makes it not a fit?" -- five whys, one tap each (PRD 9.5). It teaches nothing in this release. */
const LeadNotFitWhy = ({ busy, on }) => {
  const W = window.__LEAD_WORDS;
  return (
    <div className="pop pk-nf pl-peek" role="menu" aria-label={W.notFitTitle} data-testid="peek-why">
      <div className="pop-h">{W.notFitTitle}</div>
      {W.whys.map((w) => (
        <button key={w.id} type="button" role="menuitem" className="pop-row" disabled={busy} data-testid={`peek-why-${w.id}`} onClick={() => on.onWhy(w.id)}>{w.label}</button>
      ))}
    </div>
  );
};
```

draw it under the top row, inside the peek so `PL_OVERLAY` never sees it (`.pl-peek`) and the page's keys keep working:

```
old:       </div>
      <div className="pk-body">
        {armed && armed.asked && armed.kind === "sent" ? <LeadSentAsk busy={busy} on={on} /> : null}
new:       </div>
      {mode === "why" ? <LeadNotFitWhy busy={busy} on={on} /> : null}
      <div className="pk-body">
        {armed && armed.asked && armed.kind === "sent" ? <LeadSentAsk busy={busy} on={on} /> : null}
```

and answer it:

```
old:     onNotAFit: () => p.setMode("why"),
new:     onNotAFit: () => p.setMode("why"),
    onWhy: async (why) => { p.setMode("info"); await post({ kind: "not_a_fit", why }, "Not set aside"); },
```

- [ ] **Step 4: The bulk bar asks the same five.** `leads-scope.jsx` (Task 2) draws `LeadNotFitWhy` from its bulk bar with its own `onWhy`, so the selection is set aside in one operation with one Undo:

```jsx
  // Not a fit, for everything selected: the same five whys, asked once, one operation, one Undo.
  const bulkNotAFit = async (why) => {
    setBulkWhy(false);
    const body = allThatMatch
      ? { by: "view", action: "not_a_fit", view }
      : { by: "ids", action: "not_a_fit", ids: [...sel] };
    const r = await window.__leadsBulk(body);
    if (!r.ok) { flash(window.refusalToast(r, "Not set aside")); return; }
    setSel(new Set());
    flash({ msg: r.data.toast, undo: () => window.__leadUndo(r.data.op_id, r.data.version) });
  };
```

(`sel`, `view`, `allThatMatch`, `setBulkWhy` and `flash` are Task 2's; `why` reaches the server through `POST leads/bulk`, whose `LeadsBulkSchema` takes `action: "not_a_fit"` — the per-why reason is the peek's, and the bulk act records `not_a_fit` for every row it touched. The five-why list is drawn so the owner picks once; release C reads the pick.)

- [ ] **Step 5: The why list's styles.** Append to `apps/dashboard/src/legacy/styles/leads.css`:

```css
.pk-nf { position: absolute; right: 14px; top: 118px; width: 268px; z-index: 12; background: var(--bg-raised); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow-lg); padding: 6px; }
.pk-nf .pop-h { font-size: 9.5px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-dim); padding: 6px 8px 4px; }
.pk-nf .pop-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; font-size: 12.5px; color: var(--ink); border: 0; background: transparent; width: 100%; text-align: left; font-family: inherit; cursor: pointer; }
.pk-nf .pop-row:hover { background: var(--bg-hover); }
```

- [ ] **Step 6: Run and see them pass.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-peek.test.mjs leads-vm.test.mjs` → PASS. Mutation checks: make `onWhy` post `{ kind: "said_no" }` and see "Already a customer hides the place" fail; put the canvas's "Claude leaves out places like it in your next searches" back under the list and see "the list teaches nothing in this release" fail.
- [ ] **Step 7:** Commit — "Not a fit asks why in one tap, Already a customer hides the place, and nothing claims to have learned

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

## Task 16: a search, kept

**Files:** Modify `packages/contracts/src/leads.ts` (Task 4.1's), `apps/dashboard/src/legacy-bridge/leads.ts` (Task 3's `installLeadsCourier`), `apps/dashboard/src/legacy-bridge/inbox-verbs.ts:438` (`href`), `apps/dashboard/src/legacy/pages/leads-scope.jsx` (Task 2's `LeadsRailRows`, `LeadsScope`), `apps/dashboard/src/legacy/pages/clients-a.jsx` (Task 2's acts block and `LeadsScope` props), `tooling/scripts/tests/leads-honest.test.mjs`, `leads-vm.test.mjs` (Task 4.1's)

**What it draws (§8.10).** A month later the owner can see exactly what they asked for. Each search on the rail has a menu (`MoreMenu`, `data-bits.jsx:64`, which closes after each item and whose items take a `gate`), and the menu opens with what was asked, in the owner's own words and the date it was asked on — then five things to do with it:

| Item | What it says | Where it goes |
|---|---|---|
| the header | "You asked on Sep 18: “personal trainers in Austin with a website, about 200”. Leaving out chain gyms, physical therapists and chiropractors." | — (contracts `leadSearchWords`) |
| **Rename** | — | `PATCH lead-searches/[id] { name }` (B's route, Task 4.4; operator) through `__leadSearchRename` |
| **Find new ones** | "Only places not already in your leads count" (P3) | `POST lead-searches/[id]/more { purpose: "renew", plan }` (release A) with the search's own plan, through `__leadSearchMore` |
| **Search again, changed** | "Opens the plan with what you asked" | the finder at `plan` with this search's plan; its approve calls `more` with `renew` and the changed plan, which is a new plan version (§0.5, Task 9) |
| **Export these 161** | — | a download of `GET leads/export?search=<id>&list=all&sort=fit&dir=asc` (B's route, owner, on the ledger) |
| **Remove this search** | "Keeps the ones you contacted or are talking to." | asked once, where the search is (`Confirm`), then `DELETE lead-searches/[id]` (B's route, owner) through `__leadSearchRemove`, which calls release A's `lead_search_remove` and answers `{ archived, kept }` |

Renaming happens where the search is: the rail's row becomes a box, Enter saves and Escape leaves, so the rail never loses the row being named (the pattern `ListTitle` uses for a list kept by hand, `clients-a.jsx`). Removing is asked once, inline, in the words that say what is kept (the pattern `DeleteListButton` uses). Removing takes the rail's row away, so the view goes back to every lead (`clients/leads`), and the toast says how many were kept: **"Removed. The 18 you contacted or are talking to are kept."** — the door's own number, never the page's guess. (`lead_search_remove` writes an `undo_search` operation; the strip's Undo for a finished round is Task 10's, and this menu offers none.)

Every item is the owner's except Rename: the five carry `window.gate("find", …)` for anyone who may not, which leaves the item in the menu, says why when it is pressed and keeps the menu open (`MoreMenu`'s `gate`).

**One sentence, in contracts.** The header's words are a derivation of the search's own `asked` and `asked_on` and of the plan's exclusions, so they live once, in `packages/contracts/src/leads.ts` (Task 4.1's module), beside the other words a lead wears.

- [ ] **Step 1: The failing tests.** Two in `leads-vm.test.mjs` (Task 4.1's file) and three appended to `leads-honest.test.mjs` (Task 2's).

```js
// tooling/scripts/tests/leads-vm.test.mjs — added to Task 4.1's file
import { leadSearchWords, LEAD_REMOVE_KEEPS } from "../../../packages/contracts/src/leads.ts";

test("a kept search says what was asked, in the owner's words and the date they asked", () => {
  const s = {
    id: "5e000000-0000-4000-8000-000000000001",
    name: "Personal trainers · Austin",
    asked: "personal trainers in Austin with a website, about 200",
    asked_on: "2026-09-18T20:00:00.000Z",
    plan: { criteria: [{ key: "website", text: "has a website", standard: "seen", required: true }], exclusions: [{ key: "chain", text: "chain gyms", origin: "claude" }, { key: "pt", text: "physical therapists and chiropractors", origin: "claude" }] },
  };
  assert.deepEqual(leadSearchWords(s, "America/Chicago"), {
    askedLine: "You asked on Sep 18: “personal trainers in Austin with a website, about 200”. Leaving out chain gyms and physical therapists and chiropractors.",
    keepsLine: "Keeps the ones you contacted or are talking to.",
  });
  assert.deepEqual(leadSearchWords({ ...s, plan: { criteria: [], exclusions: [] } }, "America/Chicago").askedLine, "You asked on Sep 18: “personal trainers in Austin with a website, about 200”.", "nothing left out, nothing said about it");
  assert.deepEqual(leadSearchWords(null, "America/Chicago"), { askedLine: "", keepsLine: LEAD_REMOVE_KEEPS }, "a search the page does not hold says nothing about what was asked");
});
```

```js
/* --------------------------------- a search, kept --------------------------------- */

const menuOf = (name) => menus.find((m) => m.title === `What ${name} asked for`);

test("a kept search's menu says what was asked and when, and offers Rename, Find new ones, Search again, Export and Remove", async () => {
  fresh();
  draw();
  const m = menuOf("Personal trainers · Austin");
  assert.ok(m, "every search on the rail has its menu");
  assert.deepEqual(m.items.map((i) => i.header || i.label || "—"), [
    "You asked on Sep 18: “personal trainers in Austin with a website, about 200”.",
    "Rename",
    "Find new ones",
    "Search again, changed",
    "Export these 161",
    "—",
    "Remove this search",
  ]);
  assert.equal(m.items.find((i) => i.label === "Find new ones").meta, "Only places not already in your leads count");
  assert.equal(m.items.find((i) => i.label === "Remove this search").meta, "Keeps the ones you contacted or are talking to.");
  m.items.find((i) => i.label === "Find new ones").onClick();
  await settle();
  assert.deepEqual(calls.at(-1), ["more_round", { id: SEARCH_A, purpose: "renew", plan: search().plan }], "the same plan, a new round");
  assert.match(textOf(flashes.at(-1).msg), /Only places not already in your leads count/);
});

test("Search again, changed opens the plan with what was asked; Rename renames through its route; Remove is asked first, keeps the worked leads, and says so", async () => {
  fresh();
  draw();
  menuOf("Personal trainers · Austin").items.find((i) => i.label === "Search again, changed").onClick();
  draw();
  assert.deepEqual([finders.at(-1).stage, finders.at(-1).words, finders.at(-1).proposal.purpose], ["plan", "personal trainers in Austin with a website, about 200", "renew"]);
  // Rename happens where the search is: the rail's row becomes the box.
  fresh();
  draw();
  menuOf("Personal trainers · Austin").items.find((i) => i.label === "Rename").onClick();
  let tree = draw();
  byTestId(tree, "leads-rename-name").props.onKeyDown({ key: "Enter", target: { value: "Trainers, Austin" } });
  await settle();
  assert.deepEqual(calls.at(-1), ["rename", { id: SEARCH_A, name: "Trainers, Austin" }]);
  assert.equal(textOf(flashes.at(-1).msg), "Renamed to Trainers, Austin");
  // Remove asks once, where the search is.
  fresh();
  draw();
  menuOf("Personal trainers · Austin").items.find((i) => i.label === "Remove this search").onClick();
  draw();
  const asked = confirms.at(-1);
  assert.equal(asked.question, "Remove “Personal trainers · Austin”?");
  assert.equal(asked.detail, "Keeps the ones you contacted or are talking to.");
  await asked.onYes();
  assert.deepEqual(calls.at(-1), ["remove", { id: SEARCH_A }]);
  assert.equal(textOf(flashes.at(-1).msg), "Removed. The 18 you contacted or are talking to are kept.");
  assert.deepEqual(went.at(-1), "clients/leads", "the rail lost that row, so the view is every lead again");
});

test("Export these N is a link to the search's own view of the export route", () => {
  fresh();
  const m = menuOf("Personal trainers · Austin") || (draw(), menuOf("Personal trainers · Austin"));
  const href = globalThis.window.__href("GET leads/export", undefined, { search: SEARCH_A, list: "all", sort: "fit", dir: "asc" });
  assert.equal(href, `/api/v1/leads/export?search=${SEARCH_A}&list=all&sort=fit&dir=asc`);
  assert.ok(m.items.some((i) => i.label === "Export these 161"));
});
```

- [ ] **Step 2: Run them and see them fail.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-vm.test.mjs leads-honest.test.mjs` → `leadSearchWords` is not exported (`SyntaxError: The requested module … does not provide an export named 'leadSearchWords'`), and `menuOf(…)` is `undefined` because the rail draws no menu.

- [ ] **Step 3: the sentence, in contracts.** `packages/contracts/src/leads.ts` (Task 4.1's module), after `leadDraftFooter`:

```ts
/** What removing a search keeps: the leads already worked. Said before the press; the number comes after it. */
export const LEAD_REMOVE_KEEPS = "Keeps the ones you contacted or are talking to.";

/**
 * A kept search, in the owner's own words (§8.10): what they asked for, the day they asked, and what the plan
 * leaves out. One derivation, because the rail's menu and the question before Remove both say it.
 */
export function leadSearchWords(s: { asked: string; asked_on: string; plan?: LeadSearchPlan } | null, tz: string): { askedLine: string; keepsLine: string } {
  if (!s) return { askedLine: "", keepsLine: LEAD_REMOVE_KEEPS };
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(s.asked_on));
  // Release A spells an exclusion `exclusions[]: { key, text, origin }` and a criterion
  // `criteria[]: { key, text, standard, required }` (lead-search.ts, LeadSearchPlanSchema):
  // what is left out is the exclusions list, and its words are `text`.
  const left = (s.plan?.exclusions ?? []).map((c) => c.text).filter(Boolean);
  const leaving = left.length ? ` Leaving out ${left.join(" and ")}.` : "";
  return { askedLine: `You asked on ${day}: “${s.asked}”.${leaving}`, keepsLine: LEAD_REMOVE_KEEPS };
}
```

(`LeadSearchPlan` is release A's, `packages/contracts/src/lead-search.ts`, already imported by `leads.ts` for `LeadSearchPlanSchema`; a criterion's `exclude` and `words` are that schema's.)

- [ ] **Step 4: the courier carries it, and a download may name a view.** `apps/dashboard/src/legacy-bridge/leads.ts` (Task 3's), beside the three names Task 2 added:

old:
```ts
  window.__leadRail = leadRail;
  window.__leadsStanding = leadsStanding;
```
new:
```ts
  window.__leadRail = leadRail;
  window.__leadsStanding = leadsStanding;
  // What a kept search says it asked for, in the owner's words (§8.10): the rail's menu and the question before
  // Remove read the same sentence.
  window.__leadSearchWords = leadSearchWords;
```
with `leadSearchWords` added to the module's import from `@chanlytics/contracts` and `__leadSearchWords?: typeof leadSearchWords;` to its `declare global` block.

`apps/dashboard/src/legacy-bridge/inbox-verbs.ts`: a download of one view needs its query, which `href` dropped.

old:
```ts
/** A link the browser follows rather than a request it makes: a download, a photo. */
const href = <K extends RouteKey>(key: K, params?: Params<K>) => api().url(key, { params });
```
new:
```ts
/**
 * A link the browser follows rather than a request it makes: a download, a photo. A download of ONE view names
 * it in the query (Leads' export of a search), which is typed as that route's own input.
 */
const href = <K extends RouteKey>(key: K, params?: Params<K>, query?: ApiOptions<K>["query"]) => api().url(key, { params, query });
```
with `ApiOptions` added to the type import from `../client/api` at the head of the file (`api.ts:28` declares it).

- [ ] **Step 5: the rail's menu.** `leads-scope.jsx`, inserted above `LeadsRailRows`:

old:
```jsx
// The rail under Leads: the lists, then the searches, each with its count, a live dot while it runs and a "?" in
// the accent while it waits on the owner. The search's own menu is Task 16's.
const LeadsRailRows = ({ rail, list, searchId, canFind, onPickList, onPickSearch, onNew }) => (
```
new:
```jsx
// A kept search says what was asked (§8.10). The menu closes after each item (MoreMenu), and every item is a
// route: nothing here renames or removes on the spot.
const LeadSearchMenu = ({ s, words, canFind, onRename, onMore, onAgain, onRemove, exportHref }) => (
  <MoreMenu
    align="left"
    title={`What ${s.name} asked for`}
    btnClass="btn btn-ghost btn-icon btn-xs ld-search-more"
    items={[
      { header: words.askedLine },
      { label: "Rename", icon: "pencil", onClick: () => onRename(s), gate: canFind ? undefined : window.gate("find", "rename this search") },
      { label: "Find new ones", icon: "refresh", meta: "Only places not already in your leads count", onClick: () => onMore(s), gate: canFind ? undefined : window.gate("find", "search again") },
      { label: "Search again, changed", icon: "sparkle", meta: "Opens the plan with what you asked", onClick: () => onAgain(s), gate: canFind ? undefined : window.gate("find", "search again") },
      { label: `Export these ${s.count}`, icon: "external", onClick: () => { if (exportHref) window.open(exportHref, "_self"); }, gate: canFind ? undefined : window.gate("find", "export these leads") },
      { divider: true },
      { label: "Remove this search", icon: "archive", danger: true, meta: words.keepsLine, onClick: () => onRemove(s), gate: canFind ? undefined : window.gate("find", "remove this search") },
    ]}
  />
);

// The rail under Leads: the lists, then the searches, each with its count, a live dot while it runs and a "?" in
// the accent while it waits on the owner. Renaming and removing are asked where the search is, so the rail never
// loses the row that is being named.
const LeadsRailRows = ({ rail, list, searchId, canFind, wordsFor, onPickList, onPickSearch, renaming, onRename, onRenameSave, onRenameCancel, removing, onRemoveAsk, onRemoveYes, onRemoveNo, removeBusy, removeError, onMore, onAgain, hrefFor, onNew }) => (
```

and the search's row becomes the box or the row with its menu:

old:
```jsx
      {rail.searches.map((s) => (
        <div key={s.id} className={`cl-rail-row ld-search-row ${searchId === s.id ? "active" : ""}`}>
          <button type="button" className="ld-search-pick" onClick={() => onPickSearch(s.id)} data-testid={`leads-search-${s.id}`}>
            {s.mark === "live" && <span className="live-dot" aria-hidden="true" />}
            {s.mark === "question" && <span className="rail-q" title="This search needs you">?</span>}
            <span className="label">{s.name}</span>
            <span className="count">{s.count}</span>
          </button>
        </div>
      ))}
```
new:
```jsx
      {rail.searches.map((s) => (
        <div key={s.id} className={`cl-rail-row ld-search-row ${searchId === s.id ? "active" : ""}`}>
          {renaming && renaming.id === s.id ? (
            <span className="cl-bulk-naming ld-search-renaming">
              <input autoFocus defaultValue={s.name} maxLength={80} aria-label="The search's name" data-testid="leads-rename-name" onKeyDown={(e) => { if (e.key === "Enter") onRenameSave(s, e.target.value); if (e.key === "Escape") onRenameCancel(); }} />
              <button type="button" className="btn btn-sm btn-primary" onClick={(e) => onRenameSave(s, e.currentTarget.parentNode.querySelector("input").value)} data-testid="leads-rename-save">Save</button>
            </span>
          ) : (
            <>
              <button type="button" className="ld-search-pick" onClick={() => onPickSearch(s.id)} data-testid={`leads-search-${s.id}`}>
                {s.mark === "live" && <span className="live-dot" aria-hidden="true" />}
                {s.mark === "question" && <span className="rail-q" title="This search needs you">?</span>}
                <span className="label">{s.name}</span>
                <span className="count">{s.count}</span>
              </button>
              <LeadSearchMenu s={s} words={wordsFor(s.id)} canFind={canFind} onRename={onRename} onMore={onMore} onAgain={onAgain} onRemove={onRemoveAsk} exportHref={hrefFor(s)} />
            </>
          )}
          {removing && removing.id === s.id && (
            <Confirm question={`Remove “${s.name}”?`} detail={wordsFor(s.id).keepsLine} yes="Yes, remove" danger busy={removeBusy} error={removeError} onYes={() => onRemoveYes(s)} onNo={onRemoveNo} testid="leads-remove" />
          )}
        </div>
      ))}
```

`LeadsScope` hands the rail what it needs:

old:
```jsx
        <LeadsRailRows
          rail={rail}
          list={p.view.list}
          searchId={p.view.searchId}
          canFind={p.canFind}
          onPickList={p.onPickList}
          onPickSearch={p.onPickSearch}
          onNew={p.onFind}
        />
```
new:
```jsx
        <LeadsRailRows
          rail={rail}
          list={p.view.list}
          searchId={p.view.searchId}
          canFind={p.canFind}
          wordsFor={p.searchWordsFor}
          onPickList={p.onPickList}
          onPickSearch={p.onPickSearch}
          renaming={p.renaming}
          onRename={p.onRename}
          onRenameSave={p.onRenameSave}
          onRenameCancel={p.onRenameCancel}
          removing={p.removing}
          onRemoveAsk={p.onRemoveAsk}
          onRemoveYes={p.onRemoveYes}
          onRemoveNo={p.onRemoveNo}
          removeBusy={p.removeBusy}
          removeError={p.removeError}
          onMore={p.onFindNewOnes}
          onAgain={p.onSearchAgain}
          hrefFor={p.exportHrefFor}
          onNew={p.onFind}
        />
```

and the file's window exports gain the menu:

old:
```jsx
Object.assign(window, { LeadsScope, LeadsBulkBar, LeadRowActions, LeadShape, LeadsRailRows, LeadClassTabs, LeadExcludedChips, ldExcludedChips, LEAD_COLUMNS, LEAD_SORT_KEYS, LEAD_CLASS_WORDS });
```
new:
```jsx
Object.assign(window, { LeadsScope, LeadsBulkBar, LeadRowActions, LeadShape, LeadSearchMenu, LeadsRailRows, LeadClassTabs, LeadExcludedChips, ldExcludedChips, LEAD_COLUMNS, LEAD_SORT_KEYS, LEAD_CLASS_WORDS });
```

- [ ] **Step 6: the page's four acts.** `clients-a.jsx`, at the end of the Leads acts block Task 2 wrote.

old:
```jsx
  const bulkLeads = (body) => leadAct(() => window.__leadsBulk(body), body.action === "contacted" ? <>Marked contacted.</> : <>Not a fit.</>);

  // What the keyboard's one listener reads: this render's rows, cursor and doors.
```
new:
```jsx
  const bulkLeads = (body) => leadAct(() => window.__leadsBulk(body), body.action === "contacted" ? <>Marked contacted.</> : <>Not a fit.</>);
  /* ------------------------------------------------ a search, kept (PRD 8.10) */
  const renameSearch = async (s, name) => {
    const n = (name || "").trim();
    if (!n || leadBusy) return;
    setLeadBusy(true);
    const r = await window.__leadSearchRename(s.id, n);
    setLeadBusy(false);
    if (!r.ok) { plFlash(window.refusalToast(r, `${s.name} was not renamed`)); return; }
    setRenaming(null);
    plFlash({ msg: <>Renamed to <b>{n}</b></> });
  };
  // Removing keeps the leads already worked, and the sentence says how many; the rail loses the row, so the view
  // goes back to all the leads rather than a search that is no longer there.
  const removeSearch = async (s) => {
    if (leadBusy) return;
    setLeadBusy(true);
    setRemoveError(null);
    const r = await window.__leadSearchRemove(s.id);
    setLeadBusy(false);
    if (!r.ok) { setRemoveError(r.message || "The search could not be removed."); return; }
    setRemoving(null);
    plFlash({ msg: <>Removed. The {r.data.kept} you contacted or are talking to are kept.</> });
    nav("clients/leads");
  };
  // Find new ones runs the same plan again, and only places not already in your leads count (P3).
  const findNewOnes = (s) => {
    const dto = searchById(s.id);
    if (!dto) return;
    return leadAct(() => window.__leadSearchMore(dto.id, "renew", dto.plan), <>Looking for new ones. Only places not already in your leads count.</>);
  };
  // Search again, changed opens the plan card with what was asked, so the owner edits it before anything runs.
  const searchAgain = (s) => {
    const dto = searchById(s.id);
    if (!dto) return;
    setFinderWords(dto.asked);
    setFinderProposal({ searchId: dto.id, plan: dto.plan, purpose: "renew" });
    setFinderRefusal(null);
    setFinderStage("plan");
    setFinderOpen(true);
  };
  const searchWordsFor = (id) => (window.__leadSearchWords ? window.__leadSearchWords(searchById(id), leads.tz) : { askedLine: "", keepsLine: "" });
  const exportHrefFor = (s) => (window.__href ? window.__href("GET leads/export", undefined, { search: s.id, list: "all", sort: "fit", dir: "asc" }) : null);

  // What the keyboard's one listener reads: this render's rows, cursor and doors.
```

and `LeadsScope` is handed them:

old:
```jsx
        onNeedsYou={(id) => nav(window.__leadsRouteOf({ searchId: id, list: "all", cls: null }))}
        onFind={() => { setFinderRefusal(null); setFinderStage("compose"); setFinderOpen(true); }}
```
new:
```jsx
        onNeedsYou={(id) => nav(window.__leadsRouteOf({ searchId: id, list: "all", cls: null }))}
        exportHrefFor={exportHrefFor}
        searchWordsFor={searchWordsFor}
        renaming={renaming}
        onRename={setRenaming}
        onRenameSave={renameSearch}
        onRenameCancel={() => setRenaming(null)}
        removing={removing}
        onRemoveAsk={(s) => { setRemoveError(null); setRemoving(s); }}
        onRemoveYes={removeSearch}
        onRemoveNo={() => { setRemoving(null); setRemoveError(null); }}
        removeBusy={leadBusy}
        removeError={removeError}
        onFindNewOnes={findNewOnes}
        onSearchAgain={searchAgain}
        onFind={() => { setFinderRefusal(null); setFinderStage("compose"); setFinderOpen(true); }}
```

- [ ] **Step 7: run and see them pass.** `corepack pnpm --filter @chanlytics/contracts build`, then `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-vm.test.mjs leads-honest.test.mjs leads-bridge.test.mjs` → PASS. `corepack pnpm -r typecheck` for the two bridge files. Then the mutation checks, each once, reverted after: the `Confirm` dropped so Remove goes on the first press → the Remove test fails on `confirms.at(-1)`; `nav("clients/leads")` dropped after a remove → the same test's last assertion fails; `"renew"` changed to `"topup"` in `findNewOnes` → the menu test fails; `leadSearchWords` given the date in UTC rather than the workspace's zone → the contracts test fails on "Sep 18" (the fixture's `asked_on` is 20:00Z, which is Sep 18 in Chicago and Sep 18 in UTC — change the fixture to 03:00Z the next day to see it fail, then put it back).

- [ ] **Step 8: commit** — "A kept search says what you asked for, and a month later it can be renamed, run again, exported or removed". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

## Task 17: the first day

**Files:** Modify `packages/contracts/src/leads.ts` (Task 4.1's file), `apps/dashboard/src/legacy-bridge/seed-globals.ts:11, :29, :75`, `apps/dashboard/src/server/leads.ts` (Task 4.4's `suggestionsFor`) · Modify `apps/dashboard/src/legacy/pages/leads-finder.jsx` (**Task 8 creates and registers it**; Task 8 adds `LeadFinder`, Task 9 `LeadPlanCard`, Task 10 `LeadStrip` and this task `LeadsFirstDay`, all to the one file) · Tests `tooling/scripts/tests/leads-honest.test.mjs` (Task 2's file), `tooling/scripts/tests/leads-vm.test.mjs` (Task 4.1's file)

**What it draws (§8.9).** With no search kept (`window.__LEADS.searches.length === 0`) the Leads scope draws the first day instead of the rail's lists, the strip and the table. People first: **Your people gather here**, then the three ways people arrive, then **Or have Claude find businesses worth reaching** with the composer (Task 8, handed in as a node) and three or four suggestions Claude wrote from this workspace's own business line, each saying who it is for and how reachable that kind of business is. The foot says what the finder does not do: "Claude finds businesses, not people at home."

**Two decisions the sketch left open, and why.**

1. **The suggestions' age is not shown.** The sketch offered "from what your business does, a week ago". It is not drawn: the cache is seven days (4.4's `suggestionsFor`), the owner has no control that refreshes it, and a page that says how old something is while offering no way to renew it invites a question it cannot answer. What is drawn is what they were written from — "For a personal training studio in Denver" — with **Not right? Change it** beside it, which is the control that does renew them: `PUT lead-suggestions` saves the line with `items: []`, and the read that follows asks Claude again.
2. **The three ways claim only what this tab has read.** The sketch said to take their live states from `__SETTINGS` and `__CHANNELS`. Those are the settings surface's globals (`surface-data.ts:501`) and the Leads route is fed by the leads surface (`ROUTE_SURFACE.clients = "people"`, `surface-registry.ts:89`; Task 3 adds `leads`), so on a cold open they are `undefined`. `leadsFirstDayWays` therefore takes facts that may be absent and says nothing about a line nobody looked at: with no facts the way reads "Calls and texts to your number are answered…" and its door is **Set up your number**; with `window.__SETUP.dto` in the window (the owner came from Setup in this tab) it reads the number and says **Your number is live**. The calendar and the people count are the People surface's, which this scope always holds.

- [ ] **Step 1: The failing tests.** In `leads-vm.test.mjs` (Task 4.1's file, whose imports gain `leadReachLine`, `leadsFirstDayWays`, `LEAD_SUGGEST_DAYS` from `../../../packages/contracts/src/leads.ts`):

```js
test("how reachable a kind of business is, in tenths of what past searches measured, and nothing at all for a kind nobody has searched", () => {
  assert.equal(leadReachLine({ places: 400, matched: 200, with_email: 120 }), "About 6 in 10 have an email");
  assert.equal(leadReachLine({ places: 400, matched: 200, with_email: 140 }), "About 2 in 3 have an email");
  assert.equal(leadReachLine({ places: 400, matched: 200, with_email: 100 }), "About half have an email");
  assert.equal(leadReachLine({ places: 400, matched: 200, with_email: 190 }), "Nearly all have an email");
  assert.equal(leadReachLine({ places: 400, matched: 200, with_email: 10 }), "Most list a phone · few have an email");
  assert.equal(leadReachLine({ places: 40, matched: 8, with_email: 6 }), "New kind of search · checked after 25", "under 25 judged matches the share is noise");
  assert.equal(leadReachLine(null), "New kind of search · checked after 25");
  assert.equal(LEAD_SUGGEST_DAYS, 7);
});

test("the three ways people arrive say only what this tab has read", () => {
  const read = leadsFirstDayWays({ voice: { active: true, number: "+1 (720) 555-0142" }, whatsapp: { present: true, active: true }, calendar: "ok", people: 42 });
  assert.deepEqual(read.map((w) => [w.id, w.status]), [
    ["reach", "Your number is live"], ["calendar", "Your calendar is connected"], ["yours", "42 people here already"],
  ]);
  assert.ok(read[0].line.includes("(720) 555-0142"));
  assert.deepEqual(read[0].doors.map((d) => d.label), ["Your number"], "WhatsApp is connected, so it is not offered again");
  const unread = leadsFirstDayWays({ voice: null, whatsapp: null, calendar: "none", people: 0 });
  assert.deepEqual(unread.map((w) => w.status), [null, null, null], "nothing was read, so nothing is claimed");
  assert.equal(unread[0].line, "Calls and texts to your number are answered, and each person lands here.");
  assert.deepEqual(unread[0].doors.map((d) => [d.label, d.to]), [["Set up your number", "admin/setup"], ["Connect WhatsApp", "admin/integrations"]]);
  assert.deepEqual(unread[2].doors.map((d) => d.label), ["Add someone"], "Import a list is Phase 2 and is not offered before it exists");
});
```

In `leads-honest.test.mjs` (Task 2's file: the people-honest harness's stub React, `window` seeded with `__LEAD_WORDS = LEAD_WORDS` as `seed-globals.ts` seeds it, `ST_STORE` from `ROLE_PERMS` as `gate-reason.test.mjs:64` does, `data-bits.jsx` then `leads-scope.jsx` then `leads-finder.jsx` loaded, and its `walk` / `all` / `find` / `byTestId` / `textOf`). The first day is drawn as a component, which is what it is: every piece of its state is the page's.

```js
const SUGGESTIONS = {
  business_line: "a personal training studio in Denver",
  by_owner: false,
  made_at: "2026-09-12T09:00:00.000Z",
  items: [
    { words: "Chiropractors and physical therapists within 5 miles", who_for: "Partners · their patients often need a trainer next", category_key: "chiropractor", reach: "About 4 in 10 have an email" },
    { words: "Independent Pilates and yoga studios in Denver", who_for: "Partners · swap classes and send each other clients", category_key: "yoga_studio", reach: "About 2 in 3 have an email" },
    { words: "Running and cycling shops near Wash Park", who_for: "Partners · a card at the counter, a discount for their customers", category_key: "bike_shop", reach: "New kind of search · checked after 25" },
  ],
};
const WAYS = leadsFirstDayWays({ voice: { active: true, number: "+1 (720) 555-0142" }, whatsapp: { present: false, active: false }, calendar: "none", people: 0 });
const firstDay = (over = {}) => {
  cells = []; seq = 0;
  return window.LeadsFirstDay({
    ways: WAYS, suggestions: SUGGESTIONS, canFind: true, lineOpen: false, lineDraft: "", lineError: null, lineBusy: false,
    onPick() {}, onGo() {}, onOpenLine() {}, onLineDraft() {}, onSaveLine() {}, onCancelLine() {},
    composer: React.createElement("div", { "data-testid": "leads-composer" }, "Describe the businesses you want"),
    ...over,
  });
};

test("the first day says what the page is for, the three ways people arrive, and the composer under its own line", () => {
  const t = firstDay();
  assert.equal(textOf(find(t, (n) => n.props?.className === "fr-h")), "Your people gather here");
  assert.deepEqual(all(t, (n) => /^ld-way-(reach|calendar|yours)$/.test(n.props?.["data-testid"] || "")).map((n) => n.props["data-testid"]),
    ["ld-way-reach", "ld-way-calendar", "ld-way-yours"]);
  assert.equal(textOf(find(t, (n) => n.props?.className === "fr-sub")), "Or have Claude find businesses worth reaching");
  assert.ok(byTestId(t, "leads-composer"), "the composer is drawn on the first day");
  assert.equal(textOf(byTestId(t, "ld-first-day-foot")), "Claude finds businesses, not people at home.");
});

test("a way claims only what this tab read: the live number is said with the number, and an unread line says nothing about being live", () => {
  assert.equal(textOf(byTestId(firstDay(), "ld-way-status-reach")), "Your number is live");
  const unread = leadsFirstDayWays({ voice: null, whatsapp: null, calendar: "none", people: 0 });
  const t = firstDay({ ways: unread });
  assert.equal(byTestId(t, "ld-way-status-reach"), null, "nothing was read, so nothing is claimed");
  assert.ok(textOf(byTestId(t, "ld-way-reach")).includes("Calls and texts to your number are answered"));
  assert.ok(textOf(byTestId(t, "ld-way-reach")).includes("Set up your number"));
});

test("the suggestions are this workspace's own line, each with who it is for and how reachable that kind is", () => {
  const t = firstDay();
  assert.equal(textOf(byTestId(t, "ld-line")), "For a personal training studio in Denver");
  const sugs = all(t, (n) => /^ld-sug-/.test(n.props?.["data-testid"] || ""));
  assert.equal(sugs.length, 3);
  assert.deepEqual(sugs.map((n) => textOf(n)), [
    "Chiropractors and physical therapists within 5 milesPartners · their patients often need a trainer nextAbout 4 in 10 have an email",
    "Independent Pilates and yoga studios in DenverPartners · swap classes and send each other clientsAbout 2 in 3 have an email",
    "Running and cycling shops near Wash ParkPartners · a card at the counter, a discount for their customersNew kind of search · checked after 25",
  ]);
  const picked = [];
  byTestId(firstDay({ onPick: (w) => picked.push(w) }), "ld-sug-chiropractor").props.children[0].props.onClick();
  assert.deepEqual(picked, ["Chiropractors and physical therapists within 5 miles"]);
  assert.equal(/personal trainers in Austin|Ridge Strength|Melany/.test(textOf(t)), false, "never a seeded example: every word here came from this workspace's own line");
});

test("Not right? Change it is the owner's, opens one line, and saves it", () => {
  assert.ok(byTestId(firstDay(), "ld-line-edit"), "an owner may change the line");
  role.now = "operator";
  const operator = firstDay({ canFind: false });
  assert.equal(byTestId(operator, "ld-line-edit"), null, "an operator is not offered it");
  assert.equal(byTestId(operator, "ld-sug-chiropractor").props.children[0].props["aria-disabled"], true);
  assert.equal(byTestId(operator, "ld-sug-chiropractor").props.children[0].props["aria-description"], "Only an owner can find businesses for you.");
  role.now = "owner";
  let saved = 0;
  const open = firstDay({ lineOpen: true, lineDraft: "a dog grooming van in Austin", onSaveLine: () => { saved += 1; } });
  assert.equal(byTestId(open, "ld-line-input").props.value, "a dog grooming van in Austin");
  byTestId(open, "ld-line-form").props.onSubmit({ preventDefault() {} });
  assert.equal(saved, 1);
});

test("a refused suggestions read is a note beside a working composer, never an empty list pretending", () => {
  const t = firstDay({ suggestions: { business_line: "", by_owner: false, made_at: "", items: [], note: LEAD_WORDS.suggestUnavailable } });
  assert.equal(textOf(byTestId(t, "ld-sugs-note")), "Suggestions are not available right now.");
  assert.equal(all(t, (n) => /^ld-sug-/.test(n.props?.["data-testid"] || "")).length, 0);
  assert.ok(byTestId(t, "leads-composer"), "the composer still works");
});
```

- [ ] **Step 2: Run them and see them fail.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-vm.test.mjs tooling/scripts/tests/leads-honest.test.mjs` → the contracts file fails on `SyntaxError: The requested module '.../leads.ts' does not provide an export named 'leadReachLine'`, the page file on `TypeError: window.LeadsFirstDay is not a function`.

- [ ] **Step 3: The contracts.** `packages/contracts/src/leads.ts` (Task 4.1's file) gains, after its words and before its request schemas:

```ts
export const LEAD_FIRST_DAY_TITLE = "Your people gather here";
export const LEAD_FIRST_DAY_SUB = "Or have Claude find businesses worth reaching";
export const LEAD_FIRST_DAY_FOOT = "Claude finds businesses, not people at home.";
export const LEAD_SUGGEST_UNAVAILABLE = "Suggestions are not available right now.";
/** How long a workspace's suggestions stand before Claude is asked again (4.4's suggestionsFor). */
export const LEAD_SUGGEST_DAYS = 7;

/** The platform-wide prior for a kind of business, as `lead_niche_prior()` answers it. */
export interface LeadNichePrior { places: number; matched: number; with_email: number }

/** Under this many judged matches the share is noise, and the line says so instead. */
export const LEAD_PRIOR_MIN = 25;

/**
 * How reachable a kind of business is, in tenths, from what past searches
 * measured (`lead_niche_priors`, A1's calibration). Never a percentage and
 * never a promise: a kind nobody has searched says so, and the plan card says
 * the same thing ("checked after the first 25").
 */
export function leadReachLine(prior: LeadNichePrior | null | undefined): string {
  if (!prior || prior.matched < LEAD_PRIOR_MIN) return "New kind of search · checked after 25";
  const tenths = Math.round((prior.with_email / prior.matched) * 10);
  if (tenths <= 1) return "Most list a phone · few have an email";
  if (tenths >= 9) return "Nearly all have an email";
  if (tenths === 5) return "About half have an email";
  if (tenths === 7) return "About 2 in 3 have an email";
  return `About ${tenths} in 10 have an email`;
}

export interface LeadWayFacts {
  /** The workspace's own line, when this tab has read the setup surface; null when it has not. */
  voice: { active: boolean; number: string | null } | null;
  whatsapp: { present: boolean; active: boolean } | null;
  calendar: "ok" | "unavailable" | "none";
  people: number;
}
export interface LeadWay {
  id: "reach" | "calendar" | "yours";
  title: string;
  line: string;
  /** Only ever what this tab has read: null claims nothing. */
  status: string | null;
  doors: { id: string; label: string; to: string }[];
}

/**
 * The three ways people arrive (§8.9), each claiming only what this tab has
 * read. The People surface carries the calendar and the count; the line is the
 * setup surface's, which this route does not load on a cold open -- so with no
 * facts the way says what it is and points at Setup, and never says a number is
 * live that nobody looked at. "Import a list" is Phase 2 and is not offered
 * until it exists.
 */
export function leadsFirstDayWays(f: LeadWayFacts): LeadWay[] {
  const live = !!(f.voice && f.voice.active && f.voice.number);
  const reachDoors = [{ id: "line", label: live ? "Your number" : "Set up your number", to: "admin/setup" }];
  if (!f.whatsapp || !f.whatsapp.active) reachDoors.push({ id: "whatsapp", label: "Connect WhatsApp", to: "admin/integrations" });
  return [
    {
      id: "reach",
      title: "They reach you",
      line: live
        ? `Calls and texts to ${f.voice!.number} are answered, and each person lands here.`
        : "Calls and texts to your number are answered, and each person lands here.",
      status: live ? "Your number is live" : null,
      doors: reachDoors,
    },
    {
      id: "calendar",
      title: "Your calendar",
      line: "Anyone with an appointment is added, with their visits, so regulars aren't strangers.",
      status: f.calendar === "ok" ? "Your calendar is connected" : null,
      doors: f.calendar === "ok"
        ? [{ id: "calendar", label: "Open the calendar", to: "calendar" }]
        : [{ id: "calendar", label: "Connect your calendar", to: "admin/integrations" }],
    },
    {
      id: "yours",
      title: "Clients you already have",
      line: "Add them one at a time, and they gather here with everyone else.",
      status: f.people > 0 ? `${f.people} ${f.people === 1 ? "person" : "people"} here already` : null,
      doors: [{ id: "add", label: "Add someone", to: "clients" }],
    },
  ];
}
```

and `LEAD_WORDS` (Task 19) gains `firstDay: { title: LEAD_FIRST_DAY_TITLE, sub: LEAD_FIRST_DAY_SUB, foot: LEAD_FIRST_DAY_FOOT }` and `suggestUnavailable: LEAD_SUGGEST_UNAVAILABLE`, which is where the page reads them from.

- [ ] **Step 4: The component.** `apps/dashboard/src/legacy/pages/leads-finder.jsx`, at the head of the file (Tasks 8, 9 and 10 add their components below it):

```jsx
/* global React, Icon */
// The Leads scope's finder: the first day (Task 17), the composer (Task 8), the
// plan card (Task 9) and the strip (Task 10). Hookless, every one of them: the
// tests' stub React keys hooks by one global call order, and the first day comes
// and goes with the workspace's first search.
const ldWords = () => window.__LEAD_WORDS;

// One suggestion: what to search, who it is for, and how reachable that kind is.
const LeadSuggestion = ({ item, onPick, canFind }) => (
  <div className="fr-sug" data-testid={`ld-sug-${item.category_key}`}>
    <button
      type="button"
      className="q"
      onClick={() => onPick(item.words)}
      {...(canFind ? {} : window.gate("find", "find businesses for you"))}
    >
      {item.words}
    </button>
    <span className="w">{item.who_for}</span>
    {item.reach ? <span className="reach">{item.reach}</span> : null}
  </div>
);

const LeadWayCard = ({ way, onGo }) => (
  <div className="fr-way" data-testid={`ld-way-${way.id}`}>
    <b>{way.title}</b>
    <span>{way.line}</span>
    {way.status ? (
      <span className="fr-status" data-testid={`ld-way-status-${way.id}`}>
        <Icon name="check" size={12} />
        {way.status}
      </span>
    ) : null}
    {way.doors.map((d) => (
      <button key={d.id} type="button" className="fr-door" onClick={() => onGo(d.to)}>{d.label}</button>
    ))}
  </div>
);

/**
 * The first day of Leads: no search kept yet. People first -- the three ways
 * they arrive, each claiming only what this tab has read -- then the composer
 * and the suggestions Claude wrote from this workspace's own business line.
 * Never a seeded example: the items are the server's, from this workspace's
 * line, and a refused read is a note beside a composer that still works.
 */
const LeadsFirstDay = ({
  ways, suggestions, canFind, lineOpen, lineDraft, lineError, lineBusy,
  onPick, onGo, onOpenLine, onLineDraft, onSaveLine, onCancelLine, composer,
}) => {
  const items = (suggestions && suggestions.items) || [];
  const note = suggestions && suggestions.note ? suggestions.note : null;
  return (
    <div className="fr" data-testid="leads-first-day">
      <h1 className="fr-h">{ldWords().firstDay.title}</h1>
      <p className="fr-p">Everyone who calls, messages or books you shows up on this page by themselves, with what they asked and what they booked.</p>
      <div className="fr-ways">
        {ways.map((w) => <LeadWayCard key={w.id} way={w} onGo={onGo} />)}
      </div>
      <div className="fr-sub">{ldWords().firstDay.sub}</div>
      {composer}
      <div>
        <div className="fr-sugs-h">
          {suggestions ? <span data-testid="ld-line">{`For ${suggestions.business_line}`}</span> : <span data-testid="ld-line" />}
          {canFind && suggestions ? (
            <button type="button" className="fr-line-edit" onClick={onOpenLine} data-testid="ld-line-edit">Not right? Change it</button>
          ) : null}
        </div>
        {lineOpen ? (
          <form
            className="fr-line-form"
            data-testid="ld-line-form"
            onSubmit={(e) => { e.preventDefault(); onSaveLine(); }}
          >
            <input
              className="inp"
              type="text"
              value={lineDraft}
              aria-label="What this business does"
              data-testid="ld-line-input"
              onChange={(e) => onLineDraft(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={lineBusy} data-testid="ld-line-save">Save</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelLine}>Cancel</button>
            <window.FieldError id="ld-line-error" message={lineError} testid="ld-line-error" />
          </form>
        ) : null}
        {note ? <p className="fr-sugs-note" data-testid="ld-sugs-note">{note}</p> : null}
        <div className="fr-sugs">
          {items.map((it) => <LeadSuggestion key={it.category_key} item={it} onPick={onPick} canFind={canFind} />)}
        </div>
      </div>
      <div className="fr-foot" data-testid="ld-first-day-foot">
        <Icon name="lock" size={12} />
        <span>{ldWords().firstDay.foot}</span>
      </div>
    </div>
  );
};

Object.assign(window, { LeadsFirstDay });
```

- [ ] **Step 5: Where the page draws it, and the one hook it needs.** In `leads-scope.jsx`'s `LeadsScope` (Task 2), before the rail and the table:

```jsx
  // No search kept: the first day, with the composer inside it rather than
  // folded out over a table that has no rows. The strip, the rail's lists and
  // the table are not drawn at all.
  if (surface.searches.length === 0) {
    return (
      <div className="cl-main pl-main" data-testid="leads-main">
        <window.LeadsFirstDay
          ways={window.__leadWays({
            voice: window.__SETUP && window.__SETUP.dto ? window.__SETUP.dto.channels.voice : null,
            whatsapp: window.__SETUP && window.__SETUP.dto ? window.__SETUP.dto.channels.whatsapp : null,
            calendar: (people.calendar && people.calendar.state) || "none",
            people: (people.aggregates && people.aggregates.total) || 0,
          })}
          suggestions={surface.suggestions}
          canFind={canFind}
          lineOpen={!!leadLine}
          lineDraft={leadLine ? leadLine.draft : ""}
          lineError={leadLine ? leadLine.error : null}
          lineBusy={!!(leadLine && leadLine.busy)}
          onPick={(words) => { setFinderWords(words); setFinderOpen(true); }}
          onGo={(to) => onNavigate(to)}
          onOpenLine={() => setLeadLine({ draft: surface.suggestions ? surface.suggestions.business_line : "", error: null, busy: false })}
          onLineDraft={(draft) => setLeadLine((l) => ({ ...l, draft, error: null }))}
          onSaveLine={saveBusinessLine}
          onCancelLine={() => setLeadLine(null)}
          composer={<window.LeadFinder open stage={finderStage} words={finderWords} proposal={finderProposal} inline {...finderProps} />}
        />
        {toastNode}
      </div>
    );
  }
```

`leadLine` is **one** hook (`{ draft, error, busy } | null`), declared in `ClientsAReal` beside the seven Task 2 rule 2 names, unconditionally in both scopes, so the stub's hook order is the same under People. `window.__leadWays` is `leadsFirstDayWays`, published by `seed-globals.ts` beside `__LEAD_WORDS` (step 6). `saveBusinessLine` is `ClientsAReal`'s, and re-reads rather than patching, because Task 3's `refreshView` keeps the suggestions it already holds:

```jsx
  // The line is saved, then the whole view is read again: refreshView() patches
  // rows and keeps the suggestions it holds, and the point of saving the line is
  // to get different ones. leadsView({}) re-reads page one under the same view,
  // which is where GET lead-suggestions is asked again (legacy-bridge/leads.ts).
  const saveBusinessLine = async () => {
    const line = (leadLine && leadLine.draft ? leadLine.draft : "").trim();
    setLeadLine((l) => ({ ...l, busy: true, error: null }));
    const r = await window.__leadBusinessLine(line);
    if (!r.ok) { setLeadLine((l) => ({ ...l, busy: false, error: r.message })); return; }
    setLeadLine(null);
    await window.__leadsView({});
  };
```

- [ ] **Step 6: Seed the ways beside the words.** `window.__LEAD_WORDS` is already seeded (Task 12 step 8 put it in `seed-globals.ts`, which is where a words record belongs); this step adds the three ways beside it. `seed-globals.ts` — its import (`:11`) gains `leadsFirstDayWays` on the line that already brings in `LEAD_WORDS`, its `declare global` block gains `__leadWays: typeof leadsFirstDayWays;` under `__LEAD_WORDS`, and:

  old: `  window.__LEAD_WORDS = LEAD_WORDS;`
  new:

```ts
  window.__LEAD_WORDS = LEAD_WORDS;
  // The three ways the first day draws, derived in contracts from facts this
  // tab has actually read, so a way never claims a line nobody looked at.
  window.__leadWays = leadsFirstDayWays;
```

- [ ] **Step 7: The server's side of it** — `suggestionsFor` (Task 4.4) is written with these names rather than its own: the cache is `LEAD_SUGGEST_DAYS` old, each item's `reach` is `leadReachLine(await leadNichePrior(ctx, item.category_key))`, and a gateway refusal answers `{ business_line, by_owner, made_at, items: [], note: LEAD_SUGGEST_UNAVAILABLE }` — never a throw, so the composer beside it keeps working.

- [ ] **Step 8: Mutation checks, each once.** Make `leadsFirstDayWays` say `const live = true;` and see "a way claims only what this tab read" fail (`expected true, actual undefined` on the absent status). Drop `{item.reach ? … : null}` from `LeadSuggestion` and see "the suggestions are this workspace's own line" fail on the three expected strings. Drop the `window.gate` spread from `LeadSuggestion`'s button and see "Not right? Change it is the owner's" fail on `aria-disabled`.

- [ ] **Step 9:** Run `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-vm.test.mjs tooling/scripts/tests/leads-honest.test.mjs tooling/scripts/tests/legacy-harness.test.mjs` → PASS. Rebuild the contracts dist (`node tooling/scripts/check-dist.mjs`), keep only real diffs. Commit:

```bash
git commit -m "The first day says where people come from, and offers businesses worth reaching written for this workspace" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 18: the phone

**Files:** Create `apps/dashboard/src/legacy/styles/leads.css` · Modify `apps/dashboard/src/legacy/pages/leads-scope.jsx` (`LeadsPhoneBar`, `LeadFinderSheet`, and where `LeadsScope` draws them), `apps/dashboard/src/legacy/Chanlytics.html:18, :107`, `apps/dashboard/src/legacy-bridge/legacy.css:1, :9` · Tests `tooling/scripts/tests/leads-honest.test.mjs`, and the browser check below

**The band, and why it is 900 and not 720.** People's cards begin at `@media (max-width: 900px)` (`clients.css:1787`), the Columns menu hides at 900 (`clients.css:1778`), the rail is `display: none` at 900 (`mobile.css:133`), the one keyboard listener judges the menu at 900 (`clients-a.jsx:1831`) and the desktop rules are `(width > 900px)` (`clients.css:1783`, `:1823`). Leads takes the same band: **one bar at 900px and under**, replacing the rail and the wrapped controls row. 720px and under is the same bar, slimmer — the list's name and the search give up words before the switch or Find give up a pixel. PRD §6.6 was corrected on 19 September to say so.

**Nothing above the rows but the bar and the strip** (`feedback_mobile_work_first`): no title, no sub-headline, no stat cards, no second control row. The rail's lists come up from the bar's list button as a sheet, the way People's do (`PeopleListsSheet`, `clients-a.jsx:893`).

- [ ] **Step 1: The failing tests** (`leads-honest.test.mjs`, the same harness Task 17 uses):

```js
const bar = (over = {}) => {
  cells = []; seq = 0;
  return window.LeadsPhoneBar({
    scope: "leads", onScope() {}, listLabel: "All leads · 322", onLists() {}, listsOpen: false,
    q: "", onQ() {}, searchRef: { current: null }, onFind() {}, canFind: true, ...over,
  });
};

test("on a phone the switch, search and Find are one bar, and the switch is a tablist with Leads chosen", () => {
  const t = bar();
  const tabs = all(t, (n) => n.props?.role === "tab");
  assert.deepEqual(tabs.map((n) => [textOf(n), n.props["aria-selected"]]), [["People", false], ["Leads", true]]);
  assert.equal(byTestId(t, "leads-phone-search").props["aria-label"], "Search leads");
  assert.equal(byTestId(t, "leads-phone-find").props["aria-label"], "Find leads");
  assert.equal(textOf(byTestId(t, "leads-phone-lists")), "All leads · 322");
  assert.equal(all(t, (n) => n.props?.["data-testid"] === "leads-phone-bar").length, 1, "one bar, not a row of controls");
});

test("Find on a phone is the gate's for anyone who may not find", () => {
  role.now = "operator";
  const t = bar({ canFind: false });
  assert.equal(byTestId(t, "leads-phone-find").props["aria-disabled"], true);
  assert.equal(byTestId(t, "leads-phone-find").props["aria-description"], "Only an owner can find businesses for you.");
  role.now = "owner";
});

test("the finder's sheet is the page's own dialog and registers no listener of its own", () => {
  cells = []; seq = 0;
  const before = seq;
  const t = window.LeadFinderSheet({ onClose() {}, children: React.createElement("div", { "data-testid": "hold-to-talk" }, "Hold to talk, or type") });
  assert.equal(seq, before, "hookless: the page's listener owns Esc, and a second one would take the key twice");
  const sheet = byTestId(t, "leads-finder-sheet");
  assert.equal(sheet.props.role, "dialog");
  assert.ok(sheet.props.className.includes("pl-finder"), "PL_OVERLAY names .pl-finder as the page's own");
  assert.ok(byTestId(t, "hold-to-talk"), "the first control in the sheet is the one the page put first");
});

test("at a phone's width the page draws the bar instead of the rail and the controls, and nothing else above the rows", () => {
  window.matchMedia = (q) => ({ matches: /max-width: 900px/.test(q), addEventListener() {}, removeEventListener() {} });
  const t = draw({ scope: "leads", leadsRoute: "clients/leads" });
  assert.ok(byTestId(t, "leads-phone-bar"), "one bar");
  assert.equal(all(t, (n) => n.props?.className === "cl-controls").length, 0, "no controls row above the rows");
  assert.equal(all(t, (n) => n.props?.className === "cl-rail").length, 0, "no rail");
  const above = all(t, (n) => n.props?.["data-testid"] === "leads-phone-bar" || n.props?.["data-testid"] === "lead-strip" || n.props?.className === "pl-table-wrap");
  assert.deepEqual(above.map((n) => n.props["data-testid"] || "table"), ["leads-phone-bar", "lead-strip", "table"], "the bar, the strip, the work");
});
```

- [ ] **Step 2: Run them and see them fail.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-honest.test.mjs` → `TypeError: window.LeadsPhoneBar is not a function`.

- [ ] **Step 3: The two components**, in `leads-scope.jsx` beside `LeadsScope`:

```jsx
// The phone's one bar (<=900px): the People | Leads switch, the list it is
// showing, search and Find. Nothing else sits above the rows.
const LeadsPhoneBar = ({ scope, onScope, listLabel, onLists, listsOpen, q, onQ, searchRef, onFind, canFind }) => (
  <div className="ld-bar" data-testid="leads-phone-bar">
    <div className="pt-scope" role="tablist" aria-label="Which people">
      <button type="button" role="tab" aria-selected={scope === "people"} className={scope === "people" ? "on" : ""} onClick={() => onScope("people")}>People</button>
      <button type="button" role="tab" aria-selected={scope === "leads"} className={scope === "leads" ? "on" : ""} onClick={() => onScope("leads")}>Leads</button>
    </div>
    <button type="button" className="ld-bar-lists" onClick={onLists} aria-expanded={!!listsOpen} data-testid="leads-phone-lists">
      {listLabel}
      <Icon name="chevron-down" size={11} />
    </button>
    <input
      ref={searchRef}
      className="ld-bar-search"
      type="search"
      value={q}
      placeholder="Search leads"
      aria-label="Search leads"
      data-testid="leads-phone-search"
      onChange={(e) => onQ(e.target.value)}
    />
    <button
      type="button"
      className="ld-bar-find"
      aria-label="Find leads"
      data-testid="leads-phone-find"
      onClick={onFind}
      {...(canFind ? {} : window.gate("find", "find businesses for you"))}
    >
      <Icon name="sparkle" size={20} />
    </button>
  </div>
);

// The finder, as a sheet from the bottom of a phone. No listener of its own:
// the page's one keydown listener closes the finder on Esc before anything
// else and holds every other key while it is open (Task 2), so a second
// listener here would take the key twice.
const LeadFinderSheet = ({ onClose, children }) => (
  <>
    <div className="sb-sheet-backdrop" onClick={onClose} />
    <div className="sb-sheet pl-finder" role="dialog" aria-label="Find leads" data-testid="leads-finder-sheet">
      <div className="ld-sheet-handle" />
      {children}
    </div>
  </>
);
```

Both join `leads-scope.jsx`'s `Object.assign(window, { LeadsScope, LeadsBulkBar, LeadsPhoneBar, LeadFinderSheet })`.

**This corrects the sketch on one point.** The sketch asked for "the sheet's Esc listener (its own, like `PeopleListsSheet`'s, and `keys.sheetOpen` set so the page's listener holds still)". Task 2's listener already closes the finder on Esc as its second branch and returns on every other key while `k.finderOpen` — a second listener would take Esc twice and close the finder and then the selection on one press, and the page's rule is one listener for the page's life. So `LeadFinderSheet` is hookless and registers nothing; `keys.sheetOpen` stays the lists sheet's.

- [ ] **Step 4: Where `LeadsScope` draws them.** `LeadsScope` reads the band once, from the same query the rest of the page uses:

```jsx
  // The same band People's cards use (clients.css) and the same one the page's
  // listener judges the Columns menu by. Read on every draw, not stored: a
  // window that is resized past it must draw the other shape on the next state
  // change, and nothing here is a hook.
  const phone = !!(window.matchMedia && window.matchMedia("(max-width: 900px)").matches);
```

and, above the strip:

```jsx
      {phone ? (
        <LeadsPhoneBar
          scope="leads"
          onScope={(to) => onNavigate(to === "people" ? "clients" : "clients/leads")}
          listLabel={railLabel}
          onLists={() => setListsOpen(true)}
          listsOpen={listsOpen}
          q={q}
          onQ={setQ}
          searchRef={searchRef}
          onFind={() => setFinderOpen(true)}
          canFind={canFind}
        />
      ) : (
        <div className="cl-controls">{/* the desktop's controls: search, Columns, Export, Find leads */}</div>
      )}
```

and the finder, when open, is wrapped on a phone and folded out above the table on a desktop:

```jsx
      {finderOpen && (phone
        ? <LeadFinderSheet onClose={() => setFinderOpen(false)}><window.LeadFinder open phone {...finderProps} /></LeadFinderSheet>
        : <window.LeadFinder open {...finderProps} />)}
```

`LeadFinder`'s `phone` prop (Task 8's component) changes exactly two things and nothing else: the hold-to-talk button is the sheet's first control (it takes `order: -1` from `leads.css`, so the markup order is unchanged and the reading order follows the layout), and the input is full width under it. Everything else about the finder is the same component.

- [ ] **Step 5: the lead cells, and the phone.** **Append** to `apps/dashboard/src/legacy/styles/leads.css` — Task 8 created the file and registered it (step 6 below only checks that), Tasks 9, 10 and 12–15 appended the finder, the card, the strip and the peek, and Task 17 the first day's `fr-*`. What is left, and what this step writes, is the part nothing else owns: the lead cells over `.cl-table`, and every rule the phone needs, for this task's own markup and for theirs. Colour comes only from `tokens.css`; the dark theme needs no rules of its own because every value is a token that already flips. `prefers-reduced-motion` stops the live dot and the progress bar.

```css
/* Leads — a scope of People.
   ------------------------------------------------------------------------
   Everything the Leads scope draws that People's own stylesheet does not: the
   first day, the finder and its plan sentence, the strip, the lead cells over
   .cl-table, the peek, and the phone. Loaded AFTER clients.css and people.css
   (legacy.css, Chanlytics.html), so a lead cell's rule wins over the People
   card rule it narrows at the same specificity.

   Colour comes only from tokens.css; there is no colour here that is not a
   token, and none of the states carry a word this file invents -- every word on
   screen is contracts' (window.__LEAD_WORDS).

   The phone is 900px and under, which is where People's own cards begin
   (clients.css) and where the Columns menu hides and the one keyboard listener
   judges the menu. 720px and under is the slim bar: the same bar, with the
   search and Find as icons. */

/* ---------------------------------------------------------- the first day */

.fr { display: flex; flex-direction: column; gap: 14px; padding: 18px var(--gutter-page) 28px; max-width: var(--measure-page); }
.fr-h { font-size: var(--text-xl); font-weight: var(--weight-semibold); letter-spacing: var(--tracking-tight); margin: 0; line-height: var(--leading-tight); }
.fr-p { font-size: var(--text-sm); color: var(--ink-muted); margin: 0; max-width: var(--measure-prose); line-height: var(--leading-relaxed); }
.fr-ways { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.fr-way { padding: 14px 16px 14px 0; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; font-size: var(--text-sm); color: var(--ink-muted); line-height: var(--leading-normal); }
.fr-way + .fr-way { padding-left: 16px; border-left: 1px solid var(--line); }
.fr-way b { color: var(--ink); font-weight: var(--weight-medium); }
.fr-status { display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-xs); color: var(--ok-ink); }
.fr-door { border: 0; background: none; padding: 0; font: inherit; font-weight: var(--weight-medium); color: var(--ink); cursor: pointer; text-decoration: underline; text-decoration-color: var(--line-strong); text-underline-offset: 3px; }
.fr-sub { font-size: var(--text-xs); font-weight: var(--weight-medium); letter-spacing: var(--tracking-wide); text-transform: uppercase; color: var(--ink-dim); margin: 8px 0 0; }
.fr-sugs-h { display: flex; align-items: baseline; gap: 10px; font-size: var(--text-xs); color: var(--ink-dim); padding: 2px 0 8px; }
.fr-line-edit { border: 0; background: none; padding: 0; font: inherit; color: var(--ink-muted); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.fr-line-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-bottom: 10px; }
.fr-line-form .inp { flex: 1 1 320px; }
.fr-line-form .field-error { flex-basis: 100%; }
.fr-sugs-note { font-size: var(--text-xs); color: var(--ink-dim); margin: 0 0 8px; }
.fr-sugs { display: flex; flex-direction: column; border-top: 1px solid var(--line); }
.fr-sug { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 16px; padding: 11px 0; border-bottom: 1px solid var(--line); align-items: center; }
.fr-sug .q { grid-column: 1; border: 0; background: none; padding: 0; font: inherit; font-weight: var(--weight-medium); color: var(--ink); text-align: left; cursor: pointer; }
.fr-sug .w { grid-column: 1; font-size: var(--text-xs); color: var(--ink-dim); }
.fr-sug .reach { grid-column: 2; grid-row: 1 / span 2; font-size: var(--text-xs); color: var(--ink-dim); white-space: nowrap; text-align: right; }
.fr-foot { font-size: var(--text-xs); color: var(--ink-dim); display: flex; gap: 6px; align-items: flex-start; max-width: var(--measure-prose); line-height: var(--leading-normal); }
.fr-foot .i { margin-top: 2px; flex: none; }

/* --------------------------------- the finder, the plan card and the strip */
/* Written by the tasks that draw them, into this same file, above this line:
   Task 8 creates the file and writes .lf-panel/.lf-compose/.lf-input/.lf-mic and
   the composer's rules; Task 9 appends the plan card's (.lf-plan, .lf-sentence,
   .tok, .lf-leaving, .lf-likely, .lf-facts); Task 10 appends the strip's
   (.lf-strip*, .live-dot). Not repeated here: a rule written twice in one file
   is the second one, silently. This task adds only what nothing else writes --
   the lead cells over .cl-table, and the phone. */

@media (prefers-reduced-motion: reduce) {
  .live-dot { animation: none; }
  .lf-strip-bar { transition: none; }
}

/* ------------------------------------------------- the lead cells (desktop) */

.ld-biz-cell .ld-mark { width: 26px; height: 26px; border-radius: var(--radius-sm); background: var(--bg-active); color: var(--ink-muted); display: inline-grid; place-items: center; font-family: var(--font-mono); font-size: var(--text-xs); }
.ld-biz-cell .cl-row-meta { display: block; font-size: var(--text-xs); color: var(--ink-dim); }
.ld-fit-cell.qualified { color: var(--ink); }
.ld-fit-cell.review { color: var(--warn-ink); }
.ld-fit-cell.excluded { color: var(--ink-dim); }
.ld-email-cell { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ld-shape { width: 9px; height: 9px; flex: none; }
.ld-phone-cell.wrong { color: var(--ink-dim); text-decoration: line-through; }
.ld-tick2 { color: var(--ok-ink); margin-left: 4px; }
.ld-why-cell { max-width: 34ch; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ld-rating-cell, .ld-found-cell, .ld-distance-cell { font-variant-numeric: tabular-nums; }
.ld-dot { width: 7px; height: 7px; border-radius: var(--radius-full); display: inline-block; margin-right: 6px; background: var(--ink-faint); }
.ld-dot.ready { background: var(--accent); }
.ld-dot.nurture { background: var(--info); }
.ld-dot.converted { background: var(--ok); }
.ld-dot.archived { background: var(--ink-faint); }
.ld-row-actions { display: inline-flex; gap: 4px; }

/* ------------------------------------------------------------- the peek */
/* Tasks 12-15's, appended to this file where each is drawn: .pl-peek and .pk-*
   (Task 12), .pk-draft and .pk-field (13), .pk-ask and .pk-chips (14), .pk-nf
   (15). The peek's PHONE rules are this task's and are in the 900px block
   below, which is the only place this file says anything about .pk-*. */

/* =========================================================== the phone ===
   900px and under: cards, one bar, and the work first. Nothing above the rows
   but the bar and the strip. */

.ld-bar { display: none; }

@media (max-width: 900px) {
  /* One bar replaces the rail and the controls row. The rail is already
     display: none here (mobile.css); its lists come up from the bar. */
  .clients .cl-controls { display: none; }
  .ld-bar { display: flex; align-items: center; gap: 8px; padding: 8px var(--gutter-page) 10px; flex: none; }
  .ld-bar .pt-scope { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; padding: 2px; margin: 0; background: var(--bg-active); border-radius: var(--radius-md); flex: none; }
  .ld-bar .pt-scope button { height: 32px; min-width: 62px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--ink-muted); font: inherit; font-size: var(--text-sm); font-weight: var(--weight-medium); cursor: pointer; }
  .ld-bar .pt-scope button.on { background: var(--bg-raised); color: var(--ink); box-shadow: var(--shadow-sm); }
  .ld-bar-lists { height: 32px; padding: 0 8px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--bg-raised); font: inherit; font-size: var(--text-sm); color: var(--ink); white-space: nowrap; cursor: pointer; }
  .ld-bar-search { flex: 1; min-width: 0; height: 40px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--bg-raised); padding: 0 10px; font: inherit; font-size: var(--text-md); color: var(--ink); }
  .ld-bar-find { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--bg-raised); color: var(--accent); cursor: pointer; }

  /* A running search is two lines; the question is a card with two 44px
     answers and Stop here under them. */
  .lf-strip { flex-direction: column; align-items: flex-start; gap: 2px; }
  .lf-strip .sp { display: none; }
  .lf-strip .lf-acts { display: flex; width: 100%; gap: 8px; margin-top: 8px; }
  .lf-strip.ask .lf-acts .btn { flex: 1; min-height: 44px; justify-content: center; }
  .lf-strip.ask .lf-acts .lnk { flex-basis: 100%; text-align: left; }

  /* Rows are cards on the lead grid areas: the three rows the design draws,
     with the actions cell as a fourth column holding the 44px Call. */
  .clients .cl-table tbody tr:has(td.ld-fit-cell) {
    grid-template-columns: 28px minmax(0, 1fr) auto 44px;
    grid-template-areas:
      "sel business fit  call"
      "sel email    phone call"
      "sel stage    found call";
    column-gap: 8px;
    row-gap: 2px;
    align-items: start;
  }
  .cl-table td.ld-business-cell { grid-area: business; }
  .cl-table td.ld-fit-cell { grid-area: fit; justify-self: end; }
  .cl-table td.ld-email-cell { grid-area: email; }
  .cl-table td.ld-phone-cell { grid-area: phone; justify-self: end; }
  .cl-table td.ld-stage-cell { grid-area: stage; }
  .cl-table td.ld-found-cell { grid-area: found; justify-self: end; }
  /* A card keeps its few facts: the judge's reason, the rating, the distance,
     the source, the site and the search are the desktop's columns. */
  .cl-table td.ld-why-cell, .cl-table td.ld-rating-cell, .cl-table td.ld-distance-cell,
  .cl-table td.ld-source-cell, .cl-table td.ld-website-cell, .cl-table td.ld-search-cell { display: none; }
  /* clients.css hides the actions cell on a card; a lead's Call is the one
     thing a phone is for, so it comes back at 44px and Copy, Keep, Exclude and
     Put back stay in the lead's own screen. */
  .cl-table td.cl-actions-cell:has(.ld-row-actions) { display: grid; place-items: center; grid-area: call; align-self: center; }
  .ld-row-actions { display: contents; }
  .ld-row-actions > :not(.ld-call) { display: none; }
  .ld-row-actions .ld-call { width: 44px; height: 44px; border-radius: var(--radius-md); border: 1px solid var(--line); background: var(--bg-raised); color: var(--ink); display: grid; place-items: center; }
  /* An excluded card has no stage and nothing checked to say: its second row
     is why it was left out. */
  .clients .cl-table tbody tr:has(td.ld-fit-cell.excluded) {
    grid-template-areas:
      "sel business fit  call"
      "sel why      why  call";
  }
  .clients .cl-table tbody tr:has(td.ld-fit-cell.excluded) td.ld-why-cell { display: block; grid-area: why; }
  .clients .cl-table tbody tr:has(td.ld-fit-cell.excluded) td.ld-email-cell,
  .clients .cl-table tbody tr:has(td.ld-fit-cell.excluded) td.ld-phone-cell,
  .clients .cl-table tbody tr:has(td.ld-fit-cell.excluded) td.ld-stage-cell,
  .clients .cl-table tbody tr:has(td.ld-fit-cell.excluded) td.ld-found-cell { display: none; }

  /* A lead opens full screen, not beside the table. */
  .pl-peek { position: fixed; inset: 0; z-index: 40; width: auto; border-left: 0; background: var(--bg); }
  .pk-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .pk-actions .btn { min-height: 48px; justify-content: center; border-radius: var(--radius-md); }

  /* Find opens a sheet from the bottom, and hold-to-talk is its first control. */
  .pl-finder { border-radius: var(--radius-xl) var(--radius-xl) 0 0; padding: 8px var(--gutter-page) 18px; display: flex; flex-direction: column; gap: 14px; max-height: 88vh; overflow: auto; }
  .ld-sheet-handle { width: 36px; height: 4px; border-radius: var(--radius-full); background: var(--line-strong); margin: 0 auto 2px; flex: none; }
  .pl-finder .lf-panel { border: 0; background: none; }
  .pl-finder .lf-compose { flex-direction: column; gap: 10px; padding: 0; }
  .pl-finder .lf-spark { display: none; }
  .pl-finder .lf-mic { order: -1; width: 76px; height: 76px; border-radius: var(--radius-full); background: var(--accent-soft); color: var(--accent); border: 0; }
  .pl-finder .lf-input { width: 100%; text-align: center; font-size: var(--text-lg); line-height: var(--leading-relaxed); }
  .pl-finder .lf-acts .btn { width: 100%; min-height: 48px; justify-content: center; }
}

/* 720px and under: the same bar, slimmer. The list's name and the search's
   placeholder give up their words before the switch or Find give up a pixel. */
@media (max-width: 720px) {
  .ld-bar { gap: 6px; }
  .ld-bar-lists { max-width: 9ch; overflow: hidden; text-overflow: ellipsis; }
}
```

- [ ] **Step 6: Check the four registrations, add none.** By this task everything is already listed, each by the task that created it, and `legacy-harness.test.mjs:64` has been holding the two lists equal in file order all along. Read them once and confirm, rather than adding a line twice: `manifest.ts` and `Chanlytics.html` carry `leads-scope.jsx` (Task 2), `leads-finder.jsx` (Task 8) and `leads-peek.jsx` (Task 12), in that order, after `client-profile.jsx`; `Chanlytics.html` and `legacy-bridge/legacy.css` both carry `styles/leads.css` after `people.css` (Task 8), and `legacy.css`'s head comment says "19 legacy stylesheets" (Task 8 changed the 18). **No `?v=` number is chosen in this task, or in any task but Task 22**, which assigns one number per edited file for the whole release.

- [ ] **Step 7: Run and see it pass.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-honest.test.mjs tooling/scripts/tests/legacy-harness.test.mjs tooling/scripts/tests/layout-measure.test.mjs` → PASS. `layout-measure.test.mjs` is the one that would refuse a page measure written as a literal; every width here is a token or a media query.

- [ ] **Step 8: The browser check (G4).** The harness cannot run CSS, so the grid areas and the 44px targets are proved in a browser, the way the people-table plan's step 5 was (`docs/plans/2026-09-18-people-table.md:2143`): copy that plan's visual harness from its scratchpad, point `R=` at this worktree's `apps/dashboard/src`, build contracts and the page, add a `leads-harness` entry to the session's `.claude/launch.json`, `preview_start` it, and open `/h/leads.html`. Record each measurement in the PR:
  - **375 x 812.** `.ld-bar` is one row; the switch, the list button, the search and Find all sit inside 375 and `documentElement.scrollWidth - clientWidth` is **0**. The first `.cl-table tbody tr` has its `top` inside the first screen with nothing above it but `.ld-bar` and `.lf-strip`. Its `.ld-call` `getBoundingClientRect()` is **44 x 44** or larger. An excluded row draws two lines, not three, and has no `.ld-phone-cell` box.
  - **720 and 800.** The cards hold; `.ld-bar` wraps nothing off-screen; `scrollWidth - clientWidth` is 0 at both.
  - **960.** Back to columns: `.cl-table thead` is displayed, `.ld-bar` is `display: none`, `.cl-controls` is displayed.
  - **1280.** `.pl-peek` is **408px** wide and `.pl-table-scroll` scrolls in its own box (`scrollWidth > clientWidth`).
  - **1440.** `.cl-controls` is one row: its `getBoundingClientRect().height` equals one control's height plus its padding, i.e. it has not wrapped.
  - **Dark.** With `?theme=dark`, `.lf-strip.ask`'s text over its accent tint measures at least 4.5:1 (read both computed colours and compute it), and the live dot is still visible.
  - **Keyboard only.** `F` opens the composer and focus lands in it; `Enter` makes the plan; `Tab` reaches every picker in the sentence; `Esc` backs out one layer per press; `J`/`K`/`Enter`/`C` work the rows; `Tab` from the cursor row reaches Keep, Exclude or Put back on that row.
  Reset the viewport and remove the launch entry afterwards.

- [ ] **Step 9: Mutation checks, each once.** Give `LeadFinderSheet` a `React.useEffect` and see "the finder's sheet … registers no listener of its own" fail on the hook count. Drop the `role="tab"` attributes from the bar and see the first phone test fail. In the browser, delete `.cl-table td.cl-actions-cell:has(.ld-row-actions)` and see the 44px Call disappear at 375.

- [ ] **Step 10:** Commit:

```bash
git commit -m "On a phone Leads is one bar and then the work: cards with a Call, a lead full screen, and Find from the bottom" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 19: the guardrails in the owner's words

**Files:** Modify `packages/contracts/src/leads.ts` (Task 4.1's file), `apps/dashboard/src/server/leads.ts:48` (A's `refusalOf`), `apps/dashboard/src/legacy-bridge/seed-globals.ts:11, :29, :75`, `apps/dashboard/src/legacy/pages/settings.jsx:16–19` · Tests `tooling/scripts/tests/leads-vm.test.mjs`, `tooling/scripts/tests/leads-honest.test.mjs`, `tooling/scripts/tests/consent-paths.test.mjs` (Task 7's)

**What this task is.** Every other task draws something. This one makes sure that what those screens say when the product cannot do what was asked is (a) a sentence, (b) said once, from contracts, (c) said where it happens, and (d) never a dollar amount and never the name of the source we buy from or the service that checks the mailboxes. It writes the endings' own sentences — the closed set of nine, from the States artboard — because those are the words every other ending-drawing task would otherwise each spell for itself.

### 19.1 Every guardrail, with its sentence and where it is said

| What the owner hits | The sentence | Where the words live | What draws it |
|---|---|---|---|
| The platform's switch is off, and a round ends | "Lead searches are paused for now · your leads are all here · nothing is being counted" | `leadEndingLine("paused", …)` | the strip (Task 10) |
| The platform's switch is off, and a start is refused | "Searching is paused for now. Nothing was started." | `refusalOf` `paused` (`server/leads.ts:50`) | under the plan card's button (Task 9) |
| The month's leads, before the round | "486 left this month" | `leadAllowanceFact(left)` | the plan card's facts (Task 9) |
| The month's leads, refused at the door | "This month covers 36 more leads. Ask for 36 or fewer, or wait for next month." / with none left, "This month's leads are used up. Nothing more counts until next month." | `refusalOf` `month_leads_used` | under the plan card's button; also what the 501st Qualified lead meets |
| The month's leads, mid-round | "Stopped at 464 · this month's leads are used · the 464 found are yours" | `leadEndingLine("month_leads_used", …)` | the strip |
| The searching budget, refused at the door | "This month's searching budget is used. A smaller search, or a phone standard, may still fit." | `refusalOf` `budget_used` | under the plan card's button |
| The searching budget, mid-round | "Stopped at 61 · this month's searching is used up · the 61 found are yours" | `leadEndingLine("budget_used", …)` | the strip |
| The day's cap | "Today's searching is at its cap. Try again tomorrow." | `refusalOf` `day_cap` | under the plan card's button |
| Outside the US | `LEAD_OUTSIDE_US_LINE` | contracts `leads.ts` | words under the composer's input, no card (Task 8) |
| People rather than businesses | `leadNotBusinessesLine(what)`, then two suggestions | contracts `leads.ts` | the composer, with the suggestions as chips |
| No card fits | `leadNoCardLine("Etsy shops")`; the route's fallback is `LEAD_NO_CARD_LINE` | contracts `leads.ts`, imported by `refusalOf` | the composer / under the button |
| Texts and WhatsApp on a lead | `LEAD_LOCKED_LINE` | contracts `leads.ts` | the peek's "How you can reach them" (Task 12) |
| A draft's foot | `LEAD_DRAFT_NOTE` | contracts `leads.ts` | the draft (Task 13) |
| No business address on file | `LEAD_NO_ADDRESS` | contracts `leads.ts` | the draft, before any model call (Task 13, 4.4) |
| A converted lead's yes | `LEAD_CONSENT_REFUSAL` | contracts `leads.ts`, and both doors raise it word for word (4.2 item 10) | the person's consent controls in People (Task 7) |
| An operator presses Find leads, Keep, Exclude or Put back | "Only an owner can find businesses for you." | `roleGate(role, "find")` → `PERM_DOING.find` (`refusal.ts:198–206`) | the control, through `window.gate` |
| An operator presses Export, Remove this search or Erase | `roleGate`'s sentence for `export` / `find` | `refusal.ts` | the control, through `window.gate` |
| Too many acts in a short time | "Too many lead searches in a short time — try again in a minute." and the other three nouns | `RATE` in `rate-limit.ts` (`lead_search`, `lead_answer`, `lead_member`, and B's `lead_draft`, `lead_suggest`) | the toast |
| The workspace may not spend | `whyCannotSpend`'s sentence, 402 | contracts `billing.ts:147` | under the plan card's button |
| Put back a hidden place | "This place is hidden: it is already a customer, or was erased." | `refusalOf` `hidden` | the row's toast (Task 11) |
| Put back a place outside the area | "This place is outside the area the search covers." | `refusalOf` `out_of_area` | the row's toast |
| Someone else changed it first | "Someone changed this since you saw it. Reload and try again." | `refusalOf` `changed` | the toast, after Undo (Task 10, 11, 15) |

**Two of these are other tasks' to finish.** `whyCannotSpend` still says "buying a number" on main (`billing.ts:149–155`), which is what a workspace with no card reads when it presses **Find 200 leads**; Task 4 step 3 adds `SpendWords` and `requireSpend(ctx, member, doing)` so it reads "Add a card before finding leads — nothing is charged until your trial ends." Task 4 also adds the `lead_draft` and `lead_suggest` rate nouns. This task's test refuses any lead-facing sentence that says "buying a number", which is what holds Task 4 to it.

### 19.2 The nine endings, said once

- [ ] **Step 1: The failing tests** (`leads-vm.test.mjs`; its imports gain `leadEndingLine`, `leadAllowanceFact`, `leadAnd`, `LEAD_PAUSED_TITLE`, `LEAD_NO_CARD_LINE`, `LEAD_OUTSIDE_US_LINE`, `leadNotBusinessesLine`, `leadNoCardLine`, `LEAD_WORDS` from `../../../packages/contracts/src/leads.ts`, `LEAD_ROUND_ENDINGS` and `LEAD_ENDING_WORDS` from `lead-search.ts`, `refusalOf` from `../../../apps/dashboard/src/server/leads.ts`, and `* as LEADSEARCH`, `* as LEADJUDGE`, `* as LEADS` for the sweep):

```js
/** What the source is bought through, and what checks the mailboxes: never on a screen, never in a word we export. */
const VENDOR = /apify|compass|bounce ?verify|crawler|scraper|google places|serpapi/i;
const MONEY = /\$\s?\d/;

const FACTS = {
  name: "personal trainers", area: "Austin", counted: 61, target: 200, emails: 88, phones: 72, excluded: 40,
  checking: false, foundBefore: 12, nearby: ["Round Rock", "Pflugerville"], seen: 86, leftOutBy: "part of chains",
};

test("every ending is one line: what happened, what was kept, what was counted, and at most one next step", () => {
  assert.equal(LEAD_ROUND_ENDINGS.length, 9);
  for (const ending of LEAD_ROUND_ENDINGS) {
    const line = leadEndingLine(ending, FACTS);
    assert.equal(line.mark, LEAD_ENDING_WORDS[ending], `${ending}: the ending's own word is the strip's name`);
    assert.ok(line.title.length > 0, `${ending}: a title`);
    const said = [line.title, ...line.parts, line.step ? line.step.label : ""].join(" ");
    assert.ok(!MONEY.test(said), `${ending} says a dollar amount: ${said}`);
    assert.ok(!VENDOR.test(said), `${ending} names the vendor: ${said}`);
    assert.ok(/\d/.test(said) || ending === "paused", `${ending}: a number the owner can check`);
  }
});

test("the endings read as the States artboard wrote them", () => {
  const line = (ending, over = {}) => leadEndingLine(ending, { ...FACTS, ...over });
  const said = (l) => [l.title, ...l.parts].join(" · ");
  assert.equal(said(line("target_reached", { counted: 200 })), "Found 200 personal trainers · 88 you can email · 72 by phone · 40 left out");
  assert.deepEqual(line("target_reached", { counted: 200 }).step, { id: "excluded", label: "40 left out" });
  assert.equal(said(line("searched_everything", { counted: 160 })), "Found 160 personal trainers · everything these searches returned in Austin");
  assert.deepEqual(line("searched_everything", { counted: 160 }).step, { id: "nearby", label: "Find 40 more nearby" });
  assert.equal(
    said(line("searched_everything", { counted: 0, seen: 3, area: "Marfa, TX", leftOutBy: "part of chains", nearby: ["Alpine", "Fort Davis"] })),
    "There are 3 personal trainers in Marfa, TX, and all of them are part of chains, which you asked me to leave out. · Nothing was counted.",
  );
  assert.equal(said(line("month_leads_used", { counted: 464 })), "Stopped at 464 · this month's leads are used · the 464 found are yours");
  assert.equal(said(line("budget_used")), "Stopped at 61 · this month's searching is used up · the 61 found are yours");
  assert.equal(said(line("few_new_matches", { name: "chiropractors", seen: 64 })), "All 64 chiropractors in Austin are already yours. · Look further out, in Round Rock and Pflugerville?");
  assert.equal(said(line("stopped", { checking: true })), "Stopping · checking the emails of the 61 found · nothing else was counted");
  assert.equal(said(line("stopped")), "Stopped at 61 · the 61 found are yours · nothing else was counted");
  assert.equal(said(line("source_failed")), "Stopped at 86: the source stopped answering · the 61 found are yours · nothing more was counted");
  assert.equal(said(line("question_unanswered")), "Stopped after a day without your answer · the 12 found before it asked are yours");
  assert.equal(said(line("paused")), "Lead searches are paused for now · your leads are all here · nothing is being counted");
  assert.equal(line("paused").step, null, "nothing to press: it is not this workspace's to turn on");
  assert.equal(LEAD_PAUSED_TITLE, "Lead searches are paused for now");
  assert.equal(leadAnd(["Alpine", "Fort Davis"]), "Alpine and Fort Davis");
  assert.equal(leadAnd(["Round Rock", "Pflugerville", "Kyle"]), "Round Rock, Pflugerville and Kyle");
});

test("the month's allowance and the searching budget are one unit on every screen: leads, never dollars", () => {
  assert.equal(leadAllowanceFact(486), "486 left this month");
  const budget = leadEndingLine("budget_used", FACTS);
  assert.ok(budget.parts.includes("this month's searching is used up"));
  assert.ok(!/\$|usd|dollar|budget of/i.test([budget.title, ...budget.parts].join(" ")));
  assert.ok(leadEndingLine("month_leads_used", FACTS).parts.includes("this month's leads are used"));
});

test("every refusal A's routes can give is a sentence the owner can act on, with no code, no dollar and no vendor", () => {
  const errors = [
    "state", "no_card", "paused", "month_leads_used", "budget_used", "day_cap", "hidden", "out_of_area",
    "changed", "not_found", "removed", "live", "nothing_to_add", "undone", "kind", "something_new",
  ];
  for (const error of errors) {
    for (const extra of [{}, { class: "qualified" }, { left: 36 }, { counted: 200 }]) {
      const refused = refusalOf({ error, ...extra });
      assert.ok(refused, `${error}: a refusal`);
      assert.ok([402, 403, 404, 409, 429].includes(refused.status), `${error}: ${refused.status}`);
      assert.match(refused.message, /[.?]$/, `${error}: a sentence, not a code`);
      assert.ok(!/_/.test(refused.message), `${error}: a word out of the database reached the owner: ${refused.message}`);
      assert.ok(!MONEY.test(refused.message) && !VENDOR.test(refused.message), `${error}: ${refused.message}`);
      assert.ok(!/buying a number/.test(refused.message), `${error}: the lines' words on a lead refusal`);
    }
  }
  assert.equal(refusalOf({ error: "paused" }).message, "Searching is paused for now. Nothing was started.");
  assert.equal(refusalOf({ error: "month_leads_used", left: 36 }).message, "This month covers 36 more leads. Ask for 36 or fewer, or wait for next month.");
  assert.equal(refusalOf({ error: "budget_used" }).message, "This month's searching budget is used. A smaller search, or a phone standard, may still fit.");
  assert.equal(refusalOf({ error: "day_cap" }).message, "Today's searching is at its cap. Try again tomorrow.");
  assert.equal(refusalOf({}), null, "a door that did not refuse says nothing");
});

test("the planner's three refusals are words, and the one about a card is spelled once", () => {
  assert.equal(LEAD_OUTSIDE_US_LINE.startsWith("I can only find businesses in the US for now."), true);
  assert.equal(
    leadNotBusinessesLine("a trainer"),
    "I find businesses, not people at home. People who want a trainer find you, and your receptionist answers them. Businesses whose clients need you next are a good start:",
  );
  assert.ok(leadNotBusinessesLine(null).includes("People who want what you do find you"));
  assert.equal(leadNoCardLine("Etsy shops"), "I can't search Etsy shops yet. I can find local businesses for now.");
  assert.equal(leadNoCardLine(null), LEAD_NO_CARD_LINE);
  assert.equal(refusalOf({ error: "no_card" }).message, LEAD_NO_CARD_LINE, "the route's fallback is the same one sentence");
});

test("no word any lead module exports holds a dollar amount or names the vendor", () => {
  const strings = (v, path, out) => {
    if (typeof v === "string") out.push([path, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`, out);
    return out;
  };
  const out = [];
  for (const [name, mod] of [["lead-search", LEADSEARCH], ["lead-judge", LEADJUDGE], ["leads", LEADS]]) {
    for (const [k, v] of Object.entries(mod)) if (typeof v !== "function") strings(v, `${name}.${k}`, out);
  }
  assert.ok(out.length > 100, `walked ${out.length} exported words`);
  for (const [where, s] of out) {
    assert.ok(!VENDOR.test(s), `${where} names the vendor: ${s}`);
    assert.ok(!MONEY.test(s), `${where} holds a dollar amount: ${s}`);
  }
});

test("the words the pages read are the contracts' own, in one record", () => {
  assert.equal(LEAD_WORDS.email.catch_all, "Unconfirmed");
  assert.equal(LEAD_WORDS.stage.converted, "Talking");
  assert.equal(LEAD_WORDS.ending.paused, "Paused for everyone");
  assert.equal(LEAD_WORDS.consentRefusal, "This person came from a lead you found. A yes has to come from them: their own message, or your yes page.");
  assert.equal(LEAD_WORDS.locked.startsWith("Wait for their yes."), true);
  assert.equal(LEAD_WORDS.paused, LEAD_PAUSED_TITLE);
  assert.equal(LEAD_WORDS.firstDay.foot, "Claude finds businesses, not people at home.");
});
```

and, in `leads-honest.test.mjs`, the walk over every state the harness can draw:

```js
test("no text the Leads scope says holds a dollar sign or names the vendor, in any state it can be in", () => {
  const VENDOR = /apify|compass|bounce ?verify|crawler|scraper|google places|serpapi/i;
  const states = [
    { what: "the first day", make: () => firstDay() },
    { what: "a running search", make: () => draw({ scope: "leads", leadsRoute: "clients/leads" }) },
    { what: "the question after 25", make: () => { wireSearch(SEARCH_WAITING); return draw({ scope: "leads", leadsRoute: "clients/leads" }); } },
    ...LEAD_ROUND_ENDINGS.map((ending) => ({ what: ending, make: () => { wireSearch(searchWith({ state: "ended", ending })); return draw({ scope: "leads", leadsRoute: "clients/leads" }); } })),
    { what: "the excluded view", make: () => draw({ scope: "leads", leadsRoute: "clients/leads:c-excluded" }) },
    { what: "an operator", make: () => { role.now = "operator"; const t = draw({ scope: "leads", leadsRoute: "clients/leads" }); role.now = "owner"; return t; } },
  ];
  for (const { what, make } of states) {
    const said = textOf(make());
    assert.ok(!/\$\s?\d/.test(said), `${what} says a dollar amount`);
    assert.ok(!VENDOR.test(said), `${what} names the vendor`);
  }
});

test("an operator sees every act they may not take with the reason on the control, and no act they may not take is hidden", () => {
  role.now = "operator";
  const t = draw({ scope: "leads", leadsRoute: "clients/leads:c-review" });
  for (const id of ["leads-find", "lead-keep", "lead-exclude", "leads-export"]) {
    const control = byTestId(t, id);
    assert.ok(control, `${id} is shown, not hidden`);
    assert.equal(control.props["aria-disabled"], true, id);
    assert.match(control.props["aria-description"], /^Only an owner can /, id);
    assert.equal(control.props.disabled, false, `${id}: never disabled + title, which no keyboard or finger reaches`);
  }
  role.now = "owner";
});
```

and, in `consent-paths.test.mjs` (Task 7's file), the sentence where it is actually said. **The person page has no consent control to pin**: `client-profile.jsx` on main draws the email, the lists, the notes and the timeline, and nothing that records a yes (`git grep 'data-testid="person-' apps/dashboard/src/legacy/pages/client-profile.jsx` lists twenty-four ids, none of them consent's). Release B adds none, which is the strongest form of the guarantee — there is no control on any page that could record a borrowed yes. What is pinned is that the one refusal sentence is contracts' and is what every door and every route says:

```js
test("the converted lead's refusal is one sentence, contracts', and it is what the routes carry back", async () => {
  assert.equal(LEAD_WORDS.consentRefusal, LEAD_CONSENT_REFUSAL);
  // The four routes' own case is the ACCEPTANCE test above: each answers exactly this string.
  for (const said of REFUSALS_SEEN) assert.equal(said, LEAD_CONSENT_REFUSAL);
  assert.equal(REFUSALS_SEEN.length, 5, "four consent routes and the desk's own-message door");
});
```

(`REFUSALS_SEEN` is the array the ACCEPTANCE test above fills as it walks its five cases; this test runs after it in the same file.)

- [ ] **Step 2: Run them and see them fail.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-vm.test.mjs` → `SyntaxError: … does not provide an export named 'leadEndingLine'`.

- [ ] **Step 3: The words.** `packages/contracts/src/leads.ts` gains, after `LEAD_CONSENT_REFUSAL`:

```ts
export const LEAD_NO_CARD_LINE = "I can find local businesses for now.";
export const LEAD_OUTSIDE_US_LINE =
  "I can only find businesses in the US for now. The rules for emailing businesses in Canada, the UK and the EU are different, and Chanlytics follows the US ones.";
/** The planner's second refusal (§8.8): what the workspace sells, in the owner's own words, or "what you do". */
export function leadNotBusinessesLine(want: string | null): string {
  return `I find businesses, not people at home. People who want ${want && want.trim() ? want.trim() : "what you do"} find you, and your receptionist answers them. Businesses whose clients need you next are a good start:`;
}
/** The third: what was asked for, named, and what the one card can do. The ask is logged as demand (§0.3). */
export function leadNoCardLine(what: string | null): string {
  return what && what.trim() ? `I can't search ${what.trim()} yet. ${LEAD_NO_CARD_LINE}` : LEAD_NO_CARD_LINE;
}

/** The platform's switch, in the owner's words: nothing about a vendor, nothing about money. */
export const LEAD_PAUSED_TITLE = "Lead searches are paused for now";

export interface LeadEndingFacts {
  /** The plan's subject in the owner's words: "personal trainers". */
  name: string;
  /** Where it looked, in the owner's words: "Austin". */
  area: string;
  counted: number;
  target: number;
  emails: number;
  phones: number;
  excluded: number;
  /** A stopped round whose emails are still being checked (S12). */
  checking: boolean;
  /** question_unanswered: how many were counted before it asked. */
  foundBefore: number;
  /** few_new_matches / searched_everything: where to look next, in the owner's words. */
  nearby: string[];
  /** How many places the source returned at all, and what left them all out. */
  seen: number;
  leftOutBy: string | null;
}

export interface LeadEndingLine {
  /** A's word for the ending; the strip's accessible name, never its sentence. */
  mark: string;
  title: string;
  parts: string[];
  step: { id: string; label: string } | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Alpine and Fort Davis"; "Round Rock, Pflugerville and Kyle". */
export function leadAnd(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Every ending, said once (§8.8, the States artboard): what happened, what was
 * kept, what was counted, and one next step. Two shapes only -- "Found N ..."
 * when the round delivered what it was for, "Stopped ..." when it did not --
 * because an owner reads the first word and must know which of the two this is.
 * LEAD_ENDING_WORDS stays A's short name for the ending and rides along as
 * `mark`, for the strip's accessible name and the kept-search menu.
 *
 * No dollar amount: the month's allowance and the searching budget are both
 * spoken as leads (§0.2), and no line here names what any of it is bought from.
 */
export function leadEndingLine(ending: LeadRoundEnding, f: LeadEndingFacts): LeadEndingLine {
  const mark = LEAD_ENDING_WORDS[ending];
  const yours = `the ${f.counted} found are yours`;
  const one = f.name.replace(/s$/, "");
  switch (ending) {
    case "target_reached":
      return {
        mark,
        title: `Found ${f.counted} ${f.name}`,
        parts: [`${f.emails} you can email`, `${f.phones} by phone`, `${f.excluded} left out`],
        step: f.excluded > 0 ? { id: "excluded", label: `${f.excluded} left out` } : { id: "sort_fit", label: "Sort by fit" },
      };
    case "searched_everything":
      if (f.counted === 0) {
        return {
          mark,
          title: `There are ${plural(f.seen, one, f.name)} in ${f.area}, and ${f.seen === 1 ? "it is" : "all of them are"} ${f.leftOutBy ?? "outside what you asked for"}, which you asked me to leave out.`,
          parts: ["Nothing was counted."],
          step: f.nearby.length ? { id: "nearby", label: `Look in ${leadAnd(f.nearby)}` } : null,
        };
      }
      return {
        mark,
        title: `Found ${f.counted} ${f.name}`,
        parts: [`everything these searches returned in ${f.area}`],
        step: { id: "nearby", label: `Find ${Math.max(0, f.target - f.counted)} more nearby` },
      };
    case "month_leads_used":
      return { mark, title: `Stopped at ${f.counted}`, parts: ["this month's leads are used", yours], step: null };
    case "budget_used":
      return { mark, title: `Stopped at ${f.counted}`, parts: ["this month's searching is used up", yours], step: null };
    case "few_new_matches":
      return {
        mark,
        title: `All ${plural(f.seen, one, f.name)} in ${f.area} are already yours.`,
        parts: f.nearby.length ? [`Look further out, in ${leadAnd(f.nearby)}?`] : [],
        step: f.nearby.length ? { id: "look_further", label: "Look further out" } : null,
      };
    case "stopped":
      return f.checking
        ? { mark, title: "Stopping", parts: [`checking the emails of the ${f.counted} found`, "nothing else was counted"], step: null }
        : { mark, title: `Stopped at ${f.counted}`, parts: [yours, "nothing else was counted"], step: { id: "carry_on", label: "Carry on" } };
    case "source_failed":
      return { mark, title: `Stopped at ${f.seen}: the source stopped answering`, parts: [yours, "nothing more was counted"], step: { id: "try_again", label: "Try again" } };
    case "question_unanswered":
      return { mark, title: "Stopped after a day without your answer", parts: [`the ${f.foundBefore} found before it asked are yours`], step: { id: "answer_now", label: "Answer now" } };
    case "paused":
      return { mark, title: LEAD_PAUSED_TITLE, parts: ["your leads are all here", "nothing is being counted"], step: null };
  }
}

/** The plan card's and the strip's one unit: leads, never dollars (§0.2). */
export function leadAllowanceFact(left: number): string {
  return `${left} left this month`;
}

/*
 * The facts' own words join the one record Task 12 declared (`LEAD_WORDS`,
 * seeded onto the window by `seed-globals.ts` as `__LEAD_WORDS`). There is no
 * second record: the legacy pages are classic scripts and cannot import, so
 * without this each page would spell the words again -- and a word spelled
 * twice is a word that drifts. Nothing here holds a dollar amount or names the
 * source we buy from.
 *
 * old: `export const LEAD_WORDS = {` then `  close: "Close",`  (Task 12)
 * new: the same opening line, then these fifteen keys, then `  close: "Close",`
 */
export const LEAD_WORDS = {
  stage: LEAD_STAGE_WORDS,
  closed: LEAD_CLOSED_WORDS,
  fit: LEAD_FIT_WORDS,
  email: LEAD_EMAIL_WORDS,
  outcome: LEAD_CALL_OUTCOME_WORDS,
  ending: LEAD_ENDING_WORDS,
  locked: LEAD_LOCKED_LINE,
  draftNote: LEAD_DRAFT_NOTE,
  noAddress: LEAD_NO_ADDRESS,
  consentRefusal: LEAD_CONSENT_REFUSAL,
  paused: LEAD_PAUSED_TITLE,
  noCard: LEAD_NO_CARD_LINE,
  outsideUs: LEAD_OUTSIDE_US_LINE,
  suggestUnavailable: LEAD_SUGGEST_UNAVAILABLE,
  firstDay: { title: LEAD_FIRST_DAY_TITLE, sub: LEAD_FIRST_DAY_SUB, foot: LEAD_FIRST_DAY_FOOT },
  close: "Close",
  // … Task 12's keys carry on unchanged, to `copiedDraft`.
} as const;
```

`leads.ts`'s import from `./lead-search` gains `LEAD_ENDING_WORDS` and `type LeadRoundEnding`. The record is one object: Task 12 wrote the markup's words into it, Task 19 writes the facts' words, Task 17 adds `firstDay` and `suggestUnavailable`, and `leads-vm.test.mjs`'s "the words the pages read are the contracts' own, in one record" test reads both halves.

- [ ] **Step 4: One spelling for the card sentence.** `apps/dashboard/src/server/leads.ts` — its import gains `LEAD_NO_CARD_LINE` from `@chanlytics/contracts`, and its `no_card` branch (`:48`) changes:

  old: `      return new AppError("conflict", a.sentence ?? "I can find local businesses for now.", 409);`
  new: `      return new AppError("conflict", a.sentence ?? LEAD_NO_CARD_LINE, 409);`

- [ ] **Step 5: `leadStrip` composes, it does not spell.** Task 4.6's `leadStrip(s, now)` builds its `title`, `parts` and its first action from `leadEndingLine(s.round.ending, facts)` for an ended round, and Task 10's ending table is that function's output — neither spells an ending sentence of its own. 4.6's illustrative assertion `vm.title.startsWith(LEAD_ENDING_WORDS[ending].split(" ")[0])` is replaced by `assert.equal(vm.title, leadEndingLine(ending, facts).title)`: the PRD's own words for `searched_everything` open with "Found", not "Searched", and `month_leads_used` mid-round opens with "Stopped", not "This", so the old assertion could not have held.

- [ ] **Step 6: The record is already seeded; the last derivation joins the bag.** `window.__LEAD_WORDS` is seeded by Task 12 step 8 and `window.__leadWays` beside it by Task 17 step 6. This task owns the endings' words inside that one record, and adds the last function to `__LEAD_VM`: `seed-globals.ts`'s import gains `leadEndingLine`, and

  old: `… leadPlanFacts, leadPlanAsk, leadStrip };`
  new: `… leadPlanFacts, leadPlanAsk, leadStrip, leadEndingLine };`

  with `leadEndingLine?:` in the `declare global` block becoming `leadEndingLine:`, so nothing the pages read from the window is optional once the release has landed.

- [ ] **Step 7: The mockup's own role table gains `find`.** `settings.jsx:16–19` — `ST_PERMS` is `window.ROLE_PERMS || { … }`, and the literal is the standalone mockup's fallback. It has seven permissions; contracts has eight. In the app `canDo("find")` reads the bridge's table and is right; in the mockup every role would be refused, and two hand-kept copies is the defect the comment above it already names.

  old: `  owner:    { approve: true,  autonomy: true,  disconnect: true,  billing: true,  team: true,  settings: true,  export: true },`
  new: `  owner:    { approve: true,  autonomy: true,  disconnect: true,  billing: true,  team: true,  settings: true,  export: true,  find: true },`

  old: `  operator: { approve: true,  autonomy: true,  disconnect: false, billing: false, team: false, settings: false, export: false },`
  new: `  operator: { approve: true,  autonomy: true,  disconnect: false, billing: false, team: false, settings: false, export: false, find: false },`

  old: `  viewer:   { approve: false, autonomy: false, disconnect: false, billing: false, team: false, settings: false, export: false },`
  new: `  viewer:   { approve: false, autonomy: false, disconnect: false, billing: false, team: false, settings: false, export: false, find: false },`

- [ ] **Step 8: Mutation checks, each once.** Put `"nothing is being counted for $0"` in `paused`'s parts and see both ending tests fail. Change `refusalOf`'s `no_card` fallback to "No card fits." and see "the planner's three refusals" fail. Add `"apify"` to any exported array in `leads.ts` and see the sweep fail with its path.

- [ ] **Step 9:** Run `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-vm.test.mjs tooling/scripts/tests/leads-honest.test.mjs tooling/scripts/tests/consent-paths.test.mjs tooling/scripts/tests/gate-reason.test.mjs tooling/scripts/tests/settings-honest.test.mjs` → PASS. Rebuild the contracts dist. Commit:

```bash
git commit -m "Every no the lead finder can give is one sentence, said where it happens, in leads rather than dollars" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 20: the retired seeded `leads.jsx`, and every reader on main (written in full)

**Files:** Delete `apps/dashboard/src/legacy/pages/leads.jsx` · Modify `apps/dashboard/src/legacy-bridge/manifest.ts:61`, `apps/dashboard/src/legacy/Chanlytics.html:95`, `apps/dashboard/src/legacy/styles/people.css:637–650`, and the thirteen readers in the table below · Tests `tooling/scripts/tests/legacy-harness.test.mjs`, `calendar-people.test.mjs:506`, `surface-registry.test.mjs:261`, `e2e/people.spec.ts:150`

- [ ] **Step 1: The failing test.** Before deleting anything, add to `legacy-harness.test.mjs` the assertion that the seeded page is gone from both lists and from the page's own tree:

```js
test("the seeded leads page is retired: no file, no script tag, no import, and nothing renders it", () => {
  assert.equal(existsSync(path("apps/dashboard/src/legacy/pages/leads.jsx")), false);
  assert.equal(manifest.includes("pages/leads.jsx"), false);
  assert.equal(html.includes("pages/leads.jsx"), false);
  assert.equal(/\bLeadsPage\b/.test(shell), false, "app-shell draws no LeadsPage");
});
```

- [ ] **Step 2: Run it and see it fail.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/legacy-harness.test.mjs` → fails on the first assertion (`expected true to equal false`), because the file is still there.

- [ ] **Step 3: Delete it, and answer every reader.** `apps/dashboard/src/legacy/pages/leads.jsx` (592 lines; `LeadsPage` :387, `window.LeadsPage` :591) is deleted, its line removed from `manifest.ts:61` (and "leads" from the comment above it, :57–60) and from `Chanlytics.html:95` (`leads.jsx?v=17`). Its readers on main, from a grep of `LeadsPage`, `window.LEADS`, `LEAD_STAGES`, `LEAD_SOURCES`, `LEADS_AGGREGATES`, `"leads"` and `leads/`, and what each becomes:

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

A render of `LeadsPage` anywhere is replaced by `navigate("clients/leads")`; a link to `leads` or `leads/…` points at `clients/leads`; demo seeds that nothing renders any more go with their readers; seeds another demo page still draws stay (they are the demo's).

- [ ] **Step 4: Run and see them pass.** `grep -rn "LeadsPage\|leads/\|\"leads\"" apps/dashboard/src/legacy` lists only the demo-only readers above and the redirect — read the list, do not skim it. Then `node --conditions=react-server --import tsx --test tooling/scripts/tests/legacy-harness.test.mjs calendar-people.test.mjs surface-registry.test.mjs people-honest.test.mjs person-honest.test.mjs` → PASS (`calendar-people.test.mjs:506`'s value is `leads: "clients/leads",` from Task 3; `surface-registry.test.mjs:261` is unchanged), and `corepack pnpm exec playwright test e2e/people.spec.ts --list` still lists its tests.

- [ ] **Step 5: Commit** — "The seeded Leads page is retired, and every reader of it points at the scope of People that replaced it". Its commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as every commit in this plan does.

## Task 21: the nightly e2e

**Files:** Modify `tooling/scripts/e2e-workspace.mjs` (beside `PEOPLE`, `:66`; `snapshot`'s table list, `:150`; `converge`, `:168`; `verify`, `:353`), `tooling/scripts/tests/e2e-workspace.test.mjs` (its `world()`, and two tests of its own), `e2e/signals.ts`, `e2e/people.spec.ts:150–154` · Create `e2e/leads.spec.ts` · `.github/workflows/nightly-e2e.yml` unchanged (`E2E_PAID_LEADS` is not set there)

**What the nightly proves, and what it cannot.** It runs against production (`playwright.config.ts`: `E2E_BASE_URL` defaults to `https://app.chanlytics.com`) as the seeded workspace's owner (`nightly-e2e.yml:43–44`), after `node tooling/scripts/e2e-workspace.mjs --apply` has put that workspace in its known state (`:78–83`). It proves the seeded state on the page: the scope, the rail, the strip's ending, the peek's two groups, Not a fit and Undo, Put back and Undo, Keep and Undo, the old bookmark, the keys and the phone. It cannot prove a search for free: a real one spends on the source and the judge. Decision 30 lists the test workspace in `lead_platform.tenants_on`, so a real search **can** run there while the switch is off for everyone else; it runs only behind **`E2E_PAID_LEADS=1`**, modelled on `E2E_PAID_MODEL` (`e2e/ask.spec.ts:16–19`), which the nightly does not set. The two paid tests skip with a stated reason and count toward the skip ceiling (`e2e/skip-ceiling.ts:26`, `E2E_MAX_SKIPS` default 8): Ask's five paid skips and these two make seven, so the ceiling holds; a third paid lead test raises `E2E_MAX_SKIPS` in the workflow first.

**One thing the sketch got wrong, and where it moved.** The sketch said release A's migration seeds `tenants_on` from `SLUG`. It does not: `00140:61` gives `tenants_on` a default of `'{}'` and the only row inserted is `lead_platform (id)` (`:66`). So **the seed writes it**, which is the right owner anyway — the script already holds the service role and already puts this workspace in its known state. The write is additive (the workspace is appended to whatever is there) and never touches `searches_on`, and `verify()` reads both back.

- [ ] **Step 1: The failing tests**, in `tooling/scripts/tests/e2e-workspace.test.mjs`. Its import gains `LEADS, LEAD_SEARCH, LEAD_COUNTED`, and `world()`'s tables gain the platform's one row, because every database release A touched has it:

  old: `  const t = { tenants: [], memberships: [], ...tables };`
  new:
```js
  // The platform's one row exists on every database release A touched; the seed
  // adds this workspace to tenants_on and must never flip searches_on.
  const t = { tenants: [], memberships: [], lead_platform: [{ id: true, searches_on: false, tenants_on: [] }], ...tables };
```

```js
test("the lead seed is six fictional places in one finished search, and the workspace may search while the switch is off", async () => {
  const w = world();
  await run(w);
  const T = w.t.tenants[0].id;
  assert.deepEqual(w.t.leads.map((l) => l.business_name).sort(), LEADS.map((l) => l.business_name).sort());
  for (const l of w.t.leads) {
    assert.match(l.phone_e164, /^\+1\d{3}55501\d{2}$/, `${l.business_name}: the fiction range`);
    if (l.email) assert.match(l.email, /\.example$/, `${l.business_name}: a fictional address`);
    assert.match(l.place_id, /^ChIJfixture\d{4}$/);
  }
  assert.equal(w.t.lead_searches.length, 1);
  assert.equal(w.t.lead_searches[0].name, LEAD_SEARCH.name);
  const [round] = w.t.lead_rounds;
  assert.deepEqual([round.state, round.ending, round.seq], ["ended", "target_reached", 1], "written queued, then ended: lead_rounds_guard refuses an ended insert");
  assert.deepEqual(
    w.t.lead_search_members.map((m) => [m.class, m.counted]).sort(),
    [["excluded", false], ["qualified", true], ["qualified", true], ["qualified", true], ["review", false], ["review", false]].sort(),
  );
  assert.equal(w.t.lead_counters.find((c) => c.kind === "allowance").used, LEAD_COUNTED);
  const platform = w.t.lead_platform[0];
  assert.deepEqual(platform.tenants_on, [T], "listed, so a paid run may start one here");
  assert.equal(platform.searches_on, false, "and the switch every other workspace reads is untouched");
  await converge(w.db, { ownerEmail: OWNER, memberEmail: MATE, apply: true, now: NOW });
  assert.equal(w.t.lead_searches.length, 1);
  assert.equal(w.t.leads.length, LEADS.length);
  assert.deepEqual(w.t.lead_platform[0].tenants_on, [T]);
});

test("verify() names a drifted lead seed before any spec reads it", async () => {
  const w = world();
  await run(w);
  const T = w.t.tenants[0].id;
  const ownerId = w.t.memberships.find((m) => m.role === "owner").user_id;
  assert.deepEqual(await verify(w.db, T, ownerId), []);
  w.t.leads[0].business_name = "A Real Gym On A Real Street";
  w.t.leads[0].email = "hello@arealgym.com";
  w.t.leads[0].place_id = "ChIJreal0001";
  const problems = await verify(w.db, T, ownerId);
  assert.ok(problems.some((p) => p.includes("not the 6 fixtures")), problems.join("; "));
  assert.ok(problems.some((p) => p.includes("not fictional")), problems.join("; "));
});
```

- [ ] **Step 2: Run them and see them fail.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/e2e-workspace.test.mjs` → `SyntaxError: The requested module '../e2e-workspace.mjs' does not provide an export named 'LEADS'`.

- [ ] **Step 3: The seed's rows.** `e2e-workspace.mjs`, after `PEOPLE` (`:66`). Every column is 00140's own (`leads` has `region`, not `state`; `phone_e164`, not `phone`; `website_host`, not `website`; and no `version` column — the version that Undo guards lives on `lead_search_members`):

```js
/**
 * One finished search and six leads, in every class and stage e2e/leads.spec.ts
 * reads. Nothing here is a real business: `.example` hosts, 555-01xx numbers,
 * ChIJfixture place ids. The search's phones sit in a different exchange from
 * the people above, so 00140's contacts_link_lead trigger never links one to a
 * seeded person.
 */
export const LEAD_SEARCH = { name: "Personal trainers · Austin", asked: "personal trainers in Austin with a website, then find their email", via: "people", card: "local_businesses" };
export const LEAD_PLAN = {
  version: 1, card: "local_businesses", name: LEAD_SEARCH.name, asked: LEAD_SEARCH.asked, terms: ["personal trainer"],
  area: { kind: "city", label: "Austin, TX", region: "TX", center: { lat: 30.2672, lng: -97.7431 }, radius_m: 15000, query: "Austin, TX" },
  count: 6, contact: "email",
  criteria: [
    { key: "independent", text: "independent, not a chain", standard: "likely", required: true },
    { key: "website", text: "has a website", standard: "seen", required: true },
  ],
  exclusions: [{ key: "chain", text: "chain gyms", origin: "claude" }],
};
/** The round the specs read: one probe that reached what it was asked for. */
export const LEAD_ROUND = { seq: 1, purpose: "probe", ending: "target_reached", target: 6, plan_version: 1, cost_usd: "0.1800", judge_tokens: 2400 };
export const LEADS = [
  { place_id: "ChIJfixture0001", business_name: "Zilker Strength Lab", category: "Personal trainer", city: "Austin", region: "TX", street: "1200 Barton Springs Rd", phone_e164: "+15125550101", email: "hello@zilkerstrength.example", email_state: "ok", website_host: "zilkerstrength.example", rating: "5.0", reviews: 16, stage: "ready", member: { class: "qualified", fit: "strong", reason: "Independent coaching, 5.0 from 16 reviews", counted: true } },
  { place_id: "ChIJfixture0002", business_name: "Travis Heights Coaching Co.", category: "Personal trainer", city: "Austin", region: "TX", street: "1500 S Congress Ave", phone_e164: "+15125550102", email: "hello@travisheightscoaching.example", email_state: "ok", website_host: "travisheightscoaching.example", rating: "4.9", reviews: 88, stage: "ready", member: { class: "qualified", fit: "strong", reason: "Independent, one location, 88 reviews", counted: true } },
  { place_id: "ChIJfixture0003", business_name: "Mueller Movement Studio", category: "Personal trainer", city: "Austin", region: "TX", street: "1900 Aldrich St", phone_e164: "+15125550103", email: "info@muellermovement.example", email_state: "catch_all", website_host: "muellermovement.example", rating: "4.7", reviews: 40, stage: "ready", member: { class: "review", fit: null, reason: "Couldn't confirm the email", counted: false } },
  { place_id: "ChIJfixture0004", business_name: "East Side Kettlebell", category: "Personal trainer", city: "Austin", region: "TX", street: "2200 E 7th St", phone_e164: "+15125550104", email: null, email_state: "none", website_host: null, rating: "4.8", reviews: 22, stage: "ready", member: { class: "review", fit: null, reason: "No email to check; a phone only", counted: false } },
  { place_id: "ChIJfixture0005", business_name: "FitCorp Austin Central", category: "Gym", city: "Austin", region: "TX", street: "500 W 6th St", phone_e164: "+15125550105", email: null, email_state: "none", website_host: "fitcorp.example", rating: "4.1", reviews: 900, stage: "ready", member: { class: "excluded", excluded_by: "chain", fit: null, reason: "A chain gym", counted: false } },
  { place_id: "ChIJfixture0006", business_name: "Hyde Park Personal Training", category: "Personal trainer", city: "Austin", region: "TX", street: "4300 Speedway", phone_e164: "+15125550106", email: "hi@hydeparkpt.example", email_state: "ok", website_host: "hydeparkpt.example", rating: "4.9", reviews: 31, stage: "nurture", member: { class: "qualified", fit: "look", reason: "Independent; one review mentions a waitlist", counted: true } },
];
/** What the three counted leads used of the month's allowance. */
export const LEAD_COUNTED = LEADS.filter((l) => l.member.counted).length;
```

The file's import (`:53`) gains `leadMonth` from `@chanlytics/contracts`, which is how the counters' period is written in the workspace's own zone.

- [ ] **Step 4: `converge` writes them, and the backup takes them first.** `snapshot`'s table list (`:150`) gains the lead tables, so the JSONL backup holds them before anything is deleted:

  old: `      "conversations", "messages", "calls", "escalations", "jobs", "broadcasts", "segments", "ask_threads", "invitations"]) {`
  new:
```js
      "conversations", "messages", "calls", "escalations", "jobs", "broadcasts", "segments", "ask_threads", "invitations",
      "lead_searches", "lead_rounds", "leads", "lead_search_members", "lead_counters", "lead_operations"]) {
```

`converge` calls `convergeLeads` just before it verifies:

  old: `  const problems = await verify(db, T, ownerId);`
  new:
```js
  await convergeLeads(db, T, ownerId, now);

  const problems = await verify(db, T, ownerId);
```

and `convergeLeads` goes immediately above `verify`:

```js
/**
 * The lead finder's seed: one finished search, six leads, their memberships and
 * the month's counters, deleted and written again every run so the specs read
 * one state. The workspace is listed in `lead_platform.tenants_on` (decision
 * 30) so a paid run may start a real search here while the switch stays off for
 * everyone else -- the list is added to, never replaced, and `searches_on` is
 * never touched.
 *
 * A round may not be inserted ended (00140's lead_rounds_guard: a round starts
 * queued), so it is written queued and then ended in one update, which is the
 * transition the guard allows.
 */
async function convergeLeads(db, T, ownerId, now) {
  const stamp = new Date(now).toISOString();
  const month = leadMonth(TIMEZONE, new Date(now));
  const day = new Date(now).toLocaleDateString("en-CA", { timeZone: TIMEZONE });

  const platform = must("reading the platform switch", await db.from("lead_platform").select("searches_on, tenants_on").eq("id", true).maybeSingle());
  if (!platform) throw new Error("lead_platform has no row: release A's migration is not on this database");
  if (!(platform.tenants_on ?? []).includes(T)) {
    must("listing the workspace as one that may search", await db.from("lead_platform").update({ tenants_on: [...(platform.tenants_on ?? []), T] }).eq("id", true));
  }

  const old = must("reading the searches", await db.from("lead_searches").select("id").eq("tenant_id", T));
  await deleteWhere(db, "lead_searches", "id", old.map((s) => s.id), "clearing searches");
  must("clearing lead operations", await db.from("lead_operations").delete().eq("tenant_id", T));
  must("clearing leads", await db.from("leads").delete().eq("tenant_id", T));
  must("clearing the lead counters", await db.from("lead_counters").delete().eq("tenant_id", T));

  const search = must("the search", await db.from("lead_searches").insert({
    tenant_id: T, created_by: ownerId, via: LEAD_SEARCH.via, card: LEAD_SEARCH.card,
    name: LEAD_SEARCH.name, asked: LEAD_SEARCH.asked, plan: LEAD_PLAN, created_at: stamp,
  }).select("id").single());

  const round = must("the round", await db.from("lead_rounds").insert({
    tenant_id: T, search_id: search.id, seq: LEAD_ROUND.seq, purpose: LEAD_ROUND.purpose, plan: LEAD_PLAN,
    plan_version: LEAD_ROUND.plan_version, target: LEAD_ROUND.target, state: "queued",
    allowance_reserved: 0, allowance_used: LEAD_COUNTED, cost_reserved_usd: 0, cost_usd: LEAD_ROUND.cost_usd,
    judge_tokens: LEAD_ROUND.judge_tokens, judge_model: "seed", month, day, platform_day: new Date(now).toISOString().slice(0, 10),
    started_at: stamp, created_at: stamp,
  }).select("id").single());
  must("ending the round", await db.from("lead_rounds").update({ state: "ended", ending: LEAD_ROUND.ending, ended_at: stamp }).eq("id", round.id));

  for (const lead of LEADS) {
    const row = must("a lead", await db.from("leads").insert({
      tenant_id: T, place_id: lead.place_id, business_name: lead.business_name, category: lead.category,
      street: lead.street, city: lead.city, region: lead.region, country: "US",
      website_host: lead.website_host, phone_e164: lead.phone_e164, phone_sources: lead.website_host ? 2 : 1,
      email: lead.email, email_state: lead.email_state, email_checked_at: lead.email_state === "none" ? null : stamp,
      rating: lead.rating, reviews: lead.reviews, stage: lead.stage, found_at: stamp,
    }).select("id").single());
    must("a membership", await db.from("lead_search_members").insert({
      search_id: search.id, lead_id: row.id, round_id: round.id, tenant_id: T,
      judgment: { shares: [] }, class: lead.member.class, excluded_by: lead.member.excluded_by ?? null,
      fit: lead.member.fit, reason: lead.member.reason, counted: lead.member.counted,
      counted_month: lead.member.counted ? month : null, created_at: stamp,
    }));
  }

  must("the month's counters", await db.from("lead_counters").insert([
    { tenant_id: T, kind: "allowance", period: month, used: LEAD_COUNTED, reserved: 0 },
    { tenant_id: T, kind: "budget", period: month, used: LEAD_ROUND.cost_usd, reserved: 0 },
  ]));
}
```

and `verify` gains, immediately before its `const alerts = cfg?.config?.notifications;`:

```js
  // The state e2e/leads.spec.ts reads. Not a stage or a class: the specs change
  // those and undo them, and a spec that failed halfway leaves one moved. What
  // must hold is that this workspace's leads ARE the six fixtures, that none of
  // them is a real business, and that the workspace may search.
  const leads = await read("the leads", db.from("leads").select("place_id, business_name, email, phone_e164, website_host").eq("tenant_id", T));
  const wanted = LEADS.map((l) => l.place_id).sort();
  if (JSON.stringify(leads.map((l) => l.place_id).sort()) !== JSON.stringify(wanted)) problems.push(`the workspace's leads are not the ${LEADS.length} fixtures`);
  for (const l of leads) {
    if (l.email && !/@[\w.-]+\.example$/.test(l.email)) problems.push(`a lead's address is not fictional: ${l.email}`);
    if (l.website_host && !/\.example$/.test(l.website_host)) problems.push(`a lead's site is not fictional: ${l.website_host}`);
    if (l.phone_e164 && !/^\+1\d{3}55501\d{2}$/.test(l.phone_e164)) problems.push(`a lead's number is outside the fiction range: ${l.phone_e164}`);
  }
  const searches = await read("the searches", db.from("lead_searches").select("id, name, removed_at").eq("tenant_id", T));
  if (searches.length !== 1 || searches[0].name !== LEAD_SEARCH.name || searches[0].removed_at) problems.push("the workspace should hold exactly one kept search, the seeded one");
  const platform = await read("the platform switch", db.from("lead_platform").select("tenants_on").eq("id", true).maybeSingle());
  if (!(platform?.tenants_on ?? []).includes(T)) problems.push("the workspace is not listed in lead_platform.tenants_on, so a paid lead run could not start");
```

- [ ] **Step 5: Run and see it pass.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/e2e-workspace.test.mjs` → `# tests 11 / # pass 11 / # fail 0`.

- [ ] **Step 6: `signals.ts`.** The checks the spec reads, in the file's own style — "reached" means in the viewport, not in the DOM. Appended to `e2e/signals.ts`:

```ts
/* ------------------------------------------------------- Leads (release B) */

/**
 * The Leads scope, as an owner sees it: the People | Leads switch with Leads
 * chosen, the one standing line, and the strongest fit at the top of the table.
 * "Reached" means in the viewport here too -- a standing line below the fold
 * says nothing about whether the owner can see what the search found.
 */
export async function expectLeadsScope(page: Page, want: { standing: string; first: string }): Promise<void> {
  const tabs = page.getByRole("tablist", { name: "Which people" });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("tab", { name: "Leads" })).toHaveAttribute("aria-selected", "true");
  const standing = page.getByTestId("leads-standing");
  await expect(standing).toBeInViewport({ ratio: 1 });
  await expect(standing).toContainText(want.standing);
  await expect(page.locator(".cl-table tbody tr").first()).toContainText(want.first);
}

/** The strip says how the round ended, in words, where the owner can read them. */
export async function expectStripEnding(page: Page, words: string): Promise<void> {
  const strip = page.getByTestId("lead-strip");
  await expect(strip).toBeInViewport({ ratio: 1 });
  await expect(strip).toContainText(words);
  expect(await strip.innerText(), "a strip never says a dollar amount").not.toMatch(/\$\d/);
}

/**
 * The peek's two groups, and the rule that makes them worth having: nothing
 * Claude READ wears the same mark as something the product SAW. The defect this
 * guards is a page that ticks "independent" as confidently as "open on Maps".
 */
export async function expectPeekSeenVersusRead(page: Page): Promise<void> {
  const peek = page.getByTestId("lead-peek");
  await expect(peek).toBeVisible();
  await expect(peek.getByTestId("peek-checks-seen")).toContainText("Seen");
  await expect(peek.getByTestId("peek-checks-read")).toContainText("Claude's read");
  expect(
    await peek.getByTestId("peek-checks-read").locator(".ld-check-mark.seen").count(),
    "a check Claude read wears the mark of one the product saw",
  ).toBe(0);
}

/** A row put back by Undo is the row that was there, word for word. */
export async function expectRowUnchangedAfterUndo(page: Page, name: string, before: string): Promise<void> {
  const row = page.locator(".cl-table tbody tr", { hasText: name });
  await expect(row).toHaveCount(1);
  await expect.poll(async () => (await row.innerText()).trim(), { message: `${name} came back changed` }).toBe(before.trim());
}
```

- [ ] **Step 7: `e2e/leads.spec.ts`.** The sketch imported the fixtures from `e2e-workspace.mjs`. That cannot work and must not be tried: Playwright compiles a spec to CommonJS, and `e2e-workspace.mjs` is ESM run by plain node in the nightly (`nightly-e2e.yml:80`), so the import fails at load with `ReferenceError: exports is not defined`. The spec restates the names it needs, as `thread.spec.ts:31–33` restates Robin, and its first test reads the workspace back through the API and refuses a seed that has drifted from them — so the two copies cannot quietly disagree.

```ts
// e2e/leads.spec.ts
import { expect, test } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";
import { expectLeadsScope, expectPeekSeenVersusRead, expectRowUnchangedAfterUndo, expectStripEnding } from "./signals";

/**
 * Leads, on the nightly's own workspace.
 *
 * What this proves is the seeded state ON THE PAGE: the scope, the rail, the
 * strip's ending, the peek's two groups, and that every act the owner can take
 * from a row goes through the real route and can be undone back to the row that
 * was there. What it cannot prove for free is a search: a real one spends on
 * the source and the judge. Decision 30 lists this workspace in
 * `lead_platform.tenants_on` (the seed writes it), so a real search CAN run
 * here while the switch is off for everyone else -- behind E2E_PAID_LEADS=1,
 * which the nightly does not set, modelled on Ask's E2E_PAID_MODEL.
 *
 * The two paid tests skip with a stated reason and count toward the skip
 * ceiling (e2e/skip-ceiling.ts, E2E_MAX_SKIPS default 8): Ask's five and these
 * two make seven. A third paid lead test raises the ceiling in the workflow
 * first, deliberately.
 *
 * Read-mostly: every write here is undone in the same test, and
 * e2e-workspace.mjs puts the six leads back before the next run.
 */
const PAID = process.env.E2E_PAID_LEADS === "1";
const WHY_UNPAID = "a real search spends on the source and the judge: set E2E_PAID_LEADS=1 to run it";

/**
 * The seed's search and its six leads (tooling/scripts/e2e-workspace.mjs, which
 * owns them). Restated here rather than imported, as thread.spec.ts restates
 * Robin: that file is ESM run by plain node, and Playwright compiles a spec to
 * CJS, so an import of it fails at load. The first test reads the workspace back
 * through the API and refuses a seed that has drifted from these names, so the
 * two copies cannot quietly disagree.
 */
const LEAD_SEARCH_NAME = "Personal trainers · Austin";
const ZILKER = "Zilker Strength Lab";
const TRAVIS = "Travis Heights Coaching Co.";
const MUELLER = "Mueller Movement Studio";
const KETTLEBELL = "East Side Kettlebell";
const FITCORP = "FitCorp Austin Central";
const HYDE_PARK = "Hyde Park Personal Training";
const SEEDED = [ZILKER, TRAVIS, MUELLER, KETTLEBELL, FITCORP, HYDE_PARK];
/** The seed's own arithmetic: six leads, five of them ready, one kept search. */
const STANDING = "6 leads · 5 ready · 1 search";

interface Sent { url: string; body: unknown }

/** Every write the page makes while a test runs, in order, as the page made it. */
async function watch(page: Parameters<typeof signIn>[0], pattern: string): Promise<Sent[]> {
  const sent: Sent[] = [];
  await page.route(pattern, async (route) => {
    sent.push({ url: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
    await route.continue();
  });
  return sent;
}

test.describe("Leads on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the Leads scope shows the seeded search and its leads, strongest fit first, and the strip says how it ended", async ({ page }) => {
    // The seed owns these six; this spec restates their names. If the two ever
    // disagree, every other assertion below is measuring the wrong workspace.
    const held = await (await apiGet(page, "/api/v1/leads?list=all&sort=fit&dir=asc")).json();
    expect((held.data.rows as Array<{ business_name: string }>).map((r) => r.business_name).sort())
      .toEqual([...SEEDED].sort());

    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    await expectLeadsScope(page, { standing: STANDING, first: ZILKER });
    await expect(page.locator(".cl-table tbody tr").nth(1)).toContainText(TRAVIS);
    await expectStripEnding(page, `Found 3 personal trainers`);
    await expect(page.getByTestId("lead-strip")).toContainText("1 left out");

    // The rail names the search, and its count is the members' count.
    await expect(page.locator(".cl-rail-row", { hasText: LEAD_SEARCH_NAME })).toBeVisible();

    // "1 left out" is a view, and the view is the address.
    await page.getByRole("button", { name: "1 left out" }).click();
    await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\/clients\/leads:s-[0-9a-f-]{36}:c-excluded$/);
    const left = page.locator(".cl-table tbody tr").first();
    await expect(left).toContainText(FITCORP);
    await expect(left).toContainText("Chain");
    await expect(left).toContainText("Not checked");
  });

  test("no page of Leads says a dollar amount, and nothing on it names where the places came from", async ({ page }) => {
    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    const text = await page.locator(".app-root").innerText();
    expect(text, "a screen said what a search cost").not.toMatch(/\$\d/);
    expect(text, "a screen named the vendor").not.toMatch(/apify|compass|bounce ?verify/i);
  });

  test("the peek names every check's source in two groups, and a catch-all address reads Unconfirmed", async ({ page }) => {
    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    await page.locator(".cl-table tbody tr", { hasText: MUELLER }).getByRole("button", { name: MUELLER }).click();
    await expectPeekSeenVersusRead(page);
    await expect(page.getByTestId("lead-peek")).toContainText("Unconfirmed");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("lead-peek")).toHaveCount(0);
  });

  test("Not a fit, then Undo, leaves the lead as it was and no row behind", async ({ page }) => {
    const sent = await watch(page, "**/api/v1/leads/*/stage");
    const undone = await watch(page, "**/api/v1/lead-operations/*/undo");
    await page.goto("/#/clients/leads:l-nurture");
    await page.waitForLoadState("networkidle");
    const row = page.locator(".cl-table tbody tr", { hasText: HYDE_PARK });
    const before = await row.innerText();
    await row.hover();
    await row.getByRole("button", { name: "Not a fit" }).click();
    await page.getByRole("menuitem", { name: "A chain or franchise" }).click();
    await expect.poll(() => sent.map((s) => s.body)).toEqual([{ kind: "not_a_fit", why: "chain" }]);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => undone.length).toBe(1);
    expect(undone[0].body).toMatchObject({ version: expect.any(Number) });
    await page.goto("/#/clients/leads:l-nurture");
    await expectRowUnchangedAfterUndo(page, HYDE_PARK, before);
    const after = await (await apiGet(page, "/api/v1/leads?list=nurture&sort=fit&dir=asc")).json();
    expect((after.data.rows as Array<{ business_name: string }>).map((r) => r.business_name)).toContain(HYDE_PARK);
  });

  test("Put back, then Undo, leaves the left-out place as it was", async ({ page }) => {
    const put = await watch(page, "**/api/v1/leads/*/put-back");
    const undone = await watch(page, "**/api/v1/lead-operations/*/undo");
    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "1 left out" }).click();
    const row = page.locator(".cl-table tbody tr", { hasText: FITCORP });
    const before = await row.innerText();
    await row.hover();
    await row.getByRole("button", { name: "Put back" }).click();
    await expect.poll(() => put.length).toBe(1);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => undone.length).toBe(1);
    await expectRowUnchangedAfterUndo(page, FITCORP, before);
  });

  test("Keep on a Needs review row counts it this month, and Undo gives it back", async ({ page }) => {
    const kept = await watch(page, "**/api/v1/leads/*/keep");
    const undone = await watch(page, "**/api/v1/lead-operations/*/undo");
    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "2 need review" }).click();
    const row = page.locator(".cl-table tbody tr", { hasText: KETTLEBELL });
    const before = await row.innerText();
    await row.hover();
    await row.getByRole("button", { name: "Keep" }).click();
    await expect.poll(() => kept.length).toBe(1);
    await expect(page.getByRole("status")).toContainText("It counts as a lead this month.");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => undone.length).toBe(1);
    await expectRowUnchangedAfterUndo(page, KETTLEBELL, before);
  });

  test("an old #/leads bookmark lands on the Leads scope", async ({ page }) => {
    await page.goto("/#/leads");
    await expect.poll(() => new URL(page.url()).hash, { message: "leads is a scope of People now" }).toBe("#/clients/leads");
    await expect(page.getByTestId("leads-standing")).toBeVisible();
  });

  test("the keyboard walks the leads: J focuses, Enter peeks, C dials, F opens the finder, Esc backs out in order", async ({ page }) => {
    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("j");
    await expect(page.locator(".cl-table tbody tr.focused")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("lead-peek")).toBeVisible();
    // C dials from the owner's own phone by setting window.location.href to a
    // tel: URL (`plDial`, Task 2). That leaves the browser, so there is no element
    // and no navigation for Playwright to read: what the nightly proves is that
    // the key reaches a lead with a number to dial, and that the peek shows it.
    await expect(peek.getByTestId("peek-phone-value")).toHaveText(/\+1 ?\(?512\)? ?555-010\d/);
    await expect(peek.getByTestId("peek-call")).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("lead-peek")).toHaveCount(0);
    await page.keyboard.press("f");
    await expect(page.getByTestId("lead-finder")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("lead-finder")).toHaveCount(0);
  });

  test("at a phone's width the switch, search and Find are one bar and the first lead is on the first screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    const bar = page.getByTestId("leads-phone-bar");
    await expect(bar).toBeVisible();
    await expect(bar.getByTestId("leads-phone-search")).toBeVisible();
    await expect(bar.getByTestId("leads-phone-find")).toBeVisible();
    // Nothing above the rows but the bar and the strip: no stat cards, no
    // controls row, no rail (feedback_mobile_work_first).
    await expect(page.locator(".cl-rail")).toBeHidden();
    await expect(page.locator(".cl-controls")).toHaveCount(0);
    await expect(page.locator(".cl-table tbody tr").first()).toBeInViewport({ ratio: 1 });
    // A card, not a row of columns, with a 44px Call.
    const call = page.locator(".cl-table tbody tr").first().getByRole("button", { name: /^Call / });
    expect((await call.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });

  test("Find leads turns words into a plan card, and nothing is started when it is closed", async ({ page }) => {
    test.skip(!PAID, WHY_UNPAID);
    const before = await (await apiGet(page, "/api/v1/lead-searches")).json();
    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Find leads" }).click();
    await page.getByTestId("finder-input").fill("6 personal trainers in Round Rock, TX, a phone is enough");
    await page.getByRole("button", { name: "Plan it" }).click();
    await expect(page.getByTestId("lead-plan")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("plan-sentence")).toContainText("Round Rock");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("lead-finder")).toHaveCount(0);
    const after = await (await apiGet(page, "/api/v1/lead-searches")).json();
    expect((after.data.searches as unknown[]).length, "a plan the owner closed started nothing").toBe((before.data.searches as unknown[]).length);
  });

  test("a small search runs end to end on the listed workspace, and is removed after", async ({ page }) => {
    test.skip(!PAID, WHY_UNPAID);
    test.setTimeout(10 * 60_000);
    await page.goto("/#/clients/leads");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Find leads" }).click();
    await page.getByTestId("finder-input").fill("6 independent bike shops in Round Rock, TX, a phone is enough");
    await page.getByRole("button", { name: "Plan it" }).click();
    await expect(page.getByTestId("lead-plan")).toBeVisible({ timeout: 40_000 });
    await page.getByRole("button", { name: /^Find \d+ leads$/ }).click();
    const strip = page.getByTestId("lead-strip");
    await expect(strip).toContainText(/Finding|Stopped|Found/, { timeout: 60_000 });
    await expect(strip).toContainText(/^(Found|Stopped)/, { timeout: 9 * 60_000 });
    // What it spent is read from the ledger, never from a screen.
    const searches = await (await apiGet(page, "/api/v1/lead-searches")).json();
    const mine = (searches.data.searches as Array<{ id: string; name: string; cost_usd: number }>).find((s) => /bike shops/i.test(s.name));
    expect(mine, "the search the page started is in the ledger").toBeTruthy();
    expect(Number(mine!.cost_usd)).toBeLessThan(0.5);
    // And the workspace goes back to its six: the seed's verify() refuses a drifted one.
    await page.locator(".cl-rail-row", { hasText: mine!.name }).getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Remove this search" }).click();
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.locator(".cl-rail-row", { hasText: mine!.name })).toHaveCount(0);
  });
});
```

- [ ] **Step 8: The old bookmark's value changes.** `e2e/people.spec.ts:150–154`:

  old:
```ts
    for (const gone of ["leads", "pipeline"]) {
      await page.goto(`/#/${gone}`);
      await expect.poll(() => new URL(page.url()).hash, { message: `${gone} retires into People` }).toBe("#/clients");
      await expect(page.getByTestId("people-standing")).toBeVisible();
    }
```
  new:
```ts
    // Leads is a scope of People now, not a retired page: an old bookmark lands
    // on that scope. The deal board has nowhere of its own to go.
    for (const [gone, lands] of [["leads", "#/clients/leads"], ["pipeline", "#/clients"]]) {
      await page.goto(`/#/${gone}`);
      await expect.poll(() => new URL(page.url()).hash, { message: `${gone} retires into People` }).toBe(lands);
      await expect(page.getByTestId(gone === "leads" ? "leads-standing" : "people-standing")).toBeVisible();
    }
```

- [ ] **Step 9: Prove the suite parses and names its workspace.** `corepack pnpm exec playwright test e2e/leads.spec.ts --list` → `Total: 11 tests in 1 file`. `corepack pnpm exec playwright test e2e/people.spec.ts e2e/leads.spec.ts --list` → `Total: 22 tests in 2 files`. `node --conditions=react-server --import tsx --test tooling/scripts/tests/e2e-shape.test.mjs tooling/scripts/tests/e2e-workspace.test.mjs` → PASS (`e2e-shape` refuses any `page.request` that does not name a workspace; every read here goes through `apiGet`).

- [ ] **Step 10: Run it against a preview, then leave it to the nightly.** `E2E_BASE_URL=<preview> corepack pnpm e2e -- e2e/leads.spec.ts`, after `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… E2E_USER_EMAIL=… E2E_MEMBER_EMAIL=… node tooling/scripts/e2e-workspace.mjs --apply` has put the workspace in its known state. Nine tests pass; the two paid ones skip with `WHY_UNPAID`. Do **not** set `E2E_PAID_LEADS` on that run: the paid pair is Ruben's to spend, once (PRD §16, 30).

- [ ] **Step 11: Mutation checks, each once.** Change one seeded `place_id` to `ChIJreal0006` and see "the lead seed is six fictional places" fail. Delete the `tenants_on` write in `convergeLeads` and see the same test fail on `tenants_on`. Remove `apiGet` from the spec's first read (use `page.request.get` bare) and see `e2e-shape.test.mjs` name the line.

- [ ] **Step 12:** Commit:

```bash
git commit -m "The nightly opens Leads on six fictional places and proves every act the owner takes can be undone" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 22: dists, the full suite, the production push, ship

**Files:** Modify `apps/dashboard/src/legacy/Chanlytics.html` (every `?v=`, step 1a), `packages/*/dist` (rebuilt, only real diffs kept), `packages/contracts/src/schema-sets.generated.ts` and `packages/db/src/database.types.ts` (both regenerated against the pushed database) · No test of its own: this task runs every other task's.

- [ ] **Step 1a: every `?v=`, once, here.** No task before this one chose a number for a file it edited; this step chooses them all, so each edited file is bumped exactly once for the release and two tasks cannot give one file two numbers. In `apps/dashboard/src/legacy/Chanlytics.html`, read each line's current number and add one:

| File | Number on main (`1441f5bc`) | This release | Edited by |
|---|---|---|---|
| `pages/clients-a.jsx` | `?v=19` | `?v=20` | 1, 2, 11, 12, 13, 14, 16, 17, 18 |
| `pages/app-shell.jsx` | `?v=45` | `?v=46` | 2, 20 |
| `pages/ask-turn.jsx` | (its number on main) | +1 | 6, 9 |
| `components/icons.jsx` | `?v=4` | `?v=5` | 8 |
| `pages/settings.jsx` | (its number on main) | +1 | 19 |
| `styles/people.css` | `?v=12` | `?v=13` | 20 (the retired page's `.ld-*` rules go) |
| `pages/people-table.jsx` | — (created, Task 1) | `?v=1` | 1 |
| `pages/leads-scope.jsx` | — (created, Task 2) | `?v=1` | 2, 11, 14, 15, 16, 17, 18 |
| `pages/leads-finder.jsx` | — (created, Task 8) | `?v=1` | 8, 9, 10, 17 |
| `pages/leads-peek.jsx` | — (created, Task 12) | `?v=1` | 12, 13, 14, 15 |
| `styles/leads.css` | — (created, Task 8) | `?v=1` | 8, 9, 10, 12–15, 17, 18 |
| `pages/leads.jsx` | `?v=17` | — (deleted, Task 20) | 20 |

  A file created by this release keeps `?v=1`: nobody's browser has an old copy of it. Read the file once more after the edit and check no number appears twice for one path and that the list in `Chanlytics.html` still matches `manifest.ts` in order (`legacy-harness.test.mjs:64`).

- [ ] **Step 1:** `node tooling/scripts/check-dist.mjs`, keep real dist diffs, `corepack pnpm -r typecheck`, `corepack pnpm lint`, `corepack pnpm test` → green; `corepack pnpm gen:db-types` and `check:db-types`; `gen:schema-sets`.
- [ ] **Step 2:** Push, open the PR ("Leads is a scope of People: find businesses, work them, and turn the ones who answer into people"). On green, from the PR's branch: **re-list `supabase/migrations`** and check that `00142` (4.2's number, taken on 20 September) is still free — if anything landed since, rename the file to the next free number and re-run 4.2's tests; then the dry run listing only this release's migration, `db push --linked --yes`, and the read-back: `select proname from pg_proc where proname in ('lead_set_stage','lead_bulk','lead_erase','lead_export_mark','lead_search_undo','lead_list_counts','leads_page','set_contact_consent','set_marketing_consent') order by 1` (nine names, and exactly one `leads_page`), `select count(*) from public.lead_suggestions`, and the two notification kinds and the two operation kinds in their CHECKs. Then `next build`, then the merge. If the classifier refuses the push, hand Ruben: `supabase db push --linked --yes` from the PR's branch, in PowerShell, one line.
- [ ] **Step 3: Ruben's.** The switch (`update public.lead_platform set searches_on = true;` in the SQL editor, or `supabase db query --linked "update public.lead_platform set searches_on = true;"`), `APIFY_TOKEN` on the edge (release A), and G5's cohort: the invited list, and the five measures (time to the first useful result, kept-lead precision, contact-ownership accuracy, duplicate charges, cost per kept lead, and customer-message latency on the shared jobs queue) read from the ledger for the first two weeks.

## Done-when (PRD §14, release B), each mapped to a task and a test

**§14's own five.**

| PRD §14 release B says | Task | Proven by |
|---|---|---|
| A search runs end to end on production from the page | 8, 9, 10, 22 | `e2e/leads.spec.ts` "a small search runs end to end from the page on the listed workspace" (with `E2E_PAID_LEADS=1`, run once by hand before the merge and recorded in the PR); then Ruben's first search after the switch |
| The question fires on a fixture with 12 of 25 passing and nothing more is started until it is answered | 10 (the strip); release A (the engine) | `leads-finder.test.mjs` "the question strip is the accent tint with role alert, its three answers post what they say, and nothing else in the strip moves while it waits"; `leads-honest.test.mjs` "the 25 rows stay under the question"; release A's `lead-search-replay.test.mjs` fixture with 12 of 25 (the collect leaves the round `waiting_on_owner` and inserts no start job) |
| Every consent path refuses a converted lead in a test | 4.2 (item 10), 7 | `leads.db.test.mjs` "both consent doors refuse a linked person's yes with `LEAD_CONSENT_REFUSAL` and accept their no" (W2's assert block 16, proved on Postgres); `consent-paths.test.mjs` "ACCEPTANCE: the four consent routes refuse…" and "Ask has no act that could record a yes"; `consent-paths.db.test.mjs` "a member cannot write consent except through a door" (block 19) and "the doors a member can call that write consent are exactly three, and only two of them can say yes" (block 17); one converted-lead row in `broadcasts.test.mjs`, `outbound-gate.test.mjs`, `voice-doors.test.mjs`, `deliver.test.mjs` |
| G4's widths and keyboard-only pass | 2, 18 | the browser check's measurements in the PR (375, 720, 800, 960, 1280, 1440; dark; keyboard only) — **Task 18 step 8, not yet run**; `leads-honest.test.mjs` "keys: J and K move, Enter peeks, x selects, C calls, F opens the finder, Esc closes the peek, then the finder, then the Columns menu, then the selection; one keydown listener" (green, W1); `e2e/leads.spec.ts` "the keyboard walks the leads…" and "at a phone's width the switch, search and Find are one bar and the first lead is on the first screen" |
| G5's cohort is invited | 22 | not a test: Ruben's list and the five measures, read from the ledger |

**The product half, item by item.** Every screen the PRD's §5–§9 describe, and every rule §0 sets, with the task that builds it and the test that holds it:

| What | Task | Test |
|---|---|---|
| The People table lifted and parameterised by its columns | 1 | `people-table.test.mjs` (3 tests: the helpers take the list, the table says its noun, the head says its sort) |
| Leads as a scope of People: one rail, one table, one listener, one saved view | 2 | `leads-honest.test.mjs` (20 tests: the scope switch, the rail, the standing line, the view saved whole, the keys, the Esc order, the overlays, the bulk bar) |
| The surface reads by view and patches what is loaded (E8) | 3 | `leads-bridge.test.mjs` "a read is keyed by the view…", "a refresh patches changed rows and keeps the pages", "new results are offered, never re-sorted under the owner" |
| Undo is a server record, never a client's copy of a row (E9) | 3, 4.2, 4.4 | `leads-bridge.test.mjs` "every act goes through its route with the id and the version it saw"; `leads.db.test.mjs` blocks 5, 6, 10, 15 |
| Bulk acts on the ids, or on the view (S13) | 4.4, 2 | `lead-routes.test.mjs` "bulk acts on the ids, or on the view for Select all that match"; `leads.db.test.mjs` block 10; `leads-honest.test.mjs` "Select all N that match hands the view to the server" |
| The composer: typed or held-to-talk, one Ask turn, a refusal in words | 8 | `leads-finder.test.mjs` (the turn's shape with no scope, the refusal under the input, the recogniser that uploads nothing, the `pl-finder` overlay) |
| The plan card: one sentence whose words are pickers, and it says the area once | 9 | `lead-search.test.mjs` (+3, including the REGRESSION test for "in Brooklyn in in Brooklyn, NY"); `leads-vm.test.mjs` (`leadPlanLikely`, `leadPlanFacts`, `leadPlanAsk`); `leads-finder.test.mjs` (the six card tests) |
| The strip, the question after 25, and the nine endings | 10, 19 | `leads-vm.test.mjs` "the strip says every ending in the PRD's words, one next step each, and nothing about money" (table-driven over `LEAD_ROUND_ENDINGS`, composed from `leadEndingLine`); `leads-finder.test.mjs` (the running strip, the question, Undo) |
| Qualified, Needs review, Excluded; Keep, Exclude and Put back as the owner's (S9) | 11 | `leads-honest.test.mjs` (the three classes, the chips, the operator's refusal in the gate's sentence) |
| The peek: Seen versus Claude's read, and Unconfirmed (P2, S12) | 12 | `leads-peek.test.mjs` (26 tests; "nothing Claude read wears a plain check", "a catch-all email reads Unconfirmed") |
| The draft: the foot the law asks for, opened in the owner's own mail app | 13 | `leads-peek.test.mjs` ("never a field the page would have to encode", "Did you send it? is asked when the tab comes back"); `leads-vm.test.mjs` (`leadDraftFooter`); `lead-routes.test.mjs` (the draft route) |
| Calls and their six outcomes; only Interested makes a person (§9.6) | 14, 4.2 | `leads-peek.test.mjs` "the six outcomes and what each does"; `leads.db.test.mjs` blocks 1, 2, 3, 4, 14; `lead-routes.test.mjs` "a click to Talking says the lead is still a lead" |
| Not a fit, and Already a customer hiding the place for good | 15, 4.2 | `leads-peek.test.mjs` "Already a customer hides the place"; `leads.db.test.mjs` block 5 |
| A search, kept: rename, remove, find new ones, search again, export | 16 | `leads-honest.test.mjs` (the menu, the two acts, the export's href); `leads-vm.test.mjs` (`leadSearchWords`) |
| The first day: three ways, the business line, three suggestions | 17 | `leads-honest.test.mjs` ("a way claims only what this tab read", "the suggestions are this workspace's own line") |
| The phone: one bar, then the work | 18 | `leads-honest.test.mjs` (the bar's shape, roles and gate; the sheet registers no listener of its own); the browser check (step 8) |
| The guardrails in the owner's words, and no vendor name anywhere | 19 | `leads-vm.test.mjs` (the sweep over `LEADSEARCH`, `LEADJUDGE`, `LEADS` for `/apify|compass|bounceverify/i` and `/\$/`; the planner's three refusals; the words in one record) |
| The retired seeded page and every reader on main | 20 | `legacy-harness.test.mjs`; `calendar-people.test.mjs:506` and `e2e/people.spec.ts:150` change value to `clients/leads` |
| The nightly proves the seeded state on production | 21 | `e2e/leads.spec.ts` (11 tests, two of them paid and skipped); `e2e-workspace.test.mjs` (+2: the converge is additive and the round is written queued → ended) |
| The bell's two kinds, and the five events | 4.2, 10 | `leads.db.test.mjs` block 12 ("the bell rings twice", and nothing for `stopped`); `notifications.test.mjs`; `event-kinds.test.mjs` (the five kinds are written from SQL and declared) |
| Ask proposes a search and draws the same card | 6, 9 | `lead-ask.test.mjs`; `ask.test.mjs:375` (the gate's value) and `:599–606` (26 tools against 36) |
| The gateway takes two more purposes, capped inside Ask's day | 5, 4.3 | `lead-gateway.test.mjs` |

## Self-review (what is reconciled, and what is not)

- **Spec coverage.** Every item PRD §14 names for release B has a task and a test, above. Every release C item is out (`search_leads`, chips, the learning, More like these, enrichment, the scout, more cards): `2026-09-19-lead-finder-C-extras.md`.
- **Names.** One consistency pass was run over the five writers' "names consumed" and "names introduced" lists, plus the tasks written in full and `origin/main`: every RPC, route, `window.__…` global, contracts export, component, prop, class prefix, testid and event or notification kind that any task *uses* is defined by some task in this plan or exists on main. The eleven places where two tasks disagreed are listed under "Reconciled while stitching"; nothing was left with two spellings, and nothing is used that nothing defines.
- **What is proved, and what the proof was.** The status table at the head gives the counts per writer: 20/20 for the page, 19 assert blocks on Postgres inside a rollback for the migration and the doors, 58/58 for the composer, card and strip, 31/31 for the peek and its three screens, 121/121 for the first day, the phone, the guardrails and the nightly, plus the mutation checks that killed each test in turn. Every one was run in a scratch worktree detached at `1441f5bc`, and nothing was committed from them.
- **Not proved, and honestly so.** Each of these is one step, not a task, and each says so where it lives:
  1. **The browser check (G4), Task 18 step 8.** No CSS was measured. The step names every width and every expected number (the 44px Call at 375, `scrollWidth - clientWidth` of 0 at 375/720/800, the 408px peek at 1280, the one-row controls at 1440, 4.5:1 on the dark strip), so it is executable as written — but no number in it has been read from a browser yet, and a Leads page to draw in one does not exist until Tasks 2 and 8–16 land.
  2. **The 402 wording.** Task 19's test pins that no lead refusal says "buying a number". It passes today only because `refusalOf`'s own sentences never said it; `whyCannotSpend(mode, status)` still does (`billing.ts:149–155`) and `requireSpend(ctx, member)` still takes no `doing`. `SpendWords` is Task 4.4's live work, and until it lands the pin is a trap that has not been sprung.
  3. **The SQL was never applied for real.** W2's proof ran the whole migration and every door body inside one `begin … rollback` on the local stack, twenty times over, and rolled it back; nothing landed. So `schema-sets.generated.ts` and `database.types.ts` are **not** regenerated here (both read a live database): 4.2 step 5 says exactly which two lines of the generated set file change and what `database.types.ts` gains, and the agent runs `gen:schema-sets` and `gen:db-types` and reads the diff.
  4. **Release A's `lead-engine.db.test.mjs` was not re-run**, for the same reason. The three things it could break on — `leads_page`'s named arguments, its packed-`sort_key` paging and `lead_undo`'s `undo_search` branch — were each preserved on purpose and proved inside the rollback (blocks 11 and 15), but the file itself runs green only after Task 22's push.
  5. **The real surface behind the page.** Task 2's `leads-honest.test.mjs` draws the real `clients-a.jsx` and `leads-scope.jsx`, but through a faked `window.__LEADS` and a faked courier, because Task 3 needs Task 4's contracts. `leadsRoute`/`parseLeadsRoute` are copied verbatim from 4.1 and the rail and standing stand-ins answer exactly what 4.6's own test pins, so the page is drawn from the shape it will be given — but the wire itself is `leads-bridge.test.mjs`'s to prove, at Task 3.
  6. **`corepack pnpm test`, `pnpm lint` and `next build`** were not run by any writer (the brief forbade the suite, and the legacy `.jsx` is never executed by lint or the build). Task 22 runs all three before the merge.
  7. **The nightly has not run against a deployment.** `e2e/leads.spec.ts` parses and lists its 11 tests, and `e2e-shape.test.mjs` holds its shape; it cannot be run until the pages exist, and the two paid tests stay skipped unless `E2E_PAID_LEADS=1` (with Ask's five, that is seven skips against the ceiling of 8 — a third paid lead test raises `E2E_MAX_SKIPS` first).
- **Still open for Ruben, not for this plan** (each named where it occurs, and none of them blocks a task):
  1. **"All 200 when your leads renew."** PRD §8.8 offers a start on renewal day; release A's `lead_search_create` takes no `start_after`. Task 9 offers Find N now and says the day; the wait is either a bell or a door argument in A.
  2. **The phone band.** PRD §6.6 says ≤720px; main's cards, Columns menu and listener are at 900 and this plan follows the code, with 720 as the slim bar only. The PRD was corrected on 19 September; the lists sheet's opener (`clients-a.jsx:1584`) still says 720 and is left as it is.
  3. **The switch.** `lead_platform.searches_on` stays false until Ruben turns it on (Task 22 step 3), and `E2E_PAID_LEADS` is not set in the nightly.
  4. **G2's labelled run** is still pending. Nothing in this release reads it (Task 0 says why).
- **What is not written out,** on purpose and said where it occurs: the exact strings of the seeded rows the nightly reads are the seed's own (Task 21), and the canvas's artboards are the design of record for anything this plan draws but does not measure. Every other line of every task is here.
