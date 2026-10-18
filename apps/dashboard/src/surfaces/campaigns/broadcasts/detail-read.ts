/**
 * One run's read (GET broadcasts/[id]: the run and everyone on it), with the tab's last answer for each run it opened
 * (read-cache.ts: in memory, per workspace, emptied by any write), so a run opened again paints at once and is read again
 * behind. A module of its own, apart from the broadcasts verbs and the view models they draw, so a page that only starts a
 * run's read before it is opened (the Inbox's run row) carries none of them. A refusal is never kept.
 */
import { api } from "@/legacy-bridge/api";
import { readCache } from "@/legacy-bridge/read-cache";
import type { ApiResult, Output } from "@/client/api";

type DetailAnswer = ApiResult<Output<"GET broadcasts/[id]">>;
const details = readCache<DetailAnswer>("broadcast", (r) => r.ok);

const readDetail = (id: string) => () => api()("GET broadcasts/[id]", { params: { id } });

/** One run and every person on it. A read: nothing refreshes. Kept for the run, so its next open is at once. */
export const runDetail = (id: string): Promise<DetailAnswer> => details.through(id, readDetail(id));

/** The last answer this tab holds for a run, to paint while it is read again; null when it has none. */
export const peekRunDetail = (id: string): DetailAnswer | null => details.peek(id);

/** Start a run's read before it is opened (a door to it on screen), so its open paints at once; nothing where it is held. */
export function warmRunDetail(id: string): void {
  void details.warm(id, readDetail(id));
}
