# 0152 · An owner asks for their own copy and their own delete, and the delete runs as a job

**Status:** Proposed, not built; Ruben's to accept. Written against commit `10a175d150` (main, 28 November 2026), with
the delete script as lane 2 of the plan "Prove it works" leaves it (`docs/runbook.md`, "Delete a workspace"). Where
this note and the code disagree, the code wins.

## Context

What an owner can do for themself today, and what they cannot.

- **A copy: yes.** Settings › Business has a card, Data, with "Download your records"
  (`apps/dashboard/src/surfaces/settings/frame/workspace.tsx`, `WorkspaceData`). It is `GET /api/v1/export`, the
  owner's alone, one JSON file read page by page under the owner's session (`apps/dashboard/src/server/export/bundle.ts`).
  It holds people, conversations, calls, consent, deals, bookings, campaigns, sends, leads, reviews, form entries, the
  business's details and the team, and ends with what it leaves out and why
  (`packages/contracts/src/activity/record-export.ts`, `EXPORT_OF`). Left out today: the workspace's own files (its
  photos and videos download one at a time from Settings › Files), ads and what they spent, the subscription and its
  invoices, the replies AI drafted, the connections, call audio. A file a customer sent is in it as a link that opens
  for a day.
- **A delete: no.** The same card says to write to hi@chanlytics.com from the owner's address, and that the data is
  removed within 30 days. A person on the Console's staff files the request as it came in
  (`apps/dashboard/src/server/console/requests.ts`, the table `privacy_requests`) and marks six steps by hand:
  confirmed, copy sent, number given back, dry run, deleted, told (`packages/contracts/src/console/requests.ts`,
  `REQUEST_STEPS`). The delete itself is `tooling/scripts/ops/delete-tenant.mjs`, run from a laptop that holds the
  service role's key and each provider's key.
- **What the script does**, since lane 2: reads every table whole and counted into a backup, refuses while the
  workspace holds anything the delete cannot reach, sets Stop everything, withdraws the queued jobs and waits for the
  running ones, reads again, writes the list of what to remove outside the database, deletes the rows in slices, then
  works through the list, which survives the run.
- **What only a person does**: gives the phone number back and closes its subaccount, cancels the subscription at
  Stripe, disconnects Google, each mailbox, the footage account and the ad account, deletes the receptionist's agent
  at Retell (`tooling/scripts/ops/delete-tenant/stranded.mjs` is the list). The script refuses until each is done.
- **What is weak in this.** The promise rests on one person reading an inbox and running a script by hand. The backup
  of a deleted workspace is a file on that laptop with no date by which it goes. Point-in-time recovery is off
  (`docs/runbook.md`, "Restore the database"), so the backup file is the only way back from a wrong delete.

## Decision

Proposed. Each point is Ruben's to take, change or refuse.

1. **The owner asks in the product.** "Delete this workspace" on the Data card becomes a request the owner files
   there, in place of an email. It writes the `privacy_requests` row the Console already keeps, so the staff's page,
   its steps and its thirty-day clock stay as they are. The address stays for an owner who cannot sign in.
2. **Confirmed twice.** In the product the owner types the workspace's name, the script's own guard. Then a link sent
   to the owner's address confirms it (the step "They confirmed"). A session alone never deletes a business.
3. **It waits seven days, and can be taken back.** From the confirmation the delete is due in seven days. Until then
   the card says the date and offers "Keep this workspace", one press. Every owner and operator of the workspace is
   emailed at the confirmation and again the day before.
4. **Their copy first.** When the wait begins, a job makes the owner's copy and emails a link to it (the step "Their
   copy, sent"). It is today's export file, with one change for an owner who is leaving: their own photos and videos
   are in it as links that open for the seven days, where today that kind is left out.
5. **What it waits on, said to the owner.** The delete does not start while the workspace holds something that would
   keep running or keep being billed. Each has a line on the card with the one thing to do:
   - a phone number still held: "Give the number back" (its line's own door), or it is released at the delete;
   - a subscription: cancelled as the delete begins, with no further charge;
   - an ad still running: stopped by Stop everything, which the delete sets first;
   - Google, a mailbox, a footage account, an ad account: disconnected through the door each already has;
   - the receptionist's agent at Retell: deleted by the job.
     What has a door of its own the job uses. What has none waits for a person on staff, and the Console shows it.
6. **It runs the script's steps as a job.** One kind, `workspace_delete`, with its handler, policy and row (decision
   0089). Each run does one step and is safe to run again: read and back up; stop and drain; read again; write the
   list; delete in slices; work through the list; tell the owner. The code is the script's own modules, moved into the
   packages, with the script kept as the by-hand door over the same code. There is one implementation, not two.
