/**
 * The business on record as the carriers' requests read it, and which of the two registrations it files
 * (brandTypeFor). The form an owner fills is contracts' lines/business-record.ts; the requests that send it are
 * trust-hub.ts.
 */
import { registrationPathOf } from "@chanlytics/contracts";

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
