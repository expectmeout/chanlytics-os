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
