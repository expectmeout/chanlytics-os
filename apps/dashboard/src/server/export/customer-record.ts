/** One customer's whole record, as the export writes it. */
import { recordOrEmpty, type ContactId, DbFailure } from "@chanlytics/contracts";
import type { MessageDto, TenantId } from "@chanlytics/contracts";
import { mediaPublic, toCallDto } from "@/server/conversations/dto";
import { consentChangeOf, type BundleReaders } from "@/server/export/bundle";
import type { RouteContext } from "@/server/shared/with-route";
import { pageConsentChanges, pageMessagesOfThreads, pageThreadRows } from "@chanlytics/db/conversations";
import { pageCallRows } from "@chanlytics/db/voice";

/**
 * The customer record, a page at a time, read on the owner's own session: everyone's threads, their messages, the calls
 * and every consent change, or one person's alone (`person`, a uuid the query checked).
 */
export function customerRecord(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  person?: ContactId,
): Pick<BundleReaders, "conversations" | "messages" | "calls" | "consentHistory"> {
  const { supabase } = ctx;
  const rows = async <T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> => {
    const { data, error } = await q;
    if (error) throw new DbFailure(error);
    return data ?? [];
  };
  return {
    conversations: (offset, limit) => {
      return rows(pageThreadRows(supabase, tenantId, person, offset, offset + limit - 1));
    },
    // A batch of conversations' messages in one query (R14 X7), each with its conversation and, for a file the store
    // holds, its path: the bundle lists the file with a link and never writes the path.
    messages: async (conversationIds, offset, limit) =>
      (await rows(pageMessagesOfThreads(supabase, [...conversationIds], offset, offset + limit - 1))).map((row) => ({
        conversation_id: row.conversation_id,
        stored_path: storedPathOf(row.media),
        id: row.id,
        direction: row.direction,
        sender: row.sender,
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
      return (await rows(pageCallRows(supabase, tenantId, person, offset, offset + limit - 1))).map(toCallDto);
    },
    // Every change to either answer: a person's are the ones about them (the event's subject is the person).
    consentHistory: async (offset, limit) => {
      return (await rows(pageConsentChanges(supabase, tenantId, person, offset, offset + limit - 1))).map(
        consentChangeOf,
      );
    },
  };
}

/** Where a message's file is kept, once the store holds it; none for one still fetching or never fetched. */
export function storedPathOf(media: unknown): string | null {
  const m = recordOrEmpty(media);
  return m.fetch_state === "stored" && typeof m.storage_path === "string" ? m.storage_path : null;
}
