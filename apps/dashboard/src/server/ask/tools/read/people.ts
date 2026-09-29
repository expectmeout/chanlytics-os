import "server-only";
import { z } from "zod";
import {
  ASK_CAPS,
  BUILTIN_LISTS,
  PEOPLE_LISTS,
  ago,
  asListRule,
  listMembers,
  listRuleParts,
  listToken,
  listUnknownWords,
  nextStepOf,
  noteRows,
  parseListToken,
  personName,
  poolRowOf,
  ruleNeeds,
  savedListLookup,
  toPersonVM,
  unmetNeed,
  type PersonRowDto,
  type PersonRowVM,
  visitLine,
} from "@chanlytics/contracts";
import { poolList, type AudiencePool } from "../../../people/audience";
import { load } from "../../../readers";
import { audiencePool } from "../../../readers/audience-pool";
import { lists as listsReader } from "../../../readers/lists";
import { dealBoard, people } from "../../../readers/people";
import { person } from "../../../readers/person";
import {
  AUDIENCES_CALL,
  UUID,
  defineActions,
  noteRow,
  readAction,
  str,
  unlessNotFound,
  type ToolContext,
} from "../context";

function stepLine(r: PersonRowDto, tz: string, nowMs: number): string | null {
  const s = nextStepOf(r, tz, nowMs);
  return s ? `${s.words} · ${s.day.words}` : null;
}

/** A person as people.search says them: the People row's facts, and where they stand in the row's own words (`vm`). */
function personLine(r: PersonRowDto, vm: PersonRowVM, tz: string, nowMs: number) {
  return {
    contact_id: r.id,
    route: `clients/${r.id}`,
    name: personName(r),
    // Where they stand as the People row says it (ledger #7): one of the seven states (contracts personStateFor, for
    // the member asking), and the line the row draws beside it, when it draws one.
    state: vm.stateLabel,
    state_detail: vm.stateDetail || null,
    // The moment, not the time since it: handed the gap, ago read it as a moment in January 1970.
    last_contact: r.last_message_at
      ? ago(Date.parse(r.last_message_at), tz, nowMs)
      : r.last_call_at
        ? ago(Date.parse(r.last_call_at), tz, nowMs)
        : "never",
    last_message: r.last_inbound_text ? r.last_inbound_text.slice(0, 120) : null,
    conversation_id: r.latest_conversation_id,
    channels: r.channels ?? [],
    consent: r.consent,
    receptionist_mode: r.effective_reply_mode ?? null,
    calls: r.call_count ?? 0,
    next_visit: r.visits?.next
      ? `${visitLine(r.visits.next, r.visits.timezone, nowMs)} · ${r.visits.next.title}`
      : null,
    // Their earliest open step (0007, amended), its day as the pages say it: "Send the quote · Due Fri".
    next_step: stepLine(r, tz, nowMs),
    last_visit: r.visits?.last
      ? `${visitLine(r.visits.last, r.visits.timezone, nowMs)} · ${r.visits.last.title}`
      : null,
  };
}

