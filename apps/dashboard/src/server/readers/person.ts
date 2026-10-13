import "server-only";
import {
  AppError,
  NEW_CONVERSATION_WORDS,
  addressOf,
  callerName,
  combinedInto,
  consentChangeOf,
  dealsAreOn,
  personName,
  readyOrWhatsApp,
  writeReachOf,
  type MessageDto,
  type PersonDetailDto,
  type PersonEscalationDto,
  type PersonReachDto,
} from "@chanlytics/contracts";
import { SMS_FOOTER } from "@chanlytics/channels";
import {
  openDoubtsOf,
  keptPersonOf,
  peopleAtLead,
  personDecisions,
  personReplyMode,
  personRow,
  readAllRows,
  signersOf,
  textReached,
} from "@chanlytics/db";
import {
  CALL_COLUMNS,
  CONVERSATION_COLUMNS,
  MESSAGE_COLUMNS,
  groupMessages,
  toCallDto,
  toConversationDto,
} from "../dto";
import { personLike } from "../calendar/calendar-week";
import { personVisits } from "../calendar/person-visits";
import { personRuns } from "../campaigns/broadcasts";
import { leadOfPerson } from "../leads/leads";
import { leadOne } from "../leads/lead-page";
import { personNotesRead, stepFor } from "../people/person-notes";
import { DEAL_DTO_COLUMNS, dealPaceRead } from "../people/deals";
import { load, stamp, type Reader, type ReaderContext, type RowRef } from "./index";
import * as facts from "./facts";
import { log } from "@/server/log";

/** How many of a person's messages their page holds: the newest, so what drops is the oldest history. */
const PERSON_MESSAGES = 2000;

/**
 * Their messages on the threads `convIds` names, newest first, so the cap drops the oldest history (groupMessages
 * restores order). Paged: PostgREST answers a thousand rows whatever a select asks for, so `.limit(2000)` read 1,000,
 * and past that the page lost their older messages and a proposal sent among them read as never sent. The id breaks
 * ties, so the order is the same on every page. A message that arrives between two pages moves the rest down a place,
 * and the next page opens with the last one read: each is kept once.
 */
function personMessages(rc: ReaderContext, convIds: string[]) {
  return readAllRows(
    "person messages",
    (from, to) =>
      rc.ctx.supabase
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    PERSON_MESSAGES,
  ).then((rows) => [...new Map(rows.map((m) => [m.id, m])).values()]);
}

/** Where they came from, as the profile says it: the door's contact.added row for them, when there is one. */
function cameFrom(row: { created_at: string; data: unknown } | null): PersonDetailDto["added"] {
  if (!row) return undefined;
  const data = row.data as { source?: unknown; title?: unknown } | null;
  return {
    at: row.created_at,
    source: String(data?.source ?? "manual"),
    title: typeof data?.title === "string" ? data.title : null,
  };
}

/**
 * What the workspace's config gives a person's page: the booking link, so the profile can text it in one step; the
 * services, the page's service picker; and the services that need a consultation first, so a proposal started after one
 * names the service it was for (0008).
 */
function configFacts(config: unknown): { bookingLink: string | null; services: string[]; consultFirst: string[] } {
  type Brain = {
    booking_link?: unknown;
    profile?: { services?: { name: string }[]; booking_rules?: { consult_first?: unknown } };
  };
  const brain = (config as { brain?: Brain } | null)?.brain;
  const link = brain?.booking_link;
  const consult = brain?.profile?.booking_rules?.consult_first;
  return {
    bookingLink: typeof link === "string" && link.trim() ? link.trim() : null,
    services: (brain?.profile?.services ?? []).map((s) => s.name),
    consultFirst: Array.isArray(consult) ? consult.filter((x): x is string => typeof x === "string") : [],
  };
}

/**
 * The business a person works at and who signed their replies (decision 0052), read beside the rest of their page: the
 * lead their row names, read as Leads reads one (its listing, stage, verdict and reach, through the list's own builder),
 * the people who work there, and the signers of their replies still offered or taken. Never fatal: a lead that cannot be
 * read costs the Works at row and the sheet, a signer the notice, not the page; a lead erased since has no row.
 */
