/**
 * What a route's answer says about its own time, for the browser's timing panel and for field data: the
 * Server-Timing header (one `name;dur=<ms>` per part, in the order given). The wrapper writes the session check and
 * the handler apart, so a slow answer says which of the two it was, and then where the handler's time went (decision
 * 0053): its database calls (`db`, and how many in `desc`) and each reader it read through (`read.<name>`), the
 * longest first. The shell reads them back from the browser's own timing of the read (page-speed.ts), so a page that
 * waited on a read can say how much of the wait was the server's. Durations and counts only: never a value from the
 * request.
 */
import { UUID } from "@chanlytics/contracts";

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

/** One request in this many says what its database calls touched and the page it was asked from (touchedLine). */
const TOUCHES_SAID_ONE_IN = 20;

/** A request's name as a number, the same wherever it is asked: whether it is in the sample (FNV-1a, 32 bits). */
function sampleNumberOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/**
 * The page of the app a request was asked from, as its address says it after the workspace: its first two words, a view's
 * picks after a colon left off and an id said as `:id` (`clients/:id`, `reports/reviews`, `admin/workspace`). Never the
 * workspace. Null where the request did not come from a page of a workspace.
 */
function pageAskedFrom(referer: string | null): string | null {
  if (!referer) return null;
  let path: string;
  try {
    path = new URL(referer).pathname;
  } catch {
    return null;
  }
  const words = path.split("/").filter(Boolean);
  if (words[0] !== "w" || words.length < 2) return null;
  const page = words.slice(2, 4).map((w) => {
    if (UUID.test(w)) return ":id";
    const cut = w.indexOf(":");
    return cut > 0 ? w.slice(0, cut) : w;
  });
  return page.length ? page.join("/") : "today";
}

/**
 * What a sample of answered requests say of their database (decision 0058; the wiring's second audit, lane R7): each table its
 * calls touched with how, and each SQL function it called, as one line (`contacts:read messages:INSERT rpc:merge:call`), and the
 * page it was asked from. A script holds each route's trace to them, and derives what a write's own notice would read on that
 * page against what its row of the refresh map read (tooling/scripts/ops/write-shadow.mjs). Names of tables and functions only,
 * never a value. Null for a request outside the sample, which is chosen by the request's name.
 */
export function touchedLine(
  id: string,
  touches: ReadonlyMap<string, ReadonlySet<string>>,
  referer: string | null,
): { tables: string; page: string | null } | null {
  if (sampleNumberOf(id) % TOUCHES_SAID_ONE_IN !== 0) return null;
  const tables = [...touches]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([table, hows]) => `${table}:${[...new Set([...hows].flatMap((h) => h.split(" ")))].sort().join("+")}`)
    .join(" ");
  return { tables, page: pageAskedFrom(referer) };
}
