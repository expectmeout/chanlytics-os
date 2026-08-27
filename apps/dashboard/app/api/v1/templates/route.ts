import { withRoute } from "@/server/with-route";

/** GET /api/v1/templates — the composer's outside-window picker (approved only). */
export const GET = withRoute(async (_req, { supabase }) => {
  const { data, error } = await supabase
    .from("templates")
    .select("id, channel, name, language, body_preview, variables")
    .eq("meta_status", "approved")
    .order("name");
  if (error) throw new Error(error.message);
  return { templates: data ?? [] };
});
