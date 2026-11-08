/**
 * A conversation as a text file (app/api/v1/conversations/:id/export): the whole thread, not the screen's page: every
 * message, oldest first, for the business's own records. The export is written to the ledger as a decision. The route
 * declares who may and how often.
 */
import { AppError, memberMetaOf } from "@chanlytics/contracts";
import type { MessageDto } from "@chanlytics/contracts";
import { requireUuid } from "@/server/shared/request-guards";
import { getTenantFacts } from "@/server/shared/tenant";
import { mediaPublic } from "@/server/conversations/dto";
import { attachment, dateTag, personLabel, safeName, transcriptText } from "@/server/shared/export-file";
import { recordDecision } from "@/server/shared/verbs";
import { log } from "@/server/shared/log";
import type { Member, Params } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";
import { findThreadForExport, pageThreadForExport } from "@chanlytics/db/conversations";

const THREAD_EXPORT_PAGE = 500;

export async function exportConversation(ctx: RouteContext & { params: Params }, member: Member) {
  const { supabase, userId, params } = ctx;
  const id = requireUuid(params.id, "conversation");
  const { data: conv, error } = await findThreadForExport(supabase, member.tenantId, id);
  if (error) throw new Error(error.message);
  if (!conv) throw new AppError("not_found", "Conversation not found.");
  // Offset paging under one TOTAL order, as the workspace export does, not a
  // `.lt(created_at)` cursor: two messages written in the same transaction
  // share a timestamp to the microsecond, and a cursor that steps strictly
  // past the last one on a page drops every message tied with it -- silently,
  // from the file whose whole promise is "every message". Read until a short
  // page, with no count of pages: twenty of them stopped a longer thread at
  // its 10,000th message, and the file and its ledger row read as the whole.
  // The workspace export reads every thread this way, so one thread is less.
  const messages: MessageDto[] = [];
  for (let page = 0; ; page++) {
    const { data, error: merr } = await pageThreadForExport(
      supabase,
      id,
      page * THREAD_EXPORT_PAGE,
      page * THREAD_EXPORT_PAGE + THREAD_EXPORT_PAGE - 1,
    );
    if (merr) throw new Error(merr.message);
    if (!data?.length) break;
    for (const row of data) {
      messages.push({
        id: row.id,
        direction: row.direction,
        sender: row.sender,
        type: row.type,
        body: row.body,
        media: mediaPublic(row.media),
        meta: memberMetaOf(row.meta),
        status: row.status,
        created_at: row.created_at,
        channel_ts: row.channel_ts,
        // The wire it travelled, which the file says (R14 X4): a person's one thread holds every channel they wrote on.
        ...(row.channel ? { channel: row.channel } : {}),
      });
    }
    if (data.length < THREAD_EXPORT_PAGE) break;
  }
  const { name, timezone } = await getTenantFacts(supabase, member.tenantId);
  const contact = {
    id: conv.contacts?.id ?? "",
    display_name: conv.contacts?.display_name ?? null,
    wa_profile_name: conv.contacts?.wa_profile_name ?? null,
    phone_e164: conv.contacts?.phone_e164 ?? null,
    consent: null,
    dnc: false,
  };
  const now = new Date();
  const text = transcriptText({ contact }, messages, { business: name, tz: timezone, exportedAt: now });
  log.info("export.transcript", {
    user: userId,
    tenant_id: member.tenantId,
    conversation: id,
    messages: messages.length,
  });
  await recordDecision(ctx, member.tenantId, "conversation", id, "export", {
    what: "conversation",
    messages: messages.length,
  });
  return attachment(`conversation-${safeName(personLabel(contact))}-${dateTag(now, timezone)}.txt`, text, "text/plain");
}
