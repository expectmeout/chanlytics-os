/**
 * The shell on the classic pages: the two actions that used to live in the
 * floating pill — sign out and switching workspaces — the status the shell
 * alone knows (the connection, the live feed, a newer build, surfaces that
 * stopped refreshing), and the chrome's words (contracts/chrome.ts) for the
 * sidebar's menus, the shortcuts sheet, the line under the top bar and the
 * tab's name.
 */
import { THEME_OPTIONS, SHORTCUTS, pageTitle, shortcutGroups, shellStatusLine, isTypingTarget, workspaceHotkey, toastShape, stateOf, type ShellStatus } from "@chanlytics/contracts";
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
}

export interface ChromeWords {
  themes: typeof THEME_OPTIONS;
  shortcuts: typeof SHORTCUTS;
  shortcutGroups: typeof shortcutGroups;
  statusLine: typeof shellStatusLine;
  /** The tab's name: from the crumbs the shell draws, with what needs you counted. */
  title: typeof pageTitle;
  workspaceHotkey: typeof workspaceHotkey;
  /** A toast's tone, icon, role and lifetime: decided in contracts, drawn by usePPToast. */
  toast: typeof toastShape;
  /** A state's tone and words: decided in contracts, drawn by StatePill. */
  state: typeof stateOf;
  /** Whether a key press belongs to a field being typed in. */
  typing(target: EventTarget | null): boolean;
}

declare global {
  interface Window {
    __shell?: ShellApi;
    __chrome?: ChromeWords;
    __SHELL_STATUS?: ShellStatus;
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
      // A real form post: the server clears the session and redirects, and
      // the browser follows it the way a link would.
      const form = win.document.createElement("form");
      form.method = "post";
      form.action = "/auth/signout";
      form.hidden = true;
      win.document.body.appendChild(form);
      form.submit();
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
  };
  win.__chrome = {
    themes: THEME_OPTIONS,
    shortcuts: SHORTCUTS,
    shortcutGroups,
    statusLine: shellStatusLine,
    title: pageTitle,
    workspaceHotkey,
    toast: toastShape,
    state: stateOf,
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
