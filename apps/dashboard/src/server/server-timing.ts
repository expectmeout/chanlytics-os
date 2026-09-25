/**
 * What a route's answer says about its own time, for the browser's timing panel and for field data: the
 * Server-Timing header (one `name;dur=<ms>` per part, in the order given). The wrapper writes the session check and
 * the handler apart, so a slow answer says which of the two it was. Durations only: never a value from the request.
 */
export function serverTimingHeader(parts: Record<string, number>): string {
  return Object.entries(parts)
    .map(([name, ms]) => `${name};dur=${Math.max(0, Math.round(Number.isFinite(ms) ? ms : 0))}`)
    .join(", ");
}
