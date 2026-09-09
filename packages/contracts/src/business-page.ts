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

/** The lead sentence, which is the only part that names who is sending. */
export function smsConsentSentence(businessName: string): string {
  return `${businessName}'s customers receive text messages only when they have contacted ${businessName} first, or when they have separately agreed to receive them — messages about their own appointments and promotional messages are asked for separately, and either can be declined without affecting the other.`;
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
  if (legal) identity.push({ label: "Legal name", value: trade && trade !== legal ? `${legal}, trading as ${trade}` : legal });
  const where = addressLine(f);
  if (where) identity.push({ label: "Address", value: where });
  const phone = formatPhoneDisplay(f.publicPhoneE164);
  if (phone) identity.push({ label: "Phone", value: phone, href: `tel:${f.publicPhoneE164}` });
  if (f.contactEmail.trim()) identity.push({ label: "Email", value: f.contactEmail.trim(), href: `mailto:${f.contactEmail.trim()}` });
  if (f.websiteUrl && f.websiteUrl.trim()) identity.push({ label: "Website", value: f.websiteUrl.trim(), href: f.websiteUrl.trim() });

  return {
    title: known || "This business",
    lead: empty
      ? "This business has not finished setting up yet."
      : `${known} answers its customers by phone, on WhatsApp and by text. This page says who they are and what those messages are.`,
    identity,
    services: f.services.slice(0, 40).map((s) => ({
      name: s.name,
      detail: [
        typeof s.durationMin === "number" && s.durationMin > 0 ? `${s.durationMin} min` : null,
        (s.priceNote ?? "").trim() || null,
      ].filter(Boolean).join(" · ") || null,
    })),
    smsLead: smsConsentSentence(known || "This business"),
    smsClauses: SMS_CLAUSES,
    optInUrl: f.optInUrl,
    websiteUrl: f.websiteUrl && f.websiteUrl.trim() ? f.websiteUrl.trim() : null,
    empty,
  };
}
