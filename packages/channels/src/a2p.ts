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
 *
 * WHOSE ACCOUNT. Every call here is made as the WORKSPACE'S OWN subaccount,
 * which is what Twilio's ISV guide asks for: "create a Secondary Customer
 * Profile under the customer's subaccount and register a Brand under the
 * customer's subaccount". A brand registered on the parent is not shared
 * with the subaccount that owns the Messaging Service, and the campaign is
 * refused with 21717 — after the brand is registered and, on a real filing,
 * paid for. Chanlytics' own primary profile is not moved into the
 * subaccount; it is REFERENCED by sid, and that reference is the whole
 * declaration that this business is ours.
 */
import type { SchemaSet } from "@chanlytics/contracts";
import { businessTypeOf, companyTypeOf, industryOf, registrationPathOf } from "@chanlytics/contracts";

/** Trust Hub policies, by the names Twilio gives them. */
export const A2P_POLICIES = {
  /** The bundle one customer of an ISV gets. */
  secondaryCustomerProfile: "RNdfbf3fae0e1107f8aded0e7cead80bf5",
  /** The messaging profile a brand is registered from. */
  a2pMessaging: "RNb0d4771c2c98518d916a3d4cd70a8f8b",
  /**
   * A customer with no tax id registers on a PAIR of these instead, and it is
   * a pair -- half of it was here for months and the other half was missing,
   * which is why the path was refused rather than built.
   *
   * Verified against the live Policies API on 2026-09-09, because filing
   * against the wrong policy produces a registration that is refused after it
   * has been paid for:
   *
   *   RN806dd6... "Starter Customer Profile of type Business"
   *   RN670d5d... "Sole Proprietor TrustProduct"
   */
  starterCustomerProfile: "RN806dd6cd175f314e1f96a9727ee271f4",
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
  /** The legal form, on Twilio's enum. */
  businessType: string;
  /** Ownership, on Twilio's enum. */
  companyType: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  /** E.164. */
  /**
   * The owner's own mobile. The form has always labelled it "Mobile -- yours,
   * not the business line", and on a sole-proprietor registration that label
   * becomes load-bearing: the carriers TEXT this number and the owner has to
   * reply from it, so it must be a real handset. TCR also caps it at three
   * sole-proprietor registrations across every vendor, for ever.
   */
  contactPhone: string;
  contactTitle: string;
  contactJobPosition: string;
}

export type BrandType = "STANDARD" | "SOLE_PROPRIETOR";

/**
 * The carriers' word for the path this record is on.
 *
 * Delegates rather than deciding: the fork is `registrationPathOf` in
 * contracts, which the form and both validators also read, and a second
 * `r.ein && r.ein.trim()` here would be a second place for the two to
 * disagree about the same tax id. This maps one vocabulary onto the other and
 * nothing else.
 */
export function brandTypeFor(r: Pick<BusinessRecord, "ein">): BrandType {
  return registrationPathOf(r) === "sole_proprietor" ? "SOLE_PROPRIETOR" : "STANDARD";
}

export interface A2PRequest {
  url: string;
  method: "GET" | "POST" | "DELETE";
  /**
   * Form fields; the caller encodes them. A list is sent as REPEATED keys —
   * `MessageSamples=a&MessageSamples=b` — which is the only shape Twilio
   * parses. Indexed keys (`MessageSamples[0]`) come back as
   * "Unable to process JSON".
   */
  form?: Record<string, string | string[]>;
}

/** One place that knows how a list is written on the wire. */
export function encodeForm(form: Record<string, string | string[]>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(form)) {
    if (Array.isArray(v)) v.forEach((one) => q.append(k, one));
    else q.append(k, v);
  }
  return q.toString();
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
/**
 * The customer profile a business with no tax id gets.
 *
 * Same shape as customerProfileRequest, different policy -- and the difference
 * is the whole path: the Starter profile asks for a person (name, email,
 * phone) and an address, where the Secondary asks for a company, a tax id, an
 * authorised representative and a document proving the address.
 */
export function starterProfileRequest(o: { friendlyName: string; email: string; statusCallback?: string }): A2PRequest {
  return {
    url: `${TRUSTHUB}/CustomerProfiles`,
    method: "POST",
    form: {
      FriendlyName: o.friendlyName.slice(0, 64),
      Email: o.email,
      PolicySid: A2P_POLICIES.starterCustomerProfile,
      ...(o.statusCallback ? { StatusCallback: o.statusCallback } : {}),
    },
  };
}

