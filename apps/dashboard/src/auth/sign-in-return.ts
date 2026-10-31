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
 * And a lead's own receptionist's Make it mine (decision 0079) rides the same way, as `?preview=<token>`: someone who
 * has an account signs in from there and lands back on it, where one press makes the preview theirs, not on the home.
 *
 * Its one import imports nothing: the gate runs on every request, and nothing else here should come along.
 */
import { RETURN_WORKSPACE, returnWorkspace } from "./return-workspace";

/** The query value a sign-in from Make it mine carries the preview's token in: `/login?preview=<token>`. */
export const RETURN_PREVIEW = "preview";

/**
 * A preview's token as a return may carry it: the link's own shape (contracts PreviewTokenSchema, which the claim's
 * door holds; written again here since the gate imports this module), or none. So a value written into a link to
 * /login can only ever land a tab on a preview's own Make it mine, where the token alone says whose it is.
 */
const PREVIEW_TOKEN = /^[A-Za-z0-9_-]{22}$/;
function returnPreview(value: string | null): string | null {
  return value !== null && PREVIEW_TOKEN.test(value) ? value : null;
}

/** The fragment the sign-in bounce carries for a workspace page: `#/inbox/th-1`, and nothing for the workspace's own page. */
export function returnFragmentOf(pathname: string): string {
  const m = /^\/w\/[^/?#]+\/([^?#]+)$/.exec(pathname);
  const route = m?.[1]?.replace(/\/+$/, "");
  return route ? `#/${route}` : "";
}

/**
 * What the sign-in page carries on to where it lands (the home, or the second step first): the workspace its address
 * names and the preview it came from, each checked again since anyone can write a link to /login, and its fragment,
 * the route. The rest of its query is the sign-in page's own (`email`, `error`). Google's callback reads the same from
 * the landing it planned, when the second step comes first (oauth-callback.ts landingAfter), and the second step's page
 * from its own address.
 */
export function signInReturnOf(address: { search?: string | null; hash?: string | null }): string {
  const q = new URLSearchParams(address.search ?? "");
  const kept = new URLSearchParams();
  const named = returnWorkspace(q.get(RETURN_WORKSPACE));
  if (named) kept.set(RETURN_WORKSPACE, named);
  const preview = returnPreview(q.get(RETURN_PREVIEW));
  if (preview) kept.set(RETURN_PREVIEW, preview);
  const query = kept.toString();
  return `${query ? `?${query}` : ""}${address.hash ?? ""}`;
}

/**
 * Where a sign-in lands once it is in: Make it mine for the preview its address came from (contracts previewMinePath),
 * else the home with its return.
 */
export function signInLandingOf(address: { search?: string | null; hash?: string | null }): string {
  const preview = returnPreview(new URLSearchParams(address.search ?? "").get(RETURN_PREVIEW));
  return preview ? `/preview/${preview}/mine` : `/${signInReturnOf(address)}`;
}
