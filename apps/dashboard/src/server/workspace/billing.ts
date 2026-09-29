/**
 * Billing for the dashboard: the row a member may read (RLS), and the
 * edge's verbs — status, checkout, portal, invoices, sync, resume — behind
 * the diagnostic key the dashboard already holds. The Stripe key lives on
 * the edge; nothing here knows it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";
import { billingAccountDto, type BillingAccountDto, type BillingPriceDto } from "@chanlytics/contracts";
import { deployment } from "../deployment";
import { callEdge, edgeConfigured, READY_TTL_MS, type EdgeAnswer } from "../edge";
import { log } from "@/server/log";

export const BILLING_COLUMNS =
  "mode, status, price_id, current_period_end, trial_end, cancel_at, cancel_at_period_end, card_brand, card_last4, last_payment_failed_at, last_paid_at, updated_at";

export async function billingFor(db: SupabaseClient<Database>, tenantId: string): Promise<BillingAccountDto | null> {
  const { data, error } = await db
    .from("billing_accounts")
    .select(BILLING_COLUMNS)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? billingAccountDto(data) : null;
}

/**
 * The plans of the workspaces a deleted account was the only member of, ended through the edge (00262). Never throws:
 * the account is already gone, and a plan the edge could not end is ended by its next event there (applySubscription).
 */
export async function endEmptiedWorkspaces(ids: unknown): Promise<void> {
  const list = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  await Promise.all(
    list.map(async (tenantId) => {
      const r = await edgeBilling({ op: "end", tenant_id: tenantId });
      if (r.status !== 200)
        log.error("account_delete_plan_not_ended", { tenant: tenantId, status: r.status, body: r.body });
    }),
  );
}

/** One call to the edge's billing endpoint. Never throws: a failure is a status the caller reads. */
export async function edgeBilling(body: Record<string, unknown>, timeoutMs = 20_000): Promise<EdgeAnswer> {
  if (!edgeConfigured()) return { status: 503, body: { ok: false, error: "no_edge_credential" } };
  // The deployment gate every other provider door keeps (connections/whatsapp.ts): a
  // preview with the edge secret set must not open a real Checkout.
  if (!deployment.providersLive) return { status: 503, body: { ok: false, error: "preview" } };
  return callEdge("/api/admin/billing", body, {
    workspace: typeof body.tenant_id === "string" ? body.tenant_id : null,
    timeoutMs,
  });
}

interface BillingReadiness {
  ready: boolean;
  /** Which of Stripe's worlds the edge's key opens (BillingDto's livemode); null when the edge did not say or could not be read. */
  livemode: boolean | null;
  price: BillingPriceDto | null;
  trial_days: number;
}

const NOT_READY: BillingReadiness = { ready: false, livemode: null, price: null, trial_days: 14 };
let billingReadyCache: { at: number; value: BillingReadiness } | null = null;

/**
 * What this deployment can charge, and the plan as Stripe states it. Cached
 * five minutes per lambda: the answer changes when an operator sets a key,
 * not between two page loads. An unreachable edge reads as not ready, so
 * nothing draws a verb that cannot work.
 */
export async function billingReadiness(now = Date.now()): Promise<BillingReadiness> {
  if (billingReadyCache && now - billingReadyCache.at < READY_TTL_MS) return billingReadyCache.value;
  const a = await edgeBilling({ op: "status" }, 6_000);
  const b = a.body ?? {};
  const price = b.price && typeof b.price === "object" ? (b.price as BillingPriceDto) : null;
  const value: BillingReadiness =
    a.status === 200 && b.ok === true
      ? {
          ready: b.ready === true,
          livemode: typeof b.livemode === "boolean" ? b.livemode : null,
          price,
          trial_days: typeof b.trial_days === "number" ? b.trial_days : 14,
        }
      : NOT_READY;
  billingReadyCache = { at: now, value };
  return value;
}

/** For tests and for a route that must not read a stale answer. */
export function forgetBillingReadiness(): void {
  billingReadyCache = null;
}

/** The words a refused op earns, by the edge's reason. */
export const BILLING_SAID: Record<string, string> = {
  not_ready: "Billing is not available on this deployment yet.",
  preview: "Billing is only on the production dashboard.",
  no_account: "This workspace has no billing record.",
  direct: "This workspace runs on a direct arrangement; there is nothing to pay here.",
  already_subscribed: "This workspace already has a subscription. Manage it from Stripe's portal.",
  no_customer: "Nothing to manage yet: start the trial first.",
  no_subscription: "No subscription is on record for this workspace.",
  not_paused: "The subscription is not paused.",
  not_trialing: "There is no free trial to end: the plan has already started.",
  stripe_refused: "Stripe did not accept the request.",
  edge_timeout: "Billing did not answer in time. Try again in a moment.",
  edge_unreachable: "Billing could not be reached just now. Try again in a moment.",
};
