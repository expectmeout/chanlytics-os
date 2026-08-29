import { withRoute, memberContext } from "@/server/with-route";
import type { CallDto } from "@chanlytics/contracts";

/**
 * GET /api/v1/calls — voice history, RLS-scoped, newest first.
 *
 * SECURITY: `recording.provider_url` is an UNSIGNED public CDN URL and
 * `storage_path` addresses the private bucket — neither may reach the browser.
 * The DTO exposes only fetch_state/mime/bytes; audio is served exclusively
 * through /api/v1/calls/:id/recording, which mints a short-lived signed URL.
 */
export const GET = withRoute(async (req, ctx) => {
  const { supabase } = ctx;
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversation_id");
  const status = url.searchParams.get("status");
  // One workspace, explicitly — RLS permits every tenant this caller belongs to,
  // which would interleave two businesses' call history in one list.
  const { tenantId } = await memberContext(ctx, url.searchParams.get("workspace"));

  let q = supabase
    .from("calls")
    .select(
      "id, retell_call_id, direction, call_type, status, from_e164, from_raw, to_e164, started_at, ended_at, duration_ms, disconnection_reason, sentiment, call_successful, in_voicemail, summary, transcript_object, recording, conversation_id, contact_id, message_id, contacts (display_name, wa_profile_name, phone_e164)",
    )
    .eq("tenant_id", tenantId)
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (conversationId) q = q.eq("conversation_id", conversationId);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const calls: CallDto[] = (data ?? []).map((c) => {
    const rec = c.recording as { fetch_state?: string; mime?: string | null; bytes?: number } | null;
    return {
      id: c.id,
      retell_call_id: c.retell_call_id,
      direction: c.direction as CallDto["direction"],
      call_type: c.call_type,
      status: c.status,
      from_e164: c.from_e164,
      from_raw: c.from_raw,
      to_e164: c.to_e164,
      started_at: c.started_at,
      ended_at: c.ended_at,
      duration_ms: c.duration_ms,
      disconnection_reason: c.disconnection_reason,
      sentiment: c.sentiment,
      call_successful: c.call_successful,
      in_voicemail: c.in_voicemail,
      summary: c.summary,
      transcript_object: c.transcript_object as CallDto["transcript_object"],
      // strip provider_url + storage_path
      recording: rec ? { fetch_state: rec.fetch_state, mime: rec.mime ?? null, bytes: rec.bytes } : null,
      conversation_id: c.conversation_id,
      contact_id: c.contact_id,
      message_id: c.message_id,
      contact: c.contacts
        ? {
            display_name: c.contacts.display_name,
            wa_profile_name: c.contacts.wa_profile_name,
            phone_e164: c.contacts.phone_e164,
          }
        : null,
    };
  });
  return { calls };
});
