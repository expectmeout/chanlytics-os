# 0115 · A clock hands out work

**Status:** Accepted by Ruben, 8 November 2026 ("Approve all six"), and built on his word of 9 November ("Yes, start layer 10"). Migrations 00569, 00570, 00571. 00569 and 00570 go in either order; 00571 only after the edge release is live.

## Context

Layer 10 of the road decision 0104 began: the work that runs with nobody watching. Read against eight production SaaS codebases and Google's, AWS's and BullMQ's written practice (the record is outside this repository, `docs/2026-11-08-layer-10-background.md`), the ledger itself holds: three lanes, the idle workspace first, retries by kind, what reaches a person run at most once. What it did not hold was the hour's biggest work, which never reached it.

Six clocks did their work inline, inside one sixty-second function, so each had a ceiling no rotation could lift:

| The hourly work           | The most in an hour | Past it                                            |
| ------------------------- | ------------------- | -------------------------------------------------- |
| Campaign moments          | 25, every business  | Waited, and a day's moment could miss its day      |
| Reach-out steps           | 25, every business  | The same                                           |
| Calendars                 | 40, every business  | Waited an hour more, three times over and an alarm |
| Google listings, profiles | 40 of each          | Read once a day at best past a thousand workspaces |

A rotation made that fair and an alarm (`note_sweep_backlog`, 00089) made it honest. Neither made it fit: at 1,000 workspaces, the working figure capacity is judged against (decision 1 below), most campaigns would not have gone out on their day.

## Decision

1. **Capacity is judged against 1,000 workspaces.** Ruben said to assume everything may be maxed out and gave no number; 1,000 is the working figure, and a bigger one changes only which clocks need work first.
2. **A clock finds the work and hands it out; it does not do it.** Four new kinds, each in the bulk lane, so a customer's reply still goes first: `campaign_moments`, `reach_out_steps`, `calendar_read`, `google_read`. A clock asks the database who has work due, through the one rule for what is due (`sequence_steps_due`, `calendars_due`, the listings' and connections' own), and writes each of those workspaces one job (`jobs_hand_out`, `sequence_steps_hand_out`, `calendars_hand_out`).
3. **One job a workspace, not a job a row.** The kinds' once-only key is the workspace (`job_kinds`, `@tenant`), so a clock that knocks twice costs nothing, and a workspace's moments run against one read of it, which is what keeps the week's breath between two moments of one hour.
4. **A job asks what is due when it runs**, of its own workspace (`tenantId` on the reads in `lib/shared/sweep-rotation.ts`, `lib/google/listing-check.ts`). A moment run by "Run now" since the clock looked is not run twice, a paused workspace starts nothing, and a second try runs only what the first did not. A job's payload is empty.
5. **Nine o'clock is not one herd.** Each job falls due inside five minutes (`HAND_OUT_SPREAD_SECONDS`), at a place set by a hash of its workspace, so the same workspace falls at the same place each hour.
6. **What a job does not reach stays due.** It starts nothing past its deadline, and the next hour's clock hands the workspace another job. A workspace with more than a hundred moments due in one hour finishes them over the next hours (`CAMPAIGNS_A_JOB`).
7. **Who hears of a failure.** One moment that fails is told as it was (`tellPlaybookFailed`); a job throws only when it cannot read what is due, or what it runs on, which is a database or a provider and nothing an owner can act on. So these kinds are `told: "platform"`, paged once per kind per window however many workspaces fail (`runner/handed-out-page.ts`), with the query that lists them. The work is late, not lost.
8. **The alarm goes, because the ledger has its own.** `noteBacklog`, its three-ticks-then-503 and the two `*_over_budget` lines are gone: the sweeps have no budget to run over, and the ledger's backlog page says when work outruns the runner. The function `note_sweep_backlog` and its column `sweep_status.backlog_ticks` go in 00571, once no running edge can call them.

## The rest of the layer

The same road's smaller moves, each held by a check:

- **What each clock can do is written down from the code** (`docs/capacity.md`, `corepack pnpm gen:capacity`). A limit raised changes the page, and a new clock arrives with its row. Reading it at 1,000 workspaces, one clock is tight: the reach-out sender, 28,800 emails in an eight-hour day against 30,000 if a thousand mailboxes each send thirty. It is the next to hand out if outreach is used that widely.
- **What a job carries is declared per kind** (contracts `JOB_PAYLOADS`, a Record over `JOB_KINDS`), and `scheduleJob` takes its payload by kind, so the compiler holds the sixty TypeScript writers. The twenty-six SQL inserts are held by a test. A claim reads each payload through its shape and for now only says what is off (`job_payload_unexpected`: the kind and the field names, never the values). After a clean week it refuses, as an edge door's body did (decision 0109), and `KIND_POLICY.ids` goes.
- **A job written after its fact says what catches a lost write** (`tests/jobs/writers/_job-writers.mjs`): a clock, a provider's redelivery, the job it is inside, or the person pressing again. Four kinds are caught by nothing, and each costs little: a phone's buzz, a stale push token, a website read, a net under an erasure that runs without it. A customer's reply, a booking or a send may not join them.
- **What reacts is written with its fact.** A kind in `event_subscriptions` may not be written by `emitEvent`, which only logs a failure. The one that was, `member.left` when a person deleted their account, is written by `delete_my_account` now, in the deletion's own transaction (00570).
- **What a subscriber reads is declared per kind** (contracts `SUBSCRIBED_EVENTS`), and a delivery says what is off (`event_data_unexpected`). The harness that runs each subscriber twice now asserts the first run acted: `reply_draft` had been running over an event it does not read, so its second run proved nothing.
- **The two event columns nothing filled go** (00571, amending decision 0032's step 6).
- **The last clock takes its knock from `sweepDoor`** (`channel-quality`), and **every `Promise.all` over a list says what bounds it** (`tests/repo/size/fan-outs.test.mjs`). Of twenty-seven, one could grow with a customer's volume: a WhatsApp delivery's receipts, which now go ten at a time.

## What a customer gets

Nothing changes while a business has room, which today every business has. Past the old ceiling, a campaign goes out on its day instead of waiting for a place, a calendar stays within its hour, and a Google rating stays fresh. A customer's reply still goes first.

## Deploy order

00569: either. With it first, the old edge's sweeps go on as they did and nothing writes the new kinds. With the edge first, the clock answers 500 until 00569 is on, which `sweep_health` says, and nothing is lost: what is due stays due.

00570: either. With it first, a deletion in the minutes before the dashboard deploys is said twice; with the dashboard first, one in those minutes is not said.

00571: the edge first. Until the release is live the event_deliver job names both columns in its read, so applying this ahead of it would fail every delivery.

## Tests

`tests/cron/cron-playbooks-door.test.mjs`, `cron-calendar-door.test.mjs` and `cron-doors-b.test.mjs` run a clock's knock and then each job it handed out, including two hundred workspaces in an hour, which the old ceiling could not. `tests/jobs/writers/a-clock-hands-out-work.db.test.mjs` holds the three doors on a real database: one job a workspace, the key, the spread, the kinds apart, the grants. `tests/jobs/job-kinds.test.mjs` holds the pages.

## What this does not do

- It does not move the other clocks. Mailboxes, drafts, leads and lines keep their own loops; the capacity table says which of them asks next.
- It does not change a moment's own rules: its hour, its day, its cap, its breath, its approval.
- It does not make a campaign's sends faster than the ledger's own rate; the ledger's numbers are held by `tests/jobs/jobs-lanes.db.test.mjs`.
