/**
 * People's override: the rows, the saved views and lists, paging and search, and
 * the deal a person is placed on. The seam's workspace read repaints People from
 * here when the signed-in person changes. Part of the SurfaceData seam
 * (../surface-data.ts).
 */

import {
  type PersonRowDto,
  type DealDto,
  dealPaceOf,
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
  parseListToken,
  savedListLookup,
  savedListTip,
  poolListContext,
  poolRowOf,
  type ListContext,
  PEOPLE_LIST_GROUPS,
  peopleListAction,
  savedListAction,
  type PersonRowVM,
  type PeopleAggregates,
  attentionRow,
  type AttentionRowVM,
  type ListRule,
} from "@chanlytics/contracts";
import { resnapshotSurface } from "../surface-cache";
import { read } from "../api";
import { workspaceZone } from "../zone";
import { DEFAULT_REFRESH_TABLES } from "../surface-realtime";
import { onlyOnItsPage } from "../surface-registry";
import type { SurfaceOverride } from "../surface-data";

/* ------------------------------- People ---------------------------------- */

/** What the People surface reads: rows already mapped, the rail's list
 *  counts, and the header totals — all from one fetch. */
export interface PeopleSurface {
  rows: PersonRowVM[];
  /** The rail's smart lists with their members — the predicates stay in
   *  contracts; the mockup only needs the ids. Each carries its group and,
   *  when it has one, the obvious next step. */
  lists: {
    id: string;
    label: string;
    group: string;
    /** What it holds, in one line (contracts BUILTIN_LISTS): the rail's tip. */
    tip: string;
    count: number;
    ids: string[];
    action: { text: string; cta: string; to: string; enabled: boolean } | null;
  }[];
  groups: { id: string; label: string }[];
  /**
   * People's lists this workspace doesn't show, each with why (lists.ts listUnknownWords): a calendar not read, deals
   * off. A door to one says it can't be counted here, never that it isn't a list.
   */
  hidden: { id: string; label: string; why: string }[];
  /** The lists kept by hand (segments), counted over the rows on the page so
   *  an erased person never counts; `members` is every id the server keeps on
   *  the list, so an Undo can tell who an add really added. */
  saved: {
    id: string;
    name: string;
    count: number;
    ids: string[];
    members: string[];
    action: { text: string; cta: string; to: string; enabled: boolean };
    /** Kept by hand: people are put on it and taken off. A rule, read or not, says who is on it. */
    byHand: boolean;
    /** A smart list's rule as the chips its page shows; null for a list kept by hand, or a rule that can't be read. */
    rule: string[] | null;
    /** The rule itself, as read (asListRule): what a copy keeps and a profile's "why" reads. Null as `rule` is. */
    spec: ListRule | null;
    /** Why it can't be counted (lists.ts listUnknownWords); null when it was. Its count is then no one's, never 0. */
    unknown: string | null;
    /** Its line on the rail (contracts savedListTip): why it can't be counted, what a hand list is for, or its rule. */
    tip: string;
  }[];
  /** Whether the saved lists were read: false leaves People standing without them, and the rail and the profile say so. */
  savedRead: boolean;
  /**
   * The workspace's archived lists (00169): off the rail, each still what a playbook on it names. The rail says them in
   * one quiet line, each one press from coming back.
   */
  archived: { id: string; name: string }[];
  aggregates: PeopleAggregates;

  /** One row of the attention strip per person: the sentence, the state line, the one button. */
  attention: Record<string, AttentionRowVM>;
  /** The workspace's calendar: the outcome lists and the Booked cell exist only when it is "ok". */
  calendar: { state: "ok" | "unavailable" | "none"; source: string };
  /** The booking link on file, so a row can offer to text it. */
  bookingLink: string | null;
  /** Deals are on here (dealsAreOn, 0008): the Journey's deal lists, the thread's menu item, the column. */
  dealsOn: boolean;
  /** The profile lists a consult-first service (0004): a list that reads consultations can be counted only then. */
  consultFirst: boolean;
  /** The workspace's pace (dealPaceOf, 0008 amended): when a proposal out is waiting, on Today and the Pipeline. */
  dealPace: DealPaceVM | null;
  /** The page the rows came from: how many there are in all, and whether more follow (00112). */
  page: { q: string | null; offset: number; limit: number; total: number; has_more: boolean } | null;
  /** What this member's pages remember in this workspace (memberships.views). */
  views: Record<string, unknown>;
  /**
   * Whether they were read: false when the read failed, and `views` is then none of them. A save of one page replaces
   * its whole view, so Today's pins are not changed over a read that failed (it would wipe the ones not shown).
   */
  viewsRead: boolean;
  fetchedAt: number;
}

