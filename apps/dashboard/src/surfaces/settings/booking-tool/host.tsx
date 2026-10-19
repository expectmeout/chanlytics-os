/**
 * What a door to the Booking tool opens, held once by the frame (store.ts says why): the sheet, drawn while it is asked
 * for. Drawn beside the shell (legacy-bridge/LegacyApp.tsx), as New conversation's host is, so one sheet answers the
 * Calendar, Today's setup card and Reports alike.
 *
 * The sheet is fetched as it is first asked for, as New conversation's is. It was imported (9 October 2026) because the
 * Business tab's fold and saver it draws already loaded with the shell, for the first run's rows, so a chunk of its own
 * kept nothing out of a first load and divided a chunk the route shared. The first run imports those rows itself now
 * (setup/shell.ts), so the shell carries none of the tab, and the sheet's 25 KB, compressed, are fetched by the few who
 * open it (the loadability review, 19 Oct 2026).
 */
import { useEffect } from "react";
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import { hostBookingTool, useLegacyToast } from "../../legacy-verbs";
import { askBookingTool, closeBookingTool, useBookingToolAsked } from "./store";

/** The sheet's code, fetched once; a fetch that failed is asked for again by the next press. */
const sheetCode = codeOnce(() => import("./sheet").then(({ BookingToolSheet }) => ({ BookingToolSheet })));

export function BookingToolHost({ route }: { route: string | null }) {
  const ask = useBookingToolAsked();
  const [toast, flash] = useLegacyToast();
  useEffect(() => hostBookingTool(askBookingTool), []);
  useEffect(() => closeBookingTool, [route]);
  const Sheet = useCode(sheetCode, ask.open).loaded?.BookingToolSheet;
  return (
    <>
      {ask.open && Sheet ? <Sheet key={ask.session} onClosed={closeBookingTool} flash={flash} /> : null}
      {toast}
    </>
  );
}
