/**
 * Get help's host (decisions 0066 and 0067): the kit's report door while the frame is mounted, so any card may offer it
 * while the frame is there and none offers a door that opens nothing, and the sheet that door opens (report-sheet.tsx).
 *
 * The door is the frame's, set before its first paint; the sheet is fetched as it is first opened, as the Booking tool's
 * and New conversation's are (lane 1 of the cold-load review, 30 Oct 2026). A fetch that failed closes what was asked, so
 * the next press asks for the code again (code-once.ts).
 */
import { useEffect, useLayoutEffect, useState } from "react";
import type { ReportKind } from "@chanlytics/contracts";
import { REPORT_AFTER_KEY, lastClientError } from "@/client/client-error";
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import { setReportDoor } from "../kit/empty/report-door";
import type { Caught } from "./report-sheet";

/** The sheet's code, fetched once it is first opened. */
const sheetCode = codeOnce(() => import("./report-sheet").then(({ ReportSheet }) => ({ ReportSheet })));

/** What an error screen left for after its reload, once, read and forgotten: its error, or none caught; or nothing asked. */
function leftByAnErrorScreen(): { error: Caught } | null {
  try {
    const raw = window.sessionStorage.getItem(REPORT_AFTER_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(REPORT_AFTER_KEY);
    const said = JSON.parse(raw) as NonNullable<Caught> | { none: true };
    return { error: "id" in said ? said : null };
  } catch {
    return null;
  }
}

/**
 * The frame's host: the kit's report door while the frame is mounted, and the sheet it opens, on the kind its door
 * named (a question from Settings; something that isn't working from a failed card or the error screen).
 */
export function ReportHost() {
  const [open, setOpen] = useState<{ error: Caught; kind: ReportKind } | null>(null);
  // Before the frame is painted, so a page's door to it (Profile's Get help) is in the page's first frame.
  useLayoutEffect(() => {
    setReportDoor((_what, kind) => setOpen({ error: lastClientError(), kind: kind ?? "how_to" }));
    const left = leftByAnErrorScreen();
    if (left) setOpen({ ...left, kind: "wrong" });
    return () => setReportDoor(null);
  }, []);
  const code = useCode(sheetCode, open !== null);
  const { failed, retry } = code;
  useEffect(() => {
    if (!failed) return;
    setOpen(null);
    retry();
  }, [failed, retry]);
  const ReportSheet = code.loaded?.ReportSheet;
  return open && ReportSheet ? (
    <ReportSheet error={open.error} opened={open.kind} onClose={() => setOpen(null)} />
  ) : null;
}
