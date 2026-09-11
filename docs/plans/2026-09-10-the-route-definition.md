# Phase 3, rewritten: the route definition

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every API route declares five things:
- who may call it;
- which workspace it acts on;
- how often it may be called;
- whether it spends money;
- what input it accepts.

One wrapper enforces all five. Every route can be run in a test, and the policy of every handler lives in one reviewed file.

**Architecture:**
- **Builders.** `read()` and `write()` in `apps/dashboard/src/server/route.ts` build on `withRoute`. `withRoute` keeps the transport: the same-origin check, the verified session, the envelope, and `private, no-store` on every exit.
- **Scope.** A spec's scope is one of `workspace`, `row(load)`, `account` or `platform`.
- **Pipeline.** It runs in this order:
  1. Resolve the scope.
  2. Check the role.
  3. Take the rate token.
  4. Check the workspace may spend.
  5. Parse the input.
  6. Call `handle`.
- **Exported handler.** It carries its `policy`, plus a `run(req, ctx)` that executes everything after the session. `run` is the test seam.
- **`route-policy.json`.** The snapshot a test compares every route module against.

**Tech stack:** Next 15 route handlers, zod 3, `node:test` under `tsx`, and `tooling/scripts/tests/_fake-db.mjs`.

**Supersedes:** Phase 3 of `2026-09-09-the-system-it-should-be.md`, both its original design and the review block written this morning. Both stay there as history. Every tenancy rule that review settled survives here as the inside of the `workspace` scope:
- selection stays per tab;
- there is no cookie;
- `GET /workspaces` keeps the one default;
- a named `choose_workspace` error replaces the generic one.

## Why

Measured 2026-09-10 across 113 handlers in 95 files; the full audit is in the conversation that produced this plan.

- **Hand-assembled policy.**
  - 74 handlers read `?workspace=` themselves. 36 of them are reads, where naming no workspace silently means the oldest membership.
  - 50 of 70 writes assemble member → role → rate by hand.
  - 12 writes take no rate token, and nothing says whether that was a choice.
- **Routes on one record resolve their workspace three ways:** from the record (24), from the query parameter (9), or through row-level security alone (5).
  - One conversation screen uses all three.
  - The thread loads through row-level security.
  - Its images demand `?workspace=` and return 404 if it names the other business.
  - Its recording needs neither.
- **Input is checked three ways:** zod in 6 handlers, `jsonBody` in 15, a bare `req.json()` in 25.
- **No test runs a handler.**
  - Route modules do load under the test runner, because the root tsconfig maps `@/`. The "unloadable outside Next" comment in `permission-layer.test.mjs` is stale.
  - Running one fails at a single line, `withRoute`'s cookie client (`with-route.ts:71`): `GET /v1/metrics` answers 500, "cookies was called outside a request scope".
  - So 121 source reads in 51 test files pin route text instead.

**Shipped ahead of this phase:**
- #330: the business record guesses no website.
- #331 and migration 00101: an erasure clears the marketing answer.
- #332: `replyWindow` and `matchService` each live in one place, in contracts.

## The shape, locked

A route file after this phase:

```ts
// apps/dashboard/app/api/v1/conversations/[id]/snooze/route.ts
import { write, row } from "@/server/route";
import { loadConversation } from "@/server/verbs";
import { SnoozeInput } from "@chanlytics/contracts";

export const POST = write({
  scope: row((ctx, p) => loadConversation(ctx, String(p.id ?? ""))),
  role: "operator",
  rate: "thread_state",
  input: SnoozeInput,
  handle: async ({ ctx, member, row: conv, input }) => { /* the use case, or a Phase 5 verb */ },
});
```

The module, in full:

