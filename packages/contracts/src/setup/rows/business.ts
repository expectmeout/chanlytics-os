/** Rows: business. */

import { agoWords } from "../../shared/time";
import { plural } from "../../shared/words";
import {
  billingDayWords,
  trialWords,
  TRIAL_COVERS,
  BILLING_TEST_MODE_CLAUSE,
  PAUSED_WORDS,
} from "../../workspace/billing/plans";
import { billingDoorOpen } from "../../workspace/billing/dtos";
import { capabilityStatus } from "../capabilities";
import { activationWords, type SetupInputs } from "../setup";
import { BROKEN_CONFIG_WORDS, type SetupRowContext, type SetupRowDraft } from "../lines";
import { SEQUENCES_ROUTE } from "../../campaigns/sequences/address";

/**
 * 0. Billing — first, for a workspace that pays by card: the door before
 * the desk. A direct arrangement has no row; a closed door draws nothing.
 */
export function billingRow(setupInputs: SetupInputs, ctx: SetupRowContext): SetupRowDraft | null {
  if (!billingDoorOpen(setupInputs.billing)) return null;
  const { nowMs } = ctx;
  const billing = setupInputs.billing;
  // On Stripe's test keys, said before anything the row says about a card or a charge (the wiring audit's S9).
  const testMode = billing.livemode === false ? [BILLING_TEST_MODE_CLAUSE] : [];
  if (billing.status === "trialing" && (billing.cancel_at || billing.cancel_at_period_end)) {
    return {
      id: "billing",
      icon: "money",
      title: "Billing",
      state: "ready",
      required: true,
      sentence: `On trial, cancelled: the receptionist answers until ${billingDayWords(billing.cancel_at ?? billing.trial_end, setupInputs.tz) || "the trial ends"}, then stops.`,
      details: [...testMode, "Nothing is charged; undo the cancellation from Billing before then to keep it"],
      verb: { label: "Open Billing", to: "admin/billing" },
    };
  }
  if (billing.status === "trialing") {
    return {
      id: "billing",
      icon: "money",
      title: "Billing",
      state: "ready",
      required: true,
      sentence: `On trial: ${trialWords(billing.trial_end, nowMs, setupInputs.tz) || "the card is on file"}.`,
      details: [
        ...testMode,
        "The card on file is charged when the trial ends; cancel from Billing before then if you'd rather not",
        // What the trial does not cover (maySpend), said where the trial is, as Billing says it.
        TRIAL_COVERS,
      ],
      verb: { label: "Open Billing", to: "admin/billing" },
    };
  }
  if (billing.status === "active" || billing.status === "incomplete") {
    return {
      id: "billing",
      icon: "money",
      title: "Billing",
      state: "ready",
      required: true,
      sentence:
        billing.status === "active"
          ? `Subscribed · next invoice ${billingDayWords(billing.current_period_end, setupInputs.tz) || "on the renewal date"}.`
          : "Finishing checkout — this page updates by itself.",
      details: [...testMode],
      verb: { label: "Open Billing", to: "admin/billing" },
    };
  }
  if (billing.status === "past_due") {
    return {
      id: "billing",
      icon: "money",
      title: "Billing",
      state: "waiting_you",
      required: true,
      sentence: "The last payment failed. Update the card to keep the receptionist answering.",
      details: [...testMode, "Stripe retries for a few days, then pauses the subscription"],
      verb: { label: "Update the card", to: "verb:billing-portal" },
    };
  }
  if (billing.status === "paused" || billing.status === "unpaid") {
    return {
      id: "billing",
      icon: "money",
      title: "Billing",
      state: "waiting_you",
      required: true,
      sentence: `Your receptionist is paused. ${PAUSED_WORDS}`,
      details: [
        ...testMode,
        billing.status === "paused" ? "The trial ended without a card on file" : "Payment could not be collected",
      ],
      verb: { label: "Resume in Billing", to: "admin/billing" },
    };
  }
  return {
    id: "billing",
    icon: "money",
    title: "Billing",
    state: "not_started",
    required: true,
    sentence:
      billing.trial_days > 0
        ? `Start the ${billing.trial_days}-day trial with a card — nothing is charged until it ends.`
        : "Subscribe with a card — the first charge is today.",
    details: [
      ...testMode,
      ...(billing.trial_days > 0
        ? ["Cancel any time from Billing", "The receptionist answers through the trial"]
        : ["Cancel any time from Billing"]),
    ],
    verb: { label: billing.trial_days > 0 ? "Start the trial" : "Subscribe", to: "verb:billing-checkout" },
  };
}

