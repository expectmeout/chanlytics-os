/**
 * The Trust Hub half of a registration, as requests: the customer profile (secondary or starter), the end users it
 * carries, the address and its supporting document, the A2P messaging profile, and the assignments, evaluations and
 * submissions that bind them. The brand and the campaign filed from them are brand-campaign.ts; the policies, the
 * hosts and the request's shape are wire.ts.
 */
import { businessTypeOf, companyTypeOf, industryOf } from "@chanlytics/contracts";
import type { BusinessRecord } from "./business-record";
import { A2P_POLICIES, TRUSTHUB, type A2PRequest } from "./wire";

const attrs = (o: Record<string, unknown>) => JSON.stringify(o);

/** The customer's own bundle, under our primary profile. */
export function customerProfileRequest(o: {
  friendlyName: string;
  email: string;
  statusCallback?: string;
}): A2PRequest {
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
export function soleProprietorProfileRequest(o: {
  friendlyName: string;
  email: string;
  statusCallback?: string;
}): A2PRequest {
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
const parsed = (req: A2PRequest): Record<string, unknown> =>
  JSON.parse(String(req.form?.Attributes ?? "{}")) as Record<string, unknown>;
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
  return {
    url: `${TRUSTHUB}/CustomerProfiles/${bundleSid}/EntityAssignments`,
    method: "POST",
    form: { ObjectSid: objectSid },
  };
}

export function trustProductAssignRequest(bundleSid: string, objectSid: string): A2PRequest {
  return {
    url: `${TRUSTHUB}/TrustProducts/${bundleSid}/EntityAssignments`,
    method: "POST",
    form: { ObjectSid: objectSid },
  };
}

/** Ask Twilio whether the bundle is complete before submitting it. */
export function evaluateRequest(
  bundleSid: string,
  policySid: string = A2P_POLICIES.secondaryCustomerProfile,
): A2PRequest {
  return {
    url: `${TRUSTHUB}/CustomerProfiles/${bundleSid}/Evaluations`,
    method: "POST",
    form: { PolicySid: policySid },
  };
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
  return {
    url: `${TRUSTHUB}/TrustProducts/${bundleSid}/Evaluations`,
    method: "POST",
    form: { PolicySid: A2P_POLICIES.a2pMessaging },
  };
}

export function submitTrustProductRequest(bundleSid: string): A2PRequest {
  return { url: `${TRUSTHUB}/TrustProducts/${bundleSid}`, method: "POST", form: { Status: "pending-review" } };
}
