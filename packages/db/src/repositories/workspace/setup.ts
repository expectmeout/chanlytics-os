/**
 * A workspace's request for help with its setup, made by the member signed in (setup_request): kept once, so a second
 * press says it was asked already. The answer is the door's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;
type Args<F extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][F]["Args"];

/** Help with one part of the setup asked for (setup_request). */
export const requestSetup = async (db: Db, args: Args<"setup_request">) => db.rpc("setup_request", args);

/** Whether the workspace asked for help with any of `whats` (a `setup.requested` event): one id, or none. */
export const findSetupAsked = async (db: Db, tenantId: string, whats: string[]) =>
  db
    .from("events")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("kind", "setup.requested")
    .in("data->>what", whats)
    .limit(1);
