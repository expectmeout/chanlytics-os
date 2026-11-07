/** People: rule members. */

import "server-only";
import {
  ASK_CAPS,
  asListRule,
  listMembers,
  listUnknownWords,
  nextStepOf,
  parseListToken,
  personName,
  poolRowOf,
  ruleUndated,
  savedListLookup,
  type ListRule,
  type PersonRowDto,
  type PersonRowVM,
  type VisitDto,
  visitDateKey,
  visitLine,
  visitRoute,
} from "@chanlytics/contracts";
import { findPoolList, type AudiencePool } from "../../../../campaigns/audience";
import { load } from "../../../../shared/reader";
import { audiencePool } from "../../../../readers/audience-pool";
import * as facts from "../../../../readers/facts";
import { lists as listsReader } from "../../../../readers/lists";
import { people } from "../../../../readers/people";
import { AUDIENCES_CALL, noteRow, str } from "../../context/tool-reads";
import type { ToolContext } from "../../context/tool-defs";
import { nullsLeftOut } from "@/server/ask/tools/context/tool-reads";

/**
 * A person's next or last visit as a row an answer may cite (kind visit, by the record's row, VisitDto.record_id), noted
 * where the Calendar opens it, on its day: its id, or null where the record has not kept a row for it (its words alone).
 */
export function visitRow(
  t: ToolContext,
  v: VisitDto | null | undefined,
  tz: string,
  personName: string,
): string | null {
  if (!v?.record_id) return null;
  noteRow(t, "visit", v.record_id, `${personName} · ${v.title}`, visitRoute(v.record_id, visitDateKey(v.start, tz)));
  return v.record_id;
}

function stepLine(r: PersonRowDto, tz: string, nowMs: number): string | null {
  const s = nextStepOf(r, tz, nowMs);
  return s ? `${s.words} · ${s.day.words}` : null;
}

/** A person as people.search says them: the People row's facts, and where they stand in the row's own words (`vm`). */
function personLine(person: PersonRowDto, vm: PersonRowVM, tz: string, nowMs: number) {
  return {
    contact_id: person.id,
    route: `clients/${person.id}`,
    name: personName(person),
    // Where they stand as the People row says it (ledger #7): one of the seven states (contracts personStateFor, for
    // the member asking), and the line the row draws beside it, when it draws one.
    state: vm.stateLabel,
    state_detail: vm.stateDetail || null,
    // Their last contact as the row says it: who, and how long ago (contracts lastContactOf, "Phoned · 2h ago"). It read
    // the last message first, so one who wrote last week and phoned this morning was "6d ago" here and "2h ago" on People
    // and on their profile (the wiring's second audit, R13 X5-3).
    last_contact: vm.lastContact.label,
    last_message: person.last_inbound_text ? person.last_inbound_text.slice(0, 120) : null,
    conversation_id: person.latest_conversation_id,
    channels: person.channels ?? [],
    // Both answers, as People's columns and the profile say them: a yes to messages about their visits is not a yes to
    // offers, and one raw word read as both (R13 X5-3). Offers by email where the row says it.
    consent: {
      messages: vm.consent.answerLabel,
      offers: vm.consent.marketingLabel,
      ...(vm.consent.emailOffersLabel ? { offers_by_email: vm.consent.emailOffersLabel } : {}),
    },
    receptionist_mode: person.effective_reply_mode ?? null,
    calls: person.call_count ?? 0,
    next_visit: person.visits?.next
      ? `${visitLine(person.visits.next, person.visits.timezone, nowMs)} · ${person.visits.next.title}`
      : null,
    next_visit_id: person.visits?.next?.record_id ?? null,
    // Their earliest open step (0007, amended), its day as the pages say it: "Send the quote · Due Fri".
    next_step: stepLine(person, tz, nowMs),
    last_visit: person.visits?.last
      ? `${visitLine(person.visits.last, person.visits.timezone, nowMs)} · ${person.visits.last.title}`
      : null,
    last_visit_id: person.visits?.last?.record_id ?? null,
  };
}

