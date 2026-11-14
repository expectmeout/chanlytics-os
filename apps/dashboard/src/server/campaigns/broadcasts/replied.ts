/** Broadcasts: replied. */

import "server-only";
import {
  isAutomatedSend,
  isPersonsWords,
  isReplyTo,
  parseParamSpecs,
  runCountsOf,
  type Audience,
  type BroadcastCounts,
  type BroadcastDto,
  type BroadcastState,
  recordOrEmpty,
  shaped,
  DbFailure,
} from "@chanlytics/contracts";
import { readAllRows, readColumn } from "@chanlytics/db/shared";
import { runCounts } from "@chanlytics/db/reports";
import { getThreadIdsWaitingOnYou } from "@chanlytics/db/people";
import type { RouteContext } from "@/server/shared/with-route";
import { listOutboundSince, pageInboundOn, pagePeopleOnRuns } from "@chanlytics/db/campaigns";
import type { ContactId, TenantId } from "@chanlytics/contracts";

/**
 * A workspace's broadcasts with the numbers their messages earned.
 *
 * Nothing here estimates. Sent, skipped and failed come from the recipient
 * rows the job moves; delivered and read come from the message rows the
 * status webhook keeps; replied is the count of recipients whose thread
 * heard from the customer after the broadcast started. Under RLS, so a
 * member of two workspaces sees one workspace's broadcasts at a time.
 */
export const RECENT = 50;

export const IN_CHUNK = 200;

export interface BroadcastRow {
  id: string;
  name: string;
  template_id: string;
  template_name: string;
  template_language: string;
  params: unknown;
  audience: unknown;
  state: string;
  scheduled_for: string;
  started_at: string | null;
  finished_at: string | null;
  recipient_count: number;
  failure: string | null;
  created_at: string;
  playbook_id: string | null;
  run_for: string | null;
  sequence_id: string;
  /** A freed time's batch (00498, decision 0082): the time it offers and the appointment that freed it. */
  offered_start: string | null;
  offered_end: string | null;
  offered_from: string | null;
}

export interface RecipientRow {
  broadcast_id: string;
  contact_id: ContactId;
  /** The channel the send picked for them (reachFor, 00298): null on a run made before; absent where the read did not ask. */
  channel?: string | null;
  /** The outbound email it was, where one was written: what an unsubscribe names (contracts answersToRuns); absent where the read did not ask. */
  message_id?: string | null;
  state: string;
  reason: string | null;
  sent_at: string | null;
  /** `external_id` is the provider's id, which a carrier's or WhatsApp's stop names (answersToRuns); absent where the read did not ask. */
  messages: { conversation_id: string; status: string; meta?: unknown; external_id?: string | null } | null;
  contacts?: {
    display_name: string | null;
    wa_profile_name: string | null;
    /** Where the name came from and whether a member settled it (0052): a stand-in's first name is "there". */
    name_source?: string | null;
    name_settled_at?: string | null;
    phone_e164: string | null;
    email: string | null;
    /** Whether the person stands (answersToRuns): erased, or merged into another, they answer nothing. */
    erased_at?: string | null;
    merged_into_contact_id?: string | null;
  } | null;
}

/** When a status arrived, from the stamp the guard keeps on the row (00111); null before it, or for a status not reached. */
export function statusAt(meta: unknown, status: string): string | null {
  const at = (meta && typeof meta === "object" && !Array.isArray(meta) ? recordOrEmpty(meta).status_at : null) as
    Record<string, unknown> | null | undefined;
  const v = at && typeof at === "object" ? at[status] : null;
  return typeof v === "string" ? v : null;
}

export function emptyCounts(): BroadcastCounts {
  return {
    queued: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    delivered: 0,
    read: 0,
    replied: 0,
    sent_by: { whatsapp: 0, sms: 0, email: 0 },
  };
}

