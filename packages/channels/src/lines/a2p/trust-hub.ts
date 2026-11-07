/**
 * The Trust Hub half of a registration, as requests: the customer profile (secondary or starter), the end users it
 * carries, the address and its supporting document, the A2P messaging profile, and the assignments, evaluations and
 * submissions that bind them. The brand and the campaign filed from them are brand-campaign.ts; the policies, the
 * hosts and the request's shape are wire.ts.
 */
import { businessTypeOf, companyTypeOf, industryOf } from "@chanlytics/contracts";
import { brandNameOf, type BusinessRecord } from "./business-record";
import { A2P_POLICIES, TRUSTHUB, type A2PRequest } from "./wire";

const attrs = (o: Record<string, unknown>) => JSON.stringify(o);

/** The customer's own bundle, under our primary profile. */
export function customerProfileRequest(options: {
  friendlyName: string;
  email: string;
  statusCallback?: string;
}): A2PRequest {
  return {
    url: `${TRUSTHUB}/CustomerProfiles`,
    method: "POST",
    form: {
      FriendlyName: options.friendlyName.slice(0, 64),
      // Twilio asks for the ISV's address here, not the customer's: we are
      // the one it writes to about the bundle.
      Email: options.email,
      PolicySid: A2P_POLICIES.secondaryCustomerProfile,
      ...(options.statusCallback ? { StatusCallback: options.statusCallback } : {}),
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
export function starterProfileRequest(options: {
  friendlyName: string;
  email: string;
  statusCallback?: string;
}): A2PRequest {
  return {
    url: `${TRUSTHUB}/CustomerProfiles`,
    method: "POST",
    form: {
      FriendlyName: options.friendlyName.slice(0, 64),
      Email: options.email,
      PolicySid: A2P_POLICIES.starterCustomerProfile,
      ...(options.statusCallback ? { StatusCallback: options.statusCallback } : {}),
    },
  };
}

/**
 * The person, for a starter profile. Four fields, verified from the policy's
 * own requirements rather than a guess: first_name, last_name, email,
 * phone_number.
 */
export function starterEndUserRequest(business: BusinessRecord): A2PRequest {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${business.contactFirstName} ${business.contactLastName}`.trim().slice(0, 64),
      Type: "starter_customer_profile_information",
      Attributes: attrs({
        first_name: business.contactFirstName,
        last_name: business.contactLastName,
        email: business.contactEmail,
        phone_number: business.contactPhone,
      }),
    },
  };
}

/** The messaging profile bundle a sole proprietor's brand is registered from. */
export function soleProprietorProfileRequest(options: {
  friendlyName: string;
  email: string;
  statusCallback?: string;
}): A2PRequest {
  return {
    url: `${TRUSTHUB}/TrustProducts`,
    method: "POST",
    form: {
      FriendlyName: options.friendlyName.slice(0, 64),
      Email: options.email,
      PolicySid: A2P_POLICIES.soleProprietor,
      ...(options.statusCallback ? { StatusCallback: options.statusCallback } : {}),
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
export function soleProprietorEndUserRequest(business: BusinessRecord, industry: string): A2PRequest {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${brandNameOf(business)} · sole proprietor`.slice(0, 64),
      Type: "sole_proprietor_information",
      Attributes: attrs({
        brand_name: brandNameOf(business),
        mobile_phone_number: business.contactPhone,
        vertical: industry,
      }),
    },
  };
}

export function businessEndUserRequest(business: BusinessRecord): A2PRequest {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${business.legalName} · business`.slice(0, 64),
      Type: "customer_profile_business_information",
      Attributes: attrs({
        business_name: business.legalName,
        social_media_profile_urls: "",
        website_url: business.websiteUrl,
        business_regions_of_operation: "USA_AND_CANADA",
        business_type: businessTypeOf(business.businessType),
        business_registration_identifier: "EIN",
        business_identity: "direct_customer",
        business_industry: industryOf(business.industry),
        business_registration_number: business.ein ?? "",
      }),
    },
  };
}

/** The person who signs for it. */
export function representativeEndUserRequest(business: BusinessRecord): A2PRequest {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${business.contactFirstName} ${business.contactLastName}`.slice(0, 64),
      Type: "authorized_representative_1",
      Attributes: attrs({
        job_position: business.contactJobPosition,
        last_name: business.contactLastName,
        phone_number: business.contactPhone,
        first_name: business.contactFirstName,
        email: business.contactEmail,
        business_title: business.contactTitle,
      }),
    },
  };
}

/** The address as an account resource, which the supporting document points at. */
export function addressRequest(accountSid: string, business: BusinessRecord): A2PRequest {
  return {
    url: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Addresses.json`,
    method: "POST",
    form: {
      FriendlyName: business.legalName.slice(0, 64),
      CustomerName: business.legalName.slice(0, 64),
      Street: business.street,
      ...(business.streetSecondary ? { StreetSecondary: business.streetSecondary } : {}),
      City: business.city,
      Region: business.region,
      PostalCode: business.postalCode,
      IsoCountry: business.country,
    },
  };
}

export function supportingDocumentRequest(options: { legalName: string; addressSid: string }): A2PRequest {
  return {
    url: `${TRUSTHUB}/SupportingDocuments`,
    method: "POST",
    form: {
      FriendlyName: `${options.legalName} · address`.slice(0, 64),
      Type: "customer_profile_address",
      Attributes: attrs({ address_sids: options.addressSid }),
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
export function businessAttributes(business: BusinessRecord): Record<string, unknown> {
  return parsed(businessEndUserRequest(business));
}
/** The starter profile's one end user, refreshed the same way. */
export function starterAttributes(business: BusinessRecord): Record<string, unknown> {
  return parsed(starterEndUserRequest(business));
}
export function representativeAttributes(business: BusinessRecord): Record<string, unknown> {
  return parsed(representativeEndUserRequest(business));
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
export function a2pProfileRequest(options: {
  friendlyName: string;
  email: string;
  statusCallback?: string;
}): A2PRequest {
  return {
    url: `${TRUSTHUB}/TrustProducts`,
    method: "POST",
    form: {
      FriendlyName: `${options.friendlyName} · A2P`.slice(0, 64),
      Email: options.email,
      PolicySid: A2P_POLICIES.a2pMessaging,
      ...(options.statusCallback ? { StatusCallback: options.statusCallback } : {}),
    },
  };
}

export function a2pProfileEndUserRequest(options: { friendlyName: string; companyType: string }): A2PRequest {
  const companyType = companyTypeOf(options.companyType);
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${options.friendlyName} · A2P`.slice(0, 64),
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
