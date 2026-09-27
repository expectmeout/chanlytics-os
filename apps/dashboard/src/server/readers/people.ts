import "server-only";
import {
  dealsAreOn,
  personName,
  type DealPaceDto,
  type FollowUpFactsDto,
  type PersonRowDto,
} from "@chanlytics/contracts";
import { PEOPLE_PAGE, countPeople, listPeople } from "../people/people";
import { withVisits, type PeopleVisits } from "../calendar/calendar";
import { dealPaceRead } from "../people/deals";
import { stepNamer } from "../people/person-notes";
import { followUpFacts } from "../campaigns/playbooks";
import { load, stamp, type Reader, type RowRef } from "./index";
import * as facts from "./facts";

/** GET contacts' answer: one page of People with their appointments, and what the page draws beside the rows. */
export interface PeoplePage {
  people: PersonRowDto[];
  calendar: PeopleVisits["calendar"];
  booking_link: string | null;
  /** The profile lists a consult-first service (0004): the Consultations list can be counted only then. */
  consult_first: boolean;
  deals_on: boolean;
  deal_pace: DealPaceDto | null;
  follow_up: FollowUpFactsDto | null;
  page: { q: string | null; offset: number; limit: number; total: number; has_more: boolean };
}

/**
 * GET contacts, as the route answers it: a page of everyone who has written to or phoned the workspace, computed in
 * SQL by people_list under the caller's own RLS (a query matches a name, a WhatsApp name, an address or three digits
 * of the number, in the function's order), each person with their appointments and who their next step is for, and
 * beside them how the workspace's customers buy, its pace and the proposal follow-up's facts -- the route's body,
 * moved here whole, so People and Ask's search_people read the same rows the same way. The route trims the query and
 * checks the offset; this takes them as given. How the workspace's customers buy, and the calendar's zone and
 * settings, come through their readers, once in a turn. Each person is a row a citation may name, as People names them.
 */
export const people: Reader<{ q: string | null; offset: number }, PeoplePage> = {
  name: "people",
  async read(rc, { q, offset }) {
    const ctx = rc.ctx;
    const tenantId = rc.tenantId;
    const [rows, total] = await Promise.all([
      listPeople(ctx, tenantId, { q, offset, limit: PEOPLE_PAGE }),
      countPeople(ctx, tenantId, q),
    ]);
    // Each person with their appointments from the owner's calendar, when one is connected: Booked is a fact here,
    // not a stage. Never fatal to the list. In the same round trip, how this workspace's customers buy (0008): an
    // answer that cannot be read is not asked yet, and costs the deal lists, never the list.
    // And who each next step is for (00166), from the team, read only when a step is for someone; and the
    // workspace's pace (0008, amended), said only where deals are on, and read with the first page alone: People
    // keeps that page's answer, and a later page or a search would read it again for nothing.
    // And the proposal follow-up's facts (0006), where deals are on, with the first page alone as the pace is: each
    // row's standing is worked out from them where the rows are held. Unreadable, every row says what it said.
    // How the workspace's customers buy is the turn's (readers/facts.ts).
    const buys = load(rc, facts.sellsBy, undefined).then((r) => r.data);
    const [out, sellsBy, nameSteps, pace, followUp] = await Promise.all([
      // The calendar's zone and settings are the turn's too, read just where the calendar's own lookup read them: a
      // turn that holds them reads neither again, and one that fails costs the visits, never the list.
      withVisits(ctx, tenantId, rows, rc.now, facts.zoneAndSettings(rc)),
      buys,
      stepNamer(ctx, tenantId, rows),
      offset === 0 && !q ? dealPaceRead(ctx, tenantId, rc.now) : Promise.resolve(null),
      buys.then((s) =>
        dealsAreOn(s) && offset === 0 && !q
          ? followUpFacts(ctx, tenantId, rc.now).catch((e: unknown) => {
              console.error(
                "follow_up_facts_failed",
                JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
              );
              return null;
            })
          : null,
      ),
    ]);
    const dealsOn = dealsAreOn(sellsBy);
    const data: PeoplePage = {
      ...out,
      people: out.people.map(nameSteps),
      // Deals are on where the workspace says some customers get a proposal first (dealsAreOn, 0008): the Journey's
      // deal lists, the thread's menu item, the column. Consult-first stays a booking rule, sent for its own list; the
      // names of the services stay on the server.
      deals_on: dealsOn,
      // How long this workspace's yeses usually take (0008, amended): when a proposal is waiting, on every page.
      deal_pace: dealsOn ? pace : null,
      // The proposal follow-up, where one runs (0006): who it has in hand and when, row by row, on People and Today.
      follow_up: dealsOn ? followUp : null,
      consult_first: out.consult_first,
      page: { q, offset, limit: PEOPLE_PAGE, total, has_more: offset + rows.length < total },
    };
    return {
      data,
      rows: data.people.map((r): RowRef => ({
        kind: "person",
        id: r.id,
        route: `clients/${r.id}`,
        label: personName(r),
      })),
      stamp: stamp(),
    };
  },
};
