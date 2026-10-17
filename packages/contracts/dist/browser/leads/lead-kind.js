import { recordOrNull, trimmedOrNull } from "../shared/unknown.js";
import { firstNameOf } from "../templates/templates.js";
import { LEAD_CARDS } from "./search/cards.js";
export const LEAD_KINDS = ["place", "company"];
export const LEAD_SOURCES = ["local_businesses", "people_at_companies", "import"];
const LEAD_ROLES = ["owner", "founder", "executive", "partner", "director", "manager", "staff"];
const isLeadRole = (r) => LEAD_ROLES.includes(r);
export const LEAD_DIRECTORY_WORDS = {
  found: "From a business directory",
  address: "the address came with its people",
  addressAlone: "The address came with its people"
};
export function leadFoundWords(t) {
  if (t.kind === "company") return LEAD_DIRECTORY_WORDS.found;
  if (t.found_on_listing === false) return "From your list";
  return t.search?.asked ? `Found on Google Maps by \u201C${t.search.asked}\u201D` : "Found on Google Maps";
}
export const LEAD_ROLE_WORDS = {
  owner: "owner",
  founder: "founder",
  executive: "executive",
  partner: "partner",
  director: "director",
  manager: "manager",
  staff: "team member"
};
export const LEAD_PEOPLE_MAX = 5;
const NO_LEAD_FACTS = { people: [], addressee: null, size: null };
const capped = (v, max) => trimmedOrNull(v)?.slice(0, max) ?? null;
export function leadRoleOf(seniority, title) {
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
  if (/\b(assistant|coordinator|intern|receptionist|secretary)\b/.test(t)) return "staff";
  if (/\bowner\b/.test(t)) return "owner";
  if (/\b(co-?)?founder\b/.test(t)) return "founder";
  if (/\b(ceo|coo|cfo|cto|cmo|cio|chief|president)\b/.test(t)) return "executive";
  if (/\bpartner\b/.test(t)) return "partner";
  if (/\b(vp|vice president|head of|director)\b/.test(t)) return "director";
  if (/\bmanager\b/.test(t)) return "manager";
  return "staff";
}
function leadPersonOf(raw) {
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
    profile_url: capped(o.profile_url, 300)
  };
}
function readFacts(raw) {
  const o = recordOrNull(raw);
  if (!o) return { facts: NO_LEAD_FACTS, at: [] };
  const stored = (Array.isArray(o.people) ? o.people : []).map((p, at) => ({ person: leadPersonOf(p), at })).filter((x) => x.person !== null).slice(0, LEAD_PEOPLE_MAX);
  const a = o.addressee;
  const addressee = typeof a === "number" && Number.isInteger(a) ? stored.findIndex((x) => x.at === a) : -1;
  return {
    facts: {
      people: stored.map((x) => x.person),
      addressee: addressee >= 0 ? addressee : null,
      size: capped(o.size, 20)
    },
    at: stored.map((x) => x.at)
  };
}
const leadFactsOf = (raw) => readFacts(raw).facts;
export function leadNamedPeople(raw) {
  const { facts, at } = readFacts(raw);
  return facts.people.map((p, i) => ({
    name: p.name,
    title: p.title,
    at: at[i] ?? i,
    addressee: facts.addressee === i
  }));
}
export function leadAddresseeOf(l) {
  if (l.kind !== "company") return null;
  const f = leadFactsOf(l.facts);
  return f.addressee === null ? null : f.people[f.addressee] ?? null;
}
export const LEAD_COMPANY_WORDS = {
  head: (n) => n === 1 ? "Named at this company" : `Named at this company \xB7 ${n}`,
  writesTo: "Your sequence writes to them",
  size: (s) => `${s} people`,
  profile: "Profile"
};
export const LEAD_ADDRESSEE_WORDS = {
  door: "Write to them instead",
  /** What a role that may not is told it cannot do here (gateTitle). */
  gated: "choose who a sequence writes to",
  choosing: "Choosing\u2026",
  /** Chosen: whom the business's reach-out writes to now, and whether their address is checked first or was already. */
  done: (name, business, checking) => checking ? `Your sequence writes to ${name} at ${business} now. Their address is being checked first, which takes a few minutes.` : `Your sequence writes to ${name} at ${business} now. Their address was checked already.`,
  refused: {
    gone: "This lead is gone.",
    not_a_company: "Only a company has people to choose from.",
    no_person: "They are no longer named at this company. Reload and try again.",
    already: "Its sequence writes to them already.",
    closed: "This lead is closed, or already one of your people: who it writes to stays.",
    written: "It was written to already: who it writes to stays.",
    in_reach_out: "A sequence has already planned or sent its email: who it writes to stays.",
    checking: "Its address is being checked. Choose once the check is done.",
    no_address: "They have no work address to write to.",
    suppressed: "Their address is on the never-again list.",
    in_people: "They are already one of your people.",
    address_taken: "Another lead has their address.",
    invalid: "Their address did not check out.",
    no_round: "Their address can't be checked from here.",
    searching: "Its search is still running. Choose once it has ended.",
    paused: "Searching is paused, and their address would need checking. Nothing changed."
  },
  /** A refusal the words above do not name. */
  refusedElse: "Who it writes to did not change. Reload and try again."
};
export const leadAddresseeRefusal = (code) => LEAD_ADDRESSEE_WORDS.refused[code] ?? LEAD_ADDRESSEE_WORDS.refusedElse;
const choosable = (l) => (l.stage === "ready" || l.stage === "nurture") && !l.closed_reason && !l.contact_id && !l.contacted_at && l.email_state !== "checking";
export function leadCompanyOf(l) {
  if (l.kind !== "company") return null;
  const { facts: f, at } = readFacts(l.facts);
  const open = choosable(l);
  const people = f.people.map((p, i) => ({
    name: p.name,
    what: p.title ?? (p.role ? LEAD_ROLE_WORDS[p.role] : null),
    addressee: i === f.addressee,
    profile: p.profile_url,
    index: at[i] ?? i,
    choose: open && i !== f.addressee && !!p.email
  })).sort((a, b) => Number(b.addressee) - Number(a.addressee));
  return {
    head: LEAD_COMPANY_WORDS.head(people.length),
    people,
    size: f.size ? LEAD_COMPANY_WORDS.size(f.size) : null,
    source: LEAD_CARDS.find((c) => c.id === "people_at_companies")?.rights ?? ""
  };
}
