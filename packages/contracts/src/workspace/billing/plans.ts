/** Billing: plans. */

import { callerSentence, WORKSPACE_PAUSED } from "../../lines/caller-gets";
import { usableZone } from "../../shared/zone/math";
import { agoWords, DAY_MS, dateFormat, numberFormat } from "../../shared/time";
import { LEAD_TRIAL_ALLOWANCE } from "../../leads/search/caps";
import {
  receptionistOn,
  type BillingAccountDto,
  type BillingDto,
  type BillingMode,
  type BillingPriceDto,
  type BillingStatus,
} from "./dtos";

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
/**
 * What a paused workspace does, said the one way (the bell, the shell's status line, Today's alert and empty queue,
 * Start's billing row, the back office): calls are still picked up, only to take a message (pausedVoiceFacts), and every
 * other message waits in the Inbox for a person. It is the standing value's own sentence (lines/caller-gets.ts
 * WORKSPACE_PAUSED), so no page words what a caller gets of a pause a second time.
 */
export const PAUSED_WORDS = /* @__PURE__ */ callerSentence(WORKSPACE_PAUSED);

/**
 * What a campaign says while the workspace is paused, said the one way, in each place that says it in full: the composers'
 * foot where Send would be (broadcasts and playbooks), the route's refusal of a broadcast made under a pause (core
 * createBroadcast), an approval refused (core approveRun), Run now refused (the edge's 402, the dashboard's route), and the
 * approval where it would be pressed: the run's sheet (contracts toApprovalVM) and Today's row for a run waiting on a person.
 * Ask's run card reads no readiness and says it when the card is confirmed (approveRun's refusal). The Campaigns home's
 * rows say it short, in their own words ("after billing resumes", contracts nextRunLabel; the lifecycle's coming row). The
 * send door refuses every broadcast message under a pause (core deliver.ts `paused`), so a page that offered Send, or promised
 * a run, said what would not happen. Today says it about the receptionist (PAUSED_WORDS, after "This workspace is
 * paused."); this is the same fact said about what is sent.
 */
/** The fact itself, for a line that carries its own door to Billing (Campaigns' head): the sentence below without its second. */
export const WORKSPACE_PAUSED_FACT = "This workspace is paused, so nothing is sent until billing resumes";

export const CAMPAIGNS_PAUSED_WORDS = `${WORKSPACE_PAUSED_FACT}. Resume it from Settings › Billing.`;

export function planBilling(
  before: { mode: BillingMode; status: BillingStatus; tenant_status: string },
  sub: SubscriptionFacts,
  nowMs: number,
  tz: string,
): BillingPlan {
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
  const switched: BillingPlan["switched"] =
    before.mode === "stripe" && wasOn !== isOn ? (isOn ? "resumed" : "paused") : null;
  let bell: BillingBell | null = null;
  if (switched === "paused") {
    bell = {
      title: "Your receptionist is paused",
      body:
        sub.status === "paused"
          ? `The trial ended without a card on file. ${PAUSED_WORDS} Resume from Billing.`
          : `The subscription ended. ${PAUSED_WORDS} Resume from Billing.`,
    };
  } else if (switched === "resumed") {
    bell = { title: "Your receptionist is back", body: "Billing is in order; the receptionist answers again." };
  } else if (before.status !== "trialing" && sub.status === "trialing") {
    bell = {
      title: "Your trial has started",
      body: `${trialWords(sub.trial_end, nowMs, tz)}. Cancel any time from Billing.`,
    };
  }
  return { row, tenantStatus, switched, bell };
}

/**
 * "Sep 21": the day an instant falls on by the workspace's calendar (`tz`; one Intl cannot use reads as UTC), or "" for
 * none. A trial's end, a renewal and an invoice are instants: said by the browser's or the server's own clock, an end
 * at 03:00 UTC was the next day's date to an owner in New York the evening before.
 */
export function billingDayWords(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  return Number.isNaN(ms)
    ? ""
    : dateFormat("en-US", { timeZone: usableZone(tz), month: "short", day: "numeric" }).format(ms);
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

export function trialWords(trialEnd: string | null | undefined, nowMs: number, tz: string): string {
  if (!trialEnd) return "";
  const end = Date.parse(trialEnd);
  if (Number.isNaN(end)) return "";
  const days = Math.ceil((end - nowMs) / DAY_MS);
  if (days <= 0) return "Trial ends today";
  return `${days} day${days === 1 ? "" : "s"} left on the trial, until ${billingDayWords(trialEnd, tz)}`;
}

/** "$49.00 a month" from Stripe's own figures; "" when the price is not readable. */
export function priceWords(billingPrice: BillingPriceDto | null | undefined): string {
  if (!billingPrice || billingPrice.unit_amount === null) return "";
  const amount = numberFormat("en-US", { style: "currency", currency: billingPrice.currency.toUpperCase() }).format(
    billingPrice.unit_amount / 100,
  );
  const per =
    billingPrice.interval === "year"
      ? "a year"
      : billingPrice.interval === "week"
        ? "a week"
        : billingPrice.interval === "day"
          ? "a day"
          : "a month";
  return `${amount} ${per}`;
}

/**
 * Said wherever a card is while Stripe runs on its test keys (the wiring audit's S9). Production ran them while Billing
 * said "Card on file" and Setup "The card on file is charged when the trial ends", and nothing said that a real card is
 * refused and no money moves. Setup lists it as a detail; the pane ends it with a full stop.
 */
export const BILLING_TEST_MODE_CLAUSE =
  "Billing is in test mode, so only Stripe's test cards work and no real money moves";

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
  actions: { checkout: boolean; portal: boolean; resume: boolean; startNow: boolean };
  paused: boolean;
  /** For a workspace that pays by card on Stripe's test keys, the sentence saying so; null when live or not said. */
  testMode: string | null;
}

