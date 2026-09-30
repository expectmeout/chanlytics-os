import "server-only";
import {
  AppError,
  REPLY_WINDOW_MS,
  firstNameOf,
  isReplyTo,
  parseParamSpecs,
  personName,
  type Audience,
  type BroadcastCounts,
  type BroadcastDetailDto,
  type BroadcastDto,
  type BroadcastRecipientDto,
  type BroadcastState,
  type PersonCampaignDto,
  type RecipientState,
} from "@chanlytics/contracts";
import { readAllRows } from "@chanlytics/db";
import { reachOutRunOf } from "@/server/campaigns/reach-outs";
import type { RouteContext } from "@/server/with-route";

/**
 * A workspace's broadcasts with the numbers their messages earned.
 *
 * Nothing here estimates. Sent, skipped and failed come from the recipient
 * rows the job moves; delivered and read come from the message rows the
 * status webhook keeps; replied is the count of recipients whose thread
 * heard from the customer after the broadcast started. Under RLS, so a
 * member of two workspaces sees one workspace's broadcasts at a time.
 */
const RECENT = 50;
const IN_CHUNK = 200;

const ROW_COLUMNS =
  "id, name, template_id, template_name, template_language, params, audience, state, scheduled_for, started_at, finished_at, recipient_count, failure, created_at, playbook_id, run_for";

interface BroadcastRow {
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
}

interface RecipientRow {
  broadcast_id: string;
  contact_id: string;
  state: string;
  reason: string | null;
  sent_at: string | null;
  messages: { conversation_id: string; status: string; meta?: unknown } | null;
  contacts?: {
    display_name: string | null;
    wa_profile_name: string | null;
    phone_e164: string | null;
    email: string | null;
  } | null;
}

/** When a status arrived, from the stamp the guard keeps on the row (00111); null before it, or for a status not reached. */
export function statusAt(meta: unknown, status: string): string | null {
  const at = (
    meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>).status_at : null
  ) as Record<string, unknown> | null | undefined;
  const v = at && typeof at === "object" ? at[status] : null;
  return typeof v === "string" ? v : null;
}

function emptyCounts(): BroadcastCounts {
  return { queued: 0, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 };
}

/** Sent, skipped, failed from the recipient rows; delivered and read from their messages. */
function countRecipients(
  recipients: RecipientRow[],
  ids: string[],
): { counts: Map<string, BroadcastCounts>; threadsOf: Map<string, Map<string, string>> } {
  const counts = new Map<string, BroadcastCounts>(ids.map((id) => [id, emptyCounts()]));
  const threadsOf = new Map<string, Map<string, string>>(); // broadcast -> conversation -> sent_at
  for (const r of recipients) {
    const c = counts.get(r.broadcast_id);
    if (!c) continue;
    if (r.state === "queued") c.queued += 1;
    else if (r.state === "sent") c.sent += 1;
    else if (r.state === "skipped") c.skipped += 1;
    else if (r.state === "failed") c.failed += 1;
    const status = r.messages?.status;
    if (status === "delivered" || status === "read") c.delivered += 1;
    if (status === "read") c.read += 1;
    if (r.messages?.conversation_id && r.sent_at) {
      const m = threadsOf.get(r.broadcast_id) ?? new Map<string, string>();
      m.set(r.messages.conversation_id, r.sent_at);
      threadsOf.set(r.broadcast_id, m);
    }
  }
  return { counts, threadsOf };
}

// A reply is an inbound within the contracts' reply window of the send (isReplyTo); the SQL series keeps the same one.

/**
 * Which threads heard from the customer within the reply window after the broadcast reached them, and when the first
 * reply came -- and, when the detail passes somewhere to keep them, that reply's words on one line (a list only
 * counts replies, and reads no bodies).
 */
