import "server-only";
import {
  AppError,
  ASK_CAPS,
  EVERYONE_LABEL,
  NO_NUMBER_REACH,
  BUILTIN_LISTS,
  nextStepOf,
  listToken,
  listUnknownWords,
  listsFor,
  playbookListRef,
  membersOf,
  parseListToken,
  audiencePreview,
  type AudienceKind,
  numberHealth,
  ESCALATION_REASON_LABELS,
  LEAD_ENDING_WORDS,
  PERSON_STATE_LABELS,
  REPORT_RANGES,
  dealsAreOn,
  ago,
  clockStamp,
  emptyReadSet,
  messageText,
  parseTenantConfig,
  personName,
  replyWhy,
  toCallVM,
  abandonedCall,
  toInboxThreadVM,
  toPersonVM,
  toReportVM,
  toTodayVM,
  PLAYBOOK_TRIGGERS,
  dealPaceOf,
  policyClassOffered,
  triggerOffered,
  dayInZone,
  isDayKey,
  shiftKey,
  toCalendarVM,
  playbookRunReach,
  nextRunLabel,
  scheduleLine,
  starterForTrigger,
  triggerOf,
  type AskReadSet,
  type LeadRoundEnding,
  type PersonRowDto,
  type ReportDto,
  visitLine,
} from "@chanlytics/contracts";
import { savedListsFor } from "@chanlytics/db";
import type { RouteContext } from "../with-route";
import { audiencePoolOnce, poolList } from "../audience";
import { dealPaceRead } from "../deals";
import { listSearches, waitingQuestionOf } from "../leads";
import { listPlaybooks, proposalFollowUps } from "../playbooks";
import { load, readerContext, type ReaderContext } from "../readers";
import * as readers from "../readers/facts";
import { calls as callsReader } from "../readers/calls";
import { call } from "../readers/call";
import { conversation } from "../readers/conversation";
import { person } from "../readers/person";
import { escalations as escalationsReader } from "../readers/escalations";
import { inbox } from "../readers/inbox";
import { today } from "../readers/today";
import { calendar } from "../readers/calendar";
import { openingsFor } from "./openings";
import { workspaceFacts } from "./prompt";

/**
 * What the assistant may read, and how each read is shaped.
 *
 * Every tool runs on the caller's session client, so RLS decides what it can
 * see exactly as it decides for the pages. Every result is built through the
 * same view-model functions the pages use, then cut down to what an answer
 * needs and capped, so the assistant's "held for you" is the Inbox's "held
 * for you" and a transcript never floods a turn. Each read records the rows
 * it returned in the read set: the only rows a citation may name.
 */

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const READ_TOOLS: ToolDef[] = [
  {
    name: "get_today",
    description:
      "The Today page: who needs a person right now, the WhatsApp threads whose free-reply window is closing while the customer waits, today's calls, the standing of the receptionist and the day's counts. It holds no drafts: the workspace snapshot's held_drafts and list_threads filter=held have them. Start here for 'how are we doing', 'what needs me', 'brief me'.",
    input_schema: obj({}),
  },
  {
    name: "list_threads",
    description:
      "Threads from the Inbox on every wire — WhatsApp, text or email, whichever the customer last wrote on, named per row in `channel` — each with its last three messages (who wrote, what). filter: needs_you (handed to a person), held (a draft waiting to send), waiting (taken over by a person), snoozed, recent (all, newest first). Call get_thread only when more of one conversation is needed.",
    input_schema: obj({ filter: { type: "string", enum: ["needs_you", "held", "waiting", "snoozed", "recent"] } }, [
      "filter",
    ]),
  },
  {
    name: "get_thread",
    description:
      "One conversation, on whichever wire it runs — WhatsApp, text or email, named in `channel`: the person, its state, the last messages with who wrote them, and why the receptionist answered or held as it did. Use the conversation id from list_threads, get_today or search_people. more=true returns the longer history.",
    input_schema: obj({ conversation_id: { type: "string" }, more: { type: "boolean" } }, ["conversation_id"]),
  },
  {
    name: "search_people",
    // The lists are named from the one table of them (contracts lists.ts), never typed beside it.
    description: `Find people (customers and callers) by name or phone digits. Returns their state, last contact, receptionist mode and their next appointment when the calendar is connected. Empty query lists the most recent people. list narrows to one list: the list token list_audiences gives (seg:<id> for People's lists, list:<id> for the workspace's own), or a People list's id: ${BUILTIN_LISTS.map((l) => `${l.id} (${l.label})`).join(", ")}. A list that can't be counted here says why. Each person says their next step, when they have one.`,
    input_schema: obj({ query: { type: "string" }, list: { type: "string" } }, ["query"]),
  },
  {
    name: "get_person",
    description:
      "One person's profile: right now, facts, their conversations and calls, and their timeline. Use a contact id from search_people or get_thread.",
    input_schema: obj({ contact_id: { type: "string" } }, ["contact_id"]),
  },
  {
    name: "list_calls",
    description:
      "Phone calls. filter: missed (today's missed calls), abandoned (today's inbound callers who reached the receptionist and hung up within seconds, so they got nothing), today, live (on the line now), recent (newest first).",
    input_schema: obj({ filter: { type: "string", enum: ["missed", "abandoned", "today", "live", "recent"] } }, [
      "filter",
    ]),
  },
  {
    name: "get_call",
    description:
      "One phone call: who, when, how it ended, the summary and the transcript (capped). Use the call id from list_calls or get_person.",
    input_schema: obj({ call_id: { type: "string" } }, ["call_id"]),
  },
  {
    name: "get_report",
    description:
      "The Reports page for 7, 30 or 90 days: answered by the receptionist vs by a person, reply time, calls, new people, escalation reasons, and the change against the previous period.",
    input_schema: obj({ days: { type: "integer", enum: [7, 30, 90] } }, ["days"]),
  },
  {
    name: "get_settings",
    description:
      "The workspace's settings as the receptionist runs on them: hours, closures, services, notes, guardrails, booking rules, the reply policy and its dials, which channels are connected, notifications.",
    input_schema: obj({}),
  },
  {
    name: "get_openings",
    description:
      "Open times from the connected calendar against the business hours, closures and booking rules. day: a weekday (mon..sun) or a date (YYYY-MM-DD), or empty for the next days. service: the service name to size the slot, or empty.",
    input_schema: obj({ day: { type: "string" }, service: { type: "string" } }, ["day", "service"]),
  },
  {
    name: "list_audiences",
    description:
      "The audiences a broadcast may go to — everyone who said yes, every People list this workspace can count, and every list of the workspace's own (kept by hand, or by a rule) — each with its kind and audience_id (propose_broadcast's audience), its list token (search_people's list), and FOUR counts; a list of the workspace's own that can't be counted here carries cannot_count (why) and no counts, because there are two consents and a yes needs a number to send to: can_be_sent_offers and can_be_sent_messages (who a promotional, or a utility or authentication, template reaches) and said_yes_to_offers and said_yes_to_messages (everyone who gave that yes, a number or not). Also the approved WhatsApp templates with their category and values, and whether the number may send. Read this before proposing a broadcast, and match the count to the template.",
    input_schema: obj({}, []),
  },
  {
    name: "list_playbooks",
    description:
      "The playbooks: standing rules that send one approved template to newly eligible people who said yes — each with what starts it, its template, its clock, whether it is running, the autonomy mode its class runs under, its next run, what its runs earned, and a run waiting for a person if there is one — plus every trigger with who its moment names right now: said_yes_now (who said the yes its template needs, a number or not) and can_be_sent_now (who of them a run reaches), and each one's starter template. Read this to say what is running, and before proposing a playbook.",
    input_schema: obj({}, []),
  },
  {
    name: "get_calendar",
    description:
      "The owner's calendar as the receptionist reads it, for a day or a few: what is taken (the calendar's own words, with the person in People when the title names one), whether the business is closed, and the windows the receptionist would offer. day: today, tomorrow, a weekday (mon..sun), a date (YYYY-MM-DD), or empty for today. days: how many from there, at most 14. Nothing is booked from here.",
    input_schema: obj({ day: { type: "string" }, days: { type: "number" } }, ["day"]),
  },
  {
    name: "list_lead_searches",
    description:
      "The workspace's lead searches, newest first: what was asked in the owner's words and when, its state or ending in words, how many qualified, need review and were counted, and, for a search that stopped to ask, its question. Read this before proposing a search, so a plan is not repeated.",
    input_schema: obj({}),
  },
];