async function searchPeople(t: ToolContext, input: { query: string; list?: string }): Promise<unknown> {
  // The query as the People page's search sends it (contacts/route.ts): trimmed, eighty characters at most.
  const q = str(input.query, 80);
  const listIn = str(input.list, 60);
  // Any list, one way (decision 0009): a token campaigns.audiences gave, or a People list's bare id.
  const ref = listIn
    ? (parseListToken(listIn) ?? parseListToken(`list:${listIn}`) ?? parseListToken(`seg:${listIn}`))
    : null;
  if (listIn && !ref) return { error: `list must be a list token from ${AUDIENCES_CALL}, or a People list's id` };
  // A list is counted over the audience pool (readers/audience-pool.ts, once a turn), everyone with their appointments,
  // as the People rail and the send count one (audience.ts poolList) -- never over one page. One of the workspace's own
  // is counted from the lists the turn holds (readers/lists.ts, as campaigns.audiences read them), never read again. One
  // that can't be counted here says why, in the page's words, and names the condition that failed.
  let pool: AudiencePool | null = null;
  let members: Set<string> | null = null;
  if (ref) {
    const [held, kept] = await Promise.all([
      load(t.rc, audiencePool, undefined).then((r) => r.data),
      ref.kind === "saved" ? load(t.rc, listsReader, undefined).then((r) => r.data.lists) : undefined,
    ]);
    pool = held;
    const found = await poolList(t.ctx, t.tenantId, pool, ref, kept);
    if (!found) return { error: `no such list; ${AUDIENCES_CALL} names them`, people: [] };
    if ("unknown" in found) return { error: `${found.label}: ${found.unknown}`, people: [] };
    members = new Set(found.memberIds);
  }
  const on = members;
  const viewer = t.ctx.userId ?? null;
  let hits: PersonRowDto[];
  let matches: number;
  let rowOf: (r: PersonRowDto) => PersonRowVM;
  if (pool && on && !q) {
    // A list and no words: its members, in the pool's order, each with the pool's own People row.
    const inPool = pool;
    hits = inPool.people.filter((r) => on.has(r.id));
    matches = hits.length;
    rowOf = (r) => inPool.rows.find((v) => v.id === r.id)!;
  } else {
    // The People page's own read (readers/people.ts), once a turn per query (ledger #7): one page from people_list
    // under the member's RLS, matched in SQL on a name, a WhatsApp name, an address or three digits of the number, in
    // the function's order, each person with their appointments -- so "who is booked this week?" is answered from the
    // calendar -- and `total`, how many match in all; on a list too, who of its matches is on the list.
    const page = (await load(t.rc, people, { q: q || null, offset: 0 })).data;
    hits = on ? page.people.filter((r) => on.has(r.id)) : page.people;
    matches = on ? hits.length : page.page.total;
    // Each person said, as the People page builds their row (legacy-bridge/surface-data.ts personRowOf): for the member
    // asking, with no deal where deals are off -- built for the rows said alone, never the whole page.
    rowOf = (r) => poolRowOf(r, { tz: t.timezone, now: t.now, viewer, dealsOn: page.deals_on });
  }
  const picked = hits.slice(0, ASK_CAPS.people);
  for (const r of picked) {
    noteRow(t, "person", r.id, personName(r), `clients/${r.id}`);
    const th = r.latest_conversation_id;
    if (th) noteRow(t, "thread", th, personName(r), `inbox/th-${th}`);
  }
  return {
    query: q,
    // A People list by its id, as it was asked for; one of the workspace's own by its token.
    list: ref ? (ref.kind === "builtin" ? ref.id : `list:${ref.id}`) : null,
    // Counted before the cap: everyone the query matches, as the page counts them; on a list, who is on it.
    matches,
    people: picked.map((r) => personLine(r, rowOf(r), t.timezone, t.now.getTime())),
  };
}

async function getPerson(t: ToolContext, input: { contact_id: string }): Promise<unknown> {
  const id = str(input.contact_id);
  if (!UUID.test(id)) return { error: "contact_id must be an id a tool returned" };
  // The person as their page reads them (readers/person.ts): the profile's one round of reads, once a turn, the
  // workspace's config and sells_by shared with the rest of it; a person this workspace does not hold is the reader's
  // 404. Then the page's own view model, for the member asking, as the profile builds it
  // (legacy-bridge/people-detail.ts): the facts, the timeline and the notes are the page's (ledger #3).
  const r = await unlessNotFound(load(t.rc, person, { id }));
  if (!r) return { error: "no such person in this workspace" };
  const detail = r.data.person;
  const vm = toPersonVM(detail, t.timezone, t.now, t.ctx.userId ?? null);
  // The person, their threads and calls as the reader gave them, and each thread again where Conversations opens it.
  noteRows(t.read, r.rows);
  for (const c of detail.conversations) noteRow(t, "conversation", c.id, vm.name, `conversations/${c.id}`);
  return {
    contact_id: id,
    route: `clients/${id}`,
    name: vm.name,
    // Where they stand, as their People row and people.search say it: the row's rule (contracts personStateFor, for
    // the member asking) under the page's own view model. Without it an answer read the stored thread states below,
    // and a thread the member holds, still needs_human in storage, read "Needs you".
    state: vm.stateLabel,
    state_detail: vm.stateDetail || null,
    since: vm.since,
    right_now: { title: vm.rightNow.title, detail: vm.rightNow.detail },
    // The deal's fact says its value at every stage (0008), and where its proposal lives: the host, never the address.
    facts: vm.facts.map((f) => {
      const meta =
        f.label === "Deal" && vm.deal?.proposal
          ? [f.meta, `proposal at ${vm.deal.proposal.host}`].filter(Boolean).join(" · ")
          : f.meta;
      return `${f.label}: ${f.value}${meta ? ` (${meta})` : ""}`;
    }),
    about: vm.about.map((a) => `${a.k}: ${a.v}`),
    receptionist_mode: vm.receptionistMode,
    last_exchange: vm.lastExchange,
    open_conversation_id: vm.openThread ? vm.openThread.replace(/^th-/, "") : null,
    conversations: detail.conversations
      .slice(0, 5)
      .map((c) => ({ conversation_id: c.id, route: `inbox/th-${c.id}`, state: c.state, last_at: c.last_message_at })),
    calls: detail.calls
      .slice(0, 5)
      .map((c) => ({ call_id: c.id, route: `conversations/cv-${c.id}`, at: c.started_at, status: c.status })),
    timeline: vm.timeline
      .slice(0, 20)
      .map((i) => ({ day: i.day, time: i.time, kind: i.kind, who: i.who, text: i.text.slice(0, 240) })),
    // A suggestion is the receptionist's, not yet kept by anyone: said as such, never as a fact the team wrote.
    notes: vm.noteList.slice(0, 20).map((n) => ({
      who: n.who,
      when: n.whenFull,
      for: n.forWho,
      team_only: n.teamOnly,
      suggested_by_the_receptionist: n.suggested,
      text: n.body,
    })),
  };
}

