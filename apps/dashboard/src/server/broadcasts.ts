import "server-only";
import type { Audience, BroadcastCounts, BroadcastDto, BroadcastState } from "@chanlytics/contracts";
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

interface RecipientRow {
  broadcast_id: string;
  state: string;
  sent_at: string | null;
  messages: { conversation_id: string; status: string } | null;
}

function emptyCounts(): BroadcastCounts {
  return { queued: 0, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 };
}

export async function listBroadcasts(ctx: RouteContext, tenantId: string): Promise<BroadcastDto[]> {
  const { data: rows, error } = await ctx.supabase
    .from("broadcasts")
    .select("id, name, template_id, template_name, template_language, params, audience, state, scheduled_for, started_at, finished_at, recipient_count, failure, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(RECENT);
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const { data: recipients, error: rErr } = await ctx.supabase
    .from("broadcast_recipients")
    .select("broadcast_id, state, sent_at, messages(conversation_id, status)")
    .eq("tenant_id", tenantId)
    .in("broadcast_id", ids);
  if (rErr) throw new Error(rErr.message);

  const counts = new Map<string, BroadcastCounts>(ids.map((id) => [id, emptyCounts()]));
  // Which threads heard from the customer after each broadcast started.
  const threadsOf = new Map<string, Map<string, string>>(); // broadcast -> conversation -> sent_at
  for (const r of (recipients ?? []) as unknown as RecipientRow[]) {
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

  for (const [broadcastId, threads] of threadsOf) {
    const c = counts.get(broadcastId)!;
    const convIds = [...threads.keys()];
    const since = [...threads.values()].sort()[0];
    const replied = new Set<string>();
    for (let i = 0; i < convIds.length; i += IN_CHUNK) {
      const { data: inbound, error: iErr } = await ctx.supabase
        .from("messages")
        .select("conversation_id, created_at")
        .eq("tenant_id", tenantId)
        .eq("direction", "inbound")
        .in("conversation_id", convIds.slice(i, i + IN_CHUNK))
        .gt("created_at", since);
      if (iErr) throw new Error(iErr.message);
      for (const m of inbound ?? []) {
        const sentAt = threads.get(m.conversation_id);
        if (sentAt && m.created_at > sentAt) replied.add(m.conversation_id);
      }
    }
    c.replied = replied.size;
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    template_id: r.template_id,
    template_name: r.template_name,
    template_language: r.template_language,
    params: Array.isArray(r.params) ? (r.params as unknown[]).map(String) : [],
    audience: (r.audience && typeof r.audience === "object" ? r.audience : { kind: "everyone", id: null, label: "" }) as unknown as Audience,
    state: r.state as BroadcastState,
    scheduled_for: r.scheduled_for,
    started_at: r.started_at,
    finished_at: r.finished_at,
    recipient_count: r.recipient_count,
    failure: r.failure,
    created_at: r.created_at,
    counts: counts.get(r.id) ?? emptyCounts(),
  }));
}
