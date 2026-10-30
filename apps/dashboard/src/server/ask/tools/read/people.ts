import "server-only";
import { z } from "zod";
import {
  ASK_CAPS,
  BUILTIN_LISTS,
  LIST_CONDITIONS_JSON_SCHEMA,
  cameFromOf,
  PEOPLE_LISTS,
  asListRule,
  listMembers,
  listNamer,
  listRuleParts,
  listToken,
  listUnknownWords,
  nextStepOf,
  noteRows,
  parseListToken,
  personName,
  poolRowOf,
  ruleNeeds,
  ruleUndated,
  savedListLookup,
  toPersonVM,
  unmetNeed,
  type ListRule,
  type PersonRowDto,
  type PersonRowVM,
  type VisitDto,
  visitDateKey,
  visitLine,
  visitRoute,
  callEndedWords,
  toInboxThreadVM,
  pipelineWorth,
} from "@chanlytics/contracts";
import { poolList, type AudiencePool } from "../../../people/audience";
import { load } from "../../../readers";
import { audiencePool } from "../../../readers/audience-pool";
import * as facts from "../../../readers/facts";
import { lists as listsReader } from "../../../readers/lists";
import { dealBoard, people } from "../../../readers/people";
import { lead as leadReader } from "../../../readers/leads";
import { person } from "../../../readers/person";
import { threadState } from "../../thread-state";
import {
  AUDIENCES_CALL,
  UUID,
  unread,
  defineActions,
  noteRow,
  readAction,
  str,
  unlessNotFound,
  type ToolContext,
} from "../context";

/**
 * A person's next or last visit as a row an answer may cite (kind visit, by the record's row, VisitDto.record_id), noted
 * where the Calendar opens it, on its day: its id, or null where the record has not kept a row for it (its words alone).
 */
function visitRow(t: ToolContext, v: VisitDto | null | undefined, tz: string, who: string): string | null {
  if (!v?.record_id) return null;
  noteRow(t, "visit", v.record_id, `${who} · ${v.title}`, visitRoute(v.record_id, visitDateKey(v.start, tz)));
  return v.record_id;
}

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
    // Their last contact as the row says it: who, and how long ago (contracts lastContactOf, "Phoned · 2h ago"). It read
    // the last message first, so one who wrote last week and phoned this morning was "6d ago" here and "2h ago" on People
    // and on their profile (the wiring's second audit, R13 X5-3).
    last_contact: vm.lastContact.label,
    last_message: r.last_inbound_text ? r.last_inbound_text.slice(0, 120) : null,
    conversation_id: r.latest_conversation_id,
    channels: r.channels ?? [],
    // Both answers, as People's columns and the profile say them: a yes to messages about their visits is not a yes to
    // offers, and one raw word read as both (R13 X5-3). Offers by email where the row says it.
    consent: {
      messages: vm.consent.answerLabel,
      offers: vm.consent.marketingLabel,
      ...(vm.consent.emailOffersLabel ? { offers_by_email: vm.consent.emailOffersLabel } : {}),
    },
    receptionist_mode: r.effective_reply_mode ?? null,
    calls: r.call_count ?? 0,
    next_visit: r.visits?.next
      ? `${visitLine(r.visits.next, r.visits.timezone, nowMs)} · ${r.visits.next.title}`
      : null,
    next_visit_id: r.visits?.next?.record_id ?? null,
    // Their earliest open step (0007, amended), its day as the pages say it: "Send the quote · Due Fri".
    next_step: stepLine(r, tz, nowMs),
    last_visit: r.visits?.last
      ? `${visitLine(r.visits.last, r.visits.timezone, nowMs)} · ${r.visits.last.title}`
      : null,
    last_visit_id: r.visits?.last?.record_id ?? null,
  };
}

/** Whom a rule leaves out for want of a date, by the chip that holds them ("Never heard from"). */
type NotOnRecord = { condition: string; ids: Set<string> }[];

/**
 * Whom a rule left out for want of a date, among `on` where only some of the pool are asked about (a list, a query), as
 * the model is told it: each chip and how many it holds; null where there is none.
 */
