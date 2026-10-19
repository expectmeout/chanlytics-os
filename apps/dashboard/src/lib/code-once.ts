/**
 * Code fetched once and shared: a page's part, a surface's read, a sheet, a rule set only a press needs. The first call
 * fetches it, every later call shares that fetch, and a fetch that failed (a dropped line, a deploy that took the old chunk
 * away) is fetched again by the next call, so a lost connection costs one try and not the session. `now()` is the module
 * once it is in, for a reading that cannot wait (a draw, a clock's tick); `warm()` fetches it ahead of need, leaving a
 * failure to whoever asks next.
 *
 * The frame every page loads carries what every page draws before its first paint, and nothing else: the rest is fetched
 * this way, where it is first needed or once the page is idle (the loadability review, 19 Oct 2026). The bundler makes a
 * chunk of whatever `load` imports, so it is written `() => import("./module")`, the path a literal. A component draws a
 * chunk's module through use-code.ts.
 */
export interface CodeOnce<T> {
  (): Promise<T>;
  /** The module, once its fetch has landed; null before, and after a fetch that failed. Free to hand on. */
  readonly now: () => T | null;
  /** Fetch it now, ahead of need; a fetch that fails is asked for again by the next call. Free to hand on. */
  readonly warm: () => void;
}

export function codeOnce<T>(load: () => Promise<T>): CodeOnce<T> {
  let held: T | null = null;
  let loading: Promise<T> | null = null;
  const code = (): Promise<T> =>
    (loading ??= load().then(
      (m) => (held = m),
      (e: unknown) => {
        loading = null;
        throw e;
      },
    ));
  return Object.assign(code, {
    now: (): T | null => held,
    warm: (): void => void code().catch(() => undefined),
  });
}
