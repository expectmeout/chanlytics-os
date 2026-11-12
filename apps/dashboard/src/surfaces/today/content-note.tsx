/**
 * Content's one line on Today (the content redesign's stage 3), from its own small read (GET content/note, contracts
 * content/note.ts): only where there is something to say, what needs the owner first, then what is being made, then the next
 * post set for its time. It stands at the page's foot, under the week, so a line that lands after the page moves nothing above
 * it; kept in the tab by workspace (read-cache.ts `tab`), so a return draws it at once and reads again behind it, at most once
 * a minute as the day moves. A read that fails or is refused takes the line away: it claims nothing it could not read.
 */
import { useEffect, useRef, useState } from "react";
import { CONTENT_NOTE_WORDS as W, MIN_MS, contentNoteRouteOf, type ContentNote } from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { readCache } from "@/bridge/read-cache";
import { getActiveWorkspace } from "@/bridge/workspace";
import { pageClock } from "@/bridge/zone";
import { navigate } from "../frame-verbs";
import { Button } from "../kit/button/button";
import { useSurface } from "../use-surface";

/** The answer as it is kept: a workspace with nothing to say holds `note: null`, which is not the same as holding nothing. */
interface NoteHeld {
  note: ContentNote | null;
}

const noteHeld = readCache<NoteHeld>("content_note", () => true, { tab: true });

/** The read, kept for the workspace on screen; null where it failed or was refused. */
const askForNote = (): Promise<ContentNote | null> =>
  noteHeld
    .through(getActiveWorkspace() ?? "", async () => ({ note: (await read("GET content/note")).note }))
    .then(
      (held) => held.note,
      () => null,
    );

export function TodayContentNote() {
  // Asked as it is drawn, and again as the day moves: its read is its own, so it never waits for the day's.
  const day = useSurface("today");
  const [note, setNote] = useState<ContentNote | null>(() => noteHeld.peek(getActiveWorkspace() ?? "")?.note ?? null);
  const askedAt = useRef<number | null>(null);
  useEffect(() => {
    const now = Date.now();
    if (askedAt.current !== null && now - askedAt.current < MIN_MS) return;
    askedAt.current = now;
    void askForNote().then(setNote);
  }, [day]);
  if (!note) return null;
  const when = note.is === "next" ? pageClock().when(Date.parse(note.at)) : "";
  return (
    <section className="rec-card tz-cold-email tz-content-note" data-testid="today-content">
      <p className="tz-cold-email-words">{W.headline(note, when)}</p>
      <Button size="sm" onClick={() => navigate(contentNoteRouteOf(note))} data-testid="today-content-open">
        {W.open}
      </Button>
    </section>
  );
}
