export const GET_YES_PARAM = "get-yes";
export const GET_YES_ROUTE = `clients/${GET_YES_PARAM}`;
const PEEK_ID = /^[A-Za-z0-9_-]{1,80}$/;
const VIEW_TOKEN = /^(seg|list|state):[^:/]+$/;
export function peopleRoute(v = {}) {
  const view = v.view && v.view !== "state:all" && VIEW_TOKEN.test(v.view) ? v.view : null;
  const peek = v.peek && PEEK_ID.test(v.peek) ? v.peek : null;
  if (!peek) return view ? `clients/${view}` : "clients";
  return `clients/${view ?? "state:all"}:p-${peek}`;
}
export function parsePeopleRoute(route) {
  const r = String(route ?? "");
  const slash = r.indexOf("/");
  const head = slash < 0 ? r : r.slice(0, slash);
  if (head !== "clients" && head !== "people") return null;
  const param = slash < 0 ? "" : r.slice(slash + 1);
  if (!param) return { view: null, peek: null };
  const [kind, id, ...rest] = param.split(":");
  const view = `${kind}:${id ?? ""}`;
  if (id === void 0 || !VIEW_TOKEN.test(view)) return null;
  const peekSeg = rest.find((s) => s.startsWith("p-") && PEEK_ID.test(s.slice(2)));
  return { view: view === "state:all" ? null : view, peek: peekSeg ? peekSeg.slice(2) : null };
}
