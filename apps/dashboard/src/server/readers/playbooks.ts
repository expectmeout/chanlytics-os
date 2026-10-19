import "server-only";
import {
  addressOf,
  dealPaceOf,
  type AppointmentWord,
  type ChannelsReady,
  type MonthSent,
  type ReachOutChainDto,
} from "@chanlytics/contracts";
import { channelsReadyOrNull } from "../campaigns/channels-ready";
import { monthSentOrNull } from "../campaigns/month-sent";
import { recentTouches } from "@chanlytics/db";
import { listPlaybooks, type PlaybookListRow } from "../campaigns/playbooks";
import { chainsOf } from "../campaigns/reach-outs";
import { poolReads, triggerPools } from "../campaigns/playbook-pools";
import { dealPaceRead } from "../people/deals";
import { load, stamp, type Reader } from "./index";
import * as readers from "./facts";
import { everyone } from "./everyone";

type Pools = Awaited<ReturnType<typeof triggerPools>>;

/** GET playbooks' answer: the keys the Playbooks page reads, in the route's order. */
interface PlaybooksPage {
  playbooks: PlaybookListRow[];
  timezone: string;
  pools: Pools["pools"];
  calendar: Pools["calendar"];
  lists: Pools["lists"];
  people_lists: Pools["people"];
  /** A deal was ever recorded here (readers/facts.ts hasDeals): the journey's proposal stage is drawn only then, or held. */
  has_deals: boolean;
  /** Whether the workspace can send on each channel now, which the pools were counted against; null where unread. */
  ready: ChannelsReady | null;
  /** What its campaigns have sent by email and by text this calendar month (month-sent.ts); null where unread. */
  month_sent: MonthSent | null;
  /** What the workspace calls an appointment (readers/facts.ts appointmentWord). */
  appointment_word: AppointmentWord;
  /** Its bookings arrive by a booking tool's emails: with no calendar feed, its appointment moments need the feed. */
  bookings_by_email: boolean;
}

/**
 * GET playbooks, as the route answers it: the workspace's playbooks with what their runs earned, the business's clock
 * (the hours are its), each trigger's pool over everyone counted the way a run counts it -- no one looking, the week's
 * breath applied (db recentTouches, read here and counted into each pool's `held`, never answered whole) -- and the lists a playbook
 * may run on, each with its own pool, and whether a deal was ever recorded here (0008, amended 18 Oct 2026: every
 * workspace has the proposal follow-up, 0006). The route's body, moved here whole, so the Playbooks page and
 * sequences.moments say the same numbers. The workspace's name and zone, its word, a deal on file and its settings come
 * through their readers, once in a turn: the pools' calendar lookup reads neither the zone nor the settings again. Everyone the pools count is the
 * turn's own read too (readers/everyone.ts), which the audience pool shares. Each playbook is a row a citation names,
 * opened on Playbooks at its card.
 *
 * One wave of reads, not two. The pools' reads waited for the page's first reads to answer and then went one behind
 * another, though only two of them hang on anything those answer; all of them are asked at the start now, and the
 * pools are counted when the last is in (9 Oct 2026: this was the slowest read Campaigns opens on).
 */
export const playbooks: Reader<undefined, PlaybooksPage> = {
  name: "playbooks",
  async read(rc) {
    const ctx = rc.ctx;
    const tenantId = rc.tenantId;
    const now = rc.now;
    const listed = listPlaybooks(ctx, tenantId);
    // How the business works (readers/facts.ts businessShape): whether a deal was ever recorded (no proposal's
    // follow-up or pace is read where none was), and the word and the booking tool the home's moments are said and
    // counted by.
    const shaped = load(rc, readers.businessShape, undefined).then((r) => r.data);
    const dealtRead = shaped.then((s) => s.hasDeals);
    // The pools' own reads leave with the page's first ones, not behind them (campaigns/playbook-pools.ts poolReads):
    // everyone and the zone and settings from the turn (everyone once a turn, shared with the audience pool; a settings
    // read that fails costs the visit moments, never the page), the proposals' follow-ups once it is known a deal is on
    // file, and a stricter message's templates once the playbooks are in.
    const reads = poolReads(ctx, tenantId, now, {
      people: () => load(rc, everyone, undefined).then((r) => r.data),
      known: readers.zoneAndSettings(rc),
      hasDeals: dealtRead,
      playbooks: listed,
    });
    const [playbooks, facts, touched, shape, paceRead, ready, month_sent] = await Promise.all([
      listed,
      load(rc, readers.facts, undefined).then((r) => r.data),
      recentTouches(ctx.supabase, tenantId, now),
      shaped,
      // The pace the edge's sweep reads (packages/db yesesSince): the follow-up's pool is the run's own. Read where a
      // deal is on file: with none there is no yes to measure.
      dealtRead.then((any) => (any ? dealPaceRead(ctx, tenantId, now) : null)),
      // Whether each channel can send now: the pools are counted against it, and the composer draws its ticks from it.
      channelsReadyOrNull(ctx, tenantId, { withPause: true }),
      // The month's emails and texts already sent, which the composer says before a send and the head from half used.
      monthSentOrNull(tenantId, now),
    ]);
    const dealt = shape.hasDeals;
    const { pools, calendar, lists, people } = await triggerPools(
      ctx,
      tenantId,
      touched,
      facts.timezone,
      now,
      { any: dealt, pace: dealt ? dealPaceOf(paceRead) : null },
      // The reads the pools count from, already asked; and the playbooks, so one whose message is stricter than its
      // moment is counted by the message (strictMessagePools).
      { reads, playbooks, ready },
    );
    return {
      data: {
        playbooks,
        timezone: facts.timezone,
        pools,
        calendar,
        lists,
        people_lists: people,
        has_deals: dealt,
        ready,
        month_sent,
        // What the workspace calls an appointment, and whether its bookings arrive by a tool's emails (businessShape).
        appointment_word: shape.word,
        bookings_by_email: shape.bookingsByEmail,
      },
      rows: playbooks.map((p) => ({
        kind: "playbook" as const,
        id: p.id,
        route: addressOf({ kind: "campaign", id: p.id }),
        label: p.name,
      })),
      stamp: stamp(),
    };
  },
};

/**
 * GET reach-outs, as the route answers it: every chain with its steps and what decides its next run, without its report
 * (R23: the report is read when a row opens; campaigns/reach-outs.ts chainsOf), so the page's rows and Ask's context of
 * the page (ask/context/pages.ts) read the same ones (spec 2026-10-09 §4.5); no tool of Ask's reads them yet. Each chain
 * is a row a citation names, opened where its row opens.
 */
export const reachOutChains: Reader<undefined, { chains: ReachOutChainDto[] }> = {
  name: "reachOutChains",
  async read(rc) {
    const chains = await chainsOf(rc.ctx, rc.tenantId);
    return {
      data: { chains },
      rows: chains.map((c) => ({
        kind: "playbook" as const,
        id: c.root_id,
        route: addressOf({ kind: "reach_out", id: c.root_id }),
        label: c.name,
      })),
      stamp: stamp(),
    };
  },
};
