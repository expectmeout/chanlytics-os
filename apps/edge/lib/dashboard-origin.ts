/**
 * The dashboard's address, for any link the edge writes into a message or a redirect. Its own module so that a
 * sender (a lead search's question, a line's registration) does not load the billing module, and Stripe with it.
 */
import { env } from "./env.js";
import { logger } from "./log.js";

/** The dashboard's address when DASHBOARD_ORIGIN is not set. */
export const DEFAULT_DASHBOARD_ORIGIN = "https://app.chanlytics.com";

const ORIGIN = /^https:\/\/[a-z0-9.-]+$/i;
/** An origin as typed: a trailing slash is the same origin (unsubscribeUrl strips it too). */
const originOf = (v: string | undefined): string | null => {
  const o = v?.trim().replace(/\/+$/, "") ?? "";
  return ORIGIN.test(o) ? o : null;
};
let rejectedSaid = false;

/** An origin only -- no path, no trailing slash -- or the default. */
export function dashboardOrigin(): string {
  const o = env.DASHBOARD_ORIGIN;
  return o && ORIGIN.test(o) ? o : DEFAULT_DASHBOARD_ORIGIN;
}

/**
 * Where a cold email's unsubscribe links point, and where the probe opens them (Reach out D17): UNSUBSCRIBE_ORIGIN, a
 * domain of cold mail's own, when it is an origin; otherwise the dashboard's, as before the switch.
 */
export function unsubscribeOrigin(): string {
  const raw = env.UNSUBSCRIBE_ORIGIN;
  const o = originOf(raw);
  // Set and unreadable (a path, a port, no https): the links stay on the dashboard, which is said once, never silently.
  if (raw && !o && !rejectedSaid) {
    rejectedSaid = true;
    logger().warn("email_switch_rejected", { name: "UNSUBSCRIBE_ORIGIN", why: "not an https origin: it is ignored" });
  }
  return o ?? dashboardOrigin();
}

/** Whether UNSUBSCRIBE_ORIGIN is set and cannot be read, so the links fall back to the dashboard's (/api/diag). */
export function unsubscribeOriginRejected(): boolean {
  return !!env.UNSUBSCRIBE_ORIGIN && !originOf(env.UNSUBSCRIBE_ORIGIN);
}
