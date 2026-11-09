/**
 * A person's address as a message gave it (decision 0111): kept where none is on file, under the row's lock
 * (note_person_email, 00577), and the door a member's own edit goes through (set_person_email, 00171), which writes the
 * event and refuses one another person holds (23505).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DbFailure } from "@chanlytics/contracts";
import { readAnswer } from "../../shared/read-json";
import type { Database } from "../../types";
import type { TenantId, ContactId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** What became of an address a customer wrote in their own message (note_person_email, 00577). */
export type EmailNoted = "kept" | "had_one" | "taken" | "not_found";

/**
 * An address a customer gave in their own words, kept on their row only where none is on file: one call, under the row's
 * lock (00577). Another person here holding it is `taken` and never moved: the owner merges them. A write that fails
 * throws.
 */
export async function noteEmailTheyGave(
  db: Db,
  tenantId: TenantId,
  contactId: ContactId,
  address: string,
): Promise<EmailNoted> {
  const { data, error } = await db.rpc("note_person_email", {
    p_tenant_id: tenantId,
    p_contact_id: contactId,
    p_email: address,
  });
  if (error) throw new DbFailure(error, "note_person_email");
  return readAnswer("note_person_email", z.enum(["kept", "had_one", "taken", "not_found"]), data);
}

/** An address kept on a person through its door (set_person_email). */
export const setPersonEmail = async (db: Db, contactId: ContactId, email: string) =>
  db.rpc("set_person_email", { p_contact_id: contactId, p_email: email });
