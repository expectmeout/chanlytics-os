# Phase Two C: Every Route Declares Its Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empty `route-policy.json`'s undeclared list: the 78 handlers that still perform their policy by hand (`memberContext`, `requireRole`, `takeRate`, `requireSpend`, a body picked apart) declare it on the export with `read()` / `write()`, one pipeline enforces it, and each domain has at least one handler executed by a test through `run()` with a database in memory. PRD G2 "CI rejects undeclared routes" becomes true by the list reaching zero, at which point the test turns from a ratchet into a wall.

**Architecture:** Nine PRs, one per domain, cheapest first. Each PR is faithful: a handler's policy is declared as the handler enforced it (the workspace named by the tab where it read `?workspace=`; the row's own workspace where it loaded a row first; the account where neither; the platform for the back office). Behaviour does not change except where the pipeline's order is stricter (role before rate before spend before body). Every PR moves its source pins (never adds one) and banks the policy with `UPDATE_ROUTE_POLICY=1`. Team and sign-up code (the roster, `workspaces/create`) are held for Ruben's yes; nothing here carries a migration.

**Tech Stack:** as the earlier plans. `route()` is `apps/dashboard/src/server/route.ts` (`read`, `write`, `workspace`, `account`, `platform`, `row(load)`); an exported handler carries `policy` and `run(req, ctx)`; `route-definition.test.mjs` is the harness for running one through `run()` with `fakeDb`.

**Rules:** the house rules of the earlier plans apply. A handler whose body shape is not worth a schema keeps its own parsing inside `handle` (the policy is the point; a zod schema is used where the old code validated fields). A read declares `query` only when it validated its query string.

---

### The table

What each undeclared handler enforces today, read from its source (methods; scope as declared; role; rate bucket; spend; body; query). `-` is none. The PR that moves it is in the last column.

