/**
 * May we contact this person?
 *
 * One predicate, because this rule was hand-inlined in five places — the
 * webhook's consent gate, the reply route, the send job, the voice booking-link
 * function and the view model — and a rule about not contacting people who
 * asked to be left alone is the last one that should drift. Five copies is five
 * chances for the next send path to check only `consent` and miss `dnc`.
 *
 * Both columns matter and either alone is decisive:
 *   consent  the state machine the customer drives — 'unknown' | 'opted_in'
 *            | 'opted_out', written by ingest when they text STOP or START.
 *   dnc      the operator-settable override, for a request made by phone, in
 *            person, or by a regulator.
 *
 * Absence is NOT an opt-out. Both fields are optional here because a caller may
 * be holding a row selected before these columns were projected, and reading a
 * missing value as a block would silence every contact the moment somebody
 * forgot a column in a SELECT.
 */
import type { SystemOneQuestion } from "../ai/system-one";
import { yesCovers } from "./consent-channels";

export interface ConsentBearing {
  consent?: string | null;
  dnc?: boolean | null;
}

export function isOptedOutContact(c: ConsentBearing): boolean {
  return c.consent === "opted_out" || c.dnc === true;
}

/** What an opt-out is, in the words the refusal below says it and a second reader is asked it (stopRequestQuestion). */
const ASKED_TO_STOP = "asked to stop receiving messages";

/** The customer-facing reason, used wherever a refusal is explained. */
export const OPT_OUT_REFUSAL = `This customer ${ASKED_TO_STOP}. They can text START to opt back in.`;

/**
 * Whether a customer's message asks to stop, put to a second model in shadow (decision 0023). The keyword door
 * (OPT_OUT_PATTERN) reads STOP, BAJA, ALTO and UNSUBSCRIBE alone; a message that reached the receptionist was read as
 * no such request, so the primary's answer to this question is always "false", and the shadow's yes is a stop the
 * keywords let through.
 */
export function stopRequestQuestion(): SystemOneQuestion {
  return { type: "noul", instructions: `Has the customer ${ASKED_TO_STOP}?` };
}

/* -------------------------------------------------------------------------- *
 * Two questions, two answers.
 *
 * A person can be asked two different things, and the carriers require them to
 * be asked separately (error 30913, and CTIA §5.1: "express written consent to
 * SPECIFICALLY receive marketing messages"). Until now this product asked once
 * and spent the answer everywhere, which over-blocked a genuine appointment
 * reminder and under-blocked a promotional send from the voice path.
 *
 *   conversational  replying to them, and messages about their own visit.
 *                   Implied when they write first; express when they text START.
 *   marketing       offers, news, re-engagement. NEVER implied.
 *
 * `dnc` and `consent === 'opted_out'` remain absolute: STOP means stop, on both.
 * The reverse is not symmetric and must not be made so -- declining offers is
 * not a request to stop hearing about your own appointment.
 * -------------------------------------------------------------------------- */

/**
 * "outreach" is a cold email to a business the finder found (Reach out): its own lane, with its own rules at the
 * wire (deliver.ts), and never on a phone's channel.
 */
export type SendPurpose = "conversational" | "marketing" | "outreach";

/** The two questions a person is asked, and answers (the consent page, their profile, an audience). Outreach asks nobody. */
export type AskedPurpose = Exclude<SendPurpose, "outreach">;

/**
 * What a message that starts a conversation is about (decision D1 of the Campaigns code review, 4 Oct 2026, keeping the
 * campaigns spec's decision 11): `theirs` is about something the person set going themselves (a visit they booked, the
 * proposal their deal waits on, the call they are on, a thread they wrote in); `ours` is news the business chose to send
 * (a broadcast, whatever its template's category). Only email asks it: a visit reminder by email needs no yes, but an
 * email of the business's own choosing needs the person's yes covering email, or a relationship on record, as an offer
 * does. Required at every send, so a sender cannot forget which it is.
 */
export type MessageAbout = "theirs" | "ours";

export interface PurposeBearing extends ConsentBearing {
  marketing_consent?: string | null;
  /**
   * The channels each yes covers (consent-channels.ts, step 2 of One message, every channel). Null or absent: a yes
   * recorded before the channels were, which covers WhatsApp alone, the reach it always had (yesCovers).
   */
  consent_channels?: readonly string[] | null;
  marketing_channels?: readonly string[] | null;
  /**
   * Email's own answer (00174): unknown until they say, opted_in once they asked for offers in writing, opted_out once
   * they pressed Unsubscribe. Marketing FAILS CLOSED on it like the other two answers: a row read without the column
   * must not send an offer to someone who unsubscribed.
   */
  email_marketing?: string | null;
  /**
   * Whether the person has dealt with the business, read from what the row already holds (relationshipOnRecord, spec 4.1):
   * they wrote or called, or have a deal. Absent or null is no relationship on record, so an offer by email asks for the
   * person's own yes. The database keeps the same fact as `has_relationship` (00299), which a test holds to that function.
   */
  has_relationship?: boolean | null;
}

