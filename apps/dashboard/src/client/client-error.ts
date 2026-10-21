/**
 * The error beacon: what a page's error boundary caught, told to the server (POST /api/v1/client-errors).
 *
 * Three boundaries catch an error in the browser: the shell's pane (surfaces/frame/shell-chrome.tsx ShellErrorBoundary), the app's pane
 * (`app/(os)/error.tsx`) and the root (`app/global-error.tsx`, which the sign-in pages fall through to). Each sends
 * what it caught, once per error per page load and at most MOST_PER_LOAD in all, so a render loop is one report. The
 * beacon is the browser's, queued to outlive a page that is about to reload, same-origin with the session's cookie; a
 * report the browser would not queue, or a page with no session, is a report lost, never something the page hears.
 *
 * The shell is script-mode JSX with no imports, so its boundary says what it caught as an event on the window
 * (SHELL_ERROR_EVENT), and the bridge's host listens (listenForShellErrors) and sends it.
 */
import {
  PAGE_PHONE_QUERY,
  clientErrorOf,
  errorIdOf,
  type ClientErrorBoundary,
  type PageDevice,
  type ReportedError,
} from "@chanlytics/contracts";
import { publicEnv } from "@/lib/public-env";

/** The event the shell's pane boundary dispatches on window: `detail` is `{ error, page }`. */
export const SHELL_ERROR_EVENT = "chanlytics:shell-error";

/**
 * Where a report goes: `POST client-errors` in the route table (routes.generated.ts), which client-errors.test.mjs holds
 * this to. Written here, not read from the table: the two error boundaries import this module, each is a chunk group
 * that every page loads and no other may count as loaded, and the table is 20 KB they would each carry again.
 */
export const CLIENT_ERRORS_PATH = "/api/v1/client-errors";

/** The most reports one page load sends: a broken page is a few errors, not a stream. */
const MOST_PER_LOAD = 5;

type Beacon = { sendBeacon?: (url: string, data: Blob) => boolean } | undefined;

/**
 * The last error this page load caught, as Report a problem sends it (decision 0066): its short id, its name and its
 * first line, and the page it was on. Kept in the page, never stored: a report is about what just happened.
 */
let lastCaught: (ReportedError & { page: string | null }) | null = null;

/** The last error this page load caught, or null. */
export function lastClientError(): (ReportedError & { page: string | null }) | null {
  return lastCaught;
}

/**
 * Where an error screen leaves the error it showed for Report a problem, across the reload that heals it: the frame's
 * host opens the sheet with it once the page is back (surfaces/frame/report-problem.tsx), and forgets it.
 */
export const REPORT_AFTER_KEY = "chanlytics.report-after";

/** The build that ran and the device it ran on, as field data names them: Health groups an error by both (00469). */
type RanOn = () => { build: string | null; device: PageDevice | null };

/** A reporter for one page load: what it sent, so the same error twice is sent once. */
export function clientErrorReporter(
  nav: Beacon,
  workspace: () => string | null = () => null,
  ranOn: RanOn = () => ({ build: null, device: null }),
) {
  const sent = new Set<string>();
  return (boundary: ClientErrorBoundary, error: unknown, page: string | null, digest?: string | null): boolean => {
    const body = { ...clientErrorOf(boundary, error, page, digest, workspace()), ...ranOn() };
    const firstLine = body.message.split(/\r?\n/)[0] ?? "";
    lastCaught = {
      id: errorIdOf(body.page, body.name, body.message),
      name: body.name,
      message: firstLine,
      page: body.page,
    };
    const key = `${body.boundary}|${body.name}|${body.message}`;
    if (sent.has(key) || sent.size >= MOST_PER_LOAD) return false;
    sent.add(key);
    try {
      const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
      return nav?.sendBeacon?.(CLIENT_ERRORS_PATH, blob) ?? false;
    } catch {
      return false;
    }
  };
}

/** The workspace the page's address names (`/w/<slug>/…`), or null on a page with none: the sign-in pages. */
const heldWorkspace = (): string | null =>
  typeof window === "undefined" ? null : (/^\/w\/([^/]+)/.exec(window.location.pathname)?.[1] ?? null);

/**
 * This build's commit, cut as field data cuts it (page-speed.ts; the route holds it to PAGE_BUILD, whose module builds
 * schemas this chunk would carry to every page), and the device by the shell's one phone width.
 */
const ranHere: RanOn = () => {
  const sha = publicEnv.NEXT_PUBLIC_BUILD_SHA;
  return {
    build: /^[0-9a-z]{3,40}$/.test(sha) ? sha.slice(0, 12) : null,
    device: typeof window === "undefined" ? null : window.matchMedia?.(PAGE_PHONE_QUERY).matches ? "phone" : "desk",
  };
};

/** This page load's reporter, over the browser's own beacon. */
export const reportClientError = clientErrorReporter(
  typeof navigator === "undefined" ? undefined : navigator,
  heldWorkspace,
  ranHere,
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
