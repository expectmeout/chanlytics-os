import "server-only";
import { AppError, REPLY_WINDOW_MS, parseParamSpecs, personName, type Audience, type BroadcastCounts, type BroadcastDetailDto, type BroadcastDto, type BroadcastRecipientDto, type BroadcastState, type RecipientState } from "@chanlytics/contracts";
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
  messages: { conversation_id: string; status: string; meta?: unknown } | null;
  contacts?: { display_name: string | null; wa_profile_name: string | null; phone_e164: string | null } | null;
}

/** When a status arrived, from the stamp the guard keeps on the row (00111); null before it, or for a status not reached. */
export function statusAt(meta: unknown, status: string): string | null {
  const at = (meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>).status_at : null) as Record<string, unknown> | null | undefined;
  const v = at && typeof at === "object" ? at[status] : null;
  return typeof v === "string" ? v : null;
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

// A reply is an inbound within the contracts' reply window of the send (REPLY_WINDOW_MS); the SQL series keeps the same one.

/** Which threads heard from the customer within the reply window after the broadcast reached them, and when the first reply came. */
async function repliedThreads(ctx: RouteContext, tenantId: string, threads: Map<string, string>): Promise<Map<string, string>> {
  const convIds = [...threads.keys()];
  const since = [...threads.values()].sort()[0];
  const replied = new Map<string, string>();
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
      if (sentAt && m.created_at > sentAt && Date.parse(m.created_at) - Date.parse(sentAt) <= REPLY_WINDOW_MS) {
        const first = replied.get(m.conversation_id);
        if (!first || m.created_at < first) replied.set(m.conversation_id, m.created_at);
      }
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
    params: parseParamSpecs(r.params),
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
export async function listBroadcasts(ctx: RouteContext, tenantId: string): Promise<{ broadcasts: BroadcastDto[]; more: boolean }> {
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
    .select("broadcast_id, contact_id, state, reason, sent_at, messages(conversation_id, status, meta), contacts(display_name, wa_profile_name, phone_e164)")
    .eq("tenant_id", tenantId)
    .eq("broadcast_id", id)
    .order("sent_at", { ascending: false, nullsFirst: false });
  if (rErr) throw new Error(rErr.message);
  const rows = (recipients ?? []) as unknown as RecipientRow[];

  const { counts, threadsOf } = countRecipients(rows, [id]);
  const threads = threadsOf.get(id);
  const replied = threads ? await repliedThreads(ctx, tenantId, threads) : new Map<string, string>();
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
    delivered_at: statusAt(r.messages?.meta, "delivered"),
    read_at: statusAt(r.messages?.meta, "read"),
    replied_at: r.messages?.conversation_id ? replied.get(r.messages.conversation_id) ?? null : null,
  }));
  return { broadcast: toDto(row as BroadcastRow, counts.get(id) ?? emptyCounts()), recipients: people };
}
