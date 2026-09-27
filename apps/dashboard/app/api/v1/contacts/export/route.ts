import { AppError, PeopleExportQuerySchema, parseListToken } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { everyone } from "@/server/people/people";
import { tenantFacts } from "@/server/tenant";
import { audiencePool, poolList } from "@/server/people/audience";
import { attachment, dateTag, peopleCsv, safeName } from "@/server/export/export";
import { recordDecision } from "@/server/verbs";

/**
 * GET /api/v1/contacts/export — everyone, as a CSV, for the business's own
 * records. Owners only: it is the whole customer list. Like every read of a
 * workspace it must be told which (plan 3.4); it was the first to insist.
 *
 * `?list=<token>` takes the people on one list instead (decision 0009: export
 * follows the list that is open), counted as a send counts it -- every member,
 * not the page's loaded rows -- and refused in words when the list isn't here
 * or can't be counted.
 */
export const GET = read({
  scope: workspace,
  role: "owner",
  rate: "export",
  query: PeopleExportQuerySchema,
  handle: async ({ ctx, member, input }) => {
    const { name, timezone } = await tenantFacts(ctx.supabase, member.tenantId);
    const now = new Date();
    // everyone(), not listPeople(): one call is capped at 1000 in the database,
    // and a CSV that stops there is indistinguishable from a complete one --
    // on the export whose ledger row says a full copy of the list was taken.
    let people: Awaited<ReturnType<typeof everyone>>;
    let list: { token: string; name: string } | null = null;
    const ref = input.list ? parseListToken(input.list) : null;
    if (ref && input.list) {
      const pool = await audiencePool(ctx, member.tenantId, timezone, now);
      const found = await poolList(ctx, member.tenantId, pool, ref);
      if (!found) throw new AppError("not_found", "That list isn't here.", 404);
      if ("unknown" in found)
        throw new AppError("conflict", `${found.label} can't be counted here. ${found.unknown}`, 409);
      const ids = new Set(found.memberIds);
      people = pool.people.filter((p) => ids.has(p.id));
      list = { token: input.list, name: found.label };
    } else {
      people = await everyone(ctx, member.tenantId);
    }
    console.log(
      JSON.stringify({
        level: "info",
        event: "export.people",
        user: ctx.userId,
        tenant: member.tenantId,
        rows: people.length,
        ...(list ? { list: list.token } : {}),
      }),
    );
    // On the ledger, as erasure is: who took a copy of everyone, or of one list, and when.
    await recordDecision(ctx, member.tenantId, "workspace", member.tenantId, "export", {
      what: "people",
      rows: people.length,
      ...(list ? { list: list.token, name: list.name } : {}),
    });
    return attachment(
      `people-${safeName(name)}${list ? `-${safeName(list.name)}` : ""}-${dateTag(now, timezone)}.csv`,
      peopleCsv(people, timezone),
      "text/csv",
    );
  },
});
