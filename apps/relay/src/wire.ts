/**
 * What comes off the wire is unknown until it is read: a key door's answer, Drive's refusal, a ticket's claim. This says
 * whether a value read from JSON is an object with fields, so each reader checks a field before it believes one.
 */
export const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
