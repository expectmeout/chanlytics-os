/**
 * Cold email's one line on Today, from the same one answer as its page (contracts coldEmailStandingOf). Only once a
 * workspace has started cold email, a search or a sequence, and only where it waits on the owner: a business that writes
 * no cold email is never asked about it (decision 0113; its read says so first, from two reads), and a business that does
 * hears it where it looks each morning. Never a batch waiting for its OK: that is Need you's row over this card, and the
 * note leaves it to it (contracts coldEmailNoteOf, decision 0137). Its read is its own small one (GET settings/reach-out/note, ../cold-email-note-read.ts),
 * asked as Today is drawn and again as Today's own read lands, at most once a minute (../first-draw-read.ts useReadAsTheDayIsRead), never as the clock
 * makes the day again: a mailbox that needs reconnecting shows up while Today stays open. Its first draw is what the tab holds (a load that opens on Today waits for it, a return holds the
 * last answer), so the line stands with the page and never lands on it. It is a line by setting up (Today, calm, D17),
 * in no box: what it asks is setting-up work, so it joins Finish setting up where that draws a line, counted among what
 * is left and opened with it (D21, setup-card-body.tsx TodaySetupLine), and is a line of its own only where it does not. A read that fails or is refused takes the line
 * away, since it claims nothing it could not read. Its press is gated by what it does, as the page's is.
 */
import { useState } from "react";
import type { ColdEmailNote as Note } from "@chanlytics/contracts";
import { gate, navigate } from "../../frame-verbs";
import { Icon } from "../../kit/icon/icon";
import { CalmList, CalmRow } from "../calm/lines";
import { keptColdEmailNote, readColdEmailNote } from "../cold-email-note-read";
import { useReadAsTheDayIsRead } from "../first-draw-read";

/** Cold email's note, as Today holds it: what the tab holds in the first draw, then what its own read says it is now. */
export function useColdEmailNote(): Note | null {
  // What the tab holds, there in the first draw; the read behind it says what it is now.
  const [note, setNote] = useState<Note | null>(() => keptColdEmailNote()?.note ?? null);
  // The note's own read, which waits for none of the day's, asked again as Today's own read lands.
  useReadAsTheDayIsRead(readColdEmailNote, setNote);
  return note;
}

/**
 * The note as a line: what it asks, its act under it, and a press that does it. Gated by what it does, as the page's
 * is: a member who may not is told why where the press would be.
 */
export function ColdEmailRow({ note }: { note: Note }) {
  const held = note.needs ? gate(note.needs) : {};
  const refused = held.disabled ? (held.title ?? null) : null;
  return (
    <CalmRow
      first={{ mark: <Icon name="bolt" size={16} /> }}
      name={note.headline}
      said={refused ?? note.act}
      press={refused ? null : () => navigate(note.to)}
      testid="today-cold-email-open"
    />
  );
}

/** The note as a line of its own, where setting up has no line for it to join. */
export function ColdEmailLine({ note }: { note: Note }) {
  return (
    <CalmList label={note.headline} testid="today-cold-email">
      <ColdEmailRow note={note} />
    </CalmList>
  );
}