/** Sent, skipped, failed from the recipient rows; delivered and read from their messages. */
export function countRecipients(
  recipients: RecipientRow[],
  ids: string[],
): { counts: Map<string, BroadcastCounts>; threadsOf: Map<string, Map<string, string>> } {
  const counts = new Map<string, BroadcastCounts>(ids.map((id) => [id, emptyCounts()]));
  const threadsOf = new Map<string, Map<string, string>>(); // broadcast -> conversation -> sent_at
  for (const recipient of recipients) {
    const count = counts.get(recipient.broadcast_id);
    if (!count) continue;
    if (recipient.state === "queued") count.queued += 1;
    else if (recipient.state === "sent") {
      count.sent += 1;
      // By the channel it went by (0030): a row naming none went by WhatsApp, as every run before channels did.
      if (count.sent_by)
        count.sent_by[recipient.channel === "sms" || recipient.channel === "email" ? recipient.channel : "whatsapp"] +=
          1;
    } else if (recipient.state === "skipped") count.skipped += 1;
    else if (recipient.state === "failed") count.failed += 1;
    const status = recipient.messages?.status;
    if (status === "delivered" || status === "read") count.delivered += 1;
    // A read is WhatsApp's own receipt (0030): a text a carrier marked read is no read here, so a run's read share,
    // over what went by WhatsApp, can never pass the whole.
    if (status === "read" && recipient.channel !== "sms" && recipient.channel !== "email") count.read += 1;
    if (recipient.messages?.conversation_id && recipient.sent_at) {
      const m = threadsOf.get(recipient.broadcast_id) ?? new Map<string, string>();
      m.set(recipient.messages.conversation_id, recipient.sent_at);
      threadsOf.set(recipient.broadcast_id, m);
    }
  }
  return { counts, threadsOf };
}

// A reply is an inbound within the contracts' reply window of the send (isReplyTo); the SQL series keeps the same one.

/** A message the customer wrote, as the reply reads need it: its thread and its time, and its words where the detail asks. */
interface Inbound {
  conversation_id: string;
  created_at: string;
  /** What the email intake read it as, where it was an email (contracts isPersonsWords). */
  meta: unknown;
  body?: string | null;
}

/**
 * What the customers on these threads wrote since `since`, a thread's messages together: a person's own words, so not
 * a call's note (an inbound row the system wrote) and not a program writing from their address (an out-of-office, a
 * list's mail: contracts isPersonsWords), which made a run "replied to" by people who never answered it. The thread ids go two hundred
 * at a time so the URL stays short, and each chunk's messages a page at a time under the table's key: two hundred
 * threads hold far more than the thousand rows one read answers, and a run's replies counted from the first thousand
 * read short on exactly the runs that were answered most. The words are read only where the detail asks for them (a
 * list only counts replies).
 */
async function inboundOn(
  ctx: RouteContext,
  tenantId: TenantId,
  convIds: string[],
  since: string,
  withWords: boolean,
): Promise<Map<string, Inbound[]>> {
  const byThread = new Map<string, Inbound[]>();
  for (let index = 0; index < convIds.length; index += IN_CHUNK) {
    const chunk = convIds.slice(index, index + IN_CHUNK);
    // A select chosen at run time is past the client's typed parser: the rows are the columns named above.
    // Whole: each reply is counted, and who answered a run is said of them.
    const inbound = (await readAllRows(
      "inbound messages",
      (from, to) => pageInboundOn(ctx.supabase, tenantId, { conversationIds: chunk, since, withWords, from, to }),
      "whole",
    )) as unknown as Inbound[];
    for (const m of inbound) {
      if (!isPersonsWords(m.meta)) continue;
      const had = byThread.get(m.conversation_id);
      if (had) had.push(m);
      else byThread.set(m.conversation_id, [m]);
    }
  }
  return byThread;
}

/**
 * Which of a run's threads heard from the customer within the reply window after the run reached them, and when the first
 * reply came -- and, when the detail passes somewhere to keep them, that reply's words on one line. `inbound` is read
 * once for every run asked about (inboundOn): a thread on two runs is answered, or not, by each run's own send.
 */
function firstReplies(
  threads: Map<string, string>,
  inbound: Map<string, Inbound[]>,
  words: Map<string, string | null> | null = null,
): Map<string, string> {
  const replied = new Map<string, string>();
  for (const [conversationId, sentAt] of threads) {
    for (const m of inbound.get(conversationId) ?? []) {
      if (!isReplyTo(sentAt, m.created_at)) continue;
      const first = replied.get(m.conversation_id);
      if (!first || m.created_at < first) {
        replied.set(m.conversation_id, m.created_at);
        words?.set(m.conversation_id, previewLine(m.body));
      }
    }
  }
  return replied;
}

