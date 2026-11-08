/**
 * The database's closed sets reach the code through the client, proved where the compiler reads it (types.ts): a column a
 * CHECK closes is read as its set, filtered and written only with a word of it, and a column no CHECK closes is the
 * generated type, unchanged.
 *
 * A type test: each line under `@ts-expect-error <why>` must not compile. Nothing imports this file, so no build reaches
 * it and nothing runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactId, Exactly, Holds, SchemaSet, TenantId } from "@chanlytics/contracts";
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

// @ts-expect-error a filter's word is one of the set: Anthropic says no such enforcement
void db.from("anthropic_profiles").select("id").eq("enforcement_status", "suspended");
void _readsTheSet;

// A row's ids are whose they are, on a table and on a function's rows: neither stands in for the other.
type Contacts = Database["public"]["Tables"]["contacts"]["Row"];
type Messages = Database["public"]["Tables"]["messages"]["Row"];
type DueDrafts = Database["public"]["Functions"]["reply_drafts_due"]["Returns"][number];
type _Ids = [
  Holds<Exactly<Contacts["id"], ContactId>>,
  Holds<Exactly<Contacts["tenant_id"], TenantId>>,
  Holds<Exactly<Messages["contact_id"], ContactId | null>>,
  Holds<Exactly<DueDrafts["tenant_id"], TenantId>>,
  // @ts-expect-error a person's id is not a workspace's
  Holds<Exactly<Contacts["id"], TenantId>>,
];
