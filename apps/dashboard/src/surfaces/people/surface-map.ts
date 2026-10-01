/**
 * What People's rows and lists are, from what was read: the one mapping from the loaded people, their saved lists and the
 * workspace's facts to the surface's value (decision 0015). Pure: the override runs it over what the wire answered, and a
 * demo session's sample (sample.ts) runs it over made-up people, so both draw the one People page the same way. Nothing
 * here reads the window, the wire or the clock: the member looking and the moment are its arguments.
 */
import {
  type PersonRowDto,
  followUpStandOf,
  type FollowUpFactsDto,
  type DealPaceVM,
  peopleAggregates,
  PEOPLE_LISTS,
  asListRule,
  listMembers,
  listRuleParts,
  listUnknownWords,
  ruleNeeds,
  unmetNeed,
  listNamer,
  savedListLookup,
  savedListTip,
  poolListContext,
  poolRowOf,
  type ListContext,
  PEOPLE_LIST_GROUPS,
  peopleListAction,
  savedListAction,
  type PersonRowVM,
  attentionRow,
} from "@chanlytics/contracts";
import type { PeopleSurface } from "./surface";

/** What the People surface holds between reads: the rows loaded so far, and the rest it derives from. */
export interface PeopleLoaded {
  /** The workspace's zone: every day and time on a row is said in it. */
  tz: string;
  people: PersonRowDto[];
  page: PeopleSurface["page"];
  /** Null when the read of them failed. */
  saved: { id: string; name: string; ids: string[]; rule?: unknown; archived_at?: string | null }[] | null;
  calendar: PeopleSurface["calendar"];
  bookingLink: string | null;
  /** Deals are on here (0008), and the profile lists a consult-first service (0004): which Journey lists exist. */
  dealsOn: boolean;
  consultFirst: boolean;
  /** The workspace's pace, as the list read answered it (00167); null without one. */
  dealPace: DealPaceVM | null;
  /** The proposal follow-up, as the list read answered it (0006); null where none runs. */
  followUp: FollowUpFactsDto | null;
  views: Record<string, unknown>;
  viewsRead: boolean;
}
/**
 * A People row as the page reads it, for the member looking (__ME): a teammate's thread is theirs, not waiting on you.
 * Where deals are off (dealsAreOn, 0008) it carries no deal, whatever the database holds: not the lists, the column,
 * the row's second line, the thread's chip and send, or Today's proposals waiting, which all read it from here.
 */
export function personRowOf(
  r: PersonRowDto,
  as: { tz: string; now: Date; dealsOn: boolean; viewer: string | null },
): PersonRowVM {
  return poolRowOf(r, as);
}

/**
 * The surface from what is loaded: every list, count and cell derived the same way, whether after the first read, a later
 * page, or a demo session's sample (sample.ts), as the member `viewer` looks at `now`. Pure.
 */
export function peopleSurfaceOf(loaded: PeopleLoaded, viewer: string | null, now: Date): PeopleSurface {
  const { tz, dealsOn, consultFirst } = loaded;
  // Each row's standing with the proposal follow-up, where one runs (0006, contracts followUpStandOf): the
  // Pipeline's chip and Today's leak read it off the row, judged by the pace and at the moment the rows are.
  const fu = dealsOn ? loaded.followUp : null;
  const pace = dealsOn ? loaded.dealPace : null;
  const rows = loaded.people.map((r) => {
    const vm = personRowOf(r, { tz, now, dealsOn, viewer });
    return fu ? { ...vm, followUp: followUpStandOf(vm, fu, tz, now.getTime(), pace) } : vm;
  });
  const calendar = loaded.calendar;
  // What this workspace and this reader can give a list (lists.ts): a rule that needs more says why it can't be counted.
  const listCtx: ListContext = poolListContext({
    calendar: calendar.state,
    dealsOn,
    consultFirst,
    viewer,
  });
  const savedLists = loaded.saved ?? [];
  const lookup = savedListLookup(savedLists);
  const listName = listNamer(savedLists);
  return {
    rows,
    // The outcome lists only when there is a calendar to read them from; the deal lists only where deals are on.
    lists: PEOPLE_LISTS.filter(
      (l) =>
        (!l.needsCalendar || calendar.state === "ok") &&
        (!l.needsConsultFirst || consultFirst) &&
        (!l.needsDeals || dealsOn),
    ).map((l) => {
      const members = rows.filter(l.test);
      return {
        id: l.id,
        label: l.label,
        group: l.group,
        tip: l.tip,
        count: members.length,
        ids: members.map((r) => r.id),
        action: peopleListAction(l.id, members),
      };
    }),
    groups: PEOPLE_LIST_GROUPS.map((g) => ({ id: g.id, label: g.label })),
    hidden: PEOPLE_LISTS.flatMap((l) => {
      const need = unmetNeed(ruleNeeds(l.rule), listCtx);
      return need ? [{ id: l.id, label: l.label, why: listUnknownWords(need, calendar.state) }] : [];
    }),
    calendar,
    bookingLink: loaded.bookingLink,
    dealsOn,
    consultFirst,
    dealPace: dealsOn ? loaded.dealPace : null,
    // The live lists on the rail; the archived ones in their own line, and still read for the lists that name them.
    saved: savedLists
      .filter((l) => !l.archived_at)
      .map((l) => {
        // Who is on it: the ids kept on it, or everyone a smart list's rule holds for today (lists.ts listMembers), over
        // the rows on the page, so an erased person never counts. A rule that can't be counted here says why.
        const m = listMembers(l, rows, listCtx, lookup);
        const members = m.state === "ok" ? rows.filter((r) => m.ids.has(r.id)) : [];
        const ids = members.map((r) => r.id);
        const rule = l.rule == null ? null : asListRule(l.rule);
        // The list's own step, the way a built-in list carries its: a broadcast to those on it who said yes.
        return {
          id: l.id,
          name: l.name,
          count: ids.length,
          ids,
          members: l.ids,
          action: savedListAction(l.id, members),
          byHand: l.rule == null,
          rule: rule ? listRuleParts(rule, listName) : null,
          spec: rule,
          unknown: m.state === "unknown" ? listUnknownWords(m.reason, calendar.state) : null,
        };
      })
      .map((s) => ({ ...s, tip: savedListTip(s) })),
    savedRead: loaded.saved !== null,
    archived: savedLists.filter((l) => !!l.archived_at).map((l) => ({ id: l.id, name: l.name })),
    // The total is the server's: past the first page the rows here are not everyone.
    aggregates: { ...peopleAggregates(rows, now.getTime()), total: loaded.page?.total ?? rows.length },

    attention: Object.fromEntries(rows.map((r) => [r.id, attentionRow(r, tz, now.getTime())])),
    page: loaded.page,
    views: loaded.views,
    viewsRead: loaded.viewsRead,
    fetchedAt: now.getTime(),
  };
}
