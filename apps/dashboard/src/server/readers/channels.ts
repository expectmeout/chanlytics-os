import "server-only";
import type { ChannelDto } from "@chanlytics/contracts";
import { stamp, type Reader } from "./index";

/**
 * GET channels, as the route answers it: the workspace's channels as the page may see them, by kind -- each row, when
 * it last heard from a customer, and the quality Meta has assigned the WhatsApp number (kept on the row's config by
 * the edge). The route's body, moved here whole, so Settings, the Broadcasts page's number and Ask's
 * workspace.settings and campaigns.audiences read the same rows the same way. A channel is not a row a citation names:
 * none of the thirteen is a line's.
 */
export const channels: Reader<undefined, { channels: ChannelDto[] }> = {
  name: "channels",
  async read(rc) {
    const { supabase } = rc.ctx;
    const tenantId = rc.tenantId;
    const [rows, lastMsg, lastCall] = await Promise.all([
      supabase
        .from("tenant_channels")
        .select("id, kind, number_e164, status, created_at, config")
        .eq("tenant_id", tenantId)
        .order("kind"),
      supabase
        .from("messages")
        .select("channel_ts, created_at")
        .eq("tenant_id", tenantId)
        .eq("direction", "inbound")
        .eq("channel", "whatsapp")
        .order("channel_ts", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("calls")
        .select("started_at")
        .eq("tenant_id", tenantId)
        .eq("direction", "inbound")
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (rows.error) throw new Error(rows.error.message);
    if (lastMsg.error) throw new Error(lastMsg.error.message);
    if (lastCall.error) throw new Error(lastCall.error.message);
    const lastByKind: Record<string, string | null> = {
      whatsapp: lastMsg.data?.channel_ts ?? lastMsg.data?.created_at ?? null,
      voice: lastCall.data?.started_at ?? null,
    };
    const channels: ChannelDto[] = (rows.data ?? []).map((c) => {
      const cfg = (c.config && typeof c.config === "object" && !Array.isArray(c.config) ? c.config : {}) as Record<
        string,
        unknown
      >;
      const s = (k: string) => (typeof cfg[k] === "string" ? (cfg[k] as string) : null);
      return {
        id: c.id,
        kind: c.kind,
        number_e164: c.number_e164,
        status: c.status,
        created_at: c.created_at,
        last_inbound_at: lastByKind[c.kind] ?? null,
        quality: s("quality_rating"),
        quality_event: s("quality_event"),
        messaging_limit: s("messaging_limit"),
        quality_at: s("quality_at"),
      };
    });
    return { data: { channels }, rows: [], stamp: stamp() };
  },
};
