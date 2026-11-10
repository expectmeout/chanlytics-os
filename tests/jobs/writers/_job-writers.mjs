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
  "apps/edge/lib/files/found.ts|file_fetch": { ledger: "the website read or import that found them runs again" },
  "apps/edge/lib/files/upkeep.ts|file_look": { clock: "health", why: "keepFilesMoving, the clock's own work" },
  "apps/edge/lib/files/upkeep.ts|file_purge": { clock: "health", why: "keepFilesMoving, the clock's own work" },
  "apps/edge/lib/files/video-digest.ts|file_look": { clock: "health", why: "keepFilesMoving finds a file not moving" },
  "apps/edge/lib/files/video-digest.ts|video_digest": {
    clock: "health",
    why: "keepFilesMoving finds a file not moving",
  },
  "apps/edge/lib/imports/history-import.ts|history_import": { ledger: "the next part, from inside this one" },
  "apps/edge/lib/imports/website-read.ts|website_read": {
    lost: "a website read asked for and never run: the business's site is not read until it is next asked or saved",
  },
  "apps/edge/lib/inbound/arrival.ts|inbound_answer": {
    clock: "deadman",
    why: "every wire's message (WhatsApp, a text, a DM) accepted and never finished is opened for a person",
  },
  "apps/edge/lib/instagram/post-ready.ts|post_publish": {
    ledger: "the prepare that made the post ready runs again, asks after the same container, and schedules the send",
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
