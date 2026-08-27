/**
 * The single Realtime subscription wrapper (Blueprint §5): every surface
 * subscribes through here, so the documented scale path (postgres_changes →
 * broadcast-from-database) never touches a surface. RLS authorizes events —
 * callers pass an AUTHED client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export function subscribeMessagesInserts(
  client: SupabaseClient<Database>,
  onInsert: (row: { conversation_id: string; tenant_id: string }) => void,
): () => void {
  const channel = client
    .channel("db-messages-inserts")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => onInsert(payload.new as { conversation_id: string; tenant_id: string }),
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