/** The Pipeline's people one read says: the groups' counts are whole. */
const PIPELINE_CAP = 30;

/**
 * Every list People's rail shows, as the page builds it (legacy-bridge/surface-data.ts publishPeople, over contracts'
 * one table of lists): People's own that this workspace can count, each with what it holds and how many; the ones it
 * cannot, with why; and the workspace's own lists, kept by hand or by a rule, each with its rule in the page's words
 * and its count or why it cannot be counted. Counted over the audience pool (readers/audience-pool.ts: everyone, for
 * the member asking, as a send counts them), where the page counts the people it has loaded; the lists are People's
 * rail's read (readers/lists.ts), once a turn.
 */
async function listLists(t: ToolContext): Promise<unknown> {
  const [pool, saved] = await Promise.all([
    load(t.rc, audiencePool, undefined).then((r) => r.data),
    load(t.rc, listsReader, undefined),
  ]);
  const cal = pool.calendar.state;
  const kept = saved.data.lists;
  const lookup = savedListLookup(kept);
  // A rule that reads another list names it as the rail does: a People list by its label, one of the workspace's by
  // its name.
  const listName = (token: string): string | null => {
    const ref = parseListToken(token);
    if (!ref) return null;
    return ref.kind === "builtin"
      ? (PEOPLE_LISTS.find((l) => l.id === ref.id)?.label ?? null)
      : (kept.find((l) => l.id === ref.id)?.name ?? null);
  };
  // People's lists as the rail offers them: the outcome lists only when there is a calendar to read, the consultations
  // only with a consult-first service, the deal lists only where deals are on.
  const offered = PEOPLE_LISTS.filter(
    (l) =>
      (!l.needsCalendar || cal === "ok") &&
      (!l.needsConsultFirst || pool.consult_first) &&
      (!l.needsDeals || pool.deals_on),
  );
  for (const l of offered) noteRow(t, "list", l.id, l.label, `clients/${listToken({ kind: "builtin", id: l.id })}`);
  const live = kept.filter((l) => !l.archived_at);
  // The workspace's own lists are the lists reader's rows, opened on People at each.
  const liveIds = new Set(live.map((l) => l.id));
  noteRows(
    t.read,
    saved.rows.filter((r) => liveIds.has(r.id)),
  );
  return {
    route: "clients",
    lists: offered.map((l) => ({
      list: listToken({ kind: "builtin", id: l.id }),
      label: l.label,
      holds: l.tip,
      count: pool.rows.filter(l.test).length,
    })),
    cannot_count: PEOPLE_LISTS.flatMap((l) => {
      const need = unmetNeed(ruleNeeds(l.rule), pool.listCtx);
      return need ? [{ label: l.label, why: listUnknownWords(need, cal) }] : [];
    }),
    own: live.map((l) => {
      const m = listMembers(l, pool.rows, pool.listCtx, lookup);
      const rule = l.rule == null ? null : asListRule(l.rule);
      return {
        list: listToken({ kind: "saved", id: l.id }),
        name: l.name,
        kept: l.rule == null ? "by hand" : "by its rule",
        rule: rule ? listRuleParts(rule, listName).join(" · ") : null,
        ...(m.state === "ok" ? { count: m.ids.size } : { cannot_count: listUnknownWords(m.reason, cal) }),
      };
    }),
    archived: kept.filter((l) => !!l.archived_at).map((l) => l.name),
  };
}

/**
 * Where deals stand, as the Pipeline builds its board (readers/people.ts dealBoard, which Ask's Pipeline context reads
 * too): the line over the table, the workspace's pace, and each group with its count, what it comes to and its people,
 * each with the deal's service, value, how long it has stood there, the chip the page draws and their next step.
 * Where deals are off the Pipeline draws People, and this says so.
 */
