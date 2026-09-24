/**
 * Where a business's customers book, when it is a page on a booking platform. The first run's Check offers the one a
 * business's website links to (3c-4), and the lead finder reads a lead whose website is on one as having no site of
 * its own (lead-search.ts siteHost): the platforms are named here, once.
 */
import { BrainConfigSchema } from "./config";

/**
 * The platforms a business sends its customers to, by host: a page on one, or on a subdomain of one, is where that
 * business's customers book. `path` narrows a host that serves other pages beside its booking pages.
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
  { host: "squareup.com", path: /^\/appointments\// },
  { host: "simplybook.me" },
  { host: "youcanbook.me" },
  { host: "zocdoc.com" },
  { host: "janeapp.com" },
];

/** The platforms' hosts, for a reader that asks only whether an address is on one (the lead finder's). */
export const BOOKING_PLATFORM_HOSTS: readonly string[] = /* @__PURE__ */ (() => BOOKING_PLATFORMS.map((p) => p.host))();

/** The longest booking page the config keeps: its booking link's own cap. */
const BOOKING_PAGE_MAX = /* @__PURE__ */ (() => BrainConfigSchema.shape.booking_link.unwrap().maxLength ?? Infinity)();

/**
 * The booking page an address is, as the https address the config keeps; null when it is not one. It is a business's
 * own page when it is on a subdomain of the platform other than `www`, or has a path: the platform's front door, where
 * a "Powered by" link goes, names no business. The fragment is the page's own, and is dropped.
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
  const platform = BOOKING_PLATFORMS.find((p) => host === p.host || host.endsWith(`.${p.host}`));
  if (!platform) return null;
  if (platform.path && !platform.path.test(u.pathname)) return null;
  if (host === platform.host && !u.pathname.split("/").some(Boolean)) return null;
  u.protocol = "https:";
  u.hash = "";
  const page = u.toString();
  return page.length <= BOOKING_PAGE_MAX ? page : null;
}
