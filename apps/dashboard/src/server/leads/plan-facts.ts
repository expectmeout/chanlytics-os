/**
 * The plan facts a search is judged by: the month used, when it renews, the niche's prior. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it. Every read runs on the member's own session and names the workspace it asks about.
 *
 * Cross-workspace: the niche's prior is platform-wide by design: counts per kind of business, aggregates only, which
 * name no workspace and no place (lead_niche_priors, 00140). Nothing else here reads past the workspace.
 */
import {
  LEAD_MONTHLY_BUDGET_USD,
  leadMonth,
  type LeadNichePrior,
  type LeadPlanFacts,
  DbFailure,
} from "@chanlytics/contracts";
import { readMonthUsed, renewsOnOf } from "./allowance";
import { listSearchCounts } from "./searches";
import { getTenantFacts } from "../shared/tenant";
import type { RouteContext } from "../shared/with-route";
import { readNichePrior } from "@chanlytics/db/leads";
import type { TenantId } from "@chanlytics/contracts";
import { z } from "zod";
import { readAnswer } from "@chanlytics/db/shared";

/** What lead_niche_prior answers: past searches' counts for a kind of business, or null for one never searched. */
const NichePrior = z
  .object({ places: z.number().nullable(), matched: z.number().nullable(), with_email: z.number().nullable() })
  .partial()
  .nullable();

/** The platform-wide prior for a kind of business, or null when nobody has searched for one. */
export async function findNichePrior(
  ctx: Pick<RouteContext, "supabase">,
  categoryKey: string,
): Promise<LeadNichePrior | null> {
  const { data, error } = await readNichePrior(ctx.supabase, categoryKey);
  if (error) throw new DbFailure(error, "lead_niche_prior");
  const p = readAnswer("lead_niche_prior", NichePrior, data);
  return typeof p?.places === "number"
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
  tenantId: TenantId,
  opts: { categoryKey?: string | null; now?: Date } = {},
): Promise<LeadPlanFacts> {
  // The month, and the day it renews, are the BUSINESS's (lead_month): a turn
  // that carries its own moment hands it in rather than reading the server's.
  const now = opts.now ?? new Date();
  const { timezone } = await getTenantFacts(ctx.supabase, tenantId);
  const month = leadMonth(timezone, now);
  const [counts, used, prior] = await Promise.all([
    listSearchCounts(ctx, tenantId),
    readMonthUsed(ctx, tenantId, month),
    opts.categoryKey ? findNichePrior(ctx, opts.categoryKey) : Promise.resolve(null),
  ]);
  // The whole of each ceiling is contracts', never the database's: one
  // derivation per fact, so the number a person reads is spelled once.
  const leadsLeft = Math.max(0, used.cap - used.allowance);
  const budgetLeftUsd = Math.max(0, LEAD_MONTHLY_BUDGET_USD - used.budget);
  // Which of the month's two ceilings this workspace is nearer, as a share of
  // each month's whole: the card says "you have N leads left" for the one and
  // names the budget for the other. Neither touched binds nothing.
  const usedLeads = used.cap - leadsLeft;
  const usedUsd = LEAD_MONTHLY_BUDGET_USD - budgetLeftUsd;
  // The word is A's own counter kind (LEAD_COUNTER_KINDS: allowance | budget |
  // day), so the card, the door and the ledger all call the month's leads the
  // same thing.
  const bound: LeadPlanFacts["bound"] =
    usedLeads === 0 && usedUsd === 0
      ? null
      : leadsLeft / Math.max(1, used.cap) <= budgetLeftUsd / LEAD_MONTHLY_BUDGET_USD
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
    renewsOn: renewsOnOf(timezone, now),
    // Where to look next is a round's that ran dry (contracts leadMonthPlanFacts): a card Ask makes has none to offer.
    nearby: [],
  };
}
