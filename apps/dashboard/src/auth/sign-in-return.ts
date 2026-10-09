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
 * This module is the sign-in pages' and the server's: the route's fragment and what the sign-in carries on. The
 * workspace's query, which the gate writes and the shell reads, is workspace-return.ts, and the few lines both read a
 * workspace by are return-workspace.ts, so the workspace route draws only those beside the sign-in pages.
 *
 * Its one import imports nothing: the gate runs on every request, and nothing else here should come along.
 */
import { RETURN_WORKSPACE, returnWorkspace } from "./return-workspace";

/** The fragment the sign-in bounce carries for a workspace page: `#/inbox/th-1`, and nothing for the workspace's own page. */
export function returnFragmentOf(pathname: string): string {
  const m = /^\/w\/[^/?#]+\/([^?#]+)$/.exec(pathname);
  const route = m?.[1]?.replace(/\/+$/, "");
  return route ? `#/${route}` : "";
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