/**
 * Whether a person has a relationship with the business on record (spec 4.1: "a fact the row already holds"): they wrote
 * to it in their own words, they called it, or they have a deal. THE one reading of those three facts: People's rows ask
 * it of the columns `people_list` returns, and the database's `has_relationship` (00299) keeps the same rule for the rows
 * the send door reads, which a test holds equal case by case. `lastWroteAt` is when they last wrote words that were a
 * person's, not an out-of-office, a list's mail or a form's notification from their address (an email the intake read as
 * automated, an automatic reply or a delivery report: meta.email.claim; the database's message_is_a_persons_words says it
 * of the claim, and people_list's last_wrote_at leaves them out): a program writing from their address is not them dealing
 * with the business. A lead the finder found is nobody's customer yet and has none.
 */
export function relationshipOnRecord(f: {
  lastWroteAt?: string | null;
  lastInboundCallAt?: string | null;
  hasDeal?: boolean | null;
}): boolean {
  return !!f.lastWroteAt || !!f.lastInboundCallAt || f.hasDeal === true;
}

/**
 * May a message of this purpose go to this person?
 *
 * `proactive` is the existing distinction, kept: answering somebody who wrote to
 * you needs only that they have not asked you to stop, while starting a
 * conversation needs their recorded yes.
 *
 * Marketing needs its own yes on top, and it FAILS CLOSED -- a row selected
 * without the column reads as `undefined`, which is not `'opted_in'`, so a
 * forgotten SELECT withholds an offer rather than sending one. That asymmetry
 * is deliberate and is the opposite of `isOptedOutContact`'s, which fails open
 * for the same reason in the other direction: a missing column must never
 * silence a reply, and must never authorise a promotion.
 */
/** Why the predicate said no: a closed set, so a door cannot admit a reason that has no words. */
export type PurposeRefusal = "opted_out" | "no_marketing_consent" | "not_opted_in" | "unsubscribed";

export function mayMessageFor(
  c: PurposeBearing,
  purpose: SendPurpose,
  opts: { proactive?: boolean; channel: string; about: MessageAbout },
): { ok: true; reason: null } | { ok: false; reason: PurposeRefusal } {
  if (isOptedOutContact(c)) return { ok: false, reason: "opted_out" };
  // Cold email to a business: US law lets a business write until it is told to stop (CAN-SPAM), so no recorded yes
  // is asked for. What is asked: that they did not stop everything, and did not unsubscribe from this business's
  // email. The wire's own rules (email only, a lead, an own domain, the unsubscribe) are the door's.
  if (purpose === "outreach")
    return c.email_marketing === "opted_out" ? { ok: false, reason: "unsubscribed" } : { ok: true, reason: null };
  // THE CHANNEL IS REQUIRED: a yes covers the channels it was given for (consent-channels.ts). A yes to offers covers
  // the channels in marketing_channels; a yes to hear about a visit, the ones in consent_channels, which only a message
  // that starts a conversation asks about: a reply answers someone who wrote, on whatever channel they wrote on.
  if (opts.channel === "email") {
    // Email is its own (the spec's decisions 2, 11 and 12): a message about their visit needs no yes, only an address the
    // door finds unsuppressed. An offer (spec 4.1) goes to someone who has not unsubscribed and either asked for offers
    // by email, or has a relationship with the business on record (they wrote, called, or have a deal): an address alone
    // is not enough. An unsubscribe ends it, and a row read without the answer cannot tell whether they pressed it, so
    // it sends nothing. Whether the deployment may send an offer by email at all is the door's (deliver.ts: a verified
    // campaigns domain, the workspace's offers not paused) and the pick's (reach-for.ts channelRefuses).
    if (purpose !== "marketing") {
      // A reply, or a message about something of theirs (a visit they booked, their proposal, the call they are on):
      // no yes asked, as decision 11 says.
      if (!opts.proactive || opts.about === "theirs") return { ok: true, reason: null };
      // DECISION D1 (4 Oct 2026): news the business chose to send is not a visit reminder because its WhatsApp twin is
      // a utility template. It goes by email as an offer would: not to someone who pressed Unsubscribe, and only to
      // someone whose yes covers email or who has dealt with the business. An address alone is not enough.
      if (c.email_marketing === "opted_out") return { ok: false, reason: "unsubscribed" };
      // A recorded no to offers and news (the yes the consent page asks is to both) bars the business's news by email too,
      // as it bars an offer below: the conservative reading of 3 Oct, and the promotional-under-a-utility-twin case D1 closes.
      if (c.marketing_consent === "opted_out") return { ok: false, reason: "no_marketing_consent" };
      const saidYes = c.consent === "opted_in" && yesCovers(c.consent_channels, "email");
      return saidYes || c.has_relationship === true
        ? { ok: true, reason: null }
        : { ok: false, reason: "not_opted_in" };
    }
    const answer = c.email_marketing;
    if (answer === "opted_out") return { ok: false, reason: "unsubscribed" };
    // DECISION (3 Oct 2026, the conservative reading): a recorded no to offers elsewhere bars an offer by email too. Someone
    // who declined offers on WhatsApp ("no more offers") must not hear about them by email because email keeps its own answer
    // and they never pressed Unsubscribe. It holds even over a yes to offers by email: with one answer older than the other
    // and no way to tell which, the no wins until a person resets the offers answer (a reset is "unknown").
    if (c.marketing_consent === "opted_out") return { ok: false, reason: "no_marketing_consent" };
    if (answer === "opted_in") return { ok: true, reason: null };
    return answer === "unknown" && c.has_relationship === true
      ? { ok: true, reason: null }
      : { ok: false, reason: "no_marketing_consent" };
  }
  if (purpose === "marketing") {
    return c.marketing_consent === "opted_in" && yesCovers(c.marketing_channels, opts.channel)
      ? { ok: true, reason: null }
      : { ok: false, reason: "no_marketing_consent" };
  }
  if (opts.proactive && (c.consent !== "opted_in" || !yesCovers(c.consent_channels, opts.channel)))
    return { ok: false, reason: "not_opted_in" };
  return { ok: true, reason: null };
}

