/**
 * People's own address, as the Pipeline and Leads spell theirs (pipelineRoute, leadsRoute): `clients`, then the view's
 * token (`seg:<id>` a smart list, `list:<id>` a list kept by hand, `state:<tab>` a state), then the person open over it
 * as a peek (`p-<id>`). Everyone has no token, and with a peek is `state:all`, which People already reads as Everyone.
 * No colon is in a token's id or a person's, so the separators stay apart.
 */

/** A person's id as the address carries it: a uuid, or a fixture's short id; never anything with a separator in it. */
const PEEK_ID = /^[A-Za-z0-9_-]{1,80}$/;
/** A view's token: its kind and its id. */
const VIEW_TOKEN = /^(seg|list|state):[^:/]+$/;

/** People's address for a view and, where one is open over it, the person peeked at. */
export function peopleRoute(v: { view?: string | null; peek?: string | null } = {}): string {
  const view = v.view && v.view !== "state:all" && VIEW_TOKEN.test(v.view) ? v.view : null;
  const peek = v.peek && PEEK_ID.test(v.peek) ? v.peek : null;
  if (!peek) return view ? `clients/${view}` : "clients";
  return `clients/${view ?? "state:all"}:p-${peek}`;
}

/**
 * The view's token and the person peeked at an address names: `{ view: null }` is Everyone. Null for an address that is
 * not a view of People's own (a person's page, Leads, the Pipeline, New list).
 */
export function parsePeopleRoute(
  route: string | null | undefined,
): { view: string | null; peek: string | null } | null {
  const r = String(route ?? "");
  const slash = r.indexOf("/");
  const head = slash < 0 ? r : r.slice(0, slash);
  if (head !== "clients" && head !== "people") return null;
  const param = slash < 0 ? "" : r.slice(slash + 1);
  if (!param) return { view: null, peek: null };
  const [kind, id, ...rest] = param.split(":");
  const view = `${kind}:${id ?? ""}`;
  if (id === undefined || !VIEW_TOKEN.test(view)) return null;
  const peekSeg = rest.find((s) => s.startsWith("p-") && PEEK_ID.test(s.slice(2)));
  return { view: view === "state:all" ? null : view, peek: peekSeg ? peekSeg.slice(2) : null };
}
