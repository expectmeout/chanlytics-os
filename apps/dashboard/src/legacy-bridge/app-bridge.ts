/**
 * The page's side of the bridge to the native shell (the phone app's PRD, decision M3; the shapes in
 * contracts/app-bridge.ts). Installed at boot by LegacyApp, and a no-op anywhere but inside the app: the document is
 * stamped html.in-app before paint, and the shell's WebView puts `ReactNativeWebView.postMessage` on the window.
 *
 * What the page says: the hash route it is on (at install and on every change), that a person is signed in (the
 * shell only ever boots this bundle for one: the proxy sends anyone else to /login, which the shell reads from the
 * address), the needs-you count the Inbox publishes (inbox:counts, the badge on the native tab), and the workspace
 * the address names, and whether a sheet or a dialog stands over the page. What the shell asks: go to a route, open
 * the menu, scroll to the top, close what stands over the page. A message the page cannot parse does nothing.
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
import { workspaceHref } from "./workspace";

interface BridgeWindow {
  document: {
    documentElement: {
      classList: { contains(c: string): boolean };
      /** `data-theme`, the theme the page is drawn in (LegacyApp resolves it; app-shell paints it). */
      getAttribute?(name: string): string | null;
    };
    /** The page's dialogs and sheets, what stands over it (watchOverlays); a test's window lists its own. */
    querySelectorAll?(selector: string): ArrayLike<OverlayNode>;
    activeElement?: unknown;
    body?: unknown;
  };
  location: { hash: string; pathname: string; assign(url: string): void };
  /** The workspace this page is about, by id, once the page has read its workspaces (surface-data.ts). */
  __ACTIVE_WORKSPACE?: string;
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
}
export const deviceDoors: DeviceDoors = {
  register: async (device) => (await api()("PUT me/devices", { body: device })).ok,
  forget: async (token) => (await api()("DELETE me/devices", { body: { token } })).ok,
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
  const shell = shellEvents(win);
  const overlays = watchOverlays(win, post);
  const answering: Answering = { win, doors, post, phone, shell, overlays };
  win.__appBridge = {
    receive: (raw: string) => answerShell(answering, raw),
    forgetPhone: () => forgetPhone(doors, post, phone),
  };
  // A file the page made (chart-core's CSV), asked for with a cancelable `app:file`: taken to the app's share sheet,
  // and the event cancelled so the page does not also try the download a WebView drops. One that is no file the app
  // would take is left to the page.
  const file = (e: Event) => {
    const raw = JSON.stringify({ t: "file", ...((e as CustomEvent<object>).detail ?? {}) });
    if (!parsePageMessage(raw)) return;
    win.ReactNativeWebView?.postMessage(raw);
    e.preventDefault();
  };
  win.addEventListener("app:file", file);
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
  overlays.tell();
  badge();
  today();
  return () => {
    win.removeEventListener("hashchange", route);
    win.removeEventListener("inbox:counts", counts);
    win.removeEventListener("workspace:changed", workspace);
    win.removeEventListener("surface:today", today);
    win.removeEventListener("surface:live", calls);
    win.removeEventListener("app:file", file);
    stopTheme();
    overlays.stop();
    shell.stop();
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

/** What answering the shell needs: the page, its doors, its voice, its phone, its shell's events and its overlays. */
interface Answering {
  win: BridgeWindow;
  doors: DeviceDoors;
  post: Post;
  phone: Phone;
  shell: ShellEvents;
  overlays: Overlays;
}

/** One ask from the shell, parsed and answered; a message that does not parse does nothing. */
function answerShell({ win, doors, post, phone, shell, overlays }: Answering, raw: string): void {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return;
  }
  const m = parseShellMessage(v);
  if (!m) return;
  if (m.t === "navigate") {
    // A push told for another workspace opens that workspace's page: the site takes its id in the path as it takes a
    // slug. One for this workspace, or with no workspace said, moves the hash.
    if (m.workspace && m.workspace !== win.__ACTIVE_WORKSPACE)
      win.location.assign(workspaceHref(m.workspace, `#/${m.route}`));
    else win.location.hash = "/" + m.route;
    return;
  }
  if (m.t === "menu" || m.t === "top") {
    shell.say(m.t);
    return;
  }
  if (m.t === "close") {
    overlays.close();
    return;
  }
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
}

/** A dialog or a sheet as the page holds it: enough to tell whether it shows, and to hand it a key. */
interface OverlayNode {
  isConnected: boolean;
  getClientRects(): { length: number };
  contains(other: unknown): boolean;
  dispatchEvent(e: Event): boolean;
}

interface Overlays {
  /** Say what stands over the page now, changed or not: at install. */
  tell(): void;
  close(): void;
  stop(): void;
}

/** What stands over a page: a dialog, a sheet or an open menu (the ⋯ menus, the account's), by the roles they carry. */
const OVERLAY_SELECTOR = '[role="dialog"], [aria-modal="true"], [role="menu"]';
/**
 * How long a close waits to see its overlay gone. React takes it away within a frame of the key; the still copy that
 * plays it out (data-bits leaving) carries no role, so it is not counted as the overlay standing.
 */
const CLOSE_WAIT_MS = 250;

/**
 * Whether something stands over the page, for Android's Back: said at install and on every change, and closed on the
 * shell's ask with the key every sheet and dialog closes on, Escape, handed to the topmost one (to what has the focus
 * inside it, when something does, so a field's own Escape is the one that answers). A sheet that is saving keeps
 * itself open, and that Back does nothing; one that Escape has left standing twice running is not asked again, and
 * Back walks the page's history past it, as it did before, rather than stopping on it for ever. A window with no
 * MutationObserver, a test's, says what stands at install and after each close.
 */
function watchOverlays(win: BridgeWindow, post: Post): Overlays {
  const doc = win.document;
  const deaf = new WeakSet<OverlayNode>();
  let refused: OverlayNode | null = null;
  const top = (): OverlayNode | null => {
    const all = doc.querySelectorAll ? Array.from(doc.querySelectorAll(OVERLAY_SELECTOR)) : [];
    for (let i = all.length - 1; i >= 0; i--)
      if (!deaf.has(all[i]) && all[i].getClientRects().length > 0) return all[i];
    return null;
  };
  let open = false;
  const say = () => {
    const now = top() !== null;
    if (now !== open) post({ t: "overlay", open: (open = now) });
  };
  const body = doc.body;
  const watcher = typeof MutationObserver === "function" && body instanceof Node ? new MutationObserver(say) : null;
  watcher?.observe(body as Node, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["role", "aria-modal", "hidden", "open"],
  });
  return {
    tell: () => post({ t: "overlay", open: (open = top() !== null) }),
    close() {
      const el = top();
      if (!el) return say();
      const focused = doc.activeElement;
      const target = focused && el.contains(focused) ? (focused as OverlayNode) : el;
      target.dispatchEvent(escapeKey());
      setTimeout(() => {
        const stands = el.isConnected && top() === el;
        if (stands && refused === el) deaf.add(el);
        refused = stands ? el : null;
        say();
      }, CLOSE_WAIT_MS);
    },
    stop: () => watcher?.disconnect(),
  };
}

