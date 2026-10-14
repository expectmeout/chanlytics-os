/**
 * The page's side of the bridge to the native shell (the phone app's PRD, decision M3; the shapes in
 * contracts/app-bridge.ts). Installed at boot by LegacyApp, and a no-op anywhere but inside the app: the document is
 * stamped html.in-app before paint, and the shell's WebView puts `ReactNativeWebView.postMessage` on the window.
 *
 * What the page says: the route it is on (at install and on every change), that a person is signed in (the
 * shell only ever boots this bundle for one: the proxy sends anyone else to /login, which the shell reads from the
 * address), the needs-you count (surfaces/needs-you.ts, the badge on the native tab), the bell's kept rows' unread count
 * (the icon), and the workspace
 * the address names, and whether a sheet or a dialog stands over the page. What the shell asks: go to a route, open
 * the menu, scroll to the top, close what stands over the page. A message the page cannot parse does nothing.
 */
import {
  callsStillUp,
  canonicalRoute,
  IN_APP_CLASS,
  isUuid,
  parsePageMessage,
  parseShellMessage,
  todayWidgetSnapshot,
  type LiveVM,
  type PageMessage,
  type TodayVM,
  type Waits,
} from "@chanlytics/contracts";
import { hearNeedsYou, needsYouNow, needsYouOnToday } from "../surfaces/needs-you";
import { api } from "./api";
import { sealSurfaceCache } from "./surface-cache";
import { setPageBehind } from "./hearing/front";
import { goToRoute, hearAddress, pathWorkspace, routeOnScreen, workspaceHref } from "./workspace";
import type { AddressParts } from "@chanlytics/contracts";

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
  location: AddressParts & { assign(url: string): void };
  history: {
    pushState(data: unknown, unused: string, url?: string | null): void;
    replaceState(data: unknown, unused: string, url?: string | null): void;
  };
  /** The workspace this page is about, by id, once the page has read its workspaces (surface-data.ts). */
  __ACTIVE_WORKSPACE?: string;
  ReactNativeWebView?: { postMessage(s: string): void };
  __appBridge?: { receive(raw: string): void; forgetPhone(): Promise<void> };
  /** The bell (notifications.ts), when it is installed: its number is the icon's. */
  __notifs?: { keptUnread(): number; onChange(cb: () => void): () => void };
  /** Today's view model, as the surface seam publishes it (surface-data.ts): what the widget shows. */
  TODAY_DATA?: TodayVM;
  /** The Live page's view model: how many calls are still up ends, or keeps, the phone's call activity. */
  __LIVE?: Pick<LiveVM, "now" | "heartbeatMs">;
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

/**
 * What the bridge asks of the count of what needs you: its number now (null before the Inbox has been read), to be told
 * when it may have moved, and its parts for Today's widget (the page's own, else the brief's: needsYouOnToday).
 */
export interface NeedsSource {
  now(): number | null;
  hear(fn: () => void): () => void;
  parts(vm: TodayVM): Waits;
}
const NEEDS_YOU: NeedsSource = { now: () => needsYouNow(), hear: hearNeedsYou, parts: (vm) => needsYouOnToday(vm) };