```ts
// apps/dashboard/src/server/route.ts
import type { ZodType } from "zod";
import { AppError } from "@chanlytics/contracts";
import { memberContext, requireRole, requireSpend, withRoute, type MemberContext, type RouteContext } from "./with-route";
import { takeRate, type RateBucket } from "./rate-limit";
import { backOffice, type BackOffice } from "./platform";

export type Role = MemberContext["role"];
export type Params = Record<string, string | string[] | undefined>;

declare const memberBrand: unique symbol;
/** A membership that route() resolved and checked. Nothing else can make one. */
export type Member = Readonly<Pick<MemberContext, "tenantId" | "role">> & { readonly [memberBrand]: true };

export type Scope =
  | { readonly kind: "workspace" }
  | { readonly kind: "row"; readonly load: (ctx: RouteContext, params: Params) => Promise<{ tenant_id: string }> }
  | { readonly kind: "account" }
  | { readonly kind: "platform" };

/** The workspace this tab named with `?workspace=`; see the rules below. */
export const workspace = { kind: "workspace" } as const;
/** Account-wide: your name, your list of workspaces, a new workspace. */
export const account = { kind: "account" } as const;
/** Across workspaces, for platform staff only (`backOffice`). */
export const platform = { kind: "platform" } as const;
/** The row's own workspace. The loader reads under RLS, so a row the caller cannot see is a 404. */
export const row = <R extends { tenant_id: string }>(load: (ctx: RouteContext, params: Params) => Promise<R>) =>
  ({ kind: "row", load }) as const;

type RowOf<S> = S extends { readonly load: (ctx: RouteContext, params: Params) => Promise<infer R> } ? R : never;
export type Given<S extends Scope> =
  S extends { kind: "workspace" } ? { member: Member }
  : S extends { kind: "row" } ? { member: Member; row: RowOf<S> }
  : S extends { kind: "platform" } ? { office: BackOffice }
  : Record<never, never>;
export type Call<S extends Scope, I> = { ctx: RouteContext & { params: Params }; req: Request; input: I } & Given<S>;

export interface Policy {
  readonly kind: "read" | "write";
  readonly scope: Scope["kind"];
  readonly role: Role | null;
  readonly rate: RateBucket | null;
  readonly spend: boolean;
}

export interface ReadSpec<S extends Scope, Q, O> {
  scope: S;
  /** Every member may read unless this says otherwise. */
  role?: Role;
  rate?: RateBucket | null;
  query?: ZodType<Q>;
  handle: (call: Call<S, Q>) => Promise<O>;
}

export interface WriteSpec<S extends Scope, I, O> {
  scope: S;
  /** Who may change this. null only on the account and platform scopes (route-policy.test holds that). */
  role: Role | null;
  /** A bucket, or null said out loud. Never omitted: the policy file shows every null for review. */
  rate: RateBucket | null;
  spend?: boolean;
  input?: ZodType<I>;
  handle: (call: Call<S, I>) => Promise<O>;
}
```

The pipeline behind `read()` and `write()`. The order is part of the contract:
- a viewer is refused (403) before a token is spent (429);
- both come before the body is judged (400).

1. **Scope.**
   - `workspace`: `memberContext(ctx, searchParams.get("workspace"))`. An ambiguous caller on a write gets 400 `choose_workspace`. On a read, until Task 3.4, they get the oldest membership, exactly as today.
   - `row(load)`: the loader, then `memberContext(ctx, row.tenant_id)`.
   - `platform`: `backOffice(ctx)`.
   - `account`: nothing.
