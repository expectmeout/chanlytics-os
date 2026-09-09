/**
 * The business on record: what a carrier registration asks, as one form the
 * owner fills once.
 *
 * The carriers ask the same questions of a 10DLC brand, a toll-free
 * verification, a hosted-SMS authorization and a port, and each of them is a
 * statement made in the business's own name — so every field here is asked,
 * none is inferred, and the ones Twilio keeps an enum for offer only what it
 * accepts. The words are the owner's, not the registry's: nobody outside this
 * file says "brand", "campaign" or "10DLC".
 *
 * WHICH FIELDS. Not all of them, always: there are two registrations (see
 * ./registration-path) and they ask different things. The rule is one line
 * long and it is the whole reason this is a table rather than a list —
 *
 *   A FIELD APPEARS ON A PATH IF, AND ONLY IF, SOMETHING THAT PATH FILES
 *   READS IT.
 *
 * — so a sole proprietor is never asked for a legal form they do not have, or
 * a website nothing in their registration sends, and never sees a required
 * box they cannot fill. Check it against `packages/channels/src/a2p.ts`: the
 * standard path's `businessEndUserRequest` reads the tax id, the legal form
 * and the website; the sole-proprietor path's `starterEndUserRequest` and
 * `soleProprietorEndUserRequest` read the person, their mobile, one name and
 * the industry. Nothing else is asked because nothing else is sent.
 */
import { BUSINESS_INDUSTRIES, BUSINESS_TYPES, COMPANY_TYPES, DEFAULT_BUSINESS_TYPE, DEFAULT_COMPANY_TYPE, DEFAULT_INDUSTRY } from "./a2p-enums";
import { registrationPathOf, SOLE_PROP_LIMITS, type RegistrationPath } from "./registration-path";

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

/** The part of a field that is the same whoever is filing: its words, its list, where it sits. */
type FieldShape = Omit<BusinessFieldVM, "name" | "required">;

/**
 * Every field a path may ask for. Not every path asks for all of them.
 *
 * `satisfies Partial<Record<keyof BusinessRecordDto, …>>` rather than a typed
 * annotation, so this is checked in both directions at once: a key that is not
 * a real column is a compile error, and `Askable` below stays the exact set of
 * keys written here rather than every column in the DTO.
 */
const FIELD = {
  legal_name: { label: "Legal name", hint: "Exactly as it appears on your tax filing, not your trading name.", placeholder: "Harbor Moving LLC", group: "business" },
  trade_name: { label: "Trading name", hint: "What customers call you, if it differs.", placeholder: "Harbor Moving", group: "business" },
  ein: { label: "Tax ID (EIN)", hint: "Nine digits from the IRS — on the letter that issued it, or any filing you have made with it.", placeholder: "12-3456789", group: "business" },
  business_type: { label: "Legal form", options: BUSINESS_TYPES, group: "business" },
  company_type: { label: "Ownership", options: COMPANY_TYPES, group: "business" },
  industry: { label: "Industry", options: BUSINESS_INDUSTRIES, group: "business" },
  website_url: { label: "Website", hint: "Yours, if you have one. Without it we publish a page for you at chanlytics.com carrying your name, address and the wording the carriers require — which is what they check.", placeholder: "https://", group: "business" },
  street: { label: "Street", placeholder: "193 Jamaica Ave", group: "address" },
  street_secondary: { label: "Suite or floor", group: "address" },
  city: { label: "City", placeholder: "Brooklyn", group: "address" },
  region: { label: "State", placeholder: "NY", group: "address" },
  postal_code: { label: "ZIP", placeholder: "11207", group: "address" },
  contact_first_name: { label: "First name", group: "contact" },
  contact_last_name: { label: "Last name", group: "contact" },
  contact_email: { label: "Email", hint: "The carriers write here if they need something.", placeholder: "you@business.com", group: "contact" },
  contact_phone: { label: "Mobile", hint: "Yours, not the business line.", placeholder: "+1 646 555 0123", group: "contact" },
  contact_title: { label: "Title", placeholder: "Owner", group: "contact" },
} satisfies Partial<Record<keyof BusinessRecordDto, FieldShape>>;

type Askable = keyof typeof FIELD;

