/**
 * Cold email's one line on Today, from the same one answer as its page (contracts coldEmailStandingOf). Only once a
 * workspace has started cold email, a search or a sequence, and only where it waits on the owner: a business that writes
 * no cold email is never asked about it (decision 0113; its read says so first, from two reads), and a business that does
 * hears it where it looks each morning. Its read is its own small one (GET settings/reach-out/note, ../cold-email-note-read.ts),
 * asked as Today is drawn and again as the day moves, at most once a minute: a mailbox that needs reconnecting shows up
 * while Today stays open. Its first draw is what the tab holds (a load that opens on Today waits for it, a return holds the
 * last answer), so the card stands with the page and never lands on it. A read that fails or is refused takes the line
 * away, since it claims nothing it could not read. Its press is gated by what it does, as the page's is.
 */
import { useEffect, useRef, useState } from "react";
import { MIN_MS, type ColdEmailNote as Note } from "@chanlytics/contracts";
import { gate, navigate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { useSurface } from "../../use-surface";
import { keptColdEmailNote, readColdEmailNote } from "../cold-email-note-read";

export function ColdEmailNote() {
  // Asked as it is drawn, and again as the day moves: its read is its own, so it never waits for the day's.
  const day = useSurface("today");
  // What the tab holds, there in the first draw; the read behind it says what it is now.
  const [note, setNote] = useState<Note | null>(() => keptColdEmailNote()?.note ?? null);
  const askedAt = useRef<number | null>(null);
  useEffect(() => {
    const now = Date.now();
    if (askedAt.current !== null && now - askedAt.current < MIN_MS) return;
    askedAt.current = now;
    void readColdEmailNote().then(setNote);
  }, [day]);
  if (!note) return null;
  return (
    <section className="rec-card tz-cold-email" data-testid="today-cold-email">
      <p className="tz-cold-email-words">{note.headline}</p>
      <Button
        size="sm"
        onClick={() => navigate(note.to)}
        {...(note.needs ? gate(note.needs) : {})}
        data-testid="today-cold-email-open"
      >
        {note.act}
      </Button>
    </section>
  );
}