/**
 * What the trial includes (decision 0090, Ruben, 3 Nov 2026): everything the plan does, up to these. Past the minutes or
 * the replies the trial ends early and the plan starts (the edge's trial sweep, trialSpentOf); past the leads the finder
 * says so (lead_cap 'trial_leads' in SQL, LEAD_TRIAL_ALLOWANCE). Each is a cost on Chanlytics' account, and these are
 * what one trial may cost it.
 */
export const TRIAL_INCLUDES = { callMinutes: 150, replies: 1000, leads: LEAD_TRIAL_ALLOWANCE } as const;

/** What a free trial covers, said beside it, as Billing and Go live say it. */
export const TRIAL_COVERS = `Your trial includes everything: your number, texting and every channel, up to ${TRIAL_INCLUDES.callMinutes} call minutes, ${numberFormat("en-US", {}).format(TRIAL_INCLUDES.replies)} replies and ${TRIAL_INCLUDES.leads} leads.`;

/**
 * Whether a trial has used what it includes, and how much of it, from what the workspace has used since it began:
 * `near` at four fifths of either, `spent` at all of either. The edge's trial sweep starts the plan when spent, and
 * Today and Billing say near.
 */
export function trialSpentOf(used: { callSeconds: number; replies: number }): {
  share: number;
  near: boolean;
  spent: boolean;
} {
  const share = Math.max(
    used.callSeconds / (TRIAL_INCLUDES.callMinutes * 60),
    used.replies / TRIAL_INCLUDES.replies,
    0,
  );
  return { share, near: share >= 0.8, spent: share >= 1 };
}

/** What the trial's use says, on Billing and Today, once it is near: "62 of 150 call minutes · 310 of 1,000 replies". */
export function trialUseWords(used: { callSeconds: number; replies: number }): string {
  const n = numberFormat("en-US", {});
  return `${n.format(Math.floor(used.callSeconds / 60))} of ${TRIAL_INCLUDES.callMinutes} call minutes · ${n.format(used.replies)} of ${n.format(TRIAL_INCLUDES.replies)} replies`;
}

/** Said on the bell when the trial's use nears what it includes, and when it ends the trial early. */
export const TRIAL_SPENT_WORDS = {
  nearTitle: "Your trial is nearly used",
  near: (use: string) =>
    `${use}. When either runs out your plan starts on the card you gave, so your receptionist keeps answering.`,
  title: "Your trial's use is spent, so your plan has started",
  detail: (use: string) =>
    `${use}. Your plan started today on the card you gave and keeps your receptionist answering.`,
  /** The plan could not start (a card Stripe refused): the trial runs on, and Billing has the card. */
  failedTitle: "Your trial is used up, and your plan could not start",
  failed: "Update the card in Billing so your receptionist keeps answering when the trial ends.",
} as const;

/** Billing's "Start my plan now": a trial ended early, for more than it includes. */
export const START_PLAN_WORDS = {
  button: "Start my plan now",
  busy: "Starting…",
  question: "Start your plan today?",
  detail: (plan: string, card: string | null) =>
    `Your free trial ends now, and ${plan || "the plan"} is charged to ${card || "your card on file"} today. Your plan's full minutes, replies and leads open straight after.`,
  yes: "Yes, start it",
  no: "Not now",
  started: "Your plan has started.",
  /** Stripe took the trial's end but not the charge. */
  unpaid: "Your plan started, but the charge did not go through. Update the card in Billing.",
} as const;

