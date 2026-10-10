import "server-only";
import {
  dealPaceOf,
  type AppointmentWord,
  type ChannelsReady,
  type MonthSent,
  type ReachOutChainDto,
} from "@chanlytics/contracts";
import { channelsReadyOrNull } from "../campaigns/channels-ready";
import { monthSentOrNull } from "../campaigns/month-sent";
import { listPlaybooks, recentTouches, type PlaybookListRow } from "../campaigns/playbooks";
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
  /** What the workspace calls an appointment (readers/facts.ts appointmentWordFor), derived until it is stored. */
  appointment_word: AppointmentWord;
  /** Its bookings arrive by a booking tool's emails: with no calendar feed, its appointment moments need the feed. */
  bookings_by_email: boolean;
  /** Each autonomy class's mode by class (policies, workspace rows); null where unread. Resume says `auto` in full. */
  modes: Record<string, string> | null;
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
    // How the business works (readers/facts.ts businessShape): how its customers buy, which the pools and the follow-up
    // hang on, and the word and the booking tool the home's moments are said and counted by.
    const shaped = load(rc, readers.businessShape, undefined).then((r) => r.data);
    const dealsOnRead = shaped.then((s) => s.dealsOn);
    // The pools' own reads leave with the page's first ones, not behind them (campaigns/playbook-pools.ts poolReads): everyone
    // and the zone and settings from the turn (everyone once a turn, shared with the audience pool; a settings read that
    // fails costs the visit moments, never the page), the proposals' follow-ups once it is known deals are on, and a
    // stricter message's templates once the playbooks are in.
    const reads = poolReads(ctx, tenantId, now, {
      people: () => load(rc, everyone, undefined).then((r) => r.data),
      known: readers.zoneAndSettings(rc),
      dealsOn: dealsOnRead,
      playbooks: listed,
    });
    const [playbooks, facts, touched, shape, paceRead, ready, month_sent, policyRows] = await Promise.all([
      listed,
      load(rc, readers.facts, undefined).then((r) => r.data),
      recentTouches(ctx, tenantId, now),
      shaped,
      // The pace the edge's sweep reads (packages/db yesesSince): the follow-up's pool is the run's own. Read where
      // deals are on, which is the only place it is counted by.
      dealsOnRead.then((on) => (on ? dealPaceRead(ctx, tenantId, now) : null)),
      // Whether each channel can send now: the pools are counted against it, and the composer draws its ticks from it.
      channelsReadyOrNull(ctx, tenantId, { withPause: true }),
      // The month's emails and texts already sent, which the composer says before a send and the head from half used.
      monthSentOrNull(tenantId, now),
      // The autonomy matrix (readers/facts.ts policies, once a turn): a Resume asked on Campaigns says a class under `auto`
      // in full (decision 7). A read that fails costs that sentence, never the page.
      load(rc, readers.policies, undefined).then(
        (r) => r.data,
        () => null,
      ),
    ]);
    const dealsOn = shape.dealsOn;
    const { pools, calendar, lists, people } = await triggerPools(
      ctx,
      tenantId,
      touched,
      facts.timezone,
      now,
      { on: dealsOn, pace: dealsOn ? dealPaceOf(paceRead) : null },
      // The reads the pools count from, already asked; and the playbooks, so one whose message is stricter than its
      // moment is counted by the message (strictMessagePools).
      { reads, playbooks, ready },
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
        // What the workspace calls an appointment, and whether its bookings arrive by a tool's emails (businessShape).
        appointment_word: shape.word,
        bookings_by_email: shape.bookingsByEmail,
        // Each autonomy class's mode as stored (a class with no row is `ask`); null where the matrix could not be read.
        modes: policyRows ? Object.fromEntries(policyRows.map((p) => [p.class, p.mode])) : null,
      },
      rows: playbooks.map((p) => ({ kind: "playbook" as const, id: p.id, route: `outbound/${p.id}`, label: p.name })),
      stamp: stamp(),
    };
  },
};

/**
 * GET reach-outs, as the route answers it: every chain with its steps and what decides its next run, without its report
 * (R23: the report is read when a row opens; campaigns/reach-outs.ts chainsOf), so the page's rows and a tool of Ask's
 * that will read the chains (none does yet) read the same ones (spec 2026-10-09 §4.5). Each chain is a row a citation
 * names, opened where its row opens.
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
        route: `outbound/${c.root_id}`,
        label: c.name,
      })),
      stamp: stamp(),
    };
  },
};
