/**
 * What a provider's own screen sent the browser back with: one word in the address (`?meta=error&why=…`), taken off the
 * address as it is read, and kept for the page until its row's Ok.
 *
 * Kept, because a page is drawn more than once as it loads: on a desk the frame draws it, sets it aside while its reads
 * arrive and draws it again (frame/shell-hooks.ts useViewFade). A second drawing that read the address again found
 * nothing, so a refused connection said nothing at all (21 Nov 2026: an Instagram account refused in another workspace,
 * twice, on a silent page). Whoever reads a return holds one keeper at its module's level and asks it on every drawing.
 */

/** What came back: the outcome, the reason beside it, and whose workspace it names (its own address's word), if any. */
export interface CameBack {
  outcome: string;
  why: string | null;
  at: string | null;
}

/**
 * The word a provider's return left in this page's address under `key`, taken off the address as it is read (with the
 * reason and the workspace beside it); null for none, and for an address that cannot be read.
 */
export function takeFromAddress(key: string): CameBack | null {
  try {
    const query = new URLSearchParams(window.location.search);
    const outcome = query.get(key);
    if (!outcome) return null;
    const returned: CameBack = { outcome, why: query.get("why"), at: query.get("at") };
    for (const word of [key, "why", "at"]) query.delete(word);
    const rest = query.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`,
    );
    return returned;
  } catch {
    return null;
  }
}

/** What a keeper answers: what it holds, on every drawing, and the Ok that ends it. */
export interface Keeper<T> {
  read: () => T | null;
  seen: () => void;
}

/**
 * A keeper of what `take` finds. `take` is asked on every read: what it finds is held, and where it finds nothing
 * (the address was wiped by the read before) what is held is the answer, until `seen` (the row's Ok). A newer return
 * takes the place of one nobody acknowledged.
 */
export function keepsUntilSeen<T>(take: () => T | null): Keeper<T> {
  let held: T | null = null;
  return {
    read: () => {
      held = take() ?? held;
      return held;
    },
    seen: () => {
      held = null;
    },
  };
}
