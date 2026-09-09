import { withRoute } from "@/server/with-route";
import { requireUuid } from "@/server/request-guards";
import { takeRate } from "@/server/rate-limit";
import { backOffice, platformLineAct } from "@/server/platform";

/**
 * POST /api/v1/platform/lines/release — give a workspace's number back.
 *
 * Releases the number, drops the trunk and forgets the line. The routing row it
 * created is switched off rather than deleted, so calls keep their history.
 *
 * Permanent: the number goes back to the carrier's pool and cannot be reclaimed.
 * Never an owner's action -- it is how a workspace is wound down, which is a
 * conversation before it is a button.
 */
export const POST = withRoute(async (req, ctx) => {
  const office = await backOffice(ctx);
  await takeRate(ctx.userId, "lines_buy");
  const body = (await req.json().catch(() => ({}))) as { tenant_id?: unknown; line_id?: unknown };
  const tenantId = requireUuid(body.tenant_id, "workspace");
  const lineId = requireUuid(body.line_id, "line");
  const r = await platformLineAct(office, ctx, "release", tenantId, lineId);
  // The edge's own answer, unchanged. A 409 from it is a real fact about the
  // line -- "the line is answering, not failed", "already_registered" -- and
  // rewording it here would put a second opinion between support and the truth.
  return { ok: r.ok, status: r.status, result: r.body };
});
