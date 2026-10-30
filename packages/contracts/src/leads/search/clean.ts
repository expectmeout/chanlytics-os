/**
 * The cleaner (§7.2): what code keeps of a listing before the judge sees it. The hosts and the addresses that are
 * never the business, the emails worth showing (the business's own first), a US phone anyone can dial, the site's
 * own host and a state as its code.
 */
import { isFreeMail } from "../../email/free-mail";
import { normalizeEmail } from "../../shared/email-address";
import { normalizePhone } from "../../shared/phone";
import { BOOKING_PLATFORM_HOSTS, onDomain } from "../../google/booking-page";
import { LEAD_FACT_MAX } from "./caps";
import { US_CODES, US_STATES } from "./plan";

/* ---------------------------------------------------- the cleaner (§7.2) -- */

/**
 * Hosts that are a booking platform (booking-page.ts, which names them once), a site builder's shared domain or a
 * social page: a business there has no site of its own.
 */
export const LEAD_PLATFORM_HOSTS: readonly string[] = /* @__PURE__ */ (() => [
  ...BOOKING_PLATFORM_HOSTS,
  "square.site",
  "godaddysites.com",
  "wixsite.com",
  "business.site",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "linktr.ee",
  "linkin.bio",
  "yelp.com",
  "google.com",
  "g.page",
])();
/** Address domains that are never the business: platforms, builders' placeholders, trackers. */
export const LEAD_JUNK_EMAIL_DOMAINS: readonly string[] = /* @__PURE__ */ (() => [
  ...BOOKING_PLATFORM_HOSTS,
  "square.site",
  "godaddy.com",
  "wix.com",
  "wixpress.com",
  "sentry.io",
  "example.com",
  "domain.com",
  "yourdomain.com",
  "email.com",
])();
/** Local parts that are a template's placeholder, not a mailbox. */
export const LEAD_PLACEHOLDER_LOCALS = [
  "filler",
  "yourdomain",
  "youremail",
  "your",
  "example",
  "email",
  "name",
  "user",
  "username",
  "test",
  "noreply",
  "no-reply",
  "donotreply",
] as const;
/** Corporate roles that are not how a business takes a customer (§7.2). */
export const LEAD_ROLE_LOCALS = [
  "careers",
  "career",
  "jobs",
  "recruiting",
  "recruitment",
  "hr",
  "media",
  "press",
  "pr",
  "privacy",
  "legal",
  "webmaster",
  "abuse",
  "postmaster",
] as const;
/** A front desk's addresses, first among a business's own. */
const DESK_LOCALS = [
  "intake",
  "info",
  "hello",
  "contact",
  "office",
  "team",
  "book",
  "booking",
  "bookings",
  "appointments",
  "studio",
  "frontdesk",
  "admin",
];

const has = (xs: readonly string[], v: string) => xs.includes(v);

export interface CleanedEmails {
  /** Best first: the business's own (five at most, a front desk first), free-mail (three), another company's (two). */
  kept: string[];
  dropped: {
    email: string;
    why: "malformed" | "duplicate" | "junk_domain" | "placeholder" | "role" | "image" | "foreign_list" | "over_limit";
  }[];
}

/**
 * The addresses worth showing the judge, and why each of the others was
 * dropped (§7.2). When the page names more than three other companies'
 * domains, that is a list of partners or brands, not the business, and none
 * of theirs is kept.
 */
export function cleanEmailCandidates(emails: string[], host: string | null): CleanedEmails {
  const seen = new Set<string>();
  const own: string[] = [];
  const free: string[] = [];
  const foreign: string[] = [];
  const dropped: CleanedEmails["dropped"] = [];
  for (const raw of emails) {
    const fixed = String(raw ?? "")
      .trim()
      .replace(/^mailto:/i, "")
      .replace(/@www\./i, "@");
    const address = normalizeEmail(fixed);
    if (!address) {
      dropped.push({ email: String(raw ?? ""), why: "malformed" });
      continue;
    }
    if (seen.has(address)) {
      dropped.push({ email: address, why: "duplicate" });
      continue;
    }
    seen.add(address);
    const [local, domain] = address.split("@");
    if (LEAD_JUNK_EMAIL_DOMAINS.some((d) => onDomain(domain, d))) {
      dropped.push({ email: address, why: "junk_domain" });
      continue;
    }
    if (has(LEAD_PLACEHOLDER_LOCALS, local)) {
      dropped.push({ email: address, why: "placeholder" });
      continue;
    }
    if (has(LEAD_ROLE_LOCALS, local.split(/[.+_-]/)[0])) {
      dropped.push({ email: address, why: "role" });
      continue;
    }
    if (/\.(png|jpe?g|gif|webp|svg)$/.test(domain)) {
      dropped.push({ email: address, why: "image" });
      continue;
    }
    const isOwn = !!host && (domain === host || domain.endsWith(`.${host}`));
    (isOwn ? own : isFreeMail(domain) ? free : foreign).push(address);
  }
  const deskRank = (a: string) => {
    const i = DESK_LOCALS.indexOf(a.split("@")[0]);
    return i < 0 ? DESK_LOCALS.length : i;
  };
  own.sort((a, b) => deskRank(a) - deskRank(b));
  const foreignDomains = new Set(foreign.map((a) => a.split("@")[1]));
  const keep = (xs: string[], limit: number) => {
    for (const x of xs.slice(limit)) dropped.push({ email: x, why: "over_limit" });
    return xs.slice(0, limit);
  };
  const kept = [...keep(own, 5), ...keep(free, 3)];
  if (foreignDomains.size <= 3) kept.push(...keep(foreign, 2));
  else for (const x of foreign) dropped.push({ email: x, why: "foreign_list" });
  return { kept, dropped };
}

