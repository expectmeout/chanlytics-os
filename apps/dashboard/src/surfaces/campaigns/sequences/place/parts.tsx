/**
 * A lead's place, said the same in every window (the canvas's "One place, two windows", 18 Oct 2026): the read of one
 * lead's place both windows share (useLeadPlace, GET leads/:id/place, cached as the record's reads are).
 */
import type { LeadStepWordsDto } from "@chanlytics/contracts";
import { useSequenceRead } from "../use-record";
import { sequenceVerbs as verbs } from "../verbs";

/**
 * One lead's own emails and their own words at each step (GET leads/:id/emails): read as its place is. A read that failed
 * leaves a row of History out, and says so for the words: the sheet edits none it could not read.
 */
export function useLeadEmails(leadId: string | null, again: number) {
  const read = useSequenceRead(leadId, verbs.leadEmails, verbs.peekLeadEmails, { again });
  return { read: read.state !== "reading", list: read.state === "read" ? read.data : [] };
}

/** While a lead's own words are on their way, or could not be read: none is said, and none may be typed over. */
const NO_WORDS: LeadStepWordsDto[] = [];

/** One lead's own words at each step that has some (GET leads/:id/words, decision 0096), read as their emails are. */
export function useLeadWords(leadId: string | null, again: number) {
  const read = useSequenceRead(leadId, verbs.leadWords, verbs.peekLeadWords, { again });
  return {
    read: read.state !== "reading",
    words: read.state === "read" ? read.data : NO_WORDS,
    wordsRead: read.state === "read",
  };
}

/** One lead's place (GET leads/:id/place): painted from the last answer this tab holds, read again behind, and after a press. */
export function useLeadPlace(leadId: string | null, again: number) {
  const read = useSequenceRead(leadId, verbs.place, verbs.peekPlace, { again });
  if (read.state === "read") return { read: true, failed: null, place: read.data };
  return { read: false, failed: read.state === "failed" ? read.why : null, place: null };
}
