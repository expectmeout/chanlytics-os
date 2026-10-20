/**
 * The shell's shared contracts (moved from legacy/data/constants.jsx, the one-system plan's step 7e): the confidence
 * thresholds, the seed clock, the route builders, the frame's move and the address, and the money words. Canonical values
 * live here and in legacy/CLAUDE.md: never fork a threshold, a route string or an agent's identity in a page. Published
 * as `window.CHANLY` by frame-globals.ts, where the pages and the adapters read it (step 9 ends the reads).
 */
import { frameShell } from "./frame-window";

/** The address as a page reads and moves it: the bridge's in the app, the hash in the standalone mockup. */
interface GoOptions {
  replace?: boolean;
  quiet?: boolean;
}

/** The bridge's address (legacy-bridge/shell.ts `__shell`), where the frame has one. */
type ShellAddress = {
  route: () => string;
  href: (route: string) => string;
  go: (route: string, opts?: GoOptions) => void;
  hear: (fn: () => void) => () => void;
  warm?: (route: string) => void;
  warmSoon?: (routes: string[]) => void;
  keepWarm?: (routes: string[]) => void;
};
const shellAddress = (): ShellAddress | null => {
  const s: Partial<ShellAddress> | undefined = frameShell();
  return s && s.route ? (s as ShellAddress) : null;
};

/** The route on screen: the bridge's, else the mockup's hash (`#/<route>`), else Today. */
const routeOnScreen = (): string => {
  const s = shellAddress();
  if (s) return s.route();
  const h = window.location.hash;
  return (h.indexOf("#/") === 0 ? h.slice(2) : "") || "today";
};

/** A move: the bridge's, else the hash's (a push; `replace`, a redirect; with `quiet`, a page saying where it stands). */
const addressGo = (route: string, opts?: GoOptions): void => {
  const s = shellAddress();
  if (s) return s.go(route, opts);
  if (!(opts && opts.replace)) {
    window.location.hash = "/" + route;
    return undefined;
  }
  if (opts.quiet) window.history.replaceState(null, "", "#/" + route);
  else window.location.replace("#/" + route);
  return undefined;
};

// The address: the route on screen, followed and moved, in one place. In the app it is /w/<slug>/<route> and the bridge's
// (legacy-bridge/workspace.ts, on window.__shell); the standalone mockup has no workspace path and keeps its #/<route>.
const address = {
  route: routeOnScreen,
  href(route: string): string {
    const s = shellAddress();
    return s ? s.href(route) : "#/" + route;
  },
  go: addressGo,
  hear(fn: () => void): () => void {
    const s = shellAddress();
    if (s) return s.hear(fn);
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  },
  // A route's page warmed before anyone goes there, now or once the page is idle, or kept warm (workspace.ts warmRoute,
  // warmSoon, keepWarm): nothing in the mockup, which draws every route itself.
  warm(route: string): void {
    const s = shellAddress();
    if (s && s.warm) s.warm(route);
  },
  warmSoon(routes: string[]): void {
    const s = shellAddress();
    if (s && s.warmSoon) s.warmSoon(routes);
  },
  keepWarm(routes: string[]): void {
    const s = shellAddress();
    if (s && s.keepWarm) s.keepWarm(routes);
  },
};

const CONF = { SAFE: 0.8, MED: 0.5 };

export const CHANLY = {
  // ---- Confidence (0–1 float everywhere; see legacy/CLAUDE.md) ----
  CONF,
  isSafe(level: number): boolean {
    return level >= CONF.SAFE;
  },
  confTone(level: number): "high" | "med" | "low" {
    return level >= CONF.SAFE ? "high" : level >= CONF.MED ? "med" : "low";
  },
  // dashboard-data AGENT_TASKS uses a 1–3 dot scale; map into the 0–1 contract
  confFromDots(n: number): number {
    return n >= 3 ? 0.85 : n === 2 ? 0.65 : 0.4;
  },

  // ---- Seed clock ----
  IX_NOW: "12:04",
  // The seed's "today" (legacy/CLAUDE.md, Numeric contracts): 26 April of the seed year.
  SEED_TODAY: new Date(2026, 3, 26),
  WAIT_WARN_MIN: 30,

  // ---- Route builders (always deep-link the entity) ----
  R: {
    segment: (id: string) => `segments/${id}`,
    client: (id: string) => `clients/${id}`,
    conversation: (id: string) => `conversations/${id}`,
    appt: (id: string) => `calendar/${id}`,
    clientSeg: (id: string) => `clients/seg:${id}`,
    thread: (id: string) => `inbox/${id}`,
    // A lead has no page of its own: Leads is a scope of People, and a lead opens in its peek there.
    lead: () => "clients/leads",
    agent: (id: string) => `fleet/${id}`,
    broadcast: (segId: string) => `broadcasts/${segId}`,
    admin: (pane: string) => `admin/${pane}`,
  },
  nav(route: string): void {
    if (window.appNavigate) window.appNavigate(route);
  },
  address,

  // ---- Formatting ----
  fmtMoney(n: number): string {
    return "$" + Math.round(n).toLocaleString();
  },
  fmtDelta(n: number | null | undefined): string {
    if (n === 0 || n == null) return "—";
    return (n > 0 ? "+" : "−") + "$" + Math.abs(Math.round(n)).toLocaleString();
  },
  fmtPct(x: number): string {
    return Math.round(x * 100) + "%";
  },

  // The agent registry, the segment helpers and the compliance ones read the mockup's seeded roster, people and segments,
  // which a real workspace never loaded: they lived with those seeds, deleted with the mockup's pages on 17 October 2026.
};
