/**
 * What a workspace's campaign tells the carriers' reviewers: the description, the
 * message flow, the samples and the opt-in words, composed from the business's own
 * facts. Pure. `registerLine` (a2p-register.ts) files it; for a refile, line-ops.ts
 * composes it again and `resubmitRejectedCampaign` (a2p-refile.ts) sends the fields
 * Twilio lets it edit.
 */
import { optInConfirmation, verbalOptInScript } from "../packages/contracts.js";

/**
 * What the workspace tells a reviewer about the messages it will send.
 *
 * REWRITTEN AFTER TWO REFUSALS, both on the live Chanlytics campaign:
 *
 *   30886  USE_CASE_DESCRIPTION — "invalid campaign description"
 *   30913  MESSAGE_FLOW — "marketing consent was combined with other consents.
 *          Marketing consent must be collected separately."
 *
 * 30913 was earned. The old flow said customers "opt in by messaging the
 * business first, or by sending the words YES OFFERS", and the page that
 * sentence pointed at then promised "offers, news AND appointment reminders"
 * for that one yes. One control, three purposes.
 *
 * Twilio's requirements for this field are specific, and error 30917 spells out
 * what a passing answer contains: for EACH opt-in method, where it happens, what
 * disclosure the consumer sees there, and what action confirms consent. Where
 * there are several methods, all of them go in this one field.
 *
 * So the flow below walks a reviewer through both, separately, naming the
 * keyword that answers each — which is only true because the product now records
 * them as two different answers.
 */
/** Twilio's bound on a campaign's message flow: 40 to 2048 characters. */
const MESSAGE_FLOW_MAX = 2048;

/** What a campaign is composed from: the business's own facts and the pages a reviewer opens. */
type CampaignBusiness = {
  businessName: string;
  /**
   * The name the brand was registered and vetted under (`business_records.legal_name`),
   * said beside the trade name so a reviewer can match the campaign to the brand.
   * Error 30886 counts "misalignment ... with your registered brand details" among
   * its causes, and a campaign that only ever says "Chanlytics" leaves the reviewer
   * to guess that it and "RJ Capital LLC" are one business.
   */
  legalName?: string | null;
  /**
   * What the business does, in the owner's words (`business_records.about`).
   *
   * The NINTH refusal (30919, 22 Sep 2026) was filed against USE_CASE_DESCRIPTION.
   * The description said who sends, to whom and why, but never what the business
   * IS. A reviewer read "appointments" and "receptionist software", opened the
   * website to see what kind of business books appointments, and could not
   * "verify the operational business model". So the description opens with it,
   * in the same words the business page shows.
   */
  about?: string | null;
  optInUrl: string;
  privacyUrl: string;
  termsUrl: string;
  /**
   * The workspace's own hosted page, `/b/<slug>`.
   *
   * Filed as the privacy policy when the business has no site of its own, which
   * answers both of the page-shaped refusals this product has actually had:
   * 30919 wanted a page that identifies the business, and 30907 wanted the
   * website on the same domain as the opt-in page. It is on the same domain by
   * construction, and it carries the identity from `business_records` -- the
   * facts the carriers vetted on the brand.
   */
  hostedUrl?: string | null;
  /**
   * The workspace's OWN line, as a person reads it. Used in the sample that
   * shows a message containing a phone number -- which the filing declares it
   * sends, and which therefore has to be a number that message could really
   * contain. The platform's support line standing in for it would be a claim
   * made in the business's name, which is the one thing these samples may not
   * do.
   */
  lineNumber?: string | null;
};

