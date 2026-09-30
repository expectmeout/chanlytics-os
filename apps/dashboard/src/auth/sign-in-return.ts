/**
 * Where a sign-in comes back to, for a deep link into a workspace.
 *
 * The address was a hash (`/w/acme#/inbox/th-1`), and the browser carried the fragment through the gate's bounce to
 * /login without the server reading it, so signing in landed on the page the link named. The route is a path now
 * (`/w/acme/inbox/th-1`, decision 0015), which the gate's redirect would drop, and a signed-out tab would land on
 * Today. So the gate writes the route back into the redirect's fragment, `/login#/inbox/th-1`, the one shape the
 * sign-in page already keeps and lands on. A fragment is never sent to a server, so the route is in no log by it.
 *
 * No imports: the gate runs on every request, and nothing else here should come along.
 */

/** The fragment the sign-in bounce carries for a workspace page: `#/inbox/th-1`, and nothing for the workspace's own page. */
export function returnFragmentOf(pathname: string): string {
  const m = /^\/w\/[^/?#]+\/([^?#]+)$/.exec(pathname);
  const route = m?.[1]?.replace(/\/+$/, "");
  return route ? `#/${route}` : "";
}