export function notOnRecordOf(left: NotOnRecord, on: (id: string) => boolean = () => true) {
  const said = left.flatMap((u) => {
    const people = [...u.ids].filter(on).length;
    return people > 0 ? [{ condition: u.condition, people }] : [];
  });
  return said.length > 0 ? said : null;
}

/**
 * Who a rule in the lists' vocabulary holds today, over the audience pool (everyone, as a send counts them): the ids, or
 * why it cannot be counted here, in the rail's words. The one way a search by condition and a selection by rule are
 * answered (the operator, 15 Oct 2026), so "said yes to offers and no visit in 90 days" is one shape everywhere. Beside
 * them, whom each "more than N days" condition leaves out for having no such date (contracts ruleUndated): asked who had
 * not written in six months, Ask said nobody, of 76 people never heard from.
 */
export async function ruleMembers(
  t: ToolContext,
  all: unknown[],
): Promise<{ ids: Set<string>; pool: AudiencePool; rule: ListRule; notOnRecord: NotOnRecord } | { error: string }> {
  const rule = asListRule({ all: withoutNullsDeep(all) });
  if (!rule)
    return {
      error:
        "all is not a rule the list vocabulary reads: one to twelve conditions, each one fact with only the keys its field takes, or { any: [two to six facts] }",
    };
  const pool = (await load(t.rc, audiencePool, undefined)).data;
  const lookup = savedListLookup((await load(t.rc, listsReader, undefined)).data.lists);
  const on = listMembers({ ids: [], rule }, pool.rows, pool.listCtx, lookup);
  if (on.state !== "ok") return { error: listUnknownWords(on.reason, pool.calendar.state) };
  const notOnRecord = ruleUndated(rule).flatMap((u) => {
    const left = listMembers({ ids: [], rule: u.rule }, pool.rows, pool.listCtx, lookup);
    return left.state === "ok" ? [{ condition: u.words, ids: left.ids }] : [];
  });
  return { ids: on.ids, pool, rule, notOnRecord };
}

/** A value with every key the model wrote as null left out, all the way down (the flat schema shows every key). */
const withoutNullsDeep = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(withoutNullsDeep)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, x]) => x !== null)
            .map(([k, x]) => [k, withoutNullsDeep(x)]),
        )
      : v;

/**
 * A list's members as the People rail counts them, over the audience pool once a turn; one of the workspace's own
 * counted from the lists the turn holds. A list that cannot be counted here says why, in the page's words.
 */
async function listMembersOf(
  t: ToolContext,
  ref: NonNullable<ReturnType<typeof parseListToken>>,
): Promise<{ pool: AudiencePool; ids: Set<string> } | { error: string }> {
  const [held, kept] = await Promise.all([
    load(t.rc, audiencePool, undefined).then((r) => r.data),
    ref.kind === "saved" ? load(t.rc, listsReader, undefined).then((r) => r.data.lists) : undefined,
  ]);
  const found = await poolList(t.ctx, t.tenantId, held, ref, kept);
  if (!found) return { error: `no such list; ${AUDIENCES_CALL} names them` };
  if ("unknown" in found) return { error: `${found.label}: ${found.unknown}` };
  return { pool: held, ids: new Set(found.memberIds) };
}

