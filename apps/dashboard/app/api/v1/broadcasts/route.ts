import { createBroadcast } from "@chanlytics/core";
import { read, write, workspace } from "@/server/route";
import { jsonBody } from "@/server/request-guards";
import { createBroadcastPorts } from "@/server/ports/campaign-ports";
import { load, readerContext } from "@/server/readers";
import { broadcasts } from "@/server/readers/broadcasts";

/**
 * Broadcasts: one message, on the channels it holds, to the people who said yes.
 *
 * GET  /api/v1/broadcasts — the workspace's recent broadcasts with the numbers
 *      their messages earned.
 * POST /api/v1/broadcasts — { template_id, params, audience: { kind, id },
 *      channels?, scheduled_for?, name?, breathe? }. Owner or operator. The rules are
 *      core's (createBroadcast, packages/core/src/campaigns): `template_id`
 *      names a version of the message, any one of them; the values must be
 *      ones Meta accepts; the audience is one of People's lists, a list kept
 *      by hand, or everyone — crossed with who said yes and a way to reach
 *      them. `channels` is the ones it may go by (whatsapp, sms, email;
 *      WhatsApp alone when none is named): a channel the workspace cannot
 *      send on, whose message has no version (WhatsApp's must be approved),
 *      or that its purpose never carries is refused here, and each person is
 *      enrolled once, on the first one that reaches them, written on their
 *      row. The recipients are enrolled now, so the owner sees who and how
 *      many; the job re-checks each person at the wire. Whoever hears from a
 *      campaign or a broadcast within a week of it is left out, never sent it:
 *      enrolled, marked on their row and skipped as heard_this_week, unless
 *      `breathe` is false (the composer's own switch; true or absent
 *      otherwise). It goes now, or at `scheduled_for`: a person is left out
 *      when any message of theirs, sent or due, as known at the press, falls
 *      within a week of that time, before or after (contracts leftOutBy), so a
 *      send set three days ahead leaves out who heard in the last four days or
 *      is due another within ten, and one queued for a month ahead holds
 *      nobody out of a send now. The answer says whether it was set for a
 *      time still ahead (`scheduled_ahead`). The ledger records the decision to send.
 *      The body is the verb's own to read: every refusal is a sentence for
 *      the person composing, judged against the message's versions, which
 *      no schema knows.
 */
export const GET = read({
  scope: workspace,
  // { broadcasts, more, touched_at }: the recent fifty, whether older ones exist beyond them, and who a run of any kind
  // reached from a week ago on, or is due to, and when -- the composer says how many of an audience hear from one within
  // a week of the time it picks, either side. Touches that cannot be read are null, and the composer says nothing,
  // rather than a list of nobody. The body is its reader's (readers/broadcasts.ts).
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), broadcasts, undefined)).data,
});

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "broadcast",
  handle: async ({ ctx, req, member }) =>
    // Committed on the edge's word as it is now: a "ready" kept from a few minutes ago is not enough to enrol people on.
    createBroadcast(createBroadcastPorts(ctx, member.tenantId, { fresh: true }), {
      userId: ctx.userId,
      body: await jsonBody(req),
      now: new Date(),
    }),
});
