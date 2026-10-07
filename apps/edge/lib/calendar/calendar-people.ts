/**
 * People from the calendar: every appointment that carries a phone number
 * puts its person in People, without anyone clicking.
 *
 * A booking tool writes the client's number into the event; the owner wants
 * that person known before they ever message — so their next visit shows on
 * their profile and the receptionist greets them by name the day they call.
 * If the owner does not want someone, they delete them from the profile.
 *
 * Each row goes through the one door a person is resolved by (resolve_person, decision 0034: 00342, 00344), as a
 * feed's word (found), with the appointment on the added event so the profile can say "Added from your calendar". The
 * door matches by number then address, makes nobody twice, fills a name and an address only where they are empty, keeps
 * an address another person here holds as theirs, and refuses a person who asked to be erased (PE001), who is counted
 * as erased and left alone. A doubt it raises (two records one identity could belong to) is its own to keep.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PERSON_FORGOTTEN, resolvePerson, type Database } from "../packages/db.js";
import type { CalendarPerson } from "../packages/contracts.js";

interface AddedFromCalendar {
  seen: number;
  added: number;
  named: number;
  /** Appointments whose person asked to be erased: left erased, never made again from the calendar. */
  erased: number;
  /** People already here with no address whose appointment carried one: filled, never overwritten. */
  emailed: number;
}

export async function addPeopleFromCalendar(
  db: SupabaseClient<Database>,
  tenantId: string,
  rows: CalendarPerson[],
): Promise<AddedFromCalendar> {
  const out: AddedFromCalendar = { seen: rows.length, added: 0, named: 0, erased: 0, emailed: 0 };
  for (const r of rows) {
    try {
      const made = await resolvePerson(db, {
        tenantId,
        phone: r.phone,
        email: r.email,
        name: r.name,
        assurance: "found",
        source: "calendar",
        detail: { title: r.title, uid: r.uid, start: new Date(r.start).toISOString() },
      });
      if (made.outcome === "new") out.added += 1;
      else {
        if (made.filled.includes("display_name")) out.named += 1;
        if (made.filled.includes("email")) out.emailed += 1;
      }
    } catch (e) {
      if ((e as { code?: string }).code === PERSON_FORGOTTEN) {
        out.erased += 1;
        continue;
      }
      throw e;
    }
  }
  return out;
}
