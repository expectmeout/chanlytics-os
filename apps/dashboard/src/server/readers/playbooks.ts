import "server-only";
import { dealPaceOf, dealsAreOn } from "@chanlytics/contracts";
import { listPlaybooks, recentTouches, triggerPools, type PlaybookListRow } from "../playbooks";
import { dealPaceRead } from "../deals";
import { load, stamp, type Reader } from "./index";
import * as readers from "./facts";

type Pools = Awaited<ReturnType<typeof triggerPools>>;

/** GET playbooks' answer: the eight keys the Playbooks page reads, in the route's order. */
export interface PlaybooksPage {
  playbooks: PlaybookListRow[];
  timezone: string;
  touched: Record<string, string>;
  pools: Pools["pools"];
  calendar: Pools["calendar"];
  lists: Pools["lists"];
  people_lists: Pools["people"];
  deals_on: boolean;
}

/**
 * GET playbooks, as the route answers it: the workspace's playbooks with what their runs earned, the business's clock
 * (the hours are its), who any broadcast reached this week (the breath the page shows), each trigger's pool over
 * everyone counted the way a run counts it -- no one looking, the week's touches applied -- and the lists a playbook
 * may run on, each with its own pool, and whether deals are on here (0008), which offers and counts the proposal
 * follow-up (0006). The route's body, moved here whole, so the Playbooks page and Ask's list_playbooks say the same
 * numbers. The workspace's name and zone, how its customers buy and its settings come through their readers, once in a
 * turn: the pools' calendar lookup reads neither the zone nor the settings again. A playbook is not a row a citation
 * names until Phase 4 gives it a kind.
 */
export const playbooks: Reader<undefined, PlaybooksPage> = {
  name: "playbooks",
  async read(rc) {
    const ctx = rc.ctx;
    const tenantId = rc.tenantId;
    const now = rc.now;
    const [playbooks, facts, touched, sellsBy, paceRead] = await Promise.all([
      listPlaybooks(ctx, tenantId),
      load(rc, readers.facts, undefined).then((r) => r.data),
      recentTouches(ctx, tenantId, now),
      load(rc, readers.sellsBy, undefined).then((r) => r.data),
      // The pace the edge's sweep reads (packages/db yesesSince): the follow-up's pool is the run's own.
      dealPaceRead(ctx, tenantId, now),
    ]);
    const dealsOn = dealsAreOn(sellsBy);
    const { pools, calendar, lists, people } = await triggerPools(
      ctx,
      tenantId,
      touched,
      facts.timezone,
      now,
      { on: dealsOn, pace: dealsOn ? dealPaceOf(paceRead) : null },
      // The zone just read, and the settings the turn's config reader holds, asked for where the pools' calendar
      // lookup would read its own: a settings read that fails costs the visit moments, never the page.
      () =>
        load(rc, readers.config, undefined).then((r) => ({ timezone: facts.timezone, config: r.data?.config ?? null })),
    );
    return {
      data: {
        playbooks,
        timezone: facts.timezone,
        touched,
        pools,
        calendar,
        lists,
        people_lists: people,
        deals_on: dealsOn,
      },
      rows: [],
      stamp: stamp(),
    };
  },
};
