/**
 * The dashboard's address, for any link the edge writes into a message or a redirect. Its own module so that a
 * sender (a lead search's question, a line's registration) does not load the billing module, and Stripe with it.
 */
import { env } from "./env.js";

/** The dashboard's address when DASHBOARD_ORIGIN is not set. */
export const DEFAULT_DASHBOARD_ORIGIN = "https://app.chanlytics.com";

/** An origin only -- no path, no trailing slash -- or the default. */
export function dashboardOrigin(): string {
  const o = env.DASHBOARD_ORIGIN;
  return o && /^https:\/\/[a-z0-9.-]+$/i.test(o) ? o : DEFAULT_DASHBOARD_ORIGIN;
}
