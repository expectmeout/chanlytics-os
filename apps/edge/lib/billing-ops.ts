/**
 * The billing door's ops (api/admin/billing.ts), decided apart from the wire.
 *
 * The routines themselves are billing.ts's (checkoutFor, syncFor and the
 * rest) and their decisions are contracts' (planBilling). What the door adds
 * is small and used to be repeated per op: which status each refusal earns
 * on the wire, which line each op logs, and what the body may say about
 * Checkout. Beside billing.ts rather than under a billing/ directory because
 * billing.ts is imported by its path from the registrations sweep and the
 * billing tests, and a move is not this change's.
 */
import { isCheckoutReturn, type CheckoutReturn } from "./packages/contracts.js";
import type { LogEvent } from "./log.js";

/** The body as the dashboard's /api/v1/billing verbs send it. */
export interface BillingBody {
  op?: string;
  tenant_id?: string;
  email?: string;
  /** Where Checkout comes back to: a place on contracts' closed list, or Billing. */
  return?: unknown;
}

/** The ops past status, each over the workspace's row. */
export type BillingOp = "checkout" | "portal" | "invoices" | "sync" | "resume" | "start_now";

export const UNKNOWN_BILLING_OP = {
  status: 400,
  body: { ok: false, error: "op must be status, checkout, portal, invoices, sync, resume or start_now" },
};

/** An op's outcome as billing.ts states it: what went right, or which refusal and Stripe's words. */
export type BillingOutcome = { ok: true; status?: string } | { ok: false; error: string; detail?: string };

/** What each refusal earns on the wire; a failure the list does not name is a 500. */
const STATUS_OF: Record<string, number> = {
  not_ready: 503,
  no_account: 404,
  direct: 409,
  already_subscribed: 409,
  no_customer: 409,
  no_subscription: 409,
  not_paused: 409,
  not_trialing: 409,
  stripe_refused: 502,
};

export function billingStatusOf(r: BillingOutcome): number {
  return r.ok ? 200 : (STATUS_OF[r.error] ?? 500);
}

/** The ops that move the subscription log the status they left it in, or the refusal. */
const MOVES: Record<"sync" | "resume" | "start_now", { done: LogEvent; refused: LogEvent }> = {
  sync: { done: "billing_synced", refused: "billing_sync_refused" },
  resume: { done: "billing_resumed", refused: "billing_resume_refused" },
  start_now: { done: "billing_started_now", refused: "billing_start_now_refused" },
};

/** The line an op logs, or none: the portal and the invoices are reads and say nothing. Event names never change. */
export function billingLogOf(
  op: BillingOp,
  r: BillingOutcome,
): { event: LogEvent; fields: Record<string, unknown> } | null {
  if (op === "checkout") {
    return r.ok
      ? { event: "billing_checkout_opened", fields: {} }
      : { event: "billing_checkout_refused", fields: { error: r.error, detail: r.detail?.slice(0, 200) } };
  }
  if (!Object.hasOwn(MOVES, op)) return null;
  const names = MOVES[op as keyof typeof MOVES];
  return r.ok
    ? { event: names.done, fields: { status: r.status } }
    : { event: names.refused, fields: { error: r.error } };
}

/**
 * What Checkout is told: the owner's address when it looks like one, and where to come back to -- a place on the
 * closed list, or Billing, never a path taken on the caller's word.
 */
export function checkoutRequest(rawEmail: unknown, rawReturn: unknown): { email: string | null; back: CheckoutReturn } {
  const email = typeof rawEmail === "string" && rawEmail.includes("@") ? rawEmail.trim().slice(0, 254) : null;
  const back = isCheckoutReturn(rawReturn) ? rawReturn : "billing";
  return { email, back };
}
