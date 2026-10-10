/**
 * The workspace half of a sign-in's return, as the gate writes it and the shell reads it: the query the bounce to
 * /login carries (`?w=acme`), and the workspace a landing was asked for. Why the workspace rides in the query is
 * sign-in-return.ts's to say; this module is the shell's (and the gate's) alone, so the workspace route draws it once
 * (return-workspace.ts says why that matters).
 *
 * Its one import imports nothing: the gate runs on every request, and nothing else here should come along.
 */
import { RETURN_WORKSPACE, returnWorkspace } from "./return-workspace";

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
