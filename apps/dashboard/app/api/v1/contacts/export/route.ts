import { read, workspace } from "@/server/route";
import { everyone } from "@/server/people";
import { tenantFacts } from "@/server/tenant";
import { attachment, dateTag, peopleCsv, safeName } from "@/server/export";
import { recordDecision } from "@/server/verbs";

/**
 * GET /api/v1/contacts/export — everyone, as a CSV, for the business's own
 * records. Owners only: it is the whole customer list. Like every read of a
 * workspace it must be told which (plan 3.4); it was the first to insist.
 */
export const GET = read({
  scope: workspace,
  role: "owner",
  rate: "export",
  handle: async ({ ctx, member }) => {
    // everyone(), not listPeople(): one call is capped at 1000 in the database,
    // and a CSV that stops there is indistinguishable from a complete one --
    // on the export whose ledger row says a full copy of the list was taken.
    const people = await everyone(ctx, member.tenantId);
    const { name, timezone } = await tenantFacts(ctx.supabase, member.tenantId);
    const now = new Date();
    console.log(JSON.stringify({ level: "info", event: "export.people", user: ctx.userId, tenant: member.tenantId, rows: people.length }));
    // On the ledger, as erasure is: who took a copy of everyone, and when.
    await recordDecision(ctx, member.tenantId, "workspace", member.tenantId, "export", { what: "people", rows: people.length });
    return attachment(`people-${safeName(name)}-${dateTag(now, timezone)}.csv`, peopleCsv(people, timezone), "text/csv");
  },
});
