/**
 * Every place in TypeScript that writes a job, and what catches the work if the process dies between its fact and that write
 * (layer 10, decision 0115). A SQL function writes its job in its fact's own transaction and needs no row here. Each row was
 * read by hand on 9 November 2026; job-writers.test.mjs holds the list to the syntax tree, so a new writer arrives with its
 * answer.
 *
 * `clock`: a registered clock finds the fact with no job and acts. `provider`: the writer answers a provider's delivery, and a
 * failure is answered so the provider delivers it again. `ledger`: it is written from inside a job, which the ledger runs again.
 * `person`: nothing is left behind that looks done, and the press that asked can be pressed again. `lost`: nothing catches it,
 * and this says what that costs, which must be small enough to accept. `passes`: it hands on what its callers name.
 *
 * Keyed `<file>|<kind>`, with `*` for a kind that arrives as a variable.
 */
export const JOB_WRITERS = {
  "apps/dashboard/src/server/calendar/notices.ts|booking_read": {
    person: "Read again, on a held notice: the notice stays held and the button stays",
  },
  "apps/dashboard/src/server/conversations/ports.ts|outbound_send": {
    clock: "deadman",
    why: "a queued reply no live outbound_send is sending is marked failed and its thread flagged",
  },
  "apps/dashboard/src/server/leads/send.ts|outbound_send": {
    clock: "deadman",
    why: "a throw withdraws the email; a death leaves a queued email the sweep fails",
  },
  "apps/dashboard/src/server/shared/jobs.ts|*": { passes: "schedule(), for the dashboard's two sends" },
  "apps/edge/lib/campaigns/reach-out/sender/lanes.ts|outbound_send": {
    clock: "reach_out",
    why: "adopt: a queued email with no job is given one, once",
  },
  "apps/edge/lib/email/mailbox/sync.ts|email_ingest": {
    clock: "mailboxes",
    why: "the cursor moves only after the page, so the sync reads the email back; the key holds it to one",
  },
  "apps/edge/lib/email/resend-event.ts|email_ingest": { provider: "answers 503, and the provider delivers it again" },
  "apps/edge/lib/files/copy/ensure.ts|copy_return": {
    person:
      "whoever asked for the copy asks again: a file whose return was never written still says its copy is away, the door answers the next ask the same way, and that ask writes the job",
  },
  "apps/edge/lib/files/copy/sweep.ts|copy_return": {
    clock: "health",
    why: "keepCopiesMoving, the clock's own work: each pass asks again for every copy still waiting for room",
  },
  "apps/edge/lib/files/found.ts|file_fetch": { ledger: "the website read or import that found them runs again" },
  "apps/edge/lib/files/piece-make.ts|piece_make": {
    ledger: "the step that would have written the next runs again: a start finds its machine kept and starts no second",
  },
  "apps/edge/lib/files/sources/push.ts|source_read": {
    clock: "sources",
    why: "a signal's read that was never written is the floor's: every watched folder is read within the hour, signal or none",
  },
  "apps/edge/lib/files/sources/read.ts|source_walk": {
    clock: "sources",
    why: "a folder a read found is listed by the folder's next re-walk, which a change inside brings a day on at most",
  },
  "apps/edge/lib/files/sources/walk.ts|source_read": {
    clock: "sources",
    why: "the walk's end sets the folder's next read to now on its row, so the clock hands it that read",
  },
  "apps/edge/lib/files/sources/walk.ts|source_walk": {
    clock: "sources",
    why: "a walk that has written nothing for half an hour is taken up where its rows stand (sources_hand_out)",
  },
  "apps/edge/lib/files/sources/watch.ts|source_read": {
    person: "Check now: nothing is left that looks read, and the press can be pressed again; the floor reads it anyway",
  },
  "apps/edge/lib/files/sources/watch.ts|source_walk": {
    clock: "sources",
    why: "a folder chosen whose first walk never began is handed it after half an hour (sources_hand_out)",
  },
  "apps/edge/lib/files/takes/word.ts|file_purge": {
    clock: "health",
    why: "the failed clip is removed before its purge is written, and keepFilesMoving asks again for a removal not finished",
  },
  "apps/edge/lib/files/upkeep.ts|file_look": { clock: "health", why: "keepFilesMoving, the clock's own work" },
  "apps/edge/lib/files/upkeep.ts|file_purge": { clock: "health", why: "keepFilesMoving, the clock's own work" },
  "apps/edge/lib/files/video-digest.ts|file_look": { clock: "health", why: "keepFilesMoving finds a file not moving" },
  "apps/edge/lib/files/video-digest.ts|video_digest": {
    clock: "health",
    why: "keepFilesMoving finds a file not moving",
  },
  "apps/edge/lib/imports/history-import.ts|history_import": { ledger: "the next part, from inside this one" },
  "apps/edge/lib/imports/instagram-read.ts|instagram_read": {
    lost: "an Instagram read asked for and never run: the page stops saying Looking after half an hour, and a link pasted again asks again",
  },
  "apps/edge/lib/imports/sites-again.ts|website_read": { clock: "health", why: "readSitesAgain, the clock's own work" },
  "apps/edge/lib/content/results-upkeep.ts|post_observe": {
    clock: "health",
    why: "keepResultsMoving asks for every read of a post's numbers that is due and not kept, each half hour",
  },
  "apps/edge/lib/imports/website-read.ts|website_read": {
    lost: "a website read asked for and never run: the business's site is not read until it is next asked or saved",
  },
  "apps/edge/lib/inbound/arrival.ts|inbound_answer": {
    clock: "deadman",
    why: "every wire's message (WhatsApp, a text, a DM) accepted and never finished is opened for a person",
  },
  "apps/edge/lib/content/take-down.ts|post_take_down": {
    ledger:
      "the take-down that got no answer runs again and schedules the same next ask; its action stays pending, which the piece says",
  },
  "apps/edge/lib/google/post-later.ts|post_google": {
    ledger: "Google's second and last ask, from inside the first, written before the post moves back to waiting",
  },
  "apps/edge/lib/instagram/post-ready.ts|post_publish": {
    ledger: "the prepare that made the post ready runs again, asks after the same container, and schedules the send",
  },
  "apps/edge/lib/instagram/post-send.ts|post_publish": {
    ledger:
      "the send that waits a minute for a version being made (00708), written from inside its own job: lost, the claimed send runs again and finds the version still being made",
  },
  "apps/edge/lib/leads/apify-delivery.ts|lead_collect": {
    provider: "answers 503, and the leads clock collects a run whose webhook was lost",
  },
  "apps/edge/lib/leads/pipeline.ts|*": { clock: "leads", why: "takes up a run whose start or lease was lost" },
  "apps/dashboard/src/server/ask/notice/sweep.ts|push_send": {
    lost: "one morning's buzz: the notice stands on the bell and in Ask, and the failure is logged",
  },
  "apps/edge/lib/leads/sweep.ts|*": { clock: "leads", why: "the clock's own work" },
  "apps/edge/lib/leads/sweep.ts|lead_collect": { clock: "leads", why: "the clock's own work" },
  "apps/edge/lib/lines/admin.ts|*": { clock: "lines", why: "a line setting up past its deadline is resumed" },
  "apps/edge/lib/lines/chosen-line.ts|*": { clock: "lines", why: "a line setting up past its deadline is resumed" },
  "apps/edge/lib/lines/sweep.ts|line_provision": { clock: "lines", why: "the clock's own work" },
  "apps/edge/lib/ops/jobs-tick.ts|*": { passes: "the job context's schedule and scheduleOnce, for what handlers name" },
  "apps/edge/lib/previews/make.ts|preview_build": {
    person:
      "Make their preview, pressed again: the door hands back the row still building and asks its build once more",
  },
  "apps/edge/lib/receptionist/request-clock.ts|booking_lapse": {
    clock: "deadman",
    why: "the clock's own work: a request that ran out and is not closed is listed again ten minutes on, and handed over again",
  },
  "apps/edge/lib/shared/alerts/notify.ts|push_send": {
    lost: "one phone's buzz: the notification stands on the bell and the mail has gone, and the failure is logged",
  },
  "apps/edge/lib/website/signup-confirm.ts|outbound_send": {
    clock: "deadman",
    why: "a queued email no live outbound_send is sending is marked failed",
  },
  "packages/core/src/leads/runner/check.ts|lead_check": { clock: "leads", why: "takes up a round whose next was lost" },
  "packages/core/src/leads/runner/check.ts|lead_collect": {
    clock: "leads",
    why: "takes up a run with no live collect",
  },
  "packages/core/src/leads/runner/claim.ts|lead_collect": {
    clock: "leads",
    why: "takes up a run with no live collect",
  },
  "packages/core/src/leads/runner/collect/collect.ts|lead_collect": {
    clock: "leads",
    why: "takes up a run with no live collect",
  },
  "packages/core/src/leads/runner/people.ts|lead_collect": {
    clock: "leads",
    why: "takes up a run with no live collect",
  },
  "packages/core/src/leads/runner/start.ts|lead_collect": {
    clock: "leads",
    why: "takes up a run with no live collect",
  },
  "packages/core/src/leads/runner/sweep.ts|lead_collect": { clock: "leads", why: "the clock's own work" },
  "packages/jobs/src/handlers/broadcast-send.ts|broadcast_send": {
    clock: "deadman",
    why: "the next batch, from inside this one; a run past its time with nothing on the ledger is found (stranded runs)",
  },
  "packages/jobs/src/handlers/erasure.ts|erasure_finish": {
    lost: "a net under an erasure that runs without it: the press itself erases, and the failure is logged",
  },
  "packages/jobs/src/handlers/handlers.ts|push_receipts": {
    lost: "which phones' tokens went stale: found on a later send's receipts, and the failure is logged",
  },
  "packages/jobs/src/handlers/incoming-email.ts|booking_read": {
    ledger: "the email's ingest runs again; the key holds it to one",
  },
  "packages/jobs/src/handlers/incoming-email.ts|line_provision": {
    clock: "lines",
    why: "a line setting up past its deadline is resumed",
  },
  "packages/jobs/src/handlers/incoming-email.ts|outbound_send": { ledger: "a send's own retry, from inside it" },
  "packages/jobs/src/handlers/incoming-email.ts|reply_read": {
    ledger: "the email's ingest runs again; the key holds it to one",
  },
  "packages/jobs/src/handlers/reply-draft.ts|reply_draft": {
    clock: "drafts",
    why: "writes the reply a hold is owed where its event was dropped",
  },
  "packages/jobs/src/handlers/reply-read.ts|reply_read": { ledger: "the next read of a reply, from inside this one" },
  "packages/jobs/src/runner/settle.ts|broadcast_send": {
    clock: "deadman",
    why: "a resumed run past its time with nothing on the ledger is found (stranded runs)",
  },
  "packages/jobs/src/runner/settle.ts|file_look": {
    clock: "health",
    why: "a video whose hearing would not finish is still Looking, and keepFilesMoving asks for the step it lacks a day on",
  },
};
