import { withRoute, memberContext, requireRole, requireSpend } from "@/server/with-route";
import { AppError, MOCK_TEXTING_SENTENCE } from "@chanlytics/contracts";
import { takeRate } from "@/server/rate-limit";
import { edgeLines } from "@/server/lines";

/**
 * POST /api/v1/lines/register — file this line with the carriers.
 *
 * Owners only, and it costs the workspace money: a brand and a campaign
 * carry one-off and monthly fees. The edge runs the saga; a refusal is a
 * result, not an error, so the row keeps what it made and the page can say
 * where it stopped. A campaign the carriers cannot accept yet is a wait,
 * not a failure, and the hourly sweep finishes it.
 *
 * `mock` files against the provider's free test registry instead — nothing
 * is charged and nothing routes. It is not offered to owners; it is how
 * this path is exercised before anyone pays.
 */
export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "owner");
  // $4.50 for the brand and $15.00 for the campaign, one time and
  // non-refundable, on Chanlytics' account. See requireSpend.
  await requireSpend(ctx, member);
  await takeRate(ctx.userId, "lines_register");
  const body = (await req.json().catch(() => ({}))) as { line_id?: unknown };
  const lineId = typeof body.line_id === "string" ? body.line_id.trim() : "";
  if (!lineId) throw new AppError("validation", "Which line?", 400);

  const a = await edgeLines({ op: "register", tenant_id: member.tenantId, line_id: lineId }, 60_000);
  const b = a.body ?? {};
  if (a.status === 404) throw new AppError("not_found", "That line does not exist.", 404);
  if (a.status === 409 && b.error === "no_business_record") throw new AppError("conflict", "Fill in your business on record first — the carriers ask who you are.", 409);
  if (a.status === 409 && b.error === "already_registered") throw new AppError("conflict", "This line is already registered with the carriers.", 409);
  // A rehearsal filing, which this route deliberately cannot replace: making it
  // real charges the workspace, so it is an operator's call with the record in
  // front of them, not the outcome of an owner pressing resubmit. Without this
  // case the catch-all below told them "the carriers did not answer", which was
  // about nothing that had happened.
  if (a.status === 409 && b.error === "mock_registration") throw new AppError("conflict", MOCK_TEXTING_SENTENCE, 409);
  if (a.status === 502 && b.error === "sole_proprietor_unsupported") {
    throw new AppError("conflict", "Texting for a business without a tax ID needs a different registration, which we do not offer yet. We have been told.", 409);
  }
  if (a.status !== 200 && a.status !== 502) throw new AppError("internal", "The carriers did not answer. Try again in a moment.", 502);
  return {
    ok: b.ok === true,
    pending: b.pending === true,
    line: b.line ?? null,
    step: typeof b.step === "string" ? b.step : null,
    error: typeof b.error === "string" ? b.error : null,
  };
});