/**
 * Every reason the send door (core deliver.ts) stays shut: a closed list, so a reason cannot reach a thread or a run's
 * report without its words (both maps below are typed against it). Each is a fact about the person, the thread or
 * the workspace, never about us.
 */
export const DELIVERY_REFUSALS = [
  "opted_out",
  "not_opted_in",
  "no_marketing_consent",
  "erased",
  "paused",
  "human_has_it",
  "superseded_by_human",
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
  "outreach_needs_own_domain",
  "sending_domain_not_ready",
  "sending_domain_at_cap",
] as const;
export type DeliveryRefusal = (typeof DELIVERY_REFUSALS)[number];

/** Why a send was withheld, in the operator's words: every door refusal (the compiler holds it), and the job's own. */
export const PURPOSE_REFUSALS: Record<DeliveryRefusal, string> & Record<string, string> = {
  opted_out: OPT_OUT_REFUSAL,
  not_opted_in: "This customer has not said yes to messages yet.",
  no_marketing_consent: "This customer has not said yes to OFFERS. Appointment messages are fine; promotions are not.",
  // The texting line's carrier registration covers replies and appointment
  // messages and nothing else -- an informational campaign, filed that way
  // after the fourth refusal (30896, 11 Sep 2026). A promotion by text would
  // go out under a consent the carriers were never told about.
  sms_carries_no_promotions:
    "Offers and news do not go by text: the line is registered with the carriers for replies and appointment messages only. This customer hears about offers on WhatsApp, once they have said yes to them there.",
  sms_line_not_active:
    "The texting line is not approved by the carriers yet, or is a test filing, so nothing goes out by text until it is.",
  // Email's, at the wire (deliver.ts). An offer by email leaves only once the deployment has its campaigns domain
  // verified and the workspace's offers are not paused; a suppression is a fact about the address.
  email_marketing_disabled:
    "Offers by email start once the campaigns domain is set up. This customer hears about offers on WhatsApp, once they have said yes to them there.",
  email_offers_paused:
    "Offers by email are paused for your workspace while complaints and bounces settle. Appointment messages and replies keep going, and offers on WhatsApp are not affected.",
  email_suppressed:
    "Email to this address has stopped: it bounced for good, or the person marked a message as spam. Correct the address on their page, or reach them another way.",
  recipient_changed:
    "This person's email address changed after the reply was written, so it was not sent. Write it again and it goes to the address on file now.",
  // The door's own, said the way a person reads them in a thread.
  erased: "This person asked to be forgotten. Nothing is sent to them.",
  paused: "The workspace is paused, so nothing automatic was sent.",
  human_has_it: "Someone on your team has this conversation, so nothing automatic was sent.",
  superseded_by_human: "Someone on your team answered first, so this was not sent.",
  // Reach out's, at the wire (deliver.ts): a cold email goes only as the rules it was built under allow.
  unsubscribed:
    "This person unsubscribed from your marketing emails. No offers or first emails go to them by email; replies and messages about their visits still can.",
  outreach_is_email_only: "Cold messages go only by email: never by text or WhatsApp.",
  outreach_not_a_lead: "Cold email goes only to a business your searches found.",
  outreach_lead_closed: "This business is no longer being written to: it said no, became a customer, or was set aside.",
  outreach_suppressed: "This address is on the never-again list: it unsubscribed, complained, or was erased.",
  outreach_wrote_back:
    "This business wrote back or called, so it is a conversation now: answer it from the Inbox. No cold email goes to it again.",
  outreach_away:
    "Away: their automatic reply says they're out. This email waits, and goes to them after the day they're back.",
  outreach_stopped: "You stopped writing to this business, so this email was not sent. Nothing more goes to it.",
  outreach_without_unsubscribe: "This email was built without its unsubscribe link, so it was not sent.",
  outreach_needs_own_domain: "Cold email leaves only from a domain you own. Add one on Connections, under Email.",
  sending_domain_not_ready:
    "The domain this email was to leave from isn't sending right now. Connections, under Email, says why.",
  sending_domain_at_cap:
    "The domain this email was to leave from has sent its day's share. It goes when there is room.",
};

