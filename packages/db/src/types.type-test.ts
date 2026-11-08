/**
 * The database's closed sets reach the code through the client, proved where the compiler reads it (types.ts): a column a
 * CHECK closes is read as its set, filtered and written only with a word of it, and a column no CHECK closes is the
 * generated type, unchanged.
 *
 * A type test: each line under `@ts-expect-error <why>` must not compile. Nothing imports this file, so no build reaches
 * it and nothing runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Exactly, Holds, SchemaSet } from "@chanlytics/contracts";
import type { Database } from "./types";

type Profiles = Database["public"]["Tables"]["anthropic_profiles"];

type _Proofs = [
  // A closed column is its set, and a nullable one its set or null.
  Holds<Exactly<Profiles["Row"]["kind"], SchemaSet<"anthropic_profiles.kind">>>,
  Holds<Exactly<Profiles["Row"]["enforcement_status"], SchemaSet<"anthropic_profiles.enforcement_status">>>,
  // An open column is the generated type.
  Holds<Exactly<Profiles["Row"]["profile_id"], string | null>>,
  // A write may leave out what the database defaults, as before.
  Holds<
    Exactly<Profiles["Insert"]["enforcement_status"], SchemaSet<"anthropic_profiles.enforcement_status"> | undefined>
  >,
];

declare const db: SupabaseClient<Database>;

async function _readsTheSet(): Promise<SchemaSet<"anthropic_profiles.kind"> | undefined> {
  const { data } = await db.from("anthropic_profiles").select("kind").eq("kind", "person").maybeSingle();
  return data?.kind;
}

// @ts-expect-error a filter's word is one of the set: no profile is of kind "team"
void db.from("anthropic_profiles").select("id").eq("kind", "team");

// @ts-expect-error a write's word is one of the set: Anthropic says no such enforcement
void db.from("anthropic_profiles").update({ enforcement_status: "suspended" }).eq("id", "row-id");
void _readsTheSet;
