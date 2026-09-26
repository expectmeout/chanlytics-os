/**
 * The two wires between the native shell and the page it holds (the phone app's PRD, decision M3).
 *
 * The page speaks over `window.ReactNativeWebView.postMessage`, one JSON string per message; the shell speaks by
 * injecting `window.__appBridge.receive(<json>)`. Each side parses what it hears with the functions here and does
 * nothing with a message it cannot parse: a route the page did not recognise as one of its own hash routes is never
 * put in the address bar, whoever sent it. Both sides import this one definition, so they cannot drift.
 */

/** A hash route's name as the shell writes it: `today`, `inbox`, `clients/abc-123`. Never a URL, never a scheme. */
export const APP_ROUTE_RE = /^[a-z][a-z0-9-]*(?:\/[A-Za-z0-9:_-]+)*$/;

export type PageMessage =
  | { t: "route"; route: string }
  | { t: "needs"; inbox: number }
  | { t: "session"; state: "in" | "out" }
  | { t: "workspace"; slug: string };

export type ShellMessage = { t: "navigate"; route: string } | { t: "menu" } | { t: "top" };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** What the page said, or null when it is not one of the four shapes. */
export function parsePageMessage(raw: string): PageMessage | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(v)) return null;
  switch (v.t) {
    case "route":
      return typeof v.route === "string" && APP_ROUTE_RE.test(v.route) ? { t: "route", route: v.route } : null;
    case "needs":
      return typeof v.inbox === "number" && Number.isInteger(v.inbox) && v.inbox >= 0
        ? { t: "needs", inbox: v.inbox }
        : null;
    case "session":
      return v.state === "in" || v.state === "out" ? { t: "session", state: v.state } : null;
    case "workspace":
      return typeof v.slug === "string" && v.slug.trim() ? { t: "workspace", slug: v.slug.trim() } : null;
    default:
      return null;
  }
}

/** What the shell asked, or null when it is not one of the three shapes. */
export function parseShellMessage(v: unknown): ShellMessage | null {
  if (!isRecord(v)) return null;
  switch (v.t) {
    case "navigate":
      return typeof v.route === "string" && APP_ROUTE_RE.test(v.route) ? { t: "navigate", route: v.route } : null;
    case "menu":
      return { t: "menu" };
    case "top":
      return { t: "top" };
    default:
      return null;
  }
}
