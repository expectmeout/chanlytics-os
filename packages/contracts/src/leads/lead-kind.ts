/**
 * What a lead is (the lead workbench's call 8, 00430): a place a listing names, found by the Maps card, or a company with
 * the people its source named on it, found by the people card, one of whom is the addressee its reach-out writes to.
 * Where it came from (`source`: a card's id, or a file of the owner's own) and its key there are the lead's own, so a
 * company found twice is one lead; it is written to once, whoever works there (0057's call 9). Pure, and read in the
 * browser: no schema library.
 *
 *   LEAD_KINDS, LEAD_SOURCES   the stored sets (00430's CHECKs)
 *   leadFactsOf                (its own) a lead's facts as stored, read safely: its people, the addressee, its size
 *   leadAddresseeOf            the person a company's email goes to; null for a place
 *   leadRoleOf                     a person's role from their source's seniority, else their title (their first name is
 *                              templates' firstNameOf, the one rule every message greets by)
 *   leadCompanyOf              a company on its peek: the people named on it, its addressee first, and where it came from
 */
import { recordOrNull, trimmedOrNull } from "../shared/unknown";
import { firstNameOf } from "../templates/templates";
import { LEAD_CARDS } from "./search/cards";

export const LEAD_KINDS = ["place", "company"] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

