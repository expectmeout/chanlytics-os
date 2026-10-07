/**
 * One request's name: how it is chosen, and what a name may look like. "What happened to this click?" is then one
 * search across both apps' logs, the jobs the click queued and the events it wrote.
 *
 * This file chooses and checks names; it holds none. The name of the request being served is held in log/request.ts
 * (an AsyncLocalStorage on globalThis, so every bundled copy of channels sees one store): `withRequestId` runs work
 * inside a name and `requestId()` reads it back. It is read by
 *   - the logger (log/logger.ts), which puts `request_id` on every line written inside a request;
 *   - scheduleJob (packages/jobs schedule.ts), which stamps it into a job's payload as `request_id`, unless the
 *     payload already names one;
 *   - dispatchJob (packages/jobs handlers.ts), which runs a job under its payload's name, else under its own row id;
 *   - the service-role database client (packages/db observe.ts namedFetch, made in service-client.ts), which sends it
 *     as x-chanlytics-request-id on every call, so `events.request_id` is filled whether TypeScript or a SQL function
 *     wrote the row (00277);
 *   - the edge's door() and the dashboard's withRoute, which name a request as it enters, run it inside its name and
 *     answer it back in REQUEST_ID_HEADER; and the dashboard's edgeHeaders, which sends it on to the edge in the same
 *     header and signs it into the edge token (edge-token.ts `rid`).
 *
 * `requestIdOf(headers, { trustCaller })` picks the name as a request enters: the caller's x-request-id, only where
 * the caller is trusted to name its own request and the value is shaped like a name; else the platform's own for the
 * invocation (x-vercel-id); else a fresh uuid. Only the edge's admin doors, called by the dashboard, trust their
 * caller. A browser's header is never taken, since it could name its requests after someone else's: withRoute passes
 * trustCaller false, and a webhook's door is named by the platform. An admin door first takes the name signed into a
 * verified edge token (door() in apps/edge/lib/log.ts), so a header alone never renames a call whose token verified;
 * this is what it falls back to.
 *
 * `requestIdShaped` is the one shape check: 8 to 128 letters, digits and . _ : - (a log field, never a sentence or a
 * payload). The edge token uses it to admit a name to sign and to read one back; the job runner, to read a payload's
 * `request_id`.
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
