/**
 * A person's address as a message gave it (decision 0111): kept where none is on file, under the row's lock
 * (note_person_email, 00593), and the door a member's own edit goes through (set_person_email, 00171), which writes the
 * event and refuses one another person holds (23505).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DbFailure } from "@chanlytics/contracts";
import { readAnswer } from "../../shared/read-json";
import type { Database } from "../../types";
import type { TenantId, ContactId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** What became of an address a customer wrote in their own message (note_person_email, 00593). */
export type EmailNoted = "kept" | "had_one" | "taken" | "not_found";

/**
 * An address a customer gave in their own words, kept on their row only where none is on file: one call, under the row's
 * lock (00593). Another person here holding it is `taken` and never moved: the owner merges them. A write that fails
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

/**
 * A living person's name and the address on their page, or null for someone this workspace does not hold: erased, or
 * a record combined into another. What a reply is addressed by, when their record was made, and whether they said yes
 * to offers by email (a yes the address gave, which a changed address ends: set_person_email, 00726), read on the
 * member's own session.
 */
export async function findPersonAddress(
  db: Db,
  tenantId: TenantId,
  contactId: ContactId,
): Promise<{
  id: ContactId;
  name: string | null;
  email: string | null;
  createdAt: string;
  emailOffers: boolean;
} | null> {
  const { data, error } = await db
    .from("contacts")
    .select("id, display_name, wa_profile_name, email, created_at, email_marketing")
    .eq("tenant_id", tenantId)
    .eq("id", contactId)
    .is("erased_at", null)
    .is("merged_into_contact_id", null)
    .maybeSingle();
  if (error) throw new DbFailure(error, "contacts");
  if (!data) return null;
  return {
    id: data.id,
    name: data.display_name ?? data.wa_profile_name,
    email: data.email,
    createdAt: data.created_at,
    emailOffers: data.email_marketing === "opted_in",
  };
}