export interface ToolRun {
  name: string;
  input: Record<string, unknown>;
}

export interface ToolContext {
  ctx: RouteContext;
  tenantId: string;
  role: "owner" | "operator" | "viewer";
  /** The business's zone: "tomorrow at ten" is its ten, never the server's. */
  timezone: string;
  read: AskReadSet;
  now: Date;
  /**
   * The audience pool, once a turn (audience.ts audiencePoolOnce): the one load that is not a reader yet. Every
   * other read goes through `rc`, whose turn cache keeps no failure.
   */
  memo: Map<string, Promise<unknown>>;
  /** The turn's reader context: every read through the readers shares the route's turn cache. */
  rc: ReaderContext;
}

export interface ToolOutcome {
  /** What the model sees. */
  result: string;
  isError: boolean;
  /** For the palette's trace line. */
  label: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

function json(v: unknown): string {
  return JSON.stringify(v);
}

/* ------------------------------------------------------------ helpers */

function dayKey(iso: string | null | undefined, tz: string): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(iso),
    );
  } catch {
    return null;
  }
}

/**
 * The open escalation the Inbox shows on each thread, as the page picks it
 * (legacy-bridge/surface-data.ts, inboxOverride): the open escalations come
 * newest first and the last one keyed for a thread wins, so a thread shows its
 * oldest. list_threads and get_thread both pick with this.
 */
function inboxEscalations<E extends { conversation_id: string }>(open: E[]): Map<string, E> {
  return new Map(open.map((e) => [e.conversation_id, e]));
}

/**
 * A reader's 404 as the tool's own "not here" answer, null; any other failure
 * is still the read failing (runTool says so). A row the workspace does not
 * hold is not a read that failed, and the model must not be told it was.
 */
function unlessNotFound<T>(read: Promise<T>): Promise<T | null> {
  return read.catch((e: unknown) => {
    if (e instanceof AppError && e.code === "not_found") return null;
    throw e;
  });
}

/* --------------------------------------------------------------- tools */

