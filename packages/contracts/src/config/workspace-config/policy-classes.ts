/**
 * The Autonomy tab's classes and modes (E3): what each class is called, which modes it honours, what the Booking
 * and FAQ rows write into a prompt, and the limits a row stores. The reply window and the caps the edge applies
 * are ../policy.ts.
 */
import type { SchemaSet } from "../../shared/schema-sets";
import type { SystemOneQuestion } from "../../ai/system-one";
import { PLAYBOOK_VETO_DELAY_WORDS } from "../../playbooks/playbook-triggers";
import { z } from "zod";

/* --------------------------------------------------------------- E3 policy */

export const POLICY_CLASSES = [
  "reply",
  "booking",
  "faq",
  "reengage",
  "campaign",
  "reviews",
  "money",
  "follow_up",
  "outreach",
] as const;
export type PolicyClass = (typeof POLICY_CLASSES)[number];

/**
 * The words for each class, said once. The Autonomy matrix rows, a playbook's
 * "runs under" chip and the assistant's proposals all read these; three maps
 * used to name the same row three ways ("Campaigns" on a playbook for the row
 * the matrix called "Standing offers").
 */
export const POLICY_CLASS_WORDS: Record<PolicyClass, { name: string; short: string; note: string }> = {
  reply: { name: "Replies to customers", short: "Replies", note: "every text the receptionist sends" },
  faq: {
    name: "Service & pricing questions",
    short: "Questions",
    note: "auto answers from your business profile · ask hands every service or pricing question to you, on WhatsApp and on the phone",
  },
  booking: {
    name: "Book · reschedule",
    short: "Bookings",
    note: "auto sends your booking link · ask has a person confirm instead, on WhatsApp and on the phone",
  },
  reengage: {
    name: "Re-engage quiet customers",
    short: "Re-engage",
    note: `the win-back and save-our-number playbooks · auto sends each run, veto sends it ${PLAYBOOK_VETO_DELAY_WORDS} later unless you stop it, ask leaves it waiting on Today, never runs nothing`,
  },
  campaign: {
    name: "Standing offers",
    short: "Offers",
    note: `the welcome and month's-offer playbooks · auto sends each run, veto sends it ${PLAYBOOK_VETO_DELAY_WORDS} later unless you stop it, ask leaves it waiting on Today, never runs nothing`,
  },
  reviews: {
    name: "Google reviews",
    short: "Reviews",
    note: "replies under new reviews on Google, through the connected Business Profile · auto answers each within the hour, ask drafts one for you to send, never leaves them all to you",
  },
  money: { name: "Refunds · rates · negotiation", short: "Money", note: "always goes to you" },
  // 0006: one nudge per proposal, with its link, once it has waited past the workspace's pace with nothing back.
  follow_up: {
    name: "Proposal follow-ups",
    short: "Follow-ups",
    note: "the proposal follow-up playbook · one nudge per proposal, with its link, once it has waited with nothing back · auto sends each run, ask leaves it waiting on Today, never runs nothing",
  },
  // Reach out (Part 3): cold email to the businesses a search found. A chain's first run always waits for its owner.
  outreach: {
    name: "Cold email to businesses a search found",
    short: "Reach-outs",
    note: `every email a reach-out sends · its first run always waits for you; later runs send ${PLAYBOOK_VETO_DELAY_WORDS} after they are made unless you stop them · never sends none`,
  },
};

/** The four modes. 'veto' is honoured where there is something to hold: a
 *  reply waits in the hold window as a draft, a playbook run waits thirty
 *  minutes; POLICY_CLASS_MODES says which classes offer it (policyModeOffered).
 *  The runtime treats an unexpected mode as 'ask' (fail safe). */
export const POLICY_MODES = ["auto", "veto", "ask", "never"] as const;
export type PolicyMode = (typeof POLICY_MODES)[number];

/**
 * What each mode DOES, in the owner's words — the matrix's column headings, the
 * name a phone puts over each dot, and the words a policy chip says after the
 * dot.
 *
 * The stored values stay `auto | veto | ask | never`: those are filing words. A
 * salon owner does not say "veto", and the plain sentence for each mode existed
 * only as a hover tip on the column heading — which a phone has no way to
 * trigger and a mouse has no reason to look for. The heading says it instead.
 *
 * `head` is verb-first with the receptionist as its subject, `sub` is the one
 * clause that tells it apart from its neighbour, `chip` is the same fact small
 * enough for a pill, `does` is the whole sentence for a control's title. No
 * heading names a duration: how long a hold lasts belongs to the class (a reply
 * waits the workspace's hold window, a playbook run waits thirty minutes), and a
 * heading that said "30s" would be wrong on four of the six rows.
 */
