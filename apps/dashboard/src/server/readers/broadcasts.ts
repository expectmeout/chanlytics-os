import "server-only";
import type { BroadcastDetailDto, BroadcastDto } from "@chanlytics/contracts";
import { getBroadcast, listBroadcasts } from "../broadcasts";
import { recentTouches } from "../playbooks";
import { stamp, type Reader } from "./index";

/**
 * GET broadcasts, as the route answers it: the recent fifty with what their messages earned, whether older ones exist
 * beyond them, and who a run of any kind reached within the week, from the turn's clock -- the composer says how many
 * of an audience heard from one. Touches that cannot be read are null, said in the log, and the composer says nothing,
 * rather than a list of nobody. The route's body, moved here whole. A broadcast is not a row a citation names until
 * Phase 4 gives it a kind.
 */
export const broadcasts: Reader<undefined, { broadcasts: BroadcastDto[]; more: boolean; touched: string[] | null }> = {
  name: "broadcasts",
  async read(rc) {
    const [list, touched] = await Promise.all([
      listBroadcasts(rc.ctx, rc.tenantId),
      recentTouches(rc.ctx, rc.tenantId, rc.now).catch((e: unknown) => {
        console.error(
          "broadcast_touches_failed",
          JSON.stringify({ tenant: rc.tenantId, error: e instanceof Error ? e.message : String(e) }),
        );
        return null;
      }),
    ]);
    return { data: { ...list, touched: touched ? Object.keys(touched) : null }, rows: [], stamp: stamp() };
  },
};

/**
 * GET broadcasts/:id, as the route answers it: one broadcast of the workspace read and every person on it, in the
 * words of what happened to them and what came back from each (server/broadcasts.ts getBroadcast); one not here is its
 * 404. The route checks the id is one. No row of its own until Phase 4.
 */
export const broadcast: Reader<{ id: string }, BroadcastDetailDto> = {
  name: "broadcast",
  async read(rc, { id }) {
    return { data: await getBroadcast(rc.ctx, rc.tenantId, id), rows: [], stamp: stamp() };
  },
};
