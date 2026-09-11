import { read, workspace } from "@/server/route";
import { listPeople } from "@/server/people";
import { tenantFacts } from "@/server/tenant";
import { attachment, dateTag, peopleCsv, safeName } from "@/server/export";

/**
 * GET /api/v1/contacts/export — everyone, as a CSV, for the business's own
 * records. Owners only: it is the whole customer list. Strict about the
 * workspace: a bulk export never lands in a workspace nobody chose, so an
 * account in two workspaces must name one even for this read.
 */
export const GET = read({
  scope: workspace,
  strict: true,
  role: "owner",
  rate: "export",
  handle: async ({ ctx, member }) => {
    const people = await listPeople(ctx, member.tenantId);
    const { name, timezone } = await tenantFacts(ctx.supabase, member.tenantId);
    const now = new Date();
    console.log(JSON.stringify({ level: "info", event: "export.people", user: ctx.userId, tenant: member.tenantId, rows: people.length }));
    return attachment(`people-${safeName(name)}-${dateTag(now, timezone)}.csv`, peopleCsv(people, timezone), "text/csv");
  },
});
