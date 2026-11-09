/**
 * Cold email's one line on Today, from the same one answer as its page (contracts coldEmailStandingOf). Only once a
 * workspace has started cold email, a search or a sequence, and only where it waits on the owner: a business that writes
 * no cold email is never asked about it (decision 0113), and a business that does hears it where it looks each morning.
 * Its read is asked for only then, so a workspace with no search pays nothing for it.
 */
import { useEffect, useState } from "react";
import { coldEmailNoteOf, type ColdEmailStanding } from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { navigate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { todayHasSearches } from "../surface";
import { useDayVm } from "./day-vm";

export function ColdEmailNote() {
  // Drawn again as the day lands, which says whether there is a search.
  useDayVm();
  const started = todayHasSearches();
  const [standing, setStanding] = useState<ColdEmailStanding | null>(null);
  useEffect(() => {
    if (!started) return;
    let live = true;
    api()("GET settings/reach-out").then(
      (r) => {
        if (live && r.ok) setStanding(r.data.standing);
      },
      // A read that failed says nothing here: the page itself says why, and Today has its own day to draw.
      () => {},
    );
    return () => {
      live = false;
    };
  }, [started]);
  const note = standing ? coldEmailNoteOf(standing) : null;
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
