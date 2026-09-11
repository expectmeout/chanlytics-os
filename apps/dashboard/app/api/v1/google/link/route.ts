import { write, workspace } from "@/server/route";
import { AppError } from "@chanlytics/contracts";
import { edgeGoogle } from "@/server/google";

/**
 * POST /api/v1/google/link — {place_id}: this is the business on Google.
 * The edge reads the listing before keeping it, so a wrong id is refused
 * here and never becomes a row that reads nothing. Owners only.
 *
 * DELETE /api/v1/google/link — the listing, its reviews and its days, gone.
 */
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

const SAID: Record<string, string> = {
  no_places_key: "Finding listings is not available here yet.",
  unreadable: "Google could not read that listing. Pick it again from a fresh search.",
};

export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "google_link",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => ({}))) as { place_id?: unknown };
    const placeId = typeof body.place_id === "string" ? body.place_id.trim() : "";
    if (!PLACE_ID.test(placeId)) throw new AppError("validation", "Pick a listing from the search first.", 400);
    const a = await edgeGoogle({ op: "link", tenant_id: member.tenantId, user_id: ctx.userId, place_id: placeId }, 25_000);
    const b = a.body ?? {};
    if (a.status !== 200 || b.ok !== true) {
      const reason = typeof b.error === "string" ? b.error : "failed";
      throw new AppError(reason === "no_places_key" ? "conflict" : "internal", SAID[reason] ?? `The listing could not be linked (${reason}).`, reason === "no_places_key" ? 409 : 502);
    }
    return { listing: b.listing ?? null, read: b.read ?? null };
  },
});

export const DELETE = write({
  scope: workspace,
  role: "owner",
  rate: "google_link",
  handle: async ({ member }) => {
    const a = await edgeGoogle({ op: "unlink", tenant_id: member.tenantId }, 15_000);
    const b = a.body ?? {};
    if (a.status !== 200 || b.ok !== true) throw new AppError("internal", typeof b.error === "string" ? SAID[b.error] ?? b.error : "The listing could not be removed. Try again.", 502);
    return { removed: b.removed === true };
  },
});