export function campaignFactsFor(o: CampaignBusiness) {
  const sender = campaignSender(o);
  const pages = campaignPages(o);
  // The two sets of words the flow quotes, from contracts, where the wire and
  // the profile read them: what START is answered with, and what staff ask.
  const confirmation = optInConfirmation(sender.name, "conversational");
  const script = verbalOptInScript(sender.name);
  const messageFlow = campaignMessageFlow(o, sender.name, pages, { confirmation, script });
  return {
    // What the campaign IS: campaignDescription, below.
    description: campaignDescription(o, sender),
    // Every way in, within Twilio's bound: campaignMessageFlow, below.
    messageFlow,
    // What a reviewer reads as the messages: campaignSamples, below.
    samples: campaignSamples(o),

    // NOT correctable after the first filing: Twilio's campaign UPDATE accepts
    // description, message flow, samples, the four booleans and the two URLs,
    // and nothing else. Opt-in, opt-out and help information can only be changed
    // by deleting the campaign and creating a new one, which is a new vetting
    // fee. Get this right the first time, per workspace.
    //
    // It is sent for START, UNSTOP and RESUME -- the APPOINTMENT keywords -- so it
    // confirms appointment texts and names nothing else. The live Chanlytics
    // campaign's, filed before the split, reads "You're subscribed to offers and news
    // from Billing probe": the appointment keyword confirming a promotional
    // subscription, which is 30913 in one line, under a name the workspace dropped
    // long ago. No resubmit can reach it.
    // The words the receptionist actually sends when START arrives, from
    // contracts, so the filing and the wire cannot disagree -- and the same
    // words the flow quotes for method (1).
    optInMessage: confirmation,
    // Single words only, and only ones the receptionist actually honours
    // (contracts CONVERSATION_OPT_IN_PATTERN). The two-word offers phrase lives
    // in the flow above, because a keyword field takes single words.
    optInKeywords: ["START", "UNSTOP", "RESUME"],
    privacyPolicyUrl: pages.privacyPolicyUrl,
    termsUrl: pages.termsUrl,
  };
}

/** Who sends: the trade name, the registered name beside it, and what the business does. */
function campaignSender(o: CampaignBusiness) {
  const name = o.businessName;
  // The registered name beside the trade name -- once, and not when they are the
  // same business said twice.
  const legal = (o.legalName ?? "").trim();
  const who = legal && legal.toLowerCase() !== name.trim().toLowerCase() ? `${name} (${legal})` : name;
  // What the business does, as one finished sentence or more, ready to stand in front of the rest.
  const about = (o.about ?? "").trim().split(/\s+/).join(" ");
  const aboutLead = about ? `About ${who}: ${/[.!?]$/.test(about) ? about : `${about}.`} ` : "";
  return { name, who, aboutLead };
}

/** The pages a reviewer opens: the paper form, the privacy policy and the terms. */
function campaignPages(o: CampaignBusiness) {
  // The paper version of the opt-in page. Named in the flow because a reviewer can
  // only accept a form they can see.
  const formUrl = `${o.optInUrl}/form`;
  // Their own pages when we host them, ours-for-them otherwise. Chanlytics'
  // platform policy is the last resort and the wrong answer for a customer: it
  // identifies US, and 30919 asks who is sending. The terms follow the same rule
  // -- Chanlytics' /terms is a software agreement for workspace owners, not a
  // messaging program's terms, and a reviewer opening it finds the wrong
  // company and none of the eight things the guide lists.
  const privacyPolicyUrl = o.hostedUrl || o.privacyUrl;
  const termsUrl = o.hostedUrl ? `${o.hostedUrl}/terms` : o.termsUrl;
  return { formUrl, privacyPolicyUrl, termsUrl };
}

