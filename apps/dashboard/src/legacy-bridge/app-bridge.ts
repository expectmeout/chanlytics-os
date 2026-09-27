/**
 * The page's side of the bridge to the native shell (the phone app's PRD, decision M3; the shapes in
 * contracts/app-bridge.ts). Installed at boot by LegacyApp, and a no-op anywhere but inside the app: the document is
 * stamped html.in-app before paint, and the shell's WebView puts `ReactNativeWebView.postMessage` on the window.
 *
 * What the page says: the hash route it is on (at install and on every change), that a person is signed in (the
 * shell only ever boots this bundle for one: the proxy sends anyone else to /login, which the shell reads from the
 * address), the needs-you count the Inbox publishes (inbox:counts, the badge on the native tab), and the workspace
 * the address names. What the shell asks: go to a route, open the menu, scroll to the top. A message the page cannot
 * parse does nothing.
 */
import {
  IN_APP_CLASS,
  parsePageMessage,
  parseShellMessage,
  todayWidgetSnapshot,
  type PageMessage,
  type TodayVM,
} from "@chanlytics/contracts";
import { api } from "./api";
import { createClient } from "../lib/supabase/client";

interface BridgeWindow {
  document: {
    documentElement: {
      classList: { contains(c: string): boolean };
      /** `data-theme`, the theme the page is drawn in (LegacyApp resolves it; app-shell paints it). */
      getAttribute?(name: string): string | null;
    };
  };
  location: { hash: string; pathname: string };
  ReactNativeWebView?: { postMessage(s: string): void };
  __appBridge?: { receive(raw: string): void; forgetPhone(): Promise<void> };
  /** The bell (notifications.ts), when it is installed: its number is the icon's. */
  __notifs?: { unread(): number; onChange(cb: () => void): () => void };
  /** Today's view model, as the surface seam publishes it (surface-data.ts): what the widget shows. */
  TODAY_DATA?: TodayVM;
  /** The Live page's view model: how many calls are in progress ends, or keeps, the phone's call activity. */
  __LIVE?: { now: unknown[] };
  addEventListener(type: string, fn: (e: Event) => void): void;
  removeEventListener(type: string, fn: (e: Event) => void): void;
  dispatchEvent(e: Event): boolean;
}

/** The two account writes the shell asks for, through the page's own client; injectable so the rule runs in a test. */
export interface DeviceDoors {
  register(device: {
    token: string;
    platform: "ios" | "android";
    app_version?: string;
    activity_token?: string;
  }): Promise<boolean>;
  forget(token: string): Promise<boolean>;
  /**
   * The session's access token and its expiry (epoch seconds), for the shell's own calls (decision 0011); null when
   * the page has none. The access token only: the refresh token stays in the page, which refreshes on its own.
   */
  token(): Promise<{ access: string; expires: number } | null>;
}
export const deviceDoors: DeviceDoors = {
  register: async (device) => (await api()("PUT me/devices", { body: device })).ok,
  forget: async (token) => (await api()("DELETE me/devices", { body: { token } })).ok,
  token: async () => {
    const { data } = await createClient().auth.getSession();
    const s = data.session;
    return s?.access_token ? { access: s.access_token, expires: s.expires_at ?? 0 } : null;
  },
};

