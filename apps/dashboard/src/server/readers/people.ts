import "server-only";
import {
  addressOf,
  dealPaceOf,
  dealsAreOn,
  followUpStandOf,
  personName,
  pipelineOf,
  poolRowOf,
  type ChannelsReady,
  type DealPaceDto,
  type FollowUpFactsDto,
  type PersonRowDto,
  type PersonRowVM,
  type PipelineVM,
} from "@chanlytics/contracts";
import { PEOPLE_PAGE, countPeople, listPeople, nextPeopleParam } from "../people/people";
import type { PeopleCursor } from "@chanlytics/db";
import { withVisits, type PeopleVisits } from "../calendar/people-visits";
import { dealPaceRead } from "../people/deals";
import { stepNamer } from "../people/person-notes";
import { seenOfPeople } from "../people/person-seen";
import { followUpFacts } from "../campaigns/playbooks";
import { load, stamp, type Reader, type RowRef } from "./index";
import { everyone } from "./everyone";
import * as facts from "./facts";
import { log } from "@/server/log";

/** A read started before it is awaited: held from now, so a refusal that lands first is never left unhandled. */
function early<T>(p: Promise<T>): Promise<T> {
  p.catch(() => {});
  return p;
}

/** GET contacts' answer: one page of People with their appointments, and what the page draws beside the rows. */
interface PeoplePage {
  people: PersonRowDto[];
  calendar: PeopleVisits["calendar"];
  booking_link: string | null;
  /** The profile lists a consult-first service (0004): the Consultations list can be counted only then. */
  consult_first: boolean;
  deals_on: boolean;
  deal_pace: DealPaceDto | null;
  follow_up: FollowUpFactsDto | null;
  /**
   * What the workspace can send on now, channel by channel (campaigns/channels-ready.ts): the page judges who can be sent
   * what against it (contracts reach-any.ts), rows, lists and Today's leaks alike. Read with the first page alone, as the
   * pace is. Null on a later page or a search, and where it could not be read: the page counts as before the channels
   * were, by WhatsApp alone.
   */
  channels_ready: ChannelsReady | null;
  /**
   * `offset` is how many rows the caller holds, and counts `has_more`; `next`, when the rows carry their place in the
   * order (00276), is where the next page starts: handed back as `?after=`, it reads just past the last row, and
   * nobody who writes in between is read twice.
   */
  page: { q: string | null; offset: number; limit: number; total: number; has_more: boolean; next: string | null };
}

/**
 * GET contacts, as the route answers it: a page of everyone who has written to or phoned the workspace, computed in
 * SQL by people_list under the caller's own RLS (a query matches a name, a WhatsApp name, an address or three digits
 * of the number, in the function's order), each person with their appointments and who their next step is for, and
 * beside them how the workspace's customers buy, its pace and the proposal follow-up's facts -- the route's body,
 * moved here whole, so People and Ask's people.search read the same rows the same way. The route trims the query and
 * checks the offset; this takes them as given. How the workspace's customers buy, and the calendar's zone and
 * settings, come through their readers, once in a turn. Each person is a row a citation may name, as People names them.
 */
