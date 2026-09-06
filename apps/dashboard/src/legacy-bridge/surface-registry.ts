/**
 * THE surface classification — one table that says, for every route the shell
 * knows, whether it is fed by real data or by the mockup's invented seeds.
 *
 * Why this exists as a registry instead of per-route conditionals: the previous
 * approach gated exactly one route (Settings) by hand and left fifteen
 * fabricated branches reachable in production — Broadcasts animating a delivery
 * that never happened, Calendar claiming three times that a customer was
 * notified, Reports showing $48,300 the schema has no column for. A rule
 * applied per-route is a rule someone forgets per-route. Here the
 * classification IS the enforcement: the shell asks this table, and anything
 * marked "demo" renders the honest ComingSoon pane outside an explicit demo
 * session. A test asserts the table covers every route the shell declares, so
 * adding a route without classifying it fails CI rather than shipping a
 * finished-looking fabrication.
 *
 * "demo" does not mean bad — it means the surface's data is invented, and
 * invented data may only render in a session that declared itself a demo
 * (window.__DEMO_MODE). Flipping a surface to real later is a one-line change
 * here, made in the same directory as the override that makes it true.
 */

export type SurfaceState = "real" | "demo";

export const SURFACE_STATES: Record<string, SurfaceState> = {
  // Fed by live data through the SurfaceData seam.
  today: "real",
  inbox: "real",
  conversations: "real",
  clients: "real",  // People · Clients; Leads / Deal board / Lists stay demo
  reports: "real",  // the receptionist's numbers; the share link stays demo
  live: "real",     // calls in progress + the last few; Listen / Take over / End stay in the demo

  // Render entirely from seed data. Each becomes one edited line here the day
  // its slice ships.
  leads: "demo",
  segments: "demo",
  pipeline: "demo",
  calendar: "demo",
  shared: "demo",   // the read-only report viewer — a share link over invented numbers
  tasks: "demo",
  fleet: "demo",
  store: "demo",
  studio: "demo",
  outbound: "demo",
  content: "demo",
  broadcasts: "real",  // one approved template to the people who said yes; SMS and email stay not available
  admin: "demo",    // the page itself: every pane below is classified, and a
                    // pane nobody has listed inherits this honest default
  "admin/workspace": "real",
  "admin/autonomy": "real",   // the policies table, live for the reply row
  "admin/notifications": "real",  // who is alerted, from tenant_config
  "admin/integrations": "real",   // the channels in tenant_channels, read-only
  // Not built, and said so IN the pane. Falling through to the page's "demo"
  // replaced all of Settings with a bare card titled "billing"; the pane now
  // keeps the nav and states what exists instead (settings.jsx PaneSoon).
  "admin/billing": "real",
  "admin/memory": "real",
};

/**
 * Which SurfaceData override backs each real route — the map the route gate
 * consults before painting. Lives HERE, beside the classification, because the
 * two must agree: a surface is only "real" if an override actually feeds it,
 * and a test pins that every "real" row has an entry and vice versa.
 */
export const ROUTE_SURFACE: Record<string, string> = {
  today: "today",
  inbox: "inbox",
  conversations: "conversations",
  clients: "people",
  reports: "reports",
  live: "live",
  broadcasts: "broadcasts",
  // The pane is fed by settingsOverride, so the route gate waits for it the
  // same way the other real routes do — otherwise it paints the mockup's
  // fabricated business for a frame before the truth arrives.
  "admin/workspace": "settings",
  "admin/autonomy": "settings",
  "admin/notifications": "settings",
  "admin/integrations": "settings",
  "admin/billing": "settings",
  "admin/memory": "settings",
};

/**
 * Published for the mockup shell (a classic script that cannot import).
 * Absent — the standalone mockup opened without the bridge — everything
 * renders, which is correct there: the whole artifact is a demo.
 */
/**
 * The state of one route, most specific first.
 *
 * Settings is one page with six panes behind it, and they are not all at the
 * same stage: the workspace pane can be fed by real APIs while billing and
 * integrations are still drawn from seeds. Classifying only the PAGE forced a
 * choice between hiding a finished pane and shipping five invented ones — so
 * the table now accepts `admin/workspace` as well as `admin`, and falls back
 * to the page when no sub-route is listed.
 *
 * The fallback is what keeps this safe: a new pane nobody has classified
 * inherits its page's state, which is `demo`, which is the honest default.
 */
/**
 * The pane a page opens on when the route names none.
 *
 * The shell renders Settings as `tab={param || "workspace"}`, so /admin with
 * no pane DOES render the workspace pane — while the gate, asked about
 * "admin", answered `demo` and replaced it with the Coming Soon card. The
 * sidebar's Settings link is exactly that route, so the finished pane was
 * unreachable by normal navigation and only a hand-typed #/admin/workspace
 * could find it.
 *
 * The gate has to be asked about what will actually RENDER.
 */
export const SURFACE_DEFAULT_PARAM: Record<string, string> = {
  admin: "workspace",
};

/**
 * Which override the route gate must WAIT for, most specific first.
 *
 * The twin of surfaceStateFor, and it exists because the registry being right
 * was not enough. ROUTE_SURFACE has carried `admin/workspace` since Settings
 * was flipped, but the gate looked up `ROUTE_SURFACE[page]` with the bare page
 * — "admin" — found nothing, and answered "ready" before any settings data had
 * arrived. A cold load of Settings therefore painted the mockup's business,
 * its invented staff and its invented phone number to a real owner, for as
 * long as the fetch took.
 *
 * Same resolution as the classification, for the same reason: the gate has to
 * be asked about what will actually RENDER.
 */
export function routeSurfaceFor(page: string, param?: string | null): string | undefined {
  const pane = param || SURFACE_DEFAULT_PARAM[page];
  if (pane) {
    const specific = ROUTE_SURFACE[`${page}/${pane}`];
    if (specific) return specific;
  }
  return ROUTE_SURFACE[page];
}

export function surfaceStateFor(page: string, param?: string | null): SurfaceState | undefined {
  const pane = param || SURFACE_DEFAULT_PARAM[page];
  if (pane) {
    const specific = SURFACE_STATES[`${page}/${pane}`];
    if (specific) return specific;
  }
  return SURFACE_STATES[page];
}

export function installSurfaceRegistry(): void {
  (window as unknown as {
    __surfaceState?: (page: string, param?: string | null) => SurfaceState | undefined;
  }).__surfaceState = surfaceStateFor;
}
