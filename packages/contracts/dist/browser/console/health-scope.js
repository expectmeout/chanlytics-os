export const HEALTH_SCOPES = ["customers", "ours", "all"];
export const HEALTH_SCOPE_WORDS = { customers: "Customers", ours: "Ours", all: "All" };
export function inScope(ours, scope) {
  return scope === "all" || scope === "ours" === ours;
}
export function oursOf(workspaces) {
  return new Set((workspaces ?? []).filter((w) => w.ours).map((w) => w.id));
}
export const PLATFORM_WHERE = "The platform";
export function workspaceNamer(workspaces) {
  const by = new Map((workspaces ?? []).map((w) => [w.id, w.name]));
  return (id) => id ? by.get(id) ?? "A workspace since deleted" : PLATFORM_WHERE;
}
