/**
 * The note sweep (docs/decisions/0007-person-notes.md, phase 2): the receptionist suggests a note on a person, rarely.
 *
 * The route is api/cron/notes.ts: sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks
 * the sweep key, then hands this its tick, so nothing below runs for a knock without the key.
 *
 * Never after every message. pg_cron asks every thirty minutes, and only when a call's analysis is in or a spell of
 * a customer's messages has been quiet for six hours (trigger_notes_sweep, 00159). Each call and each quiet spell is
 * looked at once -- note_candidates stamps what it hands over -- and most looks end with nothing: the gates are
 * contracts' (note-suggest.ts), the sweep lib/notes.ts, the transport lib/model.ts. A suggestion waits on the person's page for Keep
 * or Dismiss, and the receptionist reads nothing it wrote until a member keeps it.
 *
 * NOTE_SUGGESTIONS=off stops it without a deploy of the database: the clock still asks, and this answers that it is
 * off. Auth: the shared cron secret, as every sweep (lib/cron-auth.ts).
 */
import { json } from "../http.js";
import { env } from "../env.js";
import { askNoteModel, suggestNotes } from "../notes.js";
import type { SweepTick } from "../ops/sweep-door.js";

export async function sweepNotes({ db, L }: SweepTick): Promise<Response> {
  if ((env.NOTE_SUGGESTIONS ?? "").toLowerCase() === "off") {
    L.info("notes_sweep_off");
    return json(200, { ok: true, off: true });
  }
  const out = await suggestNotes({ db, L, ask: askNoteModel, nowMs: Date.now() });
  L.info("notes_swept", { looked: out.looked, asked: out.asked, suggested: out.suggested, ended: out.ended });
  return json(200, { ok: true, ...out });
}