async function repliedThreads(
  ctx: RouteContext,
  tenantId: string,
  threads: Map<string, string>,
  words: Map<string, string | null> | null = null,
): Promise<Map<string, string>> {
  const convIds = [...threads.keys()];
  const since = [...threads.values()].sort()[0];
  const replied = new Map<string, string>();
  for (let i = 0; i < convIds.length; i += IN_CHUNK) {
    const { data: inbound, error } = await ctx.supabase
      .from("messages")
      .select(words ? "conversation_id, created_at, body" : "conversation_id, created_at")
      .eq("tenant_id", tenantId)
      .eq("direction", "inbound")
      .in("conversation_id", convIds.slice(i, i + IN_CHUNK))
      .gt("created_at", since);
    if (error) throw new Error(error.message);
    // A select chosen at run time is past the client's typed parser: the rows are the columns named above.
    for (const m of (inbound ?? []) as unknown as {
      conversation_id: string;
      created_at: string;
      body?: string | null;
    }[]) {
      const sentAt = threads.get(m.conversation_id);
      if (sentAt && isReplyTo(sentAt, m.created_at)) {
        const first = replied.get(m.conversation_id);
        if (!first || m.created_at < first) {
          replied.set(m.conversation_id, m.created_at);
          words?.set(m.conversation_id, previewLine(m.body));
        }
      }
    }
  }
  return replied;
}

/** A reply's words as a list line shows them: the whitespace folded, cut at a length no row needs more of. Null for none. */
function previewLine(body: string | null | undefined): string | null {
  const t = typeof body === "string" ? body.replace(/\s+/g, " ").trim() : "";
  return t ? t.slice(0, 200) : null;
}

/**
 * Who answered each reply first, and when: the first message out of the thread after the reply that a person could
 * read as an answer -- the receptionist's, or the team's own words. A note is the team talking to itself, and a
 * template is the machine starting something new (a later broadcast, a playbook's run), so neither is an answer.
 */
async function answeredAfter(
  ctx: RouteContext,
  tenantId: string,
  replied: Map<string, string>,
): Promise<Map<string, { by: "receptionist" | "team"; at: string }>> {
  const convIds = [...replied.keys()];
  const out = new Map<string, { by: "receptionist" | "team"; at: string }>();
  if (convIds.length === 0) return out;
  const since = [...replied.values()].sort()[0];
  for (let i = 0; i < convIds.length; i += IN_CHUNK) {
    const { data, error } = await ctx.supabase
      .from("messages")
      .select("conversation_id, created_at, sender, type")
      .eq("tenant_id", tenantId)
      .eq("direction", "outbound")
      .in("conversation_id", convIds.slice(i, i + IN_CHUNK))
      .gt("created_at", since);
    if (error) throw new Error(error.message);
    for (const m of (data ?? []) as { conversation_id: string; created_at: string; sender: string; type: string }[]) {
      const reply = replied.get(m.conversation_id);
      if (!reply || !(m.created_at > reply)) continue;
      if (m.type !== "text" && m.type !== "media") continue;
      const by = m.sender === "ai" ? "receptionist" : m.sender === "human" ? "team" : null;
      if (!by) continue;
      const first = out.get(m.conversation_id);
      if (!first || m.created_at < first.at) out.set(m.conversation_id, { by, at: m.created_at });
    }
  }
  return out;
}

/** Which of these threads wait on a person now (needs_human): a reply the receptionist handed over. */
async function waitingThreads(ctx: RouteContext, tenantId: string, convIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < convIds.length; i += IN_CHUNK) {
    const { data, error } = await ctx.supabase
      .from("conversations")
      .select("id, state")
      .eq("tenant_id", tenantId)
      .in("id", convIds.slice(i, i + IN_CHUNK));
    if (error) throw new Error(error.message);
    for (const c of (data ?? []) as { id: string; state: string }[]) if (c.state === "needs_human") out.add(c.id);
  }
  return out;
}