export function toBillingVM(dto: BillingDto, nowMs: number, tz: string): BillingVM {
  const account = dto.account;
  const plan = priceWords(dto.price)
    ? `${dto.price?.product_name ? `${dto.price.product_name} · ` : ""}${priceWords(dto.price)}`
    : "";
  const card =
    account?.card_brand && account.card_last4
      ? `${account.card_brand.charAt(0).toUpperCase()}${account.card_brand.slice(1)} ending ${account.card_last4}`
      : null;
  if (!account || account.mode === "direct") {
    return {
      mode: "direct",
      status: account?.status ?? "active",
      headline: "Direct arrangement",
      detail: "This workspace runs on an arrangement made with Chanlytics; nothing on this screen charges anything.",
      tone: "",
      plan,
      card: null,
      actions: { checkout: false, portal: false, resume: false, startNow: false },
      paused: false,
      testMode: null,
    };
  }
  const status = account.status;
  // On test keys, said in every state: each of them talks about a card or a charge.
  const base = {
    mode: "stripe" as const,
    status: status,
    plan,
    card,
    testMode: dto.livemode === false ? `${BILLING_TEST_MODE_CLAUSE}.` : null,
  };
  switch (status) {
    case "none":
      return {
        ...base,
        headline: "No subscription yet",
        detail: dto.ready ? trialOffer(dto.trial_days) : "Billing is not available on this deployment yet.",
        tone: "warn",
        actions: { checkout: dto.ready, portal: false, resume: false, startNow: false },
        paused: false,
      };
    case "trialing":
      // Cancelled during the trial: Stripe keeps the subscription trialing and sets cancel_at to the trial's end.
      if (account.cancel_at || account.cancel_at_period_end) {
        return {
          ...base,
          headline: "On trial, ending",
          detail: `Cancelled: the receptionist answers until ${billingDayWords(account.cancel_at ?? account.trial_end, tz) || "the trial ends"}, then stops, and nothing is charged. Undo it from Manage billing before then to keep it.`,
          tone: "warn",
          actions: { checkout: false, portal: true, resume: false, startNow: false },
          paused: false,
        };
      }
      return {
        ...base,
        headline: "On trial",
        detail: `${trialWords(account.trial_end, nowMs, tz)}${card ? `, then ${plan || "the plan"} on ${card}` : ""}. ${TRIAL_COVERS}`,
        tone: "ok",
        // Its plan may start now, for more than the trial includes (TRIAL_INCLUDES).
        actions: { checkout: false, portal: true, resume: false, startNow: true },
        paused: false,
      };
    case "active":
      return {
        ...base,
        headline: account.cancel_at_period_end || account.cancel_at ? "Subscribed, ending" : "Subscribed",
        detail:
          account.cancel_at || account.cancel_at_period_end
            ? `Ends ${billingDayWords(account.cancel_at ?? account.current_period_end, tz)}; the receptionist answers until then.`
            : `Next invoice ${billingDayWords(account.current_period_end, tz) || "on the renewal date"}${card ? ` on ${card}` : ""}.`,
        tone: "ok",
        actions: { checkout: false, portal: true, resume: false, startNow: false },
        paused: false,
      };
    case "past_due":
      return {
        ...base,
        headline: "Payment failed",
        detail: `${account.last_payment_failed_at ? `The last charge failed ${agoWords(Date.parse(account.last_payment_failed_at), nowMs)}. ` : ""}Stripe retries for a few days; update the card in Manage billing to keep the receptionist answering.`,
        tone: "danger",
        actions: { checkout: false, portal: true, resume: false, startNow: false },
        paused: false,
      };
    case "incomplete":
      return {
        ...base,
        headline: "Finishing checkout",
        detail: "The first payment is still being confirmed. This page updates by itself.",
        tone: "warn",
        actions: { checkout: false, portal: true, resume: false, startNow: false },
        paused: false,
      };
    case "paused":
      return {
        ...base,
        headline: "Paused",
        detail:
          "The trial ended without a card on file. Add one in Manage billing, then resume; messages keep landing in the Inbox meanwhile.",
        tone: "danger",
        actions: { checkout: false, portal: true, resume: true, startNow: false },
        paused: true,
      };
    case "unpaid":
      return {
        ...base,
        headline: "Paused",
        detail: "Payment could not be collected after several tries. Update the card in Manage billing, then resume.",
        tone: "danger",
        actions: { checkout: false, portal: true, resume: true, startNow: false },
        paused: true,
      };
    case "canceled":
    case "incomplete_expired":
    default:
      return {
        ...base,
        headline: "Subscription ended",
        detail: dto.ready ? trialOffer(dto.trial_days, true) : "Billing is not available on this deployment yet.",
        tone: "danger",
        actions: { checkout: dto.ready, portal: !!account.card_brand, resume: false, startNow: false },
        paused: true,
      };
  }
}

/**
 * What a billing state means for the receptionist, for the pill beside the headline. The pill printed Stripe's own
 * word for the state ("trialing", "past due") next to a headline that already said it in ours (the wiring audit's
 * S20). What the headline does not say is whether the receptionist is answering, and that is receptionistOn's.
 */
export function billingPill(vm: Pick<BillingVM, "status">): { words: string; tone: "ok" | "danger" } {
  return receptionistOn(vm.status)
    ? { words: "Receptionist answering", tone: "ok" }
    : { words: "Receptionist paused", tone: "danger" };
}
