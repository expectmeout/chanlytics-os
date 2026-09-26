/**
 * What the shell knows, in one small store read with useSyncExternalStore: which workspace the pages are about,
 * whether a person is signed in, the needs-you count for the Inbox badge, which tab is in front, and the build the
 * site last reported. Every page's messages land here (bridge.ts); every tab and the root layout read from here.
 */
import { useSyncExternalStore } from "react";

export type Session = "unknown" | "in" | "out";
export type Tab = "today" | "inbox" | "calendar" | "people" | "more";

export interface ShellState {
  slug: string | null;
  session: Session;
  needs: number;
  activeTab: Tab;
  siteSha: string | null;
  lastReloadAt: number;
  /** The phone's push token, once the service gave one; null on a simulator or after a refusal. */
  token: string | null;
  /** The Live Activity's push-to-start token (iOS 17.2+), once the phone handed it out; registered beside the token. */
  activityToken: string | null;
  /** The token the page has registered for the person signed in; a new token or a new person registers again. */
  registered: string | null;
  /** A tapped notification's route, until the owning tab's page has been asked to open it. */
  pendingRoute: string | null;
  /** The icon's number, as the bell last said it. */
  badge: number;
  /** The site said this app is older than it speaks to (/api/version min_app): the update screen stands. */
  tooOld: boolean;
}

export const INITIAL: ShellState = {
  slug: null,
  session: "unknown",
  needs: 0,
  activeTab: "today",
  siteSha: null,
  lastReloadAt: 0,
  token: null,
  activityToken: null,
  registered: null,
  pendingRoute: null,
  badge: 0,
  tooOld: false,
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

export function resetState(): void {
  setState(INITIAL);
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
