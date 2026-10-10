/**
 * A value a caller already holds, or how to read it where it is first needed: handed down so a function reads it itself
 * and never twice (server/calendar/people-visits.ts ZoneAndSettings, the people handed to audience.ts audiencePool and
 * playbook-pools.ts poolReads by the readers). And a read asked for before its answer is needed, held with how it settled.
 */
export type Lazy<T> = T | (() => PromiseLike<T>);

/** What a Lazy stands for: the value itself, or its read made now. A promise either way, for the caller to await. */
export function lazily<T>(v: Lazy<T>): Promise<T> {
  return Promise.resolve(typeof v === "function" ? (v as () => PromiseLike<T>)() : v);
}

/**
 * A read several callers may ask for and one makes: asked by the first to call, answered to each from that one asking,
 * and never asked where none calls (workspace/setup.ts, the workspace's mailbox, which three of its reads want).
 */
export function once<T>(read: () => Promise<T>): () => Promise<T> {
  let asked: Promise<T> | undefined;
  return () => (asked ??= read());
}

/** How a read settled: its answer, or what it failed with. */
export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * A promise that answers how it settled, and never rejects: one read among several that may refuse is weighed after the
 * rest (workspace-list.ts), and a read asked early is judged where its answer is used, in the words it always failed
 * in, never as a rejection nobody was waiting for (campaigns/playbook-pools.ts poolReads).
 */
export const settled = <T>(p: PromiseLike<T>): Promise<Settled<T>> =>
  Promise.resolve(p).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