function toDto(r: BroadcastRow, counts: BroadcastCounts): BroadcastDto {
  return {
    id: r.id,
    name: r.name,
    template_id: r.template_id,
    template_name: r.template_name,
    template_language: r.template_language,
    params: parseParamSpecs(r.params),
    audience: (r.audience && typeof r.audience === "object"
      ? r.audience
      : { kind: "everyone", id: null, label: "" }) as unknown as Audience,
    state: r.state as BroadcastState,
    scheduled_for: r.scheduled_for,
    started_at: r.started_at,
    finished_at: r.finished_at,
    recipient_count: r.recipient_count,
    failure: r.failure,
    created_at: r.created_at,
    playbook_id: r.playbook_id,
    run_for: r.run_for,
    counts,
  };
}

/** The rows with the numbers their people earned, read in chunks so a playbook's whole history fits in one call. */
async function withCounts(ctx: RouteContext, tenantId: string, rows: BroadcastRow[]): Promise<BroadcastDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const recipients: RecipientRow[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error: rErr } = await ctx.supabase
      .from("broadcast_recipients")
      .select("broadcast_id, contact_id, state, reason, sent_at, messages(conversation_id, status, meta)")
      .eq("tenant_id", tenantId)
      .in("broadcast_id", ids.slice(i, i + IN_CHUNK));
    if (rErr) throw new Error(rErr.message);
    recipients.push(...((data ?? []) as unknown as RecipientRow[]));
  }
  const { counts, threadsOf } = countRecipients(recipients, ids);
  for (const [broadcastId, threads] of threadsOf) {
    counts.get(broadcastId)!.replied = (await repliedThreads(ctx, tenantId, threads)).size;
  }
  return rows.map((r) => toDto(r, counts.get(r.id) ?? emptyCounts()));
}

/**
 * The recent fifty, newest first: the Broadcasts page's history -- and whether
 * older broadcasts exist beyond it. The page summed these fifty under headings
 * that read as everything; one row past the fifty is how it knows to say "latest".
 */