/** What the People surface holds between reads: the rows loaded so far, and the rest it derives from. */
export let peopleLoaded: {
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
} | null = null;

/**
 * A People row as the page reads it, for the member looking (__ME): a teammate's thread is theirs, not waiting on you.
 * Where deals are off (dealsAreOn, 0008) it carries no deal, whatever the database holds: not the lists, the column,
 * the row's second line, the thread's chip and send, or Today's proposals waiting, which all read it from here.
 */
function personRowOf(r: PersonRowDto, tz: string, now: Date, dealsOn: boolean): PersonRowVM {
  return poolRowOf(r, { tz, now, viewer: viewerId(), dealsOn });
}

/** The member looking, as the workspace surface named them at boot; null before it lands. */
export function viewerId(): string | null {
  return (window as unknown as { __ME?: { id?: string | null } }).__ME?.id ?? null;
}

/** The surface from what is loaded: every list, count and cell derived the same way, whether after the first read or a later page. */
export function publishPeople(): void {
  if (!peopleLoaded) return;
  const { tz, dealsOn, consultFirst } = peopleLoaded;
  const now = new Date();
  // Each row's standing with the proposal follow-up, where one runs (0006, contracts followUpStandOf): the
  // Pipeline's chip and Today's leak read it off the row, judged by the pace and at the moment the rows are.
  const fu = dealsOn ? peopleLoaded.followUp : null;
  const pace = dealsOn ? peopleLoaded.dealPace : null;
  const rows = peopleLoaded.people.map((r) => {
    const vm = personRowOf(r, tz, now, dealsOn);
    return fu ? { ...vm, followUp: followUpStandOf(vm, fu, tz, now.getTime(), pace) } : vm;
  });
  const calendar = peopleLoaded.calendar;
  // What this workspace and this reader can give a list (lists.ts): a rule that needs more says why it can't be counted.
  const listCtx: ListContext = poolListContext({
    calendar: calendar.state,
    dealsOn,
    consultFirst,
    viewer: viewerId(),
  });
  const savedLists = peopleLoaded.saved ?? [];
  const lookup = savedListLookup(savedLists);
  const listName = (token: string): string | null => {
    const ref = parseListToken(token);
    if (!ref) return null;
    return ref.kind === "builtin"
      ? (PEOPLE_LISTS.find((l) => l.id === ref.id)?.label ?? null)
      : (savedLists.find((l) => l.id === ref.id)?.name ?? null);
  };
  (window as unknown as { __PEOPLE?: PeopleSurface }).__PEOPLE = {
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
    bookingLink: peopleLoaded.bookingLink,
    dealsOn,
    consultFirst,
    dealPace: dealsOn ? peopleLoaded.dealPace : null,
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
    savedRead: peopleLoaded.saved !== null,
    archived: savedLists.filter((l) => !!l.archived_at).map((l) => ({ id: l.id, name: l.name })),
    // The total is the server's: past the first page the rows here are not everyone.
    aggregates: { ...peopleAggregates(rows, now.getTime()), total: peopleLoaded.page?.total ?? rows.length },

    attention: Object.fromEntries(rows.map((r) => [r.id, attentionRow(r, tz, now.getTime())])),
    page: peopleLoaded.page,
    views: peopleLoaded.views,
    viewsRead: peopleLoaded.viewsRead,
    fetchedAt: now.getTime(),
  };
}

/** The views this tab has saved (the latest by page), how many saves it has made, and how many still wait on their reply. */
const keptViews = { views: {} as Record<string, Record<string, unknown>>, made: 0, waiting: 0 };

