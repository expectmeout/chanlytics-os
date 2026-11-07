# The lead finder, as built

Written 3 November 2026 against `main` at `6c4da4d1d` plus the lead finder's refinement (00506). This is the
description of what runs. `docs/plans/2026-09-17-people-table-and-lead-finder.md` (PRD v3) is how it was designed,
and its five contracts (§0) still hold where this page does not amend them. Where this page and the code disagree,
the code wins, and this page is wrong.

## What it is

An owner says what businesses they want, in words, on the Leads page or anywhere Ask is open. Ask answers with a plan
card: the kind of business, up to five search terms, an area, a count, the contact preferred (a phone, or an email
checked) and what to leave out. Nothing is searched or spent before Approve. A search then runs in **rounds**:

1. **The probe.** 25 places across the terms the reserve holds a run for, judged, so the round learns its yield and
   can ask the owner whether what it is finding is what they meant (the question after 25). A probe that leaves no
   run's room goes to the checks on what it found.
2. **The main phase.** What the count still needs, over the probe's yield: a term not yet asked before one that was,
   and one asked again past what it read, since the provider answers a term from its top (`mainAsk`).
3. **The checks.** Every email found goes through the mailbox checker, so an address counts only once it is proved.

A round ends with one of nine endings (`packages/contracts/src/leads/search/endings.ts`). A later round of the same
search (Find new ones, Carry on, Try again) is a top-up or a renewal, sized from what the search found before.

A second card, **people at companies**, finds named people by title at companies (00430). It has no probe: one run,
its companies judged against what was asked (00474), each kept as a company lead with its people, waiting in Needs
review on its address until the checker answers.

## The five contracts, amended

- **Qualification (§0.1).** The judge answers per criterion; code decides the class
  (`packages/contracts/src/leads/search/class.ts`). One verified way to reach a business is enough (decision 0010,
  L1): the plan's contact is a preference, not a gate.
- **Counting and money (§0.2).** Only a Qualified lead counts. The month's allowance is still the constant 500
  (`lead_cap('month_leads')`); decision 0010's plan allowance (250) and packs are not built. Every spend is held to
  four counters, taken in one lock order: the month's leads, the month's dollars ($25), the workspace's day ($10) and
  the platform's day ($50) (`lead_reserve`, `lead_cap`). Since 00506:
  - the judge's dollars are settled when a round ends (`lead_rounds.judge_usd`, from the usage ledger's `lead_judge`
    rows under the round);
  - a mailbox check asked after its round ended (Check again, an addressee chosen) is asked only with room in this
    month's and today's searching (`lead_spend_room`, `lead_check_estimate`), and is charged where it runs.
- **Sources (§0.3).** Only Apify actors at pinned builds (`packages/core/src/leads/cards.ts`). The health sweep reads
  every pin by its build id, and since 00506 each actor's prices once a day against the last read
  (`apps/edge/lib/leads/sources.ts`, `lead_platform.prices`).
- **Consent (§0.4).** Amended by decisions 0056 and 0057: a lead is written to by a sequence to leads from the
  business's own connected mailbox, never from the platform's. A lead becomes a person only on a real conversation (a
  reply, a call marked Interested, a booking, a deal; `lead_convert_by`).
- **A search's life (§0.5).** Below.

## A round's life

States: `queued → probing → waiting_on_owner → running → checking → ended`, held by `lead_rounds_guard`, which stamps
`lead_rounds.state_since` on every move (00506).

The jobs (`packages/jobs/src/handlers/handlers.ts`), each a verb in `packages/core/src/leads/runner/`:

| Job                | Verb                    | What it does                                                                      |
| ------------------ | ----------------------- | --------------------------------------------------------------------------------- |
| `lead_round_start` | `start.ts` `startRound` | A run row per term by its deterministic id, claimed, then started at the provider |
| `lead_collect`     | `collect.ts` `collect`  | One page of a run: clean, identity, the judge, the class, one commit              |
| `lead_check`       | `check.ts` `check`      | A batch of 500 addresses to the mailbox checker                                   |

**Each page is one commit, with its next job.** `lead_collect_commit` inserts the leads and members, counts, settles
the provider's usage, moves the offset, moves the round and writes the job that follows, all in one transaction: the
run's next collect, the round's checks (`lead_check`, batch 0) or the main phase's start (`lead_round_start`, resume).
Before 00506 the checks and the main phase were written after the commit, and a function killed between the two left a
round waiting on a job nobody wrote. `packages/core/src/leads/runner/round-decision.ts` decides what follows.

