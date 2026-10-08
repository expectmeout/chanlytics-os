/**
 * Where a business's customers book, when it is a page on a booking platform. The first run's Check offers the one a
 * business's website names (3c-4), and the lead finder reads a lead whose website or email address is on one as not
 * the business's own (leads/search/clean.ts): the platforms are named here, once.
 */
import { BOOKING_LINK_MAX } from "../config/workspace-config/config-rules";
import type { BookingTool } from "../calendar/booking-notice";

/** Whether a host is a domain or on one of its subdomains: the one rule every list of hosts here is read by. */
export function onDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * The platforms a business sends its customers to, by host, a particular host before the domain it is on. `path`
 * narrows a host that serves other pages beside its booking pages: Square's appointments, not its shop or its site.
 * `tool` is the booking tool the platform is, where the product reads that tool's booking emails (contracts
 * BOOKING_TOOL_IDS): a booking link on the platform names the tool (bookingToolOfLink), so an owner who gave the link
 * is not asked which tool it is. A platform with no `tool` is one whose emails are not read yet.
 */
const BOOKING_PLATFORMS: readonly { host: string; path?: RegExp; tool?: BookingTool }[] = [
  { host: "vagaro.com", tool: "vagaro" },
  { host: "booksy.com", tool: "booksy" },
  { host: "fresha.com", tool: "fresha" },
  { host: "glossgenius.com", tool: "glossgenius" },
  { host: "styleseat.com", tool: "styleseat" },
  { host: "schedulicity.com", tool: "schedulicity" },
  { host: "mindbodyonline.com", tool: "mindbody" },
  { host: "setmore.com", tool: "setmore" },
  { host: "acuityscheduling.com", tool: "acuity" },
  { host: "as.me", tool: "acuity" },
  { host: "calendly.com", tool: "calendly" },
  { host: "book.squareup.com", path: /^\/appointments\//, tool: "square" },
  { host: "squareup.com", path: /^\/appointments\/book\//, tool: "square" },
  { host: "simplybook.me", tool: "simplybook" },
  { host: "youcanbook.me" },
  { host: "zocdoc.com" },
  { host: "janeapp.com" },
];

/** The tools a platform of the list names, for the test that holds the two lists together (booking-notice.test.mjs). */
export const BOOKING_PLATFORM_TOOLS: readonly BookingTool[] = /* @__PURE__ */ (() =>
  BOOKING_PLATFORMS.flatMap((p) => (p.tool ? [p.tool] : [])))();

/**
 * The booking tool a booking link is on, or null: the link the owner gave as where customers book, read by its host
 * alone. Looser than bookingPageOf on purpose. That one decides whether an address found on a website is a business's
 * own booking page; this one reads an address the owner already said is theirs, so a platform's host is enough.
 */
export function bookingToolOfLink(raw: string | null | undefined): BookingTool | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return null;
  }
  return BOOKING_PLATFORMS.find((p) => p.tool && onDomain(host, p.host))?.tool ?? null;
}

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
  // The longest booking page the config keeps is its booking link's own cap.
  return page.length <= BOOKING_LINK_MAX ? page : null;
}
