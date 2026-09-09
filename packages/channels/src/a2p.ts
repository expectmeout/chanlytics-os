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
import { businessTypeOf, companyTypeOf, industryOf } from "@chanlytics/contracts";

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
  /** The legal form, on Twilio's enum. */
  businessType: string;
  /** Ownership, on Twilio's enum. */
  companyType: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  /** E.164. */
  contactPhone: string;
  contactTitle: string;
  contactJobPosition: string;
}

export type BrandType = "STANDARD" | "SOLE_PROPRIETOR";

/** With a tax id a business is a standard brand; without one it is a sole proprietor. */
export function brandTypeFor(r: Pick<BusinessRecord, "ein">): BrandType {
  return r.ein && r.ein.trim() ? "STANDARD" : "SOLE_PROPRIETOR";
}

/**
 * A business with no tax id registers on a DIFFERENT path: a starter
 * profile on the sole-proprietor policy, and a one-time code the owner
 * reads off their own mobile. None of that is built here, and filing a
 * sole proprietor against the business policy produces a registration the
 * carriers reject — which, on a real filing, is a fee spent on nothing.
 * So it is refused before anything is created, by name.
 */
export function soleProprietorUnsupported(r: Pick<BusinessRecord, "ein">): boolean {
  return brandTypeFor(r) === "SOLE_PROPRIETOR";
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
 * There is no sole-proprietor code here on purpose: that registration is
 * refused by name (soleProprietorUnsupported) until its own path is built,
 * and a constant kept for a path nobody can take is just something to
 * maintain.
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
export function updateCampaignRequest(
  messagingServiceSid: string,
  campaignSid: string,
  f: Pick<CampaignFacts, "description" | "messageFlow" | "samples">,
): A2PRequest {
  const form: Record<string, string | string[]> = {
    Description: f.description,
    MessageFlow: f.messageFlow,
    HasEmbeddedLinks: "true",
    HasEmbeddedPhone: "true",
    AgeGated: "false",
    DirectLending: "false",
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

/**
 * The campaign cannot be filed until the carriers have finished with the
 * brand. That is a WAIT, not a refusal: everything asked for was accepted,
 * and the last step simply cannot run yet. Told apart here so the row says
 * "waiting on carriers" instead of "something went wrong".
 */
export function isBrandNotReady(error: string): boolean {
  return /until Brand is registered|Brand.*Current status:\s*(IN_PROGRESS|PENDING)/i.test(error);
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
  if (after === "rejected" || after === "failed") {
    return {
      kind: "alert",
      title: "The carriers sent your texting registration back",
      body: `${o.reason ? `They said: ${o.reason}. ` : ""}Open Connections, correct your business on record, and file it again. Calls and WhatsApp are unaffected.`,
      route: "admin/integrations",
      event: "line.texting_rejected",
    };
  }
  return null;
}