/** One run's threads that heard from the customer within the reply window after it reached them, and when (see firstReplies). */
export async function repliedThreads(
  ctx: RouteContext,
  tenantId: TenantId,
  threads: Map<string, string>,
  words: Map<string, string | null> | null = null,
): Promise<Map<string, string>> {
  const since = [...threads.values()].sort()[0];
  if (since === undefined) return new Map();
  return firstReplies(threads, await inboundOn(ctx, tenantId, [...threads.keys()], since, words !== null), words);
}

/**
 * The conversations a reply came back on to any of these runs, by a run sheet's own rule (firstReplies: a person's words
 * within the reply window after the run reached the thread), each run judged by its own send. What a sequence's replies
 * in the Inbox list (readers/sequences.ts sequenceReplies), so they are the replies its History's days open onto.
 */
export async function listRepliedConversations(
  ctx: RouteContext,
  tenantId: TenantId,
  runIds: string[],
): Promise<string[]> {
  if (runIds.length === 0) return [];
  const { threadsOf } = countRecipients(await peopleOnRuns(ctx, tenantId, runIds), runIds);
  const every = new Map<string, string>();
  for (const threads of threadsOf.values())
    for (const [conversation, sentAt] of threads) {
      const had = every.get(conversation);
      if (!had || sentAt < had) every.set(conversation, sentAt);
    }
  const since = [...every.values()].sort()[0];
  if (since === undefined) return [];
  const inbound = await inboundOn(ctx, tenantId, [...every.keys()], since, false);
  const replied = new Set<string>();
  for (const threads of threadsOf.values()) for (const c of firstReplies(threads, inbound).keys()) replied.add(c);
  return [...replied];
}

/** A reply's words as a list line shows them: the whitespace folded, cut at a length no row needs more of. Null for none. */
function previewLine(body: string | null | undefined): string | null {
  const t = typeof body === "string" ? body.replace(/\s+/g, " ").trim() : "";
  return t ? t.slice(0, 200) : null;
}

/**
 * Who answered each reply first, and when: the first message out of the thread after the reply that a person could
 * read as an answer -- the receptionist's, or the team's own words. A note is the team talking to itself, and a
 * template is the machine starting something new (a later broadcast, a playbook's run), so neither is an answer. Nor is
 * a campaign's text or email, which is written as the team's and is nobody's answer (contracts isAutomatedSend).
 */
export async function answeredAfter(
  ctx: RouteContext,
  tenantId: TenantId,
  replied: Map<string, string>,
): Promise<Map<string, { by: "receptionist" | "team"; at: string }>> {
  const convIds = [...replied.keys()];
  const out = new Map<string, { by: "receptionist" | "team"; at: string }>();
  // The earliest reply: none when nothing was replied to, and then nothing was answered.
  const since = [...replied.values()].sort()[0];
  if (since === undefined) return out;
  for (let index = 0; index < convIds.length; index += IN_CHUNK) {
    const { data, error } = await listOutboundSince(
      ctx.supabase,
      tenantId,
      convIds.slice(index, index + IN_CHUNK),
      since,
    );
    if (error) throw new DbFailure(error);
    for (const m of data ?? []) {
      const reply = replied.get(m.conversation_id);
      if (!reply || !(m.created_at > reply)) continue;
      if (m.type !== "text" && m.type !== "media") continue;
      if (isAutomatedSend(m.meta)) continue;
      const by = m.sender === "ai" ? "receptionist" : m.sender === "human" ? "team" : null;
      if (!by) continue;
      const first = out.get(m.conversation_id);
      if (!first || m.created_at < first.at) out.set(m.conversation_id, { by, at: m.created_at });
    }
  }
  return out;
}

/**
 * Which of these threads wait on a person now: a reply the receptionist handed over that nobody has taken, by the one
 * standing rule (packages/db getThreadIdsWaitingOnYou). The raw needs_human column said Needs you of a reply a member had
 * already taken (the wiring's second audit, R11 S9-1).
 */
export function waitingThreads(ctx: RouteContext, tenantId: TenantId, convIds: string[]): Promise<Set<string>> {
  return getThreadIdsWaitingOnYou(ctx.supabase, tenantId, convIds, Date.now());
}