/**
 * The address that opens one of the business's rows, open, on the Settings page that holds it now: Settings reads
 * `admin/workspace/<row>` as the page the row moved to (Hours & booking, How it answers; its tabs.ts paneOfRow), as
 * the calendar's door does (CALENDAR_SETTING_ROUTE). The rows split across three pages on 17 Oct 2026, and a door to
 * `admin/workspace` alone opened Details, where the hand-off number and the hours no longer are.
 */
const settingsRow = (row: "name" | "hours" | "services" | "handoff_number"): string => `admin/workspace/${row}`;

/** The first of the facts the receptionist answers with that is missing, as its row: the name, the hours, the services. */
const firstMissingFact = (b: SetupInputs["business"]): "name" | "hours" | "services" =>
  !b.name ? "name" : !b.hours ? "hours" : "services";

/**
 * 1. Business facts — what the receptionist answers with.
 */
export function factsRow(setupInputs: SetupInputs, ctx: SetupRowContext): SetupRowDraft {
  const { nowMs } = ctx;
  const business = setupInputs.business;
  const missing = [
    !business.name ? "a name" : "",
    !business.hours ? "hours" : "",
    business.services === 0 ? "services" : "",
  ].filter(Boolean);
  const serious = (setupInputs.conflicts ?? []).find((k) => k.severity === "serious") ?? null;
  if (business.broken) {
    // Only Chanlytics can repair it, so the owner's move is the ask (S8); once asked, it waits on us and says when.
    return setupInputs.requests.repair
      ? {
          id: "facts",
          icon: "home",
          title: "Business facts",
          state: "waiting_them",
          required: true,
          sentence: `${BROKEN_CONFIG_WORDS.clause} ${BROKEN_CONFIG_WORDS.requested(setupInputs.requests.repair, nowMs)}`,
          details: [],
          verb: { label: "Open Business", to: "admin/workspace" },
        }
      : {
          id: "facts",
          icon: "home",
          title: "Business facts",
          state: "waiting_you",
          required: true,
          sentence: BROKEN_CONFIG_WORDS.clause,
          details: [],
          verb: { label: BROKEN_CONFIG_WORDS.ask, to: "verb:request-repair" },
        };
  }
  if (serious) {
    // Filled in, and wrong in a way a customer feels. The sentence is the
    // resolver's, because it is the one that knows WHY the two disagree.
    return {
      id: "facts",
      icon: "home",
      title: "Business facts",
      state: "waiting_you",
      required: true,
      sentence: serious.sentence,
      details: [`${business.name} · hours set · ${plural(business.services, "service")} on record`],
      verb: { label: "Fix it in Business", to: serious.to },
    };
  }
  if (missing.length === 0) {
    return {
      id: "facts",
      icon: "home",
      title: "Business facts",
      state: "ready",
      required: true,
      sentence: `${business.name} · hours set · ${plural(business.services, "service")} on record`,
      details: [
        business.bookingLink
          ? "Booking link on record"
          : "No booking link — the receptionist answers, but cannot send one",
        business.address ? "Address on record" : "No address yet",
      ],
      verb: { label: "Edit in Business", to: "admin/workspace" },
    };
  }
  const none = missing.length === 3;
  return {
    id: "facts",
    icon: "home",
    title: "Business facts",
    state: none ? "not_started" : "waiting_you",
    required: true,
    sentence: none
      ? "Name, hours and services are what the receptionist answers with."
      : `Still missing: ${missing.join(" and ")}.`,
    details: [],
    verb: { label: none ? "Start in Business" : "Finish in Business", to: settingsRow(firstMissingFact(business)) },
  };
}