async function getToday(t: ToolContext): Promise<unknown> {
  // Today as the page composes it (readers/today.ts), read once in the turn: the Inbox's threads, the metrics the
  // page's Today reads (every line, the workspace's email one too), the calls and the searches. A calls or searches
  // read that failed is null, its own state on the page, never none.
  const { metrics, conversations, escalations, calls, searches } = (await load(t.rc, today, undefined)).data;
  // The page's own builder, with the waiting searches the page passes (the queue reads them).
  const vm = toTodayVM(metrics, conversations, escalations, calls, t.now, searches);
  for (const r of vm.needsYou?.rows ?? []) t.read.thread.add(r.conversationId);
  // A row this read RETURNS is a row a citation may name (see the header).
  // These were returned and not recorded, so the assistant could warn about a
  // closing window and then be unable to open the thread it had just named.
  for (const r of vm.windowClosing?.rows ?? []) t.read.thread.add(r.id.replace(/^wc-/, ""));
  for (const c of calls ?? []) t.read.call.add(c.id);
  return {
    standing: {
      headline: vm.standing.headline,
      detail: vm.standing.detail,
      tone: vm.standing.tone,
      chips: vm.standing.chips.map((c) => c.text),
    },
    needs_you: vm.needsYou
      ? {
          count: vm.needsYou.count,
          rows: vm.needsYou.rows.slice(0, ASK_CAPS.needsRows).map((r) => ({
            conversation_id: r.conversationId,
            route: `inbox/th-${r.conversationId}`,
            who: r.who,
            reason: r.reason,
            waited: r.waited,
            quote: r.quote,
          })),
        }
      : null,
    // NOT drafts, and not nearly. Every row here is a thread where the CUSTOMER
    // spoke last and nobody has written back (today.ts closingConvs), with
    // WhatsApp's free window running out. Under its old name,
    // `drafts_about_to_send`, the assistant read a person being ignored as a
    // reply already on its way out and told the owner to do nothing. The rule
    // comes from the contracts' own hint, so it is spelled in one place; null
    // when nothing is closing, as the view model itself is.
    reply_window_closing: vm.windowClosing
      ? {
          note: vm.windowClosing.hint,
          rows: vm.windowClosing.rows.map((r) => ({
            conversation_id: r.id.replace(/^wc-/, ""),
            route: r.to,
            text: r.text,
          })),
        }
      : null,
    recap: vm.recap
      ? { sentences: vm.recap.sentences.map((s) => s.text), facts: vm.recap.facts.map((f) => `${f.label}: ${f.value}`) }
      : null,
    calls: vm.calls
      ? {
          line: vm.calls.line,
          rows: vm.calls.rows.slice(0, 5).map((r) => ({
            call_id: r.id.replace(/^cv-/, ""),
            route: `conversations/${r.id}`,
            who: r.who,
            at: r.at,
            duration: r.duration,
            note: r.note,
          })),
        }
      : null,
    quiet: vm.quiet ? { headline: vm.quiet.headline, sub: vm.quiet.sub } : null,
    period: {
      messages_in: metrics.period.messages_in,
      answered_by_receptionist: metrics.period.answered_by_ai,
      answered_by_you: metrics.period.answered_by_you,
      unanswered: metrics.period.unanswered_in_window,
      calls: metrics.period.calls,
      new_people: metrics.period.new_contacts,
    },
  };
}

async function listThreads(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const filter = str(input.filter) || "recent";
  // The Inbox as the page composes it (readers/inbox.ts): the newest hundred, and every escalated thread outside it.
  const { conversations, escalations } = (await load(t.rc, inbox, undefined)).data;
  const byConv = inboxEscalations(escalations);
  const vms = conversations.map((c) => toInboxThreadVM(c, byConv.get(c.id) ?? null, t.timezone, t.now));
  const matching = vms.filter((v) => {
    switch (filter) {
      case "needs_you":
        return v.needsYou;
      case "held":
        return !!v.veto || !!v.heldDraft;
      case "waiting":
        return v.takenOver;
      case "snoozed":
        return v.state === "snoozed";
      default:
        return true;
    }
  });
  // Recent alone is newest first, before the cap: the Inbox's rows put the escalated threads it fetched by id first,
  // however old, and twenty of them would have been the whole answer. lastAtMs is last_message_at, the column the
  // server orders the hundred by, so the hundred keep their order. Every other filter keeps the Inbox's order, the
  // fetched threads first, as the page lists them: the cap never drops a customer waiting outside the hundred.
  if (filter === "recent") matching.sort((a, b) => b.lastAtMs - a.lastAtMs);
  // Counted BEFORE the cap, like search_people's `matches` a few functions
  // down. Counted after, "total_matching" reported 20 for 25 held drafts.
  const picked = matching.slice(0, ASK_CAPS.threads);
  for (const v of picked) t.read.thread.add(v.conversationId);
  return {
    filter,
    total_matching: matching.length,
    threads: picked.map((v) => ({
      conversation_id: v.conversationId,
      route: `inbox/th-${v.conversationId}`,
      who: v.who,
      state: v.needsYou
        ? "needs you"
        : v.takenOver
          ? "waiting on you"
          : v.state === "snoozed"
            ? "snoozed"
            : v.optedOut
              ? "opted out"
              : "answering",
      held_draft: v.veto
        ? { message_id: v.veto.messageId, text: v.veto.draft.slice(0, 200), why: v.veto.why?.summary ?? null }
        : v.heldDraft
          ? { message_id: v.heldDraft.messageId, text: v.heldDraft.body.slice(0, 200) }
          : null,
      last_message: v.preview.slice(0, 160),
      recent: v.timeline
        .filter((x): x is Extract<typeof x, { type: "msg" }> => x.type === "msg")
        .slice(-3)
        .map((x) => ({
          from: x.from === "client" ? "customer" : x.byYou ? "you" : "receptionist",
          text: x.body.slice(0, 140),
        })),
      last_at: v.lastAtFull,
      waiting_min: v.waitingMin ?? null,
      window_open: v.windowOpen,
      // Which wire, from the one derivation (threadChannelOf/replyVia). This
      // said `tags`, which toInboxThreadVM sets to [] on every real thread --
      // a field that has never carried anything.
      channel: v.replyVia,
    })),
  };
}

