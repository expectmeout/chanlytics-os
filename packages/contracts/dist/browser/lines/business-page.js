import { formatPhoneDisplay } from "../shared/phone.js";
import { industryWords } from "./a2p-enums.js";
import { ABOUT_MIN } from "./business-record.js";
import { notFoundPageMetadata } from "../shell/chrome.js";
import { takesSignUps } from "../workspace/billing.js";
import { notTakingSignUps } from "../consent/consent-page.js";
export const SMS_CLAUSES = [
  "Message and data rates may apply.",
  "Message frequency varies.",
  "Reply STOP to stop and HELP for help.",
  "No mobile information will be shared with third parties or affiliates for marketing or promotional purposes; all other categories of sharing exclude text-messaging originator opt-in data and consent, which will not be shared with any third parties."
];
export function dataSentences(businessName) {
  return [
    `For text messages, ${businessName} keeps your mobile number, the messages you and it exchange, and your yes to messages, with the date and the way it was given.`,
    "They are used only to answer you, to send the messages you agreed to, and to honour a STOP. They are not sold, and they are not shared with third parties or affiliates for marketing or promotional purposes."
  ];
}
export function smsConsentSentence(businessName) {
  return `${businessName}'s customers receive text messages only when they have contacted ${businessName} first, or when they have agreed to receive messages about their own appointments. No offers or promotions are sent by text: ${businessName}'s offers and news, for customers who ask for them, go by WhatsApp.`;
}
function identifiesABusiness(f) {
  return !!f.legalName.trim() && !!f.street.trim() && !!f.city.trim();
}
export function publishesBusinessPage(r) {
  return !!r && identifiesABusiness({ legalName: r.legal_name ?? "", street: r.street ?? "", city: r.city ?? "" });
}
function addressLine(f) {
  const street = f.soleProprietor ? [] : [f.street, f.streetSecondary];
  const parts = [...street, `${f.city}, ${f.region} ${f.postalCode}`.trim(), f.country].map((p) => (p ?? "").trim()).filter(Boolean);
  return parts.join(", ");
}
export function businessPageVM(f) {
  const legal = f.legalName.trim();
  const trade = (f.tradeName ?? "").trim();
  const known = trade || legal;
  const empty = !identifiesABusiness(f);
  const taking = takesSignUps(f.open);
  const identity = [];
  if (legal)
    identity.push({ label: "Legal name", value: trade && trade !== legal ? `${legal}, trading as ${trade}` : legal });
  const industry = (f.industry ?? "").trim();
  if (industry) identity.push({ label: "Industry", value: industryWords(industry) });
  const where = addressLine(f);
  if (where) identity.push({ label: "Address", value: where });
  const phone = formatPhoneDisplay(f.publicPhoneE164);
  if (phone) identity.push({ label: "Phone", value: phone, href: `tel:${f.publicPhoneE164}` });
  if (f.contactEmail.trim())
    identity.push({ label: "Email", value: f.contactEmail.trim(), href: `mailto:${f.contactEmail.trim()}` });
  if (f.websiteUrl && f.websiteUrl.trim())
    identity.push({ label: "Website", value: f.websiteUrl.trim(), href: f.websiteUrl.trim() });
  return {
    title: known || "This business",
    lead: empty ? "This business has not finished setting up yet." : taking ? `${known} answers its customers by phone, on WhatsApp and by text. This page says who they are and what those messages are.` : `This page says who ${known} is and what its text messages are.`,
    closedLine: !empty && !taking ? notTakingSignUps(known) : null,
    signUpLead: taking ? "To say yes, or to see exactly what you would be agreeing to, open" : "To see exactly what you would be agreeing to, open",
    identity,
    about: (f.about ?? "").trim() || null,
    services: f.services.slice(0, 40).map((s) => ({
      name: s.name,
      detail: [
        typeof s.durationMin === "number" && s.durationMin > 0 ? `${s.durationMin} min` : null,
        (s.priceNote ?? "").trim() || null
      ].filter(Boolean).join(" \xB7 ") || null
    })),
    smsLead: smsConsentSentence(known || "This business"),
    smsClauses: SMS_CLAUSES,
    optInUrl: f.optInUrl,
    yourData: dataSentences(known || "This business"),
    termsUrl: f.termsUrl,
    websiteUrl: f.websiteUrl && f.websiteUrl.trim() ? f.websiteUrl.trim() : null,
    empty
  };
}
export function textingTermsVM(f) {
  const legal = f.legalName.trim();
  const trade = (f.tradeName ?? "").trim();
  const known = trade || legal || "This business";
  const empty = !identifiesABusiness(f);
  const phone = formatPhoneDisplay(f.publicPhoneE164);
  const email = f.contactEmail.trim();
  const support = [phone ? `call ${phone}` : null, email ? `email ${email}` : null].filter(Boolean).join(" or ");
  const entity = trade && trade !== legal ? `${legal}, trading as ${trade}` : legal;
  return {
    title: `Text messaging terms: ${known}`,
    lead: `These terms cover the text messages ${known} sends. ${known} is ${entity}${addressLine(f) ? `, ${addressLine(f)}` : ""}.`,
    items: [
      {
        label: "The program",
        text: `${known} texts customers who asked for it: replies to what they write, and confirmations and reminders about their own appointments. No offers or promotions are sent by text.`
      },
      {
        label: "How you join",
        text: `By texting START to ${known}'s number from your own phone, by writing to ${known} first, or by ticking and signing the box on its sign-up form. Consent is not a condition of any purchase.`
      },
      { label: "Message frequency", text: "Message frequency varies." },
      { label: "Cost", text: "Message and data rates may apply." },
      { label: "Help", text: `Reply HELP for help${support ? `, or ${support}` : ""}.` },
      { label: "Stop", text: `Reply STOP at any time to stop. ${known} confirms once and sends nothing more.` },
      { label: "Carriers", text: "Wireless carriers are not liable for delayed or undelivered messages." },
      { label: "Your information", text: SMS_CLAUSES[3] }
    ],
    privacyUrl: f.privacyUrl,
    closedLine: !empty && !takesSignUps(f.open) ? notTakingSignUps(known) : null,
    empty
  };
}
export function businessPageMetadata(f) {
  const vm = f ? businessPageVM(f) : null;
  if (!vm || vm.empty) return notFoundPageMetadata();
  return {
    title: vm.title,
    description: `${vm.title} \u2014 who we are, what we do, and our text-message terms.`,
    robots: { index: true, follow: true }
  };
}
export function textingTermsMetadata(f) {
  if (!f || textingTermsVM(f).empty) return notFoundPageMetadata();
  const name = businessPageVM(f).title;
  return {
    title: `Text messaging terms: ${name}`,
    description: `The terms of the text messages ${name} sends.`,
    robots: { index: true, follow: true }
  };
}
const loose = (s) => s.toLowerCase().replace(/\b(llc|inc|ltd|corp|co|the)\b/g, "").replace(/[^a-z0-9]/g, "");
export function registrationPreflight(f) {
  const out = [];
  const said = loose(f.workspaceName);
  const legal = loose(f.legalName);
  const trade = loose(f.tradeName ?? "");
  if (said && legal && said !== legal && (!trade || said !== trade)) {
    out.push({
      id: "name_mismatch",
      what: `The carriers will be told this business is called \u201C${f.workspaceName}\u201D, but the business on record is \u201C${f.tradeName?.trim() || f.legalName}\u201D.`,
      fix: "Save the business's name under Settings \u203A Business as it is on record, or put that name on record as its trading name, before filing. The name goes into the confirmation message customers receive, and that message cannot be changed after a filing without registering a new campaign."
    });
  }
  const answers = loose(f.receptionistName ?? "");
  if (said && answers && said !== answers) {
    out.push({
      id: "names_differ",
      what: `Your receptionist introduces the business as \u201C${(f.receptionistName ?? "").trim()}\u201D, but your sign-up page and this filing call it \u201C${f.workspaceName}\u201D.`,
      fix: "Save the name customers know you by under Settings \u203A Business: an owner's save renames your sign-up page and your sign too, so customers read one name."
    });
  }
  if (!identifiesABusiness(f)) {
    out.push({
      id: "no_identity",
      what: "The page the carriers will open to check who you are cannot be published: it needs your legal name and your address.",
      fix: "Fill in the legal name and the street address above. They are the two facts a reviewer looks for first."
    });
  }
  if ((f.about ?? "").trim().length < ABOUT_MIN) {
    out.push({
      id: "no_about",
      what: "The carriers can't tell what this business does: your page and your registration have no description of it.",
      fix: "Fill in \u201CWhat the business does\u201D above in two or three sentences: what you sell, who buys it, and how they pay."
    });
  }
  if (!f.hasOptInNumber) {
    out.push({
      id: "no_opt_in_number",
      what: "There is no number for customers to text to say yes, so the sign-up page has nothing to offer them.",
      fix: "Connect WhatsApp or finish setting up the phone line first. The carriers are told customers opt in by texting this business, and that has to be true."
    });
  }
  const site = (f.websiteUrl ?? "").trim();
  if (site && !/^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(site)) {
    out.push({
      id: "website_unusable",
      what: `\u201C${site}\u201D is not an address a reviewer can open.`,
      fix: "Write it in full, starting with https:// \u2014 or clear it, and we will publish a page for you instead."
    });
  }
  return out;
}
