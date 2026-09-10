/**
 * Billing, the pure half: the row as the pages read it, what Stripe's
 * subscription means for the workspace (the switch, the words, the bell),
 * and the Setup row. No Stripe client, no network: the edge applies what
 * planBilling decides, and the tests read the same functions.
 */
import { agoWords } from "./time";

export const BILLING_MODES = ["stripe", "direct"] as const;
export type BillingMode = (typeof BILLING_MODES)[number];

/** Stripe's subscription statuses, plus 'none' before one exists. */
export const BILLING_STATUSES = ["none", "incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

/** The trial a new workspace gets at Checkout, in days. */
export const BILLING_TRIAL_DAYS = 14;

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
  account: BillingAccountDto | null;
  price: BillingPriceDto | null;
  trial_days: number;
  role: string;
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
  return status === "trialing" || status === "active" || status === "past_due" || status === "incomplete" || status === "none";
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
  b: T | null | undefined,
): b is T {
  return !!b && b.mode === "stripe" && b.ready;
}

export function maySpend(mode: BillingMode, status: BillingStatus): boolean {
  if (mode !== "stripe") return true;
  return status === "trialing" || status === "active" || status === "past_due";
}

/**
 * Why a workspace may not spend, in the owner's words, or null when it may.
 *
 * A refusal at the moment somebody is trying to give you money has to say what
 * to do about it, so this is a sentence and a destination rather than a code.
 */
export function whyCannotSpend(mode: BillingMode, status: BillingStatus): string | null {
  if (maySpend(mode, status)) return null;
  if (status === "none") return "Add a card before buying a number — nothing is charged until your trial ends.";
  if (status === "incomplete") return "Your card is not confirmed yet. Finish checkout in Billing, then try again.";
  if (status === "paused" || status === "canceled" || status === "incomplete_expired") {
    return "This workspace is not subscribed. Start it again from Billing before buying a number.";
  }
  return "Billing needs attention before this workspace can buy a number. Open Billing to sort it out.";
}

/** The switch the runtime reads, for a stripe-mode workspace. A direct one is never touched. */
export function tenantStatusFor(mode: BillingMode, status: BillingStatus): "active" | "paused" | null {
  if (mode !== "stripe") return null;
  return receptionistOn(status) ? "active" : "paused";
}

/** The subscription as the webhook or a sync reads it, already flattened. */
export interface SubscriptionFacts {
  id: string;
  status: BillingStatus;
  price_id: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at: string | null;
  cancel_at_period_end: boolean;
  card_brand: string | null;
  card_last4: string | null;
}

export interface BillingBell {
  title: string;
  body: string;
}

export interface BillingPlan {
  row: Partial<BillingAccountDto> & { stripe_subscription_id: string };
  /** The tenant switch to write, when it changes; null when nothing changes or the workspace is direct. */
  tenantStatus: "active" | "paused" | null;
  /** True when the receptionist goes from on to paused, or back. */
  switched: "paused" | "resumed" | null;
  bell: BillingBell | null;
}

/**
 * What one subscription reading means for the row and the switch. The
 * status is copied verbatim; the switch follows receptionistOn; a bell
 * rings only when the receptionist's state changes, never on every update.
 */
