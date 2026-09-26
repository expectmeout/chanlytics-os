import "server-only";
import {
  ESCALATION_REASON_LABELS,
  contactName,
  isHeldDraft,
  localToUtcMs,
  messageText,
  threadStanding,
  toCallVM,
  abandonedCall,
  type AskScope,
  type CallDto,
  type ConversationDto,
  type EscalationDto,
  type MessageDto,
} from "@chanlytics/contracts";
import type { AskReadSet } from "@chanlytics/contracts";
import {
  CALL_COLUMNS,
  CONVERSATION_COLUMNS,
  MESSAGE_COLUMNS,
  groupMessages,
  toCallDto,
  toConversationDto,
} from "../dto";
import { runTool, type ToolContext } from "./tools";

/**
 * The workspace right now, before the model is asked anything.
 *
 * Every turn used to start blind: the model's first round was almost always
 * "read Today, read the Inbox", and only its second could answer. The
 * snapshot is that first round, done in one parallel set of small queries
 * (~150 ms) and handed to the model as this turn's own block: who needs a
 * person, the drafts being held, the newest threads with their last three
 * messages, today's calls, and the counts. When the palette was opened on a
 * thread, a call or a person, that row rides along in full. Every row here
 * enters the read set, so the answer can cite it exactly as if a tool had
 * returned it.
 */

const THREADS = 8;
const MESSAGES_PER_THREAD = 3;
const CALLS = 8;
const HELD = 6;

export interface Snapshot {
  counts: {
    needs_you: number;
    held_drafts: number;
    calls_today: number;
    missed_today: number;
    abandoned_today: number;
    messages_in_today: number;
  };
  needs_you: Array<{
    conversation_id: string;
    route: string;
    who: string;
    reason: string;
    since: string;
    quote: string | null;
  }>;
  held_drafts: Array<{
    message_id: string;
    conversation_id: string;
    route: string;
    who: string;
    text: string;
    sends_at: string | null;
  }>;
  threads: Array<{
    conversation_id: string;
    route: string;
    who: string;
    person_route: string | null;
    state: string;
    last_at: string | null;
    recent: Array<{ from: string; text: string; at: string }>;
  }>;
  calls_today: Array<{
    call_id: string;
    route: string;
    who: string;
    person_route: string | null;
    at: string;
    duration: string | null;
    outcome: string;
    abandoned?: true;
    summary: string | null;
  }>;
  scoped: unknown;
  note: string;
}

function dayStartUtc(tz: string, now: Date): Date {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(now)
      .split("-")
      .map(Number);
    return new Date(localToUtcMs(tz, parts[0], parts[1], parts[2], 0, 0));
  } catch {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}

const fmtTime = (iso: string | null | undefined, tz: string): string => {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const fmtWhen = (iso: string | null | undefined, tz: string, now: Date): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay =
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d) ===
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  if (sameDay) return fmtTime(iso, tz);
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    }).format(d);
  } catch {
    return iso;
  }
};

const stateWord = (dto: ConversationDto, esc: EscalationDto | null, now: Date): string => {
  const s = threadStanding(dto, esc, now);
  if (s.needsYou) return "needs you";
  if (s.takenOver) return "waiting on you";
  if (s.state === "snoozed") return "snoozed";
  if (dto.contact.dnc) return "opted out";
  return "answering";
};

