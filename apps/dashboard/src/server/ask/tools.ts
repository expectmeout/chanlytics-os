import "server-only";
import {
  ASK_CAPS,
  ASK_FINISH_JSON_SCHEMA,
  EVERYONE_LABEL,
  PEOPLE_LISTS,
  eligibleFor,
  numberHealth,
  toPersonRowVM,
  ESCALATION_REASON_LABELS,
  PERSON_STATE_LABELS,
  REPORT_RANGES,
  ago,
  emptyReadSet,
  messageText,
  parseTenantConfig,
  personName,
  replyWhy,
  toCallVM,
  toInboxThreadVM,
  toPersonVM,
  toReportVM,
  toTodayVM,
  type AskReadSet,
  type CallDto,
  type ConversationDto,
  type EscalationDto,
  type MessageDto,
  type MetricsSummaryDto,
  type PersonDetailDto,
  type PersonDecisionDto,
  type PersonEscalationDto,
  type PersonRowDto,
  type ReportDto,
} from "@chanlytics/contracts";
import { listPolicies } from "@chanlytics/db";
import type { RouteContext } from "../with-route";
import { CALL_COLUMNS, CONVERSATION_COLUMNS, MESSAGE_COLUMNS, groupMessages, toCallDto, toConversationDto } from "../dto";
import { listPeople } from "../people";
import { tenantFacts } from "../tenant";
import { openingsFor } from "./openings";
import { ASK_DEFINITIONS, workspaceFacts } from "./prompt";

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

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

export const READ_TOOLS: ToolDef[] = [
  {
    name: "get_today",
    description: "The Today page: who needs a person right now, drafts about to send, today's calls, the standing of the receptionist and the day's counts. Start here for 'how are we doing', 'what needs me', 'brief me'.",
    input_schema: obj({}),
  },
  {
    name: "list_threads",
    description: "WhatsApp threads from the Inbox, each with its last three messages (who wrote, what). filter: needs_you (handed to a person), held (a draft waiting to send), waiting (taken over by a person), snoozed, recent (all, newest first). Call get_thread only when more of one conversation is needed.",
    input_schema: obj({ filter: { type: "string", enum: ["needs_you", "held", "waiting", "snoozed", "recent"] } }, ["filter"]),
  },
  {
    name: "get_thread",
    description: "One WhatsApp conversation: the person, its state, the last messages with who wrote them, and why the receptionist answered or held as it did. Use the conversation id from list_threads, get_today or search_people. more=true returns the longer history.",
    input_schema: obj({ conversation_id: { type: "string" }, more: { type: "boolean" } }, ["conversation_id"]),
  },
  {
    name: "search_people",
    description: "Find people (customers and callers) by name or phone digits. Returns their state, last contact and receptionist mode. Empty query lists the most recent people.",
    input_schema: obj({ query: { type: "string" } }, ["query"]),
  },
  {
    name: "get_person",
    description: "One person's profile: right now, facts, their conversations and calls, and their timeline. Use a contact id from search_people or get_thread.",
    input_schema: obj({ contact_id: { type: "string" } }, ["contact_id"]),
  },
  {
    name: "list_calls",
    description: "Phone calls. filter: missed (today's missed calls), today, live (on the line now), recent (newest first).",
    input_schema: obj({ filter: { type: "string", enum: ["missed", "today", "live", "recent"] } }, ["filter"]),
  },
  {
    name: "get_call",
    description: "One phone call: who, when, how it ended, the summary and the transcript (capped). Use the call id from list_calls or get_person.",
    input_schema: obj({ call_id: { type: "string" } }, ["call_id"]),
  },
  {
    name: "get_report",
    description: "The Reports page for 7, 30 or 90 days: answered by the receptionist vs by a person, reply time, calls, new people, escalation reasons, and the change against the previous period.",
    input_schema: obj({ days: { type: "integer", enum: [7, 30, 90] } }, ["days"]),
  },
  {
    name: "get_settings",
    description: "The workspace's settings as the receptionist runs on them: hours, closures, services, notes, guardrails, booking rules, the reply policy and its dials, which channels are connected, notifications.",
    input_schema: obj({}),
  },
  {
    name: "get_openings",
    description: "Open times from the connected calendar against the business hours, closures and booking rules. day: a weekday (mon..sun) or a date (YYYY-MM-DD), or empty for the next days. service: the service name to size the slot, or empty.",
    input_schema: obj({ day: { type: "string" }, service: { type: "string" } }, ["day", "service"]),
  },
  {
    name: "list_audiences",
    description: "The audiences a broadcast may go to — everyone who said yes, every People list, every list kept by hand — each with how many said yes to offers and have a number; the approved WhatsApp templates with their values; and whether the number may send. Read this before proposing a broadcast.",
    input_schema: obj({}, []),
  },
  {
    name: "explain_metric",
    description: "What a word on the pages means: needs you, waiting on you, held draft, answering, snoozed, opted out, 24-hour window, escalation, confidence dial, token budget, veto window, missed call, median reply time.",
    input_schema: obj({ term: { type: "string" } }, ["term"]),
  },
];

