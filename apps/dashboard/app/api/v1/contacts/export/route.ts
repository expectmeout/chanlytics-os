import { AppError } from "@chanlytics/contracts";
import { withRoute, memberContext } from "@/server/with-route";
import { takeRate } from "@/server/rate-limit";
import { listPeople } from "@/server/people";
import { tenantFacts } from "@/server/tenant";
import { attachment, dateTag, peopleCsv, safeName } from "@/server/export";

/**
 * GET /api/v1/contacts/export — everyone, as a CSV. Owner only.
 *
 * A member sees these people one screen at a time; a file is the whole
 * customer list in one download, so it is the owner's to take. The workspace
 * must be named when the account holds more than one: a bulk export must
 * never land in a workspace nobody chose, for the same reason a write must
 * not. This is also the "access" half of the privacy policy's "access or
 * deletion", which only had the deletion half until now.
 */
export const GET = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  if (member.ambiguous) {
    throw new AppError("validation", "This account belongs to more than one workspace — say which one to export.");
  }
  if (member.role !== "owner") throw new AppError("forbidden", "Only an owner can export everyone.", 403);
  takeRate(ctx.userId, "export");

  const people = await listPeople(ctx, member.tenantId);
  const { name, timezone } = await tenantFacts(ctx.supabase, member.tenantId);
  const now = new Date();
  console.log(JSON.stringify({ level: "info", event: "export.people", user: ctx.userId, tenant: member.tenantId, rows: people.length }));
  return attachment(`people-${safeName(name)}-${dateTag(now, timezone)}.csv`, peopleCsv(people, timezone), "text/csv");
});