async function searchPeople(
  t: ToolContext,
  input: { query?: string; list?: string; all?: unknown[] },
): Promise<unknown> {
  // The query as the People page's search sends it (contacts/route.ts): trimmed, eighty characters at most.
  const q = str(input.query, 80);
  const listIn = str(input.list, 60);
  // Any list, one way (decision 0009): a token sequences.lists gave, or a People list's bare id.
  const ref = listIn
    ? (parseListToken(listIn) ?? parseListToken(`list:${listIn}`) ?? parseListToken(`seg:${listIn}`))
    : null;
  if (listIn && !ref) return { error: `list must be a list token from ${AUDIENCES_CALL}, or a People list's id` };
  // A list is counted over the audience pool (readers/audience-pool.ts, once a turn), everyone with their appointments,
  // as the People rail and the send count one (audience.ts poolList) -- never over one page. One of the workspace's own
  // is counted from the lists the turn holds (readers/lists.ts, as sequences.lists read them), never read again. One
  // that can't be counted here says why, in the page's words, and names the condition that failed.
  let pool: AudiencePool | null = null;
  let members: Set<string> | null = null;
  // Whom the conditions leave out for want of a date, and who of them the list and the words keep in view.
  let left: NotOnRecord = [];
  let inView = (_id: string) => true;
  // Conditions in the lists' vocabulary (all): who they hold today, crossed with a list where one is named too.
  if (input.all && input.all.length) {
    const held = await ruleMembers(t, input.all);
    if ("error" in held) return { error: held.error, people: [] };
    pool = held.pool;
    members = held.ids;
    left = held.notOnRecord;
  }
  if (ref) {
    const listed = await listMembersOf(t, ref);
    if ("error" in listed) return { error: listed.error, people: [] };
    pool = listed.pool;
    members = members ? new Set([...members].filter((id) => listed.ids.has(id))) : listed.ids;
    inView = (id) => listed.ids.has(id);
  }
  const on = members;
  const viewer = t.ctx.userId ?? null;
  let hits: PersonRowDto[];
  let matches: number;
  let rowOf: (r: PersonRowDto) => PersonRowVM;
  if (pool && on && !q) {
    // A list or a rule and no words: its members, in the pool's order, each with the pool's own People row.
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
    const listed = inView;
    const named = new Set(page.people.map((r) => r.id));
    inView = (id) => listed(id) && named.has(id);
    // Each person said, as the People page builds their row (legacy-bridge/surface-data.ts personRowOf): for the member
    // asking, and their reach judged against what the workspace sends on (the turn's own read: a search page carries
    // none) -- built for the rows said alone, never the whole page.
    const ready = (await load(t.rc, facts.channelsReady, undefined)).data;
    rowOf = (r) => poolRowOf(r, { tz: t.timezone, now: t.now, viewer, ready });
  }
  const picked = hits.slice(0, ASK_CAPS.people);
  for (const r of picked) {
    noteRow(t, "person", r.id, personName(r), `clients/${r.id}`);
    const th = r.latest_conversation_id;
    if (th) noteRow(t, "thread", th, personName(r), `inbox/th-${th}`);
    const tz = r.visits?.timezone ?? t.timezone;
    visitRow(t, r.visits?.next, tz, personName(r));
    visitRow(t, r.visits?.last, tz, personName(r));
  }
  const unrecorded = notOnRecordOf(left, inView);
  return {
    query: q,
    // A People list by its id, as it was asked for; one of the workspace's own by its token.
    list: ref ? (ref.kind === "builtin" ? ref.id : `list:${ref.id}`) : null,
    ...(input.all && input.all.length ? { by_rule: true } : {}),
    // Counted before the cap: everyone the query matches, as the page counts them; on a list, who is on it.
    matches,
    // Who meets the rest of the conditions but has no date for one over N days: never heard from is not quiet (the
    // Quiet list's rule), so they are not matches, and they are said apart, never as nobody or as not in People.
    ...(unrecorded ? { not_on_record: unrecorded } : {}),
    people: picked.map((r) => personLine(r, rowOf(r), t.timezone, t.now.getTime())),
  };
}