export const FINISH_TOOL: ToolDef = {
  name: "finish",
  description: "Your answer to the person. Call it exactly once, after the reads you needed. The answer is plain text in their language; citations name only ids the tools returned this turn.",
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

interface EscRow extends EscalationDto { conversation_id: string }

/** The newest conversations with their messages: enough for the Inbox's rows, not the whole history. */
const CONVERSATIONS = 40;
const MESSAGES = 600;

function loadConversations(t: ToolContext, limit = CONVERSATIONS): Promise<{ convs: ConversationDto[]; escalations: EscRow[] }> {
  return memoised(t, `conversations:${limit}`, () => loadConversationsNow(t, limit));
}

async function loadConversationsNow(t: ToolContext, limit: number): Promise<{ convs: ConversationDto[]; escalations: EscRow[] }> {
  const { supabase, userId } = t.ctx;
  const [c, e] = await Promise.all([
    supabase.from("conversations").select(CONVERSATION_COLUMNS).eq("tenant_id", t.tenantId).order("last_message_at", { ascending: false, nullsFirst: false }).limit(limit),
    supabase.from("escalations").select("id, reason, details, state, created_at, conversation_id").eq("tenant_id", t.tenantId).eq("state", "open").order("created_at", { ascending: false }).limit(100),
  ]);
  if (c.error) throw new Error(c.error.message);
  if (e.error) throw new Error(e.error.message);
  const ids = (c.data ?? []).map((x) => x.id);
  let byConv = new Map<string, MessageDto[]>();
  if (ids.length) {
    const m = await supabase.from("messages").select(MESSAGE_COLUMNS).in("conversation_id", ids).order("created_at", { ascending: false }).limit(MESSAGES);
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
    const { data, error } = await t.ctx.supabase.from("calls").select(CALL_COLUMNS).eq("tenant_id", t.tenantId).order("started_at", { ascending: false, nullsFirst: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toCallDto);
  });
}

function dayKey(iso: string | null | undefined, tz: string): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- tools */

async function getToday(t: ToolContext): Promise<unknown> {
  const { supabase } = t.ctx;
  const [m, { convs, escalations }, calls] = await Promise.all([
    supabase.rpc("metrics_summary", { p_tenant_id: t.tenantId, p_days: 1 }),
    loadConversations(t),
    loadCalls(t).catch(() => [] as CallDto[]),
  ]);
  if (m.error) throw new Error(m.error.message);
  const metrics = m.data as unknown as MetricsSummaryDto;
  if (!metrics || (metrics as unknown as { error?: string }).error) throw new Error("metrics unavailable");
  const vm = toTodayVM(metrics, convs, escalations, calls, t.now);
  for (const r of vm.needsYou?.rows ?? []) t.read.thread.add(r.conversationId);
  for (const c of calls) t.read.call.add(c.id);
  return {
    standing: { headline: vm.standing.headline, detail: vm.standing.detail, tone: vm.standing.tone, chips: vm.standing.chips.map((c) => c.text) },
    needs_you: vm.needsYou
      ? { count: vm.needsYou.count, rows: vm.needsYou.rows.slice(0, ASK_CAPS.needsRows).map((r) => ({ conversation_id: r.conversationId, route: `inbox/th-${r.conversationId}`, who: r.who, reason: r.reason, waited: r.waited, quote: r.quote })) }
      : null,
    drafts_about_to_send: vm.windowClosing ? vm.windowClosing.rows.map((r) => r.text) : [],
    recap: vm.recap ? { sentences: vm.recap.sentences.map((s) => s.text), facts: vm.recap.facts.map((f) => `${f.label}: ${f.value}`) } : null,
    calls: vm.calls ? { line: vm.calls.line, rows: vm.calls.rows.slice(0, 5).map((r) => ({ call_id: r.id.replace(/^cv-/, ""), route: `conversations/${r.id}`, who: r.who, at: r.at, duration: r.duration, note: r.note })) } : null,
    quiet: vm.quiet ? { headline: vm.quiet.headline, sub: vm.quiet.sub } : null,
    period: { messages_in: metrics.period.messages_in, answered_by_receptionist: metrics.period.answered_by_ai, answered_by_you: metrics.period.answered_by_you, unanswered: metrics.period.unanswered_in_window, calls: metrics.period.calls, new_people: metrics.period.new_contacts },
  };
}

async function listThreads(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const filter = str(input.filter) || "recent";
  const { convs, escalations } = await loadConversations(t);
  const byConv = new Map(escalations.map((e) => [e.conversation_id, e]));
  const vms = convs.map((c) => toInboxThreadVM(c, byConv.get(c.id) ?? null, t.now));
  const picked = vms.filter((v) => {
    switch (filter) {
      case "needs_you": return v.needsYou;
      case "held": return !!v.veto || !!v.heldDraft;
      case "waiting": return v.takenOver;
      case "snoozed": return v.state === "snoozed";
      default: return true;
    }
  }).slice(0, ASK_CAPS.threads);
  for (const v of picked) t.read.thread.add(v.conversationId);
  return {
    filter,
    total_matching: vms.filter((v) => picked.includes(v) || filter === "recent").length,
    threads: picked.map((v) => ({
      conversation_id: v.conversationId,
      route: `inbox/th-${v.conversationId}`,
      who: v.who,
      state: v.needsYou ? "needs you" : v.takenOver ? "waiting on you" : v.state === "snoozed" ? "snoozed" : v.optedOut ? "opted out" : "answering",
      held_draft: v.veto ? { message_id: v.veto.messageId, text: v.veto.draft.slice(0, 200), why: v.veto.why?.summary ?? null } : v.heldDraft ? { message_id: v.heldDraft.messageId, text: v.heldDraft.body.slice(0, 200) } : null,
      last_message: v.preview.slice(0, 160),
      recent: v.timeline
        .filter((x): x is Extract<typeof x, { type: "msg" }> => x.type === "msg")
        .slice(-3)
        .map((x) => ({ from: x.from === "client" ? "customer" : x.byYou ? "you" : "receptionist", text: x.body.slice(0, 140) })),
      last_at: v.lastAtFull,
      waiting_min: v.waitingMin ?? null,
      window_open: v.windowOpen,
      tags: v.tags,
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
    supabase.from("messages").select(MESSAGE_COLUMNS).eq("conversation_id", id).order("created_at", { ascending: false }).limit(cap),
    supabase.from("escalations").select("id, reason, details, state, created_at, conversation_id").eq("conversation_id", id).eq("state", "open").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (merr) throw new Error(merr.message);
  const dto = toConversationDto(conv, [...(msgs ?? [])].reverse().map((m) => ({
    id: m.id, direction: m.direction as MessageDto["direction"], sender: m.sender as MessageDto["sender"], type: m.type, body: m.body,
    media: null, meta: m.meta as MessageDto["meta"], status: m.status, created_at: m.created_at, channel_ts: m.channel_ts,
  })), t.ctx.userId);
  const vm = toInboxThreadVM(dto, (esc as EscalationDto | null) ?? null, t.now);
  t.read.thread.add(id);
  t.read.conversation.add(id);
  if (dto.contact.id) t.read.person.add(dto.contact.id);
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return {
    conversation_id: id,
    route: `inbox/th-${id}`,
    contact_id: dto.contact.id || null,
    contact_route: dto.contact.id ? `clients/${dto.contact.id}` : null,
    who: vm.who,
    state: vm.needsYou ? "needs you" : vm.takenOver ? "waiting on you" : vm.state === "snoozed" ? "snoozed" : vm.optedOut ? "opted out" : "answering",
    escalation: esc ? { id: (esc as EscalationDto).id, reason: ESCALATION_REASON_LABELS[(esc as EscalationDto).reason] ?? (esc as EscalationDto).reason, details: (esc as EscalationDto).details } : null,
    window_open: vm.windowOpen,
    held_draft: vm.veto ? { message_id: vm.veto.messageId, text: vm.veto.draft, why: vm.veto.why ? { summary: vm.veto.why.summary, reason: vm.veto.why.reason, facts: vm.veto.why.facts } : null } : null,
    messages: dto.messages.slice(-cap).map((m) => {
      const why = replyWhy(m.meta as Record<string, unknown> | null);
      return {
        at: fmt.format(new Date(m.created_at)),
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

function personLine(r: PersonRowDto, nowMs: number) {
  const stateKey = r.dnc ? "opted_out" : r.needs_human ? "needs_you" : "active";
  return {
    contact_id: r.id,
    route: `clients/${r.id}`,
    name: personName(r),
    state: PERSON_STATE_LABELS[stateKey as keyof typeof PERSON_STATE_LABELS] ?? stateKey,
    last_contact: r.last_message_at ? ago(nowMs - Date.parse(r.last_message_at), nowMs) : r.last_call_at ? ago(nowMs - Date.parse(r.last_call_at), nowMs) : "never",
    last_message: r.last_inbound_text ? r.last_inbound_text.slice(0, 120) : null,
    conversation_id: r.latest_conversation_id,
    channels: r.channels ?? [],
    consent: r.consent,
    receptionist_mode: r.effective_reply_mode ?? null,
    calls: r.call_count ?? 0,
  };
}

async function searchPeople(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const q = str(input.query, 80).toLowerCase();
  const rows = await listPeople(t.ctx, t.tenantId);
  const digits = q.replace(/\D/g, "");
  const hits = rows.filter((r) => {
    if (!q) return true;
    const name = personName(r).toLowerCase();
    if (name.includes(q)) return true;
    if (digits.length >= 4 && (r.phone_e164 ?? "").replace(/\D/g, "").includes(digits)) return true;
    return false;
  });
  hits.sort((a, b) => (Date.parse(b.last_message_at ?? b.last_call_at ?? "") || 0) - (Date.parse(a.last_message_at ?? a.last_call_at ?? "") || 0));
  const picked = hits.slice(0, ASK_CAPS.people);
  for (const r of picked) {
    t.read.person.add(r.id);
    if (r.latest_conversation_id) t.read.thread.add(r.latest_conversation_id);
  }
  return { query: q, matches: hits.length, people: picked.map((r) => personLine(r, t.now.getTime())) };
}

async function getPerson(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const id = str(input.contact_id);
  if (!UUID.test(id)) return { error: "contact_id must be an id a tool returned" };
  const sb = t.ctx.supabase;
  const { data: rows, error } = await sb.rpc("people_list", { p_tenant_id: t.tenantId, p_contact_id: id });
  if (error) throw new Error(error.message);
  const row = (rows ?? [])[0] as PersonRowDto | undefined;
  if (!row) return { error: "no such person in this workspace" };
  const [convs, calls, personPol, wsPol] = await Promise.all([
    sb.from("conversations").select(CONVERSATION_COLUMNS).eq("tenant_id", t.tenantId).eq("contact_id", id).order("last_message_at", { ascending: false, nullsFirst: false }).limit(20),
    sb.from("calls").select(CALL_COLUMNS).eq("tenant_id", t.tenantId).eq("contact_id", id).order("started_at", { ascending: false, nullsFirst: false }).limit(50),
    sb.from("policies").select("mode").eq("tenant_id", t.tenantId).eq("class", "reply").eq("subject_type", "contact").eq("subject_id", id).maybeSingle(),
    sb.from("policies").select("mode").eq("tenant_id", t.tenantId).eq("class", "reply").is("subject_type", null).maybeSingle(),
  ]);
  if (convs.error) throw new Error(convs.error.message);
  if (calls.error) throw new Error(calls.error.message);
  const convIds = (convs.data ?? []).map((c) => c.id);
  let byConv = new Map<string, MessageDto[]>();
  let escalations: PersonEscalationDto[] = [];
  let decisions: PersonDecisionDto[] = [];
  if (convIds.length) {
    const [msgs, escs, decs] = await Promise.all([
      sb.from("messages").select(MESSAGE_COLUMNS).in("conversation_id", convIds).order("created_at", { ascending: false }).limit(400),
      sb.from("escalations").select("id, conversation_id, reason, state, details, created_at, updated_at, resolved_by_user_id").in("conversation_id", convIds).order("created_at", { ascending: false }).limit(50),
      sb.from("decisions").select("id, verb, subject_type, subject_id, actor_type, actor_user_id, created_at, payload").eq("subject_type", "conversation").in("subject_id", convIds).order("created_at", { ascending: false }).limit(100),
    ]);
    byConv = groupMessages(msgs.data ?? []);
    escalations = escs.data ?? [];
    decisions = (decs.data ?? []).map((d) => ({ ...d, payload: d.payload as Record<string, unknown> | null }));
  }
  const detail: PersonDetailDto = {
    row: { ...row, effective_reply_mode: personPol.data?.mode ?? wsPol.data?.mode ?? null },
    identities: [],
    conversations: (convs.data ?? []).map((c) => toConversationDto(c, byConv.get(c.id) ?? [], t.ctx.userId)),
    calls: (calls.data ?? []).map(toCallDto),
    escalations,
    decisions,
    receptionist_mode: personPol.data?.mode ?? null,
    workspace_reply_mode: wsPol.data?.mode ?? null,
  };
  const vm = toPersonVM(detail, t.now);
  t.read.person.add(id);
  for (const c of detail.conversations) { t.read.thread.add(c.id); t.read.conversation.add(c.id); }
  for (const c of detail.calls) t.read.call.add(c.id);
  return {
    contact_id: id,
    route: `clients/${id}`,
    name: vm.name,
    since: vm.since,
    right_now: { title: vm.rightNow.title, detail: vm.rightNow.detail },
    facts: vm.facts.map((f) => `${f.label}: ${f.value}${f.meta ? ` (${f.meta})` : ""}`),
    about: vm.about.map((a) => `${a.k}: ${a.v}`),
    receptionist_mode: vm.receptionistMode,
    last_exchange: vm.lastExchange,
    open_conversation_id: vm.openThread ? vm.openThread.replace(/^th-/, "") : null,
    conversations: detail.conversations.slice(0, 5).map((c) => ({ conversation_id: c.id, route: `inbox/th-${c.id}`, state: c.state, last_at: c.last_message_at })),
    calls: detail.calls.slice(0, 5).map((c) => ({ call_id: c.id, route: `conversations/cv-${c.id}`, at: c.started_at, status: c.status })),
    timeline: vm.timeline.slice(0, 20).map((i) => ({ day: i.day, time: i.time, kind: i.kind, who: i.who, text: i.text.slice(0, 240) })),
  };
}

async function listCalls(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const filter = str(input.filter) || "recent";
  const { timezone } = await tenantFacts(t.ctx.supabase, t.tenantId);
  const calls = await loadCalls(t);
  const today = dayKey(t.now.toISOString(), timezone);
  const vms = calls.map((c) => toCallVM(c, t.now));
  const picked = vms.filter((v, i) => {
    const c = calls[i];
    switch (filter) {
      case "missed": return v.outcome === "missed" && dayKey(c.started_at, timezone) === today;
      case "today": return dayKey(c.started_at, timezone) === today;
      case "live": return v.outcome === "live";
      default: return true;
    }
  }).slice(0, ASK_CAPS.calls);
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
  const v = toCallVM(toCallDto(data), t.now);
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
    transcript: v.transcript.slice(0, ASK_CAPS.transcript).map((x) => `${x.speaker === "client" ? "caller" : x.speaker}: ${x.text}`),
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
    by_day: vm.answered.points.slice(-14).map((p) => ({ day: p.short, in: p.in, receptionist: p.ai, you: p.you, unanswered: p.none })),
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
  const facts = workspaceFacts(name, timezone, cfgRow.data?.config ?? null);
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
    notifications: cfg?.notifications ? { escalation_emails: t.role === "owner" ? cfg.notifications.escalation_emails : cfg.notifications.escalation_emails.length } : null,
    policies: policies.map((p) => ({ class: p.class, mode: p.mode, limits: p.limits })),
    channels: (channels.data ?? []).map((c) => ({ kind: c.kind, status: c.status, number: c.number_e164 })),
    config_version: cfgRow.data?.version ?? null,
  };
}

async function getOpenings(t: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const r = await openingsFor(t.ctx, t.tenantId, { day: str(input.day, 20) || null, service: str(input.service, 80) || null }, t.now);
  return { state: r.state, text: r.text, days: r.days, service: r.service?.name ?? null };
}

function explainMetric(input: Record<string, unknown>): unknown {
  const term = str(input.term, 60).toLowerCase();
  const key = Object.keys(ASK_DEFINITIONS).find((k) => k === term || term.includes(k) || k.includes(term));
  return key ? { term: key, meaning: ASK_DEFINITIONS[key] } : { error: "no definition for that term", terms: Object.keys(ASK_DEFINITIONS) };
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
  explain_metric: "Checking a definition",
};

export function toolLabel(name: string): string {
  return LABELS[name] ?? `Running ${name}`;
}

export function newToolContext(ctx: RouteContext, tenantId: string, role: ToolContext["role"], now = new Date()): ToolContext {
  return { ctx, tenantId, role, read: emptyReadSet(), now, memo: new Map() };
}

/** Run one read. A tool's own failure is returned to the model as an error result, never thrown. */
/**
 * The audiences a broadcast may go to, counted by the same contracts
 * predicate the route enrols with and the page shows — so the number the
 * assistant says is the number the card will carry.
 */
async function listAudiences(t: ToolContext): Promise<unknown> {
  const [people, segs, members, tpls, ch] = await Promise.all([
    memoised(t, "people_rows", () => listPeople(t.ctx, t.tenantId)),
    t.ctx.supabase.from("segments").select("id, name").eq("tenant_id", t.tenantId).order("name"),
    t.ctx.supabase.from("segment_members").select("segment_id, contact_id").eq("tenant_id", t.tenantId),
    t.ctx.supabase.from("templates").select("id, name, language, category, variables, body_preview").eq("tenant_id", t.tenantId).eq("channel", "whatsapp").eq("meta_status", "approved").order("name"),
    t.ctx.supabase.from("tenant_channels").select("number_e164, config").eq("tenant_id", t.tenantId).eq("kind", "whatsapp").eq("status", "active").limit(1).maybeSingle(),
  ]);
  const rows = people.map((r) => toPersonRowVM(r, t.now));
  const byList = new Map<string, Set<string>>();
  for (const m of members.data ?? []) {
    const s = byList.get(m.segment_id) ?? new Set<string>();
    s.add(m.contact_id);
    byList.set(m.segment_id, s);
  }
  const audiences = [
    { kind: "everyone", audience_id: null, label: EVERYONE_LABEL, said_yes: eligibleFor(rows, "everyone", null, null).length },
    ...PEOPLE_LISTS.filter((l) => l.id !== "opted_in" && l.id !== "opted_out").map((l) => ({ kind: "list", audience_id: l.id, label: l.label, said_yes: eligibleFor(rows, "list", l.id, null).length })),
    ...(segs.data ?? []).map((s) => ({ kind: "saved", audience_id: s.id, label: s.name, said_yes: eligibleFor(rows, "saved", null, byList.get(s.id) ?? new Set<string>()).length })),
  ];
  const cfg = (ch.data?.config && typeof ch.data.config === "object" && !Array.isArray(ch.data.config) ? ch.data.config : {}) as Record<string, unknown>;
  const s = (k: string) => (typeof cfg[k] === "string" ? (cfg[k] as string) : null);
  const health = numberHealth({ quality: s("quality_rating"), event: s("quality_event"), limit: s("messaging_limit") });
  return {
    route: "broadcasts",
    audiences,
    templates: (tpls.data ?? []).map((x) => ({
      template_id: x.id, name: x.name, language: x.language, category: x.category,
      values: Array.isArray(x.variables) ? (x.variables as { position?: number; label?: string; example?: string | null }[]).map((v) => ({ position: v.position, label: v.label, example: v.example ?? null })) : [],
      body: x.body_preview,
    })),
    number: { present: !!ch.data, health: health.label, can_send: health.canSend, limit_per_day: health.limitPerDay === Number.POSITIVE_INFINITY ? null : health.limitPerDay },
    note: "Only people who said yes can be on a broadcast; the counts are exactly them.",
  };
}

export async function runTool(t: ToolContext, run: ToolRun): Promise<ToolOutcome> {
  const label = toolLabel(run.name);
  try {
    let out: unknown;
    switch (run.name) {
      case "get_today": out = await getToday(t); break;
      case "list_threads": out = await listThreads(t, run.input); break;
      case "get_thread": out = await getThread(t, run.input); break;
      case "search_people": out = await searchPeople(t, run.input); break;
      case "get_person": out = await getPerson(t, run.input); break;
      case "list_calls": out = await listCalls(t, run.input); break;
      case "get_call": out = await getCall(t, run.input); break;
      case "get_report": out = await getReport(t, run.input); break;
      case "get_settings": out = await getSettings(t); break;
      case "get_openings": out = await getOpenings(t, run.input); break;
      case "list_audiences": out = await listAudiences(t); break;
      case "explain_metric": out = explainMetric(run.input); break;
      default: return { result: json({ error: `unknown tool ${run.name}` }), isError: true, label };
    }
    const isError = !!(out && typeof out === "object" && "error" in (out as Record<string, unknown>) && Object.keys(out as object).length <= 2);
    return { result: json(out), isError, label };
  } catch (e) {
    console.error("ask_tool_failed", JSON.stringify({ tool: run.name, error: e instanceof Error ? e.message : String(e) }));
    return { result: json({ error: "that read failed; say so and answer with what you have" }), isError: true, label };
  }
}

