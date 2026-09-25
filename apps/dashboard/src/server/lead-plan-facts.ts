/**
 * The plan facts a search is judged by: the month used, when it renews, the niche's prior. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import {
  LEAD_MONTHLY_ALLOWANCE,
  LEAD_MONTHLY_BUDGET_USD,
  type LeadArea,
  leadMonth,
  type LeadNichePrior,
  type LeadPlanFacts,
} from "@chanlytics/contracts";
import { monthUsed, renewsOnOf } from "./lead-helpers";
import { listCounts } from "./lead-searches";
import { tenantFacts } from "./tenant";
import type { RouteContext } from "./with-route";

/** The platform-wide prior for a kind of business, or null when nobody has searched for one. */
export async function nichePrior(
  ctx: Pick<RouteContext, "supabase">,
  categoryKey: string,
): Promise<LeadNichePrior | null> {
  const { data, error } = await ctx.supabase.rpc("lead_niche_prior", { p_category_key: categoryKey });
  if (error) throw new Error(`lead_niche_prior: ${error.message}`);
  const p = data && typeof data === "object" ? (data as Partial<LeadNichePrior>) : null;
  return p && typeof p.places === "number"
    ? { places: p.places, matched: p.matched ?? 0, with_email: p.with_email ?? 0 }
    : null;
}

/**
 * What the plan card is given beside the plan (§8.3): what a search would
 * skip, what is left this month, and what past searches for this kind of
 * business measured. Release A ships none of this -- it has `lead_niche_prior`,
 * `lead_searches_on` and the counters -- so this is the one place that reads
 * them into the card's own shape.
 */
export async function planFacts(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  opts: { categoryKey?: string | null; nearby?: LeadArea[]; cannotSee?: LeadPlanFacts["cannotSee"]; now?: Date } = {},
): Promise<LeadPlanFacts> {
  // The month, and the day it renews, are the BUSINESS's (lead_month): a turn
  // that carries its own moment hands it in rather than reading the server's.
  const now = opts.now ?? new Date();
  const { timezone } = await tenantFacts(ctx.supabase, tenantId);
  const month = leadMonth(timezone, now);
  const [counts, used, prior] = await Promise.all([
    listCounts(ctx, tenantId),
    monthUsed(ctx, tenantId, month),
    opts.categoryKey ? nichePrior(ctx, opts.categoryKey) : Promise.resolve(null),
  ]);
  // The whole of each ceiling is contracts', never the database's: one
  // derivation per fact, so the number a person reads is spelled once.
  const leadsLeft = Math.max(0, LEAD_MONTHLY_ALLOWANCE - used.allowance);
  const budgetLeftUsd = Math.max(0, LEAD_MONTHLY_BUDGET_USD - used.budget);
  // Which of the month's two ceilings this workspace is nearer, as a share of
  // each month's whole: the card says "you have N leads left" for the one and
  // names the budget for the other. Neither touched binds nothing.
  const usedLeads = LEAD_MONTHLY_ALLOWANCE - leadsLeft;
  const usedUsd = LEAD_MONTHLY_BUDGET_USD - budgetLeftUsd;
  // The word is A's own counter kind (LEAD_COUNTER_KINDS: allowance | budget |
  // day), so the card, the door and the ledger all call the month's leads the
  // same thing.
  const bound: LeadPlanFacts["bound"] =
    usedLeads === 0 && usedUsd === 0
      ? null
      : leadsLeft / LEAD_MONTHLY_ALLOWANCE <= budgetLeftUsd / LEAD_MONTHLY_BUDGET_USD
        ? "allowance"
        : "budget";
  return {
    // Every lead this workspace already owns is one a new search skips: the
    // place is already theirs, so it is never counted or charged twice.
    dupes: counts.all,
    leadsLeft,
    bound,
    prior,
    priorOf: prior ? (opts.categoryKey ?? null) : null,
    cannotSee: opts.cannotSee ?? null,
    renewsOn: renewsOnOf(timezone, now),
    nearby: opts.nearby ?? [],
  };
}
