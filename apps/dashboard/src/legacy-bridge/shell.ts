/**
 * The shell on the classic pages: the two actions that used to live in the
 * floating pill — sign out and switching workspaces — the status the shell
 * alone knows (the connection, the live feed, a newer build, surfaces that
 * stopped refreshing), and the chrome's words (contracts/chrome.ts) for the
 * sidebar's menus, the shortcuts sheet, the line under the top bar and the
 * tab's name.
 */
import {
  THEME_OPTIONS,
  SHORTCUTS,
  pageTitle,
  shortcutGroups,
  shellStatusLine,
  isTypingTarget,
  workspaceHotkey,
  toastShape,
  replyWaitsOnYou,
  stateOf,
  nextThemePref,
  themeButtonWords,
  liveBar,
  liveStillUp,
  fmtClock,
  type ShellStatus,
} from "@chanlytics/contracts";
import { clearSurfaceCache } from "./surface-cache";
import { switchWorkspace } from "./surface-data";
import { refreshAllSurfaces } from "./surface-runner";
import type { Connection, SurfaceStatus } from "./surface-status";

export interface ShellApi {
  /** End the session: the surface cache first, then the server, which redirects to sign-in. */
  signOut(): void;
  switchWorkspace(id: string): void;
  /** Another workspace for this account: the create screen, then a switch to it. */
  createWorkspace(): void;
  /** The line's Retry: every surface read again, through the running runner. */
  retry(): Promise<void>;
  /** Name the tab and keep the name; returns the stop, for when the name changes. */
  keepTitle(title: string): () => void;
}

export interface ChromeWords {
  themes: typeof THEME_OPTIONS;
  /** The theme preference a press of the top bar's button makes, through all three. */
  nextTheme: typeof nextThemePref;
  /** What that button shows and says. */
  themeButton: typeof themeButtonWords;
  shortcuts: typeof SHORTCUTS;
  shortcutGroups: typeof shortcutGroups;
  statusLine: typeof shellStatusLine;
  /** What the shell says across the top while someone is on the phone, and the heartbeat rule under it. */
  liveBar: typeof liveBar;
  liveStillUp: typeof liveStillUp;
  /** Seconds → "m:ss", the clock the Live page already speaks. */
  fmtClock: typeof fmtClock;
  /** The tab's name: from the crumbs the shell draws, with what needs you counted. */
  title: typeof pageTitle;
  workspaceHotkey: typeof workspaceHotkey;
  /** A toast's tone, icon, role and lifetime: decided in contracts, drawn by usePPToast. */
  toast: typeof toastShape;
  /** A state's tone and words: decided in contracts, drawn by StatePill. */
  state: typeof stateOf;
  /** Whether a reply counting down to send waits on you (contracts standing.ts). */
  replyWaits: typeof replyWaitsOnYou;
  /** Whether a key press belongs to a field being typed in. */
  typing(target: EventTarget | null): boolean;
}

declare global {
  interface Window {
    __shell?: ShellApi;
    __chrome?: ChromeWords;
    __SHELL_STATUS?: ShellStatus;
    /** Inside the native app (app-bridge.ts): the phone this page registered, forgotten before a sign-out. */
    __appBridge?: { receive(raw: string): void; forgetPhone(): Promise<void> };
  }
}

export function installShell(win: Window = window): void {
  win.__shell = {
    signOut() {
      clearSurfaceCache();
      // This device's bell marks belong to the person who made them: gone
      // with their session, so the next person signing in here starts with
      // their own rather than a stranger's read marks on the same workspace.
      try {
        const gone: string[] = [];
        for (let i = 0; i < win.localStorage.length; i++) {
          const k = win.localStorage.key(i);
          if (k && k.startsWith("chanlytics:notifs:")) gone.push(k);
        }
        for (const k of gone) win.localStorage.removeItem(k);
      } catch {
        /* storage blocked: nothing was kept there either */
      }
      // Inside the app the page forgets the phone it registered first, so the
      // next person signing in on it is not told about this one's threads
      // (app-bridge.ts forgetPhone: two seconds at most, then the sign-out
      // goes on). The shell used to intercept the sign-out to ask for this,
      // and replayed it as a GET the route does not answer.
      const forget = win.__appBridge?.forgetPhone() ?? Promise.resolve();
      void forget.finally(() => {
        // A real form post: the server clears the session and redirects, and
        // the browser follows it the way a link would.
        const form = win.document.createElement("form");
        form.method = "post";
        form.action = "/auth/signout";
        form.hidden = true;
        win.document.body.appendChild(form);
        form.submit();
      });
    },
    switchWorkspace(id) {
      switchWorkspace(id);
    },
    createWorkspace() {
      win.dispatchEvent(new CustomEvent("shell:create-workspace"));
    },
    retry() {
      return refreshAllSurfaces();
    },
    keepTitle(title) {
      // The layout's own <title> can land after the shell has named the tab: on a page loaded cold it
      // put "Chanlytics OS" back, and only a count that changed later (the Inbox's) wrote the name
      // again. So the name is written, and written back whenever the head changes it.
      const doc = win.document;
      doc.title = title;
      // A stand-in window (a test's) may have no observer or head; a browser has both.
      const Watch = (win as { MutationObserver?: typeof MutationObserver }).MutationObserver;
      const head = (doc as { head?: HTMLHeadElement | null }).head;
      if (!Watch || !head) return () => {};
      const watch = new Watch(() => {
        if (doc.title !== title) doc.title = title;
      });
      watch.observe(head, { childList: true, subtree: true, characterData: true });
      return () => watch.disconnect();
    },
  };
  win.__chrome = {
    themes: THEME_OPTIONS,
    nextTheme: nextThemePref,
    themeButton: themeButtonWords,
    shortcuts: SHORTCUTS,
    shortcutGroups,
    statusLine: shellStatusLine,
    liveBar,
    liveStillUp,
    fmtClock,
    title: pageTitle,
    workspaceHotkey,
    toast: toastShape,
    state: stateOf,
    // A reply counting down to send waits on you (contracts standing.ts): the Inbox's Needs you and People's, one rule.
    replyWaits: replyWaitsOnYou,
    typing(target) {
      const el = target as { tagName?: string; isContentEditable?: boolean } | null;
      return isTypingTarget(el?.tagName ?? null, !!el?.isContentEditable);
    },
  };
}

/**
 * What the shell tells the line: the surfaces that stopped refreshing, by
 * their labels, and the connection. A surface that never loaded is not among
 * them: its page says so itself ("Can't reach your workspace").
 */
export function shellStatusOf(
  statuses: ReadonlyMap<string, SurfaceStatus>,
  connection: Connection,
  stale: boolean,
  labels: Readonly<Record<string, string>>,
): ShellStatus {
  const degraded = Object.entries(labels)
    .filter(([key]) => statuses.get(key) === "degraded")
    .map(([, label]) => label);
  return { stale, degraded, offline: connection.offline, disconnected: connection.realtimeDown };
}

/** What the line under the top bar reads; dispatched whenever any part of it changes. */
export function publishShellStatus(status: ShellStatus, win: Window = window): void {
  const said = (s: ShellStatus) => JSON.stringify([s.stale, s.degraded, !!s.offline, !!s.disconnected, !!s.paused]);
  const prev = win.__SHELL_STATUS;
  if (prev && said(prev) === said(status)) return;
  win.__SHELL_STATUS = status;
  win.dispatchEvent(new CustomEvent("shell:status"));
}