async function getPerson(t: ToolContext, input: { contact_id: string }): Promise<unknown> {
  const id = str(input.contact_id);
  if (!UUID.test(id)) return { error: "contact_id must be an id a tool returned" };
  // The person as their page reads them (readers/person.ts): the profile's one round of reads, once a turn, the
  // workspace's config shared with the rest of it; a person this workspace does not hold is the reader's
  // 404. Then the page's own view model, for the member asking, as the profile builds it
  // (surfaces/people/people-detail.ts): the facts, the timeline and the notes are the page's (ledger #3).
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
      // Each thread's state as the Inbox says it (thread-state.ts over the thread's own view model), and each call's end as
      // Conversations and the History say it (contracts callEndedWords): "needs_human" for a thread a teammate holds and
      // "not_connected" for a call that did not connect were the stored words (R13 X5-7).
      .map((c) => ({
        conversation_id: c.id,
        route: `inbox/th-${c.id}`,
        state: threadState(toInboxThreadVM(c, null, t.timezone, t.now)),
        last_at: c.last_message_at,
      })),
    // Their next and last visits as rows an answer may cite (kind visit); null where the record keeps none. The visits' words
    // are in the facts and the timeline.
    next_visit_id: visitRow(t, detail.visits?.next, detail.visits?.timezone ?? t.timezone, vm.name),
    last_visit_id: visitRow(t, detail.visits?.last, detail.visits?.timezone ?? t.timezone, vm.name),
    calls: detail.calls.slice(0, 5).map((c) => ({
      call_id: c.id,
      route: `conversations/cv-${c.id}`,
      at: c.started_at,
      status: callEndedWords(c, t.now),
    })),
    timeline: vm.timeline
      .slice(0, 20)
      // A message that never reached them says so (`not_sent`), so Ask does not tell it as something they heard.
      .map((i) => ({
        day: i.day,
        time: i.time,
        kind: i.kind,
        who: i.who,
        text: i.text.slice(0, 240),
        ...(i.unsent && i.sub ? { not_sent: i.sub } : {}),
      })),
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

/** How many of a group's lead-found people a winners read opens, to say what kind of business they were. */
const WINNERS_LEADS_CAP = 25;
/** How many values of a trait a winners read says, the most common first. */
const TRAIT_TOP = 5;

/** A trait's values over a set of people, the most common first, each with its count and its share of them. */
function traitOf<R>(rows: readonly R[], valueOf: (r: R) => string[] | string | null) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = valueOf(r);
    for (const x of Array.isArray(v) ? v : v ? [v] : []) counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TRAIT_TOP)
    .map(([value, n]) => ({ value, n, share: rows.length ? `${Math.round((100 * n) / rows.length)}%` : null }));
}

/**
 * Who wins for this business, and what they share (the operator, 15 Oct 2026, D8): the people who paid (a deal of
 * theirs won), who booked (a visit on record, where a calendar is connected) and who said yes to offers, each group
 * counted over everyone in People as a send counts them; then what the winners share against everyone -- how they first
 * came, the channels they use -- and, for those a lead search found, what kind of business they were and where (the
 * lead's own category and city, read for at most WINNERS_LEADS_CAP of them). Counts and shares only, computed here: the
 * model says them, and plans a search for more like them from them.
 */