/** Whom a rule leaves out for want of a date, by the chip that holds them ("Never heard from"). */
type NotOnRecord = { condition: string; ids: Set<string> }[];

/**
 * Whom a rule left out for want of a date, among `on` where only some of the pool are asked about (a list, a query), as
 * the model is told it: each chip and how many it holds; null where there is none.
 */
export function notOnRecordOf(left: NotOnRecord, on: (id: string) => boolean = () => true) {
  const sentence = left.flatMap((u) => {
    const people = [...u.ids].filter(on).length;
    return people > 0 ? [{ condition: u.condition, people }] : [];
  });
  return sentence.length > 0 ? sentence : null;
}

/**
 * Who a rule in the lists' vocabulary holds today, over the audience pool (everyone, as a send counts them): the ids, or
 * why it cannot be counted here, in the rail's words. The one way a search by condition and a selection by rule are
 * answered (the operator, 15 Oct 2026), so "said yes to offers and no visit in 90 days" is one shape everywhere. Beside
 * them, whom each "more than N days" condition leaves out for having no such date (contracts ruleUndated): asked who had
 * not written in six months, Ask said nobody, of 76 people never heard from.
 */
export async function getRuleMembers(
  toolContext: ToolContext,
  all: unknown[],
): Promise<{ ids: Set<string>; pool: AudiencePool; rule: ListRule; notOnRecord: NotOnRecord } | { error: string }> {
  const rule = asListRule({ all: nullsLeftOut(all) });
  if (!rule)
    return {
      error:
        "all is not a rule the list vocabulary reads: one to twelve conditions, each one fact with only the keys its field takes, or { any: [two to six facts] }",
    };
  const pool = (await load(toolContext.rc, audiencePool, undefined)).data;
  const lookup = savedListLookup((await load(toolContext.rc, listsReader, undefined)).data.lists);
  const on = listMembers({ ids: [], rule }, pool.rows, pool.listCtx, lookup);
  if (on.state !== "ok") return { error: listUnknownWords(on.reason, pool.calendar.state) };
  const notOnRecord = ruleUndated(rule).flatMap((u) => {
    const left = listMembers({ ids: [], rule: u.rule }, pool.rows, pool.listCtx, lookup);
    return left.state === "ok" ? [{ condition: u.words, ids: left.ids }] : [];
  });
  return { ids: on.ids, pool, rule, notOnRecord };
}

/**
 * A list's members as the People rail counts them, over the audience pool once a turn; one of the workspace's own
 * counted from the lists the turn holds. A list that cannot be counted here says why, in the page's words.
 */
async function listMembersOf(
  toolContext: ToolContext,
  ref: NonNullable<ReturnType<typeof parseListToken>>,
): Promise<{ pool: AudiencePool; ids: Set<string> } | { error: string }> {
  const [held, kept] = await Promise.all([
    load(toolContext.rc, audiencePool, undefined).then((r) => r.data),
    ref.kind === "saved" ? load(toolContext.rc, listsReader, undefined).then((r) => r.data.lists) : undefined,
  ]);
  const found = await findPoolList(toolContext.ctx, toolContext.tenantId, held, ref, kept);
  if (!found) return { error: `no such list; ${AUDIENCES_CALL} names them` };
  if ("unknown" in found) return { error: `${found.label}: ${found.unknown}` };
  return { pool: held, ids: new Set(found.memberIds) };
}

