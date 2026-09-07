import "server-only";
import { AppError, parseParamSpec, personName, type Audience, type BroadcastCounts, type BroadcastDetailDto, type BroadcastDto, type BroadcastRecipientDto, type BroadcastState, type RecipientState } from "@chanlytics/contracts";
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

const ROW_COLUMNS = "id, name, template_id, template_name, template_language, params, audience, state, scheduled_for, started_at, finished_at, recipient_count, failure, created_at, playbook_id, run_for";

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
  messages: { conversation_id: string; status: string } | null;
  contacts?: { display_name: string | null; wa_profile_name: string | null; phone_e164: string | null } | null;
}

function emptyCounts(): BroadcastCounts {
  return { queued: 0, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 };
}

/** Sent, skipped, failed from the recipient rows; delivered and read from their messages. */
function countRecipients(recipients: RecipientRow[], ids: string[]): { counts: Map<string, BroadcastCounts>; threadsOf: Map<string, Map<string, string>> } {
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

/** A reply is an inbound within this long of the send; a question two weeks later is its own thread, not a reply. The SQL series (campaign_series) keeps the same window. */
const REPLY_WINDOW_MS = 72 * 3_600_000;

/** Which threads heard from the customer within the reply window after the broadcast reached them. */
async function repliedThreads(ctx: RouteContext, tenantId: string, threads: Map<string, string>): Promise<Set<string>> {
  const convIds = [...threads.keys()];
  const since = [...threads.values()].sort()[0];
  const replied = new Set<string>();
  for (let i = 0; i < convIds.length; i += IN_CHUNK) {
    const { data: inbound, error } = await ctx.supabase
      .from("messages")
      .select("conversation_id, created_at")
      .eq("tenant_id", tenantId)
      .eq("direction", "inbound")
      .in("conversation_id", convIds.slice(i, i + IN_CHUNK))
      .gt("created_at", since);
    if (error) throw new Error(error.message);
    for (const m of inbound ?? []) {
      const sentAt = threads.get(m.conversation_id);
      if (sentAt && m.created_at > sentAt && Date.parse(m.created_at) - Date.parse(sentAt) <= REPLY_WINDOW_MS) replied.add(m.conversation_id);
    }
  }
  return replied;
}

function toDto(r: BroadcastRow, counts: BroadcastCounts): BroadcastDto {
  return {
    id: r.id,
    name: r.name,
    template_id: r.template_id,
    template_name: r.template_name,
    template_language: r.template_language,
    params: Array.isArray(r.params) ? (r.params as unknown[]).map((p) => parseParamSpec(p) ?? { kind: "text" as const, value: String(p) }) : [],
    audience: (r.audience && typeof r.audience === "object" ? r.audience : { kind: "everyone", id: null, label: "" }) as unknown as Audience,
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

export async function listBroadcasts(ctx: RouteContext, tenantId: string): Promise<BroadcastDto[]> {
  const { data: rows, error } = await ctx.supabase
    .from("broadcasts")
    .select(ROW_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(RECENT);
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const { data: recipients, error: rErr } = await ctx.supabase
    .from("broadcast_recipients")
    .select("broadcast_id, contact_id, state, reason, sent_at, messages(conversation_id, status)")
    .eq("tenant_id", tenantId)
    .in("broadcast_id", ids);
  if (rErr) throw new Error(rErr.message);

  const { counts, threadsOf } = countRecipients((recipients ?? []) as unknown as RecipientRow[], ids);
  for (const [broadcastId, threads] of threadsOf) {
    counts.get(broadcastId)!.replied = (await repliedThreads(ctx, tenantId, threads)).size;
  }
  return (rows as BroadcastRow[]).map((r) => toDto(r, counts.get(r.id) ?? emptyCounts()));
}

/** One broadcast and every person on it, in the words of what happened to them. */
export async function getBroadcast(ctx: RouteContext, tenantId: string, id: string): Promise<BroadcastDetailDto> {
  const { data: row, error } = await ctx.supabase
    .from("broadcasts")
    .select(ROW_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new AppError("not_found", "Broadcast not found.", 404);

  const { data: recipients, error: rErr } = await ctx.supabase
    .from("broadcast_recipients")
    .select("broadcast_id, contact_id, state, reason, sent_at, messages(conversation_id, status), contacts(display_name, wa_profile_name, phone_e164)")
    .eq("tenant_id", tenantId)
    .eq("broadcast_id", id)
    .order("sent_at", { ascending: false, nullsFirst: false });
  if (rErr) throw new Error(rErr.message);
  const rows = (recipients ?? []) as unknown as RecipientRow[];

  const { counts, threadsOf } = countRecipients(rows, [id]);
  const threads = threadsOf.get(id);
  const replied = threads ? await repliedThreads(ctx, tenantId, threads) : new Set<string>();
  counts.get(id)!.replied = replied.size;

  const people: BroadcastRecipientDto[] = rows.map((r) => ({
    contact_id: r.contact_id,
    name: personName({ display_name: r.contacts?.display_name ?? null, wa_profile_name: r.contacts?.wa_profile_name ?? null, phone_e164: r.contacts?.phone_e164 ?? null }),
    phone: r.contacts?.phone_e164 ?? null,
    state: r.state as RecipientState,
    reason: r.reason,
    sent_at: r.sent_at,
    message_status: r.messages?.status ?? null,
    conversation_id: r.messages?.conversation_id ?? null,
    replied: !!(r.messages?.conversation_id && replied.has(r.messages.conversation_id)),
  }));
  return { broadcast: toDto(row as BroadcastRow, counts.get(id) ?? emptyCounts()), recipients: people };
}
