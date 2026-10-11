# 0044 · A moment, a pause and a snooze are due rows

**Status:** Decided on 10 October 2026 (Ruben: "review and go with the best suggestions for chanlytics"), and
**amended later that day**, before its jobs were written (Ruben: "continue next as you suggest end to end"): the
times are rows already, so no job kind is made; the clocks that carry them out are classified `due`, and the deadman
`reconcile`, as built with the amendment (see "Amended"). 0031's "the reminder as a job on a due row" and invariant 6 ("time is a row"). Written against commit
`ef0aea36a` (main, 10 October 2026), amended against `4953875c2`. Where this note and the code disagree, the code
wins.

## Amended, 10 October 2026

Building step 1 found 00098, "Time lives in the row", which retired the very job kinds step 1 would bring back
(`pause_expire`, `snooze_wake`): a pause and a snooze keep their deadline on the conversation (`paused_until`,
`snooze_until`), so a job held a second copy of that time, and the two had already disagreed once (a pause that ran out
while the customer's request for a person was still open). The same holds for every wait this note and 0043 step 4 put
on a job:

| Clock       | The time, on its row                                                                                          | A job would be                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `pauses`    | `conversations.paused_until`, `control_until`                                                                 | `thread_wake`: a second copy                                                |
| `snoozes`   | `conversations.snooze_until`                                                                                  | `thread_wake`: a second copy                                                |
| `deadman`   | `escalations.created_at`, plus a two-hour constant, told once (`deadman_alerted_at`)                          | `hold_check` (0043 step 4): a second copy                                   |
| `playbooks` | `playbooks.run_hour` in the workspace's zone, and the day it last ran (`last_run_for`, 00245 `playbooks_due`) | `playbook_run`: a second copy, moved on every change of hour, zone or state |

A job is no sooner, or not by enough to matter: the ledger's heartbeat and the pauses' and snoozes' sweeps all tick
every ten seconds (00098); the playbooks' sweep runs at five past each hour, for moments due by the hour; and the deadman
runs every ten minutes, so a hold two hours old is told within ten minutes of it. What a job would add is isolation per run and room past the sweep's page of 25 per tick;
the playbooks sweep already stamps a run that failed and moves it to the back, and its backlog alarm (`playbooks_backlog`)
says when the page binds. That is the moment to revisit it, with the alarm's numbers.

So, in place of the decision below:

1. **No job kind is built:** not `thread_wake`, `playbook_run` or `hold_check`.
2. **The clocks are classified as what they are.** A clock that carries out a time its rows already hold is `due`
   (`tooling/scripts/tests/clocks/_clocks.mjs`), and names the columns (`times`) and the database function that reads
   them (`fn`), which `clocks/clock-kinds.test.mjs` holds to the schema. `pauses`, `snoozes` and `playbooks` move
   from event-shaped to `due`. The deadman moves to `reconcile`: most of its work finds what a crash left, which no
   row's time says (a message no turn finished, a reply no job was left to send, a run no job started), and its hold's
   two hours are a constant on the escalation's own time. Nine event-shaped clocks become five. The count fell because
   they were filed wrong on 6 October, not because any code moved; the five left (`calendar`, `lines`, `notes`, `reach_out`, `reach_out_check`) poll for what an event or a
   workflow step would say.
3. **Point 5 stands:** a moment draws its people from the appointments record once 0002's readers are built (lane A,
   step 3).

The decision as first written stays below, for what it weighed.

## Context

Nine registered clocks are event-shaped (`tooling/scripts/tests/clocks/_clocks.mjs`, `baselines/event-shaped-clocks.json`):
they scan for what is due instead of a row being due. Three of them hold a time a write already knows.

- **`playbooks`**, hourly at five past (`00048`): `playbooks_due` pages at most 25 running playbooks whose workspace's
  local hour has reached their `run_hour` and that have not run that local day (`runDueNow`), loads each workspace's run
  context (`apps/edge/lib/playbooks.ts`: the calendar feed read live, `peopleVisitsOf`), and `runPlaybook` assembles the
  day's run whole (00282, 00381: the run, its people, its `broadcast_send` job and its decision). The same sweep runs the
  reach-out's steps and its six o'clock lines. A visit's reminder is one such moment (`visit_tomorrow`).
