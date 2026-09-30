/**
 * The error beacon: what a page's error boundary caught, told to the server (POST /api/v1/client-errors).
 *
 * Three boundaries catch an error in the browser: the shell's pane (app-shell.jsx ShellErrorBoundary), the app's pane
 * (`app/(os)/error.tsx`) and the root (`app/global-error.tsx`, which the sign-in pages fall through to). Each sends
 * what it caught, once per error per page load and at most MOST_PER_LOAD in all, so a render loop is one report. The
 * beacon is the browser's, queued to outlive a page that is about to reload, same-origin with the session's cookie; a
 * report the browser would not queue, or a page with no session, is a report lost, never something the page hears.
 *
 * The shell is script-mode JSX with no imports, so its boundary says what it caught as an event on the window
 * (SHELL_ERROR_EVENT), and the bridge's host listens (listenForShellErrors) and sends it.
 */
import { clientErrorOf, type ClientErrorBoundary } from "@chanlytics/contracts";
import { ROUTES } from "./routes.generated";

/** The event the shell's pane boundary dispatches on window: `detail` is `{ error, page }`. */
export const SHELL_ERROR_EVENT = "chanlytics:shell-error";

/** The most reports one page load sends: a broken page is a few errors, not a stream. */
const MOST_PER_LOAD = 5;

type Beacon = { sendBeacon?: (url: string, data: Blob) => boolean } | undefined;

/** A reporter for one page load: what it sent, so the same error twice is sent once. */
export function clientErrorReporter(nav: Beacon, workspace: () => string | null = () => null) {
  const sent = new Set<string>();
  return (boundary: ClientErrorBoundary, error: unknown, page: string | null, digest?: string | null): boolean => {
    const body = clientErrorOf(boundary, error, page, digest, workspace());
    const key = `${body.boundary}|${body.name}|${body.message}`;
    if (sent.has(key) || sent.size >= MOST_PER_LOAD) return false;
    sent.add(key);
    try {
      const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
      return nav?.sendBeacon?.(ROUTES["POST client-errors"].path, blob) ?? false;
    } catch {
      return false;
    }
  };
}

/** The workspace the page's address names (`/w/<slug>/…`), or null on a page with none: the sign-in pages. */
const heldWorkspace = (): string | null =>
  typeof window === "undefined" ? null : (/^\/w\/([^/]+)/.exec(window.location.pathname)?.[1] ?? null);

/** This page load's reporter, over the browser's own beacon. */
export const reportClientError = clientErrorReporter(
  typeof navigator === "undefined" ? undefined : navigator,
  heldWorkspace,
);

/** Sends what the shell's boundary says it caught; answers the unhook. */
export function listenForShellErrors(
  win: Pick<Window, "addEventListener" | "removeEventListener">,
  report = reportClientError,
): () => void {
  const heard = (e: Event) => {
    const detail = (e as CustomEvent<{ error?: unknown; page?: unknown } | null>).detail;
    report("shell", detail?.error, typeof detail?.page === "string" ? detail.page : null);
  };
  win.addEventListener(SHELL_ERROR_EVENT, heard);
  return () => win.removeEventListener(SHELL_ERROR_EVENT, heard);
}
