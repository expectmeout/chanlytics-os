import "server-only";
import type { BroadcastDetailDto, BroadcastDto } from "@chanlytics/contracts";
import { getBroadcast, listBroadcasts } from "../campaigns/broadcasts";
import { recentTouches } from "../campaigns/playbooks";
import { stamp, type Reader, type RowRef } from "./index";

/** A broadcast as a citation names it: a Broadcasts row, opened where its address spells it, a run. */
const runRef = (b: BroadcastDto): RowRef => ({
  kind: "broadcast",
  id: b.id,
  route: `broadcasts/run:${b.id}`,
  label: b.name,
});

/**
 * GET broadcasts, as the route answers it: the recent fifty with what their messages earned, whether older ones exist
 * beyond them, and who a run of any kind reached within the week, from the turn's clock -- the composer says how many
 * of an audience heard from one. Touches that cannot be read are null, said in the log, and the composer says nothing,
 * rather than a list of nobody. The route's body, moved here whole. Each broadcast is a row a citation names.
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
    return {
      data: { ...list, touched: touched ? Object.keys(touched) : null },
      rows: list.broadcasts.map(runRef),
      stamp: stamp(),
    };
  },
};

/**
 * GET broadcasts/:id, as the route answers it: one broadcast of the workspace read and every person on it, in the
 * words of what happened to them and what came back from each (server/campaigns/broadcasts.ts getBroadcast); one not here is its
 * 404. The route checks the id is one. The broadcast is the row a citation names.
 */
export const broadcast: Reader<{ id: string }, BroadcastDetailDto> = {
  name: "broadcast",
  async read(rc, { id }) {
    const data = await getBroadcast(rc.ctx, rc.tenantId, id);
    return { data, rows: [runRef(data.broadcast)], stamp: stamp() };
  },
};
