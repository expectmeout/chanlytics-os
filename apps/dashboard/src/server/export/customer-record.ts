/** One customer's whole record, as the export writes it. */
import { type MessageDto } from "@chanlytics/contracts";
import { CALL_COLUMNS, MESSAGE_COLUMNS, mediaPublic, toCallDto } from "@/server/conversations/dto";
import { consentChangeOf, type BundleReaders } from "@/server/export/bundle";
import type { RouteContext } from "@/server/shared/with-route";

/**
 * The customer record, a page at a time, read on the owner's own session: everyone's threads, their messages, the calls
 * and every consent change, or one person's alone (`person`, a uuid the query checked).
 */
export function customerRecord(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  person?: string,
): Pick<BundleReaders, "conversations" | "messages" | "calls" | "consentHistory"> {
  const { supabase } = ctx;
  const rows = async <T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> => {
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  };
  return {
    conversations: (offset, limit) => {
      const all = supabase
        .from("conversations")
        .select("id, contact_id, state, created_at, last_message_at, last_inbound_at")
        .eq("tenant_id", tenantId);
      return rows(
        (person ? all.eq("contact_id", person) : all)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + limit - 1),
      );
    },
    // A batch of conversations' messages in one query (R14 X7), each with its conversation and, for a file the store
    // holds, its path: the bundle lists the file with a link and never writes the path.
    messages: async (conversationIds, offset, limit) =>
      (
        await rows(
          supabase
            .from("messages")
            .select(MESSAGE_COLUMNS)
            .in("conversation_id", [...conversationIds])
            .order("conversation_id", { ascending: true })
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + limit - 1),
        )
      ).map((row) => ({
        conversation_id: row.conversation_id,
        stored_path: storedPathOf(row.media),
        id: row.id,
        direction: row.direction as MessageDto["direction"],
        sender: row.sender as MessageDto["sender"],
        type: row.type,
        body: row.body,
        media: mediaPublic(row.media),
        // A message's meta as stored, not through memberMetaOf: this is the owner's own copy of their data, and the
        // `pricing` a receipt keeps there (K8) holds the provider's category words and no amount.
        meta: row.meta as MessageDto["meta"],
        status: row.status,
        created_at: row.created_at,
        channel_ts: row.channel_ts,
        // The wire it travelled: a person's one thread holds every channel they wrote on (R14 X4).
        ...(row.channel ? { channel: row.channel } : {}),
      })),
    calls: async (offset, limit) => {
      const all = supabase.from("calls").select(CALL_COLUMNS).eq("tenant_id", tenantId);
      return (
        await rows(
          (person ? all.eq("contact_id", person) : all)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + limit - 1),
        )
      ).map(toCallDto);
    },
    // Every change to either answer: a person's are the ones about them (the event's subject is the person).
    consentHistory: async (offset, limit) => {
      const all = supabase
        .from("events")
        .select("id, subject_id, created_at, data")
        .eq("tenant_id", tenantId)
        .eq("kind", "contact.consent_changed");
      return (
        await rows(
          (person ? all.eq("subject_id", person) : all)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + limit - 1),
        )
      ).map(consentChangeOf);
    },
  };
}

/** Where a message's file is kept, once the store holds it; none for one still fetching or never fetched. */
export function storedPathOf(media: unknown): string | null {
  if (!media || typeof media !== "object") return null;
  const m = media as { storage_path?: unknown; fetch_state?: unknown };
  return m.fetch_state === "stored" && typeof m.storage_path === "string" ? m.storage_path : null;
}
