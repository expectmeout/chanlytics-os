import "server-only";
import {
  addressOf,
  type BroadcastDetailDto,
  type BroadcastDto,
  type ChannelsReady,
  type MonthSent,
  type OpenToCustomers,
} from "@chanlytics/contracts";
import { getBroadcast, listBroadcasts } from "../campaigns/broadcasts";
import { channelsReadyOrNull } from "../campaigns/channels-ready";
import { monthSentNext, monthSentOrNull } from "../campaigns/month-sent";
import { recentTouches, waitingRunsOf, workspaceOpenToCustomers, type WaitingRunRow } from "@chanlytics/db";
import { load, stamp, type Reader, type RowRef } from "./index";
import * as readers from "./facts";
import { log } from "@/server/log";

/** A broadcast as a citation names it: a Broadcasts row, opened where its address spells it, a run. */
const runRef = (b: Pick<BroadcastDto, "id" | "name">): RowRef => ({
  kind: "broadcast",
  id: b.id,
  route: addressOf({ kind: "send", id: b.id }),
  label: b.name,
});

/**
 * GET broadcasts, as the route answers it: the recent fifty with what their messages earned, and whether older ones exist
 * beyond them, and after them every older run still waiting for a word (campaigns/broadcasts.ts listBroadcasts): what the
 * badge, the Inbox's run rows, Today's queue and a run's sheet are drawn from, read before the
 * Inbox's first draw. Who a run reached this week is not here: it is every touch of the week, which the composer alone
 * reads (broadcastTouches, GET broadcasts/touches; the Inbox's run review, 18 Oct 2026). And whether the workspace can send on each channel now (`ready`, channels-ready.ts), which
 * the composer's Send by ticks and its reach line are drawn from; null where that could not be read, which the composer
 * says. And what the workspace's campaigns have sent by email and by text this calendar month (`month_sent`,
 * month-sent.ts), which the Campaigns head says from half used and the composer says before a send; null where that could not
 * be read. With the month after it (`month_sent_next`, and the instant it begins), because a broadcast may be set to go in it
 * and the composer reads the month at the time it is set for (contracts monthSentAt). And whether the workspace is open to
 * its customers (`open_to_customers`, contracts openToCustomersOf), so the card that gets a yes offers no code while it is
 * paused (the wiring's second audit, X4-1); null where it could not be read. The route's body, moved here whole. Each
 * broadcast is a row a citation names.
 */
export const broadcasts: Reader<
  undefined,
  {
    broadcasts: BroadcastDto[];
    more: boolean;
    ready: ChannelsReady | null;
    month_sent: MonthSent | null;
    month_sent_next: { from: number; sent: MonthSent | null } | null;
    open_to_customers: OpenToCustomers | null;
  }
> = {
  name: "broadcasts",
  async read(rc) {
    const [list, ready, month_sent, month_sent_next, open_to_customers] = await Promise.all([
      listBroadcasts(rc.ctx, rc.tenantId),
      channelsReadyOrNull(rc.ctx, rc.tenantId, { withPause: true }),
      monthSentOrNull(rc.tenantId, rc.now),
      // The workspace's clock says where the month ends; a zone that could not be read leaves the composer on this month.
      load(rc, readers.facts, undefined).then(
        (r) => monthSentNext(rc.tenantId, rc.now, r.data.timezone),
        () => null,
      ),
      workspaceOpenToCustomers(rc.ctx.supabase, rc.tenantId).then(
        (s) => s.open,
        (e: unknown) => {
          log.error("broadcast_open_to_customers_failed", {
            tenant_id: rc.tenantId,
            error: e instanceof Error ? e.message : String(e),
          });
          return null;
        },
      ),
    ]);
    return {
      data: { ...list, ready, month_sent, month_sent_next, open_to_customers },
      rows: list.broadcasts.map(runRef),
      stamp: stamp(),
    };
  },
};

/**
 * GET broadcasts/touches: who a run of any kind reached from a week before the turn's clock on, or is due to, and when
 * (`touched_at`, contact id -> the time of every touch of theirs, earliest first) -- the composer says how many of an
 * audience hear from one within a week of the time a send is set for, either side (contracts heardFor, leftOutBy's rule).
 * Touches that cannot be read are null, said in the log, and the composer says nothing, rather than a list of nobody. Its
 * own read, apart from Sent's runs, since it is every touch of the week and only who an audience reaches is counted by it.
 */
export const broadcastTouches: Reader<undefined, { touched_at: Record<string, string[]> | null }> = {
  name: "broadcastTouches",
  async read(rc) {
    const touched_at = await recentTouches(rc.ctx.supabase, rc.tenantId, rc.now).catch((e: unknown) => {
      log.error("broadcast_touches_failed", {
        tenant_id: rc.tenantId,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    });
    return { data: { touched_at }, rows: [], stamp: stamp() };
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

/**
 * The runs waiting for a word, newest first (packages/db waitingRunsOf: for approval, or holding emails for your say): what the server's Today counts as waiting on
 * you, by the verb's own day rule (contracts runsThatWait), so Ask's Today says the head the page says and names the
 * runs. Each run is a row a citation names.
 */
export const waitingRuns: Reader<undefined, { runs: WaitingRunRow[] }> = {
  name: "waiting_runs",
  async read(rc) {
    const runs = await waitingRunsOf(rc.ctx.supabase, rc.tenantId);
    return { data: { runs }, rows: runs.map(runRef), stamp: stamp() };
  },
};
