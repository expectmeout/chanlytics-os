/**
 * A value a caller already holds, or how to read it where it is first needed: handed down so a function reads it just
 * where it would have read its own, never sooner and never twice (server/calendar/calendar.ts ZoneAndSettings, the people
 * handed to audience.ts audiencePool and playbooks.ts triggerPools by the readers).
 */
export type Lazy<T> = T | (() => PromiseLike<T>);

/** What a Lazy stands for: the value itself, or its read made now. A promise either way, for the caller to await. */
export function lazily<T>(v: Lazy<T>): Promise<T> {
  return Promise.resolve(typeof v === "function" ? (v as () => PromiseLike<T>)() : v);
}