7. **The ledger refuses a workspace that is being deleted.** `claim_due_jobs` leaves the jobs of a workspace whose
   delete has begun. This is the bigger fix lane 2 did not build: the script withdraws queued jobs itself, which
   leaves a window of seconds. A job cannot fence its own ledger from outside, so the job needs this.
8. **The backup has a home and an end.** It goes to a private bucket of Chanlytics' own, not a laptop, and is removed
   thirty days after the delete. The privacy policy says so.
9. **A person on staff still says go, at first.** For the first ten deletes the job stops before its deletes and the
   Console asks for a press. After that it runs by itself, on Ruben's word.

Not in this note: a person asking a business to delete them (the request kind `delete_person`, and decision 0150's
open question on message text), and a member deleting their own account (`delete_my_account`, built).

## Shape

- No new table. `privacy_requests` holds the request, its steps and its due date. It gains who asked from inside the
  product and the delete's own state (waiting, running, what it waits on), as steps of the kind it already has.
- One route for the owner to ask and one to take it back, both the owner's alone and behind a fresh second factor;
  one edge door for the link in the email.
- One job kind and its handler in `packages/jobs`; the tables' list, the reads, the slices and the clean-up list in
  `packages/db` and `packages/core`, where the script's modules are today under `tooling/scripts/ops/delete-tenant/`.
- One migration: the claim's refusal (7), the job kind's row, and the request's new steps.
- Words for the card, the two emails and the Console's lines, from `docs/words.md`.

## Steps

Each ships alone, in either deploy order.

1. The script's modules move into the packages; the script is the same door over them. Nothing an owner sees changes.
2. The owner files the request and confirms it by email. Staff still run the script. The inbox is no longer the
   record of who asked.
3. The job does the read, the backup and the list of what it waits on. The card and the Console show that list.
4. The job releases what has a door: the subscription, the connections, the number, the agent.
5. The claim's refusal, then the job's deletes, behind a switch that is off; staff press go for each of the first ten.
6. The wait, "Keep this workspace", the emails, and the backup's thirty days. The switch on.

## Tests

- The script's own suites move with its modules and stay green at each step.
- The request: only an owner files it, only a confirmed one becomes due, taking it back clears it, a second request
  while one waits is the same request.
- The job, killed after each step and started again, ends in the same state (lane 7's helper).
- On the stack: a workspace with a line, a subscription and a connection is not deleted while any is held; one
  without is gone, with its files, and another workspace's rows untouched.
- The claim leaves a deleting workspace's jobs, and takes them again if the request is taken back.

## Risks

- **Someone with the owner's session deletes the business.** The link to the owner's address, the seven days and the
  emails to the team are the answer. A staff press for the first ten is a second one.
- **Nothing undoes it.** The backup is rows, not a restore: putting a workspace back from it is hand work, never
  rehearsed. Point-in-time recovery, which is Ruben's switch and is billed, is the real undo for the days it covers.
- **A provider is down on the day.** The list survives; the job tries again. The owner is told the rows are gone and
  what is still being removed.
- **The copy is large.** Videos are links, not bytes in the file, so the file stays small; the links end with the wait.

## Open questions

All Ruben's.

1. The wait: seven days, or another length, or none for a workspace still in its trial?
2. Does the workspace keep working during the wait, or is Stop everything set at the confirmation?
3. Is a backup kept after a delete the owner asked for, and for how long? Thirty days is proposed. None is the
   stricter reading of "removed".
4. Does the copy carry links to the owner's own photos and videos, as proposed, or stay as it is today?
5. A staff press before each of the first ten deletes: yes as proposed, or from the start by itself?
6. A workspace a partner brought: is the partner told, and may they ask on the owner's behalf? Proposed: told, and no.
7. An unpaid invoice: does it hold the delete? Proposed: no; Stripe keeps the invoice.
