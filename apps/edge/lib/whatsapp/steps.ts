/**
 * The named steps of the WhatsApp handler: decisions with no side effects,
 * so each one is a truth table a test can run. inbound.ts orchestrates them;
 * nothing here reads the database, the store or the clock unless it is
 * handed one.
 */
import { replyDelayMs, violatesNoPrices, policyAskClass } from "../workspace/contracts.js";
import type { BrainConfig, BrainMeta, PolicyLimits } from "../workspace/contracts.js";

export const PAUSE_MS = 24 * 3600 * 1000;   // human echo pauses the bot for 24h
export const MAX_REPLIES_PER_DAY = 20;      // per thread
export const STALE_MS = 10 * 60 * 1000;          // "late" — worth noting in the log
export const STALE_REPLY_MS = 2 * 60 * 60 * 1000; // past this a person answers, not the bot

/**
 * How late a message is, and what that means. Inside the reply horizon the
 * customer is still in the conversation they started, and answering late
 * beats not answering; beyond it an automated reply would arrive out of
 * nowhere, so a person picks it up. Meta redelivers for days, so an outage
 * longer than the horizon must never turn its backlog into silence.
 */
export function ageVerdict(timestampS: string | number | undefined, now = Date.now()): { ageMs: number; verdict: "fresh" | "late" | "stale" } {
  const ageMs = timestampS ? now - Number(timestampS) * 1000 : 0;
  return { ageMs, verdict: ageMs > STALE_REPLY_MS ? "stale" : ageMs > STALE_MS ? "late" : "fresh" };
}

/** Whether the thread may be answered now: a human has it, or the day's replies are spent. */
export function threadVerdict(
  thread: { pausedUntil: number; replies: number[] },
  maxRepliesDay: number,
  now = Date.now(),
): "paused" | "ratecap" | "ok" {
  if (now < thread.pausedUntil) return "paused";
  if (thread.replies.length >= maxRepliesDay) return "ratecap";
  return "ok";
}

/**
 * How long the reply waits before it goes out, and why.
 *
 * Under 'veto' every reply waits in the configured window so the business
 * can redirect the receptionist before the customer reads it. Under 'auto'
 * a reply the model itself is not sure enough about waits in the same
 * window (the confidence dial: limits.min_confidence, 0 or absent is off);
 * sure enough sends itself.
 */
export function holdPlan(
  replyMode: string,
  replyLimits: PolicyLimits,
  brainMeta: BrainMeta | undefined,
): { delayMs: number; heldForConfidence: boolean; source: "veto_window" | "low_confidence"; minConfidence: number } {
  let delayMs = replyDelayMs(replyMode, replyLimits);
  const minConfidence = typeof replyLimits?.min_confidence === "number" ? replyLimits.min_confidence : 0;
  const heldForConfidence =
    replyMode === "auto" && minConfidence > 0 && typeof brainMeta?.confidence === "number" && brainMeta.confidence < minConfidence;
  if (heldForConfidence) delayMs = replyDelayMs("veto", replyLimits);
  return { delayMs, heldForConfidence, source: heldForConfidence ? "low_confidence" : "veto_window", minConfidence };
}

export interface LayerTwoIn {
  replyText: string;
  escalate: boolean;
  escalationReason: string;
  brainCfg: BrainConfig;
  policy: Record<string, { mode: string }> | null | undefined;
  intent: string | null;
}

export interface LayerTwoOut {
  replyText: string;
  escalate: boolean;
  escalationReason: string;
  /** A price in the draft blocked the send outright. */
  priceBlocked: boolean;
  /** The class under "ask" this reply fell into, if any. */
  askClass: "booking" | "faq" | null;
  /** Whether the model had already done what the prompt asked (null when no class applied). */
  complied: boolean | null;
}

/**
 * Layer-2 policy enforcement (Blueprint §6): prompt text is never the only
 * defense. A price in the draft blocks the send outright. Under "ask", a
 * booking or a service/pricing question is a person's to answer: a reply
 * that still carries the booking link, or still answers, is replaced with
 * the handoff line; one that complied keeps its words. Either way the
 * thread is a person's now, and the Inbox says why.
 */
export function layerTwo(x: LayerTwoIn): LayerTwoOut {
  let { replyText, escalate, escalationReason } = x;
  let priceBlocked = false;
  if (violatesNoPrices(replyText)) {
    priceBlocked = true;
    replyText = `Great question! Pricing is quoted at your consult — a member of our team will follow up here shortly. For anything urgent, call ${x.brainCfg.phone_display}.`;
    escalate = true;
    escalationReason = "policy_block";
  }
  const askClass = policyAskClass(x.policy, x.intent);
  let complied: boolean | null = null;
  if (askClass) {
    const carriesLink = !!x.brainCfg.booking_link && replyText.includes(x.brainCfg.booking_link);
    complied = askClass === "booking" ? !carriesLink : escalate;
    if (askClass === "booking" && carriesLink) {
      replyText = `A member of our team will confirm your booking with you shortly. For anything urgent, call ${x.brainCfg.phone_display}.`;
    } else if (askClass === "faq" && !escalate) {
      replyText = `A member of our team will get back to you with the details shortly. For anything urgent, call ${x.brainCfg.phone_display}.`;
    }
    escalate = true;
    escalationReason = "policy_ask";
  }
  return { replyText, escalate, escalationReason, priceBlocked, askClass, complied };
}

/**
 * What a held thread says, and to whom. A hold the owner chose for THIS
 * person is its own reason — the Inbox should say "you handle this person",
 * not "held by policy". A saved-but-unparseable config is a MISTAKE, not an
 * absence, and the sentence sends the operator to the right place.
 */
export function holdCopy(x: {
  brainCfg: BrainConfig | null;
  personMode: string | null;
  replyMode: string;
  configBroken: boolean;
}): { personHold: boolean; reason: "person_hold" | "policy_block"; details: string; botText: string; why: string } {
  const personHold = !!x.brainCfg && !!x.personMode;
  const details = x.brainCfg
    ? personHold
      ? `You set the receptionist to '${x.replyMode}' for this person — it stays out of the thread; answer them yourself.`
      : `Reply mode is '${x.replyMode}' — the receptionist holds everything for a human.`
    : x.configBroken
      ? "This workspace's settings could not be read, so the receptionist stayed silent. The saved configuration has an invalid field."
      : "No brain profile configured — the receptionist stays silent until Settings fills one in.";
  const botText = personHold ? "(held — you handle this person yourself)" : "(held — no auto-reply for this workspace)";
  const why = x.brainCfg
    ? personHold ? `this person is set to ${x.replyMode}` : `reply mode ${x.replyMode}`
    : x.configBroken ? "settings could not be read" : "no persona configured";
  return { personHold, reason: personHold ? "person_hold" : "policy_block", details, botText, why };
}
