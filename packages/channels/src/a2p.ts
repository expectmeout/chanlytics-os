/**
 * A2P 10DLC: registering one workspace with the carriers, as pure parts.
 *
 * The shape of it, from Twilio's ISV walkthrough: the business on record
 * becomes a secondary customer profile under Chanlytics' own approved
 * primary profile, that profile carries the business, the person who
 * signs for it and the address, it is evaluated and submitted, an A2P
 * messaging profile is built beside it, a brand is registered from the
 * two, and a campaign is attached to the line's Messaging Service. Each
 * step records what it made before the next runs, so a resumed
 * registration repeats nothing and pays nothing twice.
 *
 * Policy ids read from Twilio's own Policies endpoint on 2026-09-08, not
 * copied from a blog. Request shapes verified the same day against the
 * ISV onboarding guide, the BrandRegistrations resource and the
 * UsAppToPerson resource.
 */

/** Trust Hub policies, by the names Twilio gives them. */
export const A2P_POLICIES = {
  /** The bundle one customer of an ISV gets. */
  secondaryCustomerProfile: "RNdfbf3fae0e1107f8aded0e7cead80bf5",
  /** The messaging profile a brand is registered from. */
  a2pMessaging: "RNb0d4771c2c98518d916a3d4cd70a8f8b",
  /** A customer with no tax id registers on this one instead. */
  soleProprietor: "RN670d5d2e282a6130ae063b234b6019c8",
} as const;

export const TRUSTHUB = "https://trusthub.twilio.com/v1";
export const MESSAGING = "https://messaging.twilio.com/v1";

/** What every registration asks of a business, collected once and reused. */
export interface BusinessRecord {
  /** The name on the tax filing, not the trading name. */
  legalName: string;
  /** The trading name customers know, when it differs. */
  tradeName?: string | null;
  /** An EIN, or null for a sole proprietor with no tax id. */
  ein: string | null;
  street: string;
  streetSecondary?: string | null;
  city: string;
  /** Two-letter state or province. */
  region: string;
  postalCode: string;
  /** ISO 3166 alpha-2. */
  country: string;
  /** The page a reviewer opens; the workspace's own sign-up page when it has no site. */
  websiteUrl: string;
  /** Twilio's industry vocabulary. */
  industry: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  /** E.164. */
  contactPhone: string;
  contactTitle: string;
  contactJobPosition: string;
}

/**
 * The industries Twilio's Trust Hub accepts, exactly as it spells them. A
 * value outside this list is refused at the evaluation with "The Business
 * Industry is invalid", after every other step has already been made and
 * paid for, so the form offers these and nothing else.
 */
export const BUSINESS_INDUSTRIES = [
  "AGRICULTURE", "AUTOMOTIVE", "BANKING", "CONSTRUCTION", "CONSUMER", "EDUCATION", "ELECTRONICS",
  "ENERGY", "ENGINEERING", "FAST_MOVING_CONSUMER_GOODS", "FINANCIAL", "FINTECH", "FOOD_AND_BEVERAGE",
  "GOVERNMENT", "HEALTHCARE", "HOSPITALITY", "INSURANCE", "JEWELRY", "LEGAL", "MANUFACTURING",
  "MEDIA", "NOT_FOR_PROFIT", "OIL_AND_GAS", "ONLINE", "PROFESSIONAL_SERVICES", "RAW_MATERIALS",
  "REAL_ESTATE", "RELIGION", "RETAIL", "TECHNOLOGY", "TELECOMMUNICATIONS", "TRANSPORTATION", "TRAVEL",
] as const;
export type BusinessIndustry = (typeof BUSINESS_INDUSTRIES)[number];
/** What a small local business is, unless it says otherwise. */
export const DEFAULT_INDUSTRY: BusinessIndustry = "PROFESSIONAL_SERVICES";