/** One field on one path: whether that path needs it, and what that path says about it when the shared words are wrong. */
interface Ask {
  name: Askable;
  required: boolean;
  /** Overrides FIELD's hint, for the paths where the same box means something else. */
  hint?: string;
  /** Overrides FIELD's label, likewise. */
  label?: string;
}

const PATH_FIELDS: Record<RegistrationPath, readonly Ask[]> = {
  standard: [
    { name: "legal_name", required: true },
    { name: "trade_name", required: false },
    { name: "ein", required: true },
    { name: "business_type", required: true },
    { name: "company_type", required: true },
    { name: "industry", required: true },
    // NOT required, and this is the change gate 8 is. A carrier registration
    // needs a website that identifies the business and a privacy policy
    // carrying SMS language, on a domain that matches the brand -- and most
    // salons have a Facebook page and a Booksy link. Demanding a URL here
    // turned that into a wall at field seven. We publish `/b/<slug>` from the
    // facts on this very form instead, and file that.
    { name: "website_url", required: false },
    { name: "street", required: true },
    { name: "street_secondary", required: false },
    { name: "city", required: true },
    { name: "region", required: true },
    { name: "postal_code", required: true },
    { name: "contact_first_name", required: true },
    { name: "contact_last_name", required: true },
    { name: "contact_email", required: true },
    { name: "contact_phone", required: true },
    { name: "contact_title", required: false },
  ],
  // No tax id, no legal form, no ownership: there is no registered entity to
  // describe, only a person trading under a name. One name box rather than
  // two, because the filing sends one name. The website is asked and not
  // required because nothing in this registration sends it — a required box
  // whose answer goes nowhere is how a form loses somebody at field fifteen.
  sole_proprietor: [
    { name: "legal_name", required: true, label: "Business name", hint: "What customers call you. There is no filing to match — this is the name the carriers show beside your texts." },
    { name: "industry", required: true },
    { name: "website_url", required: false, hint: "Optional: nothing in this registration sends it. Worth having anyway, if a customer ever looks you up." },
    { name: "street", required: true },
    { name: "street_secondary", required: false },
    { name: "city", required: true },
    { name: "region", required: true },
    { name: "postal_code", required: true },
    { name: "contact_first_name", required: true },
    { name: "contact_last_name", required: true },
    { name: "contact_email", required: true },
    { name: "contact_phone", required: true, label: "Your mobile", hint: "Your own handset, not the number Chanlytics answers for you. The carriers text a code to it and you reply from that phone." },
  ],
};

const BUILT: Partial<Record<RegistrationPath, readonly BusinessFieldVM[]>> = {};

/**
 * The fields this path asks for, in the order it asks them.
 *
 * Built once per path and handed back by reference, so a form that calls this
 * every render is not rebuilding seventeen objects a keystroke.
 */
export function businessFieldsFor(path: RegistrationPath): readonly BusinessFieldVM[] {
  const built = BUILT[path];
  if (built) return built;
  const made = PATH_FIELDS[path].map((a) => ({
    ...FIELD[a.name],
    name: a.name,
    required: a.required,
    ...(a.label ? { label: a.label } : {}),
    ...(a.hint ? { hint: a.hint } : {}),
  }));
  BUILT[path] = made;
  return made;
}

/** The headings over each part of the form. A sole proprietor has no tax filing, so the standard headings would be lying. */
export function businessGroupWordsFor(path: RegistrationPath): Record<BusinessFieldVM["group"], { title: string; sub: string }> {
  if (path === "sole_proprietor") {
    return {
      business: { title: "What you do", sub: "as customers know it" },
      address: { title: "Where you are", sub: "your own address — the carriers check it" },
      contact: { title: "You", sub: "the carriers text this mobile, and you answer from it" },
    };
  }
  return {
    business: { title: "The business", sub: "as the tax authorities know it" },
    address: { title: "Where it is registered", sub: "the address on the filing, not a mailbox" },
    contact: { title: "Who signs for it", sub: "a person the carriers can reach" },
  };
}

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
const REGISTERABLE_COUNTRIES = ["US", "CA"];

const digits = (s: string) => s.replace(/\D/g, "");

