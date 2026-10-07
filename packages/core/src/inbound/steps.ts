/**
 * The named steps of the receptionist: decisions with no side effects, so
 * each one is a truth table a test can run. The phases beside answer.ts
 * call them, in its order;
 * nothing here reads the database, the store or the clock unless it is
 * handed one.
 */
import {
  replyDelayMs,
  violatesNoPrices,
  namesMoney,
  heldLine,
  policyAskClass,
  resolveFacts,
} from "@chanlytics/contracts";
import type { BrainConfig, BrainMeta, KnownFacts, PolicyLimits } from "@chanlytics/contracts";

export const MAX_REPLIES_PER_DAY = 20; // per thread
export const STALE_MS = 10 * 60 * 1000; // "late" — worth noting in the log
export const STALE_REPLY_MS = 2 * 60 * 60 * 1000; // past this a person answers, not the bot

/**
 * How late a message is, and what that means. Inside the reply horizon the
 * customer is still in the conversation they started, and answering late
 * beats not answering; beyond it an automated reply would arrive out of
 * nowhere, so a person picks it up. Meta redelivers for days, so an outage
 * longer than the horizon must never turn its backlog into silence.
 */
export function ageVerdict(
  timestampS: string | number | undefined,
  now = Date.now(),
): { ageMs: number; verdict: "fresh" | "late" | "stale" } {
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
 * sure enough sends itself. A reply with no confidence on record sends too:
 * the dial compares a number, and none is not a low one -- the pane says so
 * beside the dial.
 */
export function holdPlan(
  replyMode: string,
  replyLimits: PolicyLimits,
  brainMeta: BrainMeta | undefined,
): { delayMs: number; heldForConfidence: boolean; source: "veto_window" | "low_confidence"; minConfidence: number } {
  let delayMs = replyDelayMs(replyMode, replyLimits);
  const minConfidence = typeof replyLimits?.min_confidence === "number" ? replyLimits.min_confidence : 0;
  const heldForConfidence =
    replyMode === "auto" &&
    minConfidence > 0 &&
    typeof brainMeta?.confidence === "number" &&
    brainMeta.confidence < minConfidence;
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
  /** The language the model answered in (its record's), so a replaced reply is said in it. */
  language?: string | null;
  /** What the platform knows independently of what was typed; the number to call resolves over both. */
  known?: KnownFacts | null;
}

export interface LayerTwoOut {
  replyText: string;
  escalate: boolean;
  escalationReason: string;
  /** A price in the draft blocked the send outright. */
  priceBlocked: boolean;
  /** Money in the draft or in the model's intent: a person answers (the charter). */
  moneyHeld: boolean;
  /** The class under "ask" (or money's "never") this reply fell into, if any. */
  askClass: "booking" | "faq" | "money" | null;
  /** Whether the model had already done what the prompt asked (null when no class applied). */
  complied: boolean | null;
}

/**
 * The number that tells a customer who cannot wait what to do, or null.
 *
 * The number is the one the facts resolve to (resolveFacts): what the owner
 * typed, else the line the receptionist answers, formatted for a person. A
 * workspace with neither gets no sentence at all -- the reply ends where it
 * ends, the way fallbackMessages leaves out a sentence naming a detail the
 * workspace does not have -- because "call undefined." is what a customer was
 * sent when phone_display was read raw.
 */
function urgentPhone(x: Pick<LayerTwoIn, "brainCfg" | "known">): string | null {
  return resolveFacts(x.brainCfg, x.known).phone_display.value ?? null;
}

/**
 * Layer-2 policy enforcement (Blueprint §6): prompt text is never the only
 * defense. A price in the draft blocks the send outright. Money -- a refund, a
 * discount, a deposit, a payment term, named in the draft or read as the
 * model's intent -- is a person's, whatever the model's record says (the
 * charter's locked row). Under "ask", a booking or a service/pricing question
 * is a person's to answer: a reply that still carries the booking link, or
 * still answers, is replaced with the handoff line; one that complied keeps
 * its words. Every replacement is said in the answer's language
 * (contracts heldLine). Either way the thread is a person's now, and the Inbox
 * says why.
 */
export function layerTwo(x: LayerTwoIn): LayerTwoOut {
  let { replyText, escalate, escalationReason } = x;
  const phone = urgentPhone(x);
  let priceBlocked = false;
  const moneyHeld = x.intent === "money" || namesMoney(replyText);
  if (violatesNoPrices(replyText)) {
    priceBlocked = true;
    replyText = heldLine("price", x.language, phone);
    escalate = true;
    escalationReason = "policy_block";
  }
  const askClass = moneyHeld ? "money" : policyAskClass(x.policy, x.intent);
  let complied: boolean | null = null;
  if (askClass) {
    const carriesLink = !!x.brainCfg.booking_link && replyText.includes(x.brainCfg.booking_link);
    complied = askClass === "booking" ? !carriesLink : escalate;
    if (askClass === "money" && !priceBlocked) {
      // Words about money are never kept, even ones that only promise a person: the line says the same, and nothing
      // the model wrote about a refund or a term reaches the customer.
      replyText = heldLine("money", x.language, phone);
    } else if (askClass === "booking" && carriesLink) {
      replyText = heldLine("booking", x.language, phone);
    } else if (askClass === "faq" && !escalate) {
      replyText = heldLine("faq", x.language, phone);
    }
    escalate = true;
    escalationReason = "policy_ask";
  }
  return { replyText, escalate, escalationReason, priceBlocked, moneyHeld, askClass, complied };
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
  /**
   * The control plane could not be READ (tenant-runtime's failed read). A third
   * state, because it is neither of the other two: a workspace with a perfectly
   * good persona was being told it had none and sent to Settings to fix a
   * database outage.
   */
  loadFailed?: boolean;
}): { personHold: boolean; reason: "person_hold" | "policy_block"; details: string; botText: string; why: string } {
  const personHold = !!x.brainCfg && !!x.personMode;
  const details = x.brainCfg
    ? personHold
      ? `You set the receptionist to '${x.replyMode}' for this person — it stays out of the thread; answer them yourself.`
      : `Reply mode is '${x.replyMode}' — the receptionist holds everything for a human.`
    : x.configBroken
      ? "This workspace's settings could not be read, so the receptionist stayed silent. The saved configuration has an invalid field."
      : x.loadFailed
        ? "This workspace's settings could not be reached just now, so the receptionist stayed silent rather than answer in a voice that might not be yours. Nothing is wrong with your configuration and nothing needs changing; the next message tries again."
        : "No brain profile configured — the receptionist stays silent until Settings fills one in.";
  const botText = personHold ? "(held — you handle this person yourself)" : "(held — no auto-reply for this workspace)";
  const why = x.brainCfg
    ? personHold
      ? `this person is set to ${x.replyMode}`
      : `reply mode ${x.replyMode}`
    : x.configBroken
      ? "settings could not be read"
      : x.loadFailed
        ? "the workspace's settings could not be reached"
        : "no persona configured";
  return { personHold, reason: personHold ? "person_hold" : "policy_block", details, botText, why };
}

