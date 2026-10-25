/**
 * The history import's calendar part (decision 0073, R20): when a mailbox connects with its calendar ticked, one read of
 * the workspace's calendar now (the sweep's own read, calendar-sweep.ts readOneCalendar: People, the bookings, the
 * appointments and the ledger), whatever the hour, so the visits are in while the owner goes on.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY_MS, IMPORT_STOPPED_WORDS } from "../packages/contracts.js";
import { dueCalendars, noteImport, type Database } from "../packages/db.js";
import { readOneCalendar, type Kept } from "../calendar/calendar-sweep.js";
import type { Part, PartOutcome } from "./history-import.js";

type Db = SupabaseClient<Database>;

/** One read now. A workspace whose settings name no calendar (no grant set, or taken away) stops, said on its row. */
export async function calendarPart(db: Db, part: Part): Promise<PartOutcome> {
  const now = new Date();
  // Due whatever its last read: the page is asked for this workspace alone, as though the hour had come.
  const page = await dueCalendars(db, { before: new Date(now.getTime() + DAY_MS), limit: 1, tenantId: part.tenantId });
  const row = page.rows[0];
  const kept: Kept = { added: 0, moved: 0, back: 0, vanished: 0, seen: 0, stale: 0 };
  const r = row ? await readOneCalendar(db, row, now, part.log, kept) : null;
  if (!r || r.outcome === "none") {
    await noteImport(db, {
      tenantId: part.tenantId,
      source: "calendar",
      state: "failed",
      error: IMPORT_STOPPED_WORDS.notTicked("Your calendars"),
      add: true,
    });
    return { more: false };
  }
  if (r.outcome === "failed") {
    await noteImport(db, {
      tenantId: part.tenantId,
      source: "calendar",
      state: "failed",
      error: IMPORT_STOPPED_WORDS.failed,
      add: true,
    });
  }
  return { more: false };
}
