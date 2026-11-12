/**
 * Cold email's one line on Today, as the page reads it (GET settings/reach-out/note): a card's own read that Today's first
 * draw waits for where the tab opens on Today holding none (first-draw-read.ts). Asked only once the page had drawn and
 * kept by the card alone, it landed 0.3 to 0.6 s after the page on a first visit and pushed the day down, 79 px on a phone;
 * and on a phone's return the card stood in the kept picture, went as the page came, and came back 0.2 to 2.5 s later (the
 * load review of 10 Nov 2026). Its own module, apart from the card (zones/cold-email-note.tsx): the frame loads it with
 * Today's surface (override.ts).
 */
import type { ColdEmailNote } from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { firstDrawRead } from "./first-draw-read";

const note = firstDrawRead<ColdEmailNote>(
  "cold_email_note",
  "settings/reach-out/note",
  async () => (await read("GET settings/reach-out/note")).note,
);

/** What this tab last read for the workspace on screen, or null where it holds nothing: `note: null` is a workspace with nothing to say. */
export const keptColdEmailNote = (): { note: ColdEmailNote | null } | null => {
  const held = note.kept();
  return held ? { note: held.value } : null;
};

/** Hold Today's first draw for the note, where the tab opens on Today holding none (first-draw-read.ts). */
export const holdTodayForNote = (): void => note.hold();

/** The note read now, as the card asks for it: the load's own read first, so a load never asks twice. */
export const readColdEmailNote = (): Promise<ColdEmailNote | null> => note.read();
