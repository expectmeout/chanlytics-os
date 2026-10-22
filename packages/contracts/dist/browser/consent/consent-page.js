import { OFFERS_OPT_IN_PHRASES } from "../shared/enums.js";
import { optInLink } from "./wa-links.js";
import { formatPhoneDisplay } from "../shared/phone.js";
import { notFoundPageMetadata } from "../shell/chrome.js";
import { takesSignUps, WORKSPACE_PAUSED_FACT } from "../workspace/billing.js";
export function notTakingSignUps(name, so) {
  return `${name} is not taking sign-ups right now${so ? `, so ${so}` : ""}.`;
}
export const GET_YES_WORDS = {
  title: "Get their yes",
  note: "only people who said yes get an offer"
};
export const GET_YES_PAUSED_WORDS = {
  note: "not taking sign-ups while the workspace is paused",
  body: `${WORKSPACE_PAUSED_FACT}. Meanwhile your sign-up page, desk sign and paper form tell customers you are not taking sign-ups, and there is no code or link to hand out. Resume it from Settings \u203A Billing.`
};
export const GET_YES_NO_NUMBER_WORDS = {
  note: "no code without a WhatsApp number",
  body: "The code, the phrase and the desk sign come with your WhatsApp number. Until it is connected, record a customer's yes on their profile.",
  door: { label: "Open Connections", to: "admin/integrations" }
};
export const YES_WHILE_PAUSED = {
  details: "The customer said yes while the workspace is paused, so the confirmation of their yes was not sent. When the workspace runs again, send it from the Inbox.",
  answered: "(the confirmation of their yes waits: the workspace is paused)"
};
export function policyLinks(f) {
  const slug = (f.slug ?? "").trim();
  if (slug && f.businessPage) return { privacy: `/b/${slug}`, terms: `/b/${slug}/terms` };
  return { privacy: "/privacy", terms: "/terms" };
}
export function confirmationNameOf(o) {
  const said = (s) => (s ?? "").trim() || null;
  const name = o.channel === "sms" ? said(o.filed) ?? said(o.workspace) ?? said(o.receptionist) : said(o.receptionist) ?? said(o.workspace);
  return name ?? "";
}
export function optInConfirmation(businessName, purpose) {
  const name = businessName.trim() || "This business";
  return purpose === "marketing" ? `${name}: you're signed up for offers and news. A few messages a month. Msg & data rates may apply. Reply HELP for help, STOP to cancel.` : `${name}: you'll get texts about your appointments. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel.`;
}
export function verbalOptInScript(businessName) {
  const name = businessName.trim() || "us";
  return `Would you like ${name} to text you about your appointments and reply when you write? Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to stop.`;
}
export const CONSENT_PHRASE = OFFERS_OPT_IN_PHRASES.en;
export const CONSENT_PHRASE_ES = OFFERS_OPT_IN_PHRASES.es;
export const CONVERSATION_PHRASE = "START";
function waysFor(f, phrase) {
  const ways = [];
  const waLink = optInLink(f.whatsappE164, phrase);
  if (waLink) {
    ways.push({
      kind: "whatsapp",
      title: "On WhatsApp",
      sentence: `Tap to open WhatsApp with ${phrase} ready to send. Sending it is your yes.`,
      phrase,
      href: waLink,
      display: formatPhoneDisplay(f.whatsappE164)
    });
  }
  const smsDisplay = formatPhoneDisplay(f.smsE164);
  if (smsDisplay) {
    ways.push({
      kind: "sms",
      title: "By text",
      sentence: `Text ${phrase} to ${smsDisplay}. Sending it is your yes.`,
      phrase,
      href: `sms:${f.smsE164}?&body=${encodeURIComponent(phrase)}`,
      display: smsDisplay
    });
  }
  return ways;
}
export const CONVERSATIONAL_ASK_TITLE = "Messages about your appointment";
function askWords(name) {
  return {
    conversational: {
      title: CONVERSATIONAL_ASK_TITLE,
      lead: `Appointment reminders and confirmations from ${name}, and a reply when you write to them.`,
      optional: null,
      terms: [
        `You get appointment reminders and answers to what you ask ${name}. Message frequency varies.`,
        "Message and data rates may apply.",
        "Reply HELP for help. Reply STOP at any time to stop."
      ]
    },
    marketing: {
      title: "Offers and news",
      lead: `Promotions and news from ${name}, on WhatsApp.`,
      optional: `Separate, and entirely optional \u2014 you can have the messages above without this one, and saying no changes nothing about your appointments or anything you buy from ${name}.`,
      terms: [
        `You get promotional offers and news from ${name}. A few messages a month, never daily.`,
        "Message and data rates may apply.",
        "Reply HELP for help. Reply STOP at any time to stop."
      ]
    }
  };
}
function bothTerms(name) {
  return [
    "No mobile information is shared with third parties or affiliates for marketing purposes.",
    `Consent is not a condition of any purchase from ${name}.`
  ];
}
export function consentPageVM(f) {
  const name = f.businessName.trim() || "This business";
  const conversation = waysFor(f, CONVERSATION_PHRASE);
  const offers = waysFor({ ...f, smsE164: null }, CONSENT_PHRASE);
  const empty = conversation.length === 0 && offers.length === 0;
  const words = askWords(name);
  const taking = takesSignUps(f.open);
  const answered = (ways) => taking ? ways : [];
  const asks = empty ? [] : [
    ...conversation.length ? [{ purpose: "conversational", ...words.conversational, ways: answered(conversation) }] : [],
    ...offers.length ? [{ purpose: "marketing", ...words.marketing, ways: answered(offers) }] : []
  ];
  return {
    title: `Text messages from ${name}`,
    lead: empty ? `${name} is not set up to take sign-ups here yet.` : !taking ? notTakingSignUps(name) : asks.length > 1 ? `Two separate things you can say yes to, in your own message from your own phone. ${name} never sells or shares your number.` : `One thing you can say yes to, in your own message from your own phone: messages about your appointment. ${name} never sells or shares your number.`,
    asks,
    qrLink: taking ? optInLink(f.whatsappE164, CONSENT_PHRASE) : null,
    terms: bothTerms(name),
    links: policyLinks(f),
    empty,
    taking
  };
}
export function consentFormVM(f) {
  const name = f.businessName.trim() || "This business";
  const taking = takesSignUps(f.open);
  const words = askWords(name);
  const sections = [
    {
      purpose: "conversational",
      ...words.conversational,
      box: `Yes, text me about my appointments with ${name}.`,
      sign: "Signature for this box"
    },
    ...f.whatsappE164 ? [
      {
        purpose: "marketing",
        ...words.marketing,
        box: `Yes, send me offers and news from ${name} on WhatsApp.`,
        sign: "Signature for this box"
      }
    ] : []
  ];
  return {
    title: `Text messages from ${name}`,
    lead: !taking ? notTakingSignUps(name, "this form is not in use") : sections.length > 1 ? "Two separate boxes. Tick and sign only the ones you want: signing one does not sign you up for the other, and either one can be had without the other." : "One box. Tick and sign it if you want messages about your appointments: a reply when you write, and reminders and confirmations.",
    // An email line, for the messages a business will send by email once it can (the campaigns-on-every-channel
    // spec, Part 0): typed in on the person's page as the signed boxes are recorded. Nothing on paper is a yes to email.
    fields: ["Name", "Mobile number", "Email"],
    sections,
    terms: bothTerms(name),
    links: policyLinks(f),
    office: `For ${name}: record each signed box on the customer's profile, under its own answer, as \u201CSign-up form\u201D, type the email on their page, and keep this sheet. Recorded on __________ by __________`,
    taking
  };
}
export function consentPageMetadata(f) {
  return f ? { title: consentPageVM(f).title, robots: { index: false, follow: false } } : notFoundPageMetadata();
}
export function consentFormMetadata(f) {
  return f ? { title: `Sign-up form: ${consentFormVM(f).title}`, robots: { index: false, follow: false } } : notFoundPageMetadata();
}
export function deskSignVM(f) {
  const name = f.businessName.trim() || "This business";
  const taking = takesSignUps(f.open);
  const qrLink = taking ? optInLink(f.whatsappE164, CONSENT_PHRASE) : null;
  const number = formatPhoneDisplay(f.whatsappE164);
  return {
    business: name,
    headline: "Get our offers and news on WhatsApp",
    how: `Scan with your phone's camera: WhatsApp opens with ${CONSENT_PHRASE} ready to send. Sending it is your yes.`,
    byHand: qrLink && number ? `Or send ${CONSENT_PHRASE} (en espa\xF1ol, ${CONSENT_PHRASE_ES}) on WhatsApp to ${number}.` : null,
    terms: [...askWords(name).marketing.terms, ...bothTerms(name)],
    operator: `Messages are sent for ${name} by a receptionist operated by Chanlytics (RJ Capital LLC).`,
    qrLink,
    links: policyLinks(f),
    empty: !qrLink,
    emptyLine: taking ? `${name} has no WhatsApp number to say yes on yet, so there is no sign to print.` : notTakingSignUps(name, "there is no sign to print")
  };
}
export function deskSignMetadata(f) {
  return f ? { title: `Desk sign: ${deskSignVM(f).business}`, robots: { index: false, follow: false } } : notFoundPageMetadata();
}
