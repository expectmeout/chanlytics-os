/**
 * The note sweep (docs/decisions/0007-person-notes.md, phase 2): the receptionist suggests a note on a person, rarely.
 *
 * Never after every message. pg_cron asks every thirty minutes, and only when a call's analysis is in or a spell of
 * a customer's messages has been quiet for six hours (trigger_notes_sweep, 00159). Each call and each quiet spell is
 * looked at once -- note_candidates stamps what it hands over -- and most looks end with nothing: the gates are
 * contracts' (note-suggest.ts), the sweep lib/notes/suggest.ts, the transport lib/model.ts. A suggestion waits on the person's page for Keep
 * or Dismiss, and the receptionist reads nothing it wrote until a member keeps it.
 *
 * NOTE_SUGGESTIONS=off stops it without a deploy of the database: the clock still asks, and this answers that it is
 * off. Auth: the shared cron secret, as every sweep (lib/cron-auth.ts).
 */
import { json } from "../../lib/http.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { pg } from "../../lib/pg.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/log.js";
import { askNoteModel, suggestNotes } from "../../lib/notes/suggest.js";

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "notes" });
  const db = pg();
  if (!db) {
    L.error("notes_no_db");
    return json(503, { ok: false, error: "no_database" });
  }
  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;
  if ((env.NOTE_SUGGESTIONS ?? "").toLowerCase() === "off") {
    L.info("notes_sweep_off");
    return json(200, { ok: true, off: true });
  }
  const out = await suggestNotes({ db, L, ask: askNoteModel, nowMs: Date.now() });
  L.info("notes_swept", { looked: out.looked, asked: out.asked, suggested: out.suggested, ended: out.ended });
  return json(200, { ok: true, ...out });
}