| route | methods | scope | role | rate | body | query | PR |
|---|---|---|---|---|---|---|---|
| billing | GET | workspace | - | - | no | yes | 1 |
| broadcasts/[id] | GET | workspace | - | - | no | yes | 1 |
| calls/[id]/export | GET | workspace | - | - | no | yes | 1 |
| channels | GET | workspace | - | - | no | yes | 1 |
| channels/whatsapp/signup | GET | workspace | - | - | no | yes | 1 |
| consent/qr | GET | workspace | - | - | no | yes | 1 |
| contacts/export | GET | workspace | - | export | no | yes | 1 |
| conversations | GET | workspace | - | - | no | yes | 1 |
| conversations/[id]/export | GET | workspace | - | - | no | yes | 1 |
| google | GET | workspace | - | - | no | yes | 1 |
| lines | GET | workspace | - | - | no | yes | 1 |
| messages/[id]/media | GET | workspace | - | - | no | yes | 1 |
| setup | GET | workspace | - | - | no | yes | 1 |
| notifications | GET, PUT | workspace | - | notify_mark | yes | yes | 1 |
| conversations/[id] | GET | row | - | - | no | yes | 2 |
| conversations/[id]/reply | POST | row | operator | reply | yes | no | 2 |
| escalations | GET | row/workspace | - | - | no | no | 2 |
| messages/[id]/steer | POST | row | operator | whisper | yes | no | 2 |
| calls | GET | workspace | - | - | no | yes | 2 |
| calls/[id]/recording | GET | row | - | - | no | no | 2 |
| calls/[id]/whisper | POST | row | operator | whisper | yes | no | 2 |
| contacts | GET, POST | workspace | operator (POST) | person_create | yes | yes | 3 |
| contacts/[id] | GET, DELETE | workspace | owner (DELETE) | erase | no | yes | 3 |
| contacts/[id]/details | PUT | row | operator | person_edit | yes | no | 3 |
| contacts/[id]/receptionist | PUT | row | owner | person_mode | yes | no | 3 |
| segments | GET, POST | workspace | operator | lists | yes | yes | 3 |
| segments/[id] | PUT, DELETE | row | operator | lists | yes | no | 3 |
| broadcasts | GET, POST | workspace | operator (POST) | broadcast | yes | yes | 4 |
| broadcasts/[id]/approve | POST | row | operator | broadcast | no | no | 4 |
| broadcasts/[id]/cancel | POST | row | operator | broadcast | no | no | 4 |
| templates | GET, POST | workspace | operator (POST) | settings | yes | yes | 4 |
| templates/[id] | PUT, DELETE | row | operator | settings | yes | no | 4 |
| templates/draft | POST | workspace | operator | ask | yes | yes | 4 |
| templates/starter | POST | workspace | operator | settings | yes | yes | 4 |
| templates/sync | POST | workspace | operator | settings | no | yes | 4 |
| playbooks | GET, POST | workspace | operator (POST) | playbook | yes | yes | 4 |
| playbooks/[id] | PUT, DELETE | row | operator | playbook | yes | no | 4 |
| playbooks/[id]/run | POST | row | operator | playbook | no | no | 4 |
| settings | GET, PUT | workspace | owner (PUT) | settings | yes | yes | 5 |
| policies | GET, PUT | workspace | operator (PUT) | settings | yes | yes | 5 |
| business-record | GET, PUT | workspace | owner (PUT) | business_record | yes | yes | 5 |
| calendar | GET | workspace | - | aggregate | no | yes | 5 |
| calendar/preview | POST | workspace | operator | settings | yes | yes | 5 |
| setup/request | POST | workspace | operator | setup_request | yes | yes | 5 |
| lines/search | POST | workspace | owner | lines_search | yes | yes | 5 |
| lines/retry | POST | workspace | owner | lines_retry | yes | yes | 5 |
| lines/forwarding | POST | workspace | owner | lines_forwarding | yes | yes | 5 |
| lines/forwarding/test | POST | workspace | owner | lines_forwarding | yes | yes | 5 |
| channels/whatsapp/connect | POST | workspace | owner | settings | yes | yes | 5 |
| google/connect | GET | workspace | owner | google_link | no | yes | 6 |
| google/connection | DELETE | workspace | owner | google_link | no | yes | 6 |
| google/link | POST, DELETE | workspace | owner | google_link | yes | yes | 6 |
| google/locations | GET, POST | workspace | owner | google_link, google_search | yes | yes | 6 |
| google/refresh | POST | workspace | operator | google_refresh | no | yes | 6 |
| google/reviews/[id]/draft | POST | workspace | operator | google_draft | no | yes | 6 |
| google/reviews/[id]/reply | POST | workspace | operator | google_reply | yes | yes | 6 |
| google/search | POST | workspace | owner | google_search | yes | yes | 6 |
| google/callback | GET | signed state | - | - | no | yes | 6 (its own door: the state is the credential) |
| ask | POST | workspace | - | ask | yes | yes | 7 |
| ask/messages/[id]/proposals/[pid] | POST | row | operator | - | yes | no | 7 |
| ask/openings | GET | workspace | - | aggregate | no | yes | 7 |
| ask/threads | GET | workspace | - | - | no | yes | 7 |
| ask/threads/[id] | GET, DELETE | row | - | - | no | no | 7 |
| metrics | GET | workspace | - | aggregate | no | yes | 7 |
| reports | GET | workspace | - | aggregate | no | yes | 7 |
| reports/campaigns | GET | workspace | - | aggregate | no | yes | 7 |
| platform/overview | GET | platform | - | - | no | no | 8 |
| platform/tenants/[id] | GET | platform | - | - | no | no | 8 |
| platform/lines/refile | POST | platform | - | platform_line_refile | yes | no | 8 |
| platform/lines/release | POST | platform | - | platform_line_release | yes | no | 8 |
| platform/lines/retry | POST | platform | - | platform_line_retry | yes | no | 8 |
| me | PUT | account | - | profile_set | yes | no | 9 |
| workspaces | GET, PATCH | account / workspace | owner (PATCH) | - | yes | yes | 9 |
| workspaces/create | POST | account | - | create_workspace | yes | no | 9 (held: sign-up) |
| team | GET | workspace | - | - | no | yes | 9 (held: team) |

The scope column is a reading of the source and is corrected per PR where the handler turns out to derive its workspace differently.

---

### The shape of every PR