// A save reads nothing back, and People mounted again (Back) reads the view from this copy, so the copy takes each save.
// Until the first read of People lands (straight after F5) the copy is the one the tab's cache painted. What it returns
// is called when the save's reply lands.
export function keepSavedView(page: string, view: Record<string, unknown>): () => void {
  keptViews.views[page] = view;
  keptViews.made += 1;
  keptViews.waiting += 1;
  let waiting = true;
  const landed = () => {
    if (waiting) {
      waiting = false;
      keptViews.waiting -= 1;
    }
  };
  const views = peopleLoaded ? peopleLoaded.views : (window as unknown as { __PEOPLE?: PeopleSurface }).__PEOPLE?.views;
  if (!views) return landed;
  views[page] = view;
  // A reload paints the tab's cached People before anything is read again, so the cached copy takes the save too.
  resnapshotSurface(
    peopleOverride.key,
    peopleOverride.globals ?? [],
    (window as unknown as { __ACTIVE_WORKSPACE?: string }).__ACTIVE_WORKSPACE ?? null,
  );
  return landed;
}

/**
 * The next thousand, appended under the same order, and the surface told:
 * `window.__peopleMore()`. The page shows the button only while the server
 * says more follow.
 */
async function peopleMore(): Promise<void> {
  if (!peopleLoaded?.page?.has_more) return;
  const next = await read("GET contacts", { query: { offset: peopleLoaded.people.length } });
  const seen = new Set(peopleLoaded.people.map((p) => p.id));
  peopleLoaded.people = [...peopleLoaded.people, ...next.people.filter((p) => !seen.has(p.id))];
  peopleLoaded.page = next.page;
  publishPeople();
  window.dispatchEvent(new CustomEvent("surface:clients"));
}

/**
 * A person's current deal, laid on their People row as the door answers (0008): the deal door answers the deal their
 * row shows after the write (server/people/deals.ts currentDealOf, people_list's own rule), so the Pipeline moves the row as
 * the sheet closes, instead of once all of People has been read again; the re-read the refresh map asks for behind
 * it says the rest. It was the deal the door recorded, which is not the row's when the move was on someone's older
 * deal: their row jumped to it until the re-read. True when a row took it.
 */
export function placeDeal(personId: string, deal: DealDto | null | undefined): boolean {
  if (!peopleLoaded || !deal || !deal.id) return false;
  const i = peopleLoaded.people.findIndex((r) => r.id === personId);
  if (i < 0) return false;
  const row = peopleLoaded.people[i];
  peopleLoaded.people[i] = {
    ...row,
    deal_id: deal.id,
    deal_stage: deal.stage,
    deal_service: deal.service,
    deal_proposed_at: deal.proposed_at,
    deal_decided_at: deal.decided_at,
    deal_ended_at: deal.ended_at,
    deal_amount_cents: deal.amount_cents,
    deal_per: deal.per,
    deal_proposal_url: deal.proposal_url ?? null,
    deal_valid_until: deal.valid_until ?? null,
    deal_lost_reason: deal.lost_reason ?? null,
  };
  publishPeople();
  window.dispatchEvent(new CustomEvent("surface:clients"));
  return true;
}

/**
 * Who matches, from the server, when the page does not hold everyone:
 * `window.__peopleSearch(q)`. The server matches names and numbers, a page at a
 * time, so the answer says whether more matches follow the ones it sent.
 */
async function peopleSearch(q: string): Promise<{ rows: PersonRowVM[]; more: boolean }> {
  const [r, tz] = await Promise.all([read("GET contacts", { query: { q } }), workspaceZone()]);
  const now = new Date();
  return { rows: r.people.map((p) => personRowOf(p, tz, now, !!r.deals_on)), more: !!r.page?.has_more };
}

/**
 * Every page of people, not the first: whatever counts people counts everyone.
 * Broadcasts learned it first -- an audience counted over one page promised
 * fewer people than the send enrols. People counted its lists, its header and
 * its search over the first page too, and every refresh put the rows back to
 * that page, dropping the ones Show more had added. Bounded, so a chain of
 * pages that never ends cannot hang a surface; past the bound the page still
 * says more follow.
 */
