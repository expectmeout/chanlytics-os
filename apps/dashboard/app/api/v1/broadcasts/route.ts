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
 *      many; the job re-checks each person at the wire. Whoever heard from a
 *      campaign or a broadcast this week waits a week, enrolled and skipped
 *      as heard_this_week, unless `breathe` is false (the composer's own
 *      switch; true or absent otherwise). The ledger records the decision to send.
 *      The body is the verb's own to read: every refusal is a sentence for
 *      the person composing, judged against the message's versions, which
 *      no schema knows.
 */
export const GET = read({
  scope: workspace,
  // { broadcasts, more, touched }: the recent fifty, whether older ones exist beyond them, and who a run of any kind
  // reached within the week -- the composer says how many of an audience heard from one. Touches that cannot be read
  // are null, and the composer says nothing, rather than a list of nobody. The body is its reader's
  // (readers/broadcasts.ts).
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
