import { createBroadcast } from "@chanlytics/core";
import { read, write, workspace } from "@/server/route";
import { jsonBody } from "@/server/request-guards";
import { createBroadcastPorts } from "@/server/campaign-ports";
import { listBroadcasts } from "@/server/broadcasts";

/**
 * Broadcasts: one approved template to the people who said yes.
 *
 * GET  /api/v1/broadcasts — the workspace's recent broadcasts with the numbers
 *      their messages earned.
 * POST /api/v1/broadcasts — { template_id, params, audience: { kind, id },
 *      scheduled_for?, name? }. Owner or operator. The rules are core's
 *      (createBroadcast, packages/core/src/campaigns): the template must be
 *      approved by WhatsApp; the values must be ones Meta accepts; the
 *      audience is one of People's lists, a list kept by hand, or everyone —
 *      crossed with who said yes and has a number. The recipients are
 *      enrolled now, so the owner sees who and how many; the job re-checks
 *      each person at the wire. The ledger records the decision to send.
 *      The body is the verb's own to read: every refusal is a sentence for
 *      the person composing, judged against the template Meta holds, which
 *      no schema knows.
 */
export const GET = read({
  scope: workspace,
  // { broadcasts, more }: the recent fifty, and whether older ones exist beyond them.
  handle: async ({ ctx, member }) => listBroadcasts(ctx, member.tenantId),
});

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "broadcast",
  handle: async ({ ctx, req, member }) => createBroadcast(createBroadcastPorts(ctx, member.tenantId), { userId: ctx.userId, body: await jsonBody(req), now: new Date() }),
});
