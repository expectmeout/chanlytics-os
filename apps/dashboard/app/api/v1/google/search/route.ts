import { write, workspace } from "@/server/route";
import {
  AppError,
  businessNameOf,
  parseTenantConfigResult,
  placesQueryOf,
  type GoogleCandidateDto,
} from "@chanlytics/contracts";
import { getTenantConfig } from "@chanlytics/db";
import { edgeGoogle } from "@/server/connections/google";
import { tenantFacts } from "@/server/tenant";

/**
 * POST /api/v1/google/search — {query?}: what Google finds for the
 * business. Without words of its own the search uses the name and address
 * on record, which is the point: the owner already typed them once. A new
 * workspace has no receptionist yet, so its name is the one typed at
 * sign-up, the workspace's own: the first run's Find asks with it. Owners
 * only (linking is theirs); the edge asks Google.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "google_search",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => ({}))) as { query?: unknown };
    // A phone number goes whole and with its country, which Google needs to match a listing by its number.
    let query = typeof body.query === "string" ? placesQueryOf(body.query).slice(0, 200) : "";
    let fromFacts = false;
    if (!query) {
      const row = await getTenantConfig(ctx.supabase, member.tenantId);
      const parsed = row ? parseTenantConfigResult(row.config) : null;
      const cfg = parsed && parsed.ok ? parsed.config : null;
      // What the business goes by (contracts businessNameOf): the receptionist's name, else the one typed at sign-up,
      // read only when there is no receptionist's name to ask with.
      const own = cfg?.brain?.business_name ?? null;
      const typed = own?.trim() ? null : (await tenantFacts(ctx.supabase, member.tenantId)).name;
      const name = businessNameOf(own, typed) ?? "";
      const address = cfg?.brain?.profile?.address?.trim() ?? "";
      query = [name, address].filter(Boolean).join(", ");
      fromFacts = true;
    }
    if (query.length < 3)
      throw new AppError(
        "validation",
        "Give the business name and where it is, like “Northside Movers, Brooklyn”.",
        400,
      );
    const a = await edgeGoogle({ op: "search", query }, 15_000);
    const b = a.body ?? {};
    if (a.status === 503 && b.error === "no_places_key")
      throw new AppError("conflict", "Finding listings is not available here yet.", 409);
    if (a.status !== 200 || b.ok !== true) {
      // Google's words (a refused key, a disabled API) are for the log; the owner hears that the search did not happen and that we know.
      console.error(
        "google_search_failed",
        JSON.stringify({
          tenant: member.tenantId,
          status: a.status,
          error: typeof b.error === "string" ? b.error.slice(0, 300) : null,
        }),
      );
      throw new AppError(
        "internal",
        "Google could not be searched just now. Try again in a minute; if it keeps failing, Chanlytics has been told.",
        502,
      );
    }
    const candidates = (Array.isArray(b.candidates) ? b.candidates : []) as GoogleCandidateDto[];
    return {
      query,
      from_facts: fromFacts,
      candidates: candidates.map((c) => ({
        place_id: c.place_id,
        name: c.name,
        address: c.address ?? null,
        maps_uri: c.maps_uri ?? null,
        // An edge from before the kind of place sends none: either deploy order draws the candidate, without it.
        category: c.category ?? null,
      })),
    };
  },
});
