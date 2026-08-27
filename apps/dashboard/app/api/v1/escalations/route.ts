import { withRoute } from "@/server/with-route";

/** GET /api/v1/escalations?state=open — the Inbox queue, RLS-scoped. */
export const GET = withRoute(async (req, { supabase }) => {
  const state = new URL(req.url).searchParams.get("state") ?? "open";
  const { data, error } = await supabase
    .from("escalations")
    .select(
      "id, reason, details, state, created_at, conversation_id, conversations (id, state, paused_until, last_message_at, last_wa_inbound_at, contacts (id, display_name, wa_profile_name, phone_e164))",
    )
    .eq("state", state)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return { escalations: data ?? [] };
});
