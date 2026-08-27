import { AppError } from "@chanlytics/contracts";
import { withRoute } from "@/server/with-route";

/** GET /api/v1/conversations/:id — one thread's transcript, paginated by ?before. */
export const GET = withRoute(async (req, { supabase }) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/").pop()!;
  const before = url.searchParams.get("before");

  const { data: conv, error } = await supabase
    .from("conversations")
    .select("id, state, paused_until, last_message_at, contacts (id, display_name, wa_profile_name, phone_e164)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conv) throw new AppError("not_found", "Conversation not found.");

  let q = supabase
    .from("messages")
    .select("id, direction, sender, type, body, media, meta, created_at, status")
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (before) q = q.lt("created_at", before);
  const { data: msgs, error: merr } = await q;
  if (merr) throw new Error(merr.message);

  return { conversation: conv, messages: (msgs ?? []).reverse() };
});
