import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { AppError, businessRecordProblems, type BusinessRecordDto } from "@chanlytics/contracts";
import { takeRate } from "@/server/rate-limit";
import { edgeLines } from "@/server/lines";

/**
 * The business on record: what the carriers ask before they let a number
 * text, kept once per workspace.
 *
 * GET — members read it, because the Texting row shows where it stands.
 * PUT — owners only: it is a statement about the business's legal identity,
 * made to the carriers in its name, and it decides whether a registration
 * can be filed at all. The edge owns the write, as it owns every other
 * write that leaves for a provider.
 */
export const GET = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  const { data, error } = await ctx.supabase
    .from("business_records")
    .select("*")
    .eq("tenant_id", member.tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { record: null, problems: {} };
  const { tenant_id: _tenant, created_at: _created, ...record } = data;
  return { record, problems: businessRecordProblems(record as BusinessRecordDto) };
});

export const PUT = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "owner");
  await takeRate(ctx.userId, "business_record");
  const body = (await req.json().catch(() => ({}))) as Partial<BusinessRecordDto>;

  // Checked here, in the owner's words, before anything leaves for a
  // provider: a refusal from the carriers arrives days later and says
  // nothing a person can act on.
  const problems = businessRecordProblems(body);
  if (Object.keys(problems).length) {
    const first = Object.values(problems)[0];
    throw new AppError("validation", first ?? "Something is missing.", 400);
  }

  const a = await edgeLines({ op: "record", tenant_id: member.tenantId, record: body }, 20_000);
  const b = a.body ?? {};
  if (a.status === 400) throw new AppError("validation", typeof b.error === "string" ? b.error : "That could not be saved.", 400);
  if (a.status !== 200) throw new AppError("internal", "The record could not be saved. Try again in a moment.", 502);
  return { record: b.record ?? null };
});