export function planBilling(before: { mode: BillingMode; status: BillingStatus; tenant_status: string }, sub: SubscriptionFacts, nowMs: number): BillingPlan {
  const row: BillingPlan["row"] = {
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_id: sub.price_id,
    current_period_end: sub.current_period_end,
    trial_end: sub.trial_end,
    cancel_at: sub.cancel_at,
    cancel_at_period_end: sub.cancel_at_period_end,
    card_brand: sub.card_brand,
    card_last4: sub.card_last4,
  };
  const wanted = tenantStatusFor(before.mode, sub.status);
  const tenantStatus = wanted && wanted !== before.tenant_status ? wanted : null;
  const wasOn = receptionistOn(before.status);
  const isOn = receptionistOn(sub.status);
  const switched: BillingPlan["switched"] = before.mode === "stripe" && wasOn !== isOn ? (isOn ? "resumed" : "paused") : null;
  let bell: BillingBell | null = null;
  if (switched === "paused") {
    bell = {
      title: "Your receptionist is paused",
      body: sub.status === "paused"
        ? "The trial ended without a card on file. Messages still land in the Inbox; nothing is answered until you resume from Billing."
        : "The subscription ended. Messages still land in the Inbox; nothing is answered until you resume from Billing.",
    };
  } else if (switched === "resumed") {
    bell = { title: "Your receptionist is back", body: "Billing is in order; the receptionist answers again." };
  } else if (before.status !== "trialing" && sub.status === "trialing") {
    bell = { title: "Your trial has started", body: `${trialWords(sub.trial_end, nowMs)}. Cancel any time from Billing.` };
  }
  return { row, tenantStatus, switched, bell };
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
export function dayWords(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "" : DATE_FMT.format(new Date(ms));
}

/** "13 days left, until Sep 21" · "ends today" · "" */
/**
 * The offer, in the owner's words, for however many trial days there are.
 * Zero is a legitimate setting — no trial, charge today — and the sentence has
 * to stay true at zero rather than promising "the 0-day trial".
 */
export function trialOffer(days: number, again = false): string {
  if (!(days > 0)) {
    return again
      ? "Start again with a card; the first charge is today."
      : "Subscribe with a card; the first charge is today, and you can cancel from here any time.";
  }
  return again
    ? `Start again with a card; the ${days}-day trial applies once.`
    : `Start the ${days}-day trial with a card; nothing is charged until it ends, and you can cancel from here any time.`;
}

export function trialWords(trialEnd: string | null | undefined, nowMs: number): string {
  if (!trialEnd) return "";
  const end = Date.parse(trialEnd);
  if (Number.isNaN(end)) return "";
  const days = Math.ceil((end - nowMs) / 86_400_000);
  if (days <= 0) return "Trial ends today";
  return `${days} day${days === 1 ? "" : "s"} left on the trial, until ${dayWords(trialEnd)}`;
}

/** "$49.00 a month" from Stripe's own figures; "" when the price is not readable. */
export function priceWords(p: BillingPriceDto | null | undefined): string {
  if (!p || p.unit_amount === null) return "";
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency.toUpperCase() }).format(p.unit_amount / 100);
  const per = p.interval === "year" ? "a year" : p.interval === "week" ? "a week" : p.interval === "day" ? "a day" : "a month";
  return `${amount} ${per}`;
}

export interface BillingVM {
  mode: BillingMode;
  status: BillingStatus;
  /** One line for the pane's head and the Setup row. */
  headline: string;
  /** The sentence under it. */
  detail: string;
  /** A pill's tone. */
  tone: "ok" | "warn" | "danger" | "";
  /** The plan and its price, when Stripe states one. */
  plan: string;
  card: string | null;
  /** What an owner may do from here. */
  actions: { checkout: boolean; portal: boolean; resume: boolean };
  paused: boolean;
}

