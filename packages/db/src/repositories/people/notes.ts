/**
 * A person's notes, changed through their doors as the member signed in (decision 0007): edited, decided (a note the
 * receptionist wrote, kept or let go), done, and removed. Each answer is the door's as it came, {note} or {error}, with
 * the database's own error beside it, for the caller to read as the notes routes read one (the dashboard's noteAnswer).
 * Adding one is addPersonNote, beside the person's page (pages.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;
type Args<F extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][F]["Args"];

/** A note's words, its owner, its date or its deal changed, at the version the member read (person_note_edit). */
export const editPersonNote = async (db: Db, args: Args<"person_note_edit">) => db.rpc("person_note_edit", args);

/** A note the receptionist suggested, kept in the member's words or let go (person_note_decide). */
export const decidePersonNote = async (db: Db, args: Args<"person_note_decide">) => db.rpc("person_note_decide", args);

/** A to-do note marked done, or open again (person_note_done). */
export const markPersonNoteDone = async (db: Db, args: Args<"person_note_done">) => db.rpc("person_note_done", args);

/** A note taken off the person (person_note_remove). */
export const removePersonNote = async (db: Db, args: Args<"person_note_remove">) => db.rpc("person_note_remove", args);

/** The people a note could be suggested for, `limit` of them (note_candidates). */
export const listNoteCandidates = async (db: Pick<Db, "rpc">, limit: number) =>
  db.rpc("note_candidates", { p_limit: limit });

/** A note suggested on a person, through its door (person_note_suggest). */
export const suggestNoteOnPerson = async (
  db: Pick<Db, "rpc">,
  args: Database["public"]["Functions"]["person_note_suggest"]["Args"],
) => db.rpc("person_note_suggest", args);
