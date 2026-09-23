import "server-only";
import {
  ASK_CAPS,
  ASK_FINISH_JSON_SCHEMA,
  EVERYONE_LABEL,
  NO_NUMBER_REACH,
  PEOPLE_LISTS,
  savedListIds,
  audiencePreview,
  type AudienceKind,
  numberHealth,
  ESCALATION_REASON_LABELS,
  LEAD_ENDING_WORDS,
  PERSON_STATE_LABELS,
  REPORT_RANGES,
  dealsAreOn,
  SELLS_BY_QUESTION,
  SELLS_BY_WORDS,
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
  type CallDto,
  type LeadRoundEnding,
  type ConversationDto,
  type EscalationDto,
  type MessageDto,
  type PersonDetailDto,
  type PersonDecisionDto,
  type PersonEscalationDto,
  type PersonRowDto,
  type ReportDto,
  visitLine,
} from "@chanlytics/contracts";
import { listPolicies, savedListsFor } from "@chanlytics/db";
import type { RouteContext } from "../with-route";
import {
  CALL_COLUMNS,
  CONVERSATION_COLUMNS,
  MESSAGE_COLUMNS,
  groupMessages,
  toCallDto,
  toConversationDto,
} from "../dto";
import { audiencePoolOnce } from "../audience";
import { sellsByOf } from "../deals";
import { listSearches } from "../leads";
import { metricsSummaryFor } from "../metrics";
import { listPlaybooks } from "../playbooks";
import { calendarWeek } from "../calendar";
import { tenantFacts } from "../tenant";
import { openingsFor } from "./openings";
import { workspaceFacts } from "./prompt";
import { personNotesRead } from "../person-notes";

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
  strict?: boolean;
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
    description:
      "Find people (customers and callers) by name or phone digits. Returns their state, last contact, receptionist mode and their next appointment when the calendar is connected. Empty query lists the most recent people. list narrows to one of People's smart lists: needs_you, waiting_on_you, new_week, booked, asked_never_booked (wrote or called this month, never on the calendar), quiet, phoned_only, opted_in, opted_out, consultation_booked, proposal_out (a proposal waiting on their answer), clients, deal_ended (where deals are on here).",
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
      "The audiences a broadcast may go to — everyone who said yes, every People list, every list kept by hand — each with FOUR counts, because there are two consents and a yes needs a number to send to: can_be_sent_offers and can_be_sent_messages (who a promotional, or a utility or authentication, template reaches) and said_yes_to_offers and said_yes_to_messages (everyone who gave that yes, a number or not). Also the approved WhatsApp templates with their category and values, and whether the number may send. Read this before proposing a broadcast, and match the count to the template.",
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
      "The workspace's lead searches, newest first: what was asked in the owner's words and when, its state or ending in words, and how many qualified, need review and were counted. Read this before proposing a search, so a plan is not repeated.",
    input_schema: obj({}),
  },
];

export const FINISH_TOOL: ToolDef = {
  name: "finish",
  description:
    "Your answer to the person. Call it exactly once, after the reads you needed. The answer is plain text in their language; citations name only ids the tools returned this turn.",
  input_schema: ASK_FINISH_JSON_SCHEMA as unknown as Record<string, unknown>,
  strict: true,
};

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
  /** One turn's loads, by key: the same rows are never fetched twice in a turn. */
  memo: Map<string, Promise<unknown>>;
}

function memoised<T>(t: ToolContext, key: string, load: () => Promise<T>): Promise<T> {
  let p = t.memo.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load();
    t.memo.set(key, p);
  }
  return p;
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

/* ------------------------------------------------------------ loaders */

interface EscRow extends EscalationDto {
  conversation_id: string;
}

/** The newest conversations with their messages: enough for the Inbox's rows, not the whole history. */
const CONVERSATIONS = 40;
const MESSAGES = 600;

function loadConversations(
  t: ToolContext,
  limit = CONVERSATIONS,
): Promise<{ convs: ConversationDto[]; escalations: EscRow[] }> {
  return memoised(t, `conversations:${limit}`, () => loadConversationsNow(t, limit));
}

