/**
 * A note suggested on a person's page (decision 0007, 00157; 00488 for a website's form): written `suggested`, shown
 * with Keep and Dismiss, and read by the receptionist only once a member keeps it. The service role alone, through
 * person_note_suggest, which refuses rather than raises: once per source (`source_id`), at most three waiting per person.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** Where a suggested note came from: a call, a thread, or a form on the business's website. */
type SuggestedNoteSource = "call" | "thread" | "website";

/**
 * Suggest a note on a person. The note's id, or the door's refusal (`empty`, `too_long`, `bad_source`, `not_found`,
 * `already`, `too_many`); a failed call throws.
 */
export async function suggestPersonNote(
  db: Db,
  p: { tenantId: string; contactId: string; body: string; source: SuggestedNoteSource; sourceId: string | null },
): Promise<{ noteId: string } | { refused: string }> {
  const { data, error } = await db.rpc("person_note_suggest", {
    p_tenant_id: p.tenantId,
    p_contact_id: p.contactId,
    p_body: p.body,
    p_source: p.source,
    ...(p.sourceId ? { p_source_id: p.sourceId } : {}),
  });
  if (error) throw new Error(`person_note_suggest: ${error.message}`);
  const o = (data ?? {}) as { error?: unknown; note?: { id?: unknown } };
  if (typeof o.error === "string") return { refused: o.error };
  if (typeof o.note?.id !== "string") throw new Error("person_note_suggest answered without a note");
  return { noteId: o.note.id };
}
