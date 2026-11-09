/**
 * Cold email's one line on Today, from the same one answer as its page (contracts coldEmailStandingOf). Only once a
 * workspace has started cold email, a search or a sequence, and only where it waits on the owner: a business that writes
 * no cold email is never asked about it (decision 0113), and a business that does hears it where it looks each morning.
 * Its read is its own small one (GET settings/reach-out/note), asked only then, and again as the day moves, at most once a
 * minute: a mailbox that needs reconnecting shows up while Today stays open.
 */
import { useEffect, useRef, useState } from "react";
import { MIN_MS, type ColdEmailNote as Note } from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { navigate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { useSurface } from "../../use-surface";
import { todayHasSearches } from "../surface";

export function ColdEmailNote() {
  // Drawn again as the day lands, which says whether there is a search, and as it moves.
  const day = useSurface("today");
  const started = todayHasSearches();
  const [note, setNote] = useState<Note | null>(null);
  const askedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!started) return;
    const now = Date.now();
    if (askedAt.current !== null && now - askedAt.current < MIN_MS) return;
    askedAt.current = now;
    api()("GET settings/reach-out/note").then(
      (r) => {
        if (r.ok) setNote(r.data.note);
      },
      // A read that failed says nothing here: the page itself says why, and Today has its own day to draw.
      () => {},
    );
  }, [started, day]);
  if (!note) return null;
  return (
    <section className="rec-card tz-cold-email" data-testid="today-cold-email">
      <p className="tz-cold-email-words">{note.headline}</p>
      <Button size="sm" onClick={() => navigate(note.to)} data-testid="today-cold-email-open">
        {note.act}
      </Button>
    </section>
  );
}
