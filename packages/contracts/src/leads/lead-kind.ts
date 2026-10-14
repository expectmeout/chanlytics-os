/**
 * What a lead is (the lead workbench's call 8, 00429): a place a listing names, found by the Maps card, or a company with
 * the people its source named on it, found by the people card, one of whom is the addressee its reach-out writes to.
 * Where it came from (`source`: a card's id, or a file of the owner's own) and its key there are the lead's own, so a
 * company found twice is one lead; it is written to once, whoever works there (0057's call 9). Pure, and read in the
 * browser: no schema library.
 *
 *   LEAD_KINDS, LEAD_SOURCES   the stored sets (00429's CHECKs)
 *   leadFactsOf                a lead's facts as stored, read safely: its people, which one is the addressee, its size
 *   leadAddresseeOf            the person a company's email goes to; null for a place
 *   roleOf                     a person's role from their source's seniority, else their title (their first name is
 *                              templates' firstNameOf, the one rule every message greets by)
 *   leadUnitOf                 what a page calls leads of a kind: businesses, or companies
 *   leadCompanyOf              a company on its peek: the people named on it, its addressee first, and where it came from
 */
import { recordOrNull, trimmedOrNull } from "../shared/unknown";
import { plural } from "../shared/words";
import { firstNameOf } from "../templates/templates";
import { LEAD_CARDS } from "./search/cards";

export const LEAD_KINDS = ["place", "company"] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];
export const isLeadKind = (k: unknown): k is LeadKind => (LEAD_KINDS as readonly unknown[]).includes(k);

