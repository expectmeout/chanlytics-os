/**
 * A forwarded line's test, begun by the member signed in (line_forwarding_test): the door judges their seat and the
 * line's state, and answers the test the edge then watches for. Its answer is the door's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;
type Args<F extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][F]["Args"];

/** A test call asked for, to prove the business's own number forwards to the line. */
export const testLineForwarding = async (db: Db, args: Args<"line_forwarding_test">) =>
  db.rpc("line_forwarding_test", args);