/** The value Twilio will accept, or the default — never a guess it refuses. */
export function industryOf(v: string | null | undefined): BusinessIndustry {
  const up = String(v ?? "").trim().toUpperCase();
  return (BUSINESS_INDUSTRIES as readonly string[]).includes(up) ? (up as BusinessIndustry) : DEFAULT_INDUSTRY;
}

export type BrandType = "STANDARD" | "SOLE_PROPRIETOR";

/** With a tax id a business is a standard brand; without one it is a sole proprietor. */
export function brandTypeFor(r: Pick<BusinessRecord, "ein">): BrandType {
  return r.ein && r.ein.trim() ? "STANDARD" : "SOLE_PROPRIETOR";
}

export interface A2PRequest {
  url: string;
  method: "GET" | "POST";
  /** Form fields; the caller encodes them. */
  form?: Record<string, string>;
}

const attrs = (o: Record<string, unknown>) => JSON.stringify(o);

/** The customer's own bundle, under our primary profile. */
export function customerProfileRequest(o: { friendlyName: string; email: string; statusCallback?: string }): A2PRequest {
  return {
    url: `${TRUSTHUB}/CustomerProfiles`,
    method: "POST",
    form: {
      FriendlyName: o.friendlyName.slice(0, 64),
      // Twilio asks for the ISV's address here, not the customer's: we are
      // the one it writes to about the bundle.
      Email: o.email,
      PolicySid: A2P_POLICIES.secondaryCustomerProfile,
      ...(o.statusCallback ? { StatusCallback: o.statusCallback } : {}),
    },
  };
}

/** The business itself, in the carriers' vocabulary. */
export function businessEndUserRequest(r: BusinessRecord): A2PRequest {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${r.legalName} · business`.slice(0, 64),
      Type: "customer_profile_business_information",
      Attributes: attrs({
        business_name: r.legalName,
        social_media_profile_urls: "",
        website_url: r.websiteUrl,
        business_regions_of_operation: "USA_AND_CANADA",
        business_type: r.ein ? "Limited Liability Corporation" : "Sole Proprietorship",
        business_registration_identifier: r.ein ? "EIN" : "USA:EIN",
        business_identity: "direct_customer",
        business_industry: industryOf(r.industry),
        business_registration_number: r.ein ?? "",
      }),
    },
  };
}

/** The person who signs for it. */
export function representativeEndUserRequest(r: BusinessRecord): A2PRequest {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${r.contactFirstName} ${r.contactLastName}`.slice(0, 64),
      Type: "authorized_representative_1",
      Attributes: attrs({
        job_position: r.contactJobPosition,
        last_name: r.contactLastName,
        phone_number: r.contactPhone,
        first_name: r.contactFirstName,
        email: r.contactEmail,
        business_title: r.contactTitle,
      }),
    },
  };
}

