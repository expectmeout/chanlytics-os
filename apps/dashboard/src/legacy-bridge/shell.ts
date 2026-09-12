/**
 * The shell on the classic pages: the two actions that used to live in the
 * floating pill — sign out and switching workspaces — the status the shell
 * alone knows (a newer build, surfaces that stopped refreshing), and the
 * chrome's words (contracts/chrome.ts) for the sidebar's menus and the
 * shortcuts sheet.
 */
import { THEME_OPTIONS, SHORTCUTS, shortcutGroups, shellStatusLine, isTypingTarget, workspaceHotkey, toastShape, stateOf, type ShellStatus } from "@chanlytics/contracts";
import { clearSurfaceCache } from "./surface-cache";
import { switchWorkspace } from "./surface-data";

export interface ShellApi {
  /** End the session: the surface cache first, then the server, which redirects to sign-in. */
  signOut(): void;
  switchWorkspace(id: string): void;
  /** Another workspace for this account: the create screen, then a switch to it. */
  createWorkspace(): void;
}

export interface ChromeWords {
  themes: typeof THEME_OPTIONS;
  shortcuts: typeof SHORTCUTS;
  shortcutGroups: typeof shortcutGroups;
  statusLine: typeof shellStatusLine;
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
  };
  win.__chrome = {
    themes: THEME_OPTIONS,
    shortcuts: SHORTCUTS,
    shortcutGroups,
    statusLine: shellStatusLine,
    workspaceHotkey,
    toast: toastShape,
    state: stateOf,
    typing(target) {
      const el = target as { tagName?: string; isContentEditable?: boolean } | null;
      return isTypingTarget(el?.tagName ?? null, !!el?.isContentEditable);
    },
  };
}

/** What the sidebar's foot reads; dispatched whenever it changes. */
export function publishShellStatus(status: ShellStatus, win: Window = window): void {
  const prev = win.__SHELL_STATUS;
  if (prev && prev.stale === status.stale && prev.degraded.join("") === status.degraded.join("")) return;
  win.__SHELL_STATUS = status;
  win.dispatchEvent(new CustomEvent("shell:status"));
}