export const POLICY_MODE_WORDS: Record<PolicyMode, { head: string; sub: string; chip: string; does: string }> = {
  auto: { head: "Sends it", sub: "right away", chip: "sends it", does: "Sends it right away." },
  veto: {
    head: "Holds it",
    sub: "you can stop it",
    chip: "holds it",
    does: "Writes it, holds it, and sends it unless you stop it.",
  },
  ask: {
    head: "Asks you",
    sub: "nothing sent",
    chip: "asks you",
    does: "Waits for you. Nothing is sent until you say so.",
  },
  never: { head: "Stays quiet", sub: "nothing happens", chip: "stays quiet", does: "Stays out of it entirely." },
};

/**
 * The modes each class can honour — a switch nothing enforces is a switch
 * that lies. Replies can wait (veto), wait for a person (ask) or stay silent
 * (never). Booking and service questions are answered by the receptionist
 * or by a person: there is no "never" for a salon that takes bookings, and
 * no draft to hold for review. The playbook classes run, wait, wait for a
 * person, or do not run. Reviews are answered, drafted for a person, or
 * left alone — there is no draft to hold on a countdown. Money is the
 * charter's.
 */
export const POLICY_CLASS_MODES: Record<PolicyClass, readonly PolicyMode[]> = {
  reply: ["auto", "veto", "ask", "never"],
  booking: ["auto", "ask"],
  faq: ["auto", "ask"],
  reengage: ["auto", "veto", "ask", "never"],
  campaign: ["auto", "veto", "ask", "never"],
  reviews: ["auto", "ask", "never"],
  money: ["never"],
  follow_up: ["auto", "ask", "never"],
  // Cold email never goes the moment a run is made: a chain's first run waits for its owner whatever the mode, and a
  // later one gives thirty minutes to be stopped (veto), waits too (ask), or does not run (never).
  outreach: ["veto", "ask", "never"],
};

/**
 * Whether a class may be set to a mode: the one rule the Autonomy pane draws its dots by and the policies route refuses
 * by (POLICY_CLASS_MODES). An unknown class or mode is not offered.
 */
export function policyModeOffered(cls: string, mode: string): boolean {
  return (
    (POLICY_CLASSES as readonly string[]).includes(cls) &&
    (POLICY_CLASS_MODES[cls as PolicyClass] as readonly string[]).includes(mode)
  );
}

/** Why a class cannot be set to a mode, in the words the route says; null where it can. */
export function policyModeRefusal(cls: PolicyClass, mode: PolicyMode): string | null {
  if (policyModeOffered(cls, mode)) return null;
  if (mode === "veto") return `The ${POLICY_CLASS_WORDS[cls].short} row has nothing to hold for review.`;
  if (mode === "never" && (cls === "booking" || cls === "faq"))
    return 'Bookings and service questions are answered by the receptionist or by you — there is no "never".';
  return `The ${cls} row cannot be set to ${mode}.`;
}

/** The class a customer's intent falls under, when the Autonomy pane has a row for it. */
export function policyClassOfIntent(intent: string | null | undefined): "booking" | "faq" | "money" | null {
  if (intent === "booking") return "booking";
  if (intent === "pricing" || intent === "services") return "faq";
  if (intent === "money") return "money";
  return null;
}

/**
 * The class that is set to "ask" and that this intent falls under, or null. An unknown mode counts as ask, fail safe.
 * Money is never the receptionist's, whatever a row says or when none is read: the charter's lock (00102), at runtime.
 */
export function policyAskClass(
  policy: Record<string, { mode: string }> | null | undefined,
  intent: string | null | undefined,
): "booking" | "faq" | "money" | null {
  const cls = policyClassOfIntent(intent);
  if (!cls) return null;
  if (cls === "money") return cls;
  const mode = policy?.[cls]?.mode ?? "auto";
  return mode === "auto" ? null : cls;
}

/**
 * The Autonomy tab's Booking row holds the booking link back: it is not on
 * "auto", so a person confirms instead. An unknown mode counts, fail safe, as it
 * does in policyAskClass.
 *
 * The phone asks it here: apps/edge/api/retell-fn.ts (which outbound-gate.ts
 * refuses as booking_needs_a_person, with or without an approved booking
 * template) and apps/edge/api/retell-availability.ts (which still offers a caller
 * the open times, then a member of the team confirming in place of the link:
 * describeOpenings' `bookingHeld`, the owner's decision of 21 Sep 2026). Chat
 * asks it through policyAskClass, and this must keep agreeing with it:
 * packages/core/src/inbound/steps.ts layerTwo takes the link back out of a chat
 * reply classed as a booking -- a price or services reply still carries it.
 * Stated here so the Business tab reads the rule instead of keeping a copy of it.
 */
export function bookingHeld(policy: Record<string, { mode: string }> | null | undefined): boolean {
  return policyAskClass(policy, "booking") === "booking";
}

/**
 * What each class a customer's message can fall under covers, in the words its prompt line says it (policyRules) and a
 * second model is asked it (policyClassQuestion, in shadow: decision 0023): one text for each rule.
 */
