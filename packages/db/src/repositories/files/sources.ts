/**
 * Footage sources (00639): the provider accounts a workspace connected so its footage is read where it already lives.
 * The one place `source_connections` is typed. Nothing connects one yet; here is the one read the rest of the app
 * already owes it: whether a Google account still holds a footage connection, asked before a Google grant is given
 * back (the edge's lib/shared/google/give-back.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

import { DbFailure } from "@chanlytics/contracts";
import { platformWide } from "../../shared/tenant-db";

type Db = SupabaseClient<Database>;

/**
 * A footage connection made with this Google account (its `sub`), whichever workspace's, but the one named: its id, or
 * null. Read across workspaces on purpose: a grant given back to Google ends every connection the account made. One
 * its organisation blocked names no account and is never found here; one that needs a reconnect still is, since its
 * grant comes back with a sign-in and a revoke would end the account's other connections all the same.
 */
export async function findGoogleSourceConnectionOfAccount(
  db: Db,
  account: string,
  exceptId: string | null,
): Promise<{ id: string } | null> {
  const ofAccount = platformWide(db)
    .from("source_connections")
    .select("id")
    .eq("provider", "google")
    .eq("provider_account", account);
  const { data, error } = await (exceptId ? ofAccount.neq("id", exceptId) : ofAccount).limit(1).maybeSingle();
  if (error) throw new DbFailure(error, "cannot read the Google account's footage connections");
  return data;
}
