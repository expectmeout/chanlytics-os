/**
 * Who a teammate is by name, for a thread they have (D1-hold-words): "Ruben has it" on the Inbox's row and bar, on
 * Conversations' pill and on People's Receptionist fact, from the one roster, the team Settings reads (`__TEAM`). A name is
 * the one the workspace says a member by (contracts memberWords), and never an invented one: where the roster is unread, or
 * the teammate has left it, there is no name and the words say "A teammate" (contracts heldPill).
 */
import { memberWords } from "@chanlytics/contracts";
import { windowValue } from "./shell-doors";

/** A member of the roster, as the team read answers it. */
interface RosterMember {
  userId: string;
  email: string;
  displayName?: string | null;
}

/** The team Settings reads, or null where it is unread. */
function roster(): RosterMember[] | null {
  const t = windowValue("__TEAM");
  return Array.isArray(t) ? (t as RosterMember[]) : null;
}

/**
 * A teammate's name by their user id: the roster's, or null where it is unread or they are no longer on it. It is contracts'
 * `HolderNames` for the pages that build a view model with the roster (People's rows, the person's page), and what the Inbox
 * and Conversations name the holder of a row with.
 */
export function holderName(userId: string | null | undefined): string | null {
  const member = userId ? roster()?.find((m) => m.userId === userId) : null;
  return member ? memberWords({ email: member.email, display_name: member.displayName || null }).name : null;
}