2. **Role.** `requireRole(member, role)` when a role is declared. On reads this keeps today's rule: a read that names a role already refuses ambiguity.
3. **Rate.** `takeRate(ctx.userId, bucket)` when the bucket is not null.
4. **Spend.** `requireSpend(ctx, member)` when `spend` is true.
5. **Input.**
   - A write parses the JSON body against `input`.
   - A read parses the query, minus `workspace`, against `query`.
   - A failure is 400 `validation`, naming up to three fields with their paths (the settings route's format).
6. **Handle.** `handle({ ctx, req, input, member | row | office })`.

## Task 3.1: `route()`, its tests, and the policy file

**Files:**
- Create: `apps/dashboard/src/server/route.ts` (the module above, plus `build`, `resolve` and `parse`)
- Modify: `packages/contracts/src/errors.ts` (add `choose_workspace`, status 400), then rebuild the packages
- Modify: `apps/dashboard/src/server/with-route.ts` (`requireRole`'s ambiguity throws `choose_workspace`)
- Create: `tooling/scripts/tests/route-definition.test.mjs`
- Create: `tooling/scripts/tests/route-policy.test.mjs` and `tooling/scripts/tests/route-policy.json`
- Modify: `tooling/scripts/tests/permission-layer.test.mjs` (the ambiguity code), `auth-gate.test.mjs` (accept `route` as the door)

- [x] **Write `route-definition.test.mjs` first.** It runs `POST.run(req, ctx)` on specs built in the test, against `fakeDb`. Each case below is its own test.
  - A named workspace resolves by id or slug.
  - A workspace the caller does not belong to is a 404.
  - An ambiguous write is `choose_workspace`, and an ambiguous read uses the oldest membership.
  - `row()` takes the role from the row's workspace, and a row RLS hides is a 404.
  - A viewer's write is a 403 and spends no token.
  - A null rate takes none.
  - `spend` is a 402 when billing says no.
  - A body that fails its schema is a 400 naming the field.
  - The order holds: 403, then 429, then 400.
  - `handle` receives the parsed input and the member.
- [x] **Run it and watch it fail** on the missing module.
- [x] **Write `route.ts` and the `errors.ts` code.** Rebuild with `corepack pnpm --filter "./packages/*" build`. The Bash tool has no `pnpm` on its PATH; corepack does.
- [x] **Run it green**, then prove it: put the role check after the rate token and watch the order test fail.
- [x] **Write `route-policy.test.mjs`.** It imports every `app/api/v1/**/route.ts`, which already load, and reads each exported method's `.policy`. Assertions:
  - every export is `read()` for `GET` and `write()` otherwise;
  - `workspace` and `row` writes name a role, and `account` and `platform` ones do not;
  - every spending route is a `workspace` or `row` write.

  The file carries two things:
  - `"routes"`, the policy of every migrated handler, which must equal what the modules declare. `UPDATE_ROUTE_POLICY=1` rewrites it, and the PR diff is the review.
  - `"undeclared"`, the files still on bare `withRoute`. It may only shrink, the same ratchet as the source-scan baseline.

  `v1/signup` is the one permanent entry: it is public, and the middleware's `PUBLIC_PATHS` is its gate.
- [x] **Migrate the seven conversation verbs as the worked example:**
  - `conversations/[id]/{archive,hand-back,snooze,take-over,wake}`;
  - `escalations/[id]/resolve`;
  - `messages/[id]/cancel-send`.

  All get `row(...)`, `role: "operator"`, and the new bucket `thread_state` (120 a minute). `snooze`'s body becomes a zod `SnoozeInput`. Add one `run()` test per verb for its refusal path: a viewer, a missing row, a bad body.
- [x] **Retire the text pins the declarations now record.** `rate-limit.test.mjs` reads each limited route for its bucket (the loop at line 61). The policy file states that now, so the loop becomes a check on `route-policy.json`. Leave `hygiene.test.mjs` F44 alone: it checks which columns the verbs update against the session role's grants, which is not policy. Bank the fall with `UPDATE_SOURCE_SCAN_BASELINE=1`.
- [x] **Commit and open the PR.** The PR is `with-route.ts` + contracts + route.ts + 7 routes + tests.

## Task 3.2: the rest of the routes, one domain per PR

The recipe for each handler is the same:
- Take its row in the appendix.
- Replace the hand-assembled preamble with the declaration.
- Move the body check into a zod `input`.
- Delete the text pins that asserted what the declaration now states.
- Add a `run()` test for its refusal path.

`route-policy.json`'s `"undeclared"` list shrinks with every PR.

| PR | Domain (directories) | Handlers |
|---|---|---|
| 3.2a | conversations, escalations, messages (the rest of the threads) | 7 |
| 3.2b | contacts, segments, consent | 14 |
| 3.2c | broadcasts, playbooks, templates | 17 |
| 3.2d | lines, channels, calendar, setup, business-record | 16 |
| 3.2e | google | 12 |
| 3.2f | billing, team, workspaces, me, settings, policies, notifications | 20 |
| 3.2g | ask, metrics, reports, calls, platform | 18 |

That is 104 handlers, plus Task 3.1's seven verbs and signup's two (which stay on their own door): 113.

**Decisions this phase makes, and each PR applies:**
- **The 12 writes with no rate token.**
  - The five thread verbs, `escalations/[id]/resolve` and `messages/[id]/cancel-send` get `thread_state`. These are Task 3.1's seven.
  - `PATCH` and `DELETE team/[id]` get a new `team_change` bucket (30 an hour).
  - `PATCH /workspaces` takes `settings`.
  - The Ask outcome (`POST ask/messages/[id]/proposals/[pid]`) and `DELETE ask/threads/[id]` declare `null`: each writes only the caller's own row.
- **The nine handlers that address one of our records but read the workspace from the query become `row(...)`:**
  - `team/[id]` (twice)
  - `broadcasts/[id]` GET
  - `calls/[id]/export`
  - `contacts/[id]` GET
  - `conversations/[id]/export`
  - `messages/[id]/media`

  `google/reviews/[id]/{draft,reply}` stays on `workspace`: that id is Google's, not a row of ours.
- **The five routes that relied on RLS alone become `row(...)` too,** so every single-record route answers the same question the same way:
  - `conversations/[id]` GET
  - `calls/[id]/recording`
  - `ask/threads/[id]`, GET and DELETE
  - the Ask outcome
- **Row ids carried in a body move into the path when the route is touched:**
  - `POST /lines/retry {line_id}` becomes `POST /lines/[id]/retry`, and likewise `register` and `forwarding/test`.
  - The bridge's one call site changes in the same PR.

## Task 3.3: the client names its workspace, or waits for it

- [x] **Boot.** When no workspace is known (a first visit, or blocked storage), `surface-runner.ts` awaits the workspace surface before the other fourteen fire.
- [x] **The four `__WORKSPACES[0]` fallbacks** become the active workspace or nothing:
  - `surface-data.ts:197`
  - `inbox-verbs.ts:279`
  - `surface-runner.ts:70`
  - `pages/clients-a.jsx:1348`
- [x] **A `choose_workspace` answer** clears `chanlytics.workspace` and reloads. This is the first `error.code` the client reads.
- [x] **Realtime.** `subscribeMessagesInserts(..., { tenantId })`, which `packages/db` already supports.
- [x] **Tests.** A loaded render of the boot order (the `consent-door` harness pattern), and the error-code branch run with a stubbed fetch.

## Task 3.4: reads refuse ambiguity too

After 3.3 is in production:
- the `workspace` scope's read path throws `choose_workspace` instead of taking the oldest membership;
- the `ambiguous` flag goes;
- the e2e-shape lint can go, because a forgotten workspace now fails loudly.

`GET /workspaces` keeps the one legitimate default. It is `account`-scoped, and answering "which workspace should this tab open" is its job.

## Task 3.5: the workspace in the page URL

`app/(os)/w/[workspace]/page.tsx` renders the same `LegacyHost`.
- **`/`** redirects to the last workspace used, which becomes localStorage's only remaining job.
- **The workspace comes from the path.** `getActiveWorkspace()` reads it, so `scoped()` sends the path's slug.
- **Switching** navigates to `/w/<slug>`.
- **Links name it:** emails, Stripe return URLs, and notification routes.

Slugs are already concierge-only (`workspaces/route.ts:97`). Opening several tabs and following a deep link become correct by construction, and Phase 6's pages land under the right prefix. The API keeps `?workspace=`: moving 61 route files under `/api/v1/w/[ws]/` buys nothing once the scope is declared.

## Status, 2026-09-11

- **Task 3.1** shipped as #334 (`route()`, `route-policy.json`, the seven thread verbs).
- **Task 3.2** was executed as its own plan, [2C: every route declares its policy](2026-09-11-phase-two-c-every-route-declares-its-policy.md), ten PRs #358–#367; the undeclared list is empty and the ratchet is the wall.
- **Task 3.3** shipped as #391: the realtime step in #351 (the runner passes `tenantId`, one topic per workspace); the boot that asks the workspace surface first when the page names none, the six fallbacks to the first workspace on the list made the active one or nothing, and `choose_workspace` as the first error code the client reads. `surface-boot.test.mjs` runs the boot orders.
- **Task 3.4** shipped as #390: `memberContext` refuses an unnamed request from an account in two workspaces, read or write; the `ambiguous` flag and the `strict` read go; only `GET /workspaces` keeps the default. The e2e suite names its workspace on reads too, and the `e2e-shape` lint holds reads as well as writes (kept, extended, rather than deleted: the nightly's account holds one membership, so a forgotten workspace would not fail there).
- **Task 3.5** shipped as #392: `/w/[workspace]` renders the shell; `/` sends the tab to the last workspace used, else the server's active one, with the query and the hash riding along; `getActiveWorkspace()` is the path's slug; switching navigates to `/w/<slug>`; the workspace surface corrects the address when the server chose otherwise; Stripe's return URLs name the workspace. Emails carry no links to name, and the bell's routes are hash routes inside the page. localStorage keeps one thing: the last workspace used.
- **Not in this phase**: the edge credential shipped as 2A's Task 6 (#349, `EDGE_CALL_SECRET`); the typed client shipped as [its own plan](2026-09-11-the-typed-client.md), #369–#373; the Phase 5 verbs are planned in [core, group one](2026-09-11-core-conversation-verbs.md).

## Not in this phase

- **The edge credential.** One `DIAG_KEY`, compared with `!==`:
  - gates money, customer sends and Vault writes, and trusts `tenant_id` from the body;
  - also signs Google OAuth state.

  It becomes a per-call token the dashboard signs, carrying the endpoint, workspace, user and an expiry under a minute. That is its own small plan, next.
- **The typed client.** Once 3.2 is done, the bridge (type-checked; only `src/legacy` is excluded) imports each route's input and output types. One `api()` replaces the 28 fetch sites, and owns the envelope, 401/503, timeouts and the refresh map.
- **Phase 5 verbs.** They plug into `handle`.

## Appendix: today's policy, per handler

Generated on 2026-09-10 by `route_policy.mjs` over `main`. This is the migration checklist. The legend for the "Scope today" column:
- **workspace (row path):** a single-record route that reads the workspace from the query.
- **row (RLS only):** a single-record route with no membership check beyond row-level security.

| Method | Path | Scope today | Role | Rate | Spend | Input |
|---|---|---|---|---|---|---|
| POST | `/v1/ask/messages/[id]/proposals/[pid]` | row (RLS only) | — | — |  | zod |
| GET | `/v1/ask/openings` | workspace | — | aggregate |  | — |
| POST | `/v1/ask` | workspace | — | ask |  | zod |
| GET | `/v1/ask/threads/[id]` | row (RLS only) | — | — |  | — |
| DELETE | `/v1/ask/threads/[id]` | row (RLS only) | — | — |  | — |
| GET | `/v1/ask/threads` | workspace | — | — |  | — |
| POST | `/v1/billing/checkout` | workspace | owner | billing |  | — |
| GET | `/v1/billing/invoices` | workspace | owner | billing |  | — |
| POST | `/v1/billing/portal` | workspace | owner | billing |  | — |
| POST | `/v1/billing/resume` | workspace | owner | billing |  | — |
| GET | `/v1/billing` | workspace | — | — |  | — |
| POST | `/v1/billing/sync` | workspace | operator | billing |  | — |
| POST | `/v1/broadcasts/[id]/approve` | row | operator | broadcast |  | — |
| POST | `/v1/broadcasts/[id]/cancel` | row | operator | broadcast |  | — |
| GET | `/v1/broadcasts/[id]` | workspace (row path) | — | — |  | — |
| GET | `/v1/broadcasts` | workspace | — | — |  | — |
| POST | `/v1/broadcasts` | workspace | operator | broadcast |  | jsonBody |
| GET | `/v1/business-record` | workspace | — | — |  | — |
| PUT | `/v1/business-record` | workspace | owner | business_record |  | raw json |
| POST | `/v1/calendar/preview` | workspace | operator | settings |  | jsonBody |
| GET | `/v1/calendar` | workspace | — | aggregate |  | — |
| GET | `/v1/calls/[id]/export` | workspace (row path) | — | export |  | — |
| GET | `/v1/calls/[id]/recording` | row (RLS only) | — | — |  | — |
| POST | `/v1/calls/[id]/whisper` | row | operator | whisper |  | raw json |
| GET | `/v1/calls` | workspace | — | — |  | — |
| GET | `/v1/channels` | workspace | — | — |  | — |
| POST | `/v1/channels/whatsapp/connect` | workspace | owner | settings |  | raw json |
| GET | `/v1/channels/whatsapp/signup` | workspace | — | — |  | — |
| GET | `/v1/consent/qr` | workspace | — | — |  | — |
| PUT | `/v1/contacts/[id]/consent` | row | operator | consent |  | jsonBody |
| PUT | `/v1/contacts/[id]/details` | row | operator | person_edit |  | jsonBody |
| PUT | `/v1/contacts/[id]/marketing-consent` | row | operator | consent |  | jsonBody |
| PUT | `/v1/contacts/[id]/receptionist` | row | owner | person_mode |  | jsonBody |
| DELETE | `/v1/contacts/[id]` | row | — | erase |  | — |
| GET | `/v1/contacts/[id]` | workspace (row path) | — | — |  | — |
| GET | `/v1/contacts/export` | workspace | — | export |  | — |
| GET | `/v1/contacts` | workspace | — | — |  | — |
| POST | `/v1/contacts` | workspace | operator | person_create |  | raw json |
| POST | `/v1/conversations/[id]/archive` | row | operator | — |  | — |
| GET | `/v1/conversations/[id]/export` | workspace (row path) | — | export |  | — |
| POST | `/v1/conversations/[id]/hand-back` | row | operator | — |  | — |
| POST | `/v1/conversations/[id]/reply` | row | operator | reply |  | zod |
| GET | `/v1/conversations/[id]` | row (RLS only) | — | — |  | — |
| POST | `/v1/conversations/[id]/snooze` | row | operator | — |  | raw json |
| POST | `/v1/conversations/[id]/take-over` | row | operator | — |  | — |
| POST | `/v1/conversations/[id]/wake` | row | operator | — |  | — |
| GET | `/v1/conversations` | workspace | — | — |  | — |
| POST | `/v1/escalations/[id]/resolve` | row | operator | — |  | — |
| GET | `/v1/escalations` | workspace | — | — |  | — |
| GET | `/v1/google/callback` | signed-state | — | — |  | — |
| GET | `/v1/google/connect` | workspace | owner | google_link |  | — |
| DELETE | `/v1/google/connection` | workspace | owner | google_link |  | — |
| POST | `/v1/google/link` | workspace | owner | google_link |  | raw json |
| DELETE | `/v1/google/link` | workspace | owner | google_link |  | — |
| GET | `/v1/google/locations` | workspace | owner | google_search |  | — |
| POST | `/v1/google/locations` | workspace | owner | google_link |  | raw json |
| POST | `/v1/google/refresh` | workspace | operator | google_refresh |  | — |
| POST | `/v1/google/reviews/[id]/draft` | workspace (row path) | operator | google_draft |  | — |
| POST | `/v1/google/reviews/[id]/reply` | workspace (row path) | operator | google_reply |  | raw json |
| GET | `/v1/google` | workspace | — | — |  | — |
| POST | `/v1/google/search` | workspace | owner | google_search |  | raw json |
| POST | `/v1/lines/buy` | workspace | owner | lines_buy | yes | raw json |
| POST | `/v1/lines/forwarding` | workspace | owner | lines_forwarding |  | raw json |
| POST | `/v1/lines/forwarding/test` | workspace | owner | lines_forwarding |  | raw json |
| POST | `/v1/lines/register` | workspace | owner | lines_register | yes | raw json |
| POST | `/v1/lines/retry` | workspace | owner | lines_retry |  | raw json |
| GET | `/v1/lines` | workspace | — | — |  | — |
| POST | `/v1/lines/search` | workspace | owner | lines_search |  | raw json |
| PUT | `/v1/me` | account | — | profile_set |  | raw json |
| POST | `/v1/messages/[id]/cancel-send` | row | operator | — |  | — |
| GET | `/v1/messages/[id]/media` | workspace (row path) | — | — |  | — |
| POST | `/v1/messages/[id]/steer` | row | operator | whisper |  | raw json |
| GET | `/v1/metrics` | workspace | — | aggregate |  | — |
| GET | `/v1/notifications` | workspace | — | — |  | — |
| PUT | `/v1/notifications` | workspace | — | notify_mark |  | jsonBody |
| POST | `/v1/platform/lines/refile` | platform | platform admin | platform_line_refile |  | raw json |
| POST | `/v1/platform/lines/release` | platform | platform admin | platform_line_release |  | raw json |
| POST | `/v1/platform/lines/retry` | platform | platform admin | platform_line_retry |  | raw json |
| GET | `/v1/platform/overview` | platform | platform admin | — |  | — |
| GET | `/v1/platform/tenants/[id]` | platform | platform admin | — |  | — |
| PUT | `/v1/playbooks/[id]` | row | operator | playbook |  | jsonBody |
| DELETE | `/v1/playbooks/[id]` | row | operator | playbook |  | — |
| POST | `/v1/playbooks/[id]/run` | row | operator | playbook |  | — |
| GET | `/v1/playbooks` | workspace | — | — |  | — |
| POST | `/v1/playbooks` | workspace | operator | playbook |  | jsonBody |
| GET | `/v1/policies` | workspace | — | — |  | — |
| PUT | `/v1/policies` | workspace | operator | settings |  | raw json |
| GET | `/v1/reports/campaigns` | workspace | — | aggregate |  | — |
| GET | `/v1/reports` | workspace | — | aggregate |  | — |
| PUT | `/v1/segments/[id]` | row | operator | lists |  | jsonBody |
| DELETE | `/v1/segments/[id]` | row | operator | lists |  | — |
| GET | `/v1/segments` | workspace | — | — |  | — |
| POST | `/v1/segments` | workspace | operator | lists |  | jsonBody |
| GET | `/v1/settings` | workspace | — | — |  | — |
| PUT | `/v1/settings` | workspace | owner | settings |  | zod |
| POST | `/v1/setup/request` | workspace | operator | setup_request |  | raw json |
| GET | `/v1/setup` | workspace | — | — |  | — |
| GET | `/v1/signup` | public | — | — |  | — |
| POST | `/v1/signup` | public | — | signup_ip |  | zod |
| PATCH | `/v1/team/[id]` | workspace (row path) | owner | — |  | raw json |
| DELETE | `/v1/team/[id]` | workspace (row path) | owner | — |  | — |
| POST | `/v1/team/invite` | workspace | owner | invite |  | raw json |
| GET | `/v1/team` | workspace | — | — |  | — |
| PUT | `/v1/templates/[id]` | row | operator | settings |  | jsonBody |
| DELETE | `/v1/templates/[id]` | row | operator | settings |  | — |
| POST | `/v1/templates/draft` | workspace | operator | ask |  | jsonBody |
| GET | `/v1/templates` | workspace | — | — |  | — |
| POST | `/v1/templates` | workspace | operator | settings |  | jsonBody |
| POST | `/v1/templates/starter` | workspace | operator | settings |  | jsonBody |
| POST | `/v1/templates/sync` | workspace | operator | settings |  | — |
| POST | `/v1/workspaces/create` | account | — | create_workspace |  | zod |
| GET | `/v1/workspaces` | account | — | — |  | — |
| PATCH | `/v1/workspaces` | workspace | owner | — |  | raw json |

