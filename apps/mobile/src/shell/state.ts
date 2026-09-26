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
}

export const INITIAL: ShellState = {
  slug: null,
  session: "unknown",
  needs: 0,
  activeTab: "today",
  siteSha: null,
  lastReloadAt: 0,
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
