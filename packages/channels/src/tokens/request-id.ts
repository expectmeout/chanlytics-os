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
  const given = opts.trustCaller ? headers.get(REQUEST_ID_HEADER)?.trim() : undefined;
  if (given && SHAPE.test(given)) return given;
  const platform = headers.get("x-vercel-id")?.trim();
  if (platform && SHAPE.test(platform)) return platform;
  return globalThis.crypto.randomUUID();
}