/** The hash route's name without its leading "#/", "today" when there is none: what app-shell.jsx parses. */
export function hashRoute(hash: string): string {
  return (hash || "#/today").replace(/^#\/?/, "") || "today";
}

/** The workspace a path names, /w/<slug>, or null off a workspace page (legacy-bridge/workspace.ts's rule). */
function slugOf(pathname: string): string | null {
  const m = /^\/w\/([^/?#]+)/.exec(pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]) || null;
  } catch {
    return null;
  }
}

export function installAppBridge(
  win: BridgeWindow = window as unknown as BridgeWindow,
  doors: DeviceDoors = deviceDoors,
): () => void {
  if (!win.document.documentElement.classList.contains(IN_APP_CLASS) || !win.ReactNativeWebView) return () => {};
  const post = (m: PageMessage) => {
    // Round-tripped through the parser so the page never posts a shape the shell would refuse.
    const raw = JSON.stringify(m);
    if (parsePageMessage(raw)) win.ReactNativeWebView?.postMessage(raw);
  };
  const route = () => post({ t: "route", route: hashRoute(win.location.hash) });
  const workspace = () => {
    const slug = slugOf(win.location.pathname);
    if (slug) post({ t: "workspace", slug });
  };
  const counts = (e: Event) => {
    const needs = (e as CustomEvent<{ needs?: unknown }>).detail?.needs;
    if (typeof needs === "number") post({ t: "needs", inbox: Math.max(0, Math.floor(needs)) });
  };
  // Today for the widget: on every refresh of the page's Today, and at install when it is already there.
  const today = () => {
    const vm = win.TODAY_DATA;
    if (vm && typeof vm === "object" && vm.standing && vm.queue)
      post({ t: "today", snapshot: todayWidgetSnapshot(vm, new Date()) });
  };
  win.addEventListener("hashchange", route);
  win.addEventListener("inbox:counts", counts);
  win.addEventListener("workspace:changed", workspace);
  win.addEventListener("surface:today", today);
  // The calls in progress, for the Lock Screen's activity: none means the phone may end what it shows.
  const calls = () => {
    const live = win.__LIVE?.now;
    if (Array.isArray(live)) post({ t: "calls", live: live.length });
  };
  win.addEventListener("surface:live", calls);
  // The phone this page registered for the person signed in, so a sign-out can forget it (shell.ts signOut).
  const phone: Phone = { token: null };
  win.__appBridge = {
    receive: (raw: string) => answerShell(win, doors, post, raw, phone),
    forgetPhone: () => forgetPhone(doors, post, phone),
  };
  // The bell's number is the icon's: said at install and on every change of the feed or the marks.
  const badge = () => {
    const n = win.__notifs?.unread();
    if (typeof n === "number") post({ t: "badge", n: Math.max(0, Math.floor(n)) });
  };
  const offBell = win.__notifs?.onChange(badge) ?? (() => {});
  post({ t: "session", state: "in" });
  const stopTheme = watchTheme(win, post);
  workspace();
  route();
  badge();
  today();
  return () => {
    win.removeEventListener("hashchange", route);
    win.removeEventListener("inbox:counts", counts);
    win.removeEventListener("workspace:changed", workspace);
    win.removeEventListener("surface:today", today);
    win.removeEventListener("surface:live", calls);
    stopTheme();
    offBell();
    delete win.__appBridge;
  };
}

type Post = (m: PageMessage) => void;
/** The push token this page registered, until it is forgotten. */
interface Phone {
  token: string | null;
}
/** How long a sign-out waits for the phone to be forgotten before it goes on without it. */
const FORGET_WAIT_MS = 2000;

/**
 * The theme the page is drawn in, for the shell's own chrome: said now, and whenever LegacyApp repaints data-theme
 * (the member changed their choice, or System followed the device). Watched the way the map and the mascot watch
 * it; a window with no MutationObserver, a test's, says it once. Returns the stop.
 */
function watchTheme(win: BridgeWindow, post: Post): () => void {
  const root = win.document.documentElement;
  const say = () => {
    const t = root.getAttribute?.("data-theme");
    if (t === "light" || t === "dark") post({ t: "theme", theme: t });
  };
  say();
  if (typeof MutationObserver !== "function" || !(root instanceof Node)) return () => {};
  const watcher = new MutationObserver(say);
  watcher.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  return () => watcher.disconnect();
}

/** One ask from the shell, parsed and answered; a message that does not parse does nothing. */
function answerShell(win: BridgeWindow, doors: DeviceDoors, post: Post, raw: string, phone: Phone): void {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return;
  }
  const m = parseShellMessage(v);
  if (!m) return;
  if (m.t === "navigate") {
    win.location.hash = "/" + m.route;
    return;
  }
  if (m.t === "menu" || m.t === "top") {
    win.dispatchEvent(new CustomEvent(`shell:${m.t}`));
    return;
  }
  if (m.t === "device") {
    // The phone registers through the page: the cookie, the same-origin rule and the rate bucket are the page's.
    const device = {
      token: m.token,
      platform: m.platform,
      ...(m.version ? { app_version: m.version } : {}),
      ...(m.activity ? { activity_token: m.activity } : {}),
    };
    const registered = doors.register(device).then((ok) => {
      if (ok) phone.token = m.token;
      return ok;
    });
    sayDevice(registered, "registered", post);
    return;
  }
  // The shell's own calls carry the session's access token (decision 0011); the page is where it lives.
  void doors
    .token()
    .then((t) => post({ t: "token", access: t?.access ?? null, expires: t?.expires ?? 0 }))
    .catch(() => post({ t: "token", access: null, expires: 0 }));
}

/** What became of a device door, said to the shell: done, or refused, and a door that throws is a refusal. */
function sayDevice(door: Promise<boolean>, done: "registered" | "forgotten", post: Post): Promise<void> {
  return door
    .then((ok) => post({ t: "device", state: ok ? done : "refused" }))
    .catch(() => post({ t: "device", state: "refused" }));
}

/**
 * Before a sign-out (shell.ts): the phone this page registered is forgotten, through the page's own door while the
 * session still stands, and the shell hears which way it went. Nothing registered is nothing to do; a door that is
 * slow does not hold the sign-out past FORGET_WAIT_MS.
 */
function forgetPhone(doors: DeviceDoors, post: Post, phone: Phone): Promise<void> {
  const tok = phone.token;
  if (!tok) return Promise.resolve();
  phone.token = null;
  const forgotten = sayDevice(doors.forget(tok), "forgotten", post);
  return Promise.race([forgotten, new Promise<void>((r) => setTimeout(r, FORGET_WAIT_MS))]);
}