/**
 * 2. A person to hand off to — the warm transfer the voice shell already makes.
 */
export function handoffRow(_i: SetupInputs, ctx: SetupRowContext): SetupRowDraft {
  const { handoffNum } = ctx;
  return handoffNum
    ? {
        id: "handoff",
        icon: "phone",
        title: "A person to hand off to",
        state: "ready",
        required: false,
        sentence: `Callers who insist on a person are transferred to ${handoffNum}.`,
        details: [],
        verb: { label: "Change it", to: settingsRow("handoff_number") },
      }
    : {
        id: "handoff",
        icon: "phone",
        title: "A person to hand off to",
        state: "waiting_you",
        required: false,
        sentence: "Give the receptionist a number to hand callers to when they insist on a person.",
        details: [],
        verb: { label: "Add a number", to: settingsRow("handoff_number") },
      };
}

/**
 * 5. WhatsApp — the number customers write to, and the messages Meta approved.
 */
export function whatsappRow(setupInputs: SetupInputs, ctx: SetupRowContext): SetupRowDraft {
  const { wa, waReady, waNum, answering, nowMs } = ctx;
  if (waReady) {
    const templates = setupInputs.templates;
    const metaWaits = templates.approved === 0 && templates.pending > 0;
    const cap = capabilityStatus("whatsapp", setupInputs, nowMs);
    const details = [
      wa.quality ? `Quality ${wa.quality.toLowerCase()}` : "",
      templates.approved
        ? `${plural(templates.approved, "approved message")}`
        : templates.pending
          ? `${plural(templates.pending, "message")} with Meta for approval`
          : "No approved messages yet",
      templates.startersApproved < 5 ? "Add the starter messages: the reminder, how did it go, the win-back" : "",
      wa.lastInboundAt ? `Last message ${agoWords(Date.parse(wa.lastInboundAt), nowMs)}` : "",
    ].filter(Boolean);
    if (!metaWaits) details.push(activationWords(cap, nowMs));
    return {
      id: "whatsapp",
      icon: "chat",
      title: "WhatsApp",
      state: metaWaits ? "waiting_them" : "ready",
      stateWords: metaWaits ? "Waiting on Meta" : undefined,
      required: !answering,
      sentence: metaWaits
        ? `Connected on ${waNum} — your first messages are with Meta for approval.`
        : `Connected on ${waNum}.`,
      details,
      verb:
        cap.tested && !cap.live && !metaWaits
          ? { label: "Activate", to: "verb:activate:whatsapp" }
          : templates.startersApproved < 5 && !metaWaits
            ? { label: "Add the starters", to: SEQUENCES_ROUTE }
            : { label: "Open the Inbox", to: "inbox" },
      undo: cap.live && !metaWaits ? { label: "Withdraw activation", to: "verb:deactivate:whatsapp" } : null,
    };
  }
  if (wa.present) {
    return {
      id: "whatsapp",
      icon: "chat",
      title: "WhatsApp",
      state: "waiting_you",
      required: !answering,
      sentence: `${waNum ?? "Your number"} is connected but switched off.`,
      details: [],
      verb: { label: "Open Connections", to: "admin/integrations" },
    };
  }
  return {
    id: "whatsapp",
    icon: "chat",
    title: "WhatsApp",
    state: "waiting_you",
    required: !answering,
    sentence: "Connect the WhatsApp number customers write to.",
    details: ["A new number, or the WhatsApp Business app you already use"],
    verb: { label: "Connect", to: "admin/integrations" },
  };
}