async function businessAndSigners(
  rc: ReaderContext,
  tenantId: string,
  id: string,
  rowRead: Promise<{ lead_id?: string | null; lead_gone?: boolean | null } | null>,
): Promise<Pick<PersonDetailDto, "business" | "signers">> {
  const sb = rc.ctx.supabase;
  const business = rowRead
    .then(async (r) => {
      const leadId = r?.lead_id && !r.lead_gone ? r.lead_id : null;
      if (!leadId) return null;
      const [one, people] = await Promise.all([leadOne(rc.ctx, tenantId, leadId), peopleAtLead(sb, tenantId, leadId)]);
      return { lead: one.row, people };
    })
    .catch((e: unknown) => {
      log.error("person_business_failed", { contact: id, error: e instanceof Error ? e.message : String(e) });
      return null;
    });
  const signers = signersOf(sb, tenantId, id).catch((e: unknown) => {
    log.error("person_signers_failed", { contact: id, error: e instanceof Error ? e.message : String(e) });
    return [];
  });
  return { business: await business, signers: await signers };
}

/**
 * The 404 for a person this workspace does not show: in its words, and, for one combined into another since (0028),
 * naming the record kept (contracts combinedInto), so their old address opens the person they became (S5-3).
 */
async function notHere(sb: Parameters<typeof keptPersonOf>[0], tenantId: string, id: string): Promise<AppError> {
  const kept = await keptPersonOf(sb, tenantId, id);
  return new AppError("not_found", "This person is not in your workspace.", 404, kept ? combinedInto(kept) : undefined);
}

/**
 * One person in full, as GET contacts/:id answers it: the route's body, moved here whole, so the profile and Ask's
 * people.get read the same rows the same way. The row the list shows (people_list narrowed to this contact) and
 * everything the profile renders from, asked for in one round (the route's comment says why, and what it measured);
 * the workspace's config and how its customers buy come through their readers, once in a turn. A person this
 * workspace does not hold is the route's 404, in its words, before anything read is put together. The person is a row
 * a citation may name, as People names them; so is each of their threads, and each of their calls, by the caller as
 * the Calls page names them.
 */