export async function listBroadcasts(
  ctx: RouteContext,
  tenantId: string,
): Promise<{ broadcasts: BroadcastDto[]; more: boolean }> {
  const { data: rows, error } = await ctx.supabase
    .from("broadcasts")
    .select(ROW_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(RECENT + 1);
  if (error) throw new Error(error.message);
  const all = (rows ?? []) as BroadcastRow[];
  return { broadcasts: await withCounts(ctx, tenantId, all.slice(0, RECENT)), more: all.length > RECENT };
}

/**
 * Every run a playbook ever made, newest first, uncapped: a card's totals
 * used to be summed over the recent fifty broadcasts of ANY kind, so a
 * playbook that had run daily for two months was counted from whatever was
 * left of it in that window.
 */
export async function listRuns(ctx: RouteContext, tenantId: string): Promise<BroadcastDto[]> {
  const { data: rows, error } = await ctx.supabase
    .from("broadcasts")
    .select(ROW_COLUMNS)
    .eq("tenant_id", tenantId)
    .not("playbook_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return withCounts(ctx, tenantId, (rows ?? []) as BroadcastRow[]);
}

/**
 * What each person the run reached said about hearing from the business after
 * it reached them: the consent ledger both doors write (00013) -- a yes at the
 * desk or in their own words, a STOP -- inside the same reply window a reply is
 * counted in, and the latest there stands. Reports › Campaigns counts the same
 * ledger by day for the whole workspace (00064); this is one run's share of it.
 * Someone the run never reached did not answer it.
 */
type ConsentAnswer = { consent: "opted_in" | "opted_out"; purpose: "marketing" | "conversational"; at: string };
async function consentAfter(
  ctx: RouteContext,
  tenantId: string,
  rows: RecipientRow[],
): Promise<Map<string, ConsentAnswer>> {
  const sentAt = new Map<string, number>();
  for (const r of rows) if (r.state === "sent" && r.sent_at) sentAt.set(r.contact_id, Date.parse(r.sent_at));
  const out = new Map<string, ConsentAnswer>();
  if (sentAt.size === 0) return out;
  const ids = [...sentAt.keys()];
  const since = new Date(Math.min(...sentAt.values())).toISOString();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await ctx.supabase
      .from("events")
      .select("subject_id, data, created_at")
      .eq("tenant_id", tenantId)
      .eq("kind", "contact.consent_changed")
      .in("subject_id", ids.slice(i, i + IN_CHUNK))
      .gt("created_at", since);
    if (error) throw new Error(error.message);
    for (const e of (data ?? []) as { subject_id: string | null; data: unknown; created_at: string }[]) {
      const from = e.subject_id ? sentAt.get(e.subject_id) : undefined;
      const t = Date.parse(e.created_at);
      if (from === undefined || !(t > from) || t - from > REPLY_WINDOW_MS) continue;
      const data = e.data as { consent?: unknown; purpose?: unknown } | null;
      const consent = data?.consent;
      if (consent !== "opted_in" && consent !== "opted_out") continue;
      // An unsubscribe from email (00174) is no answer to a WhatsApp broadcast.
      if (data?.purpose === "email_marketing") continue;
      // The offers door names its purpose (00095); the conversational one names none.
      const purpose = data?.purpose === "marketing" ? "marketing" : "conversational";
      const had = out.get(e.subject_id!);
      if (!had || e.created_at > had.at) out.set(e.subject_id!, { consent, purpose, at: e.created_at });
    }
  }
  return out;
}

/** One broadcast and every person on it, in the words of what happened to them -- and what came back from each. */
export async function getBroadcast(ctx: RouteContext, tenantId: string, id: string): Promise<BroadcastDetailDto> {
  const { data: row, error } = await ctx.supabase
    .from("broadcasts")
    .select(ROW_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new AppError("not_found", "Broadcast not found.", 404);

  // Every person on it, a page at a time: an unbounded read answers with PostgREST's first 1,000, and a broadcast may
  // hold BROADCAST_MAX_RECIPIENTS (2,000), so a large run's counts and rows stopped at the thousandth. The person is
  // the tiebreak the pager needs (the key is broadcast_id, contact_id).
  const rows = (await readAllRows("broadcast recipients", (from, to) =>
    ctx.supabase
      .from("broadcast_recipients")
      .select(
        "broadcast_id, contact_id, state, reason, sent_at, messages(conversation_id, status, meta), contacts(display_name, wa_profile_name, phone_e164, email)",
      )
      .eq("tenant_id", tenantId)
      .eq("broadcast_id", id)
      .order("sent_at", { ascending: false, nullsFirst: false })
      .order("contact_id")
      .range(from, to),
  )) as unknown as RecipientRow[];

  const { counts, threadsOf } = countRecipients(rows, [id]);
  const threads = threadsOf.get(id);
  const words = new Map<string, string | null>();
  const replied = threads ? await repliedThreads(ctx, tenantId, threads, words) : new Map<string, string>();
  counts.get(id)!.replied = replied.size;
  const answered = await consentAfter(ctx, tenantId, rows);
  const answers = await answeredAfter(ctx, tenantId, replied);
  const waiting = replied.size > 0 ? await waitingThreads(ctx, tenantId, [...replied.keys()]) : new Set<string>();

  const people: BroadcastRecipientDto[] = rows.map((r) => ({
    contact_id: r.contact_id,
    name: personName({
      display_name: r.contacts?.display_name ?? null,
      wa_profile_name: r.contacts?.wa_profile_name ?? null,
      phone_e164: r.contacts?.phone_e164 ?? null,
      email: r.contacts?.email ?? null,
    }),
    first_name: firstNameOf(r.contacts?.display_name, r.contacts?.wa_profile_name),
    phone: r.contacts?.phone_e164 ?? null,
    state: r.state as RecipientState,
    reason: r.reason,
    sent_at: r.sent_at,
    message_status: r.messages?.status ?? null,
    conversation_id: r.messages?.conversation_id ?? null,
    replied: !!(r.messages?.conversation_id && replied.has(r.messages.conversation_id)),
    delivered_at: statusAt(r.messages?.meta, "delivered"),
    read_at: statusAt(r.messages?.meta, "read"),
    replied_at: r.messages?.conversation_id ? (replied.get(r.messages.conversation_id) ?? null) : null,
    consent_after: answered.get(r.contact_id)?.consent ?? null,
    consent_at: answered.get(r.contact_id)?.at ?? null,
    consent_purpose: answered.get(r.contact_id)?.purpose ?? null,
    reply_words: r.messages?.conversation_id ? (words.get(r.messages.conversation_id) ?? null) : null,
    answered_by: r.messages?.conversation_id ? (answers.get(r.messages.conversation_id)?.by ?? null) : null,
    answered_at: r.messages?.conversation_id ? (answers.get(r.messages.conversation_id)?.at ?? null) : null,
    waiting_on_you: !!(r.messages?.conversation_id && waiting.has(r.messages.conversation_id)),
  }));
  return {
    broadcast: toDto(row as BroadcastRow, counts.get(id) ?? emptyCounts()),
    recipients: people,
    reach_out: await reachOutRunOf(ctx, tenantId, row),
  };
}

/** How many of a person's runs their page lists: the newest. */
export const PERSON_RUNS = 20;

/**
 * The runs that named one person, newest first, the newest PERSON_RUNS of them: a playbook's run named for its
 * playbook, a broadcast for itself, each with what the send job recorded for them. Every recipient row is read, since
 * a row carries no time of its own and the newest is known only once each run's time is: a person is on few runs.
 */
export async function personRuns(ctx: RouteContext, tenantId: string, contactId: string): Promise<PersonCampaignDto[]> {
  const rows = await readAllRows<{
    broadcast_id: string;
    state: string;
    reason: string | null;
    sent_at: string | null;
    message_id: string | null;
  }>("broadcast_recipients", (from, to) =>
    ctx.supabase
      .from("broadcast_recipients")
      .select("broadcast_id, state, reason, sent_at, message_id")
      .eq("tenant_id", tenantId)
      .eq("contact_id", contactId)
      .order("broadcast_id")
      .range(from, to),
  );
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.broadcast_id);
  const runs = new Map<
    string,
    { name: string; playbook_id: string | null; audience: unknown; scheduled_for: string | null; created_at: string }
  >();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await ctx.supabase
      .from("broadcasts")
      .select("id, name, playbook_id, audience, scheduled_for, created_at")
      .eq("tenant_id", tenantId)
      .in("id", ids.slice(i, i + IN_CHUNK));
    if (error) throw new Error(error.message);
    for (const b of data ?? []) runs.set(b.id, b);
  }
  const out: (PersonCampaignDto & { at: string })[] = [];
  for (const r of rows) {
    const b = runs.get(r.broadcast_id);
    if (!b) continue;
    const label = (b.audience as { label?: unknown } | null)?.label;
    out.push({
      broadcast_id: r.broadcast_id,
      name: b.name,
      playbook_id: b.playbook_id,
      // The name a run's messages carry (core messages/broadcast.ts): the playbook's, as the run was drawn.
      playbook_name: b.playbook_id ? (typeof label === "string" && label ? label : b.name) : null,
      // One of RECIPIENT_STATES: the column's CHECK.
      state: r.state as RecipientState,
      reason: r.reason,
      sent_at: r.sent_at,
      scheduled_for: b.scheduled_for,
      message_id: r.message_id,
      at: r.sent_at ?? b.scheduled_for ?? b.created_at,
    });
  }
  return out
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, PERSON_RUNS)
    .map(({ at: _at, ...c }) => c);
}
