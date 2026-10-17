import { BOOKING_LINK_MAX } from "../config/workspace-config/config-rules.js";
export function onDomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}
const BOOKING_PLATFORMS = [
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
  { host: "janeapp.com" }
];
export const BOOKING_PLATFORM_TOOLS = /* @__PURE__ */ (() => BOOKING_PLATFORMS.flatMap((p) => p.tool ? [p.tool] : []))();
export function bookingToolOfLink(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let host;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  return BOOKING_PLATFORMS.find((p) => p.tool && onDomain(host, p.host))?.tool ?? null;
}
export const BOOKING_PLATFORM_HOSTS = /* @__PURE__ */ (() => BOOKING_PLATFORMS.map((p) => p.host))();
const PLATFORM_OWN = /* @__PURE__ */ new Set([
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
  "legal"
]);
export function bookingPageOf(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let u;
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
  return page.length <= BOOKING_LINK_MAX ? page : null;
}