async function getThread(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const id = str(input.conversation_id);
  if (!UUID.test(id)) return { error: "conversation_id must be an id a tool returned" };
  const more = input.more === true;
  // The thread as its page reads it (readers/conversation.ts): the row under RLS and this workspace, then its hundred
  // newest messages with their wire and their attachment, so the window and the wire are the page's (ledger #5). The
  // open escalations beside it, as the Inbox reads them. Each once a turn; a thread not here is the reader's 404.
  const [r, open] = await Promise.all([
    unlessNotFound(load(t.rc, conversation, { id, before: null })),
    load(t.rc, escalationsReader, { state: "open" }),
  ]);
  if (!r) return { error: "no such conversation in this workspace" };
  const esc = inboxEscalations(open.data.escalations).get(id) ?? null;
  const cap = more ? ASK_CAPS.messagesMore : ASK_CAPS.messages;
  const dto = { ...r.data.conversation, messages: r.data.messages };
  // The page's own builder, over the page's own payload.
  const vm = toInboxThreadVM(dto, esc, t.timezone, t.now);
  t.read.thread.add(id);
  t.read.conversation.add(id);
  if (dto.contact.id) t.read.person.add(dto.contact.id);
  return {
    conversation_id: id,
    route: `inbox/th-${id}`,
    contact_id: dto.contact.id || null,
    contact_route: dto.contact.id ? `clients/${dto.contact.id}` : null,
    // Named as the Inbox row names them, which is the reader's row: the route's payload carries no email, so its view
    // model would call a person reached only by email "Unknown" where the Inbox names them by their address. The
    // reader's first row is the thread.
    who: r.rows[0].label,
    channel: vm.replyVia,
    state: vm.needsYou
      ? "needs you"
      : vm.takenOver
        ? "waiting on you"
        : vm.state === "snoozed"
          ? "snoozed"
          : vm.optedOut
            ? "opted out"
            : "answering",
    escalation: esc
      ? { id: esc.id, reason: ESCALATION_REASON_LABELS[esc.reason] ?? esc.reason, details: esc.details }
      : null,
    window_open: vm.windowOpen,
    held_draft: vm.veto
      ? {
          message_id: vm.veto.messageId,
          text: vm.veto.draft,
          why: vm.veto.why
            ? { summary: vm.veto.why.summary, reason: vm.veto.why.reason, facts: vm.veto.why.facts }
            : null,
        }
      : null,
    messages: dto.messages.slice(-cap).map((m) => {
      const why = replyWhy(m.meta as Record<string, unknown> | null);
      return {
        // By the business's clock, as the pages say it: the time today, the date and the time before.
        at: clockStamp(Date.parse(m.created_at), t.timezone, t.now.getTime()),
        from: m.direction === "inbound" ? "customer" : m.sender === "ai" ? "receptionist" : "you",
        text: messageText(m).slice(0, 600),
        status: m.status ?? null,
        ...(why ? { why: why.summary } : {}),
      };
    }),
    shown: Math.min(dto.messages.length, cap),
    more_available: dto.messages.length >= cap && !more,
  };
}

function stepLine(r: PersonRowDto, tz: string, nowMs: number): string | null {
  const s = nextStepOf(r, tz, nowMs);
  return s ? `${s.words} · ${s.day.words}` : null;
}

