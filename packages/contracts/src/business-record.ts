/**
 * The business on record: what every carrier registration asks, as one
 * form the owner fills once.
 *
 * The carriers ask the same questions of a 10DLC brand, a toll-free
 * verification, a hosted-SMS authorization and a port, and each of them
 * is a statement made in the business's own name — so every field here is
 * asked, none is inferred, and the ones Twilio keeps an enum for offer
 * only what it accepts. The words are the owner's, not the registry's:
 * nobody outside this file says "brand", "campaign" or "10DLC".
 */
import { BUSINESS_INDUSTRIES, BUSINESS_TYPES, COMPANY_TYPES, DEFAULT_BUSINESS_TYPE, DEFAULT_COMPANY_TYPE, DEFAULT_INDUSTRY } from "./a2p-enums";

export interface BusinessRecordDto {
  legal_name: string;
  trade_name: string | null;
  ein: string | null;
  street: string;
  street_secondary: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  website_url: string;
  industry: string;
  business_type: string;
  company_type: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_email: string;
  contact_phone: string;
  contact_title: string;
  contact_job_position: string;
  updated_at?: string;
}

export interface BusinessFieldVM {
  /** The column, which is also the form's field name. */
  name: keyof BusinessRecordDto;
  /** What the owner is asked, in their words. */
  label: string;
  /** Why the carriers want it, when that is not obvious. */
  hint?: string;
  /** A closed list, when the carriers keep one. */
  options?: readonly string[];
  required: boolean;
  /** Placeholder text, shown empty. */
  placeholder?: string;
  /** Which part of the form it belongs to. */
  group: "business" | "address" | "contact";
}

export const BUSINESS_FIELDS: readonly BusinessFieldVM[] = [
  { name: "legal_name", label: "Legal name", hint: "Exactly as it appears on your tax filing, not your trading name.", required: true, placeholder: "Harbor Moving LLC", group: "business" },
  { name: "trade_name", label: "Trading name", hint: "What customers call you, if it differs.", required: false, placeholder: "Harbor Moving", group: "business" },
  { name: "ein", label: "Tax ID (EIN)", hint: "Nine digits from the IRS. Without one the carriers use a different registration, which we do not offer yet.", required: true, placeholder: "12-3456789", group: "business" },
  { name: "business_type", label: "Legal form", options: BUSINESS_TYPES, required: true, group: "business" },
  { name: "company_type", label: "Ownership", options: COMPANY_TYPES, required: true, group: "business" },
  { name: "industry", label: "Industry", options: BUSINESS_INDUSTRIES, required: true, group: "business" },
  { name: "website_url", label: "Website", hint: "A page a reviewer can open. Your sign-up page works if you have no site.", required: true, placeholder: "https://", group: "business" },
  { name: "street", label: "Street", required: true, placeholder: "193 Jamaica Ave", group: "address" },
  { name: "street_secondary", label: "Suite or floor", required: false, group: "address" },
  { name: "city", label: "City", required: true, placeholder: "Brooklyn", group: "address" },
  { name: "region", label: "State", required: true, placeholder: "NY", group: "address" },
  { name: "postal_code", label: "ZIP", required: true, placeholder: "11207", group: "address" },
  { name: "contact_first_name", label: "First name", required: true, group: "contact" },
  { name: "contact_last_name", label: "Last name", required: true, group: "contact" },
  { name: "contact_email", label: "Email", hint: "The carriers write here if they need something.", required: true, placeholder: "you@business.com", group: "contact" },
  { name: "contact_phone", label: "Mobile", hint: "Yours, not the business line.", required: true, placeholder: "+1 646 555 0123", group: "contact" },
  { name: "contact_title", label: "Title", required: false, placeholder: "Owner", group: "contact" },
];

export const BUSINESS_GROUP_WORDS: Record<BusinessFieldVM["group"], { title: string; sub: string }> = {
  business: { title: "The business", sub: "as the tax authorities know it" },
  address: { title: "Where it is registered", sub: "the address on the filing, not a mailbox" },
  contact: { title: "Who signs for it", sub: "a person the carriers can reach" },
};

/** An empty record, with the defaults the carriers accept already chosen. */
export function emptyBusinessRecord(o: { websiteUrl?: string; email?: string } = {}): BusinessRecordDto {
  return {
    legal_name: "", trade_name: null, ein: null,
    street: "", street_secondary: null, city: "", region: "", postal_code: "", country: "US",
    website_url: o.websiteUrl ?? "", industry: DEFAULT_INDUSTRY,
    business_type: DEFAULT_BUSINESS_TYPE, company_type: DEFAULT_COMPANY_TYPE,
    contact_first_name: "", contact_last_name: "", contact_email: o.email ?? "", contact_phone: "",
    contact_title: "Owner", contact_job_position: "Director",
  };
}

const EIN = /^\d{2}-?\d{7}$/;
const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;
const E164 = /^\+[1-9]\d{6,14}$/;
const REGION = /^[A-Za-z]{2}$/;

/** What is still wrong, by field, in the owner's words. Empty means it can be filed. */
export function businessRecordProblems(r: Partial<BusinessRecordDto>): Partial<Record<keyof BusinessRecordDto, string>> {
  const out: Partial<Record<keyof BusinessRecordDto, string>> = {};
  const has = (k: keyof BusinessRecordDto) => String(r[k] ?? "").trim().length > 0;
  for (const f of BUSINESS_FIELDS) if (f.required && !has(f.name)) out[f.name] = `${f.label} is needed.`;
  if (has("ein") && !EIN.test(String(r.ein).trim())) out.ein = "A tax ID is nine digits, like 12-3456789.";
  if (has("contact_email") && !EMAIL.test(String(r.contact_email).trim())) out.contact_email = "That does not look like an email address.";
  if (has("contact_phone") && !E164.test(String(r.contact_phone).replace(/[\s()-]/g, ""))) out.contact_phone = "Write it with the country code, like +1 646 555 0123.";
  if (has("region") && !REGION.test(String(r.region).trim())) out.region = "Two letters, like NY.";
  if (has("website_url") && !/^https?:\/\/\S+\.\S+/.test(String(r.website_url).trim())) out.website_url = "A full address a reviewer can open, starting with https://";
  return out;
}

/** What the pane says about the record as it stands. */
export function businessRecordLine(r: BusinessRecordDto | null): string {
  if (!r) return "The carriers ask who you are before they let a number text. It takes two minutes, once.";
  const problems = businessRecordProblems(r);
  const missing = Object.keys(problems).length;
  if (missing) return `${missing} thing${missing === 1 ? "" : "s"} still to fill in before this can be filed.`;
  return `${r.legal_name}${r.trade_name ? ` (${r.trade_name})` : ""} · ${r.city}, ${r.region} · on record.`;
}
