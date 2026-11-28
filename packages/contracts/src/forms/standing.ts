/**
 * Where an entry stands for its owner, as every screen of a form says it (00726): a form's own list, a site's, and the
 * request's page read this one rule. Nothing is kept apart from the record:
 *
 *   test      the entry's own mark (form_entries.test)
 *   held      its own state, with why (form_entries.state and held_why): the door's doubt, or a member's word
 *   answered  a link that answers it: a member's word (marked), a conversation that took it over, or a reply that left
 *   sending   its only answer is a reply still waiting to go, for the seconds it can be taken back
 *   aged      nobody answered it and its sixty days in Needs you passed: "Never answered"
 *   open      none of these: it waits in Needs you
 *
 * The last four are form_entries_standing's (packages/db readFormEntryStandings), which reads an entry's links and their
 * messages by the rule the open requests and their count read (form_requests_open). An entry with no standing read (it
 * went between two reads) is open: nothing is called answered that nobody answered. Pure.
 */
import type { EntryStandingDto } from "./dtos";

/** What was read of where an entry stands: one of the rule's four words. */
interface StandingRead {
  standing: "answered" | "sending" | "open" | "aged";
}

/** An entry's standing, from its own marks and what form_entries_standing read of it. */
export function entryStandingOf(
  entry: { test: boolean; held: boolean },
  stands: StandingRead | undefined,
): EntryStandingDto {
  if (entry.test) return "test";
  if (entry.held) return "held";
  return stands?.standing ?? "open";
}