const PEOPLE_PAGES_BOUND = 50;
export async function everyPerson(first: {
  people: PersonRowDto[];
  page?: PeopleSurface["page"];
}): Promise<{ people: PersonRowDto[]; page: PeopleSurface["page"] }> {
  const people = [...first.people];
  let page = first.page ?? null;
  for (let pages = 1; page?.has_more && pages < PEOPLE_PAGES_BOUND; pages++) {
    const next = await read("GET contacts", { query: { offset: people.length } });
    if (!next.people.length) break;
    people.push(...next.people);
    page = next.page ?? page;
  }
  return { people, page };
}

/**
 * People · Clients — everyone who has written to or phoned the business.
 *
 * The mockup drew sixty invented clients with health scores, packages and
 * therapists. The real surface renders what the schema holds: who they are,
 * which channels, who spoke last and when, what the receptionist is doing
 * for them, and whether they need a person. The state a row is in comes from
 * the tested rule in contracts, never from this file.
 *
 * Realtime message inserts re-apply, so a customer who writes moves rows the
 * way they move threads in the Inbox.
 */
export const peopleOverride: SurfaceOverride = {
  key: "people",
  globals: ["__PEOPLE"],
  events: ["surface:clients"],
  refreshOnMessageInserts: true,
  // Deals too: a teammate's move, or a payment's, shows on the rows and the Pipeline without a reload (0008). The
  // tab's own moves already re-read People through the refresh map (POST contacts/[id]/deal).
  // And notes: a teammate's step, set or done, moves a row's next step (00166).
  // And the lists (00169): a teammate's new list, rename or archive is on the rail without a reload.
  refreshOnTables: [...DEFAULT_REFRESH_TABLES, "deals", "person_notes", "segments", "segment_members"],
  // A message re-reads People only while People is on screen, and once when it comes back (surface-registry.ts): every
  // page of it was read again for each message, on whatever page the owner was looking at. Its own tables, always.
  refreshWhen: onlyOnItsPage("people", DEFAULT_REFRESH_TABLES),
  apply: async () => {
    // A view saved while this read is out, or before it with its reply still to come, may be missing from what the read
    // brings back, so the tab's own saves are laid over it. A read that overlapped no save takes the server's views as
    // they are: another device's change shows.
    const savesBefore = keptViews.made;
    const overlapped = keptViews.waiting > 0;
    const [data, savedData, viewsData, tz] = await Promise.all([
      read("GET contacts"),
      // The saved lists failing is their own state (savedRead): one failed read of
      // them took the whole surface down, and with it People, every profile and Lists.
      read("GET segments").catch((e: unknown) => e as Error),
      // A member's own views; a route that is not there yet reads as none.
      read("GET views").catch(() => ({ views: {}, failed: true as const })),
      workspaceZone(),
    ]);
    if (savedData instanceof Error) console.error("people_lists_fetch_failed", savedData.message);
    // Every page, so a list, a count and a search cover everyone, and a refresh keeps them.
    const everyone = await everyPerson(data);
    peopleLoaded = {
      tz,
      people: everyone.people,
      page: everyone.page,
      saved: savedData instanceof Error ? null : savedData.lists,
      calendar: data.calendar ?? { state: "none" as const, source: "your calendar" },
      bookingLink: data.booking_link ?? null,
      dealsOn: !!data.deals_on,
      consultFirst: !!data.consult_first,
      dealPace: dealPaceOf(data.deal_pace),
      followUp: data.follow_up ?? null,
      views:
        overlapped || keptViews.made !== savesBefore
          ? { ...(viewsData.views ?? {}), ...keptViews.views }
          : (viewsData.views ?? {}),
      viewsRead: !("failed" in viewsData),
    };
    const w = window as unknown as {
      __peopleMore?: () => Promise<void>;
      __peopleSearch?: (q: string) => Promise<{ rows: PersonRowVM[]; more: boolean }>;
    };
    w.__peopleMore = peopleMore;
    w.__peopleSearch = peopleSearch;
    publishPeople();
  },
};