const NANP = /^\+1[2-9]\d{2}[2-9]\d{6}$/;

/** A US number anyone can dial, in E.164; null for a placeholder, a mis-prefixed number or a foreign one. */
export function usPhone(raw: string | null | undefined): string | null {
  const e164 = normalizePhone(raw);
  if (!e164 || !NANP.test(e164)) return null;
  const ten = e164.slice(2);
  if (/^(\d)\1{9}$/.test(ten) || ten === "1234567890") return null;
  return e164;
}

/**
 * Whether a website is its host's root ("/", with or without a query), read the way siteHost reads it. A page under a
 * host (an ISP's "/~joe/", a directory's "/listing/42") is no proof the host is the business's own.
 */
export function isSiteRoot(url: string | null | undefined): boolean {
  try {
    const w = (url ?? "").trim();
    return new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`).pathname.replace(/\/+$/, "") === "";
  } catch {
    return false;
  }
}

/** The website's host, www. removed; null when there is none of their own (a platform, a social page). */
export function siteHost(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  if (!host.includes(".") || host.length > LEAD_FACT_MAX) return null;
  if (LEAD_PLATFORM_HOSTS.some((p) => onDomain(host, p))) return null;
  return host;
}

/** "Texas" or "TX" → "TX"; null for anything that is not a US state or DC. */
export function stateCode(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (up.length === 2 && US_CODES.has(up)) return up;
  return US_STATES[s.toLowerCase()] ?? null;
}

/** One of a word: "bakeries" -> "bakery", "classes" -> "class", "studios" -> "studio"; "glass" and "bus" stay. */
const oneOf = (w: string): string =>
  /ies$/.test(w)
    ? w.replace(/ies$/, "y")
    : /(sses|ches|shes|xes|zes)$/.test(w)
      ? w.replace(/es$/, "")
      : /[^su]s$/.test(w)
        ? w.slice(0, -1)
        : w;

/**
 * A kind of business as one key, one of them: "Personal trainers", "personal_trainer" and "personal-trainers" are all
 * "personal_trainer". A plan keeps its kind by this key (planLeadSearch), a round that ends adds to its kind's counts
 * by it (lead_niche_priors, 00398), and the ideas group a workspace's searches by it, so a model that writes the plural
 * one day and the singular the next names one kind.
 */
export function leadKindKey(words: string): string {
  const k = words
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/, "")
    .slice(0, 40)
    .replace(/_+$/, "")
    .replace(/[a-z]+$/, oneOf);
  return k.length >= 2 ? k : "business";
}

/* ------------------------------------------ the name it is called by -- */

/** A listing's keyword tail starts at a bar, a spaced dash, a colon or a semicolon: what follows is no part of a name. */
const NAME_TAIL = /\s*\|\s*|\s+[-–—]\s+|:\s+|;\s+/;
/** A company's form on the end of its name, a comma before it or not: "Corp.", ", INC", "LLC". */
const COMPANY_FORM = /,?\s+(?:inc|incorporated|llc|l\.l\.c|corp|corporation|ltd|pllc|llp)\.?$/i;
/** Words a name keeps in small letters, unless it starts with one. */
const NAME_JOINERS = new Set(
  "a an and at by da de del der du for in la le n of on or the to van von with y".split(" "),
);
/** Two letters a name in capitals says as a word, not as initials: "MY", not "AP". */
const TWO_LETTER_WORDS = new Set(["be", "do", "go", "hi", "is", "me", "my", "no", "so", "up", "we"]);
/** The two consonants a word may start with; any other two are letters said one by one ("HVAC", "CPA"). */
const WORD_ONSETS = new Set(
  "bl br ch cl cr dr dw fl fr gh gl gn gr kl kn kr ph pl pn pr ps rh sc sh sk sl sm sn sp sq st sw th tr ts tw wh wr".split(
    " ",
  ),
);
/** What makes a word's first two letters no run of consonants: a vowel, or a y ("Lynn"). */
const VOWEL = /[aeiouy]/;

const hasLetter = (s: string) => /\p{L}/u.test(s);
/** The cut, where it leaves a name; else what was there. */
const keptOr = (was: string, cut: string): string => (hasLetter(cut) ? cut.trim() : was);

/** A city on the end, with its state after it, or marked off by a dash or a comma: "-Springfield IL", " Springfield, IL". */
function withoutPlace(name: string, city: string | null | undefined): string {
  const c = city?.trim();
  if (!c) return name;
  const at = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const stated = name.match(new RegExp(`(?:\\s*[-–—,]\\s*|\\s+)${at},?\\s+([A-Za-z]{2})\\.?$`, "i"));
  if (stated && US_CODES.has((stated[1] ?? "").toUpperCase())) return name.slice(0, stated.index);
  const marked = name.match(new RegExp(`\\s*[-–—,]\\s*${at}$`, "i"));
  return marked ? name.slice(0, marked.index) : name;
}

/** What comes before a comma, where two words or more do: a name that starts with a list ("Paint, Paper & Tile") keeps it. */
function beforeComma(name: string): string {
  const head = name.split(/,\s+/)[0] ?? name;
  return head !== name && head.trim().split(" ").length >= 2 ? head : name;
}

/** One word of a name in capitals, as a person writes it: initials and letters said one by one stay. */
function saidFromCapitals(word: string, first: boolean): string {
  return word
    .split(/(?<=[-/])/)
    .map((part, i) => {
      const lower = part.toLowerCase();
      const letters = lower.replace(/[^\p{L}]/gu, "");
      if (!letters || /[\d.]/.test(part)) return part;
      if (NAME_JOINERS.has(letters) && !(first && i === 0)) return lower;
      if (letters.length <= 2 && !TWO_LETTER_WORDS.has(letters)) return part;
      if (!/[aeiou]/.test(letters)) return part;
      if (!VOWEL.test(letters.slice(0, 2)) && !WORD_ONSETS.has(letters.slice(0, 2))) return part;
      return lower
        .replace(/^(\P{L}*)(\p{L})/u, (_, lead: string, l: string) => lead + l.toUpperCase())
        .replace(/^(\p{L})'(\p{L})/u, (_, a: string, b: string) => `${a}'${b.toUpperCase()}`);
    })
    .join("");
}

