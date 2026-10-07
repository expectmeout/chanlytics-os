/**
 * The carriers' vocabulary: the closed lists Twilio keeps for a business
 * registration, and the coercions that keep a value it would refuse from
 * ever reaching it.
 *
 * They live here, with the rest of the product's words, rather than beside
 * the provider calls: the form offers them, the endpoint checks against
 * them, and `packages/channels` sends them. One list, three readers.
 *
 * Read from Twilio's documentation on 2026-09-08. A value outside a list is
 * refused at the evaluation — after the profile, the business, the person,
 * the address and the document have all been made — so nothing guesses.
 */

/** What a business does. */
export const BUSINESS_INDUSTRIES = [
  "AGRICULTURE",
  "AUTOMOTIVE",
  "BANKING",
  "CONSTRUCTION",
  "CONSUMER",
  "EDUCATION",
  "ELECTRONICS",
  "ENERGY",
  "ENGINEERING",
  "FAST_MOVING_CONSUMER_GOODS",
  "FINANCIAL",
  "FINTECH",
  "FOOD_AND_BEVERAGE",
  "GOVERNMENT",
  "HEALTHCARE",
  "HOSPITALITY",
  "INSURANCE",
  "JEWELRY",
  "LEGAL",
  "MANUFACTURING",
  "MEDIA",
  "NOT_FOR_PROFIT",
  "OIL_AND_GAS",
  "ONLINE",
  "PROFESSIONAL_SERVICES",
  "RAW_MATERIALS",
  "REAL_ESTATE",
  "RELIGION",
  "RETAIL",
  "TECHNOLOGY",
  "TELECOMMUNICATIONS",
  "TRANSPORTATION",
  "TRAVEL",
] as const;
export type BusinessIndustry = (typeof BUSINESS_INDUSTRIES)[number];
/** What a small local business is, unless it says otherwise. */
export const DEFAULT_INDUSTRY: BusinessIndustry = "PROFESSIONAL_SERVICES";

/** Its legal form. Told to the carriers in its name, so it is asked and never inferred. */
export const BUSINESS_TYPES = [
  "Co-operative",
  "Corporation",
  "Limited Liability Corporation",
  "Non-profit Corporation",
  "Partnership",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];
export const DEFAULT_BUSINESS_TYPE: BusinessType = "Limited Liability Corporation";

/** Who owns it. */
export const COMPANY_TYPES = ["government", "non-profit", "private", "public"] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];
export const DEFAULT_COMPANY_TYPE: CompanyType = "private";

/** The value Twilio will accept, or the default — never a guess it refuses. */
export function industryOf(v: string | null | undefined): BusinessIndustry {
  const up = String(v ?? "")
    .trim()
    .toUpperCase();
  return (BUSINESS_INDUSTRIES as readonly string[]).includes(up) ? (up as BusinessIndustry) : DEFAULT_INDUSTRY;
}
export function businessTypeOf(v: string | null | undefined): BusinessType {
  const s = String(v ?? "").trim();
  return (BUSINESS_TYPES as readonly string[]).includes(s) ? (s as BusinessType) : DEFAULT_BUSINESS_TYPE;
}
export function companyTypeOf(v: string | null | undefined): CompanyType {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return (COMPANY_TYPES as readonly string[]).includes(s) ? (s as CompanyType) : DEFAULT_COMPANY_TYPE;
}

/** The words for a value, where the carriers' spelling is not the owner's. */
export function industryWords(v: string): string {
  return v
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
