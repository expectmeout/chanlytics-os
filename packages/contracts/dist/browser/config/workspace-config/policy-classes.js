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
    note: `the win-back and save-our-number campaigns \xB7 auto sends each run, veto sends it ${PLAYBOOK_VETO_DELAY_WORDS} later unless you stop it, ask leaves it waiting on Today, never runs nothing`
  },
  campaign: {
    name: "Standing offers",
    short: "Offers",
    note: `the welcome and month's-offer campaigns \xB7 auto sends each run, veto sends it ${PLAYBOOK_VETO_DELAY_WORDS} later unless you stop it, ask leaves it waiting on Today, never runs nothing`
  },
  reviews: {
    name: "Google reviews",
    short: "Reviews",
    note: "replies under new reviews on Google, through the connected Business Profile \xB7 auto answers each within the hour, ask drafts one for you to send, never leaves them all to you"
  },
  money: { name: "Refunds \xB7 rates \xB7 negotiation", short: "Money", note: "always goes to you" },
  // 0006: one nudge per proposal, with its link, once it has waited past the workspace's pace with nothing back.
  follow_up: {
    name: "Proposal follow-ups",
    short: "Follow-ups",
    note: "the proposal follow-up campaign \xB7 one nudge per proposal, with its link, once it has waited with nothing back \xB7 auto sends each run, ask leaves it waiting on Today, never runs nothing"
  },
  // Reach out (Part 3): cold email to the businesses a search found. A chain's first run always waits for its owner.
  outreach: {
    name: "Cold email to businesses a search found",
    short: "Reach-outs",
    note: `every email a reach-out sends \xB7 its first run always waits for you; later runs send ${PLAYBOOK_VETO_DELAY_WORDS} after they are made unless you stop them \xB7 never sends none`
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
  reengage: ["auto", "veto", "ask", "never"],
  campaign: ["auto", "veto", "ask", "never"],
  reviews: ["auto", "ask", "never"],
  money: ["never"],
  follow_up: ["auto", "ask", "never"],
  // Cold email never goes the moment a run is made: a chain's first run waits for its owner whatever the mode, and a
  // later one gives thirty minutes to be stopped (veto), waits too (ask), or does not run (never).
  outreach: ["veto", "ask", "never"]
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
