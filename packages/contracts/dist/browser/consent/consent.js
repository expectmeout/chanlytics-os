import { yesCovers } from "./consent-channels.js";
export function isOptedOutContact(c) {
  return !!c && (c.consent === "opted_out" || c.dnc === true);
}
export function mayRing(c) {
  return !c || c.dnc !== true;
}
const ASKED_TO_STOP_SHORT = "asked to stop";
const ASKED_TO_STOP = `${ASKED_TO_STOP_SHORT} receiving messages`;
export const STOP_WORDS = {
  pill: "Opted out",
  mark: "Stopped",
  short: ASKED_TO_STOP_SHORT,
  /** The short words as a heading over a count ("Asked to stop · 3"): a run's figure. */
  heading: `${ASKED_TO_STOP_SHORT.charAt(0).toUpperCase()}${ASKED_TO_STOP_SHORT.slice(1)}`,
  line: ASKED_TO_STOP,
  tone: "plain",
  /** The clause after a name ("Dana asked to stop receiving messages"), or on its own with a capital when none is given. */
  said: (who) => who ? `${who} ${ASKED_TO_STOP}` : `${ASKED_TO_STOP.charAt(0).toUpperCase()}${ASKED_TO_STOP.slice(1)}`
};
export const OPT_OUT_REFUSAL = `This customer ${STOP_WORDS.line}. They can text START to opt back in.`;
export function optOutWords(who) {
  return `${STOP_WORDS.said(who)}. Nothing can be sent \u2014 they can text START to opt back in.`;
}
export function stopRequestQuestion() {
  return { type: "noul", instructions: `Has the customer ${ASKED_TO_STOP}?` };
}
export function isOfferByEmail(m) {
  return m.channel === "email" && (m.purpose === "marketing" || m.purpose === "conversational" && m.proactive && m.about === "ours");
}
export function relationshipOnRecord(f) {
  return !!f.lastWroteAt || !!f.lastInboundCallAt || f.hasDeal === true;
}
export function mayMessageFor(c, purpose, opts) {
  if (isOptedOutContact(c)) return { ok: false, reason: "opted_out" };
  if (purpose === "outreach")
    return c.email_marketing === "opted_out" ? { ok: false, reason: "unsubscribed" } : { ok: true, reason: null };
  if (opts.channel === "email") {
    if (purpose !== "marketing") {
      if (opts.begins && c.email_marketing === "opted_out") return { ok: false, reason: "unsubscribed" };
      if (!opts.proactive || opts.about === "theirs") return { ok: true, reason: null };
      if (c.email_marketing === "opted_out") return { ok: false, reason: "unsubscribed" };
      if (c.marketing_consent === "opted_out") return { ok: false, reason: "no_marketing_consent" };
      const saidYes = c.consent === "opted_in" && yesCovers(c.consent_channels, "email");
      return saidYes || c.has_relationship === true ? { ok: true, reason: null } : { ok: false, reason: "not_opted_in" };
    }
    const answer = c.email_marketing;
    if (answer === "opted_out") return { ok: false, reason: "unsubscribed" };
    if (c.marketing_consent === "opted_out") return { ok: false, reason: "no_marketing_consent" };
    if (answer === "opted_in") return { ok: true, reason: null };
    return answer === "unknown" && c.has_relationship === true ? { ok: true, reason: null } : { ok: false, reason: "no_marketing_consent" };
  }
  if (purpose === "marketing") {
    return c.marketing_consent === "opted_in" && yesCovers(c.marketing_channels, opts.channel) ? { ok: true, reason: null } : { ok: false, reason: "no_marketing_consent" };
  }
  if (opts.proactive && (c.consent !== "opted_in" || !yesCovers(c.consent_channels, opts.channel)))
    return { ok: false, reason: "not_opted_in" };
  return { ok: true, reason: null };
}
export const DELIVERY_REFUSALS = [
  "opted_out",
  "not_opted_in",
  "no_marketing_consent",
  "erased",
  "paused",
  "human_has_it",
  "superseded_by_human",
  // The receptionist's held reply would reach them past the reply horizon after the message it answers: a person's now.
  "too_late",
  "sms_carries_no_promotions",
  // A text needs its line active with the carriers and not a test filing (step 3): the inbound door holds the same.
  "sms_line_not_active",
  "email_marketing_disabled",
  // Offers by email are paused for the workspace while its complaints or bounces settle (broadcasts/email-offers.ts).
  "email_offers_paused",
  "email_suppressed",
  "recipient_changed",
  // Reach out's (a cold email to a business the finder found): the person's own no, then the rules the lane is built on.
  "unsubscribed",
  "outreach_is_email_only",
  "outreach_not_a_lead",
  "outreach_lead_closed",
  "outreach_suppressed",
  "outreach_wrote_back",
  "outreach_away",
  "outreach_stopped",
  "outreach_without_unsubscribe",
  "outreach_needs_own_mailbox",
  "sending_mailbox_not_ready",
  "sending_mailbox_at_cap"
];
export const PURPOSE_REFUSALS = {
  opted_out: OPT_OUT_REFUSAL,
  not_opted_in: "This customer has not said yes to messages yet.",
  no_marketing_consent: "This customer has not said yes to offers. Reminders, confirmations and replies still go; promotions do not.",
  // The texting line's carrier registration covers replies and appointment
  // messages and nothing else -- an informational campaign, filed that way
  // after the fourth refusal (30896, 11 Sep 2026). A promotion by text would
  // go out under a consent the carriers were never told about.
  sms_carries_no_promotions: "Offers and news do not go by text: the line is registered with the carriers for replies and appointment messages only. This customer hears about offers on WhatsApp, once they have said yes to them there.",
  sms_line_not_active: "The texting line is not approved by the carriers yet, or is a test filing, so nothing goes out by text until it is.",
  // Email's, at the wire (deliver.ts). An offer by email leaves only once the deployment has its campaigns domain
  // verified and the workspace's offers are not paused; a suppression is a fact about the address.
  email_marketing_disabled: "Offers by email start once the campaigns domain is set up. This customer hears about offers on WhatsApp, once they have said yes to them there.",
  email_offers_paused: "Offers by email are paused for your workspace while complaints and bounces settle. Reminders, confirmations and replies keep going, and offers on WhatsApp are not affected.",
  email_suppressed: "Email to this address has stopped: it bounced for good, or the person marked a message as spam. Correct the address on their page, or reach them another way.",
  recipient_changed: "This person's email address changed after the reply was written, so it was not sent. Write it again and it goes to the address on file now.",
  // The door's own, said the way a person reads them in a thread.
  erased: "This person asked to be forgotten. Nothing is sent to them.",
  paused: "The workspace is paused, so nothing automatic was sent.",
  human_has_it: "Someone on your team has this conversation, so nothing automatic was sent.",
  superseded_by_human: "Someone on your team answered first, so this was not sent.",
  too_late: "The receptionist's reply would have reached them hours after they wrote, so it was not sent. Its words are kept in the thread, for you to send or answer in your own.",
  // Reach out's, at the wire (deliver.ts): a cold email goes only as the rules it was built under allow.
  unsubscribed: "This person unsubscribed from your marketing emails. No offers or first emails go to them by email; replies, reminders and confirmations still can.",
  outreach_is_email_only: "Cold messages go only by email: never by text or WhatsApp.",
  outreach_not_a_lead: "Cold email goes only to a business your searches found.",
  outreach_lead_closed: "This business is no longer being written to: it said no, became a customer, or was set aside.",
  outreach_suppressed: "This address is on the never-again list: it unsubscribed, complained, or was erased.",
  outreach_wrote_back: "This business wrote back or called, so it is a conversation now: answer it from the Inbox. No cold email goes to it again.",
  outreach_away: "Away: their automatic reply says they're out. This email waits, and goes to them after the day they're back.",
  outreach_stopped: "You stopped writing to this business, so this email was not sent. Nothing more goes to it.",
  outreach_without_unsubscribe: "This email was built without its unsubscribe link, so it was not sent.",
  outreach_needs_own_mailbox: "Cold email leaves only from a mailbox you connected. Connect Google or Microsoft on Connections, under Email.",
  sending_mailbox_not_ready: "The mailbox this email was to leave from isn't sending right now. Connections, under Email, says why.",
  sending_mailbox_at_cap: "The mailbox this email was to leave from has written its day's share. It goes when there is room."
};
export function consentChangeOf(e) {
  const d = e.data ?? {};
  const str = (k) => typeof d[k] === "string" && d[k] !== "" ? d[k] : null;
  return {
    id: e.id,
    contact_id: e.subject_id,
    at: e.created_at,
    // Email's answer is its own (00174): read as the conversational one, an unsubscribe said "nothing goes out".
    purpose: d.purpose === "marketing" ? "marketing" : d.purpose === "email_marketing" ? "email_marketing" : "conversational",
    consent: str("consent"),
    previous: str("previous"),
    source: str("source"),
    by: str("by"),
    note: str("note"),
    channel: str("channel"),
    message_external_id: str("message_external_id"),
    words: str("words")
  };
}
export function purposeOfTemplate(category) {
  return category === "utility" || category === "authentication" ? "conversational" : "marketing";
}
export function purposeOfPlaybook(policyClass) {
  return policyClass === "booking" || policyClass === "follow_up" ? "conversational" : "marketing";
}
