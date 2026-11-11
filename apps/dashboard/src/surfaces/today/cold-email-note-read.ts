/**
 * Cold email's one line on Today, as the page reads it (GET settings/reach-out/note): kept in the tab by workspace
 * (read-cache.ts `tab`), so Today draws its card from the last answer at once and reads again behind it; and, where the tab
 * opens on Today holding none, waited for by its first draw (surface-status firstDrawWaitsFor), the read the document's head
 * started with Today's own (contracts PREFETCH_READS). Asked only once the page had drawn and kept by the card alone, it
 * landed 0.3 to 0.6 s after the page on a first visit and pushed the day down, 79 px on a phone; and on a phone's return
 * the card stood in the kept picture, went as the page came, and came back 0.2 to 2.5 s later (the load review of 10 Nov
 * 2026). Its own module, apart from the card (zones/cold-email-note.tsx): the frame loads it with Today's surface
 * (override.ts), which holds the draw as it loads, before Today's gate first opens (a kept copy of Today opens it at once),
 * and only where the document's head has the read out: the frame takes that read and asks the server for nothing itself.
 */
import { firstRowsStand, type ColdEmailNote } from "@chanlytics/contracts";
import { headStarted, read } from "@/bridge/api";
import { readCache } from "@/bridge/read-cache";
import { firstDrawWaitsFor, isSurfaceReady } from "@/bridge/surface-status";
import { getActiveWorkspace } from "@/bridge/workspace";
import { todayOnScreen } from "./setup-card-code";

/** The answer as it is kept: a workspace with nothing to say holds `note: null`, which is not the same as holding nothing. */
interface NoteHeld {
  note: ColdEmailNote | null;
}

const noteHeld = readCache<NoteHeld>("cold_email_note", () => true, { tab: true });

/** The read, kept for the workspace on screen; null where it failed or was refused: the card claims nothing it could not read. */
const askForNote = (): Promise<ColdEmailNote | null> =>
  noteHeld
    .through(getActiveWorkspace() ?? "", async () => ({ note: (await read("GET settings/reach-out/note")).note }))
    .then(
      (held) => held.note,
      () => null,
    );

/** What this tab last read for the workspace on screen, or null where it holds nothing: what Today's first draw is made of. */
export const keptColdEmailNote = (): NoteHeld | null => noteHeld.peek(getActiveWorkspace() ?? "");

/** The load's own read, while the card has not taken it: the one Today's first draw waited for. */
let loadsRead: Promise<ColdEmailNote | null> | null = null;

/** Whether a phone's kept picture stands where the page will draw (contracts firstRowsStand); none where there is no document. */
const pictureStands = (): boolean => typeof document !== "undefined" && firstRowsStand(document);

/**
 * Settled a turn on where a copy of Today kept from an earlier visit is in hand (a tab reopened: the frame restores it as
 * it loads, FrameApp.tsx) and nothing stands in the page's place; never otherwise. Such a page draws at once: held for the
 * note it drew 0.4 to 1 s later, for a card that lands under what it shows. A phone's kept picture stands where the page
 * will, card and all, so there the page waits for the note under it.
 */
const drawsAtOnce = (): Promise<void> =>
  new Promise((done) => {
    queueMicrotask(() => {
      if (isSurfaceReady("today") && !pictureStands()) done();
    });
  });

/**
 * Where the tab opened on Today and holds no note, its first draw waits for the note as it waits for its own surface: said
 * as the frame loads Today's surface (override.ts), so before its gate can open, and only where the document's head has the
 * read out (a load on Today). The frame takes that read, so nothing more is asked of the server; no read of the head's, no
 * wait. A tab that holds a note draws it at once and is never held for the read behind it.
 */
export function holdTodayForNote(): void {
  if (!todayOnScreen() || keptColdEmailNote() || !headStarted("settings/reach-out/note")) return;
  loadsRead = askForNote();
  firstDrawWaitsFor("today", Promise.race([loadsRead, drawsAtOnce()]));
}

/**
 * The note read now, as the card asks for it. The first ask after a load that waited for it is that load's own read, so a
 * load never asks twice, and a page drawn before it landed (the route's wait passed) still hears it.
 */
export function readColdEmailNote(): Promise<ColdEmailNote | null> {
  const first = loadsRead;
  loadsRead = null;
  return first ?? askForNote();
}
