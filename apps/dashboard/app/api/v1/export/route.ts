import type { MessageDto } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { listPeople } from "@/server/people/people";
import { tenantFacts } from "@/server/tenant";
import { CALL_COLUMNS, MESSAGE_COLUMNS, mediaPublic, toCallDto } from "@/server/dto";
import { attachmentStream, dateTag, safeName } from "@/server/export/export";
import { BUNDLE_PAGE, consentChangeOf, workspaceBundle, type BundleReaders } from "@/server/export/export-bundle";
import { recordDecision } from "@/server/verbs";
import { log } from "@/server/log";

/**
 * GET /api/v1/export -- everything the workspace holds, as one JSON file:
 * people, conversations with their messages, calls with their transcripts,
 * and the consent history. The privacy page has promised this since it was
 * written. Owners only, like the people CSV: it is the whole customer record.
 * Read under the owner's own session, page by page, and streamed, so a
 * workspace of any size downloads without being held whole.
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
      // Paged like every other section: one people_list call is capped at 1000
      // in the database, and this bundle is streamed precisely so a workspace
      // of any size downloads whole.
      people: (offset, limit) => listPeople(ctx, tenantId, { offset, limit }),
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
      messages: async (conversationId, offset, limit) =>
        (
          await rows(
            supabase
              .from("messages")
              .select(MESSAGE_COLUMNS)
              .eq("conversation_id", conversationId)
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .range(offset, offset + limit - 1),
          )
        ).map((m) => ({
          id: m.id,
          direction: m.direction as MessageDto["direction"],
          sender: m.sender as MessageDto["sender"],
          type: m.type,
          body: m.body,
          media: mediaPublic(m.media),
          meta: m.meta as MessageDto["meta"],
          status: m.status,
          created_at: m.created_at,
          channel_ts: m.channel_ts,
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