/** Escape, as a keyboard sends it: the key every sheet's and dialog's own handler listens for. */
function escapeKey(): Event {
  const init = { key: "Escape", code: "Escape", bubbles: true, cancelable: true };
  return typeof KeyboardEvent === "function"
    ? new KeyboardEvent("keydown", init)
    : Object.assign(new Event("keydown", init), { key: "Escape", code: "Escape" });
}

interface ShellEvents {
  say(kind: "menu" | "top"): void;
  stop(): void;
}

/**
 * The shell's own events (`shell:menu`, `shell:top`), heard by app-shell.jsx once it has mounted. The bridge is
 * installed as the page's script loads, seconds before the shell compiles and mounts, so the app's More tab asked for
 * the drawer before anything listened and the drawer never opened. An ask that arrives before the shell says
 * `shell:ready` waits: the last menu ask is replayed then; a scroll to the top of a page not yet drawn is dropped.
 */
function shellEvents(win: BridgeWindow): ShellEvents {
  let ready = false;
  let menuWaiting = false;
  const onReady = () => {
    ready = true;
    if (menuWaiting) win.dispatchEvent(new CustomEvent("shell:menu"));
    menuWaiting = false;
  };
  win.addEventListener("shell:ready", onReady);
  return {
    say(kind) {
      if (ready) win.dispatchEvent(new CustomEvent(`shell:${kind}`));
      else if (kind === "menu") menuWaiting = true;
    },
    stop: () => win.removeEventListener("shell:ready", onReady),
  };
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
