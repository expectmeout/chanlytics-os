import "server-only";
import type { RouteContext } from "@/server/with-route";
import type { DealReportDto } from "@chanlytics/contracts";

/**
 * Reports' Deals numbers (0004): one cohort -- the proposals sent in the
 * period and what became of them -- and the stock, clients now with their
 * monthly total. Counted over the columns under the member's own RLS. Null
 * where the table cannot be read (an older database): the section is not
 * drawn and the report stands. Takes only the client it reads with, as the
 * calendar's readers do.
 */
export async function dealReport(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  days: number,
  now = new Date(),
): Promise<DealReportDto | null> {
  const { data, error } = await ctx.supabase
    .from("deals")
    .select("stage, proposed_at, amount_cents, per")
    .eq("tenant_id", tenantId);
  if (error || !data) return null;
  const since = now.getTime() - days * 86_400_000;
  // The cohort is by when the proposal went, whatever became of it since; an ended engagement was won in its cohort.
  const cohort = data.filter((d) => Date.parse(d.proposed_at) >= since);
  const running = data.filter((d) => d.stage === "won");
  // Month amounts as they are, a year over twelve, once excluded: what the clients now bring in a month.
  const monthly = running.reduce((s, d) => {
    if (d.amount_cents === null) return s;
    if (d.per === "month") return s + d.amount_cents;
    if (d.per === "year") return s + Math.round(d.amount_cents / 12);
    return s;
  }, 0);
  return {
    any: data.length > 0,
    sent: cohort.length,
    won: cohort.filter((d) => d.stage === "won" || d.stage === "ended").length,
    lost: cohort.filter((d) => d.stage === "lost").length,
    waiting: cohort.filter((d) => d.stage === "proposed").length,
    clients: running.length,
    monthly_cents: monthly,
  };
}
