import { z } from "zod";
import { AppError, dealsAreOn, normalizePhone, whyNotAPhone } from "@chanlytics/contracts";
import { read, write, workspace } from "@/server/route";
import { PEOPLE_PAGE, countPeople, listPeople } from "@/server/people";
import { withVisits } from "@/server/calendar";
import { sellsByOf } from "@/server/deals";
import { stepNamer } from "@/server/person-notes";

const Query = z.object({
  q: z.string().max(80).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

/**
 * GET /api/v1/contacts — everyone who has written to or phoned this workspace.
 *
 * One row per live person (never erased, never merged) with the facts the
 * People surface renders, computed in SQL by `people_list` under the caller's
 * own RLS. The state a person is in is NOT decided here: the view model
 * derives it from these facts, so the rule lives in one tested place.
 *
 * A page at a time: `?q=` matches a name, a WhatsApp name or three digits
 * of the number; `?offset=` reads the next thousand under the same order.
 * `page` says how many there are in all and whether more follow, so the
 * page can stop at nothing and keep its counts right (00112).
 */
export const GET = read({
  scope: workspace,
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const tenantId = member.tenantId;
    const q = input?.q?.trim() || null;
    const offset = input?.offset ?? 0;
    const [rows, total] = await Promise.all([
      listPeople(ctx, tenantId, { q, offset, limit: PEOPLE_PAGE }),
      countPeople(ctx, tenantId, q),
    ]);
    // Each person with their appointments from the owner's calendar, when one is connected: Booked is a fact here,
    // not a stage. Never fatal to the list. In the same round trip, how this workspace's customers buy (0008): an
    // answer that cannot be read is not asked yet, and costs the deal lists, never the list.
    // And who each next step is for (00163), from the team, read only when a step is for someone.
    const [out, sellsBy, nameSteps] = await Promise.all([
      withVisits(ctx, tenantId, rows),
      sellsByOf(ctx, tenantId),
      stepNamer(ctx, tenantId, rows),
    ]);
    return {
      ...out,
      people: out.people.map(nameSteps),
      // Deals are on where the workspace says some customers get a proposal first (dealsAreOn, 0008): the Journey's
      // deal lists, the thread's menu item, the column. Consult-first stays a booking rule, sent for its own list; the
      // names of the services stay on the server.
      deals_on: dealsAreOn(sellsBy),
      consult_first: out.consult_first,
      page: { q, offset, limit: PEOPLE_PAGE, total, has_more: offset + rows.length < total },
    };
  },
});

/**
 * POST /api/v1/contacts — add a person by phone, before they ever write or call.
 *
 * From an appointment on the calendar, or anywhere an owner meets a number
 * first. Get-or-create through the `create_person` door (owner or
 * operator): an existing number returns that person, a name fills only an
 * empty one, and consent stays unknown — a booking is not a yes to offers
 * by WhatsApp. `{ phone, name?, source? }` in; `{ contact_id, existed }` out.
 *
 * The body is the route's own to read: normalizePhone decides what a phone
 * is, and whyNotAPhone says which kind of not-a-number it was given, in the
 * product's words. One sentence for every refusal told an owner looking at
 * a short code on their own screen that "a phone number is needed".
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "person_create",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => null)) as { phone?: unknown; name?: unknown; source?: unknown } | null;
    const raw = typeof body?.phone === "string" ? body.phone : null;
    const phone = normalizePhone(raw);
    if (!phone) throw new AppError("validation", whyNotAPhone(raw) ?? "A phone number is needed to add a person.");
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
    // Which door, for the record. Never "calendar" or "lead", the two doors people_list names (00138): those are the
    // sweep's and the converter's, written server-side, and a person added here by hand would say "A lead you found".
    const source =
      typeof body?.source === "string" &&
      /^[a-z_]{1,24}$/.test(body.source) &&
      body.source !== "calendar" &&
      body.source !== "lead"
        ? body.source
        : "manual";
    const { data, error } = await ctx.supabase.rpc("create_person", {
      p_tenant_id: member.tenantId,
      p_phone_e164: phone,
      p_display_name: name,
      p_source: source,
    });
    if (error) throw new AppError("validation", error.message);
    const out = data as { contact_id: string; existed: boolean };
    return { contact_id: out.contact_id, existed: out.existed };
  },
});
