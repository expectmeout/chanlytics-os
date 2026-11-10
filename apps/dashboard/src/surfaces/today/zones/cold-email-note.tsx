/**
 * Cold email's one line on Today, from the same one answer as its page (contracts coldEmailStandingOf). Only once a
 * workspace has started cold email, a search or a sequence, and only where it waits on the owner: a business that writes
 * no cold email is never asked about it (decision 0113; its read says so first, from two reads), and a business that does
 * hears it where it looks each morning. Its read is its own small one (GET settings/reach-out/note), asked as Today is
 * drawn and again as the day moves, at most once a minute: a mailbox that needs reconnecting shows up while Today stays open.
 * A read that fails or is refused takes the line away, since it claims nothing it could not read. Its press is gated by
 * what it does, as the page's is.
 */
import { useEffect, useRef, useState } from "react";
import { MIN_MS, type ColdEmailNote as Note } from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { gate, navigate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { useSurface } from "../../use-surface";

export function ColdEmailNote() {
  // Asked as it is drawn, and again as the day moves: its read is its own, so it never waits for the day's.
  const day = useSurface("today");
  const [note, setNote] = useState<Note | null>(null);
  const askedAt = useRef<number | null>(null);
  useEffect(() => {
    const now = Date.now();
    if (askedAt.current !== null && now - askedAt.current < MIN_MS) return;
    askedAt.current = now;
    api()("GET settings/reach-out/note").then(
      (r) => setNote(r.ok ? r.data.note : null),
      () => setNote(null),
    );
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
