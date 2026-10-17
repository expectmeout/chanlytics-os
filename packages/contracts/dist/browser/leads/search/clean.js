import { isFreeMail } from "../../email/free-mail.js";
import { normalizeEmail } from "../../shared/email-address.js";
import { normalizePhone } from "../../shared/phone.js";
import { BOOKING_PLATFORM_HOSTS, onDomain } from "../../google/booking-page.js";
import { LEAD_FACT_MAX } from "./caps.js";
import { US_CODES, US_STATES } from "./plan.js";
export const LEAD_PLATFORM_HOSTS = /* @__PURE__ */ (() => [
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
  "g.page"
])();
export const LEAD_JUNK_EMAIL_DOMAINS = /* @__PURE__ */ (() => [
  ...BOOKING_PLATFORM_HOSTS,
  "square.site",
  "godaddy.com",
  "wix.com",
  "wixpress.com",
  "sentry.io",
  "example.com",
  "domain.com",
  "yourdomain.com",
  "email.com"
])();
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
  "donotreply"
];
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
  "postmaster"
];
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
  "admin"
];
const has = (xs, v) => xs.includes(v);
export function cleanEmailCandidates(emails, host) {
  const seen = /* @__PURE__ */ new Set();
  const own = [];
  const free = [];
  const foreign = [];
  const dropped = [];
  for (const raw of emails) {
    const fixed = String(raw ?? "").trim().replace(/^mailto:/i, "").replace(/@www\./i, "@");
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
  const deskRank = (a) => {
    const i = DESK_LOCALS.indexOf(a.split("@")[0]);
    return i < 0 ? DESK_LOCALS.length : i;
  };
  own.sort((a, b) => deskRank(a) - deskRank(b));
  const foreignDomains = new Set(foreign.map((a) => a.split("@")[1]));
  const keep = (xs, limit) => {
    for (const x of xs.slice(limit)) dropped.push({ email: x, why: "over_limit" });
    return xs.slice(0, limit);
  };
  const kept = [...keep(own, 5), ...keep(free, 3)];
  if (foreignDomains.size <= 3) kept.push(...keep(foreign, 2));
  else for (const x of foreign) dropped.push({ email: x, why: "foreign_list" });
  return { kept, dropped };
}
const NANP = /^\+1[2-9]\d{2}[2-9]\d{6}$/;
export function usPhone(raw) {
  const e164 = normalizePhone(raw);
  if (!e164 || !NANP.test(e164)) return null;
  const ten = e164.slice(2);
  if (/^(\d)\1{9}$/.test(ten) || ten === "1234567890") return null;
  return e164;
}
export function isSiteRoot(url) {
  try {
    const w = (url ?? "").trim();
    return new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`).pathname.replace(/\/+$/, "") === "";
  } catch {
    return false;
  }
}
export function siteHost(url) {
  if (!url) return null;
  let host;
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
export function stateCode(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (up.length === 2 && US_CODES.has(up)) return up;
  return US_STATES[s.toLowerCase()] ?? null;
}
const oneOf = (w) => /ies$/.test(w) ? w.replace(/ies$/, "y") : /(sses|ches|shes|xes|zes)$/.test(w) ? w.replace(/es$/, "") : /[^su]s$/.test(w) ? w.slice(0, -1) : w;
export function leadKindKey(words) {
  const k = words.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^[^a-z]+/, "").replace(/_+$/, "").slice(0, 40).replace(/_+$/, "").replace(/[a-z]+$/, oneOf);
  return k.length >= 2 ? k : "business";
}
