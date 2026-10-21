# 0068 · Health sees what broke

**Status:** Decided by Ruben on 21 October 2026 ("all approved as you suggest end to end": the plan's three steps and
its calls D1 to D6 as recommended), and built on the lane `console/health-sees-what-broke` from main's `9381ed0c3`:
the three steps in one change, its migration 00469. Plan, written against main's `01de97952` and production's rows of
21 October: https://claude.ai/artifact/Xx3cHR4xuJJ2T9XHp45U5N. Where this note and the code disagree, the code wins.

## Context

Decision 0066 moved the back office's platform cards to the Console's Health as they were: the health check's clocks
not running, the job backlog, the page timings, and each workspace's day. Of the twenty-two signals a health page
reads, Chanlytics kept nineteen and Health drew two whole. The jobs that failed for good, the deliveries that failed,
what paged us, the promises of decision 0031 a day at a time, the sends and calls and what the providers said of them,
the model's calls and what they cost, Ask, the connections, and the errors pages hit were each in a table or a log
line, and on no screen.

What paged us was noise: 112 of the 112 pages of the nine days before were from our own workspaces (the nightly
suite's and the old test one), which count as customers everywhere. Ask, the best-recorded part of the product, threw
away the one thing that says why a round failed: the API's own answer. When the key's credit ran out on 18 October,
the database kept that rounds failed, never why, and nothing paged.

## Decision

1. **Health judges against the targets we wrote.** Every state comes from `PLATFORM_NUMBERS` (decision 0031) through
   `pastTarget`, the pager's own reading, or from a door's own answer: Kept, A look, Missed, Not judged. A part with no
   number says Not judged, never Kept. No second set of thresholds, so the page and the pager cannot disagree.
2. **Ours is a mark of its own** (`tenants.ours`, 00469; the plan's D2, done this way). Status `test` takes a
   workspace's public pages away, and the nightly suite opens its desk-sign page, so our own workspaces keep their
   status and wear `ours`. Health opens on Customers (D1); Ours and All are one press away. The pager skips a
   workspace that is ours (D3): `jobs-tick`'s pages that name a workspace, the model watch, and the answer-rate check
   (`platform_answer_silence`, `platformDay`). Health still shows ours, under Ours. Ask's eval runs in the nightly's
   workspace, so its rounds are counted there (the plan's fix C).
3. **One read, eight parts.** `GET platform/health?days=7|30` answers every part, each read on its own and said as
   null when it fails: the clocks beside pg_cron's record of their runs (`platform_clocks`), the clocks' judgement and
   the backlog (`sweep_health`, `jobs_backlog`), the failed jobs, what paged us (`operator_pages`), the nightly
   roll-up's days, every part's numbers (`platform_health_parts`, one aggregate per part with its percentiles in SQL,
   each row keyed by whether its workspace is ours), the errors pages hit, and the page timings. The overview draws
   eight tiles (Promises, Background work, Deliveries, Sends, Calls, Webhooks in, Ask, App speed), Needs a look worst
   first with its fix beside it, the promise grid, the first clocks and the pager; each part is a tab on the address,
   `/console/health/<part>`.
4. **What needs a look carries its fix.** Each row says what, why, where and since; beside it, what the door answered,
   a plain reading of that answer from its shape (a 4xx is the request, a 5xx or a timeout is the provider's, a run
   that did not finish is unknown: `failureReadingOf`, never a model), and one act. Run again is the existing requeue
   door, which never runs a send. Deliver again (`POST platform/deliveries/redrive`, act `delivery_redrive`) schedules
   every failed or paused delivery of one subscriber once more. Both ask why first, as every act of the Console does.
5. **The model's failures keep their reason.** `ai_usage` gains `error_type` and `error_message` (the API's own
   `error.type`, else a timeout, a status or the network; its words cut to 300). Ask's failed round passes them, and a
   reply that says the credit ran out pages the platform as `model_credit`, once per the pager's own memory. Ask's
   words to the owner were already right on main (the plan's fix B).
6. **Errors nobody reported are kept thirty days** (D5). The beacon (`POST client-errors`) keeps a row besides its log
   line (`client_errors`, 00469): the error's fingerprint, the same short id Get help sends, so a member's report lands
   on its group; the boundary, the page, the first line of its words, the build and the device; and a 16-hex hash of
   who, so Health counts people without knowing them. Never the stack, the workspace or anyone's words. A nightly
   clock (`purge-client-errors`, registered in `sweep_status`) keeps it to thirty days.
7. **Ask is a part of its own.** Its tile and tab read what each answer already keeps (its trace in `ask_messages`,
   its rounds in `ai_usage`): the whole answer and its first words at the median and the 95th, the stages, the rounds,
   the cache, the tools, every failure in both voices, and each workspace's cost, ours marked. Never the words anyone
   asked: reading a conversation is an act with its reason, elsewhere. Anthropic's API tracing to a backend of ours is
   a later choice (D6), not needed here.
8. **The outside pinger is Ruben's to check** (D4): whether something outside the product asks `/api/health` every
   minute. Nothing in the repository says it was set up.

## Shape

- `supabase/migrations/00469_health_sees_what_broke.sql`: `tenants.ours`; `ai_usage.error_type` and `error_message`;
  `client_errors`, its purge clock and its `sweep_status` row; `platform_clocks`; `platform_health_parts`;
  `platform_answer_silence` leaving ours out. Each function the service role's alone.
- `packages/db/src/repositories/console/health.ts`: Health's reads and the two writes beside them.
- `packages/contracts/src/console/health.ts` (the read, the tiles, Needs a look, the head's words), `health-scope.ts`
  (whose numbers), `health-clocks.ts`, `health-promises.ts`, `health-parts.ts`, `health-ask.ts`, `health-errors.ts`:
  pure, every sentence the page says. `ai/usage.ts`: the error columns and `creditRanOut`.
- `apps/dashboard/src/server/platform/health.ts`: the read, Deliver again, and the beacon's row;
  `app/api/v1/platform/health`, `app/api/v1/platform/deliveries/redrive`.
- `apps/dashboard/src/surfaces/console/health/`: the screen, its tabs and their parts.
- `apps/edge/lib/model.ts`, `lib/ops/ask-turn.ts`, `lib/ops/jobs-tick.ts`, `lib/ops/model-watch.ts`, and
  `packages/channels/src/models/anthropic.ts`: the reason kept, the credit paged, ours left out of the pager.

## Deploy order

Either. 00469 is applied to production before the merge, and adds only columns with defaults, a table and functions;
an edge or a dashboard from before it reads none of them. After it, our own workspaces are marked by hand
(`update tenants set ours = true where slug in (...)`: the nightly suite's and the old test one; status `test` ones
are marked by the migration).
