/**
 * A person's address as a message gave it (decision 0111): the address on file, and the door that keeps a new one
 * (set_person_email, 00171), which writes the event and refuses one another person holds (23505). Each answer is the
 * database's as it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** The address on file for one of the workspace's people, or none. */
export const findPersonEmail = (db: Db, tenantId: string, contactId: string) =>
  db.from("contacts").select("email").eq("id", contactId).eq("tenant_id", tenantId).maybeSingle();

/** An address kept on a person through its door (set_person_email). */
export const setPersonEmail = (db: Db, contactId: string, email: string) =>
  db.rpc("set_person_email", { p_contact_id: contactId, p_email: email });