// What the campaign IS, in the plainest terms, with the separation stated
// rather than left to be inferred from the flow.
// THE CLAIM HAS TO BE TRUE, because this is a statement to a regulator about
// how this product behaves. It used to end "and no customer is enrolled in both
// by a single action", and the product's own keyword table says otherwise:
// `OPT_IN_PATTERN` matches YES OFFERS as well as START, deliberately (texting
// OFFERS is also a way back in from a STOP), so that one message sets both
// answers. That is defensible -- a customer who explicitly asks for offers has
// plainly also agreed to be replied to -- but it is not what the sentence said.
//
// What 30913 actually forbids is the OTHER direction: a yes to conversation
// being spent as a yes to marketing. That direction is what the wording now
// states, and it is the direction the code enforces.
//
// AND IT HAS TO SAY WHO, TO WHOM AND WHY. Error 30886 was the second refusal on
// the live campaign, and its own text asks for exactly that -- "describe who
// sends messages, who receives them, and why", in the registered brand's name --
// listing among its causes a platform named instead of the business sending. So
// the business is named with its registered name, the messages are said to be
// sent on its own behalf, and the recipients are said to be people who came to
// it: by writing, on its sign-up page, or on its signed paper form.
// THIRD REFUSAL, 10 September, the same two codes on the rewritten text. So
// it is now said the way the reviewers' own guide says it -- who sends, who
// receives, what the messages are -- in their register rather than ours, with
// the application layer named (30912 wants to know what system sends) and
// nothing a reviewer has to parse twice.
// FOURTH REFUSAL, 11 September 21:23 UTC, on the replaced campaign: 30896
// alone ("the provided Opt-in information"), the two earlier codes gone.
// What a reviewer opening the sign-up page still found was a marketing
// keyword offered on the number registered for an informational opt-in --
// one campaign, two consents, however carefully separated. So this campaign
// is what the texting line actually carries: replies and appointment
// messages. Offers and news go by WhatsApp, and the door refuses a
// promotion by text (core deliver: sms_carries_no_promotions).
function campaignDescription(o: CampaignBusiness, sender: ReturnType<typeof campaignSender>): string {
  const { name, who, aboutLead } = sender;
  return `${aboutLead}Messages are sent by ${who} to its own customers: people who wrote to ${name} first, or who said yes on its sign-up page (${o.optInUrl}) or its signed sign-up form. Messages are replies to what a customer asked, and confirmations and reminders about that customer's own appointments. No marketing or promotional content is sent from this number. Messages are composed by ${name}'s staff and by its receptionist software and sent through the Chanlytics OS application, on ${name}'s own behalf.`;
}

