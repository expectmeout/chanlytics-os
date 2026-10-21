/**
 * An error a page hit in someone's browser, told to the server (POST /api/v1/client-errors).
 *
 * The web's error boundaries caught and said nothing: the shell's pane boundary drew its card, `(os)/error.tsx` wrote
 * to the browser's own console, and the root boundary drew its screen. A page that broke for a customer broke in
 * silence. Now each boundary sends what broke, once, and the server logs it as `client_error` under the request's
 * name, beside the member and the workspace the session already says.
 *
 * What it carries is the error, never the person or what they were doing: which boundary caught it, the page it was
 * on (a route's first segment, as field data names a page), the workspace the tab held (an id or a slug: the route
 * takes it only if the member belongs to it, so a report cannot be filed under someone else's), the error's name and
 * message cut short, and the first frames of its stack, which in a built bundle are file positions. A message is a
 * developer's sentence, but an exception can quote a value, so the logger redacts it by what it looks like too.
 */
import type { ClientErrorInputDto } from "./client-error-schema";

/** Where the error was caught: the shell's pane, the app's pane (`(os)/error.tsx`), or the root boundary. */
export const CLIENT_ERROR_BOUNDARIES = ["shell", "os", "root"] as const;
export type ClientErrorBoundary = (typeof CLIENT_ERROR_BOUNDARIES)[number];

/** How much of each part is kept: enough to find the line, never a dump. */
export const CLIENT_ERROR_LIMITS = {
  name: 60,
  message: 300,
  stack: 1200,
  page: 32,
  digest: 64,
  workspace: 64,
} as const;

export const PAGE = /^[a-z][a-z0-9-]{0,31}$/;
export const WORKSPACE = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

/**
 * An error's short name (decision 0066): four hex characters from its page, its name and its message's first line, so
 * the same error on the same page is the same id in every browser that hits it, and Support groups the reports that
 * name it. A hash of words, not a secret: two different errors may share one, and the page and words beside it tell
 * them apart.
 */
export function errorIdOf(page: string | null, name: string, message: string): string {
  const said = `${page ?? ""}|${name}|${(message.split(/\r?\n/)[0] ?? "").trim()}`;
  // FNV-1a, 32 bits: small, stable, and the same in every browser.
  let h = 0x811c9dc5;
  for (let i = 0; i < said.length; i++) {
    h ^= said.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 16).toString(16).padStart(4, "0");
}

/** The report a boundary sends, cut to the limits: what a caught error becomes before it leaves the browser. */
export function clientErrorOf(
  boundary: ClientErrorBoundary,
  error: unknown,
  page: string | null,
  digest?: string | null,
  workspace?: string | null,
): ClientErrorInputDto {
  const e = error instanceof Error ? error : new Error(String(error));
  const first = (page ?? "").split(/[/?#]/)[0] ?? "";
  return {
    boundary,
    page: PAGE.test(first) ? first : null,
    name: (e.name || "Error").slice(0, CLIENT_ERROR_LIMITS.name),
    message: (e.message || "").slice(0, CLIENT_ERROR_LIMITS.message),
    stack: e.stack ? e.stack.slice(0, CLIENT_ERROR_LIMITS.stack) : null,
    digest: digest ? digest.slice(0, CLIENT_ERROR_LIMITS.digest) : null,
    workspace: workspace && WORKSPACE.test(workspace) ? workspace : null,
  };
}