/** A word wholly in small letters, raised as a name's are; a joiner stays small after the first word. */
const raised = (word: string, first: boolean): string =>
  /^\p{Ll}+(?:['’]\p{Ll}+)*$/u.test(word) && (first || !NAME_JOINERS.has(word))
    ? word.charAt(0).toUpperCase() + word.slice(1)
    : word;

/** A name's capitals as a person writes them: one in capitals said in theirs, a word in small letters raised. */
function casedAsSaid(name: string): string {
  const letters = name.replace(/[^\p{L}]/gu, "");
  const shouting = letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  return name
    .split(" ")
    .map((w, i) => (shouting ? saidFromCapitals(w, i === 0) : raised(w, i === 0)))
    .join(" ");
}

/**
 * The name a business is called by in what it reads (30 Oct 2026: a cold email said "for shops like" a listing's whole
 * title, its city and three services after bars): its listing's name without what a listing adds to be found. A tail
 * after a bar, a spaced dash, a colon or a semicolon, or after a comma that follows two words; a city on the end with
 * its state, or marked off; Inc, LLC, Corp and the like; a name in capitals said in a person's, and a word in small
 * letters raised. What these cannot tell stays as its listing writes it: a name's own capitals ("NOVA", "iFix"), a city
 * with no state after it, services with no mark before them. Nothing is cut to nothing. The listing's name stays the
 * lead's, as Leads shows it; every email's fill says this (reach-out-rules reachOutValues), and so do the opening's
 * record and its check.
 */
export function leadCalledByOf(l: { business_name: string | null; city?: string | null }): string | null {
  const listed = (l.business_name ?? "").replace(/\s+/g, " ").trim();
  if (!listed) return null;
  // The first part that says something, unless it is only the city ("Springfield | Harbor Movers").
  const city = l.city?.trim().toLowerCase();
  const head = listed.split(NAME_TAIL).find((p) => hasLetter(p) && p.trim().toLowerCase() !== city) ?? listed;
  let name = keptOr(listed, head);
  name = keptOr(name, withoutPlace(name, l.city));
  name = keptOr(name, name.replace(COMPANY_FORM, ""));
  name = keptOr(name, beforeComma(name));
  name = keptOr(name, name.replace(COMPANY_FORM, ""));
  return casedAsSaid(name);
}