/**
 * What the receptionist does when it has no model to think with (PRD AI-04).
 * A canned greeting passed off as an answer would be the quiet failure: the
 * workspace's own greeting still goes, labelled a fallback so nobody counts
 * it as an answer, the thread is handed to a person, and the platform is
 * paged once per window, because the condition is the platform's, not this
 * workspace's. The escalation reason is brain_error, the closed set's word
 * for "the receptionist could not answer and a holding message went out".
 */
export const NO_MODEL_PAGE = {
  key: "brain_unavailable",
  subject: "The receptionist has no model key",
  body: "ANTHROPIC_API_KEY is not set on the edge. Every reply is the workspace's generic greeting, labelled a fallback, and every thread is handed to a person until the key is back.",
} as const;

export function noModelPlan(fallbacks: { greeting: string }): {
  replyText: string;
  meta: { ack: true; fallback: "no_model" };
  escalate: true;
  escalationReason: "brain_error";
  escalationDetails: (customerText: string) => string;
  alertReason: "no model";
} {
  return {
    replyText: fallbacks.greeting,
    meta: { ack: true, fallback: "no_model" },
    escalate: true,
    escalationReason: "brain_error",
    escalationDetails: (customerText) => `the receptionist has no model key — "${customerText}"`,
    alertReason: "no model",
  };
}
