/**
 * Where a sign-in comes back to, for a deep link into a workspace.
 *
 * The address was a hash (`/w/acme#/inbox/th-1`), and the browser carried the fragment through the gate's bounce to
 * /login without the server reading it, so signing in landed on the page the link named. The route is a path now
 * (`/w/acme/inbox/th-1`, decision 0015), which the gate's redirect would drop, and a signed-out tab would land on
 * Today. So the gate writes the route back into the redirect's fragment, `/login#/inbox/th-1`, the one shape the
 * sign-in page already keeps and lands on. A fragment is never sent to a server, so the route is in no log by it.
 *
 * And the workspace rides beside it, as the gate's own query value (`/login?w=acme#/inbox/th-1`): without it the home
 * the sign-in lands on sent the route to the workspace this browser used last, so a member of two who followed a link
 * into the other one landed on a thread that is not there. A query, because a hash address keeps its fragment through
 * the redirect only when the gate writes none, and the workspace is the address's first part, in the path the gate
 * was asked for: no log learns anything from it that the request's own line did not say. The page's own query never
 * travels.
 *
 * No imports: the gate runs on every request, and nothing else here should come along.
 */

/** The query value the sign-in bounce carries the workspace in: `/login?w=acme`. */
const RETURN_WORKSPACE = "w";

/**
 * A workspace as a return may name it: its slug or its id, as a path writes either (letters, digits and dashes, a
 * letter or digit at each end, no longer than a slug can be). Anything else names none, so a value written into a
 * link to /login can only ever send a signed-in tab to a workspace's own address on this site, where the server
 * decides whether it is theirs.
 */
const WORKSPACE_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?$/;
function returnWorkspace(value: string | null | undefined): string | null {
  return typeof value === "string" && WORKSPACE_NAME.test(value) ? value : null;
}

/** The fragment the sign-in bounce carries for a workspace page: `#/inbox/th-1`, and nothing for the workspace's own page. */
export function returnFragmentOf(pathname: string): string {
  const m = /^\/w\/[^/?#]+\/([^?#]+)$/.exec(pathname);
  const route = m?.[1]?.replace(/\/+$/, "");
  return route ? `#/${route}` : "";
}

/** The workspace a path names, `/w/<slug>`, when a return may carry it; null for any other path or a malformed escape. */
function workspaceOfPath(pathname: string): string | null {
  const m = /^\/w\/([^/?#]+)/.exec(pathname);
  try {
    return m ? returnWorkspace(decodeURIComponent(m[1] ?? "")) : null;
  } catch {
    return null;
  }
}

/** The query the sign-in bounce carries for a workspace page, its own page included: `?w=acme`; nothing off one. */
export function returnQueryOf(pathname: string | null | undefined): string {
  const named = workspaceOfPath(pathname ?? "");
  return named ? `?${RETURN_WORKSPACE}=${encodeURIComponent(named)}` : "";
}

/**
 * What the sign-in page carries on to where it lands (the home, or the second step first): the workspace its address
 * names, checked again since anyone can write a link to /login, and its fragment, the route. The rest of its query is
 * the sign-in page's own (`email`, `error`). Google's callback reads the same from the landing it planned, when the
 * second step comes first (oauth-callback.ts landingAfter), and the second step's page from its own address.
 */
export function signInReturnOf(address: { search?: string | null; hash?: string | null }): string {
  const named = returnWorkspace(new URLSearchParams(address.search ?? "").get(RETURN_WORKSPACE));
  return `${named ? `?${RETURN_WORKSPACE}=${encodeURIComponent(named)}` : ""}${address.hash ?? ""}`;
}

/**
 * The workspace a landing was asked for (`?w=acme`, as signInReturnOf carried it), and what rides on without it: the
 * home prefers it over the workspace this browser used last. `after` is the landing's query and fragment.
 */
export function askedWorkspaceOf(after: string): { workspace: string | null; rest: string } {
  const at = after.indexOf("#");
  const query = at < 0 ? after : after.slice(0, at);
  const params = new URLSearchParams(query);
  if (!params.has(RETURN_WORKSPACE)) return { workspace: null, rest: after };
  const workspace = returnWorkspace(params.get(RETURN_WORKSPACE));
  params.delete(RETURN_WORKSPACE);
  const left = params.toString();
  return { workspace, rest: `${left ? `?${left}` : ""}${at < 0 ? "" : after.slice(at)}` };
}
