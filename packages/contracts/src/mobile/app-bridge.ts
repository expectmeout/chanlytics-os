/**
 * The two wires between the native shell and the page it holds (the phone app's PRD, decision M3).
 *
 * The page speaks over `window.ReactNativeWebView.postMessage`, one JSON string per message; the shell speaks by
 * injecting `window.__appBridge.receive(<json>)`. Each side parses what it hears with the functions here and does
 * nothing with a message it cannot parse: a route the page did not recognise as one of its own hash routes is never
 * put in the address bar, whoever sent it. Both sides import this one definition, so they cannot drift.
 */

import type { Theme } from "../shell/chrome";
import { parseTodayWidgetSnapshot, type TodayWidgetSnapshot } from "./widget";

/** A hash route's name as the shell writes it: `today`, `inbox`, `clients/abc-123`. Never a URL, never a scheme. */
export const APP_ROUTE_RE = /^[a-z][a-z0-9-]*(?:\/[A-Za-z0-9:_-]+)*$/;

export type PageMessage =
  | { t: "route"; route: string }
  | { t: "needs"; inbox: number }
  | { t: "session"; state: "in" | "out" }
  | { t: "workspace"; slug: string }
  /** The bell's unread number, on every bell change: what the icon wears (PR 2). */
  | { t: "badge"; n: number }
  /** What became of the shell's device ask: registered, forgotten, or refused by the site. */
  | { t: "device"; state: "registered" | "forgotten" | "refused" }
  /** Today as the widget shows it, on every refresh of the page's Today (PR 4). */
  | { t: "today"; snapshot: TodayWidgetSnapshot }
  /** How many calls are in progress, on every refresh of the page's Live: none ends the phone's call activity (PR 7). */
  | { t: "calls"; live: number }
  /**
   * The session's access token for the shell's own calls to /api/v1 (decision 0011, PR 8), answered to the shell's
   * `token` ask: the token and when it expires (epoch seconds), or null when the page has no session to hand over.
   * Never the refresh token: the page refreshes, the shell asks again.
   */
  | { t: "token"; access: string | null; expires: number }
  /**
   * The theme the page is drawn in, at install and on every change: the member's own choice (chrome.ts
   * resolveTheme), which the device's setting is not. The shell paints its bars, its tab bar and its own screens
   * in it, so nothing native stands in the other theme beside the page.
   */
  | { t: "theme"; theme: Theme };

/** A phone's push token, as expo-notifications hands it out. */
export const PUSH_TOKEN_MAX = 200;

export type ShellMessage =
  | { t: "navigate"; route: string }
  | { t: "menu" }
  | { t: "top" }
  /**
   * Register this phone for the person signed in: the page calls PUT me/devices through its own client, and forgets
   * it again on its own before a sign-out (legacy-bridge/app-bridge.ts forgetPhone), so no ask says "forget".
   */
  | { t: "device"; token: string; platform: "ios" | "android"; version: string; activity?: string }
  /** The session's access token, for the shell's own calls (decision 0011): the page answers with `token`. */
  | { t: "token" };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** What the page said, or null when it is not one of the four shapes. */
/** A whole number, none below zero: a count the page says. */
const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

/** One reader per shape the page says: a table, so a new shape is a row, not another branch in one function. */
const PAGE_MESSAGES: { [K in PageMessage["t"]]: (v: Record<string, unknown>) => PageMessage | null } = {
  route: (v) => (typeof v.route === "string" && APP_ROUTE_RE.test(v.route) ? { t: "route", route: v.route } : null),
  needs: (v) => (isCount(v.inbox) ? { t: "needs", inbox: v.inbox } : null),
  session: (v) => (v.state === "in" || v.state === "out" ? { t: "session", state: v.state } : null),
  workspace: (v) => (typeof v.slug === "string" && v.slug.trim() ? { t: "workspace", slug: v.slug.trim() } : null),
  badge: (v) => (isCount(v.n) ? { t: "badge", n: v.n } : null),
  device: (v) =>
    v.state === "registered" || v.state === "forgotten" || v.state === "refused"
      ? { t: "device", state: v.state }
      : null,
  today: (v) => {
    const snapshot = parseTodayWidgetSnapshot(v.snapshot);
    return snapshot ? { t: "today", snapshot } : null;
  },
  calls: (v) => (isCount(v.live) ? { t: "calls", live: v.live } : null),
  token: (v) => {
    const access = typeof v.access === "string" && v.access.trim() ? v.access.trim() : null;
    const expires = typeof v.expires === "number" && Number.isFinite(v.expires) && v.expires >= 0 ? v.expires : 0;
    return { t: "token", access, expires };
  },
  theme: (v) => (v.theme === "light" || v.theme === "dark" ? { t: "theme", theme: v.theme } : null),
};

export function parsePageMessage(raw: string): PageMessage | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(v) || typeof v.t !== "string") return null;
  // Own keys only: "toString" and its kin are on every object and are no shape.
  if (!Object.prototype.hasOwnProperty.call(PAGE_MESSAGES, v.t)) return null;
  return PAGE_MESSAGES[v.t as PageMessage["t"]](v);
}

const token = (v: unknown): string | null =>
  typeof v === "string" && v.trim() && v.trim().length <= PUSH_TOKEN_MAX ? v.trim() : null;

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
    case "token":
      return { t: "token" };
    case "device": {
      const tok = token(v.token);
      const platform = v.platform === "ios" || v.platform === "android" ? v.platform : null;
      const version = typeof v.version === "string" ? v.version.trim().slice(0, 40) : "";
      const activity = token(v.activity);
      return tok && platform ? { t: "device", token: tok, platform, version, ...(activity ? { activity } : {}) } : null;
    }
    default:
      return null;
  }
}
