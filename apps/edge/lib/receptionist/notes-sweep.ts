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
 * Then the owner's corrections (decision 0063): a held draft rewritten to their instruction, or their own text after a
 * hold, each looked at once (fact_candidates), and the clock asks when one waits too (00448). A note for the receptionist
 * waits on Settings › Autonomy for Keep or Dismiss. Each step's counts are their own line; one that fails leaves the other.
 *
 * Last, Ask's journal (decision 0070): the days of a workspace that ended an hour ago with something in them, written for
 * an owner's Ask, while the run has time for another before its ceiling (vercel.json's sixty seconds), and the clock
 * asks when a day is due too (00471). It runs after the notes, so a slow model there costs the journal a day, never the
 * notes their look.
 *
 * NOTE_SUGGESTIONS=off stops the notes and the corrections without a deploy of the database: the clock still asks, and
 * this answers that they are off. The journal is its own switch, ASK_JOURNAL=on, off until it says on. Auth: the shared
 * cron secret, as every sweep (lib/cron-auth.ts).
 */
import { json } from "../http.js";
import { env } from "../env.js";
import {
  askFactModel,
  askJournalModel,
  askNoteModel,
  factsDbOf,
  journalDbOf,
  suggestFacts,
  suggestNotes,
  writeJournal,
} from "../notes.js";
import type { SweepTick } from "../ops/sweep-door.js";

/** How long a run may go before it stops taking work: under the function's sixty seconds, with room to answer. */
const SWEEP_CEILING_MS = 55_000;

export async function sweepNotes({ db, L, started }: SweepTick): Promise<Response> {
  const notesOff = (env.NOTE_SUGGESTIONS ?? "").toLowerCase() === "off";
  const journalOn = (env.ASK_JOURNAL ?? "").toLowerCase() === "on";
  let notes: Record<string, unknown> = { off: true };
  if (notesOff) L.info("notes_sweep_off");
  else {
    const out = await suggestNotes({ db, L, ask: askNoteModel, nowMs: Date.now() });
    L.info("notes_swept", { looked: out.looked, asked: out.asked, suggested: out.suggested, ended: out.ended });
    const facts = await suggestFacts({ db: factsDbOf(db), L, ask: askFactModel });
    L.info("facts_swept", { looked: facts.looked, asked: facts.asked, suggested: facts.suggested, ended: facts.ended });
    notes = { ...out, facts };
  }
  if (!journalOn) return json(200, { ok: true, ...notes });
  const journal = await writeJournal({
    db: journalDbOf(db),
    L,
    ask: askJournalModel,
    deadlineMs: started + SWEEP_CEILING_MS,
    now: Date.now,
  });
  L.info("journal_swept", { ...journal });
  return json(200, { ok: true, ...notes, journal });
}
