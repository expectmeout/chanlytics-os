import "server-only";
import { standingFromConfig, type ChannelDto } from "@chanlytics/contracts";
import { lastInboundOn } from "@chanlytics/db";
import { stamp, type Reader } from "./index";

/**
 * GET channels, as the route answers it: the workspace's channels as the page may see them, by kind -- each row, when
 * it last heard from a customer, and the quality Meta has assigned the WhatsApp number (kept on the row's config by
 * the edge) and what Meta holds about the number (its standing, kept on the config by the edge: whether it may send, what
 * stands in the way, its display name's review, the business's verification and tier, and when it was read). The route's body,
 * moved here whole, so Settings, the Broadcasts page's number and Ask's
 * workspace.settings and sequences.lists read the same rows the same way. A channel is not a row a citation names:
 * none of the thirteen is a line's.
 */
export const channels: Reader<undefined, { channels: ChannelDto[] }> = {
  name: "channels",
  async read(rc) {
    const { supabase } = rc.ctx;
    const tenantId = rc.tenantId;
    const [rows, lastWa, lastCall] = await Promise.all([
      supabase
        .from("tenant_channels")
        .select("id, kind, number_e164, status, created_at, config")
        .eq("tenant_id", tenantId)
        .order("kind"),
      lastInboundOn(supabase, tenantId, "whatsapp"),
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
    if (lastCall.error) throw new Error(lastCall.error.message);
    // The DM clock only where an Instagram account is connected: most workspaces have none, and ask nothing more.
    const lastDm = rows.data?.some((c) => c.kind === "instagram")
      ? await lastInboundOn(supabase, tenantId, "instagram")
      : null;
    const lastByKind: Record<string, string | null> = {
      whatsapp: lastWa,
      instagram: lastDm,
      voice: lastCall.data?.started_at ?? null,
    };
    const channels: ChannelDto[] = (rows.data ?? []).map((c) => {
      const cfg = (c.config && typeof c.config === "object" && !Array.isArray(c.config) ? c.config : {}) as Record<
        string,
        unknown
      >;
      const s = (k: string) => (typeof cfg[k] === "string" ? cfg[k] : null);
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
        standing: standingFromConfig(cfg.standing),
        standing_read_at: s("standing_read_at"),
        connected_at: s("connected_at"),
        // An Instagram account's handle, and when Instagram stopped taking its token (the token sweep keeps it).
        ...(c.kind === "instagram" ? { handle: s("username"), lapsed_at: s("token_lapsed_at") } : {}),
      };
    });
    return { data: { channels }, rows: [], stamp: stamp() };
  },
};
