import { PLAYBOOK_VETO_DELAY_WORDS } from "../../playbooks/playbook-triggers.js";
export const POLICY_CLASSES = [
  "reply",
  "booking",
  "faq",
  "reengage",
  "campaign",
  "reviews",
  "money",
  "follow_up",
  "outreach"
];
export const POLICY_CLASS_WORDS = {
  reply: { name: "Replies to customers", short: "Replies", note: "every text the receptionist sends" },
  faq: {
    name: "Service & pricing questions",
    short: "Questions",
    note: "auto answers from your business profile \xB7 ask hands every service or pricing question to you, on WhatsApp and on the phone"
  },
  booking: {
    name: "Book \xB7 reschedule",
    short: "Bookings",
    note: "auto sends your booking link \xB7 ask has a person confirm instead, on WhatsApp and on the phone"
  },
  reengage: {
    name: "Re-engage quiet customers",
    short: "Re-engage",
    note: `how a new win-back sequence starts \xB7 each keeps its own on its page, and asks you before its first batch and after new words`
  },
  campaign: {
    name: "Standing offers",
    short: "Offers",
    note: `how a new offer or welcome sequence starts \xB7 each keeps its own on its page, and asks you before its first batch and after new words`
  },
  reviews: {
    name: "Google reviews",
    short: "Reviews",
    note: `replies under new reviews on Google, through the connected Business Profile \xB7 auto answers each within the hour, veto writes it and posts it ${PLAYBOOK_VETO_DELAY_WORDS} later unless you stop it, ask writes one and holds it for your OK, never leaves them all to you`
  },
  money: { name: "Refunds \xB7 rates \xB7 negotiation", short: "Money", note: "always goes to you" },
  // 0006: one nudge per proposal, with its link, once it has waited past the workspace's pace with nothing back.
  follow_up: {
    name: "Proposal follow-ups",
    short: "Follow-ups",
    note: "how the proposal follow-up starts \xB7 one nudge per proposal, with its link \xB7 it keeps its own on its page, and asks you before its first batch and after new words"
  },
  // Reach out (Part 3): cold email to the businesses a search found. Never sent on its own (0064).
  outreach: {
    name: "Cold email to businesses a search found",
    short: "Reach-outs",
    note: "how a new sequence to leads starts \xB7 each keeps its own on its page, and asks you before its first batch and after new words"
  }
};
export const POLICY_MODES = ["auto", "veto", "ask", "never"];
export const POLICY_MODE_WORDS = {
  auto: { head: "Sends it", sub: "right away", chip: "sends it", does: "Sends it right away." },
  veto: {
    head: "Holds it",
    sub: "you can stop it",
    chip: "holds it",
    does: "Writes it, holds it, and sends it unless you stop it."
  },
  ask: {
    head: "Asks you",
    sub: "nothing sent",
    chip: "asks you",
    does: "Waits for you. Nothing is sent until you say so."
  },
  never: { head: "Stays quiet", sub: "nothing happens", chip: "stays quiet", does: "Stays out of it entirely." }
};
export const POLICY_CLASS_MODES = {
  reply: ["auto", "veto", "ask", "never"],
  booking: ["auto", "ask"],
  faq: ["auto", "ask"],
  reengage: ["auto", "veto", "ask"],
  campaign: ["auto", "veto", "ask"],
  // Holds it (decision 0064, step 6): a reply written and posted after its wait unless stopped, as a batch is.
  reviews: ["auto", "veto", "ask", "never"],
  money: ["never"],
  follow_up: ["auto", "veto", "ask"],
  outreach: ["veto", "ask"]
};
export function policyModeOffered(cls, mode) {
  return POLICY_CLASSES.includes(cls) && POLICY_CLASS_MODES[cls].includes(mode);
}
export function policyModeRefusal(cls, mode) {
  if (policyModeOffered(cls, mode)) return null;
  if (mode === "veto") return `The ${POLICY_CLASS_WORDS[cls].short} row has nothing to hold for review.`;
  if (mode === "never" && (cls === "booking" || cls === "faq"))
    return 'Bookings and service questions are answered by the receptionist or by you \u2014 there is no "never".';
  return `The ${cls} row cannot be set to ${mode}.`;
}
export function policyClassOfIntent(intent) {
  if (intent === "booking") return "booking";
  if (intent === "pricing" || intent === "services") return "faq";
  if (intent === "money") return "money";
  return null;
}
export function policyAskClass(policy, intent) {
  const cls = policyClassOfIntent(intent);
  if (!cls) return null;
  if (cls === "money") return cls;
  const mode = policy?.[cls]?.mode ?? "auto";
  return mode === "auto" ? null : cls;
}
export function bookingHeld(policy) {
  return policyAskClass(policy, "booking") === "booking";
}
export const POLICY_COVERS = {
  booking: "someone wants to book, reschedule or cancel",
  faq: "Service and pricing questions",
  money: "a refund, a discount, a deposit, a payment plan or any change to what someone pays"
};
const POLICY_CLASS_NONE = "none";
export function policyClassLabel(intent) {
  return policyClassOfIntent(intent) ?? POLICY_CLASS_NONE;
}
export function policyClassQuestion() {
  return {
    type: "choice",
    instructions: "Which of these rules does the customer's message fall under?",
    criteria: {
      booking: POLICY_COVERS.booking,
      faq: POLICY_COVERS.faq,
      money: POLICY_COVERS.money,
      [POLICY_CLASS_NONE]: "none of the above"
    }
  };
}
export function policyRules(policy, channel) {
  const out = [];
  const modeOf = (cls) => policy?.[cls]?.mode ?? "auto";
  const voice = channel === "voice";
  if (modeOf("booking") !== "auto") {
    out.push(
      voice ? `Booking: when ${POLICY_COVERS.booking}, do not offer the booking link. Say a member of the team will call or text them to confirm, and take their name.` : `Booking: when ${POLICY_COVERS.booking}, do not send the booking link. Say a member of the team will confirm with them shortly, and set escalate to true.`
    );
  }
  if (modeOf("faq") !== "auto") {
    out.push(
      voice ? `${POLICY_COVERS.faq}: do not answer them yourself. Say a member of the team will call them back with the details, and take their name.` : `${POLICY_COVERS.faq}: do not answer them yourself. Say a member of the team will get back to them with the details, and set escalate to true.`
    );
  }
  out.push(
    voice ? `Money: ${POLICY_COVERS.money} is never yours to decide or promise. Do not agree, refuse or quote terms; say a member of the team will call them back about it, and take their name.` : `Money: ${POLICY_COVERS.money} is never yours to decide or promise. Do not agree, refuse or quote terms; say a member of the team will get back to them about it, set intent to money and escalate to true.`
  );
  return out;
}
export const HELD_DRAFTS_DAYS = 30;
export function heldDraftsByClass(rows) {
  const out = {};
  for (const r of rows) {
    const c = policyClassOfIntent(r.intent);
    const cls = c === "booking" || c === "faq" ? c : "reply";
    const was = out[cls] ?? { held: 0, sent: 0, steered: 0, canceled: 0, person_first: 0 };
    out[cls] = {
      held: was.held + r.held,
      sent: was.sent + r.sent,
      steered: was.steered + r.steered,
      canceled: was.canceled + r.canceled,
      person_first: was.person_first + r.person_first
    };
  }
  return out;
}
export function heldDraftsLine(c) {
  if (!c || c.held <= 0) return null;
  const parts = [
    `${c.sent} sent as written`,
    c.steered > 0 ? `${c.steered} rewritten` : "",
    c.canceled > 0 ? `${c.canceled} stopped` : "",
    c.person_first > 0 ? `${c.person_first} you answered first` : ""
  ].filter(Boolean);
  return `${c.held} held for you in ${HELD_DRAFTS_DAYS} days: ${parts.join(", ")}`;
}