/** The address as an account resource, which the supporting document points at. */
export function addressRequest(accountSid: string, r: BusinessRecord): A2PRequest {
  return {
    url: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Addresses.json`,
    method: "POST",
    form: {
      FriendlyName: r.legalName.slice(0, 64),
      CustomerName: r.legalName.slice(0, 64),
      Street: r.street,
      ...(r.streetSecondary ? { StreetSecondary: r.streetSecondary } : {}),
      City: r.city,
      Region: r.region,
      PostalCode: r.postalCode,
      IsoCountry: r.country,
    },
  };
}

export function supportingDocumentRequest(o: { legalName: string; addressSid: string }): A2PRequest {
  return {
    url: `${TRUSTHUB}/SupportingDocuments`,
    method: "POST",
    form: {
      FriendlyName: `${o.legalName} · address`.slice(0, 64),
      Type: "customer_profile_address",
      Attributes: attrs({ address_sids: o.addressSid }),
    },
  };
}

/**
 * The business and the person, as they stand now.
 *
 * An owner who corrects a typo after the first attempt would otherwise be
 * evaluated on what they first typed: the end users are made once and the
 * saga skips a step whose receipt it already holds. So the current record
 * is pushed onto them again just before the profile is submitted, which is
 * the last moment it can still matter.
 */
export function updateEndUserRequest(sid: string, attributes: Record<string, unknown>): A2PRequest {
  return { url: `${TRUSTHUB}/EndUsers/${sid}`, method: "POST", form: { Attributes: attrs(attributes) } };
}

/** The attributes each end user carries, so the create and the update cannot drift. */
export function businessAttributes(r: BusinessRecord): Record<string, unknown> {
  return JSON.parse(businessEndUserRequest(r).form!.Attributes) as Record<string, unknown>;
}
export function representativeAttributes(r: BusinessRecord): Record<string, unknown> {
  return JSON.parse(representativeEndUserRequest(r).form!.Attributes) as Record<string, unknown>;
}

/** Everything a bundle carries is attached the same way. */
export function assignRequest(bundleSid: string, objectSid: string): A2PRequest {
  return { url: `${TRUSTHUB}/CustomerProfiles/${bundleSid}/EntityAssignments`, method: "POST", form: { ObjectSid: objectSid } };
}

export function trustProductAssignRequest(bundleSid: string, objectSid: string): A2PRequest {
  return { url: `${TRUSTHUB}/TrustProducts/${bundleSid}/EntityAssignments`, method: "POST", form: { ObjectSid: objectSid } };
}

/** Ask Twilio whether the bundle is complete before submitting it. */
export function evaluateRequest(bundleSid: string, policySid: string = A2P_POLICIES.secondaryCustomerProfile): A2PRequest {
  return { url: `${TRUSTHUB}/CustomerProfiles/${bundleSid}/Evaluations`, method: "POST", form: { PolicySid: policySid } };
}

export function submitProfileRequest(bundleSid: string): A2PRequest {
  return { url: `${TRUSTHUB}/CustomerProfiles/${bundleSid}`, method: "POST", form: { Status: "pending-review" } };
}

/** The messaging profile a brand is registered from. */
export function a2pProfileRequest(o: { friendlyName: string; email: string; statusCallback?: string }): A2PRequest {
  return {
    url: `${TRUSTHUB}/TrustProducts`,
    method: "POST",
    form: {
      FriendlyName: `${o.friendlyName} · A2P`.slice(0, 64),
      Email: o.email,
      PolicySid: A2P_POLICIES.a2pMessaging,
      ...(o.statusCallback ? { StatusCallback: o.statusCallback } : {}),
    },
  };
}

export function a2pProfileEndUserRequest(o: { friendlyName: string; companyType: string }): A2PRequest {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${o.friendlyName} · A2P`.slice(0, 64),
      Type: "us_a2p_messaging_profile_information",
      Attributes: attrs({ company_type: o.companyType }),
    },
  };
}

export function evaluateTrustProductRequest(bundleSid: string): A2PRequest {
  return { url: `${TRUSTHUB}/TrustProducts/${bundleSid}/Evaluations`, method: "POST", form: { PolicySid: A2P_POLICIES.a2pMessaging } };
}

export function submitTrustProductRequest(bundleSid: string): A2PRequest {
  return { url: `${TRUSTHUB}/TrustProducts/${bundleSid}`, method: "POST", form: { Status: "pending-review" } };
}

/**
 * The brand. `mock` registers against Twilio's test registry: free, never
 * routes a real message, and gone after thirty days — which is how this
 * whole path is exercised before a customer pays for anything.
 */
export function brandRequest(o: { customerProfileBundleSid: string; a2pProfileBundleSid: string; brandType: BrandType; mock: boolean }): A2PRequest {
  return {
    url: `${MESSAGING}/a2p/BrandRegistrations`,
    method: "POST",
    form: {
      CustomerProfileBundleSid: o.customerProfileBundleSid,
      A2PProfileBundleSid: o.a2pProfileBundleSid,
      BrandType: o.brandType,
      ...(o.mock ? { Mock: "true" } : {}),
    },
  };
}

