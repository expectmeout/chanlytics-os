/**
 * A note suggested on a person's page (decision 0007, 00157; 00488 for a website's form): written `suggested`, shown
 * with Keep and Dismiss, and read by the receptionist only once a member keeps it. The service role alone, through
 * person_note_suggest, which refuses rather than raises: once per source (`source_id`), at most three waiting per person.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";
import type { TenantId, ContactId } from "@chanlytics/contracts";
import { z } from "zod";
import { readAnswer } from "../../shared/read-json";

/** What person_note_suggest answers: the door's refusal, or the note it kept. */
const NoteSuggested = z.object({ error: z.string(), note: z.object({ id: z.string() }).partial() }).partial();

type Db = SupabaseClient<Database>;

/** Where a suggested note came from: a call, a thread, or a form on the business's website. */
type SuggestedNoteSource = "call" | "thread" | "website";

/**
 * Suggest a note on a person. The note's id, or the door's refusal (`empty`, `too_long`, `bad_source`, `not_found`,
 * `already`, `too_many`); a failed call throws.
 */
export async function suggestPersonNote(
  db: Db,
  params: {
    tenantId: TenantId;
    contactId: ContactId;
    body: string;
    source: SuggestedNoteSource;
    sourceId: string | null;
  },
): Promise<{ noteId: string } | { refused: string }> {
  const { data, error } = await db.rpc("person_note_suggest", {
    p_tenant_id: params.tenantId,
    p_contact_id: params.contactId,
    p_body: params.body,
    p_source: params.source,
    ...(params.sourceId ? { p_source_id: params.sourceId } : {}),
  });
  if (error) throw new Error(`person_note_suggest: ${error.message}`);
  const value = readAnswer("person_note_suggest", NoteSuggested, data ?? {});
  if (typeof value.error === "string") return { refused: value.error };
  if (typeof value.note?.id !== "string") throw new Error("person_note_suggest answered without a note");
  return { noteId: value.note.id };
}
