import { withRoute } from "@/server/with-route";

/** GET /api/v1/calls — voice history, RLS-scoped. Newest first. */
export const GET = withRoute(async (req, { supabase }) => {
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversation_id");
  let q = supabase
    .from("calls")
    .select(
      "id, retell_call_id, direction, call_type, from_e164, from_raw, to_e164, status, started_at, ended_at, duration_ms, disconnection_reason, sentiment, call_successful, in_voicemail, summary, transcript_object, recording, conversation_id, contact_id, contacts (display_name, wa_profile_name, phone_e164)",
    )
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (conversationId) q = q.eq("conversation_id", conversationId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { calls: data ?? [] };
});