export function toBillingVM(dto: BillingDto, nowMs = Date.now()): BillingVM {
  const a = dto.account;
  const plan = priceWords(dto.price) ? `${dto.price?.product_name ? `${dto.price.product_name} · ` : ""}${priceWords(dto.price)}` : "";
  const card = a?.card_brand && a.card_last4 ? `${a.card_brand.charAt(0).toUpperCase()}${a.card_brand.slice(1)} ending ${a.card_last4}` : null;
  if (!a || a.mode === "direct") {
    return { mode: "direct", status: a?.status ?? "active", headline: "Direct arrangement", detail: "This workspace runs on an arrangement made with Chanlytics; nothing on this screen charges anything.", tone: "", plan, card: null, actions: { checkout: false, portal: false, resume: false }, paused: false };
  }
  const s = a.status;
  const base = { mode: "stripe" as const, status: s, plan, card };
  switch (s) {
    case "none":
      return { ...base, headline: "No subscription yet", detail: dto.ready ? trialOffer(dto.trial_days) : "Billing is not available on this deployment yet.", tone: "warn", actions: { checkout: dto.ready, portal: false, resume: false }, paused: false };
    case "trialing":
      // Cancelled during the trial: Stripe keeps the subscription trialing and sets cancel_at to the trial's end.
      if (a.cancel_at || a.cancel_at_period_end) {
        return { ...base, headline: "On trial, ending", detail: `Cancelled: the receptionist answers until ${dayWords(a.cancel_at ?? a.trial_end) || "the trial ends"}, then stops, and nothing is charged. Undo it from Manage billing before then to keep it.`, tone: "warn", actions: { checkout: false, portal: true, resume: false }, paused: false };
      }
      return { ...base, headline: "On trial", detail: `${trialWords(a.trial_end, nowMs)}${card ? `, then ${plan || "the plan"} on ${card}` : ""}.`, tone: "ok", actions: { checkout: false, portal: true, resume: false }, paused: false };
    case "active":
      return { ...base, headline: a.cancel_at_period_end || a.cancel_at ? "Subscribed, ending" : "Subscribed", detail: a.cancel_at || a.cancel_at_period_end ? `Ends ${dayWords(a.cancel_at ?? a.current_period_end)}; the receptionist answers until then.` : `Next invoice ${dayWords(a.current_period_end) || "on the renewal date"}${card ? ` on ${card}` : ""}.`, tone: "ok", actions: { checkout: false, portal: true, resume: false }, paused: false };
    case "past_due":
      return { ...base, headline: "Payment failed", detail: `${a.last_payment_failed_at ? `The last charge failed ${agoWords(Date.parse(a.last_payment_failed_at), nowMs)}. ` : ""}Stripe retries for a few days; update the card in Manage billing to keep the receptionist answering.`, tone: "danger", actions: { checkout: false, portal: true, resume: false }, paused: false };
    case "incomplete":
      return { ...base, headline: "Finishing checkout", detail: "The first payment is still being confirmed. This page updates by itself.", tone: "warn", actions: { checkout: false, portal: true, resume: false }, paused: false };
    case "paused":
      return { ...base, headline: "Paused", detail: "The trial ended without a card on file. Add one in Manage billing, then resume; messages keep landing in the Inbox meanwhile.", tone: "danger", actions: { checkout: false, portal: true, resume: true }, paused: true };
    case "unpaid":
      return { ...base, headline: "Paused", detail: "Payment could not be collected after several tries. Update the card in Manage billing, then resume.", tone: "danger", actions: { checkout: false, portal: true, resume: true }, paused: true };
    case "canceled":
    case "incomplete_expired":
    default:
      return { ...base, headline: "Subscription ended", detail: dto.ready ? trialOffer(dto.trial_days, true) : "Billing is not available on this deployment yet.", tone: "danger", actions: { checkout: dto.ready, portal: !!a.card_brand, resume: false }, paused: true };
  }
}

/** The Setup row's facts: enough to say the state and the one next step. */
export interface SetupBillingFacts {
  ready: boolean;
  mode: BillingMode;
  status: BillingStatus;
  trial_end: string | null;
  current_period_end: string | null;
  trial_days: number;
  /** Set when the subscription is cancelled ahead: it runs out on that day. */
  cancel_at?: string | null;
  cancel_at_period_end?: boolean;
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
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** The row as the pages read it, from whatever the database returned; a word the enum does not know reads as none. */
export function billingAccountDto(r: { mode?: string | null; status?: string | null; price_id?: string | null; current_period_end?: string | null; trial_end?: string | null; cancel_at?: string | null; cancel_at_period_end?: boolean | null; card_brand?: string | null; card_last4?: string | null; last_payment_failed_at?: string | null; last_paid_at?: string | null; updated_at: string }): BillingAccountDto {
  return {
    mode: r.mode === "direct" ? "direct" : "stripe",
    status: (BILLING_STATUSES as readonly string[]).includes(r.status ?? "") ? (r.status as BillingStatus) : "none",
    price_id: r.price_id ?? null,
    current_period_end: r.current_period_end ?? null,
    trial_end: r.trial_end ?? null,
    cancel_at: r.cancel_at ?? null,
    cancel_at_period_end: !!r.cancel_at_period_end,
    card_brand: r.card_brand ?? null,
    card_last4: r.card_last4 ?? null,
    last_payment_failed_at: r.last_payment_failed_at ?? null,
    last_paid_at: r.last_paid_at ?? null,
    updated_at: r.updated_at,
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