async function readWinners(t: ToolContext): Promise<unknown> {
  const [pool, kept] = await Promise.all([
    load(t.rc, audiencePool, undefined).then((r) => r.data),
    load(t.rc, listsReader, undefined).then((r) => r.data.lists),
  ]);
  const lookup = savedListLookup(kept);
  const cal = pool.calendar.state;
  // Each group by the lists' own vocabulary, so a winner here is who the matching list on People holds.
  const groupOf = (all: unknown[]) => {
    const rule = asListRule({ all });
    if (!rule) return null;
    const on = listMembers({ ids: [], rule }, pool.rows, pool.listCtx, lookup);
    return on.state === "ok" ? on.ids : null;
  };
  const paid = groupOf([{ field: "deal_stage", op: "is", value: "won" }]);
  const booked = cal === "ok" ? groupOf([{ field: "booked", op: "is", yes: true }]) : null;
  const yes = groupOf([{ field: "said_yes", op: "is", to: "offers", yes: true }]);
  // The winners, in the order D8 weighs them: who paid, else who booked, else who said yes.
  const winnerIds = new Set<string>([...(paid ?? []), ...(booked ?? []), ...(yes ?? [])]);
  const everyone = pool.people;
  const winners = everyone.filter((r) => winnerIds.has(r.id));
  const cameFrom = (r: (typeof everyone)[number]) => cameFromOf(r)?.label ?? null;
  const channels = (r: (typeof everyone)[number]) => r.channels ?? [];
  // The businesses a lead search found among them: what kind, and where, as the lead's own row says it.
  const fromLeads = winners.filter((r) => typeof r.lead_id === "string" && r.lead_id).slice(0, WINNERS_LEADS_CAP);
  const leads = (
    await Promise.all(
      fromLeads.map((r) =>
        unlessNotFound(load(t.rc, leadReader, { id: String(r.lead_id) }))
          .then((x) => x?.data.row ?? null)
          .catch(unread(t, "people.winners", "lead")),
      ),
    )
  ).filter((x): x is NonNullable<typeof x> => x !== null);
  return {
    route: "clients",
    everyone: everyone.length,
    groups: {
      paid: paid ? paid.size : null,
      booked: booked ? booked.size : null,
      ...(cal === "ok" ? {} : { booked_not_counted: "no calendar is connected" }),
      said_yes_to_offers: yes ? yes.size : null,
    },
    winners: winners.length,
    share: {
      came_from: { winners: traitOf(winners, cameFrom), everyone: traitOf(everyone, cameFrom) },
      channels: { winners: traitOf(winners, channels), everyone: traitOf(everyone, channels) },
    },
    from_lead_searches: {
      winners_found_by_a_search: winners.filter((r) => !!r.lead_id).length,
      read: leads.length,
      kind: traitOf(leads, (l) => l.category),
      city: traitOf(leads, (l) => (l.city ? `${l.city}${l.state ? `, ${l.state}` : ""}` : null)),
      with_a_website: leads.filter((l) => !!l.website).length,
      rating_median: (() => {
        const r = leads
          .map((l) => l.rating)
          .filter((x): x is number => typeof x === "number")
          .sort((a, b) => a - b);
        return r.length ? r[Math.floor(r.length / 2)] : null;
      })(),
    },
    note: "Counts over everyone in People. A share is of that group. What the winners share against everyone is what a search for more like them should ask for (propose_lead_search), and what a list of people like them should hold (propose_list).",
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
 * rail's read (readers/lists.ts), once a turn. Ask's plan reads the lists through it too (act/plan.ts).
 */
export async function listLists(t: ToolContext) {
  const [pool, saved] = await Promise.all([
    load(t.rc, audiencePool, undefined).then((r) => r.data),
    load(t.rc, listsReader, undefined),
  ]);
  const cal = pool.calendar.state;
  const kept = saved.data.lists;
  const lookup = savedListLookup(kept);
  // A rule that reads another list names it as the rail does (contracts listNamer).
  const listName = listNamer(kept);
  // People's lists as the rail offers them: the outcome lists only when there is a calendar to read, the consultations
  // only with a consult-first service, the deal lists only where a deal was ever recorded.
  const offered = PEOPLE_LISTS.filter(
    (l) =>
      (!l.needsCalendar || cal === "ok") &&
      (!l.needsConsultFirst || pool.consult_first) &&
      (!l.needsDeals || pool.has_deals),
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
 * each with the deal's service, value, how long it has stood there, the chip the page draws and their next step. What
 * the proposals out and the clients come to is Ask's alone (pipelineWorth: the page says counts only, 21 Oct 2026), the
 * whole group's, so an answer quotes it rather than adding values up. Every workspace has the Pipeline (0008, amended
 * 18 Oct 2026).
 */
async function readPipeline(t: ToolContext): Promise<unknown> {
  const read = await load(t.rc, dealBoard, undefined);
  const board = read.data.board;
  const worth = pipelineWorth(board);
  let room = PIPELINE_CAP;
  const groups = board.groups.map((g) => {
    const rows = g.rows.slice(0, Math.max(0, room));
    room -= rows.length;
    return {
      group: g.label,
      count: g.count,
      comes_to: g.key === "proposals" ? worth.proposals : g.key === "clients" ? worth.clients : g.meta,
      // Each row as the person it is and the deal it stands for (0029: a further deal of theirs is a row of its own).
      people: rows.map((row) => ({
        contact_id: row.person.id,
        deal_id: row.deal?.id ?? null,
        route: `clients/${row.person.id}`,
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
  description:
    "People, the customers and callers, as the People page, a person's page and the Pipeline read them: find people by name or by conditions, a profile, the lists, who wins for this business, and the deals.",
  actions: {
    search: readAction({
      input: z.object({
        query: z
          .string()
          .optional()
          .describe("A name, a WhatsApp name, an address or three or more digits of a number."),
        list: z.string().optional().describe("One list: its token (seg:<id>, list:<id>) or a People list's bare id."),
        all: z
          .array(z.unknown())
          .meta(LIST_CONDITIONS_JSON_SCHEMA)
          .optional()
          .describe("Conditions in the lists' vocabulary, as propose_list takes them: who they hold today."),
      }),
      examples: [
        { query: "Rosa" },
        { list: "quiet" },
        { list: "list:6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b" },
        {
          all: [
            { field: "said_yes", op: "is", to: "offers", yes: true },
            { field: "last_visit", op: "more_than", days: 90 },
          ],
        },
      ],
      label: "Looking through People",
      words: `Action search takes query and an optional list and finds people by name, WhatsApp name, address or three or more digits of a phone number, as the People page searches them; each row says their state in the pages' words, their last contact and last message, their conversation id, channels, consent, receptionist mode, how many calls, their next and last appointment when the calendar is connected, and their next step when they have one. No query lists the most recent people; all finds who conditions hold today, in the lists' vocabulary (who said yes, when they last booked, how they came, a channel, a deal's stage, and the rest propose_list names), counted over everyone; list narrows to one list, given as the token sequences with action lists gives (seg:<id> for People's lists, list:<id> for the workspace's own) or as a People list's bare id: ${BUILTIN_LISTS.map((l) => `${l.id} (${l.label})`).join(", ")}. Call it to find someone, or to see who is on a list; it returns at most ${ASK_CAPS.people} people, with matches counted before the cap, and a list that cannot be counted here says why. A condition over more than N days holds only for someone with that date on record (never heard from is not quiet): not_on_record counts who meets the rest with no such date, by its chip, and is said apart, never as nobody or as not in People.`,
      run: searchPeople,
    }),
    get: readAction({
      input: z.object({ contact_id: z.string() }),
      examples: [{ contact_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" }],
      label: "Reading the profile",
      words:
        "Action get takes contact_id, the id a row here, inbox with action thread, calls with action get or calendar with action week returned, and reads one person's profile as their page reads it: right now, the facts on file, what is known about them, their receptionist mode, their last exchange, their open conversation, their conversations and calls with ids, their next and last appointments' ids, their timeline, and the team's notes (a note the receptionist suggested is marked so, and is not the team's). Call it when the profile, the timeline or the notes are needed and the page on screen holds only their row; it returns their five newest conversations and calls, twenty timeline entries and twenty notes, and a person the workspace does not hold is an error, said in words.",
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
    winners: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading who wins",
      words:
        "Action winners takes nothing more and reads who wins for this business: how many paid (a deal won), booked (a booking on record) and said yes to offers, then what the winners share against everyone (how they first came, their channels) and, for those a lead search found, what kind of business they were, where, and how they rate. Call it before planning a search for more customers like the best ones, or a list of people like them.",
      run: readWinners,
    }),
    pipeline: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading the Pipeline",
      words: `Action pipeline takes nothing more and reads the Pipeline as its page builds it: the line over the table (the proposals out, the ones waiting longer than usual, the lapsed, the clients), the workspace's pace, and each group (consultations, proposals out, clients, passed or ended) with its count, what it comes to (the proposals out's and the clients' whole sums, which the page does not show: quote them, never add values up) and its people, each with the deal's id, service and value, how long it has stood there, the page's chip and their next step. Call it for where deals stand, and action get for one person's deal in full. It returns at most ${PIPELINE_CAP} people across the groups, the groups' counts whole; a workspace that never recorded a deal has every group empty.`,
      run: readPipeline,
    }),
  },
});
