import type { MessageDto } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { everyoneOnce } from "@/server/people/people";
import { tenantFacts } from "@/server/tenant";
import { CALL_COLUMNS, MESSAGE_COLUMNS, mediaPublic, toCallDto } from "@/server/dto";
import { attachmentStream, dateTag, safeName } from "@/server/export/export";
import { BUNDLE_PAGE, consentChangeOf, workspaceBundle, type BundleReaders } from "@/server/export/export-bundle";
import { workspaceSections } from "@/server/export/workspace-sections";
import { recordDecision } from "@/server/verbs";
import { log } from "@/server/log";

/**
 * A large workspace's copy is minutes of reads: five, a budget of its own rather than the host's default, which could end a
 * copy part-way with the ledger already saying it was taken (the wiring's second audit, R14 X7).
 */
export const maxDuration = 300;

/**
 * GET /api/v1/export -- the workspace's own copy, as one JSON file: people, conversations with their messages and the
 * files customers sent, calls with their transcripts, the consent history, then a section for every other kind of record
 * (contracts EXPORT_OF), what each section counted and what the file does not hold. The privacy page has promised this
 * since it was written. Owners only, like the people CSV: it is the whole customer record. Read under the owner's own
 * session, page by page, and streamed, so a workspace of any size downloads without being held whole.
 */
export const GET = read({
  scope: workspace,
  fresh: true,
  role: "owner",
  rate: "export",
  handle: async ({ ctx, member }) => {
    const { supabase, userId } = ctx;
    const tenantId = member.tenantId;
    const rows = async <T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> => {
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data ?? [];
    };
    const readers: BundleReaders = {
      // Paged: one people_list call is capped at 1000 in the database, and this
      // bundle is streamed precisely so a workspace of any size downloads whole.
      // Not by offset, as the other sections are: People's order moves as
      // someone writes, so each person is read exactly once (everyoneOnce).
      people: () => everyoneOnce(ctx, tenantId),
      conversations: (offset, limit) =>
        rows(
          supabase
            .from("conversations")
            .select("id, contact_id, state, created_at, last_message_at, last_inbound_at")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + limit - 1),
        ),
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
        ).map((m) => ({
          conversation_id: m.conversation_id,
          stored_path: storedPathOf(m.media),
          id: m.id,
          direction: m.direction as MessageDto["direction"],
          sender: m.sender as MessageDto["sender"],
          type: m.type,
          body: m.body,
          media: mediaPublic(m.media),
          // A message's meta as stored, not through memberMetaOf: this is the owner's own copy of their data, and the
          // `pricing` a receipt keeps there (K8) holds the provider's category words and no amount.
          meta: m.meta as MessageDto["meta"],
          status: m.status,
          created_at: m.created_at,
          channel_ts: m.channel_ts,
          // The wire it travelled: a person's one thread holds every channel they wrote on (R14 X4).
          ...(m.channel ? { channel: m.channel } : {}),
        })),
      calls: async (offset, limit) =>
        (
          await rows(
            supabase
              .from("calls")
              .select(CALL_COLUMNS)
              .eq("tenant_id", tenantId)
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .range(offset, offset + limit - 1),
          )
        ).map(toCallDto),
      consentHistory: async (offset, limit) =>
        (
          await rows(
            supabase
              .from("events")
              .select("id, subject_id, created_at, data")
              .eq("tenant_id", tenantId)
              .eq("kind", "contact.consent_changed")
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .range(offset, offset + limit - 1),
          )
        ).map(consentChangeOf),
      ...workspaceSections(supabase, tenantId),
    };
    const { name, timezone } = await tenantFacts(supabase, tenantId);
    const now = new Date();
    log.info("export.workspace", { user: userId, tenant_id: tenantId });
    // On the ledger before the first byte: the copy exists once this returns.
    await recordDecision(ctx, tenantId, "workspace", tenantId, "export", { what: "workspace" });
    return attachmentStream(
      `workspace-${safeName(name)}-${dateTag(now, timezone)}.json`,
      workspaceBundle(readers, {
        workspaceId: tenantId,
        business: name,
        tz: timezone,
        exportedAt: now,
        page: BUNDLE_PAGE,
      }),
      "application/json",
    );
  },
});

/** Where a message's file is kept, once the store holds it; none for one still fetching or never fetched. */
function storedPathOf(media: unknown): string | null {
  if (!media || typeof media !== "object") return null;
  const m = media as { storage_path?: unknown; fetch_state?: unknown };
  return m.fetch_state === "stored" && typeof m.storage_path === "string" ? m.storage_path : null;
}