// THE CLAIM HAS TO BE TRUE, and one half of it was not. This flow used to open
// by calling the two opt-ins symmetric -- that giving either left the other
// ungiven -- which this product's own keyword table contradicts:
// `OPT_IN_PATTERN` matches the promotional keyword as well as the
// transactional one, deliberately (it is also how somebody returns from a
// STOP), so asking for offers records both answers. The campaign DESCRIPTION
// was corrected for exactly this; MESSAGE_FLOW -- the field error 30913 names
// -- was not, so the untrue half survived in the one place the carriers were
// reading and refusing.
//
// What 30913 forbids is the other direction, and that direction IS absolute
// here: a yes to conversation is never spent as a yes to marketing. So the
// flow states that absolutely, and names the one-way implication as the
// deliberate thing it is rather than denying it.
//
// EVERY WAY IN, and now there are two places. Error 30917 wants, for each opt-in
// method, where it happens, what is disclosed there and what action confirms it.
// The paper form is one of those methods now -- a yes to offers must be written,
// and a signed box is written -- so it is named, with the URL a reviewer can open.
// And the one thing a spoken yes may never be is a yes to offers: 30913 lists
// "relies on verbal consent instead of written consent" among its causes, so the
// flow says so, and the database refuses one (00100).
//
// Twilio takes 40 to 2048 characters here, and a long name on a long slug has to
// fit; the tests file one to be sure.
// THE THIRD REFUSAL named this field again, and the flow was telling on
// itself: "a customer who texts YES OFFERS is also recorded as reachable for
// appointment messages ... the only answer that implies another" -- one
// opt-in, two programs, in the reviewers' own "this doesn't" column. The wire
// no longer does that (channels normalizeInbound reads each question's own
// words), so the flow no longer says it. And a reviewer wants the privacy
// policy and the terms LINKED here (30909; 30908 says "directly referenced"
// in message_flow), which they never were.
//
// FIFTH REFUSAL, 12 September 01:23 UTC: 30896 again, and this time the
// field named -- MESSAGE_FLOW. Read against the reviewers' own causes (30896,
// 30909, 30917) the flow was claiming two things the product does not do and
// leaving out two things they verify by. "Every yes is confirmed by a text":
// only START is (whatsapp/inbound.ts); a signed box or a spoken yes is
// recorded on the profile, not confirmed. "Writing to the business first is
// consent to be answered": a method with no disclosure and no action, which
// reads as consent implied from an inbound message. A spoken yes "recorded
// with the date" and no script, when 30896 asks for "the exact script or
// flow in enough detail that a reviewer can verify". And the keyword's
// auto-reply never quoted, which 30917 lists for a keyword method.
//
// So: every method numbered and described the way they check one -- where,
// what is disclosed there, what action, and what the product does next; the
// auto-reply and the spoken script quoted from contracts, where the wire and
// the profile read the same words; and the first-message case said for what
// it is, a conversation answered, not an opt-in (mayMessageFor: a proactive
// send needs a recorded yes). Composed below, because it has to fit.
function campaignMessageFlow(
  o: CampaignBusiness,
  name: string,
  pages: ReturnType<typeof campaignPages>,
  quotes: { confirmation: string; script: string },
): string {
  const { formUrl, privacyPolicyUrl, termsUrl } = pages;
  const { confirmation, script } = quotes;
  // The flow, given how method (1) ends. Twilio takes 40 to 2048 characters
  // here, and a long name on a long slug -- the name four times, four URLs --
  // does not fit with both quotes in. The spoken script is quoted always:
  // nothing else in the filing carries it, and 30896 asks for it verbatim. The
  // auto-reply is quoted when the whole flow fits with it and referred to
  // otherwise, because it is filed beside the flow as this campaign's own
  // opt-in message, so a reviewer has the words either way.
  const flowEnding = (autoReply: string) =>
    [
      `${name} collects opt-in directly from the customer, for one program: replies to what they write, and confirmations and reminders about their own appointments. No promotional messages are sent under this campaign.`,
      `(1) KEYWORD START on the sign-up page (${o.optInUrl}), public: under "Messages about your visit" it states that they will receive appointment reminders and confirmations from ${name} and a reply when they write, that message frequency varies, that message and data rates may apply, and to reply HELP for help and STOP to stop; privacy policy and terms are linked on the page. It shows the number; the customer opts in by texting START to it from their own phone and ${autoReply}`,
      `(2) PAPER FORM (${formUrl}), public: the same statement above an unticked box, signed and dated at the business; staff record it on the profile as "Sign-up form" with the date and keep the sheet.`,
      `(3) IN PERSON OR ON THE PHONE: staff ask "${script}" and record a yes on the profile as "In person" or "On the phone" with the date and who heard it; a spoken yes is never used for promotions.`,
      `A first text from a customer is answered in that conversation only and is not an opt-in; appointment messages go only to customers opted in by (1), (2) or (3). STOP at any time ends all messages. Privacy policy: ${privacyPolicyUrl}. Terms: ${termsUrl}.`,
    ].join(" ");
  const quoted = flowEnding(`receives the auto-reply "${confirmation}"`);
  return quoted.length <= MESSAGE_FLOW_MAX ? quoted : flowEnding("receives the filed opt-in message as the auto-reply");
}

// Samples a reviewer reads. They must not state a fact about the business we
// were never given -- an invented opening time is a claim made in their name.
//
// Both declared booleans are now TRUE OF THE SAMPLES. HasEmbeddedLinks and
// HasEmbeddedPhone have always been sent as "true" while neither sample
// contained a link or a number, which is exactly the declaration/sample
// mismatch reviewers reject -- and a plausible half of 30886.
function campaignSamples(o: CampaignBusiness): string[] {
  return [
    `Hi, thanks for writing ${o.businessName}. How can we help today?`,
    // Brackets mark what varies, as the reviewers' guide asks; the link is the
    // business's own page, which is what a message from them would carry.
    `Reminder from ${o.businessName}: you have an appointment on [date] at [time]. Reply STOP to opt out.`,
    `${o.businessName}: our address, hours and services are at ${o.hostedUrl ?? o.optInUrl}. Reply STOP to opt out, HELP for help.`,
    o.lineNumber
      ? `${o.businessName}: we tried to reach you. Call us back on ${o.lineNumber} or reply here. Reply STOP to opt out.`
      : `${o.businessName}: we tried to reach you. Reply here and we will pick it up. Reply STOP to opt out.`,
    // No promotional sample: this campaign sends none, and a sample of one
    // would be the exact mismatch the reviewers refuse.
  ];
}
