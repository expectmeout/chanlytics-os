/**
 * A one-off's one count, in a module of its own: the Inbox reads the People tab's words (tab-words.ts), and
 * words/flow.ts would ride whole into its page with it (Build and bundle, #2245: +3.6 KB).
 */
import type { SequenceRowDto } from "./dto";

/**
 * How many people a one-off is said to reach (Ruben, 10 Nov 2026: one that went said "Went to 3 people" on its Steps while
 * its list row and its History said 2): before it goes, the people it is for (its batch's count, taken as it was made);
 * once it went, the people it was sent to, as the list and History count them (its last batch's sent), since a person it
 * could not reach is not one it went to. The one count every line about a one-off says.
 */
export function oneOffPeople(row: Pick<SequenceRowDto, "date" | "last">): number {
  const date = row.date;
  if (!date) return 0;
  if (date.state === "sent" && row.last && row.last.id === date.batch_id) return row.last.sent;
  return date.people;
}