/** The cards that find leads, and a file of the owner's own (00242): where each lead came from. */
export const LEAD_SOURCES = ["local_businesses", "people_at_companies", "import"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** A person's place in their company, as the people card's seniority words come down to it. */
const LEAD_ROLES = ["owner", "founder", "executive", "partner", "director", "manager", "staff"] as const;
export type LeadRole = (typeof LEAD_ROLES)[number];
const isLeadRole = (r: unknown): r is LeadRole => (LEAD_ROLES as readonly unknown[]).includes(r);

/** Where a company the people card found came from, as every page says it (00430): never "your list", nor Maps. */
export const LEAD_DIRECTORY_WORDS = {
  found: "From a business directory",
  address: "the address came with its people",
  addressAlone: "The address came with its people",
} as const;

/**
 * Where a lead's story says it came from: a business directory for a company the people card found (00430), a list of
 * the owner's own for a lead found on no listing (00242), else Google Maps, by what was asked where it says.
 */
export function leadFoundWords(t: {
  kind?: string | null;
  found_on_listing?: boolean;
  search?: { asked?: string | null } | null;
}): string {
  if (t.kind === "company") return LEAD_DIRECTORY_WORDS.found;
  if (t.found_on_listing === false) return "From your list";
  return t.search?.asked ? `Found on Google Maps by “${t.search.asked}”` : "Found on Google Maps";
}

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

/** The most people a company keeps (00430 lead_company_upsert): the addressee and a few around them. */
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

const NO_LEAD_FACTS: LeadFacts = { people: [], addressee: null, size: null };

const capped = (v: unknown, max: number): string | null => trimmedOrNull(v)?.slice(0, max) ?? null;

/** A person's role from the seniority their source gave (the people card's words), else read off their title. */
export function leadRoleOf(seniority: string | null | undefined, title: string | null | undefined): LeadRole | null {
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
  // Someone who works for a principal is staff, whoever they work for: "Assistant to the Owner", "Executive Assistant",
  // "Office Coordinator to the CEO".
  if (/\b(assistant|coordinator|intern|receptionist|secretary)\b/.test(t)) return "staff";
  if (/\bowner\b/.test(t)) return "owner";
  if (/\b(co-?)?founder\b/.test(t)) return "founder";
  if (/\b(ceo|coo|cfo|cto|cmo|cio|chief|president)\b/.test(t)) return "executive";
  if (/\bpartner\b/.test(t)) return "partner";
  if (/\b(vp|vice president|head of|director)\b/.test(t)) return "director";
  if (/\bmanager\b/.test(t)) return "manager";
  return "staff";
}

/** One person as stored, read safely: a name, or nothing. */
function leadPersonOf(raw: unknown): LeadPerson | null {
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

/**
 * A lead's facts as stored (leads.facts), read safely: what does not read is left out, never guessed. `at` is each
 * person's place in the stored list, which the addressee and the door that chooses one name.
 */
function readFacts(raw: unknown): { facts: LeadFacts; at: number[] } {
  const o = recordOrNull(raw);
  if (!o) return { facts: NO_LEAD_FACTS, at: [] };
  const stored = (Array.isArray(o.people) ? o.people : [])
    .map((p, at) => ({ person: leadPersonOf(p), at }))
    .filter((x): x is { person: LeadPerson; at: number } => x.person !== null)
    .slice(0, LEAD_PEOPLE_MAX);
  const a = o.addressee;
  const addressee = typeof a === "number" && Number.isInteger(a) ? stored.findIndex((x) => x.at === a) : -1;
  return {
    facts: {
      people: stored.map((x) => x.person),
      addressee: addressee >= 0 ? addressee : null,
      size: capped(o.size, 20),
    },
    at: stored.map((x) => x.at),
  };
}

/** A lead's facts as stored (leads.facts), read safely (readFacts). */
const leadFactsOf = (raw: unknown): LeadFacts => readFacts(raw).facts;

/** The person a company's email goes to: its addressee. A place has none; its email goes to the business. */
export function leadAddresseeOf(l: { kind?: string | null; facts?: unknown }): LeadPerson | null {
  if (l.kind !== "company") return null;
  const f = leadFactsOf(l.facts);
  return f.addressee === null ? null : (f.people[f.addressee] ?? null);
}

/** One person on a company's peek: who, what they do, whether its reach-out writes to them, their public profile. */
export interface LeadCompanyPersonVM {
  name: string;
  /** Their title, else their role's word; null when their source said neither. */
  what: string | null;
  addressee: boolean;
  profile: string | null;
  /** Their place in the company's people as stored (leads.facts.people): what choosing them names to the door. */
  index: number;
  /**
   * Whether they may be chosen as the one its reach-out writes to (00430 lead_addressee_choose): someone else, with a
   * work address, at a company that is open, in nobody's People, written to by no one and with no check on its way. The
   * door says the rest (a reach-out that planned it already, an address on the never-again list).
   */
  choose: boolean;
}

/** A company on its peek (00430): its people, the addressee first, its size, and the line on where they came from. */
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

/**
 * Choosing who a company's reach-out writes to (00430 lead_addressee_choose): the peek's door beside one of its people,
 * what it says once chosen, and each refusal of the door in words, by its code.
 */
export const LEAD_ADDRESSEE_WORDS = {
  door: "Write to them instead",
  /** What a role that may not is told it cannot do here (gateTitle). */
  gated: "choose who a reach-out writes to",
  choosing: "Choosing…",
  /** Chosen: who it writes to now, and whether their address is checked first (a few minutes) or was already. */
  done: (name: string, checking: boolean) =>
    checking
      ? `${name} is who its reach-out writes to now. Their address is being checked first, which takes a few minutes.`
      : `${name} is who its reach-out writes to now. Their address was checked already.`,
  refused: {
    gone: "This lead is gone.",
    not_a_company: "Only a company has people to choose from.",
    no_person: "They are no longer named at this company. Reload and try again.",
    already: "Its reach-out writes to them already.",
    closed: "This lead is closed, or already one of your people: who it writes to stays.",
    written: "It was written to already: who it writes to stays.",
    in_reach_out: "A reach-out has already planned or sent its email: who it writes to stays.",
    checking: "Its address is being checked. Choose once the check is done.",
    no_address: "They have no work address to write to.",
    suppressed: "Their address is on the never-again list.",
    in_people: "They are already one of your people.",
    address_taken: "Another lead has their address.",
    invalid: "Their address did not check out.",
    no_round: "Their address can't be checked from here.",
    searching: "Its search is still running. Choose once it has ended.",
    paused: "Searching is paused, and their address would need checking. Nothing changed.",
  } as Readonly<Record<string, string>>,
  /** A refusal the words above do not name. */
  refusedElse: "Who it writes to did not change. Reload and try again.",
} as const;

/** A refusal of the addressee door in words, by its code (lead_addressee_choose's {error}). */
export const leadAddresseeRefusal = (code: string): string =>
  LEAD_ADDRESSEE_WORDS.refused[code] ?? LEAD_ADDRESSEE_WORDS.refusedElse;

/** What of a lead says whether its company's people may be chosen from (the peek's row, leads_page). */
type LeadOpenFacts = {
  stage?: string | null;
  closed_reason?: string | null;
  contact_id?: string | null;
  contacted_at?: string | null;
  email_state?: string | null;
};

/**
 * Whether another of a company's people may be chosen to write to, as far as the row says: it is open (Ready or Not now),
 * nobody in People was made of it, nobody wrote to it, and no check of its address is on its way. Unsaid, it is not.
 */
const choosable = (l: LeadOpenFacts): boolean =>
  (l.stage === "ready" || l.stage === "nurture") &&
  !l.closed_reason &&
  !l.contact_id &&
  !l.contacted_at &&
  l.email_state !== "checking";

/** A company's peek section, or null for a place (its people are People's, in its own section). */
export function leadCompanyOf(l: { kind?: string | null; facts?: unknown } & LeadOpenFacts): LeadCompanyVM | null {
  if (l.kind !== "company") return null;
  const { facts: f, at } = readFacts(l.facts);
  const open = choosable(l);
  const people = f.people
    .map((p, i) => ({
      name: p.name,
      what: p.title ?? (p.role ? LEAD_ROLE_WORDS[p.role] : null),
      addressee: i === f.addressee,
      profile: p.profile_url,
      index: at[i] ?? i,
      choose: open && i !== f.addressee && !!p.email,
    }))
    .sort((a, b) => Number(b.addressee) - Number(a.addressee));
  return {
    head: LEAD_COMPANY_WORDS.head(people.length),
    people,
    size: f.size ? LEAD_COMPANY_WORDS.size(f.size) : null,
    source: LEAD_CARDS.find((c) => c.id === "people_at_companies")?.rights ?? "",
  };
}
