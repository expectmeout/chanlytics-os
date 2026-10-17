import {
  BUSINESS_INDUSTRIES,
  BUSINESS_TYPES,
  COMPANY_TYPES,
  DEFAULT_BUSINESS_TYPE,
  DEFAULT_COMPANY_TYPE,
  DEFAULT_INDUSTRY
} from "./a2p-enums.js";
import { registrationPathOf, SOLE_PROP_LIMITS } from "./registration-path.js";
import { isPublishedFact } from "./published-facts.js";
import { E164 } from "../config/workspace-config/config-rules.js";
const FIELD = {
  legal_name: {
    label: "Legal name",
    hint: "Exactly as it appears on your tax filing, not your trading name.",
    placeholder: "Harbor Moving LLC",
    group: "business"
  },
  trade_name: {
    label: "Trading name",
    hint: "What customers call you, if it differs.",
    placeholder: "Harbor Moving",
    group: "business"
  },
  ein: {
    label: "Tax ID (EIN)",
    hint: "Nine digits from the IRS \u2014 on the letter that issued it, or any filing you have made with it.",
    placeholder: "12-3456789",
    group: "business"
  },
  business_type: { label: "Legal form", options: BUSINESS_TYPES, group: "business" },
  company_type: { label: "Ownership", options: COMPANY_TYPES, group: "business" },
  industry: { label: "Industry", options: BUSINESS_INDUSTRIES, group: "business" },
  about: {
    label: "What the business does",
    hint: "Two or three sentences a stranger could follow: what you sell, who buys it, and how they pay. It goes on your public page and into your registration, and the carriers check it.",
    placeholder: "A moving company in Brooklyn. We move homes and small offices across New York and New Jersey, and pack and store for them. Customers book a free estimate and pay per move.",
    multiline: true,
    group: "business"
  },
  website_url: {
    label: "Website",
    hint: "Yours, if you have one: your public page links to it, and the carriers check it. Without one, the carriers are given your public page instead, which carries your name, address and the wording they require.",
    placeholder: "https://",
    group: "business"
  },
  street: { label: "Street", placeholder: "193 Jamaica Ave", group: "address" },
  street_secondary: { label: "Suite or floor", group: "address" },
  city: { label: "City", placeholder: "Brooklyn", group: "address" },
  region: { label: "State", placeholder: "NY", group: "address" },
  postal_code: { label: "ZIP", placeholder: "11207", group: "address" },
  contact_first_name: { label: "First name", group: "contact" },
  contact_last_name: { label: "Last name", group: "contact" },
  contact_email: {
    label: "Email",
    hint: "The carriers write here if they need something, and customers can write to it from your public page.",
    placeholder: "you@business.com",
    group: "contact"
  },
  contact_phone: {
    label: "Mobile",
    hint: "Yours, not the business line. It is not published.",
    placeholder: "+1 646 555 0123",
    group: "contact"
  },
  contact_title: { label: "Title", placeholder: "Owner", group: "contact" }
};
const PATH_FIELDS = {
  standard: [
    { name: "legal_name", required: true },
    { name: "trade_name", required: false },
    { name: "ein", required: true },
    { name: "business_type", required: true },
    { name: "company_type", required: true },
    { name: "industry", required: true },
    { name: "about", required: true },
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
    { name: "contact_title", required: false }
  ],
  // No tax id, no legal form, no ownership: there is no registered entity to
  // describe, only a person trading under a name. One name box rather than
  // two, because the filing sends one name. The website is asked and not
  // required because nothing in this registration sends it — a required box
  // whose answer goes nowhere is how a form loses somebody at field fifteen.
  sole_proprietor: [
    {
      name: "legal_name",
      required: true,
      label: "Business name",
      hint: "What customers call you. There is no filing to match \u2014 this is the name the carriers show beside your texts."
    },
    { name: "industry", required: true },
    { name: "about", required: true },
    {
      name: "website_url",
      required: false,
      hint: "Optional: nothing in this registration sends it. If you give one, your public page links to it."
    },
    { name: "street", required: true },
    { name: "street_secondary", required: false },
    { name: "city", required: true },
    { name: "region", required: true },
    { name: "postal_code", required: true },
    { name: "contact_first_name", required: true },
    { name: "contact_last_name", required: true },
    { name: "contact_email", required: true },
    {
      name: "contact_phone",
      required: true,
      label: "Your mobile",
      hint: "Your own handset, not the number Chanlytics answers for you. The carriers text a code to it and you reply from that phone. It is not published."
    }
  ]
};
const BUILT = {};
export function businessFieldsFor(path) {
  const built = BUILT[path];
  if (built) return built;
  const made = PATH_FIELDS[path].map((a) => ({
    ...FIELD[a.name],
    name: a.name,
    required: a.required,
    published: isPublishedFact(a.name),
    ...a.label ? { label: a.label } : {},
    ...a.hint ? { hint: a.hint } : {}
  }));
  BUILT[path] = made;
  return made;
}
export function businessGroupWordsFor(path) {
  if (path === "sole_proprietor") {
    return {
      business: { title: "What you do", sub: "as customers know it" },
      address: {
        title: "Where you are",
        sub: "your own address \u2014 the carriers check it, and your public page shows it"
      },
      contact: { title: "You", sub: "the carriers text this mobile, and you answer from it" }
    };
  }
  return {
    business: { title: "The business", sub: "as the tax authorities know it" },
    address: { title: "Where it is registered", sub: "the address on the filing, not a mailbox" },
    contact: { title: "Who signs for it", sub: "a person the carriers can reach" }
  };
}
export function businessFieldLabel(column) {
  const asked = FIELD;
  const label = asked[column]?.label ?? (column === "contact_job_position" ? "Job position" : column.replace(/_/g, " "));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
export function emptyBusinessRecord(o = {}) {
  return {
    legal_name: "",
    trade_name: null,
    ein: null,
    street: "",
    street_secondary: null,
    city: "",
    region: "",
    postal_code: "",
    country: "US",
    website_url: o.websiteUrl ?? "",
    industry: DEFAULT_INDUSTRY,
    about: "",
    business_type: DEFAULT_BUSINESS_TYPE,
    company_type: DEFAULT_COMPANY_TYPE,
    contact_first_name: "",
    contact_last_name: "",
    contact_email: o.email ?? "",
    contact_phone: "",
    contact_title: "Owner",
    contact_job_position: "Director"
  };
}
const EIN = /^\d{2}-?\d{7}$/;
const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;
const REGION = /^[A-Za-z]{2}$/;
const REGISTERABLE_COUNTRIES = ["US", "CA"];
export const ABOUT_MIN = 40;
export const ABOUT_MAX = 500;
const digits = (s) => s.replace(/\D/g, "");
export function businessRecordProblems(r, path, facts = {}) {
  const out = {};
  const has = (k) => String(r[k] ?? "").trim().length > 0;
  for (const f of businessFieldsFor(path)) if (f.required && !has(f.name)) out[f.name] = `${f.label} is needed.`;
  if (has("ein") && !EIN.test(String(r.ein).trim())) out.ein = "A tax ID is nine digits, like 12-3456789.";
  if (has("contact_email") && !EMAIL.test(String(r.contact_email).trim()))
    out.contact_email = "That does not look like an email address.";
  if (has("contact_phone") && !E164.test(String(r.contact_phone).replace(/[\s()-]/g, "")))
    out.contact_phone = "Write it with the country code, like +1 646 555 0123.";
  if (has("about") && String(r.about).trim().length < ABOUT_MIN)
    out.about = "Say a little more: what you sell, and who buys it.";
  if (String(r.about ?? "").trim().length > ABOUT_MAX) out.about = `Keep it under ${ABOUT_MAX} characters.`;
  if (has("region") && !REGION.test(String(r.region).trim())) out.region = "Two letters, like NY.";
  if (has("website_url") && !/^https?:\/\/\S+\.\S+/.test(String(r.website_url).trim()))
    out.website_url = "A full address a reviewer can open, starting with https://";
  if (has("country") && !REGISTERABLE_COUNTRIES.includes(String(r.country).trim().toUpperCase())) {
    out.country = "The carriers register US and Canadian businesses only. Ours is not a door we can open.";
  }
  if (path === "sole_proprietor" && has("contact_phone") && (facts.ourNumbers ?? []).some((n) => digits(String(n)) === digits(String(r.contact_phone)))) {
    out.contact_phone = "This is the number Chanlytics answers for you. The carriers need YOUR handset \u2014 they text a code to it and you reply from the phone in your hand.";
  }
  return out;
}
export function businessRecordForPath(r, path) {
  return path === "standard" ? r : { ...r, ein: null };
}
export function businessRecordLine(r) {
  if (!r) return "The carriers ask who you are before they let a number text. It takes two minutes, once.";
  const path = registrationPathOf(r) ?? "standard";
  const problems = businessRecordProblems(r, path);
  const missing = Object.keys(problems).length;
  if (missing) return `${missing} thing${missing === 1 ? "" : "s"} still to fill in before this can be filed.`;
  const capped = path === "sole_proprietor" ? ` \xB7 one number, about ${SOLE_PROP_LIMITS.messagesPerSecond} text a second` : "";
  return `${r.legal_name}${r.trade_name ? ` (${r.trade_name})` : ""} \xB7 ${r.city}, ${r.region} \xB7 on record${capped}.`;
}
