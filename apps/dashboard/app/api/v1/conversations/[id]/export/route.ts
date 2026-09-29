import { AppError } from "@chanlytics/contracts";
import type { MessageDto } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { tenantFacts } from "@/server/tenant";
import { mediaPublic } from "@/server/dto";
import { attachment, dateTag, personLabel, safeName, transcriptText } from "@/server/export/export";
import { recordDecision } from "@/server/verbs";
import { log } from "@/server/log";

const PAGE = 500;
const MAX_PAGES = 20;

/**
 * GET /api/v1/conversations/:id/export — the whole thread as a text file,
 * not the screen's page: every message, oldest first, for the business's
 * own records. Any member, in the workspace the tab named, ten a minute.
 */
export const GET = read({
  scope: workspace,
  rate: "export",
  handle: async ({ ctx, member }) => {
    const { supabase, userId, params } = ctx;
    const id = requireUuid(params.id, "conversation");
    const { data: conv, error } = await supabase
      .from("conversations")
      .select("id, tenant_id, contacts (id, display_name, wa_profile_name, phone_e164, email)")
      .eq("id", id)
      .eq("tenant_id", member.tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conv) throw new AppError("not_found", "Conversation not found.");
    // Offset paging under one TOTAL order, as the workspace export does, not a
    // `.lt(created_at)` cursor: two messages written in the same transaction
    // share a timestamp to the microsecond, and a cursor that steps strictly
    // past the last one on a page drops every message tied with it -- silently,
    // from the file whose whole promise is "every message".
    const messages: MessageDto[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error: merr } = await supabase
        .from("messages")
        .select("id, direction, sender, type, body, media, meta, created_at, status, channel_ts")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (merr) throw new Error(merr.message);
      if (!data?.length) break;
      for (const m of data) {
        messages.push({
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
        });
      }
      if (data.length < PAGE) break;
    }
    const { name, timezone } = await tenantFacts(supabase, member.tenantId);
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
    return attachment(
      `conversation-${safeName(personLabel(contact))}-${dateTag(now, timezone)}.txt`,
      text,
      "text/plain",
    );
  },
});