/** What the campaign says about the messages this workspace will send. */
export interface CampaignFacts {
  brandSid: string;
  messagingServiceSid: string;
  /** What the receptionist does, in a reviewer's words. */
  description: string;
  /** How a customer comes to be on the list. */
  messageFlow: string;
  /** Two to five real examples. */
  samples: string[];
  optInMessage: string;
  optInKeywords: string[];
  privacyPolicyUrl: string;
  termsUrl: string;
  useCase: string;
}

/** Twilio's code for a small business sending a bit of everything. */
export const LOW_VOLUME_USECASE = "LOW_VOLUME";
export const SOLE_PROPRIETOR_USECASE = "SOLE_PROPRIETOR";

export function campaignRequest(f: CampaignFacts): A2PRequest {
  const form: Record<string, string> = {
    BrandRegistrationSid: f.brandSid,
    Description: f.description,
    MessageFlow: f.messageFlow,
    UsAppToPersonUsecase: f.useCase,
    HasEmbeddedLinks: "true",
    HasEmbeddedPhone: "true",
    SubscriberOptIn: "true",
    AgeGated: "false",
    DirectLending: "false",
    OptInMessage: f.optInMessage,
    PrivacyPolicyUrl: f.privacyPolicyUrl,
    TermsAndConditionsUrl: f.termsUrl,
  };
  // Repeated fields, the way Twilio's form encoding takes a list.
  f.samples.slice(0, 5).forEach((s, i) => { form[`MessageSamples[${i}]`] = s; });
  f.optInKeywords.forEach((k, i) => { form[`OptInKeywords[${i}]`] = k; });
  return { url: `${MESSAGING}/Services/${f.messagingServiceSid}/Compliance/Usa2p`, method: "POST", form };
}

/* --------------------------- the state machine --------------------------- */

export type A2PStep = "profile" | "business" | "representative" | "address" | "document" | "primary" | "submit" | "a2p_profile" | "brand" | "campaign";
export const A2P_STEPS: readonly A2PStep[] = ["profile", "business", "representative", "address", "document", "primary", "submit", "a2p_profile", "brand", "campaign"];

/** What the registration has made so far. Every field is a receipt for one step. */
export interface A2PState {
  profileSid: string | null;
  businessSid: string | null;
  representativeSid: string | null;
  addressSid: string | null;
  documentSid: string | null;
  primaryAssigned: boolean;
  profileSubmitted: boolean;
  a2pProfileSid: string | null;
  brandSid: string | null;
  campaignSid: string | null;
}

export const EMPTY_A2P_STATE: A2PState = {
  profileSid: null, businessSid: null, representativeSid: null, addressSid: null, documentSid: null,
  primaryAssigned: false, profileSubmitted: false, a2pProfileSid: null, brandSid: null, campaignSid: null,
};

/** The first step whose receipt is missing; null when the registration is filed. */
export function nextA2PStep(s: A2PState): A2PStep | null {
  if (!s.profileSid) return "profile";
  if (!s.businessSid) return "business";
  if (!s.representativeSid) return "representative";
  if (!s.addressSid) return "address";
  if (!s.documentSid) return "document";
  if (!s.primaryAssigned) return "primary";
  if (!s.profileSubmitted) return "submit";
  if (!s.a2pProfileSid) return "a2p_profile";
  if (!s.brandSid) return "brand";
  if (!s.campaignSid) return "campaign";
  return null;
}

/** Twilio's brand and campaign statuses, in the words `lines.sms_state` uses. */
export function smsStateFor(o: { brandStatus?: string | null; campaignStatus?: string | null }): "registering" | "approved" | "rejected" | "failed" {
  const brand = (o.brandStatus ?? "").toUpperCase();
  const campaign = (o.campaignStatus ?? "").toUpperCase();
  if (brand === "FAILED" || campaign === "FAILED") return "rejected";
  if (brand === "SUSPENDED") return "failed";
  if (campaign === "VERIFIED") return "approved";
  return "registering";
}
