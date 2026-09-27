/**
 * What the shell knows, in one small store read with useSyncExternalStore: which workspace the pages are about,
 * whether a person is signed in, the needs-you count for the Inbox badge, the phone's tokens and what became of
 * them, the page's theme, and the build the site last reported. Every page's messages land here (bridge.ts); every
 * tab and the root layout read from here. Which tab is in front is front.ts's, outside React.
 */
import { useSyncExternalStore } from "react";
import type { Theme } from "@chanlytics/contracts";

export type Session = "unknown" | "in" | "out";
export type Tab = "today" | "inbox" | "calendar" | "people" | "more";

export interface ShellState {
  slug: string | null;
  session: Session;
  needs: number;
  siteSha: string | null;
  lastReloadAt: number;
  /** The phone's push token, once the service gave one; null on a simulator or after a refusal. */
  token: string | null;
  /** The Live Activity's push-to-start token (iOS 17.2+), once the phone handed it out; registered beside the token. */
  activityToken: string | null;
  /** The token the page has registered for the person signed in; a new token or a new person registers again. */
  registered: string | null;
  /** The token pair the site refused, until the next foreground: asked again then, not at once and for ever. */
  refused: string | null;
  /** A tapped notification's route, until the owning tab's page has been asked to open it. */
  pendingRoute: string | null;
  /** The icon's number, as the bell last said it. */
  badge: number;
  /** The site said this app is older than it speaks to (/api/version min_app): the update screen stands. */
  tooOld: boolean;
  /** The session's access token for the shell's own calls (decision 0011), as the page last handed it over; memory only. */
  access: { token: string; expires: number } | null;
  /**
   * The theme the page is drawn in, as the page last said (the member's own choice, not the device's): what every
   * native screen, the tab bar and the status bar follow. Dark until a page says otherwise, which is the web's own
   * default for a device that has chosen nothing.
   */
  theme: Theme;
}

export const INITIAL: ShellState = {
  slug: null,
  session: "unknown",
  needs: 0,
  siteSha: null,
  lastReloadAt: 0,
  token: null,
  activityToken: null,
  registered: null,
  refused: null,
  pendingRoute: null,
  badge: 0,
  tooOld: false,
  access: null,
  theme: "dark",
};

let state: ShellState = INITIAL;
const listeners = new Set<() => void>();
/** Every mounted page's reload, so a deploy can reload them all. */
const reloaders = new Set<() => void>();

export function getState(): ShellState {
  return state;
}

export function setState(patch: Partial<ShellState>): void {
  const next = { ...state, ...patch };
  if (Object.keys(patch).every((k) => next[k as keyof ShellState] === state[k as keyof ShellState])) return;
  state = next;
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useShell<T>(select: (s: ShellState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(state),
    () => select(state),
  );
}

export function registerReloader(fn: () => void): () => void {
  reloaders.add(fn);
  return () => reloaders.delete(fn);
}

export function reloadEveryPage(): void {
  reloaders.forEach((fn) => fn());
}
