/**
 * A value kept on globalThis under a registered symbol, so every copy of a module sees one: core and jobs inline their
 * own copies of db and channels, and a port, a breaker or a test's stand-in handed to one copy would be unseen by the
 * others. Each kept its own `globalThis as { [SLOT]?: T }`, the checker told the slot's type at every read (decision
 * 0112); the slot says it here, once.
 */

/** One slot: what it holds, `set` (answering what it held before, to put back), and `keep` (made once, then kept). */
export interface GlobalSlot<T> {
  get(): T | undefined;
  set(value: T | undefined): T | undefined;
  keep(make: () => T): T;
}

/** The slot `Symbol.for(key)` names. Its type is the caller's word: one key is read by one module and its copies. */
export function globalSlot<T>(key: string): GlobalSlot<T> {
  const symbol = Symbol.for(key);
  // globalThis has no index signature; the slot is ours alone, so what it holds is what `set` and `keep` put there.
  const holder = globalThis as { [slot: symbol]: T | undefined };
  return {
    get: () => holder[symbol],
    set: (value) => {
      const before = holder[symbol];
      holder[symbol] = value;
      return before;
    },
    keep: (make) => (holder[symbol] ??= make()),
  };
}