/** The cards that find leads, and a file of the owner's own (00242): where each lead came from. */
export const LEAD_SOURCES = ["local_businesses", "people_at_companies", "import"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const isLeadSource = (s: unknown): s is LeadSource => (LEAD_SOURCES as readonly unknown[]).includes(s);

/** A person's place in their company, as the people card's seniority words come down to it. */
export const LEAD_ROLES = ["owner", "founder", "executive", "partner", "director", "manager", "staff"] as const;
export type LeadRole = (typeof LEAD_ROLES)[number];
export const isLeadRole = (r: unknown): r is LeadRole => (LEAD_ROLES as readonly unknown[]).includes(r);

/** A role as an email says it: "as the {{role}} at …". */
export const LEAD_ROLE_WORDS: Record<LeadRole, string> = {
  owner: "owner",
  founder: "founder",
  executive: "executive",
  partner: "partner",
  director: "director",
  manager: "manager",
  staff: "team member",
};

/** The most people a company keeps (00429 lead_company_upsert): the addressee and a few around them. */
export const LEAD_PEOPLE_MAX = 5;

/** One person its source named at a company. A type, not an interface: it is stored as it is (leads.facts, Json). */
export type LeadPerson = {
  name: string;
  first_name: string | null;
  title: string | null;
  role: LeadRole | null;
  /** Their work address, as the source gave it; the addressee's is the lead's own, checked before anything is sent. */
  email: string | null;
  /** Their public professional profile, as the source gave it: shown, never written to. */
  profile_url: string | null;
};

/** What a lead's source named beyond its columns (leads.facts). A place's are empty. */
export type LeadFacts = {
  people: LeadPerson[];
  /** Which of `people` the lead's address is, and its reach-out writes to; null with none. */
  addressee: number | null;
  /** The company's size as its source gave it ("11 - 50"). */
  size: string | null;
};

export const NO_LEAD_FACTS: LeadFacts = { people: [], addressee: null, size: null };

const capped = (v: unknown, max: number): string | null => trimmedOrNull(v)?.slice(0, max) ?? null;

/** A person's role from the seniority their source gave (the people card's words), else read off their title. */
export function roleOf(seniority: string | null | undefined, title: string | null | undefined): LeadRole | null {
  switch ((seniority ?? "").trim().toLowerCase()) {
    case "owner":
      return "owner";
    case "founder":
      return "founder";
    case "c_suite":
      return "executive";
    case "partner":
      return "partner";
    case "vp":
    case "head":
    case "director":
      return "director";
    case "manager":
      return "manager";
    case "senior":
    case "entry":
      return "staff";
  }
  const t = (title ?? "").toLowerCase();
  if (!t.trim()) return null;
  if (/\bowner\b/.test(t)) return "owner";
  if (/\b(co-?)?founder\b/.test(t)) return "founder";
  if (/\b(ceo|coo|cfo|cto|cmo|cio|chief|president)\b/.test(t)) return "executive";
  if (/\bpartner\b/.test(t)) return "partner";
  if (/\b(vp|vice president|head of|director)\b/.test(t)) return "director";
  if (/\bmanager\b/.test(t)) return "manager";
  return "staff";
}

/** One person as stored, read safely: a name, or nothing. */
export function leadPersonOf(raw: unknown): LeadPerson | null {
  const o = recordOrNull(raw);
  const name = capped(o?.name, 120);
  if (!o || !name) return null;
  return {
    name,
    // Its source's first name, else the one rule's reading of the whole one (templates' firstNameOf).
    first_name: capped(o.first_name, 60) ?? firstNameOf(name, null),
    title: capped(o.title, 120),
    role: isLeadRole(o.role) ? o.role : null,
    email: capped(o.email, 254)?.toLowerCase() ?? null,
    profile_url: capped(o.profile_url, 300),
  };
}

/** A lead's facts as stored (leads.facts), read safely: what does not read is left out, never guessed. */
export function leadFactsOf(raw: unknown): LeadFacts {
  const o = recordOrNull(raw);
  if (!o) return NO_LEAD_FACTS;
  const people = (Array.isArray(o.people) ? o.people : [])
    .map(leadPersonOf)
    .filter((p): p is LeadPerson => p !== null)
    .slice(0, LEAD_PEOPLE_MAX);
  const a = o.addressee;
  const addressee = typeof a === "number" && Number.isInteger(a) && a >= 0 && a < people.length ? a : null;
  return { people, addressee, size: capped(o.size, 20) };
}

/** The person a company's email goes to: its addressee. A place has none; its email goes to the business. */
export function leadAddresseeOf(l: { kind?: string | null; facts?: unknown }): LeadPerson | null {
  if (l.kind !== "company") return null;
  const f = leadFactsOf(l.facts);
  return f.addressee === null ? null : (f.people[f.addressee] ?? null);
}

/** What a page calls leads of a kind, one and many: a place is a business, a company a company. */
export function leadUnitOf(kind: string | null | undefined): { one: string; many: string } {
  return kind === "company" ? { one: "company", many: "companies" } : { one: "business", many: "businesses" };
}

/** "3 companies", "1 business". */
export function leadUnitCount(n: number, kind: string | null | undefined): string {
  const u = leadUnitOf(kind);
  return plural(n, u.one, u.many);
}

/** One person on a company's peek: who, what they do, whether its reach-out writes to them, their public profile. */
export interface LeadCompanyPersonVM {
  name: string;
  /** Their title, else their role's word; null when their source said neither. */
  what: string | null;
  addressee: boolean;
  profile: string | null;
}

/** A company on its peek (00429): its people, the addressee first, its size, and the line on where they came from. */
export interface LeadCompanyVM {
  head: string;
  people: LeadCompanyPersonVM[];
  size: string | null;
  /** Where its people came from and what we keep of them: the people card's source-rights note. */
  source: string;
}

export const LEAD_COMPANY_WORDS = {
  head: (n: number) => (n === 1 ? "Named at this company" : `Named at this company · ${n}`),
  writesTo: "Your reach-out writes to them",
  size: (s: string) => `${s} people`,
  profile: "Profile",
} as const;

/** A company's peek section, or null for a place (its people are People's, in its own section). */
export function leadCompanyOf(l: { kind?: string | null; facts?: unknown }): LeadCompanyVM | null {
  if (l.kind !== "company") return null;
  const f = leadFactsOf(l.facts);
  const people = f.people
    .map((p, i) => ({
      name: p.name,
      what: p.title ?? (p.role ? LEAD_ROLE_WORDS[p.role] : null),
      addressee: i === f.addressee,
      profile: p.profile_url,
    }))
    .sort((a, b) => Number(b.addressee) - Number(a.addressee));
  return {
    head: LEAD_COMPANY_WORDS.head(people.length),
    people,
    size: f.size ? LEAD_COMPANY_WORDS.size(f.size) : null,
    source: LEAD_CARDS.find((c) => c.id === "people_at_companies")?.rights ?? "",
  };
}
