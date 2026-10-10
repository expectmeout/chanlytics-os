/**
 * The workspace a sign-in's return names, as every reader of a return reads it: the sign-in pages and the server
 * (sign-in-return.ts) and the shell (workspace-return.ts).
 *
 * Its own module so that these few lines are all the shell and the sign-in pages share. Whatever the workspace route
 * shares with another page is drawn once in each of the route's two chunks, so a shared module is downloaded twice by
 * every visitor; the rest of a return is each side's own and is drawn once.
 *
 * No imports: the gate runs on every request, and nothing else here should come along.
 */

/** The query value the sign-in bounce carries the workspace in: `/login?w=acme`. */
export const RETURN_WORKSPACE = "w";

/**
 * A workspace as a return may name it: its slug or its id, as a path writes either (letters, digits and dashes, a
 * letter or digit at each end, no longer than a slug can be). Anything else names none, so a value written into a
 * link to /login can only ever send a signed-in tab to a workspace's own address on this site, where the server
 * decides whether it is theirs.
 */
const WORKSPACE_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?$/;
export function returnWorkspace(value: string | null | undefined): string | null {
  return typeof value === "string" && WORKSPACE_NAME.test(value) ? value : null;
}
