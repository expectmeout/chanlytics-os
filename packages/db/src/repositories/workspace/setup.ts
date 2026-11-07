/**
 * A workspace's request for help with its setup, made by the member signed in (setup_request): kept once, so a second
 * press says it was asked already. The answer is the door's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;
type Args<F extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][F]["Args"];

/** Help with one part of the setup asked for (setup_request). */
export const requestSetup = (db: Db, args: Args<"setup_request">) => db.rpc("setup_request", args);
