import "server-only";
import { z } from "zod";
import {
  ASK_CAPS,
  BUILTIN_LISTS,
  ago,
  nextStepOf,
  parseListToken,
  personName,
  poolRowOf,
  toPersonVM,
  type PersonRowDto,
  type PersonRowVM,
  visitLine,
} from "@chanlytics/contracts";
import { poolList, type AudiencePool } from "../../../people/audience";
import { load } from "../../../readers";
import { audiencePool } from "../../../readers/audience-pool";
import { lists as listsReader } from "../../../readers/lists";
import { people } from "../../../readers/people";
import { person } from "../../../readers/person";
import { UUID, defineRead, str, unlessNotFound, type ToolContext } from "../context";

function stepLine(r: PersonRowDto, tz: string, nowMs: number): string | null {
  const s = nextStepOf(r, tz, nowMs);
  return s ? `${s.words} · ${s.day.words}` : null;
}

/** A person as search_people says them: the People row's facts, and where they stand in the row's own words (`vm`). */
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
  // Any list, one way (decision 0009): a token list_audiences gave, or a People list's bare id.
  const ref = listIn
    ? (parseListToken(listIn) ?? parseListToken(`list:${listIn}`) ?? parseListToken(`seg:${listIn}`))
    : null;
  if (listIn && !ref) return { error: "list must be a list token from list_audiences, or a People list's id" };
  // A list is counted over the audience pool (readers/audience-pool.ts, once a turn), everyone with their appointments,
  // as the People rail and the send count one (audience.ts poolList) -- never over one page. One of the workspace's own
  // is counted from the lists the turn holds (readers/lists.ts, as list_audiences read them), never read again. One
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
    if (!found) return { error: "no such list; list_audiences names them", people: [] };
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
    t.read.person.add(r.id);
    if (r.latest_conversation_id) t.read.thread.add(r.latest_conversation_id);
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
  t.read.person.add(id);
  for (const c of detail.conversations) {
    t.read.thread.add(c.id);
    t.read.conversation.add(c.id);
  }
  for (const c of detail.calls) t.read.call.add(c.id);
  return {
    contact_id: id,
    route: `clients/${id}`,
    name: vm.name,
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

export const search_people = defineRead({
  name: "search_people",
  // The lists are named from the one table of them (contracts lists.ts), never typed beside it.
  description: `Find people (customers and callers) by name, WhatsApp name, address or the last digits of a phone number, as the People page searches them. Each row says their state in the pages' words, their last contact and last message, their conversation id, channels, consent, receptionist mode, how many calls, their next and last appointment when the calendar is connected, and their next step when they have one. An empty query lists the most recent people; list narrows to one list, given as the token list_audiences gives (seg:<id> for People's lists, list:<id> for the workspace's own) or as a People list's bare id: ${BUILTIN_LISTS.map((l) => `${l.id} (${l.label})`).join(", ")}. Call it to find someone, or to see who is on a list; call get_person instead for one person's whole profile, timeline and notes, with the contact_id a row here gives. It returns at most ${ASK_CAPS.people} people, with matches counted before the cap; a list that cannot be counted here says why.`,
  input: z.object({ query: z.string(), list: z.string().optional() }),
  examples: [
    { query: "Rosa" },
    { query: "", list: "quiet" },
    { query: "", list: "list:6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b" },
  ],
  label: "Looking through People",
  run: searchPeople,
});

export const get_person = defineRead({
  name: "get_person",
  description:
    "One person's profile as their page reads it: right now, the facts on file, what is known about them, their receptionist mode, their last exchange, their open conversation, their conversations and calls with ids, their timeline, and the team's notes (a note the receptionist suggested is marked so, and is not the team's). Call it when the profile, the timeline or the notes are needed and the page on screen holds only their row; search_people is the sibling that finds people and lists them with their state. contact_id is the id search_people, get_thread, get_call or get_calendar returned. It returns their five newest conversations and calls, twenty timeline entries and twenty notes; a person the workspace does not hold is an error, said in words.",
  input: z.object({ contact_id: z.string() }),
  label: "Reading the profile",
  run: getPerson,
});
