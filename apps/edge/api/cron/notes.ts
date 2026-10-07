/**
 * The notes sweep's door: pg_cron asks it every thirty minutes (trigger_notes_sweep, 00159) with the sweep key, and it
 * answers what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is sweepNotes
 * in lib/receptionist/notes-sweep.ts: the receptionist suggests a note on a person, rarely.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepNotes } from "../../lib/receptionist/notes-sweep.js";

export const POST = sweepDoor({ sweep: "notes", noDbEvent: "notes_no_db" }, sweepNotes);
