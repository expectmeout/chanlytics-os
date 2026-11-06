/**
 * The views a surface has read, held so that going back to one paints at once and is read again behind (the loading
 * standard's piece B). Leads held its last eight in a Map of its own; Calendar held one window and read it again each
 * way; Reports one period. A surface whose view the address or the page picks -- a Leads view, a Calendar window, a
 * Reports period -- keeps them here.
 *
 * - The last `max` views by key, the newest kept: holding one again makes it the newest.
 * - Each workspace's apart (from the address), so the same view of another workspace is never painted.
 * - `ask()` for each read of the view on screen; `still()` when it lands says whether a newer one was asked for
 *   since, and a slow answer for a view already left is dropped rather than landing on the new one.
 * - In memory only: a view held is read again the moment it is shown, so it is safe across a write, and signing out
 *   or changing workspace is a new document.
 */
import { getActiveWorkspace } from "./workspace";

export interface HeldViews<T> {
  get(key: string): T | undefined;
  has(key: string): boolean;
  hold(key: string, value: T): void;
  forget(): void;
  /** A read of the view on screen is starting: `still()` says, when it lands, whether it is still the newest asked. */
  ask(): { still(): boolean };
}

export function heldViews<T>(max: number): HeldViews<T> {
  const held = new Map<string, T>();
  let asked = 0;
  const scoped = (key: string) => `${getActiveWorkspace() ?? "-"}|${key}`;
  return {
    get: (key) => held.get(scoped(key)),
    has: (key) => held.has(scoped(key)),
    hold(key, value) {
      const at = scoped(key);
      held.delete(at);
      held.set(at, value);
      while (held.size > max) held.delete(held.keys().next().value as string);
    },
    forget() {
      held.clear();
    },
    ask() {
      const mine = ++asked;
      return { still: () => mine === asked };
    },
  };
}