/**
 * The person, for a starter profile. Four fields, verified from the policy's
 * own requirements rather than a guess: first_name, last_name, email,
 * phone_number.
 */
export function starterEndUserRequest(r: BusinessRecord): A2PRequest {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${r.contactFirstName} ${r.contactLastName}`.trim().slice(0, 64),
      Type: "starter_customer_profile_information",
      Attributes: attrs({
        first_name: r.contactFirstName,
        last_name: r.contactLastName,
        email: r.contactEmail,
        phone_number: r.contactPhone,
      }),
    },
  };
}

/** The messaging profile bundle a sole proprietor's brand is registered from. */
export function soleProprietorProfileRequest(o: { friendlyName: string; email: string; statusCallback?: string }): A2PRequest {
  return {
    url: `${TRUSTHUB}/TrustProducts`,
    method: "POST",
    form: {
      FriendlyName: o.friendlyName.slice(0, 64),
      Email: o.email,
      PolicySid: A2P_POLICIES.soleProprietor,
      ...(o.statusCallback ? { StatusCallback: o.statusCallback } : {}),
    },
  };
}

/**
 * The three facts the Sole Proprietor TrustProduct asks for, from its own
 * policy: brand_name, mobile_phone_number, vertical.
 *
 * The mobile is the whole reason this end user exists -- it is where the
 * carriers send the one-time code, and it is the field a business gets wrong
 * by giving the number customers call.
 */
export function soleProprietorEndUserRequest(r: BusinessRecord, industry: string): A2PRequest {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${r.tradeName || r.legalName} · sole proprietor`.slice(0, 64),
      Type: "sole_proprietor_information",
      Attributes: attrs({
        brand_name: r.tradeName || r.legalName,
        mobile_phone_number: r.contactPhone,
        vertical: industry,
      }),
    },
  };
}

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
        business_type: businessTypeOf(r.businessType),
        business_registration_identifier: "EIN",
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
const parsed = (req: A2PRequest): Record<string, unknown> => JSON.parse(String(req.form?.Attributes ?? "{}")) as Record<string, unknown>;
export function businessAttributes(r: BusinessRecord): Record<string, unknown> {
  return parsed(businessEndUserRequest(r));
}
/** The starter profile's one end user, refreshed the same way. */
export function starterAttributes(r: BusinessRecord): Record<string, unknown> {
  return parsed(starterEndUserRequest(r));
}
export function representativeAttributes(r: BusinessRecord): Record<string, unknown> {
  return parsed(representativeEndUserRequest(r));
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
  const companyType = companyTypeOf(o.companyType);
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${o.friendlyName} · A2P`.slice(0, 64),
      Type: "us_a2p_messaging_profile_information",
      Attributes: attrs({ company_type: companyType }),
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
/**
 * `skipVetting` is a MONEY decision, so it is stated rather than defaulted.
 *
 * Twilio runs an automatic secondary vetting on a standard brand unless told
 * not to, and it is the expensive half of registering a business: the first
 * real filing this product made cost $46.00 in two one-time events, of which
 * the brand registration itself is $4.
 *
 * What the vetting buys is a brand SCORE, and a score only buys throughput --
 * T-Mobile's higher daily tiers. That filing came back with a score of 46,
 * below the threshold where the tier changes, on a LOW_VOLUME campaign whose
 * whole point is that it sends a handful of messages a day. So it bought
 * nothing, for every customer, for ever.
 *
 * A brand can be vetted later (the Vettings endpoint) if a workspace ever needs
 * the throughput. Paying up front for every salon, in case one of them turns
 * into a sender, is the wrong way round.
 */
export function brandRequest(o: { customerProfileBundleSid: string; a2pProfileBundleSid: string; brandType: BrandType; mock: boolean; skipVetting: boolean }): A2PRequest {
  return {
    url: `${MESSAGING}/a2p/BrandRegistrations`,
    method: "POST",
    form: {
      CustomerProfileBundleSid: o.customerProfileBundleSid,
      A2PProfileBundleSid: o.a2pProfileBundleSid,
      BrandType: o.brandType,
      ...(o.skipVetting ? { SkipAutomaticSecVet: "true" } : {}),
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

/**
 * A keyword is one word.
 *
 * The carriers refuse anything with a space — "Opt In Keywords must contain
 * either alphanumeric or accented characters" — and they refuse it at the
 * campaign, after the brand is registered. Our own opt-in phrase is two
 * words ("YES OFFERS"), which belongs in the message flow, where it is
 * explained, and not in this field. So only single words are declared, and
 * only ones the product actually honours.
 */
export function keywordsFor(words: readonly string[]): string[] {
  return words.map((w) => w.trim()).filter((w) => /^[A-Za-z0-9]+$/.test(w));
}

/**
 * Twilio's code for a small business sending a bit of everything.
 *
 * The same use case for both registrations. A sole proprietor's ceiling is set
 * by the BRAND -- one campaign, one number, a thousand messages a day on
 * T-Mobile: SOLE_PROP_LIMITS, in contracts -- not by the use case, so there is
 * nothing to choose here, and choosing anyway would be a second place for the
 * two paths to disagree.
 */
export const LOW_VOLUME_USECASE = "LOW_VOLUME";

export function campaignRequest(f: CampaignFacts): A2PRequest {
  const form: Record<string, string | string[]> = {
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
  // Repeated keys, the way Twilio's form encoding takes a list.
  form.MessageSamples = f.samples.slice(0, 5);
  const keywords = keywordsFor(f.optInKeywords);
  if (keywords.length) form.OptInKeywords = keywords;
  else delete form.OptInMessage;
  return { url: `${MESSAGING}/Services/${f.messagingServiceSid}/Compliance/Usa2p`, method: "POST", form };
}

/**
 * Correct a campaign the carriers sent back, and resubmit it.
 *
 * NOT a delete and a re-create, and the difference is money. Twilio assesses
 * the campaign vetting fee ONCE PER CAMPAIGN, at its first vetting decision:
 *
 *   "A vetting fee is assessed only once per Campaign. So if a Campaign is
 *    rejected its important to resubmit it rather than deleting and recreating
 *    a new campaign."
 *
 * A replacement campaign is a new submission and is charged again ($15 on the
 * first one this product filed). An edit of the same QE resource is not. So a
 * rejection costs nothing to answer, however many times it takes -- which is
 * the right shape anyway, because a rejection is a correction request and the
 * corrections are usually one line of copy.
 *
 * All seven fields are required on every update, including the four booleans;
 * a campaign TCR has already approved may not change those, so they are passed
 * back exactly as they were sent.
 */
/**
 * Correct a campaign in place, which is the whole remedy for a refused one.
 *
 * EVERYTHING TWILIO WILL ACCEPT, and no more. Their documentation is explicit
 * about both halves: the update takes the description, the message flow, the
 * samples, the four booleans and the two policy URLs -- and "any parameters
 * included in the original Campaign CREATE call, but not specifically mentioned
 * in the update table, cannot be edited under any circumstances", naming opt-in,
 * opt-out and help information and the use case. Those need a delete and a
 * recreate, which is a second vetting fee.
 *
 * The two URLs were being dropped, and the map of this file called that out:
 * seven of the fourteen fields the create sends were written once and could
 * never be corrected. Two of them can be, and now are. A campaign filed from an
 * edge deployment whose DASHBOARD_ORIGIN was unset carries a wrong privacy URL
 * permanently otherwise.
 *
 * Editing a FAILED campaign is free: "a vetting fee is assessed only once per
 * Campaign."
 */
export function updateCampaignRequest(
  messagingServiceSid: string,
  campaignSid: string,
  f: Pick<CampaignFacts, "description" | "messageFlow" | "samples" | "privacyPolicyUrl" | "termsUrl">,
): A2PRequest {
  const form: Record<string, string | string[]> = {
    Description: f.description,
    MessageFlow: f.messageFlow,
    HasEmbeddedLinks: "true",
    HasEmbeddedPhone: "true",
    AgeGated: "false",
    DirectLending: "false",
    PrivacyPolicyUrl: f.privacyPolicyUrl,
    TermsAndConditionsUrl: f.termsUrl,
  };
  form.MessageSamples = f.samples.slice(0, 5);
  return { url: `${MESSAGING}/Services/${messagingServiceSid}/Compliance/Usa2p/${campaignSid}`, method: "POST", form };
}

/**
 * Take the campaign off a Messaging Service.
 *
 * A service holds ONE campaign, so a second POST is refused while the first is
 * there. That is only a problem for the one case this exists for: a filing made
 * against Twilio's mock registry, which never routes a real message and expires
 * in thirty days, being replaced by a real one. A real campaign is never
 * deleted from here — it was paid for and vetted, and the caller refuses the
 * whole operation before reaching this.
 *
 * The INSTANCE url, not the collection. The collection answers 405 with error
 * 20004 ("does not support the attempted HTTP method DELETE"), which the caller
 * treated as best-effort and swallowed — so the mock campaign stayed on the
 * service and the refile went on to be refused a step later. Verified against
 * the live API on 2026-09-09: the instance url answers 204 and the service's
 * compliance list is then empty.
 */
export function deleteCampaignRequest(messagingServiceSid: string, campaignSid: string): A2PRequest {
  return { url: `${MESSAGING}/Services/${messagingServiceSid}/Compliance/Usa2p/${campaignSid}`, method: "DELETE" };
}

/* --------------------------- the state machine --------------------------- */

export type A2PStep = SchemaSet<"lines.reg_step">;
/** In the order the saga walks them; schema-agreement.ts holds them to the column. */
export const A2P_STEPS = ["profile", "business", "representative", "address", "document", "primary", "submit", "a2p_profile", "brand", "campaign"] as const;

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

/**
 * The first step whose receipt is missing; null when the registration is filed.
 *
 * TWO LISTS, because there are two registrations. A business with a tax id
 * files a company: its name, its EIN, an authorised representative who signs
 * for it, and a document proving the address. A sole proprietor files a
 * PERSON: their name, their email, their address, and the mobile the carriers
 * will text. Neither is a subset of the other, so this is a fork rather than a
 * flag -- and the shared steps (address, primary, submit, brand, campaign) are
 * genuinely shared, which is why one function still answers for both.
 */
export function nextA2PStep(s: A2PState, brandType: BrandType = "STANDARD"): A2PStep | null {
  if (brandType === "SOLE_PROPRIETOR") {
    if (!s.profileSid) return "profile";
    // The person, not a business and not a representative: the starter policy
    // asks for one end user carrying four fields.
    if (!s.businessSid) return "business";
    if (!s.addressSid) return "address";
    if (!s.documentSid) return "document";
    if (!s.primaryAssigned) return "primary";
    if (!s.profileSubmitted) return "submit";
    if (!s.a2pProfileSid) return "a2p_profile";
    if (!s.brandSid) return "brand";
    if (!s.campaignSid) return "campaign";
    return null;
  }
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

/**
 * The campaign cannot be filed until the carriers have finished with the
 * brand. That is a WAIT, not a refusal: everything asked for was accepted,
 * and the last step simply cannot run yet. Told apart here so the row says
 * "waiting on carriers" instead of "something went wrong".
 */
export function isBrandNotReady(error: string): boolean {
  return /until Brand is registered|Brand.*Current status:\s*(IN_PROGRESS|PENDING)/i.test(error);
}

/**
 * Why the carriers refused, in their own words -- or null when nothing was
 * refused.
 *
 * THE DEFECT THIS EXISTS FOR. The sweep read `brand.failure_reason` and nothing
 * else, so a refused CAMPAIGN -- which is most of them, and the only kind that
 * can be fixed and resent -- fell through to the generic
 * "the carriers sent the registration back". That sentence is what the owner's
 * row showed, what the bell said, and what the back office had to work from:
 * a rejection with the reason deleted, which is the same thing as no rejection
 * notice at all. Twilio had the answer the whole time, in
 * `compliance[0].errors[]`, one level below where anyone looked -- the same
 * mistake, in the same object, that once left every text held for weeks.
 *
 * The carriers' own description is kept verbatim apart from their standard
 * preamble ("The campaign submission has been reviewed and it was rejected
 * because ..."), which repeats on every error and pushes the substance past
 * where anybody reads. Stripped only when it matches exactly; anything
 * unfamiliar is passed through untouched rather than mangled.
 */
export interface CampaignError {
  description?: string | null;
  error_code?: number | string | null;
  fields?: readonly string[] | null;
}

// The trailing whitespace is \s* rather than a literal space: a description that
// is ONLY the preamble did not match, so the boilerplate this exists to remove
// was the one thing that survived it -- and with a code appended it read as a
// rejection reason that says nothing at all.
const PREAMBLE = /^the campaign submission has been reviewed and (?:it was )?rejected because\s*(?:of\s*)?/i;

export function refusalWords(o: {
  brandFailureReason?: string | null;
  campaignErrors?: readonly CampaignError[] | null;
}): string | null {
  const parts: string[] = [];
  const brand = (o.brandFailureReason ?? "").trim();
  if (brand) parts.push(brand);
  for (const e of o.campaignErrors ?? []) {
    const said = String(e?.description ?? "");
    // A trailing full stop before the code reads as a false sentence end.
    const body = said.replace(PREAMBLE, "").trim().replace(/\.$/, "").trim();
    // Nothing left once the boilerplate is gone: contributing an empty string
    // here would make the whole result a non-null empty string, and every caller
    // uses `?? fallback` -- which an empty string sails straight past.
    if (!body) continue;
    // The code and the field are what a resubmit is aimed at, so they travel
    // with the sentence rather than in a log line nobody opens.
    const tags = [e?.error_code == null ? null : String(e.error_code), ...(e?.fields ?? [])].filter(Boolean);
    parts.push(tags.length ? `${body} (${tags.join(" · ")})` : body);
  }
  if (!parts.length) return null;
  return parts.join("; ");
}

/** Twilio's brand and campaign statuses, in the words `lines.sms_state` uses. */
export type SmsRegistrationState = "registering" | "approved" | "active" | "rejected" | "failed";

export function smsStateFor(o: { brandStatus?: string | null; campaignStatus?: string | null; mock?: boolean }): SmsRegistrationState {
  const brand = (o.brandStatus ?? "").toUpperCase();
  const campaign = (o.campaignStatus ?? "").toUpperCase();
  if (brand === "FAILED" || campaign === "FAILED") return "rejected";
  if (brand === "SUSPENDED") return "failed";
  // A verified campaign IS the permission, and the number is already in the
  // Messaging Service, so the line can answer now. Returning "approved" here
  // left every text held for ever: the inbound path only answers on "active",
  // and nothing moved a line from one to the other.
  //
  // Unless it is a REHEARSAL. `active` is not a badge, it is an instruction:
  // the inbound path stops holding texts for a person and the receptionist
  // starts answering them. A campaign filed against the test registry verifies
  // itself within minutes and can carry nothing, so every one of those answers
  // would be rejected by the carriers and the customer would get silence.
  // A verified mock has proved everything a rehearsal can prove, which is what
  // `approved` means.
  if (campaign === "VERIFIED") return o.mock ? "approved" : "active";
  // Two quite different waits were one word. The business being approved is
  // the slow half and the half that can be refused; once it is through, what
  // is left is the campaign, which is days rather than weeks.
  if (brand === "APPROVED") return "approved";
  return "registering";
}

/**
 * What the carriers just decided, in the owner's words — or nothing, when
 * the answer is the same as last hour. The sweep runs hourly; a bell that
 * rang every hour would be noise, and the one that matters would be lost
 * in it.
 */
export function registrationVerdict(
  before: string,
  after: SmsRegistrationState,
  o: { number: string | null; reason?: string | null; mock?: boolean },
): { kind: "number" | "alert"; title: string; body: string; route: string; event: "line.texting_on" | "line.texting_rejected" | "line.texting_approved" } | null {
  if (before === after) return null;
  const num = o.number ?? "your line";
  const rehearsal = o.mock ? " (this was a test filing, so nothing routes)" : "";
  if (after === "active") {
    return {
      kind: "number",
      title: `Texting is on: ${num}`,
      body: `The carriers approved ${num}, so the receptionist answers texts to it inside your hours${rehearsal}. Customers who text first are answered; offers go only to people who said yes.`,
      route: "admin/integrations",
      event: "line.texting_on",
    };
  }
  if (after === "approved") {
    return {
      kind: "number",
      title: "Your business is approved by the carriers",
      body: `${num} is through the slow half. One last check on the line is left, usually days; nothing is needed from you, and texting switches itself on when it clears.`,
      route: "admin/integrations",
      event: "line.texting_approved",
    };
  }
  // TWO different states, and one of them is not the owner's to fix. `rejected`
  // is a correction request: change something and send it again. `failed` is a
  // SUSPENDED brand (smsStateFor), which no owner can act on -- and telling them
  // to "correct your business on record and file it again" sends somebody to
  // edit a form that will change nothing, twice, before they call us. The rest
  // of the product already says the right thing about `failed` (textingWords:
  // "a person at Chanlytics has it"); this used to be the one place that did
  // not.
  if (after === "rejected") {
    return {
      kind: "alert",
      title: "The carriers sent your texting registration back",
      body: `${o.reason ? `They said: ${o.reason}. ` : ""}Open Connections, correct your business on record, and file it again. Calls and WhatsApp are unaffected.`,
      route: "admin/integrations",
      event: "line.texting_rejected",
    };
  }
  if (after === "failed") {
    return {
      kind: "alert",
      title: "Your texting registration stopped",
      body: `${o.reason ? `The carriers said: ${o.reason}. ` : ""}A person at Chanlytics has it — there is nothing for you to do. Calls and WhatsApp are unaffected.`,
      route: "admin/integrations",
      event: "line.texting_rejected",
    };
  }
  return null;
}
