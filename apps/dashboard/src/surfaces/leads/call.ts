/**
 * How a lead call is sent, and the one call another page makes too: Check again, which a sequence's People press as well
 * (decision 0131). Apart from the Leads surface so that a page reaching for it does not load the Leads page with it.
 */
import { api } from "@/bridge/api";
import type { ApiResult, RouteKey } from "@/client/api";

interface LeadCallOptions {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  /**
   * false: nothing is re-read after it (a draft changes nothing anyone is looking at). "behind": the surface is
   * re-read all the same, but the act answers when the door accepts (client/api.ts), so the next press in a list
   * being worked down does not wait for two reads.
   */
  refresh?: false | "behind";
  /** One intent's key, kept until it lands (client/api.ts Options.once, decision 0035): a write that spends. */
  once?: boolean;
}

/**
 * One lead call, by the key the generated registry uses, answered by the DTO
 * 4.6 spells.
 *
 * Every one of release B's routes has a key now (Task 4.4 regenerated the
 * registry), so this is the one client and nothing else: it signs the tab out
 * on a 401, forgets the reads a write invalidated, and takes what a write
 * leaves stale from `refresh-map.ts` rather than from the caller.
 */
export function leadCall<O>(key: string, opts: LeadCallOptions = {}): Promise<ApiResult<O>> {
  // The route is named at run time, so the one client's per-route types cannot follow it: O is the route's, by its caller.
  return api()(key as RouteKey, opts as never) as Promise<ApiResult<O>>;
}

/** Check again (D3): the mailbox check once more for the addresses whose last check did not answer. */
export async function checkLeadsAgain(ids: string[]) {
  return leadCall<{ scheduled: number; skipped: number; toast: string }>("POST leads/check-again", {
    body: { ids },
    once: true,
  });
}
