/**
 * Get help's door (decisions 0066 and 0067): the frame's host opens its sheet through it, and a card whose read failed
 * offers "Report this" only while a host is there to open it. A door from something that failed opens the sheet on
 * "Something isn't working"; Settings opens it on a question. A module's one value, never a window global: the host
 * sets it as it mounts and takes it back as it goes.
 */
import type { ReportKind } from "@chanlytics/contracts";

export const reportDoor: { open: ((what: string | null, kind?: ReportKind) => void) | null } = { open: null };
