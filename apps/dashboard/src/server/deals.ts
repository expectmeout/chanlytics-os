import "server-only";
import type { RouteContext } from "@/server/with-route";
import {
  DEAL_LOST_REASONS,
  PERSON_CAME_FROM_WORDS,
  cameFromOf,
  isDealLostReason,
  isSellsBy,
  quantile,
  type DealReportDto,
  type PersonCameFrom,
  type PersonRowDto,
  type SellsBy,
} from "@chanlytics/contracts";

/**
 * How this workspace's customers buy (tenants.sells_by, 0008): the answer every deal gate reads through contracts'
 * dealsAreOn. Null when it was never given, and on a database 00160 has not reached: a column that is not there reads
 * as not asked, which costs the deal layer, never the page. The one read the People routes, Reports and the
 * assistant's pool share.
 */
export async function sellsByOf(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<SellsBy | null> {
  const r = await ctx.supabase.from("tenants").select("sells_by").eq("id", tenantId).maybeSingle();
  if (r.error || !r.data) return null;
  const answer: unknown = (r.data as { sells_by?: unknown }).sells_by;
  return isSellsBy(answer) ? answer : null;
}

const DAY_MS = 86_400_000;

/** Nothing to draw: deals are off, or none was ever recorded. A new object each time, since its lists are its own. */
const none = (): DealReportDto => ({
  any: false,
  sent: 0,
  won: 0,
  lost: 0,
  waiting: 0,
  clients: 0,
  monthly_cents: 0,
  median_days_to_yes: null,
  open: { count: 0, amounts: [] },
  sources: [],
  reasons: [],
});

/** How many of each key, most first; a tie keeps the order its set is written in. A null is not a key. */
function tally<K extends string>(keys: readonly (K | null)[], order: readonly K[]): { key: K; count: number }[] {
  const n = new Map<K, number>();
  for (const k of keys) if (k !== null) n.set(k, (n.get(k) ?? 0) + 1);
  return [...n]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.key) - order.indexOf(b.key));
}

const CAME_FROM_ORDER = Object.keys(PERSON_CAME_FROM_WORDS) as PersonCameFrom[];

/**
 * Reports' Deals numbers (0004, 0008), from one read of the workspace's deals under the member's own RLS. One cohort
 * -- the proposals sent in the period and whatever became of them since -- with how long its yeses took, where its new
 * clients came from and why its passes passed; and beside it the stock, whenever it began: the clients now with their
 * monthly total, and every proposal still open with what it carries. Where a new client came from is their person's
 * came_from in `people`, the People rows the route already read for the booking line, so People is not read twice.
 * Drawn only where deals are on (`on`: the route's dealsAreOn, 0008) and a deal was recorded; where they are off the
 * table is not read at all. Null where the table cannot be read (an older database): the section is not drawn and the
 * report stands. Takes only the client it reads with, as the calendar's readers do.
 */
export async function dealReport(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  days: number,
  on: boolean,
  people: readonly Pick<PersonRowDto, "id" | "came_from">[],
  now = new Date(),
): Promise<DealReportDto | null> {
  if (!on) return none();
  const { data, error } = await ctx.supabase
    .from("deals")
    .select("stage, proposed_at, decided_at, amount_cents, per, currency, lost_reason, contact_id")
    .eq("tenant_id", tenantId);
  if (error || !data) return null;
  if (!data.length) return none();
  const since = now.getTime() - days * DAY_MS;
  // The cohort is by when the proposal went, whatever became of it since; an ended engagement was won in its cohort.
  const cohort = data.filter((d) => Date.parse(d.proposed_at) >= since);
  const yes = cohort.filter((d) => d.stage === "won" || d.stage === "ended");
  const passed = cohort.filter((d) => d.stage === "lost");
  const running = data.filter((d) => d.stage === "won");
  const open = data.filter((d) => d.stage === "proposed");
  // Month amounts as they are, a year over twelve, once excluded: what the clients now bring in a month.
  const monthly = running.reduce((s, d) => {
    if (d.amount_cents === null) return s;
    if (d.per === "month") return s + d.amount_cents;
    if (d.per === "year") return s + Math.round(d.amount_cents / 12);
    return s;
  }, 0);
  // Whole days from the proposal to the yes, and their median; a yes dated before its proposal came the same day.
  const waits = yes
    .map((d) => (d.decided_at ? Date.parse(d.decided_at) - Date.parse(d.proposed_at) : NaN))
    .filter((ms) => Number.isFinite(ms))
    .map((ms) => Math.max(0, Math.floor(ms / DAY_MS)))
    .sort((a, b) => a - b);
  const median = quantile(waits, 0.5);
  const cameFrom = new Map<string, PersonCameFrom | null>(people.map((p) => [p.id, cameFromOf(p)?.key ?? null]));
  return {
    any: true,
    sent: cohort.length,
    won: yes.length,
    lost: passed.length,
    waiting: cohort.filter((d) => d.stage === "proposed").length,
    clients: running.length,
    monthly_cents: monthly,
    median_days_to_yes: median === null ? null : Math.round(median),
    open: {
      count: open.length,
      amounts: open.flatMap((d) =>
        d.amount_cents === null ? [] : [{ amount_cents: d.amount_cents, per: d.per, currency: d.currency }],
      ),
    },
    sources: tally(
      yes.map((d) => cameFrom.get(d.contact_id) ?? null),
      CAME_FROM_ORDER,
    ).map(({ key, count }) => ({ came_from: key, count })),
    reasons: tally(
      passed.map((d) => (isDealLostReason(d.lost_reason) ? d.lost_reason : null)),
      DEAL_LOST_REASONS,
    ).map(({ key, count }) => ({ reason: key, count })),
  };
}
