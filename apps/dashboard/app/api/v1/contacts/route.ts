import { AppError, normalizePhone } from "@chanlytics/contracts";
import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { listPeople } from "@/server/people";
import { withVisits } from "@/server/calendar";
import { takeRate } from "@/server/rate-limit";

/**
 * GET /api/v1/contacts — everyone who has written to or phoned this workspace.
 *
 * One row per live person (never erased, never merged) with the facts the
 * People surface renders, computed in SQL by `people_list` under the caller's
 * own RLS. The state a person is in is NOT decided here: the view model
 * derives it from these facts, so the rule lives in one tested place.
 *
 * Pilot scale: one call, capped at 1000 rows in the function. Search and
 * paging arrive with volume.
 */
export const GET = withRoute(async (req, ctx) => {
  const { tenantId } = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  // Each person with their appointments from the owner's calendar, when one
  // is connected: Booked is a fact here, not a stage. Never fatal to the list.
  return withVisits(ctx, tenantId, await listPeople(ctx, tenantId));
});

/**
 * POST /api/v1/contacts — add a person by phone, before they ever write or call.
 *
 * From an appointment on the calendar, or anywhere an owner meets a number
 * first. Get-or-create through the `create_person` door (owner or
 * operator): an existing number returns that person, a name fills only an
 * empty one, and consent stays unknown — a booking is not a yes to offers
 * by WhatsApp. `{ phone, name?, source? }` in; `{ contact_id, existed }` out.
 */
export const POST = withRoute(async (req, ctx) => {
  const body = (await req.json().catch(() => null)) as { phone?: unknown; name?: unknown; source?: unknown } | null;
  const phone = normalizePhone(typeof body?.phone === "string" ? body.phone : null);
  if (!phone) throw new AppError("validation", "A phone number is needed to add a person.");
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  const source = typeof body?.source === "string" && /^[a-z_]{1,24}$/.test(body.source) ? body.source : "manual";
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "operator");
  takeRate(ctx.userId, "person_create");
  const { data, error } = await ctx.supabase.rpc("create_person", { p_tenant_id: member.tenantId, p_phone_e164: phone, p_display_name: name, p_source: source });
  if (error) throw new AppError("validation", error.message);
  const out = data as { contact_id: string; existed: boolean };
  return { contact_id: out.contact_id, existed: out.existed };
});
