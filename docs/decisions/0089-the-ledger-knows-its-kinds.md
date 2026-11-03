# 0089 · The ledger knows its kinds: one row and one policy a kind, every ending settled, watched from outside

**Status:** Built on the lane `jobs/the-ledger-finished` from main's `6c4da4d1d`, 3 November 2026, on Ruben's approval of
the PRD (`Claude Video/docs/2026-11-03-prd-the-job-ledger-finished.md`, "continue all phases end to end"), with the
decisions D1-D9 taken as the PRD recommends. Migrations 00515 to 00518 (claimed at the push; built as 00506 to 00509). Not yet
merged. Where this note and the code disagree, the code wins.

## Context

The jobs ledger's core was sound (claimed means started, a send is never run twice, every exit a compare-and-swap,
jobs_guard in the database), and its loose ends were at its edges, read on main `6c4da4d1d`:

- Nothing outside the database proved the loop ran: `/api/health` judged the ten-second poll by its own look, and nothing
  outside asked it (0068, item 8).
- `settleJob` settled 3 of 17 kinds; preview_build, history_import and booking_read made their subject final only inside
  a THROWN last try, so a run killed on it left an import "running" and a preview "building".
- A kind's facts sat in a dozen places in two languages: the jobs.kind CHECK re-spelled in 17 migrations, the lane
  re-made in 7 (each a rewrite of the table), the once-only rule in packages/jobs for its writers and in three bespoke
  indexes for the fifteen SQL functions that insert jobs, and four untyped tables in ledger.ts.
- A retry waited as `fired` with a long lease, so cancel, withdraw and an erasure's cancel missed it: an `inbound_answer`
  waiting to retry kept the customer's words past their erasure.
- The receptionist's held reply was written, then its job: a run killed between them left a reply nothing would send.
- A broadcast resumed by the ledger alerted its owner at every death, and a finished run whose event write failed was
  told as stopped.
- `job_capacity` was counted on every claim and never written; a short hold waited for the ten-second poll; Health
  counted scheduled rows alone; a kind could not be paused; and the runbook had nothing on the ledger.

## Decision

1. **A kind is one row and one policy.** `job_kinds` (00515) holds each kind's lane, once-only rule (`once_parts`, and
   `once_kept`: held while kept, or only while live) and pause; `jobs.kind` references it and the CHECK goes. A trigger
   before every insert (`jobs_take_their_kind`) writes the lane and the key from the row, whoever the writer is, so a SQL
   function's insert and packages/jobs' are held alike and the rule is spelled once. `jobs.lane` becomes a plain column
   (its values kept). In TypeScript, `KIND_POLICY` (packages/jobs kinds.ts) holds whether a kind speaks, its retry waits,
   who hears of its failure, whether the ledger settles it, whether it needs the workspace's wires, its longest call,
   the ids its payload must name and what it never carries; `HANDLERS`, `SETTLERS` and contracts `JOB_WORK` are each a
   Record over `JOB_KINDS`. `jobs/job-kinds.test.mjs` holds the sides equal.
2. **Every ending is settled by its kind.** `conclude` reaches the kind's settler for a thrown last try, a death the
   ledger gave up on and an unknown kind alike; preview_build, history_import, booking_read and event_deliver gained
   settlers, and the handlers stopped settling themselves.
3. **Waiting means scheduled.** jobs_guard lets `fired` go back to `scheduled` with its attempts kept (or one fewer, for a
   run that never started); `deferJob` writes that, so a waiting retry is withdrawn, cancelled and erased as any
   scheduled row is.
4. **One key index for the kept kinds.** `jobs_dedupe_kept` replaces `jobs_email_ingest_uq`, `jobs_lead_collect_once`
   and `jobs_reply_read_once` (decision 0033, step 3): built online and alone in its file (00517), the three dropped
   only once it is valid (00518). A requeued copy names the job it copies (`requeue_of`): once per
   failed job by design, where a whole-payload equality missed a copy made inside a request.
5. **Ids, not people, where either deploy order allows.** A reply's words are not copied onto its job (`never`), and the
   receptionist's draft is queued with its job in one statement (00516 `queue_send`), its address frozen on the row
   (`meta.to`), which the send reads first. A member's reply keeps its order (the message, its receipt, then its job), by
   design: a kill before the receipt must not send, and its orphan is the deadman's. A text's answer job keeps the
   provider's message, from which the inbound phase runs again; an erasure now reaches it while it waits.
6. **Watched from outside.** A `canary` kind, scheduled every minute in our own workspace (jobs-canary), judged by its
   newest done row (`sweep_status.judged_by 'job'`), so `/api/health` names `jobs_canary` when the loop stops, with no
   change to its wire shape. The outside pinger on it is Ruben's (0068, item 8).
7. **Running it.** A kind can be paused (`job_kind_pause`, `job_kind_resume`; the Console's Health, Background work), and
   the health sweep pages while it is. The Console runs every failed job of a kind again in one press. Health reads the
   ledger now (`jobs_ledger_now`). `jobs_backlog` counts a lease that ran out. The tick binds the workspace's wires only for
   a kind that sends. The mass-failure and reply-late pages count customers' work alone. A handler may say it skipped,
   which is recorded done and counted apart.
8. **Lateness and the clock.** A member's reply carries `stale_after` (its grace plus `MEMBER_REPLY_STALE_MS`, 30
   minutes, D3); past it the send door refuses it as too late and its thread is handed to the person. `jobs-tick` asks
   every two seconds: a row that came due in the last three knocks at once, the rest of the ledger is asked every ten.
9. **Broadcasts.** A run the ledger hands to a fresh one tells nobody (D5); `finish_broadcast` (00516) marks a run sent and
   writes its event in one statement.
10. **Removed.** `job_capacity` and its clause (D4); the deploy-order shims for 00333 and 00352 in packages/jobs and
    packages/db.

## Declined

- A second clock outside the database (D2): the canary and the pinger detect a stopped pg_cron within three minutes.
- A `waiting` state (D6): `scheduled` with its attempts kept is the same fact with no new state.
- A SQL `schedule_job` function every writer calls: the insert trigger holds every writer to the one rule without making
  fifteen functions again.

## Steps, each shippable in either deploy order of the two apps

The migrations go first (both are additive but for the dropped indexes, CHECK and table, which nothing after them reads),
then the apps in either order. An edge before the dashboard reads a member's reply's address from its payload as before;
a dashboard before the edge writes `stale_after`, which an older edge ignores.