export function installAppBridge(
  win: BridgeWindow = window,
  doors: DeviceDoors = deviceDoors,
  source: NeedsSource = NEEDS_YOU,
): () => void {
  if (!win.document.documentElement.classList.contains(IN_APP_CLASS) || !win.ReactNativeWebView) return () => {};
  const post = (m: PageMessage) => {
    // Round-tripped through the parser so the page never posts a shape the shell would refuse.
    const raw = JSON.stringify(m);
    if (parsePageMessage(raw)) win.ReactNativeWebView?.postMessage(raw);
  };
  const route = () => post({ t: "route", route: routeOnScreen(win) });
  const workspace = () => {
    const slug = pathWorkspace(win.location.pathname ?? "");
    if (slug) post({ t: "workspace", slug });
  };
  // What needs you, for the native Inbox tab's badge: the one count every surface says (surfaces/needs-you.ts), said at
  // install when the Inbox has been read and whenever the number changes, never twice in a row.
  let needsSaid: number | null = null;
  const counts = () => {
    const needs = source.now();
    if (needs === null || !Number.isFinite(needs)) return;
    const inbox = Math.max(0, Math.floor(needs));
    if (inbox === needsSaid) return;
    needsSaid = inbox;
    post({ t: "needs", inbox });
  };
  // Today for the widget: on every refresh of the page's Today, whenever what waits moves (a run approved, a reply held:
  // the count's parts, which the widget says), and at install when it is already there; never the same twice in a row.
  let todaySaid: string | null = null;
  const today = () => {
    const vm = win.TODAY_DATA;
    if (!vm || typeof vm !== "object" || !vm.standing || !vm.queue) return;
    const snapshot = todayWidgetSnapshot(vm, new Date(), source.parts(vm));
    const key = JSON.stringify({ ...snapshot, at: "" });
    if (key === todaySaid) return;
    todaySaid = key;
    post({ t: "today", snapshot });
  };
  const offAddress = hearAddress(route, win);
  const offNeeds = source.hear(() => {
    counts();
    today();
  });
  win.addEventListener("workspace:changed", workspace);
  win.addEventListener("surface:today", today);
  // The calls still up, for the Lock Screen's activity: none means the phone may end what it shows. A call marked live
  // that the provider has gone quiet on is not up (liveStillUp, the rule every count of them asks).
  const calls = () => {
    const read = win.__LIVE;
    if (read && Array.isArray(read.now)) post({ t: "calls", live: callsStillUp(read, Date.now()).length });
  };
  win.addEventListener("surface:live", calls);
  // The phone this page registered for the person signed in, so a sign-out can forget it (shell.ts signOut).
  const phone: Phone = { token: null };
  const shell = shellEvents(win);
  const overlays = watchOverlays(win, post);
  const pushes = pushedRoutes(win);
  const answering: Answering = { doors, post, phone, shell, overlays, pushes };
  win.__appBridge = {
    receive: (raw: string) => answerShell(answering, raw),
    forgetPhone: () => forgetPhone(doors, post, phone),
  };
  // A file the page made (the kit's `downloadCsv`, surfaces/kit/download.ts), asked for with a cancelable `app:file`: taken to the app's share sheet,
  // and the event cancelled so the page does not also try the download a WebView drops. One that is no file the app
  // would take is left to the page.
  const file = (e: Event) => {
    const raw = JSON.stringify({ t: "file", ...((e as CustomEvent<object>).detail ?? {}) });
    if (!parsePageMessage(raw)) return;
    win.ReactNativeWebView?.postMessage(raw);
    e.preventDefault();
  };
  win.addEventListener("app:file", file);
  // The icon's number is the bell's kept rows' unread count, by the rule the edge counts them by before a push (contracts
  // unreadFor, through the bell's `keptUnread`): said at install and on every change of the feed or the marks. The bell's whole
  // count also counts the rows the page derives itself, which the edge cannot, so the icon read 2 with the app closed and 5
  // once it was open (D1-phone-badge).
  const badge = () => {
    const n = win.__notifs?.keptUnread();
    if (typeof n === "number") post({ t: "badge", n: Math.max(0, Math.floor(n)) });
  };
  const offBell = win.__notifs?.onChange(badge) ?? (() => {});
  post({ t: "session", state: "in" });
  const stopTheme = watchTheme(win, post);
  workspace();
  route();
  overlays.tell();
  counts();
  badge();
  today();
  return () => {
    offAddress();
    offNeeds();
    win.removeEventListener("workspace:changed", workspace);
    win.removeEventListener("surface:today", today);
    win.removeEventListener("surface:live", calls);
    win.removeEventListener("app:file", file);
    stopTheme();
    overlays.stop();
    shell.stop();
    pushes.stop();
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

/** What answering the shell needs: its doors, its voice, its phone, its shell's events, its overlays and its pushes. */
interface Answering {
  doors: DeviceDoors;
  post: Post;
  phone: Phone;
  shell: ShellEvents;
  overlays: Overlays;
  pushes: Pushes;
}

/**
 * How long a tapped push waits for the page's workspaces read before it opens its workspace's page without it: the
 * boot's first read, which a phone has within a second or two. One that fails says nothing, and the push still opens.
 */
const PUSH_WAIT_MS = 5000;

/** A tapped push's route, opened in its workspace (the shell's navigate); `stop` drops one still waiting. */
interface Pushes {
  open(route: string, workspace: string | undefined): void;
  stop(): void;
}

/**
 * Whether a push's workspace (always its id, contracts parseShellMessage) is the one this page is about: by the id its
 * workspaces read resolved (`__ACTIVE_WORKSPACE`), and before that by its address, which names it by id where a push
 * opened it (workspaceHref) and by slug everywhere else. A slug says nothing of an id, so a page at one cannot tell
 * yet (null); off a workspace page (the home, which sends the tab on), no workspace is this page's.
 */
function isThisWorkspace(win: BridgeWindow, id: string): boolean | null {
  if (win.__ACTIVE_WORKSPACE) return win.__ACTIVE_WORKSPACE === id;
  const named = pathWorkspace(win.location.pathname ?? "");
  if (!named) return false;
  return isUuid(named) ? named.toLowerCase() === id.toLowerCase() : null;
}

/**
 * A tapped push's route, in its workspace. One for this workspace, or with no workspace said, moves the route; one for
 * another opens that workspace's page (the site takes its id in the path as it takes a slug), sealing the tab's cache
 * as a switch does: a read landing before the page unloads is this workspace's, and was written back.
 *
 * The shell sends the push as soon as the page says its route, which is before the workspaces read lands on a cold
 * page, and the push was then taken for another workspace whatever it named: the page sealed its cache and loaded
 * again for the workspace it was already in, by id, and the read moved it back to the slug. The address answers now
 * where it names the id, and on a slug's address the push waits for the read (`surface:workspace`); past PUSH_WAIT_MS
 * without it, it opens its workspace's page as it did, so a push is never opened under a workspace the page cannot say
 * is its own. The latest tap is the one opened.
 */
function pushedRoutes(win: BridgeWindow): Pushes {
  let waiting: { route: string; workspace: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const go = (route: string, workspace: string, mine: boolean) => {
    if (mine) return goToRoute(route, {}, win);
    sealSurfaceCache();
    // Spelled as the shell spells it (contracts canonicalRoute), as goToRoute spells a move in this workspace.
    win.location.assign(workspaceHref(workspace, `#/${canonicalRoute(route)}`));
  };
  function stop(): void {
    waiting = null;
    if (timer) clearTimeout(timer);
    timer = null;
    win.removeEventListener("surface:workspace", settle);
  }
  // The read landed, or the wait is over: a workspace the page still cannot name as the push's is another's.
  function settle(): void {
    const w = waiting;
    stop();
    if (w) go(w.route, w.workspace, isThisWorkspace(win, w.workspace) === true);
  }
  return {
    open(route, workspace) {
      stop();
      if (!workspace) return goToRoute(route, {}, win);
      const mine = isThisWorkspace(win, workspace);
      if (mine !== null) return go(route, workspace, mine);
      waiting = { route, workspace };
      win.addEventListener("surface:workspace", settle);
      timer = setTimeout(settle, PUSH_WAIT_MS);
    },
    stop,
  };
}

/** One ask from the shell, parsed and answered; a message that does not parse does nothing. */
function answerShell({ doors, post, phone, shell, overlays, pushes }: Answering, raw: string): void {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return;
  }
  const m = parseShellMessage(v);
  if (!m) return;
  if (m.t === "navigate") {
    pushes.open(m.route, m.workspace);
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
  if (m.t === "front") {
    setPageBehind(!m.front);
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
  void sayDevice(registered, "registered", post);
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
