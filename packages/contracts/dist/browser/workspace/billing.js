import { callerSentence, WORKSPACE_PAUSED } from "../lines/caller-gets.js";
import { agoWords, DAY_MS, formatterOnUse, numberFormat } from "../shared/time.js";
export const BILLING_MODES = ["stripe", "direct"];
export const BILLING_STATUSES = [
  "none",
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused"
];
export const BILLING_TRIAL_DAYS = 14;
export const FIRST_RUN_TRIAL_DAYS = 0;
export function receptionistOn(status) {
  return status === "trialing" || status === "active" || status === "past_due" || status === "incomplete" || status === "none";
}
export function billingDoorOpen(b) {
  return !!b && b.mode === "stripe" && b.ready;
}
export function maySpend(mode, status) {
  if (mode !== "stripe") return true;
  return status === "active";
}
export function mayUseModels(mode, status, workspace) {
  return openToCustomersOf({ ...workspace, billing: { mode, status } }) === "open";
}
export function openToCustomersOf(f) {
  if (f.ended) return "ended";
  if (f.paused) return "paused";
  return !f.billing || f.billing.mode !== "stripe" || receptionistOn(f.billing.status) ? "open" : "paused";
}
export function takesSignUps(open) {
  return open !== "paused" && open !== "ended";
}
export function hasPublicPages(status, open) {
  return status !== "test" && open !== "ended";
}
export const SPEND_NUMBER = { before: "buying a number", can: "buy a number" };
export const SPEND_LEADS = { before: "finding leads", can: "find leads" };
export const SPEND_TEXTING = { before: "registering for texting", can: "register for texting" };
export function whyCannotSpend(mode, status, doing = SPEND_NUMBER) {
  if (maySpend(mode, status)) return null;
  if (status === "none") return `Start your plan from Billing before ${doing.before}.`;
  if (status === "trialing")
    return `Your free trial doesn't cover ${doing.before}. Start your plan from Billing, then ${doing.can}.`;
  if (status === "incomplete") return "Your card is not confirmed yet. Finish checkout in Billing, then try again.";
  if (status === "past_due") return "Your last payment did not go through. Update the card in Billing, then try again.";
  if (status === "paused" || status === "canceled" || status === "incomplete_expired") {
    return `This workspace is not subscribed. Start it again from Billing before ${doing.before}.`;
  }
  return `Billing needs attention before this workspace can ${doing.can}. Open Billing to sort it out.`;
}
export function tenantStatusFor(mode, status) {
  if (mode !== "stripe") return null;
  return receptionistOn(status) ? "active" : "paused";
}
export const PAUSED_WORDS = /* @__PURE__ */ callerSentence(WORKSPACE_PAUSED);
export const WORKSPACE_PAUSED_FACT = "This workspace is paused, so nothing is sent until billing resumes";
export const CAMPAIGNS_PAUSED_WORDS = `${WORKSPACE_PAUSED_FACT}. Resume it from Settings \u203A Billing.`;
export function planBilling(before, sub, nowMs) {
  const row = {
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_id: sub.price_id,
    current_period_end: sub.current_period_end,
    trial_end: sub.trial_end,
    cancel_at: sub.cancel_at,
    cancel_at_period_end: sub.cancel_at_period_end,
    card_brand: sub.card_brand,
    card_last4: sub.card_last4
  };
  const wanted = tenantStatusFor(before.mode, sub.status);
  const tenantStatus = wanted && wanted !== before.tenant_status ? wanted : null;
  const wasOn = receptionistOn(before.status);
  const isOn = receptionistOn(sub.status);
  const switched = before.mode === "stripe" && wasOn !== isOn ? isOn ? "resumed" : "paused" : null;
  let bell = null;
  if (switched === "paused") {
    bell = {
      title: "Your receptionist is paused",
      body: sub.status === "paused" ? `The trial ended without a card on file. ${PAUSED_WORDS} Resume from Billing.` : `The subscription ended. ${PAUSED_WORDS} Resume from Billing.`
    };
  } else if (switched === "resumed") {
    bell = { title: "Your receptionist is back", body: "Billing is in order; the receptionist answers again." };
  } else if (before.status !== "trialing" && sub.status === "trialing") {
    bell = {
      title: "Your trial has started",
      body: `${trialWords(sub.trial_end, nowMs)}. Cancel any time from Billing.`
    };
  }
  return { row, tenantStatus, switched, bell };
}
const DATE_FMT = formatterOnUse("en-US", { month: "short", day: "numeric" });
export function dayWords(iso) {
  if (!iso) return "";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "" : DATE_FMT.format(new Date(ms));
}
export function trialOffer(days, again = false) {
  if (!(days > 0)) {
    return again ? "Start again with a card; the first charge is today." : "Subscribe with a card; the first charge is today, and you can cancel from here any time.";
  }
  return again ? `Start again with a card; the ${days}-day trial applies once.` : `Start the ${days}-day trial with a card; nothing is charged until it ends, and you can cancel from here any time.`;
}
export function trialWords(trialEnd, nowMs) {
  if (!trialEnd) return "";
  const end = Date.parse(trialEnd);
  if (Number.isNaN(end)) return "";
  const days = Math.ceil((end - nowMs) / DAY_MS);
  if (days <= 0) return "Trial ends today";
  return `${days} day${days === 1 ? "" : "s"} left on the trial, until ${dayWords(trialEnd)}`;
}
export function priceWords(p) {
  if (!p || p.unit_amount === null) return "";
  const amount = numberFormat("en-US", { style: "currency", currency: p.currency.toUpperCase() }).format(
    p.unit_amount / 100
  );
  const per = p.interval === "year" ? "a year" : p.interval === "week" ? "a week" : p.interval === "day" ? "a day" : "a month";
  return `${amount} ${per}`;
}
export const BILLING_TEST_MODE_CLAUSE = "Billing is in test mode, so only Stripe's test cards work and no real money moves";
export const TRIAL_COVERS = "A phone number, texting and lead searches start with the plan.";
export const START_PLAN_WORDS = {
  button: "Start my plan now",
  busy: "Starting\u2026",
  question: "Start your plan today?",
  detail: (plan, card) => `Your free trial ends now, and ${plan || "the plan"} is charged to ${card || "your card on file"} today. A phone number, texting and lead searches open straight after.`,
  yes: "Yes, start it",
  no: "Not now",
  started: "Your plan has started.",
  /** Stripe took the trial's end but not the charge. */
  unpaid: "Your plan started, but the charge did not go through. Update the card in Billing."
};
export function toBillingVM(dto, nowMs = Date.now()) {
  const a = dto.account;
  const plan = priceWords(dto.price) ? `${dto.price?.product_name ? `${dto.price.product_name} \xB7 ` : ""}${priceWords(dto.price)}` : "";
  const card = a?.card_brand && a.card_last4 ? `${a.card_brand.charAt(0).toUpperCase()}${a.card_brand.slice(1)} ending ${a.card_last4}` : null;
  if (!a || a.mode === "direct") {
    return {
      mode: "direct",
      status: a?.status ?? "active",
      headline: "Direct arrangement",
      detail: "This workspace runs on an arrangement made with Chanlytics; nothing on this screen charges anything.",
      tone: "",
      plan,
      card: null,
      actions: { checkout: false, portal: false, resume: false, startNow: false },
      paused: false,
      testMode: null
    };
  }
  const s = a.status;
  const base = {
    mode: "stripe",
    status: s,
    plan,
    card,
    testMode: dto.livemode === false ? `${BILLING_TEST_MODE_CLAUSE}.` : null
  };
  switch (s) {
    case "none":
      return {
        ...base,
        headline: "No subscription yet",
        detail: dto.ready ? trialOffer(dto.trial_days) : "Billing is not available on this deployment yet.",
        tone: "warn",
        actions: { checkout: dto.ready, portal: false, resume: false, startNow: false },
        paused: false
      };
    case "trialing":
      if (a.cancel_at || a.cancel_at_period_end) {
        return {
          ...base,
          headline: "On trial, ending",
          detail: `Cancelled: the receptionist answers until ${dayWords(a.cancel_at ?? a.trial_end) || "the trial ends"}, then stops, and nothing is charged. Undo it from Manage billing before then to keep it.`,
          tone: "warn",
          actions: { checkout: false, portal: true, resume: false, startNow: false },
          paused: false
        };
      }
      return {
        ...base,
        headline: "On trial",
        detail: `${trialWords(a.trial_end, nowMs)}${card ? `, then ${plan || "the plan"} on ${card}` : ""}. ${TRIAL_COVERS}`,
        tone: "ok",
        // Its plan may start now, for what the trial does not cover (maySpend).
        actions: { checkout: false, portal: true, resume: false, startNow: true },
        paused: false
      };
    case "active":
      return {
        ...base,
        headline: a.cancel_at_period_end || a.cancel_at ? "Subscribed, ending" : "Subscribed",
        detail: a.cancel_at || a.cancel_at_period_end ? `Ends ${dayWords(a.cancel_at ?? a.current_period_end)}; the receptionist answers until then.` : `Next invoice ${dayWords(a.current_period_end) || "on the renewal date"}${card ? ` on ${card}` : ""}.`,
        tone: "ok",
        actions: { checkout: false, portal: true, resume: false, startNow: false },
        paused: false
      };
    case "past_due":
      return {
        ...base,
        headline: "Payment failed",
        detail: `${a.last_payment_failed_at ? `The last charge failed ${agoWords(Date.parse(a.last_payment_failed_at), nowMs)}. ` : ""}Stripe retries for a few days; update the card in Manage billing to keep the receptionist answering.`,
        tone: "danger",
        actions: { checkout: false, portal: true, resume: false, startNow: false },
        paused: false
      };
    case "incomplete":
      return {
        ...base,
        headline: "Finishing checkout",
        detail: "The first payment is still being confirmed. This page updates by itself.",
        tone: "warn",
        actions: { checkout: false, portal: true, resume: false, startNow: false },
        paused: false
      };
    case "paused":
      return {
        ...base,
        headline: "Paused",
        detail: "The trial ended without a card on file. Add one in Manage billing, then resume; messages keep landing in the Inbox meanwhile.",
        tone: "danger",
        actions: { checkout: false, portal: true, resume: true, startNow: false },
        paused: true
      };
    case "unpaid":
      return {
        ...base,
        headline: "Paused",
        detail: "Payment could not be collected after several tries. Update the card in Manage billing, then resume.",
        tone: "danger",
        actions: { checkout: false, portal: true, resume: true, startNow: false },
        paused: true
      };
    case "canceled":
    case "incomplete_expired":
    default:
      return {
        ...base,
        headline: "Subscription ended",
        detail: dto.ready ? trialOffer(dto.trial_days, true) : "Billing is not available on this deployment yet.",
        tone: "danger",
        actions: { checkout: dto.ready, portal: !!a.card_brand, resume: false, startNow: false },
        paused: true
      };
  }
}
export function billingPill(vm) {
  return receptionistOn(vm.status) ? { words: "Receptionist answering", tone: "ok" } : { words: "Receptionist paused", tone: "danger" };
}
export const INVOICE_STATUS_WORDS = {
  draft: "Draft",
  open: "Not paid yet",
  paid: "Paid",
  uncollectible: "Could not be collected",
  void: "Cancelled"
};
export function invoiceStatusWords(status) {
  if (!status) return "\u2014";
  return Object.prototype.hasOwnProperty.call(INVOICE_STATUS_WORDS, status) ? INVOICE_STATUS_WORDS[status] ?? status : status;
}
export const CHECKOUT_RETURNS = ["billing", "start"];
export const CHECKOUT_RETURN_ROUTE = { billing: "admin/billing", start: "start" };
export function isCheckoutReturn(v) {
  return typeof v === "string" && CHECKOUT_RETURNS.includes(v);
}
export const CHECKOUT_OUTCOME_WORDS = {
  success: "Your card is on file and the trial has started. This page updates as Stripe confirms it.",
  cancel: "Checkout was closed before finishing; nothing was charged.",
  portal: "Back from Stripe. Any change you made there shows here within a minute."
};
export function moneyWords(amountCents, currency) {
  try {
    return numberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}
export function billingAccountDto(r) {
  return {
    mode: r.mode === "direct" ? "direct" : "stripe",
    status: BILLING_STATUSES.includes(r.status ?? "") ? r.status : "none",
    price_id: r.price_id ?? null,
    current_period_end: r.current_period_end ?? null,
    trial_end: r.trial_end ?? null,
    cancel_at: r.cancel_at ?? null,
    cancel_at_period_end: !!r.cancel_at_period_end,
    card_brand: r.card_brand ?? null,
    card_last4: r.card_last4 ?? null,
    last_payment_failed_at: r.last_payment_failed_at ?? null,
    last_paid_at: r.last_paid_at ?? null,
    updated_at: r.updated_at
  };
}
export function pausedVoiceFacts(businessName) {
  const name = (businessName ?? "").trim() || "this business";
  return [
    `You are answering the phone for ${name}. Their automated receptionist is paused right now, so you cannot help with bookings, prices, hours or questions today.`,
    "Say so plainly and kindly, in the caller's language. Take the caller's name, their number and what they need, tell them someone from the business will call them back, and end the call politely.",
    "Do not quote a price, do not book or reschedule anything, do not transfer the call, and do not promise a time for the call back."
  ].join("\n");
}