export const people: Reader<{ q: string | null; offset: number; after?: PeopleCursor | null }, PeoplePage> = {
  name: "people",
  async read(rc, { q, offset, after }) {
    const ctx = rc.ctx;
    const tenantId = rc.tenantId;
    // Beside the rows, what is read of the workspace rather than of them, started with them rather than after them:
    // they waited for the rows, a whole round trip, and none needs them (2 Oct 2026). How this workspace's customers
    // buy (0008): an answer that cannot be read is not asked yet, and costs the deal lists, never the list; the
    // turn's (readers/facts.ts). The workspace's pace (0008, amended), said only where deals are on, and read with the
    // first page alone: People keeps that page's answer, and a later page or a search would read it again for nothing.
    // The proposal follow-up's facts (0006), where deals are on, with the first page alone as the pace is: each row's
    // standing is worked out from them where the rows are held. Unreadable, every row says what it said. And the
    // calendar's zone and settings, the turn's too: started here and handed to the calendar's own lookup below, which
    // takes this read rather than asking again. Each is held from the moment it starts, so one that fails before the
    // rows land is the answer's to weigh, never an unhandled rejection.
    const buys = early(load(rc, facts.sellsBy, undefined).then((r) => r.data));
    const pace = early(offset === 0 && !q ? dealPaceRead(ctx, tenantId, rc.now) : Promise.resolve(null));
    const followUp = early(
      buys.then((s) =>
        dealsAreOn(s) && offset === 0 && !q
          ? followUpFacts(ctx, tenantId, rc.now).catch((e: unknown) => {
              log.error("follow_up_facts_failed", {
                tenant_id: tenantId,
                error: e instanceof Error ? e.message : String(e),
              });
              return null;
            })
          : null,
      ),
    );
    // What the workspace can send on now, which who can be sent what is judged against (contracts reach-any.ts): with
    // the first page alone, as the pace is -- People keeps that page's answer, and a later page or a search would read it
    // again for nothing. The turn's own read, which Ask's reads share; started with the rest.
    const ready = early(
      offset === 0 && !q ? load(rc, facts.channelsReady, undefined).then((r) => r.data) : Promise.resolve(null),
    );
    const zone = early(facts.zoneAndSettings(rc)());
    const [rows, total] = await Promise.all([
      // Just past the cursor when the page holds one, else by the offset: never both, since the offset then only
      // counts what the page holds.
      listPeople(ctx, tenantId, after ? { q, after, limit: PEOPLE_PAGE } : { q, offset, limit: PEOPLE_PAGE }),
      countPeople(ctx, tenantId, q),
    ]);
    // Each person with their appointments from the owner's calendar, when one is connected: Booked is a fact here,
    // not a stage. Never fatal to the list, and said from the calendar's last good read while a newer one is fetched
    // behind it, as a person's page says them (person-visits.ts): what was booked, never an opening offered. And who
    // each next step is for (00166), from the team, read only when a step is for someone. And what the member asking
    // has seen of each (00349, people/person-seen.ts): the row says who is new to them, as the Inbox's does.
    const [out, sellsBy, nameSteps, seenOf] = await Promise.all([
      withVisits(ctx, tenantId, rows, rc.now, () => zone, { stale: true }),
      buys,
      stepNamer(ctx, tenantId, rows),
      seenOfPeople(
        ctx,
        tenantId,
        rows.map((r) => r.id),
      ),
    ]);
    const dealsOn = dealsAreOn(sellsBy);
    // A short page is the last: someone who wrote as the pages were read counts in the total, and is read first on the
    // next pass, never after the cursor.
    const hasMore = rows.length === PEOPLE_PAGE && offset + rows.length < total;
    const data: PeoplePage = {
      ...out,
      people: out.people.map(nameSteps).map((p) => ({ ...p, ...seenOf(p.id) })),
      // Deals are on where the workspace says some customers get a proposal first (dealsAreOn, 0008): the Journey's
      // deal lists, the thread's menu item, the column. Consult-first stays a booking rule, sent for its own list; the
      // names of the services stay on the server.
      deals_on: dealsOn,
      // How long this workspace's yeses usually take (0008, amended): when a proposal is waiting, on every page.
      deal_pace: dealsOn ? await pace : null,
      // The proposal follow-up, where one runs (0006): who it has in hand and when, row by row, on People and Today.
      follow_up: dealsOn ? await followUp : null,
      channels_ready: await ready,
      consult_first: out.consult_first,
      page: {
        q,
        offset,
        limit: PEOPLE_PAGE,
        total,
        has_more: hasMore,
        next: hasMore ? nextPeopleParam(rows[rows.length - 1]) : null,
      },
    };
    return {
      data,
      rows: data.people.map((r): RowRef => ({
        kind: "person",
        id: r.id,
        route: addressOf({ kind: "person", id: r.id }),
        label: personName(r),
      })),
      stamp: stamp(),
    };
  },
};

/** The Pipeline's board: whether deals are on, the zone its days are judged in, and the board where they are. */
interface DealBoard {
  deals_on: boolean;
  timezone: string;
  /** Null where deals are off: the Pipeline's address draws People there. */
  board: PipelineVM<PersonRowVM> | null;
}

/**
 * The Pipeline, as the page builds it (contracts pipelineOf) over everyone in People (readers/everyone.ts), each row as
 * People draws it for the member asking (poolRowOf) with their standing in the proposal follow-up laid on, and the
 * workspace's pace and the follow-up's facts from People's first page -- the whole board, every group, on the turn's
 * clock; where deals are off, none. Moved out of Ask's Pipeline context (server/ask/context/people.ts), which reads it
 * now, as Ask's people.pipeline does. No route answers it: the page builds the same board in the tab from GET contacts.
 * Each person on the board is a row a citation names, and each deal one too, opened on its person's page.
 */
export const dealBoard: Reader<undefined, DealBoard> = {
  name: "dealBoard",
  async read(rc) {
    const [all, sells, tz] = await Promise.all([
      load(rc, everyone, undefined).then((r) => r.data),
      load(rc, facts.sellsBy, undefined).then((r) => r.data),
      load(rc, facts.facts, undefined).then((r) => r.data.timezone),
    ]);
    const dealsOn = dealsAreOn(sells);
    if (!dealsOn) return { data: { deals_on: false, timezone: tz, board: null }, rows: [], stamp: stamp() };
    const first = (await load(rc, people, { q: null, offset: 0 })).data;
    const pace = dealPaceOf(first.deal_pace);
    const nowMs = rc.now.getTime();
    const fu = first.follow_up;
    const ready = first.channels_ready;
    const rowsVm = all.map((r) => {
      const v = poolRowOf(r, { tz, now: rc.now, viewer: rc.userId, dealsOn, ready });
      return fu ? { ...v, followUp: followUpStandOf(v, fu, tz, nowMs, pace, ready) } : v;
    });
    const board = pipelineOf(rowsVm, nowMs, tz, pace);
    // Each row cites the person it is and the deal it stands for (0029: a further deal of theirs is a row of its own,
    // whose id is not theirs).
    const rows: RowRef[] = board.groups.flatMap((g) =>
      g.rows.flatMap((row): RowRef[] => {
        const route = `clients/${row.person.id}`;
        const deal = row.deal?.id;
        return [
          { kind: "person", id: row.person.id, route, label: row.name },
          ...(deal
            ? [{ kind: "deal" as const, id: deal, route, label: [row.name, row.service].filter(Boolean).join(" · ") }]
            : []),
        ];
      }),
    );
    return { data: { deals_on: true, timezone: tz, board }, rows, stamp: stamp() };
  },
};
