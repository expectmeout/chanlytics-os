/**
 * The shell's doors, read the one way (decision 0015): what a TSX surface asks of a page of the shell it has no module for
 * is read off the window by name when the page asks, never when this loads, so a stand-in window a test builds later is
 * the one read. Each surface's own `shell.ts` says which names it reads and how each is typed; the three readers they
 * share are here. Each door is a line to delete on the day its owner moves.
 */

/** A name off the window, whatever it holds. */
export const windowValue = (name: string): unknown => Reflect.get(window, name);

/** A function the shell published, or nothing where it has not. */
export function fn<A extends unknown[], R>(name: string): ((...args: A) => R) | undefined {
  const v = windowValue(name);
  return typeof v === "function" ? (v as (...args: A) => R) : undefined;
}

/** An object the shell published, or nothing where it has not. */
export function object<T extends object>(name: string): T | undefined {
  const v = windowValue(name);
  return typeof v === "object" && v !== null ? (v as T) : undefined;
}
