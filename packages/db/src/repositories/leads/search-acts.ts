/**
 * What a member does to a lead search through its doors, as the member signed in (decision 0057): a found lead kept,
 * left out or put back; a round's question answered; a search stopped or asked for more; an act undone. Each answer is
 * the door's as it came; the routes read its refusals in their own words (answerOf, refusalOf in the dashboard).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;
type Args<F extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][F]["Args"];

/** A found lead kept on the search (lead_member_keep). */
export const keepSearchMember = async (db: Db, args: Args<"lead_member_keep">) => db.rpc("lead_member_keep", args);

/** A found lead left out of the search (lead_member_exclude). */
export const excludeSearchMember = async (db: Db, args: Args<"lead_member_exclude">) =>
  db.rpc("lead_member_exclude", args);

/** A lead left out, put back on the search (lead_member_put_back). */
export const putBackSearchMember = async (db: Db, args: Args<"lead_member_put_back">) =>
  db.rpc("lead_member_put_back", args);

/** The owner's answer to the question a round stopped on (lead_round_answer). */
export const answerSearchRound = async (db: Db, args: Args<"lead_round_answer">) => db.rpc("lead_round_answer", args);

/** A search's running round stopped (lead_round_stop). */
export const stopSearchRound = async (db: Db, args: Args<"lead_round_stop">) => db.rpc("lead_round_stop", args);

/** A search asked for another round, at its estimate (lead_search_more). */
export const askSearchForMore = async (db: Db, args: Args<"lead_search_more">) => db.rpc("lead_search_more", args);

/** A member's act on a search undone, at the version they read (lead_undo). */
export const undoLeadOperation = async (db: Db, args: Args<"lead_undo">) => db.rpc("lead_undo", args);
