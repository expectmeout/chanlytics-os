/**
 * The pure part of being told: which tab a route belongs to, and what a push carries. No native import, so the
 * rules run under node (test/notifications.test.mjs); notifications.ts wraps them in the effects.
 */
import { APP_ROUTE_RE, UUID } from "@chanlytics/contracts";
import type { Tab } from "./state";

/** The tab a hash route lives in: the four the bar names, else More, where the drawer reaches everything. */
export function tabOf(route: string): Tab {
  if (route === "inbox" || route.startsWith("inbox/")) return "inbox";
  if (route === "today" || route.startsWith("today/")) return "today";
  if (route === "calendar" || route.startsWith("calendar/")) return "calendar";
  if (route === "clients" || route.startsWith("clients/")) return "people";
  return "more";
}

/**
 * The route each tab's page opens on, in the web's own names: People is the web's `clients` (app-shell.jsx PHONE_TABS).
 * More opens Today, with its drawer over it. Each tab's route belongs to that tab by tabOf, the rule a link and a tap
 * follow; the People tab asked for `people`, a route the web does not have, and drew "No surface" where People was.
 */
export const TAB_ROUTES: Readonly<Record<Tab, string>> = {
  today: "today",
  inbox: "inbox",
  calendar: "calendar",
  people: "clients",
  more: "today",
};

/** What a tapped push opens: its route, and the workspace it was told for (its id), when the data says one. */
export interface Tap {
  route: string;
  workspace: string | null;
}

/** The route a notification's data names, when it is one of the page's own; null for anything else. */
export function routeOfData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const route = (data as { route?: unknown }).route;
  return typeof route === "string" && APP_ROUTE_RE.test(route) ? route : null;
}

/** The tap a push's data makes: its route, with its workspace's id (contracts push.ts `tenant_id`) when it is one. */
export function tapOfData(data: unknown): Tap | null {
  const route = routeOfData(data);
  if (!route) return null;
  const w = (data as { tenant_id?: unknown }).tenant_id;
  return { route, workspace: typeof w === "string" && UUID.test(w) ? w : null };
}