export const person: Reader<{ id: string }, { person: PersonDetailDto }> = {
  name: "person",
  async read(rc, { id }) {
    const tenantId = rc.tenantId;
    const sb = rc.ctx.supabase;
    // The row the list shows, read as the list reads it (packages/db personRow: every open deal in its shape, 0029).
    const rowRead = personRow(sb, tenantId, id);
    // A query builder runs again each time it is awaited: the conversations are read once and handed to both readers.
    const convsRead = Promise.resolve(
      sb
        .from("conversations")
        .select(CONVERSATION_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("contact_id", id)
        .order("last_message_at", { ascending: false, nullsFirst: false }),
    );
    // Their messages, escalations and the decisions on them and on their threads (a person with no thread still has
    // their own: the receptionist paused for them is recorded against them): the one read that waits, for the threads' ids.
    const threadRead = convsRead.then(async (convs) => {
      const convIds = convs.error ? [] : (convs.data ?? []).map((c) => c.id);
      if (!convIds.length) {
        return {
          byConv: new Map<string, MessageDto[]>(),
          escalations: [] as PersonEscalationDto[],
          decisions: await personDecisions(sb, tenantId, id, []),
        };
      }
      const [msgs, escs, decided] = await Promise.all([
        personMessages(rc, convIds),
        sb
          .from("escalations")
          .select("id, conversation_id, reason, state, details, created_at, updated_at, resolved_by_user_id")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false }),
        personDecisions(sb, tenantId, id, convIds),
      ]);
      if (escs.error) throw new Error(escs.error.message);
      return { byConv: groupMessages(msgs), escalations: escs.data ?? [], decisions: decided };
    });
    // Their appointments on the owner's calendar, when one is connected: the feed is read now, and matched to them once
    // their row says who they are. Never fatal: a feed that cannot be read costs this line, not the profile. A row that
    // could not be read is the route's to say, not the calendar's.
    const visitsRead = personVisits(
      rc.ctx,
      tenantId,
      rowRead.then(
        (r) => (r ? personLike(r) : null),
        () => null,
      ),
    ).catch((e: unknown) => {
      log.error("person_visits_failed", { contact: id, error: e instanceof Error ? e.message : String(e) });
      return null;
    });
    // Their notes and the team a note can be for (0007), read beside everything else; never fatal either.
    const notesRead = personNotesRead(rc.ctx, tenantId, id);

    const [
      row,
      idents,
      convs,
      calls,
      personPol,
      wsPol,
      added,
      own,
      cfg,
      history,
      runs,
      lead,
      deals,
      sellsBy,
      thread,
      visits,
      notes,
      pace,
      doubts,
      work,
    ] = await Promise.all([
      rowRead,
      sb.from("contact_identities").select("channel, external_id, created_at").eq("contact_id", id).order("created_at"),
      convsRead,
      sb
        .from("calls")
        .select(CALL_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("contact_id", id)
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(200),
      // This person's own receptionist mode, and the workspace's, for the rail.
      sb
        .from("policies")
        .select("mode")
        .eq("tenant_id", tenantId)
        .eq("class", "reply")
        .eq("subject_type", "contact")
        .eq("subject_id", id)
        .maybeSingle(),
      sb
        .from("policies")
        .select("mode")
        .eq("tenant_id", tenantId)
        .eq("class", "reply")
        .is("subject_type", null)
        .maybeSingle(),
      // Where they came from, when it was not a message or a call: the
      // calendar sweep records the appointment that named them.
      sb
        .from("events")
        .select("data, created_at")
        .eq("tenant_id", tenantId)
        .eq("kind", "contact.added")
        .eq("subject_type", "contact")
        .eq("subject_id", id)
        .order("created_at")
        .limit(1)
        .maybeSingle(),
      // The owner's notes and their proposal link (00154): the two columns people_list does not carry.
      sb.from("contacts").select("notes, proposal_url").eq("id", id).maybeSingle(),
      // The booking link, so the profile can text it in one step. The workspace's config, read once in a turn: a read
      // that fails is kept, not thrown here, and checked below, in the route's order.
      load(rc, facts.config, undefined).then(
        (r) => ({ data: r.data, error: null as Error | null }),
        (e: unknown) => ({ data: null, error: e instanceof Error ? e : new Error(String(e)) }),
      ),
      // Every change to either answer: the ledger rows the doors write, which
      // the timeline shows as evidence. Newest first, two hundred at most.
      sb
        .from("events")
        .select("id, subject_id, created_at, data")
        .eq("tenant_id", tenantId)
        .eq("kind", "contact.consent_changed")
        .eq("subject_type", "contact")
        .eq("subject_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
      // The runs that named them, and the lead they were found as: what a playbook or a broadcast sent them, and the
      // way back to where the finder found them.
      personRuns(rc.ctx, tenantId, id),
      leadOfPerson(rc.ctx, tenantId, id),
      // Their deals, newest first, each with its link, the day it stands until and why they passed (0008); and how
      // this workspace's customers buy, which decides whether the page says any of it. Each is safe on an older
      // database: a table or a column that is not there costs the section, never the profile.
      sb
        .from("deals")
        .select(DEAL_DTO_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("contact_id", id)
        .order("created_at", { ascending: false })
        .then((r) => (r.error ? null : (r.data ?? []))),
      load(rc, facts.sellsBy, undefined).then((r) => r.data),
      threadRead,
      visitsRead,
      notesRead,
      // The workspace's pace (0008, amended), for their deal card: when their proposal waits, and how long a yes takes.
      dealPaceRead(rc.ctx, tenantId),
      // The open doubts naming them (0034 step 4); none on a database before the table.
      openDoubtsOf(sb, tenantId, id),
      // The business they work at and who signed their replies (0052); never fatal.
      businessAndSigners(rc, tenantId, id, rowRead),
    ]);
    if (!row) throw await notHere(sb, tenantId, id);
    if (history.error) throw new Error(history.error.message);
    if (own.error) throw new Error(own.error.message);
    // Checked like the other seven. A dropped error here reads as "this
    // workspace has no booking link", which is indistinguishable on the page
    // from one that never set one -- so the "text them the link" step simply
    // vanishes for a workspace that has it configured.
    if (cfg.error) throw cfg.error;
    if (added.error) throw new Error(added.error.message);
    const fromConfig = configFacts(cfg.data?.config);
    if (idents.error) throw new Error(idents.error.message);
    if (personPol.error) throw new Error(personPol.error.message);
    if (wsPol.error) throw new Error(wsPol.error.message);
    if (convs.error) throw new Error(convs.error.message);
    if (calls.error) throw new Error(calls.error.message);
    const { byConv, escalations, decisions } = thread;

    const person: PersonDetailDto = {
      row: {
        ...row,
        effective_reply_mode: personPol.data?.mode ?? wsPol.data?.mode ?? null,
        // Who their next step is for (00166), from the team the notes were read with.
        ...stepFor(row, notes.team, rc.userId),
      },
      identities: idents.data ?? [],
      conversations: (convs.data ?? []).map((c) => toConversationDto(c, byConv.get(c.id) ?? [], rc.userId)),
      calls: (calls.data ?? []).map(toCallDto),
      escalations,
      decisions,
      receptionist_mode: personPol.data?.mode ?? null,
      workspace_reply_mode: wsPol.data?.mode ?? null,
      visits: visits ?? undefined,
      notes: own.data?.notes ?? null,
      ...(notes.notes ? { person_notes: notes.notes } : {}),
      ...(notes.team ? { note_team: notes.team } : {}),
      proposal_url: own.data?.proposal_url ?? null,
      booking_link: fromConfig.bookingLink,
      consent_history: (history.data ?? []).map(consentChangeOf),
      campaigns: runs,
      lead,
      doubts,
      deals: deals ?? undefined,
      deals_on: dealsAreOn(sellsBy),
      deal_pace: dealsAreOn(sellsBy) ? pace : null,
      services: fromConfig.services,
      consult_first: fromConfig.consultFirst,
      added: cameFrom(added.data),
      ...work,
    };
    return { data: { person }, rows: rowsOfPerson(person, personName(row)), stamp: stamp() };
  },
};

/**
 * The rows a person's read returned, each at its address: the person as People names them, and each of their threads by the
 * same name, as the Inbox names a thread by its person; each call by its caller, as the Calls page does.
 */
function rowsOfPerson(person: PersonDetailDto, label: string): RowRef[] {
  return [
    { kind: "person", id: person.row.id, route: addressOf({ kind: "person", id: person.row.id }), label },
    ...person.conversations.map((c): RowRef => ({
      kind: "thread",
      id: c.id,
      route: addressOf({ kind: "conversation", id: c.id }),
      label,
    })),
    ...person.calls.map((c): RowRef => ({
      kind: "call",
      id: c.id,
      route: addressOf({ kind: "call", id: c.id }),
      label: callerName(c),
    })),
  ];
}

/**
 * How one person can be written to and called now (GET people/[id]/reach; a conversation begins from the Inbox): People's
 * own row for them, asked the one rule (contracts writeReachOf) against what the workspace can send on, with the
 * receptionist's mode in force for them, and the workspace's own words for an approved message's slots, read as the
 * send reads them (ports/core-ports.ts templateFacts), and whether a text of ours has reached them, which decides the
 * line a first text carries (the sheet shows it before the send). Small reads, and none of their messages: the sheet
 * asks this as a person is picked. Channels that could not be read are WhatsApp alone, the others "could not be checked", as
 * People counts.
 */
export const personReach: Reader<{ id: string }, { reach: PersonReachDto }> = {
  name: "personReach",
  async read(rc, { id }) {
    const sb = rc.ctx.supabase;
    const [row, ready, own, workspace, settings] = await Promise.all([
      personRow(sb, rc.tenantId, id),
      load(rc, facts.channelsReady, undefined).then((r) => r.data),
      personReplyMode(sb, rc.tenantId, id),
      load(rc, facts.policies, undefined).then((r) => r.data),
      load(rc, facts.config, undefined).then((r) => r.data),
    ]);
    if (!row) throw new AppError("not_found", NEW_CONVERSATION_WORDS.refusals.notYours, 404);
    // Asked of their one thread, as the send asks it (core begin.ts): with no thread, nothing of ours has reached them.
    const texted = row.latest_conversation_id ? await textReached(sb, rc.tenantId, row.latest_conversation_id) : false;
    const mode = own ?? workspace.find((p) => p.class === "reply")?.mode ?? null;
    const brain = (settings?.config as { brain?: { business_name?: string; booking_link?: string } } | null)?.brain;
    const reach = writeReachOf(row, {
      ready: readyOrWhatsApp(ready),
      mode,
      // The name is enough: a message that sends no link needs none (the send refuses one that does, reply.ts).
      facts: brain?.business_name
        ? { business_name: brain.business_name, booking_link: brain.booking_link || null }
        : null,
      firstTextLine: texted ? null : SMS_FOOTER,
      now: rc.now,
    });
    return {
      data: { reach },
      rows: [
        { kind: "person", id: row.id, route: addressOf({ kind: "person", id: row.id }), label: reach.person.name },
      ],
      stamp: stamp(),
    };
  },
};
