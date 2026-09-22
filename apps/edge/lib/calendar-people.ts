/**
 * People from the calendar: every appointment that carries a phone number
 * puts its person in People, without anyone clicking.
 *
 * A booking tool writes the client's number into the event; the owner wants
 * that person known before they ever message — so their next visit shows on
 * their profile and the receptionist greets them by name the day they call.
 * If the owner does not want someone, they delete them from the profile.
 *
 * Get-or-create by phone, with the service role. A name fills only an empty
 * one, consent stays 'unknown' (a booking is not a yes to offers), and each
 * person created here gets a `contact.added` event that says where they
 * came from, so the profile can say "Added from your calendar".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./packages/db.js";
import type { CalendarPerson } from "./packages/contracts.js";
import { erasedTombstones } from "./erased.js";

export interface AddedFromCalendar {
  seen: number;
  added: number;
  named: number;
  /** Appointments whose person asked to be erased: left erased, never made again from the calendar. */
  erased: number;
}

export async function addPeopleFromCalendar(
  db: SupabaseClient<Database>,
  tenantId: string,
  rows: CalendarPerson[],
): Promise<AddedFromCalendar> {
  const out: AddedFromCalendar = { seen: rows.length, added: 0, named: 0, erased: 0 };
  if (!rows.length) return out;
  const phones = rows.map((r) => r.phone);
  // A person who asked to be erased is not brought back by their own
  // appointment: the tombstone keeps a keyed digest of the number (00124),
  // and an appointment that names it is left alone.
  const gone = await erasedTombstones(db, tenantId, phones);
  const { data: existing, error } = await db
    .from("contacts")
    .select("id, phone_e164, display_name")
    .eq("tenant_id", tenantId)
    .in("phone_e164", phones)
    .is("erased_at", null)
    .is("merged_into_contact_id", null);
  if (error) throw new Error(`calendar_people_read: ${error.message}`);
  const known = new Map((existing ?? []).map((c) => [c.phone_e164 as string, c]));

  for (const r of rows) {
    if (gone.has(r.phone)) {
      out.erased += 1;
      continue;
    }
    const have = known.get(r.phone);
    if (have) {
      // A name we did not have is worth keeping; one we have is never overwritten.
      if (!have.display_name && r.name) {
        const { error: uErr } = await db
          .from("contacts")
          .update({ display_name: r.name })
          .eq("id", have.id)
          .is("display_name", null);
        if (!uErr) out.named += 1;
      }
      continue;
    }
    const { data: created, error: iErr } = await db
      .from("contacts")
      .insert({ tenant_id: tenantId, phone_e164: r.phone, display_name: r.name })
      .select("id")
      .single();
    if (iErr) {
      // 23505: someone else created them between the read and now. Theirs is the one.
      if (iErr.code !== "23505") throw new Error(`calendar_people_insert: ${iErr.message}`);
      continue;
    }
    out.added += 1;
    await db.from("events").insert({
      tenant_id: tenantId,
      kind: "contact.added",
      category: "contact",
      subject_type: "contact",
      subject_id: created.id,
      data: { source: "calendar", title: r.title, uid: r.uid, start: new Date(r.start).toISOString() },
    });
  }
  return out;
}