export const POLICY_COVERS = {
  booking: "someone wants to book, reschedule or cancel",
  faq: "Service and pricing questions",
  money: "a refund, a discount, a deposit, a payment plan or any change to what someone pays",
} as const;

/** The label for a message that falls under none of the classes above. */
const POLICY_CLASS_NONE = "none";

/** The class label a receptionist's intent gives, as the shadow's question names classes: the class, or none. */
export function policyClassLabel(intent: string | null | undefined): string {
  return policyClassOfIntent(intent) ?? POLICY_CLASS_NONE;
}

/** Which class a customer's message falls under, put to a second model in shadow: the covered classes and none. */
export function policyClassQuestion(): SystemOneQuestion {
  return {
    type: "choice",
    instructions: "Which of these rules does the customer's message fall under?",
    criteria: {
      booking: POLICY_COVERS.booking,
      faq: POLICY_COVERS.faq,
      money: POLICY_COVERS.money,
      [POLICY_CLASS_NONE]: "none of the above",
    },
  };
}

/**
 * What the Booking, FAQ and Money rows say in the prompt, per channel. "auto"
 * says nothing — the profile already tells the receptionist how to book and
 * what it offers. "ask" hands the matter to a person, in words the customer
 * can hear on the phone and read on WhatsApp. Money is always a person's, so
 * its line is said on every prompt (defect 5), and layer two holds a reply that
 * names money whatever the model's record says (policy.ts namesMoney).
 */
export function policyRules(
  policy: Record<string, { mode: string }> | null | undefined,
  channel: "whatsapp" | "voice",
): string[] {
  const out: string[] = [];
  const modeOf = (cls: string): string => policy?.[cls]?.mode ?? "auto";
  const voice = channel === "voice";
  if (modeOf("booking") !== "auto") {
    out.push(
      voice
        ? `Booking: when ${POLICY_COVERS.booking}, do not offer the booking link. Say a member of the team will call or text them to confirm, and take their name.`
        : `Booking: when ${POLICY_COVERS.booking}, do not send the booking link. Say a member of the team will confirm with them shortly, and set escalate to true.`,
    );
  }
  if (modeOf("faq") !== "auto") {
    out.push(
      voice
        ? `${POLICY_COVERS.faq}: do not answer them yourself. Say a member of the team will call them back with the details, and take their name.`
        : `${POLICY_COVERS.faq}: do not answer them yourself. Say a member of the team will get back to them with the details, and set escalate to true.`,
    );
  }
  // The money row is locked to never (the charter), so its rule is said on every prompt, whatever the rows say.
  out.push(
    voice
      ? `Money: ${POLICY_COVERS.money} is never yours to decide or promise. Do not agree, refuse or quote terms; say a member of the team will call them back about it, and take their name.`
      : `Money: ${POLICY_COVERS.money} is never yours to decide or promise. Do not agree, refuse or quote terms; say a member of the team will get back to them about it, set intent to money and escalate to true.`,
  );
  return out;
}

export const PolicyLimitsSchema = z
  .object({
    max_replies_day: z.number().int().min(1).max(200).optional(),
    pause_hours: z.number().int().min(1).max(168).optional(),
    /**
     * How long the receptionist WAITS before its own reply goes out, in ms.
     *
     * Only meaningful when mode is 'veto'. A text channel is not a phone
     * call — nobody expects an answer in under a second — so the delay costs
     * the customer nothing and buys the business a window to redirect the bot
     * before it speaks, rather than apologising for it afterwards.
     */
    reply_delay_ms: z.number().int().min(5000).max(600000).optional(),
    /**
     * The confidence dial. Under 'auto', a reply the model is less sure about
     * than this waits in the hold window (reply_delay_ms) for a person instead
     * of going straight out — sure enough sends itself, not sure enough waits.
     * 0 or absent means off.
     */
    min_confidence: z.number().min(0).max(1).optional(),
    /**
     * The day's token budget: model tokens in and out over a rolling 24
     * hours, read from the usage events every reply writes. Over it the
     * receptionist stops and files a `budget` escalation, as it does at the
     * reply cap. 0 or absent is off; a value is at least a thousand, because
     * a budget of ten would be a mute button with a misleading name.
     */
    max_llm_tokens_day: z
      .number()
      .int()
      .min(0)
      .max(5_000_000)
      .refine((n) => n === 0 || n >= 1000, "at least 1,000, or 0 to turn it off")
      .optional(),
  })
  .strict();
export type PolicyLimits = z.infer<typeof PolicyLimitsSchema>;

export interface PolicyRow {
  id: string;
  class: PolicyClass;
  mode: PolicyMode;
  subject_type: SchemaSet<"policies.subject_type"> | null;
  subject_id: string | null;
  limits: PolicyLimits;
  updated_at: string;
}
