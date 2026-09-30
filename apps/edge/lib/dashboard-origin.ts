/**
 * The two addresses the edge writes: the dashboard's, for any link it puts into a message or a redirect, and its own,
 * as a provider must be told to reach it (the voice tools and webhooks, the lead finder's callback). Its own module so
 * that a sender (a lead search's question, a line's registration) does not load the billing module, and Stripe with
 * it.
 *
 * Both were production's addresses written as code defaults, so a production edge that lost its setting went on
 * writing whatever the default said. Production names both now (env.ts refuses to load without them); a preview or a
 * laptop keeps the old defaults, which is what they have always done.
 */
import { env, httpsOriginOf, isProduction } from "./env.js";
import { logger } from "./log.js";

/** The dashboard's address off production when DASHBOARD_ORIGIN is not set. */
const NOT_PRODUCTION_DASHBOARD_ORIGIN = "https://app.chanlytics.com";
/** The edge's own address off production when EDGE_ORIGIN is not set: production's, as it always was. */
const NOT_PRODUCTION_EDGE_ORIGIN = "https://chanlytics-messaging.vercel.app";

let rejectedSaid = false;

/**
 * An address production must name: the variable's https origin; off production, the old default. Production without
 * it never loads (env.ts assertBootable), so the throw is only reached by a module loaded some other way.
 */
function namedInProduction(name: "DASHBOARD_ORIGIN" | "EDGE_ORIGIN", value: string | undefined, fallback: string) {
  const o = httpsOriginOf(value);
  if (o) return o;
  if (isProduction()) throw new Error(`env_invalid: ${name} is required in production`);
  return fallback;
}

/** The dashboard's origin only -- no path, no trailing slash. */
export function dashboardOrigin(): string {
  return namedInProduction("DASHBOARD_ORIGIN", env.DASHBOARD_ORIGIN, NOT_PRODUCTION_DASHBOARD_ORIGIN);
}

/** This deployment's own origin, as a provider must be told to reach it -- no path, no trailing slash. */
export function edgeOrigin(): string {
  return namedInProduction("EDGE_ORIGIN", env.EDGE_ORIGIN, NOT_PRODUCTION_EDGE_ORIGIN);
}

/**
 * Where this deployment answers the voice tools, as the provider must be told to reach it: the booking-link function
 * on this edge's own origin (the availability tool, the webhooks and the inbound-SMS URL are built beside it). It was
 * a constant inside a shared package, which is exactly the thing that has to be edited and redeployed to move an
 * environment, and the agents any deployment provisioned posted to production because the package defaulted to it.
 */
export function edgeFnUrl(): string {
  return `${edgeOrigin()}/api/retell-fn`;
}

/**
 * Where a cold email's unsubscribe links point, and where the probe opens them (Reach out D17): UNSUBSCRIBE_ORIGIN, a
 * domain of cold mail's own, when it is an origin; otherwise the dashboard's, as before the switch.
 */
export function unsubscribeOrigin(): string {
  const raw = env.UNSUBSCRIBE_ORIGIN;
  const o = httpsOriginOf(raw);
  // Set and unreadable (a path, a port, no https): the links stay on the dashboard, which is said once, never silently.
  if (raw && !o && !rejectedSaid) {
    rejectedSaid = true;
    logger().warn("email_switch_rejected", { name: "UNSUBSCRIBE_ORIGIN", why: "not an https origin: it is ignored" });
  }
  return o ?? dashboardOrigin();
}

/** Whether UNSUBSCRIBE_ORIGIN is set and cannot be read, so the links fall back to the dashboard's (/api/diag). */
export function unsubscribeOriginRejected(): boolean {
  return !!env.UNSUBSCRIBE_ORIGIN && !httpsOriginOf(env.UNSUBSCRIBE_ORIGIN);
}
