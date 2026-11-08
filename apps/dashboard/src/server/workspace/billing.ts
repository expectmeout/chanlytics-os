/**
 * Billing for the dashboard: the row a member may read (RLS), and the
 * edge's verbs — status, checkout, portal, invoices, sync, resume — behind
 * the diagnostic key the dashboard already holds. The Stripe key lives on
 * the edge; nothing here knows it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { callSecondsSince } from "@chanlytics/db/voice";
import { findWorkspaceModelStanding } from "@chanlytics/db/ai";
import type { Database } from "@chanlytics/db/types";
import {
  billingAccountDto,
  type BillingAccountDto,
  type BillingPriceDto,
  type ModelStanding,
} from "@chanlytics/contracts";
import { deployment } from "../shared/env";
import { callEdge, edgeConfigured, READY_TTL_MS, type EdgeAnswer, type EdgeBody, type EdgeRead } from "../shared/edge";
import { log } from "@/server/shared/log";
import { serviceDbIfConfigured } from "@/server/shared/service-db";
import { findPlanForPage } from "@chanlytics/db/billing";

export async function findBilling(db: SupabaseClient<Database>, tenantId: string): Promise<BillingAccountDto | null> {
  const { data, error } = await findPlanForPage(db, tenantId);
  if (error) throw new Error(error.message);
  return data ? billingAccountDto(data) : null;
}

/**
 * The phone receptionist's minutes since the month began (UTC), rounded up, as the member reads the events (decision
 * 0092): what Settings › Billing says the voice provider was paid for. Null when the read failed: the page says nothing
 * then, rather than a zero it does not know.
 */
export async function callMinutesThisMonth(db: SupabaseClient<Database>, tenantId: string): Promise<number | null> {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  try {
    return Math.ceil((await callSecondsSince(db, tenantId, since)) / 60);
  } catch (e) {
    log.warn("billing_minutes_unread", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/**
 * What Anthropic has said of this workspace's profile (decision 0097): the service role's table, read for the shell's line.
 * Null when it could not be read: the line is said on the row's word alone. Never throws.
 */
export async function findModelStanding(tenantId: string): Promise<ModelStanding | null> {
  const db = serviceDbIfConfigured();
  if (!db) return null;
  try {
    return await findWorkspaceModelStanding(db, tenantId);
  } catch (e) {
    log.warn("billing_model_paused_unread", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/**
 * The plans of the workspaces a deleted account was the only member of, ended through the edge (00262). Never throws:
 * the account is already gone, and a plan the edge could not end is ended by its next event there (applySubscription).
 */
export async function endEmptiedWorkspaces(ids: unknown): Promise<void> {
  const list = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  await Promise.all(
    list.map(async (tenantId) => {
      const r = await callEdgeBilling({ op: "end", tenant_id: tenantId });
      if (r.status !== 200)
        log.error("account_delete_plan_not_ended", { tenant_id: tenantId, status: r.status, answer: r.body });
    }),
  );
}

/** One call to the edge's billing endpoint. Never throws: a failure is a status the caller reads. */
export async function callEdgeBilling(
  body: EdgeBody<"/api/admin/billing">,
  timeoutMs = 20_000,
): Promise<EdgeAnswer<EdgeRead<"/api/admin/billing">>> {
  if (!edgeConfigured()) return { status: 503, body: { ok: false, error: "no_edge_credential" } };
  // The deployment gate every other provider door keeps (connections/whatsapp.ts): a
  // preview with the edge secret set must not open a real Checkout.
  if (!deployment.providersLive) return { status: 503, body: { ok: false, error: "preview" } };
  return callEdge("/api/admin/billing", body, {
    workspace: typeof body.tenant_id === "string" ? body.tenant_id : null,
    user: typeof body.user_id === "string" ? body.user_id : null,
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
export async function getBillingReadiness(now = Date.now()): Promise<BillingReadiness> {
  if (billingReadyCache && now - billingReadyCache.at < READY_TTL_MS) return billingReadyCache.value;
  const answer = await callEdgeBilling({ op: "status" }, 6_000);
  const body = answer.body ?? {};
  const price = body.price ?? null;
  const value: BillingReadiness =
    answer.status === 200 && body.ok === true
      ? {
          ready: body.ready === true,
          livemode: typeof body.livemode === "boolean" ? body.livemode : null,
          price,
          trial_days: typeof body.trial_days === "number" ? body.trial_days : 14,
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
