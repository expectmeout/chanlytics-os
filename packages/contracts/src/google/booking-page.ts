/**
 * Where a business's customers book, when it is a page on a booking platform. The first run's Check offers the one a
 * business's website names (3c-4), and the lead finder reads a lead whose website or email address is on one as not
 * the business's own (leads/search/clean.ts): the platforms are named here, once.
 */
import { BrainConfigSchema } from "../config/workspace-config/brain-config";

/** Whether a host is a domain or on one of its subdomains: the one rule every list of hosts here is read by. */
export function onDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * The platforms a business sends its customers to, by host, a particular host before the domain it is on. `path`
 * narrows a host that serves other pages beside its booking pages: Square's appointments, not its shop or its site.
 */
const BOOKING_PLATFORMS: readonly { host: string; path?: RegExp }[] = [
  { host: "vagaro.com" },
  { host: "booksy.com" },
  { host: "fresha.com" },
  { host: "glossgenius.com" },
  { host: "styleseat.com" },
  { host: "schedulicity.com" },
  { host: "mindbodyonline.com" },
  { host: "setmore.com" },
  { host: "acuityscheduling.com" },
  { host: "as.me" },
  { host: "calendly.com" },
  { host: "book.squareup.com", path: /^\/appointments\// },
  { host: "squareup.com", path: /^\/appointments\/book\// },
  { host: "simplybook.me" },
  { host: "youcanbook.me" },
  { host: "zocdoc.com" },
  { host: "janeapp.com" },
];

/** The platforms' hosts, for a reader that asks only whether an address is on one (the lead finder's). */
export const BOOKING_PLATFORM_HOSTS: readonly string[] = /* @__PURE__ */ (() => BOOKING_PLATFORMS.map((p) => p.host))();

/** A platform's own subdomains, which serve its help, its news and its hiring: never a business's page. */
const PLATFORM_OWN = new Set([
  "help",
  "support",
  "blog",
  "docs",
  "status",
  "community",
  "careers",
  "developers",
  "partners",
  "press",
  "legal",
]);

/** The longest booking page the config keeps: its booking link's own cap. */
const BOOKING_PAGE_MAX = /* @__PURE__ */ (() => BrainConfigSchema.shape.booking_link.unwrap().maxLength ?? Infinity)();

/**
 * The booking page an address is, as the https address the config keeps; null when it is not one. It is a business's
 * own page when it is on a subdomain of the platform (other than `www` and the platform's own help, news and hiring
 * subdomains), or has a path: the platform's front door, where a "Powered by" link goes, names no business. The
 * fragment is the page's own, and is dropped.
 */
export function bookingPageOf(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const platform = BOOKING_PLATFORMS.find((p) => onDomain(host, p.host));
  if (!platform) return null;
  const sub = host === platform.host ? null : host.slice(0, -platform.host.length - 1);
  if (sub !== null && PLATFORM_OWN.has(sub.slice(sub.lastIndexOf(".") + 1))) return null;
  if (platform.path && !platform.path.test(u.pathname)) return null;
  if (sub === null && !u.pathname.split("/").some(Boolean)) return null;
  u.protocol = "https:";
  u.hash = "";
  const page = u.toString();
  return page.length <= BOOKING_PAGE_MAX ? page : null;
}
