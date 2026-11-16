import "server-only";
import {
  DAY_MS,
  pickCurrentDeal,
  type ContactId,
  type LeadSearchDto,
  type SequenceRowDto,
} from "@chanlytics/contracts";
import { getCancellationsSince, listSequenceRows } from "@chanlytics/db/campaigns";
import {
  countNeverAskedOnWhatsApp,
  listListHeads,
  listOpenDealsOfListed,
  listPeopleWithAStep,
  type ListedOpenDeal,
} from "@chanlytics/db/people";
import { load, type ReaderContext } from "../../../shared/reader";
import { facts as factsReader, zoneAndSettings } from "../../../readers/facts";
import { sequencesWaitingNow } from "../../../readers/sequences";
import { listPlaybookRows } from "../../../campaigns/playbooks";
import { listSearchesWrittenTo } from "../../../campaigns/reach-outs/reach-outs";
import { listFoundSearches } from "../../../leads/searches";
import { findCalendar } from "../../../calendar/settings";
import { isCalendarConnected } from "../../../calendar/people-visits";
import { countPeople } from "../../../people/people";
import { stillListed } from "../../../people/going";
import type { ToolContext } from "../context/tool-defs";
import { unread } from "../context/tool-reads";

/**
 * What Ask notices reads of the workspace (signals.ts's spots; the notices of server/ask/notice): each part as narrow as
 * the rule that reads it, and read once (16 Nov 2026). It read each part as its page reads it, everything the page draws
 * of it: everyone in People with their appointments, every list with its members, the playbooks with each moment's pool
 * over everyone, the cold emails with their words and counts, on every open of the AI and every business's morning (52
 * reads on production's demo workspace, People's whole book among them, which grows with the business). Now People is
 * three counts (people/noticed.ts in packages/db), the lists their names, the moments their steps, the cold emails the
 * searches they write to, the searches their rows, the sequences their rows, the calendar whether one is connected: none
 * of it pages People, so a business of thousands asks what one of twenty does. A read that fails leaves its part null,
 * said in the log (`unread`), and the spots that read it say nothing, never "nothing to notice".
 */

/** Who counts as new, and how far back a cancellation is counted: within this many days. */
export const NEW_DAYS = 30;

/** People, counted: how many People lists, and of them the two kinds a notice is about. */
export interface PeopleCounted {
  /** Everyone People lists (its "N of M", countPeople). */
  listed: number;
  /** Never asked for the yes to offers, on WhatsApp. */
  neverAsked: number;
  /** Whose shown deal is a proposal out, with no next step. */
  proposalsWithoutAStep: number;
}

/** The workspace as the spots read it: each part null where its read failed. */
export interface Seen {
  people: PeopleCounted | null;
  /** The workspace's own lists, by name: what each is called, and whether it is archived. */
  kept: { id: string; name: string; archived_at: string | null }[] | null;
  /** The sequences, with what waits on you in each now. */
  seqs: { sequences: SequenceRowDto[] } | null;
  /** The moments' steps (the playbooks): the list each runs on, its trigger, its state and its last day. */
  steps: Awaited<ReturnType<typeof listPlaybookRows>> | null;
  /** The searches a cold email writes to. */
  written: string[] | null;
  /** The kept searches, each with its latest round. */
  finder: { searches: LeadSearchDto[] } | null;
  /** A calendar is connected: a freed time is offered there. */
  calendar: boolean | null;
  /** The cancellations in the window whose time a freed time's step would have offered (decision 0082). */
  cancellations: number | null;
  /** The business's clock. */
  zone: string | null;
  nowMs: number;
  /** Ask's own read (signals.ts readSignals) says these too, in its sentences for the model: who is new, who said yes. */
  fresh?: number;
  saidYes?: number;
}

/**
 * Whose shown deal is a proposal out, among the people People lists, and of them who has no next step. The deal the pages
 * show is contracts' pickCurrentDeal over a person's deals (people_list's lateral orders them the same way): an open one
 * first, then the newest, so it is a proposal out exactly where the newest of their open deals is one, and only open deals
 * are read. Their next step is any note with a day not done (people_list's step_*), read for them alone.
 */
async function countProposalsWithoutAStep(rc: ReaderContext, listedOr: string): Promise<number> {
  const db = rc.ctx.supabase;
  const byPerson = new Map<ContactId, ListedOpenDeal[]>();
  for (const d of await listOpenDealsOfListed(db, rc.tenantId, listedOr))
    byPerson.set(d.contact_id, [...(byPerson.get(d.contact_id) ?? []), d]);
  const out = [...byPerson].filter(([, deals]) => pickCurrentDeal(deals)?.stage === "proposed").map(([id]) => id);
  if (!out.length) return 0;
  const stepped = await listPeopleWithAStep(db, rc.tenantId, out);
  return out.filter((id) => !stepped.has(id)).length;
}

/** People, counted where the rows are, by the people People lists now (people_page's rule, on the database's clock). */
async function countPeopleSeen(rc: ReaderContext): Promise<PeopleCounted> {
  const listedOr = stillListed(Date.now());
  const [listed, neverAsked, proposalsWithoutAStep] = await Promise.all([
    countPeople(rc.ctx, rc.tenantId, null),
    countNeverAskedOnWhatsApp(rc.ctx.supabase, rc.tenantId, listedOr),
    countProposalsWithoutAStep(rc, listedOr),
  ]);
  return { listed, neverAsked, proposalsWithoutAStep };
}

/** The workspace as the spots read it: every part asked at once, none behind another but the zone the sequences are dated by. */
export async function seeAll(toolContext: ToolContext): Promise<Seen> {
  const failed = (read: string) => unread(toolContext, "signals", read);
  const rc = toolContext.rc;
  const since = new Date(toolContext.now.getTime() - NEW_DAYS * DAY_MS).toISOString();
  const zoneRead = load(rc, factsReader, undefined).then((r) => r.data.timezone);
  const [people, kept, seqs, steps, written, finder, calendar, cancellations, zone] = await Promise.all([
    countPeopleSeen(rc).catch(failed("people")),
    listListHeads(rc.ctx.supabase, rc.tenantId).catch(failed("lists")),
    Promise.all([listSequenceRows(rc.ctx.supabase, rc.tenantId), zoneRead]).then(
      ([rows, zone]) => ({ sequences: sequencesWaitingNow(rows, zone, rc.now) }),
      failed("sequences"),
    ),
    listPlaybookRows(rc.ctx, rc.tenantId).catch(failed("moments")),
    listSearchesWrittenTo(rc.ctx, rc.tenantId).catch(failed("cold emails")),
    listFoundSearches(rc.ctx, rc.tenantId).then((searches) => ({ searches }), failed("searches")),
    // The calendar's settings are the turn's (readers/facts.ts): whether one is connected reads nothing more.
    zoneAndSettings(rc)()
      .then((known) => findCalendar(rc.ctx, rc.tenantId, known))
      .then(isCalendarConnected, failed("calendar")),
    getCancellationsSince(rc.ctx.supabase, rc.tenantId, since).catch(failed("cancellations")),
    zoneRead.catch(failed("facts")),
  ]);
  return {
    people,
    kept,
    seqs,
    steps,
    written,
    finder,
    calendar,
    cancellations,
    zone,
    nowMs: toolContext.now.getTime(),
  };
}
