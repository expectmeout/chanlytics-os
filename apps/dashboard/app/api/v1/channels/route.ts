import { withRoute, memberContext } from "@/server/with-route";
import type { ChannelDto } from "@chanlytics/contracts";

/**
 * GET /api/v1/channels — the numbers this workspace is reachable on.
 *
 * One row per tenant_channels entry (members read; RLS scopes), with the
 * newest inbound on each so the Integrations pane can say whether a channel
 * is receiving. Nothing here is a switch: enabling or disabling a channel
 * changes what real customers experience and stays an operator lever until
 * it has its own owner-only route.
 */
export const GET = withRoute(async (req, ctx) => {
  const { supabase } = ctx;
  const { tenantId } = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));

  const [rows, lastMsg, lastCall] = await Promise.all([
    supabase.from("tenant_channels").select("id, kind, number_e164, status, created_at").eq("tenant_id", tenantId).order("kind"),
    // Newest inbound WhatsApp message, by the channel's own clock.
    supabase.from("messages").select("channel_ts, created_at").eq("tenant_id", tenantId).eq("direction", "inbound").eq("channel", "whatsapp")
      .order("channel_ts", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    supabase.from("calls").select("started_at").eq("tenant_id", tenantId).eq("direction", "inbound")
      .order("started_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
  ]);
  if (rows.error) throw new Error(rows.error.message);
  if (lastMsg.error) throw new Error(lastMsg.error.message);
  if (lastCall.error) throw new Error(lastCall.error.message);

  const lastByKind: Record<string, string | null> = {
    whatsapp: lastMsg.data?.channel_ts ?? lastMsg.data?.created_at ?? null,
    voice: lastCall.data?.started_at ?? null,
  };
  const channels: ChannelDto[] = (rows.data ?? []).map((c) => ({
    id: c.id,
    kind: c.kind,
    number_e164: c.number_e164,
    status: c.status,
    created_at: c.created_at,
    last_inbound_at: lastByKind[c.kind] ?? null,
  }));
  return { channels };
});
