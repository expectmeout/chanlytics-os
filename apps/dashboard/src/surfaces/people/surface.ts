/**
 * People's override: the rows, the saved views and lists, paging and search, and
 * the deal a person is placed on. The seam's workspace read repaints People from
 * here when the signed-in person changes. Part of the SurfaceData seam
 * (../surface-data.ts).
 */

import {
  type PersonRowDto,
  type DealDto,
  type OpenDealDto,
  dealPaceOf,
  MIN_MS,
  type DealPaceVM,
  type PersonRowVM,
  type PeopleAggregates,
  type AttentionRowVM,
  type ListRule,
} from "@chanlytics/contracts";
import { resnapshotSurface } from "@/legacy-bridge/surface-cache";
import { read } from "@/legacy-bridge/api";
import { workspaceZone } from "@/legacy-bridge/zone";
import { declareReads } from "@/legacy-bridge/surface-registry";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { DEAR_READ_LONGEST_WAIT_MS, isLiveCallTurn } from "@/legacy-bridge/surface-realtime";
import { holderName } from "../holder-names";
import { peopleSurfaceOf, personRowOf } from "./surface-map";
import type { PeopleLoaded } from "./surface-map";
import { declareSurfaceValue, setSurfaceValue, shareUnchanged, surfaceValue } from "../surface-values";

// Today, Ask, the Calendar, Leads and the pages that have not moved still read this under its old name.
declareSurfaceValue("people", "__PEOPLE");

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
  /**
   * The page the rows came from: how many there are in all, and whether more follow (00112); and, once the rows carry
   * their place in the order (00276), where the next page starts (handed back as `after`, 0021).
   */
  page: {
    q: string | null;
    offset: number;
    limit: number;
    total: number;
    has_more: boolean;
    next?: string | null;
  } | null;
  /** What this member's pages remember in this workspace (memberships.views). */
  views: Record<string, unknown>;
  /**
   * Whether they were read: false when the read failed, and `views` is then none of them. A save of one page replaces
   * its whole view, so Today's pins are not changed over a read that failed (it would wipe the ones not shown).
   */
  viewsRead: boolean;
  fetchedAt: number;
}

export let peopleLoaded: PeopleLoaded | null = null;

/** The member looking, as the workspace surface named them at boot; null before it lands. */
export function viewerId(): string | null {
  return (window as unknown as { __ME?: { id?: string | null } }).__ME?.id ?? null;
}

/**
 * The surface from what is loaded, at `now`, published: the seam's value, and the window's mirror of it. Whether anything moved:
 * the clock makes People again each minute where it is drawn (`rederive`), and a minute that moved nothing publishes nothing.
 */
export function publishPeople(now: Date = new Date()): boolean {
  if (!peopleLoaded) return false;
  // What did not change keeps its object, so the table's rows that did not change are not drawn again (surface-values.ts).
  const was = surfaceValue("people");
  const next = shareUnchanged(was, peopleSurfaceOf(peopleLoaded, viewerId(), now, holderName));
  if (next === was) return false;
  setSurfaceValue("people", next);
  return true;
}

/** How long People's read stands at least, whatever visit ends first: its read is of everyone, and the rows re-split meanwhile. */
const PEOPLE_STANDS_MS = 15 * MIN_MS;

/**
 * When the read's split of next and last visit stops being true: the first of the next visits it holds to end (the rows say
 * one that has ended as the last at once, contracts visitsAt; a person booked twice has their second only by a read), and no
 * sooner than a quarter of an hour after the read began. Null with no visit ahead.
 */
function peopleValidUntil(): number | null {
  if (!peopleLoaded) return null;
  let first = Infinity;
  for (const p of peopleLoaded.people) {
    const end = Date.parse(p.visits?.next?.end ?? "");
    if (Number.isFinite(end) && end < first) first = end;
  }
  return Number.isFinite(first) ? Math.max(first, peopleLoaded.readAt + PEOPLE_STANDS_MS) : null;
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
  const shown = surfaceValue("people")?.views;
  const views = peopleLoaded ? peopleLoaded.views : shown;
  if (!views) return landed;
  views[page] = view;
  // The published copy can be an earlier read's, equal and kept as it was (publishPeople, shareUnchanged): it takes it too.
  if (shown && shown !== views) shown[page] = view;
  // A reload paints the tab's cached People before anything is read again, so the cached copy takes the save too.
  resnapshotSurface(
    peopleOverride.key,
    peopleOverride.globals ?? [],
    (window as unknown as { __ACTIVE_WORKSPACE?: string }).__ACTIVE_WORKSPACE ?? null,
    "people",
  );
  return landed;
}

