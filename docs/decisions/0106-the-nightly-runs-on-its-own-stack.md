# 0106 · The nightly runs on its own stack

**Status:** Built, 7 November 2026: `#2158` moved the suites, `#2168` read every red, and this note's pull request says who is
told. No migration. `PAGER_KEY` is not set, so production's red files its issue and pages nobody until Ruben sets it.

## Context

Ruben, 6 November 2026: should the nightly be refactored or reset, and would that avoid an upgrade. Written against
`8c4252ef2`.

The whole Playwright suite ran on production, as the e2e owner, in the suite's own workspace, and the Node suite ran with the
service key, writing and deleting there. That was about 125,000 database reads a night, one cold open at 233 reads for each of
about 450 attempts. Production's database VM (0.91 GiB) rebooted during that job on 1, 4 and 6 November. The cause is strongly
correlated, not proved. The suite had been red for 34 runs in a row, so a new failure looked like the old ones, and a checkout
at one commit tested whatever had deployed since.

## Decided

1. **The Node suite takes no database and holds no secret.** `nightly-database.yml` already runs every suite that needs one, on
   a stack of its own. Coverage did not move: 99.0, 97.5 and 96.4 against 99.0, 97.6 and 96.3.
2. **Every spec runs on a copy of the commit:** a local stack and its own production build on the runner, with production's
   hostnames pointed at the runner so a mistake fails there. The specs and the app are one commit. It serves on `localhost`,
   since Next says a request's host as localhost and the proxy's rewrite otherwise re-enters and answers 307.
3. **The edge is a stub that refuses and logs.** The suite reached for one path, 60-odd times. A queued reply is therefore never
   taken on a copy, and the thread spec writes what the send writes, so **the path from the send worker to the page is held by
   the node tests alone.** Running the edge's job tick there imports about 25 modules that can reach outside services.
4. **One job holds production's key,** and runs a short list: `e2e/production/` (the speed budgets and one signed-in walk), the
   auth doors, the coverage spec, the policy's headers and Ask's day. About 2,150 reads, two minutes. It creates no workspace. A
   runner's timing says nothing about a customer's, so the budgets stay here, and the full walk of every surface for the policy
   stays on the copy (3,824 reads on its own); the walk watches the pages it opens.
5. **A red says which it is.** The suites' red files `Nightly e2e is red`, assigned to the owner, and never pages: no customer
   is on the stack. Production's files `Production check is red` and pages at its first red (`production_check_red`), since a
   customer may be seeing it. A check that did not run says nothing of production and pages nobody.
6. **A red may be quarantined, and the number may only fall:** one shape, `test.fixme(true, "quarantine: <date> <why>")`, said
   apart every night and counted per file (`e2e-quarantine`, check:debt). None is in it.
7. **The skip ceiling is zero.** The workspace is the run's own, so it holds still, and the first skip for want of data is a red
   night. It stood at 11 on 7 November, the coverage the seed did not give, and each of those now runs: six on what only a copy
   may hold, four where a spec read an old page or another spec's leftover, one over a read only the edge can answer.
8. **A dispatch can name its specs** (`-f specs="e2e/leads.spec.ts"`): those alone on the copy, in minutes, no issue filed. It is
   the only way to run a spec on a stack from a machine that has none.
9. **A copy holds what production's sweeps would act on,** which the seed cannot write there: the paused Win-back
   (`--seed-win-back`), a run waiting for an OK and emails handed to their owner
   (`tooling/scripts/e2e-harness/copy-states.mjs`, which refuses any address but the runner's). Only `whole` runs them, nothing
   sweeps a copy, and the seed's own check, which production's job runs, still names a run left waiting.

## What it does not do

It does not remove the need for the Small compute upgrade. Production's VM commits 94% of its limit when quiet, whatever the
nightly asks. And the sessions on Ruben's machine asked about 21,500 reads as the e2e owner in 55 minutes on 6 November, ten times
what the nightly now asks.

## How to reverse each

| What                              | How                                                             |
| --------------------------------- | --------------------------------------------------------------- |
| Production pages at its first red | `--page-after 2` in `report`                                    |
| The suites never page             | add `--page-after` and `--condition` to their step              |
| The list production runs          | the `run:` line of the job, pinned by `workflow-rules.test.mjs` |
| The Node suite takes no database  | its job's env                                                   |
| The stub                          | set `EDGE_URL` to a real edge, and take the hosts line out      |
| The ceiling                       | `E2E_MAX_SKIPS` on `whole`                                      |
| What a copy holds                 | the two seed steps of `whole`                                   |

## Tests

`repo/settings/workflow-rules.test.mjs` holds the jobs' shape and who holds which secret, `edge/page-door.test.mjs` the conditions
a workflow may page for, `e2e/skip-ceiling.test.mjs` and `repo/code-health-ratchets.test.mjs` the quarantine, `e2e/session-kept.test.mjs` the one session a run, `e2e/e2e-copy-states.test.mjs` what only a copy may hold.

## Open

Three nights' reads, reboots, reds and minutes are owed. A week of boots with no reboot is what would say the reboots have
stopped. `PAGER_KEY` is Ruben's: until it is set, the issue is the only word.
