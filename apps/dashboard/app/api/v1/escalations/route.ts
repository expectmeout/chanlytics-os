import { withRoute } from "@/server/with-route";

/** GET /api/v1/escalations?state=open — the Inbox queue, RLS-scoped. */
export const GET = withRoute(async (req, { supabase }) => {
  const state = new URL(req.url).searchParams.get("state") ?? "open";
  const { data, error } = await supabase
    .from("escalations")
    // The joined conversation and its contact PII used to ride along here and
    // no consumer ever read them: both callers (the Inbox and Today overrides)
    // type these rows as EscalationDto + conversation_id and join to the
    // conversations they already fetched. So every inbox refresh — which is
    // every realtime message and every tab focus — shipped customer names and
    // phone numbers across the wire to be discarded on arrival.
    .select("id, reason, details, state, created_at, conversation_id")
    .eq("state", state)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return { escalations: data ?? [] };
});