/**
 * The next page's question: the rows held, which count whether more follow, and where the next page starts when the
 * last one said (0021): just past its last row, so someone who wrote in between is not read twice.
 */
function nextPageQuery(held: number, page: PeopleSurface["page"]): { offset: number; after?: string } {
  return page?.next ? { offset: held, after: page.next } : { offset: held };
}

/**
 * The next thousand, appended under the same order, and the surface told. The page shows the button only while the server
 * says more follow.
 */
export async function peopleMore(): Promise<void> {
  if (!peopleLoaded?.page?.has_more) return;
  const next = await read("GET contacts", {
    query: nextPageQuery(peopleLoaded.people.length, peopleLoaded.page),
  });
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
export function placeDeal(
  personId: string,
  deal: DealDto | null | undefined,
  /** The deal the move recorded (0029): it joins, moves in, or leaves the row's open deals, as its stage now says. */
  recorded: DealDto | null | undefined = null,
): boolean {
  if (!peopleLoaded || !deal || !deal.id) return false;
  const i = peopleLoaded.people.findIndex((r) => r.id === personId);
  if (i < 0) return false;
  const row = peopleLoaded.people[i];
  if (!row) return false;
  peopleLoaded.people[i] = {
    ...row,
    ...(recorded && recorded.id && row.open_deals !== undefined
      ? { open_deals: withOpenDeal(row.open_deals ?? [], recorded) }
      : {}),
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
 * A row's open deals once a move is recorded on one of them (0029): in its place while it is still open (a proposal
 * out, a client), first as the newest when it is new, and gone once it has passed or ended.
 */
function withOpenDeal(open: readonly OpenDealDto[], d: DealDto): OpenDealDto[] {
  const rest = open.filter((x) => x.id !== d.id);
  if (d.stage !== "proposed" && d.stage !== "won") return rest;
  const mine: OpenDealDto = {
    id: d.id,
    stage: d.stage,
    service: d.service,
    proposed_at: d.proposed_at,
    decided_at: d.decided_at,
    ended_at: d.ended_at,
    amount_cents: d.amount_cents,
    per: d.per,
    currency: d.currency,
    proposal_url: d.proposal_url ?? null,
    valid_until: d.valid_until ?? null,
    lost_reason: d.lost_reason ?? null,
  };
  const at = open.findIndex((x) => x.id === d.id);
  return at < 0 ? [mine, ...rest] : [...rest.slice(0, at), mine, ...rest.slice(at)];
}

/**
 * Who matches, from the server, when the page does not hold everyone. The server matches names and numbers, a page at a
 * time, so the answer says whether more matches follow the ones it sent.
 */
export async function peopleSearch(q: string): Promise<{ rows: PersonRowVM[]; more: boolean }> {
  const [r, tz] = await Promise.all([read("GET contacts", { query: { q } }), workspaceZone()]);
  const now = new Date();
  return {
    rows: r.people.map((p) =>
      // What the workspace can send on is the first page's (readers/people.ts): a search's rows are judged against it too.
      personRowOf(p, {
        tz,
        now,
        dealsOn: !!r.deals_on,
        viewer: viewerId(),
        ready: peopleLoaded?.channelsReady ?? null,
        names: holderName,
      }),
    ),
    more: !!r.page?.has_more,
  };
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
    const next = await read("GET contacts", { query: nextPageQuery(people.length, page) });
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
  value: "people",
  events: ["surface:clients"],
  refreshOnMessageInserts: true,
  // The clock's: a step falls due, a visit's day word turns ("Tomorrow" is "Today"), a next visit ends and is the last, a
  // thread's wait grows. Made again each minute where People is drawn (People, a person's page, Today's queue and Worth a look)
  // and wherever it is drawn once the day turns, so the Inbox's thread header and Today's steps say a step due at midnight
  // (the wiring's second audit, W-thread-wait-step-5, W-visit-deal-1). And read again once the first next visit it holds has
  // ended, where it is drawn: who is booked again after it is the read's to say.
  rederive: (now) => publishPeople(now),
  validUntil: peopleValidUntil,
  // A read of everyone: a stream of notices is waited out longer than the runner's three seconds (S10-2).
  maxWaitMs: DEAR_READ_LONGEST_WAIT_MS,
  // Deals too: a teammate's move, or a payment's, shows on the rows and the Pipeline without a reload (0008). The
  // tab's own moves already re-read People through the refresh map (POST contacts/[id]/deal).
  // And notes: a teammate's step, set or done, moves a row's next step (00166).
  // And the lists (00169): a teammate's new list, rename or archive is on the rail without a reload. And the visits (#1551): a
  // teammate's mark, a booking email and the hourly calendar read move a row's next and last visit, "asked, never booked" and the
  // "missed a visit" list, which the Inbox's visit chip and Today's Worth a look are drawn from. And a reach-out's reply read: the
  // signer it offers as a name, which the Inbox thread a bell row opens draws from People's rows (the wiring's second audit, S1-1,
  // its first option: a few a day, and an open person's page reloads with it, so their own surface does not read them again).
  // They are a few a day, so they are heard on every page, with the other kinds of its own below (`always`).
  //
  // The rest is heard while People is on screen and once when it comes back (surface-registry.ts onlyOnItsPage; a read of
  // everyone is the dearest the feed asks for): every page of it was read again for each message, on whatever page the owner was
  // looking at. They are what a row is made from that is not its own: the messages, conversations and holds its state is made
  // of; the person (a teammate's rename, an answer, a stop, a merge, people imported); the playbooks a row's follow-up names; the
  // channels its reach is counted against (channels_ready: the number, the text line the carriers approve, the mailbox and its
  // pause on offers; the wiring's second audit, S3-3, W-channel-team-plus-3); the rules and templates its labels and sends read; and the
  // business's facts it draws (the booking link, the deal pace, the postal address an offer by email names) (0047); since 0052,
  // the business a person works at (the lead's name, its "Works at"); and the runs a row's "Follow-up to approve" names, approved
  // or skipped elsewhere (the wiring's second audit, W-campaign-run-template-reachout-9). And the calls a row's last contact and
  // call count are made of (people_list's last call), a call's start and end, never a transcript turn of one in progress; and the
  // team, whose names say who wrote a note and whom a step is for (teamNames): a teammate who joins, leaves or changes role.
  ...declareReads("people", {
    reads: [
      "conversation",
      "hold",
      "person",
      "call",
      "team",
      "campaign",
      "channel",
      "billing",
      "rules",
      "template",
      "facts",
      "visit",
      "deal",
      "step",
      "list",
      "lead",
      "reach_out",
      "send",
    ],
    fresh: "its-page",
    always: ["visit", "deal", "step", "list", "reach_out"],
    omit: [
      {
        tables: ["mailbox_connections", "capability_activations", "business_records"],
        why: "its reach is counted against the number, the text line and the mailbox with its pause on offers (channels_ready); a connected mailbox, an activation and the carriers' record are not among them",
      },
      {
        tables: ["appointment_notices"],
        why: "a booking email held for a look is the Calendar's and Settings'; a row's visits are the appointments themselves",
      },
      {
        tables: ["lead_searches", "lead_rounds", "lead_search_members"],
        why: "a row draws the lead its person works at, by name; the searches that found leads, their rounds and members are the Leads page's",
      },
      {
        tables: ["invitations"],
        why: "a row names who wrote a note or whom a step is for among the members; an invitation not yet taken names no one",
      },
    ],
    when: (c) => !isLiveCallTurn(c),
  }),
  apply: async () => {
    // A view saved while this read is out, or before it with its reply still to come, may be missing from what the read
    // brings back, so the tab's own saves are laid over it. A read that overlapped no save takes the server's views as
    // they are: another device's change shows.
    const savesBefore = keptViews.made;
    const overlapped = keptViews.waiting > 0;
    const readAt = Date.now();
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
      channelsReady: data.channels_ready ?? null,
      views:
        overlapped || keptViews.made !== savesBefore
          ? { ...(viewsData.views ?? {}), ...keptViews.views }
          : (viewsData.views ?? {}),
      viewsRead: !("failed" in viewsData),
      readAt,
    };
    publishPeople();
  },
};
