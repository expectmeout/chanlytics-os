/**
 * A person's own account, through its doors as the person signed in: the name they give (profile_set, 00068), and
 * their account deleted, every seat with it (delete_my_account, 00262). Each answer is the door's as it came; the route
 * says its refusals in its own words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;
type Args<F extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][F]["Args"];

/** The name the person gives, kept as their profile's (profile_set). */
export const setProfileName = async (db: Db, args: Args<"profile_set">) => db.rpc("profile_set", args);

/** The person's account deleted, as themselves (delete_my_account). */
export const deleteMyAccount = async (db: Db) => db.rpc("delete_my_account");

/** The name a person gave, as their profile keeps it, or none. */
export const findProfileName = async (db: Db, userId: string) =>
  db.from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