export function toDto(broadcast: BroadcastRow, counts: BroadcastCounts): BroadcastDto {
  return {
    id: broadcast.id,
    name: broadcast.name,
    template_id: broadcast.template_id,
    template_name: broadcast.template_name,
    template_language: broadcast.template_language,
    params: parseParamSpecs(broadcast.params),
    audience: readColumn(
      "broadcasts.audience",
      shaped<Audience>(),
      broadcast.audience && typeof broadcast.audience === "object"
        ? broadcast.audience
        : { kind: "everyone", id: null, label: "" },
    ),
    state: broadcast.state as BroadcastState,
    scheduled_for: broadcast.scheduled_for,
    started_at: broadcast.started_at,
    finished_at: broadcast.finished_at,
    recipient_count: broadcast.recipient_count,
    failure: broadcast.failure,
    created_at: broadcast.created_at,
    playbook_id: broadcast.playbook_id,
    run_for: broadcast.run_for,
    sequence_id: broadcast.sequence_id,
    offered_start: broadcast.offered_start,
    offered_end: broadcast.offered_end,
    offered_from: broadcast.offered_from,
    counts,
  };
}

/**
 * Every person on these runs, a page at a time under the table's key (broadcast_id, then contact_id, the order touches.ts
 * pages this table in). The run ids go two hundred at a time so a playbook's whole history fits in the URL, and each
 * chunk's people a page at a time: two hundred runs hold far more than the thousand rows one read answers, and the runs
 * past them counted short. The key is unique, so a page boundary cannot repeat one person and skip another, and a send in
 * progress does not move it, as it would under sent_at.
 */
async function peopleOnRuns(ctx: RouteContext, tenantId: TenantId, ids: string[]): Promise<RecipientRow[]> {
  const out: RecipientRow[] = [];
  for (let index = 0; index < ids.length; index += IN_CHUNK) {
    const chunk = ids.slice(index, index + IN_CHUNK);
    // Whole: every person on a run is counted.
    const people = (await readAllRows(
      "run recipients",
      (from, to) => pagePeopleOnRuns(ctx.supabase, tenantId, chunk, from, to),
      "whole",
    )) as RecipientRow[];
    // Pushed one at a time: spread into one push, a long history throws past about 120,000 rows.
    for (const person of people) out.push(person);
  }
  return out;
}

/**
 * Each run's numbers, by id: the database's count (run_counts, 00374), the one statement of what a run earned, which
 * Sent, a run's sheet and a playbook's card all say; or, on a database before it, for one release, the fold here
 * (foldCounts). A run nobody is on is all zeros.
 */
async function countsOf(ctx: RouteContext, tenantId: TenantId, ids: string[]): Promise<Map<string, BroadcastCounts>> {
  const read = await runCounts(ctx.supabase, tenantId, ids);
  if (read === "missing") return foldCounts(ctx, tenantId, ids);
  const counted = runCountsOf(read);
  if (!counted) throw new Error("run_counts answered a shape it does not know");
  return new Map(ids.map((id) => [id, counted[id] ?? emptyCounts()]));
}

/**
 * The fold run_counts replaced, kept for one release for a database before 00374: every person on every run
 * (peopleOnRuns), and the replies of all their threads in one read (inboundOn) where there was one query for each run
 * with a thread.
 */
async function foldCounts(ctx: RouteContext, tenantId: TenantId, ids: string[]): Promise<Map<string, BroadcastCounts>> {
  const { counts, threadsOf } = countRecipients(await peopleOnRuns(ctx, tenantId, ids), ids);
  // Every thread any run reached, read once from the oldest send: each run then reads its own threads off the one read.
  const sends = [...threadsOf.values()].flatMap((threads) => [...threads.values()]).sort();
  const since = sends[0];
  if (since !== undefined) {
    const convIds = [...new Set([...threadsOf.values()].flatMap((threads) => [...threads.keys()]))];
    const inbound = await inboundOn(ctx, tenantId, convIds, since, false);
    for (const [broadcastId, threads] of threadsOf) {
      const count = counts.get(broadcastId);
      if (count) count.replied = firstReplies(threads, inbound).size;
    }
  }
  return counts;
}

/** The rows with the numbers their people earned (countsOf). */
export async function withCounts(ctx: RouteContext, tenantId: TenantId, rows: BroadcastRow[]): Promise<BroadcastDto[]> {
  if (rows.length === 0) return [];
  const counts = await countsOf(
    ctx,
    tenantId,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toDto(r, counts.get(r.id) ?? emptyCounts()));
}