- **`pauses`**, every ten seconds (`expire_stale_pauses`, 00006): ends a thread's pause, and its hold on who is
  speaking, once past its time.
- **`snoozes`**, every ten seconds (`wake_stale_snoozes`, 00082): wakes a snoozed thread once past its time.

The run is the unit everything an owner sees reads: the batch approval ("ready: N people"), the veto window, the cap per
run, the week's one breath across moments, and Campaigns' counts. 0031 imagined a reminder per appointment; a reminder
per appointment would need each job to join its day's run.

## Decision, as first written (superseded by the amendment above)

1. **A moment's day is a row.** A running playbook holds one due job, `playbook_run` (payload its id, keyed by the
   playbook and the local day, lane 2), due at its next `run_hour` in the workspace's zone. Its handler is what the
   sweep does for one playbook today, `loadTenantRunContext` then `runPlaybook`, and then it writes the next day's row.
   A run that fails keeps the day open and the ledger tries again; the catch-up to eight in the evening and the paused
   workspace's skip are the handler's checks, as they are the sweep's.
2. **The run stays the unit.** One run per playbook per local day, as today. A row per appointment is not built: it
   would change the approval, the veto, the cap and the counts an owner reads.
3. **The sweep reconciles.** The hourly pass keeps one job: it writes the missing row of a running playbook that has
   none (a playbook started, resumed or rescheduled; a zone or `run_hour` changed; a row lost), and reruns nothing. It is
   classified `reconcile`, and the reach-out's steps and lines, still scans, keep `playbooks` on the event-shaped list
   until a note moves them.
4. **A pause and a snooze are due rows.** The write that pauses a thread or snoozes it schedules its end as a job
   (`thread_wake`, keyed by the thread and the kind, lane 1), which ends the pause or wakes the thread only if the row
   still says that time; a later pause or snooze moves the job's time, an earlier end cancels it. `pauses` and `snoozes`
   leave the event-shaped list, and their sweeps become reconcilers at a slow cadence, for a row lost.
5. **Drawing from the appointments record waits on 0002's readers.** A moment keeps drawing its people from the feed
   until Reports, People and playbooks read rows together (0002, steps 4 and 5); a run then reads the feed's rows synced
   first, so it is never an hour stale.

A hold's two-hour check joins them (0043 step 4, moved here on 10 October 2026): `owner_notice` schedules it at the
hold's time plus two hours, and it tells only a hold still open, through the deadman's once-guard
(`escalations.deadman_alerted_at`). The deadman clock stays, as the reconciler and for the turns no write schedules.

## Steps, as first written

1. **`thread_wake`.** The kind with its handler, its callers (the pause and snooze doors), its CHECK and its lane, in one
   change; the sweeps keep running beside it until the reconcile proves it.
2. **`playbook_run`.** The kind, its handler, the rows written by `start_playbook`, a resume and a change of time; the
   sweep's reconcile pass; the moments' scan off the hourly path.
3. **The clocks' baseline** banks each fall in the change that makes it.

## Tests

- Each kind over a database in memory: due, early, moved, cancelled, already done, a paused workspace, a playbook
  stopped since its row was written.
- On a real Postgres: a pause written ends at its time through the ledger, once; a playbook's row writes the next day's.
- The run's own suites stay as they are: the run is unchanged.

## Risks

- **A running playbook with no row never runs.** The reconcile pass and its alarm (a running playbook past its hour with
  no run that day) hold it.
- **Daylight saving.** The next `run_hour` is computed in the workspace's zone at each write, never added as hours.
- **The sweep's throttles go.** `PLAYBOOKS_PER_TICK` and its yield budgets stop bounding the work; the ledger's lane 2,
  its capacity and its lag (invariant 7, invariant 12) bound it instead.