export async function searchPeople(
  toolContext: ToolContext,
  input: { query?: string; list?: string; all?: unknown[] },
): Promise<unknown> {
  // The query as the People page's search sends it (contacts/route.ts): trimmed, eighty characters at most.
  const text = str(input.query, 80);
  const listIn = str(input.list, 60);
  // Any list, one way (decision 0009): a token sequences.lists gave, or a People list's bare id.
  const ref = listIn
    ? (parseListToken(listIn) ?? parseListToken(`list:${listIn}`) ?? parseListToken(`seg:${listIn}`))
    : null;
  if (listIn && !ref) return { error: `list must be a list token from ${AUDIENCES_CALL}, or a People list's id` };
  // A list is counted over the audience pool (readers/audience-pool.ts, once a turn), everyone with their appointments,
  // as the People rail and the send count one (audience.ts findPoolList) -- never over one page. One of the workspace's own
  // is counted from the lists the turn holds (readers/lists.ts, as sequences.lists read them), never read again. One
  // that can't be counted here says why, in the page's words, and names the condition that failed.
  let pool: AudiencePool | null = null;
  let members: Set<string> | null = null;
  // Whom the conditions leave out for want of a date, and who of them the list and the words keep in view.
  let left: NotOnRecord = [];
  let inView = (_id: string) => true;
  // Conditions in the lists' vocabulary (all): who they hold today, crossed with a list where one is named too.
  if (input.all && input.all.length) {
    const held = await getRuleMembers(toolContext, input.all);
    if ("error" in held) return { error: held.error, people: [] };
    pool = held.pool;
    members = held.ids;
    left = held.notOnRecord;
  }
  if (ref) {
    const listed = await listMembersOf(toolContext, ref);
    if ("error" in listed) return { error: listed.error, people: [] };
    pool = listed.pool;
    members = members ? new Set([...members].filter((id) => listed.ids.has(id))) : listed.ids;
    inView = (id) => listed.ids.has(id);
  }
  const on = members;
  const viewer = toolContext.ctx.userId ?? null;
  let hits: PersonRowDto[];
  let matches: number;
  let rowOf: (r: PersonRowDto) => PersonRowVM;
  if (pool && on && !text) {
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
    const page = (await load(toolContext.rc, people, { q: text || null, offset: 0 })).data;
    hits = on ? page.people.filter((r) => on.has(r.id)) : page.people;
    matches = on ? hits.length : page.page.total;
    const listed = inView;
    const named = new Set(page.people.map((r) => r.id));
    inView = (id) => listed(id) && named.has(id);
    // Each person said, as the People page builds their row (bridge/surface-data.ts personRowOf): for the member
    // asking, and their reach judged against what the workspace sends on (the turn's own read: a search page carries
    // none) -- built for the rows said alone, never the whole page.
    const ready = (await load(toolContext.rc, facts.channelsReady, undefined)).data;
    rowOf = (r) => poolRowOf(r, { tz: toolContext.timezone, now: toolContext.now, viewer, ready });
  }
  const picked = hits.slice(0, ASK_CAPS.people);
  for (const r of picked) {
    noteRow(toolContext, "person", r.id, personName(r), `clients/${r.id}`);
    const th = r.latest_conversation_id;
    if (th) noteRow(toolContext, "thread", th, personName(r), `inbox/th-${th}`);
    const tz = r.visits?.timezone ?? toolContext.timezone;
    visitRow(toolContext, r.visits?.next, tz, personName(r));
    visitRow(toolContext, r.visits?.last, tz, personName(r));
  }
  const unrecorded = notOnRecordOf(left, inView);
  return {
    query: text,
    // A People list by its id, as it was asked for; one of the workspace's own by its token.
    list: ref ? (ref.kind === "builtin" ? ref.id : `list:${ref.id}`) : null,
    ...(input.all && input.all.length ? { by_rule: true } : {}),
    // Counted before the cap: everyone the query matches, as the page counts them; on a list, who is on it.
    matches,
    // Who meets the rest of the conditions but has no date for one over N days: never heard from is not quiet (the
    // Quiet list's rule), so they are not matches, and they are said apart, never as nobody or as not in People.
    ...(unrecorded ? { not_on_record: unrecorded } : {}),
    people: picked.map((r) => personLine(r, rowOf(r), toolContext.timezone, toolContext.now.getTime())),
  };
}