/**
 * One change to one of the two answers, as the ledger recorded it.
 *
 * The events row is the proof: which question, what was said, how, by whom,
 * and -- for an answer the customer texted -- the channel, the provider's own
 * id of the message and the customer's words (00110). "When did she say yes,
 * to what, and how do we know" is answered from these and nothing else; the
 * profile's timeline and the workspace export both read this shape.
 */
export interface ConsentChange {
  id: string;
  contact_id: string | null;
  at: string;
  /** Which question: messages about their visit, offers, or marketing email (an unsubscribe, 00174). */
  purpose: "conversational" | "marketing" | "email_marketing";
  consent: string | null;
  previous: string | null;
  /** How it was given: in person, on the phone, a signed form, their own message; "operator" is the reset. */
  source: string | null;
  /** The member who recorded it (their user id), or null when the customer's own message did. */
  by: string | null;
  note: string | null;
  /** For an answer the customer texted: where it came from, which message, and what they wrote. */
  channel: string | null;
  message_external_id: string | null;
  words: string | null;
}

/** An events row of kind contact.consent_changed, as the doors write it (00043, 00013, 00095, 00110). */
export function consentChangeOf(e: {
  id: string;
  subject_id: string | null;
  created_at: string;
  data: unknown;
}): ConsentChange {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const str = (k: string): string | null => (typeof d[k] === "string" && d[k] !== "" ? d[k] : null);
  return {
    id: e.id,
    contact_id: e.subject_id,
    at: e.created_at,
    // Email's answer is its own (00174): read as the conversational one, an unsubscribe said "nothing goes out".
    purpose:
      d.purpose === "marketing" ? "marketing" : d.purpose === "email_marketing" ? "email_marketing" : "conversational",
    consent: str("consent"),
    previous: str("previous"),
    source: str("source"),
    by: str("by"),
    note: str("note"),
    channel: str("channel"),
    message_external_id: str("message_external_id"),
    words: str("words"),
  };
}

/**
 * What kind of message a WhatsApp template is, from the category META assigned
 * it — which is the authority, not what the workspace asked for, and which Meta
 * can change on a live template.
 *
 * FAILS CLOSED, and this is the whole subtlety. `templates.category` is NULL for
 * exactly the rows most likely to matter: `booking_link` was seeded by hand
 * before the column existed, any workspace that has never run a template sync
 * has NULL throughout, and the mapper returns null for anything Meta names that
 * we do not recognise. Written the obvious way -- `category === 'marketing'` --
 * the gate would let every one of those through as if it were transactional.
 * So only the two categories that are POSITIVELY not marketing count as
 * conversational, and everything else, NULL included, is treated as marketing.
 */
export function purposeOfTemplate(category: string | null | undefined): AskedPurpose {
  return category === "utility" || category === "authentication" ? "conversational" : "marketing";
}

/**
 * What kind of message a playbook sends, from the class it already declares.
 *
 * `booking` is a reminder about an appointment the customer made, and `follow_up` a
 * nudge on the proposal they asked for (0006): each answers the person's own request.
 * `reengage` and
 * `campaign` are promotional by definition -- reaching somebody who has gone
 * quiet, or running an offer. Unknown classes are marketing, for the same
 * fail-closed reason as templates.
 */
export function purposeOfPlaybook(policyClass: string | null | undefined): AskedPurpose {
  return policyClass === "booking" || policyClass === "follow_up" ? "conversational" : "marketing";
}
