import { AppError } from "@chanlytics/contracts";
import type { MessageDto } from "@chanlytics/contracts";
import { withRoute, memberContext } from "@/server/with-route";
import { requireUuid } from "@/server/request-guards";
import { takeRate } from "@/server/rate-limit";
import { tenantFacts } from "@/server/tenant";
import { mediaPublic } from "@/server/dto";
import { attachment, dateTag, personLabel, safeName, transcriptText } from "@/server/export";

const PAGE = 500;
const MAX_PAGES = 20;

/**
 * GET /api/v1/conversations/:id/export — the whole thread as a text file.
 *
 * Every message, oldest first, in channel time, in the business's zone. The
 * thread route pages by 100 for a screen; a file wants all of it, so this
 * walks the pages up to a ceiling no salon will reach. Any member of the
 * workspace may export a single thread — they can already read it.
 */
export const GET = withRoute(async (req, ctx) => {
  const { supabase, userId, params } = ctx;
  await takeRate(userId, "export");
  const id = requireUuid(params.id, "conversation");
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));

  const { data: conv, error } = await supabase
    .from("conversations")
    .select("id, tenant_id, contacts (id, display_name, wa_profile_name, phone_e164)")
    .eq("id", id)
    .eq("tenant_id", member.tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conv) throw new AppError("not_found", "Conversation not found.");

  const messages: MessageDto[] = [];
  let before: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = supabase
      .from("messages")
      .select("id, direction, sender, type, body, media, meta, created_at, status, channel_ts")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    if (before) q = q.lt("created_at", before);
    const { data, error: merr } = await q;
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
    before = data[data.length - 1].created_at;
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
  console.log(JSON.stringify({ level: "info", event: "export.transcript", user: userId, tenant: member.tenantId, conversation: id, messages: messages.length }));
  return attachment(`conversation-${safeName(personLabel(contact))}-${dateTag(now, timezone)}.txt`, text, "text/plain");
});
