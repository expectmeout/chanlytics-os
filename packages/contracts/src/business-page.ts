/**
 * A business's own public page, hosted by us — who they are, what they do, and
 * the text-message terms the carriers require somebody to publish.
 *
 * THE GAP THIS CLOSES, and it is the biggest one between "sign up" and "texting
 * works". Chanlytics' own campaign was refused four times, twice for reasons
 * about pages rather than about messages:
 *
 *   30919  PRIVACY_POLICY_URL — "the provided website does not contain
 *          sufficient business information"
 *   30907  the website URL did not match the brand and the campaign
 *
 * Answering those took a business-identification block on two pages, a workspace
 * rename, a slug change, and an SMS-terms section added to a marketing site in a
 * different repository. Every customer needs the equivalent: a website that
 * identifies them, and a privacy policy carrying carrier-required SMS language,
 * on a domain that matches their brand.
 *
 * Most salons have a Facebook page and a Booksy link. They cannot do this, and
 * asking them to is not a product — it is a reason they never text.
 *
 * So we host it, from facts they have already given us and that the carriers
 * have already vetted on the brand. It is the FLOOR, not the ceiling: a customer
 * with a real website keeps using it, and this page still exists beside it.
 *
 * Pure: the page feeds it the workspace's public facts, the tests feed it
 * fixtures.
 */
import { formatPhoneDisplay } from "./phone";
import { notFoundPageMetadata, type PublicPageMetadata } from "./chrome";

/**
 * The clauses every carrier review looks for, word for word.
 *
 * Identical wherever they appear — this page and Chanlytics' own privacy policy
 * both render them from here, because two copies of a compliance sentence is one
 * copy that will be edited and one that will not. The mobile-information clause
 * in particular is checked almost verbatim by reviewers and by CTIA's own
 * guidance, and "standard rates" is refused because it implies premium-rate
 * messaging, which no longer exists in the US.
 */
export const SMS_CLAUSES: readonly string[] = [
  "Message and data rates may apply.",
  "Message frequency varies.",
  "Reply STOP to stop and HELP for help.",
  "No mobile information will be shared with third parties or affiliates for marketing or promotional purposes; all other categories of sharing exclude text-messaging originator opt-in data and consent, which will not be shared with any third parties.",
];

/**
 * What the program collects and what it is used for. Error 30908's remedy asks a
 * privacy policy to "document what customer data you collect and how it's used";
 * the clause above says what is NOT done with it, and this says what is.
 */
export function dataSentences(businessName: string): string[] {
  return [
    `For text messages, ${businessName} keeps your mobile number, the messages you and it exchange, and your yes to messages, with the date and the way it was given.`,
    "They are used only to answer you, to send the messages you agreed to, and to honour a STOP. They are not sold, and they are not shared with third parties or affiliates for marketing or promotional purposes.",
  ];
}

/** The lead sentence, which is the only part that names who is sending. */
export function smsConsentSentence(businessName: string): string {
  return `${businessName}'s customers receive text messages only when they have contacted ${businessName} first, or when they have agreed to receive messages about their own appointments. No offers or promotions are sent by text: ${businessName}'s offers and news, for customers who ask for them, go by WhatsApp.`;
}

export interface BusinessPageFacts {
  /** From `business_records`, which the carriers vetted when the brand was registered. */
  legalName: string;
  tradeName: string | null;
  street: string;
  streetSecondary: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  contactEmail: string;
  /** The line customers reach them on, E.164; null before there is one. */
  publicPhoneE164: string | null;
  /** Their own website, when they have one. The page links to it rather than replacing it. */
  websiteUrl: string | null;
  /** What they do, from the receptionist's own profile. */
  services: readonly { name: string; durationMin?: number | null; priceNote?: string | null }[];
  /** Where a customer says yes: `/yes/<slug>`. */
  optInUrl: string;
  /** This page, which is what the campaign files as the business's privacy policy: `/b/<slug>`. */
  privacyUrl: string;
  /** The program's terms, beside it: `/b/<slug>/terms`. */
  termsUrl: string;
}

export interface BusinessPageVM {
  /** The trading name if there is one, because that is what customers call them. */
  title: string;
  /** One line: who this is and why the page exists. */
  lead: string;
  /** The four facts a reviewer scans for, as label/value pairs. */
  identity: { label: string; value: string; href?: string }[];
  services: { name: string; detail: string | null }[];
  smsLead: string;
  smsClauses: readonly string[];
  optInUrl: string;
  /** What the messaging program keeps about a customer and what for: the disclosure a privacy policy owes (30908). */
  yourData: string[];
  /** The program's own terms page. */
  termsUrl: string;
  /** Their own site, when they gave one. */
  websiteUrl: string | null;
  /** True when the record is too thin to publish honestly. */
  empty: boolean;
}

