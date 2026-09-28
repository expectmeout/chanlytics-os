/**
 * The people an appointment names who are not in People yet, put there through the `create_person` door: the one
 * write in the calendar's server code, made by calendarWeek (calendar-week.ts) and the calendar route, never by a
 * reader.
 */
import "server-only";
import { afterPersonRefused, peopleFromItems, type FeedItem, type PersonLike } from "@chanlytics/contracts";
import type { RouteContext } from "@/server/with-route";

/**
 * The people the feed names by phone who are not in People yet, added
 * through the `create_person` door — owner or operator only, which is what
 * `canAct` says; a viewer's read changes nothing. Capped per read: the
 * hourly sweep on the edge takes the rest. Never fatal to the board. The
 * calendar route makes this write itself, between its reader and the board:
 * a reader never writes (D7).
 */
export async function addPeopleSeen(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  items: FeedItem[],
  services: string[],
  people: PersonLike[],
  now: Date,
): Promise<PersonLike[]> {
  const have = new Set(people.map((p) => p.phone).filter(Boolean));
  const rows = peopleFromItems(items, services, now.getTime())
    .filter((r) => !have.has(r.phone))
    .slice(0, 40);
  const added: PersonLike[] = [];
  // Counted, then said once. Logging per row turned one bad number into forty
  // identical lines and still never said how many people it had cost.
  let refused = 0;
  let firstRefusal: string | null = null;
  for (const r of rows) {
    // The door records the `contact.added` event itself (members cannot
    // insert events), with the appointment that named them.
    const { data, error } = await ctx.supabase.rpc("create_person", {
      p_tenant_id: tenantId,
      p_phone_e164: r.phone,
      p_display_name: r.name ?? "",
      p_source: "calendar",
      p_title: r.title,
    });
    if (error) {
      // One bad number is one person, not everyone behind them. See
      // afterPersonRefused: 22023 is the door refusing THIS row, anything
      // else refuses every row and is worth stopping for.
      if (afterPersonRefused(error.code) === "skip") {
        refused += 1;
        firstRefusal ??= error.message;
        continue;
      }
      console.error(
        "calendar_person_add_failed",
        JSON.stringify({ tenant: tenantId, code: error.code, error: error.message }),
      );
      break;
    }
    const out = data as { contact_id: string; existed: boolean };
    // The appointment's one address, for a person just made from its number: the door refuses a taken or malformed
    // address (23505, 22023) and the person keeps none; never fatal to the board. One the door already had keeps
    // whatever address they have, and the board matches the new person by the address only when it was kept. The
    // door runs with the member's session, so History names the member who opened the board as the one who set it.
    let email: string | null = null;
    if (r.email && !out.existed) {
      const { error: eErr } = await ctx.supabase.rpc("set_person_email", {
        p_contact_id: out.contact_id,
        p_email: r.email,
      });
      if (!eErr) email = r.email;
      else if (eErr.code !== "23505" && eErr.code !== "22023")
        console.error("calendar_person_email_failed", JSON.stringify({ tenant: tenantId, code: eErr.code }));
    }
    added.push({ id: out.contact_id, name: r.name ?? "", phone: r.phone, email });
  }
  if (refused) {
    console.error(
      "calendar_people_refused",
      JSON.stringify({ tenant: tenantId, refused, of: rows.length, added: added.length, first: firstRefusal }),
    );
  }
  return added;
}