async function loadConversationsNow(
  t: ToolContext,
  limit: number,
): Promise<{ convs: ConversationDto[]; escalations: EscRow[] }> {
  const { supabase, userId } = t.ctx;
  const [c, e] = await Promise.all([
    supabase
      .from("conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("tenant_id", t.tenantId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit),
    supabase
      .from("escalations")
      .select("id, reason, details, state, created_at, conversation_id")
      .eq("tenant_id", t.tenantId)
      .eq("state", "open")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (c.error) throw new Error(c.error.message);
  if (e.error) throw new Error(e.error.message);
  const ids = (c.data ?? []).map((x) => x.id);
  let byConv = new Map<string, MessageDto[]>();
  if (ids.length) {
    const m = await supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(MESSAGES);
    if (m.error) throw new Error(m.error.message);
    byConv = groupMessages(m.data ?? []);
  }
  return {
    convs: (c.data ?? []).map((x) => toConversationDto(x, byConv.get(x.id) ?? [], userId)),
    escalations: (e.data ?? []) as EscRow[],
  };
}

function loadCalls(t: ToolContext, limit = 40): Promise<CallDto[]> {
  return memoised(t, `calls:${limit}`, async () => {
    const { data, error } = await t.ctx.supabase
      .from("calls")
      .select(CALL_COLUMNS)
      .eq("tenant_id", t.tenantId)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toCallDto);
  });
}

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

/* --------------------------------------------------------------- tools */

async function getToday(t: ToolContext): Promise<unknown> {
  const { supabase } = t.ctx;
  const [metrics, { convs, escalations }, calls] = await Promise.all([
    // The same door the page's Today reads through, so Ask counts the same
    // lines, including the workspace's email one, which is not a routing row.
    metricsSummaryFor(supabase, t.tenantId, 1),
    loadConversations(t),
    loadCalls(t).catch(() => [] as CallDto[]),
  ]);
  if (!metrics) throw new Error("metrics unavailable");
  const vm = toTodayVM(metrics, convs, escalations, calls, t.now);
  for (const r of vm.needsYou?.rows ?? []) t.read.thread.add(r.conversationId);
  // A row this read RETURNS is a row a citation may name (see the header).
  // These were returned and not recorded, so the assistant could warn about a
  // closing window and then be unable to open the thread it had just named.
  for (const r of vm.windowClosing?.rows ?? []) t.read.thread.add(r.id.replace(/^wc-/, ""));
  for (const c of calls) t.read.call.add(c.id);
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
  const { convs, escalations } = await loadConversations(t);
  const byConv = new Map(escalations.map((e) => [e.conversation_id, e]));
  const vms = convs.map((c) => toInboxThreadVM(c, byConv.get(c.id) ?? null, t.timezone, t.now));
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
  const { supabase } = t.ctx;
  const { data: conv, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conv) return { error: "no such conversation in this workspace" };
  const cap = more ? ASK_CAPS.messagesMore : ASK_CAPS.messages;
  const [{ data: msgs, error: merr }, { data: esc }] = await Promise.all([
    supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(cap),
    supabase
      .from("escalations")
      .select("id, reason, details, state, created_at, conversation_id")
      .eq("conversation_id", id)
      .eq("state", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (merr) throw new Error(merr.message);
  const dto = toConversationDto(
    conv,
    [...(msgs ?? [])].reverse().map((m) => ({
      id: m.id,
      direction: m.direction as MessageDto["direction"],
      sender: m.sender as MessageDto["sender"],
      type: m.type,
      body: m.body,
      media: null,
      meta: m.meta as MessageDto["meta"],
      status: m.status,
      created_at: m.created_at,
      channel_ts: m.channel_ts,
    })),
    t.ctx.userId,
  );
  const vm = toInboxThreadVM(dto, (esc as EscalationDto | null) ?? null, t.timezone, t.now);
  t.read.thread.add(id);
  t.read.conversation.add(id);
  if (dto.contact.id) t.read.person.add(dto.contact.id);
  return {
    conversation_id: id,
    route: `inbox/th-${id}`,
    contact_id: dto.contact.id || null,
    contact_route: dto.contact.id ? `clients/${dto.contact.id}` : null,
    who: vm.who,
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
      ? {
          id: (esc as EscalationDto).id,
          reason: ESCALATION_REASON_LABELS[(esc as EscalationDto).reason] ?? (esc as EscalationDto).reason,
          details: (esc as EscalationDto).details,
        }
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
    last_visit: r.visits?.last
      ? `${visitLine(r.visits.last, r.visits.timezone, nowMs)} · ${r.visits.last.title}`
      : null,
  };
}

async function searchPeople(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const q = str(input.query, 80).toLowerCase();
  const listId = str(input.list, 40);
  const list = listId ? PEOPLE_LISTS.find((l) => l.id === listId) : null;
  if (listId && !list) return { error: `list must be one of ${PEOPLE_LISTS.map((l) => l.id).join(", ")}` };
  // With their appointments, so "who asked but never booked?" and "who is
  // booked this week?" are answered from the calendar, not guessed.
  const pool = await audiencePoolOnce(t.memo, t.ctx, t.tenantId, t.timezone, t.now);
  const { people: rows, calendar } = pool;
  const vmOf = new Map(pool.rows.map((v) => [v.id, v]));
  if (list?.needsCalendar && calendar.state !== "ok")
    return { error: "that list needs the calendar connected under Settings › Business", people: [] };
  // The deal lists exist only where deals are on here (dealsAreOn, 0008), as on the page and in list_audiences. The
  // refusal names the condition that failed: Consultation booked needs the consult-first service itself as well.
  if (list?.needsConsultFirst && !pool.consult_first)
    return {
      error: "that list exists only where the profile lists a consult-first service under Settings › Business",
      people: [],
    };
  if (list?.needsDeals && !pool.deals_on)
    return {
      error: `that list exists only where deals are on: the workspace answers "${SELLS_BY_QUESTION}" with "${SELLS_BY_WORDS.proposal.label}"`,
      people: [],
    };
  const digits = q.replace(/\D/g, "");
  const hits = rows.filter((r) => {
    if (list && !list.test(vmOf.get(r.id)!)) return false;
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
    list: list?.id ?? null,
    matches: hits.length,
    people: picked.map((r) => personLine(r, t.timezone, t.now.getTime())),
  };
}

async function getPerson(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const id = str(input.contact_id);
  if (!UUID.test(id)) return { error: "contact_id must be an id a tool returned" };
  const sb = t.ctx.supabase;
  const { data: rows, error } = await sb.rpc("people_list", { p_tenant_id: t.tenantId, p_contact_id: id });
  if (error) throw new Error(error.message);
  const row = (rows ?? [])[0] as PersonRowDto | undefined;
  if (!row) return { error: "no such person in this workspace" };
  const [convs, calls, personPol, wsPol, own, sellsBy] = await Promise.all([
    sb
      .from("conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("tenant_id", t.tenantId)
      .eq("contact_id", id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(20),
    sb
      .from("calls")
      .select(CALL_COLUMNS)
      .eq("tenant_id", t.tenantId)
      .eq("contact_id", id)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(50),
    sb
      .from("policies")
      .select("mode")
      .eq("tenant_id", t.tenantId)
      .eq("class", "reply")
      .eq("subject_type", "contact")
      .eq("subject_id", id)
      .maybeSingle(),
    sb
      .from("policies")
      .select("mode")
      .eq("tenant_id", t.tenantId)
      .eq("class", "reply")
      .is("subject_type", null)
      .maybeSingle(),
    // The owner's proposal link (00154): people_list does not carry it, and About should say "Proposal: <host>"
    // so a card can carry the address into a reply.
    sb.from("contacts").select("proposal_url").eq("id", id).maybeSingle(),
    // How the workspace's customers buy (0008): the deal and its proposal are said only where deals are on.
    sellsByOf(t.ctx, t.tenantId),
  ]);
  if (convs.error) throw new Error(convs.error.message);
  if (calls.error) throw new Error(calls.error.message);
  if (own.error) throw new Error(own.error.message);
  const convIds = (convs.data ?? []).map((c) => c.id);
  let byConv = new Map<string, MessageDto[]>();
  let escalations: PersonEscalationDto[] = [];
  let decisions: PersonDecisionDto[] = [];
  if (convIds.length) {
    const [msgs, escs, decs] = await Promise.all([
      sb
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(400),
      sb
        .from("escalations")
        .select("id, conversation_id, reason, state, details, created_at, updated_at, resolved_by_user_id")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(50),
      sb
        .from("decisions")
        .select("id, verb, subject_type, subject_id, actor_type, actor_user_id, created_at, payload")
        .eq("subject_type", "conversation")
        .in("subject_id", convIds)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    byConv = groupMessages(msgs.data ?? []);
    escalations = escs.data ?? [];
    decisions = (decs.data ?? []).map((d) => ({ ...d, payload: d.payload as Record<string, unknown> | null }));
  }
  // Their notes (0007): the team's own words about them, which Ask reads as the team does -- team-only ones too.
  const notesRead = await personNotesRead(t.ctx, t.tenantId, id);
  const detail: PersonDetailDto = {
    row: { ...row, effective_reply_mode: personPol.data?.mode ?? wsPol.data?.mode ?? null },
    identities: [],
    ...(notesRead.notes ? { person_notes: notesRead.notes } : {}),
    conversations: (convs.data ?? []).map((c) => toConversationDto(c, byConv.get(c.id) ?? [], t.ctx.userId)),
    calls: (calls.data ?? []).map(toCallDto),
    escalations,
    decisions,
    receptionist_mode: personPol.data?.mode ?? null,
    workspace_reply_mode: wsPol.data?.mode ?? null,
    proposal_url: own.data?.proposal_url ?? null,
    deals_on: dealsAreOn(sellsBy),
  };
  const vm = toPersonVM(detail, t.timezone, t.now);
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
  const { timezone } = await tenantFacts(t.ctx.supabase, t.tenantId);
  const calls = await loadCalls(t);
  const today = dayKey(t.now.toISOString(), timezone);
  const vms = calls.map((c) => toCallVM(c, timezone, t.now));
  const abandoned = new Set(calls.filter(abandonedCall).map((c) => c.id));
  const picked = vms
    .filter((v, i) => {
      const c = calls[i];
      switch (filter) {
        case "missed":
          return v.outcome === "missed" && dayKey(c.started_at, timezone) === today;
        case "abandoned":
          return abandoned.has(c.id) && dayKey(c.started_at, timezone) === today;
        case "today":
          return dayKey(c.started_at, timezone) === today;
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
  const { data, error } = await t.ctx.supabase.from("calls").select(CALL_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { error: "no such call in this workspace" };
  const v = toCallVM(toCallDto(data), t.timezone, t.now);
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
  const [{ name, timezone }, cfgRow, policies, channels] = await Promise.all([
    tenantFacts(sb, t.tenantId),
    sb.from("tenant_config").select("config, version").eq("tenant_id", t.tenantId).maybeSingle(),
    listPolicies(sb, t.tenantId).catch(() => []),
    sb.from("tenant_channels").select("kind, status, number_e164").eq("tenant_id", t.tenantId),
  ]);
  const cfg = parseTenantConfig(cfgRow.data?.config ?? null);
  const facts = workspaceFacts(name, timezone, cfgRow.data?.config ?? null, policies);
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
    config_version: cfgRow.data?.version ?? null,
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
): ToolContext {
  return { ctx, tenantId, role, timezone, read: emptyReadSet(), now, memo: new Map() };
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
  const audiences = [
    { kind: "everyone", audience_id: null, label: EVERYONE_LABEL, ...sizes("everyone", null, null) },
    // The page's lists: a calendar's lists only when there is a calendar to read them from; the deal lists only
    // where deals are on here (dealsAreOn, 0008).
    ...PEOPLE_LISTS.filter(
      (l) =>
        l.id !== "opted_in" &&
        l.id !== "offers_ok" &&
        l.id !== "opted_out" &&
        (!l.needsCalendar || pool.calendar.state === "ok") &&
        (!l.needsConsultFirst || pool.consult_first) &&
        (!l.needsDeals || pool.deals_on),
    ).map((l) => ({
      kind: "list",
      audience_id: l.id,
      label: l.label,
      ...sizes("list", l.id, null),
    })),
    ...lists.map((s) => ({
      kind: "saved",
      audience_id: s.id,
      label: s.name,
      ...sizes("saved", null, savedListIds(s, rows, t.now.getTime(), pool.calendar.state === "ok")),
    })),
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
  const [rows, facts, policies, pool] = await Promise.all([
    listPlaybooks(t.ctx, t.tenantId),
    tenantFacts(t.ctx.supabase, t.tenantId),
    listPolicies(t.ctx.supabase, t.tenantId).catch(() => []),
    audiencePoolOnce(t.memo, t.ctx, t.tenantId, t.timezone, t.now),
  ]);
  const modes = new Map(policies.map((r) => [r.class, r.mode]));
  const modeOf = (cls: string) => modes.get(cls) ?? "ask";
  // With their appointments: the visit triggers count from the calendar.
  const vm = pool.rows;
  const untouched = { byThis: new Map<string, number>(), byAny: new Map<string, number>() };
  // Who each moment names that said the yes its template needs, and who of them
  // a run reaches, by the runner's own draw before anyone has heard from a
  // playbook. `said_yes_now` was the reach, so a moment whose yes had no number
  // to send to read as nobody's yes.
  const moment = (trigger: string) => {
    const drawn = playbookRunReach(
      vm,
      {
        trigger: trigger as (typeof PLAYBOOK_TRIGGERS)[number]["id"],
        cap_per_run: 100_000,
        gap_days: 0,
        cadence_days: 0,
      },
      untouched,
      t.now.getTime(),
    );
    return { said_yes_now: drawn.saidYes, can_be_sent_now: drawn.reach.will };
  };
  return {
    route: "outbound",
    timezone: facts.timezone,
    modes: { reengage: modeOf("reengage"), campaign: modeOf("campaign"), booking: modeOf("booking") },
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
      runs: p.totals.runs,
      sent: p.totals.sent,
      replied: p.totals.replied,
      waiting: p.totals.waiting
        ? { broadcast_id: p.totals.waiting.id, people: p.totals.waiting.recipient_count }
        : null,
    })),
    triggers: PLAYBOOK_TRIGGERS.map((x) => ({
      trigger: x.id,
      label: x.label,
      when: x.hint,
      policy_class: x.cls,
      ...moment(x.id),
      starter_template: starterForTrigger(x.id)?.title ?? null,
    })),
    note: `A run is a broadcast, and ${NO_NUMBER_REACH}. It never reaches anyone twice within the playbook's gap, and sends one playbook message per person per week. said_yes_now counts who each trigger names that said the yes its template needs, a number or not; can_be_sent_now is who of them a run reaches. When can_be_sent_now is 0 and said_yes_now is not, the ones who said yes have no number: say so, and never send the owner to get a yes they already have. Nothing here has run because you read it.`,
  };
}

const WEEKDAY_KEYS: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** The calendar for a day or a few, in the words the page uses. */
async function getCalendar(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const facts = await tenantFacts(t.ctx.supabase, t.tenantId);
  const todayKey = dayInZone(facts.timezone, t.now.getTime()).key;
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
  const vm = toCalendarVM(await calendarWeek(t.ctx, t.tenantId, { from, days }, t.now), t.now);
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
    note: "Taken is the owner's own calendar; open is what the receptionist would offer a caller. Nothing is booked from here — the booking link does that.",
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
 * and the three counts. Nothing is started by reading it, and every string is
 * cut to 120 characters so a long ask cannot fill a turn.
 */
async function listLeadSearches(t: ToolContext): Promise<unknown> {
  const rows = await listSearches(t.ctx, t.tenantId);
  const cut = (v: string | null | undefined) => (typeof v === "string" ? v.slice(0, 120) : "");
  return {
    route: "clients/leads",
    searches: rows.map((r) => ({
      id: r.id,
      name: cut(r.name),
      asked: cut(r.asked),
      asked_on: r.created_at.slice(0, 10),
      state: r.state ? (ROUND_WORDS[r.state] ?? r.state) : "not started",
      ending: r.ending ? (LEAD_ENDING_WORDS[r.ending as LeadRoundEnding] ?? null) : null,
      qualified: r.qualified,
      review: r.review,
      counted: r.counted,
    })),
    note: "Counted is what came off this month's leads. Nothing here has started or changed because you read it; a new search is propose_lead_search, which becomes a card the owner approves.",
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
