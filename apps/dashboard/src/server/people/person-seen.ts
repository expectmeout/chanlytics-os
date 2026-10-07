/**
 * What a member has seen of a person (00346), as the signed-in member: the read every list's reader makes, and the
 * write the mark route does.
 *
 * A person is new to a member when the customer's last message or call came after the member last opened them, or
 * when the member put them back as unread (contracts conversations/standing.ts, isUnseen). The member's reading is
 * their own: the doors (contact_seen, contact_mark; packages/db contactSeen, markContact) read and write only the
 * caller's rows.
 */
import { seenBy, type SeenOf } from "@chanlytics/contracts";
import { contactSeen, markContact } from "@chanlytics/db";
import { log } from "@/server/log";
import { dbRefusal, type RouteContext } from "@/server/with-route";

/** The door is not there yet (the dashboard deployed before 00346), or nobody is signed in on this client (a reader run for Ask by the service). */
const NO_READING = new Set(["PGRST202", "42883", "28000"]);

/**
 * Each of these people's reading, for the member whose session `ctx` holds. Where there is no reading to have (the
 * door not there yet, or no member behind the client) every person's is unknown, and a row is then never called new: a
 * list does not claim an unread it has no mark for. Any other failure THROWS, as a read that failed does.
 */
export async function seenOfPeople(
  ctx: RouteContext,
  tenantId: string,
  contactIds: readonly string[],
): Promise<(contactId: string) => SeenOf> {
  if (!contactIds.length) return seenBy(null);
  try {
    return seenBy(await contactSeen(ctx.supabase, tenantId, contactIds));
  } catch (e) {
    const code = (e as { code?: string | null }).code;
    if (!code || !NO_READING.has(code)) throw e;
    // Said once a read, so a door that has gone missing or changed its shape is not a list that quietly never lights.
    log.warn("people_seen_unavailable", { tenant_id: tenantId, code });
    return seenBy(null);
  }
}

/**
 * The member's own mark on a person: seen, as they open them, or unread, as they put them back. `heardAt` is how far
 * they have seen, the customer's last moment as their screen held it. The answer carries the mark's stamp
 * (`marked_at`), which the screen that made it holds its own word against until a read carries it back. The person was
 * read under RLS by the route's scope first, so one not theirs is a 404 before this. A refusal the door raises is
 * carried back in its own sentence at the status its code says.
 */
export async function markPersonSeen(
  ctx: RouteContext,
  contactId: string,
  did: { seen: boolean; heardAt: string | null },
) {
  try {
    const mark = await markContact(ctx.supabase, contactId, did);
    return {
      contact_id: mark.contact_id,
      seen_at: mark.seen_at,
      marked_unread: !!mark.unread_at,
      marked_at: mark.marked_at,
    };
  } catch (e) {
    throw dbRefusal(e as { code?: string | null; message: string });
  }
}
