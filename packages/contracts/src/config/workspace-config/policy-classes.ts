/**
 * The Autonomy tab's classes and modes (E3): what each class is called, which modes it honours, what the Booking
 * and FAQ rows write into a prompt, and the limits a row stores. The reply window and the caps the edge applies
 * are ../policy.ts.
 */
import type { SchemaSet } from "../../shared/schema-sets";
import type { SystemOneQuestion } from "../../ai/system-one";
import { PLAYBOOK_VETO_DELAY_WORDS } from "../../playbooks/playbook-triggers";
import type { PolicyLimits } from "./policy-limits-schema";

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
    note: `how a new win-back sequence starts · each keeps its own on its page, and asks you before its first batch and after new words`,
  },
  campaign: {
    name: "Standing offers",
    short: "Offers",
    note: `how a new offer or welcome sequence starts · each keeps its own on its page, and asks you before its first batch and after new words`,
  },
  reviews: {
    name: "Google reviews",
    short: "Reviews",
    note: `replies under new reviews on Google, through the connected Business Profile · auto answers each within the hour, veto writes it and posts it ${PLAYBOOK_VETO_DELAY_WORDS} later unless you stop it, ask writes one and holds it for your OK, never leaves them all to you`,
  },
  money: { name: "Refunds · rates · negotiation", short: "Money", note: "always goes to you" },
  // 0006: one nudge per proposal, with its link, once it has waited past the workspace's pace with nothing back. 0082: a
  // time a cancellation freed, to the people who asked and never booked, under the same row: both answer their own ask.
  follow_up: {
    name: "Follow-ups",
    short: "Follow-ups",
    note: "how the proposal follow-up and filling a cancellation start · one nudge per proposal, with its link; a time a cancellation freed, to the people who asked · each keeps its own on its page, and asks you before its first batch and after new words",
  },
  // Reach out (Part 3): cold email to the businesses a search found. Never sent on its own (0064).
  outreach: {
    name: "Cold email to businesses a search found",
    short: "Sequences to leads",
    note: "how a new sequence to leads starts · each keeps its own on its page, and asks you before its first batch and after new words",
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
 * no draft to hold for review. The sequences' classes say what a new
 * sequence starts as (decision 0064): it sends, holds each batch, or asks
 * for each; a sequence that should not send is paused on its page, so they
 * have no "never", and cold email never sends on its own. Reviews are
 * answered, written and held on the veto's countdown (REVIEW_HOLD_MS), drafted
 * for a person, or left alone. Money is the charter's.
 */
export const POLICY_CLASS_MODES: Record<PolicyClass, readonly PolicyMode[]> = {
  reply: ["auto", "veto", "ask", "never"],
  booking: ["auto", "ask"],
  faq: ["auto", "ask"],
  reengage: ["auto", "veto", "ask"],
  campaign: ["auto", "veto", "ask"],
  // Holds it (decision 0064, step 6): a reply written and posted after its wait unless stopped, as a batch is.
  reviews: ["auto", "veto", "ask", "never"],
  money: ["never"],
  follow_up: ["auto", "veto", "ask"],
  outreach: ["veto", "ask"],
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

export interface PolicyRow {
  id: string;
  class: PolicyClass;
  mode: PolicyMode;
  subject_type: SchemaSet<"policies.subject_type"> | null;
  subject_id: string | null;
  limits: PolicyLimits;
  updated_at: string;
}

/* ----------------------------------------------- how often the owner changes what it writes (0063) */

/** The days the Autonomy pane counts the held drafts over. */
export const HELD_DRAFTS_DAYS = 30;

/** One intent's held drafts as the read answers them (00448 held_drafts_by_intent). */
export interface HeldDraftsByIntent {
  intent: string;
  held: number;
  sent: number;
  steered: number;
  canceled: number;
  person_first: number;
}

/** The drafts held for the owner on one row: how many, and what became of them. */
export type HeldDraftsCount = Omit<HeldDraftsByIntent, "intent">;

/** The rows a held draft can belong to: its intent's (a booking, a question), else Replies. */
export type HeldDraftsClass = "reply" | "booking" | "faq";

/**
 * The held drafts by the Autonomy row they belong to: a draft's row is its intent's (policyClassOfIntent), and every
 * other draft, a money one among them (that row is the charter's, and has nothing to hold), is a reply's.
 */
export function heldDraftsByClass(
  rows: readonly HeldDraftsByIntent[],
): Partial<Record<HeldDraftsClass, HeldDraftsCount>> {
  const out: Partial<Record<HeldDraftsClass, HeldDraftsCount>> = {};
  for (const r of rows) {
    const c = policyClassOfIntent(r.intent);
    const cls: HeldDraftsClass = c === "booking" || c === "faq" ? c : "reply";
    const was = out[cls] ?? { held: 0, sent: 0, steered: 0, canceled: 0, person_first: 0 };
    out[cls] = {
      held: was.held + r.held,
      sent: was.sent + r.sent,
      steered: was.steered + r.steered,
      canceled: was.canceled + r.canceled,
      person_first: was.person_first + r.person_first,
    };
  }
  return out;
}

/**
 * The row's line: the drafts held for the owner in the window, and how many went as written, then each way the owner
 * changed one that happened at all. Null with none held: the row says nothing it has no evidence for.
 */
export function heldDraftsLine(c: HeldDraftsCount | undefined): string | null {
  if (!c || c.held <= 0) return null;
  const parts = [
    `${c.sent} sent as written`,
    c.steered > 0 ? `${c.steered} rewritten` : "",
    c.canceled > 0 ? `${c.canceled} stopped` : "",
    c.person_first > 0 ? `${c.person_first} you answered first` : "",
  ].filter(Boolean);
  return `${c.held} held for you in ${HELD_DRAFTS_DAYS} days: ${parts.join(", ")}`;
}
