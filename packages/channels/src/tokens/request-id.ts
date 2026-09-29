/**
 * One request's name, from the browser to the edge and back: the dashboard names each request it serves (with-route),
 * every line it logs carries the name, a call it makes to the edge carries it in REQUEST_ID_HEADER, and the edge's
 * lines carry it too. "What happened to this click?" is then one search, across both apps' logs.
 */

/** The header a request's name rides in: from the dashboard to the edge, and back to the browser on every answer. */
export const REQUEST_ID_HEADER = "x-request-id";

/** What a name may look like: a log field, never a sentence or a payload. */
const SHAPE = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * The name this request goes by. The caller's, when it is trusted to give one (the edge's admin doors, called by the
 * dashboard with a token) and gave a sane one; else the platform's own for this request (x-vercel-id); else a fresh
 * one. A browser's header is not taken: it could name its requests after someone else's.
 */
export function requestIdOf(headers: Headers, opts: { trustCaller: boolean }): string {
  const given = opts.trustCaller ? requestIdShaped(headers.get(REQUEST_ID_HEADER)) : null;
  if (given) return given;
  const platform = headers.get("x-vercel-id")?.trim();
  if (platform && SHAPE.test(platform)) return platform;
  return globalThis.crypto.randomUUID();
}

/** A value that may name a request (a job's payload, a header), trimmed, or null when it is not one. */
export function requestIdShaped(value: unknown): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  return SHAPE.test(v) ? v : null;
}