**The judge's time.** A lead job has at least 32 seconds of a tick (`packages/jobs/src/runner/ledger.ts`). The judge is never
started with less than its own 28-second bound left (`runner/rules.ts` `JUDGE_MARGIN_MS`); the second model's screen
(decision 0085) is asked only where the judge keeps that bound after it (`SCREEN_MARGIN_MS`); and a refused answer is
asked again only while the bound is still left, or its places wait in Needs review.
`tests/leads/engine/tick-geometry.test.mjs` holds the numbers to each other.

**The sweep** (`apps/edge/lib/leads/sweep-plan.ts`, every five minutes):

- **Runs.** A running run nobody is collecting gets a collect; one past 45 minutes is aborted and read once more; a
  lost start is reconciled from the provider's own list; a run whose collects failed three times is given up.
- **Rounds.** Each round that has not ended is asked what it needs next (`runner/next-step.ts` `nextStepOf`). A round
  quiet for ten minutes with nothing of its own live is carried on from where it stands: its start, a collect of its
  newest finished run, or its checks. Each of those is idempotent. Only a round nothing can carry on, or one carried on
  three times and still quiet, is ended, through `lead_round_end_stuck`, which looks again under the round's lock, and
  with the ending it had pending.
- **No address left Checking.** A round's end marks every lead of it still `checking` as `unknown`, so Check again
  can take it.

The question waits a day (`QUESTION_WAIT_MS`); unanswered, the round ends `question_unanswered`, keeping what it
found, and since 00506 the bell says so.

## Where to look

| For                             | Read                                                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The plan, its words, its prices | `packages/contracts/src/leads/search/` (`plan.ts`, `cards.ts`, `class.ts`, `endings.ts`, `caps.ts`)                                                |
| The runner                      | `packages/core/src/leads/runner/` over `packages/core/src/leads/ports.ts`                                                                          |
| The runner's database half      | `apps/edge/lib/leads/db.ts` (the edge's binding of core's `LeadDb`)                                                                                |
| The provider and the judge      | `packages/channels/src/leads/apify.ts`, `packages/channels/src/leads/judge.ts`, `apps/edge/lib/leads/wires.ts`                                     |
| The webhook                     | `apps/edge/api/apify-webhook.ts`, `apps/edge/lib/leads/apify-delivery.ts`                                                                          |
| The sweep                       | `apps/edge/api/cron/leads.ts`, `apps/edge/lib/leads/sweep.ts`, `apps/edge/lib/leads/sweep-plan.ts`                                                 |
| The routes                      | `apps/dashboard/app/api/v1/lead-searches/`, `apps/dashboard/app/api/v1/leads/`                                                                     |
| What they call                  | `apps/dashboard/src/server/leads/`                                                                                                                 |
| Ask's cards                     | `apps/dashboard/src/server/ask/tools/act/leads/`                                                                                                   |
| The page                        | `apps/dashboard/src/surfaces/leads/`                                                                                                               |
| The doors in SQL                | `supabase/migrations/00140_the_lead_finder_engine.sql` and the migrations after it to `00506_a_search_never_stalls_and_every_spend_is_counted.sql` |
| The tests                       | `tests/leads/`; the seeded simulation of a whole search under faults is `tests/leads/rounds/the-search-survives.test.mjs`                          |
| The weekly real search          | `.github/workflows/leads-weekly.yml`, running `e2e/leads.spec.ts`'s paid search                                                                    |

## What is owed

- Decision 0010's L2 (the plan's allowance), L3 (packs) and the rest of L4 (the dollar cap scaled to what a workspace
  may draw). Each needs a call that is Ruben's: the pack's size and price, whether credits expire.
- A trial searches nothing (`maySpend` admits only `active`). A small first search is Ruben's call on spend.
- Reports has no Leads lens (`packages/contracts/src/reports/lenses.ts`, "Leads in phase C"). It needs a canvas
  first.
- A term asked again pays again for what it read, since the provider has no offset (`lead_runs.already_yours` counts
  them since 00506). `mainAsk` goes to a term not yet asked first, so this is what a search pays only once it has none.
- The membership doors fold into one (`docs/debt.md`'s rows for `lead_search_members`, `leads` and `lead_searches`).
- The runner's table reads move behind repository functions in `packages/db`, with the binding staying in the edge
  (packages/db does not import core's ports).
