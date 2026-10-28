/**
 * Get help's door (decisions 0066 and 0067): the frame's host opens its sheet through it, and a card whose read failed
 * offers "Report this" only while a host is there to open it. A door from something that failed opens the sheet on
 * "Something isn't working"; Settings opens it on a question. A module's one value, never a window global: the host
 * sets it as it mounts and takes it back as it goes.
 *
 * And said when it does (setReportDoor), so a part that draws a door to it hears it (useReportDoor): the host mounts in the
 * frame beside the page and sets its door after the page has drawn, and Profile's Get help row came a frame later, 86 px
 * (the Settings load review, 28 Oct 2026).
 */
import { useSyncExternalStore } from "react";
import type { ReportKind } from "@chanlytics/contracts";

type OpenReport = (what: string | null, kind?: ReportKind) => void;

export const reportDoor: { open: OpenReport | null } = { open: null };

const doorHearers = new Set<() => void>();
const hearDoor = (fn: () => void) => {
  doorHearers.add(fn);
  return () => void doorHearers.delete(fn);
};

/** The host's door, set as it mounts and taken back (null) as it goes; whoever draws a door to it is drawn again. */
export function setReportDoor(open: OpenReport | null): void {
  reportDoor.open = open;
  doorHearers.forEach((fn) => fn());
}

/** The door, while a host is there to open it: drawn again when one comes or goes. */
export const useReportDoor = (): OpenReport | null =>
  useSyncExternalStore(
    hearDoor,
    () => reportDoor.open,
    () => null,
  );
