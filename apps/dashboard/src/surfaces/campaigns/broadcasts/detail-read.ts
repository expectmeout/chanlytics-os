/**
 * One run's read (GET broadcasts/[id]: the run and everyone on it), with the tab's last answer for each run it opened
 * (read-cache.ts: in memory, per workspace, emptied by any write), so a run opened again paints at once and is read again
 * behind. A module of its own, apart from the broadcasts verbs and the view models they draw, so a page that only starts a
 * run's read before it is opened (the Inbox's run row) carries none of them. A refusal is never kept.
 */
import { api } from "@/legacy-bridge/api";
import { readCache } from "@/legacy-bridge/read-cache";
import type { ApiResult, Output } from "@/client/api";
import { rememberRun } from "./run-names";

type DetailAnswer = ApiResult<Output<"GET broadcasts/[id]">>;
const details = readCache<DetailAnswer>("broadcast", (r) => r.ok);

// Each answer the run's read has is remembered for its crumb (run-names.ts), a warm's among them.
const readDetail = (id: string) => () =>
  api()("GET broadcasts/[id]", { params: { id } }).then((r) => {
    if (r.ok) rememberRun(r.data.broadcast);
    return r;
  });

/** Who hears each run's answers as they land: the landing of a link to the run (broadcasts/route.tsx). */
const hearers = new Map<string, Set<(answer: DetailAnswer) => void>>();

/**
 * One run and every person on it. A read: nothing refreshes. Kept for the run, so its next open is at once; each answer
 * that lands is told to whoever hears the run (hearRunDetail), the page's own Retry's among them.
 */
export async function runDetail(id: string): Promise<DetailAnswer> {
  const answer = await details.through(id, readDetail(id));
  for (const hear of hearers.get(id) ?? []) hear(answer);
  return answer;
}

/**
 * Hear a run's answers as the page reads them (its open, a Retry, a re-read as it moves), rather than read it again: what
 * a link to the run lands by, once it knows what the run is. Answers the stop.
 */
export function hearRunDetail(id: string, hear: (answer: DetailAnswer) => void): () => void {
  const own = hearers.get(id) ?? new Set();
  own.add(hear);
  hearers.set(id, own);
  return () => {
    own.delete(hear);
    if (own.size === 0) hearers.delete(id);
  };
}

/** The last answer this tab holds for a run, to paint while it is read again; null when it has none. */
export const peekRunDetail = (id: string): DetailAnswer | null => details.peek(id);

/** Start a run's read before it is opened (a door to it on screen), so its open paints at once; nothing where it is held. */
export function warmRunDetail(id: string): void {
  void details.warm(id, readDetail(id));
}
