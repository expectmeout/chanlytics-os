import { read, write, workspace } from "@/server/route";
import { startNewPlaybook } from "@/server/campaigns/playbook-row";
import { load, readerContext } from "@/server/readers";
import { playbooks } from "@/server/readers/playbooks";

/**
 * Playbooks: a standing rule that sends one message, on the channels it holds,
 * to newly eligible people who said yes, under the workspace's autonomy mode.
 *
 * GET  /api/v1/playbooks — the workspace's playbooks with what their runs
 *      earned, the business's clock (the hours are its), who any broadcast
 *      reached this week (the breath the page shows), each trigger's pool
 *      over everyone, counted the way a run counts it, and the workspace's
 *      lists a playbook may run on, each with its own pool ("list:<id>"), and
 *      whether deals are on here (`deals_on`, 0008): the proposal follow-up is
 *      offered, and counted by the workspace's pace, only where they are (0006).
 * POST /api/v1/playbooks — { name?, trigger, template_id, params, run_hour?,
 *      cap_per_run?, gap_days?, cadence_days?, channels? }, or `starter_key`
 *      in place of `template_id`: the playbook is judged whole, and only
 *      where it goes by a channel the starter's message holds at once (an
 *      email or text version, or a WhatsApp version already approved) is
 *      that starter added as the composer's one press adds it (its WhatsApp
 *      version goes to Meta for review where there is a number), then the
 *      playbook goes by it, named no channels on those and on WhatsApp, and
 *      the answer's `starter` says what became of it. Owner or operator.
 *      Checked the way the send route checks a broadcast (checkPlaybookInput,
 *      in its own words, so the body is its verb's to read, startNewPlaybook);
 *      starts running, and the ledger records the start in the same
 *      transaction (00357). `channels` is the ones it may
 *      go by, WhatsApp alone when none is named: a tick its purpose never
 *      carries (texts carry no offers) is refused here, and one the workspace
 *      is not ready on is not (a run holds the people it cannot reach there).
 *
 * The GET's body is its reader's (readers/playbooks.ts), which Ask's campaigns.playbooks reads too.
 */
// The report routes' bucket (rate-limit.ts `aggregate`): the page's counts are SQL aggregates now (00374), and a script
// that hammers this read hammers them.
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), playbooks, undefined)).data,
});

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "playbook",
  handle: ({ ctx, req, member }) => startNewPlaybook(ctx, req, member),
});

/**
 * A playbook named by a starter submits that starter's WhatsApp version to Meta before it starts (A0): a round trip to
 * the edge and on to Meta, which the platform's default time may not hold, and a run killed there loses the answer that
 * says what was submitted. The starter route's room, for the same call.
 */
export const maxDuration = 60;
