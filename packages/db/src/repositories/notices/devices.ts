/**
 * The member's own phones and bell, through their doors as the member signed in: a phone registered for pushes or
 * forgotten (00372), one notification read or dismissed, and the bell marked seen. Each answer is the door's as it came,
 * for the route to read its refusals in its own words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;
type Args<F extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][F]["Args"];

/** A phone's push token kept for the member (push_device_register). */
export const registerPushDevice = async (db: Db, args: Args<"push_device_register">) =>
  db.rpc("push_device_register", args);

/** A phone's push token forgotten (push_device_forget). */
export const forgetPushDevice = async (db: Db, args: Args<"push_device_forget">) => db.rpc("push_device_forget", args);

/** One notification marked read or dismissed (notification_mark). */
export const markNotification = async (db: Db, args: Args<"notification_mark">) => db.rpc("notification_mark", args);

/** The member's bell marked seen in a workspace (notifications_seen). */
export const markNotificationsSeen = async (db: Db, args: Args<"notifications_seen">) =>
  db.rpc("notifications_seen", args);