function addressLine(f: BusinessPageFacts): string {
  const parts = [f.street, f.streetSecondary, `${f.city}, ${f.region} ${f.postalCode}`.trim(), f.country]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

export function businessPageVM(f: BusinessPageFacts): BusinessPageVM {
  const legal = f.legalName.trim();
  const trade = (f.tradeName ?? "").trim();
  const known = trade || legal;
  // A page with no legal name and no address identifies nobody, which is exactly
  // what 30919 refused. Better to say there is nothing here than to publish a
  // page a reviewer will read as evasive.
  const empty = !legal || !f.street.trim() || !f.city.trim();

  const identity: BusinessPageVM["identity"] = [];
  if (legal)
    identity.push({ label: "Legal name", value: trade && trade !== legal ? `${legal}, trading as ${trade}` : legal });
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
    lead: empty
      ? "This business has not finished setting up yet."
      : `${known} answers its customers by phone, on WhatsApp and by text. This page says who they are and what those messages are.`,
    identity,
    services: f.services.slice(0, 40).map((s) => ({
      name: s.name,
      detail:
        [
          typeof s.durationMin === "number" && s.durationMin > 0 ? `${s.durationMin} min` : null,
          (s.priceNote ?? "").trim() || null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
    })),
    smsLead: smsConsentSentence(known || "This business"),
    smsClauses: SMS_CLAUSES,
    optInUrl: f.optInUrl,
    yourData: dataSentences(known || "This business"),
    termsUrl: f.termsUrl,
    websiteUrl: f.websiteUrl && f.websiteUrl.trim() ? f.websiteUrl.trim() : null,
    empty,
  };
}

/* -------------------------------------------------------------------------- *
 * The program's terms: `/b/<slug>/terms`.
 *
 * Every campaign files a TermsAndConditionsUrl, and from 30 June 2026 the field
 * is required. The reviewers' guide lists what the page must carry: the program
 * or brand name, what the program is, "Message and data rates may apply", the
 * frequency, how to get help, how to stop (HELP and STOP, in bold), a link to
 * the privacy policy, and that carriers are not liable for delayed or
 * undelivered messages -- and since 15 September 2026 each of those is its own
 * error code (30557 to 30563). Chanlytics' own /terms is a software agreement
 * for workspace owners and carries none of them, so filing it names the wrong
 * company's terms for the wrong reader. This page is the business's own.
 * -------------------------------------------------------------------------- */

export interface TextingTermsVM {
  title: string;
  /** Who is bound by these terms: the business, by its registered name and address. */
  lead: string;
  /** Each thing the carriers look for, in their order. HELP and STOP are set in bold by the page. */
  items: { label: string; text: string }[];
  /** The business's privacy page, `/b/<slug>`. */
  privacyUrl: string;
  /** True when the record is too thin to publish honestly. */
  empty: boolean;
}

export function textingTermsVM(f: BusinessPageFacts): TextingTermsVM {
  const legal = f.legalName.trim();
  const trade = (f.tradeName ?? "").trim();
  const known = trade || legal || "This business";
  const empty = !legal || !f.street.trim() || !f.city.trim();
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
        text: `${known} texts customers who asked for it: replies to what they write, and confirmations and reminders about their own appointments. No offers or promotions are sent by text.`,
      },
      {
        label: "How you join",
        text: `By texting START to ${known}'s number from your own phone, by writing to ${known} first, or by ticking and signing the box on its sign-up form. Consent is not a condition of any purchase.`,
      },
      { label: "Message frequency", text: "Message frequency varies." },
      { label: "Cost", text: "Message and data rates may apply." },
      { label: "Help", text: `Reply HELP for help${support ? `, or ${support}` : ""}.` },
      { label: "Stop", text: `Reply STOP at any time to stop. ${known} confirms once and sends nothing more.` },
      { label: "Carriers", text: "Wireless carriers are not liable for delayed or undelivered messages." },
      { label: "Your information", text: SMS_CLAUSES[3] },
    ],
    privacyUrl: f.privacyUrl,
    empty,
  };
}

/**
 * What `/b/<slug>`'s tab and search listing say, by the rule the page renders by: Not found, and unindexed, when there
 * is no record or it does not name a legal business with an address. An unknown slug left the tab on the app's own
 * title, and an unfinished record named Not found for the business and marked it indexable (the wiring audit's N21).
 */
export function businessPageMetadata(f: BusinessPageFacts | null): PublicPageMetadata {
  const vm = f ? businessPageVM(f) : null;
  if (!vm || vm.empty) return notFoundPageMetadata();
  return {
    title: vm.title,
    description: `${vm.title} — who we are, what we do, and our text-message terms.`,
    robots: { index: true, follow: true },
  };
}

