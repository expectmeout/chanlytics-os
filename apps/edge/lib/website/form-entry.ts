/**
 * A website form's entry as it is kept (00674; the Forms plan, F0): what of the form it holds, what it owes after it,
 * and the digest its words are told apart by. Read by the door that keeps it (form-door.ts) and by the steps that
 * follow it (form-effects.ts), so both read an entry the same way.
 */
import { createHash } from "node:crypto";
import { WebsiteFormBody, websiteFormLate, type FormEffect, type WebsiteFormInput } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db/types";

/** What an entry keeps of the form: everything the visitor sent, never the workspace, its key or the site's own id. */
const EntryAnswers = WebsiteFormBody.omit({ workspace: true, key: true, entry_id: true });
export type EntryAnswers = Omit<WebsiteFormInput, "workspace" | "key" | "entry_id">;

/** The answers an entry keeps (form_entries.answers). */
export function entryAnswersOf(websiteFormInput: WebsiteFormInput): Json {
  const { workspace: _workspace, key: _key, entry_id: _entry, ...answers } = websiteFormInput;
  return { ...answers };
}

/** The answers an entry kept, read back as the form they came from; null for a row that is not one. */
export function entryAnswersFrom(answers: Json): EntryAnswers | null {
  const read = EntryAnswers.safeParse(answers);
  return read.success ? read.data : null;
}

/**
 * What an entry owes, decided as it arrives: always the note and the notice, and the ask too for a sign-up with an
 * address that arrived as it was sent (one that arrives late is old news, and its person signed up before anything
 * asked them).
 */
export function entryOwes(answers: Pick<EntryAnswers, "form" | "email" | "at">, nowMs: number): FormEffect[] {
  const asks = answers.form === "signup" && !!answers.email && !websiteFormLate(answers, nowMs);
  return asks ? ["note", "notice", "confirm"] : ["note", "notice"];
}

/**
 * The digest an entry's words are told apart by, with no id of the site's own: the form, the person's address and
 * number as one, what it is about, what they wrote, and when the site says it was sent. The same within ten minutes
 * is the same entry (call 19); later it is a new one.
 */
export function entryWords(
  answers: Pick<EntryAnswers, "form" | "about" | "note" | "at">,
  person: { email: string | null; phone: string | null },
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        answers.form,
        person.email,
        person.phone,
        answers.about ?? "",
        answers.note ?? "",
        answers.at ?? "",
      ]),
    )
    .digest("hex");
}
