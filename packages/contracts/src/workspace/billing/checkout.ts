/** Billing: checkout. */

import { numberFormat } from "../../shared/time";
import {
  BILLING_STATUSES,
  type BillingAccountDto,
  type BillingMode,
  type BillingPriceDto,
  type BillingStatus,
} from "./dtos";
import { isOneOf } from "../../shared/unknown";

/** An invoice's status in an owner's words. A word Stripe adds later is shown as Stripe says it; none, as a dash. */
export const INVOICE_STATUS_WORDS: Record<string, string> = {
  draft: "Draft",
  open: "Not paid yet",
  paid: "Paid",
  uncollectible: "Could not be collected",
  void: "Cancelled",
};

export function invoiceStatusWords(status: string | null | undefined): string {
  if (!status) return "—";
  return Object.prototype.hasOwnProperty.call(INVOICE_STATUS_WORDS, status)
    ? (INVOICE_STATUS_WORDS[status] ?? status)
    : status;
}

/** The Setup row's facts: enough to say the state and the one next step. */
export interface SetupBillingFacts {
  ready: boolean;
  /** Which of Stripe's worlds the key opens, as BillingDto carries it: false says test mode on the row. */
  livemode: boolean | null;
  mode: BillingMode;
  status: BillingStatus;
  trial_end: string | null;
  current_period_end: string | null;
  trial_days: number;
  /** Set when the subscription is cancelled ahead: it runs out on that day. */
  cancel_at?: string | null;
  cancel_at_period_end?: boolean;
  /** The plan as Stripe states it (billingReadiness): the first run's trial says its price. Absent reads as unknown. */
  price?: BillingPriceDto | null;
}

/**
 * Where Stripe hands the browser back: Settings › Billing, or the first run that asked for the card. A closed
 * list, because the address is built on the edge from this word, and a free path would be an open redirect on
 * our own domain.
 */
export const CHECKOUT_RETURNS = ["billing", "start"] as const;

export type CheckoutReturn = (typeof CHECKOUT_RETURNS)[number];

/** The route each place is, after the workspace's own page (/w/<slug>#/<route>). */
export const CHECKOUT_RETURN_ROUTE: Record<CheckoutReturn, string> = { billing: "admin/billing", start: "start" };

export function isCheckoutReturn(value: unknown): value is CheckoutReturn {
  return typeof value === "string" && isOneOf(CHECKOUT_RETURNS, value);
}

/** The words the pages say for what came back from Stripe (the query the card reads once). */
export const CHECKOUT_OUTCOME_WORDS: Record<string, string> = {
  success: "Your card is on file and the trial has started. This page updates as Stripe confirms it.",
  cancel: "Checkout was closed before finishing; nothing was charged.",
  portal: "Back from Stripe. Any change you made there shows here within a minute.",
};

/** "$49.00" from cents and a currency, as Stripe states them. */
export function moneyWords(amountCents: number, currency: string): string {
  try {
    return numberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** The row as the pages read it, from whatever the database returned; a word the enum does not know reads as none. */
export function billingAccountDto(row: {
  mode?: string | null;
  status?: string | null;
  price_id?: string | null;
  current_period_end?: string | null;
  trial_end?: string | null;
  cancel_at?: string | null;
  cancel_at_period_end?: boolean | null;
  card_brand?: string | null;
  card_last4?: string | null;
  last_payment_failed_at?: string | null;
  last_paid_at?: string | null;
  updated_at: string;
}): BillingAccountDto {
  return {
    mode: row.mode === "direct" ? "direct" : "stripe",
    status: isOneOf(BILLING_STATUSES, row.status) ? row.status : "none",
    price_id: row.price_id ?? null,
    current_period_end: row.current_period_end ?? null,
    trial_end: row.trial_end ?? null,
    cancel_at: row.cancel_at ?? null,
    cancel_at_period_end: !!row.cancel_at_period_end,
    card_brand: row.card_brand ?? null,
    card_last4: row.card_last4 ?? null,
    last_payment_failed_at: row.last_payment_failed_at ?? null,
    last_paid_at: row.last_paid_at ?? null,
    updated_at: row.updated_at,
  };
}

/**
 * What the phone receptionist is told when the workspace is paused: take a
 * message and promise a call back, nothing more. Replaces the business's
 * whole prompt for the call, so no price, no booking and no transfer can
 * come out of a line whose subscription stopped.
 */
export function pausedVoiceFacts(businessName: string | null | undefined): string {
  const name = (businessName ?? "").trim() || "this business";
  return [
    `You are answering the phone for ${name}. Their automated receptionist is paused right now, so you cannot help with bookings, prices, hours or questions today.`,
    "Say so plainly and kindly, in the caller's language. Take the caller's name, their number and what they need, tell them someone from the business will call them back, and end the call politely.",
    "Do not quote a price, do not book or reschedule anything, do not transfer the call, and do not promise a time for the call back.",
  ].join("\n");
}