async function readPipeline(t: ToolContext): Promise<unknown> {
  const read = await load(t.rc, dealBoard, undefined);
  const board = read.data.board;
  if (!board)
    return {
      route: "clients/pipeline",
      deals_on: false,
      note: "Deals are off in this workspace: the Pipeline shows People, which people with action search reads.",
    };
  let room = PIPELINE_CAP;
  const groups = board.groups.map((g) => {
    const rows = g.rows.slice(0, Math.max(0, room));
    room -= rows.length;
    return {
      group: g.label,
      count: g.count,
      comes_to: g.meta,
      people: rows.map((row) => ({
        contact_id: row.id,
        deal_id: row.person.deal?.id ?? null,
        route: `clients/${row.id}`,
        name: row.name,
        service: row.service,
        value: row.value,
        in_stage: row.inStage || null,
        chip: row.chip?.words ?? null,
        next_step: row.next ? `${row.next.words} · ${row.next.when}` : null,
      })),
    };
  });
  // The people it says, and their deals, are rows an answer may cite, each opened on the person's page.
  const said = new Set(groups.flatMap((g) => g.people.flatMap((p) => [p.contact_id, p.deal_id ?? ""])));
  noteRows(
    t.read,
    read.rows.filter((r) => said.has(r.id)),
  );
  return {
    route: "clients/pipeline",
    deals_on: true,
    summary: board.summary.join(" · "),
    pace: board.pace?.words ?? null,
    groups,
  };
}

/**
 * People (D11): finding them (search, once search_people) and one person's profile (get, once get_person); since Phase
 * 4, People's lists (lists) and the Pipeline (pipeline), each as its page builds it.
 */
export const peopleTool = defineActions({
  name: "people",
  // The lists are named from the one table of them (contracts lists.ts), never typed beside it.
  description: "People, the customers and callers, as the People page, a person's page and the Pipeline read them.",
  actions: {
    search: readAction({
      input: z.object({ query: z.string(), list: z.string().optional() }),
      examples: [
        { query: "Rosa" },
        { query: "", list: "quiet" },
        { query: "", list: "list:6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b" },
      ],
      label: "Looking through People",
      words: `Action search takes query and an optional list and finds people by name, WhatsApp name, address or three or more digits of a phone number, as the People page searches them; each row says their state in the pages' words, their last contact and last message, their conversation id, channels, consent, receptionist mode, how many calls, their next and last appointment when the calendar is connected, and their next step when they have one. An empty query lists the most recent people; list narrows to one list, given as the token campaigns with action audiences gives (seg:<id> for People's lists, list:<id> for the workspace's own) or as a People list's bare id: ${BUILTIN_LISTS.map((l) => `${l.id} (${l.label})`).join(", ")}. Call it to find someone, or to see who is on a list; it returns at most ${ASK_CAPS.people} people, with matches counted before the cap, and a list that cannot be counted here says why.`,
      run: searchPeople,
    }),
    get: readAction({
      input: z.object({ contact_id: z.string() }),
      examples: [{ contact_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" }],
      label: "Reading the profile",
      words:
        "Action get takes contact_id, the id a row here, inbox with action thread, calls with action get or calendar with action week returned, and reads one person's profile as their page reads it: right now, the facts on file, what is known about them, their receptionist mode, their last exchange, their open conversation, their conversations and calls with ids, their timeline, and the team's notes (a note the receptionist suggested is marked so, and is not the team's). Call it when the profile, the timeline or the notes are needed and the page on screen holds only their row; it returns their five newest conversations and calls, twenty timeline entries and twenty notes, and a person the workspace does not hold is an error, said in words.",
      run: getPerson,
    }),
    lists: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading the lists",
      words:
        "Action lists takes nothing more and reads every list People's rail shows: People's own lists this workspace can count, each with its token (the list action search takes), what it holds and how many are on it; the ones it cannot count here, with why; and the workspace's own lists, kept by hand or by a rule, each with its rule in the page's words and its count or why it cannot be counted, and the archived ones by name. Call it to say which lists there are and how many are on each, and action search with a list's token for who is on it. It counts over everyone in People, as a send counts them.",
      run: listLists,
    }),
    pipeline: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading the Pipeline",
      words: `Action pipeline takes nothing more and reads the Pipeline as its page builds it, where deals are on: the line over the table (the proposals out and what they come to, the ones waiting longer than usual, the lapsed, the clients and what they come to), the workspace's pace, and each group (consultations, proposals out, clients, passed or ended) with its count, what it comes to and its people, each with the deal's id, service and value, how long it has stood there, the page's chip and their next step. Call it for where deals stand, and action get for one person's deal in full. It returns at most ${PIPELINE_CAP} people across the groups, the groups' counts whole; where deals are off it says so, and People holds everyone.`,
      run: readPipeline,
    }),
  },
});
