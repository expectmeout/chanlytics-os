/**
 * What this workspace calls a booking (contracts appointmentWordOf over the word the workspace list the shell holds says,
 * tenants.appointment_word, 00458), for the words a page says of one: a visit's cancel, the booking link handed to a
 * customer, a column's head, Details' row. An appointment while the list is not held, as everywhere a workspace has said
 * nothing. A module of its own, so a page that says the word takes none of the visit line's parts with it.
 */
import { appointmentWordOf, type AppointmentWord } from "@chanlytics/contracts";
import { workspaceOverride } from "@/legacy-bridge/surface-data";

export function visitWordHere(): AppointmentWord {
  const ws = workspaceOverride.current();
  return appointmentWordOf(ws?.appointment_word ?? null);
}
