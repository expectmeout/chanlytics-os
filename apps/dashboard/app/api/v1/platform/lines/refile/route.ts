import { withRoute } from "@/server/with-route";
import { requireUuid } from "@/server/request-guards";
import { takeRate } from "@/server/rate-limit";
import { backOffice, platformLineAct } from "@/server/platform";

/**
 * POST /api/v1/platform/lines/refile — send a registration to the carriers again.
 *
 * The action this door exists for. Two things wear the name, and the edge tells
 * them apart by the line's own state:
 *
 *   a REJECTED campaign  is corrected in place. Twilio assesses the vetting fee
 *                        once per campaign, so this is free.
 *   a REHEARSAL filing   is taken off and replaced by a real one. That spends
 *                        about $19.50 and cannot be undone -- a registered brand
 *                        is permanent.
 *
 * An owner cannot do either: the first because a rejection needs somebody who
 * can read what the carriers said, the second because it spends Chanlytics'
 * money rather than theirs. The page says which one a given line is offering,
 * and what it costs, before the button is pressed.
 */
export const POST = withRoute(async (req, ctx) => {
  const office = await backOffice(ctx);
  await takeRate(ctx.userId, "lines_register");
  const body = (await req.json().catch(() => ({}))) as { tenant_id?: unknown; line_id?: unknown };
  const tenantId = requireUuid(body.tenant_id, "workspace");
  const lineId = requireUuid(body.line_id, "line");
  const r = await platformLineAct(office, ctx, "refile", tenantId, lineId);
  // The edge's own answer, unchanged. A 409 from it is a real fact about the
  // line -- "the line is answering, not failed", "already_registered" -- and
  // rewording it here would put a second opinion between support and the truth.
  return { ok: r.ok, status: r.status, result: r.body };
});