- [ ] **Step 1: Read each handler in the domain**, and write its policy down before touching it: what it reads (`?workspace=`, a row, nothing), who it refuses, which token it takes, what it validates.
- [ ] **Step 2: Rewrite onto `read()` / `write()`**: `scope`, `role`, `rate`, `spend`, `input`/`query` where the old code validated; the old body inside `handle`, reading `member`, `row`, `input`, `ctx` as the pipeline hands them. A handler that loaded a row by id and judged the role against the row's workspace becomes `row(load)` with the load in `verbs.ts` beside `conversationScope` and `contactScope`.
- [ ] **Step 3: The executed test**: one file per domain, `<domain>-routes.test.mjs`, running at least one read and one write through `run(req, ctx)` with `fakeDb` (a `memberships` row per role, the domain's rows) and asserting the answer, a viewer's refusal (403 before any token), and the missing workspace's refusal (`choose_workspace` on a write).
- [ ] **Step 4: Bank the policy** (`UPDATE_ROUTE_POLICY=1 node --conditions=react-server --import tsx --test tooling/scripts/tests/route-policy.test.mjs`); the diff of `route-policy.json` is the PR's summary. Move the pins the suite names (`readCode` assertions on `requireRole(`, `takeRate(`, the fetch of `?workspace=`); never add one.
- [ ] **Step 5: Typecheck, full suite, lint, commit, PR, merge when green** (PR 9's held half waits for Ruben's yes).

---

### PR 1: The reads of the workspace
### PR 2: The inbox and the calls
### PR 3: People and lists
### PR 4: Outbound: broadcasts, templates, playbooks
### PR 5: Settings and setup
### PR 6: Google
### PR 7: Ask, metrics, reports
### PR 8: The back office
### PR 9: The account, and the two held routes

### Status, 2026-09-11

Executed as nine PRs, one per domain, each with its `<domain>-routes.test.mjs` running the handlers through `run()` with `fakeDb`, its pins moved (none added) and its policies banked:

| PR | Domain | Merged as | Routes banked |
|---|---|---|---|
| 1 | The reads of the workspace | #358 | 14 |
| 2 | The inbox and the calls | #359 | 7 (`messageScope`, `callScope`) |
| 3 | People and lists | #360 | 6 (`erasureScope`, `listScope`; fakeDb `delete()`/`upsert()`) |
| 4 | Outbound | #361 | 11 (`broadcastScope`, `templateScope`, `playbookScope`) |
| 5 | Settings and setup | #362 | 11 (fakeDb reads the requested columns back after an update) |
| 6 | Google | #363 | 9 (the callback on the account: the signed state is the credential) |
| 7 | Ask, metrics, reports | #364 | 8 (a person's own threads and cards on the account) |
| 8 | The back office, and billing's three | #365 | 8 (the platform scope's door is `backOffice()`) |
| 9 | The account | #366 | 2 |
| 10 | The two held routes, on Ruben's go | this PR | 2 |

Departures from the table above, each toward what the code enforced: `escalations`, `ask/messages/[id]/proposals/[pid]` and `ask/threads/[id]` were never row-scoped (RLS is their door, so they are on the account or the workspace as the code read them); `ask` names the viewer role as its floor and must be told the workspace; `billing/invoices`, `billing/resume` and `billing/sync` were missing from the table and went with the back office.

**The two held routes** (`workspaces/create`, sign-up; `team`, the roster) moved in PR 10 on Ruben's go. `route-policy.json`'s undeclared list is empty, and the ratchet is now the wall the section below describes: a new bare `withRoute` export fails `route-policy.test.mjs`.

Two rules the series taught, now in the tests themselves: `shared-limits.test.mjs` counts a declared `rate: "…",` as a call site, so the floor holds as routes migrate; and `doors-and-rows.test.mjs` treats a row scope as validated by its loader, whose `requireUuid` `workspace-scoping.test.mjs` holds, one per loader.


### After 2C

`route-policy.json`'s undeclared list is empty and the ratchet becomes a wall (the test refuses any new bare `withRoute` export). Then the typed client (PRD W5) can read every route's declared input and output, and `/w/[slug]` can follow.
