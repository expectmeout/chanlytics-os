/** Billing: dtos. */

import type { ModelStanding } from "../../ai/anthropic-enforcement";

export const BILLING_MODES = ["stripe", "direct"] as const;

export type BillingMode = (typeof BILLING_MODES)[number];

/** Stripe's subscription statuses, plus 'none' before one exists. */
export const BILLING_STATUSES = [
  "none",
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;

export type BillingStatus = (typeof BILLING_STATUSES)[number];

/**
 * The trial a new workspace gets at Checkout, in days, from every door: the first run's Go live and Billing alike
 * (decision 0090: the trial covers everything, Ruben, 3 Nov 2026). The edge's checkout reads it through trialDaysFor and
 * every screen that states a trial says it, so no screen promises a trial the checkout does not give.
 */
export const BILLING_TRIAL_DAYS = 14;

/**
 * The trial a checkout gives: the deployment's length (the edge's BILLING_TRIAL_DAYS, else the constant above) when
 * the workspace has never had a subscription, else none, since the trial applies once. One rule for every door: which
 * door the owner came through never changes it (decision 0090).
 */
export function trialDaysFor(fields: { hadSubscription: boolean; deploymentDays?: number | null }): number {
  if (fields.hadSubscription) return 0;
  const d = fields.deploymentDays;
  return typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 90 ? d : BILLING_TRIAL_DAYS;
}

export interface BillingAccountDto {
  mode: BillingMode;
  status: BillingStatus;
  price_id: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at: string | null;
  cancel_at_period_end: boolean;
  card_brand: string | null;
  card_last4: string | null;
  last_payment_failed_at: string | null;
  last_paid_at: string | null;
  updated_at: string;
}

/** The plan as Stripe states it: the amount is Stripe's, never a literal in this repo. */
export interface BillingPriceDto {
  id: string;
  currency: string;
  unit_amount: number | null;
  interval: "day" | "week" | "month" | "year" | null;
  product_name: string | null;
}

export interface BillingDto {
  /** Whether this deployment can charge at all: the key, the price and the webhook secret are on the edge. */
  ready: boolean;
  /**
   * Which of Stripe's two worlds the edge's key opens: true live; false test, where only Stripe's test cards work and no
   * money moves; null when the edge did not say. Billing and Setup say test mode from it (the wiring audit's S9).
   */
  livemode: boolean | null;
  account: BillingAccountDto | null;
  price: BillingPriceDto | null;
  trial_days: number;
  /**
   * The phone receptionist's minutes since the month began (UTC), from each call's metered seconds (usage.voice_seconds,
   * decision 0092): what the voice provider is paid for. Null when the read failed; absent from an older route.
   */
  call_minutes_month?: number | null;
  /** What Anthropic has said of this workspace's profile, for the shell's line (decision 0097). Null when nothing is open. */
  model_standing?: ModelStanding | null;
}

/** The month's call minutes, said: none yet, one, or how many. Null when they could not be read. */
export function callMinutesWords(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  if (minutes === 0) return "No calls answered this month yet";
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} of calls answered this month`;
}

export interface BillingInvoiceDto {
  id: string;
  number: string | null;
  status: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string;
  created_at: string;
  hosted_url: string | null;
  pdf_url: string | null;
}

/**
 * ANSWERING and SPENDING are two questions, and this file used to answer only
 * the first — which is how a workspace that had never entered a card came to
 * be entitled to buy a phone number and file a carrier registration on
 * Chanlytics' account.
 *
 * Keep them apart and each can be tuned for what it actually risks:
 *
 *   receptionistOn   generous. Getting it wrong drops a live conversation,
 *                    which the customer feels immediately and we cannot undo.
 *   maySpend         strict. Getting it wrong costs real money on our account,
 *                    and the customer feels nothing at all.
 */

/** What Stripe's word means for the receptionist: on, or paused. incomplete is the minutes between Checkout and the first payment; never a pause. */
export function receptionistOn(status: BillingStatus): boolean {
  return (
    status === "trialing" ||
    status === "active" ||
    status === "past_due" ||
    status === "incomplete" ||
    status === "none"
  );
}

/**
 * May this workspace incur a cost on Chanlytics' own account?
 *
 * Buying a number is $1.15 a month for as long as it is held; a carrier
 * registration is $4.50 for the brand and $15.00 for the campaign, one time
 * and non-refundable. All of it lands on the platform's Twilio balance
 * whatever the workspace does next.
 *
 * `direct` is every workspace that predates Stripe. They are invoiced by hand
 * and are not asked for a card, so the question does not apply — the same
 * carve-out tenantStatusFor already makes.
 *
 * `none` and `incomplete` are deliberately ABSENT while receptionistOn admits
 * them. `none` is a workspace that has never entered a card; `incomplete` is
 * the minutes between Checkout opening and the first payment, which is exactly
 * the window an abandoned Checkout leaves behind. Both are fine reasons to keep
 * answering an existing conversation. Neither is a reason to spend.
 */
/**
 * Is there a card door to send anybody to?
 *
 * `maySpend` answers whether this workspace MAY put a charge on our account.
 * This answers something different and easily confused with it: whether a page
 * exists that a person could do anything on. They came apart on the deployment
 * that matters most — a brand-new self-serve workspace.
 *
 * `provision_tenant` gives every workspace `billing_accounts(mode='stripe',
 * status='none')`. With the Stripe keys unset, `billingReadiness()` is false, so
 * `toBillingVM` returns "Billing is not available on this deployment yet" with
 * every action false. Setup's billing ROW already knew that and drew nothing —
 * "a closed door draws nothing". The LINE row did not: it read `canSpend` alone,
 * concluded "cannot spend, so tell them to add a card", and sent the owner to a
 * page with no buttons on it. Nothing in the product could put the workspace on
 * a direct arrangement, so the only escape was a hand-written SQL UPDATE.
 *
 * Two rows deciding the same thing from the same facts, disagreeing. One
 * predicate, read by both.
 */
export function billingDoorOpen<T extends { mode: BillingMode; ready: boolean }>(
  second: T | null | undefined,
): second is T {
  return !!second && second.mode === "stripe" && second.ready;
}

/**
 * What a spend is for. Each kind has its own row in SPEND_STATUSES, because they risk different amounts: a number is
 * $1.15 a month for as long as it is held, a texting registration $19.50 once and non-refundable, a lead search a
 * provider's bill, and a rehearsal (the browser call, a typed try, its review, a fix) a few capped minutes and model
 * turns the edge counts itself (rehearsalAllowance).
 */
export const SPEND_KINDS = ["number", "texting", "leads", "rehearse"] as const;

export type SpendKind = (typeof SPEND_KINDS)[number];

/**
 * The statuses a stripe workspace may spend under, by kind (decision 0090, Ruben, 3 Nov 2026: "all should be part of
 * the trial"). The trial covers everything the plan does: one number (the lines door holds one a workspace), one
 * texting registration (one a line), and the trial's own leads (lead_cap 'trial_leads' in SQL, LEAD_TRIAL_ALLOWANCE
 * here). A rehearsal is open before any plan too, since the first run rehearses before it pays: the edge's allowance
 * (ten minutes before the plan) and the day's model caps are its ceiling.
 *
 * past_due is ABSENT from every row while receptionistOn admits it: the last charge failed and Stripe is retrying. The
 * receptionist keeps answering the conversations the workspace already has, and nothing new is bought on our account
 * until the card is fixed. `none` is absent wherever money leaves for a provider: a workspace that never entered a card
 * buys nothing, and `incomplete` is the minutes an abandoned Checkout leaves behind.
 */
const SPEND_STATUSES: Readonly<Record<SpendKind, readonly BillingStatus[]>> = {
  number: ["trialing", "active"],
  texting: ["trialing", "active"],
  leads: ["trialing", "active"],
  rehearse: ["none", "trialing", "active"],
};

export function maySpend(mode: BillingMode, status: BillingStatus, kind: SpendKind = "number"): boolean {
  if (mode !== "stripe") return true;
  return SPEND_STATUSES[kind].includes(status);
}

/**
 * May this workspace spend the platform's model key on what a person asks for (Ask, the drafts, a review's reply, a
 * note)? The scorecard's category 39: model spend inside billing's taxonomy.
 *
 * Between the two predicates above, and on purpose. The model is what the trial is FOR (the first run asks Ask its
 * first question), so a trialing workspace uses it, inside the day's caps (ASK_TOKENS_DAY, max_llm_tokens_day). A
 * workspace billing paused, or that 00262 ended when its last member left, or whose plan is over (canceled, unpaid,
 * incomplete_expired), spends nothing: no Ask, no draft. `direct` is invoiced by hand, as maySpend says.
 */
export function mayUseModels(
  mode: BillingMode,
  status: BillingStatus,
  workspace: { paused: boolean; ended: boolean },
): boolean {
  return openToCustomersOf({ ...workspace, billing: { mode, status } }) === "open";
}

/**
 * Whether a workspace is open to its customers (the wiring's second audit, X4-1): `open`; `paused`, by billing or by a
 * person (tenants.status), or by a plan billed through Stripe in a state that stops the receptionist (receptionistOn);
 * or `ended`, its last member gone (00262, left_empty_at). One rule for what answers on the business's behalf: the
 * model's spend (mayUseModels), the receptionist's public replies (packages/db doesWorkspaceAnswerOnItsOwn), the public
 * pages and the code that ask a customer for a yes (takesSignUps, hasPublicPages), and the carrier filing nobody presses
 * (the edge's registrations sweep). A workspace with no billing row is judged by its own standing alone.
 */
export type OpenToCustomers = "open" | "paused" | "ended";

export function openToCustomersOf(fields: {
  paused: boolean;
  ended: boolean;
  billing: { mode: BillingMode; status: BillingStatus } | null;
}): OpenToCustomers {
  if (fields.ended) return "ended";
  if (fields.paused) return "paused";
  return !fields.billing || fields.billing.mode !== "stripe" || receptionistOn(fields.billing.status)
    ? "open"
    : "paused";
}

/**
 * Whether a workspace's pages ask a customer for a yes: not while it is paused or ended, since nobody answers on its
 * behalf. Null is not read (an older server), which keeps the page as it was.
 */
export function takesSignUps(open: OpenToCustomers | null | undefined): boolean {
  return open !== "paused" && open !== "ended";
}

/**
 * Whether a workspace has public pages at all: not a fixture (`test`), not a lead's preview (`preview`, decision 0079:
 * its page is the preview's own), and not ended (its pages are Not found and
 * unindexed: X4-2). A paused workspace keeps them, readable for the carriers' re-vet, and asks nobody for a yes.
 */
export function hasPublicPages(status: string, open: OpenToCustomers): boolean {
  return status !== "test" && status !== "preview" && open !== "ended";
}

/**
 * What a refusal to spend says the money was FOR.
 *
 * Until the lead finder there was one spending route family and the sentences
 * named it outright — "Add a card before buying a number". An owner refused on
 * the Leads page then read about phone numbers, which is a refusal about
 * something they were not doing. Two forms, because the sentences need both:
 * `before` follows "before", `can` follows "can".
 */
export interface SpendWords {
  /** Which row of SPEND_STATUSES the spend is judged by. */
  kind: SpendKind;
  before: string;
  can: string;
}

/** The default, and what every lines route keeps saying. */
export const SPEND_NUMBER: SpendWords = { kind: "number", before: "buying a number", can: "buy a number" };

/** The lead finder: a search spends on someone else's account, not on a number. */
export const SPEND_LEADS: SpendWords = { kind: "leads", before: "finding leads", can: "find leads" };

/** A carrier registration for texting: $19.50 on our account, one time and non-refundable. */
export const SPEND_TEXTING: SpendWords = {
  kind: "texting",
  before: "registering for texting",
  can: "register for texting",
};

/**
 * Why a workspace may not spend, in the owner's words, or null when it may.
 *
 * A refusal at the moment somebody is trying to give you money has to say what
 * to do about it, so this is a sentence and a destination rather than a code.
 */
export function whyCannotSpend(
  mode: BillingMode,
  status: BillingStatus,
  doing: SpendWords = SPEND_NUMBER,
): string | null {
  if (maySpend(mode, status, doing.kind)) return null;
  if (status === "none") return `Start your free trial from Billing before ${doing.before}.`;
  if (status === "incomplete") return "Your card is not confirmed yet. Finish checkout in Billing, then try again.";
  if (status === "past_due") return "Your last payment did not go through. Update the card in Billing, then try again.";
  if (status === "paused" || status === "canceled" || status === "incomplete_expired") {
    return `This workspace is not subscribed. Start it again from Billing before ${doing.before}.`;
  }
  return `Billing needs attention before this workspace can ${doing.can}. Open Billing to sort it out.`;
}