export async function buildSnapshot(t: ToolContext, timezone: string, scope: AskScope | null): Promise<Snapshot> {
  const { supabase } = t.ctx;
  const now = t.now;
  const dayStart = dayStartUtc(timezone, now).toISOString();
  const [convs, escs, held, calls, inbound] = await Promise.all([
    supabase
      .from("conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("tenant_id", t.tenantId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(THREADS),
    supabase
      .from("escalations")
      .select("id, reason, details, state, created_at, conversation_id")
      .eq("tenant_id", t.tenantId)
      .eq("state", "open")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("tenant_id", t.tenantId)
      .eq("sender", "ai")
      .eq("status", "queued")
      .order("created_at", { ascending: false })
      .limit(HELD),
    supabase
      .from("calls")
      .select(CALL_COLUMNS)
      .eq("tenant_id", t.tenantId)
      .gte("started_at", dayStart)
      .order("started_at", { ascending: false })
      .limit(CALLS),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", t.tenantId)
      .eq("direction", "inbound")
      .gte("created_at", dayStart),
  ]);
  for (const r of [convs, escs, held, calls]) if (r.error) throw new Error(r.error.message);

  const convRows = convs.data ?? [];
  const escRows = (escs.data ?? []) as Array<EscalationDto & { conversation_id: string }>;
  const byConv = new Map(escRows.map((e) => [e.conversation_id, e]));
  // The needs-you rows may sit below the newest eight; fetch the ones that do.
  const listed = new Set(convRows.map((c) => c.id));
  const missing = [...byConv.keys()].filter((id) => !listed.has(id)).slice(0, 10);
  const extra = missing.length
    ? ((await supabase.from("conversations").select(CONVERSATION_COLUMNS).in("id", missing)).data ?? [])
    : [];
  const allConvs = [...convRows, ...extra];
  const ids = allConvs.map((c) => c.id);
  let msgs = new Map<string, MessageDto[]>();
  if (ids.length) {
    const m = await supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(ids.length * 10);
    if (m.error) throw new Error(m.error.message);
    msgs = groupMessages(m.data ?? []);
  }
  const dtos = allConvs.map((c) => toConversationDto(c, msgs.get(c.id) ?? [], t.ctx.userId));

  const needs = dtos
    .filter((d) => threadStanding(d, byConv.get(d.id) ?? null, now).needsYou)
    .map((d) => {
      const esc = byConv.get(d.id) ?? null;
      const lastIn = [...d.messages].reverse().find((m) => m.direction === "inbound");
      t.read.thread.add(d.id);
      return {
        conversation_id: d.id,
        route: `inbox/th-${d.id}`,
        who: contactName(d),
        reason: esc ? (ESCALATION_REASON_LABELS[esc.reason] ?? esc.reason) : "handed to a person",
        since: fmtWhen(esc?.created_at ?? d.last_message_at, timezone, now),
        quote: lastIn ? messageText(lastIn).slice(0, 140) : null,
      };
    });

  const threads = dtos.slice(0, THREADS).map((d) => {
    t.read.thread.add(d.id);
    t.read.conversation.add(d.id);
    if (d.contact.id) t.read.person.add(d.contact.id);
    return {
      conversation_id: d.id,
      route: `inbox/th-${d.id}`,
      who: contactName(d),
      person_route: d.contact.id ? `clients/${d.contact.id}` : null,
      state: stateWord(d, byConv.get(d.id) ?? null, now),
      last_at: fmtWhen(d.last_message_at, timezone, now) || null,
      recent: d.messages.slice(-MESSAGES_PER_THREAD).map((m) => ({
        from: m.direction === "inbound" ? "customer" : m.sender === "ai" ? "receptionist" : "you",
        text: messageText(m).slice(0, 140),
        at: fmtWhen(m.created_at, timezone, now),
      })),
    };
  });

  const heldRows = ((held.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({
      id: row.id as string,
      conversation_id: row.conversation_id as string,
      direction: row.direction as MessageDto["direction"],
      sender: row.sender as MessageDto["sender"],
      type: row.type as string,
      body: row.body as string | null,
      media: null,
      meta: row.meta as MessageDto["meta"],
      status: row.status as string | undefined,
      created_at: row.created_at as string,
      channel_ts: row.channel_ts as string | null,
    }))
    .filter((m) => isHeldDraft(m as MessageDto))
    .map((m) => {
      const d = dtos.find((x) => x.id === m.conversation_id);
      t.read.thread.add(m.conversation_id);
      const delay =
        m.meta && typeof (m.meta as { delay_ms?: unknown }).delay_ms === "number"
          ? (m.meta as { delay_ms: number }).delay_ms
          : null;
      return {
        message_id: m.id,
        conversation_id: m.conversation_id,
        route: `inbox/th-${m.conversation_id}`,
        who: d ? contactName(d) : "a customer",
        text: (m.body ?? "").slice(0, 200),
        sends_at:
          delay !== null ? fmtWhen(new Date(Date.parse(m.created_at) + delay).toISOString(), timezone, now) : null,
      };
    });

  const callDtos: CallDto[] = (calls.data ?? []).map(toCallDto);
  const callRows = callDtos.map((c) => {
    const v = toCallVM(c, timezone, now);
    t.read.call.add(c.id);
    if (c.contact_id) t.read.person.add(c.contact_id);
    return {
      call_id: c.id,
      route: `conversations/cv-${c.id}`,
      who: v.who,
      person_route: c.contact_id ? `clients/${c.contact_id}` : null,
      at: fmtTime(c.started_at, timezone),
      duration: v.duration ?? null,
      outcome: v.outcome,
      ...(abandonedCall(c) ? { abandoned: true as const } : {}),
      summary: c.summary ? c.summary.slice(0, 160) : null,
    };
  });

  let scoped: unknown = null;
  // A row a tool reads rides along; a lead, a search or a run (scope kinds a page opens, read by no tool until Phase 4)
  // and a page do not -- the scope's line in the turn names them.
  const run =
    scope?.kind === "call"
      ? { name: "get_call", input: { call_id: scope.id } }
      : scope?.kind === "person"
        ? { name: "get_person", input: { contact_id: scope.id } }
        : scope?.kind === "thread" || scope?.kind === "conversation"
          ? { name: "get_thread", input: { conversation_id: scope.id, more: false } }
          : null;
  if (run) {
    const out = await runTool(t, run);
    if (!out.isError) {
      try {
        scoped = JSON.parse(out.result);
      } catch {
        scoped = null;
      }
    }
  }

  return {
    counts: {
      needs_you: needs.length,
      held_drafts: heldRows.length,
      calls_today: callRows.length,
      missed_today: callRows.filter((c) => c.outcome === "missed").length,
      abandoned_today: callRows.filter((c) => c.abandoned === true).length,
      messages_in_today: inbound.count ?? 0,
    },
    needs_you: needs,
    held_drafts: heldRows,
    threads,
    calls_today: callRows,
    scoped,
    note: "The newest eight threads with their last three messages, every thread that needs a person, the drafts being held, and today's calls. A call marked abandoned is an inbound caller who reached the receptionist and hung up within seconds, so they got nothing. Older or longer material needs a read.",
  };
}

/**
 * The snapshot as the turn's block: the day, then the rule for using it.
 * No clock inside it: the turn block above carries the time, and a snapshot
 * that reads the same from one minute to the next is a prompt-cache hit for
 * a turn's later rounds and for a quick follow-up.
 */
export function snapshotBlock(s: Snapshot): string {
  return [
    "The workspace right now:",
    JSON.stringify(s),
    "Answer from this when it is enough. get_today, list_threads (needs_you, held, recent) and list_calls (today, missed) return these same rows: do not call them for what is here. Read only for what is not here: a whole conversation or transcript, a person's profile, a report, openings, settings, threads and calls older than these. A thread's `conversation_id`, a call's `call_id` and the person in a `person_route` are the ids a source takes (kinds thread, call and person); to show or open a person's profile, open that person without reading it.",
  ].join("\n");
}

/** A snapshot lives this long for the same person, workspace and scope: a follow-up asked within it reads the day once. */
export const SNAPSHOT_TTL_MS = 20_000;
type ReadIds = Record<keyof AskReadSet, string[]>;
const recent = new Map<string, { at: number; block: string; read: ReadIds }>();
const RECENT_MAX = 200;

/**
 * The snapshot for a turn: built, or the one built for this person's last
 * question within the TTL. The clock lives in the turn block above it, so
 * a kept snapshot reads the same to the model, and its rows re-enter the
 * turn's read set so the answer may still cite them. Keyed by the person
 * too, not only the workspace: what a thread says about "you" is theirs.
 */
export async function snapshotFor(t: ToolContext, timezone: string, scope: AskScope | null): Promise<string> {
  const key = `${t.tenantId}|${t.ctx.userId}|${scope ? `${scope.kind}:${scope.id}` : ""}`;
  const nowMs = t.now.getTime();
  const hit = recent.get(key);
  if (hit && nowMs - hit.at < SNAPSHOT_TTL_MS && nowMs >= hit.at) {
    for (const kind of Object.keys(hit.read) as (keyof AskReadSet)[])
      for (const id of hit.read[kind]) t.read[kind].add(id);
    return hit.block;
  }
  const block = snapshotBlock(await buildSnapshot(t, timezone, scope));
  // The snapshot is the turn's first read, so the read set holds exactly its rows here.
  const read: ReadIds = {
    thread: [...t.read.thread],
    conversation: [...t.read.conversation],
    call: [...t.read.call],
    person: [...t.read.person],
  };
  recent.set(key, { at: nowMs, block, read });
  if (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value as string);
  return block;
}
