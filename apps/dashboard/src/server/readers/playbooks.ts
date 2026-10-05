import "server-only";
import { dealPaceOf, dealsAreOn, type ChannelsReady, type MonthSent } from "@chanlytics/contracts";
import { channelsReadyOrNull } from "../campaigns/channels-ready";
import { monthSentOrNull } from "../campaigns/month-sent";
import { listPlaybooks, recentTouches, triggerPools, type PlaybookListRow } from "../campaigns/playbooks";
import { dealPaceRead } from "../people/deals";
import { load, stamp, type Reader } from "./index";
import * as readers from "./facts";
import { everyone } from "./everyone";

type Pools = Awaited<ReturnType<typeof triggerPools>>;

/** GET playbooks' answer: the nine keys the Playbooks page reads, in the route's order. */
interface PlaybooksPage {
  playbooks: PlaybookListRow[];
  timezone: string;
  touched: Record<string, string>;
  pools: Pools["pools"];
  calendar: Pools["calendar"];
  lists: Pools["lists"];
  people_lists: Pools["people"];
  deals_on: boolean;
  /** Whether the workspace can send on each channel now, which the pools were counted against; null where unread. */
  ready: ChannelsReady | null;
  /** What its campaigns have sent by email and by text this calendar month (month-sent.ts); null where unread. */
  month_sent: MonthSent | null;
}

/**
 * GET playbooks, as the route answers it: the workspace's playbooks with what their runs earned, the business's clock
 * (the hours are its), who any broadcast reached this week (the breath the page shows), each trigger's pool over
 * everyone counted the way a run counts it -- no one looking, the week's touches applied -- and the lists a playbook
 * may run on, each with its own pool, and whether deals are on here (0008), which offers and counts the proposal
 * follow-up (0006). The route's body, moved here whole, so the Playbooks page and campaigns.playbooks say the same
 * numbers. The workspace's name and zone, how its customers buy and its settings come through their readers, once in a
 * turn: the pools' calendar lookup reads neither the zone nor the settings again. Everyone the pools count is the
 * turn's own read too (readers/everyone.ts), which the audience pool shares. Each playbook is a row a citation names,
 * opened on Playbooks at its card.
 */
export const playbooks: Reader<undefined, PlaybooksPage> = {
  name: "playbooks",
  async read(rc) {
    const ctx = rc.ctx;
    const tenantId = rc.tenantId;
    const now = rc.now;
    const [playbooks, facts, touched, sellsBy, paceRead, ready, month_sent] = await Promise.all([
      listPlaybooks(ctx, tenantId),
      load(rc, readers.facts, undefined).then((r) => r.data),
      recentTouches(ctx, tenantId, now),
      load(rc, readers.sellsBy, undefined).then((r) => r.data),
      // The pace the edge's sweep reads (packages/db yesesSince): the follow-up's pool is the run's own.
      dealPaceRead(ctx, tenantId, now),
      // Whether each channel can send now: the pools are counted against it, and the composer draws its ticks from it.
      channelsReadyOrNull(ctx, tenantId, { withPause: true }),
      // The month's emails and texts already sent, which the composer says before a send and the head from half used.
      monthSentOrNull(tenantId, now),
    ]);
    const dealsOn = dealsAreOn(sellsBy);
    const { pools, calendar, lists, people } = await triggerPools(
      ctx,
      tenantId,
      touched,
      facts.timezone,
      now,
      { on: dealsOn, pace: dealsOn ? dealPaceOf(paceRead) : null },
      // Everyone, and the zone and settings, from the turn, each read just where the pools read their own: everyone
      // once a turn, shared with the audience pool; a settings read that fails costs the visit moments, never the page.
      // And the playbooks, so one whose message is stricter than its moment is counted by the message (strictMessagePools).
      {
        people: () => load(rc, everyone, undefined).then((r) => r.data),
        known: readers.zoneAndSettings(rc),
        playbooks,
        ready,
      },
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
        ready,
        month_sent,
      },
      rows: playbooks.map((p) => ({ kind: "playbook" as const, id: p.id, route: `outbound/${p.id}`, label: p.name })),
      stamp: stamp(),
    };
  },
};
