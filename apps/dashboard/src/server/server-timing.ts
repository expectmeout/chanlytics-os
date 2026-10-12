/**
 * What a route's answer says about its own time, for the browser's timing panel and for field data: the
 * Server-Timing header (one `name;dur=<ms>` per part, in the order given). The wrapper writes the session check and
 * the handler apart, so a slow answer says which of the two it was, and then where the handler's time went (decision
 * 0053): its database calls (`db`, and how many in `desc`) and each reader it read through (`read.<name>`), the
 * longest first. The shell reads them back from the browser's own timing of the read (page-speed.ts), so a page that
 * waited on a read can say how much of the wait was the server's. Durations and counts only: never a value from the
 * request.
 */

/** One share of the handler's time, by name: how long, and how many calls or reads it was. */
interface Share {
  ms: number;
  n: number;
}

/** How many shares an answer says: the longest, so the header stays a line. */
const SHARES_SAID = 8;

const rounded = (ms: number): number => Math.max(0, Math.round(Number.isFinite(ms) ? ms : 0));
/** A header token: letters, digits and `._-` (RFC 9110 tchar, narrowed), whatever a name was written with. */
const token = (name: string): string => name.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 48) || "part";

export function serverTimingHeader(
  parts: Record<string, number>,
  shares: ReadonlyMap<string, Share> = new Map(),
): string {
  const said = Object.entries(parts).map(([name, ms]) => `${name};dur=${rounded(ms)}`);
  const spent = [...shares]
    .sort((a, b) => b[1].ms - a[1].ms || a[0].localeCompare(b[0]))
    .slice(0, SHARES_SAID)
    .map(([name, s]) => `${token(name)};dur=${rounded(s.ms)};desc="${Math.max(0, Math.round(s.n))}"`);
  return [...said, ...spent].join(", ");
}
