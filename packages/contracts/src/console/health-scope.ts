/**
 * Whose numbers Health is saying (decision 0068): customers' workspaces (with the platform's own machinery), ours (the
 * nightly suite's, the smoke test: tenants.ours, 00469), or every one. Every part's view model cuts its rows by it, so
 * it is a module of its own, which they and health.ts import. Pure.
 */

/** A workspace as Health names its rows: its address, its name, and whether it is ours. */
export interface HealthWorkspaceDto {
  id: string;
  slug: string;
  name: string;
  ours: boolean;
}

/** Who a number is about: customers' workspaces (and the platform's own machinery), ours, or every one. */
export const HEALTH_SCOPES = ["customers", "ours", "all"] as const;
export type HealthScope = (typeof HEALTH_SCOPES)[number];

export const HEALTH_SCOPE_WORDS: Record<HealthScope, string> = { customers: "Customers", ours: "Ours", all: "All" };

/** Whether a row of a workspace that is (or is not) ours is in the scope. The platform's own rows are customers'. */
export function inScope(ours: boolean, scope: HealthScope): boolean {
  return scope === "all" || (scope === "ours") === ours;
}

/** Which workspaces are ours, by id, from the read. */
export function oursOf(workspaces: readonly HealthWorkspaceDto[] | null): Set<string> {
  return new Set((workspaces ?? []).filter((w) => w.ours).map((w) => w.id));
}

/** Where a row about no one workspace is: the platform's own clocks, its backlog, its pager. */
export const PLATFORM_WHERE = "The platform";

/** A workspace's name for a row, by id; the platform for a row about none. */
export function workspaceNamer(workspaces: readonly HealthWorkspaceDto[] | null): (id: string | null) => string {
  const by = new Map((workspaces ?? []).map((w) => [w.id, w.name]));
  return (id) => (id ? (by.get(id) ?? "A workspace since deleted") : PLATFORM_WHERE);
}
