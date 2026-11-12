/**
 * Content's card on Today, as the page reads it (GET content/note `today`, contracts content/note.ts): a card's own read that
 * Today's first draw waits for where the tab opens on Today holding none (first-draw-read.ts). Read only once the page had
 * drawn, the card (about 230 px) landed after it and pushed the day and everything under it down (the Part E review, 12 Nov
 * 2026). Its own module, apart from the card (content-note.tsx): the frame loads it with Today's surface (override.ts).
 */
import type { ContentTodayDto } from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { firstDrawRead } from "./first-draw-read";

const today = firstDrawRead<ContentTodayDto>(
  "content_note",
  "content/note",
  async () => (await read("GET content/note")).today,
);

/** What this tab last read for the workspace on screen, or null where it holds nothing. */
export const keptContentToday = (): ContentTodayDto | null => today.kept()?.value ?? null;

/** Hold Today's first draw for the card, where the tab opens on Today holding none (first-draw-read.ts). */
export const holdTodayForContent = (): void => today.hold();

/** The card's read now, as the card asks for it: the load's own read first, so a load never asks twice. */
export const readContentToday = (): Promise<ContentTodayDto | null> => today.read();
