/**
 * Billing for the dashboard: the row a member may read (RLS), and the
 * edge's verbs — status, checkout, portal, invoices, sync, resume — behind
 * the diagnostic key the dashboard already holds. The Stripe key lives on
 * the edge; nothing here knows it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";
import { billingAccountDto, type BillingAccountDto, type BillingPriceDto } from "@chanlytics/contracts";
import type { EdgeAnswer } from "./lines";

const EDGE_BASE = "https://chanlytics-messaging.vercel.app";

export const BILLING_COLUMNS = "mode, status, price_id, current_period_end, trial_end, cancel_at, cancel_at_period_end, card_brand, card_last4, last_payment_failed_at, last_paid_at, updated_at";

export async function billingFor(db: SupabaseClient<Database>, tenantId: string): Promise<BillingAccountDto | null> {
  const { data, error } = await db.from("billing_accounts").select(BILLING_COLUMNS).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? billingAccountDto(data) : null;
}

/** One call to the edge's billing endpoint. Never throws: a failure is a status the caller reads. */
export async function edgeBilling(body: Record<string, unknown>, timeoutMs = 20_000): Promise<EdgeAnswer> {
  if (!process.env.DIAG_KEY) return { status: 503, body: { ok: false, error: "no_diag_key" } };
  try {
    const r = await fetch(`${EDGE_BASE}/api/admin/billing`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-diag-key": process.env.DIAG_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const parsed = (await r.json().catch(() => null)) as unknown;
    return { status: r.status, body: parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null };
  } catch (e) {
    return { status: 503, body: { ok: false, error: e instanceof Error ? e.message : String(e) } };
  }
}

export interface BillingReadiness {
  ready: boolean;
  price: BillingPriceDto | null;
  trial_days: number;
}

const NOT_READY: BillingReadiness = { ready: false, price: null, trial_days: 14 };
let readyCache: { at: number; value: BillingReadiness } | null = null;
const READY_TTL_MS = 5 * 60_000;

/**
 * What this deployment can charge, and the plan as Stripe states it. Cached
 * five minutes per lambda: the answer changes when an operator sets a key,
 * not between two page loads. An unreachable edge reads as not ready, so
 * nothing draws a verb that cannot work.
 */
export async function billingReadiness(now = Date.now()): Promise<BillingReadiness> {
  if (readyCache && now - readyCache.at < READY_TTL_MS) return readyCache.value;
  const a = await edgeBilling({ op: "status" }, 6_000);
  const b = a.body ?? {};
  const price = b.price && typeof b.price === "object" ? (b.price as BillingPriceDto) : null;
  const value: BillingReadiness = a.status === 200 && b.ok === true
    ? { ready: b.ready === true, price, trial_days: typeof b.trial_days === "number" ? b.trial_days : 14 }
    : NOT_READY;
  readyCache = { at: now, value };
  return value;
}

/** For tests and for a route that must not read a stale answer. */
export function forgetBillingReadiness(): void {
  readyCache = null;
}

/** The words a refused op earns, by the edge's reason. */
export const BILLING_SAID: Record<string, string> = {
  not_ready: "Billing is not available on this deployment yet.",
  no_account: "This workspace has no billing record.",
  direct: "This workspace runs on a direct arrangement; there is nothing to pay here.",
  already_subscribed: "This workspace already has a subscription. Manage it from Stripe's portal.",
  no_customer: "Nothing to manage yet: start the trial first.",
  no_subscription: "No subscription is on record for this workspace.",
  not_paused: "The subscription is not paused.",
  stripe_refused: "Stripe did not accept the request.",
};