/** Facts a record cannot check about itself. Optional: a check with nothing to check against is skipped, never guessed. */
export interface RecordCheckFacts {
  /**
   * The numbers this workspace was given BY US.
   *
   * A sole proprietor's mobile may not be one of them: the carriers refuse a
   * CPaaS number as the handset they text a code to, and it is the mistake a
   * business makes without noticing, because it is the number on their own
   * website. Checkable, so checked here rather than discovered after the fee.
   */
  ourNumbers?: readonly string[];
}

/**
 * What is still wrong, by field, in the owner's words. Empty means it can be filed.
 *
 * `path` is required and has no default on purpose. The whole class of bug this
 * replaced was one validator answering for two registrations: with a default,
 * the caller that forgot to pass it would quietly validate a business as a sole
 * proprietor — which is the narrow, permanent registration — and say nothing
 * was missing.
 */
export function businessRecordProblems(
  r: Partial<BusinessRecordDto>,
  path: RegistrationPath,
  facts: RecordCheckFacts = {},
): Partial<Record<keyof BusinessRecordDto, string>> {
  const out: Partial<Record<keyof BusinessRecordDto, string>> = {};
  const has = (k: keyof BusinessRecordDto) => String(r[k] ?? "").trim().length > 0;
  // Missing before malformed, in the order the form asks: the first problem is
  // the one the page shows, and "your name is needed" beats "that ZIP is odd"
  // when both are true.
  for (const f of businessFieldsFor(path)) if (f.required && !has(f.name)) out[f.name] = `${f.label} is needed.`;
  if (has("ein") && !EIN.test(String(r.ein).trim())) out.ein = "A tax ID is nine digits, like 12-3456789.";
  if (has("contact_email") && !EMAIL.test(String(r.contact_email).trim())) out.contact_email = "That does not look like an email address.";
  if (has("contact_phone") && !E164.test(String(r.contact_phone).replace(/[\s()-]/g, ""))) out.contact_phone = "Write it with the country code, like +1 646 555 0123.";
  if (has("region") && !REGION.test(String(r.region).trim())) out.region = "Two letters, like NY.";
  if (has("website_url") && !/^https?:\/\/\S+\.\S+/.test(String(r.website_url).trim())) out.website_url = "A full address a reviewer can open, starting with https://";
  // Not a form field — it is "US" unless something hand-built says otherwise —
  // but the carriers only register businesses in two countries, and a refusal
  // for this arrives days later saying nothing a person can act on.
  if (has("country") && !REGISTERABLE_COUNTRIES.includes(String(r.country).trim().toUpperCase())) {
    out.country = "The carriers register US and Canadian businesses only. Ours is not a door we can open.";
  }
  if (path === "sole_proprietor" && has("contact_phone") && (facts.ourNumbers ?? []).some((n) => digits(String(n)) === digits(String(r.contact_phone)))) {
    out.contact_phone = "This is the number Chanlytics answers for you. The carriers need YOUR handset — they text a code to it and you reply from the phone in your hand.";
  }
  return out;
}

/**
 * The record as this path files it.
 *
 * One field today, and the reason it is a function rather than a line at the
 * call site is that there are three writers. A sole-proprietor record must be
 * stored with NO tax id, or `registrationPathOf` reads it back as a standard
 * record later and the whole derivation stops being exact. The legal form and
 * ownership columns are left at their defaults rather than blanked: they are
 * not null, nothing on this path sends them, and a default is not a claim.
 */
export function businessRecordForPath<T extends Partial<BusinessRecordDto>>(r: T, path: RegistrationPath): T {
  return path === "standard" ? r : { ...r, ein: null };
}

/** What the pane says about the record as it stands. */
export function businessRecordLine(r: BusinessRecordDto | null): string {
  if (!r) return "The carriers ask who you are before they let a number text. It takes two minutes, once.";
  // A record on file is on the path its own tax id says it is on — see
  // ./registration-path for why that reads back exactly.
  const path = registrationPathOf(r) ?? "standard";
  const problems = businessRecordProblems(r, path);
  const missing = Object.keys(problems).length;
  if (missing) return `${missing} thing${missing === 1 ? "" : "s"} still to fill in before this can be filed.`;
  const capped = path === "sole_proprietor" ? ` · one number, about ${SOLE_PROP_LIMITS.messagesPerSecond} text a second` : "";
  return `${r.legal_name}${r.trade_name ? ` (${r.trade_name})` : ""} · ${r.city}, ${r.region} · on record${capped}.`;
}