/** The program's terms, by the same rule: named for the business customers know, or Not found and unindexed. */
export function textingTermsMetadata(f: BusinessPageFacts | null): PublicPageMetadata {
  if (!f || textingTermsVM(f).empty) return notFoundPageMetadata();
  const name = businessPageVM(f).title;
  return {
    title: `Text messaging terms: ${name}`,
    description: `The terms of the text messages ${name} sends.`,
    robots: { index: true, follow: true },
  };
}

/* -------------------------------------------------------------------------- *
 * The pre-flight: what the reviewer will check, checked first.
 *
 * A carrier rejection arrives DAYS later and says one thing at a time. The
 * first real campaign this product filed came back four times, and every one of
 * those rounds was a week — for faults that were all visible before anything was
 * sent:
 *
 *   30919  the page filed as the privacy policy did not identify a business
 *   30907  the website did not match the brand and the campaign
 *   30886  the description was refused
 *   30913  one consent covered marketing and everything else
 *
 * These are the ones that are still checkable from facts we hold, in under a
 * millisecond, with no network at all. Each answers in the OWNER'S words, saying
 * what is wrong and what to do, because a refusal a person cannot act on is the
 * thing that made the four rounds take a month.
 * -------------------------------------------------------------------------- */

export interface PreflightFacts {
  /** The name the CAMPAIGN will state — `tenants.name`, which is not the record's name. */
  workspaceName: string;
  /** The names on the record, which is what the BRAND is registered as. */
  legalName: string;
  tradeName: string | null;
  /** Enough of an address to identify a business on the hosted page. */
  street: string;
  city: string;
  /** Their own site, when they gave one. */
  websiteUrl: string | null;
  /** Whether a customer has any way to say yes: a number the opt-in page can name. */
  hasOptInNumber: boolean;
}

export interface PreflightProblem {
  id: "name_mismatch" | "no_identity" | "no_opt_in_number" | "website_unusable";
  /** What a reviewer will see, in the owner's words. */
  what: string;
  /** What to do about it. */
  fix: string;
}

/** Loose enough that "Melany's Salon" and "Melanys Salon LLC" are the same business. */
const loose = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(llc|inc|ltd|corp|co|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

export function registrationPreflight(f: PreflightFacts): PreflightProblem[] {
  const out: PreflightProblem[] = [];

  // THE ONE THAT BIT US. The campaign states `tenants.name`; the brand
  // registers `business_records.legal_name`. Chanlytics' own campaign went to
  // the carriers describing a business called "Billing probe" — a workspace name
  // from a Stripe test — while the brand said RJ Capital LLC. A reviewer reads
  // that as two businesses, and the opt-in message that carried it can never be
  // edited afterwards.
  const said = loose(f.workspaceName);
  const legal = loose(f.legalName);
  const trade = loose(f.tradeName ?? "");
  if (said && legal && said !== legal && (!trade || said !== trade)) {
    out.push({
      id: "name_mismatch",
      what: `The carriers will be told this business is called “${f.workspaceName}”, but the business on record is “${f.tradeName?.trim() || f.legalName}”.`,
      fix: "Make the workspace's name match the name on record before filing. The name goes into the confirmation message customers receive, and that message cannot be changed after a filing without registering a new campaign.",
    });
  }

  // The page we file as their website and privacy policy renders from these. No
  // legal name or no address and it answers 404, so the filing would name a URL
  // that does not exist — which is 30919, arriving a week later.
  if (!f.legalName.trim() || !f.street.trim() || !f.city.trim()) {
    out.push({
      id: "no_identity",
      what: "The page the carriers will open to check who you are cannot be published: it needs your legal name and your address.",
      fix: "Fill in the legal name and the street address above. They are the two facts a reviewer looks for first.",
    });
  }

  // The message flow tells the carriers customers opt in by texting a keyword to
  // this business. Without a number the opt-in page says the business is not set
  // up to take sign-ups — so the flow would describe something that does not
  // happen, which is a statement to a regulator that is not true.
  if (!f.hasOptInNumber) {
    out.push({
      id: "no_opt_in_number",
      what: "There is no number for customers to text to say yes, so the sign-up page has nothing to offer them.",
      fix: "Connect WhatsApp or finish setting up the phone line first. The carriers are told customers opt in by texting this business, and that has to be true.",
    });
  }

  // A website that is not a website is worse than none: with none we publish a
  // page for them, with a broken one we file it.
  const site = (f.websiteUrl ?? "").trim();
  if (site && !/^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(site)) {
    out.push({
      id: "website_unusable",
      what: `“${site}” is not an address a reviewer can open.`,
      fix: "Write it in full, starting with https:// — or clear it, and we will publish a page for you instead.",
    });
  }

  return out;
}
