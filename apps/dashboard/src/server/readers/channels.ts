import "server-only";
import { standingFromConfig, type ChannelDto } from "@chanlytics/contracts";
import { findLastInboundOn } from "@chanlytics/db/channels";
import { readerStamp, type Reader } from "../shared/reader";
import { listChannelsForPage } from "@chanlytics/db/workspace";
import { findLastCallIn } from "@chanlytics/db/voice";

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
      listChannelsForPage(supabase, tenantId),
      findLastInboundOn(supabase, tenantId, "whatsapp"),
      findLastCallIn(supabase, tenantId),
    ]);
    if (rows.error) throw new Error(rows.error.message);
    if (lastCall.error) throw new Error(lastCall.error.message);
    // The DM clock only where an Instagram account is connected: most workspaces have none, and ask nothing more.
    const lastDm = rows.data?.some((c) => c.kind === "instagram")
      ? await findLastInboundOn(supabase, tenantId, "instagram")
      : null;
    const lastByKind: Record<string, string | null> = {
      whatsapp: lastWa,
      instagram: lastDm,
      voice: lastCall.data?.started_at ?? null,
    };
    const channels: ChannelDto[] = (rows.data ?? []).map((row) => {
      const cfg = (
        row.config && typeof row.config === "object" && !Array.isArray(row.config) ? row.config : {}
      ) as Record<string, unknown>;
      const s = (k: string) => (typeof cfg[k] === "string" ? cfg[k] : null);
      return {
        id: row.id,
        kind: row.kind,
        number_e164: row.number_e164,
        status: row.status,
        created_at: row.created_at,
        last_inbound_at: lastByKind[row.kind] ?? null,
        quality: s("quality_rating"),
        quality_event: s("quality_event"),
        messaging_limit: s("messaging_limit"),
        quality_at: s("quality_at"),
        standing: standingFromConfig(cfg.standing),
        standing_read_at: s("standing_read_at"),
        connected_at: s("connected_at"),
        // An Instagram account's handle, and when Instagram stopped taking its token (the token sweep keeps it).
        ...(row.kind === "instagram" ? { handle: s("username"), lapsed_at: s("token_lapsed_at") } : {}),
      };
    });
    return { data: { channels }, rows: [], stamp: readerStamp() };
  },
};
