/**
 * The pure part of being told: which tab a route belongs to, and what a push carries. No native import, so the
 * rules run under node (test/notifications.test.mjs); notifications.ts wraps them in the effects.
 */
import { APP_ROUTE_RE } from "@chanlytics/contracts";
import type { Tab } from "./state";

/** The tab a hash route lives in: the four the bar names, else More, where the drawer reaches everything. */
export function tabOf(route: string): Tab {
  if (route === "inbox" || route.startsWith("inbox/")) return "inbox";
  if (route === "today" || route.startsWith("today/")) return "today";
  if (route === "calendar" || route.startsWith("calendar/")) return "calendar";
  if (route === "clients" || route.startsWith("clients/")) return "people";
  return "more";
}

/** The route a notification's data names, when it is one of the page's own; null for anything else. */
export function routeOfData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const route = (data as { route?: unknown }).route;
  return typeof route === "string" && APP_ROUTE_RE.test(route) ? route : null;
}

/** The badge a push carries, when it does. */
export function badgeOfData(content: unknown): number | null {
  if (!content || typeof content !== "object") return null;
  const b = (content as { badge?: unknown }).badge;
  return typeof b === "number" && Number.isInteger(b) && b >= 0 ? b : null;
}
