# Sequences: the build (decision 0060)

Ruben approved the Sequences canvas "as recommended" on 15 October 2026 (D1 to D8) and asked for it to be built with the
best backend wiring, by one session, no sub-agents. Lane `sequences/one-model` in `cm-phone`, from main `7c9fbc91a`.
This file is the ledger: each step, and where it stands. Tick a box only when its proof ran.

## How the storage moves without breaking anything

The old five tables are not rewritten in one go. S1 renames and merges them into the sequence tables and leaves a view
under each old name (security invoker, automatically updatable: a select, an insert, an update and a delete through it
reach the new table under the caller's own rights). Every SQL function and every caller that names an old table keeps
working, so S1 is proven by the existing suites passing unchanged on a replay. Each later step moves code onto the new
names; S6 drops the views once nothing names them, after the deploy.

Old → new, S1:

| Old | New | How |
|---|---|---|
| `playbooks` | `sequence_steps` + `sequences` | renamed; each root playbook is a sequence with the same id (a sequence's first step shares its id), each chain step a step of its root's sequence, in its place |
| `broadcasts` | `sequence_batches` | renamed; `playbook_id` → `step_id`; `sequence_id` added; a one-off is a sequence of its own (`starts = 'date'`, same id) |
| `broadcast_recipients` + `reach_out_sends` | `sequence_sends` | merged; a customer's send has a `contact_id` and no `lead_id`, a lead's has a `lead_id`; `broadcast_id` → `batch_id`, `playbook_id` → `step_id`, `root_id` → `sequence_id`, `attempt` → `attempts` |
| `reach_out_replies` | `sequence_replies` | renamed; `send_id` keys `sequence_sends` |
| (none) | `sequence_enrollments` | S2: someone in a sequence, where they stand, why they left |

## S0 · Fixes that don't wait

- [x] Members' direct write on a run's state goes (00441: the grants and the acting policies on `sequence_batches` and its view revoked); the cancel port presses `sequence_batch_cancel`, only from the state it read, and the database test proves a member's own write is refused.
- [x] Reply drafts read the connected mailbox when the workspace has no hosted one (`reach-out/reply-draft.ts`: its hosted mailbox, else the first it connected; the edge's port test drafts for one with no hosted mailbox).
- A run's blank name and the idle words' renderer are the old pages', which S4 replaces: not fixed there.

## S1 · One storage

- [x] Migration (00439): `sequences`; the renames (parts renamed with their tables); `sequence_sends` (two families, each its states, guard and keys); the five views (security invoker, each family's with its check option); the five readers that returned `reach_out_sends` rows made again over its view; keys, row security, grants, tells; the rows analyzed once carried.
- [x] The registries: erasure, delete-tenant, tenancy, realtime `WATCHED` and contracts `RECORD_KINDS`, schema sets (and contracts' pins), db types, schema snapshot, data model, unique keys. The ledger's `--record` waits for the last edit.
- [x] Proof: replay from zero on a throwaway stack (563xx → 59321); every database suite run: 1,294 passed and 34 failed, every failure a test naming an old constraint, index, policy or tell, the 00416 re-run, or the scale world analyzing the old names (views: nothing analyzed, so the planner seq-scanned); each moved, and the failing files pass again. Two finds fixed in 00439: a link trigger looked a parent up within the workspace (a cross-workspace row failed as 23502, not the fence's 23503), and a removed chain must keep its canceled runs.
- [x] TypeScript on the new tables: `packages/db`, jobs, the edge and the dashboard's server read and write `sequence_*`; the old pages' readers alias the moved columns (`playbook_id:step_id`) so their rows keep their shape until S4 replaces them; a lead's send is its own row type (`ReachOutSendRow`, its lead named). Core keeps its port vocabulary (playbook, broadcast, root) and its SQL payloads' keys; renamed when S6 retires what reads them.
- [x] Glossary: the sequence words (sequence, step, batch, send, in a sequence); "never 'sequence'" left. `docs/naming.md` names 0060 the one rename.

## S2 · One loop

- [x] `sequence_enrollments` (00440), kept by the sends themselves (`sequence_sends_move_enrollment`) and the leave door; backfilled from the sends. The lead clock's readers over `sequence_sends` (`sequence_claim_from`, `_claim_drafts`, `_held_stale`, `_stale_sends`, `_queued_outcomes`, `_closed_sends`, `_unchecked`), the claim keeping the old lock key; the due steps (`sequence_steps_due`).
- [ ] Core: the moment run and the leads run write sequences, steps, batches, sends, enrollments by their new names.
- [ ] Edge: one clock, two cadences; the sweep and the leads clock over the new tables.
- [x] A customer's sequence takes more steps (D6): after N days, with no booking or no reply. SQL (00440: the shape, `only_if`, `sequence_follow_ups_due`) and core's run of a follow-up step (`runPlaybook`: who is due, who still meets `only_if`, who leaves and why), with the edge's ports.
- [x] Words versioned per step: new words wait for WhatsApp without stopping a sequence, with their own values (00440 `next_template_*`, `next_params`, promoted together when WhatsApp approves; 00441 `sequence_step_words`). A waiting message's row may go and its name still waits.

## S3 · Readers and verbs

- [x] `sequence_overview`, `sequence_steps_of`, `sequence_people`, `sequence_history` (00441, invoker SQL under row security) behind the server readers (`readers/sequences.ts`) and their routes: `GET sequences`, `sequences/:id`, `/:id/people`, `/:id/history`. Ask's tools over them owed.
- [x] One Needs you count, read by the list, the badge, Today and Ask: the overview hands each batch waiting for an OK with its step, day and moment, and the reader counts only those an OK can still send (contracts `sequenceWaitsNow` over `runWaitsOnYou`, the badge's own predicate), so the list, the record's notice and Ask say what the badge says.
- [ ] Doors and verb specs: start, change, state, step change, batch decide, send decide, send said, leave, stop, undo, test. Built: step change (`POST sequences/:id/steps`, `PUT|DELETE …/steps/:step`, `POST …/steps/:step/words`: a step's values judged by core `templateValues`, the message named as its row names it), leave (`POST sequences/:id/leave`, only places in that sequence) and batch cancel; each writes its decision in its own transaction (`change_step`, `leave_sequence`). The rest still go by the old routes until S4's page presses them.
- [ ] Ask runs every sequence (no more refusals of a sequence to leads).
- [ ] Reports reads the new tables.

## S4 · The page

- [x] Campaigns › Sequences · Messages · Ads; addresses `campaigns/sequences/<id>[/people|/history]`, `campaigns/sequences/new`. Messages is the Library (`messages`, the path's `templates`) in the strip beside Sequences where the preview is on (`messagesChrome`); its own `campaigns/messages/<id>` waits for S6, when the Library leaves its room.
- [x] The list (groups, filters, Drafts last), the record (head, one notice, Steps · People · History; a draft's Start and Discard), the step editor, Messages, New with Ask (`POST sequences/draft`, purpose `sequence_draft`: the moments the workspace offers and the messages it holds, each pick judged in code; `POST sequences` makes it whole as a draft or started, 00441 `sequence_create`; `DELETE sequences/:id` lets one that never sent go, `sequence_discard`), the phone. Seen on the throwaway stack with a stub edge (no model, no spend).

## S5 · Every page's door

- [x] Today, the Inbox, Leads, a person's page, the Calendar, the bell; old addresses land on their sequence. Built: where the preview is on, Campaigns' home and a campaign's address (`campaigns/moment:<id>`, `:people`) land on Sequences (contracts `sequenceLandingOf`, the address replaced), and the server reads a sequence by any of its parts' ids (a later step's, a batch's), so every link the other pages already write opens the sequence. A run's sheet stays where held emails are decided and the owner's own sends are said; People's rows are doors to it. A person's page says the sequences they are in now (`sequencesOfPerson`, GET contacts/:id's `sequences`), each a door, in its Campaigns tab or a thin record's Overview.

## S6 · Retire and prove

- [ ] The old pages, sheets and drawers go (Ruben's word, asked then).
- [ ] Browser tests, desk and phone; the bundle against Campaigns' 244 KB.
- [ ] After the deploy: the five views and the old functions dropped.

## Log

- 15 Oct 2026: lane cut from main `7c9fbc91a`; 0060 and this ledger written.
- 15 Oct 2026: 00439 and 00440 written and replayed; the TypeScript moved; every workspace typechecks. Hazard found: this CLI applies a migration file statement by statement (a failed reset left 00439 half applied), so before production's push its rows are checked against every new rule, read only.
- 15 Oct 2026: 00441 written: the four readers and the member's doors (a step added, changed, given words, taken away; people taken out; a batch canceled), each with its decision. A clean replay from zero, then every generated file from it. The sequence doors' database suite (`sequences/sequence-doors.db.test.mjs`) passes beside 00439-00440's. The routes under `sequences`, their policy rows, the typed client and docs/api.md; Ask's `campaigns` reads the sequences as their page does (`sequences`, `sequence`); the tools block's ceiling 74,000 (73,558 for an owner).
- 15 Oct 2026: the suites moved onto the new names. The test doubles learned three things the database does: a write through a view of one table is that table's (the route tracer and the writers measure), a renamed table and function keep their rows and body (delete-tenant, the snapshot's functions), and a world spread from another carries its old names, not a second copy of their rows (the fake database). Three numbers rose with their reasons in docs/debt.md (writers, doors without events, the readers' folder), and one found red on main (appointment words, +9) was raised with its own.
- 15 Oct 2026: S4's page built behind `features.sequences_preview` and seen in the running app against the throwaway stack: list, record, step editor, People, History, phone. New with Ask: the owner's line, a draft judged in code against what the workspace offers, kept as a draft (sends nothing; Drafts in the list; Start or Discard on its record) or started. 00441 took `sequence_create`, `sequence_discard` and `sequence_state_of` (a draft stays one until its first step runs), the two decisions' verbs (`make_sequence`, `discard_sequence`) and the waiting batches the badge's predicate judges. Two rises argued in docs/debt.md (the steps' writers 13 to 15 and the sequences' 6 to 7; doors without events fourteen to sixteen).
- 15 Oct 2026: renumbered 00439-00441 (main's #1604 took 00438, applied on production, and its claim names this lane 00439 and up): every mention moved in one pass, the files renamed, a clean replay and every generated file again. The ledger's 00438 is main's, which the merge brings. The database suites: every file passes alone; run together on this machine, 44 tests fail on lock timeouts and deadlocks, none on an assertion of this lane's.
