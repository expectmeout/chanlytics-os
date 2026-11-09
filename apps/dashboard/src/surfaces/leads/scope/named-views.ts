/**
 * Named views on Leads (the table review of 5 Nov 2026): a view of the list a member keeps under a name, and three the
 * product offers and never stores. A view is an address (a list, a search, the chips) and a layout, widths left the page's.
 * They are kept at `memberships.views["leads-named"]`, through the door any page's view goes through (PUT views/[page],
 * member_view_set), so nothing about them is a new door. It stands in the sheet's folder as lead-row-status.ts does: the
 * leads folder is at its limit.
 *
 *   leadNamedViewsOf    a kept list, read with care
 *   leadNamedAdd        one more, or why not
 *   leadNamedRouteFor   where a press goes: its address, or All leads where it names a search since removed
 *   leadNamedActive     the view in use
 *   leadNamedChanged    whether the layout moved since it was kept, which offers Update
 */
import { leadsRoute, parseLeadsRoute } from "@chanlytics/contracts";

/** Where a member's list is kept: a page's name in `memberships.views`. */
export const LEAD_NAMED_PAGE = "leads-named";
/** The most a member keeps. */
export const LEAD_NAMED_MAX = 6;
/** The longest name kept: what the rail shows of one, and what lets six fit the door. */
export const LEAD_NAMED_NAME_MAX = 32;
/** The most the door takes of one page's view (PUT views/[page]). */
const DOOR_TAKES = 2000;

export const LEAD_NAMED_WORDS = {
  save: "Save this view",
  name: "The view's name",
  saveName: "Save",
  update: "Update",
  rename: "Rename",
  remove: "Remove",
  removeYes: "Yes, remove",
  full: "You can keep six views. Remove one first.",
  long: "That is more than these views can hold. Remove one first.",
} as const;

/** What a view says of a table's layout. What it does not name stands as it is. */
export interface LeadNamedLayout {
  sortBy?: string;
  sortDir?: "asc" | "desc";
  columns?: Record<string, boolean>;
  order?: string[];
  density?: "comfortable" | "compact";
}

export interface LeadNamedView extends LeadNamedLayout {
  id: string;
  name: string;
  /** Its address (contracts leadsRoute), with no lead open. */
  route: string;
}

/** The page as it stands, as a view is compared with it. */
export interface LeadNamedNow {
  route: string;
  by: string;
  dir: "asc" | "desc";
  columns: Record<string, boolean>;
  order: readonly string[];
  density: "comfortable" | "compact";
}

/** The three the product offers: what needs you, who to call, who to email. Never stored, so never removed. */
export const LEAD_STARTER_VIEWS: readonly LeadNamedView[] = [
  {
    id: "starter-needs",
    name: "Needs you",
    route: leadsRoute({ chips: { status_group: ["needs"] } }),
    sortBy: "stage",
    sortDir: "asc",
  },
  { id: "starter-call", name: "Call list", route: leadsRoute({ chips: { reach: ["phone"] } }), density: "compact" },
  { id: "starter-email", name: "Email list", route: leadsRoute({ chips: { reach: ["email"] } }) },
];

const anObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A view's layout, each part only where it is such a part: one that is not leaves what stands. */
const layoutRead = (v: Record<string, unknown>): LeadNamedLayout => ({
  ...(typeof v.sortBy === "string" ? { sortBy: v.sortBy } : {}),
  ...(v.sortDir === "asc" || v.sortDir === "desc" ? { sortDir: v.sortDir } : {}),
  ...(anObject(v.columns) ? { columns: v.columns as Record<string, boolean> } : {}),
  ...(Array.isArray(v.order) && v.order.every((k) => typeof k === "string") ? { order: v.order } : {}),
  ...(v.density === "comfortable" || v.density === "compact" ? { density: v.density } : {}),
});

/** A kept list, read with care: a list that is no list is none, and a view that names nothing is gone from it. */
export function leadNamedViewsOf(raw: unknown): LeadNamedView[] {
  const list = anObject(raw) && Array.isArray(raw.list) ? raw.list : [];
  const views: LeadNamedView[] = [];
  for (const v of list) {
    if (!anObject(v) || typeof v.id !== "string" || !v.id) continue;
    if (typeof v.name !== "string" || !v.name || typeof v.route !== "string" || !parseLeadsRoute(v.route)) continue;
    views.push({ id: v.id, name: v.name, route: v.route, ...layoutRead(v) });
  }
  return views.slice(0, LEAD_NAMED_MAX);
}

/** One more on the list, or why not: the most a member keeps, and what the door can hold. */
export function leadNamedAdd(
  list: readonly LeadNamedView[],
  view: LeadNamedView,
): { list: LeadNamedView[]; refused?: undefined } | { refused: string; list?: undefined } {
  if (list.length >= LEAD_NAMED_MAX) return { refused: LEAD_NAMED_WORDS.full };
  const next = [...list, view];
  return JSON.stringify({ list: next }).length > DOOR_TAKES ? { refused: LEAD_NAMED_WORDS.long } : { list: next };
}

/** Where a press goes: the view's address, or All leads where it names a search since removed. */
export function leadNamedRouteFor(view: Pick<LeadNamedView, "route">, searchIds: readonly string[]): string {
  const at = parseLeadsRoute(view.route);
  return at?.searchId && !searchIds.includes(at.searchId) ? leadsRoute({}) : view.route;
}

/** The view in use: the page stands at its address. */
export const leadNamedActive = (view: Pick<LeadNamedView, "route">, now: Pick<LeadNamedNow, "route">): boolean =>
  view.route === now.route;

const alike = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Whether the layout moved since the view was kept: only what it names is its to say changed. */
export function leadNamedChanged(view: LeadNamedLayout, now: LeadNamedNow): boolean {
  return (
    (view.sortBy !== undefined && view.sortBy !== now.by) ||
    (view.sortDir !== undefined && view.sortDir !== now.dir) ||
    (view.columns !== undefined && !alike(view.columns, now.columns)) ||
    (view.order !== undefined && !alike(view.order, now.order)) ||
    (view.density !== undefined && view.density !== now.density)
  );
}
