# 0066 · The Console

**Status:** Decided by Ruben on 21 October 2026, and built on the lane `console/before-launch` from main's `20f5dd3af`: the
before-launch tier, in one change, its migration 00467, merged in #1770 (`29071de24`) the same day. The Console canvas was approved first ("Approved. Plan the
before-launch tier as one lane"), then the lane plan and its five calls ("Yes to all five"). Canvas:
https://claude.ai/artifact/AUv63RTL9knuG3JYSSgJ7x; plan: `Claude Video/docs/2026-10-21-console-before-launch-plan/index.html`,
written against main's `b2c29fd73`. Where this note and the code disagree, the code wins. The status was read again at `e9d6325f0` (26 October 2026).

## Context

The back office (00091, decision 0015 step 11) is a pane of a workspace's Settings, gated by `is_platform_admin()`. It lists
every workspace by who needs a person, opens one as its owner sees it, and acts on its lines, failed jobs, waiting list and
partners, each act recorded against the person before it runs. It has no role but "admin", asks no second factor, keeps
its record of acts only on each workspace's own events (`events.tenant_id` is not null, so an act on the waiting list or a
partner's payout has nowhere of its own to be told), and takes no reason. Customers reach support by writing to
hi@chanlytics.com from four public pages; a page that breaks for them is logged and nowhere else; the data-deletion page
promises a workspace deleted within thirty days of its owner asking, and nothing keeps that clock.

## Decision

1. **The Console is its own place, `/console`**, beside the workspaces under the signed-in frame's gate (the proxy), with
   a frame of its own that reads no request (decision 0053, step 5). Settings › Back office becomes a link to it.
2. **Three roles: owner, support, billing** (`platform_admins.role`). Each route of the platform scope names the roles it
   admits, and `route-policy.json` shows them: a write its act (contracts `CONSOLE_ACTS`), a read its sight when only some
   roles read it (`CONSOLE_SIGHTS`). What each role reads is the approved canvas's matrix: every role reads Home,
   Workspaces, Support, Find, a workspace, Partners, Health and the Admin log, each screen offering a role only the acts
   it may take; the privacy requests are read by owner and support, who work them. Staff are added and given a role at
   the database alone (`platform_admin_add(email, role)`), never from the app.
3. **A second factor for every staff session, every time, no grace** (Ruben, 21 October). `is_platform_admin()` asks for
   `aal2` too, so every database door behind it asks for it; the dashboard's door answers `mfa_required` first, which
   sends the tab to `/verify?for=console` to set an authenticator up or give its code. The roles are held at the route,
   which also writes the log: the partner functions of 00205-00217 ask `is_platform_admin()` alone, so staff calling one
   with their own session pass as any role, and take no reason. Putting `platform_role()` into those functions is owed
   (`docs/debt.md`).
4. **Every act asks why and is written down before it runs.** One table, `platform_acts`: who, their role, the act, the
   workspace when there is one, the target, the reason's kind (a ticket, they asked on a call, found by us, cleaning up),
   the ticket, a note, then what came of it. A write that cannot be recorded does not run. The workspace's own trail keeps
   its `platform.acted` event, as today.
5. **Report a problem.** A customer reports from a card that failed, an error screen, or Settings › Profile; the page and
   the last error (a short stable id) go with their words. The report is a row first (`support_reports`, numbered R-1001
   and up), then a mail to `SUPPORT_TO` (hi@chanlytics.com) with Reply-To the person, sent by the edge. A mail that fails
   leaves the row, said so in Support.
6. **Requests keep the public promise's clock.** `privacy_requests`: a workspace to delete (due thirty days after its owner
   asked), a person's request passed to the business, a copy of everything; each with its steps, kept after the workspace
   is gone. The delete itself stays `tooling/scripts/ops/delete-tenant.mjs` until the next tier.
7. **Home says what needs a person**: the workspaces that need us and those waiting on their owners, what came in (reports
   and setup asks), what is due (requests, failed jobs, partners' standings), the waiting list, four numbers, and who has
   taken a workspace (`platform_claims`, four hours or until let go).
8. **Find** reaches a workspace by its name or slug, its owner's email, its line's number, a caller's number (the
   workspace only, never who called) or a report's words, through one function the database checks the caller for.
9. **What moves in as it is:** the workspaces list, a workspace's Setup and lines and its trail, Partners and Health.

## Shape

- **Contracts:** a `console/` folder: `console.ts` (roles, acts, reasons, Home, the groups, claims, words), `requests.ts`,
  `support.ts` (reports, setup asks, Find) and `console-schema.ts`;
  `shell/report-problem.ts` with its schema; `shell/client-error.ts`'s `errorIdOf`; the second factor's staff words.
- **Database (one migration):** the role, `platform_role()` and `platform_staff_state()`, `is_platform_admin()` asking for
  `aal2`, `platform_admin_add(email, role)` (adds, or changes the role), `platform_acts`, `support_reports`,
  `privacy_requests`, `platform_claims`, `platform_find(q)`, `platform_model_spend(days)`. Its reads and writes are
  `packages/db/src/repositories/console/`.
- **Server:** `server/platform/platform.ts` holds the staff door (role, email, second factor); `acts.ts` the act helper
  and the log's reader; `console.ts` and `requests.ts` the Console's reads and writes; `report.ts` Report a problem.
  `route.ts`: a platform write names its `act`, and route-policy.json shows it.
- **Edge:** `api/admin/support/report.ts` over `lib/support.ts`; `SUPPORT_TO`; the platform mail takes Reply-To.
- **Dashboard:** `app/(os)/console/`, `surfaces/console/` (the frame and every screen; the back office's cards, lines and
  partner rows moved in by `git mv`), `surfaces/frame/report-problem.tsx` (the report sheet and its host), the kit's
  report door on the failed card; Settings' Back office row is a link to the Console.

## Steps

1. Contracts first: words and shapes.
2. The migration, its registries, and its database tests.
3. The staff door, the act helper, a reason on every platform write.
4. The Console's reads and writes.
5. Report a problem, in the app and on the edge.
6. The frame, and the back office moved in.
7. Home, Support, Requests, Find, the Admin log, a workspace's Overview.
8. The proofs, one review, one pull request. The migration is applied before the merge; `SUPPORT_TO` is set on the edge;
   after the deploy billing@ takes the billing role.

## Not in this note

Money, a workspace's Billing and People tabs and its other acts, Switches, Team and the on-support rota, what paged us and
browser errors kept, the inbox's card, deleting from the Console, Growth, See as the owner, the Console on a phone. Each is
drawn on the canvas, for the tiers after this one.

## Risks

- Between the migration and the deploy the old pane refuses a session that has not shown its second factor; only the
  platform's staff are affected, for minutes.
- An inbox may not file a mail under its Reply-To; the report's body carries the person's address either way.
