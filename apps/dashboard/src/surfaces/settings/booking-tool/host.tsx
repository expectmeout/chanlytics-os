/**
 * What a door to the Booking tool opens, held once by the frame (store.ts says why): the sheet, drawn while it is asked
 * for. Drawn beside the shell (legacy-bridge/LegacyApp.tsx), as New conversation's host is, so one sheet answers the
 * Calendar, Today's setup card and Reports alike.
 *
 * The sheet is imported, not loaded on the press. The Business tab's fold and its saver already load with the shell
 * (the first run draws its rows), so there is nothing to keep out of a first load; and asked for on demand, the sheet
 * made the bundler divide a chunk the route shares, and Sent, People, Templates and Reports each downloaded ten to
 * thirteen kilobytes of it a second time (measured 9 October 2026).
 */
import { useEffect } from "react";
import { hostBookingTool, useLegacyToast } from "../../legacy-verbs";
import { BookingToolSheet } from "./sheet";
import { askBookingTool, closeBookingTool, useBookingToolAsked } from "./store";

/**
 * Nothing until the sheet is asked for. `route` is where the frame stands: a move to another page closes the sheet,
 * since Settings draws the same row and one fold has one hook (the kit's registry). The toast outlives the sheet, so
 * "Saved" is said after it has closed.
 */
export function BookingToolHost({ route }: { route: string | null }) {
  const ask = useBookingToolAsked();
  const [toast, flash] = useLegacyToast();
  useEffect(() => hostBookingTool(askBookingTool), []);
  useEffect(() => closeBookingTool, [route]);
  return (
    <>
      {ask.open ? <BookingToolSheet key={ask.session} onClosed={closeBookingTool} flash={flash} /> : null}
      {toast}
    </>
  );
}