function personLine(r: PersonRowDto, tz: string, nowMs: number) {
  const stateKey = r.dnc ? "opted_out" : r.needs_human ? "needs_you" : "active";
  return {
    contact_id: r.id,
    route: `clients/${r.id}`,
    name: personName(r),
    state: PERSON_STATE_LABELS[stateKey as keyof typeof PERSON_STATE_LABELS] ?? stateKey,
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

async function searchPeople(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const q = str(input.query, 80).toLowerCase();
  const listIn = str(input.list, 60);
  // Any list, one way (decision 0009): a token list_audiences gave, or a People list's bare id.
  const ref = listIn
    ? (parseListToken(listIn) ?? parseListToken(`list:${listIn}`) ?? parseListToken(`seg:${listIn}`))
    : null;
  if (listIn && !ref) return { error: "list must be a list token from list_audiences, or a People list's id" };
  // With their appointments, so "who asked but never booked?" and "who is
  // booked this week?" are answered from the calendar, not guessed.
  const pool = await audiencePoolOnce(t.memo, t.ctx, t.tenantId, t.timezone, t.now);
  const { people: rows } = pool;
  // Counted as a send and the page count it (audience.ts poolList); one that can't be counted here says why, in the
  // page's words, and names the condition that failed.
  let onList: Set<string> | null = null;
  if (ref) {
    const found = await poolList(t.ctx, t.tenantId, pool, ref);
    if (!found) return { error: "no such list; list_audiences names them", people: [] };
    if ("unknown" in found) return { error: `${found.label}: ${found.unknown}`, people: [] };
    onList = new Set(found.memberIds);
  }
  const digits = q.replace(/\D/g, "");
  const hits = rows.filter((r) => {
    if (onList && !onList.has(r.id)) return false;
    if (!q) return true;
    const name = personName(r).toLowerCase();
    if (name.includes(q)) return true;
    if (digits.length >= 4 && (r.phone_e164 ?? "").replace(/\D/g, "").includes(digits)) return true;
    return false;
  });
  hits.sort(
    (a, b) =>
      (Date.parse(b.last_message_at ?? b.last_call_at ?? "") || 0) -
      (Date.parse(a.last_message_at ?? a.last_call_at ?? "") || 0),
  );
  const picked = hits.slice(0, ASK_CAPS.people);
  for (const r of picked) {
    t.read.person.add(r.id);
    if (r.latest_conversation_id) t.read.thread.add(r.latest_conversation_id);
  }
  return {
    query: q,
    // A People list by its id, as it was asked for; one of the workspace's own by its token.
    list: ref ? (ref.kind === "builtin" ? ref.id : `list:${ref.id}`) : null,
    matches: hits.length,
    people: picked.map((r) => personLine(r, t.timezone, t.now.getTime())),
  };
}

async function getPerson(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
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

async function listCalls(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const filter = str(input.filter) || "recent";
  // The business's zone, as the turn read it (the route's facts): not read again.
  const { timezone } = t;
  // The hundred newest, as the Calls page reads them (readers/calls.ts), once in the turn.
  const calls = (await load(t.rc, callsReader, {})).data.calls;
  const todayKey = dayKey(t.now.toISOString(), timezone);
  const vms = calls.map((c) => toCallVM(c, timezone, t.now));
  const abandoned = new Set(calls.filter(abandonedCall).map((c) => c.id));
  const picked = vms
    .filter((v, i) => {
      const c = calls[i];
      switch (filter) {
        case "missed":
          return v.outcome === "missed" && dayKey(c.started_at, timezone) === todayKey;
        case "abandoned":
          return abandoned.has(c.id) && dayKey(c.started_at, timezone) === todayKey;
        case "today":
          return dayKey(c.started_at, timezone) === todayKey;
        case "live":
          return v.outcome === "live";
        default:
          return true;
      }
    })
    .slice(0, ASK_CAPS.calls);
  for (const v of picked) t.read.call.add(v.callId);
  return {
    filter,
    calls: picked.map((v) => ({
      call_id: v.callId,
      route: `conversations/cv-${v.callId}`,
      who: v.who,
      at: v.at,
      duration: v.duration ?? null,
      outcome: v.outcome,
      ...(abandoned.has(v.callId) ? { abandoned: true } : {}),
      summary: v.summary.headline,
      conversation_id: v.threadId ? v.threadId.replace(/^th-/, "") : null,
      contact_id: v.clientId,
    })),
  };
}

async function getCall(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const id = str(input.call_id);
  if (!UUID.test(id)) return { error: "call_id must be an id a tool returned" };
  // The call as the Calls page maps it, under this workspace's own filter (readers/call.ts), once a turn; a call not
  // here is the reader's 404.
  const r = await unlessNotFound(load(t.rc, call, { id }));
  if (!r) return { error: "no such call in this workspace" };
  const v = toCallVM(r.data.call, t.timezone, t.now);
  t.read.call.add(id);
  if (v.clientId) t.read.person.add(v.clientId);
  return {
    call_id: id,
    route: `conversations/cv-${id}`,
    who: v.who,
    at: v.at,
    duration: v.duration ?? null,
    outcome: v.outcome,
    summary: v.summary,
    recording: v.recordingState,
    contact_id: v.clientId,
    transcript: v.transcript
      .slice(0, ASK_CAPS.transcript)
      .map((x) => `${x.speaker === "client" ? "caller" : x.speaker}: ${x.text}`),
    transcript_turns: v.transcript.length,
  };
}

async function getReport(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const days = Number(input.days) || 30;
  if (!REPORT_RANGES.some((r) => r.days === days)) return { error: "days must be 7, 30 or 90" };
  const { data, error } = await t.ctx.supabase.rpc("report_series", { p_tenant_id: t.tenantId, p_days: days });
  if (error) throw new Error(error.message);
  const report = data as unknown as ReportDto;
  if (!report || report.error) return { error: "report unavailable" };
  const vm = toReportVM(report);
  return {
    range: vm.rangeLabel,
    empty: vm.empty,
    tiles: vm.tiles.map((x) => ({ label: x.label, value: x.value, meta: x.meta, change: x.delta?.text ?? null })),
    answered: vm.answered.totals,
    reply_time: { median: vm.replyTime.medianLabel, p90: vm.replyTime.p90Label, count: vm.replyTime.count },
    calls: { total: vm.calls.total, minutes: vm.calls.minutes, voicemail: vm.calls.voicemail },
    new_people: vm.people.total,
    escalation_reasons: vm.reasons.slice(0, 5).map((r) => `${r.label}: ${r.value}`),
    by_day: vm.answered.points
      .slice(-14)
      .map((p) => ({ day: p.short, in: p.in, receptionist: p.ai, you: p.you, unanswered: p.none })),
  };
}

async function getSettings(t: ToolContext): Promise<unknown> {
  const sb = t.ctx.supabase;
  const [{ name, timezone }, cfgRow, all, channels, sellsBy] = await Promise.all([
    load(t.rc, readers.facts, undefined).then((r) => r.data),
    load(t.rc, readers.config, undefined).then((r) => r.data),
    load(t.rc, readers.policies, undefined).then(
      (r) => r.data,
      () => [],
    ),
    sb.from("tenant_channels").select("kind, status, number_e164").eq("tenant_id", t.tenantId),
    load(t.rc, readers.sellsBy, undefined).then((r) => r.data),
  ]);
  // The Autonomy rows offered here, as the pane draws them: the follow-ups' only where deals are on (0006).
  const policies = all.filter((p) => policyClassOffered(p.class, dealsAreOn(sellsBy)));
  const cfg = parseTenantConfig(cfgRow?.config ?? null);
  const facts = workspaceFacts(name, timezone, cfgRow?.config ?? null, policies);
  return {
    business: facts.businessName,
    timezone,
    hours: facts.hoursLines,
    closures: facts.closures,
    services: facts.services,
    languages: facts.languages,
    guardrails: facts.guardrails,
    notes: facts.notes,
    booking_rules: cfg?.brain?.profile?.booking_rules ?? null,
    escalate_when: cfg?.brain?.profile?.escalate_when ?? [],
    calendar_connected: facts.hasCalendar,
    vision: facts.visionOn,
    notifications: cfg?.notifications
      ? {
          escalation_emails:
            t.role === "owner" ? cfg.notifications.escalation_emails : cfg.notifications.escalation_emails.length,
        }
      : null,
    policies: policies.map((p) => ({ class: p.class, mode: p.mode, limits: p.limits })),
    channels: (channels.data ?? []).map((c) => ({ kind: c.kind, status: c.status, number: c.number_e164 })),
    config_version: cfgRow?.version ?? null,
  };
}

async function getOpenings(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const r = await openingsFor(
    t.ctx,
    t.tenantId,
    { day: str(input.day, 20) || null, service: str(input.service, 80) || null },
    t.now,
  );
  return { state: r.state, text: r.text, days: r.days, service: r.service?.name ?? null };
}

/* ----------------------------------------------------------- dispatch */

const LABELS: Record<string, string> = {
  get_today: "Reading Today",
  list_threads: "Reading the Inbox",
  get_thread: "Reading the conversation",
  search_people: "Looking through People",
  get_person: "Reading the profile",
  list_calls: "Reading the calls",
  get_call: "Reading the call",
  get_report: "Reading Reports",
  get_settings: "Reading Settings",
  get_openings: "Checking the calendar",
  list_audiences: "Reading the lists and templates",
  list_playbooks: "Reading the playbooks",
  get_calendar: "Reading the calendar",
  list_lead_searches: "Reading your searches",
};

export function toolLabel(name: string): string {
  return LABELS[name] ?? `Running ${name}`;
}

export function newToolContext(
  ctx: RouteContext,
  tenantId: string,
  role: ToolContext["role"],
  timezone: string,
  now = new Date(),
  rc: ReaderContext = readerContext(ctx, { tenantId, role }, now),
): ToolContext {
  return { ctx, tenantId, role, timezone, read: emptyReadSet(), now, memo: new Map(), rc };
}

/** Run one read. A tool's own failure is returned to the model as an error result, never thrown. */
/**
 * The audiences a broadcast may go to, counted by the same contracts
 * predicate the route enrols with and the page shows — so the number the
 * assistant says is the number the card will carry.
 */
async function listAudiences(t: ToolContext): Promise<unknown> {
  const [pool, lists, tpls, ch] = await Promise.all([
    audiencePoolOnce(t.memo, t.ctx, t.tenantId, t.timezone, t.now),
    savedListsFor(t.ctx.supabase, t.tenantId),
    t.ctx.supabase
      .from("templates")
      .select("id, name, language, category, variables, body_preview")
      .eq("tenant_id", t.tenantId)
      .eq("channel", "whatsapp")
      .eq("meta_status", "approved")
      .order("name"),
    t.ctx.supabase
      .from("tenant_channels")
      .select("number_e164, config")
      .eq("tenant_id", t.tenantId)
      .eq("kind", "whatsapp")
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ]);
  const rows = pool.rows;
  // FOUR sizes for every audience: this listing is read BEFORE a template is
  // chosen, the two answers differ, and who gave an answer is not who can be sent
  // the message, which also needs a number (#663). A single `said_yes` here was
  // the marketing count under a name that did not say so, so the assistant would
  // report "nobody said yes" about a utility template that could reach everybody
  // who had ever texted START; and `said_yes_to_offers` was the REACH, so a list
  // whose one yes to offers had no number read as nobody's yes. The send screen's
  // own counts (audiencePreview): `sending` is the number on its chip.
  const sizes = (kind: AudienceKind, id: string | null, ids: Set<string> | null) => {
    const offers = audiencePreview(rows, kind, id, ids, "marketing");
    const messages = audiencePreview(rows, kind, id, ids, "conversational");
    return {
      said_yes_to_offers: offers.saidYes,
      can_be_sent_offers: offers.sending,
      said_yes_to_messages: messages.saidYes,
      can_be_sent_messages: messages.sending,
    };
  };
  // Every list the pool can offer (contracts listsFor): People's lists this workspace can count, then its own. Each
  // with its token (search_people's list) and its kind and id (propose_broadcast's audience). The three consent lists
  // are never audiences: each restates the yes every audience is already crossed with. A list of the workspace's own
  // that can't be counted here is listed with why, and no counts.
  const offered = listsFor(pool.listCtx, lists).filter(
    (d) => !(d.ref.kind === "builtin" && ["opted_in", "offers_ok", "opted_out"].includes(d.ref.id)),
  );
  const audiences = [
    { kind: "everyone", audience_id: null, list: null, label: EVERYONE_LABEL, ...sizes("everyone", null, null) },
    ...offered.map((d) => {
      const m = membersOf(d, rows, pool.listCtx, lists);
      const head = {
        kind: d.ref.kind === "builtin" ? "list" : "saved",
        audience_id: d.ref.id,
        list: d.token,
        label: d.label,
      };
      return m.state === "ok"
        ? { ...head, ...sizes("saved", null, m.ids) }
        : { ...head, cannot_count: listUnknownWords(m.reason, pool.listCtx.calendar) };
    }),
  ];
  const cfg = (
    ch.data?.config && typeof ch.data.config === "object" && !Array.isArray(ch.data.config) ? ch.data.config : {}
  ) as Record<string, unknown>;
  const s = (k: string) => (typeof cfg[k] === "string" ? (cfg[k] as string) : null);
  const health = numberHealth({ quality: s("quality_rating"), event: s("quality_event"), limit: s("messaging_limit") });
  return {
    route: "broadcasts",
    audiences,
    templates: (tpls.data ?? []).map((x) => ({
      template_id: x.id,
      name: x.name,
      language: x.language,
      category: x.category,
      values: Array.isArray(x.variables)
        ? (x.variables as { position?: number; label?: string; example?: string | null }[]).map((v) => ({
            position: v.position,
            label: v.label,
            example: v.example ?? null,
          }))
        : [],
      body: x.body_preview,
    })),
    number: {
      present: !!ch.data,
      health: health.label,
      can_send: health.canSend,
      limit_per_day: health.limitPerDay === Number.POSITIVE_INFINITY ? null : health.limitPerDay,
    },
    note: `Two consents, two counts each. can_be_sent_offers is who a promotional template reaches and can_be_sent_messages who a utility or authentication one reaches, because ${NO_NUMBER_REACH}; said_yes_to_offers and said_yes_to_messages count everyone who gave that yes, a number or not. Pick the template first, then quote its can_be_sent count as who the broadcast reaches -- never a larger count. When that is 0 and its said_yes is not, the ones who said yes have no number: say so, and never send the owner to get a yes they already have.`,
  };
}

/** What a run does under each mode, in the assistant's words. */
const MODE_WORDS: Record<string, string> = {
  auto: "a run sends on its own",
  veto: "a run sends 30 minutes later unless someone stops it",
  ask: "a run waits for a person on Today",
  never: "nothing runs",
};

/**
 * The playbooks as the page shows them — the same rows, the same totals,
 * the same next-run words — and the four triggers with the count the
 * composer's chips carry.
 */
async function listPlaybooksTool(t: ToolContext): Promise<unknown> {
  const [rows, facts, policies, pool, paceRead, followUps] = await Promise.all([
    listPlaybooks(t.ctx, t.tenantId),
    load(t.rc, readers.facts, undefined).then((r) => r.data),
    load(t.rc, readers.policies, undefined).then(
      (r) => r.data,
      () => [],
    ),
    audiencePoolOnce(t.memo, t.ctx, t.tenantId, t.timezone, t.now),
    // A proposal's moment is counted as the page counts it (0006): by the workspace's pace, leaving out whoever
    // already had their follow-up, from any playbook. Unreadable, that moment is not counted.
    dealPaceRead(t.ctx, t.tenantId, t.now),
    proposalFollowUps(t.ctx, t.tenantId, t.now).catch(() => null),
  ]);
  const pace = pool.deals_on ? dealPaceOf(paceRead) : null;
  const modes = new Map(policies.map((r) => [r.class, r.mode]));
  const modeOf = (cls: string) => modes.get(cls) ?? "ask";
  // With their appointments: the visit triggers count from the calendar.
  const vm = pool.rows;
  const vmPool = pool;
  const untouched = {
    byThis: new Map<string, number>(),
    byAny: new Map<string, number>(),
    followUps: new Map<string, number>(),
  };
  // Who each moment names that said the yes its template needs, and who of them
  // a run reaches, by the runner's own draw before anyone has heard from a
  // playbook. `said_yes_now` was the reach, so a moment whose yes had no number
  // to send to read as nobody's yes.
  const moment = (trigger: string, listIds: ReadonlySet<string> | null = null) => {
    const deal = triggerOf(trigger)?.kind === "deal";
    if (deal && !followUps) return { said_yes_now: null, can_be_sent_now: null };
    const drawn = playbookRunReach(
      vm,
      {
        trigger: trigger as (typeof PLAYBOOK_TRIGGERS)[number]["id"],
        cap_per_run: 100_000,
        gap_days: 0,
        cadence_days: 0,
      },
      deal && followUps ? { ...untouched, followUps } : untouched,
      t.now.getTime(),
      pace,
      listIds,
    );
    return { said_yes_now: drawn.saidYes, can_be_sent_now: drawn.reach.will };
  };
  // A playbook on a list is counted over its own list (decision 0009): each list once, one of People's or one of the
  // workspace's own, as the run counts it; one it can't count here says why. It read as nobody before.
  const onList = new Map<
    string,
    { said_yes_now: number | null; can_be_sent_now: number | null } | { cannot_count: string }
  >();
  for (const p of rows) {
    const ref = playbookListRef(p);
    if (!ref || onList.has(listToken(ref))) continue;
    const found = await poolList(t.ctx, t.tenantId, vmPool, ref);
    onList.set(
      listToken(ref),
      !found
        ? { cannot_count: "its list was deleted" }
        : "unknown" in found
          ? { cannot_count: found.unknown }
          : moment(p.trigger, new Set(found.memberIds)),
    );
  }
  return {
    route: "outbound",
    timezone: facts.timezone,
    modes: {
      reengage: modeOf("reengage"),
      campaign: modeOf("campaign"),
      booking: modeOf("booking"),
      // The follow-ups' class only where deals are on (0006).
      ...(policyClassOffered("follow_up", pool.deals_on) ? { follow_up: modeOf("follow_up") } : {}),
    },
    mode_words: MODE_WORDS,
    playbooks: rows.map((p) => ({
      playbook_id: p.id,
      name: p.name,
      trigger: p.trigger,
      trigger_label: triggerOf(p.trigger)?.label ?? p.trigger,
      template: p.template_name,
      state: p.state,
      policy_class: p.policy_class,
      mode: modeOf(p.policy_class),
      schedule: scheduleLine(p),
      next_run: nextRunLabel(p, facts.timezone, t.now),
      // On a list: its token, and who a run on it reaches now.
      ...(() => {
        const ref = playbookListRef(p);
        return ref ? { list: listToken(ref), ...onList.get(listToken(ref)) } : {};
      })(),
      runs: p.totals.runs,
      sent: p.totals.sent,
      replied: p.totals.replied,
      waiting: p.totals.waiting
        ? { broadcast_id: p.totals.waiting.id, people: p.totals.waiting.recipient_count }
        : null,
    })),
    // The moments offered here (0006): a proposal's only where deals are on.
    triggers: PLAYBOOK_TRIGGERS.filter((x) => triggerOffered(x, pool.deals_on)).map((x) => ({
      trigger: x.id,
      label: x.label,
      when: x.hint,
      policy_class: x.cls,
      // On a list, the counts are the list's: list_audiences has each list's.
      ...(x.kind === "saved" ? { counted_per_list: true } : moment(x.id)),
      starter_template: starterForTrigger(x.id)?.title ?? null,
    })),
    note: `A run is a broadcast, and ${NO_NUMBER_REACH}. It never reaches anyone twice within the playbook's gap, and sends one playbook message per person per week. said_yes_now counts who each trigger names that said the yes its template needs, a number or not; can_be_sent_now is who of them a run reaches. When can_be_sent_now is 0 and said_yes_now is not, the ones who said yes have no number: say so, and never send the owner to get a yes they already have.${pool.deals_on ? " The proposal follow-up reaches each proposal once, with its link: its counts leave out whoever already had theirs, and null means that could not be read." : ""} Nothing here has run because you read it.`,
  };
}

const WEEKDAY_KEYS: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** The calendar for a day or a few, in the words the page uses. */
async function getCalendar(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const todayKey = dayInZone(t.timezone, t.now.getTime()).key;
  const asked = str(input.day, 20).trim().toLowerCase();
  const askedKey = isDayKey(asked) ? asked : null;
  let from = todayKey;
  if (asked === "tomorrow") from = shiftKey(todayKey, 1);
  else if (askedKey) from = askedKey;
  else if (asked.slice(0, 3) in WEEKDAY_KEYS) {
    const want = WEEKDAY_KEYS[asked.slice(0, 3)];
    for (let i = 0; i < 7; i++) {
      const k = shiftKey(todayKey, i);
      if (new Date(`${k}T12:00:00Z`).getUTCDay() === want) {
        from = k;
        break;
      }
    }
  }
  const days = Math.min(14, Math.max(1, Math.round(Number(input.days)) || 1));
  // The board as its page reads it (readers/calendar.ts), once a turn, with the zone and the settings the turn read,
  // and never a write. No day asked is the page's own span, the week from its Monday, as the Calendar opens (ledger
  // #11); a day asked is that day and the days after it, as before. Then the page's own view model, as the bridge
  // builds it.
  const r = await load(t.rc, calendar, asked ? { from, days } : { from: null, days: 7 });
  const vm = toCalendarVM(r.data.calendar, t.now);
  // A person the calendar names is a row read: the answer may name them, and open their profile.
  for (const d of vm.days) for (const b of [...d.allDay, ...d.blocks]) if (b.person) t.read.person.add(b.person.id);
  return {
    route: "calendar",
    feed: vm.feed.line,
    timezone: vm.timezone,
    days: vm.days.map((d) => ({
      day: d.key,
      label: d.long,
      closed: d.closed.yes ? (d.closed.note ? `closed · ${d.closed.note}` : "closed") : null,
      taken: [...d.allDay, ...d.blocks].map((b) => ({
        time: b.time,
        title: b.title,
        person: b.person ? { contact_id: b.person.id, name: b.person.name } : null,
      })),
      open: d.windows.map((w) => w.label),
    })),
    note: "Taken is the owner's own calendar; open is what the receptionist would offer a caller. Nothing is booked from here: customers book through the booking link, or with the team where there is none.",
  };
}

/** A round's state in a word, for the model to say. The owner's own screen words are the strip's. */
const ROUND_WORDS: Record<string, string> = {
  queued: "queued",
  probing: "looking at a first few",
  waiting_on_owner: "waiting for an answer from you",
  running: "running",
  checking: "checking the emails it found",
  ended: "ended",
};

/**
 * Every search this workspace has asked for, newest first, in the owner's own
 * words: what they asked, the day they asked it, where it is or how it ended,
 * the three counts, and, for a search that stopped to ask, its question (the
 * model answers it through propose_lead_search's amends). Nothing is started
 * by reading it, and every string is cut to 120 characters so a long ask
 * cannot fill a turn.
 */
async function listLeadSearches(t: ToolContext): Promise<unknown> {
  const rows = await listSearches(t.ctx, t.tenantId);
  const cut = (v: string | null | undefined) => (typeof v === "string" ? v.slice(0, 120) : "");
  return {
    route: "clients/leads",
    searches: rows.map((r) => {
      const q = waitingQuestionOf(r);
      return {
        id: r.id,
        name: cut(r.name),
        asked: cut(r.asked),
        asked_on: r.created_at.slice(0, 10),
        state: r.state ? (ROUND_WORDS[r.state] ?? r.state) : "not started",
        ending: r.ending ? (LEAD_ENDING_WORDS[r.ending as LeadRoundEnding] ?? null) : null,
        qualified: r.qualified,
        review: r.review,
        counted: r.counted,
        question: q ? cut(q) : null,
      };
    }),
    note: "Counted is what came off this month's leads. A search with a question is waiting for the owner's answer: to answer it with a change, propose_lead_search with amends set to its id, carrying the same plan with the answer applied and everything else as it was; to carry on unchanged or stop it, the owner presses Yes, keep going or Stop here on Leads. Nothing here has started or changed because you read it; a new search is propose_lead_search without amends, which becomes a card the owner approves.",
  };
}

export async function runTool(t: ToolContext, run: ToolRun): Promise<ToolOutcome> {
  const label = toolLabel(run.name);
  try {
    let out: unknown;
    switch (run.name) {
      case "get_today":
        out = await getToday(t);
        break;
      case "list_threads":
        out = await listThreads(t, run.input);
        break;
      case "get_thread":
        out = await getThread(t, run.input);
        break;
      case "search_people":
        out = await searchPeople(t, run.input);
        break;
      case "get_person":
        out = await getPerson(t, run.input);
        break;
      case "list_calls":
        out = await listCalls(t, run.input);
        break;
      case "get_call":
        out = await getCall(t, run.input);
        break;
      case "get_report":
        out = await getReport(t, run.input);
        break;
      case "get_settings":
        out = await getSettings(t);
        break;
      case "get_openings":
        out = await getOpenings(t, run.input);
        break;
      case "list_audiences":
        out = await listAudiences(t);
        break;
      case "list_playbooks":
        out = await listPlaybooksTool(t);
        break;
      case "get_calendar":
        out = await getCalendar(t, run.input);
        break;
      case "list_lead_searches":
        out = await listLeadSearches(t);
        break;
      default:
        return { result: json({ error: `unknown tool ${run.name}` }), isError: true, label };
    }
    const isError = !!(
      out &&
      typeof out === "object" &&
      "error" in (out as Record<string, unknown>) &&
      Object.keys(out as object).length <= 2
    );
    return { result: json(out), isError, label };
  } catch (e) {
    console.error(
      "ask_tool_failed",
      JSON.stringify({ tool: run.name, error: e instanceof Error ? e.message : String(e) }),
    );
    return { result: json({ error: "that read failed; say so and answer with what you have" }), isError: true, label };
  }
}
